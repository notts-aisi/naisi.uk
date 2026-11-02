import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { weekOneDoorFor } from "@/lib/courses/weekOne/door";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  COURSE_WEEK_WORK_COLLECTION,
  courseWeekWorkId,
  normalizeCourseWeekWork,
  type CourseWeekWorkDoc,
} from "@/lib/firestore/courseWeekWork";
import {
  COURSE_WORK_LOG_COLLECTION,
  startsWritingSpell,
  workLogEntry,
  type WorkLogItemKind,
  type WorkLogKind,
} from "@/lib/firestore/courseWorkLog";
import { NO_GROUP, weekStateOf, type LockSource } from "./lock";
import { weekTakesWork, type WeekWorkState } from "./model";
import { lockSourceFor } from "./readers";

/**
 * A PERSON'S OWN WEEK, AS THE ROUTES THAT WRITE IT ASK ABOUT IT: whose
 * sessions lock it, where it stands inside the write's own transaction, and
 * the row each write adds to the work log. Every route that writes somebody's
 * week (a tick, a reflection, a fill-in box, the written answer, a pack or a
 * talk's ready mark, Submit and Reopen) asks here, so a week locked or
 * submitted refuses them all alike and every one of them is logged alike.
 */

/** Thrown out of a transaction when the week no longer takes work: the route answers 409. */
export class WeekShutError extends Error {}

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

/**
 * SOMEBODY TAKING PART IN THEIR OWN WEEK, as the routes that write it admit
 * them (the reflection boxes' route's rule, kept the same): an active learner
 * seat on the run, told its group by Publish, on an account that stands; a
 * facilitator of a live group of the run, as themselves; or, in week 1 alone,
 * somebody holding a place whom Publish has not told yet, once week 1's door
 * is open to them. Null for anybody else. `ownGroup` is the group whose copy
 * of the week they read: their placement's, or the one group they facilitate.
 */
export type OwnSeat = {
  run: CourseRunDoc | null;
  liveGroups: CourseGroupDoc[];
  /** Their learner seat, when they take part through one. */
  learner: CourseEnrolmentDoc | null;
  beforeGroups: boolean;
  ownGroup: CourseGroupDoc | null;
  source: LockSource;
};

export async function ownSeatOn(db: Firestore, actor: SessionUser, runId: string, weekNumber: number): Promise<OwnSeat | null> {
  const [enrolSnap, groupSnap, run] = await Promise.all([
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
    readRunForLock(db, runId),
  ]);
  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const takesPart =
    enrolment !== null &&
    enrolment.status === "active" &&
    enrolment.role === "learner" &&
    // The seat is an authority written for an approved account, so that account's standing is asked again.
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid) &&
    // A placement Publish has not told its owner about opens nothing yet.
    placementIsShownTo(enrolment, { isAdmin: actor.role === "admin" });
  // Archived groups staff nobody, as everywhere else.
  const liveGroups = groupSnap.docs.map((d) => normalizeCourseGroup(d.id, d.data() ?? {})).filter((g) => !g.archived);
  const facilitates = liveGroups.filter((g) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids));
  const beforeGroups = !takesPart && facilitates.length === 0 && weekNumber === 1 && (await weekOneDoorFor(db, actor, runId)).open;
  if (!takesPart && facilitates.length === 0 && !beforeGroups) return null;
  const learner = takesPart ? enrolment : null;
  const ownGroup =
    (learner?.groupId ? (liveGroups.find((g) => g.id === learner.groupId) ?? null) : null) ??
    (facilitates.length === 1 ? facilitates[0] : null);
  return {
    run,
    liveGroups,
    learner,
    beforeGroups,
    ownGroup: beforeGroups ? null : ownGroup,
    source: ownLockSource(run, liveGroups, actor.uid, learner),
  };
}

/**
 * The run, read for the lock: null when it is gone or being destroyed. One
 * addressed read.
 */
export async function readRunForLock(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/**
 * Whose sessions lock the caller's own week: their told placement's group,
 * else the groups they facilitate (`lockSourceFor`). Somebody through week
 * 1's door before groups go out has none, and nor does a run that is gone.
 */
export function ownLockSource(
  run: CourseRunDoc | null,
  liveGroups: readonly CourseGroupDoc[],
  uid: string,
  enrolment: CourseEnrolmentDoc | null,
): LockSource {
  return run ? lockSourceFor(run, liveGroups, uid, enrolment) : NO_GROUP;
}

/** The address of a person's week record. */
export function weekWorkRef(db: Firestore, runId: string, uid: string, weekId: string) {
  return db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(runId, uid, weekId));
}

/**
 * Where the caller's week stands, read INSIDE the write's transaction, so a
 * Submit and a save landing together are put in one order. Reads only: call
 * it with the transaction's other reads, before any write.
 */
export async function weekStateIn(
  tx: Transaction,
  db: Firestore,
  input: { runId: string; uid: string; weekId: string; weekNumber: number; source: LockSource; now: Date },
): Promise<{ state: WeekWorkState; record: CourseWeekWorkDoc | null }> {
  const snap = await tx.get(weekWorkRef(db, input.runId, input.uid, input.weekId));
  const record = snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
  return { state: weekStateOf(input.source, input.weekNumber, record, input.now), record };
}

/** Refuses a write to a week that no longer takes work (submitted, or locked). */
export function assertWeekTakesWork(state: WeekWorkState): void {
  if (!weekTakesWork(state)) throw new WeekShutError("week shut");
}

/** Adds one row to the work log inside the transaction, at the server's time. */
export function logWork(
  tx: Transaction,
  db: Firestore,
  input: {
    runId: string;
    uid: string;
    weekId: string;
    weekNumber: number;
    kind: WorkLogKind;
    itemKind: WorkLogItemKind;
    itemId: string;
    byUid?: string;
  },
): void {
  tx.set(db.collection(COURSE_WORK_LOG_COLLECTION).doc(), workLogEntry({ ...input, at: FieldValue.serverTimestamp() }));
}

/**
 * A save of a box, logged only when it starts a writing spell: `lastSavedAt`
 * is the row's own `updatedAt` before this save, or null for a row being made.
 */
export function logSave(
  tx: Transaction,
  db: Firestore,
  input: { runId: string; uid: string; weekId: string; weekNumber: number; itemKind: WorkLogItemKind; itemId: string; lastSavedAt: Date | null; now: Date },
): void {
  const { lastSavedAt, now, ...row } = input;
  if (!startsWritingSpell(lastSavedAt, now)) return;
  logWork(tx, db, { ...row, kind: "save" });
}
