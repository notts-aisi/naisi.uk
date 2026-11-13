/**
 * Which group a person was in, week by week: the record on a place
 * (`groupsByWeek` on `courseEnrolments`), its normaliser, the one function
 * every reader of a week's group asks (`groupForWeek`), and the helpers made
 * of it (`src/lib/courses/groupsByWeek.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The rule: a place with no record reads the group it is in now for every
 * week, exactly as every reader read it before the record existed. A place
 * with a record reads each week's group from it. A record the normaliser
 * cannot read whole, or one that contradicts the place's group, is no record.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const byWeek = await loadTs(join("lib", "courses", "groupsByWeek.ts"));
const { groupForWeek, normalizeCourseEnrolment } = enrolments;

const A = "group-a";
const B = "group-b";
const C = "group-c";

/** A place as the normaliser reads it from stored data. */
function place(data) {
  return normalizeCourseEnrolment("run__uid", { runId: "run", uid: "uid", status: "active", role: "learner", ...data });
}

describe("groupForWeek", () => {
  test("no record: the group they are in now, for every week", () => {
    const seat = place({ groupId: B });
    assert.equal(seat.groupsByWeek, undefined);
    for (const week of [1, 2, 3, 6, 12]) assert.equal(groupForWeek(seat, week), B);
  });

  test("no record and no group: no group for any week", () => {
    const seat = place({ groupId: null });
    assert.equal(groupForWeek(seat, 1), null);
  });

  test("one move: the old group before the week, the new from it", () => {
    const seat = place({ groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }] });
    assert.deepEqual(seat.groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }]);
    assert.deepEqual([1, 2, 3, 4, 6].map((week) => groupForWeek(seat, week)), [A, A, B, B, B]);
  });

  test("two moves: each stretch its own group", () => {
    const seat = place({
      groupId: C,
      groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }, { groupId: C, fromWeek: 5 }],
    });
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((week) => groupForWeek(seat, week)), [A, A, B, B, C, C]);
  });

  test("a move back: the first group again from the week they went back", () => {
    const seat = place({
      groupId: A,
      groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }, { groupId: A, fromWeek: 5 }],
    });
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((week) => groupForWeek(seat, week)), [A, A, B, B, A, A]);
  });

  test("a move from week 1 needs no record: the new group for every week", () => {
    assert.equal(byWeek.recordAfterMove({ groupId: A }, B, 1), null);
    const seat = place({ groupId: B, groupsByWeek: [{ groupId: B, fromWeek: 1 }] });
    assert.equal(seat.groupsByWeek, undefined);
    assert.equal(groupForWeek(seat, 1), B);
  });

  test("a week before they joined reads the group they joined; the reader's own floor says whether they had", () => {
    const seat = place({
      groupId: B,
      joinedWeekNumber: 3,
      groupsByWeek: [{ groupId: A, fromWeek: 3 }, { groupId: B, fromWeek: 5 }],
    });
    assert.equal(seat.joinedWeekNumber, 3);
    assert.deepEqual([1, 2, 3, 4, 5].map((week) => groupForWeek(seat, week)), [A, A, A, A, B]);
  });

  test("a group that no longer exists is still the answer for its weeks", () => {
    const seat = place({ groupId: B, groupsByWeek: [{ groupId: "gone", fromWeek: 1 }, { groupId: B, fromWeek: 2 }] });
    assert.equal(groupForWeek(seat, 1), "gone");
    assert.equal(groupForWeek(seat, 2), B);
  });

  test("a week that is not a number reads the group they are in now", () => {
    const seat = place({ groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }] });
    assert.equal(groupForWeek(seat, Number.NaN), B);
  });
});

describe("the normaliser reads a record whole or not at all", () => {
  const good = [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }];

  test("a record that contradicts the place (its last group is not the place's) is no record", () => {
    const seat = place({ groupId: C, groupsByWeek: good });
    assert.equal(seat.groupsByWeek, undefined);
    assert.deepEqual([1, 2, 3].map((week) => groupForWeek(seat, week)), [C, C, C]);
  });

  test("a record on a place in no group is no record", () => {
    assert.equal(place({ groupId: null, groupsByWeek: good }).groupsByWeek, undefined);
  });

  for (const [what, stored] of [
    ["not a list", { groupId: A, fromWeek: 1 }],
    ["an empty list", []],
    ["an entry that is not an object", [good[0], "b"]],
    ["an entry with no group", [good[0], { fromWeek: 3 }]],
    ["a group id with a path separator", [{ groupId: "a/b", fromWeek: 1 }, good[1]]],
    ["a week that is not whole", [good[0], { groupId: B, fromWeek: 2.5 }]],
    ["a week below 1", [{ groupId: A, fromWeek: 0 }, good[1]]],
    ["a week past the limit", [good[0], { groupId: B, fromWeek: 61 }]],
    ["a week given as text", [good[0], { groupId: B, fromWeek: "3" }]],
    ["two entries from one week", [good[0], { groupId: C, fromWeek: 3 }, { groupId: B, fromWeek: 3 }]],
    ["weeks out of order", [{ groupId: A, fromWeek: 3 }, { groupId: B, fromWeek: 1 }]],
    ["too many entries", Array.from({ length: 61 }, (_, i) => ({ groupId: i % 2 ? B : A, fromWeek: i + 1 }))],
  ]) {
    test(`${what} is no record`, () => {
      const seat = place({ groupId: B, groupsByWeek: stored });
      assert.equal(seat.groupsByWeek, undefined);
      assert.equal(groupForWeek(seat, 1), B);
    });
  }

  test("two entries in a row naming one group read as one", () => {
    const seat = place({
      groupId: B,
      groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: A, fromWeek: 2 }, { groupId: B, fromWeek: 4 }],
    });
    assert.deepEqual(seat.groupsByWeek, [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 4 }]);
  });

  test("a record naming one group says nothing the place does not, and reads as none", () => {
    assert.equal(place({ groupId: B, groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: B, fromWeek: 4 }] }).groupsByWeek, undefined);
  });

  test("extra keys on an entry are not carried", () => {
    const seat = place({ groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1, note: "x" }, { groupId: B, fromWeek: 3 }] });
    assert.deepEqual(seat.groupsByWeek, good);
  });
});

describe("the helpers made of the one function", () => {
  const mover = { groupId: B, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }] };
  const stayer = { groupId: B };

  test("stretches: no record is one stretch from week 1 for good", () => {
    assert.deepEqual(byWeek.groupStretchesOf(stayer), [{ groupId: B, fromWeek: 1, untilWeek: null }]);
    assert.deepEqual(byWeek.groupStretchesOf({ groupId: null }), []);
  });

  test("stretches: a mover's are each group's weeks", () => {
    assert.deepEqual(byWeek.groupStretchesOf(mover), [
      { groupId: A, fromWeek: 1, untilWeek: 3 },
      { groupId: B, fromWeek: 3, untilWeek: null },
    ]);
    assert.deepEqual(byWeek.stretchesIn(mover, A), [{ groupId: A, fromWeek: 1, untilWeek: 3 }]);
    assert.equal(byWeek.everInGroup(mover, A), true);
    assert.equal(byWeek.everInGroup(mover, C), false);
    assert.equal(byWeek.everInGroup(stayer, A), false);
    assert.deepEqual(byWeek.groupsOfWeeks(mover), [A, B]);
    assert.equal(byWeek.inGroupForWeek(mover, A, 2), true);
    assert.equal(byWeek.inGroupForWeek(mover, A, 3), false);
  });

  const sessions = (groupId, weeks) =>
    weeks.map((weekNumber) => ({ weekNumber, occurrence: 1, sessionKey: `w0${weekNumber}`, groupId }));

  test("sessions by week group: no record is the place's group's sessions, untouched", () => {
    const own = sessions(B, [1, 2, 3]);
    const out = byWeek.sessionsByWeekGroup(stayer, (id) => (id === B ? own : null));
    assert.deepEqual(out, own);
  });

  test("sessions by week group: a mover's weeks come from each week's group", () => {
    const out = byWeek.sessionsByWeekGroup(mover, (id) => sessions(id, [1, 2, 3, 4]));
    assert.deepEqual(out.map((s) => [s.weekNumber, s.groupId]), [[1, A], [2, A], [3, B], [4, B]]);
    const paired = byWeek.sessionsWithGroup(mover, (id) => sessions(id, [1, 2, 3, 4]));
    assert.deepEqual(paired.map((p) => [p.session.weekNumber, p.groupId]), [[1, A], [2, A], [3, B], [4, B]]);
  });

  test("sessions by week group: a group that no longer meets holds no session for its weeks", () => {
    const out = byWeek.sessionsByWeekGroup(mover, (id) => (id === A ? null : sessions(id, [1, 2, 3, 4])));
    assert.deepEqual(out.map((s) => s.weekNumber), [3, 4]);
  });

  test("the record a move leaves: ordered, one entry a week, ending in the new group", () => {
    assert.deepEqual(byWeek.recordAfterMove(stayer, C, 4), [{ groupId: B, fromWeek: 1 }, { groupId: C, fromWeek: 4 }]);
    assert.deepEqual(byWeek.recordAfterMove(mover, C, 5), [
      { groupId: A, fromWeek: 1 },
      { groupId: B, fromWeek: 3 },
      { groupId: C, fromWeek: 5 },
    ]);
    // From the week of an entry already there: that entry gives way.
    assert.deepEqual(byWeek.recordAfterMove(mover, C, 3), [{ groupId: A, fromWeek: 1 }, { groupId: C, fromWeek: 3 }]);
    // From before it: every later entry gives way.
    assert.deepEqual(byWeek.recordAfterMove(mover, C, 2), [{ groupId: A, fromWeek: 1 }, { groupId: C, fromWeek: 2 }]);
    // Back to the first group over every week it changed: no record.
    assert.equal(byWeek.recordAfterMove(mover, A, 3), null);
    // A move back from a later week keeps the weeks in between.
    assert.deepEqual(byWeek.recordAfterMove(mover, A, 5), [
      { groupId: A, fromWeek: 1 },
      { groupId: B, fromWeek: 3 },
      { groupId: A, fromWeek: 5 },
    ]);
  });

  test("the record a move leaves is one the normaliser reads back as it was written", () => {
    for (const [seat, to, from] of [
      [stayer, C, 4],
      [mover, C, 5],
      [mover, A, 5],
      [mover, C, 2],
    ]) {
      const record = byWeek.recordAfterMove(seat, to, from);
      assert.deepEqual(place({ groupId: to, groupsByWeek: record }).groupsByWeek, record);
    }
  });

  test("weeks a move can be made from", () => {
    assert.equal(byWeek.isMoveWeek(1), true);
    assert.equal(byWeek.isMoveWeek(60), true);
    for (const bad of [0, 61, 2.5, "3", null, Number.NaN]) assert.equal(byWeek.isMoveWeek(bad), false);
  });
});
