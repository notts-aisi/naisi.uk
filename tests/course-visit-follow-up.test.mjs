/**
 * A ONE-WEEK VISIT, WHAT A SECOND READING FOUND: the person's own cancel says
 * nothing about a run that is not theirs; one deadline for the card and the
 * route; the card's "are told" names exactly who the send emails; the too-late
 * line names the group whose session has started; the card for a visit
 * further ahead goes below the next session's ticket; the person's week page
 * names the host's facilitators who may read the visit's week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Group B meets on Tuesdays at 6pm
 * (Rahul and Sofia), tonight for week 3; Group C on Wednesdays at 1pm (Tom),
 * tomorrow for week 3; Group A on Thursdays at 6pm (Sofia); Group D on
 * Mondays at 6pm (Grace). Chloe is in Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitFollowUp");
const { world, call, routes } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const approveRoute = await w.courseRoute("requests", "[requestId]", "excused", "approve");
const words = await w.loadTs(join("lib", "courses", "visit", "words.ts"));
const view = await w.loadTs(join("lib", "courses", "visit", "view.ts"));
const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { loadGroupPage } = await w.loadTs(join("lib", "courses", "groupPage", "load.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { excusedFor } = await w.loadTs(join("lib", "courses", "excused", "own.ts"));
const { weeksToChoose } = await w.loadTs(join("lib", "courses", "excused", "card.ts"));
const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
const { loadRegisterMembers } = await w.loadTs(join("lib", "courses", "registerAccess.ts"));
const allocateRoute = await w.courseRoute("runs", "[runId]", "allocate");
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");
const { resolveNoticeAudience } = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
/** A press made the way the page makes one: the preview's count and full flag sent back. */
async function arrange(uid, weekNumber, hostGroupId) {
  const shown = await visit("zach", uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}
const cancel = (who, weekNumber, runId = RUN.agi) => call(who, cancelRoute.POST, { runId }, { body: { weekNumber }, course: true });
const overview = async (who = "chloe") => (await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true })).body;

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
// 1. The person's own cancel: their own place first, one 404 for the rest
// ---------------------------------------------------------------------------

describe("1. the person's own cancel never says anything about a run that is not theirs", () => {
  const NOT_FOUND = [404, { error: "There is no visit that week to call off.", kind: "no-visit" }];
  const said = (answer) => [answer.status, answer.body];

  test("a run they hold no place on, a run that does not exist, a name no run could have: the same 404", async () => {
    assert.deepEqual(said(await cancel("chloe", 3, RUN.other)), NOT_FOUND);
    assert.deepEqual(said(await cancel("chloe", 3, "no-such-run")), NOT_FOUND);
    assert.deepEqual(said(await cancel("chloe", 3, "a/b")), NOT_FOUND);
  });

  test("that other run archived, or being destroyed: still the same 404", async () => {
    world.db.poke(`courseRuns/${RUN.other}`, { archived: true });
    assert.deepEqual(said(await cancel("chloe", 3, RUN.other)), NOT_FOUND);
    world.db.poke(`courseRuns/${RUN.other}`, { archived: false, destroying: true });
    assert.deepEqual(said(await cancel("chloe", 3, RUN.other)), NOT_FOUND);
  });

  test("their own run with no visit, archived, or down to one group: the same 404, nothing written", async () => {
    assert.deepEqual(said(await cancel("chloe", 3)), NOT_FOUND);
    await arrange("chloe", 4, A);
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: true });
    assert.deepEqual(said(await cancel("chloe", 4)), NOT_FOUND);
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: false });
    for (const groupId of [C, D, B]) world.db.poke(`courseGroups/${groupId}`, { archived: true });
    assert.deepEqual(said(await cancel("chloe", 4)), NOT_FOUND);
    assert.equal(seat("chloe").visits.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2. One deadline: their own session that week called off is no session
// ---------------------------------------------------------------------------

describe("2. the card and the route agree on until when a visit can be cancelled", () => {
  async function callOffGroupBTonight() {
    const answer = await call("rahul", changeRoute.POST, { groupId: B }, {
      body: { week: 3, dateKey: "2026-11-17", kind: "cancel", reason: "Rahul is away.", tell: false },
      course: true,
    });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  }

  test("Group B's session tonight called off: after 6pm the card still offers Cancel until Group C's 1pm, and the press goes through", async () => {
    await arrange("chloe", 3, C);
    await callOffGroupBTonight();
    at("2026-11-17T18:30:00Z");
    const card = (await overview()).visits[0];
    assert.ok(card.cancel, "the card offers it");
    assert.match(card.cancel.until, /^You can cancel until Wed 18 Nov, 1pm\./);
    assert.equal(card.firstName, "Group C");
    const answer = await cancel("chloe", 3);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(seat("chloe").visits, undefined);
  });

  test("with Group B's session standing: the card's deadline is tonight's 6pm, and so is the route's", async () => {
    await arrange("chloe", 3, C);
    const card = (await overview()).visits[0];
    assert.match(card.cancel.until, /^You can cancel until Tue 17 Nov, 6pm\./);
    at("2026-11-17T18:01:00Z");
    assert.equal((await overview()).visits[0].cancel, null);
    assert.equal((await cancel("chloe", 3)).status, 409);
  });
});

// ---------------------------------------------------------------------------
// 3. Too late names the group whose session has started
// ---------------------------------------------------------------------------

describe("3. the too-late line names the group whose session has started", () => {
  test("Group B's session (tonight) is the earlier of the two: the line and the route's sentence name Group B", async () => {
    await arrange("chloe", 3, C);
    const card = (await overview()).visits[0];
    assert.equal(card.hostName, "Group C");
    assert.equal(card.firstName, "Group B");
    at("2026-11-17T18:01:00Z");
    const late = await cancel("chloe", 3);
    assert.deepEqual([late.status, late.body.kind], [409, "too-late"]);
    assert.equal(late.body.error, "The visit can no longer be cancelled: Group B’s session has started.");
    assert.equal(
      words.cancelOutcomeLine({ status: late.status, kind: late.body.kind }, card.hostName, card.firstName),
      "Group B’s session has started, so this visit can’t be cancelled now. In an emergency, contact an admin.",
    );
  });

  test("the host's session is the earlier: the line names the host, as before", async () => {
    // Group D meets on Mondays: week 4 is Mon 23 Nov, before Group B's Tue 24 Nov.
    await arrange("chloe", 4, D);
    const card = (await overview()).visits[0];
    assert.equal(card.firstName, card.hostName);
  });
});

// ---------------------------------------------------------------------------
// 4. "... are told" names exactly who the send emails
// ---------------------------------------------------------------------------

describe("4. the card's \"are told\" names exactly the people the person's own cancel emails", () => {
  test("Tom with no address on the site: not named on the card, and not emailed", async () => {
    await arrange("chloe", 3, C);
    world.db.poke("users/tom", { email: "" });
    const card = (await overview()).visits[0];
    assert.match(card.cancel.until, / Rahul and Sofia are told\.$/);
    world.mail.length = 0;
    assert.equal((await cancel("chloe", 3)).status, 200);
    assert.deepEqual(world.mail.map((message) => message.to).sort(), ["rahul@example.com", "sofia@example.com"]);
  });

  test("with every address: the three of them, their own group's first, and the same three emailed", async () => {
    await arrange("chloe", 3, C);
    const card = (await overview()).visits[0];
    assert.match(card.cancel.until, / Rahul, Sofia and Tom are told\.$/);
    world.mail.length = 0;
    assert.equal((await cancel("chloe", 3)).status, 200);
    assert.equal(world.mail.length, 3);
  });
});

// ---------------------------------------------------------------------------
// 5. A visit further ahead is listed below the next session's ticket
// ---------------------------------------------------------------------------

describe("5. where the visit cards go around the next session's ticket", () => {
  const visitOn = (dateKey, startTimeLocal) => ({ dateKey, startTimeLocal });
  test("a visit that is the next session goes above the ticket; one further ahead below it", () => {
    const tonight = { dateKey: "2026-11-17", startTimeLocal: "18:00" };
    const tomorrow = visitOn("2026-11-18", "13:00");
    const earlier = visitOn("2026-11-17", "13:00");
    assert.deepEqual(view.visitsAroundTicket([tomorrow], tonight), { first: [], later: [tomorrow] });
    assert.deepEqual(view.visitsAroundTicket([earlier, tomorrow], tonight), { first: [earlier], later: [tomorrow] });
    assert.deepEqual(view.visitsAroundTicket([tomorrow], null), { first: [tomorrow], later: [] }, "no ticket: the visit is the next session");
  });
});

// ---------------------------------------------------------------------------
// 6. Who can read their work, on their week page
// ---------------------------------------------------------------------------

describe("6. the person's week page names the host's facilitators who may read the visit's week", () => {
  test("the overview names Tom for week 3 alone, by the reading rule; none without a visit", async () => {
    assert.equal("visitReaders" in (await overview()), false);
    await arrange("chloe", 3, C);
    assert.deepEqual((await overview()).visitReaders, [{ weekNumber: 3, firstNames: ["Tom"], names: ["Tom"] }]);
    // Tom without standing: the reading rule says no, and so does the sentence.
    world.db.poke("users/tom", { role: "rejected" });
    assert.deepEqual((await overview()).visitReaders, [{ weekNumber: 3, firstNames: [], names: [] }]);
  });

  test("the written answer's existing sentence names them as readers, never as giving feedback", () => {
    const readers = { kind: "facilitators", names: ["Rahul", "Sofia"], alsoRead: ["Tom"] };
    assert.equal(
      weekWords.answerReadersWords(readers, "Claudia"),
      "Once you send it, or once your session has started, Rahul, Sofia, Tom, Claudia and admins can read your written answer.",
    );
    assert.equal(
      weekWords.answerReadersWords({ kind: "facilitators", names: ["Rahul", "Sofia"] }, "Claudia"),
      "Once you send it, or once your session has started, Rahul, Sofia, Claudia and admins can read your written answer.",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. A group's page reads the run's places for visitors only when one came
// ---------------------------------------------------------------------------

describe("7. a group's page reads every active place of the run only when a visit to that group was ever arranged", () => {
  /** The filters of every query of places a load runs, by field name. */
  async function placeQueriesOf(groupId) {
    const seen = [];
    const db = world.courseDb;
    const original = db.collection;
    const wrap = (query, fields) =>
      new Proxy(query, {
        get(target, prop) {
          if (prop === "where") return (field, op, value) => wrap(target.where(field, op, value), [...fields, field]);
          if (prop === "get") return () => (seen.push(fields.join(",")), target.get());
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    db.collection = (path) => (path === "courseEnrolments" ? wrap(original.call(db, path), []) : original.call(db, path));
    try {
      const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
      const group = normalizeCourseGroup(groupId, read(`courseGroups/${groupId}`));
      await loadGroupPage(db, { run, group, viewer: "admin", viewerUid: "zach", now: new Date(), week: 4 });
    } finally {
      db.collection = original;
    }
    return seen;
  }

  test("with no visit to Group A ever: no read of the run's active places; once one is arranged, one", async () => {
    assert.equal((await placeQueriesOf(A)).includes("runId,status"), false);
    await arrange("chloe", 4, A);
    assert.equal((await placeQueriesOf(A)).filter((fields) => fields === "runId,status").length, 1);
    // Group B, Chloe's own group, was never visited: still none.
    assert.equal((await placeQueriesOf(B)).includes("runId,status"), false);
  });
});

// ---------------------------------------------------------------------------
// 8. A request to be excused from the week
// ---------------------------------------------------------------------------

describe("8. arranging a visit for a week the person asked to be excused from", () => {
  async function askForWeekFour() {
    const asked = await call("chloe", askRoute.POST, { groupId: B }, {
      body: { sessionKeys: ["w04"], reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    return world.db.paths().find((path) => path.startsWith("courseRequests/")).split("/")[1];
  }

  test("a request still waiting: refused in one sentence, nothing written", async () => {
    await askForWeekFour();
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.deepEqual([shown.status, shown.body.error], [409, "Chloe is waiting to hear about being excused from week 4. Decide that request first, on the Requests page."]);
    const pressed = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: 3, overLimit: false });
    assert.equal(pressed.status, 409);
    assert.equal(seat("chloe").visits, undefined);
  });

  test("once it is approved: the visit can still be arranged, and the excusal stays on her own group's register; a request for another week does not stand in the way", async () => {
    const requestId = await askForWeekFour();
    assert.equal((await visit("zach", "chloe", { weekNumber: 5, hostGroupId: A, preview: true })).status, 200);
    const approved = await call("zach", approveRoute.POST, { requestId }, { body: { sessionKey: "w04" }, course: true });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(read(registerPath(B, 4)).records.chloe, "excused");
    await arrange("chloe", 4, A);
    assert.equal(enrolments.groupForWeek(seat("chloe"), 4), A);
    assert.equal(read(registerPath(B, 4)).records.chloe, "excused", "her excusal stays where it is");
  });
});

// ---------------------------------------------------------------------------
// 9. A durable limit on the emails of arranging and calling off
// ---------------------------------------------------------------------------

describe("9. a durable limit on the emails of arranging and calling off", () => {
  const full = (key, count) => world.db.seed(`courseNudges/emailrate__${key}`, { kind: "staff-email-throttle", key, windowStartAt: new Date(), count, updatedAt: new Date() });
  const everything = () => JSON.stringify(world.db.paths().filter((path) => !path.startsWith("courseNudges/")).sort().map((path) => [path, read(path)]));
  const PERSON = "This person’s visits have been arranged or called off 10 times in the last day. Nothing was changed or sent. Try again tomorrow.";
  const PRESSER = "You have arranged or called off 40 visits in the last day. Nothing was changed or sent. Try again tomorrow.";

  test("ten presses about one person in a day: the preview says so, and the eleventh is refused before anything is written or sent", async () => {
    full(`visitperson__${RUN.agi}__chloe`, 10);
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.equal(shown.status, 200);
    assert.equal(shown.body.preview.limit, PERSON);
    const before = everything();
    world.mail.length = 0;
    const pressed = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.body.preview.emails, overLimit: false });
    assert.deepEqual([pressed.status, pressed.body.error], [429, PERSON]);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("forty presses by one presser in a day: refused, whoever the person is", async () => {
    full("visitpresser__zach", 40);
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.equal(shown.body.preview.limit, PRESSER);
    const pressed = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.body.preview.emails, overLimit: false });
    assert.deepEqual([pressed.status, pressed.body.error], [429, PRESSER]);
    // Claudia, another presser, is not held by Zach's count.
    const lead = await visit("claudia", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.equal(lead.body.preview.limit, null);
  });

  test("staff's call-off is held to the same counters, and under them every staff press counts once; the person's own cancel is never counted and never refused for a limit", async () => {
    await arrange("chloe", 4, A);
    assert.equal(read(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`).count, 1);
    full(`visitperson__${RUN.agi}__chloe`, 10);
    const staff = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: 3 });
    assert.deepEqual([staff.status, staff.body.error], [429, PERSON]);
    assert.equal(seat("chloe").visits.length, 1);
    const own = await cancel("chloe", 4);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(read(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`).count, 10);
  });

  test("with no counter: no limit said, as before", async () => {
    const shown = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, preview: true });
    assert.equal(shown.body.preview.limit, null);
  });
});

// ---------------------------------------------------------------------------
// 10. Asking to be excused from the visit's week asks about the host's session
// ---------------------------------------------------------------------------

describe("10. asking to be excused from a visit's week asks the host, and an approval leaves the visit standing", () => {
  const view = async () => {
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const groups = [A, B, C, D].map((id) => normalizeCourseGroup(id, read(`courseGroups/${id}`)));
    return excusedFor(world.courseDb, { user: w.sessionOf("chloe"), run, enrolment: seat("chloe"), groups, now: new Date() });
  };

  test("the view offers the host's week 4 session, asked of Group A, with the form's line for a visit week", async () => {
    await arrange("chloe", 4, A);
    const own = await view();
    const week4 = own.sessions.find((session) => session.weekNumber === 4);
    assert.deepEqual(week4.ask, { open: true, when: "before" });
    assert.deepEqual(week4.visit, { groupId: A, line: "Week 4 · Thu 19 Nov, at Group A" });
    // Asked from the visit's card, week 4 alone: never beside a week of Group B's, which is asked of Group B.
    assert.deepEqual(weeksToChoose(own, week4.sessionKey).map((each) => each.weekNumber), [4]);
    const week5 = own.sessions.find((session) => session.weekNumber === 5);
    assert.equal(weeksToChoose(own, week5.sessionKey).some((each) => each.weekNumber === 4), false);
  });

  test("with no visit: week 4 is Group B's, asked of Group B, with no line of its own", async () => {
    const week4 = (await view()).sessions.find((session) => session.weekNumber === 4);
    assert.equal(week4.visit, undefined);
  });

  test("the request is filed against Group A; its approval is written on Group A's register, and the visit stands", async () => {
    await arrange("chloe", 4, A);
    const asked = await call("chloe", askRoute.POST, { groupId: A }, {
      body: { sessionKeys: ["w04"], reason: "A family wedding that weekend.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const requestPath = world.db.paths().find((path) => path.startsWith("courseRequests/"));
    assert.equal(read(requestPath).groupId, A);
    const approved = await call("zach", approveRoute.POST, { requestId: requestPath.split("/")[1] }, { body: { sessionKey: "w04" }, course: true });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(read(registerPath(A, 4)).records.chloe, "excused");
    assert.equal(read(registerPath(B, 4))?.records?.chloe, undefined);
    assert.equal(seat("chloe").visits.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 11. What else a visit meets: the host's session called off, the host
//     archived, the person leaving, and the allocation board
// ---------------------------------------------------------------------------

describe("11. a host session called off or archived, the person leaving, and the board, with a visit ahead", () => {
  const facts = async () => {
    const read_ = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, "chloe", "ahead", new Date());
    assert.equal(read_.ok, true, JSON.stringify(read_));
    return read_.facts;
  };

  test("Group A's week 4 session called off: the group's notice audience holds her, her card goes, and staff see it is not happening and can still call the visit off", async () => {
    await arrange("chloe", 4, A);
    // The group's notice about its session reaches her through the notice
    // audience for that week (course-visit-readers.test.mjs, section 3).
    const audience = await resolveNoticeAudience(world.courseDb, RUN.agi, { logTag: "test", channelCategory: "courses" }, { groupId: A, weekNumber: 4 });
    assert.ok(audience.members.some((member) => member.uid === "chloe"));
    const off = await call("sofia", changeRoute.POST, { groupId: A }, {
      body: { week: 4, dateKey: "2026-11-19", kind: "cancel", reason: "Sofia is away.", tell: false },
      course: true,
    });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal((await overview()).visits, undefined, "no card for a session that is not happening");
    const standing = standingVisits(await facts(), "zach", new Date());
    assert.equal(standing[0].gone, "Group A’s session that week is no longer happening.");
    assert.equal(standing[0].open, true);
    const called = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: standing[0].emails });
    assert.equal(called.status, 200, JSON.stringify(called.body));
    assert.equal(seat("chloe").visits, undefined);
  });

  test("Group A archived: staff see it is not happening and can call the visit off; her own cancel reads it as none", async () => {
    await arrange("chloe", 4, A);
    world.db.poke(`courseGroups/${A}`, { archived: true });
    const standing = standingVisits(await facts(), "zach", new Date());
    assert.equal(standing[0].gone, "Group A’s session that week is no longer happening.");
    assert.deepEqual([(await cancel("chloe", 4)).status], [404]);
    assert.equal((await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: standing[0].emails })).status, 200);
  });

  test("she is removed from the run with a visit ahead: the visit goes, and she is off Group A's register and page for that week", async () => {
    await arrange("chloe", 4, A);
    const removed = await call("zach", removeRoute.POST, { runId: RUN.agi, uid: "chloe" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(read(seatPath("chloe")).visits, undefined);
    const rows = (await loadRegisterMembers(world.courseDb, RUN.agi, A, { isAdmin: true }, 4)).members.map((row) => row.uid);
    assert.equal(rows.includes("chloe"), false);
    const page = await loadGroupPage(world.courseDb, { run: normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`)), group: normalizeCourseGroup(A, read(`courseGroups/${A}`)), viewer: "admin", viewerUid: "zach", now: new Date(), week: 4 });
    assert.equal(JSON.stringify(page.weeks).includes("chloe"), false);
  });

  test("the allocation board: a move to another group keeps the visit; a move into the host drops it", async () => {
    await arrange("chloe", 4, A);
    const toC = await call("zach", allocateRoute.POST, { runId: RUN.agi }, { body: { placements: [{ uid: "chloe", groupId: C }] }, course: true });
    assert.equal(toC.status, 200, JSON.stringify(toC.body));
    assert.deepEqual(seat("chloe").visits.map((each) => [each.weekNumber, each.groupId]), [[4, A]]);
    const toA = await call("zach", allocateRoute.POST, { runId: RUN.agi }, { body: { placements: [{ uid: "chloe", groupId: A }] }, course: true });
    assert.equal(toA.status, 200, JSON.stringify(toA.body));
    assert.equal(seat("chloe").visits, undefined);
  });
});
