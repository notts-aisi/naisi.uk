import { dayWords } from "@/lib/courses/sessionChange/words";
import { addDaysToKey, isValidDateKey } from "@/lib/courses/weekPlan";
import { THIS_TERM } from "./words";

/**
 * "THE WEEKS" ON A TEAM'S PAGE (board in-team): every taught week of the
 * team's group's calendar, across both terms, with the break between them.
 *
 * An incubator meets for some weeks this term and some more after a break
 * (Q10: 7 now and 3 in February). Nothing here knows that shape: the run's
 * own calendar does. Its week plan is a list of seven-day slots, each a
 * taught week or a break, so the weeks fall into runs between breaks, and
 * each run is drawn as one row of the bar:
 *
 *  - the run that today falls in, or the first one before anything has
 *    started, is labelled "This term";
 *  - every other run is labelled by the months its sessions fall in ("Feb",
 *    "Oct to Dec"), or by its weeks when the calendar cannot date them.
 *
 * And the line above the bar says where the term ends and when the next one
 * meets, from the sessions' own dates: "Week 7, Thu 10 Dec, is the last this
 * term. Weeks 8 to 10: Thu 4, 11 and 18 Feb." Its other forms (in the break,
 * in the last run, after the end) are written in the board's voice.
 *
 * Each week is done (its seven days are over), this week's, or still to
 * come. Pure: the caller resolves the group's calendar and its sessions.
 */

/** One slot of the group's plan, in order: a taught week with its dates, or a break. */
export type PlanSlot =
  | {
      kind: "week";
      weekNumber: number;
      /** The first day of the week's seven, "YYYY-MM-DD"; "" when the calendar has no start date. */
      slotStartKey: string;
      /** The day the group meets that week, "YYYY-MM-DD"; "" when that session cannot be dated. */
      dateKey: string;
    }
  | { kind: "break" };

export type WeekState = "done" | "current" | "upcoming";

export type TeamWeeksView = {
  /** The line above the bar, or null when the calendar cannot date what it would say. */
  sentence: string | null;
  segments: Array<{ label: string; weeks: Array<{ weekNumber: number; state: WeekState }> }>;
};

type Week = Extract<PlanSlot, { kind: "week" }>;

const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "short" });
const PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

function noonOf(dateKey: string): Date | null {
  if (!isValidDateKey(dateKey)) return null;
  return new Date(`${dateKey}T12:00:00Z`);
}

function partsOf(dateKey: string): { weekday: string; day: string; month: string } | null {
  const at = noonOf(dateKey);
  if (!at) return null;
  const parts = PARTS.formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "Week 8", "Weeks 8 and 9", "Weeks 8 to 10". */
export function weekRangeWords(numbers: readonly number[]): string {
  if (numbers.length === 0) return "";
  if (numbers.length === 1) return `Week ${numbers[0]}`;
  if (numbers.length === 2) return `Weeks ${numbers[0]} and ${numbers[1]}`;
  return `Weeks ${numbers[0]} to ${numbers[numbers.length - 1]}`;
}

/**
 * Days as the board lists them: "Thu 4, 11 and 18 Feb" when they share a
 * weekday, "Thu 28 Jan, 4 and 11 Feb" across a month, and each day whole
 * ("Thu 4 Feb, Wed 10 Feb and Thu 18 Feb") when they do not. "" when any
 * day is not a date.
 */
export function daysListWords(dateKeys: readonly string[]): string {
  const parts = dateKeys.map(partsOf);
  if (parts.length === 0 || parts.some((part) => part === null)) return "";
  const days = parts as Array<{ weekday: string; day: string; month: string }>;
  const join = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  if (days.every((part) => part.weekday === days[0].weekday)) {
    // The month is said after the last day of each month's run of days.
    const items = days.map((part, index) =>
      index === days.length - 1 || days[index + 1].month !== part.month ? `${part.day} ${part.month}` : part.day,
    );
    return `${days[0].weekday} ${join(items)}`;
  }
  return join(days.map((part) => `${part.weekday} ${part.day} ${part.month}`));
}

/** "Feb", or "Oct to Dec" across months. "" when either end is not a date. */
function monthSpanWords(firstKey: string, lastKey: string): string {
  const first = noonOf(firstKey);
  const last = noonOf(lastKey);
  if (!first || !last) return "";
  const from = MONTH.format(first);
  const to = MONTH.format(last);
  return from === to ? from : `${from} to ${to}`;
}

/** The day a week is met on, or, with no session to date, the first day of its seven. */
function dayOf(week: Week): string {
  return week.dateKey || week.slotStartKey;
}

function stateOf(week: Week, todayKey: string): WeekState {
  if (!isValidDateKey(week.slotStartKey)) return "upcoming";
  const lastDay = addDaysToKey(week.slotStartKey, 6);
  if (lastDay < todayKey) return "done";
  if (week.slotStartKey <= todayKey) return "current";
  return "upcoming";
}

/** The group's taught weeks in runs between breaks, each run as one row of the bar, and the line above it. */
export function teamWeeks(slots: readonly PlanSlot[], todayKey: string): TeamWeeksView | null {
  const runs: Week[][] = [];
  let current: Week[] = [];
  for (const slot of slots) {
    if (slot.kind === "break") {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    current.push(slot);
  }
  if (current.length > 0) runs.push(current);
  if (runs.length === 0) return null;

  const firstDay = (run: Week[]) => dayOf(run[0]);
  const lastDay = (run: Week[]) => dayOf(run[run.length - 1]);
  const finished = (run: Week[]) => Boolean(lastDay(run)) && lastDay(run) < todayKey;
  const started = (run: Week[]) => Boolean(firstDay(run)) && firstDay(run) <= todayKey;

  // The first run not over yet. It is this term's when it has started, or
  // when nothing before it has (before the first session, the first run).
  const open = runs.findIndex((run) => !finished(run));
  const thisTerm = open >= 0 && (open === 0 || started(runs[open])) ? open : -1;

  const segments = runs.map((run, index) => ({
    label:
      index === thisTerm
        ? THIS_TERM
        : monthSpanWords(firstDay(run), lastDay(run)) || weekRangeWords(run.map((week) => week.weekNumber)),
    weeks: run.map((week) => ({ weekNumber: week.weekNumber, state: stateOf(week, todayKey) })),
  }));

  return { sentence: sentenceOf(runs, open, thisTerm), segments };
}

/** The line above the bar. Null when a day it would name cannot be dated. */
function sentenceOf(runs: Week[][], open: number, thisTerm: number): string | null {
  const lastOf = (run: Week[]) => run[run.length - 1];
  const datedRun = (run: Week[]) => {
    const days = run.map((week) => week.dateKey);
    return days.every(Boolean) ? daysListWords(days) : "";
  };

  if (thisTerm >= 0) {
    const last = lastOf(runs[thisTerm]);
    const day = last.dateKey ? dayWords(last.dateKey) : "";
    if (!day) return null;
    const next = runs[thisTerm + 1];
    if (!next) return `Week ${last.weekNumber}, ${day}, is the last.`;
    const days = datedRun(next);
    if (!days) return null;
    return `Week ${last.weekNumber}, ${day}, is the last this term. ${weekRangeWords(next.map((week) => week.weekNumber))}: ${days}.`;
  }
  if (open >= 0) {
    // In a break: when the group meets next.
    const days = datedRun(runs[open]);
    if (!days) return null;
    return `${weekRangeWords(runs[open].map((week) => week.weekNumber))}: ${days}.`;
  }
  // Every run is over.
  const last = lastOf(runs[runs.length - 1]);
  const day = last.dateKey ? dayWords(last.dateKey) : "";
  return day ? `Week ${last.weekNumber}, ${day}, was the last.` : null;
}
