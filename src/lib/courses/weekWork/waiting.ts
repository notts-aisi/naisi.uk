import { drawOf, keyingChooseOne } from "../packsAndCases/model";
import type { WeekBlock } from "../weekBlocks/model";
import { titleWord } from "../packsAndCases/words";
import { handedTaskDone, isCounted, taskDone, type DoneState, type HandedTask, type TaskNeeds } from "../weekBlocks/progress";

/**
 * WAITING ON THE FACILITATOR'S SLIP: the one place that decides whether a
 * part of somebody's week waits on their facilitator, and what follows from
 * it for every page, count and reminder.
 *
 * A PART WAITS when the facilitator gives it out (it is in the week's draw,
 * `drawOf`: a Choose one given out with packs in it, a talk given out with
 * cases in it) and this person has not been given theirs: no pack in that
 * Choose one, no case in that talk. A pathway the person picks themself never
 * waits (it is theirs to pick), and the case that follows it waits only once
 * they have picked. Nothing about it is stored: it is read
 * from the week's blocks and the person's own records every time.
 *
 * WHAT FOLLOWS, and what does not:
 *  - DONE DOES NOT CHANGE. `weekDone` is exactly as strict as it was:
 *    somebody waiting on a pathway is not done, so nothing ever reads done
 *    and later flips back when the slip arrives. Certificates and who
 *    finished count attendance and never read this.
 *  - A TASK WAITS only when the slip is the one thing left in it
 *    (`taskWaitsOn`); until then it is open, as it always was. Where its row
 *    is drawn (the week page's This week, the programme page's This week),
 *    a task that waits says "Waiting" in place of not done.
 *  - NO COUNT CHANGES. Every "N of M done" a member or staff reads counts
 *    every task, a waiting one as not done, exactly as before, so no count
 *    ever reads complete and then goes back to less when the slip arrives.
 *  - NOBODY IS CHASED FOR IT. A reminder or a Remind never lists a part that
 *    waits (`withoutWaiting`, read by `weekLeft`), and somebody with a part
 *    waiting and nothing else on that very list (`nothingLeftButSlips`,
 *    `weekEmails/model.ts`) is not reminded about the week at all.
 *  - STAFF PAGES say "Waiting" where all that is left would be done once
 *    given (`onlyWaitingLeft`, `./model.ts`).
 *
 * A page that cannot know which case somebody has (it leaves `caseOf` out)
 * never says a talk waits, so it says what it said before.
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

/** What a person has of the parts a facilitator gives out, as a page knows it (`caseOf` left out: no talk waits). */
export type HasState = Pick<DoneState, "packOf" | "caseOf">;

/** The parts of a week a facilitator gives out, by kind, each with the word a member's page names it by. */
export type GivenOut = {
  /** The Choose ones a facilitator gives out, each with its word ("pathway", "plan", "pack"). */
  packs: ReadonlyArray<{ id: string; word: string }>;
  /**
   * The talks with cases a facilitator gives out, each with the Choose one
   * the person picks themself whose pack its cases follow (`picksFirst`), or
   * null when its cases follow a pack given out, or no pack.
   */
  cases: ReadonlyArray<{ id: string; picksFirst: string | null }>;
};

/** Nothing given out: a week no facilitator hands anything out for. */
export const NOTHING_GIVEN_OUT: GivenOut = { packs: [], cases: [] };

/** A Choose one's title as a word inside a sentence: "pathway", "plan", "pack": the one the week page's "Your pathway" says. */
export const packWordOf = titleWord;

/** The parts of a week a facilitator gives out (the week's draw). */
export function givenOutOf(blocks: readonly WeekBlock[]): GivenOut {
  const draw = drawOf(blocks);
  return {
    packs: draw.packs.map((block) => ({ id: block.id, word: packWordOf(block.title) })),
    cases: draw.cases.map((block) => {
      const keying = keyingChooseOne(blocks, block);
      return { id: block.id, picksFirst: keying && keying.givenBy !== "facilitator" ? keying.id : null };
    }),
  };
}

/** One part that waits on the facilitator's slip: a Choose one's pack (with its word) or a talk's case. */
export type WaitingPart = { kind: "pack"; id: string; word: string } | { kind: "case"; id: string };

/**
 * THE ONE DECISION: the parts of this person's week that wait on their
 * facilitator's slip, in the week's order (packs first, then cases, as the
 * draw hands them out). Empty for a week that gives nothing out, and for
 * somebody who has everything given out to them.
 */
export function waitingParts(given: GivenOut, has: HasState): WaitingPart[] {
  const packOf = has.packOf ?? (() => null);
  const out: WaitingPart[] = [];
  for (const pack of given.packs) if (packOf(pack.id) === null) out.push({ kind: "pack", id: pack.id, word: pack.word });
  if (has.caseOf) {
    const caseOf = has.caseOf;
    for (const talk of given.cases) {
      // A case that follows a pathway the person picks waits on the facilitator only once they have picked it:
      // until then it is theirs to move (the pick), never the facilitator's.
      if (talk.picksFirst !== null && packOf(talk.picksFirst) === null) continue;
      if (caseOf(talk.id) === null) out.push({ kind: "case", id: talk.id });
    }
  }
  return out;
}

/** The ids of the parts that wait, for the questions below. */
export function waitingIdsOf(parts: readonly WaitingPart[]): ReadonlySet<string> {
  return new Set(parts.map((part) => part.id));
}

/**
 * Every part that waits among a task's own, in the task's order (its Choose
 * ones, then its talks): what the task holds that waits, whatever else of it
 * is done. Not whether the task waits: that is `taskWaitsOn`.
 */
export function waitingPartsIn(needs: TaskNeeds, parts: readonly WaitingPart[]): WaitingPart[] {
  const out: WaitingPart[] = [];
  for (const id of [...needs.chooseOneIds, ...needs.talkIds]) {
    const part = parts.find((each) => each.id === id);
    if (part && !out.includes(part)) out.push(part);
  }
  return out;
}

/**
 * A TASK WAITS only when the slip is the one thing missing from it: it holds
 * a part that waits, and everything else in it is done (`taskDone` of the
 * task with its waiting parts taken out; a task with nothing else in it
 * waits from the start). Until then it is open, counted and shown as it
 * always was, so nothing reads done and then goes back to less: its readings
 * and boxes are still the person's to do, and are still chased. Returns the
 * part it waits on, or null.
 */
export function taskWaitsOn(needs: TaskNeeds, parts: readonly WaitingPart[], state: DoneState): WaitingPart | null {
  const own = waitingPartsIn(needs, parts);
  if (own.length === 0) return null;
  const rest = withoutWaiting([needs], own)[0];
  return !isCounted(rest) || taskDone(rest, state) ? own[0] : null;
}

/** The state a handed task is counted against, with the reader's own live ticks. */
function handedState(task: HandedTask, isTicked: (itemId: string) => boolean): DoneState {
  return {
    isTicked,
    isWritten: (boxId) => task.written.includes(boxId),
    isSent: (answerId) => task.sent.includes(answerId),
    packOf: (chooseOneId) => task.packs?.[chooseOneId] ?? null,
    isReady: (talkId) => task.ready?.includes(talkId) ?? false,
  };
}

/**
 * Whether a task as the overview hands it waits, with the reader's live
 * ticks (`taskWaitsOn`, over every part of it the server said waits): the
 * part its row names, or null. The programme page draws the same row as the
 * week page from it.
 */
export function handedTaskWaitsOn(task: HandedTask, isTicked: (itemId: string) => boolean): WaitingPart | null {
  const parts = task.waiting ?? [];
  if (parts.length === 0) return null;
  return taskWaitsOn(task.needs, parts, handedState(task, isTicked));
}

/**
 * THE LIST OF WEEKS' "WAITING": a week where everything left is a task that
 * waits (`handedTaskWaitsOn`), and at least one does. Read only for the state
 * word: the count beside the week is every task, as it always was.
 */
export function onlyWaitingTasksLeft(tasks: readonly HandedTask[], isTicked: (itemId: string) => boolean): boolean {
  const open = tasks.filter((task) => isCounted(task.needs) && !handedTaskDone(task, isTicked));
  return open.length > 0 && open.every((task) => handedTaskWaitsOn(task, isTicked) !== null);
}

/** A pack no Choose one holds, standing in for one not given yet when done is asked as if it were. */
const STAND_IN = "\u0000given:";

/**
 * The state as it would be once every waiting part is given: a stand-in pack
 * in each waiting Choose one, ticked. Only for `onlyWaitingLeft`
 * (`./model.ts`, beside the done it asks); never shown, never stored.
 */
export function asIfGiven<S extends Pick<DoneState, "isTicked" | "packOf" | "isWritten" | "isSent">>(state: S, parts: readonly WaitingPart[]): S {
  const waiting = waitingIdsOf(parts);
  const packOf = state.packOf ?? (() => null);
  return {
    ...state,
    packOf: (id: string) => packOf(id) ?? (waiting.has(id) ? `${STAND_IN}${id}` : null),
    isTicked: (id: string) => id.startsWith(STAND_IN) || state.isTicked(id),
  };
}

/**
 * THE TASKS AS A REMINDER ASKS THEM: each task with the parts that wait taken
 * out of it, so what is left of the week (`weekLeft`, the check's lines)
 * never names a pack or a talk the person cannot do anything about. Only
 * those ids go: a task's readings, steps and boxes stay. With nothing
 * waiting, the tasks as they are.
 */
export function withoutWaiting(tasks: readonly TaskNeeds[], parts: readonly WaitingPart[]): TaskNeeds[] {
  if (parts.length === 0) return [...tasks];
  const waiting = waitingIdsOf(parts);
  return tasks.map((needs) => ({
    ...needs,
    chooseOneIds: needs.chooseOneIds.filter((id) => !waiting.has(id)),
    talkIds: needs.talkIds.filter((id) => !waiting.has(id)),
  }));
}

/** The parts of this person's week that wait, from the week's blocks and what they have. */
export function waitingOf(blocks: readonly WeekBlock[], has: HasState): WaitingPart[] {
  return waitingParts(givenOutOf(blocks), has);
}
