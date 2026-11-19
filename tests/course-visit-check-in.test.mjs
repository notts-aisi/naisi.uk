/**
 * A ONE-WEEK VISIT AND THE CHECK-IN AT THE END OF A SESSION: the visitor
 * takes the host's check-in, as anybody the host's register marks there, and
 * is never in their own group's check-in for that week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is one course run in its second week (`tests/lib/registerWorld.mjs`):
 * Group A (Ana; Amelia facilitates) meets on Mondays at 6pm, Group B
 * (Amara, Chloe, Farah; Rahul and Sofia) on Tuesdays at 6pm. Chloe visits
 * Group A for week 2: Mon 26 Oct.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeWorld, seedWorld } from "./lib/registerWorld.mjs";

/** Monday 26 October 2026, 7:50pm GMT: the last ten minutes of Group A's week 2 session. */
const DURING_A = new Date("2026-10-26T19:50:00Z");
/** Tuesday 27 October 2026, 7:50pm GMT: the last ten minutes of Group B's. */
const DURING_B = new Date("2026-10-27T19:50:00Z");
mock.timers.enable({ apis: ["Date"], now: DURING_A });
const at = (instant) => mock.timers.setTime(instant.getTime());

const made = makeWorld("__visitCheckIn");
const { world, reset, call, courseRoute, lib } = made;
const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const register = await courseRoute("groups", "[groupId]", "attendance");
const { checkInSurveyId } = await lib("surveys", "checkIns", "ids.ts");

const read = (path) => world.db.read(path);
const rowsOf = (groupId) =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`surveyPeople/${checkInSurveyId(RUN, groupId, "w02")}__`))
    .map((path) => path.split("__").pop())
    .sort();
async function mark(who, groupId, marks) {
  const response = await call(who, register.POST, { groupId }, { body: { weekNumber: 2, marks: Object.entries(marks).map(([uid, status]) => ({ uid, status })) } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}
const open = (who, groupId, people) => call(who, checkIn.POST, { groupId }, { body: { session: "w02", people } });

beforeEach(() => {
  at(DURING_A);
  reset(seedWorld());
  world.db.poke(`courseEnrolments/${RUN}__chloe`, { visits: [{ weekNumber: 2, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: new Date("2026-10-20T09:00:00Z") }] });
});

describe("the check-in of a session somebody is visiting", () => {
  test("Group A's register marks Chloe there: Amelia's check-in counts her and emails her her own link", async () => {
    await mark("amelia", GROUP.a, { ana: "present", chloe: "late" });
    const opened = await open("amelia", GROUP.a, 2);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.deepEqual(opened.body, { ok: true, people: 2, emailed: 2, failed: 0, noAddress: 0 });
    assert.deepEqual(rowsOf(GROUP.a), ["ana", "chloe"]);
    assert.deepEqual(world.mail.map((message) => message.to.split("@")[0]).sort(), ["ana", "chloe"]);
  });

  test("Group B's check-in for week 2 is never hers: her own group's register has no line to mark", async () => {
    at(DURING_B);
    const refused = await call("rahul", register.POST, { groupId: GROUP.b }, { body: { weekNumber: 2, marks: [{ uid: "chloe", status: "present" }] } });
    assert.equal(refused.status, 400);
    await mark("rahul", GROUP.b, { amara: "present", farah: "present" });
    const opened = await open("rahul", GROUP.b, 2);
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.deepEqual(rowsOf(GROUP.b), ["amara", "farah"]);
    assert.ok(!world.mail.some((message) => message.to.startsWith("chloe")));
    assert.equal(read(`surveyPeople/${checkInSurveyId(RUN, GROUP.b, "w02")}__chloe`), undefined);
  });
});
