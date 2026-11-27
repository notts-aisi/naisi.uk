/**
 * Saved templates on a programme's Weeks tab ("Copy weeks from the
 * course"): listed for the programme's lead and admins, copied in only where
 * a week is empty, saved and deleted by admins alone.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/weeksTabWorld.mjs`):
 * six weeks of the plan, each with a page holding readings, week 3 written as
 * blocks; Claudia leads the programme, Tess leads another, Lloyd reviews it,
 * Yusuf is the run's track lead, Rahul, Sofia and Tom facilitate, Chloe holds
 * a place, Drew drafts courses, April approves them, Zach is the admin. One
 * template of the course is saved, "AGI Strategy, six weeks", six weeks long.
 *
 * Held here:
 *  1. who may list, copy, save and delete, each route as every caller;
 *  2. the copy writes a week only where it is empty and never deletes one:
 *     an empty run; a run with a written week, a titled-only week and a
 *     week with a group's own copy; a run somebody has started; a template
 *     with more weeks than the run; the same copy twice; and proof that no
 *     week with anything in it changed and none was deleted;
 *  3. a template's contents hold nobody's work;
 *  4. a deleted template leaves the runs made from it with their weeks;
 *  5. the page as each caller, in the board's words, and its one copy press
 *     always asks to fill.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { CAST } from "./lib/handoverWorld.mjs";
import { glossaryDoc, startHereDoc } from "./lib/guideFixture.mjs";
import { A, AGI, COURSE, NOW, PERSONAS, ROUND, RUN, makeWeeksTabWorld, weeksTabSeed } from "./lib/weeksTabWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

/** A course approver, named on nothing. */
const approver = session("april", "member", false, "April Moss");
CAST.april = { ...approver, permissions: { ...approver.permissions, approveCourse: true } };

const w = await makeWeeksTabWorld("__weeksTemplates");
const { world, draw, tabsPage, courseRoute, lib } = w;
const CopyPage = await tabsPage("weeks", "copy", "page.tsx");
const applyRoute = await courseRoute("runs", "[runId]", "apply-template");
const listRoute = await courseRoute("[courseId]", "templates");
const deleteRoute = await courseRoute("templates", "[templateId]");
const words = await lib("courses", "weeksTab", "words.ts");
const fill = await lib("courses", "weeksTab", "fill.ts");
const olderWords = await lib("courses", "olderEditor", "words.ts");

const PARAMS = { roundId: ROUND, programmeId: AGI };
const TEMPLATE = "agi-strategy-six-weeks__tpl00001";
const RUN_WEEKS = `courseRuns/${RUN.agi}/weeks`;
const weekPath = (n) => `${RUN_WEEKS}/w0${n}`;
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Everybody a suite asks as, the approver among them. */
const CALLERS = [...PERSONAS, ["april", "a course approver"]];

/** A template of the course with `weeks` weeks, saved by Zach on Mon 19 Oct. */
function templateSeed(weeks = 6) {
  const seed = {
    [`courseTemplates/${TEMPLATE}`]: {
      courseId: COURSE.agi,
      courseTitle: "AGI Strategy Fellowship",
      label: "AGI Strategy, six weeks",
      sourceRunId: RUN.agiSpring,
      sourceGroupId: null,
      savedAt: new Date("2026-10-19T10:00:00Z"),
      savedByUid: "zach",
      savedByName: "Zach",
      weekCount: weeks,
      retrospective: null,
    },
  };
  for (let n = 1; n <= weeks; n += 1) {
    seed[`courseTemplates/${TEMPLATE}/weeks/w0${n}`] = {
      weekNumber: n,
      title: `Template week ${n}`,
      summary: `What week ${n} is for.`,
      guideBlocks: [],
      materials: [{ id: `m_tpl_${n}`, type: "reading", title: `Reading ${n}`, url: "https://example.com/reading", minutes: 20, required: true }],
      exercises: [],
      checklist: [],
      questions: [`A question for week ${n}`],
      estimatedMinutes: 40,
      published: true,
    };
  }
  return seed;
}

function start({ weeks = 6, over = {} } = {}) {
  w.reset(weeksTabSeed({ ...templateSeed(weeks), "users/april": userDoc(CAST.april), ...over }));
  world.db.poke("users/april", { permissions: CAST.april.permissions });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  start();
});

/** One request to a route as `who`, with a query string a GET may carry. */
async function ask(who, handler, params, { body, query = "", viewAs = false } = {}) {
  world.user = w.sessionOf(who);
  world.course = true;
  world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    world.course = false;
    world.viewAs = false;
  }
}

const copyIn = (who, body = { templateId: TEMPLATE, fill: true }, options = {}) => ask(who, applyRoute.POST, { runId: RUN.agi }, { body, ...options });
const listAs = (who, query = "") => ask(who, listRoute.GET, { courseId: COURSE.agi }, { query });

/** The whole store as one string. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
/** The run's own week documents, by path. */
const runWeeks = () => Object.fromEntries(world.db.paths().filter((path) => path.startsWith(`${RUN_WEEKS}/`) && path.split("/").length === 4).sort().map((path) => [path, JSON.stringify(world.db.read(path))]));
/** Every document under the run's weeks, their history and locks among them. */
const underWeeks = () => world.db.paths().filter((path) => path.startsWith(`${RUN_WEEKS}/`)).sort();

/** Empty week 4 to 6, a titled-only week 2, and a group's own copy of week 4: week 1 and 3 stay as written. */
function mixedRun() {
  world.db.seed(weekPath(2), { weekNumber: 2, title: "Only a title", summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: false });
  world.db.seed(weekPath(4), { weekNumber: 4, title: "", summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: false, updatedAt: NOW, updatedByUid: "claudia" });
  world.db.seed(`courseGroups/${A}/weeks/w04`, { weekNumber: 4, title: "Group A's own week 4", materials: [] });
  world.db.seed(weekPath(5), { weekNumber: 5, title: "", summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: false, pitching: false, ready: false, ownerUid: null });
  return world.db.collection(RUN_WEEKS).doc("w06").delete();
}

describe("1. who may do what", () => {
  test("the list: course authors, the run's track lead, and the programme's lead for the run their programme names; nobody else", async () => {
    const expected = { zach: 200, drew: 200, april: 200, yusuf: 200, null: 401 };
    for (const [who, what] of CALLERS) {
      const answer = await listAs(who, `?runId=${RUN.agi}`);
      const want = who === "claudia" ? 200 : (expected[String(who)] ?? 403);
      assert.equal(answer.status, want, `${what}: ${JSON.stringify(answer.body)}`);
      if (answer.status === 200) assert.deepEqual(answer.body.templates.map((row) => row.id), [TEMPLATE], what);
    }
    // The lead names the run their programme names, and a run of this course.
    assert.equal((await listAs("claudia")).status, 403, "no run named");
    assert.equal((await listAs("claudia", `?runId=${RUN.agiSpring}`)).status, 403, "a run of the course the lead's programme does not name");
    assert.equal((await listAs("claudia", `?runId=${RUN.tais}`)).status, 403, "a run of another course");
    assert.equal((await ask("claudia", listRoute.GET, { courseId: COURSE.tais }, { query: `?runId=${RUN.agi}` })).status, 403, "another course's list");
    assert.equal((await listAs("tess", `?runId=${RUN.agi}`)).status, 403, "the lead of another programme");
  });

  test("copying in: admins and approvers, and the programme's lead only to fill; nobody else; no view-as session", async () => {
    for (const [who, what] of CALLERS) {
      start();
      const before = everything();
      const answer = await copyIn(who);
      const want = ["zach", "april", "claudia"].includes(who) ? 200 : who === null ? 401 : 403;
      assert.equal(answer.status, want, `${what}: ${JSON.stringify(answer.body)}`);
      if (want !== 200) assert.equal(everything(), before, `${what} wrote something`);
    }
    start();
    const before = everything();
    assert.deepEqual([(await copyIn("claudia", { templateId: TEMPLATE })).status, (await copyIn("claudia", { templateId: TEMPLATE, replace: true })).status], [403, 403]);
    assert.equal((await copyIn("claudia", { templateId: TEMPLATE })).body.error, words.FILL_ONLY_FOR_LEAD);
    assert.equal((await copyIn("claudia", { templateId: TEMPLATE, fill: true, replace: true })).status, 400);
    for (const who of ["claudia", "zach"]) assert.equal((await copyIn(who, undefined, { viewAs: true })).status, 403, who);
    assert.equal(everything(), before);
  });

  test("saving and deleting stay an admin's: the lead, an approver and everybody else are refused", async () => {
    const before = everything();
    for (const [who, what] of CALLERS) {
      if (who === "zach") continue;
      const saved = await ask(who, listRoute.POST, { courseId: COURSE.agi }, { body: { label: "Mine", sourceRunId: RUN.agi } });
      const deleted = await ask(who, deleteRoute.DELETE, { templateId: TEMPLATE });
      const want = who === null ? 401 : 403;
      assert.deepEqual([saved.status, deleted.status], [want, want], what);
    }
    assert.equal(everything(), before);
  });
});

describe("2. the copy fills weeks that are empty, and nothing else", () => {
  test("an empty run: every week of the plan is written, unpublished, at its number's address, and nothing past the plan", async () => {
    for (let n = 1; n <= 6; n += 1) await world.db.collection(RUN_WEEKS).doc(`w0${n}`).delete();
    const plan = JSON.stringify(world.db.read(`courseRuns/${RUN.agi}`).weekPlan);
    const answer = await copyIn("claudia");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.copied, answer.body.left, answer.body.extra, answer.body.copiedWeeks], [6, 0, 0, [1, 2, 3, 4, 5, 6]]);
    for (let n = 1; n <= 6; n += 1) {
      const week = world.db.read(weekPath(n));
      assert.deepEqual([week.weekNumber, week.title, week.published, week.questions, week.materials[0].id, week.updatedByUid], [n, `Template week ${n}`, false, [`A question for week ${n}`], `m_tpl_${n}`, "claudia"], `week ${n}`);
      for (const own of ["ready", "pitching", "ownerUid"]) assert.equal(own in week, false, `week ${n} carries ${own}`);
    }
    assert.equal(world.db.read(`${RUN_WEEKS}/w07`), undefined);
    assert.equal(JSON.stringify(world.db.read(`courseRuns/${RUN.agi}`).weekPlan), plan, "the week plan is never touched");
    assert.deepEqual([world.db.read(`courseRuns/${RUN.agi}`).templateId, world.db.read(`courseRuns/${RUN.agi}`).templateLabel], [TEMPLATE, "AGI Strategy, six weeks"]);
  });

  test("a written week, a titled-only week and a week with a group's own copy are left as they are; the empty ones are filled", async () => {
    await mixedRun();
    const before = runWeeks();
    const groupCopy = JSON.stringify(world.db.read(`courseGroups/${A}/weeks/w04`));
    const paths = underWeeks();
    const answer = await copyIn("claudia");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.copied, answer.body.left, answer.body.copiedWeeks], [2, 4, [5, 6]]);
    for (const n of [1, 2, 3, 4]) assert.equal(JSON.stringify(world.db.read(weekPath(n))), before[weekPath(n)], `week ${n} changed`);
    assert.equal(JSON.stringify(world.db.read(`courseGroups/${A}/weeks/w04`)), groupCopy, "the group's own copy changed");
    for (const n of [5, 6]) assert.equal(world.db.read(weekPath(n)).title, `Template week ${n}`);
    for (const path of paths) assert.ok(world.db.read(path) !== undefined, `${path} was deleted`);
    assert.equal(words.copiedInWords(answer.body.copied, answer.body.left, answer.body.extra), "Copied 2 weeks in. Weeks that had anything in them were left as they were.");
  });

  test("a run somebody has started is copied into the same way: only its empty weeks, and nobody's work is touched", async () => {
    await mixedRun();
    world.db.seed(`courseProgress/${RUN.agi}__chloe__m_w1`, { runId: RUN.agi, uid: "chloe", itemId: "m_w1", completed: true, privateNote: "mine" });
    world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w01__e1`, { runId: RUN.agi, uid: "chloe", weekId: "w01", exerciseId: "e1", answer: "My answer" });
    const work = JSON.stringify([world.db.read(`courseProgress/${RUN.agi}__chloe__m_w1`), world.db.read(`courseExerciseResponses/${RUN.agi}__chloe__w01__e1`)]);
    const before = runWeeks();
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied, answer.body.left], [200, 2, 4]);
    for (const n of [1, 2, 3, 4]) assert.equal(JSON.stringify(world.db.read(weekPath(n))), before[weekPath(n)], `week ${n} changed`);
    assert.equal(JSON.stringify([world.db.read(`courseProgress/${RUN.agi}__chloe__m_w1`), world.db.read(`courseExerciseResponses/${RUN.agi}__chloe__w01__e1`)]), work);
  });

  test("a template with more weeks than the run: the weeks past the run's last are not copied, and the line counts only what was written", async () => {
    start({ weeks: 8 });
    for (let n = 1; n <= 6; n += 1) await world.db.collection(RUN_WEEKS).doc(`w0${n}`).delete();
    const answer = await copyIn("zach");
    assert.deepEqual([answer.status, answer.body.copied, answer.body.left, answer.body.extra], [200, 6, 0, 2]);
    assert.equal(world.db.read(`${RUN_WEEKS}/w07`), undefined);
    assert.equal(world.db.read(`${RUN_WEEKS}/w08`), undefined);
    assert.equal(words.copiedInWords(6, 0, 2), "Copied 6 weeks in. 2 of the template’s weeks are past this run’s last week, so they weren’t copied.");
  });

  test("the same copy twice: the second writes nothing", async () => {
    await mixedRun();
    assert.equal((await copyIn("claudia")).status, 200);
    const before = everything();
    const again = await copyIn("claudia");
    assert.deepEqual([again.status, again.body.copied, again.body.left], [200, 0, 6]);
    assert.equal(everything(), before);
    assert.equal(words.copiedInWords(0, 6, 0), "No weeks were copied in. Weeks that had anything in them were left as they were.");
  });

  test("an older copy's Replace stays where it was, an approver's, and is never this page's", async () => {
    // Replace still refuses once anybody has started the run.
    world.db.seed(`courseProgress/${RUN.agi}__chloe__m_w1`, { runId: RUN.agi, uid: "chloe", itemId: "m_w1", completed: true });
    const before = everything();
    assert.equal((await copyIn("zach", { templateId: TEMPLATE, replace: true })).status, 409);
    assert.equal((await copyIn("zach", { templateId: TEMPLATE })).status, 409);
    assert.equal(everything(), before);
  });

  // A Replace (an approver's, never this page's) leaves published every week
  // a live group has met for, as the unpublish route does: weeks 1 and 2
  // have met for every group by Tue 17 Nov, weeks 5 and 6 for none.
  test("an approver's Replace never unpublishes or deletes a published week a live group has met for, and nothing is written", async () => {
    const met = olderWords.weekStaysPublishedWords;
    // The template's week 1 is not published: the Replace would take the run's back.
    start({ over: { [`courseTemplates/${TEMPLATE}/weeks/w01`]: { ...templateSeed()[`courseTemplates/${TEMPLATE}/weeks/w01`], published: false } } });
    let before = everything();
    for (const who of ["zach", "april"]) {
      const answer = await copyIn(who, { templateId: TEMPLATE, replace: true });
      assert.deepEqual([answer.status, answer.body.error, answer.body.inUse], [409, met(1), "met"], who);
    }
    assert.equal(everything(), before);
    // The template has no week 2: the Replace would delete the run's.
    const without = templateSeed();
    delete without[`courseTemplates/${TEMPLATE}/weeks/w02`];
    w.reset(weeksTabSeed({ ...without, "users/april": userDoc(CAST.april) }));
    world.db.poke("users/april", { permissions: CAST.april.permissions });
    before = everything();
    const deleting = await copyIn("zach", { templateId: TEMPLATE, replace: true });
    assert.deepEqual([deleting.status, deleting.body.error, deleting.body.inUse], [409, met(2), "met"]);
    assert.equal(everything(), before);
    // Everybody else is refused a Replace as before, before any of this is asked.
    for (const [who] of CALLERS.filter(([who]) => !["zach", "april"].includes(who))) {
      const answer = await copyIn(who, { templateId: TEMPLATE, replace: true });
      assert.ok([401, 403].includes(answer.status), `${who}: ${answer.status}`);
    }
    assert.equal(everything(), before);
  });

  test("a Replace that keeps every met week published goes on, and takes back or removes a week nobody has met for", async () => {
    // Every template week published, and no week 6: weeks 1 to 5 replaced, week 6 (unpublished, unmet) removed.
    const short = templateSeed(5);
    start({ weeks: 5, over: short });
    const answer = await copyIn("zach", { templateId: TEMPLATE, replace: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.removedIds, ["w06"]);
    assert.equal(world.db.read(weekPath(1)).title, "Template week 1");
    assert.equal(world.db.read(weekPath(1)).published, true);
    // A published week nobody has met for (week 4) may be taken back.
    start({ over: { [`courseTemplates/${TEMPLATE}/weeks/w04`]: { ...templateSeed()[`courseTemplates/${TEMPLATE}/weeks/w04`], published: false } } });
    const early = await copyIn("april", { templateId: TEMPLATE, replace: true });
    assert.equal(early.status, 200, JSON.stringify(early.body));
    assert.equal(world.db.read(weekPath(4)).published, false);
  });

  test("what empty means, field by field", () => {
    assert.equal(fill.weekDocIsEmpty(undefined), true);
    assert.equal(fill.weekDocIsEmpty({ weekNumber: 3, title: " ", summary: "", materials: [], exercises: [], checklist: [], guideBlocks: [], questions: [], estimatedMinutes: null, published: false, ready: false, pitching: false, ownerUid: null, updatedAt: NOW, updatedByUid: "claudia" }), true);
    for (const [field, value] of [
      ["title", "Only a title"],
      ["summary", "A summary"],
      ["questions", ["A question"]],
      ["estimatedMinutes", 30],
      ["blocks", [{ id: "b1", type: "text" }]],
      ["materials", [{ id: "m1" }]],
      ["exercises", [{ id: "e1" }]],
      ["checklist", [{ id: "c1" }]],
      ["guideBlocks", [{ type: "paragraph" }]],
      ["published", true],
      ["ready", true],
      ["pitching", true],
      ["ownerUid", "yusuf"],
      ["mode", "virtual"],
      ["review", { at: "x" }],
    ]) {
      assert.equal(fill.weekDocIsEmpty({ weekNumber: 3, [field]: value }), false, field);
    }
  });
});

describe("2b. the copy writes weeks and nothing else", () => {
  const RUN_PATH = `courseRuns/${RUN.agi}`;
  /** A template that also holds a Start here and a Glossary, on a run with neither. */
  async function withGuide() {
    start({ over: {} });
    world.db.poke(`courseTemplates/${TEMPLATE}`, { startHere: startHereDoc(), glossary: glossaryDoc() });
    const guideModel = await lib("courses", "guide", "model.ts");
    assert.deepEqual(Object.keys(guideModel.runGuideFields(world.db.read(`courseTemplates/${TEMPLATE}`))).sort(), ["glossary", "startHere"], "the template's guide reads back");
    assert.deepEqual(Object.keys(guideModel.runGuideFields(world.db.read(RUN_PATH))), [], "the run has neither");
  }

  test("a run with neither document and every week written: nothing is copied, and the run still holds neither", async () => {
    await withGuide();
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied, answer.body.left], [200, 0, 6]);
    assert.equal("guide" in answer.body, false);
    const run = world.db.read(RUN_PATH);
    assert.deepEqual(["startHere" in run, "glossary" in run], [false, false]);
  });

  test("a run with neither document and empty weeks: the weeks are copied, and the run still holds neither", async () => {
    await withGuide();
    for (let n = 1; n <= 6; n += 1) await world.db.collection(RUN_WEEKS).doc(`w0${n}`).delete();
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied], [200, 6]);
    const run = world.db.read(RUN_PATH);
    assert.deepEqual(["startHere" in run, "glossary" in run], [false, false]);
  });

  test("the fill's code never reads or writes a run's Start here or Glossary", () => {
    const code = readFileSync(join(SRC, "lib", "courses", "weeksTab", "fill.ts"), "utf8");
    assert.doesNotMatch(code, /runGuideFields|RUN_GUIDE_FIELDS|\bstartHere\b|\bglossary\b/);
  });

  test("a template week that holds nothing is never written or counted, past the plan or not", async () => {
    start({ weeks: 7 });
    for (let n = 1; n <= 6; n += 1) await world.db.collection(RUN_WEEKS).doc(`w0${n}`).delete();
    const empty = { weekNumber: 0, title: "", summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: true };
    world.db.seed(`courseTemplates/${TEMPLATE}/weeks/w05`, { ...empty, weekNumber: 5 });
    world.db.seed(`courseTemplates/${TEMPLATE}/weeks/w07`, { ...empty, weekNumber: 7 });
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.body.copied, answer.body.copiedWeeks, answer.body.extra], [5, [1, 2, 3, 4, 6], 0]);
    assert.equal(world.db.read(weekPath(5)), undefined, "an empty template week wrote a page");
    // The list counts the same weeks: five that hold something.
    assert.match((await draw("claudia", CopyPage, PARAMS)).text, /Saved on Mon 19 Oct by Zach Levin · 5 weeks Copy it in/);
  });

  test("a run already stamped with a template keeps its stamp", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { templateId: "an-earlier-template", templateLabel: "An earlier template" });
    await world.db.collection(RUN_WEEKS).doc("w06").delete();
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied], [200, 1]);
    const run = world.db.read(`courseRuns/${RUN.agi}`);
    assert.deepEqual([run.templateId, run.templateLabel], ["an-earlier-template", "An earlier template"]);
  });

  test("an archived group's own copy of a week leaves that week as it is", async () => {
    await world.db.collection(RUN_WEEKS).doc("w06").delete();
    world.db.poke(`courseGroups/${A}`, { archived: true });
    world.db.seed(`courseGroups/${A}/weeks/w06`, { weekNumber: 6, title: "Group A's own week 6", materials: [] });
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied, answer.body.left], [200, 0, 6]);
    assert.equal(world.db.read(weekPath(6)), undefined);
  });

  test("a run whose plan has no weeks is told so, and nothing is written", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { weekPlan: [] });
    const before = everything();
    const answer = await copyIn("claudia");
    assert.deepEqual([answer.status, answer.body.copied, answer.body.planWeeks], [200, 0, 0]);
    assert.equal(everything(), before);
    assert.equal(words.copiedInWords(0, 0, 6, 0), "This run’s plan has no weeks yet, so nothing was copied in.");
  });
});

describe("3. a template holds nobody's work", () => {
  test("saving this term's weeks keeps their content and three counts, and no member's id, answer or note", async () => {
    world.db.seed(`courseProgress/${RUN.agi}__chloe__m_w1`, { runId: RUN.agi, uid: "chloe", itemId: "m_w1", completed: true, rating: 4, privateNote: "A private note" });
    world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w01__e1`, { runId: RUN.agi, uid: "chloe", weekId: "w01", exerciseId: "e1", answer: "Chloe's own answer" });
    world.db.poke(weekPath(1), { ownerUid: "yusuf", updatedByUid: "claudia" });
    const saved = await ask("zach", listRoute.POST, { courseId: COURSE.agi }, { body: { label: "This term", sourceRunId: RUN.agi } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const held = world.db.paths().filter((path) => path.startsWith(`courseTemplates/${saved.body.templateId}`));
    assert.ok(held.length > 1, "the template and its weeks");
    const wire = JSON.stringify(held.map((path) => world.db.read(path)));
    const people = world.db.paths().filter((path) => /^users\/[^/]+$/.test(path)).map((path) => path.slice(6)).filter((uid) => uid !== "zach");
    for (const uid of people) assert.ok(!wire.includes(`"${uid}"`), `the template carries ${uid}'s id`);
    for (const work of ["privateNote", "A private note", "Chloe's own answer", "updatedByUid", "ownerUid"]) assert.ok(!wire.includes(work), `the template carries ${work}`);
  });

  test("the sentence under the name says what it holds, and no breaks", () => {
    assert.equal(words.TEMPLATE_HOLDS, "Saves each week’s blocks, title, summary and questions, in order. Never anybody’s work.");
    assert.doesNotMatch(words.TEMPLATE_HOLDS, /break/i);
    assert.equal(words.templateLine("Mon 19 Oct", "Zach Levin", 6), "Saved on Mon 19 Oct by Zach Levin · 6 weeks");
  });
});

describe("4. a deleted template", () => {
  test("is gone, and the run made from it keeps its weeks", async () => {
    for (let n = 1; n <= 6; n += 1) await world.db.collection(RUN_WEEKS).doc(`w0${n}`).delete();
    assert.equal((await copyIn("claudia")).status, 200);
    const weeks = runWeeks();
    const deleted = await ask("zach", deleteRoute.DELETE, { templateId: TEMPLATE });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(world.db.paths().filter((path) => path.startsWith("courseTemplates/")).length, 0);
    assert.deepEqual(runWeeks(), weeks);
    assert.equal((await copyIn("claudia")).status, 404);
  });
});

describe("5. the page", () => {
  test("an admin: the board's lede, the other runs, the saved template with Copy it in and Delete…, and saving", async () => {
    const { text, html } = await draw("zach", CopyPage, PARAMS);
    assert.match(
      text,
      /Copy weeks from the course Copying fills weeks that are empty\. A week with anything in it is left as it is\. Other runs of AGI Strategy Fellowship /,
    );
    assert.match(text, /Saved templates AGI Strategy, six weeks Saved on Mon 19 Oct by Zach Levin · 6 weeks Copy it in Delete…/);
    assert.match(text, /Save this term’s weeks as a template Template name Saves each week’s blocks, title, summary and questions, in order\. Never anybody’s work\. Save the template/);
    assert.match(html, /placeholder="e\.g\. AGI Strategy Fellowship, 6 weeks"/);
    assert.doesNotMatch(text, /break/i);
    // Drawn disabled until the page's script arrives.
    assert.match(html, /<button type="button"[^>]*disabled=""[^>]*>Copy it in<\/button>/);
  });

  test("the lead: the saved template to copy in, and no Delete… and no saving", async () => {
    const { text } = await draw("claudia", CopyPage, PARAMS);
    assert.match(text, /Saved templates AGI Strategy, six weeks Saved on Mon 19 Oct by Zach Levin · 6 weeks Copy it in/);
    for (const absent of ["Delete…", "Save this term’s weeks as a template", "Save the template"]) assert.ok(!text.includes(absent), absent);
  });

  test("a course with no templates says so", async () => {
    await world.db.collection(`courseTemplates/${TEMPLATE}/weeks`).doc("w01").delete();
    world.db.poke(`courseTemplates/${TEMPLATE}`, { courseId: COURSE.tais });
    assert.match((await draw("claudia", CopyPage, PARAMS)).text, /Saved templates No templates of AGI Strategy Fellowship are saved yet\./);
  });

  test("a reviewer, the lead of another programme and everybody else never see a template", async () => {
    assert.match((await draw("lloyd", CopyPage, PARAMS)).text, /Only the programme’s lead and admins can open Weeks/);
    assert.match((await draw("tess", CopyPage, PARAMS)).text, /There is no programme here/);
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia", "tess", "lloyd"].includes(who)) continue;
      const page = await draw(who, CopyPage, PARAMS);
      assert.equal(page.to, "/dashboard", what);
      assert.ok(!page.text.includes("AGI Strategy, six weeks"), what);
    }
  });

  test("the copy press always asks to fill, and never to replace", () => {
    const code = readFileSync(join(SRC, "features", "applications", "weeks", "SavedTemplates.tsx"), "utf8");
    assert.match(code, /apply-template`, "POST", \{ templateId: row\.id, fill: true \}\)/);
    assert.doesNotMatch(code, /replace/);
    assert.equal([...code.matchAll(/\bsend\(/g)].length, 4, "the helper and its three presses");
  });
});
