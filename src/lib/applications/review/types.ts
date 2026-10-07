import type { ProgrammeRole } from "../access";
import type { PoolReason, ProgrammeDecisionKind, QuestionSetRole, QuestionType } from "../model";
import type { ProgrammeStanding } from "../words";

/**
 * WHAT THE REVIEW SCREENS ARE SENT.
 *
 * Every shape here is a payload a staff route builds field by field for one
 * caller, and nothing else: no stored document is spread into one. Three
 * rules are decided where these are built (`board.ts`, `detail.ts`) and are
 * visible in the shapes:
 *
 *  - an applicant's email addresses are present only on the payload an admin
 *    is sent, so the fields are optional rather than nullable;
 *  - what another reviewer scored or wrote is present only once
 *    `reviewsVisibleTo` says this caller may see it, and a review that is held
 *    back is a count and never a body;
 *  - every status, score and tally is derived when the payload is built.
 *
 * Types only, with no server import, so a client component can read them.
 */

// ---------------------------------------------------------------------------
// One programme's applications
// ---------------------------------------------------------------------------

export type ApplicationRow = {
  uid: string;
  name: string;
  /** "BA Philosophy · Graduating 2028". */
  detail: string;
  /** Their join request has not been approved yet. */
  accountWaiting: boolean;
  /**
   * They took the application out of the term after sending it: by
   * withdrawing, or by giving a place or an invitation back. The row is
   * listed and is in none of the board's numbers.
   */
  withdrawn: boolean;
  /**
   * They are on this list because they accepted an invitation to this
   * programme, which they did not rank. `choice` is 0, `standing` is
   * `accepted`, and there is no decision to make about them here.
   */
  byInvitation: boolean;
  /** This programme's place in their ranking: 1 for a 1st choice. 0 for a row `byInvitation`. */
  choice: number;
  /** When this programme is not their 1st choice, the programme that is. */
  firstChoiceName: string | null;
  /** The section score this caller may see, as it is shown. Null reads "Not scored yet". */
  score: string | null;
  /** The same score as a number, for sorting. */
  scoreValue: number | null;
  wantsToFacilitate: boolean;
  /** Internal comments on their answers, from every reviewer. A count only. */
  comments: number;
  standing: ProgrammeStanding;
  /** False once this programme has decided, or a higher choice has accepted them. */
  owesDecision: boolean;
  /**
   * Decision day has told this person, so their decision is fixed: Accept,
   * Pool and Decline are refused for them from now on, whether or not the
   * term as a whole has finished sending.
   */
  told: boolean;
  /**
   * The higher choice that accepted them, when that is why nothing is owed.
   * Null for a withdrawn row: somebody who has left holds no place.
   */
  placedOn: string | null;
  /** When they first sent it, as an ISO instant, for sorting. */
  appliedAt: string | null;
  /**
   * They sent it again with something different, at least once. The earlier
   * versions are kept and the review screen shows them.
   */
  changed: boolean;
  /** "Wed 14 Oct": the day it last changed. Null when it has not, or the day is not known. */
  changedOn: string | null;
  /** Lower-case name, degree and ranked programmes, for the search box. */
  searchText: string;
};

export type RecommendationGroup = {
  programmeId: string;
  shortName: string;
  uids: string[];
};

export type BoardRecommendations = {
  /** People with a section score this caller may see. */
  scoredCount: number;
  /** The lowest score among the top places, as it is shown. */
  cutoff: string | null;
  /** True when enough people are scored to fill the places. */
  fillsPlaces: boolean;
  top: string[];
  borderline: string[];
  /** "0.2": how close to the line counts as borderline. */
  margin: string;
  rankedLower: string[];
  /** True when everybody in `rankedLower` ranked this programme 2nd. */
  rankedLowerAllSecond: boolean;
  scoredHigherElsewhere: RecommendationGroup[];
};

export type ProgrammeBoard = {
  round: {
    id: string;
    label: string;
    /** "Fri 23 Oct", or null when no day is set. */
    decisionDay: string | null;
    /** Decision day has run: nothing here can change any more. */
    decisionsSent: boolean;
  };
  programme: {
    id: string;
    name: string;
    shortName: string;
    places: number | null;
    usesScores: boolean;
    /** The lead's first name, for a caller who is not the lead. */
    leadName: string | null;
  };
  viewer: {
    role: ProgrammeRole;
    canDecide: boolean;
  };
  /**
   * Every number here and in `counts` is of the people in the term who are
   * on this list: those who ranked the programme, and anybody who joined it
   * by accepting an invitation, who counts as an application decided and
   * accepted.
   */
  progress: {
    applications: number;
    decided: number;
    toReview: number;
    /** Undecided here because a higher choice has accepted them. */
    placedElsewhere: number;
    /** Applicants here whose outcome decision day has published and emailed. */
    emailed: number;
    /**
     * People who hold a place on this programme now: accepted by its lead and
     * still in the term, or here by an invitation they accepted.
     */
    placed: number;
    /** Places kept here for an invitation nobody has answered yet. */
    invited: number;
    placesLeft: number | null;
  };
  counts: {
    all: number;
    toReview: number;
    accepted: number;
    pooled: number;
    declined: number;
  };
  /**
   * Who this caller still has to review, in the order "Review next" walks
   * them. Never somebody whose row is `withdrawn`.
   */
  queue: string[];
  /** Null when the programme does not use scores. */
  recommendations: BoardRecommendations | null;
  rows: ApplicationRow[];
};

// ---------------------------------------------------------------------------
// One application, for review
// ---------------------------------------------------------------------------

export type AnswerView = {
  /** `questionKey(setId, questionId)`: what a score and a comment key on. */
  key: string;
  question: string;
  optional: boolean;
  type: QuestionType;
  answered: boolean;
  /** `short`, `long` and `choice`: what they wrote or picked. */
  text: string | null;
  /** `multi`: what they picked. */
  items: string[] | null;
  /** `scale`: the labelled points, and the index of theirs. */
  scale: { options: string[]; index: number } | null;
  /** This caller gives this answer 1 to 5 on this screen. */
  scorable: boolean;
  /**
   * What this answer said in the versions they sent before, newest first.
   * Empty when it has not changed since it was first sent.
   */
  earlier: EarlierAnswer[];
  /**
   * "This answer changed on Wed 14 Oct, after you scored it." A score stays
   * on the question, so this says when one was given to words that have since
   * changed. Null otherwise, and it names nobody whose review this caller is
   * not shown.
   */
  changedSinceScored: string | null;
};

/** What one answer draws: its words, its ticks, or its point on a scale. */
export type AnswerBody = Pick<AnswerView, "answered" | "text" | "items" | "scale">;

/** One answer as an earlier version held it. */
export type EarlierAnswer = AnswerBody & {
  /** "Sat 10 Oct": the day that version was sent. Null when the document does not say. */
  sentOn: string | null;
  /** False when the question was not part of their application then. */
  asked: boolean;
};

/** One About you fact that changed, with what it said before, newest first. */
export type EarlierFact = {
  /** "Degree". */
  label: string;
  earlier: { sentOn: string | null; value: string }[];
};

/** A ranking they sent before. */
export type EarlierRanking = {
  sentOn: string | null;
  ranked: { shortName: string; choice: number }[];
};

/** When they were free in a version they sent before, as lines of words. */
export type EarlierAvailability = {
  sentOn: string | null;
  empty: boolean;
  lines: string[];
  total: string | null;
};

/**
 * That an application changed after it was first sent, for the line near the
 * top of the review screen.
 */
export type ChangesSummary = {
  /** How many times the application of record changed after it was first sent. */
  count: number;
  /** "Sat 17 Oct": the day it last changed. */
  lastOn: string | null;
  /** Earlier versions that are no longer kept. */
  dropped: number;
  /**
   * The cards on this screen with something earlier to open, in the order the
   * screen draws them: "about", a question set's id, or "availability". Empty
   * when what changed is in the ranking or facilitating alone, or is not
   * shown on this screen at all.
   */
  where: string[];
};

export type SectionChip = { text: string; tone: "neutral" | "accent" };

export type ReviewSection = {
  /** The question set's id. */
  id: string;
  /** "AGI Strategy questions". */
  title: string;
  /** "AGI Strategy": the short label a phone's section tabs use. */
  tab: string;
  role: QuestionSetRole;
  /**
   * `focus` is the stream this screen scores. `collapsed` is somebody else's
   * to judge and opens on request. Everything else is `open`.
   */
  mode: "open" | "focus" | "collapsed";
  chips: SectionChip[];
  /** "Zach reviews these", on a collapsed section. */
  note: string | null;
  answers: AnswerView[];
};

export type CommentView = {
  id: string;
  /** The answer it is on. */
  key: string;
  text: string;
  authorName: string;
  mine: boolean;
  /** "Sat 17 Oct", or null for one with no date. */
  when: string | null;
};

export type OtherReview = {
  reviewerUid: string;
  name: string;
  /** Their score for this programme, as it is shown. */
  score: string | null;
  overallComment: string;
};

export type AvailabilityBlock = {
  /** Where it starts across the day, as a percentage. */
  left: number;
  width: number;
  /** "6pm to 9pm". */
  label: string;
};

export type AvailabilityView = {
  empty: boolean;
  /** Hour labels along the top, each with its position as a percentage. */
  axis: { label: string; at: number }[];
  /** One hour's width as a percentage, for the grid lines. */
  hourWidth: number;
  /** Monday first. */
  days: { label: string; blocks: AvailabilityBlock[] }[];
  /** "Mon, Tue and Thu, 6pm to 9pm". */
  lines: string[];
  /** "15.5 hours across 5 days". */
  total: string | null;
};

export type SectionScoreLine = {
  programmeId: string;
  shortName: string;
  /** The section score, as it is shown, or null. */
  score: string | null;
  /** "Claudia 4 · Lloyd 3", or null when nobody has scored. */
  line: string | null;
  /** How many reviews are being held back from this admin. */
  hidden: number;
};

export type ReviewPayload = {
  round: {
    id: string;
    label: string;
    decisionDay: string | null;
    decisionsSent: boolean;
  };
  viewer: {
    name: string;
    role: ProgrammeRole;
    canDecide: boolean;
    isAdmin: boolean;
  };
  programme: {
    id: string;
    name: string;
    shortName: string;
    usesScores: boolean;
    places: number | null;
    placesLeft: number | null;
    leadName: string | null;
  };
  applicant: {
    uid: string;
    name: string;
    firstName: string;
    /** "BA Philosophy · Graduating 2028". */
    detail: string;
    /** "Sat 17 Oct". */
    appliedOn: string | null;
    accountWaiting: boolean;
    withdrawn: boolean;
    ranked: { programmeId: string; shortName: string; choice: number; focus: boolean }[];
    /**
     * The programme they joined by accepting an invitation, when this screen
     * was opened under it. Null for everybody the programme was ranked by.
     */
    invitedTo: { programmeId: string; shortName: string } | null;
    wantsToFacilitate: boolean;
    /** What they ranked before, newest first. Empty when the ranking has not changed. */
    earlierRankings: EarlierRanking[];
    /** Whether they wanted to facilitate before, newest first. Empty when that has not changed. */
    earlierFacilitating: { sentOn: string | null; wanted: boolean }[];
    about: {
      status: string;
      subjectLabel: string;
      subject: string;
      /** "July 2028". */
      graduating: string | null;
      interests: string;
      motivation: string;
      /** The key a comment on the motivation answer uses. */
      motivationKey: string;
      /** The facts above that changed, each with what it said before. */
      earlierFacts: EarlierFact[];
      /** What the motivation answer said before, newest first. */
      earlierMotivation: { sentOn: string | null; text: string }[];
    };
    /** Present for an admin and for nobody else. */
    email?: string | null;
    universityEmail?: string | null;
  };
  sections: ReviewSection[];
  availability: AvailabilityView;
  /** When they were free in the versions they sent before, newest first. Empty when it has not changed. */
  earlierAvailability: EarlierAvailability[];
  /**
   * Null when the application is as it was first sent. Otherwise how often it
   * has changed and where on this screen the earlier versions can be opened.
   * Built from what was SENT each time, never from the draft.
   */
  changes: ChangesSummary | null;
  queue: {
    /** This application's place among those left to review, or null when it is not one of them. */
    position: number | null;
    total: number;
    previousUid: string | null;
    nextUid: string | null;
  };
  review: {
    /** The answers this caller scores on this screen. */
    scorableKeys: string[];
    scores: Record<string, number>;
    /** This caller's own score for the programme so far, as it is shown. */
    ownScore: string | null;
    overallComment: string;
    /** This caller's comments, and other people's once they may be seen. */
    comments: CommentView[];
    others: {
      /** Other people's reviews for this programme, seen or not. */
      count: number;
      /** How many of them are being held back. */
      hidden: number;
      visible: OtherReview[];
    };
  };
  decision: {
    standing: ProgrammeStanding;
    owesDecision: boolean;
    /** Decision day has told this person, so this decision can no longer change. */
    told: boolean;
    /**
     * They are here by an invitation they accepted. Nobody decided for this
     * programme and nobody can: `standing` is `accepted` and `kind` is null.
     */
    byInvitation: boolean;
    kind: ProgrammeDecisionKind | null;
    poolReason: PoolReason | null;
    couldSuitProgrammeId: string | null;
    decidedByName: string | null;
    /** "Mon 19 Oct". */
    decidedOn: string | null;
    /** The higher choice that accepted them, when that is why nothing is owed. */
    placedOn: string | null;
    /**
     * The programmes offered for "could suit": open ones on the form that the
     * applicant did not rank. An invitation is to something they did not pick.
     */
    couldSuitOptions: { programmeId: string; shortName: string }[];
    /** The last time an admin took an acceptance back here. For those who decide. */
    lastRevocation: { byName: string; on: string | null; reason: string } | null;
  };
  /** Present for an admin and for nobody else. */
  admin: {
    revealOtherReviews: boolean;
    sections: SectionScoreLine[];
  } | null;
};

// ---------------------------------------------------------------------------
// What the write routes take and answer
// ---------------------------------------------------------------------------

export type CommentChange =
  | { op: "add"; key: string; text: string }
  | { op: "edit"; id: string; text: string }
  | { op: "remove"; id: string };

/** A change to the caller's own review. Every part is optional; one has to be there. */
export type ReviewChange = {
  /** A score per answer. Null takes a score back. */
  scores?: Record<string, number | null>;
  overallComment?: string;
  comments?: CommentChange[];
};

export type DecisionChange = {
  programmeId: string;
  decision: ProgrammeDecisionKind;
  poolReason: PoolReason | null;
  couldSuitProgrammeId: string | null;
};

export type BulkDecisionResult = {
  decision: "accept" | "pool";
  /** Applications whose decision this changed. */
  changed: number;
  /** Applications that already had this decision. */
  unchanged: number;
  refused: { uid: string; name: string; reason: string }[];
};

/** What a refused request is answered with. */
export type Refusal = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 500;
  error: string;
};
