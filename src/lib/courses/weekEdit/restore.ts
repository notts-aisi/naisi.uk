import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { answersOnRemoved } from "@/lib/courses/weekPaste";
import { weekItems, type WeekBlock, type WeekItem } from "../weekBlocks/model";
import { compareWeeks, comparisonLine, type WeekComparison, type WeekVersion } from "./compare";

/**
 * WHAT A RESTORE WOULD TAKE OUT, AND A COMPARISON'S ANSWERS AT STAKE.
 *
 * A restore brings a chosen version back as a new save, its ids exactly as
 * they were, so ticks and answers on anything it brings back are with their
 * blocks again. What it takes out is whatever was added since that version:
 * the answers on those items stay stored with the people who wrote them and
 * are no longer shown, so a restore that takes out answered items asks for
 * the count first, as a paste does (`unconfirmedAnswers`).
 */

/** The items `current` has that `restored` does not: what a restore would take out. */
export function itemsARestoreTakesOut(current: readonly WeekBlock[], restored: readonly WeekBlock[]): WeekItem[] {
  const kept = new Set(weekItems(restored).map((item) => item.id));
  return weekItems(current).filter((item) => !kept.has(item.id));
}

/** Answers on some items, by id, summed: what the paste counts on what it removes. */
export async function answersOn(db: Firestore, runId: string, weekId: string, items: readonly WeekItem[]): Promise<{ total: number; byItem: Map<string, number> }> {
  const byItem = await answersOnRemoved(db, runId, weekId, items);
  return { total: [...byItem.values()].reduce((sum, n) => sum + n, 0), byItem };
}

/** The comparison of two versions, with the answers on what the later one took out, and its line. */
export async function compareWithAnswers(
  db: Firestore,
  runId: string,
  weekId: string,
  before: WeekVersion,
  after: WeekVersion,
): Promise<{ comparison: WeekComparison; line: string; answersTakenOut: number }> {
  const comparison = compareWeeks(before, after);
  const ids = [...new Set(comparison.rows.flatMap((row) => row.itemsTakenOut))];
  const byId = new Map(weekItems(before.blocks).map((item) => [item.id, item] as const));
  const items = ids.map((id) => byId.get(id)).filter((item): item is WeekItem => Boolean(item));
  const { total } = await answersOn(db, runId, weekId, items);
  return { comparison, line: comparisonLine(comparison, total), answersTakenOut: total };
}
