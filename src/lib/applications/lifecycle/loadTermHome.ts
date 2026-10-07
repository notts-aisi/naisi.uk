import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { canDecideFor, canRunTerm, programmeRolesFor } from "../access";
import { planTerm } from "../decisionDay/plan";
import { isPooled } from "../decisions";
import type { ApplicationForm } from "../normalise";
import { loadQuestionSets } from "../repo";
import { buildProgrammeBoard } from "../review/board";
import { viewerFor } from "../review/load";
import { termPictureFor } from "../review/term";
import { listDecisions, listReviews, listSentApplications } from "../staffRepo";
import type { ProgrammeWork } from "./termHome";

/**
 * The numbers the term page shows, each from the code behind the screen its
 * row links to.
 *
 * A PROGRAMME'S NUMBERS are that programme's list's own: the same picture of
 * the term (`termPictureFor`, which leaves the caller's own application out
 * before anything is counted) and the same builder (`buildProgrammeBoard`)
 * the list is drawn from. Its `counts` are what the card shows, its places
 * line is the list's own (who holds a place now, how many are kept for an
 * invitation and how many are left, from `holdingOf`), and the
 * length of its `queue` is how many applications are waiting for this
 * caller: whoever is still owed a decision for somebody who decides, and
 * whoever they have not finished scoring for a reviewer. So the number on a
 * button here is the number of applications the screen behind it walks.
 *
 * THE POOLED NUMBERS are the ones decision day is planned on (`planTerm`):
 * how many people are pooled so far, and how many of them still need an
 * outcome picked.
 *
 * WHO GETS WHICH. A programme has an entry only when the caller has a role
 * on it (`programmeRolesFor`), and the pooled numbers are read only for
 * somebody who runs the term (`canRunTerm`). Nothing about an applicant
 * leaves this module but those numbers.
 *
 * Reads: every sent application and every decision on the form, one equality
 * each. The question sets and the reviews are read only for somebody who
 * reviews without deciding, because only their number depends on what they
 * have scored. Staff only.
 */
export type TermNumbers = {
  /** By programme id, for the programmes the caller has a role on. */
  work: Record<string, ProgrammeWork>;
  /** For somebody who runs the term. Null for everybody else. */
  pool: { pooled: number; needsOutcome: number } | null;
};

export async function loadTermNumbers(
  db: Firestore,
  user: SessionUser,
  form: ApplicationForm,
): Promise<TermNumbers> {
  const roles = programmeRolesFor(user, form);
  const scores = roles.some((entry) => entry.role === "reviewer");
  const [applications, decisions, sets, reviews] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    scores ? loadQuestionSets(db, form.round.id) : [],
    scores ? listReviews(db, form.round.id) : [],
  ]);

  const term = termPictureFor({ form, applications, decisions, reviews, viewerUid: user.uid });
  const noNames = new Map<string, string>();
  const { viewer } = viewerFor(user, form, noNames);
  const work: Record<string, ProgrammeWork> = {};
  for (const { programmeId } of roles) {
    const board = buildProgrammeBoard({
      form,
      sets,
      term,
      viewer,
      programmeId,
      canDecide: canDecideFor(user, form, programmeId),
      // Neither changes a count: one marks a row, the other names a lead.
      pendingUids: new Set<string>(),
      staffNames: noNames,
    });
    if (!board) continue;
    work[programmeId] = {
      counts: {
        all: board.counts.all,
        toReview: board.counts.toReview,
        accepted: board.counts.accepted,
        pooled: board.counts.pooled,
        declined: board.counts.declined,
      },
      places: {
        placed: board.progress.placed,
        invited: board.progress.invited,
        left: board.progress.placesLeft,
      },
      waiting: board.queue.length,
    };
  }

  let pool: TermNumbers["pool"] = null;
  if (canRunTerm(user)) {
    const planned = planTerm(form, applications, decisions);
    pool = {
      pooled: planned.people.filter((person) => isPooled(person.outcome)).length,
      needsOutcome: planned.readiness.needsOutcome,
    };
  }
  return { work, pool };
}
