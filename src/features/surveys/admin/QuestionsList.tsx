import { surveyPagesOf, isLinesQuestion, questionNumbers, type SurveyItem } from "@/lib/surveys/items";
import styles from "./surveyAdmin.module.css";

/**
 * A sent survey's questions, as people answer them, for reading: once a
 * survey has been sent its words and questions are fixed (the after survey
 * asks the same), so there is nothing here to change.
 */
export default function QuestionsList({
  items,
  measures,
  intro,
  title,
}: {
  items: SurveyItem[];
  measures: Record<string, string>;
  intro: string;
  title: string;
}) {
  const numbers = questionNumbers(items);
  return (
    <div className={styles.main}>
      <p className={styles.lockNote}>This survey has been sent, so its words and questions are fixed.</p>
      <section className={`${styles.card} ${styles.section}`} aria-label="What people see">
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.muted}>{intro}</p>
      </section>
      <section className={`${styles.card} ${styles.section}`} aria-label="Questions">
        {surveyPagesOf(items).map((page, pageAt) => (
          <div key={pageAt} className={styles.qSection}>
            {page.map((item) => {
              if (item.kind === "section") {
                return (
                  <div key={item.id} className={styles.qSectionHead}>
                    <span className={styles.cardTitle}>{item.heading}</span>
                    <span className={styles.qPage}>
                      {measures[item.id] ? `${measures[item.id]} · ` : ""}Page {pageAt + 1}
                    </span>
                  </div>
                );
              }
              if (item.kind !== "question") return null;
              return (
                <div key={item.id} className={styles.question}>
                  <span className={styles.qNumber}>{numbers.get(item.id)}</span>
                  <div className={styles.qBody}>
                    <p className={styles.qTitle}>{item.title}</p>
                    <p className={styles.qOptions}>
                      {isLinesQuestion(item)
                        ? `1 ${item.scale.minLabel} to ${item.scale.max} ${item.scale.maxLabel}, for each line: ${item.lines.map((line) => line.label).join(" · ")}`
                        : (item.options ?? []).map((option) => option.label).join(" · ")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
