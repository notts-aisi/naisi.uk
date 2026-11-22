import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeTeamMessage, type TeamMessageDoc, type TeamMessageEvent, type TeamTopic } from "@/lib/firestore/courseTeamAsks";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { placesThisTermOf } from "./places";
import { excerptOf } from "./words";

/**
 * A MESSAGE TO THE TEAM, AS ADMINS READ IT: its row on the Requests page and
 * its own page. ADMINS ONLY, everywhere here: anybody else is sent no row and
 * answered `none`, as for a page that is not there, so a programme's lead the
 * Requests page admits sees neither.
 *
 * NAMES ONLY, by the names rule for the reader: never an address. The row
 * carries the start of what they wrote; the page carries all of it, shown as
 * plain text. Neither is read by Home's count beyond the row's kind and
 * state, or by any email.
 */

export type Loaded<T> = { status: "ok"; view: T } | { status: "none" };

type Named = { uid: string; name: string };

/** A message as a row of the Requests page (`loadRequestsPage`'s `RequestRow`). */
export type TeamMessageRow = {
  id: string;
  kind: "team-message";
  status: "waiting" | "replied";
  state: "waiting" | "handling" | "replied";
  askedBy: Named;
  askedAt: string | null;
  subject: Named;
  programme: { roundId: null; programmeId: null; name: string };
  runId: string;
  group: { id: string; name: string };
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  from: string;
  to: string;
  handling: (Named & { at: string | null }) | null;
  mine: boolean;
  decidedBy: Named | null;
  decidedAt: string | null;
  /** The start of what they wrote, one line. */
  about: string;
  topic: TeamTopic;
};

async function namesFor(db: Firestore, viewer: SessionUser, uids: Iterable<string>): Promise<{ named: (uid: string) => Named; firstNames: Map<string, string> }> {
  const wanted = [...new Set(uids)].filter(isAddressableId);
  const snaps = wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : [];
  const names = new Map<string, string>();
  const firstNames = new Map<string, string>();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    names.set(snap.id, nameForViewer(viewer, accountNamesOf(data), "NAISI member"));
    firstNames.set(snap.id, firstNameOfUser(data));
  }
  return { named: (uid: string) => ({ uid, name: names.get(uid) ?? "NAISI member" }), firstNames };
}

/**
 * The rows of these messages, for an admin: those waiting, and those replied
 * to since `since`.
 */
export async function teamMessageRows(db: Firestore, messages: readonly TeamMessageDoc[], viewer: SessionUser, since: Date): Promise<TeamMessageRow[]> {
  if (viewer.role !== "admin" || messages.length === 0) return [];
  const shown = messages.filter(
    (each) => each.status === "waiting" || (each.status === "replied" && each.decidedAt !== null && each.decidedAt.getTime() >= since.getTime()),
  );
  const uids = new Set<string>();
  for (const each of shown) for (const uid of [each.subjectUid, each.handlingUid ?? "", each.decidedByUid ?? ""]) if (uid) uids.add(uid);
  const { named } = await namesFor(db, viewer, uids);
  return shown.map((message) => ({
    id: message.id,
    kind: "team-message" as const,
    status: message.status,
    state: message.status === "replied" ? "replied" : message.handlingUid ? "handling" : "waiting",
    askedBy: named(message.askedByUid),
    askedAt: message.askedAt ? message.askedAt.toISOString() : null,
    subject: named(message.subjectUid),
    programme: { roundId: null, programmeId: null, name: "" },
    runId: "",
    group: { id: "", name: "" },
    weekNumber: 0,
    occurrence: 1,
    dateKey: "",
    from: "",
    to: "",
    handling: message.handlingUid ? { ...named(message.handlingUid), at: message.handlingAt ? message.handlingAt.toISOString() : null } : null,
    mine: message.handlingUid === viewer.uid,
    decidedBy: message.decidedByUid ? named(message.decidedByUid) : null,
    decidedAt: message.decidedAt ? message.decidedAt.toISOString() : null,
    about: excerptOf(message.words),
    topic: message.topic,
  }));
}

// ---------------------------------------------------------------------------
// One message's page
// ---------------------------------------------------------------------------

export type TeamMessagePageView = {
  id: string;
  kind: "team-message";
  topic: TeamTopic;
  status: "waiting" | "replied";
  askedAt: string | null;
  subject: Named;
  /** Their first name, for "Reply to Marcus". */
  subjectFirstName: string;
  /** Each place they hold this term: "AGI Strategy · Group I with Lucy Turner", as parts. */
  places: { programmeName: string; groupName: string; facilitatorNames: string[] }[];
  /** What they wrote, line breaks kept. */
  words: string;
  replies: { text: string; by: Named; at: string }[];
  decidedBy: Named | null;
  decidedAt: string | null;
  handling: (Named & { at: string | null }) | null;
  mine: boolean;
  history: { what: TeamMessageEvent; by: Named; at: string }[];
  /** It waits, and the reader did not send it. */
  canReply: boolean;
  canTake: boolean;
  yours: boolean;
};

export async function loadTeamMessagePage(db: Firestore, actor: SessionUser, requestId: string): Promise<Loaded<TeamMessagePageView>> {
  if (actor.role !== "admin") return { status: "none" };
  if (!isAddressableId(requestId) || requestId.length > 128) return { status: "none" };
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const message = snap.exists ? normalizeTeamMessage(snap.id, snap.data() ?? {}) : null;
  if (!message) return { status: "none" };
  const uids = new Set<string>([message.subjectUid]);
  for (const uid of [message.handlingUid, message.decidedByUid]) if (uid) uids.add(uid);
  for (const reply of message.replies) uids.add(reply.byUid);
  for (const entry of message.history) uids.add(entry.byUid);
  const [{ named, firstNames }, places] = await Promise.all([
    namesFor(db, actor, uids),
    placesThisTermOf(db, message.subjectUid, { isAdmin: true, role: actor.role }, { withFacilitators: true }),
  ]);
  const waiting = message.status === "waiting";
  const yours = message.askedByUid === actor.uid;
  return {
    status: "ok",
    view: {
      id: message.id,
      kind: "team-message",
      topic: message.topic,
      status: message.status,
      askedAt: message.askedAt ? message.askedAt.toISOString() : null,
      subject: named(message.subjectUid),
      subjectFirstName: firstNames.get(message.subjectUid) ?? "",
      places: places.map((place) => ({ programmeName: place.programmeName, groupName: place.groupName, facilitatorNames: place.facilitatorNames })),
      words: message.words,
      replies: message.replies.map((reply) => ({ text: reply.text, by: named(reply.byUid), at: reply.at.toISOString() })),
      decidedBy: message.decidedByUid ? named(message.decidedByUid) : null,
      decidedAt: message.decidedAt ? message.decidedAt.toISOString() : null,
      handling: message.handlingUid ? { ...named(message.handlingUid), at: message.handlingAt ? message.handlingAt.toISOString() : null } : null,
      mine: message.handlingUid === actor.uid,
      history: message.history.map((entry) => ({ what: entry.what, by: named(entry.byUid), at: entry.at.toISOString() })),
      canReply: waiting && !yours,
      canTake: waiting && !yours && message.handlingUid !== actor.uid,
      yours,
    },
  };
}
