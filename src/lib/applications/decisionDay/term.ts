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
};

export async function loadTerm(db: Firestore, form: ApplicationForm): Promise<LoadedTerm> {
  const [sent, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const applications = new Map<string, ApplicationDoc>();
  for (const application of sent) {
    if (isInTerm(application)) applications.set(application.uid, application);
  }
  return { term: planTerm(form, sent, decisions), applications };
}
