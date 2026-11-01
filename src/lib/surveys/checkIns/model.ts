import { own } from "@/lib/applications/keys";
import { londonWallClockToInstant } from "@/lib/courses/weekPlan";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { SurveyAnswer, SurveyChoiceQuestion, SurveyItem } from "../items";
import { surveyQuestionsOf } from "../items";
import { meanOf } from "../results";
import { CHECK_IN_QUESTION_IDS, READING_OPTIONS, UNCLEAR_NOTHING } from "./template";
import type { TotalsFacts, UnclearCount } from "./words";

/**
 * THE CHECK-IN'S RULES, pure: when one can be opened and when it closes, who
 * it is for, and what a group's facilitators may see of it. The routes and
 * the register read these; nothing here reads a database or a clock.
 *
 *  - WHEN. A session that can be dated has a check-in window: from its start
 *    until 11pm on its London day, or an hour after it ends when that is
 *    later (a 9:30 to 11:30pm online group's closes at 12:30am). It closes by
 *    itself then (`closesAt`, read by `isOpen` like every survey's), or
 *    earlier by "Close it now". A session that cannot be dated, or did not
 *    happen, has none.
 *  - WHO. The people the register marks there: present, late or left early,
 *    among its rows (the group's active members Publish has told), and never
 *    one of the group's facilitators, holding a place or not: they run it.
 *  - WHAT FACILITATORS SEE (`FACILITATOR_FLOORS`). While it is open, how many
 *    have sent it out of how many it is for, never who. Once it has closed,
 *    its totals, and only from three answers, so a small group's answers are
 *    never read one by one. Never a comment, never who said what.
 */

/** A check-in closes at this London wall-clock time on its session's day, at the earliest. */
export const CLOSES_AT_CLOCK = "23:00";

/** And never sooner than this after its session ends. */
export const CLOSES_AFTER_END_MS = 60 * 60 * 1000;

/** The register's marks that say somebody was there. */
export const HERE_STATUSES: readonly AttendanceStatus[] = ["present", "late", "left-early"];

/**
 * THE FLOORS, on the server. A group's facilitators see a closed check-in's
 * totals from three answers. The programme's lead (a later reading, never a
 * group's) sees a week's totals from three answers and its comments from five.
 */
export const TOTALS_FROM = 3;
export const COMMENTS_FROM = 5;

/** The most people one check-in reaches: a register's own cap (`ATTENDANCE_LIMITS.maxRecords`). */
export const MAX_CHECK_IN_PEOPLE = 40;

/** Check-ins a group may open in a London day, whoever opens them: a group meets at most twice in a day. */
export const CHECK_INS_PER_DAY = 2;

/** When one session's check-in may be opened, and when it closes. */
export type CheckInWindow = { opensAt: Date; closesAt: Date };

/**
 * A session's check-in window, or null when the session cannot be dated:
 * from its start until 11pm on its London day, or an hour after it ends when
 * that is later.
 */
export function checkInWindow(session: { dateKey: string; startsAt: Date | null; endsAt: Date | null }): CheckInWindow | null {
  if (!session.dateKey || !session.startsAt) return null;
  let night: Date;
  try {
    night = londonWallClockToInstant(session.dateKey, CLOSES_AT_CLOCK);
  } catch {
    return null;
  }
  const ends = session.endsAt ?? session.startsAt;
  const late = new Date(ends.getTime() + CLOSES_AFTER_END_MS);
  return { opensAt: session.startsAt, closesAt: late.getTime() > night.getTime() ? late : night };
}

/** Where a session stands for its check-in at `now`: before its start, within its window, or past it. */
export function windowState(window: CheckInWindow, now: Date): "early" | "now" | "past" {
  if (now.getTime() < window.opensAt.getTime()) return "early";
  if (now.getTime() >= window.closesAt.getTime()) return "past";
  return "now";
}

/**
 * WHO A CHECK-IN IS FOR: the register's rows its marks say were there
 * (present, late or left early), never the group's facilitators, in uid
 * order. Absent, excused and unmarked people are not; nobody outside the
 * rows can be marked, so there is nobody else.
 */
export function hereOf(
  marks: Readonly<Record<string, AttendanceStatus | null | undefined>>,
  rows: readonly { uid: string }[],
  facilitatorUids: readonly string[],
): string[] {
  const facilitators = new Set(facilitatorUids);
  const out = new Set<string>();
  for (const row of rows) {
    const status = own(marks, row.uid);
    if (!status || !HERE_STATUSES.includes(status) || facilitators.has(row.uid)) continue;
    out.add(row.uid);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// What a group's facilitators see
// ---------------------------------------------------------------------------

/** One person's answers, as the totals read them: no person, just the answers. */
export type CheckInAnswers = { answers: Record<string, SurveyAnswer> };

function ratingOf(answer: SurveyAnswer | undefined): number | null {
  return answer && answer.type === "rating" && Number.isFinite(answer.value) ? answer.value : null;
}

/**
 * A check-in's totals, counted from its answers: the average of how useful
 * and how confident, how many said most or all of the reading (null when the
 * week asked nothing about reading), and each part named unclear with how many
 * named it, most first ("Nothing was unclear" is never one). Never a comment
 * and never who: the short answers are not read at all.
 */
export function totalsOf(items: readonly SurveyItem[], answers: readonly CheckInAnswers[], of: number): TotalsFacts {
  const questions = surveyQuestionsOf(items);
  const unclear = questions.find((question) => question.id === CHECK_IN_QUESTION_IDS.unclear) as SurveyChoiceQuestion | undefined;
  const asksReading = questions.some((question) => question.id === CHECK_IN_QUESTION_IDS.reading);
  const useful: number[] = [];
  const confident: number[] = [];
  let readMost = 0;
  const named = new Map<string, number>();
  for (const { answers: given } of answers) {
    const u = ratingOf(own(given, CHECK_IN_QUESTION_IDS.useful));
    if (u !== null) useful.push(u);
    const c = ratingOf(own(given, CHECK_IN_QUESTION_IDS.confident));
    if (c !== null) confident.push(c);
    const reading = own(given, CHECK_IN_QUESTION_IDS.reading);
    if (reading && reading.type === "choice" && (reading.optionId === READING_OPTIONS.most || reading.optionId === READING_OPTIONS.all)) readMost += 1;
    const picked = own(given, CHECK_IN_QUESTION_IDS.unclear);
    if (picked && picked.type === "choices") {
      for (const id of new Set(picked.optionIds)) {
        if (id === UNCLEAR_NOTHING) continue;
        named.set(id, (named.get(id) ?? 0) + 1);
      }
    }
  }
  const labels = new Map((unclear?.options ?? []).map((option) => [option.id, option.label]));
  const order = (unclear?.options ?? []).map((option) => option.id);
  const counts: UnclearCount[] = [...named.entries()]
    .filter(([id]) => labels.has(id))
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([id, count]) => ({ label: labels.get(id) ?? "", count }));
  return {
    answered: answers.length,
    of,
    useful: meanOf(useful),
    confident: meanOf(confident),
    readMost: asksReading ? readMost : null,
    unclear: counts,
  };
}

/**
 * What a group's facilitators may be shown of one of its check-ins: while it
 * is open, the count alone; once closed, the totals from `TOTALS_FROM`
 * answers, and below that the count and that there are too few. The answers
 * are counted here and never leave: what is handed back holds numbers and
 * the options' own words, never a comment, an id or a row per person.
 */
export type FacilitatorCount =
  | { state: "open"; answered: number; of: number }
  | { state: "closed"; answered: number; of: number; totals: TotalsFacts | null };

export function facilitatorCount(
  state: "open" | "closed",
  items: readonly SurveyItem[],
  answers: readonly CheckInAnswers[],
  of: number,
): FacilitatorCount {
  if (state === "open") return { state, answered: answers.length, of };
  return { state, answered: answers.length, of, totals: answers.length >= TOTALS_FROM ? totalsOf(items, answers, of) : null };
}
