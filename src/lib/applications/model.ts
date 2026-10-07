import type { AvailabilityMask } from "@/lib/admissions/availability";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";

/**
 * THE APPLICATION SYSTEM'S DATA, IN ONE PLACE.
 *
 * One application form a term, for every programme. A person ticks the
 * programmes they want, ranks them, says whether they would facilitate, and
 * answers only the question sets that apply to them. Each programme's lead
 * reviews and decides for that programme, and everybody hears on one decision
 * day. This module is the shape of all of it: types and limits, no behaviour.
 * The behaviour lives beside it (`normalise.ts`, `sections.ts`, `validate.ts`,
 * `scoring.ts`, `decisions.ts`) and is all pure, so every rule here is
 * executed by a test rather than argued in a comment.
 *
 * ## Where each piece is stored
 *
 *  - THE FORM is an admission round (`admissionRounds/{roundId}`) carrying
 *    `formVersion: 2` and the fields in {@link ApplicationFormFields}. The
 *    round keeps everything it already had: the window, the availability
 *    grid, the counters, the reminder schedule.
 *  - QUESTION SETS are `admissionRounds/{roundId}/questionSets/{setId}`.
 *  - AN APPLICATION is `admissionApplications/{roundId}__{uid}`, the same
 *    document and the same id as before, carrying the fields in
 *    {@link ApplicationFields}.
 *  - A REVIEW is `admissionReviews/{roundId}__{applicantUid}__{reviewerUid}`:
 *    one reviewer's scores and comments on one applicant.
 *  - DECISIONS are `admissionDecisions/{roundId}__{uid}`, at the application's
 *    own id. See below for why they are not on the application.
 *
 * Every one of these is `allow read, write: if false` in the rules. Nothing
 * here is read or written from a browser; the routes are the boundary.
 *
 * ## The rule the layout exists for
 *
 * AN APPLICANT'S OWN DOCUMENT CHANGES ONLY WHEN THE APPLICANT ACTS, OR WHEN
 * DECISION DAY PUBLISHES. Scores and comments are in `admissionReviews`.
 * Each lead's Accept or Pool, the outcome picked for a pooled applicant and
 * an admin's exception are in `admissionDecisions`. Neither collection is
 * reachable from the modules that build an applicant's pages, and
 * `tests/applications-boundary.test.mjs` walks their import graphs to hold
 * that. So "nobody hears anything early" is a property of where the data is,
 * not something each screen has to remember.
 *
 * ## Two copies of what the applicant wrote
 *
 * `draft` is what the form is showing and is saved as they type. `sent` is
 * the application of record, and is replaced whole each time they press Send.
 * An applicant can change their answers until the close, and a half-made
 * change must never unseat the application they already sent, so reviewers
 * read `sent` and nothing else.
 *
 * What a send replaces is not lost. When the new `sent` differs from the old
 * one, the old one is kept in `sentHistory` on the same document, with when
 * it was sent, and the review screens show it beside the current answers.
 * See {@link SentVersion}.
 */

/** The value of `formVersion` on a round that is an application form. */
export const FORM_VERSION = 2;

/** Subcollection of a round: one document per question set. */
export const QUESTION_SETS_SUBCOLLECTION = "questionSets";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Budgets for authoring and for answers. The routes are the boundary; these
 * also drive the counters in the editor and the form.
 *
 * Word limits are the author's (`ApplicationQuestion.wordLimit`). The
 * character caps here are the hard ceiling behind them, so a limit nobody set
 * still cannot store a novel.
 */
export const APPLICATION_LIMITS = {
  maxProgrammes: 8,
  programmeName: 80,
  programmeShortName: 40,
  programmePitch: 160,
  programmeFacts: 80,
  programmeStarts: 40,
  programmeGroupSize: 40,
  maxProgrammeReviewers: 12,
  maxQuestionSets: 12,
  setLabel: 60,
  setIntro: 300,
  maxQuestionsPerSet: 12,
  questionText: 300,
  questionHelp: 300,
  maxOptions: 10,
  optionText: 80,
  maxWordLimit: 1000,
  shortAnswerChars: 400,
  longAnswerChars: 8000,
  emailSubject: 120,
  emailBody: 4000,
  minScore: 1,
  maxScore: 5,
  commentText: 1000,
  maxCommentsPerReview: 60,
  overallComment: 4000,
  poolNote: 300,
  exceptionReason: 500,
  revokeReason: 500,
  releaseReasonOther: 300,
} as const;

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/**
 * A fellowship or the incubator. It decides which of the question sets kept
 * for a KIND a person sees: the fellowship questions are asked once however
 * many fellowships they tick.
 */
export type ProgrammeKind = "fellowship" | "incubator";

export const PROGRAMME_KINDS: readonly ProgrammeKind[] = ["fellowship", "incubator"];

/** The three decision-day emails a programme can word for itself. */
export type ProgrammeEmailKind = "accepted" | "invitation" | "declined";

export const PROGRAMME_EMAIL_KINDS: readonly ProgrammeEmailKind[] = [
  "accepted",
  "invitation",
  "declined",
];

/** A subject and a body, as the committee wrote them. Plain text. */
export type EmailWording = { subject: string; body: string };

/**
 * One programme, for one term. Everything the application system knows about
 * it: what applicants are shown on the Choose step, how many places it has,
 * and who reads and decides its applications.
 */
export type ProgrammeSettings = {
  /** Stable id, and the key in `programmes`. Never changes once people apply. */
  id: string;
  kind: ProgrammeKind;
  /** "AGI Strategy Fellowship". */
  name: string;
  /** "AGI Strategy": what chips, rankings and emails call it. */
  shortName: string;
  /** The one-line description under the name. */
  pitch: string;
  /** The facts line, set in mono: "6 WEEKS · ~5 HRS A WEEK". */
  facts: string;
  /** "w/c 26 Oct". A label, not a date: it is only ever shown. */
  starts: string;
  /** How many people it can take. Null until the lead says. */
  places: number | null;
  /** "Across 4 groups". Null until the lead says. */
  groupCount: number | null;
  /** "Up to 8". Never shown publicly. */
  groupSize: string;
  /** Decides this programme. Admins and SU-recognised committee only. */
  leadUid: string | null;
  /** Read, score and comment. They cannot decide. Same bar as the lead. */
  reviewerUids: string[];
  /** Whether reviewers score this programme's scored answers at all. */
  useScores: boolean;
  /** Off the site and out of the form. Its applications are kept. */
  closed: boolean;
  /** The course run accepted people are placed on, once one exists. */
  runId: string | null;
  /**
   * The course this programme is for, or null for a programme with no course
   * page. While it is set, that course's public page offers the application
   * form: its Apply button leads to the one form, whichever course's button
   * somebody presses. Something else than `runId`: a course is the evergreen
   * page, a run is one term of it that people are placed on.
   *
   * A course's id as it was when somebody picked it. A course can be
   * unpublished or deleted afterwards, and nothing here follows that, so
   * whatever reads this treats a course that is not there as no course.
   */
  courseId: string | null;
  /** The programme's own wording for its decision-day emails. */
  emailWording: Partial<Record<ProgrammeEmailKind, EmailWording>>;
};

/** What a question collects. */
export type QuestionType = "short" | "long" | "choice" | "multi" | "scale";

export const QUESTION_TYPES: readonly QuestionType[] = [
  "short",
  "long",
  "choice",
  "multi",
  "scale",
];

export type ApplicationQuestion = {
  /** Stable within its set. A score and an answer both key on it. */
  id: string;
  text: string;
  /** Shown under the question. Optional. */
  help: string;
  type: QuestionType;
  /**
   * `choice` and `multi`: the options. `scale`: the labelled points, lowest
   * first. Empty for the two text types.
   */
  options: string[];
  /**
   * `choice` only: the options are the programmes this person ranked, plus
   * "Either". The stored `options` are ignored when this is on.
   */
  optionsFromRanking: boolean;
  /** `short` and `long`: the limit in words. Null means no limit of its own. */
  wordLimit: number | null;
  required: boolean;
  /** Reviewers give this answer 1 to 5. Honoured on stream sets only. */
  scored: boolean;
};

/**
 * `general` is asked once of a group of people, whichever of their programmes
 * brought them into it: everybody who ticks anything (scope `everybody`), or
 * everybody who ticks a kind of programme (scope `kind`).
 * `stream` belongs to one programme and is the only kind that can be scored.
 * `facilitator` is asked to people who said yes to facilitating.
 */
export type QuestionSetRole = "general" | "stream" | "facilitator";

export const QUESTION_SET_ROLES: readonly QuestionSetRole[] = [
  "general",
  "stream",
  "facilitator",
];

/** Who a question set is shown to. */
export type QuestionSetScope =
  /**
   * Anyone who ranks at least one programme, whatever its kind. Asked once,
   * before every other set, and never scored. A form has at most one.
   */
  | { type: "everybody" }
  /** Anyone who ranks at least one programme of this kind. */
  | { type: "kind"; kind: ProgrammeKind }
  /** Anyone who ranks this programme. */
  | { type: "programme"; programmeId: string }
  /** Anyone who said yes to facilitating. */
  | { type: "facilitating" };

export type QuestionSetDoc = {
  id: string;
  roundId: string;
  role: QuestionSetRole;
  scope: QuestionSetScope;
  /** "Fellowships", "AGI Strategy", "Facilitator questions". The author's own for a set made by hand. */
  label: string;
  /** One line under the heading. */
  intro: string;
  questions: ApplicationQuestion[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * The last test of the decision-day emails an admin sent to their own
 * address.
 *
 * Decision day cannot be sent until one has gone, and a test stops counting
 * the moment any decision email's wording changes. `wording` is a fingerprint
 * of all of that wording as it stood when the test went, and the send compares
 * it with the form as it stands now (`decisionDay/tested.ts`). Nothing stamps
 * a "wording changed" time: the comparison is made where it is used, so no
 * writer of wording has to remember to.
 */
export type DecisionEmailTest = {
  /** The admin who sent it. */
  byUid: string;
  at: Date | null;
  /** `wordingFingerprint(form)` at the moment the test went. */
  wording: string;
};

/** The fields an admission round carries when it is an application form. */
export type ApplicationFormFields = {
  formVersion: typeof FORM_VERSION;
  /** Programme ids in the order the Choose step shows them. */
  programmeIds: string[];
  programmes: Record<string, ProgrammeSettings>;
  /** Question set ids in the order the form asks them. */
  questionSetIds: string[];
  /** Whether the form asks "Would you like to facilitate a group?". */
  asksFacilitating: boolean;
  /** Invitations are accepted by this day. A civil date, Europe/London. */
  invitationReplyBy: string | null;
  /** An admin's switch: show other reviewers' scores on a first review. */
  revealOtherReviews: boolean;
  /** The "No offer this time" email, the same for every programme. */
  noOfferWording: EmailWording | null;
  /** The last test of the decision-day emails. Null until an admin sends one. */
  decisionEmailTest: DecisionEmailTest | null;
  /** Stamped once, by the send. Null until decision day. */
  decisionsSentAt: Date | null;
  decisionsSentByUid: string | null;
};

// ---------------------------------------------------------------------------
// What an applicant writes
// ---------------------------------------------------------------------------

/** Text, a choice; several choices; or the index of a point on a scale. */
export type AnswerValue = string | string[] | number;

/** Answers by question set id, then by question id. */
export type Answers = Record<string, Record<string, AnswerValue>>;

/**
 * The same questions as joining the site, copied onto the application so a
 * reviewer reads what was true when the person applied.
 */
export type AboutYou = {
  preferredName: string;
  universityEmail: string;
  universityEmailVerified: boolean;
  /** An `AffiliationStatus` key, or "" when they have not said. */
  status: string;
  statusOther: string;
  /** Degree, or area of work. */
  subject: string;
  /** "YYYY-MM", or "". */
  expectedGraduation: string;
  /** "Why are you interested in AI safety?" */
  motivation: string;
  interests: string;
};

export type SuMembershipAnswer = "yes" | "not-yet";

/** Everything an applicant fills in. `draft` and `sent` are both one of these. */
export type ApplicationContent = {
  aboutYou: AboutYou;
  /** The programmes they ticked, in the order they ranked them. */
  rankedProgrammeIds: string[];
  /** Null until they have answered. */
  wantsToFacilitate: boolean | null;
  answers: Answers;
  availability: AvailabilityMask;
  /** Asked on the last step. Expected, never a barrier. */
  suMembership: SuMembershipAnswer | null;
};

// ---------------------------------------------------------------------------
// What is kept when they send again
// ---------------------------------------------------------------------------

/**
 * One EARLIER application of record: what `sent` held, whole, and when that
 * version became the application of record.
 *
 * `sent` is replaced each time somebody presses Send. When the new one
 * differs from the one it replaces, the one it replaces is kept here, so the
 * people reviewing the application can see what it said before. A send that
 * changes nothing keeps nothing.
 *
 * Kept on the application document itself and nowhere else, so whatever
 * deletes the application deletes these with it. Never sent to the applicant:
 * their own routes build what they answer field by field and name none of
 * this (`applicant/project.ts`).
 */
export type SentVersion = {
  content: ApplicationContent;
  /** When THIS version became the application of record. */
  sentAt: Date | null;
};

/**
 * How much history one application may carry. A document has a size limit,
 * and the draft and the application of record must always fit beside it.
 *
 * Beyond either limit the oldest version THAT IS NOT THE FIRST is dropped,
 * and counted (`sentHistoryDropped`). The first version sent is never
 * dropped. The rule is `keepVersion` in `versions/kept.ts`.
 */
export const SENT_HISTORY_LIMITS = {
  /** Earlier versions kept: the first one sent, and the most recent after it. */
  maxVersions: 10,
  /** What the kept versions may weigh together, as the bytes of their JSON. */
  maxBytes: 300_000,
} as const;

/** What decision day told this person. */
export type ApplicationResultKind = "accepted" | "invited" | "no-offer" | "declined";

export const APPLICATION_RESULT_KINDS: readonly ApplicationResultKind[] = [
  "accepted",
  "invited",
  "no-offer",
  "declined",
];

/**
 * What became of the email that tells somebody their result.
 *
 * `owed` is the only state a later press of Send acts on: the email has not
 * gone, and the site knows it has not. Every other state is left alone, which
 * is what keeps anybody from being emailed their decision twice.
 */
export type ResultEmailState =
  /** Not sent, for certain: never tried, or tried and known not to have gone. */
  | "owed"
  /** A press of Send has taken it up and has not yet recorded what happened. */
  | "sending"
  /** Handed to the mail provider. */
  | "sent"
  /** Deliberately not sent: a declined application with "Email them" off. */
  | "not-sent"
  /** This copy of the site may not write to that address, so nothing went. */
  | "held"
  /** The address is on the do-not-email list, so nothing went. */
  | "suppressed"
  /** It may or may not have gone and nothing can say which. Never sent again. */
  | "unconfirmed";

export const RESULT_EMAIL_STATES: readonly ResultEmailState[] = [
  "owed",
  "sending",
  "sent",
  "not-sent",
  "held",
  "suppressed",
  "unconfirmed",
];

export type ApplicationResult = {
  kind: ApplicationResultKind;
  /** The programme they are in, or invited to. Null for the other two. */
  programmeId: string | null;
  publishedAt: Date | null;
  /** What became of the email that tells them. */
  email: ResultEmailState;
  /** When that email was handed to the mail provider. Null unless it was. */
  emailedAt: Date | null;
  /** When a press of Send took the email up. Read only while `email` is "sending". */
  emailClaimedAt: Date | null;
};

/** An offer of a programme they did not get through their own ranking. */
export type Invitation = {
  programmeId: string;
  /** A civil date, Europe/London. */
  replyBy: string;
  response: "accepted" | "declined" | null;
  respondedAt: Date | null;
  /** The civil date of the last reminder, so a day sends at most one. */
  lastReminderOn: string | null;
};

/**
 * The reply of somebody who holds a place: by their own ranking, or by an
 * invitation they accepted, whose `invitation.response` stays `accepted`
 * whatever they answer here. Optional, and no reply means they are coming.
 * `cant-make-it` gives the place back: the same write makes the application
 * `withdrawn`, which is what takes it out of the term (`isInTerm`).
 */
export type Attendance = {
  answer: "coming" | "cant-make-it";
  answeredAt: Date | null;
};

/**
 * Why somebody did not take a place. Asked when they say "I can't make it"
 * (to a place) or "No thanks" (to an invitation), and shown to the committee,
 * who may be able to offer something that works.
 */
export type ReleaseReasonKind = "times" | "too-much-on" | "something-else" | "other";

export const RELEASE_REASON_KINDS: readonly ReleaseReasonKind[] = [
  "times",
  "too-much-on",
  "something-else",
  "other",
];

export type ReleaseReason = {
  kind: ReleaseReasonKind;
  /** Their own words. Never empty for `other`, and always empty otherwise. */
  other: string;
};

/** The fields an application carries on a form of this version. */
export type ApplicationFields = {
  formVersion: typeof FORM_VERSION;
  draft: ApplicationContent;
  sent: ApplicationContent | null;
  /** The first time they pressed Send. */
  submittedAt: Date | null;
  /** The most recent time. */
  sentAt: Date | null;
  /**
   * When `sent` became what it is now: the first send, or the latest send
   * that changed something. `sentAt` moves on a send that changes nothing and
   * this does not, so this is the date of the current version.
   */
  sentChangedAt: Date | null;
  /** The earlier applications of record, oldest first. Empty until a send changes something. */
  sentHistory: SentVersion[];
  /** Earlier versions that are no longer kept. See {@link SENT_HISTORY_LIMITS}. */
  sentHistoryDropped: number;
  result: ApplicationResult | null;
  invitation: Invitation | null;
  attendance: Attendance | null;
  /**
   * The reason given with the reply that gave a place or an invitation back,
   * written by that reply and by nothing else. Null until then, and for a
   * reply made before the question was asked.
   */
  releaseReason: ReleaseReason | null;
};

/** An application as the rest of this system reads it. */
export type ApplicationDoc = ApplicationFields & {
  id: string;
  roundId: string;
  uid: string;
  /** From the session at the time, never from the request. */
  email: string | null;
  displayName: string;
  /**
   * On an application form: `submitted` from the first send until decision
   * day, then what decision day said (`accepted`, `invited`, `no-offer`,
   * `declined`). A reply moves it twice more: `accepted` also covers an
   * invitation the person accepted, and `withdrawn` also covers a place or an
   * invitation they gave back. `result` keeps what decision day said.
   */
  status: AdmissionApplicationStatus;
  /** When they withdrew, or gave a place or an invitation back. */
  withdrawnAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// ---------------------------------------------------------------------------
// What reviewers write
// ---------------------------------------------------------------------------

/** One internal comment, on one answer. */
export type ReviewComment = {
  id: string;
  /** `questionKey(setId, questionId)`. */
  questionKey: string;
  text: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/** One reviewer's work on one applicant, as this system reads it. */
export type ReviewDoc = {
  id: string;
  roundId: string;
  applicantUid: string;
  reviewerUid: string;
  /** A 1 to 5 score per scored answer, keyed by `questionKey`. */
  scores: Record<string, number>;
  comments: ReviewComment[];
  /** The overall comment on this applicant, for this round. */
  overallComment: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// ---------------------------------------------------------------------------
// What leads and admins decide
// ---------------------------------------------------------------------------

/** A lead's decision for their own programme. */
export type ProgrammeDecisionKind = "accept" | "pool" | "decline";

export const PROGRAMME_DECISION_KINDS: readonly ProgrammeDecisionKind[] = [
  "accept",
  "pool",
  "decline",
];

/** Why somebody was pooled. */
export type PoolReason = "capacity" | "better-fit";

export const POOL_REASONS: readonly PoolReason[] = ["capacity", "better-fit"];

export type ProgrammeDecision = {
  decision: ProgrammeDecisionKind;
  /** Pool only. */
  poolReason: PoolReason | null;
  /** Pool only: a programme the lead thinks would suit them better. */
  couldSuitProgrammeId: string | null;
  decidedByUid: string;
  decidedAt: Date | null;
};

/** What a pooled applicant will hear, picked before decision day. */
export type PooledOutcome =
  | { kind: "invite"; programmeId: string; setByUid: string; setAt: Date | null }
  | { kind: "no-offer"; setByUid: string; setAt: Date | null };

/** An admin's rare second place for one person. */
export type PlacementException = {
  programmeIds: string[];
  reason: string;
  setByUid: string;
  setAt: Date | null;
};

export type DecisionDoc = {
  /** The application's own id. */
  id: string;
  roundId: string;
  uid: string;
  /** One entry per programme that has decided. */
  programmes: Record<string, ProgrammeDecision>;
  pooledOutcome: PooledOutcome | null;
  exception: PlacementException | null;
  updatedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/**
 * The key a score and a comment use for one answer. A question id is only
 * unique inside its set, so the set is part of the key. Construct-only: both
 * halves are also available wherever the key is used, and it is never parsed.
 */
export function questionKey(setId: string, questionId: string): string {
  return `${setId}.${questionId}`;
}

/** The id of an application, a decision document, and nothing else. */
export function applicationId(roundId: string, uid: string): string {
  return `${roundId}__${uid}`;
}
