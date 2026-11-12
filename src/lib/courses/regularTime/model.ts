import type { GroupCampus } from "../campus";
import { resolveSessions, sessionInstants, type ResolvedSession, type SessionGroup } from "../sessions";
import { CHANGE_FIELDS } from "../sessionChange/check";
import { registerIsTaken } from "@/lib/firestore/courseAttendance";
import {
  GROUP_FIELD_LIMITS,
  campusForWeek,
  sessionChangeForWeek,
  type GroupSession,
  type GroupSessionOverride,
  type SessionChange,
} from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { REGULAR_REFUSAL, laterMetWords, startMetWords, startsInPastWords } from "./words";

/**
 * A NEW REGULAR TIME FROM A WEEK ONWARDS, as arithmetic. Pure: no reads, the
 * clock is handed in. The route, its preview and the tests ask this one
 * function, so the preview cannot promise what the write does not do.
 *
 * ── WHY IT PINS EARLIER WEEKS ───────────────────────────────────────────────
 * A week has no stored date: every session is dated from the group's
 * standing slot plus that week's override (`resolveSessions`). Changing the
 * standing slot alone re-dates every week, the ones that met included. So
 * before the slot changes, every taught week before the starting week is
 * PINNED: for each of day, start, length, room and campus, when the week's
 * own override does not already carry it and the old standing value differs
 * from the new one, the old value is written into the week's override. An
 * existing override value always wins. A pinned week has no change record:
 * it is not a change, and there is nothing to put back. The code from before
 * this existed already reads overrides, so the dates stay right if this is
 * ever reverted.
 *
 * ── THE STARTING WEEK, AND AFTER ────────────────────────────────────────────
 * The starting week must be a taught week of the group's own plan, its
 * register must not have been taken (it met: take that register and start
 * from the next week), and no later week's register may have been taken
 * either. Its session on the new slot must not have passed. Later weeks that
 * carry their own one-week change (a change record, or a time of their own
 * set by hand) keep it; a cancelled evening is kept by moving its record to
 * the week's new date, because a cancellation names the evening.
 */

/** The new standing slot. `campus` null keeps the group's campus. */
export type RegularSlot = {
  weekday: number;
  startTimeLocal: string;
  durationMinutes: number;
  location: string;
  campus: GroupCampus | null;
};

/** The override fields a pin writes. */
export type Pin = Partial<Pick<GroupSessionOverride, "weekday" | "startTimeLocal" | "durationMinutes" | "location" | "campus">>;

/** Why a week keeps its own time after the change. */
export type OwnTime = "online" | "moved" | "cancelled" | "pushed" | "set";

export type RegularPlan = {
  fromWeek: number;
  /** The override fields to write, by week id, for the earlier weeks. */
  pins: Record<string, Pin>;
  /** The earlier taught weeks, each staying where it is; `pinned` when it needed a pin to. */
  kept: Array<{ weekNumber: number; weekId: string; session: ResolvedSession; pinned: boolean }>;
  /** The weeks from the starting week on whose session moves: before and after. */
  moves: Array<{ weekNumber: number; weekId: string; before: ResolvedSession; after: ResolvedSession }>;
  /** Later weeks keeping their own one-week change, and what it is. */
  ownTimes: Array<{ weekNumber: number; weekId: string; session: ResolvedSession; kind: OwnTime }>;
  /** Cancelled evenings that move with their week: the record's new date, by week id. */
  cancelledMoves: Record<string, string>;
  /** The day or the start changed: "Can you make this time?" is asked again. */
  dayOrTimeChanged: boolean;
  /** The standing slot after the change. */
  session: GroupSession;
  /** The campus after the change, when the press set one; null keeps the group's. */
  campus: GroupCampus | null;
  /** The group as it reads once the plan is written. */
  after: SessionGroup;
  /** The sessions before and after, in schedule order. */
  sessionsBefore: ResolvedSession[];
  sessionsAfter: ResolvedSession[];
};

export type RegularRefusal = { ok: false; status: 400 | 409; error: string };

/** Whether a week carries a time of its own: any of the fields a change or a pin sets. */
function hasOwnTime(override: GroupSessionOverride | undefined): boolean {
  return Boolean(override) && CHANGE_FIELDS.some((field) => Object.hasOwn(override as object, field));
}

/** What a week's own change is, when it keeps one. */
function ownTimeOf(change: SessionChange | null, override: GroupSessionOverride | undefined): OwnTime | null {
  if (change) return change.kind === "cancelled" ? "cancelled" : change.kind;
  if (override?.mode === "virtual") return "online";
  return hasOwnTime(override) ? "set" : null;
}

/** Whether a week's session is the same before and after: its start, length, room and campus. */
function sameSession(
  before: { group: SessionGroup; session: ResolvedSession },
  after: { group: SessionGroup; session: ResolvedSession },
): boolean {
  return (
    (sessionInstants(before.session).startsAt?.getTime() ?? -1) === (sessionInstants(after.session).startsAt?.getTime() ?? -1) &&
    before.session.session.durationMinutes === after.session.session.durationMinutes &&
    before.session.session.location === after.session.session.location &&
    campusForWeek(before.group, before.session.weekId) === campusForWeek(after.group, after.session.weekId)
  );
}

export function planRegularChange(input: {
  run: CourseRunDoc;
  group: SessionGroup;
  fromWeek: number;
  slot: RegularSlot;
  /** Each taught week's register as stored, by week number; missing for none. */
  registers: ReadonlyMap<number, Readonly<Record<string, unknown>>>;
  /** The week ids the group's `sessionOverrides` holds AS STORED (the cap counts these). */
  storedOverrideWeekIds: readonly string[];
  now: Date;
}): { ok: true; plan: RegularPlan } | RegularRefusal {
  const { run, group, fromWeek, slot, registers, now } = input;
  const refuse = (status: 400 | 409, error: string): RegularRefusal => ({ ok: false, status, error });

  const sessionsBefore = resolveSessions(run, group);
  const firsts = sessionsBefore.filter((session) => session.occurrence === 1);
  const startIndex = firsts.findIndex((session) => session.weekNumber === fromWeek);
  const start = firsts[startIndex];
  if (!start || !start.dateKey) return refuse(400, REGULAR_REFUSAL.notTaught);
  if (registerIsTaken(registers.get(fromWeek))) return refuse(409, startMetWords(fromWeek));
  for (const later of firsts.slice(startIndex + 1)) {
    if (registerIsTaken(registers.get(later.weekNumber))) return refuse(409, laterMetWords(later.weekNumber));
  }

  const standing = group.session;
  const campus = slot.campus;
  const next: GroupSession = {
    ...standing,
    weekday: slot.weekday,
    startTimeLocal: slot.startTimeLocal,
    durationMinutes: slot.durationMinutes,
    location: slot.location,
  };
  const dayOrTimeChanged = standing.weekday !== next.weekday || standing.startTimeLocal !== next.startTimeLocal;
  const campusChanged = campus !== null && campus !== group.campus;
  if (
    !dayOrTimeChanged &&
    !campusChanged &&
    standing.durationMinutes === next.durationMinutes &&
    standing.location.trim() === next.location.trim()
  ) {
    return refuse(400, REGULAR_REFUSAL.same);
  }

  // ── Pin every earlier taught week ────────────────────────────────────────
  const pins: Record<string, Pin> = {};
  const overrides: Record<string, GroupSessionOverride> = { ...group.sessionOverrides };
  for (const week of firsts.slice(0, startIndex)) {
    const own = overrides[week.weekId] ?? {};
    const pin: Pin = {};
    const keep = <K extends keyof Pin>(field: K, was: Pin[K], becomes: Pin[K]) => {
      if (Object.hasOwn(own, field) || was === becomes) return;
      pin[field] = was;
    };
    keep("weekday", standing.weekday, next.weekday);
    keep("startTimeLocal", standing.startTimeLocal, next.startTimeLocal);
    keep("durationMinutes", standing.durationMinutes, next.durationMinutes);
    keep("location", standing.location, next.location);
    // A campus can only be pinned when the group had one: "not chosen" is no
    // value an override can hold, and such a week reads the group's either way.
    if (campusChanged && group.campus) keep("campus", group.campus, campus ?? group.campus);
    if (Object.keys(pin).length > 0) {
      pins[week.weekId] = pin;
      overrides[week.weekId] = { ...own, ...pin };
    }
  }
  const storedWeeks = new Set(input.storedOverrideWeekIds);
  for (const weekId of Object.keys(pins)) storedWeeks.add(weekId);
  if (storedWeeks.size > GROUP_FIELD_LIMITS.maxSessionOverrides) return refuse(409, REGULAR_REFUSAL.full);

  // ── The cancelled evenings that move with their week ─────────────────────
  const changed = { ...(group.sessionChanges ?? {}) };
  const provisional: SessionGroup = {
    ...group,
    session: next,
    campus: campusChanged ? campus : group.campus,
    sessionOverrides: overrides,
  };
  const cancelledMoves: Record<string, string> = {};
  for (const week of resolveSessions(run, { ...provisional, sessionChanges: {} })) {
    if (week.occurrence !== 1) continue;
    const index = firsts.findIndex((each) => each.weekNumber === week.weekNumber);
    if (index < 0 || index < startIndex) continue;
    const record = changed[week.weekId];
    if (record?.kind === "cancelled" && firsts[index]?.cancelled && week.dateKey && week.dateKey !== record.dateKey) {
      changed[week.weekId] = { ...record, dateKey: week.dateKey };
      cancelledMoves[week.weekId] = week.dateKey;
    }
  }
  const after: SessionGroup = { ...provisional, sessionChanges: changed };
  const sessionsAfter = resolveSessions(run, after);
  const afterOf = (weekNumber: number) =>
    sessionsAfter.find((session) => session.weekNumber === weekNumber && session.occurrence === 1);

  // The starting week's new session must still be to come.
  const startAfter = afterOf(fromWeek);
  const startsAt = startAfter ? sessionInstants(startAfter).startsAt : null;
  if (startAfter && startsAt && startsAt.getTime() <= now.getTime() && !startAfter.cancelled) {
    return refuse(409, startsInPastWords(fromWeek, startAfter.dateKey, startAfter.session.startTimeLocal));
  }

  const kept = firsts.slice(0, startIndex).map((week) => ({
    weekNumber: week.weekNumber,
    weekId: week.weekId,
    session: afterOf(week.weekNumber) ?? week,
    pinned: Object.hasOwn(pins, week.weekId),
  }));
  const moves: RegularPlan["moves"] = [];
  const ownTimes: RegularPlan["ownTimes"] = [];
  for (const week of firsts.slice(startIndex)) {
    const then = afterOf(week.weekNumber);
    if (!then) continue;
    const own = ownTimeOf(sessionChangeForWeek(group, week.weekId), group.sessionOverrides[week.weekId]);
    if (own && own !== "pushed") ownTimes.push({ weekNumber: week.weekNumber, weekId: week.weekId, session: then, kind: own });
    if (!sameSession({ group, session: week }, { group: after, session: then })) {
      moves.push({ weekNumber: week.weekNumber, weekId: week.weekId, before: week, after: then });
    }
  }

  return {
    ok: true,
    plan: {
      fromWeek,
      pins,
      kept,
      moves,
      ownTimes,
      cancelledMoves,
      dayOrTimeChanged,
      session: next,
      campus: campusChanged ? campus : null,
      after,
      sessionsBefore,
      sessionsAfter,
    },
  };
}
