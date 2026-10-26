import { marked, type Token, type Tokens } from "marked";
import { WEEK_BLOCK_LIMITS as L } from "./limits";
import {
  type AnswerBox,
  type Case,
  type CaseGroup,
  type CasesBlock,
  type ChecklistBlock,
  type ChooseOneBlock,
  type ContentNoteBlock,
  type FillInBlock,
  type GivenBy,
  type GoFurtherBlock,
  type GoFurtherItem,
  type HandsOnBlock,
  type OutcomesBlock,
  type Pack,
  type PartBlock,
  type PartChild,
  type ReflectionBlock,
  type SourceBlock,
  type SourceFields,
  type SourceKind,
  type TableBlock,
  type TextBlock,
  type ThisWeekBlock,
  type ThisWeekRow,
  type TopBlock,
  type When,
  type WeekBlock,
  type WrittenAnswerBlock,
} from "./model";
import { canonicalRuns, runsText, safeLinkUrl, safeSourceUrl, type Prose, type Run, type TableCell } from "./prose";

/**
 * READING A WEEK'S MARKDOWN INTO BLOCKS. The contract is
 * `docs/course-weeks.md`: the fellow guide's own export as it is (a title
 * line, "This week" and its table, "Why this week" and "After this week you
 * can:", "Before the session (time)", parts with their times in brackets,
 * numbered sources that start with a bold kind, a bold "Reflect" and its
 * bullets, tables of packs, the written answer's part, "Your case study" and
 * its table, "In the session", "Where to go next", "Go further" and the
 * hands-on route), and the same with ids written in, which is what
 * `markdownWrite.ts` writes.
 *
 * What it gives back is blocks with the ids the Markdown carried and "" for
 * an id it did not (`merge.ts` keeps the stored ones and mints the rest),
 * the title and week number from the first line, what it had to leave out,
 * and why a part could not be read at all. Nothing is guessed silently: what
 * it cannot place is said.
 *
 * Server side only: the loader's route reads a paste with it. `marked` reads
 * Markdown's own grammar; which line is a source and which a prompt is this
 * file.
 */

export type ParsedWeek = {
  /** The week's title from its first line, without "Week 3:". */
  title: string;
  /** The number in "Week 3:", or null when the first line has none. */
  weekNumber: number | null;
  blocks: WeekBlock[];
  /** Why a part of the Markdown could not be read. Any one stops a save. */
  problems: string[];
  /** What was left out on purpose, said so the person can check it. */
  leftOut: string[];
  /** The numbers of the parts whose packs were read from a table (the guide's shape). */
  packTables: number[];
  /**
   * What the Markdown says written work is due by on the day before the
   * session: "12:00" for "by noon", "" for "by the end of the day", null
   * when it says neither. The loader holds it against the course's setting.
   */
  dayBeforeSaid: string | null;
};

// ---------------------------------------------------------------------------
// Inline text: tokens to runs
// ---------------------------------------------------------------------------

/**
 * A run as read, before it is made canonical: it may hold line breaks, and
 * remembers an escaped character and a link the site will not draw.
 */
type RawRun = Run & { literal?: true; refused?: string };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: String.fromCharCode(0x2013),
  mdash: String.fromCharCode(0x2014),
  hellip: String.fromCharCode(0x2026),
  lsquo: String.fromCharCode(0x2018),
  rsquo: String.fromCharCode(0x2019),
  ldquo: String.fromCharCode(0x201c),
  rdquo: String.fromCharCode(0x201d),
  pound: String.fromCharCode(0x00a3),
  euro: String.fromCharCode(0x20ac),
  copy: String.fromCharCode(0x00a9),
  frac14: String.fromCharCode(0x00bc),
  frac12: String.fromCharCode(0x00bd),
  frac34: String.fromCharCode(0x00be),
};

/** HTML character references in text, read as the characters they stand for. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z0-9]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

type Marks = { bold?: true; italic?: true; href?: string };

/** What was left out while reading inline text: pictures, and links that are not https or mailto. */
type InlineCounts = { images: number; refused: string[] };

function inlineRuns(tokens: readonly Token[] | undefined, marks: Marks, counts: InlineCounts): RawRun[] {
  const out: RawRun[] = [];
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "text": {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) out.push(...inlineRuns(t.tokens, marks, counts));
        else out.push({ ...marks, text: decodeEntities(t.text) });
        break;
      }
      case "escape":
        out.push({ ...marks, text: (token as Tokens.Escape).text, literal: true });
        break;
      case "strong":
        out.push(...inlineRuns((token as Tokens.Strong).tokens, { ...marks, bold: true }, counts));
        break;
      case "em":
        out.push(...inlineRuns((token as Tokens.Em).tokens, { ...marks, italic: true }, counts));
        break;
      case "del":
        out.push(...inlineRuns((token as Tokens.Del).tokens, marks, counts));
        break;
      case "codespan":
        // Inline code keeps its backticks as text: nothing on the page is code to run.
        out.push({ ...marks, text: `\`${decodeEntities((token as Tokens.Codespan).text)}\``, literal: true });
        break;
      case "br":
        out.push({ ...marks, text: "\n" });
        break;
      case "link": {
        const link = token as Tokens.Link;
        // A bare address in running text stays text: only "[words](address)"
        // and "<address>" are links, so a line reads back as it was written.
        const written = link.raw.startsWith("[") || link.raw.startsWith("<");
        const href = written ? safeLinkUrl(link.href) : null;
        if (href) out.push(...inlineRuns(link.tokens, { ...marks, href }, counts));
        else if (written) {
          // Its words stay; the link does not. Said, so it can be fixed.
          counts.refused.push(link.href);
          out.push(...inlineRuns(link.tokens, marks, counts).map((run) => ({ ...run, refused: link.href })));
        } else out.push({ ...marks, text: link.raw, literal: true });
        break;
      }
      case "image":
        counts.images += 1;
        break;
      case "html": {
        const html = (token as Tokens.HTML).raw;
        if (/^<br\s*\/?>$/i.test(html.trim())) out.push({ ...marks, text: "\n" });
        break;
      }
      default:
        if ("text" in token && typeof token.text === "string") out.push({ ...marks, text: decodeEntities(token.text) });
    }
  }
  return out;
}

/** Runs split at their line breaks, one list of runs per line. */
function splitLines(runs: readonly RawRun[]): RawRun[][] {
  const lines: RawRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  return lines;
}

/** Lines joined back into one line, a space where each break was. */
function joinLines(lines: readonly RawRun[][]): RawRun[] {
  return lines.flatMap((l, i) => (i > 0 ? [{ text: " " }, ...l] : l));
}

const ID_AT_END = /\s*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}\s*$/;

/** The id written at the end of a line, if one is, and the line without it. Never one that was escaped. */
function takeId(lineRuns: readonly RawRun[]): { id: string; runs: RawRun[] } {
  const runs = [...lineRuns];
  const last = runs[runs.length - 1];
  if (!last || last.literal || last.href) return { id: "", runs };
  const found = ID_AT_END.exec(last.text);
  if (!found) return { id: "", runs };
  runs[runs.length - 1] = { ...last, text: last.text.slice(0, found.index) };
  return { id: found[1], runs };
}

/** A line of runs, canonical. */
/**
 * Runs as one canonical line. Never cut: a line longer than its field's cap
 * is named by the check (`weekBlocksProblems`), so nothing a person wrote
 * goes missing without a word.
 */
function line(runs: readonly RawRun[]): Run[] {
  return canonicalRuns(runs, Number.MAX_SAFE_INTEGER);
}

function lineText(runs: readonly RawRun[]): string {
  return runsText(line(runs));
}

/** The runs of some tokens (a paragraph's, a cell's), as one line. */
function tokensLine(tokens: readonly Token[] | undefined, counts: InlineCounts): RawRun[] {
  return joinLines(splitLines(inlineRuns(tokens, {}, counts)));
}

/** A list item's first line, its id, and the lines after it (nested lists left out). */
function readItem(item: Tokens.ListItem, counts: InlineCounts): { id: string; first: RawRun[]; rest: RawRun[][] } {
  const lines: RawRun[][] = [];
  for (const token of item.tokens) {
    if (token.type === "text" || token.type === "paragraph") lines.push(...splitLines(inlineRuns((token as Tokens.Text).tokens, {}, counts)));
  }
  const { id, runs } = takeId(lines[0] ?? []);
  return { id, first: runs, rest: lines.slice(1).filter((l) => lineText(l) !== "") };
}

/** Runs with their first `n` characters taken off. */
function dropChars(runs: readonly RawRun[], n: number): RawRun[] {
  const out: RawRun[] = [];
  let left = n;
  for (const run of runs) {
    if (left <= 0) out.push(run);
    else if (run.text.length <= left) left -= run.text.length;
    else {
      out.push({ ...run, text: run.text.slice(left) });
      left = 0;
    }
  }
  return out;
}

/** Runs cut at character `n`: the runs before it and the runs from it on. */
function cutAt(runs: readonly RawRun[], n: number): [RawRun[], RawRun[]] {
  const before: RawRun[] = [];
  const after: RawRun[] = [];
  let at = 0;
  for (const run of runs) {
    const end = at + run.text.length;
    if (end <= n) before.push(run);
    else if (at >= n) after.push(run);
    else {
      before.push({ ...run, text: run.text.slice(0, n - at) });
      after.push({ ...run, text: run.text.slice(n - at) });
    }
    at = end;
  }
  return [before, after];
}

/** The plain text of runs, as written (no folding), to find a position in. */
function rawText(runs: readonly RawRun[]): string {
  return runs.map((run) => run.text).join("");
}

/** Runs with their leading spaces taken off. */
function trimStart(runs: readonly RawRun[]): RawRun[] {
  const text = rawText(runs);
  return dropChars(runs, text.length - text.trimStart().length);
}

/** The first letter of some runs made a capital ("the introduction ..." to "The introduction ..."). */
function capitalise(runs: readonly RawRun[]): RawRun[] {
  const out = trimStart(runs);
  if (out[0]) out[0] = { ...out[0], text: out[0].text.charAt(0).toUpperCase() + out[0].text.slice(1) };
  return out;
}

function capitaliseText(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Split runs at a separator string, keeping each side's marks. Links are never split. */
function splitRuns(runs: readonly RawRun[], separator: string): RawRun[][] {
  const out: RawRun[][] = [[]];
  for (const run of runs) {
    if (run.literal || run.href) {
      out[out.length - 1].push(run);
      continue;
    }
    const parts = run.text.split(separator);
    parts.forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push({ ...run, text: part });
    });
  }
  return out;
}

/**
 * Where the first sentence of some runs ends: the index of a full stop that
 * is followed by a space or the end, outside any link. -1 when there is none.
 */
function sentenceEnd(runs: readonly RawRun[]): number {
  let at = 0;
  for (const run of runs) {
    if (!run.href) {
      const found = /\.(?=\s|$)/.exec(run.text);
      if (found) return at + found.index;
    }
    at += run.text.length;
  }
  return -1;
}

/** How many links some runs hold. */
function runsLinksCount(runs: readonly RawRun[]): number {
  let n = 0;
  for (let i = 0; i < runs.length; i += 1) if (runs[i].href && runs[i].href !== runs[i - 1]?.href) n += 1;
  return n;
}

/** Does a link come before character `n`? */
function linkBefore(runs: readonly RawRun[], n: number): boolean {
  let at = 0;
  for (const run of runs) {
    if (at >= n) return false;
    if (run.href || run.refused) return true;
    at += run.text.length;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Words the reader recognises
// ---------------------------------------------------------------------------

/** A time: minutes, hours or days ("About 65 to 80 minutes", "About 2¼ hours", "An hour or more"). */
function isTime(text: string): boolean {
  return /\b(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i.test(text) && text.length <= L.partTime;
}

/** A word range ("250 to 350 words"). */
function wordsIn(text: string): { min: number; max: number } | null {
  const found = new RegExp(`(\\d+)\\s*(?:to|-|${String.fromCharCode(0x2013)})\\s*(\\d+)\\s*words`, "i").exec(text);
  if (!found) return null;
  const min = Number(found[1]);
  const max = Number(found[2]);
  return min >= 1 && min <= max && max <= L.maxAnswerWords ? { min, max } : null;
}

/** A date as a source line writes it: a year, perhaps with a month. */
function isDate(text: string): boolean {
  return /^(?:(?:early|mid|late)\s+)?(?:[A-Z][a-z]+\.?\s+)?(?:19|20)\d{2}$/.test(text.trim());
}

/**
 * A sentence that starts with how long something takes ("22 minutes", "About
 * 2½ hours; the first 40 minutes ...", "Nearly 2 hours").
 */
const TIME_FIRST =
  /^(?:(?:about|nearly|around|roughly|under|over|at least|up to|less than|more than)\s+)?(?:\d[\d.,]*[¼½¾]?|[¼½¾]|an?|half an|one|two|three|four|five|ten)(?:\s*(?:to|or)\s*\d[\d.,]*[¼½¾]?)?\s*(?:minutes?|mins?|hours?|hrs?|days?)\b/i;

const KIND_WORDS: Array<[RegExp, SourceKind]> = [
  [/^watch or listen\b/i, "watchOrListen"],
  [/^watch or read\b/i, "watchOrRead"],
  [/^read\b/i, "read"],
  [/^watch\b/i, "watch"],
  [/^listen\b/i, "listen"],
  [/^explore\b/i, "explore"],
  [/^notebook\b/i, "notebook"],
];

/**
 * The kind a line opens with ("Read:", "Watch or listen:", "Listen, after
 * the session:"), how many characters that took, and a qualifier written
 * between the kind and its colon.
 */
function kindAt(text: string): { kind: SourceKind; length: number; qualifier: string } | null {
  const trimmed = text.trimStart();
  const lead = text.length - trimmed.length;
  for (const [pattern, kind] of KIND_WORDS) {
    const found = pattern.exec(trimmed);
    if (!found) continue;
    const after = /^(?:,\s*([^:]{1,60}))?\s*:\s*/.exec(trimmed.slice(found[0].length));
    if (!after) continue;
    return { kind, length: lead + found[0].length + after[0].length, qualifier: (after[1] ?? "").trim() };
  }
  return null;
}

/** The board's three whens, from a This week cell or a due line. */
function whenIn(text: string): When | null {
  if (/\bday before\b/i.test(text)) return "dayBefore";
  if (/\bat (?:the |your |each |)?session\b|\bat session\b|\bin the session\b/i.test(text)) return "atSession";
  if (/\bbefore\b|\bbring it\b/i.test(text)) return "before";
  return null;
}

/** "by noon the day before" is "12:00"; "by the end of the day before" is ""; anything else, null. */
function dayBeforeTimeIn(text: string): string | null {
  if (/\bby (?:the )?(?:noon|midday)\b[^.|]*\bday before\b/i.test(text)) return "12:00";
  const clock = /\bby (\d{1,2})(?::(\d{2}))?\s*(am|pm)\b[^.|]*\bday before\b/i.exec(text);
  if (clock) {
    const hour = (Number(clock[1]) % 12) + (clock[3].toLowerCase() === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${clock[2] ?? "00"}`;
  }
  if (/\bby the end of the day before\b/i.test(text)) return "";
  return null;
}

/** "a 3-minute talk", "a 2-minute pitch", "a 2-minute brief" */
function talkIn(text: string): { minutes: number; name: string } | null {
  const found = /(\d+)[\s-]*minutes?\s+(talk|pitch|brief|presentation)\b/i.exec(text);
  if (!found) return null;
  const minutes = Number(found[1]);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > L.maxTalkMinutes) return null;
  return { minutes, name: found[2].toLowerCase() };
}

/** "given out by your facilitator", "picked by each person". */
function givenByIn(text: string): GivenBy | null {
  if (/\bgiven out\b/i.test(text)) return "facilitator";
  if (/\bpicked by\b/i.test(text)) return "fellow";
  return null;
}

/** The label a paragraph opens with ("Reflect", "Choose one:", "Written answer ·"), and what follows it. */
function labelOf(runs: readonly RawRun[]): { label: string; rest: RawRun[] } | null {
  const text = rawText(runs);
  const trimmed = text.trimStart();
  const found = /^(reflect|choose one|written answer|fill in|checklist|talk)\b\s*:?/i.exec(trimmed);
  if (!found) return null;
  // "Reflect" opens a stop only as a line of its own, or as "Reflect:" with its prompt.
  const label = found[1].toLowerCase();
  const rest = trimStart(dropChars(runs, text.length - trimmed.length + found[0].length));
  if (label === "reflect" && lineText(rest) && !found[0].includes(":")) return null;
  return { label, rest };
}

/** A heading's words: its id taken off, and a time in brackets or after " · " apart. */
function headingParts(token: Tokens.Heading, counts: InlineCounts): { id: string; text: string; after: string } {
  const { id, runs } = takeId(tokensLine(token.tokens, counts));
  let text = lineText(runs);
  let after = "";
  const bracket = /\s*\(([^()]*)\)\s*$/.exec(text);
  if (bracket && (isTime(bracket[1]) || wordsIn(bracket[1]))) {
    after = capitaliseText(bracket[1].trim());
    text = text.slice(0, bracket.index).trim();
  } else {
    const dot = text.lastIndexOf(" · ");
    if (dot > 0 && (isTime(text.slice(dot + 3)) || wordsIn(text.slice(dot + 3)))) {
      after = capitaliseText(text.slice(dot + 3).trim());
      text = text.slice(0, dot).trim();
    }
  }
  return { id, text, after };
}

function allBold(runs: readonly Run[]): boolean {
  return runs.length > 0 && runs.every((run) => run.bold === true || run.text.trim() === "");
}

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

function paragraphRuns(token: Token, counts: InlineCounts): Run[] {
  return line(tokensLine((token as Tokens.Paragraph).tokens, counts));
}

function itemRuns(item: Tokens.ListItem, counts: InlineCounts): Run[] {
  const { first, rest } = readItem(item, counts);
  return line(joinLines([first, ...rest]));
}

/** A list in prose: each item one line; a list inside an item becomes items after it. */
function listItems(list: Tokens.List, counts: InlineCounts): Array<{ runs: Run[] }> {
  const out: Array<{ runs: Run[] }> = [];
  for (const item of list.items) {
    const runs = itemRuns(item, counts);
    if (runs.length > 0) out.push({ runs });
    for (const nested of item.tokens) if (nested.type === "list") out.push(...listItems(nested as Tokens.List, counts));
  }
  return out;
}

function tableCells(cells: readonly Tokens.TableCell[], counts: InlineCounts): TableCell[] {
  return cells.map((cell) => ({ runs: line(tokensLine(cell.tokens, counts)) }));
}

/** Tokens as prose, in order: paragraphs, lists, tables and code. */
function proseOf(tokens: readonly Token[], counts: InlineCounts, leftOut: string[]): Prose {
  const out: Prose = [];
  for (const token of tokens) {
    switch (token.type) {
      case "paragraph": {
        const runs = paragraphRuns(token, counts);
        if (runs.length > 0) out.push({ type: "p", runs });
        break;
      }
      case "list": {
        const list = token as Tokens.List;
        const items = listItems(list, counts);
        if (items.length > 0) out.push({ type: list.ordered ? "ol" : "ul", items });
        break;
      }
      case "table": {
        const table = token as Tokens.Table;
        out.push({ type: "table", header: tableCells(table.header, counts), rows: table.rows.map((row) => ({ cells: tableCells(row, counts) })) });
        break;
      }
      case "code": {
        const code = token as Tokens.Code;
        // Shown exactly as written: every space and line break kept.
        if (code.text.trim()) out.push({ type: "code", lang: (code.lang ?? "").trim().split(/\s+/)[0] ?? "", text: code.text.replace(/\n+$/, "") });
        break;
      }
      case "blockquote":
        out.push(...proseOf((token as Tokens.Blockquote).tokens, counts, leftOut));
        break;
      case "heading": {
        // A heading prose cannot hold keeps its words, as a bold line.
        const text = lineText(tokensLine((token as Tokens.Heading).tokens, counts));
        if (text) out.push({ type: "p", runs: [{ text, bold: true }] });
        break;
      }
      case "html":
        if ((token as Tokens.HTML).raw.trim() && !/^<!--[\s\S]*-->$/.test((token as Tokens.HTML).raw.trim())) {
          leftOut.push("A piece of HTML was left out: write it as Markdown.");
        }
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * THE SAME READING OF TEXT, FOR A PAGE OF THE GUIDE THAT IS NOT A WEEK (a
 * programme's Start here and Glossary, `src/lib/courses/guide/`): Markdown's
 * own grammar through `marked`, inline text read into runs as a week's text
 * is (bold, italics, entities, and only https or mailto links), and a run of
 * blocks read as prose as a week's text is (paragraphs, lists, tables,
 * code). One reader, so what a week refuses or leaves out, those pages
 * refuse or leave out too. Each reader keeps its own count of what it left
 * out, for the person who pasted to check.
 */
export type GuideTextReader = {
  /** The Markdown's top-level blocks, read with GitHub's tables as a week's are. */
  tokens(markdown: string): Token[];
  /** Blocks as prose. */
  prose(tokens: readonly Token[]): Prose;
  /** A heading's or a table cell's inline text as one canonical line, never cut. */
  line(tokens: readonly Token[] | undefined): Run[];
  /** What was left out so far: HTML (one sentence each), pictures, and links that are not https or mailto. */
  leftOut(): { html: string[]; images: number; refused: string[] };
};

export function guideTextReader(): GuideTextReader {
  const counts: InlineCounts = { images: 0, refused: [] };
  const html: string[] = [];
  return {
    tokens: (markdown) => marked.lexer(markdown, { gfm: true }),
    prose: (tokens) => proseOf(tokens, counts, html),
    line: (tokens) => line(tokensLine(tokens, counts)),
    leftOut: () => ({ html: [...new Set(html)], images: counts.images, refused: [...new Set(counts.refused)] }),
  };
}

// ---------------------------------------------------------------------------
// The document's sections
// ---------------------------------------------------------------------------

type Section = { heading: Tokens.Heading | null; tokens: Token[] };

/** Tokens split at each heading of `depth` or shallower. Blank lines go. */
function sectionsAt(tokens: readonly Token[], depth: number): Section[] {
  const out: Section[] = [{ heading: null, tokens: [] }];
  for (const token of tokens) {
    if (token.type === "heading" && (token as Tokens.Heading).depth <= depth) {
      out.push({ heading: token as Tokens.Heading, tokens: [] });
    } else if (token.type !== "space") {
      out[out.length - 1].tokens.push(token);
    }
  }
  return out;
}

type SectionKind =
  | "thisWeek"
  | "why"
  | "outcomes"
  | "contentNote"
  | "before"
  | "inTheSession"
  | "goFurther"
  | "handsOn"
  | "cases"
  | "section";

function sectionKind(text: string): SectionKind {
  const name = text.replace(/[:.]\s*$/, "").trim();
  if (/^this week$/i.test(name)) return "thisWeek";
  if (/^why this week$/i.test(name)) return "why";
  if (/^after this week,? you(?:’ll| will)? (?:can|be able to)$/i.test(name)) return "outcomes";
  if (/^content note$/i.test(name)) return "contentNote";
  if (/^before (?:the|your|each) session$/i.test(name)) return "before";
  if (/^in the session$/i.test(name)) return "inTheSession";
  if (/^go further\b/i.test(name)) return "goFurther";
  if (/^hands-on route\b/i.test(name)) return "handsOn";
  if (/^(?:your )?case stud(?:y|ies)$/i.test(name)) return "cases";
  return "section";
}

const PART_HEADING = /^part\s+(\d+)\s*[:.]\s*(.*)$/i;

/** Is this an id on a line of its own? */
function standaloneId(token: Token): string | null {
  if (token.type !== "paragraph") return null;
  const found = /^\s*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}\s*$/.exec((token as Tokens.Paragraph).text);
  return found ? found[1] : null;
}

/** "After this week you can:" on a line of its own. */
function isOutcomesLine(token: Token, counts: InlineCounts): { id: string; text: string } | null {
  if (token.type !== "paragraph") return null;
  const { id, runs } = takeId(tokensLine((token as Tokens.Paragraph).tokens, counts));
  const text = lineText(runs);
  return sectionKind(text) === "outcomes" ? { id, text: text.replace(/[:.]\s*$/, "") } : null;
}

/** "Send it to your facilitator by the end of the day before your session." */
function isSendLine(token: Token): boolean {
  return token.type === "paragraph" && /^send (?:it|them|your \w+) to your facilitator\b/i.test((token as Tokens.Paragraph).text.trim());
}

/** Text in "Mixed CASE like THIS" made sentence case, keeping "I". */
function sentenceCase(text: string): string {
  const lowered = text
    .split(/(\s+)/)
    .map((word) => (/^[A-Z][A-Z'’]+$/.test(word) ? word.toLowerCase() : word))
    .join("")
    .replace(/\bi\b/g, "I");
  return capitaliseText(lowered);
}

/** The part numbers a This week task names: "Part 4", "Parts 1 to 3", "Parts 1 and 2". */
export function partNumbersIn(what: string): number[] {
  const range = new RegExp(`\\bparts?\\s+(\\d+)\\s*(?:to|-|${String.fromCharCode(0x2013)})\\s*(\\d+)`, "i").exec(what);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (from >= 1 && to >= from && to - from < 60) return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  const listed = /\bparts?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)/i.exec(what);
  return listed ? listed[1].split(/\s*(?:,|and|&)\s*/).map(Number).filter((n) => Number.isInteger(n) && n >= 1) : [];
}

/**
 * Who gives a table's packs out, from the part's own words: "Choose one
 * agenda" is the person's pick; "the one you chose at session 2", "you'll be
 * given one" and anything else is a facilitator's draw (Q32).
 */
function givenByFrom(tokens: readonly Token[], counts: InlineCounts): GivenBy {
  const text = tokens.map((token) => (token.type === "paragraph" ? lineText(tokensLine((token as Tokens.Paragraph).tokens, counts)) : "")).join(" ");
  if (/\bchoose one\b|\bpick one\b/i.test(text) && !/\b(?:chose|given|draw)\b/i.test(text)) return "fellow";
  return "facilitator";
}

/** A content note inside "What happened": "Content note: ..." or "... talk to your facilitator before you take this one." */
function splitContentNote(runs: readonly RawRun[]): { what: Run[]; contentNote: string } {
  const text = rawText(runs);
  const marked = /\s*content note:\s*/i.exec(text);
  if (marked) {
    const [before] = cutAt(runs, marked.index);
    return { what: line(before), contentNote: text.slice(marked.index + marked[0].length).trim() };
  }
  const sentences = text.split(/(?<=\.)\s+/);
  const at = sentences.findIndex((sentence) => /\btalk to your facilitator before you take\b/i.test(sentence));
  if (at < 0) return { what: line(runs), contentNote: "" };
  const start = sentences.slice(0, at).join(" ").length + (at > 0 ? 1 : 0);
  return { what: line(cutAt(runs, start)[0]), contentNote: sentences.slice(at).join(" ").trim() };
}

/**
 * A template to fill in, written as a block of plain text (week 6's action
 * plan): a title line in capitals, then numbered headings, each either a
 * box of its own or the boxes written under it ("The problem it helps
 * with:", or a line with blanks, "IF I ____, THEN ____ will happen").
 * Null for anything else, which stays code.
 */
function fillInFromTemplate(code: string): FillInBlock | null {
  let title = "";
  const groups: Array<{ heading: string; lines: string[] }> = [];
  for (const raw of code.split("\n")) {
    const text = raw.trim();
    if (!text) continue;
    const numbered = /^(\d+)\.\s+(.*)$/.exec(text);
    if (numbered) groups.push({ heading: numbered[2].trim(), lines: [] });
    else if (groups.length > 0) groups[groups.length - 1].lines.push(text);
    else if (!title) title = sentenceCase(text);
    else return null;
  }
  if (groups.length < 2) return null;
  return {
    id: "",
    type: "fillIn",
    title,
    groups: groups.map((group) => {
      if (group.lines.length === 0) return { heading: group.heading, boxes: [{ id: "", label: "" }] };
      const joined = group.lines.join("\n");
      if (/_{3,}/.test(joined)) return { heading: group.heading, boxes: blanksToBoxes(joined) };
      return { heading: group.heading, boxes: group.lines.map((label) => ({ id: "", label: label.replace(/:\s*$/, "").trim() })) };
    }),
  };
}

/** "IF I ____, THEN ____ will happen, ..." as boxes "If I…", "Then… will happen", ... */
function blanksToBoxes(text: string): Array<{ id: string; label: string }> {
  const pieces = text.split(/_{3,}/);
  const ellipsis = String.fromCharCode(0x2026);
  const boxes: Array<{ id: string; label: string }> = [];
  // Between two blanks: the first blank's trailing words, then the next blank's lead.
  const split = (between: string): [string, string] => {
    const newline = between.indexOf("\n");
    if (newline >= 0) return [between.slice(0, newline), between.slice(newline + 1)];
    const comma = between.indexOf(",");
    return comma >= 0 ? [between.slice(0, comma + 1), between.slice(comma + 1)] : ["", between];
  };
  const leads: string[] = [];
  const trails: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    if (i === 0) {
      leads.push(pieces[0]);
    } else if (i === pieces.length - 1) {
      trails.push(pieces[i]);
    } else {
      const [trail, lead] = split(pieces[i]);
      trails.push(trail);
      leads.push(lead);
    }
  }
  for (let i = 0; i < leads.length; i += 1) {
    const lead = sentenceCase(leads[i].replace(/^[,.;\s]+|\s+$/g, ""));
    const trail = (trails[i] ?? "").replace(/^[\s,]+|[,.;\s]+$/g, "");
    boxes.push({ id: "", label: `${lead}${ellipsis}${/\w/.test(trail) ? ` ${trail}` : ""}` });
  }
  return boxes;
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class Reader {
  readonly problems: string[] = [];
  readonly leftOut: string[] = [];
  readonly counts: InlineCounts = { images: 0, refused: [] };
  /** The numbers of the parts whose packs were read from a table. */
  readonly packTables: number[] = [];
  /** The part numbers This week's tasks name. */
  readonly namedParts = new Set<number>();

  // ---- This week ----

  thisWeek(id: string, tokens: readonly Token[]): ThisWeekBlock | null {
    const tableAt = tokens.findIndex((token) => token.type === "table");
    if (tableAt < 0) {
      this.problems.push("This week has no table: give it one row per task, with Do this, Time and When.");
      return null;
    }
    const table = tokens[tableAt] as Tokens.Table;
    const rows: ThisWeekRow[] = [];
    let total = "";
    const cut = (text: string, max: number) => text.slice(0, max);
    for (const cells of table.rows) {
      const [what = "", time = "", when = ""] = cells.map((cell) => lineText(tokensLine(cell.tokens, this.counts)));
      if (!what && !time) continue;
      if (/^in all\b/i.test(what)) {
        total = cut(time, L.thisWeekTime);
        continue;
      }
      if (/^none\b/i.test(time)) {
        rows.push({ type: "none", what: cut(what, L.thisWeekWhat), time: cut(time, L.thisWeekTime), note: cut(when, L.thisWeekRowNote) });
        continue;
      }
      if (/\(optional\b/i.test(what) || /\bnot counted\b/i.test(when)) {
        rows.push({ type: "optional", what: cut(what, L.thisWeekWhat), time: cut(time, L.thisWeekTime), note: cut(when, L.thisWeekRowNote) });
        continue;
      }
      const parsedWhen = whenIn(when);
      if (!parsedWhen) {
        this.problems.push(`This week: say when “${what}” is due: before the session, by the end of the day before, or at the session.`);
      }
      rows.push({
        type: "task",
        what: cut(what, L.thisWeekWhat),
        time: cut(time, L.thisWeekTime),
        when: parsedWhen ?? "before",
        whenText: cut(when, L.thisWeekRowNote),
        covers: [],
      });
      for (const n of partNumbersIn(what)) this.namedParts.add(n);
      if (/\b(?:the |all |every )?(?:\w+ )?parts below\b/i.test(what)) this.namedParts.add(0);
    }
    const note = proseOf([...tokens.slice(0, tableAt), ...tokens.slice(tableAt + 1)], this.counts, this.leftOut);
    return { id, type: "thisWeek", rows, total, note };
  }

  // ---- Lists of things ----

  outcomes(id: string, heading: string, tokens: readonly Token[]): OutcomesBlock {
    const items: string[] = [];
    for (const token of tokens) {
      if (token.type === "list") for (const item of listItems(token as Tokens.List, this.counts)) items.push(runsText(item.runs));
      else if (token.type === "paragraph") {
        const runs = paragraphRuns(token, this.counts);
        if (runs.length > 0) items.push(runsText(runs));
      }
    }
    return { id, type: "outcomes", heading, items };
  }

  contentNote(id: string, tokens: readonly Token[]): ContentNoteBlock {
    const links: ContentNoteBlock["links"] = [];
    const body: Token[] = [];
    for (const token of tokens) {
      if (token.type === "list") {
        const asLinks = (token as Tokens.List).items.map((item) => {
          const { first } = readItem(item, this.counts);
          const head = trimStart(first)[0];
          if (!head?.href) return null;
          const label = first.filter((run) => run.href === head.href).map((run) => run.text).join("");
          const detail = lineText(first.filter((run) => run.href !== head.href)).replace(/^[:·,\s]+/, "");
          return { label: label.replace(/\s+/g, " ").trim(), url: head.href, detail };
        });
        if (asLinks.every(Boolean)) {
          links.push(...(asLinks as ContentNoteBlock["links"]));
          continue;
        }
      }
      body.push(token);
    }
    return { id, type: "contentNote", body: proseOf(body, this.counts, this.leftOut), links };
  }

  goFurther(id: string, heading: string, tokens: readonly Token[]): GoFurtherBlock {
    const items: GoFurtherItem[] = [];
    const intro: Token[] = [];
    // The items are the section's last list; anything before it is its introduction, lists included.
    const itemsAt = tokens.map((token) => token.type).lastIndexOf("list");
    for (const [at, token] of tokens.entries()) {
      if (at !== itemsAt) {
        intro.push(token);
        continue;
      }
      for (const item of (token as Tokens.List).items) {
        const { first, rest } = readItem(item, this.counts);
        const read = this.sourceLine(joinLines([first, ...rest]));
        if (!read) {
          this.problems.push(`Go further: “${lineText(first).slice(0, 60)}” needs a kind first: Read, Watch, Listen, Watch or listen, Watch or read, Explore or Notebook.`);
          continue;
        }
        if ("refused" in read) {
          this.problems.push(`Go further: “${read.title}” needs an https link: ${read.refused} isn’t one.`);
          continue;
        }
        const { note, ...fields } = read;
        // Words before a link that is one of several make the item a line of its own
        // ("Watch or read: the incident, told in [a video] or [an essay]").
        const several = runsLinksCount(joinLines([first, ...rest])) > 1;
        if (fields.url && !(fields.lead && several)) {
          items.push({ ...fields, why: note });
        } else if (fields.url) {
          const kind = kindAt(rawText(joinLines([first, ...rest])));
          const whole = line(trimStart(dropChars(joinLines([first, ...rest]), kind?.length ?? 0)));
          items.push({ ...fields, lead: "", title: "", url: "", by: "", date: "", time: "", compute: "", why: whole });
        } else {
          // No link of its own: the item is its line, links and all ("Watch or read: the Hugging Face incident ...").
          const whole = line(joinLines([[{ text: fields.title }], ...(note.length > 0 ? [[{ text: ". " }, ...note]] : [])]));
          items.push({ ...fields, title: "", lead: "", why: whole });
        }
      }
    }
    return { id, type: "goFurther", heading, intro: proseOf(intro, this.counts, this.leftOut), items };
  }

  // ---- A source line ----

  /**
   * A source line: "Read: [Title](https://...), Ada Example, 2024. 22
   * minutes. A note." Also "Read: section 2, of the [Report](...)" (the
   * words before the link are its lead), and "Read: METR's time horizons.
   * Start with [...]" (no link of its own: its note carries the links).
   * Null when the line does not open with a kind.
   */
  sourceLine(runs: readonly RawRun[]): SourceFields | { refused: string; title: string } | null {
    const kind = kindAt(rawText(runs));
    if (!kind) return null;
    const rest = trimStart(dropChars(runs, kind.length));
    const firstLink = rest.findIndex((run) => run.href || run.refused);
    const leadText = rawText(firstLink < 0 ? rest : rest.slice(0, firstLink));
    const sentence = /[.:](?=\s)/.exec(leadText);
    const base = { kind: kind.kind, by: "", date: "", time: "", compute: "" };

    if (firstLink < 0 || sentence) {
      // No link of its own: a title up to its first full stop or colon, then a note with the links.
      const titleEnd = sentence ? sentence.index : rawText(rest).length;
      const [titleRuns, after] = cutAt(rest, titleEnd);
      return { ...base, lead: kind.qualifier, title: lineText(titleRuns), url: "", note: line(capitalise(dropChars(after, 1))) };
    }

    const head = rest[firstLink];
    if (head.refused) {
      const title = rest
        .filter((run) => run.refused === head.refused)
        .map((run) => run.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["“](.*)["”]$/, "$1");
      return { refused: head.refused, title };
    }
    let i = firstLink;
    let title = "";
    while (i < rest.length && rest[i].href === head.href) {
      title += rest[i].text;
      i += 1;
    }
    title = title.replace(/\s+/g, " ").trim().replace(/^["“](.*)["”]$/, "$1");
    const lead = [kind.qualifier, lineText(rest.slice(0, firstLink))].filter(Boolean).join(" ");
    const parsed = afterTitle(rest.slice(i), kind.kind);
    return { ...base, ...parsed, lead: lead, title: title, url: safeSourceUrl(head.href) ?? "" };
  }

  // ---- A part's own blocks ----

  /**
   * A list of sources: each item a source line, or a "choose one" (a
   * source line with no link of its own, ending in a colon, with one linked
   * option per line under it). Null when an item opens with no kind.
   */
  sourcesFrom(list: Tokens.List): Array<SourceBlock | ChooseOneBlock> | null {
    const out: Array<SourceBlock | ChooseOneBlock> = [];
    for (const item of list.items) {
      const { id, first, rest } = readItem(item, this.counts);
      const nested = item.tokens.find((token) => token.type === "list") as Tokens.List | undefined;
      const choice = nested ? this.choiceFromItem(id, first, nested) : null;
      if (choice) {
        out.push(choice);
        continue;
      }
      const read = this.sourceLine(joinLines([first, ...rest]));
      if (!read) return null;
      if ("refused" in read) {
        this.problems.push(`The source “${read.title}” needs an https link: ${read.refused} isn’t one.`);
        continue;
      }
      out.push({ id, type: "source", ...read });
    }
    return out;
  }

  /** "Read: one 80,000 Hours career review that fits you, 15 to 35 minutes:" and its options. */
  choiceFromItem(id: string, first: RawRun[], nested: Tokens.List): ChooseOneBlock | null {
    const text = lineText(first);
    const kind = kindAt(text);
    if (!kind || !/:\s*$/.test(text) || first.some((run) => run.href)) return null;
    let title = text.slice(kind.length).replace(/:\s*$/, "").trim();
    let time = "";
    const comma = title.lastIndexOf(", ");
    if (comma > 0 && isTime(title.slice(comma + 2))) {
      time = title.slice(comma + 2).trim();
      title = title.slice(0, comma).trim();
    }
    const packs: Pack[] = [];
    for (const option of nested.items) {
      const { id: packId, first: optionRuns } = readItem(option, this.counts);
      const linkAt = optionRuns.findIndex((run) => run.href);
      if (linkAt < 0) return null;
      let end = linkAt;
      while (end < optionRuns.length && optionRuns[end].href === optionRuns[linkAt].href) end += 1;
      const name = optionRuns.slice(linkAt, end).map((run) => run.text).join("").replace(/\s+/g, " ").trim();
      const after = rawText(optionRuns.slice(end));
      const comma2 = /^\s*,\s*/.exec(after);
      packs.push({
        id: packId,
        name,
        time: "",
        note: line(comma2 ? dropChars(optionRuns.slice(end), comma2[0].length) : optionRuns.slice(end)),
        read: line(optionRuns.slice(0, end)),
      });
    }
    return { id, type: "chooseOne", form: "list", title, givenBy: "fellow", kind: kind.kind, time, noteHeading: "", questions: [], packs };
  }

  reflection(id: string, inline: RawRun[], following: Token | undefined): { block: ReflectionBlock | null; used: number } {
    const prompts: ReflectionBlock["prompts"] = [];
    const inlineText = lineText(inline);
    if (inlineText) prompts.push({ id: "", text: inlineText });
    let used = 0;
    if (!inlineText && following?.type === "list") {
      used = 1;
      for (const item of (following as Tokens.List).items) {
        const { id: promptId, first, rest } = readItem(item, this.counts);
        const text = lineText(joinLines([first, ...rest]));
        if (text) prompts.push({ id: promptId, text });
      }
    }
    if (prompts.length === 0) {
      this.problems.push("A Reflect line has no prompt after it: list the prompts under it, one to a line.");
      return { block: null, used };
    }
    return { block: { id, type: "reflection", prompts }, used };
  }

  /**
   * A table of packs: a column naming each pack, perhaps a note column ("In
   * one line"), a column of what to read (with its links) and a Time
   * column. Null when the table has no Time column or no column of links.
   */
  packsFromTable(table: Tokens.Table): { title: string; noteHeading: string; packs: Pack[] } | null {
    const header = table.header.map((cell) => lineText(tokensLine(cell.tokens, this.counts)));
    const timeAt = header.findIndex((text) => /^time$/i.test(text.trim()));
    if (timeAt < 0) return null;
    const rows = table.rows.map((cells) => cells.map((cell) => tokensLine(cell.tokens, this.counts)));
    const readAt = header.findIndex((text, column) => column > 0 && column !== timeAt && /^read$/i.test(text.trim()));
    const linkAt =
      readAt >= 0
        ? readAt
        : header.findIndex((_, column) => column > 0 && column !== timeAt && rows.every((row) => row[column]?.some((run) => run.href)));
    if (linkAt < 0) return null;
    const noteAt = header.findIndex((_, column) => column > 0 && column !== timeAt && column !== linkAt);
    const packs: Pack[] = rows.map((row) => {
      const { id, runs } = takeId(row[0] ?? []);
      for (const run of row[linkAt] ?? []) {
        if (run.refused) this.problems.push(`“${lineText(runs)}”: “${run.text.trim()}” needs an https link: ${run.refused} isn’t one.`);
      }
      return {
        id,
        name: lineText(runs),
        time: lineText(row[timeAt] ?? []),
        note: noteAt >= 0 ? line(row[noteAt] ?? []) : [],
        read: line(row[linkAt] ?? []),
      };
    });
    return { title: header[0] ?? "", noteHeading: noteAt >= 0 ? header[noteAt] : "", packs };
  }

  table(id: string, table: Tokens.Table): TableBlock {
    return { id, type: "table", header: tableCells(table.header, this.counts), rows: table.rows.map((row) => ({ cells: tableCells(row, this.counts) })) };
  }

  fillIn(id: string, rest: RawRun[], following: Token | undefined, where: string): { block: FillInBlock | null; used: number } {
    const title = lineText(rest).replace(/^:\s*/, "").trim();
    if (following?.type !== "list") {
      this.problems.push(`${where}: a Fill in line needs a numbered list of headings after it.`);
      return { block: null, used: 0 };
    }
    const groups: FillInBlock["groups"] = [];
    for (const item of (following as Tokens.List).items) {
      const { id: headId, first } = readItem(item, this.counts);
      const boxes: FillInBlock["groups"][number]["boxes"] = [];
      for (const nested of item.tokens) {
        if (nested.type !== "list") continue;
        for (const boxItem of (nested as Tokens.List).items) {
          const { id: boxId, first: boxFirst } = readItem(boxItem, this.counts);
          boxes.push({ id: boxId, label: lineText(boxFirst) });
        }
      }
      if (boxes.length === 0) boxes.push({ id: headId, label: "" });
      groups.push({ heading: lineText(first), boxes });
    }
    return { block: { id, type: "fillIn", title, groups }, used: 1 };
  }

  checklist(id: string, list: Tokens.List): ChecklistBlock {
    const items = list.items.map((item) => {
      const { id: itemId, first, rest } = readItem(item, this.counts);
      const detail = rest.map(lineText).join(" ").trim();
      return { id: itemId, title: lineText(first), ...(detail ? { detail } : {}), mirrorToMyWork: false };
    });
    return { id, type: "checklist", items };
  }

  /** A Talk line and what follows it: intro paragraphs, then a "Prepare ..." paragraph and its list. */
  talk(id: string, rest: RawRun[], tokens: readonly Token[], from: number, heading: string): { block: CasesBlock; used: number } {
    const segments = splitRuns(rest, " · ").map(lineText);
    const talk = /^none$/i.test(segments[0] ?? "") ? null : talkIn(segments[0] ?? "");
    const givenBy = segments.slice(1).map(givenByIn).find((given): given is GivenBy => given !== null) ?? (heading ? "facilitator" : "fellow");
    let used = 0;
    const intro: Token[] = [];
    const prepare: Token[] = [];
    while (from + used < tokens.length) {
      const token = tokens[from + used];
      if (this.isBoundary(token) || token.type === "table" || token.type === "heading") break;
      if (token.type === "list" && this.sourcesFrom(token as Tokens.List)) break;
      if (prepare.length === 0 && token.type === "paragraph" && /^prepare\b/i.test(lineText(paragraphRuns(token, this.counts)))) {
        prepare.push(token);
      } else if (prepare.length > 0) {
        prepare.push(token);
      } else {
        intro.push(token);
      }
      used += 1;
    }
    return {
      block: {
        id,
        type: "cases",
        heading,
        intro: proseOf(intro, this.counts, this.leftOut),
        talk,
        prepare: proseOf(prepare, this.counts, this.leftOut),
        givenBy,
        groupLabel: "",
        startLabel: "Start here",
        groups: [],
        note: [],
      },
      used,
    };
  }

  /** Does this token start a block of its own: a label line, a due line, or an id on its own line? */
  isBoundary(token: Token): boolean {
    if (standaloneId(token)) return true;
    if (token.type !== "paragraph") return false;
    const runs = takeId(splitLines(inlineRuns((token as Tokens.Paragraph).tokens, {}, { images: 0, refused: [] }))[0] ?? []).runs;
    return labelOf(runs) !== null || isSendLine(token);
  }

  // ---- A part ----

  part(heading: Tokens.Heading, tokens: readonly Token[], partNumber: number): PartBlock {
    const { id, text, after } = headingParts(heading, this.counts);
    const found = PART_HEADING.exec(text);
    const title = (found ? found[2] : text).trim();
    const where = `Part ${partNumber}`;
    const body = this.partBody(tokens, where, title, after);
    const part: PartBlock = { id, type: "part", title, time: body.time, framing: body.framing, blocks: body.blocks };
    if (body.packTable) this.packTables.push(partNumber);
    this.addTalkFromTitle(part);
    if (this.namedParts.has(partNumber) || this.namedParts.has(0)) this.checklistFromList(part);
    return part;
  }

  /** "Your 2-minute pitch", "Your rival plan, a 2-minute brief": a talk to get ready for, at the end of the part. */
  addTalkFromTitle(part: PartBlock): void {
    const talk = talkIn(part.title);
    if (!talk || part.blocks.some((block) => block.type === "cases")) return;
    const given = part.blocks.find((block): block is ChooseOneBlock => block.type === "chooseOne");
    part.blocks.push({
      id: "",
      type: "cases",
      heading: "",
      intro: [],
      talk,
      prepare: [],
      givenBy: given?.givenBy ?? "fellow",
      groupLabel: "",
      startLabel: "Start here",
      groups: [],
      note: [],
    });
  }

  /**
   * A part This week names that holds nothing to tick or write in (week 6's
   * "go deep on one route"): its first bulleted list is its checklist, so
   * the part can be done.
   */
  checklistFromList(part: PartBlock): void {
    if (part.blocks.some((block) => block.type !== "text" && block.type !== "table")) return;
    const lift = (prose: Prose): { before: Prose; items: Run[][]; after: Prose } | null => {
      const at = prose.findIndex((p) => p.type === "ul");
      const list = prose[at];
      if (at < 0 || !list || list.type !== "ul") return null;
      return { before: prose.slice(0, at), items: list.items.map((item) => item.runs), after: prose.slice(at + 1) };
    };
    const toChecklist = (items: Run[][]): ChecklistBlock => ({
      id: "",
      type: "checklist",
      items: items.map((runs) => ({ id: "", title: runsText(runs), mirrorToMyWork: false })),
    });
    const plain = (body: Prose): TextBlock => ({ id: "", type: "text", role: "plain", heading: "", time: "", body });
    const inFraming = lift(part.framing);
    if (inFraming) {
      part.framing = inFraming.before;
      part.blocks.unshift(toChecklist(inFraming.items), ...(inFraming.after.length > 0 ? [plain(inFraming.after)] : []));
      return;
    }
    for (let i = 0; i < part.blocks.length; i += 1) {
      const block = part.blocks[i];
      if (block.type !== "text") continue;
      const inText = lift(block.body);
      if (!inText) continue;
      const replaced: PartChild[] = [
        ...(inText.before.length > 0 ? [{ ...block, body: inText.before }] : []),
        toChecklist(inText.items),
        ...(inText.after.length > 0 ? [plain(inText.after)] : []),
      ];
      part.blocks.splice(i, 1, ...replaced);
      return;
    }
  }

  /**
   * A part's blocks, from the tokens under its heading. Prose before its
   * first block of its own is the part's framing; prose after one is plain
   * text. A line holding only an id starts a block of its own (plain text, or
   * the table after it). A part whose title says it is the week's written
   * answer (or written piece) holds the written answer even with no
   * "Written answer" line (see `answerRange`).
   */
  partBody(
    tokens: readonly Token[],
    where: string,
    title: string,
    headingTime: string,
  ): { framing: Prose; blocks: PartChild[]; time: string; packTable: boolean } {
    const blocks: PartChild[] = [];
    const framing: Token[] = [];
    let pendingText: { id: string; heading: string; tokens: Token[] } | null = null;
    let time = headingTime;
    let packTable = false;
    let start = 0;
    /** The token a Reflect line with its prompt inline was read from, to join a second one to it. */
    let lastInlineReflect = -1;
    /** A Choose one line's id and who gives its packs out, waiting for its table. */
    let choose: { id: string; givenBy: GivenBy | null; questions: Token[] } | null = null;

    const flushText = () => {
      if (!pendingText) return;
      const body = proseOf(pendingText.tokens, this.counts, this.leftOut);
      if (body.length > 0 || pendingText.heading) {
        blocks.push({ id: pendingText.id, type: "text", role: "plain", heading: pendingText.heading, time: "", body });
      }
      pendingText = null;
    };
    const addText = (token: Token) => {
      if (choose) choose.questions.push(token);
      else if (pendingText) pendingText.tokens.push(token);
      else if (blocks.length === 0) framing.push(token);
      else pendingText = { id: "", heading: "", tokens: [token] };
    };

    // With no time on its heading, a short time line straight under it is the part's time.
    if (!time && tokens[0]?.type === "paragraph") {
      const text = lineText(paragraphRuns(tokens[0], this.counts));
      if ((isTime(text) || wordsIn(text)) && !/[.!?]$/.test(text)) {
        time = capitaliseText(text);
        start = 1;
      }
    }

    // The written answer written the guide's way, with no line of its own.
    const labelled = tokens.some(
      (token) => token.type === "paragraph" && labelOf(takeId(tokensLine((token as Tokens.Paragraph).tokens, { images: 0, refused: [] })).runs)?.label === "written answer",
    );
    const answerPart = /\bwritten (?:answer|piece)\b/i.test(title) && !labelled;
    const answer = answerPart ? answerRange(tokens, start) : null;

    for (let i = start; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (answer && i === answer.from) {
        flushText();
        const block = this.writtenAnswerFrom(tokens.slice(answer.from, answer.guidance), tokens.slice(answer.guidance, answer.to), wordsIn(title) ?? wordsIn(time), where);
        const send = tokens[answer.to];
        if (send && isSendLine(send)) block.due = whenIn((send as Tokens.Paragraph).text) ?? block.due;
        blocks.push(block);
        i = answer.to;
        continue;
      }
      if (isSendLine(token)) {
        // The site says when it is due: the line's own words set the rule.
        const due = whenIn((token as Tokens.Paragraph).text);
        const last = blocks[blocks.length - 1];
        if (due && last?.type === "writtenAnswer") last.due = due;
        continue;
      }
      const ownId = standaloneId(token);
      if (ownId) {
        flushText();
        const next = tokens[i + 1];
        if (next?.type === "table") {
          blocks.push(this.table(ownId, next as Tokens.Table));
          i += 1;
        } else {
          pendingText = { id: ownId, heading: "", tokens: [] };
        }
        continue;
      }
      if (token.type === "heading") {
        flushText();
        const { id, text } = headingParts(token as Tokens.Heading, this.counts);
        pendingText = { id, heading: text, tokens: [] };
        continue;
      }
      if (token.type === "paragraph") {
        const { id, runs } = takeId(splitLines(inlineRuns((token as Tokens.Paragraph).tokens, {}, this.counts))[0] ?? []);
        const label = labelOf(runs);
        if (!label) {
          addText(token);
          continue;
        }
        flushText();
        const following = tokens[i + 1];
        if (label.label === "reflect") {
          const { block, used } = this.reflection(id, label.rest, following);
          const last = blocks[blocks.length - 1];
          // Two Reflect lines in a row, each with its prompt inline, are one stop.
          const joins =
            block !== null &&
            used === 0 &&
            !id &&
            last?.type === "reflection" &&
            lastInlineReflect === i - 1 &&
            last.prompts.length + block.prompts.length <= L.maxReflectionPrompts;
          if (joins) last.prompts.push(...block.prompts);
          else if (block) blocks.push(block);
          lastInlineReflect = used === 0 ? i : -1;
          i += used;
        } else if (label.label === "choose one") {
          const segments = splitRuns(label.rest, " · ").map(lineText);
          choose = { id, givenBy: segments.map(givenByIn).find((given): given is GivenBy => given !== null) ?? null, questions: [] };
        } else if (label.label === "written answer") {
          const { block, used } = this.labelledAnswer(id, lineText(label.rest), tokens, i + 1, where);
          if (block) blocks.push(block);
          i += used;
        } else if (label.label === "fill in") {
          const { block, used } = this.fillIn(id, label.rest, following, where);
          if (block) blocks.push(block);
          i += used;
        } else if (label.label === "checklist") {
          if (following?.type === "list") {
            blocks.push(this.checklist(id, following as Tokens.List));
            i += 1;
          } else {
            this.problems.push(`${where}: a Checklist line needs its items listed under it.`);
          }
        } else if (label.label === "talk") {
          const { block, used } = this.talk(id, label.rest, tokens, i + 1, "");
          blocks.push(block);
          i += used;
        }
        continue;
      }
      if (token.type === "list") {
        const list = token as Tokens.List;
        const sources = choose ? null : this.sourcesFrom(list);
        if (sources) {
          flushText();
          blocks.push(...sources);
          continue;
        }
        if (!choose && list.items.length > 0 && list.items.every((item) => item.task)) {
          flushText();
          blocks.push(this.checklist("", list));
          continue;
        }
        addText(token);
        continue;
      }
      if (token.type === "table") {
        const table = token as Tokens.Table;
        const packs = this.packsFromTable(table);
        if (!packs) {
          if (choose) {
            this.problems.push(`${where}: a Choose one line needs a table of packs after it, with a Read column and a Time column.`);
            choose = null;
          }
          flushText();
          blocks.push(this.table("", table));
          continue;
        }
        // Questions to read the packs against: what the Choose one line led
        // into, or in the guide's shape the last list just before the table
        // and the lines after it.
        let questions: Token[] = choose?.questions ?? [];
        if (!choose) {
          const holder = pendingText ? pendingText.tokens : blocks.length === 0 ? framing : null;
          if (holder) {
            const listAt = holder.map((t) => t.type).lastIndexOf("list");
            if (listAt >= 0 && holder.slice(listAt + 1).every((t) => t.type === "paragraph") && holder.length - listAt <= 3) {
              questions = holder.splice(listAt);
            }
          }
        }
        const givenBy = choose?.givenBy ?? givenByFrom([...framing, ...(pendingText?.tokens ?? [])], this.counts);
        flushText();
        blocks.push({
          id: choose?.id ?? "",
          type: "chooseOne",
          form: "table",
          title: packs.title,
          givenBy,
          kind: "read",
          time: "",
          noteHeading: packs.noteHeading,
          questions: proseOf(questions, this.counts, this.leftOut),
          packs: packs.packs,
        });
        if (!choose) packTable = true;
        choose = null;
        continue;
      }
      if (token.type === "code") {
        const template = fillInFromTemplate((token as Tokens.Code).text);
        if (template) {
          flushText();
          blocks.push(template);
          continue;
        }
      }
      addText(token);
    }
    flushText();
    if (choose) this.problems.push(`${where}: a Choose one line needs a table of packs after it.`);
    if (answerPart && !answer) this.problems.push(`${where} is the week’s written answer, but its question couldn’t be found: put the question in its own paragraph.`);
    return { framing: proseOf(framing, this.counts, this.leftOut), blocks, time, packTable };
  }

  /**
   * The written answer from its tokens: the question, then the guidance.
   * With no word range, the question's last numbered list of bold headings
   * is its boxes (Technical AI Safety week 6's one-page plan); a word range
   * is counted over one box, so with one the headings stay in the question.
   * Boxes that carry ids are boxes whatever else is said, so a word range
   * beside them is kept, for the check to refuse.
   */
  writtenAnswerFrom(question: readonly Token[], guidance: readonly Token[], words: { min: number; max: number } | null, where: string): WrittenAnswerBlock {
    let boxes: AnswerBox[] = [];
    let promptTokens = [...question];
    for (let listAt = question.length - 1; listAt >= 0; listAt -= 1) {
      const token = question[listAt];
      if (token.type !== "list" || !(token as Tokens.List).ordered) continue;
      const list = token as Tokens.List;
      const labelled = list.items.map((item) => this.answerBox(item));
      const withIds = list.items.every((item) => readItem(item, { images: 0, refused: [] }).id !== "");
      if (labelled.every(Boolean) && (!words || withIds)) {
        boxes = labelled as AnswerBox[];
        promptTokens = [...question.slice(0, listAt), ...question.slice(listAt + 1)];
      }
      break;
    }
    const prompt = proseOf(promptTokens, this.counts, this.leftOut);
    if (prompt.length === 0) this.problems.push(`${where}’s written answer has no question.`);
    return {
      id: "",
      type: "writtenAnswer",
      prompt,
      boxes,
      guidance: proseOf(guidance.filter((token) => !isSendLine(token)), this.counts, this.leftOut),
      words,
      due: "dayBefore",
    };
  }

  /** "1. **What I bring:** your subject, skills, and anything you've made. {#id}" as a labelled box. */
  answerBox(item: Tokens.ListItem): AnswerBox | null {
    const { id, first, rest } = readItem(item, this.counts);
    const runs = trimStart(joinLines([first, ...rest]));
    const boldEnd = runs.findIndex((run) => !run.bold && run.text.trim() !== "");
    const labelRuns = boldEnd < 0 ? runs : runs.slice(0, boldEnd);
    if (labelRuns.length === 0 || !labelRuns.some((run) => run.bold)) return null;
    const label = lineText(labelRuns).replace(/[:.,]\s*$/, "").trim();
    const hint = boldEnd < 0 ? "" : lineText(runs.slice(boldEnd));
    return label ? { id, label, hint } : null;
  }

  /** "**Written answer** · 250 to 350 words · due by the end of the day before the session" and what follows it. */
  labelledAnswer(id: string, detail: string, tokens: readonly Token[], from: number, where: string): { block: WrittenAnswerBlock | null; used: number } {
    const words = wordsIn(detail);
    const due = whenIn(detail) ?? "dayBefore";
    let used = 0;
    while (from + used < tokens.length) {
      const token = tokens[from + used];
      if (this.isBoundary(token) || token.type === "table" || token.type === "heading") break;
      if (token.type === "list" && !(token as Tokens.List).ordered && this.sourcesFrom(token as Tokens.List)) break;
      used += 1;
    }
    const range = tokens.slice(from, from + used);
    if (range.length === 0) {
      this.problems.push(`${where}: the Written answer line needs its question in the paragraph after it.`);
      return { block: null, used: 0 };
    }
    const guidanceAt = range.findIndex((token) => token.type === "paragraph" && GUIDANCE.test((token as Tokens.Paragraph).text));
    const at = guidanceAt >= 0 ? guidanceAt : range.length;
    const block = this.writtenAnswerFrom(range.slice(0, at), range.slice(at), words, where);
    return { block: { ...block, id, due }, used };
  }

  // ---- The case study ----

  cases(id: string, heading: string, tokens: readonly Token[]): CasesBlock | null {
    const subsections = sectionsAt(tokens, 3);
    const lead = subsections[0].tokens;
    const tableAt = lead.findIndex((token) => token.type === "table");
    const before = tableAt >= 0 ? lead.slice(0, tableAt) : lead;
    const after = tableAt >= 0 ? lead.slice(tableAt + 1) : [];
    // A Talk line (the canonical shape), intro paragraphs, a "Prepare ..." paragraph and its list.
    const talkAt = before.findIndex(
      (token) => token.type === "paragraph" && labelOf(takeId(tokensLine((token as Tokens.Paragraph).tokens, this.counts)).runs)?.label === "talk",
    );
    let block: CasesBlock;
    if (talkAt >= 0) {
      const runs = takeId(tokensLine((before[talkAt] as Tokens.Paragraph).tokens, this.counts)).runs;
      const { block: talk } = this.talk(id, labelOf(runs)?.rest ?? [], before, talkAt + 1, heading);
      block = { ...talk, intro: [...proseOf(before.slice(0, talkAt), this.counts, this.leftOut), ...talk.intro] };
    } else {
      block = this.talk(id, [], before, 0, heading).block;
      // The guide's own case study names its talk in its words ("Prepare a 3-minute talk").
      block.talk =
        talkIn(runsText(block.prepare.flatMap((p) => (p.type === "p" ? p.runs : [])))) ??
        talkIn(runsText(block.intro.flatMap((p) => (p.type === "p" ? p.runs : []))));
    }
    const groups: CaseGroup[] = [];
    if (tableAt >= 0) {
      const read = this.caseTable(lead[tableAt] as Tokens.Table);
      block.groupLabel = read.groupLabel;
      block.startLabel = read.startLabel;
      groups.push(...read.groups);
    }
    // Groups written as headings over their own tables.
    for (const subsection of subsections.slice(1)) {
      const { text } = headingParts(subsection.heading as Tokens.Heading, this.counts);
      const name = /^all\s+\d+\s+cases\b/i.test(text) ? "" : text.replace(/\s*\(\d+\s+cases?\)\s*$/i, "").trim();
      for (const token of subsection.tokens) {
        if (token.type !== "table") continue;
        const read = this.caseTable(token as Tokens.Table);
        block.startLabel = read.startLabel;
        groups.push(...read.groups.map((group) => ({ ...group, name: group.name || name })));
      }
    }
    block.groups = groups.filter((group) => group.cases.length > 0);
    block.note = proseOf(after, this.counts, this.leftOut);
    if (block.groups.length === 0 && !block.talk) {
      this.problems.push(`“${heading}” has no cases and no talk: give it a table of cases, or a Talk line.`);
      return null;
    }
    return block;
  }

  /**
   * A table of cases: Case, What happened, and Start here (or Where to
   * start), perhaps after a column that groups them ("Pathway"). A content
   * note written into "What happened" is the case's own.
   */
  caseTable(table: Tokens.Table): { groupLabel: string; startLabel: string; groups: CaseGroup[] } {
    const header = table.header.map((cell) => lineText(tokensLine(cell.tokens, this.counts)));
    const caseAt = Math.max(0, header.findIndex((text) => /^case$/i.test(text.trim())));
    const whatAt = header.findIndex((text) => /what happened/i.test(text));
    const startAt = header.length - 1;
    const groupLabel = caseAt > 0 ? header[0] : "";
    const groups: CaseGroup[] = [];
    for (const cells of table.rows) {
      const lines = cells.map((cell) => tokensLine(cell.tokens, this.counts));
      const { id, runs } = takeId(lines[caseAt] ?? []);
      const title = lineText(runs);
      if (!title) continue;
      const { what, contentNote } = splitContentNote(whatAt >= 0 ? (lines[whatAt] ?? []) : []);
      const item: Case = { id, title, what, start: line(lines[startAt] ?? []), contentNote };
      const name = groupLabel ? lineText(lines[0] ?? []) : "";
      const group = groups.find((g) => g.name === name);
      if (group) group.cases.push(item);
      else groups.push({ name, packId: null, cases: [item] });
    }
    return { groupLabel, startLabel: header[startAt] || "Start here", groups };
  }

  // ---- In the session, the hands-on route ----

  inTheSession(id: string, tokens: readonly Token[]): TopBlock {
    const at = tokens.findIndex((token) => token.type === "paragraph" && /^\**before you come\b/i.test((token as Tokens.Paragraph).text.trim()));
    const body = at >= 0 ? tokens.slice(0, at) : tokens;
    const beforeYouCome = at >= 0 ? tokens.slice(at) : [];
    return { id, type: "inTheSession", body: proseOf(body, this.counts, this.leftOut), beforeYouCome: proseOf(beforeYouCome, this.counts, this.leftOut) };
  }

  handsOn(id: string, heading: string, tokens: readonly Token[]): HandsOnBlock {
    return { id, type: "handsOn", heading, body: proseOf(tokens, this.counts, this.leftOut) };
  }
}

/** "A strong answer ...", "Your answer to the question in bold is your position. ...": the guidance starts here. */
const GUIDANCE = /^(?:a strong (?:answer|memo|plan)|your answer to the question in bold)\b/i;

/**
 * Where the written answer sits in a part written the guide's way, as
 * indices into the part's tokens: the question starts at the first wholly
 * bold paragraph, or else at the first paragraph after the one that says
 * "This is the week's ..."; "A strong answer ..." starts its guidance; the
 * line that says where to send it ends it. Null when there is no question.
 */
function answerRange(tokens: readonly Token[], start: number): { from: number; guidance: number; to: number } | null {
  const counts = { images: 0, refused: [] };
  const paragraphs: number[] = [];
  for (let i = start; i < tokens.length; i += 1) if (tokens[i].type === "paragraph" && !isSendLine(tokens[i])) paragraphs.push(i);
  if (paragraphs.length === 0) return null;
  const bold = paragraphs.find((i) => allBold(paragraphRuns(tokens[i], counts)));
  let from = bold ?? paragraphs[0];
  if (bold === undefined && /^this is the week[’']s\b/i.test((tokens[paragraphs[0]] as Tokens.Paragraph).text)) {
    from = paragraphs[1] ?? -1;
  }
  if (from < 0) return null;
  const send = tokens.findIndex((token, i) => i > from && isSendLine(token));
  const to = send >= 0 ? send : tokens.length;
  const guidanceAt = tokens.findIndex((token, i) => i > from && i < to && token.type === "paragraph" && GUIDANCE.test((token as Tokens.Paragraph).text));
  return { from, guidance: guidanceAt >= 0 ? guidanceAt : to, to };
}

/** ", Ada Example, 2024. About 22 minutes; the first half is enough. A note." */
function afterTitle(after: readonly RawRun[], kind: SourceKind): Pick<SourceFields, "by" | "date" | "time" | "compute" | "note"> {
  let by = "";
  let date = "";
  let time = "";
  let compute = "";
  let rest: RawRun[] = [...after];
  // Who and when: the words up to the first full stop, when no link comes first.
  const end = sentenceEnd(rest);
  const headEnd = end < 0 ? rawText(rest).length : end;
  if (/^\s*,/.test(rawText(rest)) && !linkBefore(rest, headEnd)) {
    const [headRuns, tail] = cutAt(rest, headEnd);
    const parts = rawText(headRuns).replace(/^\s*,\s*/, "").split(/,\s+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0 && isDate(parts[parts.length - 1])) date = parts.pop() as string;
    by = parts.join(", ");
    rest = dropChars(tail, 1);
  } else if (/^\s*\./.test(rawText(rest))) {
    rest = dropChars(rest, rawText(rest).indexOf(".") + 1);
  }
  rest = trimStart(rest);
  // How long: a first sentence that starts with a time, up to a semicolon.
  const first = sentenceEnd(rest);
  const firstText = rawText(rest).slice(0, first < 0 ? undefined : first);
  if (TIME_FIRST.test(firstText.trim()) && !linkBefore(rest, firstText.length)) {
    const semicolon = firstText.indexOf(";");
    if (semicolon >= 0) {
      time = firstText.slice(0, semicolon).trim();
      rest = capitalise(dropChars(rest, semicolon + 1));
    } else {
      time = firstText.trim();
      rest = trimStart(dropChars(rest, first < 0 ? firstText.length : first + 1));
    }
  } else if (first >= 0 && sentenceEnd(dropChars(rest, first + 1)) < 0 && !rest.some((run) => run.href)) {
    // One sentence that ends ", about 10 minutes.": the time is its end.
    const tailTime = /,\s*((?:about |nearly |around )?\d[\d.,]*\s*(?:to\s*\d+\s*)?(?:minutes?|hours?))\s*\.?\s*$/i.exec(rawText(rest));
    if (tailTime) {
      time = tailTime[1].trim();
      rest = [...cutAt(rest, tailTime.index)[0], { text: "." }];
    }
  }
  // What a notebook needs to run: a sentence starting "Runs on" or "Needs".
  if (kind === "notebook") {
    const text = rawText(rest);
    const found = /(^|\.\s+)((?:Runs on|Needs)\b[^.]*)\./.exec(text);
    if (found) {
      compute = found[2].trim();
      const from = found.index + found[1].length;
      rest = [...cutAt(rest, from)[0], ...cutAt(rest, from + found[2].length + 1)[1]];
    }
  }
  return {
    by: by,
    date: date,
    time: capitaliseText(time),
    compute: compute,
    note: line(capitalise(rest)),
  };
}

/**
 * The week in some Markdown, read into blocks (ids as written, "" where
 * none), with the title from its first line and what could not be read.
 *
 * NOT YET A WEEK TO STORE OR DRAW. Ids are not settled here, so nothing that
 * points at an id is filled in: This week's `covers` are empty and a case
 * group's `packId` is null. `readPastedWeek` (`paste.ts`) is the one way in:
 * it keeps or mints the ids (`merge.ts`) and then works out what points at
 * what (`finishWeekBlocks`). Anything that wants a week's blocks from its
 * Markdown, a page's preview included, goes through it.
 */
export function readWeekMarkdown(markdown: string): ParsedWeek {
  const reader = new Reader();
  const tokens = marked.lexer(markdown, { gfm: true });
  const blocks: TopBlock[] = [];
  let title = "";
  let weekNumber: number | null = null;
  let partNumber = 0;

  const titleAt = tokens.findIndex((token) => token.type === "heading" && (token as Tokens.Heading).depth === 1);
  if (titleAt >= 0) {
    const text = lineText(takeId(tokensLine((tokens[titleAt] as Tokens.Heading).tokens, reader.counts)).runs);
    const found = /^week\s+(\d+)\s*[:.·-]\s*(.*)$/i.exec(text);
    weekNumber = found ? Number(found[1]) : null;
    title = (found ? found[2] : text).trim();
  }
  const rest = tokens.filter((_, i) => i !== titleAt);

  for (const section of sectionsAt(rest, 2)) {
    if (!section.heading) {
      // Under the title and before the first section: plain text at the top,
      // then any parts written without a section around them.
      const parts = sectionsAt(section.tokens, 3);
      const lead = parts[0].tokens;
      if (lead.length > 0) {
        const id = standaloneId(lead[0]) ?? "";
        const body = proseOf(id ? lead.slice(1) : lead, reader.counts, reader.leftOut);
        if (body.length > 0) blocks.push({ id, type: "text", role: "plain", heading: "", time: "", body });
      }
      for (const sub of parts.slice(1)) partNumber = topSubsection(reader, sub, blocks, partNumber, "section");
      continue;
    }
    if (section.heading.depth === 1) {
      reader.problems.push("The Markdown has more than one title line (a line starting “# ”): keep one, for the week.");
      continue;
    }
    const { id, text, after } = headingParts(section.heading, reader.counts);
    if (PART_HEADING.test(text)) {
      // A part written as a section: everything under it is the part's.
      partNumber += 1;
      blocks.push(reader.part(section.heading, section.tokens, partNumber));
      continue;
    }
    const kind = sectionKind(text);
    const parts = sectionsAt(section.tokens, 3);
    const lead = parts[0].tokens;
    switch (kind) {
      case "thisWeek": {
        const block = reader.thisWeek(id, lead);
        if (block) blocks.push(block);
        break;
      }
      case "why": {
        // "After this week you can:" and its list are the outcomes, after Why this week.
        const at = lead.findIndex((token) => isOutcomesLine(token, reader.counts));
        blocks.push({ id, type: "text", role: "why", heading: text, time: "", body: proseOf(at >= 0 ? lead.slice(0, at) : lead, reader.counts, reader.leftOut) });
        if (at >= 0) {
          const outcomesLine = isOutcomesLine(lead[at], reader.counts) as { id: string; text: string };
          blocks.push(reader.outcomes(outcomesLine.id, outcomesLine.text, lead.slice(at + 1)));
        }
        break;
      }
      case "outcomes":
        blocks.push(reader.outcomes(id, text, lead));
        break;
      case "contentNote":
        blocks.push(reader.contentNote(id, lead));
        break;
      case "before": {
        let time = after;
        let body = lead;
        if (!time && lead[0]?.type === "paragraph") {
          const firstText = lineText(paragraphRuns(lead[0], reader.counts));
          if (isTime(firstText) && !/[.!?]$/.test(firstText)) {
            time = capitaliseText(firstText);
            body = lead.slice(1);
          }
        }
        blocks.push({ id, type: "text", role: "before", heading: text, time, body: proseOf(body, reader.counts, reader.leftOut) });
        break;
      }
      case "inTheSession":
        blocks.push(reader.inTheSession(id, lead));
        break;
      case "goFurther":
        blocks.push(reader.goFurther(id, text, lead));
        break;
      case "handsOn":
        // Everything under it, sub-headings included, is the route's.
        blocks.push(reader.handsOn(id, lineText(takeId(tokensLine(section.heading.tokens, reader.counts)).runs), section.tokens));
        continue;
      case "cases": {
        // Its own sub-headings are its groups of cases.
        const block = reader.cases(id, text, section.tokens);
        if (block) blocks.push(block);
        continue;
      }
      case "section":
        blocks.push({ id, type: "text", role: "section", heading: text, time: "", body: proseOf(lead, reader.counts, reader.leftOut) });
        break;
    }
    for (const sub of parts.slice(1)) partNumber = topSubsection(reader, sub, blocks, partNumber, kind);
  }

  const refused = [...new Set(reader.counts.refused)];
  if (refused.length > 0) {
    reader.leftOut.push(
      `${refused.length === 1 ? "A link was" : `${refused.length} links were`} left as words: a link has to start with https:// (or mailto: for an address). ${refused.join(", ")}`,
    );
  }
  if (reader.counts.images > 0) {
    reader.leftOut.push(
      reader.counts.images === 1
        ? "1 picture was left out: the week page shows no pictures."
        : `${reader.counts.images} pictures were left out: the week page shows no pictures.`,
    );
  }
  if (blocks.length === 0) reader.problems.push("Nothing in this Markdown reads as a week: paste the week’s Markdown, starting with its title line.");

  return {
    title,
    weekNumber,
    blocks,
    problems: [...new Set(reader.problems)],
    leftOut: [...new Set(reader.leftOut)],
    packTables: reader.packTables,
    dayBeforeSaid: dayBeforeTimeIn(markdown),
  };
}

/** A sub-heading at the top of a section: the outcomes, a part, or a section of its own. */
function topSubsection(reader: Reader, sub: Section, blocks: TopBlock[], partNumber: number, within: SectionKind): number {
  const heading = sub.heading as Tokens.Heading;
  const { id, text } = headingParts(heading, reader.counts);
  if (sectionKind(text) === "outcomes") {
    blocks.push(reader.outcomes(id, text, sub.tokens));
    return partNumber;
  }
  if (within === "before" || PART_HEADING.test(text)) {
    const number = partNumber + 1;
    blocks.push(reader.part(heading, sub.tokens, number));
    return number;
  }
  blocks.push({ id, type: "text", role: "section", heading: text, time: "", body: proseOf(sub.tokens, reader.counts, reader.leftOut) });
  return partNumber;
}

// ---------------------------------------------------------------------------
// The same reader of text, for a document that is not a week
// ---------------------------------------------------------------------------

/**
 * What reading some text left out: links kept as words (not https or mailto),
 * pictures, and pieces of HTML. A caller says each, so nothing goes missing
 * without a word.
 */
export type TextLeftOut = { refused: string[]; images: number; leftOut: string[] };

/** An empty record of what reading left out, to hand to the readers below. */
export function noneLeftOut(): TextLeftOut {
  return { refused: [], images: 0, leftOut: [] };
}

/**
 * Some top-level Markdown tokens as prose, read exactly as a week's text is:
 * paragraphs, lists, tables and code, a quote's words kept, a heading kept as
 * a bold line. For a document that is not a week (a course's facilitator
 * guide, `src/lib/courses/facilitatorGuide/`), so one reader decides what a
 * line of text is, wherever it is written.
 */
export function readProseTokens(tokens: readonly Token[], seen: TextLeftOut): Prose {
  const counts: InlineCounts = { images: 0, refused: [] };
  const prose = proseOf(tokens, counts, seen.leftOut);
  seen.images += counts.images;
  seen.refused.push(...counts.refused);
  return prose;
}

/**
 * Inline tokens (a heading's, a list item's text) as one canonical line, its
 * words exactly as a week's are read. Line breaks become spaces.
 */
export function readInlineRuns(tokens: readonly Token[] | undefined, seen: TextLeftOut): Run[] {
  const counts: InlineCounts = { images: 0, refused: [] };
  const runs = line(tokensLine(tokens, counts));
  seen.images += counts.images;
  seen.refused.push(...counts.refused);
  return runs;
}
