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
  /** Everything, the application and what the committee said: what a read is hashed from. */
  message: string;
  /**
   * The application alone, for Claude's first, BLIND, pass: nothing the
   * committee scored or wrote, as a reviewer reads before their own review.
   */
  application: string;
  /** What the committee scored and wrote, for the second pass. */
  committee: string;
  /** Whether anybody on the committee has said anything yet. */
  reviewed: boolean;
  /** "Reviewer A" to the reviewer's account, or null when only a name is known. */
  reviewerUids: Record<string, string | null>;
  /** The programmes the read gives a lean for, in the order the message names them. */
  programmes: { id: string; shortName: string }[];
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

type Reviewer = {
  name: string;
  uid: string | null;
  /** Their score for each programme they scored, by short name. */
  scores: Map<string, string>;
  overallComment: string;
};

/**
 * Every review an admin is shown on ANY of the programmes this application
 * can be opened under, the admin's own among them, once each, in name order.
 * Each programme's screen lists the reviewers of that programme, so the
 * union is everybody who said anything about the person.
 */
function reviewersOf(reviews: readonly ReviewPayload[], viewerUid: string): Reviewer[] {
  const byKey = new Map<string, Reviewer>();
  const take = (key: string, name: string, uid: string | null) => {
    let reviewer = byKey.get(key);
    if (!reviewer) {
      reviewer = { name, uid, scores: new Map(), overallComment: "" };
      byKey.set(key, reviewer);
    }
    return reviewer;
  };
  for (const review of reviews) {
    const programme = review.programme.shortName;
    for (const other of review.review.others.visible) {
      const reviewer = take(`uid:${other.reviewerUid}`, other.name, other.reviewerUid);
      if (other.score !== null) reviewer.scores.set(programme, other.score);
      if (other.overallComment.trim()) reviewer.overallComment = other.overallComment.trim();
    }
    const mine = review.review;
    if (mine.ownScore !== null || mine.overallComment.trim() || mine.comments.some((comment) => comment.mine)) {
      const reviewer = take(`uid:${viewerUid}`, review.viewer.name, viewerUid);
      if (mine.ownScore !== null) reviewer.scores.set(programme, mine.ownScore);
      if (mine.overallComment.trim()) reviewer.overallComment = mine.overallComment.trim();
    }
  }
  // Somebody who only commented on an answer is lettered too, by name alone.
  for (const review of reviews) {
    for (const comment of review.review.comments) {
      if (![...byKey.values()].some((reviewer) => reviewer.name === comment.authorName)) {
        take(`name:${comment.authorName}`, comment.authorName, null);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.uid ?? "").localeCompare(b.uid ?? ""));
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The message for ONE read of the whole application. `reviews` is the
 * application as an admin's review screen is sent it, once for each programme
 * it can be opened under (the programmes it ranked, and one it joined by an
 * invitation); the first gives the person and their answers, which are the
 * same on every one.
 */
export function assessmentInputFrom(reviews: readonly ReviewPayload[], viewerUid: string): AssessmentInput {
  const review = reviews[0];
  const { applicant } = review;
  const reviewers = reviewersOf(reviews, viewerUid);
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
  const programmes = reviews.map((payload) => ({ id: payload.programme.id, shortName: payload.programme.shortName }));

  lines.push("# The programmes this application is being decided for");
  for (const payload of reviews) {
    // Places, never places LEFT: that moves with every decision, and would mark
    // every read out of date the moment anybody was accepted.
    lines.push(`- ${payload.programme.shortName}${payload.programme.places !== null ? ` (${payload.programme.places} places)` : ""}`);
  }
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

  const committeeStarts = lines.length;
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
  const comments = new Map<string, { key: string; text: string; authorName: string }>();
  for (const payload of reviews) {
    for (const comment of payload.review.comments) comments.set(comment.id, comment);
  }
  for (const reviewer of reviewers) {
    const label = labelOf.get(reviewer.name) ?? "A reviewer";
    lines.push("", `## ${label}`);
    lines.push(
      reviewer.scores.size > 0
        ? `Scores: ${[...reviewer.scores].map(([programme, score]) => `${programme} ${score}`).join(", ")}`
        : "Scores: none given",
    );
    lines.push(`Overall comment: ${reviewer.overallComment || "(none)"}`);
    for (const comment of comments.values()) {
      if (comment.authorName !== reviewer.name) continue;
      lines.push(`On "${questionOf.get(comment.key) ?? "an answer"}": ${comment.text.trim()}`);
    }
  }

  const message = lines.join("\n");
  const application = lines.slice(0, committeeStarts).join("\n");
  const committee = lines.slice(committeeStarts).join("\n").trim();
  return {
    message,
    programmes,
    reviewerUids,
    longAnswers,
    fingerprint: createHash("sha256").update(message).digest("hex").slice(0, 32),
    application,
    committee,
    reviewed: reviewers.length > 0,
  };
}

/** Put first names back where Claude wrote "Reviewer A", for the admin's screen. */
export function withNames(text: string, reviewerNames: Readonly<Record<string, string>>): string {
  return text.replace(/\bReviewer ([A-Z])\b/g, (whole) => own(reviewerNames, whole) ?? whole);
}
