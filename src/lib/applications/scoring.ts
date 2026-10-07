import { joinedByInvitation } from "./decisions";
import { own } from "./keys";
import {
  questionKey,
  type ApplicationContent,
  type ApplicationDoc,
  type ApplicationFormFields,
  type QuestionSetDoc,
  type ReviewDoc,
} from "./model";
import { rankedProgrammes, streamSetsFor } from "./sections";
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
 * ## A first review is blind to other reviewers, and an admin is never blind
 *
 * A lead or a reviewer is not shown what anybody else gave or wrote about an
 * application until they have saved a review of their own for it. An admin
 * can switch that off for the whole form (`revealOtherReviews`), which
 * changes what leads and reviewers are shown.
 *
 * WHAT "A REVIEW OF THEIR OWN" IS (`firstReviewOf`):
 *
 *  - where there is anything for them to score on the application, every
 *    one of those scores;
 *  - where there is nothing for them to score, an overall comment of their
 *    own.
 *
 * NOTHING TO SCORE IS NOT ALREADY SCORED. A programme can have scores
 * switched off, a stream can have no scored question, and an applicant can
 * leave every scored question blank. None of those is a review, so none of
 * them ends a first review: the reviewer's own overall comment does.
 *
 * IT IS DECIDED ONCE FOR THE APPLICATION, ACROSS EVERY PROGRAMME ON IT THAT
 * THE PERSON HOLDS A ROLE ON, and never for the one programme it happens to
 * be opened under. An overall comment is one text about the whole
 * application, and a comment on a shared answer belongs to no one programme,
 * so somebody who reviews two programmes an applicant ranked has a first
 * review to finish for both before either shows them anybody else's.
 *
 * AN ADMIN IS SHOWN EVERY REVIEW, on every programme, whether or not they
 * have scored and whatever the switch says. An admin runs the term and picks
 * what pooled applicants hear, so the scores are theirs to read from the
 * start. "Admin" is the caller's role on the site, never a role on a
 * programme: a programme's lead who is not an admin still scores blind first.
 * `otherReviewsShownTo` is the whole rule, and every place that hands one
 * person another's score or comment asks it of a {@link Looking} it did not
 * put together itself (`lookingAt` in `review/term.ts` is the one place one
 * is made).
 *
 * Names are not part of this: reviewers see who they are reading.
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

/**
 * Has this reviewer nothing left to score among these answers? True for no
 * answers at all, which is what the list of applications still waiting for a
 * reviewer wants: an applicant who left every scored question blank must not
 * wait for a score for ever.
 *
 * THIS IS NOT WHETHER THEY HAVE REVIEWED ANYTHING, and nothing that decides
 * who is shown another reviewer's work may ask it: "nothing to score" is not
 * a review. That question is {@link firstReviewOf}.
 */
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
 * ONE PERSON READING ONE APPLICATION: everything the blindness rule is
 * decided from, in one object, so that nobody can ask the rule about a
 * single programme's answers.
 */
export type Looking = {
  /**
   * The caller's own standing on the site. Only a strict `true` is an admin:
   * anything else is somebody who reviews blind first.
   */
  viewerIsAdmin: boolean;
  /** The programmes the person holds a role on, by id (`Viewer.roles`). */
  roles: Readonly<Record<string, unknown>>;
  form: Form;
  sets: readonly QuestionSetDoc[];
  /** What the applicant sent. */
  sent: Pick<ApplicationContent, "answers">;
  /**
   * EVERY programme whose list the application is on: the ones it ranked,
   * and the one its owner joined by accepting an invitation.
   */
  listed: readonly string[];
  /** The person's own review row for this applicant, or null when they have none. */
  mine: Pick<ReviewDoc, "scores" | "overallComment"> | null;
};

/** Where one person's first review of one application stands. */
export type FirstReview =
  | { over: true }
  /** They still have answers to score, for these programmes, in the application's order. */
  | { over: false; needs: "scores"; programmeIds: string[] }
  /** There is nothing for them to score, and they have saved no overall comment of their own. */
  | { over: false; needs: "overall-comment" };

/**
 * HAS THIS PERSON SAVED A REVIEW OF THEIR OWN FOR THIS APPLICATION?
 *
 * Every programme the application is listed on that they hold a role on is
 * asked, and all of them have to be finished. Where any of them has an
 * answer to score, the review is every one of those scores. Where none has,
 * it is an overall comment of their own: an empty list of things to score
 * never answers yes by itself.
 */
export function firstReviewOf(looking: Omit<Looking, "viewerIsAdmin">): FirstReview {
  const { roles, form, sets, sent, listed, mine } = looking;
  const unfinished: string[] = [];
  let anythingToScore = false;
  for (const programmeId of listed) {
    if (!own(roles, programmeId)) continue;
    const keys = scorableKeysFor(form, sets, programmeId, sent);
    if (keys.length === 0) continue;
    anythingToScore = true;
    if (keys.some((key) => typeof own(mine?.scores, key) !== "number")) unfinished.push(programmeId);
  }
  if (unfinished.length > 0) return { over: false, needs: "scores", programmeIds: unfinished };
  if (anythingToScore) return { over: true };
  return (mine?.overallComment ?? "").trim() !== ""
    ? { over: true }
    : { over: false, needs: "overall-comment" };
}

/**
 * Is this person shown what other reviewers gave and wrote about this
 * application?
 *
 * An admin always is. Anybody else is once they have saved a review of their
 * own for it ({@link firstReviewOf}), or when an admin has switched
 * first-review blindness off for the form.
 *
 * `viewerIsAdmin` is asked for by every caller, so nobody answers this
 * without deciding who is looking. Only a strict `true` counts: a caller that
 * hands over anything else hides the other reviews rather than showing them.
 */
export function otherReviewsShownTo(looking: Looking): boolean {
  return (
    looking.viewerIsAdmin === true ||
    looking.form.revealOtherReviews === true ||
    firstReviewOf(looking).over
  );
}

/**
 * The reviews one person may be shown: always their own, and everybody else's
 * when `otherReviewsShownTo` says so. That is always, for an admin; for a
 * lead or a reviewer, once they have saved a review of their own or when an
 * admin has switched first-review blindness off.
 */
export function reviewsVisibleTo(
  viewerUid: string,
  reviews: readonly ReviewDoc[],
  looking: Looking,
): ReviewDoc[] {
  if (otherReviewsShownTo(looking)) return [...reviews];
  return reviews.filter((review) => review.reviewerUid === viewerUid);
}

/** How many other people's reviews are being held back from this viewer. Never any, for an admin. */
export function hiddenReviewCount(
  viewerUid: string,
  reviews: readonly ReviewDoc[],
  looking: Looking,
): number {
  return reviews.length - reviewsVisibleTo(viewerUid, reviews, looking).length;
}

/**
 * HAS REVIEWING BEGUN ON A PROGRAMME?
 *
 * It has once any review row says something (a score, a comment on an
 * answer, or an overall comment) about an application on the programme's
 * list: one that ranked it, or whose owner joined it by accepting an
 * invitation. From then on its reviewers are part way through first reviews,
 * and switching its scores on or off changes what they are doing, so that
 * switch is an admin's (`changeProgramme` in `editor/write.ts`).
 *
 * `applications` only has to hold the applications the reviews are about.
 */
export function reviewingHasBegunOn(
  form: Pick<Form, "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating">,
  programmeId: string,
  applications: readonly Pick<ApplicationDoc, "uid" | "sent" | "result" | "invitation">[],
  reviews: readonly Pick<ReviewDoc, "applicantUid" | "scores" | "comments" | "overallComment">[],
): boolean {
  const onItsList = new Set<string>();
  for (const application of applications) {
    if (!application.sent) continue;
    const listed =
      rankedProgrammes(form, application.sent).some((programme) => programme.id === programmeId) ||
      joinedByInvitation(application) === programmeId;
    if (listed) onItsList.add(application.uid);
  }
  return reviews.some(
    (review) =>
      onItsList.has(review.applicantUid) &&
      (Object.keys(review.scores).length > 0 ||
        review.comments.length > 0 ||
        review.overallComment.trim() !== ""),
  );
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
