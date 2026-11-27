/**
 * Where a run stands, and its details, in the Course run section of a
 * programme's Settings.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET  /api/admissions/forms/[roundId]/programmes/[programmeId]/run          the section's read
 *   PUT  /api/admissions/forms/[roundId]/programmes/[programmeId]/run/details  the run's details
 *   POST /api/courses/runs/[runId]/status                                     the one status route
 *
 * ## What this guards
 *
 *  1. WHO. Only an admin reads the section or saves the details, whatever
 *     the reader is to the programme or the run; a view-as session is refused
 *     by both writing routes. The status route keeps its own bar, an admin or
 *     a course approver, as the older editor uses it.
 *  2. WHERE IT STANDS, for every stored status: three stages, the three live
 *     values as Running, Cancelled as itself; the sentence under the stages
 *     true whichever way the job that completes a run is switched; the early
 *     move each status offers.
 *  3. THE STATUS ROUTE: Draft to Running, the step through Running to
 *     Completed asked for by name, no way back, the week id check on leaving
 *     draft, on a run a programme names and on one no programme names.
 *  4. THE DETAILS: each check in order, and the start date held once the
 *     groups have gone out, by the server, whatever the request says.
 *
 * The hand-over's own start of a draft run is in
 * `tests/applications-handover.test.mjs`; the job that completes a run when
 * its work closes is `tests/course-runs-complete-job.test.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { session } from "./lib/applicationsSmallTerm.mjs";
import { AGI, CAST, GROUP, ROUND, RUN, loadJoin, makeWorld, namedSeed, programmeParams, short } from "./lib/handoverWorld.mjs";

// A course approver: committee, holding approveCourse, named on nothing.
CAST.ada = {
  ...session("ada", "committee", true, "Ada Prior"),
  permissions: { ...session("x", "member", false, "x").permissions, approveCourse: true },
};

const made = makeWorld("__runStands");
const { world, reset, call, everything, formRoute, courseRoute, lib } = made;
const join_ = await loadJoin(made);
const { press, place, withoutNotes } = join_;
const routes = {
  run: await formRoute("programmes", "[programmeId]", "run"),
  details: await formRoute("programmes", "[programmeId]", "run", "details"),
  status: await courseRoute("runs", "[runId]", "status"),
};
const W = await lib("courses", "runStands", "words.ts");
const D = await lib("courses", "runStands", "details.ts");
const { START_DATE_READ_ONLY } = await lib("courses", "groupPage", "words.ts");
const { BEING_PUBLISHED } = await lib("courses", "runStands", "saveDetails.ts");
const { stepsThroughRunning, canTransition } = await lib("courses", "runStatus.ts");

/** Saturday 24 October 2026, 11am BST. The run's groups meet in weeks 1 and 2: last session Thu 5 Nov. */
const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(namedSeed());
});

const STATUSES = ["draft", "applications-open", "applications-closed", "running", "completed", "cancelled"];
const panelOf = async (who = "zach") => call(who, routes.run.GET, programmeParams(AGI));
const stands = async () => (await panelOf()).body.panel.stands;
const runAgi = () => world.db.read(`courseRuns/${RUN.agi}`);
const move = (who, status, extra = {}, runId = RUN.agi, options = {}) =>
  call(who, routes.status.POST, { runId }, { body: { status, ...extra }, course: true, ...options });
const DETAILS = {
  label: "AGI Strategy, Autumn 2026",
  academicYear: "2026/27",
  cohortTerm: "autumn",
  cohortYear: "2026",
  cohortNumber: "1",
  startDate: "2026-10-26",
};
const saveDetails = (who, body = DETAILS, options = {}) =>
  call(who, routes.details.PUT, programmeParams(AGI), { body, ...options });
const scheduler = (config) => world.db.seed("config/scheduler", config);

/** Everybody who is not an admin, each with what they are to this programme and run. */
const NOT_ADMINS = [
  ["nobody", "a member with no role"],
  ["amara", "somebody who holds a place on it"],
  ["bea", "a facilitator of one of the run's groups"],
  ["yusuf", "the run's track lead"],
  ["lloyd", "a reviewer of the programme"],
  ["claudia", "the programme's lead"],
  ["tess", "the lead of another programme"],
  ["ada", "a course approver"],
];

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. only an admin sees the section or saves the run's details", () => {
  beforeEach(() => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { facilitatorUids: ["bea"] });
  });

  test("signed out: told to sign in by every route, and nothing is written", async () => {
    const before = everything();
    assert.equal((await panelOf(null)).status, 401);
    assert.equal((await saveDetails(null)).status, 401);
    assert.equal((await move(null, "completed")).status, 401);
    assert.equal(everything(), before);
  });

  for (const [who, what] of NOT_ADMINS) {
    test(`${what} is refused the section and the details, and nothing is written`, async () => {
      const before = everything();
      assert.equal((await panelOf(who)).status, 403);
      assert.deepEqual(short(await saveDetails(who)), [403, "Only an admin can change a course run’s details here."]);
      assert.equal(everything(), before);
    });
  }

  test("the status route keeps its own bar: an admin or a course approver, nobody else", async () => {
    for (const [who] of NOT_ADMINS) {
      if (who === "ada") continue;
      assert.equal((await move(who, "completed")).status, 403, who);
    }
    assert.equal(runAgi().status, "applications-open");
    // A course approver could always move a run's status from the older editor.
    assert.equal((await move("ada", "running")).status, 200);
    assert.equal(runAgi().status, "running");
  });

  test("a view-as session is refused by both writing routes before anything else", async () => {
    const before = everything();
    assert.deepEqual(short(await saveDetails("zach", DETAILS, { viewAs: true })), [403, "view-as"]);
    assert.deepEqual(short(await move("zach", "running", {}, RUN.agi, { viewAs: true })), [403, "view-as"]);
    assert.equal(everything(), before);
  });

  test("an admin reads where the run stands and its details", async () => {
    const answer = await panelOf("zach");
    assert.equal(answer.status, 200);
    assert.ok(answer.body.panel.stands);
    assert.deepEqual(answer.body.panel.details, {
      label: "Autumn 2026",
      academicYear: "2026/27",
      cohortTerm: "",
      cohortYear: "",
      cohortNumber: "",
      startDate: "2026-10-26",
      startDateWords: "Mon 26 Oct",
      groupsGoneOut: false,
    });
  });

  test("with no run named there is nothing to stand or to save", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    const panel = (await panelOf()).body.panel;
    assert.equal(panel.stands, null);
    assert.equal(panel.details, null);
    const before = everything();
    assert.equal((await saveDetails("zach")).status, 409);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Where it stands
// ---------------------------------------------------------------------------

describe("2. where it stands, for every stored status", () => {
  test("three stages for six values: the three live ones are Running, Cancelled is itself", () => {
    assert.deepEqual(
      STATUSES.map((status) => W.stageOf(status)),
      ["draft", "running", "running", "running", "completed", "cancelled"],
    );
    assert.deepEqual(W.RUN_STAGES.map((stage) => stage.label), ["Draft", "Running", "Completed"]);
    assert.equal(W.CANCELLED_STAGE, "Cancelled");
  });

  test("the move each status offers", async () => {
    const offered = {};
    for (const status of STATUSES) {
      world.db.poke(`courseRuns/${RUN.agi}`, { status });
      offered[status] = (await stands()).move;
    }
    assert.deepEqual(offered, {
      draft: "start",
      "applications-open": "complete-through",
      "applications-closed": "complete-through",
      running: "complete",
      completed: null,
      cancelled: null,
    });
  });

  test("a draft says what a draft is and that it starts by itself", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "draft" });
    const shown = await stands();
    assert.deepEqual([shown.stage, shown.line, shown.meaning], [
      "draft",
      "Draft: people holding a place see week 1, from decision day once it is ready. It starts running by itself the first time people are handed over.",
      "",
    ]);
  });

  /** The first hand-over to a draft run, which starts it. */
  const startedByPress = async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "draft" });
    assert.equal((await press()).status, 200);
    assert.equal(runAgi().status, "running");
  };

  test("running with the job off: since the hand-over that started it, and an admin marks it completed after work closes", async () => {
    await startedByPress();
    for (const status of ["applications-open", "applications-closed", "running"]) {
      world.db.poke(`courseRuns/${RUN.agi}`, { status });
      const shown = await stands();
      assert.equal(shown.stage, "running", status);
      assert.equal(
        shown.line,
        "Running since Sat 24 Oct, when people were first handed over. Work closes on Thu 19 Nov. An admin marks it completed after that.",
        status,
      );
      assert.equal(
        shown.meaning,
        "Running: the weekly emails go, and its people see their weeks once Publish tells them their group (week 1 from decision day, once it is ready). Completed: the weekly emails stop, it leaves each facilitator’s My programmes, and nobody more can be handed over or moved. Registers, work and certificates stay.",
      );
    }
  });

  /** Publish has sent the run's groups out: the job only completes such a run. */
  const groupsGoneOut = () => world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-10-24T09:00:00Z") });

  test("running with the job on: it completes by itself on the day work closes", async () => {
    await startedByPress();
    groupsGoneOut();
    scheduler({ enabled: true, jobs: { "courses-runs-complete": { enabled: true } } });
    assert.equal(
      (await stands()).line,
      "Running since Sat 24 Oct, when people were first handed over. It completes by itself on Thu 19 Nov, when work closes.",
    );
    // The scheduler's own switch off: nothing runs, so an admin marks it.
    scheduler({ enabled: false, jobs: { "courses-runs-complete": { enabled: true } } });
    assert.match((await stands()).line, /Work closes on Thu 19 Nov\. An admin marks it completed after that\.$/);
  });

  test("with the job on, a run whose groups have not gone out says an admin marks it completed: the job skips it", async () => {
    await startedByPress();
    scheduler({ enabled: true, jobs: { "courses-runs-complete": { enabled: true } } });
    assert.match((await stands()).line, /Work closes on Thu 19 Nov\. An admin marks it completed after that\.$/);
    mock.timers.setTime(new Date("2026-11-20T09:00:00Z").getTime());
    assert.match((await stands()).line, /Work closed on Thu 19 Nov\. An admin marks it completed\.$/);
  });

  test("with the job on, an archived run or one being destroyed does not say it completes by itself: the job skips them", async () => {
    await startedByPress();
    groupsGoneOut();
    scheduler({ enabled: true, jobs: { "courses-runs-complete": { enabled: true } } });
    for (const patch of [{ archived: true }, { archived: false, destroying: true }]) {
      world.db.poke(`courseRuns/${RUN.agi}`, patch);
      assert.match((await stands()).line, /Work closes on Thu 19 Nov\. An admin marks it completed after that\.$/, JSON.stringify(patch));
    }
  });

  test("once work has closed: by itself shortly with the job on, by an admin with it off", async () => {
    await startedByPress();
    groupsGoneOut();
    mock.timers.setTime(new Date("2026-11-20T09:00:00Z").getTime());
    assert.match((await stands()).line, /Work closed on Thu 19 Nov\. An admin marks it completed\.$/);
    scheduler({ enabled: true, jobs: { "courses-runs-complete": { enabled: true } } });
    assert.match((await stands()).line, /Work closed on Thu 19 Nov, so it completes by itself shortly\.$/);
  });

  test("no record of a hand-over: it only says it is running; no session dated: it says neither way to complete", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "running" });
    assert.equal(
      (await stands()).line,
      "It is running. Work closes on Thu 19 Nov. An admin marks it completed after that.",
    );
    for (const id of Object.values(GROUP)) world.db.poke(`courseGroups/${id}`, { archived: true });
    assert.equal((await stands()).line, "It is running.");
  });

  test("the day is the hand-over that started it from draft, the earliest such line, whatever came after", async () => {
    await startedByPress();
    // The line records the start in the log's own change fields.
    const lines = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map((path) => world.db.read(path));
    assert.deepEqual(
      lines.filter((row) => row.kind === "run-hand-over").map((row) => [row.before, row.after]),
      [[{ status: "draft" }, { status: "running" }]],
    );
    mock.timers.setTime(new Date("2026-10-30T09:00:00Z").getTime());
    world.db.seed("courseAudit/later", { kind: "run-hand-over", runId: RUN.agi, after: { status: "running" }, at: new Date("2026-10-30T09:00:00Z") });
    world.db.seed("courseAudit/other-run", { kind: "run-hand-over", runId: RUN.tais, after: { status: "running" }, at: new Date("2026-10-01T09:00:00Z") });
    world.db.seed("courseAudit/other-kind", { kind: "group-renamed", runId: RUN.agi, after: { status: "running" }, at: new Date("2026-10-01T09:00:00Z") });
    assert.match((await stands()).line, /^Running since Sat 24 Oct, when people were first handed over\./);
  });

  test("started early, then handed over: no day is said, because no hand-over started it", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "draft" });
    assert.equal((await move("zach", "running")).status, 200);
    mock.timers.setTime(new Date("2026-10-29T09:00:00Z").getTime());
    assert.equal((await press()).status, 200);
    const rows = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map((path) => world.db.read(path));
    assert.deepEqual(rows.filter((row) => row.kind === "run-hand-over").map((row) => [row.before, row.after]), [[undefined, undefined]]);
    assert.match((await stands()).line, /^It is running\. /);
    // A run out of draft before the hand-over (every Autumn run) says the same.
    reset(namedSeed());
    await press();
    assert.match((await stands()).line, /^It is running\. /);
  });

  test("completed says its last session once it has happened; cancelled says nothing and offers nothing", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    // Marked completed early, before its last session: no day is said.
    assert.deepEqual(
      [(await stands()).stage, (await stands()).line, (await stands()).meaning],
      ["completed", "Completed.", ""],
    );
    // After Thu 5 Nov, 11:30am, the last session has happened.
    mock.timers.setTime(new Date("2026-11-05T12:00:00Z").getTime());
    assert.equal((await stands()).line, "Completed. Its last session was on Thu 5 Nov.");
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "cancelled" });
    const shown = await stands();
    assert.deepEqual([shown.stage, shown.line, shown.meaning, shown.move], ["cancelled", "", "", null]);
    assert.equal(W.completedWords(null), "Completed.");
  });

  test("reading the section writes nothing", async () => {
    const before = everything();
    await panelOf();
    assert.equal(everything(), before);
  });

  test("the questions, word for word", () => {
    assert.equal(W.startTitle("AGI Strategy, Spring 2027"), "Start AGI Strategy, Spring 2027 running?");
    assert.equal(
      W.START_BODY,
      "The weekly emails start, and its people see their weeks once Publish tells them their group. It can’t go back to draft.",
    );
    assert.deepEqual([W.KEEP_DRAFT, W.START_CONFIRM, W.START_BUTTON], ["Keep it as a draft", "Start it running", "Start it running now…"]);
    assert.equal(W.completeTitle("AGI Strategy, Autumn 2026"), "Mark AGI Strategy, Autumn 2026 completed?");
    assert.equal(
      W.COMPLETE_BODY,
      "The weekly emails stop and nobody more can be handed over. Registers, work and certificates stay. It can’t be moved back.",
    );
    assert.deepEqual([W.KEEP_RUNNING, W.COMPLETE_CONFIRM, W.COMPLETE_BUTTON], ["Keep it running", "Mark it completed", "Mark it completed now…"]);
    assert.equal(W.completedNowWords("AGI Strategy, Autumn 2026"), "AGI Strategy, Autumn 2026 is completed. Nobody was emailed.");
    assert.equal(W.startedWords(""), "This run is running. Nobody was emailed.");
    assert.equal(W.NOBODY_IS_EMAILED, "Nobody is emailed.");
  });
});

// ---------------------------------------------------------------------------
// 3. The status route
// ---------------------------------------------------------------------------

describe("3. the status route: Draft to Running, the step through Running, no way back", () => {
  test("the table gains Draft to Running, and the step through is only from an application stage to Completed", () => {
    assert.equal(canTransition("draft", "running"), true);
    assert.deepEqual(stepsThroughRunning("applications-open", "completed"), ["running", "completed"]);
    assert.deepEqual(stepsThroughRunning("applications-closed", "completed"), ["running", "completed"]);
    for (const from of ["draft", "running", "completed", "cancelled"]) {
      assert.equal(stepsThroughRunning(from, "completed"), null, from);
    }
    assert.equal(stepsThroughRunning("applications-open", "cancelled"), null);
  });

  for (const [what, runId] of [
    ["a run a programme names", RUN.agi],
    ["a run no programme names", RUN.other],
  ]) {
    test(`${what}: every stored status, moved to Running and to Completed`, async () => {
      const outcomes = {};
      for (const from of STATUSES) {
        for (const [to, extra] of [
          ["running", {}],
          ["completed", {}],
          ["completed", { through: "running" }],
        ]) {
          reset(namedSeed());
          world.db.poke(`courseRuns/${runId}`, { status: from });
          const answer = await move("zach", to, extra, runId);
          outcomes[`${from} > ${to}${extra.through ? " through" : ""}`] = [answer.status, world.db.read(`courseRuns/${runId}`).status];
        }
      }
      assert.deepEqual(outcomes, {
        "draft > running": [200, "running"],
        "draft > completed": [400, "draft"],
        "draft > completed through": [400, "draft"],
        "applications-open > running": [200, "running"],
        "applications-open > completed": [400, "applications-open"],
        "applications-open > completed through": [200, "completed"],
        "applications-closed > running": [200, "running"],
        "applications-closed > completed": [400, "applications-closed"],
        "applications-closed > completed through": [200, "completed"],
        "running > running": [200, "running"],
        "running > completed": [200, "completed"],
        "running > completed through": [200, "completed"],
        "completed > running": [400, "completed"],
        "completed > completed": [200, "completed"],
        "completed > completed through": [200, "completed"],
        "cancelled > running": [400, "cancelled"],
        "cancelled > completed": [400, "cancelled"],
        "cancelled > completed through": [400, "cancelled"],
      });
    });
  }

  test("leaving draft for Running meets the week id check, and nothing is written", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, {
      status: "draft",
      weekPlan: [
        { kind: "week", weekNumber: 1, weekId: "w02" },
        { kind: "week", weekNumber: 2, weekId: "w01" },
      ],
    });
    const before = everything();
    const answer = await move("zach", "running");
    assert.equal(answer.status, 409);
    // CHANGED ON PURPOSE (the week plan on the Weeks tab): the run is named by
    // a programme, so the sentence sends the reader to its Weeks tab.
    assert.match(answer.body.error, /Press Match the plan to the pages on the programme’s Weeks tab first: it moves no page and deletes nothing\.$/);
    assert.equal(everything(), before);
  });

  test("only a step through Running is named, and a run being destroyed moves nowhere", async () => {
    assert.deepEqual(short(await move("zach", "completed", { through: "applications-closed" })), [400, "A move can only step through Running."]);
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await move("zach", "completed", { through: "running" })).status, 409);
    assert.equal(runAgi().status, "applications-open");
  });

  test("a move writes the status and updatedAt and nothing else, and emails nobody", async () => {
    const before = structuredClone(runAgi());
    await move("zach", "completed", { through: "running" });
    const after = runAgi();
    const changed = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])).sort();
    assert.deepEqual(changed, ["status", "updatedAt"]);
    assert.deepEqual(world.mail, []);
  });
});

// ---------------------------------------------------------------------------
// 4. The details
// ---------------------------------------------------------------------------

describe("4. the run's details", () => {
  test("an admin saves them, and the section reads them back", async () => {
    const answer = await saveDetails("zach");
    assert.equal(answer.status, 200, answer.body?.error);
    const stored = runAgi();
    assert.deepEqual(
      [stored.label, stored.academicYear, stored.cohort, stored.startDate],
      ["AGI Strategy, Autumn 2026", "2026/27", { term: "autumn", year: 2026, number: 1 }, "2026-10-26"],
    );
    assert.equal(answer.body.panel.details.label, "AGI Strategy, Autumn 2026");
    assert.equal(answer.body.panel.stands.runLabel, "AGI Strategy, Autumn 2026");
    assert.deepEqual(world.mail, []);
  });

  test("each check, in the older form's order and words, and nothing is written", async () => {
    const CASES = [
      [{ label: "   " }, "Give the run a label, e.g. Autumn 2026."],
      [{ label: "   ", academicYear: "2026" }, "Give the run a label, e.g. Autumn 2026."],
      [{ academicYear: "2026-27" }, "Academic year must look like 2026/27."],
      [{ academicYear: "2026-27", startDate: "2026-02-30" }, "Academic year must look like 2026/27."],
      [{ startDate: "2026-02-30" }, "Start date must be a real date: every run needs one."],
      [{ startDate: "2026-02-30", cohortYear: "" }, "Start date must be a real date: every run needs one."],
      [{ cohortYear: "" }, "Give the cohort a term, a year and a number, or leave all three blank."],
      [{ cohortTerm: "winter" }, "Give the cohort a term, a year and a number, or leave all three blank."],
      [{ cohortYear: "1998" }, "Cohort year must be between 2000 and 2100."],
      [{ cohortYear: "2026.5" }, "Cohort year must be between 2000 and 2100."],
      [{ cohortNumber: "0" }, "Cohort number must be between 1 and 99."],
      [{ cohortNumber: "100" }, "Cohort number must be between 1 and 99."],
    ];
    for (const [patch, error] of CASES) {
      const before = everything();
      assert.deepEqual(short(await saveDetails("zach", { ...DETAILS, ...patch })), [400, error], JSON.stringify(patch));
      assert.equal(everything(), before);
      // The form asks the same, before the press.
      const checked = D.checkRunDetails({ ...DETAILS, ...patch });
      assert.deepEqual([checked.ok, checked.error], [false, error]);
    }
    assert.equal((await saveDetails("zach", { label: "Autumn" })).status, 400, "a body that is not the form's");
    assert.equal((await saveDetails("zach", null)).status, 400);
  });

  test("a cohort left blank is taken off the run, never stored as nothing", async () => {
    await saveDetails("zach");
    await saveDetails("zach", { ...DETAILS, cohortTerm: "", cohortYear: "", cohortNumber: "" });
    assert.equal("cohort" in runAgi(), false);
  });

  test("the label is capped at the run label's length, as the older form caps it", async () => {
    await saveDetails("zach", { ...DETAILS, label: "A".repeat(200) });
    assert.equal(runAgi().label.length, 80);
  });

  test("before the groups go out the start date changes; after, the server refuses a new one whatever the page sent", async () => {
    assert.equal((await saveDetails("zach", { ...DETAILS, startDate: "2026-11-02" })).status, 200);
    assert.equal(runAgi().startDate, "2026-11-02");

    world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-10-30T09:00:00Z") });
    const panel = (await panelOf()).body.panel;
    assert.deepEqual([panel.details.groupsGoneOut, panel.details.startDateWords], [true, "Mon 2 Nov"]);
    const before = everything();
    assert.deepEqual(short(await saveDetails("zach", { ...DETAILS, startDate: "2026-11-09" })), [409, START_DATE_READ_ONLY]);
    assert.equal(everything(), before);
    assert.equal(
      START_DATE_READ_ONLY,
      "The groups have gone out, so the start date can’t change here: a new one would move every group’s weeks, the ones that met included.",
    );
    // The same date again, or none sent, as the form sends once they have gone out: the rest saves.
    assert.equal((await saveDetails("zach", { ...DETAILS, startDate: "2026-11-02", label: "Renamed" })).status, 200);
    const noDate = { ...DETAILS, label: "Renamed again" };
    delete noDate.startDate;
    assert.equal((await saveDetails("zach", noDate)).status, 200);
    assert.deepEqual([runAgi().label, runAgi().startDate], ["Renamed again", "2026-11-02"]);
  });

  test("while a Publish holds its lock a new start date is refused, and the rest still saves", async () => {
    const lock = `courseNudges/publishing__${RUN.agi}`;
    world.db.seed(lock, { kind: "allocation-press", runId: RUN.agi, byUid: "zach", token: "t", claimedAtMs: Date.now() - 60_000 });
    const before = everything();
    assert.deepEqual(short(await saveDetails("zach", { ...DETAILS, startDate: "2026-11-02" })), [409, BEING_PUBLISHED]);
    assert.equal(everything(), before);
    assert.equal(BEING_PUBLISHED, "Groups are being published. Try again in a minute.");
    // The same date, or none: the label and the cohort save.
    assert.equal((await saveDetails("zach", { ...DETAILS, label: "Renamed" })).status, 200);
    assert.equal(runAgi().label, "Renamed");
    // A lock left over from a press that stopped (as old as Publish itself treats as gone) holds nothing.
    world.db.poke(lock, { claimedAtMs: Date.now() - 6 * 60_000 });
    assert.equal((await saveDetails("zach", { ...DETAILS, startDate: "2026-11-02" })).status, 200);
    assert.equal(runAgi().startDate, "2026-11-02");
  });

  test("Publish works out what it sends from the run as it is once its lock is held", async () => {
    await press();
    await place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
      { uid: "bea", groupId: GROUP.monday },
      { uid: "tariq", groupId: GROUP.thursday },
    ]);
    await withoutNotes("zach");
    const board = async () =>
      (await call("zach", join_.routes.board.GET, { runId: RUN.agi }, { course: true })).body?.publish ?? null;
    let summary = await board();
    if (summary && summary.emails > 0 && summary.test?.state !== "fresh") {
      await call("zach", join_.routes.publishTest.POST, { runId: RUN.agi }, { course: true });
      summary = await board();
    }
    const sentBefore = world.mail.length;
    // The start date is lost in the moment the press takes its lock: the
    // press's own first transaction. A press that kept its earlier read would
    // send every email from the date that was there before.
    world.db.beforeCommit = () => world.db.poke(`courseRuns/${RUN.agi}`, { startDate: "" });
    const answer = await call("zach", join_.routes.publish.POST, { runId: RUN.agi }, { body: { emails: summary.emails }, course: true });
    world.db.beforeCommit = null;
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.match(answer.body.error, /^Nothing was published and nobody was emailed\./);
    assert.equal(world.mail.length, sentBefore, "Publish emailed from the run it read before its lock");
    assert.equal(runAgi().allocationPublishedAt, undefined);
  });

  test("a run being destroyed, or no longer on the site, is not saved", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    let before = everything();
    assert.equal((await saveDetails("zach")).status, 409);
    assert.equal(everything(), before);
    reset(namedSeed());
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: "gone__run99999" });
    before = everything();
    assert.equal((await saveDetails("zach")).status, 404);
    assert.equal(everything(), before);
  });

  test("the form's words", () => {
    assert.deepEqual(
      [D.DETAILS_TITLE, D.LABEL_LABEL, D.YEAR_LABEL, D.COHORT_TERM_LABEL, D.COHORT_YEAR_NUMBER_LABEL, D.COHORT_HINT, D.START_LABEL, D.SAVE_DETAILS],
      [
        "The run’s details",
        "Run label",
        "Academic year",
        "Cohort term",
        "Cohort year and number",
        "The course’s public page shows it.",
        "Week 1 starts",
        "Save the run’s details",
      ],
    );
  });
});
