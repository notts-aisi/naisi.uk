import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { CheckInSurveyDoc, SurveyAnswerDoc } from "@/lib/firestore/surveys";
import { answersOf, checkInsOfRun, isOpen, sentCountOf } from "../repo";
import { leadWeekOf, weekHasBegun, weekIsWhole, type LeadCheckInWeek, type WeekCheckIn, type WeekSession } from "./model";

/**
 * A PROGRAMME'S CHECK-INS ON ITS SURVEYS TAB, read on the server for its lead
 * and admins: the Overview's figures and the Check-ins view.
 *
 *  - THE LEAD READS WEEKS, NEVER GROUPS. A week is read only once it is whole
 *    (`weekIsWhole`: every group's check-in that week has closed and none can
 *    still be opened), and then every group's answers together, with the
 *    floors of `leadWeekOf`: totals from three answers, comments from five,
 *    in the order of their words. A week that is not whole is read not at
 *    all: not even how many have answered it so far.
 *  - AN ADMIN ALSO READS EACH GROUP'S CHECK-IN, a row each, with how many
 *    answered of how many it reached, so the page can lead to the admins' own
 *    pages for it, where one person's answers open only once the opening is
 *    recorded. Those rows are made only when the caller says the reader is an
 *    admin, and never travel with the lead's weeks.
 *
 * Which check-ins: the run's (`checkInsOfRun`, one equality on `runId`) that
 * were opened for this programme, so a run named afterwards by another
 * programme never shows its lead what the box at the top told people another
 * programme's lead would see. Answers are read through `answersOf`, the
 * reader every Results and the register's card count with, and only for the
 * weeks the reader may see. Who may ask is the page's business: it holds the
 * caller to the programme's lead or an admin first (`loadProgrammeRun`).
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
};

export type ProgrammeCheckIns = {
  /** Every taught week of the run, in order, as the lead reads it. */
  weeks: LeadCheckInWeek[];
  /** The weeks that have begun (a session of it has started, or it has a check-in), in order. */
  begun: number[];
  /** For an admin alone: each begun week's check-ins, a row per group's, by when each session started. Null for the lead. */
  groups: Map<number, AdminCheckInRow[]> | null;
};

/** Every session of the run's groups that still meet, as a week waits on it. */
function sessionsOf(run: CourseRunDoc, groups: readonly CourseGroupDoc[]): WeekSession[] {
  return groups.flatMap((group) =>
    resolveSessions(run, group).map((session): WeekSession => {
      const { startsAt, endsAt } = sessionInstants(session);
      return { weekNumber: session.weekNumber, cancelled: session.cancelled, dateKey: session.dateKey, startsAt, endsAt };
    }),
  );
}

/** By when each session started, then by id: the order a week's check-ins are counted and listed in. */
function bySession(a: CheckInSurveyDoc, b: CheckInSurveyDoc): number {
  return (a.checkIn.startsAt?.getTime() ?? 0) - (b.checkIn.startsAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
}

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
  const checkIns = (await checkInsOfRun(db, run.id))
    .filter((survey) => survey.audience.roundId === roundId && survey.audience.programmeId === programmeId)
    .sort(bySession);
  const sessions = sessionsOf(run, groups);
  const marks: WeekCheckIn[] = checkIns.map((survey) => ({ weekNumber: survey.audience.weekNumber, open: isOpen(survey, now) }));
  const weekNumbers = [...new Set([...input.weeks, ...checkIns.map((survey) => survey.audience.weekNumber)])].sort((a, b) => a - b);
  const whole = new Map(weekNumbers.map((week) => [week, weekIsWhole(week, sessions, marks, now)] as const));

  // Answers only where the reader may see them: a whole week for the lead,
  // every check-in for an admin.
  const read = checkIns.filter((survey) => admin || whole.get(survey.audience.weekNumber) === true);
  const answers = new Map<string, SurveyAnswerDoc[]>(
    await Promise.all(read.map(async (survey) => [survey.id, await answersOf(db, survey)] as const)),
  );

  const weeks = weekNumbers.map((weekNumber) => {
    const isWhole = whole.get(weekNumber) === true;
    const sets = isWhole
      ? checkIns
          .filter((survey) => survey.audience.weekNumber === weekNumber)
          .map((survey) => ({ items: survey.items, answers: answers.get(survey.id) ?? [], of: sentCountOf(survey) }))
      : [];
    return leadWeekOf(weekNumber, isWhole, sets);
  });
  const begun = weekNumbers.filter((week) => weekHasBegun(week, sessions, marks, now));

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
      });
      rows.set(survey.audience.weekNumber, list);
    }
  }
  return { weeks, begun, groups: rows };
}
