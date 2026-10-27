import type { CertificateFaceView } from "./face";
import { CERTIFICATE_INKS as INK, CERTIFICATE_SIZES as SIZE, MONO_TRACKING } from "./look";

/**
 * WHAT THE PDF DRAWS, IN ORDER, from the same view of a certificate the page
 * draws (`faceOf`): so the PDF cannot say a word the page does not. Its
 * look is the page's (`look.ts`): the same inks, and the laptop board's
 * sizes, one pixel to one point.
 *
 * The lines set in the mono face are written in capitals here, because a
 * PDF has no stylesheet to do it; nothing else is changed.
 *
 * Pure: `pdf.ts` measures and draws these.
 */

/** The three fonts the PDF embeds, all the house's own (`fonts/`). */
export type PdfFont = "SpaceGrotesk-Regular" | "SpaceGrotesk-SemiBold" | "SpaceMono-Regular";

export const PDF_FONTS: readonly PdfFont[] = ["SpaceGrotesk-Regular", "SpaceGrotesk-SemiBold", "SpaceMono-Regular"];

/** The full name beside the emblem, on its three lines, as `BrandMark` sets it. */
export const LOCKUP_LINES = ["Nottingham", "AI Safety", "Initiative"] as const;

export type PdfText = {
  kind: "text";
  role: "eyebrow" | "name" | "did" | "programme" | "meta" | "issued" | "check";
  text: string;
  font: PdfFont;
  size: number;
  /** Space above it, from whatever was drawn before. */
  gap: number;
  /** An ink, or the programme's gradient. */
  ink: string | "programme";
  /** Letter spacing, in ems. */
  tracking: number;
  /** The line height, as a multiple of the size. */
  lineHeight: number;
  /** The widest a line may be, in points; null for the column's width. */
  measure: number | null;
};

export type PdfMark = { kind: "rule"; gap: number } | { kind: "divider"; gap: number };

export type PdfItem = PdfText | PdfMark;

const caps = (text: string) => text.toLocaleUpperCase("en-GB");

/** Everything under the lockup, top to bottom. The check line only when the face carries one. */
export function pdfItems(face: CertificateFaceView): PdfItem[] {
  const items: PdfItem[] = [{ kind: "rule", gap: SIZE.ruleGap }];
  let gap: number = SIZE.nameGap;
  if (face.eyebrow) {
    items.push({
      kind: "text",
      role: "eyebrow",
      text: caps(face.eyebrow),
      font: "SpaceMono-Regular",
      size: SIZE.eyebrow,
      gap: SIZE.eyebrowGap,
      ink: INK.cyan,
      tracking: MONO_TRACKING.eyebrow,
      lineHeight: 1.4,
      measure: null,
    });
  }
  items.push(
    {
      kind: "text",
      role: "name",
      text: face.name,
      font: "SpaceGrotesk-SemiBold",
      size: SIZE.name,
      gap,
      ink: INK.text,
      tracking: -0.025,
      lineHeight: 1.08,
      measure: null,
    },
    {
      kind: "text",
      role: "did",
      text: face.did,
      font: "SpaceGrotesk-Regular",
      size: SIZE.did,
      gap: SIZE.didGap,
      ink: INK.muted,
      tracking: 0,
      lineHeight: 1.4,
      measure: null,
    },
    {
      kind: "text",
      role: "programme",
      text: face.programme,
      font: "SpaceGrotesk-SemiBold",
      size: SIZE.programme,
      gap: SIZE.programmeGap,
      ink: "programme",
      tracking: -0.02,
      lineHeight: 1.15,
      measure: null,
    },
    {
      kind: "text",
      role: "meta",
      text: caps(face.meta),
      font: "SpaceMono-Regular",
      size: SIZE.meta,
      gap: SIZE.metaGap,
      ink: INK.soft,
      tracking: MONO_TRACKING.meta,
      lineHeight: 1.5,
      measure: null,
    },
    { kind: "divider", gap: SIZE.dividerGap },
    {
      kind: "text",
      role: "issued",
      text: face.issued,
      font: "SpaceGrotesk-Regular",
      size: SIZE.issued,
      gap: SIZE.issuedGap,
      ink: INK.soft,
      tracking: 0,
      lineHeight: 1.55,
      measure: SIZE.issuedMeasure * SIZE.issued,
    },
  );
  gap = SIZE.checkGap;
  if (face.check) {
    items.push({
      kind: "text",
      role: "check",
      text: caps(face.check),
      font: "SpaceMono-Regular",
      size: SIZE.check,
      gap,
      ink: INK.muted,
      tracking: MONO_TRACKING.check,
      lineHeight: 1.5,
      measure: null,
    });
  }
  return items;
}

/** Every word the PDF carries, in the order it draws them: the lockup's, then the certificate's. */
export function pdfWords(face: CertificateFaceView): string[] {
  return [
    ...LOCKUP_LINES,
    ...pdfItems(face)
      .filter((item): item is PdfText => item.kind === "text")
      .map((item) => item.text),
  ];
}

/** The name the PDF is saved under. */
export function pdfFileName(code: string): string {
  return `naisi-certificate-${code}.pdf`;
}
