import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import { COURSE_GROUP_SHARED_NOTE_LIMITS } from "@/lib/firestore/courseGroupSharedNotes";
import { SHARED_NOTE_REFUSAL, sharedNoteTooLongWords } from "./words";

/**
 * THE BODY OF A PRESS ON THE SHARED NOTES ROUTE, checked before anything is
 * read: `{ body, weekNumber }`, one note's words and the week whose page it
 * was written on.
 *
 * The words are plain text. Line breaks are made `\n` and the whole is
 * trimmed, so what is counted against the limit is what is kept. An empty
 * note, or one of only spaces, is refused in a sentence a person can act on,
 * and so is one over the limit. The week is a whole number inside the
 * plan's bounds; whether it is one of the run's weeks is the route's to ask
 * once the run is read.
 */

export type ParsedSharedNote =
  | { ok: true; body: string; weekNumber: number }
  | { ok: false; error: string };

export function parseSharedNote(raw: unknown): ParsedSharedNote {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: SHARED_NOTE_REFUSAL.body };
  const fields = raw as Record<string, unknown>;
  const given = fields.body;
  if (given !== undefined && typeof given !== "string") return { ok: false, error: SHARED_NOTE_REFUSAL.body };
  const week = fields.weekNumber;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > COURSE_FIELD_LIMITS.maxWeekPlanEntries) {
    return { ok: false, error: SHARED_NOTE_REFUSAL.body };
  }
  const body = (typeof given === "string" ? given : "").replace(/\r\n?/g, "\n").trim();
  if (!body) return { ok: false, error: SHARED_NOTE_REFUSAL.empty };
  if (body.length > COURSE_GROUP_SHARED_NOTE_LIMITS.body) {
    return { ok: false, error: sharedNoteTooLongWords(COURSE_GROUP_SHARED_NOTE_LIMITS.body) };
  }
  return { ok: true, body, weekNumber: week };
}
