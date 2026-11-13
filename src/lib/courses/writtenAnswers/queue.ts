import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsShownTo } from "@/lib/firestore/courseEnrolments";
import { isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { liveGroupsOf, reviewableIn, reviewerFactsOf, type OwnerFacts } from "./access";
import { answerPiece, instantOf, isWordCountedAnswer, readWrittenAnswer } from "./model";
import { lateBy } from "../weekWork/model";
import { loadRunWeekStates } from "../weekWork/readers";
import { readableAnswer } from "../weekWork/versions";
import { changedSinceFeedback, feedbackVersionsOf } from "../feedback/model";
import { readRunFeedback } from "../feedback/readers";

/**
 * FEEDBACK TO WRITE (the facilitator's group page, at 1440 and on a phone: "3
 * week 2 answers", each person with when they submitted it and Write
 * feedback; Home's line beside it; the lead's line per group): the written
 * answers of the group's people that the reader may give feedback on by the
 * one gate (`reviewableIn`), whose readers may read them (`readableAnswer`,
 * privacy v17: sent, as last sent, or anything saved once the session the
 * person is due at has started), whose words as read hold some, that have no
 * feedback from anyone yet (a piece on the answer, or feedback given before
 * pieces existed), and whose week's session started in the last seven days.
 * And (Fri 13 Nov 2026) each such answer that HAS feedback and was changed
 * after the newest of it (`changedSinceFeedback`, the rule the Coursework
 * tab's flag and its list ask too), for seven days from that change, marked
 * "Changed since feedback".
 *
 * FEEDBACK IS OPTIONAL, so a count of every answer with none would never
 * reach zero: the week's session (the group's, `sessionOf`) bounds it. An
 * answer submitted before its session waits until the session has started;
 * one whose session started more than a week ago, or that has none to date,
 * waits for nobody here, and the review page still lists it. An answer
 * changed since feedback is bounded the same way, by the change: it waits for
 * seven days from when the words its readers read were saved, and the
 * Coursework tab's list still holds it after.
 *
 * NULL FOR A RUN WITH NO WEEK WRITTEN AS BLOCKS: a run of the summer's
 * weeks keeps its own "To review" card for its exercises, and no written
 * answer can exist on it.
 *
 * The reflections half of the queue is the facilitator's week's (a later
 * piece): the card draws this half and leaves it room.
 *
 * Reads: the run's weeks (to know it has a week written as blocks), its
 * groups and the reader's standing (the gate's), its enrolments, its answers
 * and its feedback, each by one equality on the run, sorted in memory, and
 * the names. No query needs a declared index.
 */

/** How long after the week's session an answer with no feedback stays in Feedback to write. */
export const TO_WRITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WrittenQueueRow = {
  uid: string;
  /**
   * The name by the names rule for the reader (`nameForViewer`): the
   * committee and admins see "Priya Shah (Pri)", a facilitator who is not on
   * it the name people go by.
   */
  name: string;
  weekNumber: number;
  /** ISO 8601: when it was first sent, or, never sent, when the session it was due at started. */
  firstSentAt: string;
  /** Never sent: read since the session it was due at started, and `firstSentAt` is that start. */
  locked: boolean;
  /** How long after the session it was due at it was first sent (ms); null when not after it, or never sent. */
  lateMs: number | null;
  /** It has feedback, and was changed after the newest of it: "Changed since feedback". */
  changed: boolean;
  /** ISO 8601: changed since feedback, when the words its readers read were saved; null otherwise. */
  changedAt: string | null;
};

/** The weeks of a run, checked for one written as blocks. */
async function runHasBlockWeek(db: Firestore, runId: string): Promise<boolean> {
  const snap = await db.collection("courseRuns").doc(runId).collection("weeks").get();
  return snap.docs.some((doc) => Array.isArray((doc.data() ?? {}).blocks));
}

/** The week a stored answer belongs to: its stored number, or the one its week id names. */
function weekNumberOf(data: Record<string, unknown>): number {
  if (typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber)) return data.weekNumber;
  const match = typeof data.weekId === "string" ? /^w(\d{1,3})$/.exec(data.weekId) : null;
  return match ? Number(match[1]) : 0;
}

/**
 * The written answers in each of `groups` waiting for `actor`'s feedback,
 * oldest sent first, by group id; or null for a run with no week written as
 * blocks. One set of reads for every group asked about.
 */
export async function loadWrittenQueues(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  now: Date = new Date(),
): Promise<Map<string, WrittenQueueRow[]> | null> {
  return (await readWrittenQueues(db, actor, run, groups, now))?.queues ?? null;
}

/**
 * The queues, and with them whose answers each group's list may hold: the
 * people the one gate lets `actor` review in each group (`reviewableIn`), each
 * under the first group that holds them. The group page asks it so that the
 * names it leads to the reading view of somebody's week are exactly the
 * people that view's own door admits, with no second read of the run.
 */
async function readWrittenQueues(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  now: Date,
): Promise<{ queues: Map<string, WrittenQueueRow[]>; reviewable: Map<string, string> } | null> {
  if (!(await runHasBlockWeek(db, run.id))) return null;
  const [liveGroups, facts, enrolSnap, answerSnap, feedback] = await Promise.all([
    liveGroupsOf(db, run.id),
    reviewerFactsOf(db, actor, run.id),
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    db.collection("courseExerciseResponses").where("runId", "==", run.id).get(),
    readRunFeedback(db, run.id),
  ]);
  // Every written answer somebody has left a piece of feedback on, with the pieces on it.
  const onAnswer = new Map<string, typeof feedback>();
  for (const piece of feedback) {
    if (piece.on.kind !== "writtenAnswer") continue;
    const key = `${piece.uid} ${piece.weekId} ${piece.on.itemId}`;
    onAnswer.set(key, [...(onAnswer.get(key) ?? []), piece]);
  }
  const live = new Set(liveGroups.map((candidate) => candidate.id));
  const enrolments = enrolSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  // Where each person's week stands, for whether their answer may be read.
  const states = await loadRunWeekStates(db, { run, liveGroups, enrolments, now });
  const fellows: OwnerFacts[] = enrolments
    .filter(
      (enrolment) =>
        enrolment.role === "learner" &&
        (enrolment.status === "active" || enrolment.status === "completed") &&
        enrolment.groupId !== null &&
        live.has(enrolment.groupId) &&
        placementIsShownTo(enrolment, { isAdmin: facts.isAdmin }),
    )
    .map((enrolment) => ({ uid: enrolment.uid, placedGroupId: enrolment.groupId }));

  // Whose answers count where: each person under the group whose list the gate puts them in.
  const groupOf = new Map<string, string>();
  for (const group of groups) {
    for (const owner of reviewableIn(actor, facts, group, fellows, liveGroups)) {
      if (!groupOf.has(owner.uid)) groupOf.set(owner.uid, group.id);
    }
  }

  const waiting: Array<{ uid: string; weekNumber: number; sentAt: Date; locked: boolean; lateMs: number | null; changedAt: Date | null }> = [];
  for (const doc of answerSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    if (!groupOf.has(uid) || data.runId !== run.id) continue;
    // A reflection is never sent; summer's answers keep their own card.
    if (isReflectionResponse(data) || !isWordCountedAnswer(data)) continue;
    const record = readWrittenAnswer(data);
    const weekNumber = weekNumberOf(data);
    if (weekNumber < 1) continue;
    const answerId = String(data.exerciseId ?? "");
    const pieces = onAnswer.get(`${uid} ${String(data.weekId ?? "")} ${answerId}`) ?? [];
    // Waiting only once its readers may read it, with words in what they read.
    const due = states.dueOf(uid, weekNumber);
    const piece = answerPiece(record);
    const read = readableAnswer(piece, due.at, now);
    if (!read || read.words === 0) continue;
    const firstSentAt = instantOf(data.firstSentAt);
    const sentAt = firstSentAt ?? due.at;
    if (!sentAt) continue;
    const lateMs = lateBy(firstSentAt, due);
    if (record.feedback || pieces.length > 0) {
      // Feedback given: waiting again only once changed after the newest of it, for seven days from that change.
      const readSavedAt = read.savedAt ? read.savedAt.toISOString() : null;
      if (!changedSinceFeedback(feedbackVersionsOf(answerId, pieces, record.feedback, piece), readSavedAt)) continue;
      const changedAt = read.savedAt;
      if (!changedAt || changedAt.getTime() > now.getTime() || now.getTime() - changedAt.getTime() > TO_WRITE_WINDOW_MS) continue;
      waiting.push({ uid, weekNumber, sentAt, locked: firstSentAt === null, lateMs, changedAt });
      continue;
    }
    // No feedback yet: from its week's session, for a week.
    const session = states.sessionOf(uid, weekNumber);
    if (!session || session.getTime() > now.getTime() || now.getTime() - session.getTime() > TO_WRITE_WINDOW_MS) continue;
    waiting.push({ uid, weekNumber, sentAt, locked: firstSentAt === null, lateMs, changedAt: null });
  }
  // Oldest first: by when it was first sent, or, changed since feedback, by when it was changed.
  const orderOf = (row: (typeof waiting)[number]) => (row.changedAt ?? row.sentAt).getTime();
  waiting.sort((a, b) => orderOf(a) - orderOf(b) || a.uid.localeCompare(b.uid));

  const uids = [...new Set(waiting.map((row) => row.uid))];
  const names = new Map<string, string>();
  for (const snap of uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : []) {
    if (snap.exists) names.set(snap.id, nameForViewer(actor, accountNamesOf(snap.data() ?? {}), "NAISI member"));
  }
  const out = new Map<string, WrittenQueueRow[]>(groups.map((group) => [group.id, []]));
  for (const row of waiting) {
    out.get(groupOf.get(row.uid) ?? "")?.push({
      uid: row.uid,
      name: names.get(row.uid) ?? "NAISI member",
      weekNumber: row.weekNumber,
      firstSentAt: row.sentAt.toISOString(),
      locked: row.locked,
      lateMs: row.lateMs,
      changed: row.changedAt !== null,
      changedAt: row.changedAt ? row.changedAt.toISOString() : null,
    });
  }
  return { queues: out, reviewable: groupOf };
}

/** One group's written answers waiting for `actor`'s feedback, or null for a run with no week written as blocks. */
export async function loadWrittenQueue(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  now: Date = new Date(),
): Promise<WrittenQueueRow[] | null> {
  const queues = await loadWrittenQueues(db, actor, run, [group], now);
  return queues ? (queues.get(group.id) ?? []) : null;
}

/**
 * One group's queue, and whose weeks `actor` may open in the reading view of
 * that group (`reviewableIn`, the gate the view's own door asks), from the one
 * set of reads; null for a run with no week written as blocks.
 */
export async function loadWrittenQueueAndReadable(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  now: Date = new Date(),
): Promise<{ rows: WrittenQueueRow[]; readable: Set<string> } | null> {
  const read = await readWrittenQueues(db, actor, run, [group], now);
  if (!read) return null;
  return {
    rows: read.queues.get(group.id) ?? [],
    readable: new Set([...read.reviewable].filter(([, groupId]) => groupId === group.id).map(([uid]) => uid)),
  };
}
