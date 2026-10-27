import type { ApplicationForm } from "@/lib/applications/normalise";

/**
 * WHICH TERM IS THIS TERM, chosen from records: a term is an application
 * form, and its name is the form's ("Autumn 2026").
 *
 *  1. Only a form that has opened is a term: its opening time has passed,
 *     and it is not a draft, not cancelled and not archived.
 *  2. This term is the one whose decision day went out most recently
 *     (`decisionsSentAt`): its programmes are the ones running, or the last
 *     to have run. A form for next term that is taking applications does not
 *     take over until its own decisions go out, so the term's after surveys
 *     stay on the page while it does.
 *  3. Before any form's decisions have gone out, the one that opened most
 *     recently.
 *
 * The form's id settles a tie, so two reads give the same answer whichever
 * order the database returns the forms in.
 *
 * ITS EVENTS are the published events that started at or after its form
 * opened, up to now (`./load.ts`).
 *
 * Pure: the forms are read by the caller, and `now` is passed in.
 */
export function chooseTerm(forms: readonly ApplicationForm[], now: Date): ApplicationForm | null {
  const opened = forms.filter((form) => {
    const { status, archived, opensAt } = form.round;
    return !archived && status !== "draft" && status !== "cancelled" && opensAt !== null && opensAt.getTime() <= now.getTime();
  });
  const latest = (list: ApplicationForm[], at: (form: ApplicationForm) => number) =>
    [...list].sort((a, b) => at(b) - at(a) || a.round.id.localeCompare(b.round.id))[0] ?? null;
  const decided = opened.filter((form) => form.decisionsSentAt !== null && form.decisionsSentAt.getTime() <= now.getTime());
  if (decided.length > 0) return latest(decided, (form) => form.decisionsSentAt?.getTime() ?? 0);
  return latest(opened, (form) => form.round.opensAt?.getTime() ?? 0);
}
