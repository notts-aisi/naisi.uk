import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";

/**
 * WHO IS IN PITCHING WEEK: the people placed in a run's groups, as the
 * person asking may be shown them.
 *
 * The only reads of placements pitching week makes, and both ask the one
 * question every reader of placements asks (`placementIsShownTo`, about the
 * caller's own role): a seat Publish has not told its owner about is nobody's
 * to see but an admin's, so an untold person cannot pitch or pick, is never
 * offered as somebody's partner, is never named, and their picks are not
 * counted for the lead.
 *
 * A placement here is a LEARNER's active seat in a group. A facilitator's own
 * enrolment is not one: facilitators run the session and do not pitch.
 */

/** The allocation board's ceiling on one run's rows. */
const MAX_ROWS = 500;

function isLiveSeat(enrolment: CourseEnrolmentDoc): boolean {
  return (
    Boolean(enrolment.uid) &&
    enrolment.role === "learner" &&
    enrolment.status === "active" &&
    enrolment.groupId !== null
  );
}

/**
 * The caller's own seat in one of the run's groups, or null. ADDRESSED by its
 * id, so nobody can spell another person's row, and read before anything
 * else about the run: the caller's place is the gate. The seat is an authority
 * the allocation route wrote for an approved account, so the caller's
 * standing is asked again here.
 */
export async function ownSeat(
  db: Firestore,
  runId: string,
  user: SessionUser,
): Promise<CourseEnrolmentDoc | null> {
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, user.uid)).get();
  if (!snap.exists) return null;
  const enrolment = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
  if (enrolment.runId !== runId || !isLiveSeat(enrolment)) return null;
  if (!isNamedWithStanding(user, "courseEnrolments.uid", enrolment.uid)) return null;
  return placementIsShownTo(enrolment, { isAdmin: user.role === "admin" }) ? enrolment : null;
}

/**
 * Every seat on the run that the viewer may be shown. One equality on the
 * run, so no declared index; the group is filtered here by whoever needs it.
 */
export async function seatsOn(
  db: Firestore,
  runId: string,
  viewer: { isAdmin: boolean },
): Promise<CourseEnrolmentDoc[]> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", runId).limit(MAX_ROWS).get();
  return snap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter(isLiveSeat)
    .filter((enrolment) => placementIsShownTo(enrolment, viewer));
}
