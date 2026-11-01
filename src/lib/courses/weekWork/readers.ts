import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import {
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  COURSE_WEEK_WORK_COLLECTION,
  courseWeekWorkId,
  normalizeCourseWeekWork,
  type CourseWeekWorkDoc,
} from "@/lib/firestore/courseWeekWork";
import { NO_GROUP, weekLockOf, weekStateOf, type LockSource } from "./lock";
import type { WeekLock, WeekWorkState } from "./model";

/**
 * THE READS BEHIND WHERE A WEEK STANDS, on the server, each after its
 * caller's own gate: one person's week for the routes that write it, and
 * everybody's on a run for the pages that list people. `./model.ts` decides;
 * this file reads what it decides from.
 *
 * Every query is one equality on `runId`, filtered in memory, so nothing
 * needs a declared index.
 */

/**
 * WHOSE SESSIONS LOCK THIS PERSON'S WEEK (`./lock.ts`): their placement's
 * group when it is a live group and Publish has told them it (an admin's
 * view of a placement never counts: the lock is the person's own), told at
 * `allocatedEmailAt`, or when they took the seat themselves; otherwise each
 * live group they facilitate; otherwise none.
 */
export function lockSourceFor(
  run: CourseRunDoc,
  liveGroups: readonly CourseGroupDoc[],
  uid: string,
  enrolment: CourseEnrolmentDoc | null,
  sessionsOf: (group: CourseGroupDoc) => readonly ResolvedSession[] = (group) => resolveSessions(run, group),
): LockSource {
  const placed =
    enrolment !== null &&
    enrolment.uid === uid &&
    enrolment.role === "learner" &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    enrolment.groupId !== null &&
    placementIsTold(enrolment)
      ? (liveGroups.find((group) => group.id === enrolment.groupId) ?? null)
      : null;
  if (placed && enrolment) {
    const toldAt = enrolment.selfEnrolled ? (enrolment.createdAt ?? null) : (enrolment.allocatedEmailAt ?? null);
    return { sessionLists: [sessionsOf(placed)], toldAt };
  }
  const facilitated = liveGroups.filter((group) => group.facilitatorUids.includes(uid));
  if (facilitated.length > 0) return { sessionLists: facilitated.map((group) => sessionsOf(group)), toldAt: null };
  return NO_GROUP;
}

/** One person's stored week, by its address; null before they first submit it. */
export async function readWeekWork(db: Firestore, runId: string, uid: string, weekId: string): Promise<CourseWeekWorkDoc | null> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(runId, uid, weekId)).get();
  return snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
}

/** Everybody's stored weeks on a run, by uid and then week id. One equality on the run. */
export async function readRunWeekWork(db: Firestore, runId: string): Promise<Map<string, Map<string, CourseWeekWorkDoc>>> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).where("runId", "==", runId).get();
  const out = new Map<string, Map<string, CourseWeekWorkDoc>>();
  for (const doc of snap.docs) {
    const record = normalizeCourseWeekWork(doc.id, doc.data() ?? {});
    if (record.runId !== runId || !record.uid || !record.weekId) continue;
    const own = out.get(record.uid) ?? new Map<string, CourseWeekWorkDoc>();
    own.set(record.weekId, record);
    out.set(record.uid, own);
  }
  return out;
}

/** Where every week of every person on a run stands, and when each locks. */
export type RunWeekStates = {
  stateOf: (uid: string, weekNumber: number) => WeekWorkState;
  lockOf: (uid: string, weekNumber: number) => WeekLock;
  recordOf: (uid: string, weekNumber: number) => CourseWeekWorkDoc | null;
};

function weekIdOf(weekNumber: number): string {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

/**
 * EVERYBODY'S WEEKS ON A RUN, for a page that lists people: the run's stored
 * weeks (one equality on the run), and its seats unless the caller has read
 * them already. Each person's sessions are resolved once per group.
 */
export async function loadRunWeekStates(
  db: Firestore,
  input: { run: CourseRunDoc; liveGroups: readonly CourseGroupDoc[]; enrolments?: readonly CourseEnrolmentDoc[] | null; now: Date },
): Promise<RunWeekStates> {
  const { run, liveGroups, now } = input;
  const [records, enrolments] = await Promise.all([
    readRunWeekWork(db, run.id),
    input.enrolments
      ? Promise.resolve(input.enrolments)
      : db
          .collection("courseEnrolments")
          .where("runId", "==", run.id)
          .get()
          .then((snap) => snap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))),
  ]);
  const seatOf = new Map<string, CourseEnrolmentDoc>();
  for (const seat of enrolments) if (seat.runId === run.id && seat.uid) seatOf.set(seat.uid, seat);
  const sessionsByGroup = new Map<string, readonly ResolvedSession[]>();
  const sessionsOf = (group: CourseGroupDoc) => {
    let sessions = sessionsByGroup.get(group.id);
    if (!sessions) {
      sessions = resolveSessions(run, group);
      sessionsByGroup.set(group.id, sessions);
    }
    return sessions;
  };
  const sources = new Map<string, LockSource>();
  const sourceOf = (uid: string) => {
    let source = sources.get(uid);
    if (!source) {
      source = lockSourceFor(run, liveGroups, uid, seatOf.get(uid) ?? null, sessionsOf);
      sources.set(uid, source);
    }
    return source;
  };
  const recordOf = (uid: string, weekNumber: number) => records.get(uid)?.get(weekIdOf(weekNumber)) ?? null;
  return {
    stateOf: (uid, weekNumber) => weekStateOf(sourceOf(uid), weekNumber, recordOf(uid, weekNumber), now),
    lockOf: (uid, weekNumber) => weekLockOf(sourceOf(uid), weekNumber),
    recordOf,
  };
}
