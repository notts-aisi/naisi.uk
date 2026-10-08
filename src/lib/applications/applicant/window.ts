import { roundWindowState, type RoundWindowState } from "@/lib/admissions/window";
import type { ApplicationForm } from "../normalise";

/**
 * WHETHER THE FORM CAN BE FILLED IN RIGHT NOW, asked in one place.
 *
 * The page that shows the form, the route that saves a draft and the route
 * that sends an application all ask this module, so the screen cannot offer a
 * box the server would refuse. The answer is the round's own window
 * (`roundWindowState`), which is the same predicate every older round uses.
 *
 * Two rules a maintainer has to keep:
 *
 *  - A form that is `inactive` (still a draft, or archived) is NOT a form as
 *    far as an applicant is concerned. Every caller answers it exactly as it
 *    answers a form that does not exist, so nobody can read the committee's
 *    plans off a status code. `isFormVisible` is that test.
 *  - Nothing is saved or sent outside `open`. `formWindowRefusal` is the
 *    sentence the routes refuse with.
 */

type Windowed = Pick<ApplicationForm, "round">;

export function formWindow(form: Windowed, now: Date): RoundWindowState {
  return roundWindowState(form.round, now).state;
}

/** False for a draft or archived form, which an applicant must not learn exists. */
export function isFormVisible(form: Windowed, now: Date): boolean {
  return formWindow(form, now) !== "inactive";
}

/** Why a save or a send is refused right now, as a sentence, or null when it may go ahead. */
export function formWindowRefusal(form: Windowed, now: Date): string | null {
  const state = formWindow(form, now);
  if (state === "open") return null;
  if (state === "not-yet") return "Applications have not opened yet.";
  return "Applications have closed, so this application can no longer be changed.";
}
