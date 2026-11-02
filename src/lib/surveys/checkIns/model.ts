import { own } from "@/lib/applications/keys";
import { londonWallClockToInstant } from "@/lib/courses/weekPlan";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { SurveyAnswer, SurveyChoiceQuestion, SurveyItem } from "../items";
import { surveyQuestionsOf } from "../items";
import { meanOf, surveyResults } from "../results";
import { CHECK_IN_QUESTION_IDS, READING_OPTIONS, UNCLEAR_NOTHING } from "./template";
import type { TotalsFacts, UnclearCount } from "./words";

/**
 * THE CHECK-IN'S RULES, pure: when one can be opened and when it closes, who
 * it is for, and what a group's facilitators and the programme's lead may see
 * of it. The routes, the register and the Surveys tab read these; nothing here
 * reads a database or a clock.
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
 *  - WHAT FACILITATORS SEE (`facilitatorCount`). While it is open, how many
 *    have sent it out of how many it is for, never who. Once it has closed,
 *    its totals, and only from three answers, so a small group's answers are
 *    never read one by one. Never a comment, never who said what.
 *  - WHAT THE LEAD SEES (`leadWeekOf`). A week, never a group: nothing until
 *    every group's check-in that week has closed and none can still be opened
 *    (`weekIsWhole`) and the week's check-ins have been fixed (`./weeks.ts`),
 *    then every group's answers together, totals from three answers and
 *    comments from five, the comments in the order of their words.
 *  - ONE COUNT. Both readings count answers through `tallyOf`.
 */

/** A check-in closes at this London wall-clock time on its session's day, at the earliest. */
export const CLOSES_AT_CLOCK = "23:00";

/** And never sooner than this after its session ends. */
export const CLOSES_AFTER_END_MS = 60 * 60 * 1000;

/** The register's marks that say somebody was there. */
export const HERE_STATUSES: readonly AttendanceStatus[] = ["present", "late", "left-early"];

/**
 * THE FLOORS, on the server. A group's facilitators see a closed check-in's
 * totals from three answers (`facilitatorCount`). The programme's lead reads a
 * whole week, never a group's, and sees its totals from three answers and its
 * comments from five (`leadWeekOf`).
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

/** One check-in's answers with the questions they were asked: its own copy of the week. */
export type CheckInSet = { items: readonly SurveyItem[]; answers: readonly CheckInAnswers[] };

/** One option named unclear: its id (a part of the week keeps its id in every group's copy), its words and how many named it. */
export type UnclearTally = { id: string; label: string; count: number };

/**
 * What some check-ins' answers count to, before any floor: how many answers,
 * the average of how useful and how confident, how many answered the reading
 * question (their check-in asked it) and how many of them said most or all,
 * and each option named unclear with how many named it, most first, then in
 * the order the questions list them ("Nothing was unclear" is never one). An
 * option counts only among the answers of a check-in that offered it, and a
 * part is one part across groups by its id, worded as the first check-in that
 * offers it words it. Never a comment and never who: the short answers are not
 * read here at all.
 */
export type CheckInTally = {
  answered: number;
  useful: number | null;
  confident: number | null;
  readOf: number;
  readMost: number;
  unclear: UnclearTally[];
};

/**
 * THE ONE COUNT OF CHECK-IN ANSWERS: a group's facilitators' totals are this
 * over one check-in (`totalsOf`), and the programme's lead's week is this over
 * every check-in of the week (`leadWeekOf`), so the two can never count an
 * answer two ways.
 */
export function tallyOf(sets: readonly CheckInSet[]): CheckInTally {
  const useful: number[] = [];
  const confident: number[] = [];
  let answered = 0;
  let readOf = 0;
  let readMost = 0;
  const named = new Map<string, number>();
  const labels = new Map<string, string>();
  const order: string[] = [];
  for (const { items, answers } of sets) {
    const questions = surveyQuestionsOf(items);
    const unclear = questions.find((question) => question.id === CHECK_IN_QUESTION_IDS.unclear) as SurveyChoiceQuestion | undefined;
    const offered = new Set<string>();
    for (const option of unclear?.options ?? []) {
      offered.add(option.id);
      if (labels.has(option.id)) continue;
      labels.set(option.id, option.label);
      order.push(option.id);
    }
    for (const { answers: given } of answers) {
      answered += 1;
      const u = ratingOf(own(given, CHECK_IN_QUESTION_IDS.useful));
      if (u !== null) useful.push(u);
      const c = ratingOf(own(given, CHECK_IN_QUESTION_IDS.confident));
      if (c !== null) confident.push(c);
      const reading = own(given, CHECK_IN_QUESTION_IDS.reading);
      if (reading && reading.type === "choice") {
        readOf += 1;
        if (reading.optionId === READING_OPTIONS.most || reading.optionId === READING_OPTIONS.all) readMost += 1;
      }
      const picked = own(given, CHECK_IN_QUESTION_IDS.unclear);
      if (picked && picked.type === "choices") {
        for (const id of new Set(picked.optionIds)) {
          if (id === UNCLEAR_NOTHING || !offered.has(id)) continue;
          named.set(id, (named.get(id) ?? 0) + 1);
        }
      }
    }
  }
  const unclear: UnclearTally[] = [...named.entries()]
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([id, count]) => ({ id, label: labels.get(id) ?? "", count }));
  return { answered, useful: meanOf(useful), confident: meanOf(confident), readOf, readMost, unclear };
}

/**
 * A check-in's totals, counted from its answers (`tallyOf`, over this one
 * check-in): the average of how useful and how confident, how many said most
 * or all of the reading (null when the week asked nothing about reading), and
 * each part named unclear with how many named it, most first ("Nothing was
 * unclear" is never one). Never a comment and never who: the short answers
 * are not read at all.
 */
export function totalsOf(items: readonly SurveyItem[], answers: readonly CheckInAnswers[], of: number): TotalsFacts {
  const asksReading = surveyQuestionsOf(items).some((question) => question.id === CHECK_IN_QUESTION_IDS.reading);
  const tally = tallyOf([{ items, answers }]);
  const counts: UnclearCount[] = tally.unclear.map(({ label, count }) => ({ label, count }));
  return {
    answered: tally.answered,
    of,
    useful: tally.useful,
    confident: tally.confident,
    readMost: asksReading ? tally.readMost : null,
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

// ---------------------------------------------------------------------------
// What the programme's lead sees: a whole week, every group's answers together
// ---------------------------------------------------------------------------

/** A session of one of the run's groups, as a week's check-ins wait on it. */
export type WeekSession = { weekNumber: number; cancelled: boolean; dateKey: string; startsAt: Date | null; endsAt: Date | null };

/** One of the programme's check-ins, as a week waits on it. */
export type WeekCheckIn = { weekNumber: number; open: boolean };

/**
 * WHETHER A WEEK'S CHECK-INS ARE ALL IN at `now`: none of the week's is open,
 * and none can still be opened, because every session of the week that can
 * have one (dated, and not called off) is past its check-in window. Only then
 * does the lead read the week, all of it at once, so no group's answers can be
 * had by reading the week before and after that group's check-in closed. The
 * first tick at which a week that has begun is whole fixes its check-ins
 * (`freezeWholeWeeks` in `./weeks.ts`), and the lead reads that week from then
 * on, whatever its sessions do afterwards.
 */
export function weekIsWhole(weekNumber: number, sessions: readonly WeekSession[], checkIns: readonly WeekCheckIn[], now: Date): boolean {
  for (const session of sessions) {
    if (session.weekNumber !== weekNumber || session.cancelled) continue;
    const window = checkInWindow(session);
    if (window && windowState(window, now) !== "past") return false;
  }
  return !checkIns.some((checkIn) => checkIn.weekNumber === weekNumber && checkIn.open);
}

/** Whether a week has begun: a session of it has started, or one of its check-ins exists. */
export function weekHasBegun(weekNumber: number, sessions: readonly WeekSession[], checkIns: readonly WeekCheckIn[], now: Date): boolean {
  if (checkIns.some((checkIn) => checkIn.weekNumber === weekNumber)) return true;
  return sessions.some(
    (session) => session.weekNumber === weekNumber && !session.cancelled && session.startsAt !== null && session.startsAt.getTime() <= now.getTime(),
  );
}

/** A week's totals as its lead reads them: every group's answers together, never a group's alone. */
export type LeadWeekTotals = {
  useful: number | null;
  confident: number | null;
  /** Of the answers to the reading question, how many said most or all; null when fewer than `TOTALS_FROM` answered it. */
  reading: { most: number; of: number } | null;
  unclear: UnclearTally[];
};

/** One written question of the week's check-ins, every group's comments together, in the order of their words. */
export type LeadWeekComments = { id: string; title: string; comments: string[] };

/**
 * One week of a programme's check-ins as its lead reads it.
 *  - `waiting`: the week's check-ins are not fixed yet: one is open, one can
 *    still be opened, or the job has not reached the week since it was whole.
 *  - `none`: the week was fixed, and no group had opened one.
 *  - `too-few`: fewer than `TOTALS_FROM` answers in the whole week.
 *  - `shown`: the totals, and the comments from `COMMENTS_FROM` answers.
 * How many answered of how many the week's check-ins reached travels with the
 * last two; nothing in any of them is a group's, a person's or an answer's own.
 */
export type LeadCheckInWeek =
  | { weekNumber: number; state: "waiting" }
  | { weekNumber: number; state: "none" }
  | { weekNumber: number; state: "too-few"; answered: number; of: number }
  | { weekNumber: number; state: "shown"; answered: number; of: number; totals: LeadWeekTotals; comments: LeadWeekComments[] | null };

/** The check-in's written questions, in the order it asks them. */
const WRITTEN_IDS: readonly string[] = [CHECK_IN_QUESTION_IDS.most, CHECK_IN_QUESTION_IDS.better];

/**
 * The week's comments, question by question: each check-in's own, as its
 * Results list them (`surveyResults`, which leaves out an empty answer), put
 * together and listed by their words, so their order says nothing of which
 * group, or who, wrote each.
 */
function commentsOf(sets: readonly CheckInSet[]): LeadWeekComments[] {
  const out = WRITTEN_IDS.map((id): LeadWeekComments => ({ id, title: "", comments: [] }));
  for (const { items, answers } of sets) {
    for (const result of surveyResults(items, answers)) {
      const entry = result.kind === "comments" ? out.find((each) => each.id === result.id) : undefined;
      if (!entry || result.kind !== "comments") continue;
      if (!entry.title) entry.title = result.title;
      entry.comments.push(...result.comments);
    }
  }
  return out
    .filter((entry) => entry.title !== "")
    .map((entry) => ({ ...entry, comments: [...entry.comments].sort((a, b) => a.localeCompare(b, "en-GB")) }));
}

/**
 * THE LEAD'S WEEK, with its floors: nothing while it is not whole, which for
 * the lead means not fixed yet (`weekIsWhole` at a tick, then `./weeks.ts`),
 * and then its totals from `TOTALS_FROM` answers and its comments from
 * `COMMENTS_FROM`, every check-in the week was fixed with together
 * (`tallyOf`). A share of a smaller slice than the week (the reading question,
 * asked only where the week had something to read) shows from `TOTALS_FROM`
 * answers to it too. `of` beside each check-in is how many it reached.
 */
export function leadWeekOf(weekNumber: number, whole: boolean, sets: readonly (CheckInSet & { of: number })[]): LeadCheckInWeek {
  if (!whole) return { weekNumber, state: "waiting" };
  if (sets.length === 0) return { weekNumber, state: "none" };
  const tally = tallyOf(sets);
  const of = sets.reduce((sum, set) => sum + set.of, 0);
  if (tally.answered < TOTALS_FROM) return { weekNumber, state: "too-few", answered: tally.answered, of };
  return {
    weekNumber,
    state: "shown",
    answered: tally.answered,
    of,
    totals: {
      useful: tally.useful,
      confident: tally.confident,
      reading: tally.readOf >= TOTALS_FROM ? { most: tally.readMost, of: tally.readOf } : null,
      unclear: tally.unclear,
    },
    comments: tally.answered >= COMMENTS_FROM ? commentsOf(sets) : null,
  };
}
