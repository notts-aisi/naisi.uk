import { allBlocks, partsOf, type ChooseOneBlock, type WeekBlock } from "../weekBlocks/model";
import { isCounted, taskDone, type DoneState, type TaskNeeds } from "../weekBlocks/progress";
import type { DueBy, WeekDue } from "./sessionDue";

export type { DueBy, WeekDue };

/**
 * THE WEEK STAYS OPEN: where one person's week of a course written as blocks
 * stands, what the people who read their work are told about it, and what
 * "done" means, in one place for every page and route.
 *
 * NOTHING CLOSES AT THE SESSION. A week takes ticks, words, picks and sends
 * until the programme closes (`./closes.ts`: the end of the London day N days
 * after the run's last session, 14 unless the run says otherwise), and is read
 * only for everybody after that. Pressing Send closes nothing either. Two
 * states (`WeekWorkState`): `open`, and `closed` with when.
 *
 * THE SESSION THEY ARE DUE AT (`WeekDue`, `./sessionDue.ts`) is the one moment
 * everything else is told against:
 *  - LATE is worked out when read, never stored: the time of a change
 *    against the start of that session (`lateBy`; its words, "40 minutes",
 *    "5 hours", "3 days", are `lateWords` in `./words.ts`). With no moment
 *    (joined late, no group, no time set) nothing is late.
 *  - WHO READS AN UNSENT WRITTEN ANSWER (privacy v17, "Changing your work"):
 *    before that session only words they have sent, as last sent; once it has
 *    started everything saved, sent or not (`readableAnswer`, `./versions.ts`,
 *    the one answer). Reflections and fill-in boxes are read as they are
 *    typed, as v17 says, and are not asked about.
 *  - EARLIER VERSIONS are kept at the first change after the session, after a
 *    send before it, and after feedback or a rating (`./versions.ts`).
 *
 * DONE (`weekDone`): every tick This week's tasks count is ticked, the
 * person's own pack among them, and either the week was submitted under the
 * old Submit button (`courseWeekWork.submittedAt`, ever), or every reflection
 * box and fill-in box its tasks count holds something and every written
 * answer its tasks count has been sent. So nobody done under the old rule is
 * ever not done under this one. A week whose This week counts nothing at all
 * asks instead for everything written in it (`weekWritingNeeds`), so a week
 * that asks for writing is never done by default. A week with only things to
 * tick is done once they are ticked; a talk's ready mark counts towards "N of M done"
 * (`progress.ts`) and not towards done. `weekDoneAt` says when it became
 * done, the latest of the moments its needed things were done, for "done on
 * time" and "done late" against the session.
 *
 * REOPEN IS GONE: nothing is locked, so nothing is reopened. The stored
 * reopen facts (`reopenedAt` and the rest) are left as they are and change
 * nothing.
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

// ---------------------------------------------------------------------------
// Where a week stands
// ---------------------------------------------------------------------------

/** Where one person's week stands: open until the programme closes, then closed. */
export type WeekWorkState =
  | {
      kind: "open";
      /** The session they are due at this week. */
      due: WeekDue;
      /** When the programme closes, or null when it never closes by the clock. */
      closesAt: Date | null;
      /** When they first pressed the week's old Submit, or null. */
      submittedAt: Date | null;
    }
  | { kind: "closed"; at: Date; due: WeekDue; submittedAt: Date | null };

/** The stored half (`courseWeekWork`), read: when the week was submitted under the old button, if ever. */
export type WeekWorkFacts = {
  submittedAt: Date | null;
  firstSubmittedAt: Date | null;
};

/** When they pressed the week's old Submit, the first time (a reopen since changes nothing), or null. */
export function submittedOnce(facts: WeekWorkFacts | null): Date | null {
  return facts?.firstSubmittedAt ?? facts?.submittedAt ?? null;
}

/** Whether the programme has closed for work by `now`. A programme with no close never has. */
export function workIsClosed(closesAt: Date | null, now: Date): boolean {
  return closesAt !== null && now.getTime() >= closesAt.getTime();
}

/** Where a week stands for one person at `now`. */
export function weekWorkState(input: { due: WeekDue; closesAt: Date | null; facts: WeekWorkFacts | null; now: Date }): WeekWorkState {
  const submittedAt = submittedOnce(input.facts);
  if (input.closesAt && workIsClosed(input.closesAt, input.now)) {
    return { kind: "closed", at: input.closesAt, due: input.due, submittedAt };
  }
  return { kind: "open", due: input.due, closesAt: input.closesAt, submittedAt };
}

/** Whether the week takes ticks, words, picks and sends: until the programme closes. */
export function weekTakesWork(state: WeekWorkState): boolean {
  return state.kind === "open";
}

/** Whether the session they are due at has started by `now`; never, with no session. */
export function sessionHasStarted(due: WeekDue, now: Date): boolean {
  return due.at !== null && now.getTime() >= due.at.getTime();
}

/**
 * HOW LATE SOMETHING DONE AT `at` WAS: milliseconds after the start of the
 * session they were due at, or null when it was not after it (or there is no
 * such session, or nothing was done). Worked out when read, never stored.
 */
export function lateBy(at: Date | null, due: WeekDue): number | null {
  if (!at || due.at === null) return null;
  const after = at.getTime() - due.at.getTime();
  return after > 0 ? after : null;
}

/**
 * "AFTER ITS DEADLINE" (staff only): a written answer first sent after its
 * block's own deadline (`dueMoment` with the block's rule: often the end of
 * the day before the session), but before the session itself. Sent after the
 * session, it is late instead; with no session moment, it is neither.
 */
export function afterItsDeadline(firstSentAt: Date | null, deadline: Date | null, due: WeekDue): boolean {
  if (!firstSentAt || !deadline || due.at === null) return false;
  return firstSentAt.getTime() > deadline.getTime() && firstSentAt.getTime() < due.at.getTime();
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

/** Whether a week asks for anything written (a reflection, fill-in boxes, a written answer), and so has a Submit. */
export function weekAsksForWriting(blocks: readonly WeekBlock[]): boolean {
  return allBlocks(blocks).some(
    (block) => block.type === "reflection" || block.type === "fillIn" || block.type === "writtenAnswer",
  );
}

/** Every id of one kind This week's tasks count, each once. */
function counted(tasks: readonly TaskNeeds[], kind: "tickIds" | "chooseOneIds" | "promptIds" | "fillInIds" | "answerIds"): string[] {
  return [...new Set(tasks.filter(isCounted).flatMap((needs) => needs[kind]))];
}

/**
 * EVERYTHING A WEEK ASKS TO BE WRITTEN, whatever its tasks cover: each
 * reflection box, each fill-in box and each written answer in it. What done
 * asks of a week whose This week counts nothing at all (a week with no This
 * week block), so a week that asks for writing is never done by default.
 */
export function weekWritingNeeds(blocks: readonly WeekBlock[]): TaskNeeds {
  const needs: TaskNeeds = { tickIds: [], promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] };
  for (const block of allBlocks(blocks)) {
    if (block.type === "reflection") needs.promptIds.push(...block.prompts.map((prompt) => prompt.id));
    else if (block.type === "fillIn") needs.fillInIds.push(...block.groups.flatMap((group) => group.boxes.map((box) => box.id)));
    else if (block.type === "writtenAnswer") needs.answerIds.push(block.id);
  }
  return needs;
}

/** The writing done asks for: what the tasks count, or, when they count nothing at all, everything the week asks to be written. */
function writingAsked(tasks: readonly TaskNeeds[], asks: TaskNeeds | undefined): readonly TaskNeeds[] {
  return tasks.some(isCounted) || !asks ? tasks : [asks];
}

/**
 * THE WEEK IS DONE: every tick its tasks count ticked, the person's own pack
 * among them, and either it was submitted under the old Submit button
 * (`submitted`, ever: a reopen since changes nothing) or every reflection box
 * and fill-in box its tasks count holds something and every written answer
 * its tasks count has been sent. A week with nothing written to count needs
 * only its ticks; a week with nothing to count reads as done, so it is never
 * "not done". Nobody done under the old rule (submitted, where the week asked
 * for anything written, and every counted tick ticked) is not done under this
 * one.
 */
export function weekDone(input: {
  tasks: readonly TaskNeeds[];
  state: Pick<DoneState, "isTicked" | "packOf" | "isWritten" | "isSent">;
  submitted: boolean;
  /** Everything the week asks to be written (`weekWritingNeeds`), asked when its tasks count nothing at all. */
  asks?: TaskNeeds;
}): boolean {
  const { tasks, state, submitted } = input;
  const writing = writingAsked(tasks, input.asks);
  const packOf = state.packOf ?? (() => null);
  const ticked =
    counted(tasks, "tickIds").every((id) => state.isTicked(id)) &&
    counted(tasks, "chooseOneIds").every((id) => {
      const pack = packOf(id);
      return pack !== null && state.isTicked(pack);
    });
  if (!ticked) return false;
  if (submitted) return true;
  return (
    counted(writing, "promptIds").every((id) => state.isWritten(id)) &&
    counted(writing, "fillInIds").every((id) => state.isWritten(id)) &&
    counted(writing, "answerIds").every((id) => state.isSent(id))
  );
}

/** When each thing a week counts was done, for `weekDoneAt`: null for not done. */
export type DoneTimes = {
  /** When this reading or step was ticked (its tick's own time). */
  tickedAt: (itemId: string) => Date | null;
  /** When this reflection box or fill-in box first held something. */
  writtenAt: (boxId: string) => Date | null;
  /** When this written answer was first sent. */
  sentAt: (answerId: string) => Date | null;
  /** The person's pack in this Choose one, or null. */
  packOf?: (chooseOneId: string) => string | null;
};

function latest(times: ReadonlyArray<Date | null>): { all: boolean; at: number | null } {
  let at: number | null = null;
  for (const time of times) {
    if (!time) return { all: false, at: null };
    at = at === null ? time.getTime() : Math.max(at, time.getTime());
  }
  return { all: true, at };
}

/**
 * WHEN THE WEEK BECAME DONE: the latest of the moments its needed things were
 * done (each tick, the pack's reading, and either the old Submit or each box
 * written and each answer sent, whichever made it done first). Null while it
 * is not done, and for a week with nothing to count. Against the session they
 * were due at, it says done on time or done late.
 */
export function weekDoneAt(input: { tasks: readonly TaskNeeds[]; times: DoneTimes; submittedAt: Date | null; asks?: TaskNeeds }): Date | null {
  const { tasks, times, submittedAt } = input;
  const writing = writingAsked(tasks, input.asks);
  const packOf = times.packOf ?? (() => null);
  const ticks = latest([
    ...counted(tasks, "tickIds").map((id) => times.tickedAt(id)),
    ...counted(tasks, "chooseOneIds").map((id) => {
      const pack = packOf(id);
      return pack === null ? null : times.tickedAt(pack);
    }),
  ]);
  if (!ticks.all) return null;
  const written = latest([
    ...counted(writing, "promptIds").map((id) => times.writtenAt(id)),
    ...counted(writing, "fillInIds").map((id) => times.writtenAt(id)),
    ...counted(writing, "answerIds").map((id) => times.sentAt(id)),
  ]);
  const ways = [submittedAt?.getTime() ?? null, written.all ? written.at : null].filter((at): at is number => at !== null);
  const writtenNeedsNothing = written.all && written.at === null;
  if (ways.length === 0 && !writtenNeedsNothing) return null;
  const by = ways.length > 0 && !writtenNeedsNothing ? Math.min(...ways) : null;
  const at = [ticks.at, by].filter((value): value is number => value !== null);
  return at.length > 0 ? new Date(Math.max(...at)) : null;
}

/**
 * ONE PERSON'S WEEK, AS EVERY PAGE THAT LISTS PEOPLE SAYS IT (the group's
 * This week's work, the Coursework tab): done or not and since when, how many
 * of This week's tasks are done, and whether they have started anything.
 */
export type PersonWeekProgress = {
  /** "N of M done", as the person's own page counts it. */
  done: number;
  of: number;
  /** `weekDone`. */
  weekDone: boolean;
  /** When it became done (`weekDoneAt`), or null: not done, or no times to tell it by. */
  doneAt: Date | null;
  /** Something ticked, written or picked this week. */
  started: boolean;
};

/** A person's week from what they did, through `taskDone`, the one count. */
export function personWeekProgress(input: {
  tasks: readonly TaskNeeds[];
  state: DoneState;
  /** When each thing was done, for `doneAt`; left out, `doneAt` is null. */
  times?: DoneTimes;
  /** When they first pressed the week's old Submit, or null. */
  submittedAt: Date | null;
  /** Anything of theirs on the week: a tick, a word, a pack picked. */
  touched: boolean;
  /** Everything the week asks to be written (`weekWritingNeeds`), for a week whose tasks count nothing. */
  asks?: TaskNeeds;
}): PersonWeekProgress {
  const countedTasks = input.tasks.filter(isCounted);
  const done = countedTasks.filter((needs) => taskDone(needs, input.state)).length;
  const isDone = weekDone({ tasks: input.tasks, state: input.state, submitted: input.submittedAt !== null, asks: input.asks });
  return {
    done,
    of: countedTasks.length,
    weekDone: isDone,
    doneAt: isDone && input.times ? weekDoneAt({ tasks: input.tasks, times: input.times, submittedAt: input.submittedAt, asks: input.asks }) : null,
    started: input.touched || done > 0,
  };
}

// ---------------------------------------------------------------------------
// The check before Submit
// ---------------------------------------------------------------------------

/** One thing the check names as not done. `blocks`: it stops Submit (over the word limit), with no "Submit anyway". */
export type NotDone =
  | { kind: "readings"; titles: string[] }
  | { kind: "steps"; count: number }
  /** `picked`: they have a pack and its reading is not ticked; `byYou`: the person picks it (otherwise it is given out). */
  | { kind: "pack"; title: string; picked: boolean; byYou: boolean }
  /** `empty`: nothing written in any of its boxes; otherwise some of them. */
  | { kind: "reflection"; partNumber: number | null; empty: boolean }
  | { kind: "boxes"; title: string; empty: number }
  | { kind: "answer"; emptyBoxes: number; boxes: number }
  | { kind: "talk" }
  | { kind: "overLimit"; words: number; limit: number };

/** What the check knows of the reader's own week, beside `DoneState`. */
export type CheckState = DoneState & {
  /** The words in a written answer's box or boxes: the count of words, and how many of its boxes are empty. */
  answerOf: (answerId: string) => { words: number; emptyBoxes: number };
};

/** A Choose one's name for the check (and the week's emails): "pathway", a table's own first header, or "pack". */
export function packNameOf(block: ChooseOneBlock): string {
  const title = block.title.trim();
  return block.form === "table" && /^[A-Za-z][A-Za-z ]{0,24}$/.test(title) ? title.toLowerCase() : "pack";
}

/**
 * WHAT ISN'T DONE, in page order: readings and steps This week's tasks count
 * that are not ticked, the person's pack, each reflection, the fill-in boxes
 * and the written answer left empty, a talk they have not marked themselves
 * ready for, and an answer over its word limit. Empty when everything is
 * done. A week's Submit sends everything else as it is ("Submit anyway"), but
 * never an answer over its limit.
 */
export function weekCheck(blocks: readonly WeekBlock[], tasks: readonly TaskNeeds[], state: CheckState): NotDone[] {
  const everything = allBlocks(blocks);
  const counted = tasks.filter(isCounted);
  const ticks = new Set(counted.flatMap((needs) => needs.tickIds));
  const chooseOnes = new Set(counted.flatMap((needs) => needs.chooseOneIds));
  const talks = new Set(counted.flatMap((needs) => needs.talkIds));
  const partNumber = new Map<string, number>();
  partsOf(blocks).forEach((part, index) => {
    for (const child of part.blocks) partNumber.set(child.id, index + 1);
  });

  const out: NotDone[] = [];
  const readings: string[] = [];
  let steps = 0;
  for (const block of everything) {
    if (block.type === "source" && ticks.has(block.id) && !state.isTicked(block.id)) readings.push(block.title.trim() || "Untitled");
    if (block.type === "checklist") steps += block.items.filter((item) => ticks.has(item.id) && !state.isTicked(item.id)).length;
  }
  if (readings.length > 0) out.push({ kind: "readings", titles: readings });
  if (steps > 0) out.push({ kind: "steps", count: steps });

  for (const block of everything) {
    if (block.type === "chooseOne" && chooseOnes.has(block.id)) {
      const pack = state.packOf ? state.packOf(block.id) : null;
      const byYou = block.givenBy === "fellow";
      if (pack === null) out.push({ kind: "pack", title: packNameOf(block), picked: false, byYou });
      else if (!state.isTicked(pack)) out.push({ kind: "pack", title: packNameOf(block), picked: true, byYou });
    }
  }
  for (const block of everything) {
    if (block.type === "reflection" && block.prompts.some((prompt) => !state.isWritten(prompt.id))) {
      const empty = block.prompts.every((prompt) => !state.isWritten(prompt.id));
      out.push({ kind: "reflection", partNumber: partNumber.get(block.id) ?? null, empty });
    } else if (block.type === "fillIn") {
      const empty = block.groups.flatMap((group) => group.boxes).filter((box) => !state.isWritten(box.id)).length;
      if (empty > 0) out.push({ kind: "boxes", title: block.title.trim(), empty });
    } else if (block.type === "writtenAnswer") {
      const answer = state.answerOf(block.id);
      const boxes = block.boxes.length;
      if (answer.words === 0) out.push({ kind: "answer", emptyBoxes: boxes, boxes });
      else if (boxes > 0 && answer.emptyBoxes > 0) out.push({ kind: "answer", emptyBoxes: answer.emptyBoxes, boxes });
      if (block.words !== null && answer.words > block.words.max) out.push({ kind: "overLimit", words: answer.words, limit: block.words.max });
    } else if (block.type === "cases" && talks.has(block.id) && !(state.isReady ? state.isReady(block.id) : false)) {
      out.push({ kind: "talk" });
    }
  }
  return out;
}

/** Whether the check stops Submit: an answer over its word limit. */
export function checkStopsSubmit(notDone: readonly NotDone[]): boolean {
  return notDone.some((item) => item.kind === "overLimit");
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/**
 * ONE PERSON'S WEEK AS IT TRAVELS TO THEM (the overview payload, the Send and
 * Submit routes' answers): the session they are due at, when the programme
 * closes and whether it has, and when they pressed the week's old Submit.
 * Instants are ISO 8601.
 */
export type WeekWorkWire = {
  /** The start of the session they are due at this week, or null with none; `dueBy` says why. */
  dueAt: string | null;
  dueBy: DueBy;
  /** That session had started when the wire was made: anything added or changed now shows as late. */
  sessionStarted: boolean;
  /** When the programme closes for work, or null when it never closes by the clock. */
  closesAt: string | null;
  /** It has closed: nothing of the week changes any more, for anybody. */
  closed: boolean;
  /** When they first pressed the week's old Submit, or null. Nothing presses it on the page now. */
  submittedAt: string | null;
  /**
   * THE PAGE AS IT WAS BEFORE THE WEEK STAYED OPEN, until it is redrawn: "open"
   * while the programme takes work and "locked" once it has closed. Never
   * "submitted" or "reopened" any more.
   */
  state: "open" | "submitted" | "locked" | "reopened";
  /** When it closed, once closed (the page as it was). */
  lockedAt: string | null;
  /** When it closes, while open (the page as it was). */
  locksAt: string | null;
  /** `dueBy` while open (the page as it was). */
  by: DueBy | null;
  /** Always null: nothing is reopened (the page as it was). */
  reopened: { at: string; byName: string } | null;
};

/** The wire for one state at `now`. */
export function weekWorkWire(state: WeekWorkState, now: Date): WeekWorkWire {
  const iso = (at: Date | null) => (at ? at.toISOString() : null);
  const closedAt = state.kind === "closed" ? state.at : null;
  const closesAt = state.kind === "closed" ? state.at : state.closesAt;
  return {
    dueAt: iso(state.due.at),
    dueBy: state.due.by,
    sessionStarted: sessionHasStarted(state.due, now),
    closesAt: iso(closesAt),
    closed: state.kind === "closed",
    submittedAt: iso(state.submittedAt),
    state: state.kind === "closed" ? "locked" : "open",
    lockedAt: iso(closedAt),
    locksAt: state.kind === "open" ? iso(state.closesAt) : null,
    by: state.kind === "open" ? state.due.by : null,
    reopened: null,
  };
}

/** A state back from its wire, for the page's words. */
export function weekWorkStateOf(wire: WeekWorkWire): WeekWorkState {
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  const due: WeekDue = { at: at(wire.dueAt), by: wire.dueBy };
  const submittedAt = at(wire.submittedAt);
  const closesAt = at(wire.closesAt);
  if (wire.closed && closesAt) return { kind: "closed", at: closesAt, due, submittedAt };
  return { kind: "open", due, closesAt, submittedAt };
}
