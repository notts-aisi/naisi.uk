"use client";

import Link from "next/link";
import ProgressBar from "@/components/ui/ProgressBar";
import Skeleton from "@/components/ui/Skeleton";
import { weekHref } from "../links";
import { useWeek, type WeekSource } from "../useWeek";
import {
  BEFORE_FIRST_SESSION,
  NO_NEW_MATERIAL,
  THIS_WEEK,
  doneWords,
  notUpYetWords,
  openWeekWords,
  weekTitleWords,
} from "@/lib/courses/memberPageWords";
import { dayRangeWords } from "@/lib/courses/sessionChange/words";
import { addDaysToKey, isValidDateKey } from "@/lib/courses/weekPlan";
import { weekDocId } from "@/lib/firestore/courses";
import TickRows, { tickItemsOf } from "./TickRows";
import type { MaterialTicks } from "./useMaterialTicks";
import styles from "./weekly.module.css";

/**
 * "This week" (wk-programme) and "Before your first session" (st-programme):
 * the week the reader is in, its dates, what is done of it, and the way into
 * it. Before the first session the card lists week 1's readings to tick, as
 * the board draws it; once the programme has started it says how much is done
 * and leads to the week.
 *
 * The dates are the week's seven days in the reader's group's own calendar
 * (`slotStartKey`). A week that is not open to the reader yet says when it
 * opens instead of leading to it (C17).
 */

type Props = {
  runId: string;
  variant: "this-week" | "before-first";
  weekNumber: number;
  title: string;
  /** The first day of the week's seven in the reader's own calendar, or null when undated. */
  slotStartKey: string | null;
  countableIds: readonly string[];
  /** The week's page is open to the reader. */
  open: boolean;
  /** "Opens tonight, after your session", for a week that is not open yet. */
  opens: string | null;
  /** A break slot's own name ("Reading week"): no reading of its own. */
  breakLabel?: string | null;
  /** Where the reader's copy of the week lives, for the readings listed before the start. */
  weekSource: WeekSource | null;
  ticks: MaterialTicks;
  showTicks: boolean;
  onTickFailed: () => void;
  className?: string;
};

export default function ThisWeekCard({
  runId,
  variant,
  weekNumber,
  title,
  slotStartKey,
  countableIds,
  open,
  opens,
  breakLabel = null,
  weekSource,
  ticks,
  showTicks,
  onTickFailed,
  className,
}: Props) {
  const listsReadings = variant === "before-first" && open;
  // Only the readings drawn before the start are read here; a learner may not
  // read a week that is not open, and the hook reads nothing for "".
  const week = useWeek(runId, listsReadings ? weekDocId(weekNumber) : "", false, weekSource);
  const dates =
    slotStartKey && isValidDateKey(slotStartKey) ? dayRangeWords(slotStartKey, addDaysToKey(slotStartKey, 6)) : "";
  const done = countableIds.filter((id) => ticks.isDone(id)).length;
  const counted = countableIds.length;
  const known = !ticks.loading && !ticks.error;
  const heading = variant === "before-first" ? BEFORE_FIRST_SESSION : THIS_WEEK;
  const headingId = `this-week-${runId}`;

  return (
    <section
      className={[styles.card, styles.cardTight, className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {heading}
        </h2>
        {known && counted > 0 && open && !breakLabel && <p className={styles.cardCount}>{doneWords(done, counted)}</p>}
      </div>
      {breakLabel ? (
        <>
          <p className={styles.cardSub}>{breakLabel}</p>
          {dates && (
            <p className={styles.cardDates}>
              <span className={styles.cardMeta}>{dates}</span>
            </p>
          )}
          <p className={styles.cardLine}>{NO_NEW_MATERIAL}</p>
        </>
      ) : (
        <>
          <p className={styles.cardSub}>{weekTitleWords(weekNumber, title)}</p>
          {dates && (
            <p className={styles.cardDates}>
              <span className={styles.cardMeta}>{dates}</span>
            </p>
          )}
          {known && counted > 0 && open && (
            <ProgressBar value={done} max={counted} size="md" ariaLabel={doneWords(done, counted)} />
          )}
          {listsReadings && week.status === "loading" && <Skeleton lines={3} height="2.5rem" ariaLabel="Loading the readings…" />}
          {listsReadings && week.status === "ready" && week.week && (
            <TickRows
              items={tickItemsOf(week.week, false)}
              isDone={ticks.isDone}
              canTick={ticks.canTick}
              showTicks={showTicks}
              onTick={(kind, id, next) => {
                void ticks.toggle(kind, id, next).then((ok) => {
                  if (!ok) onTickFailed();
                });
              }}
              open="word"
            />
          )}
          {open ? (
            <div className={listsReadings ? styles.cardFootRule : styles.cardFoot}>
              <Link className={styles.cardLink} href={weekHref(runId, weekNumber)}>
                {openWeekWords(weekNumber)}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : (
            <p className={styles.cardLine}>{opens ?? notUpYetWords(weekNumber)}</p>
          )}
        </>
      )}
    </section>
  );
}
