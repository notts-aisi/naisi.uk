import type { TermEventRow, TermProgrammeRow, TermView } from "@/lib/surveys/term/model";
import {
  TERM_WORDS,
  atEventsWords,
  consideringWords,
  ofDifferentWords,
  thisTermWords,
  unmatchedWords,
} from "@/lib/surveys/term/words";
import styles from "./termInNumbers.module.css";

/**
 * This term in numbers (board sv-term): the three numbers, then the term's
 * events and its programmes. Drawn on the server from the view the page is
 * handed, which holds counts and words and nothing about a person.
 */
export default function TermInNumbers({ view }: { view: TermView }) {
  return (
    <>
      {view.tiles ? (
        <ul className={styles.tiles}>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>{view.tiles.checkIns}</span>
            <span className={styles.tileLabel}>{TERM_WORDS.checkIns}</span>
            <span className={styles.tileSub}>{atEventsWords(view.tiles.atEvents)}</span>
          </li>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>{view.tiles.people}</span>
            <span className={styles.tileLabel}>{TERM_WORDS.differentPeople}</span>
            {view.tiles.unmatched && <span className={styles.tileSub}>{unmatchedWords(view.tiles.people, view.tiles.cameTwice)}</span>}
          </li>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>{view.tiles.cameTwice}</span>
            <span className={styles.tileLabel}>{TERM_WORDS.cameTwice}</span>
            <span className={styles.tileSub}>{ofDifferentWords(view.tiles.people)}</span>
          </li>
        </ul>
      ) : (
        <p className={`${styles.line} ${styles.nobody}`}>{TERM_WORDS.nobodyCheckedIn}</p>
      )}

      <section className={styles.card} aria-labelledby="term-events">
        <div className={styles.cardHead}>
          <h2 id="term-events" className={styles.cardTitle}>
            {TERM_WORDS.events}
          </h2>
          <span className={styles.count}>{thisTermWords(view.events.length)}</span>
        </div>
        {view.events.length === 0 ? (
          <p className={styles.empty}>{TERM_WORDS.noEvents}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table} aria-labelledby="term-events">
              <thead>
                <tr>
                  <th scope="col" className={styles.colDate}>
                    {TERM_WORDS.date}
                  </th>
                  <th scope="col">{TERM_WORDS.event}</th>
                  <th scope="col" className={styles.colCame}>
                    {TERM_WORDS.came}
                  </th>
                  <th scope="col" className={styles.colAnswers}>
                    {TERM_WORDS.surveyAnswers}
                  </th>
                  <th scope="col" className={styles.colHow}>
                    {TERM_WORDS.howWasIt}
                  </th>
                  <th scope="col" className={styles.colNote}>
                    {TERM_WORDS.note}
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.events.map((row, index) => (
                  <EventRow key={index} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${styles.card} ${styles.cardWithNote}`} aria-labelledby="term-programmes">
        <div className={styles.cardHead}>
          <h2 id="term-programmes" className={styles.cardTitle}>
            {TERM_WORDS.programmes}
          </h2>
          <span className={styles.count}>{thisTermWords(view.programmes.length)}</span>
        </div>
        {view.programmes.length === 0 ? (
          <p className={styles.empty}>{TERM_WORDS.noProgrammes}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table} aria-labelledby="term-programmes">
              <caption className={styles.caption}>{TERM_WORDS.footnote}</caption>
              <thead>
                <tr>
                  <th scope="col">{TERM_WORDS.programme}</th>
                  <th scope="col" className={styles.colStarted}>
                    {TERM_WORDS.started}
                  </th>
                  <th scope="col" className={styles.colFinished}>
                    {TERM_WORDS.finished}
                  </th>
                  <th scope="col" className={styles.colBoth}>
                    {TERM_WORDS.answeredBoth}
                  </th>
                  <th scope="col" className={styles.colConsidering}>
                    {TERM_WORDS.considering}
                  </th>
                  <th scope="col" className={styles.colAfter}>
                    {TERM_WORDS.afterSurvey}
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.programmes.map((row, index) => (
                  <ProgrammeRow key={index} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EventRow({ row }: { row: TermEventRow }) {
  return (
    <tr>
      <td data-label={TERM_WORDS.date}>
        <span className={styles.nowrap}>{row.date}</span>
      </td>
      <th scope="row">{row.title}</th>
      <td data-label={TERM_WORDS.came}>{row.came === null ? <span className={styles.muted}>{row.cameCell}</span> : row.cameCell}</td>
      {row.survey === null ? (
        <td colSpan={2} data-label={TERM_WORDS.surveyAnswers}>
          <span className={styles.muted}>{TERM_WORDS.noSurvey}</span>
        </td>
      ) : (
        <>
          <td data-label={TERM_WORDS.surveyAnswers}>
            {row.survey.sent ? row.survey.answers : <span className={styles.muted}>{row.survey.answers}</span>}
          </td>
          <td data-label={TERM_WORDS.howWasIt}>{row.survey.average}</td>
        </>
      )}
      <td data-label={TERM_WORDS.note}>{row.note && <span className={styles.muted}>{row.note}</span>}</td>
    </tr>
  );
}

function ProgrammeRow({ row }: { row: TermProgrammeRow }) {
  // Before its last session is over, and with nothing to compare yet, "Not yet" stands across the three, as drawn.
  const notYet = row.finished === null && row.answeredBoth === null && row.considering === null;
  return (
    <tr>
      <th scope="row">{row.name}</th>
      <td data-label={TERM_WORDS.started}>{row.started}</td>
      {notYet ? (
        <td colSpan={3} data-label={TERM_WORDS.finished}>
          <span className={styles.muted}>{TERM_WORDS.notYet}</span>
        </td>
      ) : (
        <>
          <td data-label={TERM_WORDS.finished}>
            {row.finished === null ? <span className={styles.muted}>{TERM_WORDS.notYet}</span> : row.finished}
          </td>
          <td data-label={TERM_WORDS.answeredBoth}>{row.answeredBoth ?? ""}</td>
          <td data-label={TERM_WORDS.considering}>
            {row.considering && (
              <span className={styles.nowrap}>{consideringWords(row.considering.start, row.considering.end, row.considering.of)}</span>
            )}
          </td>
        </>
      )}
      <td data-label={TERM_WORDS.afterSurvey}>{row.afterSurvey}</td>
    </tr>
  );
}
