import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { AvailabilityGrid } from "@/lib/admissions/availability";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { formatRunStartShort } from "@/lib/courses/window";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { paintedWeekOf } from "../handover/paintedWeek";
import { RUNS_COLLECTION } from "../handover/run";
import type { ApplicationDoc } from "../model";
import { meetsWords } from "./words";

/**
 * THE COURSE RUN A FREED PLACE IS ON: its calendar, its groups, and who is in
 * one yet. For the page and for the writer, which read them the same way.
 *
 * The run is the one the programme names (`programmes.<id>.runId`, #67's
 * join). Its calendar says when the window closes; its groups say when a
 * place would meet, which is what the email names. Nothing here is written,
 * and nothing of an application is read: the caller hands in the painted
 * week and is handed back which groups it covers.
 */

const GROUPS_COLLECTION = "courseGroups";
const ENROLMENTS_COLLECTION = "courseEnrolments";

export function runRef(db: Firestore, runId: string): DocumentReference {
  return db.collection(RUNS_COLLECTION).doc(runId);
}

export function groupRef(db: Firestore, groupId: string): DocumentReference {
  return db.collection(GROUPS_COLLECTION).doc(groupId);
}

/** One person's place on a run: `courseEnrolments/{runId}__{uid}`, one per run and person. */
export function enrolmentRef(db: Firestore, runId: string, uid: string): DocumentReference {
  return db.collection(ENROLMENTS_COLLECTION).doc(`${runId}__${uid}`);
}

/** The run, or null when the programme names none or it is not there. */
export async function readRun(db: Firestore, runId: string | null): Promise<CourseRunDoc | null> {
  if (!runId) return null;
  const snap = await runRef(db, runId).get();
  return snap.exists ? normalizeCourseRun(snap.id, snap.data() ?? {}) : null;
}

/** Every group of the run, archived ones included: one equality, no index. */
export async function readGroups(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  const snap = await db.collection(GROUPS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));
}

/**
 * A group whose weekly time an email can name: on this run, not archived,
 * and with a day and a start time. Every other group is one nobody can be
 * told they would meet with.
 */
export function isTimed(group: CourseGroupDoc, runId: string): boolean {
  return group.runId === runId && !group.archived && meetsWords(group.session) !== null;
}

/**
 * The run's groups an email can name, in the order every tab of the
 * programme's page lists groups (`compareGroupsByMeeting`, People in groups'
 * order, Monday first).
 */
export function timedGroupsOf(groups: readonly CourseGroupDoc[], runId: string): CourseGroupDoc[] {
  return groups
    .filter((group) => isTimed(group, runId))
    .sort((a, b) => compareGroupsByMeeting(a, b) || a.id.localeCompare(b.id));
}

/**
 * "Wed 4 Nov": the group's next session that has not started yet, on its own
 * calendar (a group that paces itself apart from its run has its own dates).
 * Null when none is still to come, or the calendar cannot date one.
 */
export function nextSessionDay(run: CourseRunDoc, group: CourseGroupDoc, now: Date): string | null {
  for (const session of resolveSessions(run, group)) {
    const { startsAt } = sessionInstants(session);
    if (startsAt && startsAt.getTime() > now.getTime()) return formatRunStartShort(session.dateKey) ?? null;
  }
  return null;
}

/**
 * The words one group lends an email: when it meets, and when it next does.
 * When the person is free then is their own week's to say
 * (`freeOnInTheirWeek` in `./words.ts`), never the group's.
 */
export function groupWords(run: CourseRunDoc, group: CourseGroupDoc, now: Date) {
  return {
    meets: meetsWords(group.session),
    startsOn: nextSessionDay(run, group, now),
  };
}

/**
 * Does this person's painted week cover the group's WHOLE weekly session?
 * Asked through `paintedWeekOf`, the one reading of a painted week that the
 * allocation board's cards and the times picture also ask, so the three
 * cannot disagree. No sent application, or nothing painted, fits nothing.
 */
export function fits(
  grid: AvailabilityGrid,
  application: Pick<ApplicationDoc, "sent"> | null,
  group: CourseGroupDoc,
): boolean {
  const week = paintedWeekOf(grid, application);
  return week.kind === "given" && week.covers(group.session);
}

/** Of these people, the ones already put in a group on the run. */
export async function placedOnRun(
  db: Firestore,
  runId: string,
  uids: readonly string[],
): Promise<Set<string>> {
  const distinct = [...new Set(uids)];
  if (distinct.length === 0) return new Set();
  const snaps = await db.getAll(...distinct.map((uid) => enrolmentRef(db, runId, uid)));
  return placedIn(snaps.map((snap) => (snap.exists ? { id: snap.id, data: snap.data() ?? {} } : null)));
}

/** The people these enrolment documents say are in a group. */
export function placedIn(enrolments: readonly ({ id: string; data: Record<string, unknown> } | null)[]): Set<string> {
  const placed = new Set<string>();
  for (const enrolment of enrolments) {
    if (!enrolment) continue;
    const doc = normalizeCourseEnrolment(enrolment.id, enrolment.data);
    if (doc.groupId && doc.status === "active") placed.add(doc.uid);
  }
  return placed;
}
