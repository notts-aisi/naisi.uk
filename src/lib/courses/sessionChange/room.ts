import { campusLabel } from "../campus";
import { couldBeFollowed } from "../followable";
import { resolveSessions, sessionInstants, type ResolvedSession } from "../sessions";
import { isValidDateKey } from "../weekPlan";
import { registerIsTaken } from "@/lib/firestore/courseAttendance";
import {
  GROUP_FIELD_LIMITS,
  campusForWeek,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
  type GroupSessionOverride,
} from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { sessionOfWeek } from "./model";
import { ROOM_REFUSAL, type RoomNotice } from "./roomWords";
import { REFUSAL, reasonTooLongWords } from "./words";

/**
 * A ROOM-ONLY CHANGE OF ONE WEEK, OR OF SEVERAL WEEKS OF ONE GROUP: the kind
 * `room` of the one-week change route
 * (`POST /api/courses/groups/[groupId]/session/change`), as arithmetic. PURE:
 * no reads, the clock handed in.
 *
 * IT CHANGES THE WEEK'S ROOM AND NOTHING ELSE. It writes the week's own
 * `sessionOverrides.<week>.location` (a week that just changes rooms stores
 * only that), never the week's day, start or length, and no change record in
 * `sessionChanges`: the week is not "moved". So a later change of the group's
 * regular time still reaches the week (its day and time are the group's), the
 * Weeks tab's "This week is online" still treats the group as unchanged, and
 * no page says Moved. A week that already carries a one-week change keeps it,
 * and only its room changes.
 *
 * NO ROOM IS A CHOICE: an empty room, "TBC" (any case, with or without
 * dots), "to be confirmed" or a lone "-" all mean no room, stored as the
 * week's own empty room (the way a one-week move with Room to be confirmed
 * stores it), so the week reads Room to be confirmed even when the group has
 * a usual room. A room typed that is the group's usual room, on a week with
 * no change record, takes the week's own room away instead, so the week
 * follows the group's room again.
 *
 * A ROOM THAT DIFFERS ONLY IN CASE OR SPACING is saved as typed, and nobody
 * is told: nothing the group reads has changed (`quiet`).
 *
 * REFUSED, per week: a week the group has no session in, a session that is no
 * longer on the date the page showed, one that has started (or met), one
 * called off, one held online (the week's own mode, or the Online campus), and
 * the room it already has.
 */

export type RoomWeek = { weekNumber: number; dateKey: string; room: string };

export type RoomPress = {
  kind: "room";
  weeks: RoomWeek[];
  reason: string;
  tell: boolean;
  emailCount: number;
  preview: boolean;
};

/** Most weeks one press may set: a run's plan holds at most 60. */
export const MAX_ROOM_WEEKS = 60;

const FIELDS = new Set(["kind", "weeks", "reason", "tell", "emailCount", "preview"]);
const WEEK_FIELDS = new Set(["week", "dateKey", "room"]);

/** Whether a body asks for a room-only change: the route sends it here before anything else is checked. */
export function isRoomPressBody(raw: unknown): boolean {
  return Boolean(raw) && typeof raw === "object" && !Array.isArray(raw) && (raw as Record<string, unknown>).kind === "room";
}

/**
 * A room typed as no room: empty, "TBC" or "TBA" in any case and with or
 * without dots, "to be confirmed", or a lone "-", each with or without a full
 * stop after it.
 */
export function isNoRoom(text: string): boolean {
  const said = text.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
  return said === "" || said === "-" || said === "to be confirmed" || /^t\.?\s?b\.?\s?[ca]\.?$/.test(said);
}

/** Two rooms that differ only in case or spacing are the same room to the people in it. */
export function sameRoomToReaders(a: string, b: string): boolean {
  const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/** A room as typed, as it is stored: trimmed, and "" for no room. */
export function roomAsStored(text: string): string {
  return isNoRoom(text) ? "" : text.trim();
}

/** Why a typed room cannot be stored, or null. */
export function roomProblem(text: string): string | null {
  const room = roomAsStored(text);
  if (/[\r\n]/.test(text.trim()) || room.length > GROUP_FIELD_LIMITS.location) return ROOM_REFUSAL.room;
  if (couldBeFollowed(room)) return ROOM_REFUSAL.roomLink;
  return null;
}

export function parseRoomPress(raw: unknown): { ok: true; value: RoomPress } | { ok: false; error: string } {
  if (!isRoomPressBody(raw)) return { ok: false, error: REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!FIELDS.has(key)) return { ok: false, error: REFUSAL.body };

  if (!Array.isArray(body.weeks) || body.weeks.length === 0 || body.weeks.length > MAX_ROOM_WEEKS) {
    return { ok: false, error: ROOM_REFUSAL.weeks };
  }
  const weeks: RoomWeek[] = [];
  for (const entry of body.weeks as unknown[]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, error: ROOM_REFUSAL.weeks };
    const asked = entry as Record<string, unknown>;
    for (const key of Object.keys(asked)) if (!WEEK_FIELDS.has(key)) return { ok: false, error: ROOM_REFUSAL.weeks };
    const weekNumber = asked.week;
    if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60) {
      return { ok: false, error: REFUSAL.week };
    }
    if (weeks.some((each) => each.weekNumber === weekNumber)) return { ok: false, error: ROOM_REFUSAL.weeks };
    if (typeof asked.dateKey !== "string" || !isValidDateKey(asked.dateKey)) return { ok: false, error: REFUSAL.date };
    if (typeof asked.room !== "string") return { ok: false, error: ROOM_REFUSAL.room };
    const problem = roomProblem(asked.room);
    if (problem) return { ok: false, error: problem };
    weeks.push({ weekNumber, dateKey: asked.dateKey, room: roomAsStored(asked.room) });
  }

  if (body.preview !== undefined && typeof body.preview !== "boolean") return { ok: false, error: REFUSAL.flag };
  const preview = body.preview === true;
  if (preview && weeks.length !== 1) return { ok: false, error: ROOM_REFUSAL.previewOneWeek };

  // A reason is optional for a room-only change: when given, it is held to the move's rules.
  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: REFUSAL.reason };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (/[\r\n]/.test(reason)) return { ok: false, error: REFUSAL.reasonLine };
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  if (couldBeFollowed(reason)) return { ok: false, error: REFUSAL.reasonLink };

  // Telling is off unless asked for, and is for one week at a time.
  if (body.tell !== undefined && typeof body.tell !== "boolean") return { ok: false, error: REFUSAL.tell };
  const tell = body.tell === true;
  if (tell && weeks.length !== 1) return { ok: false, error: ROOM_REFUSAL.tellOneWeek };
  let emailCount = 0;
  if (tell && !preview) {
    if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
      return { ok: false, error: REFUSAL.emailCount };
    }
    emailCount = body.emailCount;
  }
  return { ok: true, value: { kind: "room", weeks, reason, tell, emailCount, preview } };
}

/**
 * Whether a week's session meets online for everybody, as far as a room goes:
 * the week's own mode, or the Online campus. (A group with no campus and no
 * room is a group whose room is still to book, never an online one, here.)
 */
export function onlineForRooms(group: CourseGroupDoc, weekId: string): boolean {
  return sessionModeForWeek(group, weekId) === "virtual" || campusForWeek(group, weekId) === "online";
}

/** Where a week's room comes from: its own, the group's usual one, or none (Room to be confirmed). */
export type RoomSource = "week" | "usual" | "none";

export function roomSourceOf(group: Pick<CourseGroupDoc, "session" | "sessionOverrides">, weekId: string): RoomSource {
  const own = group.sessionOverrides[weekId]?.location;
  if (own !== undefined) return own.trim() ? "week" : "none";
  return group.session.location.trim() ? "usual" : "none";
}

export type CheckedRoomWeek =
  | {
      ok: true;
      weekNumber: number;
      weekId: string;
      session: ResolvedSession;
      wasRoom: string;
      room: string;
      /** What the week's own room becomes: a room ("" for Room to be confirmed), or null to take it away. */
      location: string | null;
      /** Only its case or spacing changes: nothing the group reads changes, so nobody is told. */
      quiet: boolean;
      /** The group once this week is written. */
      after: CourseGroupDoc;
    }
  | { ok: false; weekNumber: number; status: 400 | 409; error: string };

/** One week of a room-only press, on one reading of the group and that session's register. */
export function checkRoomWeek(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  week: RoomWeek,
  now: Date,
  register: Readonly<Record<string, unknown>> | undefined,
): CheckedRoomWeek {
  const refuse = (status: 400 | 409, error: string): CheckedRoomWeek => ({ ok: false, weekNumber: week.weekNumber, status, error });
  const session = sessionOfWeek(resolveSessions(run, group), week.weekNumber);
  if (!session || !session.dateKey) return refuse(400, REFUSAL.noSuchSession);
  if (session.dateKey !== week.dateKey) return refuse(409, REFUSAL.stale);
  const { startsAt } = sessionInstants(session);
  if (registerIsTaken(register)) return refuse(409, REFUSAL.met);
  if (!startsAt || startsAt.getTime() <= now.getTime()) return refuse(409, ROOM_REFUSAL.started);
  if (session.cancelled) return refuse(409, ROOM_REFUSAL.cancelled);
  const weekId = session.weekId;
  if (onlineForRooms(group, weekId)) return refuse(409, ROOM_REFUSAL.online);
  const wasRoom = session.session.location.trim();
  const room = week.room.trim();
  if (room === wasRoom) return refuse(400, ROOM_REFUSAL.sameAsNow);

  // The usual room on a week nobody changed: the week follows the group again.
  // Never for no room: a week taken off its room keeps its own empty room, so
  // a usual room set later does not land on a week somebody set to be confirmed.
  const followsGroup = room !== "" && room === group.session.location.trim() && sessionChangeForWeek(group, weekId) === null;
  const location = followsGroup ? null : room;
  const overrides = { ...group.sessionOverrides };
  const own: GroupSessionOverride = { ...overrides[weekId] };
  if (location === null) delete own.location;
  else own.location = location;
  if (Object.keys(own).length > 0) overrides[weekId] = own;
  else delete overrides[weekId];
  return {
    ok: true,
    weekNumber: week.weekNumber,
    weekId,
    session,
    wasRoom,
    room,
    location,
    quiet: room !== "" && sameRoomToReaders(room, wasRoom),
    after: { ...group, sessionOverrides: overrides },
  };
}

/** What the notice is about, for a week that went through. */
export function roomNoticeOf(checked: Extract<CheckedRoomWeek, { ok: true }>): RoomNotice {
  return {
    weekNumber: checked.weekNumber,
    dateKey: checked.session.dateKey,
    hhmm: checked.session.session.startTimeLocal,
    minutes: checked.session.session.durationMinutes,
    room: couldBeFollowed(checked.room) ? "" : checked.room,
    campusLabel: campusLabel(campusForWeek(checked.after, checked.weekId)),
    wasRoom: couldBeFollowed(checked.wasRoom) ? "" : checked.wasRoom,
  };
}
