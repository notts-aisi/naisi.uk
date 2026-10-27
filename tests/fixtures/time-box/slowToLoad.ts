/**
 * A module that is slow to load, for `tests/time-box.test.mjs`: evaluating it
 * waits `LOAD_MS` before its exports exist, without keeping the processor
 * busy, the way loading and compiling a real module can take seconds on a
 * loaded machine. It imports nothing, so the worker's loader needs no stubs.
 */
export const LOAD_MS = 1200;

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOAD_MS);

/** Returns at once: work that is quick, behind a load that is not. */
export function echo(input: string): string {
  return input;
}

/** Never returns: work the box has to stop. */
export function forever(input: string): string {
  let spins = 0;
  for (;;) {
    spins += input.length + 1;
    if (spins < 0) return input;
  }
}
