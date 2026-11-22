import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readGroupWeek } from "@/lib/courses/packsAndCases/readers";
import { pairsAskOf } from "./model";
import { pairsTitleWords } from "./words";

/** The way to one group's pairs for one week, named as its page names itself. */
export type PairsLink = { weekNumber: number; href: string; label: string };

/**
 * THE WAY TO A GROUP'S PAIRS FOR ONE WEEK, for the programme's lead and
 * admins on the group's page (its week card): when the week asks for pairs,
 * read from the group's own copy of the week as its pairs page and its week
 * page read it (`readGroupWeek`, `pairsAskOf`), the pairs page for that week
 * (`/learn/pairs/[groupId]?week=5`), named "Pairs and laptops" or "Pairs".
 * Null for a week that asks for none, and for a week written before blocks.
 * The group's facilitators have the card on their own group page.
 */
export async function readPairsLink(db: Firestore, runId: string, groupId: string, weekNumber: number): Promise<PairsLink | null> {
  const week = await readGroupWeek(db, runId, groupId, weekNumber);
  const ask = week ? pairsAskOf(week.blocks) : null;
  if (!ask) return null;
  return { weekNumber, href: `/learn/pairs/${encodeURIComponent(groupId)}?week=${weekNumber}`, label: pairsTitleWords(ask.laptops) };
}
