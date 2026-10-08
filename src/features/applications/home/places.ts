import "server-only";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import { loadPlaceWords } from "@/lib/applications/status/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import type { HeldPlace } from "./YourPlace";

/**
 * THE PLACES THE SIGNED-IN MEMBER HOLDS, for the pages of the member area
 * that would otherwise tell somebody with a place and no run that they are
 * on nothing (Home, and the list of their programmes).
 *
 * Three rules a maintainer has to keep:
 *
 * 1. IT IS THE PERSON'S OWN PAGE, ASKED AGAIN. Which applications there are
 *    comes from the loader behind `/applications`, and what each one came to
 *    comes from the read behind "Your application" (`loadPlaceWords`, through
 *    `loadStatus`). Nothing here looks at an application or a decision
 *    itself, so a place is said here exactly when that page says it: once
 *    decision day has published it onto the person's own application, and
 *    until they give it back.
 * 2. `uid` IS THE SESSION'S OWN, never anything a request carries. Both reads
 *    are addressed by it, and there is no other way in.
 * 3. NOT READ IN A VIEW-AS SESSION. An application is its owner's to read, so
 *    while an admin is viewing the site as this member the answer is null
 *    and nothing is fetched. The check is made here, before either read, and
 *    not left to the caller.
 *
 * NULL IS "COULD NOT BE READ", and never an empty list. Empty means the
 * member holds no place, and a page may then say so. Null means the page
 * does not know, and says nothing either way.
 *
 * `appliedTo` is for a page that has already listed the member's
 * applications: the rounds they are on, so the list is not read twice.
 */
export async function placesHeldBy(uid: string, appliedTo?: readonly string[]): Promise<HeldPlace[] | null> {
  if (markerIsLive(await getImpersonator(), uid)) return null;
  const db = getAdminDb();
  if (!db) return null;
  try {
    const now = new Date();
    const roundIds = appliedTo ?? (await loadStatusRows(db, uid, now)).map((row) => row.round.id);
    const words = await loadPlaceWords(db, uid, roundIds, now);
    const places: HeldPlace[] = [];
    for (const roundId of new Set(roundIds)) {
      const held = words.get(roundId);
      if (held) places.push({ roundId, title: held.title, next: held.next });
    }
    return places;
  } catch (err) {
    console.warn("[member area] could not read this member's places", err);
    return null;
  }
}
