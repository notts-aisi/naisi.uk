import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { countApplicationsTo } from "../editor/load";
import { applicationFormPath } from "../editor/olderRounds";
import { own } from "../keys";
import { loadProgrammeWork } from "../lifecycle/loadTermHome";
import { stageSummaryFor } from "../lifecycle/view";
import type { ApplicationForm } from "../normalise";
import { applicationsLine, isTheirs } from "./list";

/**
 * "APPLICATIONS TO READ", FIRST ON A PROGRAMME'S OVERVIEW, while the
 * programme's form takes or decides applications: how many applications are
 * on the programme's list, how many of them wait for this reader's reading,
 * and the way to them, in the words the Programmes page and the term's page
 * already use for those ("14 applications · 3 for you to read", "Review 3",
 * "See applications").
 *
 * WHOSE COUNT. The reader's own, by the term page's rule (`isTheirs`): the
 * programme's lead, and an admin who is also its lead, read how many wait
 * for them (the length of the Applications tab's own queue for them,
 * `loadProgrammeWork`). An admin who neither leads nor reviews it is shown
 * the card with no count that is not theirs: "none for you to read", and
 * "See applications".
 *
 * WHEN. Only while the form is open or deciding (`stageSummaryFor`). Once
 * decisions have gone out, and before the form opens, there is no card. The
 * Overview is an admin's and the programme's lead's (`opensProgrammeGroups`),
 * so nobody else is given one.
 *
 * READS, beyond what the programme's head already reads: for a reader whose
 * count it is, the form's decisions (one equality on one field); the form's
 * sent applications are the head's own read, shared within the page
 * (`listSentApplicationsOnce`). For an admin whose count it is not, nothing:
 * the number of applications is the head's own count for the Applications
 * tab (`countApplicationsTo`, the same shared read). A read that fails
 * leaves the card out: the Overview never fails for it.
 */

export type ApplicationsToReadCard = {
  /** How many wait for this reader's reading; null for an admin whose count it would not be. */
  count: number | null;
  /** "14 applications · 3 for you to read", "9 applications · none for you to read". */
  line: string;
  /** "Review 3" or "See applications", to the programme's Applications tab. */
  action: { label: string; href: string };
};

/** The card's title, as Home's To do names the same thing. */
export const APPLICATIONS_TO_READ_TITLE = "Applications to read";

export async function applicationsToReadOn(
  db: Firestore,
  user: SessionUser,
  form: ApplicationForm,
  programmeId: string,
  now: Date,
): Promise<ApplicationsToReadCard | null> {
  const stage = stageSummaryFor(form, now).stage;
  if (stage !== "open" && stage !== "deciding") return null;
  const programme = own(form.programmes, programmeId);
  const role = programme ? roleOnProgramme(user, form, programmeId) : null;
  if (!programme || !role || !opensProgrammeGroups(role)) return null;
  const href = `${applicationFormPath(form.round.id)}/programmes/${programme.id}/applications`;
  try {
    if (isTheirs(user, { programme, role })) {
      const work = await loadProgrammeWork(db, user, form, programme.id);
      if (!work) return null;
      return {
        count: work.waiting,
        line: applicationsLine(work.counts.all, work.waiting),
        action: work.waiting > 0 ? { label: `Review ${work.waiting}`, href } : { label: "See applications", href },
      };
    }
    const all = await countApplicationsTo(db, form, programme.id);
    return { count: null, line: applicationsLine(all, 0), action: { label: "See applications", href } };
  } catch (err) {
    console.warn("[programme] could not count the applications to read", err);
    return null;
  }
}
