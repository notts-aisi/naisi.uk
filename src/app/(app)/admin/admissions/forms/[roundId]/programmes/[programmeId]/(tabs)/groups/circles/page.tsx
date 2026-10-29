import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import Circles from "@/features/applications/circles/Circles";
import { CirclesAreAdmins, CirclesNoRun } from "@/features/applications/circles/CirclesNotes";
import { noRunWords } from "@/features/applications/circles/circlesWords";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import { canRunTerm } from "@/lib/applications/access";
import { loadCircles } from "@/lib/applications/arrange/circles";
import { readPitchingWeek } from "@/lib/courses/pitching/week";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, its Circles view: each of the run's groups as
 * a ring with the people in it now, each person's week against every group's
 * time, and suggestions, with or without Claude, drawn over the groups as a
 * preview (`src/features/applications/circles/Circles.tsx`).
 *
 * AN ADMIN'S ALONE, decided from the form before anybody is read
 * (`loadCircles`): it shows each person's marked week and Claude's earlier
 * read of their application. The programme's lead is told so and pointed to
 * People in groups; a reviewer is told the tab is the lead's and an admin's;
 * the layout of the `(tabs)` group has already drawn "there is no programme
 * here" for somebody with no role on the programme.
 *
 * The page writes nothing. Every change Circles makes goes through the
 * site's own routes, and it then reads the groups again through
 * `/api/admissions/forms/[roundId]/programmes/[programmeId]/circles`.
 */
export default async function ProgrammeCirclesPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadCircles(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  if (outcome.status === "admins-only") {
    return (
      <GroupsFrame views={<GroupsViews roundId={roundId} programmeId={programmeId} current="circles" circles={canRunTerm(user)} />}>
        <CirclesAreAdmins roundId={roundId} programmeId={programmeId} />
      </GroupsFrame>
    );
  }
  const { view } = outcome;
  const pitching = view.runId && db ? await readPitchingWeek(db, view.runId) : null;
  const views = (
    <GroupsViews
      roundId={view.roundId}
      programmeId={view.programmeId}
      current="circles"
      pitches={pitching !== null && pitching !== undefined}
      circles
    />
  );
  return (
    <GroupsFrame views={views}>
      {view.runId ? (
        <Circles initial={view} />
      ) : (
        <CirclesNoRun roundId={view.roundId} programmeId={view.programmeId} sentence={noRunWords(view.programmeShortName)} />
      )}
    </GroupsFrame>
  );
}
