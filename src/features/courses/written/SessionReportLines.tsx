"use client";

import { useId } from "react";
import type { ReportLineKind, ReportLinesView } from "@/lib/courses/sessionReports/beside";
import {
  BESIDE_WORDS,
  RUN_REPORTS_WORDS,
  besideNotShownWords,
  besideSessionWords,
  besideTitleWords,
} from "@/lib/courses/sessionReports/words";
import styles from "./sessionReportLines.module.css";

/**
 * WHAT THE WEEK'S SESSION REPORTS SAY ABOUT THE PERSON (privacy v15, "Session
 * reports"), on a written answer's review page beside the feedback: the lines
 * that picked them, and nothing else of a report. The programme's lead and
 * admins see every report's lines, each report under its writer's name; a
 * facilitator sees the lines of the report they wrote ("From your session
 * report"). Each line is named as the lead's page names the answer it comes
 * from, with the words written about the person.
 *
 * Read only: nothing here changes a report or emails anybody, and the person
 * never sees it. The page hands it only what `loadWrittenReview` read for
 * this reader (`besideScopeOf`); with no report saying anything about the
 * person, it draws nothing.
 */

/** Each line as the lead's page names the answer it comes from. */
const LINE_WORDS: Record<ReportLineKind, string> = {
  engaged: RUN_REPORTS_WORDS.engaged,
  notRead: RUN_REPORTS_WORDS.notRead,
  needsHand: RUN_REPORTS_WORDS.needsHand,
};

export default function SessionReportLines({
  view,
  firstName,
}: {
  view: ReportLinesView;
  /** The first name the person whose answer it is goes by. */
  firstName: string;
}) {
  const id = useId();
  if (view.reports.length === 0) return null;
  // A week that met more than once says which session each report is on.
  const manySessions = view.reports.some((report) => report.occurrence > 1);
  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>
          {besideTitleWords(view.whose, view.reports.length)}
        </h2>
        <span className={styles.chip}>{besideNotShownWords(firstName)}</span>
      </div>
      <ul className={styles.reports} role="list">
        {view.reports.map((report, index) => {
          const meta = [
            view.whose === "every" ? (report.mine ? BESIDE_WORDS.you : report.by) : "",
            manySessions ? besideSessionWords(report.occurrence) : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={`${report.occurrence}:${report.mine ? "mine" : report.by}:${index}`} className={styles.report}>
              {meta && <p className={styles.by}>{meta}</p>}
              <ul className={styles.lines} role="list">
                {report.lines.map((line) => (
                  <li key={line.kind} className={styles.line}>
                    <p className={styles.kind}>{LINE_WORDS[line.kind]}</p>
                    {line.note && <p className={styles.note}>“{line.note}”</p>}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
