/**
 * What the homepage says at each stage of the term, and the few things about
 * the page a later edit could break without anything looking wrong.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The homepage draws what `src/app/(public)/homeWords.ts` says: the hero's two
 * buttons, the chip on each programme and the sentence under "This term.".
 * Those functions are handed the term's fields and read nothing, so each
 * stage is asked here by running them.
 *
 *  1. EVERY STAGE HAS ITS BUTTONS, and no button goes nowhere. With no term
 *     the "This term" section is not on the page, so nothing may point at it.
 *  2. THE ONLY WAY TO THE FORM IS WHILE IT IS OPEN. `open` is the one stage
 *     whose first button is the form's.
 *  3. NOTHING IS COUNTED OR DATED BY HAND. The sentence counts the term's own
 *     programmes; a start is said only while it is ahead and every programme
 *     shares it; a date that is missing is left out, never guessed.
 *  4. A DAY IS LONDON'S. The zone below is far from London on purpose.
 *
 * Then four things read from the source, because they are promises other
 * code depends on:
 *
 *  5. The page asks the term's own form where the term is (`fetchPublicTerm`)
 *     and writes no date of its own.
 *  6. The hero keeps the attributes the animated scene finds its words by.
 *  7. The hero is wrapped in the one frame that is swapped for the scene, and
 *     that frame takes nothing but its children and a class.
 *  8. The mailing list section keeps its address, and ticks nothing for
 *     anybody.
 */

// Before anything reads the clock. `node --test` runs each file in its own
// process, so this reaches no other suite.
process.env.TZ = "America/Los_Angeles";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(REPO_ROOT, "src", "app", "(public)");

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const words = await loadTs(join("app", "(public)", "homeWords.ts"));

const STAGES = ["none", "before", "open", "closed", "running"];

/** 00:30 on Mon 19 Oct in London, which is still Sun 18 Oct in UTC and in the zone this file runs in. */
const CLOSES = new Date("2026-10-18T23:30:00Z");

const FELLOWSHIP = { kind: "fellowship", starts: "w/c 26 Oct" };
const INCUBATOR = { kind: "incubator", starts: "w/c 26 Oct" };

const read = (name) => readFileSync(join(HOME, name), "utf8");
/** Code with its comments gone and its strings kept. */
const codeOf = (name) => stripSource(read(name), { keepStrings: true });

describe("the hero's two buttons", () => {
  test("every stage has two, each with words and somewhere to go", () => {
    for (const stage of STAGES) {
      const { primary, secondary } = words.heroActions({ stage, closesAt: CLOSES, nextLabel: null });
      for (const action of [primary, secondary]) {
        assert.ok(action.label.length > 0, `${stage}: a button has no words`);
        if (action.kind === "link") assert.match(action.href, /^(#[a-z-]+|\/[a-z-]+)$/, `${stage}: ${action.label}`);
      }
    }
  });

  test("only an open form is linked to, and it is the first button", () => {
    for (const stage of STAGES) {
      const { primary, secondary } = words.heroActions({ stage, closesAt: CLOSES, nextLabel: null });
      assert.equal(primary.kind === "apply", stage === "open", `${stage}: the first button`);
      assert.equal(secondary.kind, "link", `${stage}: the second button is never the form`);
    }
  });

  test("the words of each stage", () => {
    const of = (stage, nextLabel = null) => {
      const { primary, secondary } = words.heroActions({ stage, closesAt: CLOSES, nextLabel });
      return [primary.label, secondary.label];
    };
    assert.deepEqual(of("before"), ["Get told when applications open", "See what’s on this term"]);
    assert.deepEqual(of("none"), ["Get told when applications open", "See what’s on this term"]);
    assert.deepEqual(of("open"), ["Apply by Mon 19 Oct", "Compare the programmes"]);
    assert.deepEqual(of("closed"), ["See what’s on", "Hear when the next round opens"]);
    assert.deepEqual(of("running"), ["See what’s on", "Hear when the next round opens"]);
    assert.deepEqual(of("running", "Spring 2027"), ["See what’s on", "Hear when spring opens"]);
    assert.deepEqual(of("closed", "Spring 2027"), ["See what’s on", "Hear when spring opens"]);
    assert.deepEqual(of("running", "2027 intake"), ["See what’s on", "Hear when the next round opens"]);
  });

  test("where each goes", () => {
    const hrefs = (stage) => {
      const { primary, secondary } = words.heroActions({ stage, closesAt: CLOSES, nextLabel: null });
      return [primary.kind === "link" ? primary.href : "(the form)", secondary.href];
    };
    assert.deepEqual(hrefs("before"), ["#stay-in-touch", "#this-term"]);
    assert.deepEqual(hrefs("open"), ["(the form)", "#this-term"]);
    assert.deepEqual(hrefs("closed"), ["/events", "#stay-in-touch"]);
    assert.deepEqual(hrefs("running"), ["/events", "#stay-in-touch"]);
  });

  test("with no term nothing points at a section that is not on the page", () => {
    const { primary, secondary } = words.heroActions({ stage: "none", closesAt: null, nextLabel: null });
    for (const action of [primary, secondary]) {
      assert.equal(action.kind, "link");
      assert.notEqual(action.href, `#${words.THIS_TERM_ID}`);
    }
    assert.equal(secondary.href, "/events");
  });

  test("a form with no close written on it is not given one", () => {
    assert.equal(words.applyByLabel(null), "Apply");
    assert.equal(words.heroActions({ stage: "open", closesAt: null, nextLabel: null }).primary.label, "Apply");
  });

  test("the day a form closes is London's", () => {
    assert.equal(words.applyByLabel(CLOSES), "Apply by Mon 19 Oct");
  });
});

describe("the chip on a programme's card", () => {
  test("each stage's chip, and none where there is nothing to say", () => {
    assert.deepEqual(words.programmeChip("before", CLOSES), { tone: "live", label: "Applications open soon" });
    assert.deepEqual(words.programmeChip("open", CLOSES), { tone: "success", label: "Apply by Mon 19 Oct" });
    assert.deepEqual(words.programmeChip("open", null), { tone: "success", label: "Applications open" });
    assert.deepEqual(words.programmeChip("running", null), { tone: "neutral", label: "Running now" });
    assert.equal(words.programmeChip("closed", CLOSES), null);
    assert.equal(words.programmeChip("none", null), null);
  });

  test("a start is said while it is ahead, and never once the term is running", () => {
    assert.equal(words.startChipLabel("before", "w/c 26 Oct"), "Starts w/c 26 Oct");
    assert.equal(words.startChipLabel("open", " w/c 26 Oct "), "Starts w/c 26 Oct");
    assert.equal(words.startChipLabel("closed", "w/c 26 Oct"), "Starts w/c 26 Oct");
    assert.equal(words.startChipLabel("running", "w/c 26 Oct"), null);
    assert.equal(words.startChipLabel("open", "  "), null);
  });
});

describe("the sentence under This term", () => {
  test("it counts what the term holds", () => {
    assert.equal(words.programmesInWords([FELLOWSHIP, FELLOWSHIP, INCUBATOR]), "2 fellowships and a research incubator");
    assert.equal(words.programmesInWords([FELLOWSHIP, INCUBATOR]), "a fellowship and a research incubator");
    assert.equal(words.programmesInWords([FELLOWSHIP, FELLOWSHIP, FELLOWSHIP]), "3 fellowships");
    assert.equal(words.programmesInWords([INCUBATOR]), "a research incubator");
    assert.equal(words.programmesInWords([INCUBATOR, INCUBATOR]), "2 research incubators");
    assert.equal(words.programmesInWords([]), "");
  });

  test("the whole sentence, with the start every programme shares", () => {
    assert.equal(
      words.termSentence([FELLOWSHIP, FELLOWSHIP, INCUBATOR], "open"),
      "We’re running 2 fellowships and a research incubator. They all start the week of 26 Oct, and they’re all free.",
    );
    assert.equal(
      words.termSentence([FELLOWSHIP], "before"),
      "We’re running a fellowship. It starts the week of 26 Oct, and it’s free.",
    );
  });

  test("no start is said when programmes differ, when one says none, or once the term is running", () => {
    const later = { kind: "incubator", starts: "w/c 2 Nov" };
    const silent = { kind: "fellowship", starts: "" };
    const plain = "We’re running a fellowship and a research incubator. They’re all free.";
    assert.equal(words.termSentence([FELLOWSHIP, later], "open"), plain);
    assert.equal(words.termSentence([silent, INCUBATOR], "open"), plain);
    assert.equal(words.termSentence([FELLOWSHIP, INCUBATOR], "running"), plain);
    assert.equal(words.termSentence([FELLOWSHIP], "running"), "We’re running a fellowship. It’s free.");
  });

  test("a term with no programme has no sentence", () => {
    for (const stage of STAGES) assert.equal(words.termSentence([], stage), "");
  });

  test("a start is a label: only w/c is spelt out, and nothing is read as a date", () => {
    assert.equal(words.startInWords("w/c 26 Oct"), "the week of 26 Oct");
    assert.equal(words.startInWords("W/C  26 Oct"), "the week of 26 Oct");
    assert.equal(words.startInWords("Mon 26 Oct"), "Mon 26 Oct");
    assert.equal(words.startInWords("after reading week"), "after reading week");
  });
});

describe("the page", () => {
  test("it asks the term where the term is, and writes no date of its own", () => {
    const page = codeOf("page.tsx");
    assert.match(page, /await fetchPublicTerm\(\)/);
    const DATE = /\b20\d\d\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|new Date\(/;
    // The year of the award is the award's own, and is the one year the hero may name.
    const AWARD = /(Awards|UoNSU) 2026/g;
    for (const file of ["page.tsx", "HomeHero.tsx", "ThisTerm.tsx", "StayInTouch.tsx"]) {
      const hit = codeOf(file).replace(AWARD, "").match(DATE);
      assert.equal(hit, null, `${file} writes a date: ${hit?.[0]}`);
    }
  });

  test("each section is handed fields, never the term", () => {
    const page = codeOf("page.tsx");
    assert.doesNotMatch(page, /\bterm=\{term\}/);
    assert.doesNotMatch(page, /\{\.\.\.term\}/);
  });
});

describe("the hero", () => {
  const hero = codeOf("HomeHero.tsx");
  const mark = codeOf("HeroMark.tsx");

  test("the words carry what the animated scene finds them by", () => {
    for (const zone of ["tagline", "headline", "lede", "cta", "award"]) {
      assert.match(hero, new RegExp(`data-keepout="${zone}"`), `the ${zone} is not marked`);
    }
    assert.match(hero, /data-word=""/);
    assert.match(hero, /data-accent-text=""/);
    assert.match(mark, /data-mark=""/);
    assert.match(mark, /data-keepout="mark"/);
    for (const [name, source] of [["HomeHero.tsx", hero], ["HeroMark.tsx", mark]]) {
      const zones = [...source.matchAll(/data-keepout=/g)].length;
      for (const setting of ["data-pad", "data-feather", "data-strength"]) {
        assert.equal([...source.matchAll(new RegExp(`${setting}=`, "g"))].length, zones, `${name}: a zone has no ${setting}`);
      }
    }
  });

  test("the headline is whole in the markup, for a reader with no script", () => {
    assert.match(hero, /<span className="visually-hidden">Make AI go well\. From Nottingham\.<\/span>/);
    // The typed sentence is the marked element's only child: the scene, and
    // HeadlineLoop before it, rewrite that one text node.
    assert.match(hero, /<span data-accent-text="" className=\{styles\.accentText\}>\s*From Nottingham\.\s*<\/span>/);
  });

  test("no piece the scene measures is hidden with display: none", () => {
    // A zone hidden that way is measured at the hero's corner. A piece that a
    // form does not show is set aside instead.
    const css = readFileSync(join(HOME, "HomeHero.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
    const ZONES = /\.(mark|tagline|headline|lede|cta|award|awardRow|stack|inner)\b(?!\s*svg)/;
    const hidden = rules.filter((rule) => /display\s*:\s*none/.test(rule.body) && ZONES.test(rule.selector));
    assert.deepEqual(hidden.map((rule) => rule.selector), []);
    assert.ok(rules.some((rule) => /\.tagline\b/.test(rule.selector) && /left:\s*-200vw/.test(rule.body)), "the tagline is not set aside");
    assert.ok(rules.some((rule) => /\.awardRow\b/.test(rule.selector) && /left:\s*-200vw/.test(rule.body)), "the award is not set aside");
  });

  test("the line and the caret follow what is written on the hero's own box", () => {
    const css = readFileSync(join(HOME, "HomeHero.module.css"), "utf8");
    for (const state of ["none", "grow", "shrink"]) {
      assert.match(css, new RegExp(`\\.hero\\[data-ul="${state}"\\] \\.accentText::after`), `no rule for data-ul="${state}"`);
    }
    assert.match(css, /\.hero\[data-caret="on"\] \.caret/);
    assert.match(css, /\.hero\[data-replay="b"\] \.word/);
    const loop = codeOf("HeadlineLoop.tsx");
    assert.match(loop, /box\.dataset\.ul = state/);
    assert.match(loop, /box\.dataset\.caret = "on"/);
    assert.match(loop, /delete box\.dataset\.ul;\s*delete box\.dataset\.caret;/);
  });

  test("one frame wraps the whole hero, and it takes only children and a class", () => {
    assert.equal([...hero.matchAll(/<HeroFrame\b/g)].length, 1);
    assert.match(hero, /return \(\s*<HeroFrame className=\{styles\.hero\}>/);
    assert.match(hero, /<\/HeroFrame>\s*\);\s*\}/);
    const frame = codeOf("HeroFrame.tsx");
    assert.match(frame, /export default function HeroFrame\(\{ children, className \}: \{ children: ReactNode; className\?: string \}\)/);
    assert.doesNotMatch(read("HeroFrame.tsx"), /^\s*["']use client["']/m, "the frame is a Server Component");
  });

  test("the typist is the frame's and nobody else's, so it leaves when the frame is swapped", () => {
    assert.match(codeOf("HeroFrame.tsx"), /<HeadlineLoop \/>/);
    for (const file of ["page.tsx", "HomeHero.tsx", "HeroMark.tsx", "ThisTerm.tsx", "StayInTouch.tsx"]) {
      assert.doesNotMatch(codeOf(file), /HeadlineLoop/, `${file} renders the typist itself`);
    }
  });

  test("the form is reached only through the term's own link", () => {
    for (const file of ["HomeHero.tsx", "ThisTerm.tsx"]) {
      const code = codeOf(file);
      assert.match(code, /<TermApplyLink\b/);
      assert.doesNotMatch(code, /["'`]\/apply\b/, `${file} writes an address of the form`);
    }
  });
});

describe("the mailing list section", () => {
  const section = codeOf("StayInTouch.tsx");

  test("its address is stay-in-touch", () => {
    assert.equal(words.STAY_IN_TOUCH_ID, "stay-in-touch");
    assert.match(section, /<section id=\{STAY_IN_TOUCH_ID\}/);
  });

  test("it offers the two lists, and ticks neither", () => {
    assert.deepEqual([...section.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]).sort(), ["events", "newsletter"]);
    assert.doesNotMatch(section, /defaultChecked/);
  });

  test("the form refuses to send with no list ticked", () => {
    const form = stripSource(readFileSync(join(REPO_ROOT, "src", "components", "SubscribeForm.tsx"), "utf8"), { keepStrings: true });
    assert.match(form, /if \(showCheckboxes && selectedChannels\.length === 0\) \{\s*setStatus\(\{ kind: "error"/);
    assert.ok(
      form.indexOf("selectedChannels.length === 0") < form.indexOf('fetch("/api/subscriptions"'),
      "the check comes after the request",
    );
  });
});
