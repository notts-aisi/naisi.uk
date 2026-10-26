import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * `recordOpenings/{autoId}`: ONE ROW EACH TIME AN ADMIN OPENS ONE PERSON'S
 * CONFIDENTIAL RECORD. Today that is a person's sealed predictions card
 * (`kind: "sealed-predictions"`, `src/lib/firestore/coursePredictions.ts`);
 * another kind of record joins by adding its kind below, and its ids beside
 * the run's.
 *
 * THE ORDER IS THE POINT. `openRecorded` writes the row FIRST and reads the
 * record only once the row is stored: when the write fails, nothing of the
 * record is read and the caller refuses. So there is no way to read a record
 * through it without the opening being recorded, and an opening of a record
 * that turns out not to exist is recorded too, as an opening.
 *
 * WHAT A ROW HOLDS: the kind, who opened it (their account id and the name
 * they had then), whose record it was by ACCOUNT ID and never by name, the
 * run the record belongs to, and when. Never anything the record says.
 *
 * APPEND-ONLY, AND SHUT TO EVERY BROWSER, ADMINS INCLUDED: no client reads or
 * writes a row (`firestore.rules`), the posture of `courseAudit` and
 * `dataExports`. An audit its own actor can amend is not an audit, and the
 * actor here is an admin.
 *
 * WHAT TAKES IT AWAY:
 *  - DELETING AN ACCOUNT TAKES NOTHING HERE, in either direction, as with
 *    `courseAudit` and the log of who opened an access-requirements answer.
 *    The openings of a deleted account's record stay: they name it by an id
 *    that no longer resolves to anybody, and they are the only evidence of
 *    who read it while it existed. The openings a deleted account made stay
 *    too: they are the record of what an admin did.
 *  - DESTROYING A RUN deletes every row keyed to it
 *    (`src/lib/firestore/courseDeletion.ts`, by `runId`): destroying a run
 *    destroys the records the rows are about. A later kind that must outlive
 *    its run stores no `runId` here, or gets a stage of its own.
 */

export const RECORD_OPENINGS_COLLECTION = "recordOpenings";

/** What was opened. One kind per kind of confidential record. */
export type RecordOpeningKind =
  /** One person's sealed predictions card on one run: both cards' answers. */
  "sealed-predictions";

export const RECORD_OPENING_KINDS: readonly RecordOpeningKind[] = ["sealed-predictions"];

/** The longest name a row keeps. */
const MAX_ACTOR_NAME = 120;

export type RecordOpening = {
  kind: RecordOpeningKind;
  /** The admin who opened it. */
  actorUid: string;
  /** Their name when they opened it, so the row still says who after their account is gone. */
  actorName: string;
  /** Whose record it is, by account id. */
  subjectUid: string;
  /** The run the record belongs to: the axis a run's destroy deletes by. */
  runId: string;
};

export type OpenedRecord<T> = { ok: true; value: T } | { ok: false };

/**
 * Record that `opening.actorUid` opened `opening.subjectUid`'s record, THEN
 * read it with `read`. When the row cannot be written, `read` is never called
 * and the answer is `{ ok: false }`: the caller refuses, and says the record
 * stays closed.
 */
export async function openRecorded<T>(db: Firestore, opening: RecordOpening, read: () => Promise<T>): Promise<OpenedRecord<T>> {
  try {
    await db
      .collection(RECORD_OPENINGS_COLLECTION)
      .doc()
      .create({
        kind: opening.kind,
        actorUid: opening.actorUid,
        actorName: opening.actorName.replace(/\s+/g, " ").trim().slice(0, MAX_ACTOR_NAME),
        subjectUid: opening.subjectUid,
        runId: opening.runId,
        openedAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[record openings] could not record an opening, so nothing was read", opening.kind, opening.runId, err);
    return { ok: false };
  }
  return { ok: true, value: await read() };
}
