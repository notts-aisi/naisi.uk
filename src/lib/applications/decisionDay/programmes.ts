import type { ApplicationFormFields, ProgrammeSettings } from "../model";

/**
 * Looking a programme up by an id that came from somewhere else.
 *
 * `form.programmes` is a plain object keyed by programme id, and a plain
 * object answers to more names than its own keys: `form.programmes["constructor"]`
 * is not a programme, and it is not undefined either. An id that arrived in a
 * request, or was read off a stored document, is therefore looked up through
 * this function, which answers only for a key the form itself carries.
 */
export function programmeOf(
  form: Pick<ApplicationFormFields, "programmes">,
  programmeId: string | null | undefined,
): ProgrammeSettings | undefined {
  if (typeof programmeId !== "string" || !Object.hasOwn(form.programmes, programmeId)) {
    return undefined;
  }
  return form.programmes[programmeId];
}

/** What a programme is called on a chip or in a list. Falls back to its id. */
export function shortNameOf(
  form: Pick<ApplicationFormFields, "programmes">,
  programmeId: string,
): string {
  return programmeOf(form, programmeId)?.shortName ?? programmeId;
}

/** Audit kinds for the two things an admin does here. A form is not a run, so
 *  each row carries `runId: ""` and the form's own `roundId`. */
export const POOLED_OUTCOME_AUDIT_KIND = "application-pooled-outcome";
export const DECISIONS_SENT_AUDIT_KIND = "application-decisions-sent";
