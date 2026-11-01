import Link from "next/link";
import { redirect } from "next/navigation";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import ReportCard from "@/features/courses/report/ReportCard";
import SessionReportForm from "@/features/courses/report/SessionReportForm";
import styles from "@/features/courses/report/sessionReport.module.css";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { loadReportPage } from "@/lib/courses/sessionReports/page";
import { REPORT_WORDS } from "@/lib/courses/sessionReports/words";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A FACILITATOR'S SESSION REPORT (board S-fac-report): two minutes straight
 * after the register, on a phone. "Next: two minutes on how it went." under
 * a finished register leads here, naming its session (`?session=w03`).
 *
 * THE GATE is the report route's own (`gateReportWriter`), restated because a
 * page's only protection must not be a level above it: a live facilitator of
 * THIS group, on THIS run. Each writes their own report; an admin and the
 * programme's lead read reports on the programme's page and write none. So
 * everybody else, an admin who facilitates no live group here included, is
 * sent to the run's home, never told whether the group exists. The route
 * re-derives the same access from the same documents and is the real
 * boundary.
 *
 * WHAT IT SHOWS (`loadReportPage`): the form while the session's report is
 * open, with this writer's own answers in it once sent; before the session
 * starts, when it opens; once the group's next session has started, that it
 * has closed, and what this writer sent. A session that was called off, or
 * that the register says did not happen, has no report.
 */

export const dynamic = "force-dynamic";

export default async function SessionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const asked = (await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", fused in `getRunAccess`.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  // Dynamic segments arrive decoded: a `/` here would make `doc()` throw.
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const view = await loadReportPage(db, access.user, runId, groupId, typeof asked === "string" ? asked : null, new Date());
  if (!view) redirect(runHome);

  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  // The facilitator pages' frame is a size container that draws the phone
  // bar when it is narrow, so it keeps the column's whole width; the report
  // keeps the width of a form read down a phone inside it.
  return (
    <div className={facilitator.page}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={groupPath} className={weekly.back}>
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
          <Link href={groupPath} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {view.groupName}
          </Link>
          <p className={styles.eyebrow}>{REPORT_WORDS.eyebrow}</p>
          <h1 className={styles.title}>{view.kind === "nothing-yet" ? REPORT_WORDS.barTitle : view.title}</h1>
          {view.kind === "open" ? (
            <p className={styles.intro}>{view.intro}</p>
          ) : (
            <p className={styles.line}>{view.kind === "nothing-yet" ? REPORT_WORDS.nothingYet : view.line}</p>
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
