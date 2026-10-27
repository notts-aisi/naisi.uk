import type { ReactNode } from "react";
import type { EventResultsHead as Head } from "@/lib/surveys/events/adminView";
import adminStyles from "./surveyAdmin.module.css";
import styles from "./eventSurvey.module.css";

/**
 * The numbers above a survey after an event's results (sv-results): how many
 * answered and how, how many came, and how many of the people it was emailed
 * to answered it. Counts, never a name.
 */
export default function EventResultsHead({ head }: { head: Head }) {
  return (
    <ul className={styles.stats} aria-label="The survey in numbers">
      <li className={styles.stat}>
        <span className={styles.statNumber}>{head.answers}</span>
        <span className={styles.statLabel}>Answers</span>
        <span className={styles.statSub}>{head.answersLine}</span>
      </li>
      <li className={styles.stat}>
        <span className={styles.statNumber}>{head.came}</span>
        <span className={styles.statLabel}>Came</span>
        <span className={styles.statSub}>{head.cameLine}</span>
      </li>
      <li className={styles.stat}>
        <span className={styles.statNumber}>{head.emailRate || "None yet"}</span>
        <span className={styles.statLabel}>Answered the email</span>
        {head.emailLine && <span className={styles.statSub}>{head.emailLine}</span>}
      </li>
    </ul>
  );
}

/**
 * The results beside an aside (sv-results): the logged download, and who sees
 * them (Q42: admins only; the organiser is sent a summary).
 */
export function EventResultsLayout({ who, download, children }: { who: string; download: ReactNode; children: ReactNode }) {
  return (
    <div className={adminStyles.layout}>
      {children}
      <aside className={adminStyles.aside}>
        {download && (
          <section className={`${adminStyles.card} ${adminStyles.section} ${styles.download}`} aria-labelledby="results-download">
            <h2 id="results-download" className={adminStyles.cardTitle}>
              Download
            </h2>
            {download}
          </section>
        )}
        <section className={`${adminStyles.card} ${adminStyles.section}`} aria-labelledby="results-who">
          <h2 id="results-who" className={adminStyles.cardTitle}>
            Who sees this
          </h2>
          <p className={adminStyles.muted}>{who}</p>
        </section>
      </aside>
    </div>
  );
}
