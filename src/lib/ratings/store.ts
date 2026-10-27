import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  RATINGS_COLLECTION,
  normalizeRating,
  normalizeRatingSheet,
  ratingId,
  ratingIsEmpty,
  ratingSheetId,
  type RatingAnswers,
  type RatingDoc,
  type RatingSheetDoc,
} from "./model";

/**
 * READING AND WRITING RATINGS, on the Admin SDK (`./model.ts` says what they
 * are). Every query is one equality on one field, so none needs a declared
 * index; lists are sorted in memory.
 *
 * Who may ask is the caller's business: the ratings pages and their route
 * decide first (`./rules.ts`, `./view.ts`), the Kairos file and report are
 * an admin's, and the two deleters are the account's deletion and the job
 * two years after the programme.
 */

/** Firestore takes at most 500 writes in one batch; a page stays well under it. */
const PAGE = 200;

/** Every rating given on a run: one equality on `runId`, the run's sheet left out. */
export async function readRunRatings(db: Firestore, runId: string): Promise<RatingDoc[]> {
  if (!runId || runId.includes("/")) return [];
  const snap = await db.collection(RATINGS_COLLECTION).where("runId", "==", runId).get();
  const out: RatingDoc[] = [];
  for (const doc of snap.docs) {
    const rating = normalizeRating(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (rating && rating.runId === runId) out.push(rating);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * One rater's answers about one fellow: kept, or deleted when every answer is
 * cleared. The run's sheet is written with its first rating, so the job two
 * years on knows the run has ratings to delete and from which day.
 */
export async function saveRating(
  db: Firestore,
  input: { runId: string; groupId: string; raterUid: string; ratedUid: string; answers: RatingAnswers; lastSessionOn: string },
): Promise<void> {
  const ref = db.collection(RATINGS_COLLECTION).doc(ratingId(input.runId, input.raterUid, input.ratedUid));
  if (ratingIsEmpty(input.answers)) {
    await ref.delete();
    return;
  }
  const sheet = db.collection(RATINGS_COLLECTION).doc(ratingSheetId(input.runId));
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(sheet);
    tx.set(ref, {
      kind: "rating",
      runId: input.runId,
      groupId: input.groupId,
      raterUid: input.raterUid,
      ratedUid: input.ratedUid,
      answers: { ...input.answers },
      savedAt: FieldValue.serverTimestamp(),
    });
    if (!existing.exists) tx.set(sheet, { kind: "sheet", runId: input.runId, lastSessionOn: input.lastSessionOn });
  });
}

/** Every run's sheet: one equality on `kind`. A handful a term. */
export async function readRatingSheets(db: Firestore): Promise<RatingSheetDoc[]> {
  const snap = await db.collection(RATINGS_COLLECTION).where("kind", "==", "sheet").get();
  const out: RatingSheetDoc[] = [];
  for (const doc of snap.docs) {
    const sheet = normalizeRatingSheet(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (sheet) out.push(sheet);
  }
  return out.sort((a, b) => a.runId.localeCompare(b.runId));
}

async function deleteInPages(db: Firestore, refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += PAGE) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + PAGE)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Delete a run's ratings and its sheet, two years after its last session.
 * Answers how many ratings went. Safe to run twice: a second run finds none.
 */
export async function deleteRunRatings(db: Firestore, runId: string): Promise<number> {
  if (!runId || runId.includes("/")) return 0;
  const snap = await db.collection(RATINGS_COLLECTION).where("runId", "==", runId).get();
  const ratings = snap.docs.filter((doc) => (doc.data() ?? {}).kind === "rating").length;
  await deleteInPages(db, snap.docs.map((doc) => doc.ref));
  return ratings;
}

/**
 * Every rating an account gave or was given, deleted with the account: one
 * equality on `raterUid` and one on `ratedUid`.
 */
export async function deleteRatingsForAccount(db: Firestore, uid: string): Promise<number> {
  if (!uid || uid.includes("/")) return 0;
  const [given, got] = await Promise.all([
    db.collection(RATINGS_COLLECTION).where("raterUid", "==", uid).get(),
    db.collection(RATINGS_COLLECTION).where("ratedUid", "==", uid).get(),
  ]);
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of [...given.docs, ...got.docs]) refs.set(doc.id, doc.ref);
  await deleteInPages(db, [...refs.values()]);
  return refs.size;
}
