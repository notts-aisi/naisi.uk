import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  courseEnrolmentId,
  enrolmentHasLeft,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";

/**
 * A PERSON'S OWN SEAT ON A RUN, as a survey asks whether it is still theirs:
 * read by its one id, and only once Publish has told them of it. The cards of
 * the surveys waiting for somebody (`./waiting.ts`) and a check-in's reminder
 * the morning after (`./checkIns/remind.ts`) ask these, so the two never
 * disagree about whose a check-in still is. Nothing of a seat is shown.
 */

/**
 * The person's own seat on a run once Publish has told them of it, or null.
 * Their own seat only, and nothing of it is shown. A seat Publish has not told
 * them about is no seat they left and no seat they are on.
 */
async function toldSeatOn(db: Firestore, runId: string, uid: string): Promise<CourseEnrolmentDoc | null> {
  if (!runId || runId.includes("/")) return null;
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  if (!snap.exists) return null;
  const seat = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
  return seat.uid === uid && seat.runId === runId && placementIsTold(seat) ? seat : null;
}

/** Whether the person's own told seat on a run says they left it: leaving needs a seat they were told, and keeps the stamp. */
export async function leftTheRun(db: Firestore, runId: string, uid: string): Promise<boolean> {
  const seat = await toldSeatOn(db, runId, uid);
  return seat !== null && enrolmentHasLeft(seat.status);
}

/** Whether the person's own told seat on a run is live: told by Publish and not left. */
export async function onTheRun(db: Firestore, runId: string, uid: string): Promise<boolean> {
  const seat = await toldSeatOn(db, runId, uid);
  return seat !== null && !enrolmentHasLeft(seat.status);
}
