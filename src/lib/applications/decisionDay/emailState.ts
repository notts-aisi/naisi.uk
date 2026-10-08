import type { ApplicationResult } from "../model";

/**
 * WHAT BECAME OF ONE PERSON'S DECISION EMAIL.
 *
 * A result is published first and its email follows, so the two can come
 * apart: the mail can be down, or a press can be cut off between them. The
 * person's own `result` therefore records what became of the email
 * (`ResultEmailState` in `../model`), and this module is how that record is
 * read and how a failure is placed.
 *
 * ## The one rule
 *
 * AN EMAIL IS SENT AGAIN ONLY WHEN THE SITE KNOWS THE LAST ATTEMPT HANDED
 * NOTHING OVER. That is the state `owed`. Every other state is left alone by
 * every later press:
 *
 *  - `sent`, `not-sent`, `held` and `suppressed` are settled.
 *  - `sending` belongs to the press that took it up. Only one press can hold
 *    it, because it is taken in a transaction that requires `owed` (or, for
 *    somebody being told for the first time, no result at all).
 *  - `unconfirmed` is an attempt nobody can vouch for either way: the message
 *    may have reached the mail provider or may not. It is never sent again by
 *    the site, because the one thing worse than a late email here is the same
 *    decision arriving twice. The page names the person so somebody can look.
 *
 * A press that dies while it holds an email leaves `sending` behind. Nothing
 * takes that over. Once the claim is older than any press can live
 * ({@link EMAIL_CLAIM_MS}) it reads as `unconfirmed`, which is what it is.
 *
 * Pure, with no imports that run, so the send, the page and the tests read
 * one definition.
 */

/**
 * How long a claim is taken to be a press still at work. A request lives for
 * about a minute, so anything older was cut off.
 */
export const EMAIL_CLAIM_MS = 5 * 60_000;

/** A result's email as a later press and the page read it. */
export type EmailStanding =
  /** To send: a press takes it up. */
  | "owed"
  /** A press is sending it right now. */
  | "in-flight"
  | "sent"
  | "not-sent"
  | "held"
  | "suppressed"
  /** Nobody can say whether it went. Left alone. */
  | "unconfirmed";

export function emailStanding(
  result: Pick<ApplicationResult, "email" | "emailClaimedAt">,
  now: Date,
): EmailStanding {
  if (result.email !== "sending") return result.email;
  const claimedAt = result.emailClaimedAt?.getTime();
  // A claim with no time on it cannot be waited out, so it is read as cut off.
  if (claimedAt === undefined || now.getTime() - claimedAt > EMAIL_CLAIM_MS) return "unconfirmed";
  return "in-flight";
}

/** Whether a send that threw can have handed a message to the mail provider. */
export type Handover =
  /** It cannot: the provider refused it in words, or was never reached. */
  | "not-handed-over"
  /** It may have: the conversation broke off with no answer. */
  | "unknown";

/**
 * Failures the mail library reports before any message is offered: the
 * provider's name did not resolve, the secure channel was not set up, the
 * sign-in was refused, the sender or the recipient was refused.
 */
const BEFORE_THE_MESSAGE: ReadonlySet<string> = new Set(["EDNS", "ETLS", "EAUTH", "EENVELOPE"]);

/** The two timeouts that happen while a connection is still being opened. */
const WHILE_CONNECTING = /^(Connection timeout|Greeting never received)/;

/**
 * Place a failed send.
 *
 * It answers `not-handed-over` only for a failure it positively recognises,
 * and `unknown` for everything else, so a shape nobody has seen before is
 * never tried again. Three things are recognised:
 *
 *  1. THE PROVIDER ANSWERED, AND REFUSED: the error carries the provider's own
 *     reply code, 400 or above. At any point in the conversation that means
 *     the message was not accepted.
 *  2. THE PROVIDER WAS NEVER REACHED: the connection itself failed.
 *  3. THE CONVERSATION STOPPED BEFORE THE MESSAGE: one of the named failures
 *     above, or a timeout while connecting.
 *
 * A timeout or a dropped connection later than that is `unknown`: the message
 * may already have been taken, and only the acknowledgement lost.
 */
export function handoverAfter(err: unknown): Handover {
  if (!err || typeof err !== "object") return "unknown";
  const failure = err as {
    code?: unknown;
    responseCode?: unknown;
    syscall?: unknown;
    message?: unknown;
  };
  if (typeof failure.responseCode === "number" && failure.responseCode >= 400) {
    return "not-handed-over";
  }
  if (failure.syscall === "connect" || failure.syscall === "getaddrinfo") return "not-handed-over";
  if (typeof failure.code === "string" && BEFORE_THE_MESSAGE.has(failure.code)) {
    return "not-handed-over";
  }
  if (
    failure.code === "ETIMEDOUT" &&
    typeof failure.message === "string" &&
    WHILE_CONNECTING.test(failure.message)
  ) {
    return "not-handed-over";
  }
  return "unknown";
}
