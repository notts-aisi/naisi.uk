import type { MemberRequestEvent, MemberRequestHistoryEntry, MemberRequestReply } from "./courseMemberRequests";

/**
 * A MESSAGE TO THE TEAM: a kind of `courseRequests/{autoId}` (`./courseRequests.ts`
 * holds the collection, its rules and its one top-level shape), read by its
 * own normaliser in this file and by nothing else.
 *
 * A signed-in member writes to the people running NAISI from "Ask the team"
 * (`/ask-the-team`): "Something's wrong on the site" or "Something else", in
 * their own words. Admins alone read it, take it and reply; one reply answers
 * it and closes it.
 *
 * IT BELONGS TO NO PROGRAMME. `runId` is `""`, and so are the group, the
 * session and the week, and the round and the programme are null: a message
 * about the site is about no run, and somebody may hold places on two. So no
 * reader keyed by a run ever finds one (a run's own list, its destroy
 * cascade, its counts, the visit and excused checks of a person's requests
 * on a run), and no run's ending touches one. It goes only with the account
 * (`deleteCourseRequestsOf`, by `askedByUid` and by `subjectUid`, both the
 * sender).
 *
 * ITS OWN NORMALISER. Every other normaliser of the collection reads the kind
 * first and answers null for any other, and this one answers null for
 * anything but `team-message` with no run. So no reader built on another kind
 * can count, list, decide or show one, and this one shows nothing else.
 *
 * ITS OWN STATUS. `waiting` until an admin replies, then `replied`: none of
 * the four statuses the other kinds share is true of an answered message.
 * The other normalisers check the kind before the status, so the new word
 * changes nothing they read.
 *
 * WHAT IS STORED:
 *
 *   kind          "team-message"
 *   runId ""      groupId "", sessionKey "", weekId "", roundId null, programmeId null
 *   subjectUid    the sender, and askedByUid the same
 *   askedAt       when the server took it
 *   askedOn       its London day ("2026-11-21"): the daily limit counts by it
 *   change        { topic: "site" | "else", words, replies: [{ text, byUid, at }] }
 *   status        "waiting" | "replied"
 *   handlingUid, handlingAt       Take it
 *   decidedByUid, decidedAt       who replied and when
 *   reply         the latest reply's text
 *   adminsToldOn  the London day the admins were emailed about it, or absent
 *   history       [{ what: "asked" | "taken" | "replied", byUid, at }]
 *   updatedAt
 *
 * `replies` is a list from the start, so a later round can let the team
 * reply more than once and close a message on its own press without a new
 * shape; today the first reply closes it.
 */

export const TEAM_MESSAGE_KIND = "team-message";

/** What a message is about: the topics the form offers that are written here. */
export type TeamTopic = "site" | "else";

export const TEAM_TOPICS: readonly TeamTopic[] = ["site", "else"];

export function isTeamTopic(value: unknown): value is TeamTopic {
  return typeof value === "string" && (TEAM_TOPICS as readonly string[]).includes(value);
}

/** Where a message is: waiting for a reply, or replied to (which closes it). */
export type TeamMessageStatus = "waiting" | "replied";

export const TEAM_MESSAGE_STATUSES: readonly TeamMessageStatus[] = ["waiting", "replied"];

/** What a message's history says happened. */
export type TeamMessageEvent = Extract<MemberRequestEvent, "asked" | "taken" | "replied">;

export const TEAM_MESSAGE_EVENTS: readonly TeamMessageEvent[] = ["asked", "taken", "replied"];

export const TEAM_MESSAGE_LIMITS = {
  /** The member's own words. */
  words: 2000,
  /** A reply: one paragraph. */
  reply: 600,
  /** Replies kept on one message. */
  replies: 20,
  /** History entries kept. */
  history: 20,
  /** Messages one person may send in one London day. */
  aDay: 5,
} as const;

export type TeamMessageDoc = {
  id: string;
  kind: typeof TEAM_MESSAGE_KIND;
  subjectUid: string;
  askedByUid: string;
  askedAt: Date | null;
  /** The London day it was sent ("2026-11-21"), or "" when not stored. */
  askedOn: string;
  topic: TeamTopic;
  /** The member's own words, line breaks kept. */
  words: string;
  status: TeamMessageStatus;
  handlingUid: string | null;
  handlingAt: Date | null;
  /** Who replied, and when; null while it waits. */
  decidedByUid: string | null;
  decidedAt: Date | null;
  /** The latest reply's text; "" with none. */
  reply: string;
  /** Replies, oldest first. */
  replies: MemberRequestReply[];
  /** The London day the admins were emailed about it, or "" when they were not. */
  adminsToldOn: string;
  history: Array<MemberRequestHistoryEntry & { what: TeamMessageEvent }>;
  updatedAt: Date | null;
};

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function uidOrEmpty(v: unknown): string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/") ? v : "";
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function repliesOf(v: unknown): MemberRequestReply[] {
  if (!Array.isArray(v)) return [];
  const out: MemberRequestReply[] = [];
  for (const entry of v) {
    if (out.length >= TEAM_MESSAGE_LIMITS.replies) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const text = typeof raw.text === "string" ? raw.text.slice(0, TEAM_MESSAGE_LIMITS.reply).trim() : "";
    const byUid = uidOrEmpty(raw.byUid);
    const at = tsToDate(raw.at);
    if (!text || !byUid || !at) continue;
    out.push({ text, byUid, at });
  }
  return out;
}

function historyOf(v: unknown): TeamMessageDoc["history"] {
  if (!Array.isArray(v)) return [];
  const out: TeamMessageDoc["history"] = [];
  for (const entry of v) {
    if (out.length >= TEAM_MESSAGE_LIMITS.history) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const at = tsToDate(raw.at);
    const byUid = uidOrEmpty(raw.byUid);
    if (!at || !byUid || !TEAM_MESSAGE_EVENTS.includes(raw.what as TeamMessageEvent)) continue;
    out.push({ what: raw.what as TeamMessageEvent, byUid, at });
  }
  return out;
}

/**
 * A stored message to the team as every reader may trust it, or null for a
 * document of any other kind, one that names a run, one with no sender, or
 * one whose topic or status this file does not know: a reader skips what it
 * cannot say anything true about.
 */
export function normalizeTeamMessage(id: string, data: Raw): TeamMessageDoc | null {
  if (data.kind !== TEAM_MESSAGE_KIND) return null;
  // A message belongs to no run: one that names a run is not one.
  if (data.runId !== "" && data.runId !== undefined) return null;
  const status = data.status;
  if (!TEAM_MESSAGE_STATUSES.includes(status as TeamMessageStatus)) return null;
  const change = (data.change && typeof data.change === "object" && !Array.isArray(data.change) ? data.change : {}) as Raw;
  if (!isTeamTopic(change.topic)) return null;
  const subjectUid = uidOrEmpty(data.subjectUid);
  const askedByUid = uidOrEmpty(data.askedByUid);
  if (!subjectUid || askedByUid !== subjectUid) return null;
  return {
    id,
    kind: TEAM_MESSAGE_KIND,
    subjectUid,
    askedByUid,
    askedAt: tsToDate(data.askedAt),
    askedOn: typeof data.askedOn === "string" && DATE_KEY.test(data.askedOn) ? data.askedOn : "",
    topic: change.topic,
    words: typeof change.words === "string" ? change.words.slice(0, TEAM_MESSAGE_LIMITS.words) : "",
    status: status as TeamMessageStatus,
    handlingUid: uidOrEmpty(data.handlingUid) || null,
    handlingAt: tsToDate(data.handlingAt),
    decidedByUid: uidOrEmpty(data.decidedByUid) || null,
    decidedAt: tsToDate(data.decidedAt),
    reply: typeof data.reply === "string" ? data.reply.slice(0, TEAM_MESSAGE_LIMITS.reply).trim() : "",
    replies: repliesOf(change.replies),
    adminsToldOn: typeof data.adminsToldOn === "string" && DATE_KEY.test(data.adminsToldOn) ? data.adminsToldOn : "",
    history: historyOf(data.history),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/** The history with one more entry, kept to its cap (the oldest go first, the sending stays). Stored form. */
export function withTeamEvent(history: TeamMessageDoc["history"], what: TeamMessageEvent, byUid: string, at: Date): Array<Record<string, unknown>> {
  const entries: Array<{ what: TeamMessageEvent; byUid: string; at: Date }> = [...history, { what, byUid, at }].map((entry) => ({
    what: entry.what,
    byUid: entry.byUid,
    at: entry.at,
  }));
  while (entries.length > TEAM_MESSAGE_LIMITS.history) entries.splice(1, 1);
  return entries;
}

// ---------------------------------------------------------------------------
// Access needs: the same collection, its own kind, and words nobody here reads
// ---------------------------------------------------------------------------

/**
 * ACCESS NEEDS: a member telling the admins what would help them take part,
 * from Ask the team's own short form. A kind of `courseRequests/{autoId}`
 * like a message, with no run, sent by and about the caller, gone only with
 * the account (`deleteCourseRequestsOf`, by `askedByUid` and `subjectUid`).
 *
 * ONLY ADMINS OPEN WHAT WAS WRITTEN, ONE ASK AT A TIME, AND EACH OPENING IS
 * RECORDED. The words and the tick are read by ONE module,
 * `src/lib/courses/teamAsk/openAccessNeeds.ts`, which writes a `courseAudit`
 * row of kind `access-needs-read` and the ask's own `opened` history entry in
 * the transaction it reads them in. THE NORMALISER BELOW NEVER READS EITHER:
 * an `AccessNeedsDoc` has no field for them, so no list, count, email, page's
 * first render or export built on it can carry them.
 * `tests/ask-access-needs-boundary.test.mjs` holds that for the whole tree.
 *
 * The form asks what would help, never why, and says not to tell us anything
 * about their health. The tick ("You may tell my facilitator what's needed,
 * but not why") is stored, shown to the admin who opens the ask, and passed
 * to nobody by the site.
 *
 * WHAT IS STORED (beside the message's top-level fields, all the same):
 *
 *   kind     "access-needs"
 *   change   { words, tellFacilitator: boolean, replies: [{ text, byUid, at }] }
 *   history  [{ what: "asked" | "taken" | "replied" | "opened", byUid, at }]
 */

export const ACCESS_NEEDS_KIND = "access-needs";

/** The topic the send route takes for an access ask, from the access form alone. */
export const ACCESS_TOPIC = "access";

/** What an access ask's history says happened: a message's, and each time an admin opened it. */
export type AccessNeedsEvent = TeamMessageEvent | "opened";

export const ACCESS_NEEDS_EVENTS: readonly AccessNeedsEvent[] = [...TEAM_MESSAGE_EVENTS, "opened"];

export type AccessNeedsHistoryEntry = { what: AccessNeedsEvent; byUid: string; at: Date };

/** An access ask as every reader but the one opening may hold it: never the words, never the tick. */
export type AccessNeedsDoc = {
  id: string;
  kind: typeof ACCESS_NEEDS_KIND;
  subjectUid: string;
  askedByUid: string;
  askedAt: Date | null;
  askedOn: string;
  status: TeamMessageStatus;
  handlingUid: string | null;
  handlingAt: Date | null;
  decidedByUid: string | null;
  decidedAt: Date | null;
  reply: string;
  replies: MemberRequestReply[];
  adminsToldOn: string;
  history: AccessNeedsHistoryEntry[];
  updatedAt: Date | null;
};

function accessHistoryOf(v: unknown): AccessNeedsHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: AccessNeedsHistoryEntry[] = [];
  for (const entry of v) {
    if (out.length >= TEAM_MESSAGE_LIMITS.history) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const at = tsToDate(raw.at);
    const byUid = uidOrEmpty(raw.byUid);
    if (!at || !byUid || !ACCESS_NEEDS_EVENTS.includes(raw.what as AccessNeedsEvent)) continue;
    out.push({ what: raw.what as AccessNeedsEvent, byUid, at });
  }
  return out;
}

/**
 * A stored access ask as every reader may trust it, WITHOUT what was written
 * or the tick, or null for a document of any other kind, one that names a
 * run, or one with no sender. Only the replies are read out of `change`.
 */
export function normalizeAccessNeeds(id: string, data: Raw): AccessNeedsDoc | null {
  if (data.kind !== ACCESS_NEEDS_KIND) return null;
  if (data.runId !== "" && data.runId !== undefined) return null;
  const status = data.status;
  if (!TEAM_MESSAGE_STATUSES.includes(status as TeamMessageStatus)) return null;
  const subjectUid = uidOrEmpty(data.subjectUid);
  const askedByUid = uidOrEmpty(data.askedByUid);
  if (!subjectUid || askedByUid !== subjectUid) return null;
  const stored = data.change && typeof data.change === "object" && !Array.isArray(data.change) ? (data.change as Raw) : {};
  return {
    id,
    kind: ACCESS_NEEDS_KIND,
    subjectUid,
    askedByUid,
    askedAt: tsToDate(data.askedAt),
    askedOn: typeof data.askedOn === "string" && DATE_KEY.test(data.askedOn) ? data.askedOn : "",
    status: status as TeamMessageStatus,
    handlingUid: uidOrEmpty(data.handlingUid) || null,
    handlingAt: tsToDate(data.handlingAt),
    decidedByUid: uidOrEmpty(data.decidedByUid) || null,
    decidedAt: tsToDate(data.decidedAt),
    reply: typeof data.reply === "string" ? data.reply.slice(0, TEAM_MESSAGE_LIMITS.reply).trim() : "",
    replies: repliesOf(stored.replies),
    adminsToldOn: typeof data.adminsToldOn === "string" && DATE_KEY.test(data.adminsToldOn) ? data.adminsToldOn : "",
    history: accessHistoryOf(data.history),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/**
 * An access ask's history with one more entry, kept to its cap. Openings go
 * first, the oldest of them, so however often it is opened the sending, who
 * took it and the reply stay on the page; every opening stays in the
 * `access-needs-read` record, which is the record of them. Stored form.
 */
export function withAccessEvent(history: readonly AccessNeedsHistoryEntry[], what: AccessNeedsEvent, byUid: string, at: Date): Array<Record<string, unknown>> {
  const entries = [...history, { what, byUid, at }].map((entry) => ({ what: entry.what, byUid: entry.byUid, at: entry.at }));
  while (entries.length > TEAM_MESSAGE_LIMITS.history) {
    const oldestOpening = entries.findIndex((entry, index) => index > 0 && index < entries.length - 1 && entry.what === "opened");
    entries.splice(oldestOpening === -1 ? 1 : oldestOpening, 1);
  }
  return entries;
}

/** A message or an access ask, as Take it and the reply read either: never an access ask's words. */
export type TeamAskDoc = TeamMessageDoc | AccessNeedsDoc;

/** Either kind of Ask the team's asks, through its own normaliser; null for anything else. */
export function normalizeTeamAsk(id: string, data: Raw): TeamAskDoc | null {
  return normalizeTeamMessage(id, data) ?? normalizeAccessNeeds(id, data);
}

/** The history with one more entry, for either kind. */
export function withTeamAskEvent(ask: TeamAskDoc, what: TeamMessageEvent, byUid: string, at: Date): Array<Record<string, unknown>> {
  return ask.kind === ACCESS_NEEDS_KIND ? withAccessEvent(ask.history, what, byUid, at) : withTeamEvent(ask.history, what, byUid, at);
}
