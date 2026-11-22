import { COURSE_REQUEST_STATUSES, type CourseRequestStatus } from "./courseRequests";

/**
 * REQUESTS A PERSON TAKING PART MAKES OF THE TEAM, beyond being excused: kinds
 * of `courseRequests/{autoId}` (`./courseRequests.ts` holds the collection, its
 * rules and its one top-level shape), each read by its own normaliser in this
 * file. The first kind is going to another group's session for one week
 * (`visit`).
 *
 * WHY ITS OWN NORMALISERS. Every normaliser of the collection reads the kind
 * first and answers null for any other: the correction readers
 * (`normalizeCourseRequest`) and the excused ones (`normalizeExcusedRequest`)
 * skip these, and `normalizeVisitRequest` skips theirs, and any later kind's.
 * So no reader built on one kind can count, list, approve or show another.
 *
 * ONE SHARED BASE, ONE PAYLOAD PER KIND. What every kind here keeps the same
 * way (`MemberRequestBase`): who asked, about whom, the run (a real one for a
 * visit; a later kind may have none, `""`), when, where it stands, who has
 * it (Take it), who decided and when, the replies sent without deciding, the
 * latest reply, whether the person dismissed the decision message, the day
 * the admins were emailed about it (the shared daily cap) and a short history.
 * A kind adds its own `change` payload, read by its own function, and nothing
 * else: a later kind is a new `kind` string, a new payload reader and a new
 * normaliser beside this one, with no change to a stored visit request.
 *
 * A VISIT REQUEST (`kind: "visit"`): the person asks to go to another live
 * group's session in the week of their next session, and to stay in their
 * own group. `groupId` and `sessionKey` are their own group's for that week
 * (the group they belong to that week, and its session), so the request is
 * found the way every request about a group is; `change` holds the week, the
 * host group and its session, the host's session as it was offered when
 * they asked, so the request's page can say it has moved since, and whether
 * they ticked "I’d join online". No new status:
 * a request nobody decided before the earlier of the two sessions started is
 * CLOSED BY ITSELF, worked out at read time (`src/lib/courses/visitRequest/model.ts`),
 * never stored, because nothing runs when a clock passes.
 *
 * Every field is new, so nothing older reads it, and a missing one reads as
 * the request's own default.
 */

/** The kinds this file reads. Not one of `COURSE_REQUEST_KINDS`, nor the excused kind. */
export const VISIT_KIND = "visit";

/** What each entry of these requests' history says happened. */
export type MemberRequestEvent = "asked" | "taken" | "withdrawn" | "approved" | "declined" | "replied" | "dismissed";

export const MEMBER_REQUEST_EVENTS: readonly MemberRequestEvent[] = ["asked", "taken", "withdrawn", "approved", "declined", "replied", "dismissed"];

export type MemberRequestHistoryEntry = { what: MemberRequestEvent; byUid: string; at: Date };

/** A reply without a decision, kept on the request and emailed to the person. */
export type MemberRequestReply = { text: string; byUid: string; at: Date };

export const MEMBER_REQUEST_LIMITS = {
  /** "Anything to add (optional)": one short line. */
  reason: 200,
  /** A reply, with a decision or without one. */
  reply: 300,
  /** Replies without a decision kept on one request. */
  replies: 20,
  /** History entries kept: a press each, and a few replies. */
  history: 40,
} as const;

/** What every kind of these requests keeps the same way. */
export type MemberRequestBase = {
  id: string;
  /** The run it is about; "" for a kind that belongs to no run. */
  runId: string;
  groupId: string;
  roundId: string | null;
  programmeId: string | null;
  sessionKey: string;
  weekId: string;
  /** The person, who is also the one who asked. */
  subjectUid: string;
  askedByUid: string;
  askedAt: Date | null;
  /** The person's own words; "" for none. */
  reason: string;
  status: CourseRequestStatus;
  handlingUid: string | null;
  handlingAt: Date | null;
  decidedByUid: string | null;
  decidedAt: Date | null;
  withdrawnAt: Date | null;
  /** The reply that came with the decision, or the latest reply without one; "" with none. */
  reply: string;
  /** Replies sent without deciding, oldest first. */
  replies: MemberRequestReply[];
  /** When the person dismissed the message saying it was declined; null while they have not. */
  dismissedAt: Date | null;
  /** The London day the admins were emailed about it ("2026-11-10"), or "" when they were not. */
  adminsToldOn: string;
  history: MemberRequestHistoryEntry[];
  updatedAt: Date | null;
};

/** A visit request's own payload. */
export type VisitRequestChange = {
  weekNumber: number;
  hostGroupId: string;
  /** The host's session that week ("w02"). */
  hostSessionKey: string;
  /** The host's session as it was offered when they asked: its date and start ("" for none). */
  asked: { dateKey: string; startTimeLocal: string };
  /**
   * They ticked "I’d join online": approving it then says so on the host's
   * register for that session, as their own press of "I’m joining online"
   * would, and the host's facilitators' email says it. False when not ticked,
   * and for a request stored before the tick existed.
   */
  online: boolean;
};

export type VisitRequestDoc = MemberRequestBase & { kind: typeof VISIT_KIND; change: VisitRequestChange };

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

function uidOrEmpty(v: unknown): string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/") ? v : "";
}

function uidOrNull(v: unknown): string | null {
  return uidOrEmpty(v) || null;
}

const SESSION_KEY = /^w\d{2}(?:-\d)?$/;
const WEEK_ID = /^w\d{2}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

function isStatus(v: unknown): v is CourseRequestStatus {
  return COURSE_REQUEST_STATUSES.includes(v as CourseRequestStatus);
}

function repliesOf(v: unknown): MemberRequestReply[] {
  if (!Array.isArray(v)) return [];
  const out: MemberRequestReply[] = [];
  for (const entry of v) {
    if (out.length >= MEMBER_REQUEST_LIMITS.replies) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const text = str(raw.text, MEMBER_REQUEST_LIMITS.reply);
    const byUid = uidOrEmpty(raw.byUid);
    const at = tsToDate(raw.at);
    if (!text || !byUid || !at) continue;
    out.push({ text, byUid, at });
  }
  return out;
}

function historyOf(v: unknown): MemberRequestHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: MemberRequestHistoryEntry[] = [];
  for (const entry of v) {
    if (out.length >= MEMBER_REQUEST_LIMITS.history) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const at = tsToDate(raw.at);
    const byUid = uidOrEmpty(raw.byUid);
    if (!at || !byUid || !MEMBER_REQUEST_EVENTS.includes(raw.what as MemberRequestEvent)) continue;
    out.push({ what: raw.what as MemberRequestEvent, byUid, at });
  }
  return out;
}

/** The shared base of any kind here, from a stored document whose kind the caller has already checked. */
export function memberRequestBaseOf(id: string, data: Raw, change: Raw): MemberRequestBase | null {
  if (!isStatus(data.status)) return null;
  return {
    id,
    runId: uidOrEmpty(data.runId),
    groupId: uidOrEmpty(data.groupId),
    roundId: uidOrNull(data.roundId),
    programmeId: uidOrNull(data.programmeId),
    sessionKey: typeof data.sessionKey === "string" && SESSION_KEY.test(data.sessionKey) ? data.sessionKey : "",
    weekId: typeof data.weekId === "string" && WEEK_ID.test(data.weekId) ? data.weekId : "",
    subjectUid: uidOrEmpty(data.subjectUid),
    askedByUid: uidOrEmpty(data.askedByUid),
    askedAt: tsToDate(data.askedAt),
    reason: str(data.reason, MEMBER_REQUEST_LIMITS.reason),
    status: data.status,
    handlingUid: uidOrNull(data.handlingUid),
    handlingAt: tsToDate(data.handlingAt),
    decidedByUid: uidOrNull(data.decidedByUid),
    decidedAt: tsToDate(data.decidedAt),
    withdrawnAt: tsToDate(data.withdrawnAt),
    reply: str(data.reply, MEMBER_REQUEST_LIMITS.reply),
    replies: repliesOf(change.replies),
    dismissedAt: tsToDate(data.dismissedAt),
    adminsToldOn: typeof data.adminsToldOn === "string" && DATE_KEY.test(data.adminsToldOn) ? data.adminsToldOn : "",
    history: historyOf(data.history),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/** The history with one more entry, kept to its cap (the oldest go first, the asking stays). Stored form. */
export function withMemberEvent(history: readonly MemberRequestHistoryEntry[], what: MemberRequestEvent, byUid: string, at: Date): MemberRequestHistoryEntry[] {
  const entries = [...history, { what, byUid, at }].map((entry) => ({ what: entry.what, byUid: entry.byUid, at: entry.at }));
  while (entries.length > MEMBER_REQUEST_LIMITS.history) entries.splice(1, 1);
  return entries;
}

/** The replies as stored. */
export function storedReplies(replies: readonly MemberRequestReply[]): Array<Record<string, unknown>> {
  return replies.map((each) => ({ text: each.text, byUid: each.byUid, at: each.at }));
}

/**
 * A stored visit request as every reader may trust it, or null for a document
 * of another kind, or one that names no real run, no person, no week or no
 * host: a reader skips a request it cannot say anything true about.
 */
export function normalizeVisitRequest(id: string, data: Raw): VisitRequestDoc | null {
  if (data.kind !== VISIT_KIND) return null;
  const change = (data.change && typeof data.change === "object" && !Array.isArray(data.change) ? data.change : {}) as Raw;
  const base = memberRequestBaseOf(id, data, change);
  if (!base || !base.runId || !base.subjectUid || !base.groupId) return null;
  const weekNumber = typeof change.weekNumber === "number" && Number.isInteger(change.weekNumber) && change.weekNumber >= 1 && change.weekNumber <= 99 ? change.weekNumber : 0;
  const hostGroupId = uidOrEmpty(change.hostGroupId);
  if (!weekNumber || !hostGroupId) return null;
  const asked = (change.asked && typeof change.asked === "object" ? change.asked : {}) as Raw;
  return {
    ...base,
    kind: VISIT_KIND,
    change: {
      weekNumber,
      hostGroupId,
      hostSessionKey: typeof change.hostSessionKey === "string" && SESSION_KEY.test(change.hostSessionKey) ? change.hostSessionKey : "",
      asked: {
        dateKey: typeof asked.dateKey === "string" && DATE_KEY.test(asked.dateKey) ? asked.dateKey : "",
        startTimeLocal: typeof asked.startTimeLocal === "string" && CLOCK.test(asked.startTimeLocal) ? asked.startTimeLocal : "",
      },
      // Only a strict true is the tick.
      online: change.online === true,
    },
  };
}
