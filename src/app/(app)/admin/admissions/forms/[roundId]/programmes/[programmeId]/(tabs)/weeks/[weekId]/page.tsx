import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeekPageView from "@/features/applications/weeks/WeekPageView";
import WeeksList from "@/features/applications/weeks/WeeksList";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import ExplainerList from "@/features/courses/explainers/ExplainerList";
import explainerStyles from "@/features/courses/explainers/explainers.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { explainersFromWeek } from "@/lib/courses/explainers/readers";
import { WEEK_EXPLAINER_WORDS } from "@/lib/courses/explainers/words";
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
 *
 * The explainers an admin scheduled from the week's review are listed under
 * the week, for the lead as for an admin: each one's topic (the admin's
 * words), how long, who explains and the sessions it opens. Never the review
 * they came from: the record holds nothing of it.
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
  const tab = await loadWeeksTab(db, view.run.id, view.programmeName, user);
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
  const explainers = await explainersFromWeek(db, user, tab.runId, week.weekNumber, tab.groups);

  return (
    <div className={styles.stack}>
      <WeeksList
        tab={tab}
        roundId={view.roundId}
        programmeId={view.programmeId}
        current={week.weekId}
        review={{ viewer: view.viewer, now: new Date() }}
      />
      <WeekPageView page={page} runId={tab.runId} roundId={view.roundId} programmeId={view.programmeId} viewer={view.viewer} />
      {explainers.length > 0 && (
        <section className={explainerStyles.weekCard} aria-labelledby="week-explainers-title">
          <h3 id="week-explainers-title" className={explainerStyles.weekTitle}>
            {WEEK_EXPLAINER_WORDS.title(week.weekNumber)}
          </h3>
          <ExplainerList rows={explainers} />
          <p className={explainerStyles.hint}>{WEEK_EXPLAINER_WORDS.line}</p>
        </section>
      )}
    </div>
  );
}
