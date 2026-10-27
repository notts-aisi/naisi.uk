import "server-only";

import { openHousePdf, type HousePdf } from "@/lib/courses/certificates/pdf";
import type { PdfFont } from "@/lib/courses/certificates/pdfLayout";
import type { GuideDocument } from "./model";
import { PRINT_LOOK, layoutPrintables, type Measure, type PdfFace, type PdfItem, type PrintablesLayout } from "./printablesLayout";

/**
 * A COURSE'S PRINTABLES AS A PDF: one session's, or the whole document's,
 * drawn on request from the stored Printables document and never stored. No
 * file is kept anywhere, so nothing goes stale when the printables are
 * loaded again, and there is nothing to delete.
 *
 * Where everything goes is decided by `printablesLayout.ts`; this file hands
 * it PDFKit's own measures of the house's fonts and draws what it decided,
 * item by item, and nothing else. PDFKit is reached only through the
 * certificates' door (`openHousePdf`), so the site has one PDF library, one
 * set of fonts and one place that opens a PDF.
 *
 * Server-only: the route `GET /api/courses/[courseId]/facilitator-guide/
 * printables/pdf` calls it after the guide's gate.
 */

/** Which of the house's fonts each face is. */
const FONT_OF: Record<PdfFace, PdfFont> = {
  regular: "SpaceGrotesk-Regular",
  bold: "SpaceGrotesk-SemiBold",
  mono: "SpaceMono-Regular",
};

/** The fonts as PDFKit measures them, for the layout. */
export function pdfMeasure(doc: HousePdf): Measure {
  return {
    width(text, face, size) {
      doc.font(FONT_OF[face]).fontSize(size);
      return doc.widthOfString(text);
    },
  };
}

/** One page's items, in order. */
function drawItems(doc: HousePdf, items: readonly PdfItem[]): void {
  for (const item of items) {
    switch (item.kind) {
      case "text":
        doc.font(FONT_OF[item.face]).fontSize(item.size).fillColor(item.ink);
        // Placed by its baseline, on one line, exactly where the layout put it.
        doc.text(item.text, item.x, item.y, { lineBreak: false, baseline: "alphabetic", oblique: item.oblique });
        break;
      case "line":
        doc.save();
        doc.lineWidth(item.width).strokeColor(item.ink);
        if (item.dashed) doc.dash(PRINT_LOOK.cut.dash, { space: PRINT_LOOK.cut.space });
        doc.moveTo(item.x1, item.y1).lineTo(item.x2, item.y2).stroke();
        doc.restore();
        break;
      case "box":
        doc.save();
        doc.lineWidth(item.width);
        if (item.filled) doc.rect(item.x, item.y, item.w, item.h).fillAndStroke(item.ink, item.ink);
        else doc.rect(item.x, item.y, item.w, item.h).stroke(item.ink);
        doc.restore();
        break;
      case "link":
        doc.link(item.x, item.y, item.w, item.h, item.url);
        break;
    }
  }
}

export type PrintablesPdf = {
  bytes: Buffer;
  /** Every string handed to PDFKit as text, in the order it was drawn. */
  drawn: string[];
  pages: number;
  /** Every character no house font has, drawn as a box. */
  undrawable: string[];
  /** Where everything went, as the layout decided it. */
  layout: PrintablesLayout;
};

/** The PDF of a printables document (a session's, from `printablesOfSession`, or the whole one), titled `title`. */
export async function renderPrintablesPdf(doc: GuideDocument, title: string): Promise<PrintablesPdf> {
  const { doc: pdf, bytes } = openHousePdf({ layout: "portrait", title });
  const layout = layoutPrintables(doc, pdfMeasure(pdf));
  layout.pages.forEach((items, index) => {
    if (index > 0) pdf.addPage();
    drawItems(pdf, items);
  });
  pdf.end();
  return { bytes: await bytes, drawn: layout.drawn, pages: layout.pages.length, undrawable: layout.undrawable, layout };
}
