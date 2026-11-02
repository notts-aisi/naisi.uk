import { redirect } from "next/navigation";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import WeekNotesScreen from "@/features/courses/weekNotes/WeekNotesScreen";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadWeekNotes } from "@/lib/courses/weekNotes/store";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE WEEK'S NOTES ABOUT PEOPLE (privacy v15), beside the week's review on a
 * programme's Weeks tab. Decided from the form before the run is read
 * (`loadProgrammeRun`, as the tab is): a reviewer is told the tab is the
 * lead's and an admin's. Then the week's door (`loadWeekNotes`), which asks
 * again:
 *
 *  - AN ADMIN is drawn Claude's drafts and the notes saved from this week,
 *    the counts, and the press that drafts the rest once every group has met;
 *  - THE PROGRAMME'S LEAD is drawn the saved notes kept for leads, read only,
 *    and nothing of any draft: not one, and not how many.
 *
 * Drawing it sends nothing and writes nothing. The presses send their own
 * routes, which refuse anybody but an admin. `?only=drafts` and
 * `?only=suggestions` filter the cards, as plain links.
 */

export const dynamic = "force-dynamic";

export default async function WeekNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; weekId: string }>;
  searchParams?: Promise<{ only?: string | string[] }>;
}) {
  const [{ roundId, programmeId, weekId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { only?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;

  const only = query.only === "drafts" || query.only === "suggestions" ? query.only : null;
  const loaded = await loadWeekNotes(db, user, { roundId: view.roundId, programmeId: view.programmeId, weekId, only }, new Date());
  if (!loaded.ok) {
    if (loaded.status === 404) redirect(weeksPath(view.roundId, view.programmeId));
    return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  }
  const { page } = loaded;
  if (!page.opened.started) {
    return (
      <Refusal title={WEEK_NOTES_WORDS.title(page.opened.weekNumber)} href={weeksPath(view.roundId, view.programmeId, page.opened.weekId)} action={WEEK_NOTES_WORDS.back}>
        {WEEK_NOTES_WORDS.notOpenYet(page.opened.weekNumber)}
      </Refusal>
    );
  }
  return page.viewer === "admin" ? (
    <WeekNotesScreen viewer="admin" view={page.view} roundId={view.roundId} programmeId={view.programmeId} programmeName={view.programmeName} />
  ) : (
    <WeekNotesScreen viewer="lead" view={page.view} roundId={view.roundId} programmeId={view.programmeId} programmeName={view.programmeName} />
  );
}
