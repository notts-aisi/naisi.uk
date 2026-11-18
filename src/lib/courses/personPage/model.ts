import { cellStateWords } from "@/lib/courses/coursework/words";
import { cellStateOf, workKey, type CourseworkCell, type CourseworkWeek, type PersonWork } from "@/lib/courses/coursework/model";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { PersonEventsView } from "@/lib/events/attendanceWords";
import {
  ANSWER_STARTED,
  DID_NOT_HAPPEN,
  IN_THE_ROOM,
  NONE_ASKED,
  NOT_MARKED,
  NOT_RATED,
  NOT_SENT,
  NOT_WRITTEN,
  ONLINE,
  STILL_TO_COME,
  activityWhenWords,
  elsewhereWords,
  emailedWords,
  feedbackByWords,
  feedbackEmailedWords,
  feedbackOnWords,
  ratingWords,
  readWeekWords,
  readingsWords,
  savedReflectionWords,
  savedWords,
  sentAnswerWords,
  sentWords,
  toldGroupWords,
  weekLineWords,
} from "./words";

/**
 * A PERSON'S PAGE, AS PURE FUNCTIONS (Wed 18 Nov 2026): one person on a
 * programme, for the team (an admin and the programme's lead), and a
 * facilitator's cut of it. The loaders (`./load.ts`) read, ask every gate and
 * hand over only what the reader may see; these functions decide nothing
 * about who may see what. They turn what they are handed into words, and
 * leave out a section they are not handed: a key absent from the input is
 * absent from the view, never blank.
 *
 * No words anybody wrote reach these functions: the coursework is handed as
 * counts, states and times (`PersonWork` read with nobody's words), feedback
 * as who and when, ratings as the number and who.
 */

// ---------------------------------------------------------------------------
// Coursework, week by week
// ---------------------------------------------------------------------------

/** One week of the coursework table. Every value is words, ready to draw. */
export type PersonWeekRow = {
  weekNumber: number;
  title: string;
  /** "Done on time", "Started", "Opens Thu 12 Nov" (`cellStateWords`). */
  state: string;
  done: boolean;
  /** Whether the week has begun for them: a week still to open draws its state alone. */
  open: boolean;
  /** "2 of 3", or null for a week with nothing to tick. */
  readings: string | null;
  /** "Saved Mon 9 Nov, 9:02pm", "Not written", or null for a week that asks for none. */
  reflection: string | null;
  /** "Sent Thu 5 Nov, 2:02pm · late", "Started, not sent", "Not sent", or null for a week that asks for none. */
  answer: string | null;
  /** "Rahul, Sat 7 Nov · Emailed Sun 8 Nov", one per piece on the week, oldest first. */
  feedback: string[];
  /** The reading view of that week, for a reader its own gate admits; null otherwise. */
  readHref: string | null;
  readLabel: string;
};

/** One piece of feedback, as who wrote it, about what and when, and its email. Never its words. */
export type FeedbackFact = {
  id: string;
  weekNumber: number;
  on: "writtenAnswer" | "week";
  byName: string;
  createdAt: Date | null;
  emailedAt: Date | null;
};

/** One rating for the team, as its number and who gave it. Never its comment. */
export type RatingFact = { weekNumber: number; rating: number; byName: string };

export type CourseworkRowInput = {
  column: { weekNumber: number; title: string };
  cell: CourseworkCell;
  /** The copy of the week they worked in (`readsGroupIdFor`), or null. */
  week: CourseworkWeek | null;
  work: PersonWork;
  feedback: readonly FeedbackFact[];
  readHref: string | null;
  now: Date;
};

function latest(dates: ReadonlyArray<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const at of dates) if (at && (!out || at.getTime() > out.getTime())) out = at;
  return out;
}

/** The line of one piece of feedback in the table and in the Feedback section. */
export function feedbackLineOf(piece: FeedbackFact): string {
  return `${feedbackByWords(piece.byName, piece.createdAt)} · ${emailedWords(piece.emailedAt)}`;
}

const byWhen = (a: FeedbackFact, b: FeedbackFact) =>
  a.weekNumber - b.weekNumber || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id);

/** One week's row, from the cell the Coursework tab draws and the facts behind it. */
export function weekRowOf(input: CourseworkRowInput): PersonWeekRow {
  const { column, cell, week, work, now } = input;
  const n = column.weekNumber;
  const state = cellStateOf(cell, now);
  const open = state !== "opens";
  const prompts = week ? week.parts.flatMap((part) => part.prompts) : [];
  const written = prompts.filter((prompt) => work.reflections.has(workKey(n, prompt.id)));
  const reflection =
    prompts.length === 0
      ? null
      : written.length === 0
        ? NOT_WRITTEN
        : (() => {
            const at = latest(written.map((prompt) => work.savedAt?.get(workKey(n, prompt.id)) ?? null));
            return at ? savedWords(at) : readingsWords(written.length, prompts.length);
          })();
  let answer: string | null = null;
  if (week?.answer) {
    const facts = work.answerFacts?.get(workKey(n, week.answer.id)) ?? null;
    if (facts?.firstSentAt) answer = sentWords(facts.firstSentAt, facts.sentLateMs !== null);
    else answer = cell.answer && cell.answer.state !== "not-started" ? ANSWER_STARTED : NOT_SENT;
  }
  return {
    weekNumber: n,
    title: column.title,
    state: cellStateWords(state, cell.opensOn),
    done: cell.done === true,
    open,
    readings: cell.ticks && cell.ticks.of > 0 ? readingsWords(cell.ticks.ticked, cell.ticks.of) : null,
    reflection,
    answer,
    feedback: input.feedback
      .filter((piece) => piece.weekNumber === n)
      .sort(byWhen)
      .map(feedbackLineOf),
    readHref: input.readHref,
    readLabel: readWeekWords(n),
  };
}

/**
 * The team's rating column, week by week: every rating on the week's written
 * answer, oldest rater first by name, or "Not rated". Built only from what a
 * loader that asked `readsWorkRatings` hands over.
 */
export function ratingColumnOf(weeks: readonly number[], ratings: readonly RatingFact[]): Array<{ weekNumber: number; lines: string[] }> {
  return weeks.map((weekNumber) => {
    const lines = ratings
      .filter((rating) => rating.weekNumber === weekNumber)
      .sort((a, b) => a.byName.localeCompare(b.byName, "en-GB"))
      .map((rating) => ratingWords(rating.rating, rating.byName));
    return { weekNumber, lines: lines.length > 0 ? lines : [NOT_RATED] };
  });
}

/** Whether a week asks for a reflection, used to say "None this week" in a narrow cell. */
export function noneAsked(value: string | null): string {
  return value ?? NONE_ASKED;
}

// ---------------------------------------------------------------------------
// Attendance, as counts only
// ---------------------------------------------------------------------------

/**
 * One week of a person's attendance as the one record reads it
 * (`buildRunAttendance`'s row for them, each week off the register of the
 * group they were in that week): the grid's own state and mark.
 */
export type AttendanceWeekFact = {
  weekNumber: number;
  state: "mark" | "not-yet" | "today" | "not-held" | "before" | "after" | "none";
  mark: AttendanceStatus | null;
  online: boolean;
  /** The session's day, "Thu 5 Nov", or null with none dated. */
  dateLabel: string | null;
  /** The session has happened: it counts towards what they came to. */
  happened: boolean;
};

/**
 * One count on the attendance card. A list of counts, each with its key, so a
 * count can be added beside these two (visits to another group, once a visit
 * exists) without anything else changing. Never an allowance, never a number
 * of sessions anybody may still miss, never anything read as a threshold.
 */
export type AttendanceCount = { key: "room" | "online"; label: string; value: number };

export type AttendanceView = {
  counts: AttendanceCount[];
  /** "Week 1 · Thu 5 Nov" and what the register says, one per week that has anything to say. */
  lines: Array<{ weekNumber: number; when: string; said: string }>;
  /** No register has marked them yet. */
  empty: boolean;
};

const CAME: ReadonlySet<AttendanceStatus> = new Set(["present", "late", "left-early"]);

/** What one week's line says, in words, or null for a week with nothing to say. */
function attendanceSaid(fact: AttendanceWeekFact): string | null {
  switch (fact.state) {
    case "mark": {
      if (!fact.mark) return null;
      const word = ATTENDANCE_STATUS_LABEL[fact.mark];
      if (!CAME.has(fact.mark)) return word;
      return fact.mark === "present" ? (fact.online ? ONLINE : IN_THE_ROOM) : `${word}, ${fact.online ? ONLINE.toLowerCase() : IN_THE_ROOM.toLowerCase()}`;
    }
    case "not-held":
      return DID_NOT_HAPPEN;
    case "not-yet":
    case "today":
      return fact.happened ? NOT_MARKED : STILL_TO_COME;
    default:
      return null;
  }
}

/**
 * The attendance card. `counted`, when handed, is the one record's own two
 * counts (`came` less `online`, and `online`): the team's page passes them
 * as the record has them. A facilitator's cut counts only the weeks they were
 * in that facilitator's group, so it hands none and the counts are made from
 * the weeks it is handed, by the record's own rule (a mark that says they
 * came, on a session that has happened).
 */
export function attendanceViewOf(weeks: readonly AttendanceWeekFact[], counted?: { came: number; online: number }): AttendanceView {
  let came = 0;
  let online = 0;
  for (const fact of weeks) {
    if (fact.state !== "mark" || !fact.mark || !fact.happened || !CAME.has(fact.mark)) continue;
    came += 1;
    if (fact.online) online += 1;
  }
  const totals = counted ?? { came, online };
  // Of the sessions still to come, only the next is said: nothing reads as a count of what is left.
  const toCome = (fact: AttendanceWeekFact) => (fact.state === "not-yet" || fact.state === "today") && !fact.happened;
  const next = weeks.find(toCome)?.weekNumber ?? null;
  const lines = weeks.flatMap((fact) => {
    if (toCome(fact) && fact.weekNumber !== next) return [];
    const said = attendanceSaid(fact);
    return said ? [{ weekNumber: fact.weekNumber, when: weekLineWords(fact.weekNumber, fact.dateLabel), said }] : [];
  });
  return {
    counts: [
      { key: "room", label: IN_THE_ROOM, value: Math.max(0, totals.came - totals.online) },
      { key: "online", label: ONLINE, value: totals.online },
    ],
    lines,
    empty: !weeks.some((fact) => fact.state === "mark"),
  };
}

// ---------------------------------------------------------------------------
// Feedback, and activity
// ---------------------------------------------------------------------------

export type FeedbackLine = { id: string; on: string; line: string };

/** The Feedback section: every piece handed, by week and then when it was written. */
export function feedbackLinesOf(pieces: readonly FeedbackFact[]): FeedbackLine[] {
  return [...pieces].sort(byWhen).map((piece) => ({ id: piece.id, on: feedbackOnWords(piece.weekNumber, piece.on), line: feedbackLineOf(piece) }));
}

/** How many activity lines are drawn. */
export const ACTIVITY_SHOWN = 12;

export type ActivityLine = { at: string; when: string; said: string };

/**
 * ACTIVITY, made only of records that already exist and that the page has
 * read for its other sections: when Publish told them their group, the last
 * save of each week's reflections, each written answer's first send, and
 * each email of feedback. Newest first, the first `ACTIVITY_SHOWN`. Nothing
 * here is recorded for this page.
 */
export function activityOf(input: {
  toldAt: Date | null;
  toldGroup: string | null;
  work: PersonWork;
  weeks: ReadonlyArray<{ weekNumber: number; week: CourseworkWeek | null }>;
  feedback: readonly FeedbackFact[];
}): ActivityLine[] {
  const out: Array<{ at: Date; said: string }> = [];
  if (input.toldAt) out.push({ at: input.toldAt, said: toldGroupWords(input.toldGroup) });
  for (const { weekNumber, week } of input.weeks) {
    if (!week) continue;
    const saved = latest(
      week.parts
        .flatMap((part) => part.prompts)
        .filter((prompt) => input.work.reflections.has(workKey(weekNumber, prompt.id)))
        .map((prompt) => input.work.savedAt?.get(workKey(weekNumber, prompt.id)) ?? null),
    );
    if (saved) out.push({ at: saved, said: savedReflectionWords(weekNumber) });
    const sent = week.answer ? (input.work.answerFacts?.get(workKey(weekNumber, week.answer.id))?.firstSentAt ?? null) : null;
    if (sent) out.push({ at: sent, said: sentAnswerWords(weekNumber) });
  }
  // One line per email of feedback on a week, however many pieces it carried.
  const emailed = new Map<string, { at: Date; weekNumber: number }>();
  for (const piece of input.feedback) {
    if (!piece.emailedAt) continue;
    emailed.set(`${piece.weekNumber} ${piece.emailedAt.getTime()}`, { at: piece.emailedAt, weekNumber: piece.weekNumber });
  }
  for (const { at, weekNumber } of emailed.values()) out.push({ at, said: feedbackEmailedWords(weekNumber) });
  return out
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.said.localeCompare(b.said))
    .slice(0, ACTIVITY_SHOWN)
    .map(({ at, said }) => ({ at: at.toISOString(), when: activityWhenWords(at), said }));
}

/** The facilitator's line about the weeks spent elsewhere, or null. */
export function elsewhereLineOf(weeks: readonly number[]): string | null {
  return weeks.length > 0 ? elsewhereWords(weeks) : null;
}

// ---------------------------------------------------------------------------
// The views
// ---------------------------------------------------------------------------

/** The header both pages share. */
export type PersonHeader = {
  name: string;
  programmeName: string;
  /** "Group C · Wednesdays at 3pm", or "Not in a group yet". */
  group: string;
  /** Where their place stands, in the People tab's words; null where the reader has no People tab. */
  status: string | null;
  notTold: boolean;
};

/**
 * THE TEAM'S PAGE. Every optional key is ABSENT for a reader who may not see
 * that section: `ratings` (an admin, and the programme's lead while they
 * stand, never about themselves), `notes` (who reads notes about a person
 * today, never about themselves), `application` (whoever may open it),
 * `move` (as the People tab offers it), `events` and `activity` (an admin's
 * alone).
 */
export type TeamPersonView = {
  reader: "admin" | "lead";
  uid: string;
  header: PersonHeader;
  back: { label: string; href: string };
  weeks: PersonWeekRow[];
  ratings?: Array<{ weekNumber: number; lines: string[] }>;
  attendance: AttendanceView;
  feedback: FeedbackLine[];
  notes?: { runId: string; firstName: string; lead: { roundId: string; programmeId: string } | null };
  application?: { href: string; label: string };
  move?: { href: string; label: string };
  events?: PersonEventsView;
  activity?: ActivityLine[];
};

/** THE FACILITATOR'S CUT: their group's weeks of the person, and the feedback this facilitator wrote. */
export type FacilitatorPersonView = {
  uid: string;
  header: Omit<PersonHeader, "status" | "notTold">;
  back: { label: string; href: string };
  weeks: PersonWeekRow[];
  /** "Weeks 1 and 2 were with another group.", or null. Never which group. */
  elsewhere: string | null;
  attendance: AttendanceView;
  feedback: FeedbackLine[];
};
