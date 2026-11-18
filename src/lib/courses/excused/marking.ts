import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";

/**
 * WHO MARKS SOMEBODY EXCUSED ON A REGISTER, AND WHO CHANGES AN EXCUSAL THAT
 * STANDS, as the register's page asks it: the tap cycle on each cell for its
 * reader, the words that list it, and the sentences for the people who
 * cannot.
 *
 * Excused is written by hand only by an admin or the programme's lead,
 * whether or not they also facilitate the group; never a run's track lead by
 * that alone. The register's GET says which reader is one
 * (`caller.marksExcused`) and the routes decide again on every save
 * (`marksExcused` in `src/lib/courses/registerAccess.ts`).
 *
 * For anybody else (a facilitator, a co-facilitator, somebody given a
 * session), a cell where an excusal STANDS (an approved request to be excused
 * covers it, its line is excused now, or they recorded that the person came
 * over an excused line: the GET's `excusalStands`) cycles excused, present,
 * late, left early and back to excused: they may record that the person
 * came, or put the line back, and never absent or not marked. Every other
 * cell cycles present, late, left early, absent and back to not marked.
 *
 * Pure, with no server import. No dash of either kind.
 */

/** Every mark, in the order a tap moves through them, then back to not marked. */
export const MARK_CYCLE: readonly (AttendanceStatus | null)[] = ["present", "late", "left-early", "absent", "excused", null];

/** The marks one cell offers: every one, an excusal that stands, or every one but excused. */
export type CellMarks = "every" | "excusal-stands" | "no-excused";

/** Where an excusal stands: excused, or that the person came after all. Never absent, never not marked. */
const EXCUSAL_CYCLE: readonly (AttendanceStatus | null)[] = ["excused", "present", "late", "left-early"];

/**
 * WHETHER AN EXCUSAL STANDS for one person on one session: an approved
 * request to be excused covers it, their line is excused, or the register
 * keeps that it was (`excusalKept`) beside a mark that says they came. The
 * one test the marking route, both corrections of a finished register and
 * the register's read ask.
 */
export function excusalStandsFor(input: { approved: boolean; mark: AttendanceStatus | null | undefined; kept: boolean }): boolean {
  const came = input.mark === "present" || input.mark === "late" || input.mark === "left-early";
  return input.approved || input.mark === "excused" || (input.kept && came);
}

/** Which marks a cell offers its reader: an admin or the lead every one; anybody else as the excusal on it says. */
export function cellMarks(marksExcused: boolean, excusalStands: boolean): CellMarks {
  if (marksExcused) return "every";
  return excusalStands ? "excusal-stands" : "no-excused";
}

/** The cycle on one cell. */
export function markCycle(cell: CellMarks): (AttendanceStatus | null)[] {
  if (cell === "excusal-stands") return [...EXCUSAL_CYCLE];
  return MARK_CYCLE.filter((mark) => cell === "every" || mark !== "excused");
}

/**
 * The mark one tap on a cell sets. A mark the cycle skips (an excused line
 * where no excusal stands for the reader; absent or not marked where one
 * does) goes to the cycle's first mark.
 */
export function nextMark(current: AttendanceStatus | null, cell: CellMarks): AttendanceStatus | null {
  const cycle = markCycle(cell);
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}

/**
 * The marks a cell cycles through, as the register's caption lists them:
 * "present, late, left early, absent, excused and back to not marked" for
 * an admin or the lead; for anybody else the same without excused, and how
 * a cell where somebody is excused cycles.
 */
export function cycleWords(marksExcused: boolean): string {
  const words = (cell: CellMarks) =>
    markCycle(cell)
      .filter((mark): mark is AttendanceStatus => mark !== null)
      .map((mark) => ATTENDANCE_STATUS_LABEL[mark].toLowerCase());
  if (marksExcused) return `${words("every").join(", ")} and back to not marked`;
  const excusal = words("excusal-stands");
  return `${words("no-excused").join(", ")} and back to not marked; a cell where somebody is excused, through ${excusal.slice(0, -1).join(", ")} and ${excusal[excusal.length - 1]}`;
}

/** The routes' refusal of an excused the caller may not write. */
export const EXCUSED_BY_ADMIN_OR_LEAD = "Only an admin or the programme’s lead can mark somebody excused.";

/** The marking route's refusal of absent or not marked where an excusal stands. */
export const EXCUSAL_STANDS = "Only an admin or the programme’s lead can change an excused line to absent or not marked.";

/**
 * Where the register explains its marks, for a reader who cannot mark
 * excused: they record that an excused person came, and put the line back,
 * and nothing more.
 */
export const EXCUSED_WHO_CAN = "Only an admin or the programme’s lead can excuse somebody, or take an excusal away. People ask on their programme page.";
