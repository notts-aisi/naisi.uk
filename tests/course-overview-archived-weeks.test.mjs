/**
 * A programme's Overview, by week, when somebody spent weeks in a group
 * ARCHIVED since.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. A WHOLE WEEK READS THE ATTENDANCE TAB'S TOTAL, which counts, once, the
 *     mark a moved person has on an archived group's finished register of a
 *     session held (`src/lib/courses/archivedWeeks.ts`). The Overview's
 *     "N of M came" is that total, so the mark is in it exactly once.
 *  2. IN NO GROUP ROW: an archived group has no row, and the mark is not in
 *     the row of the group the person is in now.
 *  3. A WEEK WHOSE ONLY FINISHED SESSION WAS AN ARCHIVED GROUP'S reads the
 *     tab's total, never "No group meets in week N".
 *
 * Built on `tests/lib/registerWorld.mjs`, as
 * `tests/course-archived-group-weeks.test.mjs` builds it: Group B (Amara,
 * Chloe, Farah) and Group A (Ana); Chloe is moved to Group A from week 3 with
 * a record, and Group B is then archived. Weeks 1 and 2 of both groups are
 * finished; Group A's week 3 is saved and not finished.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__overviewArchivedWeeks");
const { world, reset, lib } = made;

const { readRunRecords, buildRunAttendance } = await lib("courses", "programmeAttendance.ts");
const { buildProgrammeOverview } = await lib("courses", "programmeOverview.ts");

/** Wednesday 4 November 2026, noon: week 3 has met in both groups, week 4 has not. */
const NOW = new Date("2026-11-04T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const CHLOE = `courseEnrolments/${RUN}__chloe`;
const RECORD = [
  { groupId: GROUP.b, fromWeek: 1 },
  { groupId: GROUP.a, fromWeek: 3 },
];

/** A register: marks by uid; finished the evening it met unless `draft`. */
function registerOf(groupId, weekNumber, records, { draft = false, held = true } = {}) {
  world.db.seed(registerPath(groupId, weekNumber), {
    runId: RUN,
    groupId,
    weekNumber,
    occurrence: 1,
    records,
    held,
    ...(draft ? {} : { pushedAt: new Date("2026-10-19T20:00:00Z"), pushedByUid: "zach" }),
  });
}

/** The archived world of `course-archived-group-weeks.test.mjs`. */
function archivedWorld() {
  registerOf(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
  registerOf(GROUP.b, 2, { amara: "present", chloe: "present", farah: "late" });
  registerOf(GROUP.b, 3, { amara: "present", farah: "present" });
  registerOf(GROUP.a, 1, { ana: "present" });
  registerOf(GROUP.a, 2, { ana: "present" });
  registerOf(GROUP.a, 3, { ana: "present", chloe: "late" }, { draft: true });
  world.db.poke(CHLOE, { groupId: GROUP.a, groupsByWeek: RECORD });
  world.db.poke(`courseGroups/${GROUP.b}`, { archived: true });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(seedWorld());
  archivedWorld();
});

const ADMIN = { isAdmin: true, uid: "zach" };
const PLACE = { programmePath: "/admin/admissions/forms/r/programmes/p", courseId: "course", decisionsSentAt: null };

async function overviewOn(week) {
  const records = await readRunRecords(world.db, RUN);
  const model = await buildProgrammeOverview(world.db, records, ADMIN, PLACE, new Date(), week);
  const totals = buildRunAttendance(records, ADMIN, new Date()).totals;
  return { model, totals };
}

describe("a week spent in a group archived since", () => {
  test("a whole week's figure is the tab's total, with the moved person's mark in it once and in no group row", async () => {
    const { model, totals } = await overviewOn(2);
    for (const weekNumber of [1, 2]) {
      const week = model.byWeek.weeks.find((each) => each.weekNumber === weekNumber);
      const total = totals.find((each) => each.weekNumber === weekNumber);
      assert.equal(week.state, "done", `week ${weekNumber}`);
      assert.deepEqual([week.came, week.of, week.counts.online], [total.came, total.of, total.online], `week ${weekNumber}`);
      assert.equal(week.line, `${total.came} of ${total.of} came`);
    }
    // Week 1: Ana present (Group A) and Chloe excused (Group B, archived): her mark once, as excused.
    const week1 = model.byWeek.weeks.find((each) => each.weekNumber === 1);
    assert.deepEqual([week1.line, week1.counts], ["1 of 2 came", { room: 1, online: 0, excused: 1, absent: 0 }]);
    // Week 2: Ana and Chloe both present.
    assert.equal(model.byWeek.weeks.find((each) => each.weekNumber === 2).line, "2 of 2 came");
    // Group B has no row; Group A's row counts its own register, never Chloe's week on Group B's.
    const rows = model.byWeek.groups.rows;
    assert.deepEqual(
      rows.map((row) => [row.groupId, row.cameBefore, row.came]),
      [[GROUP.a, "1 of 1", "1 of 1"]],
    );
  });

  test("a week whose only finished session was the archived group's reads the tab's total, not that no group meets", async () => {
    // Group A's week 1 did not happen: the only session of week 1 that counts is Group B's.
    registerOf(GROUP.a, 1, {}, { held: false });
    const { model, totals } = await overviewOn(1);
    const week1 = model.byWeek.weeks.find((each) => each.weekNumber === 1);
    const total = totals.find((each) => each.weekNumber === 1);
    assert.deepEqual([total.came, total.of], [0, 1], "the tab's total keeps Chloe's excused week");
    assert.deepEqual([week1.state, week1.line, week1.counts], ["done", "0 of 1 came", { room: 0, online: 0, excused: 1, absent: 0 }]);
    assert.deepEqual(
      model.byWeek.groups.rows.map((row) => [row.groupId, row.came]),
      [[GROUP.a, "Not held"]],
    );
  });

  test("a week not yet whole counts the archived group's finished mark once, in the week's figure alone", async () => {
    // Week 3: Group A's register is saved and not finished, so only finished registers count; Chloe spent week 3 in Group A.
    const { model } = await overviewOn(3);
    const week3 = model.byWeek.weeks.find((each) => each.weekNumber === 3);
    assert.equal(week3.state, "so-far");
    assert.deepEqual(week3.counts, { room: 0, online: 0, excused: 0, absent: 0 });
    assert.equal(model.byWeek.groups.rows.find((row) => row.groupId === GROUP.a).came, "Not pushed");
  });
});
