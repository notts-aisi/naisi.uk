import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  visitInWeek,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";

/**
 * WHO READS A VISITOR'S WORK: the one new rule of a one-week visit, a SECOND
 * ANSWER beside the written work's gate (`writtenReviewRole` in
 * `src/lib/courses/writtenAnswers/access.ts`), which is unchanged.
 *
 * A facilitator of the HOST group, who still stands behind the role, may READ
 * the visitor's work for the visit's week, from the moment the visit is
 * arranged and for as long as it stands: their reflections, their written
 * answer as its readers may read it, their fill-in boxes. That is all. They
 * may not give feedback, rate, reopen the week, or lock anything by opening
 * it, and they are never shown another week, the private notes on the
 * material, a rating, or the feedback the visitor's own group's facilitators
 * wrote. Reading it counts as a first read like anybody's on the team.
 *
 * So every caller of the gate keeps asking it, and the gate says no to a host
 * facilitator as it always did: giving feedback, ratings, reopening a week,
 * Feedback to write, the facilitator's week, the review page and the page of
 * one question across the host's group. Three callers ask this as well: the
 * reading view's door from the host's group page (that week alone), the
 * fill-in boxes route (that week alone), and the first read (that week
 * alone). The visitor's own group's facilitators, the programme's lead and
 * admins read and give feedback exactly as before.
 */

/** The facts of a place the rule reads. */
export type VisitorSeat = Pick<CourseEnrolmentDoc, "uid" | "runId" | "role" | "status" | "groupId" | "visits" | "selfEnrolled" | "allocatedEmailAt">;

/**
 * Whether `actor` reads `seat`'s work for `weekNumber` as a facilitator of the
 * host group of a one-week visit in that week. Pure: the run's live groups are
 * handed in.
 */
export function hostReadsWeek(actor: SessionUser, seat: VisitorSeat | null, liveGroups: readonly CourseGroupDoc[], weekNumber: number): boolean {
  if (!seat || !actor.uid || actor.uid === seat.uid) return false;
  if (seat.role !== "learner" || (seat.status !== "active" && seat.status !== "completed") || !seat.groupId) return false;
  // A placement Publish has not told its owner about is nobody's to read yet, as the boxes' gate says it.
  if (!placementIsShownTo(seat, { isAdmin: false })) return false;
  // A facilitator's own work is the lead's and admins' alone; such a place has no visit anyway.
  if (liveGroups.some((group) => group.facilitatorUids.includes(seat.uid))) return false;
  const visit = visitInWeek(seat, weekNumber);
  if (!visit || visit.groupId === seat.groupId) return false;
  const host = liveGroups.find((group) => group.id === visit.groupId && group.runId === seat.runId) ?? null;
  return host !== null && isNamedWithStanding(actor, "courseGroups.facilitatorUids", host.facilitatorUids);
}

/** The weeks of `seat`'s visits whose host is `groupId`, in week order. */
export function weeksVisiting(seat: Pick<CourseEnrolmentDoc, "visits"> | null, groupId: string): number[] {
  return (seat?.visits ?? []).filter((visit) => visit.groupId === groupId).map((visit) => visit.weekNumber);
}

/** The same, reading the place and the run's live groups: one addressed read and one equality on the run. */
export async function hostReadsWeekOf(db: Firestore, actor: SessionUser, runId: string, uid: string, weekNumber: number): Promise<boolean> {
  if (!actor.uid || actor.uid === uid || !Number.isInteger(weekNumber)) return false;
  const [placeSnap, groupSnap] = await Promise.all([
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
  ]);
  const seat = placeSnap.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  if (!seat || seat.runId !== runId || seat.uid !== uid) return false;
  const liveGroups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => !group.archived && group.runId === runId);
  return hostReadsWeek(actor, seat, liveGroups, weekNumber);
}
