import { WEEK_BLOCK_LIMITS as L } from "./limits";
import {
  oneLine,
  proseChars,
  runsText,
  safeSourceUrl,
  safeLinkUrl,
  sanitizeCells,
  sanitizeProse,
  sanitizeRuns,
  type Prose,
  type Run,
  type TableCell,
} from "./prose";

/**
 * A WEEK AS AN ORDERED LIST OF BLOCKS (the coursework boards: pr-weeks,
 * wk-week, wk-week-phone, st-week1-phone and wk-week6-phone; HANDOFF's
 * "The building blocks"). Stored as `CourseWeekDoc.blocks` on a run's week
 * and on a group's copy of it.
 *
 * TWO SHAPES OF WEEK. A week written before blocks existed has NO `blocks`
 * key at all, and reads and draws exactly as it always has, from its guide,
 * materials, exercises and checklist. A week with `blocks` (a list, even an
 * empty one) is a block week: what its people read and answer is in the
 * blocks, and the old arrays are not drawn for it. `isBlockWeek` is the one
 * test, and `src/lib/courses/weekBlocks/reader.ts` is the one reader that
 * answers "the sources, written answers, reflection prompts and checklist
 * items of this week" for both shapes.
 *
 * THE SHAPE. The top of a week holds sections in page order: This week,
 * Text (Why this week, Before the session, a section of the guide's own, or
 * plain text), Outcomes, Content note, Part, Cases (the case study), In the
 * session and Go further. A Part holds its own blocks in order: plain Text,
 * Source, Reflection stop, Choose one, Table, Written answer, Cases (a talk
 * or pitch inside the part), Fill-in boxes and Checklist. Nothing nests
 * deeper than that.
 *
 * STABLE IDS. Every block, and every thing a person answers or ticks inside
 * one (a source, a reflection prompt, a pack, a case, a fill-in box, a
 * checklist item), carries an id. Ticks, answers and the per-person records
 * the later pages keep (which pack, which case, ready for the talk) are keyed
 * on these ids, so they must survive every copy: a week copied to a group, a
 * template or another run, and a week copied out as Markdown and pasted back
 * (`merge.ts`). An id is letters, digits, "-" and "_", at most 48 long, and
 * never holds "__", the separator in the doc ids that embed it
 * (`courseProgress/{runId}__{uid}__{itemId}`). Ids are unique in a week; a
 * paste mints new ones, so they are unique in a run as well.
 *
 * NO MARKUP. Rich text is `Prose` (see `prose.ts`): runs of plain text with
 * marks, drawn as elements and text nodes. Every other field is a plain
 * string. Links are checked here and again where they are drawn.
 *
 * WHO WRITES IT. Only the server: the admin loader's route reads a week's
 * Markdown into blocks, checks them (`weekBlocksProblems`) and stores what
 * `sanitizeWeekBlocks` gives back, which is the same list. The rules keep
 * every browser write off `blocks`. This module is the read side as well
 * (`normalizeCourseWeek` calls `sanitizeWeekBlocks`), so a stored week that
 * reached Firestore some other way still reads inside the caps, with only
 * the blocks and items it can trust.
 */

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * How a source is taken in. The boards' six, in their order, then a
 * notebook (code that runs, with what it needs to run: the Technical AI
 * Safety hands-on routes).
 */
export const SOURCE_KINDS = ["read", "watch", "listen", "watchOrListen", "watchOrRead", "explore", "notebook"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  read: "Read",
  watch: "Watch",
  listen: "Listen",
  watchOrListen: "Watch or listen",
  watchOrRead: "Watch or read",
  explore: "Explore",
  notebook: "Notebook",
};

/**
 * When a This week task is done, and when a written answer is due: the
 * board's three. The DATE is never stored: it is worked out for each group
 * from its own calendar (`due.ts`).
 *  - `before`: before the session;
 *  - `dayBefore`: on the day before the session, by the time the COURSE
 *    sets (`CourseDoc.dayBeforeDueTime`), or by the end of that day;
 *  - `atSession`: at the session.
 */
export const WHENS = ["before", "dayBefore", "atSession"] as const;
export type When = (typeof WHENS)[number];

/** "HH:MM", 00:00 to 23:59: the shape of a course's day-before time. */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The words for each `When`, as a This week table writes them. */
export const WHEN_WORDS: Record<When, string> = {
  before: "Before the session",
  dayBefore: "By the end of the day before the session",
  atSession: "At the session",
};

/**
 * Who settles which pack or case a person has (Q32): the person picks it on
 * the site (week 6's career review), or a facilitator gives it out and types
 * the paper draw into the group page, swaps going through them (week 3's
 * pathways and every case).
 */
export const GIVEN_BY = ["fellow", "facilitator"] as const;
export type GivenBy = (typeof GIVEN_BY)[number];

export type BlockType =
  | "thisWeek"
  | "text"
  | "outcomes"
  | "contentNote"
  | "part"
  | "source"
  | "reflection"
  | "chooseOne"
  | "table"
  | "writtenAnswer"
  | "cases"
  | "fillIn"
  | "checklist"
  | "inTheSession"
  | "goFurther"
  | "handsOn";

/** The blocks a week's top level may hold. */
export const TOP_LEVEL_TYPES: readonly BlockType[] = [
  "thisWeek",
  "text",
  "outcomes",
  "contentNote",
  "part",
  "cases",
  "inTheSession",
  "goFurther",
  "handsOn",
];

/** The blocks a Part may hold. */
export const PART_CHILD_TYPES: readonly BlockType[] = [
  "text",
  "source",
  "reflection",
  "chooseOne",
  "table",
  "writtenAnswer",
  "cases",
  "fillIn",
  "checklist",
];

// ---------------------------------------------------------------------------
// The blocks
// ---------------------------------------------------------------------------

/** A task in This week: what to do, how long (text, so it can be a range), when, and what it covers. */
export type ThisWeekTask = {
  type: "task";
  what: string;
  /** "About 65 to 80 minutes". */
  time: string;
  when: When;
  /** The when as the guide writes it ("Before session 1, if you can"), or "". */
  whenText: string;
  /**
   * The ids of the parts, written answers and Cases blocks this task stands
   * for, worked out from its words when a week is read in ("Parts 1 to 3",
   * "Part 4", "Your case study"). The member's pages count a task done when
   * what it covers is done: a part when its sources are ticked (only the
   * chosen pack's) and its reflection boxes are written in, a written answer
   * when it is sent, a talk when the person marks themselves ready.
   */
  covers: string[];
};

/** A row with nothing to do this week: "Case study and written question · None this week". */
export type ThisWeekNone = {
  type: "none";
  what: string;
  /** "None this week". */
  time: string;
  /** "You’ll draw your first case at the end of session 1". */
  note: string;
};

/**
 * A row that is offered, not set: "Hands-on route (optional, for coders) ·
 * An hour or more · Any time; not counted in the total". It is outside
 * "In all" and never counted.
 */
export type ThisWeekOptional = {
  type: "optional";
  what: string;
  time: string;
  /** "Any time; not counted in the total". */
  note: string;
};

export type ThisWeekRow = ThisWeekTask | ThisWeekNone | ThisWeekOptional;

export type ThisWeekBlock = {
  id: string;
  type: "thisWeek";
  rows: ThisWeekRow[];
  /** "About 2¼ hours" ("In all"), or "". */
  total: string;
  /** The lines under the table, or none. */
  note: Prose;
};

/**
 * Rich text with a role:
 *  - `why`: Why this week (the public pages show it, Q40);
 *  - `before`: Before the session, its time ("About 70 minutes, plus your
 *    threat model") and framing; the parts follow it;
 *  - `section`: a section of the guide's own with a heading ("Where to go next");
 *  - `plain`: paragraphs with no section of their own; inside a part it may
 *    carry a small heading.
 */
export type TextRole = "why" | "before" | "section" | "plain";

export type TextBlock = {
  id: string;
  type: "text";
  role: TextRole;
  heading: string;
  /** Only Before the session has one; "" otherwise. */
  time: string;
  body: Prose;
};

/** "After this week you can": three or four lines. */
export type OutcomesBlock = {
  id: string;
  type: "outcomes";
  heading: string;
  items: string[];
};

export type SupportLink = { label: string; url: string; detail: string };

/** A calm box with support links (week 3, added on the site). Behind sign-in (Q40). */
export type ContentNoteBlock = {
  id: string;
  type: "contentNote";
  body: Prose;
  links: SupportLink[];
};

/** What a source is, wherever it sits: on the path, or (with `why` for `note`) in Go further. */
export type SourceFields = {
  kind: SourceKind;
  /**
   * Words before the linked title, as written: a section or page note
   * ("section 3.5, ... (pages 157 to 159), of the"), or "".
   */
  lead: string;
  title: string;
  /**
   * An https address (Q36: every source is a link; no players), or "" for
   * a source with no single link of its own, whose note carries its links
   * ("METR's time horizons. Start with AI Digest's two-minute explainer,
   * then METR's latest update").
   */
  url: string;
  /** Author or source: "Ajeya Cotra", "Rose Hadshar, 80,000 Hours". */
  by: string;
  /** "2021", "August 2026", or "". */
  date: string;
  /** "22 minutes", "About 35 minutes", "15 to 35 minutes", or "" (optional inside a pack). */
  time: string;
  /** What a notebook needs to run ("free Colab", "a paid API key, about US$5"), or "". */
  compute: string;
  /** "The introduction and section B." One line, or none. */
  note: Run[];
};

/** One source on the path. Its id is what a tick and a rating key on. */
export type SourceBlock = { id: string; type: "source" } & SourceFields;

export type ReflectionPrompt = { id: string; text: string };

/** A stop between sources: one or two prompts, each a box that saves as the person types. No feedback. */
export type ReflectionBlock = {
  id: string;
  type: "reflection";
  prompts: ReflectionPrompt[];
};

/**
 * One option in a Choose one: a name, what to read (one line with as many
 * linked sources as it has, as the guide writes it), a time and a note.
 * It is ticked as one: the pack's id is what a tick, and which pack a
 * person has, key on.
 */
export type Pack = {
  id: string;
  /** "Loss of control", "AI policy and strategy research". */
  name: string;
  /** "32 minutes", "About 25 minutes", or "" when the Choose one gives one time for all. */
  time: string;
  /** "Win the race with locked-down labs ...", "if you like law, ...", or none. */
  note: Run[];
  /** What to read, as written: its links and the words around them. */
  read: Run[];
};

/**
 * Packs to choose from. Only the chosen pack counts towards a person's
 * week. `givenBy` says who settles which one a person has (Q32): a
 * facilitator, typing in the paper draw, or the person, on the site.
 *
 * Two ways of writing one, kept so a week copies out as it was written:
 *  - `table`: a table of packs (Pathway, Read, Time; maybe an "In one
 *    line" column), as weeks 3 to 5 write them;
 *  - `list`: a source line ("Read: one 80,000 Hours career review that
 *    fits you, 15 to 35 minutes:") with one linked option per line under
 *    it, as week 6 writes its career reviews.
 */
export type ChooseOneBlock = {
  id: string;
  type: "chooseOne";
  form: "table" | "list";
  /**
   * The table's first header ("Pathway", "Pack", "If you want..."), or the
   * list's line ("one 80,000 Hours career review that fits you").
   */
  title: string;
  givenBy: GivenBy;
  /** The list's kind ("Read"); "read" for a table. */
  kind: SourceKind;
  /** One time for every pack ("15 to 35 minutes"), or "" when each pack has its own. */
  time: string;
  /** The header of a table's note column ("In one line"), or "". */
  noteHeading: string;
  /** Questions to read every pack against (Technical AI Safety week 3), or none. */
  questions: Prose;
  packs: Pack[];
};

/** Simple rows and columns of text and links. */
export type TableBlock = {
  id: string;
  type: "table";
  header: TableCell[];
  rows: { cells: TableCell[] }[];
};

export type WordRange = { min: number; max: number };

/**
 * One labelled box of a written answer made of several (Technical AI Safety
 * week 6's one-page plan: seven headings, sent together as the week's
 * written piece, with feedback on the rubric like any written answer).
 */
export type AnswerBox = {
  id: string;
  /** "What I want to work on, and why it matters". */
  label: string;
  /** "two or three sentences.", or "". */
  hint: string;
};

/**
 * The week's one written answer: its prompt, guidance, a word range and when
 * it is due. Its id is the answer's address (the response store keys on it,
 * as it does on an exercise's id today). The due MOMENT is each group's
 * (`due.ts`): on the day before the group's session by the course's time
 * (`CourseDoc.dayBeforeDueTime`), moved to the group's next session when
 * that one is cancelled. The answer each person writes, its review and its
 * feedback on the course's rubric: `src/lib/courses/writtenAnswers/`.
 */
export type WrittenAnswerBlock = {
  id: string;
  type: "writtenAnswer";
  /** The question: its paragraphs, a numbered list of steps, a milestone in bold. */
  prompt: Prose;
  /**
   * Labelled boxes, sent together, or none: an answer of one box. A part
   * with a word range has one box (the range is counted over it); a part
   * with none that lists headings to write under has a box per heading.
   */
  boxes: AnswerBox[];
  /** What a strong answer does ("A strong answer ..."), or none. */
  guidance: Prose;
  words: WordRange | null;
  due: When;
};

export type Case = {
  id: string;
  /** "Shutdown resistance, 2025". */
  title: string;
  /** What happened, in one line. */
  what: Run[];
  /** Where to start, as written: its links, with the words and times around them. */
  start: Run[];
  /**
   * A content note on this case alone ("The sources quote offensive posts:
   * talk to your facilitator before you take this one."), or "". A case with
   * a content note stays out of the draw and is offered instead.
   */
  contentNote: string;
};

/** Cases under one heading. `packId` is the pack of the same name in the week, when there is one. */
export type CaseGroup = {
  name: string;
  packId: string | null;
  cases: Case[];
};

/** "a 3-minute talk", "a 2-minute pitch". */
export type Talk = { minutes: number; name: string };

/**
 * A talk to prepare: a case study given out at the end of the previous
 * session (week 3's 22 cases in four groups), or a talk with no case (week
 * 6's 2-minute pitch, inside its part). Each person marks themselves ready;
 * the case they have is a per-person record keyed on a case id here.
 */
export type CasesBlock = {
  id: string;
  type: "cases";
  /** "Your case study" for a section; "" for a talk inside a part. */
  heading: string;
  intro: Prose;
  talk: Talk | null;
  /** How to prepare ("the five questions"), or none. */
  prepare: Prose;
  givenBy: GivenBy;
  /** The cases table's group column ("Pathway"), or "" when its cases are in one group. */
  groupLabel: string;
  /** The heading of its links column: "Start here", or "Where to start". */
  startLabel: string;
  groups: CaseGroup[];
  /** The lines under the cases ("If a case weighs on you, swap it."), or none. */
  note: Prose;
};

export type FillInBox = { id: string; label: string };

/** A numbered heading with one box (label "") or several labelled boxes. */
export type FillInGroup = { heading: string; boxes: FillInBox[] };

/** Labelled boxes that save as the person types (week 6's action plan). */
export type FillInBlock = {
  id: string;
  type: "fillIn";
  /** "My action plan". */
  title: string;
  groups: FillInGroup[];
};

/** The existing checklist item's shape (`ChecklistItem` in `courses.ts`). */
export type BlockChecklistItem = {
  id: string;
  title: string;
  detail?: string;
  mirrorToMyWork: boolean;
};

/** Items to tick by hand: steps with nothing to read or write. */
export type ChecklistBlock = {
  id: string;
  type: "checklist";
  items: BlockChecklistItem[];
};

/** A short paragraph on what happens in the session. Behind sign-in. */
export type InTheSessionBlock = {
  id: string;
  type: "inTheSession";
  body: Prose;
  /**
   * "Before you come (about 5 minutes). ..." (Technical AI Safety week 5):
   * what to do before the session, as written, or none. A This week task
   * that says "Get ready" covers it.
   */
  beforeYouCome: Prose;
};

/**
 * One Go further item: a source with one line on why. A source with no
 * single link of its own ("Watch or read" with two links in its line) has
 * an empty title and address, and its line carries the links.
 */
export type GoFurtherItem = Omit<SourceFields, "note"> & { why: Run[] };

/** Optional sources, never counted in time or progress. */
export type GoFurtherBlock = {
  id: string;
  type: "goFurther";
  heading: string;
  intro: Prose;
  items: GoFurtherItem[];
};

/**
 * The hands-on route (Technical AI Safety, every week): an optional list
 * for people who code, outside This week's total and never counted. Its
 * notebooks, exercises and code are prose, as written: code blocks shown
 * exactly, and links.
 */
export type HandsOnBlock = {
  id: string;
  type: "handsOn";
  /** "Hands-on route (optional, for coders)". */
  heading: string;
  body: Prose;
};

export type PartChild =
  | TextBlock
  | SourceBlock
  | ReflectionBlock
  | ChooseOneBlock
  | TableBlock
  | WrittenAnswerBlock
  | CasesBlock
  | FillInBlock
  | ChecklistBlock;

/** A step of the path: a heading, its time, framing text, then its blocks in order. */
export type PartBlock = {
  id: string;
  type: "part";
  /** "Why alignment might be hard" (the "Part 1:" is its place among the parts). */
  title: string;
  /**
   * What the heading's brackets say, as the boards draw it beside the part:
   * a time ("About 25 minutes"), or, for the written answer's part, its
   * word range ("250 to 350 words"). "" when there are none.
   */
  time: string;
  framing: Prose;
  blocks: PartChild[];
};

export type TopBlock =
  | ThisWeekBlock
  | TextBlock
  | OutcomesBlock
  | ContentNoteBlock
  | PartBlock
  | CasesBlock
  | InTheSessionBlock
  | GoFurtherBlock
  | HandsOnBlock;

/** Any block, at the top of a week or inside a part. */
export type WeekBlock = TopBlock | PartChild;

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Is this an id a block or an item may carry? */
export function isWeekItemId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= L.blockId &&
    ID_PATTERN.test(value) &&
    !value.includes("__")
  );
}

/** The prefix a fresh id gets, by what it names: only to make Markdown easier to read. */
export const ID_PREFIX = {
  thisWeek: "tw",
  text: "tx",
  outcomes: "oc",
  contentNote: "cn",
  part: "pt",
  source: "src",
  reflection: "rs",
  prompt: "rp",
  chooseOne: "co",
  pack: "pk",
  table: "tb",
  writtenAnswer: "wa",
  cases: "cs",
  case: "ca",
  fillIn: "fi",
  box: "fb",
  checklist: "ck",
  checkItem: "ci",
  inTheSession: "is",
  goFurther: "gf",
  handsOn: "ho",
  answerBox: "wb",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/**
 * A fresh id: the prefix, then ten random letters and digits. Random rather
 * than counted, so two weeks of one run (and a week and its group's copy
 * after both were edited) never mint the same one.
 */
export function newWeekItemId(prefix: IdPrefix): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(10);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let tail = "";
  for (const byte of bytes) tail += alphabet[byte % alphabet.length];
  return `${prefix}-${tail}`;
}

// ---------------------------------------------------------------------------
// Two shapes of week
// ---------------------------------------------------------------------------

/** Is this a block week? A week written before blocks has no `blocks` key. */
export function isBlockWeek(week: { blocks?: unknown }): week is { blocks: WeekBlock[] } {
  return Array.isArray(week.blocks);
}

/**
 * The `blocks` key as a whole-week copy writes it: `{ blocks }` for a block
 * week and `{}` for any other, so a copy of a week written before blocks
 * still has no `blocks` key (Firestore refuses `undefined`). Every literal
 * that writes a whole week spreads this; a guard walks the tree for one that
 * does not (`tests/course-week-blocks-model.test.mjs`).
 */
export function weekBlocksField(week: { blocks?: WeekBlock[] }): { blocks?: WeekBlock[] } {
  return Array.isArray(week.blocks) ? { blocks: week.blocks } : {};
}

// ---------------------------------------------------------------------------
// Reading a stored week (lenient: keeps what it can trust, inside the caps)
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function asRaw(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/** The ids already taken in the week being read: a second use of one drops the second item. */
type Seen = Set<string>;

function claimId(value: unknown, seen: Seen): string | null {
  if (!isWeekItemId(value) || seen.has(value)) return null;
  seen.add(value);
  return value;
}

function asWhen(value: unknown, fallback: When): When {
  return WHENS.includes(value as When) ? (value as When) : fallback;
}

function asGivenBy(value: unknown, fallback: GivenBy): GivenBy {
  return GIVEN_BY.includes(value as GivenBy) ? (value as GivenBy) : fallback;
}

function asSourceKind(value: unknown): SourceKind | null {
  return SOURCE_KINDS.includes(value as SourceKind) ? (value as SourceKind) : null;
}

/**
 * A source's fields, read: a kind and a title always; an https link, or no
 * link at all when its note carries the links instead.
 */
function sourceFields(raw: Raw): SourceFields | null {
  const kind = asSourceKind(raw.kind);
  const title = oneLine(raw.title, L.sourceTitle);
  const note = sanitizeRuns(raw.note, L.inlineChars);
  const url = safeSourceUrl(raw.url);
  if (!kind || !title) return null;
  if (!url && !note.some((run) => run.href)) return null;
  return {
    kind,
    lead: oneLine(raw.lead, L.sourceLead),
    title,
    url: url ?? "",
    by: oneLine(raw.by, L.sourceBy),
    date: oneLine(raw.date, L.sourceDate),
    time: oneLine(raw.time, L.sourceTime),
    compute: oneLine(raw.compute, L.sourceCompute),
    note,
  };
}

function readThisWeek(raw: Raw, id: string): ThisWeekBlock | null {
  const rows: ThisWeekRow[] = [];
  for (const value of list(raw.rows, L.maxThisWeekRows)) {
    const row = asRaw(value);
    if (!row) continue;
    const what = oneLine(row.what, L.thisWeekWhat);
    if (!what) continue;
    const time = oneLine(row.time, L.thisWeekTime);
    if (row.type === "none" || row.type === "optional") {
      rows.push({ type: row.type, what, time, note: oneLine(row.note, L.thisWeekRowNote) });
    } else if (row.type === "task") {
      const covers = list(row.covers, L.maxWeekBlocks).filter(isWeekItemId);
      rows.push({
        type: "task",
        what,
        time,
        when: asWhen(row.when, "before"),
        whenText: oneLine(row.whenText, L.thisWeekRowNote),
        covers: [...new Set(covers)],
      });
    }
  }
  if (rows.length === 0) return null;
  return {
    id,
    type: "thisWeek",
    rows,
    total: oneLine(raw.total, L.thisWeekTime),
    note: sanitizeProse(raw.note),
  };
}

const TEXT_ROLES: readonly TextRole[] = ["why", "before", "section", "plain"];

function readText(raw: Raw, id: string, inPart: boolean): TextBlock | null {
  const role = TEXT_ROLES.includes(raw.role as TextRole) ? (raw.role as TextRole) : null;
  if (!role) return null;
  if (inPart && role !== "plain") return null;
  const body = sanitizeProse(raw.body);
  const heading = role === "plain" && !inPart ? "" : oneLine(raw.heading, L.textHeading);
  if (role === "section" && !heading) return null;
  if (body.length === 0 && !heading) return null;
  return {
    id,
    type: "text",
    role,
    heading,
    time: role === "before" ? oneLine(raw.time, L.textTime) : "",
    body,
  };
}

function readOutcomes(raw: Raw, id: string): OutcomesBlock | null {
  const items = list(raw.items, L.maxOutcomes)
    .map((item) => oneLine(item, L.outcome))
    .filter(Boolean);
  if (items.length === 0) return null;
  return { id, type: "outcomes", heading: oneLine(raw.heading, L.textHeading), items };
}

function readContentNote(raw: Raw, id: string): ContentNoteBlock | null {
  const links: SupportLink[] = [];
  for (const value of list(raw.links, L.maxSupportLinks)) {
    const link = asRaw(value);
    if (!link) continue;
    const url = safeLinkUrl(link.url);
    const label = oneLine(link.label, L.supportLabel);
    if (!url || !label) continue;
    links.push({ label, url, detail: oneLine(link.detail, L.supportDetail) });
  }
  const body = sanitizeProse(raw.body);
  if (body.length === 0 && links.length === 0) return null;
  return { id, type: "contentNote", body, links };
}

function readSource(raw: Raw, id: string): SourceBlock | null {
  const fields = sourceFields(raw);
  return fields ? { id, type: "source", ...fields } : null;
}

function readReflection(raw: Raw, id: string, seen: Seen): ReflectionBlock | null {
  const prompts: ReflectionPrompt[] = [];
  for (const value of list(raw.prompts, L.maxReflectionPrompts)) {
    const prompt = asRaw(value);
    if (!prompt) continue;
    const text = oneLine(prompt.text, L.reflectionPrompt);
    if (!text) continue;
    const promptId = claimId(prompt.id, seen);
    if (!promptId) continue;
    prompts.push({ id: promptId, text });
  }
  if (prompts.length < L.minReflectionPrompts) return null;
  return { id, type: "reflection", prompts };
}

function readChooseOne(raw: Raw, id: string, seen: Seen): ChooseOneBlock | null {
  const packs: Pack[] = [];
  for (const value of list(raw.packs, L.maxPacks)) {
    const pack = asRaw(value);
    if (!pack) continue;
    const name = oneLine(pack.name, L.packName);
    const read = sanitizeRuns(pack.read, L.packRead);
    if (!name || read.length === 0) continue;
    const packId = claimId(pack.id, seen);
    if (!packId) continue;
    packs.push({
      id: packId,
      name,
      time: oneLine(pack.time, L.sourceTime),
      note: sanitizeRuns(pack.note, L.inlineChars),
      read,
    });
  }
  if (packs.length < L.minPacks) return null;
  return {
    id,
    type: "chooseOne",
    form: raw.form === "list" ? "list" : "table",
    title: oneLine(raw.title, L.chooseOneTitle),
    givenBy: asGivenBy(raw.givenBy, "fellow"),
    kind: asSourceKind(raw.kind) ?? "read",
    time: oneLine(raw.time, L.sourceTime),
    noteHeading: oneLine(raw.noteHeading, L.chooseOneHeading),
    questions: sanitizeProse(raw.questions),
    packs,
  };
}

function readCells(value: unknown): TableCell[] {
  return sanitizeCells(value, L.maxTableColumns);
}

function readTable(raw: Raw, id: string): TableBlock | null {
  const header = readCells(raw.header);
  if (header.length === 0) return null;
  const rows = list(raw.rows, L.maxTableRows)
    .map((row) => readCells(asRaw(row)?.cells))
    .filter((cells) => cells.length > 0)
    .map((cells) => {
      // Every row has the header's width: short rows are padded, long ones cut.
      const fitted = cells.slice(0, header.length);
      while (fitted.length < header.length) fitted.push({ runs: [] });
      return { cells: fitted };
    });
  return { id, type: "table", header, rows };
}

function readWords(value: unknown): WordRange | null {
  const range = asRaw(value);
  if (!range) return null;
  const whole = (n: unknown) =>
    typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= L.maxAnswerWords ? n : null;
  const min = whole(range.min);
  const max = whole(range.max);
  return min !== null && max !== null && min <= max ? { min, max } : null;
}

function readWrittenAnswer(raw: Raw, id: string, seen: Seen): WrittenAnswerBlock | null {
  const prompt = sanitizeProse(raw.prompt);
  if (prompt.length === 0) return null;
  const boxes: AnswerBox[] = [];
  for (const value of list(raw.boxes, L.maxAnswerBoxes)) {
    const box = asRaw(value);
    if (!box) continue;
    const label = oneLine(box.label, L.answerBoxLabel);
    if (!label) continue;
    const boxId = claimId(box.id, seen);
    if (!boxId) continue;
    boxes.push({ id: boxId, label, hint: oneLine(box.hint, L.answerBoxHint) });
  }
  return {
    id,
    type: "writtenAnswer",
    prompt,
    boxes,
    guidance: sanitizeProse(raw.guidance),
    words: readWords(raw.words),
    due: asWhen(raw.due, "dayBefore"),
  };
}

function readTalk(value: unknown): Talk | null {
  const talk = asRaw(value);
  if (!talk) return null;
  const minutes = talk.minutes;
  const name = oneLine(talk.name, L.talkName);
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > L.maxTalkMinutes) return null;
  return name ? { minutes, name } : null;
}

function readCases(raw: Raw, id: string, seen: Seen, inPart: boolean): CasesBlock | null {
  const groups: CaseGroup[] = [];
  let caseCount = 0;
  for (const value of list(raw.groups, L.maxCaseGroups)) {
    const group = asRaw(value);
    if (!group) continue;
    const cases: Case[] = [];
    for (const caseValue of list(group.cases, L.maxCases)) {
      if (caseCount >= L.maxCases) break;
      const caseRaw = asRaw(caseValue);
      if (!caseRaw) continue;
      const title = oneLine(caseRaw.title, L.caseTitle);
      if (!title || !isWeekItemId(caseRaw.id) || seen.has(caseRaw.id)) continue;
      cases.push({
        id: claimId(caseRaw.id, seen) as string,
        title,
        what: sanitizeRuns(caseRaw.what, L.inlineChars),
        start: sanitizeRuns(caseRaw.start, L.caseStart),
        contentNote: oneLine(caseRaw.contentNote, L.caseContentNote),
      });
      caseCount += 1;
    }
    if (cases.length === 0) continue;
    groups.push({
      name: oneLine(group.name, L.caseGroupName),
      packId: isWeekItemId(group.packId) ? group.packId : null,
      cases,
    });
  }
  const talk = readTalk(raw.talk);
  if (groups.length === 0 && !talk) return null;
  return {
    id,
    type: "cases",
    heading: inPart ? "" : oneLine(raw.heading, L.casesHeading),
    intro: sanitizeProse(raw.intro),
    talk,
    prepare: sanitizeProse(raw.prepare),
    givenBy: asGivenBy(raw.givenBy, "facilitator"),
    groupLabel: oneLine(raw.groupLabel, L.casesColumn),
    startLabel: oneLine(raw.startLabel, L.casesColumn) || "Start here",
    groups,
    note: sanitizeProse(raw.note),
  };
}

function readFillIn(raw: Raw, id: string, seen: Seen): FillInBlock | null {
  const groups: FillInGroup[] = [];
  let boxCount = 0;
  for (const value of list(raw.groups, L.maxFillInGroups)) {
    const group = asRaw(value);
    if (!group) continue;
    const heading = oneLine(group.heading, L.fillInHeading);
    if (!heading) continue;
    const boxes: FillInBox[] = [];
    for (const boxValue of list(group.boxes, L.maxFillInBoxes)) {
      if (boxCount >= L.maxFillInBoxes) break;
      const box = asRaw(boxValue);
      if (!box) continue;
      const boxId = claimId(box.id, seen);
      if (!boxId) continue;
      boxes.push({ id: boxId, label: oneLine(box.label, L.fillInLabel) });
      boxCount += 1;
    }
    if (boxes.length === 0) continue;
    groups.push({ heading, boxes });
  }
  if (groups.length === 0) return null;
  return { id, type: "fillIn", title: oneLine(raw.title, L.fillInTitle), groups };
}

function readChecklist(raw: Raw, id: string, seen: Seen): ChecklistBlock | null {
  const items: BlockChecklistItem[] = [];
  for (const value of list(raw.items, L.maxChecklistBlockItems)) {
    const item = asRaw(value);
    if (!item) continue;
    const title = oneLine(item.title, L.checklistItemTitle);
    if (!title) continue;
    const itemId = claimId(item.id, seen);
    if (!itemId) continue;
    const detail = oneLine(item.detail, L.checklistItemDetail);
    items.push({ id: itemId, title, ...(detail ? { detail } : {}), mirrorToMyWork: item.mirrorToMyWork === true });
  }
  if (items.length === 0) return null;
  return { id, type: "checklist", items };
}

function readInTheSession(raw: Raw, id: string): InTheSessionBlock | null {
  const body = sanitizeProse(raw.body);
  const beforeYouCome = sanitizeProse(raw.beforeYouCome);
  return body.length > 0 || beforeYouCome.length > 0 ? { id, type: "inTheSession", body, beforeYouCome } : null;
}

function readGoFurther(raw: Raw, id: string): GoFurtherBlock | null {
  const items: GoFurtherItem[] = [];
  for (const value of list(raw.items, L.maxGoFurther)) {
    const item = asRaw(value);
    if (!item) continue;
    const fields = sourceFields({ ...item, note: item.why });
    if (fields) {
      const { note, ...rest } = fields;
      items.push({ ...rest, why: note });
      continue;
    }
    // An item with no title of its own: its kind, then its line, links and all.
    const kind = asSourceKind(item.kind);
    const why = sanitizeRuns(item.why, L.inlineChars);
    if (!kind || why.length === 0 || oneLine(item.title, L.sourceTitle)) continue;
    items.push({ kind, lead: "", title: "", url: "", by: "", date: "", time: "", compute: "", why });
  }
  if (items.length === 0) return null;
  return { id, type: "goFurther", heading: oneLine(raw.heading, L.goFurtherHeading), intro: sanitizeProse(raw.intro), items };
}

function readHandsOn(raw: Raw, id: string): HandsOnBlock | null {
  const body = sanitizeProse(raw.body, L.proseChars * 2);
  if (body.length === 0) return null;
  return { id, type: "handsOn", heading: oneLine(raw.heading, L.handsOnHeading), body };
}

function readBlock(value: unknown, seen: Seen, inPart: boolean): WeekBlock | null {
  const raw = asRaw(value);
  if (!raw || typeof raw.type !== "string") return null;
  const type = raw.type as BlockType;
  if (!(inPart ? PART_CHILD_TYPES : TOP_LEVEL_TYPES).includes(type)) return null;
  if (!isWeekItemId(raw.id) || seen.has(raw.id)) return null;
  const id = raw.id;
  seen.add(id);
  switch (type) {
    case "thisWeek":
      return readThisWeek(raw, id);
    case "text":
      return readText(raw, id, inPart);
    case "outcomes":
      return readOutcomes(raw, id);
    case "contentNote":
      return readContentNote(raw, id);
    case "part":
      return readPart(raw, id, seen);
    case "source":
      return readSource(raw, id);
    case "reflection":
      return readReflection(raw, id, seen);
    case "chooseOne":
      return readChooseOne(raw, id, seen);
    case "table":
      return readTable(raw, id);
    case "writtenAnswer":
      return readWrittenAnswer(raw, id, seen);
    case "cases":
      return readCases(raw, id, seen, inPart);
    case "fillIn":
      return readFillIn(raw, id, seen);
    case "checklist":
      return readChecklist(raw, id, seen);
    case "inTheSession":
      return readInTheSession(raw, id);
    case "goFurther":
      return readGoFurther(raw, id);
    case "handsOn":
      return readHandsOn(raw, id);
  }
  return null;
}

function readPart(raw: Raw, id: string, seen: Seen): PartBlock | null {
  const title = oneLine(raw.title, L.partTitle);
  if (!title) return null;
  const blocks: PartChild[] = [];
  for (const value of list(raw.blocks, L.maxPartBlocks)) {
    const block = readBlock(value, seen, true);
    if (block) blocks.push(block as PartChild);
  }
  return {
    id,
    type: "part",
    title,
    time: oneLine(raw.time, L.partTime),
    framing: sanitizeProse(raw.framing),
    blocks,
  };
}

/** The kinds of block a This week task may cover. */
export const COVERABLE_TYPES: readonly BlockType[] = ["part", "writtenAnswer", "cases", "inTheSession"];

/**
 * A stored `blocks` list, read: each block rebuilt key by key (never a
 * spread of what was stored), unknown kinds and malformed items dropped, a
 * reused id dropped with the item that reuses it (the first keeps it), every
 * text and list cut to its cap, every link checked, and the cases' pack
 * names and This week's covers held to ids the week still has. A list that
 * passes `weekBlocksProblems` reads back unchanged.
 */
export function sanitizeWeekBlocks(raw: unknown): WeekBlock[] {
  if (!Array.isArray(raw)) return [];
  const seen: Seen = new Set();
  const blocks: WeekBlock[] = [];
  for (const value of raw.slice(0, L.maxWeekBlocks)) {
    const block = readBlock(value, seen, false);
    if (block) blocks.push(block);
  }
  // Pointers inside the week must name something the week still has.
  const packs = new Set<string>();
  const covered = new Set<string>();
  for (const block of allBlocks(blocks)) {
    if (block.type === "chooseOne") for (const pack of block.packs) packs.add(pack.id);
    if (COVERABLE_TYPES.includes(block.type)) covered.add(block.id);
  }
  return blocks.map((block) => {
    if (block.type === "thisWeek") {
      return {
        ...block,
        rows: block.rows.map((row) =>
          row.type === "task" ? { ...row, covers: row.covers.filter((id) => covered.has(id)) } : row,
        ),
      };
    }
    if (block.type === "cases") return withKnownPacks(block, packs);
    if (block.type === "part") {
      return {
        ...block,
        blocks: block.blocks.map((child) => (child.type === "cases" ? withKnownPacks(child, packs) : child)),
      };
    }
    return block;
  });
}

function withKnownPacks(block: CasesBlock, packs: Set<string>): CasesBlock {
  return {
    ...block,
    groups: block.groups.map((group) => ({
      ...group,
      packId: group.packId && packs.has(group.packId) ? group.packId : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Walking a week
// ---------------------------------------------------------------------------

/** Every block of a week in page order, each part followed by its own blocks. */
export function allBlocks(blocks: readonly WeekBlock[]): WeekBlock[] {
  const out: WeekBlock[] = [];
  for (const block of blocks) {
    out.push(block);
    if (block.type === "part") out.push(...block.blocks);
  }
  return out;
}

/** The parts of a week, in order: part N is `parts[N - 1]`. */
export function partsOf(blocks: readonly WeekBlock[]): PartBlock[] {
  return blocks.filter((block): block is PartBlock => block.type === "part");
}

/** What kind of thing an id names, for the paste's matching and its checks. */
export type ItemKind = `block:${BlockType}` | "pack" | "prompt" | "case" | "box" | "answerBox" | "checkItem";

export type WeekItem = {
  id: string;
  kind: ItemKind;
  /** Words a person recognises the item by: a title, a prompt, a heading. */
  label: string;
};

/**
 * Every id in a week, in page order, with what it names. A Source block's id
 * is its block's; each pack, prompt, case, box and checklist item has its
 * own.
 */
export function weekItems(blocks: readonly WeekBlock[]): WeekItem[] {
  const out: WeekItem[] = [];
  for (const block of allBlocks(blocks)) {
    out.push({ id: block.id, kind: `block:${block.type}`, label: blockLabel(block) });
    switch (block.type) {
      case "reflection":
        for (const prompt of block.prompts) out.push({ id: prompt.id, kind: "prompt", label: prompt.text });
        break;
      case "chooseOne":
        for (const pack of block.packs) out.push({ id: pack.id, kind: "pack", label: pack.name });
        break;
      case "cases":
        for (const group of block.groups) for (const item of group.cases) out.push({ id: item.id, kind: "case", label: item.title });
        break;
      case "fillIn":
        for (const group of block.groups) {
          for (const box of group.boxes) out.push({ id: box.id, kind: "box", label: box.label || group.heading });
        }
        break;
      case "writtenAnswer":
        for (const box of block.boxes) out.push({ id: box.id, kind: "answerBox", label: box.label });
        break;
      case "checklist":
        for (const item of block.items) out.push({ id: item.id, kind: "checkItem", label: item.title });
        break;
      default:
        break;
    }
  }
  return out;
}

function firstLine(prose: Prose): string {
  const first = prose.find((p) => p.type === "p");
  return first && first.type === "p" ? runsText(first.runs) : "";
}

/** Words that name a block, for a list of what is in a week. */
export function blockLabel(block: WeekBlock): string {
  switch (block.type) {
    case "thisWeek":
      return "This week";
    case "text":
      return block.heading || firstLine(block.body) || "Text";
    case "outcomes":
      return block.heading || "After this week you can";
    case "contentNote":
      return "Content note";
    case "part":
      return block.title;
    case "source":
      return block.title;
    case "reflection":
      return block.prompts[0]?.text ?? "Reflect";
    case "chooseOne":
      return block.title || "Choose one";
    case "table":
      return runsText(block.header[0]?.runs ?? []) || "Table";
    case "writtenAnswer":
      return firstLine(block.prompt) || "Written answer";
    case "cases":
      return block.heading || (block.talk ? `A ${block.talk.minutes}-minute ${block.talk.name}` : "Cases");
    case "fillIn":
      return block.title || "Fill in";
    case "checklist":
      return block.items[0]?.title ?? "Checklist";
    case "inTheSession":
      return "In the session";
    case "goFurther":
      return block.heading || "Go further";
    case "handsOn":
      return block.heading || "Hands-on route";
  }
}

// ---------------------------------------------------------------------------
// Checking a week before it is stored (strict: says what to change)
// ---------------------------------------------------------------------------

/** "Part 2", "This week", "Your case study": where a problem is, in the week's own words. */
function placeOf(block: WeekBlock, partNumber: number | null): string {
  const inPart = partNumber !== null ? `Part ${partNumber}` : null;
  switch (block.type) {
    case "part":
      return `Part ${partNumber ?? "?"}`;
    case "thisWeek":
      return "This week";
    case "outcomes":
      return "After this week you can";
    case "contentNote":
      return "The content note";
    case "inTheSession":
      return "In the session";
    case "goFurther":
      return "Go further";
    case "handsOn":
      return "The hands-on route";
    case "text":
      return block.heading ? `“${block.heading}”` : inPart ? `Text in ${inPart}` : "Text";
    case "source":
      return `${inPart ? `${inPart}’s source` : "The source"} “${block.title}”`;
    case "reflection":
      return inPart ? `${inPart}’s reflection stop` : "A reflection stop";
    case "chooseOne":
      return inPart ? `${inPart}’s packs` : "The packs";
    case "table":
      return inPart ? `${inPart}’s table` : "A table";
    case "writtenAnswer":
      return inPart ? `${inPart}’s written answer` : "The written answer";
    case "cases":
      return block.heading ? `“${block.heading}”` : inPart ? `${inPart}’s talk` : "The cases";
    case "fillIn":
      return `“${block.title || "Fill in"}”`;
    case "checklist":
      return inPart ? `${inPart}’s checklist` : "A checklist";
  }
}

function tooLong(where: string, what: string, value: string, max: number, out: string[]): void {
  if (value.length > max) out.push(`${where}: ${what} is ${value.length} characters; the most is ${max}.`);
}

function tooMany(where: string, what: string, count: number, max: number, out: string[]): void {
  if (count > max) out.push(`${where} has ${count} ${what}; the most is ${max}.`);
}

/** What stops some prose being stored, against the caps every prose field keeps (a guide page's text is held to them too). */
export function proseProblems(where: string, prose: Prose, out: string[], max: number = L.proseChars): void {
  tooMany(where, "paragraphs, lists, tables and code blocks", prose.length, L.maxProseParagraphs, out);
  for (const p of prose) {
    if (p.type === "ul" || p.type === "ol") tooMany(where, "items in a list", p.items.length, L.maxProseListItems, out);
    if (p.type === "table") {
      tooMany(where, "columns in a table", p.header.length, L.maxProseTableColumns, out);
      tooMany(where, "rows in a table", p.rows.length, L.maxProseTableRows, out);
    }
    if (p.type === "code") {
      tooLong(where, "a block of code", p.text, L.codeChars, out);
      if (!/^[A-Za-z0-9+#.-]*$/.test(p.lang) || p.lang.length > L.codeLang) {
        out.push(`${where}: the word after a block of code’s opening backticks names its language, in at most ${L.codeLang} letters and digits.`);
      }
    }
  }
  const chars = proseChars(prose);
  if (chars > max) out.push(`${where}: the text is ${chars} characters; the most is ${max}.`);
}

/** What stops a line of runs being stored: its length against `max`, and its changes of style. */
export function runsProblems(where: string, what: string, runs: readonly Run[], max: number, out: string[]): void {
  const text = runsText(runs);
  if (text.length > max) out.push(`${where}: ${what} is ${text.length} characters; the most is ${max}.`);
  if (runs.length > L.maxRuns) out.push(`${where}: ${what} has too many changes of style.`);
}

function sourceProblems(where: string, source: SourceFields, out: string[]): void {
  if (!source.title) out.push(`${where} has no title.`);
  if (source.url ? !safeSourceUrl(source.url) : !source.note.some((run) => run.href)) out.push(`${where} needs an https link.`);
  tooLong(where, "the words before its title", source.lead, L.sourceLead, out);
  tooLong(where, "the title", source.title, L.sourceTitle, out);
  tooLong(where, "the author or source", source.by, L.sourceBy, out);
  tooLong(where, "the date", source.date, L.sourceDate, out);
  tooLong(where, "the time", source.time, L.sourceTime, out);
  tooLong(where, "what it needs to run", source.compute, L.sourceCompute, out);
  runsProblems(where, "the note", source.note, L.inlineChars, out);
}

function blockProblems(block: WeekBlock, partNumber: number | null, out: string[]): void {
  const where = placeOf(block, partNumber);
  switch (block.type) {
    case "thisWeek": {
      if (block.rows.length === 0) out.push("This week has no tasks.");
      tooMany(where, "rows", block.rows.length, L.maxThisWeekRows, out);
      for (const row of block.rows) {
        tooLong(where, `“${row.what.slice(0, 40)}”`, row.what, L.thisWeekWhat, out);
        tooLong(where, "a time", row.time, L.thisWeekTime, out);
        tooLong(where, "a row’s when", row.type === "task" ? row.whenText : row.note, L.thisWeekRowNote, out);
      }
      tooLong(where, "In all", block.total, L.thisWeekTime, out);
      proseProblems(where, block.note, out);
      break;
    }
    case "text":
      if (block.role === "section" && !block.heading) out.push(`${where} has no heading.`);
      tooLong(where, "the heading", block.heading, L.textHeading, out);
      tooLong(where, "the time", block.time, L.textTime, out);
      proseProblems(where, block.body, out);
      break;
    case "outcomes":
      if (block.items.length === 0) out.push(`${where} has no outcomes.`);
      tooLong(where, "the heading", block.heading, L.textHeading, out);
      tooMany(where, "outcomes", block.items.length, L.maxOutcomes, out);
      for (const item of block.items) tooLong(where, "an outcome", item, L.outcome, out);
      break;
    case "contentNote":
      tooMany(where, "support links", block.links.length, L.maxSupportLinks, out);
      for (const link of block.links) {
        if (!safeLinkUrl(link.url)) out.push(`${where}: “${link.label}” needs an https link.`);
        tooLong(where, "a link’s words", link.label, L.supportLabel, out);
        tooLong(where, "a link’s line", link.detail, L.supportDetail, out);
      }
      proseProblems(where, block.body, out);
      break;
    case "part":
      if (!block.title) out.push(`${where} has no title.`);
      tooLong(where, "the title", block.title, L.partTitle, out);
      tooLong(where, "the time", block.time, L.partTime, out);
      tooMany(where, "blocks", block.blocks.length, L.maxPartBlocks, out);
      proseProblems(where, block.framing, out);
      for (const child of block.blocks) {
        if (!PART_CHILD_TYPES.includes(child.type)) out.push(`${where} holds something a part cannot.`);
        blockProblems(child, partNumber, out);
      }
      break;
    case "source":
      sourceProblems(where, block, out);
      break;
    case "reflection":
      if (block.prompts.length < L.minReflectionPrompts || block.prompts.length > L.maxReflectionPrompts) {
        out.push(`${where} has ${block.prompts.length} prompts; a stop holds 1 or 2. Start another Reflect for more.`);
      }
      for (const prompt of block.prompts) {
        if (!prompt.text) out.push(`${where} has an empty prompt.`);
        tooLong(where, "a prompt", prompt.text, L.reflectionPrompt, out);
      }
      break;
    case "chooseOne":
      if (block.packs.length < L.minPacks) out.push(`${where}: a Choose one needs at least ${L.minPacks} packs to choose from.`);
      tooMany(where, "packs", block.packs.length, L.maxPacks, out);
      tooLong(where, "the title", block.title, L.chooseOneTitle, out);
      tooLong(where, "the time", block.time, L.sourceTime, out);
      tooLong(where, "a heading", block.noteHeading, L.chooseOneHeading, out);
      proseProblems(where, block.questions, out);
      for (const pack of block.packs) {
        const at = `${where}, “${pack.name}”`;
        if (!pack.name) out.push(`${where}: a pack has no name.`);
        if (pack.read.length === 0) out.push(`${at} has nothing to read.`);
        if (!pack.read.some((run) => run.href)) out.push(`${at} needs a link to what to read.`);
        tooLong(at, "the name", pack.name, L.packName, out);
        tooLong(at, "the time", pack.time, L.sourceTime, out);
        runsProblems(at, "the note", pack.note, L.inlineChars, out);
        runsProblems(at, "what to read", pack.read, L.packRead, out);
      }
      break;
    case "table":
      if (block.header.length === 0) out.push(`${where} has no header row.`);
      tooMany(where, "columns", block.header.length, L.maxTableColumns, out);
      tooMany(where, "rows", block.rows.length, L.maxTableRows, out);
      for (const row of block.rows) {
        if (row.cells.length !== block.header.length) out.push(`${where}: every row needs ${block.header.length} cells.`);
        for (const cell of row.cells) runsProblems(where, "a cell", cell.runs, L.inlineChars, out);
      }
      break;
    case "writtenAnswer":
      if (block.prompt.length === 0) out.push(`${where} has no question.`);
      proseProblems(where, block.prompt, out);
      tooMany(where, "boxes", block.boxes.length, L.maxAnswerBoxes, out);
      for (const box of block.boxes) {
        tooLong(where, "a box’s heading", box.label, L.answerBoxLabel, out);
        tooLong(where, "a box’s hint", box.hint, L.answerBoxHint, out);
      }
      if (block.boxes.length > 0 && block.words) out.push(`${where}: a word range is counted over one box, so an answer in boxes has none.`);
      proseProblems(where, block.guidance, out);
      if (block.words && (block.words.min < 1 || block.words.min > block.words.max || block.words.max > L.maxAnswerWords)) {
        out.push(`${where}: the word range has to run from a smaller number to a larger one, at most ${L.maxAnswerWords}.`);
      }
      break;
    case "cases": {
      if (block.groups.length === 0 && !block.talk) out.push(`${where} has no cases and no talk.`);
      if (partNumber !== null && block.groups.length > 0) out.push(`${where}: cases go in their own section, “Your case study”.`);
      tooMany(where, "groups", block.groups.length, L.maxCaseGroups, out);
      const count = block.groups.reduce((n, group) => n + group.cases.length, 0);
      tooMany(where, "cases", count, L.maxCases, out);
      tooLong(where, "the heading", block.heading, L.casesHeading, out);
      tooLong(where, "a column’s heading", block.groupLabel, L.casesColumn, out);
      tooLong(where, "a column’s heading", block.startLabel, L.casesColumn, out);
      if (block.talk && (block.talk.minutes < 1 || block.talk.minutes > L.maxTalkMinutes)) {
        out.push(`${where}: a talk is 1 to ${L.maxTalkMinutes} minutes.`);
      }
      if (block.talk) tooLong(where, "the talk’s name", block.talk.name, L.talkName, out);
      proseProblems(where, block.intro, out);
      proseProblems(where, block.prepare, out);
      proseProblems(where, block.note, out);
      // The Markdown tells how to prepare from the introduction by its first words ("Prepare a 3-minute talk").
      if (block.prepare.length > 0 && !/^prepare\b/i.test(firstLine(block.prepare))) {
        out.push(`${where}: how to prepare starts with a line that begins “Prepare”.`);
      }
      for (const group of block.groups) {
        tooLong(where, "a group’s name", group.name, L.caseGroupName, out);
        for (const item of group.cases) {
          const at = `${where}, “${item.title}”`;
          tooLong(at, "the title", item.title, L.caseTitle, out);
          runsProblems(at, "what happened", item.what, L.inlineChars, out);
          runsProblems(at, "where to start", item.start, L.caseStart, out);
          tooLong(at, "the content note", item.contentNote, L.caseContentNote, out);
        }
      }
      break;
    }
    case "fillIn": {
      if (block.groups.length === 0) out.push(`${where} has no boxes.`);
      tooMany(where, "numbered headings", block.groups.length, L.maxFillInGroups, out);
      const boxes = block.groups.reduce((n, group) => n + group.boxes.length, 0);
      tooMany(where, "boxes", boxes, L.maxFillInBoxes, out);
      tooLong(where, "the title", block.title, L.fillInTitle, out);
      for (const group of block.groups) {
        if (group.boxes.length === 0) out.push(`${where}: “${group.heading}” has no box.`);
        tooLong(where, "a heading", group.heading, L.fillInHeading, out);
        for (const box of group.boxes) tooLong(where, "a box’s label", box.label, L.fillInLabel, out);
      }
      break;
    }
    case "checklist":
      if (block.items.length === 0) out.push(`${where} has nothing to tick.`);
      tooMany(where, "items", block.items.length, L.maxChecklistBlockItems, out);
      for (const item of block.items) {
        tooLong(where, "an item", item.title, L.checklistItemTitle, out);
        tooLong(where, "an item’s detail", item.detail ?? "", L.checklistItemDetail, out);
      }
      break;
    case "inTheSession":
      if (block.body.length === 0 && block.beforeYouCome.length === 0) out.push(`${where} is empty.`);
      proseProblems(where, block.body, out);
      proseProblems(where, block.beforeYouCome, out);
      // The Markdown tells it from the session's own paragraphs by its first words.
      if (block.beforeYouCome.length > 0 && !/^before you come\b/i.test(firstLine(block.beforeYouCome))) {
        out.push(`${where}: what to do before you come starts with a line that begins “Before you come”.`);
      }
      break;
    case "goFurther":
      tooLong(where, "the heading", block.heading, L.goFurtherHeading, out);
      tooMany(where, "items", block.items.length, L.maxGoFurther, out);
      proseProblems(where, block.intro, out);
      for (const item of block.items) {
        const at = item.title ? `${where}, “${item.title}”` : where;
        if (item.title) sourceProblems(at, { ...item, note: item.why }, out);
        else if (item.why.length === 0) out.push(`${where}: an item has no title and no words.`);
        else runsProblems(at, "the line on why", item.why, L.inlineChars, out);
      }
      break;
    case "handsOn":
      tooLong(where, "the heading", block.heading, L.handsOnHeading, out);
      if (block.body.length === 0) out.push(`${where} is empty.`);
      proseProblems(where, block.body, out, L.proseChars * 2);
      break;
  }
}

/**
 * What stops these blocks being stored, each in a sentence that says what to
 * change, or `[]` when they can be. The server asks this before it writes;
 * blocks it passes read back from `sanitizeWeekBlocks` unchanged.
 */
export function weekBlocksProblems(blocks: readonly WeekBlock[]): string[] {
  const out: string[] = [];
  tooMany("The week", "blocks", blocks.length, L.maxWeekBlocks, out);
  let partNumber = 0;
  for (const block of blocks) {
    if (!TOP_LEVEL_TYPES.includes(block.type)) {
      out.push(`${placeOf(block, null)} has to sit inside a part.`);
      continue;
    }
    if (block.type === "part") partNumber += 1;
    else if (block.type === "text" && block.role === "plain" && partNumber > 0) {
      out.push("Text with no heading of its own after a part belongs inside that part.");
    }
    blockProblems(block, block.type === "part" ? partNumber : null, out);
  }
  const seen = new Set<string>();
  for (const item of weekItems(blocks)) {
    if (!isWeekItemId(item.id)) out.push(`“${item.label}” has an id the site can’t use: ${JSON.stringify(item.id)}.`);
    else if (seen.has(item.id)) out.push(`The id ${item.id} is used twice.`);
    seen.add(item.id);
  }
  const covered = new Set(allBlocks(blocks).filter((block) => COVERABLE_TYPES.includes(block.type)).map((block) => block.id));
  for (const block of blocks) {
    if (block.type !== "thisWeek") continue;
    for (const row of block.rows) {
      if (row.type === "task" && row.covers.some((id) => !covered.has(id))) {
        out.push(`This week: “${row.what}” points at something the week doesn’t have.`);
      }
    }
  }
  const chars = JSON.stringify(blocks).length;
  if (chars > L.maxWeekBlocksChars) {
    out.push(`The week is ${chars} characters stored; the most is ${L.maxWeekBlocksChars}. Move some of it to another week.`);
  }
  return out;
}
