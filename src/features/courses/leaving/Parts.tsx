import Link from "next/link";
import styles from "./Leaving.module.css";

/**
 * The pieces the leaving pages share: the bar at the top (back, and the
 * page's name) and the two icons the boards draw. Rendered on the server.
 */

export function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.icon}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.icon}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** "‹ My programmes   AGI Strategy": where back goes, and what this page is about. */
export function ProgrammeBar({ backHref, backLabel, title }: { backHref: string; backLabel: string; title: string }) {
  return (
    <div className={styles.bar}>
      <div className={styles.barStart}>
        <Link href={backHref} className={styles.back}>
          <ChevronLeft />
          <span>{backLabel}</span>
        </Link>
      </div>
      <div className={styles.barTitle}>{title}</div>
      <div className={styles.barEnd} />
    </div>
  );
}
