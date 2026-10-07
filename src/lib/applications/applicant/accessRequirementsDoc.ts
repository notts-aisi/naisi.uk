import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { normalizeAdmissionApplicationPrivate } from "@/lib/firestore/admissionApplicationPrivate";
import { admissionApplicationPrivateId } from "@/lib/firestore/admissionApplications";

/**
 * WHERE AN ACCESS-REQUIREMENTS ANSWER IS KEPT, for an application made on an
 * application form.
 *
 * It is the place the older rounds already use, on purpose:
 * `admissionApplicationPrivate/{roundId}__{uid}`, a collection of its own
 * holding that one answer and nothing else, at the application's own id.
 * Three things rest on reusing it exactly.
 *
 *  - IT IS APART FROM THE APPLICATION. The answer is not a field of `draft`
 *    or `sent`, so nothing that reads an application can carry it by
 *    accident: not the list a lead is sent, not the payload a reviewer
 *    scores from, not the record kept when a term is over.
 *  - BOTH DELETIONS ALREADY TAKE IT. Destroying a form and deleting an
 *    account each delete the row at the id of every application they
 *    delete, in the same batch, whatever kind of round it was made on
 *    (`src/lib/admissions/destroy.ts`, `src/lib/firestore/accountDeletion.ts`).
 *  - A ROW IS FOUND ONLY THROUGH ITS APPLICATION. It carries no uid and no
 *    round to query on, so one written where there is no application could
 *    never be found again. Both writers here write it inside a transaction
 *    that has read the application first.
 *
 * THIS FILE IS THE ONLY ONE UNDER `src/lib/applications/` THAT NAMES THE
 * COLLECTION, and exactly two modules may import it: the applicant's own read
 * and write (`./accessRequirements.ts`), and the one staff reader
 * (`../review/accessRequirements.ts`), which is an admin's, has to be asked
 * for deliberately and records every read.
 * `tests/applications-d2-zeta-access-requirements-boundary.test.mjs` walks the
 * import graph of everything that builds what a lead, a reviewer or the kept
 * record is given, and fails if one of them can reach this file.
 */

export const ACCESS_REQUIREMENTS_COLLECTION = "admissionApplicationPrivate";

export function accessRequirementsRef(
  db: Firestore,
  roundId: string,
  uid: string,
): DocumentReference {
  return db
    .collection(ACCESS_REQUIREMENTS_COLLECTION)
    .doc(admissionApplicationPrivateId(roundId, uid));
}

/** The answer a stored row holds, or "" when there is no row. */
export function accessRequirementsIn(snap: DocumentSnapshot): string {
  if (!snap.exists) return "";
  return normalizeAdmissionApplicationPrivate(snap.id, snap.data() ?? {}).accessRequirements;
}
