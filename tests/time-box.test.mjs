/**
 * The time box (`tests/lib/timeBox.mjs`) counts its limit from when the work
 * is ready to run, not from when its worker was made, and a load that never
 * ends is stopped by a limit of its own and reported by name.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Why: before the work runs, the worker builds its input and, for a call,
 * loads and compiles a TypeScript module. On a machine with a load average of
 * about 24 that load alone used the whole of a suite's six seconds, and a
 * reader that is fast was reported as "still running after 6000 ms and was
 * stopped". So the worker says when it is ready and the limit starts then;
 * `took` was always measured around the call alone.
 *
 * The slow load here is real: `tests/fixtures/time-box/slowToLoad.ts` waits
 * `LOAD_MS` while it is evaluated, so loading it takes at least that long, on
 * top of whatever the loader itself takes.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOAD_LIMIT_MS, timeBoxed } from "./lib/timeBox.mjs";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "time-box", "slowToLoad.ts");
/** What the fixture waits while it loads (its own `LOAD_MS`). */
const LOAD_MS = 1200;
/** A limit far shorter than the load. */
const SHORT_MS = 300;

/** The box's answer, and how long it took to give it. */
async function timed(work, limitMs, options) {
  const started = performance.now();
  const run = await timeBoxed(work, limitMs, options);
  return { run, elapsed: performance.now() - started };
}

describe("the limit counts the work, not the load", () => {
  test("a quick call behind a slow load finishes inside a limit shorter than the load", async () => {
    const { run, elapsed } = await timed({ kind: "call", module: FIXTURE, fn: "echo", input: "hello" }, SHORT_MS);
    assert.ok(elapsed >= LOAD_MS, `the module loaded in ${Math.round(elapsed)} ms, so this proves nothing`);
    assert.equal(run.finished, true, `stopped after ${SHORT_MS} ms although the call itself is instant: the limit counted the load`);
    assert.equal(run.result, "hello");
    // The work's own time is the call alone, never the load.
    assert.ok(run.took < 50, `took ${Math.round(run.took)} ms`);
  });

  test("a call that never returns is stopped at the limit, counted from when its module had loaded", async () => {
    const { run, elapsed } = await timed({ kind: "call", module: FIXTURE, fn: "forever", input: "x" }, SHORT_MS);
    assert.deepEqual(run, { finished: false, limitMs: SHORT_MS });
    assert.ok(elapsed >= LOAD_MS + SHORT_MS, `stopped after ${Math.round(elapsed)} ms: before the load and the limit had both passed`);
  });

  test("a pattern that backtracks is still stopped at the limit and reported", async () => {
    // Nested quantifiers on a string that almost matches: if this ever
    // finishes, the box is not measuring what it claims to.
    const { run, elapsed } = await timed({ kind: "regex-test", source: "^(a+)+$", input: `${"a".repeat(40)}!` }, SHORT_MS);
    assert.deepEqual(run, { finished: false, limitMs: SHORT_MS });
    assert.ok(elapsed >= SHORT_MS, `stopped after ${Math.round(elapsed)} ms`);
  });
});

describe("a load that never ends is stopped by a limit of its own", () => {
  test("the load limit is a minute from when the worker is made", () => {
    assert.equal(LOAD_LIMIT_MS, 60_000);
  });

  test("a load that overruns it is stopped and reported by name, as a load and never as slow work", async () => {
    await assert.rejects(
      timeBoxed({ kind: "call", module: FIXTURE, fn: "echo", input: "x" }, 6000, { loadLimitMs: 200 }),
      (err) => {
        assert.match(err.message, /^timeBox: echo from .*slowToLoad\.ts did not load within 200 ms and was stopped before it ran$/);
        return true;
      },
    );
  });

  test("work that cannot start is reported by name rather than waited for", async () => {
    await assert.rejects(timeBoxed({ kind: "nonsense", input: "x" }, SHORT_MS), /no such kind of work as "nonsense"/);
    await assert.rejects(timeBoxed({ kind: "call", module: FIXTURE, fn: "notThere", input: "x" }, SHORT_MS), /is not a function/);
  });
});
