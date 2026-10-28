/**
 * ASKING PEOPLE TO FACILITATE, AND THE FACILITATORS' TRAINING (boards
 * st-facilitators and st-fac-ask-phone, Q6 option B: "Ask, then train").
 *
 * A programme's lead, or an admin, asks somebody who said on the application
 * form that they would like to facilitate. They get one email, and say yes or
 * no on the site by the day and time the lead chose. Yes puts them on the
 * group as a facilitator; no is recorded and the lead can ask somebody else.
 * Training is a dated session with a room, a setting of the run.
 *
 * ## The one collection: `courseFacilitating`
 *
 * Written only by the routes under
 * `/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators` and
 * `/api/courses/facilitator-asks/[askId]/answer`, read only on the server, and
 * refused to every browser by `firestore.rules`. Four kinds of document, each
 * telling which it is by `kind` and carrying every part of its id as a field:
 *
 *  - an ASK, at an id the database makes (it is the address in the email):
 *    `{ kind: "ask", runId, roundId, programmeId, groupId, uid, seat,
 *    askedByUid, askedAt, replyBy: { dateKey, time }, answer, answeredAt,
 *    remindedAt, reminders, delivery, email, toName, firstName, leadName,
 *    case }`. `case` is null for somebody who offered on the form; for
 *    somebody who did NOT offer it is the admin's sentence the email made the
 *    case with (see "Making the case" below). `email` is
 *    the email as it went, so the lead's view shows it exactly as sent, and
 *    `toName` and `leadName` are the names it was sent to and signed with,
 *    so the answer page says what the email said. None holds an address.
 *  - `{runId}__training`: the run's training session.
 *    `{ kind: "training", runId, dateKey, time, room, setByUid, setAt }`.
 *    Deleted when the training is cleared.
 *  - `{runId}__asktest`: the last test of the ask's email that reached its
 *    sender. `{ kind: "ask-test", runId, byUid, at, wording, replyBy }`.
 *  - `{runId}__casetest`: the same for the email that makes the case,
 *    `{ kind: "case-test", ... }`, kept apart so testing one never makes the
 *    other's test stale.
 *
 * ## Making the case
 *
 * An admin may also ask somebody who did NOT offer to facilitate, when the
 * term's plan (or anybody's judgement) says they would be good at it: one
 * person holding a place on this programme, one group, the same yes or no by
 * a day and time, with a sentence of the admin's own saying why them. Only an
 * admin, because the people who did not offer are only listed for an admin.
 * It is meant for a group that already has a facilitator who offered, so the
 * group never waits on the answer; the screen says so.
 *
 * ## The seat
 *
 * Each ask is for one place among a group's facilitators: its SEAT. An ask
 * made from the list of people starts a seat of its own (`seat` is its own
 * id). "Ask someone else" asks another person for the same seat (`seat` is
 * the first ask's). The first yes takes the seat, and every other ask for it
 * is closed from then on: the person's page says somebody else has it.
 *
 * Every document goes with the run when it is destroyed (`runId`), and an ask
 * goes with the account of the person asked (`uid`).
 *
 * Pure: no reads, no writes, nothing server-only, so a page's client code may
 * import the types from here.
 */

import { isAddressableId } from "../../addressableId";

export const FACILITATING_COLLECTION = "courseFacilitating";

/** Bounds of the stored values. Field limits, not settings of any term. */
export const FACILITATING_LIMITS = {
  /** A room, as long as a group's own (`GROUP_FIELD_LIMITS.location`). */
  room: 200,
  /** A uid or an id in a request body: well above any real one. */
  id: 128,
  /** The most asks one run keeps. Far above any term's facilitators. */
  maxAsksPerRun: 300,
  /** The sentence that makes the case to somebody who did not offer. */
  caseText: 600,
  /** Reminders to one person for one ask. */
  maxReminders: 3,
  /** The least time between two reminders to one person. */
  remindAfterMs: 12 * 60 * 60 * 1000,
} as const;

/** The run's training document. CONSTRUCT-ONLY, NEVER PARSE: run ids already contain `__`. */
export function trainingId(runId: string): string {
  return `${runId}__training`;
}

/** The run's last test of the ask's email. CONSTRUCT-ONLY, NEVER PARSE. */
export function askTestId(runId: string): string {
  return `${runId}__asktest`;
}

/** Which email an ask sends: the usual one, or the one that makes the case to somebody who did not offer. */
export type AskWording = "offered" | "case";

/** The run's last test of the email that makes the case. CONSTRUCT-ONLY, NEVER PARSE. */
export function caseTestId(runId: string): string {
  return `${runId}__casetest`;
}

/** The test document for one wording. */
export function testIdFor(runId: string, wording: AskWording): string {
  return wording === "case" ? caseTestId(runId) : askTestId(runId);
}

/** A London wall clock: a civil date and a 24-hour time. */
export type WallClock = {
  /** "2026-10-28". */
  dateKey: string;
  /** "12:00". */
  time: string;
};

/** The run's training session: when, and in which room. */
export type FacilitatorTraining = WallClock & {
  runId: string;
  room: string;
  setByUid: string;
  setAt: Date | null;
};

export type AskAnswer = "yes" | "no";

/**
 * What the mail door did with the email that asked. `sending` is the claim
 * an ask is written with before its email goes; the send settles it, or
 * takes the ask back when the email did not go.
 */
export type AskDelivery = "sending" | "sent" | "held" | "suppressed";

/** The email as it went, kept so the lead's view shows it exactly as sent. No address. */
export type SentAskEmail = {
  subject: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; href: string };
  signOff: { name: string; role: string };
};

export type FacilitatorAsk = {
  id: string;
  runId: string;
  roundId: string;
  programmeId: string;
  groupId: string;
  /** The person asked. */
  uid: string;
  /** The seat this ask is for: its own id, or the first ask's ("Ask someone else"). */
  seat: string;
  /** Who asked, or "" once that account is gone. */
  askedByUid: string;
  askedAt: Date | null;
  /** Answer by this London wall clock. Chosen when asking. */
  replyBy: WallClock;
  answer: AskAnswer | null;
  answeredAt: Date | null;
  remindedAt: Date | null;
  reminders: number;
  delivery: AskDelivery;
  email: SentAskEmail;
  /** The name the email was sent to: "Grace Okoye". */
  toName: string;
  /** What the email called them: "Grace". A reminder calls them the same. */
  firstName: string;
  /** The admin's sentence that made the case to somebody who did not offer, or null. */
  case: string | null;
  /** The first name the email was signed with, or "" when it was signed NAISI. */
  leadName: string;
};

/** The last test of the ask's email that reached the person who sent it. */
export type AskTest = {
  runId: string;
  byUid: string;
  at: Date | null;
  /** The fingerprint of the wording and the reply-by it was sent for (`./tested.ts`). */
  wording: string;
  replyBy: WallClock;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const holder = value as { toDate?: () => Date } | null;
  if (holder && typeof holder.toDate === "function") {
    const date = holder.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "2026-10-28", and a day that exists. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "12:00": a 24-hour time of day. */
export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

function wallClockIn(value: unknown): WallClock | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return isDateKey(raw.dateKey) && isTime(raw.time) ? { dateKey: raw.dateKey, time: raw.time } : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function sentEmailIn(value: unknown): SentAskEmail | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const button = (raw.button ?? {}) as Record<string, unknown>;
  const signOff = (raw.signOff ?? {}) as Record<string, unknown>;
  const paragraphs = Array.isArray(raw.paragraphs)
    ? raw.paragraphs.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (typeof raw.subject !== "string" || paragraphs.length === 0) return null;
  return {
    subject: raw.subject,
    greeting: typeof raw.greeting === "string" ? raw.greeting : "",
    paragraphs,
    button: {
      label: typeof button.label === "string" ? button.label : "",
      href: typeof button.href === "string" ? button.href : "",
    },
    signOff: {
      name: typeof signOff.name === "string" ? signOff.name : "",
      role: typeof signOff.role === "string" ? signOff.role : "",
    },
  };
}

const ANSWERS: readonly AskAnswer[] = ["yes", "no"];
const DELIVERIES: readonly AskDelivery[] = ["sending", "sent", "held", "suppressed"];

/**
 * A stored ask, or null for a document that is not one: another kind, or one
 * missing what every reader needs. Read by id, so `id` is the document's own.
 */
export function normalizeAsk(id: string, data: Record<string, unknown> | undefined): FacilitatorAsk | null {
  if (!data || data.kind !== "ask") return null;
  const ids = ["runId", "roundId", "programmeId", "groupId", "uid", "seat"] as const;
  for (const key of ids) {
    const value = data[key];
    if (typeof value !== "string" || !isAddressableId(value)) return null;
  }
  const replyBy = wallClockIn(data.replyBy);
  const email = sentEmailIn(data.email);
  if (!replyBy || !email) return null;
  const reminders = typeof data.reminders === "number" && Number.isInteger(data.reminders) ? data.reminders : 0;
  return {
    id,
    runId: data.runId as string,
    roundId: data.roundId as string,
    programmeId: data.programmeId as string,
    groupId: data.groupId as string,
    uid: data.uid as string,
    seat: data.seat as string,
    askedByUid: typeof data.askedByUid === "string" ? data.askedByUid : "",
    askedAt: asDate(data.askedAt),
    replyBy,
    answer: ANSWERS.includes(data.answer as AskAnswer) ? (data.answer as AskAnswer) : null,
    answeredAt: asDate(data.answeredAt),
    remindedAt: asDate(data.remindedAt),
    reminders: Math.max(0, reminders),
    delivery: DELIVERIES.includes(data.delivery as AskDelivery) ? (data.delivery as AskDelivery) : "sending",
    email,
    toName: text(data.toName, 200),
    firstName: text(data.firstName, 120),
    leadName: text(data.leadName, 120),
    case: typeof data.case === "string" && data.case.trim() ? data.case.trim().slice(0, FACILITATING_LIMITS.caseText) : null,
  };
}

/** The run's training, or null for a document that is not it. */
export function normalizeTraining(
  id: string,
  data: Record<string, unknown> | undefined,
): FacilitatorTraining | null {
  if (!data || data.kind !== "training") return null;
  if (typeof data.runId !== "string" || trainingId(data.runId) !== id) return null;
  const when = wallClockIn(data);
  const room = text(data.room, FACILITATING_LIMITS.room);
  if (!when || room === "") return null;
  return {
    runId: data.runId,
    dateKey: when.dateKey,
    time: when.time,
    room,
    setByUid: typeof data.setByUid === "string" ? data.setByUid : "",
    setAt: asDate(data.setAt),
  };
}

/** The run's last test, or null for a document that is not it. */
export function normalizeAskTest(id: string, data: Record<string, unknown> | undefined): AskTest | null {
  if (!data || (data.kind !== "ask-test" && data.kind !== "case-test")) return null;
  const wording: AskWording = data.kind === "case-test" ? "case" : "offered";
  if (typeof data.runId !== "string" || testIdFor(data.runId, wording) !== id) return null;
  const replyBy = wallClockIn(data.replyBy);
  if (!replyBy || typeof data.wording !== "string" || typeof data.byUid !== "string") return null;
  return { runId: data.runId, byUid: data.byUid, at: asDate(data.at), wording: data.wording, replyBy };
}

// ---------------------------------------------------------------------------
// What a request may carry
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const NOT_A_DAY = "Choose a day that exists, as a date.";
const NOT_A_TIME = "Choose a time of day, such as 12:00.";

/** A day and a time from a request: `{ dateKey, time }`. */
export function parseWallClock(raw: unknown): Parsed<WallClock> {
  if (!raw || typeof raw !== "object") return { ok: false, error: NOT_A_DAY };
  const body = raw as Record<string, unknown>;
  if (!isDateKey(body.dateKey)) return { ok: false, error: NOT_A_DAY };
  if (!isTime(body.time)) return { ok: false, error: NOT_A_TIME };
  return { ok: true, value: { dateKey: body.dateKey, time: body.time } };
}

/**
 * The training a lead sets: a day, a time and a room, all three, or `null` to
 * clear it. A training with no room is not one the email can name whole.
 */
export function parseTraining(raw: unknown): Parsed<(WallClock & { room: string }) | null> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Send the training as a day, a time and a room." };
  const body = raw as Record<string, unknown>;
  if (body.training === null) return { ok: true, value: null };
  const when = parseWallClock(body.training);
  if (!when.ok) return when;
  const roomRaw = (body.training as Record<string, unknown>).room;
  if (typeof roomRaw !== "string" || roomRaw.trim() === "") {
    return { ok: false, error: "Say which room the training is in." };
  }
  if (roomRaw.trim().length > FACILITATING_LIMITS.room) {
    return { ok: false, error: `Keep the room to ${FACILITATING_LIMITS.room} characters.` };
  }
  return { ok: true, value: { ...when.value, room: text(roomRaw, FACILITATING_LIMITS.room) } };
}

/** An id from a request body: a string a document can be addressed by. */
export function idIn(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= FACILITATING_LIMITS.id &&
    isAddressableId(value)
    ? value
    : null;
}
