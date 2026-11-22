import Link from "next/link";
import styles from "./ProgrammeOverview.module.css";

/**
 * THE OVERVIEW'S TWO CARDS ABOUT WORK WAITING ELSEWHERE, each drawn from
 * words the server wrote and nothing else:
 *
 *  - APPLICATIONS TO READ, first on the page while the programme's form
 *    takes or decides applications (`applicationsToReadOn`): the reader's own
 *    count, the line and the way to the Applications tab.
 *  - REQUESTS, after Needs attention, while requests about the programme's
 *    people wait for somebody to decide them: the count, the sentence and
 *    "Open requests", the Requests page narrowed to this programme.
 *
 * Neither is drawn with nothing to say: the page leaves a card out rather
 * than handing it nothing.
 */

export type ApplicationsToReadProps = {
  title: string;
  count: number | null;
  line: string;
  action: { label: string; href: string };
};

export function ApplicationsToReadCard({ title, count, line, action }: ApplicationsToReadProps) {
  return (
    <section className={styles.card} aria-labelledby="overview-to-read">
      <div className={styles.cardHead}>
        <h2 id="overview-to-read" className={styles.cardTitle}>
          {title}
        </h2>
        {count !== null && count > 0 && <span className={styles.countBadge}>{count}</span>}
      </div>
      <p className={styles.frontLine}>{line}</p>
      <Link href={action.href} className={`${styles.buttonLink} ${styles.frontAction}`}>
        {action.label}
      </Link>
    </section>
  );
}

export type RequestsCardProps = {
  title: string;
  count: number;
  line: string;
  action: { label: string; href: string };
};

export function RequestsCard({ title, count, line, action }: RequestsCardProps) {
  return (
    <section className={styles.card} aria-labelledby="overview-requests">
      <div className={styles.cardHead}>
        <h2 id="overview-requests" className={styles.cardTitle}>
          {title}
        </h2>
        <span className={styles.countBadge}>{count}</span>
      </div>
      <p className={styles.frontLine}>{line}</p>
      <Link href={action.href} className={`${styles.buttonLink} ${styles.frontAction}`}>
        {action.label}
      </Link>
    </section>
  );
}

/**
 * A page with no run to show (none named yet, or the one named gone):
 * Applications to read first, then today's state under it. With no card, the
 * state alone, as it always was.
 */
export function BeforeTheRun({ toRead, children }: { toRead: ApplicationsToReadProps | null; children: React.ReactNode }) {
  if (!toRead) return <>{children}</>;
  return (
    <div className={styles.page}>
      <ApplicationsToReadCard {...toRead} />
      {children}
    </div>
  );
}
