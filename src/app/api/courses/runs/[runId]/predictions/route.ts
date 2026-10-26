import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  answeredCount,
  isQuestionId,
  questionsOf,
  readAnswer,
  storedQuestions,
  type PredictionAnswer,
} from "@/lib/courses/predictions/model";
import { courseCardOf, ownRecordOf, viewFor } from "@/lib/courses/predictions/own";
import { predictionsTakerOf, weekOpenTo } from "@/lib/courses/predictions/taker";
import {
  REFUSE_ALREADY_OPENED,
  REFUSE_ALREADY_SEALED,
  REFUSE_NOT_TAKING_PART,
  REFUSE_NO_CARD,
  REFUSE_NO_QUESTION,
  REFUSE_OPENED,
  REFUSE_OPEN_NEEDS_ONE,
  REFUSE_SEALED,
  REFUSE_SEAL_NEEDS_ONE,
  nothingToOpenWords,
  sealWindowShutWords,
  weekNotOpenWords,
} from "@/lib/courses/predictions/words";
import {
  COURSE_PREDICTIONS_COLLECTION,
  normalizeCoursePredictions,
  predictionsRecordId,
} from "@/lib/firestore/coursePredictions";
import type { PredictionsView } from "@/lib/courses/predictions/wire";

/**
 * A PERSON'S OWN SEALED PREDICTIONS (Zach's extra (d); the course's card is
 * `CourseDoc.predictionCard`, the record `coursePredictions`). Always their
 * OWN card: its id is built from the caller's own uid, and nothing here can
 * address anybody else's.
 *
 *  - `PUT` with `{ stage, questionId, value }` saves one answer as they type:
 *    `stage` "start" for the first card, in the week it is sealed in, until it
 *    is sealed; "now" for the second, in the week it opens in, until the
 *    sealed card is opened. A value of null, or "", takes the answer away.
 *  - `POST` with `{ action: "seal" }` seals the first card: from then nothing
 *    changes it and nothing hands its answers back to anybody but an admin,
 *    its owner included, until the week it opens in has opened to their group
 *    and they open it. `{ action: "open" }` opens it there, once they have
 *    answered the same questions again: the sealed answers are handed back
 *    beside the new ones, and from then neither card changes.
 *
 * WHO: somebody taking part (a live, told place on the run, on an account that
 * stands) or a facilitator of a live group of the run, as themselves
 * (`predictionsTakerOf`). Nobody writes on anybody else's behalf: not a
 * facilitator, not the lead, not an admin. View-as is refused first, and
 * every write refuses a run that is being destroyed, so nothing recreates a
 * card behind the destroy.
 *
 * WHEN: the week a stage belongs to has to have opened to them
 * (`weekOpenTo`), and the first card shuts for good once the week it opens in
 * has opened, sealed or not. Every refusal is a sentence the page shows.
 *
 * WHAT IS STORED: the answer alone, kept to one decimal place or as typed
 * (`readAnswer`), under the question it answers on the person's own copy of
 * the questions, which their first answer takes from the course's card.
 */

/** Thrown out of a transaction to refuse with a status. */
class PredictionsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "That isn’t on this programme." }, { status: 404 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { stage?: unknown; questionId?: unknown; value?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send which card, which question and your answer." }, { status: 400 });
  }
  const stage = body.stage === "start" || body.stage === "now" ? body.stage : null;
  if (!stage) return NextResponse.json({ error: 'Say which card: "start" or "now".' }, { status: 400 });
  if (!isQuestionId(body.questionId)) return NextResponse.json({ error: "Say which question, like “q1”." }, { status: 400 });
  const questionId = body.questionId;
  const value = body.value;
  if (value !== null && typeof value !== "number" && typeof value !== "string") {
    return NextResponse.json({ error: "Send your answer as a number or as words, or null to take it away." }, { status: 400 });
  }

  // ---- Who: somebody with a card on this run, for their own card -------------
  const answer = await predictionsTakerOf(db, actor, runId);
  if (!answer.ok) {
    return NextResponse.json(
      { error: answer.reason === "no-run" ? "That isn’t on this programme." : REFUSE_NOT_TAKING_PART },
      { status: answer.status },
    );
  }
  const { taker } = answer;
  const card = await courseCardOf(db, taker.run);
  if (!card) return NextResponse.json({ error: REFUSE_NO_CARD }, { status: 404 });

  const ref = db.collection(COURSE_PREDICTIONS_COLLECTION).doc(predictionsRecordId(runId, actor.uid));
  const before = await ownRecordOf(db, runId, actor.uid);
  const questions = before?.card ?? questionsOf(card);
  const question = questions.questions.find((candidate) => candidate.id === questionId);
  if (!question) return NextResponse.json({ error: REFUSE_NO_QUESTION }, { status: 404 });
  const read = readAnswer(question, value);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });

  // ---- When: the stage's week has opened to them, and the first card is open -----
  const now = new Date();
  const openWeek = before?.start.sealedAt ? (before.start.opensInWeek ?? card.openWeek) : card.openWeek;
  const opening = await weekOpenTo(db, taker, openWeek, now);
  if (stage === "start") {
    // A sealed card says so first, whatever week it is.
    if (before?.start.sealedAt) return NextResponse.json({ error: REFUSE_SEALED }, { status: 409 });
    const sealOpening = await weekOpenTo(db, taker, card.sealWeek, now);
    if (!sealOpening.open) return NextResponse.json({ error: weekNotOpenWords(card.sealWeek) }, { status: 409 });
    if (opening.open) return NextResponse.json({ error: sealWindowShutWords(openWeek) }, { status: 409 });
  } else if (!opening.open) {
    return NextResponse.json({ error: weekNotOpenWords(openWeek) }, { status: 409 });
  }

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? normalizeCoursePredictions(snap.id, snap.data() ?? {}) : null;
      if (stage === "start" && stored?.start.sealedAt) throw new PredictionsError(REFUSE_SEALED, 409);
      if (stage === "now" && stored?.now.openedAt) throw new PredictionsError(REFUSE_OPENED, 409);
      // The questions the person answers are fixed at their first answer.
      const asked = stored?.card ?? questions;
      const same = asked.questions.find((candidate) => candidate.id === questionId);
      if (!same || same.kind !== question.kind || same.max !== question.max) throw new PredictionsError(REFUSE_NO_QUESTION, 409);
      const stamp = FieldValue.serverTimestamp();
      if (!stored) {
        if (read.value === null) return;
        const answers: Record<string, PredictionAnswer> = { [questionId]: read.value };
        tx.set(ref, {
          runId,
          uid: actor.uid,
          courseId: taker.run.courseId,
          card: storedQuestions(asked),
          start: { answers: stage === "start" ? answers : {}, sealedAt: null, opensInWeek: null, updatedAt: stamp },
          now: { answers: stage === "now" ? answers : {}, openedAt: null, updatedAt: stamp },
          createdAt: stamp,
          updatedAt: stamp,
        });
        return;
      }
      tx.update(ref, {
        [`${stage}.answers.${questionId}`]: read.value === null ? FieldValue.delete() : read.value,
        [`${stage}.updatedAt`]: stamp,
        updatedAt: stamp,
      });
    });
  } catch (err) {
    if (err instanceof PredictionsError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses predictions] answer failed", runId, stage, questionId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. It tries again as you type." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, questionId, value: read.value });
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "That isn’t on this programme." }, { status: 404 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Say what to do: "seal" or "open".' }, { status: 400 });
  }
  const action = body.action === "seal" || body.action === "open" ? body.action : null;
  if (!action) return NextResponse.json({ error: 'Say what to do: "seal" or "open".' }, { status: 400 });

  // ---- Who: somebody with a card on this run, for their own card -------------
  const answer = await predictionsTakerOf(db, actor, runId);
  if (!answer.ok) {
    return NextResponse.json(
      { error: answer.reason === "no-run" ? "That isn’t on this programme." : REFUSE_NOT_TAKING_PART },
      { status: answer.status },
    );
  }
  const { taker } = answer;
  const card = await courseCardOf(db, taker.run);
  if (!card) return NextResponse.json({ error: REFUSE_NO_CARD }, { status: 404 });

  const ref = db.collection(COURSE_PREDICTIONS_COLLECTION).doc(predictionsRecordId(runId, actor.uid));
  const before = await ownRecordOf(db, runId, actor.uid);
  const now = new Date();

  if (action === "seal") {
    if (before?.start.sealedAt) return NextResponse.json({ error: REFUSE_ALREADY_SEALED }, { status: 409 });
    const [sealOpening, opening] = await Promise.all([
      weekOpenTo(db, taker, card.sealWeek, now),
      weekOpenTo(db, taker, card.openWeek, now),
    ]);
    if (!sealOpening.open) return NextResponse.json({ error: weekNotOpenWords(card.sealWeek) }, { status: 409 });
    if (opening.open) return NextResponse.json({ error: sealWindowShutWords(card.openWeek) }, { status: 409 });
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const stored = snap.exists ? normalizeCoursePredictions(snap.id, snap.data() ?? {}) : null;
        if (stored?.start.sealedAt) throw new PredictionsError(REFUSE_ALREADY_SEALED, 409);
        if (!stored?.card || answeredCount(stored.card.questions, stored.start.answers) === 0) {
          throw new PredictionsError(REFUSE_SEAL_NEEDS_ONE, 409);
        }
        const stamp = FieldValue.serverTimestamp();
        tx.update(ref, {
          "start.sealedAt": stamp,
          // The week it opens in is the one it was sealed to open in.
          "start.opensInWeek": card.openWeek,
          "start.updatedAt": stamp,
          updatedAt: stamp,
        });
      });
    } catch (err) {
      if (err instanceof PredictionsError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error("[courses predictions] seal failed", runId, err);
      return NextResponse.json({ error: "Couldn’t seal it just now. Try again." }, { status: 500 });
    }
    const view: PredictionsView = await viewFor(db, taker, card, await ownRecordOf(db, runId, actor.uid), "seal", now);
    return NextResponse.json({ ok: true, view });
  }

  // Open: the sealed card, in the week it opens in, after today's answers.
  if (!before?.start.sealedAt) return NextResponse.json({ error: nothingToOpenWords(card.sealWeek) }, { status: 409 });
  const openWeek = before.start.opensInWeek ?? card.openWeek;
  const opening = await weekOpenTo(db, taker, openWeek, now);
  if (!opening.open) return NextResponse.json({ error: weekNotOpenWords(openWeek) }, { status: 409 });
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? normalizeCoursePredictions(snap.id, snap.data() ?? {}) : null;
      if (!stored?.start.sealedAt || !stored.card) throw new PredictionsError(nothingToOpenWords(card.sealWeek), 409);
      if (stored.now.openedAt) throw new PredictionsError(REFUSE_ALREADY_OPENED, 409);
      if (answeredCount(stored.card.questions, stored.now.answers) === 0) throw new PredictionsError(REFUSE_OPEN_NEEDS_ONE, 409);
      const stamp = FieldValue.serverTimestamp();
      tx.update(ref, { "now.openedAt": stamp, "now.updatedAt": stamp, updatedAt: stamp });
    });
  } catch (err) {
    if (err instanceof PredictionsError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses predictions] open failed", runId, err);
    return NextResponse.json({ error: "Couldn’t open it just now. Try again." }, { status: 500 });
  }
  const view: PredictionsView = await viewFor(db, taker, card, await ownRecordOf(db, runId, actor.uid), "open", now);
  return NextResponse.json({ ok: true, view });
}
