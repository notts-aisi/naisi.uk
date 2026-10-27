import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import {
  FACILITATING_COLLECTION,
  askTestId,
  normalizeAsk,
  normalizeAskTest,
  normalizeTraining,
  trainingId,
  type AskTest,
  type FacilitatorAsk,
  type FacilitatorTraining,
} from "./model";

/**
 * EVERY READ OF `courseFacilitating`. Each is by a document's own address or
 * one equality on `runId`, so none needs a declared index, and each answers
 * only documents whose stored fields say they are what was asked for.
 */

/** The run's training session, or null while none is set. */
export async function readTraining(db: Firestore, runId: string): Promise<FacilitatorTraining | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection(FACILITATING_COLLECTION).doc(trainingId(runId)).get();
  if (!snap.exists) return null;
  const training = normalizeTraining(snap.id, snap.data() as Record<string, unknown>);
  return training && training.runId === runId ? training : null;
}

/** The run's last test of the ask's email, or null. */
export async function readAskTest(db: Firestore, runId: string): Promise<AskTest | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection(FACILITATING_COLLECTION).doc(askTestId(runId)).get();
  if (!snap.exists) return null;
  const test = normalizeAskTest(snap.id, snap.data() as Record<string, unknown>);
  return test && test.runId === runId ? test : null;
}

/** Every ask on a run: one equality on `runId`, the kind filtered in memory. */
export async function listRunAsks(db: Firestore, runId: string): Promise<FacilitatorAsk[]> {
  if (!runId || !isAddressableId(runId)) return [];
  const snap = await db.collection(FACILITATING_COLLECTION).where("runId", "==", runId).get();
  const asks: FacilitatorAsk[] = [];
  for (const doc of snap.docs) {
    const ask = normalizeAsk(doc.id, doc.data() as Record<string, unknown>);
    if (ask && ask.runId === runId) asks.push(ask);
  }
  return asks;
}

/** One ask by its address, or null for anything that is not one. */
export async function readAsk(db: Firestore, askId: string): Promise<FacilitatorAsk | null> {
  if (!askId || !isAddressableId(askId)) return null;
  const snap = await db.collection(FACILITATING_COLLECTION).doc(askId).get();
  if (!snap.exists) return null;
  return normalizeAsk(snap.id, snap.data() as Record<string, unknown>);
}
