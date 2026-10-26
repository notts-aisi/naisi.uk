import { WEEK_BLOCK_LIMITS } from "./limits";

/**
 * PROSE: the rich text a week's blocks carry (paragraphs and lists, with
 * bold, italics and links), STORED AS DATA AND NEVER AS MARKUP.
 *
 * A line is a list of runs, each a stretch of plain text with its marks. A
 * paragraph is one line; a list is a list of lines. Nothing here is HTML,
 * nothing is ever handed to `dangerouslySetInnerHTML`, and the renderer
 * (`src/features/courses/weekBlocks/Prose.tsx`) builds elements from the runs
 * and nothing else. That is the XSS boundary for every block, whoever wrote
 * it: a run's text is a text node, and a link is drawn only when its address
 * passes `safeLinkUrl` below.
 *
 * ONE SHAPE PER MEANING. The read side and the Markdown reader both hand back
 * canonical runs (`canonicalRuns`): whitespace folded to single spaces, the
 * ends of a line trimmed, no empty runs, neighbours with the same marks
 * joined, and the spaces at the edge of a marked run moved outside it. That
 * is what lets a week go to Markdown and back and arrive as the same data:
 * two spellings of one line would read back as whichever one Markdown keeps.
 *
 * Firestore cannot store an array directly inside an array, which is why a
 * list item is `{ runs }` rather than a bare list of runs.
 */

/** One stretch of text with one style. Marks are present only when on. */
export type Run = {
  text: string;
  bold?: true;
  italic?: true;
  /** An https or mailto address (`safeLinkUrl`). */
  href?: string;
};

export type ProseItem = { runs: Run[] };

/** One cell of a table: a line of runs. */
export type TableCell = { runs: Run[] };

/**
 * A paragraph, a list, a table (week 6's routes and deadlines), or a block
 * of code shown exactly as written (the hands-on routes' commands and
 * scripts: text, never run, never markup).
 */
export type ProseParagraph =
  | { type: "p"; runs: Run[] }
  | { type: "ul"; items: ProseItem[] }
  | { type: "ol"; items: ProseItem[] }
  | { type: "table"; header: TableCell[]; rows: { cells: TableCell[] }[] }
  | { type: "code"; lang: string; text: string };

export type Prose = ProseParagraph[];

/** Control characters and spaces, which a browser ignores inside an address. */
const URL_NOISE = /[\u0000- \u007f]/g;

/**
 * The address a run may link to, or null. An `https:` address with a host
 * and no user name or password, or a `mailto:` address. Anything else,
 * `http:` included, is no link at all: the text stays, unlinked.
 *
 * The address is kept as written (less control characters), not as `URL`
 * rewrites it, so a week read in and written out again carries the same
 * string.
 */
export function safeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(URL_NOISE, "");
  if (!cleaned || cleaned.length > WEEK_BLOCK_LIMITS.linkUrl) return null;
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") return url.pathname ? cleaned : null;
  if (url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return cleaned;
}

/**
 * A source's address (Q36: every source is a link, any https link): an
 * `https:` address, or null. Narrower than `safeLinkUrl`, which also takes
 * `mailto:` for an address in running text.
 */
export function safeSourceUrl(raw: unknown): string | null {
  const url = safeLinkUrl(raw);
  return url && /^https:/i.test(url) ? url : null;
}

/** A plain line of text: whitespace folded, trimmed, cut to `max`. "" for anything else. */
export function oneLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function sameMarks(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

function hasMarks(run: Run): boolean {
  return run.bold === true || run.italic === true || run.href !== undefined;
}

function withText(run: Run, text: string): Run {
  const out: Run = { text };
  if (run.bold) out.bold = true;
  if (run.italic) out.italic = true;
  if (run.href) out.href = run.href;
  return out;
}

/**
 * The canonical form of a line (see the module comment), cut to `maxChars`
 * characters of text. Pure: the input is not changed.
 */
export function canonicalRuns(runs: readonly Run[], maxChars: number = WEEK_BLOCK_LIMITS.inlineChars): Run[] {
  // 1. Fold whitespace inside each run, and move a marked run's edge spaces
  //    out of it: "** bold**" is not bold in Markdown, so the space cannot
  //    stay inside the mark and still read back.
  const spread: Run[] = [];
  for (const run of runs) {
    const text = run.text.replace(/\s+/g, " ");
    if (!text) continue;
    if (!hasMarks(run)) {
      spread.push({ text });
      continue;
    }
    const core = text.trim();
    if (text.startsWith(" ")) spread.push({ text: " " });
    if (core) spread.push(withText(run, core));
    if (text.endsWith(" ") && core) spread.push({ text: " " });
  }
  // 2. Join neighbours with the same marks, folding the spaces where they meet.
  const joined: Run[] = [];
  for (const run of spread) {
    const last = joined[joined.length - 1];
    if (last && sameMarks(last, run)) {
      joined[joined.length - 1] = withText(last, `${last.text}${run.text}`.replace(/ {2,}/g, " "));
    } else {
      joined.push(run);
    }
  }
  // 2b. A lone space between two runs with the same marks joins them: "**a**
  //     **b**" is "**a b**", one way of writing it rather than two.
  for (let i = 1; i < joined.length - 1; ) {
    const [before, gap, after] = [joined[i - 1], joined[i], joined[i + 1]];
    if (!hasMarks(gap) && gap.text === " " && hasMarks(before) && sameMarks(before, after)) {
      joined.splice(i - 1, 3, withText(before, `${before.text} ${after.text}`));
    } else {
      i += 1;
    }
  }
  // 3. Trim the line's two ends. Only an unmarked run can carry an edge space.
  if (joined.length > 0) {
    const first = joined[0];
    joined[0] = withText(first, first.text.replace(/^ +/, ""));
    const lastIndex = joined.length - 1;
    const last = joined[lastIndex];
    joined[lastIndex] = withText(last, last.text.replace(/ +$/, ""));
  }
  // 4. Drop what is empty, and cut to the budget.
  const out: Run[] = [];
  let left = maxChars;
  for (const run of joined) {
    if (!run.text || left <= 0) continue;
    const text = run.text.length > left ? run.text.slice(0, left).replace(/ +$/, "") : run.text;
    left -= run.text.length;
    if (text) out.push(withText(run, text));
  }
  return out;
}

/**
 * Stored runs, read: each a `{ text }` with a string, its marks kept only
 * when they are a stored `true` (or, for a link, a safe address), then made
 * canonical and cut to `maxChars`.
 */
export function sanitizeRuns(raw: unknown, maxChars: number = WEEK_BLOCK_LIMITS.inlineChars): Run[] {
  if (!Array.isArray(raw)) return [];
  const runs: Run[] = [];
  for (const value of raw.slice(0, WEEK_BLOCK_LIMITS.maxRuns)) {
    if (!value || typeof value !== "object") continue;
    const r = value as Record<string, unknown>;
    if (typeof r.text !== "string") continue;
    const run: Run = { text: r.text };
    if (r.bold === true) run.bold = true;
    if (r.italic === true) run.italic = true;
    const href = safeLinkUrl(r.href);
    if (href) run.href = href;
    runs.push(run);
  }
  return canonicalRuns(runs, maxChars);
}

/**
 * Stored prose, read: paragraphs and lists in order, each line canonical,
 * empty lines and lists dropped, the whole cut to `maxChars` characters of
 * text and the caps on paragraphs and list items.
 */
export function sanitizeProse(raw: unknown, maxChars: number = WEEK_BLOCK_LIMITS.proseChars): Prose {
  if (!Array.isArray(raw)) return [];
  const out: Prose = [];
  let left = maxChars;
  for (const value of raw.slice(0, WEEK_BLOCK_LIMITS.maxProseParagraphs)) {
    if (left <= 0) break;
    if (!value || typeof value !== "object") continue;
    const p = value as Record<string, unknown>;
    if (p.type === "p") {
      const runs = sanitizeRuns(p.runs, left);
      if (runs.length === 0) continue;
      left -= runsText(runs).length;
      out.push({ type: "p", runs });
    } else if (p.type === "ul" || p.type === "ol") {
      if (!Array.isArray(p.items)) continue;
      const items: ProseItem[] = [];
      for (const item of p.items.slice(0, WEEK_BLOCK_LIMITS.maxProseListItems)) {
        if (left <= 0) break;
        if (!item || typeof item !== "object") continue;
        const runs = sanitizeRuns((item as Record<string, unknown>).runs, left);
        if (runs.length === 0) continue;
        left -= runsText(runs).length;
        items.push({ runs });
      }
      if (items.length > 0) out.push({ type: p.type, items });
    } else if (p.type === "table") {
      const header = sanitizeCells(p.header, WEEK_BLOCK_LIMITS.maxProseTableColumns);
      if (header.length === 0) continue;
      const rows = (Array.isArray(p.rows) ? p.rows : [])
        .slice(0, WEEK_BLOCK_LIMITS.maxProseTableRows)
        .map((row) => sanitizeCells((row as Record<string, unknown> | null)?.cells, header.length))
        .map((cells) => {
          while (cells.length < header.length) cells.push({ runs: [] });
          return { cells };
        });
      left -= [...header, ...rows.flatMap((row) => row.cells)].reduce((n, cell) => n + runsText(cell.runs).length, 0);
      out.push({ type: "table", header, rows });
    } else if (p.type === "code") {
      if (typeof p.text !== "string" || !p.text.trim()) continue;
      // Code keeps every space and line break: it is shown as written.
      const text = p.text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").slice(0, WEEK_BLOCK_LIMITS.codeChars);
      const lang = typeof p.lang === "string" && /^[A-Za-z0-9+#.-]*$/.test(p.lang) ? p.lang.slice(0, WEEK_BLOCK_LIMITS.codeLang) : "";
      left -= text.length;
      out.push({ type: "code", lang, text });
    }
  }
  return out;
}

/** Stored table cells, read: each a canonical line, at most `max` of them. */
export function sanitizeCells(raw: unknown, max: number): TableCell[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((cell) => ({
    runs: sanitizeRuns((cell as Record<string, unknown> | null)?.runs, WEEK_BLOCK_LIMITS.inlineChars),
  }));
}

/** A line's plain text. */
export function runsText(runs: readonly Run[]): string {
  return runs.map((run) => run.text).join("");
}

/** Prose's plain text: paragraphs apart by a blank line; list items, table rows and code one to a line. */
export function proseText(prose: Prose): string {
  return prose
    .map((p) => {
      if (p.type === "p") return runsText(p.runs);
      if (p.type === "ul" || p.type === "ol") return p.items.map((item) => runsText(item.runs)).join("\n");
      if (p.type === "table") return [p.header, ...p.rows.map((row) => row.cells)].map((cells) => cells.map((cell) => runsText(cell.runs)).join(" | ")).join("\n");
      return p.text;
    })
    .join("\n\n");
}

/** How many characters of text prose holds. */
export function proseChars(prose: Prose): number {
  let n = 0;
  for (const line of proseLines(prose)) n += runsText(line).length;
  for (const p of prose) if (p.type === "code") n += p.text.length;
  return n;
}

/**
 * Every line of prose in order: paragraphs, list items and table cells (a
 * row's cells one after another). Code is not a line of runs: it is
 * counted by `proseChars` and read as text where it is drawn.
 */
export function proseLines(prose: Prose): Run[][] {
  const lines: Run[][] = [];
  for (const p of prose) {
    if (p.type === "p") lines.push(p.runs);
    else if (p.type === "ul" || p.type === "ol") for (const item of p.items) lines.push(item.runs);
    else if (p.type === "table") for (const cell of [...p.header, ...p.rows.flatMap((row) => row.cells)]) lines.push(cell.runs);
  }
  return lines;
}

/** Every link address in some runs, in order. */
export function runsLinks(runs: readonly Run[]): string[] {
  const out: string[] = [];
  for (const run of runs) if (run.href && out[out.length - 1] !== run.href) out.push(run.href);
  return out;
}

/** Every link address in prose, in order. */
export function proseLinks(prose: Prose): string[] {
  return proseLines(prose).flatMap(runsLinks);
}
