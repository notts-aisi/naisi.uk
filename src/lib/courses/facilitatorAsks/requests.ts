import { FACILITATING_LIMITS, idIn, parseWallClock, type Parsed, type WallClock } from "./model";

/**
 * WHAT EACH REQUEST ABOUT ASKING MAY CARRY, checked before anything is read.
 * Every refusal is a sentence a person can act on.
 *
 * Pure: the routes and the tests ask the same functions.
 */

const NOT_JSON = "Send the request as an object.";

/**
 * "Send a test to me": the person whose email to send, the group it names,
 * the day and time to answer by, and, for somebody who did not offer, the
 * admin's sentence that makes the case (`case`, null otherwise).
 */
export type TestRequest = { uid: string; groupId: string; replyBy: WallClock; case: string | null };

/** An ask: as a test, with the number of emails the button showed, and the seat for "Ask someone else". */
export type AskRequest = TestRequest & { emails: number; seat: string | null };

/** A reminder: the ask, and the number of emails the button showed. */
export type RemindRequest = { askId: string; emails: number };

/** An answer to an ask, from the person asked. */
export type AnswerRequest = { answer: "yes" | "no" };

function body(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

export function parseTestRequest(raw: unknown): Parsed<TestRequest> {
  const b = body(raw);
  if (!b) return { ok: false, error: NOT_JSON };
  const uid = idIn(b.uid);
  if (!uid) return { ok: false, error: "Say who to send the test as." };
  const groupId = idIn(b.groupId);
  if (!groupId) return { ok: false, error: "Choose the group the email asks them to facilitate." };
  const replyBy = parseWallClock(b.replyBy);
  if (!replyBy.ok) return replyBy;
  let made: string | null = null;
  if (b.case !== undefined && b.case !== null) {
    if (typeof b.case !== "string" || b.case.trim() === "") {
      return { ok: false, error: "Say in a sentence why you’re asking them." };
    }
    made = b.case.trim();
    if (made.length > FACILITATING_LIMITS.caseText) {
      return { ok: false, error: `Make the case in ${FACILITATING_LIMITS.caseText} characters or fewer.` };
    }
  }
  return { ok: true, value: { uid, groupId, replyBy: replyBy.value, case: made } };
}

export function parseAskRequest(raw: unknown): Parsed<AskRequest> {
  const test = parseTestRequest(raw);
  if (!test.ok) return test;
  const b = body(raw)!;
  if (typeof b.emails !== "number" || !Number.isInteger(b.emails) || b.emails < 0) {
    return { ok: false, error: "Send the number of emails the button showed." };
  }
  let seat: string | null = null;
  if (b.seat !== undefined && b.seat !== null) {
    seat = idIn(b.seat);
    if (!seat) return { ok: false, error: "That isn’t a place anybody was asked for." };
  }
  return { ok: true, value: { ...test.value, emails: b.emails, seat } };
}

export function parseRemindRequest(raw: unknown): Parsed<RemindRequest> {
  const b = body(raw);
  if (!b) return { ok: false, error: NOT_JSON };
  const askId = idIn(b.askId);
  if (!askId) return { ok: false, error: "Say whose ask to remind them of." };
  if (typeof b.emails !== "number" || !Number.isInteger(b.emails) || b.emails < 0) {
    return { ok: false, error: "Send the number of emails the button showed." };
  }
  return { ok: true, value: { askId, emails: b.emails } };
}

export function parseAnswerRequest(raw: unknown): Parsed<AnswerRequest> {
  const b = body(raw);
  if (!b || (b.answer !== "yes" && b.answer !== "no")) {
    return { ok: false, error: "Answer yes or no." };
  }
  return { ok: true, value: { answer: b.answer } };
}
