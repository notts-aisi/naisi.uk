/**
 * A certificate's PDF (`GET /api/courses/certificates/[code]/pdf`, board
 * en-cert's Download PDF), drawn by PDFKit (`src/lib/courses/certificates/pdf.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * What is held: the PDF says the certificate's words and nothing else, in the
 * same order as its page, from the same view; it embeds the house's three
 * fonts and never one of PDFKit's own; only its owner, signed in as
 * themselves, downloads it, whether or not its link is on; everybody else
 * and every code that opens nothing get one answer; PDFKit is imported by one
 * server-only file and stays outside the bundle, and the build traces the
 * fonts it reads.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, END, certificateDoc, certificatePath, makeCertificateWorld, short } from "./lib/certificateWorld.mjs";
import { resolveImport, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

mock.timers.enable({ apis: ["Date"], now: END });
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const made = await makeCertificateWorld("__certificatePdf");
const { world, reset, loadTs, call, everything } = made;
const model = await loadTs(join("lib", "courses", "certificates", "model.ts"));
const face = await loadTs(join("lib", "courses", "certificates", "face.ts"));
const layout = await loadTs(join("lib", "courses", "certificates", "pdfLayout.ts"));
const pdf = await loadTs(join("lib", "courses", "certificates", "pdf.ts"));
const record = await loadTs(join("lib", "courses", "certificates", "record.ts"));
const route = await loadTs(join("app", "api", "courses", "certificates", "[code]", "pdf", "route.ts"));

const AMARA = "K7Q2M9XH4PWR3TDB";
const RAHUL = "R3H8T5VW2KQ9MZ4C";

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(certificatePath("amara"), certificateDoc("amara", { code: AMARA }));
  world.db.seed(
    certificatePath("rahul", "facilitated"),
    certificateDoc("rahul", { kind: "facilitated", name: "Rahul Mehta", code: RAHUL }),
  );
});

const stored = (uid, kind = "finished") =>
  model.normalizeCertificate(certificatePath(uid, kind).split("/")[1], world.db.read(certificatePath(uid, kind)));

/** The PDF's bytes as text, for its structure: its fonts and its header. */
const asText = (bytes) => Buffer.from(bytes).toString("latin1");

const STANDARD_FONTS = /Helvetica|Times-Roman|Times-Bold|Courier|Symbol|ZapfDingbats/;

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

describe("the PDF's words", () => {
  test("a finished certificate whose link is on: the board's words, in order, the mono lines in capitals", () => {
    const view = face.faceOf("finished", stored("amara").snapshot, { host: "naisi.uk", code: AMARA });
    assert.deepEqual(layout.pdfWords(view), [
      "Nottingham",
      "AI Safety",
      "Initiative",
      "CERTIFICATE · AUTUMN 2026",
      "Amara Okafor",
      "finished the",
      "AGI Strategy Fellowship",
      "6 WEEKS · BASED ON THE BLUEDOT IMPACT CURRICULUM",
      "Issued on Mon 14 Dec 2026 by NAISI, the AI safety student community at the University of Nottingham.",
      `CHECK IT AT NAISI.UK/C/${AMARA}`,
    ]);
  });

  test("with the link off there is no check line, as on the page", () => {
    const view = face.faceOf("finished", stored("amara").snapshot, null);
    assert.ok(!layout.pdfWords(view).some((words) => words.startsWith("CHECK IT AT")));
  });

  test("a facilitator's: no eyebrow, and the term and the credit in its meta line", () => {
    const view = face.faceOf("facilitated", stored("rahul", "facilitated").snapshot, null);
    assert.deepEqual(layout.pdfWords(view), [
      "Nottingham",
      "AI Safety",
      "Initiative",
      "Rahul Mehta",
      "facilitated a group on the",
      "AGI Strategy Fellowship",
      "AUTUMN 2026 · 6 WEEKS · BASED ON THE BLUEDOT IMPACT CURRICULUM",
      "Issued on Mon 14 Dec 2026 by NAISI, the AI safety student community at the University of Nottingham.",
    ]);
  });

  test("the renderer draws exactly those words and no others", async () => {
    for (const [uid, kind, check] of [
      ["amara", "finished", { host: "naisi.uk", code: AMARA }],
      ["amara", "finished", null],
      ["rahul", "facilitated", { host: "naisi.uk", code: RAHUL }],
    ]) {
      const view = face.faceOf(kind, stored(uid, kind).snapshot, check);
      const { drawn } = await pdf.renderCertificatePdf(view, stored(uid, kind).issuedAt);
      assert.deepEqual(drawn, layout.pdfWords(view), `${uid} ${kind}`);
    }
  });

  test("its file name is the house's, with the code", () => {
    assert.equal(layout.pdfFileName(AMARA), `naisi-certificate-${AMARA}.pdf`);
  });
});

// ---------------------------------------------------------------------------
// What it is made of
// ---------------------------------------------------------------------------

describe("the PDF itself", () => {
  test("is a PDF, embedding the house's three fonts and never one of PDFKit's own", async () => {
    const view = face.faceOf("finished", stored("amara").snapshot, { host: "naisi.uk", code: AMARA });
    const { bytes } = await pdf.renderCertificatePdf(view, stored("amara").issuedAt);
    const text = asText(bytes);
    assert.ok(text.startsWith("%PDF-"), "not a PDF");
    assert.match(text.trimEnd(), /%%EOF$/);
    const fonts = [...text.matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z-]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(fonts)].sort(), ["SpaceGrotesk-Regular", "SpaceGrotesk-SemiBold", "SpaceMono-Regular"]);
    assert.doesNotMatch(text, STANDARD_FONTS, "PDFKit reached for one of its own fonts");
    // The document's FIRST font is ours: PDFKit names fonts F1, F2, ... in the
    // order they are opened, and opens Helvetica as F1 whenever it is not
    // handed a font when it is made, writing nothing of it if it is never
    // used. So F1 being Space Grotesk is the proof it never reached for its own.
    const first = text.match(/\/F1 (\d+) 0 R/)?.[1];
    assert.ok(first, "the page names no first font");
    const object = text.slice(text.indexOf(`\n${first} 0 obj`), text.indexOf("endobj", text.indexOf(`\n${first} 0 obj`)));
    assert.match(object, /\/BaseFont \/(?:[A-Z]{6}\+)?SpaceGrotesk-Regular/, "the document's first font is not Space Grotesk");
    // Titled for its owner, and made by nobody but NAISI: PDFKit writes each
    // value of the document's information as an object of its own.
    const value = (key) => {
      const ref = text.match(new RegExp(`/${key} (\\d+) 0 R`))?.[1];
      return ref ? text.match(new RegExp(`\\n${ref} 0 obj\\n\\(([^)]*)\\)`))?.[1] : undefined;
    };
    assert.equal(value("Title"), "Certificate for Amara Okafor");
    for (const key of ["Author", "Creator", "Producer"]) assert.equal(value(key), "NAISI", key);
    assert.doesNotMatch(text, /PDFKit/);
  });

  test("the fonts it reads are in the repository, each beside its licence", () => {
    const dir = join(SRC, "lib", "courses", "certificates", "fonts");
    assert.deepEqual(readdirSync(dir).sort(), [
      "SpaceGrotesk-OFL.txt",
      "SpaceGrotesk-Regular.ttf",
      "SpaceGrotesk-SemiBold.ttf",
      "SpaceMono-OFL.txt",
      "SpaceMono-Regular.ttf",
    ]);
    for (const licence of ["SpaceGrotesk-OFL.txt", "SpaceMono-OFL.txt"]) {
      assert.match(readFileSync(join(dir, licence), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
    }
    assert.match(readFileSync(join(dir, "SpaceGrotesk-OFL.txt"), "utf8"), /The Space Grotesk Project Authors/);
    assert.match(readFileSync(join(dir, "SpaceMono-OFL.txt"), "utf8"), /The Space Mono Project Authors/);
    assert.equal(pdf.CERTIFICATE_FONT_DIR, dir, "the renderer reads them from somewhere else");
  });
});

// ---------------------------------------------------------------------------
// Who downloads it
// ---------------------------------------------------------------------------

describe("who downloads it", () => {
  const get = (who, code, opts = {}) => call(who, route.GET, { code }, opts);

  test("its owner, with the link off or on: a PDF to save, kept out of caches and search results", async () => {
    for (const on of [false, true]) {
      world.db.poke(certificatePath("amara"), { linkOn: on });
      const answer = await get("amara", AMARA);
      assert.equal(answer.status, 200);
      assert.equal(answer.headers["content-type"], "application/pdf");
      assert.equal(answer.headers["content-disposition"], `attachment; filename="naisi-certificate-${AMARA}.pdf"`);
      assert.equal(answer.headers["cache-control"], "private, no-store");
      assert.equal(answer.headers["x-robots-tag"], "noindex");
      assert.ok(asText(answer.bytes).startsWith("%PDF-"));
      assert.equal(Number(answer.headers["content-length"]), answer.bytes.length);
    }
    // Typed in small letters, it is the same certificate.
    assert.equal((await get("amara", AMARA.toLowerCase())).status, 200);
  });

  test("the PDF carries the check line only while the link is on", async () => {
    const viewer = { uid: "amara" };
    assert.equal((await record.certificatePdfFor(world.courseDb, AMARA, viewer, false, APP_URL)).face.check, null);
    world.db.poke(certificatePath("amara"), { linkOn: true });
    assert.equal(
      (await record.certificatePdfFor(world.courseDb, AMARA, viewer, false, APP_URL)).face.check,
      `Check it at naisi.invalid/c/${AMARA}`,
    );
  });

  test("nobody else, even while the link is on, and no code that opens nothing: one answer, and nothing written", async () => {
    const before = everything();
    const answer = [404, "There’s no certificate here."];
    for (const on of [false, true]) {
      world.db.poke(certificatePath("amara"), { linkOn: on });
      for (const uid of ["dev", "bea", "claudia", "tess", "zach", "sofia", "rahul"]) {
        assert.deepEqual(short(await get(uid, AMARA)), answer, `${uid}, link ${on ? "on" : "off"}`);
      }
    }
    world.db.poke(certificatePath("amara"), { linkOn: false });
    for (const code of ["ZZZZZZZZZZZZZZZZ", "K7Q2M9", "../x", "%2F"]) assert.deepEqual(short(await get("amara", code)), answer, code);
    assert.equal(everything(), before);
  });

  test("an admin viewing as the owner is not the owner; somebody signed out is asked to sign in", async () => {
    assert.deepEqual(short(await get("amara", AMARA, { viewAs: true })), [404, "There’s no certificate here."]);
    assert.equal((await get(null, AMARA)).status, 401);
  });

  test("a facilitator downloads their own certificate, and somebody holding both downloads each", async () => {
    world.db.seed(certificatePath("amara", "facilitated"), certificateDoc("amara", { kind: "facilitated", code: "F4C1X1TAT0R5AB2C" }));
    assert.equal((await get("rahul", RAHUL)).status, 200);
    assert.equal((await get("amara", "F4C1X1TAT0R5AB2C")).status, 200);
    assert.equal((await get("amara", AMARA)).status, 200);
    assert.equal((await get("rahul", "F4C1X1TAT0R5AB2C")).status, 404);
  });
});

// ---------------------------------------------------------------------------
// Where the library may be, and how the build carries it
// ---------------------------------------------------------------------------

/** `import ... from "x"` and `export ... from "x"`, however many lines it spans. */
const FROM_STATEMENT = /(?:^|\n)([ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
/** `import "x"`, the side-effect form. */
const BARE_IMPORT = /(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g;
/** `import("x")`. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Every module a file's code (comments gone, strings kept) takes values from: a statement that imports only types loads nothing. */
function valueImports(code) {
  const out = [];
  for (const [, statement, specifier] of code.matchAll(FROM_STATEMENT)) {
    const braces = /^\s*(?:import|export)\s*\{([^}]*)\}\s*from/.exec(statement);
    const typesOnly =
      /^\s*(?:import|export)\s+type\b/.test(statement) ||
      (braces !== null && braces[1].split(",").map((entry) => entry.trim()).filter(Boolean).every((entry) => /^type\s/.test(entry)));
    if (!typesOnly) out.push(specifier);
  }
  for (const [, specifier] of code.matchAll(BARE_IMPORT)) out.push(specifier);
  for (const [, specifier] of code.matchAll(DYNAMIC_IMPORT)) out.push(specifier);
  return out;
}

describe("the library", () => {
  function* walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) yield* walk(full);
      else if (/\.(tsx?|mjs|js)$/.test(entry)) yield full;
    }
  }

  test("one server-only file imports PDFKit, and no client file does", () => {
    const importers = [];
    let clients = 0;
    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(source)) clients += 1;
      if (/from\s+["']pdfkit["']|require\(\s*["']pdfkit["']\s*\)|import\(\s*["']pdfkit["']\s*\)/.test(source)) {
        importers.push(relative(REPO_ROOT, file));
        assert.doesNotMatch(source, /^\s*["']use client["']/, `${file} is a client file`);
        assert.match(source, /^import "server-only";/m, `${file} imports PDFKit and is not server-only`);
      }
    }
    assert.deepEqual(importers, ["src/lib/courses/certificates/pdf.ts"]);
    assert.ok(clients > 50, "the walk found too few client files to mean anything");
  });

  // The fonts are read from disk when a route runs (`CERTIFICATE_FONT_DIR` in
  // pdf.ts), by a path the build cannot see, so every route whose imports
  // reach pdf.ts needs its own tracing line in next.config.ts, or it works on
  // a laptop and fails deployed. Held both ways round, from a walk of every
  // file's imports: each route that reaches the fonts is traced, and each
  // traced route reaches them. Today that is a certificate's and a course's
  // printables'; a third fails here until it is traced and listed.
  test("the build keeps PDFKit outside the bundle and traces the fonts into every route that reads them: a certificate's and a course's printables'", () => {
    const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
    assert.match(config, /serverExternalPackages: \["pdfkit"\]/);
    const fontReader = join(SRC, "lib", "courses", "certificates", "pdf.ts");
    assert.match(readFileSync(fontReader, "utf8"), /readFileSync\(join\(CERTIFICATE_FONT_DIR, FONT_FILES\[name\]\)\)/, "the fonts are read somewhere else now: walk from there");
    // Who imports whom, for values (a type-only import loads nothing).
    const importers = new Map();
    let files = 0;
    for (const file of walkSource(SRC)) {
      files += 1;
      for (const specifier of valueImports(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) {
        const target = resolveImport(file, specifier, SRC);
        if (!target) continue;
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(file);
      }
    }
    assert.ok(files > 500, "the walk found too few files to mean anything");
    const reaching = new Set([fontReader]);
    const queue = [fontReader];
    while (queue.length > 0) {
      for (const by of importers.get(queue.pop()) ?? []) {
        if (!reaching.has(by)) {
          reaching.add(by);
          queue.push(by);
        }
      }
    }
    const app = join(SRC, "app");
    const readers = [...reaching]
      .filter((file) => file.startsWith(`${app}${sep}`) && /[\\/](?:route\.ts|page\.tsx)$/.test(file))
      .map((file) => relative(app, file).split(sep).join("/"))
      .sort();
    assert.deepEqual(readers, ["api/courses/[courseId]/facilitator-guide/printables/pdf/route.ts", "api/courses/certificates/[code]/pdf/route.ts"]);
    // The routes the build traces the fonts into, as next.config.ts names them.
    const block = /outputFileTracingIncludes: \{([\s\S]*?)\n {2}\},/.exec(config);
    assert.ok(block, "could not find the build's list of traced files");
    const traced = [...block[1].matchAll(/^\s*"([^"]+)": \["\.\/src\/lib\/courses\/certificates\/fonts\/\*"\],$/gm)]
      .map(([, key]) => `${key.replace(/\\/g, "").replace(/^\//, "")}/route.ts`)
      .sort();
    assert.deepEqual(traced, readers, "every route that reads the fonts is traced, and only those");
    assert.match(config, /"\/api\/courses\/certificates\/\\\\\[code\\\\\]\/pdf": \["\.\/src\/lib\/courses\/certificates\/fonts\/\*"\]/);
    // Each key names a route that exists, and the files are where it says.
    for (const route of readers) assert.ok(existsSync(join(app, ...route.split("/"))), route);
    assert.equal(readdirSync(join(SRC, "lib", "courses", "certificates", "fonts")).filter((f) => f.endsWith(".ttf")).length, 3);
  });

  test("the route reads and draws, and writes nothing", () => {
    const source = readFileSync(join(SRC, "app", "api", "courses", "certificates", "[code]", "pdf", "route.ts"), "utf8");
    assert.doesNotMatch(source, /\.(set|update|delete|add|create)\(|runTransaction|batch\(|assertNotImpersonating/);
    assert.match(source, /export async function GET\(/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  });
});
