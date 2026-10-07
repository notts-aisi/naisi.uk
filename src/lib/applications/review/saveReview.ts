import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { canReadApplication, canSeeForm, programmeRolesFor, type ProgrammeRole } from "../access";
import { APPLICATION_LIMITS, type ReviewComment } from "../model";
import { isId, isQuestionKey, normaliseReview } from "../normalise";
import { loadForm, loadQuestionSets } from "../repo";
import { cleanScores } from "../scoring";
import { rankedProgrammes } from "../sections";
import { loadApplication, reviewRef } from "../staffRepo";
import { totalOf, writableKeysFor } from "./detail";
import { emptyMap } from "./own";
import { NOT_FOUND, closedToStaffWrites, refuse } from "./refusals";
import type { CommentChange, Refusal, ReviewChange } from "./types";

/**
 * A REVIEWER SAVING THEIR OWN SCORES AND COMMENTS.
 *
 * One row per reviewer per applicant, at an id built from the caller's own
 * session and never from the request, so nobody can write a row in somebody
 * else's name. What this holds a write to:
 *
 *  - A SCORE lands only on an answer of a programme the caller reviews, that
 *    the applicant actually answered, and is a whole number in range. Anything
 *    else is refused with a sentence rather than dropped, so a screen that
 *    asked for the wrong thing finds out.
 *  - A COMMENT is on an answer this applicant sent.
 *  - NOBODY REVIEWS THEIR OWN APPLICATION.
 *  - `total` is the sum of the stored scores, recomputed here on every write.
 *
 * The row keeps the names the rest of the site reads: `scores`, `total`,
 * `comments`, and `notes` for the overall comment.
 */

const MAX_COMMENT_CHANGES = 20;

/**
 * Read a request body as a change to a review. Shape only: which answers the
 * caller may score is decided against the application, after it is read.
 */
export function parseReviewChange(body: unknown): { ok: true; change: ReviewChange } | Refusal {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return refuse(400, "Send the scores or comments to save.");
  }
  const raw = body as Record<string, unknown>;
  const L = APPLICATION_LIMITS;
  const change: ReviewChange = {};

  if (raw.scores !== undefined) {
    if (!raw.scores || typeof raw.scores !== "object" || Array.isArray(raw.scores)) {
      return refuse(400, "Scores have to be given per answer.");
    }
    const scores: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(raw.scores as Record<string, unknown>)) {
      if (!isQuestionKey(key)) return refuse(400, "That is not an answer that can be scored.");
      const inRange =
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= L.minScore &&
        value <= L.maxScore;
      if (value !== null && !inRange) {
        return refuse(400, `A score is a whole number from ${L.minScore} to ${L.maxScore}.`);
      }
      scores[key] = value as number | null;
    }
    if (Object.keys(scores).length > 0) change.scores = scores;
  }

  if (raw.overallComment !== undefined) {
    if (typeof raw.overallComment !== "string") {
      return refuse(400, "The overall comment has to be text.");
    }
    if (raw.overallComment.length > L.overallComment) {
      return refuse(400, `Keep the overall comment to ${L.overallComment} characters.`);
    }
    change.overallComment = raw.overallComment.trim();
  }

  if (raw.comments !== undefined) {
    if (!Array.isArray(raw.comments) || raw.comments.length > MAX_COMMENT_CHANGES) {
      return refuse(400, "Save comments a few at a time.");
    }
    const comments: CommentChange[] = [];
    for (const entry of raw.comments) {
      const item = (entry ?? {}) as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (item.op === "remove") {
        if (!isId(item.id)) return refuse(400, "That is not a comment.");
        comments.push({ op: "remove", id: item.id });
        continue;
      }
      if (item.op !== "add" && item.op !== "edit") return refuse(400, "That is not a comment.");
      if (!text) return refuse(400, "Write the comment before saving it.");
      if (text.length > L.commentText) {
        return refuse(400, `Keep a comment to ${L.commentText} characters.`);
      }
      if (item.op === "add") {
        if (!isQuestionKey(item.key)) return refuse(400, "That is not an answer to comment on.");
        comments.push({ op: "add", key: item.key, text });
      } else {
        if (!isId(item.id)) return refuse(400, "That is not a comment.");
        comments.push({ op: "edit", id: item.id, text });
      }
    }
    if (comments.length > 0) change.comments = comments;
  }

  if (!change.scores && change.overallComment === undefined && !change.comments) {
    return refuse(400, "There is nothing to save.");
  }
  return { ok: true, change };
}

/** A refusal raised inside the transaction, carried out of it as a value. */
class Refused extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.error);
  }
}

export type SaveReviewResult = { ok: true } | Refusal;

export async function saveReview(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  change: ReviewChange,
): Promise<SaveReviewResult> {
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  if (!canSeeForm(user, form)) return NOT_FOUND;
  if (applicantUid === user.uid) return refuse(403, "You can’t review your own application.");
  const closed = closedToStaffWrites(form);
  if (closed) return refuse(409, closed);

  const application = await loadApplication(db, form, applicantUid);
  if (!application?.sent) return NOT_FOUND;
  const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
  if (!canReadApplication(user, form, ranked)) return NOT_FOUND;

  const sets = await loadQuestionSets(db, roundId);
  const roles = emptyMap<ProgrammeRole>();
  for (const { programmeId, role } of programmeRolesFor(user, form)) roles[programmeId] = role;
  const { scoreKeys, commentKeys } = writableKeysFor({
    form,
    sets,
    application,
    ranked,
    viewer: { roles },
  });

  const givenScores = change.scores ?? {};
  for (const key of Object.keys(givenScores)) {
    if (!scoreKeys.includes(key)) {
      return refuse(400, "You can only score the answers of a programme you review.");
    }
  }
  for (const comment of change.comments ?? []) {
    if (comment.op === "add" && !commentKeys.includes(comment.key)) {
      return refuse(400, "That comment is not on one of this person’s answers.");
    }
  }
  // The route has already held each value to the range; this is the same
  // check through the function every reader of a score trusts.
  const toSet = cleanScores(givenScores, scoreKeys, {
    min: APPLICATION_LIMITS.minScore,
    max: APPLICATION_LIMITS.maxScore,
  });
  const toClear = Object.keys(givenScores).filter((key) => givenScores[key] === null);

  const ref = reviewRef(db, roundId, applicantUid, user.uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? normaliseReview(snap.id, snap.data()) : null;

      const scores: Record<string, number> = { ...(existing?.scores ?? {}), ...toSet };
      for (const key of toClear) delete scores[key];

      const now = new Date();
      let comments: ReviewComment[] = [...(existing?.comments ?? [])];
      for (const item of change.comments ?? []) {
        if (item.op === "remove") {
          comments = comments.filter((comment) => comment.id !== item.id);
        } else if (item.op === "edit") {
          const at = comments.findIndex((comment) => comment.id === item.id);
          if (at === -1) throw new Refused(refuse(409, "That comment is no longer there. Reload the page."));
          comments[at] = { ...comments[at], text: item.text, updatedAt: now };
        } else {
          if (comments.length >= APPLICATION_LIMITS.maxCommentsPerReview) {
            throw new Refused(
              refuse(409, `A review holds ${APPLICATION_LIMITS.maxCommentsPerReview} comments at most.`),
            );
          }
          comments.push({
            id: randomUUID(),
            questionKey: item.key,
            text: item.text,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const notes = change.overallComment ?? existing?.overallComment ?? "";
      const stored = comments.map((comment) => ({
        id: comment.id,
        questionKey: comment.questionKey,
        text: comment.text,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      }));
      if (snap.exists) {
        tx.update(ref, {
          scores,
          total: totalOf(scores),
          comments: stored,
          notes,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(ref, {
          roundId,
          applicantUid,
          reviewerUid: user.uid,
          scores,
          total: totalOf(scores),
          comments: stored,
          notes,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof Refused) return err.refusal;
    throw err;
  }
  return { ok: true };
}
