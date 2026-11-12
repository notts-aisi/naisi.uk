import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { isBlockWeek, type BlockType, type WeekBlock } from "../weekBlocks/model";
import { blockCounts, readWeekReach, readWeekWork, type BlockCounts, type ReachGroup } from "./counts";
import { listWeekSaves, type WeekSaveDoc } from "./history";
import { lockStateFor, readHold, weekLockRef, type WeekLockState } from "./lock";
import {
  blockFingerprint,
  editorFieldsOf,
  isEditableType,
  locateBlock,
  placeWords,
  weekFingerprint,
  type EditorFields,
} from "./model";
import type { EditWeek } from "./gate";
import { HISTORY_WORDS } from "./words";

/**
 * WHAT THE PAGES OF THE IN-PLACE EDITOR READ, worked out on the server for
 * an admin or the programme's lead after `weekEditGate` admitted them:
 *
 *  - `loadWeekEditor`: the week as the editor needs it. Its blocks as stored
 *    (the page draws them with the week's own renderers), and beside each
 *    block, by id: where it is, whether this slice edits it, its fields as
 *    the editor's boxes hold them, the fingerprint a save echoes, and how
 *    many people have ticked it, answered it or sent it (COUNTS ONLY, never
 *    a name). Whether the week is live, for how many groups and people, and
 *    how many have started it; each live group, and whether it has its own
 *    full copy of the week, which a save here does not reach; and the lock.
 *  - `historyRows`: the week's saves, newest first, each in the words the
 *    list shows.
 *
 * Nothing here writes.
 */

export type EditorItem = {
  blockId: string;
  type: BlockType;
  /** "Part 2’s source": where it is, in the week's own words. */
  place: string;
  partNumber: number | null;
  /** Edited in place in this slice: a source, a text, a reflection, a written answer. */
  editable: boolean;
  /** What a save of this block echoes back as `base`; "" for a block not edited here. */
  fingerprint: string;
  /** Its fields as the editor's boxes hold them; null for a block not edited here. */
  fields: EditorFields | null;
  counts: BlockCounts;
};

export type WeekEditorView = {
  runId: string;
  weekId: string;
  weekNumber: number;
  title: string;
  /** The week has a document; a week of the plan with none has nothing to edit in place. */
  hasPage: boolean;
  /** Written as blocks: anything else is changed by pasting. */
  blockWeek: boolean;
  /** Published: people read it, so a save goes live at once and a notice can be offered. */
  live: boolean;
  /** What a restore of a version echoes back as `base`: the week's blocks as stored. */
  fingerprint: string;
  blocks: WeekBlock[];
  items: EditorItem[];
  reach: {
    /** The run's live groups, Monday first, each saying whether it reads its own copy of this week. */
    groups: ReachGroup[];
    /** Groups that read the run's week, so see a save. */
    reading: number;
    /** People holding a told place in those groups. */
    people: number;
    /** People with anything of theirs on the week: a tick, a word, a pick. */
    started: number;
    /** Some group has its own full copy: a save here does not reach it. */
    copies: string[];
  };
  lock: WeekLockState;
};

/** Every block of the week with its place, top level first then each part's own, in page order. */
function itemsOf(blocks: readonly WeekBlock[], counts: (block: WeekBlock) => BlockCounts): EditorItem[] {
  const out: EditorItem[] = [];
  const visit = (block: WeekBlock) => {
    const located = locateBlock(blocks, block.id);
    if (!located) return;
    const editable = isEditableType(block.type);
    out.push({
      blockId: block.id,
      type: block.type,
      place: placeWords(located),
      partNumber: located.partNumber,
      editable,
      fingerprint: editable ? blockFingerprint(block) : "",
      fields: editable ? editorFieldsOf(located) : null,
      counts: counts(block),
    });
    if (block.type === "part") block.blocks.forEach(visit);
  };
  blocks.forEach(visit);
  return out;
}

/** One block's line of the editor, after a save: what the page puts back in place of what it showed. */
export function editorItemOf(blocks: readonly WeekBlock[], blockId: string, counts: BlockCounts): EditorItem | null {
  const located = locateBlock(blocks, blockId);
  if (!located) return null;
  return itemsOf(blocks, (block) => (block.id === blockId ? counts : { ticks: 0, answers: 0, sent: 0 })).find((item) => item.blockId === blockId) ?? null;
}

export async function loadWeekEditor(db: Firestore, loaded: EditWeek, viewerUid: string, now: Date): Promise<WeekEditorView> {
  const { run, week, weekNumber, exists } = loaded;
  const blocks = isBlockWeek(week) ? week.blocks : [];
  const [work, reach, lockSnap] = await Promise.all([
    readWeekWork(db, run.id, week.id, blocks),
    readWeekReach(db, run.id, week.id),
    weekLockRef(db, run.id, week.id).get(),
  ]);
  const lock = await lockStateFor(db, readHold(lockSnap), viewerUid, weekNumber, now);
  return {
    runId: run.id,
    weekId: week.id,
    weekNumber,
    title: week.title,
    hasPage: exists,
    blockWeek: isBlockWeek(week),
    live: week.published === true,
    fingerprint: weekFingerprint(blocks),
    blocks,
    items: itemsOf(blocks, (block) => blockCounts(block, work)),
    reach: {
      groups: reach.groups,
      reading: reach.reading,
      people: reach.people,
      started: work.started.size,
      copies: reach.groups.filter((group) => group.ownCopy).map((group) => group.name),
    },
    lock,
  };
}

/** One save as the history's list shows it. */
export type HistoryRow = {
  id: string;
  seq: number;
  kind: WeekSaveDoc["kind"];
  /** "Tue 10 Nov, 2:24pm", or "" for a record with no time. */
  when: string;
  /** Who saved it, by first name; null for the week as the server found it. */
  by: string | null;
  summary: string;
  /** "Every group", "Every group except Group K". */
  reach: string;
  /** "7 ticks kept · 2 answers kept", or "". */
  kept: string;
  /** "told 9 people", or null. */
  told: string | null;
  /** The number of the version a restore brought back. */
  restoredFrom: number | null;
  /** The newest save: what the week holds now. */
  current: boolean;
};

/** "Tue 10 Nov, 2:24pm". */
export function whenWords(at: Date | null): string {
  return at ? `${londonDayLabel(at)}, ${londonClockLabel(at)}` : "";
}

/**
 * The week's saves, newest first, in the list's words, each editor by first
 * name. `nowFingerprint` is the week's blocks as stored: the newest save is
 * "current" only while the week still holds what it saved.
 */
export async function historyRows(db: Firestore, runId: string, weekId: string, nowFingerprint: string): Promise<HistoryRow[]> {
  const saves = await listWeekSaves(db, runId, weekId);
  const uids = [...new Set(saves.map((save) => save.byUid).filter((uid): uid is string => Boolean(uid)))];
  const accounts = uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  const names = new Map(
    accounts.map((snap) => [snap.id, snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) || "Somebody" : "Somebody"] as const),
  );
  return saves.map((save, index) => ({
    id: save.id,
    seq: save.seq,
    kind: save.kind,
    when: whenWords(save.at),
    by: save.byUid ? (names.get(save.byUid) ?? "Somebody") : null,
    summary: save.summary,
    reach: HISTORY_WORDS.reaches(save.reach.groups, save.reach.exceptNames),
    kept: HISTORY_WORDS.kept(save.work.ticks, save.work.answers),
    told: save.told ? HISTORY_WORDS.told(save.told.count) : null,
    restoredFrom: save.restoredFrom,
    current: index === 0 && save.fingerprint === nowFingerprint,
  }));
}
