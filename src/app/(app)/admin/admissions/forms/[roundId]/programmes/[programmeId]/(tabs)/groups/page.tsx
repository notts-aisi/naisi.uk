import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import ArchivedGroupsLine from "@/features/applications/groups/ArchivedGroupsLine";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import PeopleInGroups from "@/features/applications/groups/PeopleInGroups";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadPeopleInGroups } from "@/lib/applications/handover/peopleInGroups";
import { canRunTerm } from "@/lib/applications/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * One programme's Groups tab, its first view: People in groups,
 * the allocation board of the course run the programme names,
 * drawn the way the programme's hub draws it: To place, a column per group
 * with its time, room and facilitators, each card with its degree line and
 * marks, the line over the board, "Publish groups…" leading to Publish's own
 * page, and who gave their place back. The same board and the same routes as
 * the admin's mount under `/admin/courses`: placing people, moving them and
 * taking them off the run, each decided again by its route, from the run
 * (`runStaffingOf`).
 *
 * Under the board, the run's archived groups, each to its page, where it is
 * restored (`ArchivedGroupsLine`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadPeopleInGroups`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's; the layout of the `(tabs)` group has already drawn "there
 * is no programme here" for somebody with no role on the programme.
 */
export default async function ProgrammeGroupsPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadPeopleInGroups(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  const views = (
    <GroupsViews
      roundId={view.roundId}
      programmeId={view.programmeId}
      current="people"
      pitches={view.pitchingWeek !== null}
      circles={canRunTerm(user)}
    />
  );
  if (!view.run) {
    return (
      <GroupsFrame views={views}>
        <RunBlank view={view} />
      </GroupsFrame>
    );
  }
  // The board draws the groups that still meet; an archived one is reached
  // from the line under it, to be restored on its page. One equality, no
  // declared index.
  const archived = db
    ? (await db.collection("courseGroups").where("runId", "==", view.run.id).get()).docs
        .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
        .filter((group) => group.archived && group.runId === view.run?.id)
        .map((group) => ({ id: group.id, name: group.name.trim() || "Untitled group" }))
        .sort((a, b) => a.name.localeCompare(b.name, "en-GB"))
    : [];
  return (
    <>
      <PeopleInGroups view={{ ...view, run: view.run }} views={views} />
      <ArchivedGroupsLine roundId={view.roundId} programmeId={view.programmeId} groups={archived} />
    </>
  );
}
