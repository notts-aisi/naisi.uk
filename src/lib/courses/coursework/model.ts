import { partWritten, reflectionPartsOf, tickedSourcesOf, type ReflectionPart, type TickedSource } from "@/lib/courses/facilitatorWeek/model";
import type { GroupFromWeek } from "@/lib/firestore/courseEnrolments";
import { isBlockWeek, type WeekBlock, type When, type WordRange } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { weekFillInBoxes, weekWrittenAnswers, type ReadableWeek } from "@/lib/courses/weekBlocks/reader";
import { lateBy, weekAsksForWriting, weekDone, weekDoneAt, weekWritingNeeds, type WeekDue } from "@/lib/courses/weekWork/model";
import type { AnswerState } from "@/lib/courses/writtenAnswers/model";
import type { StaffFeedbackCard } from "@/lib/courses/feedback/model";
import type { PieceFacts } from "@/lib/courses/weekWork/versions";

/**
 * A PROGRAMME'S COURSEWORK, AS ITS LEAD AND ADMINS READ IT (Zach, Fri 30
 * Oct): the Coursework tab (a row per person, a column per week) and the page
 * of one person (everything they wrote, week by week). Pure: every read is
 * done by `./load.ts` after the page's gate, and this file decides who is a
 * row, which week each of them reads and what each cell says.
 *
 * WHO IS A ROW. Everybody who holds a place on the programme now (the People
 * tab's set: `listPlaceHolders`, asked by the loader), in a group or not yet;
 * anybody else placed in one of the run's live groups (a seat made on the
 * run itself, taking part all the same); and every facilitator of one of the
 * run's live groups, marked as facilitating: a facilitator does the group's
 * coursework as themselves, and the lead and admins read it (Zach, Mon 26
 * Oct). Somebody who facilitates and also holds a place is one row, a
 * facilitator's.
 *
 * WHICH GROUP A ROW SITS IN. A fellow's group is shown only where the
 * placement may be shown to the viewer (`placementIsShownTo`, asked by the
 * loader): an admin sees every placement, the lead only those Publish has
 * told. Anybody else sits under "Not in a group yet". A facilitator sits in
 * the group they facilitate.
 *
 * WHICH WEEK A ROW READS. The week the person themselves reads: their
 * group's own copy when Publish has told them their group (or they
 * facilitate it), and the run's own week otherwise, as week 1's door opens it
 * before groups go out (`weekOneDoorFor`). So somebody in no group yet is
 * counted against the run's week 1, where their week 1 work was written.
 *
 * WHAT A CELL SAYS, never a word anybody wrote (Fri 13 Nov 2026): one thing,
 * in words (`cellStateOf`): whether the week is done, by the one meaning of
 * done every page uses (`weekDone`: every tick it counts ticked, the person's
 * own pack among them, and either the old Submit pressed or every box it
 * counts written and every answer it counts sent), on time or late against
 * the session they were due at; "Joined late"; the day a week not begun yet
 * opens; or "Started" or "Not started". The counts it once held (reflection
 * parts written, sources ticked, boxes filled) stay on the cell for the
 * panels under the table and are not drawn: the reading view has them.
 * Beside it, the reader's flags (`./overview.ts`). Survey answers are never
 * read for any of it, and a private note is never a cell.
 *
 * WEEK NOT DONE, a filter: the people with a week that has begun for them (on
 * the calendar of the group whose weeks they read, `reachedOf`) and is not
 * done. A week still to come is not done either, but it puts nobody under the
 * filter.
 */

/** Who is looking: the programme's lead, or an admin. */
export type CourseworkViewer = "lead" | "admin";

/** A week as the tab reads it: its parts with prompts, its ticked sources, its written answer and its boxes. */
export type CourseworkWeek = {
  weekNumber: number;
  title: string;
  parts: ReflectionPart[];
  sources: TickedSource[];
  /**
   * The week's one written answer, or null for a week with none: its range of
   * words and its own deadline's rule where the week says them.
   */
  answer: { id: string; prompt: string; boxes: Array<{ id: string; label: string }>; words?: WordRange | null; due?: When | null } | null;
  /** The week's fill-in boxes, in page order. */
  boxes: Array<{ id: string; heading: string; label: string }>;
  /** This week's tasks, by what each needs (`weekTaskNeeds`), for whether the week is done. */
  tasks: TaskNeeds[];
  /** The week asks for something written. */
  writes: boolean;
  /** Everything the week asks to be written (`weekWritingNeeds`): what done asks when its tasks count nothing. Absent: nothing. */
  asks?: TaskNeeds;
  /**
   * Every question the week asks to be written, in the week's own order: each
   * reflection prompt, each fill-in box and the written answer, as the page of
   * one question across a group steps through them. Absent: none.
   */
  order?: QuestionStep[];
};

/** One question a week asks to be written: a reflection's prompt, a fill-in box or the written answer, by its id. */
export type QuestionStep = { kind: "reflection" | "box" | "answer"; id: string };

/**
 * The questions a week asks, in the week's own order, as the week page asks
 * them: a reflection prompt only inside a part (as `reflectionPartsOf` reads
 * them), each fill-in box, and the week's written answer (`answerId`, the one
 * the coursework pages read). An id once only.
 */
export function questionOrderOf(blocks: readonly WeekBlock[], answerId: string | null): QuestionStep[] {
  const out: QuestionStep[] = [];
  const seen = new Set<string>();
  const add = (kind: QuestionStep["kind"], id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ kind, id });
  };
  const visit = (block: WeekBlock, inPart: boolean) => {
    if (block.type === "reflection") {
      if (inPart) for (const prompt of block.prompts) add("reflection", prompt.id);
    } else if (block.type === "fillIn") {
      for (const group of block.groups) for (const box of group.boxes) add("box", box.id);
    } else if (block.type === "writtenAnswer") {
      if (block.id === answerId) add("answer", block.id);
    }
  };
  for (const block of blocks) {
    if (block.type === "part") for (const child of block.blocks) visit(child, true);
    else visit(block, false);
  }
  return out;
}

/** A stored week, read for the tab: null for a week not written as blocks, which has no coursework here. */
export function courseworkWeekOf(week: (ReadableWeek & { weekNumber: number; title?: string; blocks?: WeekBlock[] }) | null): CourseworkWeek | null {
  if (!week || !isBlockWeek(week)) return null;
  const blocks = (week as { blocks: WeekBlock[] }).blocks;
  const answer = weekWrittenAnswers(week)[0] ?? null;
  return {
    weekNumber: week.weekNumber,
    title: typeof week.title === "string" ? week.title.trim() : "",
    parts: reflectionPartsOf(blocks),
    sources: tickedSourcesOf(week),
    answer: answer ? { id: answer.id, prompt: answer.prompt, boxes: answer.boxes, words: answer.words, due: answer.due } : null,
    boxes: weekFillInBoxes(week).map((box) => ({ id: box.id, heading: box.heading, label: box.label })),
    tasks: weekTaskNeeds(blocks),
    writes: weekAsksForWriting(blocks),
    asks: weekWritingNeeds(blocks),
    order: questionOrderOf(blocks, answer?.id ?? null),
  };
}

/** The Choose ones a week's tasks count, whose pack the person has: what done asks of their records. */
export function chooseOneIdsOf(week: CourseworkWeek | null): string[] {
  return week ? [...new Set(week.tasks.flatMap((needs) => needs.chooseOneIds))] : [];
}

/** Where a person's written answer stands, as a cell says it: "waiting" stands out. */
export type CellAnswerState = "not-started" | "started" | "waiting" | "feedback";

/** A stored answer's state, as the tab says it: a draft is started, sent or opened is waiting. */
export function cellAnswerState(state: AnswerState): CellAnswerState {
  switch (state) {
    case "not-started":
      return "not-started";
    case "draft":
      return "started";
    case "sent":
    case "opened":
      return "waiting";
    case "feedback":
      return "feedback";
  }
}

/** Everything a person wrote on the run, as counts and states: never their words. */
export type PersonWork = {
  /** `${weekNumber} ${promptId}` of every reflection with words in it. */
  reflections: ReadonlySet<string>;
  /** `${weekNumber} ${boxId}` of every fill-in box with words in it. */
  boxes: ReadonlySet<string>;
  /** `${weekNumber} ${answerId}` to where the answer stands. */
  answers: ReadonlyMap<string, AnswerState>;
  /** Item ids of every source ticked. */
  ticked: ReadonlySet<string>;
  /** `workKey` of every written answer ever sent, to when it was first sent: what done asks. Absent, none is. */
  sentAt?: ReadonlyMap<string, Date>;
  /** Item id of every source ticked, to when (`completedAt`); absent, no time is known. */
  tickedAt?: ReadonlyMap<string, Date | null>;
  /** `workKey` of every reflection and fill-in box written, to when it first held something; absent, no time is known. */
  writtenAt?: ReadonlyMap<string, Date | null>;
  /**
   * The pack each Choose one gave them or let them pick, by the Choose one's
   * id: what done asks of a pathway. Read by the tab's loader beside the rest;
   * absent, nobody has a pack.
   */
  packs?: ReadonlyMap<string, string>;
  /**
   * `workKey` of every reflection and fill-in box written, to when its words
   * were last saved (the row's `updatedAt`): what whether it has been read is
   * told against (`readStateOf`). Absent, no time is known.
   */
  savedAt?: ReadonlyMap<string, Date | null>;
  /** `workKey` of every written answer of a week written as blocks, to what its readers may read of it: facts, never words. */
  answerFacts?: ReadonlyMap<string, AnswerFacts>;
};

/**
 * A written answer as its readers may read it (`readableAnswer`), in facts
 * and never words: what the Coursework tab's flags and its list of answers
 * waiting for feedback are worked out from, by the rules the page of one
 * question asks.
 */
export type AnswerFacts = {
  /** Its readers may read it and what they read holds words: it has a read state and takes feedback. */
  readable: boolean;
  /** When the words its readers read were saved; null while it may not be read, or with no time stored. */
  savedAt: Date | null;
  /**
   * When it became readable in the words its readers read: the later of their
   * save, the send of the version read, and, never sent, the start of the
   * session it is read from. What whether it has been read is told against.
   */
  readableSince: Date | null;
  /** When it was first sent; null, never sent. */
  firstSentAt: Date | null;
  /** How long after the session it was due at it was first sent (ms); null when not after it, or never sent. */
  sentLateMs: number | null;
  /** When the session it was due at starts, from which a never-sent answer may be read. */
  sessionStart: Date | null;
  /** Pieces of feedback on it, feedback given before pieces existed among them. */
  pieces: number;
  /** Changed since the newest feedback on it (`changedSinceFeedback`), while it may be read. */
  changed: boolean;
};

export const NO_WORK: PersonWork = { reflections: new Set(), boxes: new Set(), answers: new Map(), ticked: new Set() };

/** The key a person's work is stored under in `PersonWork`. */
export function workKey(weekNumber: number, id: string): string {
  return `${weekNumber} ${id}`;
}

/**
 * The flags beside a cell's state (Fri 13 Nov 2026), each only where it is
 * true, and only for a reader who may read the person's work: never on the
 * reader's own row. Independent of each other.
 *  - `unread`: something of the week its readers may read in full is not read
 *    yet (`readStateOf`, as the page of one question says "Not read yet").
 *  - `noFeedback`: the week's written answer may be read, holds words, and has
 *    no feedback from anyone (`feedbackStateOf` "none").
 *  - `changed`: the person changed it after the newest feedback on it
 *    (`feedbackStateOf` "changed", by `changedSinceFeedback`).
 */
export type CellFlags = { unread: boolean; noFeedback: boolean; changed: boolean };

export const NO_FLAGS: CellFlags = { unread: false, noFeedback: false, changed: false };

/** A week's written answer waiting for feedback, as its cell carries it for the list under the table (`waitingList`). */
export type CellWaiting = {
  /** No feedback from anyone yet, or changed since the newest feedback. */
  kind: "none" | "changed";
  /**
   * ISO 8601, what the list is ordered by: when it was first sent (never
   * sent: when the session it was due at started, since its readers may read
   * it from then), or, changed since feedback, when the words read were saved.
   * Null with no time known.
   */
  at: string | null;
  /** Never sent: read since the session started. */
  notSent: boolean;
  /** First sent after the session it was due at. */
  late: boolean;
  /** The answer itself is not read yet. */
  unread: boolean;
};

/** One cell: a person's week. */
export type CourseworkCell = {
  weekNumber: number;
  /** False for a week the person reads that is not written as blocks: nothing to count. */
  counted: boolean;
  /**
   * The one meaning of done (`weekDone`): every tick it counts ticked, and
   * the old Submit pressed or everything written it counts written and sent.
   * Null for a week not counted.
   */
  done: boolean | null;
  /** ISO 8601: when it became done (`weekDoneAt`); null while not done, or with nothing to tell it by. */
  doneAt: string | null;
  /** How long after the session they were due at it became done (ms): "Done late". Null when on time, or no session. */
  doneLateMs: number | null;
  /** The session they were due at that week (ISO 8601), or null with none; `by` says why ("joined-late": "Joined late"). */
  due: { at: string | null; by: WeekDue["by"] };
  /** The week has begun for them, on the calendar of the group whose weeks they read. */
  reached: boolean;
  /** The civil date the week opens on, on that same calendar (`weekOpensOn`); null with none to tell. */
  opensOn: string | null;
  /** They have done anything in the week: a tick, a reflection, a box, a written answer begun. */
  started: boolean;
  /** Reflection parts written, of the week's parts; null for a week with none. Not drawn: the reading view has it. */
  reflections: { written: number; of: number } | null;
  /** Sources ticked, of the week's ticked sources; null for a week with none. Not drawn. */
  ticks: { ticked: number; of: number } | null;
  /** The written answer's state; null for a week with none. */
  answer: { state: CellAnswerState } | null;
  /** Boxes filled in, of the week's boxes; null for a week with none. Not drawn. */
  boxes: { filled: number; of: number } | null;
  /** The flags beside the state, for a reader who may read the person's work. */
  flags: CellFlags;
  /** The written answer, when it waits for this reader's feedback; null otherwise. */
  waiting: CellWaiting | null;
  /** The reading view of this person and this week (`?week=`). */
  href: string;
};

/** A person, as the loader hands them to the model. */
export type CourseworkPerson = {
  uid: string;
  name: string;
  /** Facilitates a live group of the run: their own coursework, marked as theirs. */
  facilitating: boolean;
  /**
   * The group this viewer is shown them in: a fellow's placement where it
   * may be shown, the group a facilitator facilitates. Null: not in a group
   * yet, to this viewer.
   */
  groupId: string | null;
  /** The group whose copy of each week they read: their told group, or the one they facilitate; null reads the run's own. */
  readsGroupId: string | null;
  /**
   * For somebody moved mid-term, which group's copy each week is read on
   * (`copiesOf` in `src/lib/courses/weekCopy.ts`): the weeks before the move
   * on their old group's. Absent or null for everybody else, who read
   * `readsGroupId` for every week (`readsGroupIdFor`).
   */
  readsCopies?: GroupFromWeek[] | null;
  /** To an admin: placed in a group Publish has not told them about yet. Always false for the lead. */
  notToldYet: boolean;
};

export type CourseworkRow = CourseworkPerson & {
  cells: CourseworkCell[];
  /** A week that has begun for them is not done. */
  notDone: boolean;
  /** A week of theirs was done late. */
  late: boolean;
  /** A week of theirs carries "Not read yet" (to this reader). */
  unread: boolean;
  /** A week of theirs carries "No feedback yet" (to this reader). */
  noFeedback: boolean;
  /** A week of theirs carries "Changed since feedback" (to this reader). */
  changed: boolean;
  /** Their page. */
  href: string;
};

export type CourseworkSection = {
  /** A group's id, or "none" for the people in no group yet. */
  key: string;
  title: string;
  /** The group's facilitators, by name, beside its title; none for the people in no group. */
  facilitators: string[];
  rows: CourseworkRow[];
};

/**
 * What the tab shows, one at a time (Fri 13 Nov 2026): everyone, or the
 * people with a week that has begun and is not done, a week done late, a week
 * with something not read yet, a written answer with no feedback yet, or one
 * changed since feedback.
 */
export const COURSEWORK_SHOWS = ["everyone", "notDone", "late", "unread", "noFeedback", "changed"] as const;
export type CourseworkShow = (typeof COURSEWORK_SHOWS)[number];

/** The tab's filters, as plain links: a group, everybody in no group yet, or everybody; and one of the shows. */
export type CourseworkFilter = { group: string; show: CourseworkShow };

export const NOT_IN_A_GROUP = "none";

/**
 * Each show's word in the address: today's two kept as they were (`?notdone=1`
 * is Week not done, `?waiting=1` is No feedback yet), so an address anybody
 * kept still opens what it opened.
 */
const SHOW_PARAMS: ReadonlyArray<readonly [Exclude<CourseworkShow, "everyone">, string]> = [
  ["notDone", "notdone"],
  ["late", "late"],
  ["unread", "unread"],
  ["noFeedback", "waiting"],
  ["changed", "changed"],
];

/**
 * The filter asked for in the address, read as one the tab knows: an unknown
 * group is everybody, and of the shows asked for, the first in the filters'
 * own order (an address from when two could be on together opens one).
 */
export function readFilter(
  query: { group?: unknown; waiting?: unknown; notdone?: unknown; late?: unknown; unread?: unknown; changed?: unknown },
  groupIds: readonly string[],
): CourseworkFilter {
  const group =
    typeof query.group === "string" && (query.group === NOT_IN_A_GROUP || groupIds.includes(query.group)) ? query.group : "all";
  const asked = query as Record<string, unknown>;
  const show = SHOW_PARAMS.find(([, param]) => asked[param] === "1")?.[0] ?? "everyone";
  return { group, show };
}

/**
 * A tab address with this filter, and the week chosen in the address
 * (`?week=3`) when one was, so a filter keeps it and a week keeps the filter.
 */
export function filterHref(base: string, filter: CourseworkFilter, week: number | null = null): string {
  const params = new URLSearchParams();
  if (filter.group !== "all") params.set("group", filter.group);
  const param = SHOW_PARAMS.find(([show]) => show === filter.show)?.[1];
  if (param) params.set(param, "1");
  if (week !== null) params.set("week", String(week));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Whether a row is one the show keeps. */
export function showKeeps(show: CourseworkShow, row: Pick<CourseworkRow, "notDone" | "late" | "unread" | "noFeedback" | "changed">): boolean {
  switch (show) {
    case "everyone":
      return true;
    case "notDone":
      return row.notDone;
    case "late":
      return row.late;
    case "unread":
      return row.unread;
    case "noFeedback":
      return row.noFeedback;
    case "changed":
      return row.changed;
  }
}

/** Each show's count: the people it would keep of `rows` (the people of the chosen group). */
export function showCounts(rows: ReadonlyArray<Pick<CourseworkRow, "notDone" | "late" | "unread" | "noFeedback" | "changed">>): Record<CourseworkShow, number> {
  const out = {} as Record<CourseworkShow, number>;
  for (const show of COURSEWORK_SHOWS) out[show] = rows.filter((row) => showKeeps(show, row)).length;
  return out;
}

/** The rows of the chosen group: a group's own, everybody in no group yet (`"none"`, or a group the tab does not list), or everybody. */
export function rowsInGroup<T extends Pick<CourseworkPerson, "groupId">>(rows: readonly T[], group: string, groupIds: readonly string[]): T[] {
  if (group === "all") return [...rows];
  if (group === NOT_IN_A_GROUP) return rows.filter((row) => row.groupId === null || !groupIds.includes(row.groupId));
  return rows.filter((row) => row.groupId === group);
}

/**
 * The week the panels under the table are about: the one asked for in the
 * address when it is one of the tab's columns, else the latest week anybody
 * shown has written in, else the first column. `asked` says whether the
 * address chose it, so the filters carry it only then.
 */
export function chosenWeek(
  query: { week?: unknown },
  columns: ReadonlyArray<{ weekNumber: number }>,
  sections: readonly CourseworkSection[],
): { weekNumber: number; asked: boolean } | null {
  if (columns.length === 0) return null;
  const wanted = typeof query.week === "string" && /^\d{1,3}$/.test(query.week) ? Number(query.week) : null;
  if (wanted !== null && columns.some((column) => column.weekNumber === wanted)) return { weekNumber: wanted, asked: true };
  const written = (cell: CourseworkCell) =>
    (cell.reflections?.written ?? 0) > 0 || (cell.boxes?.filled ?? 0) > 0 || (cell.answer !== null && cell.answer.state !== "not-started");
  const latest = columns
    .map((column) => column.weekNumber)
    .filter((weekNumber) => sections.some((section) => section.rows.some((row) => row.cells.some((cell) => cell.weekNumber === weekNumber && written(cell)))))
    .at(-1);
  return { weekNumber: latest ?? columns[0].weekNumber, asked: false };
}

/**
 * Where a person's week stands, for its cell: when the old Submit was pressed,
 * the session they were due at, whether it has begun, and the day it opens
 * on the calendar of the group whose weeks they read.
 */
export type CellStanding = { submittedAt: Date | null; due: WeekDue; reached: boolean; opensOn?: string | null };

const NO_STANDING: CellStanding = { submittedAt: null, due: { at: null, by: "no-group" }, reached: false, opensOn: null };

/** The session they were due at, as a cell carries it. */
function dueWire(due: WeekDue): CourseworkCell["due"] {
  return { at: due.at ? due.at.toISOString() : null, by: due.by };
}

/**
 * Whether they have done anything in the week: ticked one of its sources or
 * a reading a task counts, written a reflection or a box, or begun its
 * written answer.
 */
function startedIn(week: CourseworkWeek, weekNumber: number, work: PersonWork): boolean {
  const key = (id: string) => workKey(weekNumber, id);
  if (week.sources.some((source) => work.ticked.has(source.id))) return true;
  if (week.tasks.some((needs) => needs.tickIds.some((id) => work.ticked.has(id)))) return true;
  if (week.parts.some((part) => part.prompts.some((prompt) => work.reflections.has(key(prompt.id))))) return true;
  if (week.boxes.some((box) => work.boxes.has(key(box.id)))) return true;
  const answer = week.answer ? (work.answers.get(key(week.answer.id)) ?? "not-started") : "not-started";
  return answer !== "not-started";
}

/**
 * One cell, worked out from the week the person reads, what they wrote and
 * ticked, and where their week stands (`loadRunWeekStates`): when the old
 * Submit was pressed, the session they were due at, `reached` (whether it has
 * begun for them) and the day it opens. No flags: those are the reader's,
 * and `courseworkRows` (`./overview.ts`) lays them over it.
 */
export function cellOf(
  week: CourseworkWeek | null,
  weekNumber: number,
  work: PersonWork,
  links: { person: string },
  standing: CellStanding = NO_STANDING,
): CourseworkCell {
  // The reading view of this person and this week.
  const href = `${links.person}?week=${weekNumber}`;
  const reached = standing.reached;
  const opensOn = standing.opensOn ?? null;
  if (!week) {
    return {
      weekNumber,
      counted: false,
      done: null,
      doneAt: null,
      doneLateMs: null,
      due: dueWire(standing.due),
      reached,
      opensOn,
      started: false,
      reflections: null,
      ticks: null,
      answer: null,
      boxes: null,
      flags: NO_FLAGS,
      waiting: null,
      href,
    };
  }
  const key = (id: string) => workKey(weekNumber, id);
  const packOf = (id: string) => work.packs?.get(id) ?? null;
  const done = weekDone({
    tasks: week.tasks,
    state: {
      isTicked: (id) => work.ticked.has(id),
      packOf,
      isWritten: (id) => work.reflections.has(key(id)) || work.boxes.has(key(id)),
      isSent: (id) => work.sentAt?.has(key(id)) ?? false,
    },
    submitted: standing.submittedAt !== null,
    asks: week.asks,
  });
  const doneAt = done
    ? weekDoneAt({
        tasks: week.tasks,
        times: {
          tickedAt: (id) => (work.ticked.has(id) ? (work.tickedAt?.get(id) ?? null) : null),
          writtenAt: (id) => work.writtenAt?.get(key(id)) ?? null,
          sentAt: (id) => work.sentAt?.get(key(id)) ?? null,
          packOf,
        },
        submittedAt: standing.submittedAt,
        asks: week.asks,
      })
    : null;
  const reflections =
    week.parts.length > 0
      ? {
          written: week.parts.filter((part) => partWritten(part, (promptId) => work.reflections.has(workKey(weekNumber, promptId)))).length,
          of: week.parts.length,
        }
      : null;
  const ticks =
    week.sources.length > 0 ? { ticked: week.sources.filter((source) => work.ticked.has(source.id)).length, of: week.sources.length } : null;
  const answer = week.answer ? { state: cellAnswerState(work.answers.get(workKey(weekNumber, week.answer.id)) ?? "not-started") } : null;
  const boxes =
    week.boxes.length > 0 ? { filled: week.boxes.filter((box) => work.boxes.has(workKey(weekNumber, box.id))).length, of: week.boxes.length } : null;
  return {
    weekNumber,
    counted: true,
    done,
    doneAt: doneAt ? doneAt.toISOString() : null,
    doneLateMs: lateBy(doneAt, standing.due),
    due: dueWire(standing.due),
    reached,
    opensOn,
    started: startedIn(week, weekNumber, work),
    reflections,
    ticks,
    answer,
    boxes,
    // The flags are this reader's, laid over the cell by `courseworkRows` (`./overview.ts`).
    flags: NO_FLAGS,
    waiting: null,
    href,
  };
}

/** What a cell says first, in words the tab's words file holds (`CELL_STATE_WORDS`). */
export type CellState = "no-coursework" | "done" | "done-on-time" | "done-late" | "joined-late" | "opens" | "started" | "not-started";

/**
 * WHAT A CELL SAYS FIRST, one thing, in words (Fri 13 Nov 2026):
 *  - a week not written as blocks: "No coursework";
 *  - done (`weekDone`): "Done late" when it became done after the session they
 *    were due at, "Done on time" once that session has passed, else "Done";
 *  - a week before they were told their group, not done: "Joined late";
 *  - a week that has not begun for them: "Opens Thu 12 Nov", the day it opens
 *    on the calendar of the group whose weeks they read;
 *  - otherwise "Started" where they have done anything in it, "Not started"
 *    where nothing.
 */
export function cellStateOf(cell: Pick<CourseworkCell, "counted" | "done" | "doneAt" | "doneLateMs" | "due" | "reached" | "started">, now: Date): CellState {
  if (!cell.counted) return "no-coursework";
  if (cell.done === true) {
    if (cell.doneLateMs !== null) return "done-late";
    if (cell.doneAt && cell.due.at && now.getTime() >= new Date(cell.due.at).getTime()) return "done-on-time";
    return "done";
  }
  if (cell.due.by === "joined-late") return "joined-late";
  if (!cell.reached) return "opens";
  return cell.started ? "started" : "not-started";
}

// ---------------------------------------------------------------------------
// One person's page
// ---------------------------------------------------------------------------

/**
 * What a reflection or fill-in box holds on a person's page: the words, when
 * they last changed, how long after the session the person was due at
 * (null when not after it), and the words as they stood when it started,
 * when they have changed since.
 */
export type WrittenBox = { text: string; at: Date | null; lateMs: number | null; atSession: string | null };

/** One reflection prompt on a person's page, with what they wrote and when. */
export type PersonPrompt = { id: string; text: string; answer: WrittenBox | null };

/** A written answer on a person's page. */
export type PersonAnswer = {
  /** The written answer's id in the week, which its work is keyed by (`workKey`). */
  id: string;
  prompt: string;
  state: CellAnswerState;
  words: number;
  /** An answer of one box. */
  text: string;
  /** An answer in labelled boxes, in the week's order; empty for an answer of one box. */
  boxes: Array<{ label: string; text: string }>;
  /** When it was first sent. */
  sentAt: Date | null;
  /** When it was last sent; changed since, its readers read it as sent until the session. */
  lastSentAt: Date | null;
  /** When the words shown last changed, while they may be read. */
  changedAt: Date | null;
  /** How long after the session they were due at the words shown last changed (ms); null when not after it. */
  changedLateMs: number | null;
  /** How long after that session it was last sent (ms); null when not after it, or never sent. */
  sentLateMs: number | null;
  /** Changed since it was last sent, while its readers still read it as sent (before the session): said in words, never what changed. */
  changedSinceSent: boolean;
  /** The answer as it stood when the session started, when it differs from the words shown; null otherwise. */
  atSession: { text: string; boxes: Array<{ label: string; text: string }> } | null;
  /** A page of its own for it, or null: the reading view's loader hands none, since feedback on it is written beside it. */
  href: string | null;
};

/**
 * The feedback on one week of the person's, as the people running the group
 * read it: every piece, feedback given before pieces existed among them,
 * oldest first; the reader's own piece on the week as a whole while it may
 * change; and whether the reader may write feedback on the week now (they
 * may act on the person's work, and its readers may read it).
 */
export type PersonWeekFeedback = { cards: StaffFeedbackCard[]; own: StaffFeedbackCard | null; open: boolean };

/** One week on a person's page. */
export type PersonWeek = {
  weekNumber: number;
  title: string;
  /** False for a week the person reads that is not written as blocks. */
  counted: boolean;
  parts: Array<{ number: number; title: string; prompts: PersonPrompt[] }>;
  answer: PersonAnswer | null;
  /** Each fill-in box, its words or null, when they last changed, with how late; null for a week with none, or a reader the boxes' gate refused. */
  boxes: Array<{ id: string; heading: string; label: string; text: string | null; at: Date | null; lateMs: number | null; atSession: string | null }> | null;
  sources: Array<{ id: string; title: string; kindLabel: string; partNumber: number | null; ticked: boolean; note: string | null }>;
  ticked: number;
  /** The feedback on the week; null for a week not written as blocks. */
  feedback: PersonWeekFeedback | null;
};

/** One written answer of the person whose page is drawn, as their page reads it: the words its readers read. */
export type PersonAnswerWrite = {
  state: AnswerState;
  words: number;
  text: string;
  boxes: Record<string, string> | null;
  sentAt: Date | null;
  lastSentAt: Date | null;
  changedAt: Date | null;
  changedLateMs: number | null;
  sentLateMs: number | null;
  /** Changed since it was last sent, while its readers still read it as sent (before the session). */
  changedSinceSent?: boolean;
  /** When it first held something, for the words its question had then. */
  writtenAt?: Date | null;
  atSession: { text: string; boxes: Record<string, string> | null } | null;
  /** The stored answer, for the version each piece of feedback was about; null while it may not be read. Never on a page. */
  piece: PieceFacts | null;
  feedback: { levels: Array<{ row: string; level: string; descriptor: string }>; comment: string; byUid: string; sentAt: Date | null } | null;
};

/** What a person wrote on the run, for their page: their words, read on the server after the page's gate, keyed by `workKey`. */
export type PersonWrites = {
  reflections: ReadonlyMap<string, WrittenBox>;
  boxes: ReadonlyMap<string, WrittenBox>;
  answers: ReadonlyMap<string, PersonAnswerWrite>;
  ticked: ReadonlySet<string>;
};

/**
 * The keys (`workKey`) of the person's reflections and written answers whose
 * words their page shows: a reflection they wrote, and a written answer whose
 * words its readers may read (`words` is 0 for one they may not read yet,
 * when the page says only that it is started). The earlier words of a
 * question are read and shown beside these alone.
 */
export function shownWorkKeys(weeks: readonly PersonWeek[]): Set<string> {
  const out = new Set<string>();
  for (const week of weeks) {
    for (const part of week.parts) for (const prompt of part.prompts) if (prompt.answer?.text.trim()) out.add(workKey(week.weekNumber, prompt.id));
    if (week.answer && week.answer.words > 0) out.add(workKey(week.weekNumber, week.answer.id));
  }
  return out;
}

/**
 * A person's weeks, NEWEST FIRST: each reflection under its prompt, the
 * written answer, the boxes (only when `boxesRead`: the boxes' own gate
 * answered), which sources they ticked, the private note on each (only when
 * `notes` is given: admins, never the lead), and the feedback on the week
 * (`feedbackOf`, worked out by the loader, which reads it).
 */
export function personWeeks(input: {
  columns: ReadonlyArray<{ weekNumber: number; title: string }>;
  weekOf: (weekNumber: number) => CourseworkWeek | null;
  writes: PersonWrites;
  boxesRead: boolean;
  notes: ReadonlyMap<string, string> | null;
  writtenHref: (weekNumber: number) => string | null;
  /** The feedback on a week written as blocks, given its written answer's id (null for a week with none). */
  feedbackOf: (weekNumber: number, answerId: string | null) => PersonWeekFeedback;
}): PersonWeek[] {
  const { writes } = input;
  return [...input.columns]
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .map((column) => {
      const n = column.weekNumber;
      const week = input.weekOf(n);
      if (!week) {
        return { weekNumber: n, title: column.title, counted: false, parts: [], answer: null, boxes: null, sources: [], ticked: 0, feedback: null };
      }
      const stored = week.answer ? (writes.answers.get(workKey(n, week.answer.id)) ?? null) : null;
      const answer: PersonAnswer | null = week.answer
        ? {
            id: week.answer.id,
            prompt: week.answer.prompt,
            state: cellAnswerState(stored?.state ?? "not-started"),
            words: stored?.words ?? 0,
            text: stored && !stored.boxes ? stored.text : "",
            boxes: stored?.boxes ? week.answer.boxes.map((box) => ({ label: box.label, text: stored.boxes?.[box.id] ?? "" })) : [],
            sentAt: stored?.sentAt ?? null,
            lastSentAt: stored?.lastSentAt ?? null,
            changedAt: stored?.changedAt ?? null,
            changedLateMs: stored?.changedLateMs ?? null,
            sentLateMs: stored?.sentLateMs ?? null,
            changedSinceSent: stored?.changedSinceSent === true,
            atSession: stored?.atSession
              ? {
                  text: stored.atSession.boxes ? "" : stored.atSession.text,
                  boxes: stored.atSession.boxes ? week.answer.boxes.map((box) => ({ label: box.label, text: stored.atSession?.boxes?.[box.id] ?? "" })) : [],
                }
              : null,
            href: input.writtenHref(n),
          }
        : null;
      const sources = week.sources.map((source) => ({
        id: source.id,
        title: source.title,
        kindLabel: source.kindLabel,
        partNumber: source.partNumber,
        ticked: writes.ticked.has(source.id),
        note: input.notes ? (input.notes.get(source.id) ?? null) : null,
      }));
      return {
        weekNumber: n,
        title: week.title || column.title,
        counted: true,
        parts: week.parts.map((part) => ({
          number: part.number,
          title: part.title,
          prompts: part.prompts.map((prompt) => ({ id: prompt.id, text: prompt.text, answer: writes.reflections.get(workKey(n, prompt.id)) ?? null })),
        })),
        answer,
        boxes:
          week.boxes.length > 0 && input.boxesRead
            ? week.boxes.map((box) => {
                const written = writes.boxes.get(workKey(n, box.id)) ?? null;
                return {
                  id: box.id,
                  heading: box.heading,
                  label: box.label,
                  text: written?.text ?? null,
                  at: written?.at ?? null,
                  lateMs: written?.lateMs ?? null,
                  atSession: written?.atSession ?? null,
                };
              })
            : null,
        sources,
        ticked: sources.filter((source) => source.ticked).length,
        feedback: input.feedbackOf(n, week.answer?.id ?? null),
      };
    });
}
