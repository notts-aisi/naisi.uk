import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { SOCIETY_WAITING_COLLECTION, dayOf, entryToKeep, type NamedProgramme, type SentFeedback } from "./model";

/**
 * KEEPING ONE ENTRY OF ANONYMOUS FEEDBACK: the one writer of an entry as it
 * comes in.
 *
 * It is handed what was sent, the programme the server found for it and the
 * time, and writes exactly `ENTRY_FIELDS` (`./model`). It is never handed a
 * request, a session, an account, a cookie or an address, so it cannot keep
 * one. The record waits in `societyFeedbackWaiting` until the night's move
 * (`./move`), and its id is never handed back to anybody, so nobody can point
 * to an entry as theirs.
 */
export async function keepSocietyFeedback(db: Firestore, sent: SentFeedback, programme: NamedProgramme | null, now: Date): Promise<void> {
  const entry = entryToKeep(sent, programme, dayOf(now));
  await db.collection(SOCIETY_WAITING_COLLECTION).add({
    words: entry.words,
    day: entry.day,
    roundId: entry.roundId,
    programmeId: entry.programmeId,
    programmeName: entry.programmeName,
    week: entry.week,
    about: entry.about,
  });
}
