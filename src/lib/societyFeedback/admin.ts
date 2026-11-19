import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { NOTE_MAX_CHARS, SOCIETY_KEPT_COLLECTION, dayOf, isDayKey, isRecordId, normaliseKept, type KeptEntry } from "./model";
import { termStart } from "./programmes";
import { buildAdminView, type AdminView } from "./view";
import { ABOUT_WORDS, ADMIN_WORDS, DOWNLOAD_COLUMNS, weekWords } from "./words";

/**
 * WHAT ADMINS READ AND DO with anonymous feedback. Every caller has already
 * decided its caller is an admin (`requireAdminPage()` on the page, the
 * admin check at the top of each route); these functions are handed the
 * admin's uid and name only where they record that admin acting.
 *
 * READS ONLY THE KEPT COLLECTION. The waiting place holds each entry with the
 * database's own time of writing until the night's move, so nothing here ever
 * reads it: an entry reaches admins only once it has moved, from the day
 * after it was sent.
 */

/** The most kept entries one view of the page reads. Two years of a society's feedback sit far below it. */
export const READ_LIMIT = 2000;

/** The most entries one clear-out deletes in one press; it says how many it reached. */
export const CLEAR_LIMIT = 5000;

/** Deletes per batch while clearing. */
const CLEAR_BATCH = 400;

function keptOf(docs: readonly { id: string; data: () => Record<string, unknown> | undefined }[]): KeptEntry[] {
  return docs.map((doc) => normaliseKept(doc.id, doc.data() ?? {})).filter((entry): entry is KeptEntry => entry !== null);
}

/**
 * The admins' page. READS: every application form (one query, to find when
 * this term began), then the kept entries from that day (one range on `day`,
 * at most `READ_LIMIT`), or every kept entry up to the limit before any term
 * has begun.
 */
export async function readForAdmins(db: Firestore, now: Date): Promise<AdminView> {
  const term = await termStart(db, now);
  const kept = db.collection(SOCIETY_KEPT_COLLECTION);
  const snap = await (term ? kept.where("day", ">=", term.day) : kept).limit(READ_LIMIT).get();
  return buildAdminView(keptOf(snap.docs), dayOf(now), term ? term.day : null);
}

export type MarkResult = { ok: true } | { ok: false; status: 400 | 404; problem: "shape" | "gone" | "long" };

/** Mark one kept entry as dealt with, recording which admin and when. Marking it again changes nothing. */
export async function markDealtWith(db: Firestore, entryId: string, admin: { uid: string; name: string }, now: Date): Promise<MarkResult> {
  if (!isRecordId(entryId)) return { ok: false, status: 400, problem: "shape" };
  const ref = db.collection(SOCIETY_KEPT_COLLECTION).doc(entryId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const entry = snap.exists ? normaliseKept(snap.id, snap.data() ?? {}) : null;
    if (!entry) return { ok: false, status: 404, problem: "gone" } as const;
    if (entry.dealtWith) return { ok: true } as const;
    tx.update(ref, { dealtWith: { byUid: admin.uid, byName: admin.name, at: Timestamp.fromDate(now) } });
    return { ok: true } as const;
  });
}

/** Write the note for admins on one kept entry, recording which admin and when. A note replaces the one before. */
export async function setNote(db: Firestore, entryId: string, words: string, admin: { uid: string; name: string }, now: Date): Promise<MarkResult> {
  if (!isRecordId(entryId)) return { ok: false, status: 400, problem: "shape" };
  const text = words.trim();
  if (!text) return { ok: false, status: 400, problem: "shape" };
  if (text.length > NOTE_MAX_CHARS) return { ok: false, status: 400, problem: "long" };
  const ref = db.collection(SOCIETY_KEPT_COLLECTION).doc(entryId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const entry = snap.exists ? normaliseKept(snap.id, snap.data() ?? {}) : null;
    if (!entry) return { ok: false, status: 404, problem: "gone" } as const;
    tx.update(ref, { note: { text, byUid: admin.uid, byName: admin.name, at: Timestamp.fromDate(now) } });
    return { ok: true } as const;
  });
}

/**
 * Whether a clear-out's day can be used at `now`: a real day, on or before
 * today in London. Entries from today and yesterday may still be waiting for
 * the move, so a clear-out never reaches them in any case.
 */
export function clearDayFits(before: unknown, now: Date): before is string {
  return isDayKey(before) && before <= dayOf(now);
}

/** How many kept entries were sent before `before`: one count, no entry read. */
export async function countBefore(db: Firestore, before: string): Promise<number> {
  const snap = await db.collection(SOCIETY_KEPT_COLLECTION).where("day", "<", before).count().get();
  return snap.data().count;
}

/**
 * Delete every kept entry sent before `before`, by hand, at an admin's press:
 * nothing calls this on a timer. At most `CLEAR_LIMIT` in one press; `left`
 * says how many it did not reach.
 */
export async function clearBefore(db: Firestore, before: string): Promise<{ deleted: number; left: number }> {
  const query = db.collection(SOCIETY_KEPT_COLLECTION).where("day", "<", before);
  const snap = await query.limit(CLEAR_LIMIT).get();
  for (let at = 0; at < snap.docs.length; at += CLEAR_BATCH) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + CLEAR_BATCH)) batch.delete(doc.ref);
    await batch.commit();
  }
  const left = snap.docs.length < CLEAR_LIMIT ? 0 : (await query.count().get()).data().count;
  return { deleted: snap.docs.length, left };
}

/**
 * The download: every kept entry, the newest day first and by id within a
 * day, one row each. It names no admin: "Dealt with" is a yes or a blank and
 * the note is its words. At most `READ_LIMIT` rows.
 */
export async function downloadRows(db: Firestore): Promise<{ header: string[]; rows: string[][] }> {
  const snap = await db.collection(SOCIETY_KEPT_COLLECTION).limit(READ_LIMIT).get();
  const entries = keptOf(snap.docs).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    header: [...DOWNLOAD_COLUMNS],
    rows: entries.map((entry) => [
      entry.day,
      entry.programmeId ? entry.programmeName : ADMIN_WORDS.noProgramme,
      entry.week !== null ? weekWords(entry.week) : "",
      entry.about ? ABOUT_WORDS[entry.about] : "",
      entry.words,
      entry.dealtWith ? "Yes" : "",
      entry.note ? entry.note.text : "",
    ]),
  };
}
