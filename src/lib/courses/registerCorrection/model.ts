import { couldBeFollowed } from "@/lib/courses/followable";
import {
  ATTENDANCE_STATUSES,
  cameBy,
  type AttendanceStatus,
  type CourseAttendanceDoc,
  type LineSetter,
} from "@/lib/firestore/courseAttendance";
import type { CourseAuditValue } from "@/lib/firestore/courseAudit";
import { lineWords, tooLongWords } from "./words";

/**
 * CORRECTING A FINISHED REGISTER, as arithmetic: what a line says, whether a
 * correction moves it, what the history row keeps of it before and after,
 * and the rules a reason is held to. Pure: no reads, no clock.
 *
 * ## The rules it holds
 *
 *  - A LINE is a mark and, beside a mark that says they came (present, late,
 *    left early), whether they were online. Any other mark is in no place;
 *    a register written before it kept where people were reads as in the
 *    room.
 *  - A REASON is needed for every correction: one line, no link, at most
 *    `CORRECTION_REASON_MAX` characters, as a change of time's reason is
 *    held, but longer. A page from before reasons were asked sends none at
 *    all, and is told so in one plain sentence.
 *  - THE HISTORY KEEPS what a line said before (its mark, where, its words,
 *    and who set it and when) and what it says after, as plain values, so
 *    nothing a correction replaces is lost. Never a note's words.
 */

/** The longest reason a correction or a request takes. */
export const CORRECTION_REASON_MAX = 300;

/** One line of a register: the mark, and online beside a mark that says they came. */
export type RegisterLine = { mark: AttendanceStatus | null; online: boolean };

/** What one person's line says on a register, as every figure reads it. */
export function lineOf(register: Pick<CourseAttendanceDoc, "records" | "online">, uid: string): RegisterLine {
  const mark = register.records[uid] ?? null;
  return { mark, online: cameBy(mark) && register.online[uid] === true };
}

/** Whether two lines say the same thing. */
export function sameLine(a: RegisterLine, b: RegisterLine): boolean {
  return a.mark === b.mark && (cameBy(a.mark) ? a.online === b.online : true);
}

/** A line with its place made consistent: online only beside a mark that says they came. */
export function tidyLine(line: RegisterLine): RegisterLine {
  return { mark: line.mark, online: cameBy(line.mark) && line.online };
}

/** A line as the history keeps it: "In the room". */
export function wordsOf(line: RegisterLine): string {
  return lineWords(line.mark, line.online);
}

/** What a corrected line said before, as a history row's `before`: the line, and who set it and when. */
export function beforeValues(line: RegisterLine, setBy: LineSetter | undefined): Record<string, CourseAuditValue> {
  return {
    mark: line.mark,
    online: line.online,
    line: wordsOf(line),
    setByUid: setBy?.byUid ?? null,
    setAt: setBy ? setBy.at.toISOString() : null,
    setHow: setBy?.how ?? null,
  };
}

/** What a corrected line says after, as a history row's `after`. */
export function afterValues(line: RegisterLine): Record<string, CourseAuditValue> {
  return { mark: line.mark, online: line.online, line: wordsOf(line) };
}

export type ParsedReason = { ok: true; value: string } | { ok: false; error: string };

/**
 * A reason as a correction or a request is held to it. `missing` is the
 * sentence for a body with no reason at all (an old page, or a request
 * form); a preview may be asked before one is written.
 */
export function parseCorrectionReason(
  raw: unknown,
  opts: {
    preview: boolean;
    missing: string;
    empty: string;
    text: string;
    line: string;
    link: string;
    max?: number;
    what?: "reason" | "reply";
  },
): ParsedReason {
  const max = opts.max ?? CORRECTION_REASON_MAX;
  if (raw === undefined || raw === null) return opts.preview ? { ok: true, value: "" } : { ok: false, error: opts.missing };
  if (typeof raw !== "string") return { ok: false, error: opts.text };
  const value = raw.trim();
  if (!value && !opts.preview) return { ok: false, error: opts.empty };
  if (/[\r\n]/.test(value)) return { ok: false, error: opts.line };
  if (value.length > max) return { ok: false, error: tooLongWords(opts.what ?? "reason", max) };
  if (couldBeFollowed(value)) return { ok: false, error: opts.link };
  return { ok: true, value };
}

/**
 * A line a press asks for: `{ status, online? }`, the status one of the five
 * marks. `online` is only for a mark that says they came; left out, they
 * were in the room. Null for anything else.
 */
export function parseAskedLine(raw: unknown): RegisterLine | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (!ATTENDANCE_STATUSES.includes(body.status as AttendanceStatus)) return null;
  const mark = body.status as AttendanceStatus;
  if (body.online !== undefined && typeof body.online !== "boolean") return null;
  if (body.online === true && !cameBy(mark)) return null;
  return { mark, online: body.online === true };
}
