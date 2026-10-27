/**
 * WHICH BROWSER SPECS RUN ON WHICH MACHINE, when CI splits the suite.
 *
 * `node scripts/run-e2e.mjs --local --shard 2/3` runs the second of three
 * parts. Every spec lands in exactly one part, decided from the spec names
 * alone, so the same names always split the same way and a new spec module is
 * placed without anybody editing a list.
 *
 * ONE RULE OVERRIDES THE ROUND ROBIN. A spec that borrows a setting the whole
 * dev project shares (`BORROWS_A_SHARED_SETTING`) always runs in part 1, and
 * part 1 is the one leg of the CI job that waits in the shared queue with
 * every other run that drives the dev project (`.github/workflows/e2e.yml`).
 * The other parts write only rows that carry their own run id, so they may run
 * beside anything. `tests/e2e-shards.test.mjs` walks the fixtures for a module
 * reaching the one shared document a fixture may address, and fails one that
 * is not on the list.
 *
 * Pure: no imports, no I/O.
 */

/** Spec name to why it must run in part 1. */
export const BORROWS_A_SHARED_SETTING = new Map([
  [
    "membership-console",
    "snapshots `config/membership`, the dev project's one current-period pointer, moves it and puts it " +
      "back in teardown: two runs overlapping would restore a pointer the other had deleted",
  ],
]);

/**
 * Parse `--shard i/n`. Null when the value is not two whole numbers with
 * 1 <= i <= n.
 * @param {string | undefined} raw
 * @returns {{ index: number, count: number } | null}
 */
export function parseShard(raw) {
  const match = /^(\d+)\/(\d+)$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (count < 1 || index < 1 || index > count) return null;
  return { index, count };
}

/**
 * The names that run in part `index` of `count`. The borrowers go to part 1;
 * the rest, in name order, are dealt round the parts starting from part 2, so
 * part 1 is not given a full share on top of them.
 * @param {readonly string[]} names
 * @param {number} index 1-based
 * @param {number} count
 * @returns {string[]}
 */
export function namesInShard(names, index, count) {
  const sorted = [...new Set(names)].sort();
  const pinned = sorted.filter((name) => BORROWS_A_SHARED_SETTING.has(name));
  const dealt = sorted.filter((name) => !BORROWS_A_SHARED_SETTING.has(name));
  const part = (position) => ((position + (count > 1 ? 1 : 0)) % count) + 1;
  return [
    ...(index === 1 ? pinned : []),
    ...dealt.filter((_, position) => part(position) === index),
  ];
}
