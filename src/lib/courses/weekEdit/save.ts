import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { emptyWeekFields, normalizeCourseWeek, type CourseWeekDoc } from "@/lib/firestore/courses";
import { isBlockWeek, type WeekBlock } from "../weekBlocks/model";
import {
  newestOf,
  saveHeadsQuery,
  saveIdOf,
  weekDocRef,
  weekHistoryRef,
  type SaveReach,
  type SaveWork,
  type WeekSaveKind,
} from "./history";
import { heldByAnother, heldRefusal, readHold, weekLockRef } from "./lock";
import { weekFingerprint, type EditChange } from "./model";
import { askedOf } from "./wordsThen";
import { HISTORY_WORDS } from "./words";

/**
 * EVERY SAVE OF A RUN'S WEEK'S BLOCKS, IN ONE TRANSACTION: an edit in place,
 * a paste, a restore. The three routes differ only in how they build the new
 * blocks from the week as stored; this is the one place that
 *
 *  1. refuses while somebody else holds the week's lock (`lock.ts`), naming
 *     them;
 *  2. builds the new blocks from the week AS STORED INSIDE the transaction,
 *     so a save can never land on a week that changed after it was read (the
 *     builder refuses when what it was read against is no longer there);
 *  3. stores the week as it found it first, when the newest record of the
 *     history is not what is stored (`history.ts`, "Every week has a
 *     before");
 *  4. writes the blocks (and the title a paste or a restore brings) with who
 *     and when, making the week's page on its first save as the paste always
 *     has;
 *  5. writes the save's own record.
 *
 * All or nothing: a refusal writes nothing, and a transaction that loses a
 * race is run again against what won it.
 */

/** The week as the builder sees it inside the transaction. */
export type StoredWeek = {
  exists: boolean;
  /** Null for a week written before blocks, or a week with no page. */
  blocks: WeekBlock[] | null;
  title: string;
  /** The whole stored week, for a builder that needs more of it. */
  doc: CourseWeekDoc | null;
};

export type Refusal = { status: number; body: { error: string } & Record<string, unknown> };

export type Built =
  | {
      ok: true;
      /** Nothing would change: write nothing, and say so. */
      noop?: false;
      blocks: WeekBlock[];
      /** A new title, or undefined to leave the stored one. */
      title?: string;
      summary: string;
      blockId?: string | null;
      partNumber?: number | null;
      change?: EditChange | null;
      restoredFrom?: number | null;
    }
  | { ok: true; noop: true }
  | ({ ok: false } & Refusal);

export type SaveInput = {
  runId: string;
  weekId: string;
  weekNumber: number;
  uid: string;
  kind: Exclude<WeekSaveKind, "found">;
  now: Date;
  reach: SaveReach;
  work: SaveWork;
  build: (stored: StoredWeek) => Built;
};

export type SaveResult =
  | { ok: true; saved: true; saveId: string; seq: number; foundSaveId: string | null; blocks: WeekBlock[]; title: string }
  | { ok: true; saved: false }
  | ({ ok: false } & Refusal);

/** Firestore refuses `undefined` anywhere in a write: a change is stored as plain JSON. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveWeekBlocks(db: Firestore, input: SaveInput): Promise<SaveResult> {
  const weekRef = weekDocRef(db, input.runId, input.weekId);
  const lockRef = weekLockRef(db, input.runId, input.weekId);
  const history = weekHistoryRef(db, input.runId, input.weekId);

  return db.runTransaction(async (tx): Promise<SaveResult> => {
    const [weekSnap, lockSnap, headSnap] = await Promise.all([
      tx.get(weekRef),
      tx.get(lockRef),
      tx.get(saveHeadsQuery(db, input.runId, input.weekId)),
    ]);

    // 1. Somebody else is editing this week.
    const hold = readHold(lockSnap);
    if (heldByAnother(hold, input.uid, input.now)) {
      return { ok: false, status: 409, body: await heldRefusal(db, hold, input.weekNumber) };
    }

    // 2. The new blocks, from the week as stored now.
    const doc = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
    const stored: StoredWeek = {
      exists: weekSnap.exists,
      blocks: doc && isBlockWeek(doc) ? doc.blocks : null,
      title: doc?.title ?? "",
      doc,
    };
    const built = input.build(stored);
    if (!built.ok) return { ok: false, status: built.status, body: built.body };
    if (built.noop) return { ok: true, saved: false };

    // 3. The week as found, when the history does not already end with it.
    const head = newestOf(
      headSnap.docs.map((each) => {
        const data = each.data() ?? {};
        return { seq: typeof data.seq === "number" ? data.seq : 0, fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "" };
      }),
    );
    let seq = (head?.seq ?? 0) + 1;
    let foundSaveId: string | null = null;
    if (stored.blocks && (!head || head.fingerprint !== weekFingerprint(stored.blocks))) {
      foundSaveId = saveIdOf(seq);
      tx.create(history.doc(foundSaveId), {
        seq,
        kind: "found",
        at: FieldValue.serverTimestamp(),
        byUid: null,
        summary: head ? HISTORY_WORDS.drifted : HISTORY_WORDS.firstFound,
        blockId: null,
        partNumber: null,
        change: null,
        reach: plain(input.reach),
        work: { ticks: 0, answers: 0, takenOut: 0 },
        restoredFrom: null,
        told: null,
        title: stored.title,
        blockCount: stored.blocks.length,
        fingerprint: weekFingerprint(stored.blocks),
        asked: askedOf(stored.blocks),
        blocks: stored.blocks,
      });
      seq += 1;
    }

    // 4. The week itself.
    const title = built.title !== undefined && built.title !== "" ? built.title : stored.title;
    const written: Record<string, unknown> = {
      blocks: built.blocks,
      ...(built.title ? { title: built.title } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: input.uid,
    };
    if (weekSnap.exists) tx.update(weekRef, written);
    else tx.create(weekRef, { ...emptyWeekFields(input.weekNumber), ...written });

    // 5. The save's own record.
    const saveId = saveIdOf(seq);
    tx.create(history.doc(saveId), {
      seq,
      kind: input.kind,
      at: FieldValue.serverTimestamp(),
      byUid: input.uid,
      summary: built.summary,
      blockId: built.blockId ?? null,
      partNumber: built.partNumber ?? null,
      change: built.change ? plain(built.change) : null,
      reach: plain(input.reach),
      work: plain(input.work),
      restoredFrom: built.restoredFrom ?? null,
      told: null,
      title,
      blockCount: built.blocks.length,
      fingerprint: weekFingerprint(built.blocks),
      asked: askedOf(built.blocks),
      blocks: built.blocks,
    });
    return { ok: true, saved: true, saveId, seq, foundSaveId, blocks: built.blocks, title };
  });
}
