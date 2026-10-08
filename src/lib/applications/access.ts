import "server-only";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { own } from "./keys";
import type { ApplicationFormFields } from "./model";

/**
 * WHO MAY DO WHAT ON AN APPLICATION FORM.
 *
 * Three kinds of people read applications, and each is scoped to a programme:
 *
 *  - the programme's LEAD reads every application that ranked it, and that of
 *    anybody who joined it by accepting an invitation, scores and comments on
 *    its answers, and decides for it;
 *  - a programme's REVIEWERS read, score and comment the same way, and cannot
 *    decide;
 *  - an ADMIN does everything, on every programme, and is the only one who
 *    picks what pooled applicants hear and who sends decision day.
 *
 * Being named is half the answer. The other half is still meeting the bar the
 * appointment applied (admin, or SU-recognised committee), asked again here at
 * the point of use through `isNamedWithStanding`, because nothing removes a
 * name from a form when its owner's standing changes. See
 * `src/lib/firebase/eligibility.ts`.
 *
 * These are the only predicates the application routes use for staff. A route
 * that compares a uid to a programme's lead by hand is the thing
 * `tests/authority-at-use.test.mjs` exists to refuse.
 */

type Form = Pick<ApplicationFormFields, "programmeIds" | "programmes">;

export type ProgrammeRole = "admin" | "lead" | "reviewer";

/**
 * This caller's role on one programme, or null when they have none.
 *
 * `programmeId` usually comes from an address, so the programme is read as
 * the form's OWN key (`own`, in `./keys`). A name every object carries is not
 * a programme, and nobody, an admin included, has a role on one.
 */
export function roleOnProgramme(
  user: SessionUser,
  form: Form,
  programmeId: string,
): ProgrammeRole | null {
  const programme = own(form.programmes, programmeId);
  if (!programme) return null;
  if (user.role === "admin") return "admin";
  if (isNamedWithStanding(user, "admissionRounds.leadUid", programme.leadUid)) return "lead";
  if (isNamedWithStanding(user, "admissionRounds.reviewerUids", programme.reviewerUids)) {
    return "reviewer";
  }
  return null;
}

/** Every programme this caller has a role on, in the form's order. */
export function programmeRolesFor(
  user: SessionUser,
  form: Form,
): { programmeId: string; role: ProgrammeRole }[] {
  const out: { programmeId: string; role: ProgrammeRole }[] = [];
  for (const programmeId of form.programmeIds) {
    const role = roleOnProgramme(user, form, programmeId);
    if (role) out.push({ programmeId, role });
  }
  return out;
}

/** May this caller open the form's staff screens at all? */
export function canSeeForm(user: SessionUser, form: Form): boolean {
  return user.role === "admin" || programmeRolesFor(user, form).length > 0;
}

/**
 * May this caller read an application? Only when they have a role on a
 * programme the applicant ranked, or on the one the applicant joined by
 * accepting an invitation. `ranked` is the SENT ranking: a draft is nobody's
 * to read but its author's.
 *
 * `joined` is `joinedByInvitation(application)` from `./decisions`: the
 * programme whose invitation the applicant ACCEPTED, or null. An invitation
 * that is only picked, or sent and not yet answered, gives that programme's
 * staff nothing to read: the applicant did not choose the programme, and has
 * not said yes to it.
 */
export function canReadApplication(
  user: SessionUser,
  form: Form,
  ranked: readonly string[],
  joined: string | null = null,
): boolean {
  if (user.role === "admin") return true;
  if (joined !== null && roleOnProgramme(user, form, joined) !== null) return true;
  return ranked.some((programmeId) => roleOnProgramme(user, form, programmeId) !== null);
}

/** May this caller score and comment on this programme's answers? */
export function canReviewFor(user: SessionUser, form: Form, programmeId: string): boolean {
  return roleOnProgramme(user, form, programmeId) !== null;
}

/** May this caller Accept, Pool or Decline for this programme? */
export function canDecideFor(user: SessionUser, form: Form, programmeId: string): boolean {
  const role = roleOnProgramme(user, form, programmeId);
  return role === "admin" || role === "lead";
}

/** May this caller edit this programme's own settings? Its lead, or an admin. */
export function canEditProgramme(user: SessionUser, form: Form, programmeId: string): boolean {
  return canDecideFor(user, form, programmeId);
}

/**
 * The form itself (its questions, its dates, which programmes are on it), the
 * outcome each pooled applicant hears, revoking an acceptance, the exception
 * that gives somebody a second place, and the decision-day send. Admin only.
 */
export function canRunTerm(user: SessionUser): boolean {
  return user.role === "admin";
}
