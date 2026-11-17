import type { Metadata } from "next";
import Link from "next/link";
import SurveyFrame from "@/features/aiSurvey/SurveyFrame";
import styles from "@/features/aiSurvey/survey.module.css";
import { AI_SURVEY, fillValues } from "@/lib/aiSurvey/definition";

/*
  /ai-survey/results: where the AI at Nottingham survey's results will be
  published, as totals.

  The end screen and the closed screen both send people here, so until there
  are results it says when there will be. The results themselves are a later
  piece of work with its own design. Nothing about any one person is ever
  shown here.
*/

export const metadata: Metadata = {
  title: `Results: ${AI_SURVEY.title}`,
  robots: { index: false, follow: false },
};

export default function AiSurveyResultsPage() {
  return (
    <SurveyFrame label={AI_SURVEY.ui.frameLabel}>
      <main className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.eyebrow}>{AI_SURVEY.start.eyebrow}</p>
          <h1 className={styles.h1}>{AI_SURVEY.title}</h1>
        </div>
        <section className={styles.card}>
          <p className={`${styles.body} ${styles.bodyStrong}`}>
            {fillValues("Results will be published here, as totals, by {resultsBy}.")}
          </p>
        </section>
        <Link href="/ai-survey" prefetch={false} className={styles.textLink}>
          {AI_SURVEY.privacyNotice.backLink}
        </Link>
      </main>
    </SurveyFrame>
  );
}
