/**
 * A programme's Start here and Glossary as their people meet them (boards
 * wk-start, wk-start-phone, wk-glossary, wk-glossary-phone, st-week1-phone,
 * wk-programme), driven through the real loader route, the real pages and
 * the real copy routes, as every kind of caller.
 *
 * Built on the member's week page world (`tests/lib/weekBlocksPageWorld.mjs`:
 * AGI Strategy's run in week 3; Chloe in Group B and told, with Rahul and
 * Sofia; Amara in Group A, with Sofia; Una placed and not told; Sam, who
 * left; Omar, taken off; Claudia leads the programme; Tess leads Technical
 * AI Safety; Yusuf is the run's track lead; Lloyd its admissions reviewer;
 * Zach an admin). From the hand-over world beneath it: Nina gave the place
 * back; Wen holds a place on Technical AI Safety. Bea, accepted on AGI
 * Strategy, is made somebody holding a place before groups go out (the
 * seat not told), with week 1 Ready and not.
 *
 *  1. Loading, admins only: Read it, Save, Copy as Markdown; refused for
 *     everybody else and in view-as; a copy pasted back is the same.
 *  2. Who opens the pages: exactly the people week 1 opens to. Each persona
 *     meets the two pages as they meet week 1's page.
 *  3. Start here drawn: the board's order, the box under "Reflections."
 *     naming the reader's own facilitators and lead from records.
 *  4. The Glossary drawn: the count, every term in order, the foot.
 *  5. The links: under a block week's title and on the programme page,
 *     each only when its document exists.
 *  6. Every copy of a run carries the guide: copy forward, a template saved
 *     and applied.
 *  7. Neither is public: the only readers of a run's guide are listed.
 *
 * Every word in the documents is made up (`tests/lib/guideFixture.mjs`).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { GLOSSARY_MARKDOWN, START_HERE_MARKDOWN, glossaryDoc, startHereDoc } from "./lib/guideFixture.mjs";
import { COURSE } from "./lib/handoverWorld.mjs";
import { NOW, RUN, makeWeekBlocksPageWorld, textOf } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeekBlocksPageWorld("__guidePages");
const guide = await w.courseRoute("runs", "[runId]", "guide", "[doc]");
const clone = await w.courseRoute("runs", "[runId]", "clone-weeks");
const applyTemplate = await w.courseRoute("runs", "[runId]", "apply-template");
const saveTemplate = await w.courseRoute("[courseId]", "templates");
const pages = {
  "start-here": (await w.loadTs(join("app", "(app)", "learn", "[runId]", "start-here", "page.tsx"))).default,
  glossary: (await w.loadTs(join("app", "(app)", "learn", "[runId]", "glossary", "page.tsx"))).default,
  programme: (await w.loadTs(join("app", "(app)", "learn", "[runId]", "page.tsx"))).default,
};
const markdown = await w.loadTs(join("lib", "courses", "guide", "markdown.ts"));

const run = (text, marks = {}) => ({ text, ...marks });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  fresh();
});

/** The world every test starts from: the page world's, with Wen on the other programme and Sam a leaver as leaving now writes one. */
function fresh() {
  w.reset();
  // Sam left the run, and leaving keeps Publish's stamp: the run's gate counts Sam as having left.
  w.world.db.poke(`courseEnrolments/${RUN.agi}__sam`, { allocatedEmailAt: new Date("2026-10-28T18:00:00Z") });
  // Wen takes part in Technical AI Safety's run: told, no group yet.
  w.world.db.seed(`courseEnrolments/${RUN.tais}__wen`, {
    runId: RUN.tais,
    courseId: COURSE.tais,
    uid: "wen",
    groupId: null,
    status: "active",
    role: "learner",
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
    attendance: {},
  });
}

/** One request to the loader, as `who`. */
const load = (who, doc, method, body, options = {}) =>
  w.call(who, guide[method], { runId: options.runId ?? RUN.agi, doc }, { course: true, body, viewAs: options.viewAs ?? false });

/** Both documents loaded the way an admin loads them. */
async function loadBoth(runId = RUN.agi) {
  for (const [doc, text] of [
    ["start-here", START_HERE_MARKDOWN],
    ["glossary", GLOSSARY_MARKDOWN],
  ]) {
    const answer = await load("zach", doc, "PUT", { markdown: text }, { runId });
    assert.equal(answer.status, 200, `${doc}: ${JSON.stringify(answer.body)}`);
  }
}

/** A guide page as `who` opens it: what it draws, or where it sends them. */
async function open(page, who, { runId = RUN.agi, viewAs = false } = {}) {
  w.world.user = w.sessionOf(who);
  w.world.course = true;
  w.world.viewAs = viewAs;
  try {
    const element = await pages[page]({ params: Promise.resolve({ runId }) });
    const html = renderToStaticMarkup(element);
    return { open: true, html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { open: false, html: "", text: "", to: err.to };
  } finally {
    w.world.course = false;
    w.world.viewAs = false;
  }
}

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}"\n${text.slice(0, 1500)}`);
    from = at + phrase.length;
  }
}

/** Bea holds an accepted place on AGI Strategy and has not been told a group; week 1 Ready or not. */
function beaBeforeGroups({ ready }) {
  w.world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { allocatedEmailAt: null });
  w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w01`, { ready });
}

const storedRun = (runId = RUN.agi) => w.world.db.read(`courseRuns/${runId}`);

// ---------------------------------------------------------------------------
// 1. Loading
// ---------------------------------------------------------------------------

describe("1. loading the two documents, admins only", () => {
  test("Read it says what was found and what to check, and writes nothing", async () => {
    const before = w.everything();
    const answer = await load("zach", "start-here", "POST", { markdown: START_HERE_MARKDOWN });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.problems, []);
    assert.equal(answer.body.replaces, false);
    assert.deepEqual(answer.body.found.slice(0, 3).map((row) => [row.state, row.label]), [
      ["found", "Title"],
      ["found", "Opening"],
      ["found", "What you'll get out of it"],
    ]);
    assert.deepEqual(answer.body.checks, ["The date under the title (“Mar 3, 2026”) was left out: it’s the guide’s byline, not part of the page."]);
    assert.equal(w.everything(), before, "Read it wrote something");
    assert.deepEqual(Object.keys(answer.body).sort(), ["checks", "doc", "found", "problems", "replaces"]);
  });

  test("Save writes each document onto the run, as the one reader reads it back", async () => {
    await loadBoth();
    const stored = storedRun();
    assert.deepEqual(stored.startHere, startHereDoc());
    assert.deepEqual(stored.glossary, glossaryDoc());
    const again = await load("zach", "glossary", "POST", { markdown: GLOSSARY_MARKDOWN });
    assert.equal(again.body.replaces, true, "a run that has one says a save replaces it");
  });

  test("Copy as Markdown, pasted back, is the same document", async () => {
    await loadBoth();
    for (const doc of ["start-here", "glossary"]) {
      const field = doc === "start-here" ? "startHere" : "glossary";
      const before = structuredClone(storedRun()[field]);
      const copy = await load("zach", doc, "GET");
      assert.equal(copy.status, 200);
      const saved = await load("zach", doc, "PUT", { markdown: copy.body.markdown });
      assert.equal(saved.status, 200);
      assert.deepEqual(storedRun()[field], before, `${doc} changed on its way out and back`);
    }
    assert.equal((await load("zach", "glossary", "GET")).body.terms, 5);
  });

  test("everybody but an admin is refused before anything is read; view-as is refused before that", async () => {
    await loadBoth();
    const before = w.everything();
    for (const who of ["claudia", "tess", "yusuf", "lloyd", "rahul", "sofia", "chloe", "una", "sam", "nina", "nobody"]) {
      for (const method of ["GET", "POST", "PUT"]) {
        const answer = await load(who, "start-here", method, method === "GET" ? undefined : { markdown: "# x\n\n## y\n\nz\n" });
        assert.equal(answer.status, 403, `${who} ${method}: ${answer.status}`);
      }
    }
    for (const method of ["GET", "POST", "PUT"]) {
      assert.equal((await load(null, "glossary", method, method === "GET" ? undefined : { markdown: "x" })).status, 401);
    }
    for (const method of ["POST", "PUT"]) {
      const answer = await load("zach", "glossary", method, { markdown: GLOSSARY_MARKDOWN }, { viewAs: true });
      assert.deepEqual([answer.status, answer.body.error], [403, "view-as"]);
    }
    assert.equal(w.everything(), before, "a refused request wrote something");
  });

  test("a bad address, an empty or overlong paste, a problem, a missing run or document, and a run being destroyed each answer in words", async () => {
    assert.deepEqual(
      [(await load("zach", "rubric", "GET")).status, (await load("zach", "rubric", "GET")).body.error],
      [400, "That isn’t a page of the guide: it’s start-here or glossary."],
    );
    assert.equal((await load("zach", "start-here", "GET", undefined, { runId: "a/b" })).status, 400);
    assert.deepEqual((await load("zach", "start-here", "POST", { markdown: "  " })).body.error, "Paste Start here’s Markdown first.");
    assert.equal((await load("zach", "glossary", "POST", { markdown: "x".repeat(100_001) })).status, 400);
    const twoTitles = await load("zach", "start-here", "PUT", { markdown: "# One\n\n# Two\n\n## A\n\nText.\n" });
    assert.deepEqual([twoTitles.status, twoTitles.body.error], [400, "The Markdown has more than one title line (a line starting “# ”): keep one."]);
    assert.ok(Array.isArray(twoTitles.body.found), "a refused save answers with the read");
    assert.equal(storedRun().startHere, undefined, "a refused save wrote nothing");
    assert.equal((await load("zach", "start-here", "GET", undefined, { runId: "no-such-run__run99999" })).status, 404);
    assert.deepEqual(
      [(await load("zach", "glossary", "GET")).status, (await load("zach", "glossary", "GET")).body.error],
      [404, "This run has no Glossary yet, so there is nothing to copy."],
    );
    w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await load("zach", "glossary", "PUT", { markdown: GLOSSARY_MARKDOWN })).status, 409);
  });
});

// ---------------------------------------------------------------------------
// 2. Who opens the pages
// ---------------------------------------------------------------------------

describe("2. the two pages open to exactly the people week 1 opens to", () => {
  /** The week 1 page's answer to `who`: open, or where it sent them. */
  async function weekOne(who, viewAs = false) {
    w.world.viewAs = viewAs;
    try {
      const shell = await w.weekShell(who, 1);
      return { open: shell.component !== null, to: shell.to };
    } finally {
      w.world.viewAs = false;
    }
  }

  const PERSONAS = [
    ["chloe", "placed in Group B and told"],
    ["amara", "placed in Group A and told"],
    ["una", "placed and not told"],
    ["bea", "holding a place before groups go out, week 1 Ready"],
    ["bea", "holding a place before groups go out, week 1 not Ready"],
    ["wen", "taking part in another programme"],
    ["sam", "who left"],
    ["omar", "taken off the run"],
    ["nina", "who gave the place back"],
    ["rahul", "a facilitator of Group B"],
    ["sofia", "a facilitator of Groups A and B"],
    ["claudia", "the programme's lead"],
    ["tess", "another programme's lead"],
    ["yusuf", "the run's track lead"],
    ["lloyd", "the run's admissions reviewer"],
    ["zach", "an admin"],
    ["nobody", "on nothing"],
    [null, "signed out"],
  ];

  test("persona by persona, each page answers as week 1's page does", async () => {
    for (const [who, what] of PERSONAS) {
      fresh();
      if (what.includes("Ready")) beaBeforeGroups({ ready: !what.includes("not Ready") });
      await loadBoth();
      const week = await weekOne(who);
      for (const page of ["start-here", "glossary"]) {
        const answer = await open(page, who);
        assert.equal(answer.open, week.open, `${who ?? "signed out"} (${what}): ${page} ${answer.open ? "opens" : `sends to ${answer.to}`}, week 1 ${week.open ? "opens" : `sends to ${week.to}`}`);
      }
    }
  });

  test("somebody who left keeps nothing of the guide: the run's gate counts Sam as having left, and both pages send Sam away", async () => {
    await loadBoth();
    w.world.user = w.sessionOf("sam");
    w.world.course = true;
    let home;
    try {
      home = await pages.programme({ params: Promise.resolve({ runId: RUN.agi }) });
    } finally {
      w.world.course = false;
    }
    assert.equal(home.type.name, "LeftProgramme", "Sam reads the page that says they left");
    for (const page of ["start-here", "glossary"]) {
      const answer = await open(page, "sam");
      assert.deepEqual([answer.open, answer.to], [false, "/learn"], page);
    }
  });

  test("the people who can open the run today: open", async () => {
    await loadBoth();
    for (const who of ["chloe", "amara", "rahul", "sofia", "zach"]) {
      for (const page of ["start-here", "glossary"]) assert.equal((await open(page, who)).open, true, `${who} ${page}`);
    }
  });

  test("everybody else is sent where the week page sends them; somebody signed out to sign in and back", async () => {
    await loadBoth();
    for (const [who, to] of [
      ["sam", "/learn"],
      ["omar", "/learn"],
      ["nina", "/learn"],
      ["wen", "/learn"],
      ["tess", "/learn"],
      ["claudia", "/learn"],
      ["nobody", "/learn"],
      ["una", "/learn"],
      ["yusuf", `/learn/${RUN.agi}/admissions`],
      ["lloyd", `/learn/${RUN.agi}/admissions`],
      [null, `/login?next=${encodeURIComponent(`/learn/${RUN.agi}/start-here`)}`],
    ]) {
      const answer = await open("start-here", who);
      assert.deepEqual([answer.open, answer.to], [false, to], `${who ?? "signed out"}`);
    }
  });

  test("view-as: an admin viewing as a member sees exactly what the member sees", async () => {
    await loadBoth();
    for (const page of ["start-here", "glossary"]) {
      const own = await open(page, "chloe");
      const viewed = await open(page, "chloe", { viewAs: true });
      assert.equal(viewed.html, own.html, page);
      const sam = await open(page, "sam", { viewAs: true });
      assert.deepEqual([sam.open, sam.to], [false, "/learn"]);
    }
  });

  test("the page's door asks week 1's door's answer and nothing else: a place carried on the run's access opens it", async () => {
    const { guideDoor } = await w.loadTs(join("features", "courses", "guide", "door.ts"));
    assert.equal(guideDoor({ canLearn: true }), "run");
    assert.equal(guideDoor({ canLearn: false }), null, "no place carried: shut");
    assert.equal(guideDoor({ canLearn: false, beforeGroups: null }), null, "the door shut: shut");
    assert.equal(guideDoor({ canLearn: false, beforeGroups: { runId: RUN.agi } }), "week-one", "a place before groups go out: open, through week 1");
    assert.equal(guideDoor({ canLearn: true, beforeGroups: { runId: RUN.agi } }), "run");
  });
});

// ---------------------------------------------------------------------------
// 3. Start here, drawn
// ---------------------------------------------------------------------------

describe("3. Start here, as its people read it (wk-start)", () => {
  test("Chloe: the breadcrumb, the label, the guide in its order, the box naming Group B's facilitators and the lead, Support and the credit", async () => {
    await loadBoth();
    const page = await open("start-here", "chloe");
    inOrder(page.text, [
      "AGI Strategy",
      "Start here",
      "Fellowship: AGI Strategy",
      "Start here",
      "Four weeks, one evening a week by the sea.",
      "What you'll get out of it",
      "Say how a lamp is lit and trimmed.",
      "No background in the sea is needed.",
      "A week, step by step",
      "Part",
      "What you do",
      "Time",
      "Before the evening",
      "Readings and a short film, each with why it matters",
      "About an hour",
      "Reflections. Most weeks have a short reflection stop or two.",
      "On this site: write your reflections in the boxes on each week’s page. They save as you type. You don’t need to send them. Rahul, Sofia, Claudia and admins can read them; other fellows can’t. Rahul or Sofia may read a line out in the session, without your name.",
      "Go further. Each week ends with more to read",
      "Talks",
      "What happened? Who, what and when.",
      "Written work and feedback",
      "Not yet",
      "Solid",
      "Strong",
      "A clear position",
      "How we behave",
      "Come curious. Nobody expects you to know this already.",
      "Support",
      "If the sea is weighing on you, tell your facilitator, or write to the society.",
      "Adapted from Example Harbour's lighthouse course, with the evenings redesigned for a group on the rocks.",
      "On this page",
      "What you'll get out of it",
      "A week, step by step",
      "Talks",
      "Written work and feedback",
      "How we behave",
      "Support",
      "Glossary",
    ]);
    assert.doesNotMatch(page.text, /Lighthouse Fellowship: fellow guide/, "the guide's title line is never drawn");
    assert.doesNotMatch(page.text, /Mar 3, 2026/, "the byline is never drawn");
    assert.match(page.html, /href="\/learn\/[^"]+\/glossary"/);
    assert.match(page.html, /href="mailto:someone@example.com"/);
    assert.equal((page.html.match(/On this site:/g) ?? []).length, 1, "the box is drawn once");
  });

  test("the numbered questions are a list and the rubric a table with its rows' headings; never a case block", async () => {
    await loadBoth();
    const { html } = await open("start-here", "chloe");
    assert.match(html, /<ol[^>]*>\s*<li>\s*<strong>What happened\?<\/strong>/);
    assert.match(html, /<th scope="row"><strong>A clear position<\/strong><\/th>/);
    assert.match(html, /<th scope="row">Before the evening<\/th>/);
    // On a phone a value carries its column's heading: from the third column on, and every value of the rubric.
    assert.match(html, /<td class="labelled"><span class="cell"><span class="cellLabel">Time<\/span>/);
    assert.doesNotMatch(html, /<td class="labelled"><span class="cell"><span class="cellLabel">What you do</);
    assert.match(html, /<td class="labelled"><span class="cell"><span class="cellLabel">Not yet<\/span>/);
  });

  test("names come from records: Amara reads Group A's, a facilitator reads who reads theirs, an admin the line's general form", async () => {
    await loadBoth();
    const words = (text) => text.slice(text.indexOf("On this site:"), text.indexOf("Go further."));
    assert.equal(
      words((await open("start-here", "amara")).text),
      "On this site: write your reflections in the boxes on each week’s page. They save as you type. You don’t need to send them. Sofia, Claudia and admins can read them; other fellows can’t. Sofia may read a line out in the session, without your name. ",
    );
    assert.equal(
      words((await open("start-here", "rahul")).text),
      "On this site: write your reflections in the boxes on each week’s page. They save as you type. You don’t need to send them. Only Claudia and admins can read them. ",
    );
    assert.equal(
      words((await open("start-here", "zach")).text),
      "On this site: write your reflections in the boxes on each week’s page. They save as you type. You don’t need to send them. Your facilitators, Claudia and admins can read them; other fellows can’t. Your facilitators may read a line out in the session, without your name. ",
    );
    // A facilitator renamed on their account is named so on the next request: nothing is copied into the document.
    w.world.db.poke("users/rahul", { profile: { preferredName: "Raz Kapoor" } });
    assert.match((await open("start-here", "chloe")).text, /Raz, Sofia, Claudia and admins can read them/);
    assert.doesNotMatch(JSON.stringify(storedRun().startHere), /Rahul|Sofia|Claudia|Raz/);
  });

  test("with no Glossary, the rail has no Glossary link; with no Start here, a calm line and the way back", async () => {
    await load("zach", "start-here", "PUT", { markdown: START_HERE_MARKDOWN });
    const page = await open("start-here", "chloe");
    assert.doesNotMatch(page.html, /\/glossary"/);
    const tais = await open("start-here", "wen", { runId: RUN.tais });
    assert.equal(tais.open, true);
    inOrder(tais.text, ["Fellowship: Technical AI Safety", "Start here", "Start here isn’t written for this programme yet.", "Back to Technical AI Safety"]);
    assert.match(tais.html, new RegExp(`href="/learn/${RUN.tais}"`));
  });

  test("no paragraph opening with a bold Reflections: no box, nothing else lost", async () => {
    await load("zach", "start-here", "PUT", { markdown: START_HERE_MARKDOWN.replace("**Reflections.**", "Reflections:") });
    const page = await open("start-here", "chloe");
    assert.doesNotMatch(page.text, /On this site:/);
    assert.match(page.text, /Reflections: Most weeks have a short reflection stop or two\./);
  });
});

// ---------------------------------------------------------------------------
// 4. The Glossary, drawn
// ---------------------------------------------------------------------------

describe("4. the Glossary, as its people read it (wk-glossary)", () => {
  test("the label, the opening, the find box with the count from the record, every term in order, and the foot", async () => {
    await loadBoth();
    const page = await open("glossary", "chloe");
    inOrder(page.text, [
      "AGI Strategy",
      "Glossary",
      "Fellowship: AGI Strategy",
      "Glossary",
      'The words you\'ll meet most, in plain words. Ask "what exactly do you mean?"',
      "Find a term",
      "5 terms",
      "Beam",
      "The light a lamp throws, turning over the water.",
      "Fresnel lens",
      "Rings of glass that bend a lamp's light into one narrow beam.",
      "Keeper",
      "The person who keeps the light lit, every night.",
      "Light list",
      "Wick",
      "What the oil burns on. Trim it, or it smokes.",
      "Something missing? Ask your facilitator.",
    ]);
    assert.match(page.html, /<label for="glossary-find"[^>]*>Find a term<\/label>/);
    assert.match(page.html, /<input[^>]*id="glossary-find"[^>]*type="search"/);
    assert.match(page.html, /<a href="https:\/\/example.com\/fresnel"[^>]*>narrow beam<\/a>/);
    assert.match(page.html, /<em>every<\/em>/);
    assert.equal((page.html.match(/<dt/g) ?? []).length, 5);
  });

  test("the count follows the record: a longer glossary says so", async () => {
    const more = GLOSSARY_MARKDOWN.trimEnd() + "\n| Zenith | The top of the sky. |\n";
    await load("zach", "glossary", "PUT", { markdown: more });
    assert.match((await open("glossary", "amara")).text, /Find a term 6 terms/);
  });

  test("a run with no Glossary: a calm line and the way back, and no find box", async () => {
    const page = await open("glossary", "chloe");
    assert.equal(page.open, true);
    inOrder(page.text, ["Glossary", "The Glossary isn’t written for this programme yet.", "Back to AGI Strategy"]);
    assert.doesNotMatch(page.html, /glossary-find/);
  });

  test("the find box keeps the terms whose words or definition hold what was typed, in order, case and accents aside", async () => {
    const { findTerms } = await w.loadTs(join("lib", "courses", "guide", "find.ts"));
    const { noTermMatchesWords, termsCountWords } = await w.loadTs(join("lib", "courses", "guide", "words.ts"));
    const names = (query) => findTerms(glossaryDoc().terms, query).map(({ entry, place }) => `${place}:${entry.term[0].text}`);
    assert.deepEqual(names(""), ["0:Beam", "1:Fresnel lens", "2:Keeper", "3:Light list", "4:Wick"]);
    assert.deepEqual(names("  LENS "), ["1:Fresnel lens"]);
    assert.deepEqual(names("lámp"), ["0:Beam", "1:Fresnel lens"], "a definition counts, and accents are folded");
    assert.deepEqual(names("lamp’s"), ["1:Fresnel lens"], "a curly apostrophe finds a straight one");
    assert.deepEqual(names("nothing like it"), []);
    assert.equal(termsCountWords(5, 2), "2 of 5 terms");
    assert.equal(termsCountWords(5, null), "5 terms");
    assert.equal(termsCountWords(1), "1 term");
    assert.equal(noTermMatchesWords(" tide "), "No term matches “tide”.");
  });
});

// ---------------------------------------------------------------------------
// 5. The links
// ---------------------------------------------------------------------------

describe("5. the ways to the two pages, each only when its document exists", () => {
  test("under a block week's title: Start here · Glossary (st-week1-phone)", async () => {
    await loadBoth();
    const { text, html, shell } = await w.weekPage("chloe", 1);
    assert.equal(shell.component, "WeekView");
    inOrder(text, ["Who keeps the lamps", "Start here · Glossary", "This week"]);
    assert.match(html, new RegExp(`href="/learn/${RUN.agi}/start-here"`));
    assert.match(html, new RegExp(`href="/learn/${RUN.agi}/glossary"`));
  });

  test("one document, one link and no dot; none, nothing", async () => {
    await load("zach", "glossary", "PUT", { markdown: GLOSSARY_MARKDOWN });
    let page = await w.weekPage("chloe", 1);
    const row = /<p class="weekLinks">(.*?)<\/p>/.exec(page.html)?.[1] ?? "";
    assert.equal(textOf(row), "Glossary", "one link, no dot");
    assert.doesNotMatch(page.text, /Start here/);
    assert.match(page.html, new RegExp(`href="/learn/${RUN.agi}/glossary"`));
    w.reset();
    page = await w.weekPage("chloe", 1);
    assert.doesNotMatch(page.html, /weekLinks/);
    assert.doesNotMatch(page.text, /Start here|Glossary/);
  });

  test("the programme page's About this course (wk-programme): Start here with what it covers, the Glossary with its count", async () => {
    await loadBoth();
    for (const who of ["chloe", "rahul", "zach"]) {
      w.world.user = w.sessionOf(who);
      w.world.course = true;
      let element;
      try {
        element = await pages.programme({ params: Promise.resolve({ runId: RUN.agi }) });
      } finally {
        w.world.course = false;
      }
      assert.deepEqual(element.props.guide, { startHere: true, glossaryTerms: 5 }, who);
      await w.asBrowser(who, 3);
      const html = renderToStaticMarkup(createElement(w.components.RunHome, element.props));
      inOrder(textOf(html), ["About this course", "Start here", "How a week works, the rubric, support", "Glossary", "5 terms"]);
    }
  });

  test("each link row and card refuses to draw what the run has not, whatever it is handed", async () => {
    const { WeekGuideLinks } = await w.loadTs(join("features", "courses", "guide", "GuideLinks.tsx"));
    const { default: AboutThisCourse } = await w.loadTs(join("features", "courses", "AboutThisCourse.tsx"));
    const draw = (component, links) => textOf(renderToStaticMarkup(createElement(component, { runId: RUN.agi, links })));
    for (const component of [AboutThisCourse, WeekGuideLinks]) {
      assert.equal(draw(component, null), "");
      assert.equal(draw(component, { startHere: false, glossaryTerms: null }), "");
    }
    assert.equal(draw(WeekGuideLinks, { startHere: true, glossaryTerms: null }), "Start here");
    assert.equal(draw(AboutThisCourse, { startHere: false, glossaryTerms: 1 }), "About this course Glossary 1 term →");
  });

  test("the programme page draws no About this course for a run with neither", async () => {
    w.world.user = w.sessionOf("chloe");
    w.world.course = true;
    let element;
    try {
      element = await pages.programme({ params: Promise.resolve({ runId: RUN.agi }) });
    } finally {
      w.world.course = false;
    }
    assert.equal("guide" in element.props, false, "a run with neither hands the page nothing");
    await w.asBrowser("chloe", 3);
    assert.doesNotMatch(textOf(renderToStaticMarkup(createElement(w.components.RunHome, element.props))), /About this course/);
  });
});

// ---------------------------------------------------------------------------
// 6. Copies
// ---------------------------------------------------------------------------

/**
 * The course routes' view of the store, with Firestore's aggregate `count()`
 * on its queries: the two template routes ask one (the retrospective's
 * counts, and the gate that refuses a run with members' work), and the
 * shared store has none. Answers the count of what the query matches, as
 * Firestore does; inside a transaction it is read like any query.
 */
function withCounts(db) {
  const query = (q) => ({
    ...q,
    where: (...args) => query(q.where(...args)),
    select: (...args) => query(q.select(...args)),
    limit: (n) => query(q.limit(n)),
    count: () => ({
      path: q.path,
      isQuery: false,
      get: async () => {
        const found = await q.get();
        return { data: () => ({ count: found.size }) };
      },
    }),
  });
  const docRef = (d) => ({ ...d, collection: (name) => collection(d.collection(name)) });
  const collection = (c) => ({ ...query(c), doc: (id) => docRef(c.doc(id)), add: (data) => c.add(data) });
  const view = Object.create(db);
  view.collection = (path) => collection(db.collection(path));
  return view;
}

describe("6. every copy of a run carries its guide", () => {
  beforeEach(() => {
    w.world.courseDb = withCounts(w.world.courseDb);
  });

  test("copy forward: onto a run with none; kept where the target has its own unless it overwrites", async () => {
    await loadBoth();
    let answer = await w.call("zach", clone.POST, { runId: RUN.agiSpring }, { course: true, body: { fromRunId: RUN.agi } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.guide, ["startHere", "glossary"]);
    assert.deepEqual(storedRun(RUN.agiSpring).startHere, startHereDoc());
    assert.deepEqual(storedRun(RUN.agiSpring).glossary, glossaryDoc());

    const own = { ...glossaryDoc(), terms: [{ term: [run("Spring")], definition: [run("Its own.")] }] };
    w.world.db.poke(`courseRuns/${RUN.agiSpring}`, { glossary: own });
    answer = await w.call("zach", clone.POST, { runId: RUN.agiSpring }, { course: true, body: { fromRunId: RUN.agi } });
    assert.deepEqual(answer.body.guide, [], "both are the target's own now: neither copied without overwrite");
    assert.deepEqual(storedRun(RUN.agiSpring).glossary, own, "the target's own is kept");
    answer = await w.call("zach", clone.POST, { runId: RUN.agiSpring }, { course: true, body: { fromRunId: RUN.agi, overwrite: true } });
    assert.deepEqual(answer.body.guide, ["startHere", "glossary"]);
    assert.deepEqual(storedRun(RUN.agiSpring).glossary, glossaryDoc());
  });

  test("a template saved from the run holds its guide; applied to another run, it puts it there", async () => {
    await loadBoth();
    const saved = await w.call("zach", saveTemplate.POST, { courseId: COURSE.agi }, { course: true, body: { label: "Autumn final", sourceRunId: RUN.agi } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const template = w.world.db.read(`courseTemplates/${saved.body.templateId}`);
    assert.deepEqual(template.startHere, startHereDoc());
    assert.deepEqual(template.glossary, glossaryDoc());

    const applied = await w.call("zach", applyTemplate.POST, { runId: RUN.agiSpring }, { course: true, body: { templateId: saved.body.templateId, replace: true } });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.deepEqual(storedRun(RUN.agiSpring).startHere, startHereDoc());
    assert.deepEqual(storedRun(RUN.agiSpring).glossary, glossaryDoc());
  });

  test("a template saved before the guide existed leaves the run's own as it is", async () => {
    const saved = await w.call("zach", saveTemplate.POST, { courseId: COURSE.agi }, { course: true, body: { label: "Before", sourceRunId: RUN.agi } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal("startHere" in w.world.db.read(`courseTemplates/${saved.body.templateId}`), false);
    await loadBoth(RUN.agiSpring);
    const applied = await w.call("zach", applyTemplate.POST, { runId: RUN.agiSpring }, { course: true, body: { templateId: saved.body.templateId, replace: true } });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.deepEqual(storedRun(RUN.agiSpring).startHere, startHereDoc());
  });
});

// ---------------------------------------------------------------------------
// 7. Neither is public
// ---------------------------------------------------------------------------

describe("7. neither document is public (Q40 B)", () => {
  /**
   * THE CLASS: a page or route that reads a run's guide. Each reader is
   * listed with why; none is under the public tree. Checked both ways, so a
   * new reader is held to it the day it is written, and a listed one that
   * stops reading is taken off.
   */
  test("the only readers of a run's Start here and Glossary are listed, and none is public", () => {
    const READERS = new Map([
      ["lib/courses/guide/load.ts", "the one read of a run's guide for a signed-in page"],
      ["app/(app)/learn/[runId]/start-here/page.tsx", "Start here, behind the run's own gate and week 1's door"],
      ["app/(app)/learn/[runId]/glossary/page.tsx", "the Glossary, behind the run's own gate and week 1's door"],
      ["app/(app)/learn/[runId]/weeks/[n]/page.tsx", "whether to link the two pages under a week's title, behind the week page's gate"],
      ["app/(app)/learn/[runId]/page.tsx", "whether to draw About this course, behind the programme page's gate"],
      ["app/api/courses/runs/[runId]/guide/[doc]/route.ts", "the loader: admins only"],
      ["app/api/courses/runs/[runId]/clone-weeks/route.ts", "copy forward carries the guide to another run"],
      ["app/api/courses/runs/[runId]/apply-template/route.ts", "a saved version carries the guide to a run"],
      ["app/api/courses/[courseId]/templates/route.ts", "a saved version holds the run's guide"],
    ]);
    const found = new Map();
    for (const file of walkSource(SRC)) {
      const where = relative(SRC, file).split(sep).join("/");
      if (where.startsWith("lib/courses/guide/") && where !== "lib/courses/guide/load.ts") continue;
      const source = readFileSync(file, "utf8");
      if (/\b(?:readRunStartHere|readRunGlossary|loadRunGuide|guideLinksOf|runGuideFields)\(/.test(source)) found.set(where, true);
    }
    assert.deepEqual([...found.keys()].sort(), [...READERS.keys()].sort());
    for (const where of found.keys()) {
      assert.ok(!where.startsWith("app/(public)/") && !where.startsWith("features/public"), `${where} is public`);
    }
  });

  test("the public course pages still say nothing of either document once a run has both", async () => {
    await loadBoth();
    const publicTree = [...walkSource(SRC)].filter((file) => relative(SRC, file).split(sep).join("/").startsWith("app/(public)/"));
    for (const file of publicTree) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /startHere|glossary/i, relative(SRC, file));
    }
  });
});

// The format check is held here too, on what an admin's save stored.
test("a stored document reads back through the format's own writer as the guide's shape", async () => {
  await loadBoth();
  assert.equal(markdown.glossaryToMarkdown(storedRun().glossary), GLOSSARY_MARKDOWN);
});
