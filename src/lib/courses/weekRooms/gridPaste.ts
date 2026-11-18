import { addDaysToKey, isValidDateKey } from "../weekPlan";
import { roomAsStored } from "../sessionChange/room";
import type { TermCell, TermSection } from "./model";
import { choiceKeyOf, matchGroup, readRecords, roomProblem, type LineMatch, type PasteCandidate } from "./paste";
import { notThisWeekWords, NO_SESSION, ROW_STATE } from "./words";

/**
 * THE TERM GRID'S PASTE BOX: a BLOCK copied from a spreadsheet, a line a
 * group, the first column naming the group and then a column a week. PURE,
 * and runs in the browser: it changes nothing, and what it reads goes into the
 * grid's own fields, saved by the grid's Save.
 *
 * THE GROUP is matched as the week's paste box matches it (`./paste.ts`): any
 * case and spacing, the programme's short name or initials in front, never a
 * guess, never across the programmes the grid shows.
 *
 * THE WEEKS. A first line whose columns after the first all name weeks is a
 * header: "Week 3", "Wk 3", "w3", "3", or a date inside that week of the
 * group's run ("2026-11-17", "17/11/2026", "17/11", "17 Nov", "Tue 17 Nov").
 * With no header the columns are the grid's weeks in order from its first
 * week. Either way the box says which week each column was taken as, for
 * each programme, before anything is saved.
 *
 * A CELL is a room for that week, "" (or "TBC", "to be confirmed", "-") for
 * To be confirmed, held to the writer's rules. A cell for a week that cannot
 * take a room here (no session, called off, held online, started, met) is
 * skipped and says why.
 */

/** One column after the first: a week by its number, a date, or nothing a header could mean. */
export type ColumnHead = { kind: "week"; weekNumber: number } | { kind: "date"; dateKey: string } | null;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** A header cell read as a week: its number, or a date (with no year: `yearless`, the month and day). */
export function readHead(text: string): ColumnHead | { kind: "yearless"; month: number; day: number } {
  const said = text.trim().toLowerCase();
  const week = /^(?:week|wk|w)?\s*(\d{1,2})$/.exec(said);
  if (week) {
    const n = Number(week[1]);
    return n >= 1 && n <= 60 ? { kind: "week", weekNumber: n } : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(said);
  if (iso && isValidDateKey(said)) return { kind: "date", dateKey: said };
  const dmy = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(said);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (!dmy[3]) return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { kind: "yearless", month, day } : null;
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const key = `${year}-${pad(month)}-${pad(day)}`;
    return isValidDateKey(key) ? { kind: "date", dateKey: key } : null;
  }
  const named = /^(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?$/.exec(said);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3)) + 1;
    const day = Number(named[1]);
    return month > 0 && day >= 1 && day <= 31 ? { kind: "yearless", month, day } : null;
  }
  return null;
}

/** Which of a section's weeks a header cell means, or null. A date is the week whose seven days it falls in. */
export function weekOfHead(head: ReturnType<typeof readHead>, weeks: TermSection["weeks"]): number | null {
  if (!head) return null;
  if (head.kind === "week") return weeks.some((week) => week.weekNumber === head.weekNumber) ? head.weekNumber : null;
  const inWeek = (dateKey: string) =>
    weeks.find((week) => week.fromKey && dateKey >= week.fromKey && dateKey <= addDaysToKey(week.fromKey, 6))?.weekNumber ?? null;
  if (head.kind === "date") return inWeek(head.dateKey);
  // No year: the year of the run's weeks that holds the date.
  for (const year of new Set(weeks.map((week) => week.fromKey.slice(0, 4)).filter(Boolean))) {
    const key = `${year}-${pad(head.month)}-${pad(head.day)}`;
    if (!isValidDateKey(key)) continue;
    const found = inWeek(key);
    if (found !== null) return found;
  }
  return null;
}

/** A group of the grid as the box matches it. */
export type GridCandidate = PasteCandidate & { programmeId: string; groupId: string };

export function gridCandidatesOf(sections: readonly TermSection[]): GridCandidate[] {
  return sections.flatMap((section) =>
    section.rows.map((row) => ({
      key: row.groupId,
      groupId: row.groupId,
      programmeId: section.programmeId,
      programmeName: section.programmeName,
      groupName: row.groupName,
      room: "",
      notHere: null,
    })),
  );
}

export type CellOutcome =
  | { kind: "change"; weekNumber: number; room: string; was: string }
  | { kind: "clear"; weekNumber: number; was: string }
  | { kind: "same"; weekNumber: number }
  | { kind: "skip"; weekNumber: number | null; why: string }
  | { kind: "problem"; weekNumber: number; problem: "tooLong" | "roomLink" | "roomLine" };

export type BlockLine = {
  number: number;
  group: string;
  match: LineMatch;
  /** The group it is matched (or chosen) to, or null while it is asked about. */
  groupId: string | null;
  /** On an earlier line already: the line's number. */
  duplicateOf: number | null;
  cells: { column: number; text: string; outcome: CellOutcome | null }[];
};

export type BlockRead = {
  /** The first line was read as a header. */
  header: boolean;
  /** For each programme shown: which week each column was taken as (null for none), first column after the group first. */
  columns: { programmeId: string; programmeName: string; weeks: (number | null)[] }[];
  lines: BlockLine[];
};

/** Why a cell cannot take a room in the grid, or null when it can. */
function notHereOf(cell: TermCell | undefined): string | null {
  if (!cell || cell.kind === "none") return NO_SESSION;
  return cell.state === null ? null : notThisWeekWords(ROW_STATE[cell.state]);
}

export function readBlock(
  text: string,
  sections: readonly TermSection[],
  /** The person's choices, by `choiceKeyOf`. */
  chosen: ReadonlyMap<string, string>,
): BlockRead {
  const records = readRecords(text);
  const candidates = gridCandidatesOf(sections);
  const width = Math.max(0, ...records.map((record) => record.length - 1));
  const first = records[0];
  const header =
    first !== undefined &&
    first.length > 1 &&
    matchGroup(first[0], candidates).kind === "none" &&
    first.slice(1).every((cell) => cell.trim() === "" || readHead(cell) !== null) &&
    first.slice(1).some((cell) => readHead(cell) !== null);
  const heads = header ? first.slice(1).map((cell) => readHead(cell)) : [];

  const columns = sections.map((section) => ({
    programmeId: section.programmeId,
    programmeName: section.programmeName,
    weeks: Array.from({ length: width }, (_, i) =>
      header ? weekOfHead(heads[i] ?? null, section.weeks) : (section.weeks[i]?.weekNumber ?? null),
    ),
  }));
  const sectionOf = new Map(sections.flatMap((section) => section.rows.map((row) => [row.groupId, section] as const)));
  const columnsOf = new Map(columns.map((each) => [each.programmeId, each.weeks] as const));

  const firstLineOf = new Map<string, number>();
  const lines = (header ? records.slice(1) : records).map((record, index): BlockLine => {
    const number = index + 1;
    const group = (record[0] ?? "").trim();
    const match = matchGroup(group, candidates);
    const picked = chosen.get(choiceKeyOf({ group }));
    const groupId = picked && sectionOf.has(picked) ? picked : match.kind === "matched" ? match.key : null;
    const earlier = groupId ? firstLineOf.get(groupId) : undefined;
    if (groupId && earlier === undefined) firstLineOf.set(groupId, number);
    const section = groupId ? sectionOf.get(groupId) : undefined;
    const row = section?.rows.find((each) => each.groupId === groupId);
    const weeks = section ? (columnsOf.get(section.programmeId) ?? []) : [];
    const cells = record.slice(1).map((textOf, column) => {
      if (!row || earlier !== undefined) return { column, text: textOf, outcome: null };
      const weekNumber = weeks[column] ?? null;
      if (weekNumber === null) return { column, text: textOf, outcome: { kind: "skip" as const, weekNumber: null, why: NO_SESSION } };
      const cell = row.cells.find((each) => each.weekNumber === weekNumber);
      const why = notHereOf(cell);
      if (why || !cell || cell.kind === "none") return { column, text: textOf, outcome: { kind: "skip" as const, weekNumber, why: why ?? NO_SESSION } };
      const problem = roomProblem(textOf);
      if (problem) return { column, text: textOf, outcome: { kind: "problem" as const, weekNumber, problem } };
      const room = roomAsStored(textOf);
      if (room === cell.room) return { column, text: textOf, outcome: { kind: "same" as const, weekNumber } };
      if (room === "") return { column, text: textOf, outcome: { kind: "clear" as const, weekNumber, was: cell.room } };
      return { column, text: textOf, outcome: { kind: "change" as const, weekNumber, room, was: cell.room } };
    });
    return { number, group, match, groupId, duplicateOf: earlier ?? null, cells };
  });
  return { header, columns, lines };
}

/** The rooms a block puts into the grid's fields, by `${groupId}__${weekNumber}`. */
export function blockRooms(read: BlockRead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of read.lines) {
    if (!line.groupId || line.duplicateOf !== null) continue;
    for (const { outcome } of line.cells) {
      if (outcome?.kind === "change") out[`${line.groupId}__${outcome.weekNumber}`] = outcome.room;
      else if (outcome?.kind === "clear") out[`${line.groupId}__${outcome.weekNumber}`] = "";
    }
  }
  return out;
}
