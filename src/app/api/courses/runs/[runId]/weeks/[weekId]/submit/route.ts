import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { weekAsksForWriting, weekTakesWork, weekWorkWire, type WeekWorkWire } from "@/lib/courses/weekWork/model";
import { logWork, ownSeatOn, weekStateIn, weekWorkRef } from "@/lib/courses/weekWork/own";
import {
  ALREADY_SUBMITTED,
  NOTHING_TO_SUBMIT,
  NOT_A_SUBMIT_WEEK,
  WEEK_SHUT,
  notDoneWords,
} from "@/lib/courses/weekWork/words";
import { isReflectionResponse, exerciseResponseId } from "@/lib/firestore/courseExercises";
import { isWordCountedAnswer, readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * SUBMITTING ONE'S OWN WEEK (the week you submit): `POST
 * /api/courses/runs/[runId]/weeks/[weekId]/submit` with `{ submit: true }`.
 *
 * WHO: somebody taking part, for their OWN week only, as every route that
 * writes a week admits them (`ownSeatOn`): an active learner seat told its
 * group, a facilitator of a live group as themselves, or, in week 1, somebody
 * holding a place before groups go out. Nobody submits for anybody else.
 *
 * WHAT. A week written as blocks that asks for something written (a
 * reflection, fill-in boxes or a written answer): a week with only things to
 * tick has no Submit, and is done once they are ticked. A week written before
 * blocks keeps its own pages.
 *
 * Submitting sends what the week holds as it stands ("Submit anyway"): the
 * check on the page names what is not done, and only a written answer over
 * the top of its word range stops it, here as there. It locks the whole week
 * (`src/lib/courses/weekWork/`), until somebody running the group reopens it.
 * Inside one transaction it stamps the week (`courseWeekWork`: when, the
 * first time once, how many times), stamps each written answer of the week
 * that has words and was never sent with when it was first sent
 * (`firstSentAt`, and `submittedAt` with it, as every reader of answers sent
 * reads), and logs the submit.
 *
 * Every refusal comes before anything is written: view-as first, the
 * session, the body, the address, who is asking, the week, then where it
 * stands, read inside the transaction.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type SubmitWeekAnswer = {
  ok: true;
  work: WeekWorkWire;
  /** The written answers this submit sent, each with when (ISO 8601). */
  sent: Array<{ id: string; at: string }>;
};

/** Thrown out of the transaction to refuse with a status. */
class SubmitRefusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string; weekId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { submit?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say to submit the week: { \"submit\": true }." }, { status: 400 });
  }
  if (body?.submit !== true) {
    return NextResponse.json({ error: "Say to submit the week: { \"submit\": true }." }, { status: 400 });
  }

  const { runId, weekId } = await ctx.params;
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (!isAddressableId(runId) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: NOT_A_SUBMIT_WEEK }, { status: 404 });
  }

  // ---- Who: somebody taking part, for their own week ------------------------
  const seat = await ownSeatOn(db, actor, runId, weekNumber);
  if (!seat) {
    return NextResponse.json({ error: "Only somebody taking part in this programme can submit its weeks." }, { status: 403 });
  }

  // ---- Which week: a week written as blocks, as they read it -----------------
  const { week } = await resolveWeekDoc(db, runId, seat.ownGroup?.id ?? null, weekId);
  if (!week || !isBlockWeek(week)) return NextResponse.json({ error: NOT_A_SUBMIT_WEEK }, { status: 404 });
  if (!weekAsksForWriting(week.blocks)) return NextResponse.json({ error: NOTHING_TO_SUBMIT }, { status: 409 });
  const answers = weekWrittenAnswers(week);
  const answerIds = answers.map((answer) => answer.id);
  const answerRefs = answers.map((answer) =>
    db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, actor.uid, weekId, answer.id)),
  );
  const now = new Date();

  let sent: Array<{ id: string; at: string }>;
  let work: WeekWorkWire;
  try {
    ({ sent, work } = await db.runTransaction(async (tx) => {
      const [{ state, record }, ...rows] = await Promise.all([
        weekStateIn(tx, db, { runId, uid: actor.uid, weekId, weekNumber, source: seat.source, now }),
        ...answerRefs.map((ref) => tx.get(ref)),
      ]);
      if (!weekTakesWork(state)) {
        throw new SubmitRefusal(state.kind === "submitted" ? ALREADY_SUBMITTED : WEEK_SHUT, 409);
      }
      // The written answers as they stand: an answer over its word limit stops Submit.
      const toSend: number[] = [];
      answers.forEach((answer, index) => {
        const snap = rows[index];
        const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
        if (!data || isReflectionResponse(data) || !isWordCountedAnswer(data) || data.uid !== actor.uid) return;
        const written = readWrittenAnswer(data);
        if (answer.words && written.words > answer.words.max) {
          throw new SubmitRefusal(notDoneWords({ kind: "overLimit", words: written.words, limit: answer.words.max }), 409);
        }
        if (written.words > 0 && !written.firstSentAt) toSend.push(index);
      });

      const at = FieldValue.serverTimestamp();
      tx.set(
        weekWorkRef(db, runId, actor.uid, weekId),
        {
          runId,
          uid: actor.uid,
          weekId,
          weekNumber,
          submittedAt: at,
          // Stored once and never moved: the first time it was submitted.
          ...(record?.firstSubmittedAt ? {} : { firstSubmittedAt: at }),
          submitCount: FieldValue.increment(1),
          updatedAt: at,
        },
        { merge: true },
      );
      for (const index of toSend) {
        // Stored once and never moved: when the answer was first sent.
        tx.update(answerRefs[index], { firstSentAt: at, submittedAt: at });
      }
      logWork(tx, db, { runId, uid: actor.uid, weekId, weekNumber, kind: "submit", itemKind: "week", itemId: "" });
      return {
        sent: toSend.map((index) => ({ id: answerIds[index], at: now.toISOString() })),
        work: weekWorkWire({ kind: "submitted", at: now }, () => ""),
      };
    }));
  } catch (err) {
    if (err instanceof SubmitRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses submit week] write failed", runId, weekId, err);
    return NextResponse.json({ error: "That didn’t submit. Check your connection and try again." }, { status: 500 });
  }

  const answer: SubmitWeekAnswer = { ok: true, work, sent };
  return NextResponse.json(answer);
}
