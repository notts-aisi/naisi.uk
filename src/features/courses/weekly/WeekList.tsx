"use client";

import Link from "next/link";
import { weekHref } from "../links";
import { EACH_WEEK_OPENS, WEEK_STATE_WORDS, ofWords, weeksHeading } from "@/lib/courses/memberPageWords";
import type { WeekRow } from "./weekRows";
import styles from "./weekly.module.css";

/**
 * "The 6 weeks" (boards wk-programme, st-programme): every week of the
 * reader's programme with its date and its state. An open week is a link to
 * its page with what is done of it; a week that is not open is not a link,
 * and the next one to open says when it does (C17).
 */

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

const MARK_CLASS: Record<WeekRow["state"], string> = {
  done: `${styles.weekMark} ${styles.weekMarkDone}`,
  current: `${styles.weekMark} ${styles.weekMarkCurrent}`,
  next: `${styles.weekMark} ${styles.weekMarkCurrent}`,
  open: styles.weekMark,
  shut: styles.weekMark,
};

const MARK_WORD: Record<WeekRow["state"], string> = {
  done: WEEK_STATE_WORDS.done,
  current: WEEK_STATE_WORDS.current,
  next: WEEK_STATE_WORDS.next,
  open: WEEK_STATE_WORDS.current,
  shut: WEEK_STATE_WORDS.shut,
};

type Props = {
  runId: string;
  rows: WeekRow[];
  /** Before the first session: the board's line under the weeks. */
  beforeStart: boolean;
  /** The way to the progress page, kept at the foot of the list for somebody taking part. */
  progressHref: string;
  showProgress: boolean;
  className?: string;
};

export default function WeekList({ runId, rows, beforeStart, progressHref, showProgress, className }: Props) {
  if (rows.length === 0) return null;
  return (
    <section className={[styles.card, styles.cardTight, className ?? ""].filter(Boolean).join(" ")} aria-labelledby={`weeks-${runId}`}>
      <div className={styles.cardHead}>
        <h2 id={`weeks-${runId}`} className={styles.cardTitle}>
          {weeksHeading(rows.length)}
        </h2>
      </div>
      <ol className={styles.weekRows} role="list">
        {rows.map((row) => {
          const highlighted = row.state === "current" || row.state === "next";
          const itemClass = [
            styles.weekItem,
            highlighted ? styles.weekItemCurrent : "",
            row.state === "shut" ? styles.weekShut : "",
          ]
            .filter(Boolean)
            .join(" ");
          const dateClass = [
            styles.weekDate,
            row.state === "done" ? styles.weekDateDone : "",
            highlighted ? styles.weekDateCurrent : "",
          ]
            .filter(Boolean)
            .join(" ");
          const inner = (
            <>
              <span className={MARK_CLASS[row.state]} role="img" aria-label={MARK_WORD[row.state]}>
                {row.state === "done" && <Tick />}
              </span>
              <span className={styles.weekText}>
                <span className={styles.weekNames}>
                  <span className={styles.weekName}>Week {row.weekNumber}</span>
                  {row.title && <span className={styles.weekTheme}>{row.title}</span>}
                </span>
                {(row.when || row.opens) && (
                  <span className={styles.weekWhen}>
                    {row.when && <span className={dateClass}>{row.when}</span>}
                    {row.when && row.opens && (
                      <span className={`${styles.weekOpens} ${styles.weekSep}`} aria-hidden="true">
                        {" · "}
                      </span>
                    )}
                    {row.opens && <span className={styles.weekOpens}>{row.opens}</span>}
                  </span>
                )}
              </span>
              <span className={styles.weekSide}>
                {row.state === "next" && <span className={styles.liveChip}>{WEEK_STATE_WORDS.next}</span>}
                {row.of && row.state !== "next" && (
                  <span className={highlighted ? `${styles.weekOf} ${styles.weekOfCurrent}` : styles.weekOf}>
                    {ofWords(row.of.done, row.of.of)}
                  </span>
                )}
                {row.state !== "shut" && <Chevron />}
              </span>
            </>
          );
          return (
            <li key={row.weekNumber} className={styles.weekRow}>
              {row.state === "shut" ? (
                <div className={itemClass}>{inner}</div>
              ) : (
                <Link
                  className={itemClass}
                  href={weekHref(runId, row.weekNumber)}
                  aria-current={highlighted ? "step" : undefined}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {beforeStart && <p className={styles.weeksNote}>{EACH_WEEK_OPENS}</p>}
      {showProgress && (
        <div className={styles.cardFootRule}>
          <Link className={styles.cardLink} href={progressHref}>
            See your progress week by week
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </section>
  );
}
