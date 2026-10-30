/**
 * A group's week as its facilitators, the programme's lead and admins read it
 * (plan item 6; boards wk-fac-group, wk-fac-group-phone, wk-reflections and
 * wk-reflections-phone): who ticked each source, by name (Q31); This week's
 * work; the review queue's reflections half and the page where lines are
 * picked to read out without names (Q30, Q37); the private notes' one reader
 * (Q38); and a facilitator's own coursework, read by the programme's lead and
 * admins and never by a co-facilitator (Zach, Mon 26 Oct).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS WHAT. The group's two pages are its live facilitators' and
 *     admins'; the lead's two pages the programme's lead's and admins'.
 *     Everybody else is sent away or told the page is not theirs, and nothing
 *     any of them opens writes anything.
 *  2. WHO TICKED EACH SOURCE: how many of how many, the names behind a real
 *     button, the group's fellows only to a facilitator, a facilitator's own
 *     tick only to the lead and admins, marked as theirs; nobody who left and
 *     nobody of another group.
 *  3. THE PAGE TO READ LINES OUT: everybody's answer with no name, no uid and
 *     no time, in the order of the words; how many wrote one; never a
 *     facilitator's own; picked lines copied with nothing about who wrote them.
 *  4. THIS WEEK'S WORK: each part's reflection written or not yet, per person,
 *     as a table and as the phone's lines, and the review queue's counts.
 *  5. THE PRIVATE NOTES: the group's facilitators read their group's fellows'
 *     notes, admins every note (a facilitator's own among them, marked), the
 *     lead none; never on a page to read lines out.
 *  6. THE LEAD'S AND ADMINS' VIEW: a facilitator's own ticks and reflections,
 *     under their name, and the Attendance tab's way to each group's week.
 *  7. WHAT THE WEEK PAGE SAYS IS TRUE: the lines a fellow and a facilitator
 *     read under their boxes, their sources and their notes name exactly the
 *     people the pages show that work to, run against the pages.
 *  8. NAMES NEVER REACH A PAGE A FELLOW CAN OPEN.
 *  9. THE TREE: every file that addresses the progress store, and every file
 *     that reads a private note, is listed with what it does, both ways; the
 *     staff readers are called by their two pages each, behind their gates.
 * 10. THE WORDS: no dash, no gendered pronoun.
 *
 * Real: the pages, the loaders and the components, rendered to HTML, and the
 * overview route. Faked: see `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { find } from "./lib/facilitatorPagesWorld.mjs";
import {
  AGI,
  B,
  NOTED,
  NOW,
  ROUND,
  RUN,
  SAID,
  facilitatorWeekSeed,
  makeFacilitatorWeekWorld,
} from "./lib/facilitatorWeekWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (path) => relative(SRC, path).split(sep).join("/");

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__facilitatorWeekSuite");
const { world, at, reset, groupPage, reflectionsPage, namedReflectionsPage, leadWeekPage, leadReflectionsPage, attendanceTab, lib, call, routes } = w;

const RUN_HOME = `/learn/${RUN.agi}`;
const PROGRAMME = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

/** What the page handed This week's work, or null. */
const weekOf = (drawn) => find(drawn.element, "ThisWeeksWork")[0]?.props.week ?? null;
/** What the page handed the page to read lines out, or null. */
const readOutOf = (drawn) => find(drawn.element, "ReadOutView")[0]?.props ?? null;
/** What the page handed the layout that reads reflections with names, or null. */
const namedOf = (drawn) => find(drawn.element, "NamedReflections")[0]?.props ?? null;
/** The review queue's reflections card, or null. */
const queueOf = (drawn) => find(drawn.element, "ReflectionsQueueCard")[0]?.props ?? null;
/** A person as the suite reads them: their name, and "(facilitator)" for a facilitator's own. */
const said = (person) => (person.own ? `${person.name} (facilitator)` : person.name);
/** Who ticked each source, by name. */
const ticksOf = (week) => week.sources.map((source) => [source.title, source.ticked.map(said), week.of]);
/** The private notes on each source, as who and what. */
const notesOf = (week) => week.sources.map((source) => [source.title, source.notes === null ? null : source.notes.map((note) => [said(note.person), note.text])]);

/** Every reflection the suite wrote, every private note, by writer. */
const ALL_REFLECTIONS = Object.entries(SAID).flatMap(([uid, prompts]) => Object.values(prompts).map((text) => [uid, text]));
const ALL_NOTES = Object.entries(NOTED).map(([uid, [, text]]) => [uid, text]);
/** Everybody the world knows, uid and whole name. */
const NAMES = {
  chloe: "Chloe Nguyen",
  farah: "Farah Hussain",
  kofi: "Kofi Asante",
  rahul: "Rahul Mehta",
  sofia: "Sofia Rossi",
  isaac: "Isaac Mensah",
  amara: "Amara Okafor",
};

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// 1. Who opens what
// ---------------------------------------------------------------------------

describe("1. who opens a group's week", () => {
  const EVERYBODY = ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "isaac", "nobody", null];

  test("the group page draws the week for its two facilitators and an admin; everybody else is sent away; nothing writes", async () => {
    const seen = {};
    for (const who of EVERYBODY) {
      const drawn = await groupPage(who);
      seen[who ?? "signed out"] = drawn.to ?? (weekOf(drawn) ? "week" : "no week");
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(seen, {
      rahul: "week",
      sofia: "week",
      zach: "week",
      claudia: RUN_HOME,
      tess: RUN_HOME,
      lloyd: RUN_HOME,
      yusuf: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      isaac: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the page to read lines out: the same people, the same answer for everybody else, and it writes nothing", async () => {
    const seen = {};
    for (const who of EVERYBODY) {
      const drawn = await reflectionsPage(who);
      seen[who ?? "signed out"] = drawn.to ?? (readOutOf(drawn) ? "drawn" : "nothing");
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(seen, {
      rahul: "drawn",
      sofia: "drawn",
      zach: "drawn",
      claudia: RUN_HOME,
      tess: RUN_HOME,
      lloyd: RUN_HOME,
      yusuf: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      isaac: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the page that reads the group's reflections with names: exactly the page to read lines out's people, and it writes nothing", async () => {
    const seen = {};
    for (const who of EVERYBODY) {
      const drawn = await namedReflectionsPage(who);
      seen[who ?? "signed out"] = drawn.to ?? (namedOf(drawn) && !readOutOf(drawn) ? "drawn" : "nothing");
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(seen, {
      rahul: "drawn",
      sofia: "drawn",
      zach: "drawn",
      claudia: RUN_HOME,
      tess: RUN_HOME,
      lloyd: RUN_HOME,
      yusuf: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      isaac: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the lead's two pages: the programme's lead and an admin; a reviewer is told whose they are; another lead finds no programme", async () => {
    for (const page of [leadWeekPage, leadReflectionsPage]) {
      const seen = {};
      for (const who of EVERYBODY) {
        const drawn = await page(who);
        // The lead's reflections are read with names: never the page to read lines out's layout.
        const shown = weekOf(drawn) ? "week" : namedOf(drawn) && !readOutOf(drawn) ? "reflections" : null;
        seen[who ?? "signed out"] =
          drawn.to ??
          shown ??
          (/Only the programme’s lead and admins can open Attendance/.test(drawn.text)
            ? "not yours"
            : /There is no programme here/.test(drawn.text)
              ? "no programme"
              : drawn.text.slice(0, 80));
        assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
      }
      const opened = page === leadWeekPage ? "week" : "reflections";
      assert.deepEqual(seen, {
        rahul: "/dashboard",
        sofia: "/dashboard",
        zach: opened,
        claudia: opened,
        tess: "no programme",
        lloyd: "not yours",
        yusuf: "/dashboard",
        tom: "/dashboard",
        chloe: "/dashboard",
        amara: "/dashboard",
        isaac: "/dashboard",
        nobody: "/dashboard",
        "signed out": "/dashboard",
      });
    }
  });

  test("viewing as a facilitator shows exactly what the facilitator sees, and writes nothing", async () => {
    const own = await groupPage("rahul");
    const ownReadOut = await reflectionsPage("rahul");
    world.viewAs = true;
    try {
      const viewed = await groupPage("rahul");
      const viewedReadOut = await reflectionsPage("rahul");
      assert.equal(viewed.html, own.html);
      assert.equal(viewedReadOut.html, ownReadOut.html);
      assert.equal(viewed.wrote || viewedReadOut.wrote, false);
    } finally {
      world.viewAs = false;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Who ticked each source (Q31)
// ---------------------------------------------------------------------------

describe("2. who ticked each source, by name, behind a button", () => {
  test("a facilitator is shown the group's fellows: never a facilitator's own tick, somebody who left, or another group", async () => {
    for (const who of ["rahul", "sofia"]) {
      const week = weekOf(await groupPage(who));
      assert.deepEqual(
        ticksOf(week),
        [
          ["A keeper's diary", ["Chloe Nguyen", "Farah Hussain"], 3],
          ["Lamps at night", ["Farah Hussain"], 3],
        ],
        who,
      );
    }
  });

  test("an admin and the lead are shown the facilitators' own ticks too, marked as theirs, and counted in no number", async () => {
    // One denominator on every view of a group's week: the group's 3 fellows, as the reflections half and the
    // page where lines are read out count. Until 27 October 2026 the lead's and an admin's ticks counted all 5
    // people listed while their reflections counted the 3 fellows.
    const expected = [
      ["A keeper's diary", ["Chloe Nguyen", "Farah Hussain", "Rahul Mehta (facilitator)"], 3],
      ["Lamps at night", ["Farah Hussain", "Sofia Rossi (facilitator)"], 3],
    ];
    const pages = [
      ["an admin on the group page", await groupPage("zach")],
      ["an admin on the lead's page", await leadWeekPage("zach")],
      ["the lead", await leadWeekPage("claudia")],
    ];
    for (const [who, drawn] of pages) {
      assert.deepEqual(ticksOf(weekOf(drawn)), expected, who);
      assert.deepEqual(weekOf(drawn).sources.map((source) => source.fellowsTicked), [2, 1], who);
      assert.match(drawn.text, /A keeper's diary 2 of 3 ticked it/, who);
      assert.match(drawn.text, /Lamps at night 1 of 3 ticked it/, who);
    }
  });

  test("the names sit behind a real button: closed, saying so, naming what it opens, and 44px to press", async () => {
    const { html, text } = await groupPage("rahul");
    // Two sources ticked, so two buttons, each closed, each controlling a region that is hidden until pressed.
    const buttons = [...html.matchAll(/<button type="button" class="wkToggle" aria-expanded="false" aria-controls="([^"]+)" aria-label="(See who ticked [^"]+)">See who<\/button>/g)];
    assert.deepEqual(buttons.map((m) => m[2]), ["See who ticked A keeper&#x27;s diary", "See who ticked Lamps at night"]);
    for (const [, id] of buttons) {
      const region = new RegExp(`<div id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" class="wkOpened" hidden="">(.*?)</div>`);
      assert.match(html, region, "the names are not in a region the button controls and hides");
    }
    // The count is never a percentage, and the rule every answer to Q31 keeps is said.
    assert.match(text, /Reading ticks Ticks never count against anyone\./);
    assert.match(text, /A keeper's diary 2 of 3 ticked it/);
    assert.doesNotMatch(text, /%/);
    const css = readFileSync(join(SRC, "features", "courses", "facilitator", "facilitator.module.css"), "utf8");
    const rule = css.slice(css.indexOf(".wkToggle {"), css.indexOf("}", css.indexOf(".wkToggle {")));
    assert.match(rule, /min-height: 44px;/);
    assert.match(rule, /appearance: none;\s*-webkit-appearance: none;/);
    // Nothing of who ticked is shown outside what the buttons open, by
    // hovering or otherwise: with the hidden regions taken out, the reading
    // ticks name nobody.
    const ticks = html.slice(html.indexOf('<section class="wkTicks"'));
    const closed = ticks.slice(0, ticks.indexOf("</section>")).replace(/<div id="[^"]+" class="wkOpened" hidden="">.*?<\/div>/g, "");
    assert.doesNotMatch(closed, /Chloe|Farah|Kofi|Nguyen|Hussain|Asante/);
  });

  test("a source nobody ticked offers no button", async () => {
    world.db.seed(`courseProgress/${RUN.agi}__farah__k3-s2`, { runId: RUN.agi, uid: "farah", weekNumber: 3, itemKind: "material", itemId: "k3-s2", completed: false, hasPublicComment: false });
    const { html, text } = await groupPage("rahul");
    assert.match(text, /Lamps at night 0 of 3 ticked it/);
    assert.equal((html.match(/See who ticked Lamps at night/g) ?? []).length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. The page to read lines out (Q37)
// ---------------------------------------------------------------------------

describe("3. the page to read lines out, without names", () => {
  test("every prompt of the week, the group's answers in the order of their words, with no name, uid or time", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const props = readOutOf(await reflectionsPage(who));
      assert.equal(props.readOut, true, who);
      assert.equal(props.own ?? null, null, `${who} is handed a facilitator's own reflections`);
      // THE SEPARATION (Zach, Fri 30 Oct: staff read reflections with names
      // elsewhere, and this page stays without): the component is handed its
      // prompts and two switches, and a prompt nothing that could carry a
      // writer's name or time beside an answer. A new field fails here.
      assert.deepEqual(Object.keys(props).sort(), ["prompts", "readOut", "tonight"], `${who}: the page to read lines out is handed more than words`);
      for (const prompt of props.prompts) {
        assert.deepEqual(Object.keys(prompt).sort(), ["cards", "key", "label", "notYet", "of", "partNumber", "text", "wrote"], `${who}: a prompt carries more than its words`);
      }
      assert.deepEqual(
        props.prompts.map((prompt) => [prompt.label, prompt.wrote, prompt.of, prompt.notYet]),
        [
          ["Part 1: Start with what you think (1 of 2)", 2, 3, ["Kofi"]],
          ["Part 1: Start with what you think (2 of 2)", 2, 3, ["Kofi"]],
          ["Part 2: Two keepers' views (1 of 2)", 2, 3, ["Kofi"]],
          ["Part 2: Two keepers' views (2 of 2)", 1, 3, ["Chloe", "Kofi"]],
          ["Part 3: What would change your mind? (1 of 2)", 0, 3, ["Chloe", "Farah", "Kofi"]],
          ["Part 3: What would change your mind? (2 of 2)", 0, 3, ["Chloe", "Farah", "Kofi"]],
        ],
        who,
      );
      // In the order of the words, never of the names: Farah's answer to the
      // first prompt before Chloe's, and Chloe's to the second before Farah's.
      assert.deepEqual(props.prompts[0].cards.map((card) => card.text), [SAID.farah["k3-rp1"], SAID.chloe["k3-rp1"]], who);
      assert.deepEqual(props.prompts[1].cards.map((card) => card.text), [SAID.chloe["k3-rp2"], SAID.farah["k3-rp2"]], who);
      for (const prompt of props.prompts) {
        for (const card of prompt.cards) {
          assert.deepEqual(Object.keys(card).sort(), ["key", "text"], `${who}: a card carries more than its words`);
          assert.match(card.key, /^p\d+-\d+$/);
        }
      }
      // Not one uid anywhere in what the browser is handed.
      const handed = JSON.stringify(props);
      for (const uid of Object.keys(NAMES)) assert.ok(!handed.includes(`"${uid}"`) && !new RegExp(`\\b${uid}\\b`).test(handed), `${who}: ${uid}'s uid is handed to the browser`);
    }
  });

  test("the page names nobody beside an answer, and says who may hear a line", async () => {
    const { html, text } = await reflectionsPage("rahul");
    for (const name of ["Chloe", "Farah", "Nguyen", "Hussain", "Isaac", "Amara", "Sofia Rossi"]) {
      assert.doesNotMatch(text, new RegExp(name), `the page shows ${name}`);
    }
    assert.match(text, /Group B · Week 3 · Reflections Reflections before tonight Prompt/);
    assert.match(text, /How many lighthouses are still lit, do you think\? 2 of 3 wrote one · Kofi hasn’t/);
    assert.match(text, new RegExp(`Reflection 1 Read this out ${SAID.farah["k3-rp1"]} Reflection 2 Read this out ${SAID.chloe["k3-rp1"]}`));
    assert.match(text, /To read out tonight 0 Pick lines that don’t show who wrote them\. Nothing picked yet\. Read them out without names\. Fellows can’t see each other’s reflections\./);
    assert.match(html, /<button type="button" class="wkReadOut" aria-pressed="false" aria-label="Read this out: reflection 1 of 2"/);
    // No time of writing either: a time can give a writer away as surely as a name.
    assert.doesNotMatch(text, /\d{1,2}:\d{2}(?:am|pm)|Sun 15 Nov/);
  });

  test("a facilitator's own reflection is never on it, nor anybody who left, nor another group's", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const handed = JSON.stringify(readOutOf(await reflectionsPage(who)));
      for (const uid of ["rahul", "sofia", "isaac", "amara"]) {
        for (const text of Object.values(SAID[uid])) assert.ok(!handed.includes(text), `${who} is handed ${uid}'s reflection`);
      }
      for (const [, text] of ALL_NOTES) assert.ok(!handed.includes(text), `${who} is handed a private note`);
    }
  });

  test("what Copy for the session copies: the picked lines and their parts, nothing about who wrote them", () => {
    assert.equal(
      lib.words.copyForSessionText([
        { partNumber: 1, text: SAID.chloe["k3-rp1"] },
        { partNumber: 2, text: SAID.farah["k3-rp4"] },
      ]),
      `Part 1\n“${SAID.chloe["k3-rp1"]}”\n\nPart 2\n“${SAID.farah["k3-rp4"]}”`,
    );
  });

  test("the week: the group's own, or one it teaches by ?week=; a week written before blocks has no reflections", async () => {
    assert.equal(readOutOf(await reflectionsPage("rahul", { week: 9 })).prompts.length, 6, "a week the group does not teach is ignored");
    const legacy = await reflectionsPage("rahul", { week: 2 });
    assert.equal(readOutOf(legacy), null);
    assert.match(legacy.text, /This week has no reflections\./);
  });

  test("the heading follows the session: before tonight, before a day, and a week whose session is over", async () => {
    at("2026-11-16T12:00:00Z");
    assert.match((await reflectionsPage("rahul")).text, /Reflections before Tue 17 Nov Prompt/);
    at("2026-11-18T12:00:00Z");
    const over = await reflectionsPage("rahul", { week: 3 });
    assert.match(over.text, /Week 3 reflections Prompt/);
    assert.match(over.text, /To read out 0/);
  });
});

// ---------------------------------------------------------------------------
// 4. This week's work
// ---------------------------------------------------------------------------

describe("4. This week's work and the review queue's counts", () => {
  test("a facilitator: the group's fellows, each part written or not yet, and whose eyes the facilitators' own work is for", async () => {
    for (const who of ["rahul", "sofia"]) {
      const drawn = await groupPage(who);
      const week = weekOf(drawn);
      assert.equal(week.weekNumber, 3);
      assert.equal(week.range, "Thu 12 to Wed 18 Nov");
      assert.deepEqual(week.parts.map((part) => part.number), [1, 2, 3]);
      assert.deepEqual(
        week.rows.map((row) => [said(row), row.written]),
        [
          ["Chloe Nguyen", [true, false, false]],
          ["Farah Hussain", [true, true, false]],
          ["Kofi Asante", [false, false, false]],
        ],
        who,
      );
      assert.deepEqual(queueOf(drawn).counts, [
        { number: 1, written: 2, of: 3 },
        { number: 2, written: 1, of: 3 },
        { number: 3, written: 0, of: 3 },
      ]);
      assert.equal(queueOf(drawn).href, `${RUN_HOME}/group/${B}/reflections?week=3`);
      assert.match(drawn.text, /Review queue Reflections Part 1, 2 of 3 · Part 2, 1 of 3 · Part 3, 0 of 3 Read them/);
      assert.match(drawn.text, /This week’s work Week 3 · Thu 12 to Wed 18 Nov Name Part 1 reflection Part 2 reflection Part 3 reflection CN Chloe Nguyen Written Not yet Not yet/);
      // The phone's lines, as wk-fac-group-phone draws them.
      assert.match(drawn.text, /FH Farah Hussain Reflections Part 1 written · part 2 written · part 3 not yet KA Kofi Asante Reflections Not yet/);
      assert.match(drawn.text, /Facilitators’ own work is for Claudia and admins to read, so it isn’t listed here\./);
      assert.doesNotMatch(drawn.text, /Rahul Mehta Facilitator|Sofia Rossi Facilitator|Isaac|Amara/);
    }
  });

  test("an admin and the lead: the fellows, then each facilitator's own row, marked as theirs; the counts stay the fellows'", async () => {
    for (const drawn of [await groupPage("zach"), await leadWeekPage("zach"), await leadWeekPage("claudia")]) {
      const week = weekOf(drawn);
      assert.deepEqual(
        week.rows.map((row) => [said(row), row.written]),
        [
          ["Chloe Nguyen", [true, false, false]],
          ["Farah Hussain", [true, true, false]],
          ["Kofi Asante", [false, false, false]],
          ["Rahul Mehta (facilitator)", [true, false, false]],
          ["Sofia Rossi (facilitator)", [false, false, false]],
        ],
      );
      assert.deepEqual(week.counts.map((count) => [count.number, count.written, count.of]), [[1, 2, 3], [2, 1, 3], [3, 0, 3]]);
      assert.equal(week.of, 3);
      assert.match(drawn.text, /RM Rahul Mehta Facilitator Written Not yet Not yet/);
      assert.doesNotMatch(drawn.text, /Facilitators’ own work is for/);
      // Under the table, whom every number counts.
      assert.match(drawn.text, /Every number here counts the group’s 3 fellows\. Facilitators’ own work is marked Facilitator and isn’t counted\./);
    }
    // A facilitator is shown none of it, and is told whose it is instead.
    const facilitator = await groupPage("rahul");
    assert.doesNotMatch(facilitator.text, /Every number here counts/);
    assert.match(facilitator.text, /Facilitators’ own work is for Claudia and admins to read, so it isn’t listed here\./);
  });

  test("before groups go out, a facilitator reads the page's own sentence and no reflections half; an admin reads the group", async () => {
    const seed = facilitatorWeekSeed();
    for (const uid of ["chloe", "farah", "kofi", "rahul"]) seed[`courseEnrolments/${RUN.agi}__${uid}`].allocatedEmailAt = null;
    reset(seed);
    const asFacilitator = await groupPage("sofia");
    assert.deepEqual(weekOf(asFacilitator).rows, []);
    assert.equal(queueOf(asFacilitator), null);
    assert.match(asFacilitator.text, /This week’s work Week 3 · Thu 12 to Wed 18 Nov You’ll see your group’s names when groups go out\./);
    const asAdmin = await groupPage("zach");
    assert.deepEqual(weekOf(asAdmin).rows.map(said), ["Chloe Nguyen", "Farah Hussain", "Kofi Asante", "Rahul Mehta (facilitator)", "Sofia Rossi (facilitator)"]);
    assert.ok(queueOf(asAdmin));
  });

  test("a week written before blocks draws none of it, and the summer's page stands as it was", async () => {
    reset(facilitatorWeekSeed({ [`courseRuns/${RUN.agi}/weeks/w03`]: { weekNumber: 3, title: "Who decides what AGI means", summary: "", published: true, materials: [], checklist: [], exercises: [] } }));
    const drawn = await groupPage("rahul");
    assert.equal(weekOf(drawn), null);
    assert.equal(queueOf(drawn), null);
    // The summer's order, as before: the ticket, the group, the registers, then the work to review.
    assert.match(drawn.text, /Take the register Your group Weeks 1 and 2/);
    assert.match(drawn.text, /Week 3 Tue 17 Nov Tonight To review 3/);
  });
});

// ---------------------------------------------------------------------------
// 5. The private notes (Q38)
// ---------------------------------------------------------------------------

describe("5. the private notes: the group's facilitators and admins, never the lead, never read out", () => {
  test("a facilitator reads the group's fellows' notes on each source, never a facilitator's own", async () => {
    for (const who of ["rahul", "sofia"]) {
      const drawn = await groupPage(who);
      assert.deepEqual(notesOf(weekOf(drawn)), [
        ["A keeper's diary", [["Chloe Nguyen", NOTED.chloe[1]]]],
        ["Lamps at night", [["Kofi Asante", NOTED.kofi[1]]]],
      ], who);
      assert.doesNotMatch(drawn.html, new RegExp(NOTED.rahul[1]), `${who} reads Rahul's own note`);
      assert.match(drawn.text, /Only Group B’s facilitators and admins read private notes\. They’re never read out\./);
    }
  });

  test("an admin reads every note of the group, a facilitator's own among them, marked as theirs", async () => {
    assert.deepEqual(notesOf(weekOf(await groupPage("zach"))), [
      ["A keeper's diary", [["Chloe Nguyen", NOTED.chloe[1]], ["Rahul Mehta (facilitator)", NOTED.rahul[1]]]],
      ["Lamps at night", [["Kofi Asante", NOTED.kofi[1]]]],
    ]);
  });

  test("the lead reads none, on either page", async () => {
    const week = await leadWeekPage("claudia");
    assert.deepEqual(notesOf(weekOf(week)).map(([, notes]) => notes), [null, null]);
    const reflections = await leadReflectionsPage("claudia");
    for (const [, text] of ALL_NOTES) {
      assert.ok(!week.html.includes(text) && !reflections.html.includes(text), "the lead is shown a private note");
    }
    assert.doesNotMatch(week.text, /private note/i);
  });

  test("the notes behind their own button, closed until pressed", async () => {
    const { html } = await groupPage("rahul");
    assert.match(html, /aria-expanded="false" aria-controls="[^"]+" aria-label="1 private note on A keeper&#x27;s diary">1 private note<\/button>/);
  });

  test("a page to read lines out never holds one, for anybody", async () => {
    for (const drawn of [await reflectionsPage("rahul"), await reflectionsPage("zach"), await leadReflectionsPage("zach")]) {
      for (const [, text] of ALL_NOTES) assert.ok(!drawn.html.includes(text) && !JSON.stringify(readOutOf(drawn)).includes(text));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The lead's and admins' view
// ---------------------------------------------------------------------------

describe("6. the lead's and admins' view of a group's week", () => {
  test("the group's answers with their writers' names, and the facilitators' own under their names, never read out", async () => {
    const asLead = await leadReflectionsPage("claudia");
    assert.equal(readOutOf(asLead), null, "the lead's page draws the page to read lines out's layout");
    const props = namedOf(asLead);
    // Every prompt, each fellow's answer under their whole name in the group's
    // order of people (Chloe, Farah, Kofi), with when it was last written, and
    // the fellows who have not written one yet.
    assert.deepEqual(
      props.prompts.map((prompt) => [prompt.label, prompt.answers.map((answer) => [answer.name, answer.text, answer.at?.toISOString() ?? null]), prompt.notYet, prompt.wrote, prompt.of]),
      [
        ["Part 1: Start with what you think (1 of 2)", [["Chloe Nguyen", SAID.chloe["k3-rp1"], "2026-11-15T16:12:00.000Z"], ["Farah Hussain", SAID.farah["k3-rp1"], "2026-11-15T16:12:00.000Z"]], ["Kofi Asante"], 2, 3],
        ["Part 1: Start with what you think (2 of 2)", [["Chloe Nguyen", SAID.chloe["k3-rp2"], "2026-11-15T16:12:00.000Z"], ["Farah Hussain", SAID.farah["k3-rp2"], "2026-11-15T16:12:00.000Z"]], ["Kofi Asante"], 2, 3],
        ["Part 2: Two keepers' views (1 of 2)", [["Chloe Nguyen", SAID.chloe["k3-rp3"], "2026-11-15T16:12:00.000Z"], ["Farah Hussain", SAID.farah["k3-rp3"], "2026-11-15T16:12:00.000Z"]], ["Kofi Asante"], 2, 3],
        ["Part 2: Two keepers' views (2 of 2)", [["Farah Hussain", SAID.farah["k3-rp4"], "2026-11-15T16:12:00.000Z"]], ["Chloe Nguyen", "Kofi Asante"], 1, 3],
        ["Part 3: What would change your mind? (1 of 2)", [], ["Chloe Nguyen", "Farah Hussain", "Kofi Asante"], 0, 3],
        ["Part 3: What would change your mind? (2 of 2)", [], ["Chloe Nguyen", "Farah Hussain", "Kofi Asante"], 0, 3],
      ],
    );
    assert.deepEqual(
      props.prompts.map((prompt) => prompt.own.map((person) => [person.name, person.text])),
      [
        [["Rahul Mehta", SAID.rahul["k3-rp1"]], ["Sofia Rossi", SAID.sofia["k3-rp1"]]],
        [["Rahul Mehta", SAID.rahul["k3-rp2"]], ["Sofia Rossi", null]],
        [["Rahul Mehta", null], ["Sofia Rossi", null]],
        [["Rahul Mehta", null], ["Sofia Rossi", null]],
        [["Rahul Mehta", null], ["Sofia Rossi", null]],
        [["Rahul Mehta", null], ["Sofia Rossi", null]],
      ],
    );
    assert.match(asLead.text, /Only you and admins read these\. They’re never read out\./);
    assert.match(asLead.text, new RegExp(`Chloe Nguyen Sun 15 Nov, 4:12pm ${SAID.chloe["k3-rp1"]} Farah Hussain Sun 15 Nov, 4:12pm ${SAID.farah["k3-rp1"]}`));
    assert.match(asLead.text, /2 of 3 wrote one · Kofi Asante hasn’t/);
    assert.match(asLead.text, new RegExp(`Facilitators’ own reflections Rahul Mehta Facilitator Sun 15 Nov, 4:12pm ${SAID.rahul["k3-rp1"]} Sofia Rossi Facilitator Sun 15 Nov, 4:12pm ${SAID.sofia["k3-rp1"]}`));
    assert.doesNotMatch(asLead.html, /Read this out|To read out|Copy for the session/);
    // Nobody who left and nobody of another group, and never a private note.
    for (const uid of ["isaac", "amara"]) for (const text of Object.values(SAID[uid])) assert.ok(!asLead.html.includes(text), `the lead is shown ${uid}'s reflection`);
    for (const [, text] of ALL_NOTES) assert.ok(!asLead.html.includes(text), "the lead is shown a private note");
    const asAdmin = await leadReflectionsPage("zach");
    assert.match(asAdmin.text, /Only Claudia and admins read these\. They’re never read out\./);
  });

  test("the group's facilitators read its fellows' reflections with names, never a facilitator's own, and lines are read out from the page without", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await namedReflectionsPage(who);
      const props = namedOf(drawn);
      assert.deepEqual(
        props.prompts.map((prompt) => [prompt.answers.map((answer) => answer.name), prompt.notYet]),
        [
          [["Chloe Nguyen", "Farah Hussain"], ["Kofi Asante"]],
          [["Chloe Nguyen", "Farah Hussain"], ["Kofi Asante"]],
          [["Chloe Nguyen", "Farah Hussain"], ["Kofi Asante"]],
          [["Farah Hussain"], ["Chloe Nguyen", "Kofi Asante"]],
          [[], ["Chloe Nguyen", "Farah Hussain", "Kofi Asante"]],
          [[], ["Chloe Nguyen", "Farah Hussain", "Kofi Asante"]],
        ],
        who,
      );
      // Fellows only, an admin included: a facilitator's own is the lead's page's.
      for (const prompt of props.prompts) assert.equal(prompt.own, null, `${who} is handed a facilitator's own reflections`);
      for (const uid of ["rahul", "sofia", "isaac", "amara"]) {
        for (const text of Object.values(SAID[uid])) assert.ok(!drawn.html.includes(text) && !JSON.stringify(drawn.element).includes(text), `${who} is shown ${uid}'s reflection`);
      }
      for (const [, text] of ALL_NOTES) assert.ok(!drawn.html.includes(text), `${who} is shown a private note`);
      assert.match(drawn.text, /Group B’s facilitators, Claudia and admins read reflections with names\. Fellows can’t see each other’s\./);
      assert.match(drawn.html, new RegExp(`href="${RUN_HOME}/group/${B}/reflections\\?week=3"[^>]*>Pick lines to read out<`));
    }
    // The way there, from the page to read lines out and from the group page.
    assert.match((await reflectionsPage("rahul")).html, new RegExp(`href="${RUN_HOME}/group/${B}/reflections/names\\?week=3"[^>]*>Read them with names<`));
    assert.equal(find((await groupPage("rahul")).element, "ReflectionsQueueCard")[0]?.props.namesHref, `${RUN_HOME}/group/${B}/reflections/names?week=3`);
  });

  test("a co-facilitator never reads a facilitator's own work, on any page they can open", async () => {
    for (const drawn of [await groupPage("sofia"), await reflectionsPage("sofia")]) {
      for (const text of Object.values(SAID.rahul)) assert.ok(!drawn.html.includes(text) && !JSON.stringify(drawn.element).includes(text));
      assert.ok(!drawn.html.includes(NOTED.rahul[1]));
    }
    for (const drawn of [await groupPage("rahul"), await reflectionsPage("rahul")]) {
      for (const text of Object.values(SAID.sofia)) assert.ok(!drawn.html.includes(text) && !JSON.stringify(drawn.element).includes(text));
    }
  });

  test("the Attendance tab offers the lead and an admin each group's week, on a run whose weeks are written as blocks", async () => {
    for (const who of ["claudia", "zach"]) {
      const drawn = await attendanceTab(who);
      const card = find(drawn.element, "GroupWeeksCard")[0]?.props;
      assert.ok(card, `${who} is not offered each group's week`);
      const groupB = card.groups.find((group) => group.id === B);
      assert.deepEqual(groupB, { id: B, name: "Group B", weekNumber: 3, href: `${PROGRAMME}/week?group=${B}` });
      assert.match(drawn.text, /Each group’s week/);
    }
    for (const who of ["lloyd", "tess"]) assert.equal(find((await attendanceTab(who)).element, "GroupWeeksCard").length, 0, who);
    // A run of weeks written before blocks is offered no such card.
    reset(facilitatorWeekSeed({ [`courseRuns/${RUN.agi}/weeks/w03`]: { weekNumber: 3, title: "Week 3", summary: "", published: true, materials: [], checklist: [], exercises: [] } }));
    assert.equal(find((await attendanceTab("claudia")).element, "GroupWeeksCard").length, 0);
  });

  test("the lead's page opens the group asked for, and the first group otherwise", async () => {
    const drawn = await leadWeekPage("claudia", { groupId: "no-such-group" });
    assert.match(drawn.text, /^Attendance Group B’s week|^Attendance Group/);
  });
});

// ---------------------------------------------------------------------------
// 7. What the week page says is true
// ---------------------------------------------------------------------------

describe("7. the lines on a fellow's and a facilitator's week page name exactly who the pages show their work to", () => {
  const VIEWERS = ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "isaac", "nobody", null];

  /** Every page a viewer can open of the group's week, as one string of what they were handed. */
  async function everythingSeenBy(who) {
    const pages = [await groupPage(who), await reflectionsPage(who), await leadWeekPage(who), await leadReflectionsPage(who)];
    return pages.map((drawn) => `${drawn.html}\n${JSON.stringify(readOutOf(drawn) ?? null)}`).join("\n");
  }

  /** Who, of everybody, is shown a tick of `uid`'s by name, a reflection of theirs, and a note of theirs. */
  async function readersOf(uid) {
    const out = { ticks: [], reflections: [], notes: [] };
    for (const who of VIEWERS) {
      const seen = await everythingSeenBy(who);
      const week = weekOf(await groupPage(who)) ?? weekOf(await leadWeekPage(who));
      if (week && week.sources.some((source) => source.ticked.some((person) => person.uid === uid))) out.ticks.push(who ?? "signed out");
      if (Object.values(SAID[uid] ?? {}).some((text) => seen.includes(text))) out.reflections.push(who ?? "signed out");
      if (NOTED[uid] && seen.includes(NOTED[uid][1])) out.notes.push(who ?? "signed out");
    }
    return out;
  }

  test("a fellow's: their facilitators, the lead and admins see their ticks and reflections; their facilitators and admins their notes", async () => {
    assert.equal(lib.memberWords.ticksSeenByWords(["Rahul", "Sofia"], "Claudia"), "Rahul, Sofia, Claudia and admins can see which sources you tick.");
    assert.equal(lib.memberWords.reflectionsReadByWords(["Rahul", "Sofia"], "Claudia"), "Rahul, Sofia, Claudia and admins can read your reflections. Other fellows can’t.");
    assert.equal(lib.memberWords.PRIVATE_NOTE_HINT, "Only your facilitators and admins see this. It’s never read out.");
    assert.deepEqual(await readersOf("chloe"), {
      ticks: ["rahul", "sofia", "zach", "claudia"],
      reflections: ["rahul", "sofia", "zach", "claudia"],
      notes: ["rahul", "sofia", "zach"],
    });
  });

  test("a facilitator's own: the lead and admins see their ticks and reflections, and admins alone their notes", async () => {
    assert.equal(lib.memberWords.facilitatorTicksSeenByWords("Claudia"), "Only Claudia and admins can see which sources you tick.");
    assert.equal(lib.memberWords.facilitatorReflectionsReadByWords("Claudia"), "Only Claudia and admins can read your reflections.");
    assert.equal(lib.memberWords.PRIVATE_NOTE_HINT_FACILITATOR, "Only admins see this. It’s never read out.");
    assert.deepEqual(await readersOf("rahul"), { ticks: ["zach", "claudia"], reflections: ["zach", "claudia"], notes: ["zach"] });
  });

  test("somebody who left, and somebody in another group, are shown to nobody here", async () => {
    for (const uid of ["isaac", "amara"]) assert.deepEqual(await readersOf(uid), { ticks: [], reflections: [], notes: [] }, uid);
  });
});

// ---------------------------------------------------------------------------
// 8. Names never reach a page a fellow can open
// ---------------------------------------------------------------------------

describe("8. names never reach a page a fellow can open", () => {
  test("a fellow's programme payload holds nobody else's reflection, note or tick", async () => {
    const answer = await call("chloe", routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(answer.status, 200);
    const handed = JSON.stringify(answer.body);
    for (const [uid, text] of [...ALL_REFLECTIONS, ...ALL_NOTES]) {
      if (uid === "chloe") continue;
      assert.ok(!handed.includes(text), `Chloe's programme page is handed ${uid}'s words`);
    }
    assert.doesNotMatch(handed, /Facilitators’ own|ticked it|private note/);
  });
});

// ---------------------------------------------------------------------------
// 9. The tree
// ---------------------------------------------------------------------------

/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/**
 * Every file under `src` that hands the progress store's name to a database
 * call, in a browser or on the server, or to a deletion sweep, with what it
 * reads of whose rows. One kind shows a person's ticks to somebody else by
 * name: `staff`, and it is one file.
 */
const PROGRESS_ADDRESSERS = {
  "app/api/courses/[courseId]/templates/route.ts": ["count", "counts a run's rows before a snapshot is taken: a number, never a row"],
  "app/api/courses/groups/[groupId]/weeks/[weekId]/route.ts": ["count", "counts the rows on items an edit to a group's week would remove: a number for the editor"],
  "app/api/courses/progress/[progressId]/moderate/route.ts": ["moderation", "an admin hides one public comment on a programme anyone can join"],
  "app/api/courses/runs/[runId]/apply-template/route.ts": ["count", "refuses to replace the weeks of a run that has ticks keyed on them"],
  "app/api/courses/runs/[runId]/comments/route.ts": ["comments", "the comments a person chose to show the rest of a run anyone can join"],
  "app/api/courses/runs/[runId]/normalise-weeks/route.ts": ["count", "refuses to renumber a run's weeks once anybody has ticked in them"],
  "app/api/courses/runs/[runId]/retrospective/route.ts": ["aggregate", "ratings and finishes as totals, read through a projection with no uid"],
  "app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts": ["own", "somebody holding a place ticks week 1 before groups go out, through week 1's door, on their own row by their own uid"],
  "lib/courses/weekPaste.ts": ["count", "a paste counts the rows on items it would take out, for the run's week and a group's copy alike: a number for whoever is pasting"],
  "features/courses/progressMutations.ts": ["own", "a person writes their own tick, rating and note, on their own row"],
  "features/courses/useRunProgress.ts": ["own", "a person's own rows, in their browser, by their own uid"],
  "lib/courses/facilitatorWeek/readers.ts": ["staff", "who ticked each source by name, for a group's facilitators, the programme's lead and admins, and the private notes, for its facilitators and admins, after each page's gate"],
  "lib/courses/leftView.ts": ["own", "a person's own notes and ratings, on their own notes page"],
  "lib/courses/sourceRatings.ts": ["aggregate", "the sources people rated as totals, for a programme lead's Surveys tab: the retrospective's projection, with no uid, and its count"],
  "lib/firestore/accountDeletion.ts": ["deletion", "deleting an account deletes its rows"],
  "lib/firestore/courseDeletion.ts": ["deletion", "destroying a run counts and deletes its rows"],
};
const PROGRESS_ADDRESSES =
  /\.collection\(\s*["'`]courseProgress["'`]\s*\)|\b(?:collection|doc)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["'`]courseProgress["'`]|\[\s*["'`]courseProgress["'`]\s*,|\bbyRunId\(\s*["'`]courseProgress["'`]|\bdrainQuery\([^,]+,\s*["'`]courseProgress["'`]/;

/** Every file that reads a private note off a progress row, with whose and for whom. One shows somebody else's: the staff reader. */
const PRIVATE_NOTE_READERS = {
  "lib/firestore/courseProgress.ts": "the record: its shape, its limit and its normaliser",
  "features/courses/progressMutations.ts": "the writer: a person's own note, on their own row",
  "app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts": "a person's own note, kept as it was when they tick week 1 before groups go out, on their own row",
  "features/courses/WeekView.tsx": "a person's own note, in their own box on a week written before blocks",
  "features/courses/weekBlocks/SourceCard.tsx": "a person's own note, in their own box under a source",
  "lib/courses/leftView.ts": "a person's own notes, on their own notes page",
  "lib/courses/facilitatorWeek/readers.ts": "THE ONE STAFF READER: a group's fellows' notes for its facilitators, and every note of the group for an admin",
};

describe("9. the tree", () => {
  const files = [...walkSource(SRC)].filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => [inSrc(file), codeOf(file)]);
  assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);

  test("every file that addresses the progress store is listed, with what it reads of whose rows, both ways", () => {
    const found = files.filter(([, code]) => PROGRESS_ADDRESSES.test(code)).map(([file]) => file).sort();
    assert.ok(found.includes("features/courses/useRunProgress.ts") && found.includes("lib/firestore/courseDeletion.ts"), "the scan is not reading");
    assert.deepEqual(found, Object.keys(PROGRESS_ADDRESSERS).sort());
    assert.deepEqual(Object.entries(PROGRESS_ADDRESSERS).filter(([, [kind]]) => kind === "staff").map(([file]) => file), ["lib/courses/facilitatorWeek/readers.ts"]);
    // The aggregate reads no uid.
    assert.match(codeOf(join(SRC, "app/api/courses/runs/[runId]/retrospective/route.ts")), /\.select\("itemId", "rating", "completed"\)/);
  });

  test("every file that reads a private note is listed, both ways", () => {
    const found = files.filter(([, code]) => /\bprivateNote\b/.test(code)).map(([file]) => file).sort();
    assert.deepEqual(found, Object.keys(PRIVATE_NOTE_READERS).sort());
  });

  test("the staff reader reads ticks with no note, notes only for those who read them, and reflections only", () => {
    const code = codeOf(join(SRC, "lib/courses/facilitatorWeek/readers.ts"));
    assert.match(code, /\.select\("uid", "itemId", "completed"\)/);
    assert.match(code, /\.select\("uid", "itemId", "privateNote"\)/);
    assert.equal((code.match(/\breadPrivateNotes\(/g) ?? []).length, 2, "the private notes' reader is defined once and called once");
    assert.match(code, /readsPrivateNotes\(viewer\) \? readPrivateNotes\(db, run\.id, at\.weekNumber, readable, sourceIds\)/);
    assert.match(code, /if \(!isReflectionResponse\(data\) \|\| data\.runId !== runId\) continue;/);
    // The page to read lines out reads reflections, never a note.
    const readOut = code.slice(code.indexOf("export async function loadReadOutWeek("));
    assert.doesNotMatch(readOut, /privateNote|readPrivateNotes|readTicks/);
  });

  test("each loader is called by its two pages, which gate first, and by nothing else", () => {
    const callersOf = (name) =>
      files
        .filter(([file, code]) => file !== "lib/courses/facilitatorWeek/readers.ts" && new RegExp(`\\b${name}\\(`).test(code))
        .map(([file]) => file)
        .sort();
    assert.deepEqual(callersOf("loadGroupWeek"), [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/page.tsx",
    ]);
    // The page to read lines out is the one caller of its loader, and the
    // pages that read reflections with names are the callers of theirs:
    // neither ever calls the other's.
    assert.deepEqual(callersOf("loadReadOutWeek"), ["app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx"]);
    // The layout that draws names is never drawn by the page to read lines
    // out, nor the read-out layout by a page with names.
    const readOutPage = codeOf(join(SRC, "app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx"));
    assert.doesNotMatch(readOutPage, /NamedReflections|loadNamedReflections/);
    for (const page of [
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx",
    ]) {
      assert.doesNotMatch(codeOf(join(SRC, page)), /ReadOutView|loadReadOutWeek/, `${page} draws the page to read lines out's layout`);
    }
    assert.doesNotMatch(codeOf(join(SRC, "features/courses/facilitatorWeek/ReadOutView.tsx")), /NamedReflections|\.name\b|\bat:/);
    // The read-out loader reads words alone; the timed reader is the named loader's.
    const readersCode = codeOf(join(SRC, "lib/courses/facilitatorWeek/readers.ts"));
    const readOutLoader = readersCode.slice(readersCode.indexOf("export async function loadReadOutWeek("));
    assert.doesNotMatch(readOutLoader, /readNamedReflections|loadNamedReflections|updatedAt/);
    assert.deepEqual(callersOf("loadNamedReflections"), [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
    ]);
    for (const page of [
      "app/(app)/learn/[runId]/group/[groupId]/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
    ]) {
      const code = codeOf(join(SRC, page));
      const gate = code.indexOf("if (group.runId !== runId || !(access.isAdmin || facilitatesThisGroup))");
      const load = Math.max(code.indexOf("loadGroupWeek("), code.indexOf("loadReadOutWeek("), code.indexOf("loadNamedReflections("));
      assert.ok(gate !== -1 && load > gate, `${page} loads the week before its gate`);
      assert.match(code, /viewer: access\.isAdmin \? "admin" : "facilitator"/, `${page} decides the viewer some other way`);
    }
    // The facilitators' page with names hands the loader no facilitator's own, an admin's view of it included.
    assert.match(codeOf(join(SRC, "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx")), /withOwn: false,/);
    for (const page of ["week", "reflections"]) {
      const code = codeOf(join(SRC, `app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/${page}/page.tsx`));
      assert.match(code, /requireAdmissionsPage\(\)/);
      const door = code.indexOf("openLeadDoor(");
      const load = Math.max(code.indexOf("loadGroupWeek("), code.indexOf("loadNamedReflections("));
      assert.ok(door !== -1 && load > door, `the lead's ${page} page loads before its door`);
    }
    // The lead's door: an admin or the programme's lead, decided from the form.
    const doorCode = codeOf(join(SRC, "lib/courses/facilitatorWeek/leadDoor.ts"));
    assert.match(doorCode, /const outcome = await loadProgrammeRun\(db, user, roundId, programmeId\);/);
    assert.match(doorCode, /viewer: view\.viewer === "admin" \? "admin" : "lead"/);
  });

  test("who sees whose work is decided in one place, and run", () => {
    const { model } = lib;
    assert.deepEqual(["facilitator", "lead", "admin"].map(model.seesFacilitatorsOwnWork), [false, true, true]);
    assert.deepEqual(["facilitator", "lead", "admin"].map(model.readsPrivateNotes), [true, false, true]);
    assert.deepEqual(["facilitator", "lead", "admin"].map(model.readsFacilitatorsPrivateNotes), [false, false, true]);
    const people = [{ uid: "chloe", name: "Chloe Nguyen" }, { uid: "rahul", name: "Rahul Mehta" }];
    const facilitators = [{ uid: "rahul", name: "Rahul Mehta", firstName: "Rahul" }, { uid: "sofia", name: "Sofia Rossi", firstName: "Sofia" }];
    assert.deepEqual(model.peopleShown("facilitator", people, facilitators).map(said), ["Chloe Nguyen"]);
    assert.deepEqual(model.peopleShown("lead", people, facilitators).map(said), ["Chloe Nguyen", "Rahul Mehta (facilitator)", "Sofia Rossi (facilitator)"]);
    assert.deepEqual(model.readOutCards("p1", ["b", " ", "A", "c"]), [{ key: "p1-1", text: "A" }, { key: "p1-2", text: "b" }, { key: "p1-3", text: "c" }]);
  });
});

// ---------------------------------------------------------------------------
// 10. The words
// ---------------------------------------------------------------------------

describe("10. the words", () => {
  test("say what the boards say, and what they do not draw in their voice", () => {
    const { words } = lib;
    assert.equal(words.queueCountsWords([{ number: 1, written: 6, of: 7 }, { number: 2, written: 5, of: 7 }]), "Part 1, 6 of 7 · Part 2, 5 of 7");
    assert.equal(words.wroteWords(6, 7, ["Kofi"]), "6 of 7 wrote one · Kofi hasn’t");
    assert.equal(words.wroteWords(5, 7, ["Kofi", "Farah"]), "5 of 7 wrote one · Kofi and Farah haven’t");
    assert.equal(words.wroteWords(7, 7, []), "7 of 7 wrote one");
    assert.equal(words.reflectionsLineWords([{ number: 1, written: true }, { number: 2, written: true }]), "Part 1 and part 2 written");
    assert.equal(words.reflectionsLineWords([{ number: 1, written: true }, { number: 2, written: false }]), "Part 1 written · part 2 not yet");
    assert.equal(words.reflectionsLineWords([{ number: 1, written: false }, { number: 2, written: false }]), "Not yet");
    assert.equal(words.weekMetaWords(3, "Thu 12 to Wed 18 Nov"), "Week 3 · Thu 12 to Wed 18 Nov");
    assert.equal(words.toReadOutWords(true), "To read out tonight");
    // An open button says what it hides, so two open side by side are told apart.
    assert.equal(words.hideWhoNameWords("A keeper's diary"), "Hide names for A keeper's diary");
    assert.equal(words.hideNotesNameWords("A keeper's diary"), "Hide notes for A keeper's diary");
    assert.equal(words.promptOptionWords(1, "Why alignment might be hard", 0, 1), "Part 1: Why alignment might be hard");
    // Reading reflections with names: who else reads them so, and where lines are read out from.
    assert.equal(
      words.namedReadersLine("Group B", "Claudia"),
      "Group B’s facilitators, Claudia and admins read reflections with names. Fellows can’t see each other’s. To read a line out in the session, pick it on the page without names.",
    );
    assert.equal(words.namedReadersLine("Group B", null), "Group B’s facilitators and admins read reflections with names. Fellows can’t see each other’s. To read a line out in the session, pick it on the page without names.");
    assert.equal(words.lastWrittenWords(new Date("2026-11-15T16:12:00Z")), "Sun 15 Nov, 4:12pm");
  });

  test("no dash of either kind, no gendered pronoun and no word the house does not use, in any file of this piece", () => {
    const own = [
      "lib/courses/facilitatorWeek/model.ts",
      "lib/courses/facilitatorWeek/words.ts",
      "lib/courses/facilitatorWeek/readers.ts",
      "lib/courses/facilitatorWeek/leadDoor.ts",
      "features/courses/facilitatorWeek/ThisWeeksWork.tsx",
      "features/courses/facilitatorWeek/ReadOutView.tsx",
      "features/courses/facilitatorWeek/Disclosure.tsx",
      "features/courses/facilitatorWeek/NamedReflections.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx",
    ];
    for (const file of own) {
      const source = readFileSync(join(SRC, file), "utf8");
      assert.doesNotMatch(source, /[–—]/, `${file} carries a dash`);
      assert.doesNotMatch(source, /\bcollate\b/i, file);
      const strings = [...stripSource(source, { keepStrings: true }).matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).join("\n");
      assert.doesNotMatch(strings, /\b(he|she|his|hers|him|her|himself|herself)\b/i, `${file} says a pronoun`);
    }
  });
});
