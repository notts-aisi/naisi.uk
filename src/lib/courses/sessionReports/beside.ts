import type { CourseSessionReportDoc } from "@/lib/firestore/courseSessionReports";
import { RUN_REPORTS_WORDS } from "./words";

/**
 * THE REPORT BESIDE THE WORK (privacy v15, "Session reports"): on a written
 * answer's review page, what that week's session reports say about the
 * person whose answer it is, and nothing else of a report.
 *
 *  - WHAT. Only the person's own lines: picked as having engaged well (with
 *    what made them stand out), as seeming not to have done the readings, or
 *    as somebody who might need a hand (with the word about them). Never how
 *    the session went, what went well or didn't, what seemed unclear, the
 *    note for the lead, or anybody else a report picks.
 *  - WHOSE REPORTS. The programme's lead and admins read every report, so
 *    they see every report's lines about the person. Anybody else the review
 *    page lets review the answer is a facilitator of the person's group, and
 *    sees only the lines of the reports they wrote themselves, which they
 *    read whole on their own report page already: never a co-facilitator's.
 *    Nobody sees what the reports say about themselves, and somebody who may
 *    not review the answer sees nothing.
 *  - READ ONLY. Nothing here writes, and nothing is emailed.
 *
 * Pure (the record's type and the report's words), so the review page in the
 * browser reads the view's shape here. The server's reader is
 * `readReportLinesAbout` in `./readers.ts`, called only by the review page's
 * loader, after its gate.
 */

/**
 * Whose reports' lines a reader of one written answer sees: `every` for the
 * programme's lead and admins, `own` for a facilitator, the reports
 * `readerUid` wrote and no others.
 */
export type BesideScope = { whose: "every" | "own"; readerUid: string };

/**
 * THE RULE, in one place. `mayReview` is the review page's own answer for
 * this reader and this answer (`writtenReviewRole`); `reader` says whether
 * they are an admin or the programme's lead (`reviewerFactsOf`). Null for
 * the person themselves and for anybody who may not review the answer: they
 * are handed no line at all.
 */
export function besideScopeOf(
  reader: { uid: string; isAdmin: boolean; isLead: boolean },
  ownerUid: string,
  mayReview: boolean,
): BesideScope | null {
  if (!mayReview || !reader.uid || reader.uid === ownerUid) return null;
  return { whose: reader.isAdmin || reader.isLead ? "every" : "own", readerUid: reader.uid };
}

/** The three answers that pick a person, in the order the form asks them. */
export type ReportLineKind = "engaged" | "notRead" | "needsHand";

/** One line a report has about the person: what picked them, and the words written about them ("" for none). */
export type ReportLine = { kind: ReportLineKind; note: string };

/** One report's lines about the person. */
export type ReportLinesOf = {
  /**
   * Who wrote it, by the first word of the name they go by, or the words for
   * a writer whose account was deleted; "" when the reader wrote it.
   */
  by: string;
  /** The reader wrote it. */
  mine: boolean;
  /** Which of the week's sessions it is on: 1, or 2 for a week's second. */
  occurrence: number;
  lines: ReportLine[];
};

/**
 * What the review page is handed: whose reports' lines these are, and each
 * report that says something about the person, in the order of the week's
 * sessions, then oldest first. No report that says nothing about them.
 */
export type ReportLinesView = { whose: BesideScope["whose"]; reports: ReportLinesOf[] };

/** The lines one report has about `uid`, in the form's order; none when no answer picks them. */
export function linesAbout(report: Pick<CourseSessionReportDoc, "answers">, uid: string): ReportLine[] {
  const lines: ReportLine[] = [];
  const engaged = report.answers.engaged.find((pick) => pick.uid === uid);
  if (engaged) lines.push({ kind: "engaged", note: engaged.note });
  if (report.answers.notRead.includes(uid)) lines.push({ kind: "notRead", note: "" });
  const needsHand = report.answers.needsHand.find((pick) => pick.uid === uid);
  if (needsHand) lines.push({ kind: "needsHand", note: needsHand.note });
  return lines;
}

/** A report the reader sees that says something about the person, with what it says. */
export type ReportAbout = { report: CourseSessionReportDoc; lines: ReportLine[] };

/**
 * THE REPORTS A READER SEES ABOUT ONE PERSON, for one week of one run: each
 * report `scope` lets them see that picks the person, with its lines about
 * them, in the order of the week's sessions, then oldest first. A report on
 * another run or week is left out, and so, for `own`, is every report its
 * reader did not write, whatever the query asked.
 */
export function reportsAbout(
  reports: readonly CourseSessionReportDoc[],
  input: { runId: string; uid: string; weekNumber: number; scope: BesideScope },
): ReportAbout[] {
  const { runId, uid, weekNumber, scope } = input;
  return reports
    .filter((report) => report.runId === runId && report.weekNumber === weekNumber)
    .filter((report) => scope.whose === "every" || (report.writerUid !== null && report.writerUid === scope.readerUid))
    .map((report) => ({ report, lines: linesAbout(report, uid) }))
    .filter(({ lines }) => lines.length > 0)
    .sort(
      (a, b) =>
        a.report.occurrence - b.report.occurrence ||
        (a.report.sentAt?.getTime() ?? 0) - (b.report.sentAt?.getTime() ?? 0) ||
        a.report.id.localeCompare(b.report.id),
    );
}

/**
 * THE PROJECTION: what the page is handed of `about`, and nothing else of a
 * report: who wrote each, whether the reader did, which session it is on and
 * its lines about the person. `nameOf` answers a writer's name, or "" when no
 * account is on record, which reads as a writer whose account was deleted
 * does: "A former facilitator".
 */
export function reportLinesView(
  about: readonly ReportAbout[],
  scope: BesideScope,
  nameOf: (writerUid: string) => string,
): ReportLinesView {
  return {
    whose: scope.whose,
    reports: about.map(({ report, lines }) => {
      const mine = report.writerUid !== null && report.writerUid === scope.readerUid;
      return {
        by: mine ? "" : (report.writerUid ? nameOf(report.writerUid) : "") || RUN_REPORTS_WORDS.writerGone,
        mine,
        occurrence: report.occurrence,
        lines: lines.map((line) => ({ kind: line.kind, note: line.note })),
      };
    }),
  };
}
