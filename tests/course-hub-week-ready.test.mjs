/**
 * A week's Ready (board pr-weeks, Q35): the one route that stores it, the one
 * answer every page asks, and the lead's "Mark ready" on the programme's
 * Overview.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/courses/runs/[runId]/weeks/[weekId]/ready   { ready: boolean }
 *
 * ## What this guards
 *
 *  1. THE ONE ANSWER. `weekIsReady` is true only for a published week marked
 *     ready, whatever else is stored.
 *  2. WHO. The lead of the programme that names the run and admins, and
 *     nobody else: a member, a group's facilitator who leads another
 *     programme, the run's track lead and its reviewer all get the same 403,
 *     and nothing is written. Signed out is 401; a view-as session is refused
 *     before anything; a body that says nothing is 400.
 *  3. WHAT. Marking ready stores `ready`, `readyAt` and `readyByUid` on the
 *     run's own week and publishes it in the same write (Zach, 26 October
 *     2026); a week with nothing in it is refused (409, nothing written);
 *     marking it again keeps the first time; "Not ready" clears all three,
 *     published or not, and leaves Published alone. A week with no page, an
 *     address that is not a week and a run being destroyed are refused, each
 *     with a sentence.
 *  4. THE OVERVIEW, before any group has met: week 1 not ready is a line
 *     under Needs attention ("Week 1 isn’t ready") carrying "Mark ready" once
 *     the week has something in it, published or not; with no page or
 *     nothing in it, the way to its page on the Weeks tab instead; marked
 *     ready, the line goes and the week card says so with "Not ready". After
 *     a group has met, no such line.
 *
 * Real: the route, the Overview's model and the libraries under them, the
 * store's transactions. Faked: the session, the Admin SDK handle, the
 * view-as guard and the clock (fixed before the run's first session, so the
 * suite reads the same on any day).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { RUN, groupSeed, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { AGI, ROUND } from "./lib/handoverWorld.mjs";

/** Sat 24 Oct 2026, 1pm in London: before the AGI run's first session (Mon 26 Oct, 6pm). */
const BEFORE_THE_START = new Date("2026-10-24T12:00:00Z");
/** Tue 27 Oct 2026, noon: the Monday group has met. */
const AFTER_MONDAY = new Date("2026-10-27T12:00:00Z");

mock.timers.enable({ apis: ["Date"], now: BEFORE_THE_START });

const made = await makeGroupWorld("__weekReady");
const { world, loadTs, reset, call } = made;
const route = await loadTs(join("app", "api", "courses", "runs", "[runId]", "weeks", "[weekId]", "ready", "route.ts"));
const { weekIsReady, MARK_READY, NOT_READY } = await loadTs(join("lib", "courses", "weekReady.ts"));
const { buildProgrammeOverview } = await loadTs(join("lib", "courses", "programmeOverview.ts"));
const { readRunRecords } = await loadTs(join("lib", "courses", "programmeAttendance.ts"));

const W01 = `courseRuns/${RUN.agi}/weeks/w01`;
const press = (who, body, { weekId = "w01", runId = RUN.agi, viewAs = false } = {}) =>
  call(who, route.PUT, { runId, weekId }, { body, viewAs });
const stored = () => world.db.read(W01);
const snapshot = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

beforeEach(() => {
  mock.timers.setTime(BEFORE_THE_START.getTime());
  reset();
});

describe("1. the one answer", () => {
  test("a week is ready only when it is published and marked ready", () => {
    assert.equal(weekIsReady(null), false);
    assert.equal(weekIsReady(undefined), false);
    assert.equal(weekIsReady({ published: false, ready: false }), false);
    assert.equal(weekIsReady({ published: false, ready: true }), false);
    assert.equal(weekIsReady({ published: true, ready: false }), false);
    assert.equal(weekIsReady({ published: true, ready: true }), true);
    assert.equal(MARK_READY, "Mark ready");
    assert.equal(NOT_READY, "Not ready");
  });
});

describe("2. who may", () => {
  test("signed out is 401, and a view-as session is refused before anything", async () => {
    const before = snapshot();
    assert.equal((await press(null, { ready: true })).status, 401);
    const borrowed = await press("zach", { ready: true }, { viewAs: true });
    assert.deepEqual([borrowed.status, borrowed.body.error], [403, "view-as"]);
    assert.equal(snapshot(), before);
  });

  test("a body that says nothing is 400 with a sentence, for everybody signed in", async () => {
    for (const who of ["zach", "claudia", "amara"]) {
      for (const body of [{}, { ready: "yes" }, { ready: 1 }, null]) {
        const answer = await press(who, body);
        assert.equal(answer.status, 400, `${who} ${JSON.stringify(body)}`);
        assert.match(answer.body.error, /Say whether the week is ready/);
      }
    }
  });

  test("a member, a facilitator who leads another programme, the track lead and the reviewer get the same 403, and nothing is written", async () => {
    const before = snapshot();
    for (const who of ["amara", "tess", "yusuf", "lloyd", "nobody"]) {
      for (const ready of [true, false]) {
        const answer = await press(who, { ready });
        assert.deepEqual(
          [answer.status, answer.body.error],
          [403, "Only the programme’s lead and admins can mark a week ready."],
          `${who} ${ready}`,
        );
      }
    }
    // And the same for an address that is not a week: the gate comes first.
    assert.equal((await press("amara", { ready: true }, { weekId: "w99" })).status, 403);
    assert.equal(snapshot(), before);
  });

  test("the lead marks week 1 ready, and the mark is theirs", async () => {
    const answer = await press("claudia", { ready: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(Object.keys(answer.body).sort(), ["ok", "week"]);
    assert.deepEqual(Object.keys(answer.body.week).sort(), ["ready", "readyAt", "weekId", "weekNumber"]);
    assert.equal(answer.body.week.ready, true);
    assert.equal(answer.body.week.weekNumber, 1);
    assert.equal(stored().ready, true);
    assert.equal(stored().readyByUid, "claudia");
    assert.ok(stored().readyAt instanceof Date, "readyAt is the server's time");
    assert.equal(stored().published, true, "Published is left as it was");
  });

  test("a lead whose programme no longer names the run is nobody here", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    const answer = await press("claudia", { ready: true });
    assert.equal(answer.status, 403);
    assert.equal(stored().ready, undefined);
  });
});

describe("3. what it stores", () => {
  test("an admin takes it back: all three cleared, Published left alone", async () => {
    await press("claudia", { ready: true });
    const answer = await press("zach", { ready: false });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.week, { weekId: "w01", weekNumber: 1, ready: false, readyAt: null });
    assert.equal(stored().ready, false);
    assert.equal("readyAt" in stored(), false);
    assert.equal("readyByUid" in stored(), false);
    assert.equal(stored().published, true);
  });

  test("marking an unpublished week ready publishes it in the same write, and Not ready leaves it published", async () => {
    world.db.poke(W01, { published: false });
    const answer = await press("claudia", { ready: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.week.ready, true);
    assert.equal(stored().published, true, "marking it ready published it");
    assert.equal(stored().ready, true);
    assert.equal(stored().readyByUid, "claudia");
    assert.ok(stored().readyAt instanceof Date);
    // Not ready takes back the mark alone: a week open to its groups stays open.
    assert.equal((await press("claudia", { ready: false })).status, 200);
    assert.equal(stored().ready, false);
    assert.equal(stored().published, true);
    // Taking it back is allowed on an unpublished week too, and publishes nothing.
    world.db.poke(W01, { published: false, ready: true, readyByUid: "claudia" });
    assert.equal((await press("zach", { ready: false })).status, 200);
    assert.equal(stored().ready, false);
    assert.equal("readyByUid" in stored(), false);
    assert.equal(stored().published, false);
  });

  test("a week with nothing in it cannot be marked ready, published or not, and nothing is written", async () => {
    for (const published of [true, false]) {
      world.db.poke(W01, { exercises: [], published });
      const before = snapshot();
      for (const who of ["claudia", "zach"]) {
        const answer = await press(who, { ready: true });
        assert.deepEqual([answer.status, answer.body.error], [409, "Week 1 has nothing in it yet. Paste its Markdown first."], `${who} ${published}`);
      }
      assert.equal(snapshot(), before);
    }
  });

  test("marking it again keeps the first mark's time and who", async () => {
    await press("claudia", { ready: true });
    const first = stored().readyAt.getTime();
    mock.timers.setTime(BEFORE_THE_START.getTime() + 3_600_000);
    const again = await press("zach", { ready: true });
    assert.equal(again.status, 200);
    assert.equal(stored().readyAt.getTime(), first);
    assert.equal(stored().readyByUid, "claudia");
    assert.equal(again.body.week.readyAt, new Date(first).toISOString());
  });

  test("a week with no page, an address that is not a week, and a run being destroyed are refused with a sentence", async () => {
    const noPage = await press("zach", { ready: true }, { weekId: "w02" });
    assert.deepEqual([noPage.status, noPage.body.error], [404, "Week 2 has no page on this run yet."]);
    for (const weekId of ["w00", "w61", "w99", "x01", "w1"]) {
      const answer = await press("zach", { ready: true }, { weekId });
      assert.deepEqual([answer.status, answer.body.error], [404, "That isn’t a week of a run: weeks are w01 to w60."], weekId);
    }
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const gone = await press("zach", { ready: true });
    assert.deepEqual([gone.status, gone.body.error], [404, "That run isn’t on the site."]);
    assert.equal(stored().ready, undefined);
  });
});

describe("4. the lead's Overview before any group has met", () => {
  const PLACE = { programmePath: `/admin/admissions/forms/${ROUND}/programmes/${AGI}`, courseId: "agi-strategy-fellowship__c0urse01", decisionsSentAt: null };

  async function model(viewer) {
    const records = await readRunRecords(world.courseDb, RUN.agi);
    return buildProgrammeOverview(world.courseDb, records, viewer, PLACE, new Date());
  }
  const LEAD = { isAdmin: false, uid: "claudia" };
  const ADMIN = { isAdmin: true, uid: "zach" };
  const weekOneLines = (built) => built.attention.filter((item) => item.title === "Week 1 isn’t ready");

  test("published and not ready: the line, with Mark ready, for the lead and for an admin", async () => {
    for (const viewer of [LEAD, ADMIN]) {
      const built = await model(viewer);
      const [line] = weekOneLines(built);
      assert.ok(line, "no line for week 1");
      assert.equal(line.kind, "week");
      assert.equal(line.detail, "Everyone holding a place can open week 1 once it’s marked ready.");
      assert.deepEqual(line.ready, { runId: RUN.agi, weekId: "w01", ready: false, line: "" });
      assert.equal(line.link, null);
      assert.equal(built.week.ready, null);
    }
  });

  test("marked ready: the line goes, and the week card says so with Not ready", async () => {
    await press("claudia", { ready: true });
    const built = await model(LEAD);
    assert.deepEqual(weekOneLines(built), []);
    assert.deepEqual(built.week.ready, {
      runId: RUN.agi,
      weekId: "w01",
      ready: true,
      line: "Ready: everyone holding a place can open week 1.",
    });
  });

  test("not published: Mark ready, which publishes it, for the lead and for an admin", async () => {
    world.db.poke(W01, { published: false });
    for (const viewer of [LEAD, ADMIN]) {
      const [line] = weekOneLines(await model(viewer));
      assert.equal(line.detail, "Week 1 isn’t published yet: marking it ready publishes it, and everyone holding a place can open it.");
      assert.deepEqual(line.ready, { runId: RUN.agi, weekId: "w01", ready: false, line: "" });
      assert.equal(line.link, null);
    }
  });

  const WEEK_ONE_PAGE = { href: `${PLACE.programmePath}/weeks/w01`, label: "Open week 1" };

  test("no page yet: said, the way to its page on the Weeks tab, and no Mark ready", async () => {
    const seed = groupSeed();
    delete seed[W01];
    reset(seed);
    for (const viewer of [LEAD, ADMIN]) {
      const [line] = weekOneLines(await model(viewer));
      assert.equal(line.detail, "Week 1 has no page yet. Paste its Markdown on the Weeks tab, then mark it ready.");
      assert.equal(line.ready, null);
      assert.deepEqual(line.link, WEEK_ONE_PAGE);
    }
  });

  test("nothing in it yet, published or not: said, the way to its page, and no Mark ready", async () => {
    for (const published of [true, false]) {
      world.db.poke(W01, { exercises: [], published });
      for (const viewer of [LEAD, ADMIN]) {
        const [line] = weekOneLines(await model(viewer));
        assert.equal(line.detail, "Week 1 has nothing in it yet. Paste its Markdown on the Weeks tab, then mark it ready.");
        assert.equal(line.ready, null);
        assert.deepEqual(line.link, WEEK_ONE_PAGE);
      }
    }
  });

  test("once a group has met there is no week 1 line, ready or not", async () => {
    mock.timers.setTime(AFTER_MONDAY.getTime());
    assert.deepEqual(weekOneLines(await model(LEAD)), []);
    await press("claudia", { ready: true });
    const built = await model(LEAD);
    assert.equal(built.week?.ready ?? null, null);
  });
});
