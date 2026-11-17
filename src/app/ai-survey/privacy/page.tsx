import type { Metadata } from "next";
import Link from "next/link";
import SurveyFrame from "@/features/aiSurvey/SurveyFrame";
import styles from "@/features/aiSurvey/survey.module.css";
import { AI_SURVEY, fillValues } from "@/lib/aiSurvey/definition";

/*
  /ai-survey/privacy: the privacy notice for the AI at Nottingham survey, the
  page its start screen links to.

  Every word is the survey's own (`privacyNotice` in
  src/content/aiSurvey/definition.ts), with the survey's values filled in. A
  sentence marked `onlyIf` is shown only while that value is true, so the
  notice cannot name a service the survey is not using.

  EVERY SENTENCE HERE MUST BE TRUE OF WHAT IS BUILT. A change to what the
  survey keeps, sends or loads is a change to this page first.

  Static: it reads nothing but the definition. The table is drawn as one card
  a row, because a three-column table does not fit a phone.
*/

export const metadata: Metadata = {
  title: AI_SURVEY.privacyNotice.title,
  robots: { index: false, follow: false },
};

export default function AiSurveyPrivacyPage() {
  const notice = AI_SURVEY.privacyNotice;
  const values = AI_SURVEY.values;
  return (
    <SurveyFrame label={notice.frameLabel}>
      <main className={`${styles.column} ${styles.columnPage}`}>
        <div className={styles.stack}>
          <p className={styles.eyebrow}>{AI_SURVEY.title}</p>
          <h1 className={styles.h1}>{notice.title}</h1>
        </div>
        {notice.sections.map((section) => {
          const body =
            typeof section.body === "string"
              ? section.body
              : section.body
                ? values.unionCoBadged
                  ? section.body.ifUnionCoBadged
                  : section.body.otherwise
                : null;
          const sentences = section.sentences
            ?.filter((sentence) => !sentence.onlyIf || values[sentence.onlyIf] === true)
            .map((sentence) => fillValues(sentence.text))
            .join(" ");
          return (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.h2}>{section.heading}</h2>
              {body && <p className={styles.body}>{fillValues(body)}</p>}
              {sentences && <p className={styles.body}>{sentences}</p>}
              {section.table && (
                <div className={styles.rows}>
                  {section.table.rows.map((row) => (
                    <dl key={row[0]} className={styles.row}>
                      {row.map((cell, index) => (
                        <div key={section.table!.columns[index]}>
                          <dt className={styles.term}>{section.table!.columns[index]}</dt>
                          <dd>{fillValues(cell)}</dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                </div>
              )}
              {section.list && (
                <ul className={styles.list}>
                  {section.list.map((item) => (
                    <li key={item}>{fillValues(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <Link href="/ai-survey" prefetch={false} className={styles.textLink}>
          {notice.backLink}
        </Link>
      </main>
    </SurveyFrame>
  );
}
