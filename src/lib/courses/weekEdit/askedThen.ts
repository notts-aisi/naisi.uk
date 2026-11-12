import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { instantOf } from "@/lib/courses/writtenAnswers/model";
import { weekDocId } from "@/lib/firestore/courses";
import { isBlockWeek } from "../weekBlocks/model";
import { askedVersionsOf } from "./history";
import { askedOf, earlierWords, type AskedWords } from "./wordsThen";

/**
 * THE WORDS A QUESTION HAD WHEN IT WAS ANSWERED, FOR THE LOADERS THAT HAND
 * AN ANSWER TO A PAGE BESIDE ITS QUESTION: a person's own week page
 * (`my-exercises`), the written answer's review page, the reflections with
 * names, and a person's coursework page.
 *
 * Each asks with the answers it is about to hand over (which prompt or
 * written answer, and when the piece was first written) and is handed back,
 * for each, the words the question had then, ONLY where they differ from the
 * words it has now. No copy of the words is stored on any answer: the
 * week's history is the record (`wordsThen.ts`).
 *
 * Read only from the run's own week: a group with its own copy of the week
 * reads words the run's history does not hold, so nothing is said for it.
 * Cheap when nothing was ever edited in place: one read of a week's history,
 * empty, and nothing more.
 */

/** When a piece of work was first written, as its row says: its first save, else its last. */
export function writtenAtOf(row: Record<string, unknown>): Date | null {
  return instantOf(row.firstWrittenAt) ?? instantOf(row.updatedAt) ?? null;
}

export type AskedThenRequest = {
  /** What the caller keys the answer by: a uid, an item id, a row id. */
  key: string;
  /** The prompt's or the written answer's id. */
  itemId: string;
  writtenAt: Date | null;
};

/**
 * The earlier words of each question asked about, by the caller's key, for
 * one week of a run as `groupId`'s people read it (null for the run's own).
 */
export async function askedThenFor(
  db: Firestore,
  runId: string,
  weekId: string,
  groupId: string | null,
  asks: readonly AskedThenRequest[],
): Promise<Map<string, AskedWords>> {
  const out = new Map<string, AskedWords>();
  if (asks.length === 0) return out;
  const versions = await askedVersionsOf(db, runId, weekId);
  if (versions.length === 0) return out;
  const resolved = await resolveWeekDoc(db, runId, groupId, weekId);
  if (resolved.source !== "run" || !resolved.week || !isBlockWeek(resolved.week)) return out;
  const now = askedOf(resolved.week.blocks);
  for (const ask of asks) {
    const then = earlierWords(versions, now, ask.itemId, ask.writtenAt);
    if (then) out.set(ask.key, then);
  }
  return out;
}

/**
 * One person's answers on a run, each weekly question's earlier words where
 * they differ, keyed as the coursework pages key a person's work
 * ("3 rp-1": the week's number, then the item's id). `groupId` is the group
 * whose copy of a week they read, or null. One read of their own rows (two
 * equalities, no declared index), then one history read per week they wrote in.
 */
export async function personAskedThen(
  db: Firestore,
  runId: string,
  uid: string,
  groupId: string | null,
): Promise<Record<string, AskedWords>> {
  const snap = await db.collection("courseExerciseResponses").where("runId", "==", runId).where("uid", "==", uid).get();
  const byWeek = new Map<number, AskedThenRequest[]>();
  for (const doc of snap.docs) {
    const row = (doc.data() ?? {}) as Record<string, unknown>;
    const weekNumber = typeof row.weekNumber === "number" ? row.weekNumber : 0;
    const itemId = typeof row.exerciseId === "string" ? row.exerciseId : "";
    if (row.uid !== uid || weekNumber < 1 || !itemId) continue;
    const asks = byWeek.get(weekNumber) ?? [];
    asks.push({ key: `${weekNumber} ${itemId}`, itemId, writtenAt: writtenAtOf(row) });
    byWeek.set(weekNumber, asks);
  }
  const out: Record<string, AskedWords> = {};
  for (const [weekNumber, asks] of byWeek) {
    const found = await askedThenFor(db, runId, weekDocId(weekNumber), groupId, asks);
    for (const [key, words] of found) out[key] = words;
  }
  return out;
}
