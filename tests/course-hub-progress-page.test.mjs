/**
 * The progress page (`/learn/[runId]/progress`) counts a week written as
 * blocks by This week's tasks, and every other week as it always has.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. A WEEK WRITTEN AS BLOCKS COUNTS ITS TASKS, through the one place "done"
 *     is worked out (`handedTasksDone` in
 *     `src/lib/courses/weekBlocks/progress.ts`), from the overview route's own
 *     answer: week 1 reads "0 of 1" until its one task is done, which takes its
 *     sources ticked AND its reflection boxes written, and then "1 of 1". A
 *     task holding something a later page finishes is counted and never done.
 *     Before this the page counted readings and checklist items, which a block
 *     week has none of, so every block week read "Nothing to check off this
 *     week." and counted for nothing in the total.
 *  2. A WEEK WRITTEN BEFORE BLOCKS COUNTS AS BEFORE, word for word: its row is
 *     what the page's old count made of it, ticked or not, and a week before
 *     somebody joined is shown and not counted, whichever way it is written.
 *  3. THE PAGE ASKS THE ONE COUNT: its rows come from `progressRows`, which
 *     asks `handedTasksDone` and nothing else of a block week.
 *
 * Built on `tests/lib/weekBlocksPageWorld.mjs`: AGI Strategy's run in week 3,
 * weeks 1 and 3 written as blocks in week 1's shape (one task over three
 * parts), week 2 the week holding every kind of block, week 4 written before
 * blocks with two readings, weeks 5 and 6 not published. Chloe is in Group B,
 * told. Real: the overview route, the reflection route and the page's own
 * count. Stubbed, for loading the page's module only: Next's link, the
 * browser's data hooks and database, the stylesheet and the motion wrapper.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOW, RUN, makeWeekBlocksPageWorld } from "./lib/weekBlocksPageWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const PAGE_DIR = join(SRC, "app", "(app)", "learn", "[runId]", "progress");

const w = await makeWeekBlocksPageWorld("__progressPage");
const { world } = w;

/** The page's module, loaded with only the browser's doors stood in. */
const { loadTs } = createLoader({
  stubs: [
    ["next/link", "export default function Link() { return null; }"],
    ["firebase/firestore", "export function collection() { return {}; }\nexport async function getDocs() { return { docs: [] }; }"],
    ["@/lib/firebase/client", "export function getClientDb() { return {}; }"],
    ["@/features/courses/useRunOverview", "export default function useRunOverview() { return { data: null, loading: true, error: null, reload() {} }; }"],
    ["@/features/courses/useRunProgress", "export default function useRunProgress() { return { byItemId: new Map(), loading: true, error: null }; }"],
    ["@/components/motion/PageEnter", "export default function PageEnter({ children }) { return children; }"],
    ["./ProgressBody.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    ["./Card.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    ["./Chip.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    ["./EmptyState.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    ["./ProgressBar.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    ["./Skeleton.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
  ],
});
const { progressRows } = await loadTs(join(PAGE_DIR, "ProgressBody.tsx"));
const { normalizeCourseWeek } = await loadTs(join(SRC, "lib", "firestore", "courses.ts"));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

/**
 * Each week's readings and checklist items, by week number, as the page's
 * own reader of the week documents builds them: every material that is not
 * optional, then every checklist item. A week written as blocks has neither.
 */
function itemsByWeek() {
  const byWeek = new Map();
  for (let n = 1; n <= 6; n += 1) {
    const id = `w0${n}`;
    const stored = world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`);
    if (!stored) continue;
    const week = normalizeCourseWeek(id, stored);
    byWeek.set(week.weekNumber, [...week.materials.filter((m) => !m.optional).map((m) => m.id), ...week.checklist.map((c) => c.id)]);
  }
  return byWeek;
}

/** The member's own ticks, as `useRunProgress` hands them: completed rows by item id. */
const ticks = (ids) => new Map(ids.map((id) => [id, { id, itemId: id, completed: true }]));

/** The page's rows for `who`, from the overview route's own answer, with these items ticked. */
async function rowsFor(who, ticked = [], joinedWeek = null) {
  const answer = await w.overview(who);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  const data = answer.body;
  return progressRows({
    weeks: data.weeks,
    currentWeekNumber: data.currentWeek?.weekNumber ?? null,
    byWeek: itemsByWeek(),
    byItemId: ticks(ticked),
    joinedWeek: joinedWeek ?? data.enrolment?.joinedWeekNumber ?? 1,
  });
}

/** One week's row, as [completed, total, counted]. */
const rowOf = (rows, n) => {
  const row = rows.find((each) => each.weekNumber === n);
  return row ? [row.completed, row.total, row.counted] : null;
};

/** "Everything so far": the counted rows' done and total, as the page adds them up. */
function everythingSoFar(rows) {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    if (!row.counted) continue;
    done += row.completed;
    total += row.total;
  }
  return [done, total];
}

/** What week 1's one task needs, from the overview's own answer. */
async function weekOneNeeds() {
  const week = (await w.overview("chloe")).body.weeks.find((each) => each.weekNumber === 1);
  return week.thisWeek.rows.find((row) => row.type === "task").needs;
}

// ---------------------------------------------------------------------------
// 1. A week written as blocks counts its tasks
// ---------------------------------------------------------------------------

describe("1. a week written as blocks counts This week's tasks", () => {
  test("week 1 reads 0 of 1 until its one task is done: its sources ticked and its boxes written", async () => {
    const needs = await weekOneNeeds();
    assert.deepEqual([needs.tickIds.length, needs.promptIds.length, needs.unseenIds], [2, 6, []]);

    assert.deepEqual(rowOf(await rowsFor("chloe"), 1), [0, 1, true]);
    // Ticked and not written: the task is not done.
    assert.deepEqual(rowOf(await rowsFor("chloe", needs.tickIds), 1), [0, 1, true]);
    // Written and not ticked: not done either. Written on the Monday before
    // Group B met for week 1 (Tue 3 Nov), while the week still took work: a
    // week locks when its session starts (the week you submit).
    mock.timers.setTime(Date.parse("2026-11-02T12:00:00Z"));
    for (const promptId of needs.promptIds) {
      assert.equal((await w.writeBox("chloe", promptId, "w01", "What I think, in a sentence.")).status, 200);
    }
    mock.timers.setTime(NOW.getTime());
    assert.deepEqual(rowOf(await rowsFor("chloe"), 1), [0, 1, true]);
    // Both: done.
    assert.deepEqual(rowOf(await rowsFor("chloe", needs.tickIds), 1), [1, 1, true]);
  });

  test("a week whose tasks hold more than ticks is counted, and ticks alone finish none of them; a row with nothing to do or only offered counts for nothing", async () => {
    const week = (await w.overview("chloe")).body.weeks.find((each) => each.weekNumber === 2);
    const tasks = week.thisWeek.rows.filter((row) => row.type === "task");
    assert.equal(tasks.length, 3);
    // Each task also holds what ticking does not finish, now that every page
    // can see it done: a pack to have, a written answer to send, a talk to be
    // ready for. Nothing is left unseen.
    assert.deepEqual(
      tasks.map((task) => [task.needs.chooseOneIds.length, task.needs.answerIds.length, task.needs.talkIds.length, task.needs.unseenIds.length]),
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    );
    // Every source and checklist item of the week ticked: still nothing done.
    const everyTick = tasks.flatMap((task) => task.needs.tickIds);
    assert.deepEqual(rowOf(await rowsFor("chloe", everyTick), 2), [0, 3, true]);
  });

  test("every block week counts, and the total is theirs and the readings of the week before blocks", async () => {
    const rows = await rowsFor("chloe");
    assert.deepEqual(
      rows.map((row) => [row.weekNumber, row.completed, row.total, row.counted, row.isCurrent]),
      [
        [1, 0, 1, true, false],
        [2, 0, 3, true, false],
        [3, 0, 1, true, true],
        [4, 0, 2, true, false],
      ],
    );
    assert.deepEqual(everythingSoFar(rows), [0, 7]);
    // No block week reads as having nothing to check off any more.
    assert.ok(rows.filter((row) => row.weekNumber <= 3).every((row) => row.total > 0));
  });

  test("a block week before somebody joined is shown and not counted", async () => {
    const rows = await rowsFor("chloe", [], 3);
    assert.deepEqual(
      rows.map((row) => [row.weekNumber, row.counted]),
      [
        [1, false],
        [2, false],
        [3, true],
        [4, true],
      ],
    );
    assert.deepEqual(everythingSoFar(rows), [0, 3]);
  });
});

// ---------------------------------------------------------------------------
// 2. A week written before blocks counts as before
// ---------------------------------------------------------------------------

/**
 * The page's count before block weeks, kept here exactly as it was written,
 * to hold a week written before blocks to it: its readings and checklist
 * items, ticked or not.
 */
function countedBeforeBlocks(data, byWeek, byItemId, joinedWeek) {
  const currentWeekNumber = data.currentWeek?.weekNumber ?? null;
  return data.weeks
    .filter((week) => week.published)
    .map((week) => {
      const items = byWeek.get(week.weekNumber) ?? [];
      let completed = 0;
      for (const itemId of items) {
        if (byItemId.get(itemId)?.completed) completed += 1;
      }
      return {
        weekNumber: week.weekNumber,
        title: week.title,
        total: items.length,
        completed,
        counted: week.weekNumber >= joinedWeek,
        isCurrent: week.weekNumber === currentWeekNumber,
      };
    });
}

describe("2. a week written before blocks counts as before, word for word", () => {
  for (const ticked of [[], ["w4r1"], ["w4r1", "w4r2"]]) {
    test(`week 4, with ${ticked.length} of its readings ticked, is the row the page made of it before`, async () => {
      const data = (await w.overview("chloe")).body;
      const before = countedBeforeBlocks(data, itemsByWeek(), ticks(ticked), 1).find((row) => row.weekNumber === 4);
      const now = (await rowsFor("chloe", ticked)).find((row) => row.weekNumber === 4);
      assert.deepEqual(now, before);
      assert.deepEqual([now.completed, now.total], [ticked.length, 2]);
    });
  }

  test("a tick on a block week's source never counts toward a week written before blocks, nor the other way", async () => {
    const needs = await weekOneNeeds();
    const rows = await rowsFor("chloe", [...needs.tickIds, "w4r1"]);
    assert.deepEqual([rowOf(rows, 1), rowOf(rows, 4)], [[0, 1, true], [1, 2, true]]);
  });
});

// ---------------------------------------------------------------------------
// 3. The page asks the one count
// ---------------------------------------------------------------------------

describe("3. the page asks the one count", () => {
  // The code with its comments gone and its strings kept, so a note that names a function is not a use.
  const code = stripSource(readFileSync(join(PAGE_DIR, "ProgressBody.tsx"), "utf8"), { keepStrings: true });

  test("its rows are progressRows', and a block week's count is handedTasksDone's from the one module", () => {
    assert.match(code, /return progressRows\(\{ weeks: data\.weeks, currentWeekNumber, byWeek, byItemId, joinedWeek \}\);/);
    assert.match(code, /import \{ handedTasksDone \} from "@\/lib\/courses\/weekBlocks\/progress";/);
    assert.equal(code.split("handedTasksDone(").length - 1, 1, "a block week is counted in one place on the page");
    assert.equal(code.split(".thisWeek").length - 1, 2, "the page reads This week only where progressRows counts it");
  });
});
