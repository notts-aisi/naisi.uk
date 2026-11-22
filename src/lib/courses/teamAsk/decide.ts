import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { REQUEST_REFUSAL } from "@/lib/courses/registerCorrection/words";
import { sendTeamReplyEmail, type TeamReplyEmailOutcome } from "@/lib/email/teamAskEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { TEAM_MESSAGE_LIMITS, normalizeTeamAsk, withTeamAskEvent, type TeamAskDoc } from "@/lib/firestore/courseTeamAsks";
import { EXCUSED_REFUSAL } from "../excused/words";
import { parseReply } from "./model";
import { REPLY_REFUSAL, replyEmailWords } from "./words";

/**
 * TAKING AND REPLYING TO A MESSAGE TO THE TEAM: the routes' work, so each
 * route is its gate's answer and nothing more.
 *
 *  - TAKE IT: ADMINS ONLY, never the sender. Says who is dealing with it; any
 *    admin may take it over. Emails nobody.
 *  - REPLY: ADMINS ONLY, never the sender. Stores the reply on the message,
 *    closes it (`replied`) and emails the sender the reply
 *    (`sendTeamReplyEmail`), after the commit. One reply answers a message:
 *    a second is refused. Replies are kept as a list, so a later round can
 *    allow several and a close of its own by changing `closesOnReply` and
 *    the one refusal below.
 *
 * AN ACCESS ASK is taken and replied to the same way, through its own
 * normaliser (`normalizeTeamAsk` reads either kind), which holds neither what
 * was written nor the tick: nothing here reads them. Its reply email is any
 * message's, word for word, so it never says "access needs".
 *
 * WHO IS TOLD WHAT A MESSAGE IS: anybody who is not an admin is refused
 * before anything is read, with one 403 whatever the id; an admin is told a
 * missing message is missing, and is refused their own.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function caught(err: unknown): { ok: false; status: number; error: string } {
  if (err instanceof Refused) return fail(err.status, err.message);
  throw err;
}

/** The first reply answers a message and closes it. */
const closesOnReply = true;

/** An admin, for a message somebody else sent; anybody else learns nothing of it. */
async function forAdmin(db: Firestore, actor: SessionUser, requestId: string, own: string): Promise<Outcome<TeamAskDoc>> {
  if (actor.role !== "admin") return fail(403, "Forbidden");
  if (!isAddressableId(requestId) || requestId.length > 128) return fail(404, EXCUSED_REFUSAL.notFound);
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const message = snap.exists ? normalizeTeamAsk(snap.id, snap.data() ?? {}) : null;
  if (!message) return fail(404, EXCUSED_REFUSAL.notFound);
  if (message.askedByUid === actor.uid) return fail(403, own);
  return { ok: true, value: message };
}

async function freshIn(tx: Transaction, db: Firestore, id: string): Promise<TeamAskDoc> {
  const snap = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).doc(id));
  const message = snap.exists ? normalizeTeamAsk(snap.id, snap.data() ?? {}) : null;
  if (!message) throw new Refused(409, EXCUSED_REFUSAL.notFound);
  return message;
}

export async function takeTeamMessage(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ handlingUid: string }>> {
  const found = await forAdmin(db, actor, requestId, REPLY_REFUSAL.ownTake);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await freshIn(tx, db, found.value.id);
      if (fresh.status !== "waiting") throw new Refused(409, REPLY_REFUSAL.answered);
      if (fresh.handlingUid === actor.uid) throw new Refused(409, REQUEST_REFUSAL.alreadyYours);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        handlingUid: actor.uid,
        handlingAt: now,
        history: withTeamAskEvent(fresh, "taken", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  return { ok: true, value: { handlingUid: actor.uid } };
}

export type TeamReplyAnswer = { status: "replied" | "waiting"; emailed: { person: TeamReplyEmailOutcome | "no-address" } };

/** The person's first name and address, from their account: "" for either they lack. */
async function personOf(db: Firestore, uid: string): Promise<{ firstName: string; email: string }> {
  if (!isAddressableId(uid)) return { firstName: "", email: "" };
  const snap = await db.collection("users").doc(uid).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  return { firstName: firstNameOfUser(data), email: typeof data.email === "string" ? data.email.trim() : "" };
}

export async function replyToTeamMessage(db: Firestore, actor: SessionUser, requestId: string, body: unknown, now: Date): Promise<Outcome<TeamReplyAnswer>> {
  const found = await forAdmin(db, actor, requestId, REPLY_REFUSAL.own);
  if (!found.ok) return found;
  const parsed = parseReply(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await freshIn(tx, db, found.value.id);
      if (fresh.status !== "waiting") throw new Refused(409, REPLY_REFUSAL.answered);
      if (fresh.replies.length >= TEAM_MESSAGE_LIMITS.replies) throw new Refused(409, EXCUSED_REFUSAL.tooManyReplies);
      const replies = [...fresh.replies, { text: reply, byUid: actor.uid, at: now }].map((each) => ({ text: each.text, byUid: each.byUid, at: each.at }));
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.replies": replies,
        reply,
        ...(closesOnReply ? { status: "replied", decidedByUid: actor.uid, decidedAt: now } : {}),
        history: withTeamAskEvent(fresh, "replied", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  const [person, replier] = await Promise.all([personOf(db, found.value.subjectUid), personOf(db, actor.uid)]);
  let emailed: TeamReplyEmailOutcome | "no-address" = "no-address";
  if (person.email) {
    emailed = await sendTeamReplyEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      requestId: found.value.id,
      // The same words for an access ask as for any message: nothing in the email says access needs.
      words: replyEmailWords({ replierFirstName: replier.firstName, reply, askedAt: found.value.askedAt, now }),
    });
  }
  return { ok: true, value: { status: closesOnReply ? "replied" : "waiting", emailed: { person: emailed } } };
}
