import { REPLY_REFUSAL, parseReplyBody, parseVisitReason, type Parsed } from "../visitRequest/model";
import { MOVE_ASK_REFUSAL } from "./words";

/**
 * THE BODIES OF THE ROUTES ABOUT A REQUEST TO CHANGE GROUP FOR GOOD, read
 * whole before anything else is. Pure: reads nothing.
 *
 *   ask       { toGroupId, reason }                  the week is never sent: it is the staff move's rule at the approval
 *   approve   { weekNumber, emailCount, reply? }     the week and the count of emails the page showed, checked again at the press
 *   decline   { reply }                              the reply is needed (the one-week request's own parser)
 *   reply     { reply }                              a reply without deciding (likewise)
 *
 * A field a route does not know refuses the body. The person's words are
 * NEEDED here, one line, capped, with no link, held as a request to go to
 * another session holds its words (`parseVisitReason`).
 */

export { parseReplyBody };

function objectBody(raw: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!fields.includes(key)) return null;
  return body;
}

function isGroupRef(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= 200 && !value.includes("/");
}

export type MoveAskPress = { toGroupId: string; reason: string };

/** The ask: which group, and why (needed). */
export function parseMoveAsk(raw: unknown): Parsed<MoveAskPress> {
  const body = objectBody(raw, ["toGroupId", "reason"]);
  if (!body) return { ok: false, error: MOVE_ASK_REFUSAL.body };
  if (!isGroupRef(body.toGroupId)) return { ok: false, error: MOVE_ASK_REFUSAL.chooseFirst };
  const reason = parseVisitReason(body.reason);
  if (!reason.ok) return reason;
  if (!reason.value) return { ok: false, error: MOVE_ASK_REFUSAL.sayWhy };
  return { ok: true, value: { toGroupId: body.toGroupId, reason: reason.value } };
}

export type MoveApprovePress = { weekNumber: number; emailCount: number; reply: string };

export const MOVE_APPROVE_REFUSAL = {
  week: "Say which week the page said the move is from.",
} as const;

/** Approving: the week and the count of emails the page showed, and an optional reply. */
export function parseMoveApprove(raw: unknown): Parsed<MoveApprovePress> {
  const body = objectBody(raw, ["weekNumber", "emailCount", "reply"]);
  if (!body) return { ok: false, error: REPLY_REFUSAL.body };
  const week = body.weekNumber;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 60) return { ok: false, error: MOVE_APPROVE_REFUSAL.week };
  const count = body.emailCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 100) return { ok: false, error: REPLY_REFUSAL.emailCount };
  // Optional here; when given, held to the one-week request's rules for a reply: one line, capped, no link.
  if (body.reply === undefined || body.reply === null || (typeof body.reply === "string" && body.reply.trim() === "")) {
    return { ok: true, value: { weekNumber: week, emailCount: count, reply: "" } };
  }
  const reply = parseReplyBody({ reply: body.reply }, "reply");
  if (!reply.ok) return reply;
  return { ok: true, value: { weekNumber: week, emailCount: count, reply: reply.value.reply } };
}
