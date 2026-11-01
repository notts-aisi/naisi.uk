import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { SurveysFrame, type SurveysView } from "@/features/applications/surveys/SurveysViews";
import ResultsTab from "@/features/surveys/admin/ResultsTab";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { resultsView } from "@/lib/surveys/adminView";
import { leadSurveyOf } from "@/lib/surveys/leadResults";
import { LEAD_RESULTS_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * ONE OF A PROGRAMME'S SURVEYS' RESULTS, for its lead and admins (Q41, Q46,
 * Q49 A): totals and comments for their own programme, made on the server,
 * never a name, from the first answer, under the programme's head. Linked
 * from the programme's Surveys tab.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any survey is read; a reviewer is told in a sentence that this
 * is the lead's and an admins'. A survey that is not this programme's (a
 * survey after an event, another programme's, or none) is answered in a
 * sentence too (`leadSurveyOf`). Its comments are listed by their words, not
 * in the order they came in, and the admins' switch that leaves out answers
 * sent after someone's first session is not drawn. Who answered is never
 * here: that is the admins' Who answered tab.
 *
 * Under the tab's row of views, with the view its stage is listed on current:
 * Before, End (the survey at the end and the survey about leaving) or
 * Follow-ups.
 */
/** The view a survey of this stage is listed on, or none. */
function viewOf(kind: string): SurveysView | null {
  switch (kind) {
    case "before":
      return "before";
    case "after":
    case "leaving":
      return "end";
    case "followUp6":
    case "followUp12":
      return "follow-ups";
    default:
      return null;
  }
}

export default async function ProgrammeSurveyResultsPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; surveyId: string }>;
}) {
  const [{ roundId, programmeId, surveyId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return (
      <section className={styles.card}>
        <p className={styles.lead}>{LEAD_RESULTS_WORDS.notYours}</p>
      </section>
    );
  }
  const survey = await leadSurveyOf(db, roundId, programmeId, surveyId);
  if (!survey) {
    return (
      <SurveysFrame roundId={roundId} programmeId={programmeId} current={null}>
        <section className={styles.card}>
          <p className={styles.lead}>{LEAD_RESULTS_WORDS.notHere}</p>
        </section>
      </SurveysFrame>
    );
  }
  const view = await resultsView(db, survey, false, { commentsInOrder: "words" });
  return (
    <SurveysFrame roundId={roundId} programmeId={programmeId} current={viewOf(survey.kind)}>
      <div className={styles.section}>
        <section className={styles.card} aria-labelledby="programme-survey">
          <h2 id="programme-survey" className={styles.sectionTitle}>
            {survey.name}
          </h2>
          <p className={styles.muted}>{LEAD_RESULTS_WORDS.line}</p>
        </section>
        <ResultsTab view={view} surveyId={survey.id} beforeFirstSession={false} switches={false} />
      </div>
    </SurveysFrame>
  );
}
