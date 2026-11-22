import { couldBeFollowed } from "../followable";
import { tooLongWords } from "../excused/words";
import { MEMBER_REQUEST_LIMITS } from "@/lib/firestore/courseMemberRequests";
import { ASK_REFUSAL } from "./words";

/**
 * THE BODIES OF THE ROUTES ABOUT A REQUEST TO GO TO ANOTHER SESSION, read
 * whole before anything else is. Pure: reads nothing.
 *
 *   ask       { hostGroupId, reason?, online? }  the week is never sent: it is the week of their next session; `online` is the tick
 *   approve   { emailCount, overLimit?, reply? } the count of emails the button showed, and whether the page showed the session full
 *   decline   { reply }                         the reply is needed
 *   reply     { reply }                         a reply without deciding
 *
 * A field a route does not know refuses the body. The person's words and a
 * reply are one line each, capped, with no link: as a request to be excused
 * holds them.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function objectBody(raw: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!fields.includes(key)) return null;
  return body;
}

function isGroupRef(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= 200 && !value.includes("/");
}

/** "Anything to add (optional)": absent or blank is "", otherwise one line, capped, no link. */
export function parseVisitReason(raw: unknown): Parsed<string> {
  if (raw === undefined || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: ASK_REFUSAL.reasonText };
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  if (/[\r\n]/.test(value)) return { ok: false, error: ASK_REFUSAL.reasonLine };
  if (value.length > MEMBER_REQUEST_LIMITS.reason) return { ok: false, error: tooLongWords("reason", MEMBER_REQUEST_LIMITS.reason) };
  if (couldBeFollowed(value)) return { ok: false, error: ASK_REFUSAL.reasonLink };
  return { ok: true, value: value.replace(/\s+/g, " ") };
}

export type VisitAskPress = { hostGroupId: string; reason: string; online: boolean };

/** The ask: which session (by its group), anything they add, and whether they ticked "I’d join online" (absent is not ticked). */
export function parseVisitAsk(raw: unknown): Parsed<VisitAskPress> {
  const body = objectBody(raw, ["hostGroupId", "reason", "online"]);
  if (!body) return { ok: false, error: ASK_REFUSAL.body };
  if (!isGroupRef(body.hostGroupId)) return { ok: false, error: ASK_REFUSAL.chooseFirst };
  const reason = parseVisitReason(body.reason);
  if (!reason.ok) return reason;
  if (body.online !== undefined && typeof body.online !== "boolean") return { ok: false, error: ASK_REFUSAL.online };
  return { ok: true, value: { hostGroupId: body.hostGroupId, reason: reason.value, online: body.online === true } };
}

export const REPLY_REFUSAL = {
  body: "Expected a JSON object body.",
  reply: "Write a reply to say why it’s declined.",
  replyEmpty: "Write a reply.",
  replyText: "The reply must be text.",
  replyLine: "The reply must be one line.",
  replyLink: "Leave links out of the reply.",
  emailCount: "Say how many people the button said it would email.",
  overLimit: "Say that the page showed the session is full.",
} as const;

/** A reply: needed (`empty` says what for), or optional (`empty` null), one line, capped, no link. */
function parseReply(raw: unknown, empty: string | null): Parsed<string> {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return empty === null ? { ok: true, value: "" } : { ok: false, error: empty };
  }
  if (typeof raw !== "string") return { ok: false, error: REPLY_REFUSAL.replyText };
  const value = raw.trim();
  if (/[\r\n]/.test(value)) return { ok: false, error: REPLY_REFUSAL.replyLine };
  if (value.length > MEMBER_REQUEST_LIMITS.reply) return { ok: false, error: tooLongWords("reply", MEMBER_REQUEST_LIMITS.reply) };
  if (couldBeFollowed(value)) return { ok: false, error: REPLY_REFUSAL.replyLink };
  return { ok: true, value };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export type ApprovePress = { emailCount: number; overLimit: boolean; reply: string };

/** Approving: the count of emails the button showed, whether the page showed the session full, and an optional reply. */
export function parseApprove(raw: unknown): Parsed<ApprovePress> {
  const body = objectBody(raw, ["emailCount", "overLimit", "reply"]);
  if (!body) return { ok: false, error: REPLY_REFUSAL.body };
  if (!isCount(body.emailCount)) return { ok: false, error: REPLY_REFUSAL.emailCount };
  if (body.overLimit !== undefined && typeof body.overLimit !== "boolean") return { ok: false, error: REPLY_REFUSAL.overLimit };
  const reply = parseReply(body.reply, null);
  if (!reply.ok) return reply;
  return { ok: true, value: { emailCount: body.emailCount, overLimit: body.overLimit === true, reply: reply.value } };
}

/** Declining (the reply is needed), or replying without deciding (the reply is the press). */
export function parseReplyBody(raw: unknown, action: "decline" | "reply"): Parsed<{ reply: string }> {
  const body = objectBody(raw, ["reply"]);
  if (!body) return { ok: false, error: REPLY_REFUSAL.body };
  const reply = parseReply(body.reply, action === "decline" ? REPLY_REFUSAL.reply : REPLY_REFUSAL.replyEmpty);
  if (!reply.ok) return reply;
  return { ok: true, value: { reply: reply.value } };
}
