import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { ANONYMOUS_ANSWERS_COLLECTION, ANONYMOUS_WAITING_COLLECTION, dueToMove, normaliseAnswer } from "./model";

/**
 * THE NIGHT'S MOVE: every answer that came in on a day now over moves from
 * `anonymousFeedbackWaiting` into `anonymousFeedback`, and its waiting record
 * is deleted.
 *
 * WHY. The database stamps every record with the time it was written. An
 * answer written as it arrives carries the minute it was sent, which could be
 * set beside the time somebody sent the survey at the end, a named record.
 * The move writes a whole day's answers in one transaction, so the database's
 * own time on each kept answer is the move's, the same for all of them, and
 * the answer itself holds only the day. From the move on, nothing kept says
 * more than the day. (The database's recovery copies hold a deleted waiting
 * record for as long as they are kept; the privacy policy says so.)
 *
 * ONLY A DAY THAT IS OVER MOVES (`dueToMove`): an answer sent at 00:20 waits
 * for the next night with the rest of its day, so the move's time never says
 * more than the day does.
 *
 * NO ORDER. The day's answers are taken in a random order and moved in
 * transactions of up to `MOVE_CHUNK`, each kept answer under a new id, so
 * neither the ids nor which answers share a transaction follow the order they
 * came in. Each record is read again inside its transaction, so an answer
 * deleted meanwhile (a run's destroy) is never written back.
 *
 * Only `ANSWER_FIELDS` are copied, by name. Nothing is logged.
 */

/** Answers per transaction: two writes each, well under the 500 a transaction allows. */
export const MOVE_CHUNK = 200;

export type MoveLimits = { max: number; expired: () => boolean };
/** How many moved, and how many due answers this run did not reach (the next tick's). */
export type MoveResult = { moved: number; left: number };

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function moveWaitingAnswers(db: Firestore, today: string, limits: MoveLimits): Promise<MoveResult> {
  // The whole waiting collection: it only ever holds today's answers and the
  // last night's, so it is small, and no query on a range is needed.
  const waiting = await db.collection(ANONYMOUS_WAITING_COLLECTION).get();
  const due = shuffled(
    waiting.docs.filter((doc: QueryDocumentSnapshot) => {
      const answer = normaliseAnswer((doc.data() ?? {}) as Record<string, unknown>);
      return answer !== null && dueToMove(answer, today);
    }),
  );
  let moved = 0;
  let reached = 0;
  for (let at = 0; at < due.length; at += MOVE_CHUNK) {
    if (moved >= limits.max || limits.expired()) break;
    const chunk = due.slice(at, at + MOVE_CHUNK);
    reached += chunk.length;
    moved += await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...chunk.map((doc) => doc.ref));
      let done = 0;
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const answer = normaliseAnswer((snap.data() ?? {}) as Record<string, unknown>);
        if (!answer || !dueToMove(answer, today)) continue;
        tx.create(db.collection(ANONYMOUS_ANSWERS_COLLECTION).doc(), {
          roundId: answer.roundId,
          programmeId: answer.programmeId,
          runId: answer.runId,
          keep: answer.keep,
          change: answer.change,
          drop: answer.drop,
          day: answer.day,
        });
        tx.delete(snap.ref);
        done += 1;
      }
      return done;
    });
  }
  return { moved, left: due.length - reached };
}
