import type { ApplicationForm } from "../normalise";
import type { Refusal } from "./types";

/**
 * The answers a review route gives when it will not do what was asked.
 *
 * No server import: a refusal is a value, built the same way by the loaders
 * and the writers and read by tests.
 */

/**
 * One answer for "no such form", "no such programme", "no such application"
 * and "not yours to see". The words are the same in every case so that nobody
 * learns a form or a programme exists by asking about it.
 */
export const NOT_FOUND: Refusal = { ok: false, status: 404, error: "Not found" };

export function refuse(status: Refusal["status"], error: string): Refusal {
  return { ok: false, status, error };
}

/** What a decision is answered with once decision day has run. */
export const DECISIONS_SENT = "Decisions for this term have been sent, so they can’t be changed here.";

/**
 * What a decision is answered with once decision day has told THIS person,
 * which can be before the term as a whole has finished sending. It says what
 * can still be done: somebody who cannot take a place gives it back from
 * their own page, and that frees it on every screen.
 */
export function alreadyTold(name: string): string {
  return (
    `${name || "This applicant"} has already been told their decision, so it can’t be changed here. ` +
    "If they can’t take up a place, they can give it back from their own application page."
  );
}

/** The same, for an admin taking an acceptance back. */
export function alreadyToldTheyAreIn(name: string): string {
  return (
    `${name || "This applicant"} has already been told they have a place, so the acceptance can’t be revoked here. ` +
    "If they are not coming, they can give the place back from their own application page, which frees it."
  );
}

/** Why a form takes no review or decision writes right now, or null when it does. */
export function closedToStaffWrites(form: Pick<ApplicationForm, "round">): string | null {
  if (form.round.archived) return "This application form has been archived.";
  if (form.round.status === "draft") return "This application form is still a draft.";
  if (form.round.status === "cancelled") return "This application form was cancelled.";
  return null;
}
