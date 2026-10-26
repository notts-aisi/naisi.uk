import { surveyPagesOf, questionNumbers, scoreOf, type SurveyItem, type SurveyQuestion } from "@/lib/surveys/items";
import { questionTypeWords } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * A sent survey's questions, as people answer them, for reading: once a
 * survey has been sent its words and questions are fixed (every later stage
 * of the programme asks the same), so there is nothing here to change.
 */

/** A question's answers, lines or scale words, on one line. */
function summaryOf(question: SurveyQuestion): string {
  switch (question.type) {
    case "lines": {
      const scale = question.scale.points
        ? question.scale.points.map((words, at) => `${at + 1} ${words}`).join(" · ")
        : `1 ${question.scale.minLabel} to ${question.scale.max} ${question.scale.maxLabel}`;
      return `${scale}, for each line: ${question.lines.map((line) => line.label).join(" · ")}`;
    }
    case "scale":
      return question.anchors.map((anchor) => `${anchor.at} ${anchor.label}`).join(" · ");
    case "percent":
      return [question.ends.min ? `0% ${question.ends.min}` : "", question.ends.max ? `100% ${question.ends.max}` : ""].filter(Boolean).join(" · ");
    case "number":
      return `0 to ${question.max}`;
    default: {
      const options = (question.options ?? []).map((option) => {
        const score = scoreOf(question, option.id);
        return score !== undefined && question.look === "points" ? `${score} ${option.label}` : option.label;
      });
      return question.most ? `${options.join(" · ")}. Then: ${question.most}` : options.join(" · ");
    }
  }
}

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
              if (item.kind === "consent") {
                return (
                  <div key={item.id} className={styles.question}>
                    <span className={styles.qNumber} aria-hidden="true" />
                    <div className={styles.qBody}>
                      <p className={styles.qTitle}>{item.statement}</p>
                      <p className={styles.qOptions}>{item.boxes.map((box) => `☐ ${box.label}`).join(" · ")}</p>
                    </div>
                  </div>
                );
              }
              if (item.kind !== "question") return null;
              const summary = summaryOf(item);
              return (
                <div key={item.id} className={styles.question}>
                  <span className={styles.qNumber}>{numbers.get(item.id)}</span>
                  <div className={styles.qBody}>
                    <p className={styles.qTitle}>{item.title}</p>
                    {item.hint && <p className={styles.muted}>{item.hint}</p>}
                    {summary && <p className={styles.qOptions}>{summary}</p>}
                    <span className={styles.qType}>{questionTypeWords(item)}</span>
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
