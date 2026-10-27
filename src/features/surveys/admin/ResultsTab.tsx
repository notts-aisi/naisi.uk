import Link from "next/link";
import type { ResultRow, ResultsView } from "@/lib/surveys/adminView";
import type { ChangeResult } from "@/lib/surveys/change";
import {
  RESULT_WORDS,
  answeredOfAnswersWords,
  answeredRateWords,
  answersRateWords,
  answersWords,
  averagesWords,
  consentCountWords,
  countsOfWords,
  lineMovedWords,
  movedWords,
  numberWords,
  pairedWithWords,
  promoterScoreWords,
  type ReachWord,
} from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * A survey's results, for admins: each question's totals, made on the
 * server, and any comments, never with a name. Beside every number, how many
 * answered and what share of the people it was sent to that is. For a survey
 * that pairs with an earlier one, how each shared question changed for the
 * people who answered both times, and the look-back beside it. Every bar is
 * the same quiet colour: what people believe is reported, never cheered or
 * marked as good or bad. Results show from the first answer.
 *
 * An admin can leave out before-survey answers sent after the person's group
 * first met, so a "before" is only what people thought before they started.
 */

function percentWords(count: number, of: number): string {
  return of > 0 ? `${count} (${Math.round((count / of) * 100)}%)` : `${count}`;
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

/** How a question changed: since an earlier survey, or against its look-back. */
function Change({ heading, change }: { heading: string; change: ChangeResult }) {
  return (
    <div className={styles.change}>
      <p className={styles.changeHead}>{heading}</p>
      {change.kind === "values" && (
        <>
          <p className={styles.muted}>{movedWords(change.both, change.against, change.up, change.same, change.down)}</p>
          {change.both > 0 && <p className={styles.muted}>{averagesWords(change.before, change.after, change.unit)}</p>}
        </>
      )}
      {change.kind === "lines" && (
        <>
          <p className={styles.muted}>Averages of the people who answered each line both times ({change.against}).</p>
          <ul className={styles.changeList}>
            {change.rows.map((row) => (
              <li key={row.label}>
                <span className={styles.tallyLabel}>{row.label}</span>{" "}
                <span className={styles.muted}>{lineMovedWords(row.before, row.after, row.up, row.both)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {change.kind === "options" && (
        <>
          <p className={styles.muted}>{countsOfWords(change.both, change.against, change.multiple)}</p>
          {change.both > 0 && (
            <div className={styles.scroll}>
              <table className={styles.changeTable}>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className={styles.srOnly}>Answer</span>
                    </th>
                    <th scope="col">{RESULT_WORDS.then}</th>
                    <th scope="col">{RESULT_WORDS.now}</th>
                  </tr>
                </thead>
                <tbody>
                  {change.options.map((option) => (
                    <tr key={option.label}>
                      <th scope="row">{option.label}</th>
                      <td>{option.before}</td>
                      <td>{option.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Result({ result, sent, reach, ofAnswers = false }: { result: ResultRow; sent: number; reach: ReachWord; ofAnswers?: boolean }) {
  // Of the answers themselves, on a survey that takes answers from people it was never sent to.
  const rateWords = (n: number, of: number, verb = "answered") =>
    ofAnswers ? answeredOfAnswersWords(n, of, verb) : answeredRateWords(n, of, verb, reach);
  return (
    <section className={`${styles.card} ${styles.result}`} aria-labelledby={`result-${result.id}`}>
      <h3 id={`result-${result.id}`} className={styles.resultTitle}>
        {result.number}. {result.title}
      </h3>
      {result.kind === "options" && (
        <>
          <p className={styles.muted}>
            {rateWords(result.respondents, sent)}
            {result.multiple ? ", ticking as many as applied" : ""}
          </p>
          <Tally options={result.options} of={result.respondents} />
          {result.scored && result.scored.mean !== null && (
            <p className={styles.muted}>
              {result.scored.unit
                ? `${numberWords(result.scored.total)} ${result.scored.unit} in all, ${numberWords(result.scored.mean)} on average, from ${result.respondents} ${result.respondents === 1 ? "answer" : "answers"}.`
                : `Average ${numberWords(result.scored.mean)}, from ${result.respondents} ${result.respondents === 1 ? "answer" : "answers"}.`}
            </p>
          )}
          {result.most && (
            <>
              <p className={styles.tallyLabel}>{result.most.title}</p>
              <p className={styles.muted}>{rateWords(result.most.respondents, sent, "picked one")}</p>
              <Tally options={result.most.options} of={result.most.respondents} />
            </>
          )}
        </>
      )}
      {result.kind === "value" && (
        <>
          <p className={styles.muted}>
            {rateWords(result.respondents, sent)}
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
                <span className={styles.muted}>{rateWords(row.respondents, sent)}</span>
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
            <p className={styles.muted}>{promoterScoreWords(result.promoterScore, result.rows[0]?.respondents ?? 0)}</p>
          )}
        </div>
      )}
      {result.kind === "comments" && (
        <>
          <p className={styles.muted}>{rateWords(result.respondents, sent, "wrote something")}</p>
          {result.comments.length > 0 && (
            <ul className={styles.comments}>
              {result.comments.map((comment, index) => (
                <li key={index}>{comment}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {result.change && <Change heading={RESULT_WORDS.beforeAndAfter} change={result.change} />}
      {result.lookBack && <Change heading={RESULT_WORDS.lookingBack} change={result.lookBack} />}
    </section>
  );
}

export default function ResultsTab({
  view,
  surveyId,
  beforeFirstSession,
  ofAnswers = false,
  switches = true,
}: {
  view: ResultsView;
  surveyId: string;
  beforeFirstSession: boolean;
  /**
   * Every rate is of the answers, not of the people it was sent to: a survey
   * after an event takes answers with its QR code from people it never
   * emailed, and its own numbers sit above these.
   */
  ofAnswers?: boolean;
  /**
   * Whether the switch that leaves out answers sent after someone's first
   * session is drawn. Admins only: a programme's lead reads every answer
   * counted, with no switch that shows a smaller set beside a larger one.
   */
  switches?: boolean;
}) {
  const base = `/admin/surveys/${encodeURIComponent(surveyId)}/results`;
  const paired = pairedWithWords(view.pairedWith);
  return (
    <div className={styles.main}>
      <div className={styles.card}>
        <p className={styles.lead}>
          {ofAnswers ? answersWords(view.answers) : answersRateWords(view.answers, view.sent, view.reach)}
          {beforeFirstSession && view.leftOut > 0
            ? ` ${view.leftOut} sent after the person’s first session ${view.leftOut === 1 ? "is" : "are"} left out.`
            : ""}
        </p>
        {paired && <p className={styles.muted}>{paired}</p>}
        {view.namesOff && <p className={styles.muted}>{RESULT_WORDS.namesOff}</p>}
        {switches && view.offersFirstSession && (
          <Link href={beforeFirstSession ? base : `${base}?before-first-session=1`} className={styles.toggle}>
            {beforeFirstSession ? RESULT_WORDS.toggleCountAll : RESULT_WORDS.toggleLeaveOut}
          </Link>
        )}
      </div>
      {view.consents.length > 0 && (
        <section className={`${styles.card} ${styles.result}`} aria-labelledby="result-consents">
          <h3 id="result-consents" className={styles.resultTitle}>
            {RESULT_WORDS.consents}
          </h3>
          {view.consents.map((consent) => (
            <p key={consent.label} className={styles.muted}>
              {consentCountWords(consent.yes, consent.of, consent.label)}
            </p>
          ))}
        </section>
      )}
      {view.answers > 0 &&
        view.questions.map((result) => (
          <Result key={result.id} result={result} sent={ofAnswers ? view.answers : view.sent} reach={view.reach} ofAnswers={ofAnswers} />
        ))}
    </div>
  );
}
