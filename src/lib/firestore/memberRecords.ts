import type { FieldValue, Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import type {
  ApplicationDoc,
  ApplicationFormFields,
  QuestionSetDoc,
  ReviewDoc,
} from "@/lib/applications/model";
import { scoredKeysFor, sectionScore } from "@/lib/applications/scoring";
import type { AdmissionApplicationDoc } from "./admissionApplications";
import {
  ADMISSION_REVIEW_FIELD_LIMITS,
  type AdmissionReviewDoc,
} from "./admissionReviews";
import type { AdmissionRoundDoc } from "./admissionRounds";

/**
 * `memberRecords/{uid}` and `memberRecords/{uid}/applications/{roundId}`: what
 * the committee keeps about a person, kept where a destroy cannot reach it.
 *
 * ## The rule this collection exists to honour
 *
 * It outranks every other decision in the deletion work: **a destroy never
 * deletes what the committee wants to remember about a person.** Destroying an
 * admission round is meant to remove a test round or a mistake. It is not
 * meant to remove the fact that somebody applied, what they applied for, how
 * it went, and what the reviewers thought, because that history is what a
 * later application is graded with.
 *
 * So the record is written BEFORE the thing it summarises can die. A round
 * destroy writes any missing entry FIRST and refuses if that write fails
 * (`docs/worksheets.md`, Deletion), which is only a safeguard because the
 * entry lives somewhere the same cascade is not about to drain.
 *
 * ## Why it hangs off the PERSON and not off the round
 *
 * A round is destroyable and a person is not, so a record filed under the
 * round is a record with a scheduled end. That is the structural half. The
 * practical half is the question the record answers: "what do we already know
 * about this applicant", asked while somebody is reading their new
 * application. Under the person that is one addressed read of a small
 * subcollection. Under the round it is a scan of every round that has ever
 * run, filtered by uid, and it is a scan that gets slower every year and
 * silently shorter every time a round is destroyed.
 *
 * `memberRecords/{uid}` itself carries almost nothing (`uid`, `updatedAt`). It
 * exists so the subcollection has a parent that shows up in a console listing,
 * because a subcollection under a missing document is real data that no admin
 * browsing Firestore can see.
 *
 * ## Why ONLY routes write it
 *
 * `allow write: if false` for every client, admins included, and the entry is
 * written by the Admin SDK from the settle and destroy routes. Three reasons,
 * in order of how badly each would bite:
 *
 *  1. The entry is a SUMMARY OF SOMEBODY ELSE'S WRITING. It copies reviewer
 *     notes and scores out of `admissionReviews`, which is `allow read, write:
 *     if false` precisely so no client can enumerate who scored whom. A
 *     client-writable record would be a way to put words into a named
 *     reviewer's mouth about a named applicant, with the record itself as the
 *     only surviving evidence once the round is destroyed.
 *  2. It is derived data with one correct derivation. `buildApplicationRecord`
 *     below is that derivation, and the arithmetic in it (which reviewers
 *     count towards a mean, what an unscored review contributes) has to be the
 *     same arithmetic every time or two entries written months apart are not
 *     comparable, which is the whole point of keeping them.
 *  3. It outlives its sources, so nothing can check it afterwards. A row that
 *     cannot be re-derived has to be right when it is written.
 *
 * ## Why account deletion KEEPS it
 *
 * `deleteAccountCascade` sweeps a member's admissions data: the application,
 * its private part and the reviews all go, because each is keyed to the uid
 * alone and would otherwise be an unnameable ghost. This collection is
 * deliberately not on that list, on the same reasoning that retains
 * `dataExports`, `emailSends`, `impersonations` and `courseAudit`: it is the
 * COMMITTEE'S RECORD OF ITS OWN DECISIONS, not the member's content.
 *
 * The distinction is worth stating precisely, because the entry does contain
 * material about a named person:
 *
 *  - it holds what the committee decided and why (the outcome, the scores, the
 *    reviewers' notes), which is a record of the society's own conduct;
 *  - it does NOT hold the member's own writing. No essay answers, no
 *    availability grid, no access-requirements answer, no email address. Those
 *    are the applicant's content and they go with the account.
 *
 * A deletion summary counts the entries kept, so the policy can be reversed
 * knowingly rather than discovered later. If it ever is reversed, the entry is
 * the whole unit: delete `memberRecords/{uid}` and its subcollection, and take
 * the count out of the summary in the same change.
 *
 * ## Two kinds of round, one entry
 *
 * An application made on an APPLICATION FORM (`src/lib/applications/`) is a
 * different document from one made on an older round: it ranks programmes
 * rather than picking a stream, its outcome is what decision day published
 * rather than what one decider pressed, and its reviews score answers from 1
 * to 5 rather than criteria. `buildFormApplicationRecord` is the derivation
 * for those, and it writes the SAME entry shape, so one reader and one panel
 * serve both and a person's history reads as one list.
 *
 * Two fields mean something slightly different on such an entry, and each
 * says so where it is declared: the scores are means on the 1 to 5 scale
 * rather than sums over criteria, and `scoreSummary.byCriterion` is keyed by
 * programme. Nothing about an entry written from an older round changed when
 * this arrived.
 *
 * ## Plain text, always
 *
 * `reviewerNotes[].notes` is copied out of a review as a string and is meant to
 * be rendered as a TEXT NODE by every reader. Nothing here is markdown, nothing
 * here is a block list, and nothing here should ever be handed to a renderer
 * that interprets its input. `reviewerName` is a display name and never an
 * email address (see `reviewerDisplayName`).
 *
 * ## What this shape leaves room for
 *
 * Participation notes, how a member has taken part since, are a later slice.
 * They belong as a sibling subcollection under the same parent document
 * (`memberRecords/{uid}/participation/{...}`) rather than as fields on an
 * application entry, because they are not about one round and they accrue on
 * their own schedule. `memberConductFlags` is the precedent for admin-authored
 * notes about a member, and the read tier here (admin and SU-recognised
 * committee) is deliberately WIDER than that one, which is admin-only: a
 * conduct flag carries an allegation and this carries a decision.
 *
 * ## Why a client MAY import this file, and what that costs
 *
 * There is no `import "server-only"` here and the import of
 * `firebase-admin/firestore` is TYPE-ONLY, so the pure half of this module
 * (the two collection names, the limits, `buildApplicationRecord` and
 * `normalizeApplicationRecord`) can be imported from a `"use client"` module.
 * That is deliberate, and the rules are what make it necessary: admins and
 * SU-recognised committee read this collection CLIENT-DIRECT, so a browser
 * surface has to turn stored documents into the shape above, and by the
 * one-derivation argument three paragraphs up there is exactly one correct way
 * to do that.
 *
 * THE CLIENT THAT IMPORTS IT is `src/features/admin/useMemberApplications.ts`,
 * the listener behind the application history on the admin Members page. It
 * takes `normalizeApplicationRecord` and the two collection names from here
 * rather than keeping a copy of either, and that is the point: a second reader
 * of one stored shape is the read-side of the same mistake the write posture
 * above exists to prevent. Two readers drift, and they drift where it shows,
 * because the surface that RENDERS an entry would then disagree with the surface
 * that wrote it about what a field means (a stored `reviewerName` carrying an
 * address, say) and the render is the one a person reads. Any future client
 * reader belongs on the function at the bottom of this file too.
 *
 * The cost of holding that door open is one odd line, `serverTimestamp` below,
 * which takes the sentinel off the caller's own Firestore class instead of
 * value-importing `FieldValue`. A type-only import is erased by TypeScript and
 * carries nothing into a bundle; a value import would drag `firebase-admin`
 * into the browser chunk that hook is bundled into, where it resolves `fs`,
 * `net` and `http2`. Next enforces that boundary only when it bundles, so the
 * failure would be a broken rollout rather than a `tsc` error, which is why THE
 * `type` KEYWORD ON THE FIRST LINE OF THIS FILE IS LOAD-BEARING and
 * `tests/client-server-boundary.test.mjs` guards it by name. Most modules in
 * this directory (`dataExports.ts`, `schedulerMarkers.ts`) value-import the SDK
 * happily, because no browser has any business reading what they hold.
 *
 * The alternative is the split: the pure half in a sibling module, the Admin
 * SDK write here behind `import "server-only"`. That is the right move the day
 * this file needs more of the Admin SDK than one sentinel, and
 * `buildApplicationRecord` and `normalizeApplicationRecord` lift out cleanly
 * when it comes. One sentinel is not enough reason to cut a shape in half.
 */

export const MEMBER_RECORDS_COLLECTION = "memberRecords";

/** The subcollection under `memberRecords/{uid}`. One document per round. */
export const MEMBER_RECORD_APPLICATIONS = "applications";

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Caps on what one entry may carry. The routes are the security boundary, as
 * everywhere else in this directory; these keep a single document inside
 * Firestore's 1 MiB ceiling and keep a pathological round (a hundred reviewers,
 * a hundred criteria) from writing a record nothing can render.
 *
 * `notes` mirrors `ADMISSION_REVIEW_FIELD_LIMITS.notes` because the string is
 * copied from there verbatim and truncating it further would make the record
 * disagree with the review it was taken from while both still exist.
 */
export const MEMBER_RECORD_LIMITS = {
  roundId: 200,
  roundTitle: 200,
  roundKind: 40,
  /** One stream, up to eight ranked fellowships, and the fallback sentence. */
  maxAppliedFor: 12,
  appliedForLabel: 200,
  /**
   * A cap on the NOTES LIST ONLY. `scoreSummary` is derived over every review
   * that belongs to the application, capped or not, because a mean taken over
   * the first twenty reviewers sorted by uid would be a number nobody could
   * name and nothing could reproduce.
   */
  maxReviewerNotes: 20,
  reviewerName: 120,
  /** A Firebase Auth uid is 28 characters; the cap is headroom, not a shape. */
  uid: 128,
  runId: 200,
  notes: ADMISSION_REVIEW_FIELD_LIMITS.notes,
  /**
   * How many keys `scoreSummary.byCriterion` keeps on read. An entry from an
   * application form puts one key per ranked programme there, so this has to
   * stay at or above `APPLICATION_LIMITS.maxProgrammes` or a read would drop a
   * programme's score without saying so. `tests/member-records.test.mjs` holds
   * the two together.
   */
  maxCriteria: ADMISSION_REVIEW_FIELD_LIMITS.maxCriteria,
  status: 40,
  /**
   * Wide enough for the longest thing a decision can say: the outcome and the
   * programme it names ("accepted (AGI Strategy)"), where a programme's short
   * name runs to 40 characters and the sentence for one that has left the form
   * is longer still.
   */
  decision: 80,
} as const;

/**
 * The label an entry uses when the person is a reviewer this build cannot
 * name. The repo-wide fallback, and deliberately never an address.
 */
export const UNNAMED_REVIEWER = "NAISI member";

/**
 * What `appliedFor` says when the application named a programme the round no
 * longer lists (an admin edited the options after somebody applied).
 *
 * A sentence rather than the raw id, and rather than dropping the entry: the
 * record would otherwise say the person applied for one fellowship when they
 * ranked two, which is a quiet lie in the direction that matters.
 */
export const REMOVED_PROGRAMME_LABEL = "A programme no longer listed on the round";

/** What `appliedFor` says for the "I would take a fellowship place" tick. */
export const OPEN_TO_FELLOWSHIP_LABEL = "Open to a fellowship place";

/**
 * What `appliedFor` says for a programme the form lists with no name at all.
 * A sentence, for the reason `REMOVED_PROGRAMME_LABEL` is one: dropping the
 * entry would make the record say they ranked one programme fewer than they did.
 */
export const UNNAMED_PROGRAMME_LABEL = "A programme with no name";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Which act wrote the entry. `settle` is the normal path (a round settles and
 * every application on it gets a record); `destroy` is the safety net (a round
 * is being destroyed and an entry was missing); `backfill` is a tool run over
 * rounds that predate the collection.
 */
export type MemberRecordWriter = "settle" | "destroy" | "backfill";

export const MEMBER_RECORD_WRITERS: MemberRecordWriter[] = [
  "settle",
  "destroy",
  "backfill",
];

/** One reviewer's assessment, as the record keeps it. Plain text. */
export type ApplicationRecordReviewerNote = {
  reviewerUid: string;
  /** Display name, or `UNNAMED_REVIEWER`. Never an email address. */
  reviewerName: string;
  /**
   * `advance` / `hold` / `decline`, or null when they did not say. Always null
   * on an entry from an application form, where a reviewer scores and comments
   * and the decision is the lead's.
   */
  recommendation: string | null;
  /**
   * Their score, or null when they wrote notes without scoring. On an older
   * round it is the SUM of their criterion scores. On an application form it
   * is the MEAN of the 1 to 5 scores they gave, because the number of answers
   * there is to score differs from one application to the next and a sum
   * would not compare.
   */
  total: number | null;
  /** Copied verbatim from the review. Render as a text node. */
  notes: string;
};

/**
 * The scores, summarised. Individual criterion scores per reviewer are NOT
 * kept: what a later reader needs is "how did this person score", and a
 * per-reviewer grid would carry the disagreement between two named reviewers
 * into a document that outlives both the round and the review queue's
 * deliberate blinding.
 */
export type ApplicationRecordScoreSummary = {
  /** How many people assessed them, whether or not they scored. */
  reviewerCount: number;
  /**
   * Sum of the SCORING reviewers' totals. Null when nobody scored, and always
   * null on an entry from an application form: see `mean`.
   */
  total: number | null;
  /**
   * `total` over the number of scoring reviewers. Null when nobody scored.
   *
   * On an entry from an application form it is the mean of the scoring
   * reviewers' own scores, one voice each, on the 1 to 5 scale, and there is
   * no `total` beside it: a sum of per-answer scores says nothing when two
   * applications were asked a different number of scored questions.
   */
  mean: number | null;
  /**
   * Mean per criterion id, over the reviewers who scored that criterion.
   * A criterion nobody scored is present with a null rather than absent, so a
   * reader can tell "nobody scored this" from "this criterion did not exist".
   *
   * On an entry from an application form the keys are PROGRAMME ids: one per
   * programme the person ranked that scores its answers, holding that
   * programme's section score, or null when nobody scored it. A programme that
   * does not use scores is absent.
   */
  byCriterion: Record<string, number | null>;
};

/**
 * `memberRecords/{uid}/applications/{roundId}`.
 *
 * `roundKind`, `outcome.decision` and `outcome.status` are stored and read
 * back as PLAIN STRINGS rather than as the admissions enums they came from.
 * This is a historical document: it has to keep saying what was true when it
 * was written, even after a later build renames a status or drops a decision,
 * and coercing an unrecognised value onto a known member would make the entry
 * claim an outcome that never happened. The `courseAudit` normaliser takes the
 * same position, for the same reason.
 */
export type ApplicationRecordDoc = {
  /** Firestore doc id, and always equal to `roundId`. */
  id: string;
  roundId: string;
  roundTitle: string;
  roundKind: string;
  /**
   * Human labels for what the person asked for: the incubator stream they
   * picked, then the fellowships in the order they ranked them, then the
   * fallback tick if they set it. Empty when the round asked nothing about
   * programme choice (an appointment round, or a round with the section off),
   * in which case `roundTitle` is what says what they applied for.
   *
   * On an entry from an application form: the programmes they ranked, by
   * short name, 1st choice first.
   */
  appliedFor: string[];
  /** The application's `createdAt`: when they started it. */
  appliedAt: Date | null;
  submittedAt: Date | null;
  outcome: {
    /**
     * What the final decider pressed. On an entry from an application form,
     * what decision day told them and the programme it named, as
     * "accepted (AGI Strategy)", or null when nothing had been published.
     */
    decision: string | null;
    status: string;
    targetRunId: string | null;
  };
  scoreSummary: ApplicationRecordScoreSummary;
  reviewerNotes: ApplicationRecordReviewerNote[];
  writtenAt: Date | null;
  writtenBy: MemberRecordWriter;
  writtenByUid: string;
};

/** What `buildApplicationRecord` returns: the doc id and the stamp are the writer's. */
export type ApplicationRecordInput = Omit<ApplicationRecordDoc, "id" | "writtenAt">;

// ---------------------------------------------------------------------------
// Small coercions (the per-file idiom in this directory)
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function strOrNull(v: unknown, max: number): string | null {
  const s = str(v, max);
  return s.length > 0 ? s : null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Two decimal places. A mean of three integers is 3.6666666666666665 in IEEE
 * arithmetic, and a stored record carrying that number reads as false
 * precision about a judgement three people made on a five-point scale.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * The display name for a reviewer, from the names the caller resolved.
 *
 * An address is refused as hard as a missing name. `reviewerNames` is normally
 * built from `users.displayName`, and a display name can itself be an email
 * address, so "fall back when the name is missing" is not enough on its own:
 * the record is read by every SU-recognised committee member and outlives the
 * round, and it has no reason to carry a contact address for the person who
 * wrote the notes.
 */
function reviewerDisplayName(
  reviewerUid: string,
  reviewerNames: Record<string, string>,
): string {
  const raw = reviewerNames[reviewerUid];
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.includes("@")) return UNNAMED_REVIEWER;
  return name.slice(0, MEMBER_RECORD_LIMITS.reviewerName);
}

/**
 * The human labels for what the applicant asked for.
 *
 * ORDER IS MEANING. The stream comes first because a round that offers one
 * asks for it first; the fellowships follow in the applicant's own ranked
 * order, so position in this list IS their preference; the fallback tick comes
 * last because it is a condition on the rest rather than another choice.
 *
 * EVIDENCE RUNS ARE DELIBERATELY NOT HERE, though the application stores them.
 * `evidence.runs` is what the committee LOOKED AT (attendance and submission
 * rollups from the pre-course), not what the person asked for, and the
 * application stores those runs as ids with no labels beside them. Putting
 * them in would both misname the field and break its contract, which is human
 * labels and never a bare id.
 */
function deriveAppliedFor(
  round: AdmissionRoundDoc,
  application: AdmissionApplicationDoc,
): string[] {
  const preference = round.programmePreference;
  if (!preference.enabled) return [];

  const labels: string[] = [];
  const streamLabel = new Map(preference.streams.map((s) => [s.id, s.label]));
  const fellowshipLabel = new Map(preference.fellowships.map((f) => [f.id, f.label]));

  const answer = application.programmePreference;
  if (answer.streamId) {
    labels.push(streamLabel.get(answer.streamId) ?? REMOVED_PROGRAMME_LABEL);
  }
  for (const id of answer.rankedFellowshipIds) {
    labels.push(fellowshipLabel.get(id) ?? REMOVED_PROGRAMME_LABEL);
  }
  if (answer.openToFellowship) labels.push(OPEN_TO_FELLOWSHIP_LABEL);

  return distinctLabels(labels);
}

/**
 * The labels as the entry stores them: trimmed, cut to length, in the order
 * given, and capped.
 *
 * De-duplicated on the LABEL rather than on the id: two ids can carry one
 * label (a round edited so that a removed option and a live one read the
 * same), and the record is read as a list of names.
 */
function distinctLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim().slice(0, MEMBER_RECORD_LIMITS.appliedForLabel);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MEMBER_RECORD_LIMITS.maxAppliedFor) break;
  }
  return out;
}

/**
 * The reviews that belong to THIS application, in a stable order.
 *
 * The filter is a safety property rather than tidiness. The entry is a record
 * about a named person that outlives everything it was derived from, so a
 * caller whose query was one clause short must not be able to staple somebody
 * else's assessments onto it: a row naming a different round or a different
 * applicant is dropped. A row that names NEITHER (an older row, a fixture) is
 * kept, because the alternative is silently emptying a record whose reviews
 * are sitting right there.
 *
 * The sort is by reviewer uid so a record rewritten later (a settle, then a
 * destroy that finds the entry stale) does not shuffle its own notes.
 *
 * NOTHING IS CAPPED HERE. `maxReviewerNotes` trims the notes list at the point
 * the notes are built, and only there: an applicant with more reviews than the
 * cap must still be SCORED over all of them, or `reviewerCount`, `mean` and
 * `byCriterion` would quietly describe the first twenty reviewers in uid order,
 * which is an arithmetic nobody asked for and no reader could detect.
 */
function reviewsForApplication<
  R extends { roundId: string; applicantUid: string; reviewerUid: string },
>(roundId: string, applicantUid: string, reviews: readonly R[]): R[] {
  return reviews
    .filter((review) => {
      if (review.roundId && review.roundId !== roundId) return false;
      if (review.applicantUid && review.applicantUid !== applicantUid) return false;
      return true;
    })
    .slice()
    .sort((a, b) => a.reviewerUid.localeCompare(b.reviewerUid));
}

/** True when this reviewer put a number against at least one criterion. */
function hasScored(review: AdmissionReviewDoc): boolean {
  return Object.keys(review.scores).length > 0;
}

/**
 * The score summary.
 *
 * A REVIEWER WHO DID NOT SCORE IS EXCLUDED FROM THE MEAN, and that is the one
 * piece of arithmetic here worth arguing. `AdmissionReviewDoc.total` is the sum
 * of the scores map, so a reviewer who wrote notes and a recommendation without
 * touching the sliders has a total of 0. Counting them would pull the mean
 * towards zero and report a worse applicant than the reviewers described. They
 * are still counted in `reviewerCount` and their notes are still kept: they
 * assessed the person, they just did not score them.
 */
function deriveScoreSummary(
  round: AdmissionRoundDoc,
  reviews: AdmissionReviewDoc[],
): ApplicationRecordScoreSummary {
  const scoring = reviews.filter(hasScored);

  const byCriterion: Record<string, number | null> = {};
  for (const criterion of round.criteria.slice(0, MEMBER_RECORD_LIMITS.maxCriteria)) {
    const scores: number[] = [];
    for (const review of reviews) {
      const score = own(review.scores, criterion.id);
      if (typeof score === "number" && Number.isFinite(score)) scores.push(score);
    }
    byCriterion[criterion.id] =
      scores.length > 0
        ? round2(scores.reduce((sum, n) => sum + n, 0) / scores.length)
        : null;
  }

  if (scoring.length === 0) {
    return { reviewerCount: reviews.length, total: null, mean: null, byCriterion };
  }
  const total = scoring.reduce((sum, review) => sum + review.total, 0);
  return {
    reviewerCount: reviews.length,
    total: round2(total),
    mean: round2(total / scoring.length),
    byCriterion,
  };
}

/**
 * Everything the committee keeps about one application, derived from the round,
 * the application and its reviews. PURE: no Firestore, no clock, no ids
 * invented. The caller stamps `writtenAt` and addresses the document.
 *
 * `reviewerNames` maps a reviewer uid to a display name. A uid missing from it
 * reads as `UNNAMED_REVIEWER`, which is the right answer rather than a reason
 * to fail: a reviewer who has since deleted their account has no name left to
 * look up, and their assessment is still part of the record.
 */
export function buildApplicationRecord(input: {
  round: AdmissionRoundDoc;
  application: AdmissionApplicationDoc;
  reviews: AdmissionReviewDoc[];
  reviewerNames: Record<string, string>;
  writtenBy: MemberRecordWriter;
  writtenByUid: string;
}): ApplicationRecordInput {
  const { round, application, reviewerNames, writtenBy, writtenByUid } = input;
  const reviews = reviewsForApplication(round.id, application.uid, input.reviews);

  return {
    roundId: round.id,
    roundTitle: str(round.label, MEMBER_RECORD_LIMITS.roundTitle),
    roundKind: str(round.kind, MEMBER_RECORD_LIMITS.roundKind),
    appliedFor: deriveAppliedFor(round, application),
    // `createdAt` is when the draft was first saved, which is the honest answer
    // to "when did they apply": an application that was never submitted still
    // happened, and the record says so through a null `submittedAt` beside it.
    appliedAt: application.createdAt ?? null,
    submittedAt: application.submittedAt,
    outcome: {
      decision: application.outcome.decision,
      status: application.status,
      targetRunId: application.outcome.targetRunId,
    },
    // Scored over EVERY review that belongs to this application, then the notes
    // list alone is capped: see `reviewsForApplication`.
    scoreSummary: deriveScoreSummary(round, reviews),
    reviewerNotes: reviews
      .slice(0, MEMBER_RECORD_LIMITS.maxReviewerNotes)
      .map((review) => ({
        reviewerUid: review.reviewerUid,
        reviewerName: reviewerDisplayName(review.reviewerUid, reviewerNames),
        recommendation: review.recommendation,
        // Null rather than 0 for an unscored review, so nobody reads "they
        // scored this person zero" off a reviewer who never touched the
        // sliders.
        total: hasScored(review) ? review.total : null,
        notes: str(review.notes, MEMBER_RECORD_LIMITS.notes),
      })),
    writtenBy,
    writtenByUid,
  };
}

// ---------------------------------------------------------------------------
// Derivation: an application made on an application form
// ---------------------------------------------------------------------------

/** What the builder reads off the form: its programmes and how they are scored. */
type FormForRecord = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating" | "revealOtherReviews"
>;

/**
 * The name the record uses for a programme: its short name, the one rankings
 * and emails use. A ranked id the form no longer carries gets the same
 * sentence an older round gives a removed option, and never the bare id.
 *
 * The programme is read as the form's OWN key (`own`, in
 * `src/lib/applications/keys.ts`), here and everywhere below. A ranking is
 * something an applicant typed, and a name every object carries is not a
 * programme on any form. One such name must not be able to break the record
 * of the application it sits on, because a record that cannot be built is
 * what makes a destroy refuse.
 */
function programmeLabel(form: FormForRecord, programmeId: string): string {
  const programme = own(form.programmes, programmeId);
  if (!programme) return REMOVED_PROGRAMME_LABEL;
  return (programme.shortName || programme.name || "").trim() || UNNAMED_PROGRAMME_LABEL;
}

/**
 * What decision day told them, as one plain string: the outcome, and the
 * programme it named when it named one.
 *
 * It reads `result` and nothing else. Each lead's decision, the outcome picked
 * for a pooled applicant and an admin's exception are the committee's working
 * state until decision day publishes; what was published onto the application
 * is what happened to the person, so that is what the record keeps. An
 * application nothing was published on says null here, and its status says the
 * rest.
 */
function deriveFormOutcome(
  form: FormForRecord,
  application: ApplicationDoc,
): ApplicationRecordDoc["outcome"] {
  const result = application.result;
  if (result === null) {
    return { decision: null, status: application.status, targetRunId: null };
  }
  // Only a place and an invitation name a programme. The other two outcomes
  // name none, whatever a stored row carries beside them.
  const programmeId =
    result.kind === "accepted" || result.kind === "invited" ? result.programmeId : null;
  const decision = programmeId
    ? `${result.kind} (${programmeLabel(form, programmeId)})`
    : result.kind;
  return {
    decision: decision.slice(0, MEMBER_RECORD_LIMITS.decision),
    status: application.status,
    // The run that programme places people on, once it has one.
    targetRunId: programmeId ? (own(form.programmes, programmeId)?.runId ?? null) : null,
  };
}

/**
 * One reviewer's score on an application form: the mean of every score they
 * gave this application, or null when they gave none.
 *
 * EVERY score in the row counts, whichever programme's answer it was given
 * to. A row is the reviewer's whole assessment of the person, and reading it
 * through today's question sets would drop a score whose question has since
 * left the form, which is a number no reader could tell was missing.
 */
function formReviewerScore(review: Pick<ReviewDoc, "scores">): number | null {
  const given: number[] = [];
  for (const score of Object.values(review.scores)) {
    if (typeof score === "number" && Number.isFinite(score)) given.push(score);
  }
  if (given.length === 0) return null;
  return given.reduce((sum, n) => sum + n, 0) / given.length;
}

/**
 * The score summary for an application made on an application form.
 *
 * The arithmetic is that system's own (`src/lib/applications/scoring.ts`), so
 * the entry agrees with what the leads were shown: a reviewer's score is the
 * mean of the 1 to 5 scores they gave, and a programme's section score is the
 * mean of its reviewers' scores, one voice each.
 *
 *  - `byCriterion` holds one section score per programme the person ranked
 *    that scores its answers. At most `APPLICATION_LIMITS.maxProgrammes` keys,
 *    which is inside what a read keeps, so no programme's score is cut.
 *  - `mean` is over the reviewers who scored at all, one voice each, and takes
 *    every score in each row (see `formReviewerScore`).
 *  - `total` is null. See the type.
 */
function deriveFormScoreSummary(
  form: FormForRecord,
  sets: readonly QuestionSetDoc[],
  rankedProgrammeIds: readonly string[],
  reviews: readonly ReviewDoc[],
): ApplicationRecordScoreSummary {
  const byCriterion: Record<string, number | null> = {};
  for (const programmeId of rankedProgrammeIds) {
    if (!own(form.programmes, programmeId)) continue;
    const keys = scoredKeysFor(form, sets, programmeId);
    if (keys.length === 0) continue;
    const { score } = sectionScore(reviews, keys);
    byCriterion[programmeId] = score === null ? null : round2(score);
  }

  const voices: number[] = [];
  for (const review of reviews) {
    const score = formReviewerScore(review);
    if (score !== null) voices.push(score);
  }
  return {
    reviewerCount: reviews.length,
    total: null,
    mean:
      voices.length > 0
        ? round2(voices.reduce((sum, n) => sum + n, 0) / voices.length)
        : null,
    byCriterion,
  };
}

/**
 * Everything the committee keeps about one application made on an application
 * form. The sibling of `buildApplicationRecord`, with the same contract: PURE,
 * the same entry shape, and the caller stamps `writtenAt` and addresses the
 * document.
 *
 * WHICH COPY IT READS. `sent` is the application of record, so it is what the
 * entry describes. Somebody who never pressed Send has only a draft, and the
 * programmes they had ranked in it are recorded as they stood, beside a status
 * that says it was never sent, the way an older round records a draft.
 *
 * WHAT IT LEAVES OUT. A reviewer's comments on single answers are not copied:
 * each is a note on a piece of the applicant's own writing, which the entry
 * deliberately does not hold, so it goes with the answer it is about. The
 * reviewer's overall comment is the note the entry keeps, verbatim.
 *
 * `sets` are the form's question sets as they stand. They decide which scored
 * answers belong to which programme and nothing else.
 */
export function buildFormApplicationRecord(input: {
  round: Pick<AdmissionRoundDoc, "id" | "label" | "kind">;
  form: FormForRecord;
  sets: readonly QuestionSetDoc[];
  application: ApplicationDoc;
  reviews: ReviewDoc[];
  reviewerNames: Record<string, string>;
  writtenBy: MemberRecordWriter;
  writtenByUid: string;
}): ApplicationRecordInput {
  const { round, form, sets, application, reviewerNames, writtenBy, writtenByUid } = input;
  const reviews = reviewsForApplication(round.id, application.uid, input.reviews);
  const content = application.sent ?? application.draft;

  return {
    roundId: round.id,
    roundTitle: str(round.label, MEMBER_RECORD_LIMITS.roundTitle),
    roundKind: str(round.kind, MEMBER_RECORD_LIMITS.roundKind),
    // Position in this list is their preference: 1st choice first.
    appliedFor: distinctLabels(
      content.rankedProgrammeIds.map((programmeId) => programmeLabel(form, programmeId)),
    ),
    appliedAt: application.createdAt ?? null,
    // The first time they pressed Send. Null for an application never sent.
    submittedAt: application.submittedAt,
    outcome: deriveFormOutcome(form, application),
    // Scored over EVERY review that belongs to this application, then the notes
    // list alone is capped, exactly as on an older round.
    scoreSummary: deriveFormScoreSummary(form, sets, content.rankedProgrammeIds, reviews),
    reviewerNotes: reviews
      .slice(0, MEMBER_RECORD_LIMITS.maxReviewerNotes)
      .map((review) => {
        const score = formReviewerScore(review);
        return {
          reviewerUid: review.reviewerUid,
          reviewerName: reviewerDisplayName(review.reviewerUid, reviewerNames),
          recommendation: null,
          // Null rather than 0 for a reviewer who commented without scoring.
          total: score === null ? null : round2(score),
          notes: str(review.overallComment, MEMBER_RECORD_LIMITS.notes),
        };
      }),
    writtenBy,
    writtenByUid,
  };
}

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

/**
 * The server-timestamp sentinel, taken from the Firestore CLASS the caller's
 * own instance came from rather than from a module-level
 * `import { FieldValue } from "firebase-admin/firestore"`.
 *
 * WHY, because it is the one odd line in this file. A value import of the
 * Admin SDK here would reach the browser, because a `"use client"` module does
 * import the pure half of this file (`useMemberApplications.ts`, see the
 * header), and `firebase-admin` has no browser build. The sentinel is the same
 * object either way, because `firebase-admin/firestore` re-exports
 * `@google-cloud/firestore`'s `FieldValue` and every Firestore instance is
 * built from that same class, so `db.constructor.FieldValue.serverTimestamp()`
 * and `FieldValue.serverTimestamp()` produce sentinels that compare equal.
 *
 * A real server timestamp rather than `new Date()`, because the entry is a
 * record that outlives everything it was derived from and a stamp from the
 * container's own clock is one clock skew away from claiming the record was
 * written before the round it describes was decided.
 *
 * It throws rather than falling back if the class does not carry it, which can
 * only happen if something handed this function an object that is not a
 * Firestore. Falling back to a local Date there would write a record that
 * looks right and is quietly stamped by the wrong clock.
 */
function serverTimestamp(db: Firestore): FieldValue {
  const sentinel = (
    db.constructor as unknown as {
      FieldValue?: { serverTimestamp?: () => FieldValue };
    }
  ).FieldValue?.serverTimestamp?.();
  if (!sentinel) {
    throw new Error(
      "memberRecords: this Firestore instance carries no FieldValue, so an entry " +
        "cannot be stamped with a server timestamp",
    );
  }
  return sentinel;
}

/**
 * Write (or rewrite) one application entry, and make sure the parent document
 * exists so the subcollection is visible in a console listing.
 *
 * ONE BATCH, so the two writes land together and a failure is a clean refusal
 * rather than a parent with no entry under it. That matters because the round
 * destroy is required to write a missing entry FIRST and refuse if the write
 * fails: a half-written record would let the cascade carry on over a record
 * that does not say what it is supposed to say.
 *
 * `set` REPLACES the entry rather than merging into it. An entry is a summary
 * of state that can move (a decision reversed, a review re-scored), so a rewrite
 * has to be able to remove a field as well as add one; merging would leave a
 * stale reviewer note under a reviewer who withdrew their assessment.
 *
 * The payload is assembled field by field rather than spread, for two reasons:
 * Firestore refuses `undefined` and a hand-built input could carry one, and an
 * entry must never gain a key nobody declared (the caller derives it from
 * documents full of applicant PII, so a stray spread is a leak, not a typo).
 */
export async function upsertApplicationRecord(
  db: Firestore,
  uid: string,
  record: ApplicationRecordInput,
): Promise<void> {
  const writtenAt = serverTimestamp(db);
  const parentRef = db.collection(MEMBER_RECORDS_COLLECTION).doc(uid);
  const entryRef = parentRef.collection(MEMBER_RECORD_APPLICATIONS).doc(record.roundId);

  const batch = db.batch();
  batch.set(
    parentRef,
    { uid, updatedAt: writtenAt },
    // Merged, because the parent is shared furniture: the participation slice
    // will hang its own fields here and must not be wiped by the next
    // application entry.
    { merge: true },
  );
  batch.set(entryRef, {
    roundId: record.roundId,
    roundTitle: record.roundTitle,
    roundKind: record.roundKind,
    appliedFor: record.appliedFor,
    appliedAt: record.appliedAt,
    submittedAt: record.submittedAt,
    outcome: {
      decision: record.outcome.decision,
      status: record.outcome.status,
      targetRunId: record.outcome.targetRunId,
    },
    scoreSummary: {
      reviewerCount: record.scoreSummary.reviewerCount,
      total: record.scoreSummary.total,
      mean: record.scoreSummary.mean,
      byCriterion: record.scoreSummary.byCriterion,
    },
    reviewerNotes: record.reviewerNotes.map((note) => ({
      reviewerUid: note.reviewerUid,
      reviewerName: note.reviewerName,
      recommendation: note.recommendation,
      total: note.total,
      notes: note.notes,
    })),
    writtenAt,
    writtenBy: record.writtenBy,
    writtenByUid: record.writtenByUid,
  });
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Normaliser
// ---------------------------------------------------------------------------

function asAppliedFor(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    const label = str(entry, MEMBER_RECORD_LIMITS.appliedForLabel).trim();
    if (!label) continue;
    out.push(label);
    if (out.length >= MEMBER_RECORD_LIMITS.maxAppliedFor) break;
  }
  return out;
}

function asByCriterion(v: unknown): Record<string, number | null> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number | null> = {};
  let kept = 0;
  for (const [criterionId, score] of Object.entries(v as Raw)) {
    if (kept >= MEMBER_RECORD_LIMITS.maxCriteria) break;
    // A stored null is MEANINGFUL here ("nobody scored this criterion"), so it
    // is kept rather than dropped; anything that is neither a finite number nor
    // null becomes null, which reads the same way.
    out[criterionId] = finiteOrNull(score);
    kept += 1;
  }
  return out;
}

function asReviewerNotes(v: unknown): ApplicationRecordReviewerNote[] {
  if (!Array.isArray(v)) return [];
  const out: ApplicationRecordReviewerNote[] = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Raw;
    const reviewerUid = str(raw.reviewerUid, MEMBER_RECORD_LIMITS.uid);
    if (!reviewerUid) continue;
    const storedName = str(raw.reviewerName, MEMBER_RECORD_LIMITS.reviewerName).trim();
    out.push({
      reviewerUid,
      // The address guard runs on READ as well as on write. A row written
      // before the guard existed, or by a build that lost it, must not put an
      // address on somebody's screen because this normaliser trusted it.
      reviewerName: storedName && !storedName.includes("@") ? storedName : UNNAMED_REVIEWER,
      recommendation: strOrNull(raw.recommendation, MEMBER_RECORD_LIMITS.decision),
      total: finiteOrNull(raw.total),
      notes: str(raw.notes, MEMBER_RECORD_LIMITS.notes),
    });
    if (out.length >= MEMBER_RECORD_LIMITS.maxReviewerNotes) break;
  }
  return out;
}

function asWriter(v: unknown): MemberRecordWriter {
  const writer = typeof v === "string" ? v : "";
  if ((MEMBER_RECORD_WRITERS as string[]).includes(writer)) {
    return writer as MemberRecordWriter;
  }
  // A value this build cannot name falls to `backfill`, which is the only
  // member of the union that does not claim a specific event happened: it
  // means "some tool wrote this after the fact", which is true of a row whose
  // writer we no longer recognise.
  return "backfill";
}

/**
 * One stored entry, coerced. `id` is the document id, which IS the round id by
 * construction, so it is also the fallback for a row whose `roundId` field
 * went missing.
 */
export function normalizeApplicationRecord(id: string, data: Raw): ApplicationRecordDoc {
  const outcome = (data.outcome ?? {}) as Raw;
  const summary = (data.scoreSummary ?? {}) as Raw;
  const reviewerCount = finiteOrNull(summary.reviewerCount);
  return {
    id,
    roundId: str(data.roundId, MEMBER_RECORD_LIMITS.roundId) || id,
    roundTitle: str(data.roundTitle, MEMBER_RECORD_LIMITS.roundTitle),
    roundKind: str(data.roundKind, MEMBER_RECORD_LIMITS.roundKind),
    appliedFor: asAppliedFor(data.appliedFor),
    appliedAt: tsToDate(data.appliedAt),
    submittedAt: tsToDate(data.submittedAt),
    outcome: {
      decision: strOrNull(outcome.decision, MEMBER_RECORD_LIMITS.decision),
      status: str(outcome.status, MEMBER_RECORD_LIMITS.status),
      targetRunId: strOrNull(outcome.targetRunId, MEMBER_RECORD_LIMITS.runId),
    },
    scoreSummary: {
      reviewerCount:
        reviewerCount !== null && reviewerCount >= 0 ? Math.floor(reviewerCount) : 0,
      total: finiteOrNull(summary.total),
      mean: finiteOrNull(summary.mean),
      byCriterion: asByCriterion(summary.byCriterion),
    },
    reviewerNotes: asReviewerNotes(data.reviewerNotes),
    writtenAt: tsToDate(data.writtenAt),
    writtenBy: asWriter(data.writtenBy),
    writtenByUid: str(data.writtenByUid, MEMBER_RECORD_LIMITS.uid),
  };
}
