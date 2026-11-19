import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import PersonPage from "@/features/courses/personPage/PersonPage";
import { loadTeamPersonPage } from "@/lib/courses/personPage/load";
import { BACK_TO_PEOPLE, PERSON_NOT_HERE, PERSON_NOT_HERE_TITLE } from "@/lib/courses/personPage/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE PERSON ON A PROGRAMME, FOR THE TEAM (Wed 18 Nov 2026), at
 * `.../programmes/[programmeId]/people/[uid]`, reached from their name on the
 * People tab and on the Coursework tab: their coursework week by week, their
 * attendance as counts, the feedback they were given, the notes the team
 * keeps, their application, Move, and for an admin their events and
 * activity.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadTeamPersonPage`, through
 * `loadProgrammeRun`), decided from the form before anybody is read; a
 * reviewer is told it is the lead's and an admin's, and anybody with no role
 * on the programme is told there is no programme here. Somebody who is not a
 * row of the People tab for this reader, whether or not they exist, gets one
 * calm answer. Each section is read only for a reader who may see it (see
 * the loader). Nothing here writes: Move is its own page, and the notes write
 * through their own routes.
 *
 * THIS PAGE STANDS ALONE, outside the `(tabs)` route group beside it, as the
 * Move page beside it does, and carries its own way back.
 */

export const dynamic = "force-dynamic";

export default async function TeamPersonPage({ params }: { params: Promise<{ roundId: string; programmeId: string; uid: string }> }) {
  const [{ roundId, programmeId, uid }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadTeamPersonPage(db, user, roundId, programmeId, uid) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Coursework" />;
  if (outcome.status === "not-here") {
    return (
      <Refusal title={PERSON_NOT_HERE_TITLE} href={outcome.back} action={BACK_TO_PEOPLE}>
        {PERSON_NOT_HERE}
      </Refusal>
    );
  }
  return (
    <ApplicationsRoot className={shared.page}>
      <PersonPage view={outcome.view} />
    </ApplicationsRoot>
  );
}
