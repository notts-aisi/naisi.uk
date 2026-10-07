/**
 * Where the older round console sends somebody who meets an application form.
 *
 * An application form is stored on an admission round, so the older console
 * can address one by id. It never edits one: every older route refuses a form
 * through the fence (`refuseApplicationForm` in
 * `src/lib/admissions/formFence.ts`), and the one sentence that refusal is
 * made in is declared there and nowhere else.
 *
 * That module runs on the server only, and the round list is drawn in the
 * browser. So what both sides need is kept here, in a module with no server
 * import: the address of the form's own editor.
 */

/** Where the editor for one application form lives. */
export function applicationFormPath(roundId: string): string {
  return `/admin/admissions/forms/${roundId}`;
}
