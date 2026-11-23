/**
 * WHAT COURSE RUN'S TAKE-OFF OF SOMEBODY WHO GAVE THEIR PLACE BACK DOES WITH
 * THEIR ROW ON THE RUN'S LIST. One switch, read by the section and nowhere
 * else:
 *
 *  - `false` (the owner's choice, and what it is set to): an ordinary
 *    take-off, as People in groups makes. The row stays accepted, so staff
 *    can put them back through the board, the sheet is the ordinary one, and
 *    the list's note says only that the seat is freed.
 *  - `true` (as the design draws it): the take-off sends `closeRow`, so the
 *    remove route closes the row (`withdrawn`) with the seat, the sheet says
 *    in one sentence more that they can't be put back on this run, and the
 *    list's note says the row is closed. No route opens a closed row again.
 *
 * Nothing else changes with it: the remove route accepts `closeRow` either
 * way, and only Course run would send it.
 */
export const COURSE_RUN_CLOSES_THE_ROW = false;
