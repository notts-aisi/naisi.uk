import Link from "next/link";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import type { WeeksTab, WeeksTabWeek } from "@/lib/courses/weeksTab/load";
import { copyWeeksPath, weeksPath } from "@/lib/courses/weeksTab/paths";
import {
  COPY_WEEKS,
  NO_OWNER,
  STATE_WORDS,
  WEEKS_IN_ORDER,
  WEEKS_LINE,
  firstSessionWords,
  readyByWords,
  weekWords,
} from "@/lib/courses/weeksTab/words";
import styles from "./weeks.module.css";

/**
 * A PROGRAMME'S WEEKS, IN ORDER (board pr-weeks): the line about when weeks
 * open with "Copy weeks from the course", then one row a week, each a link to
 * the week's page with its state (Ready, Draft, Empty), its first session,
 * the day it should be ready by and its owner, then where the weeks meet.
 *
 * Drawn on the Weeks tab, and above a week's own page with that week marked
 * as the current one (`current`), as the board draws week 3.
 *
 * NOT DRAWN: the board's drag handles and "Move week up / down". Reordering a
 * run's weeks once it is out of draft is an admin's, in the run's editor, and
 * the tab offers no control for it (listed in the build notes).
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
}: {
  tab: WeeksTab;
  roundId: string;
  programmeId: string;
  /** The week whose page this is drawn above, or null on the tab itself. */
  current?: string | null;
}) {
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
        {tab.weeks.length === 0 ? (
          <p className={styles.note}>The run has no weeks in its plan yet. An admin adds them in the run’s editor.</p>
        ) : (
          <ol aria-label={WEEKS_IN_ORDER} className={styles.rows}>
            {tab.weeks.map((week) => {
              const here = week.weekId === current;
              return (
                <li key={week.weekId} className={`${styles.row} ${here ? styles.rowCurrent : ""}`}>
                  <Link
                    href={weeksPath(roundId, programmeId, week.weekId)}
                    className={styles.rowLink}
                    aria-current={here ? "true" : undefined}
                  >
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
                </li>
              );
            })}
          </ol>
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
