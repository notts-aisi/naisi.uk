import type { Token, Tokens } from "marked";
import { guideWordsToCheck, linkCheckerBlockedHost, type FoundRow, type FoundState } from "../weekBlocks/found";
import { guideTextReader, type GuideTextReader } from "../weekBlocks/markdownRead";
import { escapeMarkdownText, proseToMarkdown, runsToMarkdown } from "../weekBlocks/markdownWrite";
import { proseLinks, runsLinks, runsText, type Prose, type Run } from "../weekBlocks/prose";
import {
  glossaryProblems,
  isSupportHeading,
  reflectionsLineAt,
  startHereProblems,
  type GlossaryDoc,
  type GlossaryTerm,
  type GuideSection,
  type StartHereDoc,
} from "./model";

/**
 * A PROGRAMME'S START HERE AND GLOSSARY, READ FROM AND WRITTEN AS THE FELLOW
 * GUIDE'S OWN MARKDOWN. The contract is the "Start here and the Glossary"
 * section of `docs/course-weeks.md`.
 *
 * Read with the week reader's own reading of text (`guideTextReader`): runs,
 * links, lists, tables and code exactly as a week's, so a link a week
 * refuses is refused here too. Written with the week writer's own prose
 * writer, so "Copy as Markdown" escapes what a week's copy escapes. What is
 * written, read back, is the same document: `readStartHereMarkdown(
 * startHereToMarkdown(doc)).doc` is `doc`, and so for the Glossary.
 *
 * Nothing is cut short in silence: an overlong field is a problem with its
 * cap (`./model.ts`), and anything left out (a byline, pictures, HTML, a
 * link that is not https or mailto) is said, for the person who pasted to
 * check. Pure: the loader's route reads a paste with it.
 */

/** A paste, read: the document, why it cannot be saved (any one stops a save), what to check, and what was found. */
export type GuideRead<T> = {
  doc: T;
  problems: string[];
  checks: string[];
  found: FoundRow[];
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DAY = "(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+";
/** A line holding a date and nothing else ("Oct 25, 2026", "25 October 2026", "2026-10-25"): the guide's byline. */
const DATE_LINE = new RegExp(`^(?:${DAY})?(?:${MONTH}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${MONTH},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})$`, "i");

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function isHeading(token: Token | undefined, depth?: number): token is Tokens.Heading {
  return token?.type === "heading" && (depth === undefined || (token as Tokens.Heading).depth === depth);
}

/** The title line (the first `# `), its words, and the tokens without it; more than one is a problem. */
function takeTitle(reader: GuideTextReader, tokens: readonly Token[], problems: string[]): { title: string; rest: Token[] } {
  const titles = tokens.filter((token) => isHeading(token, 1)).length;
  if (titles > 1) problems.push("The Markdown has more than one title line (a line starting “# ”): keep one.");
  const at = tokens.findIndex((token) => isHeading(token, 1));
  if (at < 0) return { title: "", rest: [...tokens] };
  return {
    title: runsText(reader.line((tokens[at] as Tokens.Heading).tokens)),
    rest: tokens.filter((_, i) => i !== at),
  };
}

/** "1 paragraph", "2 paragraphs, 1 list, 1 table": what some prose holds. */
function proseDetail(prose: Prose): string {
  const count = (type: Prose[number]["type"]) => prose.filter((p) => p.type === type).length;
  const lists = count("ul") + count("ol");
  return [
    ...(count("p") > 0 ? [plural(count("p"), "paragraph")] : []),
    ...(lists > 0 ? [plural(lists, "list")] : []),
    ...(count("table") > 0 ? [plural(count("table"), "table")] : []),
    ...(count("code") > 0 ? [plural(count("code"), "block of code", "blocks of code")] : []),
  ].join(", ");
}

/** What the reader left out, said once each, and links a checker cannot read. */
function leftOutChecks(reader: GuideTextReader, links: readonly string[], pageWords: string): string[] {
  const out: string[] = [];
  const blocked = links.map(linkCheckerBlockedHost).filter((host): host is string => host !== null);
  if (blocked.length > 0) {
    out.push(`${blocked.length} of ${links.length} links can’t be checked automatically (${[...new Set(blocked)].join(", ")}). They work in a browser.`);
  }
  const { html, images, refused } = reader.leftOut();
  if (refused.length > 0) {
    out.push(
      `${refused.length === 1 ? "A link was" : `${refused.length} links were`} left as words: a link has to start with https:// (or mailto: for an address). ${refused.join(", ")}`,
    );
  }
  if (images > 0) out.push(`${images === 1 ? "1 picture was" : `${images} pictures were`} left out: ${pageWords} shows no pictures.`);
  out.push(...html);
  return out;
}

/**
 * A heading's words as the line after "## ": escaped, and a closing run of #s
 * kept as words, each written as an escaped #. The run is only #s, so it is
 * rewritten whole rather than character by character.
 */
function headingLine(level: number, text: string): string {
  return `${"#".repeat(level)} ${escapeMarkdownText(text).replace(/(\s)(#+)$/, (_, space: string, hashes: string) => `${space}${"\\#".repeat(hashes.length)}`)}`;
}

// ---------------------------------------------------------------------------
// Start here
// ---------------------------------------------------------------------------

/**
 * Start here's Markdown, read: the title line, a date line straight under
 * it left out (the guide's byline), the opening paragraphs, each `##` and
 * `###` section with its text as written (a deeper heading becomes a bold
 * line, and says so), and a last paragraph whose first words are Adapted
 * from as the credit line.
 */
export function readStartHereMarkdown(markdown: string): GuideRead<StartHereDoc> {
  const reader = guideTextReader();
  const problems: string[] = [];
  const checks: string[] = [];
  const { title, rest: afterTitle } = takeTitle(reader, reader.tokens(markdown).filter((token) => token.type !== "space"), problems);

  let rest = afterTitle;
  const first = rest[0];
  if (first?.type === "paragraph" && DATE_LINE.test((first as Tokens.Paragraph).text.trim())) {
    checks.push(`The date under the title (“${(first as Tokens.Paragraph).text.trim()}”) was left out: it’s the guide’s byline, not part of the page.`);
    rest = rest.slice(1);
  }

  const deep = rest.filter((token) => isHeading(token) && (token as Tokens.Heading).depth >= 4).length;
  const leadTokens: Token[] = [];
  const parts: Array<{ heading: Tokens.Heading; tokens: Token[] }> = [];
  for (const token of rest) {
    if (isHeading(token) && (token.depth === 2 || token.depth === 3)) parts.push({ heading: token, tokens: [] });
    else (parts.length > 0 ? parts[parts.length - 1].tokens : leadTokens).push(token);
  }

  const lead = reader.prose(leadTokens);
  const sections: GuideSection[] = parts.map((part) => ({
    heading: runsText(reader.line(part.heading.tokens)),
    level: part.heading.depth === 3 ? 3 : 2,
    body: reader.prose(part.tokens),
  }));

  // The credit line: the document's last paragraph, when its first words are Adapted from.
  let credit: Run[] = [];
  const last = sections.length > 0 ? sections[sections.length - 1].body : lead;
  const end = last[last.length - 1];
  if (end?.type === "p" && /^adapted from\b/i.test(runsText(end.runs))) {
    credit = end.runs;
    last.pop();
  }

  const doc: StartHereDoc = { title, lead, sections, credit };
  problems.push(...startHereProblems(doc));

  checks.push(...guideWordsToCheck(markdown));
  if (sections.length > 0 && reflectionsLineAt(doc) === null) {
    checks.push("No paragraph starts with “Reflections.”, so the page has nowhere to say who reads a person’s reflections. Add it in the guide?");
  }
  if (deep > 0) checks.push(`${deep === 1 ? "1 heading" : `${deep} headings`} below “###” ${deep === 1 ? "was" : "were"} read as a bold line.`);
  const links = [...proseLinks(lead), ...sections.flatMap((section) => proseLinks(section.body)), ...runsLinks(credit)];
  checks.push(...leftOutChecks(reader, links, "Start here"));

  return { doc, problems: [...new Set(problems)], checks: [...new Set(checks)], found: startHereFound(doc) };
}

/** "What we found": the title, the opening, each section, who reads reflections, and the credit line. */
export function startHereFound(doc: StartHereDoc): FoundRow[] {
  const rows: FoundRow[] = [];
  const row = (state: FoundState, label: string, detail: string, indent = false) => rows.push({ state, label, detail, indent });
  if (doc.title) row("found", "Title", doc.title);
  else row("missing", "Title", "Not in the Markdown");
  if (doc.lead.length > 0) row("found", "Opening", proseDetail(doc.lead));
  else row("missing", "Opening", "Not in the Markdown");
  for (const section of doc.sections) {
    const detail = [proseDetail(section.body) || "No text", ...(isSupportHeading(section.heading) ? ["drawn in a box"] : [])].join(" · ");
    row("found", section.heading, detail, section.level === 3);
  }
  const at = reflectionsLineAt(doc);
  if (at) {
    row("found", "Who reads reflections", `Under “Reflections.” in “${doc.sections[at.section].heading}”: the reader’s facilitators and the programme’s lead, by name`);
  } else {
    row("check", "Who reads reflections", "No paragraph starts with “Reflections.”");
  }
  if (doc.credit.length > 0) row("found", "Credit line", runsText(doc.credit));
  else row("missing", "Credit line", "Not in the Markdown");
  return rows;
}

/** Start here as the guide's Markdown ("Copy as Markdown"): the same document when pasted back. */
export function startHereToMarkdown(doc: StartHereDoc): string {
  const parts: string[] = [];
  if (doc.title) parts.push(headingLine(1, doc.title));
  parts.push(...proseToMarkdown(doc.lead));
  for (const section of doc.sections) {
    parts.push(headingLine(section.level, section.heading));
    parts.push(...proseToMarkdown(section.body));
  }
  if (doc.credit.length > 0) parts.push(runsToMarkdown(doc.credit));
  return `${parts.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// The Glossary
// ---------------------------------------------------------------------------

/**
 * The Glossary's Markdown, read: the title line, the text before the table,
 * the one table of terms (two columns: a term, and what it means, each row
 * in its order), and any text after it.
 */
export function readGlossaryMarkdown(markdown: string): GuideRead<GlossaryDoc> {
  const reader = guideTextReader();
  const problems: string[] = [];
  const checks: string[] = [];
  const { title, rest } = takeTitle(reader, reader.tokens(markdown).filter((token) => token.type !== "space"), problems);

  const tables = rest.flatMap((token, i) => (token.type === "table" ? [i] : []));
  if (tables.length === 0) problems.push("There’s no table of terms: the Glossary reads one table, with a term and what it means on each row.");
  if (tables.length > 1) problems.push(`The Markdown has ${tables.length} tables: the Glossary reads one, with a term and what it means on each row.`);
  const at = tables[0] ?? rest.length;
  const table = rest[at] as Tokens.Table | undefined;
  if (table && table.header.length !== 2) {
    problems.push(`The table has ${table.header.length} columns: the Glossary reads two, the term and what it means.`);
  }
  const headings = rest.filter((token) => isHeading(token)).length;

  const lead = reader.prose(rest.slice(0, at));
  const after = reader.prose(rest.slice(at + 1));
  const cellLine = (cell: Tokens.TableCell | undefined): Run[] => (cell ? reader.line(cell.tokens) : []);
  const terms: GlossaryTerm[] = (table?.rows ?? []).map((cells) => ({ term: cellLine(cells[0]), definition: cellLine(cells[1]) }));
  const doc: GlossaryDoc = {
    title,
    lead,
    columns: [runsText(cellLine(table?.header[0])), runsText(cellLine(table?.header[1]))],
    terms,
    after,
  };
  if (table) problems.push(...glossaryProblems(doc));

  const seen = new Map<string, number>();
  for (const entry of terms) {
    const key = runsText(entry.term).toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const entry of terms) {
    const text = runsText(entry.term);
    if ((seen.get(text.toLowerCase()) ?? 0) > 1) {
      checks.push(`“${text}” is in the table more than once.`);
      seen.delete(text.toLowerCase());
    }
  }
  if (headings > 0) checks.push(`${headings === 1 ? "1 heading" : `${headings} headings`} outside the title ${headings === 1 ? "was" : "were"} read as a bold line.`);
  const links = [...proseLinks(lead), ...terms.flatMap((entry) => [...runsLinks(entry.term), ...runsLinks(entry.definition)]), ...proseLinks(after)];
  checks.push(...leftOutChecks(reader, links, "the Glossary"));

  return { doc, problems: [...new Set(problems)], checks: [...new Set(checks)], found: glossaryFound(doc) };
}

/** "What we found": the title, the opening, the terms, the table's columns, and the text after it. */
export function glossaryFound(doc: GlossaryDoc): FoundRow[] {
  const rows: FoundRow[] = [];
  const row = (state: FoundState, label: string, detail: string) => rows.push({ state, label, detail, indent: false });
  if (doc.title) row("found", "Title", doc.title);
  else row("missing", "Title", "Not in the Markdown");
  if (doc.lead.length > 0) row("found", "Opening", proseDetail(doc.lead));
  else row("missing", "Opening", "Not in the Markdown");
  if (doc.terms.length > 0) row("found", "Terms", `${plural(doc.terms.length, "term")}, in the table’s order`);
  else row("missing", "Terms", "Not in the Markdown");
  const columns = doc.columns.filter(Boolean);
  if (columns.length > 0) row("found", "Columns", columns.join(" · "));
  if (doc.after.length > 0) row("found", "After the table", proseDetail(doc.after));
  return rows;
}

/** The Glossary as the guide's Markdown ("Copy as Markdown"): the same document when pasted back. */
export function glossaryToMarkdown(doc: GlossaryDoc): string {
  const parts: string[] = [];
  if (doc.title) parts.push(headingLine(1, doc.title));
  parts.push(...proseToMarkdown(doc.lead));
  parts.push(
    ...proseToMarkdown([
      {
        type: "table",
        header: doc.columns.map((text) => ({ runs: text ? [{ text }] : [] })),
        rows: doc.terms.map((entry) => ({ cells: [{ runs: entry.term }, { runs: entry.definition }] })),
      },
    ]),
  );
  parts.push(...proseToMarkdown(doc.after));
  return `${parts.join("\n\n")}\n`;
}
