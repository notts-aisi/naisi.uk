/**
 * The programme pages: the fellowships page (`/courses`), one programme's
 * page (`/courses/[courseId]`) and the research incubator (`/incubator`).
 *
 * The three were redrawn together, and they say some things in more than one
 * place. This suite holds the seams where two places could come to disagree,
 * and the few rules the pages keep that no type can see.
 *
 * 1. THE CLOSING BAND AND THE CALL TO ACTION SAY ONE THING. While the form is
 *    taking applications, the band on the fellowships page and on the
 *    incubator's page is worded by `bandWords`, and the band on a course's own
 *    page by the course's call to action. Both are run here from the same
 *    dates, and the words must be the same words.
 * 2. THE BAND AND THE LINE UNDER THE HERO SAY ONE THING. At every other stage
 *    the band is built from the parts of the hero's status line, a part to a
 *    sentence.
 * 3. A CHIP WORDS A STATE SOMEBODY ELSE DECIDED. `applicationStateWords` is
 *    the one place the fellowships page and a course's page get those words.
 * 4. AN AUTHOR'S TEXT IS NEVER CUT. `splitLead` decides how large a first
 *    line is set, and gives back every character it was handed.
 * 5. NO DATE IS WRITTEN INTO A PROGRAMME PAGE. Every day on these pages comes
 *    from the term's form or from a course's own round or run. A year or a
 *    day of a month typed into one of them is a date that goes stale without
 *    anybody noticing, so the sources are read for one.
 * 6. THE ANCHORS OTHER PAGES LINK TO ARE THERE.
 * 7. THE STYLESHEETS KEEP THE HOUSE RULES: each ends on a block for narrower
 *    screens at one of the four steps, no media condition holds a custom
 *    property, nothing wraps with `break-word`, and no colour is written out
 *    where a token exists. The list is every stylesheet of these pages, read
 *    from the folders, so a new one is held to the rules without anybody
 *    remembering to add it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

globalThis.__programmePages = { auth: { user: null, loading: false }, h: createElement };

const h = "globalThis.__programmePages.h";
/** A stylesheet as its own class names, so `styles.button` renders as `class="button"`. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/auth/AuthProvider", "export const useAuth = () => globalThis.__programmePages.auth;"],
    ["next/link", `export default ({ href, className, children }) => ${h}("a", { href, className }, children);`],
    ["./GroupPicker", "export default () => null;"],
    ["./CourseCTA.module.css", CLASS_NAMES],
  ]),
});

const { bandWords } = await loadTs(join("features", "programmes", "bandWords.ts"));
const { splitLead, firstLine } = await loadTs(join("features", "programmes", "prose.ts"));
const { weeklyHoursWords, SESSION_TIMES } = await loadTs(join("features", "programmes", "words.ts"));
const { applicationStateWords, applicationStateTone } = await loadTs(join("features", "courses", "stateWords.ts"));
const { statusLineParts } = await loadTs(join("features", "term", "termWords.ts"));
const { toCTARound } = await loadTs(join("features", "courses", "ctaRound.ts"));
const { default: CourseCTA } = await loadTs(join("features", "courses", "CourseCTA.tsx"));

// A term in British Summer Time: it opens on Tue 6 Oct, closes on Sun 18 Oct
// at 23:59 in London, and everybody hears on Fri 23 Oct.
const OPENS = new Date("2026-10-06T08:00:00Z");
const CLOSES = new Date("2026-10-18T22:59:00Z");
const DECISIONS = "2026-10-23";
const NEXT_OPENS = new Date("2027-01-11T09:00:00Z");

const facts = (over = {}) => ({
  stage: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsByDate: DECISIONS,
  nextLabel: null,
  nextOpensAt: null,
  ...over,
});

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/** The foot of a course's page, for a form with these dates, as the page renders it. */
function courseBand(over = {}) {
  const round = toCTARound(
    {
      id: "form-1",
      state: "open",
      opensAt: OPENS,
      closesAt: CLOSES,
      decisionsByDate: DECISIONS,
      outcomeRunIds: [],
      form: { applyPath: "/apply/form-1", starts: "w/c 26 Oct" },
      ...over,
    },
    null,
  );
  return text(
    renderToStaticMarkup(
      createElement(CourseCTA, {
        courseId: "course-1",
        courseTitle: "AGI Strategy Fellowship",
        run: null,
        round,
        placement: "foot",
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// 1 and 2. The closing band
// ---------------------------------------------------------------------------

describe("the closing band", () => {
  test("while the form is open it says the day to apply by, in the board's words", () => {
    assert.deepEqual(bandWords(facts()), {
      title: "Apply by Sun 18 Oct.",
      sub: "Applications close at 23:59. We’ll email you on Fri 23 Oct.",
    });
  });

  test("it says what the foot of a course's own page says, from the same dates", () => {
    for (const over of [{}, { decisionsByDate: null }]) {
      const band = bandWords(facts(over));
      assert.equal(courseBand(over), `${band.title} ${band.sub} Apply`, JSON.stringify(over));
    }
  });

  test("a form with no closing time is open, and promises no day it was not given", () => {
    assert.deepEqual(bandWords(facts({ closesAt: null })), {
      title: "Applications are open.",
      sub: "We’ll email you on Fri 23 Oct.",
    });
    assert.deepEqual(bandWords(facts({ closesAt: null, decisionsByDate: null })), {
      title: "Applications are open.",
      sub: null,
    });
  });

  test("at every other stage it is the hero's status line, a part to a sentence", () => {
    const stages = [
      facts({ stage: "before" }),
      facts({ stage: "before", opensAt: null }),
      facts({ stage: "closed" }),
      facts({ stage: "closed", decisionsByDate: null }),
      facts({ stage: "running" }),
      facts({ stage: "running", nextLabel: "Spring 2027", nextOpensAt: NEXT_OPENS }),
    ];
    for (const stage of stages) {
      const [first, second] = statusLineParts(stage);
      assert.deepEqual(
        bandWords(stage),
        { title: `${first}.`, sub: second ? `${second}.` : null },
        JSON.stringify(stage),
      );
    }
    // Spelt out once, so a change to the status line's words shows here as a change to the band's.
    assert.deepEqual(bandWords(facts({ stage: "before" })), {
      title: "Applications open Tue 6 Oct.",
      sub: "Close Sun 18 Oct.",
    });
    assert.deepEqual(bandWords(facts({ stage: "closed" })), {
      title: "Applications closed.",
      sub: "Decisions by Fri 23 Oct.",
    });
  });

  test("with no term it says only that applications are not open, and names no day", () => {
    const none = bandWords({
      stage: "none",
      opensAt: null,
      closesAt: null,
      decisionsByDate: null,
      nextLabel: null,
      nextOpensAt: null,
    });
    assert.deepEqual(none, { title: "Applications aren’t open right now.", sub: null });
  });

  test("a deadline is London's, whatever zone the server is in", () => {
    // 23:30 UTC on Sat 17 Oct is 00:30 on Sun 18 Oct in London.
    const band = bandWords(facts({ closesAt: new Date("2026-10-17T23:30:00Z") }));
    assert.equal(band.title, "Apply by Sun 18 Oct.");
    assert.match(band.sub, /^Applications close at 00:30\./);
  });
});

// ---------------------------------------------------------------------------
// 3. The words on a chip
// ---------------------------------------------------------------------------

describe("the state of a course's applications, as a chip prints it", () => {
  const words = (state, openEnrolment = false, opensOn = null) =>
    applicationStateWords({ state, openEnrolment, opensOn });

  test("an application and a sign-up are never called the same thing", () => {
    assert.equal(words("open"), "Applications open");
    assert.equal(words("open", true), "Sign-ups open");
    assert.equal(words("closed"), "Applications closed");
    assert.equal(words("closed", true), "Sign-ups closed");
  });

  test("a window that has not opened names its day when it has one", () => {
    assert.equal(words("not-yet", false, "Mon 12 Oct"), "Applications open Mon 12 Oct");
    assert.equal(words("not-yet"), "Applications open soon");
    assert.equal(words("not-yet", true, "Mon 12 Oct"), "Sign-ups open Mon 12 Oct");
  });

  test("anything that is not open and not ahead reads as closed", () => {
    assert.equal(words(null), "Applications closed");
    assert.equal(words("inactive"), "Applications closed");
  });

  test("three states, three tones", () => {
    assert.deepEqual(
      ["open", "not-yet", "closed", null].map(applicationStateTone),
      ["success", "accent", "neutral", "neutral"],
    );
  });
});

// ---------------------------------------------------------------------------
// 4. An author's paragraph
// ---------------------------------------------------------------------------

describe("an authored paragraph, split into its opening line and the rest", () => {
  test("a short first line over more text is a title", () => {
    assert.deepEqual(splitLead("Everyone, from any subject.\nIt’s our main way in."), {
      lead: "Everyone, from any subject.",
      rest: "It’s our main way in.",
    });
  });

  test("a text written as one paragraph has no title and is given back whole", () => {
    const whole = "Everyone, from any subject. It’s our main way in.";
    assert.deepEqual(splitLead(whole), { lead: null, rest: whole });
    assert.deepEqual(splitLead(`  ${whole}\n\n`), { lead: null, rest: whole });
  });

  test("a long first line is a paragraph, not a title", () => {
    const long = `${"A sentence that goes on. ".repeat(5).trim()}\nAnd a second paragraph.`;
    assert.deepEqual(splitLead(long), { lead: null, rest: long });
  });

  test("nothing an author wrote is lost, whichever way it is split", () => {
    const samples = [
      "One line.",
      "Title\nBody",
      "Title\n\nBody one\nBody two",
      "Title\r\nBody after a Windows line break",
      "",
      "   ",
    ];
    for (const sample of samples) {
      const { lead, rest } = splitLead(sample);
      const kept = [lead, rest].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      assert.equal(kept, sample.replace(/\s+/g, " ").trim(), JSON.stringify(sample));
    }
  });

  test("the first line is what a card has room for", () => {
    assert.equal(firstLine("Everyone, from any subject.\nIt’s our main way in."), "Everyone, from any subject.");
    assert.equal(firstLine("\n  One paragraph only.  "), "One paragraph only.");
    assert.equal(firstLine(""), "");
  });
});

describe("the sentences more than one page says", () => {
  test("hours a week are phrased as a rough figure", () => {
    assert.equal(weeklyHoursWords(5), "~5 hrs a week");
    assert.equal(weeklyHoursWords(1), "~1 hr a week");
  });

  test("the line about session times names no day and no time", () => {
    assert.equal(SESSION_TIMES, "Session times are set from the availability people give when they apply.");
  });
});

// ---------------------------------------------------------------------------
// 5 and 6. What the pages' sources hold
// ---------------------------------------------------------------------------

/** Source with its comments gone, so a sentence about a date is not a date. */
function codeOf(...parts) {
  return readFileSync(join(SRC, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const PAGE_SOURCES = [
  ["app", "(public)", "courses", "page.tsx"],
  ["app", "(public)", "courses", "questions.ts"],
  ["app", "(public)", "incubator", "page.tsx"],
  ["features", "programmes", "bandWords.ts"],
  ["features", "programmes", "words.ts"],
  ["app", "(public)", "incubator", "incubatorWords.ts"],
];

/** A year, or a day of a month: "2027", "18 Oct", "1 to 21 Feb". */
const YEAR = /\b(?:19|20)\d\d\b/;
const DAY_OF_MONTH = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;

describe("no date is written into a programme page", () => {
  test("the scanners find a date when there is one", () => {
    assert.match("1 to 21 Feb 2027", YEAR);
    assert.match("closes Sun 18 Oct", DAY_OF_MONTH);
    assert.match("the 1st October intake", DAY_OF_MONTH);
    assert.doesNotMatch("3 more in February", DAY_OF_MONTH);
    assert.doesNotMatch("10 weeks over 2 terms", DAY_OF_MONTH);
    assert.doesNotMatch("10 weeks over 2 terms", YEAR);
  });

  for (const parts of PAGE_SOURCES) {
    test(`${parts.join("/")} names no year and no day of a month`, () => {
      const code = codeOf(...parts);
      assert.doesNotMatch(code, YEAR, "a year is typed into the page: read it from the term");
      assert.doesNotMatch(code, DAY_OF_MONTH, "a day is typed into the page: read it from the term");
    });
  }

  test("the fellowships page and the incubator read the term, and format no date themselves", () => {
    for (const parts of [PAGE_SOURCES[0], PAGE_SOURCES[2]]) {
      const code = codeOf(...parts);
      assert.ok(code.includes("await fetchPublicTerm()") || code.includes("fetchPublicTerm(),"), parts.join("/"));
      assert.doesNotMatch(code, /toLocale(?:Date|Time)?String|Intl\.DateTimeFormat/, parts.join("/"));
    }
  });
});

describe("the anchors other pages link to", () => {
  test("the fellowships page has the section about leading a group, and the one about applying", () => {
    const code = codeOf("app", "(public)", "courses", "page.tsx");
    assert.equal(code.split('id="lead-a-group"').length - 1, 1);
    assert.equal(code.split('id="how-it-works"').length - 1, 1);
    assert.ok(code.includes('href="#how-it-works"'), "nothing on the page jumps to how applying works");
  });

  test("the incubator's page has the section about applying", () => {
    const code = codeOf("app", "(public)", "incubator", "page.tsx");
    assert.equal(code.split('id="apply"').length - 1, 1);
    assert.ok(code.includes('href="#apply"'));
  });

  test("a programme's card links to a course only through the published list", () => {
    const code = codeOf("app", "(public)", "courses", "page.tsx").replace(/\s+/g, " ");
    // The one place a course's address is built for a programme: from the
    // entry the published list handed over, and nothing when there is none.
    assert.ok(code.includes("href: entry ? `/courses/${encodeURIComponent(entry.course.id)}` : null,"));
    assert.ok(!/\/courses\/\$\{[^}]*programme\.courseId/.test(code), "a card links by the stored tie, unchecked");
  });
});

// ---------------------------------------------------------------------------
// 7. The stylesheets
// ---------------------------------------------------------------------------

/** Every stylesheet of the programme pages, read from the folders. */
function programmeStylesheets() {
  const inFolder = (...parts) =>
    readdirSync(join(SRC, ...parts))
      .filter((name) => name.endsWith(".module.css"))
      .sort()
      .map((name) => [...parts, name]);
  const named = [
    ["app", "(public)", "courses", "courses.module.css"],
    ["app", "(public)", "courses", "[courseId]", "course.module.css"],
    ["features", "courses", "CourseCTA.module.css"],
    ["features", "courses", "CourseFactsRail.module.css"],
    ["features", "courses", "CourseFaq.module.css"],
    ["features", "courses", "CourseVisual.module.css"],
    ["features", "courses", "JourneyStrip.module.css"],
    ["features", "courses", "WeeklyThemes.module.css"],
  ];
  return [...inFolder("features", "programmes"), ...inFolder("app", "(public)", "incubator"), ...named];
}

const stripCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The preludes of the top-level at-rules, in source order. */
function atRules(css) {
  const found = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === "{") {
      if (depth === 0) {
        const prelude = css.slice(from, i).trim();
        if (prelude.startsWith("@")) found.push(prelude.replace(/\s+/g, " "));
      }
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) from = i + 1;
    }
  }
  return found;
}

const STEPS = ["36rem", "48rem", "60rem", "80rem"];

describe("the programme pages' stylesheets", () => {
  const sheets = programmeStylesheets();

  test("the list is the stylesheets that are there", () => {
    assert.ok(sheets.length >= 10, `only ${sheets.length} stylesheets were found`);
    for (const parts of sheets) assert.ok(existsSync(join(SRC, ...parts)), parts.join("/"));
    assert.ok(sheets.some((parts) => parts.at(-1) === "programme.module.css"));
    assert.ok(sheets.some((parts) => parts.at(-1) === "incubator.module.css"));
  });

  for (const parts of sheets) {
    const name = parts.join("/");
    const css = stripCss(readFileSync(join(SRC, ...parts), "utf8"));
    const media = atRules(css).filter((prelude) => prelude.startsWith("@media"));

    test(`${name} ends on a block for narrower screens, at one of the four steps`, () => {
      const last = media.at(-1) ?? "";
      const step = /^@media \(max-width: ([\d.]+rem)\)$/.exec(last)?.[1];
      assert.ok(step && STEPS.includes(step), `${name} ends on "${last}"`);
      // Every width a rule is conditioned on is one of the four.
      for (const prelude of media) {
        for (const [, width] of prelude.matchAll(/(?:max|min)-width:\s*([^)]+)\)/g)) {
          assert.ok(STEPS.includes(width.trim()), `${name} conditions a rule on ${width.trim()}`);
        }
      }
    });

    test(`${name} keeps the house rules`, () => {
      for (const prelude of media) {
        assert.ok(!prelude.includes("var("), `${name} uses var() in "${prelude}", which matches nothing`);
      }
      assert.doesNotMatch(css, /overflow-wrap\s*:\s*break-word/, `${name} wraps with break-word`);
      // A colour is a token. The one place a literal is allowed is inside the
      // drawing of a mask, where only its shape is used.
      const withoutMasks = css.replace(/url\("data:[^"]*"\)/g, "");
      assert.doesNotMatch(withoutMasks, /#[0-9a-fA-F]{3,8}\b/, `${name} writes a colour out as hex`);
      assert.doesNotMatch(withoutMasks, /\brgba?\(/, `${name} writes a colour out as rgb()`);
      // The one token that was never defined, and silently falls back.
      assert.doesNotMatch(css, /var\(--text-md\)/, `${name} reads --text-md with no fallback`);
    });
  }
});
