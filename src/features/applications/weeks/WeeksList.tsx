import type { ReactNode } from "react";
import Link from "next/link";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import type { WeeksTab, WeeksTabWeek } from "@/lib/courses/weeksTab/load";
import type { WeekPlanView } from "@/lib/courses/weekPlanEdit/view";
import { BREAK_WORD, NO_WEEKS_YET } from "@/lib/courses/weekPlanEdit/words";
import { copyWeeksPath, weekNotesPath, weekReviewPath, weeksPath } from "@/lib/courses/weeksTab/paths";
import {
  COPY_WEEKS,
  NO_OWNER,
  NOTES_LINK,
  REVIEW_ADMINS_ONLY,
  REVIEW_LINK,
  STATE_WORDS,
  WEEKS_IN_ORDER,
  WEEKS_LINE,
  firstSessionWords,
  readyByWords,
  weekWords,
} from "@/lib/courses/weeksTab/words";
import { LeftBehind, MatchPages, PlanAdd, PlanRowControls } from "./WeekPlanControls";
import styles from "./weeks.module.css";
import own from "./weekPlan.module.css";

/**
 * A PROGRAMME'S WEEKS, IN ORDER: the line about when weeks
 * open with "Copy weeks from the course", then one row a week, each a link to
 * the week's page with its state (Ready, Draft, Empty), its first session,
 * the day it should be ready by and its owner, then where the weeks meet.
 *
 * Drawn on the Weeks tab, and above a week's own page with that week marked
 * as the current one (`current`), as the board draws week 3.
 *
 * THE WEEK PLAN, on the tab itself (`plan`, from `loadWeekPlanView`): the
 * breaks take their place in the list with their days, each week and break
 * carries Move up, Move down and Remove… only where the plan's route would
 * take them now, Add a week and Add a break follow the list, and the
 * sentence under it says where the plan stands. Above a week's own page the
 * list is the weeks alone, with no control.
 *
 * REVIEW, for a week whose first session has started: the week's review
 * page, an admin's alone (privacy v15: what Claude returns is seen by admins
 * only). The programme's lead is shown "Review: admins only" there instead,
 * and no way in. NOTES beside it, for both: an admin drafts and saves the
 * week's notes about people there, and the lead reads the saved ones kept
 * for leads.
 *
 * A server component: every word comes from the tab's loader, nothing about
 * anybody but the owner's name.
 */

const TONE: Record<WeeksTabWeek["state"], ChipTone> = { ready: "success", draft: "warning", empty: "neutral" };

export default function WeeksList({
  tab,
  roundId,
  programmeId,
  current = null,
  review = null,
  plan = null,
}: {
  tab: WeeksTab;
  roundId: string;
  programmeId: string;
  /** The week whose page this is drawn above, or null on the tab itself. */
  current?: string | null;
  /** Who is looking, and when: each week whose first session has started offers its review. */
  review?: { viewer: "admin" | "lead"; now: Date } | null;
  /** The run's week plan with its controls, on the tab itself; null above a week's page. */
  plan?: WeekPlanView | null;
}) {
  /** One week's row: a link to its page with its state, first session, ready-by day and owner, then its controls. */
  function weekRow(week: WeeksTabWeek, controls: ReactNode) {
    const here = week.weekId === current;
    return (
      <li key={week.weekId} className={`${styles.row} ${here ? styles.rowCurrent : ""}`}>
        <Link href={weeksPath(roundId, programmeId, week.weekId)} className={styles.rowLink} aria-current={here ? "true" : undefined}>
          <span className={styles.colWeek}>
            <span className={styles.weekName}>{weekWords(week.weekNumber)}</span>
            <Chip tone={TONE[week.state]}>{STATE_WORDS[week.state]}</Chip>
          </span>
          <span className={styles.colFirst}>{firstSessionWords(week.firstSession)}</span>
          <span className={styles.colReadyBy}>{readyByWords(week.readyBy)}</span>
          <span className={styles.colOwner}>
            {week.owner ? (
              <>
                <InitialsChip name={week.owner.name} uid={week.owner.uid} size="sm" />
                <span className={styles.ownerName}>{week.owner.name}</span>
              </>
            ) : (
              NO_OWNER
            )}
          </span>
        </Link>
        {review && week.firstStartsAt && week.firstStartsAt.getTime() <= review.now.getTime() && (
          <>
            {review.viewer === "admin" ? (
              <Link href={weekReviewPath(roundId, programmeId, week.weekId)} className={styles.reviewLink}>
                {REVIEW_LINK}
              </Link>
            ) : (
              <span className={styles.reviewNote}>{REVIEW_ADMINS_ONLY}</span>
            )}
            <Link href={weekNotesPath(roundId, programmeId, week.weekId)} className={styles.reviewLink}>
              {NOTES_LINK}
            </Link>
          </>
        )}
        {controls}
      </li>
    );
  }

  return (
    <div className={styles.stack}>
      <div role="status" className={styles.line}>
        <span className={styles.lineIcon} aria-hidden="true">
          <InfoIcon size={18} />
        </span>
        <p className={styles.lineText}>{WEEKS_LINE}</p>
        <Link href={copyWeeksPath(roundId, programmeId)} className={styles.lineLink}>
          <span>{COPY_WEEKS}</span>
          <ArrowIcon />
        </Link>
      </div>

      <nav aria-label="Weeks" className={styles.card}>
        <p className={styles.eyebrow}>{WEEKS_IN_ORDER}</p>
        {(plan ? plan.entries.length === 0 : tab.weeks.length === 0) ? (
          <p className={styles.note}>
            {NO_WEEKS_YET}
          </p>
        ) : (
          <ol aria-label={WEEKS_IN_ORDER} className={styles.rows}>
            {plan
              ? plan.entries.map((entry) => {
                  if (entry.kind === "break") {
                    return (
                      <li key={`break-${entry.index}`} className={`${styles.row} ${own.rowBreak}`}>
                        <span className={own.breakLine}>
                          <span className={own.breakWord}>{BREAK_WORD}</span>
                          <span className={own.breakLabel}>{entry.label}</span>
                          <span className={own.breakDays}>{entry.range}</span>
                        </span>
                        <PlanRowControls
                          runId={plan.runId}
                          planKey={plan.planKey}
                          index={entry.index}
                          entry={{ kind: "break", label: entry.label }}
                          up={entry.up}
                          down={entry.down}
                          remove={entry.remove}
                          laterWeeks={entry.laterWeeks}
                          anybodyOnRun={plan.anybodyOnRun}
                          upNotices={entry.upNotices}
                          downNotices={entry.downNotices}
                          removeNotices={entry.removeNotices}
                        />
                      </li>
                    );
                  }
                  const week = tab.weeks.find((each) => each.weekNumber === entry.weekNumber);
                  if (!week) return null;
                  return weekRow(
                    week,
                    <PlanRowControls
                      runId={plan.runId}
                      planKey={plan.planKey}
                      index={entry.index}
                      entry={{ kind: "week", weekNumber: entry.weekNumber, title: entry.title, hasPage: entry.hasPage }}
                      up={entry.up}
                      down={entry.down}
                      remove={entry.remove}
                      laterWeeks={entry.laterWeeks}
                      anybodyOnRun={plan.anybodyOnRun}
                      upNotices={entry.upNotices}
                      downNotices={entry.downNotices}
                      removeNotices={entry.removeNotices}
                    />,
                  );
                })
              : tab.weeks.map((week) => weekRow(week, null))}
          </ol>
        )}
        {plan && (
          <>
            {plan.leftBehind.map((page) => (
              <LeftBehind key={page.weekId} runId={plan.runId} planKey={plan.planKey} {...page} />
            ))}
            {plan.matchPages && <MatchPages runId={plan.runId} planKey={plan.planKey} />}
            <PlanAdd runId={plan.runId} planKey={plan.planKey} addWeek={plan.addWeek} addBreak={plan.addBreak} />
            <p className={own.planLine}>{plan.line}</p>
          </>
        )}
        <p className={styles.meets}>
          <span className={styles.meetsIcon} aria-hidden="true">
            <InfoIcon size={16} />
          </span>
          <span>{tab.meets}</span>
        </p>
      </nav>
    </div>
  );
}

function InfoIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
