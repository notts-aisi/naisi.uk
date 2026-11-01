/**
 * A programme's Coursework tab and one person's page (Zach, Fri 30 Oct), for
 * the programme's lead and admins.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS WHAT. The tab and a person's page are the programme's lead's
 *     and admins'. A reviewer is told so, the lead of another programme
 *     finds no programme, everybody else is sent away, and nothing writes.
 *  2. WHO IS A ROW. Everybody holding a place on the programme, in a group or
 *     not yet, anybody else placed in a live group, and every facilitator,
 *     marked as facilitating; nobody who left. Sorted by group, then name,
 *     people in no group last.
 *  3. A PLACEMENT PUBLISH HAS NOT TOLD is shown to admins alone: to the lead
 *     that person is not in a group yet.
 *  4. A CELL is counts and states, never a word: reflection parts written,
 *     sources ticked, the written answer (waiting stands out and opens the
 *     feedback page), boxes filled. Somebody in no group is counted on the
 *     run's own week 1, where their week 1 work was written.
 *  5. THE FILTERS are plain links.
 *  6. A PERSON'S PAGE: newest week first, each reflection under its prompt
 *     with when it was written, the written answer and its feedback, the
 *     boxes and the ticks. A PRIVATE NOTE is an admin's alone, never the
 *     lead's; survey answers never.
 *  7. THE MODEL, run on its own.
 *  8. THE TREE: each page gates before it reads.
 *  9. CLAUDE, PANGRAM AND THE NOTES THE TEAM KEEPS (privacy v13, v15). Under
 *     the tab's table, for an admin alone (privacy v15), one week chosen by
 *     links that keep the filters: Claude's best answers and Pangram. Beside
 *     a person's weeks, for an admin: notes about them written from this
 *     run, Claude's draft of one, and Pangram. For the lead: the notes kept
 *     for leads alone, through the programme's route, and nothing of Claude
 *     or Pangram; no word of Claude's answers or of Pangram reaches the
 *     lead's pages.
 *
 * Real: the two pages, the loader and the model, rendered to HTML. Faked:
 * see `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";
import { C, find } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, B, NOTED, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, makeFacilitatorWeekWorld, reflection, tick } from "./lib/facilitatorWeekWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__courseworkSuite");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const pages = {
  tab: (await w.loadTs(join(PROGRAMME, "(tabs)", "coursework", "page.tsx"))).default,
  person: (await w.loadTs(join(PROGRAMME, "coursework", "[uid]", "page.tsx"))).default,
};
const model = await w.loadTs(join("lib", "courses", "coursework", "model.ts"));
const words = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));

const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3 as the suites about a group's week write it, with a written answer and two boxes in a fourth part. */
function weekThree() {
  return {
    weekNumber: 3,
    title: "The lamp makers",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: [
      ...weekOneBlocks("k3"),
      {
        id: "k3-p4",
        type: "part",
        title: "Your keeper's plan",
        time: "About 30 minutes",
        framing: [],
        blocks: [
          {
            id: "k3-wa",
            type: "writtenAnswer",
            prompt: [p(run("Who should keep the lamps lit, and why?"))],
            boxes: [],
            guidance: [],
            words: { min: 1, max: 200 },
            due: "dayBefore",
          },
          {
            id: "k3-fi",
            type: "fillIn",
            title: "My keeper's plan",
            groups: [{ heading: "My next step", boxes: [{ id: "k3-fb1", label: "" }, { id: "k3-fb2", label: "And after that" }] }],
          },
        ],
      },
    ],
  };
}

/** Week 1, the run's own, written as blocks: what somebody in no group yet reads. */
function weekOne() {
  return { ...weekThree(), weekNumber: 1, title: "The first lamps", blocks: weekOneBlocks("k1") };
}

/** A written answer as its routes store one. */
function answer(uid, { sent = null, feedback = null, text = `${uid} wrote a plan.` } = {}) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    submittedAt: sent,
    firstSentAt: sent,
    reviewStatus: "unreviewed",
    ...(feedback ? { feedback } : {}),
  };
}

/** A box as its route stores one. */
function box(uid, boxId, text) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, exerciseId: boxId, kind: "fillIn", responseType: "text", text, submittedAt: null, reviewStatus: "unreviewed" };
}

const SENT = new Date("2026-11-16T09:00:00Z");
const TARIQ_SAID = "Lamps were lit by hand, once.";
const FARAH_FEEDBACK = { levels: [{ row: "Argument", level: "Strong", descriptor: "Names a keeper and a reason." }], comment: "Clear and short.", byUid: "rahul", sentAt: new Date("2026-11-16T20:00:00Z") };

/** The world for this suite: Tariq holds a place in no group, with week 1 work; Group B's answers and boxes. */
function courseworkSeed() {
  const seed = facilitatorWeekSeed({
    [`courseRuns/${RUN.agi}/weeks/w03`]: weekThree(),
    [`courseRuns/${RUN.agi}/weeks/w01`]: weekOne(),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", { sent: SENT }),
    [`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`]: answer("farah", { sent: SENT, feedback: FARAH_FEEDBACK }),
    [`courseExerciseResponses/${RUN.agi}__kofi__w03__k3-wa`]: answer("kofi"),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-fb1`]: box("chloe", "k3-fb1", "Clean the lens on Sundays."),
    [`courseExerciseResponses/${RUN.agi}__tariq__w01__k1-rp1`]: { ...reflection("tariq", "k1-rp1", TARIQ_SAID, 1) },
    [`courseExerciseResponses/${RUN.agi}__tariq__w01__k1-rp2`]: { ...reflection("tariq", "k1-rp2", "The keepers, mostly.", 1) },
    [`courseProgress/${RUN.agi}__tariq__k1-s1`]: tick("tariq", "k1-s1", { weekNumber: 1 }),
  });
  // Tariq holds a place on the form and has no seat on the run yet.
  delete seed[`courseEnrolments/${RUN.agi}__tariq`];
  return seed;
}

const tab = (who, query = {}) => w.draw(pages.tab, who, { roundId: ROUND, programmeId: AGI }, query);
const person = (who, uid) => w.draw(pages.person, who, { roundId: ROUND, programmeId: AGI, uid });
const tableOf = (drawn) => find(drawn.element, "CourseworkTable")[0]?.props.view ?? null;
const personOf = (drawn) => find(drawn.element, "PersonCoursework")[0]?.props.view ?? null;

beforeEach(() => w.reset(courseworkSeed()));

const EVERYBODY = ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "isaac", "nobody", null];

/** What a page drew for `who`: drawn, a refusal by its words, or where it sent them. */
function outcomeOf(drawn, drawnBy) {
  if (drawn.to) return drawn.to;
  if (drawnBy(drawn)) return "drawn";
  if (/Only the programme’s lead and admins can open Coursework/.test(drawn.text)) return "not yours";
  if (/There is no programme here/.test(drawn.text)) return "no programme";
  if (/There’s no coursework to show here/.test(drawn.text)) return "not here";
  return drawn.text.slice(0, 80);
}

/** Every row of the tab, as section title, name and marks. */
const rowsOf = (view) => view.sections.flatMap((section) => section.rows.map((row) => [section.title, row.name, row.facilitating ? "facilitating" : row.notToldYet ? "not told" : ""]));
/** One row's cell for a week. */
const cellOf = (view, name, weekNumber) => view.sections.flatMap((section) => section.rows).find((row) => row.name === name)?.cells.find((cell) => cell.weekNumber === weekNumber);

const ALL_WORDS = [...Object.values(SAID).flatMap((said) => Object.values(said)), ...Object.values(NOTED).map(([, text]) => text), TARIQ_SAID, "Clean the lens on Sundays.", "chloe wrote a plan."];

describe("1. who opens what", () => {
  test("the tab: the programme's lead and an admin; a reviewer is told whose it is; another lead finds no programme; nothing writes", async () => {
    const seen = {};
    for (const who of EVERYBODY) {
      const drawn = await tab(who);
      seen[who ?? "signed out"] = outcomeOf(drawn, tableOf);
      assert.equal(drawn.wrote, false, `${who}'s tab wrote something`);
    }
    assert.deepEqual(seen, {
      rahul: "/dashboard",
      sofia: "/dashboard",
      zach: "drawn",
      claudia: "drawn",
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
  });

  test("a person's page: the same people; somebody with no place and no group is a calm not-here; nothing writes", async () => {
    const seen = {};
    for (const who of EVERYBODY) {
      const drawn = await person(who, "chloe");
      seen[who ?? "signed out"] = outcomeOf(drawn, personOf);
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(seen, {
      rahul: "/dashboard",
      sofia: "/dashboard",
      zach: "drawn",
      claudia: "drawn",
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
    // Isaac left, Omar was taken off, Nell applied to nothing, and an id that is nobody's: none of them is a row.
    for (const uid of ["isaac", "omar", "nobody", "no-such-person", "nina"]) {
      for (const who of ["claudia", "zach"]) assert.equal(outcomeOf(await person(who, uid), personOf), "not here", `${who} opens ${uid}'s page`);
    }
  });

  test("the tab sits in the programme's row after Attendance, a link for the lead and an admin, and not drawn for a reviewer", async () => {
    const ProgrammeTabs = (await w.loadTs(join("features", "applications", "editor", "ProgrammeTabs.tsx"))).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = (open) => renderToStaticMarkup(createElement(ProgrammeTabs, { base: PROGRAMME_PATH, applications: 3, groups: 4, canEdit: open, groupsOpen: open }));
    assert.match(html(true), new RegExp(`>Attendance</a><a href="${PROGRAMME_PATH}/coursework" class="tab ">Coursework</a><a href="${PROGRAMME_PATH}/messages"`));
    // A reviewer is drawn Applications alone, as a link: no Coursework, and no
    // tab that is not a link.
    assert.doesNotMatch(html(false), /Coursework/);
    assert.deepEqual([...html(false).matchAll(/<(a|span)\b[^>]*class="tab[ "]/g)].map((m) => m[1]), ["a"]);
    assert.match(html(false), new RegExp(`<a href="${PROGRAMME_PATH}/applications"[^>]*>Applications<`));
  });
});

describe("2. who is a row, and 3. a placement nobody has told", () => {
  test("an admin: every group in the run's order, then nobody's; facilitators marked; Una placed and not told; nobody who left", async () => {
    const view = tableOf(await tab("zach"));
    assert.deepEqual(rowsOf(view), [
      ["Group D", "Freya Thompson", ""],
      ["Group D", "Grace Okoye", "facilitating"],
      ["Group D", "Yasmin Farouk", ""],
      ["Group B", "Chloe Nguyen", ""],
      ["Group B", "Farah Hussain", ""],
      ["Group B", "Kofi Asante", ""],
      ["Group B", "Rahul Mehta", "facilitating"],
      ["Group B", "Sofia Rossi", "facilitating"],
      ["Group C", "Hamza Qureshi", ""],
      ["Group C", "Tom Fletcher", "facilitating"],
      ["Group C", "Una Byrne", "not told"],
      ["Group A", "Amara Okafor", ""],
      ["Group A", "Bea Lindqvist", ""],
      ["Group A", "Dev Patel", ""],
      ["Not in a group yet", "Tariq Mensah", ""],
    ]);
    assert.deepEqual(view.counts, { holding: 11, facilitating: 4, waiting: 1 });
    assert.deepEqual(view.columns.map((column) => [column.weekNumber, column.title]), [[1, "The first lamps"], [3, "The lamp makers"]]);
  });

  test("the lead: the same people, and Una, whom Publish has not told, is not in a group yet", async () => {
    const drawn = await tab("claudia");
    const view = tableOf(drawn);
    const rows = rowsOf(view);
    assert.deepEqual(rows.filter(([, name]) => name === "Una Byrne"), [["Not in a group yet", "Una Byrne", ""]]);
    assert.deepEqual(rows.filter(([section]) => section === "Group C").map(([, name]) => name), ["Hamza Qureshi", "Tom Fletcher"]);
    assert.doesNotMatch(drawn.text, /Not told yet/);
    assert.match(drawn.text, /Only you and admins can open Coursework\./);
    // Una's page says the same to the lead, and her group to an admin.
    assert.equal(personOf(await person("claudia", "una")).person.groupName, null);
    assert.match((await person("claudia", "una")).text, /AGI Strategy · Not in a group yet/);
    const asAdmin = personOf(await person("zach", "una"));
    assert.deepEqual([asAdmin.person.groupName, asAdmin.person.notToldYet], ["Group C", true]);
  });
});

describe("4. a cell", () => {
  test("counts and states from the week the person reads, never a word anybody wrote", async () => {
    for (const who of ["claudia", "zach"]) {
      const drawn = await tab(who);
      const view = tableOf(drawn);
      const written = (name) => `${PROGRAMME_PATH}/written?group=${B}&week=3&person=${name}`;
      const writtenInHtml = (name) => written(name).replace(/[?]/g, "\\?").replace(/&/g, "&amp;");
      assert.deepEqual(cellOf(view, "Chloe Nguyen", 3), {
        weekNumber: 3,
        counted: true,
        reflections: { written: 1, of: 3 },
        ticks: { ticked: 1, of: 2 },
        answer: { state: "waiting", href: written("chloe") },
        boxes: { filled: 1, of: 2 },
        href: `${PROGRAMME_PATH}/coursework/chloe#week-3`,
      });
      assert.deepEqual([cellOf(view, "Farah Hussain", 3).reflections, cellOf(view, "Farah Hussain", 3).answer.state], [{ written: 2, of: 3 }, "feedback"]);
      assert.equal(cellOf(view, "Kofi Asante", 3).answer.state, "started");
      // A facilitator's own work, counted on the group they facilitate, its answer on the lead's feedback page.
      assert.deepEqual([cellOf(view, "Rahul Mehta", 3).reflections, cellOf(view, "Rahul Mehta", 3).answer.href], [{ written: 1, of: 3 }, written("rahul")]);
      // Tariq is in no group: his week 1 work, on the run's own week 1, is counted, and his answer opens no feedback page.
      assert.deepEqual(cellOf(view, "Tariq Mensah", 1).reflections, { written: 1, of: 3 });
      assert.deepEqual(cellOf(view, "Tariq Mensah", 1).ticks, { ticked: 1, of: 2 });
      assert.equal(cellOf(view, "Tariq Mensah", 3).answer.href, null);
      // Never a word.
      const handed = JSON.stringify(view);
      for (const text of ALL_WORDS) assert.ok(!handed.includes(text) && !drawn.html.includes(text), `${who}'s tab holds "${text}"`);
      assert.match(drawn.html, new RegExp(`<a href="${writtenInHtml("chloe")}"[^>]*class="answer answerWaiting"[^>]*>Waiting for feedback</a>`));
    }
  });
});

describe("5. the filters", () => {
  test("a group, everybody in no group, and the waiting ones alone, as links", async () => {
    const names = async (query) => rowsOf(tableOf(await tab("zach", query))).map(([, name]) => name);
    assert.deepEqual(await names({ waiting: "1" }), ["Chloe Nguyen"]);
    assert.deepEqual(await names({ group: "none" }), ["Tariq Mensah"]);
    assert.deepEqual(await names({ group: A }), ["Amara Okafor", "Bea Lindqvist", "Dev Patel"]);
    assert.deepEqual(await names({ group: "no-such-group" }), (await names({})));
    assert.deepEqual(await names({ group: C, waiting: "1" }), []);
    assert.match((await tab("zach", { group: C, waiting: "1" })).text, /Nobody here matches that\./);
    const html = (await tab("claudia", { group: B })).html;
    assert.match(html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?group=${B}" class="filter filterOn" aria-current="page">Group B</a>`));
    assert.match(html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?group=${B}&amp;waiting=1" class="filter filterWaiting">Waiting for feedback</a>`));
    assert.match(html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework" class="filter">Everybody</a>`));
  });
});

describe("6. a person's page", () => {
  test("newest week first: reflections under their prompts with when, the answer and its feedback, boxes and ticks", async () => {
    const drawn = await person("claudia", "farah");
    const view = personOf(drawn);
    assert.deepEqual(view.weeks.map((week) => week.weekNumber), [3, 1]);
    assert.deepEqual(view.person, { uid: "farah", name: "Farah Hussain", facilitating: false, groupName: "Group B", notToldYet: false });
    assert.match(drawn.text, new RegExp(`How many lighthouses are still lit, do you think\\? ${SAID.farah["k3-rp1"]} Sun 15 Nov, 4:12pm`));
    assert.match(drawn.text, /Written answer Who should keep the lamps lit, and why\? Feedback sent 4 words Sent Mon 16 Nov, 9am farah wrote a plan\. Feedback from Rahul Mehta Mon 16 Nov, 8pm Argument ?: Strong \(Names a keeper and a reason\.\) Clear and short\. Open the feedback page/);
    assert.match(drawn.html, new RegExp(`href="${PROGRAMME_PATH}/written\\?group=${B}&amp;week=3&amp;person=farah"`));
    assert.match(drawn.text, /Sources · Ticked 2 of 2 Ticked A keeper's diary Ticked Lamps at night/);
    const chloe = await person("claudia", "chloe");
    assert.match(chloe.text, /Boxes My next step Clean the lens on Sundays\. My next step: And after that Not filled in yet\./);
    // Tariq, in no group: his week 1 reflections, and no feedback page to open.
    const tariq = await person("claudia", "tariq");
    assert.match(tariq.text, new RegExp(`Tariq Mensah AGI Strategy · Not in a group yet .*Week 1 · The first lamps Reflections Part 1: Start with what you think How many lighthouses are still lit, do you think\\? ${TARIQ_SAID}`));
    assert.doesNotMatch(tariq.html, /Open the feedback page/);
  });

  test("a private note: an admin reads it, the lead never; a facilitator's own note an admin's alone", async () => {
    const [chloeNote, rahulNote] = [NOTED.chloe[1], NOTED.rahul[1]];
    const asLead = await person("claudia", "chloe");
    assert.ok(!asLead.html.includes(chloeNote) && !JSON.stringify(asLead.element).includes(chloeNote), "the lead reads Chloe's private note");
    assert.equal(personOf(asLead).notesShown, false);
    assert.doesNotMatch(asLead.text, /Private note/);
    const asAdmin = await person("zach", "chloe");
    assert.match(asAdmin.text, new RegExp(`Ticked A keeper's diary Private note ${chloeNote}`));
    assert.match(asAdmin.text, /Private notes are shown here to admins only\. The programme’s lead never sees them\./);
    // Rahul facilitates: his own note is an admin's alone.
    assert.ok(!(await person("claudia", "rahul")).html.includes(rahulNote), "the lead reads a facilitator's own private note");
    assert.ok((await person("zach", "rahul")).html.includes(rahulNote), "an admin is not shown a facilitator's own private note");
    // Nobody else's note on anybody's page.
    for (const [uid, [, text]] of Object.entries(NOTED)) if (uid !== "chloe") assert.ok(!asAdmin.html.includes(text), `Chloe's page shows ${uid}'s note`);
  });

  test("a facilitator's own page is marked, and the column for notes about a person is drawn only when handed something", async () => {
    const drawn = await person("claudia", "rahul");
    assert.deepEqual([personOf(drawn).person.facilitating, personOf(drawn).person.groupName], [true, "Group B"]);
    assert.match(drawn.text, /Rahul Mehta AGI Strategy · Group B Facilitator/);
    // The lead is handed the column with the notes kept for leads (section 9), so it is drawn;
    // handed nothing, the same page draws no column at all.
    const page = find(drawn.element, "PersonCoursework")[0];
    assert.equal(page.props.beside.props.viewer, "lead");
    assert.match(drawn.html, /<aside/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(page.type, { ...page.props, beside: null })), /<aside/);
  });
});

describe("7. the model", () => {
  test("an answer's state as a cell says it, the filter as the address reads it, and a cell of a week with nothing to count", () => {
    assert.deepEqual(["not-started", "draft", "sent", "opened", "feedback"].map(model.cellAnswerState), ["not-started", "started", "waiting", "waiting", "feedback"]);
    assert.deepEqual(model.readFilter({ group: "g1", waiting: "1" }, ["g1"]), { group: "g1", waiting: true });
    assert.deepEqual(model.readFilter({ group: "nope" }, ["g1"]), { group: "all", waiting: false });
    assert.deepEqual(model.readFilter({ group: "none" }, []), { group: "none", waiting: false });
    assert.equal(model.filterHref("/c", { group: "all", waiting: false }), "/c");
    assert.equal(model.filterHref("/c", { group: "none", waiting: true }), "/c?group=none&waiting=1");
    assert.deepEqual(model.cellOf(null, 2, model.NO_WORK, { person: "/p", written: null }), {
      weekNumber: 2,
      counted: false,
      reflections: null,
      ticks: null,
      answer: null,
      boxes: null,
      href: "/p#week-2",
    });
  });

  test("sections: groups in the order given, people by name, nobody's last, empty sections left out, the filter applied", () => {
    const people = [
      { uid: "z", name: "Zed", facilitating: false, groupId: "g2", readsGroupId: "g2", notToldYet: false },
      { uid: "a", name: "Ana", facilitating: false, groupId: "g2", readsGroupId: "g2", notToldYet: false },
      { uid: "n", name: "Nia", facilitating: false, groupId: null, readsGroupId: null, notToldYet: false },
      { uid: "f", name: "Fay", facilitating: true, groupId: "g1", readsGroupId: "g1", notToldYet: false },
    ];
    const week = { weekNumber: 1, title: "", parts: [], sources: [], answer: { id: "wa", prompt: "", boxes: [] }, boxes: [] };
    const sections = (filter) =>
      model.courseworkSections({
        columns: [{ weekNumber: 1 }],
        groups: [{ id: "g1", name: "One" }, { id: "g2", name: "Two" }, { id: "g3", name: "Three" }],
        people,
        workOf: (uid) => (uid === "a" ? { ...model.NO_WORK, answers: new Map([["1 wa", "sent"]]) } : model.NO_WORK),
        weekOf: () => week,
        personHref: (uid) => `/p/${uid}`,
        writtenHref: () => null,
        filter,
        notInAGroupTitle: "Nobody's",
      }).map((section) => [section.title, section.rows.map((row) => row.name)]);
    assert.deepEqual(sections({ group: "all", waiting: false }), [["One", ["Fay"]], ["Two", ["Ana", "Zed"]], ["Nobody's", ["Nia"]]]);
    assert.deepEqual(sections({ group: "all", waiting: true }), [["Two", ["Ana"]]]);
    assert.deepEqual(sections({ group: "none", waiting: false }), [["Nobody's", ["Nia"]]]);
  });

  test("the words", () => {
    assert.equal(words.courseworkSummaryWords(28, 4, 3), "28 holding a place · 4 facilitating · 3 waiting for feedback");
    assert.equal(words.courseworkSummaryWords(5, 0, 0), "5 holding a place · 0 waiting for feedback");
    assert.equal(words.reflectionsCellWords(2, 3), "Reflections 2 of 3");
    assert.equal(words.answerLinkLabelWords("Chloe Nguyen", 3, "waiting"), "Week 3 written answer, Waiting for feedback: Chloe Nguyen");
    assert.equal(words.courseworkWhoLine({ firstName: "Claudia", isReader: false }), "Only Claudia and admins can open Coursework. Open a name to read everything that person wrote.");
  });
});

describe("9. Claude, Pangram and the notes the team keeps", () => {
  const COURSEWORK_PATH = `${PROGRAMME_PATH}/coursework`;
  const panelsOf = (drawn) => find(drawn.element, "CourseworkWeekPanels")[0] ?? null;
  /** What the panels under the table draw, one level down: the client panels and their props. */
  const insideOf = (panels) => panels.type(panels.props);

  test("the tab: under the table, the latest week written in, or the one the address asks for; best answers and Pangram for an admin alone, and the lead is drawn neither", async () => {
    // Privacy v15: what Claude returns is seen by admins only, so the lead
    // reads the table and is handed no panel under it, on any week.
    for (const query of [{}, { week: "1" }, { group: B, week: "3" }]) {
      const asLead = await tab("claudia", query);
      assert.equal(find(asLead.element, "CourseworkTable").length, 1, "the lead lost the table");
      assert.equal(panelsOf(asLead), null, `the lead is handed the panels under the table (${JSON.stringify(query)})`);
      assert.equal(find(asLead.element, "BestAnswersPanel").length, 0, "the lead is handed Claude's best answers");
      assert.doesNotMatch(asLead.text, /Best answers/, "the lead's tab shows Claude's best answers");
      assert.doesNotMatch(asLead.html, /Pangram/, "the lead's tab names Pangram");
    }

    const asAdmin = await tab("zach", { group: B, week: "1" });
    const adminPanels = panelsOf(asAdmin);
    assert.deepEqual(adminPanels.props.week, { weekNumber: 1, asked: true });
    // The panels draw nothing for anybody but an admin, whoever hands them one.
    assert.equal(adminPanels.type({ ...adminPanels.props, viewer: "lead" }), null, "the panels draw for a lead");
    const adminInside = insideOf(adminPanels);
    assert.deepEqual(find(adminInside, "BestAnswersPanel").map((panel) => panel.props.weekId), ["w01"]);
    const pangram = find(adminInside, "PangramWeek");
    assert.deepEqual(pangram.map((panel) => [panel.props.weekId, panel.props.personBase]), [["w01", COURSEWORK_PATH]]);
    // Every row's name, whatever the filter: Tariq is in no group and still named.
    assert.equal(pangram[0].props.names.tariq, "Tariq Mensah");
    assert.equal(pangram[0].props.names.chloe, "Chloe Nguyen");
    assert.match(asAdmin.text, /Pangram/);
    // A filter keeps the week the address chose, and a week keeps the filter.
    assert.match(asAdmin.html, new RegExp(`<a href="${COURSEWORK_PATH}\\?group=${B}&amp;week=1" class="filter filterOn" aria-current="page">Group B</a>`));
    assert.match(asAdmin.html, new RegExp(`<a href="${COURSEWORK_PATH}\\?group=${B}&amp;week=3" class="filter">Week 3</a>`));
    assert.match(asAdmin.html, new RegExp(`<a href="${COURSEWORK_PATH}\\?group=${B}&amp;week=1" class="filter filterOn" aria-current="page">Week 1</a>`));
    // A week the tab has no column for is the latest written in, and the filters carry no week.
    const unknown = await tab("zach", { week: "9" });
    assert.deepEqual(panelsOf(unknown).props.week, { weekNumber: 3, asked: false });
    assert.match(unknown.html, new RegExp(`<a href="${COURSEWORK_PATH}\\?waiting=1" class="filter filterWaiting">Waiting for feedback</a>`));
  });

  test("a person's page: beside the weeks an admin has notes from this run, Claude's draft and Pangram; the lead has the notes kept for leads alone", async () => {
    for (const uid of ["chloe", "tariq", "rahul"]) {
      const asLead = await person("claudia", uid);
      const beside = find(asLead.element, "PersonCoursework")[0].props.beside;
      assert.equal(beside.type.name, "PersonBeside", `the lead's column beside ${uid}'s weeks`);
      assert.equal(beside.props.viewer, "lead");
      const inside = beside.type(beside.props);
      // The notes, through the programme's own route, with no Claude: never the admins' route or its draft.
      assert.deepEqual(
        find(inside, "PersonNotes").map((notes) => [notes.props.uid, notes.props.place, notes.props.lead, notes.props.draft]),
        [[uid, { run: RUN.agi }, { roundId: ROUND, programmeId: AGI }, undefined]],
      );
      assert.equal(find(inside, "PangramPanel").length, 0, `the lead is handed Pangram beside ${uid}'s weeks`);
      assert.match(asLead.html, /<aside/);
      assert.match(asLead.text, /Notes about /);
      assert.doesNotMatch(asLead.html, /Draft a note|Pangram|\/api\/admin\/members/, `the lead's page for ${uid}`);
    }
    const asAdmin = await person("zach", "chloe");
    const beside = find(asAdmin.element, "PersonCoursework")[0].props.beside;
    assert.equal(beside.type.name, "PersonBeside");
    assert.deepEqual(beside.props, { roundId: ROUND, programmeId: AGI, runId: RUN.agi, uid: "chloe", name: "Chloe Nguyen", viewer: "admin", self: false });
    const inside = beside.type(beside.props);
    assert.deepEqual(
      find(inside, "PersonNotes").map((notes) => [notes.props.uid, notes.props.place, notes.props.draft, notes.props.lead]),
      [["chloe", { run: RUN.agi }, "run", undefined]],
    );
    assert.deepEqual(find(inside, "PangramPanel").map((panel) => [panel.props.roundId, panel.props.programmeId, panel.props.uid]), [[ROUND, AGI, "chloe"]]);
    assert.match(asAdmin.html, /<aside/);
    assert.match(asAdmin.text, /Notes about Chloe Nguyen/);
    assert.match(asAdmin.text, /Pangram/);
    // An admin's own page carries no notes about them, as their profile does not.
    const own = beside.type({ ...beside.props, self: true });
    assert.equal(find(own, "PersonNotes").length, 0);
    assert.equal(find(own, "PangramPanel").length, 1);
    // Nor does a lead's: nothing at all is drawn beside a lead's own weeks.
    assert.equal(beside.type({ ...beside.props, viewer: "lead", self: true }), null);
  });

  test("the model: a week from the address only when it is a column, else the latest written in, else the first", () => {
    const columns = [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 4 }];
    const cell = (weekNumber, marks = {}) => ({ weekNumber, counted: true, reflections: null, ticks: null, answer: null, boxes: null, href: "", ...marks });
    const sections = (cells) => [{ key: "g", title: "G", rows: [{ uid: "a", name: "A", cells }] }];
    assert.deepEqual(model.chosenWeek({ week: "2" }, columns, []), { weekNumber: 2, asked: true });
    assert.deepEqual(model.chosenWeek({ week: "3" }, columns, []), { weekNumber: 1, asked: false });
    assert.deepEqual(model.chosenWeek({ week: ["2"] }, columns, []), { weekNumber: 1, asked: false });
    assert.deepEqual(model.chosenWeek({}, columns, sections([cell(2, { reflections: { written: 1, of: 3 } }), cell(4, { ticks: { ticked: 2, of: 2 } })])), { weekNumber: 2, asked: false });
    assert.deepEqual(model.chosenWeek({}, columns, sections([cell(1, { boxes: { filled: 1, of: 2 } }), cell(4, { answer: { state: "started", href: null } })])), { weekNumber: 4, asked: false });
    assert.deepEqual(model.chosenWeek({}, columns, sections([cell(4, { answer: { state: "not-started", href: null } })])), { weekNumber: 1, asked: false });
    assert.equal(model.chosenWeek({ week: "1" }, [], []), null);
    assert.equal(model.filterHref("/c", { group: "g1", waiting: true }, 3), "/c?group=g1&waiting=1&week=3");
    assert.equal(model.filterHref("/c", { group: "all", waiting: false }, 2), "/c?week=2");
  });
});

describe("8. the tree", () => {
  test("each page gates before it reads, and every read waits for the programme's own gate", () => {
    for (const [page, loader] of [
      [`app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework/page.tsx`, "loadCourseworkTab("],
      [`app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/page.tsx`, "loadPersonCoursework("],
    ]) {
      const code = codeOf(page);
      assert.match(code, /requireAdmissionsPage\(\)/, page);
      assert.ok(code.includes(loader), `${page} does not call ${loader}`);
      assert.doesNotMatch(code, /\.collection\(/, `${page} reads the store itself`);
    }
    const load = codeOf("lib/courses/coursework/load.ts");
    for (const name of ["loadCourseworkTab", "loadPersonCoursework"]) {
      const body = load.slice(load.indexOf(`export async function ${name}(`));
      const gate = body.indexOf("const gate = await openCoursework(db, actor, roundId, programmeId);");
      const refused = body.indexOf('if (gate.status !== "ok") return gate;');
      const firstRead = Math.min(...["listPlaceHolders(", "readRunCoursework(", ".collection("].map((needle) => body.indexOf(needle)).filter((at) => at !== -1));
      assert.ok(gate !== -1 && refused > gate && firstRead > refused, `${name} reads before its gate`);
    }
    assert.match(load, /const outcome = await loadProgrammeRun\(db, actor, roundId, programmeId\);/);
    // Never a survey, never a note on the tab, and no word leaves for the tab.
    assert.doesNotMatch(load, /survey/i);
    assert.match(load, /readRunCoursework\(db, run\.id, null\)/);
    assert.equal((load.match(/readPersonPrivateNotes\(/g) ?? []).length, 1, "private notes are read anywhere but a person's page");
  });

  test("no dash of either kind, and no word the house does not use, in any file of this piece", () => {
    for (const file of [
      "lib/courses/coursework/model.ts",
      "lib/courses/coursework/words.ts",
      "lib/courses/coursework/load.ts",
      "features/courses/coursework/CourseworkTable.tsx",
      "features/courses/coursework/PersonCoursework.tsx",
      "features/courses/coursework/coursework.module.css",
      "features/courses/courseworkClaude/CourseworkWeekPanels.tsx",
      "features/courses/courseworkClaude/PersonBeside.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/page.tsx",
    ]) {
      const source = readFileSync(join(SRC, file), "utf8");
      assert.doesNotMatch(source, /[\u2013\u2014]/, `${file} carries a dash`);
      assert.doesNotMatch(source, /\bcollate\b|\bwaitlist\b|\brejected\b|dropped out/i, file);
    }
    assert.match(readFileSync(join(SRC, "features/courses/coursework/coursework.module.css"), "utf8"), /@media \(max-width: 48rem\) \{[^]*\}\s*$/);
  });
});
