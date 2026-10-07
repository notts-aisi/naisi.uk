import { formatRoundDate } from "@/lib/admissions/window";
import { formatRunStartShort } from "@/lib/courses/window";
import { hasBeenTold, isInTerm, owesDecision, placementFor, standingWith } from "../decisions";
import {
  questionKey,
  type AnswerValue,
  type ApplicationDoc,
  type ApplicationQuestion,
  type QuestionSetDoc,
} from "../model";
import type { ApplicationForm } from "../normalise";
import {
  formatScore,
  hasScored,
  hiddenReviewCount,
  reviewerScore,
  reviewsVisibleTo,
  scorableKeysFor,
  sectionScore,
} from "../scoring";
import { applicableSets } from "../sections";
import { isAnswered, optionsFor } from "../validate";
import { availabilityViewFor } from "./availabilityView";
import { own, programmeOn } from "./own";
import {
  UNNAMED_STAFF,
  applicantDetail,
  applicantFirstName,
  applicantName,
  degreeLabel,
  graduationLabel,
  listInWords,
  statusLabel,
} from "./people";
import { placesLeftOn, type TermPicture, type Viewer } from "./term";
import type {
  AnswerView,
  CommentView,
  OtherReview,
  ReviewPayload,
  ReviewSection,
  SectionChip,
  SectionScoreLine,
} from "./types";

/**
 * ONE APPLICATION, AS ONE CALLER MAY REVIEW IT.
 *
 * Built field by field from what was SENT (never the draft), for the
 * programme the caller opened it under. What this module decides:
 *
 *  - A FIRST REVIEW IS BLIND. What other people scored and wrote for the
 *    programme comes through `reviewsVisibleTo`, and what is held back leaves
 *    as a count and never as a body. The same answer decides every comment
 *    somebody else left on this application, with one more condition: a
 *    comment on ANOTHER stream's answer waits for the caller's first review
 *    of that stream too, when they review it.
 *  - ADDRESSES ARE FOR ADMINS. The two email fields are added for an admin
 *    and are otherwise not on the object at all.
 *  - EVERYTHING IS DERIVED: the standing, what is owed, the places left and
 *    the caller's own score are worked out here from the stored scores and
 *    decisions.
 *
 * Pure, with no server import: the route gates the caller and loads the
 * documents, and hands them here.
 */

/** The key an internal comment on the "why are you interested" answer uses. */
export const ABOUT_MOTIVATION_KEY = "about-you.motivation";

/** Where this application sits among the ones the caller has left. */
export type QueuePlace = ReviewPayload["queue"];

export function queuePlaceFor(order: readonly string[], queue: readonly string[], uid: string): QueuePlace {
  const waiting = new Set(queue);
  const at = order.indexOf(uid);
  let previousUid: string | null = null;
  let nextUid: string | null = null;
  if (at !== -1) {
    for (let i = at - 1; i >= 0 && previousUid === null; i -= 1) {
      if (waiting.has(order[i])) previousUid = order[i];
    }
    for (let i = at + 1; i < order.length && nextUid === null; i += 1) {
      if (waiting.has(order[i])) nextUid = order[i];
    }
  }
  const position = queue.indexOf(uid);
  return {
    position: position === -1 ? null : position + 1,
    total: queue.length,
    previousUid,
    nextUid,
  };
}

function sectionTitle(set: QuestionSetDoc): string {
  const label = set.label.trim();
  if (/questions$/i.test(label)) return label;
  if (set.scope.type === "kind" && set.scope.kind === "fellowship") return "Fellowship questions";
  return label ? `${label} questions` : "Questions";
}

function sectionTab(set: QuestionSetDoc): string {
  const label = set.label.trim();
  return label.replace(/\s+questions$/i, "") || label || "Questions";
}

function answerView(
  form: ApplicationForm,
  set: QuestionSetDoc,
  question: ApplicationQuestion,
  value: AnswerValue | undefined,
  ranking: { rankedProgrammeIds: string[] },
  scorable: boolean,
): AnswerView {
  const answered = isAnswered(value);
  const view: AnswerView = {
    key: questionKey(set.id, question.id),
    question: question.text,
    optional: !question.required,
    type: question.type,
    answered,
    text: null,
    items: null,
    scale: null,
    scorable,
  };
  if (!answered) return view;
  if (typeof value === "string") view.text = value;
  else if (Array.isArray(value)) view.items = [...value];
  else if (typeof value === "number") {
    view.scale = { options: optionsFor(question, form, ranking), index: value };
  }
  return view;
}

/** "4" or "3.5": a reviewer's own score inside a sentence. */
function compactScore(score: number): string {
  return Number.isInteger(score) ? String(score) : formatScore(score);
}

export function buildReview(input: {
  form: ApplicationForm;
  sets: readonly QuestionSetDoc[];
  term: TermPicture;
  viewer: Viewer;
  /** Programmes the caller is the named lead of, with standing. */
  leads: ReadonlySet<string>;
  /** The programme this application was opened under. */
  programmeId: string;
  canDecide: boolean;
  application: ApplicationDoc;
  accountWaiting: boolean;
  /** First names of the committee, by uid. */
  staffNames: ReadonlyMap<string, string>;
  /** Every application to the programme, in the order the list walks them. */
  order: readonly string[];
  /** The ones the caller still has to review, in the same order. */
  queue: readonly string[];
  lastRevocation: ReviewPayload["decision"]["lastRevocation"];
}): ReviewPayload | null {
  const { form, sets, term, viewer, leads, programmeId, canDecide, application, staffNames } = input;
  const sent = application.sent;
  const programme = programmeOn(form, programmeId);
  const role = own(viewer.roles, programmeId);
  if (!sent || !programme || !role) return null;
  const ranked = term.ranked.get(application.uid) ?? [];
  if (!ranked.includes(programmeId)) return null;

  const staffName = (uid: string) => staffNames.get(uid) ?? UNNAMED_STAFF;
  const reviews = term.reviews.get(application.uid) ?? [];
  const mine = reviews.find((review) => review.reviewerUid === viewer.uid) ?? null;
  const others = reviews.filter((review) => review.reviewerUid !== viewer.uid);
  const keys = scorableKeysFor(form, sets, programmeId, sent);

  // Is the caller's first review of a programme over? A programme with
  // nothing to score has no first review to protect.
  const keysOf = new Map<string, string[]>();
  for (const id of ranked) keysOf.set(id, scorableKeysFor(form, sets, id, sent));
  const lifted = (id: string) => form.revealOtherReviews || hasScored(mine, keysOf.get(id) ?? []);
  const liftedHere = lifted(programmeId);

  // -------------------------------------------------------------------------
  // The answers, in the order they were asked
  // -------------------------------------------------------------------------

  const fellowships = form.programmeIds.filter(
    (id) => programmeOn(form, id)?.kind === "fellowship",
  );
  /** The programme whose reviewers a stream answer belongs to, by its key. */
  const streamOf = new Map<string, string>();
  const commentKeys = new Set<string>([ABOUT_MOTIVATION_KEY]);

  const sections: ReviewSection[] = [];
  for (const set of applicableSets(form, sets, sent)) {
    const streamProgramme =
      set.role === "stream" && set.scope.type === "programme" ? set.scope.programmeId : null;
    const focus = streamProgramme === programmeId;
    const chips: SectionChip[] = [];
    let mode: ReviewSection["mode"] = "open";
    let note: string | null = null;

    if (focus) {
      mode = "focus";
      const scored = programme.useScores && set.questions.some((question) => question.scored);
      chips.push(scored ? { text: "Scored", tone: "accent" } : { text: "Not scored", tone: "neutral" });
    } else if (streamProgramme) {
      mode = "collapsed";
      const leadUid = programmeOn(form, streamProgramme)?.leadUid ?? null;
      if (leads.has(streamProgramme)) note = "You review these";
      else if (leadUid) note = `${staffName(leadUid)} reviews these`;
      else note = "Its own reviewers read these";
    } else if (set.role === "facilitator") {
      mode = "collapsed";
      if (viewer.isAdmin) note = "You and the programme’s lead decide these";
      else if (canDecide) note = "You and admins decide these";
      else note = "The lead and admins decide these";
    } else {
      if (set.scope.type === "kind" && set.scope.kind === "fellowship" && fellowships.length > 1) {
        chips.push({
          text: fellowships.length === 2 ? "For both fellowships" : "For every fellowship",
          tone: "neutral",
        });
      }
      chips.push({ text: "Not scored", tone: "neutral" });
    }

    const given = own(sent.answers, set.id);
    const answers = set.questions.map((question) => {
      const key = questionKey(set.id, question.id);
      commentKeys.add(key);
      if (streamProgramme) streamOf.set(key, streamProgramme);
      return answerView(
        form,
        set,
        question,
        own(given, question.id),
        sent,
        focus && keys.includes(key),
      );
    });
    sections.push({
      id: set.id,
      title: sectionTitle(set),
      tab: sectionTab(set),
      role: set.role,
      mode,
      chips,
      note,
      answers,
    });
  }

  // -------------------------------------------------------------------------
  // Scores and comments
  // -------------------------------------------------------------------------

  /** May this caller be shown what somebody else wrote on this answer? */
  const commentLifted = (key: string) => {
    if (!liftedHere) return false;
    const stream = streamOf.get(key);
    if (!stream || stream === programmeId || !own(viewer.roles, stream)) return true;
    return lifted(stream);
  };

  const comments: CommentView[] = [];
  for (const review of reviews) {
    const mine = review.reviewerUid === viewer.uid;
    for (const comment of review.comments) {
      if (!commentKeys.has(comment.questionKey)) continue;
      if (!mine && !commentLifted(comment.questionKey)) continue;
      comments.push({
        id: comment.id,
        key: comment.questionKey,
        text: comment.text,
        authorName: mine ? viewer.name : staffName(review.reviewerUid),
        mine,
        when: comment.createdAt ? formatRoundDate(comment.createdAt) : null,
      });
    }
  }

  // Other people's reviews FOR THIS PROGRAMME: a row that scores one of its
  // answers, or anything written by somebody the programme names. A row that
  // only scores another programme's answers is that programme's business.
  const namedHere = new Set([
    ...(programme.leadUid ? [programme.leadUid] : []),
    ...programme.reviewerUids,
  ]);
  const relevant = others.filter(
    (review) =>
      reviewerScore(review, keys) !== null ||
      (namedHere.has(review.reviewerUid) &&
        (review.comments.length > 0 || review.overallComment.trim() !== "")),
  );
  const forProgramme = mine ? [mine, ...relevant] : relevant;
  const visible = reviewsVisibleTo(viewer.uid, forProgramme, keys, form).filter(
    (review) => review.reviewerUid !== viewer.uid,
  );
  const visibleOthers: OtherReview[] = visible.map((review) => {
    const score = reviewerScore(review, keys);
    return {
      reviewerUid: review.reviewerUid,
      name: staffName(review.reviewerUid),
      score: score === null ? null : formatScore(score),
      overallComment: review.overallComment,
    };
  });

  const ownScores: Record<string, number> = {};
  for (const key of keys) {
    const score = own(mine?.scores, key);
    if (typeof score === "number") ownScores[key] = score;
  }
  const ownMean = mine ? reviewerScore(mine, keys) : null;

  // -------------------------------------------------------------------------
  // The decision
  // -------------------------------------------------------------------------

  const decision = term.decisions.get(application.uid) ?? null;
  const entry = own(decision?.programmes, programmeId) ?? null;
  const standing = standingWith(decision, programmeId);
  const owes = owesDecision(ranked, decision, programmeId);
  // Somebody who has left the term holds no place, whatever was decided.
  const placement = isInTerm(application) ? placementFor(ranked, decision) : null;

  // -------------------------------------------------------------------------
  // What only an admin is sent
  // -------------------------------------------------------------------------

  let admin: ReviewPayload["admin"] = null;
  if (viewer.isAdmin) {
    const lines: SectionScoreLine[] = [];
    for (const id of ranked) {
      const other = programmeOn(form, id);
      if (!other?.useScores) continue;
      const otherKeys = keysOf.get(id) ?? [];
      const scoredBy = reviews.filter((review) => reviewerScore(review, otherKeys) !== null);
      const seen = reviewsVisibleTo(viewer.uid, reviews, otherKeys, form);
      const section = sectionScore(seen, otherKeys);
      let line: string | null = null;
      if (section.reviewers.length === 1) {
        const only = section.reviewers[0];
        const row = seen.find((review) => review.reviewerUid === only.reviewerUid);
        const given = otherKeys
          .map((key) => own(row?.scores, key))
          .filter((score): score is number => typeof score === "number");
        line = `${staffName(only.reviewerUid)} scored ${listInWords(given.map(String))}`;
      } else if (section.reviewers.length > 1) {
        line = section.reviewers
          .map((reviewer) => {
            const partial = reviewer.scoredCount < otherKeys.length ? " so far" : "";
            return `${staffName(reviewer.reviewerUid)} ${compactScore(reviewer.score)}${partial}`;
          })
          .join(" · ");
      }
      lines.push({
        programmeId: id,
        shortName: other.shortName,
        score: section.score === null ? null : formatScore(section.score),
        line,
        hidden: hiddenReviewCount(viewer.uid, scoredBy, otherKeys, form),
      });
    }
    admin = { revealOtherReviews: form.revealOtherReviews, sections: lines };
  }

  const about = sent.aboutYou;
  const appliedAt = application.submittedAt ?? application.sentAt;
  const applicant: ReviewPayload["applicant"] = {
    uid: application.uid,
    name: applicantName(about, application.displayName),
    firstName: applicantFirstName(about, application.displayName),
    detail: applicantDetail(about),
    appliedOn: appliedAt ? formatRoundDate(appliedAt) : null,
    accountWaiting: input.accountWaiting,
    withdrawn: application.status === "withdrawn",
    ranked: ranked.map((id, at) => ({
      programmeId: id,
      shortName: programmeOn(form, id)?.shortName ?? "",
      choice: at + 1,
      focus: id === programmeId,
    })),
    wantsToFacilitate: sent.wantsToFacilitate === true,
    about: {
      status: statusLabel(about),
      subjectLabel: degreeLabel(about),
      subject: about.subject,
      graduating: graduationLabel(about.expectedGraduation),
      interests: about.interests,
      motivation: about.motivation,
      motivationKey: ABOUT_MOTIVATION_KEY,
    },
  };
  // An address is added for an admin, and is otherwise not on the object.
  if (viewer.isAdmin) {
    applicant.email = application.email;
    applicant.universityEmail = about.universityEmail || null;
  }

  return {
    round: {
      id: form.round.id,
      label: form.round.label,
      decisionDay: form.round.decisionsByDate
        ? (formatRunStartShort(form.round.decisionsByDate) ?? null)
        : null,
      decisionsSent: form.decisionsSentAt !== null,
    },
    viewer: { name: viewer.name, role, canDecide, isAdmin: viewer.isAdmin },
    programme: {
      id: programme.id,
      name: programme.name,
      shortName: programme.shortName,
      usesScores: programme.useScores,
      places: programme.places,
      placesLeft: placesLeftOn(form, term, programmeId),
      leadName: programme.leadUid ? staffName(programme.leadUid) : null,
    },
    applicant,
    sections,
    availability: availabilityViewFor(sent.availability),
    queue: queuePlaceFor(input.order, input.queue, application.uid),
    review: {
      scorableKeys: keys,
      scores: ownScores,
      ownScore: ownMean === null ? null : formatScore(ownMean),
      overallComment: mine?.overallComment ?? "",
      comments,
      others: {
        count: relevant.length,
        hidden: hiddenReviewCount(viewer.uid, forProgramme, keys, form),
        visible: visibleOthers,
      },
    },
    decision: {
      standing,
      owesDecision: owes,
      told: hasBeenTold(application),
      kind: entry?.decision ?? null,
      poolReason: entry?.poolReason ?? null,
      couldSuitProgrammeId: entry?.couldSuitProgrammeId ?? null,
      decidedByName: entry ? staffName(entry.decidedByUid) : null,
      decidedOn: entry?.decidedAt ? formatRoundDate(entry.decidedAt) : null,
      placedOn:
        standing === "to-review" && !owes && placement
          ? (programmeOn(form, placement)?.shortName ?? null)
          : null,
      couldSuitOptions: form.programmeIds
        .filter((id) => id !== programmeId)
        .map((id) => programmeOn(form, id))
        .filter((other): other is NonNullable<typeof other> => other !== null && !other.closed)
        .map((other) => ({ programmeId: other.id, shortName: other.shortName })),
      lastRevocation: canDecide ? input.lastRevocation : null,
    },
    admin,
  };
}

/**
 * The answers a comment may be attached to and the answers this caller may
 * score, for one sent application. The review write route holds a request to
 * these, so a score can only land on a programme the caller reviews.
 */
export function writableKeysFor(input: {
  form: ApplicationForm;
  sets: readonly QuestionSetDoc[];
  application: Pick<ApplicationDoc, "sent">;
  ranked: readonly string[];
  viewer: Pick<Viewer, "roles">;
}): { scoreKeys: string[]; commentKeys: string[] } {
  const { form, sets, application, ranked, viewer } = input;
  const sent = application.sent;
  if (!sent) return { scoreKeys: [], commentKeys: [] };
  const scoreKeys: string[] = [];
  for (const id of ranked) {
    if (!own(viewer.roles, id)) continue;
    for (const key of scorableKeysFor(form, sets, id, sent)) {
      if (!scoreKeys.includes(key)) scoreKeys.push(key);
    }
  }
  const commentKeys = [ABOUT_MOTIVATION_KEY];
  for (const set of applicableSets(form, sets, sent)) {
    for (const question of set.questions) commentKeys.push(questionKey(set.id, question.id));
  }
  return { scoreKeys, commentKeys };
}

/** The sum a stored review row carries beside its scores. */
export function totalOf(scores: Readonly<Record<string, number>>): number {
  return Object.values(scores).reduce((sum, score) => sum + score, 0);
}

