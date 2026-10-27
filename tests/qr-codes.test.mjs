/**
 * A SHORT LINK'S QR CODE: drawn on the server, downloaded as a PNG, printed on
 * an A4 sign and shown full screen, and every one of them encodes this site's
 * own `/q/<slug>`, never where the link goes (docs/tracked-links.md).
 *
 * The pictures are READ BACK: each PNG is decoded with the QR library's own
 * reader, so "it encodes the short address" is a fact about the file a person
 * downloads, not about the string handed to the encoder. The SVG is checked
 * square for square against the same grid.
 *
 * The route and the sign page run for real (`tests/lib/checkInWorld.mjs`), as
 * every kind of caller: signed out, a pending account, a member, committee
 * the SU does not recognise, SU-recognised committee and an admin. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crc32, inflateSync } from "node:zlib";
import decodeQR from "qr/decode.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ORIGIN, makeCheckInWorld, textOf } from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__qrCodes");
const { routes, pages, call, render, loadTs } = w;
const code = await loadTs("lib/qr/shortLinkCode.ts");

const qrUrl = (slug, query = "") => `https://internal.invalid/api/links/${slug}/qr${query}`;
const draw = (slug, as, query = "") => call(routes.qr.GET, { as, params: { slug }, url: qrUrl(slug, query) });

/** Reads a one-bit greyscale PNG the way an image viewer would, checking every chunk's CRC. */
function readPng(bytes) {
  const buf = Buffer.from(bytes);
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  let at = 8;
  let header = null;
  const idat = [];
  let ended = false;
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("ascii");
    const data = buf.subarray(at + 8, at + 8 + length);
    assert.equal(buf.readUInt32BE(at + 8 + length), crc32(buf.subarray(at + 4, at + 8 + length)), `${type} CRC`);
    if (type === "IHDR") header = data;
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") ended = true;
    at += 12 + length;
  }
  assert.ok(header && ended, "IHDR and IEND are there");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  assert.deepEqual([header[8], header[9], header[12]], [1, 0, 0], "one-bit greyscale, no interlace");
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = Math.ceil(width / 8);
  assert.equal(raw.length, height * (rowBytes + 1), "every row is there");
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1);
    assert.equal(raw[start], 0, "rows are unfiltered");
    for (let x = 0; x < width; x++) {
      const white = (raw[start + 1 + (x >> 3)] >> (7 - (x & 7))) & 1;
      const i = (y * width + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = white ? 255 : 0;
      rgba[i + 3] = 255;
    }
  }
  return { width, height, rgba };
}

/** What a phone reads off a PNG. */
function scan(bytes) {
  const { width, height, rgba } = readPng(bytes);
  return decodeQR({ width, height, data: rgba });
}

/** The dark squares an SVG path draws, as "x,y" strings. */
function squaresOfPath(d) {
  const out = new Set();
  for (const [, x, y, run] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let i = 0; i < Number(run); i++) out.add(`${Number(x) + i},${y}`);
  }
  assert.equal(d.replace(/M\d+ \d+h(\d+)v1h-\1z/g, ""), "", "the path is nothing but runs");
  return out;
}

function squaresOfGrid(grid) {
  const out = new Set();
  grid.forEach((row, y) => row.forEach((dark, x) => dark && out.add(`${x},${y}`)));
  return out;
}

// ---------------------------------------------------------------------------
// What a code encodes
// ---------------------------------------------------------------------------

describe("what a code encodes", () => {
  test("a PNG reads back as this site's /q/<slug>, and never as where the link goes", () => {
    for (const slug of ["poster", "insta", "vr-in", "a-very-long-slug"]) {
      assert.equal(scan(code.qrPng(code.shortLinkUrl(slug))), `${ORIGIN}/q/${slug}`, slug);
    }
  });

  test("the site's address comes from its setting, so the dev site draws codes for itself", (t) => {
    t.after(() => {
      process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
    });
    process.env.NEXT_PUBLIC_APP_URL = "https://dev.naisi.uk/";
    assert.equal(code.shortLinkUrl("poster"), "https://dev.naisi.uk/q/poster");
    assert.equal(code.shortLinkAddress("poster"), "dev.naisi.uk/q/poster");
    assert.equal(scan(code.qrPng(code.shortLinkUrl("poster"))), "https://dev.naisi.uk/q/poster");
    process.env.NEXT_PUBLIC_APP_URL = "";
    assert.equal(code.shortLinkUrl("poster"), "https://naisi.uk/q/poster", "unset falls back to the live site");
  });

  test("the address a person types from a sign has no scheme", () => {
    assert.equal(code.shortLinkAddress("vr-in"), "naisi.uk/q/vr-in");
  });

  test("anything that is not a slug is refused before it can be encoded", () => {
    for (const bad of ["", "UPPER", "../admin", "a b", "x/y", "https://example.com", "a".repeat(80)]) {
      assert.throws(() => code.shortLinkUrl(bad), /Not a short link/, JSON.stringify(bad));
    }
  });

  test("the SVG draws exactly the squares the PNG does, on a white ground with four squares of margin", () => {
    const text = code.shortLinkUrl("vr-in");
    const grid = code.qrGrid(text);
    const shape = code.qrShape(text);
    assert.equal(shape.size, grid.length);
    assert.deepEqual(squaresOfPath(shape.d), squaresOfGrid(grid));
    for (let i = 0; i < code.QUIET_ZONE; i++) {
      assert.ok(grid[i].every((dark) => !dark) && grid.every((row) => !row[i]), `margin row and column ${i}`);
    }
    const svg = code.qrSvg(text, `QR code for <naisi.uk/q/vr-in> & "more"`);
    assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/);
    assert.match(svg, /<title>QR code for &lt;naisi.uk\/q\/vr-in&gt; &amp; &quot;more&quot;<\/title>/);
    const { width, rgba } = readPng(code.qrPng(text));
    assert.equal(width, grid.length * code.PNG_SCALE, "the PNG is the grid at its scale");
    // Black squares on white, as printed: a reader also reads the code
    // inverted, so the scan above cannot tell the two apart.
    const pixel = (x, y) => rgba[(y * width + x) * 4];
    const finder = code.QUIET_ZONE * code.PNG_SCALE;
    assert.equal(pixel(0, 0), 255, "the quiet zone is white");
    assert.equal(pixel(finder, finder), 0, "the finder pattern's corner is black");
    assert.equal(pixel(finder + code.PNG_SCALE, finder + code.PNG_SCALE), 255, "the finder pattern's ring is white");
  });
});

// ---------------------------------------------------------------------------
// The picture route
// ---------------------------------------------------------------------------

describe("GET /api/links/<slug>/qr", () => {
  test("signed out: 401, and nothing is read or written", async () => {
    w.reset();
    const reads = w.world.db.stats.reads;
    const res = await draw("poster", null);
    assert.equal(res.status, 401);
    assert.equal(w.world.db.stats.reads, reads, "no document was read");
  });

  test("only an admin may draw a link's code: everybody else is refused", async () => {
    // Nobody who cannot run check-in reads a thing.
    for (const who of ["ines", "kofi", "iris"]) {
      w.reset();
      const reads = w.world.db.stats.reads;
      const res = await draw("poster", who);
      assert.equal(res.status, 403, who);
      assert.equal(res.body.error, "Only admins can print or download this code.", who);
      assert.equal(w.world.db.stats.reads, reads, `${who}: no document was read`);
    }
    // SU-recognised committee may draw a door code (tests/event-door-code.test.mjs),
    // so the link is read to see whether it is one; this one is not.
    w.reset();
    const res = await draw("poster", "sue");
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Only admins can print or download this code.");
    assert.equal(res.raw, null, "no picture");
  });

  test("an admin gets a PNG by default, the SVG on asking, and a file to save with download=1", async () => {
    w.reset();
    const png = await draw("poster", "zach");
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.equal(png.headers.get("content-disposition"), 'inline; filename="naisi-q-poster.png"');
    assert.equal(png.headers.get("x-content-type-options"), "nosniff");
    assert.match(png.headers.get("cache-control"), /^private/);
    assert.equal(scan(png.raw), `${ORIGIN}/q/poster`);

    const saved = await draw("poster", "zach", "?format=png&download=1");
    assert.equal(saved.headers.get("content-disposition"), 'attachment; filename="naisi-q-poster.png"');

    const svg = await draw("insta", "zach", "?format=svg");
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.equal(svg.headers.get("content-security-policy"), "default-src 'none'");
    assert.ok(!svg.raw.includes("instagram"), "the SVG carries nothing of where the link goes");
    const d = svg.raw.match(/ d="([^"]+)"/)[1];
    assert.deepEqual(squaresOfPath(d), squaresOfGrid(code.qrGrid(`${ORIGIN}/q/insta`)));
  });

  test("a code on the printed list with no record yet is drawn from the list", async () => {
    w.reset();
    assert.equal(w.world.db.read("trackedLinks/brochure"), undefined, "no record");
    const res = await draw("brochure", "zach");
    assert.equal(res.status, 200);
    assert.equal(scan(res.raw), `${ORIGIN}/q/brochure`);
  });

  test("a slug that names no link is a 404, and the upper-case form of a real one is the same link", async () => {
    w.reset();
    assert.equal((await draw("nothing-here", "zach")).status, 404);
    assert.equal((await draw("not a slug", "zach")).status, 404);
    const upper = await draw("POSTER", "zach");
    assert.equal(upper.status, 200);
    assert.equal(scan(upper.raw), `${ORIGIN}/q/poster`);
  });

  test("a format it does not draw is a 400 with a sentence, asked before the link is read", async () => {
    w.reset();
    const reads = w.world.db.stats.reads;
    const res = await draw("poster", "zach", "?format=gif");
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Ask for format=png or format=svg.");
    assert.equal(w.world.db.stats.reads, reads);
  });

  test("drawing writes nothing, whoever asks", async () => {
    w.reset();
    const before = w.everything();
    for (const who of [null, "kofi", "sue", "zach"]) {
      await draw("poster", who);
      await draw("poster", who, "?format=svg&download=1");
    }
    assert.equal(w.everything(), before);
    assert.equal(w.world.db.stats.writes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// The A4 sign
// ---------------------------------------------------------------------------

describe("the A4 sign at /signs/<slug>", () => {
  test("signed out is sent to sign in, and brought back here after", async () => {
    w.reset();
    assert.deepEqual(await render(pages.sign, { params: { slug: "poster" } }), {
      redirect: "/login?next=%2Fsigns%2Fposter",
    });
    assert.deepEqual(await render(pages.sign, { params: { slug: "../x" } }), { redirect: "/login" });
  });

  test("anybody but an admin is told why, and is not shown the code", async () => {
    for (const who of ["kofi", "iris", "sue"]) {
      w.reset();
      const page = await render(pages.sign, { as: who, params: { slug: "poster" } });
      assert.match(page.text, /No sign to print Only admins can print or download this code\./, who);
      assert.ok(!page.html.includes("<svg"), `${who} sees no code`);
    }
  });

  test("an admin gets the link's name, the code and the address written out, and a way back", async () => {
    w.reset();
    const page = await render(pages.sign, { as: "zach", params: { slug: "poster" } });
    assert.match(page.text, /Back One A4 sheet\. The code always goes to naisi\.uk\/q\/poster\. Print/);
    assert.match(page.text, /General society poster naisi\.uk\/q\/poster$/);
    assert.match(page.html, /<a href="\/admin\/links"/);
    assert.match(page.html, /aria-label="QR code for naisi.uk\/q\/poster"/);
    const d = page.html.match(/<path fill="#000" d="([^"]+)"/)[1];
    assert.deepEqual(squaresOfPath(d), squaresOfGrid(code.qrGrid(`${ORIGIN}/q/poster`)));
    // Print waits for the page's script, rather than doing nothing when pressed.
    assert.match(page.html, /<button[^>]*disabled=""[^>]*>.*Print/);
  });

  test("an unknown link is said so, never a blank page", async () => {
    w.reset();
    const page = await render(pages.sign, { as: "zach", params: { slug: "nothing-here" } });
    assert.match(page.text, /No sign to print There is no short link at that address\./);
  });
});

// ---------------------------------------------------------------------------
// The console's three actions
// ---------------------------------------------------------------------------

describe("the console's card for one link", () => {
  test("offers Download PNG, Print an A4 sign and Show full screen, each from the slug alone", async () => {
    const { TrackedLinkPanel } = await loadTs("features/admin/links/TrackedLinkPanel.tsx");
    const link = {
      slug: "insta",
      label: "Instagram bio",
      destination: "https://www.instagram.com/example",
      type: "link",
      campaign: "",
      active: true,
      countOffsite: false,
      createdAt: null,
      updatedAt: null,
      createdByUid: "zach",
      updatedByUid: "zach",
    };
    const html = renderToStaticMarkup(
      createElement(TrackedLinkPanel, {
        id: "panel",
        link,
        campaigns: [],
        origin: ORIGIN,
        stats: { scans: 0, signupsStarted: 0, signupsConfirmed: 0, byDay: {}, byHour: {} },
        fromDate: null,
        onSave: async () => {},
        onClose: () => {},
      }),
    );
    const text = textOf(html);
    assert.match(text, /Download PNG Print an A4 sign Show full screen/);
    assert.match(html, /href="\/api\/links\/insta\/qr\?format=png&amp;download=1" download="naisi-q-insta.png"/);
    assert.match(html, /href="\/signs\/insta" target="_blank" rel="noopener"/);
    assert.ok(!html.includes("instagram.com/example\" download"), "nothing is drawn from the destination");
  });
});
