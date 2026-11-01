import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  COURSE_WORK_RATINGS_COLLECTION,
  normalizeCourseWorkRating,
  type CourseWorkRatingDoc,
  type WorkRatingRole,
} from "@/lib/firestore/courseWorkRatings";
import { cardNamesOf } from "../feedback/readers";
import { teamRatingsOf, type TeamRatingsView } from "./model";

/**
 * THE ONE READER OF RATINGS FOR THE TEAM, on the server, for the review page
 * alone, after its own gate and `readsWorkRatings` (`./access.ts`): the
 * ratings on one person's written answer, and the names they are listed by.
 *
 * One query, equalities only (`uid` and `runId`), filtered again in memory to
 * the week and the answer, so nothing needs a declared index.
 */

/** Every rating on one person's written answer of one week of a run, everybody's. */
export async function readAnswerRatings(
  db: Firestore,
  input: { runId: string; uid: string; weekId: string },
): Promise<CourseWorkRatingDoc[]> {
  const snap = await db.collection(COURSE_WORK_RATINGS_COLLECTION).where("uid", "==", input.uid).where("runId", "==", input.runId).get();
  return snap.docs
    .map((doc) => normalizeCourseWorkRating(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((rating) => rating.runId === input.runId && rating.uid === input.uid && rating.weekId === input.weekId);
}

/**
 * What "Rating for the team" and "What the team said" show `viewer` about one
 * written answer: every rating on it, each rater named by the first word of
 * the name they go by.
 */
export async function loadTeamRatings(
  db: Firestore,
  input: { runId: string; uid: string; weekId: string; itemId: string; viewer: { uid: string; role: WorkRatingRole } },
): Promise<TeamRatingsView> {
  const ratings = await readAnswerRatings(db, input);
  const names = await cardNamesOf(db, [input.viewer.uid, ...ratings.map((rating) => rating.raterUid)]);
  return teamRatingsOf(ratings, input.itemId, names.firstName, input.viewer);
}
