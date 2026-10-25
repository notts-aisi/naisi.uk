import Link from "next/link";
import { backToWords, notOpenBody, notOpenTitle } from "@/lib/courses/memberPageWords";
import { londonDateKey } from "@/lib/courses/weekPlan";
import styles from "./weekly.module.css";

/**
 * A week's page before it opens to the reader (C17): what the page says in
 * place of the week, drawn on the server. The week opens straight after the
 * group's previous session, so this says when that is ("It opens tonight,
 * after your session.") and leads back to the programme.
 *
 * No board draws it: its words are in the boards' voice and listed in the
 * build notes for the boards' designers to confirm.
 */

type Props = {
  runId: string;
  weekNumber: number;
  /** "AGI Strategy": where the way back goes. */
  programmeName: string;
  /** The session the week waits on. */
  after: { dateKey: string; startTimeLocal: string };
  now: Date;
};

export default function WeekNotOpen({ runId, weekNumber, programmeName, after, now }: Props) {
  const home = `/learn/${encodeURIComponent(runId)}`;
  const today = londonDateKey(now);
  return (
    <div className={styles.week}>
      <div className={styles.bar}>
        <div className={styles.barStart}>
          <Link href={home} className={styles.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{programmeName}</span>
          </Link>
        </div>
        <div className={styles.barTitle}>Week {weekNumber}</div>
        <div className={styles.barEnd} />
      </div>
      <div className={styles.notOpen}>
        <h1 className={styles.notOpenTitle}>{notOpenTitle(weekNumber)}</h1>
        <p className={styles.cardLine}>{notOpenBody(after, today)}</p>
        <div>
          <Link className={styles.cardLink} href={home}>
            {backToWords(programmeName)}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
