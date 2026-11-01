import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { readRunLead } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/addressableId";
import { loadRegisterMembers } from "@/lib/courses/registerAccess";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import { isBlockWeek, partsOf } from "@/lib/courses/weekBlocks/model";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { ATTENDANCE_STATUSES, attendanceDocId, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  COURSE_SESSION_REPORTS_COLLECTION,
  SESSION_REPORT_LIMITS,
  normalizeSessionReport,
  sessionReportId,
  type CourseSessionReportDoc,
  type ReportPart,
} from "@/lib/firestore/courseSessionReports";
import { CAME, reportWindowOf, windowStateAt, type ReportWindow, type WindowState } from "./model";
import { REPORT_REFUSAL } from "./words";

/**
 * WHO WRITES A SESSION REPORT, AND WHAT A SESSION'S REPORT CAN PICK FROM, in
 * one place: the report route and the facilitator's page both ask here, so
 * the page offers exactly what the route will take.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * A live facilitator of THIS group (named in `facilitatorUids` with standing,
 * on a group that is not archived), on a run that is not being destroyed,
 * and nobody else. Each writes their own report: a co-facilitator never reads
 * another's, and the programme's lead and admins read reports on the
 * programme's own page and write none. A missing group and a group the caller
 * does not facilitate are one 403, so probing ids tells nobody which groups
 * exist; an admin, who could read the group anyway, is told it is missing or
 * that reports are its facilitators' to write.
 *
 * ── WHAT IT PICKS FROM ──────────────────────────────────────────────────────
 * The session's register: its rows as the group's facilitators see them (the
 * people Publish has told, `loadRegisterMembers`), never the group's own
 * facilitators, and who of them the register has down as here. The week's
 * parts come from the group's own copy of the week when it has one, the run's
 * otherwise: what the group read.
 */

/** One person a report can pick: their uid and the name the register gives them. */
export type ReportPerson = { uid: string; name: string; firstName: string };

export type ReportGate =
  | {
      ok: true;
      group: CourseGroupDoc;
      run: CourseRunDoc;
      /** True for a facilitator who is also an admin: the register shows them everybody placed. */
      isAdmin: boolean;
    }
  | { ok: false; status: 403 | 404; error: string };

/** The gate's answer to somebody it admits. */
export type ReportWriter = Extract<ReportGate, { ok: true }>;

/**
 * Decide whether `actor` may write a report on this group, off the group's
 * document and its run's. The answer carries the status and a sentence, never
 * a response, so the module stays free of `next/server`.
 */
export async function gateReportWriter(db: Firestore, actor: SessionUser, groupId: string): Promise<ReportGate> {
  if (!isAddressableId(groupId)) return { ok: false, status: 404, error: "Group not found" };
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const facilitates = Boolean(
    group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (!facilitates) {
    if (actor.role !== "admin") return { ok: false, status: 403, error: "Forbidden" };
    // Reachable only by an admin, who could read the group anyway.
    if (!group) return { ok: false, status: 404, error: "Group not found" };
    return { ok: false, status: 403, error: REPORT_REFUSAL.notYours };
  }
  if (!group || !isAddressableId(group.runId)) return { ok: false, status: 404, error: "Group not found" };
  const runSnap = await db.collection("courseRuns").doc(group.runId).get();
  // A run being destroyed is gone already for everybody it served.
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return { ok: false, status: 404, error: "Group not found" };
  }
  return { ok: true, group, run: normalizeCourseRun(runSnap.id, runSnap.data() ?? {}), isAdmin: actor.role === "admin" };
}

/** The group's sessions, as its register's columns resolve them. */
export function sessionsOf(run: CourseRunDoc, group: CourseGroupDoc): ResolvedSession[] {
  return resolveSessions(run, group);
}

export type ReportSession = {
  window: ReportWindow;
  state: WindowState;
  /** False when the session's register says it did not happen. */
  held: boolean;
  /** Who the register has down as here, never the group's facilitators, by name. */
  came: ReportPerson[];
  /** Everybody on the register, never the group's facilitators, by name. */
  inGroup: ReportPerson[];
  /** The week's parts, as the group read it. */
  parts: ReportPart[];
};

/** "Aisha" from "Aisha Rahman". */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * What one session's report can pick from, and whether it is open, for a
 * writer the gate has admitted. Null for a session the group does not hold,
 * one called off and one with no date: none of them has a report.
 */
export async function loadReportSession(
  db: Firestore,
  gated: ReportWriter,
  sessionKey: string,
  now: Date,
  sessions: readonly ResolvedSession[] = sessionsOf(gated.run, gated.group),
): Promise<ReportSession | null> {
  const { run, group } = gated;
  const window = reportWindowOf(sessions, sessionKey);
  if (!window) return null;
  const { session } = window;
  const [registerSnap, roster, week] = await Promise.all([
    db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)).get(),
    // The register's rows as this writer sees them: the people Publish has told.
    loadRegisterMembers(db, run.id, group.id, { isAdmin: gated.isAdmin }),
    resolveWeekDoc(db, run.id, group.id, session.weekId),
  ]);
  const register = registerSnap.exists ? (registerSnap.data() ?? {}) : {};
  const marks = (register.records && typeof register.records === "object" ? register.records : {}) as Record<string, unknown>;
  const facilitators = new Set(group.facilitatorUids);
  const inGroup = roster.members
    .filter((member) => !facilitators.has(member.uid))
    .map((member) => ({ uid: member.uid, name: member.displayName, firstName: firstNameOf(member.displayName) }));
  const came = inGroup.filter((person) => {
    const mark = marks[person.uid];
    return ATTENDANCE_STATUSES.includes(mark as AttendanceStatus) && CAME.includes(mark as AttendanceStatus);
  });
  const parts =
    week.week && isBlockWeek(week.week)
      ? partsOf(week.week.blocks)
          .slice(0, SESSION_REPORT_LIMITS.parts)
          .map((part) => ({ id: part.id, title: part.title.slice(0, SESSION_REPORT_LIMITS.partTitle) }))
      : [];
  return {
    window,
    state: windowStateAt(window, now),
    // A session called off was never held, whatever its register says (and
    // `reportWindowOf` has already refused one): the register's own switch
    // speaks only for a session that met.
    held: !session.cancelled && register.held !== false,
    came,
    inGroup,
    parts,
  };
}

/** The caller's own report on one session, or null when they have sent none. */
export async function readOwnReport(
  db: Firestore,
  run: { id: string },
  group: { id: string },
  sessionKey: string,
  writerUid: string,
): Promise<CourseSessionReportDoc | null> {
  const snap = await db
    .collection(COURSE_SESSION_REPORTS_COLLECTION)
    .doc(sessionReportId(run.id, group.id, sessionKey, writerUid))
    .get();
  if (!snap.exists) return null;
  const report = normalizeSessionReport(snap.id, snap.data() ?? {});
  // Held to what the id says, so a row put there by hand is nobody's report.
  return report && report.runId === run.id && report.groupId === group.id && report.writerUid === writerUid ? report : null;
}

/** The first name of the programme's lead, for "Claudia and admins read this", or "". */
export async function leadFirstName(db: Firestore, runId: string): Promise<string> {
  return (await readRunLead(db, runId))?.firstName ?? "";
}
