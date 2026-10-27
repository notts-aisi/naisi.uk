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
 * email; a link to a session belongs on the site, behind sign-in (Q23). So
 * both are refused when they hold anything a reader could follow, by the one
 * function the two emails that print a room already ask (`couldBeFollowed`).
 */

export type ChangePress = {
  weekNumber: number;
  /** The session's date as the dialog showed it. */
  dateKey: string;
  kind: ChangeKind;
  /** For a move: the day it moves to, the stored clock and the room. */
  move: { dateKey: string; startTimeLocal: string; room: string } | null;
  reason: string;
  /** Post an update to the group, and email it when `emailCount` is above nought. */
  tell: boolean;
  /** How many people the button said it would email. Nought posts without an email. */
  emailCount: number;
};

export type ParsedPress = { ok: true; value: ChangePress } | { ok: false; error: string };

const FIELDS = new Set(["week", "dateKey", "kind", "move", "reason", "tell", "emailCount"]);

function oneLine(value: string): boolean {
  return !/[\r\n]/.test(value);
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

  if (typeof body.reason !== "string" || !body.reason.trim()) return { ok: false, error: REFUSAL.reason };
  const reason = body.reason.trim();
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
    if (typeof asked.dateKey !== "string" || !isValidDateKey(asked.dateKey)) return { ok: false, error: REFUSAL.move };
    const startTimeLocal = typeof asked.time === "string" ? parseClock(asked.time) : null;
    if (!startTimeLocal) return { ok: false, error: REFUSAL.time };
    if (typeof asked.room !== "string") return { ok: false, error: REFUSAL.room };
    const room = asked.room.trim();
    if (!oneLine(room) || room.length > GROUP_FIELD_LIMITS.location) return { ok: false, error: REFUSAL.room };
    if (couldBeFollowed(room)) return { ok: false, error: REFUSAL.roomLink };
    move = { dateKey: asked.dateKey, startTimeLocal, room };
  } else if (body.move !== undefined && body.move !== null) {
    return { ok: false, error: REFUSAL.move };
  }

  if (typeof body.tell !== "boolean") return { ok: false, error: REFUSAL.tell };
  let emailCount = 0;
  if (body.tell) {
    if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
      return { ok: false, error: REFUSAL.emailCount };
    }
    emailCount = body.emailCount;
  }

  return {
    ok: true,
    value: { weekNumber, dateKey: body.dateKey, kind, move, reason, tell: body.tell, emailCount },
  };
}
