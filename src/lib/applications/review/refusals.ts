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

/** Why a form takes no review or decision writes right now, or null when it does. */
export function closedToStaffWrites(form: Pick<ApplicationForm, "round">): string | null {
  if (form.round.archived) return "This application form has been archived.";
  if (form.round.status === "draft") return "This application form is still a draft.";
  if (form.round.status === "cancelled") return "This application form was cancelled.";
  return null;
}
