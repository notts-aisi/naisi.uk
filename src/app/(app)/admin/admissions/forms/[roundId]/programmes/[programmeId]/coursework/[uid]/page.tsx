import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import ReadingView, { NoWeekToRead } from "@/features/courses/coursework/ReadingView";
import PersonBeside from "@/features/courses/courseworkClaude/PersonBeside";
import { isAddressableId } from "@/lib/addressableId";
import { loadPersonCoursework } from "@/lib/courses/coursework/load";
import {
  BACK_TO_COURSEWORK,
  FACILITATING,
  NOT_IN_A_GROUP_YET,
  NOT_TOLD_YET,
  PERSON_NOT_HERE_TITLE,
  personNotHereWords,
} from "@/lib/courses/coursework/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE PERSON'S WEEK ON A PROGRAMME (the reading view, Fri 13 Nov 2026), at
 * `.../programmes/[programmeId]/coursework/[uid]?week=N`, reached from a
 * name or a cell on the Coursework tab, from the group's page and from the
 * review page: one week of everything they did (`ReadingView`), with the way
 * to the previous and next person of their section of the tab and to the
 * previous and next week. With no week named it opens the newest week they
 * have anything in, else the newest that has begun for them.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadPersonCoursework`, through
 * `loadProgrammeRun`), decided from the form before the run is read, as it
 * always was; a reviewer is told it is the lead's and an admin's. The person
 * must hold a place on the programme or facilitate one of its run's groups,
 * or the page says, calmly, that they do not. Everything about the week is
 * read by the loader the facilitator's side shares (`readPersonWeek`), behind
 * the readers every page asks: private notes for an admin alone here, never
 * the lead; ratings for the team for an admin or the lead on work they may
 * review; Claude's draft grade and the sealed prediction's row for an admin
 * alone. Nothing here writes.
 *
 * THIS PAGE STANDS ALONE, as a single application does: it is outside the
 * `(tabs)` route group beside it, so it is drawn with no programme head and
 * no tabs, and carries its own way back to the tab.
 *
 * THE COLUMN FOR WHAT THE TEAM KEEPS ABOUT A PERSON (`beside`,
 * `PersonBeside`), under the week: for an admin (privacy v13), notes about
 * this person written from this run, "Draft a note with Claude" and Pangram
 * on their answers; for the programme's lead (privacy v15), only the notes
 * kept for admins and the programme's leads, and the lead's own, through the
 * programme's route, which asks the lead's place again. Never Claude or
 * Pangram for the lead, and nothing at all on the lead's own page.
 */

export const dynamic = "force-dynamic";

export default async function PersonCourseworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; uid: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const [{ roundId, programmeId, uid }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { week?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db && isAddressableId(uid) ? await loadPersonCoursework(db, user, roundId, programmeId, uid, query.week ?? null) : null;
  const tabPath = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework`;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Coursework" />;
  if (outcome.status === "blank") {
    return (
      <ApplicationsRoot className={shared.page}>
        <RunBlank view={outcome.view} />
      </ApplicationsRoot>
    );
  }
  if (outcome.status === "not-here") {
    return (
      <Refusal title={PERSON_NOT_HERE_TITLE} href={tabPath} action={`Go to ${BACK_TO_COURSEWORK}`}>
        {personNotHereWords(outcome.programmeName)}
      </Refusal>
    );
  }
  const { view } = outcome;
  const viewer = view.viewer === "admin" ? "admin" : "lead";
  // The lead's own page has nothing beside it: notes about somebody are never shown to them.
  const beside =
    viewer === "lead" && view.self ? null : (
      <PersonBeside
        roundId={view.roundId}
        programmeId={view.programmeId}
        runId={view.runId}
        uid={view.person.uid}
        name={view.person.name}
        viewer={viewer}
        self={view.self}
      />
    );
  return (
    <ApplicationsRoot className={shared.page}>
      {outcome.status === "no-weeks" ? (
        // A run with no week written as blocks: the person, and the column beside them, as ever.
        <NoWeekToRead
          name={outcome.view.person.name}
          eyebrow={[outcome.view.programmeName, outcome.view.person.groupName ?? NOT_IN_A_GROUP_YET].filter(Boolean).join(" · ")}
          marks={[...(outcome.view.person.facilitating ? [FACILITATING] : []), ...(outcome.view.person.notToldYet ? [NOT_TOLD_YET] : [])]}
          crumb={outcome.view.crumb}
          beside={beside}
        />
      ) : (
        <ReadingView view={outcome.view} beside={beside} />
      )}
    </ApplicationsRoot>
  );
}
