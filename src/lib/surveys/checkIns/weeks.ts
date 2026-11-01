import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { weeksOf } from "@/lib/courses/programmeAttendance";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { createCheckInWeek, readCheckInWeeks } from "@/lib/firestore/checkInWeeks";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import type { CheckInSurveyDoc } from "@/lib/firestore/surveys";
import { checkInsOfRun, isOpen } from "../repo";
import { weekHasBegun, weekIsWhole, type WeekCheckIn, type WeekSession } from "./model";

/**
 * A PROGRAMME'S WEEKS OF CHECK-INS: which check-ins are the programme's, the
 * sessions a week waits on, and the record of each week's check-ins, fixed
 * the first time the week is whole (`src/lib/firestore/checkInWeeks.ts`).
 *
 *  - ONE LIST. The Surveys tab (`readProgrammeCheckIns`) and the job that
 *    fixes the weeks read the same check-ins (`ofProgramme`: the run's, opened
 *    for this programme), the same sessions (`sessionsOf`: those of the run's
 *    groups that still meet) and the same weeks (`weekNumbersOf`), so the
 *    week the job fixes is the week the tab draws.
 *  - A WEEK'S CHECK-INS ARE FIXED WHEN IT FIRST SHOWS. On each tick the
 *    scheduler's `surveys-check-in-weeks` job fixes every week of a programme
 *    that is whole (`weekIsWhole`: every session of it that can have a
 *    check-in is past its check-in time, and none of its check-ins is open)
 *    and has begun (`weekHasBegun`, so a week whose sessions are not dated yet
 *    is never fixed empty), and is not fixed yet (`freezeWholeWeeks`). The
 *    lead reads a week only once it is fixed, and then only its check-ins: one
 *    opened for it afterwards, by a session dated or moved later, never joins
 *    it. Nothing else writes a week, and a week is never written twice.
 *  - IDS, NEVER ANSWERS. Fixing a week reads which check-ins it has and
 *    whether any is open, never an answer or who was sent it.
 */

/** By when each session started, then by id: the order a week's check-ins are counted and listed in. */
function bySession(a: CheckInSurveyDoc, b: CheckInSurveyDoc): number {
  return (a.checkIn.startsAt?.getTime() ?? 0) - (b.checkIn.startsAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
}

/**
 * The run's check-ins that were opened for this programme, by when each
 * session started: a run named afterwards by another programme never shows
 * its lead what the box at the top told people another programme's lead
 * would see.
 */
export function ofProgramme(checkIns: readonly CheckInSurveyDoc[], roundId: string, programmeId: string): CheckInSurveyDoc[] {
  return checkIns
    .filter((survey) => survey.audience.roundId === roundId && survey.audience.programmeId === programmeId)
    .sort(bySession);
}

/** Every session of the run's groups that still meet, as a week waits on it. */
export function sessionsOf(run: CourseRunDoc, groups: readonly CourseGroupDoc[]): WeekSession[] {
  return groups.flatMap((group) =>
    resolveSessions(run, group).map((session): WeekSession => {
      const { startsAt, endsAt } = sessionInstants(session);
      return { weekNumber: session.weekNumber, cancelled: session.cancelled, dateKey: session.dateKey, startsAt, endsAt };
    }),
  );
}

/** The weeks a programme's check-ins are read by: the run's taught weeks, and every week a check-in was opened for, in order. */
export function weekNumbersOf(weeks: readonly number[], checkIns: readonly CheckInSurveyDoc[]): number[] {
  return [...new Set([...weeks, ...checkIns.map((survey) => survey.audience.weekNumber)])].sort((a, b) => a - b);
}

/** Where each of these check-ins stands at `now`, as a week waits on it. */
export function marksOf(checkIns: readonly CheckInSurveyDoc[], now: Date): WeekCheckIn[] {
  return checkIns.map((survey) => ({ weekNumber: survey.audience.weekNumber, open: isOpen(survey, now) }));
}

/** Each fixed week of the run, by its number, with the ids of the check-ins it was fixed with. */
export async function frozenWeeksOf(db: Firestore, runId: string): Promise<Map<number, ReadonlySet<string>>> {
  const records = await readCheckInWeeks(db, runId);
  return new Map([...records].map(([weekNumber, record]) => [weekNumber, new Set(record.surveyIds)] as const));
}

/** The run, its groups that still meet and its taught weeks: what a programme's weeks of check-ins are read against. */
export type RunWeeks = { run: CourseRunDoc; groups: CourseGroupDoc[]; weeks: number[] };

/**
 * The run, its groups that still meet (not archived, in the one order,
 * `compareGroupsByMeeting`) and its taught weeks (`weeksOf`), as the Surveys
 * tab has them from `readRunRecords`, with only the two reads the weeks need:
 * the job asks this of every run a programme names, on every tick. Null when
 * the run is not there, or is being destroyed, so no week of it is fixed
 * behind its destroy.
 */
export async function readRunWeeks(db: Firestore, runId: string): Promise<RunWeeks | null> {
  if (!runId || runId.includes("/")) return null;
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
  ]);
  if (!runSnap.exists || runSnap.data()?.destroying === true) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId)
    .sort(compareGroupsByMeeting);
  return { run, groups, weeks: weeksOf({ run, groups }) };
}

/**
 * FIX EVERY WEEK OF THE PROGRAMME'S CHECK-INS THAT IS WHOLE AT `now`, has
 * begun, and is not fixed yet: its record holds the ids of every check-in the
 * programme has for that week, all of them closed. Each week is created once
 * (`createCheckInWeek`), so two ticks at once fix it once, and a week fixed
 * already is never looked at again. Answers the weeks this call fixed.
 *
 * The scheduler's job is its only caller: no page and no GET route writes
 * anything (`tests/get-handlers-readonly.test.mjs` names this among the
 * helpers a GET may never call).
 */
export async function freezeWholeWeeks(
  db: Firestore,
  input: { roundId: string; programmeId: string; now: Date } & RunWeeks,
): Promise<number[]> {
  const { run, now } = input;
  const [ofRun, fixed] = await Promise.all([checkInsOfRun(db, run.id), readCheckInWeeks(db, run.id)]);
  const checkIns = ofProgramme(ofRun, input.roundId, input.programmeId);
  const sessions = sessionsOf(run, input.groups);
  const marks = marksOf(checkIns, now);
  const made: number[] = [];
  for (const weekNumber of weekNumbersOf(input.weeks, checkIns)) {
    if (fixed.has(weekNumber)) continue;
    if (!weekIsWhole(weekNumber, sessions, marks, now) || !weekHasBegun(weekNumber, sessions, marks, now)) continue;
    const surveyIds = checkIns.filter((survey) => survey.audience.weekNumber === weekNumber).map((survey) => survey.id);
    if (await createCheckInWeek(db, run.id, weekNumber, surveyIds)) made.push(weekNumber);
  }
  return made;
}
