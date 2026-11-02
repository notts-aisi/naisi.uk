import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { feedbackRefusalFor, feedbackStandingIn, feedbackWeekOf } from "@/lib/courses/feedback/access";
import { workRatingGate } from "@/lib/courses/workRatings/access";
import {
  ANSWER_EMPTY,
  NOT_A_RATING_WEEK,
  NOT_READABLE_YET,
  NO_RATING_TO_CLEAR,
  PICK_A_RATING,
  RATING_NOT_CLEARED,
  RATING_NOT_SAVED,
  SAY_WHOSE_ANSWER,
  WRITE_A_COMMENT,
  commentTooLongWords,
} from "@/lib/courses/workRatings/words";
import { countWords } from "@/lib/courses/writtenAnswers/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  COURSE_WORK_RATINGS_COLLECTION,
  WORK_RATING_LIMITS,
  courseWorkRatingId,
  isWorkRating,
} from "@/lib/firestore/courseWorkRatings";
import { programmeLabelOf } from "@/lib/memberNotes/words";

/**
 * RATINGS FOR THE TEAM (privacy v15, "Ratings for the team"):
 * `/api/courses/runs/[runId]/work-ratings`, the caller's own rating of one
 * person's written answer.
 *
 *  - `PUT { uid, weekId, itemId, rating, comment }` saves it: a whole number
 *    from 1 to 10 and a comment for the team, both required. A second save
 *    changes it: one rating per rater per answer.
 *  - `DELETE { uid, weekId }` clears it.
 *
 * Nobody is emailed, and nothing here reaches the person rated.
 *
 * WHO, AND ON WHAT: `src/lib/courses/workRatings/access.ts`. Admins and the
 * lead of the programme that names the run, on an answer the one gate lets
 * them read, never their own; asked before anything of the person's is read.
 * Only the week's written answer, only once its readers may read it, and only
 * with words in it, asked inside the save's transaction with where the week
 * stands. A rating is kept when its week is reopened, as feedback is.
 *
 * View-as is refused first, so a view-as session never rates in the member's
 * name. Every refusal before the gate has passed says nothing about whose
 * work exists. The answer is `{ ok: true }` alone: the page draws the
 * ratings again from the server, never from what a route hands back.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type WorkRatingSaved = { ok: true };
export type WorkRatingCleared = { ok: true };

/** Thrown out of a transaction to refuse with a status. */
class RatingError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function bodyOf(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whose week, and which: the person's uid and a week id with its number, or null. */
function weekOf(body: Record<string, unknown>): { uid: string; weekId: string; weekNumber: number } | null {
  const uid = typeof body.uid === "string" ? body.uid : "";
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (!isAddressableId(uid) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) return null;
  return { uid, weekId, weekNumber };
}

/** The comment: a non-empty string within its caps, or the refusal. */
function commentOf(value: unknown): { ok: true; comment: string } | { ok: false; error: string } {
  const comment = typeof value === "string" ? value.trim() : "";
  if (!comment) return { ok: false, error: WRITE_A_COMMENT };
  if (comment.length > WORK_RATING_LIMITS.chars || countWords(comment) > WORK_RATING_LIMITS.words) {
    return { ok: false, error: commentTooLongWords(WORK_RATING_LIMITS.words) };
  }
  return { ok: true, comment };
}

/** The run's id from the address, or null. */
async function runIdOf(ctx: { params: Promise<{ runId: string }> }): Promise<string | null> {
  const { runId } = await ctx.params;
  return isAddressableId(runId) ? runId : null;
}

// ---------------------------------------------------------------------------
// Save a rating, or change it
// ---------------------------------------------------------------------------

export async function PUT(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  const body = await bodyOf(req);
  const week = body ? weekOf(body) : null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!body || !week || !isAddressableId(itemId)) return NextResponse.json({ error: SAY_WHOSE_ANSWER }, { status: 400 });
  if (!isWorkRating(body.rating)) return NextResponse.json({ error: PICK_A_RATING }, { status: 400 });
  const rating = body.rating;
  const comment = commentOf(body.comment);
  if (!comment.ok) return NextResponse.json({ error: comment.error }, { status: 400 });

  const runId = await runIdOf(ctx);
  if (!runId) return NextResponse.json({ error: NOT_A_RATING_WEEK }, { status: 404 });

  // ---- The gate, before anything of the person's is read ---------------------
  const gate = await workRatingGate(db, actor, runId, week.uid);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // ---- Their week as they read it, and its written answer ---------------------
  const theirs = await feedbackWeekOf(db, gate, week.weekId);
  if (!theirs || !theirs.answerIds.includes(itemId)) return NextResponse.json({ error: NOT_A_RATING_WEEK }, { status: 404 });

  const ref = db.collection(COURSE_WORK_RATINGS_COLLECTION).doc(courseWorkRatingId(runId, week.uid, week.weekId, actor.uid));
  const now = new Date();
  try {
    await db.runTransaction(async (tx) => {
      const [standing, snap] = await Promise.all([
        feedbackStandingIn(tx, db, {
          runId,
          uid: week.uid,
          weekId: week.weekId,
          weekNumber: week.weekNumber,
          answerId: itemId,
          source: theirs.source,
          now,
        }),
        tx.get(ref),
      ]);
      const refusal = feedbackRefusalFor("writtenAnswer", standing.state, standing.answer, { notReadable: NOT_READABLE_YET, answerEmpty: ANSWER_EMPTY });
      if (refusal) throw new RatingError(refusal, 409);
      const said = { itemId, rating, comment: comment.comment, raterRole: gate.raterRole, updatedAt: FieldValue.serverTimestamp() };
      if (snap.exists) {
        tx.update(ref, said);
      } else {
        tx.create(ref, {
          runId,
          uid: week.uid,
          weekId: week.weekId,
          weekNumber: week.weekNumber,
          raterUid: actor.uid,
          // The programme's name as it is now, kept for when the run has gone.
          programmeLabel: programmeLabelOf(gate.run),
          createdAt: FieldValue.serverTimestamp(),
          ...said,
        });
      }
    });
  } catch (err) {
    if (err instanceof RatingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses work ratings] save failed", runId, week.weekId, err);
    return NextResponse.json({ error: RATING_NOT_SAVED }, { status: 500 });
  }
  const answer: WorkRatingSaved = { ok: true };
  return NextResponse.json(answer);
}

// ---------------------------------------------------------------------------
// Clear the caller's own rating
// ---------------------------------------------------------------------------

export async function DELETE(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const body = await bodyOf(req);
  const week = body ? weekOf(body) : null;
  if (!week) return NextResponse.json({ error: SAY_WHOSE_ANSWER }, { status: 400 });

  const runId = await runIdOf(ctx);
  if (!runId) return NextResponse.json({ error: NOT_A_RATING_WEEK }, { status: 404 });

  const gate = await workRatingGate(db, actor, runId, week.uid);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // The caller's own rating, by the id that names them: nobody clears another's.
  const ref = db.collection(COURSE_WORK_RATINGS_COLLECTION).doc(courseWorkRatingId(runId, week.uid, week.weekId, actor.uid));
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new RatingError(NO_RATING_TO_CLEAR, 404);
      tx.delete(ref);
    });
  } catch (err) {
    if (err instanceof RatingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses work ratings] clear failed", runId, week.weekId, err);
    return NextResponse.json({ error: RATING_NOT_CLEARED }, { status: 500 });
  }
  const answer: WorkRatingCleared = { ok: true };
  return NextResponse.json(answer);
}
