import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import PersonCoursework from "@/features/courses/coursework/PersonCoursework";
import { isAddressableId } from "@/lib/addressableId";
import { loadPersonCoursework } from "@/lib/courses/coursework/load";
import { BACK_TO_COURSEWORK, PERSON_NOT_HERE_TITLE, personNotHereWords } from "@/lib/courses/coursework/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE PERSON'S COURSEWORK on a programme (Zach, Fri 30 Oct), at
 * `.../programmes/[programmeId]/coursework/[uid]`, reached from a name or a
 * cell on the Coursework tab: everything they wrote on the run, newest week
 * first (`PersonCoursework`).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadPersonCoursework`, through
 * `loadProgrammeRun`), decided from the form before the run is read; a
 * reviewer is told it is the lead's and an admin's. The person must hold a
 * place on the programme or facilitate one of its run's groups, or the page
 * says, calmly, that they do not. Their group is shown where this viewer may
 * see the placement. Private notes are read for an admin alone, never for
 * the lead; survey answers never. Nothing here writes.
 *
 * THIS PAGE STANDS ALONE, as a single application does: it is outside the
 * `(tabs)` route group beside it, so it is drawn with no programme head and
 * no tabs, and carries its own way back to the tab.
 *
 * THE COLUMN BESIDE THE WEEKS (`beside`) is where "Notes about this person",
 * which admins alone read and write, will sit. Nothing is handed to it yet.
 */

export const dynamic = "force-dynamic";

export default async function PersonCourseworkPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; uid: string }>;
}) {
  const [{ roundId, programmeId, uid }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db && isAddressableId(uid) ? await loadPersonCoursework(db, user, roundId, programmeId, uid) : null;
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
  return (
    <ApplicationsRoot className={shared.page}>
      <PersonCoursework view={outcome.view} backHref={tabPath} />
    </ApplicationsRoot>
  );
}
