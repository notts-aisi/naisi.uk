/**
 * A run's week plan on its programme's Weeks tab: the one checked route that
 * adds a week at the end, adds a break after a week, moves a week or a break
 * by one and removes one, and the list that offers each only where the route
 * would take it. Driven as every kind of reader, against every state the
 * owner's rule names, on AGI Strategy's run, Tue 17 Nov 2026 at noon.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Real: the Weeks tab page, the route, every library under them
 * (`tests/lib/weeksTabWorld.mjs`). "Quiet" below is the run as a draft with
 * nobody on it: decisions not sent, no places, no groups, no register; its
 * weeks are written here (week 2 in blocks, with saved versions; weeks 1, 3
 * and 4 with a title and settings; weeks 5 and 6 with no page yet).
 *
 * Section 9 walks the tree: every collection that stores a week's number or
 * address is either counted by the owner's rule or written down here with
 * why it need not be.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { CAST } from "./lib/handoverWorld.mjs";
import { AGI, COURSE, NOW, PERSONAS, ROUND, RUN, makeWeeksTabWorld, weeksTabSeed } from "./lib/weeksTabWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

/** A course approver, named on nothing. */
const approver = session("april", "member", false, "April Stone");
CAST.april = { ...approver, permissions: { ...approver.permissions, approveCourse: true } };

const w = await makeWeeksTabWorld("__weekPlan");
const { world, draw, tabsPage, call, courseRoute, loadTs } = w;
const TabPage = await tabsPage("weeks", "page.tsx");
const planRoute = await courseRoute("runs", "[runId]", "week-plan");
const words = await loadTs(join("lib", "courses", "weekPlanEdit", "words.ts"));
const model = await loadTs(join("lib", "courses", "weekPlanEdit", "model.ts"));
const facts = await loadTs(join("lib", "courses", "weekPlanEdit", "facts.ts"));
const kept = await loadTs(join("lib", "courses", "weekPlanEdit", "kept.ts"));
const view = await loadTs(join("lib", "courses", "weekPlanEdit", "view.ts"));
const draftExit = await loadTs(join("lib", "courses", "draftExit.ts"));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORM = `admissionRounds/${ROUND}`;
const RUN_PATH = `courseRuns/${RUN.agi}`;
const weekPath = (id) => `${RUN_PATH}/weeks/${id}`;
const historyPath = (id, save) => `${weekPath(id)}/history/${save}`;
const lockPath = (id) => `${weekPath(id)}/editLock/current`;
const PARAMS = { roundId: ROUND, programmeId: AGI };
const ALL = [...PERSONAS, ["april", "a course approver"]];
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
const plan = () => world.db.read(RUN_PATH).weekPlan;
const keyNow = () => model.planKeyOf(plan());
const titleAt = (id) => world.db.read(weekPath(id))?.title;
const historyAt = (id) => world.db.paths().filter((path) => path.startsWith(`${weekPath(id)}/history/`)).sort();

const week = (n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` });
const SIX = [1, 2, 3, 4, 5, 6].map(week);

/** The run as a draft with nobody on it, its weeks as the file's header says. */
function quietSeed(over = {}) {
  const seed = weeksTabSeed();
  for (const path of Object.keys(seed)) {
    const doc = seed[path];
    if (path.startsWith(`${RUN_PATH}/weeks/`)) delete seed[path];
    else if (path.startsWith("courseAttendance/") && doc.runId === RUN.agi) delete seed[path];
    else if (path.startsWith("courseEnrolments/") && doc.runId === RUN.agi) delete seed[path];
    else if (path.startsWith("courseGroups/") && doc.runId === RUN.agi) delete seed[path];
  }
  seed[RUN_PATH] = { ...seed[RUN_PATH], status: "draft", startDate: "2027-02-01", weekPlan: SIX };
  seed[FORM] = { ...seed[FORM], decisionsSentAt: null };
  seed[weekPath("w01")] = { weekNumber: 1, title: "What’s at stake", summary: "Why it matters.", published: false, ownerUid: "claudia" };
  seed[weekPath("w02")] = {
    weekNumber: 2,
    title: "How fast",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: ["What changed?"],
    estimatedMinutes: null,
    published: false,
    blocks: syntheticWeekBlocks(),
  };
  seed[historyPath("w02", "s000001")] = { seq: 1, kind: "found", byUid: null, summary: "As found", fingerprint: "a", blocks: [] };
  seed[historyPath("w02", "s000002")] = { seq: 2, kind: "paste", byUid: "claudia", summary: "Pasted", fingerprint: "b", blocks: [] };
  seed[weekPath("w03")] = { weekNumber: 3, title: "Who decides", published: false };
  seed[weekPath("w04")] = { weekNumber: 4, title: "Where it could go wrong", published: false };
  return { ...seed, ...over };
}

/** A place on the run, handed over and nothing done with it. */
const place = (uid, over = {}) => ({
  [`courseEnrolments/${RUN.agi}__${uid}`]: { runId: RUN.agi, courseId: COURSE.agi, uid, role: "learner", status: "active", groupId: null, allocatedEmailAt: null, ...over },
});

const step = (who, body, extra = {}) => call(who, planRoute.POST, { runId: RUN.agi }, { body: { planKey: keyNow(), ...body }, course: true, ...extra });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset(quietSeed({ "users/april": { ...userDoc(CAST.april), permissions: CAST.april.permissions } }));
});

// ---------------------------------------------------------------------------
// 1. Who may change the plan
// ---------------------------------------------------------------------------

describe("1. who may change the plan", () => {
  test("the lead and an admin; everybody else one 403, a view-as session first, nobody signed out", async () => {
    for (const who of ["zach", "claudia"]) {
      w.reset(quietSeed());
      const answer = await step(who, { action: "add-week" });
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      assert.deepEqual(answer.body, { ok: true, message: "Week 7 added." });
      assert.equal(plan().length, 7, who);
    }
    w.reset(quietSeed({ "users/april": { ...userDoc(CAST.april), permissions: CAST.april.permissions } }));
    const before = everything();
    for (const [who, what] of ALL) {
      if (who === "zach" || who === "claudia") continue;
      const answer = await step(who, { action: "add-week" });
      assert.equal(answer.status, who === null ? 401 : 403, `${what}: ${JSON.stringify(answer.body)}`);
      if (who !== null) assert.equal(answer.body.error, words.PLAN_NOT_YOURS, what);
    }
    assert.equal((await step("zach", { action: "add-week" }, { viewAs: true })).status, 403);
    assert.equal((await step("claudia", { action: "add-week" }, { viewAs: true })).status, 403);
    assert.equal(everything(), before, "a refused change wrote");
  });

  test("a body that says no change is a 400, before anything of the run is read", async () => {
    const before = everything();
    for (const body of [null, {}, { action: "add-week" }, { action: "jump", planKey: "" }, { action: "move", index: -1, direction: "up", planKey: "" }, { action: "move", index: 1, direction: "sideways", planKey: "" }]) {
      const answer = await call("zach", planRoute.POST, { runId: RUN.agi }, { body, course: true });
      assert.equal(answer.status, 400, JSON.stringify(body));
      assert.equal(answer.body.error, words.PLAN_BODY);
    }
    assert.equal(everything(), before);
  });

  test("a run no programme names keeps its run editor's plan; a run that is not there is no run", async () => {
    world.db.poke(FORM, { [`programmes.${AGI}.runId`]: null });
    const before = everything();
    const admin = await step("zach", { action: "add-week" });
    assert.deepEqual([admin.status, admin.body.error], [409, words.NOT_NAMED]);
    // The lead leads nothing that names it now.
    assert.equal((await step("claudia", { action: "add-week" })).status, 403);
    const gone = await call("zach", planRoute.POST, { runId: "no-such-run" }, { body: { action: "add-week", planKey: "" }, course: true });
    assert.deepEqual([gone.status, gone.body.error], [404, words.RUN_GONE]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Each change, on a run with nobody on it
// ---------------------------------------------------------------------------

describe("2. each change keeps every week at its number's address", () => {
  /** Every week of the plan at its own number's address, numbered in order. */
  function canonical() {
    let n = 0;
    for (const entry of plan()) {
      if (entry.kind !== "week") continue;
      n += 1;
      assert.deepEqual(entry, week(n));
      const stored = world.db.read(weekPath(entry.weekId));
      if (stored) assert.equal(stored.weekNumber, n, `${entry.weekId} carries week ${stored.weekNumber}`);
    }
  }

  test("Add a week: at the end, at its own address; a page already there becomes its page", async () => {
    let answer = await step("claudia", { action: "add-week" });
    assert.equal(answer.status, 200);
    assert.deepEqual(plan().at(-1), week(7));
    canonical();
    world.db.seed(weekPath("w08"), { weekNumber: 8, title: "Copied in from the course" });
    answer = await step("claudia", { action: "add-week" });
    assert.deepEqual(answer.body, { ok: true, message: "Week 8 added. It holds the page already kept at its address." });
    assert.equal(titleAt("w08"), "Copied in from the course");
    canonical();
  });

  test("Add a break: after the week named, labelled, and no week's page moves", async () => {
    const weeksBefore = JSON.stringify(world.db.paths().filter((path) => path.includes("/weeks/")).sort().map((path) => [path, world.db.read(path)]));
    const answer = await step("claudia", { action: "add-break", afterWeek: 2, label: "  Reading   week " });
    assert.deepEqual(answer.body, { ok: true, message: "Reading week added after week 2." });
    assert.deepEqual(plan(), [week(1), week(2), { kind: "break", label: "Reading week" }, week(3), week(4), week(5), week(6)]);
    const weeksAfter = JSON.stringify(world.db.paths().filter((path) => path.includes("/weeks/")).sort().map((path) => [path, world.db.read(path)]));
    assert.equal(weeksAfter, weeksBefore, "a break moved a week's page");
    for (const body of [{ afterWeek: 2, label: "   " }, { afterWeek: 2, label: "x".repeat(81) }]) {
      const refused = await step("claudia", { action: "add-break", ...body });
      assert.deepEqual([refused.status, refused.body.error], [400, words.BREAK_LABEL_PROBLEM]);
    }
    const nowhere = await step("claudia", { action: "add-break", afterWeek: 9, label: "Exams" });
    assert.deepEqual([nowhere.status, nowhere.body.error], [409, words.NO_SUCH_ENTRY]);
  });

  test("Move: two weeks change places with everything stored under them, history and all", async () => {
    const one = world.db.read(weekPath("w01"));
    const two = world.db.read(weekPath("w02"));
    const saves = historyAt("w02").map((path) => world.db.read(path));
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual(answer.body, { ok: true, message: "Moved." });
    canonical();
    assert.deepEqual(world.db.read(weekPath("w01")), { ...two, weekNumber: 1 }, "week 1 is not what was week 2, every field kept");
    assert.deepEqual(world.db.read(weekPath("w02")), { ...one, weekNumber: 2 });
    assert.deepEqual(historyAt("w01").map((path) => world.db.read(path)), saves, "the saved versions did not move with their week");
    assert.deepEqual(historyAt("w02"), [], "saved versions were left at the old address");
    // And back: the run is as it was.
    await step("zach", { action: "move", index: 1, direction: "up" });
    assert.deepEqual(world.db.read(weekPath("w01")), one);
    assert.deepEqual(world.db.read(weekPath("w02")), two);
    assert.equal(historyAt("w02").length, 2);
    // Off either end is no move.
    const top = await step("zach", { action: "move", index: 0, direction: "up" });
    assert.deepEqual([top.status, top.body.error], [400, words.CANNOT_MOVE]);
  });

  test("Move past a break: the week keeps its number and its page, only its dates change", async () => {
    await step("zach", { action: "add-break", afterWeek: 1, label: "Reading week" });
    const pages = everything().length;
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(plan().slice(0, 3), [{ kind: "break", label: "Reading week" }, week(1), week(2)]);
    assert.equal(titleAt("w01"), "What’s at stake");
    assert.ok(Math.abs(everything().length - pages) < 4, "something besides the plan changed");
    canonical();
  });

  test("a break at each end: moved to the top, and added after the last week", async () => {
    await step("zach", { action: "add-break", afterWeek: 1, label: "Induction" });
    await step("zach", { action: "move", index: 1, direction: "up" });
    await step("zach", { action: "add-break", afterWeek: 6, label: "Exams" });
    assert.deepEqual(plan().at(0), { kind: "break", label: "Induction" });
    assert.deepEqual(plan().at(-1), { kind: "break", label: "Exams" });
    canonical();
  });

  test("Remove a week with only a title: its page goes, and every later week moves up with its own", async () => {
    const four = world.db.read(weekPath("w04"));
    const answer = await step("claudia", { action: "remove", index: 2 });
    assert.deepEqual(answer.body, { ok: true, message: "Week 3 removed." });
    assert.equal(plan().length, 5);
    canonical();
    assert.deepEqual(world.db.read(weekPath("w03")), { ...four, weekNumber: 3 }, "week 4 did not move up to week 3's address");
    assert.equal(world.db.read(weekPath("w04")), undefined, "week 4's old address still holds a page");
    assert.equal(titleAt("w02"), "How fast");
  });

  test("Remove the last week with no page, and a break: nothing is deleted", async () => {
    await step("claudia", { action: "add-break", afterWeek: 3, label: "Reading week" });
    const before = world.db.paths().filter((path) => path.includes("/weeks/")).sort();
    let answer = await step("claudia", { action: "remove", index: 3 });
    assert.deepEqual(answer.body, { ok: true, message: "Reading week removed." });
    answer = await step("claudia", { action: "remove", index: 5 });
    assert.deepEqual(answer.body, { ok: true, message: "Week 6 removed." });
    assert.deepEqual(world.db.paths().filter((path) => path.includes("/weeks/")).sort(), before);
    assert.deepEqual(plan(), [1, 2, 3, 4, 5].map(week));
  });

  test("a week with blocks, older material or saved versions is never removed, and nothing is written", async () => {
    const before = everything();
    const blocks = await step("zach", { action: "remove", index: 1 });
    assert.deepEqual([blocks.status, blocks.body.error], [409, "Week 2 has blocks in it. Copy what you need, then remove it, or leave it and add a week."]);
    world.db.poke(weekPath("w03"), { materials: [{ id: "m1", title: "A reading" }] });
    const older = await step("zach", { action: "remove", index: 2 });
    assert.deepEqual([older.status, older.body.error], [409, words.removeHasOlderMaterial(3)]);
    world.db.seed(weekPath("w04"), { weekNumber: 4, title: "Where it could go wrong", blocks: [] });
    world.db.seed(historyPath("w04", "s000001"), { seq: 1, kind: "paste", blocks: [] });
    const history = await step("zach", { action: "remove", index: 3 });
    assert.deepEqual([history.status, history.body.error], [409, words.removeHasHistory(4)]);
    // The pokes and seeds above are the only differences.
    assert.notEqual(everything(), before);
    assert.deepEqual(plan(), SIX);
  });

  test("an edit at work holds its week; a lapsed one is let go with the move", async () => {
    world.db.seed(lockPath("w02"), { holderUid: "claudia", since: NOW, keptAt: NOW });
    const held = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual([held.status, held.body.error], [409, words.beingEdited(2)]);
    world.db.seed(lockPath("w02"), { holderUid: "claudia", since: new Date(NOW.getTime() - 3_600_000), keptAt: new Date(NOW.getTime() - 3_600_000) });
    const lapsed = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.equal(lapsed.status, 200, JSON.stringify(lapsed.body));
    assert.equal(world.db.read(lockPath("w02")), undefined);
    assert.equal(world.db.read(lockPath("w01")), undefined, "a lock moved with its week");
  });

  test("more saved versions than one change can carry is refused, and nothing moves", async () => {
    for (let i = 3; i <= 240; i += 1) world.db.seed(historyPath("w02", `s${String(i).padStart(6, "0")}`), { seq: i, kind: "edit", blocks: [] });
    const before = everything();
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.tooBigWords(240)]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. The owner's rule, state by state
// ---------------------------------------------------------------------------

describe("3. weeks and breaks move or go only while nothing is kept against the run's weeks", () => {
  const RESHAPES = [
    { action: "move", index: 0, direction: "down" },
    { action: "remove", index: 2 },
  ];
  const ADDS = [{ action: "add-week" }, { action: "add-break", afterWeek: 2, label: "Reading week" }];

  async function heldWith(sentence) {
    const before = everything();
    for (const body of RESHAPES) {
      const answer = await step("claudia", body);
      assert.deepEqual([answer.status, answer.body.error], [409, sentence], JSON.stringify(body));
    }
    assert.equal(everything(), before, "a refused change wrote");
    for (const body of ADDS) {
      const answer = await step("claudia", body);
      assert.equal(answer.status, 200, `${JSON.stringify(body)}: ${JSON.stringify(answer.body)}`);
    }
  }

  test("people handed over and nothing done: weeks still move, all but week 1", async () => {
    w.reset(quietSeed({ ...place("amara"), ...place("bea"), [FORM]: { ...quietSeed()[FORM], decisionsSentAt: new Date("2026-11-01T09:00:00Z") } }));
    const answer = await step("claudia", { action: "move", index: 2, direction: "down" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    // Once decisions have gone out, which page is week 1 stays as it is.
    for (const body of [{ action: "move", index: 0, direction: "down" }, { action: "move", index: 1, direction: "up" }, { action: "remove", index: 0 }]) {
      const held = await step("claudia", body);
      assert.deepEqual([held.status, held.body.error], [409, words.WEEK_ONE_FIXED], JSON.stringify(body));
    }
  });

  test("a ready week 2 moved up would open week 1 at once: refused once decision day has begun, even part sent", async () => {
    // Decision day under way: one person told, the form not yet stamped as sent.
    const form = quietSeed()[FORM];
    w.reset(
      quietSeed({
        [FORM]: { ...form, decisionsSentAt: null, applicationCounts: { ...(form.applicationCounts ?? {}), accepted: 1 } },
        [weekPath("w02")]: { ...quietSeed()[weekPath("w02")], published: true, ready: true },
      }),
    );
    const before = everything();
    const answer = await step("claudia", { action: "move", index: 1, direction: "up" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.WEEK_ONE_FIXED]);
    assert.equal(everything(), before);
  });

  test("one tick, one answer, one pick: weeks stay, a break or a week at the end can still be added", async () => {
    for (const [path, row] of [
      [`courseProgress/${RUN.agi}__amara__item1`, { runId: RUN.agi, uid: "amara", itemId: "item1", completed: true }],
      [`courseExerciseResponses/${RUN.agi}__amara__w01__ex1`, { runId: RUN.agi, uid: "amara", weekId: "w01", exerciseId: "ex1", text: "My answer" }],
      [`coursePacksAndCases/${RUN.agi}__amara__b1`, { runId: RUN.agi, uid: "amara", weekId: "w01", blockId: "b1", kind: "pack" }],
    ]) {
      w.reset(quietSeed({ [path]: row }));
      await heldWith(words.DONE_WORK);
    }
  });

  test("every collection that keeps work or a record against a week holds the weeks with one row", async () => {
    for (const [collection, field] of kept.WORK_COLLECTIONS) {
      const row = field === "runId" ? { runId: RUN.agi } : {};
      w.reset(quietSeed({ [`${collection}/one`]: row }));
      const answer = await step("claudia", RESHAPES[0]);
      assert.deepEqual([answer.status, answer.body.error], [409, words.DONE_WORK], collection);
    }
    for (const [collection, field] of kept.RECORD_COLLECTIONS) {
      const row = field === "runId" ? { runId: RUN.agi } : { sourceRef: { cohortId: RUN.agi } };
      w.reset(quietSeed({ [`${collection}/one`]: row }));
      const answer = await step("claudia", RESHAPES[0]);
      assert.deepEqual([answer.status, answer.body.error], [409, words.DONE_RECORDS], collection);
    }
    // A place with a one-week visit, a move from a week or an answer about the time.
    for (const over of [{ visits: [{ weekNumber: 2, groupId: "g" }] }, { groupsByWeek: [{ groupId: "g", fromWeek: 3 }] }, { timeAnswer: { answer: "mostWeeks" } }]) {
      w.reset(quietSeed(place("amara", over)));
      const answer = await step("claudia", RESHAPES[0]);
      assert.deepEqual([answer.status, answer.body.error], [409, words.DONE_RECORDS], JSON.stringify(over));
    }
  });

  test("a group's own copy of a week, a one-week change, how a week meets, its own calendar", async () => {
    const group = { runId: RUN.agi, courseId: COURSE.agi, name: "Group A", archived: false, facilitatorUids: [], session: { weekday: 3, startTimeLocal: "18:00", durationMinutes: 90 } };
    for (const [label, over] of [
      ["copy", { [`courseGroups/ga/weeks/w02`]: { weekNumber: 2, title: "Group A's own" } }],
      ["change", { "courseGroups/ga": { ...group, sessionOverrides: { w02: { location: "Room 2" } } } }],
      ["mode", { "courseGroups/ga": { ...group, sessionModes: { w03: "virtual" } } }],
      ["change", { "courseGroups/ga": { ...group, sessionChanges: { w03: { kind: "cancelled" } } } }],
      ["calendar", { "courseGroups/ga": { ...group, paceWeekPlan: SIX } }],
    ]) {
      w.reset(quietSeed({ "courseGroups/ga": group, ...over }));
      await heldWith(words.doneGroupWords("Group A", label));
    }
    // A reminder before one of its sessions, kept by the scheduler for the group.
    w.reset(quietSeed({ "courseGroups/ga": group, "schedulerMarkers/weekremind__ga__w01__amara__3": { groupId: "ga", sessionKey: "w01", uid: "amara", daysBefore: "3" } }));
    await heldWith(words.DONE_RECORDS);
    // The run's own fields that name a week.
    for (const over of [{ teamHandIn: { dueOn: null, showcaseWeek: 4 } }, { submissionExerciseRef: { weekId: "w02", exerciseId: "x" } }]) {
      w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], ...over } }));
      await heldWith(words.DONE_RECORDS);
    }
  });

  test("week 1 open to everybody holding a place: decisions sent and week 1 ready", async () => {
    w.reset(
      quietSeed({
        [FORM]: { ...quietSeed()[FORM], decisionsSentAt: new Date("2026-11-01T09:00:00Z") },
        [weekPath("w01")]: { weekNumber: 1, title: "What’s at stake", published: true, ready: true },
      }),
    );
    await heldWith(words.DONE_WEEK_ONE);
    // A decision day that stopped part way: somebody told, the form not stamped. Week 1 is open to them.
    const form = quietSeed()[FORM];
    w.reset(
      quietSeed({
        [FORM]: { ...form, decisionsSentAt: null, applicationCounts: { ...(form.applicationCounts ?? {}), accepted: 1 } },
        [weekPath("w01")]: { weekNumber: 1, title: "What’s at stake", published: true, ready: true },
      }),
    );
    await heldWith(words.DONE_WEEK_ONE);
    // Ready, and nobody told anything yet: nobody holds a place, so weeks move.
    w.reset(quietSeed({ [weekPath("w01")]: { weekNumber: 1, title: "What’s at stake", published: true, ready: true } }));
    assert.equal((await step("claudia", RESHAPES[0])).status, 200);
  });

  test("once the groups have gone out the plan is read only, adds too; a finished, cancelled or archived run likewise", async () => {
    for (const [over, sentence] of [
      [{ [RUN_PATH]: { ...quietSeed()[RUN_PATH], allocationPublishedAt: NOW } }, words.WEEK_PLAN_READ_ONLY],
      [place("amara", { allocatedEmailAt: NOW }), words.WEEK_PLAN_READ_ONLY],
      [{ [RUN_PATH]: { ...quietSeed()[RUN_PATH], status: "completed" } }, words.RUN_FINISHED],
      [{ [RUN_PATH]: { ...quietSeed()[RUN_PATH], status: "cancelled" } }, words.RUN_CANCELLED],
      [{ [RUN_PATH]: { ...quietSeed()[RUN_PATH], archived: true } }, words.RUN_ARCHIVED],
    ]) {
      w.reset(quietSeed(over));
      const before = everything();
      for (const body of [...RESHAPES, ...ADDS]) {
        const answer = await step("zach", body);
        assert.deepEqual([answer.status, answer.body.error], [409, sentence], JSON.stringify(body));
      }
      assert.equal(everything(), before);
    }
    assert.match(words.WEEK_PLAN_READ_ONLY, /^The groups have gone out, so the week plan can’t change here: the groups’ weeks are dated from it\. For a break in one group’s weeks, use Cancel and push the rest back a week on that group’s page, which never moves a week that has met\.$/);
  });

  test("a register or a tick is found after a break is added, as it was", async () => {
    const tick = [`courseProgress/${RUN.agi}__amara__item1`, { runId: RUN.agi, uid: "amara", itemId: "item1", weekNumber: 1, completed: true }];
    const register = [`courseAttendance/${RUN.agi}__ga__w01`, { runId: RUN.agi, groupId: "ga", sessionKey: "w01", marks: {} }];
    w.reset(quietSeed(Object.fromEntries([tick, register])));
    const pages = world.db.paths().filter((path) => path.includes("/weeks/")).sort().map((path) => [path, world.db.read(path)]);
    assert.equal((await step("claudia", { action: "add-break", afterWeek: 1, label: "Reading week" })).status, 200);
    assert.deepEqual(world.db.read(tick[0]), tick[1]);
    assert.deepEqual(world.db.read(register[0]), register[1]);
    assert.deepEqual(world.db.paths().filter((path) => path.includes("/weeks/")).sort().map((path) => [path, world.db.read(path)]), pages);
  });
});

// ---------------------------------------------------------------------------
// 4. The facilitators' guide
// ---------------------------------------------------------------------------

describe("4. the facilitators' guide, kept on the course by week number, never moves under a week", () => {
  const guide = (n, part = "plan") => [`courseFacilitatorGuide/${COURSE.agi}__w0${n}-${part}`, { courseId: COURSE.agi, slot: `w0${n}-${part}`, title: `Week ${n} ${part}`, blocks: [] }];

  test("a move that changes the number of a week with a plan or notes, or would show them against another week, is refused", async () => {
    for (const [n, part] of [[1, "plan"], [2, "notes"]]) {
      w.reset(quietSeed(Object.fromEntries([guide(n, part)])));
      const before = everything();
      const answer = await step("claudia", { action: "move", index: 0, direction: "down" });
      assert.deepEqual([answer.status, answer.body.error], [409, words.guideHolds(n)]);
      assert.equal(everything(), before);
    }
  });

  test("a removal that renumbers a guided week, or removes one, is refused; a break and a week at the end are not", async () => {
    w.reset(quietSeed(Object.fromEntries([guide(5)])));
    const removing = await step("claudia", { action: "remove", index: 2 });
    assert.deepEqual([removing.status, removing.body.error], [409, words.guideHolds(5)]);
    w.reset(quietSeed(Object.fromEntries([guide(6)])));
    const last = await step("claudia", { action: "remove", index: 5 });
    assert.deepEqual([last.status, last.body.error], [409, words.guideHolds(6)]);
    const guideBefore = world.db.read(guide(6)[0]);
    assert.equal((await step("claudia", { action: "add-break", afterWeek: 3, label: "Reading week" })).status, 200);
    assert.equal((await step("claudia", { action: "add-week" })).status, 200);
    assert.deepEqual(world.db.read(guide(6)[0]), guideBefore, "the route wrote the guide");
  });

  test("a move between weeks with nothing in the guide is taken, and the guide, which every run reads, is as it was", async () => {
    w.reset(quietSeed(Object.fromEntries([guide(5), guide(6, "notes")])));
    const stored = world.db.paths().filter((path) => path.startsWith("courseFacilitatorGuide/")).sort().map((path) => [path, world.db.read(path)]);
    assert.equal((await step("claudia", { action: "move", index: 0, direction: "down" })).status, 200);
    assert.equal((await step("claudia", { action: "remove", index: 2 })).status, 409);
    assert.deepEqual(world.db.paths().filter((path) => path.startsWith("courseFacilitatorGuide/")).sort().map((path) => [path, world.db.read(path)]), stored);
  });
});

// ---------------------------------------------------------------------------
// 5. Two changes at once, and a page drawn on an older plan
// ---------------------------------------------------------------------------

describe("5. two changes at once", () => {
  test("a press made on an older drawing is refused, never taken on another plan", async () => {
    const key = keyNow();
    assert.equal((await step("zach", { action: "add-break", afterWeek: 1, label: "Reading week" })).status, 200);
    const before = everything();
    const stale = await call("claudia", planRoute.POST, { runId: RUN.agi }, { body: { action: "remove", index: 1, planKey: key }, course: true });
    assert.deepEqual([stale.status, stale.body.error], [409, words.PLAN_STALE]);
    assert.equal(everything(), before);
  });

  test("a change that lands while another runs makes it run again and meet the refusal", async () => {
    world.db.beforeCommit = () => world.db.poke(RUN_PATH, { weekPlan: [...SIX, { kind: "break", label: "Exams" }] });
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.PLAN_STALE]);
    assert.equal(titleAt("w01"), "What’s at stake");
  });

  test("a tick that lands while a move runs holds the weeks", async () => {
    world.db.beforeCommit = () => world.db.seed(`courseProgress/${RUN.agi}__amara__item1`, { runId: RUN.agi, uid: "amara", itemId: "item1", completed: true });
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.DONE_WORK]);
    assert.equal(titleAt("w01"), "What’s at stake");
  });
});

// ---------------------------------------------------------------------------
// 6. A plan the older editor left with a week at another's address
// ---------------------------------------------------------------------------

describe("6. a plan out of step with its pages, and pages after its last week: never a dead end before groups go out", () => {
  // The older builder's Remove of week 2 from [w01, w02, w03, w04]: the plan
  // lists [w01, w03, w04] and leaves w02 where it was.
  const REMOVED = [week(1), { kind: "week", weekNumber: 2, weekId: "w03" }, { kind: "week", weekNumber: 3, weekId: "w04" }];
  /** What the first hand-over asks of a draft run's plan, as it stands now. */
  const handOver = () => draftExit.draftExitBlocker("draft", "running", plan(), true);
  const outOfStep = (over = {}) => quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: REMOVED }, ...over });

  test("out of step: no step but Match the plan to the pages, a true line, and the hand-over names that press", async () => {
    w.reset(outOfStep());
    const page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.MATCH_PAGES), page.text);
    assert.ok(page.text.includes(words.OUT_OF_STEP_LINE), page.text);
    for (const control of [words.MOVE_UP, words.MOVE_DOWN, words.REMOVE_ASK, words.ADD_A_WEEK, words.ADD_A_BREAK]) {
      assert.ok(!page.text.includes(control), `${control} is offered on a plan out of step`);
    }
    for (const body of [{ action: "add-week" }, { action: "add-break", afterWeek: 1, label: "Reading week" }, { action: "move", index: 0, direction: "down" }, { action: "remove", index: 1 }]) {
      const answer = await step("zach", body);
      assert.deepEqual([answer.status, answer.body.error], [409, words.OUT_OF_STEP], JSON.stringify(body));
    }
    assert.match(handOver(), /Press Match the plan to the pages on the programme’s Weeks tab first: it moves no page and deletes nothing\.$/);
  });

  test("matching moves no page and deletes nothing, and then the hand-over goes ahead", async () => {
    w.reset(outOfStep());
    const pages = () => world.db.paths().filter((path) => path.includes("/weeks/")).sort().map((path) => [path, world.db.read(path)]);
    const before = pages();
    const answer = await step("lloyd", { action: "match-pages" });
    assert.equal(answer.status, 403);
    const matched = await step("claudia", { action: "match-pages" });
    assert.deepEqual(matched.body, { ok: true, message: words.MATCHED });
    assert.deepEqual(plan(), [week(1), week(2), week(3)]);
    assert.deepEqual(pages(), before, "matching moved or deleted a page");
    assert.equal(handOver(), null);
    const again = await step("claudia", { action: "match-pages" });
    assert.deepEqual([again.status, again.body.error], [409, words.ALREADY_MATCHES]);
  });

  test("matching is safe with work kept against the weeks, which no other step is", async () => {
    w.reset(outOfStep({ [`courseProgress/${RUN.agi}__a__i`]: { runId: RUN.agi, completed: true }, "courseGroups/ga/weeks/w02": { weekNumber: 2 } }));
    assert.equal((await step("zach", { action: "match-pages" })).status, 200);
    assert.equal(handOver(), null);
  });

  test("a page left after the last week: put it back, and the hand-over is never held by it", async () => {
    w.reset(outOfStep());
    await step("zach", { action: "match-pages" });
    // w04 now sits after week 3, holding its title only.
    let page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.leftBehindWords("Where it could go wrong")), page.text);
    assert.ok(page.text.includes(words.putBackWords(4)) && page.text.includes(words.REMOVE_LEFT), page.text);
    assert.ok(page.text.includes(words.PLAN_CAN_CHANGE), page.text);
    assert.equal(handOver(), null);
    const back = await step("zach", { action: "put-back", address: "w04" });
    assert.deepEqual(back.body, { ok: true, message: words.putBackDoneWords(4) });
    assert.deepEqual(plan(), [week(1), week(2), week(3), week(4)]);
    assert.equal(titleAt("w04"), "Where it could go wrong");
    page = await draw("zach", TabPage, PARAMS);
    assert.ok(!page.text.includes(words.leftBehindWords("Where it could go wrong")), page.text);
  });

  test("a left page holding only its title, with nothing kept: removed, and nothing else", async () => {
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: [week(1), week(2), week(3)] } }));
    const before = everything();
    const answer = await step("claudia", { action: "remove-left", address: "w04" });
    assert.deepEqual(answer.body, { ok: true, message: words.LEFT_REMOVED });
    assert.equal(world.db.read(weekPath("w04")), undefined);
    assert.equal(JSON.parse(everything()).length, JSON.parse(before).length - 1);
  });

  test("a left page with blocks is put back, never removed; further on, it moves to the next week's address", async () => {
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: [week(1)] } }));
    // After week 1: w02 (blocks, saved versions), w03 and w04 (titles).
    const page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.leftBehindWords("How fast")), page.text);
    const refused = await step("zach", { action: "remove-left", address: "w02" });
    assert.deepEqual([refused.status, refused.body.error], [409, words.leftHoldsSomething(2)]);
    const later = await step("zach", { action: "put-back", address: "w04" });
    assert.deepEqual([later.status, later.body.error], [409, words.putBackEarlierFirst(2)]);
    assert.equal((await step("zach", { action: "put-back", address: "w02" })).status, 200);
    assert.equal(historyAt("w02").length, 2);
    // w03 next, then w04: each the next week's own address.
    assert.equal((await step("zach", { action: "remove-left", address: "w03" })).status, 200);
    const saves = historyAt("w02").length;
    const moved = await step("zach", { action: "put-back", address: "w04" });
    assert.deepEqual(moved.body, { ok: true, message: words.putBackDoneWords(3) });
    assert.equal(titleAt("w03"), "Where it could go wrong");
    assert.equal(world.db.read(weekPath("w04")), undefined);
    assert.equal(historyAt("w02").length, saves);
  });

  test("with work kept: a left page further on is reached with Add a week, in words that say so", async () => {
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: [week(1), week(2)] }, [`courseProgress/${RUN.agi}__a__i`]: { runId: RUN.agi, completed: true } }));
    await world.db.collection(`${RUN_PATH}/weeks`).doc("w03").delete();
    const page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.putBackByAdding(4)), page.text);
    assert.ok(!page.text.includes(words.REMOVE_LEFT), page.text);
    const refused = await step("zach", { action: "put-back", address: "w04" });
    assert.deepEqual([refused.status, refused.body.error], [409, words.putBackByAdding(4)]);
    // The words are true: Add a week twice, and week 4 is the page.
    assert.equal((await step("zach", { action: "add-week" })).status, 200);
    const added = await step("zach", { action: "add-week" });
    assert.deepEqual(added.body, { ok: true, message: words.weekAddedWords(4, true) });
    assert.equal(titleAt("w04"), "Where it could go wrong");
  });

  test("with a group's copy, or a guide plan loaded for its number: put back as the next week, the guide untouched", async () => {
    for (const over of [
      { "courseGroups/ga": { runId: RUN.agi, name: "Group A", archived: false }, "courseGroups/ga/weeks/w04": { weekNumber: 4 } },
      { [`courseFacilitatorGuide/${COURSE.agi}__w04-plan`]: { courseId: COURSE.agi, slot: "w04-plan", title: "Plan", blocks: [] } },
    ]) {
      w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: [week(1), week(2), week(3)] }, ...over }));
      const before = JSON.stringify(Object.keys(over).map((path) => world.db.read(path)));
      const answer = await step("zach", { action: "put-back", address: "w04" });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(JSON.stringify(Object.keys(over).map((path) => world.db.read(path))), before);
    }
  });

  test("after the groups have gone out: read only, nothing offered, nothing taken", async () => {
    w.reset(outOfStep({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: REMOVED, allocationPublishedAt: NOW } }));
    const page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.WEEK_PLAN_READ_ONLY), page.text);
    assert.ok(!page.text.includes(words.MATCH_PAGES), page.text);
    for (const body of [{ action: "match-pages" }, { action: "put-back", address: "w05" }]) {
      const answer = await step("zach", body);
      assert.deepEqual([answer.status, answer.body.error], [409, words.WEEK_PLAN_READ_ONLY]);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The list on the Weeks tab
// ---------------------------------------------------------------------------

describe("7. the list offers each control only where the route would take it", () => {
  /** Each row of the list, in the words a screen reader is given. */
  function rows(html) {
    return [...html.matchAll(/<li class="row[^"]*">(.*?)<\/li>/g)].map((m) =>
      m[1]
        .replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  test("nobody on the run: Move up, Move down and Remove… on each, breaks in their place, Add a week and Add a break", async () => {
    await step("zach", { action: "add-break", afterWeek: 2, label: "Reading week" });
    for (const who of ["zach", "claudia"]) {
      const page = await draw(who, TabPage, PARAMS);
      const said = rows(page.html);
      assert.equal(said.length, 7, page.text);
      assert.match(said[0], /^Week 1 Empty No session set yet Claudia Reyes Move down Remove…$/);
      assert.match(said[1], /Move up Move down Remove…$/);
      assert.match(said[2], /^Break Reading week Mon 15 to Sun 21 Feb · no sessions Move up Move down Remove…$/);
      assert.match(said[6], /Move up Remove…$/);
      assert.match(page.html, /aria-label="Move week 1 down"/);
      assert.match(page.html, /aria-label="Remove Reading week…"/);
      assert.ok(page.text.includes(words.ADD_A_WEEK) && page.text.includes(words.ADD_A_BREAK), page.text);
      assert.ok(page.text.includes(words.PLAN_CAN_CHANGE), page.text);
      // Before its script arrives nothing can be pressed.
      assert.match(page.html, /<button type="button"[^>]*disabled=""[^>]*>Move down<\/button>/);
    }
  });

  test("a week the guide holds is offered no move, and drawing writes nothing", async () => {
    world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__w01-plan`, { courseId: COURSE.agi, slot: "w01-plan", title: "Plan", blocks: [] });
    const before = everything();
    const said = rows((await draw("zach", TabPage, PARAMS)).html);
    assert.match(said[0], /Remove…$/);
    assert.doesNotMatch(said[0], /Move down/);
    assert.doesNotMatch(said[1], /Move up/);
    assert.equal(everything(), before);
  });

  test("something done: no move and no removal, the sentence says why, adds stay", async () => {
    world.db.seed(`courseProgress/${RUN.agi}__amara__item1`, { runId: RUN.agi, uid: "amara", itemId: "item1", completed: true });
    const page = await draw("claudia", TabPage, PARAMS);
    for (const row of rows(page.html)) assert.doesNotMatch(row, /Move up|Move down|Remove…/);
    assert.ok(page.text.includes(words.DONE_WORK), page.text);
    assert.ok(page.text.includes(words.ADD_A_WEEK), page.text);
  });

  test("the groups gone out: no control at all, and the run editor's sentence", async () => {
    world.db.poke(RUN_PATH, { allocationPublishedAt: NOW });
    const page = await draw("claudia", TabPage, PARAMS);
    for (const row of rows(page.html)) assert.doesNotMatch(row, /Move up|Move down|Remove…/);
    assert.ok(!page.text.includes(words.ADD_A_WEEK), page.text);
    assert.ok(page.text.includes(words.WEEK_PLAN_READ_ONLY), page.text);
  });

  test("the removal question says exactly what goes, and the second line what is true of the run", () => {
    assert.equal(words.removeWeekTitle(4), "Remove week 4?");
    assert.equal(words.removeWeekBody(4, "Where it could go wrong", true, true), "Week 4, Where it could go wrong, goes with its title and settings. Later weeks move up by one.");
    assert.equal(words.removeWeekBody(6, "", false, false), "Week 6 has no page yet, so nothing goes with it.");
    assert.equal(words.removeWhoWords(false), "Nobody is on the run yet.");
    assert.equal(words.removeWhoWords(true), "Nobody on the run has done anything yet.");
    assert.equal(words.keepWeekWords(4), "Keep week 4");
    assert.equal(words.removeWeekWords(4), "Remove week 4");
    assert.equal(words.ADD_BREAK_HINT, "No group meets that week, and later weeks move on by one. Nobody is emailed, since groups haven’t gone out.");
    for (const said of Object.values(words).filter((value) => typeof value === "string")) {
      // The site records nobody opening a week: no sentence says anybody did.
      assert.doesNotMatch(said, /(?:has|have|nobody|people|who) opened|[\u2013\u2014]/i, said);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. The older run editor on a run a programme names
// ---------------------------------------------------------------------------

describe("8. the older builder on a run a programme names is words pointing to the Weeks tab", () => {
  test("the run editor draws the builder only for a run no programme names", () => {
    const editor = readFileSync(join(ROOT, "src", "features", "courses", "RunEditor.tsx"), "utf8");
    // The builder sits in the run-no-programme-names branch, after the words and their link.
    const branch = editor.indexOf("{groupPagesAt ? (");
    const words_ = editor.indexOf("{WEEK_PLAN_ON_WEEKS}", branch);
    const link = editor.indexOf("/weeks`}>{OPEN_WEEKS}</Link>", branch);
    const builder = editor.indexOf("<WeekPlanBuilder", branch);
    assert.ok(branch > 0 && branch < words_ && words_ < link && link < builder, "the run editor draws the builder for a run a programme names");
    assert.equal((editor.match(/<WeekPlanBuilder/g) ?? []).length, 1, "the builder is drawn somewhere else too");
  });
});

// ---------------------------------------------------------------------------
// 9. Every collection that stores a week is counted, or says why it need not be
// ---------------------------------------------------------------------------

/**
 * The collections whose rows name a week (by its number, its address or a
 * session's key) that the owner's rule does not count, and why each need not
 * be. Every collection declared anywhere under src/lib, by a file that names
 * a week, is counted by the rule (`WORK_COLLECTIONS`, `RECORD_COLLECTIONS`,
 * the session markers) or is here.
 */
const NOT_COUNTED = {
  courseAudit: "the course log: a dated line of what was done, naming a week as it was then, never read to find a week",
  courseFeedbackSends: "who pressed Send on a run's feedback and when; the feedback itself is counted (courseFeedback)",
  courseTemplates: "a course's saved templates, kept on the course and copied into a run, never read by a run's week",
  coursePages: "a course's public page, kept on the course",
  courseDeletions: "a destroy's own progress marker",
  circulations: "worksheets, which belong to no course run",
  surveys: "a survey names a week only in a check-in's audience, which opens once a session has met; each such week is counted by checkInWeeks",
  surveyPeople: "who a survey is for, by survey, never by week",
  surveyAnswers: "answers to a survey, by survey, never by week",
  courseTeams: "a team names the pitching week only through the pitches it is made from, which are counted (coursePitches)",
  memberNotes:
    "a note names a week only when it is kept from that week's end-of-week notes, which are drafted once every group has met that week, after the groups have gone out, when the plan is read only",
};

/** Rows that name a week with no collection constant of their own, by the literal their readers use, and how the rule reads them. */
const LITERALS = {
  courseProgress: "counted",
  courseExerciseResponses: "counted",
  courseAttendance: "counted",
  tasks: "counted",
  courseEnrolments: "read whole by the rule: a one-week visit, a move from a week and an answer about the time each hold the weeks",
  courseGroups: "read whole by the rule: a group's own copy of a week, a change to one week, how a week meets and its own calendar each hold the weeks",
  courseRuns: "the run and its weeks themselves, which the route reads and moves, and the run's own week fields (runWeekFields)",
};

describe("9. every collection that stores a week is counted, or says why it need not be", () => {
  test("in both directions, across src/lib", () => {
    const named = new Set();
    for (const file of walkSource(join(ROOT, "src", "lib"))) {
      if (!/\.tsx?$/.test(file)) continue;
      const code = readFileSync(file, "utf8");
      // A week's address, its number, a week named by number ("opensInWeek") or a session's key ("w03").
      if (!/\bweekId\b|\bweekNumber\b|\bweekDocId\b|InWeek\b|\bsessionKey\b/.test(code)) continue;
      for (const [, name] of code.matchAll(/export const [A-Z_]+_COLLECTION = "([A-Za-z]+)"/g)) named.add(name);
    }
    for (const name of Object.keys(LITERALS)) named.add(name);
    const counted = new Set([...kept.WORK_COLLECTIONS, ...kept.RECORD_COLLECTIONS].map(([collection]) => collection));
    // The scheduler's markers carry no run: those of the run's groups that name a session are counted.
    counted.add("schedulerMarkers");
    const accounted = (name) => counted.has(name) || Object.hasOwn(NOT_COUNTED, name) || (Object.hasOwn(LITERALS, name) && LITERALS[name] !== "counted");
    const missing = [...named].filter((name) => !accounted(name)).sort();
    assert.deepEqual(missing, [], "a collection that stores a week is neither counted by the week plan's rule nor written down here with why");
    for (const [name, why] of Object.entries({ ...NOT_COUNTED, ...LITERALS })) {
      if (why === "counted") {
        assert.ok(counted.has(name), `${name} is said to be counted and is not`);
        continue;
      }
      assert.ok(why.length > 30, `${name} needs its reason`);
      assert.ok(!counted.has(name), `${name} is counted and also written down as not counted`);
    }
    for (const name of counted) assert.ok(named.has(name), `${name} is counted but no file says it stores a week`);
    const factsCode = readFileSync(join(ROOT, "src", "lib", "courses", "weekPlanEdit", "facts.ts"), "utf8");
    assert.match(factsCode, /countSessionMarkers\(db, groupDocs\.map\(\(group\) => group\.ref\.id\), tx\)/);
  });

  test("the run's own fields that name a week are each read by the rule", () => {
    const fields = /export function runWeekFields\(run: CourseRunDoc\): boolean \{\s*return (.*);\s*\}/.exec(readFileSync(join(ROOT, "src", "lib", "courses", "weekPlanEdit", "facts.ts"), "utf8"));
    assert.ok(fields, "runWeekFields is not one line the guard can read");
    for (const field of ["submissionExerciseRef?.weekId", "teamHandIn.showcaseWeek"]) assert.ok(fields[1].includes(field), field);
  });

  test("the older Normalise week ids refuses a run a programme names, and points to the Weeks tab", async () => {
    const normalise = await courseRoute("runs", "[runId]", "normalise-weeks");
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: [week(2), week(1)] } }));
    const before = everything();
    const answer = await call("zach", normalise.POST, { runId: RUN.agi }, { body: {}, course: true });
    assert.deepEqual([answer.status, answer.body.error], [409, words.NAMED_RUN_PLAN]);
    assert.equal(everything(), before);
  });

  test("a week's address holds the two subcollections the destroy cascade knows, and no other", () => {
    assert.deepEqual([...facts.WEEK_SUBCOLLECTIONS].sort(), ["editLock", "history"]);
    const deletion = readFileSync(join(ROOT, "src", "lib", "firestore", "courseDeletion.ts"), "utf8");
    assert.match(deletion, /countAgg\(weeks\.doc\(id\)\.collection\(WEEK_HISTORY_SUBCOLLECTION\)\)/);
    assert.match(deletion, /countAgg\(weeks\.doc\(id\)\.collection\(WEEK_LOCK_SUBCOLLECTION\)\)/);
  });
});

// ---------------------------------------------------------------------------
// 10. What a change says to people outside the plan, and the words' limits
// ---------------------------------------------------------------------------

describe("10. what a move tells its reader, and the sentences that are true in each state", () => {
  const BREAK_FIRST = [{ kind: "break", label: "Induction" }, ...SIX];

  test("a break moved past week 1 once decision day has begun: its question says first sessions move and people see the new dates", async () => {
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], weekPlan: BREAK_FIRST }, [FORM]: { ...quietSeed()[FORM], decisionsSentAt: new Date("2026-11-01T09:00:00Z") } }));
    const drawn = (await draw("zach", TabPage, PARAMS)).element;
    const plan_ = JSON.stringify(drawn);
    assert.ok(plan_.includes(words.FIRST_SESSIONS_MOVE), "the break's move does not say first sessions move");
    assert.ok(plan_.includes(words.NOBODY_EMAILED));
    // The route takes it, as the start date itself may still change until groups go out.
    assert.equal((await step("zach", { action: "move", index: 0, direction: "down" })).status, 200);
  });

  test("the words are said only in those states", () => {
    const change = model.applyStep(BREAK_FIRST, { kind: "move", index: 0, direction: "down" }).change;
    assert.deepEqual(view.noticesOf(BREAK_FIRST, change, { decisionDayBegun: false, showcase: false }), []);
    assert.deepEqual(view.noticesOf(BREAK_FIRST, change, { decisionDayBegun: true, showcase: false }), [words.FIRST_SESSIONS_MOVE, words.NOBODY_EMAILED]);
    // A break below week 1 moves no first session; on the showcase run a renumbering changes the public pages.
    const swap = model.applyStep(SIX, { kind: "move", index: 2, direction: "down" }).change;
    assert.deepEqual(view.noticesOf(SIX, swap, { decisionDayBegun: true, showcase: false }), []);
    assert.deepEqual(view.noticesOf(SIX, swap, { decisionDayBegun: false, showcase: true }), [words.PUBLIC_PAGES_CHANGE, words.NOBODY_EMAILED]);
    const breakDown = model.applyStep([...SIX.slice(0, 2), { kind: "break", label: "Reading week" }, ...SIX.slice(2)], { kind: "move", index: 2, direction: "down" }).change;
    assert.deepEqual(view.noticesOf(SIX, breakDown, { decisionDayBegun: false, showcase: true }), []);
  });

  test("on the course's showcase run, a move that renumbers says the public week pages change", async () => {
    w.reset(quietSeed({ [RUN_PATH]: { ...quietSeed()[RUN_PATH], status: "applications-open" } }));
    world.db.poke(`courses/${COURSE.agi}`, { showcaseRunId: RUN.agi });
    const drawn = JSON.stringify((await draw("zach", TabPage, PARAMS)).element);
    assert.ok(drawn.includes(words.PUBLIC_PAGES_CHANGE));
  });

  test("the line under the list: weeks can move only where a move or a removal is offered", async () => {
    // Every week held by the guide: nothing moves or goes, a break or a week at the end can be added.
    for (let n = 1; n <= 6; n += 1) world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__w0${n}-plan`, { courseId: COURSE.agi, slot: `w0${n}-plan`, title: "Plan", blocks: [] });
    const page = await draw("zach", TabPage, PARAMS);
    assert.ok(page.text.includes(words.ADD_ONLY_LINE), page.text);
    assert.ok(!page.text.includes(words.PLAN_CAN_CHANGE), page.text);
  });

  test("too much to move by size is said by size, never as a count of none", async () => {
    world.db.seed(historyPath("w02", "s000003"), { seq: 3, kind: "edit", blocks: [], body: "x".repeat(8_100_000) });
    const answer = await step("zach", { action: "move", index: 0, direction: "down" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.tooBigWords(null)]);
    assert.doesNotMatch(answer.body.error, /\d/);
    assert.equal(words.tooBigWords(1234), "That would move 1,234 saved versions at once, more than one change can carry. Leave the weeks where they are, or add a break instead.");
  });

  test("every refusal names something the reader can do", () => {
    const refusals = [
      words.guideHolds(3),
      words.tooBigWords(null),
      words.OUT_OF_STEP,
      words.putBackByAdding(5),
      words.leftHoldsSomething(4),
      words.WEEK_ONE_FIXED,
      words.DONE_WORK,
      words.DONE_RECORDS,
      words.doneGroupWords("Group A", "mode"),
    ];
    for (const said of refusals) assert.match(said, /Leave|Press|Put it back|Move or remove|can still be added/, said);
    for (const said of Object.values(words).filter((value) => typeof value === "string")) {
      assert.doesNotMatch(said, /\bdrift|\bnormalis|\bids?\b|\borphan/i, said);
    }
  });
});
