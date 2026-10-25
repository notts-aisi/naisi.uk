import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import AllocationBoard from "@/features/courses/AllocationBoard";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, its first view: People in groups, which is the
 * allocation board of the course run the programme names. The same board
 * and the same routes as the admin's mount under `/admin/courses`: placing
 * people, removing them, and Publish with its test and its count. Who may do
 * each is decided again by those routes, from the run (`runStaffingOf`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's; the layout of the `(tabs)` group has already drawn "there
 * is no programme here" for somebody with no role on the programme.
 *
 * The board's link to the run editor is an admin's: a lead adds no groups,
 * and is told an admin does.
 */
export default async function ProgrammeGroupsPage({
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
  return (
    <GroupsFrame views={<GroupsViews roundId={view.roundId} programmeId={view.programmeId} current="people" />}>
      {view.run ? (
        <AllocationBoard
          courseId={view.run.courseId}
          runId={view.run.id}
          runEditorHref={
            view.viewer === "admin"
              ? `/admin/courses/${encodeURIComponent(view.run.courseId)}/runs/${encodeURIComponent(view.run.id)}`
              : null
          }
        />
      ) : (
        <RunBlank view={view} />
      )}
    </GroupsFrame>
  );
}
