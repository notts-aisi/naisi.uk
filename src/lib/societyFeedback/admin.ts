import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { NOTE_MAX_CHARS, SOCIETY_DELETIONS_COLLECTION, SOCIETY_KEPT_COLLECTION, dayOf, isDayKey, isRecordId, normaliseEntry, normaliseKept, yearBefore, type DeletionKind, type KeptEntry } from "./model";
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
 * has begun; and the one oldest kept entry (ordered by `day`, which every
 * entry has, limit one), for the clear-out's line.
 */
export async function readForAdmins(db: Firestore, now: Date): Promise<AdminView> {
  const kept = db.collection(SOCIETY_KEPT_COLLECTION);
  const [term, oldest] = await Promise.all([termStart(db, now), kept.orderBy("day", "asc").limit(1).get()]);
  const snap = await (term ? kept.where("day", ">=", term.day) : kept).limit(READ_LIMIT).get();
  const first = oldest.docs[0] ? normaliseEntry(oldest.docs[0].data() ?? {}) : null;
  return buildAdminView(keptOf(snap.docs), dayOf(now), term ? term.day : null, first ? first.day : null);
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
 * The record of one deletion, as it is written: which admin, when, one entry
 * or a clear-out, and how many. The one place its fields are named, and
 * nothing of any entry is ever handed to it.
 */
function deletionRecord(kind: DeletionKind, count: number, admin: { uid: string }, now: Date) {
  return { kind, count, byUid: admin.uid, at: Timestamp.fromDate(now) };
}

/**
 * Delete ONE kept entry, at an admin's press (for abuse, or when a named
 * person asks for what is written about them to be erased), and record that
 * an admin deleted one entry, who and when. An entry still waiting for the
 * night's move cannot be reached: it has no id anybody is shown.
 */
export async function deleteOne(db: Firestore, entryId: string, admin: { uid: string }, now: Date): Promise<MarkResult> {
  if (!isRecordId(entryId)) return { ok: false, status: 400, problem: "shape" };
  const ref = db.collection(SOCIETY_KEPT_COLLECTION).doc(entryId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !normaliseKept(snap.id, snap.data() ?? {})) return { ok: false, status: 404, problem: "gone" } as const;
    tx.delete(ref);
    tx.create(db.collection(SOCIETY_DELETIONS_COLLECTION).doc(), deletionRecord("one", 1, admin, now));
    return { ok: true } as const;
  });
}

/**
 * Whether a clear-out's day can be used at `now`: a real day, no later than
 * the same day a year before today in London. The privacy policy says an
 * admin deletes "every entry more than a year old", so no press can delete an
 * entry under a year old.
 */
export function clearDayFits(before: unknown, now: Date): before is string {
  return isDayKey(before) && before <= yearBefore(dayOf(now));
}

/** How many kept entries were sent before `before`: one count, no entry read. */
export async function countBefore(db: Firestore, before: string): Promise<number> {
  const snap = await db.collection(SOCIETY_KEPT_COLLECTION).where("day", "<", before).count().get();
  return snap.data().count;
}

/**
 * Delete every kept entry sent before `before`, by hand, at an admin's press,
 * and record who cleared out how many and when: nothing calls this on a timer. At most `CLEAR_LIMIT` in one press; `left`
 * says how many it did not reach.
 */
export async function clearBefore(
  db: Firestore,
  before: string,
  admin: { uid: string },
  now: Date,
  limit = CLEAR_LIMIT,
): Promise<{ deleted: number; left: number }> {
  const query = db.collection(SOCIETY_KEPT_COLLECTION).where("day", "<", before);
  const snap = await query.limit(limit).get();
  for (let at = 0; at < snap.docs.length; at += CLEAR_BATCH) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + CLEAR_BATCH)) batch.delete(doc.ref);
    await batch.commit();
  }
  // Who cleared out how many, and when: never which entries or what was in them.
  if (snap.docs.length > 0) await db.collection(SOCIETY_DELETIONS_COLLECTION).add(deletionRecord("clear-out", snap.docs.length, admin, now));
  const left = snap.docs.length < limit ? 0 : (await query.count().get()).data().count;
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
