import { WEEK_BLOCK_LIMITS as W } from "../weekBlocks/limits";
import { proseProblems, runsProblems } from "../weekBlocks/model";
import {
  oneLine,
  proseChars,
  proseLines,
  runsText,
  sanitizeProse,
  sanitizeRuns,
  type Prose,
  type ProseParagraph,
  type Run,
} from "../weekBlocks/prose";
import { GUIDE_LIMITS as L } from "./limits";

/**
 * A PROGRAMME'S START HERE AND GLOSSARY: the two pages of the fellow guide
 * that are not weeks, stored as data and never as markup.
 *
 * WHERE THEY LIVE: on the course run's own document, as `startHere` and
 * `glossary`, beside the run's weeks. A programme's guide is the run's, as
 * its weeks are: it travels with them through every copy of a run (a copy
 * forward, a template saved from the run and applied to another), through
 * the one function `runGuideFields` below, and it goes when the run goes,
 * with the run's own document. Only the server writes either field (the
 * loader's route, admins only); `firestore.rules` keeps every browser write
 * off both, admins included. Neither is part of `CourseRunDoc`: the run's
 * many readers never parse them, and the one reader of each is
 * `readRunStartHere` and `readRunGlossary` below.
 *
 * WHAT THEY HOLD:
 *
 *  - Start here: the guide's title line (kept for the copy, never drawn), the
 *    opening paragraphs, its sections (a `##` or `###` heading and the text
 *    under it, with its lists and tables kept as written: the rubric table
 *    and the case study questions are text here, never a case block), and
 *    the credit line at the foot ("Adapted from …").
 *  - Glossary: the title line, the opening text, the table's two column
 *    headings (kept for the copy), each term and its definition in the
 *    table's order, the definition a line of rich text with its links, and
 *    any text after the table.
 *
 * NOTHING ABOUT A PERSON IS STORED HERE. The line on Start here that says who
 * reads a person's reflections is drawn by the page from records (the
 * reader's group's facilitators and the programme's lead), never written in.
 *
 * The caps are `./limits.ts`; the Markdown read and written is `./markdown.ts`.
 */

export const GUIDE_DOCS = ["start-here", "glossary"] as const;
export type GuideDocName = (typeof GUIDE_DOCS)[number];

/** The field each document is stored in, on the run's own document. */
export const GUIDE_FIELD = { "start-here": "startHere", glossary: "glossary" } as const satisfies Record<GuideDocName, string>;

/** Both fields, for a rule or a copy that has to name them all. */
export const RUN_GUIDE_FIELDS = ["startHere", "glossary"] as const;

export function isGuideDocName(value: unknown): value is GuideDocName {
  return typeof value === "string" && (GUIDE_DOCS as readonly string[]).includes(value);
}

export type GuideSection = {
  /** The heading's words, plain. */
  heading: string;
  /** `##` or `###` in the guide. */
  level: 2 | 3;
  body: Prose;
};

export type StartHereDoc = {
  /** The guide's title line, kept so a copy reads as the guide does. Never drawn: the page is "Start here". */
  title: string;
  /** The paragraphs under the title, before the first section. */
  lead: Prose;
  sections: GuideSection[];
  /** The credit line at the foot ("Adapted from …"), or none. */
  credit: Run[];
};

export type GlossaryTerm = { term: Run[]; definition: Run[] };

export type GlossaryDoc = {
  /** The title line, kept for the copy. */
  title: string;
  /** The text under the title, before the table. */
  lead: Prose;
  /** The words heading the table's two columns, kept for the copy. */
  columns: [string, string];
  /** In the table's order. */
  terms: GlossaryTerm[];
  /** Any text after the table. */
  after: Prose;
};

/**
 * What a page links to of a run's guide (the week page's "Start here ·
 * Glossary", the programme page's "About this course"): whether Start here
 * exists, and how many terms the Glossary has, null when it has none.
 */
export type GuideLinks = { startHere: boolean; glossaryTerms: number | null };

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// The read side: a stored document, cut to the caps
// ---------------------------------------------------------------------------

/**
 * Stored Start here, read: each field made canonical and cut to its cap, the
 * whole to `startHereChars`. Null for anything that is not one, or one with
 * nothing to draw. A document the check passes reads back unchanged.
 */
export function sanitizeStartHere(raw: unknown): StartHereDoc | null {
  const data = asRecord(raw);
  if (!data) return null;
  let left = L.startHereChars;
  const lead = sanitizeProse(data.lead, Math.min(L.leadChars, left));
  left -= proseChars(lead);
  const sections: GuideSection[] = [];
  for (const value of (Array.isArray(data.sections) ? data.sections : []).slice(0, L.maxSections)) {
    if (left <= 0) break;
    const section = asRecord(value);
    if (!section) continue;
    const heading = oneLine(section.heading, L.heading);
    if (!heading) continue;
    const body = sanitizeProse(section.body, Math.min(L.sectionChars, left));
    left -= proseChars(body);
    sections.push({ heading, level: section.level === 3 ? 3 : 2, body });
  }
  if (lead.length === 0 && sections.length === 0) return null;
  return { title: oneLine(data.title, L.title), lead, sections, credit: sanitizeRuns(data.credit, L.creditChars) };
}

/**
 * The stored Glossary, read: each term and definition made canonical and cut
 * to its cap, at most `maxTerms` of them and `glossaryChars` in all, a term
 * with no words dropped. Null for anything that is not one, or one with no
 * terms. A document the check passes reads back unchanged.
 */
export function sanitizeGlossary(raw: unknown): GlossaryDoc | null {
  const data = asRecord(raw);
  if (!data) return null;
  const terms: GlossaryTerm[] = [];
  let left = L.glossaryChars;
  for (const value of (Array.isArray(data.terms) ? data.terms : []).slice(0, L.maxTerms)) {
    if (left <= 0) break;
    const entry = asRecord(value);
    if (!entry) continue;
    const term = sanitizeRuns(entry.term, Math.min(L.term, left));
    if (term.length === 0) continue;
    left -= runsText(term).length;
    const definition = sanitizeRuns(entry.definition, Math.max(0, Math.min(L.definition, left)));
    left -= runsText(definition).length;
    terms.push({ term, definition });
  }
  if (terms.length === 0) return null;
  const columns = Array.isArray(data.columns) ? data.columns : [];
  return {
    title: oneLine(data.title, L.title),
    lead: sanitizeProse(data.lead, L.glossaryLeadChars),
    columns: [oneLine(columns[0], L.column), oneLine(columns[1], L.column)],
    terms,
    after: sanitizeProse(data.after, L.glossaryLeadChars),
  };
}

/** THE ONE READER of a run's Start here: its stored document, or null when it has none. */
export function readRunStartHere(run: unknown): StartHereDoc | null {
  return sanitizeStartHere(asRecord(run)?.startHere);
}

/** THE ONE READER of a run's Glossary: its stored document, or null when it has none. */
export function readRunGlossary(run: unknown): GlossaryDoc | null {
  return sanitizeGlossary(asRecord(run)?.glossary);
}

/**
 * THE ONE COPY: what every copy of a run's curriculum carries of its guide
 * (a copy forward to another run, a template saved from the run, a template
 * applied to a run): each document it has, read as stored, and no key for
 * one it has not. A test walks the tree for a curriculum copy that does not
 * spread this.
 */
export function runGuideFields(run: unknown): { startHere?: StartHereDoc; glossary?: GlossaryDoc } {
  const startHere = readRunStartHere(run);
  const glossary = readRunGlossary(run);
  return { ...(startHere ? { startHere } : {}), ...(glossary ? { glossary } : {}) };
}

// ---------------------------------------------------------------------------
// The check: what stops a document being stored
// ---------------------------------------------------------------------------

/** Every line's changes of style, and every table cell's length, against the week's caps. */
function lineProblems(where: string, prose: Prose, out: string[]): void {
  for (const paragraph of prose) {
    if (paragraph.type !== "table") continue;
    for (const cell of [...paragraph.header, ...paragraph.rows.flatMap((row) => row.cells)]) {
      runsProblems(where, "a table cell", cell.runs, W.inlineChars, out);
    }
  }
  if (proseLines(prose).some((runs) => runs.length > W.maxRuns)) out.push(`${where}: a line has too many changes of style.`);
}

function titleProblems(title: string, out: string[]): void {
  if (title.length > L.title) out.push(`The title is ${title.length} characters; the most is ${L.title}.`);
}

function storedProblems(name: string, doc: unknown, out: string[]): void {
  const stored = JSON.stringify(doc).length;
  if (stored > L.storedChars) out.push(`${name} is ${stored} characters stored; the most is ${L.storedChars}. Make it shorter.`);
}

/**
 * What stops Start here being stored, each in a sentence that says what to
 * change, or `[]` when it can be. The server asks this before it writes.
 */
export function startHereProblems(doc: StartHereDoc): string[] {
  const out: string[] = [];
  titleProblems(doc.title, out);
  if (doc.lead.length === 0 && doc.sections.length === 0) {
    out.push("Nothing in this Markdown reads as Start here: paste the guide’s Start here page, starting with its title line.");
  }
  proseProblems("The opening", doc.lead, out, L.leadChars);
  lineProblems("The opening", doc.lead, out);
  if (doc.sections.length > L.maxSections) out.push(`Start here has ${doc.sections.length} sections; the most is ${L.maxSections}.`);
  for (const section of doc.sections) {
    if (!section.heading) {
      out.push("A section’s heading has no words: give it some.");
      continue;
    }
    const where = `“${section.heading}”`;
    if (section.heading.length > L.heading) out.push(`${where}: the heading is ${section.heading.length} characters; the most is ${L.heading}.`);
    proseProblems(where, section.body, out, L.sectionChars);
    lineProblems(where, section.body, out);
  }
  runsProblems("Start here", "the credit line", doc.credit, L.creditChars, out);
  const total = proseChars(doc.lead) + doc.sections.reduce((n, section) => n + proseChars(section.body), 0) + runsText(doc.credit).length;
  if (total > L.startHereChars) out.push(`Start here is ${total} characters; the most is ${L.startHereChars}.`);
  storedProblems("Start here", doc, out);
  return [...new Set(out)];
}

/**
 * What stops the Glossary being stored, each in a sentence that says what to
 * change, or `[]` when it can be. The server asks this before it writes.
 */
export function glossaryProblems(doc: GlossaryDoc): string[] {
  const out: string[] = [];
  titleProblems(doc.title, out);
  proseProblems("The opening", doc.lead, out, L.glossaryLeadChars);
  lineProblems("The opening", doc.lead, out);
  proseProblems("The text after the table", doc.after, out, L.glossaryLeadChars);
  lineProblems("The text after the table", doc.after, out);
  doc.columns.forEach((column, i) => {
    if (column.length > L.column) out.push(`The table’s ${i === 0 ? "first" : "second"} column heading is ${column.length} characters; the most is ${L.column}.`);
  });
  if (doc.terms.length === 0) out.push("The Glossary has no terms: it reads a table with a term and what it means on each row.");
  if (doc.terms.length > L.maxTerms) out.push(`The Glossary has ${doc.terms.length} terms; the most is ${L.maxTerms}.`);
  doc.terms.forEach((entry, i) => {
    const term = runsText(entry.term);
    if (!term) {
      out.push(`Row ${i + 1} of the table has no term.`);
      return;
    }
    runsProblems(`“${term}”`, "the term", entry.term, L.term, out);
    if (runsText(entry.definition) === "") out.push(`“${term}” has no definition.`);
    runsProblems(`“${term}”`, "the definition", entry.definition, L.definition, out);
  });
  const total = doc.terms.reduce((n, entry) => n + runsText(entry.term).length + runsText(entry.definition).length, 0);
  if (total > L.glossaryChars) out.push(`The terms and definitions are ${total} characters; the most is ${L.glossaryChars}.`);
  storedProblems("The Glossary", doc, out);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// What the pages draw from a document's own words
// ---------------------------------------------------------------------------

/** A section the page draws in a box of its own (the guide's "Support"). */
export function isSupportHeading(heading: string): boolean {
  return /^support$/i.test(heading.trim());
}

/**
 * The paragraph Start here's line about who reads reflections goes under:
 * the guide's own, opening with a bold "Reflections" ("**Reflections.** Most
 * weeks have …"). The page puts the line after the first one.
 */
export function isReflectionsParagraph(paragraph: ProseParagraph): boolean {
  return paragraph.type === "p" && paragraph.runs[0]?.bold === true && /^reflections\b/i.test(paragraph.runs[0].text.trim());
}

/** Where the line about who reads reflections goes: the section and paragraph, or null when no paragraph opens with "Reflections". */
export function reflectionsLineAt(doc: StartHereDoc): { section: number; paragraph: number } | null {
  for (let section = 0; section < doc.sections.length; section += 1) {
    const paragraph = doc.sections[section].body.findIndex(isReflectionsParagraph);
    if (paragraph >= 0) return { section, paragraph };
  }
  return null;
}

/** Each section's anchor on the page, from its heading's words: "how-a-week-works", made unique. */
export function sectionAnchors(sections: readonly GuideSection[]): string[] {
  const seen = new Map<string, number>();
  return sections.map((section) => {
    const base =
      section.heading
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}
