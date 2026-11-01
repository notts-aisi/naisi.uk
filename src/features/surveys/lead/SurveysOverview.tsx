import Link from "next/link";
import { cameWords } from "@/lib/courses/attendanceWords";
import type { LeadSurveyRow } from "@/lib/surveys/leadTab";
import type { OverviewWeek, SurveysOverview as Overview } from "@/lib/surveys/leadOverview";
import {
  LEAD_OVERVIEW_WORDS as WORDS,
  answeredOfWords,
  answersOverWeeksWords,
  cardWhenWords,
  besideEachPartWords,
  lastSessionWords,
  namedShareWords,
  noReportsOnWeekWords,
  ofReportsWords,
  oneDecimalWords,
  percentWords,
  readReportsWords,
  reportsAverageWords,
  reportsWeekTitleWords,
  sessionsReportedWords,
  unclearTitleWords,
  weekWords,
  weeksAnswersWords,
} from "@/lib/surveys/words";
import styles from "./analysis.module.css";

/**
 * THE OVERVIEW A PROGRAMME'S SURVEYS TAB OPENS ON: a card
 * for each view, how useful the sessions were and how much of the reading
 * people did, week by week, what was unclear in a chosen week with the
 * facilitators' reports beside it, who came to the sessions, and the week's
 * reports with the way to read them.
 *
 * A Server Component, drawn from the view the server made
 * (`leadSurveysOverview`), which holds totals and the words of a week's parts
 * and nothing about a person or a group. Every link is a page under the
 * programme's own address (`base`), each behind the same gate as this one.
 * The charts are one colour, the theme's accent, with each figure written
 * beside its bar: a week is reported, never marked as good or bad.
 *
 * What the records do not hold yet is left out, not drawn empty: the share
 * who ticked every reading, the team's ratings of written work, a summary of
 * what the reports say and anything booked to explain a week again.
 */

/** A week with nothing to show yet: the register's own dot. */
const NOT_YET = "·";

/** A bar's share, as a width or a height: 0 to 100. */
function share(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
}

/** One of the five cards: the view it opens, what it says and when. */
function Card({ href, eyebrow, figure, line }: { href: string; eyebrow: string; figure: string; line: string }) {
  return (
    <li className={styles.cardItem}>
      <Link href={href} className={styles.viewCard}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <span className={styles.cardFigure}>{figure}</span>
        {line && <span className={styles.cardLine}>{line}</span>}
      </Link>
    </li>
  );
}

/** A survey's card: its row's count and when it closes once it has gone out; "Not sent yet" and when it goes before. */
function surveyCard(row: LeadSurveyRow | null, before: string): { figure: string; line: string } {
  return row ? { figure: answeredOfWords(row.answers, row.of), line: cardWhenWords(row.when) } : { figure: WORDS.notSent, line: before };
}

function Cards({ view, base }: { view: Overview; base: string }) {
  const surveys = `${base}/surveys`;
  const before = surveyCard(view.before, WORDS.beforeWhen);
  const end = surveyCard(view.end, view.lastSession ? lastSessionWords(view.lastSession) : WORDS.endWhen);
  const followUp = surveyCard(view.followUp, WORDS.followUpsWhen);
  return (
    <ul className={styles.cards}>
      <Card href={`${surveys}/before`} eyebrow={WORDS.before} figure={before.figure} line={before.line} />
      <Card
        href={`${surveys}/check-ins`}
        eyebrow={WORDS.checkIns}
        figure={view.checkIns.weeks > 0 ? answersOverWeeksWords(view.checkIns.answers, view.checkIns.weeks) : WORDS.noneYet}
        line={WORDS.everySession}
      />
      <Card
        href={`${surveys}/reports`}
        eyebrow={WORDS.reports}
        figure={view.reported && view.reported.of > 0 ? sessionsReportedWords(view.reported.sessions, view.reported.of) : WORDS.noneYet}
        line={WORDS.everySession}
      />
      <Card href={`${surveys}/end`} eyebrow={WORDS.end} figure={end.figure} line={end.line} />
      <Card href={`${surveys}/follow-ups`} eyebrow={WORDS.followUps} figure={followUp.figure} line={followUp.line} />
    </ul>
  );
}

/** A week's column: its figure on its cap, or the dot for a week not shown, and its name under it. */
type Column = { weekNumber: number; figure: string; height: number } | { weekNumber: number; figure: null; height: 0 };

function Columns({ id, title, scale, columns, caption }: { id: string; title: string; scale: string; columns: Column[]; caption: string[] }) {
  return (
    <section className={styles.card} aria-labelledby={id}>
      <h2 id={id} className={styles.chartTitle}>
        {title} <span className={styles.chartScale}>{scale}</span>
      </h2>
      <ol className={styles.columns}>
        {columns.map((column) => (
          <li key={column.weekNumber} className={styles.column}>
            <span className={styles.srOnly}>{`${weekWords(column.weekNumber)}: ${column.figure ?? WORDS.notShown}`}</span>
            <span className={column.figure === null ? styles.columnDot : styles.columnFigure} aria-hidden="true">
              {column.figure ?? NOT_YET}
            </span>
            <span className={styles.columnPlot} aria-hidden="true">
              {column.figure !== null && <span className={styles.columnFill} style={{ height: `${column.height}%` }} />}
            </span>
            <span className={styles.columnLabel} aria-hidden="true">
              {weekWords(column.weekNumber)}
            </span>
          </li>
        ))}
      </ol>
      {caption.filter(Boolean).map((line) => (
        <p key={line} className={styles.caption}>
          {line}
        </p>
      ))}
    </section>
  );
}

function usefulColumn(week: OverviewWeek): Column {
  return week.useful === null
    ? { weekNumber: week.weekNumber, figure: null, height: 0 }
    : { weekNumber: week.weekNumber, figure: oneDecimalWords(week.useful), height: share(week.useful, 5) };
}

function readingColumn(week: OverviewWeek): Column {
  return week.reading === null
    ? { weekNumber: week.weekNumber, figure: null, height: 0 }
    : { weekNumber: week.weekNumber, figure: percentWords(week.reading.most, week.reading.of), height: share(week.reading.most, week.reading.of) };
}

function Unclear({ view, base }: { view: Overview; base: string }) {
  const unclear = view.unclear;
  if (!unclear) {
    return (
      <section className={styles.card} aria-labelledby="overview-unclear">
        <h2 id="overview-unclear" className={styles.cardTitle}>
          {WORDS.unclearTitle}
        </h2>
        <p className={styles.cardText}>{WORDS.unclearNone}</p>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-labelledby="overview-unclear">
      <div className={styles.cardHead}>
        <h2 id="overview-unclear" className={styles.cardTitle}>
          {unclearTitleWords(unclear.chosen)}
        </h2>
        {unclear.weeks.length > 1 && (
          <nav className={styles.weeks} aria-label={WORDS.chooseWeek}>
            {unclear.weeks.map((week) => {
              const here = week === unclear.chosen;
              return (
                <Link
                  key={week}
                  href={`${base}/surveys?week=${week}`}
                  scroll={false}
                  className={here ? `${styles.week} ${styles.weekCurrent}` : styles.week}
                  aria-current={here ? "page" : undefined}
                >
                  {weekWords(week)}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      {unclear.rows.length === 0 ? (
        <p className={styles.cardText}>{WORDS.nothingUnclear}</p>
      ) : (
        <ul className={styles.bars}>
          {unclear.rows.map((row) => (
            <li key={row.id} className={unclear.reports > 0 ? styles.bar : `${styles.bar} ${styles.barPlain}`}>
              <span className={styles.barLabel}>{row.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${share(row.checkIns, unclear.answered)}%` }} />
              </span>
              <span className={styles.barCount}>{namedShareWords(row.checkIns, unclear.answered)}</span>
              {unclear.reports > 0 && <span className={styles.barReports}>{ofReportsWords(row.reports, unclear.reports)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.caption}>{WORDS.unclearLine}</p>
      {unclear.reports > 0 && <p className={styles.caption}>{besideEachPartWords(unclear.reports)}</p>}
    </section>
  );
}

function Came({ came }: { came: NonNullable<Overview["came"]> }) {
  return (
    <section className={styles.card} aria-labelledby="overview-came">
      <h2 id="overview-came" className={styles.cardTitle}>
        {WORDS.came}
      </h2>
      {came.length === 0 ? (
        <p className={styles.cardText}>{WORDS.nobodyMarked}</p>
      ) : (
        <ul className={styles.came}>
          {came.map((week) => (
            <li key={week.weekNumber} className={styles.cameRow}>
              <span className={styles.cameWeek}>{weekWords(week.weekNumber)}</span>
              <span className={styles.cameCount}>{cameWords(week.came, week.of, week.soFar)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.caption}>{WORDS.cameLine}</p>
    </section>
  );
}

function Reports({ reports, base }: { reports: Overview["reports"]; base: string }) {
  if (!reports) {
    return (
      <section className={styles.card} aria-labelledby="overview-reports">
        <h2 id="overview-reports" className={styles.cardTitle}>
          {WORDS.reports}
        </h2>
        <p className={styles.cardText}>{WORDS.noReports}</p>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-labelledby="overview-reports">
      <div className={styles.reportsRow}>
        <div className={styles.reportsText}>
          <h2 id="overview-reports" className={styles.cardTitle}>
            {reportsWeekTitleWords(reports.weekNumber)}
          </h2>
          <p className={styles.cardText}>
            {reports.reports === 0
              ? noReportsOnWeekWords(reports.weekNumber)
              : reports.how !== null
                ? reportsAverageWords(reports.how)
                : ""}
          </p>
        </div>
        {reports.reports > 0 && (
          <Link href={`${base}/surveys/reports#reports-week-${reports.weekNumber}`} className={styles.button}>
            {readReportsWords(reports.reports)}
          </Link>
        )}
      </div>
    </section>
  );
}

export default function SurveysOverview({ view, base }: { view: Overview; base: string }) {
  const shown = view.weeks.filter((week) => week.answered !== null);
  return (
    <div className={styles.overview}>
      <Cards view={view} base={base} />
      {view.run && (
        <>
          <div className={styles.row}>
            <Columns
              id="overview-useful"
              title={WORDS.useful}
              scale={WORDS.usefulScale}
              columns={view.weeks.map(usefulColumn)}
              caption={[
                shown.length > 0 ? weeksAnswersWords(shown.map((week) => week.answered ?? 0)) : WORDS.noWeekYet,
                shown.length > 0 && shown.length < view.weeks.length ? WORDS.dot : "",
              ]}
            />
            <Columns
              id="overview-reading"
              title={WORDS.reading}
              scale={WORDS.readingScale}
              columns={view.weeks.map(readingColumn)}
              caption={[WORDS.readingFrom, view.weeks.some((week) => week.reading === null) && shown.length > 0 ? WORDS.readingDot : ""]}
            />
          </div>
          <Unclear view={view} base={base} />
          <div className={styles.row}>
            {view.came && <Came came={view.came} />}
            <Reports reports={view.reports} base={base} />
          </div>
        </>
      )}
      <p className={styles.footer}>{WORDS.footer}</p>
    </div>
  );
}
