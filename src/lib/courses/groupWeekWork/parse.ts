import { REMIND_REFUSAL } from "./words";

/**
 * A PRESS OF REMIND, as the route reads its body, before anything is read:
 * `{ week, uid?, preview?, count? }`.
 *
 *  - `week`: the week of the group's plan, 1 to 60.
 *  - `uid`: one person ("Remind Daniel"); left out, everybody not done.
 *  - `preview: true`: say who it reaches and what it says, and send nothing.
 *  - `count`: the number the button showed, required for a press: the route
 *    refuses with a 409 and the new count when it no longer holds.
 *
 * Pure.
 */

export type RemindPress = {
  weekNumber: number;
  onlyUid: string | null;
  preview: boolean;
  count: number | null;
};

const UID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseRemindPress(raw: unknown): { ok: true; value: RemindPress } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REMIND_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  const week = body.week;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 60) return { ok: false, error: REMIND_REFUSAL.body };
  let onlyUid: string | null = null;
  if (body.uid !== undefined && body.uid !== null) {
    if (typeof body.uid !== "string" || !UID.test(body.uid)) return { ok: false, error: REMIND_REFUSAL.body };
    onlyUid = body.uid;
  }
  const preview = body.preview === true;
  let count: number | null = null;
  if (!preview) {
    if (typeof body.count !== "number" || !Number.isInteger(body.count) || body.count < 0 || body.count > 500) {
      return { ok: false, error: REMIND_REFUSAL.count };
    }
    count = body.count;
  }
  return { ok: true, value: { weekNumber: week, onlyUid, preview, count } };
}
