import "server-only";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import { loadHoldsPlace } from "@/lib/applications/status/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";

/**
 * DOES THE SIGNED-IN MEMBER HOLD A PLACE? Asked by the two pages of the
 * member area that tell a member with no run that they are on nothing: Home,
 * and the list of their programmes.
 *
 * A place on a programme is not a run. Somebody decision day gave a place has
 * no run until they are put on one, so those pages ask this before they say
 * "not on a programme yet". IT IS ASKED FOR THAT AND FOR NOTHING ELSE. The
 * answer is yes, no, or could not tell, and it carries no round, no programme
 * and no words, so a page that asks it has nothing of an outcome to print.
 * What became of an application is said on the person's own page and on the
 * list of their applications, and nowhere else (`docs/applications.md`, "One
 * set of words for an outcome").
 *
 * Three rules a maintainer has to keep:
 *
 * 1. IT IS THE PERSON'S OWN PAGE, ASKED AGAIN. Which applications there are
 *    comes from the loader behind `/applications`, and whether one of them
 *    holds a place comes from the read behind "Your application"
 *    (`loadHoldsPlace`, through `loadStatus`). Nothing here looks at an
 *    application or a decision itself, so the answer is yes exactly when
 *    that page says so: once decision day has published a place onto the
 *    person's own application, and until they give it back.
 * 2. `uid` IS THE SESSION'S OWN, never anything a request carries. Both reads
 *    are addressed by it, and there is no other way in.
 * 3. NOT READ IN A VIEW-AS SESSION. An application is its owner's to read, so
 *    while an admin is viewing the site as this member the answer is
 *    "unknown" and nothing is fetched. The check is made here, before either
 *    read, and not left to the caller.
 *
 * "unknown" IS "COULD NOT TELL", and never "no". A page may say a member is
 * on nothing only on a "no". On "yes" and on "unknown" it does the same
 * thing, which is to leave that sentence out and offer the way to the
 * member's applications, so the page of somebody with a place and the page
 * of somebody whose place could not be read are one page.
 *
 * `appliedTo` is for a page that has already listed the member's
 * applications: the rounds they are on, so the list is not read twice.
 */
export type HoldsPlace = "yes" | "no" | "unknown";

export async function holdsPlace(uid: string, appliedTo?: readonly string[]): Promise<HoldsPlace> {
  if (markerIsLive(await getImpersonator(), uid)) return "unknown";
  const db = getAdminDb();
  if (!db) return "unknown";
  try {
    const now = new Date();
    const roundIds = appliedTo ?? (await loadStatusRows(db, uid, now)).map((row) => row.round.id);
    return (await loadHoldsPlace(db, uid, roundIds, now)) ? "yes" : "no";
  } catch (err) {
    console.warn("[member area] could not read whether this member holds a place", err);
    return "unknown";
  }
}
