import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeekPageView from "@/features/applications/weeks/WeekPageView";
import WeeksList from "@/features/applications/weeks/WeeksList";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { facilitatorGuideReader, facilitatorGuideWriter } from "@/lib/courses/facilitatorGuide/access";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { loadWeeksTab } from "@/lib/courses/weeksTab/load";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { loadWeekPage, weekGuideBox } from "@/lib/courses/weeksTab/weekPage";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE WEEK OF A PROGRAMME'S RUN, ON ITS WEEKS TAB (board pr-weeks): the list
 * of weeks with this one marked current, and below it the week's own page,
 * where its Markdown is pasted and checked, its owner chosen, how it meets
 * set, its facilitator guide loaded, and it is previewed as a fellow reads it
 * and marked ready.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), as the tab is.
 * `weekId` must be a taught week of the run's plan ("w03"): anything else
 * goes back to the tab. Every control on the page sends its own route, which
 * asks again who the caller is.
 *
 * The facilitator guide box reads the course's guide here, after the guide's
 * own gate (`facilitatorGuideReader`): the titles loaded in the week's two
 * places, and the box itself only for whom `facilitatorGuideWriter` admits.
 */
export default async function ProgrammeWeekPage({
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
  const tab = await loadWeeksTab(db, view.run.id, view.programmeName);
  if (!tab) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const week = tab.weeks.find((entry) => entry.weekId === weekId);
  if (!week) redirect(weeksPath(view.roundId, view.programmeId));
  // The facilitator guide box, behind the guide's own gates: titles only for
  // whom the reader admits, the paste box only for whom the writer admits.
  const [reader, writer] = await Promise.all([
    facilitatorGuideReader(db, user, tab.courseId),
    facilitatorGuideWriter(db, user, tab.courseId),
  ]);
  const loadedWeeks = reader && writer ? (await readGuideIndex(db, reader)).weeks : [];
  const guide = weekGuideBox(tab.courseId, week.weekNumber, { reads: reader !== null, loads: writer !== null }, loadedWeeks);
  const page = await loadWeekPage(db, tab, week, guide);

  return (
    <div className={styles.stack}>
      <WeeksList tab={tab} roundId={view.roundId} programmeId={view.programmeId} current={week.weekId} />
      <WeekPageView page={page} runId={tab.runId} roundId={view.roundId} programmeId={view.programmeId} viewer={view.viewer} />
    </div>
  );
}
