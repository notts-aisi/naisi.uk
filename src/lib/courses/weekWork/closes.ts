import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { runEndOf } from "../finishing/runEnd";
import { addDaysToKey, isValidDateKey, londonWallClockToInstant } from "../weekPlan";

/**
 * WHEN A PROGRAMME CLOSES FOR WORK: after it, every week of the run is read
 * only for everybody. Until it, a week takes ticks, words, picks and sends,
 * whatever its session (privacy v17: "We may let you keep adding to a week
 * and changing it after its session, until your programme closes").
 *
 * THE MOMENT: the end of the London day that is N days after the day of the
 * run's last session, the latest session any of its live groups has
 * (`runEndOf`, a cancelled session not counted). N is the run's own
 * `workClosesAfterDays`; a run without one closes 14 days after. A run with
 * no session to date never closes by the clock.
 *
 * Pure: no reads, no clock.
 */

/** Days after the run's last session that work closes, for a run that says none. */
export const WORK_CLOSES_AFTER_DAYS = 14;

/** The end of the London day `days` days after `lastDateKey`, or null with no day. */
export function workClosesAfter(lastDateKey: string | null, days: number | null): Date | null {
  if (!lastDateKey || !isValidDateKey(lastDateKey)) return null;
  const after = days !== null && Number.isInteger(days) && days >= 0 ? days : WORK_CLOSES_AFTER_DAYS;
  // The end of that day is the London midnight that starts the next one.
  return londonWallClockToInstant(addDaysToKey(lastDateKey, after + 1), "00:00");
}

/** When `run` closes for work, from its live groups' calendars; null when it has no session to date. */
export function workClosesAt(run: CourseRunDoc, groups: readonly CourseGroupDoc[]): Date | null {
  return workClosesAfter(runEndOf(run, groups, new Date(0)).lastDateKey, run.workClosesAfterDays);
}
