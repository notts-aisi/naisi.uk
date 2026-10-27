/**
 * A COURSE'S PRINTABLES AS PDFs, ONE PER SESSION: the split
 * (`src/lib/courses/facilitatorGuide/printables.ts`), the layout and the
 * drawing (`printablesLayout.ts`, `printablesPdf.ts`, `printablesGlyphs.ts`),
 * the route `GET /api/courses/[courseId]/facilitator-guide/printables/pdf`,
 * and the links to it on the guide's pages, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHICH SESSION a section belongs to, read from its "##" heading in every
 *     shape the course docs write one, and headings that name none; the
 *     loader's two things to check (a heading naming no session, a character
 *     the PDF cannot draw).
 *  2. WHAT IS DRAWN is the document's own words in its order and nothing
 *     else, every template to the character, on A4 portrait, in the house's
 *     three fonts and never one of PDFKit's own.
 *  3. WHAT IS NEVER SPLIT across a page when it fits on the next one: a row,
 *     a template, a block, a section; a heading and a label stay with what
 *     follows; only what is taller than a page is split; nothing is drawn
 *     past the margins.
 *  4. CHARACTERS: the other face, then a box, never nothing; the tables of
 *     what each face draws are the font files' own.
 *  5. WHO: the route as an admin, a facilitator of a live group on the
 *     course, the programme's lead, a facilitator of another course, a track
 *     lead, a reviewer, somebody taking part, a view-as session and somebody
 *     signed out. Everybody refused gets the guide's calm sentence and not a
 *     byte of a PDF, and nothing is ever written.
 *  6. THE LINKS on the Printables page and on a week's page.
 *  7. THE BUILD: PDFKit stays behind one door, and the fonts are traced into
 *     the route.
 *
 * Every document here is made up, in the shapes the real printables take.
 * Real: see `tests/lib/facilitatorGuideWorld.mjs`, plus PDFKit and the
 * fonts.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE, NOW, RUN, makeFacilitatorGuideWorld } from "./lib/facilitatorGuideWorld.mjs";
import { PLAN_W1, PRINTABLES } from "./lib/facilitatorGuideFixture.mjs";
import { B } from "./lib/facilitatorPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const w = await makeFacilitatorGuideWorld("__facilitatorGuidePrintables");
const { world, reset, seedGuide, load, docPage, everything, loadTs, sessionFor } = w;
const GUIDE = join("lib", "courses", "facilitatorGuide");
const printables = await loadTs(join(GUIDE, "printables.ts"));
const layoutLib = await loadTs(join(GUIDE, "printablesLayout.ts"));
const glyphs = await loadTs(join(GUIDE, "printablesGlyphs.ts"));
const pdf = await loadTs(join(GUIDE, "printablesPdf.ts"));
const house = await loadTs(join("lib", "courses", "certificates", "pdf.ts"));
const { model, markdown, words } = w.guide;
const route = await loadTs(join("app", "api", "courses", "[courseId]", "facilitator-guide", "printables", "pdf", "route.ts"));

const PRINTABLES_SLOT = { kind: "course", key: "printables" };
const REFUSED = "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.";
const AGI_PDF = `/api/courses/${COURSE.agi}/facilitator-guide/printables/pdf`;

/** A document as the loader stores it. */
const stored = (md) => {
  const read = markdown.readGuideMarkdown(md, PRINTABLES_SLOT);
  assert.deepEqual(read.problems, [], "the made-up printables should load");
  return read.doc;
};

/**
 * Made-up printables in every shape the real ones take: a line on how to
 * print, an "Every week" section, sections for one session, a section with
 * "###" parts and a table of cards, a section for a range of sessions and one
 * for two, a label in bold before a quote, a heading that names no session,
 * and templates with spaces, a tab and blank lines inside them.
 */
const SHAPES = `# Printables

Everything to print, evening by evening. Print single-sided; cut cards along the lines.

## Every week: the cloud diary

Print a stack of diary slips for each evening:

\`\`\`markdown
CLOUD DIARY            Date: ________

What I saw:
How sure am I?         ____%
\`\`\`

## Session 1: forecast card

One per fellow, sealed in an envelope.

\`\`\`markdown
MY FORECAST (sealed until week 6)

Name: ______________________

1. Rain by Friday lunchtime?             ____%
\tA line that starts with a tab
\`\`\`

## Session 1, Option C: the storm brief

### The brief

- A storm crossed the valley on a Tuesday.
- The barometer fell *two days* running.

### Role cards

| Role | What you want | What limits you |
| --- | --- | --- |
| Farmer | Dry hay by Friday | One tractor |
| Pilot | A clear runway | **Fuel** for one try |

## Cloud cards (session 2)

Print one set per group and cut along the rows.

| Card | Cloud |
| --- | --- |
| 1 | Cumulus |
| 2 | Stratus |

## Wind slips (end of sessions 2 to 4)

- End of session 2: week 3's slips.
- End of session 3: week 4's slips.

## Sessions 3 and 5: the barometer sheet

**Rules for the reader**

> Read it twice, slowly. The second time, stop at every number.

## Where to buy card

Any stationer has it. See [the shop](https://example.org/card).

## Session 6: certificate wording

\`\`\`markdown
WEATHER FELLOWSHIP

[Full name]
\`\`\`
`;

/** Every heading of SHAPES, in order, with the sessions it names. */
const SHAPES_SECTIONS = [
  ["Every week: the cloud diary", { kind: "every" }],
  ["Session 1: forecast card", { kind: "some", sessions: [1] }],
  ["Session 1, Option C: the storm brief", { kind: "some", sessions: [1] }],
  ["Cloud cards (session 2)", { kind: "some", sessions: [2] }],
  ["Wind slips (end of sessions 2 to 4)", { kind: "some", sessions: [2, 3, 4] }],
  ["Sessions 3 and 5: the barometer sheet", { kind: "some", sessions: [3, 5] }],
  ["Where to buy card", { kind: "none" }],
  ["Session 6: certificate wording", { kind: "some", sessions: [6] }],
];

/** A house PDF to measure with, ended at once: the layout's fonts are PDFKit's own. */
function measure() {
  const { doc } = house.openHousePdf({ layout: "portrait", title: "Measuring" });
  doc.end();
  return pdf.pdfMeasure(doc);
}
const lay = (doc) => layoutLib.layoutPrintables(doc, measure());

/** One request to the PDF route, as `who`, its bytes and headers read as a browser would. */
async function fetchPdf(who, { courseId = COURSE.agi, session, query, viewAs = false } = {}) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  world.viewAs = viewAs;
  const search = query ?? (session === undefined ? "" : `?session=${session}`);
  try {
    const response = await route.GET(new Request(`https://naisi.invalid/api/courses/x/facilitator-guide/printables/pdf${search}`), {
      params: Promise.resolve({ courseId }),
    });
    if (response instanceof Response) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bytes, text: bytes.toString("utf8") };
    }
    return { status: response.status, headers: response.headers, bytes: Buffer.alloc(0), text: JSON.stringify(response.body) };
  } finally {
    world.course = false;
    world.viewAs = false;
  }
}

const isPdf = (bytes) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";

beforeEach(async () => {
  mock.timers.setTime(NOW.getTime());
  reset();
  await seedGuide();
});

// ---------------------------------------------------------------------------
// 1. Which session a section belongs to
// ---------------------------------------------------------------------------

describe("1. which session a section belongs to", () => {
  test("every shape the course docs write a heading in names its sessions", () => {
    const shapes = [
      ["Session 1: credence card", [1]],
      ["Session 1, Option C: the incident", [1]],
      ["Actor cards (session 1)", [1]],
      ["Intervention cards (session 4, Option B)", [4]],
      ["Case slips (end of sessions 1 to 4)", [1, 2, 3, 4]],
      ["Case study briefing card (sessions 2 to 5)", [2, 3, 4, 5]],
      ["Sessions 2 and 3: the barometer", [2, 3]],
      ["Pairs (sessions 2, 3 and 5)", [2, 3, 5]],
      ["Pairs (sessions 2, 3, and 5)", [2, 3, 5]],
      ["Sheets for sessions 1-3", [1, 2, 3]],
      ["Sheets for sessions 1\u20133", [1, 2, 3]],
      ["Session 3 or 4: spare cards", [3, 4]],
      ["Session 10: the long course", [10]],
      ["SESSION 2: in capitals", [2]],
      ['Session 5: "what we found" slip', [5]],
      ["Session 2 cards, then session 4 cards", [2, 4]],
    ];
    for (const [heading, sessions] of shapes) {
      assert.deepEqual(printables.sessionsNamedIn(heading), { kind: "some", sessions }, heading);
    }
  });

  test("every week, each session and all sessions are every session's; a heading naming none is nobody's", () => {
    for (const heading of ["Every week: case slips", "Each week: the diary", "Every session: name cards", "Name cards for each session", "For all sessions: name cards", "All the weeks: a register", "Every week from session 2"]) {
      assert.deepEqual(printables.sessionsNamedIn(heading), { kind: "every" }, heading);
    }
    for (const heading of ["Where to buy card", "Week 3: the fellow guide's own", "Session one: in words", "Session 0: before it starts", "Session 61: past the last week", "Intersession notes", "Printables", ""]) {
      assert.deepEqual(printables.sessionsNamedIn(heading), { kind: "none" }, heading);
    }
  });

  test("the split: a section is its heading and everything to the next one, its ### parts with it, in order", () => {
    const doc = stored(SHAPES);
    const split = printables.splitPrintables(doc.blocks);
    assert.deepEqual(split.sections.map((section) => [section.heading, section.named]), SHAPES_SECTIONS);
    assert.equal(split.preamble.length, 1);
    // Every block is in exactly one part, in order.
    assert.deepEqual([...split.preamble, ...split.sections.flatMap((section) => section.blocks)], doc.blocks);
    const storm = split.sections[2];
    assert.deepEqual(storm.blocks.filter((block) => block.type === "heading").map((block) => [block.level, block.runs[0].text]), [
      [2, "Session 1, Option C: the storm brief"],
      [3, "The brief"],
      [3, "Role cards"],
    ]);
  });

  test("a session's document: the title, the lines before the first heading, then its sections as written, in order", () => {
    const doc = stored(SHAPES);
    const split = printables.splitPrintables(doc.blocks);
    const expect = (indexes) => ({ title: "Printables", blocks: [...split.preamble, ...indexes.flatMap((i) => split.sections[i].blocks)] });
    assert.deepEqual(printables.printablesOfSession(doc, 1), expect([0, 1, 2]));
    assert.deepEqual(printables.printablesOfSession(doc, 2), expect([0, 3, 4]));
    assert.deepEqual(printables.printablesOfSession(doc, 3), expect([0, 4, 5]));
    assert.deepEqual(printables.printablesOfSession(doc, 4), expect([0, 4]));
    assert.deepEqual(printables.printablesOfSession(doc, 5), expect([0, 5]));
    assert.deepEqual(printables.printablesOfSession(doc, 6), expect([0, 7]));
    // "Where to buy card" names no session: it is in no session's document, only in the whole one.
    for (let n = 1; n <= 6; n += 1) {
      assert.doesNotMatch(JSON.stringify(printables.printablesOfSession(doc, n)), /Where to buy card|stationer/, `session ${n}`);
    }
    assert.match(JSON.stringify(doc), /Where to buy card/);
    assert.deepEqual(printables.printablesBySession(doc, 6), [
      { session: 1, sections: 3 },
      { session: 2, sections: 3 },
      { session: 3, sections: 3 },
      { session: 4, sections: 2 },
      { session: 5, sections: 2 },
      { session: 6, sections: 2 },
    ]);
    assert.deepEqual(printables.headingsNamingNoSession(doc.blocks), ["Where to buy card"]);
  });

  test("as many sessions as the guide has weeks: a shorter course has fewer, a course with none has only the whole document", () => {
    const doc = stored(SHAPES);
    assert.deepEqual(printables.printablesBySession(doc, 3).map((row) => row.session), [1, 2, 3]);
    assert.deepEqual(printables.printablesBySession(doc, 0), []);
    assert.equal(printables.printablesBySession(doc, 99).length, model.MAX_GUIDE_WEEK);
    // The count: the longest run's week plan, never fewer than a week loaded, never past the last week.
    assert.equal(model.guideWeekCount([6, 4], [1, 3]), 6);
    assert.equal(model.guideWeekCount([3], [5]), 5);
    assert.equal(model.guideWeekCount([], []), 0);
    assert.equal(model.guideWeekCount([200], []), model.MAX_GUIDE_WEEK);
  });

  test("the loader says when a heading names no session, and only for the Printables", () => {
    const read = markdown.readGuideMarkdown(SHAPES, PRINTABLES_SLOT);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.checks, ["“Where to buy card” names no session, so it goes only in the PDF of all the printables."]);
    const two = markdown.readGuideMarkdown(`${SHAPES}\n## Spare paper\n\nA ream.\n`, PRINTABLES_SLOT);
    assert.deepEqual(two.checks, ["2 headings name no session, so they go only in the PDF of all the printables: “Where to buy card”, “Spare paper”."]);
    // Saving is never refused for it: the section prints in the whole document's PDF.
    assert.deepEqual(two.problems, []);
    // The same heading in the Handbook is nothing to check: only the Printables are split.
    const handbook = markdown.readGuideMarkdown("# Weather Fellowship: facilitator guide\n\n## Where to buy card\n\nAny stationer.\n", { kind: "course", key: "handbook" });
    assert.deepEqual(handbook.checks, []);
    // Every heading naming a session: nothing to check.
    assert.deepEqual(markdown.readGuideMarkdown(PRINTABLES, PRINTABLES_SLOT).checks, []);
  });

  test("the loader names every character the PDF would draw as a box, once each", () => {
    const one = markdown.readGuideMarkdown("# Printables\n\n## Session 1: slips\n\nCut along ✂ the lines.\n", PRINTABLES_SLOT);
    assert.deepEqual(one.checks, ["The PDF can’t draw ✂ (U+2702), so it prints as an empty box."]);
    const three = markdown.readGuideMarkdown("# Printables\n\n## Session 1: slips\n\nTick ✓ and ✓ again, ✂ here.\n\n```\nBOX ☐\n```\n", PRINTABLES_SLOT);
    assert.deepEqual(three.checks, ["The PDF can’t draw 3 characters, so they print as empty boxes: ✓ (U+2713), ✂ (U+2702), ☐ (U+2610)."]);
    assert.deepEqual(three.problems, []);
    assert.deepEqual(markdown.readGuideMarkdown("# Weather Fellowship: facilitator guide\n\n## Notes\n\n✂\n", { kind: "course", key: "handbook" }).checks, []);
  });

  test("the address, the session asked for, the file's name and its title", () => {
    assert.equal(printables.printablesPdfPath(COURSE.agi, 3), `${AGI_PDF}?session=3`);
    assert.equal(printables.printablesPdfPath(COURSE.agi, null), AGI_PDF);
    assert.equal(printables.printablesPdfPath("a b", null), "/api/courses/a%20b/facilitator-guide/printables/pdf");
    for (const [raw, want] of [[null, null], ["1", 1], ["6", 6], ["60", 60], ["61", "bad"], ["0", "bad"], ["03", "bad"], ["3.0", "bad"], ["", "bad"], ["three", "bad"], ["-1", "bad"], ["1e1", "bad"], [" 3", "bad"]]) {
      assert.equal(printables.parseSessionParam(raw), want, String(raw));
    }
    assert.equal(printables.printablesFileName("AGI Strategy Fellowship", 3), "naisi-agi-strategy-fellowship-session-3-printables.pdf");
    assert.equal(printables.printablesFileName("AGI Strategy Fellowship", null), "naisi-agi-strategy-fellowship-printables.pdf");
    assert.equal(printables.printablesFileName("Café & Clouds: “Autumn”", 1), "naisi-cafe-clouds-autumn-session-1-printables.pdf");
    assert.equal(printables.printablesFileName("", null), "naisi-course-printables.pdf");
    assert.equal(printables.printablesFileName("你好", 2), "naisi-course-session-2-printables.pdf");
    assert.equal(printables.printablesPdfTitle("AGI Strategy Fellowship", 3), "AGI Strategy Fellowship: printables for session 3");
    assert.equal(printables.printablesPdfTitle("AGI Strategy Fellowship", null), "AGI Strategy Fellowship: printables");
  });
});

// ---------------------------------------------------------------------------
// 2. What is drawn
// ---------------------------------------------------------------------------

/**
 * The words a document says, in its order, as the PDF should draw them: the
 * title, then each block's (a list's marker before each of its lines; a
 * table's header, then each row, cell by cell; a template line by line).
 * Read here from the stored blocks, independently of the layout.
 */
function wordsOf(doc) {
  const out = [doc.title];
  const runs = (r) => r.map((run) => run.text).join("");
  const prose = (p) => {
    if (p.type === "p") out.push(runs(p.runs));
    else if (p.type === "ul" || p.type === "ol") p.items.forEach((item, i) => out.push(p.type === "ul" ? "•" : `${i + 1}.`, runs(item.runs)));
    else if (p.type === "table") for (const row of [p.header, ...p.rows.map((r) => r.cells)]) for (const cell of row) out.push(runs(cell.runs));
    else for (const line of p.text.split("\n")) out.push(line.replace(/\t/g, "        "));
  };
  for (const block of doc.blocks) {
    if (block.type === "heading") out.push(runs(block.runs));
    else if (block.type === "quote") block.body.forEach(prose);
    else if (block.type === "checklist") block.items.forEach((item) => out.push(runs(item.runs)));
    else prose(block);
  }
  return out.join("").replace(/\s+/g, "");
}

/** What a PDF drew, as `wordsOf` reads a document: every character in order, whitespace aside. */
const drawnText = (drawn) => drawn.join("").replace(/\s+/g, "");

describe("2. what is drawn", () => {
  test("the document's own words, in its order, and no others: the whole document and each session's", async () => {
    const doc = stored(SHAPES);
    for (const session of [null, 1, 2, 3, 4, 5, 6]) {
      const one = session === null ? doc : printables.printablesOfSession(doc, session);
      const out = await pdf.renderPrintablesPdf(one, "Printables");
      assert.equal(drawnText(out.drawn), wordsOf(one), `session ${session}`);
      assert.deepEqual(out.undrawable, []);
    }
  });

  test("every template line is drawn whole, as one string, with every space kept and a tab moved to the next stop of eight", async () => {
    const doc = stored(SHAPES);
    const { drawn } = await pdf.renderPrintablesPdf(doc, "Printables");
    for (const line of [
      "CLOUD DIARY            Date: ________",
      "How sure am I?         ____%",
      "MY FORECAST (sealed until week 6)",
      "Name: ______________________",
      "1. Rain by Friday lunchtime?             ____%",
      "        A line that starts with a tab",
      "WEATHER FELLOWSHIP",
      "[Full name]",
    ]) {
      assert.ok(drawn.includes(line), `not drawn whole: ${JSON.stringify(line)}`);
    }
  });

  test("the marks of the document: bold is the heavier face, italic leans, a link is underlined and stays a link", () => {
    const { pages } = lay(stored(SHAPES));
    const texts = pages.flat().filter((item) => item.kind === "text");
    assert.equal(texts.find((item) => item.text === "Fuel")?.face, "bold");
    assert.equal(texts.find((item) => item.text === "Rules for the reader")?.face, "bold");
    assert.equal(texts.find((item) => item.text === "two days")?.oblique, true);
    assert.equal(texts.find((item) => item.text.startsWith("Everything to print"))?.oblique, false);
    const link = pages.flat().find((item) => item.kind === "link");
    assert.equal(link?.url, "https://example.org/card");
    // Underlined under the link's own words, from their first letter to their last (the quote's bar is the same blue,
    // and upright, so it is not mistaken for it).
    const under = pages.flat().filter((item) => item.kind === "line" && !item.dashed && item.y1 === item.y2 && item.ink === layoutLib.PRINT_INKS.link);
    assert.ok(
      under.some((line) => Math.abs(line.x1 - link.x) < 0.01 && Math.abs(line.x2 - (link.x + link.w)) < 0.01 && line.y1 > link.y && line.y1 < link.y + link.h),
      "the link is not underlined",
    );
    assert.equal(texts.find((item) => item.text === "the shop")?.ink, layoutLib.PRINT_INKS.link);
    // The templates are in the monospace face, everything else in Space Grotesk.
    assert.equal(texts.find((item) => item.text === "WEATHER FELLOWSHIP")?.face, "mono");
    const templateLines = stored(SHAPES)
      .blocks.filter((block) => block.type === "code")
      .flatMap((block) => block.text.split("\n").map((line) => line.replace(/\t/g, "        ")));
    const mono = texts.filter((item) => item.face === "mono");
    assert.ok(mono.length >= 8);
    for (const item of mono) assert.ok(templateLines.includes(item.text), `"${item.text}" is in the monospace face and is no template's line`);
  });

  test("cut lines: every row of a table and every template sits in a dashed frame; the lines between a row's columns are solid", () => {
    const doc = stored(SHAPES);
    const { pages, placed } = lay(doc);
    const dashed = pages.flat().filter((item) => item.kind === "line" && item.dashed);
    const rows = placed.filter((mark) => mark.kind === "row");
    const templates = placed.filter((mark) => mark.kind === "template");
    assert.equal(rows.length, 3 + 3);
    assert.equal(templates.length, 3);
    // Four sides each.
    assert.equal(dashed.length, 4 * (rows.length + templates.length));
    for (const mark of [...rows, ...templates]) {
      const top = dashed.filter((line) => Math.abs(line.y1 - mark.top) < 0.01 && Math.abs(line.y2 - mark.top) < 0.01);
      const bottom = dashed.filter((line) => Math.abs(line.y1 - mark.bottom) < 0.01 && Math.abs(line.y2 - mark.bottom) < 0.01);
      assert.ok(top.length >= 1 && bottom.length >= 1, `${mark.kind} ${mark.block}:${mark.row ?? ""} is not framed`);
    }
    assert.ok(pages.flat().some((item) => item.kind === "line" && !item.dashed && item.ink === layoutLib.PRINT_INKS.rule));
  });

  test("the file: a PDF of A4 portrait pages in the house's three fonts, never one of PDFKit's own, titled, made by NAISI, in British English", async () => {
    const { bytes, pages } = await pdf.renderPrintablesPdf(stored(SHAPES), "Weather Fellowship: printables for session 2");
    const text = bytes.toString("latin1");
    assert.ok(isPdf(bytes));
    assert.match(text.trimEnd(), /%%EOF$/);
    const boxes = [...text.matchAll(/\/MediaBox \[([^\]]*)\]/g)].map((m) => m[1].trim());
    assert.equal(boxes.length, pages);
    for (const box of boxes) assert.equal(box, "0 0 595.28 841.89");
    const fonts = [...text.matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z-]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(fonts)].sort(), ["SpaceGrotesk-Regular", "SpaceGrotesk-SemiBold", "SpaceMono-Regular"]);
    assert.doesNotMatch(text, /Helvetica|Times-Roman|Courier|ZapfDingbats|PDFKit/);
    const first = text.match(/\/F1 (\d+) 0 R/)?.[1];
    const object = text.slice(text.indexOf(`\n${first} 0 obj`), text.indexOf("endobj", text.indexOf(`\n${first} 0 obj`)));
    assert.match(object, /\/BaseFont \/(?:[A-Z]{6}\+)?SpaceGrotesk-Regular/);
    const value = (key) => {
      const ref = text.match(new RegExp(`/${key} (\\d+) 0 R`))?.[1];
      return ref ? text.match(new RegExp(`\\n${ref} 0 obj\\n\\(([^)]*)\\)`))?.[1] : undefined;
    };
    assert.equal(value("Title"), "Weather Fellowship: printables for session 2");
    for (const key of ["Author", "Creator", "Producer"]) assert.equal(value(key), "NAISI", key);
    assert.match(text, /\/Lang \(en-GB\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. What is never split
// ---------------------------------------------------------------------------

/** A long made-up document: many sections, each with a label, a table of cards and a template, and a long section of parts. */
function longPrintables(sections = 14) {
  const parts = ["# Printables", "", "Print single-sided; cut cards along the lines.", ""];
  for (let s = 1; s <= sections; s += 1) {
    parts.push(`## Session ${((s - 1) % 6) + 1}: sheet ${s}`, "", `One per group, sheet ${s}.`, "");
    parts.push("**Cards to cut**", "", "| Card | What it says |", "| --- | --- |");
    for (let r = 1; r <= 4 + (s % 5); r += 1) parts.push(`| ${r} | ${"Rain on the hills by evening, wind from the west. ".repeat(1 + ((r + s) % 3)).trim()} |`);
    parts.push("", "Fill this in:", "", "```markdown", `SHEET ${s}            Group: ________`, "");
    for (let l = 1; l <= 6 + (s % 7); l += 1) parts.push(`${l}. ______________________________   ____%`);
    parts.push("```", "");
  }
  parts.push("## Session 5: the long game", "", "Four rounds, about an hour.", "");
  for (let p = 1; p <= 5; p += 1) {
    parts.push(`### Round ${p}`, "", "The facilitator reads the card aloud. ".repeat(30).trim(), "");
    parts.push("- Each team moves once.", "- The tracker moves after every team has.", "");
  }
  return parts.join("\n");
}

describe("3. what is never split across a page", () => {
  test("a section, a part and a block that fit on a page are each on one page; a heading and a label stay with what follows", () => {
    const doc = stored(longPrintables());
    const { pages, placed, groups } = lay(doc);
    assert.ok(pages.length >= 8, `only ${pages.length} pages: the check needs page breaks to mean anything`);
    let fitting = 0;
    for (const group of groups) {
      if (group.height <= layoutLib.CONTENT_HEIGHT) {
        fitting += 1;
        assert.equal(group.pages.length, 1, `${group.id} fits on a page and is split across ${group.pages.join(", ")}`);
      }
    }
    assert.ok(fitting > 40, `only ${fitting} groups checked`);
    // Every block is a group of its own: a paragraph, a list, a quote, a table, a template.
    assert.equal(groups.filter((group) => /^b\d+$/.test(group.id)).length, doc.blocks.filter((block) => block.type !== "heading").length);
    // The long section is taller than a page, so it is split, and only between its parts.
    const long = groups.find((group) => group.id === `s${15}`);
    assert.ok(long && long.height > layoutLib.CONTENT_HEIGHT && long.pages.length > 1);
    // A heading never ends a page; nor does a label in bold, nor a line ending in a colon.
    placed.forEach((mark, i) => {
      const next = placed[i + 1];
      if (!next) return;
      const block = doc.blocks[mark.block];
      const leads = mark.kind === "heading" || mark.kind === "title" || (block?.type === "p" && layoutLib.leadsIntoNext(block.runs) && next.block !== mark.block);
      if (leads) assert.equal(next.page, mark.page, `${mark.kind} ${mark.block} ends page ${mark.page}`);
    });
    // Rows and templates are whole.
    assert.ok(placed.filter((mark) => mark.kind === "row" || mark.kind === "template").every((mark) => mark.part === undefined));
  });

  test("a heading, a label in bold and a line ending in a colon never end a page, wherever the page ends", () => {
    const words = "The facilitator reads the round aloud, slowly, and waits for every team. ";
    const long = { type: "p", runs: [{ text: words.repeat(90).trim() }] };
    const filler = (k) => ({ type: "ul", items: Array.from({ length: k }, (_, i) => ({ runs: [{ text: `Filler line ${i + 1}.` }] })) });
    const cell = (text) => ({ runs: [{ text }] });
    const bigTable = {
      type: "table",
      header: [cell("Card"), cell("What it says")],
      rows: Array.from({ length: 40 }, (_, i) => ({ cells: [cell(String(i + 1)), cell(words.repeat(2).trim())] })),
    };
    const bigTemplate = { type: "code", lang: "", text: Array.from({ length: 80 }, (_, i) => `${i + 1}. __________________`).join("\n") };
    const cases = [
      ["a heading", { type: "heading", level: 2, runs: [{ text: "Session 2: the long round" }] }, long],
      ["a label in bold", { type: "p", runs: [{ text: "Cards to cut", bold: true }] }, bigTable],
      ["a line ending in a colon", { type: "p", runs: [{ text: "Fill this in:" }] }, bigTemplate],
    ];
    for (const [what, lead, after] of cases) {
      let atFoot = 0;
      for (let k = 1; k <= 45; k += 1) {
        const doc = { title: "Printables", blocks: [filler(k), lead, after] };
        const { placed } = lay(doc);
        const leadMark = placed.filter((mark) => mark.block === 1).at(-1);
        const next = placed.find((mark) => mark.block === 2);
        assert.equal(next.page, leadMark.page, `${what} after ${k} filler lines ends page ${leadMark.page}`);
        if (leadMark.page > 0 && placed.filter((mark) => mark.block === 0).at(-1).page < leadMark.page) atFoot += 1;
      }
      // The sweep reached the foot of a page: at least once the lead was carried over to stay with what follows.
      assert.ok(atFoot >= 1, `${what}: the sweep never reached the foot of a page`);
    }
  });

  test("nothing is drawn past the margins or off the page", () => {
    const doc = stored(longPrintables());
    const m = measure();
    const { pages } = layoutLib.layoutPrintables(doc, m);
    const { width, height, margin } = layoutLib.PAGE;
    for (const items of pages) {
      for (const item of items) {
        if (item.kind === "text") {
          const right = item.x + m.width(item.text, item.face, item.size);
          assert.ok(item.x >= margin - 0.01 && right <= width - margin + 0.01, `"${item.text}" runs from ${item.x} to ${right}`);
          assert.ok(item.y > margin && item.y < height - margin, `"${item.text}" sits at ${item.y}`);
        } else if (item.kind === "line") {
          for (const [x, y] of [[item.x1, item.y1], [item.x2, item.y2]]) assert.ok(x >= margin - 0.01 && x <= width - margin + 0.01 && y >= margin - 0.01 && y <= height - margin + 0.01);
        } else {
          assert.ok(item.x >= margin - 0.01 && item.x + item.w <= width - margin + 0.01 && item.y >= margin - 0.01 && item.y + item.h <= height - margin + 0.01);
        }
      }
    }
  });

  test("only what is taller than a page is split: a template goes on in a frame of its own, a row line by line", () => {
    const tall = Array.from({ length: 120 }, (_, i) => `LINE ${i + 1}   ________`).join("\n");
    const cell = "Cloud ".repeat(1800).trim();
    const doc = {
      title: "Printables",
      blocks: [
        { type: "heading", level: 2, runs: [{ text: "Session 1: the long form" }] },
        { type: "code", lang: "markdown", text: tall },
        { type: "heading", level: 2, runs: [{ text: "Session 2: the long card" }] },
        { type: "table", header: [{ runs: [{ text: "Card" }] }, { runs: [{ text: "What it says" }] }], rows: [{ cells: [{ runs: [{ text: "1" }] }, { runs: [{ text: cell }] }] }] },
      ],
    };
    const { placed, drawn } = lay(doc);
    const parts = placed.filter((mark) => mark.kind === "template");
    assert.ok(parts.length >= 2, "a template taller than a page is not split");
    assert.deepEqual(parts.map((mark) => mark.part), parts.map((_, i) => i));
    assert.equal(new Set(parts.map((mark) => mark.page)).size, parts.length, "two pieces of the template share a page");
    // Its heading stands on the page of its first piece.
    const heading = placed.find((mark) => mark.kind === "heading" && mark.block === 0);
    assert.equal(heading.page, parts[0].page);
    for (let i = 1; i <= 120; i += 1) assert.ok(drawn.includes(`LINE ${i}   ________`), `line ${i} went missing`);
    const row = placed.filter((mark) => mark.kind === "row" && mark.row === 1);
    assert.ok(row.length >= 2 && row.every((mark, i) => mark.part === i), "a row taller than a page is not split");
    // The header row stays with the first piece of the row after it, and the section's heading with both.
    const header = placed.find((mark) => mark.kind === "row" && mark.row === 0);
    assert.equal(header.page, row[0].page);
    assert.equal(placed.find((mark) => mark.kind === "heading" && mark.block === 2).page, header.page);
    assert.equal(drawn.filter((text) => text.includes("Cloud")).join(" ").split(/\s+/).length, 1800, "words of the long row went missing");
  });

  test("a template line too wide even at the smallest size goes on below itself, so nothing is cut off", () => {
    const line = "X".repeat(260);
    const { drawn, pages } = lay({ title: "Printables", blocks: [{ type: "code", lang: "", text: `${line}\nEND` }] });
    const pieces = drawn.filter((text) => /^X+$/.test(text));
    assert.ok(pieces.length >= 2, "the line was not carried on");
    assert.equal(pieces.join(""), line);
    const sizes = new Set(pages.flat().filter((item) => item.kind === "text" && item.face === "mono").map((item) => item.size));
    assert.deepEqual([...sizes], [layoutLib.PRINT_LOOK.template.minSize]);
  });

  test("a template is drawn at the look's size, or smaller until its widest line fits", () => {
    const narrow = lay({ title: "P", blocks: [{ type: "code", lang: "", text: "NAME: ____" }] });
    assert.equal(narrow.pages[0].find((item) => item.kind === "text" && item.face === "mono").size, layoutLib.PRINT_LOOK.template.size);
    const wide = lay({ title: "P", blocks: [{ type: "code", lang: "", text: "W".repeat(93) }] });
    const size = wide.pages[0].find((item) => item.kind === "text" && item.face === "mono").size;
    assert.ok(size < layoutLib.PRINT_LOOK.template.size && size > layoutLib.PRINT_LOOK.template.minSize, `93 columns drawn at ${size}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Characters
// ---------------------------------------------------------------------------

describe("4. characters the fonts cannot draw", () => {
  test("a character only the other face has is drawn in it; one neither has is a box, never nothing", () => {
    const textOnly = glyphs.TEXT_FACE_CHARACTERS.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)).find((cp) => cp > 0xff && !glyphs.faceHas("mono", cp));
    const monoOnly = glyphs.MONO_FACE_CHARACTERS.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)).find((cp) => cp > 0xff && cp < 0xfff0 && !glyphs.faceHas("text", cp));
    assert.ok(textOnly && monoOnly);
    const t = String.fromCodePoint(textOnly);
    const m = String.fromCodePoint(monoOnly);
    const doc = {
      title: "Printables",
      blocks: [
        { type: "p", runs: [{ text: `Prose with ${m} and ✂ in it.` }] },
        { type: "code", lang: "", text: `FORM ${t} ✂ END` },
      ],
    };
    const { pages, undrawable, drawn } = lay(doc);
    const items = pages.flat();
    assert.equal(items.find((item) => item.kind === "text" && item.text === m)?.face, "mono");
    assert.equal(items.find((item) => item.kind === "text" && item.text === t)?.face, "regular");
    assert.equal(items.filter((item) => item.kind === "box" && !item.filled).length, 2);
    assert.deepEqual(undrawable, ["✂"]);
    // The template's columns stand: what follows the boxed character is drawn where it is written.
    const end = items.find((item) => item.kind === "text" && item.text === " END");
    const form = items.find((item) => item.kind === "text" && item.text === "FORM ");
    const column = measure().width("0", "mono", end.size);
    assert.ok(Math.abs(end.x - form.x - 8 * column) < 0.01, "the column after a box moved");
    assert.ok(!drawn.some((text) => text.includes("✂")));
  });

  test("text is drawn canonical, and what draws as nothing anywhere is left out", () => {
    assert.equal(glyphs.drawableText("Cafe\u0301\u200b\u00ad\ufeff ok\u0007"), "Caf\u00e9 ok");
    assert.equal(glyphs.drawableText("a\tb\nc"), "a\tb\nc");
    assert.deepEqual(glyphs.undrawableIn("plain £ × − text"), []);
    assert.deepEqual(glyphs.drawnAs("mono", "\u202f"), { kind: "face", face: "mono", ch: " " });
  });

  test("the tables of what each face draws are the font files' own, and so are the faces' heights", () => {
    const requireHere = createRequire(import.meta.url);
    const fontkit = createRequire(requireHere.resolve("pdfkit"))("fontkit");
    const dir = join(SRC, "lib", "courses", "certificates", "fonts");
    const expand = (ranges) => ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
    const open = (name) => fontkit.openSync(join(dir, `${name}.ttf`));
    for (const [name, table] of [
      ["SpaceGrotesk-Regular", glyphs.TEXT_FACE_CHARACTERS],
      ["SpaceGrotesk-SemiBold", glyphs.TEXT_FACE_CHARACTERS],
      ["SpaceMono-Regular", glyphs.MONO_FACE_CHARACTERS],
    ]) {
      assert.deepEqual(expand(table), [...open(name).characterSet].sort((a, b) => a - b), `${name} and its table disagree: make the table again from the font`);
    }
    for (const [face, name] of [["regular", "SpaceGrotesk-Regular"], ["bold", "SpaceGrotesk-SemiBold"], ["mono", "SpaceMono-Regular"]]) {
      const font = open(name);
      assert.equal(layoutLib.FACE_METRICS[face].ascent, font.ascent / font.unitsPerEm, face);
      assert.equal(layoutLib.FACE_METRICS[face].descent, -font.descent / font.unitsPerEm, face);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Who: the route
// ---------------------------------------------------------------------------

describe("5. who downloads the printables", () => {
  const READERS = ["zach", "claudia", "rahul", "sofia", "tom", "grace"];
  const REFUSED_CALLERS = ["tess", "ola", "lloyd", "yusuf", "amara", "chloe", "una", "nobody"];

  test("the guide's readers: a PDF to save, named for the course and the session, kept out of caches and search results", async () => {
    const doc = stored(PRINTABLES);
    const before = everything();
    for (const who of READERS) {
      for (const session of [undefined, 1, 2]) {
        const answer = await fetchPdf(who, { session });
        assert.equal(answer.status, 200, `${who} ${session}`);
        assert.ok(isPdf(answer.bytes), `${who} ${session}`);
        assert.equal(answer.headers["content-type"], "application/pdf");
        const name = session === undefined ? "naisi-agi-strategy-fellowship-printables.pdf" : `naisi-agi-strategy-fellowship-session-${session}-printables.pdf`;
        assert.equal(answer.headers["content-disposition"], `attachment; filename="${name}"`);
        assert.equal(answer.headers["cache-control"], "private, no-store");
        assert.equal(answer.headers["x-robots-tag"], "noindex");
        assert.equal(Number(answer.headers["content-length"]), answer.bytes.length);
        // Exactly the session's printables, drawn as the renderer draws them.
        const one = session === undefined ? doc : printables.printablesOfSession(doc, session);
        const want = await pdf.renderPrintablesPdf(one, printables.printablesPdfTitle("AGI Strategy Fellowship", session ?? null));
        assert.equal(Buffer.compare(answer.bytes, want.bytes), 0, `${who} ${session}: not the session's printables`);
      }
    }
    assert.equal(everything(), before, "a download wrote something");
  });

  test("everybody else: the guide's one calm sentence at 200, and not a byte of a PDF, whatever is asked", async () => {
    const before = everything();
    for (const who of REFUSED_CALLERS) {
      for (const query of ["", "?session=1", "?session=9", "?session=abc"]) {
        const answer = await fetchPdf(who, { query });
        assert.equal(answer.status, 200, `${who} ${query}`);
        assert.equal(answer.text, REFUSED, `${who} ${query}`);
        assert.equal(answer.headers["content-type"], "text/plain; charset=utf-8");
        assert.equal(answer.headers["cache-control"], "private, no-store");
        assert.equal(answer.headers["content-disposition"], undefined);
        assert.ok(!answer.bytes.includes("%PDF"), `${who} ${query} got PDF bytes`);
      }
    }
    // A course that is not there, or is being destroyed: the same sentence for everybody, an admin included.
    for (const who of ["zach", "rahul", "amara"]) {
      assert.equal((await fetchPdf(who, { courseId: "no-such-course__c0urse99" })).text, REFUSED, who);
      assert.equal((await fetchPdf(who, { courseId: "../x" })).text, REFUSED, who);
    }
    assert.equal(everything(), before, "a refused download wrote something");
    world.db.poke(`courses/${COURSE.agi}`, { destroying: true });
    const marked = everything();
    for (const who of ["zach", "claudia", "rahul"]) assert.equal((await fetchPdf(who)).text, REFUSED, who);
    assert.equal(everything(), marked, "a refused download wrote something");
  });

  test("a facilitator whose group is archived, or whose account no longer stands, is refused from the next request", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await fetchPdf("rahul")).text, REFUSED);
    assert.ok(isPdf((await fetchPdf("sofia")).bytes), "Sofia still has Group A");
    world.db.poke("users/sofia", { role: "pending" });
    assert.equal((await fetchPdf("sofia")).text, REFUSED);
  });

  test("a view-as session gets what the member would; somebody signed out is sent to sign in and back to the Printables", async () => {
    assert.ok(isPdf((await fetchPdf("rahul", { session: 1, viewAs: true })).bytes));
    assert.equal((await fetchPdf("amara", { session: 1, viewAs: true })).text, REFUSED);
    const out = await fetchPdf(null, { session: 1 });
    assert.equal(out.status, 307);
    assert.equal(out.headers.location, `/login?next=${encodeURIComponent(`/learn/facilitator-guide/${COURSE.agi}/printables`)}`);
    assert.equal(out.headers["cache-control"], "private, no-store");
    assert.equal(out.bytes.length, 0);
  });

  test("for a reader: a session that is not a number, one the course does not have, one with nothing, and printables not loaded, each said plainly", async () => {
    for (const query of ["?session=0", "?session=03", "?session=abc", "?session=", "?session=61"]) {
      const answer = await fetchPdf("rahul", { query });
      assert.equal(answer.status, 400, query);
      assert.equal(answer.text, words.ASK_FOR_A_SESSION, query);
    }
    // Six weeks: session 7 is not one of them.
    const seven = await fetchPdf("rahul", { session: 7 });
    assert.deepEqual([seven.status, seven.text], [404, "This course has 6 sessions, so there’s no session 7."]);
    // The made-up printables have nothing for session 4.
    const four = await fetchPdf("claudia", { session: 4 });
    assert.deepEqual([four.status, four.text], [404, "Nothing in the printables is for session 4."]);
    await world.db.collection("courseFacilitatorGuide").doc(`${COURSE.agi}__printables`).delete();
    for (const session of [undefined, 1]) {
      const none = await fetchPdf("zach", { session });
      assert.deepEqual([none.status, none.text], [404, words.PRINTABLES_NOT_LOADED], String(session));
    }
    for (const answer of [seven, four]) assert.ok(!answer.bytes.includes("%PDF"));
  });

  test("a shorter course has fewer sessions, never fewer than a week loaded: the route and the page agree", async () => {
    let runs = 0;
    for (const path of world.db.paths().filter((p) => /^courseRuns\/[^/]+$/.test(p))) {
      const run = world.db.read(path);
      if (run.courseId !== COURSE.agi) continue;
      world.db.poke(path, { weekPlan: (run.weekPlan ?? []).filter((entry) => entry.kind === "week").slice(0, 2) });
      runs += 1;
    }
    assert.ok(runs >= 1 && world.db.read(`courseRuns/${RUN.agi}`).weekPlan.length === 2);
    // The runs have two weeks, and week 3 is loaded in the guide, so the guide has three.
    const four = await fetchPdf("rahul", { session: 4 });
    assert.deepEqual([four.status, four.text], [404, "This course has 3 sessions, so there’s no session 4."]);
    const three = await fetchPdf("rahul", { session: 3 });
    assert.deepEqual([three.status, three.text], [404, "Nothing in the printables is for session 3."]);
    const page = await docPage("rahul", "printables");
    assert.deepEqual([...page.html.matchAll(/printables\/pdf\?session=(\d+)/g)].map((m) => m[1]), ["1", "2"]);
    assert.match(page.text, /Session 3 Nothing to print All the printables/);
    assert.doesNotMatch(page.text, /Session 4/);
  });
});

// ---------------------------------------------------------------------------
// 6. The links
// ---------------------------------------------------------------------------

describe("6. the links on the guide's pages", () => {
  test("the Printables page: a download for each session with something to print, then the whole document, for the gate's three", async () => {
    for (const who of ["rahul", "claudia", "zach"]) {
      const page = await docPage(who, "printables");
      assert.equal(page.wrote, false);
      assert.match(
        page.text,
        /Download to print Each session’s printables as one A4 PDF, ready to send to a printer\. Session 1 1 thing to print · PDF Session 2 1 thing to print · PDF Session 3 Nothing to print Session 4 Nothing to print Session 5 Nothing to print Session 6 Nothing to print All the printables The whole document · PDF/,
        who,
      );
      for (const href of [`${AGI_PDF}?session=1`, `${AGI_PDF}?session=2`, AGI_PDF]) {
        assert.match(page.html, new RegExp(`<a href="${href.replace(/[?]/g, "\\?")}" class="row">`), `${who} ${href}`);
      }
      // A session with nothing to print is said, never linked.
      assert.doesNotMatch(page.html, /session=[3-6]/);
      assert.match(page.html, /<div class="row rowQuiet">/);
      // The document is still drawn beneath it, its template kept to the character.
      assert.match(page.html, /<pre class="code"><code>FRIDAY FORECAST {17}Name: ____________/);
    }
  });

  test("a week's page: its session's download beside its plan, only when the printables have something for it", async () => {
    const one = await docPage("sofia", "week-1");
    assert.match(one.html, new RegExp(`<h2 id="w01-plan-title" class="partTitle">[^<]*</h2><p class="printLine"><a href="${AGI_PDF}\\?session=1" class="printLink">`));
    assert.match(one.text, /Download session 1’s printables \(PDF\)/);
    // Week 3 has a plan and notes, and the printables have nothing for session 3.
    const three = await docPage("sofia", "week-3");
    assert.doesNotMatch(three.html, /printables\/pdf/);
    // Session 2 has something to print and week 2 has nothing loaded: no page to put it on.
    assert.doesNotMatch((await docPage("sofia", "week-2")).html, /printables\/pdf/);
    // Only the notes loaded for a week: the download sits beside them.
    const notesOnly = PLAN_W1.replace("# Session 1:", "# Week 2 notes:");
    assert.equal((await load("zach", "PUT", "w02-notes", { markdown: notesOnly })).status, 200);
    assert.match((await docPage("rahul", "week-2")).html, new RegExp(`<p class="printLine"><a href="${AGI_PDF}\\?session=2" class="printLink">`));
  });

  test("everybody the guide refuses sees no link to the printables, on any page", async () => {
    for (const who of ["tess", "ola", "yusuf", "lloyd", "amara", "una", "nobody"]) {
      for (const segment of ["printables", "week-1"]) {
        const page = await docPage(who, segment);
        assert.match(page.text, new RegExp(REFUSED), `${who} ${segment}`);
        assert.doesNotMatch(page.html, /printables\/pdf|Download/, `${who} ${segment}`);
      }
    }
  });

  test("the words, as listed for the boards' designers", () => {
    assert.equal(words.PRINT_CARD_TITLE, "Download to print");
    assert.equal(words.PRINT_CARD_LINE, "Each session’s printables as one A4 PDF, ready to send to a printer.");
    assert.equal(words.sessionWords(3), "Session 3");
    assert.equal(words.thingsToPrintWords(1), "1 thing to print · PDF");
    assert.equal(words.thingsToPrintWords(4), "4 things to print · PDF");
    assert.equal(words.NOTHING_TO_PRINT, "Nothing to print");
    assert.equal(words.ALL_THE_PRINTABLES, "All the printables");
    assert.equal(words.WHOLE_DOCUMENT_PDF, "The whole document · PDF");
    assert.equal(words.downloadSessionPrintablesWords(3), "Download session 3’s printables (PDF)");
    assert.equal(words.noSuchSessionWords(9, 0), "This course has no sessions yet, so there’s no session 9.");
    assert.equal(words.noSuchSessionWords(2, 1), "This course has 1 session, so there’s no session 2.");
    const all = Object.values(words).filter((value) => typeof value === "string").join(" ");
    assert.doesNotMatch(all, /[\u2013\u2014]/);
  });
});

// ---------------------------------------------------------------------------
// 7. The build
// ---------------------------------------------------------------------------

describe("7. the build", () => {
  const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

  test("PDFKit stays behind the certificates' one door; the drawing is server-only and reached by no browser file", () => {
    for (const file of ["printables.ts", "printablesLayout.ts", "printablesGlyphs.ts", "printablesPdf.ts", "sessionCount.ts"]) {
      assert.doesNotMatch(read("lib", "courses", "facilitatorGuide", file), /from\s+["']pdfkit["']|require\(\s*["']pdfkit["']/, file);
    }
    assert.match(read("lib", "courses", "facilitatorGuide", "printablesPdf.ts"), /^import "server-only";/);
    assert.match(read("lib", "courses", "facilitatorGuide", "sessionCount.ts"), /^import "server-only";/);
    assert.match(read("lib", "courses", "facilitatorGuide", "printablesPdf.ts"), /import \{ openHousePdf, type HousePdf \} from "@\/lib\/courses\/certificates\/pdf";/);
    // The pure modules the pages share import nothing of the server.
    for (const file of ["printables.ts", "printablesLayout.ts", "printablesGlyphs.ts"]) {
      assert.doesNotMatch(read("lib", "courses", "facilitatorGuide", file), /server-only|firebase-admin|certificates\/pdf"/, file);
    }
  });

  test("the links are plain links to the route, never a client-side navigation that would ask the route for a page", () => {
    const source = read("features", "courses", "facilitatorGuide", "PrintablesDownloads.tsx");
    assert.doesNotMatch(source, /from "next\/link"|<Link\b|"use client"/);
    assert.equal((source.match(/<a href=\{printablesPdfPath\(/g) ?? []).length, 3);
  });

  test("the build traces the fonts into the route that reads them, beside the certificate's", () => {
    const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
    assert.match(config, /serverExternalPackages: \["pdfkit"\]/);
    assert.match(config, /"\/api\/courses\/\\\\\[courseId\\\\\]\/facilitator-guide\/printables\/pdf": \["\.\/src\/lib\/courses\/certificates\/fonts\/\*"\]/);
    assert.ok(existsSync(join(SRC, "app", "api", "courses", "[courseId]", "facilitator-guide", "printables", "pdf", "route.ts")));
  });

  test("the route reads and draws, writes nothing, and asks the guide's gate before it reads a document", () => {
    const source = read("app", "api", "courses", "[courseId]", "facilitator-guide", "printables", "pdf", "route.ts");
    assert.doesNotMatch(source, /\.(set|update|delete|add|create)\(|runTransaction|batch\(/);
    assert.match(source, /export async function GET\(/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
    const gate = source.indexOf("facilitatorGuideReader(db, user, courseId)");
    assert.ok(gate > 0 && gate < source.indexOf("readGuidePage(db, reader"));
  });
});
