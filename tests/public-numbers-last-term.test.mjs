/**
 * THE "LAST TERM" BLOCK ON A PROGRAMME'S PUBLIC PAGE (pub-agi, sv-public):
 * drawn only while something is published for a programme tied to the
 * course, from the published record alone, and nothing about anybody.
 *
 * The real course page and the real fetcher (`src/lib/publicNumbers/fetch.ts`)
 * read an in-memory store; the course page's other lookups (the course, its
 * runs, its pitch, the term) are handed in by the suite, as
 * `tests/programme-crest-public-pages.test.mjs` hands them in.
 *
 *  1. NOTHING PUBLISHED, NO BLOCK; another course's record is never this
 *     page's; a failed read leaves the page as it was.
 *  2. PUBLISHED: the heading, every figure over its words, the quotes with
 *     the term beneath each and nothing else, and the closing line, in a
 *     section of its own labelled by its heading.
 *  3. NOTHING ELSE OF THE RECORD reaches the HTML: no publisher, no ids, no
 *     base, no date, not even a field nobody should have written.
 *  4. A COURSE WITH TWO TERMS PUBLISHED shows the latest term's.
 *
 * Run with `npm test`.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";
import { makeDb } from "./lib/applicationsStore.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

globalThis.__lastTerm = { h: createElement, db: null, course: null, page: null, term: null };
const handle = "globalThis.__lastTerm";

/** Every stylesheet the page imports, as its own class names. */
function stylesheets() {
  const found = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) {
        for (const [, specifier] of readFileSync(path, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
      }
    }
  };
  walk(SRC);
  return [...found];
}
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/lib/firebase/admin", `export function getAdminDb() { return ${handle}.db; }`],
    ["@/features/term/fetchPublicTerm", `export async function fetchPublicTerm() { return ${handle}.term; }`],
    [
      "@/features/courses/fetchCourses",
      "export function roundOwnsDates() { return false; }\n" +
        "export function roundTargetRun() { return null; }\n" +
        `export async function getPublishedCourse() { return ${handle}.course; }\n` +
        "export async function getCourseRunSet() { return { featuredRun: null, runIds: [], runsById: new Map() }; }",
    ],
    [
      "@/features/courses/fetchFormRound",
      "export async function fetchFormRoundForCourse() { return null; }\n" +
        "export function speakingRoundFor(form, older) { return form ?? older ?? null; }",
    ],
    ["@/features/courses/fetchLiveRound", "export async function fetchLiveRoundForRuns() { return null; }"],
    ["@/features/courses/fetchCoursePage", `export async function fetchCoursePage() { return ${handle}.page; }`],
    ["@/features/courses/fetchGroupPicker", "export async function fetchGroupPicker() { return []; }"],
    ["@/features/courses/CourseCTA", "export default function CourseCTA() { return null; }"],
    ["@/features/events/BlockView", "export default function BlockView() { return null; }"],
    ["next/link", `export default ({ href, className, children }) => ${handle}.h("a", { href, className }, children);`],
    ["next/navigation", "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }"],
    ["@/components/ui/NetField", `export default ({ className, children }) => ${handle}.h("div", { className }, children);`],
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]),
});

const { default: PublicCoursePage } = await loadTs(join("app", "(public)", "courses", "[courseId]", "page.tsx"));
const { fetchLastTerm } = await loadTs(join("lib", "publicNumbers", "fetch.ts"));
const { normalizeCourse } = await loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCoursePage } = await loadTs(join("lib", "firestore", "coursePages.ts"));

const COURSE = "agi-strategy-fellowship__c0urse01";
const OTHER = "technical-ai-safety__c0urse02";
const ROUND = "autumn-2026__f0rm0001";

/** A record as the publish route writes it, with a field nobody should have written to prove the page never reads past what it draws. */
function record(over = {}) {
  return {
    roundId: ROUND,
    programmeId: "agi-strategy",
    courseId: COURSE,
    term: "Autumn 2026",
    lastSessionOn: "2026-12-09",
    heading: "How autumn 2026 went.",
    numbers: [
      { id: "recommend", figure: { kind: "one", value: "23 of 27" }, words: "fellows would recommend it", n: 27, base: "From 27 answers, counting 9 or 10 out of 10" },
      { id: "stage", figure: { kind: "pair", start: "8 of 25", end: "15 of 25" }, words: "Considering, planning or already doing work on AI safety", n: 25, base: "From the 25 who answered both" },
    ],
    quotes: [{ text: "Writing the threat model. I finally had to decide what I actually think." }],
    attribution: "Autumn 2026 fellow",
    footer: "From the fellowship’s own surveys, autumn 2026: 27 of 31 fellows answered at the end, 25 of them at the start too.",
    publishedAt: new Date("2026-12-11T10:00:00Z"),
    publishedByUid: "zach",
    respondent: { kind: "account", uid: "amara" },
    ...over,
  };
}

async function draw() {
  return renderToStaticMarkup(await PublicCoursePage({ params: Promise.resolve({ courseId: COURSE }) }));
}

beforeEach(() => {
  Object.assign(globalThis.__lastTerm, {
    db: makeDb({}),
    course: { course: normalizeCourse(COURSE, { title: "AGI Strategy Fellowship", status: "published" }), weeks: [] },
    page: normalizeCoursePage(COURSE, {}),
    term: { stage: "closed", label: "Autumn 2026", opensAt: null, closesAt: null, decisionsByDate: null, applyPath: null, next: null, programmes: [] },
  });
});

describe("the Last term block: drawn only while something is published for this course", () => {
  test("nothing published, no block", async () => {
    const html = await draw();
    assert.ok(!html.includes("Last term"));
    assert.ok(!html.includes("last-term-heading"));
  });

  test("another course's record is never this page's", async () => {
    globalThis.__lastTerm.db = makeDb({ [`publicNumbers/${ROUND}__tais`]: record({ programmeId: "tais", courseId: OTHER }) });
    assert.ok(!(await draw()).includes("Last term"));
  });

  test("a read that fails leaves the page as it was, with no block", async () => {
    globalThis.__lastTerm.db = { collection: () => ({ where: () => ({ get: async () => Promise.reject(new Error("the database did not answer")) }) }) };
    const html = await draw();
    assert.ok(html.includes("AGI Strategy Fellowship"), "the page broke");
    assert.ok(!html.includes("Last term"));
  });
});

describe("published: the block, from the record alone", () => {
  test("the heading, each figure over its words, the quotes with the term beneath each, and the closing line", async () => {
    globalThis.__lastTerm.db = makeDb({ [`publicNumbers/${ROUND}__agi-strategy`]: record() });
    const html = await draw();
    // A section of its own, named by its heading.
    assert.match(html, /<section[^>]*aria-labelledby="last-term-heading"/);
    assert.match(html, /<h2 id="last-term-heading"[^>]*>How autumn 2026 went\.<\/h2>/);
    assert.match(html, />Last term</);
    assert.match(html, />23 of 27<\/p><p class="words">fellows would recommend it<\/p>/);
    assert.match(html, /<span class="pairFigure">8 of 25<\/span><span class="when">at the start<\/span>/);
    assert.match(html, /<span class="pairFigure">15 of 25<\/span><span class="when">at the end<\/span>/);
    assert.match(html, /<blockquote class="quoteWords">“Writing the threat model\. I finally had to decide what I actually think\.”<\/blockquote><figcaption class="attribution">Autumn 2026 fellow<\/figcaption>/);
    assert.ok(html.includes("From the fellowship’s own surveys, autumn 2026: 27 of 31 fellows answered at the end, 25 of them at the start too."));
  });

  test("nothing else of the record reaches the HTML: no publisher, no ids, no base, no date, no stray field", async () => {
    globalThis.__lastTerm.db = makeDb({ [`publicNumbers/${ROUND}__agi-strategy`]: record() });
    const html = await draw();
    // The measures' ids are quoted, since "recommend" is also a word the block shows.
    for (const never of ["zach", "amara", "respondent", ROUND, "agi-strategy\"", "\"recommend\"", "\"stage\"", "From 27 answers", "who answered both", "2026-12-09", "2026-12-11", "publishedBy"]) {
      assert.ok(!html.includes(never), `the public page carries ${never}`);
    }
  });

  test("the fetcher hands the page the block's fields and nothing else", async () => {
    globalThis.__lastTerm.db = makeDb({ [`publicNumbers/${ROUND}__agi-strategy`]: record() });
    const block = await fetchLastTerm(COURSE);
    assert.deepEqual(Object.keys(block).sort(), ["attribution", "footer", "heading", "numbers", "quotes"]);
    assert.deepEqual(block.numbers, [
      { figure: { kind: "one", value: "23 of 27" }, words: "fellows would recommend it" },
      { figure: { kind: "pair", start: "8 of 25", end: "15 of 25" }, words: "Considering, planning or already doing work on AI safety" },
    ]);
    assert.deepEqual(block.quotes, ["Writing the threat model. I finally had to decide what I actually think."]);
    assert.equal(await fetchLastTerm("a/b"), null);
  });

  test("a course with two terms published shows the latest term's", async () => {
    globalThis.__lastTerm.db = makeDb({
      [`publicNumbers/${ROUND}__agi-strategy`]: record(),
      [`publicNumbers/spring-2027__f0rm0002__agi-strategy`]: record({
        roundId: "spring-2027__f0rm0002",
        term: "Spring 2027",
        lastSessionOn: "2027-03-17",
        heading: "How spring 2027 went.",
        publishedAt: new Date("2027-03-20T10:00:00Z"),
      }),
    });
    const html = await draw();
    assert.ok(html.includes("How spring 2027 went."));
    assert.ok(!html.includes("How autumn 2026 went."));
  });

  test("its quotes' cards take the ground the section does not", async () => {
    globalThis.__lastTerm.db = makeDb({ [`publicNumbers/${ROUND}__agi-strategy`]: record() });
    // With nothing else on the page but the weeks, the block is the second section: the raised ground.
    const html = await draw();
    const section = html.slice(html.lastIndexOf("<section", html.indexOf("last-term-heading")), html.indexOf("last-term-heading"));
    assert.match(section, /class="section raised rule"/);
    assert.match(html, /<div class="block" data-ground="raised">/);
  });
});
