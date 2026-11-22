import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { BEST_ANSWERS_COLLECTION, PANGRAM_CHECKS_COLLECTION } from "@/lib/courses/coursework/collections";
import { PITCHES_COLLECTION } from "@/lib/courses/pitching/model";
import { TEAM_ENTRIES_COLLECTION } from "@/lib/courses/teamPage/model";
import { CHECK_IN_WEEKS_COLLECTION } from "@/lib/firestore/checkInWeeks";
import { COURSE_EXPLAINERS_COLLECTION } from "@/lib/firestore/courseExplainers";
import { COURSE_FEEDBACK_COLLECTION } from "@/lib/firestore/courseFeedback";
import { COURSE_GROUP_SHARED_NOTES_COLLECTION } from "@/lib/firestore/courseGroupSharedNotes";
import { HAND_REMINDERS_COLLECTION } from "@/lib/firestore/courseHandReminders";
import { COURSE_MATERIAL_NOTES_COLLECTION } from "@/lib/firestore/courseMaterialNotes";
import { COURSE_NOTE_DRAFTS_COLLECTION } from "@/lib/firestore/courseNoteDrafts";
import { COURSE_PACKS_AND_CASES_COLLECTION } from "@/lib/firestore/coursePacksAndCases";
import { COURSE_PAIRS_COLLECTION } from "@/lib/firestore/coursePairs";
import { COURSE_PREDICTIONS_COLLECTION } from "@/lib/firestore/coursePredictions";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { COURSE_SESSION_REPORTS_COLLECTION } from "@/lib/firestore/courseSessionReports";
import { COURSE_WEEK_REVIEWS_COLLECTION } from "@/lib/firestore/courseWeekReviews";
import { COURSE_WEEK_WORK_COLLECTION } from "@/lib/firestore/courseWeekWork";
import { COURSE_WORK_LOG_COLLECTION } from "@/lib/firestore/courseWorkLog";
import { COURSE_WORK_RATINGS_COLLECTION } from "@/lib/firestore/courseWorkRatings";
import { SCHEDULER_MARKERS_COLLECTION } from "@/lib/firestore/schedulerMarkers";

/**
 * HOW MANY ROWS THE SITE KEEPS AGAINST A RUN'S WEEKS, for the week plan's
 * check that nothing is kept against them before a week or a break moves or
 * goes (`./facts.ts`). COUNTS ONLY: one count query per collection, on the
 * field that names the run, so no row is read, no name and no word of
 * anybody's leaves this file, and nothing is written. `tx` given, every
 * count is the transaction's, so a row that lands before the change commits
 * is counted.
 *
 * Every collection whose rows name a week by its number or its address is in
 * one of the two lists, or is written down with why it need not be, in
 * `tests/course-week-plan.test.mjs`, which walks `src/lib/firestore`.
 */

/** A collection, and the field on each of its rows that names the run. */
export type WeekKeyed = readonly [collection: string, runField: string];

/** People's work on the run, each found by a week's number or address. */
export const WORK_COLLECTIONS: readonly WeekKeyed[] = [
  ["courseProgress", "runId"],
  ["courseExerciseResponses", "runId"],
  [COURSE_PACKS_AND_CASES_COLLECTION, "runId"],
  [COURSE_WEEK_WORK_COLLECTION, "runId"],
  [COURSE_WORK_LOG_COLLECTION, "runId"],
  [COURSE_FEEDBACK_COLLECTION, "runId"],
  [COURSE_WORK_RATINGS_COLLECTION, "runId"],
  [COURSE_PAIRS_COLLECTION, "runId"],
  [BEST_ANSWERS_COLLECTION, "runId"],
  [PANGRAM_CHECKS_COLLECTION, "runId"],
  [COURSE_PREDICTIONS_COLLECTION, "runId"],
  [PITCHES_COLLECTION, "runId"],
  [TEAM_ENTRIES_COLLECTION, "runId"],
];

/** The run's records about its weeks: registers, reviews, notes, requests, check-ins, reminders, My Work's rows. */
export const RECORD_COLLECTIONS: readonly WeekKeyed[] = [
  ["courseAttendance", "runId"],
  [COURSE_WEEK_REVIEWS_COLLECTION, "runId"],
  [COURSE_MATERIAL_NOTES_COLLECTION, "runId"],
  [COURSE_NOTE_DRAFTS_COLLECTION, "runId"],
  [COURSE_EXPLAINERS_COLLECTION, "runId"],
  [COURSE_SESSION_REPORTS_COLLECTION, "runId"],
  [COURSE_GROUP_SHARED_NOTES_COLLECTION, "runId"],
  [COURSE_REQUESTS_COLLECTION, "runId"],
  [CHECK_IN_WEEKS_COLLECTION, "runId"],
  [HAND_REMINDERS_COLLECTION, "runId"],
  ["tasks", "sourceRef.cohortId"],
];

/** How many rows of the run each list holds, and the run's own list of applications, for the removal question's line. */
export async function countWeekKept(
  db: Firestore,
  runId: string,
  tx?: Transaction,
): Promise<{ work: number; records: number; applications: number }> {
  const count = async ([collection, field]: WeekKeyed) => {
    const aggregate = db.collection(collection).where(field, "==", runId).count();
    const snap = tx ? await tx.get(aggregate) : await aggregate.get();
    return snap.data().count;
  };
  const sum = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0);
  const [work, records, applications] = await Promise.all([
    Promise.all(WORK_COLLECTIONS.map(count)),
    Promise.all(RECORD_COLLECTIONS.map(count)),
    count(["courseApplications", "runId"]),
  ]);
  return { work: sum(work), records: sum(records), applications };
}

/** The most values one `in` filter takes. */
const IN_LIMIT = 30;

/**
 * How many of the scheduler's markers for the run's groups are about a
 * session (a reminder before it, after it or about its register): each
 * carries the session's key, "w03". Read by group, for the key alone.
 */
export async function countSessionMarkers(db: Firestore, groupIds: readonly string[], tx?: Transaction): Promise<number> {
  let found = 0;
  for (let i = 0; i < groupIds.length; i += IN_LIMIT) {
    const query = db.collection(SCHEDULER_MARKERS_COLLECTION).where("groupId", "in", groupIds.slice(i, i + IN_LIMIT)).select("sessionKey");
    const snap = tx ? await tx.get(query) : await query.get();
    found += snap.docs.filter((doc) => typeof doc.get("sessionKey") === "string").length;
  }
  return found;
}
