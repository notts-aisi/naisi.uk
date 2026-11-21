/**
 * SOMEBODY REMOVED FROM THE RUN IS LISTED AS HAVING LEFT ONLY IN A GROUP OF
 * THEIR OWN. A host's register marks a visitor like anybody else, so the
 * group a removed person is listed under (`listGroups`, which the lead's
 * grid, the Overview's leaver cards and each group's register read) is the
 * last of the groups that were theirs whose register marked them, never the
 * host of a one-week visit. Remove keeps each visit's week and host beside
 * the removal (`visitsWhenRemoved`) for exactly that.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Chloe is in Group B (Rahul and Sofia), marked at its weeks 1 and 2; Group C
 * (Tom) meets on Wednesdays at 1pm; Omar, whom staff took off before this
 * suite, was marked at Group B's week 1 and has no visit.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__removedVisitorRegister");
const { world, call, routes } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

/** A visit arranged the way the person's page arranges one: the preview's count sent back. */
async function arrange(uid, weekNumber, hostGroupId) {
  const visit = (body) => call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
  const shown = await visit({ weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit({ weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

/** Remove, as the board presses it: the preview's count sent back. */
async function remove(uid) {
  const shown = await call("zach", removeRoute.POST, { runId: RUN.agi, uid }, { body: { preview: true }, course: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const removed = await call("zach", removeRoute.POST, { runId: RUN.agi, uid }, { body: { emails: shown.body.preview.emails }, course: true });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
}

/** Who a group's register lists as having left, as `who` reads it. */
async function leaversOf(who, groupId) {
  const answer = await call(who, routes.register.GET, { groupId }, { course: true });
  assert.equal(answer.status, 200, `${who} on ${groupId}: ${JSON.stringify(answer.body)}`);
  return Object.fromEntries((answer.body.leavers ?? []).map((leaver) => [leaver.uid, leaver]));
}

/** Which group the lead's grid lists each person under. */
async function gridGroups() {
  const records = await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  const listed = w.lib.attendance.listGroups(records, { isAdmin: true }, new Date(), w.lib.attendance.weeksOf(records));
  const out = {};
  for (const entry of listed) for (const { row } of entry.people) out[row.uid] = entry.group.id;
  return out;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
});

describe("a visitor marked on the host's register, then removed from the run", () => {
  test("the host's register does not list them, their own group's does, and nobody who never visited changes", async () => {
    // Chloe goes to Group C's week 3 session tomorrow, and Group C's register marks her there.
    await arrange("chloe", 3, C);
    at("2026-11-18T15:00:00Z");
    world.db.seed(registerPath(C, 3), { ...read(registerPath(C, 2)), weekNumber: 3, records: { hamza: "present", chloe: "present" } });
    const omarBefore = (await leaversOf("rahul", B)).omar;
    assert.ok(omarBefore, "Omar is Group B's leaver before anything here");

    await remove("chloe");
    // Remove keeps the visit's week and host beside the removal, and deletes the list as before.
    const stored = read(seatPath("chloe"));
    assert.equal(stored.visits, undefined);
    assert.deepEqual(stored.visitsWhenRemoved, [{ weekNumber: 3, groupId: C }]);
    assert.deepEqual(enrolments.normalizeCourseEnrolment(`${RUN.agi}__chloe`, stored).visitsWhenRemoved, [{ weekNumber: 3, groupId: C }]);

    // Group C's register: not Chloe, with no day she left.
    const host = await leaversOf("tom", C);
    assert.equal(host.chloe, undefined, JSON.stringify(host));
    // Group B's register: Chloe, with the day she left and her marks there.
    const own = await leaversOf("rahul", B);
    assert.ok(own.chloe, JSON.stringify(own));
    assert.match(own.chloe.left, /^Left /);
    assert.deepEqual(own.chloe.records, { w01: "present", w02: "present" });
    // Omar, who never visited, is listed as he was.
    assert.deepEqual(own.omar, omarBefore);
    // The lead's grid lists her under her own group too.
    const grid = await gridGroups();
    assert.equal(grid.chloe, B);
    assert.equal(grid.omar, B);
  });

  test("a place removed before the visits were kept reads as it always has, by the last register that marked it", async () => {
    // A removal written before Remove kept the visits: no record of them, so the latest mark decides.
    world.db.seed(registerPath(C, 3), { ...read(registerPath(C, 2)), weekNumber: 3, records: { hamza: "present", chloe: "present" } });
    world.db.poke(seatPath("chloe"), { status: "removed", groupId: null, droppedOutAt: new Date("2026-11-18T16:00:00Z") });
    at("2026-11-18T17:00:00Z");
    assert.equal((await gridGroups()).chloe, C);
  });

  test("a stored list that is not whole reads as none", () => {
    const base = { runId: RUN.agi, uid: "chloe", status: "removed", role: "learner", groupId: null };
    const read = (value) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__chloe`, { ...base, visitsWhenRemoved: value }).visitsWhenRemoved;
    assert.equal(read([{ weekNumber: 3 }]), undefined);
    assert.equal(read([{ weekNumber: 0, groupId: C }]), undefined);
    assert.equal(read([{ weekNumber: 3, groupId: C }, "x"]), undefined);
    assert.equal(read("w03"), undefined);
    assert.deepEqual(read([{ weekNumber: 5, groupId: C }, { weekNumber: 2, groupId: D }]), [{ weekNumber: 2, groupId: D }, { weekNumber: 5, groupId: C }]);
  });
});
