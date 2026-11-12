import "server-only";
import type { DocumentReference, Firestore, Query } from "firebase-admin/firestore";
import { instantOf } from "@/lib/courses/writtenAnswers/model";
import { sanitizeWeekBlocks, type WeekBlock } from "../weekBlocks/model";
import type { EditChange } from "./model";
import { WEEK_HISTORY_SUBCOLLECTION } from "./paths";
import type { AskedMap, AskedVersion, AskedWords } from "./wordsThen";

/**
 * A WEEK'S HISTORY: one record for every save of a run's week, by the
 * in-place editor, the paste, and a restore, at
 * `courseRuns/{runId}/weeks/{weekId}/history/{saveId}`.
 *
 * SERVER-ONLY. Written and read through the Admin SDK by the routes under
 * `/api/courses/runs/[runId]/weeks/[weekId]/`, after their gate has admitted
 * an admin or the lead of the programme that names the run: a history holds
 * who edited and when, which is for them alone. `firestore.rules` shuts the
 * subcollection to every browser explicitly (the weeks rule has no
 * recursive match, so it was shut by default before the block existed).
 *
 * WHAT A SAVE KEEPS. Who and when, the one line a page lists it by, what it
 * did to people's work (ticks and answers on what it changed, all kept, and
 * answers on whatever a paste took out, kept with the people who wrote them),
 * who it is for (every group reading the run's week, less any group with its
 * own copy, which a save does not reach), whether people were told and how
 * many, and the week's title and blocks as they are after the save. Beside
 * the blocks, `asked`: the words of every prompt and written answer, the
 * small map "the words a question had when it was answered" reads without
 * loading whole weeks.
 *
 * EVERY WEEK HAS A BEFORE. A save first checks the newest record against the
 * week as stored. When there is none (the week's first save here) or it is
 * not what is stored (the week was changed somewhere that keeps no history),
 * the week as found is stored first, as its own record, in the same
 * transaction. So there is nothing to backfill, and a restore can always
 * bring back what a week said before a change.
 *
 * ORDER: `seq`, 1 upwards, and the record's id is made from it (`s000001`),
 * so two saves racing for the same number cannot both land. Read in order on
 * that one field: no declared index.
 *
 * Reverting the code that writes this leaves the records in place, read by
 * nothing; the week documents they sit under are unchanged in shape.
 */

export { WEEK_HISTORY_SUBCOLLECTION };

export type WeekSaveKind = "found" | "edit" | "paste" | "restore";

/** Who a save is for: every group reading the run's week, less those with their own copy. */
export type SaveReach = {
  /** Groups that read the run's week and so see this save. */
  groups: number;
  /** Groups with their own copy of the week, which this save does not reach. */
  exceptGroupIds: string[];
  exceptNames: string[];
};

/** What a save did to people's work, by count. Nothing is ever deleted: these are all kept. */
export type SaveWork = {
  /** Ticks on what the save changed (an edit: the block; a paste or restore: the whole week). */
  ticks: number;
  /** Answers (reflections, written answers, boxes) on the same. */
  answers: number;
  /** Answers on items a paste or a restore took out: kept with the people who wrote them, no longer shown. */
  takenOut: number;
};

/** That people were told about a save, and how many. */
export type SaveTold = {
  audience: "started" | "open" | "programme";
  /** How many the notice was sent to (its count on the button). */
  count: number;
  sent: number;
  held: number;
  suppressed: number;
  failed: number;
  at: Date | null;
  byUid: string;
};

export type WeekSaveDoc = {
  id: string;
  seq: number;
  kind: WeekSaveKind;
  at: Date | null;
  /** Null for a record the server made of the week as it found it. */
  byUid: string | null;
  summary: string;
  /** The block an edit changed; null for a paste, a restore or a week as found. */
  blockId: string | null;
  /** The part that block sits in, by its number; null at the top of the week or for a whole-week save. */
  partNumber: number | null;
  change: EditChange | null;
  reach: SaveReach;
  work: SaveWork;
  /** The `seq` of the version a restore brought back. */
  restoredFrom: number | null;
  told: SaveTold | null;
  title: string;
  blockCount: number;
  fingerprint: string;
  asked: AskedMap;
};

/** The whole record, the week's blocks with it: for a comparison and a restore. */
export type WeekSaveWithBlocks = WeekSaveDoc & { blocks: WeekBlock[] };

/** A record's id from its number: "s000007". */
export function saveIdOf(seq: number): string {
  return `s${String(seq).padStart(6, "0")}`;
}

/** Is this a record id a request may name? */
export function isSaveId(value: unknown): value is string {
  return typeof value === "string" && /^s\d{6}$/.test(value);
}

export function weekDocRef(db: Firestore, runId: string, weekId: string): DocumentReference {
  return db.collection("courseRuns").doc(runId).collection("weeks").doc(weekId);
}

export function weekHistoryRef(db: Firestore, runId: string, weekId: string) {
  return weekDocRef(db, runId, weekId).collection(WEEK_HISTORY_SUBCOLLECTION);
}

/** The newest record, by its number. One field ordered: no declared index. */
export function newestSaveQuery(db: Firestore, runId: string, weekId: string): Query {
  return weekHistoryRef(db, runId, weekId).orderBy("seq", "desc").limit(1);
}

type Raw = Record<string, unknown>;

const KINDS: readonly WeekSaveKind[] = ["found", "edit", "paste", "restore"];

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readAsked(value: unknown): AskedMap {
  const out: AskedMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, raw] of Object.entries(value as Raw)) {
    const entry = raw && typeof raw === "object" ? (raw as Raw) : null;
    if (!entry) continue;
    if (entry.kind === "prompt" && typeof entry.text === "string") out[id] = { kind: "prompt", text: entry.text };
    else if (entry.kind === "writtenAnswer" && typeof entry.question === "string") {
      const words = entry.words && typeof entry.words === "object" ? (entry.words as Raw) : null;
      const range = words && typeof words.min === "number" && typeof words.max === "number" ? { min: words.min, max: words.max } : null;
      const due = entry.due === "before" || entry.due === "atSession" ? entry.due : "dayBefore";
      out[id] = { kind: "writtenAnswer", question: entry.question, words: range, due } satisfies AskedWords;
    }
  }
  return out;
}

function readTold(value: unknown): SaveTold | null {
  const raw = value && typeof value === "object" ? (value as Raw) : null;
  if (!raw) return null;
  const audience = raw.audience === "started" || raw.audience === "open" || raw.audience === "programme" ? raw.audience : null;
  if (!audience) return null;
  return {
    audience,
    count: num(raw.count),
    sent: num(raw.sent),
    held: num(raw.held),
    suppressed: num(raw.suppressed),
    failed: num(raw.failed),
    at: instantOf(raw.at),
    byUid: str(raw.byUid),
  };
}

/** One stored record, read. Never throws; a field it cannot read reads as empty. */
export function readWeekSave(id: string, data: Raw): WeekSaveDoc {
  const reach = data.reach && typeof data.reach === "object" ? (data.reach as Raw) : {};
  const work = data.work && typeof data.work === "object" ? (data.work as Raw) : {};
  return {
    id,
    seq: num(data.seq),
    kind: KINDS.includes(data.kind as WeekSaveKind) ? (data.kind as WeekSaveKind) : "edit",
    at: instantOf(data.at),
    byUid: typeof data.byUid === "string" && data.byUid ? data.byUid : null,
    summary: str(data.summary),
    blockId: typeof data.blockId === "string" && data.blockId ? data.blockId : null,
    partNumber: typeof data.partNumber === "number" ? data.partNumber : null,
    change: data.change && typeof data.change === "object" ? (data.change as EditChange) : null,
    reach: { groups: num(reach.groups), exceptGroupIds: strings(reach.exceptGroupIds), exceptNames: strings(reach.exceptNames) },
    work: { ticks: num(work.ticks), answers: num(work.answers), takenOut: num(work.takenOut) },
    restoredFrom: typeof data.restoredFrom === "number" ? data.restoredFrom : null,
    told: readTold(data.told),
    title: str(data.title),
    blockCount: num(data.blockCount),
    fingerprint: str(data.fingerprint),
    asked: readAsked(data.asked),
  };
}

/** One stored record with its blocks, read through the reader of weeks. */
export function readWeekSaveWithBlocks(id: string, data: Raw): WeekSaveWithBlocks {
  return { ...readWeekSave(id, data), blocks: sanitizeWeekBlocks(data.blocks) };
}

/** The fields a list of saves reads: everything but the blocks, which can be large. */
const LIST_FIELDS = [
  "seq",
  "kind",
  "at",
  "byUid",
  "summary",
  "blockId",
  "partNumber",
  "change",
  "reach",
  "work",
  "restoredFrom",
  "told",
  "title",
  "blockCount",
  "fingerprint",
] as const;

/** Every save of a week, newest first, without their blocks. */
export async function listWeekSaves(db: Firestore, runId: string, weekId: string): Promise<WeekSaveDoc[]> {
  const snap = await weekHistoryRef(db, runId, weekId)
    .orderBy("seq", "desc")
    .select(...LIST_FIELDS)
    .get();
  return snap.docs.map((doc) => readWeekSave(doc.id, doc.data() ?? {}));
}

/** One save with its blocks, or null when the week has no such record. */
export async function readWeekSaveById(
  db: Firestore,
  runId: string,
  weekId: string,
  saveId: string,
): Promise<WeekSaveWithBlocks | null> {
  if (!isSaveId(saveId)) return null;
  const snap = await weekHistoryRef(db, runId, weekId).doc(saveId).get();
  return snap.exists ? readWeekSaveWithBlocks(snap.id, snap.data() ?? {}) : null;
}

/** Every save's words of its questions, for "the words a question had when it was answered". */
export async function askedVersionsOf(db: Firestore, runId: string, weekId: string): Promise<AskedVersion[]> {
  const snap = await weekHistoryRef(db, runId, weekId).orderBy("seq", "asc").select("seq", "at", "asked").get();
  return snap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return { seq: num(data.seq), at: instantOf(data.at), asked: readAsked(data.asked) };
  });
}
