import { couldBeFollowed } from "../followable";
import { reasonTooLongWords } from "../sessionChange/words";
import { isMoveWeek } from "../groupsByWeek";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { VISIT_REFUSAL } from "./words";

/**
 * THE VISIT ROUTE'S BODY, read whole before anything else is:
 *
 *   { weekNumber, hostGroupId, preview: true }                           what a visit would do
 *   { weekNumber, hostGroupId, emailCount, overLimit, reason? }          the press
 *   { weekNumber, callOff: true, emailCount }                            calling a visit off
 *
 * `emailCount` is what the button showed, and `overLimit` whether the page
 * showed the session is full; the save works both out again and answers 409
 * when either differs. The reason is optional and held to a change's rules:
 * one line, at most 200 characters, no link, kept in one form. A field this
 * route does not know refuses the body.
 */

export type VisitBody =
  | { kind: "preview"; weekNumber: number; hostGroupId: string }
  | { kind: "arrange"; weekNumber: number; hostGroupId: string; emailCount: number; overLimit: boolean; reason: string }
  | { kind: "call-off"; weekNumber: number; emailCount: number };

const FIELDS = new Set(["weekNumber", "hostGroupId", "preview", "emailCount", "overLimit", "reason", "callOff"]);

function isGroupRef(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= 200 && !value.includes("/");
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function parseVisitBody(raw: unknown): { ok: true; value: VisitBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: VISIT_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return { ok: false, error: VISIT_REFUSAL.body };
  if (!isMoveWeek(body.weekNumber)) return { ok: false, error: VISIT_REFUSAL.week };
  const weekNumber = body.weekNumber;
  if (body.callOff !== undefined) {
    if (body.callOff !== true || body.hostGroupId !== undefined || body.preview !== undefined || body.reason !== undefined || body.overLimit !== undefined) {
      return { ok: false, error: VISIT_REFUSAL.body };
    }
    if (!isCount(body.emailCount)) return { ok: false, error: VISIT_REFUSAL.emailCount };
    return { ok: true, value: { kind: "call-off", weekNumber, emailCount: body.emailCount } };
  }
  if (!isGroupRef(body.hostGroupId)) return { ok: false, error: VISIT_REFUSAL.group };
  const hostGroupId = body.hostGroupId;
  if (body.preview !== undefined && typeof body.preview !== "boolean") return { ok: false, error: VISIT_REFUSAL.body };
  if (body.preview === true) return { ok: true, value: { kind: "preview", weekNumber, hostGroupId } };
  if (!isCount(body.emailCount)) return { ok: false, error: VISIT_REFUSAL.emailCount };
  if (body.overLimit !== undefined && typeof body.overLimit !== "boolean") return { ok: false, error: VISIT_REFUSAL.overLimit };
  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: VISIT_REFUSAL.reason };
  const typed = typeof body.reason === "string" ? body.reason.trim() : "";
  if (/[\r\n]/.test(typed)) return { ok: false, error: VISIT_REFUSAL.reasonLine };
  const reason = typed.replace(/\s+/g, " ").trim();
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  if (couldBeFollowed(reason)) return { ok: false, error: VISIT_REFUSAL.reasonLink };
  return { ok: true, value: { kind: "arrange", weekNumber, hostGroupId, emailCount: body.emailCount, overLimit: body.overLimit === true, reason } };
}
