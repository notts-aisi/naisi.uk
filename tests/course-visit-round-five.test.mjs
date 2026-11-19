/**
 * A ONE-WEEK VISIT, THE OWNER'S ANSWERS: a session somebody is visiting,
 * called off, ends the visit where their own group's session that week is
 * still to come (the approved emails, whatever the tick) and otherwise leaves
 * a visit that can be replaced; and what dev's newer pages read of a visitor.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Week 4 is Group A's Thu 19 Nov at
 * 6pm (Sofia), Group D's Mon 23 Nov at 6pm (Grace), Group B's Tue 24 Nov at
 * 6pm (Rahul and Sofia) and Group C's Wed 25 Nov at 1pm (Tom). Chloe is in
 * Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRoundFive");
const { world, call } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { loadRegisterMembers } = await w.loadTs(join("lib", "courses", "registerAccess.ts"));
const { resolveNoticeAudience } = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
const register = await w.courseRoute("groups", "[groupId]", "attendance");
const { readVisitFacts, dbReader, weekChoices, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
async function arrange(uid, weekNumber, hostGroupId) {
  const shown = await visit("zach", uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}
const DATE = { [A]: "2026-11-19", [C]: "2026-11-25" };
const change = (who, groupId, body) => call(who, changeRoute.POST, { groupId }, { body: { week: 4, dateKey: DATE[groupId], kind: "cancel", reason: "Away that week.", ...body }, course: true });
const rowsOf = async (groupId, forWeek) => (await loadRegisterMembers(world.courseDb, RUN.agi, groupId, { isAdmin: true }, forWeek)).members.map((row) => row.uid);
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`)).map((message) => message.subject);
const historyOf = (groupId) => world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read).filter((row) => row.kind === "member-visit-off" && row.groupId === groupId);

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
// 1. Called off with her own session still to come: the visit ends with it
// ---------------------------------------------------------------------------

describe("1. Group A's week 4 called off while her own Tuesday is still to come", () => {
  test("not telling the group: the visit ends, she and Rahul are sent the approved emails, a History row on each group, and she is back on Group B's register", async () => {
    await arrange("chloe", 4, A);
    const preview = await change("sofia", A, { tell: false, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(
      preview.body.preview.visitsOff.words,
      "1 person visiting this session is told their visit is off, whatever Tell the group says, and so are their own group’s facilitators: 2 emails.",
    );
    world.mail.length = 0;
    const pressed = await change("sofia", A, { tell: false });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(pressed.body.visitsOff, { people: 1, sent: 2, failed: 0, words: null });
    assert.equal(seat("chloe").visits, undefined);
    assert.deepEqual(mailTo("chloe"), ["Your visit to Group A for week 4 is off"]);
    assert.equal(mailTo("rahul").length, 1, "her own group's facilitator");
    assert.equal(mailTo("sofia").length, 0, "who pressed is told nothing");
    assert.equal(historyOf(A).length, 1);
    assert.equal(historyOf(B).length, 1);
    assert.ok((await rowsOf(B, 4)).includes("chloe"));
    assert.ok(!(await rowsOf(A, 4)).includes("chloe"));
  });

  test("telling the group: the count leaves her out, and the group's notice after the press does not reach her", async () => {
    await arrange("chloe", 4, A);
    const before = await resolveNoticeAudience(world.courseDb, RUN.agi, { logTag: "test", overCapAdvice: "" }, { groupId: A, weekNumber: 4 });
    assert.ok(before.members.some((member) => member.uid === "chloe"));
    const preview = await change("sofia", A, { tell: true, preview: true });
    const emails = preview.body.preview.told.emails;
    const pressed = await change("sofia", A, { tell: true, emailCount: emails });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.equal(pressed.body.update.emailCount, emails);
    const after = await resolveNoticeAudience(world.courseDb, RUN.agi, { logTag: "test", overCapAdvice: "" }, { groupId: A, weekNumber: 4 });
    assert.ok(!after.members.some((member) => member.uid === "chloe"), "the visit ended: not the host's for that week");
    assert.equal(before.members.length - 1, after.members.length);
  });

  test("the limit on these emails met: the whole change is refused and nothing is written", async () => {
    await arrange("chloe", 4, A);
    world.db.seed(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`, { kind: "staff-email-throttle", key: `visitperson__${RUN.agi}__chloe`, windowStartAt: new Date(), count: 10, updatedAt: new Date() });
    const groupBefore = JSON.stringify(read(`courseGroups/${A}`));
    world.mail.length = 0;
    const pressed = await change("sofia", A, { tell: false });
    assert.equal(pressed.status, 429);
    assert.equal(JSON.stringify(read(`courseGroups/${A}`)), groupBefore);
    assert.equal(seat("chloe").visits.length, 1);
    assert.equal(world.mail.length, 0);
  });

  test("a send that fails: the visit has ended and the answer says so, for staff to tell her another way", async () => {
    await arrange("chloe", 4, A);
    world.mailFate = (args) => (args.to.startsWith("chloe@") ? "fail" : "sent");
    try {
      const pressed = await change("sofia", A, { tell: false });
      assert.equal(pressed.status, 200);
      assert.deepEqual(pressed.body.visitsOff, { people: 1, sent: 1, failed: 1, words: "1 email about a visit that ended could not be sent. Tell them another way." });
      assert.equal(seat("chloe").visits, undefined);
    } finally {
      world.mailFate = undefined;
    }
  });

  test("the session put back afterwards: the visit stays ended", async () => {
    await arrange("chloe", 4, A);
    assert.equal((await change("sofia", A, { tell: false })).status, 200);
    const back = await change("sofia", A, { kind: "restore", tell: false });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(seat("chloe").visits, undefined);
  });

  test("with no visit: the preview says nothing of visits and the answer carries none", async () => {
    const preview = await change("sofia", A, { tell: false, preview: true });
    assert.equal(preview.body.preview.visitsOff, null);
    const pressed = await change("sofia", A, { tell: false });
    assert.equal(pressed.status, 200);
    assert.equal("visitsOff" in pressed.body, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Called off once her own session has started: the visit stands
// ---------------------------------------------------------------------------

describe("2. Group C's week 4 called off after her own Tuesday has started", () => {
  test("the visit stands, she is in the group's notice like the host's people, and nothing else is sent", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-24T19:00:00Z");
    const preview = await change("tom", C, { tell: false, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.preview.visitsOff, null);
    world.mail.length = 0;
    const pressed = await change("tom", C, { tell: false });
    assert.equal(pressed.status, 200);
    assert.equal(seat("chloe").visits.length, 1);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. A visit to a session that is not happening can be replaced
// ---------------------------------------------------------------------------

describe("3. Group D's Monday was called off after the fact, her own Tuesday has started: a visit to Group C's Wednesday replaces it", () => {
  async function standingToDCalledOff() {
    await arrange("chloe", 4, D);
    at("2026-11-24T21:00:00Z");
    const off = await call("grace", changeRoute.POST, { groupId: D }, { body: { week: 4, dateKey: "2026-11-23", kind: "cancel", reason: "The room flooded.", tell: false }, course: true });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(seat("chloe").visits.length, 1, "her own session had started: the visit stands");
  }

  test("the page offers week 4 again, the preview says what it replaces, and the press replaces it with the usual emails and a History row for the visit replaced", async () => {
    await standingToDCalledOff();
    const facts = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, "chloe", "ahead", new Date());
    assert.ok(weekChoices(facts.facts, new Date()).some((week) => week.weekNumber === 4 && week.visiting === false));
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: C, preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.lines[0], { label: "Replaces", text: "This replaces Chloe’s visit to Group D’s session that week, which is not happening." });
    world.mail.length = 0;
    const saved = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: C, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(seat("chloe").visits.map((each) => [each.weekNumber, each.groupId]), [[4, C]]);
    assert.equal(world.mail.length, shown.body.preview.emails);
    assert.equal(historyOf(D).length, 1);
  });

  const figures = () => {
    const { sessionsHeld, attendedInFull, absent } = read(seatPath("chloe")).attendance ?? {};
    return { sessionsHeld, attendedInFull, absent };
  };

  test("her own session has started, so the replacement can never be ended: her card offers no Cancel, her press and staff's are refused, and her figures do not move", async () => {
    await standingToDCalledOff();
    // Group B's week 4 register finished without her (she was a visitor that week).
    for (const uid of await rowsOf(B, 4)) await call("rahul", register.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid, status: "present" }] }, course: true });
    assert.equal((await call("rahul", pushRoute.POST, { groupId: B }, { body: { weekNumber: 4 } , course: true })).status, 200);
    const before = figures();
    await arrange("chloe", 4, C);
    assert.deepEqual(figures(), before);
    at("2026-11-25T10:00:00Z");
    const card = (await call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true })).body.visits[0];
    assert.equal(card.cancel, null, "no Cancel and no line saying until when");
    const own = await call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber: 4 }, course: true });
    assert.deepEqual([own.status, own.body.kind], [409, "too-late"]);
    assert.deepEqual(figures(), before);
    const facts = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, "chloe", "ahead", new Date());
    const standing = standingVisits(facts.facts, "zach", new Date())[0];
    assert.equal(standing.open, false);
    const staff = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: standing.emails });
    assert.equal(staff.status, 409);
    assert.deepEqual(figures(), before);
    assert.deepEqual(seat("chloe").visits.map((each) => [each.weekNumber, each.groupId]), [[4, C]]);
  });

  test("the email about the replacement leaves out the line about cancelling", async () => {
    await standingToDCalledOff();
    world.mail.length = 0;
    await arrange("chloe", 4, C);
    const toHer = world.mail.find((message) => message.to.startsWith("chloe@"));
    assert.ok(toHer);
    assert.doesNotMatch(JSON.stringify(toHer), /Changed your mind/);
  });

  test("a visit to a session that IS happening is not replaced", async () => {
    await arrange("chloe", 4, C);
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: D, preview: true });
    assert.deepEqual([shown.status, shown.body.error], [409, "Chloe already has a visit in week 4."]);
  });
});

// ---------------------------------------------------------------------------
// 4. A visit that ends takes its waiting request with it, quietly
// ---------------------------------------------------------------------------

describe("4. a request waiting about the visit's session when the visit ends", () => {
  const askA = () => call("chloe", askRoute.POST, { groupId: A }, { body: { sessionKeys: ["w04"], reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true }, course: true });
  const requestOf = () => world.db.paths().filter((path) => /^courseRequests\/[^/]+$/.test(path)).map(read)[0];

  for (const [how, end] of [
    ["staff call the visit off", async () => (await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: 3 })).status],
    ["the session is called off", async () => (await change("sofia", A, { tell: false })).status],
  ]) {
    test(`${how}: its week is withdrawn, with a line in its history, and nobody is sent anything about it`, async () => {
      await arrange("chloe", 4, A);
      assert.equal((await askA()).status, 200);
      world.mail.length = 0;
      assert.equal(await end(), 200);
      const request = requestOf();
      assert.equal(request.status, "withdrawn");
      assert.equal(request.change.weeks[0].status, "withdrawn");
      assert.equal(request.history.at(-1).what, "withdrawn");
      assert.ok(!world.mail.some((message) => /excused/i.test(message.subject)), JSON.stringify(world.mail.map((message) => message.subject)));
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Once both sessions have started, staff are given no advice
// ---------------------------------------------------------------------------

describe("5. a live visit to Group C once both sessions have started", () => {
  test("staff are told it can no longer be cancelled, and nothing else", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-25T15:00:00Z");
    const shown = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: 3 });
    assert.deepEqual(
      [shown.status, shown.body.error],
      [409, "Group B’s week 4 session has started, so calling this visit off would count Chloe absent from a session Chloe was told not to go to. The visit can no longer be cancelled."],
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Excused at home, visiting elsewhere
// ---------------------------------------------------------------------------

describe("6. excused from her own week 4 by an admin, then a visit to Group A", () => {
  test("the excusal stays at home, she is a visitor with no excusal at the host, and coming counts as coming", async () => {
    assert.equal((await call("zach", register.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid: "chloe", status: "excused" }] }, course: true })).status, 200);
    await arrange("chloe", 4, A);
    assert.ok((await rowsOf(A, 4)).includes("chloe"), "a row of the host's register");
    assert.ok(!(await rowsOf(B, 4)).includes("chloe"), "not a row of her own that week");
    at("2026-11-19T21:00:00Z");
    assert.equal((await call("sofia", register.POST, { groupId: A }, { body: { weekNumber: 4, marks: [{ uid: "chloe", status: "present" }] }, course: true })).status, 200);
    assert.equal((await call("sofia", pushRoute.POST, { groupId: A }, { body: { weekNumber: 4 }, course: true })).status, 200);
    const { attendedInFull, excused, absent } = read(seatPath("chloe")).attendance;
    assert.deepEqual({ attendedInFull, excused, absent }, { attendedInFull: 3, excused: 0, absent: 0 });
    const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi), { isAdmin: true }, new Date());
    const cell = tab.groups.find((group) => group.id === B).people.find((person) => person.uid === "chloe").cells.find((each) => each.weekNumber === 4);
    assert.deepEqual([cell.state, cell.mark], ["mark", "present"]);
  });
});
