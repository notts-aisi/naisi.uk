/**
 * A week written as blocks on the public course pages (Q40): its title, Why
 * this week, After this week you can and the sources with their times, and
 * nothing that is behind sign-in. A week written before blocks is drawn by
 * `WeekCurriculum`, unchanged: its frozen render is
 * `tests/course-programme-page.test.mjs` §1, and here the week page is shown
 * to hand such a week to it exactly as before.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   publicBlockWeek        the projection a public page is handed
 *   PublicBlockWeek        its drawing
 *   the public week page   both shapes of week, through the page itself
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { syntheticWeekBlocks, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every stylesheet the tree imports, read as its class names. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found].map((specifier) => [specifier, "export default new Proxy({}, { get: (_, name) => String(name) });"]);
}

const state = (globalThis.__publicWeekPage = { week: null, h: createElement });
const { loadTs } = createLoader({
  stubs: [
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, children, className }) => globalThis.__publicWeekPage.h('a', { href, className }, children);"],
    ["next/navigation", "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }"],
    [
      "@/features/courses/fetchCourses",
      "export async function getPublicWeek() { return globalThis.__publicWeekPage.week; }\n" +
        "export async function getPublishedCourse() { return globalThis.__publicWeekPage.week ? { weeks: [] } : null; }",
    ],
    ...stylesheets(),
  ],
});

const { publicBlockWeek } = await loadTs("lib/courses/weekBlocks/publicWeek.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const { default: PublicBlockWeek } = await loadTs("features/courses/PublicBlockWeek.tsx");
const { default: WeekCurriculum } = await loadTs("features/courses/WeekCurriculum.tsx");
const { default: WeekPage, generateMetadata } = await loadTs("app/(public)/courses/[courseId]/weeks/[week]/page.tsx");

const blockWeek = () => courses.normalizeCourseWeek("w03", syntheticWeekDoc());

/** Words of the synthetic week that are behind sign-in, by what they are. */
const BEHIND_SIGN_IN = [
  ["a reflection prompt", "What is its base rate?"],
  ["the written answer's question", "Will your pack’s question come true"],
  ["the written answer's guidance", "A strong answer names its base rate"],
  ["a case", "The surprise result, 2016"],
  ["a case's content note", "The sources quote abusive posts"],
  ["the case study's introduction", "You get a case from your pack"],
  ["the content note", "If anything this week weighs on you"],
  ["a support link", "A listening line"],
  ["a fill-in box", "What I’ll forecast next"],
  ["a checklist item", "Find one forecast someone else made"],
  ["how to prepare a pitch", "What will you forecast?"],
  ["a part's framing", "Most questions have happened before"],
  ["text inside a part", "If you take markets"],
  ["a table inside a part", "A report"],
  ["the questions to read packs against", "what has happened before?"],
  ["In the session", "You’ll compare forecasts"],
  ["Before you come", "Bring your number"],
  ["Go further", "Superforecasting, a summary"],
  ["the hands-on route", "def brier"],
  ["a section of the guide's own", "Where to go next"],
  ["This week's tasks", "two shared readings, then your pack"],
  ["the written answer's part", "Your forecast, the week’s written answer"],
  ["a source's note", "Only the first table."],
  ["a pack's note", "if you like numbers"],
];

const ASKED = renderToStaticMarkup(createElement(PublicBlockWeek, { week: publicBlockWeek(syntheticWeekBlocks()) }));

// ---------------------------------------------------------------------------
// 1. The projection
// ---------------------------------------------------------------------------

describe("1. what a public page is handed", () => {
  test("Why this week, the outcomes, Before the session's time and each part with sources, by its place", () => {
    const view = publicBlockWeek(syntheticWeekBlocks());
    assert.deepEqual(view.why, syntheticWeekBlocks().find((block) => block.id === "tx-why").body);
    assert.deepEqual(view.outcomes, {
      heading: "After this week you can",
      items: ["Find a base rate for a question.", "Say how confident you are, as a number.", "Check a forecast once the answer is known."],
    });
    assert.equal(view.beforeTime, "About 70 minutes, plus your forecast");
    assert.deepEqual(
      view.parts.map((part) => [part.number, part.title, part.time, part.items.map((item) => item.type)]),
      [
        [1, "Start with a base rate", "About 20 minutes", ["source", "source"]],
        [2, "Two ways to be wrong", "About 25 minutes", ["source", "source"]],
        [3, "Your pack", "20 to 30 minutes", ["choose"]],
        [5, "Plan and pitch", "About 40 minutes", ["choose"]],
      ],
      "part 4 holds only the written answer, so it says nothing in public, and the rest keep their numbers",
    );
    assert.deepEqual(view.parts[0].items[1].source, {
      kindLabel: "Read",
      lead: "section 2, “Counting”, of",
      title: "The forecaster’s handbook",
      url: "https://example.org/handbook",
      by: "Example Press",
      date: "2023",
      time: "5 minutes",
    });
    assert.deepEqual(view.parts[2].items[0].packs.map((pack) => [pack.name, pack.time]), [["Elections", "25 minutes"], ["Markets", "About 30 minutes"], ["Technology", "20 minutes"]]);
  });

  test("built field by field: no id, no kind of block, nothing the list leaves out", () => {
    const json = JSON.stringify(publicBlockWeek(syntheticWeekBlocks()));
    for (const id of ["src-1", "pk-1", "rp-1", "wa-1", "cs-1", "ca-2", "cn-1"]) assert.ok(!json.includes(`"${id}"`), id);
    for (const [what, words] of BEHIND_SIGN_IN) assert.ok(!json.includes(words), `${what} reached the projection`);
  });
});

// ---------------------------------------------------------------------------
// 2. The drawing
// ---------------------------------------------------------------------------

describe("2. what the page draws", () => {
  test("Why this week with its marks and link, the outcomes, and every source as a link with its time", () => {
    assert.match(ASKED, /<h2 class="sectionTitle">Why this week<\/h2>/);
    assert.match(ASKED, /<strong>base rates<\/strong>/);
    assert.match(ASKED, /<em>calibration<\/em>/);
    assert.match(ASKED, /<a href="https:\/\/example\.com\/guide" class="link" target="_blank" rel="noopener noreferrer">short guide<\/a>/);
    assert.match(ASKED, /<li>Say how confident you are, as a number\.<\/li>/);
    assert.match(ASKED, /<a href="https:\/\/example\.com\/base-rates" class="link" target="_blank" rel="noopener noreferrer">A field guide to base rates<\/a>/);
    assert.match(ASKED, /<span class="time">15 minutes<\/span>/);
    assert.match(ASKED, /<span class="kind">Notebook<\/span>/);
    assert.match(ASKED, /Part 3: Your pack/);
    assert.match(ASKED, /<span class="packName">Elections<\/span>/);
    assert.match(ASKED, /href="https:\/\/example\.org\/swing"/);
  });

  test("nothing behind sign-in is drawn", () => {
    for (const [what, words] of BEHIND_SIGN_IN) assert.ok(!ASKED.includes(words.replace(/’/g, "’")), `${what} was drawn`);
  });

  test("a list's options are said once, by their links", () => {
    assert.match(ASKED, /<a href="https:\/\/example\.com\/work" class="link" target="_blank" rel="noopener noreferrer">Forecasting at work<\/a>/);
    assert.equal(ASKED.split("Forecasting at work").length - 1, 1);
  });

  test("a link a week stored without the read side's check is drawn as words, never as a link", () => {
    const view = publicBlockWeek(syntheticWeekBlocks());
    view.parts[0].items[0].source.url = "javascript:alert(1)";
    view.why = [{ type: "p", runs: [{ text: "click", href: "javascript:alert(1)" }] }];
    const html = renderToStaticMarkup(createElement(PublicBlockWeek, { week: view }));
    assert.ok(!html.includes("javascript:"));
    assert.match(html, /A field guide to base rates/);
  });
});

// ---------------------------------------------------------------------------
// 3. The public week page, for both shapes of week
// ---------------------------------------------------------------------------

describe("3. the public week page", () => {
  const COURSE = { title: "Forecasting", tagline: "A course about forecasts." };
  const RUN = { label: "Autumn 2026" };
  const LEGACY = courses.normalizeCourseWeek("w03", {
    weekNumber: 3,
    title: "Goal misgeneralisation",
    summary: "Why a model that scores well can still be doing the wrong thing.",
    guideBlocks: [],
    materials: [{ id: "m1", type: "reading", title: "A paper", url: "https://example.org/paper", estimatedMinutes: 40 }],
    exercises: [{ id: "e1", prompt: "Describe a case.", responseType: "text", required: true, maxLength: 2000, peerVisible: false }],
    checklist: [{ id: "c1", title: "Bring a question", mirrorToMyWork: false }],
    questions: [],
    estimatedMinutes: 60,
    published: true,
  });
  const page = async (week) => {
    state.week = { course: COURSE, run: RUN, week, totalWeeks: 6 };
    return renderToStaticMarkup(await WeekPage({ params: Promise.resolve({ courseId: "forecasting", week: "3" }) }));
  };

  test("a week written before blocks is handed to WeekCurriculum exactly as before, and nothing of the block view is drawn", async () => {
    const html = await page(LEGACY);
    assert.ok(html.includes(renderToStaticMarkup(WeekCurriculum({ week: LEGACY }))), "the frozen curriculum, whole, with no optional prop");
    assert.ok(!html.includes('<div class="week">'), "no block view");
    assert.ok(!html.includes('sectionTitle">Why this week'));
    assert.match(html, /Why a model that scores well/, "its summary is the lede, as before");
  });

  test("a block week draws its title and the public view, and nothing behind sign-in", async () => {
    const html = await page(blockWeek());
    assert.match(html, /<h1 class="title">How sure are you\?<\/h1>/);
    assert.ok(html.includes(ASKED), "the block view, whole");
    for (const [what, words] of BEHIND_SIGN_IN) assert.ok(!html.includes(words), `${what} was drawn`);
  });

  test("a block week's link preview says its Why this week", async () => {
    state.week = { course: COURSE, run: RUN, week: blockWeek(), totalWeeks: 6 };
    const meta = await generateMetadata({ params: Promise.resolve({ courseId: "forecasting", week: "3" }) });
    assert.match(meta.description, /^Forecasts are only useful if someone checks them\./);
    state.week = { course: COURSE, run: RUN, week: LEGACY, totalWeeks: 6 };
    const legacy = await generateMetadata({ params: Promise.resolve({ courseId: "forecasting", week: "3" }) });
    assert.equal(legacy.description, LEGACY.summary);
  });
});

// ---------------------------------------------------------------------------
// 4. The course page's sample week says what it shows
// ---------------------------------------------------------------------------

test("4. the course page's sample of a block week does not claim to be the week in full", () => {
  const source = readFileSync(join(SRC, "app", "(public)", "courses", "[courseId]", "page.tsx"), "utf8");
  // The two shapes each have their own line, and the block week's is not the one that says "in full".
  assert.match(source, /isBlockWeek\(sampleWeek\)\s*\?\s*`Week \$\{sampleWeek\.weekNumber\}: why it matters, what you’ll be able to do after it, and what you’ll read and watch\. Every other week is published too\.`\s*:\s*`Week \$\{sampleWeek\.weekNumber\} in full, exactly as the cohort reads it\. Every other week is published too\.`/);
  assert.match(source, /isBlockWeek\(sampleWeek\) \? \(\s*<PublicBlockWeek week=\{publicBlockWeek\(sampleWeek\.blocks\)\} \/>\s*\) : \(\s*<WeekCurriculum week=\{sampleWeek\} \/>\s*\)/);
});
