import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * The pass a browser holds while it answers the AI at Nottingham survey.
 *
 * THE SERVER KEEPS NO RECORD OF A SESSION. Everything a session is lives in
 * the pass, in the browser: 32 random bytes made here, which shared document
 * the answers go in, the order this person sees the proposal pages, and when
 * the pass stops working. It is signed, so a browser cannot write one for
 * itself and skip the email check, and it is replaced by a fresh one on every
 * save, which is how "24 hours after the last save" is kept without the
 * server writing a time against anybody.
 *
 * That matters because an answer set must carry no date or time and no
 * session record must sit beside it: with nothing stored, there is nothing to
 * tidy and nothing to join.
 *
 * The answer set is keyed by a HASH of the 32 bytes, so the datastore never
 * holds the pass itself, and somebody reading the datastore cannot write as a
 * person who is part way through.
 *
 * It travels in a request body, never in an address, so it is in no log and
 * no history.
 */

export type AiSurveyPass = {
  /** The storage generation it was made in: cleared pilot data takes its passes with it. */
  epoch: string;
  /** 32 random bytes, base64url. */
  id: string;
  /** Which shared document holds this person's answers. */
  shard: number;
  /** The order this person sees the proposal pages. */
  order: string[];
  /** Epoch milliseconds after which the pass is refused. */
  expiresAt: number;
};

/** A pass works for 24 hours after its last save. */
export const PASS_LIFETIME_MS = 24 * 60 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string, key: Buffer): string {
  return b64url(createHmac("sha256", key).update("ai-survey-pass.v1:").update(payload).digest());
}

export function newPassId(): string {
  return b64url(randomBytes(32));
}

export function sealPass(pass: AiSurveyPass, key: Buffer): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ e: pass.epoch, i: pass.id, s: pass.shard, o: pass.order, x: pass.expiresAt })),
  );
  return `${payload}.${sign(payload, key)}`;
}

/**
 * The pass inside `token`, or null when it was not signed with `key`, has run
 * out, or is not a pass at all. One answer for every failure, so nothing is
 * learnt from which check refused it.
 */
export function openPass(token: unknown, key: Buffer, now: number): AiSurveyPass | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || token.indexOf(".", dot + 1) !== -1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { e, i, s, o, x } = parsed as Record<string, unknown>;
  if (typeof e !== "string" || typeof i !== "string" || typeof s !== "number" || typeof x !== "number") return null;
  if (!Number.isInteger(s) || s < 0) return null;
  if (!Array.isArray(o) || !o.every((v) => typeof v === "string")) return null;
  if (x <= now) return null;
  return { epoch: e, id: i, shard: s, order: o as string[], expiresAt: x };
}

/** The same pass with a new 24 hours, handed back after every save. */
export function renewPass(pass: AiSurveyPass, now: number): AiSurveyPass {
  return { ...pass, expiresAt: now + PASS_LIFETIME_MS };
}

/**
 * The key an answer set is stored under: a hash of the pass's random bytes.
 * 132 bits of it, which is far past any chance of two people sharing one.
 */
export function answerSetKey(pass: Pick<AiSurveyPass, "id">): string {
  return createHash("sha256").update("ai-survey-answers.v1:").update(pass.id).digest("base64url").slice(0, 22);
}

/** A whole number in [0, n) from the operating system's random source. */
export function randomBelow(n: number): number {
  return n <= 1 ? 0 : randomInt(n);
}

/** Six digits, each equally likely, leading zeros kept. */
export function newCode(): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}
