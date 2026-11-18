/**
 * A programme's Overview, by week: each group's readings and coursework done
 * for the chosen week are THE GROUP PAGE'S OWN COUNTS, on a run whose weeks
 * are written as blocks.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. ONE COUNT. For every group and every week of the plan, the Overview's
 *     "Readings done" and "Coursework done" are the done counts of the
 *     readings bar and of "N of M have done week N" on that group's own page
 *     for that week (`loadGroupPage`), out of the same people.
 *  2. THE WORDS for a week not published ("Not published yet"), a group with
 *     nobody in it ("Nobody yet") and an incubator's groups ("Not tracked",
 *     as their pages draw no card).
 *  3. ONE READ OF THE WEEK FOR EVERY GROUP: the week's answers and ticks are
 *     asked once per copy of the week, not once per group.
 *
 * The world is `tests/lib/remindWorld.mjs`: Group B's week 3 is over, Amara
 * did all of it, Rahul (who facilitates Group B and holds a place in it)
 * ticked one reading, Ines and Omar did nothing; week 5 is not published.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { B, BEFORE_WEEK3, RUN, makeRemindWorld, tickRow } from "./lib/remindWorld.mjs";

const w = await makeRemindWorld("__overviewByWeek");
const { world, page } = w;
const { readRunRecords } = await w.loadTs("lib/courses/programmeAttendance.ts");
const { buildProgrammeOverview } = await w.loadTs("lib/courses/programmeOverview.ts");
const { countBuckets, doneCount } = await w.loadTs("lib/courses/groupWeekWork/model.ts");

beforeEach(() => w.reset());

const PLACE = { programmePath: "/admin/admissions/forms/r/programmes/p", courseId: "course", decisionsSentAt: null };
const LEAD = { isAdmin: false, uid: "claudia" };

/** The Overview's row for each group, for `week`. */
async function overviewRows(week, place = PLACE) {
  const records = await readRunRecords(world.courseDb, RUN.agi);
  const model = await buildProgrammeOverview(world.courseDb, records, LEAD, place, new Date(), week);
  return { model, rows: new Map(model.byWeek.groups.rows.map((row) => [row.groupId, row])) };
}

/** What the group's own page counts for `week`: its people, the readings bar's done and the week's done. */
async function pageCounts(groupId, week) {
  const groupsLib = await w.loadTs("lib/firestore/courseGroups.ts");
  const coursesLib = await w.loadTs("lib/firestore/courses.ts");
  const groupPage = await w.loadTs("lib/courses/groupPage/load.ts");
  const run = coursesLib.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
  const group = groupsLib.normalizeCourseGroup(groupId, world.db.read(`courseGroups/${groupId}`));
  const view = await groupPage.loadGroupPage(world.courseDb, { run, group, viewer: "lead", viewerUid: "claudia", now: new Date(), week });
  const work = view.work;
  if (!work) return null;
  const readings = work.pieces.some((piece) => piece.key === "readings")
    ? doneCount(countBuckets(work.rows.map((row) => row.pieces.find((piece) => piece.key === "readings")?.bucket ?? "not-started")))
    : null;
  return { people: work.rows.length, readings, week: doneCount(countBuckets(work.rows.map((row) => row.week.bucket))) };
}

describe("1. the Overview's work counts are the group pages' own", () => {
  test("Group B's week 3: Amara done, Rahul's tick his own and counted nowhere", async () => {
    const { rows } = await overviewRows(3);
    const counts = await pageCounts(B, 3);
    assert.ok(counts, "the group's page draws a card for week 3");
    const row = rows.get(B);
    assert.equal(row.readings, `${counts.readings} of ${counts.people}`);
    assert.equal(row.coursework, `${counts.week} of ${counts.people}`);
    assert.equal(row.coursework.split(" of ")[0], "1", "only Amara has done week 3");
    // A tick from Ines moves both pages by the same one.
    world.db.seed(...tickRow("ines", 3, "r3-s1", BEFORE_WEEK3));
    world.db.seed(...tickRow("ines", 3, "r3-s2", BEFORE_WEEK3));
    const after = await pageCounts(B, 3);
    assert.equal((await overviewRows(3)).rows.get(B).readings, `${after.readings} of ${after.people}`);
    assert.equal(after.readings, counts.readings + 1);
  });

  test("every group and every week of the plan agrees with its page, or says why it counts nothing", async () => {
    const records = await readRunRecords(world.courseDb, RUN.agi);
    const weeks = [...new Set(records.run.weekPlan.filter((entry) => entry.kind === "week").map((entry) => entry.weekNumber))];
    for (const week of weeks) {
      const { rows } = await overviewRows(week);
      for (const group of records.groups) {
        const row = rows.get(group.id);
        const counts = await pageCounts(group.id, week);
        if (counts && counts.people > 0) {
          assert.equal(row.coursework, `${counts.week} of ${counts.people}`, `${group.name}, week ${week}`);
          assert.equal(row.readings, counts.readings === null ? "No readings" : `${counts.readings} of ${counts.people}`, `${group.name}, week ${week}`);
        } else {
          assert.ok(["Not tracked", "Not published yet", "Nobody yet"].includes(row.coursework), `${group.name}, week ${week}: ${row.coursework}`);
        }
      }
    }
  });
});

describe("2. the words when nothing is counted", () => {
  test("a week not published, and an incubator's groups", async () => {
    assert.equal((await overviewRows(5)).rows.get(B).coursework, "Not published yet");
    assert.equal((await overviewRows(5)).rows.get(B).readings, "Not published yet");
    const incubator = await overviewRows(3, { ...PLACE, incubator: true });
    assert.ok([...incubator.rows.values()].every((row) => row.readings === "Not tracked" && row.coursework === "Not tracked"));
  });
});

describe("3. one read of the week for every group", () => {
  test("the week's answers and ticks are asked once, whatever the number of groups", async () => {
    const asked = [];
    const collection = world.courseDb.collection.bind(world.courseDb);
    world.courseDb.collection = (path) => {
      asked.push(path);
      return collection(path);
    };
    try {
      await overviewRows(3);
    } finally {
      world.courseDb.collection = collection;
    }
    assert.equal(asked.filter((path) => path === "courseProgress").length, 1);
    assert.equal(asked.filter((path) => path === "courseExerciseResponses").length, 1);
  });
});
