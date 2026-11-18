/**
 * WHICH BROWSER SPECS RUN ON WHICH MACHINE, when CI splits the suite.
 *
 * `node scripts/run-e2e.mjs --local --shard 2/6` runs the second of six
 * parts. Every spec lands in exactly one part, decided from the spec names
 * and how long each takes (`SPEC_SECONDS`), so the same names always split
 * the same way and a new spec module is placed without anybody editing a
 * list.
 *
 * THE PARTS ARE DEALT BY TIME, NOT BY COUNT. A run waits for its slowest
 * part, so the specs are handed out longest first, each to the part with the
 * least work so far. One spec that takes twelve minutes then shares its part
 * with a few short ones, and no part is left holding all the long ones.
 *
 * ONE RULE COMES BEFORE THAT. A spec that borrows a setting the whole dev
 * project shares (`BORROWS_A_SHARED_SETTING`) always runs in part 1, and
 * part 1 is the one leg of the CI job that waits in the shared queue with
 * every other run that drives the dev project (`.github/workflows/e2e.yml`).
 * Because it may wait there behind another run's part 1, it is dealt as if it
 * already held `SHARED_QUEUE_SECONDS` of work, which keeps it the shortest
 * part. The other parts write only rows that carry their own run id, so they
 * may run beside anything. `tests/e2e-shards.test.mjs` walks the fixtures for
 * a module reaching a shared document a fixture may address
 * (`config/membership`, the end of a programme's question set), and fails one
 * that is not on the list.
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
  [
    "course-hub-survey-admin",
    "snapshots `surveyQuestionSets/after`, the dev project's one end of a programme question set, changes " +
      "its words in the browser and puts it back in teardown: two runs overlapping would each restore the " +
      "words the other had changed",
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
 * How long each spec takes, in seconds, to seed, to drive and to clear up
 * after itself, to the nearest ten: read off one whole run of the suite in
 * CI, the first in six parts (13 November 2026). Only the proportions matter, so a number here is right
 * for as long as it is roughly right; refresh the table from a run's log when
 * the parts drift apart. A spec that is not listed is taken as
 * `DEFAULT_SPEC_SECONDS`, so a new spec needs no entry to be placed.
 */
export const SPEC_SECONDS = new Map([
  ["applicant-funnel", 40],
  ["applicant-one-flow", 40],
  ["applicant-signup", 20],
  ["appointment-queue", 10],
  ["course-hub-before-survey", 210],
  ["course-hub-check-in", 120],
  ["course-hub-correct-register", 170],
  ["course-hub-coursework", 110],
  ["course-hub-cover-register", 260],
  ["course-hub-edit-a-week", 190],
  ["course-hub-excused-weeks", 200],
  ["course-hub-explainers-and-lead-notes", 140],
  ["course-hub-facilitators-week", 130],
  ["course-hub-group-time", 90],
  ["course-hub-groups-go-out", 130],
  ["course-hub-incubator-pitching-and-teams", 120],
  ["course-hub-lead-week-three", 160],
  ["course-hub-leaving", 330],
  ["course-hub-programme-end", 190],
  ["course-hub-programme-surveys", 90],
  ["course-hub-remind", 160],
  ["course-hub-sessions-and-work", 320],
  ["course-hub-survey-admin", 100],
  ["course-hub-week-one-before-groups", 300],
  ["course-hub-week-review", 100],
  ["course-hub-whole-term", 750],
  ["course-hub-work-loop", 130],
  ["coursework-notes", 70],
  ["events-at-the-door", 100],
  ["events-authoring", 70],
  ["events-rsvp", 10],
  ["member-journey", 80],
  ["membership-console", 20],
  ["messages", 70],
  ["register-push", 90],
  ["round-authoring", 30],
]);

/** What a spec with no recorded time is taken to cost: about the middle of the table. */
export const DEFAULT_SPEC_SECONDS = 120;

/**
 * What part 1 is taken to hold before any spec is dealt to it: it waits in
 * the shared queue behind part 1 of any other run, so it is kept short.
 */
export const SHARED_QUEUE_SECONDS = 600;

/** A spec's recorded seconds, or the default. */
export function secondsFor(name) {
  return SPEC_SECONDS.get(name) ?? DEFAULT_SPEC_SECONDS;
}

/**
 * The names that run in part `index` of `count`, in name order. The borrowers
 * go to part 1. The rest are dealt longest first (name order between equals),
 * each to the part with the least work so far (the lowest part between
 * equals), with part 1 starting at the borrowers' time and the shared queue's
 * allowance.
 * @param {readonly string[]} names
 * @param {number} index 1-based
 * @param {number} count
 * @returns {string[]}
 */
export function namesInShard(names, index, count) {
  const sorted = [...new Set(names)].sort();
  const pinned = sorted.filter((name) => BORROWS_A_SHARED_SETTING.has(name));
  const dealt = sorted.filter((name) => !BORROWS_A_SHARED_SETTING.has(name));
  if (count === 1) return index === 1 ? sorted : [];
  const longestFirst = [...dealt].sort((a, b) => secondsFor(b) - secondsFor(a) || (a < b ? -1 : 1));
  const work = Array.from({ length: count }, () => 0);
  work[0] = SHARED_QUEUE_SECONDS + pinned.reduce((sum, name) => sum + secondsFor(name), 0);
  const parts = Array.from({ length: count }, () => []);
  for (const name of longestFirst) {
    let least = 0;
    for (let part = 1; part < count; part += 1) if (work[part] < work[least]) least = part;
    parts[least].push(name);
    work[least] += secondsFor(name);
  }
  return [...(index === 1 ? pinned : []), ...(parts[index - 1] ?? [])].sort();
}
