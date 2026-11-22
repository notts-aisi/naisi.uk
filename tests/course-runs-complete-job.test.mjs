/**
 * `courses-runs-complete`: a live run moved to Completed once its work
 * closes.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. IT SHIPS SWITCHED OFF, and while it is off the tick never calls it, so
 *     nothing is read or written for it.
 *  2. WHEN. Only once work has closed (the end of the London day 14 days
 *     after the last session), never at the end of the last session.
 *  3. WHICH RUNS. Live (applications open, closed or running), not archived,
 *     not being destroyed, with a session dated; a run a programme names and
 *     one no programme names alike. A completed, cancelled or draft run is
 *     never touched.
 *  4. HOW. Through the status route's own checked move, stepping through
 *     Running from an application stage, writing the status and `updatedAt`
 *     and nothing else, once: twice in a row writes nothing the second time.
 *
 * The world is `tests/lib/registerWorld.mjs`: RUN (named by AGI Strategy)
 * and OTHER_RUN (named by nothing), both starting Thu 15 Oct 2026 with six
 * weeks. Their last sessions are Tuesday 24 November, 6pm to 8pm, so work
 * closes at the end of Tuesday 8 December: midnight, 00:00 GMT on Wednesday
 * 9 December.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUP, OTHER_RUN, RUN, jobContext, makeWorld, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__runsComplete");
const { world, reset, lib, loadTs } = made;

const { runsCompleteJob } = await lib("scheduler", "jobs", "runsComplete.ts");
const { JOBS, SCHEDULER_JOB_IDS, jobDefaultEnabled } = await lib("scheduler", "registry.ts");
const { RUNS_COMPLETE_JOB } = await lib("scheduler", "registerJobs.ts");
const tick = await loadTs("app/api/scheduler/tick/route.ts");

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Tuesday 24 November, 8:01pm: the last session has just ended. */
const LAST_SESSION_OVER = new Date("2026-11-24T20:01:00Z");
/** Tuesday 8 December, 11:59pm: the last minute work is open. */
const LAST_MINUTE = new Date("2026-12-08T23:59:00Z");
/** Wednesday 9 December, midnight: work has closed. */
const CLOSED = new Date("2026-12-09T00:00:00Z");
/** Thursday 10 December, 10am: work closed yesterday. */
const DAY_AFTER = new Date("2026-12-10T10:00:00Z");

mock.timers.enable({ apis: ["Date"], now: LAST_SESSION_OVER });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

beforeEach(() => {
  at(LAST_SESSION_OVER);
  reset(seedWorld());
});

const status = (runId = RUN) => world.db.read(`courseRuns/${runId}`).status;
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

async function runJob(instant, options) {
  at(instant);
  const { ctx, logged } = jobContext(runsCompleteJob, new Date(instant), options);
  const result = await runsCompleteJob.handler(ctx);
  return { result, logged };
}

describe("1. it ships switched off, and the tick reads nothing for it until it is on", () => {
  test("registered, in the union, emailing nobody, and off until an admin turns it on", () => {
    assert.ok(JOBS.includes(runsCompleteJob));
    assert.ok(SCHEDULER_JOB_IDS.includes("courses-runs-complete"));
    assert.equal(runsCompleteJob.id, "courses-runs-complete");
    assert.equal(jobDefaultEnabled(runsCompleteJob), false);
    assert.deepEqual(RUNS_COMPLETE_JOB, { id: runsCompleteJob.id, enabledByDefault: jobDefaultEnabled(runsCompleteJob) });
    const registry = readFileSync(join(SRC, "lib", "scheduler", "registry.ts"), "utf8");
    assert.match(registry, /^\s*"courses-runs-complete",$/m);
    assert.match(registry, /^\s*runsCompleteJob,$/m);
    const source = readFileSync(join(SRC, "lib", "scheduler", "jobs", "runsComplete.ts"), "utf8");
    assert.doesNotMatch(source, /@\/lib\/(email|push)\//);
    // The one checked path the status route takes, and no write of its own.
    assert.match(source, /await moveRunStatus\(db, live\.id, "completed", \{ throughRunning: live\.status !== "running" \}\);/);
    assert.doesNotMatch(source, /\.update\(|\.set\(|\.create\(/);
  });

  async function tickAt(instant, enabled) {
    at(instant);
    const jobs = {};
    for (const id of SCHEDULER_JOB_IDS) jobs[id] = { enabled: false };
    if (enabled !== undefined) jobs["courses-runs-complete"] = { enabled };
    else delete jobs["courses-runs-complete"];
    world.db.seed("config/scheduler", { enabled: true, jobs });
    process.env.SCHEDULER_SECRET = "a-scheduler-secret-for-this-suite";
    const reads = [];
    const collection = world.db.collection;
    world.db.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      const response = await tick.POST(
        new Request("https://naisi.invalid/api/scheduler/tick", {
          method: "POST",
          headers: { "content-type": "application/json", "x-scheduler-key": "a-scheduler-secret-for-this-suite" },
          body: JSON.stringify({ depth: 0 }),
        }),
      );
      return { entry: response.body.jobs.find((job) => job.id === "courses-runs-complete"), reads };
    } finally {
      world.db.collection = collection;
    }
  }

  test("with no stored switch the tick skips it, reads no run and writes none; switched on, it completes", async () => {
    const off = await tickAt(DAY_AFTER);
    assert.equal(off.entry.skipped, "disabled");
    assert.equal(off.reads.includes("courseRuns"), false, "a switched-off job read the runs");
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["running", "running"]);
    const switchedOff = await tickAt(DAY_AFTER.getTime() + 15 * 60_000, false);
    assert.equal(switchedOff.entry.skipped, "disabled");
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["running", "running"]);
    const on = await tickAt(DAY_AFTER.getTime() + 30 * 60_000, true);
    assert.equal(on.entry.skipped, null);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "completed"]);
  });
});

describe("2. when: once work has closed, never at the end of the last session", () => {
  test("nothing due at the end of the last session, nor in work's last minute", async () => {
    const before = everything();
    for (const instant of [LAST_SESSION_OVER, LAST_MINUTE]) {
      const { result } = await runJob(instant);
      assert.deepEqual([result.processed, result.hasMore, result.note], [0, false, "none due"]);
    }
    assert.equal(everything(), before);
  });

  test("at the midnight work closes, and the day after, each live run completes", async () => {
    const { result, logged } = await runJob(CLOSED);
    assert.deepEqual([result.processed, result.note], [2, "2 runs completed"]);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "completed"]);
    assert.deepEqual(
      logged.map(([message, extra]) => [message, extra.runId]).sort(),
      [
        ["a run was completed when its work closed", OTHER_RUN],
        ["a run was completed when its work closed", RUN],
      ].sort(),
    );
  });

  test("a run's own work-closes days are its own", async () => {
    world.db.poke(`courseRuns/${RUN}`, { workClosesAfterDays: 0 });
    // The end of Tuesday 24 November: RUN has closed, OTHER_RUN has not.
    const { result } = await runJob(new Date("2026-11-25T00:00:00Z"));
    assert.equal(result.processed, 1);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "running"]);
  });
});

describe("3. which runs", () => {
  test("from either application stage it steps through Running to Completed", async () => {
    world.db.poke(`courseRuns/${RUN}`, { status: "applications-open" });
    world.db.poke(`courseRuns/${OTHER_RUN}`, { status: "applications-closed" });
    await runJob(DAY_AFTER);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "completed"]);
  });

  for (const [what, patch] of [
    ["already completed", { status: "completed" }],
    ["cancelled", { status: "cancelled" }],
    ["a draft", { status: "draft" }],
    ["archived", { archived: true }],
    ["being destroyed", { destroying: true }],
  ]) {
    test(`a run ${what} is left as it is`, async () => {
      world.db.poke(`courseRuns/${RUN}`, patch);
      const before = JSON.stringify(world.db.read(`courseRuns/${RUN}`));
      const { result } = await runJob(DAY_AFTER);
      assert.equal(result.processed, 1, "only the other run");
      assert.equal(JSON.stringify(world.db.read(`courseRuns/${RUN}`)), before);
      assert.equal(status(OTHER_RUN), "completed");
    });
  }

  test("a run with no session dated never completes by the clock", async () => {
    world.db.poke(`courseGroups/${GROUP.other}`, { archived: true });
    const { result } = await runJob(DAY_AFTER);
    assert.equal(result.processed, 1);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "running"]);
  });
});

describe("4. how: the checked move, the status alone, once", () => {
  test("it writes the status and updatedAt and nothing else, and emails nobody", async () => {
    const before = structuredClone(world.db.read(`courseRuns/${RUN}`));
    const paths = world.db.paths().sort();
    await runJob(DAY_AFTER);
    const after = world.db.read(`courseRuns/${RUN}`);
    const changed = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])).sort();
    assert.deepEqual(changed, ["status", "updatedAt"]);
    assert.deepEqual(world.db.paths().sort(), paths, "a document was made or removed");
    assert.deepEqual(world.mail, []);
  });

  test("twice in a row: the second finds nothing and writes nothing", async () => {
    await runJob(DAY_AFTER);
    const before = everything();
    const { result } = await runJob(DAY_AFTER.getTime() + 15 * 60_000);
    assert.deepEqual([result.processed, result.note], [0, "none due"]);
    assert.equal(everything(), before);
  });

  test("an admin completing the run while the job runs: the job writes nothing more", async () => {
    // The hook lives on the store under the course view (`courseView`).
    Object.getPrototypeOf(world.db).beforeCommit = () => world.db.poke(`courseRuns/${RUN}`, { status: "completed" });
    const { result } = await runJob(DAY_AFTER);
    assert.equal(status(RUN), "completed");
    assert.equal(result.processed, 1, "the other run, and RUN counted by nobody twice");
  });

  test("its per-tick ceiling leaves the rest for the next tick", async () => {
    const { result } = await runJob(DAY_AFTER, { maxPerTick: 1 });
    assert.deepEqual([result.processed, result.hasMore], [1, true]);
    const next = await runJob(DAY_AFTER.getTime() + 15 * 60_000, { maxPerTick: 1 });
    assert.equal(next.result.processed, 1);
    assert.deepEqual([status(RUN), status(OTHER_RUN)], ["completed", "completed"]);
  });
});
