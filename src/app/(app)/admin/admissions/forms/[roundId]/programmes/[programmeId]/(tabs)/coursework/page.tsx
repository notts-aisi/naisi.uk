import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import CourseworkTable from "@/features/courses/coursework/CourseworkTable";
import CourseworkWeekPanels from "@/features/courses/courseworkClaude/CourseworkWeekPanels";
import { loadCourseworkTab } from "@/lib/courses/coursework/load";
import { chosenWeek } from "@/lib/courses/coursework/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Coursework tab (Zach, Fri 30 Oct): a row per person holding
 * a place on it, in a group or not yet, and per facilitator of its run's
 * groups, marked as facilitating; a column per week of the run written as
 * blocks; a cell that leads with whether the week is done, by the one
 * meaning of done every page uses, then counts, never anybody's words. A
 * name opens the person's page (`../../coursework/[uid]`, a screen of its
 * own), and the written answer in a cell opens the existing feedback page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadCourseworkTab`, through
 * `loadProgrammeRun`), decided from the form before the run is read. A
 * reviewer is told the tab is the lead's and an admin's; somebody with no
 * role on the programme is told there is no programme here. A placement
 * Publish has not told is shown to admins alone: to the lead that person
 * sits under "Not in a group yet". Private notes and survey answers are
 * never read for the tab. Server-rendered on the Admin SDK; the filters are
 * plain links (`?group=`, `?waiting=1`, `?notdone=1`). Nothing here writes.
 *
 * UNDER THE TABLE, FOR AN ADMIN ALONE, one week at a time (`?week=3`, else
 * the latest week anybody shown has written in): Claude's best answers to it
 * and Pangram on it (`CourseworkWeekPanels`). The programme's lead is drawn
 * neither (privacy v15: what Claude returns is seen by admins only), and both
 * routes refuse the lead too. Each panel asks its own route, behind the same
 * door; Claude and Pangram are sent something only on a press.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeCourseworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[]; waiting?: string | string[]; notdone?: string | string[]; week?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[]; waiting?: string | string[]; notdone?: string | string[]; week?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadCourseworkTab(db, user, roundId, programmeId, query) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Coursework" />;
  if (outcome.status === "blank") return <RunBlank view={outcome.view} />;
  const { view } = outcome;
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/coursework`;
  // The panels sit under a table: none while nobody holds a place or no week has coursework.
  const week = view.counts.holding + view.counts.facilitating > 0 ? chosenWeek(query, view.columns, view.sections) : null;
  // An admin's alone: the programme's lead reads the table and is drawn no panel.
  const panels = week && view.viewer === "admin" ? week : null;
  return (
    <>
      <CourseworkTable view={view} base={base} week={week?.asked ? week.weekNumber : null} />
      {panels && (
        <CourseworkWeekPanels
          roundId={view.roundId}
          programmeId={view.programmeId}
          base={base}
          filter={view.filter}
          columns={view.columns}
          week={panels}
          viewer={view.viewer}
          names={view.names}
        />
      )}
    </>
  );
}
