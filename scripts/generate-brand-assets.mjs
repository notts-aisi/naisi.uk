/**
 * Makes every brand file the site serves from the masters in `brand-source/`.
 *
 *   npm run brand
 *
 * The masters are the society's artwork as its owner handed it over, in his
 * folders, with his README saying what each file is for. To change the
 * artwork, replace the files in `brand-source/` and run the command: nothing
 * this script writes is ever placed or edited by hand. A second run with the
 * same masters writes nothing.
 *
 * Two rules decide how each served file is made (`OUTPUTS` below is the list):
 *
 *   copy   Where the masters hold a finished picture at exactly the size the
 *          site needs, that picture is copied byte for byte. The tab icon, the
 *          home-screen icons, the email logo and the link-preview card arrive
 *          finished for their size (the tab icon is drawn on a 16px grid, the
 *          app icons sit on their own ground), and a redraw here could only
 *          differ from the picture that was approved.
 *   draw   Anything else is drawn from the SVG master at the size needed.
 *          Never from one of the PNG exports beside it, which would be a
 *          picture of a picture.
 *
 * What this script never does is change the mark. The emblem's outlines and
 * its inks come from the files as they are; nothing here repaints or redraws
 * it. An earlier version of this script made a white emblem by painting the
 * body white and dropping the cyan copy. `public/brand/naisi-emblem-white.png`
 * keeps its name because pages point at it, and is the Night emblem: white
 * over its cyan copy, which is what an event cover shows. The masters also
 * hold the emblem in one ink, for single-colour uses; nothing served takes
 * those yet (`MASTERS_NOT_SERVED` below).
 *
 * The masters hold two cuts of the emblem: the full one, which everything
 * here is drawn from, and the header cut, for small sizes. No file is made
 * from the header cut: `src/components/BrandMark.tsx` draws it in place, and
 * the test holds what that component draws to the master.
 *
 * The tab icon and the home-screen icon are different pictures on purpose: a
 * tower cut for 16 pixels in the tab, the whole emblem on the home screen.
 * Each is wired to its own master, so changing one never changes the other.
 *
 * `tests/brand-assets.test.mjs` holds the served files to this script and the
 * masters, in both directions: a served file this script does not make, a
 * master it neither reads nor accounts for (`MASTERS_NOT_SERVED`), or a file
 * that differs from what a run would write, fails `npm test`.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the masters live, relative to the repository. Not served. */
export const MASTERS_DIR = "brand-source";

/** The offline page's template, and the mark in it that the emblem replaces. */
export const OFFLINE_TEMPLATE = "scripts/offline-template.html";
const OFFLINE_PLACEHOLDER = "__EMBLEM_DATA_URI__";
const OFFLINE_BANNER =
  "<!-- GENERATED from scripts/offline-template.html by scripts/generate-brand-assets.mjs. Do not edit directly. -->\n";

/**
 * Every file this script writes. `from` is a master, relative to
 * `brand-source/`. One of `copy`, `draw`, `offline` or `text` says how it is
 * made:
 *
 *   copy: true                 the master's own bytes
 *   draw: { height } | { width }   a PNG of the SVG master at that size. The
 *                              other side follows the SVG's own view box,
 *                              rounded up, and the drawing is fitted inside
 *                              without being stretched (see drawSvg)
 *   offline: true              the offline page, with the SVG inlined
 *   text: "..."                the words themselves (no master)
 */
export const OUTPUTS = [
  // --- The emblem and the lockup, as pictures a page can point at ---------
  {
    to: "public/brand/naisi-emblem.png",
    from: "1-emblem/naisi-emblem.svg",
    draw: { height: 480 },
    why:
      "The colour emblem, for light grounds. 393 by 480, the size it has always been served at, " +
      "so a page that sizes it by one side keeps the other.",
  },
  {
    to: "public/brand/naisi-emblem-white.png",
    from: "1-emblem/naisi-emblem-night.svg",
    draw: { height: 480 },
    why:
      "The Night emblem, for dark grounds and photographs (event covers). The name is the one " +
      "pages have always read; the picture is white over the cyan copy, not one colour. The " +
      "same shape as the colour emblem, so the same 393 by 480 box.",
  },
  {
    to: "public/brand/naisi-lockup.png",
    from: "2-lockup/naisi-lockup.svg",
    draw: { width: 1200 },
    why: "The emblem with the name beside it, colour, for light grounds.",
  },

  // --- Email ---------------------------------------------------------------
  {
    to: "public/brand/naisi-lockup-email.png",
    from: "2-lockup/naisi-lockup-email-600w.png",
    copy: true,
    why:
      "The logo at the top of every email that uses src/emails/EmailChrome.tsx. A PNG because mail " +
      "clients do not show SVG; 600px wide and shown at 220, so it is sharp on a dense screen.",
  },

  // --- Link previews -------------------------------------------------------
  // Next reads these two by name from src/app/ and writes the og:image and
  // twitter:image tags itself, with the picture's real size and a query that
  // changes when the picture does, so a new card is not held back by a
  // messaging app's cache.
  {
    to: "src/app/opengraph-image.png",
    from: "2-lockup/naisi-link-preview-1200x630.png",
    copy: true,
    why: "The card a shared link shows: the Night lockup on the site's ground, 1200 by 630.",
  },
  {
    to: "src/app/opengraph-image.alt.txt",
    text: "Nottingham AI Safety Initiative",
    why: "What a screen reader says for the card. Next reads it beside the picture.",
  },

  // --- The browser tab -----------------------------------------------------
  // Next reads favicon.ico and icon.svg by name from src/app/. A browser that
  // takes an SVG tab icon uses icon.svg; any other uses the .ico, which holds
  // the same tower at 16, 32 and 48.
  {
    to: "src/app/favicon.ico",
    from: "4-favicon/favicon.ico",
    copy: true,
    why: "The tab icon for browsers that only take an .ico.",
  },
  {
    to: "src/app/icon.svg",
    from: "4-favicon/favicon.svg",
    copy: true,
    why: "The tab icon: the tower on a navy square, drawn on a 16px grid.",
  },

  // --- The home screen and the installed app -------------------------------
  // The emblem on the site's page floor, the colour the manifest fills the
  // installed app's opening screen with, so the icon and that screen are one
  // field. The test holds the corners of all three to that colour.
  {
    to: "src/app/apple-icon.png",
    from: "3-app-icon/apple-touch-icon.png",
    copy: true,
    why: "The iOS home-screen icon, 180px. Opaque: iOS paints transparency black.",
  },
  // Named by literal address in src/app/manifest.ts, public/sw.js (the push
  // notification) and src/app/global-error.tsx, so these two keep their
  // addresses. The emblem sits inside the circle Android guarantees to show,
  // so each file serves as both a plain and a maskable icon.
  {
    to: "public/icons/icon-192.png",
    from: "3-app-icon/icon-192.png",
    copy: true,
    why: "The installed app's icon, 192px.",
  },
  {
    to: "public/icons/icon-512.png",
    from: "3-app-icon/icon-512.png",
    copy: true,
    why: "The installed app's icon, 512px, and the Android splash screen's picture.",
  },

  // --- The offline page ----------------------------------------------------
  // The one document the service worker serves with no network, so it cannot
  // point at a picture: the emblem goes in as a data URI. The SVG itself, not
  // a PNG of it: the official file to the byte, and sharp on any screen.
  {
    to: "public/offline.html",
    from: "1-emblem/naisi-emblem-night.svg",
    offline: true,
    why: "The offline fallback, from scripts/offline-template.html.",
  },
];

/**
 * Masters this script does not read, each with the reason. A file added to
 * `brand-source/` has to be read above or accounted for here.
 */
export const MASTERS_NOT_SERVED = {
  "README.md": "The owner's notes on what each file is for.",
  "1-emblem/naisi-emblem.png": "His PNG export of the colour emblem. The SVG beside it is the master.",
  "1-emblem/naisi-emblem-night.png": "His PNG export of the Night emblem. The SVG beside it is the master.",
  "1-emblem/naisi-emblem-header-night.svg":
    "The header cut, Night: the emblem for 64px and under. No page shows it from a file: src/components/BrandMark.tsx draws it in place in every header and sidebar, and tests/brand-assets.test.mjs holds those outlines to this file.",
  "1-emblem/naisi-emblem-header.svg":
    "The header cut in colour, for light grounds. Every header on the site sits on the dark ground, so nothing draws it.",
  "1-emblem/naisi-emblem-white.svg":
    "The emblem in one ink, white, with no cyan copy: for single-colour uses; covers use the offset mark. Nothing served takes it yet.",
  "1-emblem/naisi-emblem-navy.svg":
    "The emblem in one ink, navy, with no cyan copy: for single-colour uses; covers use the offset mark. Nothing served takes it yet.",
  "2-lockup/naisi-lockup.png": "His PNG export of the colour lockup. The SVG beside it is the master.",
  "2-lockup/naisi-lockup-night.svg":
    "The Night lockup. No page or email shows it from a file: on the site's dark ground the lockup is drawn in place by src/components/BrandMark.tsx.",
  "2-lockup/naisi-lockup-night.png": "His PNG export of the Night lockup. See the SVG beside it.",
  "2-lockup/naisi-link-preview-1200x630.svg":
    "The card's vector source. The PNG beside it is the finished picture at the size a link preview takes.",
  "3-app-icon/naisi-app-icon.svg":
    "The app icon's master, for a size he has not supplied. The 180, 192 and 512 beside it are finished.",
  "3-app-icon/naisi-app-icon-1024.png": "The app icon at 1024px. Nothing on the site takes that size.",
  "4-favicon/favicon-16.png": "The tab icon at 16px. The .ico carries the same picture.",
  "4-favicon/favicon-32.png": "The tab icon at 32px. The .ico carries the same picture.",
};

/**
 * The finished pictures in the masters, each beside the SVG it is a picture
 * of. A copied picture is served as it is, and this script cannot tell one
 * exported before its SVG last changed from a current one, so the test draws
 * each SVG and checks the pair still agree. It is a coarse check: it catches
 * a picture of something else, not a nudge. (The test reads favicon.ico
 * against favicon.svg too, to the pixel.)
 */
export const FINISHED_FROM = {
  "2-lockup/naisi-lockup-email-600w.png": "2-lockup/naisi-lockup.svg",
  "2-lockup/naisi-link-preview-1200x630.png": "2-lockup/naisi-link-preview-1200x630.svg",
  "3-app-icon/apple-touch-icon.png": "3-app-icon/naisi-app-icon.svg",
  "3-app-icon/icon-192.png": "3-app-icon/naisi-app-icon.svg",
  "3-app-icon/icon-512.png": "3-app-icon/naisi-app-icon.svg",
  "4-favicon/favicon-16.png": "4-favicon/favicon.svg",
  "4-favicon/favicon-32.png": "4-favicon/favicon.svg",
};

const master = (rel) => path.join(ROOT, MASTERS_DIR, rel);

/** The width and height of an SVG's own view box, in its own units. */
export function viewBoxSize(svgText) {
  const found = svgText.match(/<svg\b[^>]*\sviewBox="([^"]+)"/);
  if (!found) throw new Error("the SVG has no viewBox");
  const [, , width, height] = found[1].trim().split(/[\s,]+/).map(Number);
  if (!(width > 0 && height > 0)) throw new Error(`unreadable viewBox "${found[1]}"`);
  return { width, height };
}

/**
 * Draw an SVG master as a PNG. One side is given; the other follows the view
 * box, rounded up to a whole pixel, and the drawing sits centred inside that
 * box at its own proportions, the way an <img> of that size would show it.
 * Rounding to the nearest pixel and filling the box would squeeze the mark by
 * a fraction of a pixel or clip its edge, and a mark is neither squeezed nor
 * clipped; the cost of not doing so is under a pixel of clear margin on two
 * sides. No palette and no quantising either, so every pixel inside a shape
 * is the file's own ink.
 */
export async function drawSvg(svgBuffer, { width, height }) {
  const text = svgBuffer.toString("utf8");
  const box = viewBoxSize(text);
  // The small subtraction keeps a side that is already whole from being
  // pushed up a pixel by floating-point dust.
  const up = (n) => Math.ceil(n - 1e-6);
  const w = width ?? up((height * box.width) / box.height);
  const h = height ?? up((width * box.height) / box.width);
  // The file's own width and height say how big to draw it when nobody asks
  // for a size. Here somebody does, so the copy that is drawn carries the
  // size asked for. Nothing else in it is touched: the view box, the
  // outlines and the inks are the master's.
  const sized = text.replace(/<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(?:width|height)="[^"]*"/g, "").replace(/^<svg\b/, `<svg width="${w}" height="${h}"`),
  );
  const png = await sharp(Buffer.from(sized, "utf8")).png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== w || meta.height !== h) {
    throw new Error(`drew ${meta.width} by ${meta.height}, expected ${w} by ${h}`);
  }
  return png;
}

/** The offline page: the template with the emblem's SVG inlined. */
async function offlinePage(svgBuffer) {
  const template = await readFile(path.join(ROOT, OFFLINE_TEMPLATE), "utf8");
  if (template.split(OFFLINE_PLACEHOLDER).length !== 2) {
    throw new Error(`${OFFLINE_TEMPLATE} must carry ${OFFLINE_PLACEHOLDER} exactly once`);
  }
  const uri = `data:image/svg+xml;base64,${svgBuffer.toString("base64")}`;
  return Buffer.from(OFFLINE_BANNER + template.replace(OFFLINE_PLACEHOLDER, uri), "utf8");
}

/**
 * What a run writes: one `{ to, bytes, how }` per entry of OUTPUTS, in order.
 * Reads the masters and writes nothing.
 */
export async function build() {
  const made = [];
  for (const output of OUTPUTS) {
    if (typeof output.text === "string") {
      made.push({ to: output.to, bytes: Buffer.from(output.text, "utf8"), how: "text" });
      continue;
    }
    const source = await readFile(master(output.from));
    if (output.copy) made.push({ to: output.to, bytes: source, how: "copy" });
    else if (output.draw) made.push({ to: output.to, bytes: await drawSvg(source, output.draw), how: "draw" });
    else if (output.offline) made.push({ to: output.to, bytes: await offlinePage(source), how: "offline" });
    else throw new Error(`${output.to}: no way to make it is given`);
  }
  return made;
}

/** True when two PNGs hold the same pixels, whatever their encoding. */
async function samePixels(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map((png) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  return x.info.width === y.info.width && x.info.height === y.info.height && x.data.equals(y.data);
}

async function describe(bytes, to) {
  if (/\.(png|svg)$/.test(to)) {
    const meta = await sharp(bytes).metadata();
    return `${meta.width}x${meta.height}`;
  }
  return "";
}

async function main() {
  console.log(`Brand files, from ${MASTERS_DIR}/:`);
  let written = 0;
  for (const { to, bytes, how } of await build()) {
    const file = path.join(ROOT, to);
    let current = null;
    try {
      current = await readFile(file);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    // A drawn PNG is left alone when its pixels are already right, so a
    // machine whose encoder packs the same picture differently changes nothing.
    const same =
      current !== null && (current.equals(bytes) || (how === "draw" && (await samePixels(current, bytes))));
    if (!same) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      written++;
    }
    const state = same ? "unchanged" : current === null ? "created" : "updated";
    const size = `${(bytes.length / 1024).toFixed(1)} KB`;
    console.log(`  ${state.padEnd(9)} ${to.padEnd(36)} ${how.padEnd(7)} ${(await describe(bytes, to)).padEnd(9)} ${size}`);
  }
  console.log(written === 0 ? "Nothing changed." : `${written} file${written === 1 ? "" : "s"} written.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
