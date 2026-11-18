import type { RoomRow, TermSection } from "./model";
import { CELL_MARK, COLUMN, CSV_COLUMN, NOT_BOOKED, NO_SESSION, ROW_STATE, requestsCellWords, weekColumnWords } from "./words";

/**
 * WHAT DOWNLOAD SAVES, as a header and rows, from what the page already
 * holds: no read, no route, and nothing about anybody (groups, rooms and
 * counts). The browser turns it into a file with the site's CSV helper, which
 * neutralises a cell a spreadsheet would run as a formula.
 */

/** A row's room as the file says it: the room, "Not booked", or why it is not changed here. */
function roomCell(row: RoomRow): string {
  if (row.state === "cancelled") return ROW_STATE.cancelled;
  return row.room || NOT_BOOKED;
}

/** The week's rooms, a line a row, in the table's columns. */
export function weekRoomsCsv(rows: readonly RoomRow[]): { header: string[]; body: string[][] } {
  return {
    header: [CSV_COLUMN.programme, COLUMN.group, COLUMN.when, COLUMN.campus, COLUMN.room, COLUMN.link, COLUMN.away, COLUMN.online, COLUMN.requests],
    body: rows.map((row) => [
      row.programmeName,
      row.groupName,
      row.when,
      row.campus,
      roomCell(row),
      row.link.words,
      String(row.away),
      String(row.online),
      requestsCellWords(row.requests),
    ]),
  };
}

/** The term's rooms: a line a group, a column a week up to the longest run's last, each cell its room and marks. */
export function termRoomsCsv(sections: readonly TermSection[]): { header: string[]; body: string[][] } {
  const weekNumbers = [...new Set(sections.flatMap((section) => section.weeks.map((week) => week.weekNumber)))].sort((a, b) => a - b);
  return {
    header: [CSV_COLUMN.programme, COLUMN.group, ...weekNumbers.map(weekColumnWords)],
    body: sections.flatMap((section) =>
      section.rows.map((row) => [
        section.programmeName,
        row.groupName,
        ...weekNumbers.map((weekNumber) => {
          const cell = row.cells.find((each) => each.weekNumber === weekNumber);
          if (!cell) return "";
          if (cell.kind === "none") return NO_SESSION;
          const marks = cell.marks.map((mark) => CELL_MARK[mark]);
          const room = cell.marks.includes("cancelled") ? "" : cell.room || NOT_BOOKED;
          return [room, marks.length ? `(${marks.join("; ")})` : ""].filter(Boolean).join(" ");
        }),
      ]),
    ),
  };
}
