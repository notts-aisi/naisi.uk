import Link from "next/link";
import type { RatedSource } from "@/lib/courses/sourceRatings";
import type { LeadEnd, LeadFacilitatorLine, LeadTabView, ScaleResult } from "@/lib/surveys/leadTab";
import type { ScaleRow } from "@/lib/surveys/results";
import type { SurveyKind } from "@/lib/firestore/surveys";
import {
  LEAD_STAGE_WORDS,
  LEAD_TAB_WORDS,
  RESULT_WORDS,
  answeredBothWords,
  answersCountWords,
  averageOutOfWords,
  averagesFromWords,
  beliefsLineWords,
  facilitatorLineWords,
  ofMovedUpWords,
  oneDecimalWords,
  promoterScoreWords,
  ratingsCountWords,
  seeAllWords,
  shownOfWords,
  stagesMovedWords,
} from "@/lib/surveys/words";
import styles from "./leadSurveys.module.css";

/**
 * THE VIEWS OF A PROGRAMME LEAD'S SURVEYS TAB THAT HOLD ITS OWN SURVEYS:
 * Before, the before survey; End, what changed, the survey at
 * the end and the survey about leaving with a way to each one's results,
 * Ratings and the anonymous form's answers, how it went, the sources people
 * rated, the facilitator line and what people wrote; and Follow-ups. All in
 * totals and comments, never a name. Each view draws the sections that were
 * on the one tab before it had views, unchanged, for its own stage (`stage`).
 *
 * A Server Component, drawn from the view the server made (`leadSurveysTab`),
 * which holds no name, uid or address and no row per person. Every link is
 * a page under the programme's own address (`base`), each behind the same
 * gate as this one. The bars are one quiet colour: what people believe or
 * say is reported, never cheered or marked as good or bad.
 *
 * What the records do not hold is left out, not drawn empty: each
 * facilitator's own scores and the comments about each group (the survey at
 * the end asks one line about the facilitator, for every group together),
 * "Can be quoted" beside a comment (not on Results yet), and the report's
 * download (not built). How useful each week's sessions were comes from the
 * check-ins, on the Overview (`SurveysOverview`).
 */

const COMMENTS_SHOWN = 5;

function Arrow() {
  return (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Unseen() {
  return (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1-.9 2.3-2 3.6M6.3 6.6C4.2 8 3.2 10 3 12c.5 2.5 4 7 9 7 1.6 0 3-.4 4.2-1" />
    </svg>
  );
}

function ArrowLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={styles.arrowLink}>
      <span>{children}</span>
      <Arrow />
    </Link>
  );
}

/** A bar's share, as a width: 0 to 100. */
function share(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
}

/** One point of a scale: its number, and its words at either end. */
function pointLabel(point: number, result: ScaleResult, top: number): string {
  if (point === result.min && result.minLabel) return `${point} ${result.minLabel}`;
  if (point === top && result.maxLabel) return `${point} ${result.maxLabel}`;
  return String(point);
}

/** A one-row scale (Q1, Q3): its average, and a bar for each point. */
function ScaleQuestion({ result }: { result: ScaleResult }) {
  const row = result.rows[0];
  if (!row) return null;
  const top = result.min + row.counts.length - 1;
  return (
    <div className={styles.question}>
      <h3 className={styles.questionTitle}>{result.title}</h3>
      {row.mean !== null && (
        <p className={styles.average}>
          <span className={styles.averageFigure}>{oneDecimalWords(row.mean)}</span>
          <span className={styles.averageWords}>{averageOutOfWords(top, row.respondents)}</span>
        </p>
      )}
      <ul className={styles.bars}>
        {row.counts.map((count, index) => (
          <li key={index} className={styles.bar}>
            <span className={styles.barLabel}>{pointLabel(result.min + index, result, top)}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${share(count, row.respondents)}%` }} />
            </span>
            <span className={styles.barCount}>{`${count} of ${row.respondents}`}</span>
          </li>
        ))}
      </ul>
      {result.promoterScore !== null && <p className={styles.caption}>{promoterScoreWords(result.promoterScore, row.respondents)}</p>}
    </div>
  );
}

/** One line's average as a bar, out of the scale's top point, with how many answered it. */
function LineRow({ row, max }: { row: ScaleRow; max: number }) {
  return (
    <li className={styles.line}>
      <span className={styles.lineLabel}>{row.label}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${row.mean === null ? 0 : share(row.mean, max)}%` }} />
      </span>
      <span className={styles.lineMean}>{row.mean === null ? "" : oneDecimalWords(row.mean)}</span>
      <span className={styles.lineCount}>{answersCountWords(row.respondents)}</span>
    </li>
  );
}

/** A grid (Q2): each line's average, from its bottom word to its top. */
function LinesQuestion({ result }: { result: ScaleResult }) {
  const max = result.min + (result.rows[0]?.counts.length ?? 1) - 1;
  return (
    <div className={styles.question}>
      <h3 className={styles.questionTitle}>{result.title}</h3>
      <p className={styles.questionLine}>{averagesFromWords(result.min, result.minLabel, max, result.maxLabel)}</p>
      <ul className={styles.lines}>
        {result.rows.map((row, index) => (
          <LineRow key={index} row={row} max={max} />
        ))}
      </ul>
    </div>
  );
}

function Changed({ view, base }: { view: NonNullable<LeadTabView["change"]>; base: string }) {
  return (
    <section className={styles.card} aria-labelledby="lead-changed">
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          <h2 id="lead-changed" className={styles.cardTitle}>
            {LEAD_TAB_WORDS.changed}
          </h2>
          <p className={styles.cardLine}>
            {view.namesOff ? RESULT_WORDS.namesOff : view.both > 0 ? answeredBothWords(view.both) : LEAD_TAB_WORDS.noneBoth}
          </p>
        </div>
        <ArrowLink href={`${base}/surveys/${encodeURIComponent(view.surveyId)}`}>{LEAD_TAB_WORDS.seeBeforeAndAfter}</ArrowLink>
      </div>
      {/* People answered both, and nobody answered the questions compared here both times: no row, and the card says so. */}
      {!view.namesOff && view.both > 0 && !view.considering && !view.explaining && (
        <p className={styles.caption}>{LEAD_TAB_WORDS.noneCompared}</p>
      )}
      {view.considering && (
        <div className={styles.measure}>
          <p className={styles.eyebrow}>{LEAD_TAB_WORDS.careerPlans}</p>
          <p className={styles.measureRow}>
            <span className={styles.measureLabel}>{LEAD_TAB_WORDS.considering}</span>
            <span className={styles.measureFigure}>
              <span className={styles.figure}>{`${view.considering.start} → ${view.considering.end}`}</span>
              <span className={styles.figureOf}>{`of ${view.considering.of}`}</span>
            </span>
          </p>
          <p className={styles.measureLine}>{stagesMovedWords(view.considering.up, view.considering.same, view.considering.down)}</p>
        </div>
      )}
      {view.explaining && (
        <div className={styles.measure}>
          <p className={styles.eyebrow}>{LEAD_TAB_WORDS.confidence}</p>
          <p className={styles.measureRow}>
            <span className={styles.measureLabel}>{LEAD_TAB_WORDS.explaining}</span>
            <span className={styles.measureFigure}>
              <span className={styles.figure}>{`${oneDecimalWords(view.explaining.before)} → ${oneDecimalWords(view.explaining.after)}`}</span>
              <span className={styles.figureOf}>{`out of ${view.explaining.max}`}</span>
            </span>
          </p>
          <p className={styles.measureLine}>{ofMovedUpWords(view.explaining.up, view.explaining.of)}</p>
        </div>
      )}
    </section>
  );
}

function Beliefs({ view, base }: { view: LeadTabView; base: string }) {
  if (!view.change) return null;
  return (
    <section className={styles.card} aria-labelledby="lead-beliefs">
      <p className={styles.eyebrow}>{LEAD_TAB_WORDS.beliefs}</p>
      <h3 id="lead-beliefs" className={styles.subTitle}>
        {LEAD_TAB_WORDS.beliefsTitle}
      </h3>
      <p className={styles.cardLine}>{beliefsLineWords(view.programmeKind)}</p>
      <ArrowLink href={`${base}/surveys/${encodeURIComponent(view.change.surveyId)}`}>{LEAD_TAB_WORDS.seeBeliefs}</ArrowLink>
    </section>
  );
}

/** Which view a survey is on, by its stage: the survey about leaving is on End, beside the survey at the end. */
export type LeadStage = "before" | "end" | "followUps";

export const STAGE_KINDS: Record<LeadStage, readonly SurveyKind[]> = {
  before: ["before"],
  end: ["after", "leaving"],
  followUps: ["followUp6", "followUp12"],
};

function Surveys({ view, base, stage }: { view: LeadTabView; base: string; stage: LeadStage }) {
  const rows = view.surveys.filter((survey) => STAGE_KINDS[stage].includes(survey.kind));
  const ratings = stage === "end" && view.links.ratings;
  const anonymousForm = stage === "end" && view.links.anonymousForm;
  return (
    <section className={styles.card} aria-labelledby="lead-surveys">
      <h2 id="lead-surveys" className={styles.cardTitleSmall}>
        {LEAD_TAB_WORDS.surveys}
      </h2>
      <p className={styles.cardLine}>{rows.length > 0 ? LEAD_TAB_WORDS.surveysLine : LEAD_STAGE_WORDS[stage]}</p>
      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map((survey) => (
            <li key={survey.id} className={styles.rowItem}>
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{survey.name}</span>
                <ArrowLink href={`${base}/surveys/${encodeURIComponent(survey.id)}`}>{LEAD_TAB_WORDS.seeResults}</ArrowLink>
              </div>
              <p className={styles.rowLine}>{survey.line}</p>
            </li>
          ))}
        </ul>
      )}
      {(ratings || anonymousForm) && (
        <ul className={`${styles.rows} ${styles.also}`}>
          {ratings && (
            <li className={styles.rowItem}>
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{LEAD_TAB_WORDS.ratingsTitle}</span>
                <ArrowLink href={`${base}/ratings`}>{LEAD_TAB_WORDS.seeRatings}</ArrowLink>
              </div>
              <p className={styles.rowLine}>{LEAD_TAB_WORDS.ratingsLine}</p>
            </li>
          )}
          {anonymousForm && (
            <li className={styles.rowItem}>
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{LEAD_TAB_WORDS.anonymousTitle}</span>
                <ArrowLink href={`${base}/anonymous-feedback`}>{LEAD_TAB_WORDS.seeAnswers}</ArrowLink>
              </div>
              <p className={styles.rowLine}>{LEAD_TAB_WORDS.anonymousLine}</p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function HowItWent({ end }: { end: LeadEnd }) {
  return (
    <section className={styles.card} aria-labelledby="lead-how">
      <div className={styles.cardHead}>
        <h2 id="lead-how" className={styles.cardTitle}>
          {LEAD_TAB_WORDS.howItWent}
        </h2>
        <span className={styles.headCount}>{answersCountWords(end.answers)}</span>
      </div>
      {end.howItWent.map((result) =>
        result.rows.length === 1 && result.rows[0].label === "" ? (
          <ScaleQuestion key={result.id} result={result} />
        ) : (
          <LinesQuestion key={result.id} result={result} />
        ),
      )}
    </section>
  );
}

function SourceRows({ sources }: { sources: RatedSource[] }) {
  return (
    <ul className={styles.sources}>
      {sources.map((source) => (
        <li key={`${source.weekNumber}-${source.title}`} className={styles.source}>
          <span className={styles.sourceWeek}>{`Week ${source.weekNumber}`}</span>
          <span className={styles.sourceTitle}>{source.title}</span>
          <span className={styles.sourceAverage}>{oneDecimalWords(source.average)}</span>
          <span className={styles.sourceCount}>{ratingsCountWords(source.ratings)}</span>
        </li>
      ))}
    </ul>
  );
}

function Weeks({ sources }: { sources: NonNullable<LeadTabView["sources"]> }) {
  return (
    <section className={styles.card} aria-labelledby="lead-weeks">
      <div className={styles.cardHead}>
        <h2 id="lead-weeks" className={styles.cardTitle}>
          {LEAD_TAB_WORDS.weeks}
        </h2>
        <span className={styles.headCount}>{LEAD_TAB_WORDS.outOf5}</span>
      </div>
      <h3 className={styles.subTitle}>{LEAD_TAB_WORDS.sources}</h3>
      <p className={styles.cardLine}>{LEAD_TAB_WORDS.sourcesLine}</p>
      <p className={styles.groupLabel}>{LEAD_TAB_WORDS.highest}</p>
      <SourceRows sources={sources.highest} />
      {sources.lowest.length > 0 && (
        <>
          <p className={styles.groupLabel}>{LEAD_TAB_WORDS.lowest}</p>
          <SourceRows sources={sources.lowest} />
        </>
      )}
    </section>
  );
}

function Facilitators({ line }: { line: LeadFacilitatorLine }) {
  return (
    <section className={styles.card} aria-labelledby="lead-facilitators">
      <div className={styles.cardHead}>
        <h2 id="lead-facilitators" className={styles.cardTitle}>
          {LEAD_TAB_WORDS.facilitators}
        </h2>
        <span className={styles.headCount}>{LEAD_TAB_WORDS.onlyYou}</span>
      </div>
      <p className={styles.note}>
        <Unseen />
        <span>{LEAD_TAB_WORDS.facilitatorsNote}</span>
      </p>
      <ul className={styles.lines}>
        <LineRow row={line.row} max={line.max} />
      </ul>
      <p className={styles.caption}>{facilitatorLineWords(line.question, line.max, line.minLabel, line.maxLabel)}</p>
    </section>
  );
}

function InTheirWords({ end }: { end: LeadEnd }) {
  return (
    <section className={styles.card} aria-labelledby="lead-words">
      <div className={styles.cardHead}>
        <h2 id="lead-words" className={styles.cardTitle}>
          {LEAD_TAB_WORDS.inTheirWords}
        </h2>
        <span className={styles.headCount}>{answersCountWords(end.answers)}</span>
      </div>
      <div className={styles.words}>
        {end.comments.map((question) => {
          const shown = question.comments.slice(0, COMMENTS_SHOWN);
          const rest = question.comments.slice(COMMENTS_SHOWN);
          return (
            <div key={question.id} className={styles.wordsColumn}>
              <div className={styles.wordsHead}>
                <h3 className={styles.subTitle}>{question.title}</h3>
                {question.comments.length > 0 && <span className={styles.headCount}>{shownOfWords(shown.length, question.comments.length)}</span>}
              </div>
              {question.comments.length === 0 ? (
                <p className={styles.cardLine}>{LEAD_TAB_WORDS.noComments}</p>
              ) : (
                <>
                  <ul className={styles.comments}>
                    {shown.map((comment, index) => (
                      <li key={index} className={styles.comment}>
                        {comment}
                      </li>
                    ))}
                  </ul>
                  {rest.length > 0 && (
                    <details className={styles.more}>
                      <summary className={styles.moreSummary}>
                        <span>{seeAllWords(question.comments.length)}</span>
                        <Chevron />
                      </summary>
                      <ul className={styles.comments}>
                        {rest.map((comment, index) => (
                          <li key={index} className={styles.comment}>
                            {comment}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One view's sections. Before and Follow-ups list their stage's surveys; End
 * draws what changed beside its surveys, then how it went beside the weeks,
 * the facilitator line and what people wrote, as the tab drew them before it
 * had views.
 */
export default function LeadSurveysTab({ view, base, stage }: { view: LeadTabView; base: string; stage: LeadStage }) {
  if (stage !== "end") {
    return (
      <div className={styles.tab}>
        <div className={styles.row}>
          <div className={styles.whole}>
            <Surveys view={view} base={base} stage={stage} />
          </div>
        </div>
      </div>
    );
  }
  const end = view.end;
  const how = end !== null && end.howItWent.length > 0;
  return (
    <div className={styles.tab}>
      <div className={styles.row}>
        {view.change && (
          <div className={styles.main}>
            <Changed view={view.change} base={base} />
            <Beliefs view={view} base={base} />
          </div>
        )}
        <div className={view.change ? styles.side : styles.whole}>
          <Surveys view={view} base={base} stage={stage} />
        </div>
      </div>
      {(how || view.sources) && (
        <div className={styles.row}>
          {how && end && (
            <div className={styles.half}>
              <HowItWent end={end} />
            </div>
          )}
          {view.sources && (
            <div className={styles.half}>
              <Weeks sources={view.sources} />
            </div>
          )}
        </div>
      )}
      {end?.facilitator && <Facilitators line={end.facilitator} />}
      {end && end.comments.length > 0 && <InTheirWords end={end} />}
    </div>
  );
}
