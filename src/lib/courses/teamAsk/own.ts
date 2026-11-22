import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import {
  ACCESS_NEEDS_KIND,
  TEAM_MESSAGE_KIND,
  normalizeAccessNeeds,
  normalizeTeamMessage,
  type AccessNeedsDoc,
  type TeamMessageDoc,
} from "@/lib/firestore/courseTeamAsks";
import { ACCESS_ROW_TITLE, OWN_CHIP, ownRepliedWords, ownSentWords, ownTitleWords } from "./words";

/**
 * "YOUR REQUESTS" ON ASK THE TEAM: the caller's own messages to the team,
 * newest first, each with its title, its line ("Sent Mon 9 Nov", or who
 * replied and when, with the reply in quotes) and its chip.
 *
 * ONLY THEIR OWN MESSAGES, by two equalities (`askedByUid`, the session's uid,
 * and `kind`), merged from the automatic single-field indexes, so no declared
 * index; ordered newest first in code. Only messages to the team: requests to be excused and to go to another session
 * stay on the programme page, where they are asked and answered. The person
 * is never told who is handling one; the replier is named by first name.
 *
 * Kept while the account exists, as the privacy policy says of requests and
 * messages.
 *
 * THEIR ACCESS ASKS are listed too, by a second read of the same two
 * equalities with their own kind, each titled "Access needs" alone: what
 * they wrote is never repeated back in a list, and this file cannot read it
 * (`normalizeAccessNeeds` holds no words). There is no page of one ask for
 * the member, so the site never shows those words back to them at all.
 */

export type OwnMessageRow = { id: string; title: string; line: string; chip: string; replied: boolean };

/**
 * Most of their own messages read. Five a London day is the most anybody can
 * send, so this is at least a hundred days of messages at the limit, and a
 * term's worth many times over for anybody else. Read by kind, so requests of
 * every other kind never take a place in it.
 */
const MAX_OWN = 500;

export async function ownTeamMessages(db: Firestore, uid: string): Promise<OwnMessageRow[]> {
  if (!isAddressableId(uid)) return [];
  const [snap, accessSnap] = await Promise.all([
    db.collection(COURSE_REQUESTS_COLLECTION).where("askedByUid", "==", uid).where("kind", "==", TEAM_MESSAGE_KIND).limit(MAX_OWN).get(),
    db.collection(COURSE_REQUESTS_COLLECTION).where("askedByUid", "==", uid).where("kind", "==", ACCESS_NEEDS_KIND).limit(MAX_OWN).get(),
  ]);
  const asks: (TeamMessageDoc | AccessNeedsDoc)[] = [
    ...snap.docs.map((doc) => normalizeTeamMessage(doc.id, doc.data() ?? {})),
    ...accessSnap.docs.map((doc) => normalizeAccessNeeds(doc.id, doc.data() ?? {})),
  ].filter((each): each is TeamMessageDoc | AccessNeedsDoc => each !== null && each.askedByUid === uid);
  const messages = asks
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  const repliers = [...new Set(messages.map((each) => each.decidedByUid ?? "").filter(isAddressableId))];
  const snaps = repliers.length ? await db.getAll(...repliers.map((id) => db.collection("users").doc(id))) : [];
  const firstNames = new Map(snaps.filter((each) => each.exists).map((each) => [each.id, firstNameOfUser(each.data() ?? {})]));
  return messages.map((message) => {
    const replied = message.status === "replied" && message.reply !== "";
    return {
      id: message.id,
      title: message.kind === ACCESS_NEEDS_KIND ? ACCESS_ROW_TITLE : ownTitleWords(message.topic, message.words),
      line: replied ? ownRepliedWords(firstNames.get(message.decidedByUid ?? "") ?? "", message.decidedAt, message.reply) : ownSentWords(message.askedAt),
      chip: replied ? OWN_CHIP.replied : OWN_CHIP.waiting,
      replied,
    };
  });
}
