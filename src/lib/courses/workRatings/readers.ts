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
 * THE ONE READER OF RATINGS FOR THE TEAM, on the server, for three callers,
 * each after its own gate:
 *
 *  - the review page, after `readsWorkRatings` (`./access.ts`): the ratings
 *    on one person's written answer, and the names they are listed by. One
 *    query, equalities only (`uid` and `runId`), filtered again in memory to
 *    the week and the answer;
 *  - the drafts of a note about a person (privacy v15, "using only the work
 *    they submitted and the feedback, ratings and comments people on the team
 *    gave it"), an admin's alone (`src/lib/courses/weekNotes/gather.ts`): one
 *    person's ratings on a run and a whole week's. Equalities only (`uid` and
 *    `runId`, or `runId` and `weekId`), filtered again in memory;
 *  - a term's Next term page, an admin's alone, after `canRunTerm`
 *    (`src/lib/applications/nextTerm/load.ts`): every rating about the people
 *    a note suggests, which that page narrows to the term's runs and to work
 *    written after each person agreed to version 13. One `in` on `uid`.
 *
 * Nothing here needs a declared index.
 */

/** Firestore's cap on the values one `in` filter takes. */
const IN_FILTER_LIMIT = 30;

function ratingsOf(docs: ReadonlyArray<{ id: string; data: () => unknown }>, keep: (rating: CourseWorkRatingDoc) => boolean): CourseWorkRatingDoc[] {
  return docs.map((doc) => normalizeCourseWorkRating(doc.id, (doc.data() ?? {}) as Record<string, unknown>)).filter(keep);
}

/** Every rating of one person's written answers on a run, every week's and everybody's. */
export async function readPersonRatings(db: Firestore, input: { runId: string; uid: string }): Promise<CourseWorkRatingDoc[]> {
  const snap = await db.collection(COURSE_WORK_RATINGS_COLLECTION).where("uid", "==", input.uid).where("runId", "==", input.runId).get();
  return ratingsOf(snap.docs, (rating) => rating.runId === input.runId && rating.uid === input.uid);
}

/** Every rating on one week of a run, everybody's answers and everybody's ratings. */
export async function readWeekRatings(db: Firestore, input: { runId: string; weekId: string }): Promise<CourseWorkRatingDoc[]> {
  const snap = await db.collection(COURSE_WORK_RATINGS_COLLECTION).where("runId", "==", input.runId).where("weekId", "==", input.weekId).get();
  return ratingsOf(snap.docs, (rating) => rating.runId === input.runId && rating.weekId === input.weekId);
}

/** Every rating on one person's written answer of one week of a run, everybody's. */
export async function readAnswerRatings(
  db: Firestore,
  input: { runId: string; uid: string; weekId: string },
): Promise<CourseWorkRatingDoc[]> {
  const snap = await db.collection(COURSE_WORK_RATINGS_COLLECTION).where("uid", "==", input.uid).where("runId", "==", input.runId).get();
  return ratingsOf(snap.docs, (rating) => rating.runId === input.runId && rating.uid === input.uid && rating.weekId === input.weekId);
}

/**
 * Every rating about these people, on any run and by anybody, as stored: one
 * `in` on `uid` for each 30 people. Asks nobody who is reading, so its one
 * caller, an admin's Next term page, decides that first.
 */
export async function readRatingsAbout(db: Firestore, uids: readonly string[]): Promise<CourseWorkRatingDoc[]> {
  const wanted = [...new Set(uids.filter(Boolean))];
  const out: CourseWorkRatingDoc[] = [];
  for (let at = 0; at < wanted.length; at += IN_FILTER_LIMIT) {
    const chunk = wanted.slice(at, at + IN_FILTER_LIMIT);
    const snap = await db.collection(COURSE_WORK_RATINGS_COLLECTION).where("uid", "in", chunk).get();
    for (const doc of snap.docs) {
      const rating = normalizeCourseWorkRating(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
      if (chunk.includes(rating.uid)) out.push(rating);
    }
  }
  return out;
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
