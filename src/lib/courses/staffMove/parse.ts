import { couldBeFollowed } from "../followable";
import { reasonTooLongWords } from "../sessionChange/words";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { MOVE_REFUSAL, moveReasonForm } from "./words";

/**
 * THE MOVE ROUTE'S BODY, read whole before anything else is:
 *
 *   { toGroupId, preview: true }                       what a move would do
 *   { toGroupId, weekNumber, emailCount, reason? }     the press
 *
 * `weekNumber` and `emailCount` are what the page stated and its button
 * showed; the save works both out again and answers 409 when either
 * differs. The reason is optional and held to a change's rules: one line, at
 * most 200 characters (`GROUP_FIELD_LIMITS.changeReason`), and no link; it is
 * kept in the one form the history reads it back in (`moveReasonForm`). A
 * field this route does not know refuses the body.
 */

export type MoveBody =
  | { preview: true; toGroupId: string }
  | { preview: false; toGroupId: string; weekNumber: number; emailCount: number; reason: string };

const FIELDS = new Set(["toGroupId", "preview", "weekNumber", "emailCount", "reason"]);

export function parseMoveBody(raw: unknown): { ok: true; value: MoveBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: MOVE_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return { ok: false, error: MOVE_REFUSAL.body };
  const toGroupId = body.toGroupId;
  if (typeof toGroupId !== "string" || !toGroupId || toGroupId.length > 200 || toGroupId.includes("/")) {
    return { ok: false, error: MOVE_REFUSAL.group };
  }
  if (body.preview !== undefined && typeof body.preview !== "boolean") return { ok: false, error: MOVE_REFUSAL.body };
  if (body.preview === true) return { ok: true, value: { preview: true, toGroupId } };
  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60) {
    return { ok: false, error: MOVE_REFUSAL.week };
  }
  const emailCount = body.emailCount;
  if (typeof emailCount !== "number" || !Number.isInteger(emailCount) || emailCount < 0 || emailCount > 100) {
    return { ok: false, error: MOVE_REFUSAL.emailCount };
  }
  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: MOVE_REFUSAL.reason };
  const typed = typeof body.reason === "string" ? body.reason.trim() : "";
  if (/[\r\n]/.test(typed)) return { ok: false, error: MOVE_REFUSAL.reasonLine };
  // Kept, embedded and read back in one form (`moveReasonForm`).
  const reason = moveReasonForm(typed);
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  if (couldBeFollowed(reason)) return { ok: false, error: MOVE_REFUSAL.reasonLink };
  return { ok: true, value: { preview: false, toGroupId, weekNumber, emailCount, reason } };
}
