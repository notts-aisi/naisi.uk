import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupFacilitators from "@/features/applications/groups/GroupFacilitators";
import { boardShowOf } from "@/features/applications/groups/boardShow";
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
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
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
      pitches={view.pitchingWeek !== null || view.hasTeams}
      show={boardShowOf(query?.show)}
    />
  );
  return (
    <GroupsFrame views={views}>
      {view.run ? <GroupFacilitators runId={view.run.id} /> : <RunBlank view={view} />}
    </GroupsFrame>
  );
}
