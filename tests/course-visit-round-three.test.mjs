/**
 * A ONE-WEEK VISIT, WHAT A THIRD READING FOUND: a request to be excused is
 * about one group's session, matched by group and key; no visit over a week
 * the person is already excused from; the card and the person's own cancel
 * agree on a host session marked as not held; staff can call off a visit to a
 * session that is not happening until the person's own group's session that
 * week starts; the limits on staff's presses are per run and claimed inside
 * the save; two readers with one first name are both named; and every
 * deadline and line the other way round, the person's own group meeting
 * earlier in the week than the host.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Week 4 is Group A's Thu 19 Nov at
 * 6pm (Sofia), Group D's Mon 23 Nov at 6pm (Grace), Group B's Tue 24 Nov at
 * 6pm (Rahul and Sofia) and Group C's Wed 25 Nov at 1pm (Tom). Chloe is in
 * Group B: Group A meets before her own group that week, Group C after it.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";
import { account } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRoundThree");
const { world, call, routes } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const approveRoute = await w.courseRoute("requests", "[requestId]", "excused", "approve");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { excusedFor } = await w.loadTs(join("lib", "courses", "excused", "own.ts"));
const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
const { loadRegisterMembers } = await w.loadTs(join("lib", "courses", "registerAccess.ts"));
const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const runOf = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));

const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
/** A press made the way the page makes one: the preview's count and full flag sent back. */
async function arrange(uid, weekNumber, hostGroupId) {
  const shown = await visit("zach", uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}
const facts = async () => {
  const answer = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, "chloe", "ahead", new Date());
  assert.equal(answer.ok, true, JSON.stringify(answer));
  return answer.facts;
};
const standingOf = async (weekNumber) => standingVisits(await facts(), "zach", new Date()).find((each) => each.weekNumber === weekNumber);
/** Staff call the visit off the way the page does: the count its button showed sent back. */
async function staffCallOff(weekNumber) {
  const standing = await standingOf(weekNumber);
  return visit("zach", "chloe", { weekNumber, callOff: true, emailCount: standing?.emails ?? 0 });
}
const cancel = (weekNumber) => call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber }, course: true });
const overview = async () => (await call("chloe", routes.overview.GET, { runId: RUN.agi }, { course: true })).body;
const ask = (groupId, sessionKeys = ["w04"]) =>
  call("chloe", askRoute.POST, { groupId }, { body: { sessionKeys, reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true }, course: true });
const requestIds = () => world.db.paths().filter((path) => path.startsWith("courseRequests/")).map((path) => path.split("/")[1]);
/** Her own excused view's week 4: each session's group, what it says about a request, and whether asking is open. */
async function weekFour() {
  const groups = [A, B, C, D].map(groupOf);
  const own = await excusedFor(world.courseDb, { user: w.sessionOf("chloe"), run: runOf(), enrolment: seat("chloe"), groups, now: new Date() });
  return own.sessions.filter((each) => each.weekNumber === 4).map((each) => ({ excuse: each.excuse?.kind ?? null, open: each.ask.open, visit: each.visit?.groupId ?? null }));
}
const callOffSession = async (who, groupId, dateKey) => {
  const answer = await call(who, changeRoute.POST, { groupId }, { body: { week: 4, dateKey, kind: "cancel", reason: "Away that week.", tell: false }, course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
};
const notHeld = (groupId, pushedAt) =>
  world.db.seed(registerPath(groupId, 4), { runId: RUN.agi, groupId, weekNumber: 4, occurrence: 1, records: {}, held: false, pushedAt, pushedByUid: "zach" });
const rowsOf = async (groupId, forWeek) => (await loadRegisterMembers(world.courseDb, RUN.agi, groupId, { isAdmin: true }, forWeek)).members;

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

// ---------------------------------------------------------------------------
// 1. A request to be excused is about one group's session
// ---------------------------------------------------------------------------

describe("1. a request about the host's session, once the visit is off, says nothing about her own group's", () => {
  async function askAboutTheHostThenEnd(end) {
    await arrange("chloe", 4, A);
    assert.equal((await ask(A)).status, 200);
    const [requestId] = requestIds();
    assert.equal(read(`courseRequests/${requestId}`).groupId, A);
    assert.equal((await end()).status, 200);
    assert.equal(seat("chloe").visits, undefined);
    return requestId;
  }

  for (const [who, end] of [
    ["staff call the visit off", () => staffCallOff(4)],
    ["she cancels it herself", () => cancel(4)],
  ]) {
    test(`${who}: her own week 4 shows nothing waiting and can be asked about; another visit can be arranged; the request is left for the admins to close`, async () => {
      const requestId = await askAboutTheHostThenEnd(end);
      assert.deepEqual(await weekFour(), [{ excuse: null, open: true, visit: null }]);
      // Another visit for that week is not held up by a request about a session she is no longer due at.
      const again = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: D, preview: true });
      assert.equal(again.status, 200, JSON.stringify(again.body));
      // The request stays where the admins' Requests page finds it, closed there with the existing sentence.
      assert.equal(read(`courseRequests/${requestId}`).status, "waiting");
      const approve = await call("zach", approveRoute.POST, { requestId }, { body: { sessionKey: "w04" }, course: true });
      assert.equal(approve.status, 409);
      assert.match(approve.body.error, /Decline it, with a reply, to close it\.$/);
      // Asking about her own group's week 4 goes through.
      assert.equal((await ask(B)).status, 200);
      assert.equal(requestIds().length, 2);
    });
  }

  test("with no visit, a request about her own week 4 waits on it, as before", async () => {
    assert.equal((await ask(B)).status, 200);
    assert.deepEqual(await weekFour(), [{ excuse: "waiting", open: false, visit: null }]);
  });
});

// ---------------------------------------------------------------------------
// 2. A host session marked as not held before it starts: no card, no Cancel
// ---------------------------------------------------------------------------

describe("2. the card and her own cancel agree on a host session marked as not held", () => {
  test("marked not held before it starts: no card, and her cancel is the one 404, exactly as for one called off", async () => {
    await arrange("chloe", 4, A);
    assert.equal((await overview()).visits.length, 1);
    notHeld(A, new Date());
    assert.equal((await overview()).visits, undefined);
    const own = await cancel(4);
    assert.deepEqual([own.status, own.body.kind], [404, "no-visit"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Staff and a visit to a session that is not happening
// ---------------------------------------------------------------------------

describe("3. staff call off a visit to a session that is not happening, until her own group's session starts", () => {
  const STAYS = "Group B’s week 4 session has started, so calling this visit off would count Chloe absent from a session Chloe was told not to go to. The visit stays, and week 4 isn’t counted for Chloe.";
  const AFTER_A = "2026-11-20T12:00:00Z";
  const AFTER_BOTH = "2026-11-26T12:00:00Z";

  for (const [kind, makeIt] of [
    ["called off", () => callOffSession("sofia", A, "2026-11-19")],
    ["marked not held after it", () => notHeld(A, new Date("2026-11-19T20:00:00Z"))],
    ["archived", () => world.db.poke(`courseGroups/${A}`, { archived: true })],
  ]) {
    test(`Group A's session ${kind}: after Group A's start and before her own, staff can still call it off, and she is back on Group B's register`, async () => {
      await arrange("chloe", 4, A);
      at(AFTER_A);
      await makeIt();
      const standing = await standingOf(4);
      assert.equal(standing.gone, "Group A’s session that week is no longer happening.");
      assert.deepEqual([standing.open, standing.stays], [true, null]);
      const called = await staffCallOff(4);
      assert.equal(called.status, 200, JSON.stringify(called.body));
      assert.equal(seat("chloe").visits, undefined);
      const home = (await rowsOf(B, 4)).find((row) => row.uid === "chloe");
      assert.ok(home, "on her own group's register for week 4");
      assert.deepEqual(home.awayAt ?? [], []);
    });

    test(`Group A's session ${kind}: once her own group's session has started, refused in a true sentence, and the visit stays`, async () => {
      await arrange("chloe", 4, A);
      at(AFTER_BOTH);
      await makeIt();
      const standing = await standingOf(4);
      assert.deepEqual([standing.open, standing.stays], [false, STAYS]);
      const called = await staffCallOff(4);
      assert.deepEqual([called.status, called.body.error], [409, STAYS]);
      assert.equal(seat("chloe").visits.length, 1);
      // What the sentence says: week 4 is not counted for her, on the Attendance tab or her figures.
      const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi), { isAdmin: true }, new Date());
      const cell = tab.groups.find((group) => group.id === B).people.find((person) => person.uid === "chloe").cells.find((each) => each.weekNumber === 4);
      assert.notEqual(cell?.state, "mark");
    });
  }

  test("Group A's session happening: after it starts staff are refused as before, truthfully", async () => {
    await arrange("chloe", 4, A);
    at(AFTER_A);
    const called = await staffCallOff(4);
    assert.deepEqual([called.status, called.body.error], [409, "The visit can no longer be cancelled: Group A’s session has started."]);
  });
});

// ---------------------------------------------------------------------------
// 4. The limits on staff's presses: per run, claimed inside the save
// ---------------------------------------------------------------------------

describe("4. the limits on staff's presses are per run and person, and claimed inside the save", () => {
  const full = (key, count) => world.db.seed(`courseNudges/emailrate__${key}`, { kind: "staff-email-throttle", key, windowStartAt: new Date(), count, updatedAt: new Date() });

  test("a full count for her on another run holds up nothing here", async () => {
    full(`visitperson__${RUN.other}__chloe`, 10);
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.equal(shown.body.preview.limit, null);
    await arrange("chloe", 4, A);
    assert.equal(read(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`).count, 1);
  });

  test("a press answered 409 because the count changed claims nothing", async () => {
    const pressed = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: 99, overLimit: false });
    assert.equal(pressed.status, 409);
    assert.equal(read(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`), undefined);
    assert.equal(read("courseNudges/emailrate__visitpresser__zach"), undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. Two readers with one first name are both named
// ---------------------------------------------------------------------------

describe("5. a host reader who shares a first name with one of her own group's facilitators", () => {
  test("both are named, each in full, and nobody is dropped from the sentence", async () => {
    world.db.seed("users/rahulk", account("rahulk", "Rahul Khan"));
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "rahulk"] });
    await arrange("chloe", 4, A);
    const readers = (await overview()).visitReaders;
    // Sofia facilitates both groups: named once, as one of Group B's.
    assert.deepEqual(readers, [{ weekNumber: 4, firstNames: ["Rahul"], names: ["Rahul Khan"] }]);
    // The page names Group B's Rahul in full beside him (`BlockWeek`), so the sentence reads:
    const said = weekWords.answerReadersWords({ kind: "facilitators", names: ["Rahul Mehta", "Sofia"], alsoRead: readers[0].names }, null);
    assert.equal(said, "Once you send it, or once your session has started, Rahul Mehta, Sofia, Rahul Khan and admins can read your written answer.");
  });

  test("with no shared first name: first names, as before", async () => {
    await arrange("chloe", 4, C);
    assert.deepEqual((await overview()).visitReaders, [{ weekNumber: 4, firstNames: ["Tom"], names: ["Tom"] }]);
  });
});

// ---------------------------------------------------------------------------
// 6. The other way round: her own group meets before the host that week
// ---------------------------------------------------------------------------

describe("6. Group C meets after her own group in week 4: the deadlines, the card, the registers and the rollup", () => {
  test("the card, her own cancel and staff all go by Group B's Tuesday, the earlier", async () => {
    await arrange("chloe", 4, C);
    const card = (await overview()).visits[0];
    assert.match(card.cancel.until, /^You can cancel until Tue 24 Nov, 6pm\./);
    assert.equal(card.firstName, "Group B");
    at("2026-11-24T18:30:00Z");
    assert.equal((await overview()).visits[0].cancel, null);
    const own = await cancel(4);
    assert.deepEqual([own.status, own.body.error], [409, "The visit can no longer be cancelled: Group B’s session has started."]);
    const standing = await standingOf(4);
    assert.equal(standing.open, false, "staff until the earlier session starts, as the person");
    assert.match(standing.stays, /^Group B’s week 4 session has started, so calling this visit off would count Chloe absent/);
  });

  test("Group C's session called off after Group B's has started: staff are refused in the true sentence", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-24T19:00:00Z");
    await callOffSession("tom", C, "2026-11-25");
    const standing = await standingOf(4);
    assert.equal(standing.open, false);
    assert.match(standing.stays, /^Group B’s week 4 session has started/);
    assert.equal((await staffCallOff(4)).status, 409);
  });

  test("Group C's session called off before Group B's starts: staff call it off, and she is due at Group B's Tuesday", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-23T12:00:00Z");
    await callOffSession("tom", C, "2026-11-25");
    assert.equal((await staffCallOff(4)).status, 200);
    assert.ok((await rowsOf(B, 4)).some((row) => row.uid === "chloe"));
  });

  test("the registers: Group C's lists her as visiting, Group B's shows where she is", async () => {
    await arrange("chloe", 4, C);
    assert.ok((await rowsOf(C, 4)).some((row) => row.uid === "chloe"));
    assert.ok(!(await rowsOf(B, 4)).some((row) => row.uid === "chloe"));
    const home = (await rowsOf(B, null)).find((row) => row.uid === "chloe");
    assert.deepEqual(home.awayAt, [{ weekNumber: 4, groupName: "Group C" }]);
  });

  test("the rollup through both pushes, Group B's first as the week runs, counts her week 4 once, off Group C's register", async () => {
    const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
    await arrange("chloe", 4, C);
    at("2026-11-24T21:00:00Z");
    assert.equal((await call("rahul", routes.register.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid: "farah", status: "present" }] }, course: true })).status, 200);
    assert.equal((await call("rahul", pushRoute.POST, { groupId: B }, { body: { weekNumber: 4 }, course: true })).status, 200);
    at("2026-11-25T16:00:00Z");
    assert.equal((await call("tom", routes.register.POST, { groupId: C }, { body: { weekNumber: 4, marks: [{ uid: "chloe", status: "late" }] }, course: true })).status, 200);
    assert.equal((await call("tom", pushRoute.POST, { groupId: C }, { body: { weekNumber: 4 }, course: true })).status, 200);
    const { sessionsHeld, absent, late } = read(seatPath("chloe")).attendance;
    // Weeks 1 and 2 on Group B's registers (both present), week 3 not finished, week 4 late on Group C's.
    assert.deepEqual({ sessionsHeld, absent, late }, { sessionsHeld: 3, absent: 0, late: 1 });
  });
});

// ---------------------------------------------------------------------------
// 7. Publish with a visit standing
// ---------------------------------------------------------------------------

describe("7. Publish with a visit standing", () => {
  /** A press of Publish as the board makes one: who it emailed, and what each was sent. */
  async function publishNow() {
    world.mail.length = 0;
    const pressed = await w.join.publish("zach");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    await w.settle();
    return world.mail.filter((message) => !/^\[TEST\]/.test(message.subject)).map((message) => ({ to: message.to, said: JSON.stringify(message) }));
  }

  test("Una is told her group as without the visit, nobody is told anything about Chloe's visit, and the visit stands", async () => {
    const without = await publishNow();
    w.reset();
    for (const [groupId, count] of [[A, 4], [B, 3], [C, 2], [D, 2]]) world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
    await arrange("chloe", 4, C);
    const visitsBefore = JSON.stringify(read(seatPath("chloe")).visits);
    const told = await publishNow();
    assert.deepEqual(told.map((each) => each.to).sort(), without.map((each) => each.to).sort());
    assert.ok(told.length > 0, "Publish told somebody");
    assert.ok(!told.some((each) => each.to.startsWith("chloe")), "Chloe is told nothing");
    for (const each of told) assert.doesNotMatch(each.said, /Chloe/, `${each.to} is told nothing of the visit`);
    assert.equal(JSON.stringify(read(seatPath("chloe")).visits), visitsBefore);
    assert.equal(enrolments.groupForWeek(seat("chloe"), 4), C);
  });
});
