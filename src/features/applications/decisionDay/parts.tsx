import Link from "next/link";
import type { ReactNode } from "react";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import styles from "./decisionDay.module.css";
import Icon from "./Icon";

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

/** The term's own page, which lists its programmes: where both screens lead back to. */
function termPath(roundId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}`;
}

/**
 * The page frame: where you are, the title with its chips, and one line under
 * it. `aside` is a second, quieter line for something about the person
 * looking and not about the page: that their own application is not on it.
 */
export function Page({
  roundId,
  title,
  chips,
  lede,
  aside = null,
  children,
}: {
  roundId: string;
  title: string;
  chips: ReactNode;
  lede: string;
  aside?: string | null;
  children: ReactNode;
}) {
  return (
    <ApplicationsRoot className={styles.page}>
      <nav className={styles.crumbs} aria-label="Where you are">
        <Link className={styles.crumb} href={termPath(roundId)}>
          Programmes
        </Link>
      </nav>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.titleChips}>{chips}</div>
        </div>
        <p className={styles.lede}>{lede}</p>
        {aside ? (
          <p className={styles.aside}>
            <Icon name="info" size={16} className={styles.noteIcon} />
            <span>{aside}</span>
          </p>
        ) : null}
      </header>
      {children}
    </ApplicationsRoot>
  );
}

/**
 * What somebody with a role on the form, and no part in running the term, is
 * shown instead of the page. Said plainly, with somewhere to go.
 */
export function AdminsOnly({ roundId, what }: { roundId: string; what: string }) {
  return (
    <ApplicationsRoot className={styles.page}>
      <div className={`${styles.card} ${styles.refusal}`}>
        <h1 className={styles.refusalTitle}>This page is for admins</h1>
        <p className={styles.refusalText}>{what}</p>
        <Link className={styles.quiet} href={termPath(roundId)}>
          See this term’s programmes
        </Link>
      </div>
    </ApplicationsRoot>
  );
}
