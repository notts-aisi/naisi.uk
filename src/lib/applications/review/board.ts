import { formatRunStartShort } from "@/lib/courses/window";
import {
  BORDERLINE_MARGIN,
  hasBeenTold,
  isInTerm,
  owesDecision,
  placementFor,
  recommendationsFor,
  standingWith,
  type ScoredApplicant,
} from "../decisions";
import type { ApplicationDoc, QuestionSetDoc, ReviewDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { gaveBackOf } from "../status/reasons";
import {
  formatScore,
  hasScored,
  otherReviewsShownTo,
  reviewsVisibleTo,
  scorableKeysFor,
  sectionScore,
} from "../scoring";
import { changeCount, versionsOf } from "../versions/kept";
import { dayOf } from "./earlier";
import { emptyMap, own, programmeOn } from "./own";
import { applicantDetail, applicantName } from "./people";
import { lookingAt, newestFirst, placesLeftOn, type TermPicture, type Viewer } from "./term";
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
 *    the reviews `reviewsVisibleTo` hands this caller, so a lead or a
 *    reviewer who has not finished their own review of an applicant reads
 *    "Not scored yet" whatever anybody else gave. The recommendations are
 *    made from the same numbers, so they cannot say what the column will not.
 *    Whether it is finished is decided for the application, across every
 *    programme on it that the caller reviews (`lookingAt`), and not for this
 *    list's programme alone.
 *  - A SCORE FROM ANOTHER PROGRAMME is shown to a caller only for an
 *    applicant whose first review they have finished, so it cannot lean on a
 *    score they have yet to give.
 *  - AN ADMIN IS NEVER BLIND. Both of those are `otherReviewsShownTo`'s
 *    answer, and for an admin it is always yes: an admin's list carries every
 *    section score, and the recommendations made from them, without the
 *    admin scoring anybody first.
 *  - NO ADDRESS. A row carries a name and a degree and never an email.
 *  - A ROW SAYS WHEN ITS APPLICATION CHANGED after it was first sent, and
 *    carries nothing of what it said before. The earlier versions are for
 *    the screen that reads one application (`detail.ts`).
 *
 * EVERY NUMBER HERE IS OF THE PEOPLE IN THE TERM (`isInTerm`). Somebody who
 * withdrew, or gave a place or an invitation back, keeps their row, marked
 * `withdrawn`, with the standing the decision documents still record. They
 * are in no count, they are not in the queue "Review next" walks, they are
 * not among the people the scores recommend for a place, and their row names
 * no programme they are placed on, because they hold no place. A row that
 * left by a reply says which button was pressed and the reason given with it
 * (`gaveBack`): the committee may be able to offer something that works.
 *
 * SOMEBODY WHO JOINED BY INVITATION HAS A ROW, marked `byInvitation`. They
 * did not rank the programme, so nothing about their row is a choice, a score
 * or a decision owed: it stands as accepted, it is never in the queue, and
 * the scores recommend nobody on account of it. While they are in the term
 * they are counted as an application decided and accepted, which is what the
 * head's places line already says of them. Nobody has a row for an
 * invitation that is only picked, or sent and not yet answered.
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
  // On this list by an invitation they accepted, and not by their ranking.
  const byInvitation = at === -1 && term.joined.get(application.uid) === programmeId;
  if (at === -1 && !byInvitation) return null;

  const decision = term.decisions.get(application.uid) ?? null;
  const reviews = term.reviews.get(application.uid) ?? [];
  const keys = scorableKeysFor(form, sets, programmeId, sent);
  const mine = reviews.find((review) => review.reviewerUid === viewer.uid) ?? null;
  // For the queue: has this caller anything left to score here? Not whether
  // they have reviewed, which is the rule asked below.
  const viewerHasScored = hasScored(mine, keys);
  // Whose work this caller is shown is decided once for the application,
  // across every programme on it that they review.
  const looking = lookingAt({ form, sets, term, viewer, application });
  if (!looking) return null;
  const score = sectionScore(reviewsVisibleTo(viewer.uid, reviews, looking), keys).score;

  // Another programme's section score, for "scored higher on its questions".
  // Held back while this caller's own first review of the applicant is open,
  // which an admin's never is.
  const firstReviewDone = otherReviewsShownTo(looking);
  const elsewhere = emptyMap<number | null>();
  for (const otherId of ranked) {
    if (otherId === programmeId || !programmeOn(form, otherId)?.useScores) continue;
    elsewhere[otherId] = firstReviewDone
      ? sectionScore(reviews, scorableKeysFor(form, sets, otherId, sent)).score
      : null;
  }

  // An invitation accepted is a place accepted: nobody decided it here.
  const standing = byInvitation ? "accepted" : standingWith(decision, programmeId);
  const owes = owesDecision(ranked, decision, programmeId);
  // Somebody who has left the term holds no place, whatever was decided.
  const inTerm = isInTerm(application);
  const placement = inTerm ? placementFor(ranked, decision) : null;
  const name = applicantName(sent.aboutYou, application.displayName);
  const detail = applicantDetail(sent.aboutYou);
  const rankedNames = ranked.map((id) => programmeOn(form, id)?.shortName ?? "");
  const appliedAt = application.submittedAt ?? application.sentAt;
  // Sent again with something different, at least once. The day is the day
  // the application of record became what it is now.
  const changed = changeCount(application) > 0;
  const versions = versionsOf(application);

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
      gaveBack: gaveBackOf(application),
      byInvitation,
      choice: at + 1,
      firstChoiceName: at === 0 ? null : (programmeOn(form, ranked[0])?.shortName ?? null),
      score: score === null ? null : formatScore(score),
      scoreValue: score,
      wantsToFacilitate: sent.wantsToFacilitate === true,
      comments: commentCount(reviews),
      standing,
      owesDecision: owes,
      told: hasBeenTold(application),
      placedOn:
        standing === "to-review" && !owes && placement
          ? (programmeOn(form, placement)?.shortName ?? null)
          : null,
      appliedAt: appliedAt ? appliedAt.toISOString() : null,
      changed,
      changedOn: changed ? dayOf(versions[versions.length - 1]?.sentAt) : null,
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
  // The scores recommend people for places, so only people still in the term,
  // and only people the programme decides about: not one who joined by invitation.
  const scored: ScoredApplicant[] = working
    .filter(({ inTerm, row }) => inTerm && !row.byInvitation)
    .map(({ row, elsewhere }) => ({
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
  // Here by an invitation they accepted, and still in the term: on the list,
  // decided and accepted, though the programme's lead decided none of it.
  const joined = tally?.joined ?? 0;
  const decided = (tally ? tally.accepted + tally.pooled + tally.declined : 0) + joined;
  const applications = (tally?.applications ?? 0) + joined;
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
      accepted: (tally?.accepted ?? 0) + joined,
      pooled: tally?.pooled ?? 0,
      declined: tally?.declined ?? 0,
    },
    queue,
    recommendations: programme.useScores ? recommendationsOf(form, programmeId, working) : null,
    rows: working.map(({ row }) => row),
  };
}
