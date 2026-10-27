import { enrolmentHasLeft } from "@/lib/firestore/courseEnrolments";
import { cardGaveBack, type FitRow } from "./allocationFit";

/**
 * WHAT THE ALLOCATION BOARD'S RAIL COUNTS, AND WHO IT NAMES WHEN PUBLISH
 * HAS TO WAIT.
 *
 * Every accepted row on the run's own list is a card on the board, and each
 * card is one of four things:
 *
 *  - PLACED: somebody still on the run, in a group's column.
 *  - STILL TO PLACE: somebody still on the run (or with no enrolment yet), in
 *    the Unallocated column. Publish waits for them, and the board names them
 *    when it will not publish.
 *  - GAVE THEIR PLACE BACK WITH NO GROUP: somebody in the Unallocated column
 *    whose card says "Gave their place back" (`cardGaveBack`, the card's own
 *    question of the one answer). Their card stays where it is, with its
 *    badge, but they are nobody to place: Publish does not wait for them
 *    either (`loadPublishPlan` asks the same answer), so the board never
 *    names them as having no group. Somebody in a group who gave their place
 *    back is still PLACED: they hold a seat until somebody Removes it.
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
export type TallyRow = { displayName: string; enrolmentStatus: string } & Pick<FitRow, "fromForm" | "putBack">;

export type BoardTally<Row extends TallyRow> = {
  /** Every accepted row on the run's list. */
  accepted: number;
  /** Still on the run, and in a group's column. */
  placed: number;
  /** Still on the run, and in the Unallocated column: who Publish waits for. */
  toPlace: Row[];
  /** In the Unallocated column, and their card says "Gave their place back": nobody to place. */
  gaveBack: number;
  /** Withdrawn or removed, wherever their card sits. */
  left: number;
};

/** Whether a board row's enrolment has left the run. */
export function rowHasLeft(row: TallyRow): boolean {
  return enrolmentHasLeft(row.enrolmentStatus);
}

/**
 * Whether a card in the Unallocated column is somebody still to place: not
 * left, and not somebody whose card says they gave their place back. What
 * the column's own number counts.
 */
export function poolRowIsToPlace(row: TallyRow): boolean {
  return !rowHasLeft(row) && !cardGaveBack(row);
}

/** The rail's counts. `inPool` says whether a row's card is in the Unallocated column now. */
export function boardTally<Row extends TallyRow>(rows: readonly Row[], inPool: (row: Row) => boolean): BoardTally<Row> {
  let placed = 0;
  let gaveBack = 0;
  let left = 0;
  const toPlace: Row[] = [];
  for (const row of rows) {
    if (rowHasLeft(row)) left += 1;
    else if (!inPool(row)) placed += 1;
    else if (poolRowIsToPlace(row)) toPlace.push(row);
    else gaveBack += 1;
  }
  return { accepted: rows.length, placed, toPlace, gaveBack, left };
}

/**
 * THE LINE OVER A PROGRAMME'S PEOPLE IN GROUPS (board st-groups), and the
 * number beside its "Publish groups…": "30 holding a place · 26 in a group ·
 * 4 to place · 2 invited". One function, asked wherever these numbers are
 * said, so no two places can disagree:
 *
 *  - HOLDING A PLACE is the People tab's answer: `people.holders` are the
 *    uids its model says hold a place on the programme (`holdsPlaceOn`, the
 *    number beside the People tab).
 *  - IN A GROUP is how many of them sit in a group's column of the board and
 *    are still on the run.
 *  - TO PLACE is everybody else holding a place: in the To place column, or
 *    not on the run's list yet (`notOnTheRun`: nobody has handed them over,
 *    so the board has no card for them).
 *  - INVITED is the People tab's answer too: an invitation to the programme
 *    nobody has answered, as the viewer may see it.
 *
 * `rows` are the board's cards and `inPool` says whether one is in the To
 * place column now, as `boardTally` takes them, so a move counts the moment
 * the card lands. Somebody who applied to the run itself, and holds no place
 * on the form, is a card on the board and not a number here.
 */
export type PlacingCounts = {
  holding: number;
  inAGroup: number;
  toPlace: number;
  notOnTheRun: number;
  invited: number;
};

export function placingCounts<Row extends { uid: string; enrolmentStatus: string }>(
  rows: readonly Row[],
  inPool: (row: Row) => boolean,
  people: { holders: readonly string[]; invited: number },
): PlacingCounts {
  const byUid = new Map(rows.map((row) => [row.uid, row] as const));
  let inAGroup = 0;
  let notOnTheRun = 0;
  for (const uid of new Set(people.holders)) {
    const row = byUid.get(uid);
    if (!row) notOnTheRun += 1;
    else if (!enrolmentHasLeft(row.enrolmentStatus) && !inPool(row)) inAGroup += 1;
  }
  const holding = new Set(people.holders).size;
  return { holding, inAGroup, toPlace: holding - inAGroup, notOnTheRun, invited: people.invited };
}
