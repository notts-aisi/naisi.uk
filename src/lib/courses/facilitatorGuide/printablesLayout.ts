import type { Prose, ProseParagraph, Run, TableCell } from "@/lib/courses/weekBlocks/prose";
import type { GuideBlock, GuideCheckItem, GuideDocument } from "./model";
import { drawableText, drawnAs } from "./printablesGlyphs";
import { pageOfWords } from "./words";

/**
 * A COURSE'S PRINTABLES, LAID OUT ON A4: where every line, row, template and
 * mark of a printables document goes, page by page, before anything is
 * drawn. `printablesPdf.ts` draws what this decides, and nothing else.
 *
 * WHAT IS DRAWN IS WHAT IS WRITTEN, in the document's order: its title,
 * headings, paragraphs, lists, quotes, boxes to tick, tables, and its
 * templates (code blocks) in the monospace face with every space kept,
 * because they are forms people write on. Nothing is reworded, and two things
 * are added (`extras`): a PDF of more than one page says "Page 2 of 5" small
 * in the bottom margin of each page, and a table that runs on to another page
 * has its header row drawn again at the top there. Every other string handed
 * to the PDF is a stretch of the document's own text (`drawn`), and the marks
 * around them are lines and boxes. Neither addition moves the rest: the page's
 * number sits below the content, and a header drawn again takes only its own
 * height on the page it is drawn on.
 *
 * THE PAGE: A4 portrait, single-sided, 15 mm margins, the house's light inks
 * on white.
 *
 * CUT LINES. The printables say "cut cards along the lines", so each row of
 * a table is a card in a dashed frame of its own, and each template sits in a
 * dashed frame too. A dashed line is a line to cut along; a thin solid line
 * (between a row's columns) is not.
 *
 * WHAT IS NEVER SPLIT ACROSS A PAGE, when it fits on the next one: a row of a
 * table, a template, every block (a paragraph, a list, a quote, a table, a
 * template), and a whole "##" section or "###" part of one. A heading, a
 * paragraph wholly in bold (a label: "Rules for Blue") and a paragraph ending
 * in a colon always have what follows them on their page. What cannot fit on
 * a page of its own is split there and nowhere else: a template or a row
 * taller than a page at a line, its first piece three quarters of a page so
 * its heading stands with it; a table taller than a page between its rows,
 * its header row drawn again above the rows on each page it runs on to; a
 * paragraph taller than a page keeping two lines either side of the break.
 *
 * Pure: the fonts are asked through `Measure`, which `printablesPdf.ts` hands
 * in from PDFKit.
 */

// ---------------------------------------------------------------------------
// The page, the faces and the look
// ---------------------------------------------------------------------------

/** The three faces: Space Grotesk at its two weights, and Space Mono for the templates. */
export type PdfFace = "regular" | "bold" | "mono";

/** What the layout asks of the fonts. */
export type Measure = {
  /** How wide `text` is in `face` at `size` points. */
  width(text: string, face: PdfFace, size: number): number;
};

/**
 * Each face's height above and below its baseline, as a share of its size:
 * the fonts' own ascender and descender (`tests/course-facilitator-guide-
 * printables.test.mjs` holds them to the files). A line's letters are
 * centred in its line box from these.
 */
export const FACE_METRICS: Record<PdfFace, { ascent: number; descent: number }> = {
  regular: { ascent: 0.984, descent: 0.292 },
  bold: { ascent: 0.984, descent: 0.292 },
  mono: { ascent: 1.12, descent: 0.361 },
};

/** A4 portrait, in points, with 15 mm margins. */
export const PAGE = { width: 595.28, height: 841.89, margin: 42.52 } as const;

const LEFT = PAGE.margin;
const TOP = PAGE.margin;
const BOTTOM = PAGE.height - PAGE.margin;
/** The width every block may use. */
export const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
/** The height of one page's content. */
export const CONTENT_HEIGHT = BOTTOM - TOP;

/** The light theme's inks (`src/theme/tokens.css`), which print well on white. */
export const PRINT_INKS = {
  text: "#1a2032",
  muted: "#5b6785",
  link: "#3b55e3",
  bar: "#3b55e3",
  cut: "#8b94ac",
  rule: "#c5cbd6",
} as const;

/** Sizes in points; leadings as a share of the size. */
export const PRINT_LOOK = {
  title: { size: 20, leading: 1.2 },
  /** A heading by its level: "##" is 2. */
  heading: {
    2: { size: 14, leading: 1.25, gapBefore: 20 },
    3: { size: 11.5, leading: 1.3, gapBefore: 14 },
    4: { size: 10.5, leading: 1.35, gapBefore: 10 },
  },
  body: { size: 10.5, leading: 1.4 },
  /** Between two blocks, and between a heading and what follows it. */
  blockGap: 8,
  afterHeading: 5,
  list: { itemGap: 3, markerGap: 6 },
  quote: { indent: 12, bar: 2 },
  table: { size: 9.5, leading: 1.35, padX: 6, padY: 5 },
  template: { size: 9.5, minSize: 6, leading: 1.35, padX: 10, padY: 8 },
  checkbox: { size: 8, gap: 8 },
  /** A cut line: dashed, this wide, this many points on and off. */
  cut: { width: 0.75, dash: 4, space: 3 },
  /** A line that is not for cutting, between a row's columns. */
  rule: 0.5,
  /** A link's underline, below the baseline. */
  underline: { offset: 1.6, width: 0.6 },
  /** "Page 2 of 5", in the bottom margin. */
  pageNumber: { size: 8 },
} as const;

/** Tab stops in a template, every eight columns, as a browser draws a template on the guide's page. */
const TAB_STOP = 8;

/**
 * Something taller than a page (a template, a row) is cut into pieces of a
 * page each, the first of three quarters of one, so the heading and the line
 * that introduce it still fit on its first page with it.
 */
function pieces(count: number, perPage: number): [number, number][] {
  const out: [number, number][] = [];
  if (count <= perPage) return [[0, count]];
  let from = 0;
  let size = Math.max(1, Math.floor((perPage * 3) / 4));
  while (from < count) {
    out.push([from, Math.min(count, from + size)]);
    from += size;
    size = perPage;
  }
  return out;
}

/** A list's marker: a bullet, or the item's number ("3."). */
export function listMarker(kind: "ul" | "ol", index: number): string {
  return kind === "ul" ? "•" : `${index + 1}.`;
}

// ---------------------------------------------------------------------------
// What a page holds
// ---------------------------------------------------------------------------

/** A stretch of text, placed by its baseline. */
export type PdfText = {
  kind: "text";
  x: number;
  /** The baseline. */
  y: number;
  text: string;
  face: PdfFace;
  size: number;
  ink: string;
  /** Italic in the document: Space Grotesk has no italic, so the letters lean. */
  oblique: boolean;
  /**
   * What the layout adds rather than the document's text where it is written:
   * the page's number at its foot, or a table's header row drawn again at the
   * top of a page its table runs on to.
   */
  extra?: "page-number" | "header-again";
};

/** A straight line: a cut line (dashed), a rule, an underline, a quote's bar. */
export type PdfLine = { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number; ink: string; dashed: boolean };

/** A rectangle: a box to tick (filled when ticked), or the box a character no face has is drawn as. */
export type PdfBox = { kind: "box"; x: number; y: number; w: number; h: number; width: number; ink: string; filled: boolean };

/** Where a link in the document goes, over the words that carry it. */
export type PdfLink = { kind: "link"; x: number; y: number; w: number; h: number; url: string };

export type PdfItem = PdfText | PdfLine | PdfBox | PdfLink;

/** What a placed stretch of the document is, for the checks that read a layout. */
export type PlacedMark = {
  kind: "title" | "heading" | "line" | "item" | "row" | "template";
  /** The block's index in the document. */
  block: number;
  /** A table's row (0 is its header), or a list's item. */
  row?: number;
  /** The piece of a row or a template too tall for one page; absent when it is whole. */
  part?: number;
  /** A table's header row drawn again at the top of a page its table runs on to. */
  repeated?: true;
  /** The "##" section and "###" part it is in, outermost first. */
  groups: string[];
  page: number;
  top: number;
  bottom: number;
};

/** A "##" section, a "###" part or a block, as placed: how tall it is on an empty page, and the pages it is on. */
export type PlacedGroup = { id: string; height: number; pages: number[] };

export type PrintablesLayout = {
  pages: PdfItem[][];
  /** Every string of the document's own text handed to the PDF, in the order it is drawn: each once. */
  drawn: string[];
  /**
   * The strings the layout adds, in the order they are drawn: each page's
   * number when there is more than one page, and a table's header row drawn
   * again at the top of each page it runs on to.
   */
  extras: string[];
  /** Every character drawn as a box, once each, in order. */
  undrawable: string[];
  placed: PlacedMark[];
  groups: PlacedGroup[];
};

// ---------------------------------------------------------------------------
// Atoms: what is placed whole
// ---------------------------------------------------------------------------

type Mark = Omit<PlacedMark, "groups" | "page" | "top" | "bottom">;

/**
 * The smallest thing placed whole: a line of text, a heading, a row, a
 * template. `items` draws it from its top. `glueNext` keeps it on the page
 * of the atom after it.
 */
type Atom = {
  height: number;
  /** The space above it, dropped at the top of a page. */
  gapBefore: number;
  glueNext: boolean;
  groups: string[];
  mark: Mark;
  items(top: number, atPageTop: boolean): PdfItem[];
  /** A row of a table after its header: the header, drawn again above it when it starts a page. */
  repeat?: Atom;
};

/** Where a block is drawn across the page: from `x`, `width` wide, with a quote's bar beside it when `bar` is set. */
type Frame = { x: number; width: number; bar: { x: number } | null };

// ---------------------------------------------------------------------------
// Text: runs into lines
// ---------------------------------------------------------------------------

type Style = { face: "regular" | "bold"; oblique: boolean; link: string | null };

/** One stretch of a line in one face and style, or a box for a character no face has. */
type Piece = { text: string; face: PdfFace; oblique: boolean; link: string | null; box: boolean; width: number };

type Word = { pieces: Piece[]; width: number; space: Style | null };

type Line = { pieces: Piece[]; width: number };

/** The layout's own state: the fonts, and what it has seen. */
type Ctx = {
  measure: Measure;
  cache: Map<string, number>;
  undrawable: string[];
};

function widthOf(ctx: Ctx, text: string, face: PdfFace, size: number): number {
  const key = `${face}|${size}|${text}`;
  let width = ctx.cache.get(key);
  if (width === undefined) {
    width = ctx.measure.width(text, face, size);
    ctx.cache.set(key, width);
  }
  return width;
}

/** The width of the box a character no face has is drawn as. */
const boxWidth = (size: number) => size * 0.6;

/** Text in one style, as pieces: each character in the face that has it, a box where none does. */
function piecesOf(ctx: Ctx, text: string, style: Style, size: number): Piece[] {
  const out: Piece[] = [];
  for (const ch of text) {
    const drawn = drawnAs("text", ch);
    if (drawn.kind === "box") {
      if (!ctx.undrawable.includes(ch)) ctx.undrawable.push(ch);
      out.push({ text: "", face: style.face, oblique: style.oblique, link: style.link, box: true, width: boxWidth(size) });
      continue;
    }
    const face: PdfFace = drawn.face === "mono" ? "mono" : style.face;
    const last = out[out.length - 1];
    if (last && !last.box && last.face === face) last.text += drawn.ch;
    else out.push({ text: drawn.ch, face, oblique: style.oblique, link: style.link, box: false, width: 0 });
  }
  for (const piece of out) if (!piece.box) piece.width = widthOf(ctx, piece.text, piece.face, size);
  return out;
}

function styleOf(run: Run, bold: boolean): Style {
  return { face: bold || run.bold ? "bold" : "regular", oblique: run.italic === true, link: run.href ?? null };
}

/** A line's runs as words: a word runs across runs until a space, and keeps the style of the space before it. */
function wordsOf(ctx: Ctx, runs: readonly Run[], size: number, bold: boolean): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  let space: Style | null = null;
  for (const run of runs) {
    const style = styleOf(run, bold);
    // Only an ordinary space breaks a line: a no-break space stays inside its word.
    for (const part of drawableText(run.text).replace(/[\t\n\r]/g, " ").split(/( +)/)) {
      if (!part) continue;
      if (part.startsWith(" ")) {
        if (current) words.push(current);
        current = null;
        space = style;
        continue;
      }
      const pieces = piecesOf(ctx, part, style, size);
      const width = pieces.reduce((n, piece) => n + piece.width, 0);
      if (current) {
        current.pieces.push(...pieces);
        current.width += width;
      } else {
        current = { pieces, width, space: words.length > 0 ? space : null };
      }
      space = null;
    }
  }
  if (current) words.push(current);
  return words;
}

/** A word too wide for any line, cut into pieces that fit, character by character. */
function cutWord(ctx: Ctx, word: Word, size: number, width: number): Line[] {
  const lines: Line[] = [];
  let line: Line = { pieces: [], width: 0 };
  for (const piece of word.pieces) {
    const chars = piece.box ? [""] : [...piece.text];
    for (const ch of chars) {
      const w = piece.box ? piece.width : widthOf(ctx, ch, piece.face, size);
      if (line.pieces.length > 0 && line.width + w > width) {
        lines.push(line);
        line = { pieces: [], width: 0 };
      }
      const last = line.pieces[line.pieces.length - 1];
      if (!piece.box && last && !last.box && last.face === piece.face && last.oblique === piece.oblique && last.link === piece.link) {
        last.text += ch;
        last.width += w;
      } else {
        line.pieces.push({ ...piece, text: ch, width: w });
      }
      line.width += w;
    }
  }
  if (line.pieces.length > 0) lines.push(line);
  return lines;
}

/** Runs into lines no wider than `width`, broken at spaces, a word wider than a line cut where it must be. */
function breakLines(ctx: Ctx, runs: readonly Run[], size: number, width: number, bold = false): Line[] {
  // A hair under the width, so a line measured word by word never runs past
  // the margin once it is measured whole.
  const room = width - 0.5;
  const lines: Line[] = [];
  let line: Line = { pieces: [], width: 0 };
  for (const word of wordsOf(ctx, runs, size, bold)) {
    const spaceFace: PdfFace = word.space?.face ?? "regular";
    const spaceWidth = line.pieces.length > 0 && word.space ? widthOf(ctx, " ", spaceFace, size) : 0;
    if (line.pieces.length > 0 && line.width + spaceWidth + word.width > room) {
      lines.push(line);
      line = { pieces: [], width: 0 };
    }
    if (line.pieces.length === 0 && word.width > room) {
      const cut = cutWord(ctx, word, size, room);
      lines.push(...cut.slice(0, -1));
      line = cut[cut.length - 1] ?? { pieces: [], width: 0 };
      continue;
    }
    if (line.pieces.length > 0 && word.space) {
      line.pieces.push({ text: " ", face: spaceFace, oblique: word.space.oblique, link: word.space.link, box: false, width: spaceWidth });
      line.width += spaceWidth;
    }
    line.pieces.push(...word.pieces.map((piece) => ({ ...piece })));
    line.width += word.width;
  }
  if (line.pieces.length > 0) lines.push(line);
  return lines;
}

/** Where the baseline sits in a line box `leading` tall, the letters centred in it. */
function baselineIn(face: PdfFace, size: number, lineHeight: number): number {
  const { ascent, descent } = FACE_METRICS[face];
  return (lineHeight - (ascent + descent) * size) / 2 + ascent * size;
}

/**
 * One line, drawn: each stretch of one style as one string, measured whole
 * where it is placed; a link underlined and made a link; a box for each
 * character no face has.
 */
function lineItems(ctx: Ctx, line: Line, x: number, top: number, size: number, lineHeight: number, ink: string): PdfItem[] {
  const items: PdfItem[] = [];
  // Neighbouring pieces in the same style are one stretch.
  const stretches: Piece[] = [];
  for (const piece of line.pieces) {
    const last = stretches[stretches.length - 1];
    if (!piece.box && last && !last.box && last.face === piece.face && last.oblique === piece.oblique && last.link === piece.link) {
      last.text += piece.text;
    } else {
      stretches.push({ ...piece });
    }
  }
  const baseline = top + baselineIn("regular", size, lineHeight);
  let at = x;
  for (const stretch of stretches) {
    if (stretch.box) {
      const h = size * 0.7;
      items.push({ kind: "box", x: at + size * 0.08, y: baseline - h, w: stretch.width - size * 0.16, h, width: 0.6, ink: PRINT_INKS.muted, filled: false });
      at += stretch.width;
      continue;
    }
    const width = widthOf(ctx, stretch.text, stretch.face, size);
    const shown = stretch.text;
    if (shown.trim()) {
      items.push({
        kind: "text",
        x: at,
        y: baseline,
        text: shown,
        face: stretch.face,
        size,
        ink: stretch.link ? PRINT_INKS.link : ink,
        oblique: stretch.oblique,
      });
    }
    if (stretch.link) {
      const lead = shown.length - shown.trimStart().length;
      const trail = shown.length - shown.trimEnd().length;
      const from = at + (lead > 0 ? widthOf(ctx, shown.slice(0, lead), stretch.face, size) : 0);
      const to = at + width - (trail > 0 ? widthOf(ctx, shown.slice(shown.length - trail), stretch.face, size) : 0);
      if (to > from) {
        const under = baseline + PRINT_LOOK.underline.offset;
        items.push({ kind: "line", x1: from, y1: under, x2: to, y2: under, width: PRINT_LOOK.underline.width, ink: PRINT_INKS.link, dashed: false });
        items.push({ kind: "link", x: from, y: top, w: to - from, h: lineHeight, url: stretch.link });
      }
    }
    at += width;
  }
  return items;
}

/** A quote's bar beside an atom: down its height, and up through the gap above it unless it opens the quote or a page. */
function withBar(frame: Frame, atom: Atom, opensQuote: boolean): Atom {
  const bar = frame.bar;
  if (!bar) return atom;
  return {
    ...atom,
    repeat: atom.repeat ? withBar(frame, atom.repeat, false) : undefined,
    items(top, atPageTop) {
      const from = atPageTop || opensQuote ? top : top - atom.gapBefore;
      const half = PRINT_LOOK.quote.bar / 2;
      return [
        { kind: "line", x1: bar.x + half, y1: from, x2: bar.x + half, y2: top + atom.height, width: PRINT_LOOK.quote.bar, ink: PRINT_INKS.bar, dashed: false },
        ...atom.items(top, atPageTop),
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Blocks into atoms
// ---------------------------------------------------------------------------

type Build = { ctx: Ctx; groups: string[]; block: number };

/**
 * Lines of text as atoms. The paragraph is kept whole when it fits on a page
 * (it is a group of its own); one longer than a page keeps two lines either
 * side of a break. `leads` keeps its last line with what follows.
 */
function paragraphAtoms(b: Build, frame: Frame, runs: readonly Run[], gapBefore: number, leads = false): Atom[] {
  const { size, leading } = PRINT_LOOK.body;
  const lineHeight = size * leading;
  const lines = breakLines(b.ctx, runs, size, frame.width);
  return lines.map((line, i) => ({
    height: lineHeight,
    gapBefore: i === 0 ? gapBefore : 0,
    glueNext: i < lines.length - 1 ? lines.length <= 3 || i === 0 || i === lines.length - 2 : leads,
    groups: b.groups,
    mark: { kind: "line", block: b.block },
    items: (top: number) => lineItems(b.ctx, line, frame.x, top, size, lineHeight, PRINT_INKS.text),
  }));
}

/**
 * A list's lines, or a list of boxes to tick: each item whole (its lines
 * glued), its marker on its first line. `marker` is "•", "3." or a box.
 */
function itemAtoms(
  b: Build,
  frame: Frame,
  items: readonly { runs: readonly Run[]; checked?: true }[],
  marker: (index: number) => string | "box",
  gapBefore: number,
): Atom[] {
  const { size, leading } = PRINT_LOOK.body;
  const lineHeight = size * leading;
  const labels = items.map((_, i) => marker(i));
  const markerWidth = Math.max(
    0,
    ...labels.map((label) => (label === "box" ? PRINT_LOOK.checkbox.size : widthOf(b.ctx, label, "regular", size))),
  );
  const indent = markerWidth + (labels[0] === "box" ? PRINT_LOOK.checkbox.gap : PRINT_LOOK.list.markerGap);
  const out: Atom[] = [];
  items.forEach((item, index) => {
    const lines = breakLines(b.ctx, item.runs, size, frame.width - indent);
    const label = labels[index];
    lines.forEach((line, i) => {
      out.push({
        height: lineHeight,
        gapBefore: i > 0 ? 0 : index === 0 ? gapBefore : PRINT_LOOK.list.itemGap,
        glueNext: i < lines.length - 1,
        groups: b.groups,
        mark: { kind: "item", block: b.block, row: index },
        items: (top: number) => {
          const drawn = lineItems(b.ctx, line, frame.x + indent, top, size, lineHeight, PRINT_INKS.text);
          if (i > 0) return drawn;
          if (label === "box") {
            const box = PRINT_LOOK.checkbox.size;
            const centre = top + baselineIn("regular", size, lineHeight) - size * 0.35;
            drawn.unshift({ kind: "box", x: frame.x, y: centre - box / 2, w: box, h: box, width: 0.9, ink: PRINT_INKS.muted, filled: item.checked === true });
          } else {
            const baseline = top + baselineIn("regular", size, lineHeight);
            drawn.unshift({ kind: "text", x: frame.x, y: baseline, text: label, face: "regular", size, ink: PRINT_INKS.text, oblique: false });
          }
          return drawn;
        },
      });
    });
  });
  return out;
}

/** A dashed frame: a line to cut along. */
function cutFrame(x: number, y: number, w: number, h: number): PdfItem[] {
  const line = (x1: number, y1: number, x2: number, y2: number): PdfLine => ({ kind: "line", x1, y1, x2, y2, width: PRINT_LOOK.cut.width, ink: PRINT_INKS.cut, dashed: true });
  return [line(x, y, x + w, y), line(x + w, y, x + w, y + h), line(x + w, y + h, x, y + h), line(x, y + h, x, y)];
}

/**
 * A table: each row a card in its own dashed frame, its cells' text wrapped
 * in columns sized to what they hold, the header's words in the heavier
 * weight. The header row is kept on the page of the row after it, and drawn
 * again at the top of each page the table runs on to (`repeat`), so a row
 * there leaves room for it; a row is never split unless it is taller than a
 * page.
 */
function tableAtoms(b: Build, frame: Frame, header: readonly TableCell[], rows: readonly { cells: readonly TableCell[] }[], gapBefore: number): Atom[] {
  const { size, leading, padX, padY } = PRINT_LOOK.table;
  const lineHeight = size * leading;
  const all = [{ cells: header, head: true }, ...rows.map((row) => ({ cells: row.cells, head: false }))];
  const columns = header.length;

  // Each column's narrowest (its longest word) and widest (its longest cell on one line).
  const least = new Array<number>(columns).fill(0);
  const most = new Array<number>(columns).fill(0);
  for (const row of all) {
    for (let c = 0; c < columns; c += 1) {
      const words = wordsOf(b.ctx, row.cells[c]?.runs ?? [], size, row.head);
      const spaces = words.slice(1).reduce((n, word) => n + (word.space ? widthOf(b.ctx, " ", word.space.face, size) : 0), 0);
      least[c] = Math.max(least[c], ...words.map((word) => word.width));
      most[c] = Math.max(most[c], words.reduce((n, word) => n + word.width, 0) + spaces);
    }
  }
  // One point over each, for the hair the line breaker keeps in hand, so a
  // column at its narrowest still holds its longest word whole.
  const pad = 2 * padX + 1;
  const lo = least.map((w) => w + pad);
  const hi = most.map((w, c) => Math.max(w + pad, lo[c]));
  const sumLo = lo.reduce((a, n) => a + n, 0);
  const sumHi = hi.reduce((a, n) => a + n, 0);
  const room = frame.width;
  let widths: number[];
  if (sumHi <= room) widths = hi.map((w) => w + ((room - sumHi) * w) / sumHi);
  else if (sumLo >= room) widths = lo.map((w) => (w * room) / sumLo);
  else widths = lo.map((w, c) => w + ((hi[c] - lo[c]) * (room - sumLo)) / (sumHi - sumLo));
  const lefts = widths.map((_, c) => frame.x + widths.slice(0, c).reduce((a, n) => a + n, 0));

  const atoms: Atom[] = [];
  // The header row as drawn again at the top of a page the table runs on to:
  // a header of one slice, and no taller than a quarter of a page, so a row
  // always has room under it.
  let headerAgain: Atom | null = null;
  all.forEach((row, r) => {
    const cells = Array.from({ length: columns }, (_, c) =>
      breakLines(b.ctx, row.cells[c]?.runs ?? [], size, Math.max(1, widths[c] - 2 * padX), row.head),
    );
    const tallest = Math.max(1, ...cells.map((lines) => lines.length));
    // A row taller than a page is cut into slices of whole lines, each leaving
    // room for the header drawn again above it; any other row is one slice.
    const tallestSlice = CONTENT_HEIGHT - 2 * padY - (headerAgain ? headerAgain.height : 0);
    const slices = pieces(tallest, Math.max(1, Math.floor(tallestSlice / lineHeight)));
    slices.forEach(([from, to], part) => {
      const height = (to - from) * lineHeight + 2 * padY;
      const atom: Atom = {
        height,
        gapBefore: r === 0 && part === 0 ? gapBefore : 0,
        glueNext: row.head && r < all.length - 1,
        groups: b.groups,
        mark: slices.length > 1 ? { kind: "row", block: b.block, row: r, part } : { kind: "row", block: b.block, row: r },
        repeat: headerAgain ?? undefined,
        items: (top: number) => {
          const items: PdfItem[] = [];
          for (let c = 1; c < columns; c += 1) {
            items.push({ kind: "line", x1: lefts[c], y1: top, x2: lefts[c], y2: top + height, width: PRINT_LOOK.rule, ink: PRINT_INKS.rule, dashed: false });
          }
          items.push(...cutFrame(frame.x, top, room, height));
          cells.forEach((lines, c) => {
            lines.slice(from, to).forEach((line, i) => {
              items.push(...lineItems(b.ctx, line, lefts[c] + padX, top + padY + i * lineHeight, size, lineHeight, PRINT_INKS.text));
            });
          });
          return items;
        },
      };
      atoms.push(atom);
      if (row.head && slices.length === 1 && height <= CONTENT_HEIGHT / 4) {
        headerAgain = {
          ...atom,
          gapBefore: 0,
          glueNext: false,
          repeat: undefined,
          items: (top, atPageTop) => atom.items(top, atPageTop).map((item) => (item.kind === "text" ? { ...item, extra: "header-again" } : item)),
        };
      }
    });
  });
  return atoms;
}

/** A template's lines as written: tabs to the next stop of eight, each character one column. */
function templateLines(text: string): string[][] {
  return text.split("\n").map((raw) => {
    const cells: string[] = [];
    for (const ch of drawableText(raw)) {
      if (ch === "\t") {
        do cells.push(" ");
        while (cells.length % TAB_STOP !== 0);
      } else if (ch !== "\n") {
        cells.push(ch);
      }
    }
    return cells;
  });
}

/**
 * A template (a code block): a form people write on, in the monospace face
 * with every space kept, inside a dashed frame. Its size is the look's, or
 * smaller until its widest line fits the frame; a line too wide even at the
 * smallest size continues on the next line, so nothing is ever cut off. Kept
 * whole on a page; one taller than a page goes on in a frame of its own.
 */
function templateAtoms(b: Build, frame: Frame, text: string, gapBefore: number): Atom[] {
  const { size: largest, minSize, leading, padX, padY } = PRINT_LOOK.template;
  const inner = frame.width - 2 * padX;
  const lines = templateLines(text);
  const columnAt1 = widthOf(b.ctx, "0", "mono", 1);
  const widest = Math.max(1, ...lines.map((cells) => cells.length));
  const size = Math.max(minSize, Math.min(largest, inner / (widest * columnAt1)));
  const column = columnAt1 * size;
  const fits = Math.max(1, Math.floor((inner + 0.01) / column));
  // A line wider than the frame at the smallest size goes on below itself.
  const rows: string[][] = [];
  for (const cells of lines) {
    if (cells.length <= fits) rows.push(cells);
    else for (let at = 0; at < cells.length; at += fits) rows.push(cells.slice(at, at + fits));
  }
  const lineHeight = size * leading;
  const chunks = pieces(rows.length, Math.max(1, Math.floor((CONTENT_HEIGHT - 2 * padY) / lineHeight))).map(([from, to]) => rows.slice(from, to));
  return chunks.map((chunk, part) => {
    const height = chunk.length * lineHeight + 2 * padY;
    return {
      height,
      gapBefore: part === 0 ? gapBefore : 0,
      glueNext: false,
      groups: b.groups,
      mark: chunks.length > 1 ? { kind: "template", block: b.block, part } : { kind: "template", block: b.block },
      items: (top: number) => {
        const items: PdfItem[] = [...cutFrame(frame.x, top, frame.width, height)];
        const baseline0 = top + padY + baselineIn("mono", size, lineHeight);
        chunk.forEach((cells, i) => {
          items.push(...templateLineItems(b.ctx, cells, frame.x + padX, baseline0 + i * lineHeight, size, column));
        });
        return items;
      },
    };
  });
}

/**
 * One line of a template: the whole line as one string in the monospace
 * face, its spaces with it, so every column falls where it is written. A
 * character only the text face has is drawn centred in its column; one no
 * face has is a box the width of its column.
 */
function templateLineItems(ctx: Ctx, cells: readonly string[], x: number, baseline: number, size: number, column: number): PdfItem[] {
  const items: PdfItem[] = [];
  let run = "";
  let runStart = 0;
  const flush = (end: number) => {
    if (run.trim()) items.push({ kind: "text", x: x + runStart * column, y: baseline, text: run, face: "mono", size, ink: PRINT_INKS.text, oblique: false });
    run = "";
    runStart = end;
  };
  cells.forEach((ch, i) => {
    const drawn = drawnAs("mono", ch);
    if (drawn.kind === "face" && drawn.face === "mono") {
      if (!run) runStart = i;
      run += drawn.ch;
      return;
    }
    flush(i + 1);
    if (drawn.kind === "box") {
      if (!ctx.undrawable.includes(ch)) ctx.undrawable.push(ch);
      const h = size * 0.7;
      items.push({ kind: "box", x: x + i * column + size * 0.08, y: baseline - h, w: column - size * 0.16, h, width: 0.6, ink: PRINT_INKS.muted, filled: false });
    } else {
      const width = widthOf(ctx, drawn.ch, "regular", size);
      items.push({ kind: "text", x: x + i * column + (column - width) / 2, y: baseline, text: drawn.ch, face: "regular", size, ink: PRINT_INKS.text, oblique: false });
    }
    runStart = i + 1;
  });
  flush(cells.length);
  return items;
}

/** A heading: one atom, kept with what follows it. */
function headingAtom(b: Build, frame: Frame, runs: readonly Run[], level: 2 | 3 | 4 | 5 | 6, gapBefore: number): Atom {
  const look = PRINT_LOOK.heading[level === 2 ? 2 : level === 3 ? 3 : 4];
  const lineHeight = look.size * look.leading;
  const lines = breakLines(b.ctx, runs, look.size, frame.width, true);
  return {
    height: Math.max(1, lines.length) * lineHeight,
    gapBefore,
    glueNext: true,
    groups: b.groups,
    mark: { kind: "heading", block: b.block },
    items: (top) => lines.flatMap((line, i) => lineItems(b.ctx, line, frame.x, top + i * lineHeight, look.size, lineHeight, PRINT_INKS.text)),
  };
}

/**
 * Does this paragraph lead into what follows it? A paragraph wholly in bold
 * ("Rules for Blue", "Task cards, round 1") labels the block after it, as a
 * heading would, and one ending in a colon introduces it; neither is left at
 * the foot of a page without it.
 */
export function leadsIntoNext(runs: readonly Run[]): boolean {
  const text = runs.map((run) => run.text).join("").trim();
  if (!text) return false;
  return runs.every((run) => run.bold === true || !run.text.trim()) || text.endsWith(":");
}

/** Prose (a paragraph, a list, a table, a template) inside a frame. `leadsOn` says a block follows the last of it. */
function proseAtoms(b: Build, frame: Frame, prose: readonly ProseParagraph[], gapBefore: number, leadsOn = false): Atom[] {
  const out: Atom[] = [];
  prose.forEach((p, i) => {
    const gap = i === 0 ? gapBefore : PRINT_LOOK.blockGap;
    const more = i < prose.length - 1 || leadsOn;
    if (p.type === "p") out.push(...paragraphAtoms(b, frame, p.runs, gap, more && leadsIntoNext(p.runs)));
    else if (p.type === "ul" || p.type === "ol") out.push(...itemAtoms(b, frame, p.items, (index) => listMarker(p.type as "ul" | "ol", index), gap));
    else if (p.type === "table") out.push(...tableAtoms(b, frame, p.header, p.rows, gap));
    else out.push(...templateAtoms(b, frame, p.text, gap));
  });
  return out;
}

/** A quote: its prose set in from the left, with a bar beside it down its whole length. */
function quoteAtoms(b: Build, frame: Frame, body: Prose, gapBefore: number): Atom[] {
  const { indent } = PRINT_LOOK.quote;
  const inner: Frame = { x: frame.x + indent, width: frame.width - indent, bar: { x: frame.x } };
  return proseAtoms(b, inner, body, gapBefore).map((atom, i) => withBar(inner, atom, i === 0));
}

/** Every block of the document as atoms, in order, each in the "##" section and "###" part it sits in. */
function documentAtoms(ctx: Ctx, doc: GuideDocument): Atom[] {
  const frame: Frame = { x: LEFT, width: CONTENT_WIDTH, bar: null };
  const atoms: Atom[] = [];
  const title = PRINT_LOOK.title;
  const titleLine = title.size * title.leading;
  const titleLines = breakLines(ctx, [{ text: doc.title }], title.size, frame.width, true);
  atoms.push({
    height: Math.max(1, titleLines.length) * titleLine,
    gapBefore: 0,
    glueNext: true,
    groups: [],
    mark: { kind: "title", block: -1 },
    items: (top) => titleLines.flatMap((line, i) => lineItems(ctx, line, frame.x, top + i * titleLine, title.size, titleLine, PRINT_INKS.text)),
  });

  let section = 0;
  let part = 0;
  let groups: string[] = [];
  let afterHeading = true;
  doc.blocks.forEach((block: GuideBlock, index) => {
    const gap = afterHeading ? PRINT_LOOK.afterHeading : PRINT_LOOK.blockGap;
    if (block.type === "heading") {
      if (block.level === 2) {
        section += 1;
        part = 0;
        groups = [`s${section}`];
      } else if (block.level === 3) {
        part += 1;
        groups = [`s${section}`, `s${section}.${part}`];
      }
      const look = PRINT_LOOK.heading[block.level === 2 ? 2 : block.level === 3 ? 3 : 4];
      atoms.push(headingAtom({ ctx, groups, block: index }, frame, block.runs, block.level, look.gapBefore));
      afterHeading = true;
      return;
    }
    // The block is a group of its own, inside its section and part: kept
    // whole on a page when it fits on one.
    const b: Build = { ctx, groups: [...groups, `b${index}`], block: index };
    const next = doc.blocks[index + 1];
    const followed = next !== undefined && next.type !== "heading";
    if (block.type === "quote") atoms.push(...quoteAtoms(b, frame, block.body, gap));
    else if (block.type === "checklist") atoms.push(...itemAtoms(b, frame, block.items as readonly GuideCheckItem[], () => "box", gap));
    else atoms.push(...proseAtoms(b, frame, [block], gap, followed));
    afterHeading = false;
  });
  return atoms;
}

// ---------------------------------------------------------------------------
// Atoms onto pages
// ---------------------------------------------------------------------------

/**
 * Places the atoms on pages, in order. What must stay on one page with an
 * atom (`keepNeed`) is the outermost group starting at it that fits on a page
 * of its own (a "##" section, a "###" part, a block), and then whatever is
 * glued to the end of that, the same way. When that does not fit on what is
 * left of this page but would fit on an empty one, it starts the next page;
 * otherwise the atom goes where it fits, or on the next page. A row of a table
 * that starts a page has its table's header drawn again above it: the row was
 * cut to leave room for it (`tableAtoms`).
 */
function paginate(atoms: readonly Atom[]): { pages: PdfItem[][]; placed: PlacedMark[]; groups: PlacedGroup[] } {
  // Where each group ends.
  const ends = new Map<string, number>();
  atoms.forEach((atom, i) => {
    for (const group of atom.groups) ends.set(group, i);
  });
  const starts = new Set<string>();
  /** The groups starting at atom `i`, outermost first. */
  const startingAt = atoms.map((atom) =>
    atom.groups.filter((group) => {
      if (starts.has(group)) return false;
      starts.add(group);
      return true;
    }),
  );
  /** How much room atoms `from` to `to` take, with the gap above the first. */
  const tall = (from: number, to: number) => {
    let h = 0;
    for (let k = from; k <= to; k += 1) h += atoms[k].gapBefore + atoms[k].height;
    return h;
  };
  const needs = new Map<number, number>();
  /** The room that has to be left on this page for atom `i` to stay on it, with the gap above it. */
  const keepNeed = (i: number): number => {
    const known = needs.get(i);
    if (known !== undefined) return known;
    let end = i;
    for (const group of startingAt[i]) {
      const last = ends.get(group) as number;
      if (tall(i, last) - atoms[i].gapBefore <= CONTENT_HEIGHT) {
        end = Math.max(end, last);
        break;
      }
    }
    let need = tall(i, end);
    if (atoms[end].glueNext && end + 1 < atoms.length) need += keepNeed(end + 1);
    needs.set(i, need);
    return need;
  };
  // Asked from the last atom back, so no chain of glue is followed twice.
  for (let i = atoms.length - 1; i >= 0; i -= 1) keepNeed(i);

  const pages: PdfItem[][] = [[]];
  const placed: PlacedMark[] = [];
  /** The page each atom went on, by the atom's place in `atoms`. */
  const pageOf: number[] = [];
  let y = TOP;
  let atTop = true;
  const newPage = () => {
    pages.push([]);
    y = TOP;
    atTop = true;
  };

  atoms.forEach((atom, i) => {
    if (!atTop) {
      const need = keepNeed(i);
      if (y + need > BOTTOM && need - atom.gapBefore <= CONTENT_HEIGHT) newPage();
    }
    if (!atTop && y + atom.gapBefore + atom.height > BOTTOM) newPage();
    // The table runs on to this page: its header row first.
    if (atTop && atom.repeat) {
      const head = atom.repeat;
      pages[pages.length - 1].push(...head.items(TOP, true));
      placed.push({ ...head.mark, repeated: true, groups: atom.groups, page: pages.length - 1, top: TOP, bottom: TOP + head.height });
      y = TOP + head.height;
      atTop = false;
    }
    const top = y + (atTop ? 0 : atom.gapBefore);
    pages[pages.length - 1].push(...atom.items(top, atTop));
    placed.push({ ...atom.mark, groups: atom.groups, page: pages.length - 1, top, bottom: top + atom.height });
    pageOf.push(pages.length - 1);
    y = top + atom.height;
    atTop = false;
  });
  const groups: PlacedGroup[] = [];
  atoms.forEach((atom, i) => {
    for (const id of startingAt[i]) {
      const last = ends.get(id) as number;
      const on = new Set(pageOf.slice(i, last + 1));
      groups.push({ id, height: tall(i, last) - atom.gapBefore, pages: [...on].sort((a, b) => a - b) });
    }
  });
  return { pages, placed, groups };
}

/**
 * "Page 2 of 5", small and muted, centred in the bottom margin, below
 * everything the page holds, so it moves nothing.
 */
function pageNumber(ctx: Ctx, page: number, pages: number): PdfText {
  const { size } = PRINT_LOOK.pageNumber;
  const text = pageOfWords(page, pages);
  const box = size * 1.2;
  const top = BOTTOM + (PAGE.margin - box) / 2;
  return {
    kind: "text",
    x: (PAGE.width - widthOf(ctx, text, "regular", size)) / 2,
    y: top + baselineIn("regular", size, box),
    text,
    face: "regular",
    size,
    ink: PRINT_INKS.muted,
    oblique: false,
    extra: "page-number",
  };
}

/**
 * A printables document laid out on A4 pages: what each page draws, the
 * document's strings and what the layout adds, and where everything went.
 * A PDF of more than one page numbers its pages; one of a page does not.
 */
export function layoutPrintables(doc: GuideDocument, measure: Measure): PrintablesLayout {
  const ctx: Ctx = { measure, cache: new Map(), undrawable: [] };
  const atoms = documentAtoms(ctx, doc);
  const { pages, placed, groups } = paginate(atoms);
  if (pages.length > 1) pages.forEach((items, index) => items.push(pageNumber(ctx, index + 1, pages.length)));
  const texts = pages.flatMap((items) => items.flatMap((item) => (item.kind === "text" ? [item] : [])));
  return {
    pages,
    drawn: texts.filter((item) => !item.extra).map((item) => item.text),
    extras: texts.filter((item) => item.extra).map((item) => item.text),
    undrawable: [...ctx.undrawable],
    placed,
    groups,
  };
}
