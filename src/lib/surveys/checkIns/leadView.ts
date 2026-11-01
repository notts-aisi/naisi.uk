import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { CheckInSurveyDoc, SurveyAnswerDoc } from "@/lib/firestore/surveys";
import { answersOf, checkInsOfRun, isOpen, sentCountOf } from "../repo";
import { leadWeekOf, weekHasBegun, type LeadCheckInWeek } from "./model";
import { frozenWeeksOf, marksOf, ofProgramme, sessionsOf, weekNumbersOf } from "./weeks";

/**
 * A PROGRAMME'S CHECK-INS ON ITS SURVEYS TAB, read on the server for its lead
 * and admins: the Overview's figures and the Check-ins view.
 *
 *  - THE LEAD READS WEEKS, NEVER GROUPS. A week's check-ins are fixed when it
 *    first shows: the scheduler's job records which check-ins a week has the
 *    first time it is whole (`weekIsWhole`: every group's check-in that week
 *    has closed and none can still be opened), and a week is read only once
 *    it has that record (`./weeks.ts`), and then only the check-ins it names,
 *    every group's answers together, with the floors of `leadWeekOf`: totals
 *    from three answers, comments from five, in the order of their words. A
 *    week not fixed yet is read not at all: not even how many have answered
 *    it so far. A check-in opened for a week after it was fixed is never read
 *    for the lead, so the week stays as it first showed.
 *  - AN ADMIN ALSO READS EACH GROUP'S CHECK-IN, a row each, with how many
 *    answered of how many it reached, so the page can lead to the admins' own
 *    pages for it, where one person's answers open only once the opening is
 *    recorded; a row whose check-in opened after its week was fixed says it
 *    is not in the week. Those rows are made only when the caller says the
 *    reader is an admin, and never travel with the lead's weeks.
 *
 * Which check-ins: the run's (`checkInsOfRun`, one equality on `runId`) that
 * were opened for this programme (`ofProgramme`), so a run named afterwards by
 * another programme never shows its lead what the box at the top told people
 * another programme's lead would see. Answers are read through `answersOf`,
 * the reader every Results and the register's card count with, and only for
 * the check-ins the reader may see. Who may ask is the page's business: it
 * holds the caller to the programme's lead or an admin first
 * (`loadProgrammeRun`).
 */

/** One group's check-in in a week, for an admin. */
export type AdminCheckInRow = {
  id: string;
  /** The group's name as it was when the check-in opened. */
  groupName: string;
  /** When its session started, or null when it cannot be said. */
  startsAt: Date | null;
  open: boolean;
  /** Its answers and the people it reached, as its Results count them. */
  answered: number;
  of: number;
  /** True when its week's check-ins were fixed before it opened: the week the lead reads leaves it out. */
  openedAfterWeek: boolean;
};

export type ProgrammeCheckIns = {
  /** Every taught week of the run, in order, as the lead reads it. */
  weeks: LeadCheckInWeek[];
  /** The weeks that have begun (a session of it has started, it has a check-in, or it has shown), in order. */
  begun: number[];
  /** For an admin alone: each begun week's check-ins, a row per group's, by when each session started. Null for the lead. */
  groups: Map<number, AdminCheckInRow[]> | null;
};

export async function readProgrammeCheckIns(
  db: Firestore,
  input: {
    roundId: string;
    programmeId: string;
    run: CourseRunDoc;
    /** The run's groups that still meet. */
    groups: readonly CourseGroupDoc[];
    /** The run's taught weeks, as the Attendance tab's columns. */
    weeks: readonly number[];
    viewer: "admin" | "lead";
    now: Date;
  },
): Promise<ProgrammeCheckIns> {
  const { roundId, programmeId, run, groups, now } = input;
  const admin = input.viewer === "admin";
  const [ofRun, frozen] = await Promise.all([checkInsOfRun(db, run.id), frozenWeeksOf(db, run.id)]);
  const checkIns = ofProgramme(ofRun, roundId, programmeId);
  const sessions = sessionsOf(run, groups);
  const marks = marksOf(checkIns, now);
  const weekNumbers = weekNumbersOf(input.weeks, checkIns);
  /** Whether a check-in is one its week was fixed with: the only check-ins the lead's week counts. */
  const inItsWeek = (survey: CheckInSurveyDoc) => frozen.get(survey.audience.weekNumber)?.has(survey.id) === true;

  // Answers only where the reader may see them: for the lead, the check-ins
  // each week was fixed with; for an admin, every check-in.
  const read = checkIns.filter((survey) => admin || inItsWeek(survey));
  const answers = new Map<string, SurveyAnswerDoc[]>(
    await Promise.all(read.map(async (survey) => [survey.id, await answersOf(db, survey)] as const)),
  );

  const weeks = weekNumbers.map((weekNumber) => {
    const fixed = frozen.has(weekNumber);
    const sets = fixed
      ? checkIns
          .filter((survey) => survey.audience.weekNumber === weekNumber && inItsWeek(survey))
          .map((survey) => ({ items: survey.items, answers: answers.get(survey.id) ?? [], of: sentCountOf(survey) }))
      : [];
    return leadWeekOf(weekNumber, fixed, sets);
  });
  // A week that has shown stays drawn, whatever has happened to its sessions since.
  const begun = weekNumbers.filter((week) => frozen.has(week) || weekHasBegun(week, sessions, marks, now));

  let rows: Map<number, AdminCheckInRow[]> | null = null;
  if (admin) {
    rows = new Map();
    for (const survey of checkIns) {
      const list = rows.get(survey.audience.weekNumber) ?? [];
      list.push({
        id: survey.id,
        groupName: survey.checkIn.groupName || groups.find((group) => group.id === survey.audience.groupId)?.name || "Untitled group",
        startsAt: survey.checkIn.startsAt,
        open: isOpen(survey, now),
        answered: (answers.get(survey.id) ?? []).length,
        of: sentCountOf(survey),
        openedAfterWeek: frozen.has(survey.audience.weekNumber) && !inItsWeek(survey),
      });
      rows.set(survey.audience.weekNumber, list);
    }
  }
  return { weeks, begun, groups: rows };
}
