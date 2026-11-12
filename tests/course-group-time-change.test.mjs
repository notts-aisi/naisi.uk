/**
 * One way to change a group's time: one week (put right after it met, its own
 * length and campus, a room still to book, put back as usual), a new regular
 * time from a week onwards, a room the group is told about, and the group's
 * history every one of them writes.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/session/change
 *   POST /api/courses/groups/[groupId]/session/regular
 *   PUT  /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room
 *
 * ## What this guards
 *
 *  1. A SESSION WHOSE TIME HAS PASSED is put right while its register has not
 *     been taken: moved to when it met (which may be in the past), moved to a
 *     time to come, cancelled. Held online and put back as usual are refused,
 *     and so is anything once the register was taken (finished, marked, or
 *     said not to have happened). A register holding only words in advance
 *     is not taken, and its `sessionAt` follows the session.
 *  2. A WEEK'S OWN LENGTH, CAMPUS AND A ROOM STILL TO BOOK.
 *  3. PUT IT BACK AS USUAL only for a real one-week change, keeping the
 *     week's own link and notes; a pinned week has nothing to put back.
 *  4. THE PREVIEW changes nothing and says who would be told.
 *  5. A NEW REGULAR TIME pins every earlier week to when it met, re-dates the
 *     rest, keeps a later week's own change, asks the time question again,
 *     takes back "Most weeks, not all" ticks on the old time and nothing else,
 *     and is the people's who run the programme only. Earlier weeks resolve
 *     exactly as they did, which is what keeps every record right if this is
 *     ever reverted.
 *  6. THE NOTICES reach the group's told people and its facilitators, never
 *     the presser, with the count on the button checked first, and never a
 *     meeting link.
 *  7. HISTORY: every press writes one row, with what changed, what it was,
 *     the reason and how many were emailed.
 *  8. NOTHING MOVES A SESSION THAT MET, through any door: a push back that
 *     would move a later week whose register was taken is refused in the
 *     press and in its preview, and so is a group's own pace; what moves only
 *     weeks nobody took a register for goes through.
 *  9. A SECOND PRESS of a cancel or of holding it online (the first went
 *     through, its answer lost) changes nothing and tells nobody again.
 * 10. THE PLAN OF A NEW REGULAR TIME (`planRegularChange`), as arithmetic: a
 *     week that met is pinned to its register's start, not the slot's; a
 *     week's own partial override wins; weeks either side of a clock change,
 *     a group's own plan, a cancelled earlier week and the cap.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { AGI, AWAY, B, LINK, ROUND, RUN, TUE_24, makeSessionsWorld } from "./lib/sessionsWorld.mjs";

const w = await makeSessionsWorld("__groupTimeChange");
const { world, ask, group, sessionsOf, reset, at, loadTs, everything } = w;
const regular = await w.courseRoute("groups", "[groupId]", "session", "regular");
const pace = await w.courseRoute("groups", "[groupId]", "pace");
const plans = await loadTs("lib/courses/regularTime/model.ts");
const regularWords = await loadTs("lib/courses/regularTime/words.ts");
const roomRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "room");
const timeAnswer = await loadTs("lib/courses/timeAnswer/model.ts");
const groupsLib = await loadTs("lib/firestore/courseGroups.ts");
const words = await loadTs("lib/courses/sessionChange/words.ts");

beforeEach(() => reset());

const silently = (body) => ({ reason: AWAY, ...body, tell: false });
const weekOf = (n, groupId = B) => sessionsOf(groupId).find((s) => s.weekNumber === n && s.occurrence === 1);
const startOf = (n) => w.sessionsLib.sessionInstants(weekOf(n)).startsAt?.toISOString() ?? null;
const registerPath = (n) => `courseAttendance/${RUN.agi}__${B}__w${String(n).padStart(2, "0")}`;
const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => !kind || row.kind === kind);
const askRegular = (who, body, options = {}) =>
  w.call(who, regular.POST, { groupId: B }, { body, course: true, ...options });

/** Week 3 (Tue 17 Nov, 6pm) has passed at `NOW`; nobody took its register. */
const WEEK3 = { week: 3, dateKey: "2026-11-17" };

// ---------------------------------------------------------------------------
// 1. A session whose time has passed
// ---------------------------------------------------------------------------

describe("1. a session whose time has passed, and nobody took its register", () => {
  test("it met at another time: recorded in the past, nobody told, and the history keeps why", async () => {
    const before = startOf(3);
    const response = await ask.change(
      "claudia",
      B,
      silently({
        ...WEEK3,
        kind: "move",
        metAtAnotherTime: true,
        reason: "Rahul’s train was cancelled, so the group met the next morning.",
        move: { dateKey: "2026-11-18", time: "10am", room: "George Green A04" },
      }),
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.update, null, "nobody is told unless the press asks");
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionOverrides.w03, {
      weekday: 3,
      startTimeLocal: "10:00",
      location: "George Green A04",
    });
    assert.notEqual(startOf(3), before);
    assert.equal(startOf(3), "2026-11-18T10:00:00.000Z");
    const [row] = auditRows("session-put-right");
    assert.equal(row.weekId, "w03");
    assert.equal(row.emailed, 0);
    assert.equal(row.reason, "Rahul’s train was cancelled, so the group met the next morning.");
    assert.equal(
      row.detail,
      "Recorded week 3 as met on Wed 18 Nov, 10am, George Green A04. Before: Tue 17 Nov, 6pm, Hallward B12. " +
        "Reason: Rahul’s train was cancelled, so the group met the next morning. Nobody was emailed.",
    );
    assert.deepEqual([row.before.dateKey, row.before.startTimeLocal, row.after.dateKey, row.after.startTimeLocal], [
      "2026-11-17",
      "18:00",
      "2026-11-18",
      "10:00",
    ]);
  });

  test("it met at another time refuses a time still to come, and a session still to come", async () => {
    at("2026-11-17T19:00:00Z");
    const before = everything();
    const later = await ask.change(
      "claudia",
      B,
      silently({ ...WEEK3, kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-18", time: "10am", room: "Hallward B12" } }),
    );
    assert.deepEqual([later.status, later.body.error], [400, words.REFUSAL.metInFuture]);
    const ahead = await ask.change(
      "claudia",
      B,
      silently({ week: 4, dateKey: TUE_24, kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-23", time: "6pm", room: "Hallward B12" } }),
    );
    assert.deepEqual([ahead.status, ahead.body.error], [400, words.REFUSAL.notMetYet]);
    assert.equal(everything(), before);
  });

  test("it hasn't met yet: moved to a time to come, as a move", async () => {
    at("2026-11-17T19:00:00Z");
    const response = await ask.change(
      "rahul",
      B,
      silently({ ...WEEK3, kind: "move", move: { dateKey: "2026-11-18", time: "6pm", room: "Hallward B12" } }),
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(auditRows("session-moved").length, 1);
  });

  test("cancelled after the fact, keeping pace", async () => {
    const response = await ask.change("claudia", B, silently({ ...WEEK3, kind: "cancel" }));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(weekOf(3).cancelled, true);
    assert.equal(auditRows("session-cancelled").length, 1);
  });

  test("held online and put back as usual are refused once its time has passed", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const before = everything();
    const online = await ask.change("claudia", B, silently({ ...WEEK3, kind: "online" }));
    assert.deepEqual([online.status, online.body.error], [409, words.REFUSAL.startedOnline]);
    const back = await ask.change("claudia", B, silently({ ...WEEK3, kind: "restore" }));
    assert.deepEqual([back.status, back.body.error], [409, words.REFUSAL.startedRestore]);
    assert.equal(everything(), before);
  });

  for (const [what, register] of [
    ["finished", { pushedAt: new Date("2026-11-17T21:00:00Z") }],
    ["marked", { markedByUid: "rahul", records: { amara: "present" } }],
    ["said not to have happened", { held: false }],
  ]) {
    test(`a register ${what} means it met: every kind is refused, and nothing is written`, async () => {
      world.db.seed(registerPath(3), { runId: RUN.agi, groupId: B, weekNumber: 3, ...register });
      const before = everything();
      for (const body of [
        { kind: "cancel" },
        { kind: "push" },
        { kind: "move", move: { dateKey: "2026-11-18", time: "10am", room: "Hallward B12" } },
        { kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-18", time: "10am", room: "Hallward B12" } },
      ]) {
        const response = await ask.change("zach", B, silently({ ...WEEK3, ...body }));
        assert.deepEqual([response.status, response.body.error], [409, words.REFUSAL.met], JSON.stringify(body));
      }
      assert.equal(everything(), before);
    });
  }

  test("a register holding only words in advance is not taken, and its stored start follows the session", async () => {
    world.db.seed(registerPath(3), {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      occurrence: 1,
      records: { amara: "excused" },
      excusedInAdvance: { amara: new Date("2026-11-10T09:00:00Z") },
      onlineSaid: { ines: new Date("2026-11-10T09:00:00Z") },
      sessionAt: new Date("2026-11-17T18:00:00Z"),
    });
    const response = await ask.change(
      "claudia",
      B,
      silently({ ...WEEK3, kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-16", time: "5pm", room: "Hallward B12" } }),
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const register = world.db.read(registerPath(3));
    assert.equal(new Date(register.sessionAt).toISOString(), "2026-11-16T17:00:00.000Z");
    assert.deepEqual(register.records, { amara: "excused" }, "the words in advance stay");
  });

  test("a move keeps the week's seven days, in the refusal's own words", async () => {
    const response = await ask.change(
      "claudia",
      B,
      silently({ ...WEEK3, kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-19", time: "8am", room: "Hallward B12" } }),
    );
    assert.deepEqual([response.status, response.body.error], [400, "Choose a day in week 3, from Thu 12 to Wed 18 Nov."]);
  });
});

// ---------------------------------------------------------------------------
// 2. A week's own length, campus, and a room still to book
// ---------------------------------------------------------------------------

describe("2. a week's own length, campus, and a room still to book", () => {
  const MOVE = { week: 4, dateKey: TUE_24, kind: "move" };

  test("the length and the campus are the week's own, and the notice names the campus", async () => {
    const response = await ask.change("claudia", B, {
      ...MOVE,
      reason: AWAY,
      tell: true,
      emailCount: await w.changeEmailsFor(B, "claudia"),
      move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13", length: 90, campus: "jubilee" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionOverrides.w04, {
      weekday: 3,
      startTimeLocal: "19:00",
      location: "Portland A13",
      durationMinutes: 90,
      campus: "jubilee",
    });
    assert.equal(groupsLib.campusForWeek(group(), "w04"), "jubilee");
    assert.equal(groupsLib.campusForWeek(group(), "w05"), group().campus);
    assert.equal(weekOf(4).session.durationMinutes, 90);
    assert.equal(
      response.body.update.message.split("\n\n")[0],
      "Group B’s week 4 session moves, for this week only, to Wed 25 Nov, 7pm to 8:30pm, Portland A13 (Jubilee).",
    );
  });

  test("the same length and campus as now is no change", async () => {
    const response = await ask.change(
      "claudia",
      B,
      silently({ ...MOVE, move: { dateKey: TUE_24, time: "6pm", room: "Hallward B12", length: 120 } }),
    );
    assert.deepEqual([response.status, response.body.error], [400, words.REFUSAL.sameAsNow]);
  });

  test("a room still to book is an empty room, only when the press says so", async () => {
    const refused = await ask.change("claudia", B, silently({ ...MOVE, move: { dateKey: "2026-11-25", time: "7pm", room: "" } }));
    assert.deepEqual([refused.status, refused.body.error], [400, words.REFUSAL.room]);
    const both = await ask.change(
      "claudia",
      B,
      silently({ ...MOVE, move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13", roomToBeConfirmed: true } }),
    );
    assert.deepEqual([both.status, both.body.error], [400, words.REFUSAL.roomOrToBeConfirmed]);
    const response = await ask.change("claudia", B, {
      ...MOVE,
      reason: AWAY,
      tell: true,
      emailCount: await w.changeEmailsFor(B, "claudia"),
      move: { dateKey: "2026-11-25", time: "7pm", roomToBeConfirmed: true },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides.w04.location, "");
    assert.ok(response.body.update.message.includes(words.ROOM_TO_BE_CONFIRMED_LINE));
  });
});

// ---------------------------------------------------------------------------
// 3. Put it back as usual
// ---------------------------------------------------------------------------

describe("3. put it back as usual", () => {
  test("keeps the week's own link and notes, and takes away only what the change set", async () => {
    world.db.poke(`courseGroups/${B}`, { "sessionOverrides.w04": { meetingUrl: LINK, notes: "Bring the reading." } });
    const moved = await ask.change(
      "rahul",
      B,
      silently({ week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13", campus: "jubilee" } }),
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-25", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(stored.sessionOverrides.w04, { meetingUrl: LINK, notes: "Bring the reading." });
    assert.equal(stored.sessionChanges.w04, undefined);
    assert.equal(weekOf(4).dateKey, TUE_24);
    assert.equal(weekOf(4).session.meetingUrl, LINK, "the week's own link stays");
    assert.deepEqual(
      auditRows().map((row) => row.kind),
      ["session-moved", "session-restored"],
    );
  });

  // Week 4 pinned to Monday 23 Nov at 6pm, as a new regular time pins a week.
  const PIN = { weekday: 1, startTimeLocal: "18:00" };

  test("a pinned week held online and put back keeps its pin", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK, "sessionOverrides.w04": PIN });
    const online = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-23", kind: "online" }));
    assert.equal(online.status, 200, JSON.stringify(online.body));
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-23", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(stored.sessionOverrides.w04, PIN);
    assert.equal(stored.sessionModes?.w04, undefined);
    assert.equal(stored.sessionChanges.w04, undefined);
    assert.deepEqual([weekOf(4).dateKey, weekOf(4).session.startTimeLocal], ["2026-11-23", "18:00"]);
  });

  test("a pinned week moved, moved again, then put back returns to its pin", async () => {
    world.db.poke(`courseGroups/${B}`, { "sessionOverrides.w04": PIN });
    const moved = await ask.change(
      "rahul",
      B,
      silently({ week: 4, dateKey: "2026-11-23", kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } }),
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w04.was, PIN, "the record keeps what the week held");
    const again = await ask.change(
      "rahul",
      B,
      silently({ week: 4, dateKey: "2026-11-25", kind: "move", move: { dateKey: "2026-11-24", time: "5pm", room: "Portland A13", length: 90 } }),
    );
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w04.was, PIN, "a second move keeps the first one's record");
    const preview = await ask.change("rahul", B, { week: 4, dateKey: "2026-11-24", kind: "restore", reason: AWAY, preview: true });
    assert.deepEqual([preview.body.preview.after.dateKey, preview.body.preview.after.startTimeLocal], ["2026-11-23", "18:00"]);
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-24", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(stored.sessionOverrides.w04, PIN);
    assert.equal(stored.sessionChanges.w04, undefined);
    assert.deepEqual([weekOf(4).dateKey, weekOf(4).session.startTimeLocal, weekOf(4).session.durationMinutes], ["2026-11-23", "18:00", 120]);
  });

  test("an unpinned week moved then put back returns to the regular slot", async () => {
    const moved = await ask.change(
      "rahul",
      B,
      silently({ week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } }),
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w04.was, {}, "it held nothing of its own");
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-25", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides?.w04, undefined);
    assert.deepEqual([weekOf(4).dateKey, weekOf(4).session.startTimeLocal], [TUE_24, "18:00"]);
  });

  test("a week moved and then held online goes back to where it was before the move", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const moved = await ask.change(
      "rahul",
      B,
      silently({ week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } }),
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const online = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-25", kind: "online" }));
    assert.equal(online.status, 200, JSON.stringify(online.body));
    assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w04.was, {}, "the online record carries the move's");
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-25", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides?.w04, undefined);
    assert.deepEqual([weekOf(4).dateKey, weekOf(4).session.startTimeLocal, weekOf(4).session.location], [TUE_24, "18:00", "Hallward B12"]);
  });

  test("a move recorded before the record kept what was there is put back as before, and old code reads the new record", async () => {
    world.db.poke(`courseGroups/${B}`, {
      "sessionOverrides.w04": { weekday: 3, startTimeLocal: "19:00", location: "Portland A13" },
      "sessionChanges.w04": { kind: "moved", reason: AWAY, dateKey: TUE_24, byUid: "rahul", at: new Date("2026-11-18T09:00:00Z") },
    });
    assert.equal(Object.hasOwn(group().sessionChanges.w04, "was"), false, "no was is read as none");
    const back = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-25", kind: "restore" }));
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides?.w04, undefined);
    // A stored was is read as the fields a move sets, and only those; a push, which puts nothing back, carries none.
    const read = groupsLib.normalizeCourseGroup(B, {
      ...world.db.read(`courseGroups/${B}`),
      sessionChanges: {
        w03: { kind: "cancelled", reason: AWAY, dateKey: "2026-11-17", byUid: "rahul", at: null, was: { durationMinutes: 90 } },
        w05: { kind: "moved", reason: AWAY, dateKey: "2026-12-01", byUid: "rahul", at: null, was: { weekday: 1, startTimeLocal: "18:00", meetingUrl: LINK, notes: "x" } },
        w06: { kind: "pushed", reason: AWAY, dateKey: "2026-12-08", byUid: "rahul", at: null, was: { weekday: 1 } },
      },
    });
    assert.deepEqual(read.sessionChanges.w03.was, { durationMinutes: 90 });
    assert.deepEqual(read.sessionChanges.w05.was, { weekday: 1, startTimeLocal: "18:00" });
    assert.equal(Object.hasOwn(read.sessionChanges.w06, "was"), false);
  });

  test("a week pinned to its own time, with no change record, has nothing to put back", async () => {
    world.db.poke(`courseGroups/${B}`, { "sessionOverrides.w04": { weekday: 1, startTimeLocal: "18:00" } });
    const before = everything();
    const response = await ask.change("rahul", B, silently({ week: 4, dateKey: "2026-11-23", kind: "restore" }));
    assert.deepEqual([response.status, response.body.error], [400, words.REFUSAL.notChanged]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 4. The preview
// ---------------------------------------------------------------------------

describe("4. the preview changes nothing", () => {
  test("says the session before and after, the lock, the jobs, who said what, and who would be told", async () => {
    world.db.seed(registerPath(4), {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 4,
      occurrence: 1,
      records: { amara: "excused" },
      excusedInAdvance: { amara: new Date("2026-11-18T09:00:00Z") },
      onlineSaid: { ines: new Date("2026-11-18T09:00:00Z") },
    });
    const before = everything();
    const response = await ask.change("claudia", B, {
      week: 4,
      dateKey: TUE_24,
      kind: "move",
      preview: true,
      move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(everything(), before, "a preview wrote something");
    assert.deepEqual(Object.keys(response.body).sort(), ["ok", "preview"]);
    const { preview } = response.body;
    assert.deepEqual(
      [preview.before.dateKey, preview.before.startTimeLocal, preview.after.dateKey, preview.after.startTimeLocal, preview.after.room],
      [TUE_24, "18:00", "2026-11-25", "19:00", "Portland A13"],
    );
    // From when the week's work counts as late: the session its people are due at, before and after the move.
    assert.deepEqual(preview.lateFrom, { before: "2026-11-24T18:00:00.000Z", after: "2026-11-25T19:00:00.000Z" });
    assert.equal("lock" in preview, false, "the preview still says when the week's work locks");
    assert.deepEqual([preview.reminders.weekOpen.scheduled, preview.reminders.reminders.on], [false, false]);
    assert.deepEqual([preview.said.joiningOnline.count, preview.said.cantMakeIt.count], [1, 1]);
    assert.deepEqual(preview.told, { emails: 4, refused: false, people: 2, facilitatorNames: ["Rahul", "Sofia"] });
    assert.equal(preview.notice.title, "Week 4 moves to Wed 25 Nov, 7pm");
    assert.deepEqual(preview.register, { exists: true, taken: false });
  });
});

// ---------------------------------------------------------------------------
// 5. A new regular time from a week onwards
// ---------------------------------------------------------------------------

/** Wednesdays at 7pm, two hours, in Portland A13, from week 4. */
const WEDNESDAYS = { fromWeek: 4, weekday: 3, time: "7pm", length: 120, room: "Portland A13", tell: false };

describe("5. a new regular time from a week onwards", () => {
  test("is the people's who run the programme: admins, the lead and track leads, not a plain facilitator", async () => {
    for (const [who, status] of [
      ["rahul", 403],
      ["amara", 403],
      ["tom", 403],
      ["nobody", 403],
      [null, 401],
    ]) {
      const before = everything();
      const response = await askRegular(who, WEDNESDAYS);
      assert.equal(response.status, status, String(who));
      assert.equal(everything(), before);
    }
    const viewAs = await askRegular("zach", WEDNESDAYS, { viewAs: true });
    assert.equal(viewAs.status, 403);
    for (const who of ["zach", "claudia", "yusuf"]) {
      const preview = await askRegular(who, { ...WEDNESDAYS, preview: true });
      assert.equal(preview.status, 200, `${who}: ${JSON.stringify(preview.body)}`);
    }
  });

  test("the body is checked before any document is read, and unknown keys are refused", async () => {
    const reads = world.db.stats.reads;
    const response = await askRegular("zach", { ...WEDNESDAYS, everyWeek: true });
    assert.equal(response.status, 400);
    assert.equal(world.db.stats.reads, reads);
  });

  test("pins every earlier week to when it met, re-dates the rest, and asks the time question again", async () => {
    const earlier = [1, 2, 3].map(startOf);
    const response = await askRegular("claudia", { ...WEDNESDAYS, reason: "Rahul’s timetable changed." });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.change, {
      fromWeek: 4,
      movedWeeks: [4, 5, 6],
      pinnedWeeks: [1, 2, 3],
      ownTimeWeeks: [],
      askedAgain: true,
      takenBack: 0,
    });
    const stored = world.db.read(`courseGroups/${B}`);
    for (const weekId of ["w01", "w02", "w03"]) {
      assert.deepEqual(stored.sessionOverrides[weekId], { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" }, weekId);
      assert.equal(stored.sessionChanges?.[weekId], undefined, `${weekId} is pinned, not changed`);
    }
    assert.deepEqual(
      [stored.session.weekday, stored.session.startTimeLocal, stored.session.durationMinutes, stored.session.location],
      [3, "19:00", 120, "Portland A13"],
    );
    assert.ok(stored.timeQuestionSince instanceof Date || typeof stored.timeQuestionSince === "object");
    // Earlier weeks resolve exactly as they did; later weeks to Wednesdays.
    assert.deepEqual([1, 2, 3].map(startOf), earlier);
    assert.deepEqual([4, 5, 6].map(startOf), ["2026-11-25T19:00:00.000Z", "2026-12-02T19:00:00.000Z", "2026-12-09T19:00:00.000Z"]);
    const [row] = auditRows("group-time-changed");
    assert.equal(
      row.detail,
      "Changed the regular time to Wednesdays, 7pm to 9pm, Portland A13, from week 4. Weeks 1, 2 and 3 kept the times they met. " +
        "Before: Tue 24 Nov, 6pm, Hallward B12. Reason: Rahul’s timetable changed. Nobody was emailed.",
    );
    assert.equal(row.weekId, "w04");
  });

  test("an answer given before the time changed is no longer anybody's answer, and is kept", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__amara`, {
      timeAnswer: { kind: "yes", forGroupId: B, at: new Date("2026-11-01T09:00:00Z") },
    });
    const response = await askRegular("claudia", WEDNESDAYS);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const since = group().timeQuestionSince;
    assert.ok(since instanceof Date);
    const seat = { role: "learner", status: "active", groupId: B, timeAnswer: { kind: "yes", reason: null, alternatives: null, forGroupId: B, at: new Date("2026-11-01T09:00:00Z") } };
    assert.equal(timeAnswer.currentTimeAnswer(seat, since), null, "an answer about the old time still counts");
    assert.deepEqual(timeAnswer.currentTimeAnswer(seat, null), { kind: "yes", reason: null, alternatives: null });
    const later = { ...seat, timeAnswer: { ...seat.timeAnswer, at: new Date(since.getTime() + 1000) } };
    assert.deepEqual(timeAnswer.currentTimeAnswer(later, since), { kind: "yes", reason: null, alternatives: null });
    assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__amara`).timeAnswer.kind, "yes", "the stored answer is kept");
  });

  test("most weeks, not all: ticks on the old time are taken back; a one-off can't make it stays", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, {
      timeAnswer: { kind: "mostWeeks", sessionKeys: ["w05"], forGroupId: B, at: new Date("2026-11-01T09:00:00Z") },
    });
    world.db.seed(registerPath(5), {
      runId: RUN.agi, groupId: B, weekNumber: 5, occurrence: 1,
      records: { ines: "excused" }, excusedInAdvance: { ines: new Date("2026-11-01T09:00:00Z") },
    });
    world.db.seed(registerPath(6), {
      runId: RUN.agi, groupId: B, weekNumber: 6, occurrence: 1,
      records: { amara: "excused" }, excusedInAdvance: { amara: new Date("2026-11-02T09:00:00Z") },
    });
    const response = await askRegular("claudia", WEDNESDAYS);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.change.takenBack, 1);
    const five = world.db.read(registerPath(5));
    assert.equal(five.records?.ines, undefined);
    assert.equal(five.excusedInAdvance?.ines, undefined);
    const six = world.db.read(registerPath(6));
    assert.equal(six.records.amara, "excused", "a one-off can't make it is left as it is");
    assert.equal(new Date(six.sessionAt).toISOString(), "2026-12-09T19:00:00.000Z", "its stored start follows the session");
  });

  test("most weeks, not all: only weeks whose time changes lose a tick; a week pinned to its old time keeps it", async () => {
    // Made in week 2, from week 5: weeks 3 and 4 are still to come and keep Tuesdays, 6pm.
    at("2026-11-06T10:00:00Z");
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, {
      timeAnswer: { kind: "mostWeeks", sessionKeys: ["w03", "w05"], forGroupId: B, at: new Date("2026-11-01T09:00:00Z") },
    });
    for (const n of [3, 5]) {
      world.db.seed(registerPath(n), {
        runId: RUN.agi, groupId: B, weekNumber: n, occurrence: 1,
        records: { ines: "excused" }, excusedInAdvance: { ines: new Date("2026-11-01T09:00:00Z") },
      });
    }
    const threeBefore = startOf(3);
    const response = await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 5 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.change.movedWeeks, [5, 6]);
    assert.equal(response.body.change.takenBack, 1);
    assert.equal(startOf(3), threeBefore, "week 3 keeps its time");
    const three = world.db.read(registerPath(3));
    assert.equal(three.records.ines, "excused", "week 3 is still at the time Ines can't make: her word stays");
    assert.ok(three.excusedInAdvance.ines);
    const five = world.db.read(registerPath(5));
    assert.equal(five.records?.ines, undefined, "week 5 moved: the tick about its old time is taken back");
  });

  for (const [what, change, changedDateKey] of [
    ["held online", { week: 5, dateKey: "2026-12-01", kind: "online" }, "2026-12-01"],
    ["moved", { week: 5, dateKey: "2026-12-01", kind: "move", move: { dateKey: "2026-11-30", time: "5pm", room: "Portland A13" } }, "2026-11-30"],
  ]) {
    test(`a week ${what}, then pinned by a new regular time from a later week, is put back on its pin, not the new slot`, async () => {
      world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
      const first = await ask.change("rahul", B, silently(change));
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w05.was, {});
      // From week 6, Wednesdays at 7pm: week 5 is earlier, so it is pinned to Tuesdays at 6pm in Hallward B12.
      const response = await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 6 });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const pin = { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" };
      assert.deepEqual(world.db.read(`courseGroups/${B}`).sessionChanges.w05.was, pin, "the change's record holds the pin");
      const back = await ask.change("rahul", B, silently({ week: 5, dateKey: changedDateKey, kind: "restore" }));
      assert.equal(back.status, 200, JSON.stringify(back.body));
      const stored = world.db.read(`courseGroups/${B}`);
      assert.equal(stored.sessionChanges.w05, undefined);
      assert.deepEqual(
        [weekOf(5).dateKey, weekOf(5).session.startTimeLocal, weekOf(5).session.location],
        ["2026-12-01", "18:00", "Hallward B12"],
        "put back on the new slot, Wed 2 Dec 7pm, instead of its pin",
      );
      assert.equal(startOf(6), "2026-12-09T19:00:00.000Z", "the later week keeps the new time");
    });
  }

  test("a value a week's record already holds of what was there is left alone by a new regular time", () => {
    world.db.poke(`courseGroups/${B}`, {
      "sessionChanges.w05": { kind: "cancelled", reason: AWAY, dateKey: "2026-12-01", byUid: "rahul", at: null, was: { startTimeLocal: "17:00" } },
    });
    const planned = plans.planRegularChange({
      run: w.run(),
      group: group(),
      fromWeek: 6,
      slot: { weekday: 3, startTimeLocal: "19:00", durationMinutes: 120, location: "Portland A13", campus: null },
      registers: new Map(),
      storedOverrideWeekIds: [],
      now: new Date(),
    });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual(planned.plan.wasPins.w05, { weekday: 2, location: "Hallward B12" });
    assert.deepEqual(planned.plan.after.sessionChanges.w05.was, { startTimeLocal: "17:00", weekday: 2, location: "Hallward B12" });
    assert.equal(planned.plan.wasPins.w04, undefined, "a week with no change record has no record to pin");
  });

  test("a later week's own change is kept, and a cancelled evening stays cancelled on the week's new date", async () => {
    const moved = await ask.change(
      "rahul",
      B,
      silently({ week: 5, dateKey: "2026-12-01", kind: "move", move: { dateKey: "2026-11-30", time: "5pm", room: "Portland A13" } }),
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const cancelled = await ask.change("rahul", B, silently({ week: 6, dateKey: "2026-12-08", kind: "cancel" }));
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const response = await askRegular("claudia", WEDNESDAYS);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.change.ownTimeWeeks, [5, 6]);
    assert.equal(startOf(5), "2026-11-30T17:00:00.000Z", "week 5 keeps its own move");
    assert.equal(weekOf(6).dateKey, "2026-12-09");
    assert.equal(weekOf(6).cancelled, true, "the cancelled evening moved with its week");
  });

  test("refuses a week the group does not teach, a starting week that met, a later week that met, and no change at all", async () => {
    const none = await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 9 });
    assert.deepEqual([none.status, none.body.error], [400, "That isn’t one of the group’s weeks. Choose a week it meets in."]);
    world.db.seed(registerPath(4), { runId: RUN.agi, groupId: B, weekNumber: 4, markedByUid: "rahul" });
    const met = await askRegular("claudia", WEDNESDAYS);
    assert.deepEqual([met.status, met.body.error], [409, "Week 4 met: its register has been taken, so its time can’t change. Start from week 5."]);
    const later = await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 3 });
    assert.deepEqual(
      [later.status, later.body.error],
      [409, "Week 4’s register has been taken, so it met and its time can’t change. Start from week 5."],
    );
    const same = await askRegular("claudia", { fromWeek: 5, weekday: 2, time: "6pm", length: 120, room: "Hallward B12", tell: false });
    assert.deepEqual(
      [same.status, same.body.error],
      [400, "That’s already when and where the group meets. Change the day, the time, the length, the room or the campus."],
    );
    assert.equal(auditRows().length, 0, "a refusal wrote history");
  });

  test("a starting session that would land on a time that has passed is refused", async () => {
    // From week 4 on Mondays: Mon 23 Nov, still to come. From week 3 on Mondays: Mon 16 Nov, passed.
    const response = await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 3, weekday: 1 });
    assert.deepEqual(
      [response.status, response.body.error],
      [409, "Week 3 would then be on Mon 16 Nov, 7pm, which has passed. Start from week 4, or put week 3 right on its own first."],
    );
  });

  test("the preview says which weeks move and which are kept, and writes nothing", async () => {
    const before = everything();
    const response = await askRegular("claudia", { ...WEDNESDAYS, preview: true });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(everything(), before);
    const { preview } = response.body;
    assert.deepEqual(preview.moves.map((move) => [move.weekNumber, move.after.dateKey]), [
      [4, "2026-11-25"],
      [5, "2026-12-02"],
      [6, "2026-12-09"],
    ]);
    assert.deepEqual(preview.kept.map((week) => [week.weekNumber, week.pinned, week.session.dateKey]), [
      [1, true, "2026-11-03"],
      [2, true, "2026-11-10"],
      [3, true, "2026-11-17"],
    ]);
    assert.equal(preview.askedAgain, true);
    assert.equal(preview.told.emails, 4);
    assert.equal(preview.notice.subject, "Group B now meets on Wednesdays, 7pm");
    assert.equal(preview.reminders.length, 2);
  });
});

// ---------------------------------------------------------------------------
// 6. The notices
// ---------------------------------------------------------------------------

describe("6. the notices reach the group and its facilitators, never the presser, never a link", () => {
  test("a new regular time: the count on the button, then one email each, asking the time question of the people in it", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const stale = await askRegular("claudia", { ...WEDNESDAYS, tell: true, emailCount: 9 });
    assert.deepEqual([stale.status, stale.body.emails], [409, 4]);
    assert.equal(world.mail.length, 0);
    const response = await askRegular("claudia", { ...WEDNESDAYS, tell: true, emailCount: 4, roomToBeConfirmed: true, room: "" });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.email, { sent: 4, held: 0, suppressed: 0, failed: 0 });
    assert.deepEqual(world.mail.map((m) => m.to).sort(), ["amara@example.com", "ines@example.com", "rahul@example.com", "sofia@example.com"]);
    for (const message of world.mail) {
      assert.equal(message.subject, "Group B now meets on Wednesdays, 7pm");
      const text = (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
      assert.ok(text.includes("From Wed 25 Nov, Group B meets on Wednesdays, 7pm to 9pm."), text);
      assert.ok(text.includes(words.ROOM_TO_BE_CONFIRMED_LINE));
      assert.ok(text.includes("Weeks 1 to 3 stay as they were."));
      assert.ok(!text.includes("meet.example"), "a meeting link went into the notice");
      const asked = text.includes("Most weeks, not all");
      assert.equal(asked, ["amara@example.com", "ines@example.com"].includes(message.to), `${message.to} asked: ${asked}`);
    }
    const [row] = auditRows("group-time-changed");
    assert.equal(row.emailed, 4);
  });

  test("a room set from the Groups tab tells the group when asked, and only then", async () => {
    const quiet = await w.call("claudia", roomRoute.PUT, { roundId: ROUND, programmeId: AGI, groupId: B }, { body: { room: "Portland A21" } });
    assert.equal(quiet.status, 200, JSON.stringify(quiet.body));
    assert.equal(quiet.body.email, null);
    assert.equal(world.mail.length, 0);
    const stale = await w.call("claudia", roomRoute.PUT, { roundId: ROUND, programmeId: AGI, groupId: B }, {
      body: { room: "Monica Partridge C10", tell: true, emailCount: 1 },
    });
    assert.deepEqual([stale.status, stale.body.emails], [409, 4]);
    const told = await w.call("claudia", roomRoute.PUT, { roundId: ROUND, programmeId: AGI, groupId: B }, {
      body: { room: "Monica Partridge C10", tell: true, emailCount: 4 },
    });
    assert.equal(told.status, 200, JSON.stringify(told.body));
    assert.deepEqual(told.body.email, { sent: 4, held: 0, suppressed: 0, failed: 0 });
    assert.deepEqual(world.mail.map((m) => m.subject), Array(4).fill("Room for Group B: Monica Partridge C10"));
    const text = (await render(world.mail[0].react, { plainText: true })).replace(/\s+/g, " ");
    assert.ok(text.includes("Group B’s room is booked: Monica Partridge C10 from Tue 24 Nov, 6pm."), text);
    assert.deepEqual(
      auditRows("group-room-changed").map((row) => [row.after.room, row.emailed]),
      [
        ["Portland A21", 0],
        ["Monica Partridge C10", 4],
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// 7. A group's history, read back
// ---------------------------------------------------------------------------

describe("7. a group's history, newest first, one group's rows only", () => {
  test("every change is there with its category, an older row reads as it was written, and another group's rows are not", async () => {
    const history = await loadTs("lib/courses/groupHistory/load.ts");
    // A row from before the optional fields existed, and one of a kind this build does not know.
    world.db.seed("courseAudit/old-push", {
      kind: "attendance-push", runId: RUN.agi, groupId: B, actorUid: "rahul", actorName: "Rahul",
      targetLabel: "w01", detail: "Pushed week 1's register.", at: new Date("2026-11-04T20:00:00Z"),
    });
    world.db.seed("courseAudit/future-kind", {
      kind: "something-new", runId: RUN.agi, groupId: B, actorUid: "zach", actorName: "Zach",
      targetLabel: "", detail: "Something a later build wrote.", at: new Date("2026-11-05T20:00:00Z"),
    });
    world.db.seed("courseAudit/other-group", {
      kind: "session-moved", runId: RUN.agi, groupId: "another-group", actorUid: "tom", actorName: "Tom",
      targetLabel: "", detail: "Not Group B's.", at: new Date("2026-11-06T20:00:00Z"),
    });
    at("2026-11-19T10:00:00Z");
    await ask.change("rahul", B, silently({ week: 4, dateKey: TUE_24, kind: "cancel" }));
    at("2026-11-19T11:00:00Z");
    await askRegular("claudia", { ...WEDNESDAYS, fromWeek: 5 });

    const { rows, more } = await history.loadGroupHistory(world.courseDb, RUN.agi, B);
    assert.equal(more, false);
    assert.deepEqual(
      rows.map((row) => [row.kind, row.category, row.label]),
      [
        ["group-time-changed", "time-and-room", "Regular time changed"],
        ["session-cancelled", "time-and-room", "Session cancelled, keeping pace"],
        ["something-new", "other", "Unrecognised action"],
        ["attendance-push", "registers", "Register pushed"],
      ],
    );
    const old = rows.find((row) => row.kind === "attendance-push");
    assert.deepEqual([old.weekId, old.before, old.after, old.reason, old.emailed], [null, null, null, null, null]);
    const cancel = rows.find((row) => row.kind === "session-cancelled");
    assert.deepEqual([cancel.weekId, cancel.reason, cancel.emailed, cancel.actorName.length > 0], ["w04", AWAY, 0, true]);
  });
});

// ---------------------------------------------------------------------------
// 8. Nothing moves a session that met
// ---------------------------------------------------------------------------

describe("8. nothing moves the start of a session whose register was taken", () => {
  /** Wed 25 Nov: week 3 (Tue 17 Nov) passed and nobody took its register; week 4 (Tue 24 Nov) met and was finished. */
  function weekFourMet() {
    at("2026-11-25T10:00:00Z");
    world.db.seed(registerPath(4), {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 4,
      occurrence: 1,
      pushedAt: new Date("2026-11-24T20:30:00Z"),
      sessionAt: new Date("2026-11-24T18:00:00Z"),
    });
  }

  test("pushing week 3 back would move week 4, which met: refused in the preview and the press, and nothing changes", async () => {
    weekFourMet();
    const before = everything();
    const startFour = startOf(4);
    const preview = await ask.change("claudia", B, { ...WEEK3, kind: "push", reason: AWAY, preview: true });
    assert.deepEqual([preview.status, preview.body.error], [409, words.movesMetWords(4)]);
    assert.equal(words.movesMetWords(4), "This would move week 4’s session, which has met: its register has been taken.");
    const pressed = await ask.change("claudia", B, {
      ...WEEK3,
      kind: "push",
      reason: AWAY,
      tell: true,
      emailCount: await w.changeEmailsFor(B, "claudia"),
    });
    assert.deepEqual([pressed.status, pressed.body.error], [409, words.movesMetWords(4)]);
    assert.equal(everything(), before, "a refused push wrote something");
    assert.equal(startOf(4), startFour);
    assert.equal(auditRows().length, 0);
  });

  test("cancelling week 3 and keeping pace moves nothing, so it goes through", async () => {
    weekFourMet();
    const startFour = startOf(4);
    const preview = await ask.change("claudia", B, { ...WEEK3, kind: "cancel", reason: AWAY, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    // Cancelled with the group keeping pace, week 3's work counts as late from when its session would have
    // started (Tue 17 Nov, 6pm), never from the next session that meets: unchanged by the cancel.
    assert.deepEqual(preview.body.preview.lateFrom, { before: "2026-11-17T18:00:00.000Z", after: "2026-11-17T18:00:00.000Z" });
    const response = await ask.change("claudia", B, silently({ ...WEEK3, kind: "cancel" }));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(weekOf(3).cancelled, true);
    assert.equal(startOf(4), startFour);
  });

  test("a push that moves only weeks nobody took a register for goes through as before", async () => {
    world.db.seed(registerPath(3), { runId: RUN.agi, groupId: B, weekNumber: 3, occurrence: 1, pushedAt: new Date("2026-11-17T20:30:00Z") });
    const response = await ask.change("claudia", B, silently({ week: 4, dateKey: TUE_24, kind: "push" }));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(weekOf(4).dateKey, "2026-12-01");
  });

  test("a group's own pace that would move week 2, which met, is refused, plan or start date, and nothing changes", async () => {
    world.db.seed(registerPath(2), { runId: RUN.agi, groupId: B, weekNumber: 2, occurrence: 1, pushedAt: new Date("2026-11-10T20:30:00Z") });
    const weeks = w.run().weekPlan;
    const before = everything();
    for (const [who, body] of [
      ["rahul", { paceWeekPlan: [weeks[0], { kind: "break", label: "Reading week" }, ...weeks.slice(1)] }],
      ["zach", { paceWeekPlan: [weeks[0], { kind: "break", label: "Reading week" }, ...weeks.slice(1)] }],
      ["rahul", { paceStartDate: "2026-11-05" }],
    ]) {
      const response = await w.call(who, pace.PATCH, { groupId: B }, { body, course: true });
      assert.deepEqual([response.status, response.body.error], [409, words.movesMetWords(2)], `${who}: ${JSON.stringify(body)}`);
    }
    assert.equal(everything(), before, "a refused pace wrote something");
  });

  test("a group's own pace that moves only weeks nobody took a register for goes through", async () => {
    world.db.seed(registerPath(2), { runId: RUN.agi, groupId: B, weekNumber: 2, occurrence: 1, pushedAt: new Date("2026-11-10T20:30:00Z") });
    world.db.seed(registerPath(5), {
      runId: RUN.agi, groupId: B, weekNumber: 5, occurrence: 1,
      records: { amara: "excused" }, excusedInAdvance: { amara: new Date("2026-11-18T09:00:00Z") },
    });
    const weeks = w.run().weekPlan;
    const earlier = [1, 2, 3, 4].map(startOf);
    const response = await w.call(
      "rahul",
      pace.PATCH,
      { groupId: B },
      { body: { paceWeekPlan: [...weeks.slice(0, 4), { kind: "break", label: "Reading week" }, ...weeks.slice(4)] }, course: true },
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual([1, 2, 3, 4].map(startOf), earlier);
    assert.equal(weekOf(5).dateKey, "2026-12-08", "week 5, with only words in advance, moved a week later");
  });
});

// ---------------------------------------------------------------------------
// 9. A second press
// ---------------------------------------------------------------------------

describe("9. a second press of a change that went through tells nobody again", () => {
  test("cancel: the second press is refused as already so, and the group is emailed once", async () => {
    const first = await w.press("rahul", B, { week: 5, dateKey: "2026-12-01", kind: "cancel" });
    assert.equal(first.changed.status, 200, JSON.stringify(first.changed.body));
    assert.equal(first.told.status, 200, JSON.stringify(first.told.body));
    const sent = world.mail.length;
    assert.ok(sent > 0);
    const before = everything();
    const second = await w.press("rahul", B, { week: 5, dateKey: "2026-12-01", kind: "cancel" });
    assert.deepEqual([second.changed.status, second.changed.body.error], [409, words.REFUSAL.alreadyCancelled]);
    assert.equal(second.told, null, "a refused press posted an update");
    assert.equal(world.mail.length, sent);
    assert.equal(everything(), before);
    const preview = await ask.change("rahul", B, { week: 5, dateKey: "2026-12-01", kind: "cancel", reason: AWAY, preview: true });
    assert.deepEqual([preview.status, preview.body.error], [409, words.REFUSAL.alreadyCancelled]);
  });

  test("hold it online: the second press is refused as already so, and the group is emailed once", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const first = await w.press("sofia", B, { week: 6, dateKey: "2026-12-08", kind: "online" });
    assert.equal(first.changed.status, 200, JSON.stringify(first.changed.body));
    assert.equal(first.told.status, 200, JSON.stringify(first.told.body));
    const sent = world.mail.length;
    assert.ok(sent > 0);
    const before = everything();
    const second = await w.press("sofia", B, { week: 6, dateKey: "2026-12-08", kind: "online" });
    assert.deepEqual([second.changed.status, second.changed.body.error], [409, words.REFUSAL.alreadyOnline]);
    assert.equal(second.told, null, "a refused press posted an update");
    assert.equal(world.mail.length, sent);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 10. The plan of a new regular time, as arithmetic
// ---------------------------------------------------------------------------

describe("10. planRegularChange: which earlier weeks are pinned, and to what", () => {
  /** Wednesdays 7pm from week 4, as WEDNESDAYS above, on the group as stored. */
  const plan = (over = {}) =>
    plans.planRegularChange({
      run: w.run(),
      group: group(),
      fromWeek: 4,
      slot: { weekday: 3, startTimeLocal: "19:00", durationMinutes: 120, location: "Portland A13", campus: null },
      registers: new Map(),
      storedOverrideWeekIds: Object.keys(world.db.read(`courseGroups/${B}`).sessionOverrides ?? {}),
      now: new Date(),
      ...over,
    });
  const iso = (session) => w.sessionsLib.sessionInstants(session).startsAt?.toISOString() ?? null;
  const keptOf = (planned, n) => planned.plan.kept.find((week) => week.weekNumber === n);
  const finished = (n, sessionAt) => ({
    runId: RUN.agi, groupId: B, weekNumber: n, occurrence: 1, pushedAt: new Date(sessionAt.getTime() + 2 * 3_600_000), sessionAt,
  });

  test("a week that met on another day than its slot now says is pinned to its register: Monday 6pm, not Tuesday 5:30pm", () => {
    // The slot was changed by hand to Tuesdays 5:30pm after week 2 met on Monday 9 Nov at 6pm.
    world.db.poke(`courseGroups/${B}`, { "session.startTimeLocal": "17:30" });
    const planned = plan({ registers: new Map([[2, finished(2, new Date("2026-11-09T18:00:00Z"))]]) });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual(planned.plan.pins.w02, { weekday: 1, startTimeLocal: "18:00", location: "Hallward B12" });
    assert.deepEqual([keptOf(planned, 2).session.dateKey, iso(keptOf(planned, 2).session)], ["2026-11-09", "2026-11-09T18:00:00.000Z"]);
    assert.equal(keptOf(planned, 2).pinned, true);
    // A week with no register keeps its slot, as before.
    assert.deepEqual(planned.plan.pins.w01, { weekday: 2, startTimeLocal: "17:30", location: "Hallward B12" });
  });

  test("the route's preview shows such a week kept on its register's date, and the write pins it there", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.startTimeLocal": "17:30" });
    world.db.seed(registerPath(2), finished(2, new Date("2026-11-09T18:00:00Z")));
    const preview = await askRegular("claudia", { ...WEDNESDAYS, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const two = preview.body.preview.kept.find((week) => week.weekNumber === 2);
    assert.deepEqual([two.session.dateKey, two.session.startTimeLocal], ["2026-11-09", "18:00"]);
    const response = await askRegular("claudia", WEDNESDAYS);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(startOf(2), "2026-11-09T18:00:00.000Z");
  });

  test("a register that agrees with its slot pins as before, and a week with no register pins its slot", () => {
    const planned = plan({ registers: new Map([[2, finished(2, new Date("2026-11-10T18:00:00Z"))]]) });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    for (const weekId of ["w01", "w02", "w03"]) {
      assert.deepEqual(planned.plan.pins[weekId], { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" }, weekId);
    }
    // A register that names a time outside its own week cannot be said by an override: the slot's is kept.
    const outside = plan({ registers: new Map([[2, finished(2, new Date("2026-11-13T18:00:00Z"))]]) });
    assert.deepEqual(outside.plan.pins.w02, { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" });
    // A register that holds only words in advance has not met: the slot's is kept.
    const inAdvance = plan({ registers: new Map([[2, { runId: RUN.agi, groupId: B, weekNumber: 2, sessionAt: new Date("2026-11-09T18:00:00Z") }]]) });
    assert.deepEqual(inAdvance.plan.pins.w02, { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" });
  });

  test("an earlier week's own partial override wins, and only what it lacks is pinned", () => {
    world.db.poke(`courseGroups/${B}`, { "sessionOverrides.w02": { startTimeLocal: "19:30", notes: "Bring the reading." } });
    const before = iso(weekOf(2));
    const planned = plan({ registers: new Map([[2, finished(2, new Date("2026-11-09T18:00:00Z"))]]) });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual(planned.plan.pins.w02, { weekday: 1, location: "Hallward B12" }, "its own start stays its own");
    const two = keptOf(planned, 2).session;
    assert.deepEqual([two.dateKey, two.session.startTimeLocal, two.session.notes], ["2026-11-09", "19:30", "Bring the reading."]);
    assert.notEqual(iso(two), before);
  });

  test("weeks either side of the clocks going back keep their own instants", () => {
    // The group's own start, Thu 15 Oct: week 1 meets Tue 20 Oct in summer time, week 2 Tue 27 Oct in winter time.
    world.db.poke(`courseGroups/${B}`, { paceStartDate: "2026-10-15" });
    const before = [1, 2, 3].map((n) => iso(weekOf(n)));
    assert.deepEqual(before.slice(0, 2), ["2026-10-20T17:00:00.000Z", "2026-10-27T18:00:00.000Z"]);
    const planned = plan({ now: new Date("2026-10-30T10:00:00Z") });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual([1, 2, 3].map((n) => iso(keptOf(planned, n).session)), before);
    assert.equal(iso(planned.plan.moves[0].after), "2026-11-11T19:00:00.000Z");
  });

  test("a group with its own plan: the weeks are dated by its plan, before and after", () => {
    const weeks = w.run().weekPlan;
    world.db.poke(`courseGroups/${B}`, { paceWeekPlan: [...weeks.slice(0, 2), { kind: "break", label: "Reading week" }, ...weeks.slice(2)] });
    const planned = plan();
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual(planned.plan.kept.map((week) => [week.weekNumber, week.session.dateKey]), [
      [1, "2026-11-03"],
      [2, "2026-11-10"],
      [3, "2026-11-24"],
    ]);
    assert.deepEqual(planned.plan.moves.map((move) => [move.weekNumber, move.before.dateKey, move.after.dateKey]), [
      [4, "2026-12-01", "2026-12-02"],
      [5, "2026-12-08", "2026-12-09"],
      [6, "2026-12-15", "2026-12-16"],
    ]);
  });

  test("a cancelled earlier week is pinned and stays cancelled on its evening; only later cancellations move", () => {
    world.db.poke(`courseGroups/${B}`, {
      "sessionChanges.w02": { kind: "cancelled", reason: AWAY, dateKey: "2026-11-10", byUid: "rahul", at: new Date("2026-11-09T10:00:00Z") },
    });
    const planned = plan();
    assert.equal(planned.ok, true, JSON.stringify(planned));
    assert.deepEqual(planned.plan.pins.w02, { weekday: 2, startTimeLocal: "18:00", location: "Hallward B12" });
    const two = keptOf(planned, 2).session;
    assert.deepEqual([two.dateKey, two.cancelled], ["2026-11-10", true]);
    assert.deepEqual(planned.plan.cancelledMoves, {});
  });

  test("the cap: weeks set apart, stored and pinned, may not pass 20", () => {
    const stored = (n) => Array.from({ length: n }, (_, i) => `w${String(i + 7).padStart(2, "0")}`);
    // Weeks 1 to 3 are pinned: 17 stored and 3 pinned is 20, which fits; 18 and 3 does not.
    assert.equal(plan({ storedOverrideWeekIds: stored(17) }).ok, true);
    assert.deepEqual(plan({ storedOverrideWeekIds: stored(18) }), { ok: false, status: 409, error: regularWords.REGULAR_REFUSAL.full });
    // A week already stored is not counted twice when it is pinned.
    assert.equal(plan({ storedOverrideWeekIds: [...stored(17), "w01"] }).ok, true);
  });
});
