import { admissionApplicationId } from "./admissionApplications";

/**
 * `admissionAssessments/{roundId}__{uid}`: what Claude and Pangram made of one
 * application, kept so an admin does not pay for the same read twice and so a
 * programme's list can show the marks.
 *
 * ```
 * { roundId, uid,
 *   read:    StoredApplicationRead | null,     // one read of the whole application,
 *                                             // with a lean per programme ranked
 *   claude:  (from before reads were per application: never read, cleared
 *            with the rest by "Clear all reads")
 *   pangram: PangramCheck | null,             // the application's long answers
 *   updatedAt }
 * ```
 *
 * Server only, like every admissions collection: `allow read, write: if false`
 * in `firestore.rules`. Written by the assessment route, for an admin, and
 * read by it and by the programme list's marks route, for an admin. Never in
 * a payload a lead or a reviewer is sent.
 *
 * It is DERIVED from the application and its reviews, so it goes wherever the
 * application goes: the applicant's account deletion and the form's destroy
 * both take it, and the record kept after a term never copies it. It stores
 * reviewer LABELS ("Reviewer A") in Claude's words and never a reviewer's
 * name, so deleting a reviewer's account leaves nothing here that names them.
 *
 * The id is `admissionApplicationId(roundId, uid)`, the application's own:
 * the assessment of an application is found by the application. The one
 * query is "Clear all reads" (`src/lib/applications/assessment/clear.ts`),
 * which takes every assessment in a round by `roundId`.
 */
export const ASSESSMENTS_COLLECTION = "admissionAssessments";

/** The application's own id. CONSTRUCT-ONLY, like `admissionApplicationId`. */
export function admissionAssessmentId(roundId: string, uid: string): string {
  return admissionApplicationId(roundId, uid);
}
