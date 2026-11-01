import Link from "next/link";
import { AdminPage } from "@/features/admin/adminList";
import SurveyHead, { surveyTabHref } from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { surveyPage } from "@/lib/surveys/adminView";
import { surveyLogOf } from "@/lib/surveys/surveyLog";
import { LOG_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A survey's log ("See the log" on its Answers tab): each time an admin
 * opened names on it and each download of its answers with names, who, when
 * and how many people, never whose (`surveyLogOf`). Admins only, by the `(admin-only)`
 * group's layout. It reads the two logs and writes nothing, and reading it is
 * no opening of anybody's answers.
 */
export default async function SurveyLogPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const db = getAdminDb();
  const page = db ? await surveyPage(db, surveyId, new Date()) : null;
  if (!db || !page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  const lines = await surveyLogOf(db, page.survey);
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="answered" />
      <section className={`${styles.card} ${styles.section}`} aria-labelledby="survey-log">
        <h2 id="survey-log" className={styles.sectionTitle}>
          {LOG_WORDS.title}
        </h2>
        <p className={styles.muted}>{LOG_WORDS.lede}</p>
        {lines.length === 0 ? (
          <p className={styles.muted}>{LOG_WORDS.none}</p>
        ) : (
          <div>
            {lines.map((entry, at) => (
              <div key={at} className={styles.logRow}>
                <span className={styles.logWhen}>{entry.when}</span>
                <p className={styles.logLine}>{entry.line}</p>
              </div>
            ))}
          </div>
        )}
        <div>
          <Link href={surveyTabHref(page.survey.id, "answered")} className={styles.action}>
            {LOG_WORDS.back}
          </Link>
        </div>
      </section>
    </AdminPage>
  );
}
