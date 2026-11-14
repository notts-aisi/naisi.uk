import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { copyGroupIdFor } from "@/lib/courses/weekCopy";
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
import { workClosesAt } from "./closes";
import { NO_GROUP, weekDueOf, type SessionSource, type WeekDue } from "./sessionDue";
import { weekTakesWork, weekWorkState, type WeekWorkState } from "./model";
import { sessionSourceFor } from "./readers";
import {
  earlierVersionOf,
  storedEarlierVersion,
  versionOwed,
  withEarlierVersion,
  type EarlierVersion,
  type PieceFacts,
  type VersionReason,
} from "./versions";

/**
 * A PERSON'S OWN WEEK, AS THE ROUTES THAT WRITE IT ASK ABOUT IT: the session
 * they are due at, whether the programme has closed (asked inside the write's
 * own transaction), the earlier version a change must keep, and the row each
 * write adds to the work log. Every route that writes somebody's week (a
 * tick, a reflection, a fill-in box, the written answer and its Send, a pack
 * or a talk's ready mark, the old Submit) asks here, so a closed programme
 * refuses them all alike and every one of them is logged alike. Nothing is
 * refused at the session any more, or after a send.
 */

/** Thrown out of a transaction once the programme has closed: the route answers 409 with `closedWords(at)`. */
export class WorkClosedError extends Error {
  constructor(public at: Date) {
    super("programme closed");
  }
}

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

/**
 * SOMEBODY TAKING PART IN THEIR OWN WEEK, as the routes that write it admit
 * them (the reflection boxes' route's rule, kept the same): an active learner
 * seat on the run, told its group by Publish, on an account that stands; a
 * facilitator of a live group of the run, as themselves; or, in week 1 alone,
 * somebody holding a place whom Publish has not told yet, once week 1's door
 * is open to them. Null for anybody else. `copyGroupId` is the group whose
 * copy of the week they read: the group their placement belonged to in THIS
 * week (`copyGroupIdFor`, so somebody moved mid-term writes in the copy they
 * saw, whether or not that group still meets), or the one group they
 * facilitate; null for the run's own week.
 */
export type OwnSeat = {
  run: CourseRunDoc | null;
  liveGroups: CourseGroupDoc[];
  /** Their learner seat, when they take part through one. */
  learner: CourseEnrolmentDoc | null;
  beforeGroups: boolean;
  copyGroupId: string | null;
  source: SessionSource;
  /** When the programme closes for work, or null when it never closes by the clock. */
  closesAt: Date | null;
};

export async function ownSeatOn(db: Firestore, actor: SessionUser, runId: string, weekNumber: number): Promise<OwnSeat | null> {
  const [enrolSnap, groupSnap, run] = await Promise.all([
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
    readRunForWork(db, runId),
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
  // Their placement's group while it meets, else the one group they facilitate: the group now, as before.
  const placedId = learner?.groupId && liveGroups.some((group) => group.id === learner.groupId) ? learner.groupId : null;
  const nowId = placedId ?? (facilitates.length === 1 ? facilitates[0].id : null);
  const copyGroupId = learner?.groupId ? copyGroupIdFor(learner, weekNumber, nowId) : nowId;
  return {
    run,
    liveGroups,
    learner,
    beforeGroups,
    copyGroupId: beforeGroups ? null : copyGroupId,
    source: ownSessionSource(run, liveGroups, actor.uid, learner),
    closesAt: run ? workClosesAt(run, liveGroups) : null,
  };
}

/**
 * The run, read for its weeks' work: null when it is gone or being
 * destroyed. One addressed read.
 */
export async function readRunForWork(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/**
 * Whose sessions the caller's own week goes by: their told placement's
 * group, else the groups they facilitate (`sessionSourceFor`). Somebody through
 * week 1's door before groups go out has none, and nor does a run that is
 * gone.
 */
export function ownSessionSource(
  run: CourseRunDoc | null,
  liveGroups: readonly CourseGroupDoc[],
  uid: string,
  enrolment: CourseEnrolmentDoc | null,
): SessionSource {
  return run ? sessionSourceFor(run, liveGroups, uid, enrolment) : NO_GROUP;
}

/** The address of a person's week record. */
export function weekWorkRef(db: Firestore, runId: string, uid: string, weekId: string) {
  return db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(runId, uid, weekId));
}

/** A person's week as a write reads it: where it stands, the session they are due at, and their week record. */
export type WeekStanding = { state: WeekWorkState; due: WeekDue; record: CourseWeekWorkDoc | null };

/**
 * Where the caller's week stands, read INSIDE the write's transaction, so a
 * write landing as the programme closes is put in one order with it. Reads
 * only: call it with the transaction's other reads, before any write.
 */
export async function weekStateIn(
  tx: Transaction,
  db: Firestore,
  input: { runId: string; uid: string; weekId: string; weekNumber: number; source: SessionSource; closesAt: Date | null; now: Date },
): Promise<WeekStanding> {
  const snap = await tx.get(weekWorkRef(db, input.runId, input.uid, input.weekId));
  const record = snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
  const due = weekDueOf(input.source, input.weekNumber);
  return { state: weekWorkState({ due, closesAt: input.closesAt, facts: record, now: input.now }), due, record };
}

/** Refuses a write once the programme has closed. Nothing else closes a week. */
export function assertWeekTakesWork(state: WeekWorkState): void {
  if (!weekTakesWork(state) && state.kind === "closed") throw new WorkClosedError(state.at);
}

/**
 * WHAT A CHANGE TO A PIECE KEEPS (`./versions.ts`): the row's list of earlier
 * versions with the version this change replaces added, when the change is
 * the first after the session started, after a send before it, or after
 * feedback on these words (`reviewed`); null when it keeps nothing new. Asked
 * inside the save's transaction with the row as it stood and the week's
 * record (`reviewedVersions`).
 */
export function versionsToKeep(input: {
  prior: PieceFacts | null;
  itemId: string;
  standing: WeekStanding;
  now: Date;
}): { list: EarlierVersion[]; reasons: VersionReason[] } | null {
  const { prior, itemId, standing, now } = input;
  const reasons = versionOwed({
    prior,
    dueAt: standing.due.at,
    reviewedSavedAt: standing.record?.reviewedVersions[itemId] ?? null,
    now,
  });
  if (!prior || reasons.length === 0) return null;
  return { list: withEarlierVersion(prior.earlierVersions, earlierVersionOf(prior, reasons, now)), reasons };
}

/** A list of earlier versions as a write stores it. */
export function storedEarlierVersions(list: readonly EarlierVersion[]): Record<string, unknown>[] {
  return list.map(storedEarlierVersion);
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
