/**
 * HOW THE REQUESTS PAGE AND HOME SORT REQUESTS BY KIND, in one pure place:
 * every section of the page takes the rows of its own kind and no other, and
 * every count on Home is a count of one kind's rows. Nothing is ever placed
 * or counted as a kind because it is not some other kind, so a row of a kind
 * this build does not know lands in no section and no count until its own
 * builder adds them. The page's three counts are over every row, and "done
 * this week" is every state that has left waiting (a later kind's own
 * decided state among them).
 */

/** A row as these questions need it. */
export type KindRow = { kind: string; state: string };

/** The kinds the page draws a section for and Home counts. */
export const REQUEST_KINDS = {
  corrections: "register-correction",
  excused: "excused",
  visits: "visit",
} as const;

/** The rows of one kind, and only that kind. */
export function rowsOfKind<T extends KindRow>(rows: readonly T[], kind: string): T[] {
  return rows.filter((row) => row.kind === kind);
}

/** Waiting with nobody on it, or being handled: still to be decided. */
export function isOpen(state: string): boolean {
  return state === "waiting" || state === "handling";
}

/** Any state that has left waiting: "done this week". */
export function isDone(state: string): boolean {
  return !isOpen(state);
}

/** The three counts of the Requests page's tabs, over every row whatever its kind. */
export function tabCounts(rows: readonly KindRow[]): { waiting: number; handling: number; done: number } {
  return {
    waiting: rows.filter((row) => row.state === "waiting").length,
    handling: rows.filter((row) => row.state === "handling").length,
    done: rows.filter((row) => isDone(row.state)).length,
  };
}

/** Home's counts of what waits, each kind counted by itself. */
export function openByKind(rows: readonly KindRow[]): { corrections: number; excused: number; visits: number } {
  const open = (kind: string) => rowsOfKind(rows, kind).filter((row) => isOpen(row.state)).length;
  return { corrections: open(REQUEST_KINDS.corrections), excused: open(REQUEST_KINDS.excused), visits: open(REQUEST_KINDS.visits) };
}
