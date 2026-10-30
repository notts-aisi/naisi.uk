import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import CourseworkTable from "@/features/courses/coursework/CourseworkTable";
import { loadCourseworkTab } from "@/lib/courses/coursework/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Coursework tab (Zach, Fri 30 Oct): a row per person holding
 * a place on it, in a group or not yet, and per facilitator of its run's
 * groups, marked as facilitating; a column per week of the run written as
 * blocks; a cell in counts, never anybody's words. A name opens the person's
 * page (`../../coursework/[uid]`, a screen of its own), and the written
 * answer in a cell opens the existing feedback page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadCourseworkTab`, through
 * `loadProgrammeRun`), decided from the form before the run is read. A
 * reviewer is told the tab is the lead's and an admin's; somebody with no
 * role on the programme is told there is no programme here. A placement
 * Publish has not told is shown to admins alone: to the lead that person
 * sits under "Not in a group yet". Private notes and survey answers are
 * never read for the tab. Server-rendered on the Admin SDK; the filters are
 * plain links (`?group=`, `?waiting=1`). Nothing here writes.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeCourseworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[]; waiting?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[]; waiting?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadCourseworkTab(db, user, roundId, programmeId, query) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Coursework" />;
  if (outcome.status === "blank") return <RunBlank view={outcome.view} />;
  const base = `/admin/admissions/forms/${encodeURIComponent(outcome.view.roundId)}/programmes/${encodeURIComponent(outcome.view.programmeId)}/coursework`;
  return <CourseworkTable view={outcome.view} base={base} />;
}
