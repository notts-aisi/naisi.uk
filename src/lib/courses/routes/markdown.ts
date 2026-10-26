import "server-only";
import { marked, type Token } from "marked";
import { noneLeftOut, readProseTokens } from "@/lib/courses/weekBlocks/markdownRead";
import { canonicalRuns, runsText, safeSourceUrl, type Prose, type ProseParagraph, type Run } from "@/lib/courses/weekBlocks/prose";
import { ROUTES_LIMITS, courseRoutesProblems, isRouteHeader, type CourseRoutes, type RouteGroup, type RouteRecord } from "./model";
import { dateKeyFromWords } from "./words";

/**
 * A COURSE'S ROUTES, READ FROM MARKDOWN in the guide's own shape (see
 * `write.ts` for the shape, and `docs/course-weeks.md`, "Routes and
 * deadlines"): what an admin pastes into the course editor's card. Text is
 * read by the week reader's own prose reading (`readProseTokens`), so a line
 * of the routes and a line of a week are never read two ways.
 *
 *  - The first paragraph starts with the day they were checked: "Checked on
 *    25 October 2026." The rest of it, and anything else before the first
 *    table, is kept as written.
 *  - Each group is its heading, a line in bold of its own, then its table.
 *    A table with no heading before it is a group with none.
 *  - A table's first column is Route: the route's name as one https link.
 *    Then What it is, and, in any order, Who it suits, Deadline (a day, or
 *    Rolling, or nothing) and Next round. Any other column is said.
 *  - Words after the last table (the guide's line on funding) are kept as
 *    written. Between two tables there is only the next group's heading.
 *  - A heading at the very top (the week's "Where to go next") is the
 *    week's, and is left out.
 *
 * Nothing is cut short or dropped in silence: anything that cannot be read
 * is a problem with a sentence that says what to change, and a list with a
 * problem is not saved.
 */

export type RoutesRead = {
  /** What the Markdown reads as, or null when it holds no list at all. */
  routes: CourseRoutes | null;
  /** What stops it being saved, each a sentence. Empty when it can be saved. */
  problems: string[];
};

type Column = "route" | "what" | "suits" | "deadline" | "nextRound";

const COLUMN_LABEL: Record<Column, string> = {
  route: "Route",
  what: "What it is",
  suits: "Who it suits",
  deadline: "Deadline",
  nextRound: "Next round",
};

const COLUMN_WORDS: Array<[RegExp, Column]> = [
  [/^routes?$/i, "route"],
  [/^what it is$/i, "what"],
  [/^who it suits$/i, "suits"],
  [/^(?:deadline|closes|apply by)$/i, "deadline"],
  [/^next round$/i, "nextRound"],
];

/** The text of a run list with its first `n` characters taken off. */
function dropChars(runs: readonly Run[], n: number): Run[] {
  const out: Run[] = [];
  let left = n;
  for (const run of runs) {
    if (left >= run.text.length) {
      left -= run.text.length;
      continue;
    }
    out.push({ ...run, text: run.text.slice(left) });
    left = 0;
  }
  return out;
}

/** "Checked on 25 October 2026." at the start of a paragraph: its day, and how long the sentence is. */
function checkedOnAt(text: string): { key: string | null; words: string; length: number } | null {
  const match = /^\s*checked on\s+([^.]*?)\s*(?:\.|$)/i.exec(text);
  if (!match) return null;
  return { key: dateKeyFromWords(match[1]), words: match[1], length: match[0].length };
}

function isAllBold(paragraph: ProseParagraph): boolean {
  return paragraph.type === "p" && paragraph.runs.length > 0 && paragraph.runs.every((run) => run.bold === true || run.text.trim() === "");
}

/** A route's name and link from its cell: the cell's words, all of them one link. */
function routeOfCell(runs: readonly Run[]): { name: string; url: string } | null {
  const linked = runs.filter((run) => run.href);
  const hrefs = new Set(linked.map((run) => run.href));
  const loose = runs.filter((run) => !run.href && run.text.trim() !== "");
  if (hrefs.size !== 1 || loose.length > 0) return null;
  const url = safeSourceUrl([...hrefs][0]);
  const name = runsText(linked).replace(/\s+/g, " ").trim();
  return url && name ? { name, url } : null;
}

function readTable(table: Extract<ProseParagraph, { type: "table" }>, heading: string, problems: string[]): RouteGroup {
  const where = heading ? `the “${heading}” table` : "a table";
  const columns: Array<Column | null> = table.header.map((cell, index) => {
    const text = runsText(cell.runs).trim();
    const found = COLUMN_WORDS.find(([pattern]) => pattern.test(text));
    if (!found) {
      problems.push(`A column we don’t know in ${where}, “${text}”: the columns are Route, What it is, Who it suits, Deadline and Next round.`);
      return null;
    }
    if (index === 0 && found[1] !== "route") problems.push(`The first column of ${where} has to be Route.`);
    return found[1];
  });
  const Where = `${where.charAt(0).toUpperCase()}${where.slice(1)}`;
  for (const column of new Set(columns)) {
    if (column && columns.filter((c) => c === column).length > 1) problems.push(`${Where} has two ${COLUMN_LABEL[column]} columns.`);
  }
  if (!columns.includes("what")) problems.push(`${Where} needs a What it is column.`);

  const routes: RouteRecord[] = [];
  for (const row of table.rows) {
    const at = (column: Column): Run[] => {
      const index = columns.indexOf(column);
      return index >= 0 ? canonicalRuns(row.cells[index]?.runs ?? [], 100_000) : [];
    };
    const routeCell = at("route");
    const named = routeOfCell(routeCell);
    const label = runsText(routeCell).trim() || "A route";
    if (!named) {
      problems.push(`“${label}” needs to be the route’s name as one link starting https://, like [SPAR](https://sparai.org/).`);
      continue;
    }
    const deadlineText = runsText(at("deadline")).trim();
    let deadline: string | null = null;
    let rolling = false;
    if (/^rolling$/i.test(deadlineText)) rolling = true;
    else if (deadlineText) {
      deadline = dateKeyFromWords(deadlineText);
      if (!deadline) {
        problems.push(`The deadline for “${named.name}”, “${deadlineText}”, isn’t a day: write a day like 1 November 2026, or Rolling, or leave it empty.`);
      }
    }
    routes.push({ name: named.name, url: named.url, what: at("what"), suits: at("suits"), deadline, rolling, nextRound: at("nextRound") });
  }
  return { heading, routes };
}

/** Reads a pasted list. Never throws: anything it cannot read is a problem. */
export function readRoutesMarkdown(markdown: string): RoutesRead {
  if (markdown.length > ROUTES_LIMITS.markdownChars) {
    return { routes: null, problems: [`That’s ${markdown.length} characters; the most a list of routes can be is ${ROUTES_LIMITS.markdownChars}.`] };
  }
  const tokens = marked.lexer(markdown, { gfm: true }).filter((token: Token) => token.type !== "space");
  // The week's own heading over the section, if it came with the paste.
  if (tokens[0]?.type === "heading") tokens.shift();
  if (tokens.length === 0) {
    return { routes: null, problems: ["Paste the routes: the day you checked them, then each group’s heading in bold and its table."] };
  }

  const seen = noneLeftOut();
  const prose: Prose = readProseTokens(tokens, seen);
  const problems: string[] = [];
  for (const refused of seen.refused) problems.push(`“${refused}” isn’t a link starting https://: write it with https://, or as words without a link.`);
  if (seen.images > 0) problems.push("Pictures can’t go in the routes: take them out.");
  for (const what of seen.leftOut) problems.push(`This can’t go in the routes: ${what}.`);

  // The day they were checked, from the first paragraph.
  let checkedOn = "";
  const intro: Prose = [];
  const [first, ...rest] = prose;
  const checked = first?.type === "p" ? checkedOnAt(runsText(first.runs)) : null;
  if (!checked) {
    problems.push("Start with the day you checked them, like “Checked on 25 October 2026.”");
  } else if (!checked.key) {
    problems.push(`“Checked on ${checked.words}” isn’t a day: write the day, the month and the year, like “Checked on 25 October 2026.”`);
  } else {
    checkedOn = checked.key;
  }
  const body = checked && first?.type === "p" ? rest : prose;
  if (checked && first?.type === "p") {
    const after = canonicalRuns(dropChars(first.runs, checked.length), 100_000);
    if (after.length > 0) intro.push({ type: "p", runs: after });
  }

  // Groups: an optional heading in bold, then a table. Words before the first
  // table are the introduction; words after the last are kept after it.
  const groups: RouteGroup[] = [];
  const trailing: Prose = [];
  for (let i = 0; i < body.length; i += 1) {
    const paragraph = body[i];
    const next = body[i + 1];
    if (paragraph.type === "table" || (isAllBold(paragraph) && next?.type === "table")) {
      if (trailing.length > 0) {
        const words = runsText(trailing[0].type === "p" ? trailing[0].runs : []).slice(0, 40) || "a list";
        problems.push(`Between two tables there can only be the next group’s heading, in bold on its own line: move “${words}” before the first table or after the last.`);
        trailing.length = 0;
      }
      const heading = paragraph.type === "p" ? runsText(paragraph.runs).replace(/\s+/g, " ").trim() : "";
      const table = paragraph.type === "table" ? paragraph : (next as Extract<ProseParagraph, { type: "table" }>);
      if (paragraph.type !== "table") i += 1;
      if (!isRouteHeader(runsText(table.header[0]?.runs ?? []))) {
        problems.push(`The first column of ${heading ? `the “${heading}” table` : "a table"} has to be Route.`);
        continue;
      }
      groups.push(readTable(table, heading, problems));
      continue;
    }
    (groups.length === 0 ? intro : trailing).push(paragraph);
  }
  if (groups.length === 0) problems.push("There’s no table of routes: each group’s routes go in a table whose first column is Route.");

  const routes: CourseRoutes = { checkedOn, intro, groups, after: trailing };
  if (groups.length > 0 && checkedOn) {
    for (const problem of courseRoutesProblems(routes)) if (!problems.includes(problem)) problems.push(problem);
  }
  return { routes: groups.length > 0 ? routes : null, problems };
}
