/**
 * One question, the whole group, and when an answer was first read (Fri 13
 * Nov 2026): the page that puts one question of a week in front of its reader
 * with every person of one group's answer to it, reached from the programme's
 * side (`.../programmes/[programmeId]/question?group=`) and the group's
 * (`/learn/[runId]/group/[groupId]/question`), one loader behind both
 * (`src/lib/courses/coursework/questionLoad.ts`); and the time each answer
 * was first put in front of somebody on the team who may read it, kept by
 * `POST /api/courses/runs/[runId]/first-read` and never who.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS THE PAGE, on either side, and WHOSE ANSWERS each reader is
 *     sent: a facilitator never a co-facilitator's own answer or a rating, the
 *     lead and admins a facilitator's own, nobody their own; a facilitator of
 *     another group, a track lead with no other role and a member are refused,
 *     somebody signed out sent to sign in. Drawing it writes nothing.
 *  2. WHAT A ROW SAYS: the answer in full, when, Late, an answer not sent, the
 *     two states apart ("Not read yet"; "No feedback yet", "Feedback given",
 *     "Changed since feedback"), the way to the person's week, and previous
 *     and next through the week's questions in its own order.
 *  3. THE ROUTE, as every kind of caller: who may mark what; nothing kept for
 *     an answer the caller may not read in full; a second call moves nothing;
 *     a view-as session and the person's own call are refused; it answers ok
 *     and nothing else. And the page as it stood: "Not read yet" until the
 *     next reader arrives.
 *  4. FEEDBACK WRITTEN FROM THE PAGE is read back, and the filters follow it.
 *  5. THE SWITCH between the two ways of reading, on both, landing on the
 *     same week and the same person or question.
 *  6. THE MEMBER'S SIDE: nothing the person whose answer it is is sent names a
 *     read time, held by what their own routes answer and by the tree (every
 *     page and route that can reach the store of the times is listed).
 *  7. THE FILTERS AND COUNTS as pure functions, every combination, the two
 *     states independent of each other.
 *  8. THE WORDS the browser spec reads, as the product says them.
 *
 * Real: both pages, both reading views, the loaders, the first-read and
 * feedback routes, the member's own routes, rendered to HTML. Faked: see
 * `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { importersOf } from "./lib/clientGraph.mjs";
import { find } from "./lib/facilitatorPagesWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { AGI, B, NOTED, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, makeFacilitatorWeekWorld, reflection as reflectionRow } from "./lib/facilitatorWeekWorld.mjs";
import { enrolment } from "./lib/hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__questionViewSuite");
const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const pages = {
  group: (await w.loadTs(join(GROUP, "question", "page.tsx"))).default,
  programme: (await w.loadTs(join(PROGRAMME, "question", "page.tsx"))).default,
  groupWeek: (await w.loadTs(join(GROUP, "coursework", "[uid]", "page.tsx"))).default,
  programmeWeek: (await w.loadTs(join(PROGRAMME, "coursework", "[uid]", "page.tsx"))).default,
};
const question = await w.loadTs(join("lib", "courses", "coursework", "question.ts"));
const words = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));
const weekWorkStore = await w.loadTs(join("lib", "firestore", "courseWeekWork.ts"));
const routes = {
  firstRead: await w.courseRoute("runs", "[runId]", "first-read"),
  feedback: await w.courseRoute("runs", "[runId]", "feedback"),
  overview: await w.courseRoute("runs", "[runId]", "overview"),
  myExercises: await w.courseRoute("runs", "[runId]", "my-exercises"),
  reflection: await w.courseRoute("runs", "[runId]", "reflections", "[promptId]"),
  written: await w.courseRoute("runs", "[runId]", "written-answers", "[answerId]"),
  ratings: await w.courseRoute("runs", "[runId]", "work-ratings"),
};

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3, as the reading view's suite writes it: week 1's shape, then a written answer and two boxes in a fourth part. */
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
          { id: "k3-wa", type: "writtenAnswer", prompt: [p(run("Who should keep the lamps lit, and why?"))], boxes: [], guidance: [], words: { min: 1, max: 200 }, due: "dayBefore" },
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

const SENT = new Date("2026-11-16T09:00:00Z");
/** When this world's site began keeping read times, and the one document that says so. */
const KEPT_SINCE = new Date("2026-11-13T00:00:00Z");
const KEPT_DOC = "config/firstReadTimes";
const CHLOE_ANSWER = "Keepers should, because they know the lamps.";
const RAHUL_ANSWER = "The town, through the harbour board.";
const SOFIA_ANSWER = "Whoever the ships pay.";
const FARAH_DRAFT = "A draft she has not sent.";
const CHLOE_BOX = "Visit the harbour master.";

/** A written answer as its routes store one: sent unless `sent` is null. */
function answer(uid, text, { sent = SENT, saved = SENT, earlier = [] } = {}) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    ...(sent ? { submittedAt: sent, firstSentAt: sent, sentAt: sent } : {}),
    updatedAt: saved,
    reviewStatus: "unreviewed",
    ...(earlier.length > 0 ? { earlierVersions: earlier } : {}),
  };
}

/** A fill-in box as its route stores one. */
function box(uid, boxId, text, at = new Date("2026-11-15T16:12:00Z")) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, exerciseId: boxId, kind: "fillIn", responseType: "text", text, submittedAt: null, reviewStatus: "unreviewed", updatedAt: at };
}

function seed() {
  return facilitatorWeekSeed({
    [`courseRuns/${RUN.agi}/weeks/w03`]: weekThree(),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", CHLOE_ANSWER),
    [`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-wa`]: answer("rahul", RAHUL_ANSWER),
    [`courseExerciseResponses/${RUN.agi}__sofia__w03__k3-wa`]: answer("sofia", SOFIA_ANSWER),
    // Farah started hers and never sent it: before Group B's session tonight nobody may read it.
    [`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`]: answer("farah", FARAH_DRAFT, { sent: null, saved: new Date("2026-11-16T20:00:00Z") }),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-fb1`]: box("chloe", "k3-fb1", CHLOE_BOX),
    // The site began keeping read times at the start of Fri 13 Nov.
    [KEPT_DOC]: { keptSince: KEPT_SINCE },
  });
}

beforeEach(() => w.reset(seed()));

/** The world on a database where the site has not begun keeping read times. */
function seedWithoutTheInstant() {
  const out = seed();
  delete out[KEPT_DOC];
  return out;
}

const RUN_HOME = `/learn/${RUN.agi}`;
const GROUP_PATH = `${RUN_HOME}/group/${B}`;
const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

const groupPage = (who, query = {}, { groupId = B } = {}) => w.draw(pages.group, who, { runId: RUN.agi, groupId }, query);
const programmePage = (who, query = {}) => w.draw(pages.programme, who, { roundId: ROUND, programmeId: AGI }, { group: B, ...query });
const viewOf = (drawn) => find(drawn.element, "QuestionView")[0]?.props.view ?? null;
const readingOf = (drawn) => find(drawn.element, "ReadingView")[0]?.props.view ?? null;
const uidsOf = (view) => view.rows.map((row) => row.uid);
const rowOf = (view, uid) => view.rows.find((row) => row.uid === uid) ?? null;
const weekWork = (uid) => w.world.db.read(`courseWeekWork/${RUN.agi}__${uid}__w03`) ?? null;
const readAt = (uid) => weekWork(uid)?.firstReadAt ?? {};
const mark = (who, people, options = {}) => w.call(who, routes.firstRead.POST, { runId: RUN.agi }, { body: { weekId: "w03", people }, course: true, ...options });

/** The page as `who` draws it, after asserting the drawing wrote nothing. */
async function drawn(who, query, side = "group") {
  const out = side === "group" ? await groupPage(who, query) : await programmePage(who, query);
  assert.equal(out.wrote, false, `${who} drawing the ${side} side's page wrote something`);
  return out;
}

describe("1. who opens the page, and whose answers each reader is sent", () => {
  test("the group's side: its facilitators, the lead and an admin; nobody else, and signed out to sign in", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "rahul", "sofia", "tom", "yusuf", "chloe", "amara", "nobody", null]) {
      const out = await drawn(who, { week: "3" });
      seen[who ?? "signed out"] = out.to ?? (viewOf(out) ? "drawn" : out.text.slice(0, 60));
    }
    assert.deepEqual(seen, {
      zach: "drawn",
      claudia: "drawn",
      rahul: "drawn",
      sofia: "drawn",
      // Facilitates Group C: the page's own gate, on Group B's address.
      tom: RUN_HOME,
      // The run's track lead and nothing else: no reader of work.
      yusuf: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the programme's side: the lead and an admin; a reviewer is told it is theirs, a facilitator sent away", async () => {
    for (const who of ["zach", "claudia"]) assert.ok(viewOf(await drawn(who, { week: "3" }, "programme")), `${who} is not drawn the page`);
    const reviewer = await drawn("lloyd", { week: "3" }, "programme");
    assert.equal(viewOf(reviewer), null);
    assert.match(reviewer.text, /Coursework/);
    for (const who of ["rahul", "chloe"]) {
      const out = await drawn(who, { week: "3" }, "programme");
      assert.equal(viewOf(out), null, `${who} is drawn the programme's page`);
    }
  });

  test("whose answers: a facilitator their fellows, never a co-facilitator's own; the lead and an admin the facilitators' own too", async () => {
    const lists = {};
    for (const who of ["rahul", "sofia", "claudia", "zach"]) lists[who] = uidsOf(viewOf(await drawn(who, { week: "3", question: "k3-wa" })));
    assert.deepEqual(lists.rahul, ["chloe", "farah", "kofi"]);
    assert.deepEqual(lists.sofia, ["chloe", "farah", "kofi"]);
    // The group's order: by the name each is shown.
    assert.deepEqual(lists.claudia, ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual(lists.zach, ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual(uidsOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }, "programme"))), lists.claudia);
    // Nothing of a facilitator's own answer reaches a facilitator, in any form.
    for (const who of ["rahul", "sofia"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      for (const words of [RAHUL_ANSWER, SOFIA_ANSWER]) assert.ok(!out.html.includes(words) && !JSON.stringify(viewOf(out)).includes(words), `${who} is sent ${words}`);
    }
  });

  test("nobody is sent their own answer: the lead's and an admin's places in the group", async () => {
    for (const uid of ["claudia", "zach"]) {
      w.world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, B));
      w.world.db.seed(`courseExerciseResponses/${RUN.agi}__${uid}__w03__k3-wa`, answer(uid, `${uid} would keep the lamps.`));
    }
    const asLead = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.ok(!uidsOf(asLead).includes("claudia"), "the lead is sent her own answer");
    assert.ok(uidsOf(asLead).includes("zach"));
    const asAdmin = viewOf(await drawn("zach", { week: "3", question: "k3-wa" }));
    assert.ok(!uidsOf(asAdmin).includes("zach"), "an admin is sent their own answer");
    assert.ok(uidsOf(asAdmin).includes("claudia"));
  });

  test("ratings for the team: an admin and the lead, never a facilitator", async () => {
    for (const who of ["rahul", "sofia"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      assert.deepEqual(viewOf(out).rows.map((row) => row.team), viewOf(out).rows.map(() => null), `${who} is sent ratings`);
      assert.doesNotMatch(out.html, /Rating for the team|What the team said/);
    }
    for (const who of ["claudia", "zach"]) {
      const view = viewOf(await drawn(who, { week: "3", question: "k3-wa" }));
      assert.equal(rowOf(view, "chloe").team?.itemId, "k3-wa", `${who} is not sent the team's ratings`);
      // Farah's draft cannot be read yet, so it cannot be rated either.
      assert.equal(rowOf(view, "farah").team, null);
    }
  });

  test("a fill-in box: only the people the boxes' own gate admits, and the box's words", async () => {
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-fb1" }));
    assert.equal(view.question.kind, "box");
    assert.equal(rowOf(view, "chloe").answer.text, CHLOE_BOX);
    assert.deepEqual(uidsOf(view), ["chloe", "farah", "kofi"]);
    // A box takes no feedback of its own: neither its state nor its filter is drawn.
    assert.equal(view.takesFeedback, false);
    assert.deepEqual(view.rows.map((row) => row.feedback), [null, null, null]);
  });
});

describe("1b. an archived group, behind its door, reads for an admin exactly as its own pages read it", () => {
  // The group's reflections with names, which this page replaced, showed an admin its fellows' reflections under
  // their names, in the weeks the group taught, and nothing else of theirs; no page opened a fellow's week. The lead
  // read only its facilitators' own work here; everybody else was sent away.
  const archive = (over = {}) => w.world.db.poke(`courseGroups/${B}`, { archived: true, ...over });
  const weekOf = (who, uid, week = "3") => w.draw(pages.groupWeek, who, { runId: RUN.agi, groupId: B, uid }, { week });
  const FELLOWS = ["chloe", "farah", "kofi"];
  /** A week written as blocks in week 3's shape, its ids prefixed `k<n>`: reflections, readings, a written answer and a box. */
  const blockWeek = (n) => {
    const three = weekThree();
    const k = `k${n}`;
    return JSON.parse(JSON.stringify({ ...three, weekNumber: n, title: `Week ${n}` }).replaceAll('"k3-', `"${k}-`));
  };
  const WEEK2_SAID = "Week two: the keepers went home early.";
  const WEEK4_ANSWER = "A begun answer for week four, never shown.";
  const WEEK4_BOX = "A begun box for week four, never shown.";
  /** Week 2, written as blocks, with Chloe's reflection, box, answer and private note in it. */
  function seedWeekTwo() {
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w02`, blockWeek(2));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w02__k2-rp1`, reflectionRow("chloe", "k2-rp1", WEEK2_SAID, 2));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w02__k2-fb1`, { ...box("chloe", "k2-fb1", "WEEK2 BOX"), weekId: "w02", weekNumber: 2 });
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w02__k2-wa`, { ...answer("chloe", "WEEK2 ANSWER sent"), weekId: "w02", weekNumber: 2, exerciseId: "k2-wa" });
    w.world.db.seed(`courseProgress/${RUN.agi}__chloe__k2-s1`, { runId: RUN.agi, uid: "chloe", weekNumber: 2, itemKind: "material", itemId: "k2-s1", completed: true, completedAt: SENT, hasPublicComment: false, updatedAt: SENT, privateNote: "WEEK2 NOTE" });
  }
  /** Everything of a fellow's that no page of the archived group showed an admin, and their told state. */
  const NEVER = [CHLOE_ANSWER, CHLOE_BOX, NOTED.chloe[1], NOTED.kofi[1], "WEEK2 BOX", "WEEK2 ANSWER", "WEEK2 NOTE", WEEK4_ANSWER, WEEK4_BOX];
  const holdsNone = (out, what) => {
    const payload = JSON.stringify(viewOf(out) ?? null);
    for (const words of NEVER) assert.ok(!out.html.includes(words) && !payload.includes(words), `${what}: an admin is handed ${words}`);
    assert.doesNotMatch(out.text, /Not told yet/, `${what}: a fellow is marked as not told`);
  };

  test("as an admin, a reflection in a week the group teaches: the fellows under their names, one with nothing written, and the facilitators' own as before", async () => {
    // Kofi was placed and never told: the reflections with names marked nobody, and neither does this page.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { allocatedEmailAt: null });
    archive();
    const out = await drawn("zach", { week: "3", first: "reflection" });
    const view = viewOf(out);
    assert.equal(view.question.id, "k3-rp1");
    assert.deepEqual(
      view.rows.map((row) => [row.uid, row.answer?.text ?? null]),
      [
        ["chloe", SAID.chloe["k3-rp1"]],
        ["farah", SAID.farah["k3-rp1"]],
        ["kofi", null],
        ["rahul", SAID.rahul["k3-rp1"]],
        ["sofia", SAID.sofia["k3-rp1"]],
      ],
    );
    // What the reflections with names drew of each: the name, the words, when it was saved, and nothing written.
    assert.match(out.text, /Chloe Nguyen Saved Sun 15 Nov, 4:12pm Forty lamps are still lit/);
    assert.match(out.text, /Kofi Asante Nothing written yet/);
    assert.ok(rowOf(view, "chloe").answer.savedAt instanceof Date);
    // Nothing else of theirs: no link to a week that would refuse, no told state, no read state, nothing named.
    for (const uid of FELLOWS) {
      const row = rowOf(view, uid);
      assert.deepEqual([row.weekHref, row.notToldYet, row.read, row.facilitating, row.joinedLate, row.mayWrite, row.team], [null, false, null, false, false, false, null], uid);
      assert.ok(!out.html.includes(`/coursework/${uid}`), `${uid}'s name leads to their week`);
    }
    assert.deepEqual(view.firstRead.people.map((person) => person.uid), ["rahul", "sofia"]);
    assert.equal(view.counts.unread, 2);
    // The facilitators' own work, as before, each leading to their week; the switch to one person's week lands on one.
    for (const uid of ["rahul", "sofia"]) assert.equal(rowOf(view, uid).weekHref, `${GROUP_PATH}/coursework/${uid}?week=3#q-k3-rp1`);
    assert.equal(view.nav.personWeek, `${GROUP_PATH}/coursework/rahul?week=3#q-k3-rp1`);
    holdsNone(out, "a reflection");
  });

  test("as an admin, a week the group does not teach, a fill-in box and the written answer: the facilitators' own alone", async () => {
    seedWeekTwo();
    // Group B's own plan leaves out week 2.
    const plan = w.world.db.read(`courseRuns/${RUN.agi}`).weekPlan.filter((entry) => !(entry.kind === "week" && entry.weekNumber === 2));
    archive({ paceWeekPlan: plan });
    const untaught = await drawn("zach", { week: "2", first: "reflection" });
    assert.equal(viewOf(untaught).weekNumber, 2);
    assert.ok(!uidsOf(viewOf(untaught)).some((uid) => FELLOWS.includes(uid)), "a fellow is listed in a week the group does not teach");
    assert.ok(!untaught.html.includes(WEEK2_SAID));
    holdsNone(untaught, "a week the group does not teach");
    for (const query of [{ week: "3", question: "k3-fb1" }, { week: "3", question: "k3-wa" }]) {
      const out = await drawn("zach", query);
      assert.deepEqual(uidsOf(viewOf(out)), ["rahul", "sofia"], JSON.stringify(query));
      holdsNone(out, JSON.stringify(query));
    }
  });

  test("as an admin, no fellow's week opens, the week the group page is on or another, as the reading view always refused them", async () => {
    seedWeekTwo();
    archive();
    for (const uid of FELLOWS) {
      for (const week of ["3", "2"]) {
        const out = await weekOf("zach", uid, week);
        assert.equal(out.to, RUN_HOME, `${uid}'s week ${week} opens`);
        assert.equal(readingOf(out), null);
      }
    }
    // The facilitators' own weeks open as before.
    for (const uid of ["rahul", "sofia"]) assert.equal((await weekOf("zach", uid)).to, null, uid);
  });

  test("as an admin, the week the page opens on by default is the same with and without a fellow's begun answer and box in a later week", async () => {
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w04`, blockWeek(4));
    archive();
    const before = viewOf(await drawn("zach", {}));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w04__k4-wa`, { ...answer("chloe", WEEK4_ANSWER, { sent: null }), weekId: "w04", weekNumber: 4, exerciseId: "k4-wa" });
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w04__k4-fb1`, { ...box("chloe", "k4-fb1", WEEK4_BOX), weekId: "w04", weekNumber: 4 });
    const after = await drawn("zach", {});
    assert.equal(viewOf(after).weekNumber, before.weekNumber, "a fellow's begun answer or box moves the week the page opens on");
    holdsNone(after, "the page opened with no week named");
    // On a live group, where everybody's work is the reader's to read, the same answer does move it, as it always did.
    w.world.db.poke(`courseGroups/${B}`, { archived: false });
    assert.equal(viewOf(await drawn("zach", {})).weekNumber, 4);
  });

  test("as the programme's lead: the facilitators' own work as before, never the fellows'", async () => {
    archive();
    for (const query of [{ week: "3", first: "reflection" }, { week: "3", question: "k3-wa" }, { week: "3", question: "k3-fb1" }]) {
      const out = await drawn("claudia", query);
      assert.deepEqual(uidsOf(viewOf(out)), ["rahul", "sofia"], JSON.stringify(query));
      for (const words of [SAID.chloe["k3-rp1"], CHLOE_ANSWER, CHLOE_BOX]) assert.ok(!out.html.includes(words), `the lead is shown ${words}`);
    }
    for (const uid of FELLOWS) assert.equal((await weekOf("claudia", uid)).to, RUN_HOME, `the lead opens ${uid}'s week`);
  });

  test("as its former facilitators, a fellow and anybody else: sent away, as its pages always sent them", async () => {
    archive();
    for (const who of ["rahul", "sofia", "chloe", "farah", "tom", "amara", "yusuf", "nobody"]) {
      assert.equal((await drawn(who, { week: "3", first: "reflection" })).to, RUN_HOME, who);
      assert.equal((await weekOf(who, "chloe")).to, RUN_HOME, who);
    }
  });

  test("a live group is unchanged: the admin's rows, their links, read states and what the page names", async () => {
    const reflection = viewOf(await drawn("zach", { week: "3", first: "reflection" }));
    assert.deepEqual(uidsOf(reflection), ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual(reflection.rows.filter((row) => row.facilitating).map((row) => row.uid), ["rahul", "sofia"]);
    assert.deepEqual(reflection.firstRead.people.map((person) => person.uid), ["chloe", "farah", "rahul", "sofia"]);
    assert.equal(rowOf(reflection, "chloe").read, "unread");
    assert.equal(rowOf(reflection, "chloe").weekHref, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-rp1`);
    const answerView = viewOf(await drawn("zach", { week: "3", question: "k3-wa" }));
    assert.deepEqual(uidsOf(answerView), ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual([rowOf(answerView, "chloe").answer.text, rowOf(answerView, "chloe").mayWrite, rowOf(answerView, "chloe").team?.itemId], [CHLOE_ANSWER, true, "k3-wa"]);
    assert.equal(readingOf(await weekOf("zach", "chloe")).week.answer.text, CHLOE_ANSWER);
  });

  test("the tree: an archived group's fellows are listed by the page of one question alone", () => {
    // The people `archivedGroupFellows` returns are people the one gate
    // refuses. They become rows in one place, a reflection in a week the
    // group taught, so a second caller would widen who is shown what.
    const naming = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (/\barchivedGroupFellows\b/.test(stripSource(readFileSync(file, "utf8")))) naming.push(rel);
    }
    assert.deepEqual(naming.sort(), ["lib/courses/coursework/questionLoad.ts", "lib/courses/coursework/readingLoad.ts"]);
    const calls = codeOf("lib/courses/coursework/questionLoad.ts").match(/\barchivedGroupFellows\s*\(/g) ?? [];
    assert.equal(calls.length, 1, "the page of one question asks for an archived group's fellows once");
  });
});

describe("2. what a row says", () => {
  test("the written answer before Group B's session: sent ones in full, a draft said to be not sent and not shown", async () => {
    const out = await drawn("rahul", { week: "3", question: "k3-wa" });
    const view = viewOf(out);
    assert.equal(view.question.text, "Who should keep the lamps lit, and why?");
    const chloe = rowOf(view, "chloe");
    assert.equal(chloe.answer.text, CHLOE_ANSWER);
    assert.deepEqual([chloe.read, chloe.feedback, chloe.late, chloe.notSent], ["unread", "none", false, false]);
    const farah = rowOf(view, "farah");
    assert.deepEqual([farah.answer, farah.read, farah.feedback, farah.notSent], [null, null, null, true]);
    assert.ok(!out.html.includes(FARAH_DRAFT), "a draft nobody may read yet is drawn");
    const kofi = rowOf(view, "kofi");
    assert.deepEqual([kofi.answer, kofi.read, kofi.feedback, kofi.notSent], [null, null, null, false]);
    // In words: each person, when it was sent, its two states, and the way to their week.
    assert.match(out.text, /Chloe Nguyen Sent Mon 16 Nov, 9am Not read yet No feedback yet Open Chloe’s week Keepers should, because they know the lamps\./);
    assert.match(out.text, /Farah \S+ Not sent yet Open Farah’s week/);
    assert.match(out.text, /Kofi \S+ Open Kofi’s week Nothing written yet/);
    assert.equal(chloe.weekHref, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-wa`);
    // The filters, each with its count of the people this reader may read.
    assert.deepEqual(view.counts, { everybody: 3, unread: 1, noFeedback: 1, late: 0 });
    assert.match(out.text, /Everybody 3 Not read yet 1 No feedback yet 1 Late 0/);
  });

  test("after the session the draft is read as it stands, said not sent; a reflection written after it is Late", async () => {
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rp1`, { updatedAt: new Date("2026-11-18T09:00:00Z") });
    w.at("2026-11-18T10:00:00Z");
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    const farah = rowOf(view, "farah");
    assert.equal(farah.answer.text, FARAH_DRAFT);
    assert.deepEqual([farah.notSent, farah.read, farah.feedback], [true, "unread", "none"]);
    const reflection = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.equal(rowOf(reflection, "chloe").answer.text, SAID.chloe["k3-rp1"]);
    assert.equal(rowOf(reflection, "chloe").late, true);
    assert.equal(rowOf(reflection, "farah").late, false);
    assert.equal(reflection.counts.late, 1);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", late: "1" }))), ["chloe"]);
  });

  test("previous and next step through the week's questions in its own order, keeping the filter", async () => {
    const order = [];
    let at = viewOf(await drawn("claudia", { week: "3" }));
    for (;;) {
      order.push(at.question.id);
      if (!at.nav.nextQuestion) break;
      const next = new URL(at.nav.nextQuestion.href, "https://naisi.invalid");
      at = viewOf(await drawn("claudia", Object.fromEntries(next.searchParams)));
    }
    assert.deepEqual(order, ["k3-rp1", "k3-rp2", "k3-rp3", "k3-rp4", "k3-rp5", "k3-rp6", "k3-wa", "k3-fb1", "k3-fb2"]);
    const filtered = viewOf(await drawn("claudia", { week: "3", question: "k3-wa", unread: "1" }));
    assert.equal(filtered.nav.previousQuestion.href, `${GROUP_PATH}/question?week=3&question=k3-rp6&unread=1`);
    assert.equal(filtered.nav.nextQuestion.href, `${GROUP_PATH}/question?week=3&question=k3-fb1&unread=1`);
    // A question the week does not ask opens its first.
    assert.equal(viewOf(await drawn("claudia", { week: "3", question: "nope" })).question.id, "k3-rp1");
  });

  test("an answer changed since feedback: said on the row, with the way to both versions on the person's week", async () => {
    const T1 = SENT;
    const T2 = new Date("2026-11-18T09:00:00Z");
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", "Keepers should. The town pays.", { sent: T1, saved: T2, earlier: [{ text: CHLOE_ANSWER, words: 7, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] }),
    );
    w.world.db.seed("courseFeedback/piece-one", {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "What about the fog?",
      aboutSavedAt: T1,
      byUid: "rahul",
      byRole: "facilitator",
      createdAt: new Date("2026-11-17T09:00:00Z"),
    });
    w.at("2026-11-18T10:00:00Z");
    const out = await drawn("claudia", { week: "3", question: "k3-wa" });
    const chloe = rowOf(viewOf(out), "chloe");
    assert.equal(chloe.feedback, "changed");
    // Feedback on it says somebody on the team opened it: read, with no time kept.
    assert.match(out.text, /Chloe Nguyen Sent Mon 16 Nov, 9am Changed since feedback Open Chloe’s week/);
    assert.equal(chloe.read, "read");
    assert.match(out.html, new RegExp(`<a href="${GROUP_PATH}/coursework/chloe\\?week=3#q-k3-wa" class="reviewLink">See what changed</a>`));
    // The piece says who wrote it and when, with the version it was about under it, as on the review page.
    assert.match(out.text, /Feedback from Rahul Chloe’s facilitator · Tue 17 Nov What about the fog\?/);
    // Changed since feedback is not "no feedback yet".
    assert.ok(!uidsOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa", nofeedback: "1" }))).includes("chloe"));
  });
});

describe("2b. changed since feedback: the newest piece alone decides", () => {
  test("Chloe sends v1, Rahul's feedback on it, she changes it to v2, the lead's feedback on v2: the row has feedback, not a change", async () => {
    const T1 = SENT;
    const T2 = new Date("2026-11-18T09:00:00Z");
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", "Keepers should. The town pays.", { sent: T1, saved: T2, earlier: [{ text: CHLOE_ANSWER, words: 7, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] }),
    );
    const piece = (id, byUid, byRole, aboutSavedAt, createdAt, text) =>
      w.world.db.seed(`courseFeedback/${id}`, {
        runId: RUN.agi,
        uid: "chloe",
        weekId: "w03",
        weekNumber: 3,
        on: { kind: "writtenAnswer", itemId: "k3-wa" },
        text,
        aboutSavedAt,
        byUid,
        byRole,
        createdAt,
      });
    piece("piece-a", "rahul", "facilitator", T1, new Date("2026-11-17T09:00:00Z"), "What about the fog?");
    w.at("2026-11-18T10:00:00Z");
    assert.equal(rowOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" })), "chloe").feedback, "changed", "with only the older piece, it has changed since");
    piece("piece-b", "claudia", "lead", T2, new Date("2026-11-18T09:30:00Z"), "Better.");
    for (const who of ["claudia", "rahul", "zach"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      assert.equal(rowOf(viewOf(out), "chloe").feedback, "given", `${who} is told the answer changed since feedback when the newest piece is about the words shown`);
      assert.ok(!/Chloe Nguyen[^]*?Changed since feedback[^]*?Open Chloe/.test(out.text), `${who}'s row still says Changed since feedback`);
      assert.ok(!out.html.includes(">See what changed<"), `${who}'s row still offers what changed`);
    }
    // The reading view's own panel about the older piece stays true of it, and stays.
    const reading = await w.draw(pages.groupWeek, "claudia", { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" });
    assert.deepEqual(readingOf(reading).changed?.cardIds, ["piece-a"]);
    assert.match(reading.text, /Chloe’s answer has changed since this feedback was written\./);
  });

  test("the rule, pure: the newest piece about earlier words, or a version no longer kept; feedback before pieces existed reads as about the words read", async () => {
    const model = await w.loadTs(join("lib", "courses", "feedback", "model.ts"));
    const about = (savedAt) => ({ about: { text: "x", boxes: null, words: 1, savedAt }, aboutGone: false });
    const now = { about: null, aboutGone: false };
    const READ = "2026-11-18T09:00:00.000Z";
    assert.equal(model.changedSinceFeedback([], READ), false);
    assert.equal(model.changedSinceFeedback([about("2026-11-16T09:00:00.000Z")], READ), true);
    assert.equal(model.changedSinceFeedback([about("2026-11-16T09:00:00.000Z"), now], READ), false, "a newer piece about the words read: no change");
    assert.equal(model.changedSinceFeedback([now, about("2026-11-16T09:00:00.000Z")], READ), true, "the newest piece about earlier words: a change");
    // A piece about the very words read (before the session, the words as sent) is about no change.
    assert.equal(model.changedSinceFeedback([about(READ)], READ), false);
    assert.equal(model.changedSinceFeedback([{ about: null, aboutGone: true }], READ), true);
  });
});

describe("3. when an answer was first read", () => {
  test("the page names exactly the answers it drew in full, and drawing it keeps nothing", async () => {
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    assert.deepEqual(view.firstRead, { weekId: "w03", people: [{ uid: "chloe", ids: ["k3-wa"] }] });
    const reflection = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(reflection.firstRead.people, [
      { uid: "chloe", ids: ["k3-rp1"] },
      { uid: "farah", ids: ["k3-rp1"] },
    ]);
    // Under a filter, only the people it keeps were put in front of the reader.
    const filtered = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", late: "1" }));
    assert.equal(filtered.firstRead, null);
    assert.equal(weekWork("chloe"), null, "drawing the page kept a time");
  });

  test("a facilitator's opening marks the answers read for the next reader, never who: Not read yet, then read", async () => {
    const before = await drawn("sofia", { week: "3", question: "k3-rp1" });
    assert.deepEqual(viewOf(before).rows.map((row) => [row.uid, row.read]), [["chloe", "unread"], ["farah", "unread"], ["kofi", null]]);
    assert.equal((before.text.match(/Not read yet/g) ?? []).length, 3, "the two answers and the filter");
    // Rahul's page names what it drew, as the browser does once it has the page.
    const named = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" })).firstRead;
    const sent = await mark("rahul", named.people);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, { ok: true });
    assert.deepEqual(Object.keys(readAt("chloe")), ["k3-rp1"]);
    // The day it was first read, never the moment: the start of Tue 17 Nov in London.
    assert.equal(readAt("chloe")["k3-rp1"].getTime(), new Date("2026-11-17T00:00:00Z").getTime());
    // The record names nobody who read anything.
    assert.ok(!JSON.stringify(weekWork("chloe")).includes("rahul"), "the week record names who read it");
    assert.deepEqual(Object.keys(weekWork("chloe")).sort(), ["firstReadAt", "runId", "uid", "weekId", "weekNumber"]);
    const after = viewOf(await drawn("sofia", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(after.rows.map((row) => [row.uid, row.read]), [["chloe", "read"], ["farah", "read"], ["kofi", null]]);
    assert.equal(after.counts.unread, 0);
    // Another question of the same week is not read by it.
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-rp2" })), "chloe").read, "unread");
  });

  test("an answer last saved before the site began keeping read times, with none kept: neither read nor unread, and counted by no filter", async () => {
    // Chloe's reflection was last saved on Thu 12 Nov; Farah's on Sun 15 Nov.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rp1`, { updatedAt: new Date("2026-11-12T20:00:00Z") });
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(view.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", "unread"], ["kofi", null]]);
    assert.equal(view.counts.unread, 1, "an answer nobody can say of is counted as not read yet");
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", unread: "1" }))), ["farah"]);
    const out = await drawn("rahul", { week: "3", question: "k3-rp1" });
    assert.ok(!(/Chloe Nguyen[^]*?Not read yet[^]*?Open Chloe/.test(out.text)), "Chloe's old reflection is drawn as not read yet");
    // It is still drawn in full and named once drawn, so a time is kept from now on.
    assert.equal(rowOf(view, "chloe").answer.text, SAID.chloe["k3-rp1"]);
    assert.ok(view.firstRead.people.some((person) => person.uid === "chloe"));
    await mark("rahul", view.firstRead.people);
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-rp1" })), "chloe").read, "read");
  });

  test("a written answer's review page's address forwards to the reading view at the answer, which names it once drawn; the person can never mark their own", async () => {
    // The review page is retired: its address for one person's answer forwards, reading nothing, to the reading view of their week.
    const written = (await w.loadTs(join(GROUP, "written", "page.tsx"))).default;
    const forwarded = await w.draw(written, "rahul", { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" });
    assert.equal(forwarded.wrote, false, "the forward kept a time");
    assert.equal(forwarded.to, `${GROUP_PATH}/coursework/chloe?week=3#reading-answer`);
    const view = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" }));
    assert.ok(view.firstRead.ids.includes("k3-wa"), "the reading view does not name the answer the forward lands on");
    assert.equal((await mark("rahul", [{ uid: "chloe", ids: view.firstRead.ids }])).status, 200);
    assert.ok(Object.keys(readAt("chloe")).includes("k3-wa"));
    // Farah's draft cannot be read before the session: the reading view opens nothing of it, so never names it.
    const farah = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "farah" }, { week: "3" }));
    assert.ok(!farah.firstRead.ids.includes("k3-wa"), "a draft nobody may read yet is named");
    // The person's own call is refused, whatever names it.
    assert.equal((await mark("chloe", [{ uid: "chloe", ids: ["k3-wa"] }])).status, 403);
    // A reader who may not act on the work names nothing: Sofia never reads Rahul's own week, so is never drawn it.
    assert.equal((await w.draw(pages.groupWeek, "sofia", { runId: RUN.agi, groupId: B, uid: "rahul" }, { week: "3" })).to, RUN_HOME);
  });

  test("the reading view of one person's week names every answer it shows in full, for a reader who may act on the work", async () => {
    const view = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" }));
    assert.deepEqual(view.firstRead, { weekId: "w03", ids: ["k3-rp1", "k3-rp2", "k3-rp3", "k3-fb1", "k3-wa"] });
    // Farah's draft before the session is not shown in full, so not named.
    const farah = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "farah" }, { week: "3" }));
    assert.ok(!farah.firstRead.ids.includes("k3-wa"));
    // The lead's own page on the programme's side names nothing.
    w.world.db.seed(`courseEnrolments/${RUN.agi}__claudia`, enrolment("claudia", B));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__claudia__w03__k3-wa`, answer("claudia", "Mine."));
    assert.equal(readingOf(await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "claudia" }, { week: "3" })).firstRead, null);
  });

  test("who may mark what: the one gate on whose work, each answer's own readers, and nothing the caller may not read in full", async () => {
    // Rahul: Chloe's sent answer, her reflection and box; Farah's draft is hidden before the session, her reflection is not.
    assert.equal((await mark("rahul", [{ uid: "chloe", ids: ["k3-wa", "k3-rp1", "k3-fb1", "k3-fb2", "k3-nope"] }, { uid: "farah", ids: ["k3-wa", "k3-rp1"] }, { uid: "kofi", ids: ["k3-rp1", "k3-wa"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("chloe")).sort(), ["k3-fb1", "k3-rp1", "k3-wa"], "an empty box or an id the week does not ask was kept");
    assert.deepEqual(Object.keys(readAt("farah")), ["k3-rp1"], "a written answer nobody may read yet was kept as read");
    assert.equal(weekWork("kofi"), null, "nothing written was kept as read");
    // A co-facilitator is answered ok, and nothing of a facilitator's own work is kept.
    assert.deepEqual((await mark("sofia", [{ uid: "rahul", ids: ["k3-wa", "k3-rp1"] }])).body, { ok: true });
    assert.equal(weekWork("rahul"), null, "a co-facilitator marked a facilitator's own work read");
    // The lead and an admin read a facilitator's own.
    assert.equal((await mark("claudia", [{ uid: "rahul", ids: ["k3-wa"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("rahul")), ["k3-wa"]);
    assert.equal((await mark("zach", [{ uid: "sofia", ids: ["k3-rp1"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("sofia")), ["k3-rp1"]);
    // Tom facilitates Group C: admitted to the run, and nothing of Group B's is his to mark.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__k3-rp1`, { ...answer("kofi", "x"), exerciseId: "k3-rp1", kind: "reflection", text: "Kofi wrote one." });
    assert.deepEqual((await mark("tom", [{ uid: "kofi", ids: ["k3-rp1"] }])).body, { ok: true });
    assert.equal(weekWork("kofi"), null, "a facilitator of another group marked this group's work");
  });

  test("refusals: signed out, a view-as session, the person's own call, anybody who reads nobody's work, and a body that does not say", async () => {
    const before = w.everything();
    assert.equal((await mark(null, [{ uid: "chloe", ids: ["k3-wa"] }])).status, 401);
    assert.equal((await mark("zach", [{ uid: "chloe", ids: ["k3-wa"] }], { viewAs: true })).status, 403);
    assert.equal((await mark("rahul", [{ uid: "rahul", ids: ["k3-wa"] }])).status, 403, "a facilitator marked their own work read");
    assert.equal((await mark("zach", [{ uid: "chloe", ids: ["k3-wa"] }, { uid: "zach", ids: ["k3-wa"] }])).status, 403, "an admin's call naming their own work went through");
    assert.equal((await mark("chloe", [{ uid: "chloe", ids: ["k3-wa"] }])).status, 403, "the person marked their own work read");
    for (const who of ["chloe", "amara", "yusuf", "lloyd"]) assert.equal((await mark(who, [{ uid: "farah", ids: ["k3-rp1"] }])).status, 403, `${who} reads nobody's work and was admitted`);
    for (const body of [{}, { weekId: "w03" }, { weekId: "week-3", people: [{ uid: "chloe", ids: ["k3-wa"] }] }, { weekId: "w03", people: [{ uid: "chloe", ids: [] }] }, { weekId: "w03", people: [{ uid: "a/b", ids: ["k3-wa"] }] }]) {
      assert.equal((await w.call("rahul", routes.firstRead.POST, { runId: RUN.agi }, { body, course: true })).status, 400, JSON.stringify(body));
    }
    assert.equal(w.everything(), before, "a refused call kept something");
  });

  test("before the site has begun keeping read times nothing is not read yet; the first call makes the document once, and nothing moves it", async () => {
    w.reset(seedWithoutTheInstant());
    assert.equal(w.world.db.read(KEPT_DOC), undefined);
    const before = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(before.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", null], ["kofi", null]]);
    assert.equal(before.counts.unread, 0);
    assert.equal(w.world.db.read(KEPT_DOC), undefined, "drawing the page made the document");
    // The page's own call makes it, with the server's time, before any day is kept.
    w.at("2026-11-17T12:34:56Z");
    assert.equal((await mark("rahul", before.firstRead.people)).status, 200);
    const made = w.world.db.read(KEPT_DOC).keptSince;
    assert.equal(made.getTime(), new Date("2026-11-17T12:34:56Z").getTime(), "the document holds the server's exact time");
    assert.deepEqual(Object.keys(readAt("chloe")), ["k3-rp1"]);
    // Answers saved before it stay with no state; one saved after it is not read yet.
    w.at("2026-11-17T14:00:00Z");
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-rp2`, { updatedAt: new Date("2026-11-17T13:00:00Z") });
    const after = viewOf(await drawn("sofia", { week: "3", question: "k3-rp2" }));
    assert.deepEqual(after.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", "unread"], ["kofi", null]]);
    // Later calls, by anybody, never move it.
    w.at("2026-11-19T10:00:00Z");
    await mark("claudia", [{ uid: "farah", ids: ["k3-rp2"] }]);
    await mark("zach", [{ uid: "chloe", ids: ["k3-rp2"] }]);
    assert.equal(w.world.db.read(KEPT_DOC).keptSince.getTime(), made.getTime(), "a later call moved the instant");
    // A refused call never makes it.
    w.reset(seedWithoutTheInstant());
    for (const who of [null, "chloe", "yusuf"]) await mark(who, [{ uid: "farah", ids: ["k3-rp1"] }]);
    await mark("zach", [{ uid: "chloe", ids: ["k3-rp1"] }], { viewAs: true });
    assert.equal(w.world.db.read(KEPT_DOC), undefined, "a refused call made the document");
  });

  test("an answer is held against the instant by when it became readable in the words shown, not when it was saved", async () => {
    // The site began keeping read times at noon on Mon 16 Nov.
    w.world.db.seed(KEPT_DOC, { keptSince: new Date("2026-11-16T12:00:00Z") });
    // Chloe drafted hers on Sun 15 Nov and sent it on Mon 16 Nov at 2pm, after the instant: nobody could have read it before.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`, answer("chloe", CHLOE_ANSWER, { sent: new Date("2026-11-16T14:00:00Z"), saved: new Date("2026-11-15T10:00:00Z") }));
    // Rahul's was sent at 9am, before it.
    const view = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.equal(rowOf(view, "chloe").read, "unread", "an answer sent after the instant has no read state");
    assert.equal(rowOf(view, "rahul").read, null, "an answer sent before the instant reads as not read");
    // Farah never sent hers (saved Mon 16 Nov, 8pm, after it); once Group B's session starts it is read as it stands: not read yet.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`, { updatedAt: new Date("2026-11-15T20:00:00Z") });
    w.at("2026-11-18T10:00:00Z");
    const atSession = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.equal(rowOf(atSession, "farah").read, "unread", "a draft first readable at its session, after the instant, has no read state");
  });

  test("an id too long to name a document is a malformed body: refused, and nothing written for anybody", async () => {
    const before = w.everything();
    const long = "x".repeat(129);
    for (const people of [[{ uid: "chloe", ids: ["k3-wa"] }, { uid: long, ids: ["k3-wa"] }], [{ uid: "chloe", ids: ["k3-wa", long] }]]) {
      assert.equal((await mark("rahul", people)).status, 400, JSON.stringify(people).slice(0, 80));
    }
    assert.equal(w.everything(), before);
    // At the limit, the call is read (and nobody of that id is the reader's to mark).
    assert.equal((await mark("rahul", [{ uid: "x".repeat(128), ids: ["k3-wa"] }])).status, 200);
  });

  test("a second call moves nothing: a time once kept never changes", async () => {
    await mark("rahul", [{ uid: "chloe", ids: ["k3-wa"] }]);
    const first = readAt("chloe")["k3-wa"].getTime();
    w.at("2026-11-19T10:00:00Z");
    await mark("claudia", [{ uid: "chloe", ids: ["k3-wa", "k3-rp2"] }]);
    assert.equal(readAt("chloe")["k3-wa"].getTime(), first, "a second reader moved the first time");
    assert.equal(readAt("chloe")["k3-rp2"].getTime(), new Date("2026-11-19T00:00:00Z").getTime());
    const again = w.everything();
    await mark("zach", [{ uid: "chloe", ids: ["k3-wa", "k3-rp2"] }]);
    assert.equal(w.everything(), again, "a call with nothing missing wrote something");
  });

  test("the tree: no page or loader calls the writer; only the browser's beacon calls the route", () => {
    const callers = [];
    const fetchers = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
      if (/\bmarkFirstRead\s*\(/.test(code) && rel !== "lib/courses/weekWork/firstRead.ts") callers.push(rel);
      if (/\/first-read[`"']/.test(code)) fetchers.push(rel);
    }
    assert.deepEqual(callers, ["app/api/courses/runs/[runId]/first-read/route.ts"]);
    assert.deepEqual(fetchers, ["features/courses/coursework/MarkFirstRead.tsx"]);
    // The components that draw the beacon: the two reading views, and This week's work's boxes.
    const beacons = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (/<MarkFirstRead\b/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) beacons.push(rel);
    }
    assert.deepEqual(beacons.sort(), [
      "features/courses/coursework/QuestionView.tsx",
      "features/courses/coursework/ReadingView.tsx",
      // A person's boxes under This week's work, once their Read it is opened: the group page and the programme's page for a group's week.
      "features/courses/facilitatorWeek/ThisWeeksWork.tsx",
    ]);
    // What the boxes name is worked out on the server (never the reader's own), and drawn only once Read it is opened.
    const work = codeOf("features/courses/facilitatorWeek/ThisWeeksWork.tsx");
    assert.match(work, /whenOpened=\{firstRead && named \? <MarkFirstRead runId=\{firstRead\.runId\} weekId=\{firstRead\.weekId\} people=\{\[named\]\} \/> : null\}/);
    const disclosure = codeOf("features/courses/facilitatorWeek/Disclosure.tsx");
    assert.match(disclosure, /\{opened && whenOpened\}/);
    assert.ok(disclosure.indexOf("setOpened(true)") > disclosure.indexOf("onClick="), "what waits for Read it is drawn before it is opened");
    for (const page of ["app/(app)/learn/[runId]/group/[groupId]/page.tsx", "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx"]) {
      assert.match(codeOf(page), /groupBoxesFirstRead\(\{ weekId: weekDocId\([^)]*\), readerUid: (?:access\.user|user)\.uid, boxIds: /, `${page} names the boxes some other way`);
    }
    // The beacon is a client component that sends from an effect, never while the page is drawn.
    const beacon = codeOf("features/courses/coursework/MarkFirstRead.tsx");
    assert.match(beacon, /^"use client";/);
    assert.ok(beacon.indexOf("useEffect(") !== -1 && beacon.indexOf("useEffect(") < beacon.indexOf("fetch("), "the beacon sends outside an effect");
    // The route refuses view-as before anything else.
    const route = codeOf("app/api/courses/runs/[runId]/first-read/route.ts");
    const post = route.slice(route.indexOf("export async function POST("));
    assert.ok(post.indexOf("assertNotImpersonating()") !== -1 && post.indexOf("assertNotImpersonating()") < post.indexOf("getCurrentUser()"));
    // The loaders and the pages write nothing and record no opening.
    for (const path of ["lib/courses/coursework/questionLoad.ts", "app/(app)/learn/[runId]/group/[groupId]/question/page.tsx", "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question/page.tsx"]) {
      assert.doesNotMatch(
        codeOf(path),
        /\.doc\([^)]*\)\s*\.(?:set|update|create|delete)\(|\.collection\([^)]*\)\s*\.add\(|\b(?:batch|runTransaction)\(|sendEmail|sendNotice|openRecorded|markFirstRead/,
        `${path} writes`,
      );
    }
    // The route asks the one gate on whose work, and each answer's own readers.
    const store = codeOf("lib/courses/weekWork/firstRead.ts");
    for (const reader of ["feedbackGate(", "feedbackWeekOf(", "boxesReaderFor(", "feedbackStandingIn(", "feedbackRefusalFor("]) assert.ok(store.includes(reader), `the writer no longer asks ${reader}`);
  });
});

describe("3b. the two other pages that put an answer in full under a name: the fill-in boxes under This week's work", () => {
  const RAHUL_BOX = "Ask the harbour board first.";
  const CLAUDIA_BOX = "Read the lamp records.";
  const tabPage = (async () => (await w.loadTs(join(PROGRAMME, "(tabs)", "coursework", "page.tsx"))).default)();
  /** This week's work as a page hands it: its props. */
  const workOf = (drawn) => find(drawn.element, "ThisWeeksWork")[0]?.props ?? null;
  /**
   * Each person's Read it under This week's work, rendered one level down as
   * the browser holds it: whose it is, and what it names once first opened
   * (`whenOpened`, a MarkFirstRead), or null.
   */
  function readIts(drawn) {
    const work = find(drawn.element, "ThisWeeksWork")[0];
    if (!work) return [];
    const boxes = find(work.type(work.props), "GroupBoxes")[0];
    if (!boxes) return [];
    return find(boxes.type(boxes.props), "Disclosure").map((disclosure) => ({
      name: disclosure.props.name,
      named: disclosure.props.whenOpened ? { type: disclosure.props.whenOpened.type.name, ...disclosure.props.whenOpened.props } : null,
    }));
  }
  /** Chloe's week 3 cell on the Coursework tab, as `who` is handed it. */
  const chloeFlags = async (who) => {
    const view = find((await w.draw(await tabPage, who, { roundId: ROUND, programmeId: AGI }, { week: "3" })).element, "CourseworkTable")[0].props.view;
    return view.sections.flatMap((section) => section.rows).find((row) => row.uid === "chloe").cells.find((cell) => cell.weekNumber === 3).flags;
  };

  beforeEach(() => {
    // Rahul, who holds a place in Group B and facilitates it, wrote in a box too.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-fb1`, box("rahul", "k3-fb1", RAHUL_BOX));
  });

  test("the facilitator's group page names exactly the boxes it draws under a name, each person's once their Read it is opened", async () => {
    const drawn = await w.groupPage("rahul");
    assert.equal(drawn.wrote, false, "drawing the group page kept a time");
    assert.ok(drawn.html.includes(CHLOE_BOX), "the group page does not draw Chloe's box");
    // Chloe's box, the only one with words of the people Rahul is shown; never his own, never anybody with nothing written.
    assert.deepEqual(workOf(drawn).boxesFirstRead, { runId: RUN.agi, weekId: "w03", people: [{ uid: "chloe", ids: ["k3-fb1"] }] });
    const opened = readIts(drawn);
    assert.deepEqual(
      opened.map((each) => [each.name, each.named]),
      [
        ["Read it: Chloe Nguyen’s keeper's plan", { type: "MarkFirstRead", runId: RUN.agi, weekId: "w03", people: [{ uid: "chloe", ids: ["k3-fb1"] }] }],
        ["Read it: Farah Hussain’s keeper's plan", null],
        ["Read it: Kofi Asante’s keeper's plan", null],
      ],
    );
    // The beacon waits for Read it: what waits is not drawn until the button is first pressed.
    const { default: Disclosure } = await w.loadTs(join("features", "courses", "facilitatorWeek", "Disclosure.tsx"));
    const closed = renderToStaticMarkup(
      createElement(Disclosure, { label: "Read it", hideLabel: "Hide it", name: "Read it: x", hideName: "Hide it: x", whenOpened: createElement("i", { id: "waits-for-read-it" }) }, "Their boxes."),
    );
    assert.ok(closed.includes("Their boxes.") && !closed.includes("waits-for-read-it"), "what waits for Read it is drawn before it is opened");
    // Sofia, the co-facilitator, is never shown Rahul's own, so it is never named for her.
    assert.deepEqual(workOf(await w.groupPage("sofia")).boxesFirstRead.people, [{ uid: "chloe", ids: ["k3-fb1"] }]);
    // An admin reads a facilitator's own boxes too: both are named.
    assert.deepEqual(workOf(await w.groupPage("zach")).boxesFirstRead.people, [
      { uid: "chloe", ids: ["k3-fb1"] },
      { uid: "rahul", ids: ["k3-fb1"] },
    ]);
  });

  test("an archived group's page, which an admin alone opens, names nobody to the route, and otherwise draws its one week as it always did", async () => {
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    const drawn = await w.groupPage("zach");
    assert.equal(drawn.to, null, "an admin is sent away from an archived group's page");
    assert.equal(drawn.wrote, false);
    // Its one week's boxes, under each person's Read it, as before; nobody named once one is opened.
    assert.ok(drawn.html.includes(CHLOE_BOX) && drawn.html.includes(RAHUL_BOX), "the archived group's page no longer draws its week's boxes");
    assert.equal(workOf(drawn).boxesFirstRead, null);
    const opened = readIts(drawn);
    assert.ok(opened.length > 0, "no Read it is drawn");
    assert.deepEqual(opened.map((each) => each.named), opened.map(() => null), "an archived group's page names somebody to the first-read route");
    assert.equal(find(drawn.element, "MarkFirstRead").length, 0);
    // Live again, the same page names them as it does for a live group.
    w.world.db.poke(`courseGroups/${B}`, { archived: false });
    assert.deepEqual(workOf(await w.groupPage("zach")).boxesFirstRead.people.map((person) => person.uid), ["chloe", "rahul"]);
  });

  test("the route keeps a day for each box named and nothing else; opened again, nothing moves; the other reading pages then say it is read", async () => {
    // Everything else of Chloe's week 3 has been read, so the box alone is not read yet.
    assert.equal((await mark("rahul", [{ uid: "chloe", ids: ["k3-rp1", "k3-rp2", "k3-rp3", "k3-wa"] }])).status, 200);
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-fb1" })), "chloe").read, "unread");
    assert.equal((await chloeFlags("claudia")).unread, true);
    // Rahul opens Chloe's Read it on the group page: the browser names what it holds.
    const named = readIts(await w.groupPage("rahul")).find((each) => each.named)?.named;
    const sent = await mark("rahul", named.people);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, { ok: true });
    assert.deepEqual(Object.keys(readAt("chloe")).sort(), ["k3-fb1", "k3-rp1", "k3-rp2", "k3-rp3", "k3-wa"]);
    assert.equal(weekWork("rahul"), null, "a box nobody opened was kept as read");
    // Opened a second time, nothing moves.
    const before = w.everything();
    assert.equal((await mark("rahul", named.people)).status, 200);
    assert.equal(w.everything(), before);
    // The page of one question and the Coursework tab no longer say it is not read.
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-fb1" })), "chloe").read, "read");
    assert.equal((await chloeFlags("claudia")).unread, false);
  });

  test("the programme's page for a group's week names the same boxes for the lead and admins, a facilitator's own among them, never the reader's own", async () => {
    // Claudia, the lead, holds a place in Group B and wrote in a box.
    w.world.db.seed(`courseEnrolments/${RUN.agi}__claudia`, enrolment("claudia", B));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__claudia__w03__k3-fb2`, box("claudia", "k3-fb2", CLAUDIA_BOX));
    const lead = await w.leadWeekPage("claudia");
    assert.equal(lead.wrote, false, "drawing the programme's week page kept a time");
    assert.ok(lead.html.includes(CLAUDIA_BOX), "the lead is not drawn her own box, so this proves nothing about it");
    const named = workOf(lead).boxesFirstRead;
    assert.deepEqual(named, {
      runId: RUN.agi,
      weekId: "w03",
      people: [
        { uid: "chloe", ids: ["k3-fb1"] },
        { uid: "rahul", ids: ["k3-fb1"] },
      ],
    });
    // The route, called with exactly that as the lead, keeps both and refuses nothing.
    assert.equal((await mark("claudia", named.people)).status, 200);
    assert.deepEqual([Object.keys(readAt("chloe")), Object.keys(readAt("rahul"))], [["k3-fb1"], ["k3-fb1"]]);
    assert.equal(weekWork("claudia"), null, "the lead's own box was kept as read");
    // An admin is named all three, the lead's among them.
    assert.deepEqual(
      workOf(await w.leadWeekPage("zach")).boxesFirstRead.people.map((person) => person.uid),
      ["chloe", "claudia", "rahul"],
    );
  });

  test("the page where lines are picked to read out hands no uid and names nothing to the route, in the tree as on the page", async () => {
    const out = await w.reflectionsPage("rahul", { week: 3 });
    assert.equal(out.to, null);
    assert.ok(out.html.includes(SAID.chloe["k3-rp1"]), "the read-out page does not draw Chloe's reflection, so this proves nothing");
    assert.doesNotMatch(out.html, /\b(?:chloe|farah|kofi|rahul|sofia)\b/, "the read-out page hands a uid");
    assert.equal(find(out.element, "MarkFirstRead").length, 0);
    assert.ok(!out.html.includes("first-read"));
    // In the tree: no import of the read-out page reaches the beacon.
    const beacon = join(SRC, "features", "courses", "coursework", "MarkFirstRead.tsx");
    const { reached } = importersOf([beacon]);
    const readOut = join(SRC, "app", "(app)", "learn", "[runId]", "group", "[groupId]", "reflections", "page.tsx");
    assert.ok(!reached.has(readOut), `the read-out page reaches the beacon: ${(reached.get(readOut) ?? []).join(" -> ")}`);
  });
});

describe("4. feedback written from the page is read back, and the filters follow it", () => {
  test("a facilitator saves a piece on an answer through the route; the row is theirs to change and no longer waits", async () => {
    const out = await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" });
    assert.deepEqual(uidsOf(viewOf(out)), ["chloe"]);
    assert.match(out.html, /<summary>Add feedback<\/summary>/);
    const saved = await w.call("rahul", routes.feedback.POST, { runId: RUN.agi }, { body: { uid: "chloe", weekId: "w03", on: "writtenAnswer", itemId: "k3-wa", text: "Name the keeper." }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    const chloe = rowOf(after, "chloe");
    assert.equal(chloe.own?.text, "Name the keeper.");
    assert.equal(chloe.feedback, "given");
    assert.equal(after.counts.noFeedback, 0);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }))), []);
    // The lead reads it on the row, signed as Chloe reads it.
    const lead = await drawn("claudia", { week: "3", question: "k3-wa" }, "programme");
    assert.match(lead.text, /Feedback given Open Chloe’s week .*Feedback from Rahul Chloe’s facilitator · Tue 17 Nov Name the keeper\. Not emailed yet/);
  });

  test("the two states are independent: read and no feedback, unread and with feedback, and both filters together", async () => {
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": NOW } });
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__k3-wa`, answer("kofi", "Kofi's answer, sent."));
    w.world.db.seed("courseFeedback/piece-kofi", {
      runId: RUN.agi,
      uid: "kofi",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "Short and clear.",
      aboutSavedAt: SENT,
      byUid: "sofia",
      byRole: "facilitator",
      createdAt: new Date("2026-11-16T20:00:00Z"),
    });
    // Kofi's has feedback and no time kept: somebody on the team opened it to write that, so it is read.
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    assert.deepEqual(view.rows.map((row) => [row.uid, row.read, row.feedback]), [["chloe", "read", "none"], ["farah", null, null], ["kofi", "read", "given"]]);
    assert.deepEqual(view.counts, { everybody: 3, unread: 0, noFeedback: 1, late: 0 });
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }))), ["chloe"]);
    // A rating is no sign of reading: Chloe's, rated by the lead and with no time kept, is not read.
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3 });
    w.world.db.seed(`courseWorkRatings/${RUN.agi}__chloe__w03__claudia`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      itemId: "k3-wa",
      raterUid: "claudia",
      raterRole: "lead",
      rating: 6,
      comment: "Clear.",
      aboutSavedAt: SENT,
      programmeLabel: "AGI Strategy",
      createdAt: new Date("2026-11-16T21:00:00Z"),
      updatedAt: new Date("2026-11-16T21:00:00Z"),
    });
    assert.deepEqual(viewOf(await drawn("rahul", { week: "3", question: "k3-wa" })).rows.map((row) => [row.uid, row.read]), [["chloe", "unread"], ["farah", null], ["kofi", "read"]]);
    assert.deepEqual(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" })).rows.find((row) => row.uid === "chloe").read, "unread");
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": NOW } });
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", unread: "1" }))), []);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", unread: "1", nofeedback: "1" }))), []);
    const both = await drawn("rahul", { week: "3", question: "k3-wa", unread: "1", nofeedback: "1" });
    assert.match(both.text, /Nobody here matches that\./);
    // Each filter says whether it is on as a toggle does, never as the current page: two on at once is true of toggles.
    const pressed = [...both.html.matchAll(/role="button" aria-pressed="(true|false)"[^>]*>([^<]+)/g)].map((m) => [m[2].trim(), m[1]]);
    assert.deepEqual(pressed, [["Everybody", "false"], ["Not read yet", "true"], ["No feedback yet", "true"], ["Late", "false"]]);
    assert.doesNotMatch(both.html.slice(both.html.indexOf("Show whose answers")), /aria-current="page"[^>]*>(?:Everybody|Not read yet|No feedback yet|Late)\b/);
    // Each filter link switches its own and keeps the other.
    assert.equal(viewOf(both).filterHrefs.unread, `${GROUP_PATH}/question?week=3&question=k3-wa&nofeedback=1`);
    assert.equal(viewOf(both).filterHrefs.everybody, `${GROUP_PATH}/question?week=3&question=k3-wa`);
  });
});

describe("5. the switch, on both views", () => {
  test("from one person's week to one question of their group, landing on them; and back, landing on the question", async () => {
    const reading = await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "farah" }, { week: "3" });
    assert.equal(readingOf(reading).questionHref, `${GROUP_PATH}/question?week=3#p-farah`);
    assert.match(reading.html, /<span class="segmentOn" aria-current="page">One person, one week<\/span>/);
    assert.match(reading.html, new RegExp(`<a href="${GROUP_PATH}/question\\?week=3#p-farah" class="segment">One question, whole group</a>`));
    const programme = readingOf(await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "farah" }, { week: "3" }));
    assert.equal(programme.questionHref, `${PROGRAMME_PATH}/question?group=${B}&week=3#p-farah`);
    // The row it lands on carries the person's id.
    const out = await drawn("rahul", { week: "3" });
    assert.match(out.html, /<section id="p-farah"/);
    // And back: the first person shown, on the same week, at the question.
    assert.equal(viewOf(out).nav.personWeek, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-rp1`);
    assert.match(out.html, /<span class="segmentOn" aria-current="page">One question, whole group<\/span>/);
    const filtered = viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }));
    assert.equal(filtered.nav.personWeek, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-wa`);
    // The reading view carries the id each question's answer lands on.
    assert.match(reading.html, /id="q-k3-rp1"/);
    assert.match(reading.html, /<section id="q-k3-wa" class="card" aria-labelledby="reading-answer">/);
  });

  test("somebody in no group this reader may see: no question page to switch to, so no switch", async () => {
    // Una is placed in a group Publish has not told her about: to the lead she is in no group yet.
    const out = await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "una" }, { week: "3" });
    const view = readingOf(out);
    assert.ok(view, out.text.slice(0, 200));
    assert.equal(view.person.groupName, null);
    assert.equal(view.questionHref, null);
    assert.doesNotMatch(out.html, /One question, whole group/);
  });
});

describe("6. the member's side: nothing the person is sent names a read time", () => {
  const STAMP = new Date("2026-11-17T11:11:11.111Z");

  test("their own routes and week page, with every answer of theirs marked read", async () => {
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      reviewedVersions: {},
      firstReadAt: { "k3-wa": STAMP, "k3-rp1": STAMP, "k3-rp2": STAMP, "k3-fb1": STAMP },
    });
    const ask = (handler, params, options = {}) => w.call("chloe", handler, { runId: RUN.agi, ...params }, { course: true, ...options });
    /** A GET with a query, as the week page asks: the world's own `call` sends none. */
    async function askWithQuery(handler, query) {
      w.world.user = w.sessionOf("chloe");
      w.world.course = true;
      try {
        const response = await handler(new Request(`https://naisi.invalid/api${query}`, { method: "GET" }), { params: Promise.resolve({ runId: RUN.agi }) });
        return { status: response.status, body: structuredClone(response.body) };
      } finally {
        w.world.course = false;
      }
    }
    const answers = [
      ["overview", await ask(routes.overview.GET, {})],
      ["my-exercises", await askWithQuery(routes.myExercises.GET, "?week=3")],
      ["a reflection saved", await ask(routes.reflection.PUT, { promptId: "k3-rp3" }, { body: { weekId: "w03", text: "Still thinking." } })],
      ["the written answer saved", await ask(routes.written.PUT, { answerId: "k3-wa" }, { body: { weekId: "w03", text: "Keepers should, and the town." } })],
    ];
    // The answers carry her week: what the check reads is her own work, read back to her.
    assert.ok(JSON.stringify(answers[1][1].body).includes(SAID.chloe["k3-rp1"]), "my-exercises did not answer with her week");
    const marks = [STAMP.toISOString(), String(STAMP.getTime()), "11:11", "firstRead", "Not read yet", "first read"];
    for (const [what, answer] of answers) {
      assert.equal(answer.status, 200, `${what}: ${JSON.stringify(answer.body)}`);
      const said = JSON.stringify(answer.body);
      for (const words of marks) assert.ok(!said.includes(words), `${what} sends Chloe ${words}`);
    }
    // Her week page as it is drawn for her.
    const week = await w.draw((await w.loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default, "chloe", { runId: RUN.agi, n: "3" });
    for (const words of marks) assert.ok(!week.html.includes(words), `her week page names ${words}`);
    // The time is still where it was: her own saves never touch it.
    assert.equal(w.world.db.read(`courseWeekWork/${RUN.agi}__chloe__w03`).firstReadAt["k3-wa"].getTime(), STAMP.getTime());
  });

  test("the record as every reader of a person's own record reads it never carries the times", () => {
    const record = weekWorkStore.normalizeCourseWeekWork("x", { runId: "r", uid: "u", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": STAMP } });
    assert.ok(!Object.keys(record).some((key) => /read/i.test(key)), "the normaliser carries a read time");
    assert.ok(!JSON.stringify(record).includes(STAMP.toISOString()));
  });

  test("the tree: every page and route that can reach the store of the times is one for the people who may read the answers", () => {
    const store = join(SRC, "lib", "courses", "weekWork", "firstRead.ts");
    const { reached, unresolved } = importersOf([store]);
    assert.deepEqual(unresolved, [], "the walk could not place an import: it would go quiet past it");
    const doors = [...reached.keys()]
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .filter((rel) => rel.startsWith("app/") && /\/(?:page|route|layout)\.tsx?$/.test(rel))
      .sort();
    const READERS = {
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework/page.tsx":
        "the Coursework tab: an admin or the programme's lead, the flags and the list of what waits worked out on the server for the people the one gate lets them read, never their own row; handed whether a flag is true, never a time or who",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question/page.tsx":
        "one question across a group on the programme's side: an admin or the programme's lead, and only the answers the one gate lets them read, never their own",
      "app/(app)/learn/[runId]/group/[groupId]/question/page.tsx":
        "one question across a group on the group's side: its live facilitators, the lead and admins, and only the answers the one gate lets them read, never their own",
      "app/api/courses/runs/[runId]/first-read/route.ts": "the writer: answers ok and nothing else, never a time",
    };
    assert.deepEqual(doors, Object.keys(READERS).sort(), "a page or route the person may open can reach the times an answer was first read");
    // Every file naming the field is the store, or says what the field is.
    const naming = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (/\bfirstReadAt\b|["']firstReadAt["']/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) naming.push(rel);
    }
    assert.deepEqual(naming, ["lib/courses/weekWork/firstRead.ts"], "a file other than the store names the field");
  });

  test("the tree: every page that can draw the beacon naming answers to the route is one for the people who may read them, and the read-out page is none of them", () => {
    const beacon = join(SRC, "features", "courses", "coursework", "MarkFirstRead.tsx");
    const { reached, unresolved } = importersOf([beacon]);
    assert.deepEqual(unresolved, [], "the walk could not place an import: it would go quiet past it");
    const doors = [...reached.keys()]
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .filter((rel) => rel.startsWith("app/") && /\/(?:page|route|layout)\.tsx?$/.test(rel))
      .sort();
    const NAMERS = {
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/page.tsx":
        "the reading view of one person's week on the programme's side: an admin or the programme's lead, the answers it shows in full for a reader who may act on the person's work, never their own",
      "app/(app)/learn/[runId]/group/[groupId]/coursework/[uid]/page.tsx":
        "the reading view of one person's week on the group's side: the group's live facilitators, the lead and admins, the person by the one gate on whose work, never their own",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question/page.tsx":
        "one question across a group on the programme's side: the answers it draws in full of the people the one gate lets the reader read",
      "app/(app)/learn/[runId]/group/[groupId]/question/page.tsx":
        "one question across a group on the group's side: the answers it draws in full of the people the one gate lets the reader read",
      "app/(app)/learn/[runId]/group/[groupId]/page.tsx":
        "the facilitator's group page: a person's fill-in boxes under This week's work, once their Read it is opened, for exactly the people the boxes' own gate lets the reader read, never their own",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx":
        "the programme's page for a group's week, for its lead and admins: a person's fill-in boxes under This week's work, once their Read it is opened, never the reader's own",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance/page.tsx":
        "the Attendance tab imports each group's week card from This week's work's file and draws no boxes, so hands the beacon nothing to name",
    };
    assert.deepEqual(doors, Object.keys(NAMERS).sort(), "a page can now draw the beacon that names answers to the first-read route: say who it names them for");
    for (const [page, why] of Object.entries(NAMERS)) assert.ok(why.length > 40, `${page}: say why`);
    // The page where lines are picked to read out is never one: it carries no names, no uids and no row ids. Nor are the
    // older pages' addresses, which forward from the address alone and draw nothing.
    for (const page of [
      "app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/written/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/written/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx",
    ]) {
      assert.ok(!doors.includes(page), `${page} can draw the beacon`);
    }
    // The Attendance tab draws no This week's work, so no box and no beacon.
    assert.doesNotMatch(codeOf("app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance/page.tsx"), /<ThisWeeksWork\b|boxesFirstRead/);
  });
});

describe("6b. the older pages' addresses forward here, from the address alone", () => {
  const forwards = (async () => ({
    groupWritten: (await w.loadTs(join(GROUP, "written", "page.tsx"))).default,
    groupNames: (await w.loadTs(join(GROUP, "reflections", "names", "page.tsx"))).default,
    programmeWritten: (await w.loadTs(join(PROGRAMME, "written", "page.tsx"))).default,
    programmeReflections: (await w.loadTs(join(PROGRAMME, "reflections", "page.tsx"))).default,
  }))();
  const lib = (async () => w.loadTs(join("lib", "courses", "coursework", "forwards.ts")))();

  test("the mapping, pure: a person's answer to their week at the answer; a group's answers, or its reflections, to one question across it; a week or group left out, the new page's own", async () => {
    const f = await lib;
    const P = "/admin/admissions/forms/r/programmes/p";
    const G = "/learn/run/group/g";
    assert.equal(f.programmeWrittenForward(P, { group: "g", week: "3", person: "chloe" }), `${P}/coursework/chloe?week=3#reading-answer`);
    assert.equal(f.programmeWrittenForward(P, { person: "chloe" }), `${P}/coursework/chloe#reading-answer`);
    assert.equal(f.programmeWrittenForward(P, { group: "g", week: "3" }), `${P}/question?group=g&week=3&first=answer`);
    assert.equal(f.programmeWrittenForward(P, {}), `${P}/question?first=answer`);
    assert.equal(f.programmeReflectionsForward(P, { group: "g", week: "3" }), `${P}/question?group=g&week=3&first=reflection`);
    assert.equal(f.programmeReflectionsForward(P, { week: "3" }), `${P}/question?week=3&first=reflection`);
    assert.equal(f.groupWrittenForward(G, { week: "3", person: "chloe" }), `${G}/coursework/chloe?week=3#reading-answer`);
    assert.equal(f.groupWrittenForward(G, { week: "3" }), `${G}/question?week=3&first=answer`);
    assert.equal(f.groupNamedReflectionsForward(G, { week: "3" }), `${G}/question?week=3&first=reflection`);
    assert.equal(f.groupNamedReflectionsForward(G, {}), `${G}/question?first=reflection`);
    // Only an id or a week number is carried over; anything else is left out, and the new page opens its own.
    assert.equal(f.groupWrittenForward(G, { week: "three", person: "a/b" }), `${G}/question?first=answer`);
    assert.equal(f.groupWrittenForward(G, { week: ["3", "4"], person: ["chloe"] }), `${G}/question?first=answer`);
    assert.equal(f.programmeWrittenForward(P, { group: "..", week: "123" }), `${P}/question?first=answer`);
    // An id is encoded, never read as a path.
    assert.equal(f.groupWrittenForward(G, { week: "3", person: "a b" }), `${G}/coursework/a%20b?week=3#reading-answer`);
    // The forwarding pages read nothing and decide nothing: the address, the forward, and nothing else.
    for (const page of [
      "app/(app)/learn/[runId]/group/[groupId]/written/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/written/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx",
    ]) {
      const code = codeOf(page);
      assert.match(code, /redirect\(\w+Forward\(/, `${page} does not forward`);
      assert.doesNotMatch(code, /getAdminDb|getRunAccess|getSessionUser|getCurrentUser|requireAdmissionsPage|openLeadDoor|loadProgrammeRun|\.collection\(|permanentRedirect/, `${page} reads or decides something`);
    }
    assert.doesNotMatch(codeOf("lib/courses/coursework/forwards.ts"), /firebase|\.collection\(|server-only|fetch\(/);
  });

  test("each forward as each persona: forwarded before any gate, and the new page then answers as the older page did, but for the differences named", async () => {
    const pagesOf = await forwards;
    const RUN_ENC = encodeURIComponent(RUN.agi);
    /** Where an address the forward handed lands: the page it names, drawn as `who`. */
    async function land(who, address) {
      const url = new URL(address, "https://naisi.invalid");
      const query = Object.fromEntries(url.searchParams);
      let m;
      if ((m = /^\/learn\/([^/]+)\/group\/([^/]+)\/coursework\/([^/]+)$/.exec(url.pathname))) {
        return w.draw(pages.groupWeek, who, { runId: decodeURIComponent(m[1]), groupId: decodeURIComponent(m[2]), uid: decodeURIComponent(m[3]) }, query);
      }
      if ((m = /^\/learn\/([^/]+)\/group\/([^/]+)\/question$/.exec(url.pathname))) {
        return w.draw(pages.group, who, { runId: decodeURIComponent(m[1]), groupId: decodeURIComponent(m[2]) }, query);
      }
      if ((m = /^\/admin\/admissions\/forms\/([^/]+)\/programmes\/([^/]+)\/coursework\/([^/]+)$/.exec(url.pathname))) {
        return w.draw(pages.programmeWeek, who, { roundId: decodeURIComponent(m[1]), programmeId: decodeURIComponent(m[2]), uid: decodeURIComponent(m[3]) }, query);
      }
      if ((m = /^\/admin\/admissions\/forms\/([^/]+)\/programmes\/([^/]+)\/question$/.exec(url.pathname))) {
        return w.draw(pages.programme, who, { roundId: decodeURIComponent(m[1]), programmeId: decodeURIComponent(m[2]) }, query);
      }
      throw new Error(`the forward led somewhere this suite cannot draw: ${address}`);
    }
    const outcome = (drawn) =>
      drawn.to ? `to ${drawn.to}` : ["ReadingView", "QuestionView", "NotYours", "NoProgrammeHere"].find((name) => find(drawn.element, name).length > 0) ?? `text ${drawn.text.slice(0, 60)}`;
    const ASKED = {
      groupWrittenPerson: [pagesOf.groupWritten, { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" }, `${GROUP_PATH}/coursework/chloe?week=3#reading-answer`],
      groupWritten: [pagesOf.groupWritten, { runId: RUN.agi, groupId: B }, { week: "3" }, `${GROUP_PATH}/question?week=3&first=answer`],
      groupNames: [pagesOf.groupNames, { runId: RUN.agi, groupId: B }, { week: "3" }, `${GROUP_PATH}/question?week=3&first=reflection`],
      programmeWrittenPerson: [pagesOf.programmeWritten, { roundId: ROUND, programmeId: AGI }, { group: B, week: "3", person: "chloe" }, `${PROGRAMME_PATH}/coursework/chloe?week=3#reading-answer`],
      programmeWritten: [pagesOf.programmeWritten, { roundId: ROUND, programmeId: AGI }, { group: B, week: "3" }, `${PROGRAMME_PATH}/question?group=${B}&week=3&first=answer`],
      programmeReflections: [pagesOf.programmeReflections, { roundId: ROUND, programmeId: AGI }, { group: B, week: "3" }, `${PROGRAMME_PATH}/question?group=${B}&week=3&first=reflection`],
    };
    const home = `to /learn/${RUN_ENC}`;
    const learnRefused = { groupWrittenPerson: home, groupWritten: home, groupNames: home };
    const programmeRefused = { programmeWrittenPerson: "to /dashboard", programmeWritten: "to /dashboard", programmeReflections: "to /dashboard" };
    const drawnBoth = {
      groupWrittenPerson: "ReadingView",
      groupWritten: "QuestionView",
      groupNames: "QuestionView",
      programmeWrittenPerson: "ReadingView",
      programmeWritten: "QuestionView",
      programmeReflections: "QuestionView",
    };
    // What the older pages answered, drawn on this world before they went (the review page for the written
    // answers, the page with names for the reflections), and where it differs now, said beside it.
    const EXPECTED = {
      zach: drawnBoth,
      // DIFFERENT: the group's reflections with names sent the lead to the run's home; the page of one question
      // admits the lead on the group's side, as it already did on the programme's.
      claudia: drawnBoth,
      rahul: { groupWrittenPerson: "ReadingView", groupWritten: "QuestionView", groupNames: "QuestionView", ...programmeRefused },
      sofia: { groupWrittenPerson: "ReadingView", groupWritten: "QuestionView", groupNames: "QuestionView", ...programmeRefused },
      tom: { ...learnRefused, ...programmeRefused },
      yusuf: { ...learnRefused, ...programmeRefused },
      lloyd: { ...learnRefused, programmeWrittenPerson: "NotYours", programmeWritten: "NotYours", programmeReflections: "NotYours" },
      tess: { ...learnRefused, programmeWrittenPerson: "NoProgrammeHere", programmeWritten: "NoProgrammeHere", programmeReflections: "NoProgrammeHere" },
      chloe: { ...learnRefused, ...programmeRefused },
      farah: { ...learnRefused, ...programmeRefused },
      amara: { ...learnRefused, ...programmeRefused },
      nobody: { ...learnRefused, ...programmeRefused },
      "signed out": { groupWrittenPerson: "to /login", groupWritten: "to /login", groupNames: "to /login", ...programmeRefused },
    };
    const seen = {};
    for (const who of ["zach", "claudia", "rahul", "sofia", "tom", "yusuf", "lloyd", "tess", "chloe", "farah", "amara", "nobody", null]) {
      const row = {};
      for (const [name, [Page, params, query, address]] of Object.entries(ASKED)) {
        // Forwarded before any gate: the same address for everybody, and nothing written.
        const forwarded = await w.draw(Page, who, params, query);
        assert.equal(forwarded.to, address, `${who} on ${name}`);
        assert.equal(forwarded.wrote, false);
        const landed = await land(who, forwarded.to);
        assert.equal(landed.wrote, false, `${who} on ${name}: the page forwarded to wrote something`);
        row[name] = outcome(landed);
      }
      seen[who ?? "signed out"] = row;
    }
    assert.deepEqual(seen, EXPECTED);
    // The reviewer told the page is the lead's and an admin's is now told so of the Coursework tab, where these pages sit.
    assert.match((await land("lloyd", ASKED.programmeWritten[3])).text, /Only the programme’s lead and admins can open Coursework/);
    // DIFFERENT: a person the reader may not read, named in the address, is no longer quietly swapped for another answer:
    // the reading view sends a co-facilitator asking for a facilitator's own week to the run's home.
    const own = await w.draw(pagesOf.groupWritten, "sofia", { runId: RUN.agi, groupId: B }, { week: "3", person: "rahul" });
    assert.equal(outcome(await land("sofia", own.to)), home);
  });

  test("the page of one question opens on the week's written answer, or its first reflection, when asked without an id", async () => {
    const answer = viewOf(await drawn("rahul", { week: "3", first: "answer" }));
    assert.equal(answer.question.id, "k3-wa");
    const reflection = viewOf(await drawn("rahul", { week: "3", first: "reflection" }));
    assert.equal(reflection.question.id, "k3-rp1");
    // A question named wins; a kind the week does not ask, or one that is not a kind, opens the week's first.
    assert.equal(viewOf(await drawn("rahul", { week: "3", question: "k3-rp2", first: "answer" })).question.id, "k3-rp2");
    assert.equal(viewOf(await drawn("rahul", { week: "3", first: "nonsense" })).question.id, "k3-rp1");
    assert.equal(viewOf(await drawn("zach", { week: "3", first: "answer" }, "programme")).question.id, "k3-wa");
    assert.deepEqual([question.readFirstOfKind("answer"), question.readFirstOfKind("reflection"), question.readFirstOfKind("box"), question.readFirstOfKind(["answer"])], ["answer", "reflection", null, null]);
  });

  test("what the written answer's review page and the reflections with names showed of each answer is on the page of one question, with the same words", async () => {
    const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
    const wordsThen = await w.loadTs(join("lib", "courses", "weekEdit", "wordsThen.ts"));
    const facilitatorWords = await w.loadTs(join("lib", "courses", "facilitatorWeek", "words.ts"));
    // The question's range, on the written answer alone.
    const answer = await drawn("rahul", { week: "3", first: "answer" });
    assert.match(answer.text, /The question · 1 to 200 words · Written answer/);
    assert.match((await drawn("rahul", { week: "3", first: "reflection" })).text, /The question · Part 1: /);
    // After its deadline: Chloe first sends hers the morning of Group B's session (Tue 17 Nov), after the end of the
    // day before (its deadline) and before the session: after its deadline, to staff, and never late.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`, { firstSentAt: new Date("2026-11-17T09:00:00Z"), sentAt: new Date("2026-11-17T09:00:00Z") });
    const late = viewOf(await drawn("rahul", { week: "3", first: "answer" }));
    assert.equal(rowOf(late, "chloe").afterDeadline, true, "first sent the morning of the session, after the end of the day before");
    assert.match((await drawn("rahul", { week: "3", first: "answer" })).text, new RegExp(`Chloe Nguyen Sent Tue 17 Nov, 9am ${weekWords.AFTER_ITS_DEADLINE}`));
    // Joined late: Kofi wrote nothing and was told his group after its week 3 session.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { allocatedEmailAt: new Date("2026-11-18T09:00:00Z") });
    w.at("2026-11-18T10:00:00Z");
    const joined = await drawn("zach", { week: "3", first: "answer" });
    assert.equal(rowOf(viewOf(joined), "kofi").joinedLate, true);
    assert.match(joined.text, new RegExp(`Kofi Asante ${weekWords.JOINED_LATE}`));
    w.at(NOW);
    // The answer as it stood at the session, and the question as it was when the answer was written, under the answer:
    // drawn as every reader by tests/course-hub-written-answers.test.mjs and tests/course-week-edit-words-then-pages.test.mjs.
    assert.equal(wordsThen.THE_QUESTION_WHEN_WRITTEN, "The question when this was written:");
    assert.equal(weekWords.AS_IT_STOOD_AT_THE_SESSION, "As it stood at the session");
    // Who reads a facilitator's own work, under the rows, for the lead (and an admin, by the lead's name); never a facilitator.
    assert.ok((await drawn("claudia", { week: "3", first: "answer" }, "programme")).text.includes(facilitatorWords.facilitatorsOwnLine({ firstName: "", isReader: true })));
    assert.ok((await drawn("zach", { week: "3", first: "answer" }, "programme")).text.includes(facilitatorWords.facilitatorsOwnLine({ firstName: "Claudia", isReader: false })));
    assert.equal(viewOf(await drawn("rahul", { week: "3", first: "answer" })).ownLine, null);
    // On a reflection, on the group's side: who reads reflections with names, and the way to pick lines to read out,
    // for the readers the page where lines are read out admits (its facilitators and admins), never the lead.
    for (const who of ["rahul", "zach"]) {
      const read = await drawn(who, { week: "3", first: "reflection" });
      assert.ok(read.text.includes(facilitatorWords.namedReadersLine("Group B", "Claudia")), who);
      assert.match(read.html, new RegExp(`href="${GROUP_PATH}/reflections\\?week=3"[^>]*>${facilitatorWords.PICK_LINES_TO_READ_OUT}<`), who);
    }
    assert.equal(viewOf(await drawn("claudia", { week: "3", first: "reflection" })).readOut, null, "the lead is led to a page that sends her away");
    assert.equal(viewOf(await drawn("zach", { week: "3", first: "reflection" }, "programme")).readOut, null);
    assert.equal(viewOf(await drawn("rahul", { week: "3", first: "answer" })).readOut, null, "the way to read lines out beside a written answer");
  });
});

describe("7. the filters and counts, as pure functions", () => {
  const READS = ["unread", "read", null];
  const FEEDBACKS = ["none", "given", "changed", null];
  const rows = [];
  for (const read of READS) for (const feedback of FEEDBACKS) for (const late of [false, true]) rows.push({ read, feedback, late, key: `${read}/${feedback}/${late}` });

  test("every combination of the three filters keeps exactly the rows with every chosen state, each state apart from the others", () => {
    for (const unread of [false, true]) {
      for (const noFeedback of [false, true]) {
        for (const late of [false, true]) {
          const filter = { unread, noFeedback, late };
          const kept = question.filterRows(rows, filter).map((row) => row.key);
          const expected = rows
            .filter((row) => (!unread || row.read === "unread") && (!noFeedback || row.feedback === "none") && (!late || row.late))
            .map((row) => row.key);
          assert.deepEqual(kept, expected, JSON.stringify(filter));
        }
      }
    }
    // Read or not says nothing of feedback, and the other way round.
    assert.deepEqual(question.filterRows(rows, { unread: true, noFeedback: false, late: false }).map((row) => row.feedback).sort(), [...FEEDBACKS, ...FEEDBACKS].sort());
    assert.deepEqual(question.filterRows(rows, { unread: false, noFeedback: true, late: false }).map((row) => row.read), ["unread", "unread", "read", "read", null, null]);
  });

  test("each count is of every row, whatever is chosen", () => {
    assert.deepEqual(question.filterCounts(rows), { everybody: 24, unread: 8, noFeedback: 6, late: 12 });
    assert.deepEqual(question.filterCounts([]), { everybody: 0, unread: 0, noFeedback: 0, late: 0 });
  });

  test("the states from what was read: nothing shown is neither read nor unread, and only a written answer takes feedback", () => {
    const KEPT = KEPT_SINCE;
    const BEFORE = new Date(KEPT.getTime() - 60_000);
    const AFTER = new Date(KEPT.getTime() + 60_000);
    const state = (input, keptFrom = KEPT) => question.readStateOf({ shownInFull: true, readSince: null, readableSince: AFTER, feedbackPieces: 0, ...input }, keptFrom);
    // Not shown in full: neither, whatever else is so.
    assert.equal(state({ shownInFull: false, readSince: NOW, feedbackPieces: 2 }), null);
    // Readable since times were kept: unread until a time is kept, or feedback is written on it.
    assert.equal(state({}), "unread");
    assert.equal(state({ readableSince: KEPT }), "unread", "an answer readable at the very instant times began reads as not read");
    assert.equal(state({ readSince: NOW }), "read");
    assert.equal(state({ feedbackPieces: 1 }), "read");
    // Readable before: nobody can say, unless a time is kept or feedback was written on it.
    assert.equal(state({ readableSince: BEFORE }), null);
    assert.equal(state({ readableSince: null }), null, "an answer readable at a time nobody knows reads as not read");
    assert.equal(state({ readableSince: BEFORE, readSince: NOW }), "read");
    assert.equal(state({ readableSince: BEFORE, feedbackPieces: 1 }), "read");
    // No instant yet (the site has not begun keeping read times): nothing is not read yet, and what is known still is.
    assert.equal(state({}, null), null, "an answer reads as not read yet before the site began keeping read times");
    assert.equal(state({ readSince: NOW }, null), "read");
    assert.equal(state({ feedbackPieces: 1 }, null), "read");
    // Either side of an instant.
    assert.equal(state({ readableSince: BEFORE }, new Date(0)), "unread");
    assert.equal(state({ readableSince: AFTER }, new Date("2030-01-01T00:00:00Z")), null);
    // When an answer became readable in the words shown.
    const at = (iso) => new Date(iso);
    assert.deepEqual(question.readableSinceOf({ kind: "box", savedAt: at("2026-11-12T10:00:00Z") }), at("2026-11-12T10:00:00Z"));
    assert.equal(question.readableSinceOf({ kind: "box", savedAt: null }), null);
    // A draft saved before and sent after: readable since its send.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: at("2026-11-14T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-14T10:00:00Z"));
    // Never sent as it is: readable since the start of its session.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: null, sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-17T18:00:00Z"));
    // Changed after it was sent, and not sent again: the words shown were never sent, so their session.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-18T10:00:00Z"), lastSentAt: at("2026-11-12T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-18T10:00:00Z"));
    // Sent long after its session: its send.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: at("2026-11-20T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-20T10:00:00Z"));
    assert.equal(question.feedbackStateOf({ takesFeedback: false, pieces: 2, changed: true }), null);
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 0, changed: false }), "none");
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 1, changed: false }), "given");
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 1, changed: true }), "changed");
    assert.deepEqual(question.readQuestionFilter({ unread: "1", nofeedback: ["1"], late: "0" }), { unread: true, noFeedback: false, late: false });
    assert.equal(question.questionHref("/x/question?group=g", { weekNumber: 2, questionId: "q", filter: { unread: true, noFeedback: true, late: true } }), "/x/question?group=g&week=2&question=q&unread=1&nofeedback=1&late=1");
    assert.deepEqual(question.toggled({ unread: true, noFeedback: false, late: false }, "unread"), { unread: false, noFeedback: false, late: false });
  });
});

describe("8. the words the browser spec reads, as the product says them", () => {
  test("each string tests/e2e/course-hub-coursework.spec.mjs matches on these pages is the product's own, apostrophes and all", async () => {
    const feedback = await w.loadTs(join("lib", "courses", "feedback", "words.ts"));
    const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
    assert.deepEqual(
      [words.NOT_READ_YET, words.WAITING_FOR_FEEDBACK, words.EVERYBODY, weekWords.LATE, words.ADD_FEEDBACK, words.ONE_PERSON_ONE_WEEK, words.ONE_QUESTION_WHOLE_GROUP],
      ["Not read yet", "No feedback yet", "Everybody", "Late", "Add feedback", "One person, one week", "One question, whole group"],
    );
    assert.deepEqual([words.ONE_QUESTION_TITLE, words.NEXT_QUESTION, words.PREVIOUS_QUESTION, words.CHANGED_SINCE_FEEDBACK], ["One question, the whole group", "Next question", "Previous question", "Changed since feedback"]);
    assert.equal(words.openWeekWords("Ada"), "Open Ada’s week");
    assert.deepEqual([feedback.SAVE_FEEDBACK, feedback.SAVE_CHANGES, feedback.COMMENT], ["Save feedback", "Save changes", "Comment"]);
    assert.equal(words.questionOfWords(1, 4), "Question 1 of 4");
    assert.equal(words.partHeadingWords(1, "Start with what you think"), "Part 1: Start with what you think");
    assert.deepEqual([words.WAYS_TO_READ, words.SHOW_WHOSE_ANSWERS, words.NOBODY_HERE, words.NOTHING_WRITTEN_YET], ["Ways to read", "Show whose answers", "Nobody here matches that.", "Nothing written yet"]);
    // The lead's choice of group on the programme's side: the navigation the spec finds it by, the Coursework tab's own word.
    assert.equal(words.GROUP, "Group");
    assert.match(codeOf("features/courses/coursework/QuestionView.tsx"), /<nav aria-label=\{GROUP\} className=\{tab\.groupsNav\}>/);
    // Reflections read with names here: the mark on a facilitator's own row, the lines under the rows for a
    // programme with no lead (the term's has none), and the links between this page and the one to read lines out.
    const week = await w.loadTs(join("lib", "courses", "facilitatorWeek", "words.ts"));
    const forwards = await w.loadTs(join("lib", "courses", "coursework", "forwards.ts"));
    assert.equal(words.FACILITATING, "Facilitator");
    assert.equal(week.facilitatorsOwnLine(null), "Only admins read these. They\u2019re never read out.");
    assert.equal(
      week.namedReadersLine("Group A", null),
      "Group A\u2019s facilitators and admins read reflections with names. Fellows can\u2019t see each other\u2019s. To read a line out in the session, pick it on the page without names.",
    );
    assert.deepEqual([week.READ_WITH_NAMES, week.PICK_LINES_TO_READ_OUT], ["Read them with names", "Pick lines to read out"]);
    assert.equal(forwards.firstQuestionHref("/learn/r/group/g/question", 3, "reflection"), "/learn/r/group/g/question?week=3&first=reflection");
    assert.match(codeOf("app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx"), /firstQuestionHref\(`\$\{groupPath\}\/question`, week\.weekNumber, "reflection"\)/);
    // The way back from a reflection on the group's side to the page to read lines out.
    assert.match(codeOf("app/(app)/learn/[runId]/group/[groupId]/question/page.tsx"), /readOutHref: .*\(weekNumber\) => `\$\{groupPath\}\/reflections\?week=\$\{weekNumber\}`/);
    // The spec's fixture makes sure the site has begun keeping read times: the document the site reads.
    const core = await import("../scripts/e2e-fixtures/core.mjs");
    const store = await w.loadTs(join("lib", "courses", "weekWork", "firstRead.ts"));
    assert.deepEqual([core.READ_TIMES_CONFIG_COLLECTION, core.READ_TIMES_CONFIG_DOC_ID], [store.FIRST_READ_TIMES_DOC.collection, store.FIRST_READ_TIMES_DOC.doc]);
    assert.equal(`${store.FIRST_READ_TIMES_DOC.collection}/${store.FIRST_READ_TIMES_DOC.doc}`, KEPT_DOC);
    for (const line of [words.NOTHING_WRITTEN_YET, words.NOBODY_TO_READ, words.SEE_WHAT_CHANGED, words.RATE, words.questionOfWords(2, 9)]) {
      assert.doesNotMatch(line, /[–—]/, line);
    }
  });
});
