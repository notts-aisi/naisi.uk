import type { OverviewPayload, OverviewWeekSchedule } from "@/app/api/courses/runs/[runId]/overview/route";
import { WEEK_STATE_WORDS, sessionDayWords } from "@/lib/courses/memberPageWords";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { handedTasksDone } from "@/lib/courses/weekBlocks/progress";

/**
 * THE WEEKS OF A PROGRAMME, AS ITS HOME LISTS THEM (boards wk-programme,
 * st-programme): every taught week of the reader's own calendar, each with
 * its title, its session's date and its state, worked out from the overview
 * payload alone. Pure, so the page and the tests read one answer.
 *
 *  - DONE: open, and its session is over (a cancelled one once its evening
 *    has passed). A week with no session to date is done once the calendar
 *    has moved past it.
 *  - CURRENT: open, not over, and this week by the calendar.
 *  - NEXT: open, not over, and the week of the group's next session, when
 *    that is not this week's (before the first session, week 1).
 *  - OPEN: open and none of those: a reader with no group, or a week ahead
 *    of the group's next session, which anybody may read ahead.
 *  - SHUT: not published yet. Every published week is open to everybody the
 *    run is open to (Zach, 27 October 2026), so nothing says when one opens.
 */

export type WeekRowState = "done" | "current" | "next" | "open" | "shut";

export type WeekRow = {
  weekNumber: number;
  title: string;
  state: WeekRowState;
  cancelled: boolean;
  /** "Tue 3 Nov · Done", "Tonight", "Tue 24 Nov": upper case by the stylesheet. */
  when: string;
  /**
   * What is done of the week, for an open week that has anything to do: its
   * readings and checklist, or on a week written as blocks This week's tasks
   * (`progress.ts`, "1 of 1").
   */
  of: { done: number; of: number } | null;
  /** The schedule entry the row was made from. */
  schedule: OverviewWeekSchedule;
};

/** The calendar's own week number now: this week, or the last taught one before a break. 0 before the start. */
function calendarWeekOf(payload: Pick<OverviewPayload, "currentWeek">): { number: number; phase: string } {
  const current = payload.currentWeek;
  if (!current) return { number: 0, phase: "none" };
  return { number: current.weekNumber ?? current.anchorWeekNumber, phase: current.phase };
}

export function weekRowsOf(
  payload: Pick<OverviewPayload, "weekSchedule" | "weeks" | "currentWeek">,
  nextSessionWeek: number | null,
  doneOf: (ids: readonly string[]) => number,
  now: Date,
  /**
   * The reader's group has not met yet (st-programme): their first week is
   * "Next" whatever the calendar's own week.
   */
  beforeFirstSession = false,
): WeekRow[] {
  const todayKey = londonDateKey(now);
  const calendar = beforeFirstSession ? { number: 0, phase: "before" } : calendarWeekOf(payload);
  const docs = new Map(payload.weeks.map((week) => [week.weekNumber, week]));

  return payload.weekSchedule.map((schedule) => {
    const doc = docs.get(schedule.weekNumber);
    const title = doc?.title.trim() ?? "";
    const day = schedule.dateKey ? dayWords(schedule.dateKey) : "";
    const thisWeek = calendar.phase === "running" && calendar.number === schedule.weekNumber;
    const past = calendar.phase === "after" || (calendar.phase === "running" && schedule.weekNumber < calendar.number);
    const over = schedule.dateKey ? schedule.over : past;

    let state: WeekRowState;
    if (!schedule.open) state = "shut";
    else if (over) state = "done";
    else if (thisWeek) state = "current";
    else if (nextSessionWeek === schedule.weekNumber) state = "next";
    else state = "open";

    const today = schedule.dateKey !== "" && schedule.dateKey === todayKey && !schedule.over;
    let when: string;
    if (schedule.cancelled) {
      // A cancelled session says so, done or not: nobody met that evening.
      when = day ? `${day} · ${WEEK_STATE_WORDS.cancelled}` : WEEK_STATE_WORDS.cancelled;
    } else if (state === "done") when = day ? `${day} · ${WEEK_STATE_WORDS.done}` : WEEK_STATE_WORDS.done;
    else if ((state === "current" || state === "next") && today) {
      when = sessionDayWords(schedule.dateKey, schedule.startTimeLocal, todayKey);
    } else when = day;

    const countable = doc?.countableIds ?? [];
    // A week written as blocks counts This week's tasks. A tick is done when
    // `doneOf` counts it, so the one predicate both kinds of week read is it.
    const tasks = (doc?.thisWeek?.rows ?? []).flatMap((row) => (row.type === "task" ? [row] : []));
    const byTasks = doc?.thisWeek ? handedTasksDone(tasks, (id) => doneOf([id]) > 0) : null;
    const of = byTasks ? (byTasks.of > 0 ? byTasks : null) : countable.length > 0 ? { done: doneOf(countable), of: countable.length } : null;
    return {
      weekNumber: schedule.weekNumber,
      title,
      state,
      cancelled: schedule.cancelled,
      when,
      of: state !== "shut" ? of : null,
      schedule,
    };
  });
}
