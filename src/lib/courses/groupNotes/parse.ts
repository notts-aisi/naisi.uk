import { COURSE_GROUP_NOTE_LIMITS } from "@/lib/firestore/courseGroupNotes";
import { NOTE_REFUSAL, noteTooLongWords } from "@/lib/courses/facilitatorPageWords";

/**
 * THE BODY OF A PRESS ON THE NOTES ROUTE, checked before anything is read:
 * `{ body }`, one note's words.
 *
 * The words are plain text. Line breaks are made `\n` and the whole is
 * trimmed, so what is counted against the limit is what is kept. An empty
 * note, or one of only spaces, is refused in a sentence a person can act on,
 * and so is one over the limit.
 */

export type ParsedGroupNote = { ok: true; body: string } | { ok: false; error: string };

export function parseGroupNote(raw: unknown): ParsedGroupNote {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: NOTE_REFUSAL.body };
  const given = (raw as Record<string, unknown>).body;
  if (given !== undefined && typeof given !== "string") return { ok: false, error: NOTE_REFUSAL.body };
  const body = (typeof given === "string" ? given : "").replace(/\r\n?/g, "\n").trim();
  if (!body) return { ok: false, error: NOTE_REFUSAL.empty };
  if (body.length > COURSE_GROUP_NOTE_LIMITS.body) {
    return { ok: false, error: noteTooLongWords(COURSE_GROUP_NOTE_LIMITS.body) };
  }
  return { ok: true, body };
}
