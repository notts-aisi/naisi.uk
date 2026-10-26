import { addDaysToKey, isValidDateKey } from "./weekPlan";
import { formatRunStartShort } from "./window";
import type { WeekPlanEntry } from "./weekPlan";

/**
 * WHEN GROUPS GO OUT, AS EVERY SENTENCE THAT NAMES IT SAYS IT.
 *
 * The day is the run's own record (`CourseRunDoc.groupsGoOutOn`), set by the
 * programme's lead and admins on the programme's Groups tab. Nothing about
 * a term is written here: with no day set, each sentence is said without
 * one, in the boards' voice, and a day that has passed is no promise any
 * more, so it is left out the same way. Today is London's.
 *
 * The sentences, and the board each is from:
 *  - Home's card (st-waiting): "You’ll get an email with your group, day and
 *    room by Wed 28 Oct."
 *  - Week 1's line before groups go out (st-week1-phone): "Week 1 is open
 *    now. You’ll hear your group and when it meets on Wed 28 Oct."
 *  - The application page's "When you’re free" (st-application-phone, and
 *    st-late-phone with no day): "You can change it until we email your
 *    group on Wed 28 Oct."
 *
 * Pure, with no server import, so a server page and a browser one say the
 * same words.
 */

/** "Wed 28 Oct" while the planned day is today or later; null with no day, or once it has passed. */
export function groupsGoOutDay(groupsGoOutOn: string | null | undefined, todayKey: string): string | null {
  if (!groupsGoOutOn || !isValidDateKey(groupsGoOutOn) || groupsGoOutOn < todayKey) return null;
  return formatRunStartShort(groupsGoOutOn) ?? null;
}

/**
 * The run's first taught week, its first and last day ("YYYY-MM-DD"), from
 * its start date and week plan: the window "Your first session will be
 * between Thu 29 Oct and Wed 4 Nov" names. Null on a run with no usable
 * start date or no taught week.
 */
export function firstWeekOf(run: { startDate: string; weekPlan: readonly WeekPlanEntry[] }): { from: string; to: string } | null {
  if (!isValidDateKey(run.startDate)) return null;
  const index = run.weekPlan.findIndex((entry) => entry.kind === "week");
  if (index < 0) return null;
  const from = addDaysToKey(run.startDate, index * 7);
  return { from, to: addDaysToKey(from, 6) };
}

/** "We’re putting groups together now. You’ll get an email with your group, day and room by Wed 28 Oct." */
export function groupEmailComingWords(day: string | null): string {
  return day
    ? `We’re putting groups together now. You’ll get an email with your group, day and room by ${day}.`
    : // No day set, or it has passed: listed in the build notes for the boards' designers to confirm.
      "We’re putting groups together now. You’ll get an email with your group, day and room once they’re ready.";
}

/** "Your first session will be between Thu 29 Oct and Wed 4 Nov.", or null with no dated first week. */
export function firstSessionWindowWords(firstWeek: { from: string; to: string } | null): string | null {
  if (!firstWeek) return null;
  const from = formatRunStartShort(firstWeek.from);
  const to = formatRunStartShort(firstWeek.to);
  return from && to ? `Your first session will be between ${from} and ${to}.` : null;
}

/** st-week1-phone's line: "Week 1 is open now. You’ll hear your group and when it meets on Wed 28 Oct." */
export function weekOneOpenWords(day: string | null): string {
  return day
    ? `Week 1 is open now. You’ll hear your group and when it meets on ${day}.`
    : // No day set, or it has passed: listed in the build notes for the boards' designers to confirm.
      "Week 1 is open now. You’ll hear your group and when it meets once groups go out.";
}

/**
 * The application page's line under "When you’re free": st-application-phone's
 * two sentences with the day, st-late-phone's one without.
 */
export function freeUntilWords(day: string | null): string {
  return day
    ? `We use this to put you in a group. You can change it until we email your group on ${day}.`
    : "You can change it until we email your group.";
}
