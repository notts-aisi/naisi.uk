import Link from "next/link";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import ReportCard from "@/features/courses/report/ReportCard";
import SessionReportForm from "@/features/courses/report/SessionReportForm";
import styles from "@/features/courses/report/sessionReport.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import type { ReportPageView } from "@/lib/courses/sessionReports/page";
import { REPORT_WORDS } from "@/lib/courses/sessionReports/words";

/**
 * ONE SESSION'S REPORT, as a page: the facilitator's under
 * `/learn/[runId]/group/[groupId]/report` and the one under the programme's
 * group page for the programme's lead or an admin who took a session's
 * register in a facilitator's place. The page that draws it has asked its
 * own gate (`loadReportPage`) first; the report route asks again on Send.
 *
 * A report written in a facilitator's place says so over the form ("Written
 * by you, covering for Josh. ..."), and its way back is the register it was
 * written from, not the group's page.
 */
export default function SessionReportPageBody({ view, backHref }: { view: ReportPageView; backHref: string }) {
  // The facilitator pages' frame is a size container that draws the phone
  // bar when it is narrow, so it keeps the column's whole width; the report
  // keeps the width of a form read down a phone inside it.
  return (
    <div className={facilitator.page}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={backHref} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{view.groupName}</span>
          </Link>
        </div>
        <span className={weekly.barTitle}>{REPORT_WORDS.barTitle}</span>
        <div className={weekly.barEnd} />
      </div>

      <div className={styles.page}>
        <header className={styles.head}>
          <Link href={backHref} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {view.groupName}
          </Link>
          <p className={styles.eyebrow}>{REPORT_WORDS.eyebrow}</p>
          <h1 className={styles.title}>{view.kind === "nothing-yet" ? REPORT_WORDS.barTitle : view.title}</h1>
          {view.kind === "open" ? (
            <p className={styles.intro}>{view.intro}</p>
          ) : (
            <p className={styles.line}>{view.kind === "nothing-yet" ? REPORT_WORDS.nothingYet : view.line}</p>
          )}
          {view.covering && (
            <p className={styles.line} data-testid="report-covering">
              {view.covering}
            </p>
          )}
        </header>

        {view.kind === "open" && <SessionReportForm {...view.form} />}

        {view.kind === "closed" &&
          (view.sent ? (
            <section className={styles.week} aria-label={REPORT_WORDS.whatYouSent}>
              <h2 className={styles.weekTitle}>{REPORT_WORDS.whatYouSent}</h2>
              <ReportCard report={view.sent} />
            </section>
          ) : (
            <p className={styles.note}>{REPORT_WORDS.noneSent}</p>
          ))}
      </div>
    </div>
  );
}
