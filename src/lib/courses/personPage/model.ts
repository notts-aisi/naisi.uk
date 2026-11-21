import { cellStateWords } from "@/lib/courses/coursework/words";
import { cellStateOf, workKey, type CourseworkCell, type CourseworkWeek, type PersonWork } from "@/lib/courses/coursework/model";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { PersonEventsView } from "@/lib/events/attendanceWords";
import { emailStateWords } from "@/lib/courses/feedback/words";
import type { FeedbackDelivery } from "@/lib/firestore/courseFeedback";
import {
  ANSWER_STARTED,
  COMING_CHIP,
  DID_NOT_HAPPEN,
  IN_THE_ROOM,
  NOT_MARKED,
  NOT_RATED,
  NOT_SENT,
  NOT_WRITTEN,
  ONLINE,
  STILL_TO_COME,
  activityWhenWords,
  elsewhereWords,
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
  TOLD_THEIR_GROUP,
  VISITS_TO_ANOTHER_GROUP,
  VISIT_CHIP,
  atSessionWords,
  batchSentByWords,
  comingWords,
  visitDueWords,
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
  /** "Due at Group F, Thu 5 Nov, 5pm: a visit" for a week of a one-week visit that stands; null otherwise. */
  visit: string | null;
  /** "Rahul, Sat 7 Nov · Emailed Sun 8 Nov", one per piece on the week, oldest first. */
  feedback: string[];
  /** The reading view of that week, for a reader its own gate admits; null otherwise. */
  readHref: string | null;
  readLabel: string;
};

/**
 * One piece of feedback, as who wrote it, about what and when, and what
 * became of its email. Never its words. Feedback given before pieces existed
 * (`legacy`, on the answer's own row) was emailed when it was given.
 */
export type FeedbackFact = {
  id: string;
  weekNumber: number;
  on: "writtenAnswer" | "week";
  byName: string;
  createdAt: Date | null;
  emailedAt: Date | null;
  /** What became of its email, beside `emailedAt`: handed over, held by this copy of the site, or stopped by the do-not-email list. */
  delivery: FeedbackDelivery | null;
  /** A press is sending its email now. */
  sending: boolean;
  legacy: boolean;
  /**
   * Who pressed Send on the batch its email went in, by first name
   * (`emailedByUid`), handed only where the reader may see it. Absent with
   * none on record, and for feedback given before pieces existed.
   */
  sentBy?: string;
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
  /** The person's first name, for what became of each piece's email. */
  firstName: string;
  readHref: string | null;
  /** The host group's name, for a week of a one-week visit that stands; null or absent otherwise. */
  visitHost?: string | null;
  now: Date;
};

function latest(dates: ReadonlyArray<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const at of dates) if (at && (!out || at.getTime() > out.getTime())) out = at;
  return out;
}

/** What became of a piece's email, as it was handed over: the reading view's own facts. */
function emailedOf(piece: FeedbackFact): { at: string | null; delivery: FeedbackDelivery } | null {
  if (piece.legacy) return { at: piece.emailedAt ? piece.emailedAt.toISOString() : null, delivery: "sent" };
  return piece.emailedAt ? { at: piece.emailedAt.toISOString(), delivery: piece.delivery ?? "sent" } : null;
}

/** Whether a piece's email really went: emailed, and neither held nor stopped. */
export function wasEmailed(piece: FeedbackFact): boolean {
  return emailedOf(piece)?.delivery === "sent";
}

/**
 * The line of one piece of feedback in the table and in the Feedback section:
 * who and when, then what became of its email in the reading view's own words
 * (`emailStateWords`), so a piece stopped by the do-not-email list is never
 * called emailed. `firstName` is the person's, as the reading view names them.
 */
export function feedbackLineOf(piece: FeedbackFact, firstName: string): string {
  const state = emailStateWords(firstName, emailedOf(piece), piece.sending);
  // Who sent the batch, only on an email that went and only where it is on record.
  const batch = piece.sentBy && !piece.legacy && !piece.sending && wasEmailed(piece) ? ` ${batchSentByWords(piece.sentBy)}` : "";
  return `${feedbackByWords(piece.byName, piece.createdAt)} · ${state}${batch}`;
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
    visit: input.visitHost ? visitDueWords(input.visitHost, cell.due.at ? new Date(cell.due.at) : null) : null,
    feedback: input.feedback
      .filter((piece) => piece.weekNumber === n)
      .sort(byWhen)
      .map((piece) => feedbackLineOf(piece, input.firstName)),
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
  /** "Today" or "Tomorrow" for a session on one of those days, in London; null otherwise. */
  dayWord?: string | null;
  /** The name of the group whose session it is that week, where the reader is told it; null otherwise. */
  groupName?: string | null;
  /**
   * A one-week visit that stands, to a session that is happening: the
   * session is the host's. A visit called off, or whose session was called
   * off, is no visit here.
   */
  visit?: boolean;
};

/**
 * One count on the attendance card. A list of counts, each with its key, so a
 * count can be added beside these two (visits to another group, once a visit
 * exists) without anything else changing. Never an allowance, never a number
 * of sessions anybody may still miss, never anything read as a threshold.
 */
export type AttendanceCount = { key: "room" | "online" | "visits"; label: string; value: number };

export type AttendanceView = {
  counts: AttendanceCount[];
  /**
   * "Week 1 · Thu 5 Nov" and what the register says, one per week that has
   * anything to say, with its chips ("Visit", "Coming").
   */
  lines: Array<{ weekNumber: number; when: string; said: string; chips: string[] }>;
  /** No register has marked them yet. */
  empty: boolean;
};

const CAME: ReadonlySet<AttendanceStatus> = new Set(["present", "late", "left-early"]);

/** What one week's line says from the register alone, in words, or null for a week with nothing to say. */
function registerSaid(fact: AttendanceWeekFact): string | null {
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

/** "In the room" as it reads after a comma: "in the room". */
function lowerFirst(words: string): string {
  return words ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

/**
 * One week's line and its chips. `coming`: a session still to come reads
 * "Tomorrow, with Group C" with the chip "Coming" (the team's page); without
 * it, "Still to come". A visit's week names the host's session.
 */
function attendanceLine(fact: AttendanceWeekFact, toCome: boolean, coming: boolean): { said: string; chips: string[] } | null {
  const visit = fact.visit === true && !!fact.groupName;
  if (toCome) {
    if (coming && fact.groupName) return { said: comingWords(fact.dayWord ?? null, fact.groupName), chips: visit ? [COMING_CHIP, VISIT_CHIP] : [COMING_CHIP] };
    return visit ? { said: atSessionWords(fact.groupName as string, lowerFirst(STILL_TO_COME)), chips: [VISIT_CHIP] } : { said: STILL_TO_COME, chips: [] };
  }
  const said = registerSaid(fact);
  if (!said) return null;
  return visit ? { said: atSessionWords(fact.groupName as string, lowerFirst(said)), chips: [VISIT_CHIP] } : { said, chips: [] };
}

/**
 * The attendance card. `counted`, when handed, is the one record's own two
 * counts (`came` less `online`, and `online`): the team's page passes them
 * as the record has them. A facilitator's cut counts only the weeks they were
 * in that facilitator's group, so it hands none and the counts are made from
 * the weeks it is handed, by the record's own rule (a mark that says they
 * came, on a session that has happened).
 */
export function attendanceViewOf(
  weeks: readonly AttendanceWeekFact[],
  counted?: { came: number; online: number },
  options: { coming?: boolean } = {},
): AttendanceView {
  let came = 0;
  let online = 0;
  // Visits to another group: the visits' sessions they came to, off the host's register. Counted inside the two counts too.
  let visits = 0;
  for (const fact of weeks) {
    if (fact.state !== "mark" || !fact.mark || !fact.happened || !CAME.has(fact.mark)) continue;
    came += 1;
    if (fact.online) online += 1;
    if (fact.visit) visits += 1;
  }
  const totals = counted ?? { came, online };
  // Of the sessions still to come, only the next is said: nothing reads as a count of what is left.
  const toCome = (fact: AttendanceWeekFact) => (fact.state === "not-yet" || fact.state === "today") && !fact.happened;
  const next = weeks.find(toCome)?.weekNumber ?? null;
  const lines = weeks.flatMap((fact) => {
    if (toCome(fact) && fact.weekNumber !== next) return [];
    const line = attendanceLine(fact, toCome(fact), options.coming === true);
    return line ? [{ weekNumber: fact.weekNumber, when: weekLineWords(fact.weekNumber, fact.dateLabel), ...line }] : [];
  });
  return {
    counts: [
      { key: "room", label: IN_THE_ROOM, value: Math.max(0, totals.came - totals.online) },
      { key: "online", label: ONLINE, value: totals.online },
      { key: "visits", label: VISITS_TO_ANOTHER_GROUP, value: visits },
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
export function feedbackLinesOf(pieces: readonly FeedbackFact[], firstName: string): FeedbackLine[] {
  return [...pieces].sort(byWhen).map((piece) => ({ id: piece.id, on: feedbackOnWords(piece.weekNumber, piece.on), line: feedbackLineOf(piece, firstName) }));
}

/** How many activity lines are drawn. */
export const ACTIVITY_SHOWN = 12;

/** One line of Activity: when, what, and for a History row, who did it as the row kept their name. */
export type ActivityLine = { at: string; when: string; said: string; who?: string };

/** A History row a one-week visit wrote about the person, as the row says it. */
export type VisitHistoryFact = { at: Date; who: string; said: string };

/**
 * ACTIVITY, made only of records that already exist and that the page has
 * read for its other sections: when Publish told them their group, the last
 * save of each week's reflections, each written answer's first send, and
 * each email of feedback. Newest first, the first `ACTIVITY_SHOWN`. Nothing
 * here is recorded for this page.
 */
export function activityOf(input: {
  /** When Publish's email about their group went, only where it was handed over (never held or stopped); null otherwise. */
  toldAt: Date | null;
  work: PersonWork;
  weeks: ReadonlyArray<{ weekNumber: number; week: CourseworkWeek | null }>;
  feedback: readonly FeedbackFact[];
  /** The History rows one-week visits wrote about them (arranged, called off), in their own words. */
  history?: readonly VisitHistoryFact[];
}): ActivityLine[] {
  const out: Array<{ at: Date; said: string; who?: string }> = [];
  // Never a group's name: a move keeps the day Publish first told them, so the group they are in now may not be the one it named.
  if (input.toldAt) out.push({ at: input.toldAt, said: TOLD_THEIR_GROUP });
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
    // Only an email that went: one held, or stopped by the do-not-email list, is no email.
    if (!piece.emailedAt || !wasEmailed(piece)) continue;
    emailed.set(`${piece.weekNumber} ${piece.emailedAt.getTime()}`, { at: piece.emailedAt, weekNumber: piece.weekNumber });
  }
  for (const { at, weekNumber } of emailed.values()) out.push({ at, said: feedbackEmailedWords(weekNumber) });
  for (const row of input.history ?? []) out.push({ at: row.at, said: row.said, ...(row.who ? { who: row.who } : {}) });
  return out
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.said.localeCompare(b.said))
    .slice(0, ACTIVITY_SHOWN)
    .map(({ at, said, who }) => ({ at: at.toISOString(), when: activityWhenWords(at), said, ...(who ? { who } : {}) }));
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
  /** "Group C · Wednesdays at 3pm", or "Not in a group yet"; null for somebody the Coursework tab has no row for (somebody who left). */
  group: string | null;
  /** Where their place stands, in the People tab's words; null where the reader has no People tab. */
  status: string | null;
  notTold: boolean;
};

/** "Goes by Kwame" and "Joined Sep 2026", for the team. */
export type PersonAbout = {
  /** The name they go by, or null with none on their account. */
  goesBy: string | null;
  /** "Sep 2026": the month their account was approved as a member, or made where no approval is on record; null with neither. */
  joined: string | null;
};

/**
 * THE TEAM'S PAGE. Every optional key is ABSENT for a reader who may not see
 * that section (and every one but the head and attendance for somebody the
 * Coursework tab has no row for): `ratings` (an admin, and the programme's lead while they
 * stand, never about themselves), `notes` (who reads notes about a person
 * today, never about themselves), `application` (whoever may open it),
 * `move` (as the People tab offers it), `events` and `activity` (an admin's
 * alone).
 */
export type TeamPersonView = {
  reader: "admin" | "lead";
  uid: string;
  header: PersonHeader;
  /** The name they go by and when they joined. */
  about?: PersonAbout;
  /** Their account's address: an admin's alone, absent for anybody else. */
  email?: string;
  back: { label: string; href: string };
  /** Absent, with `feedback`, for somebody the Coursework tab has no row for (somebody who left): the reading view refuses them. */
  weeks?: PersonWeekRow[];
  ratings?: Array<{ weekNumber: number; lines: string[] }>;
  attendance: AttendanceView;
  feedback?: FeedbackLine[];
  notes?: { runId: string; firstName: string; lead: { roundId: string; programmeId: string } | null };
  /** Their application, for whoever may open it: the link, and its line ("Ranked AGI Strategy first. Accepted Wed 28 Oct."), or null with nothing to say. */
  application?: { href: string; label: string; line: string | null };
  move?: { href: string; label: string };
  /** A one-week visit to another group's session, offered exactly where Move is. */
  visit?: { href: string; label: string };
  events?: PersonEventsView;
  /** "Signed up to 3 this term. Came to 1 of the 2 that are over ...": an admin's alone, beside the events. */
  signedUp?: string;
  activity?: ActivityLine[];
};

/** THE FACILITATOR'S CUT: their group's weeks of the person, and the feedback this facilitator wrote. */
export type FacilitatorPersonView = {
  uid: string;
  header: Omit<PersonHeader, "status" | "notTold" | "group"> & { group: string };
  back: { label: string; href: string };
  weeks: PersonWeekRow[];
  /** "Weeks 1 and 2 were with another group.", or null. Never which group. */
  elsewhere: string | null;
  attendance: AttendanceView;
  feedback: FeedbackLine[];
};
