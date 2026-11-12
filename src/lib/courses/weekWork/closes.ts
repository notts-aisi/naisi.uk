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

/**
 * WHEN A RUN CLOSED, FOR THE JOB THAT DELETES REASONS TO BE EXCUSED, and for
 * nothing else: as `workClosesAt`, except that a run whose groups are ALL
 * archived closes from those groups' own calendars. Without this such a run
 * has no live group, so no close moment, and the reasons given on it would
 * be kept for ever, which the privacy policy does not allow ("until your
 * programme closes"). Archiving a group never brings its last session
 * forward, so this moment is never earlier than the one the groups' own
 * calendars said: a reason is never deleted before its programme closed. A
 * run with no group at all, or no session to date, still has none.
 */
export function workClosedForReasons(run: CourseRunDoc, groups: readonly CourseGroupDoc[]): Date | null {
  const own = groups.filter((group) => group.runId === run.id);
  const live = own.filter((group) => !group.archived);
  if (live.length > 0) return workClosesAt(run, live);
  return workClosesAt(
    run,
    own.map((group) => ({ ...group, archived: false })),
  );
}
