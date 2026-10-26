import styles from "./WeekOneLine.module.css";

/**
 * Week 1's line for somebody holding a place before groups go out (board
 * st-week1-phone, Q35 B): "Week 1 is open now. You’ll hear your group and
 * when it meets on Wed 28 Oct." Worded on the server from the run's planned
 * day groups go out (`weekOneOpenWords`), and drawn above This week. A status
 * line, so a screen reader hears it with the page.
 */
export default function WeekOneLine({ line }: { line: string }) {
  return (
    <div role="status" className={styles.line}>
      <span className={styles.icon}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5M12 8v.5" />
        </svg>
      </span>
      <p className={styles.text}>{line}</p>
    </div>
  );
}
