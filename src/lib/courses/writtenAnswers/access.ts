import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { programmeLedBy } from "../programmeLead";

/**
 * WHO READS A WRITTEN ANSWER AND GIVES FEEDBACK ON IT, IN ONE PLACE (Q30 C;
 * Zach, Mon 26 Oct, on facilitators taking part). The review page, the
 * review route and the review queue card all ask `writtenReviewRole`; none
 * of them decides it again.
 *
 * THE RULE. An answer is read by the person who wrote it, and by its
 * reviewers, who may give feedback on it:
 *  - a fellow's answer (somebody placed in a group): the group's
 *    facilitators, the programme's lead and admins;
 *  - a facilitator's own answer (somebody who facilitates a live group of
 *    the run, holding a place there or not): the programme's lead and admins,
 *    never a co-facilitator or anybody else who facilitates;
 *  - nobody, ever, reviews their own answer, an admin included.
 * Never another fellow. Archived groups staff nobody, as everywhere else.
 * The lead is the lead of the programme that names the run, while they stand
 * (`programmeLedBy`); an admin is anybody with the admin role.
 *
 * WHOSE OPENING LOCKS IT (Q33: "until a facilitator opens it"). An answer
 * locks when one of the people who first read it opens it on the review
 * page: the group's facilitators for a fellow's answer, the lead and admins
 * for a facilitator's own. The lead or an admin looking at a fellow's answer
 * leaves it open to its writer; sending feedback locks it whoever sends it.
 *
 * WHOSE ANSWER CAN BE REVIEWED AT ALL: somebody taking part in the run, a
 * learner placed in a group and told it by Publish (an admin sees a
 * placement before it is told, as everywhere), active or finished, or a
 * facilitator of a live group. Somebody who left, was taken off or never
 * took part has no answer here (`ownerFactsOf` answers null).
 *
 * A FACILITATOR'S OWN WORK IS ONE RULE FOR EVERY KIND OF ANSWER. Its two
 * halves, `facilitatesOnRun` (whose work it is) and `readsFacilitatorsOwnWork`
 * (who reads and reviews it), are asked here and by the summer's exercise
 * answers too: their review route, their review queue and the group page's
 * To review count. None of them decides it again.
 */

/**
 * The run's groups that staff anybody: one equality on the run, archived ones
 * left out, in the one order every page lists a run's groups in.
 */
export async function liveGroupsOf(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  const snap = await db.collection("courseGroups").where("runId", "==", runId).limit(50).get();
  return snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived)
    .sort(compareGroupsByMeeting);
}

/** What the gate needs to know of the person asking. */
export type ReviewerFacts = {
  isAdmin: boolean;
  /** Leads the programme that names the run, and still stands behind it. */
  isLead: boolean;
};

/** Who is asking, as far as the gate cares. The forms are read only for somebody who is not an admin. */
export async function reviewerFactsOf(db: Firestore, actor: SessionUser, runId: string): Promise<ReviewerFacts> {
  const isAdmin = actor.role === "admin";
  return { isAdmin, isLead: isAdmin ? false : (await programmeLedBy(db, actor, runId)) !== null };
}

/** Whose answer it is, as far as the gate cares. */
export type OwnerFacts = {
  uid: string;
  /** The group their place is in, for somebody taking part; null for a facilitator who holds none. */
  placedGroupId: string | null;
};

/**
 * The owner of an answer on this run, or null when they take no part in it
 * (see the module comment). One addressed read: their enrolment.
 */
export async function ownerFactsOf(
  db: Firestore,
  runId: string,
  uid: string,
  liveGroups: readonly CourseGroupDoc[],
  viewer: { isAdmin: boolean },
): Promise<OwnerFacts | null> {
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  const enrolment = snap.exists ? normalizeCourseEnrolment(snap.id, snap.data() ?? {}) : null;
  const placed =
    enrolment !== null &&
    enrolment.role === "learner" &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    enrolment.groupId !== null &&
    liveGroups.some((group) => group.id === enrolment.groupId) &&
    placementIsShownTo(enrolment, viewer);
  const facilitates = facilitatesOnRun(uid, liveGroups);
  if (!placed && !facilitates) return null;
  return { uid, placedGroupId: placed ? enrolment.groupId : null };
}

export type ReviewRole = {
  /** May read the answer and give feedback on it. */
  mayReview: boolean;
  /** Opening it on the review page locks it against its writer. */
  locksOnOpen: boolean;
  /** The owner facilitates a live group of the run: their answer is the lead's and admins'. */
  ownerFacilitates: boolean;
};

/**
 * A FACILITATOR'S OWN WORK, WHOSE IT IS: `uid` facilitates a live group of
 * the run (`liveGroups`, archived ones left out), holding a place there or
 * not. Their answers, written or to the summer's exercises, are then a
 * facilitator's own, and `readsFacilitatorsOwnWork` says who reads them.
 */
export function facilitatesOnRun(uid: string, liveGroups: readonly CourseGroupDoc[]): boolean {
  return Boolean(uid) && liveGroups.some((group) => !group.archived && group.facilitatorUids.includes(uid));
}

/**
 * A FACILITATOR'S OWN WORK, WHO READS IT (Zach, Mon 26 Oct 2026: "read by
 * the programme's lead and admins (not co-facilitators)"): the lead of the
 * programme that names the run and admins read it and review it, and nobody
 * else: never a co-facilitator or anybody else who facilitates, and never its
 * owner, an admin included. `facts` is `reviewerFactsOf`'s answer for the run.
 */
export function readsFacilitatorsOwnWork(actor: Pick<SessionUser, "uid">, facts: ReviewerFacts, ownerUid: string): boolean {
  return Boolean(actor.uid) && actor.uid !== ownerUid && (facts.isAdmin || facts.isLead);
}

/**
 * THE GATE. What `actor` may do with `owner`'s written answer on a run whose
 * live groups are `liveGroups`. Pure: every read it needs is done by
 * `reviewerFactsOf` and `ownerFactsOf`, once per request.
 */
export function writtenReviewRole(
  actor: SessionUser,
  facts: ReviewerFacts,
  owner: OwnerFacts,
  liveGroups: readonly CourseGroupDoc[],
): ReviewRole {
  const ownerFacilitates = facilitatesOnRun(owner.uid, liveGroups);
  // Nobody reviews their own answer, an admin included.
  if (!actor.uid || actor.uid === owner.uid) return { mayReview: false, locksOnOpen: false, ownerFacilitates };
  const staff = facts.isAdmin || facts.isLead;
  if (ownerFacilitates) {
    // A facilitator's own answer: the lead's and admins', never a co-facilitator's.
    const own = readsFacilitatorsOwnWork(actor, facts, owner.uid);
    return { mayReview: own, locksOnOpen: own, ownerFacilitates };
  }
  const group = owner.placedGroupId ? (liveGroups.find((candidate) => candidate.id === owner.placedGroupId) ?? null) : null;
  const facilitatesTheirGroup =
    group !== null && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
  return { mayReview: staff || facilitatesTheirGroup, locksOnOpen: facilitatesTheirGroup, ownerFacilitates };
}

/**
 * Whose answers in one group `actor` may review: its fellows (for a
 * facilitator, every fellow but the group's facilitators), and, for the
 * lead and admins, the group's facilitators' own answers too. The list a
 * review page and a queue card draw from, by the same gate.
 */
export function reviewableIn(
  actor: SessionUser,
  facts: ReviewerFacts,
  group: CourseGroupDoc,
  fellows: readonly OwnerFacts[],
  liveGroups: readonly CourseGroupDoc[],
): OwnerFacts[] {
  const owners: OwnerFacts[] = [...fellows.filter((owner) => owner.placedGroupId === group.id)];
  for (const uid of group.facilitatorUids) {
    if (!owners.some((owner) => owner.uid === uid)) owners.push({ uid, placedGroupId: null });
  }
  return owners.filter((owner) => writtenReviewRole(actor, facts, owner, liveGroups).mayReview);
}
