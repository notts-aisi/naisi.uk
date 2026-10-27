"use client";

import Link from "next/link";
import { weekHref } from "../links";
import { READ_AHEAD, WEEK_STATE_WORDS, ofWords, weeksHeading } from "@/lib/courses/memberPageWords";
import type { WeekRow } from "./weekRows";
import styles from "./weekly.module.css";

/**
 * "The 6 weeks" (boards wk-programme, st-programme): every week of the
 * reader's programme with its date and its state. An open week is a link to
 * its page with what is done of it; a week that is not published yet is not
 * a link. Every published week is open, so the reader can read ahead (Zach,
 * 27 October 2026). A week is ticked Done only when it is done: for somebody
 * taking part, once the count beside it is complete (`weekRowsOf`).
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
  notDone: styles.weekMark,
  current: `${styles.weekMark} ${styles.weekMarkCurrent}`,
  next: `${styles.weekMark} ${styles.weekMarkCurrent}`,
  open: styles.weekMark,
  shut: styles.weekMark,
};

const MARK_WORD: Record<WeekRow["state"], string> = {
  done: WEEK_STATE_WORDS.done,
  notDone: WEEK_STATE_WORDS.notDone,
  current: WEEK_STATE_WORDS.current,
  next: WEEK_STATE_WORDS.next,
  open: WEEK_STATE_WORDS.open,
  shut: WEEK_STATE_WORDS.shut,
};

type Props = {
  runId: string;
  rows: WeekRow[];
  /** Before the first session: the line under the weeks that says the reader can read ahead. */
  beforeStart: boolean;
  /** The way to the progress page, kept at the foot of the list for somebody taking part. */
  progressHref: string;
  /** Somebody taking part: what is done of each week, and the way to the progress page. */
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
                {row.when && (
                  <span className={styles.weekWhen}>
                    <span className={dateClass}>{row.when}</span>
                  </span>
                )}
              </span>
              <span className={styles.weekSide}>
                {row.state === "next" && <span className={styles.liveChip}>{WEEK_STATE_WORDS.next}</span>}
                {row.of && showProgress && row.state !== "next" && (
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
      {beforeStart && <p className={styles.weeksNote}>{READ_AHEAD}</p>}
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
