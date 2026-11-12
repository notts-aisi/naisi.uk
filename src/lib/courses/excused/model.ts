import { couldBeFollowed } from "@/lib/courses/followable";
import { cameBy, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import {
  EXCUSED_LIMITS,
  type ExcusedRegisterOutcome,
  type ExcusedRequestDoc,
  type ExcusedWeek,
} from "@/lib/firestore/courseExcusedRequests";
import { EXCUSED_REFUSAL, tooLongWords, type ApprovedFor, type ExcuseFact, type ExcusedKind } from "./words";

/**
 * ASKING TO BE EXCUSED FROM A WEEK, AS ARITHMETIC: what a press says, which
 * sessions somebody may ask about, what approving a week does to its
 * register, where a person stands on a session, and the one fact a
 * facilitator is shown. Pure: no reads, no clock.
 *
 * ## The rules it holds
 *
 *  - WHO ASKS is the route's (somebody holding a told place in the group, not
 *    a facilitator of it); WHICH SESSIONS is `askState`: a session of their
 *    group, dated, not called off, that happened or is still to come; before
 *    it starts, while their line does not already say excused or that they
 *    came; after it, only once its register is finished and says Absent. Not
 *    twice for the same session while a request about it waits or was
 *    approved. Until the programme closes (the route's, from `closes.ts`).
 *  - APPROVING writes the register in the decision's own transaction
 *    (`approvalPlan`): before the session, the line says excused exactly as
 *    "Can't make it" writes it; after it, on a register still being taken,
 *    the line says excused; on a finished register, Absent becomes Excused
 *    as a correction made by the approval. A line that says they came, or
 *    already says excused, is left alone, and the week is approved all the
 *    same. Declining and withdrawing never touch a register.
 *  - A FACILITATOR AND A LEAD are shown one of two facts per person per
 *    session (`factOf`): asked and waiting, or excused. Never the reason,
 *    never how often.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A session key as `sessionKey` makes it: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2}(?:-[2-9])?$/;

/** "w03" or "w03-2", as its week and occurrence, or null. */
export function sessionKeyParts(key: string): { weekNumber: number; occurrence: number } | null {
  const match = /^w(\d{2})(?:-(\d))?$/.exec(key);
  if (!match) return null;
  const weekNumber = Number(match[1]);
  const occurrence = match[2] ? Number(match[2]) : 1;
  return weekNumber >= 1 && occurrence >= 1 ? { weekNumber, occurrence } : null;
}

/** One line of text as a reason or a reply is held to it: needed, one line, no link, capped. */
function oneLine(
  raw: unknown,
  words: { empty: string; text: string; line: string; link: string },
  what: "reason" | "reply",
  max: number,
): Parsed<string> {
  if (raw === undefined || raw === null) return { ok: false, error: words.empty };
  if (typeof raw !== "string") return { ok: false, error: words.text };
  const value = raw.trim();
  if (!value) return { ok: false, error: words.empty };
  if (/[\r\n]/.test(value)) return { ok: false, error: words.line };
  if (value.length > max) return { ok: false, error: tooLongWords(what, max) };
  if (couldBeFollowed(value)) return { ok: false, error: words.link };
  return { ok: true, value };
}

const REASON_WORDS = {
  empty: EXCUSED_REFUSAL.reason,
  text: EXCUSED_REFUSAL.reasonText,
  line: EXCUSED_REFUSAL.reasonLine,
  link: EXCUSED_REFUSAL.reasonLink,
};

/** The reason: one short line, needed. */
export function parseExcusedReason(raw: unknown): Parsed<string> {
  return oneLine(raw, REASON_WORDS, "reason", EXCUSED_LIMITS.reason);
}

/** A reply: one line, needed (`empty` says what for), capped. */
export function parseExcusedReply(raw: unknown, empty: string): Parsed<string> {
  return oneLine(
    raw,
    { empty, text: EXCUSED_REFUSAL.replyText, line: EXCUSED_REFUSAL.replyLine, link: EXCUSED_REFUSAL.replyLink },
    "reply",
    EXCUSED_LIMITS.reply,
  );
}

function objectBody(raw: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!fields.includes(key)) return null;
  return body;
}

/** What asking says: the sessions, by their registers' keys, and why. */
export type AskPress = { sessionKeys: string[]; reason: string };

/** The body of an ask, or why it is not one. Reads nothing. */
export function parseAsk(raw: unknown): Parsed<AskPress> {
  const body = objectBody(raw, ["sessionKeys", "reason"]);
  if (!body) return { ok: false, error: EXCUSED_REFUSAL.body };
  if (!Array.isArray(body.sessionKeys) || body.sessionKeys.length === 0) return { ok: false, error: EXCUSED_REFUSAL.weeks };
  if (body.sessionKeys.length > EXCUSED_LIMITS.weeks) return { ok: false, error: EXCUSED_REFUSAL.tooMany };
  const keys: string[] = [];
  for (const key of body.sessionKeys) {
    if (typeof key !== "string" || !SESSION_KEY.test(key)) return { ok: false, error: EXCUSED_REFUSAL.weeks };
    if (keys.includes(key)) return { ok: false, error: EXCUSED_REFUSAL.sameWeek };
    keys.push(key);
  }
  const reason = parseExcusedReason(body.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { sessionKeys: keys, reason: reason.value } };
}

/** Withdrawing: one week (`sessionKey`), or every week still waiting (none named). */
export function parseWithdraw(raw: unknown): Parsed<{ sessionKey: string | null }> {
  if (raw === undefined || raw === null) return { ok: true, value: { sessionKey: null } };
  const body = objectBody(raw, ["sessionKey"]);
  if (!body) return { ok: false, error: EXCUSED_REFUSAL.body };
  if (body.sessionKey === undefined || body.sessionKey === null) return { ok: true, value: { sessionKey: null } };
  if (typeof body.sessionKey !== "string" || !SESSION_KEY.test(body.sessionKey)) return { ok: false, error: EXCUSED_REFUSAL.week };
  return { ok: true, value: { sessionKey: body.sessionKey } };
}

/** Approving or declining one week: which, and the reply (needed to decline, optional to approve). */
export function parseDecision(raw: unknown, opts: { replyNeeded: boolean }): Parsed<{ sessionKey: string; reply: string }> {
  const body = objectBody(raw, ["sessionKey", "reply"]);
  if (!body) return { ok: false, error: EXCUSED_REFUSAL.body };
  if (typeof body.sessionKey !== "string" || !SESSION_KEY.test(body.sessionKey)) return { ok: false, error: EXCUSED_REFUSAL.week };
  if (!opts.replyNeeded && (body.reply === undefined || body.reply === null || (typeof body.reply === "string" && body.reply.trim() === ""))) {
    return { ok: true, value: { sessionKey: body.sessionKey, reply: "" } };
  }
  const reply = parseExcusedReply(body.reply, EXCUSED_REFUSAL.reply);
  if (!reply.ok) return reply;
  return { ok: true, value: { sessionKey: body.sessionKey, reply: reply.value } };
}

/** A reply without deciding: the reply, needed. */
export function parseReplyPress(raw: unknown): Parsed<{ reply: string }> {
  const body = objectBody(raw, ["reply"]);
  if (!body) return { ok: false, error: EXCUSED_REFUSAL.body };
  const reply = parseExcusedReply(body.reply, EXCUSED_REFUSAL.replyEmpty);
  if (!reply.ok) return reply;
  return { ok: true, value: { reply: reply.value } };
}

// ---------------------------------------------------------------------------
// Which sessions may be asked about
// ---------------------------------------------------------------------------

/** What one register holds about one person, as far as this asks. */
export type ExcuseLine = {
  /** The register exists and is finished. */
  finished: boolean;
  /** The register says the session did not happen. */
  notHeld: boolean;
  /** Their mark on it, or null. */
  mark: AttendanceStatus | null;
};

/** No register yet: nothing on it about anybody. */
export const NO_LINE: ExcuseLine = { finished: false, notHeld: false, mark: null };

/** Where the person's own requests stand on a session: one waiting, one approved, or neither. */
export type RequestStanding = "waiting" | "approved" | null;

export type AskClosed = "cancelled" | "undated" | "not-held" | "came" | "excused" | "waiting" | "approved" | "not-finished" | "not-absent";

export type AskState = { open: true; when: "before" | "after" } | { open: false; why: AskClosed };

/**
 * Whether one session may be asked about now, and if so whether before it
 * or after it. Whether the programme has closed, and whether this is one of
 * the person's sessions at all, are the caller's.
 */
export function askState(input: {
  startsAt: Date | null;
  cancelled: boolean;
  line: ExcuseLine;
  standing: RequestStanding;
  now: Date;
}): AskState {
  const { startsAt, cancelled, line, standing, now } = input;
  if (cancelled) return { open: false, why: "cancelled" };
  if (!startsAt) return { open: false, why: "undated" };
  if (line.notHeld) return { open: false, why: "not-held" };
  if (standing === "waiting") return { open: false, why: "waiting" };
  if (standing === "approved") return { open: false, why: "approved" };
  if (startsAt.getTime() > now.getTime()) {
    if (line.mark === "excused") return { open: false, why: "excused" };
    if (cameBy(line.mark)) return { open: false, why: "came" };
    return { open: true, when: "before" };
  }
  // After it starts, a register still being taken is its facilitators'
  // draft: nothing on it is said to the person until it is finished.
  if (!line.finished) return { open: false, why: "not-finished" };
  if (line.mark === "excused") return { open: false, why: "excused" };
  if (cameBy(line.mark)) return { open: false, why: "came" };
  if (line.mark !== "absent") return { open: false, why: "not-absent" };
  return { open: true, when: "after" };
}

// ---------------------------------------------------------------------------
// What approving a week does to its register
// ---------------------------------------------------------------------------

/**
 * How approving writes the register:
 *  - `in-advance`: before the session, on an empty line: excused, with when
 *    they asked, as "Can't make it" writes it, set by the approval;
 *  - `draft`: a register still being taken, on an empty line or one saying
 *    Absent: excused, set by the approval;
 *  - `correct`: a finished register whose line says Absent: a correction made
 *    by the approval (the history row, the `corrected` stamp, the figures);
 *  - `keep`: nothing is written.
 */
export type ApprovalWrite = "in-advance" | "draft" | "correct" | "keep";

export type ApprovalPlan = {
  write: ApprovalWrite;
  /** What the week records it did. */
  outcome: ExcusedRegisterOutcome;
  /** What the person's email says about the register. */
  say: ApprovedFor;
  /** The register says excused once it is done, so the group's facilitators are told. */
  tellsFacilitators: boolean;
  /** Why nothing is written, for `keep`: the line says they came, already says excused, the session did not happen, a finished register has no line for them, or the register is full. */
  kept?: "came" | "excused" | "not-held" | "no-line" | "full";
};

export function approvalPlan(input: {
  startsAt: Date | null;
  cancelled: boolean;
  line: ExcuseLine;
  now: Date;
}): ApprovalPlan {
  const { startsAt, cancelled, line, now } = input;
  const before = startsAt !== null && startsAt.getTime() > now.getTime();
  if (cancelled || line.notHeld) return { write: "keep", outcome: "kept", say: "not-held", tellsFacilitators: false, kept: "not-held" };
  // They came: said only once the register is finished, never a draft's mark.
  if (cameBy(line.mark)) return { write: "keep", outcome: "kept", say: line.finished ? "came" : "being-taken", tellsFacilitators: false, kept: "came" };
  if (line.mark === "excused") {
    return { write: "keep", outcome: "kept", say: before ? "before" : "excused-now", tellsFacilitators: true, kept: "excused" };
  }
  if (line.finished) {
    if (line.mark === "absent") return { write: "correct", outcome: "corrected", say: "excused-now", tellsFacilitators: true };
    // A finished register with no line for them: nothing a correction could
    // truthfully change into Excused.
    return { write: "keep", outcome: "kept", say: "no-line", tellsFacilitators: false, kept: "no-line" };
  }
  if (before && line.mark === null) return { write: "in-advance", outcome: "written", say: "before", tellsFacilitators: true };
  return { write: "draft", outcome: "written", say: before ? "before" : "excused-now", tellsFacilitators: true };
}

// ---------------------------------------------------------------------------
// Where a person stands on a session, from their requests
// ---------------------------------------------------------------------------

/** One week of one request, with the request it belongs to. */
export type WeekOfRequest = { request: ExcusedRequestDoc; week: ExcusedWeek };

/** Every week of these requests about this person and this session. */
export function weeksAbout(requests: readonly ExcusedRequestDoc[], uid: string, sessionKey: string): WeekOfRequest[] {
  const out: WeekOfRequest[] = [];
  for (const request of requests) {
    if (request.subjectUid !== uid) continue;
    for (const week of request.weeks) if (week.sessionKey === sessionKey) out.push({ request, week });
  }
  return out;
}

/** When a week last moved: decided, withdrawn, or asked. */
function movedAt({ request, week }: WeekOfRequest): number {
  return (week.decidedAt ?? week.withdrawnAt ?? request.askedAt ?? new Date(0)).getTime();
}

/**
 * The week that says where somebody stands on one session: one waiting,
 * else one approved, else the latest declined or withdrawn; null with none.
 */
export function standingWeek(weeks: readonly WeekOfRequest[]): WeekOfRequest | null {
  const waiting = weeks.filter((each) => each.week.status === "waiting").sort((a, b) => movedAt(b) - movedAt(a));
  if (waiting.length > 0) return waiting[0];
  const approved = weeks.filter((each) => each.week.status === "approved").sort((a, b) => movedAt(b) - movedAt(a));
  if (approved.length > 0) return approved[0];
  const rest = [...weeks].sort((a, b) => movedAt(b) - movedAt(a));
  return rest[0] ?? null;
}

/** Waiting or approved, for asking again; null for anything else. */
export function requestStandingOf(weeks: readonly WeekOfRequest[]): RequestStanding {
  const week = standingWeek(weeks)?.week;
  return week?.status === "waiting" || week?.status === "approved" ? week.status : null;
}

/** THE ONE FACT a facilitator and a lead are shown about one person on one session, or null. */
export function factOf(weeks: readonly WeekOfRequest[]): ExcuseFact | null {
  const standing = requestStandingOf(weeks);
  return standing === "waiting" ? "waiting" : standing === "approved" ? "excused" : null;
}

/**
 * How somebody came to be excused from one session, for admins and their
 * own card; null when they are not excused by any of the three (a
 * facilitator may still have marked them excused, which is the register's).
 */
export function excusedKindOf(input: {
  /** A request about this session was approved. */
  approved: boolean;
  mark: AttendanceStatus | null;
  /** When they said so in advance, as the register keeps it. */
  toldAt: Date | null;
  /** They ticked this session under "Most weeks, not all", in the answer that is current. */
  ticked: boolean;
  /** They ticked it in an answer to an earlier asking, kept on a week a new regular time did not move. */
  tickedBefore?: boolean;
}): ExcusedKind | null {
  if (input.approved) return "approved";
  if (input.ticked) return "time-set";
  if (input.mark === "excused" && input.toldAt) {
    return input.toldAt.getTime() < REQUESTS_BEGAN.getTime() && !input.tickedBefore ? "before-requests" : "in-advance";
  }
  return null;
}

/**
 * When requests to be excused began: the day they were built, before any
 * reached the site. A line told on somebody's own word before it was told
 * when the instant "Can't make it" was the only way, so it reads "Said in
 * advance, before requests"; one told on or after it reads "Said in
 * advance", which is true whenever it was said. A line from a day between
 * this and the day requests went live reads the plainer one: still true.
 */
export const REQUESTS_BEGAN = new Date("2026-11-12T00:00:00Z");
