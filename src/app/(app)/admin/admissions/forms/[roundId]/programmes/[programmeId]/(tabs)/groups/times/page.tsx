import { CirclesLink } from "@/features/applications/circles/CirclesNotes";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
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
 * For an admin, a short link under the picture (and before decision day
 * under the sentence that stands in for it) leads to Circles, where groups
 * are arranged: the run's groups as rings, and suggestions drawn over them
 * (`src/features/applications/circles/Circles.tsx`).
 */
export default async function ProgrammeTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ length?: string | string[] }>;
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
      views={
        <GroupsViews
          roundId={view.roundId}
          programmeId={view.programmeId}
          current="times"
          pitches={view.pitchingWeek !== null}
          circles={view.viewer === "admin"}
        />
      }
      arrange={
        // Circles is an admin's alone: it shows marked weeks and Claude's reads.
        view.viewer === "admin" ? <CirclesLink roundId={view.roundId} programmeId={view.programmeId} /> : null
      }
    />
  );
}
