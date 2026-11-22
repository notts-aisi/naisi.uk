import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupsGoOut from "@/features/applications/groups/GroupsGoOut";
import GroupsViews, { GroupsFrame, groupsViewPath } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import SessionsBoard from "@/features/courses/sessionChange/SessionsBoard";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadSessionsWeek } from "@/lib/courses/sessionChange/view";
import { weekLinkWords } from "@/lib/courses/sessionChange/words";
import { canRunTerm } from "@/lib/applications/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import Link from "next/link";
import roomsStyles from "@/features/courses/weekRooms/WeekRooms.module.css";
import { termRoomsPath, weekRoomsPath } from "@/lib/courses/weekRooms/paths";
import { TO_TERM_ROOMS, TO_WEEK_ROOMS } from "@/lib/courses/weekRooms/words";
import { isAddressableId } from "@/lib/addressableId";
import { archivedSaidWords } from "@/lib/courses/groupArchive/words";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import groupStyles from "@/features/courses/groupPage/GroupPage.module.css";

/**
 * One programme's Groups tab, its Sessions view: one week of the
 * course run the programme names, each group's session in it with its slot,
 * room and facilitators, and "Change a session" with the dialog beside the
 * list. `?week=5` shows another taught week of the run; without it, the week
 * the run is in now.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the tab's other views are. A reviewer is
 * told the tab is the lead's and an admin's. The change route behind the
 * dialog asks again who the caller is on the run (`runStaffingOf`).
 *
 * EACH GROUP'S CAMPUS is set on its card by the same people, through its own
 * route (`.../groups/[groupId]/campus`), which asks the gate again.
 *
 * THE WEEK'S ROOMS AND THE TERM'S ROOMS, every group's room for one week and
 * for the whole term, are linked from here filtered to this programme.
 *
 * AFTER A GROUP IS ARCHIVED from its page, the page comes here with
 * `?archived=<groupId>`, and "Group E is archived. Nobody was emailed." is
 * said only while that group is one of this run's and is archived, read
 * afresh, so a reload after it was restored says nothing.
 *
 * WHEN GROUPS GO OUT is the run's own setting, set here above the sessions
 * by the same people (`GroupsGoOut`, saved through its own route, which asks
 * the gate again).
 */
export default async function ProgrammeSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ week?: string | string[]; archived?: string | string[] }>;
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
      current="sessions"
      pitches={view.pitchingWeek !== null}
      circles={canRunTerm(user)}
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
  const asked = Array.isArray(query.week) ? query.week[0] : query.week;
  const week = asked && /^\d{1,2}$/.test(asked) ? Number(asked) : null;
  const shown = await loadSessionsWeek(db!, run, week, new Date(), user.uid);
  const here = groupsViewPath(view.roundId, view.programmeId, "sessions");
  const link = (n: number | null) => (n === null ? null : { href: `${here}?week=${n}`, label: weekLinkWords(n) });
  // "Group E is archived. Nobody was emailed.", only while it is so.
  const archivedId = Array.isArray(query.archived) ? query.archived[0] : query.archived;
  const archivedSnap = archivedId && isAddressableId(archivedId) ? await db!.collection("courseGroups").doc(archivedId).get() : null;
  const archivedGroup = archivedSnap?.exists ? normalizeCourseGroup(archivedSnap.id, archivedSnap.data() ?? {}) : null;
  const said = archivedGroup && archivedGroup.runId === run.id && archivedGroup.archived ? archivedSaidWords(archivedGroup.name) : null;

  return (
    <GroupsFrame views={views}>
      {said && (
        <p className={groupStyles.said} role="status">
          {said}
        </p>
      )}
      <div className={roomsStyles.toolbar}>
        <Link href={weekRoomsPath(view.roundId, { programme: view.programmeId })} className={roomsStyles.textLink}>
          {TO_WEEK_ROOMS}
        </Link>
        <Link href={termRoomsPath(view.roundId, view.programmeId)} className={roomsStyles.textLink}>
          {TO_TERM_ROOMS}
        </Link>
      </div>
      <GroupsGoOut roundId={view.roundId} programmeId={view.programmeId} initial={run.groupsGoOutOn} />
      <SessionsBoard
        heading={shown.heading}
        previous={link(shown.previous)}
        next={link(shown.next)}
        cards={shown.cards}
        blank={shown.blank}
        campusAt={{ roundId: view.roundId, programmeId: view.programmeId }}
      />
    </GroupsFrame>
  );
}
