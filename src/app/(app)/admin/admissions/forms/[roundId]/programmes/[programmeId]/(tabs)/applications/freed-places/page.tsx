import { Refusal } from "@/features/applications/editor/Refusals";
import FreedPlacesBoard from "@/features/applications/freedPlaces/FreedPlacesBoard";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import NotHere from "@/features/applications/review/NotHere";
import { isAddressableId } from "@/lib/addressableId";
import { loadOfferBoard } from "@/lib/applications/freedPlaces/load";
import { ADMINS_OFFER } from "@/lib/applications/freedPlaces/rules";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * "Offer freed places": one programme's places given back after decision
 * day, offered to pooled applicants who were told "No offer this time" and
 * who ranked it. Reached from the programme's Applications tab, where its
 * places are counted, and drawn under that tab.
 *
 * Server-rendered on the Admin SDK: applications, decisions and reviews are
 * closed to every browser. What the browser receives is the object
 * `loadOfferBoard` builds field by field: people are named and scored, and no
 * address or painted week is in it.
 *
 * Who may open it is `offersFreedPlaces` of the caller's role on the
 * programme (an admin, or the programme's lead), decided before anybody's
 * application is read. The tree's layout has already shown "there is no
 * programme here" to anybody with no role on it; a reviewer is told who
 * offers. The routes behind its buttons ask the same question for themselves.
 */
export default async function FreedPlacesPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded =
    db && isAddressableId(roundId) && isAddressableId(programmeId)
      ? await loadOfferBoard(db, user, roundId, programmeId, new Date())
      : null;

  if (!loaded || (!loaded.ok && loaded.kind === "not-found")) {
    return (
      <ApplicationsRoot>
        <NotHere what="applications" />
      </ApplicationsRoot>
    );
  }
  if (!loaded.ok) {
    return (
      <Refusal
        title="This page is for the programme’s lead and admins"
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
        action="Go to applications"
      >
        {ADMINS_OFFER}
      </Refusal>
    );
  }
  return <FreedPlacesBoard board={loaded.board} />;
}
