/**
 * WHAT COURSE RUN'S TAKE-OFF OF SOMEBODY WHO GAVE THEIR PLACE BACK DOES WITH
 * THEIR ROW ON THE RUN'S LIST. One switch, read by the section and nowhere
 * else:
 *
 *  - `true` (as the design draws it): the take-off sends `closeRow`, so the
 *    remove route closes the row (`withdrawn`) with the seat, the sheet says
 *    in one sentence more that they can't be put back on this run, and the
 *    list's note says the row is closed. No route opens a closed row again.
 *  - `false`: an ordinary take-off, as People in groups makes. The row stays
 *    accepted, so staff can put them back through the board, the sheet is
 *    the ordinary one, and the list's note says only that the seat is freed.
 *
 * Nothing else changes with it: the remove route accepts `closeRow` either
 * way, and only Course run sends it.
 */
export const COURSE_RUN_CLOSES_THE_ROW = true;
