import type { OverviewPayload, OverviewWeekSchedule } from "@/app/api/courses/runs/[runId]/overview/route";
import {
  WEEK_STATE_WORDS,
  opensWords,
  sessionDayWords,
} from "@/lib/courses/memberPageWords";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";

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
 *  - OPEN: open and none of those (a reader with no group).
 *  - SHUT: not open to the reader yet (C17), or not published. The next
 *    week to open, when it is published, says when ("Opens tonight, after
 *    your session"); before the first session the list says it once under
 *    the weeks instead, as the board draws it.
 */

export type WeekRowState = "done" | "current" | "next" | "open" | "shut";

export type WeekRow = {
  weekNumber: number;
  title: string;
  state: WeekRowState;
  cancelled: boolean;
  /** "Tue 3 Nov · Done", "Tonight", "Tue 24 Nov": upper case by the stylesheet. */
  when: string;
  /** "Opens tonight, after your session", for a shut week that waits on a session. */
  opens: string | null;
  /** What is done of the week's readings, for an open week that has any. */
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
   * "Next" whatever the calendar's own week, and the weeks say once, under
   * the list, when each opens.
   */
  beforeFirstSession = false,
): WeekRow[] {
  const todayKey = londonDateKey(now);
  const calendar = beforeFirstSession ? { number: 0, phase: "before" } : calendarWeekOf(payload);
  const docs = new Map(payload.weeks.map((week) => [week.weekNumber, week]));

  // The one week that says when it opens: the first that is not open yet.
  const nextToOpen = payload.weekSchedule.find((schedule) => !schedule.open)?.weekNumber ?? null;
  const saysWhen = calendar.phase !== "before" && calendar.phase !== "none";

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
    return {
      weekNumber: schedule.weekNumber,
      title,
      state,
      cancelled: schedule.cancelled,
      when,
      opens:
        state === "shut" && saysWhen && schedule.weekNumber === nextToOpen && schedule.opensAfter
          ? opensWords(schedule.opensAfter, todayKey)
          : null,
      of: state !== "shut" && countable.length > 0 ? { done: doneOf(countable), of: countable.length } : null,
      schedule,
    };
  });
}
