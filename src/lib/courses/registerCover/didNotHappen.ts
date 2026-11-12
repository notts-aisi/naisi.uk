import { REFUSAL } from "@/lib/courses/sessionChange/words";
import {
  ATTENDANCE_STATUS_LABEL,
  cameBy,
  normalizeCourseAttendance,
  registerIsTaken,
  type CourseAttendanceDoc,
} from "@/lib/firestore/courseAttendance";
import { REGISTER_COVER_REFUSAL } from "./words";

/**
 * A SESSION THAT DID NOT HAPPEN, CALLED OFF AFTER THE FACT, as arithmetic:
 * which lines of its register a cancel clears, and what each said, for the
 * history row's `before`. Pure.
 *
 * The lines SET FOR THE SESSION go: every mark a facilitator, a lead, an
 * admin or somebody covering saved, with where each person who came was and
 * who set it. What people SAID IN ADVANCE stays, exactly as a cancelled or
 * pushed week keeps it: an excused line that is still the person's own word
 * ("Can't make it", "Most weeks, not all"), and "Joining online". So nothing
 * is lost silently (the row keeps what each cleared line said) and no stale
 * mark can reappear on the session that replaces it when the rest is pushed
 * back.
 */

/** "Present", "Present online", "Absent": a line as the history keeps it. */
function lineWords(register: CourseAttendanceDoc, uid: string): string {
  const mark = register.records[uid];
  return cameBy(mark) && register.online[uid] === true ? `${ATTENDANCE_STATUS_LABEL[mark]} online` : ATTENDANCE_STATUS_LABEL[mark];
}

/** Whether a line is still the person's own word in advance: excused, on their word. */
function saidInAdvance(register: CourseAttendanceDoc, uid: string): boolean {
  return register.records[uid] === "excused" && register.excusedInAdvance[uid] !== undefined;
}

export type ClearedLines = {
  /** The uids whose line goes. */
  uids: string[];
  /** What each said, by uid: the history row's `before`. */
  said: Record<string, string>;
};

/** The lines a cancel after the fact clears, and what each said. */
export function linesSetForSession(register: CourseAttendanceDoc | null): ClearedLines {
  if (!register) return { uids: [], said: {} };
  const uids = Object.keys(register.records)
    .filter((uid) => !saidInAdvance(register, uid))
    .sort();
  const said: Record<string, string> = {};
  for (const uid of uids) said[uid] = lineWords(register, uid);
  return { uids, said };
}

/**
 * Whether this press calls off a session whose register is a draft somebody
 * marked: a cancel or a push of a session not called off already, on a
 * register taken and not finished that does not say the session did not
 * happen (a register that does keeps its own reading, and every change to it
 * is refused as before).
 */
export function callsOffDraft(
  press: { kind: string },
  register: Readonly<Record<string, unknown>> | undefined,
  session: { cancelled: boolean },
): boolean {
  if (press.kind !== "cancel" && press.kind !== "push") return false;
  if (session.cancelled) return false;
  if (!register || !registerIsTaken(register)) return false;
  const stored = normalizeCourseAttendance("register", register);
  return stored.pushedAt === null && stored.held;
}

/** The refusal for a session whose register was taken and which this press may not change. */
export function takenRefusal(press: { kind: string }, register: Readonly<Record<string, unknown>> | undefined): string {
  const finished = Boolean(register && register.pushedAt !== undefined && register.pushedAt !== null);
  return finished && (press.kind === "cancel" || press.kind === "push") ? REGISTER_COVER_REFUSAL.finishedDidNotHappen : REFUSAL.met;
}
