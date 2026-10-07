import { formatRunStartShort } from "@/lib/courses/window";
import {
  BORDERLINE_MARGIN,
  isInTerm,
  owesDecision,
  placementFor,
  recommendationsFor,
  standingWith,
  type ScoredApplicant,
} from "../decisions";
import type { ApplicationDoc, QuestionSetDoc, ReviewDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import {
  formatScore,
  hasScored,
  reviewsVisibleTo,
  scorableKeysFor,
  sectionScore,
} from "../scoring";
import { emptyMap, own, programmeOn } from "./own";
import { applicantDetail, applicantName } from "./people";
import { newestFirst, placesLeftOn, type TermPicture, type Viewer } from "./term";
import type {
  ApplicationRow,
  BoardRecommendations,
  ProgrammeBoard,
  RecommendationGroup,
} from "./types";

/**
 * ONE PROGRAMME'S APPLICATIONS, AS ONE CALLER MAY SEE THEM.
 *
 * Built field by field from the term's picture. Three things are decided here
 * and nowhere else on the list:
 *
 *  - THE SCORE COLUMN IS BLIND TOO. A row's section score is worked out from
 *    the reviews `reviewsVisibleTo` hands this caller, so somebody who has not
 *    scored an applicant reads "Not scored yet" whatever anybody else gave.
 *    The recommendations are made from the same numbers, so they cannot say
 *    what the column will not.
 *  - A SCORE FROM ANOTHER PROGRAMME is shown to a caller only for an
 *    applicant whose first review they have finished, so it cannot lean on a
 *    score they have yet to give.
 *  - NO ADDRESS. A row carries a name and a degree and never an email.
 *
 * EVERY NUMBER HERE IS OF THE PEOPLE IN THE TERM (`isInTerm`). Somebody who
 * withdrew, or gave a place or an invitation back, keeps their row, marked
 * `withdrawn`, with the standing the decision documents still record. They
 * are in no count, they are not in the queue "Review next" walks, they are
 * not among the people the scores recommend for a place, and their row names
 * no programme they are placed on, because they hold no place.
 *
 * Pure, with no server import: the route gates the caller and loads the
 * documents, and hands them here.
 */

/** A row with the numbers the recommendations need, before they are dropped. */
type Working = {
  row: ApplicationRow;
  elsewhere: Record<string, number | null>;
  /** The caller has given every score there is to give this applicant here. */
  viewerHasScored: boolean;
  /** Decision day has published this person's outcome and emailed them. */
  emailed: boolean;
  /** Part of the term's arithmetic. False for a withdrawn application. */
  inTerm: boolean;
};

function commentCount(reviews: readonly ReviewDoc[]): number {
  return reviews.reduce((total, review) => total + review.comments.length, 0);
}

function buildRow(input: {
  form: ApplicationForm;
  sets: readonly QuestionSetDoc[];
  term: TermPicture;
  viewer: Viewer;
  programmeId: string;
  application: ApplicationDoc;
  pendingUids: ReadonlySet<string>;
}): Working | null {
  const { form, sets, term, viewer, programmeId, application, pendingUids } = input;
  const sent = application.sent;
  if (!sent) return null;
  const ranked = term.ranked.get(application.uid) ?? [];
  const at = ranked.indexOf(programmeId);
  if (at === -1) return null;

  const decision = term.decisions.get(application.uid) ?? null;
  const reviews = term.reviews.get(application.uid) ?? [];
  const keys = scorableKeysFor(form, sets, programmeId, sent);
  const mine = reviews.find((review) => review.reviewerUid === viewer.uid) ?? null;
  const viewerHasScored = hasScored(mine, keys);
  const score = sectionScore(reviewsVisibleTo(viewer.uid, reviews, keys, form), keys).score;

  // Another programme's section score, for "scored higher on its questions".
  // Held back while this caller's own first review of the applicant is open.
  const firstReviewDone = form.revealOtherReviews || viewerHasScored;
  const elsewhere = emptyMap<number | null>();
  for (const otherId of ranked) {
    if (otherId === programmeId || !programmeOn(form, otherId)?.useScores) continue;
    if (!firstReviewDone) {
      elsewhere[otherId] = null;
      continue;
    }
    const otherKeys = scorableKeysFor(form, sets, otherId, sent);
    const seen = own(viewer.roles, otherId)
      ? reviewsVisibleTo(viewer.uid, reviews, otherKeys, form)
      : reviews;
    elsewhere[otherId] = sectionScore(seen, otherKeys).score;
  }

  const standing = standingWith(decision, programmeId);
  const owes = owesDecision(ranked, decision, programmeId);
  // Somebody who has left the term holds no place, whatever was decided.
  const inTerm = isInTerm(application);
  const placement = inTerm ? placementFor(ranked, decision) : null;
  const name = applicantName(sent.aboutYou, application.displayName);
  const detail = applicantDetail(sent.aboutYou);
  const rankedNames = ranked.map((id) => programmeOn(form, id)?.shortName ?? "");
  const appliedAt = application.submittedAt ?? application.sentAt;

  return {
    viewerHasScored,
    elsewhere,
    // A declined application is published and not emailed.
    emailed: application.result !== null && application.result.kind !== "declined",
    inTerm,
    row: {
      uid: application.uid,
      name,
      detail,
      accountWaiting: pendingUids.has(application.uid),
      withdrawn: application.status === "withdrawn",
      choice: at + 1,
      firstChoiceName: at === 0 ? null : (programmeOn(form, ranked[0])?.shortName ?? null),
      score: score === null ? null : formatScore(score),
      scoreValue: score,
      wantsToFacilitate: sent.wantsToFacilitate === true,
      comments: commentCount(reviews),
      standing,
      owesDecision: owes,
      placedOn:
        standing === "to-review" && !owes && placement
          ? (programmeOn(form, placement)?.shortName ?? null)
          : null,
      appliedAt: appliedAt ? appliedAt.toISOString() : null,
      searchText: [name, detail, ...rankedNames].join(" ").toLowerCase(),
    },
  };
}

function recommendationsOf(
  form: ApplicationForm,
  programmeId: string,
  working: readonly Working[],
): BoardRecommendations {
  const places = programmeOn(form, programmeId)?.places ?? null;
  // The scores recommend people for places, so only people still in the term.
  const scored: ScoredApplicant[] = working.filter(({ inTerm }) => inTerm).map(({ row, elsewhere }) => ({
    uid: row.uid,
    choice: row.choice,
    score: row.scoreValue,
    elsewhere,
  }));
  const found = recommendationsFor(scored, places);
  const scoredCount = scored.filter((applicant) => applicant.score !== null).length;

  // One line per programme people scored higher on, in the form's own order.
  const groups: RecommendationGroup[] = [];
  for (const otherId of form.programmeIds) {
    const uids = found.scoredHigherElsewhere
      .filter((entry) => entry.programmeId === otherId)
      .map((entry) => entry.uid);
    if (uids.length === 0) continue;
    groups.push({
      programmeId: otherId,
      shortName: programmeOn(form, otherId)?.shortName ?? "",
      uids,
    });
  }

  const choiceOf = new Map(working.map(({ row }) => [row.uid, row.choice]));
  return {
    scoredCount,
    cutoff: found.cutoff === null ? null : formatScore(found.cutoff),
    fillsPlaces: places !== null && places > 0 && found.top.length >= places,
    top: found.top,
    borderline: found.borderline,
    margin: String(BORDERLINE_MARGIN),
    rankedLower: found.rankedLower,
    rankedLowerAllSecond: found.rankedLower.every((uid) => choiceOf.get(uid) === 2),
    scoredHigherElsewhere: groups,
  };
}

export function buildProgrammeBoard(input: {
  form: ApplicationForm;
  sets: readonly QuestionSetDoc[];
  term: TermPicture;
  viewer: Viewer;
  programmeId: string;
  canDecide: boolean;
  /** Applicants whose account is still waiting to be approved. */
  pendingUids: ReadonlySet<string>;
  /** First names of the committee, by uid. */
  staffNames: ReadonlyMap<string, string>;
}): ProgrammeBoard | null {
  const { form, sets, term, viewer, programmeId, canDecide, pendingUids, staffNames } = input;
  const programme = programmeOn(form, programmeId);
  const role = own(viewer.roles, programmeId);
  if (!programme || !role) return null;

  const working: Working[] = [];
  for (const application of term.applications) {
    const built = buildRow({ form, sets, term, viewer, programmeId, application, pendingUids });
    if (built) working.push(built);
  }
  working.sort((a, b) => newestFirst(a.row, b.row));

  const tally = own(term.tally.programmes, programmeId);
  const decided = tally ? tally.accepted + tally.pooled + tally.declined : 0;
  const applications = tally?.applications ?? 0;
  const toReview = tally?.toReview ?? 0;

  // Somebody who decides is left with whoever is still owed a decision. A
  // reviewer cannot decide, so what they have left is whoever they have not
  // finished scoring.
  const queue = working
    .filter(({ row, viewerHasScored, inTerm }) => {
      // Nobody is waiting on an application its owner has taken out.
      if (!inTerm || !row.owesDecision) return false;
      return canDecide || !programme.useScores || !viewerHasScored;
    })
    .map(({ row }) => row.uid);

  return {
    round: {
      id: form.round.id,
      label: form.round.label,
      decisionDay: form.round.decisionsByDate
        ? (formatRunStartShort(form.round.decisionsByDate) ?? null)
        : null,
      decisionsSent: form.decisionsSentAt !== null,
    },
    programme: {
      id: programme.id,
      name: programme.name,
      shortName: programme.shortName,
      places: programme.places,
      usesScores: programme.useScores,
      leadName: programme.leadUid ? (staffNames.get(programme.leadUid) ?? null) : null,
    },
    viewer: { role, canDecide },
    progress: {
      applications,
      decided,
      toReview,
      placedElsewhere: Math.max(0, applications - decided - toReview),
      emailed: working.filter((entry) => entry.inTerm && entry.emailed).length,
      placed: tally?.placed ?? 0,
      invited: tally?.invited ?? 0,
      placesLeft: placesLeftOn(form, term, programmeId),
    },
    counts: {
      all: applications,
      toReview,
      accepted: tally?.accepted ?? 0,
      pooled: tally?.pooled ?? 0,
      declined: tally?.declined ?? 0,
    },
    queue,
    recommendations: programme.useScores ? recommendationsOf(form, programmeId, working) : null,
    rows: working.map(({ row }) => row),
  };
}
