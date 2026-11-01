import { partWritten, reflectionPartsOf, tickedSourcesOf, type ReflectionPart, type TickedSource } from "@/lib/courses/facilitatorWeek/model";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { weekFillInBoxes, weekWrittenAnswers, type ReadableWeek } from "@/lib/courses/weekBlocks/reader";
import { weekAsksForWriting, weekDone } from "@/lib/courses/weekWork/model";
import type { AnswerState } from "@/lib/courses/writtenAnswers/model";

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
 * WHAT A CELL SAYS, never a word anybody wrote: first, whether the week is
 * done, by the one meaning of done every page uses (`weekDone`: the week is
 * submitted, where it asks for anything written, and every tick it counts
 * is ticked, the person's own pack among them); then how many of the week's
 * reflection parts are written (`partWritten`, as This week's work counts
 * them), how many of its ticked sources are ticked (`tickedSourcesOf`),
 * where its written answer stands, and how many of its fill-in boxes have
 * something in them. Survey answers are never read for any of it, and a
 * private note is never a cell.
 *
 * NOT DONE, the filter: the people with a week that has begun for them (on
 * the calendar of the group whose weeks they read, `reachedOf`) and is not
 * done. A week still to come is not done either, and a cell says so, but it
 * puts nobody under the filter.
 */

/** Who is looking: the programme's lead, or an admin. */
export type CourseworkViewer = "lead" | "admin";

/** A week as the tab reads it: its parts with prompts, its ticked sources, its written answer and its boxes. */
export type CourseworkWeek = {
  weekNumber: number;
  title: string;
  parts: ReflectionPart[];
  sources: TickedSource[];
  /** The week's one written answer, or null for a week with none. */
  answer: { id: string; prompt: string; boxes: Array<{ id: string; label: string }> } | null;
  /** The week's fill-in boxes, in page order. */
  boxes: Array<{ id: string; heading: string; label: string }>;
  /** This week's tasks, by what each needs (`weekTaskNeeds`), for whether the week is done. */
  tasks: TaskNeeds[];
  /** The week asks for something written, so it is done only once it is submitted. */
  writes: boolean;
};

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
    answer: answer ? { id: answer.id, prompt: answer.prompt, boxes: answer.boxes } : null,
    boxes: weekFillInBoxes(week).map((box) => ({ id: box.id, heading: box.heading, label: box.label })),
    tasks: weekTaskNeeds(blocks),
    writes: weekAsksForWriting(blocks),
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
  /**
   * The pack each Choose one gave them or let them pick, by the Choose one's
   * id: what done asks of a pathway. Read by the tab's loader beside the rest;
   * absent, nobody has a pack.
   */
  packs?: ReadonlyMap<string, string>;
};

export const NO_WORK: PersonWork = { reflections: new Set(), boxes: new Set(), answers: new Map(), ticked: new Set() };

/** The key a person's work is stored under in `PersonWork`. */
export function workKey(weekNumber: number, id: string): string {
  return `${weekNumber} ${id}`;
}

/** One cell: a person's week, in counts. */
export type CourseworkCell = {
  weekNumber: number;
  /** False for a week the person reads that is not written as blocks: nothing to count. */
  counted: boolean;
  /**
   * The one meaning of done (`weekDone`): the week submitted, where it asks
   * for anything written, and every tick it counts ticked. Null for a week
   * not counted.
   */
  done: boolean | null;
  /** The week has begun for them, on the calendar of the group whose weeks they read. */
  reached: boolean;
  /** Reflection parts written, of the week's parts; null for a week with none. */
  reflections: { written: number; of: number } | null;
  /** Sources ticked, of the week's ticked sources; null for a week with none. */
  ticks: { ticked: number; of: number } | null;
  /** The written answer's state and the feedback page for it; null for a week with none. */
  answer: { state: CellAnswerState; href: string | null } | null;
  /** Boxes filled in, of the week's boxes; null for a week with none. */
  boxes: { filled: number; of: number } | null;
  /** The person's page, at this week. */
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
  /** To an admin: placed in a group Publish has not told them about yet. Always false for the lead. */
  notToldYet: boolean;
};

export type CourseworkRow = CourseworkPerson & {
  cells: CourseworkCell[];
  /** A written answer of theirs is sent and waiting for feedback. */
  waiting: boolean;
  /** A week that has begun for them is not done. */
  notDone: boolean;
  /** Their page. */
  href: string;
};

export type CourseworkSection = {
  /** A group's id, or "none" for the people in no group yet. */
  key: string;
  title: string;
  rows: CourseworkRow[];
};

/**
 * The tab's filters, as plain links: a group, everybody in no group yet, or
 * everybody; the waiting ones alone; the ones not done alone.
 */
export type CourseworkFilter = { group: string; waiting: boolean; notDone: boolean };

export const NOT_IN_A_GROUP = "none";

/** The filter asked for in the address, read as one the tab knows: an unknown group is everybody. */
export function readFilter(query: { group?: unknown; waiting?: unknown; notdone?: unknown }, groupIds: readonly string[]): CourseworkFilter {
  const group =
    typeof query.group === "string" && (query.group === NOT_IN_A_GROUP || groupIds.includes(query.group)) ? query.group : "all";
  return { group, waiting: query.waiting === "1", notDone: query.notdone === "1" };
}

/**
 * A tab address with this filter, and the week chosen for the panels under
 * the table when one was chosen in the address (`?week=3`), so a filter
 * keeps it and a week keeps the filter.
 */
export function filterHref(base: string, filter: CourseworkFilter, week: number | null = null): string {
  const params = new URLSearchParams();
  if (filter.group !== "all") params.set("group", filter.group);
  if (filter.waiting) params.set("waiting", "1");
  if (filter.notDone) params.set("notdone", "1");
  if (week !== null) params.set("week", String(week));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
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
 * One cell, worked out from the week the person reads, what they wrote and
 * ticked, and where their week stands: `submitted` (`loadRunWeekStates`)
 * and `reached`, whether it has begun for them.
 */
export function cellOf(
  week: CourseworkWeek | null,
  weekNumber: number,
  work: PersonWork,
  links: { person: string; written: string | null },
  standing: { submitted: boolean; reached: boolean } = { submitted: false, reached: false },
): CourseworkCell {
  const href = `${links.person}#week-${weekNumber}`;
  const reached = standing.reached;
  if (!week) return { weekNumber, counted: false, done: null, reached, reflections: null, ticks: null, answer: null, boxes: null, href };
  const done = weekDone({
    tasks: week.tasks,
    state: { isTicked: (id) => work.ticked.has(id), packOf: (id) => work.packs?.get(id) ?? null },
    writes: week.writes,
    submitted: standing.submitted,
  });
  const reflections =
    week.parts.length > 0
      ? {
          written: week.parts.filter((part) => partWritten(part, (promptId) => work.reflections.has(workKey(weekNumber, promptId)))).length,
          of: week.parts.length,
        }
      : null;
  const ticks =
    week.sources.length > 0 ? { ticked: week.sources.filter((source) => work.ticked.has(source.id)).length, of: week.sources.length } : null;
  const answer = week.answer
    ? { state: cellAnswerState(work.answers.get(workKey(weekNumber, week.answer.id)) ?? "not-started"), href: links.written }
    : null;
  const boxes =
    week.boxes.length > 0 ? { filled: week.boxes.filter((box) => work.boxes.has(workKey(weekNumber, box.id))).length, of: week.boxes.length } : null;
  return { weekNumber, counted: true, done, reached, reflections, ticks, answer, boxes, href };
}

/**
 * The tab: its sections in the run's group order, people in no group yet
 * last, each section's people by name; then the filter. `weekOf` hands the
 * week a group reads (null: the run's own).
 */
export function courseworkSections(input: {
  columns: ReadonlyArray<{ weekNumber: number }>;
  groups: ReadonlyArray<{ id: string; name: string }>;
  people: readonly CourseworkPerson[];
  workOf: (uid: string) => PersonWork;
  weekOf: (groupId: string | null, weekNumber: number) => CourseworkWeek | null;
  /** The person's page, without a week. */
  personHref: (uid: string) => string;
  /** The feedback page for a person's answer in a week, or null where there is none to open. */
  writtenHref: (person: CourseworkPerson, weekNumber: number) => string | null;
  /** Whether a person's week is submitted (`loadRunWeekStates`). */
  submittedOf: (uid: string, weekNumber: number) => boolean;
  /** The last week that has begun for a person, on the calendar of the group whose weeks they read; 0 before any. */
  reachedOf: (person: CourseworkPerson) => number;
  filter: CourseworkFilter;
  notInAGroupTitle: string;
}): CourseworkSection[] {
  const rows: CourseworkRow[] = input.people.map((person) => {
    const work = input.workOf(person.uid);
    const href = input.personHref(person.uid);
    const reached = input.reachedOf(person);
    const cells = input.columns.map((column) =>
      cellOf(
        input.weekOf(person.readsGroupId, column.weekNumber),
        column.weekNumber,
        work,
        { person: href, written: input.writtenHref(person, column.weekNumber) },
        { submitted: input.submittedOf(person.uid, column.weekNumber), reached: column.weekNumber <= reached },
      ),
    );
    return {
      ...person,
      cells,
      waiting: cells.some((cell) => cell.answer?.state === "waiting"),
      notDone: cells.some((cell) => cell.reached && cell.done === false),
      href,
    };
  });
  const byName = (a: CourseworkRow, b: CourseworkRow) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.uid.localeCompare(b.uid);
  const sections: CourseworkSection[] = input.groups.map((group) => ({
    key: group.id,
    title: group.name,
    rows: rows.filter((row) => row.groupId === group.id).sort(byName),
  }));
  const known = new Set(input.groups.map((group) => group.id));
  sections.push({
    key: NOT_IN_A_GROUP,
    title: input.notInAGroupTitle,
    rows: rows.filter((row) => row.groupId === null || !known.has(row.groupId)).sort(byName),
  });
  return sections
    .filter((section) => input.filter.group === "all" || section.key === input.filter.group)
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => (!input.filter.waiting || row.waiting) && (!input.filter.notDone || row.notDone)),
    }))
    .filter((section) => section.rows.length > 0);
}

// ---------------------------------------------------------------------------
// One person's page
// ---------------------------------------------------------------------------

/** One reflection prompt on a person's page, with what they wrote and when. */
export type PersonPrompt = { id: string; text: string; answer: { text: string; at: Date | null } | null };

/** A written answer on a person's page. */
export type PersonAnswer = {
  prompt: string;
  state: CellAnswerState;
  words: number;
  /** An answer of one box. */
  text: string;
  /** An answer in labelled boxes, in the week's order; empty for an answer of one box. */
  boxes: Array<{ label: string; text: string }>;
  sentAt: Date | null;
  feedback: { levels: Array<{ row: string; level: string; descriptor: string }>; comment: string; byName: string | null; sentAt: Date | null } | null;
  /** The feedback page for it, or null where the person is in no group to give feedback in. */
  href: string | null;
};

/** One week on a person's page. */
export type PersonWeek = {
  weekNumber: number;
  title: string;
  /** False for a week the person reads that is not written as blocks. */
  counted: boolean;
  parts: Array<{ number: number; title: string; prompts: PersonPrompt[] }>;
  answer: PersonAnswer | null;
  /** Each fill-in box, its words or null; null for a week with none, or a reader the boxes' gate refused. */
  boxes: Array<{ heading: string; label: string; text: string | null }> | null;
  sources: Array<{ id: string; title: string; kindLabel: string; partNumber: number | null; ticked: boolean; note: string | null }>;
  ticked: number;
};

/** One written answer of the person whose page is drawn, as their page reads it. */
export type PersonAnswerWrite = {
  state: AnswerState;
  words: number;
  text: string;
  boxes: Record<string, string> | null;
  sentAt: Date | null;
  feedback: { levels: Array<{ row: string; level: string; descriptor: string }>; comment: string; byUid: string; sentAt: Date | null } | null;
};

/** What a person wrote on the run, for their page: their words, read on the server after the page's gate, keyed by `workKey`. */
export type PersonWrites = {
  reflections: ReadonlyMap<string, { text: string; at: Date | null }>;
  boxes: ReadonlyMap<string, string>;
  answers: ReadonlyMap<string, PersonAnswerWrite>;
  ticked: ReadonlySet<string>;
};

/**
 * A person's weeks, NEWEST FIRST: each reflection under its prompt, the
 * written answer with its feedback, the boxes (only when `boxesRead`: the
 * boxes' own gate answered), which sources they ticked, and the private note
 * on each (only when `notes` is given: admins, never the lead).
 */
export function personWeeks(input: {
  columns: ReadonlyArray<{ weekNumber: number; title: string }>;
  weekOf: (weekNumber: number) => CourseworkWeek | null;
  writes: PersonWrites;
  boxesRead: boolean;
  notes: ReadonlyMap<string, string> | null;
  nameOf: (uid: string) => string | null;
  writtenHref: (weekNumber: number) => string | null;
}): PersonWeek[] {
  const { writes } = input;
  return [...input.columns]
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .map((column) => {
      const n = column.weekNumber;
      const week = input.weekOf(n);
      if (!week) {
        return { weekNumber: n, title: column.title, counted: false, parts: [], answer: null, boxes: null, sources: [], ticked: 0 };
      }
      const stored = week.answer ? (writes.answers.get(workKey(n, week.answer.id)) ?? null) : null;
      const answer: PersonAnswer | null = week.answer
        ? {
            prompt: week.answer.prompt,
            state: cellAnswerState(stored?.state ?? "not-started"),
            words: stored?.words ?? 0,
            text: stored && !stored.boxes ? stored.text : "",
            boxes: stored?.boxes ? week.answer.boxes.map((box) => ({ label: box.label, text: stored.boxes?.[box.id] ?? "" })) : [],
            sentAt: stored?.sentAt ?? null,
            feedback: stored?.feedback
              ? {
                  levels: stored.feedback.levels,
                  comment: stored.feedback.comment,
                  byName: stored.feedback.byUid ? input.nameOf(stored.feedback.byUid) : null,
                  sentAt: stored.feedback.sentAt,
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
            ? week.boxes.map((box) => ({ heading: box.heading, label: box.label, text: writes.boxes.get(workKey(n, box.id)) ?? null }))
            : null,
        sources,
        ticked: sources.filter((source) => source.ticked).length,
      };
    });
}
