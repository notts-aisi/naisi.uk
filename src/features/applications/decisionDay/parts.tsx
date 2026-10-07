import Link from "next/link";
import type { ReactNode } from "react";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import styles from "./decisionDay.module.css";

/**
 * The pieces the pooled applicants page and the decision-day page are both
 * made of. No state and nothing that needs a browser, so they render the same
 * on the server and inside either page's own component.
 */

export type PillTone = "neutral" | "live" | "accent" | "ok" | "danger" | "warn";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "",
  live: styles.pillLive,
  accent: styles.pillAccent,
  ok: styles.pillOk,
  danger: styles.pillDanger,
  warn: styles.pillWarn,
};

/** A small status label. The colour never stands alone: there is always a word. */
export function Pill({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={[styles.pill, PILL_TONE[tone]].filter(Boolean).join(" ")}>
      {dot ? <span className={styles.pillDot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** The page frame: where you are, the title with its chips, and one line under it. */
export function Page({
  title,
  chips,
  lede,
  children,
}: {
  title: string;
  chips: ReactNode;
  lede: string;
  children: ReactNode;
}) {
  return (
    <ApplicationsRoot className={styles.page}>
      <nav className={styles.crumbs} aria-label="Where you are">
        <Link className={styles.crumb} href="/admin/admissions">
          Programmes
        </Link>
      </nav>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.titleChips}>{chips}</div>
        </div>
        <p className={styles.lede}>{lede}</p>
      </header>
      {children}
    </ApplicationsRoot>
  );
}

/**
 * What somebody with a role on the form, and no part in running the term, is
 * shown instead of the page. Said plainly, with somewhere to go.
 */
export function AdminsOnly({ what }: { what: string }) {
  return (
    <ApplicationsRoot className={styles.page}>
      <div className={`${styles.card} ${styles.refusal}`}>
        <h1 className={styles.refusalTitle}>This page is for admins</h1>
        <p className={styles.refusalText}>{what}</p>
        <Link className={styles.quiet} href="/admin/admissions">
          Back to admissions
        </Link>
      </div>
    </ApplicationsRoot>
  );
}
