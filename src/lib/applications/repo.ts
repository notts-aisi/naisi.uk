import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { APPLICATIONS_COLLECTION } from "@/lib/firestore/admissionApplications";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import {
  QUESTION_SETS_SUBCOLLECTION,
  applicationId,
  type ApplicationDoc,
  type QuestionSetDoc,
} from "./model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseForm,
  normaliseQuestionSet,
  type ApplicationForm,
} from "./normalise";

/**
 * Reading the parts of the application system an APPLICANT'S pages are built
 * from: the form, its question sets, and the caller's own application.
 *
 * Every collection here is `allow read, write: if false`, so this module (on
 * the Admin SDK) is how a route reaches them.
 *
 * THIS FILE NAMES NEITHER THE REVIEWS NOR THE DECISIONS, ON PURPOSE. Those
 * reads live in `./staffRepo.ts`, and `tests/applications-boundary.test.mjs`
 * holds that nothing which builds an applicant's page can reach that module.
 * A scores or decisions read added here would put every applicant route one
 * careless spread away from telling somebody their outcome early.
 */

export function formRef(db: Firestore, roundId: string): DocumentReference {
  return db.collection(ROUNDS_COLLECTION).doc(roundId);
}

export function questionSetRef(db: Firestore, roundId: string, setId: string): DocumentReference {
  return formRef(db, roundId).collection(QUESTION_SETS_SUBCOLLECTION).doc(setId);
}

export function applicationRef(db: Firestore, roundId: string, uid: string): DocumentReference {
  return db.collection(APPLICATIONS_COLLECTION).doc(applicationId(roundId, uid));
}

/** The form, or null when there is no such round or it is not an application form. */
export async function loadForm(db: Firestore, roundId: string): Promise<ApplicationForm | null> {
  const snap = await formRef(db, roundId).get();
  if (!snap.exists || !isApplicationForm(snap.data())) return null;
  return normaliseForm(snap.id, snap.data());
}

/** Every question set on the form. Order them with `orderedSets(form, sets)`. */
export async function loadQuestionSets(db: Firestore, roundId: string): Promise<QuestionSetDoc[]> {
  const snap = await formRef(db, roundId).collection(QUESTION_SETS_SUBCOLLECTION).get();
  const sets: QuestionSetDoc[] = [];
  for (const doc of snap.docs) {
    const set = normaliseQuestionSet(doc.id, doc.data());
    if (set) sets.push(set);
  }
  return sets;
}

/** The caller's own application to this form, or null. */
export async function loadOwnApplication(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
): Promise<ApplicationDoc | null> {
  const snap = await applicationRef(db, form.round.id, uid).get();
  if (!snap.exists) return null;
  return normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
}
