import Link from "next/link";
import type { ResultsView } from "@/lib/surveys/adminView";
import type { QuestionResult } from "@/lib/surveys/results";
import styles from "./surveyAdmin.module.css";

/**
 * A survey's results, for admins: each question's totals, made on the
 * server, and any comments, never with a name. Every bar is the same quiet
 * colour: what people believe is reported, never cheered or marked as good
 * or bad. Results show from the first answer.
 *
 * An admin can leave out answers sent after the person's group first met, so
 * a "before" is only what people thought before they started.
 */

function percentWords(count: number, of: number): string {
  return of > 0 ? `${count} (${Math.round((count / of) * 100)}%)` : `${count}`;
}

function Result({ result }: { result: QuestionResult }) {
  return (
    <section className={`${styles.card} ${styles.result}`} aria-labelledby={`result-${result.id}`}>
      <h3 id={`result-${result.id}`} className={styles.resultTitle}>
        {result.number}. {result.title}
      </h3>
      {result.kind === "options" && (
        <>
          <p className={styles.muted}>
            {result.respondents} answered{result.multiple ? ", ticking as many as applied" : ""}
          </p>
          <div className={styles.tally}>
            {result.options.map((option) => (
              <div key={option.label} className={styles.tallyRow}>
                <span className={styles.tallyLabel}>{option.label}</span>
                <span className={styles.tallyBar} aria-hidden="true">
                  <span className={styles.tallyFill} style={{ width: `${option.percent}%` }} />
                </span>
                <span className={styles.tallyCount}>{percentWords(option.count, result.respondents)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {result.kind === "scale" && (
        <div className={styles.scroll}>
          {result.rows.map((row, index) => (
            <div key={index} className={styles.section}>
              {row.label && <p className={styles.tallyLabel}>{row.label}</p>}
              <div className={styles.scaleRow} style={{ ["--scale-points" as string]: row.counts.length }}>
                <span className={styles.muted}>{row.respondents} answered</span>
                {row.counts.map((count, point) => (
                  <span key={point} className={styles.scaleCell} title={`${point + 1}: ${count}`}>
                    <span className={styles.scaleHead}>{point + 1}</span> {count}
                  </span>
                ))}
                <span className={styles.tallyCount}>{row.mean === null ? "" : `Mean ${row.mean.toFixed(1)}`}</span>
              </div>
            </div>
          ))}
          <p className={styles.muted}>
            1 is {result.minLabel || "the lowest"}, {result.rows[0]?.counts.length ?? 5} is {result.maxLabel || "the highest"}.
          </p>
        </div>
      )}
      {result.kind === "comments" && (
        <>
          <p className={styles.muted}>{result.respondents} wrote something</p>
          {result.comments.length > 0 && (
            <ul className={styles.comments}>
              {result.comments.map((comment, index) => (
                <li key={index}>{comment}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function ResultsTab({
  view,
  surveyId,
  beforeFirstSession,
}: {
  view: ResultsView;
  surveyId: string;
  beforeFirstSession: boolean;
}) {
  const base = `/admin/surveys/${encodeURIComponent(surveyId)}/results`;
  return (
    <div className={styles.main}>
      <div className={styles.card}>
        <p className={styles.lead}>
          {view.answers === 0 ? "No answers yet." : `${view.answers} ${view.answers === 1 ? "answer" : "answers"}.`}
          {beforeFirstSession && view.leftOut > 0
            ? ` ${view.leftOut} sent after the person’s first session ${view.leftOut === 1 ? "is" : "are"} left out.`
            : ""}
        </p>
        <Link href={beforeFirstSession ? base : `${base}?before-first-session=1`} className={styles.toggle}>
          {beforeFirstSession ? "Count every answer" : "Leave out answers sent after someone’s first session"}
        </Link>
      </div>
      {view.answers > 0 && view.questions.map((result) => <Result key={result.id} result={result} />)}
    </div>
  );
}
