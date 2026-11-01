import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import {
  feedbackGate,
  feedbackRefusalFor,
  feedbackStandingIn,
  feedbackWeekOf,
  type FeedbackGate,
} from "@/lib/courses/feedback/access";
import { staffCardOf, type StaffFeedbackCard } from "@/lib/courses/feedback/model";
import {
  ALREADY_EMAILED,
  ALREADY_EMAILED_DELETE,
  ANSWER_EMPTY,
  BEING_EMAILED_REFUSAL,
  FEEDBACK_NOT_HERE,
  FEEDBACK_NOT_SAVED,
  NOT_A_FEEDBACK_WEEK,
  FEEDBACK_NOT_DELETED,
  NOT_READABLE_YET,
  ONLY_ITS_WRITER,
  ONLY_ITS_WRITER_OR_AN_ADMIN,
  SAY_WHICH_FEEDBACK,
  SAY_WHOSE_WEEK,
  WRITE_IT_FIRST,
  feedbackTooLongWords,
} from "@/lib/courses/feedback/words";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { countWords } from "@/lib/courses/writtenAnswers/model";
import { ANSWER_NOT_HERE } from "@/lib/courses/writtenAnswerWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import {
  COURSE_FEEDBACK_COLLECTION,
  FEEDBACK_LIMITS,
  feedbackIsClaimed,
  normalizeCourseFeedback,
  type CourseFeedbackDoc,
} from "@/lib/firestore/courseFeedback";

/**
 * FEEDBACK ON ONE PERSON'S WEEK, AS A SIGNED COMMENT (privacy v15,
 * "Feedback"): `/api/courses/runs/[runId]/feedback`.
 *
 *  - `POST { uid, weekId, on, itemId?, text }` saves a piece on `uid`'s week
 *    `weekId`, on its written answer (`on: "writtenAnswer"`, `itemId` the
 *    answer's block) or on the week as a whole (`on: "week"`).
 *  - `PATCH { id, text }` changes the words of a piece its caller wrote,
 *    until its email has gone.
 *  - `DELETE { id }` deletes a piece: its writer's, until its email has
 *    gone; an admin's, whenever.
 *
 * SAVING EMAILS NOBODY. A piece shows on the person's week page as soon as
 * it is saved; the email that says it is there goes in a batch an admin
 * sends from the programme's Overview (`./send`). Nothing here sends.
 *
 * WHO, AND ON WHAT: `src/lib/courses/feedback/access.ts`. The one gate on
 * whose work a reader may act on, asked before anything of the person's is
 * read and again for every change and deletion; only a week written as
 * blocks, and only once its readers may read it (submitted, or locked at the
 * session first), asked inside the write's transaction with where the week
 * stands. A piece another press is emailing, or one already emailed, is
 * never changed by its writer.
 *
 * A piece is found by its id for a change or a deletion, and every refusal
 * before the gate has passed is the same 404, so the answer never says
 * whose feedback exists. View-as is refused first, so a view-as session
 * never writes feedback in the member's name.
 *
 * What travels back is built field by field (`staffCardOf`): the piece as
 * the review page draws it, never the stored document.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type FeedbackSaved = { ok: true; piece: StaffFeedbackCard };
export type FeedbackDeleted = { ok: true };

/** Thrown out of a transaction to refuse with a status. */
class FeedbackError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** The words of a piece: a non-empty string within its caps, or the refusal. */
function textOf(value: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: WRITE_IT_FIRST };
  const text = value.trim();
  if (!text) return { ok: false, error: WRITE_IT_FIRST };
  if (text.length > FEEDBACK_LIMITS.chars || countWords(text) > FEEDBACK_LIMITS.words) {
    return { ok: false, error: feedbackTooLongWords(FEEDBACK_LIMITS.words) };
  }
  return { ok: true, text };
}

async function bodyOf(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The piece as the review page draws it for its writer, with the names it shows. */
async function cardFor(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  actor: SessionUser,
  piece: CourseFeedbackDoc,
  isAdmin: boolean,
): Promise<StaffFeedbackCard> {
  const snap = await db.collection("users").doc(piece.byUid).get();
  const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : {};
  const first = firstNameOfUser(data);
  const full = fullNameOfUser(data);
  return staffCardOf(
    piece,
    { firstName: () => first || full, fullName: () => full },
    { uid: actor.uid, isAdmin, now: new Date() },
  );
}

/** The run's id from the address, or null. */
async function runIdOf(ctx: { params: Promise<{ runId: string }> }): Promise<string | null> {
  const { runId } = await ctx.params;
  return isAddressableId(runId) ? runId : null;
}

/**
 * A stored piece and the gate on whose work it is about, for a change or a
 * deletion: null for one that is not there, not on this run, or about work
 * the caller may not act on, all one answer.
 */
async function pieceAndGate(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  actor: SessionUser,
  runId: string,
  id: string,
): Promise<{ piece: CourseFeedbackDoc; gate: FeedbackGate } | null> {
  const snap = await db.collection(COURSE_FEEDBACK_COLLECTION).doc(id).get();
  const piece = snap.exists ? normalizeCourseFeedback(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
  if (!piece || piece.runId !== runId || !isAddressableId(piece.uid)) return null;
  const gate = await feedbackGate(db, actor, runId, piece.uid);
  return gate.ok ? { piece, gate } : null;
}

// ---------------------------------------------------------------------------
// Save a piece
// ---------------------------------------------------------------------------

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  const body = await bodyOf(req);
  if (!body) return NextResponse.json({ error: SAY_WHOSE_WEEK }, { status: 400 });
  const uid = typeof body.uid === "string" ? body.uid : "";
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  const on = body.on === "writtenAnswer" || body.on === "week" ? body.on : null;
  const itemId = on === "writtenAnswer" && typeof body.itemId === "string" ? body.itemId : "";
  if (!isAddressableId(uid) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER || !on || (on === "writtenAnswer" && !isAddressableId(itemId))) {
    return NextResponse.json({ error: SAY_WHOSE_WEEK }, { status: 400 });
  }
  const text = textOf(body.text);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });

  const runId = await runIdOf(ctx);
  if (!runId) return NextResponse.json({ error: NOT_A_FEEDBACK_WEEK }, { status: 404 });

  // ---- The gate, before anything of the person's is read ---------------------
  const gate = await feedbackGate(db, actor, runId, uid);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // ---- Which week, and what on it: theirs, as they read it ---------------------
  const week = await feedbackWeekOf(db, gate, weekId);
  if (!week) return NextResponse.json({ error: NOT_A_FEEDBACK_WEEK }, { status: 404 });
  if (on === "writtenAnswer" && !week.answerIds.includes(itemId)) {
    return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  }

  const ref = db.collection(COURSE_FEEDBACK_COLLECTION).doc();
  const now = new Date();
  let stored: Record<string, unknown>;
  try {
    stored = await db.runTransaction(async (tx) => {
      const standing = await feedbackStandingIn(tx, db, {
        runId,
        uid,
        weekId,
        weekNumber,
        answerId: on === "writtenAnswer" ? itemId : (week.answerIds[0] ?? null),
        source: week.source,
        now,
      });
      const refusal = feedbackRefusalFor(on, standing.state, standing.answer, { notReadable: NOT_READABLE_YET, answerEmpty: ANSWER_EMPTY });
      if (refusal) throw new FeedbackError(refusal, 409);
      const piece = {
        runId,
        uid,
        weekId,
        weekNumber,
        on: on === "writtenAnswer" ? { kind: "writtenAnswer", itemId } : { kind: "week" },
        text: text.text,
        byUid: actor.uid,
        byRole: gate.byRole,
        createdAt: FieldValue.serverTimestamp(),
        editedAt: null,
        emailedAt: null,
        emailedByUid: "",
        emailDelivery: null,
        emailClaimedAt: null,
        sendId: "",
      };
      tx.create(ref, piece);
      return { ...piece, createdAt: now };
    });
  } catch (err) {
    if (err instanceof FeedbackError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses feedback] save failed", runId, weekId, err);
    return NextResponse.json({ error: FEEDBACK_NOT_SAVED }, { status: 500 });
  }

  const answer: FeedbackSaved = {
    ok: true,
    piece: await cardFor(db, actor, normalizeCourseFeedback(ref.id, stored), gate.facts.isAdmin),
  };
  return NextResponse.json(answer);
}

// ---------------------------------------------------------------------------
// Change a piece's words
// ---------------------------------------------------------------------------

export async function PATCH(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const body = await bodyOf(req);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!body || !isAddressableId(id)) return NextResponse.json({ error: SAY_WHICH_FEEDBACK }, { status: 400 });
  const text = textOf(body.text);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });

  const runId = await runIdOf(ctx);
  if (!runId) return NextResponse.json({ error: FEEDBACK_NOT_HERE }, { status: 404 });

  // ---- The piece, and the gate on whose work it is about ---------------------
  const found = await pieceAndGate(db, actor, runId, id);
  if (!found) return NextResponse.json({ error: FEEDBACK_NOT_HERE }, { status: 404 });
  if (found.piece.byUid !== actor.uid) {
    return NextResponse.json({ error: ONLY_ITS_WRITER }, { status: 403 });
  }

  const ref = db.collection(COURSE_FEEDBACK_COLLECTION).doc(id);
  const now = new Date();
  let stored: Record<string, unknown>;
  try {
    stored = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new FeedbackError(FEEDBACK_NOT_HERE, 404);
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const piece = normalizeCourseFeedback(snap.id, data);
      if (piece.emailedAt) throw new FeedbackError(ALREADY_EMAILED, 409);
      if (feedbackIsClaimed(piece, now)) throw new FeedbackError(BEING_EMAILED_REFUSAL, 409);
      tx.update(ref, { text: text.text, editedAt: FieldValue.serverTimestamp() });
      return { ...data, text: text.text, editedAt: now };
    });
  } catch (err) {
    if (err instanceof FeedbackError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses feedback] change failed", runId, id, err);
    return NextResponse.json({ error: FEEDBACK_NOT_SAVED }, { status: 500 });
  }

  const answer: FeedbackSaved = {
    ok: true,
    piece: await cardFor(db, actor, normalizeCourseFeedback(id, stored), found.gate.facts.isAdmin),
  };
  return NextResponse.json(answer);
}

// ---------------------------------------------------------------------------
// Delete a piece
// ---------------------------------------------------------------------------

export async function DELETE(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const body = await bodyOf(req);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!isAddressableId(id)) return NextResponse.json({ error: SAY_WHICH_FEEDBACK }, { status: 400 });

  const runId = await runIdOf(ctx);
  if (!runId) return NextResponse.json({ error: FEEDBACK_NOT_HERE }, { status: 404 });

  const found = await pieceAndGate(db, actor, runId, id);
  if (!found) return NextResponse.json({ error: FEEDBACK_NOT_HERE }, { status: 404 });
  const isAdmin = found.gate.facts.isAdmin;
  if (found.piece.byUid !== actor.uid && !isAdmin) {
    return NextResponse.json({ error: ONLY_ITS_WRITER_OR_AN_ADMIN }, { status: 403 });
  }

  const ref = db.collection(COURSE_FEEDBACK_COLLECTION).doc(id);
  const now = new Date();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new FeedbackError(FEEDBACK_NOT_HERE, 404);
      const piece = normalizeCourseFeedback(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
      // Its writer deletes it until its email has gone; an admin, whenever. Never while a press is sending it.
      if (feedbackIsClaimed(piece, now)) throw new FeedbackError(BEING_EMAILED_REFUSAL, 409);
      if (piece.emailedAt && !isAdmin) throw new FeedbackError(ALREADY_EMAILED_DELETE, 409);
      tx.delete(ref);
    });
  } catch (err) {
    if (err instanceof FeedbackError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses feedback] delete failed", runId, id, err);
    return NextResponse.json({ error: FEEDBACK_NOT_DELETED }, { status: 500 });
  }
  const answer: FeedbackDeleted = { ok: true };
  return NextResponse.json(answer);
}
