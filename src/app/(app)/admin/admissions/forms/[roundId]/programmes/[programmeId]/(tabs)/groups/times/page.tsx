import { CirclesLink } from "@/features/applications/circles/CirclesNotes";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { boardShowOf } from "@/features/applications/groups/boardShow";
import GroupsViews from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import TimesPicture from "@/features/applications/times/TimesPicture";
import { loadTimesPicture } from "@/lib/applications/handover/timesLoad";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, its Times view: the times picture (how many of
 * the people holding a place are free for a whole session at each start
 * time, the best times, and who can make each of the run's groups). Read
 * only: it writes nothing and keeps nothing.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD, decided from the form's settings
 * before anybody's application is read (`loadTimesPicture`). A reviewer is
 * told the tab is the lead's and an admin's. The layout of the `(tabs)`
 * group has already drawn "there is no programme here" for somebody with no
 * role on the programme, in place of this page.
 *
 * `?length=<minutes>` counts sessions of that length: one of the lengths the
 * group editor offers, or one a group of the run already has. Anything else
 * counts the default, which comes from the run's groups.
 *
 * `?add=1` opens Add a group on arrival: All groups' "Add a group" leads
 * here, so the one dialog that adds a group (and checks its name and
 * length) is Times' own.
 *
 * For an admin, a short link under the picture (and before decision day
 * under the sentence that stands in for it) leads to People in groups shown
 * as Rings, where an admin arranges groups: the run's groups as rings, and
 * suggestions drawn over them (`src/features/applications/circles/Circles.tsx`).
 *
 * `?show=rings` is how People in groups was shown when this view was opened
 * from it, carried on by the row of views.
 */
export default async function ProgrammeTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ length?: string | string[]; add?: string | string[]; show?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams,
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadTimesPicture(db, user, roundId, programmeId, query.length) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  return (
    <TimesPicture
      view={view}
      openAdd={(Array.isArray(query.add) ? query.add[0] : query.add) === "1"}
      views={
        <GroupsViews
          roundId={view.roundId}
          programmeId={view.programmeId}
          current="times"
          pitches={view.pitchingWeek !== null || view.hasTeams}
          show={boardShowOf(query?.show)}
        />
      }
      arrange={
        // Arranging with suggestions is an admin's alone: it shows Claude's reads.
        view.viewer === "admin" ? <CirclesLink roundId={view.roundId} programmeId={view.programmeId} /> : null
      }
    />
  );
}
