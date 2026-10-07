import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { APPLICATIONS_COLLECTION } from "@/lib/firestore/admissionApplications";
import {
  applicationId,
  type ApplicationDoc,
  type DecisionDoc,
  type ReviewDoc,
} from "./model";
import {
  normaliseApplication,
  normaliseDecision,
  normaliseReview,
  type ApplicationForm,
} from "./normalise";
import { applicationRef } from "./repo";

/**
 * Reading what the COMMITTEE works with: everybody's sent applications, the
 * reviews written about them, and each lead's decisions.
 *
 * NOTHING THAT BUILDS AN APPLICANT'S PAGE MAY IMPORT THIS MODULE.
 * `tests/applications-boundary.test.mjs` walks every import graph and holds
 * the line: the reviews and the decisions are reachable from here and from
 * nowhere an applicant's request can touch, which is what makes "nobody hears
 * anything early" a property of the code rather than of each screen.
 *
 * Every query below is a single equality on `roundId`, or two equalities,
 * which Firestore serves without a composite index. A new query that sorts or
 * ranges on the server needs an index declared and deployed before it works
 * on a real database, and the emulator will not say so. Filter in memory
 * instead: a term is a few hundred documents.
 */

/**
 * Each lead's decisions, pooled outcomes and exceptions. Declared HERE and not
 * with the shapes in `model.ts`, so that the name itself is out of reach of
 * every module an applicant's request loads.
 */
export const DECISIONS_COLLECTION = "admissionDecisions";

/** `admissionReviews`, as a literal: the reviews module names no collection. */
const REVIEWS_COLLECTION = "admissionReviews";

/** The decision document sits at the application's own id. */
export function decisionRef(db: Firestore, roundId: string, uid: string): DocumentReference {
  return db.collection(DECISIONS_COLLECTION).doc(applicationId(roundId, uid));
}

export function reviewRef(
  db: Firestore,
  roundId: string,
  applicantUid: string,
  reviewerUid: string,
): DocumentReference {
  return db.collection(REVIEWS_COLLECTION).doc(`${roundId}__${applicantUid}__${reviewerUid}`);
}

/** One person's application, for staff. The caller has already been gated. */
export async function loadApplication(
  db: Firestore,
  form: ApplicationForm,
  applicantUid: string,
): Promise<ApplicationDoc | null> {
  const snap = await applicationRef(db, form.round.id, applicantUid).get();
  if (!snap.exists) return null;
  return normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
}

/**
 * Every application to this form that has been SENT. A draft that was never
 * sent is not an application anybody reviews, so it is dropped here rather
 * than in each caller.
 */
export async function listSentApplications(
  db: Firestore,
  form: ApplicationForm,
): Promise<ApplicationDoc[]> {
  const snap = await db
    .collection(APPLICATIONS_COLLECTION)
    .where("roundId", "==", form.round.id)
    .get();
  const out: ApplicationDoc[] = [];
  for (const doc of snap.docs) {
    const application = normaliseApplication(doc.id, doc.data(), form.round.availabilityGrid);
    if (application?.sent) out.push(application);
  }
  return out;
}

/** Every decision document for this form, by applicant uid. */
export async function listDecisions(db: Firestore, roundId: string): Promise<Map<string, DecisionDoc>> {
  const snap = await db.collection(DECISIONS_COLLECTION).where("roundId", "==", roundId).get();
  const out = new Map<string, DecisionDoc>();
  for (const doc of snap.docs) {
    const decision = normaliseDecision(doc.id, doc.data());
    if (decision.uid) out.set(decision.uid, decision);
  }
  return out;
}

export async function loadDecision(
  db: Firestore,
  roundId: string,
  applicantUid: string,
): Promise<DecisionDoc | null> {
  const snap = await decisionRef(db, roundId, applicantUid).get();
  return snap.exists ? normaliseDecision(snap.id, snap.data()) : null;
}

/** Every review row written for this form. */
export async function listReviews(db: Firestore, roundId: string): Promise<ReviewDoc[]> {
  const snap = await db.collection(REVIEWS_COLLECTION).where("roundId", "==", roundId).get();
  return snap.docs.map((doc) => normaliseReview(doc.id, doc.data()));
}

/** Every reviewer's row about one applicant on this form. */
export async function listReviewsOf(
  db: Firestore,
  roundId: string,
  applicantUid: string,
): Promise<ReviewDoc[]> {
  const snap = await db
    .collection(REVIEWS_COLLECTION)
    .where("roundId", "==", roundId)
    .where("applicantUid", "==", applicantUid)
    .get();
  return snap.docs.map((doc) => normaliseReview(doc.id, doc.data()));
}
