import { londonWallClockToInstant, type WeekPlanEntry } from "../weekPlan";
import { resolveSessions, sessionInstants, type ResolvedSession, type SessionGroup } from "../sessions";
import { registerIsTaken } from "@/lib/firestore/courseAttendance";
import type { CourseAuditKind } from "@/lib/firestore/courseAudit";
import {
  campusForWeek,
  sessionChangeForWeek,
  sessionModeForWeek,
  type GroupSessionOverride,
  type SessionChange,
} from "@/lib/firestore/courseGroups";
import { COURSE_FIELD_LIMITS, type CourseRunDoc } from "@/lib/firestore/courses";
import type { GroupCampus } from "../campus";
import { pushBackOutcome, sessionOfWeek, slotDays } from "./model";
import type { ChangePress } from "./parse";
import { REFUSAL, dayOutOfWeekWords, dayRangeWords } from "./words";

/**
 * EVERY REFUSAL A PRESS OF "CHANGE A SESSION" CAN MEET, and what it would
 * make true, on one reading of the group and the session's register. The
 * route asks it once before the write and again inside it; the preview asks
 * it too, so the dialog is refused in the words a press would be.
 *
 * PURE: no reads, the clock is handed in. Throws `ChangeRefusal`.
 *
 * ── A SESSION WHOSE TIME HAS PASSED ─────────────────────────────────────────
 * May be put right while its register has not been taken
 * (`registerIsTaken`): moved to when it really met ("It met at another
 * time", `metAtAnotherTime`, which may land in the past), moved to a time
 * still to come, cancelled, or cancelled with the rest pushed back. Holding it
 * online and putting it back as usual are for a session still to come. A
 * session whose register was taken met, and its time cannot change: the
 * register is corrected instead.
 *
 * ── A MOVE ──────────────────────────────────────────────────────────────────
 * Stays inside the week's own seven days (a session a week later is "push the
 * rest back"), lands in the future unless it is "It met at another time"
 * (then it lands in the past), and may set the length and a campus for that
 * week. An empty room is a room still to book only when the press says so.
 *
 * ── PUT IT BACK AS USUAL ────────────────────────────────────────────────────
 * Only for a week that "Change a session" changed (a change record that is
 * online, moved or cancelled). A week whose override has no change record is
 * a week pinned to when it met, or a link for that week alone: there is
 * nothing to put back. Putting back removes from the override only what a
 * change sets (day, time, length, room, campus) and keeps the week's own link
 * and notes.
 */

export class ChangeRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ChangeRefusal";
  }
}

/** The fields of a week's override a change sets, and that putting it back removes. */
export const CHANGE_FIELDS = ["weekday", "startTimeLocal", "durationMinutes", "location", "campus"] as const;

/** What a press resolves to on one reading of the group. */
export type CheckedPress = {
  weekId: string;
  /** The session as it is now. */
  session: ResolvedSession;
  /** The session's date now: the evening a cancel takes off, the date a move moves from. */
  dateKey: string;
  /** Its start has passed. */
  started: boolean;
  /** For a move: everything the week's override will hold of it. */
  move: {
    dateKey: string;
    weekday: number;
    startTimeLocal: string;
    durationMinutes: number;
    location: string;
    /** The campus the press set for the week, or null when it set none. */
    campus: GroupCampus | null;
  } | null;
  pushed: { plan: WeekPlanEntry[]; newDateKey: string; lastDateKey: string } | null;
  /** For a put back: the override that is left (its link and notes), or null for none. */
  restoredOverride: GroupSessionOverride | null;
  /** The group as it reads once the press is written: what the preview and the registers are worked from. */
  after: SessionGroup;
  /** The row the press writes to the group's history. */
  auditKind: CourseAuditKind;
};

function change(kind: SessionChange["kind"], dateKey: string): SessionChange {
  return { kind, reason: "", dateKey, byUid: "", at: null };
}

/** The override with the fields a change sets taken out, and null when nothing else is left. */
export function overrideWithoutChange(override: GroupSessionOverride | undefined): GroupSessionOverride | null {
  if (!override) return null;
  const left: GroupSessionOverride = { ...override };
  for (const field of CHANGE_FIELDS) delete left[field];
  delete left.mode;
  return Object.keys(left).length > 0 ? left : null;
}

export function checkPress(
  run: CourseRunDoc,
  group: SessionGroup,
  press: ChangePress,
  now: Date,
  /** The session's register as stored, or undefined while it has none. */
  register: Readonly<Record<string, unknown>> | undefined,
): CheckedPress {
  const sessions = resolveSessions(run, group);
  const session = sessionOfWeek(sessions, press.weekNumber);
  if (!session || !session.dateKey) throw new ChangeRefusal(REFUSAL.noSuchSession, 400);
  if (session.dateKey !== press.dateKey) throw new ChangeRefusal(REFUSAL.stale, 409);
  const { startsAt } = sessionInstants(session);
  if (!startsAt) throw new ChangeRefusal(REFUSAL.noSuchSession, 400);
  const started = startsAt.getTime() <= now.getTime();
  const weekId = session.weekId;

  if (started) {
    // It met: the register says so, and the register is what is corrected.
    if (registerIsTaken(register)) throw new ChangeRefusal(REFUSAL.met, 409);
    if (press.kind === "online") throw new ChangeRefusal(REFUSAL.startedOnline, 409);
    if (press.kind === "restore") throw new ChangeRefusal(REFUSAL.startedRestore, 409);
  } else if (press.metAtAnotherTime) {
    throw new ChangeRefusal(REFUSAL.notMetYet, 400);
  }

  const record = sessionChangeForWeek(group, weekId);
  const overrides = { ...group.sessionOverrides };
  const changes = { ...(group.sessionChanges ?? {}) };
  const base = {
    weekId,
    session,
    dateKey: session.dateKey,
    started,
    move: null,
    pushed: null,
    restoredOverride: null,
  };

  switch (press.kind) {
    case "online": {
      if (!session.session.meetingUrl) throw new ChangeRefusal(REFUSAL.noLink, 400);
      overrides[weekId] = { ...overrides[weekId], mode: "virtual" };
      changes[weekId] = change("online", session.dateKey);
      return { ...base, after: { ...group, sessionOverrides: overrides, sessionChanges: changes }, auditKind: "session-online" };
    }
    case "move": {
      const move = press.move;
      if (!move) throw new ChangeRefusal(REFUSAL.move, 400);
      const days = slotDays(session.slotStartKey);
      if (!days.includes(move.dateKey)) {
        throw new ChangeRefusal(
          dayOutOfWeekWords(session.weekNumber, dayRangeWords(days[0] ?? "", days[days.length - 1] ?? "")),
          400,
        );
      }
      // An empty room is a room still to book only when the press says so.
      if (!move.room && !move.roomToBeConfirmed && session.session.location.trim()) {
        throw new ChangeRefusal(REFUSAL.room, 400);
      }
      const weekday = new Date(`${move.dateKey}T12:00:00Z`).getUTCDay();
      const durationMinutes = move.durationMinutes ?? session.session.durationMinutes;
      const campusNow = campusForWeek(group, weekId);
      const same =
        move.dateKey === session.dateKey &&
        move.startTimeLocal === session.session.startTimeLocal &&
        move.room === session.session.location.trim() &&
        durationMinutes === session.session.durationMinutes &&
        (move.campus ?? campusNow) === campusNow &&
        !session.cancelled &&
        sessionModeForWeek(group, weekId) !== "virtual";
      if (same) throw new ChangeRefusal(REFUSAL.sameAsNow, 400);
      let movedStart: Date | null = null;
      try {
        movedStart = londonWallClockToInstant(move.dateKey, move.startTimeLocal);
      } catch {
        movedStart = null;
      }
      if (!movedStart) throw new ChangeRefusal(REFUSAL.time, 400);
      if (press.metAtAnotherTime) {
        // It met: when it met has happened.
        if (movedStart.getTime() > now.getTime()) throw new ChangeRefusal(REFUSAL.metInFuture, 400);
      } else if (movedStart.getTime() <= now.getTime()) {
        throw new ChangeRefusal(REFUSAL.movedIntoPast, 400);
      }
      const { mode: _mode, ...kept } = overrides[weekId] ?? {};
      overrides[weekId] = {
        ...kept,
        weekday,
        startTimeLocal: move.startTimeLocal,
        location: move.room,
        ...(move.durationMinutes !== null ? { durationMinutes: move.durationMinutes } : {}),
        ...(move.campus !== null ? { campus: move.campus } : {}),
      };
      changes[weekId] = change("moved", session.dateKey);
      return {
        ...base,
        move: {
          dateKey: move.dateKey,
          weekday,
          startTimeLocal: move.startTimeLocal,
          durationMinutes,
          location: move.room,
          campus: move.campus,
        },
        after: { ...group, sessionOverrides: overrides, sessionChanges: changes },
        auditKind: press.metAtAnotherTime ? "session-put-right" : "session-moved",
      };
    }
    case "cancel":
      changes[weekId] = change("cancelled", session.dateKey);
      return { ...base, after: { ...group, sessionChanges: changes }, auditKind: "session-cancelled" };
    case "push": {
      const pushed = pushBackOutcome(run, group, press.weekNumber);
      if (!pushed) throw new ChangeRefusal(REFUSAL.noPlan, 400);
      if (pushed.plan.length > COURSE_FIELD_LIMITS.maxWeekPlanEntries) throw new ChangeRefusal(REFUSAL.planFull, 400);
      changes[weekId] = change("pushed", session.dateKey);
      return {
        ...base,
        pushed: { plan: pushed.plan, newDateKey: pushed.newDateKey, lastDateKey: pushed.lastDateKey },
        after: { ...group, paceWeekPlan: pushed.plan, sessionChanges: changes },
        auditKind: "session-pushed",
      };
    }
    case "restore": {
      // Only a week "Change a session" changed has anything to put back: a
      // push moved the weeks rather than this one, and an override with no
      // change record is a week pinned to when it met, or its own link.
      if (!record || record.kind === "pushed") throw new ChangeRefusal(REFUSAL.notChanged, 400);
      const left = overrideWithoutChange(overrides[weekId]);
      if (left) overrides[weekId] = left;
      else delete overrides[weekId];
      delete changes[weekId];
      return {
        ...base,
        restoredOverride: left,
        after: { ...group, sessionOverrides: overrides, sessionChanges: changes },
        auditKind: "session-restored",
      };
    }
  }
}
