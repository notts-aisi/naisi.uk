import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { boardShowOf } from "@/features/applications/groups/boardShow";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import PeopleInGroups from "@/features/applications/groups/PeopleInGroups";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadPeopleInGroups } from "@/lib/applications/handover/peopleInGroups";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

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
 * The run's archived groups are not drawn here: they are at the foot of the
 * tab's All groups view, each with Restore and the way to its page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadPeopleInGroups`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's; the layout of the `(tabs)` group has already drawn "there
 * is no programme here" for somebody with no role on the programme.
 *
 * SHOWN AS COLUMNS OR RINGS: `?show=rings` draws the same board as rings, one
 * round each group's time (the drawing Circles had), and anything else, no
 * choice included, draws Columns (`boardShowOf`). The choice is kept in the
 * address and nowhere else, and the tab's row of views carries it on. What
 * Rings shows of when each person is free comes to the browser through the
 * person's panel's one gated read, never through this page: the page hands
 * the board the same facts for both, and no week.
 */
export default async function ProgrammeGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
  const show = boardShowOf(query?.show);
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
      pitches={view.pitchingWeek !== null || view.hasTeams}
      show={show}
    />
  );
  if (!view.run) {
    return (
      <GroupsFrame views={views}>
        <RunBlank view={view} />
      </GroupsFrame>
    );
  }
  return <PeopleInGroups view={{ ...view, run: view.run }} views={views} show={show} />;
}
