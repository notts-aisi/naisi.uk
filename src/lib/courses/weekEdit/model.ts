import { facilitatorMaterialIn } from "../facilitatorGuide/recognise";
import { proseToMarkdown, runsToMarkdown } from "../weekBlocks/markdownWrite";
import { guideTextReader } from "../weekBlocks/markdownRead";
import { WEEK_BLOCK_LIMITS as L } from "../weekBlocks/limits";
import {
  SOURCE_KINDS,
  WHENS,
  allBlocks,
  sanitizeWeekBlocks,
  weekBlocksProblems,
  type PartBlock,
  type ReflectionBlock,
  type SourceBlock,
  type SourceKind,
  type TextBlock,
  type TextRole,
  type When,
  type WeekBlock,
  type WordRange,
  type WrittenAnswerBlock,
} from "../weekBlocks/model";
import { oneLine, proseText, safeSourceUrl, type Prose, type Run } from "../weekBlocks/prose";
import { EDIT_REFUSAL, HISTORY_WORDS, sourceOwnerWords } from "./words";

/**
 * CHANGING ONE BLOCK OF A WEEK WHERE IT STANDS: the pure half.
 *
 * A week written as blocks (`src/lib/courses/weekBlocks/model.ts`) is
 * changed today by pasting the whole of it again. This changes one block in
 * place, for four kinds: a source, a text, a reflection and a written answer.
 * Every other kind is refused with one sentence (`EDIT_REFUSAL.kind`); the
 * paste still changes anything.
 *
 * IDS NEVER MOVE. People's ticks and answers are keyed on the ids inside a
 * week: a source's own id, a reflection's prompt ids, a written answer's id
 * and its boxes' ids. An edit rewrites only the words and settings of the
 * block it names, and copies every id across untouched, so every tick and
 * every answer stays with the block it was given to, with no further work.
 * Nothing here can add, remove or reorder a block, a prompt or a box.
 *
 * THE SAME CHECKS AS A PASTE. The edited week is held to `weekBlocksProblems`,
 * the check the paste route stores nothing without, and must read back from
 * `sanitizeWeekBlocks` exactly as it is written, so a week can never hold a
 * block the reader of weeks would refuse or change. Only a problem the edit
 * brings is a reason to refuse: a week stored before a cap was added is not
 * held hostage by a block nobody touched.
 *
 * TEXT GOES IN AS MARKDOWN. Rich fields (a text's words, a written answer's
 * question and guidance, a source's note) travel to and from the page as
 * Markdown and are read with the one reader a week's text is read with
 * (`guideTextReader`), so a field says on the page exactly what the paste
 * would make of it, and nothing the paste refuses (HTML, a picture, a link
 * that is not https) gets in this way either, and Markdown the paste would
 * refuse as facilitator material (`facilitatorMaterialIn`) is refused here too.
 *
 * Pure: no reads and no clock. The route reads the week and its answers.
 */

// ---------------------------------------------------------------------------
// The kinds this slice edits
// ---------------------------------------------------------------------------

export const EDITABLE_TYPES = ["source", "text", "reflection", "writtenAnswer"] as const;
export type EditableType = (typeof EDITABLE_TYPES)[number];

export function isEditableType(type: string): type is EditableType {
  return (EDITABLE_TYPES as readonly string[]).includes(type);
}

/** Where a block sits: the block, the part holding it (or none) and that part's number among the parts. */
export type Located = {
  block: WeekBlock;
  part: PartBlock | null;
  /** 1 for the week's first part; null for a block at the top of the week. */
  partNumber: number | null;
};

/** The block with this id, at the top of the week or inside a part, with where it sits. Null when the week has none. */
export function locateBlock(blocks: readonly WeekBlock[], blockId: string): Located | null {
  let partNumber = 0;
  for (const block of blocks) {
    if (block.type === "part") {
      partNumber += 1;
      if (block.id === blockId) return { block, part: null, partNumber };
      for (const child of block.blocks) {
        if (child.id === blockId) return { block: child, part: block, partNumber };
      }
    } else if (block.id === blockId) {
      return { block, part: null, partNumber: null };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// A block's fingerprint: has it changed since the editor loaded it?
// ---------------------------------------------------------------------------

/**
 * A short, stable mark of a stored value: the same value always gives the
 * same mark, and any change to it almost certainly gives another. For "has
 * this block changed since the editor loaded it" (somebody pasted the week
 * meanwhile), never for anything a person could be fooled by: two 32-bit
 * hashes of the JSON, so a collision needs about 2^32 tries. Blocks read
 * through `sanitizeWeekBlocks` are rebuilt key by key in one order, so one
 * block's JSON is one string.
 */
export function fingerprintOf(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

/** The fingerprint the editor echoes back with a save: the block as stored. */
export function blockFingerprint(block: WeekBlock): string {
  return fingerprintOf(block);
}

/** A whole week's blocks' fingerprint: whether the newest saved version is still what is stored. */
export function weekFingerprint(blocks: readonly WeekBlock[]): string {
  return fingerprintOf(blocks);
}

/** Every `id` in a list of blocks, as stored or as read, however deep, sorted: what a week's ticks and answers hang on. */
export function itemIdsOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) itemIdsOf(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" && typeof inner === "string") out.push(inner);
      else itemIdsOf(inner, out);
    }
  }
  return out;
}

/**
 * Whether reading a week's stored blocks dropped anything: the item ids as
 * read differ from the item ids as stored. The reader of weeks keeps what it
 * can trust inside today's caps (`sanitizeWeekBlocks`), so a list over a
 * tightened cap, an unknown kind or a reused id is read without some items.
 * An edit and a restore write the whole week back as read, so they refuse
 * such a week rather than drop those items and detach their ticks and answers.
 */
export function readDropsItems(storedBlocks: unknown, read: readonly WeekBlock[]): boolean {
  const stored = itemIdsOf(storedBlocks).sort();
  const kept = itemIdsOf(read).sort();
  return stored.length !== kept.length || stored.some((id, index) => id !== kept[index]);
}

// ---------------------------------------------------------------------------
// Text to and from Markdown, read as a week's text is
// ---------------------------------------------------------------------------

/** Prose as the page edits it: Markdown, a blank line between paragraphs. */
export function proseMarkdown(prose: Prose): string {
  return proseToMarkdown(prose).join("\n\n");
}

/** A line of runs as the page edits it: one line of Markdown. */
export function runsMarkdown(runs: readonly Run[]): string {
  return runsToMarkdown(runs);
}

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

/** What reading some Markdown left out, in one sentence, or null. */
function leftOutSentence(where: string, reader: ReturnType<typeof guideTextReader>): string | null {
  const out = reader.leftOut();
  if (out.refused.length > 0) return EDIT_REFUSAL.linkNotHttps(where, out.refused[0]);
  if (out.images > 0) return EDIT_REFUSAL.picture(where);
  if (out.html.length > 0) return EDIT_REFUSAL.html(where);
  return null;
}

/** Markdown read as prose, exactly as a week's text is read; a refusal for anything the reader leaves out. */
export function proseFromMarkdown(where: string, markdown: string): Read<Prose> {
  // Facilitator material never goes in a week, which anyone signed in can
  // read: the paste's own refusal, asked of every field here.
  const material = facilitatorMaterialIn(markdown);
  if (material) return { ok: false, error: material };
  const reader = guideTextReader();
  const prose = reader.prose(reader.tokens(markdown));
  const left = leftOutSentence(where, reader);
  return left ? { ok: false, error: left } : { ok: true, value: prose };
}

/** One line of Markdown read as runs; a refusal for more than one paragraph, or for anything the reader leaves out. */
export function runsFromMarkdown(where: string, markdown: string): Read<Run[]> {
  const material = facilitatorMaterialIn(markdown);
  if (material) return { ok: false, error: material };
  const reader = guideTextReader();
  const tokens = reader.tokens(markdown).filter((token) => token.type !== "space");
  if (tokens.length === 0) return { ok: true, value: [] };
  if (tokens.length > 1 || tokens[0].type !== "paragraph") return { ok: false, error: EDIT_REFUSAL.oneLine(where) };
  const runs = reader.line((tokens[0] as { tokens?: Parameters<typeof reader.line>[0] }).tokens);
  const left = leftOutSentence(where, reader);
  return left ? { ok: false, error: left } : { ok: true, value: runs };
}

// ---------------------------------------------------------------------------
// What the editor shows of a block, field by field
// ---------------------------------------------------------------------------

export type SourceEditorFields = {
  kind: SourceKind;
  title: string;
  /** Its https address, or "" for a source whose note carries its links. */
  url: string;
  by: string;
  date: string;
  time: string;
  /** One line of Markdown. */
  note: string;
};

export type TextEditorFields = {
  role: TextRole;
  heading: string;
  /** Whether this text may carry a heading at all (a plain text at the top of a week has none). */
  headingAllowed: boolean;
  time: string;
  /** Only Before the session carries a time. */
  timeAllowed: boolean;
  /** Markdown. */
  body: string;
};

export type ReflectionEditorFields = {
  /** One or two, in order; the ids stay. */
  prompts: Array<{ id: string; text: string }>;
};

export type WrittenAnswerEditorFields = {
  /** The heading people read it under: its part's title. Null for an answer outside a part. */
  heading: string | null;
  /** The question, as Markdown. */
  question: string;
  /** What a strong answer does, as Markdown; "" for none. */
  guidance: string;
  words: WordRange | null;
  due: When;
  /** Its labelled boxes, shown and not changed here: an answer in boxes has no word range. */
  boxes: Array<{ id: string; label: string }>;
};

export type EditorFields =
  | { type: "source"; fields: SourceEditorFields }
  | { type: "text"; fields: TextEditorFields }
  | { type: "reflection"; fields: ReflectionEditorFields }
  | { type: "writtenAnswer"; fields: WrittenAnswerEditorFields };

/** A block's editable fields as the page fills its boxes, or null for a kind this slice does not edit. */
export function editorFieldsOf(located: Located): EditorFields | null {
  const { block, part } = located;
  switch (block.type) {
    case "source":
      return {
        type: "source",
        fields: {
          kind: block.kind,
          title: block.title,
          url: block.url,
          by: block.by,
          date: block.date,
          time: block.time,
          note: runsMarkdown(block.note),
        },
      };
    case "text":
      return {
        type: "text",
        fields: {
          role: block.role,
          heading: block.heading,
          headingAllowed: !(block.role === "plain" && part === null),
          time: block.time,
          timeAllowed: block.role === "before",
          body: proseMarkdown(block.body),
        },
      };
    case "reflection":
      return { type: "reflection", fields: { prompts: block.prompts.map((prompt) => ({ id: prompt.id, text: prompt.text })) } };
    case "writtenAnswer":
      return {
        type: "writtenAnswer",
        fields: {
          heading: part ? part.title : null,
          question: proseMarkdown(block.prompt),
          guidance: proseMarkdown(block.guidance),
          words: block.words ? { ...block.words } : null,
          due: block.due,
          boxes: block.boxes.map((box) => ({ id: box.id, label: box.label })),
        },
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The body of a save
// ---------------------------------------------------------------------------

/** Whether a changed link is the same reading at a new address. Only "same" is built; see `READING_CHOICES`. */
export type ReadingChoice = "same" | "different";

/**
 * THE SEAM FOR "A DIFFERENT READING". Replacing a source with a different
 * reading gives it a new id and clears its ticks for the people still on
 * the week, which changes what "done" means for them, and that model is
 * being changed elsewhere. Until it lands, a changed link must say it is the
 * same reading at a new address (every tick kept), and "different" is
 * refused in words that say how to do it today. A later change adds the
 * second branch here and in `applyBlockEdit`.
 */
export const READING_CHOICES: readonly ReadingChoice[] = ["same", "different"];

export type BlockEdit =
  | { type: "source"; fields: Partial<SourceEditorFields>; reading: ReadingChoice | null }
  | { type: "text"; fields: Partial<Pick<TextEditorFields, "heading" | "time" | "body">> }
  | { type: "reflection"; fields: { prompts?: Array<{ id: string; text: string }> } }
  | {
      type: "writtenAnswer";
      fields: Partial<Pick<WrittenAnswerEditorFields, "heading" | "question" | "guidance" | "words" | "due">>;
    };

/** The longest piece of Markdown one field may carry, before it is read: well past any cap a field keeps. */
export const MAX_FIELD_CHARS = 20_000;

/** A save's body: the block's fingerprint as loaded, and the fields that change. */
export type EditBody = { base: string; edit: BlockEdit };

type Raw = Record<string, unknown>;

function asRaw(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function stringField(fields: Raw, key: string, out: Raw): string | null {
  if (!(key in fields)) return null;
  const value = fields[key];
  if (typeof value !== "string") return EDIT_REFUSAL.notText(key);
  if (value.length > MAX_FIELD_CHARS) return EDIT_REFUSAL.tooLongToRead(key, MAX_FIELD_CHARS);
  out[key] = value;
  return null;
}

/** The fields each kind may send, and nothing else. */
const ALLOWED_FIELDS: Record<EditableType, readonly string[]> = {
  source: ["kind", "title", "url", "by", "date", "time", "note"],
  text: ["heading", "time", "body"],
  reflection: ["prompts"],
  writtenAnswer: ["heading", "question", "guidance", "words", "due"],
};

/**
 * A save's body, read against the kind of block it names: `base` (the
 * block's fingerprint as the editor loaded it) and `fields`, any of the
 * kind's own fields, each of its own type. A field left out keeps what is
 * stored. Anything else is refused with a sentence.
 */
export function parseEditBody(raw: unknown, type: EditableType): EditBody | { error: string } {
  const body = asRaw(raw);
  if (!body) return { error: EDIT_REFUSAL.body };
  if (typeof body.base !== "string" || !/^[0-9a-f]{16}$/.test(body.base)) return { error: EDIT_REFUSAL.base };
  const fields = asRaw(body.fields);
  if (!fields) return { error: EDIT_REFUSAL.fields };
  const unknown = Object.keys(fields).filter((key) => !ALLOWED_FIELDS[type].includes(key));
  if (unknown.length > 0) return { error: EDIT_REFUSAL.unknownField(unknown[0]) };
  if (Object.keys(fields).length === 0) return { error: EDIT_REFUSAL.nothing };
  const out: Raw = {};
  switch (type) {
    case "source": {
      for (const key of ["title", "url", "by", "date", "time", "note"]) {
        const wrong = stringField(fields, key, out);
        if (wrong) return { error: wrong };
      }
      if ("kind" in fields) {
        if (!SOURCE_KINDS.includes(fields.kind as SourceKind)) return { error: EDIT_REFUSAL.sourceKind };
        out.kind = fields.kind;
      }
      const reading = body.reading;
      if (reading !== undefined && reading !== null && !READING_CHOICES.includes(reading as ReadingChoice)) {
        return { error: EDIT_REFUSAL.readingChoice };
      }
      return { base: body.base, edit: { type, fields: out as Partial<SourceEditorFields>, reading: (reading as ReadingChoice | undefined) ?? null } };
    }
    case "text": {
      for (const key of ["heading", "time", "body"]) {
        const wrong = stringField(fields, key, out);
        if (wrong) return { error: wrong };
      }
      return { base: body.base, edit: { type, fields: out } };
    }
    case "reflection": {
      const prompts = fields.prompts;
      if (!Array.isArray(prompts) || prompts.length > L.maxReflectionPrompts) return { error: EDIT_REFUSAL.prompts };
      const read: Array<{ id: string; text: string }> = [];
      for (const value of prompts) {
        const prompt = asRaw(value);
        if (!prompt || typeof prompt.id !== "string" || typeof prompt.text !== "string") return { error: EDIT_REFUSAL.prompts };
        if (prompt.text.length > MAX_FIELD_CHARS) return { error: EDIT_REFUSAL.tooLongToRead("prompts", MAX_FIELD_CHARS) };
        read.push({ id: prompt.id, text: prompt.text });
      }
      return { base: body.base, edit: { type, fields: { prompts: read } } };
    }
    case "writtenAnswer": {
      for (const key of ["heading", "question", "guidance"]) {
        const wrong = stringField(fields, key, out);
        if (wrong) return { error: wrong };
      }
      if ("words" in fields) {
        const words = fields.words;
        if (words === null) out.words = null;
        else {
          const range = asRaw(words);
          const whole = (n: unknown) => typeof n === "number" && Number.isInteger(n);
          if (!range || !whole(range.min) || !whole(range.max)) return { error: EDIT_REFUSAL.wordsShape };
          out.words = { min: range.min as number, max: range.max as number };
        }
      }
      if ("due" in fields) {
        if (!WHENS.includes(fields.due as When)) return { error: EDIT_REFUSAL.due };
        out.due = fields.due;
      }
      return { base: body.base, edit: { type, fields: out } };
    }
  }
}

// ---------------------------------------------------------------------------
// Applying an edit
// ---------------------------------------------------------------------------

/** What one edit changed, field by field, for the history's line and the notice's words. */
export type EditChange =
  | { type: "source"; changed: Array<keyof SourceEditorFields>; title: string; by: string; kind: SourceKind; url: { before: string; after: string } }
  | { type: "text"; changed: Array<"heading" | "time" | "body">; heading: string }
  | { type: "reflection"; changed: string[]; prompts: Array<{ id: string; before: string; after: string }> }
  | {
      type: "writtenAnswer";
      changed: Array<"heading" | "question" | "guidance" | "words" | "due">;
      words: { before: WordRange | null; after: WordRange | null };
      due: { before: When; after: When };
      /** Other blocks' words that repeat the word range, put right to match ("This week's line for Part 4"). */
      followed: string[];
    };

export type AppliedEdit =
  | { ok: true; blocks: WeekBlock[]; block: WeekBlock; change: EditChange; noChange: boolean }
  | { ok: false; error: string; status: 400 | 409 };

const words = (range: WordRange | null) => (range ? `${range.min} to ${range.max} words` : null);

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Replace one block in a week, at the top or inside its part, and nothing else. */
function replaceBlock(blocks: readonly WeekBlock[], id: string, next: (block: WeekBlock) => WeekBlock): WeekBlock[] {
  return blocks.map((block) => {
    if (block.id === id) return next(block);
    if (block.type === "part") {
      return { ...block, blocks: block.blocks.map((child) => (child.id === id ? (next(child) as typeof child) : child)) };
    }
    return block;
  });
}

function editSource(block: SourceBlock, edit: Extract<BlockEdit, { type: "source" }>, where: string): Read<SourceBlock> {
  const f = edit.fields;
  const kind = f.kind ?? block.kind;
  const title = f.title !== undefined ? oneLine(f.title, Number.MAX_SAFE_INTEGER) : block.title;
  if (!title) return { ok: false, error: EDIT_REFUSAL.sourceTitle(where) };
  let url = block.url;
  if (f.url !== undefined) {
    const trimmed = f.url.trim();
    if (trimmed === "") url = "";
    else {
      const safe = safeSourceUrl(trimmed);
      if (!safe) return { ok: false, error: EDIT_REFUSAL.sourceLink(where) };
      url = safe;
    }
  }
  let note = block.note;
  if (f.note !== undefined) {
    const read = runsFromMarkdown(`${where}: the note`, f.note);
    if (!read.ok) return read;
    note = read.value;
  }
  const next: SourceBlock = {
    id: block.id,
    type: "source",
    kind,
    lead: block.lead,
    title,
    url,
    by: f.by !== undefined ? oneLine(f.by, Number.MAX_SAFE_INTEGER) : block.by,
    date: f.date !== undefined ? oneLine(f.date, Number.MAX_SAFE_INTEGER) : block.date,
    time: f.time !== undefined ? oneLine(f.time, Number.MAX_SAFE_INTEGER) : block.time,
    // Only a notebook keeps what it needs to run, as the reader of weeks does.
    compute: kind === "notebook" ? block.compute : "",
    note,
  };
  if (!next.url && !next.note.some((run) => run.href)) return { ok: false, error: EDIT_REFUSAL.sourceLink(where) };
  if (next.url !== block.url) {
    if (edit.reading === null) return { ok: false, error: EDIT_REFUSAL.sayWhichReading };
    if (edit.reading === "different") return { ok: false, error: EDIT_REFUSAL.differentReading };
  }
  return { ok: true, value: next };
}

function editText(block: TextBlock, edit: Extract<BlockEdit, { type: "text" }>, inPart: boolean, where: string): Read<TextBlock> {
  const f = edit.fields;
  const headingAllowed = !(block.role === "plain" && !inPart);
  if (f.heading !== undefined && f.heading.trim() !== "" && !headingAllowed) return { ok: false, error: EDIT_REFUSAL.textNoHeading };
  if (f.time !== undefined && f.time.trim() !== "" && block.role !== "before") return { ok: false, error: EDIT_REFUSAL.textNoTime };
  let body = block.body;
  if (f.body !== undefined) {
    const read = proseFromMarkdown(where, f.body);
    if (!read.ok) return read;
    body = read.value;
  }
  const heading = f.heading !== undefined ? oneLine(f.heading, Number.MAX_SAFE_INTEGER) : block.heading;
  if (block.role === "section" && !heading) return { ok: false, error: EDIT_REFUSAL.textHeading(where) };
  if (body.length === 0 && !heading) return { ok: false, error: EDIT_REFUSAL.textEmpty(where) };
  return {
    ok: true,
    value: {
      id: block.id,
      type: "text",
      role: block.role,
      heading,
      time: f.time !== undefined ? oneLine(f.time, Number.MAX_SAFE_INTEGER) : block.time,
      body,
    },
  };
}

function editReflection(block: ReflectionBlock, edit: Extract<BlockEdit, { type: "reflection" }>, where: string): Read<ReflectionBlock> {
  const sent = edit.fields.prompts;
  if (!sent) return { ok: true, value: block };
  // The same prompts, in the same order: their words change, their ids never.
  if (sent.length !== block.prompts.length || sent.some((prompt, i) => prompt.id !== block.prompts[i].id)) {
    return { ok: false, error: EDIT_REFUSAL.samePrompts };
  }
  const prompts = sent.map((prompt) => ({ id: prompt.id, text: oneLine(prompt.text, Number.MAX_SAFE_INTEGER) }));
  if (prompts.some((prompt) => !prompt.text)) return { ok: false, error: EDIT_REFUSAL.emptyPrompt(where) };
  return { ok: true, value: { id: block.id, type: "reflection", prompts } };
}

function editWrittenAnswer(
  block: WrittenAnswerBlock,
  edit: Extract<BlockEdit, { type: "writtenAnswer" }>,
  where: string,
): Read<WrittenAnswerBlock> {
  const f = edit.fields;
  let prompt = block.prompt;
  if (f.question !== undefined) {
    const read = proseFromMarkdown(`${where}: the question`, f.question);
    if (!read.ok) return read;
    prompt = read.value;
    if (prompt.length === 0) return { ok: false, error: EDIT_REFUSAL.noQuestion(where) };
  }
  let guidance = block.guidance;
  if (f.guidance !== undefined) {
    const read = proseFromMarkdown(`${where}: what a strong answer does`, f.guidance);
    if (!read.ok) return read;
    guidance = read.value;
  }
  let range = block.words;
  if (f.words !== undefined) {
    range = f.words;
    if (range && (range.min < 1 || range.min > range.max || range.max > L.maxAnswerWords)) {
      return { ok: false, error: EDIT_REFUSAL.wordRange(where, L.maxAnswerWords) };
    }
    if (range && block.boxes.length > 0) return { ok: false, error: EDIT_REFUSAL.rangeInBoxes(where) };
  }
  return {
    ok: true,
    value: {
      id: block.id,
      type: "writtenAnswer",
      prompt,
      // Its boxes, ids and words, exactly as stored: an answer in boxes keys each box's words on its id.
      boxes: block.boxes,
      guidance,
      words: range,
      due: f.due ?? block.due,
    },
  };
}

/**
 * A word range's words where other blocks repeat it: the written answer's
 * part's time ("250 to 350 words") and each This week task that covers the
 * part or the answer ("Part 4: your threat model, the week's written answer
 * (250 to 350 words)"). Only the exact words of the old range are replaced,
 * so a line that says something else is left as written. Returns the new
 * blocks and, for each block changed, where it is.
 */
function followRange(
  blocks: WeekBlock[],
  part: PartBlock | null,
  answerId: string,
  before: WordRange | null,
  after: WordRange | null,
  partNumber: number | null,
): { blocks: WeekBlock[]; followed: string[] } {
  const was = words(before);
  const now = words(after);
  if (!was || !now || was === now) return { blocks, followed: [] };
  const followed: string[] = [];
  const swap = (text: string) => text.split(was).join(now);
  const out = blocks.map((block) => {
    if (part && block.type === "part" && block.id === part.id && block.time.includes(was)) {
      followed.push(`Part ${partNumber}’s heading`);
      return { ...block, time: swap(block.time) };
    }
    if (block.type === "thisWeek") {
      let touched = false;
      const rows = block.rows.map((row) => {
        if (row.type !== "task" || !row.what.includes(was)) return row;
        if (!row.covers.includes(answerId) && !(part && row.covers.includes(part.id))) return row;
        touched = true;
        return { ...row, what: swap(row.what) };
      });
      if (touched) {
        followed.push(partNumber ? `This week’s line for Part ${partNumber}` : "This week’s line for the written answer");
        return { ...block, rows };
      }
    }
    return block;
  });
  return { blocks: out, followed };
}

/** "Part 2’s source", "The written answer": where a block is, in the week's own words. */
export function placeWords(located: Located): string {
  const inPart = located.partNumber !== null && located.part !== null ? `Part ${located.partNumber}` : null;
  switch (located.block.type) {
    case "source":
      return inPart ? `${inPart}’s source` : "The source";
    case "text":
      return located.block.heading ? `“${located.block.heading}”` : inPart ? `Text in ${inPart}` : "The text";
    case "reflection":
      return inPart ? `${inPart}’s reflection` : "The reflection";
    case "writtenAnswer":
      return inPart ? `${inPart}’s written answer` : "The written answer";
    default:
      return inPart ? `A block in ${inPart}` : "A block";
  }
}

/**
 * The edit, applied to a copy of the week: the one block rewritten with its
 * ids kept (and, for a written answer, its part's title and the words that
 * repeat its range), then held to the paste's checks. Refused with a
 * sentence when the block is not there, is not a kind this slice edits, has
 * changed since the editor loaded it (409), or would not be stored as it
 * stands. `noChange` says the save would store what is stored already.
 */
export function applyBlockEdit(blocks: readonly WeekBlock[], blockId: string, body: EditBody): AppliedEdit {
  const located = locateBlock(blocks, blockId);
  if (!located) return { ok: false, status: 409, error: EDIT_REFUSAL.blockGone };
  const { block, part } = located;
  if (!isEditableType(block.type)) return { ok: false, status: 400, error: EDIT_REFUSAL.kind };
  if (block.type !== body.edit.type) return { ok: false, status: 409, error: EDIT_REFUSAL.blockChanged };
  if (blockFingerprint(block) !== body.base) return { ok: false, status: 409, error: EDIT_REFUSAL.blockChanged };
  const where = placeWords(located);

  let next: Read<WeekBlock>;
  let change: EditChange;
  let week: WeekBlock[];
  switch (block.type) {
    case "source": {
      const edit = body.edit as Extract<BlockEdit, { type: "source" }>;
      next = editSource(block, edit, where);
      if (!next.ok) return { ok: false, status: 400, error: next.error };
      const after = next.value as SourceBlock;
      const fields: Array<keyof SourceEditorFields> = ["kind", "title", "url", "by", "date", "time", "note"];
      change = {
        type: "source",
        changed: fields.filter((key) => !sameJson(block[key], after[key])),
        title: after.title,
        by: after.by,
        kind: after.kind,
        url: { before: block.url, after: after.url },
      };
      week = replaceBlock(blocks, block.id, () => after);
      break;
    }
    case "text": {
      next = editText(block, body.edit as Extract<BlockEdit, { type: "text" }>, part !== null, where);
      if (!next.ok) return { ok: false, status: 400, error: next.error };
      const after = next.value as TextBlock;
      change = {
        type: "text",
        changed: (["heading", "time", "body"] as const).filter((key) => !sameJson(block[key], after[key])),
        heading: after.heading,
      };
      week = replaceBlock(blocks, block.id, () => after);
      break;
    }
    case "reflection": {
      next = editReflection(block, body.edit as Extract<BlockEdit, { type: "reflection" }>, where);
      if (!next.ok) return { ok: false, status: 400, error: next.error };
      const after = next.value as ReflectionBlock;
      const prompts = block.prompts.map((prompt, i) => ({ id: prompt.id, before: prompt.text, after: after.prompts[i].text }));
      change = { type: "reflection", changed: prompts.filter((p) => p.before !== p.after).map((p) => p.id), prompts };
      week = replaceBlock(blocks, block.id, () => after);
      break;
    }
    case "writtenAnswer": {
      const edit = body.edit as Extract<BlockEdit, { type: "writtenAnswer" }>;
      next = editWrittenAnswer(block, edit, where);
      if (!next.ok) return { ok: false, status: 400, error: next.error };
      const after = next.value as WrittenAnswerBlock;
      const heading = edit.fields.heading;
      if (heading !== undefined && !part) return { ok: false, status: 400, error: EDIT_REFUSAL.answerNoPart };
      const newHeading = heading !== undefined ? oneLine(heading, Number.MAX_SAFE_INTEGER) : (part?.title ?? "");
      if (part && !newHeading) return { ok: false, status: 400, error: EDIT_REFUSAL.answerHeading(where) };
      week = replaceBlock(blocks, block.id, () => after);
      if (part && newHeading !== part.title) {
        week = week.map((each) => (each.type === "part" && each.id === part.id ? { ...each, title: newHeading } : each));
      }
      const followedRange = followRange(week, part, block.id, block.words, after.words, located.partNumber);
      week = followedRange.blocks;
      const changed: Array<"heading" | "question" | "guidance" | "words" | "due"> = [];
      if (part && newHeading !== part.title) changed.push("heading");
      if (!sameJson(block.prompt, after.prompt)) changed.push("question");
      if (!sameJson(block.guidance, after.guidance)) changed.push("guidance");
      if (!sameJson(block.words, after.words)) changed.push("words");
      if (block.due !== after.due) changed.push("due");
      change = {
        type: "writtenAnswer",
        changed,
        words: { before: block.words, after: after.words },
        due: { before: block.due, after: after.due },
        followed: followedRange.followed,
      };
      break;
    }
    default:
      return { ok: false, status: 400, error: EDIT_REFUSAL.kind };
  }

  // The paste's checks, on the whole week: only what this edit brings refuses it.
  const before = new Set(weekBlocksProblems(blocks));
  const brought = weekBlocksProblems(week).filter((problem) => !before.has(problem));
  if (brought.length > 0) return { ok: false, status: 400, error: brought[0] };
  // And it must read back exactly as written, so the reader of weeks keeps it as it is.
  if (!sameJson(sanitizeWeekBlocks(week), week)) return { ok: false, status: 400, error: EDIT_REFUSAL.wouldNotRead(where) };
  const saved = locateBlock(week, blockId);
  if (!saved) return { ok: false, status: 400, error: EDIT_REFUSAL.wouldNotRead(where) };
  return { ok: true, blocks: week, block: saved.block, change, noChange: sameJson(week, blocks) };
}

// ---------------------------------------------------------------------------
// Every block, saved back unchanged
// ---------------------------------------------------------------------------

/** One block that does not come back identical when its own fields are saved back unchanged. */
export type RoundTripProblem = {
  blockId: string;
  type: EditableType;
  /** The field that, saved back as the side panel loaded it, did not come back the same. */
  field: string;
  /** The save's refusal, or, for a save that went through, that the block came back different. */
  problem: string;
};

/** The fields the side panel loads for a block, each as a save would send it alone. */
function loadedFields(editor: EditorFields): Array<[string, unknown]> {
  switch (editor.type) {
    case "source":
      return (["kind", "title", "url", "by", "date", "time", "note"] as const).map((key) => [key, editor.fields[key]]);
    case "text": {
      const out: Array<[string, unknown]> = [["body", editor.fields.body]];
      if (editor.fields.headingAllowed) out.push(["heading", editor.fields.heading]);
      if (editor.fields.timeAllowed) out.push(["time", editor.fields.time]);
      return out;
    }
    case "reflection":
      return [["prompts", editor.fields.prompts]];
    case "writtenAnswer": {
      const out: Array<[string, unknown]> = [
        ["question", editor.fields.question],
        ["guidance", editor.fields.guidance],
        ["due", editor.fields.due],
      ];
      if (editor.fields.heading !== null) out.push(["heading", editor.fields.heading]);
      if (editor.fields.boxes.length === 0) out.push(["words", editor.fields.words]);
      return out;
    }
  }
}

/**
 * EVERY BLOCK OF A WEEK THAT CAN BE CHANGED IN PLACE, SAVED BACK UNCHANGED:
 * for each source, text, reflection and written answer, each field the side
 * panel would load (`editorFieldsOf`) is sent back as it was loaded, alone,
 * through the same code a save goes through (`parseEditBody`, then
 * `applyBlockEdit`), and any block that does not come back identical is
 * reported with its id and the field: a refusal, or a save that would change
 * what is stored. An empty list means opening any of them and pressing Save
 * changes nothing. Pure: reads nothing, writes nothing, so it can be run over
 * stored weeks to check them before anybody edits one.
 */
export function roundTripProblems(blocks: readonly WeekBlock[]): RoundTripProblem[] {
  const problems: RoundTripProblem[] = [];
  for (const block of allBlocks(blocks)) {
    if (!isEditableType(block.type)) continue;
    const located = locateBlock(blocks, block.id);
    const editor = located ? editorFieldsOf(located) : null;
    if (!located || !editor) continue;
    for (const [field, value] of loadedFields(editor)) {
      const raw = {
        base: blockFingerprint(located.block),
        fields: { [field]: value },
        ...(editor.type === "source" ? { reading: "same" } : {}),
      };
      const parsed = parseEditBody(JSON.parse(JSON.stringify(raw)), editor.type);
      if ("error" in parsed) {
        problems.push({ blockId: block.id, type: editor.type, field, problem: parsed.error });
        continue;
      }
      const applied = applyBlockEdit(blocks, block.id, parsed);
      if (!applied.ok) problems.push({ blockId: block.id, type: editor.type, field, problem: applied.error });
      else if (!applied.noChange) problems.push({ blockId: block.id, type: editor.type, field, problem: "The block came back different." });
    }
  }
  return problems;
}

/** The question of a written answer in plain words, for a list or an email. */
export function questionText(block: WrittenAnswerBlock): string {
  return proseText(block.prompt);
}

/** The history's one line for an edit: "Part 2: new link for Ada Example’s reading". */
export function editSummary(change: EditChange, located: Located): string {
  const part = located.part ? located.partNumber : null;
  switch (change.type) {
    case "source":
      return HISTORY_WORDS.source(part, change.changed, sourceOwnerWords(change.by, change.title, change.kind));
    case "text":
      return HISTORY_WORDS.text(part, located.part ? "" : change.heading, change.changed);
    case "reflection":
      return HISTORY_WORDS.reflection(part);
    case "writtenAnswer":
      return HISTORY_WORDS.writtenAnswer(part, change.changed, change.words.after);
  }
}
