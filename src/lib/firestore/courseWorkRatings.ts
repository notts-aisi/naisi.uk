/**
 * RATINGS FOR THE TEAM (privacy v15, "Ratings for the team": the people
 * running a programme may rate a person's written work and comment on it for
 * each other; the person is never shown these ratings or comments).
 *
 * `courseWorkRatings/{runId}__{uid}__{weekId}__{raterUid}`: ONE PERSON ON THE
 * TEAM'S RATING OF ONE PERSON'S WRITTEN ANSWER, one per rater per answer (a
 * week has one written answer), which its rater changes or clears.
 *  - `runId`, `uid` (whose work it is), `weekId`, `weekNumber`, and `itemId`
 *    (the written answer's block id), so it says what was rated.
 *  - `rating`: a whole number from 1 to 10. `comment`: words meant only for
 *    the team, never the person. Both are required.
 *  - `raterUid`, `raterRole`: who rated it, and as what (an `admin`, or the
 *    programme's `lead`), stored when it is saved.
 *  - `programmeLabel`: the programme's name when it was first rated ("AGI
 *    Strategy, Autumn 2026"), so it still says where it came from once the
 *    run has gone, as the notes kept about a person do.
 *  - `createdAt`, `updatedAt`.
 *
 * NOT THE RATINGS AT A PROGRAMME'S END. Those are `programmeRatings`
 * (`src/lib/ratings/`), given by facilitators on the Ratings tab, and they
 * alone go to Kairos. Nothing here is read by the Ratings tab or the Kairos
 * file.
 *
 * WHO READS IT: the ratings route and the review page, on the Admin SDK,
 * after their own gates (`src/lib/courses/workRatings/`): admins and the lead
 * of the programme that names the run, never a facilitator as such and never
 * the person rated. `firestore.rules` refuses every browser, admins included.
 *
 * WHAT TAKES IT AWAY: deleting the account of the person rated or of its
 * rater (by `uid` and by `raterUid`). Destroying the run keeps it, with the
 * programme's name and the week; an admin clears out those about people who
 * have left the society by hand, once a year.
 *
 * Pure, with no imports, so a page in the browser can read the shape.
 */

export const COURSE_WORK_RATINGS_COLLECTION = "courseWorkRatings";

/** As what a rating was given: by an admin, or by the lead of the programme that names the run. */
export const WORK_RATING_ROLES = ["lead", "admin"] as const;
export type WorkRatingRole = (typeof WORK_RATING_ROLES)[number];

/** The scale: a whole number from 1 (weak) to 10 (exceptional). */
export const WORK_RATING_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** The caps a comment is held to, as feedback's are. */
export const WORK_RATING_LIMITS = { words: 300, chars: 3_000 } as const;

/**
 * The document's id: one per rater per person per week. CONSTRUCT-ONLY: the
 * parts are stored as fields, and a run's id can itself hold `__`, so nothing
 * ever splits it.
 */
export function courseWorkRatingId(runId: string, uid: string, weekId: string, raterUid: string): string {
  return `${runId}__${uid}__${weekId}__${raterUid}`;
}

/** A rating on the scale: a whole number from 1 to 10. */
export function isWorkRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

/** One rating, read. */
export type CourseWorkRatingDoc = {
  id: string;
  runId: string;
  uid: string;
  weekId: string;
  weekNumber: number;
  itemId: string;
  /** Null for a stored value off the scale, which no reader shows. */
  rating: number | null;
  comment: string;
  raterUid: string;
  raterRole: WorkRatingRole;
  programmeLabel: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Raw = Record<string, unknown>;

function instant(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A stored rating, read. Never throws. */
export function normalizeCourseWorkRating(id: string, data: Raw): CourseWorkRatingDoc {
  return {
    id,
    runId: str(data.runId),
    uid: str(data.uid),
    weekId: str(data.weekId),
    weekNumber: typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber > 0 ? data.weekNumber : 0,
    itemId: str(data.itemId),
    rating: isWorkRating(data.rating) ? data.rating : null,
    comment: str(data.comment),
    raterUid: str(data.raterUid),
    raterRole: data.raterRole === "lead" ? "lead" : "admin",
    programmeLabel: str(data.programmeLabel),
    createdAt: instant(data.createdAt),
    updatedAt: instant(data.updatedAt),
  };
}
