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
 *     the same documents written as always and nothing else.
 *  7. PUBLISH after a mid-term board move: "You’ve moved" once, naming the
 *     first session of the new group they are due at, never the new group's
 *     week still spent in the old group.
 *  8. REMOVE with a visit still to come: the count before the press, the
 *     host's facilitators told, a changed count and the limit refused with
 *     nothing written.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Tue 17 Nov 2026 at noon. Group A meets on Thursdays at 6pm (Sofia) and met
 * week 3 on Thu 12 Nov; Group B on Tuesdays at 6pm (Rahul and Sofia), week 3
 * tonight; Group C on Wednesdays at 1pm (Tom), week 3 tomorrow; Group D on
 * Mondays at 6pm (Grace), week 3 yesterday. Claudia leads the programme.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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
    assert.match(both.board, /^Group D has already met for week 3, so Chloe can’t join it for that week\./);
    const placed = await place([{ uid: "chloe", groupId: D }]);
    assert.deepEqual(placed.body.rejected.map((each) => [each.uid, each.reason]), [["chloe", "no-week"]]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. The board's move made mid-term
// ---------------------------------------------------------------------------

describe("2. a move on the board mid-term goes through the writer", () => {
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
    // Group B's own figure for week 3 counts its own register's marks only: three, not four.
    const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(world.courseDb, RUN.agi), { isAdmin: true }, new Date());
    const groupB = tab.groups.find((group) => group.id === B);
    const weekThree = groupB.people.filter((person) => person.cells.some((cell) => cell.weekNumber === 3 && cell.mark));
    assert.deepEqual(weekThree.map((person) => person.uid).sort(), ["amara", "chloe", "farah", "kofi"].sort());
    const amaraWeekThree = groupB.people.find((person) => person.uid === "amara").cells.find((cell) => cell.weekNumber === 3);
    assert.equal(amaraWeekThree.mark, "present", "her week 3 is Group A's mark, read under her row");
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

  test("taking a told seat out of every group mid-term is as always: no record, no row", async () => {
    const placed = await place([{ uid: "amara", groupId: null }]);
    assert.equal(placed.body.placed, 1);
    assert.equal(seat("amara").groupId, null);
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
    assert.equal((await w.join.publish("claudia")).status, 200);
    const toAmara = world.mail.filter((message) => message.to === "amara@example.com" && !message.subject.startsWith("[TEST]"));
    assert.deepEqual(toAmara.map((message) => message.subject), ["You’ve moved to Group B: Tuesdays at 6pm"]);
    const said = await wordsOf(toAmara[0]);
    assert.match(said, /You’re in Group B now\./);
    assert.match(said, /, from Tue 24 Nov\./);
    assert.doesNotMatch(said, /17 Nov/);
    assert.match(said, /You’re no longer in Group A, so you don’t need to go to its sessions\./);
    world.mail.length = 0;
    assert.equal((await w.join.publish("claudia")).status, 200);
    assert.equal(world.mail.filter((message) => message.to === "amara@example.com").length, 0, "told once");
  });

  test("moved from a week nobody met with the old group: the first session named is the new group's that week", async () => {
    await callOff("rahul", B, 3, "2026-11-17");
    at("2026-11-18T09:00:00Z");
    await place([{ uid: "chloe", groupId: C, fromWeek: 3 }]);
    world.mail.length = 0;
    assert.equal((await w.join.publish("claudia")).status, 200);
    const toChloe = world.mail.filter((message) => message.to === "chloe@example.com" && !message.subject.startsWith("[TEST]"));
    assert.deepEqual(toChloe.map((message) => message.subject), ["You’ve moved to Group C: Wednesdays at 1pm"]);
    assert.match(await wordsOf(toChloe[0]), /, from Wed 18 Nov\./);
  });
});

// ---------------------------------------------------------------------------
// 8. Remove, with a visit still to come
// ---------------------------------------------------------------------------

describe("8. Remove tells the host's facilitators of a visit still to come", () => {
  const visit = (body) => call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body, course: true });
  async function arrange(weekNumber, hostGroupId) {
    const shown = await visit({ weekNumber, hostGroupId, preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal((await visit({ weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null })).status, 200);
  }
  const remove = (body) => call("claudia", removeRoute.POST, { runId: RUN.agi, uid: "chloe" }, { ...(body ? { body } : {}), course: true });

  test("with no visit: no count, the same answer and nothing sent, as always", async () => {
    const shown = await remove({ preview: true });
    assert.deepEqual(shown.body, { ok: true, preview: { emails: 0, visits: [] } });
    world.mail.length = 0;
    const done = await remove();
    assert.deepEqual([done.status, done.body], [200, { ok: true }]);
    assert.equal(world.mail.length, 0);
  });

  test("the count before the press, the host's facilitators sent the visit's called-off email, the person nothing", async () => {
    await arrange(4, A);
    const shown = await remove({ preview: true });
    assert.deepEqual(shown.body.preview, { emails: 1, visits: [{ hostName: "Group A", weekNumber: 4 }] });
    world.mail.length = 0;
    const done = await remove({ emails: 1 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    await w.settle();
    assert.deepEqual(world.mail.map((message) => [message.to, message.subject]), [["sofia@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"]]);
    assert.equal(read(seatPath("chloe")).status, "removed");
    assert.equal(read(seatPath("chloe")).visits, undefined);
  });

  test("a changed count is refused with the count as it is now, and nothing is written", async () => {
    await arrange(4, A);
    const before = everything();
    const refused = await remove({ emails: 0 });
    assert.deepEqual([refused.status, refused.body.emails], [409, 1]);
    assert.equal(refused.body.error, "Taking them off the run now emails 1 person about their visits, so nothing was changed. Check it, then press again.");
    assert.equal(everything(), before);
  });

  test("at the visit limit the removal is refused with nothing written, and nobody is emailed", async () => {
    await arrange(4, A);
    world.db.seed(`courseNudges/emailrate__visitperson__${RUN.agi}__chloe`, { kind: "staff-email-throttle", key: `visitperson__${RUN.agi}__chloe`, windowStartAt: new Date(), count: 10, updatedAt: new Date() });
    const before = everything();
    world.mail.length = 0;
    const refused = await remove({ emails: 1 });
    assert.equal(refused.status, 429, JSON.stringify(refused.body));
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });
});
