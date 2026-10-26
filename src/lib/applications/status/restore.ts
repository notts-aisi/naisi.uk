import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef, formRef } from "../repo";
import { standingOf } from "./standing";

/**
 * PUTTING SOMEBODY BACK GIVES THE PLACE TO THEM AGAIN.
 *
 * Staff putting somebody back on the run after they left it, or after a
 * removal, is the inverse act, and it writes the inverse
 * (`readPlaceToRestore` and `restorePlaces`, below), in the transaction that
 * brings their seat back: the place they gave back on that programme is
 * theirs again, with no reply on record, no reason and no day it went. So
 * their own page, the lists of the programme's people and every count of
 * places say they hold it, through the one reading each already makes
 * (`standingOf`, and `holdsPlaceOn` over it), and the place stops counting as
 * free for somebody else.
 *
 * It is the inverse of what leaving and Remove write (`givePlaceBack` in
 * `record.ts`), kept in a file of its own so the applicant's reply stays the
 * one transaction its guards read. It writes nothing of its own: both
 * functions take the caller's transaction, the allocate route's.
 */

/** A place on the form that putting somebody back on the run gives them again, read and decided, not yet written. */
export type PlaceToRestore = {
  appRef: DocumentReference;
  roundRef: DocumentReference;
  from: AdmissionApplicationStatus;
};

/** The status of an application that holds a place, however the place came: by ranking or by an invitation accepted. */
const HOLDS_A_PLACE: AdmissionApplicationStatus = "accepted";

/**
 * THE PLACE ON THE FORM THAT PUTTING SOMEBODY BACK GIVES THEM AGAIN, read
 * inside the caller's transaction, before any of its writes, or null when
 * there is none to give.
 *
 * Only a place given back ON THIS PROGRAMME by "I can’t make it" is given
 * again: that is how leaving and Remove give one back, and how somebody gives
 * one back themselves. It is decided by `standingOf`, of the application as it
 * stands and as it will read once written: the write must leave them holding a
 * place on this programme. Anything else is left as it stands, and the seat
 * comes back without it: a place still held, an invitation turned down, an
 * application withdrawn some other way, a place on another programme, one
 * this form cannot read, or no application at all.
 */
export async function readPlaceToRestore(
  tx: Transaction,
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  programmeId: string,
): Promise<PlaceToRestore | null> {
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, uid);
  const snap = await tx.get(appRef);
  if (!snap.exists) return null;
  const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
  if (!application) return null;
  const standing = standingOf(application);
  if (standing.kind !== "released" || standing.how !== "cant-make-it" || standing.programmeId !== programmeId) return null;
  const restored = standingOf({ ...application, status: HOLDS_A_PLACE, attendance: null });
  if (restored.kind !== "place" || restored.programmeId !== programmeId) return null;
  return { appRef, roundRef: formRef(db, roundId), from: application.status };
}

/**
 * Gives each place to its person again, in the caller's transaction. The
 * application holds the place (`accepted`), and the reply that gave it up,
 * the reason given with it and the day it went are taken off, so nothing reads
 * it as given back: they have said nothing since they were put back, and "I’m
 * coming" is theirs to say again. Each form's counters move once, for all of
 * its places together.
 */
export function restorePlaces(tx: Transaction, places: readonly PlaceToRestore[]): void {
  const moves = new Map<string, { ref: DocumentReference; from: Map<AdmissionApplicationStatus, number> }>();
  for (const place of places) {
    tx.update(place.appRef, {
      status: HOLDS_A_PLACE,
      attendance: FieldValue.delete(),
      releaseReason: FieldValue.delete(),
      withdrawnAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (place.from === HOLDS_A_PLACE) continue;
    const move = moves.get(place.roundRef.path) ?? { ref: place.roundRef, from: new Map() };
    move.from.set(place.from, (move.from.get(place.from) ?? 0) + 1);
    moves.set(place.roundRef.path, move);
  }
  for (const { ref, from } of moves.values()) {
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    let moved = 0;
    for (const [status, count] of from) {
      update[`applicationCounts.${status}`] = FieldValue.increment(-count);
      moved += count;
    }
    update[`applicationCounts.${HOLDS_A_PLACE}`] = FieldValue.increment(moved);
    tx.update(ref, update);
  }
}
