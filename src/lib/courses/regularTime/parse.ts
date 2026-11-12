import { isGroupCampus, type GroupCampus } from "../campus";
import { couldBeFollowed } from "../followable";
import { parseClock } from "../sessionChange/words";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { REGULAR_REFUSAL, reasonTooLongWords } from "./words";

/**
 * WHAT A PRESS OF "FROM A WEEK ONWARDS" ASKS FOR, checked before any document
 * is read. Unknown keys are refused.
 *
 *   { fromWeek, weekday, time, length, room, roomToBeConfirmed?, campus?,
 *     reason?, tell, emailCount?, preview? }
 *
 * `weekday` is 0 (Sunday) to 6, `time` as a person types it ("5:30pm"),
 * `length` in minutes. An empty `room` is a room still to book only with
 * `roomToBeConfirmed`. The reason is optional, and held to a change's rules:
 * one line, 200 characters, nothing a reader could follow. `preview: true`
 * asks what a press would do and changes nothing; telling need not be chosen.
 */

export type RegularPress = {
  fromWeek: number;
  weekday: number;
  startTimeLocal: string;
  durationMinutes: number;
  room: string;
  roomToBeConfirmed: boolean;
  campus: GroupCampus | null;
  reason: string;
  tell: boolean;
  emailCount: number;
  preview: boolean;
};

const FIELDS = new Set([
  "fromWeek",
  "weekday",
  "time",
  "length",
  "room",
  "roomToBeConfirmed",
  "campus",
  "reason",
  "tell",
  "emailCount",
  "preview",
]);

function flag(value: unknown): boolean | null {
  if (value === undefined) return false;
  return typeof value === "boolean" ? value : null;
}

export function parseRegularPress(raw: unknown): { ok: true; value: RegularPress } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REGULAR_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) return { ok: false, error: REGULAR_REFUSAL.body };
  }
  const preview = flag(body.preview);
  const roomToBeConfirmed = flag(body.roomToBeConfirmed);
  if (preview === null || roomToBeConfirmed === null) return { ok: false, error: REGULAR_REFUSAL.flag };

  const fromWeek = body.fromWeek;
  if (typeof fromWeek !== "number" || !Number.isInteger(fromWeek) || fromWeek < 1 || fromWeek > 60) {
    return { ok: false, error: REGULAR_REFUSAL.week };
  }
  const weekday = body.weekday;
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: REGULAR_REFUSAL.weekday };
  }
  const startTimeLocal = typeof body.time === "string" ? parseClock(body.time) : null;
  if (!startTimeLocal) return { ok: false, error: REGULAR_REFUSAL.time };
  const length = body.length;
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > GROUP_FIELD_LIMITS.maxDurationMinutes
  ) {
    return { ok: false, error: REGULAR_REFUSAL.length };
  }

  if (body.room !== undefined && typeof body.room !== "string") return { ok: false, error: REGULAR_REFUSAL.room };
  const room = typeof body.room === "string" ? body.room.replace(/\s+/g, " ").trim() : "";
  if (roomToBeConfirmed && room) return { ok: false, error: REGULAR_REFUSAL.roomOrToBeConfirmed };
  if (!room && !roomToBeConfirmed) return { ok: false, error: REGULAR_REFUSAL.room };
  if (room.length > GROUP_FIELD_LIMITS.location) return { ok: false, error: REGULAR_REFUSAL.room };
  if (couldBeFollowed(room)) return { ok: false, error: REGULAR_REFUSAL.roomLink };

  let campus: GroupCampus | null = null;
  if (body.campus !== undefined && body.campus !== null) {
    if (!isGroupCampus(body.campus)) return { ok: false, error: REGULAR_REFUSAL.campus };
    campus = body.campus;
  }

  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: REGULAR_REFUSAL.reasonLine };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (/[\r\n]/.test(reason)) return { ok: false, error: REGULAR_REFUSAL.reasonLine };
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) {
    return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  }
  if (couldBeFollowed(reason)) return { ok: false, error: REGULAR_REFUSAL.reasonLink };

  if (body.tell !== undefined && typeof body.tell !== "boolean") return { ok: false, error: REGULAR_REFUSAL.tell };
  if (body.tell === undefined && !preview) return { ok: false, error: REGULAR_REFUSAL.tell };
  const tell = body.tell === true;
  let emailCount = 0;
  if (tell && !preview) {
    if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
      return { ok: false, error: REGULAR_REFUSAL.emailCount };
    }
    emailCount = body.emailCount;
  }

  return {
    ok: true,
    value: {
      fromWeek,
      weekday,
      startTimeLocal,
      durationMinutes: length,
      room,
      roomToBeConfirmed,
      campus,
      reason,
      tell,
      emailCount,
      preview,
    },
  };
}
