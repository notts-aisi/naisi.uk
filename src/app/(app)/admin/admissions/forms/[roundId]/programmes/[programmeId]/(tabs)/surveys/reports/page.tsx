import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import { SurveysFrame } from "@/features/applications/surveys/SurveysViews";
import ReportCard from "@/features/courses/report/ReportCard";
import styles from "@/features/courses/report/sessionReport.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { readRunSessionReports } from "@/lib/courses/sessionReports/readers";
import { RUN_REPORTS_WORDS, sessionName } from "@/lib/courses/sessionReports/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SESSION REPORTS, for its lead and admins (privacy policy v15,
 * "Session reports"): what each group's facilitators reported after each
 * session, week by week, newest first, each report whole with its group, its
 * writer and its day, and the people it picks by name.
 *
 * Its own page under the Surveys tab, its Facilitators' reports view, apart
 * from the tab's Overview, because the Overview names nobody and these name
 * the people in each group. The Overview counts them and links here, to a
 * week (`#reports-week-3`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any report is read; a reviewer is told the reports are the
 * lead's and admins', and anybody with no role on the programme that there is
 * no programme here. Never a group's facilitators, who each read only their
 * own report on their own page, and never the people a report is about. The
 * admin area is closed during a view-as session (`(app)/admin/layout.tsx`).
 * Nothing here writes, and nothing is filed in the notes kept about a person.
 */
export default async function ProgrammeSessionReportsPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  const base = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  if (outcome.status === "not-yours") {
    return (
      <Refusal title={RUN_REPORTS_WORDS.refusalTitle} href={`${base}/applications`} action={RUN_REPORTS_WORDS.refusalAction}>
        {RUN_REPORTS_WORDS.refusalBody}
      </Refusal>
    );
  }
  const { view } = outcome;
  if (!view.run) {
    return (
      <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="reports">
        <RunBlank view={view} />
      </SurveysFrame>
    );
  }
  const weeks = await readRunSessionReports(db, view.run.id);
  return (
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="reports">
      <div className={styles.page}>
        <header className={styles.head}>
          <h2 className={styles.title}>{RUN_REPORTS_WORDS.title}</h2>
          <p className={styles.intro}>{RUN_REPORTS_WORDS.line}</p>
        </header>
        {weeks.length === 0 ? (
          <p className={styles.note}>{RUN_REPORTS_WORDS.none}</p>
        ) : (
          <div className={styles.reports}>
            {weeks.map((week) => (
              <section key={week.weekNumber} className={styles.week} aria-labelledby={`reports-week-${week.weekNumber}`}>
                <h3 id={`reports-week-${week.weekNumber}`} className={styles.weekTitle}>
                  {sessionName(week.weekNumber)}
                </h3>
                {week.reports.map((report) => (
                  <ReportCard key={report.id} report={report} headingLevel={4} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </SurveysFrame>
  );
}
