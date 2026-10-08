import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { listDecisions, listSentApplications } from "../staffRepo";
import { isInTerm, termsFor, type OwnApplication, type Term } from "./plan";

/**
 * Reading the whole term for the two decision-day screens: every sent
 * application and every decision document on the form, lined up by
 * `planTerm`.
 *
 * Two reads, each a single equality on the round, and everything after them is
 * worked out in memory. Staff only: this reaches the decisions, so nothing
 * that serves an applicant may import it.
 *
 * IT IS READ FOR SOMEBODY. The screens it feeds are an admin's, and an admin
 * can have applied, so the caller says who is looking and the term comes back
 * in two readings (`termsFor`). `shown` and the two maps beside it hold
 * nothing of the viewer's own application: a screen lists and counts from
 * those. `whole` and `wholeApplications` are everybody, for the send and for
 * whether it may go. `tests/applications-own-application.test.mjs` holds
 * every reader of either to a written reason.
 */

export type LoadedTerm = {
  /** The term as the viewer is shown it: their own application is in no list and no count. */
  shown: Term;
  /** The applications behind `shown.people`, by uid. */
  shownApplications: Map<string, ApplicationDoc>;
  /**
   * The applications behind `shown.left`, by uid: people decision day told
   * who have since given a place or an invitation back. For reading what
   * they said and why. Nothing is planned or counted from these.
   */
  leftApplications: Map<string, ApplicationDoc>;
  /** Everybody, the viewer included. For the send, and for whether it may go. */
  whole: Term;
  /** The applications behind `whole.people`, by uid. */
  wholeApplications: Map<string, ApplicationDoc>;
  /** Whether the viewer has an application of their own on this form. */
  own: OwnApplication;
};

export async function loadTerm(
  db: Firestore,
  form: ApplicationForm,
  viewerUid: string,
): Promise<LoadedTerm> {
  const [sent, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const { shown, whole, own } = termsFor(form, sent, decisions, viewerUid);
  const wholeApplications = new Map<string, ApplicationDoc>();
  const shownApplications = new Map<string, ApplicationDoc>();
  const outside = new Map<string, ApplicationDoc>();
  for (const application of sent) {
    if (!isInTerm(application)) {
      outside.set(application.uid, application);
      continue;
    }
    wholeApplications.set(application.uid, application);
    if (application.uid !== viewerUid) shownApplications.set(application.uid, application);
  }
  const leftApplications = new Map<string, ApplicationDoc>();
  for (const person of shown.left) {
    const application = outside.get(person.uid);
    if (application) leftApplications.set(person.uid, application);
  }
  return { shown, shownApplications, leftApplications, whole, wholeApplications, own };
}
