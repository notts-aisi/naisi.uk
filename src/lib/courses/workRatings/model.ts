import {
  WORK_RATING_SCALE,
  type CourseWorkRatingDoc,
  type WorkRatingRole,
} from "@/lib/firestore/courseWorkRatings";

/**
 * RATINGS FOR THE TEAM, AS THE REVIEW PAGE DRAWS THEM (privacy v15, "Ratings
 * for the team"): one rating from 1 to 10 with a comment for the team, per
 * person rating, on one written answer. Given and read by admins and the lead
 * of the programme that names the run (`./access.ts`), never by a
 * facilitator as such and never by the person rated, so nothing here is ever
 * part of what a member's pages or a facilitator's are handed.
 *
 * Not the ratings at a programme's end (`src/lib/ratings/`, the Ratings tab),
 * which facilitators give and which go to Kairos: these never do.
 *
 * Pure: no reads, no clock. The review page in the browser imports it.
 */

export { WORK_RATING_SCALE };
export type { WorkRatingRole };

/** One rating as the review page lists it under "What the team said". */
export type TeamRatingRow = {
  raterUid: string;
  /** The first word of the name the rater goes by, or "" when no account is on record. */
  name: string;
  role: WorkRatingRole;
  rating: number;
  comment: string;
  /** ISO 8601: when it was first given. */
  at: string | null;
  /** ISO 8601: its last change, or null when it was never changed. */
  changedAt: string | null;
  /** The reader gave it. */
  mine: boolean;
};

/**
 * The ratings on one written answer, for a reader who may read them: what
 * "Rating for the team" changes and "What the team said" lists.
 */
export type TeamRatingsView = {
  /** The written answer they are on, by its block's id: what a save names. */
  itemId: string;
  /** The reader's own rating, which the form changes or clears; null before they rate. */
  mine: TeamRatingRow | null;
  /** Every rating on the answer, the reader's own among them, oldest first. */
  said: TeamRatingRow[];
  /** The reader, for the line that says they have not rated it yet. */
  viewer: { uid: string; name: string; role: WorkRatingRole };
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * The view of one answer's ratings from what is stored. Only ratings on the
 * scale, by a rater on record, on this answer, are kept; oldest first.
 * `nameOf` answers the first word of the name a rater goes by.
 */
export function teamRatingsOf(
  ratings: readonly CourseWorkRatingDoc[],
  itemId: string,
  nameOf: (uid: string) => string,
  viewer: { uid: string; role: WorkRatingRole },
): TeamRatingsView {
  const said = ratings
    .filter((stored) => stored.rating !== null && stored.raterUid !== "" && stored.itemId === itemId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.raterUid.localeCompare(b.raterUid))
    .map(
      (stored): TeamRatingRow => ({
        raterUid: stored.raterUid,
        name: nameOf(stored.raterUid),
        role: stored.raterRole,
        rating: stored.rating as number,
        comment: stored.comment,
        at: iso(stored.createdAt),
        changedAt:
          stored.updatedAt && stored.createdAt && stored.updatedAt.getTime() > stored.createdAt.getTime() ? iso(stored.updatedAt) : null,
        mine: stored.raterUid === viewer.uid,
      }),
    );
  return {
    itemId,
    mine: said.find((row) => row.mine) ?? null,
    said,
    viewer: { uid: viewer.uid, name: nameOf(viewer.uid), role: viewer.role },
  };
}
