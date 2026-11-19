import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { SOCIETY_KEPT_COLLECTION, SOCIETY_WAITING_COLLECTION, dueToMove, normaliseEntry, shuffled } from "./model";

/**
 * THE NIGHT'S MOVE FOR ANONYMOUS FEEDBACK: every entry from a London day that
 * is over moves from `societyFeedbackWaiting` into `societyFeedback`, and its
 * waiting record is deleted. Run by the job that already moves the keep,
 * change and drop form's answers (`anonymous-feedback-move`).
 *
 * WHY. The database stamps every record with the time it was written. An
 * entry written as it arrives carries the minute it was sent, which could be
 * set beside who was where at that minute. The move writes a finished day's
 * entries together, so the database's own time on each kept entry is the
 * move's, and the entry itself holds only the day. From the move on, nothing
 * kept says more than the day. (The database's recovery copies hold a deleted
 * waiting record for as long as they are kept; the privacy policy says so.)
 *
 * ONLY A DAY THAT IS OVER MOVES (`dueToMove`): an entry sent at 00:20 waits
 * for the next night with the rest of its day.
 *
 * NO ORDER. The day's entries are taken in a shuffled order and moved in
 * transactions of up to `MOVE_CHUNK`, each kept entry under a new random id,
 * so neither the ids nor which entries share a transaction follow the order
 * they came in. Each record is read again inside its transaction, so one
 * already moved or deleted is never written twice.
 *
 * It moves; it deletes nothing but the waiting copy. Only `ENTRY_FIELDS` are
 * copied, by name. Nothing is logged.
 */

/** Entries per transaction: two writes each, well under the 500 a transaction allows. */
export const MOVE_CHUNK = 200;

export type MoveLimits = { max: number; expired: () => boolean };
/** How many moved, and how many due entries this run did not reach (the next tick's). */
export type MoveResult = { moved: number; left: number };

export async function moveWaitingSocietyFeedback(
  db: Firestore,
  today: string,
  limits: MoveLimits,
  random: () => number = Math.random,
): Promise<MoveResult> {
  // The whole waiting collection: it only ever holds today's entries and the
  // last night's, so it is small, and no query on a range is needed.
  const waiting = await db.collection(SOCIETY_WAITING_COLLECTION).get();
  const due = shuffled(
    waiting.docs.filter((doc: QueryDocumentSnapshot) => {
      const entry = normaliseEntry((doc.data() ?? {}) as Record<string, unknown>);
      return entry !== null && dueToMove(entry, today);
    }),
    random,
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
        const entry = normaliseEntry((snap.data() ?? {}) as Record<string, unknown>);
        if (!entry || !dueToMove(entry, today)) continue;
        tx.create(db.collection(SOCIETY_KEPT_COLLECTION).doc(), {
          words: entry.words,
          day: entry.day,
          roundId: entry.roundId,
          programmeId: entry.programmeId,
          programmeName: entry.programmeName,
          week: entry.week,
          about: entry.about,
        });
        tx.delete(snap.ref);
        done += 1;
      }
      return done;
    });
  }
  return { moved, left: due.length - reached };
}
