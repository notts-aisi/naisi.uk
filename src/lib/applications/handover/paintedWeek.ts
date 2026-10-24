import {
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

export type PaintedWeek =
  | { kind: "given"; covers: (session: SessionSlot) => boolean }
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
  return { kind: "given", covers: (session) => maskCoversSession(mask, grid, session) };
}
