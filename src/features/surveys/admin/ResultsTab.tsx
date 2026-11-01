import Link from "next/link";
import type { ResultRow, ResultsView } from "@/lib/surveys/adminView";
import type { ChangeResult } from "@/lib/surveys/change";
import { chartGroupsOf, type ChartGroup } from "@/lib/surveys/charts";
import {
  CHART_WORDS,
  RESULT_WORDS,
  answeredOfAnswersWords,
  answeredRateWords,
  answersRateWords,
  answersWords,
  averagesWords,
  barShareWords,
  consentCountWords,
  countsOfWords,
  lineMovedWords,
  movedWords,
  narrowedAnswersWords,
  numberWords,
  oneDecimalWords,
  pairedWithWords,
  promoterScoreWords,
  questionFileWords,
  seeWhoLabelWords,
  seeWhoWords,
  showAllWords,
  whoseLabelWords,
  type ReachWord,
} from "@/lib/surveys/words";
import DownloadChart from "../charts/DownloadChart";
import SeeWho, { type WhoChoice } from "../charts/SeeWho";
import charts from "../charts/charts.module.css";
import bars from "../lead/analysis.module.css";
import styles from "./surveyAdmin.module.css";

/**
 * A survey's results: each question's totals as a chart, made on the server,
 * and any comments, never with a name. Every bar is the theme's accent, one
 * colour whatever it counts, with its words and its figures outside it (its
 * count and its share of the people who answered the question): what people
 * believe is reported, never cheered or marked as good or bad. Beside every
 * question, how many answered and what share of the people it was sent to
 * that is. For a survey that pairs with an earlier one, how each shared
 * question changed for the people who answered both times, and the look-back
 * beside it. Comments are listed by their words, the first few and the rest
 * behind "Show all". Results show from the first answer.
 *
 * FOR AN ADMIN (`admin`), on the survey's own Results tab: "See who" behind
 * each bar and "Whose is this?" beside each comment, each opening recorded by
 * the route before any name is read (`SeeWho`), and each question's two
 * downloads: its totals and comments as a file that names nobody, and the
 * chart as a picture made in the browser. Without `admin` (a programme's
 * lead, and the event's Survey after tab) none of it is drawn, and no key of
 * a bar or a comment is on the page.
 *
 * An admin can leave out before-survey answers sent after the person's group
 * first met, so a "before" is only what people thought before they started.
 */

const COMMENTS_SHOWN = 5;

/** What an admin's charts carry: the survey, the filters on the screen, and the day for a file's name. */
export type ResultsAdmin = {
  surveyName: string;
  /** The London day, "2026-11-05", for the name of a file. */
  today: string;
  choice: WhoChoice;
  /** The comments' answer ids, beside each comments question (`ResultsView.commentKeys`). */
  commentKeys: Record<string, string[]>;
};

/** The filters on the screen as an address's query: "who=g1&as=guests&before-first-session=1". */
function choiceQuery(choice: WhoChoice): string {
  const params = new URLSearchParams();
  if (choice.who) params.set("who", choice.who);
  if (choice.as) params.set("as", choice.as);
  if (choice.beforeFirstSession) params.set("before-first-session", "1");
  return params.toString();
}

function Bars({ group, surveyId, question, admin }: { group: ChartGroup; surveyId: string; question: string; admin: ResultsAdmin | null }) {
  return (
    <ul className={bars.bars}>
      {group.bars.map((bar) => (
        <li key={bar.key} className={admin ? bars.bar : `${bars.bar} ${bars.barPlain}`}>
          <span className={bars.barLabel}>{bar.label}</span>
          <span className={bars.track} aria-hidden="true">
            <span className={bars.fill} style={{ width: `${Math.min(100, Math.max(0, bar.percent))}%` }} />
          </span>
          <span className={bars.barCount}>{barShareWords(bar.count, bar.percent)}</span>
          {admin &&
            (bar.count > 0 ? (
              <SeeWho
                surveyId={surveyId}
                question={question}
                target={{ bar: bar.key, count: bar.count }}
                choice={admin.choice}
                label={seeWhoWords(bar.count)}
                ariaLabel={seeWhoLabelWords(bar.label, group.heading, bar.count)}
                layout="bar"
              />
            ) : (
              <span className={`${bars.barReports} ${charts.nobody}`}>{CHART_WORDS.nobody}</span>
            ))}
        </li>
      ))}
    </ul>
  );
}

function CommentItem({ text, keyOf, surveyId, question, admin }: { text: string; keyOf: string | null; surveyId: string; question: string; admin: ResultsAdmin | null }) {
  const whose = admin && keyOf;
  return (
    <li className={whose ? charts.comment : `${charts.comment} ${charts.commentPlain}`}>
      <p className={charts.commentText}>{text}</p>
      {whose && (
        <SeeWho
          surveyId={surveyId}
          question={question}
          target={{ comment: keyOf }}
          choice={admin.choice}
          label={CHART_WORDS.whose}
          ariaLabel={whoseLabelWords(text)}
          layout="comment"
        />
      )}
    </li>
  );
}

/** A comments question's comments: the first few, then the rest behind a press that needs no script. */
function Comments({ result, surveyId, admin }: { result: Extract<ResultRow, { kind: "comments" }>; surveyId: string; admin: ResultsAdmin | null }) {
  const keys = admin?.commentKeys[result.id] ?? [];
  const item = (text: string, at: number) => (
    <CommentItem key={at} text={text} keyOf={keys[at] ?? null} surveyId={surveyId} question={result.id} admin={admin} />
  );
  const first = result.comments.slice(0, COMMENTS_SHOWN);
  const rest = result.comments.slice(COMMENTS_SHOWN);
  return (
    <div>
      <ul className={charts.comments}>{first.map(item)}</ul>
      {rest.length > 0 && (
        <details className={charts.more}>
          <summary>{showAllWords(result.comments.length)}</summary>
          <ul className={charts.comments}>{rest.map((text, at) => item(text, at + COMMENTS_SHOWN))}</ul>
        </details>
      )}
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

function Result({
  result,
  sent,
  reach,
  ofAnswers = false,
  surveyId,
  admin,
}: {
  result: ResultRow;
  sent: number;
  reach: ReachWord;
  ofAnswers?: boolean;
  surveyId: string;
  admin: ResultsAdmin | null;
}) {
  // Of the answers themselves, on a survey that takes answers from people it was never sent to.
  const rateWords = (n: number, of: number, verb = "answered") =>
    ofAnswers ? answeredOfAnswersWords(n, of, verb) : answeredRateWords(n, of, verb, reach);
  const groups = chartGroupsOf(result);
  const title = `${result.number}. ${result.title}`;
  const answered =
    result.kind === "scale" ? Math.max(0, ...result.rows.map((row) => row.respondents)) : result.respondents;
  const query = admin ? choiceQuery(admin.choice) : "";
  return (
    <section className={`${styles.card} ${styles.result}`} aria-labelledby={`result-${result.id}`}>
      <div className={charts.head}>
        <h3 id={`result-${result.id}`} className={styles.resultTitle}>
          {title}
        </h3>
        {admin && (
          <div className={charts.actions}>
            <a
              href={`/api/surveys/${encodeURIComponent(surveyId)}/totals?question=${encodeURIComponent(result.id)}${query ? `&${query}` : ""}`}
              download
              className={charts.action}
            >
              {CHART_WORDS.downloadQuestion}
            </a>
            {groups.length > 0 && (
              <DownloadChart
                title={title}
                line={`${admin.surveyName} · ${rateWords(answered, sent)}`}
                groups={groups}
                fileName={questionFileWords(admin.surveyName, result.number, admin.today)}
              />
            )}
          </div>
        )}
      </div>
      {result.kind === "options" && (
        <>
          <p className={styles.muted}>
            {rateWords(result.respondents, sent)}
            {result.multiple ? ", ticking as many as applied" : ""}
          </p>
          {groups[0] && <Bars group={groups[0]} surveyId={surveyId} question={result.id} admin={admin} />}
          {result.scored && result.scored.mean !== null && (
            <p className={styles.muted}>
              {result.scored.unit
                ? `${numberWords(result.scored.total)} ${result.scored.unit} in all, ${numberWords(result.scored.mean)} on average, from ${result.respondents} ${result.respondents === 1 ? "answer" : "answers"}.`
                : `Average ${numberWords(result.scored.mean)}, from ${result.respondents} ${result.respondents === 1 ? "answer" : "answers"}.`}
            </p>
          )}
          {result.most && groups[1] && (
            <div className={charts.group}>
              <p className={charts.groupHead}>{result.most.title}</p>
              <p className={styles.muted}>{rateWords(result.most.respondents, sent, "picked one")}</p>
              <Bars group={groups[1]} surveyId={surveyId} question={result.id} admin={admin} />
            </div>
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
          {groups[0] && <Bars group={groups[0]} surveyId={surveyId} question={result.id} admin={admin} />}
        </>
      )}
      {result.kind === "scale" && (
        <>
          {result.rows.map((row, index) => (
            <div key={index} className={charts.group}>
              {row.label && <p className={charts.groupHead}>{row.label}</p>}
              <p className={styles.muted}>
                {rateWords(row.respondents, sent)}
                {row.mean !== null
                  ? `. Average ${oneDecimalWords(row.mean)}${row.median !== null ? `, middle value ${numberWords(row.median)}` : ""}.`
                  : ""}
              </p>
              {groups[index] && <Bars group={groups[index]} surveyId={surveyId} question={result.id} admin={admin} />}
            </div>
          ))}
          <p className={styles.muted}>
            {result.min} is {result.minLabel || "the lowest"}, {result.min + (result.rows[0]?.counts.length ?? 5) - 1} is {result.maxLabel || "the highest"}.
          </p>
          {result.promoterScore !== null && (
            <p className={styles.muted}>{promoterScoreWords(result.promoterScore, result.rows[0]?.respondents ?? 0)}</p>
          )}
        </>
      )}
      {result.kind === "comments" && (
        <>
          <p className={styles.muted}>
            {rateWords(result.respondents, sent, "wrote something")}
            {result.comments.length > 1 ? `, ${CHART_WORDS.byWords}` : ""}
          </p>
          {result.comments.length > 0 && <Comments result={result} surveyId={surveyId} admin={admin} />}
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
  admin = null,
  narrowed = "",
}: {
  view: ResultsView;
  surveyId: string;
  beforeFirstSession: boolean;
  /**
   * Every rate is of the answers, not of the people it was sent to: a survey
   * after an event takes answers with its QR code from people it never
   * emailed, and its own numbers sit above these; and results an admin has
   * narrowed to a group, or to members or guests, are of those answers.
   */
  ofAnswers?: boolean;
  /**
   * Whether the switch that leaves out answers sent after someone's first
   * session is drawn. Admins only: a programme's lead reads every answer
   * counted, with no switch that shows a smaller set beside a larger one.
   */
  switches?: boolean;
  /** For an admin on the survey's own Results tab: See who, Whose is this? and the downloads. */
  admin?: ResultsAdmin | null;
  /** Who an admin's filter narrowed the results to ("Group A", "guests"), or "" for everybody. */
  narrowed?: string;
}) {
  const base = `/admin/surveys/${encodeURIComponent(surveyId)}/results`;
  // The switch keeps the filters on the screen.
  const switchHref = (on: boolean) => {
    const query = choiceQuery({ who: admin?.choice.who ?? "", as: admin?.choice.as ?? "", beforeFirstSession: on });
    return query ? `${base}?${query}` : base;
  };
  const paired = pairedWithWords(view.pairedWith);
  return (
    <div className={styles.main}>
      <div className={styles.card}>
        <p className={styles.lead}>
          {narrowed ? narrowedAnswersWords(view.answers, narrowed) : ofAnswers ? answersWords(view.answers) : answersRateWords(view.answers, view.sent, view.reach)}
          {beforeFirstSession && view.leftOut > 0
            ? ` ${view.leftOut} sent after the person’s first session ${view.leftOut === 1 ? "is" : "are"} left out.`
            : ""}
        </p>
        {paired && <p className={styles.muted}>{paired}</p>}
        {view.namesOff && <p className={styles.muted}>{RESULT_WORDS.namesOff}</p>}
        {switches && view.offersFirstSession && (
          <Link href={switchHref(!beforeFirstSession)} className={styles.toggle}>
            {beforeFirstSession ? RESULT_WORDS.toggleCountAll : RESULT_WORDS.toggleLeaveOut}
          </Link>
        )}
      </div>
      {view.consents.length > 0 && !narrowed && (
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
          <Result
            key={result.id}
            result={result}
            sent={ofAnswers ? view.answers : view.sent}
            reach={view.reach}
            ofAnswers={ofAnswers}
            surveyId={surveyId}
            admin={admin}
          />
        ))}
    </div>
  );
}
