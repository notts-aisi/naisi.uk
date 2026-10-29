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

/**
 * One programme's Groups tab, its Sessions view (wk-session): one week of the
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
 * WHEN GROUPS GO OUT is the run's own setting, set here above the sessions
 * by the same people (`GroupsGoOut`, saved through its own route, which asks
 * the gate again).
 */
export default async function ProgrammeSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
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

  return (
    <GroupsFrame views={views}>
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
