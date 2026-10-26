import Link from "next/link";
import FacilitatorGuideLoader from "@/features/courses/facilitatorGuide/FacilitatorGuideLoader";
import { GUIDE_READERS_LINE } from "@/lib/courses/facilitatorGuide/words";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { weekPreviewPath } from "@/lib/courses/weeksTab/paths";
import type { WeekPage } from "@/lib/courses/weeksTab/weekPage";
import {
  GUIDE_LABEL,
  PREVIEW,
  SAVE_DRAFT,
  SETTINGS_TITLE,
  noPageWords,
  notPublishedWords,
  partlyOnlineWords,
} from "@/lib/courses/weeksTab/words";
import { GroupWeekPaste, WeekModeField, WeekOwnerField, WeekPaste, WeekReady } from "./WeekControls";
import styles from "./weeks.module.css";

/**
 * ONE WEEK'S PAGE ON A PROGRAMME'S WEEKS TAB (board pr-weeks, option B, as
 * Q39 chose): drawn under the list of weeks with this one marked current.
 *
 * In order: the week's title and its seven days; "Paste the week, then check
 * it" (the paste box, Read it, what we found, the things to check, the
 * answers a paste would take out, Save draft, and Copy as Markdown for a week
 * written as blocks); "This week’s settings" (Owner, This week is In person or
 * Online, and the facilitator guide box); then Preview as a fellow and Mark
 * ready, and the line about when written work is due.
 *
 * NOT BUILT, and written down in the build notes: the board's block-by-block
 * fields (a found row opening its block's fields to edit in place) and
 * option C's "Add a block" editor. A week is changed by copying it as
 * Markdown, editing that and pasting it back, which Q39 chose.
 */
export default function WeekPageView({
  page,
  runId,
  roundId,
  programmeId,
  viewer,
}: {
  page: WeekPage;
  runId: string;
  roundId: string;
  programmeId: string;
  /** Who is looking: an admin is also shown the way to the run's week editor. */
  viewer: "admin" | "lead";
}) {
  const { week } = page;
  const heading = page.title ? `Week ${week.weekNumber} · ${page.title}` : `Week ${week.weekNumber}`;
  const partlyOnline = page.groups.filter((group) => group.online).map((group) => group.name);
  return (
    <section className={styles.weekPage} aria-labelledby="week-page-title">
      <header className={styles.weekHead}>
        <h2 id="week-page-title" className={styles.heading}>
          {heading}
        </h2>
        {week.range && <p className={styles.range}>{week.range}</p>}
      </header>

      {page.hasPage ? (
        <WeekPaste runId={runId} weekId={week.weekId} weekNumber={week.weekNumber} blockWeek={page.blockWeek} saveLabel={SAVE_DRAFT} />
      ) : (
        <p className={styles.panelNote}>{noPageWords(week.weekNumber)}</p>
      )}

      <section className={styles.panel} aria-labelledby="week-settings-title">
        <h3 id="week-settings-title" className={styles.subheading}>
          {SETTINGS_TITLE}
        </h3>
        {page.hasPage && page.owners.length > 0 && (
          <WeekOwnerField
            runId={runId}
            weekId={week.weekId}
            owners={page.owners}
            value={(page.owners.find((owner) => owner.uid === page.ownerUid) ?? page.owners.find((owner) => owner.lead) ?? page.owners[0]).uid}
          />
        )}
        <WeekModeField
          runId={runId}
          weekId={week.weekId}
          state={week.online}
          partly={week.online === "some" ? partlyOnlineWords(partlyOnline) : null}
        />
        {page.guide && (
          <div className={styles.setting}>
            <p className={styles.settingLabel}>{GUIDE_LABEL}</p>
            {page.guide.slots && <FacilitatorGuideLoader courseId={page.courseId} slots={page.guide.slots} />}
            <p className={styles.muted}>
              {GUIDE_READERS_LINE}{" "}
              <Link href={page.guide.href} className={styles.inlineLink}>
                {`Open week ${week.weekNumber} of the facilitator guide`}
              </Link>
            </p>
          </div>
        )}
      </section>

      <div className={styles.actions}>
        {page.hasPage && page.blockWeek && (
          <Link href={weekPreviewPath(roundId, programmeId, week.weekId)} className={styles.button}>
            {PREVIEW}
          </Link>
        )}
        {page.hasPage && page.published && <WeekReady runId={runId} weekId={week.weekId} ready={page.ready} />}
      </div>
      {page.hasPage && !page.published && (
        <p className={styles.muted}>
          {notPublishedWords(week.weekNumber)}
          {viewer === "admin" && (
            <>
              {" "}
              <Link href={weekEditorPath(page.courseId, runId, week.weekId)} className={styles.inlineLink}>
                Open the run’s week editor
              </Link>
            </>
          )}
        </p>
      )}
      {page.ready && <p className={styles.done}>{readyLine(week.weekNumber)}</p>}
      <p className={styles.muted}>{`Due dates come from each group’s day: the written answer ${page.due} its session.`}</p>

      {page.hasPage && (
        <GroupWeekPaste
          runId={runId}
          weekId={week.weekId}
          weekNumber={week.weekNumber}
          runBlockWeek={page.blockWeek}
          previewHref={weekPreviewPath(roundId, programmeId, week.weekId)}
          groups={page.groups.map((group) => ({
            id: group.id,
            name: group.name,
            when: group.when,
            copy: group.copy ? { since: group.copy.since ? dayWords(londonDateKey(group.copy.since)) : null, blockWeek: group.copy.blockWeek } : null,
          }))}
        />
      )}
    </section>
  );
}

/** The run's week editor, an admin's, where a week is published. */
function weekEditorPath(courseId: string, runId: string, weekId: string): string {
  return `/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}`;
}

/** What Ready means for this week, said under the press once it is marked. */
function readyLine(weekNumber: number): string {
  return weekNumber === 1 ? "Ready: everyone holding a place can open week 1." : `Week ${weekNumber} is marked ready.`;
}
