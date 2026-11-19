/**
 * A ONE-WEEK VISIT, WHAT A THIRD REVIEW FOUND: a visit has one deadline, the
 * start of the earlier of the two sessions of its week, read from the host's
 * own schedule even once its group is archived, for staff and the person
 * alike (the one exception: staff may end a visit to a session that is not
 * happening until the person's own session starts); requests to be excused
 * pair exactly as they always did for anybody with no visit, a person moved
 * to another group included; and a visit is never arranged over an excusal
 * that stands.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Week 4 is Group A's Thu 19 Nov at
 * 6pm (Sofia), Group B's Tue 24 Nov at 6pm (Rahul and Sofia) and Group C's
 * Wed 25 Nov at 1pm (Tom). Chloe is in Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitThirdReview");
const { world, call, routes } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { excusedFor } = await w.loadTs(join("lib", "courses", "excused", "own.ts"));
const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const runOf = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
async function arrange(uid, weekNumber, hostGroupId) {
  const shown = await visit("zach", uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}
async function standingOf(weekNumber) {
  const facts = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, "chloe", "ahead", new Date());
  assert.equal(facts.ok, true, JSON.stringify(facts));
  return standingVisits(facts.facts, "zach", new Date()).find((each) => each.weekNumber === weekNumber);
}
const staffCallOff = async (weekNumber) => visit("zach", "chloe", { weekNumber, callOff: true, emailCount: (await standingOf(weekNumber)).emails });
const ownCancel = (weekNumber) => call("chloe", cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber }, course: true });
const mark = (who, groupId, weekNumber, uid, status) => call(who, routes.register.POST, { groupId }, { body: { weekNumber, marks: [{ uid, status }] }, course: true });
const push = (who, groupId, weekNumber) => call(who, pushRoute.POST, { groupId }, { body: { weekNumber }, course: true });
const figures = () => {
  const { sessionsHeld, late, absent } = read(seatPath("chloe")).attendance;
  return { sessionsHeld, late, absent };
};
const ask = (groupId, sessionKeys = ["w04"]) =>
  call("chloe", askRoute.POST, { groupId }, { body: { sessionKeys, reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true }, course: true });
const requestIds = () => world.db.paths().filter((path) => /^courseRequests\/[^/]+$/.test(path)).map((path) => path.split("/")[1]);
async function weekFour() {
  const groups = [A, B, C, D].map(groupOf);
  const own = await excusedFor(world.courseDb, { user: w.sessionOf("chloe"), run: runOf(), enrolment: seat("chloe"), groups, now: new Date() });
  return own.sessions.filter((each) => each.weekNumber === 4).map((each) => ({ excuse: each.excuse?.kind ?? null, open: each.ask.open }));
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
// 1. A host archived after it held the session and finished its register
// ---------------------------------------------------------------------------

describe("1. a visit to Group A, which held the session, finished its register and was archived since", () => {
  async function lateAtGroupAThenArchived() {
    await arrange("chloe", 4, A);
    at("2026-11-19T21:00:00Z");
    assert.equal((await mark("sofia", A, 4, "chloe", "late")).status, 200);
    assert.equal((await push("sofia", A, 4)).status, 200);
    world.db.poke(`courseGroups/${A}`, { archived: true });
  }

  test("the day after, her own cancel is too late, and the visit and her mark stay", async () => {
    await lateAtGroupAThenArchived();
    const before = figures();
    at("2026-11-20T12:00:00Z");
    const own = await ownCancel(4);
    assert.deepEqual([own.status, own.body.kind], [409, "too-late"]);
    assert.equal(seat("chloe").visits.length, 1);
    assert.deepEqual(figures(), before);
  });

  test("a week later, staff are refused in a true sentence, the page offers nothing, and her mark stays", async () => {
    await lateAtGroupAThenArchived();
    at("2026-11-24T21:00:00Z");
    assert.equal((await mark("rahul", B, 4, "farah", "present")).status, 200);
    assert.equal((await push("rahul", B, 4)).status, 200);
    const before = figures();
    assert.equal(before.late, 1);
    at("2026-11-26T12:00:00Z");
    const standing = await standingOf(4);
    assert.equal(standing.gone, null, "the session happened");
    assert.deepEqual([standing.open, standing.stays], [false, "The visit can no longer be cancelled: Group A’s session has started."]);
    const called = await staffCallOff(4);
    assert.deepEqual([called.status, called.body.error], [409, "The visit can no longer be cancelled: Group A’s session has started."]);
    assert.equal(seat("chloe").visits.length, 1);
    assert.deepEqual(figures(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. A live visit and staff, once her own group's session has started
// ---------------------------------------------------------------------------

describe("2. staff may end a visit only until the earlier of the week's two sessions starts", () => {
  const STAYS =
    "Group B’s week 4 session has started, so calling this visit off would count Chloe absent from a session Chloe was told not to go to. " +
    "The visit stays. If Chloe can’t go to Group C’s session, Chloe can say so with Can’t make it on the visit card, or an admin can mark Chloe excused on Group C’s register.";

  test("visiting Group C on Wednesday: after Group B's Tuesday session, staff are refused and told what to do instead, and her figures stay", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-24T21:00:00Z");
    assert.equal((await mark("rahul", B, 4, "farah", "present")).status, 200);
    assert.equal((await push("rahul", B, 4)).status, 200);
    const before = figures();
    const standing = await standingOf(4);
    assert.deepEqual([standing.open, standing.stays], [false, STAYS]);
    const called = await staffCallOff(4);
    assert.deepEqual([called.status, called.body.error], [409, STAYS]);
    assert.equal(seat("chloe").visits.length, 1);
    assert.deepEqual(figures(), before);
  });

  test("before Group B's Tuesday session starts, staff can still end it", async () => {
    await arrange("chloe", 4, C);
    at("2026-11-24T17:30:00Z");
    assert.equal((await standingOf(4)).open, true);
    assert.equal((await staffCallOff(4)).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Requests to be excused, for somebody with no visit: exactly as before
// ---------------------------------------------------------------------------

describe("3. a request asked of her old group, then she is moved: exactly as before", () => {
  for (const how of ["by a record from week 4", "on the board, with no record"]) {
    test(`moved to Group A ${how}: week 4 shows waiting, asking Group A about it is refused, and one request stands`, async () => {
      assert.equal((await ask(B)).status, 200);
      if (how.startsWith("by a record")) world.db.poke(seatPath("chloe"), { groupId: A, groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: A, fromWeek: 4 }] });
      else world.db.poke(seatPath("chloe"), { groupId: A });
      assert.deepEqual(await weekFour(), [{ excuse: "waiting", open: false }]);
      assert.equal((await ask(A)).status, 409);
      assert.equal(requestIds().length, 1);
    });
  }

  test("a request asked from her own week carries no visit; one asked about the session she is visiting says so", async () => {
    assert.equal((await ask(B, ["w05"])).status, 200);
    await arrange("chloe", 4, A);
    assert.equal((await ask(A)).status, 200);
    const stored = requestIds().map((id) => read(`courseRequests/${id}`));
    assert.deepEqual(stored.map((each) => [each.groupId === A ? "A" : "B", each.aboutVisit ?? null]).sort(), [["A", true], ["B", null]]);
  });
});

// ---------------------------------------------------------------------------
// 4. No visit over an excusal that stands, however it was given
// ---------------------------------------------------------------------------

describe("4. no visit for a week she is excused from, by any excusal the register knows", () => {
  const REFUSED = "Chloe is excused from week 4, so no visit can be arranged for it.";
  const preview = () => visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });

  test("an admin marked her excused on Group B's week 4 register: refused", async () => {
    assert.equal((await mark("zach", B, 4, "chloe", "excused")).status, 200);
    const shown = await preview();
    assert.deepEqual([shown.status, shown.body.error], [409, REFUSED]);
  });

  test("her week 4 line was excused by a time answer, as \"Most weeks, not all\" writes it: refused", async () => {
    const told = new Date("2026-11-10T10:00:00Z");
    world.db.seed(registerPath(B, 4), {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 4,
      occurrence: 1,
      records: { chloe: "excused" },
      excusedInAdvance: { chloe: told },
      setBy: { chloe: { byUid: "chloe", at: told, how: "self" } },
    });
    const shown = await preview();
    assert.deepEqual([shown.status, shown.body.error], [409, REFUSED]);
  });

  test("nothing excused: the visit can be arranged", async () => {
    assert.equal((await preview()).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 5. A 409 only the save's transaction sees claims nothing
// ---------------------------------------------------------------------------

describe("5. a press the save's transaction refuses claims no limit", () => {
  test("Tom is added to Group A between the page's read and the save: 409, and neither counter is written", async () => {
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    const real = world.courseDb.runTransaction.bind(world.courseDb);
    let once = true;
    world.courseDb.runTransaction = async (fn, ...rest) => {
      if (once) {
        once = false;
        world.db.poke(`courseGroups/${A}`, { facilitatorUids: [...read(`courseGroups/${A}`).facilitatorUids, "tom"] });
      }
      return real(fn, ...rest);
    };
    try {
      const pressed = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
      assert.equal(pressed.status, 409, JSON.stringify(pressed.body));
    } finally {
      world.courseDb.runTransaction = real;
    }
    assert.equal(read(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`), undefined);
    assert.equal(read("courseNudges/emailrate__visitpresser__zach"), undefined);
    assert.equal(seat("chloe").visits, undefined);
  });
});
