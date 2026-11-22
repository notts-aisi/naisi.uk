import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import AllGroups from "@/features/applications/groups/AllGroups";
import GroupsGoOut from "@/features/applications/groups/GroupsGoOut";
import { boardShowOf, withShow } from "@/features/applications/groups/boardShow";
import GroupsViews, { GroupsFrame, groupsPath, groupsViewPath } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import { publishLinkWords } from "@/features/applications/groups/peopleInGroupsWords";
import { ADD_A_GROUP } from "@/lib/courses/groupTimes/words";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadAllGroups } from "@/lib/courses/allGroups/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import Link from "next/link";
import { termRoomsPath, weekRoomsPath } from "@/lib/courses/weekRooms/paths";
import { TO_TERM_ROOMS, TO_WEEK_ROOMS } from "@/lib/courses/weekRooms/words";
import { isAddressableId } from "@/lib/addressableId";
import { archivedSaidWords } from "@/lib/courses/groupArchive/words";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * One programme's Groups tab, its All groups view, at `.../groups/sessions`
 * (the address the view had as Sessions, kept so bookmarks and every link to
 * it still work): "When groups go out" with its control, then the card of
 * groups, one row per live group of the run the programme names, each name
 * opening the group's page, where everything about a group is changed (its
 * time, its room and campus, one week's session, its link, facilitators,
 * places, name and pairs). Above the rows: the week's rooms and the term's
 * rooms, filtered to this programme, and "Add a group", which opens Times' own
 * Add a group, offered only once decisions have gone out, as Times draws it
 * only then. At the foot, the run's archived groups, closed until opened,
 * each with "Restore Group F…" (`AllGroups`, from `loadAllGroups`).
 *
 * NOTHING ABOUT A GROUP IS CHANGED HERE but restoring an archived one,
 * through `PATCH /api/courses/groups/[groupId]/archive`, which asks again.
 * `?week=` (the old view's week) is read no more: an address that carries
 * it opens the view as it is.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the tab's other views are. A reviewer is
 * told the tab is the lead's and an admin's.
 *
 * AFTER A GROUP IS ARCHIVED from its page, the page comes here with
 * `?archived=<groupId>`, and "Group E is archived. Nobody was emailed." is
 * said only while that group is one of this run's and is archived, read
 * afresh; once said, the address loses it, so a reload says nothing.
 *
 * WHEN GROUPS GO OUT is the run's own setting, set here above the groups by
 * the same people (`GroupsGoOut`, saved through its own route, which asks the
 * gate again).
 */
export default async function ProgrammeAllGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ archived?: string | string[]; show?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  // How People in groups was shown when this view was opened from it, carried on by every way back to it.
  const show = boardShowOf(query?.show);
  const views = (
    <GroupsViews
      roundId={view.roundId}
      programmeId={view.programmeId}
      current="sessions"
      pitches={view.pitchingWeek !== null || view.hasTeams}
      show={show}
    />
  );
  const runSnap = view.run && db ? await db.collection("courseRuns").doc(view.run.id).get() : null;
  if (!view.run || !runSnap?.exists) {
    return (
      <GroupsFrame views={views}>
        <RunBlank view={view} />
      </GroupsFrame>
    );
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const now = new Date();
  // "Group E is archived. Nobody was emailed.", only while it is so.
  const archivedId = Array.isArray(query.archived) ? query.archived[0] : query.archived;
  const [groups, archivedSnap] = await Promise.all([
    loadAllGroups(db!, { run, viewer: user, now }),
    archivedId && isAddressableId(archivedId) ? db!.collection("courseGroups").doc(archivedId).get() : Promise.resolve(null),
  ]);
  const archivedGroup = archivedSnap?.exists ? normalizeCourseGroup(archivedSnap.id, archivedSnap.data() ?? {}) : null;
  const said = archivedGroup && archivedGroup.runId === run.id && archivedGroup.archived ? archivedSaidWords(archivedGroup.name) : null;
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;

  return (
    <GroupsFrame
      views={views}
      beside={
        <Link href={withShow(`${groupsPath(view.roundId, view.programmeId)}/publish`, show)} className={shared.btn}>
          {publishLinkWords(view.viewer)}
        </Link>
      }
    >
      <GroupsGoOut roundId={view.roundId} programmeId={view.programmeId} initial={run.groupsGoOutOn} />
      <AllGroups
        roundId={view.roundId}
        programmeId={view.programmeId}
        view={groups}
        said={said}
        links={{
          weekRooms: { href: weekRoomsPath(view.roundId, { programme: view.programmeId }), label: TO_WEEK_ROOMS },
          termRooms: { href: termRoomsPath(view.roundId, view.programmeId), label: TO_TERM_ROOMS },
          // Times' own Add a group, which Times draws only once decisions have gone out: before then, none.
          addGroup: view.decisionsSent ? { href: `${groupsViewPath(view.roundId, view.programmeId, "times")}?add=1`, label: ADD_A_GROUP } : null,
          people: withShow(groupsPath(view.roundId, view.programmeId), show),
          person: `${base}/people`,
        }}
      />
    </GroupsFrame>
  );
}
