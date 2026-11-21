/**
 * A REGISTER OPENED FOR ONE GIVEN SESSION HOLDS THAT WEEK'S ROWS AND NOTHING
 * ABOUT OTHER WEEKS. Somebody given one session of a group
 * (`GET /api/courses/groups/[groupId]/attendance`, standing "given") gets that
 * session's column, the rows that column draws, and of every per-week field
 * that week's alone (`rowsOfWeeks`): nobody who is a row of another week
 * only, and no visit to or from another group in another week. A facilitator
 * of the group and an admin are sent the group's rows whole, as before.
 *
 * The world is the lead's world (`tests/lib/leadWorld.mjs`) in week 1:
 * Amara and Dev placed in Group B (Rahul and Sofia), Bea in Group A, Tariq in
 * Group C (Tom), all told; the clock in Group B's week 1 session. Claudia,
 * the programme's lead, gives that session to Tom, who takes its register.
 * Then:
 *  - AMARA goes to Group A's session in week 2 (away in week 2);
 *  - BEA moves from Group A to Group B from week 3 (a mover);
 *  - TARIQ comes to Group B's session in week 2 from Group C (a visitor);
 *  - DEV is marked at week 1, by Tom, then leaves (a leaver).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, B, C, RUN, leadSeed } from "./lib/leadWorld.mjs";

const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { static documentId() { return '__name__'; } }",
);
const made = makeWorld("__registerGivenWeek", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, courseRoute, loadTs } = made;
const join_ = await loadJoin(made);
const register = await courseRoute("groups", "[groupId]", "attendance");
const cover = await courseRoute("groups", "[groupId]", "attendance", "cover");
const registerAccess = await loadTs("lib/courses/registerAccess.ts");

const PLACED_ON = new Date("2026-10-27T17:38:00Z");
/** During Group B's week 1 session: Tue 3 Nov, 6pm to 8pm in London (GMT). */
const DURING = new Date("2026-11-03T18:12:00Z");
mock.timers.enable({ apis: ["Date"], now: PLACED_ON });
const at = (when) => mock.timers.setTime(new Date(when).getTime());
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const read = (who) => call(who, register.GET, { groupId: B }, { course: true });

beforeEach(async () => {
  at(PLACED_ON);
  reset(leadSeed(), { now: () => new Date() });
  assert.equal((await join_.press()).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal((await join_.publish("zach")).status, 200);
  at(DURING);
  // The lead gives Group B's week 1 session to Tom, who marks Dev there; then Dev leaves.
  const given = await call("claudia", cover.POST, { groupId: B }, { body: { weekNumber: 1, person: "tom" }, course: true });
  assert.equal(given.status, 200, JSON.stringify(given.body));
  const marked = await call("tom", register.POST, { groupId: B }, { body: { weekNumber: 1, marks: [{ uid: "dev", status: "present" }] }, course: true });
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
  world.db.poke(seatPath("dev"), { status: "withdrawn", droppedOutAt: DURING });
  // Amara away in week 2; Bea moved in from week 3; Tariq visiting in week 2.
  world.db.poke(seatPath("amara"), { visits: [{ weekNumber: 2, groupId: A, arrangedByUid: "zach", arrangedAt: PLACED_ON }] });
  world.db.poke(seatPath("bea"), { groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }] });
  world.db.poke(seatPath("tariq"), { visits: [{ weekNumber: 2, groupId: B, arrangedByUid: "zach", arrangedAt: PLACED_ON }] });
  world.mail.length = 0;
});

describe("a register read for one given session", () => {
  test("somebody given week 1 is sent week 1's rows, and nothing of week 2 or 3", async () => {
    const answer = await read("tom");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.caller.standing, "given");
    assert.deepEqual(answer.body.sessions.map((each) => each.sessionKey), ["w01"]);
    // Amara alone: Bea is a row from week 3, Tariq of week 2, Dev has left.
    assert.deepEqual(answer.body.members.map((row) => row.uid), ["amara"]);
    const [amara] = answer.body.members;
    assert.deepEqual(amara.inGroupWeeks, [{ fromWeek: 1, untilWeek: 2 }]);
    assert.equal(amara.joinedWeekNumber, 1);
    assert.equal("awayAt" in amara, false, "the row says where she is in week 2");
    assert.deepEqual(answer.body.leavers, []);
    const said = JSON.stringify(answer.body.members);
    assert.doesNotMatch(said, /Group A|Group C|bea|tariq|"fromWeek":3|"weekNumber":2/, said);
    // The marks are the rows' only.
    assert.deepEqual(Object.keys(answer.body.records.w01 ?? {}), []);
  });

  test("a facilitator and an admin are sent the group's rows whole, as the roster reads them", async () => {
    for (const who of ["rahul", "zach"]) {
      const answer = await read(who);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      const roster = await registerAccess.loadRegisterMembers(world.courseDb, RUN.agi, B, { isAdmin: who === "zach", role: made.sessionOf(who).role });
      assert.deepEqual(answer.body.members, roster.members, who);
      const byUid = Object.fromEntries(answer.body.members.map((row) => [row.uid, row]));
      assert.deepEqual(Object.keys(byUid).sort(), ["amara", "bea", "tariq"], who);
      assert.deepEqual(byUid.amara.awayAt, [{ weekNumber: 2, groupName: "Group A" }], who);
      assert.deepEqual(byUid.tariq.visitingFrom, [{ weekNumber: 2, groupName: "Group C" }], who);
      assert.equal(byUid.bea.joinedWeekNumber, 3, who);
      assert.deepEqual(answer.body.leavers.map((leaver) => leaver.uid), ["dev"], who);
    }
  });
});

describe("rowsOfWeeks", () => {
  const rows = [
    { uid: "a", displayName: "A", joinedWeekNumber: 1 },
    { uid: "b", displayName: "B", joinedWeekNumber: 3, inGroupWeeks: [{ fromWeek: 3, untilWeek: null }] },
    { uid: "c", displayName: "C", joinedWeekNumber: 2, inGroupWeeks: [{ fromWeek: 2, untilWeek: 3 }], visitingFrom: [{ weekNumber: 2, groupName: "Group C" }] },
    { uid: "d", displayName: "D", joinedWeekNumber: 1, inGroupWeeks: [{ fromWeek: 1, untilWeek: 2 }, { fromWeek: 3, untilWeek: null }], awayAt: [{ weekNumber: 2, groupName: "Group A" }] },
    { uid: "e", displayName: "E", joinedWeekNumber: 4 },
  ];

  test("each week's column draws its rows and its visits alone", () => {
    assert.deepEqual(registerAccess.rowsOfWeeks(rows, [1]), [
      { uid: "a", displayName: "A", joinedWeekNumber: 1 },
      { uid: "d", displayName: "D", joinedWeekNumber: 1, inGroupWeeks: [{ fromWeek: 1, untilWeek: 2 }] },
    ]);
    assert.deepEqual(registerAccess.rowsOfWeeks(rows, [2]), [
      { uid: "a", displayName: "A", joinedWeekNumber: 2 },
      { uid: "c", displayName: "C", joinedWeekNumber: 2, inGroupWeeks: [{ fromWeek: 2, untilWeek: 3 }], visitingFrom: [{ weekNumber: 2, groupName: "Group C" }] },
      // Away that week: drawn as the whole register draws the column, "At Group A this week", and never a row to mark.
      { uid: "d", displayName: "D", joinedWeekNumber: 2, inGroupWeeks: [], awayAt: [{ weekNumber: 2, groupName: "Group A" }] },
    ]);
    for (const row of registerAccess.rowsOfWeeks(rows, [2])) {
      assert.equal(registerAccess.isRowForWeek(row, 2), row.uid !== "d", row.uid);
    }
    assert.deepEqual(registerAccess.rowsOfWeeks(rows, [4]).map((row) => row.uid), ["a", "b", "d", "e"]);
  });
});
