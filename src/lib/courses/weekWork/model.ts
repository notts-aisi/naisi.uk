import { allBlocks, partsOf, type ChooseOneBlock, type WeekBlock } from "../weekBlocks/model";
import { isCounted, taskDone, type DoneState, type TaskNeeds } from "../weekBlocks/progress";

/**
 * THE WEEK YOU SUBMIT: where one person's week of a course written as blocks
 * stands, whether the people who read their work may read their written
 * answer, and what "done" means, in one place for every page and route.
 *
 * ONE WEEK, FOUR STATES (`WeekWorkState`):
 *  - `open`: the week saves as they go, and takes every tick and every word;
 *  - `submitted`: they pressed Submit. Everything in the week (ticks, packs,
 *    reflections, boxes, the written answer, a talk's ready mark) is read
 *    only until somebody running the group reopens it;
 *  - `locked`: the group's session that week started before they submitted,
 *    and the week locked with it, as read only as a submitted one;
 *  - `reopened`: somebody running the group reopened it for them. It takes
 *    writing again until they submit it, or the group's next session that
 *    meets after the reopen starts, whichever comes first.
 *
 * WHEN A WEEK LOCKS (`WeekLock`, worked out from the group's own calendar by
 * `./lock.ts`): when the group's session that week starts, or, when that
 * session is cancelled, the group's next session that meets (`dueMoment`'s
 * rule for work due "before" the session, the one pack picks keep). With no
 * moment to lock at (the group's time is not set, its plan does not teach the
 * week, nobody has been told their group yet, or the session started before
 * they were told it) the week locks only when they submit it.
 *
 * READING A WRITTEN ANSWER (privacy v15, "Changing your work"): its words are
 * the writer's until they submit the week; the people who read their work see
 * only that they have started it. Once the week is submitted, or locks first,
 * they may read it. A week reopened is unsent again. An answer sent before
 * weeks were submitted (`firstSentAt` on a week nobody has submitted or
 * reopened) stays readable: it was sent. `workIsReadable` is the one answer,
 * and `tests/course-written-answer-readers.test.mjs` walks the tree for every
 * reader of an answer's words that does not ask it. Reflections and fill-in
 * boxes are read as they are typed, as v15 says, and are not asked about.
 *
 * DONE (`weekDone`): the week is submitted, when it asks for anything
 * written, and every tick it counts is ticked: the readings and checklist
 * steps This week's tasks cover, and the person's own pack. A talk's ready
 * mark counts towards "N of M done" (`progress.ts`) and not towards done. A
 * week with only things to tick has no Submit, and is done once they are
 * ticked; a week with nothing to count is never "not done".
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

/** Why a week locks when it does, or why it does not lock by the clock. */
export type LockBy =
  /** The group's session that week starts. */
  | "session"
  /** The week's own session is cancelled: the group's next session that meets. */
  | "next-session"
  /** No moment to lock at: the group's time is not set, or there is no session to date. */
  | "undated"
  /** The session started before they were told their group: it locks only when they submit. */
  | "joined-late"
  /** No group yet (week 1 before groups go out): it locks only when they submit. */
  | "no-group";

/** When a week locks for one person: the moment, or null with the reason there is none. */
export type WeekLock = { at: Date | null; by: LockBy };

/** The stored half of a week's state (`courseWeekWork`), read. */
export type WeekWorkFacts = {
  submittedAt: Date | null;
  reopenedAt: Date | null;
  reopenedByUid: string;
};

export type WeekWorkState =
  | { kind: "open"; locksAt: Date | null; by: LockBy }
  | { kind: "submitted"; at: Date }
  | { kind: "locked"; at: Date }
  | { kind: "reopened"; at: Date; byUid: string; locksAt: Date | null };

/**
 * Where a week stands for one person at `now`. `relockAfter` answers when
 * the group's next session that meets after an instant starts (null with
 * none to date), which is when a reopened week locks again.
 */
export function weekWorkState(input: {
  facts: WeekWorkFacts | null;
  lock: WeekLock;
  relockAfter: (instant: Date) => Date | null;
  now: Date;
}): WeekWorkState {
  const { facts, lock, relockAfter, now } = input;
  if (facts?.submittedAt) return { kind: "submitted", at: facts.submittedAt };
  if (facts?.reopenedAt) {
    const locksAt = relockAfter(facts.reopenedAt);
    if (locksAt && now.getTime() >= locksAt.getTime()) return { kind: "locked", at: locksAt };
    return { kind: "reopened", at: facts.reopenedAt, byUid: facts.reopenedByUid, locksAt };
  }
  if (lock.at && now.getTime() >= lock.at.getTime()) return { kind: "locked", at: lock.at };
  return { kind: "open", locksAt: lock.at, by: lock.by };
}

/** Whether the week takes writing and ticks: open, or reopened. Submitted and locked weeks are read only. */
export function weekTakesWork(state: WeekWorkState): boolean {
  return state.kind === "open" || state.kind === "reopened";
}

/** Whether the week is shut: submitted, or locked. Somebody running the group may reopen it. */
export function weekIsShut(state: WeekWorkState): boolean {
  return state.kind === "submitted" || state.kind === "locked";
}

/**
 * WHETHER THE PEOPLE WHO READ SOMEBODY'S WORK MAY READ THEIR WRITTEN ANSWER'S
 * WORDS (privacy v15): the week is submitted or locked; or the answer was
 * sent before weeks were submitted and the week has been neither submitted
 * nor reopened since. Never while the week is open or reopened otherwise:
 * then they see only that it is started. The one answer; every reader of an
 * answer's words asks it.
 */
export function workIsReadable(state: WeekWorkState, answer: { firstSentAt: Date | null } | null): boolean {
  if (state.kind === "submitted" || state.kind === "locked") return true;
  return state.kind === "open" && answer?.firstSentAt != null;
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

/** Every tick This week's tasks count: readings and checklist steps, by id, each once. */
function countedTickIds(tasks: readonly TaskNeeds[]): string[] {
  return [...new Set(tasks.filter(isCounted).flatMap((needs) => needs.tickIds))];
}

/** Every Choose one This week's tasks count, by id, each once. */
function countedChooseOnes(tasks: readonly TaskNeeds[]): string[] {
  return [...new Set(tasks.filter(isCounted).flatMap((needs) => needs.chooseOneIds))];
}

/**
 * THE WEEK IS DONE: submitted, when it asks for anything written, and every
 * tick its tasks count ticked, the person's own pack among them. A week with
 * nothing to count reads as done, so it is never "not done".
 */
export function weekDone(input: {
  tasks: readonly TaskNeeds[];
  state: Pick<DoneState, "isTicked" | "packOf">;
  writes: boolean;
  submitted: boolean;
}): boolean {
  const { tasks, state, writes, submitted } = input;
  if (writes && !submitted) return false;
  const packOf = state.packOf ?? (() => null);
  return (
    countedTickIds(tasks).every((id) => state.isTicked(id)) &&
    countedChooseOnes(tasks).every((id) => {
      const pack = packOf(id);
      return pack !== null && state.isTicked(pack);
    })
  );
}

/**
 * ONE PERSON'S WEEK, AS EVERY PAGE THAT LISTS PEOPLE SAYS IT (the group's
 * This week's work, the Coursework tab): submitted, done or not, how many of
 * This week's tasks are done, and whether they have started anything.
 */
export type PersonWeekProgress = {
  /** "N of M done", as the person's own page counts it. */
  done: number;
  of: number;
  /** `weekDone`. */
  weekDone: boolean;
  /** Something ticked, written or picked this week. */
  started: boolean;
};

/** A person's week from what they did, through `taskDone`, the one count. */
export function personWeekProgress(input: {
  tasks: readonly TaskNeeds[];
  state: DoneState;
  writes: boolean;
  submitted: boolean;
  /** Anything of theirs on the week: a tick, a word, a pack picked. */
  touched: boolean;
}): PersonWeekProgress {
  const counted = input.tasks.filter(isCounted);
  const done = counted.filter((needs) => taskDone(needs, input.state)).length;
  return {
    done,
    of: counted.length,
    weekDone: weekDone({ tasks: input.tasks, state: input.state, writes: input.writes, submitted: input.submitted }),
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

/** A Choose one's name for the check: "pathway", a table's own first header, or "pack". */
function packNameOf(block: ChooseOneBlock): string {
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
 * ONE PERSON'S WEEK AS IT TRAVELS TO THEM (the overview payload, the Submit
 * route's answer): its state, when it locks or locked, and who reopened it,
 * by the first name they go by. Instants are ISO 8601.
 */
export type WeekWorkWire = {
  state: WeekWorkState["kind"];
  /** When it was submitted (state `submitted`). */
  submittedAt: string | null;
  /** When it locked (state `locked`). */
  lockedAt: string | null;
  /** When it will lock, while it is open or reopened; null when only Submit locks it. */
  locksAt: string | null;
  /** Why it locks when it does, while it is open. */
  by: LockBy | null;
  /** Who reopened it and when, while it is reopened. */
  reopened: { at: string; byName: string } | null;
};

/** A state back from its wire, for the page's words; `byUid` is not on the wire and reads as "". */
export function weekWorkStateOf(wire: WeekWorkWire): WeekWorkState {
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  switch (wire.state) {
    case "submitted":
      return { kind: "submitted", at: at(wire.submittedAt) ?? new Date(0) };
    case "locked":
      return { kind: "locked", at: at(wire.lockedAt) ?? new Date(0) };
    case "reopened":
      return { kind: "reopened", at: at(wire.reopened?.at ?? null) ?? new Date(0), byUid: "", locksAt: at(wire.locksAt) };
    case "open":
      return { kind: "open", locksAt: at(wire.locksAt), by: wire.by ?? "undated" };
  }
}

/** The wire for one state. `nameOf` gives the first name a uid goes by. */
export function weekWorkWire(state: WeekWorkState, nameOf: (uid: string) => string): WeekWorkWire {
  switch (state.kind) {
    case "submitted":
      return { state: "submitted", submittedAt: state.at.toISOString(), lockedAt: null, locksAt: null, by: null, reopened: null };
    case "locked":
      return { state: "locked", submittedAt: null, lockedAt: state.at.toISOString(), locksAt: null, by: null, reopened: null };
    case "reopened":
      return {
        state: "reopened",
        submittedAt: null,
        lockedAt: null,
        locksAt: state.locksAt ? state.locksAt.toISOString() : null,
        by: null,
        reopened: { at: state.at.toISOString(), byName: nameOf(state.byUid) },
      };
    case "open":
      return { state: "open", submittedAt: null, lockedAt: null, locksAt: state.locksAt ? state.locksAt.toISOString() : null, by: state.by, reopened: null };
  }
}
