import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import NotHere from "@/features/applications/review/NotHere";
import ReviewScreen from "@/features/applications/review/ReviewScreen";
import { isAddressableId } from "@/lib/addressableId";
import { loadReview } from "@/lib/applications/review/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One application, opened under the programme it is being reviewed for.
 *
 * Server-rendered on the Admin SDK, through the same loader the GET route
 * uses. That loader reads what the applicant SENT and never their draft, asks
 * `src/lib/applications/access.ts` whether this caller reviews a programme
 * the applicant ranked, and leaves out what a first review may not see yet.
 *
 * Somebody with no claim on the application is shown the same "not here" as
 * for one that does not exist. The key on the screen is the applicant, so
 * moving to the next application starts from that application's own state
 * and carries nothing over from the last one.
 */
export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; uid: string }>;
}) {
  const [{ roundId, programmeId, uid }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const result =
    db && isAddressableId(roundId) && isAddressableId(programmeId) && isAddressableId(uid)
      ? await loadReview(db, user, roundId, uid, programmeId)
      : null;

  if (!result || !result.ok) {
    return (
      <ApplicationsRoot>
        <NotHere what="application" />
      </ApplicationsRoot>
    );
  }
  const round = encodeURIComponent(roundId);
  return (
    <ApplicationsRoot>
      <ReviewScreen
        key={result.review.applicant.uid}
        initial={result.review}
        listPath={`/admin/admissions/forms/${round}/programmes/${encodeURIComponent(programmeId)}/applications`}
        apiBase={`/api/admissions/forms/${round}`}
      />
    </ApplicationsRoot>
  );
}
