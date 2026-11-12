import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { groupWeekRef } from "@/lib/courses/groupResolve";
import { liveGroupsOfRun } from "@/lib/courses/weeksTab/load";
import { instantOf } from "@/lib/courses/writtenAnswers/model";
import { normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { allBlocks, weekItems, type WeekBlock } from "../weekBlocks/model";
import type { SaveReach } from "./history";

/**
 * WHAT PEOPLE HAVE DONE ON A WEEK, BY COUNT, AND WHO THE WEEK REACHES: what
 * the in-place editor shows beside each block ("3 people have ticked it",
 * "2 sent"), what a save records it kept, and who a notice about it can go
 * to. COUNTS ONLY: no name and no word of anybody's work leaves this module.
 *
 * Read with one equality on the run per collection, filtered here to the
 * week, as the paste's count of answers on removed items reads them
 * (`answersOnRemoved` in `src/lib/courses/weekPaste.ts`), so nothing needs
 * a declared index:
 *  - ticks: `courseProgress` rows ticked (`completed`) on the week's items;
 *  - answers: `courseExerciseResponses` rows of this week with words in them
 *    (a reflection box, a fill-in box, a written answer), and of the written
 *    answers, the ones sent;
 *  - picks: `coursePacksAndCases` rows of this week (a pack picked or given,
 *    a case given, a talk marked ready).
 *
 * Every row of the run is counted, a group with its own copy of the week
 * included: none exists on the live site, and a count that can only be too
 * high never tells an editor a change touches nobody when it touches some.
 */

/** Distinct people per item id. */
type ByItem = Map<string, Set<string>>;

export type WeekWork = {
  /** Item id to the people who have ticked it. */
  ticks: ByItem;
  /** Item id (a prompt, a fill-in box, a written answer) to the people with words in it. */
  answers: ByItem;
  /** A written answer's id to the people who have sent theirs. */
  sent: ByItem;
  /** Everybody with anything of theirs on the week: a tick, a word, a pick. */
  started: Set<string>;
};

function add(map: ByItem, id: string, uid: string): void {
  const set = map.get(id) ?? new Set<string>();
  set.add(uid);
  map.set(id, set);
}

function hasWords(row: Record<string, unknown>): boolean {
  if (typeof row.text === "string" && row.text.trim()) return true;
  if (typeof row.linkUrl === "string" && row.linkUrl.trim()) return true;
  if (row.boxes && typeof row.boxes === "object" && !Array.isArray(row.boxes)) {
    return Object.values(row.boxes as Record<string, unknown>).some((value) => typeof value === "string" && value.trim() !== "");
  }
  return false;
}

/** What everybody on the run has done on this week's items. */
export async function readWeekWork(db: Firestore, runId: string, weekId: string, blocks: readonly WeekBlock[]): Promise<WeekWork> {
  const ids = new Set(weekItems(blocks).map((item) => item.id));
  const work: WeekWork = { ticks: new Map(), answers: new Map(), sent: new Map(), started: new Set() };
  const [progress, responses, picks] = await Promise.all([
    db.collection("courseProgress").where("runId", "==", runId).get(),
    db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    db.collection("coursePacksAndCases").where("runId", "==", runId).get(),
  ]);
  for (const doc of progress.docs) {
    const row = doc.data() ?? {};
    const uid = typeof row.uid === "string" ? row.uid : "";
    const itemId = typeof row.itemId === "string" ? row.itemId : "";
    if (!uid || !ids.has(itemId) || row.completed !== true) continue;
    add(work.ticks, itemId, uid);
    work.started.add(uid);
  }
  for (const doc of responses.docs) {
    const row = doc.data() ?? {};
    const uid = typeof row.uid === "string" ? row.uid : "";
    const itemId = typeof row.exerciseId === "string" ? row.exerciseId : "";
    if (!uid || row.weekId !== weekId || !itemId || !hasWords(row)) continue;
    add(work.answers, itemId, uid);
    work.started.add(uid);
    if (instantOf(row.firstSentAt) || instantOf(row.submittedAt)) add(work.sent, itemId, uid);
  }
  for (const doc of picks.docs) {
    const row = doc.data() ?? {};
    const uid = typeof row.uid === "string" ? row.uid : "";
    if (uid && row.weekId === weekId) work.started.add(uid);
  }
  return work;
}

/** What people have done on one block, by count: people who ticked it, answers in it, people who sent it. */
export type BlockCounts = { ticks: number; answers: number; sent: number };

const NONE: BlockCounts = { ticks: 0, answers: 0, sent: 0 };

function people(map: ByItem, ids: readonly string[]): number {
  const all = new Set<string>();
  for (const id of ids) for (const uid of map.get(id) ?? []) all.add(uid);
  return all.size;
}

function rows(map: ByItem, ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + (map.get(id)?.size ?? 0), 0);
}

/**
 * One block's counts: a source's, a pack's or a checklist's ticks (people);
 * a reflection's and fill-in boxes' answers (one per box written in); a
 * written answer's answers and sends (people). Zero for a block nobody ticks
 * or answers.
 */
export function blockCounts(block: WeekBlock, work: WeekWork): BlockCounts {
  switch (block.type) {
    case "source":
      return { ...NONE, ticks: people(work.ticks, [block.id]) };
    case "chooseOne":
      return { ...NONE, ticks: people(work.ticks, block.packs.map((pack) => pack.id)) };
    case "checklist":
      return { ...NONE, ticks: people(work.ticks, block.items.map((item) => item.id)) };
    case "reflection":
      return { ...NONE, answers: rows(work.answers, block.prompts.map((prompt) => prompt.id)) };
    case "fillIn":
      return { ...NONE, answers: rows(work.answers, block.groups.flatMap((group) => group.boxes.map((box) => box.id))) };
    case "writtenAnswer":
      return { ...NONE, answers: people(work.answers, [block.id]), sent: people(work.sent, [block.id]) };
    default:
      return NONE;
  }
}

/** Every tick and answer on a week's blocks, summed: what a paste or a restore kept. */
export function weekCounts(blocks: readonly WeekBlock[], work: WeekWork): { ticks: number; answers: number } {
  let ticks = 0;
  let answers = 0;
  for (const block of allBlocks(blocks)) {
    const counts = blockCounts(block, work);
    ticks += counts.ticks;
    answers += counts.answers;
  }
  return { ticks, answers };
}

/** One live group of the run, and whether it reads its own copy of this week. */
export type ReachGroup = { id: string; name: string; ownCopy: boolean };

export type WeekReach = {
  groups: ReachGroup[];
  /** Groups that read the run's week, so see a save of it. */
  reading: number;
  /** People holding a told, active place in a group that reads the run's week. */
  people: number;
  /** As a save records it. */
  saveReach: SaveReach;
};

const UNNAMED = "Untitled group";

/**
 * Who a save of the run's week reaches: the run's live groups, each with
 * whether it has its own full copy of the week (which a save does not
 * reach), and how many people hold a told, active place in the groups that
 * read the run's.
 */
export async function readWeekReach(db: Firestore, runId: string, weekId: string, groups?: readonly CourseGroupDoc[]): Promise<WeekReach> {
  const live = groups ?? (await liveGroupsOfRun(db, runId));
  const copies = await Promise.all(live.map((group) => groupWeekRef(db, group.id, weekId).get()));
  const reachGroups: ReachGroup[] = live.map((group, at) => {
    // A group's own copy is a whole week of its own (made by its fork), so its existence is the answer.
    return { id: group.id, name: group.name.trim() || UNNAMED, ownCopy: copies[at].exists };
  });
  const readingIds = new Set(reachGroups.filter((group) => !group.ownCopy).map((group) => group.id));
  // One equality on the run, as the notice's own audience reads places.
  const places = await db.collection("courseEnrolments").where("runId", "==", runId).get();
  let people = 0;
  for (const doc of places.docs) {
    const place = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (place.runId !== runId || place.role !== "learner" || place.status !== "active" || !placementIsTold(place)) continue;
    if (place.groupId && readingIds.has(place.groupId)) people += 1;
  }
  const except = reachGroups.filter((group) => group.ownCopy);
  return {
    groups: reachGroups,
    reading: readingIds.size,
    people,
    saveReach: { groups: readingIds.size, exceptGroupIds: except.map((group) => group.id), exceptNames: except.map((group) => group.name) },
  };
}
