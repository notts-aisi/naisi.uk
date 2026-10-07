/**
 * The brand files the site serves are what `npm run brand` makes from the
 * masters in `brand-source/` (run via `npm test`, Node's built-in runner).
 *
 * The society's artwork lives in one folder. Everything a browser, a phone,
 * a mail client or a link preview is given comes from that folder through
 * `scripts/generate-brand-assets.mjs`, and nothing is placed by hand. That is
 * only true while something checks it, in both directions:
 *
 *   - a served file that is not what a run would write (a master changed and
 *     nobody ran the command, or somebody edited the output);
 *   - a served picture the script does not make (a stray `icon.png` beside
 *     `icon.svg` gives the browser tab two icons to choose between);
 *   - a master nobody decided about (dropped into the folder, read by
 *     nothing);
 *   - a finished picture that no longer shows what its SVG shows;
 *   - an address in the manifest, the service worker or a page that names a
 *     picture which is not served, or declares a size the file does not have;
 *   - an app icon on a ground that is not the colour the installed app opens
 *     on, which shows on the opening screen as a square of its own;
 *   - an outline of the emblem written into the code (the header draws the
 *     mark in place) that is not the master's outline;
 *   - an email logo or a link-preview card wired in a way that cannot work:
 *     an SVG in an email, a logo on the wrong ground, a root layout that
 *     overrides the generated card.
 *
 * Each of those reaches a real device silently. None of them fails a build.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  FINISHED_FROM,
  MASTERS_DIR,
  MASTERS_NOT_SERVED,
  OUTPUTS,
  build,
  viewBoxSize,
} from "../scripts/generate-brand-assets.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts) => join(REPO_ROOT, ...parts);
const read = (rel) => readFileSync(at(rel));
const slashed = (p) => p.split(sep).join("/");

/** Every file under a folder, as paths relative to the repository. */
function walk(rel) {
  const found = [];
  for (const name of readdirSync(at(rel))) {
    if (name === ".DS_Store") continue;
    const child = join(rel, name);
    if (statSync(at(child)).isDirectory()) found.push(...walk(child));
    else found.push(slashed(child));
  }
  return found.sort();
}

const pixels = (input, resize) =>
  (resize ? sharp(input).resize(resize.width, resize.height, { fit: "contain", background: "#00000000" }) : sharp(input))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

/**
 * How far apart two pictures of the same size are: the mean difference per
 * pixel (0 to 255) and the share of pixels more than `over` apart. Colour is
 * weighed by its alpha, so whatever sits under a fully clear pixel is ignored.
 */
function distance(a, b, over = 16) {
  assert.equal(`${a.info.width}x${a.info.height}`, `${b.info.width}x${b.info.height}`, "the two pictures differ in size");
  let sum = 0;
  let far = 0;
  const count = a.data.length / 4;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = Math.abs(a.data[i + 3] - b.data[i + 3]);
    for (let c = 0; c < 3; c++) {
      d = Math.max(d, Math.abs(a.data[i + c] * a.data[i + 3] - b.data[i + c] * b.data[i + 3]) / 255);
    }
    sum += d;
    if (d > over) far++;
  }
  return { mean: sum / count, far: far / count };
}

const made = await build();
const madePaths = new Set(made.map((m) => m.to));
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// The served files are the script's output
// ---------------------------------------------------------------------------

test("every served brand file is what `npm run brand` writes from the masters", async () => {
  for (const { to, bytes, how } of made) {
    assert.ok(existsSync(at(to)), `${to} is missing. Run \`npm run brand\`.`);
    const onDisk = read(to);
    if (onDisk.equals(bytes)) continue;
    // A drawn PNG may be packed differently on another machine and still be
    // the same picture, so it is held to its pixels, with room for a
    // rasteriser to round an edge the other way and none for a different
    // drawing.
    if (how === "draw") {
      const { mean, far } = distance(await pixels(onDisk), await pixels(bytes));
      assert.ok(
        mean <= 0.5 && far <= 0.005,
        `${to} is not the picture \`npm run brand\` draws from the masters ` +
          `(mean difference ${mean.toFixed(2)} of 255, ${(far * 100).toFixed(2)}% of pixels far apart). Run it and commit the result.`,
      );
      continue;
    }
    assert.fail(`${to} is not what \`npm run brand\` writes from the masters. Run it, and never edit the file itself.`);
  }
});

/*
 * Pictures in public/icons/ that are not artwork, each with its reason. The
 * install sheet's screenshots are photographs of the live site, retaken by
 * hand when a page they show is redesigned (see src/app/manifest.ts).
 */
const ICONS_PLACED_BY_HAND = {
  "public/icons/screenshot-narrow-home.png": "Install-sheet screenshot of the live homepage at phone width.",
  "public/icons/screenshot-narrow-resources.png": "Install-sheet screenshot of the live resources page at phone width.",
  "public/icons/screenshot-wide-home.png": "Install-sheet screenshot of the live homepage at laptop width.",
};

/** The names Next reads as icons and link-preview pictures, in any folder of src/app. */
const NEXT_READS_BY_NAME = /^(?:favicon\.ico|(?:icon|apple-icon)\d*\.[a-z]+|(?:opengraph|twitter)-image\d*(?:\.alt)?\.[a-z]+)$/;

test("no brand picture is served that the script does not make", () => {
  const strays = [];
  for (const file of walk("src/app")) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (NEXT_READS_BY_NAME.test(name) && !madePaths.has(file)) strays.push(file);
  }
  for (const file of walk("public/icons")) {
    if (!madePaths.has(file) && !(file in ICONS_PLACED_BY_HAND)) strays.push(file);
  }
  for (const file of walk("public/brand")) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (/^naisi-(?:emblem|lockup|link-preview|icon)/.test(name) && !madePaths.has(file)) strays.push(file);
  }
  assert.deepEqual(
    strays,
    [],
    "These are served and `scripts/generate-brand-assets.mjs` does not make them. Add each to OUTPUTS with its master, or delete it.",
  );
  for (const file of Object.keys(ICONS_PLACED_BY_HAND)) {
    assert.ok(existsSync(at(file)), `${file} is listed as placed by hand and is not there. Remove the entry.`);
  }
});

/*
 * The pixel box of each picture a page sizes by ONE side. The homepage's
 * credentials bar sets the emblem's width and takes the height from the
 * picture, and the hero does the opposite, so a picture one pixel narrower
 * makes everything below it a fraction of a pixel taller. (Measured when the
 * artwork changed: at 392 wide the footer sat a quarter of a pixel lower.)
 * A new box here is a decision to let those pages move.
 */
const BOX_PAGES_RELY_ON = {
  "public/brand/naisi-emblem.png": "393x480",
  // The same shape as the colour emblem, so the same box: an event cover that
  // switches between the two does not shift.
  "public/brand/naisi-emblem-white.png": "393x480",
};

test("a picture that pages size by one side keeps its box, and no drawn picture is squeezed or clipped", async () => {
  for (const [file, box] of Object.entries(BOX_PAGES_RELY_ON)) {
    assert.ok(madePaths.has(file), `${file} is listed and \`npm run brand\` does not make it. Remove the entry.`);
    const meta = await sharp(read(file)).metadata();
    assert.equal(`${meta.width}x${meta.height}`, box, `${file} changed shape: pages that size it by one side will move`);
  }
  for (const { to, from, draw } of OUTPUTS) {
    if (!draw) continue;
    const master = viewBoxSize(readFileSync(at(MASTERS_DIR, from), "utf8"));
    const { data, info } = await pixels(read(to));
    // The drawing fills its box along one side and leaves under a pixel of
    // clear margin along the other: its own proportions, nothing cut off.
    const scale = Math.min(info.width / master.width, info.height / master.height);
    const spare = [info.width - master.width * scale, info.height - master.height * scale];
    assert.ok(spare[0] < 1 && spare[1] < 1, `${to} is ${info.width} by ${info.height}, which is not the shape of ${from}`);
    // And the ink reaches every edge of that box: a clipped or shrunken
    // drawing would leave a clear column or row.
    const inked = (x, y) => data[(y * info.width + x) * 4 + 3] > 0;
    const column = (x) => Array.from({ length: info.height }, (_, y) => inked(x, y)).some(Boolean);
    const row = (y) => Array.from({ length: info.width }, (_, x) => inked(x, y)).some(Boolean);
    assert.ok(column(0) && column(info.width - 1) && row(0) && row(info.height - 1), `${to}: the drawing does not reach the edges of its box`);
  }
});

// ---------------------------------------------------------------------------
// The masters
// ---------------------------------------------------------------------------

test("every master is read by the script or accounted for, and no entry names a file that is gone", () => {
  const masters = walk(MASTERS_DIR).map((file) => file.slice(MASTERS_DIR.length + 1));
  const readByScript = new Set(OUTPUTS.filter((o) => o.from).map((o) => o.from));
  const undecided = masters.filter((file) => !readByScript.has(file) && !(file in MASTERS_NOT_SERVED));
  assert.deepEqual(
    undecided,
    [],
    `These files are in ${MASTERS_DIR}/ and nothing reads them. Give each an entry in OUTPUTS, or in MASTERS_NOT_SERVED with the reason.`,
  );
  for (const file of readByScript) assert.ok(masters.includes(file), `OUTPUTS reads ${MASTERS_DIR}/${file}, which is not there.`);
  for (const [file, reason] of Object.entries(MASTERS_NOT_SERVED)) {
    assert.ok(masters.includes(file), `MASTERS_NOT_SERVED lists ${file}, which is not in ${MASTERS_DIR}/. Remove the entry.`);
    assert.ok(!readByScript.has(file), `${file} is listed as not served and OUTPUTS reads it. It cannot be both.`);
    assert.ok(typeof reason === "string" && reason.length > 20, `${file}: say why it is kept and not served.`);
  }
});

test("a drawn file is drawn from an SVG, and a copied picture is listed beside the SVG it shows", () => {
  const masters = new Set(walk(MASTERS_DIR).map((file) => file.slice(MASTERS_DIR.length + 1)));
  for (const { to, from, draw, copy } of OUTPUTS) {
    // Never a picture of a picture: the PNG exports in the masters are for
    // people, the SVG is what the script draws from.
    if (draw) assert.match(from, /\.svg$/, `${to} is drawn from ${from}. A drawn file is drawn from an SVG master.`);
    if (copy && from.endsWith(".png")) {
      assert.ok(from in FINISHED_FROM, `${to} copies ${from}. List the SVG it is a picture of in FINISHED_FROM.`);
    }
  }
  for (const [raster, svg] of Object.entries(FINISHED_FROM)) {
    assert.ok(masters.has(raster), `FINISHED_FROM lists ${raster}, which is not in ${MASTERS_DIR}/.`);
    assert.ok(masters.has(svg) && svg.endsWith(".svg"), `FINISHED_FROM pairs ${raster} with ${svg}, which is not an SVG master.`);
  }
});

test("a finished picture that is copied still shows what its SVG master shows", async () => {
  for (const [raster, svg] of Object.entries(FINISHED_FROM)) {
    const picture = await pixels(read(`${MASTERS_DIR}/${raster}`));
    const drawn = await pixels(read(`${MASTERS_DIR}/${svg}`), picture.info);
    const { mean } = distance(picture, drawn);
    // Measured on these files: 0 for the tab icon, 0.5 to 1.2 for the rest
    // (two rasterisers disagree only along edges). A picture of different
    // artwork measures 50 and up.
    assert.ok(
      mean <= 3,
      `${MASTERS_DIR}/${raster} no longer looks like ${svg} (mean difference ${mean.toFixed(1)} of 255). ` +
        "The SVG changed and this picture was not exported again, or the other way round.",
    );
  }
});

/**
 * The pictures inside an .ico, each as { size, rgb } with rows top to bottom.
 * An entry is a PNG or a bottom-up bitmap of 32 bits a pixel or a palette of
 * up to 256 colours, which is every kind an icon tool writes.
 */
async function icoPictures(ico) {
  assert.equal(ico.readUInt16LE(2), 1, "not an icon file");
  const pictures = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + i * 16;
    const size = ico[entry] || 256;
    const start = ico.readUInt32LE(entry + 12);
    const body = ico.subarray(start, start + ico.readUInt32LE(entry + 8));
    const rgb = Buffer.alloc(size * size * 3);
    if (body.subarray(0, 4).toString("latin1") === "\x89PNG") {
      const { data } = await sharp(body).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      data.copy(rgb);
    } else {
      const header = body.readUInt32LE(0);
      const bits = body.readUInt16LE(14);
      assert.ok(bits === 32 || bits <= 8, `an icon picture of ${bits} bits a pixel is not one this test reads`);
      const colours = bits <= 8 ? body.readUInt32LE(32) || 1 << bits : 0;
      const palette = header;
      const rows = palette + colours * 4;
      const rowBytes = Math.ceil((size * bits) / 32) * 4;
      for (let y = 0; y < size; y++) {
        const row = rows + (size - 1 - y) * rowBytes;
        for (let x = 0; x < size; x++) {
          let at;
          if (bits === 32) at = row + x * 4;
          else {
            const bit = x * bits;
            const index = (body[row + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
            at = palette + index * 4;
          }
          // Stored blue, green, red.
          rgb[(y * size + x) * 3] = body[at + 2];
          rgb[(y * size + x) * 3 + 1] = body[at + 1];
          rgb[(y * size + x) * 3 + 2] = body[at];
        }
      }
    }
    pictures.push({ size, rgb });
  }
  return pictures;
}

test("favicon.ico holds the tab icon at 16, 32 and 48 pixels, each the SVG to the pixel", async () => {
  // Nothing else can read an .ico, so a stale one would sit in the browser
  // tab of every browser that takes it and no check would notice. The tab
  // icon is drawn on a 16px grid, so at these sizes the SVG has no edges to
  // round and the comparison is exact.
  const pictures = await icoPictures(read(`${MASTERS_DIR}/4-favicon/favicon.ico`));
  assert.deepEqual(pictures.map((p) => p.size).sort((a, b) => a - b), [16, 32, 48]);
  const svg = read(`${MASTERS_DIR}/4-favicon/favicon.svg`);
  for (const { size, rgb } of pictures) {
    const drawn = await sharp(svg).resize(size, size).removeAlpha().raw().toBuffer();
    assert.ok(rgb.equals(drawn), `the ${size}px picture in favicon.ico is not favicon.svg at ${size}px`);
  }
});

// ---------------------------------------------------------------------------
// The tab and the home screen
// ---------------------------------------------------------------------------

test("the tab icon and the home-screen icon are different pictures, each from its own master", () => {
  const from = Object.fromEntries(OUTPUTS.filter((o) => o.from).map((o) => [o.to, o.from]));
  // The tab: a tower cut for 16 pixels. The home screen: the whole emblem.
  // Pointing one at the other's master makes them the same picture again.
  assert.match(from["src/app/favicon.ico"], /^4-favicon\//);
  assert.match(from["src/app/icon.svg"], /^4-favicon\//);
  assert.match(from["src/app/apple-icon.png"], /^3-app-icon\//);
  assert.match(from["public/icons/icon-192.png"], /^3-app-icon\//);
  assert.match(from["public/icons/icon-512.png"], /^3-app-icon\//);
});

/** The icons the manifest names, read from its source. */
function manifestIcons() {
  const source = strip(readFileSync(at("src/app/manifest.ts"), "utf8"));
  const block = source.match(/\bicons:\s*\[([\s\S]*?)\]/);
  assert.ok(block, "src/app/manifest.ts has no icons list");
  const entries = [...block[1].matchAll(/\{([^{}]*)\}/g)].map((m) => {
    const field = (name) => m[1].match(new RegExp(`\\b${name}:\\s*"([^"]*)"`))?.[1];
    return { src: field("src"), sizes: field("sizes"), type: field("type"), purpose: field("purpose") };
  });
  assert.ok(entries.length > 0, "src/app/manifest.ts names no icons");
  return entries;
}

test("the manifest names icons the script makes, at the size each file really is", async () => {
  const icons = manifestIcons();
  for (const icon of icons) {
    const file = `public${icon.src}`;
    assert.ok(madePaths.has(file), `the manifest names ${icon.src}, which \`npm run brand\` does not make`);
    const meta = await sharp(read(file)).metadata();
    assert.equal(icon.sizes, `${meta.width}x${meta.height}`, `${icon.src}: the manifest declares ${icon.sizes}`);
    assert.equal(icon.type, `image/${meta.format}`, `${icon.src}: the manifest declares ${icon.type}`);
    assert.equal(meta.hasAlpha, false, `${icon.src} has transparency, which a phone paints black. An app icon is opaque.`);
  }
  // The other direction: an icon made for the installed app and named by nothing.
  for (const to of madePaths) {
    if (!to.startsWith("public/icons/")) continue;
    assert.ok(icons.some((icon) => `public${icon.src}` === to), `${to} is made and the manifest does not name it`);
  }
  // Chrome will not offer to install without a 192 and a 512.
  for (const size of ["192x192", "512x512"]) {
    assert.ok(icons.some((icon) => icon.sizes === size && icon.purpose === "any"), `no plain ${size} icon`);
  }
});

test("an icon the manifest calls maskable keeps the emblem inside the circle a phone crops to", async () => {
  const maskable = manifestIcons().filter((icon) => icon.purpose === "maskable");
  assert.ok(maskable.length > 0, "the manifest names no maskable icon, so Android letterboxes the plain one");
  for (const icon of maskable) {
    const { data, info } = await pixels(read(`public${icon.src}`));
    // Android guarantees a centre circle of radius 40% of the icon's width
    // and may crop everything outside it. The emblem is white and cyan on a
    // dark ground, so its pixels are the ones with a bright green channel.
    const centre = (info.width - 1) / 2;
    let furthest = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 1] > 150) furthest = Math.max(furthest, Math.hypot(x - centre, y - centre));
      }
    }
    assert.ok(furthest > 0, `${icon.src}: found no emblem`);
    assert.ok(
      furthest <= 0.4 * info.width,
      `${icon.src}: the emblem reaches ${((furthest / info.width) * 100).toFixed(1)}% of the width from the centre, ` +
        "past the 40% a maskable icon may count on. Drop the maskable entry or ask for artwork with more room.",
    );
  }
});

test("an app icon's ground is the colour the installed app opens on", async () => {
  // Android fills the installed app's opening screen with the manifest's
  // background_color and sets the icon in the middle of it, so an icon
  // exported on any other ground shows there as a square of its own. The
  // artwork's glow fades to the page floor before it reaches the corners
  // (the middle of each side is still a few steps lighter, #080c18 to
  // #0a0f20 as measured), so the corners are where the two have to be equal.
  const floor = readFileSync(at("src/theme/brandColors.ts"), "utf8").match(/^export const PAGE_FLOOR = "(#[0-9a-fA-F]{6})";$/m)?.[1];
  assert.ok(floor, "could not read PAGE_FLOOR in src/theme/brandColors.ts");
  const manifest = strip(readFileSync(at("src/app/manifest.ts"), "utf8"));
  assert.match(manifest, /\bbackground_color:\s*PAGE_FLOOR\b/, "the manifest no longer fills the opening screen with PAGE_FLOOR");
  const icons = OUTPUTS.filter((o) => o.from?.startsWith("3-app-icon/")).map((o) => o.to);
  assert.ok(icons.length >= 3, "found fewer app icons than the home screen and the manifest take");
  for (const file of icons) {
    const { data, info } = await pixels(read(file));
    const colourAt = (x, y) => "#" + [0, 1, 2].map((c) => data[(y * info.width + x) * 4 + c].toString(16).padStart(2, "0")).join("");
    const corners = [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]].map(([x, y]) => colourAt(x, y));
    assert.deepEqual(
      corners,
      Array(4).fill(floor.toLowerCase()),
      `${file}: the icon's corners are not the page floor ${floor}. ` +
        "The artwork was exported on another ground, or PAGE_FLOOR moved without it.",
    );
  }
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

test("every brand picture named by address in the code is one that is served", () => {
  // Pages, the service worker and the error boundary name these pictures by
  // literal address, which nothing else checks: a renamed output would leave
  // each of them pointing at a 404.
  const sources = [...walk("src").filter((file) => /\.(?:tsx?|jsx?|css)$/.test(file)), "public/sw.js"];
  const named = new Map();
  for (const file of sources) {
    const text = readFileSync(at(file), "utf8");
    for (const [, address] of text.matchAll(/["'`}(](\/(?:brand|icons)\/[A-Za-z0-9._/-]+\.(?:png|svg|ico|jpe?g|webp|pdf))/g)) {
      if (!named.has(address)) named.set(address, file);
    }
  }
  assert.ok(named.size >= 5, "found almost no addresses: the scan has stopped seeing them");
  const missing = [...named].filter(([address]) => !existsSync(at("public", address))).map(([address, file]) => `${address} (${file})`);
  assert.deepEqual(missing, [], "These addresses are named in the code and no such file is in public/.");
});

test("the offline page carries the Night emblem itself, and nothing from the network", () => {
  const page = readFileSync(at("public/offline.html"), "utf8");
  const images = [...page.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(images.length, 1, "the offline page shows one picture, the emblem");
  const [, type, body] = images[0].match(/^data:([^;,]+);base64,(.*)$/) ?? [];
  assert.equal(type, "image/svg+xml");
  // The dark page takes the emblem made for dark grounds, to the byte.
  assert.ok(
    Buffer.from(body, "base64").equals(read(`${MASTERS_DIR}/1-emblem/naisi-emblem-night.svg`)),
    "the picture in the offline page is not brand-source/1-emblem/naisi-emblem-night.svg",
  );
});

// ---------------------------------------------------------------------------
// The emblem drawn in place
// ---------------------------------------------------------------------------

/*
 * The header, the sidebar and the footer do not show a picture file: the
 * emblem is drawn in place from outlines written into the code
 * (src/components/BrandMark.tsx). Those outlines are a second copy of the
 * artwork, and a copy drifts. So every outline in `src` that starts the way
 * one of the emblem's does has to BE that outline, character for character,
 * wherever it is written and however the string is split across lines.
 */
const nightEmblem = readFileSync(at(MASTERS_DIR, "1-emblem/naisi-emblem-night.svg"), "utf8");
const headerEmblem = readFileSync(at(MASTERS_DIR, "1-emblem/naisi-emblem-header-night.svg"), "utf8");
const outlinesOf = (svg) => [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map((m) => m[1]);
/** The emblem's three outlines, in the order the file draws them: castle, shield, wave. */
const EMBLEM = outlinesOf(nightEmblem).slice(0, 3);
/** The header cut's three, in the same order. */
const HEADER = outlinesOf(headerEmblem).slice(0, 3);
/** True for an outline that begins the way one of the emblem's does. Both cuts' castles begin alike. */
const startsLikeTheEmblem = (text) => EMBLEM.some((outline) => text.startsWith(outline.slice(0, 20)));
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/*
 * Outlines that begin like the emblem's and are not in the masters, by the
 * first 16 characters of their SHA-256, each with the reason it is drawn.
 * An outline is added here only by a decision about the mark, never to make
 * this test pass.
 */
const OUTLINES_NOT_IN_THE_MASTERS = {
  c041bdda9a4115bd:
    "The castle as the redesign's boards draw it in a header: a wider gap to the shield, so the two do not close " +
    "up at 40px and under. The masters hold one cut of the emblem and this is not it.",
};

/** Every string in a source file, with `"a" + "b"` joined back into one. */
function stringsIn(source) {
  const joined = source.replace(/(["'`])\s*\+\s*\1/g, "");
  return [...joined.matchAll(/(["'`])((?:(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
}

/*
 * What each SVG in the masters draws, in the order the file draws it. "full"
 * is the emblem. "header" is the header cut, for small sizes: the same shield
 * and wave, with the castle a little further from the shield. Listed twice
 * where the cyan copy sits behind the body, once where the mark is in one
 * ink. The tab icon's folder is not here: the tower is a different drawing on
 * purpose. An SVG added to the masters is listed with what it carries.
 */
const CUTS_IN_THE_MASTERS = {
  "1-emblem/naisi-emblem.svg": ["full", "full"],
  "1-emblem/naisi-emblem-night.svg": ["full", "full"],
  "1-emblem/naisi-emblem-header.svg": ["header", "header"],
  "1-emblem/naisi-emblem-header-night.svg": ["header", "header"],
  "1-emblem/naisi-emblem-navy.svg": ["full"],
  "1-emblem/naisi-emblem-white.svg": ["full"],
  "2-lockup/naisi-lockup.svg": ["full", "full"],
  "2-lockup/naisi-lockup-night.svg": ["full", "full"],
  "2-lockup/naisi-link-preview-1200x630.svg": ["full", "full"],
  "3-app-icon/naisi-app-icon.svg": ["full", "full"],
};

test("the masters draw the emblem in two cuts, and every SVG that carries it carries the cut it is listed with", () => {
  assert.equal(EMBLEM.length, 3, "the Night emblem is a castle, a shield and a wave");
  assert.equal(HEADER.length, 3, "the header cut is a castle, a shield and a wave");
  // The header cut is the emblem with one outline changed. A header cut whose
  // shield or wave had drifted from the emblem's would be a third drawing.
  assert.notEqual(HEADER[0], EMBLEM[0], "the header cut's castle is the emblem's own: the masters hold one cut, not two");
  assert.equal(HEADER[1], EMBLEM[1], "the header cut's shield is not the emblem's shield");
  assert.equal(HEADER[2], EMBLEM[2], "the header cut's wave is not the emblem's wave");

  const cut = { full: EMBLEM, header: HEADER };
  const svgs = walk(MASTERS_DIR)
    .filter((f) => f.endsWith(".svg") && !f.includes("/4-favicon/"))
    .map((f) => f.slice(MASTERS_DIR.length + 1));
  assert.deepEqual(
    svgs.filter((file) => !(file in CUTS_IN_THE_MASTERS)),
    [],
    `These SVGs are in ${MASTERS_DIR}/ and nothing says which cut of the emblem they carry. List each in CUTS_IN_THE_MASTERS.`,
  );
  for (const [file, cuts] of Object.entries(CUTS_IN_THE_MASTERS)) {
    assert.ok(svgs.includes(file), `CUTS_IN_THE_MASTERS lists ${file}, which is not in ${MASTERS_DIR}/. Remove the entry.`);
    // Every outline in the file that begins like one of the emblem's, not
    // only the first few: a file with one copy too many, or one too few, is
    // a different drawing as well.
    const drawn = outlinesOf(readFileSync(at(MASTERS_DIR, file), "utf8")).filter(startsLikeTheEmblem);
    assert.deepEqual(
      drawn.map(sha),
      cuts.flatMap((name) => cut[name]).map(sha),
      `${MASTERS_DIR}/${file} does not draw the emblem as listed (${cuts.join(", then ")})`,
    );
  }
});

test("every copy of the emblem's outlines in src is the master's, character for character", () => {
  const starts = EMBLEM.map((outline) => outline.slice(0, 20));
  const copies = [];
  for (const file of walk("src").filter((f) => /\.(?:tsx?|jsx?|mjs|css|svg)$/.test(f))) {
    for (const text of stringsIn(readFileSync(at(file), "utf8"))) {
      if (starts.some((start) => text.startsWith(start))) copies.push({ file, text });
    }
  }
  const wrong = copies
    .filter(({ text }) => !EMBLEM.includes(text) && !(sha(text) in OUTLINES_NOT_IN_THE_MASTERS))
    .map(({ file, text }) => `${file}: an outline starting "${text.slice(0, 44)}" (${sha(text)})`);
  assert.deepEqual(
    wrong,
    [],
    `These outlines begin like the emblem's and are not the ones in ${MASTERS_DIR}/1-emblem/naisi-emblem-night.svg. ` +
      "Copy the outline from that file. The emblem is never redrawn.",
  );
  // The component that draws the mark on every page carries all three.
  const inBrandMark = copies.filter((c) => c.file === "src/components/BrandMark.tsx").map((c) => c.text);
  for (const outline of EMBLEM) {
    assert.ok(inBrandMark.includes(outline), `BrandMark.tsx no longer carries the outline starting "${outline.slice(0, 24)}"`);
  }
  // The other direction: an exception nothing draws any more is removed.
  for (const digest of Object.keys(OUTLINES_NOT_IN_THE_MASTERS)) {
    assert.ok(copies.some(({ text }) => sha(text) === digest), `no outline in src has the digest ${digest}. Remove the entry.`);
  }
});

test("BrandMark draws the emblem in the master's own box, offset and inks", () => {
  const component = readFileSync(at("src/components/BrandMark.tsx"), "utf8");
  const css = readFileSync(at("src/components/BrandMark.module.css"), "utf8");
  const numbers = (text) => text.trim().split(/[\s,]+/).map(Number);

  // The box the large cut is drawn in is the SVG's own view box, and the
  // cyan copy is set off by the distance the SVG sets it off by.
  const viewBox = numbers(nightEmblem.match(/viewBox="([^"]+)"/)[1]);
  const [echo, body] = [...nightEmblem.matchAll(/<g\b([^>]*)>/g)].map((m) => m[1]);
  const [dx, dy] = numbers(echo.match(/transform="translate\(([^)]+)\)"/)[1]);
  assert.ok(!/transform=/.test(body), "the emblem's body is drawn where it is, only the cyan copy is moved");
  assert.equal(-dx, dy, "the cyan copy sits the same distance left and down");
  const box = component.match(/[:=]\s*\{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+), shift: ([\d.]+) \};/);
  assert.ok(box, "could not read the large cut's box in BrandMark.tsx");
  assert.deepEqual(box.slice(1, 5).map(Number), viewBox, "BrandMark's box for the large cut is not the master's view box");
  assert.equal(Number(box[5]), dy, "BrandMark's offset for the cyan copy is not the master's");

  // The two inks.
  const ink = (name) => css.match(new RegExp(`--emblem-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1].toLowerCase();
  assert.equal(ink("echo"), echo.match(/fill="(#[0-9a-fA-F]{6})"/)[1].toLowerCase(), "the cyan copy's ink");
  assert.equal(ink("face"), body.match(/fill="(#[0-9a-fA-F]{6})"/)[1].toLowerCase(), "the body's ink");
});

test("the shield and the wave fill the same under either rule, so BrandMark may set it on the castle alone", async () => {
  // The master sets fill-rule="evenodd" on all three outlines. BrandMark
  // sets it on the castle alone. That is the same picture only while the
  // shield and the wave have nothing that rule would cut out, so new artwork
  // with a hole in either has to fail here and say so.
  const viewBox = nightEmblem.match(/viewBox="([^"]+)"/)[1];
  const drawn = (rules) =>
    sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="442" height="541" fill="#fff">` +
          EMBLEM.map((d, i) => `<path d="${d}" fill-rule="${rules[i]}"/>`).join("") +
          "</svg>",
      ),
    )
      .raw()
      .toBuffer();
  const asMaster = await drawn(["evenodd", "evenodd", "evenodd"]);
  const asBrandMark = await drawn(["evenodd", "nonzero", "nonzero"]);
  assert.ok(asMaster.equals(asBrandMark), "the shield or the wave now needs fill-rule evenodd: set it in BrandMark.tsx");
  const component = readFileSync(at("src/components/BrandMark.tsx"), "utf8");
  assert.match(component, /<path d=\{(?:small \? CASTLE_SMALL : )?CASTLE\} fillRule="evenodd" \/>/, "the castle is drawn even-odd");
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/** Relative luminance of "#rrggbb" (WCAG), and the contrast between two colours. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** What src/emails/EmailChrome.tsx says about its logo and the card it sits on. */
function emailChrome() {
  const source = strip(readFileSync(at("src/emails/EmailChrome.tsx"), "utf8"));
  const logoPath = source.match(/const LOGO_PATH = "([^"]+)";/)?.[1];
  const logoWidth = Number(source.match(/const LOGO_WIDTH = (\d+);/)?.[1]);
  const card = source.match(/const container: React\.CSSProperties = \{[^}]*?backgroundColor: "(#[0-9a-fA-F]{6})"/)?.[1];
  assert.ok(logoPath && logoWidth && card, "could not read the logo's address, its width and the card's colour in EmailChrome.tsx");
  return { logoPath, logoWidth, card };
}

test("the email logo is the picture made for email: a PNG, sharp at the width it is shown", async () => {
  const { logoPath, logoWidth } = emailChrome();
  const output = OUTPUTS.find((o) => `public${logoPath}` === o.to);
  assert.ok(output, `EmailChrome shows ${logoPath}, which \`npm run brand\` does not make`);
  // Gmail and Outlook do not show SVG. And the file is the one finished for
  // email, copied, not a redraw at some other size.
  assert.match(logoPath, /\.png$/, "mail clients do not show SVG: the email logo is a PNG");
  assert.ok(output.copy, "the email logo is the finished picture from the masters, copied");
  const meta = await sharp(read(output.to)).metadata();
  assert.ok(
    meta.width >= 2 * logoWidth,
    `the logo is ${meta.width}px wide and shown at ${logoWidth}px: it needs two pixels for each one shown to stay sharp`,
  );
  // 600px is the card's widest; its padding is 32px a side.
  assert.ok(logoWidth <= 600 - 2 * 32, "the logo is wider than the card's content");
});

test("the email logo is the lockup made for the ground the card gives it", async () => {
  const { logoPath, card } = emailChrome();
  // The picture's own ink: the commonest fully opaque colour in it.
  const { data } = await pixels(read(`public${logoPath}`));
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    const key = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [ink] = [...counts].sort((a, b) => b[1] - a[1])[0];
  // The colour lockup on a white card measures 8.0. The Night lockup on the
  // same card would be white on white, 1.0, and nothing would say so.
  const ratio = contrast(ink, card.toLowerCase());
  assert.ok(
    ratio >= 4.5,
    `the logo's ink ${ink} on the email card ${card} is ${ratio.toFixed(1)}:1. ` +
      "A light card takes the colour lockup and a dark one the Night lockup.",
  );
});

test("the chrome shows the logo by absolute address, at its declared width, with the society's name", () => {
  const source = strip(readFileSync(at("src/emails/EmailChrome.tsx"), "utf8"));
  const pictures = [...source.matchAll(/<Img\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(pictures.length, 1, "the chrome shows one picture, the logo");
  const [logo] = pictures;
  // A mail client cannot resolve a relative address, so the site's own
  // origin goes in front, and it is the live site unless a deployment says
  // otherwise.
  assert.match(logo, /src=\{`\$\{APP_URL\}\$\{LOGO_PATH\}`\}/, "the logo's address is APP_URL followed by LOGO_PATH");
  assert.match(source, /const APP_URL = process\.env\.NEXT_PUBLIC_APP_URL \?\? "https:\/\/naisi\.uk";/);
  assert.match(logo, /width=\{LOGO_WIDTH\}/, "the width a mail client is told is the one the picture is checked against above");
  assert.match(logo, /alt="Nottingham AI Safety Initiative"/, "with pictures off, the name is what a reader sees");
  // The picture is 600 by 261: at 300 wide its height is 130.5, and either
  // whole number squeezes it. Left out, a mail client works it out.
  assert.doesNotMatch(logo, /\bheight=/, "a height attribute on the logo squeezes it");
});

// ---------------------------------------------------------------------------
// Link previews
// ---------------------------------------------------------------------------

test("the link-preview card is the size a preview takes, and the root layout leaves Next to declare it", async () => {
  const meta = await sharp(read("src/app/opengraph-image.png")).metadata();
  assert.equal(`${meta.width}x${meta.height}`, "1200x630", "a link-preview card is 1200 by 630");
  assert.equal(meta.hasAlpha, false, "a card with transparency is shown on whatever colour the app behind it picks");
  assert.equal(readFileSync(at("src/app/opengraph-image.alt.txt"), "utf8"), "Nottingham AI Safety Initiative");

  const layout = strip(readFileSync(at("src/app/layout.tsx"), "utf8"));
  // Next writes og:image and twitter:image from the file only while the root
  // layout sets no `images` of its own, and static discovery of the icons
  // and the manifest loses nothing to an explicit value only while none is
  // written. Either key, added here, quietly takes the generated file's place.
  assert.doesNotMatch(layout, /\bimages\s*:/, "the root layout sets `images`: the generated card is no longer what a shared link shows");
  assert.doesNotMatch(layout, /\bicons\s*:/, "the root layout sets `icons`: Next already reads favicon.ico, icon.svg and apple-icon.png");
  assert.doesNotMatch(layout, /\bmanifest\s*:/, "the root layout sets `manifest`: Next already reads src/app/manifest.ts");
  // A 1200 by 630 card is the large format.
  assert.match(layout, /twitter:\s*\{\s*card:\s*"summary_large_image"\s*\}/);
});
