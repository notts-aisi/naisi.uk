/**
 * What the older round console says about an application form.
 *
 * An application form is stored on an admission round, so the older console's
 * routes can address one by id. They must never edit it: they know nothing of
 * its programmes or its question sets, they would reopen a round by a status
 * table the form does not use, and a reviewer list saved there would overwrite
 * the union the form keeps of every programme's lead and reviewers.
 *
 * So each of the older mutating round routes asks `isApplicationForm` once it
 * has loaded the round, and answers with this sentence.
 */
export const EDITED_IN_THE_APPLICATION_FORM =
  "This round is an application form, so it is edited in the application form and not here. Open it from Admissions.";

/** Where the editor for one application form lives. */
export function applicationFormPath(roundId: string): string {
  return `/admin/admissions/forms/${roundId}`;
}
