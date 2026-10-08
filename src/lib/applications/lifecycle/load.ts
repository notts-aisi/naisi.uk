import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { isEligibleAdmissionsReviewer, normalizeUser } from "@/lib/firestore/users";
import type { ApplicationFormFields, QuestionSetDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { loadQuestionSets } from "../repo";
import { openProgrammes } from "../sections";
import { formReadiness, type FormReadiness } from "./readiness";

/**
 * The reads readiness needs, in one place, so the term page and the status
 * route ask it the same question of the same documents.
 *
 * Readiness has two inputs that are not on the form: the question sets, and
 * whether each lead still has the standing to be one. The second is asked of
 * each lead's LIVE user document, with the bar the appointment applied
 * (`isEligibleAdmissionsReviewer`: an admin, or SU-recognised committee),
 * because nothing takes a name off a form when its owner's standing changes.
 *
 * Staff only. Nothing that builds an applicant's page reads who leads what.
 */

/** A batch read: `db.getAll` on its own, or a transaction's. */
export type ReadMany = (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/**
 * Of the leads of the programmes that are open, the ones whose account is
 * still an admin's or an SU-recognised committee member's. Somebody whose
 * account has gone is not among them.
 */
export async function readLeadsInStanding(
  db: Firestore,
  form: Pick<
    ApplicationFormFields,
    "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating"
  >,
  readMany: ReadMany = (refs) => db.getAll(...refs),
): Promise<Set<string>> {
  const uids = new Set<string>();
  for (const programme of openProgrammes(form)) {
    if (programme.leadUid) uids.add(programme.leadUid);
  }
  const standing = new Set<string>();
  if (uids.size === 0) return standing;
  const docs = await readMany([...uids].map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    if (isEligibleAdmissionsReviewer(normalizeUser(doc.id, doc.data() ?? {}))) standing.add(doc.id);
  }
  return standing;
}

/** The readiness list for a form, from sets and standing already read. */
export function readinessOf(
  form: ApplicationForm,
  sets: readonly QuestionSetDoc[],
  leadsInStanding: ReadonlySet<string>,
  now: Date,
): FormReadiness {
  const { opensAt, closesAt, decisionsByDate } = form.round;
  return formReadiness({ opensAt, closesAt, decisionsByDate, form, sets, leadsInStanding }, now);
}

/** The readiness list for a form, read fresh. For the term page. */
export async function loadReadiness(
  db: Firestore,
  form: ApplicationForm,
  now: Date,
): Promise<FormReadiness> {
  const [sets, leadsInStanding] = await Promise.all([
    loadQuestionSets(db, form.round.id),
    readLeadsInStanding(db, form),
  ]);
  return readinessOf(form, sets, leadsInStanding, now);
}
