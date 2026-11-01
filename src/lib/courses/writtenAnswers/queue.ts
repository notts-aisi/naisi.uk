import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsShownTo } from "@/lib/firestore/courseEnrolments";
import { isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { fullNameOfUser } from "../programmeLead";
import { liveGroupsOf, reviewableIn, reviewerFactsOf, type OwnerFacts } from "./access";
import { instantOf, isWordCountedAnswer, readWrittenAnswer } from "./model";
import { workIsReadable } from "../weekWork/model";
import { loadRunWeekStates } from "../weekWork/readers";

/**
 * THE REVIEW QUEUE'S WRITTEN ANSWERS HALF (board wk-fac-group: "Written
 * answers · 2 to give feedback on", each person with when they sent it and
 * Give feedback; Home's line beside it): every written answer of the group's
 * people waiting for feedback, whatever its week, that the reader may give
 * feedback on by the one gate (`reviewableIn`), and whose readers may read
 * it (`workIsReadable`, privacy v15): its week submitted, or locked before it
 * was, or the answer sent before weeks were submitted. An answer in a week
 * still open, or reopened, waits for nobody yet.
 *
 * NULL FOR A RUN WITH NO WEEK WRITTEN AS BLOCKS: a run of the summer's
 * weeks keeps its own "To review" card for its exercises, and no written
 * answer can exist on it.
 *
 * The reflections half of the queue is the facilitator's week's (a later
 * piece): the card draws this half and leaves it room.
 *
 * Reads: the run's weeks (to know it has a week written as blocks), its
 * groups and the reader's standing (the gate's), its enrolments and its
 * answers, each by one equality on the run, sorted in memory, and the names.
 * No query needs a declared index.
 */

export type WrittenQueueRow = {
  uid: string;
  /** The whole name, as the board lists people. */
  name: string;
  weekNumber: number;
  /** ISO 8601: when it was first sent, or when its week locked before it was. */
  firstSentAt: string;
  /** Never sent: its week locked at the session before it was submitted, and `firstSentAt` is that lock. */
  locked: boolean;
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
): Promise<Map<string, WrittenQueueRow[]> | null> {
  if (!(await runHasBlockWeek(db, run.id))) return null;
  const [liveGroups, facts, enrolSnap, answerSnap] = await Promise.all([
    liveGroupsOf(db, run.id),
    reviewerFactsOf(db, actor, run.id),
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    db.collection("courseExerciseResponses").where("runId", "==", run.id).get(),
  ]);
  const live = new Set(liveGroups.map((candidate) => candidate.id));
  const enrolments = enrolSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  // Where each person's week stands, for whether their answer may be read.
  const states = await loadRunWeekStates(db, { run, liveGroups, enrolments, now: new Date() });
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

  const waiting: Array<{ uid: string; weekNumber: number; sentAt: Date; locked: boolean }> = [];
  for (const doc of answerSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    if (!groupOf.has(uid) || data.runId !== run.id) continue;
    // A reflection is never sent; summer's answers keep their own card.
    if (isReflectionResponse(data) || !isWordCountedAnswer(data)) continue;
    const record = readWrittenAnswer(data);
    const weekNumber = weekNumberOf(data);
    if (weekNumber < 1 || record.feedback || record.words === 0) continue;
    // Waiting only once its readers may read it.
    const standing = states.stateOf(uid, weekNumber);
    if (!workIsReadable(standing, record)) continue;
    const firstSentAt = instantOf(data.firstSentAt);
    const sentAt = firstSentAt ?? (standing.kind === "locked" ? standing.at : null);
    if (!sentAt) continue;
    waiting.push({ uid, weekNumber, sentAt, locked: firstSentAt === null });
  }
  waiting.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.uid.localeCompare(b.uid));

  const uids = [...new Set(waiting.map((row) => row.uid))];
  const names = new Map<string, string>();
  for (const snap of uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : []) {
    if (snap.exists) names.set(snap.id, fullNameOfUser(snap.data() ?? {}));
  }
  const out = new Map<string, WrittenQueueRow[]>(groups.map((group) => [group.id, []]));
  for (const row of waiting) {
    out.get(groupOf.get(row.uid) ?? "")?.push({
      uid: row.uid,
      name: names.get(row.uid) ?? "NAISI member",
      weekNumber: row.weekNumber,
      firstSentAt: row.sentAt.toISOString(),
      locked: row.locked,
    });
  }
  return out;
}

/** One group's written answers waiting for `actor`'s feedback, or null for a run with no week written as blocks. */
export async function loadWrittenQueue(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  group: CourseGroupDoc,
): Promise<WrittenQueueRow[] | null> {
  const queues = await loadWrittenQueues(db, actor, run, [group]);
  return queues ? (queues.get(group.id) ?? []) : null;
}
