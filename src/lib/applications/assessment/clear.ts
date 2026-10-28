import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { canRunTerm } from "../access";
import { loadForm } from "../repo";
import { NOT_FOUND, refuse } from "../review/refusals";
import type { Refusal } from "../review/types";

/**
 * CLEAR ALL READS: every stored Claude read and Pangram check on one form,
 * for an admin, so the whole intake can be read again under the same
 * instructions. Nothing else is touched: a read is derived from the
 * application and its reviews, and both stay as they are.
 *
 * Every assessment in the round, found by its `roundId` rather than by the
 * applications, so one left behind by an application since withdrawn goes
 * too.
 */

const BATCH = 400;

export type ClearReadsResult = { ok: true; deleted: number } | Refusal;

export async function clearReads(db: Firestore, user: SessionUser, roundId: string): Promise<ClearReadsResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can clear the reads.");
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;

  // A term is a few hundred applications at most: the ids in one read, then
  // deleted a batch at a time.
  const snap = await db.collection(ASSESSMENTS_COLLECTION).where("roundId", "==", form.round.id).select().get();
  for (let i = 0; i < snap.docs.length; i += BATCH) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH)) batch.delete(doc.ref);
    await batch.commit();
  }
  const deleted = snap.docs.length;
  return { ok: true, deleted };
}
