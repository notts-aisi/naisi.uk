import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import ApplicationsBoard from "@/features/applications/review/ApplicationsBoard";
import NotHere from "@/features/applications/review/NotHere";
import { isAddressableId } from "@/lib/addressableId";
import { offersFreedPlaces } from "@/lib/applications/freedPlaces/rules";
import { loadProgrammePeople } from "@/lib/applications/people/load";
import { loadProgrammeBoard } from "@/lib/applications/review/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's applications, for its lead, its reviewers and admins.
 *
 * Server-rendered on the Admin SDK: applications, reviews and decisions are
 * closed to every browser, so nothing here could be a client listener. The
 * page and the GET route call the same loader, which asks
 * `src/lib/applications/access.ts` who the caller is to this programme before
 * it reads an application, and which builds what leaves field by field.
 *
 * The tree's layout has already admitted the caller to the admissions
 * console. That says nothing about THIS programme, so somebody with no role
 * on it is shown the same calm "not here" as for a form that does not exist.
 */
export default async function ProgrammeApplicationsPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const result =
    db && isAddressableId(roundId) && isAddressableId(programmeId)
      ? await loadProgrammeBoard(db, user, roundId, programmeId)
      : null;

  if (!result || !result.ok) {
    return (
      <ApplicationsRoot>
        <NotHere what="applications" />
      </ApplicationsRoot>
    );
  }
  const base = `forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`;
  // Freed places are offered after decision day, by whoever offersFreedPlaces
  // admits: the link is drawn for them alone, and its page asks again.
  const offers = result.board.round.decisionsSent && offersFreedPlaces(result.board.viewer.role);
  // After decision day, an admin's and the lead's names of people holding a place open their page on the programme,
  // where that page opens for them (a row of their People tab); everybody else, and every reviewer, keeps the application.
  const people =
    db && result.board.round.decisionsSent && (result.board.viewer.role === "admin" || result.board.viewer.role === "lead")
      ? await loadProgrammePeople(db, user, roundId, programmeId)
      : null;
  const personHrefs =
    people?.status === "ok"
      ? Object.fromEntries(people.view.rows.filter((row) => row.category === "holding").map((row) => [row.uid, row.personHref]))
      : null;
  return (
    <ApplicationsRoot>
      <ApplicationsBoard
        board={result.board}
        listPath={`/admin/admissions/${base}`}
        apiPath={`/api/admissions/${base}`}
        freedPlacesPath={offers ? `/admin/admissions/${base}/freed-places` : null}
        personHrefs={personHrefs}
        assessments={
          // Claude's and Pangram's marks are an admin's alone: the route asks
          // again, and refuses anybody else before it reads anything.
          result.board.viewer.role === "admin"
            ? {
                marksPath: `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/assessments`,
                formApiBase: `/api/admissions/forms/${encodeURIComponent(roundId)}`,
              }
            : null
        }
      />
    </ApplicationsRoot>
  );
}
