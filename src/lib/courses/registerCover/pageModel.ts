import { cameBy, type AttendanceStatus } from "@/lib/firestore/courseAttendance";

/**
 * COVERING A REGISTER, AS THE PAGES ASK IT: which weeks of a group offer the
 * ways to take a register in a facilitator's place, which week the group's
 * page tells its admins and lead about first, and what the summary before
 * Finish lists.
 *
 * PURE. No reads and no clock: the group's page and the register hand in
 * what the server read (`loadGroupPage`, the register's GET), and the routes
 * decide again on every press (`POST .../attendance/cover`, the change
 * route's two cancels). A page offers nothing a route would refuse.
 */

/** What the group's page knows about one week's register. */
export type WeekRegisterFacts = {
  weekNumber: number;
  /** The session's start has passed. */
  started: boolean;
  /** The session was called off through a change. */
  cancelled: boolean;
  /** The session has a day to give it until. */
  dated: boolean;
  /** The register is finished. */
  finished: boolean;
  /** The register says the session did not happen (the old switch). */
  heldFalse: boolean;
  /** One of the group's facilitators has started it: saved a mark, or set a line. */
  facilitatorStarted: boolean;
  /** Somebody took it in a facilitator's place, or was given it. */
  covered: boolean;
};

/** The ways "Take the register" offers on one week. */
export type CoverChoices = {
  /** "Take the register" opens the ways below. */
  offered: boolean;
  /** "I'm covering it" (on the notice, "Take the register in Josh's place"). */
  covering: boolean;
  /** "Someone else is covering": one session given to somebody. */
  someoneElse: boolean;
  /** "It didn't happen": the two cancels, once the session has started. */
  didNotHappen: boolean;
  /**
   * One of the group's facilitators has started it: there is nobody to cover
   * for, so "Take the register" opens the register itself, to help.
   */
  helpOnly: boolean;
};

const NONE: CoverChoices = { offered: false, covering: false, someoneElse: false, didNotHappen: false, helpOnly: false };

/**
 * THE WAYS A WEEK OFFERS, past weeks included. None once its register is
 * finished, for a session called off or saying it did not happen, or for one
 * with no day yet. Once a facilitator has started the register, only the
 * register itself (the cover route refuses a register a facilitator
 * started). Before the session starts, covering and giving it, and not "It
 * didn't happen": a session still to come is cancelled with Change this week.
 */
export function coverChoicesOf(week: WeekRegisterFacts): CoverChoices {
  if (week.finished || week.cancelled || week.heldFalse || !week.dated) return NONE;
  if (week.facilitatorStarted) return { ...NONE, helpOnly: true };
  return { offered: true, covering: true, someoneElse: true, didNotHappen: week.started, helpOnly: false };
}

/**
 * THE WEEK THE GROUP'S PAGE TELLS ITS ADMINS AND LEAD ABOUT FIRST ("Josh
 * hasn't started week 2's register"): the latest week whose session has
 * started and whose register nobody has started, finished or taken in
 * anybody's place. Null when there is none.
 */
export function noticeWeekOf(weeks: readonly WeekRegisterFacts[]): number | null {
  let found: number | null = null;
  for (const week of weeks) {
    if (!week.started || week.covered) continue;
    const choices = coverChoicesOf(week);
    if (!choices.offered) continue;
    if (found === null || week.weekNumber > found) found = week.weekNumber;
  }
  return found;
}

// ---------------------------------------------------------------------------
// The summary before Finish
// ---------------------------------------------------------------------------

/** One row of the summary: "In the room", "3: Aisha, Sofia, Leo". */
export type FinishSummaryRow = {
  key: "room" | "online" | "absent" | "excused";
  label: string;
  count: number;
  names: string[];
};

/** Somebody on the register, as the summary needs them. */
export type SummaryMember = { uid: string; displayName: string; joinedWeekNumber: number };

const SUMMARY_LABEL: Record<FinishSummaryRow["key"], string> = {
  room: "In the room",
  online: "Online",
  absent: "Absent",
  excused: "Excused",
};

/**
 * WHAT A SESSION'S REGISTER SAYS, AS FINISH SUMMARISES IT: who came in the
 * room (arrived late and left early included), who came online, who is
 * absent and who is excused, each with its count and names, in the rows'
 * order. A row nobody is in is left out. Somebody not marked is in no row:
 * the confirm says on its own line that finishing counts them absent.
 */
export function finishSummary(
  members: readonly SummaryMember[],
  weekNumber: number,
  records: Readonly<Record<string, AttendanceStatus>>,
  online: Readonly<Record<string, boolean>>,
): FinishSummaryRow[] {
  const rows: Record<FinishSummaryRow["key"], string[]> = { room: [], online: [], absent: [], excused: [] };
  for (const member of members) {
    if (weekNumber < member.joinedWeekNumber) continue;
    const mark = records[member.uid];
    if (!mark) continue;
    if (cameBy(mark)) rows[online[member.uid] === true ? "online" : "room"].push(member.displayName);
    else if (mark === "absent") rows.absent.push(member.displayName);
    else if (mark === "excused") rows.excused.push(member.displayName);
  }
  return (Object.keys(rows) as FinishSummaryRow["key"][])
    .filter((key) => rows[key].length > 0)
    .map((key) => ({ key, label: SUMMARY_LABEL[key], count: rows[key].length, names: rows[key] }));
}

/** "4: Hannah, Omar, Chloe, Noah", or "1: Jess Moore": first names when there are several, the whole name for one. */
export function summaryRowWords(row: Pick<FinishSummaryRow, "count" | "names">): string {
  const names = row.names.length === 1 ? row.names : row.names.map(firstWordOf);
  return `${row.count}: ${names.join(", ")}`;
}

/** The first word of a name: "Priya" from "Priya Shah (Pri)". */
export function firstWordOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
