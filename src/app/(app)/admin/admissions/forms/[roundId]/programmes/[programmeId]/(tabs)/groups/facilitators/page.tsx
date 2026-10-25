import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupFacilitators from "@/features/applications/groups/GroupFacilitators";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, its Facilitators view: who facilitates each
 * group of the course run the programme names, and a way to change them,
 * through the routes the run editor's group card uses.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's. The routes behind the view ask again who the caller is on
 * the run (`runStaffingOf`).
 */
export default async function ProgrammeFacilitatorsPage({
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
  const views = (
    <GroupsViews
      roundId={view.roundId}
      programmeId={view.programmeId}
      current="facilitators"
      pitches={view.pitchingWeek !== null}
    />
  );
  return (
    <GroupsFrame views={views}>
      {view.run ? <GroupFacilitators runId={view.run.id} /> : <RunBlank view={view} />}
    </GroupsFrame>
  );
}
