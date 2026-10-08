import type { CourseAuditKind } from "@/lib/firestore/courseAudit";
import { own } from "../keys";
import type { ApplicationFormFields, ProgrammeSettings } from "../model";

/**
 * Looking a programme up by an id that came from somewhere else.
 *
 * `form.programmes` is a plain object keyed by programme id, and a plain
 * object answers to more names than its own keys: `form.programmes["constructor"]`
 * is not a programme, and it is not undefined either. An id that arrived in a
 * request, or was read off a stored document, is therefore looked up through
 * this function, which answers only for a key the form itself carries. The
 * lookup is the contract's own (`own` in `../keys`), so there is one rule for
 * what a map holds.
 */
export function programmeOf(
  form: Pick<ApplicationFormFields, "programmes">,
  programmeId: string | null | undefined,
): ProgrammeSettings | undefined {
  if (typeof programmeId !== "string") return undefined;
  return own(form.programmes, programmeId);
}

/** What a programme is called on a chip or in a list. Falls back to its id. */
export function shortNameOf(
  form: Pick<ApplicationFormFields, "programmes">,
  programmeId: string,
): string {
  return programmeOf(form, programmeId)?.shortName ?? programmeId;
}

/** Audit kinds for the two things an admin does here. A form is not a run, so
 *  each row carries `runId: ""` and the form's own `roundId`. Each name is
 *  held to the log's own list of kinds by its type: a name the log does not
 *  carry does not compile. */
export const POOLED_OUTCOME_AUDIT_KIND = "application-pooled-outcome" satisfies CourseAuditKind;
export const DECISIONS_SENT_AUDIT_KIND = "application-decisions-sent" satisfies CourseAuditKind;
