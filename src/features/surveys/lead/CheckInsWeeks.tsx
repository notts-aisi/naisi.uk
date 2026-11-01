import Link from "next/link";
import type { AdminCheckInRow, ProgrammeCheckIns } from "@/lib/surveys/checkIns/leadView";
import { COMMENTS_FROM, TOTALS_FROM, type LeadCheckInWeek, type LeadWeekComments } from "@/lib/surveys/checkIns/model";
import {
  CHECK_INS_TAB_WORDS as WORDS,
  checkInLinkLabel,
  checkInsTabLine,
  commentsFromWords,
  groupCheckInWords,
  outOfFive,
  readingShareWords,
  weekTooFewWords,
} from "@/lib/surveys/checkIns/words";
import { answeredOfWords, namedShareWords, seeAllWords, shownOfWords, weekWords } from "@/lib/surveys/words";
import styles from "./analysis.module.css";

/**
 * THE CHECK-INS VIEW OF A PROGRAMME'S SURVEYS TAB, for its lead and admins:
 * each week that has begun, newest first, with every group's check-ins
 * together. A Server Component, drawn from what the server made
 * (`readProgrammeCheckIns`).
 *
 * What a week says follows its floors, decided on the server
 * (`leadWeekOf`): nothing until every group's check-in that week has closed;
 * below three answers how many answered and why nothing more shows; from
 * three the averages, the share who did most or all of the reading and what
 * was unclear; from five what people wrote, in the order of their words.
 * Never a group's own figure and never a name.
 *
 * An admin also has each group's check-in under its week (`rows`, which the
 * server makes only for an admin): how many answered it, and the way to its
 * Results and Who answered on the admins' own pages, where one person's
 * answers open only once the opening is recorded.
 */

/** Comments shown before "See all". */
const COMMENTS_SHOWN = 5;

function Comments({ question }: { question: LeadWeekComments }) {
  const shown = question.comments.slice(0, COMMENTS_SHOWN);
  const rest = question.comments.slice(COMMENTS_SHOWN);
  return (
    <div className={styles.wordsColumn}>
      <h4 className={styles.wordsTitle}>
        {question.title}
        {question.comments.length > 0 && <span className={styles.groupState}>{` ${shownOfWords(shown.length, question.comments.length)}`}</span>}
      </h4>
      {question.comments.length === 0 ? (
        <p className={styles.cardText}>{WORDS.noComments}</p>
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
              <summary className={styles.moreSummary}>{seeAllWords(question.comments.length)}</summary>
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
}

function Shown({ week }: { week: Extract<LeadCheckInWeek, { state: "shown" }> }) {
  const { totals } = week;
  return (
    <>
      <dl className={styles.figures}>
        {totals.useful !== null && (
          <div className={styles.figureItem}>
            <dt className={styles.figureName}>{WORDS.useful}</dt>
            <dd className={styles.figureValue}>{outOfFive(totals.useful)}</dd>
          </div>
        )}
        {totals.confident !== null && (
          <div className={styles.figureItem}>
            <dt className={styles.figureName}>{WORDS.confident}</dt>
            <dd className={styles.figureValue}>{outOfFive(totals.confident)}</dd>
          </div>
        )}
        {totals.reading && (
          <div className={styles.figureItem}>
            <dt className={styles.figureName}>{WORDS.reading}</dt>
            <dd className={styles.figureValue}>{readingShareWords(totals.reading.most, totals.reading.of)}</dd>
          </div>
        )}
      </dl>
      <h3 className={styles.subTitle}>{WORDS.unclear}</h3>
      {totals.unclear.length === 0 ? (
        <p className={styles.cardText}>{WORDS.nothingUnclear}</p>
      ) : (
        <ul className={styles.bars}>
          {totals.unclear.map((part) => (
            <li key={part.id} className={`${styles.bar} ${styles.barPlain}`}>
              <span className={styles.barLabel}>{part.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${week.answered > 0 ? Math.min(100, (part.count / week.answered) * 100) : 0}%` }} />
              </span>
              <span className={styles.barCount}>{namedShareWords(part.count, week.answered)}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className={styles.subTitle}>{WORDS.inTheirWords}</h3>
      {week.comments === null ? (
        <p className={styles.cardText}>{commentsFromWords(COMMENTS_FROM)}</p>
      ) : (
        <div className={styles.words}>
          {week.comments.map((question) => (
            <Comments key={question.id} question={question} />
          ))}
        </div>
      )}
    </>
  );
}

function GroupRows({ weekNumber, rows }: { weekNumber: number; rows: AdminCheckInRow[] }) {
  return (
    <div className={styles.adminRows}>
      <h3 className={styles.chartTitle}>{WORDS.groups}</h3>
      <p className={styles.adminLine}>{WORDS.groupsLine}</p>
      <ul className={styles.groupList}>
        {rows.map((row) => {
          const survey = `/admin/surveys/${encodeURIComponent(row.id)}`;
          return (
            <li key={row.id} className={styles.groupRow}>
              <span className={styles.groupText}>
                {`${groupCheckInWords(row.groupName, row.startsAt)} · ${answeredOfWords(row.answered, row.of)} · `}
                <span className={styles.groupState}>{row.open ? WORDS.open : WORDS.closed}</span>
              </span>
              <span className={styles.groupLinks}>
                <Link href={`${survey}/results`} className={styles.adminLink} aria-label={checkInLinkLabel(WORDS.results, row.groupName, weekNumber)}>
                  {WORDS.results}
                </Link>
                <Link
                  href={`${survey}/answered`}
                  className={styles.adminLink}
                  aria-label={checkInLinkLabel(WORDS.whoAnswered, row.groupName, weekNumber)}
                >
                  {WORDS.whoAnswered}
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Week({ week, rows }: { week: LeadCheckInWeek; rows: AdminCheckInRow[] | null }) {
  const id = `check-ins-week-${week.weekNumber}`;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <div className={styles.weekHead}>
        <h2 id={id} className={styles.cardTitle}>
          {weekWords(week.weekNumber)}
        </h2>
        {week.state === "shown" && <span className={styles.headCount}>{answeredOfWords(week.answered, week.of)}</span>}
      </div>
      {week.state === "waiting" && <p className={styles.cardText}>{WORDS.waiting}</p>}
      {week.state === "none" && <p className={styles.cardText}>{WORDS.none}</p>}
      {week.state === "too-few" && <p className={styles.cardText}>{weekTooFewWords(week.answered, week.of, TOTALS_FROM)}</p>}
      {week.state === "shown" && <Shown week={week} />}
      {rows && rows.length > 0 && <GroupRows weekNumber={week.weekNumber} rows={rows} />}
    </section>
  );
}

export default function CheckInsWeeks({ view }: { view: ProgrammeCheckIns }) {
  const weeks = view.weeks.filter((week) => view.begun.includes(week.weekNumber)).reverse();
  return (
    <div className={styles.weeksList}>
      <p className={styles.footer}>{checkInsTabLine(TOTALS_FROM, COMMENTS_FROM)}</p>
      {weeks.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.cardText}>{WORDS.nothingYet}</p>
        </section>
      ) : (
        weeks.map((week) => <Week key={week.weekNumber} week={week} rows={view.groups?.get(week.weekNumber) ?? null} />)
      )}
    </div>
  );
}
