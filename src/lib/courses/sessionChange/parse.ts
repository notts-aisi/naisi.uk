import { isGroupCampus, type GroupCampus } from "../campus";
import { couldBeFollowed } from "../followable";
import { isValidDateKey } from "../weekPlan";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { CHANGE_KINDS, REFUSAL, parseClock, reasonTooLongWords, type ChangeKind } from "./words";

/**
 * WHAT A PRESS OF "CHANGE A SESSION" ASKS FOR, checked before any document is
 * read. Every refusal is a sentence the person pressing can act on.
 *
 * The press names the session by its week and by the date the dialog showed
 * it on: the route refuses a date that is no longer the session's, so a
 * dialog opened before somebody else changed the session cannot change the
 * wrong evening.
 *
 * NOTHING IN A PRESS CAN CARRY A LINK. The reason goes into an update and its
 * email, and a moved session's room onto every card and into next week's
 * email; a link to a session belongs on the site, behind sign-in. So
 * both are refused when they hold anything a reader could follow, by the one
 * function the two emails that print a room already ask (`couldBeFollowed`).
 *
 * A PREVIEW is the same body with `preview: true`: it is checked the same
 * way, except that the reason may still be empty and telling need not be
 * chosen, so the dialog can ask what a press would do while it is filled in.
 */

export type ChangePress = {
  weekNumber: number;
  /** The session's date as the dialog showed it. */
  dateKey: string;
  kind: ChangeKind;
  /**
   * For a move: the day it moves to, the stored clock, the room ("" with
   * Room to be confirmed ticked), and, when the press says them, its length
   * and its campus. A length or campus not said is the session's own.
   */
  move: {
    dateKey: string;
    startTimeLocal: string;
    room: string;
    roomToBeConfirmed: boolean;
    durationMinutes: number | null;
    campus: GroupCampus | null;
  } | null;
  /**
   * "It met at another time": a move of a session whose time has passed to
   * when it really met, which may itself be in the past. Only with a move.
   */
  metAtAnotherTime: boolean;
  /** Ask what the press would do, and change nothing. The reason may be empty. */
  preview: boolean;
  reason: string;
  /** Post an update to the group, and email it when `emailCount` is above nought. */
  tell: boolean;
  /** How many people the button said it would email. Nought posts without an email. */
  emailCount: number;
};

export type ParsedPress = { ok: true; value: ChangePress } | { ok: false; error: string };

const FIELDS = new Set(["week", "dateKey", "kind", "move", "reason", "tell", "emailCount", "metAtAnotherTime", "preview"]);
const MOVE_FIELDS = new Set(["dateKey", "time", "room", "length", "campus", "roomToBeConfirmed"]);

function oneLine(value: string): boolean {
  return !/[\r\n]/.test(value);
}

/** An optional true-or-false: missing is false; anything but a boolean is refused. */
function flag(value: unknown): boolean | null {
  if (value === undefined) return false;
  return typeof value === "boolean" ? value : null;
}

export function parseChangePress(raw: unknown): ParsedPress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) return { ok: false, error: REFUSAL.body };
  }

  const weekNumber = body.week;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60) {
    return { ok: false, error: REFUSAL.week };
  }
  if (typeof body.dateKey !== "string" || !isValidDateKey(body.dateKey)) return { ok: false, error: REFUSAL.date };
  if (!CHANGE_KINDS.includes(body.kind as ChangeKind)) return { ok: false, error: REFUSAL.kind };
  const kind = body.kind as ChangeKind;

  const preview = flag(body.preview);
  const metAtAnotherTime = flag(body.metAtAnotherTime);
  if (preview === null || metAtAnotherTime === null) return { ok: false, error: REFUSAL.flag };
  if (metAtAnotherTime && kind !== "move") return { ok: false, error: REFUSAL.metNeedsMove };

  // A reason is needed for a press; a preview may be asked before one is written.
  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: REFUSAL.reason };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason && !preview) return { ok: false, error: REFUSAL.reason };
  if (!oneLine(reason)) return { ok: false, error: REFUSAL.reasonLine };
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) {
    return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  }
  if (couldBeFollowed(reason)) return { ok: false, error: REFUSAL.reasonLink };

  let move: ChangePress["move"] = null;
  if (kind === "move") {
    const raw = body.move;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REFUSAL.move };
    const asked = raw as Record<string, unknown>;
    for (const key of Object.keys(asked)) {
      if (!MOVE_FIELDS.has(key)) return { ok: false, error: REFUSAL.move };
    }
    if (typeof asked.dateKey !== "string" || !isValidDateKey(asked.dateKey)) return { ok: false, error: REFUSAL.move };
    const startTimeLocal = typeof asked.time === "string" ? parseClock(asked.time) : null;
    if (!startTimeLocal) return { ok: false, error: REFUSAL.time };
    const toBeConfirmed = flag(asked.roomToBeConfirmed);
    if (toBeConfirmed === null) return { ok: false, error: REFUSAL.flag };
    if (asked.room !== undefined && typeof asked.room !== "string") return { ok: false, error: REFUSAL.room };
    if (asked.room === undefined && !toBeConfirmed) return { ok: false, error: REFUSAL.room };
    const room = typeof asked.room === "string" ? asked.room.trim() : "";
    if (toBeConfirmed && room) return { ok: false, error: REFUSAL.roomOrToBeConfirmed };
    if (!oneLine(room) || room.length > GROUP_FIELD_LIMITS.location) return { ok: false, error: REFUSAL.room };
    if (couldBeFollowed(room)) return { ok: false, error: REFUSAL.roomLink };
    let durationMinutes: number | null = null;
    if (asked.length !== undefined) {
      const length = asked.length;
      if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length < 1 ||
        length > GROUP_FIELD_LIMITS.maxDurationMinutes
      ) {
        return { ok: false, error: REFUSAL.length };
      }
      durationMinutes = length;
    }
    let campus: GroupCampus | null = null;
    if (asked.campus !== undefined) {
      if (!isGroupCampus(asked.campus)) return { ok: false, error: REFUSAL.campus };
      campus = asked.campus;
    }
    move = { dateKey: asked.dateKey, startTimeLocal, room, roomToBeConfirmed: toBeConfirmed, durationMinutes, campus };
  } else if (body.move !== undefined && body.move !== null) {
    return { ok: false, error: REFUSAL.move };
  }

  // Telling is chosen for a press; a preview says who would be told either way.
  if (body.tell !== undefined && typeof body.tell !== "boolean") return { ok: false, error: REFUSAL.tell };
  if (body.tell === undefined && !preview) return { ok: false, error: REFUSAL.tell };
  const tell = body.tell === true;
  let emailCount = 0;
  if (tell && !preview) {
    if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
      return { ok: false, error: REFUSAL.emailCount };
    }
    emailCount = body.emailCount;
  }

  return {
    ok: true,
    value: { weekNumber, dateKey: body.dateKey, kind, move, metAtAnotherTime, preview, reason, tell, emailCount },
  };
}
