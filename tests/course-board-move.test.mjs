/**
 * A MOVE MADE MID-TERM ON THE GROUPS TAB KEEPS THE WEEKS ALREADY MET, and a
 * move counts from a week nobody met with the old group.
 *
 *   POST /api/courses/runs/[runId]/allocate                 (the board's move)
 *   POST /api/admissions/forms/.../people/[uid]/move        (the move page)
 *   POST /api/courses/runs/[runId]/enrolments/[uid]/remove  (Remove)
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. THE WEEK RULE, one function for the board and the move page
 *     (`moveWeekFor`): the old group's week called off, the new group's still
 *     to come, from that week; the new group's started, from the week after
 *     (the week counts for nobody); held, from the week after, as always;
 *     marked as not held on its register, as called off. Each through BOTH
 *     routes, which answer the same week.
 *  2. A BOARD MOVE MID-TERM goes through the writer: the record, both counts,
 *     a History row on each group worded for the board, nobody emailed, the
 *     seat told as before. The board's question before the press. A week
 *     sent back that no longer holds is refused, nothing written.
 *  3. THE REGISTERS AND THEIR READERS: weeks met with the old group are read
 *     off its registers by the rollup, the Attendance tab and the person's
 *     own attendance, after the new group's register is finished and after a
 *     correction of the old group's; nothing lost, nothing counted twice. The
 *     same world with no record (the base's plain move) shows the fault.
 *  4. A RECORD MOVED AGAIN is extended; MOVED BACK before the earlier move
 *     took effect, folded back; a record written by hand
 *     (`[{ old, 1 }, { new, N }]`) moved on the board gives what the move
 *     page gives.
 *  5. SEVERAL AT ONCE: each decided on its own; one refused, the others
 *     written; the refusal in its sentence.
 *  6. BEFORE THE TERM, and a seat nobody has told: the board's plain move,
 *     the same documents written as always and nothing else, into a group
 *     and into no group.
 *  7. PUBLISH after a mid-term board move: "You’ve moved" once, naming the
 *     first session of the new group they are due at, never the new group's
 *     week still spent in the old group.
 *  8. REMOVE with a visit still to come: the count before the press, the
 *     host's facilitators told, a changed count and the limit refused with
 *     nothing written.
 *  9. A SEAT A MOVE MADE MID-TERM FREES is taken in the same press, in
 *     either order; a refused move frees nothing; no group is over its
 *     capacity after any commit; a swap between two full groups is refused,
 *     before the term and after, as it always was.
 * 10. NEVER INTO NO GROUP MID-TERM: a told person whose group has met is
 *     refused the pool in the board's sentence, before the press and at it;
 *     a told place already in no group is placed by the plain move.
 *
 * The board's question before the press (2) also says what is left behind
 * on the old group, in the move page's own sentence; the week rule's
 * "already met" refusal (1) says when calling off the old group's session
 * lets the move go ahead now, and that it does.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Tue 17 Nov 2026 at noon. Group A meets on Thursdays at 6pm (Sofia) and met
 * week 3 on Thu 12 Nov; Group B on Tuesdays at 6pm (Rahul and Sofia), week 3
 * tonight; Group C on Wednesdays at 1pm (Tom), week 3 tomorrow; Group D on
 * Mondays at 6pm (Grace), week 3 yesterday. Claudia leads the programme.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__boardMove");
const { world, call } = w;
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const changeRoute = await w.courseRoute("groups", "[groupId]", "session", "change");
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");
const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
const registerRoute = await w.courseRoute("groups", "[groupId]", "attendance");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));
const audits = () => world.db.paths().filter((path) => /^courseAudit\/[^/]+$/.test(path)).map(read);

const place = (placements, who = "claudia") => w.join.place(who, placements);
const preview = (placements, who = "claudia") =>
  call(who, w.routes.allocate.POST, { runId: RUN.agi }, { body: { placements, preview: true }, course: true });
const movePreview = (uid, toGroupId) => call("claudia", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body: { toGroupId, preview: true }, course: true });
/** A press of the move page, as the page makes one. */
async function movePress(uid, toGroupId) {
  const shown = await movePreview(uid, toGroupId);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  return call("claudia", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body: { toGroupId, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails }, course: true });
}
/** Change a session as the panel presses it: called off, keeping pace, the group not told. */
async function callOff(who, groupId, week, dateKey) {
  const answer = await call(who, changeRoute.POST, { groupId }, { body: { week, dateKey, kind: "cancel", reason: "The room was flooded.", tell: false }, course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
}
const rollupOf = (uid) => {
  const { attendedInFull = 0, excused = 0, absent = 0, held } = read(seatPath(uid)).attendance ?? {};
  return { attendedInFull, excused, absent, ...(held !== undefined ? { held } : {}) };
};
const tabRow = async (uid) => {
  const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi), { isAdmin: true }, new Date());
  for (const group of tab.groups) {
    const row = group.people.find((person) => person.uid === uid);
    if (row) return { group: group.id, cells: row.cells.filter((cell) => cell.weekNumber <= 4).map((cell) => [cell.weekNumber, cell.state, cell.mark ?? null]) };
  }
  return null;
};

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
// 1. The week rule, through the board and the move page
// ---------------------------------------------------------------------------

describe("1. the week rule's four cases, through both routes", () => {
  /** The week each route gives for Chloe (Group B) to `to`, and the board's write. */
  async function bothWeeks(to) {
    const page = await movePreview("chloe", to);
    const board = await preview([{ uid: "chloe", groupId: to }]);
    assert.equal(board.status, 200, JSON.stringify(board.body));
    return { page: page.status === 200 ? page.body.preview.weekNumber : page.body.error, board: board.body.preview[0].fromWeek ?? board.body.preview[0].refusal?.words };
  }

  test("Group B's week 3 called off on Tuesday, Group C meets Wednesday afternoon, moved Wednesday morning: from week 3", async () => {
    await callOff("rahul", B, 3, "2026-11-17");
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await bothWeeks(C), { page: 3, board: 3 });
    const page = await movePreview("chloe", C);
    assert.equal(page.body.preview.skipsOld, "Group B’s week 3 session on Tue 17 Nov was called off, so Chloe is with Group C from week 3.");
    const placed = await place([{ uid: "chloe", groupId: C, fromWeek: 3 }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    assert.deepEqual(seat("chloe").groupsByWeek, [{ groupId: B, fromWeek: 1 }, { groupId: C, fromWeek: 3 }]);
  });

  test("Group B's week 3 called off, Group D's week 3 already met: from week 4, and week 3 counts for nobody", async () => {
    await callOff("rahul", B, 3, "2026-11-17");
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await bothWeeks(D), { page: 4, board: 4 });
    await place([{ uid: "chloe", groupId: D, fromWeek: 4 }]);
    assert.deepEqual(seat("chloe").groupsByWeek, [{ groupId: B, fromWeek: 1 }, { groupId: D, fromWeek: 4 }]);
    // Week 3 is Group B's, whose session did not happen: on neither register as a session met.
    assert.equal(enrolments.groupForWeek(seat("chloe"), 3), B);
  });

  test("Group B's week 3 held on Tuesday evening: from week 4, as always", async () => {
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await bothWeeks(C), { page: 4, board: 4 });
  });

  test("Group B's week 3 marked as not held on its register: as called off, from week 3", async () => {
    at("2026-11-18T09:00:00Z");
    world.db.seed(registerPath(B, 3), { runId: RUN.agi, groupId: B, weekNumber: 3, occurrence: 1, records: {}, held: false, pushedAt: null, markedByUid: "zach" });
    assert.deepEqual(await bothWeeks(C), { page: 3, board: 3 });
    const page = await movePreview("chloe", C);
    assert.equal(page.body.preview.skipsOld, "Group B’s week 3 session on Tue 17 Nov is marked as not held, so Chloe is with Group C from week 3.");
  });

  test("Group B's week 3 still to come and Group D's week 3 met: refused by both, never from week 4, and nothing written", async () => {
    const before = everything();
    const both = await bothWeeks(D);
    assert.equal(both.page, both.board);
    assert.equal(
      both.board,
      "Group D has already met for week 3, so Chloe can’t join it for that week. To move Chloe from week 4, come back after Group B’s week 3 session (Tue 17 Nov, 6pm). " +
        "If Group B’s week 3 session is called off with “Cancel and keep pace”, Chloe can be moved now, from week 4.",
    );
    const placed = await place([{ uid: "chloe", groupId: D }]);
    assert.deepEqual(placed.body.rejected.map((each) => [each.uid, each.reason]), [["chloe", "no-week"]]);
    assert.equal(everything(), before);
    // The last sentence is true: Group B's week 3 called off, keeping pace, and the board moves Chloe from week 4 now.
    await callOff("rahul", B, 3, "2026-11-17");
    assert.deepEqual(await bothWeeks(D), { page: 4, board: 4 });
  });
});

// ---------------------------------------------------------------------------
// 2. The board's move made mid-term
// ---------------------------------------------------------------------------

describe("2. a mid-term move on the allocation board goes through the writer", () => {
  test("the question before the press says the week and that the earlier weeks stay", async () => {
    const shown = await preview([{ uid: "amara", groupId: B }]);
    assert.equal(shown.status, 200);
    assert.deepEqual(shown.body.preview, [
      {
        uid: "amara",
        groupId: B,
        fromWeek: 4,
        words:
          "Move Amara Okafor to Group B from week 4?\n\nWeeks 1 to 3 stay with Group A, where Amara met.\n\n" +
          "Nobody is emailed now: Amara sees Group B straight away, and the next Publish emails them that they have moved.",
        refusal: null,
      },
    ]);
    // A preview writes nothing.
    assert.equal(seat("amara").groupId, A);
  });

  test("the question says what is left behind on the old group, in the move page's own sentence", async () => {
    // Amara is excused from Group A's week 5 and ticked its week 6 under "Most weeks, not all".
    world.db.seed(registerPath(A, 5), { runId: RUN.agi, groupId: A, weekNumber: 5, occurrence: 1, records: {}, excusedInAdvance: { amara: { at: new Date() } } });
    world.db.poke(seatPath("amara"), { timeAnswer: { kind: "mostWeeks", sessionKeys: ["w06"], forGroupId: A, at: new Date("2026-11-01T10:00:00Z") } });
    const page = await movePreview("amara", B);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    const line = page.body.preview.lines.find((each) => each.label === "Left behind");
    assert.equal(
      line?.text,
      "Amara was excused from Group A’s week 5 session. That no longer applies once Amara moves. Amara ticked Group A’s week 6 session under “Most weeks, not all”. That no longer applies once Amara moves.",
    );
    const shown = await preview([{ uid: "amara", groupId: B }]);
    assert.equal(
      shown.body.preview[0].words,
      "Move Amara Okafor to Group B from week 4?\n\nWeeks 1 to 3 stay with Group A, where Amara met.\n\n" +
        `${line.text}\n\n` +
        "Nobody is emailed now: Amara sees Group B straight away, and the next Publish emails them that they have moved.",
    );
  });

  test("the press: the record, both counts, a History row on each group, the seat told as before, nobody emailed", async () => {
    world.mail.length = 0;
    const placed = await place([{ uid: "amara", groupId: B, fromWeek: 4 }]);
    assert.deepEqual([placed.status, placed.body.placed, placed.body.rejected], [200, 1, []]);
    const now = seat("amara");
    assert.equal(now.groupId, B);
    assert.deepEqual(now.groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
    assert.equal(now.toldGroupId ?? enrolments.groupToldAbout(now), A, "told about Group A: the next Publish tells them");
    assert.ok(enrolments.movedSinceTold(now));
    assert.deepEqual([read(`courseGroups/${A}`).memberCount, read(`courseGroups/${B}`).memberCount], [3, 4]);
    assert.deepEqual(
      audits().map((row) => [row.kind, row.groupId, row.detail, row.emailed]).sort(),
      [
        ["member-moved", A, "Amara Okafor moved to Group B from week 4 on the Groups tab, to be told at the next Publish.", 0],
        ["member-moved", B, "Amara Okafor moved here from Group A, from week 4, on the Groups tab, to be told at the next Publish.", 0],
      ].sort(),
    );
    assert.equal(world.mail.length, 0, "a move on the board emails nobody");
  });

  test("a week sent back that no longer holds is refused in its sentence, and nothing is written", async () => {
    const before = everything();
    const placed = await place([{ uid: "amara", groupId: B, fromWeek: 3 }]);
    assert.deepEqual(placed.body.rejected, [{ uid: "amara", reason: "week-changed", words: "The move is now from week 4. Move Amara again to see what it does." }]);
    assert.equal(everything(), before);
  });

  test("a press with no week sent (Circles, the run's own board) still moves by the rule", async () => {
    const placed = await place([{ uid: "amara", groupId: B }]);
    assert.equal(placed.body.placed, 1);
    assert.deepEqual(seat("amara").groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
  });

  test("a preview answers a person this caller may not place as a move with nothing to say", async () => {
    // Tess facilitates no group here and leads nothing: the route's gate refuses her outright.
    const refused = await preview([{ uid: "amara", groupId: B }], "tess");
    assert.ok([403, 404].includes(refused.status), JSON.stringify(refused.body));
  });
});

// ---------------------------------------------------------------------------
// 3. The registers and their readers
// ---------------------------------------------------------------------------

describe("3. the weeks met stay met, on every reader, through a finished and a corrected register", () => {
  async function finishB(week) {
    at(week === 4 ? "2026-11-24T20:00:00Z" : "2026-11-17T20:00:00Z");
    const marks = [{ uid: "chloe", status: "present" }, { uid: "farah", status: "present" }, { uid: "kofi", status: "present" }];
    if (week === 4) marks.push({ uid: "amara", status: "present" });
    assert.equal((await call("rahul", registerRoute.POST, { groupId: B }, { body: { weekNumber: week, marks }, course: true })).status, 200);
    assert.equal((await call("rahul", pushRoute.POST, { groupId: B }, { body: { weekNumber: week }, course: true })).status, 200);
  }

  test("with the record: Group B's week 3 and week 4 finished, and Group A's week 2 corrected, Amara's three Group A weeks stay hers and are counted once", async () => {
    await place([{ uid: "amara", groupId: B, fromWeek: 4 }]);
    await finishB(3);
    assert.deepEqual(rollupOf("amara"), { attendedInFull: 3, excused: 0, absent: 0 }, "Group B's week 3 is not hers, and weeks 1 to 3 are Group A's");
    await finishB(4);
    assert.deepEqual(rollupOf("amara"), { attendedInFull: 4, excused: 0, absent: 0 });
    const row = await tabRow("amara");
    assert.equal(row.group, B, "one row, under the group she is in now");
    assert.deepEqual(row.cells.map(([week, , mark]) => [week, mark]), [
      [1, "present"],
      [2, "present"],
      [3, "present"],
      [4, "present"],
    ]);
    // A correction of Group A's week 2 by an admin reaches her figures.
    const corrected = await call("zach", registerRoute.PATCH, { groupId: A }, {
      body: { weekNumber: 2, marks: [{ uid: "amara", status: "absent" }], reason: "She was not there, as the session note says." },
      course: true,
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.deepEqual(rollupOf("amara"), { attendedInFull: 3, excused: 0, absent: 1 });
    // Four rows under Group B show a week 3 mark: her row shows Group A's mark for her week 3.
    const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi), { isAdmin: true }, new Date());
    const groupB = tab.groups.find((group) => group.id === B);
    const weekThree = groupB.people.filter((person) => person.cells.some((cell) => cell.weekNumber === 3 && cell.mark));
    assert.deepEqual(weekThree.map((person) => person.uid).sort(), ["amara", "chloe", "farah", "kofi"].sort());
    const amaraWeekThree = groupB.people.find((person) => person.uid === "amara").cells.find((cell) => cell.weekNumber === 3);
    assert.equal(amaraWeekThree.mark, "present", "her week 3 is Group A's mark, read under her row");
    // But Group B's own figure for week 3 counts its own register's marks only: three of three, not four.
    // Her week 4, Group B's, is counted there; her week 3 is counted in Group A's figure, once.
    const figure = (group, week) => {
      const total = tab.groups.find((each) => each.id === group).totals.find((each) => each.weekNumber === week);
      return [total.came, total.of];
    };
    assert.deepEqual(figure(B, 3), [3, 3]);
    assert.deepEqual(figure(B, 4), [4, 4]);
    assert.deepEqual(figure(A, 3), [3, 4], "Group A's week 3: its four, Amara among them");
  });

  test("the control, as the base did it: the same move for every week turns her Group A weeks into absences once Group B finishes a register", async () => {
    // What every move on the board wrote before: the group alone, no record.
    world.db.poke(seatPath("amara"), { groupId: B, toldGroupId: A });
    await finishB(3);
    const { absent } = rollupOf("amara");
    assert.ok(absent >= 2, `the fault this mends: ${JSON.stringify(rollupOf("amara"))}`);
  });
});

// ---------------------------------------------------------------------------
// 4. A record moved again, moved back, and written by hand
// ---------------------------------------------------------------------------

describe("4. a record moved again, moved back, and written by hand", () => {
  test("moved again after the new group met: the record is extended", async () => {
    await place([{ uid: "amara", groupId: B }]);
    at("2026-11-26T09:00:00Z");
    const placed = await place([{ uid: "amara", groupId: C }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    assert.deepEqual(seat("amara").groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }, { groupId: C, fromWeek: 5 }]);
  });

  test("moved back before the earlier move took effect: folded back, no record, nobody owed an email", async () => {
    await place([{ uid: "amara", groupId: B }]);
    const back = await place([{ uid: "amara", groupId: A }]);
    assert.deepEqual([back.body.placed, back.body.rejected], [1, []]);
    assert.equal(seat("amara").groupId, A);
    assert.equal("groupsByWeek" in read(seatPath("amara")), false);
    assert.equal(enrolments.movedSinceTold(seat("amara")), false);
  });

  test("a record written by hand ([{ old, 1 }, { new, N }]) moved on the board gives what the move page gives", async () => {
    const byHand = { groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }], toldGroupId: B };
    world.db.poke(seatPath("amara"), byHand);
    at("2026-11-18T09:00:00Z");
    assert.equal((await movePress("amara", C)).status, 200);
    const byPage = [seat("amara").groupId, seat("amara").groupsByWeek];
    w.reset();
    at("2026-11-18T09:00:00Z");
    world.db.poke(seatPath("amara"), byHand);
    const placed = await place([{ uid: "amara", groupId: C }]);
    assert.deepEqual(placed.body.rejected, []);
    assert.deepEqual([seat("amara").groupId, seat("amara").groupsByWeek], byPage);
    assert.deepEqual(byPage, [C, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }, { groupId: C, fromWeek: 4 }]]);
  });
});

// ---------------------------------------------------------------------------
// 5. Several at once
// ---------------------------------------------------------------------------

describe("5. several moved in one press", () => {
  test("each decided on its own: one refused in its sentence, the others written", async () => {
    const placed = await place([
      { uid: "amara", groupId: B },
      { uid: "chloe", groupId: D },
      { uid: "freya", groupId: A },
    ]);
    assert.equal(placed.status, 200);
    assert.equal(placed.body.placed, 2);
    assert.deepEqual(placed.body.rejected.map((each) => [each.uid, each.reason]), [["chloe", "no-week"]]);
    assert.match(placed.body.rejected[0].words, /^Group D has already met for week 3/);
    assert.deepEqual(seat("amara").groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
    assert.deepEqual(seat("freya").groupsByWeek, [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 4 }]);
    assert.equal(seat("chloe").groupId, B);
  });
});

// ---------------------------------------------------------------------------
// 6. Before the term, and a seat nobody has told
// ---------------------------------------------------------------------------

describe("6. a move before the term is the board's plain move, as always", () => {
  /** Every document a move changed, and how. */
  function changes(before, after) {
    const out = {};
    for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[path]) !== JSON.stringify(after[path])) out[path] = after[path] ?? null;
    }
    return out;
  }
  const snapshot = () => Object.fromEntries(world.db.paths().map((path) => [path, read(path)]));

  test("told, and no session of the group yet: the group, the told group and two counts, and nothing else", async () => {
    at("2026-10-20T12:00:00Z");
    const before = snapshot();
    const placed = await place([{ uid: "amara", groupId: B }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    const changed = changes(before, snapshot());
    assert.deepEqual(Object.keys(changed).sort(), [`courseGroups/${A}`, `courseGroups/${B}`, seatPath("amara")].sort());
    const was = before[seatPath("amara")];
    const { updatedAt: _a, ...now } = changed[seatPath("amara")];
    const { updatedAt: _b, ...then } = was;
    assert.deepEqual(now, { ...then, groupId: B, status: "active", ...(was.toldGroupId ? {} : { toldGroupId: A }) });
  });

  test("a seat nobody has told, mid-term: the board's plain move, no record", async () => {
    const placed = await place([{ uid: "una", groupId: B }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    assert.equal(seat("una").groupId, B);
    assert.equal("groupsByWeek" in read(seatPath("una")), false);
    assert.deepEqual(audits(), []);
  });

  // Changed on purpose: taking a told seat whose group has met out of every
  // group mid-term is refused now (section 10). Before the term it is the
  // board's plain move, byte for byte, as it always was.
  test("taking a told seat out of every group before the term: the group cleared, one count, and nothing else", async () => {
    at("2026-10-20T12:00:00Z");
    const before = snapshot();
    const placed = await place([{ uid: "amara", groupId: null }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    const changed = changes(before, snapshot());
    assert.deepEqual(Object.keys(changed).sort(), [`courseGroups/${A}`, seatPath("amara")].sort());
    const was = before[seatPath("amara")];
    const { updatedAt: _a, ...now } = changed[seatPath("amara")];
    const { updatedAt: _b, ...then } = was;
    assert.deepEqual(now, { ...then, groupId: null, status: "active", ...(was.toldGroupId ? {} : { toldGroupId: A }) });
    assert.equal(read(`courseGroups/${A}`).memberCount, 3);
    assert.deepEqual(audits(), []);
  });
});

// ---------------------------------------------------------------------------
// 7. Publish
// ---------------------------------------------------------------------------

describe("7. Publish after a move made mid-term on the board", () => {
  const wordsOf = async (message) => (await render(message.react)).replace(/<[^>]+>/g, " ").replace(/&#x27;|&rsquo;/g, "’").replace(/\s+/g, " ");

  test("“You’ve moved”, once, naming the first session of Group B she is due at (week 4, Tue 24 Nov), never tonight's week 3", async () => {
    await place([{ uid: "amara", groupId: B, fromWeek: 4 }]);
    world.mail.length = 0;
    assert.equal((await w.join.publish("zach")).status, 200);
    const toAmara = world.mail.filter((message) => message.to === "amara@example.com" && !message.subject.startsWith("[TEST]"));
    assert.deepEqual(toAmara.map((message) => message.subject), ["You’ve moved to Group B: Tuesdays at 6pm"]);
    const said = await wordsOf(toAmara[0]);
    assert.match(said, /You’re in Group B now\./);
    assert.match(said, /, from Tue 24 Nov\./);
    assert.doesNotMatch(said, /17 Nov/);
    assert.match(said, /You’re no longer in Group A, so you don’t need to go to its sessions\./);
    world.mail.length = 0;
    assert.equal((await w.join.publish("zach")).status, 200);
    assert.equal(world.mail.filter((message) => message.to === "amara@example.com").length, 0, "told once");
  });

  test("moved from a week nobody met with the old group: the first session named is the new group's that week", async () => {
    await callOff("rahul", B, 3, "2026-11-17");
    at("2026-11-18T09:00:00Z");
    await place([{ uid: "chloe", groupId: C, fromWeek: 3 }]);
    world.mail.length = 0;
    assert.equal((await w.join.publish("zach")).status, 200);
    const toChloe = world.mail.filter((message) => message.to === "chloe@example.com" && !message.subject.startsWith("[TEST]"));
    assert.deepEqual(toChloe.map((message) => message.subject), ["You’ve moved to Group C: Wednesdays at 1pm"]);
    assert.match(await wordsOf(toChloe[0]), /, from Wed 18 Nov\./);
  });
});

// ---------------------------------------------------------------------------
// 8. Remove, with a visit still to come
// ---------------------------------------------------------------------------

describe("8. Remove tells the host's facilitators of a visit still to come, beside the person and their group's", () => {
  const visit = (body) => call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body, course: true });
  async function arrange(weekNumber, hostGroupId) {
    const shown = await visit({ weekNumber, hostGroupId, preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal((await visit({ weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null })).status, 200);
  }
  const remove = (body) => call("claudia", removeRoute.POST, { runId: RUN.agi, uid: "chloe" }, { ...(body ? { body } : {}), course: true });

  // Changed on purpose (taking somebody off now asks first, and emails them
  // and the facilitators of the group they had been told): until then a
  // removal with no visit took no count and emailed nobody, and one with a
  // visit emailed the host's facilitators alone. tests/course-take-off.test.mjs
  // presses every case of the new sheet.
  test("with no visit: Chloe and Group B's facilitators, counted before the press", async () => {
    const shown = await remove({ preview: true });
    assert.deepEqual([shown.body.preview.emails, shown.body.preview.visits, shown.body.preview.sheet.go], [3, [], "Take Chloe off and email 3 people"]);
    world.mail.length = 0;
    const done = await remove({ emails: 3 });
    assert.deepEqual([done.status, done.body.said], [200, "Chloe is off AGI Strategy. 3 people were emailed."]);
    assert.deepEqual(
      world.mail.map((message) => [message.to, message.subject]),
      [
        ["chloe@example.com", "Your place on AGI Strategy has ended"],
        ["rahul@example.com", "Chloe has left Group B"],
        ["sofia@example.com", "Chloe has left Group B"],
      ],
    );
  });

  test("the count before the press, the host's facilitators sent the visit's called-off email beside the rest", async () => {
    await arrange(4, A);
    const shown = await remove({ preview: true });
    // Sofia facilitates both groups: two emails, one person, so the button counts three people.
    assert.deepEqual(
      [shown.body.preview.emails, shown.body.preview.visits, shown.body.preview.sheet.go],
      [4, [{ hostName: "Group A", weekNumber: 4 }], "Take Chloe off and email 3 people"],
    );
    world.mail.length = 0;
    const done = await remove({ emails: 4 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    await w.settle();
    assert.deepEqual(
      world.mail.map((message) => [message.to, message.subject]),
      [
        ["chloe@example.com", "Your place on AGI Strategy has ended"],
        ["rahul@example.com", "Chloe has left Group B"],
        ["sofia@example.com", "Chloe has left Group B"],
        ["sofia@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"],
      ],
    );
    assert.equal(done.body.said, "Chloe is off AGI Strategy. 3 people were emailed.");
    assert.equal(read(seatPath("chloe")).status, "removed");
    assert.equal(read(seatPath("chloe")).visits, undefined);
  });

  test("a changed count is refused with the count as it is now, and nothing is written", async () => {
    await arrange(4, A);
    const before = everything();
    for (const body of [undefined, { emails: 0 }, { emails: 3 }]) {
      const refused = await remove(body);
      assert.deepEqual([refused.status, refused.body.emails], [409, 4], JSON.stringify(body));
      assert.equal(refused.body.error, "Taking them off now emails 3 people, so nothing was changed. Check it, then press again.");
    }
    assert.equal(everything(), before);
  });

  test("at the visit limit the removal is refused with nothing written, and nobody is emailed", async () => {
    await arrange(4, A);
    world.db.seed(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`, { kind: "staff-email-throttle", key: `visitperson__${RUN.agi}__chloe`, windowStartAt: new Date(), count: 10, updatedAt: new Date() });
    const before = everything();
    world.mail.length = 0;
    const refused = await remove({ emails: 4 });
    assert.equal(refused.status, 429, JSON.stringify(refused.body));
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 9. A seat a move made mid-term frees, in the same press
// ---------------------------------------------------------------------------

describe("9. a seat a move made mid-term frees is free before it is taken, and no group is ever over its capacity", () => {
  /** Every group's count against its capacity, after every commit of the press. */
  function watchCapacity() {
    const over = [];
    const real = world.db.runTransaction.bind(world.db);
    world.db.runTransaction = async (fn) => {
      const result = await real(fn);
      for (const path of world.db.paths().filter((each) => /^courseGroups\/[^/]+$/.test(each))) {
        const group = read(path);
        if (typeof group.capacity === "number" && group.memberCount > group.capacity) over.push([path, group.memberCount, group.capacity]);
      }
      return result;
    };
    return { over, stop: () => (world.db.runTransaction = real) };
  }
  const membersOf = (groupId) =>
    world.db.paths().filter((path) => path.startsWith(`courseEnrolments/${RUN.agi}__`) && read(path).groupId === groupId && read(path).status === "active").length;

  for (const order of ["the move first", "the placement first"]) {
    test(`out of a full Group A mid-term, and Una into Group A, in one press (${order})`, async () => {
      world.db.poke(`courseGroups/${A}`, { capacity: 4 });
      const watch = watchCapacity();
      const both = [{ uid: "amara", groupId: B }, { uid: "una", groupId: A }];
      const placed = await place(order === "the move first" ? both : both.reverse());
      watch.stop();
      assert.deepEqual([placed.status, placed.body.placed, placed.body.rejected], [200, 2, []]);
      assert.deepEqual([seat("amara").groupId, seat("una").groupId], [B, A]);
      assert.deepEqual(seat("amara").groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
      assert.deepEqual([read(`courseGroups/${A}`).memberCount, membersOf(A)], [4, 4]);
      assert.deepEqual(watch.over, []);
    });
  }

  test("one seat freed and two wanting it: one placed, the other refused as full, Group A never over", async () => {
    world.db.poke(`courseGroups/${A}`, { capacity: 4 });
    const watch = watchCapacity();
    const placed = await place([{ uid: "amara", groupId: B }, { uid: "una", groupId: A }, { uid: "freya", groupId: A }]);
    watch.stop();
    assert.equal(placed.body.placed, 2);
    assert.deepEqual(placed.body.rejected, [{ uid: "una", reason: "group-full" }]);
    assert.deepEqual([seat("amara").groupId, seat("freya").groupId, seat("una").groupId], [B, A, C]);
    assert.deepEqual([read(`courseGroups/${A}`).memberCount, membersOf(A)], [4, 4]);
    assert.deepEqual(watch.over, []);
  });

  test("a move made mid-term that is refused frees nothing: nobody is placed into its seat", async () => {
    // Group B full at 3. Chloe's move out of it to Group D is refused (Group D has met week 3).
    world.db.poke(`courseGroups/${B}`, { capacity: 3 });
    const before = everything();
    const watch = watchCapacity();
    const placed = await place([{ uid: "chloe", groupId: D }, { uid: "una", groupId: B }]);
    watch.stop();
    assert.equal(placed.body.placed, 0);
    assert.deepEqual(placed.body.rejected.map((each) => [each.uid, each.reason]), [["una", "group-full"], ["chloe", "no-week"]]);
    assert.equal(everything(), before);
    assert.deepEqual(watch.over, []);
  });

  test("a chain in the order Circles sends it (Amara A to full B, Chloe B to C, Una C to full A): all three placed, no group ever over", async () => {
    // Una's placement is refused in the first round (A is full) and Amara's move too (B is full);
    // Chloe's move frees B, Amara's then frees A, and Una, refused two rounds back, is tried again.
    world.db.poke(`courseGroups/${A}`, { capacity: 4 });
    world.db.poke(`courseGroups/${B}`, { capacity: 3 });
    const watch = watchCapacity();
    const placed = await place([{ uid: "amara", groupId: B }, { uid: "chloe", groupId: C }, { uid: "una", groupId: A }]);
    watch.stop();
    assert.deepEqual([placed.status, placed.body.placed, placed.body.rejected], [200, 3, []]);
    assert.deepEqual([seat("amara").groupId, seat("chloe").groupId, seat("una").groupId], [B, C, A]);
    assert.deepEqual([read(`courseGroups/${A}`).memberCount, membersOf(A), read(`courseGroups/${B}`).memberCount, membersOf(B)], [4, 4, 3, 3]);
    assert.deepEqual(watch.over, []);
  });

  test("it always ends: a round follows only one in which a move made mid-term was written", async () => {
    let commits = 0;
    const real = world.db.runTransaction.bind(world.db);
    world.db.runTransaction = async (fn) => {
      commits += 1;
      return real(fn);
    };
    try {
      // Nothing is ever freed: Amara's move into full B is refused, so Una into full A is not tried again.
      world.db.poke(`courseGroups/${A}`, { capacity: 4 });
      world.db.poke(`courseGroups/${B}`, { capacity: 3 });
      const stuck = await place([{ uid: "amara", groupId: B }, { uid: "una", groupId: A }]);
      assert.deepEqual(stuck.body.rejected.map((each) => [each.uid, each.reason]).sort(), [["amara", "group-full"], ["una", "group-full"]]);
      assert.equal(commits, 2, "one round: the placements' chunk and Amara's one attempt");
      // The chain: two moves written, so at most three rounds, each a chunk and at most one attempt per move made mid-term.
      w.reset();
      for (const [groupId, count] of [[A, 4], [B, 3], [C, 2], [D, 2]]) world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
      world.db.poke(`courseGroups/${A}`, { capacity: 4 });
      world.db.poke(`courseGroups/${B}`, { capacity: 3 });
      commits = 0;
      const chain = await place([{ uid: "amara", groupId: B }, { uid: "chloe", groupId: C }, { uid: "una", groupId: A }]);
      assert.equal(chain.body.placed, 3);
      assert.ok(commits <= (2 + 1) * (1 + 2), `${commits} commits for two moves written`);
    } finally {
      world.db.runTransaction = real;
    }
  });

  test("two people swapped between two full groups are refused, as they always were: neither can go first", async () => {
    // Before the term too: the board has never placed a swap between two full groups.
    for (const when of ["2026-10-20T12:00:00Z", "2026-11-18T20:00:00Z"]) {
      w.reset();
      for (const [groupId, count] of [[A, 4], [B, 3], [C, 2], [D, 2]]) world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
      at(when);
      world.db.poke(`courseGroups/${A}`, { capacity: 4 });
      world.db.poke(`courseGroups/${B}`, { capacity: 3 });
      const before = everything();
      const placed = await place([{ uid: "amara", groupId: B }, { uid: "farah", groupId: A }]);
      assert.equal(placed.body.placed, 0, when);
      assert.deepEqual(placed.body.rejected.map((each) => each.reason).sort(), ["group-full", "group-full"], when);
      assert.equal(everything(), before, when);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Never into no group mid-term
// ---------------------------------------------------------------------------

describe("10. a told person whose group has met is never taken out of every group", () => {
  const POOL_WORDS =
    "Amara has already met with Group A, so Amara can’t be taken out of every group: the weeks met with Group A would be lost. " +
    "Move Amara straight to the new group instead, or take Amara off the run.";

  test("refused, in the board's sentence, before the press and at it, with nothing written", async () => {
    const shown = await preview([{ uid: "amara", groupId: null }]);
    assert.deepEqual(shown.body.preview, [{ uid: "amara", groupId: null, fromWeek: null, words: null, refusal: { reason: "mid-term-to-pool", words: POOL_WORDS } }]);
    const before = everything();
    const placed = await place([{ uid: "amara", groupId: null }]);
    assert.deepEqual([placed.status, placed.body.placed, placed.body.rejected], [200, 0, [{ uid: "amara", reason: "mid-term-to-pool", words: POOL_WORDS }]]);
    assert.equal(everything(), before);
  });

  test("a place with a record is refused too, and the record stays", async () => {
    await place([{ uid: "amara", groupId: B }]);
    const placed = await place([{ uid: "amara", groupId: null }]);
    assert.deepEqual(placed.body.rejected.map((each) => each.reason), ["mid-term-to-pool"]);
    assert.deepEqual(seat("amara").groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
  });

  test("one refused, the others in the same press as always: a seat nobody told goes to the pool", async () => {
    const placed = await place([{ uid: "amara", groupId: null }, { uid: "una", groupId: null }]);
    assert.equal(placed.body.placed, 1);
    assert.deepEqual(placed.body.rejected.map((each) => [each.uid, each.reason]), [["amara", "mid-term-to-pool"]]);
    assert.deepEqual([seat("amara").groupId, seat("una").groupId], [A, null]);
  });

  test("somebody whose only past session was called off met nobody: the pool takes them as before the term", async () => {
    // Group D meets on Mondays at 6pm; on Wed 4 Nov only its week 1 (Mon 2 Nov) has started. Called off, keeping pace.
    at("2026-11-04T12:00:00Z");
    world.db.poke(`courseGroups/${D}`, {
      sessionChanges: { w01: { kind: "cancelled", reason: "The room was flooded.", dateKey: "2026-11-02", byUid: "grace", at: new Date() } },
    });
    const shown = await preview([{ uid: "freya", groupId: null }]);
    assert.deepEqual(shown.body.preview[0].refusal, null);
    const placed = await place([{ uid: "freya", groupId: null }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    assert.equal(seat("freya").groupId, null);
    // And marked as not held on its register, the same.
    w.reset();
    at("2026-11-04T12:00:00Z");
    world.db.seed(registerPath(D, 1), { runId: RUN.agi, groupId: D, weekNumber: 1, occurrence: 1, records: {}, held: false, pushedAt: null, markedByUid: "grace" });
    assert.deepEqual((await place([{ uid: "freya", groupId: null }])).body.rejected, []);
    // Held, it is refused.
    w.reset();
    at("2026-11-04T12:00:00Z");
    assert.deepEqual((await place([{ uid: "freya", groupId: null }])).body.rejected.map((each) => each.reason), ["mid-term-to-pool"]);
  });

  test("a told place already in no group mid-term is placed by the plain move, as always", async () => {
    // As a place taken out before the refusal existed: told, in no group.
    world.db.poke(seatPath("amara"), { groupId: null, toldGroupId: A });
    world.db.poke(`courseGroups/${A}`, { memberCount: 3 });
    const placed = await place([{ uid: "amara", groupId: B }]);
    assert.deepEqual([placed.body.placed, placed.body.rejected], [1, []]);
    assert.equal(seat("amara").groupId, B);
    assert.equal("groupsByWeek" in read(seatPath("amara")), false);
    assert.deepEqual(audits(), []);
  });
});

// ---------------------------------------------------------------------------
// 11. Every board asks the one question
// ---------------------------------------------------------------------------

describe("11. the run's own board, People in groups and Circles ask the same question before a move made mid-term", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  test("one shared piece of code, called by each of the three boards, and no board asks it its own way", () => {
    for (const file of ["features/courses/AllocationBoard.tsx", "features/applications/groups/PeopleInGroups.tsx", "features/applications/circles/Circles.tsx"]) {
      const code = readFileSync(join(SRC, file), "utf8");
      assert.match(code, /\baskMidTermMoves\(/, `${file} asks through askMidTermMoves`);
      assert.doesNotMatch(code, /fromWeek\s*!==?\s*null\s*&&/, `${file} reads no preview's week itself`);
      // Each says a move the question knows will be refused before the press.
      assert.match(code, /\.refused\b/, `${file} does not say the refusals the question knows before the press`);
    }
  });

  test("it asks only about told people, in one confirmation, and sends each move's week back with the press", async () => {
    const { askMidTermMoves } = await w.loadTs(join("features", "courses", "askMidTermMoves.ts"));
    const asked = [];
    const questions = [];
    const preview = async (placements) => {
      asked.push(placements);
      return {
        ok: true,
        preview: [
          { uid: "amara", groupId: B, fromWeek: 4, words: "Move Amara?", refusal: null },
          { uid: "chloe", groupId: D, fromWeek: null, words: null, refusal: { reason: "no-week", words: "Group D has already met." } },
        ],
      };
    };
    const told = (uid) => uid !== "una";
    const placements = [{ uid: "amara", groupId: B }, { uid: "chloe", groupId: D }, { uid: "una", groupId: A }];
    const yes = await askMidTermMoves(placements, { told, preview, confirm: (question) => (questions.push(question), true) });
    assert.deepEqual(asked, [[{ uid: "amara", groupId: B }, { uid: "chloe", groupId: D }]], "Una, never told, is not asked about");
    assert.deepEqual(questions, ["Move Amara?"]);
    // Chloe's move is known to be refused: not pressed, and handed back to be said before the press.
    assert.deepEqual(yes, {
      go: true,
      placements: [{ uid: "amara", groupId: B, fromWeek: 4 }, { uid: "una", groupId: A }],
      refused: [{ uid: "chloe", reason: "no-week", words: "Group D has already met." }],
    });
    assert.deepEqual(await askMidTermMoves(placements, { told, preview, confirm: () => false }), { go: false, error: null }, "declined: nothing pressed");
    assert.deepEqual(await askMidTermMoves(placements, { told, preview: async () => ({ ok: false, error: "No." }), confirm: () => true }), { go: false, error: "No." });
    const nobodyTold = await askMidTermMoves(placements, { told: () => false, preview: async () => assert.fail("never asked"), confirm: () => assert.fail("never asked") });
    assert.deepEqual(nobodyTold, { go: true, placements, refused: [] });
  });
});
