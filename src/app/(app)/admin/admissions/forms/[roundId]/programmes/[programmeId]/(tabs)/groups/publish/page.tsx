import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import PublishGroups from "@/features/applications/groups/PublishGroups";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, Publish's own page (board st-publish), reached
 * from People in groups' "Publish groups…": who a press emails, the last
 * test, "Send a test to me" and "Publish and send 37 emails", as the run's
 * allocation board has always drawn them, through the same routes. Who may
 * press is decided again by those routes, from the run (`runStaffingOf`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the tab's other views are. A reviewer
 * is told the tab is the lead's and an admin's.
 */
export default async function ProgrammePublishPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  return (
    <PublishGroups
      runId={view.run.id}
      roundId={view.roundId}
      programmeId={view.programmeId}
      programmeName={view.programmeName}
    />
  );
}
