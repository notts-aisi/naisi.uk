import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { enrolmentRef, placedIn } from "@/lib/applications/freedPlaces/groups";
import { waitingOnGroups } from "@/lib/applications/freedPlaces/rules";
import { normaliseApplication } from "@/lib/applications/normalise";
import { freedOffersQuery } from "../groupArchive/read";

/**
 * THE SEATS FREED PLACES HOLD IN ONE GROUP, as the site counts them wherever
 * it says how many seats a group has free (`waitingOnGroups`, which
 * `seatsFree`, the offer route and the freed places page rely on): a freed
 * place offered in the group's name and not answered, and one accepted by
 * somebody not put in a group on the run yet. A group's places can't go
 * below its people plus these.
 *
 * Reads the applications a freed place in the group's name was offered on
 * (one equality on that map field, so no declared index), then the run's
 * place of each of their owners by id, as the offer route reads them; inside
 * `tx` when one is handed, so a transaction decides on what it read.
 */
export async function readHeldSeats(db: Firestore, runId: string, groupId: string, tx?: Transaction): Promise<number> {
  const query = freedOffersQuery(db, groupId);
  const snap = tx ? await tx.get(query) : await query.get();
  const applications = snap.docs.flatMap((doc) => {
    const application = normaliseApplication(doc.id, doc.data());
    return application && application.freedPlace?.groupId === groupId ? [application] : [];
  });
  if (applications.length === 0) return 0;
  const refs: DocumentReference[] = [...new Set(applications.map((application) => application.uid))].map((uid) => enrolmentRef(db, runId, uid));
  const places: DocumentSnapshot[] = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  const placed = placedIn(places.map((place) => (place.exists ? { id: place.id, data: place.data() ?? {} } : null)));
  return waitingOnGroups(applications, placed).get(groupId) ?? 0;
}
