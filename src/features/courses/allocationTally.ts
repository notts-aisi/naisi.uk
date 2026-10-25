import { enrolmentHasLeft } from "@/lib/firestore/courseEnrolments";

/**
 * WHAT THE ALLOCATION BOARD'S RAIL COUNTS, AND WHO IT NAMES WHEN PUBLISH
 * HAS TO WAIT.
 *
 * Every accepted row on the run's own list is a card on the board, and each
 * card is one of three things:
 *
 *  - PLACED: somebody still on the run, in a group's column.
 *  - STILL TO PLACE: somebody still on the run (or with no enrolment yet), in
 *    the Unallocated column. Publish waits for them, and the board names them
 *    when it will not publish.
 *  - LEFT: an enrolment withdrawn by its owner or removed by staff
 *    (`enrolmentHasLeft`), wherever its card sits. The row can still say
 *    Accepted, because changing it is an admin's step, but they are nobody to
 *    place: the board counts them as having left and never names them as
 *    having no group. Publish does not wait for them either
 *    (`loadPublishPlan`), so the board and the press agree.
 *
 * Pure, so the board and a test ask the same function.
 */

/** The fields of a board row this reads. */
export type TallyRow = { displayName: string; enrolmentStatus: string };

export type BoardTally<Row extends TallyRow> = {
  /** Every accepted row on the run's list. */
  accepted: number;
  /** Still on the run, and in a group's column. */
  placed: number;
  /** Still on the run, and in the Unallocated column: who Publish waits for. */
  toPlace: Row[];
  /** Withdrawn or removed, wherever their card sits. */
  left: number;
};

/** Whether a board row's enrolment has left the run. */
export function rowHasLeft(row: TallyRow): boolean {
  return enrolmentHasLeft(row.enrolmentStatus);
}

/** The rail's counts. `inPool` says whether a row's card is in the Unallocated column now. */
export function boardTally<Row extends TallyRow>(rows: readonly Row[], inPool: (row: Row) => boolean): BoardTally<Row> {
  let placed = 0;
  let left = 0;
  const toPlace: Row[] = [];
  for (const row of rows) {
    if (rowHasLeft(row)) left += 1;
    else if (inPool(row)) toPlace.push(row);
    else placed += 1;
  }
  return { accepted: rows.length, placed, toPlace, left };
}
