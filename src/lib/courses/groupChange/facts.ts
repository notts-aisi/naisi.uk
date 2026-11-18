import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { campusOf, type GroupCampus } from "@/lib/courses/campus";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { nextWeekEmailMarkerId } from "@/lib/courses/nextWeekEmail";
import { resolveSessions, sessionInstants, type ResolvedSession, type SessionGroup } from "@/lib/courses/sessions";
import { standingFacilitatorUidsOf, updateEmailAudience } from "@/lib/courses/updates/audience";
import { groupSessionAt } from "@/lib/courses/weekWork/sessionDue";
import { WEEK_OPEN_DAYS_BEFORE, WEEK_REMINDER_DAYS, weekEmailSendAt } from "@/lib/courses/weekEmails/model";
import type { SessionUser } from "@/lib/firebase/session";
import { EXCUSED_IN_ADVANCE, ONLINE_SAID } from "@/lib/firestore/courseAttendance";
import type { CourseAuditKind, CourseAuditValue } from "@/lib/firestore/courseAudit";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { campusForWeek, sessionModeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { SCHEDULER_MARKERS_COLLECTION, weekReminderMarker } from "@/lib/firestore/schedulerMarkers";
import { NEXT_WEEK_EMAIL_JOB, WEEK_REMINDERS_JOB } from "@/lib/scheduler/registerJobs";

/**
 * WHAT A CHANGE TO A GROUP'S SESSIONS WOULD DO, the facts every preview reads
 * before anybody presses: one week's change
 * (`POST /api/courses/groups/[groupId]/session/change` with `preview`) and a
 * new regular time (`.../session/regular` with `preview`). Worked out, never
 * stored.
 *
 *  - THE SESSION, before and after, as every schedule surface resolves it.
 *  - FROM WHEN THE WEEK'S WORK COUNTS AS LATE, before and after: the session
 *    the group's people are due at that week (`groupSessionAt`, the one
 *    function late is told against): a moved or put-right week when it meets,
 *    a pushed-back week at its new session, a cancelled week that keeps pace
 *    when it would have started. Nothing locks at the session any more.
 *  - THE TWO MEMBER EMAIL JOBS: whether "Week N is open" and the reminders
 *    before a session are switched on, when each would go before and after,
 *    and whether this session's have already gone (their markers are keyed by
 *    week, not by time, so a move never sends one again).
 *  - WHO SAID WHAT on the session's register: joining online, can't make it.
 *  - WHO WOULD BE TOLD: the group's told people and its facilitators with
 *    standing, never the presser, counted by the function the send counts
 *    with.
 *
 * Every answer is first names and counts: no address, no account field.
 */

/** One session, as a preview draws it. */
export type SessionMoment = {
  weekNumber: number;
  dateKey: string;
  /** Stored "HH:MM"; a page prints it through the house clock. */
  startTimeLocal: string;
  durationMinutes: number;
  room: string;
  campus: GroupCampus | null;
  online: boolean;
  cancelled: boolean;
};

export function momentOf(group: SessionGroup, session: ResolvedSession | null): SessionMoment | null {
  if (!session || !session.dateKey) return null;
  const first = session.occurrence === 1;
  return {
    weekNumber: session.weekNumber,
    dateKey: session.dateKey,
    startTimeLocal: session.session.startTimeLocal,
    durationMinutes: session.session.durationMinutes,
    room: session.session.location.trim(),
    campus: first ? campusForWeek(group, session.weekId) : group.campus,
    online: first && sessionModeForWeek(group, session.weekId) === "virtual",
    cancelled: session.cancelled,
  };
}

/** An instant as the wire carries it, or null. */
export function iso(at: Date | null | undefined): string | null {
  return at ? at.toISOString() : null;
}

/** From when week `weekNumber`'s work counts as late for the group whose sessions these are, or null with no session. */
export function lateFromOf(sessions: readonly ResolvedSession[], weekNumber: number): string | null {
  return iso(groupSessionAt({ sessionLists: [sessions], toldAt: null }, weekNumber));
}

/** The two member email jobs' switches, read as the tick reads them. */
export type JobSwitches = { weekOpenEmail: boolean; weekReminders: boolean };

export async function readJobSwitches(db: Firestore): Promise<JobSwitches> {
  const config = await readSchedulerConfig(db);
  return {
    weekOpenEmail: jobStateFor(config, NEXT_WEEK_EMAIL_JOB.id, NEXT_WEEK_EMAIL_JOB.enabledByDefault).enabled,
    weekReminders: jobStateFor(config, WEEK_REMINDERS_JOB.id, WEEK_REMINDERS_JOB.enabledByDefault).enabled,
  };
}

/** One of the week's emails: when it goes before and after, and whether this session's has gone. */
export type ScheduledSend = { before: string | null; after: string | null; gone: boolean };

export type ReminderFacts = {
  /** "Week N is open", 6 days before at 9am: on its schedule, or sent by finishing the register before. */
  weekOpen: ScheduledSend & { scheduled: boolean };
  /** The reminders 3 days and 1 day before, at 9am, to each person whose week is not done. */
  reminders: {
    on: boolean;
    /** How many of the group's people's reminders have already gone (claimed), 3 days and 1 day before. */
    threeDay: { before: string | null; after: string | null; gone: number };
    oneDay: { before: string | null; after: string | null; gone: number };
    /** The people each reminder is per person for: the group's told places. */
    people: number;
  };
};

/** The group's told, active places: who the reminders are per person for. */
async function toldPlaceUids(db: Firestore, run: CourseRunDoc, group: CourseGroupDoc): Promise<string[]> {
  // Three equalities, the order the declared (runId, groupId, status) index serves.
  const snap = await db
    .collection("courseEnrolments")
    .where("runId", "==", run.id)
    .where("groupId", "==", group.id)
    .where("status", "==", "active")
    .get();
  return snap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((seat) => seat.role === "learner" && placementIsTold(seat))
    .map((seat) => seat.uid);
}

export async function reminderFacts(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    before: ResolvedSession | null;
    after: ResolvedSession | null;
    switches: JobSwitches;
  },
): Promise<ReminderFacts> {
  const { run, group, before, after, switches } = input;
  const at = (session: ResolvedSession | null, days: number) =>
    session && session.dateKey && !session.cancelled ? iso(weekEmailSendAt(session.dateKey, days)) : null;
  const markerId = before ? nextWeekEmailMarkerId(run.id, group.id, before) : null;
  const uids = before ? await toldPlaceUids(db, run, group) : [];
  const [three, one] = WEEK_REMINDER_DAYS;
  const reminderRefs = before
    ? uids.flatMap((uid) =>
        [three, one].map((days) =>
          db.collection(SCHEDULER_MARKERS_COLLECTION).doc(weekReminderMarker(group.id, before.sessionKey, uid, days).id),
        ),
      )
    : [];
  const [weekOpenSnap, ...reminderSnaps] = await Promise.all([
    markerId ? db.collection("courseNudges").doc(markerId).get() : Promise.resolve(null),
    ...(reminderRefs.length ? [db.getAll(...reminderRefs)] : []),
  ]);
  const markers = reminderSnaps[0] ?? [];
  let threeGone = 0;
  let oneGone = 0;
  markers.forEach((snap, index) => {
    if (!snap.exists) return;
    if (index % 2 === 0) threeGone += 1;
    else oneGone += 1;
  });
  return {
    weekOpen: {
      scheduled: switches.weekOpenEmail,
      before: at(before, WEEK_OPEN_DAYS_BEFORE),
      after: at(after, WEEK_OPEN_DAYS_BEFORE),
      gone: Boolean(weekOpenSnap?.exists),
    },
    reminders: {
      on: switches.weekReminders,
      threeDay: { before: at(before, three), after: at(after, three), gone: threeGone },
      oneDay: { before: at(before, one), after: at(after, one), gone: oneGone },
      people: uids.length,
    },
  };
}

/** Who said what on a session's register, as first names and a count. */
export type SaidFacts = {
  joiningOnline: { count: number; names: string[] };
  cantMakeIt: { count: number; names: string[] };
};

/** First names by uid, for the accounts given: never anything else of the account. */
async function firstNamesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  const out = new Map<string, string>();
  for (const doc of docs) if (doc.exists) out.set(doc.id, firstNameOfUser(doc.data() ?? {}));
  return out;
}

export async function saidFacts(
  db: Firestore,
  register: Readonly<Record<string, unknown>> | undefined,
): Promise<SaidFacts> {
  const keysOf = (value: unknown) => (value && typeof value === "object" ? Object.keys(value as object) : []);
  const records = (register?.records ?? {}) as Record<string, unknown>;
  const online = keysOf(register?.[ONLINE_SAID]);
  // A word in advance still stands while the line is still theirs: excused, on their word.
  const cant = keysOf(register?.[EXCUSED_IN_ADVANCE]).filter((uid) => records[uid] === "excused");
  const names = await firstNamesOf(db, [...online, ...cant]);
  const named = (uids: string[]) => uids.map((uid) => names.get(uid) ?? "").filter(Boolean);
  return {
    joiningOnline: { count: online.length, names: named(online) },
    cantMakeIt: { count: cant.length, names: named(cant) },
  };
}

/** Who a change would tell, never the presser, counted as the send counts. */
export type ToldFacts = {
  /** Every email the notice would send: the group's told people and its facilitators, each once. */
  emails: number;
  /** Over what one send can take: the notice cannot be sent. */
  refused: boolean;
  /** The group's told people it would reach (the "6" of "Group C’s 6 and Rahul"). */
  people: number;
  /** The facilitators with standing it would reach besides them, by first name ("Rahul"). */
  facilitatorNames: string[];
};

export async function toldFacts(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  writerUid: string,
  /** A change to ONE session: its week, so its people are that week's (`updateEmailAudience`). Null for a regular time. */
  weekNumber: number | null = null,
): Promise<ToldFacts> {
  const [members, everyone, facilitatorUids] = await Promise.all([
    updateEmailAudience(db, run, [group], "group", group.id, writerUid, { weekNumber }),
    updateEmailAudience(db, run, [group], "group", group.id, writerUid, { withFacilitators: true, weekNumber }),
    standingFacilitatorUidsOf(db, group, writerUid),
  ]);
  const memberUids = new Set(members.recipients.map((recipient) => recipient.uid));
  const besides = facilitatorUids.filter((uid) => !memberUids.has(uid));
  const names = await firstNamesOf(db, besides);
  return {
    emails: everyone.refused ? 0 : everyone.recipients.length,
    refused: everyone.refused,
    people: members.recipients.length,
    facilitatorNames: besides.map((uid) => names.get(uid) ?? "").filter(Boolean),
  };
}

/** The group's sessions, before and after a change, as every surface resolves them. */
export function sessionsBeforeAfter(
  run: CourseRunDoc,
  before: SessionGroup,
  after: SessionGroup,
): { before: ResolvedSession[]; after: ResolvedSession[] } {
  return { before: resolveSessions(run, before), after: resolveSessions(run, after) };
}

/** A session's start, for a register's `sessionAt`, or null with none to date. */
export function startOf(session: ResolvedSession | null | undefined): Date | null {
  return session ? sessionInstants(session).startsAt : null;
}

/** A stored campus value for a history row: one of the three, or null. */
export function campusValue(value: unknown): GroupCampus | null {
  return campusOf(value);
}

/**
 * ONE ROW OF A GROUP'S HISTORY, ready for `tx.set(db.collection(...).doc(), row)`:
 * the sentence, and beside it the optional fields a history page reads. The
 * presser is the actor. Never a meeting link anywhere in it.
 */
export function groupHistoryRow(input: {
  kind: CourseAuditKind;
  run: Pick<CourseRunDoc, "id">;
  group: Pick<CourseGroupDoc, "id" | "name">;
  actor: Pick<SessionUser, "uid" | "displayName">;
  detail: string;
  weekId?: string | null;
  before?: Record<string, CourseAuditValue> | null;
  after?: Record<string, CourseAuditValue> | null;
  reason?: string | null;
  emailed?: number | null;
  subjectUid?: string | null;
}): Record<string, unknown> {
  return {
    kind: input.kind,
    runId: input.run.id,
    groupId: input.group.id,
    subjectUid: input.subjectUid ?? null,
    actorUid: input.actor.uid,
    actorName: input.actor.displayName ?? "",
    targetLabel: input.group.name.trim() || "Untitled group",
    detail: input.detail,
    ...(input.weekId ? { weekId: input.weekId } : {}),
    ...(input.before ? { before: input.before } : {}),
    ...(input.after ? { after: input.after } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.emailed !== undefined && input.emailed !== null ? { emailed: input.emailed } : {}),
    at: FieldValue.serverTimestamp(),
  };
}

/** A session as a history row's `before` or `after`: plain values only. */
export function momentValues(moment: SessionMoment | null): Record<string, CourseAuditValue> | null {
  if (!moment) return null;
  return {
    dateKey: moment.dateKey,
    startTimeLocal: moment.startTimeLocal,
    durationMinutes: moment.durationMinutes,
    room: moment.room,
    campus: moment.campus,
    online: moment.online,
    cancelled: moment.cancelled,
  };
}
