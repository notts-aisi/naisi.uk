/**
 * A ONE-WEEK VISIT AND THE COPY OF A WEEK: somebody visiting another group's
 * session for one week still works in, and is judged on, THEIR OWN group's
 * copy of every week, the visit's week included. Every reader that judges a
 * person's week on a copy asks `RunWeekStates.copyGroupOf` and, for whose
 * member they are, `RunWeekStates.belongsTo`: both answer by the group the
 * place BELONGS to that week (`ownGroupForWeek`) for anybody whose weeks
 * differ, a visitor with no record of a move included; `dueWith` answers
 * whose session their work is due at (`groupForWeek`: the host for the
 * visit's week). With no visit and no record, every answer is as it was.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorWeekWorld.mjs`: Chloe is in Group B
 * (Tuesdays at 6pm); Group D meets on Mondays at 6pm (Grace), with Freya and
 * Yasmin. Week 3 and week 4 are written as blocks on the run; Group D has its
 * own copy of each, which asks one reflection more. Staff send Chloe to
 * Group D's session for week 4. The clock is Wed 18 Nov 2026, 9am: week 3 has
 * met in both groups, week 4 has not.
 *
 * Section 4 (the reminders before a session) is in
 * `tests/course-week-reminders.test.mjs`, section 9; "Week N is open" sent
 * to a visitor is in `tests/course-groups-by-week-sessions.test.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, B, NOW, RUN, facilitatorWeekSeed, makeFacilitatorWeekWorld, reflection } from "./lib/facilitatorWeekWorld.mjs";
import { D, registerPath } from "./lib/hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__visitCopies");
const readers = await w.loadTs(join("lib", "courses", "weekWork", "readers.ts"));
const earlier = await w.loadTs(join("lib", "courses", "groupWeekWork", "earlier.ts"));
const groupWeek = await w.loadTs(join("lib", "courses", "groupWeekWork", "load.ts"));
const { loadFacilitatorGroup } = await w.loadTs(join("lib", "courses", "facilitatorGroup.ts"));
const { loadGroupWeek } = await w.loadTs(join("lib", "courses", "facilitatorWeek", "readers.ts"));
const overviewRoute = await w.courseRoute("runs", "[runId]", "overview");
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));

const read = (path) => w.world.db.read(path);
const clone = (value) => JSON.parse(JSON.stringify(value));
const run = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const PROMPTS = (k) => [1, 2, 3, 4, 5, 6].map((n) => `${k}-rp${n}`);

/** A week written as blocks, published. */
const weekDoc = (n, blocks, title = `Week ${n}`) => ({
  weekNumber: n,
  title,
  summary: "",
  guideBlocks: [],
  materials: [],
  exercises: [],
  checklist: [],
  questions: [],
  estimatedMinutes: null,
  published: true,
  blocks,
});

/** The run's week `n`, and Group D's own copy of it, which asks one reflection more. */
function weeksWithGroupDCopy(n) {
  const k = `k${n}`;
  const runWeek = weekDoc(n, weekOneBlocks(k));
  const own = clone(runWeek);
  own.title = `Group D's week ${n}`;
  own.blocks.find((block) => block.id === `${k}-p1`).blocks.push({ id: `${k}-rsD`, type: "reflection", prompts: [{ id: `${k}-rpD`, text: "Group D only" }] });
  return {
    [`courseRuns/${RUN.agi}/weeks/w0${n}`]: runWeek,
    [`courseGroups/${D}/weeks/w0${n}`]: { ...own, groupId: D, runId: RUN.agi },
  };
}

/** `uid` finishes week `n` on the run's copy: every reflection written, both sources ticked. */
function finishOnRunCopy(uid, n) {
  const k = `k${n}`;
  for (const id of PROMPTS(k)) w.world.db.seed(`courseExerciseResponses/${RUN.agi}__${uid}__w0${n}__${id}`, reflection(uid, id, `${uid} on ${id}`, n));
  for (const src of [`${k}-s1`, `${k}-s2`]) {
    w.world.db.seed(`courseProgress/${RUN.agi}__${uid}__${src}`, {
      runId: RUN.agi,
      uid,
      weekNumber: n,
      itemKind: "material",
      itemId: src,
      completed: true,
      completedAt: new Date("2026-11-16T10:00:00Z"),
    });
  }
}

/** Staff's visit, as it is stored: Chloe at Group D's session for week 4. */
function visitD(week = 4) {
  w.world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: week, groupId: D, arrangedByUid: "zach", arrangedAt: new Date("2026-11-17T10:00:00Z") }] });
}

beforeEach(() => {
  w.reset(facilitatorWeekSeed({ ...weeksWithGroupDCopy(3), ...weeksWithGroupDCopy(4) }));
  for (const [groupId, count] of [
    [A, 4],
    [B, 4],
    [D, 2],
  ]) {
    w.world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
  mock.timers.setTime(new Date("2026-11-18T09:00:00Z").getTime());
});

// ---------------------------------------------------------------------------
// 1. The three answers
// ---------------------------------------------------------------------------

describe("1. belongsTo, dueWith and copyGroupOf for a visitor with no record of a move", () => {
  async function answers() {
    const states = await readers.loadRunWeekStates(w.world.db, { run: run(), liveGroups: [A, B, D].map(groupOf), now: new Date() });
    const name = (id) => (id === B ? "B" : id === D ? "D" : id === A ? "A" : id);
    const out = {};
    for (const [groupId, n] of [
      [B, 4],
      [D, 4],
      [D, 3],
      [A, 2],
    ]) {
      out[`${name(groupId)} ${n}`] = [states.belongsTo("chloe", groupId, n), states.dueWith("chloe", groupId, n), name(states.copyGroupOf("chloe", n, groupId))];
    }
    return out;
  }

  test("with no visit: true for every group and the caller's own copy, as before", async () => {
    assert.deepEqual(await answers(), {
      "B 4": [true, true, "B"],
      "D 4": [true, true, "D"],
      "D 3": [true, true, "D"],
      "A 2": [true, true, "A"],
    });
  });

  test("with a visit to Group D for week 4: a member of Group B every week, due at Group D's session in week 4, on Group B's copy every week", async () => {
    visitD();
    assert.deepEqual(await answers(), {
      "B 4": [true, false, "B"],
      "D 4": [false, true, "B"],
      "D 3": [false, false, "B"],
      "A 2": [false, false, "B"],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. "Week N is open": the earlier weeks not done
// ---------------------------------------------------------------------------

describe("2. the earlier weeks a visitor has not done are judged on their own copy", () => {
  test("Chloe finished week 3 on Group B's copy: Group D's week 4 email names no week of hers; Freya's week 3 still named", async () => {
    finishOnRunCopy("chloe", 3);
    const before = await earlier.earlierWeeksNotDone(w.world.db, { run: run(), group: groupOf(B), weekNumber: 4, uids: ["chloe"], now: new Date() });
    assert.deepEqual([...before], [["chloe", []]], "with no visit, Group B's week 4 email names nothing");
    visitD();
    const after = await earlier.earlierWeeksNotDone(w.world.db, { run: run(), group: groupOf(D), weekNumber: 4, uids: ["chloe", "freya"], now: new Date() });
    assert.deepEqual([...after], [
      ["chloe", []],
      ["freya", [3]],
    ]);
  });

  test("Chloe has not finished week 3: named, on her own copy", async () => {
    visitD();
    const after = await earlier.earlierWeeksNotDone(w.world.db, { run: run(), group: groupOf(D), weekNumber: 4, uids: ["chloe"], now: new Date() });
    assert.deepEqual([...after], [["chloe", [3]]]);
  });
});

// ---------------------------------------------------------------------------
// 3. The host's This week's work
// ---------------------------------------------------------------------------

describe("3. the host's This week's work judges a visitor's row on the visitor's own copy", () => {
  /** One week-4 card: Group D's with Chloe visiting, or Group B's with Chloe as a member. */
  async function card(groupId) {
    const people =
      groupId === D
        ? [
            { uid: "freya", name: "Freya Thompson", firstName: "Freya", told: true },
            { uid: "yasmin", name: "Yasmin Farouk", firstName: "Yasmin", told: true },
          ]
        : [{ uid: "chloe", name: "Chloe Martin", firstName: "Chloe", told: true }];
    const worked = await groupWeek.readGroupWeekWork(w.world.db, {
      run: run(),
      group: groupOf(groupId),
      weekNumber: 4,
      uids: [...people.map((person) => person.uid), ...(groupId === D ? ["chloe"] : [])],
      now: new Date(),
    });
    const view = groupWeek.groupWeekWorkView(worked, {
      viewerUid: groupId === D ? "grace" : "rahul",
      people,
      visitors: groupId === D ? [{ uid: "chloe", name: "Chloe Martin", firstName: "Chloe" }] : [],
      readsOwnWork: false,
      ownPeople: [],
      leadFirstName: null,
      now: new Date(),
    });
    return { row: view.rows.find((each) => each.uid === "chloe"), worked };
  }

  test("Chloe finished week 4 on Group B's copy, which Group D's asks one reflection more than: her row on Group D's card reads as it does on Group B's", async () => {
    visitD();
    finishOnRunCopy("chloe", 4);
    const host = await card(D);
    const own = await card(B);
    assert.equal(host.row.visiting, true);
    assert.equal(host.row.remindable, false);
    assert.deepEqual({ week: host.row.week, pieces: host.row.pieces }, { week: own.row.week, pieces: own.row.pieces });
    assert.equal(groupWeek.isWeekDone(host.worked.read, "chloe"), true);
    assert.equal(groupWeek.isWeekDone(own.worked.read, "chloe"), true);
    // Freya, a member of Group D who wrote nothing, is judged on Group D's copy as ever.
    assert.equal(groupWeek.isWeekDone(host.worked.read, "freya"), false);
  });

  test("with no visit: nobody read on another copy", async () => {
    finishOnRunCopy("chloe", 4);
    const worked = await groupWeek.readGroupWeekWork(w.world.db, { run: run(), group: groupOf(D), weekNumber: 4, uids: ["freya", "yasmin", "chloe"], now: new Date() });
    assert.equal(worked.read.copies.size, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. The facilitator's detailed This week's work
// ---------------------------------------------------------------------------

describe("4. the facilitator's detailed This week's work lists a visitor for the visit's week, on their own copy, counted nowhere", () => {

  async function groupDWeek() {
    // Group D's week 3 register finished, so the group's page is on week 4, as its detailed week is.
    w.world.db.poke(registerPath(D, 3), { pushedAt: new Date("2026-11-16T20:30:00Z") });
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const group = groupOf(D);
    const model = await loadFacilitatorGroup(w.world.db, run, group, { isAdmin: true, actor: w.sessionFor("zach") }, new Date());
    return loadGroupWeek(w.world.db, { run, group, model, viewer: "admin", now: new Date() });
  }

  test("Chloe visiting Group D in week 4, every reflection written on Group B's copy: her row, visiting, all written; Group D's numbers count Freya and Yasmin only", async () => {
    visitD();
    finishOnRunCopy("chloe", 4);
    const week = await groupDWeek();
    assert.equal(week.weekNumber, 4);
    const row = week.rows.find((each) => each.uid === "chloe");
    assert.equal(row.visiting, true);
    assert.deepEqual(row.written, week.parts.map(() => true), "judged on her own copy, which lacks Group D's extra prompt");
    assert.equal(week.of, 2);
    assert.ok(week.counts.every((count) => count.of === 2 && count.written === 0));
    assert.ok(week.sources.every((source) => source.ticked.every((person) => person.uid !== "chloe")), "no ticks of hers");
  });

  test("with no visit: nobody from another group", async () => {
    finishOnRunCopy("chloe", 4);
    const week = await groupDWeek();
    assert.equal(week.rows.some((each) => each.uid === "chloe" || each.visiting), false);
  });
});

// ---------------------------------------------------------------------------
// 5. The copy the person reads on their own pages
// ---------------------------------------------------------------------------

describe("5. on her own pages she reads her own group's copy of the visit's week, never the host's", () => {

  test("Group D has its own copy of week 4: her overview names no fork of week 4, with a visit or without", async () => {
    const forks = async () => {
      const answer = await w.call("chloe", overviewRoute.GET, { runId: RUN.agi }, { course: true });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      return { ids: answer.body.forkedWeekIds, groups: answer.body.forkedWeekGroups ?? null };
    };
    const before = await forks();
    visitD();
    assert.deepEqual(await forks(), before);
    assert.equal(before.ids.includes("w04"), false);
  });
});
