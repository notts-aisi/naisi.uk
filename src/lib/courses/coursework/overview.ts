import {
  NOT_IN_A_GROUP,
  NO_FLAGS,
  cellOf,
  showKeeps,
  workKey,
  type CellFlags,
  type CellWaiting,
  type CourseworkFilter,
  type CourseworkPerson,
  type CourseworkRow,
  type CourseworkSection,
  type CourseworkWeek,
  type PersonWork,
} from "./model";
import { feedbackStateOf, readStateOf } from "./question";
import { READING_ANSWER_ANCHOR } from "./reading";
import type { WeekDue } from "@/lib/courses/weekWork/model";

/**
 * THE COURSEWORK OVERVIEW'S RULES (Fri 13 Nov 2026), pure: the rows of a
 * programme's Coursework tab with the reader's flags laid over each person's
 * week, its sections, the week it is on, and the one list of what waits for
 * the reader's feedback. No reads, no clock; the loader (`./tabLoad.ts`) has
 * asked every gate before handing anything here.
 *
 * THE FLAGS are worked out only for a reader who may read the person's work
 * (`readingOf` answers; never the reader's own row), each by the rule the page
 * of one question asks, so the two pages never disagree:
 *  - "Not read yet": something of the week its readers may read in full is
 *    unread (`readStateOf`, told against the day the site began keeping read
 *    times; with none known, nothing is unread);
 *  - "No feedback yet" and "Changed since feedback": the written answer's
 *    feedback state (`feedbackStateOf`, its change by `changedSinceFeedback`).
 */

/**
 * What a reader may read of a person's week, for the flags: handed only for a
 * reader who may read that person's work (`writtenReviewRole`, never their
 * own); `boxes` where the boxes' own gate answers too. `firstReads` is when
 * each answer of the week was first read, by answer id (the first-read
 * store's), and `keptFrom` the day the site began keeping that, or null.
 */
export type CellReading = { boxes: boolean; firstReads: ReadonlyMap<string, Date>; keptFrom: Date | null };

/** ISO 8601, or null. */
function isoOf(at: Date | null): string | null {
  return at ? at.toISOString() : null;
}

/**
 * The flags of one person's week for a reader who may read their work, and
 * the written answer when it waits for that reader's feedback: each
 * reflection and fill-in box with words (a box only where `reading.boxes`),
 * and the written answer once its readers may read it and it holds words.
 */
export function flagsOf(
  week: CourseworkWeek | null,
  weekNumber: number,
  work: PersonWork,
  reading: CellReading,
): { flags: CellFlags; waiting: CellWaiting | null } {
  if (!week) return { flags: NO_FLAGS, waiting: null };
  const key = (id: string) => workKey(weekNumber, id);
  const keptFrom = reading.keptFrom;
  // Unread by the one rule, only once the day read times began to be kept is known.
  const unreadOf = (id: string, shownInFull: boolean, readableSince: Date | null, feedbackPieces: number) =>
    keptFrom !== null &&
    readStateOf({ shownInFull, readSince: reading.firstReads.get(id) ?? null, readableSince, feedbackPieces }, keptFrom) === "unread";
  let unread = false;
  for (const part of week.parts) {
    for (const prompt of part.prompts) {
      if (unreadOf(prompt.id, work.reflections.has(key(prompt.id)), work.savedAt?.get(key(prompt.id)) ?? null, 0)) unread = true;
    }
  }
  if (reading.boxes) {
    for (const box of week.boxes) {
      if (unreadOf(box.id, work.boxes.has(key(box.id)), work.savedAt?.get(key(box.id)) ?? null, 0)) unread = true;
    }
  }
  const facts = week.answer ? (work.answerFacts?.get(key(week.answer.id)) ?? null) : null;
  if (!week.answer || !facts) return { flags: { unread, noFeedback: false, changed: false }, waiting: null };
  const answerUnread = unreadOf(week.answer.id, facts.readable, facts.readableSince, facts.pieces);
  if (answerUnread) unread = true;
  const feedback = feedbackStateOf({ takesFeedback: facts.readable, pieces: facts.pieces, changed: facts.changed });
  const flags = { unread, noFeedback: feedback === "none", changed: feedback === "changed" };
  if (feedback !== "none" && feedback !== "changed") return { flags, waiting: null };
  const notSent = facts.firstSentAt === null;
  return {
    flags,
    waiting: {
      kind: feedback,
      // Oldest first: when it was first sent (never sent, when its readers could first read it), or when it was changed.
      at: feedback === "changed" ? isoOf(facts.savedAt) : isoOf(facts.firstSentAt ?? facts.sessionStart),
      notSent,
      late: !notSent && facts.sentLateMs !== null,
      unread: answerUnread,
    },
  };
}

/** What the tab's rows are made from: everybody, their work, the weeks they read and where each stands. */
export type CourseworkRowsInput = {
  columns: ReadonlyArray<{ weekNumber: number }>;
  people: readonly CourseworkPerson[];
  workOf: (uid: string) => PersonWork;
  weekOf: (groupId: string | null, weekNumber: number) => CourseworkWeek | null;
  /** The person's page, without a week. */
  personHref: (uid: string) => string;
  /** When a person pressed a week's old Submit, and the session they were due at (`loadRunWeekStates`). */
  standingOf: (uid: string, weekNumber: number) => { submittedAt: Date | null; due: WeekDue };
  /** The last week that has begun for a person, on the calendar of the group whose weeks they read; 0 before any. */
  reachedOf: (person: CourseworkPerson) => number;
  /** The day a week opens for a person, on that same calendar (`weekOpensOn`); left out, none is said. */
  opensOf?: (person: CourseworkPerson, weekNumber: number) => string | null;
  /**
   * What this reader may read of a person's work, for the flags: null for
   * somebody whose work is not theirs to read (their own row among them).
   * Left out, nobody's flags are worked out.
   */
  readingOf?: (person: CourseworkPerson) => { boxes: boolean } | null;
  /** When each answer of a person's week was first read, by answer id (the first-read store's). */
  firstReadsOf?: (uid: string, weekNumber: number) => ReadonlyMap<string, Date>;
  /** The day the site began keeping that (`readFirstReadsKeptFrom`), or null: then nothing is unread. */
  keptFrom?: Date | null;
};

const NO_READS: ReadonlyMap<string, Date> = new Map();

/** Everybody on the tab as a row, in the order given, before any filter, with this reader's flags. */
export function courseworkRows(input: CourseworkRowsInput): CourseworkRow[] {
  const keptFrom = input.keptFrom ?? null;
  return input.people.map((person) => {
    const work = input.workOf(person.uid);
    const href = input.personHref(person.uid);
    const reached = input.reachedOf(person);
    const reads = input.readingOf ? input.readingOf(person) : null;
    const cells = input.columns.map((column) => {
      const week = input.weekOf(person.readsGroupId, column.weekNumber);
      const cell = cellOf(week, column.weekNumber, work, { person: href }, {
        ...input.standingOf(person.uid, column.weekNumber),
        reached: column.weekNumber <= reached,
        opensOn: input.opensOf ? input.opensOf(person, column.weekNumber) : null,
      });
      if (!reads) return cell;
      const firstReads = input.firstReadsOf?.(person.uid, column.weekNumber) ?? NO_READS;
      return { ...cell, ...flagsOf(week, column.weekNumber, work, { boxes: reads.boxes, firstReads, keptFrom }) };
    });
    return {
      ...person,
      cells,
      notDone: cells.some((cell) => cell.reached && cell.done === false),
      late: cells.some((cell) => cell.done === true && cell.doneLateMs !== null),
      unread: cells.some((cell) => cell.flags.unread),
      noFeedback: cells.some((cell) => cell.flags.noFeedback),
      changed: cells.some((cell) => cell.flags.changed),
      href,
    };
  });
}

/**
 * The tab's sections from its rows: the run's groups in their order, each
 * with its facilitators' names, then the people in no group yet; each
 * section's people by name. Then the filter: the chosen group, and the show.
 * A section the filter leaves empty is left out.
 */
export function sectionsOf(
  rows: readonly CourseworkRow[],
  input: { groups: ReadonlyArray<{ id: string; name: string; facilitators?: readonly string[] }>; filter: CourseworkFilter; notInAGroupTitle: string },
): CourseworkSection[] {
  const byName = (a: CourseworkRow, b: CourseworkRow) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.uid.localeCompare(b.uid);
  const sections: CourseworkSection[] = input.groups.map((group) => ({
    key: group.id,
    title: group.name,
    facilitators: [...(group.facilitators ?? [])],
    rows: rows.filter((row) => row.groupId === group.id).sort(byName),
  }));
  const known = new Set(input.groups.map((group) => group.id));
  sections.push({
    key: NOT_IN_A_GROUP,
    title: input.notInAGroupTitle,
    facilitators: [],
    rows: rows.filter((row) => row.groupId === null || !known.has(row.groupId)).sort(byName),
  });
  return sections
    .filter((section) => input.filter.group === "all" || section.key === input.filter.group)
    .map((section) => ({ ...section, rows: section.rows.filter((row) => showKeeps(input.filter.show, row)) }))
    .filter((section) => section.rows.length > 0);
}

/**
 * The tab: its sections in the run's group order, people in no group yet
 * last, each section's people by name; then the filter. `weekOf` hands the
 * week a group reads (null: the run's own).
 */
export function courseworkSections(
  input: CourseworkRowsInput & {
    groups: ReadonlyArray<{ id: string; name: string; facilitators?: readonly string[] }>;
    filter: CourseworkFilter;
    notInAGroupTitle: string;
  },
): CourseworkSection[] {
  return sectionsOf(courseworkRows(input), input);
}

/**
 * THE WEEK THE TAB IS ON, for its view at phone width (one week at a time)
 * and for "Read one question": the week the address names when it is one of
 * the tab's columns, else the newest week that has begun for anybody of the
 * chosen group, else the first column; null with no columns. `asked` says
 * whether the address chose it.
 */
export function tabWeekOf(
  query: { week?: unknown },
  columns: ReadonlyArray<{ weekNumber: number }>,
  rows: ReadonlyArray<Pick<CourseworkRow, "cells">>,
): { weekNumber: number; asked: boolean } | null {
  if (columns.length === 0) return null;
  const wanted = typeof query.week === "string" && /^\d{1,3}$/.test(query.week) ? Number(query.week) : null;
  if (wanted !== null && columns.some((column) => column.weekNumber === wanted)) return { weekNumber: wanted, asked: true };
  const begun = columns
    .map((column) => column.weekNumber)
    .filter((weekNumber) => rows.some((row) => row.cells.some((cell) => cell.weekNumber === weekNumber && cell.reached)))
    .at(-1);
  return { weekNumber: begun ?? columns[0].weekNumber, asked: false };
}

/** One written answer on the list of what waits for feedback, as the tab draws it. */
export type WaitingRow = CellWaiting & {
  uid: string;
  /** By the names rule for the reader. */
  name: string;
  /** Their page. */
  personHref: string;
  weekNumber: number;
  /** The reading view of that week, at the written answer. */
  readHref: string;
};

/** The id the written answer's heading carries in the reading view, which "Read" lands on (`./reading.ts`). */
export { READING_ANSWER_ANCHOR };

/** How many rows of the list are drawn before "Show all". */
export const WAITING_SHOWN = 10;

/**
 * WAITING FOR FEEDBACK, OLDEST FIRST (Fri 13 Nov 2026): every written answer
 * of `rows` (the people of the chosen group) that waits for this reader's
 * feedback, as each cell says (`CellWaiting`: the reader may read the
 * person's work, never their own; its readers may read the answer and it holds
 * words; no feedback from anyone, or changed since the newest feedback). Not
 * bounded by any date. Oldest first by `at` (an answer with no time known
 * last), then by name and week. A reflection or a fill-in box is never on it:
 * nobody gives feedback on one alone.
 */
export function waitingList(rows: readonly CourseworkRow[]): WaitingRow[] {
  const out: WaitingRow[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!cell.waiting) continue;
      out.push({ ...cell.waiting, uid: row.uid, name: row.name, personHref: row.href, weekNumber: cell.weekNumber, readHref: `${cell.href}#${READING_ANSWER_ANCHOR}` });
    }
  }
  const time = (row: WaitingRow) => (row.at ? new Date(row.at).getTime() : Number.POSITIVE_INFINITY);
  return out.sort(
    (a, b) =>
      time(a) - time(b) ||
      a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) ||
      a.uid.localeCompare(b.uid) ||
      a.weekNumber - b.weekNumber,
  );
}
