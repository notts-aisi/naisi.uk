import {
  SOURCE_KIND_LABEL,
  blockLabel,
  weekItems,
  type BlockType,
  type GoFurtherItem,
  type WeekBlock,
} from "../weekBlocks/model";
import { proseText, runsText } from "../weekBlocks/prose";
import { COMPARE_WORDS, KIND_LABEL, WHEN_LINE, fieldsWords } from "./words";

/**
 * WHAT DIFFERS BETWEEN TWO VERSIONS OF A WEEK, block by block, in words a
 * page can show: the history's "Compare", and the paste's check ("Changed: 1.
 * Removed: 1, 2 answers kept with the people who wrote them").
 *
 * Blocks are matched by id, which is what people's ticks and answers are
 * keyed on: a block with the same id in both is the same block, wherever it
 * moved, and its words are compared; an id only in the later version was
 * added; an id only in the earlier one was taken out. A part's own words
 * (title, time, framing) are the part's row, and each block inside it has a
 * row of its own, so a change inside a part is never folded into the part.
 *
 * Pure: two lists of blocks in, rows out. Counts of answers are the caller's
 * (the items each removed row took out are listed for it to count).
 */

export type WeekVersion = { title: string; blocks: readonly WeekBlock[] };

export type CompareState = "changed" | "added" | "removed";

export type CompareRow = {
  state: CompareState;
  blockId: string;
  type: BlockType;
  /** "Part 2’s source", "Part 1", "This week": where it is, in the week's own words. */
  place: string;
  /** What it said, line by line; [] for a block that was added. */
  before: string[];
  /** What it says, line by line; [] for a block that was taken out. */
  after: string[];
  /** For a changed block of a kind edited in place, which of its fields differ, in words ("link and title"); else "". */
  fields: string;
  /**
   * The ids people's work is keyed on that this row took out: every item
   * of a removed block, or the items a changed block lost (a prompt, a
   * pack). The caller counts answers on them.
   */
  itemsTakenOut: string[];
};

export type WeekComparison = {
  rows: CompareRow[];
  changed: number;
  added: number;
  removed: number;
  /** Blocks in both whose place in the week moved. */
  moved: number;
  /** The week's title, when it differs. */
  title: { before: string; after: string } | null;
  /** Nothing differs at all. */
  same: boolean;
};

type Placed = { block: WeekBlock; parentId: string | null; place: string };

/** Every block in page order with the part it sits in and its place in words. */
function placed(blocks: readonly WeekBlock[]): Placed[] {
  const out: Placed[] = [];
  let part = 0;
  for (const block of blocks) {
    if (block.type === "part") {
      part += 1;
      out.push({ block, parentId: null, place: `Part ${part}` });
      for (const child of block.blocks) out.push({ block: child, parentId: block.id, place: childPlace(child, part) });
    } else {
      out.push({ block, parentId: null, place: topPlace(block) });
    }
  }
  return out;
}

function topPlace(block: WeekBlock): string {
  switch (block.type) {
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
    case "cases":
      return block.heading ? `“${block.heading}”` : "The cases";
    case "text":
      return block.heading ? `“${block.heading}”` : "Text";
    default:
      return blockLabel(block);
  }
}

const CHILD_NOUN: Partial<Record<BlockType, string>> = {
  source: "source",
  reflection: "reflection",
  chooseOne: "packs",
  table: "table",
  writtenAnswer: "written answer",
  cases: "talk",
  fillIn: "boxes",
  checklist: "checklist",
  text: "text",
};

function childPlace(block: WeekBlock, part: number): string {
  return `Part ${part}’s ${CHILD_NOUN[block.type] ?? "block"}`;
}

/** "cold-takes.com link", or "no link of its own". */
function hostWords(url: string): string {
  if (!url) return COMPARE_WORDS.noLink;
  try {
    return COMPARE_WORDS.linkHost(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return COMPARE_WORDS.noLink;
  }
}

function sourceLine(source: Pick<GoFurtherItem, "kind" | "title" | "by" | "date" | "time" | "url">): string {
  const who = [source.by, source.date].filter(Boolean).join(", ");
  return `${SOURCE_KIND_LABEL[source.kind]}: “${source.title}”${who ? `, ${who}` : ""}.${source.time ? ` ${source.time}.` : ""} ${hostWords(source.url)}`;
}

/** What a block says, line by line, plainly: what a comparison sets side by side. Never its children. */
export function blockLines(block: WeekBlock): string[] {
  switch (block.type) {
    case "source": {
      const note = runsText(block.note);
      return [sourceLine(block), ...(note ? [note] : [])];
    }
    case "text":
      return [...(block.heading ? [block.heading] : []), ...(block.time ? [block.time] : []), ...splitText(proseText(block.body))];
    case "reflection":
      return block.prompts.map((prompt) => prompt.text);
    case "writtenAnswer":
      return [
        ...splitText(proseText(block.prompt)),
        ...splitText(proseText(block.guidance)),
        block.boxes.length > 0 ? block.boxes.map((box) => box.label).join(" · ") : COMPARE_WORDS.wordsRange(block.words),
        WHEN_LINE[block.due],
      ];
    case "part":
      return [`${block.title}${block.time ? ` (${block.time})` : ""}`, ...splitText(proseText(block.framing))];
    case "thisWeek":
      return [...block.rows.map((row) => `${row.what} · ${row.time}`), ...(block.total ? [`In all: ${block.total}`] : [])];
    case "outcomes":
      return block.items;
    case "contentNote":
      return [...splitText(proseText(block.body)), ...block.links.map((link) => link.label)];
    case "chooseOne":
      return block.packs.map((pack) => `${pack.name}: ${runsText(pack.read)}${pack.time ? ` · ${pack.time}` : ""}`);
    case "table":
      return [block.header, ...block.rows.map((row) => row.cells)].map((cells) => cells.map((cell) => runsText(cell.runs)).join(" | "));
    case "cases":
      return [
        ...(block.talk ? [`A ${block.talk.minutes}-minute ${block.talk.name}`] : []),
        ...block.groups.flatMap((group) => group.cases.map((item) => (group.name ? `${group.name}: ${item.title}` : item.title))),
      ];
    case "fillIn":
      return block.groups.flatMap((group) => [group.heading, ...group.boxes.map((box) => box.label).filter(Boolean)]);
    case "checklist":
      return block.items.map((item) => item.title);
    case "inTheSession":
      return [...splitText(proseText(block.body)), ...splitText(proseText(block.beforeYouCome))];
    case "goFurther":
      return block.items.map((item) => (item.title ? sourceLine(item) : runsText(item.why)));
    case "handsOn":
      return [block.heading, ...splitText(proseText(block.body))].filter(Boolean);
  }
}

function splitText(text: string): string[] {
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

/** A block's own content, without a part's children: what decides whether it changed. */
function ownJson(block: WeekBlock): string {
  if (block.type === "part") {
    const { blocks: _children, ...own } = block;
    return JSON.stringify(own);
  }
  return JSON.stringify(block);
}

const COMPARED_FIELDS: Partial<Record<BlockType, readonly string[]>> = {
  source: ["kind", "title", "url", "by", "date", "time", "note"],
  text: ["heading", "time", "body"],
  reflection: ["prompts"],
  writtenAnswer: ["prompt", "guidance", "words", "due"],
};

const FIELD_ALIAS: Record<string, string> = { prompt: "question", prompts: "body" };

function changedFields(before: WeekBlock, after: WeekBlock): string {
  const fields = COMPARED_FIELDS[before.type];
  if (!fields) return "";
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  return fieldsWords(fields.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map((key) => FIELD_ALIAS[key] ?? key));
}

/** Ids of every item in one block (and, for a part, its children): what people's work keys on. */
function itemIdsOf(block: WeekBlock): string[] {
  return weekItems([block]).map((item) => item.id);
}

/** Each block's position among the blocks both versions share, under the same parent: what "moved" compares. */
function positions(list: readonly Placed[], shared: ReadonlySet<string>): Map<string, string> {
  const at = new Map<string, string>();
  const index = new Map<string | null, number>();
  for (const entry of list) {
    if (!shared.has(entry.block.id)) continue;
    const n = index.get(entry.parentId) ?? 0;
    index.set(entry.parentId, n + 1);
    at.set(entry.block.id, `${entry.parentId ?? ""}#${n}`);
  }
  return at;
}

/** What differs between `before` and `after`, block by block, in page order (removed rows where they stood). */
export function compareWeeks(before: WeekVersion, after: WeekVersion): WeekComparison {
  const was = placed(before.blocks);
  const now = placed(after.blocks);
  const wasById = new Map(was.map((entry) => [entry.block.id, entry] as const));
  const nowById = new Map(now.map((entry) => [entry.block.id, entry] as const));
  const shared = new Set([...wasById.keys()].filter((id) => nowById.has(id)));
  const wasAt = positions(was, shared);
  const nowAt = positions(now, shared);
  const nowItems = new Set(weekItems(after.blocks).map((item) => item.id));

  const rows: CompareRow[] = [];
  let moved = 0;
  for (const entry of now) {
    const old = wasById.get(entry.block.id);
    if (!old) {
      rows.push({
        state: "added",
        blockId: entry.block.id,
        type: entry.block.type,
        place: entry.place,
        before: [],
        after: blockLines(entry.block),
        fields: "",
        itemsTakenOut: [],
      });
      continue;
    }
    if (wasAt.get(entry.block.id) !== nowAt.get(entry.block.id)) moved += 1;
    if (old.block.type !== entry.block.type || ownJson(old.block) !== ownJson(entry.block)) {
      const lost = old.block.type === "part" ? [] : itemIdsOf(old.block).filter((id) => !nowItems.has(id));
      rows.push({
        state: "changed",
        blockId: entry.block.id,
        type: entry.block.type,
        place: entry.place,
        before: blockLines(old.block),
        after: blockLines(entry.block),
        fields: old.block.type === entry.block.type ? changedFields(old.block, entry.block) : "",
        itemsTakenOut: lost,
      });
    }
  }
  // Taken out: placed after the row that stood before them, so a page reads them where they were.
  for (const entry of was) {
    if (nowById.has(entry.block.id)) continue;
    // A removed part's children are their own rows; its own row takes out the part's id alone.
    const items = entry.block.type === "part" ? [entry.block.id] : itemIdsOf(entry.block);
    rows.push({
      state: "removed",
      blockId: entry.block.id,
      type: entry.block.type,
      place: entry.place,
      before: blockLines(entry.block),
      after: [],
      fields: "",
      itemsTakenOut: items.filter((id) => !nowItems.has(id)),
    });
  }
  const count = (state: CompareState) => rows.filter((row) => row.state === state).length;
  const title = before.title !== after.title ? { before: before.title, after: after.title } : null;
  return {
    rows,
    changed: count("changed"),
    added: count("added"),
    removed: count("removed"),
    moved,
    title,
    same: rows.length === 0 && moved === 0 && title === null,
  };
}

/**
 * The comparison's summary line: "Changed: 1 · Removed: 1, 2 answers kept
 * with the people who wrote them", from the counts and the answers the caller
 * counted on what was taken out.
 */
export function comparisonLine(comparison: WeekComparison, answersTakenOut: number): string {
  if (comparison.same) return COMPARE_WORDS.same;
  return [
    comparison.changed > 0 ? COMPARE_WORDS.changed(comparison.changed) : "",
    comparison.added > 0 ? COMPARE_WORDS.added(comparison.added) : "",
    comparison.removed > 0 ? COMPARE_WORDS.removed(comparison.removed, answersTakenOut) : "",
    comparison.moved > 0 ? COMPARE_WORDS.moved(comparison.moved) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What a week contains by kind, in the order a week reads: the paste's "What it found: 16 blocks". */
export function kindsIn(blocks: readonly WeekBlock[]): Array<{ type: BlockType; label: string; count: number }> {
  const counts = new Map<BlockType, number>();
  for (const block of blocks) {
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
    if (block.type === "part") for (const child of block.blocks) counts.set(child.type, (counts.get(child.type) ?? 0) + 1);
  }
  return (Object.keys(KIND_LABEL) as BlockType[])
    .filter((type) => counts.has(type))
    .map((type) => ({ type, label: KIND_LABEL[type], count: counts.get(type) ?? 0 }));
}
