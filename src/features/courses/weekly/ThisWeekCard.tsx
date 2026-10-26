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
import type { OverviewThisWeek, OverviewThisWeekRow } from "@/app/api/courses/runs/[runId]/overview/route";
import { TASK_DONE, TASK_MARK_WORDS } from "@/lib/courses/memberPageWords";
import { draftStateWords, feedbackFromWords, sentOnWords } from "@/lib/courses/writtenAnswerWords";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { handedTaskDone, handedTasksDone, isCounted } from "@/lib/courses/weekBlocks/progress";
import { NOT_GIVEN_YET, NOT_READY_YET } from "@/lib/courses/packsAndCases/words";
import { blockTickItemsOf } from "../weekBlocks/tickItems";
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
 *
 * A WEEK WRITTEN AS BLOCKS (`thisWeek`) counts by This week's tasks, worked
 * out in `src/lib/courses/weekBlocks/progress.ts`: "0 of 1 done" for week 1.
 * Once the programme has started the card draws the tasks (board
 * wk-programme: "Parts 1 to 3 · Done") where a week written before blocks
 * draws its bar, and before the first session it lists the sources on the
 * path to tick. No bar: the boards draw no percentages for these weeks. A
 * talk's task says the case given ("Shutdown resistance, 2025", or "Not
 * given yet") and "Not ready yet" until the person marks themselves ready.
 */

type Props = {
  runId: string;
  variant: "this-week" | "before-first";
  weekNumber: number;
  title: string;
  /** The first day of the week's seven in the reader's own calendar, or null when undated. */
  slotStartKey: string | null;
  countableIds: readonly string[];
  /** A week written as blocks: its tasks, as the overview hands them. Null on any other week. */
  thisWeek?: OverviewThisWeek | null;
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
  thisWeek = null,
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
  const tasks = (thisWeek?.rows ?? []).filter(
    (row): row is Extract<OverviewThisWeekRow, { type: "task" }> => row.type === "task",
  );
  const byTasks = thisWeek ? handedTasksDone(tasks, ticks.isDone) : null;
  const done = byTasks ? byTasks.done : countableIds.filter((id) => ticks.isDone(id)).length;
  const counted = byTasks ? byTasks.of : countableIds.length;
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
          {known && counted > 0 && open && !thisWeek && (
            <ProgressBar value={done} max={counted} size="md" ariaLabel={doneWords(done, counted)} />
          )}
          {known && open && thisWeek && variant === "this-week" && tasks.length > 0 && (
            <ul className={styles.taskRows} role="list">
              {tasks.map((task, index) => {
                const counted = isCounted(task.needs);
                const taskIsDone = counted && handedTaskDone(task, ticks.isDone);
                return (
                  <li key={index} className={styles.taskRow}>
                    <span
                      className={!counted ? styles.taskMarkNone : taskIsDone ? styles.taskMarkDone : styles.taskMarkOpen}
                      aria-hidden="true"
                    >
                      {taskIsDone && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                    <div className={styles.taskRowBody}>
                      <p className={styles.taskRowLabel}>
                        {counted && (
                          <span className={styles.srOnly}>{taskIsDone ? TASK_MARK_WORDS.done : TASK_MARK_WORDS.notDone}: </span>
                        )}
                        {task.label}
                      </p>
                      {task.talk?.hasCases && <p className={styles.taskRowSub}>{task.talk.caseTitle ?? NOT_GIVEN_YET}</p>}
                      {task.talk && !task.talk.ready && !taskIsDone && <p className={styles.taskRowStatus}>{NOT_READY_YET}</p>}
                      {task.answer ? (
                        // The written answer's own line (wk-programme): "Sent Mon 16 Nov",
                        // then "Feedback from Rahul"; "Draft · 241 words" before it is sent.
                        task.answer.sentOn ? (
                          <p className={styles.taskRowDone}>
                            {sentOnWords(new Date(`${task.answer.sentOn}T12:00:00Z`))}
                            {task.answer.feedbackFrom && (
                              <>
                                {" "}
                                <Link href={`${weekHref(runId, weekNumber)}/feedback`} className={styles.cardLink}>
                                  {feedbackFromWords(task.answer.feedbackFrom)}
                                  <span aria-hidden="true">→</span>
                                </Link>
                              </>
                            )}
                          </p>
                        ) : (
                          // A draft is not done: said plainly, not in the done colour.
                          <p className={styles.cardMeta}>{draftStateWords(task.answer.words)}</p>
                        )
                      ) : (
                        taskIsDone && <p className={styles.taskRowDone}>{TASK_DONE}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {listsReadings && week.status === "loading" && <Skeleton lines={3} height="2.5rem" ariaLabel="Loading the readings…" />}
          {listsReadings && week.status === "ready" && week.week && (
            <TickRows
              items={
                isBlockWeek(week.week)
                  ? blockTickItemsOf(week.week.blocks, Object.assign({}, ...tasks.map((task) => task.packs ?? {})))
                  : tickItemsOf(week.week, false)
              }
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
