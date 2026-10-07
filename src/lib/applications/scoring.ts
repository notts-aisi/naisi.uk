import { own } from "./keys";
import {
  questionKey,
  type ApplicationContent,
  type ApplicationFormFields,
  type QuestionSetDoc,
  type ReviewDoc,
} from "./model";
import { streamSetsFor } from "./sections";
import { isAnswered } from "./validate";

/**
 * SCORES, AND WHO SEES WHOSE.
 *
 * Scoring is per answer and optional per programme. Only a stream set's
 * questions can be scored, and only when the programme has scores switched
 * on. A reviewer gives each scored answer 1 to 5. Nothing here is stored
 * beyond those single scores: every average is worked out when it is read, so
 * changing one score never needs a recount.
 *
 * ## The two averages
 *
 *  - A REVIEWER'S score for a programme is the mean of the scores that
 *    reviewer gave its answers.
 *  - THE SECTION SCORE is the mean of the reviewers' scores, one voice each,
 *    so a reviewer who scored two answers does not count twice against one
 *    who scored one.
 *
 * ## A first review is blind to other reviewers
 *
 * Until you have scored every scored answer of a programme for an applicant,
 * you are not shown what anybody else gave or wrote for it. An admin can
 * switch that off for the whole form (`revealOtherReviews`). Names are not
 * part of this: reviewers see who they are reading.
 */

type Form = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating" | "revealOtherReviews"
>;

/** The keys of one programme's scored questions, or none when it does not use scores. */
export function scoredKeysFor(
  form: Form,
  sets: readonly QuestionSetDoc[],
  programmeId: string,
): string[] {
  if (!own(form.programmes, programmeId)?.useScores) return [];
  const keys: string[] = [];
  for (const set of streamSetsFor(form, sets, programmeId)) {
    for (const question of set.questions) {
      if (question.scored) keys.push(questionKey(set.id, question.id));
    }
  }
  return keys;
}

/**
 * Of a programme's scored questions, the ones this applicant answered. An
 * optional scored question left blank has nothing to score, and must not hold
 * a first review open for ever.
 */
export function scorableKeysFor(
  form: Form,
  sets: readonly QuestionSetDoc[],
  programmeId: string,
  sent: Pick<ApplicationContent, "answers">,
): string[] {
  const keys: string[] = [];
  if (!own(form.programmes, programmeId)?.useScores) return keys;
  for (const set of streamSetsFor(form, sets, programmeId)) {
    const given = own(sent.answers, set.id);
    for (const question of set.questions) {
      if (question.scored && isAnswered(own(given, question.id))) {
        keys.push(questionKey(set.id, question.id));
      }
    }
  }
  return keys;
}

/** The mean of a list, or null for an empty one. */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One reviewer's score for a programme: the mean of what they gave its answers. */
export function reviewerScore(review: Pick<ReviewDoc, "scores">, keys: readonly string[]): number | null {
  const given: number[] = [];
  for (const key of keys) {
    const score = own(review.scores, key);
    if (typeof score === "number") given.push(score);
  }
  return mean(given);
}

/** Has this reviewer scored every answer there is to score? Vacuously true for none. */
export function hasScored(review: Pick<ReviewDoc, "scores"> | null, keys: readonly string[]): boolean {
  if (keys.length === 0) return true;
  if (!review) return false;
  return keys.every((key) => typeof own(review.scores, key) === "number");
}

export type SectionScore = {
  /** The mean of the reviewers' scores. Null when nobody has scored. */
  score: number | null;
  /** Each reviewer who gave at least one score, with their own mean. */
  reviewers: { reviewerUid: string; score: number; scoredCount: number }[];
};

/** The section score for one programme, from whichever reviews it is handed. */
export function sectionScore(reviews: readonly ReviewDoc[], keys: readonly string[]): SectionScore {
  const reviewers: SectionScore["reviewers"] = [];
  for (const review of reviews) {
    const score = reviewerScore(review, keys);
    if (score === null) continue;
    const scoredCount = keys.filter((key) => typeof own(review.scores, key) === "number").length;
    reviewers.push({ reviewerUid: review.reviewerUid, score, scoredCount });
  }
  return { score: mean(reviewers.map((r) => r.score)), reviewers };
}

/**
 * The reviews one person may be shown for one programme: always their own,
 * and everybody else's once they have scored, or when an admin has switched
 * first-review blindness off.
 */
export function reviewsVisibleTo(
  viewerUid: string,
  reviews: readonly ReviewDoc[],
  keys: readonly string[],
  form: Pick<ApplicationFormFields, "revealOtherReviews">,
): ReviewDoc[] {
  const own = reviews.find((review) => review.reviewerUid === viewerUid) ?? null;
  if (form.revealOtherReviews || hasScored(own, keys)) return [...reviews];
  return own ? [own] : [];
}

/** How many other people's reviews are being held back from this viewer. */
export function hiddenReviewCount(
  viewerUid: string,
  reviews: readonly ReviewDoc[],
  keys: readonly string[],
  form: Pick<ApplicationFormFields, "revealOtherReviews">,
): number {
  return reviews.length - reviewsVisibleTo(viewerUid, reviews, keys, form).length;
}

/** A score as it is shown: one decimal place, "4.0". */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

/** A review write the route can accept: scores in range, on this programme's keys. */
export function cleanScores(
  given: unknown,
  allowedKeys: readonly string[],
  range: { min: number; max: number },
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!given || typeof given !== "object") return out;
  const allowed = new Set(allowedKeys);
  for (const [key, raw] of Object.entries(given as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof raw !== "number" || !Number.isInteger(raw)) continue;
    if (raw < range.min || raw > range.max) continue;
    out[key] = raw;
  }
  return out;
}
