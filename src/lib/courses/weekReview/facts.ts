import { REVIEW_WORDS } from "./words";

/**
 * MIGHT NEED A HAND, FROM THE SITE'S OWN RECORDS: what the register, the
 * person's week and this week's facilitators' reports already say, worked
 * out here and NEVER SENT anywhere (privacy v15 lets admins ask Claude about
 * coursework, survey answers and session reports, and a register is none of
 * them). Each line says where it came from, beside Claude's picks, so an
 * admin can tell a record from a reading.
 *
 *  - THE REGISTER: absent at the last `ABSENT_IN_A_ROW` sessions or more in a
 *    row without saying (the Attendance tab's own count; excused is not
 *    absent).
 *  - THEIR WEEK: not started when their group met; or, for a week that asks
 *    for writing, locked before they submitted it.
 *  - THIS WEEK'S REPORTS: named under "might need a hand" (with the word
 *    written about them) or "seemed not to have done the readings".
 *
 * Pure: the tests hand it each case.
 */

export type FactSource = "register" | "week" | "report";

export type FactLine = { source: FactSource; text: string };

/** Where one person's week stands, as `loadRunWeekStates` and the week's facts read it. */
export type PersonWeek = {
  /** Anything of theirs on the week: a tick, a word, a pack. */
  started: boolean;
  state: "open" | "submitted" | "locked" | "reopened";
  /** The week asks for something written, so it has a Submit. */
  writes: boolean;
  /** Their group's session of the week has started. */
  groupMet: boolean;
};

/** What this week's reports pick, by account. */
export type ReportPicks = { needsHand: ReadonlyArray<{ uid: string; note: string }>; notRead: readonly string[] };

export function handFacts(input: {
  weekNumber: number;
  /** The people holding a place who are reviewed: never a facilitator. */
  fellows: readonly string[];
  /** How many sessions in a row each was last absent without saying; 0 for fewer than the Attendance tab's rule. */
  absentInARow: ReadonlyMap<string, number>;
  weeks: ReadonlyMap<string, PersonWeek>;
  reports: readonly ReportPicks[];
}): Map<string, FactLine[]> {
  const out = new Map<string, FactLine[]>();
  const add = (uid: string, line: FactLine) => {
    const lines = out.get(uid) ?? [];
    if (!lines.some((other) => other.source === line.source && other.text === line.text)) lines.push(line);
    out.set(uid, lines);
  };
  const fellows = new Set(input.fellows);
  for (const uid of input.fellows) {
    const absent = input.absentInARow.get(uid) ?? 0;
    if (absent > 0) add(uid, { source: "register", text: REVIEW_WORDS.absentInARow(absent) });
    const week = input.weeks.get(uid);
    if (week?.groupMet && !week.started) add(uid, { source: "week", text: REVIEW_WORDS.notStarted(input.weekNumber) });
    else if (week?.writes && week.started && week.state === "locked") add(uid, { source: "week", text: REVIEW_WORDS.notSubmitted(input.weekNumber) });
  }
  for (const report of input.reports) {
    for (const pick of report.needsHand) if (fellows.has(pick.uid)) add(pick.uid, { source: "report", text: REVIEW_WORDS.reportHand(pick.note) });
    for (const uid of report.notRead) if (fellows.has(uid)) add(uid, { source: "report", text: REVIEW_WORDS.reportNotRead });
  }
  return out;
}
