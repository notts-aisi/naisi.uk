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

/** A number as the results print it: whole when it is, else to one place. */
function numberWords(value: number | null, unit = ""): string {
  if (value === null) return "";
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${shown}${unit}`;
}

function Tally({ options, of }: { options: { label: string; count: number; percent: number }[]; of: number }) {
  return (
    <div className={styles.tally}>
      {options.map((option) => (
        <div key={option.label} className={styles.tallyRow}>
          <span className={styles.tallyLabel}>{option.label}</span>
          <span className={styles.tallyBar} aria-hidden="true">
            <span className={styles.tallyFill} style={{ width: `${option.percent}%` }} />
          </span>
          <span className={styles.tallyCount}>{percentWords(option.count, of)}</span>
        </div>
      ))}
    </div>
  );
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
          <Tally options={result.options} of={result.respondents} />
          {result.scored && result.scored.mean !== null && (
            <p className={styles.muted}>
              {result.scored.unit
                ? `${numberWords(result.scored.total)} ${result.scored.unit} in all, ${numberWords(result.scored.mean)} on average.`
                : `Average ${numberWords(result.scored.mean)}.`}
            </p>
          )}
          {result.most && (
            <>
              <p className={styles.tallyLabel}>{result.most.title}</p>
              <p className={styles.muted}>{result.most.respondents} picked one</p>
              <Tally options={result.most.options} of={result.most.respondents} />
            </>
          )}
        </>
      )}
      {result.kind === "value" && (
        <>
          <p className={styles.muted}>
            {result.respondents} answered
            {result.respondents > 0
              ? `. Average ${numberWords(result.mean, result.unit)}, middle value ${numberWords(result.median, result.unit)}, from ${numberWords(result.lowest, result.unit)} to ${numberWords(result.highest, result.unit)}.`
              : ""}
          </p>
          <Tally
            options={result.bands.map((band) => ({ label: band.label, count: band.count, percent: result.respondents > 0 ? Math.round((band.count / result.respondents) * 100) : 0 }))}
            of={result.respondents}
          />
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
                  <span key={point} className={styles.scaleCell} title={`${point + result.min}: ${count}`}>
                    <span className={styles.scaleHead}>{point + result.min}</span> {count}
                  </span>
                ))}
                <span className={styles.tallyCount}>{row.mean === null ? "" : `Mean ${row.mean.toFixed(1)}`}</span>
              </div>
            </div>
          ))}
          <p className={styles.muted}>
            {result.min} is {result.minLabel || "the lowest"}, {result.min + (result.rows[0]?.counts.length ?? 5) - 1} is {result.maxLabel || "the highest"}.
          </p>
          {result.promoterScore !== null && (
            <p className={styles.muted}>
              Net promoter score {result.promoterScore > 0 ? `+${result.promoterScore}` : result.promoterScore}: the share at 9 or 10 less the share at 0 to 6.
            </p>
          )}
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
