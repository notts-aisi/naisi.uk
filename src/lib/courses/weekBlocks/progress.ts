import {
  partsOf,
  type PartBlock,
  type ThisWeekBlock,
  type ThisWeekRow,
  type WeekBlock,
} from "./model";

/**
 * HOW "DONE" COUNTS ON A WEEK WRITTEN AS BLOCKS: by This week's tasks
 * (HANDOFF "How done counts"; boards st-week1-phone, wk-week-phone,
 * wk-programme). Week 1 has one task, so it reads "0 of 1 done" until the
 * task is done.
 *
 * THE ONE PLACE IT IS WORKED OUT. The overview payload hands each block
 * week's tasks with what each one needs (`taskNeeds`, ids only), and every
 * surface that says "N of M done" asks `taskDone` or `tasksDone` here: the
 * week page's This week box, the programme page's This week card and its
 * list of weeks, and Home's card. A week written before blocks keeps its own
 * count (its readings and checklist items, `countableIds`) and never reaches
 * this module.
 *
 * WHAT A TASK NEEDS is everything it covers (`ThisWeekTask.covers`, the ids
 * of parts, written answers, Cases blocks and In the session, the model's
 * `COVERABLE_TYPES`, worked out from the task's words when a week is pasted
 * in, `readPastedWeek`). A part stands for its own blocks:
 *  - a SOURCE on a part's path, ticked (the member's own `courseProgress`
 *    row for the source's id);
 *  - a CHECKLIST item in a part, ticked the same way;
 *  - a REFLECTION box, with something written in it;
 *  - the WRITTEN ANSWER, sent (its first-sent time stored, Q33): editing it
 *    after sending, or a reviewer opening it, changes nothing here;
 *  - anything a later page decides how to finish (the chosen pack, the
 *    case talk, fill-in boxes): UNSEEN. A task holding
 *    something unseen is counted and is never done, because no page can see
 *    it done yet. Each later page brings its own way of seeing it and is
 *    added here, to `taskNeeds` and `taskDone`, so the count stays in one
 *    place and never claims a task is done that is not.
 * Text, tables and In the session (its "Before you come" is words to read,
 * with nothing to tick or write) need nothing. Go further and the hands-on
 * route are never covered and never count, and nor does This week's row
 * that is only offered (`ThisWeekOptional`).
 *
 * A TASK THAT NEEDS NOTHING (it covers nothing, or only text) has nothing
 * anybody could see done: it is left out of the count rather than shown done
 * from the start or never. A "none" row ("None this week") is never counted.
 *
 * Pure: no reads, no clock. Imported by the overview route and by the pages
 * in the browser, so it imports nothing but the model.
 */

/** What one task needs before it is done. Ids only. */
export type TaskNeeds = {
  /** Sources and checklist items to tick: the ids their `courseProgress` rows key on. */
  tickIds: string[];
  /** Reflection boxes to write in, by prompt id. */
  promptIds: string[];
  /** Written answers to send, by block id. */
  answerIds: string[];
  /** What a later page decides how to finish, by block id: never done while any is here. */
  unseenIds: string[];
};

/** What a page knows of the reader's own week. */
export type DoneState = {
  /** The reader's own tick on a source or a checklist item. */
  isTicked: (itemId: string) => boolean;
  /** The reader has written something in this reflection box. */
  isWritten: (promptId: string) => boolean;
  /** The reader has sent this written answer. */
  isSent: (answerId: string) => boolean;
};

/** The blocks no page can see finished yet. Each later page moves its kind out of here. */
const UNSEEN_TYPES: ReadonlySet<WeekBlock["type"]> = new Set(["chooseOne", "cases", "fillIn"]);

function addOnce(list: string[], seen: Set<string>, id: string): void {
  if (seen.has(id)) return;
  seen.add(id);
  list.push(id);
}

/** One block's needs, into the lists. */
function addBlockNeeds(block: WeekBlock, needs: TaskNeeds, seen: Set<string>): void {
  if (block.type === "source") addOnce(needs.tickIds, seen, block.id);
  else if (block.type === "checklist") for (const item of block.items) addOnce(needs.tickIds, seen, item.id);
  else if (block.type === "reflection") for (const prompt of block.prompts) addOnce(needs.promptIds, seen, prompt.id);
  else if (block.type === "writtenAnswer") addOnce(needs.answerIds, seen, block.id);
  else if (UNSEEN_TYPES.has(block.type)) addOnce(needs.unseenIds, seen, block.id);
}

/** Every block of a week by id, a part's own blocks included. */
function blocksById(blocks: readonly WeekBlock[]): Map<string, WeekBlock> {
  const out = new Map<string, WeekBlock>();
  for (const block of blocks) {
    out.set(block.id, block);
    if (block.type === "part") for (const child of block.blocks) out.set(child.id, child);
  }
  return out;
}

/** What one This week task needs, from the week's blocks. */
export function taskNeeds(blocks: readonly WeekBlock[], row: Extract<ThisWeekRow, { type: "task" }>): TaskNeeds {
  const byId = blocksById(blocks);
  const needs: TaskNeeds = { tickIds: [], promptIds: [], answerIds: [], unseenIds: [] };
  const seen = new Set<string>();
  for (const id of row.covers) {
    const block = byId.get(id);
    if (!block) continue;
    if (block.type === "part") for (const child of block.blocks) addBlockNeeds(child, needs, seen);
    else addBlockNeeds(block, needs, seen);
  }
  return needs;
}

/** Whether a task with these needs is counted at all: it has something somebody could finish. */
export function isCounted(needs: TaskNeeds): boolean {
  return needs.tickIds.length + needs.promptIds.length + needs.answerIds.length + needs.unseenIds.length > 0;
}

/** Is a task with these needs done, for this reader? */
export function taskDone(needs: TaskNeeds, state: DoneState): boolean {
  if (!isCounted(needs) || needs.unseenIds.length > 0) return false;
  return (
    needs.tickIds.every((id) => state.isTicked(id)) &&
    needs.promptIds.every((id) => state.isWritten(id)) &&
    needs.answerIds.every((id) => state.isSent(id))
  );
}

/** "N of M done" for a week's tasks: M counts only the tasks somebody could finish. */
export function tasksDone(all: readonly TaskNeeds[], state: DoneState): { done: number; of: number } {
  const counted = all.filter(isCounted);
  return { done: counted.filter((needs) => taskDone(needs, state)).length, of: counted.length };
}

/**
 * A task as the overview payload hands it (`OverviewThisWeekRow`): its needs,
 * the reflection boxes the reader had written in and the written answers
 * they had sent when the page loaded. The pages that count a week without
 * drawing it (the programme home, Home) ask these two with the reader's own
 * live ticks.
 */
export type HandedTask = { needs: TaskNeeds; written: readonly string[]; sent: readonly string[] };

/** Is a task, as the overview hands it, done for this reader? */
export function handedTaskDone(task: HandedTask, isTicked: (itemId: string) => boolean): boolean {
  return taskDone(task.needs, {
    isTicked,
    isWritten: (promptId) => task.written.includes(promptId),
    isSent: (answerId) => task.sent.includes(answerId),
  });
}

/** "N of M done" for tasks as the overview hands them. */
export function handedTasksDone(
  tasks: readonly HandedTask[],
  isTicked: (itemId: string) => boolean,
): { done: number; of: number } {
  const counted = tasks.filter((task) => isCounted(task.needs));
  return { done: counted.filter((task) => handedTaskDone(task, isTicked)).length, of: counted.length };
}

/** A part's own needs: what its Done chip and its place in "On this page" ask. */
export function partNeeds(part: PartBlock): TaskNeeds {
  const needs: TaskNeeds = { tickIds: [], promptIds: [], answerIds: [], unseenIds: [] };
  const seen = new Set<string>();
  for (const child of part.blocks) addBlockNeeds(child, needs, seen);
  return needs;
}

/** A week's This week block, or null. */
export function thisWeekOf(blocks: readonly WeekBlock[]): ThisWeekBlock | null {
  return (blocks.find((block) => block.type === "thisWeek") as ThisWeekBlock | undefined) ?? null;
}

/** Every task of a block week, with its needs, in This week's order. */
export function weekTaskNeeds(blocks: readonly WeekBlock[]): TaskNeeds[] {
  return (thisWeekOf(blocks)?.rows ?? [])
    .filter((row): row is Extract<ThisWeekRow, { type: "task" }> => row.type === "task")
    .map((row) => taskNeeds(blocks, row));
}

/**
 * What a task is about, for the programme page's short line ("Parts 1 to
 * 3", "Your written answer", "Your case talk", board wk-programme): the
 * written answer when it covers one (or a single part holding one), the talk
 * when it covers a Cases block, otherwise the numbers of the parts it covers
 * (part N is the Nth part of the week), or nothing to say.
 */
export type TaskSubject =
  | { kind: "writtenAnswer" }
  | { kind: "talk" }
  | { kind: "parts"; numbers: number[] }
  | { kind: "other" };

export function taskSubject(blocks: readonly WeekBlock[], row: Extract<ThisWeekRow, { type: "task" }>): TaskSubject {
  const byId = blocksById(blocks);
  const covered = row.covers.map((id) => byId.get(id)).filter((block): block is WeekBlock => block !== undefined);
  if (covered.some((block) => block.type === "cases")) return { kind: "talk" };
  if (covered.some((block) => block.type === "writtenAnswer")) return { kind: "writtenAnswer" };
  const parts = covered.filter((block): block is PartBlock => block.type === "part");
  if (parts.length === 1 && parts[0].blocks.some((child) => child.type === "writtenAnswer")) return { kind: "writtenAnswer" };
  if (parts.length === 1 && parts[0].blocks.some((child) => child.type === "cases")) return { kind: "talk" };
  if (parts.length > 0) {
    const order = partsOf(blocks).map((part) => part.id);
    const numbers = parts
      .map((part) => order.indexOf(part.id) + 1)
      .filter((n) => n >= 1)
      .sort((a, b) => a - b);
    return numbers.length > 0 ? { kind: "parts", numbers: [...new Set(numbers)] } : { kind: "other" };
  }
  return { kind: "other" };
}
