import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { sessionInstants, resolveSessions } from "@/lib/courses/sessions";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  COURSE_SESSION_REPORTS_COLLECTION,
  SOMETHING_ELSE,
  normalizeSessionReport,
  type CourseSessionReportDoc,
} from "@/lib/firestore/courseSessionReports";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { reportLinesView, reportsAbout, type BesideScope, type ReportLinesView } from "./beside";
import { RUN_REPORTS_WORDS, REPORT_WORDS } from "./words";

/**
 * A RUN'S SESSION REPORTS, read on the server for the programme's lead and
 * admins: the reports page under the programme's Surveys tab, and the counts
 * on the tab's Overview that lead there, which name nobody. And, beside a
 * written answer on its review page, one person's lines in one week's
 * reports (`readReportLinesAbout`), for whoever that page lets review the
 * answer, each as `besideScopeOf` says.
 *
 * Who may read them is decided by the page that calls this, before it does
 * (`loadProgrammeRun`: the lead of the programme that names the run, or an
 * admin; for one person's lines, the review page's own gate and then
 * `besideScopeOf`). Nothing here asks who is reading, so nothing here may be
 * called before that decision, and no route hands these rows to a browser.
 *
 * Each report comes back whole, with its group, its writer's name and the
 * names of the people it picks, worked out from their accounts when it is
 * read, by the names rule for the reader (`nameForViewer`: the committee and
 * admins see "Priya Shah (Pri)", a lead or facilitator who is not on it the
 * name people go by), as the lead's tabs name people. One equality on one field per
 * read, sorted in memory, so no read needs a declared index. A read is
 * bounded by what a run's facilitators write in a term: one report per
 * facilitator per session.
 */

/** One person a report picks, with the words written about them. */
export type ReportEntryView = { name: string; note: string };

export type RunReportView = {
  id: string;
  groupId: string;
  groupName: string;
  /** The writer's name as the reader is shown it, or the words for a writer whose account was deleted. */
  writerName: string;
  weekNumber: number;
  occurrence: number;
  /** The session's start, for its day, or null when it cannot be dated now. */
  sessionAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date | null;
  how: number | null;
  wentWell: string;
  didnt: string;
  /** The titles of the parts it ticked, "Something else" last. */
  unclear: string[];
  engaged: ReportEntryView[];
  notRead: string[];
  needsHand: ReportEntryView[];
  forLead: string;
};

/** A week of the run, newest first, with its reports. */
export type RunReportWeek = { weekNumber: number; reports: RunReportView[] };

/** Every report on one run, normalised and held to the run. */
async function reportsOfRun(db: Firestore, runId: string): Promise<CourseSessionReportDoc[]> {
  const snap = await db.collection(COURSE_SESSION_REPORTS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeSessionReport(doc.id, doc.data() ?? {}))
    .filter((report): report is CourseSessionReportDoc => report !== null && report.runId === runId);
}

/**
 * One week of a run's reports, counted for the Surveys tab's Overview, which
 * names nobody: how many there are, how the sessions went on average, the
 * parts they named unclear and the groups with one. Never a word a report
 * says, who wrote it, or whom it picks.
 */
export type ReportWeekCount = {
  weekNumber: number;
  /** How many reports: the reports page lists the same number under the week. */
  reports: number;
  /** The average of "How did the session go?", 1 to 5, over the reports that say; null when none does. */
  how: number | null;
  /**
   * Each part named unclear, by the part's id (a part keeps its id in every
   * group's copy of the week), with its title as the first report to name it
   * kept it and how many of the week's reports named it; "Something else" by
   * `SOMETHING_ELSE`. Most named first.
   */
  unclear: { id: string; title: string; count: number }[];
  /** The groups with a report on one of the week's sessions, by id. */
  groupIds: string[];
};

/**
 * THE RUN'S REPORTS, COUNTED BY WEEK, oldest week first: the same reports the
 * reports page lists (`reportsOfRun`), so a week's count here is the number of
 * reports under it there. For the Surveys tab's Overview, after its gate.
 */
export async function countRunReportsByWeek(db: Firestore, runId: string): Promise<ReportWeekCount[]> {
  const reports = (await reportsOfRun(db, runId)).sort((a, b) => a.id.localeCompare(b.id));
  const weeks = new Map<number, CourseSessionReportDoc[]>();
  for (const report of reports) weeks.set(report.weekNumber, [...(weeks.get(report.weekNumber) ?? []), report]);
  return [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, list]) => {
      const hows = list.flatMap((report) => (report.answers.how === null ? [] : [report.answers.how]));
      const named = new Map<string, { title: string; count: number; first: number }>();
      for (const report of list) {
        const titles = new Map(report.parts.map((part) => [part.id, part.title.trim()]));
        for (const id of new Set(report.answers.unclear)) {
          const title = id === SOMETHING_ELSE ? REPORT_WORDS.somethingElse : titles.get(id) || RUN_REPORTS_WORDS.partGone;
          const kept = named.get(id);
          if (kept) kept.count += 1;
          else named.set(id, { title, count: 1, first: named.size });
        }
      }
      return {
        weekNumber,
        reports: list.length,
        how: hows.length > 0 ? hows.reduce((sum, value) => sum + value, 0) / hows.length : null,
        unclear: [...named.entries()]
          .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
          .map(([id, { title, count }]) => ({ id, title, count })),
        groupIds: [...new Set(list.map((report) => report.groupId))].sort(),
      };
    });
}

/** The titles a report's ticks name, as the week read when it was sent. */
function unclearTitles(report: CourseSessionReportDoc): string[] {
  const titles = new Map(report.parts.map((part) => [part.id, part.title.trim() || RUN_REPORTS_WORDS.partGone]));
  const out = report.answers.unclear.filter((id) => id !== SOMETHING_ELSE).map((id) => titles.get(id) ?? RUN_REPORTS_WORDS.partGone);
  if (report.answers.unclear.includes(SOMETHING_ELSE)) out.push(REPORT_WORDS.somethingElse);
  return out;
}

/**
 * Reports as a page shows them to `viewer`: each with its group's name, its
 * writer's name and the names of the people it picks, from their accounts
 * now, by the names rule, and the day its session fell on. `groups` are the
 * run's, by id.
 */
async function viewsOf(
  db: Firestore,
  run: CourseRunDoc,
  groups: ReadonlyMap<string, CourseGroupDoc>,
  reports: readonly CourseSessionReportDoc[],
  viewer: NameViewer,
): Promise<RunReportView[]> {
  const uids = new Set<string>();
  for (const report of reports) {
    if (report.writerUid) uids.add(report.writerUid);
    for (const uid of report.aboutUids) uids.add(uid);
  }
  const addressable = [...uids].filter((uid) => uid && !uid.includes("/"));
  const accounts = new Map<string, Record<string, unknown>>();
  if (addressable.length > 0) {
    const snaps = await db.getAll(...addressable.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  const nameOf = (uid: string) => nameForViewer(viewer, accountNamesOf(accounts.get(uid) ?? {}), "NAISI member");

  // Each group's sessions, for the day each report's session fell on.
  const sessionsByGroup = new Map<string, ReturnType<typeof resolveSessions>>();
  const sessionAt = (report: CourseSessionReportDoc): Date | null => {
    const group = groups.get(report.groupId);
    if (!group) return null;
    if (!sessionsByGroup.has(group.id)) sessionsByGroup.set(group.id, resolveSessions(run, group));
    const session = sessionsByGroup.get(group.id)?.find((each) => each.sessionKey === report.sessionKey);
    return session ? sessionInstants(session).startsAt : null;
  };

  return reports.map((report) => ({
    id: report.id,
    groupId: report.groupId,
    groupName: groups.get(report.groupId)?.name.trim() || "Untitled group",
    writerName: report.writerUid ? nameOf(report.writerUid) : RUN_REPORTS_WORDS.writerGone,
    weekNumber: report.weekNumber,
    occurrence: report.occurrence,
    sessionAt: sessionAt(report),
    sentAt: report.sentAt,
    updatedAt: report.updatedAt,
    how: report.answers.how,
    wentWell: report.answers.wentWell,
    didnt: report.answers.didnt,
    unclear: unclearTitles(report),
    engaged: report.answers.engaged.map((pick) => ({ name: nameOf(pick.uid), note: pick.note })),
    notRead: report.answers.notRead.map(nameOf),
    needsHand: report.answers.needsHand.map((pick) => ({ name: nameOf(pick.uid), note: pick.note })),
    forLead: report.answers.forLead,
  }));
}

/**
 * Every report on the run, by week, newest week first; in a week, by group in
 * meeting order, then by writer. For a reader the caller has already let
 * read them, named as that reader is shown people (`viewer`).
 */
export async function readRunSessionReports(db: Firestore, runId: string, viewer: NameViewer): Promise<RunReportWeek[]> {
  const [reports, groupSnap, runSnap] = await Promise.all([
    reportsOfRun(db, runId),
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseRuns").doc(runId).get(),
  ]);
  if (reports.length === 0 || !runSnap.exists) return [];
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groups = new Map<string, CourseGroupDoc>(
    groupSnap.docs.map((doc) => [doc.id, normalizeCourseGroup(doc.id, doc.data() ?? {})] as const),
  );
  const views = await viewsOf(db, run, groups, reports, viewer);

  const byWeek = new Map<number, RunReportView[]>();
  for (const view of views) {
    const list = byWeek.get(view.weekNumber) ?? [];
    list.push(view);
    byWeek.set(view.weekNumber, list);
  }
  // In meeting order, as the lead's tabs order groups; a group no longer on
  // the run after the ones that are, by name.
  const byMeeting = (a: RunReportView, b: RunReportView): number => {
    const first = groups.get(a.groupId);
    const second = groups.get(b.groupId);
    if (first && second) return compareGroupsByMeeting(first, second);
    if (first || second) return first ? -1 : 1;
    return a.groupName.localeCompare(b.groupName);
  };
  return [...byWeek.entries()]
    .sort(([a], [b]) => b - a)
    .map(([weekNumber, list]) => ({
      weekNumber,
      reports: list.sort(
        (a, b) =>
          a.occurrence - b.occurrence ||
          byMeeting(a, b) ||
          a.writerName.localeCompare(b.writerName) ||
          a.id.localeCompare(b.id),
      ),
    }));
}

/**
 * One writer's own report as a page shows it, for the writer (`viewer`),
 * once its session's report has closed. The caller has already read it as
 * theirs.
 */
export async function ownReportView(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  report: CourseSessionReportDoc,
  viewer: NameViewer,
): Promise<RunReportView> {
  const [view] = await viewsOf(db, run, new Map([[group.id, group]]), [report], viewer);
  return view;
}

/**
 * ONE PERSON'S LINES IN ONE WEEK'S REPORTS, for the review page beside their
 * written answer: what each report says about them (engaged well and why,
 * seemed not to have done the readings, might need a hand and the word about
 * them), and nothing else of a report. Called only by the review page's
 * loader, once its gate has let the reader review the answer and
 * `besideScopeOf` has said whose reports' lines they see.
 *
 * One clause on one field per read, so neither needs a declared index: for
 * the programme's lead and admins, every report that picks the person
 * (`aboutUids` array-contains); for a facilitator, only the reports they
 * wrote (`writerUid` equality), so a co-facilitator's report is never read
 * for them at all. Held to the run and the week in memory, and, for a
 * facilitator, to their own reports again (`reportsAbout`); only the
 * person's lines leave (`reportLinesView`). A writer is named by the first
 * word of the name they go by, as the page's other cards sign theirs; the
 * reader's own reports are named by nobody.
 */
export async function readReportLinesAbout(
  db: Firestore,
  input: { runId: string; uid: string; weekNumber: number; scope: BesideScope },
): Promise<ReportLinesView> {
  const { uid, scope } = input;
  const snap =
    scope.whose === "every"
      ? await db.collection(COURSE_SESSION_REPORTS_COLLECTION).where("aboutUids", "array-contains", uid).get()
      : await db.collection(COURSE_SESSION_REPORTS_COLLECTION).where("writerUid", "==", scope.readerUid).get();
  const about = reportsAbout(
    snap.docs
      .map((doc) => normalizeSessionReport(doc.id, doc.data() ?? {}))
      .filter((report): report is CourseSessionReportDoc => report !== null),
    input,
  );
  // The other writers of what is shown, named; nobody else's account is read.
  const writers = [
    ...new Set(about.flatMap(({ report }) => (report.writerUid && report.writerUid !== scope.readerUid ? [report.writerUid] : []))),
  ];
  const names = new Map<string, string>();
  if (writers.length > 0) {
    for (const account of await db.getAll(...writers.map((writer) => db.collection("users").doc(writer)))) {
      if (!account.exists) continue;
      const data = (account.data() ?? {}) as Record<string, unknown>;
      names.set(account.id, firstNameOfUser(data) || fullNameOfUser(data));
    }
  }
  return reportLinesView(about, scope, (writer) => names.get(writer) ?? "");
}
