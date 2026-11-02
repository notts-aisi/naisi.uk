import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { WorkRatingRole } from "@/lib/firestore/courseWorkRatings";
import { readRunForLock } from "../weekWork/own";
import {
  liveGroupsOf,
  ownerFactsOf,
  reviewerFactsOf,
  writtenReviewRole,
  type OwnerFacts,
  type ReviewerFacts,
} from "../writtenAnswers/access";

/**
 * WHO RATES A WRITTEN ANSWER FOR THE TEAM, AND WHO READS THE RATINGS (privacy
 * v15: "The people running a programme may rate your written work and comment
 * on it for each other ... You are never shown these ratings or comments").
 *
 * WHO: admins, and the lead of the programme that names the run, while they
 * stand (`programmeLedBy`, through `reviewerFactsOf`). Never a track lead,
 * never a facilitator as such, never a programme's reviewer. A lead who also
 * facilitates the group rates as the lead and reads as the lead; an admin
 * always as an admin.
 *
 * WHOSE WORK: anybody whose answer they may read on the review page, by the
 * one gate (`writtenReviewRole`): somebody holding a place in a live group of
 * the run, or a facilitator's own. Never their own, an admin included, which
 * is also why nobody is ever shown the ratings about themselves: the review
 * page is the only place they are read, and it never opens its reader's own
 * answer.
 *
 * READ BY THE SAME PEOPLE: `readsWorkRatings` is asked before a rating is
 * read anywhere, so a facilitator's review page, and every page of the
 * person's own, carries none.
 *
 * ON WHAT: the week's written answer, once its readers may read it
 * (`workIsReadable`, asked inside the save's transaction with where the week
 * stands), and only with words in it.
 */

/** Why the gate refused: one answer, so a refusal never says whose work exists. */
export type WorkRatingRefusal = { ok: false; status: 403; error: string };

/** Everything the gate read, for the route's next steps. */
export type WorkRatingGate = {
  ok: true;
  run: CourseRunDoc;
  liveGroups: CourseGroupDoc[];
  facts: ReviewerFacts;
  owner: OwnerFacts;
  raterRole: WorkRatingRole;
};

/** Whether the reader gives and reads ratings at all: an admin, or the lead of the programme that names the run. */
export function readsWorkRatings(facts: ReviewerFacts): boolean {
  return facts.isAdmin || facts.isLead;
}

/** As what the reader rates: an admin as an admin, else the programme's lead, whatever else they are on the run. */
export function workRatingRoleOf(facts: ReviewerFacts): WorkRatingRole {
  return facts.isAdmin ? "admin" : "lead";
}

/**
 * May `actor` rate `owner`'s written answer, and read its ratings? An admin
 * or the programme's lead, on an answer the one gate lets them read, never
 * their own. Pure: `reviewerFactsOf` and `ownerFactsOf` did the reads.
 */
export function mayRateWorkOf(
  actor: SessionUser,
  facts: ReviewerFacts,
  owner: OwnerFacts,
  liveGroups: readonly CourseGroupDoc[],
): boolean {
  return readsWorkRatings(facts) && writtenReviewRole(actor, facts, owner, liveGroups).mayReview;
}

/**
 * THE GATE: may `actor` rate `uid`'s work on this run, or clear their own
 * rating of it? Asks who the actor is first, and reads the person's place
 * only for an admin or the programme's lead; nothing of their work. Every
 * refusal is the same 403.
 */
export async function workRatingGate(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  uid: string,
): Promise<WorkRatingGate | WorkRatingRefusal> {
  const refused: WorkRatingRefusal = { ok: false, status: 403, error: "Forbidden" };
  const facts = await reviewerFactsOf(db, actor, runId);
  if (!readsWorkRatings(facts)) return refused;
  const run = await readRunForLock(db, runId);
  if (!run) return refused;
  const liveGroups = await liveGroupsOf(db, runId);
  const owner = await ownerFactsOf(db, runId, uid, liveGroups, { isAdmin: facts.isAdmin });
  if (!owner || !mayRateWorkOf(actor, facts, owner, liveGroups)) return refused;
  return { ok: true, run, liveGroups, facts, owner, raterRole: workRatingRoleOf(facts) };
}
