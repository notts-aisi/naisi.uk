import MemberText from "@/components/ui/MemberText";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import type { RunReportView } from "@/lib/courses/sessionReports/readers";
import { RUN_REPORTS_WORDS, howWords, sentWords } from "@/lib/courses/sessionReports/words";
import styles from "./sessionReport.module.css";

/**
 * ONE SESSION REPORT, READ: its group and writer, the day of its session and
 * when it was sent, then each answer that says something, in the form's
 * order. An answer left empty is left out rather than drawn blank.
 *
 * No directive: drawn on the server from a view the server built for a
 * reader its page has already let read it (the programme's lead and admins,
 * or the writer, of their own). Everything typed is drawn as text
 * (`MemberText`), never as markup.
 */
export default function ReportCard({ report, headingLevel = 3 }: { report: RunReportView; headingLevel?: 3 | 4 }) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const meta = [report.sessionAt ? londonDayLabel(report.sessionAt) : "", sentWords(report.sentAt, report.updatedAt)]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className={styles.card} aria-label={`${report.groupName}, ${report.writerName}`}>
      <div className={styles.cardHead}>
        <Heading className={styles.cardTitle}>
          {report.groupName} · {report.writerName}
        </Heading>
        {meta && <p className={styles.cardMeta}>{meta}</p>}
      </div>
      <dl className={styles.answers}>
        {report.how !== null && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.how}</dt>
            <dd className={styles.answerText}>{howWords(report.how)}</dd>
          </div>
        )}
        {report.wentWell && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.wentWell}</dt>
            <dd className={styles.answerText}>
              <MemberText text={report.wentWell} />
            </dd>
          </div>
        )}
        {report.didnt && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.didnt}</dt>
            <dd className={styles.answerText}>
              <MemberText text={report.didnt} />
            </dd>
          </div>
        )}
        {report.unclear.length > 0 && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.unclear}</dt>
            <dd className={styles.answerText}>
              <ul className={styles.answerList}>
                {report.unclear.map((title, index) => (
                  <li key={`${index}:${title}`} className={styles.answerItem}>
                    {title}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {report.engaged.length > 0 && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.engaged}</dt>
            <dd className={styles.answerText}>
              <ul className={styles.answerList}>
                {report.engaged.map((entry, index) => (
                  <li key={`${index}:${entry.name}`} className={styles.answerItem}>
                    <span className={styles.person}>{entry.name}</span>
                    {entry.note ? <>: {entry.note}</> : null}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {report.notRead.length > 0 && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.notRead}</dt>
            <dd className={styles.answerText}>
              <ul className={styles.answerList}>
                {report.notRead.map((name, index) => (
                  <li key={`${index}:${name}`} className={styles.answerItem}>
                    <span className={styles.person}>{name}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {report.needsHand.length > 0 && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.needsHand}</dt>
            <dd className={styles.answerText}>
              <ul className={styles.answerList}>
                {report.needsHand.map((entry, index) => (
                  <li key={`${index}:${entry.name}`} className={styles.answerItem}>
                    <span className={styles.person}>{entry.name}</span>
                    {entry.note ? <>: {entry.note}</> : null}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {report.forLead && (
          <div className={styles.answer}>
            <dt className={styles.answerName}>{RUN_REPORTS_WORDS.forLead}</dt>
            <dd className={styles.answerText}>
              <MemberText text={report.forLead} />
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
