import Link from "next/link";
import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import HistoryView from "@/features/applications/weeks/edit/HistoryView";
import WeeksList from "@/features/applications/weeks/WeeksList";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { historyRows } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek } from "@/lib/courses/weekEdit/gate";
import { lockStateFor, readHold, weekLockRef } from "@/lib/courses/weekEdit/lock";
import { weekFingerprint } from "@/lib/courses/weekEdit/model";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { loadWeeksTab } from "@/lib/courses/weeksTab/load";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE WEEK'S HISTORY, ON ITS PROGRAMME'S WEEKS TAB: every save of the week's
 * blocks, newest first (by changing one block, by a paste, by a restore, and
 * the week as it stood before its first save here), each compared with now
 * or with another, and brought back as a new save (`HistoryView`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), as the tab is:
 * a history says who edited the week and when, which is theirs alone. A week
 * that is no taught week of the run's plan goes back to the tab. The list is
 * read here (`historyRows`, editors by first name); comparing and restoring
 * go through the week's history routes, which ask again who the caller is.
 */
export default async function ProgrammeWeekHistoryPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; weekId: string }>;
}) {
  const [{ roundId, programmeId, weekId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const tab = await loadWeeksTab(db, view.run.id, view.programmeName, user);
  if (!tab) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const week = tab.weeks.find((entry) => entry.weekId === weekId);
  if (!week) redirect(weeksPath(view.roundId, view.programmeId));
  const loaded = await loadEditWeek(db, tab.runId, week.weekId);
  if ("status" in loaded) redirect(weeksPath(view.roundId, view.programmeId));

  const now = new Date();
  const fingerprint = weekFingerprint(isBlockWeek(loaded.week) ? loaded.week.blocks : []);
  const [rows, lockSnap] = await Promise.all([
    historyRows(db, tab.runId, week.weekId, fingerprint),
    weekLockRef(db, tab.runId, week.weekId).get(),
  ]);
  const lock = await lockStateFor(db, readHold(lockSnap), user.uid, loaded.weekNumber, now);

  return (
    <div className={styles.stack}>
      <WeeksList
        tab={tab}
        roundId={view.roundId}
        programmeId={view.programmeId}
        current={week.weekId}
        review={{ viewer: view.viewer, now }}
      />
      <Link href={weeksPath(view.roundId, view.programmeId, week.weekId)} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>{`Week ${loaded.weekNumber}`}</span>
      </Link>
      <HistoryView
        runId={tab.runId}
        weekId={week.weekId}
        weekNumber={loaded.weekNumber}
        live={loaded.week.published === true}
        initial={rows}
        lock={lock}
      />
    </div>
  );
}
