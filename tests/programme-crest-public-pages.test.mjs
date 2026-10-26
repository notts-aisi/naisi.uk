/**
 * The crest on the pages any visitor can load, and on the application form's
 * ranking (run via `npm test`, Node's built-in runner: the real pages and
 * components rendered on the server, the real crest loader reading courses
 * from an in-memory store, and the term, the catalogue and the course page's
 * other lookups handed in by the suite).
 *
 * Four placements, each by the rule in `src/lib/crests/resolve.ts`:
 *
 *  1. THE HEAD OF A COURSE'S PUBLIC PAGE (`/courses/<course>`), 128px: the
 *     programme of the term tied to the course by the programme's rule (its
 *     own crest, else this course's), and a course no programme is tied to
 *     by the course's (its own, else the emblem).
 *  2. THE CARDS ON /courses, 64px: each of the term's programmes by the
 *     programme's rule, each other course by the course's.
 *  3. THE INCUBATOR ROWS on /incubator, 48px, by the programme's rule, read
 *     only when the page lists more than one incubator.
 *  4. THE RANKING on the application form, 28px, from the answer the form's
 *     page worked out on the server; a ranking question draws no mark.
 *
 * Everywhere: decorative (the name is beside it), the NAISI emblem in a
 * crest's place at the same height, and the crest's colour as its own token.
 * A programme's crest is never worked out from its name.
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

globalThis.__crestPublic = {
  h: createElement,
  db: null,
  term: null,
  catalogue: [],
  course: null,
  page: null,
  crestReads: 0,
};
const handle = "globalThis.__crestPublic";

/** Every stylesheet the pages import, as its own class names. */
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
    ["@/lib/firebase/admin", `export function getAdminDb() { ${handle}.crestReads += 1; return ${handle}.db; }`],
    ["@/features/term/fetchPublicTerm", `export async function fetchPublicTerm() { return ${handle}.term; }`],
    [
      "@/features/courses/fetchCourses",
      `export async function listPublishedCourses() { return ${handle}.catalogue; }\n` +
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
    // The call to action is a client island with its own suite; here it is the page's head that is read.
    ["@/features/courses/CourseCTA", "export default function CourseCTA() { return null; }"],
    ["@/features/events/BlockView", "export default function BlockView() { return null; }"],
    ["next/link", `export default ({ href, className, children }) => ${handle}.h("a", { href, className }, children);`],
    ["next/navigation", "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }"],
    ["@/components/ui/NetField", `export default ({ className, children }) => ${handle}.h("div", { className }, children);`],
    // A server render is a page before it hydrates.
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]),
});

const { default: PublicCoursePage } = await loadTs(join("app", "(public)", "courses", "[courseId]", "page.tsx"));
const { default: FellowshipsPage } = await loadTs(join("app", "(public)", "courses", "page.tsx"));
const { default: IncubatorPage } = await loadTs(join("app", "(public)", "incubator", "page.tsx"));
const { default: RankStep } = await loadTs(join("features", "applications", "apply", "RankStep.tsx"));
const { default: RankList } = await loadTs(join("features", "applications", "apply", "RankList.tsx"));
const { normalizeCourse } = await loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCoursePage } = await loadTs(join("lib", "firestore", "coursePages.ts"));

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const COURSE_A = "agi-strategy-fellowship__c0urse01";
const COURSE_B = "alignment-research-incubator__c0urse02";
const COURSE_C = "governance-incubator__c0urse03";
const COURSE_D = "pre-course__c0urse04";

/** One programme of the term, as the public term hands it to a page. */
const programme = (id, kind, over = {}) => ({
  id,
  kind,
  name: `${id} name`,
  shortName: `${id} short`,
  pitch: `${id} pitch.`,
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  courseId: null,
  runId: null,
  crest: null,
  ...over,
});

function termWith(programmes) {
  return {
    stage: "open",
    label: "Autumn 2026",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    applyPath: "/apply/form-1",
    next: null,
    programmes,
  };
}

/** The courses as stored, crests and all. A course id with no document is a course that is gone. */
function storeWith(crests) {
  const seed = {};
  for (const [id, crest] of Object.entries(crests)) {
    seed[`courses/${id}`] = { title: `${id} title`, status: "published", ...(crest === undefined ? {} : { crest }) };
  }
  return makeDb(seed);
}

/** A published course as the catalogue lists it, with only what a card reads. */
const catalogueEntry = (id, crest) => ({
  course: normalizeCourse(id, { title: `${id} title`, tagline: "", status: "published", crest }),
  about: { whoItIsFor: "", themes: [], weeklyHoursText: "", formatText: "" },
  visual: { seed: id, coverImageUrl: null, coverAlt: "" },
  liveRound: null,
  featuredRun: null,
  roundRun: null,
});

beforeEach(() => {
  Object.assign(globalThis.__crestPublic, {
    db: storeWith({}),
    term: termWith([]),
    catalogue: [],
    course: null,
    page: normalizeCoursePage(COURSE_A, {}),
    crestReads: 0,
  });
});

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
/** Each `<svg>` of one height, with where it starts: two crests of one shape open with the same tag. */
const marksWithPlaces = (html, size) =>
  [...html.matchAll(/<svg\b[^>]*>/g)]
    .filter(([tag]) => attr(tag, "height") === String(size))
    .map((match) => ({ tag: match[0], at: match.index }));
const marksAt = (html, size) => marksWithPlaces(html, size).map(({ tag }) => tag);
/** What each mark of one height is: a crest by its colour's token, or the emblem. */
function whatIsDrawn(html, size) {
  const out = [];
  for (const { tag, at: start } of marksWithPlaces(html, size)) {
    const body = html.slice(start, html.indexOf("</svg>", start));
    const key = body.match(/var\(--programme-([a-z-]+),/)?.[1] ?? null;
    out.push(key ?? (attr(tag, "class") === "emblem" ? "emblem" : "something else"));
    assert.equal(attr(tag, "aria-hidden"), "true", "a mark beside a name is decorative");
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The head of a course's public page
// ---------------------------------------------------------------------------

describe("the head of a course's public page", () => {
  const draw = async (course, programmes) => {
    globalThis.__crestPublic.course = { course: normalizeCourse(COURSE_A, { title: "AGI Strategy Fellowship", status: "published", ...course }), weeks: [] };
    globalThis.__crestPublic.term = termWith(programmes);
    const html = renderToStaticMarkup(await PublicCoursePage({ params: Promise.resolve({ courseId: COURSE_A }) }));
    const head = html.slice(html.indexOf("heroHead"), html.indexOf("</h1>"));
    return { html, head };
  };

  test("the programme tied to the course shows its own crest, over the course's", async () => {
    const { head } = await draw({ crest: "agi-strategy" }, [
      programme("agi", "fellowship", { courseId: COURSE_A, crest: "technical-ai-safety" }),
    ]);
    assert.deepEqual(whatIsDrawn(head, 128), ["technical-ai-safety"]);
  });

  test("a tied programme with none of its own shows the course's", async () => {
    const { head } = await draw({ crest: "agi-strategy" }, [programme("agi", "fellowship", { courseId: COURSE_A })]);
    assert.deepEqual(whatIsDrawn(head, 128), ["agi-strategy"]);
  });

  test("a course no programme is tied to shows its own crest", async () => {
    const { head } = await draw({ crest: "alignment" }, [
      programme("other", "fellowship", { courseId: COURSE_B, crest: "governance-macrostrategy" }),
    ]);
    assert.deepEqual(whatIsDrawn(head, 128), ["alignment"]);
  });

  test("with neither, the emblem stands in the crest's place at 128px", async () => {
    const { head } = await draw({}, [programme("agi", "fellowship", { courseId: COURSE_A })]);
    assert.deepEqual(whatIsDrawn(head, 128), ["emblem"]);
  });

  test("the crest sits in the head, before the title it is decorative beside", async () => {
    const { html } = await draw({ crest: "alignment" }, []);
    const mark = marksWithPlaces(html, 128)[0].at;
    assert.ok(mark > 0 && mark < html.indexOf("<h1"), "the mark comes before the title");
    assert.ok(html.indexOf("heroHead") < mark, "inside the head");
  });

  test("no crest is worked out from the course's or the programme's name", async () => {
    globalThis.__crestPublic.course = {
      course: normalizeCourse("alignment", { title: "Alignment", status: "published" }),
      weeks: [],
    };
    globalThis.__crestPublic.term = termWith([programme("alignment", "incubator", { courseId: "alignment", name: "Alignment Research Incubator" })]);
    const html = renderToStaticMarkup(await PublicCoursePage({ params: Promise.resolve({ courseId: "alignment" }) }));
    assert.deepEqual(whatIsDrawn(html, 128), ["emblem"]);
  });
});

// ---------------------------------------------------------------------------
// 2. The cards on /courses
// ---------------------------------------------------------------------------

describe("the cards on /courses", () => {
  test("each of the term's programmes by the programme's rule, and each other course by its own", async () => {
    globalThis.__crestPublic.db = storeWith({ [COURSE_A]: "agi-strategy", [COURSE_B]: undefined, [COURSE_C]: null });
    globalThis.__crestPublic.term = termWith([
      // Its own crest wins.
      programme("own", "fellowship", { courseId: COURSE_A, crest: "technical-ai-safety" }),
      // None of its own: its course's, read whatever the course's status.
      programme("course", "fellowship", { courseId: COURSE_A }),
      // None, and a course with none: the emblem.
      programme("neither", "fellowship", { courseId: COURSE_B }),
      // A course that is not there holds no crest.
      programme("gone", "fellowship", { courseId: "gone-course__c0urse99" }),
    ]);
    globalThis.__crestPublic.catalogue = [catalogueEntry(COURSE_D, "governance-macrostrategy"), catalogueEntry("plain__c0urse05", null)];
    const html = renderToStaticMarkup(await FellowshipsPage());
    assert.deepEqual(whatIsDrawn(html, 64), [
      "technical-ai-safety",
      "agi-strategy",
      "emblem",
      "emblem",
      "governance-macrostrategy",
      "emblem",
    ]);
  });

  test("a read of the courses that fails still draws every card, each with its own crest or the emblem", async (t) => {
    t.mock.method(console, "error", () => {});
    globalThis.__crestPublic.db = { getAll: async () => Promise.reject(new Error("the database did not answer")), collection: () => ({ doc: (id) => ({ id, path: `courses/${id}` }) }) };
    globalThis.__crestPublic.term = termWith([
      programme("own", "fellowship", { courseId: COURSE_A, crest: "alignment" }),
      programme("course", "fellowship", { courseId: COURSE_A }),
    ]);
    const html = renderToStaticMarkup(await FellowshipsPage());
    assert.deepEqual(whatIsDrawn(html, 64), ["alignment", "emblem"]);
  });
});

// ---------------------------------------------------------------------------
// 3. The incubator rows
// ---------------------------------------------------------------------------

describe("the incubator rows", () => {
  test("each incubator listed by name carries its crest at 48px, by the programme's rule", async () => {
    globalThis.__crestPublic.db = storeWith({ [COURSE_B]: "alignment", [COURSE_C]: null });
    globalThis.__crestPublic.term = termWith([
      programme("fellowship", "fellowship", { courseId: COURSE_A, crest: "agi-strategy" }),
      programme("governance", "incubator", { courseId: COURSE_C, crest: "governance-macrostrategy" }),
      programme("alignment", "incubator", { courseId: COURSE_B }),
      programme("third", "incubator", { courseId: COURSE_C }),
    ]);
    const html = renderToStaticMarkup(await IncubatorPage());
    assert.deepEqual(whatIsDrawn(html, 48), ["governance-macrostrategy", "alignment", "emblem"]);
    // Only the incubators are rows; the fellowship is not drawn here.
    assert.ok(!html.includes("var(--programme-agi-strategy"));
  });

  test("with one incubator there are no rows, and no course is read for them", async () => {
    globalThis.__crestPublic.term = termWith([programme("only", "incubator", { courseId: COURSE_B, crest: "alignment" })]);
    const before = globalThis.__crestPublic.crestReads;
    const html = renderToStaticMarkup(await IncubatorPage());
    assert.deepEqual(marksAt(html, 48), []);
    assert.equal(globalThis.__crestPublic.crestReads, before, "the database was not asked for");
  });
});

// ---------------------------------------------------------------------------
// 4. The ranking on the application form
// ---------------------------------------------------------------------------

describe("the ranking on the application form", () => {
  const applicant = (id) => ({ id, kind: "fellowship", name: `${id} name`, shortName: `${id} short`, pitch: "", facts: "6 WEEKS", starts: "", closed: false });

  test("each row carries the programme's crest at 28px, as the page worked it out", () => {
    const html = renderToStaticMarkup(
      createElement(RankStep, {
        programmes: [applicant("a"), applicant("b"), applicant("c")],
        onReorder() {},
        shownCrests: { a: "agi-strategy", b: null },
      }),
    );
    // b has none (the emblem); c is not in the answer at all (the emblem too).
    assert.deepEqual(whatIsDrawn(html, 28), ["agi-strategy", "emblem", "emblem"]);
  });

  test("the mark sits between the row's number and its name", () => {
    const html = renderToStaticMarkup(
      createElement(RankStep, { programmes: [applicant("a")], onReorder() {}, shownCrests: { a: "alignment" } }),
    );
    const number = html.indexOf('class="number"');
    const mark = marksWithPlaces(html, 28)[0].at;
    const name = html.indexOf('class="name"');
    assert.ok(number < mark && mark < name);
  });

  test("a ranking question's options carry no mark", () => {
    const html = renderToStaticMarkup(
      createElement(RankList, {
        items: [{ id: "one", name: "One option" }, { id: "two", name: "Another option" }],
        onReorder() {},
        label: "Your order",
        dndId: "a-question",
      }),
    );
    assert.equal(marksAt(html, 28).length, 0);
    assert.ok(!html.includes('class="mark"'));
  });
});
