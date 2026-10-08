/**
 * How many incubators the term's form carries, and what the incubator's page
 * (`/incubator`) and the fellowships page's panel about it (`/courses`) say
 * for each count.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Both pages are words about one incubator: it replicates a paper, it is
 * technical, it runs for 10 weeks. A term's form can carry more than one
 * incubator, and then those words are true of one of them at most. What each
 * page says for each count is written in
 * `src/app/(public)/incubator/incubatorWords.ts`, and five things have to
 * hold:
 *
 *  1. WITH ONE INCUBATOR, OR NONE, THE PAGES SAY THEIR OWN WORDS. They are
 *     pinned here, so the rule for several cannot change what one reads.
 *  2. WITH MORE THAN ONE, NOTHING IS SAID OF THEM ALL THAT THE FORM DOES NOT
 *     SAY. They are counted, each is named with its own name, its own
 *     description and its own facts line, and no chip or sentence calls the
 *     term's incubators technical or gives them one length.
 *  3. WHAT IS SAID OF ONE INCUBATOR IS THE FORM'S. A blank description or
 *     facts line is left out and nobody else's stands in for it, and nothing
 *     else stored about a programme reaches the page.
 *  4. A START BELONGS TO THE INCUBATOR THAT WROTE IT. It is printed beside
 *     that incubator, and for the incubators as a whole only when every one
 *     says the same.
 *  5. THE PAGES DRAW WHAT THOSE FUNCTIONS SAY. Both are rendered here from a
 *     term handed to them, and their sources are read for the words that
 *     must not be typed into a page again.
 *
 * Then one rule for the whole tree:
 *
 *  6. NO FILE LETS THE FIRST PROGRAMME OF A KIND STAND FOR THE REST. Every
 *     source file is read for a `find` (or the first of a `filter`) that
 *     picks a programme by its kind. What that cannot see: a loop that stops
 *     at the first, and a destructured first element.
 *
 * Stubbed: the term's fetcher (it returns the term a test sets), the list of
 * published courses (empty), `next/link` (an anchor), the network drawing
 * (a plain box) and the stylesheets (each class is its own name).
 */

// Before anything reads the clock. `node --test` runs each file in its own
// process, so this reaches no other suite.
process.env.TZ = "America/Los_Angeles";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

globalThis.__incubators = { term: null, h: createElement };

const h = "globalThis.__incubators.h";
/** A stylesheet as its own class names, so `styles.incubator` renders as `class="incubator"`. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/features/term/fetchPublicTerm", "export async function fetchPublicTerm() { return globalThis.__incubators.term; }"],
    [
      "@/features/courses/fetchCourses",
      "export async function listPublishedCourses() { return []; } export function roundOwnsDates() { return false; }",
    ],
    ["next/link", `export default ({ href, className, children }) => ${h}("a", { href, className }, children);`],
    ["@/components/ui/NetField", `export default ({ className, children }) => ${h}("div", { className }, children);`],
    ["./incubator.module.css", CLASS_NAMES],
    ["./courses.module.css", CLASS_NAMES],
    ["./programme.module.css", CLASS_NAMES],
    ["@/features/programmes/programme.module.css", CLASS_NAMES],
    ["./TermApplyLink.module.css", CLASS_NAMES],
    ["./TermStatusLine.module.css", CLASS_NAMES],
    ["./TermDates.module.css", CLASS_NAMES],
    ["./Chip.module.css", CLASS_NAMES],
    ["./CourseFaq.module.css", CLASS_NAMES],
    ["./CourseVisual.module.css", CLASS_NAMES],
  ]),
});

const words = await loadTs(join("app", "(public)", "incubator", "incubatorWords.ts"));
const decisionCopy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));
const { default: IncubatorPage } = await loadTs(join("app", "(public)", "incubator", "page.tsx"));
const { default: FellowshipsPage } = await loadTs(join("app", "(public)", "courses", "page.tsx"));

// ---------------------------------------------------------------------------
// A term, as the fetcher hands it to a page
// ---------------------------------------------------------------------------

/** One programme with every field the term carries, each value findable in a page. */
const programme = (id, kind, over = {}) => ({
  id,
  kind,
  name: `${id} name`,
  shortName: `${id} short name`,
  pitch: `${id} pitch.`,
  facts: `${id} facts line`,
  starts: "w/c 26 Oct",
  courseId: `${id}-course-id`,
  runId: `${id}-run-id`,
  ...over,
});

const FELLOWSHIP_A = programme("fellowship-a", "fellowship");
const FELLOWSHIP_B = programme("fellowship-b", "fellowship");
const FIRST = programme("first", "incubator", { name: "First Incubator", pitch: "The first one’s own line." });
const SECOND = programme("second", "incubator", { name: "Second Incubator", pitch: "The second one’s own line." });
const SECOND_LATER = { ...SECOND, starts: "w/c 2 Nov" };

const OPENS = new Date("2026-10-06T08:00:00Z");
const CLOSES = new Date("2026-10-18T22:59:00Z");

function termWith(programmes, stage = "open") {
  if (stage === "none") {
    return { stage, label: null, opensAt: null, closesAt: null, decisionsByDate: null, applyPath: null, next: null, programmes: [] };
  }
  return {
    stage,
    label: "Autumn 2026",
    opensAt: OPENS,
    closesAt: CLOSES,
    decisionsByDate: "2026-10-23",
    applyPath: stage === "open" ? "/apply/form-1" : null,
    next: null,
    programmes,
  };
}

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function draw(Page, programmes, stage = "open") {
  globalThis.__incubators.term = termWith(programmes, stage);
  const html = renderToStaticMarkup(await Page());
  return { html, text: textOf(html) };
}

/** How many times `needle` is in `haystack`. */
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** The text between two sentences of a page, the first included. */
function between(text, from, to) {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  assert.ok(start >= 0, `the page does not say "${from}"`);
  assert.ok(end > start, `the page does not say "${to}" after "${from}"`);
  return text.slice(start, end).trim();
}

const pageFacts = (incubators, stage = "open", termLabel = "Autumn 2026") => ({ incubators, stage, termLabel });

const SENTENCE =
  "Replicate a published AI safety paper with a small team, then add your own twist. There’s food at every session.";
const WHO_ONE =
  "It’s for people who’ve done a fellowship with us, or have a similar background. This term’s projects are technical, so expect to read ML papers closely and write code.";

/** The four steps of applying, as the page says them of one incubator. */
const STEPS_ONE = {
  apply: "Tick the incubator. If you tick a fellowship too, put them in order.",
  questionsTitle: "Answer its questions",
  questions: "The incubator has its own questions on the same form.",
  hearBack: "The person who runs the incubator reads every answer. We’ll email you our decision.",
  start: "Your first session is in person, on campus.",
};
/** And of more than one. The last is what an incubator's people are told once they have a place. */
const INCUBATOR_NEXT = "We’ll email you before you start with how the first week works.";
const STEPS_SEVERAL = {
  apply: "Tick the incubators you’re interested in. If you tick more than one programme, put them in order.",
  questionsTitle: "Answer their questions",
  questions: "The incubators have their own questions on the same form.",
  hearBack: "The person who runs each incubator reads every answer. We’ll email you our decision.",
  start: INCUBATOR_NEXT,
};

// ---------------------------------------------------------------------------
// 1. One incubator, or none
// ---------------------------------------------------------------------------

describe("the incubator's page with one incubator on the form, or none", () => {
  test("with one, it says the page's own words and names the term", () => {
    assert.deepEqual(words.incubatorPageWords(pageFacts([FIRST])), {
      eyebrow: "Research incubator · Autumn 2026",
      title: "Replicate a paper. Then add your twist.",
      lede: SENTENCE,
      chips: ["10 weeks over 2 terms", "Technical this term", "Free"],
      listed: [],
      runsEyebrow: "How it runs",
      whoEyebrow: "Who it’s for",
      whoBody: WHO_ONE,
      starts: "w/c 26 Oct",
      steps: STEPS_ONE,
    });
  });

  test("with none, the same words, no term named and no start", () => {
    assert.deepEqual(words.incubatorPageWords(pageFacts([], "none", null)), {
      eyebrow: "Research incubator",
      title: "Replicate a paper. Then add your twist.",
      lede: SENTENCE,
      chips: ["10 weeks over 2 terms", "Technical this term", "Free"],
      listed: [],
      runsEyebrow: "How it runs",
      whoEyebrow: "Who it’s for",
      whoBody: WHO_ONE,
      starts: null,
      steps: STEPS_ONE,
    });
    // A term with fellowships and no incubator is no term for this page, so its label is not printed.
    assert.equal(words.incubatorPageWords(pageFacts([], "none", "Autumn 2026")).eyebrow, "Research incubator");
  });

  test("a form that names no term still reads as one incubator", () => {
    assert.equal(words.incubatorPageWords(pageFacts([FIRST], "open", null)).eyebrow, "Research incubator");
  });
});

// ---------------------------------------------------------------------------
// 2 and 3. More than one
// ---------------------------------------------------------------------------

describe("the incubator's page with more than one incubator on the form", () => {
  const two = words.incubatorPageWords(pageFacts([FIRST, SECOND]));

  test("they are counted, in plain words", () => {
    assert.deepEqual(two.chips, ["2 incubators this term", "Free"]);
    assert.equal(two.eyebrow, "Research incubators · Autumn 2026");
    assert.equal(two.title, "Research incubators.");
    const three = words.incubatorPageWords(pageFacts([FIRST, SECOND, programme("third", "incubator")]));
    assert.deepEqual(three.chips, ["3 incubators this term", "Free"]);
    assert.equal(words.incubatorPageWords(pageFacts([FIRST, SECOND], "open", null)).eyebrow, "Research incubators");
  });

  test("each is named with its own name, description and facts line, in the form's order", () => {
    assert.deepEqual(two.listed, [
      {
        id: "first",
        name: "First Incubator",
        pitch: "The first one’s own line.",
        facts: "first facts line",
        starts: "Starts w/c 26 Oct",
      },
      {
        id: "second",
        name: "Second Incubator",
        pitch: "The second one’s own line.",
        facts: "second facts line",
        starts: "Starts w/c 26 Oct",
      },
    ]);
    const turned = words.incubatorPageWords(pageFacts([SECOND, FIRST]));
    assert.deepEqual(turned.listed.map((incubator) => incubator.id), ["second", "first"]);
  });

  test("nothing is said of them all that could be true of one and not another", () => {
    const top = [two.eyebrow, two.title, two.lede ?? "", ...two.chips].join(" | ");
    assert.equal(two.lede, null, "the sentence about replicating a paper is printed over every incubator");
    assert.ok(!/technical/i.test(top), `the top of the page calls the incubators technical: ${top}`);
    assert.ok(!/replicat/i.test(top), `the top of the page says every incubator replicates a paper: ${top}`);
    assert.ok(!top.includes(words.REPLICATION_LENGTH), `the top of the page gives every incubator one length: ${top}`);
    // What the page goes on to say about replicating a paper is labelled as being about that.
    assert.equal(two.runsEyebrow, "Replicating a paper · how it runs");
    assert.equal(two.whoEyebrow, "Replicating a paper · who it’s for");
    assert.ok(!two.whoBody.includes("This term’s projects"), "the paragraph still speaks for the whole term");
    assert.equal(
      two.whoBody,
      "It’s for people who’ve done a fellowship with us, or have a similar background. Replicating a paper is technical, so expect to read ML papers closely and write code.",
    );
  });

  test("the steps of applying speak of the incubators, and of whoever runs each", () => {
    assert.deepEqual(two.steps, STEPS_SEVERAL);
    assert.deepEqual(words.incubatorPageWords(pageFacts([FIRST, SECOND, programme("third", "incubator")])).steps, STEPS_SEVERAL);
    // Not one of them speaks of "the incubator", as if there were one.
    for (const said of Object.values(two.steps)) {
      assert.doesNotMatch(said, /\bthe incubator\b(?!s)/i, said);
      assert.doesNotMatch(said, /\bits\b/i, said);
    }
  });

  test("how an incubator starts is not said for them all: the last step is what the site tells an incubator's people", () => {
    assert.equal(two.steps.start, decisionCopy.placeNextWords("incubator").page);
    assert.equal(two.steps.start, decisionCopy.placeNextWords("incubator").email);
    assert.doesNotMatch(two.steps.start, /in person|campus|small group|facilitator/i);
    // And nothing in the steps promises where any of them meets.
    assert.doesNotMatch(Object.values(two.steps).join(" "), /in person|on campus/i);
  });

  test("a blank description is left out, and nobody else's stands in for it", () => {
    const blank = words.incubatorPageWords(pageFacts([FIRST, { ...SECOND, pitch: "   " }]));
    assert.deepEqual(blank.listed[1], {
      id: "second",
      name: "Second Incubator",
      pitch: null,
      facts: "second facts line",
      starts: "Starts w/c 26 Oct",
    });
    assert.equal(blank.listed[0].pitch, "The first one’s own line.");
  });

  test("a blank facts line is left out, and neither another's nor the page's own length stands in for it", () => {
    const blank = words.incubatorPageWords(pageFacts([FIRST, { ...SECOND, facts: "  " }]));
    assert.equal(blank.listed[1].facts, null);
    assert.equal(blank.listed[0].facts, "first facts line");
    assert.ok(!JSON.stringify(blank).includes(words.REPLICATION_LENGTH));
  });

  test("the words handed back hold nothing of a programme but its name, description, facts line and start", () => {
    const said = JSON.stringify(two);
    for (const kept of [FIRST, SECOND]) {
      for (const field of ["shortName", "courseId", "runId"]) {
        assert.ok(!said.includes(kept[field]), `${kept.id}: ${field} reached the page's words`);
      }
    }
    for (const listed of two.listed) {
      assert.deepEqual(Object.keys(listed).sort(), ["facts", "id", "name", "pitch", "starts"]);
    }
  });

  test("with one incubator, nothing of the programme is in the words but its start", () => {
    const said = JSON.stringify(words.incubatorPageWords(pageFacts([FIRST])));
    for (const field of ["name", "shortName", "pitch", "facts", "courseId", "runId"]) {
      assert.ok(!said.includes(FIRST[field]), `${field} reached the words of a page about one incubator`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. A start
// ---------------------------------------------------------------------------

describe("when an incubator starts", () => {
  test("it is printed beside the incubator that wrote it, while it is still ahead", () => {
    const starts = (stage) =>
      words.incubatorPageWords(pageFacts([FIRST, SECOND_LATER], stage)).listed.map((incubator) => incubator.starts);
    assert.deepEqual(starts("before"), ["Starts w/c 26 Oct", "Starts w/c 2 Nov"]);
    assert.deepEqual(starts("open"), ["Starts w/c 26 Oct", "Starts w/c 2 Nov"]);
    assert.deepEqual(starts("closed"), ["Starts w/c 26 Oct", "Starts w/c 2 Nov"]);
    assert.deepEqual(starts("running"), [null, null]);
  });

  test("one that names no start has none, and the other's is not lent to it", () => {
    const listed = words.incubatorPageWords(pageFacts([FIRST, { ...SECOND, starts: "" }])).listed;
    assert.deepEqual(listed.map((incubator) => incubator.starts), ["Starts w/c 26 Oct", null]);
  });

  test("for the incubators as a whole it is the start every one shares, or none", () => {
    const whole = (incubators) => words.incubatorPageWords(pageFacts(incubators)).starts;
    assert.equal(whole([FIRST]), "w/c 26 Oct");
    assert.equal(whole([{ ...FIRST, starts: "  w/c 26 Oct " }]), "w/c 26 Oct");
    assert.equal(whole([{ ...FIRST, starts: " " }]), null);
    assert.equal(whole([FIRST, SECOND]), "w/c 26 Oct");
    assert.equal(whole([FIRST, SECOND_LATER]), null, "one incubator's start is printed for both");
    assert.equal(whole([FIRST, { ...SECOND, starts: "" }]), null, "a start is printed for an incubator that names none");
    assert.equal(whole([]), null);
  });
});

// ---------------------------------------------------------------------------
// The fellowships page's panel, and its line about the form
// ---------------------------------------------------------------------------

describe("the fellowships page's panel about the incubator", () => {
  test("with one incubator, or none, it is the panel's own words", () => {
    assert.deepEqual(words.incubatorTeaserWords([FIRST]), {
      label: "first facts line",
      eyebrow: "Research incubator",
      body: SENTENCE,
      listed: [],
      link: "See the incubator",
    });
    const fallback = {
      label: "10 weeks over 2 terms",
      eyebrow: "Research incubator",
      body: SENTENCE,
      listed: [],
      link: "See the incubator",
    };
    assert.deepEqual(words.incubatorTeaserWords([{ ...FIRST, facts: "" }]), fallback);
    assert.deepEqual(words.incubatorTeaserWords([]), fallback);
  });

  test("with more than one, it counts them and names each with its own description", () => {
    assert.deepEqual(words.incubatorTeaserWords([FIRST, SECOND]), {
      label: "2 incubators this term",
      eyebrow: "Research incubators",
      body: null,
      listed: [
        { id: "first", name: "First Incubator", pitch: "The first one’s own line." },
        { id: "second", name: "Second Incubator", pitch: "The second one’s own line." },
      ],
      link: "See the incubators",
    });
  });

  test("with more than one, no incubator's facts line is printed over the others", () => {
    const said = JSON.stringify(words.incubatorTeaserWords([FIRST, SECOND]));
    assert.ok(!said.includes(FIRST.facts) && !said.includes(SECOND.facts), said);
    assert.ok(!said.includes(words.REPLICATION_LENGTH), said);
    assert.ok(!/replicat/i.test(said), said);
  });

  test("a blank description is left out", () => {
    const { listed } = words.incubatorTeaserWords([{ ...FIRST, pitch: "" }, SECOND]);
    assert.deepEqual(listed[0], { id: "first", name: "First Incubator", pitch: null });
  });
});

describe("the line about what the one form covers", () => {
  const line = (fellowships, incubators) => words.oneFormWords({ fellowships, incubators });

  test("it names two fellowships and the incubator only when that is exactly what the form holds", () => {
    assert.equal(line(2, 1), "One form covers both fellowships and the research incubator.");
  });

  test("with any other count it says what is true of every form", () => {
    for (const [fellowships, incubators] of [[2, 2], [2, 0], [1, 1], [3, 1], [0, 2], [0, 0]]) {
      assert.equal(line(fellowships, incubators), "There’s one form for every programme.", `${fellowships} and ${incubators}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The pages, drawn
// ---------------------------------------------------------------------------

describe("the incubator's page, drawn", () => {
  const STATUS = "Applications open now · Close Sun 18 Oct, 23:59";

  test("with one incubator the top reads as the page's own words", async () => {
    const { text } = await draw(IncubatorPage, [FELLOWSHIP_A, FELLOWSHIP_B, FIRST]);
    assert.equal(
      between(text, "Research incubator", "How it runs"),
      `Research incubator · Autumn 2026 Replicate a paper. Then add your twist. ${SENTENCE} ` +
        `10 weeks over 2 terms Technical this term Free Apply How to apply ${STATUS}`,
    );
    assert.ok(text.includes(`Who it’s for Ready to do research. ${WHO_ONE} The details`));
    // The one incubator's start: in the timeline and on the last step.
    assert.equal(count(text, "w/c 26 Oct"), 2);
    assert.ok(text.includes("Autumn term · in person w/c 26 Oct Read and critique"));
    assert.ok(text.includes("Your first session is in person, on campus. w/c 26 Oct"));
    assert.ok(!text.includes("first name") && !text.includes("First Incubator"), "one incubator is listed by name");
  });

  test("with none it reads the same, with nothing about a term", async () => {
    for (const programmes of [[], [FELLOWSHIP_A, FELLOWSHIP_B]]) {
      const { text } = await draw(IncubatorPage, programmes, programmes.length ? "open" : "none");
      assert.equal(
        between(text, "Research incubator", "How it runs"),
        `Research incubator Replicate a paper. Then add your twist. ${SENTENCE} ` +
          "10 weeks over 2 terms Technical this term Free How to apply",
      );
      assert.ok(text.endsWith("Applications aren’t open right now. Compare the fellowships"));
      assert.equal(count(text, "w/c 26 Oct"), 0);
    }
  });

  test("with two, the top counts them and names each, and says nothing else about them", async () => {
    const { text } = await draw(IncubatorPage, [FELLOWSHIP_A, FELLOWSHIP_B, FIRST, SECOND_LATER]);
    assert.equal(
      between(text, "Research incubators", "Replicating a paper · how it runs"),
      "Research incubators · Autumn 2026 Research incubators. 2 incubators this term Free " +
        "First Incubator The first one’s own line. first facts line Starts w/c 26 Oct " +
        "Second Incubator The second one’s own line. second facts line Starts w/c 2 Nov " +
        `Apply How to apply ${STATUS}`,
    );
  });

  test("with two, nowhere on the page are the term's incubators called technical", async () => {
    const { text } = await draw(IncubatorPage, [FIRST, SECOND]);
    assert.ok(!text.includes("Technical this term"));
    assert.ok(!text.includes("This term’s projects are technical"));
    assert.ok(text.includes("Replicating a paper · who it’s for Ready to do research."));
    assert.ok(text.includes("Replicating a paper is technical, so expect to read ML papers closely and write code."));
  });

  test("with two that start apart, each start is printed once, beside its own incubator", async () => {
    const { text } = await draw(IncubatorPage, [FIRST, SECOND_LATER]);
    assert.equal(count(text, "w/c 26 Oct"), 1, "the first incubator's start is printed for the incubators as a whole");
    assert.equal(count(text, "w/c 2 Nov"), 1);
    assert.ok(text.includes("First Incubator The first one’s own line. first facts line Starts w/c 26 Oct"));
    assert.ok(text.includes("Second Incubator The second one’s own line. second facts line Starts w/c 2 Nov"));
    assert.ok(text.includes("Autumn term · in person Read and critique"), "the timeline prints a start the incubators do not share");
    assert.ok(text.includes(`Start ${INCUBATOR_NEXT} Not taken this time?`), "the last step prints a start the incubators do not share");
  });

  test("with two that start together, the shared start is also printed for them as a whole", async () => {
    const { text } = await draw(IncubatorPage, [FIRST, SECOND]);
    assert.equal(count(text, "w/c 26 Oct"), 4);
    assert.ok(text.includes("Autumn term · in person w/c 26 Oct Read and critique"));
    assert.ok(text.includes(`Start ${INCUBATOR_NEXT} w/c 26 Oct`));
  });

  test("with one incubator, or none, the four steps read as they always have", async () => {
    for (const programmes of [[FELLOWSHIP_A, FELLOWSHIP_B, FIRST], [FIRST], [FELLOWSHIP_A], []]) {
      const { text } = await draw(IncubatorPage, programmes, programmes.some((entry) => entry.kind === "incubator") ? "open" : "none");
      for (const said of [
        `Apply ${STEPS_ONE.apply}`,
        `Answer its questions ${STEPS_ONE.questions} Part of the form`,
        `Hear back ${STEPS_ONE.hearBack}`,
        `Start ${STEPS_ONE.start}`,
      ]) {
        assert.ok(text.includes(said), `${programmes.length} programmes: missing ${said}`);
      }
      assert.ok(!text.includes(INCUBATOR_NEXT));
    }
  });

  test("with two, the four steps speak of the incubators, and none of one", async () => {
    for (const programmes of [[FIRST, SECOND], [FELLOWSHIP_A, FELLOWSHIP_B, FIRST, SECOND_LATER]]) {
      const { text } = await draw(IncubatorPage, programmes);
      for (const said of [
        `Apply ${STEPS_SEVERAL.apply}`,
        `Answer their questions ${STEPS_SEVERAL.questions} Part of the form`,
        `Hear back ${STEPS_SEVERAL.hearBack}`,
        `Start ${STEPS_SEVERAL.start}`,
      ]) {
        assert.ok(text.includes(said), `missing ${said}`);
      }
      for (const ofOne of ["Tick the incubator.", "The incubator has its own questions", "The person who runs the incubator", "Your first session is in person, on campus."]) {
        assert.ok(!text.includes(ofOne), `the page still says: ${ofOne}`);
      }
    }
  });

  test("once the term is running no start is printed, for one incubator or for two", async () => {
    for (const programmes of [[FIRST], [FIRST, SECOND_LATER]]) {
      const { text } = await draw(IncubatorPage, programmes, "running");
      assert.equal(count(text, "w/c"), 0, `${programmes.length} incubators`);
    }
  });

  test("with two, each facts line is printed once, beside its own incubator, and the page's own length is not", async () => {
    const { text } = await draw(IncubatorPage, [FIRST, { ...SECOND, facts: "" }]);
    assert.equal(count(text, "first facts line"), 1);
    assert.ok(text.includes("First Incubator The first one’s own line. first facts line Starts w/c 26 Oct"));
    // The second names no facts line, and is lent neither the first's nor the page's own.
    assert.ok(text.includes("Second Incubator The second one’s own line. Starts w/c 26 Oct Apply"));
    assert.ok(!between(text, "Research incubators", "Replicating a paper · how it runs").includes("10 weeks"));
  });

  test("nothing else stored about a programme is in the page", async () => {
    const { html } = await draw(IncubatorPage, [FELLOWSHIP_A, FIRST, SECOND]);
    for (const kept of [FELLOWSHIP_A, FIRST, SECOND]) {
      for (const field of ["shortName", "courseId", "runId"]) {
        assert.ok(!html.includes(kept[field]), `${kept.id}: ${field} is in the page's HTML`);
      }
    }
    // A fellowship is not this page's to name.
    for (const field of ["name", "pitch", "facts"]) {
      assert.ok(!html.includes(FELLOWSHIP_A[field]), `the fellowship's ${field} is in the page's HTML`);
    }
  });

  test("with one incubator, the page prints nothing stored about it but its start", async () => {
    const { html } = await draw(IncubatorPage, [FELLOWSHIP_A, FIRST]);
    for (const field of ["name", "shortName", "pitch", "facts", "courseId", "runId"]) {
      assert.ok(!html.includes(FIRST[field]), `${field} is in the HTML of a page about one incubator`);
    }
  });
});

describe("the fellowships page, drawn", () => {
  const BAND = "Apply by Sun 18 Oct.";

  test("with one incubator the panel is its own words, under that incubator's facts line", async () => {
    const { text } = await draw(FellowshipsPage, [FELLOWSHIP_A, FELLOWSHIP_B, FIRST]);
    assert.equal(
      between(text, "After a fellowship", BAND),
      `After a fellowship Ready for research? first facts line Research incubator ${SENTENCE} See the incubator`,
    );
    assert.ok(text.includes("How applying works. One form covers both fellowships and the research incubator."));
  });

  test("with none the panel says the same, with the length a replication runs", async () => {
    const { text } = await draw(FellowshipsPage, [FELLOWSHIP_A, FELLOWSHIP_B]);
    assert.equal(
      between(text, "After a fellowship", BAND),
      `After a fellowship Ready for research? 10 weeks over 2 terms Research incubator ${SENTENCE} See the incubator`,
    );
    assert.ok(text.includes("How applying works. There’s one form for every programme."));
  });

  test("with two the panel counts them and names each with its own description", async () => {
    const { text } = await draw(FellowshipsPage, [FELLOWSHIP_A, FELLOWSHIP_B, FIRST, SECOND]);
    assert.equal(
      between(text, "After a fellowship", BAND),
      "After a fellowship Ready for research? 2 incubators this term Research incubators " +
        "First Incubator The first one’s own line. Second Incubator The second one’s own line. See the incubators",
    );
    assert.ok(text.includes("How applying works. There’s one form for every programme."));
    assert.ok(!text.includes("the research incubator."), "the page still speaks of one incubator on the form");
    assert.ok(!text.includes(FIRST.facts) && !text.includes(SECOND.facts), "one incubator's facts line is printed");
  });
});

// ---------------------------------------------------------------------------
// 5, from the sources
// ---------------------------------------------------------------------------

const codeOf = (...parts) => stripSource(readFileSync(join(SRC, ...parts), "utf8"), { keepStrings: true });

describe("the pages take these words from the one place", () => {
  const INCUBATOR = codeOf("app", "(public)", "incubator", "page.tsx");
  const FELLOWSHIPS = codeOf("app", "(public)", "courses", "page.tsx");

  test("the incubator's page asks for its words by count, and types none of them itself", () => {
    assert.ok(INCUBATOR.includes("incubatorPageWords({ incubators, stage, termLabel: term.label })"));
    for (const typed of ["Technical this term", "This term’s projects", "10 weeks over 2 terms<", "Research incubator ·"]) {
      assert.ok(!INCUBATOR.includes(typed), `the page types "${typed}" itself`);
    }
    // Nor any of the steps of applying, which speak of one incubator or of several.
    for (const typed of ["Tick the incubator", "its own questions", "their own questions", "reads every answer", "first session is in person"]) {
      assert.ok(!INCUBATOR.includes(typed), `the page types "${typed}" itself`);
    }
    for (const step of ["apply", "questionsTitle", "questions", "hearBack", "start"]) {
      assert.ok(INCUBATOR.includes(`words.steps.${step}`), `the page does not draw words.steps.${step}`);
    }
    // How an incubator starts comes from the one table the decision email reads.
    const WORDS = codeOf("app", "(public)", "incubator", "incubatorWords.ts");
    assert.ok(WORDS.includes('import { placeNextWords } from "@/lib/applications/decisionDay/emailCopy";'));
    assert.ok(WORDS.includes('start: placeNextWords("incubator").page,'));
    // The start it prints for the incubators as a whole is the one the words hand it.
    assert.ok(INCUBATOR.includes("const starts = words.starts;"));
    assert.ok(!/\.starts\.trim\(\)/.test(INCUBATOR), "the page reads one programme's start itself");
  });

  test("the fellowships page asks for the panel's words and the form's line by count", () => {
    assert.ok(FELLOWSHIPS.includes("incubatorTeaserWords(incubators)"));
    assert.ok(FELLOWSHIPS.includes("oneFormWords({ fellowships: fellowships.length, incubators: incubators.length })"));
    for (const typed of ["See the incubator", "One form covers", "Replicate a published"]) {
      assert.ok(!FELLOWSHIPS.includes(typed), `the page types "${typed}" itself`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. No file lets the first programme of a kind stand for the rest
// ---------------------------------------------------------------------------

/**
 * `<file> :: <what was found>` for a file that may pick one programme by its
 * kind, with the reason one is all there can be. Empty: nothing does.
 */
const FIRST_OF_A_KIND_ALLOWED = {};

const KIND = String.raw`\.kind\s*===\s*"(?:fellowship|incubator)"`;
const ARROW_ON_KIND = String.raw`\(\s*\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>\s*[A-Za-z_$][\w$]*\??${KIND}\s*\)`;
/** `.find((p) => p.kind === "incubator")`. */
const FIND_BY_KIND = new RegExp(String.raw`\.find${ARROW_ON_KIND}`, "g");
/** `.filter((p) => p.kind === "incubator")[0]`, or `.at(0)`. */
const FIRST_OF_FILTER = new RegExp(String.raw`\.filter${ARROW_ON_KIND}\s*(?:\[\s*0\s*\]|\.at\(\s*0\s*\))`, "g");

function firstOfAKind(code) {
  return [...code.matchAll(FIND_BY_KIND), ...code.matchAll(FIRST_OF_FILTER)].map((match) => match[0].replace(/\s+/g, " "));
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}

describe("no file lets the first programme of a kind stand for the rest", () => {
  test("the scanner sees what it is for", () => {
    assert.deepEqual(firstOfAKind('const one = term.programmes.find((programme) => programme.kind === "incubator") ?? null;'), [
      '.find((programme) => programme.kind === "incubator")',
    ]);
    assert.equal(firstOfAKind('const one = all.find(p => p.kind === "fellowship");').length, 1);
    assert.equal(firstOfAKind('const one = all.filter((p) => p.kind === "incubator")[0];').length, 1);
    assert.equal(firstOfAKind('const one = all.filter((p) => p?.kind === "incubator").at(0);').length, 1);
    // Every programme of a kind, a count of them, and a question about one are not a pick.
    assert.deepEqual(firstOfAKind('const all = term.programmes.filter((programme) => programme.kind === "incubator");'), []);
    assert.deepEqual(firstOfAKind('const any = programmes.some((p) => p.kind === "incubator");'), []);
    assert.deepEqual(firstOfAKind('const chosen = programmes.find((p) => p.id === id);'), []);
  });

  test("the walk reads the tree, the two pages among it", () => {
    const files = [...sourceFiles(SRC)].map((file) => relative(REPO_ROOT, file).split(sep).join("/"));
    assert.ok(files.length > 500, `only ${files.length} source files were read`);
    assert.ok(files.includes("src/app/(public)/incubator/page.tsx"));
    assert.ok(files.includes("src/app/(public)/courses/page.tsx"));
  });

  test("none does, both directions", () => {
    const found = [];
    for (const file of sourceFiles(SRC)) {
      const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
      for (const hit of firstOfAKind(code)) found.push(`${relative(REPO_ROOT, file).split(sep).join("/")} :: ${hit}`);
    }
    const unregistered = found.filter((site) => !(site in FIRST_OF_A_KIND_ALLOWED));
    assert.deepEqual(
      unregistered,
      [],
      "A file picks one programme by its kind, so what it says is the first one's and not the others'. " +
        "Read every programme of that kind, or register the site with the reason there can only be one.",
    );
    const stale = Object.keys(FIRST_OF_A_KIND_ALLOWED).filter((site) => !found.includes(site));
    assert.deepEqual(stale, [], "These registered sites no longer exist: remove them.");
    for (const [site, reason] of Object.entries(FIRST_OF_A_KIND_ALLOWED)) {
      assert.ok(String(reason).trim().length >= 40, `${site}: the reason is a placeholder.`);
    }
  });
});
