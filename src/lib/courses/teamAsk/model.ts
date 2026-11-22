import { couldBeFollowed } from "../followable";
import { ACCESS_TOPIC, TEAM_MESSAGE_LIMITS, TEAM_TOPICS, type TeamTopic } from "@/lib/firestore/courseTeamAsks";
import { ACCESS_REFUSAL, ASK_REFUSAL, REPLY_REFUSAL } from "./words";

/**
 * THE BODIES OF ASK THE TEAM'S ROUTES, read whole before anything else is.
 * Pure: reads nothing.
 *
 *   ask     { topic, words }   a topic the form offers, and the message
 *           { topic: "access", words, tellFacilitator? }   the access form's own:
 *                              what would help, and the tick (false unless true)
 *   reply   { reply }          one paragraph, no link, up to 600 characters
 *
 * A field a route does not know refuses the body. The message keeps its line
 * breaks and may carry a link (the address of a broken page is the point of
 * "Something's wrong"); it is shown as plain text and never made into one.
 * A reply goes into an email, so it carries no link the site did not build.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function objectBody(raw: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!fields.includes(key)) return null;
  return body;
}

export type AskPress = { topic: TeamTopic; words: string } | { topic: typeof ACCESS_TOPIC; words: string; tellFacilitator: boolean };

/** What would help, from the access form: needed, up to 2,000 characters, and the tick, off unless a true. */
function parseAccessAsk(body: Record<string, unknown>): Parsed<AskPress> {
  if (body.words !== undefined && body.words !== null && typeof body.words !== "string") return { ok: false, error: ASK_REFUSAL.body };
  if (body.tellFacilitator !== undefined && typeof body.tellFacilitator !== "boolean") return { ok: false, error: ASK_REFUSAL.body };
  const words = typeof body.words === "string" ? body.words.replace(/\r\n?/g, "\n").trim() : "";
  if (!words) return { ok: false, error: ACCESS_REFUSAL.empty };
  if (words.length > TEAM_MESSAGE_LIMITS.words) return { ok: false, error: ACCESS_REFUSAL.long };
  return { ok: true, value: { topic: ACCESS_TOPIC, words, tellFacilitator: body.tellFacilitator === true } };
}

/** A message to the team: which topic, and the words; or the access form's ask. */
export function parseAsk(raw: unknown): Parsed<AskPress> {
  const body = objectBody(raw, ["topic", "words", "tellFacilitator"]);
  if (!body) return { ok: false, error: ASK_REFUSAL.body };
  if (body.topic === undefined || body.topic === null || body.topic === "") return { ok: false, error: ASK_REFUSAL.chooseFirst };
  if (body.topic === ACCESS_TOPIC) return parseAccessAsk(body);
  // The tick belongs to the access form alone.
  if (body.tellFacilitator !== undefined) return { ok: false, error: ASK_REFUSAL.body };
  if (typeof body.topic !== "string" || !(TEAM_TOPICS as readonly string[]).includes(body.topic)) {
    return { ok: false, error: ASK_REFUSAL.notOffered };
  }
  if (body.words !== undefined && body.words !== null && typeof body.words !== "string") return { ok: false, error: ASK_REFUSAL.body };
  const words = typeof body.words === "string" ? body.words.replace(/\r\n?/g, "\n").trim() : "";
  if (!words) return { ok: false, error: ASK_REFUSAL.empty };
  if (words.length > TEAM_MESSAGE_LIMITS.words) return { ok: false, error: ASK_REFUSAL.long };
  return { ok: true, value: { topic: body.topic as TeamTopic, words } };
}

/** A reply: needed, one paragraph, no link, capped. */
export function parseReply(raw: unknown): Parsed<{ reply: string }> {
  const body = objectBody(raw, ["reply"]);
  if (!body) return { ok: false, error: REPLY_REFUSAL.body };
  if (body.reply === undefined || body.reply === null || typeof body.reply !== "string" || body.reply.trim() === "") {
    return { ok: false, error: REPLY_REFUSAL.empty };
  }
  const reply = body.reply.trim();
  if (/[\r\n]/.test(reply)) return { ok: false, error: REPLY_REFUSAL.paragraph };
  if (reply.length > TEAM_MESSAGE_LIMITS.reply) return { ok: false, error: REPLY_REFUSAL.long };
  if (couldBeFollowed(reply)) return { ok: false, error: REPLY_REFUSAL.link };
  return { ok: true, value: { reply: reply.replace(/\s+/g, " ") } };
}
