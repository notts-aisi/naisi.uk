import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { EMBLEM_BOX, EMBLEM_CASTLE, EMBLEM_SHIELD, EMBLEM_WAVE } from "./emblem";
import type { CertificateFaceView } from "./face";
import { CERTIFICATE_INKS as INK, CERTIFICATE_SIZES as SIZE, EMBLEM_INKS } from "./look";
import { LOCKUP_LINES, PDF_FONTS, pdfItems, type PdfFont, type PdfItem, type PdfText } from "./pdfLayout";

/**
 * A CERTIFICATE AS A PDF: an A4 page, landscape, drawn from the same view of
 * the certificate as its page (`pdfLayout.ts`), in the same inks and at the
 * laptop board's sizes, one pixel to one point.
 *
 * WHAT PDFKIT IS GIVEN, and nothing else: the words of the certificate, as
 * text; the house's own fonts, read from `fonts/` beside this file; and the
 * emblem's outlines (`emblem.ts`). It never parses a font or a picture that
 * came from a request. The document is built with Space Grotesk as its
 * first font, so PDFKit never loads one of its own (it reads its built-in
 * Helvetica only when no font is given), and it is not a PDF/A, so PDFKit
 * never reads its colour profile either.
 *
 * THE FONTS (`fonts/`, each under the SIL Open Font License 1.1, whose text
 * sits beside it): Space Grotesk at weights 400 and 600, made as two plain
 * fonts from the variable font Google Fonts publishes (ofl/spacegrotesk),
 * because PDFKit tells fonts apart by their PostScript name and every weight
 * of one variable font has the same; and Space Mono Regular, as Google Fonts
 * publishes it (ofl/spacemono). On a page the certificate's two lines of
 * running text are set in the site's body face; here they are set in Space
 * Grotesk, so the PDF carries the brand's two faces and no third.
 *
 * PDFKit stays outside the server bundle (`serverExternalPackages` in
 * next.config.ts), and the fonts are traced into the build for every route
 * that reads them (`outputFileTracingIncludes`): a certificate's and a
 * course's printables' (`tests/course-hub-certificates-pdf.test.mjs` walks
 * the tree for them).
 */

/** Where the fonts are read from: the project's root on a laptop, the standalone build's root when deployed. */
export const CERTIFICATE_FONT_DIR = join(process.cwd(), "src", "lib", "courses", "certificates", "fonts");

const FONT_FILES: Record<PdfFont, string> = {
  "SpaceGrotesk-Regular": "SpaceGrotesk-Regular.ttf",
  "SpaceGrotesk-SemiBold": "SpaceGrotesk-SemiBold.ttf",
  "SpaceMono-Regular": "SpaceMono-Regular.ttf",
};

let fontCache: Map<PdfFont, Buffer> | null = null;

/** The three fonts, read once per server. */
function fonts(): Map<PdfFont, Buffer> {
  if (!fontCache) {
    fontCache = new Map(PDF_FONTS.map((name) => [name, readFileSync(join(CERTIFICATE_FONT_DIR, FONT_FILES[name]))]));
  }
  return fontCache;
}

/** A4, landscape, in points. */
const PAGE = { width: 841.89, height: 595.28 } as const;
/** The certificate's edge and its inner frame, in from the page's edge. */
const EDGE_INSET = 16;
/** The column the words are centred in. */
const COLUMN = SIZE.width - 2 * SIZE.padding.side;

type Doc = InstanceType<typeof PDFDocument>;

/** The height of a line box of `lineHeight` times the size, and where the font's own letters sit in it. */
function lineBox(doc: Doc, item: Pick<PdfText, "font" | "size" | "lineHeight">) {
  doc.font(item.font).fontSize(item.size);
  const box = item.size * item.lineHeight;
  const content = doc.currentLineHeight(false);
  // As a browser does: the letters are centred in their line box.
  return { box, offset: (box - content) / 2, gap: box - doc.currentLineHeight(true) };
}

function textOptions(doc: Doc, item: PdfText) {
  const { gap } = lineBox(doc, item);
  return {
    width: item.measure ?? COLUMN,
    align: "center" as const,
    characterSpacing: item.tracking * item.size,
    lineGap: gap,
  };
}

/** How tall a text item stands: its lines, each a line box. */
function heightOf(doc: Doc, item: PdfText): number {
  const { box } = lineBox(doc, item);
  const options = textOptions(doc, item);
  const one = doc.currentLineHeight(true) + options.lineGap;
  const lines = Math.max(1, Math.round((doc.heightOfString(item.text, options) + options.lineGap) / one));
  return lines * box;
}

function markHeight(item: PdfItem): number {
  return item.kind === "rule" ? SIZE.rule.height : item.kind === "divider" ? 1 : 0;
}

/** The emblem at `height` points tall, its box's corner at (x, y): the cyan copy first, then the white. */
function drawEmblem(doc: Doc, x: number, y: number, height: number) {
  const k = height / EMBLEM_BOX.h;
  doc.save();
  doc.translate(x - EMBLEM_BOX.x * k, y - EMBLEM_BOX.y * k).scale(k);
  for (const [ink, shift] of [
    [EMBLEM_INKS.echo, EMBLEM_BOX.shift],
    [EMBLEM_INKS.face, 0],
  ] as const) {
    doc.save();
    doc.translate(-shift, shift);
    for (const outline of [EMBLEM_CASTLE, EMBLEM_SHIELD, EMBLEM_WAVE]) doc.path(outline).fill(ink, "even-odd");
    doc.restore();
  }
  doc.restore();
}

/** The full name beside the emblem; returns how tall the lockup stands. */
function drawLockup(doc: Doc, top: number, drawn: string[]): number {
  const emblemWidth = (SIZE.emblem * EMBLEM_BOX.w) / EMBLEM_BOX.h;
  const line = { font: "SpaceGrotesk-SemiBold" as const, size: SIZE.lockupName, lineHeight: 1.04 };
  const { box, offset } = lineBox(doc, line);
  const spacing = -0.01 * line.size;
  const nameWidth = Math.max(...LOCKUP_LINES.map((words) => doc.widthOfString(words, { characterSpacing: spacing })));
  const left = (PAGE.width - (emblemWidth + SIZE.lockupGap + nameWidth)) / 2;
  drawEmblem(doc, left, top, SIZE.emblem);
  const nameTop = top + (SIZE.emblem - box * LOCKUP_LINES.length) / 2;
  doc.fillColor(INK.text);
  LOCKUP_LINES.forEach((words, i) => {
    doc.text(words, left + emblemWidth + SIZE.lockupGap, nameTop + i * box + offset, {
      lineBreak: false,
      characterSpacing: spacing,
    });
    drawn.push(words);
  });
  return SIZE.emblem;
}

function drawText(doc: Doc, item: PdfText, top: number, drawn: string[]) {
  const { offset } = lineBox(doc, item);
  const options = textOptions(doc, item);
  const width = options.width;
  const x = (PAGE.width - width) / 2;
  if (item.ink === "programme") {
    // The programme's gradient runs across the words themselves, left to right.
    const span = Math.min(width, doc.widthOfString(item.text, { characterSpacing: options.characterSpacing }));
    const from = (PAGE.width - span) / 2;
    const gradient = doc.linearGradient(from, top, from + span, top + item.size * item.lineHeight);
    INK.programme.forEach((ink, i) => gradient.stop(INK.programmeStops[i], ink));
    doc.fillColor(gradient);
  } else {
    doc.fillColor(item.ink);
  }
  doc.text(item.text, x, top + offset, options);
  drawn.push(item.text);
}

function drawMark(doc: Doc, item: PdfItem, top: number) {
  if (item.kind === "rule") {
    doc.save();
    doc.fillOpacity(0.85);
    doc
      .roundedRect((PAGE.width - SIZE.rule.width) / 2, top, SIZE.rule.width, SIZE.rule.height, SIZE.rule.height / 2)
      .fill(INK.cyan);
    doc.restore();
    return;
  }
  if (item.kind === "divider") {
    const left = (PAGE.width - SIZE.dividerWidth) / 2;
    const gradient = doc.linearGradient(left, top, left + SIZE.dividerWidth, top);
    gradient.stop(0, INK.edge, 0).stop(0.2, INK.edge, 1).stop(0.8, INK.edge, 1).stop(1, INK.edge, 0);
    doc.rect(left, top, SIZE.dividerWidth, 1).fill(gradient);
  }
}

/** The navy ground, its edge and its frame: the whole page is the certificate. */
function drawGround(doc: Doc) {
  // An ellipse 75% of the page wide and 60% of it tall, from the top
  // centre: a circle, drawn with the page squeezed top to bottom.
  const rx = PAGE.width * 0.75;
  const squeeze = (PAGE.height * 0.6) / rx;
  doc.save();
  doc.scale(1, squeeze);
  const ground = doc.radialGradient(PAGE.width / 2, 0, 0, PAGE.width / 2, 0, rx);
  INK.ground.forEach((ink, i) => ground.stop(INK.groundStops[i], ink));
  doc.rect(0, 0, PAGE.width, PAGE.height / squeeze).fill(ground);
  doc.restore();
  doc.lineWidth(1);
  doc
    .roundedRect(EDGE_INSET, EDGE_INSET, PAGE.width - 2 * EDGE_INSET, PAGE.height - 2 * EDGE_INSET, SIZE.radius)
    .stroke(INK.edge);
  const frame = EDGE_INSET + SIZE.frameInset;
  doc
    .roundedRect(frame, frame, PAGE.width - 2 * frame, PAGE.height - 2 * frame, SIZE.frameRadius)
    .stroke(INK.frame);
}

/** A PDF as PDFKit makes it, for a drawing opened by `openHousePdf`. */
export type HousePdf = Doc;

/**
 * A NEW A4 PDF IN THE HOUSE'S FONTS, for a drawing other than a
 * certificate's (a course's printables, `src/lib/courses/facilitatorGuide/
 * printablesPdf.ts`). PDFKit is imported in this file and no other, so every
 * PDF the site makes is opened through here, as a certificate is: no margins
 * (the drawing places everything itself), the three fonts registered under
 * their own names (`PDF_FONTS`), Space Grotesk as its first font so PDFKit
 * never reaches for one of its own, its language said for screen readers,
 * and NAISI as its author, creator and producer. `bytes` settles once the
 * drawing calls `doc.end()`.
 */
export function openHousePdf(options: { layout: "portrait" | "landscape"; title: string }): { doc: HousePdf; bytes: Promise<Buffer> } {
  const files = fonts();
  const doc = new PDFDocument({
    size: "A4",
    layout: options.layout,
    margin: 0,
    // PDFKit takes a font's bytes here as it takes a path; its types name only the path.
    font: files.get("SpaceGrotesk-Regular") as unknown as string,
    lang: "en-GB",
    displayTitle: true,
    info: { Title: options.title, Author: "NAISI", Creator: "NAISI", Producer: "NAISI" },
  });
  for (const name of PDF_FONTS) doc.registerFont(name, files.get(name) as Buffer);
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, bytes };
}

export type CertificatePdf = {
  bytes: Buffer;
  /** Every string handed to PDFKit as text, in the order it was drawn. */
  drawn: string[];
};

/** The PDF of one certificate, from its drawing's view. `issuedAt` dates the file. */
export function renderCertificatePdf(face: CertificateFaceView, issuedAt: Date | null): Promise<CertificatePdf> {
  const files = fonts();
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    // Our own first font, so PDFKit never reaches for one of its own.
    // PDFKit takes a font's bytes here as it takes a path; its types name
    // only the path.
    font: files.get("SpaceGrotesk-Regular") as unknown as string,
    info: {
      Title: face.label,
      Author: "NAISI",
      Creator: "NAISI",
      Producer: "NAISI",
      ...(issuedAt ? { CreationDate: issuedAt } : {}),
    },
  });
  for (const name of PDF_FONTS) doc.registerFont(name, files.get(name) as Buffer);

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const drawn: string[] = [];
  const items = pdfItems(face);
  // Centred on the page as a whole: the lockup, then each item and the space above it.
  const tall =
    SIZE.emblem +
    items.reduce((sum, item) => sum + item.gap + (item.kind === "text" ? heightOf(doc, item) : markHeight(item)), 0);

  drawGround(doc);
  let y = (PAGE.height - tall) / 2;
  y += drawLockup(doc, y, drawn);
  for (const item of items) {
    y += item.gap;
    if (item.kind === "text") {
      const height = heightOf(doc, item);
      drawText(doc, item, y, drawn);
      y += height;
    } else {
      drawMark(doc, item, y);
      y += markHeight(item);
    }
  }
  doc.end();
  return finished.then((bytes) => ({ bytes, drawn }));
}
