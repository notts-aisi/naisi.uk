import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { weekWorkWire, type WeekWorkWire } from "@/lib/courses/weekWork/model";
import { WorkClosedError, assertWeekTakesWork, logWork, ownSeatOn, weekStateIn } from "@/lib/courses/weekWork/own";
import { lastSentAt } from "@/lib/courses/weekWork/versions";
import { NOTHING_TO_SEND, SEND_FAILED, closedWords, notDoneWords } from "@/lib/courses/weekWork/words";
import { answerPiece, isWordCountedAnswer, readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import { writtenAnswerWire, type WrittenAnswerWire } from "@/lib/courses/writtenAnswers/wire";
import { ANSWER_NOT_HERE } from "@/lib/courses/writtenAnswerWords";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * SENDING ONE'S OWN WRITTEN ANSWER ("Send my answer", and again after
 * "Change my answer"): `POST /api/courses/runs/[runId]/written-answers/[answerId]/send`
 * with `{ weekId }`.
 *
 * WHO: the writer, for their OWN answer only (the row's id is built from the
 * caller's own uid): an active learner seat told its group, or a facilitator
 * of a live group as themselves, as the answer's own save route admits them
 * (`ownSeatOn`, without week 1's door: nobody writes an answer through it).
 * Nobody sends for anybody else.
 *
 * WHAT (the week stays open, privacy v17's "Changing your work"): the
 * answer's words as they stand, with words in it and within its word limit.
 * Sending stamps `firstSentAt` the first time, with `submittedAt` (as every
 * reader of answers sent reads), and `sentAt` every time. It closes nothing:
 * the writer may change it and send it again until the programme closes.
 * Before the session the writer is due at, the people who read their work
 * read the answer as last sent; once it has started, they read the latest
 * words, sent or not (`readableAnswer`). Sending words already sent, with no
 * change since, writes nothing.
 *
 * Inside one transaction it reads where the week stands (a closed programme
 * refuses, with when it closed) and the answer's row, stamps the send and
 * logs it (`send`, or `send-again`). Every refusal comes before anything is
 * written: view-as first, the session, the address, the body, who is asking,
 * the week, then what is stored, read inside the transaction.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type SendAnswerAnswer = {
  ok: true;
  /** The answer as its writer reads it now. */
  written: WrittenAnswerWire;
  /** Where the week stands. */
  work: WeekWorkWire;
};

/** Thrown out of the transaction to refuse with a status. */
class SendRefusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string; answerId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, answerId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(answerId)) {
    return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Say which week the answer is on, like "w03".' }, { status: 400 });
  }
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the answer is on, like "w03".' }, { status: 400 });
  }

  // ---- Who: the writer, for their own answer ---------------------------------
  const seat = await ownSeatOn(db, actor, runId, weekNumber);
  if (!seat || seat.beforeGroups) {
    return NextResponse.json({ error: "Only somebody taking part in this programme can send its written answers." }, { status: 403 });
  }

  // ---- Which answer: a written answer of the week as they read it ------------
  const { week } = await resolveWeekDoc(db, runId, seat.ownGroup?.id ?? null, weekId);
  const answer = week && isBlockWeek(week) ? (weekWrittenAnswers(week).find((candidate) => candidate.id === answerId) ?? null) : null;
  if (!answer) return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  const ref = db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, actor.uid, weekId, answerId));
  const now = new Date();
  const logged = { runId, uid: actor.uid, weekId, weekNumber, itemKind: "writtenAnswer" as const, itemId: answerId };

  let sent: SendAnswerAnswer;
  try {
    sent = await db.runTransaction(async (tx) => {
      const [standing, snap] = await Promise.all([
        weekStateIn(tx, db, { runId, uid: actor.uid, weekId, weekNumber, source: seat.source, closesAt: seat.closesAt, now }),
        tx.get(ref),
      ]);
      // Only a closed programme refuses.
      assertWeekTakesWork(standing.state);
      const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      if (!data || isReflectionResponse(data) || !isWordCountedAnswer(data) || data.uid !== actor.uid) {
        throw new SendRefusal(NOTHING_TO_SEND, 409);
      }
      const record = readWrittenAnswer(data);
      if (record.words === 0) throw new SendRefusal(NOTHING_TO_SEND, 409);
      // An answer over its word limit cannot be sent.
      if (answer.words && record.words > answer.words.max) {
        throw new SendRefusal(notDoneWords({ kind: "overLimit", words: record.words, limit: answer.words.max }), 409);
      }
      const work = weekWorkWire(standing.state, now);
      const last = lastSentAt(answerPiece(record));
      // Sent already, with no change since: nothing to write.
      if (last && record.savedAt && record.savedAt.getTime() <= last.getTime()) {
        return { ok: true as const, written: writtenAnswerWire(record, new Map()), work };
      }
      const first = record.firstSentAt === null;
      const at = FieldValue.serverTimestamp();
      // `firstSentAt` is stored once and never moved; `sentAt` moves with every send.
      tx.update(ref, first ? { firstSentAt: at, submittedAt: at, sentAt: at } : { sentAt: at });
      logWork(tx, db, { ...logged, kind: first ? "send" : "send-again" });
      const after = { ...record, sentAt: now, ...(first ? { firstSentAt: now } : {}) };
      return { ok: true as const, written: writtenAnswerWire(after, new Map()), work };
    });
  } catch (err) {
    if (err instanceof SendRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof WorkClosedError) return NextResponse.json({ error: closedWords(err.at) }, { status: 409 });
    console.error("[courses send answer] write failed", runId, weekId, answerId, err);
    return NextResponse.json({ error: SEND_FAILED }, { status: 500 });
  }
  return NextResponse.json(sent);
}
