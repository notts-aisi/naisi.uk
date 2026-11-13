/**
 * Every reader about ONE session, or ONE week, of a person asks which group
 * they were in for THAT week (`groupForWeek`), whether the session is past or
 * still to come.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * `tests/course-groups-by-week-readers.test.mjs` holds the rule for the tree
 * and runs the readers of a week's mark, due session and register rows. This
 * file runs the readers about one session that a person or a facilitator
 * presses or is sent: their calendar, their own list of excused weeks,
 * deciding a request to be excused, "Can't make it", "Joining online" and who
 * it tells, when a pick closes, when a sealed prediction opens, a new regular
 * time's take-backs, This week's due dates and pick on the run home, and the
 * group's "Week N is open" email with what a register's button says of it.
 *
 * Each is run three ways:
 *
 *  - NEXT: moved from the next week to meet (weeks 1 to 3 in the old group,
 *    week 4 on in the new one);
 *  - AHEAD: moved from two weeks ahead (week 4 stays with the old group);
 *  - NONE: moved with no record, as everybody moved before the record
 *    existed: the group they are in now for every week, which is how every
 *    one of these readers read before.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays at 6pm (Rahul and Sofia facilitate;
 * Amara, Chloe, Farah), Group A on Mondays at 6pm (Amelia; Ana). Chloe is the
 * one moved, from Group B to Group A. The clock is Wednesday 4 November,
 * noon: week 3 has met in both groups and week 4 has not.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";
import { pressedBefore } from "./lib/saidBefore.mjs";
import { syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const made = makeWorld("__groupsByWeekSessions");
const { world, reset, lib, call, courseRoute, sessionOf } = made;

const { normalizeCourseEnrolment } = await lib("firestore", "courseEnrolments.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { readCalendarFeed } = await lib("courses", "calendarFeed.ts");
const { excusedFor } = await lib("courses", "excused", "own.ts");
const { EXCUSED_REFUSAL } = await lib("courses", "excused", "words.ts");
const { cantMakeItFor } = await lib("courses", "cantMakeIt", "seat.ts");
const { CANT_MAKE_IT_REFUSAL } = await lib("courses", "cantMakeIt", "words.ts");
const { joiningOnlineFor } = await lib("courses", "joiningOnline", "seat.ts");
const { JOINING_ONLINE_REFUSAL } = await lib("courses", "joiningOnline", "words.ts");
const { predictionsTakerOf, cardOpenTo } = await lib("courses", "predictions", "taker.ts");
const { applyRegularChange } = await lib("courses", "regularTime", "apply.ts");
const { readPushEmails } = await lib("courses", "pushEmail.ts");
const { sendNextWeekEmail } = await lib("courses", "nextWeekEmail.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { DEFAULT_COURSES_CONFIG } = await lib("firestore", "config.ts");
const cantMakeItRoute = await courseRoute("groups", "[groupId]", "cant-make-it");
const joiningOnlineRoute = await courseRoute("groups", "[groupId]", "joining-online");
const askRoute = await courseRoute("groups", "[groupId]", "excused");
const approveRoute = await courseRoute("requests", "[requestId]", "excused", "approve");
const picksRoute = await courseRoute("runs", "[runId]", "packs-and-cases", "[blockId]");
const overview = await courseRoute("runs", "[runId]", "overview");

/** Wednesday 4 November 2026, noon: week 3 has met in both groups, week 4 has not. */
const NOW = new Date("2026-11-04T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  reset(seedWorld());
});

const read = (path) => world.db.read(path);
const CHLOE = `courseEnrolments/${RUN}__chloe`;
/** Moved from the next week to meet: weeks 1 to 3 in Group B, week 4 on in Group A. */
const NEXT = [{ groupId: GROUP.b, fromWeek: 1 }, { groupId: GROUP.a, fromWeek: 4 }];
/** Moved from two weeks ahead: week 4 stays with Group B, week 5 on in Group A. */
const AHEAD = [{ groupId: GROUP.b, fromWeek: 1 }, { groupId: GROUP.a, fromWeek: 5 }];

/** Chloe in Group A now; with `record`, her weeks as it says, and with none, Group A's for every week. */
function moveChloe(record) {
  world.db.poke(CHLOE, { groupId: GROUP.a, ...(record ? { groupsByWeek: record } : {}) });
}

const runOf = () => normalizeCourseRun(RUN, read(`courseRuns/${RUN}`));
const groupsOf = () => [GROUP.a, GROUP.b].map((id) => normalizeCourseGroup(id, read(`courseGroups/${id}`)));
const seatOf = (uid) => normalizeCourseEnrolment(`${RUN}__${uid}`, read(`courseEnrolments/${RUN}__${uid}`));
const nameOf = (groupId) => (groupId === GROUP.a ? "A" : groupId === GROUP.b ? "B" : groupId);
const emailOf = (uid) => read(`users/${uid}`).email;

/** London wall clock of an instant, "Mon 26 Oct 18:00". */
const london = (date) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(date)
        .replace(",", "")
    : null;

/** A finished register: marks by uid, finished the evening it met. */
function finished(groupId, weekNumber, records) {
  world.db.seed(registerPath(groupId, weekNumber), {
    runId: RUN,
    groupId,
    weekNumber,
    occurrence: 1,
    records,
    held: true,
    pushedAt: new Date("2026-10-19T20:00:00Z"),
    pushedByUid: "zach",
  });
}

// ===========================================================================
// 1. The calendar link
// ===========================================================================

describe("1. the calendar link holds each week's session from the group they were in that week", () => {
  const feed = async () => {
    const { events, groups } = await readCalendarFeed(world.db, sessionOf("chloe"));
    return {
      events: events.map((event) => `${london(event.startAt)} ${event.title.split(" · ").pop()}`),
      groups: groups.map((group) => `${group.groupName} ${group.count}`),
    };
  };

  test("NEXT: Group B's Tuesdays for weeks 1 to 3, Group A's Mondays from week 4; the line counts the group she is in now", async () => {
    moveChloe(NEXT);
    assert.deepEqual(await feed(), {
      events: [
        "Tue 20 Oct 18:00 Group B",
        "Tue 27 Oct 18:00 Group B",
        "Tue 3 Nov 18:00 Group B",
        "Mon 9 Nov 18:00 Group A",
        "Mon 16 Nov 18:00 Group A",
        "Mon 23 Nov 18:00 Group A",
      ],
      groups: ["Group A 3"],
    });
  });

  test("AHEAD: week 4 is still Group B's Tuesday", async () => {
    moveChloe(AHEAD);
    assert.deepEqual((await feed()).events, [
      "Tue 20 Oct 18:00 Group B",
      "Tue 27 Oct 18:00 Group B",
      "Tue 3 Nov 18:00 Group B",
      "Tue 10 Nov 18:00 Group B",
      "Mon 16 Nov 18:00 Group A",
      "Mon 23 Nov 18:00 Group A",
    ]);
    assert.deepEqual((await feed()).groups, ["Group A 2"]);
  });

  test("NONE: every week Group A's, as before, and the same as somebody always in Group A", async () => {
    moveChloe(null);
    const chloe = await feed();
    assert.deepEqual(chloe, {
      events: [
        "Mon 19 Oct 18:00 Group A",
        "Mon 26 Oct 18:00 Group A",
        "Mon 2 Nov 18:00 Group A",
        "Mon 9 Nov 18:00 Group A",
        "Mon 16 Nov 18:00 Group A",
        "Mon 23 Nov 18:00 Group A",
      ],
      groups: ["Group A 6"],
    });
    const { events } = await readCalendarFeed(world.db, sessionOf("ana"));
    assert.deepEqual(
      events.map((event) => `${london(event.startAt)} ${event.title.split(" · ").pop()}`),
      chloe.events,
    );
  });
});

// ===========================================================================
// 2. Their own list of excused weeks
// ===========================================================================

describe("2. their own excused weeks: each session, and its outcome, off the register of that week's group", () => {
  /** Weeks 1 to 3 finished: Chloe came, was absent, then came, on Group B's; Group A's know nothing of her. */
  function threeWeeks() {
    finished(GROUP.b, 1, { amara: "present", chloe: "present", farah: "present" });
    finished(GROUP.b, 2, { amara: "present", chloe: "absent", farah: "present" });
    finished(GROUP.b, 3, { amara: "present", chloe: "late", farah: "present" });
    for (const week of [1, 2, 3]) finished(GROUP.a, week, { ana: "present" });
  }
  const own = async () => {
    const view = await excusedFor(world.db, {
      user: sessionOf("chloe"),
      run: runOf(),
      enrolment: seatOf("chloe"),
      groups: groupsOf(),
      now: new Date(),
    });
    assert.equal(view.groupId, GROUP.a, "the view is of the group she is in now");
    return view.sessions.map(
      (session) =>
        `${session.sessionKey} ${london(new Date(session.startsAt))} ${session.register ?? "none"} ${session.ask.open ? `ask ${session.ask.when}` : session.ask.why}`,
    );
  };

  test("NEXT: weeks 1 to 3 are Group B's, with Group B's outcomes and nothing to ask of Group A about them", async () => {
    threeWeeks();
    moveChloe(NEXT);
    assert.deepEqual(await own(), [
      "w01 Tue 20 Oct 18:00 came another-group",
      "w02 Tue 27 Oct 18:00 absent another-group",
      "w03 Tue 3 Nov 18:00 came another-group",
      "w04 Mon 9 Nov 18:00 none ask before",
      "w05 Mon 16 Nov 18:00 none ask before",
      "w06 Mon 23 Nov 18:00 none ask before",
    ]);
  });

  test("AHEAD: week 4 is Group B's Tuesday too", async () => {
    threeWeeks();
    moveChloe(AHEAD);
    assert.deepEqual((await own()).slice(3), [
      "w04 Tue 10 Nov 18:00 none another-group",
      "w05 Mon 16 Nov 18:00 none ask before",
      "w06 Mon 23 Nov 18:00 none ask before",
    ]);
  });

  test("NONE: every session Group A's, off Group A's registers, as before", async () => {
    threeWeeks();
    moveChloe(null);
    // Group A's registers have no line of hers, so weeks 1 to 3 read as
    // finished with nothing to say and nothing to ask, exactly as they did.
    assert.deepEqual(await own(), [
      "w01 Mon 19 Oct 18:00 none not-absent",
      "w02 Mon 26 Oct 18:00 none not-absent",
      "w03 Mon 2 Nov 18:00 none not-absent",
      "w04 Mon 9 Nov 18:00 none ask before",
      "w05 Mon 16 Nov 18:00 none ask before",
      "w06 Mon 23 Nov 18:00 none ask before",
    ]);
  });
});

// ===========================================================================
// 3. Deciding a request to be excused
// ===========================================================================

describe("3. a request about a week belongs to the group they were in for THAT week", () => {
  const REASON = "A seminar I cannot move on Tuesday evening.";
  /** Chloe, still in Group B, asks to be excused from its week 4; then the move. */
  async function askedThenMoved(record) {
    const asked = await call("chloe", askRoute.POST, { groupId: GROUP.b }, {
      body: { sessionKeys: ["w04"], reason: REASON, inPerson: true, ownOnline: true, otherOnline: true },
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const requestId = world.db.paths().find((path) => path.startsWith("courseRequests/")).split("/")[1];
    moveChloe(record);
    world.mail.length = 0;
    return requestId;
  }
  const approve = (requestId) => call("zach", approveRoute.POST, { requestId }, { body: { sessionKey: "w04" } });
  const lineOf = (groupId) => read(registerPath(groupId, 4))?.records?.chloe ?? null;

  test("AHEAD: asked before the move about a week that stays with Group B, it is still decided, and written on Group B's register", async () => {
    const requestId = await askedThenMoved(AHEAD);
    const approved = await approve(requestId);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(lineOf(GROUP.b), "excused");
    assert.equal(lineOf(GROUP.a), null);
    // Group B's facilitators are told: the session is theirs.
    const to = world.mail.map((message) => message.to).sort();
    assert.deepEqual(to, [emailOf("chloe"), emailOf("rahul"), emailOf("sofia")].sort());
  });

  test("NEXT: week 4 is Group A's now, so a request of Group B about it is refused as before, and nothing is written or sent", async () => {
    const requestId = await askedThenMoved(NEXT);
    const refused = await approve(requestId);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, EXCUSED_REFUSAL.left);
    assert.equal(lineOf(GROUP.b), null);
    assert.equal(world.mail.length, 0);
  });

  test("NONE: refused as before, the group they are in now for every week", async () => {
    const requestId = await askedThenMoved(null);
    const refused = await approve(requestId);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, EXCUSED_REFUSAL.left);
    assert.equal(lineOf(GROUP.b), null);
    assert.equal(world.mail.length, 0);
  });
});

// ===========================================================================
// 4 and 5. Can't make it, and joining online
// ===========================================================================

describe("4. Can't make it: the ticket's session and the register its line goes on are that week's group's", () => {
  const ticket = () =>
    cantMakeItFor(world.db, { user: sessionOf("chloe"), run: runOf(), enrolment: seatOf("chloe"), groups: groupsOf(), now: new Date() });
  /** "Can't make it" said on the spot, as only a facilitator of the group now may (`tests/lib/saidBefore.mjs`). */
  const press = (groupId, sessionKey = "w04") =>
    pressedBefore(world.db, groupId, "chloe", () =>
      call("chloe", cantMakeItRoute.POST, { groupId }, { body: { sessionKey, cantMakeIt: true } }),
    );
  const lineOf = (groupId) => read(registerPath(groupId, 4))?.records?.chloe ?? null;

  test("NEXT: her next session is Group A's Monday; it goes on Group A's register, and Group B's refuses her", async () => {
    moveChloe(NEXT);
    assert.deepEqual(await ticket(), { groupId: GROUP.a, sessionKey: "w04", day: "Mon 9 Nov", told: false });
    const wrong = await press(GROUP.b);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error, CANT_MAKE_IT_REFUSAL.notYours);
    assert.equal((await press(GROUP.a)).status, 200);
    assert.deepEqual([lineOf(GROUP.a), lineOf(GROUP.b)], ["excused", null]);
  });

  test("AHEAD: her next session is Group B's Tuesday; it goes on Group B's register, and Group A's week 4 refuses her", async () => {
    moveChloe(AHEAD);
    assert.deepEqual(await ticket(), { groupId: GROUP.b, sessionKey: "w04", day: "Tue 10 Nov", told: false });
    const wrong = await press(GROUP.a);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error, CANT_MAKE_IT_REFUSAL.notYours);
    assert.equal((await press(GROUP.b)).status, 200);
    assert.deepEqual([lineOf(GROUP.a), lineOf(GROUP.b)], [null, "excused"]);
    // Somebody taking part who does not facilitate is told to ask, as anywhere
    // they take part: she is one of Group B's people for week 4.
    const asks = await call("chloe", cantMakeItRoute.POST, { groupId: GROUP.b }, { body: { sessionKey: "w04", cantMakeIt: true } });
    assert.equal(asks.status, 403);
    assert.equal(asks.body.error, CANT_MAKE_IT_REFUSAL.askInstead);
    // Week 5 is Group A's.
    const week5 = await pressedBefore(world.db, GROUP.b, "chloe", () =>
      call("chloe", cantMakeItRoute.POST, { groupId: GROUP.b }, { body: { sessionKey: "w05", cantMakeIt: true } }),
    );
    assert.equal(week5.status, 404);
  });

  test("NONE: Group A's Monday and Group A's register, and Group B's is nobody's to her, as before", async () => {
    moveChloe(null);
    assert.deepEqual(await ticket(), { groupId: GROUP.a, sessionKey: "w04", day: "Mon 9 Nov", told: false });
    const wrong = await press(GROUP.b);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error, CANT_MAKE_IT_REFUSAL.notYours);
    assert.equal((await press(GROUP.a)).status, 200);
    assert.deepEqual([lineOf(GROUP.a), lineOf(GROUP.b)], ["excused", null]);
  });

  test("the week of a move between groups that meet on different days: the next session is the one she is due at", async () => {
    // Ana moved from Group A (Mondays) to Group B (Tuesdays) from week 5, the
    // next week to meet for her on Monday 9 November after Group A's week 4
    // session. Read by the group she is in now, her ticket would show Group
    // B's week 4 on Tuesday, a session that was never hers.
    world.db.poke(`courseEnrolments/${RUN}__ana`, {
      groupId: GROUP.b,
      groupsByWeek: [{ groupId: GROUP.a, fromWeek: 1 }, { groupId: GROUP.b, fromWeek: 5 }],
    });
    at("2026-11-09T20:30:00Z");
    const view = await cantMakeItFor(world.db, {
      user: sessionOf("ana"),
      run: runOf(),
      enrolment: seatOf("ana"),
      groups: groupsOf(),
      now: new Date(),
    });
    assert.deepEqual(view, { groupId: GROUP.b, sessionKey: "w05", day: "Tue 17 Nov", told: false }, "never Group B's week 4, which was not hers");
  });
});

describe("5. Joining online: said on that week's group's register, and that group's facilitators are told", () => {
  const ticket = () =>
    joiningOnlineFor(world.db, { user: sessionOf("chloe"), run: runOf(), enrolment: seatOf("chloe"), groups: groupsOf(), now: new Date() });
  const say = (groupId, sessionKey = "w04") => call("chloe", joiningOnlineRoute.POST, { groupId }, { body: { sessionKey, online: true } });
  const saidOn = (groupId) => Boolean(read(registerPath(groupId, 4))?.onlineSaid?.chloe);
  const toldTo = () => world.mail.map((message) => message.to).sort();

  test("NEXT: Group A's Monday; Amelia is told; Group B refuses her", async () => {
    moveChloe(NEXT);
    assert.deepEqual(await ticket(), { groupId: GROUP.a, sessionKey: "w04", day: "Mon 9 Nov", said: false, told: false });
    const wrong = await say(GROUP.b);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error, JOINING_ONLINE_REFUSAL.notYours);
    assert.equal((await say(GROUP.a)).status, 200);
    assert.deepEqual([saidOn(GROUP.a), saidOn(GROUP.b)], [true, false]);
    assert.deepEqual(toldTo(), [emailOf("amelia")]);
  });

  test("AHEAD: Group B's Tuesday; Rahul and Sofia are told, never Amelia; Group A's week 4 refuses her", async () => {
    moveChloe(AHEAD);
    assert.deepEqual(await ticket(), { groupId: GROUP.b, sessionKey: "w04", day: "Tue 10 Nov", said: false, told: false });
    const wrong = await say(GROUP.a);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error, JOINING_ONLINE_REFUSAL.notYours);
    assert.equal(world.mail.length, 0);
    assert.equal((await say(GROUP.b)).status, 200);
    assert.deepEqual([saidOn(GROUP.a), saidOn(GROUP.b)], [false, true]);
    assert.deepEqual(toldTo(), [emailOf("rahul"), emailOf("sofia")].sort());
  });

  test("NONE: Group A's Monday and Amelia, as before", async () => {
    moveChloe(null);
    assert.deepEqual(await ticket(), { groupId: GROUP.a, sessionKey: "w04", day: "Mon 9 Nov", said: false, told: false });
    assert.equal((await say(GROUP.b)).status, 404);
    assert.equal((await say(GROUP.a)).status, 200);
    assert.deepEqual(toldTo(), [emailOf("amelia")]);
  });
});

// ===========================================================================
// 6 and 9. When a pick closes, and This week on the run home
// ===========================================================================

describe("6 and 9. a pick closes, and This week's work is due, by that week's group's session", () => {
  /** Weeks 4 and 5 written as blocks; Monday 9 November, 8:30pm: Group A's week 4 has met, Group B's has not. */
  function blockWeeks() {
    world.db.seed(`courseRuns/${RUN}/weeks/w04`, syntheticWeekDoc({ weekNumber: 4 }));
    world.db.seed(`courseRuns/${RUN}/weeks/w05`, syntheticWeekDoc({ weekNumber: 5 }));
    at("2026-11-09T20:30:00Z");
  }
  /** Chloe picks a pack in week 4's Choose one picked by each person. */
  const pick = () => call("chloe", picksRoute.PUT, { runId: RUN, blockId: "co-2" }, { body: { weekId: "w04", packId: "pk-4" } });
  /** Week 4's and 5's This week as the run home has it: whether the pick is open, and the day the first task is due. */
  async function home() {
    const answer = await call("chloe", overview.GET, { runId: RUN });
    assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
    const week = (n) => answer.body.weeks.find((entry) => entry.weekNumber === n);
    return [4, 5].map((n) => `w0${n} ${week(n).picks.open ? "open" : "shut"} ${week(n).thisWeek.rows[0].due.dateKey}`);
  }

  test("NEXT: week 4 is Group A's Monday, which has met: the pick is shut and the work was due on Monday", async () => {
    blockWeeks();
    moveChloe(NEXT);
    assert.deepEqual(await home(), ["w04 shut 2026-11-09", "w05 open 2026-11-16"]);
    const shut = await pick();
    assert.equal(shut.status, 409);
    assert.equal(shut.body.error, "Your session has started, so your choice stays as it is.");
  });

  test("AHEAD: week 4 is Group B's Tuesday, still to come: the pick is open and the work is due on Tuesday", async () => {
    blockWeeks();
    moveChloe(AHEAD);
    assert.deepEqual(await home(), ["w04 open 2026-11-10", "w05 open 2026-11-16"]);
    const picked = await pick();
    assert.equal(picked.status, 200, JSON.stringify(picked.body));
  });

  test("NONE: Group A's Monday every week, as before", async () => {
    blockWeeks();
    moveChloe(null);
    assert.deepEqual(await home(), ["w04 shut 2026-11-09", "w05 open 2026-11-16"]);
    assert.equal((await pick()).status, 409);
  });
});

// ===========================================================================
// 7. When a sealed prediction opens
// ===========================================================================

describe("7. a sealed prediction opens after the session before its week, of the group they were in that week", () => {
  /** Weeks 4 and 5 published; Sunday 1 November, before week 3 has met anywhere. */
  async function waitsOn() {
    for (const n of [4, 5]) world.db.poke(`courseRuns/${RUN}/weeks/w0${n}`, { published: true });
    at("2026-11-01T12:00:00Z");
    const answer = await predictionsTakerOf(world.db, sessionOf("chloe"), RUN);
    assert.equal(answer.ok, true);
    const out = [];
    for (const n of [4, 5]) {
      const opening = await cardOpenTo(world.db, answer.taker, n, new Date());
      assert.equal(opening.open, false);
      out.push(`w0${n} after ${opening.after.dateKey}`);
    }
    return out;
  }

  test("NEXT: week 4's card waits on Group B's week 3 Tuesday, week 5's on Group A's week 4 Monday", async () => {
    moveChloe(NEXT);
    assert.deepEqual(await waitsOn(), ["w04 after 2026-11-03", "w05 after 2026-11-09"]);
  });

  test("AHEAD: week 5's card waits on Group B's week 4 Tuesday", async () => {
    moveChloe(AHEAD);
    assert.deepEqual(await waitsOn(), ["w04 after 2026-11-03", "w05 after 2026-11-10"]);
  });

  test("NONE: Group A's Mondays, as before, and as for somebody always in Group A", async () => {
    moveChloe(null);
    assert.deepEqual(await waitsOn(), ["w04 after 2026-11-02", "w05 after 2026-11-09"]);
    const ana = await predictionsTakerOf(world.db, sessionOf("ana"), RUN);
    assert.equal((await cardOpenTo(world.db, ana.taker, 4, new Date())).after.dateKey, "2026-11-02");
  });
});

// ===========================================================================
// 8. A new regular time's take-backs
// ===========================================================================

describe("8. a new regular time takes back ticks only for the weeks somebody is in THAT group", () => {
  /**
   * Chloe answered Group A's time with "Most weeks, not all", ticking weeks 4
   * and 5, and both of Group A's registers say so; then Group A moves to
   * Wednesdays from week 4.
   */
  async function newTime() {
    world.db.poke(CHLOE, {
      timeAnswer: {
        kind: "mostWeeks",
        reason: "",
        alternatives: "",
        sessionKeys: ["w04", "w05"],
        forGroupId: GROUP.a,
        at: new Date("2026-11-01T10:00:00Z"),
      },
    });
    for (const week of [4, 5]) {
      world.db.seed(registerPath(GROUP.a, week), {
        runId: RUN,
        groupId: GROUP.a,
        weekNumber: week,
        occurrence: 1,
        records: { chloe: "excused" },
        excusedInAdvance: { chloe: new Date("2026-11-01T10:00:00Z") },
        setBy: { chloe: { byUid: "chloe", at: new Date("2026-11-01T10:00:00Z"), how: "self" } },
      });
    }
    const applied = await applyRegularChange(world.db, {
      run: runOf(),
      groupRef: world.db.collection("courseGroups").doc(GROUP.a),
      press: {
        fromWeek: 4,
        weekday: 3,
        startTimeLocal: "18:00",
        durationMinutes: 120,
        room: "Room A13",
        roomToBeConfirmed: false,
        campus: null,
        reason: "",
        tell: false,
        emailCount: 0,
        preview: false,
      },
      actor: sessionOf("zach"),
      now: new Date(),
      emailed: 0,
    });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    return {
      takenBack: applied.applied.takenBack,
      lines: [4, 5].map((week) => `w0${week} ${read(registerPath(GROUP.a, week)).records?.chloe ?? "none"}`),
    };
  }

  test("NEXT: weeks 4 and 5 are Group A's, so both ticks are taken back", async () => {
    moveChloe(NEXT);
    assert.deepEqual(await newTime(), { takenBack: 2, lines: ["w04 none", "w05 none"] });
  });

  test("AHEAD: week 4 is Group B's, so only week 5's tick is taken back", async () => {
    moveChloe(AHEAD);
    assert.deepEqual(await newTime(), { takenBack: 1, lines: ["w04 excused", "w05 none"] });
  });

  test("NONE: both, as before", async () => {
    moveChloe(null);
    assert.deepEqual(await newTime(), { takenBack: 2, lines: ["w04 none", "w05 none"] });
  });
});

// ===========================================================================
// The group's "Week N is open" email, and what a register's button says of it
// ===========================================================================

describe("the group's email about a session reaches the people in the group for that session's week", () => {
  /** Week 4 published; Group B's week 3 register finished, so its button would send week 4's email. */
  function weekFourReady() {
    world.db.poke(`courseRuns/${RUN}/weeks/w04`, { published: true });
  }
  async function pressSays(groupId) {
    const run = runOf();
    const group = groupsOf().find((each) => each.id === groupId);
    const lines = await readPushEmails(world.db, {
      run,
      group,
      sessions: resolveSessions(run, group),
      sessionKeys: ["w03"],
      scheduled: false,
      config: DEFAULT_COURSES_CONFIG,
      appUrl: "https://naisi.invalid",
    });
    const line = lines.w03;
    return `${nameOf(groupId)} w0${line.weekNumber} ${line.emails} of ${line.people}`;
  }
  async function sent(groupId) {
    world.mail.length = 0;
    const run = runOf();
    const group = groupsOf().find((each) => each.id === groupId);
    const session = resolveSessions(run, group).find((each) => each.sessionKey === "w04");
    const outcome = await sendNextWeekEmail({
      db: world.db,
      run,
      group,
      session,
      pushedSessionKey: "w03",
      by: { kind: "push", uid: "zach" },
      force: false,
      whole: false,
      config: DEFAULT_COURSES_CONFIG,
      now: new Date(),
      appUrl: "https://naisi.invalid",
    });
    assert.equal(outcome.held, null, JSON.stringify(outcome));
    return world.mail.map((message) => message.to).sort();
  }

  test("NEXT: week 4's email from Group A reaches her, Group B's does not", async () => {
    weekFourReady();
    moveChloe(NEXT);
    assert.deepEqual([await pressSays(GROUP.b), await pressSays(GROUP.a)], ["B w04 2 of 2", "A w04 2 of 2"]);
    assert.deepEqual(await sent(GROUP.a), [emailOf("ana"), emailOf("chloe")].sort());
    assert.deepEqual(await sent(GROUP.b), [emailOf("amara"), emailOf("farah")].sort());
  });

  test("AHEAD: week 4's email from Group B reaches her, Group A's does not", async () => {
    weekFourReady();
    moveChloe(AHEAD);
    assert.deepEqual([await pressSays(GROUP.b), await pressSays(GROUP.a)], ["B w04 3 of 3", "A w04 1 of 1"]);
    assert.deepEqual(await sent(GROUP.b), [emailOf("amara"), emailOf("chloe"), emailOf("farah")].sort());
    assert.deepEqual(await sent(GROUP.a), [emailOf("ana")]);
  });

  test("NONE: the people in each group now, as before", async () => {
    weekFourReady();
    moveChloe(null);
    assert.deepEqual([await pressSays(GROUP.b), await pressSays(GROUP.a)], ["B w04 2 of 2", "A w04 2 of 2"]);
    assert.deepEqual(await sent(GROUP.a), [emailOf("ana"), emailOf("chloe")].sort());
    assert.deepEqual(await sent(GROUP.b), [emailOf("amara"), emailOf("farah")].sort());
  });
});
