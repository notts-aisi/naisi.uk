import { COURSE_REQUEST_STATUSES, type CourseRequestStatus } from "./courseRequests";

/**
 * A REQUEST TO BE EXCUSED FROM A WEEK: the `excused` kind of
 * `courseRequests/{autoId}` (`./courseRequests.ts` holds the collection, its
 * rules and its one shape), read by its own normaliser.
 *
 * WHY ITS OWN NORMALISER. `normalizeCourseRequest` reads a kind it knows and
 * answers null for any other, and every reader built on it (the register's
 * correction extras, the correction routes, one request's page) skips a
 * null. An excused request is read only through this file, so none of those
 * readers can ever mistake one for a register correction, approve it as one,
 * or hand its reason to somebody who reads a correction's. The two share the
 * collection, the top-level fields and the rules; the payload in `change` is
 * this kind's own.
 *
 * ONE REQUEST, ONE OR SEVERAL WEEKS, EACH DECIDED ON ITS OWN. `change.weeks`
 * holds a row per session asked about, each with its own status, who decided
 * it, when, the reply and what approving it did to the register. The
 * request's own `status` follows its weeks (`excusedStatusOf`): waiting while
 * any week waits, then approved if any week was, declined if any was, and
 * withdrawn otherwise. Its `decidedByUid` and `decidedAt` are the latest
 * decision's, so the Requests page's "done this week" list (a range on
 * `decidedAt`) finds it.
 *
 * THE REASON is one short line, read by admins only, and deleted when the
 * programme closes (privacy v17, "How long we keep it"), leaving that the
 * person was excused. `reasonHeld` is true while it is kept, so the job that
 * deletes it reads one equality (`src/lib/courses/excused/tidy.ts`);
 * `reasonGoneAt` says when it went.
 *
 * WHAT WAS OFFERED FIRST. Each week keeps whether joining that session online
 * was open to the person when they asked (`offered.online`). Going to another
 * group's session that week needs one-week visits, which do not exist yet:
 * when they do, `offered` gains the sessions offered, beside `online`.
 *
 * Every field this kind adds is new, so nothing older reads it, and a
 * missing field reads as the request's own default.
 */

/** The kind, as stored. Not one of `COURSE_REQUEST_KINDS`: see the module header. */
export const EXCUSED_KIND = "excused";

/** When the person asked about a session: before it started, or after it while its finished register said Absent. */
export type ExcusedAsked = "before" | "after";

/**
 * What approving a week did to its register:
 *  - `written`: the line now says excused (before the session, as "Can't make
 *    it" writes it; after it, on a register still being taken);
 *  - `corrected`: a finished register's Absent became Excused, as a correction
 *    made by the approval;
 *  - `kept`: the line was left as it was (it already said excused, said they
 *    came, or the session did not happen).
 */
export type ExcusedRegisterOutcome = "written" | "corrected" | "kept";

export const EXCUSED_REGISTER_OUTCOMES: readonly ExcusedRegisterOutcome[] = ["written", "corrected", "kept"];

export type ExcusedWeek = {
  /** The session ("w03", or "w03-2"), and its week. */
  sessionKey: string;
  weekId: string;
  weekNumber: number;
  occurrence: number;
  /** The session's date as the group's calendar dated it when asked; "" with none. */
  dateKey: string;
  asked: ExcusedAsked;
  /** What was offered first: joining that session online was open to them. */
  offered: { online: boolean };
  status: CourseRequestStatus;
  decidedByUid: string | null;
  decidedAt: Date | null;
  /** The reply that came with the decision; "" with none. */
  reply: string;
  withdrawnAt: Date | null;
  /** What approving it did to the register; null until approved. */
  register: ExcusedRegisterOutcome | null;
};

/** A reply without a decision, kept on the request and emailed to the person. */
export type ExcusedReply = { text: string; byUid: string; at: Date };

/** What each entry of an excused request's history says happened. */
export type ExcusedEvent = "asked" | "withdrawn" | "approved" | "declined" | "replied";

export const EXCUSED_EVENTS: readonly ExcusedEvent[] = ["asked", "withdrawn", "approved", "declined", "replied"];

export type ExcusedHistoryEntry = { what: ExcusedEvent; byUid: string; at: Date; sessionKey: string | null };

export const EXCUSED_LIMITS = {
  /** Weeks one request asks about. */
  weeks: 10,
  /** The reason: one short line. */
  reason: 200,
  /** A reply, with a decision or without one. */
  reply: 300,
  /** Replies without a decision kept on one request. */
  replies: 20,
  /** History entries kept: a press per week, and a few replies. */
  history: 40,
} as const;

export type ExcusedRequestDoc = {
  id: string;
  kind: typeof EXCUSED_KIND;
  runId: string;
  groupId: string;
  roundId: string | null;
  programmeId: string | null;
  /** The first week asked about, so the shared shape's one session names something. */
  sessionKey: string;
  weekId: string;
  /** The person, who is also the one who asked. */
  subjectUid: string;
  askedByUid: string;
  askedAt: Date | null;
  weeks: ExcusedWeek[];
  replies: ExcusedReply[];
  /** The person's reason; "" once the programme has closed and it was deleted. */
  reason: string;
  reasonHeld: boolean;
  reasonGoneAt: Date | null;
  status: CourseRequestStatus;
  decidedByUid: string | null;
  decidedAt: Date | null;
  withdrawnAt: Date | null;
  /** The latest reply, with a decision or without one; "" with none. */
  reply: string;
  history: ExcusedHistoryEntry[];
  updatedAt: Date | null;
};

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

function isStatus(v: unknown): v is CourseRequestStatus {
  return COURSE_REQUEST_STATUSES.includes(v as CourseRequestStatus);
}

/** One week as stored, or null for a row that names no session. */
function weekOf(v: unknown): ExcusedWeek | null {
  const raw = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Raw;
  const sessionKey = typeof raw.sessionKey === "string" && SESSION_KEY.test(raw.sessionKey) ? raw.sessionKey : "";
  if (!sessionKey || !isStatus(raw.status)) return null;
  const match = /^w(\d{2})(?:-(\d))?$/.exec(sessionKey);
  const weekNumber = match ? Number(match[1]) : 0;
  const occurrence = match?.[2] ? Number(match[2]) : 1;
  if (weekNumber < 1) return null;
  const offered = (raw.offered && typeof raw.offered === "object" ? raw.offered : {}) as Raw;
  return {
    sessionKey,
    weekId: typeof raw.weekId === "string" && WEEK_ID.test(raw.weekId) ? raw.weekId : sessionKey.slice(0, 3),
    weekNumber,
    occurrence,
    dateKey: typeof raw.dateKey === "string" && DATE_KEY.test(raw.dateKey) ? raw.dateKey : "",
    asked: raw.asked === "after" ? "after" : "before",
    offered: { online: offered.online === true },
    status: raw.status,
    decidedByUid: uidOrNull(raw.decidedByUid),
    decidedAt: tsToDate(raw.decidedAt),
    reply: str(raw.reply, EXCUSED_LIMITS.reply),
    withdrawnAt: tsToDate(raw.withdrawnAt),
    register: EXCUSED_REGISTER_OUTCOMES.includes(raw.register as ExcusedRegisterOutcome) ? (raw.register as ExcusedRegisterOutcome) : null,
  };
}

function repliesOf(v: unknown): ExcusedReply[] {
  if (!Array.isArray(v)) return [];
  const out: ExcusedReply[] = [];
  for (const entry of v) {
    if (out.length >= EXCUSED_LIMITS.replies) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const text = str(raw.text, EXCUSED_LIMITS.reply);
    const byUid = uidOrEmpty(raw.byUid);
    const at = tsToDate(raw.at);
    if (!text || !byUid || !at) continue;
    out.push({ text, byUid, at });
  }
  return out;
}

function historyOf(v: unknown): ExcusedHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: ExcusedHistoryEntry[] = [];
  for (const entry of v) {
    if (out.length >= EXCUSED_LIMITS.history) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const at = tsToDate(raw.at);
    const byUid = uidOrEmpty(raw.byUid);
    if (!at || !byUid || !EXCUSED_EVENTS.includes(raw.what as ExcusedEvent)) continue;
    const sessionKey = typeof raw.sessionKey === "string" && SESSION_KEY.test(raw.sessionKey) ? raw.sessionKey : null;
    out.push({ what: raw.what as ExcusedEvent, byUid, at, sessionKey });
  }
  return out;
}

/**
 * Where a request stands, from its weeks: waiting while any week waits; then
 * approved if any week was approved, declined if any was declined, withdrawn
 * otherwise.
 */
export function excusedStatusOf(weeks: readonly Pick<ExcusedWeek, "status">[]): CourseRequestStatus {
  if (weeks.some((week) => week.status === "waiting")) return "waiting";
  if (weeks.some((week) => week.status === "approved")) return "approved";
  if (weeks.some((week) => week.status === "declined")) return "declined";
  return "withdrawn";
}

/**
 * A stored excused request as every reader may trust it, or null for a
 * document of another kind, or one with no week it can say anything true
 * about.
 */
export function normalizeExcusedRequest(id: string, data: Raw): ExcusedRequestDoc | null {
  if (data.kind !== EXCUSED_KIND) return null;
  if (!isStatus(data.status)) return null;
  const change = (data.change && typeof data.change === "object" ? data.change : {}) as Raw;
  const weeks: ExcusedWeek[] = [];
  const seen = new Set<string>();
  for (const each of Array.isArray(change.weeks) ? change.weeks : []) {
    if (weeks.length >= EXCUSED_LIMITS.weeks) break;
    const week = weekOf(each);
    if (!week || seen.has(week.sessionKey)) continue;
    seen.add(week.sessionKey);
    weeks.push(week);
  }
  if (weeks.length === 0) return null;
  const reason = str(data.reason, EXCUSED_LIMITS.reason);
  return {
    id,
    kind: EXCUSED_KIND,
    runId: uidOrEmpty(data.runId),
    groupId: uidOrEmpty(data.groupId),
    roundId: uidOrNull(data.roundId),
    programmeId: uidOrNull(data.programmeId),
    sessionKey: typeof data.sessionKey === "string" && SESSION_KEY.test(data.sessionKey) ? data.sessionKey : weeks[0].sessionKey,
    weekId: typeof data.weekId === "string" && WEEK_ID.test(data.weekId) ? data.weekId : weeks[0].weekId,
    subjectUid: uidOrEmpty(data.subjectUid),
    askedByUid: uidOrEmpty(data.askedByUid),
    askedAt: tsToDate(data.askedAt),
    weeks,
    replies: repliesOf(change.replies),
    reason,
    reasonHeld: data.reasonHeld === true && reason !== "",
    reasonGoneAt: tsToDate(data.reasonGoneAt),
    // The weeks are the truth; the stored status is what one equality finds.
    status: excusedStatusOf(weeks),
    decidedByUid: uidOrNull(data.decidedByUid),
    decidedAt: tsToDate(data.decidedAt),
    withdrawnAt: tsToDate(data.withdrawnAt),
    reply: str(data.reply, EXCUSED_LIMITS.reply),
    history: historyOf(data.history),
    updatedAt: tsToDate(data.updatedAt),
  };
}
