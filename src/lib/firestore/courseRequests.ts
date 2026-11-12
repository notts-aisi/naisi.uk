import type { AttendanceStatus } from "./courseAttendance";
import { ATTENDANCE_STATUSES } from "./courseAttendance";

/**
 * `courseRequests/{autoId}`: ONE RECORD OF EVERY KIND OF REQUEST somebody on
 * a programme makes of the people running it, and what became of it.
 *
 * ONE SHAPE FOR EVERY KIND. The first kind is a facilitator asking for a line
 * of a finished register to be corrected (`register-correction`). Later kinds
 * (being excused from a week, going to another group's session for a week,
 * moving group, a message to the team, access needs) add a `kind` and their
 * own `change` payload, never a new shape: who asked, about whom, when, why,
 * where it is, who has it, what was decided and the reply, and a short
 * history of who did what.
 *
 * SERVER ONLY, IN BOTH DIRECTIONS. `allow read, write: if false` in
 * firestore.rules: every writer is a route on the Admin SDK after its own
 * gate, and every reader is server code that decides what the person in
 * front of it may see. A request can carry a reason about a named person,
 * which is not a browser's to list.
 *
 * READ WITH ONE FIELD AT A TIME. Every list is one equality or one range on a
 * single field (waiting ones by `status`; a run's by `runId`; a register's by
 * `groupId`; recently decided ones by a range on `decidedAt`), filtered and
 * sorted in code: a term holds tens of these, and no list needs a declared
 * index.
 *
 * KEPT WITH THE RUN, AND GONE WITH THE ACCOUNT. The run's destroy cascade
 * drains them by `runId`, as it drains every other leaf of the run. Deleting
 * an account deletes the requests it made and the requests about it
 * (`deleteCourseRequestsOf`, one equality on `askedByUid` and one on
 * `subjectUid`), as the privacy policy keeps requests "while your account
 * exists". The correction a request led to stays in the group's history, as
 * every `courseAudit` row does, with a `requestId` that then names nothing.
 */

export const COURSE_REQUESTS_COLLECTION = "courseRequests";

/**
 * What a request asks for, as this normaliser reads it. Being excused from a
 * week (`excused`) is stored in this collection with this shape, but read
 * only by its own normaliser (`./courseExcusedRequests.ts`), so every reader
 * built on this one skips it: a correction reader never approves one, and
 * never hands its reason to somebody who reads a correction's.
 */
export type CourseRequestKind = "register-correction";

export const COURSE_REQUEST_KINDS: readonly CourseRequestKind[] = ["register-correction"];

/**
 * Where a request is. `waiting` until somebody decides it or its asker takes
 * it back; nothing moves it once it has left `waiting`.
 */
export type CourseRequestStatus = "waiting" | "approved" | "declined" | "withdrawn";

export const COURSE_REQUEST_STATUSES: readonly CourseRequestStatus[] = ["waiting", "approved", "declined", "withdrawn"];

/** One line of a register as a request names it: the mark, and online or in the room beside a mark that says they came. */
export type RequestLine = { mark: AttendanceStatus | null; online: boolean };

/** A register correction's own payload: what the line says now, and what it should say. */
export type RegisterCorrectionChange = { from: RequestLine; to: RequestLine };

/** What each entry of a request's history says happened. */
export type CourseRequestEvent = "asked" | "taken" | "withdrawn" | "approved" | "declined";

export const COURSE_REQUEST_EVENTS: readonly CourseRequestEvent[] = ["asked", "taken", "withdrawn", "approved", "declined"];

export type CourseRequestHistoryEntry = { what: CourseRequestEvent; byUid: string; at: Date };

export const COURSE_REQUEST_LIMITS = {
  /** A reason, one line: as a register's correction asks for. */
  reason: 300,
  /** A reply to the person who asked. */
  reply: 300,
  /** Entries kept in a request's history: each one is a press, and a request is pressed a handful of times. */
  history: 20,
} as const;

export type CourseRequestDoc = {
  id: string;
  kind: CourseRequestKind;
  runId: string;
  groupId: string;
  /** The application form and programme the run belongs to, when one names it, so a lead's list needs no join. */
  roundId: string | null;
  programmeId: string | null;
  /** The session the request is about ("w03", or "w03-2"), and its week ("w03"). */
  sessionKey: string;
  weekId: string;
  /** Whose line it is about. */
  subjectUid: string;
  askedByUid: string;
  askedAt: Date | null;
  /** The kind's own payload. */
  change: RegisterCorrectionChange;
  reason: string;
  status: CourseRequestStatus;
  /** Who has said they are dealing with it, and since when; null while nobody has. */
  handlingUid: string | null;
  handlingAt: Date | null;
  /** Who approved or declined it, and when; null while it waits, and for one withdrawn. */
  decidedByUid: string | null;
  decidedAt: Date | null;
  /** When its asker took it back; null otherwise. */
  withdrawnAt: Date | null;
  /** The reply to the asker: needed to decline, empty otherwise. */
  reply: string;
  history: CourseRequestHistoryEntry[];
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
  return typeof v === "string" ? v.slice(0, max) : "";
}

function uidOrEmpty(v: unknown): string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/") ? v : "";
}

function uidOrNull(v: unknown): string | null {
  return uidOrEmpty(v) || null;
}

const SESSION_KEY = /^w\d{2}(?:-\d)?$/;
const WEEK_ID = /^w\d{2}$/;

/** A line as a request stores it; a garbled one reads as a line with no mark, in the room. */
function lineOf(v: unknown): RequestLine {
  const raw = (v && typeof v === "object" ? v : {}) as Raw;
  const mark = ATTENDANCE_STATUSES.includes(raw.mark as AttendanceStatus) ? (raw.mark as AttendanceStatus) : null;
  return { mark, online: raw.online === true };
}

function historyOf(v: unknown): CourseRequestHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: CourseRequestHistoryEntry[] = [];
  for (const entry of v) {
    if (out.length >= COURSE_REQUEST_LIMITS.history) break;
    const raw = (entry && typeof entry === "object" ? entry : {}) as Raw;
    const at = tsToDate(raw.at);
    const byUid = uidOrEmpty(raw.byUid);
    if (!at || !byUid || !COURSE_REQUEST_EVENTS.includes(raw.what as CourseRequestEvent)) continue;
    out.push({ what: raw.what as CourseRequestEvent, byUid, at });
  }
  return out;
}

/**
 * A stored request as every reader may trust it. A kind or a status this
 * build does not know reads as null: a reader skips a request it cannot say
 * anything true about, rather than calling it something it is not.
 */
export function normalizeCourseRequest(id: string, data: Raw): CourseRequestDoc | null {
  if (!COURSE_REQUEST_KINDS.includes(data.kind as CourseRequestKind)) return null;
  if (!COURSE_REQUEST_STATUSES.includes(data.status as CourseRequestStatus)) return null;
  const change = (data.change && typeof data.change === "object" ? data.change : {}) as Raw;
  return {
    id,
    kind: data.kind as CourseRequestKind,
    runId: uidOrEmpty(data.runId),
    groupId: uidOrEmpty(data.groupId),
    roundId: uidOrNull(data.roundId),
    programmeId: uidOrNull(data.programmeId),
    sessionKey: typeof data.sessionKey === "string" && SESSION_KEY.test(data.sessionKey) ? data.sessionKey : "",
    weekId: typeof data.weekId === "string" && WEEK_ID.test(data.weekId) ? data.weekId : "",
    subjectUid: uidOrEmpty(data.subjectUid),
    askedByUid: uidOrEmpty(data.askedByUid),
    askedAt: tsToDate(data.askedAt),
    change: { from: lineOf(change.from), to: lineOf(change.to) },
    reason: str(data.reason, COURSE_REQUEST_LIMITS.reason).trim(),
    status: data.status as CourseRequestStatus,
    handlingUid: uidOrNull(data.handlingUid),
    handlingAt: tsToDate(data.handlingAt),
    decidedByUid: uidOrNull(data.decidedByUid),
    decidedAt: tsToDate(data.decidedAt),
    withdrawnAt: tsToDate(data.withdrawnAt),
    reply: str(data.reply, COURSE_REQUEST_LIMITS.reply).trim(),
    history: historyOf(data.history),
    updatedAt: tsToDate(data.updatedAt),
  };
}
