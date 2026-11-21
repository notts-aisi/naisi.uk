/**
 * A WEEK SPENT IN A GROUP ARCHIVED SINCE keeps the attendance its finished
 * register holds.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule (`src/lib/courses/archivedWeeks.ts`)
 *
 * A place can record which group it was in from which week (`groupsByWeek`).
 * When a group it names for some weeks is ARCHIVED (closed into others), a
 * session that group held whose register was finished, saying the session
 * was held, still counts for the people whose record gives them that week,
 * and their mark on it is their mark, dated as that group's session was:
 *
 *  - the rollup on their place, after a push of either group's register and
 *    after an admin's correction of the archived group's;
 *  - their own attendance on the run home, and what a certificate counts;
 *  - their row of the Attendance tab and its download, and of a group page's
 *    grid;
 *  - who finished (their row, and their own finished record);
 *  - their own excused weeks on the run home: the week, and what was asked
 *    about it and how it was decided, as history, with nothing offered.
 *
 * What stays as it was: a register of an archived group never finished, or
 * saying the session did not happen, counts for nothing; an archived group is
 * no block of the grid, has no figures and gains no page; the people leading
 * the programme still do not correct an archived group's register (only an
 * admin does); and somebody with NO record reads exactly as before, archived
 * group or not. The readers of a session still to come (no session, no
 * reminder, undated) are pinned in
 * `tests/course-groups-by-week-readers.test.mjs` and
 * `tests/course-staff-move-readers.test.mjs`.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays at 6pm (Amara, Chloe, Farah), Group
 * A on Mondays at 6pm (Ana). Chloe is moved to Group A from week 3 with a
 * record, and Group B is then archived.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__archivedGroupWeeks");
const { world, reset, lib, call, courseRoute, sessionOf } = made;

const { normalizeCourseEnrolment } = await lib("firestore", "courseEnrolments.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { readRunRecords, buildRunAttendance, listGroups, weeksOf, attendanceCsvTable } = await lib("courses", "programmeAttendance.ts");
const { suggestedBy, finishedForMember } = await lib("courses", "finishing", "record.ts");
const { certificateNeedsFor } = await lib("courses", "finishing", "needs.ts");
const { loadGroupAttendance } = await lib("courses", "groupAttendance", "load.ts");
const { countsFromArchivedGroup, rawCountsFromArchivedGroup } = await lib("courses", "archivedWeeks.ts");
const { excusedFor } = await lib("courses", "excused", "own.ts");
const { cardStateOf, lastSessionOf } = await lib("courses", "excused", "card.ts");
const overview = await courseRoute("runs", "[runId]", "overview");
const withdraw = await courseRoute("requests", "[requestId]", "excused", "withdraw");
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");

/** Wednesday 4 November 2026, noon: week 3 has met in both groups, week 4 has not. */
const NOW = new Date("2026-11-04T12:00:00Z");
/** Tuesday 1 December 2026: the run's last session is over. */
const AFTER = new Date("2026-12-01T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const read = (path) => world.db.read(path);
const CHLOE = `courseEnrolments/${RUN}__chloe`;
const RECORD = [{ groupId: GROUP.b, fromWeek: 1 }, { groupId: GROUP.a, fromWeek: 3 }];

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(seedWorld());
});

/** Chloe in Group A now; with `record`, from week 3, her weeks 1 and 2 Group B's. */
const moveChloe = (record = true) => world.db.poke(CHLOE, { groupId: GROUP.a, ...(record ? { groupsByWeek: RECORD } : {}) });
const archiveB = () => world.db.poke(`courseGroups/${GROUP.b}`, { archived: true });

/** A register: marks by uid; finished the evening it met unless `draft`. */
function registerOf(groupId, weekNumber, records, { draft = false, held = true } = {}) {
  world.db.seed(registerPath(groupId, weekNumber), {
    runId: RUN,
    groupId,
    weekNumber,
    occurrence: 1,
    records,
    held,
    ...(draft ? {} : { pushedAt: new Date("2026-10-19T20:00:00Z"), pushedByUid: "zach" }),
  });
}

/**
 * Three weeks. Chloe was in Group B for weeks 1 and 2 (excused, then
 * present; week 2's register as `week2` says) and is in Group A from week 3,
 * whose register is saved and not finished (late).
 */
function threeWeeks(week2 = {}) {
  registerOf(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
  registerOf(GROUP.b, 2, { amara: "present", chloe: "present", farah: "late" }, week2);
  registerOf(GROUP.b, 3, { amara: "present", farah: "present" });
  registerOf(GROUP.a, 1, { ana: "present" });
  registerOf(GROUP.a, 2, { ana: "present" });
  registerOf(GROUP.a, 3, { ana: "present", chloe: "late" }, { draft: true });
}

/** The world of the fix: a record, Group B archived. */
function archivedWorld(week2 = {}) {
  threeWeeks(week2);
  moveChloe(true);
  archiveB();
}

const runOf = () => normalizeCourseRun(RUN, read(`courseRuns/${RUN}`));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
const seatOf = (uid) => normalizeCourseEnrolment(`${RUN}__${uid}`, read(`courseEnrolments/${RUN}__${uid}`));

const ownAnswer = async (uid) => {
  const answer = await call(uid, overview.GET, { runId: RUN });
  assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
  return answer.body;
};
const ownSessions = async (uid) =>
  (await ownAnswer(uid)).ownAttendance.sessions.map((session) => `${session.sessionKey} ${session.status ?? "not marked"}`);

async function tabFor(isAdmin = true) {
  return buildRunAttendance(await readRunRecords(world.db, RUN), { isAdmin }, new Date());
}
async function tabRow(uid) {
  const model = await tabFor();
  for (const group of model.groups) {
    const row = group.people.find((person) => person.uid === uid);
    if (row) return { group: group.id, row, model };
  }
  return { group: null, row: null, model };
}
const cellsOf = (row) => row.cells.slice(0, 4).map((cell) => (cell.state === "mark" ? `${cell.mark}${cell.saved ? " (saved)" : ""}` : cell.state));

const rollupOf = (uid) => {
  const { sessionsHeld, attendedInFull, late, leftEarly, absent, excused } = read(`courseEnrolments/${RUN}__${uid}`).attendance;
  return { sessionsHeld, attendedInFull, late, leftEarly, absent, excused };
};
const pushed = async (who, groupId, weekNumber) => {
  const answer = await call(who, push.POST, { groupId }, { body: { weekNumber } });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
};
const groupGrid = async (groupId) => loadGroupAttendance(world.db, sessionOf("zach"), groupId, new Date());
const gridCells = (view, uid) =>
  view.people.find((person) => person.uid === uid)?.cells.slice(0, 4).map((cell) => (cell.state === "mark" ? cell.mark : cell.state)) ?? null;

/** Group B's registers, as the overview reads them, keyed by session key: what a certificate counts. */
const rawRegisters = (...weeks) => new Map(weeks.map((week) => [`w0${week}`, read(registerPath(GROUP.b, week))]));
function needsWith(atLeast, registers, { archived = true } = {}) {
  return certificateNeedsFor({
    rule: { atLeast },
    run: runOf(),
    group: groupOf(GROUP.a),
    enrolment: seatOf("chloe"),
    facilitates: false,
    incubator: false,
    liveGroups: archived ? [groupOf(GROUP.a)] : [groupOf(GROUP.a), groupOf(GROUP.b)],
    archivedGroups: archived ? [groupOf(GROUP.b)] : [],
    registers,
  });
}

// ===========================================================================
// The rule itself
// ===========================================================================

describe("the rule: a finished register of a session held, and nothing else", () => {
  test("finished and held counts; a draft, a register saying it did not happen, a called-off session and no register do not", () => {
    const at = new Date("2026-10-27T20:00:00Z");
    assert.equal(countsFromArchivedGroup({ cancelled: false }, { held: true, pushedAt: at }), true);
    assert.equal(countsFromArchivedGroup({ cancelled: false }, { held: true, pushedAt: null }), false);
    assert.equal(countsFromArchivedGroup({ cancelled: false }, { held: false, pushedAt: at }), false);
    assert.equal(countsFromArchivedGroup({ cancelled: true }, { held: true, pushedAt: at }), false);
    assert.equal(countsFromArchivedGroup({ cancelled: false }, null), false);
    assert.equal(countsFromArchivedGroup({ cancelled: false }, undefined), false);
  });

  test("the raw form, for the run home, reads two fields and says the same", () => {
    const at = new Date("2026-10-27T20:00:00Z");
    const stamp = { toDate: () => at };
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { pushedAt: at }), true, "no held field: held, as the parser reads it");
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { held: true, pushedAt: stamp }), true);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { held: true, pushedAt: null }), false);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { held: true }), false);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { held: false, pushedAt: at }), false);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: true }, { held: true, pushedAt: at }), false);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, { held: true, pushedAt: new Date(Number.NaN) }), false);
    assert.equal(rawCountsFromArchivedGroup({ cancelled: false }, undefined), false);
  });
});

// ===========================================================================
// Every reader, before a push of the new group's register
// ===========================================================================

describe("Group B archived, its weeks 1 and 2 finished: every reader keeps them", () => {
  test("their own attendance on the run home: weeks 1 and 2 off Group B's registers, dated on Group B's Tuesdays", async () => {
    archivedWorld();
    const sessions = (await ownAnswer("chloe")).ownAttendance.sessions;
    assert.deepEqual(
      sessions.map((session) => [session.sessionKey, session.dateKey, session.held, session.status]),
      [
        ["w01", "2026-10-20", true, "excused"],
        ["w02", "2026-10-27", true, "present"],
      ],
      "week 3's register is not finished, so it is not listed yet",
    );
  });

  test("the Attendance tab: one row under Group A, weeks 1 and 2 as Group B marked them; Group B is no block and has no figures", async () => {
    archivedWorld();
    const { group, row, model } = await tabRow("chloe");
    assert.equal(group, GROUP.a);
    assert.deepEqual(cellsOf(row), ["excused", "present", "late (saved)", "not-yet"]);
    assert.deepEqual([row.came, row.of, row.groupHeld, row.online], [2, 3, 3, 0]);
    assert.deepEqual(model.groups.map((each) => each.id), [GROUP.a], "an archived group is no block of the grid");
    // A group's figures are its own register's, and Group B has none of its own; the programme's figure for
    // week 1 counts Group A's register and her line on Group B's, once.
    const groupA1 = model.groups[0].totals.find((each) => each.weekNumber === 1);
    assert.equal(`${groupA1.came} of ${groupA1.of}`, "1 of 1");
    const week1 = model.totals.find((each) => each.weekNumber === 1);
    assert.equal(`${week1.came} of ${week1.of}`, "1 of 2");
    assert.deepEqual(week1.from, ["Group A", "Group B"]);
  });

  test("the Attendance tab's download says the same", async () => {
    archivedWorld();
    const { header, rows } = attendanceCsvTable(await tabFor());
    const { row } = await tabRow("chloe");
    const chloe = rows.find((cells) => cells[1] === row.name);
    assert.deepEqual(header.slice(0, 5), ["Group", "Name", "Week 1", "Week 2", "Week 3"]);
    assert.deepEqual(chloe.slice(0, 5), ["Group A", row.name, "Excused", "Present", "Late (not pushed)"]);
  });

  test("Group A's page's grid: her row reads weeks 1 and 2 off Group B; Group B gains no page", async () => {
    archivedWorld();
    const a = await groupGrid(GROUP.a);
    assert.equal(a.status, "ok");
    assert.deepEqual(gridCells(a.view, "chloe"), ["excused", "present", "late", "not-yet"]);
    assert.deepEqual((await groupGrid(GROUP.b)).status, "none", "an archived group is no group here, as before");
  });

  test("who finished: her row counts the sessions she came to in both groups", async () => {
    archivedWorld();
    const records = await readRunRecords(world.db, RUN);
    const row = listGroups(records, { isAdmin: true }, NOW, weeksOf(records))
      .flatMap((entry) => entry.people)
      .find((person) => person.enrolment.uid === "chloe").row;
    assert.equal(suggestedBy({ atLeast: 2 }, row), true);
    assert.equal(suggestedBy({ atLeast: 3 }, row), false);
  });

  test("her own finished record, once the run is over, counts the same row", async () => {
    archivedWorld();
    world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast: 2, setAt: new Date("2026-10-01T09:00:00Z") });
    mock.timers.setTime(AFTER.getTime());
    assert.equal(await finishedForMember(world.db, runOf(), seatOf("chloe"), new Date()), true);
    // As the run home asks it, with the run's live groups already in hand.
    assert.equal(await finishedForMember(world.db, runOf(), seatOf("chloe"), new Date(), [groupOf(GROUP.a), groupOf(GROUP.b)]), true);
    world.db.poke(`courseFinishing/${RUN}`, { atLeast: 3 });
    assert.equal(await finishedForMember(world.db, runOf(), seatOf("chloe"), new Date()), false);
  });

  test("what a certificate counts: Group B's two finished weeks and Group A's four", async () => {
    archivedWorld();
    assert.match(needsWith(9, rawRegisters(1, 2)), /at least 6 sessions/);
    // On the run home, from the registers it reads.
    world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast: 9, setAt: new Date("2026-10-01T09:00:00Z") });
    assert.match((await ownAnswer("chloe")).certificateNeeds, /at least 6 sessions/);
  });
});

// ===========================================================================
// The rollup, through real pushes of each group's register
// ===========================================================================

describe("the rollup on her place, through a real push of each group's register", () => {
  test("Group A's push counts her weeks 1 and 2 as Group B marked them", async () => {
    archivedWorld();
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 1, late: 1, leftEarly: 0, absent: 0, excused: 1 });
    assert.deepEqual(rollupOf("ana"), { sessionsHeld: 3, attendedInFull: 3, late: 0, leftEarly: 0, absent: 0, excused: 0 });
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w02 present", "w03 late"]);
    // The rollup and the tab agree.
    const { row } = await tabRow("chloe");
    const rollup = rollupOf("chloe");
    assert.equal(row.came, rollup.attendedInFull + rollup.late + rollup.leftEarly);
    assert.equal(row.groupHeld, rollup.sessionsHeld);
  });

  test("an admin finishing the archived group's own week 2 counts it, and Group A's push then keeps it", async () => {
    archivedWorld({ draft: true });
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused"], "week 2 not finished: nothing yet");
    await pushed("zach", GROUP.b, 2);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 2, attendedInFull: 1, late: 0, leftEarly: 0, absent: 0, excused: 1 });
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w02 present"]);
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 1, late: 1, leftEarly: 0, absent: 0, excused: 1 });
  });

  test("an admin's correction of the archived group's finished register reaches her figures and her own page", async () => {
    archivedWorld();
    await pushed("amelia", GROUP.a, 3);
    const corrected = await call("zach", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 2, marks: [{ uid: "chloe", status: "left-early" }], reason: "She left at half past seven, as the session note says." },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 0, late: 1, leftEarly: 1, absent: 0, excused: 1 });
    const week2 = (await ownAnswer("chloe")).ownAttendance.sessions.find((session) => session.sessionKey === "w02");
    assert.equal(week2.status, "left-early");
    assert.equal(typeof week2.correctedOn, "string");
    assert.deepEqual(cellsOf((await tabRow("chloe")).row).slice(0, 2), ["excused", "left-early"]);
  });

  test("the programme's lead still does not correct an archived group's register, as before; nothing changes", async () => {
    archivedWorld();
    await pushed("amelia", GROUP.a, 3);
    const before = rollupOf("chloe");
    const refused = await call("claudia", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 2, marks: [{ uid: "chloe", status: "left-early" }], reason: "She left at half past seven." },
    });
    assert.equal(refused.status, 403);
    assert.deepEqual(rollupOf("chloe"), before);
  });
});

// ===========================================================================
// What still counts for nothing
// ===========================================================================

describe("an archived group's register that was never finished, or says it did not happen, counts for nothing", () => {
  test("never finished: no week 2 anywhere, and nobody is offered it to take", async () => {
    archivedWorld({ draft: true });
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 2, attendedInFull: 0, late: 1, leftEarly: 0, absent: 0, excused: 1 });
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w03 late"]);
    assert.deepEqual(cellsOf((await tabRow("chloe")).row), ["excused", "none", "late", "not-yet"]);
    assert.deepEqual(gridCells((await groupGrid(GROUP.a)).view, "chloe"), ["excused", "none", "late", "not-yet"]);
    assert.match(needsWith(9, rawRegisters(1, 2)), /at least 5 sessions/);
    // Its facilitators are unstaffed by the archive: the register is nobody's to take.
    assert.equal((await call("rahul", register.GET, { groupId: GROUP.b })).status, 403);
  });

  test("finished, saying the session did not happen: no week 2 anywhere", async () => {
    archivedWorld({ held: false });
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 2, attendedInFull: 0, late: 1, leftEarly: 0, absent: 0, excused: 1 });
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w03 late"]);
    assert.deepEqual(cellsOf((await tabRow("chloe")).row), ["excused", "none", "late", "not-yet"]);
    assert.match(needsWith(9, rawRegisters(1, 2)), /at least 5 sessions/);
  });

  test("finished, of a session called off through Change a session: no week 2 anywhere", async () => {
    archivedWorld();
    // Week 2's Tuesday called off, the group keeping pace, after its register was finished.
    world.db.poke(`courseGroups/${GROUP.b}`, {
      sessionChanges: { w02: { kind: "cancelled", reason: "The room was flooded.", dateKey: "2026-10-27", byUid: "zach", at: new Date("2026-10-27T09:00:00Z") } },
    });
    const { resolveSessions } = await lib("courses", "sessions.ts");
    assert.equal(resolveSessions(runOf(), groupOf(GROUP.b)).find((session) => session.weekNumber === 2).cancelled, true);
    await pushed("amelia", GROUP.a, 3);
    assert.equal(rollupOf("chloe").sessionsHeld, 2);
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w03 late"]);
    assert.deepEqual(cellsOf((await tabRow("chloe")).row), ["excused", "none", "late", "not-yet"]);
    assert.match(needsWith(9, rawRegisters(1, 2)), /at least 5 sessions/);
  });
});

// ===========================================================================
// The programme's figure for a week
// ===========================================================================

describe("the programme's figure for a week keeps the marks of people who spent it in a group archived since", () => {
  /**
   * Group B closed into Group A from week 3: Chloe and Farah moved by a record, and Amara moved on the board
   * with no record (the shape of a move until the record existed), whose lines on Group B's registers count
   * nowhere, before the archive and after it.
   */
  function closedB(week2 = {}) {
    threeWeeks(week2);
    moveChloe(true);
    world.db.poke(`courseEnrolments/${RUN}__farah`, { groupId: GROUP.a, groupsByWeek: RECORD });
    world.db.poke(`courseEnrolments/${RUN}__amara`, { groupId: GROUP.a });
  }
  const totalsOf = async () => (await tabFor()).totals.map(({ weekNumber, came, of, online, percent, soFar, from }) => ({ weekNumber, came, of, online, percent, soFar, from }));

  test("every week's figure after the archive is what it was before", async () => {
    closedB();
    const before = await totalsOf();
    archiveB();
    const after = await totalsOf();
    assert.deepEqual(after, before);
    const week1 = after.find((each) => each.weekNumber === 1);
    // Ana on Group A's register; Chloe (excused) and Farah on Group B's. Amara's line there counts nowhere.
    assert.deepEqual([week1.came, week1.of, week1.from], [2, 3, ["Group A", "Group B"]]);
  });

  test("an archived group has no block and no figures of its own", async () => {
    closedB();
    archiveB();
    const model = await tabFor();
    assert.deepEqual(model.groups.map((group) => group.id), [GROUP.a]);
    const a1 = model.groups[0].totals.find((each) => each.weekNumber === 1);
    assert.deepEqual([a1.came, a1.of, a1.from], [1, 1, ["Group A"]], "Group A's own figure is its own register's");
  });

  for (const [label, week2] of [
    ["never finished", { draft: true }],
    ["saying the session did not happen", { held: false }],
  ]) {
    test(`a register of the archived group ${label} adds nothing`, async () => {
      closedB(week2);
      archiveB();
      const model = await tabFor();
      const week2Total = model.totals.find((each) => each.weekNumber === 2);
      const a2 = model.groups[0].totals.find((each) => each.weekNumber === 2);
      assert.deepEqual([week2Total.came, week2Total.of, week2Total.from], [a2.came, a2.of, ["Group A"]]);
    });
  }

  test("a session of the archived group called off adds nothing", async () => {
    closedB();
    world.db.poke(`courseGroups/${GROUP.b}`, {
      sessionChanges: { w02: { kind: "cancelled", reason: "The room was flooded.", dateKey: "2026-10-27", byUid: "zach", at: new Date("2026-10-27T09:00:00Z") } },
    });
    archiveB();
    const model = await tabFor();
    const week2Total = model.totals.find((each) => each.weekNumber === 2);
    assert.deepEqual([week2Total.came, week2Total.of, week2Total.from], [1, 1, ["Group A"]]);
  });

  test("the download carries no totals of its own; its week columns add up to the page's figure", async () => {
    closedB();
    archiveB();
    const model = await tabFor();
    const { header, rows } = attendanceCsvTable(model);
    assert.deepEqual(header.slice(-3), ["Came", "Of", "Left"]);
    for (const week of model.weeks) {
      const column = header.indexOf(`Week ${week.weekNumber}`);
      const cells = rows.map((cells) => String(cells[column])).filter((cell) => cell !== "" && cell !== "Not held");
      const came = cells.filter((cell) => /^(Present|Late|Left early)/.test(cell)).length;
      const total = model.totals.find((each) => each.weekNumber === week.weekNumber);
      assert.deepEqual([came, cells.length], [total.came, total.of], `week ${week.weekNumber}`);
    }
  });
});

// ===========================================================================
// Their own excused weeks
// ===========================================================================

/** A request to be excused, as the ask and decide routes leave one. */
function requestOf(id, uid, groupId, weeks) {
  world.db.seed(`courseRequests/${id}`, {
    kind: "excused",
    runId: RUN,
    groupId,
    subjectUid: uid,
    askedByUid: uid,
    askedAt: new Date("2026-10-18T09:00:00Z"),
    status: weeks[0].status,
    reason: "A hospital appointment.",
    reasonHeld: true,
    change: {
      weeks: weeks.map((week) => ({
        weekId: week.sessionKey,
        asked: "before",
        offered: { online: false },
        reply: "",
        decidedByUid: week.status === "waiting" ? null : "zach",
        decidedAt: week.status === "waiting" ? null : new Date("2026-10-19T09:00:00Z"),
        withdrawnAt: null,
        ...week,
      })),
    },
  });
}

/** Chloe's own excused view, as her programme page reads it: the run's live groups only. */
async function ownExcused() {
  const groups = [GROUP.a, GROUP.b].map(groupOf).filter((each) => !each.archived);
  return excusedFor(world.db, { user: sessionOf("chloe"), run: runOf(), enrolment: seatOf("chloe"), groups, now: new Date() });
}
const sessionAbout = (view, key) => view.sessions.find((session) => session.sessionKey === key) ?? null;

/** Week 1 excused on an approved request, week 2 present after a declined one: both asked of Group B. */
function asked() {
  requestOf("req-c1", "chloe", GROUP.b, [{ sessionKey: "w01", status: "approved", reply: "Hope it goes well." }]);
  requestOf("req-c2", "chloe", GROUP.b, [{ sessionKey: "w02", status: "declined", reply: "Please come if you can." }]);
}

describe("their own excused weeks keep a week spent in a group archived since", () => {
  test("approved and declined: the same weeks, the same outcomes, before and after Group B is archived", async () => {
    threeWeeks();
    moveChloe(true);
    asked();
    const before = await ownExcused();
    archiveB();
    const after = await ownExcused();
    for (const key of ["w01", "w02"]) assert.deepEqual(sessionAbout(after, key), sessionAbout(before, key), key);
    // The whole view, requests list included. When the run's work closes is worked out from the groups that
    // still meet, so archiving a group can move it; that is as before, and not about her weeks.
    assert.deepEqual({ ...after, closesAt: null }, { ...before, closesAt: null });
    assert.deepEqual(cardStateOf(sessionAbout(after, "w01")), { kind: "approved", by: "Zach", at: "2026-10-19T09:00:00.000Z", reply: "Hope it goes well.", came: false });
    assert.deepEqual(cardStateOf(sessionAbout(after, "w02")), { kind: "declined", by: "Zach", reply: "Please come if you can.", register: "came", again: false });
    // Nothing offered about it: no request to make, nothing to join online.
    for (const key of ["w01", "w02"]) {
      assert.deepEqual(sessionAbout(after, key).ask, { open: false, why: "another-group" });
      assert.deepEqual(sessionAbout(after, key).first, { online: false });
    }
  });

  test("the card of the last session that ended shows the archived group's week, as it did", async () => {
    // Thursday 29 October: Group B's week 2 (Tuesday) has ended, Group A's week 3 (Monday 2 November) has not.
    mock.timers.setTime(new Date("2026-10-29T12:00:00Z").getTime());
    threeWeeks();
    moveChloe(true);
    asked();
    const before = lastSessionOf(await ownExcused(), null);
    archiveB();
    const after = lastSessionOf(await ownExcused(), null);
    assert.equal(after?.sessionKey, "w02");
    assert.deepEqual(after, before);
  });

  test("waiting: shown as waiting, as before; its asker can still withdraw it, and nobody is offered anything else", async () => {
    threeWeeks();
    moveChloe(true);
    requestOf("req-w2", "chloe", GROUP.b, [{ sessionKey: "w02", status: "waiting" }]);
    const before = await ownExcused();
    archiveB();
    const after = await ownExcused();
    assert.deepEqual(sessionAbout(after, "w02"), sessionAbout(before, "w02"));
    assert.equal(cardStateOf(sessionAbout(after, "w02")).kind, "waiting");
    assert.deepEqual(sessionAbout(after, "w02").ask, { open: false, why: "another-group" });
    // Withdrawing is the asker's, by the request alone: it works for such a week, as it did before the archive.
    const withdrawn = await call("chloe", withdraw.POST, { requestId: "req-w2" }, { body: { sessionKey: "w02" } });
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    assert.deepEqual(cardStateOf(sessionAbout(await ownExcused(), "w02")), { kind: "withdrawn", at: NOW.toISOString(), again: false });
    assert.deepEqual(world.mail, []);
  });

  test("a week whose archived register was never finished is not listed, as on their attendance; their requests list still has it", async () => {
    threeWeeks({ draft: true });
    moveChloe(true);
    requestOf("req-w2", "chloe", GROUP.b, [{ sessionKey: "w02", status: "waiting" }]);
    archiveB();
    const view = await ownExcused();
    assert.equal(sessionAbout(view, "w02"), null);
    assert.ok(sessionAbout(view, "w01"));
    assert.deepEqual(view.requests.map((request) => [request.id, request.weeks.map((week) => week.state)]), [["req-w2", ["waiting"]]]);
  });

  test("a week whose archived register says the session did not happen is not listed", async () => {
    threeWeeks({ held: false });
    moveChloe(true);
    asked();
    archiveB();
    const view = await ownExcused();
    assert.equal(sessionAbout(view, "w02"), null);
    assert.ok(sessionAbout(view, "w01"));
  });

  test("no record: archiving Group B changes nothing on her card", async () => {
    threeWeeks();
    moveChloe(false);
    asked();
    // When the run's work closes moves with the groups that still meet, as before; nothing else changes.
    const before = JSON.stringify({ ...(await ownExcused()), closesAt: null });
    archiveB();
    assert.equal(JSON.stringify({ ...(await ownExcused()), closesAt: null }), before);
  });

  test("a record and nothing archived: weeks 1 and 2 off Group B, as before", async () => {
    threeWeeks();
    moveChloe(true);
    asked();
    const view = await ownExcused();
    assert.deepEqual(
      view.sessions.slice(0, 3).map((session) => [session.sessionKey, session.excuse?.kind ?? null, session.register, session.ask.open]),
      [
        ["w01", "approved", "excused", false],
        ["w02", "declined", "came", false],
        ["w03", null, null, false],
      ],
    );
  });
});

// ===========================================================================
// What answers exactly as before
// ===========================================================================

/** Everything these readers say about one person, as one value to compare. */
async function everythingAbout(uid) {
  await pushed("amelia", GROUP.a, 3);
  const own = await ownAnswer(uid);
  const tab = await tabFor();
  const grid = await groupGrid(GROUP.a);
  world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast: 2, setAt: new Date("2026-10-01T09:00:00Z") });
  mock.timers.setTime(AFTER.getTime());
  const finished = await finishedForMember(world.db, runOf(), seatOf(uid), new Date());
  mock.timers.setTime(NOW.getTime());
  return JSON.stringify({ own: own.ownAttendance, rollup: rollupOf(uid), tab, grid, finished });
}

describe("somebody with no record reads exactly as before, archived group or not", () => {
  test("moved on the board with no record: archiving Group B changes nothing anybody reads", async () => {
    threeWeeks();
    moveChloe(false);
    const live = await everythingAbout("chloe");
    reset(seedWorld());
    threeWeeks();
    moveChloe(false);
    archiveB();
    const archived = await everythingAbout("chloe");
    // Group B's block leaves the tab when it is archived, as it always did: compare her answers, not the whole run.
    const pick = (text) => {
      const value = JSON.parse(text);
      const row = value.tab.groups.flatMap((group) => group.people).find((person) => person.uid === "chloe");
      return { own: value.own, rollup: value.rollup, row, grid: value.grid, finished: value.finished };
    };
    assert.deepEqual(pick(archived), pick(live));
    // And her answers are the group she is in now's, as before: weeks 1 and 2 unmarked there.
    assert.deepEqual(pick(archived).own.sessions.map((session) => `${session.sessionKey} ${session.status ?? "not marked"}`), [
      "w01 not marked",
      "w02 not marked",
      "w03 late",
    ]);
  });

  test("nobody without a record reads an archived group's registers: Amara, still placed in it, is nobody's row", async () => {
    archivedWorld();
    const { row } = await tabRow("amara");
    assert.equal(row, null);
  });

  test("with a record and every week finished, archiving the old group changes nothing she reads", async () => {
    threeWeeks();
    moveChloe(true);
    const live = JSON.parse(await everythingAbout("chloe"));
    reset(seedWorld());
    archivedWorld();
    const archived = JSON.parse(await everythingAbout("chloe"));
    const rowOf = (value) => value.tab.groups.flatMap((group) => group.people).find((person) => person.uid === "chloe");
    assert.deepEqual(archived.own, live.own);
    assert.deepEqual(archived.rollup, live.rollup);
    assert.deepEqual(rowOf(archived), rowOf(live));
    assert.deepEqual(archived.grid, live.grid);
    assert.equal(archived.finished, live.finished);
  });
});

// ===========================================================================
// An account deleted, and a run destroyed
// ===========================================================================

describe("an account deleted, and a run destroyed, with such a place", () => {
  test("deleted: with her place gone and her marks cleared from every register of the run, every reader goes on without her", async () => {
    archivedWorld();
    await pushed("amelia", GROUP.a, 3);
    // As the deletion cascade leaves it: the place deleted, and her keys taken off every register of the run,
    // whichever group (`clearCourseAttendanceMarks` reads the run's registers by `runId` alone).
    await world.db.collection("courseEnrolments").doc(`${RUN}__chloe`).delete();
    for (const path of world.db.paths().filter((each) => each.startsWith("courseAttendance/"))) {
      const data = read(path);
      if (data.records?.chloe === undefined) continue;
      const records = { ...data.records };
      delete records.chloe;
      world.db.poke(path, { records });
    }
    assert.equal((await tabRow("chloe")).row, null);
    assert.equal(gridCells((await groupGrid(GROUP.a)).view, "chloe"), null);
    const corrected = await call("zach", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 2, marks: [{ uid: "farah", status: "present" }], reason: "Farah was on time, as the note says." },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.equal(read(CHLOE), undefined, "nothing rebuilds a place that is gone");
  });

  test("a run being destroyed is gone for every reader of it, as before", async () => {
    archivedWorld();
    world.db.poke(`courseRuns/${RUN}`, { destroying: true });
    assert.equal(await readRunRecords(world.db, RUN), null);
    assert.equal((await groupGrid(GROUP.a)).status, "none");
  });
});
