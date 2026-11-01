import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { buildRunAttendance, groupSessions, readRunRecords, weeksOf } from "@/lib/courses/programmeAttendance";
import { countRunReportsByWeek, type ReportWeekCount } from "@/lib/courses/sessionReports/readers";
import { SOMETHING_ELSE } from "@/lib/firestore/courseSessionReports";
import { readProgrammeCheckIns } from "./checkIns/leadView";
import type { LeadCheckInWeek } from "./checkIns/model";
import { UNCLEAR_ELSE } from "./checkIns/template";
import { leadSurveyRows, type LeadSurveyRow } from "./leadTab";

/**
 * THE OVERVIEW A PROGRAMME'S SURVEYS TAB OPENS ON, made on
 * the server for its lead and admins: a card for each of the tab's views, how
 * useful the sessions were and how much of the reading people did, week by
 * week, what was unclear in a week with how many facilitators' reports named
 * each part beside it, who came, and the week's reports.
 *
 * Rules a maintainer keeps:
 *
 *  - ONE COUNT EACH. Every figure is the one its own page shows, through that
 *    page's reader: a survey's card is its row on its view (`leadSurveyRows`,
 *    its Results); the check-ins are the Check-ins view's weeks
 *    (`readProgrammeCheckIns`, read as the lead reads them, whoever is
 *    reading); who came is the Attendance tab's (`buildRunAttendance`, for
 *    this viewer, its own totals); the reports are counted from the same
 *    records the reports page lists (`countRunReportsByWeek`), and the
 *    sessions they cover from the Attendance tab's facts about each session
 *    (`groupSessions`: held, and started).
 *  - NAMELESS. What leaves is totals and the words of a week's parts: never a
 *    name, a uid, a row per person, a group or a group's own figure. A
 *    check-in's week shows only when it is whole, with its floors
 *    (`leadWeekOf`).
 *  - NOTHING THE RECORDS DO NOT HOLD YET. The share who ticked every reading,
 *    the team's ratings of written work, a summary of what reports say and
 *    anything booked to explain a week again are not drawn, and nothing
 *    stands in for them.
 *
 * Who may ask is the caller's business: the page holds the caller to the
 * programme's lead or an admin first (`loadProgrammeRun`).
 */

/** One week of the check-ins, as the two charts draw it: each figure only once the week shows. */
export type OverviewWeek = {
  weekNumber: number;
  /** How many answered, once the week shows. */
  answered: number | null;
  /** The average of how useful the session was, 1 to 5. */
  useful: number | null;
  /** Of everybody who answered the reading question, how many said most or all, and of how many. */
  reading: { most: number; of: number } | null;
};

/** One part named unclear in the chosen week: by the check-ins (with their share of the week's answers) and by the reports. `id` is the part's, for the list's keys. */
export type OverviewUnclearRow = { id: string; label: string; checkIns: number; reports: number };

export type SurveysOverview = {
  /** The stage's survey once it has gone out, as its view's row counts it, or null. */
  before: LeadSurveyRow | null;
  end: LeadSurveyRow | null;
  /** The latest follow-up that has gone out. */
  followUp: LeadSurveyRow | null;
  /** The day of the run's last session, "Wed 9 Dec", for the End card before its survey goes out. */
  lastSession: string | null;
  /** The check-ins' answers over the weeks that are whole and had one, and how many weeks. */
  checkIns: { answers: number; weeks: number };
  /** The sessions held so far with a report on them, and how many sessions were held; null while no run is named. */
  reported: { sessions: number; of: number } | null;
  /** Every taught week of the run, for the charts; empty while no run is named. */
  weeks: OverviewWeek[];
  /** What was unclear in the chosen week; null while no week shows. */
  unclear: { weeks: number[]; chosen: number; answered: number; reports: number; rows: OverviewUnclearRow[] } | null;
  /** Who came, week by week, for the weeks anybody has been marked; null while no run is named. */
  came: { weekNumber: number; came: number; of: number; soFar: boolean }[] | null;
  /** The reports on the chosen week, or the latest week with any while no week shows. */
  reports: { weekNumber: number; reports: number; how: number | null } | null;
  /** Whether the programme names a run that is on the site: check-ins, reports and registers are the run's. */
  run: boolean;
};

/** A week of the Check-ins view, as the charts draw it. */
function chartWeek(week: LeadCheckInWeek): OverviewWeek {
  if (week.state !== "shown") return { weekNumber: week.weekNumber, answered: null, useful: null, reading: null };
  return { weekNumber: week.weekNumber, answered: week.answered, useful: week.totals.useful, reading: week.totals.reading };
}

/**
 * What was unclear in one week: each part the check-ins named, with how many
 * named it, and beside it how many of the week's reports named it; a part only
 * the reports named is a row too. "Something else" is one row for both.
 */
function unclearRows(week: Extract<LeadCheckInWeek, { state: "shown" }>, reports: ReportWeekCount | null): OverviewUnclearRow[] {
  const rows = new Map<string, OverviewUnclearRow & { first: number }>();
  for (const part of week.totals.unclear) rows.set(part.id, { id: part.id, label: part.label, checkIns: part.count, reports: 0, first: rows.size });
  for (const part of reports?.unclear ?? []) {
    const id = part.id === SOMETHING_ELSE ? UNCLEAR_ELSE : part.id;
    const row = rows.get(id);
    if (row) row.reports += part.count;
    else rows.set(id, { id, label: part.title, checkIns: 0, reports: part.count, first: rows.size });
  }
  return [...rows.values()]
    .sort((a, b) => b.checkIns - a.checkIns || b.reports - a.reports || a.first - b.first)
    .map(({ id, label, checkIns, reports: named }) => ({ id, label, checkIns, reports: named }));
}

export async function leadSurveysOverview(
  db: Firestore,
  programme: { roundId: string; programmeId: string; runId: string | null; viewer: "admin" | "lead" },
  now: Date,
  /** The week asked for (`?week=`), or null for the latest that shows. */
  askedWeek: number | null,
): Promise<SurveysOverview> {
  const [rows, records] = await Promise.all([
    leadSurveyRows(db, programme, now),
    programme.runId ? readRunRecords(db, programme.runId) : Promise.resolve(null),
  ]);
  const before = rows.find((row) => row.kind === "before") ?? null;
  const end = rows.find((row) => row.kind === "after") ?? null;
  const followUp = rows.find((row) => row.kind === "followUp12") ?? rows.find((row) => row.kind === "followUp6") ?? null;
  if (!records) {
    return {
      before,
      end,
      followUp,
      lastSession: null,
      checkIns: { answers: 0, weeks: 0 },
      reported: null,
      weeks: [],
      unclear: null,
      came: null,
      reports: null,
      run: false,
    };
  }

  const weekNumbers = weeksOf(records);
  const [checkIns, reportWeeks] = await Promise.all([
    // As the lead reads them, whoever is reading: the Overview names no group.
    readProgrammeCheckIns(db, {
      roundId: programme.roundId,
      programmeId: programme.programmeId,
      run: records.run,
      groups: records.groups,
      weeks: weekNumbers,
      viewer: "lead",
      now,
    }),
    countRunReportsByWeek(db, records.run.id),
  ]);

  // The check-ins' card: every whole week that had one.
  const counted = checkIns.weeks.filter(
    (week): week is Extract<LeadCheckInWeek, { state: "shown" | "too-few" }> => week.state === "shown" || week.state === "too-few",
  );
  const answers = counted.reduce((sum, week) => sum + week.answered, 0);

  // The reports' card: the sessions held so far (the Attendance tab's facts),
  // and those of them a report is about.
  const reportedBy = new Map(reportWeeks.map((week) => [week.weekNumber, new Set(week.groupIds)] as const));
  let held = 0;
  let reported = 0;
  for (const group of records.groups) {
    for (const [weekNumber, facts] of groupSessions(records, group, now)) {
      if (!facts.held || !facts.started) continue;
      held += 1;
      if (reportedBy.get(weekNumber)?.has(group.id)) reported += 1;
    }
  }

  // What was unclear, for the week asked for when it shows, else the latest that shows.
  const shown = checkIns.weeks.filter((week): week is Extract<LeadCheckInWeek, { state: "shown" }> => week.state === "shown");
  const chosen = shown.find((week) => week.weekNumber === askedWeek) ?? shown[shown.length - 1] ?? null;
  const reportsOf = (weekNumber: number) => reportWeeks.find((week) => week.weekNumber === weekNumber) ?? null;
  const chosenReports = chosen ? reportsOf(chosen.weekNumber) : null;
  const latestReported = reportWeeks[reportWeeks.length - 1] ?? null;
  const reportsWeek = chosen ? (chosenReports ?? { weekNumber: chosen.weekNumber, reports: 0, how: null }) : latestReported;

  const attendance = buildRunAttendance(records, { isAdmin: programme.viewer === "admin" }, now);
  return {
    before,
    end,
    followUp,
    lastSession: runEndOf(records.run, records.groups, now).lastDay,
    checkIns: { answers, weeks: counted.length },
    reported: { sessions: reported, of: held },
    weeks: checkIns.weeks.map(chartWeek),
    unclear: chosen
      ? {
          weeks: shown.map((week) => week.weekNumber),
          chosen: chosen.weekNumber,
          answered: chosen.answered,
          reports: chosenReports?.reports ?? 0,
          rows: unclearRows(chosen, chosenReports),
        }
      : null,
    came: attendance.totals
      .filter((total) => total.percent !== null)
      .map((total) => ({ weekNumber: total.weekNumber, came: total.came, of: total.of, soFar: total.soFar })),
    reports: reportsWeek ? { weekNumber: reportsWeek.weekNumber, reports: reportsWeek.reports, how: reportsWeek.how } : null,
    run: true,
  };
}
