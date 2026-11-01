import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeeksList from "@/features/applications/weeks/WeeksList";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadWeeksTab } from "@/lib/courses/weeksTab/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Weeks tab (board pr-weeks): when weeks open, "Copy weeks
 * from the course", and every week of the run the programme names, in order,
 * with its state, first session, ready-by day and owner, each a link to the
 * week's own page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the programme's other run tabs are. A
 * reviewer is told the tab is the lead's and an admin's; anybody with no
 * role on the programme is shown there is no programme here (the layout's).
 * A week whose first session has started offers its review to an admin, and
 * says "admins only" to the lead.
 */
export default async function ProgrammeWeeksPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const tab = await loadWeeksTab(db, view.run.id, view.programmeName, user);
  if (!tab) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  return <WeeksList tab={tab} roundId={view.roundId} programmeId={view.programmeId} review={{ viewer: view.viewer, now: new Date() }} />;
}
