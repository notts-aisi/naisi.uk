import "server-only";
import encodeQR from "qr";
import { isCampaignSlug } from "@/lib/campaign/attribution";
import { pngFromGrid } from "./png";

/**
 * The QR code of a short link, drawn on the server.
 *
 * WHAT A CODE ENCODES is this site's own `/q/<slug>`, never where the link
 * goes. That is the whole point of a short link (docs/tracked-links.md): the
 * code is printed once and the destination can change after. So nothing here
 * is handed a destination, and `shortLinkUrl` refuses anything that is not a
 * slug.
 *
 * THE SITE'S ADDRESS comes from `NEXT_PUBLIC_APP_URL`, so the dev site draws
 * codes for dev.naisi.uk and the live site for naisi.uk. Never from the
 * request: behind the hosting proxy a request names an internal host.
 *
 * THE LIBRARY (`qr`) only works out which squares are dark. The two pictures,
 * an SVG for the page and a PNG to download, are both drawn from that one grid
 * here, so they are always the same code.
 */

/** White squares round the code on every side: the quiet zone the QR standard asks for. */
export const QUIET_ZONE = 4;

/** Pixels per square in the PNG. A short address comes out at about 1,000 pixels: sharp on A4. */
export const PNG_SCALE = 32;

/** This site's own origin, without a trailing slash. */
export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return raw === "" ? "https://naisi.uk" : raw;
}

/** What a short link's code encodes: `https://naisi.uk/q/<slug>`. */
export function shortLinkUrl(slug: string): string {
  if (!isCampaignSlug(slug)) throw new Error(`Not a short link: ${JSON.stringify(slug)}`);
  return `${siteOrigin()}/q/${slug}`;
}

/** The same address as a person types it from a sign: `naisi.uk/q/<slug>`. */
export function shortLinkAddress(slug: string): string {
  return `${new URL(shortLinkUrl(slug)).host}/q/${slug}`;
}

/** Which squares are dark, quiet zone included. Medium error correction, the library's default. */
export function qrGrid(text: string): boolean[][] {
  return encodeQR(text, "raw", { ecc: "medium", border: QUIET_ZONE });
}

export type QrShape = {
  /** Squares along each side, quiet zone included: the SVG's viewBox is `0 0 size size`. */
  size: number;
  /** One path for every dark square, each row's runs merged into one rectangle. */
  d: string;
};

/** The code as one SVG path, for a page to draw at any size. */
export function qrShape(text: string): QrShape {
  const grid = qrGrid(text);
  const parts: string[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return { size: grid.length, d: parts.join("") };
}

/** A standalone SVG file of the code: black on a white ground, so it reads on any page. */
export function qrSvg(text: string, title: string): string {
  const { size, d } = qrShape(text);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<path fill="#000" d="${d}"/>`,
    `</svg>`,
  ].join("");
}

/** A PNG file of the code, `PNG_SCALE` pixels a square. */
export function qrPng(text: string): Uint8Array {
  return pngFromGrid(qrGrid(text), PNG_SCALE);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
