import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { canDecideFor, canRunTerm, programmeRolesFor, roleOnProgramme } from "../access";
import { termsFor } from "../decisionDay/plan";
import { isPooled } from "../decisions";
import type { ApplicationForm } from "../normalise";
import { loadQuestionSets } from "../repo";
import { buildProgrammeBoard } from "../review/board";
import { viewerFor } from "../review/load";
import { termPictureFor } from "../review/term";
import { listDecisions, listReviews, listSentApplications, listSentApplicationsOnce } from "../staffRepo";
import type { ProgrammeWork } from "./termHome";

type Reads = {
  applications: Awaited<ReturnType<typeof listSentApplications>>;
  decisions: Awaited<ReturnType<typeof listDecisions>>;
  sets: Awaited<ReturnType<typeof loadQuestionSets>>;
  reviews: Awaited<ReturnType<typeof listReviews>>;
};

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
 * THE POOLED NUMBERS are the ones the pooled applicants page shows this
 * caller (`termsFor`, read as `shown`): how many people are pooled so far,
 * and how many of them still need an outcome picked. The caller's own
 * application is in neither, as it is in no row of that page, so the number
 * here is the number of rows there.
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

  const work = workOn(user, form, roles.map((entry) => entry.programmeId), { applications, decisions, sets, reviews });

  let pool: TermNumbers["pool"] = null;
  if (canRunTerm(user)) {
    const { shown } = termsFor(form, applications, decisions, user.uid);
    pool = {
      pooled: shown.people.filter((person) => isPooled(person.outcome)).length,
      needsOutcome: shown.readiness.needsOutcome,
    };
  }
  return { work, pool };
}

/** Each of these programmes' numbers, from what was read: the term page's own arithmetic. */
function workOn(user: SessionUser, form: ApplicationForm, programmeIds: readonly string[], reads: Reads): Record<string, ProgrammeWork> {
  const { applications, decisions, sets, reviews } = reads;
  const term = termPictureFor({ form, applications, decisions, reviews, viewerUid: user.uid });
  const noNames = new Map<string, string>();
  const { viewer } = viewerFor(user, form, noNames);
  const work: Record<string, ProgrammeWork> = {};
  for (const programmeId of programmeIds) {
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
  return work;
}

/**
 * ONE PROGRAMME'S NUMBERS, as `loadTermNumbers` gives them for it: for a
 * page about one programme (its Overview's Applications to read), which
 * needs no other programme's. Null when the caller has no role on it.
 *
 * Reads: the form's sent applications (shared with the programme's head,
 * which reads them for the Applications tab's count:
 * `listSentApplicationsOnce`) and its decisions, one equality each; the
 * question sets and the reviews only when the caller's role on THIS
 * programme is a reviewer's, whose number alone depends on what they have
 * scored.
 */
export async function loadProgrammeWork(
  db: Firestore,
  user: SessionUser,
  form: ApplicationForm,
  programmeId: string,
): Promise<ProgrammeWork | null> {
  const role = roleOnProgramme(user, form, programmeId);
  if (!role) return null;
  const scores = role === "reviewer";
  const [applications, decisions, sets, reviews] = await Promise.all([
    listSentApplicationsOnce(db, form),
    listDecisions(db, form.round.id),
    scores ? loadQuestionSets(db, form.round.id) : [],
    scores ? listReviews(db, form.round.id) : [],
  ]);
  return workOn(user, form, [programmeId], { applications, decisions, sets, reviews })[programmeId] ?? null;
}
