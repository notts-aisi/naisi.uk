/**
 * A ONE-WEEK VISIT, WHAT THE HOST'S FACILITATOR READS, OVER THE ROUTES: the
 * fill-in boxes route over HTTP and a first read actually recorded, for the
 * visit's week alone, and nothing for any other week or once the visit is off.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run with block weeks
 * (`tests/lib/facilitatorWeekWorld.mjs`): the clock is Tue 17 Nov 2026 at
 * noon. Chloe is in Group B (Rahul and Sofia); Grace facilitates Group D.
 * Chloe has written her week 3 reflections, a box of week 3's plan and a box
 * of week 2's. Her visit to Group D for week 3 is written onto her place as
 * the visit's save writes it.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NOW, RUN, facilitatorWeekSeed, makeFacilitatorWeekWorld } from "./lib/facilitatorWeekWorld.mjs";
import { D } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__visitHostReads");
const boxesRead = await w.courseRoute("runs", "[runId]", "fill-in-boxes");
const firstRead = await w.courseRoute("runs", "[runId]", "first-read");
const read = (path) => w.world.db.read(path);
const seatPath = `courseEnrolments/${RUN.agi}__chloe`;
const WORK = `courseWeekWork/${RUN.agi}__chloe__w03`;
const WORK_TWO = `courseWeekWork/${RUN.agi}__chloe__w02`;

/** One fill-in box as the box's route stores it. */
const box = (weekNumber, boxId, text) => ({
  runId: RUN.agi,
  uid: "chloe",
  weekId: `w0${weekNumber}`,
  weekNumber,
  exerciseId: boxId,
  kind: "fillIn",
  text,
  updatedAt: new Date("2026-11-16T09:00:00Z"),
});

/** The boxes route over HTTP: a real request, its address carrying whose boxes and which week. */
async function boxesOf(who, week) {
  w.world.user = w.sessionFor(who);
  w.world.course = true;
  try {
    const response = await boxesRead.GET(new Request(`https://naisi.invalid/api/courses/runs/${RUN.agi}/fill-in-boxes?uid=chloe&week=${week}`), {
      params: Promise.resolve({ runId: RUN.agi }),
    });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.course = false;
  }
}
const markRead = (who, weekId, ids) => w.call(who, firstRead.POST, { runId: RUN.agi }, { body: { weekId, people: [{ uid: "chloe", ids }] }, course: true });
const visitD = () => w.world.db.poke(seatPath, { visits: [{ weekNumber: 3, groupId: D, arrangedByUid: "zach", arrangedAt: NOW }] });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset(
    facilitatorWeekSeed({
      [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-fb1`]: box(3, "k3-fb1", "Visit the lamp at Souter."),
      [`courseExerciseResponses/${RUN.agi}__chloe__w02__k2-fb1`]: box(2, "k2-fb1", "Read the second chapter again."),
    }),
  );
});

describe("the host's facilitator reads the visit's week over the routes, and nothing else", () => {
  test("with no visit: Grace is refused her boxes and marks no first read, as before", async () => {
    assert.equal((await boxesOf("grace", 3)).status, 403);
    await markRead("grace", "w03", ["k3-rp1"]);
    assert.equal(read(WORK), undefined);
  });

  test("visiting Group D for week 3: Grace reads her week 3 boxes over HTTP, and is refused week 2's", async () => {
    visitD();
    const three = await boxesOf("grace", 3);
    assert.equal(three.status, 200, JSON.stringify(three.body));
    assert.deepEqual(three.body.boxes.map((each) => [each.boxId, each.weekId, each.text]), [["k3-fb1", "w03", "Visit the lamp at Souter."]]);
    assert.equal((await boxesOf("grace", 2)).status, 403);
  });

  test("Grace opening her week 3 records a first read, the day and never who, and locks nothing; week 2 records none", async () => {
    visitD();
    const marked = await markRead("grace", "w03", ["k3-rp1", "k3-rp2"]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const work = read(WORK);
    assert.ok(work?.firstReadAt?.["k3-rp1"] instanceof Date, JSON.stringify(work));
    assert.ok(work.firstReadAt["k3-rp2"] instanceof Date);
    assert.ok(!JSON.stringify(work).includes("grace"), "nothing says who read it");
    for (const key of Object.keys(work)) assert.ok(!/lock|closed|reopen/i.test(key), `nothing locked: ${key}`);
    await markRead("grace", "w02", ["k2-rp1"]);
    assert.equal(read(WORK_TWO), undefined);
  });

  test("once the visit is off: refused again, and no first read is recorded", async () => {
    visitD();
    w.world.db.poke(seatPath, { visits: [] });
    assert.equal((await boxesOf("grace", 3)).status, 403);
    await markRead("grace", "w03", ["k3-rp1"]);
    assert.equal(read(WORK), undefined);
  });

  test("her own group's facilitator reads as before, visit or none", async () => {
    visitD();
    const rahul = await boxesOf("sofia", 3);
    assert.equal(rahul.status, 200, JSON.stringify(rahul.body));
    assert.equal(rahul.body.boxes.length, 1);
  });
});
