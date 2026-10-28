import {
  firstMarkedMinutes,
  fromFirstMark,
  markedMinutes,
  markedSlotCount,
  maskCoversSession,
  type AvailabilityGrid,
  type SessionSlot,
} from "@/lib/admissions/availability";
import type { ApplicationDoc } from "../model";

/**
 * THE ONE READING OF THE WEEK SOMEBODY PAINTED ON THE FORM, for the course
 * side.
 *
 * Two screens ask what a person's painted week says about a weekly session:
 * the allocation board (`./board.ts`, which group's session each person can
 * make) and the times picture on a programme's Groups tab (`./times.ts`, how
 * many people can make a session at each start time). Both ask here, so the
 * two cannot disagree about whether somebody is free.
 *
 * ## The week never leaves this folder
 *
 * What comes back is a predicate, `covers`, and not the week. It asks the
 * availability module's own test (`maskCoversSession`): the painted week
 * covers EVERY minute of the session, decoded against the grid the week was
 * drawn on. A session that starts before the grid opens or ends after it
 * closes is never covered, because the form never asked about those times.
 *
 * ## Somebody who marked little time
 *
 * Somebody who marked under four hours in the whole week (`minimal`) is read
 * "from then on": on each day they marked anything, free from their first
 * marked time until the grid closes. A single hour on several evenings
 * usually means "any time after then", and read literally it fits no
 * session at all. Their marks never choose when groups meet (`./times.ts`
 * leaves them out of the count), they are seated after everybody else, and
 * one who still fits no group goes to the nearest one, flagged
 * (`../arrange/plan.ts`). Every screen reads them this one way, so the board,
 * the People tab and an arrangement agree.
 *
 * ## Three answers
 *
 *  - `given`: they painted something, and `covers` answers for any session.
 *  - `none-given`: they sent the form with nothing painted. Never the same
 *    as "can make nothing": a screen says it in words.
 *  - `not-on-file`: there is no sent application to read (it was destroyed
 *    with its form). Nothing is claimed about when they are free.
 *
 * Pure, with no server import.
 */

/** Under this many minutes marked in the week, a week is read "from then on" (above). */
export const LITTLE_MARKED_MINUTES = 240;

export type PaintedWeek =
  | {
      kind: "given";
      covers: (session: SessionSlot) => boolean;
      /** They marked under `LITTLE_MARKED_MINUTES` in the week, so `covers` reads them "from then on". */
      minimal?: boolean;
      /** Each weekday's first marked minute, Sunday first, or null: where the nearest group is measured from. */
      firstMarks?: (number | null)[];
    }
  | { kind: "none-given" }
  | { kind: "not-on-file" };

/**
 * What one person's sent application says about when they are free.
 * `grid` is the form's CURRENT grid, used only for a week stored before
 * weeks carried their own geometry.
 */
export function paintedWeekOf(
  grid: AvailabilityGrid,
  application: Pick<ApplicationDoc, "sent"> | null,
): PaintedWeek {
  if (!application || !application.sent) return { kind: "not-on-file" };
  const mask = application.sent.availability;
  if (markedSlotCount(mask, grid) === 0) return { kind: "none-given" };
  const minimal = markedMinutes(mask, grid) < LITTLE_MARKED_MINUTES;
  const read = minimal ? fromFirstMark(mask, grid) : mask;
  return {
    kind: "given",
    covers: (session) => maskCoversSession(read, grid, session),
    minimal,
    firstMarks: firstMarkedMinutes(mask, grid),
  };
}
