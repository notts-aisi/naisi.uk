/**
 * Run a piece of work that might never finish, and stop it if it does not.
 *
 * WHY THIS EXISTS. A test for "this pattern is not slow" that simply times the
 * call cannot fail the way it needs to. A regular expression that backtracks
 * blocks the thread it runs on, so no timer fires, no assertion is reached,
 * and the regression the test exists to catch shows up as a suite that hangs
 * until the job is killed hours later, with nothing pointing at the cause.
 *
 * So the work runs in a worker thread, the test waits for it with a limit, and
 * a worker that overruns is terminated and reported BY NAME. A slow pattern
 * then costs the suite the limit, once, and says which input did it.
 *
 * THE LIMIT COUNTS THE WORK, NOT THE LOAD. Before it runs anything the worker
 * builds the input and, for a call, loads and compiles a TypeScript module,
 * which on a loaded machine can take seconds by itself. So the worker says
 * when it is ready, just before it runs the work, and `limitMs` starts then.
 * The load has a limit of its own, counted from when the worker is made and
 * generous (`LOAD_LIMIT_MS`), so a load that never ends cannot hang the suite
 * either: it is stopped and reported by name as work that did not load, never
 * as work that ran slowly. `took`, the time the work itself took, is measured
 * in the worker around the call alone.
 *
 * `work` is one of:
 *   { kind: "call", module, fn, input }            call an export of a module under src
 *   { kind: "regex-test", source, flags, input }    pattern.test(input)
 *   { kind: "regex-replace", source, flags, input } input.replace(pattern, " ")
 * and `input` may be given as `repeat: [prefix, unit, totalLength, suffix]`
 * instead, which the worker builds itself.
 */
import { Worker } from "node:worker_threads";

/** How long the worker may take to be ready to run the work, from when it is made. */
export const LOAD_LIMIT_MS = 60_000;

/** The work, named as a failure names it. */
function nameOf(work) {
  if (work.kind === "call") return `${work.fn} from ${work.module}`;
  return `the ${work.kind} of /${String(work.source).slice(0, 80)}/`;
}

/**
 * Resolves `{ finished: true, took, result }` when the work returned, or
 * `{ finished: false, limitMs }` when it was still running `limitMs` after
 * the worker said it was ready, and was stopped. Rejects, by the work's
 * name, when the worker was not ready within `loadLimitMs` of being made,
 * when the work threw, or when the worker stopped without a word.
 *
 * @returns {Promise<{ finished: true, took: number, result: string } | { finished: false, limitMs: number }>}
 */
export function timeBoxed(work, limitMs, { loadLimitMs = LOAD_LIMIT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./timeBox.worker.mjs", import.meta.url), { workerData: { work } });
    let settled = false;
    let runTimer = null;
    const settle = (then) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(runTimer);
      then();
    };
    const stop = (answer) => settle(() => worker.terminate().then(answer, answer));

    const loadTimer = setTimeout(
      () =>
        stop(() =>
          reject(new Error(`timeBox: ${nameOf(work)} did not load within ${loadLimitMs} ms and was stopped before it ran`)),
        ),
      loadLimitMs,
    );
    worker.on("message", (message) => {
      if (message?.ready === true) {
        // The input is built and the module loaded: the work starts now, and so does its limit.
        clearTimeout(loadTimer);
        if (!settled) runTimer = setTimeout(() => stop(() => resolve({ finished: false, limitMs })), limitMs);
        return;
      }
      stop(() => resolve({ finished: true, took: message.took, result: message.result }));
    });
    worker.once("error", (err) => settle(() => reject(err)));
    worker.once("exit", (code) =>
      settle(() => reject(new Error(`timeBox: ${nameOf(work)} stopped (exit code ${code}) before it said how it went`))),
    );
  });
}
