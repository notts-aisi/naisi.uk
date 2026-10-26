/**
 * `coursePairs/{runId}__{groupId}__{uid}__{blockId}`: one person's place in
 * one group's pairs for one week's session in pairs (Technical AI Safety's
 * hands-on night: "Session 5 is hands-on, in pairs, with laptops"). One
 * document per person per group per week that asks for pairs: which pair they
 * are in (a number the group's facilitators give each pair, or none yet) and
 * whether they are bringing a laptop.
 *
 * WHICH WEEKS. A week asks for pairs when its In the session block says, in
 * what to do before you come, that people are paired
 * (`src/lib/courses/pairs/model.ts`, `pairsAskOf`). `blockId` is that block's
 * id, which a paste keeps (`src/lib/courses/weekBlocks/merge.ts`), so a
 * record keeps pointing at the same week when the week is pasted again. No
 * week number is in code.
 *
 * WHY PER PERSON, AND WHY THE GROUP IS IN THE ID. A pair is the people who
 * share a number, so a record names nobody but its own person: deleting one
 * account takes that person out of their pair and leaves no trace of them in
 * anybody else's record. The group is part of the address because pairs are
 * the group's, made for its own session: somebody who moves group is in no
 * pair of their new group until its facilitators pair them, and a
 * facilitator of two groups can be paired in each.
 *
 * WHO READS IT (the readers are `src/lib/courses/pairs/readers.ts`, on the
 * server, each after its own gate):
 *  - the person: their own pair (their partners' first names and who is
 *    bringing a laptop) on that week's page;
 *  - the group's live facilitators, the programme's lead and admins: every
 *    pair of the group, on the group page and the pairs page;
 *  - never anybody outside the group, and nobody in the group but the
 *    person's own partners.
 *
 * WHO WRITES IT: one route on the Admin SDK
 * (`/api/courses/groups/[groupId]/pairs`), for the group's live
 * facilitators, the programme's lead and admins. `firestore.rules` refuses
 * every browser, admins included.
 *
 * WHAT TAKES IT AWAY: deleting the person's account
 * (`src/lib/firestore/accountDeletion.ts`, by `uid`) and destroying the run
 * (`src/lib/firestore/courseDeletion.ts`, by `runId`). Leaving the programme
 * does not delete it, but nothing shows it any more: every reader lists only
 * the people taking part in the group now.
 *
 * Pure, with no imports, so the pages in the browser can read the shape.
 */

export const COURSE_PAIRS_COLLECTION = "coursePairs";

/** The highest pair number a group can use: far more pairs than any group has people for. */
export const MAX_PAIR_NUMBER = 30;

export type CoursePairDoc = {
  /** `pairRecordId(runId, groupId, uid, blockId)`. */
  id: string;
  runId: string;
  groupId: string;
  uid: string;
  /** The week's doc id ("w05"), as the week page addresses it. */
  weekId: string;
  weekNumber: number;
  /** The In the session block that asks for pairs. */
  blockId: string;
  /** The pair the person is in, from 1 to `MAX_PAIR_NUMBER`, or null for not paired yet. */
  pair: number | null;
  /** Whether they are bringing a laptop. */
  laptop: boolean;
  updatedAt: Date | null;
};

/**
 * The record's id. Construct-only: built from the four parts and never
 * parsed, as `courseProgress`'s is, so nobody can spell a record that is not
 * the one these four name.
 */
export function pairRecordId(runId: string, groupId: string, uid: string, blockId: string): string {
  return `${runId}__${groupId}__${uid}__${blockId}`;
}

/** A pair number as stored: a whole number from 1 to `MAX_PAIR_NUMBER`, or null. */
export function isPairNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PAIR_NUMBER;
}

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * A stored record, or null for one that cannot say whose it is, which run
 * and group and which block it belongs to. A null record is read as no pair
 * and no laptop, which is the safe direction: nobody is shown a partner a
 * row cannot place.
 */
export function normalizeCoursePair(id: string, data: Raw): CoursePairDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const groupId = typeof data.groupId === "string" ? data.groupId : "";
  const uid = typeof data.uid === "string" ? data.uid : "";
  const blockId = typeof data.blockId === "string" ? data.blockId : "";
  if (!runId || !groupId || !uid || !blockId) return null;
  const weekNumber =
    typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber >= 1 ? data.weekNumber : 0;
  return {
    id,
    runId,
    groupId,
    uid,
    weekId: typeof data.weekId === "string" ? data.weekId : "",
    weekNumber,
    blockId,
    pair: isPairNumber(data.pair) ? data.pair : null,
    laptop: data.laptop === true,
    updatedAt: tsToDate(data.updatedAt),
  };
}
