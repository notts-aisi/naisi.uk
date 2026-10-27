import { WEEK_BLOCK_LIMITS as W } from "@/lib/courses/weekBlocks/limits";
import {
  proseChars,
  runsText,
  sanitizeProse,
  sanitizeRuns,
  type Prose,
  type ProseItem,
  type ProseParagraph,
  type Run,
} from "@/lib/courses/weekBlocks/prose";

/**
 * A COURSE'S FACILITATOR GUIDE, AS DATA: its places (`GuideSlot`), the pages
 * people open (`GuidePage`), and the shape of one document in it
 * (`GuideDocument`).
 *
 * What it holds is the course docs' facilitator material, exported as
 * Markdown, one document a tab: for each week the session's plan and the
 * week's notes (with their answer keys); for the whole course How to use
 * these plans, the Handbook, Case studies and feedback, and Printables; and
 * the two tabs over every week, Sessions and Week notes. The contract for
 * that Markdown is `docs/course-facilitator-guide.md`.
 *
 * NONE OF IT EVER REACHES SOMEBODY TAKING PART. It is stored on the server
 * only (`src/lib/firestore/courseFacilitatorGuide.ts`), read only behind the
 * one gate (`src/lib/courses/facilitatorGuide/access.ts`), and never written
 * into a week: anyone signed in can read a week's document.
 * `tests/course-facilitator-guide-guard.test.mjs` walks the tree for both.
 *
 * TEXT IS DATA, NEVER MARKUP. A document is a list of blocks: headings,
 * quotes, lists of things to tick on paper, and the week blocks' own prose
 * (paragraphs, lists, tables and code, `src/lib/courses/weekBlocks/prose.ts`),
 * read and drawn by the same code a week's text is, so the two never disagree
 * about a line and nothing is ever handed to the page as HTML.
 *
 * Pure, with no server import, so the paste card and the pages in the
 * browser can read the slots, the labels and the caps.
 */

// ---------------------------------------------------------------------------
// Where a document goes
// ---------------------------------------------------------------------------

/**
 * The course's own documents, in the order the loader offers them and a
 * course page lists them: the four under "For the whole course", then the two
 * about every week at once (`WEEKS_AT_A_GLANCE`), which the course page shows
 * at the top of "Each week" instead.
 */
export const COURSE_DOCUMENT_KEYS = ["how-to-use", "handbook", "case-studies", "printables", "sessions", "week-notes"] as const;
export type CourseDocumentKey = (typeof COURSE_DOCUMENT_KEYS)[number];

export const COURSE_DOCUMENT_LABEL: Record<CourseDocumentKey, string> = {
  "how-to-use": "How to use these plans",
  handbook: "Handbook",
  "case-studies": "Case studies and feedback",
  printables: "Printables",
  sessions: "Sessions",
  "week-notes": "Week notes",
};

/**
 * THE TWO DOCUMENTS ABOUT EVERY WEEK AT ONCE: the course docs' two parent
 * tabs, "Sessions" over every session's plan and "Week notes" over every
 * week's notes, where a course keeps what it sums up of all its weeks (an
 * "At a glance" table: each session's opener, activities and what to print;
 * each week's one idea and the hardest question). Course documents like the
 * other four, loaded, stored, gated and read exactly as they are; only the
 * course page places them, at the top of "Each week".
 */
export const WEEKS_AT_A_GLANCE: readonly CourseDocumentKey[] = ["sessions", "week-notes"];

/** Is this one of the two documents about every week at once? */
export function isWeeksAtAGlance(key: CourseDocumentKey): boolean {
  return WEEKS_AT_A_GLANCE.includes(key);
}

/** The two documents of a week, in the order its page shows them. */
export const WEEK_PARTS = ["plan", "notes"] as const;
export type WeekPart = (typeof WEEK_PARTS)[number];

export const WEEK_PART_LABEL: Record<WeekPart, string> = {
  plan: "Session plan",
  notes: "Week notes",
};

/** The last week a course can have, as a run's week plan allows ("w01" to "w60"). */
export const MAX_GUIDE_WEEK = 60;

/** One place in a course's facilitator guide: a course document, or one of a week's two. */
export type GuideSlot =
  | { kind: "course"; key: CourseDocumentKey }
  | { kind: "week"; weekNumber: number; part: WeekPart };

function isGuideWeek(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_GUIDE_WEEK;
}

/** A slot's key, as its document id and the loader's address end with it: "handbook", "w03-plan". */
export function slotKey(slot: GuideSlot): string {
  if (slot.kind === "course") return slot.key;
  return `w${String(slot.weekNumber).padStart(2, "0")}-${slot.part}`;
}

/** A slot from its key, or null for anything that is not exactly one. */
export function parseSlotKey(raw: unknown): GuideSlot | null {
  if (typeof raw !== "string") return null;
  if ((COURSE_DOCUMENT_KEYS as readonly string[]).includes(raw)) return { kind: "course", key: raw as CourseDocumentKey };
  const found = /^w(\d\d)-(plan|notes)$/.exec(raw);
  if (!found) return null;
  const weekNumber = Number(found[1]);
  return isGuideWeek(weekNumber) ? { kind: "week", weekNumber, part: found[2] as WeekPart } : null;
}

/** "Handbook", "Week 3 session plan", "Week 3 notes". */
export function slotLabel(slot: GuideSlot): string {
  if (slot.kind === "course") return COURSE_DOCUMENT_LABEL[slot.key];
  return slot.part === "plan" ? `Week ${slot.weekNumber} session plan` : `Week ${slot.weekNumber} notes`;
}

/** Every slot of a course with `weeks` weeks: the course's documents, then each week's two. */
export function guideSlots(weeks: number): GuideSlot[] {
  const out: GuideSlot[] = COURSE_DOCUMENT_KEYS.map((key) => ({ kind: "course", key }));
  for (let n = 1; n <= Math.min(Math.max(0, Math.floor(weeks)), MAX_GUIDE_WEEK); n += 1) {
    for (const part of WEEK_PARTS) out.push({ kind: "week", weekNumber: n, part });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The pages people open
// ---------------------------------------------------------------------------

/** A page of a course's facilitator guide: one course document, or one week (its plan and its notes). */
export type GuidePage = { kind: "course"; key: CourseDocumentKey } | { kind: "week"; weekNumber: number };

/** The page's last address segment: "handbook", "week-3". */
export function guidePageSlug(page: GuidePage): string {
  return page.kind === "course" ? page.key : `week-${page.weekNumber}`;
}

/** A page from its address segment, or null. "week-3" only, never "week-03". */
export function parseGuidePage(raw: unknown): GuidePage | null {
  if (typeof raw !== "string") return null;
  if ((COURSE_DOCUMENT_KEYS as readonly string[]).includes(raw)) return { kind: "course", key: raw as CourseDocumentKey };
  const found = /^week-([1-9]\d?)$/.exec(raw);
  if (!found) return null;
  const weekNumber = Number(found[1]);
  return isGuideWeek(weekNumber) ? { kind: "week", weekNumber } : null;
}

/** The slots a page shows, in its order. */
export function slotsOfPage(page: GuidePage): GuideSlot[] {
  if (page.kind === "course") return [{ kind: "course", key: page.key }];
  return WEEK_PARTS.map((part) => ({ kind: "week", weekNumber: page.weekNumber, part }));
}

/**
 * Where a course's facilitator guide is read: its course page, or one page of
 * it. The one place the address is written, for the pages, the links to them
 * and the tests.
 */
export function facilitatorGuidePath(courseId: string, page?: GuidePage): string {
  const base = `/learn/facilitator-guide/${encodeURIComponent(courseId)}`;
  return page ? `${base}/${guidePageSlug(page)}` : base;
}

/** Where an admin loads a course's facilitator guide. */
export function facilitatorGuideAdminPath(courseId: string): string {
  return `/admin/courses/${encodeURIComponent(courseId)}/facilitator-guide`;
}

// ---------------------------------------------------------------------------
// A document
// ---------------------------------------------------------------------------

/** A heading inside a document: "##" is 2, "###" is 3. The document's own title is not a block. */
export type GuideHeading = { type: "heading"; level: 2 | 3 | 4 | 5 | 6; runs: Run[] };

/** A quoted passage (a week's notes quote an example strong answer). */
export type GuideQuote = { type: "quote"; body: Prose };

/** One line of a list of things to tick on paper: what to bring, what to do before the first session. */
export type GuideCheckItem = ProseItem & { checked?: true };

/** A list of things to tick on paper ("- [ ]" lines). Drawn as boxes; nothing is ticked on the site. */
export type GuideChecklist = { type: "checklist"; items: GuideCheckItem[] };

export type GuideBlock = GuideHeading | GuideQuote | GuideChecklist | ProseParagraph;

export type GuideDocument = {
  /** The words of its title line ("Session 3: What could go wrong"). */
  title: string;
  blocks: GuideBlock[];
};

/**
 * The caps on one document. Each is a ceiling the real material stays well
 * inside (the longest, a course's Printables, is about 30,000 characters in
 * about 200 blocks); the lines, lists, tables and code inside a block keep the
 * week blocks' own caps (`WEEK_BLOCK_LIMITS`), because they are read and drawn
 * by the same code.
 */
export const GUIDE_LIMITS = {
  title: 200,
  heading: 300,
  maxBlocks: 800,
  /** All the text of one document, in characters. */
  documentChars: 150_000,
  /** The stored blocks as JSON, so a document stays far under Firestore's 1 MiB. */
  maxStoredChars: 500_000,
  /** The longest paste the loader reads, in characters. */
  maxPasteChars: 250_000,
} as const;

const HEADING_LEVELS = [2, 3, 4, 5, 6] as const;

/** A block's text, as `proseChars` counts it. */
function blockChars(block: GuideBlock): number {
  switch (block.type) {
    case "heading":
      return runsText(block.runs).length;
    case "quote":
      return proseChars(block.body);
    case "checklist":
      return block.items.reduce((n, item) => n + runsText(item.runs).length, 0);
    default:
      return proseChars([block]);
  }
}

/** How many characters of text a document holds, its title with them. */
export function guideDocumentChars(doc: GuideDocument): number {
  return doc.title.length + doc.blocks.reduce((n, block) => n + blockChars(block), 0);
}

/**
 * Stored blocks, read: each block's shape checked, its text made canonical,
 * the whole cut to the caps. A document that reached the store some other way
 * still draws inside them. What the loader saves is held to the same caps
 * first (`guideDocumentProblems`), so a saved document reads back unchanged.
 */
export function sanitizeGuideBlocks(raw: unknown): GuideBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: GuideBlock[] = [];
  let left = GUIDE_LIMITS.documentChars;
  for (const value of raw.slice(0, GUIDE_LIMITS.maxBlocks)) {
    if (left <= 0) break;
    if (!value || typeof value !== "object") continue;
    const b = value as Record<string, unknown>;
    let block: GuideBlock | null = null;
    if (b.type === "heading") {
      const level = HEADING_LEVELS.find((n) => n === b.level);
      const runs = sanitizeRuns(b.runs, GUIDE_LIMITS.heading);
      if (level && runs.length > 0) block = { type: "heading", level, runs };
    } else if (b.type === "quote") {
      const body = sanitizeProse(b.body, left);
      if (body.length > 0) block = { type: "quote", body };
    } else if (b.type === "checklist") {
      const items: GuideCheckItem[] = [];
      for (const item of (Array.isArray(b.items) ? b.items : []).slice(0, W.maxProseListItems)) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        const runs = sanitizeRuns(raw.runs, W.inlineChars);
        if (runs.length === 0) continue;
        items.push(raw.checked === true ? { runs, checked: true } : { runs });
      }
      if (items.length > 0) block = { type: "checklist", items };
    } else {
      const [paragraph] = sanitizeProse([value], left);
      if (paragraph) block = paragraph;
    }
    if (!block) continue;
    left -= blockChars(block);
    out.push(block);
  }
  return out;
}

/** The title line as stored: one line, cut to its cap. */
export function sanitizeGuideTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, GUIDE_LIMITS.title).trim() : "";
}

function tooLong(where: string, what: string, length: number, max: number, out: string[]): void {
  if (length > max) out.push(`${where}: ${what} is ${length} characters; the most is ${max}.`);
}

function tooMany(where: string, what: string, count: number, max: number, out: string[]): void {
  if (count > max) out.push(`${where} has ${count} ${what}; the most is ${max}.`);
}

function lineProblems(where: string, what: string, runs: readonly Run[], max: number, out: string[]): void {
  tooLong(where, what, runsText(runs).length, max, out);
  if (runs.length > W.maxRuns) out.push(`${where}: ${what} has too many changes of style.`);
}

function proseProblems(where: string, prose: Prose, out: string[]): void {
  for (const p of prose) {
    if (p.type === "p") lineProblems(where, "a paragraph", p.runs, GUIDE_LIMITS.documentChars, out);
    if (p.type === "ul" || p.type === "ol") {
      tooMany(where, "items in a list", p.items.length, W.maxProseListItems, out);
      for (const item of p.items) lineProblems(where, "a line of a list", item.runs, GUIDE_LIMITS.documentChars, out);
    }
    if (p.type === "table") {
      tooMany(where, "columns in a table", p.header.length, W.maxProseTableColumns, out);
      tooMany(where, "rows in a table", p.rows.length, W.maxProseTableRows, out);
      for (const cell of [...p.header, ...p.rows.flatMap((row) => row.cells)]) {
        lineProblems(where, "a cell of a table", cell.runs, W.inlineChars, out);
      }
    }
    if (p.type === "code") {
      tooLong(where, "a block of code", p.text.length, W.codeChars, out);
      if (!/^[A-Za-z0-9+#.-]*$/.test(p.lang) || p.lang.length > W.codeLang) {
        out.push(`${where}: the word after a block of code’s opening backticks names its language, in at most ${W.codeLang} letters and digits.`);
      }
    }
  }
}

/** "Under “Run sheet”", or "Before the first heading". */
function whereIs(heading: string | null): string {
  return heading ? `Under “${heading}”` : "Before the first heading";
}

/** The sentence for a document with nothing under its title line. */
export const NOTHING_UNDER_TITLE = "The document has nothing under its title.";

/**
 * What stops a document being saved, each in a sentence that says what to
 * change: no title, a field over its cap, too many blocks. Nothing is ever cut
 * short in silence: a document with none of these reads back exactly as it
 * is saved, which the last check holds whatever the others miss.
 */
export function guideDocumentProblems(doc: GuideDocument): string[] {
  const out: string[] = [];
  if (!doc.title) out.push("The document has no title line: it starts with a line beginning “# ”, its title.");
  tooLong("The title", "it", doc.title.length, GUIDE_LIMITS.title, out);
  if (doc.blocks.length === 0) out.push(NOTHING_UNDER_TITLE);
  tooMany("The document", "headings, paragraphs, lists, tables, quotes and blocks of code", doc.blocks.length, GUIDE_LIMITS.maxBlocks, out);
  let heading: string | null = null;
  for (const block of doc.blocks) {
    const where = whereIs(heading);
    if (block.type === "heading") {
      lineProblems(`The heading “${runsText(block.runs).slice(0, 60)}”`, "it", block.runs, GUIDE_LIMITS.heading, out);
      heading = runsText(block.runs);
    } else if (block.type === "quote") {
      tooMany(`${where}, a quote`, "paragraphs, lists, tables and code blocks", block.body.length, W.maxProseParagraphs, out);
      proseProblems(`${where}, a quote`, block.body, out);
    } else if (block.type === "checklist") {
      tooMany(where, "lines in a list of boxes to tick", block.items.length, W.maxProseListItems, out);
      for (const item of block.items) lineProblems(where, "a line with a box to tick", item.runs, W.inlineChars, out);
    } else {
      proseProblems(where, [block], out);
    }
  }
  const chars = guideDocumentChars(doc);
  if (chars > GUIDE_LIMITS.documentChars) out.push(`The document is ${chars} characters; the most is ${GUIDE_LIMITS.documentChars}.`);
  const stored = JSON.stringify(doc.blocks).length;
  if (stored > GUIDE_LIMITS.maxStoredChars) out.push(`The document is too big to store (${stored} characters as stored; the most is ${GUIDE_LIMITS.maxStoredChars}).`);
  if (out.length === 0 && JSON.stringify(sanitizeGuideBlocks(doc.blocks)) !== JSON.stringify(doc.blocks)) {
    out.push("Part of the document would not read back exactly as written. Check its tables and lists, then read it again.");
  }
  return out;
}

