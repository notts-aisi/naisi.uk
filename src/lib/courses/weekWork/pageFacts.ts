import { isCounted, type DoneState, type TaskNeeds } from "../weekBlocks/progress";
import { weekDone, type WeekDue, type WeekWorkWire } from "./model";
import type { RestOfWeek } from "./words";

/**
 * WHAT THE PERSON'S OWN WEEK PAGE WORKS OUT FROM WHAT IT WAS HANDED, for its
 * words (`./words.ts`): the session they are due at, back from the wire, and
 * what the rest of the week needs beside one written answer, for the line
 * under Send. Nothing here decides done, late or who reads what: done is
 * `weekDone`, asked as it is everywhere.
 *
 * Pure: no reads, no clock. The page in the browser imports it.
 */

/** The session they are due at, from the week's wire; no session for somebody not taking part. */
export function dueOfWire(work: WeekWorkWire | null): WeekDue {
  if (!work) return { at: null, by: "no-group" };
  return { at: work.dueAt ? new Date(work.dueAt) : null, by: work.dueBy };
}

/** Every id of one kind the tasks count, each once. */
function countedIds(tasks: readonly TaskNeeds[], kind: "tickIds" | "chooseOneIds" | "promptIds" | "fillInIds" | "answerIds"): string[] {
  return [...new Set(tasks.filter(isCounted).flatMap((needs) => needs[kind]))];
}

/**
 * WHAT THE REST OF THE WEEK NEEDS ONCE `answerId` IS SENT, for "Week 1 is
 * done once it’s sent…": null when the week is done already (or sending it
 * would not be what makes it done because it already is); "left" when
 * something else is still to do; otherwise what the rest is: "ticks" (every
 * reading already ticked, nothing else written to count), "done" (other
 * writing, all done) or "nothing" (the answer is all the week asks for).
 * `asks` is everything the week asks to be written (`weekWritingNeeds`), as
 * done asks it of a week whose tasks count nothing.
 */
export function restOfWeekOnceSent(input: {
  tasks: readonly TaskNeeds[];
  asks: TaskNeeds;
  state: Pick<DoneState, "isTicked" | "packOf" | "isWritten" | "isSent">;
  submitted: boolean;
  answerId: string;
}): RestOfWeek | null {
  const { tasks, asks, state, submitted, answerId } = input;
  if (weekDone({ tasks, state, submitted, asks })) return null;
  const sentNow = { ...state, isSent: (id: string) => id === answerId || state.isSent(id) };
  if (!weekDone({ tasks, state: sentNow, submitted, asks })) return "left";
  const writing = tasks.some(isCounted) ? tasks : [asks];
  const otherWriting =
    countedIds(writing, "promptIds").length + countedIds(writing, "fillInIds").length + countedIds(writing, "answerIds").filter((id) => id !== answerId).length;
  if (otherWriting > 0) return "done";
  const ticks = countedIds(tasks, "tickIds").length + countedIds(tasks, "chooseOneIds").length;
  return ticks > 0 ? "ticks" : "nothing";
}

/** The latest of some times, or null when any is missing (not all done) or there are none. */
export function latestOf(times: ReadonlyArray<Date | null>): Date | null {
  let latest: Date | null = null;
  for (const time of times) {
    if (!time) return null;
    if (!latest || time.getTime() > latest.getTime()) latest = time;
  }
  return latest;
}
