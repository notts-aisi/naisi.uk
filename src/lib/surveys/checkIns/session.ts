import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { partsOf } from "@/lib/courses/weekBlocks/model";
import { weekSources } from "@/lib/courses/weekBlocks/reader";
import { ATTENDANCE_STATUSES, attendanceDocId, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { checkInWindow, type CheckInWindow } from "./model";
import type { CheckInWeek } from "./template";

/**
 * ONE SESSION OF ONE GROUP, AS ITS CHECK-IN READS IT: the session from the
 * group's own calendar (`resolveSessions`, the register's columns), when it
 * starts and ends, its check-in window, and what its register says. Reads
 * only: the run, the register's one document and, for the questions, the
 * group's own copy of the week.
 */

/** A session-key a request may carry: "w03", "w03-2". */
export function isSessionKey(value: unknown): value is string {
  return typeof value === "string" && /^w\d{2}(-\d)?$/.test(value);
}

export type CheckInSession = {
  run: CourseRunDoc;
  /** Every session the group holds, in order. */
  sessions: ResolvedSession[];
  session: ResolvedSession;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Null when the session cannot be dated. */
  window: CheckInWindow | null;
};

/** The run, and the group's session with this key, or null when the group holds none. */
export async function readCheckInSession(
  db: Firestore,
  runId: string,
  group: CourseGroupDoc,
  key: string,
): Promise<CheckInSession | null> {
  if (!runId || runId.includes("/") || !isSessionKey(key)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const run = normalizeCourseRun(snap.id, snap.data() ?? {});
  const sessions = resolveSessions(run, group);
  const session = sessions.find((each) => each.sessionKey === key) ?? null;
  if (!session) return null;
  const { startsAt, endsAt } = sessionInstants(session);
  return { run, sessions, session, startsAt, endsAt, window: checkInWindow({ dateKey: session.dateKey, startsAt, endsAt }) };
}

/** What one session's register says: whether it was held, and each row's mark. */
export type RegisterMarks = { held: boolean; marks: Record<string, AttendanceStatus> };

export async function readRegisterMarks(db: Firestore, runId: string, groupId: string, session: ResolvedSession): Promise<RegisterMarks> {
  const snap = await db.collection("courseAttendance").doc(attendanceDocId(runId, groupId, session.weekNumber, session.occurrence)).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const raw = (data.records ?? {}) as Record<string, unknown>;
  const marks: Record<string, AttendanceStatus> = {};
  for (const [uid, status] of Object.entries(raw)) {
    if (ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) marks[uid] = status as AttendanceStatus;
  }
  return { held: data.held !== false, marks };
}

/**
 * The week a session is about, as the group's members read it (the group's
 * own copy when it has one): its parts in order, and whether its path has
 * anything to read, watch or listen to. A week that is not there has neither.
 */
export async function readCheckInWeek(db: Firestore, runId: string, groupId: string, session: ResolvedSession): Promise<CheckInWeek> {
  const { week } = await resolveWeekDoc(db, runId, groupId, session.weekId);
  if (!week) return { parts: [], hasReading: false };
  return {
    parts: partsOf(week.blocks ?? []).map((part) => ({ id: part.id, title: part.title })),
    hasReading: weekSources(week).length > 0,
  };
}
