import { allBlocks, type WeekBlock } from "../weekBlocks/model";
import type { TaskNeeds } from "../weekBlocks/progress";
import {
  personWeekProgress,
  weekDoneNeeds,
  type CheckState,
  type DoneTimes,
  type PersonWeekProgress,
  type WeekDue,
} from "../weekWork/model";
import { DONE, DONE_LATE, DONE_ON_TIME, JOINED_LATE, NOT_STARTED, personWeekWords } from "../weekWork/words";

/**
 * WHERE ONE WEEK'S WORK STANDS FOR A GROUP, as arithmetic: the week's card on
 * a group's page (who has done the week, each piece of it, who is late and
 * by how much) and who a Remind about that week reaches.
 *
 * NOTHING HERE DECIDES DONE OR LATE. The week is done by the one meaning
 * every page uses (`weekDone`, through `personWeekProgress`), its words are
 * `personWeekWords` (so a person's cell says what This week's work says of
 * them), and late is a time against the session the person was due at
 * (`WeekDue`, `src/lib/courses/weekWork/sessionDue.ts`). A piece of the week
 * (its readings, its reflection, its written answer) is asked of exactly the
 * ids done asks about (`weekDoneNeeds`), so a person whose every piece is
 * done is a person whose week is done, unless the old Submit made it done
 * first.
 *
 * ONE COUNT. The bars, the filter chips, "4 of 6 have done week 1" and the
 * table all count the same rows (`countBuckets`), so two numbers on one page
 * can never disagree.
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

// ---------------------------------------------------------------------------
// The pieces a week is split into
// ---------------------------------------------------------------------------

/** One piece of a week, as the card's bars and the table's columns split it. */
export type PieceKey = "readings" | "steps" | "reflection" | "boxes" | "written";

/** Where one person's week, or one piece of it, stands. */
export type Bucket = "done-on-time" | "done-late" | "done" | "started" | "not-started" | "joined-late";

/** The buckets in the order the bars draw them. */
export const BUCKETS: readonly Bucket[] = ["done-on-time", "done-late", "done", "started", "not-started", "joined-late"];

/** Whether a bucket is one of the three ways of being done. */
export function isDoneBucket(bucket: Bucket): boolean {
  return bucket === "done-on-time" || bucket === "done-late" || bucket === "done";
}

/** One piece of a week, and the ids that make it up. */
export type WeekPiece = {
  key: PieceKey;
  /** Readings and steps: the ids ticked. Reflection and boxes: the boxes. Written: the answers. */
  ids: string[];
  /** Readings only: each Choose one whose pack's reading counts as one reading. */
  chooseOneIds: string[];
  /** Boxes only: the fill-in block's own title ("My action plan"), or "". */
  title: string;
};

/**
 * THE PIECES OF A WEEK, in page order of kind, each only when the week asks
 * for it: the readings (sources, and each pack's reading), the steps to
 * tick, the reflection, the fill-in boxes and the written answer. Their ids
 * are the ones done asks about (`weekDoneNeeds`).
 */
export function weekPiecesOf(blocks: readonly WeekBlock[], tasks: readonly TaskNeeds[], asks?: TaskNeeds): WeekPiece[] {
  const needs = weekDoneNeeds(tasks, asks);
  const everything = allBlocks(blocks);
  const stepIds = new Set(everything.flatMap((block) => (block.type === "checklist" ? block.items.map((item) => item.id) : [])));
  const fillIn = everything.find((block) => block.type === "fillIn");
  const pieces: WeekPiece[] = [];
  const readings = needs.tickIds.filter((id) => !stepIds.has(id));
  const steps = needs.tickIds.filter((id) => stepIds.has(id));
  if (readings.length + needs.chooseOneIds.length > 0) {
    pieces.push({ key: "readings", ids: readings, chooseOneIds: needs.chooseOneIds, title: "" });
  }
  if (steps.length > 0) pieces.push({ key: "steps", ids: steps, chooseOneIds: [], title: "" });
  if (needs.promptIds.length > 0) pieces.push({ key: "reflection", ids: needs.promptIds, chooseOneIds: [], title: "" });
  if (needs.fillInIds.length > 0) {
    pieces.push({ key: "boxes", ids: needs.fillInIds, chooseOneIds: [], title: fillIn?.type === "fillIn" ? fillIn.title.trim() : "" });
  }
  if (needs.answerIds.length > 0) pieces.push({ key: "written", ids: needs.answerIds, chooseOneIds: [], title: "" });
  return pieces;
}

/** What is read of one person's week: what they did and when (the check's state, and each thing's time). */
export type PersonFacts = {
  state: CheckState;
  times: DoneTimes;
  touched: boolean;
  /** When a reflection or fill-in box holding something was last saved. */
  savedAt: (boxId: string) => Date | null;
};

/** Nobody has done anything: what a person with no rows on the week reads as. */
export const NOTHING_DONE: PersonFacts = {
  state: {
    isTicked: () => false,
    isWritten: () => false,
    isSent: () => false,
    packOf: () => null,
    isReady: () => false,
    answerOf: () => ({ words: 0, emptyBoxes: 0 }),
  },
  times: { tickedAt: () => null, writtenAt: () => null, sentAt: () => null, packOf: () => null },
  touched: false,
  savedAt: () => null,
};

/** One piece of one person's week. */
export type PieceState = {
  key: PieceKey;
  bucket: Bucket;
  /** How many of its things are done, of how many. */
  done: number;
  of: number;
  /** When it became done (the latest of its things), or null: not done, or no time to tell it by. */
  doneAt: Date | null;
  /** Reflection and boxes: when the latest of them was saved; null otherwise. */
  savedAt: Date | null;
  /** How long after the session it became done (ms), or null. */
  lateMs: number | null;
  /** A written answer with words in it that is not sent. */
  unsent: boolean;
};

function latestOf(times: ReadonlyArray<Date | null>): Date | null {
  let at: number | null = null;
  for (const time of times) {
    if (!time) return null;
    at = at === null ? time.getTime() : Math.max(at, time.getTime());
  }
  return at === null ? null : new Date(at);
}

function latestKnown(times: ReadonlyArray<Date | null>): Date | null {
  const known = times.filter((time): time is Date => time !== null).map((time) => time.getTime());
  return known.length > 0 ? new Date(Math.max(...known)) : null;
}

/** Done on time, done late, or done with nothing to tell it by: a moment against the session. */
function doneBucket(doneAt: Date | null, due: WeekDue): { bucket: Bucket; lateMs: number | null } {
  if (!doneAt || !due.at) return { bucket: "done", lateMs: null };
  const late = doneAt.getTime() - due.at.getTime();
  return late > 0 ? { bucket: "done-late", lateMs: late } : { bucket: "done-on-time", lateMs: null };
}

/** Where one piece of one person's week stands. */
export function pieceStateOf(piece: WeekPiece, facts: PersonFacts, due: WeekDue): PieceState {
  const { state, times } = facts;
  const packOf = state.packOf ?? (() => null);
  const timePackOf = times.packOf ?? packOf;
  let done = 0;
  let of = 0;
  let unsent = false;
  let touched = false;
  const doneTimes: Array<Date | null> = [];
  const savedTimes: Array<Date | null> = [];
  if (piece.key === "readings" || piece.key === "steps") {
    for (const id of piece.ids) {
      of += 1;
      if (state.isTicked(id)) {
        done += 1;
        doneTimes.push(times.tickedAt(id));
      }
    }
    for (const id of piece.chooseOneIds) {
      of += 1;
      const pack = packOf(id);
      if (pack !== null) touched = true;
      if (pack !== null && state.isTicked(pack)) {
        done += 1;
        const timed = timePackOf(id);
        doneTimes.push(timed === null ? null : times.tickedAt(timed));
      }
    }
  } else if (piece.key === "reflection" || piece.key === "boxes") {
    for (const id of piece.ids) {
      of += 1;
      if (state.isWritten(id)) {
        done += 1;
        doneTimes.push(times.writtenAt(id));
        savedTimes.push(facts.savedAt(id));
      }
    }
  } else {
    for (const id of piece.ids) {
      of += 1;
      const words = state.answerOf(id).words;
      if (state.isSent(id)) {
        done += 1;
        doneTimes.push(times.sentAt(id));
      } else if (words > 0) {
        unsent = true;
      }
      if (words > 0) touched = true;
    }
  }
  const savedAt = latestKnown(savedTimes);
  if (of > 0 && done === of) {
    const doneAt = latestOf(doneTimes);
    const { bucket, lateMs } = doneBucket(doneAt, due);
    return { key: piece.key, bucket, done, of, doneAt, savedAt, lateMs, unsent };
  }
  return {
    key: piece.key,
    bucket: done > 0 || touched ? "started" : "not-started",
    done,
    of,
    doneAt: null,
    savedAt,
    lateMs: null,
    unsent,
  };
}

// ---------------------------------------------------------------------------
// One person's week
// ---------------------------------------------------------------------------

/** One person's week as the card says it. */
export type PersonWeekState = {
  progress: PersonWeekProgress;
  /** `personWeekWords`: "Done on time", "Done late", "2 of 3 done", "Started", "Not started", "Joined late". */
  text: string;
  /** "Late: 3 days after the session", beside "Done late"; "Joined late" beside a week somebody started after joining late; null otherwise. */
  detail: string | null;
  bucket: Bucket;
  /** How long after the session the week became done (ms), or null. */
  lateMs: number | null;
  pieces: PieceState[];
};

/** The bucket a person's week is in, from the very words the page says of it, so the two can never disagree. */
function bucketOfWords(text: string): Bucket {
  if (text === DONE_ON_TIME) return "done-on-time";
  if (text === DONE_LATE) return "done-late";
  if (text === DONE) return "done";
  if (text === JOINED_LATE) return "joined-late";
  if (text === NOT_STARTED) return "not-started";
  return "started";
}

/** Where one person's week stands, and each of its pieces, against the session they were due at. */
export function personWeekStateOf(input: {
  tasks: readonly TaskNeeds[];
  asks?: TaskNeeds;
  pieces: readonly WeekPiece[];
  facts: PersonFacts;
  /** When they first pressed the week's old Submit, or null. */
  submittedAt: Date | null;
  due: WeekDue;
}): PersonWeekState {
  const { tasks, asks, pieces, facts, submittedAt, due } = input;
  const progress = personWeekProgress({ tasks, state: facts.state, times: facts.times, submittedAt, touched: facts.touched, asks });
  const words = personWeekWords({ progress, doneAt: progress.doneAt, due });
  const bucket = bucketOfWords(words.text);
  const lateMs = bucket === "done-late" && progress.doneAt && due.at ? progress.doneAt.getTime() - due.at.getTime() : null;
  // Told their group after the week's session: whatever they have done of it,
  // the row says so, and nothing of theirs in it is ever late.
  const detail = due.by === "joined-late" && bucket !== "joined-late" ? JOINED_LATE : words.detail;
  return {
    progress,
    text: words.text,
    detail,
    bucket,
    lateMs,
    pieces: pieces.map((piece) => pieceStateOf(piece, facts, due)),
  };
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export type BucketCounts = Record<Bucket, number>;

/** How many of the buckets given are in each bucket. The one count every bar and chip is drawn from. */
export function countBuckets(buckets: readonly Bucket[]): BucketCounts {
  const out: BucketCounts = { "done-on-time": 0, "done-late": 0, done: 0, started: 0, "not-started": 0, "joined-late": 0 };
  for (const bucket of buckets) out[bucket] += 1;
  return out;
}

/** How many are done, any way. */
export function doneCount(counts: BucketCounts): number {
  return counts["done-on-time"] + counts["done-late"] + counts.done;
}

/** One filter of the people table, and who it keeps. */
export type WorkFilterKey = "everyone" | "week" | PieceKey | "late";

/** The rows a filter keeps: everyone, those whose week (or one piece) is not done, or those done late. */
export function filterRows<R extends { week: { bucket: Bucket }; pieces: ReadonlyArray<{ key: PieceKey; bucket: Bucket }> }>(
  rows: readonly R[],
  filter: WorkFilterKey,
): R[] {
  if (filter === "everyone") return [...rows];
  if (filter === "week") return rows.filter((row) => !isDoneBucket(row.week.bucket));
  if (filter === "late") return rows.filter((row) => row.week.bucket === "done-late");
  return rows.filter((row) => {
    const piece = row.pieces.find((each) => each.key === filter);
    return piece !== undefined && !isDoneBucket(piece.bucket);
  });
}

// ---------------------------------------------------------------------------
// Who a Remind reaches
// ---------------------------------------------------------------------------

/** Why somebody in the group is not reminded, or null when they are. */
export type NotReminded =
  /** The person pressing Remind. */
  | "presser"
  /** Somebody who facilitates the group: their own work is never the group's business. */
  | "facilitator"
  /** Holding a place Publish has not told them about yet. */
  | "not-told"
  /** Their week is done. */
  | "done"
  /** Told their group after this week's session: nothing of theirs in it is late, and it is never chased. */
  | "joined-late"
  /** No session to be due at: no group. */
  | "no-group"
  /** The programme has closed: nothing can be done in the week now. */
  | "closed";

/**
 * WHETHER ONE PERSON HOLDING A PLACE IN THE GROUP IS REMINDED about a week:
 * never the presser, never somebody who facilitates the group, never
 * somebody Publish has not told, never somebody whose week is done, never
 * somebody told their group after the week's session ("Joined late"), and
 * nobody at all once the programme has closed. Whether they can be emailed
 * (an address, not suppressed) is the notice audience's, asked apart.
 */
export function notRemindedBecause(input: {
  uid: string;
  presserUid: string;
  facilitatorUids: readonly string[];
  told: boolean;
  weekDone: boolean;
  due: WeekDue;
  closed: boolean;
}): NotReminded | null {
  if (input.closed) return "closed";
  if (input.uid === input.presserUid) return "presser";
  if (input.facilitatorUids.includes(input.uid)) return "facilitator";
  if (!input.told) return "not-told";
  if (input.due.by === "joined-late") return "joined-late";
  if (input.due.by === "no-group") return "no-group";
  if (input.weekDone) return "done";
  return null;
}

// ---------------------------------------------------------------------------
// Last reminded
// ---------------------------------------------------------------------------

/** One reminder about a person's week: when, which, and who pressed for one by hand. */
export type LastReminded = {
  /** ISO 8601. */
  at: string;
  how: "3-day" | "1-day" | "hand";
  /** The first name of whoever pressed Remind, for one by hand; null otherwise or when not known. */
  byName: string | null;
};

/** The latest of some reminders, or null for none. */
export function latestReminder(reminders: ReadonlyArray<LastReminded | null>): LastReminded | null {
  let best: LastReminded | null = null;
  for (const each of reminders) {
    if (!each) continue;
    const at = new Date(each.at).getTime();
    if (Number.isNaN(at)) continue;
    if (!best || at > new Date(best.at).getTime()) best = each;
  }
  return best;
}

/** How long a reminder is "in the last day", for the warning before a press. */
export const RECENT_MS = 24 * 60 * 60 * 1000;

/** Whether a reminder went in the last day. */
export function remindedRecently(last: LastReminded | null, now: Date): boolean {
  if (!last) return false;
  const at = new Date(last.at).getTime();
  return !Number.isNaN(at) && now.getTime() - at < RECENT_MS && at <= now.getTime() + 60_000;
}

/**
 * HOW LONG A SECOND PRESS IS THE SAME PRESS: somebody reminded by hand this
 * recently is not emailed again, whoever presses, so a retry of a press (a
 * lost answer, a double tap) sends nothing more. A deliberate second
 * reminder later is the warning's business, not this one's.
 */
export const SAME_PRESS_MS = 2 * 60 * 1000;
