import { marked, type Tokens } from "marked";
import { noneLeftOut, readInlineRuns, readProseTokens, type TextLeftOut } from "@/lib/courses/weekBlocks/markdownRead";
import { escapeMarkdownText, proseToMarkdown, runsToMarkdown } from "@/lib/courses/weekBlocks/markdownWrite";
import { canonicalRuns, runsText, type Prose, type ProseItem, type Run } from "@/lib/courses/weekBlocks/prose";
import {
  COURSE_DOCUMENT_LABEL,
  GUIDE_LIMITS,
  NOTHING_UNDER_TITLE,
  guideDocumentProblems,
  sanitizeGuideBlocks,
  slotLabel,
  type CourseDocumentKey,
  type GuideBlock,
  type GuideCheckItem,
  type GuideDocument,
  type GuideSlot,
} from "./model";
import { facilitatorOnlyHeading, readDocumentTitle } from "./recognise";

/**
 * A FACILITATOR DOCUMENT'S MARKDOWN, READ AND WRITTEN. The contract is
 * `docs/course-facilitator-guide.md`: one tab of the course docs, exported as
 * it is (a title line, a byline under it, then sections), pasted into one
 * place in the course's facilitator guide.
 *
 * READING keeps every word: the text inside blocks is read by the week
 * loader's own reader (`readProseTokens`, `readInlineRuns`), headings stay
 * headings, quotes stay quotes, and "- [ ]" lines stay boxes to tick on
 * paper. Two things are left out, and each is said: the byline under the
 * title (the export's date and names, which are not page content), and what a
 * page never draws (pictures, HTML, links that are not https or mailto).
 * What the page could not draw where it is written (a block of code inside a
 * list) stops the save with a sentence, rather than going missing.
 *
 * WRITING ("Copy as Markdown") gives the document back so that, pasted again,
 * it reads as the same document: `readGuideMarkdown(guideToMarkdown(doc))`
 * gives back `doc`. Two lists that meet change their marker so they stay two
 * lists, and every character Markdown would read as markup is escaped.
 *
 * Pure.
 */

/** One row of "What we found", as the week loader draws its own. */
export type GuideFoundRow = {
  state: "found" | "missing" | "check";
  label: string;
  detail: string;
  indent: boolean;
};

export type ReadGuide = {
  /** What would be stored: the title and the blocks, canonical. */
  doc: GuideDocument;
  /** The byline left out, as it was written, or null when there was none. */
  byline: string | null;
  found: GuideFoundRow[];
  /** Worth a look, never a reason to refuse. */
  checks: string[];
  /** What stops the document being saved. Empty when it can be. */
  problems: string[];
};

// ---------------------------------------------------------------------------
// The byline
// ---------------------------------------------------------------------------

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
/** A date chip as the export writes one: "Oct 25, 2026", or "25 Oct 2026". */
const DATE_CHIP = `(?:${MONTH} \\d{1,2},? \\d{4}|\\d{1,2} ${MONTH} \\d{4})`;
/** A mention as the export writes one: "@zachary levin". */
const MENTION = "@[^\\s·@][^·@]*?";
/** A line of nothing but date chips and mentions, with " · " between. */
const BYLINE = new RegExp(`^(?:${DATE_CHIP}|${MENTION})(?:\\s*·\\s*(?:${DATE_CHIP}|${MENTION}))*$`, "i");

/** Is this line a byline: dates and names only, nothing a reader needs? */
export function isByline(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 0 && line.length <= 200 && BYLINE.test(line);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a list holds that a line of a list cannot: a block of code, a table, a quote, a heading. */
function blockInsideList(list: Tokens.List): string | null {
  for (const item of list.items) {
    for (const token of item.tokens) {
      if (token.type === "code") return "a block of code";
      if (token.type === "table") return "a table";
      if (token.type === "blockquote") return "a quote";
      if (token.type === "heading") return "a heading";
      if (token.type === "list") {
        const inner = blockInsideList(token as Tokens.List);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/** A line of a list: its paragraphs as one line, as the week reader reads a line. */
function itemRuns(item: Tokens.ListItem, seen: TextLeftOut): Run[] {
  const parts = item.tokens
    .filter((token) => token.type === "text" || token.type === "paragraph")
    .map((token) => readInlineRuns((token as Tokens.Text).tokens, seen))
    .filter((runs) => runs.length > 0);
  return canonicalRuns(
    parts.flatMap((runs, i) => (i > 0 ? [{ text: " " }, ...runs] : runs)),
    Number.MAX_SAFE_INTEGER,
  );
}

/** The words of a heading, as one line. */
function headingWords(token: Tokens.Heading, seen: TextLeftOut): Run[] {
  return readInlineRuns(token.tokens, seen);
}

/** What the words under a heading hold: "2 paragraphs, 1 list, 1 table". */
function contents(blocks: readonly GuideBlock[]): string {
  const count = (test: (block: GuideBlock) => boolean) => blocks.filter(test).length;
  const parts: string[] = [];
  const paragraphs = count((b) => b.type === "p");
  const lists = count((b) => b.type === "ul" || b.type === "ol");
  const boxes = count((b) => b.type === "checklist");
  const tables = count((b) => b.type === "table");
  const code = count((b) => b.type === "code");
  const quotes = count((b) => b.type === "quote");
  const headings = count((b) => b.type === "heading");
  if (paragraphs > 0) parts.push(plural(paragraphs, "paragraph"));
  if (lists > 0) parts.push(plural(lists, "list"));
  if (boxes > 0) parts.push(plural(boxes, "list of boxes to tick", "lists of boxes to tick"));
  if (tables > 0) parts.push(plural(tables, "table"));
  if (code > 0) parts.push(plural(code, "block shown as written", "blocks shown as written"));
  if (quotes > 0) parts.push(plural(quotes, "quote"));
  if (headings > 0) parts.push(plural(headings, "sub-heading"));
  return parts.length > 0 ? parts.join(", ") : "Nothing under it";
}

/** The rows of "What we found": the title, the byline, then each section in order. */
function foundRows(doc: GuideDocument, byline: string | null): GuideFoundRow[] {
  const rows: GuideFoundRow[] = [];
  rows.push(doc.title ? { state: "found", label: "Title", detail: doc.title, indent: false } : { state: "missing", label: "Title", detail: "Not in the Markdown", indent: false });
  if (byline) rows.push({ state: "check", label: "Byline", detail: `Left out: ${byline}`, indent: false });
  let label: string | null = null;
  let under: GuideBlock[] = [];
  const close = () => {
    if (label === null && under.length === 0) return;
    rows.push({ state: "found", label: label ?? "Before the first heading", detail: contents(under), indent: label !== null });
  };
  for (const block of doc.blocks) {
    if (block.type === "heading" && block.level === 2) {
      close();
      label = runsText(block.runs);
      under = [];
    } else under.push(block);
  }
  close();
  return rows;
}

/** What a slot expects its title to say, held against what the title says. Problems first, then checks. */
function titleAgainstSlot(title: string, slot: GuideSlot, problems: string[], checks: string[]): void {
  if (!title) return;
  const read = readDocumentTitle(title);
  if (read.kind === "week") {
    problems.push(`This is week ${read.weekNumber} of the fellow guide, which goes in the run’s week, not in the facilitator guide.`);
    return;
  }
  const loading = slotLabel(slot);
  if (read.kind === "plan" || read.kind === "notes") {
    const named = read.kind === "plan" ? `session ${read.weekNumber}’s plan` : `week ${read.weekNumber}’s notes`;
    const belongs = slotLabel({ kind: "week", weekNumber: read.weekNumber, part: read.kind });
    if (slot.kind === "week" && slot.part === read.kind && slot.weekNumber === read.weekNumber) return;
    problems.push(`This is ${named}, and you’re loading ${loading}. Load it as ${belongs}, or change the title line.`);
    return;
  }
  if (slot.kind === "course") {
    if (!COURSE_TITLE_WORDS[slot.key].test(title)) checks.push(`Check this is ${loading}: its title doesn’t say so.`);
    return;
  }
  if (read.kind === "course") {
    problems.push(`“${title}” is one of the course’s own documents, and you’re loading ${loading}. Load it in its own place, or change the title line.`);
    return;
  }
  checks.push(
    slot.part === "plan"
      ? `The title doesn’t say which session this is (“Session ${slot.weekNumber}: …”): check it is ${loading}.`
      : `The title doesn’t say which week’s notes these are (“Week ${slot.weekNumber} notes: …”): check they are ${loading}.`,
  );
}

/** Words a course document's title carries in the course docs' export. */
const COURSE_TITLE_WORDS: Record<CourseDocumentKey, RegExp> = {
  "how-to-use": /\bsession plans\b|\bhow to use\b/i,
  handbook: /\bfacilitator guide\b|\bhandbook\b/i,
  "case-studies": /\bcase stud/i,
  printables: /\bprintables?\b/i,
  sessions: /\bsessions\b/i,
  "week-notes": /\bweek notes\b/i,
};

/**
 * The Markdown of one document, read for one place in the guide: the
 * document to store, the byline it left out, what was found, the things to
 * check and what stops a save.
 */
export function readGuideMarkdown(markdown: string, slot: GuideSlot): ReadGuide {
  const seen = noneLeftOut();
  const problems: string[] = [];
  const checks: string[] = [];
  const tokens = marked.lexer(markdown.replace(/\r\n?/g, "\n"), { gfm: true }).filter((token) => token.type !== "space");

  const titleAt = tokens.findIndex((token) => token.type === "heading" && (token as Tokens.Heading).depth === 1);
  let title = "";
  if (titleAt >= 0) {
    title = runsText(headingWords(tokens[titleAt] as Tokens.Heading, seen));
    if (titleAt > 0) problems.push("Something comes before the title line: start the Markdown with the line beginning “# ”.");
  }

  let rest = tokens.slice(titleAt + 1);
  let byline: string | null = null;
  const first = rest[0];
  if (first?.type === "paragraph") {
    const words = runsText(readInlineRuns((first as Tokens.Paragraph).tokens, noneLeftOut()));
    if (isByline(words)) {
      byline = words;
      rest = rest.slice(1);
    }
  }

  const blocks: GuideBlock[] = [];
  let heading: string | null = null;
  const where = () => (heading ? `Under “${heading}”` : "Before the first heading");
  let rules = 0;
  for (const token of rest) {
    switch (token.type) {
      case "heading": {
        const h = token as Tokens.Heading;
        const runs = headingWords(h, seen);
        if (h.depth === 1) {
          problems.push(`“${runsText(runs)}” is a second title line: paste one document at a time.`);
          break;
        }
        if (runs.length === 0) break;
        blocks.push({ type: "heading", level: Math.min(6, Math.max(2, h.depth)) as 2 | 3 | 4 | 5 | 6, runs });
        if (h.depth === 2) heading = runsText(runs);
        break;
      }
      case "blockquote": {
        const body = readProseTokens((token as Tokens.Blockquote).tokens, seen);
        if (body.length > 0) blocks.push({ type: "quote", body });
        break;
      }
      case "list": {
        const list = token as Tokens.List;
        const inside = blockInsideList(list);
        if (inside) {
          problems.push(`${where()}, a list holds ${inside} inside one of its lines, which the page can’t draw there: move it out of the list.`);
          break;
        }
        const tasks = list.items.filter((item) => item.task).length;
        if (tasks > 0 && tasks === list.items.length && !list.ordered) {
          if (list.items.some((item) => item.tokens.some((t) => t.type === "list"))) {
            problems.push(`${where()}, a box to tick has a list inside it, which the page can’t draw: make each line its own box.`);
            break;
          }
          const items: GuideCheckItem[] = [];
          for (const item of list.items) {
            const runs = itemRuns(item, seen);
            if (runs.length > 0) items.push(item.checked ? { runs, checked: true } : { runs });
          }
          if (items.length > 0) blocks.push({ type: "checklist", items });
          break;
        }
        if (tasks > 0) checks.push(`${where()}, a list mixes boxes to tick with plain lines: it is read as a plain list, without its boxes.`);
        blocks.push(...readProseTokens([token], seen));
        break;
      }
      case "hr":
        rules += 1;
        break;
      case "def":
        // A link's address written apart from it ("[1]: https://..."): the
        // link it serves has already been read where it is used.
        break;
      default:
        blocks.push(...readProseTokens([token], seen));
    }
  }

  const doc: GuideDocument = { title, blocks };
  titleAgainstSlot(title, slot, problems, checks);
  const marker = slot.kind === "course" ? facilitatorOnlyHeading(blocks.filter((b) => b.type === "heading").map((b) => runsText(b.runs))) : null;
  if (marker && slot.kind === "course" && slot.key !== "printables") {
    checks.push(`“${marker}” is a heading a session plan or a week’s notes has: check this is ${COURSE_DOCUMENT_LABEL[slot.key]}.`);
  }
  // Nothing under the title is said only when nothing was there to read:
  // a part that could not be read has said why already.
  const readProblems = problems.length;
  problems.push(...guideDocumentProblems(doc).filter((sentence) => !(sentence === NOTHING_UNDER_TITLE && readProblems > 0)));
  if (markdown.length > GUIDE_LIMITS.maxPasteChars) {
    problems.unshift(`That is ${markdown.length} characters; a document’s Markdown can be at most ${GUIDE_LIMITS.maxPasteChars}.`);
  }

  if (byline) checks.unshift(`The byline under the title was left out (“${byline}”): bylines aren’t page content.`);
  const refused = [...new Set(seen.refused)];
  if (refused.length > 0) {
    checks.push(`${refused.length === 1 ? "A link was" : `${refused.length} links were`} left as words: a link has to start with https:// (or mailto: for an address). ${refused.join(", ")}`);
  }
  if (seen.images > 0) checks.push(`${plural(seen.images, "picture was", "pictures were")} left out: the page shows no pictures.`);
  if (rules > 0) checks.push(`${plural(rules, "line across the page was", "lines across the page were")} left out: the page divides by its headings.`);
  checks.push(...new Set(seen.leftOut));

  const stored = problems.length === 0 ? { title, blocks: sanitizeGuideBlocks(blocks) } : doc;
  return { doc: stored, byline, found: foundRows(stored, byline), checks: [...new Set(checks)], problems: [...new Set(problems)] };
}

// ---------------------------------------------------------------------------
// Writing ("Copy as Markdown")
// ---------------------------------------------------------------------------

/** How the list before was written, so a list that follows it changes marker and stays its own list. */
type ListMark = "-" | "*" | "." | ")" | null;

function nextMark(kind: "ul" | "ol", before: ListMark): Exclude<ListMark, null> {
  if (kind === "ul") return before === "-" ? "*" : "-";
  return before === "." ? ")" : ".";
}

/** A heading's line ("## Run sheet"): its words escaped, and a "#" at its end kept as a word, not read as the heading's own closing. */
function atxLine(level: number, words: string): string {
  return `${"#".repeat(level)} ${words.replace(/(\s)(#+)$/, "$1\\$2")}`;
}

function listLines(items: readonly ProseItem[], mark: Exclude<ListMark, null>, ordered: boolean): string {
  return items.map((item, i) => `${ordered ? `${i + 1}${mark}` : mark} ${runsToMarkdown(item.runs)}`).join("\n");
}

function quoteLines(body: Prose): string {
  return proseToMarkdown(body)
    .join("\n\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/** A document as Markdown: its title line, then each block, a blank line between. */
export function guideToMarkdown(doc: GuideDocument): string {
  const out: string[] = [atxLine(1, escapeMarkdownText(doc.title).replace(/^(#+)/, "\\$1"))];
  let before: ListMark = null;
  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        out.push(atxLine(block.level, runsToMarkdown(block.runs)));
        before = null;
        break;
      case "quote":
        out.push(quoteLines(block.body));
        before = null;
        break;
      case "checklist": {
        const mark = nextMark("ul", before) as "-" | "*";
        out.push(block.items.map((item) => `${mark} [${item.checked ? "x" : " "}] ${runsToMarkdown(item.runs)}`).join("\n"));
        before = mark;
        break;
      }
      case "ul":
      case "ol": {
        const mark = nextMark(block.type, before);
        out.push(listLines(block.items, mark, block.type === "ol"));
        before = mark;
        break;
      }
      default:
        out.push(...proseToMarkdown([block]));
        before = null;
    }
  }
  return `${out.join("\n\n")}\n`;
}
