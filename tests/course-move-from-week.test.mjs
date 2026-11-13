/**
 * Moving somebody to another group from a week (`moveFromWeek` in
 * `src/lib/courses/moveFromWeek.ts`), the one writer of a place's record of
 * groups by week, and what every other writer of a place's group does to a
 * record already there.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules
 *
 *  1. THE WRITER sets the place's group and the record in one transaction,
 *     keeps the record consistent (in week order, one entry a week, the last
 *     entry's group the place's), moves the two groups' counts as a move on
 *     the board does, keeps a told seat told, and refuses what it should.
 *     Nothing calls it from a route yet: `tests/course-groups-by-week-readers.test.mjs`
 *     holds that.
 *  2. EVERY OTHER WRITER of a place's group deletes the record whenever it
 *     changes the group, in the same write, so a record can never disagree
 *     with the place: the place then reads the group it is in now for every
 *     week, as every move before the record did. A write that leaves the
 *     group as it is keeps it.
 *
 * `tests/lib/groupPublishedWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { GROUP, RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

const made = await makeGroupWorld("__moveFromWeek");
const { world, reset, steps, enrolmentPath, loadTs } = made;
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { moveFromWeek } = await loadTs(join("lib", "courses", "moveFromWeek.ts"));

/** Six taught weeks: the writer refuses a week past the last week of the run's plan, and these moves go up to week 5. */
const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));

beforeEach(() => {
  reset();
  world.db.poke(`courseRuns/${RUN.agi}`, { weekPlan: SIX_WEEKS });
});

const seatOf = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, world.db.read(enrolmentPath(uid)));
const storedOf = (uid) => world.db.read(enrolmentPath(uid));
const countOf = (groupId) => world.db.read(`courseGroups/${groupId}`).memberCount;
const move = (uid, toGroupId, fromWeek, runId = RUN.agi) => moveFromWeek(world.db, { runId, uid, toGroupId, fromWeek });

describe("1. the writer", () => {
  test("moves a told seat from a week: the group and the record together, both counts, still told", async () => {
    await steps.published();
    const before = seatOf("dev");
    assert.equal(before.groupId, GROUP.monday);
    const monday = countOf(GROUP.monday);
    const thursday = countOf(GROUP.thursday);

    const moved = await move("dev", GROUP.thursday, 3);
    assert.deepEqual(moved, {
      ok: true,
      fromGroupId: GROUP.monday,
      toGroupId: GROUP.thursday,
      groupsByWeek: [{ groupId: GROUP.monday, fromWeek: 1 }, { groupId: GROUP.thursday, fromWeek: 3 }],
    });
    const seat = seatOf("dev");
    assert.equal(seat.groupId, GROUP.thursday);
    assert.deepEqual(seat.groupsByWeek, moved.groupsByWeek);
    assert.deepEqual([1, 2, 3, 4].map((week) => enrolments.groupForWeek(seat, week)), [
      GROUP.monday,
      GROUP.monday,
      GROUP.thursday,
      GROUP.thursday,
    ]);
    assert.equal(countOf(GROUP.monday), monday - 1);
    assert.equal(countOf(GROUP.thursday), thursday + 1);
    assert.equal(enrolments.placementIsTold(seat), true, "a told seat stays told");
    assert.equal(enrolments.groupToldAbout(seat), GROUP.monday, "the group they were told about is kept");
  });

  test("a second move keeps the weeks before it; a move back over every week it changed leaves no record", async () => {
    await steps.published();
    await move("dev", GROUP.thursday, 3);
    const again = await move("dev", GROUP.unset, 5);
    assert.equal(again.ok, true);
    assert.deepEqual(seatOf("dev").groupsByWeek, [
      { groupId: GROUP.monday, fromWeek: 1 },
      { groupId: GROUP.thursday, fromWeek: 3 },
      { groupId: GROUP.unset, fromWeek: 5 },
    ]);
    const back = await move("dev", GROUP.monday, 3);
    assert.equal(back.ok, true);
    assert.equal(back.groupsByWeek, null);
    assert.equal(seatOf("dev").groupId, GROUP.monday);
    assert.equal("groupsByWeek" in storedOf("dev"), false, "the field is deleted, not left behind");
  });

  test("a move from week 1 is a move for every week: no record", async () => {
    await steps.published();
    const moved = await move("dev", GROUP.thursday, 1);
    assert.equal(moved.ok, true);
    assert.equal(moved.groupsByWeek, null);
    assert.equal("groupsByWeek" in storedOf("dev"), false);
    assert.equal(enrolments.groupForWeek(seatOf("dev"), 1), GROUP.thursday);
  });

  test("moving them to the group they are in from an earlier week keeps the group and its count", async () => {
    await steps.published();
    await move("dev", GROUP.thursday, 3);
    const thursday = countOf(GROUP.thursday);
    const moved = await move("dev", GROUP.thursday, 2);
    assert.equal(moved.ok, true);
    assert.deepEqual(seatOf("dev").groupsByWeek, [
      { groupId: GROUP.monday, fromWeek: 1 },
      { groupId: GROUP.thursday, fromWeek: 2 },
    ]);
    assert.equal(countOf(GROUP.thursday), thursday);
    // From a later week it says nothing new: week 3 is theirs already.
    assert.deepEqual(await move("dev", GROUP.thursday, 4), { ok: false, refusal: "unchanged" });
  });

  test("refuses what it should, and writes nothing when it does", async () => {
    await steps.placed();
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "not-told" });
    await steps.publishes();
    const untouched = JSON.stringify(storedOf("dev"));
    for (const week of [0, 61, 2.5, Number.NaN]) {
      assert.deepEqual(await move("dev", GROUP.thursday, week), { ok: false, refusal: "bad-week" });
    }
    assert.deepEqual(await move("nobody", GROUP.thursday, 3), { ok: false, refusal: "no-place" });
    assert.deepEqual(await move("dev", "no-such-group", 3), { ok: false, refusal: "group-not-found" });
    assert.deepEqual(await move("dev", GROUP.monday, 3), { ok: false, refusal: "unchanged" });
    world.db.poke(`courseGroups/${GROUP.thursday}`, { capacity: countOf(GROUP.thursday) });
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "group-full" });
    world.db.poke(`courseGroups/${GROUP.thursday}`, { capacity: 20, archived: true });
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "group-archived" });
    world.db.poke(`courseGroups/${GROUP.thursday}`, { archived: false });
    world.db.poke(`courseGroups/${GROUP.unset}`, { facilitatorUids: ["dev"] });
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "facilitates-another-group" });
    assert.equal(JSON.stringify(storedOf("dev")), untouched);
  });

  test("a week past the last week of the run's plan is refused; the last week itself is not", async () => {
    await steps.published();
    const untouched = JSON.stringify(storedOf("dev"));
    assert.deepEqual(await move("dev", GROUP.thursday, 7), { ok: false, refusal: "bad-week" });
    // A plan with a break: its last taught week is the last week a move can be from.
    world.db.poke(`courseRuns/${RUN.agi}`, {
      weekPlan: [
        { kind: "week", weekNumber: 1, weekId: "w01" },
        { kind: "break", label: "Reading week" },
        { kind: "week", weekNumber: 2, weekId: "w02" },
        { kind: "week", weekNumber: 3, weekId: "w03" },
      ],
    });
    assert.deepEqual(await move("dev", GROUP.thursday, 4), { ok: false, refusal: "bad-week" });
    // A plan with no taught week takes no move at all.
    world.db.poke(`courseRuns/${RUN.agi}`, { weekPlan: [] });
    assert.deepEqual(await move("dev", GROUP.thursday, 1), { ok: false, refusal: "bad-week" });
    assert.equal(JSON.stringify(storedOf("dev")), untouched, "nothing is written by a refusal");
    world.db.poke(`courseRuns/${RUN.agi}`, { weekPlan: SIX_WEEKS.slice(0, 3) });
    const last = await move("dev", GROUP.thursday, 3);
    assert.equal(last.ok, true, JSON.stringify(last));
  });

  test("a group document that is not there, the one they go to or the one they leave, is a refusal and never a throw", async () => {
    await steps.published();
    const untouched = JSON.stringify(storedOf("dev"));
    const counts = () => [GROUP.monday, GROUP.thursday].map((id) => world.db.read(`courseGroups/${id}`)?.memberCount ?? null);
    const remove = (path) => {
      const [collection, id] = path.split("/");
      return world.db.collection(collection).doc(id).delete();
    };
    // The group they go to: deleted.
    const thursday = world.db.read(`courseGroups/${GROUP.thursday}`);
    await remove(`courseGroups/${GROUP.thursday}`);
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "group-not-found" });
    world.db.seed(`courseGroups/${GROUP.thursday}`, thursday);
    // The group their place names: deleted, so there is no count to take one off.
    const monday = world.db.read(`courseGroups/${GROUP.monday}`);
    const before = counts();
    await remove(`courseGroups/${GROUP.monday}`);
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "own-group-not-found" });
    assert.equal(JSON.stringify(storedOf("dev")), untouched, "nothing is written by a refusal");
    world.db.seed(`courseGroups/${GROUP.monday}`, monday);
    assert.deepEqual(counts(), before, "no count moved");
    // The run itself gone: no place to move.
    const run = world.db.read(`courseRuns/${RUN.agi}`);
    await remove(`courseRuns/${RUN.agi}`);
    assert.deepEqual(await move("dev", GROUP.thursday, 3), { ok: false, refusal: "no-place" });
    world.db.seed(`courseRuns/${RUN.agi}`, run);
    assert.equal((await move("dev", GROUP.thursday, 3)).ok, true);
  });
});

describe("2. every other writer of a place's group", () => {
  test("a move on the board deletes the record, and the place reads the group it is in now for every week", async () => {
    await steps.published();
    await move("dev", GROUP.thursday, 3);
    const placed = await steps.place([{ uid: "dev", groupId: GROUP.unset }]);
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.deepEqual(placed.body.rejected, []);
    const seat = seatOf("dev");
    assert.equal(seat.groupId, GROUP.unset);
    assert.equal("groupsByWeek" in storedOf("dev"), false);
    assert.deepEqual([1, 3, 5].map((week) => enrolments.groupForWeek(seat, week)), [GROUP.unset, GROUP.unset, GROUP.unset]);
  });

  test("a press on the board that leaves them where they are keeps the record", async () => {
    await steps.published();
    await move("dev", GROUP.thursday, 3);
    const placed = await steps.place([{ uid: "dev", groupId: GROUP.thursday }]);
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.deepEqual(seatOf("dev").groupsByWeek, [
      { groupId: GROUP.monday, fromWeek: 1 },
      { groupId: GROUP.thursday, fromWeek: 3 },
    ]);
  });

  test("taking somebody out of every group on the board deletes the record", async () => {
    await steps.published();
    await move("dev", GROUP.thursday, 3);
    const placed = await steps.place([{ uid: "dev", groupId: null }]);
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.equal(seatOf("dev").groupId, null);
    assert.equal("groupsByWeek" in storedOf("dev"), false);
  });

  /**
   * Every file that writes Publish's group (`toldGroupId`) or the record is a
   * writer of a place's group, or sits beside one: each is listed with
   * whether it changes the group. One that does deletes the record in the
   * same write, unless it is the writer itself.
   */
  const WRITERS = {
    "lib/courses/moveFromWeek.ts": { changesGroup: "the writer", why: "the one writer of the record: it sets the group and the record together" },
    "app/api/courses/runs/[runId]/allocate/route.ts": {
      changesGroup: true,
      why: "a move on the board, to another group or to none, is for every week, so the record goes with any change of group",
    },
    "app/api/courses/runs/[runId]/enrol/route.ts": {
      changesGroup: true,
      why: "somebody changing the session of a seat they took for themselves on an open run changes it for every week",
    },
    "app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts": {
      changesGroup: true,
      why: "Remove takes the place out of every group, so a record ending in a group would disagree with it",
    },
    "lib/courses/groupFacilitators.ts": {
      changesGroup: true,
      why: "placing a facilitator who holds a place and sits in no group in the group they facilitate: a place in no group has no record, and any stored one goes",
    },
    "app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts": {
      changesGroup: false,
      why: "putting back a seat in the group it already names: the group does not change, so a record ending in it still agrees",
    },
    "app/api/courses/runs/[runId]/allocation/publish/route.ts": {
      changesGroup: false,
      why: "Publish writes the group it told somebody about beside its stamp, and never moves anybody",
    },
  };

  /** As `tests/course-hub-group-published-readers.test.mjs` reads it: the code hands the collection's name to a database call. */
  const ADDRESSES =
    /\.collection\(\s*["'`]courseEnrolments["'`]\s*\)|\b(?:collection|doc)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["'`]courseEnrolments["'`]|\bbyRunId\(\s*["'`]courseEnrolments["'`]\s*\)|\[\s*["'`]courseEnrolments["'`]\s*,|\bdrainQuery\([^,]+,\s*["'`]courseEnrolments["'`]/;
  /** A database write: an update, or a set or create on a transaction, a batch or a writer. */
  const WRITES = /\.update\(|\b(?:tx|writer|batch|transaction)\.(?:set|create)\(/;
  const WRITES_TOLD_OR_RECORD = /\b(?:toldGroupId|groupsByWeek)(?:\s*:|\s*=(?!=))/;
  const RECORD_DELETED = /\bgroupsByWeek(?:\s*:|\s*=)\s*FieldValue\.delete\(\)/g;
  const RECORD_WRITTEN = /\bgroupsByWeek(?:\s*:|\s*=(?!=))/g;

  test("every writer beside a place's group is listed, and each that changes the group deletes the record", () => {
    const files = [...walkSource(SRC)]
      .filter((file) => !file.includes(`${sep}lib${sep}firestore${sep}courseEnrolments.ts`))
      .map((file) => [inSrc(file), stripSource(readFileSync(file, "utf8"), { keepStrings: true })]);
    const writing = files
      .filter(([, code]) => ADDRESSES.test(code) && WRITES.test(code) && WRITES_TOLD_OR_RECORD.test(code))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(writing, Object.keys(WRITERS).sort(), "A file writes beside a place's group and is not listed: say whether it changes the group.");
    for (const [file, code] of files) {
      const entry = WRITERS[file];
      if (!entry) continue;
      assert.ok(entry.why.length >= 40, `${file} needs its reason written down`);
      const deleted = [...code.matchAll(RECORD_DELETED)].length;
      const written = [...code.matchAll(RECORD_WRITTEN)].length;
      if (entry.changesGroup === true) assert.ok(deleted >= 1, `${file} changes a place's group and leaves its record behind`);
      if (entry.changesGroup === false) assert.equal(written, 0, `${file} does not change a place's group and has no business with its record`);
      if (entry.changesGroup !== "the writer") assert.equal(written, deleted, `${file} writes a record: only the writer may`);
    }
  });
});
