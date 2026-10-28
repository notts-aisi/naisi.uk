import { createHash } from "node:crypto";
import { PANGRAM_MIN_WORDS, wordCount } from "@/lib/ai/pangram";
import { own } from "../keys";
import type { AnswerView, ReviewPayload } from "../review/types";

/**
 * WHAT LEAVES THE SITE WHEN AN ADMIN ASKS FOR AN ASSESSMENT.
 *
 * Built from the review screen's payload for an admin, and from nothing else:
 * whatever reaches Claude or Pangram is already on the admin's own screen. So
 * the fences around an application hold here by construction. The
 * access-requirements answer and the SU membership answer are in no review
 * payload (docs/applications.md, "What is kept apart"), and this file names
 * neither.
 *
 * Then it takes out what an assessment does not need:
 *
 *  - NO APPLICANT NAME, EMAIL OR ACCOUNT ID. The applicant is "the applicant".
 *    Words they typed into an answer are sent as they typed them.
 *  - NO REVIEWER NAMES. Reviewers are "Reviewer A", "Reviewer B" and so on,
 *    lettered in name order so every admin builds the same letters. What is
 *    kept is which account each letter was (`reviewerUids`), and the letters
 *    are turned back into first names only on the way to the screen
 *    (`withNames`), so a stored read never holds a reviewer's name.
 *  - NO AVAILABILITY. When somebody is free is for placing them, not judging
 *    their application.
 *  - NOTHING THAT MOVES WITHOUT THE APPLICATION MOVING. The message is hashed
 *    (`fingerprint`) and a stored read whose hash no longer matches is shown
 *    as out of date, so only the answers and the reviews may change it.
 *
 * Pure, so a test can run it on a payload and read every line that would go.
 */

export type LongAnswer = { key: string; question: string; text: string; words: number };

export type AssessmentInput = {
  /** The message Claude is sent. */
  message: string;
  /** "Reviewer A" to the reviewer's account, or null when only a name is known. */
  reviewerUids: Record<string, string | null>;
  /** Answers long enough to send to Pangram, by the key a comment uses. */
  longAnswers: LongAnswer[];
  /** A hash of `message`, kept with a result to tell when it is out of date. */
  fingerprint: string;
};

function answerText(answer: Pick<AnswerView, "answered" | "text" | "items" | "scale" | "type">): string {
  if (!answer.answered) return "(left blank)";
  if (answer.scale) return answer.scale.options[answer.scale.index] ?? "(left blank)";
  if (answer.items) {
    return answer.type === "rank"
      ? answer.items.map((item, i) => `${i + 1}. ${item}`).join("; ")
      : answer.items.join("; ");
  }
  return answer.text ?? "(left blank)";
}

type Reviewer = { name: string; uid: string | null; score: string | null; overallComment: string };

/** Every review an admin is shown, the admin's own among them, in name order. */
function reviewersOf(review: ReviewPayload, viewerUid: string): Reviewer[] {
  const list: Reviewer[] = review.review.others.visible.map((other) => ({
    name: other.name,
    uid: other.reviewerUid,
    score: other.score,
    overallComment: other.overallComment.trim(),
  }));
  const own = review.review;
  const ownComments = own.comments.some((comment) => comment.mine);
  if (own.ownScore !== null || own.overallComment.trim() || ownComments) {
    list.push({
      name: review.viewer.name,
      uid: viewerUid,
      score: own.ownScore,
      overallComment: own.overallComment.trim(),
    });
  }
  // Somebody who commented on a shared answer for another programme has no
  // review of this one: they are lettered too, by name alone.
  for (const comment of own.comments) {
    if (!list.some((reviewer) => reviewer.name === comment.authorName)) {
      list.push({ name: comment.authorName, uid: null, score: null, overallComment: "" });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name) || (a.uid ?? "").localeCompare(b.uid ?? ""));
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function assessmentInputFrom(review: ReviewPayload, viewerUid: string): AssessmentInput {
  const { applicant, programme } = review;
  const reviewers = reviewersOf(review, viewerUid);
  const labelOf = new Map<string, string>();
  const reviewerUids: Record<string, string | null> = {};
  reviewers.forEach((reviewer, i) => {
    const label = `Reviewer ${LETTERS[i] ?? String(i + 1)}`;
    if (!labelOf.has(reviewer.name)) labelOf.set(reviewer.name, label);
    reviewerUids[label] = reviewer.uid;
  });

  const questionOf = new Map<string, string>([[applicant.about.motivationKey, "Why are you applying?"]]);
  const lines: string[] = [];
  const longAnswers: LongAnswer[] = [];

  lines.push(`# The programme being decided: ${programme.name}`);
  // Places, never places LEFT: that moves with every decision, and would mark
  // every read out of date the moment anybody was accepted.
  if (programme.places !== null) lines.push(`Places: ${programme.places}.`);
  lines.push("", "# The applicant");
  lines.push(`Status: ${applicant.about.status || "not given"}`);
  if (applicant.about.subject) lines.push(`${applicant.about.subjectLabel || "Subject"}: ${applicant.about.subject}`);
  if (applicant.about.graduating) lines.push(`Graduating: ${applicant.about.graduating}`);
  if (applicant.about.interests) lines.push(`Interests: ${applicant.about.interests}`);
  if (applicant.ranked.length > 0) {
    lines.push(
      `Programmes ranked: ${applicant.ranked
        .slice()
        .sort((a, b) => a.choice - b.choice)
        .map((entry) => `${entry.choice}. ${entry.shortName}`)
        .join(", ")}`,
    );
  }
  if (applicant.invitedTo) lines.push(`Joined ${applicant.invitedTo.shortName} by accepting an invitation.`);
  lines.push(`Wants to facilitate: ${applicant.wantsToFacilitate ? "yes" : "no"}`);
  lines.push("", "## Why are you applying?", applicant.about.motivation.trim() || "(left blank)");
  const motivationWords = wordCount(applicant.about.motivation);
  if (motivationWords >= PANGRAM_MIN_WORDS) {
    longAnswers.push({
      key: applicant.about.motivationKey,
      question: "Why are you applying?",
      text: applicant.about.motivation.trim(),
      words: motivationWords,
    });
  }

  for (const section of review.sections) {
    lines.push("", `# ${section.title}`);
    for (const answer of section.answers) {
      questionOf.set(answer.key, answer.question);
      lines.push("", `## ${answer.question}`, answerText(answer));
      const words = answer.answered && answer.text ? wordCount(answer.text) : 0;
      if (words >= PANGRAM_MIN_WORDS && answer.text) {
        longAnswers.push({ key: answer.key, question: answer.question, text: answer.text.trim(), words });
      }
    }
  }

  lines.push("", "# What the committee said");
  if (review.admin) {
    const scored = review.admin.sections.filter((section) => section.score !== null);
    if (scored.length > 0) {
      lines.push(
        `Average scores out of 5: ${scored.map((section) => `${section.shortName} ${section.score}`).join(", ")}`,
      );
    }
  }
  if (reviewers.length === 0) lines.push("Nobody has reviewed this application yet.");
  for (const reviewer of reviewers) {
    const label = labelOf.get(reviewer.name) ?? "A reviewer";
    lines.push("", `## ${label}`);
    lines.push(`Score for ${programme.shortName}: ${reviewer.score ?? "not scored"}`);
    lines.push(`Overall comment: ${reviewer.overallComment || "(none)"}`);
    for (const comment of review.review.comments) {
      if (comment.authorName !== reviewer.name) continue;
      lines.push(`On "${questionOf.get(comment.key) ?? "an answer"}": ${comment.text.trim()}`);
    }
  }

  const message = lines.join("\n");
  return {
    message,
    reviewerUids,
    longAnswers,
    fingerprint: createHash("sha256").update(message).digest("hex").slice(0, 32),
  };
}

/** Put first names back where Claude wrote "Reviewer A", for the admin's screen. */
export function withNames(text: string, reviewerNames: Readonly<Record<string, string>>): string {
  return text.replace(/\bReviewer ([A-Z])\b/g, (whole) => own(reviewerNames, whole) ?? whole);
}
