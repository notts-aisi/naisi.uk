import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { listDecisions, listSentApplications } from "../staffRepo";
import { isInTerm, planTerm, type Term } from "./plan";

/**
 * Reading the whole term for the two decision-day screens: every sent
 * application and every decision document on the form, lined up by
 * `planTerm`.
 *
 * Two reads, each a single equality on the round, and everything after them is
 * worked out in memory. Staff only: this reaches the decisions, so nothing
 * that serves an applicant may import it.
 */

export type LoadedTerm = {
  term: Term;
  /** The applications behind `term.people`, by uid. */
  applications: Map<string, ApplicationDoc>;
  /**
   * The applications behind `term.left`, by uid: people decision day told
   * who have since given a place or an invitation back. For reading what
   * they said and why. Nothing is planned or counted from these.
   */
  leftApplications: Map<string, ApplicationDoc>;
};

export async function loadTerm(db: Firestore, form: ApplicationForm): Promise<LoadedTerm> {
  const [sent, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const applications = new Map<string, ApplicationDoc>();
  const outside = new Map<string, ApplicationDoc>();
  for (const application of sent) {
    (isInTerm(application) ? applications : outside).set(application.uid, application);
  }
  const term = planTerm(form, sent, decisions);
  const leftApplications = new Map<string, ApplicationDoc>();
  for (const person of term.left) {
    const application = outside.get(person.uid);
    if (application) leftApplications.set(person.uid, application);
  }
  return { term, applications, leftApplications };
}
