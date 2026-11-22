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
