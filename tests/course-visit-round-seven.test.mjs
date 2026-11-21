/**
 * A ONE-WEEK VISIT, ROUND SEVEN: a finished register's own "It didn't happen"
 * ends a visit to its session exactly as Change a session does (the same
 * code, `src/lib/courses/visit/hostOff.ts`); a replacement visit whose
 * person's own session "met at another time" before it was arranged can never
 * be ended; and the Overview counts a visitor once, on the host's row.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock starts on Tue 17 Nov 2026 at noon. Week 4 is Group A's Thu 19 Nov
 * at 6pm (Sofia), Group D's Mon 23 Nov at 6pm (Grace), Group B's Tue 24 Nov at
 * 6pm (Rahul and Sofia) and Group C's Wed 25 Nov at 1pm (Tom). Chloe is in
 * Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRoundSeven");
const { world, call } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const columnRoute = await w.courseRoute("groups", "[groupId]", "attendance", "column");
const register = await w.courseRoute("groups", "[groupId]", "attendance");
const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
const updatesRoute = await w.courseRoute("runs", "[runId]", "updates");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { loadRegisterMembers } = await w.loadTs(join("lib", "courses", "registerAccess.ts"));
const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
const { readRunRecords } = await w.loadTs(join("lib", "courses", "programmeAttendance.ts"));
const { buildProgrammeOverview } = await w.loadTs(join("lib", "courses", "programmeOverview.ts"));
const { resolveNoticeAudience } = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));

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
const rowsOf = async (groupId, forWeek) => (await loadRegisterMembers(world.courseDb, RUN.agi, groupId, { isAdmin: true }, forWeek)).members.map((row) => row.uid);
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`)).map((message) => message.subject);
const said = (uid) => JSON.stringify(world.mail.filter((message) => message.to.startsWith(`${uid}@`)));
const historyOf = (groupId) => world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read).filter((row) => row.kind === "member-visit-off" && row.groupId === groupId);
const figures = (uid = "chloe") => {
  const { sessionsHeld, attendedInFull, absent } = read(seatPath(uid)).attendance ?? {};
  return { sessionsHeld, attendedInFull, absent };
};

/** Everybody on Group A's week 4 register marked present by Sofia, then finished, on Thursday evening. */
async function finishA() {
  at("2026-11-19T20:00:00Z");
  for (const uid of await rowsOf(A, 4)) {
    const marked = await call("sofia", register.POST, { groupId: A }, { body: { weekNumber: 4, marks: [{ uid, status: "present" }] }, course: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
  }
  const pushed = await call("sofia", pushRoute.POST, { groupId: A }, { body: { weekNumber: 4 }, course: true });
  assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
}

/** The register's "It didn't happen" on Group A's week 4, as its sheet presses it: the preview's visit emails go with the press. */
const column = (who, body) =>
  call(who, columnRoute.POST, { groupId: A }, { body: { weekNumber: 4, kind: "did-not-happen", pace: "keep", dateKey: "2026-11-19", ...body }, course: true });
async function didNotHappen(who, body = {}) {
  const shown = await column(who, { preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const visitEmails = shown.body.preview.visitsOff?.emails ?? 0;
  return column(who, { reason: "Nobody could get in: the building was locked.", tell: false, ...(visitEmails > 0 ? { visitEmails } : {}), ...body });
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

// ---------------------------------------------------------------------------
// 1. The register's own It didn't happen, her own Tuesday still to come
// ---------------------------------------------------------------------------

describe("1. Group A's finished week 4 register says it didn't happen, while her own Tuesday is still to come", () => {
  test("the preview says it before the tap; the press ends the visit in the same write: the approved emails, a History row on each group, her line gone, back on Group B's register, her figures as before the visit", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    const counted = figures();
    assert.ok(counted.sessionsHeld >= 1 && counted.attendedInFull >= 1, "the host's finished register counted her: " + JSON.stringify(counted));
    at("2026-11-20T10:00:00Z");
    const shown = await column("zach", { preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.visitsOff, {
      people: 1,
      emails: 3,
      words: "1 person visiting this session is told their visit is off, whether or not the group is emailed, and so are their own group’s facilitators: 3 emails.",
    });
    world.mail.length = 0;
    const pressed = await column("zach", { reason: "Nobody could get in: the building was locked.", tell: false, visitEmails: 3 });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(pressed.body.visitsOff, { people: 1, sent: 3, failed: 0, words: null });
    assert.equal(seat("chloe").visits, undefined);
    assert.deepEqual(mailTo("chloe"), ["Your visit to Group A for week 4 is off"]);
    assert.match(said("chloe"), /as usual/);
    assert.equal(mailTo("rahul").length, 1, "her own group's facilitators: Rahul");
    assert.equal(mailTo("sofia").length, 1, "and Sofia, who facilitates Group B as well as Group A");
    assert.equal(mailTo("zach").length, 0, "who pressed is told nothing");
    assert.equal(world.mail.length, 3, "nobody else: the box to email the group was not ticked");
    assert.equal(historyOf(A).length, 1);
    assert.equal(historyOf(B).length, 1);
    assert.equal(read(`courseAttendance/${RUN.agi}__${A}__w04`)?.records?.chloe, undefined, "her line goes with every line of the session");
    assert.ok((await rowsOf(B, 4)).includes("chloe"));
    assert.ok(!(await rowsOf(A, 4)).includes("chloe"));
    // Her week 4 is her own group's again, and still to come: the host's session no longer counts for her.
    assert.deepEqual(figures(), { sessionsHeld: counted.sessionsHeld - 1, attendedInFull: counted.attendedInFull - 1, absent: counted.absent });
  });

  test("the box ticked: the group's count leaves her out, the notice the sheet posts after the press goes, and she is sent only her own email", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    const shown = await column("zach", { preview: true });
    const emails = shown.body.preview.told.emails;
    // She is one of Group A's people for week 4 while the visit stands, and the count leaves her out:
    // it is the count of the same session with nobody visiting it.
    const audience = await resolveNoticeAudience(world.courseDb, RUN.agi, { logTag: "test", overCapAdvice: "" }, { groupId: A, weekNumber: 4 });
    assert.ok(audience.members.some((member) => member.uid === "chloe"));
    const place = read(seatPath("chloe"));
    world.db.poke(seatPath("chloe"), { visits: [] });
    const without = (await column("zach", { preview: true })).body.preview.told.emails;
    world.db.seed(seatPath("chloe"), place);
    assert.equal(emails, without);
    world.mail.length = 0;
    const pressed = await column("zach", { reason: "Nobody came.", tell: true, emailCount: emails, visitEmails: 3 });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.equal(pressed.body.update.emailCount, emails);
    const posted = await call("zach", updatesRoute.POST, { runId: RUN.agi }, {
      body: { to: "group", groupId: A, title: pressed.body.update.title, message: pressed.body.update.message, email: true, emailCount: emails, withFacilitators: true },
      course: true,
    });
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.deepEqual(mailTo("chloe"), ["Your visit to Group A for week 4 is off"], "never the group's notice");
  });

  test("the limit on these emails met: the mark is refused and nothing is written", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    world.db.seed(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`, { kind: "staff-email-throttle", key: `visitperson__${RUN.agi}__chloe`, windowStartAt: new Date(), count: 10, updatedAt: new Date() });
    const groupBefore = JSON.stringify(read(`courseGroups/${A}`));
    const registerBefore = JSON.stringify(read(`courseAttendance/${RUN.agi}__${A}__w04`));
    const figuresBefore = figures();
    world.mail.length = 0;
    const pressed = await didNotHappen("zach");
    assert.equal(pressed.status, 429, JSON.stringify(pressed.body));
    assert.equal(typeof pressed.body.error, "string");
    assert.equal(JSON.stringify(read(`courseGroups/${A}`)), groupBefore);
    assert.equal(JSON.stringify(read(`courseAttendance/${RUN.agi}__${A}__w04`)), registerBefore);
    assert.deepEqual(figures(), figuresBefore);
    assert.equal(seat("chloe").visits.length, 1);
    assert.equal(world.mail.length, 0);
  });

  test("a send that fails: the visit has ended, and the answer says so for staff to tell her another way", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    world.mailFate = (args) => (args.to.startsWith("chloe@") ? "fail" : "sent");
    try {
      const pressed = await didNotHappen("zach");
      assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
      assert.deepEqual(pressed.body.visitsOff, { people: 1, sent: 2, failed: 1, words: "1 email about a visit that ended could not be sent. Tell them another way." });
      assert.equal(seat("chloe").visits, undefined);
    } finally {
      world.mailFate = undefined;
    }
  });

  test("a double tap: the second press is refused, and one set of emails goes", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    world.mail.length = 0;
    const body = { reason: "Nobody came.", tell: false, visitEmails: 3 };
    const [first, second] = await Promise.all([column("zach", body), column("zach", body)]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("rahul").length, 1);
  });

  test("who is visiting, or their emails, changed since the preview: refused, nothing written", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    const registerBefore = JSON.stringify(read(`courseAttendance/${RUN.agi}__${A}__w04`));
    const pressed = await column("zach", { reason: "Nobody came.", tell: false });
    assert.deepEqual([pressed.status, pressed.body.error, pressed.body.visitEmails], [409, "Who is visiting this session has changed since the page was opened. Check it, then press again.", 3]);
    assert.equal(JSON.stringify(read(`courseAttendance/${RUN.agi}__${A}__w04`)), registerBefore);
    assert.equal(seat("chloe").visits.length, 1);
  });

  test("excused from her own week 4 at home: her email and her facilitator's leave out the as usual sentence", async () => {
    assert.equal((await call("zach", register.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid: "chloe", status: "excused" }] }, course: true })).status, 200);
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    world.mail.length = 0;
    assert.equal((await didNotHappen("zach")).status, 200);
    assert.match(said("chloe"), /has been cancelled\./);
    assert.doesNotMatch(said("chloe"), /as usual/);
    assert.match(said("rahul"), /is no longer coming to Group A’s week 4 session\./);
    assert.doesNotMatch(said("rahul"), /as usual/);
  });

  test("said to have happened after all: the ended visit stays ended", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-20T10:00:00Z");
    assert.equal((await didNotHappen("zach")).status, 200);
    const back = await call("zach", columnRoute.POST, { groupId: A }, { body: { weekNumber: 4, kind: "did-happen", preview: true }, course: true });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.ok(!back.body.preview.people.some((person) => person.uid === "chloe"), "she is no row of it now");
    assert.equal(seat("chloe").visits, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. Her own session has started: the visit stands
// ---------------------------------------------------------------------------

describe("2. Group A's register says it didn't happen once her own Tuesday has started", () => {
  test("the visit stands and counts for nothing; no visit emails; the preview and the answer say nothing of visits", async () => {
    await arrange("chloe", 4, A);
    await finishA();
    at("2026-11-24T19:00:00Z");
    const shown = await column("zach", { preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(Object.hasOwn(shown.body.preview, "visitsOff"), false);
    world.mail.length = 0;
    const pressed = await column("zach", { reason: "Nobody came.", tell: false });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.equal(Object.hasOwn(pressed.body, "visitsOff"), false);
    assert.deepEqual(seat("chloe").visits.map((each) => [each.weekNumber, each.groupId]), [[4, A]]);
    assert.equal(world.mail.length, 0);
    assert.equal(historyOf(A).length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Nobody visiting: nothing new in the preview or the answer
// ---------------------------------------------------------------------------

describe("3. nobody visiting the session", () => {
  test("the preview and the answer carry no visit field, and no visit is read into either", async () => {
    await finishA();
    at("2026-11-20T10:00:00Z");
    const shown = await column("zach", { preview: true });
    assert.equal(Object.hasOwn(shown.body.preview, "visitsOff"), false);
    const pressed = await column("zach", { reason: "Nobody came.", tell: false });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(Object.keys(pressed.body).sort(), ["change", "kind", "ok", "update"]);
  });
});

// ---------------------------------------------------------------------------
// 4. The blocker, with her own session met at another time
// ---------------------------------------------------------------------------

describe("4. a replacement visit whose person's own session was recorded as met at another time, before the replacement was arranged", () => {
  test("it can never be ended: no Cancel on her card, her press and staff's refused, and her figures do not move", async () => {
    await arrange("chloe", 4, D);
    // Group D's Monday called off after the fact, her own Tuesday has started: the visit stands.
    at("2026-11-24T21:00:00Z");
    const off = await call("grace", changeRoute.POST, { groupId: D }, { body: { week: 4, dateKey: "2026-11-23", kind: "cancel", reason: "The room flooded.", tell: false }, course: true });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(seat("chloe").visits.length, 1);
    // Replaced with Group C's Wednesday, arranged Tue 24 Nov at 9:30pm.
    at("2026-11-24T21:30:00Z");
    await arrange("chloe", 4, C);
    // Group B's week 4 recorded as having met at another time, Mon 23 Nov at 3pm: before the replacement was arranged.
    at("2026-11-24T21:40:00Z");
    const met = await call("rahul", changeRoute.POST, { groupId: B }, {
      body: { week: 4, dateKey: "2026-11-24", kind: "move", metAtAnotherTime: true, reason: "We met on Monday instead.", tell: false, move: { dateKey: "2026-11-23", time: "3pm", room: "Hallward B12" } },
      course: true,
    });
    assert.equal(met.status, 200, JSON.stringify(met.body));
    // Group B's week 4 register finished without her (she was a visitor that week).
    for (const uid of await rowsOf(B, 4)) await call("rahul", register.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid, status: "present" }] }, course: true });
    assert.equal((await call("rahul", pushRoute.POST, { groupId: B }, { body: { weekNumber: 4 }, course: true })).status, 200);
    const before = figures();
    at("2026-11-25T10:00:00Z");
    const card = (await call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true })).body.visits[0];
    assert.equal(card.cancel, null, "no Cancel and no line saying until when");
    assert.deepEqual(figures(), before);
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
});

// ---------------------------------------------------------------------------
// 5. The Overview counts a visitor once, on the host's row
// ---------------------------------------------------------------------------

describe("5. the Overview: a visitor on the host's row, once in the week, and her coursework under her own group", () => {
  const LEAD = { isAdmin: true, uid: "zach" };
  const PLACE = { programmePath: "/admin/admissions/forms/r/programmes/p", courseId: "course", decisionsSentAt: null };

  async function model(week) {
    const records = await readRunRecords(world.courseDb, RUN.agi);
    return buildProgrammeOverview(world.courseDb, records, LEAD, PLACE, new Date(), week);
  }

  const sessionOf = (overview, groupId, dateKey) => overview.sessions.find((session) => session.groupId === groupId && session.dateKey === dateKey);

  test("Group A's finished week 4 counts her among the people who came; Group B's Tuesday does not list her; the week's figure counts her once", async () => {
    await arrange("chloe", 4, A);
    const aRows = await rowsOf(A, 4);
    const bRows = await rowsOf(B, 4);
    assert.ok(aRows.includes("chloe") && !bRows.includes("chloe"));
    await finishA();
    const thursday = await model(4);
    assert.equal(sessionOf(thursday, A, "2026-11-19").line, `${aRows.length} of ${aRows.length} came`, "the host's register, her line among them");
    // The week's figure: Group A's finished register, each of its lines once.
    const weekRow = thursday.byWeek.weeks.find((row) => row.weekNumber === 4);
    assert.deepEqual([weekRow.came, weekRow.of], [aRows.length, aRows.length]);
    const rows = new Map(thursday.byWeek.groups.rows.map((row) => [row.groupId, row]));
    assert.equal(rows.get(A).came, `${aRows.length} of ${aRows.length}`);
    // Group B's Tuesday, the day it meets: the people on its register, without her.
    at("2026-11-24T10:00:00Z");
    assert.equal(sessionOf(await model(4), B, "2026-11-24").line, `${bRows.length} in the group`);
  });

  test("with no visit, Group B's Tuesday counts her", async () => {
    const bRows = await rowsOf(B, 4);
    assert.ok(bRows.includes("chloe"));
    at("2026-11-24T10:00:00Z");
    assert.equal(sessionOf(await model(4), B, "2026-11-24").line, `${bRows.length} in the group`);
  });

  test("her week 4 coursework is counted under Group B, the group her place belongs to that week, and not Group A", async () => {
    const without = await model(4);
    const people = (overview, groupId) => overview.byWeek.groups.rows.find((row) => row.groupId === groupId).coursework;
    const bBefore = people(without, B);
    const aBefore = people(without, A);
    await arrange("chloe", 4, A);
    const withVisit = await model(4);
    assert.equal(people(withVisit, B), bBefore);
    assert.equal(people(withVisit, A), aBefore);
  });
});
