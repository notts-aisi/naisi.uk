/**
 * The first arrangement of a programme's people into groups, run for real.
 *
 * Run with `npm test`. Pure: `src/lib/applications/arrange/plan.ts` has no
 * imports beyond types, so it is loaded through the shared TypeScript loader
 * and asked directly.
 *
 * What it guards (the plan's own rules, in its own words):
 *  - nobody who has been told moves;
 *  - the run's groups come first, and a group with no time is given one;
 *  - more groups only when they are needed;
 *  - as many people seated as can be, the most constrained first;
 *  - then the groups evened out;
 *  - somebody with no week, or whose week makes no group, is left for a
 *    person, with that reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const { planGroups, slotFor, canMake } = await loadTs("lib/applications/arrange/plan.ts");

const MINUTES = 90;
const TUE_18 = { weekday: 2, start: 18 * 60 };
const WED_18 = { weekday: 3, start: 18 * 60 };
const THU_18 = { weekday: 4, start: 18 * 60 };

/** A week free exactly at these times. */
const freeAt = (...times) => ({
  kind: "given",
  covers: (session) => times.some((t) => slotFor(t, MINUTES).weekday === session.weekday && slotFor(t, MINUTES).startTimeLocal === session.startTimeLocal),
});
const person = (uid, week, over = {}) => ({ uid, name: uid, week, facilitates: false, groupId: null, told: false, ...over });
const names = (taken) => `Group ${String.fromCharCode(65 + taken.length)}`;
const plan = (people, groups = [], over = {}) =>
  planGroups({ people, groups, best: [TUE_18, WED_18, THU_18], minutes: MINUTES, size: 3, names, ...over });
const membersOf = (result) => result.groups.map((group) => [...group.memberUids].sort());

test("everybody who can be seated is, and nobody twice", () => {
  const people = ["a", "b", "c", "d", "e", "f"].map((uid) => person(uid, freeAt(TUE_18, WED_18)));
  const result = plan(people);
  const seated = result.groups.flatMap((group) => group.memberUids);
  assert.equal(seated.length, 6);
  assert.equal(new Set(seated).size, 6);
  assert.deepEqual(result.unplaced, []);
});

test("only as many groups as the people need, at the best times no group meets at", () => {
  const people = ["a", "b", "c", "d"].map((uid) => person(uid, freeAt(TUE_18, WED_18, THU_18)));
  const result = plan(people);
  assert.equal(result.groups.length, 2, "four people at three a group need two groups");
  assert.deepEqual(result.groups.map((g) => g.session.weekday), [2, 3]);
  assert.ok(result.groups.every((g) => g.id === null && g.timeIsNew));
});

test("the run's groups come first, and one with no time is given the best free start", () => {
  const groups = [
    { id: "g1", name: "Group A", session: slotFor(WED_18, MINUTES), capacity: 8 },
    { id: "g2", name: "Group B", session: null, capacity: 8 },
  ];
  const people = ["a", "b"].map((uid) => person(uid, freeAt(TUE_18, WED_18)));
  const result = plan(people, groups);
  assert.equal(result.groups[0].id, "g1");
  assert.equal(result.groups[0].timeIsNew, false);
  assert.equal(result.groups[1].id, "g2");
  assert.equal(result.groups[1].session.weekday, 2, "Tuesday was the best start no group met at");
  assert.equal(result.groups[1].timeIsNew, true);
});

test("the most constrained are seated, by moving somebody who had a choice", () => {
  // b can only make Tuesday; a can make either. With one place each, a must
  // give Tuesday up for b.
  const groups = [
    { id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 1 },
    { id: "wed", name: "Wed", session: slotFor(WED_18, MINUTES), capacity: 1 },
  ];
  const result = plan([person("a", freeAt(TUE_18, WED_18)), person("b", freeAt(TUE_18))], groups, { best: [] });
  assert.deepEqual(membersOf(result), [["b"], ["a"]]);
  assert.deepEqual(result.unplaced, []);
});

test("the groups are evened out", () => {
  const groups = [
    { id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 10 },
    { id: "wed", name: "Wed", session: slotFor(WED_18, MINUTES), capacity: 10 },
  ];
  const people = ["a", "b", "c", "d", "e", "f"].map((uid) => person(uid, freeAt(TUE_18, WED_18)));
  const sizes = plan(people, groups, { best: [] }).groups.map((g) => g.memberUids.length);
  assert.ok(Math.abs(sizes[0] - sizes[1]) <= 1, `sizes ${sizes}`);
});

test("nobody who has been told moves, and they count against the room", () => {
  const groups = [
    { id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 1 },
    { id: "wed", name: "Wed", session: slotFor(WED_18, MINUTES), capacity: 1 },
  ];
  const result = plan(
    [person("told", freeAt(WED_18), { groupId: "tue", told: true }), person("new", freeAt(TUE_18, WED_18))],
    groups,
    { best: [] },
  );
  assert.deepEqual(result.keptUids, ["told"]);
  assert.deepEqual(membersOf(result), [["told"], ["new"]]);
});

test("no week, and a week that makes no group, are left for a person with the reason", () => {
  const groups = [{ id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 5 }];
  const result = plan(
    [person("blank", { kind: "none-given" }), person("busy", freeAt(THU_18)), person("ok", freeAt(TUE_18))],
    groups,
    { best: [] },
  );
  assert.deepEqual(result.unplaced, [
    { uid: "blank", reason: "no-week" },
    { uid: "busy", reason: "fits-none" },
  ]);
});

test("a full group leaves the one who does not fit, saying there was no room", () => {
  const groups = [{ id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 1 }];
  const result = plan([person("a", freeAt(TUE_18)), person("b", freeAt(TUE_18))], groups, { best: [] });
  assert.equal(result.unplaced.length, 1);
  assert.equal(result.unplaced[0].reason, "no-room");
});

test("whoever is seated can make their group", () => {
  const people = Array.from({ length: 20 }, (_, i) =>
    person(`p${i}`, freeAt(...[TUE_18, WED_18, THU_18].filter((_, j) => (i + j) % 3 !== 0))),
  );
  const result = plan(people);
  const byUid = new Map(people.map((p) => [p.uid, p]));
  for (const group of result.groups) {
    for (const uid of group.memberUids) assert.ok(canMake(byUid.get(uid), group.session), `${uid} cannot make ${group.name}`);
    assert.ok(group.memberUids.length <= group.room);
  }
});

// ---------------------------------------------------------------------------
// Somebody who marked little time (under four hours in the week)
// ---------------------------------------------------------------------------

const availability = await loadTs("lib/admissions/availability.ts");
const { paintedWeekOf, LITTLE_MARKED_MINUTES } = await loadTs("lib/applications/handover/paintedWeek.ts");
const { nearness } = await loadTs("lib/applications/arrange/plan.ts");
const { timesPicture } = await loadTs("lib/applications/handover/times.ts");

/** The form's grid: 09:00 to 21:00 in quarter hours. */
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

/** A sent application whose week marks `[weekday, from, to]` ranges (minutes past midnight). */
function sentWith(...ranges) {
  const count = (GRID.endMinute - GRID.startMinute) / GRID.slotMinutes;
  const days = Array.from({ length: 7 }, () => Array.from({ length: count }, () => false));
  for (const [weekday, from, to] of ranges) {
    for (let m = from; m < to; m += GRID.slotMinutes) days[weekday][(m - GRID.startMinute) / GRID.slotMinutes] = true;
  }
  return { sent: { availability: { ...GRID, days: availability.encodeMask(days, GRID) } } };
}
const at = (weekday, hhmm, minutes = 120) => ({ weekday, startTimeLocal: hhmm, durationMinutes: minutes });

test("an hour on three evenings is under four hours, so it is read as free from then until the grid closes", () => {
  const week = paintedWeekOf(GRID, sentWith([1, 18 * 60, 19 * 60], [3, 18 * 60, 19 * 60], [4, 18 * 60, 19 * 60]));
  assert.equal(LITTLE_MARKED_MINUTES, 240);
  assert.equal(week.minimal, true);
  assert.equal(week.covers(at(1, "18:00")), true, "Monday 6pm to 8pm: from their hour onwards");
  assert.equal(week.covers(at(1, "19:00")), true, "Monday 7pm to 9pm, ending as the grid closes");
  assert.equal(week.covers(at(1, "17:00")), false, "before their hour");
  assert.equal(week.covers(at(2, "19:00")), false, "a day they marked nothing");
  assert.deepEqual(week.firstMarks, [null, 1080, null, 1080, 1080, null, null]);
});

test("a real week is read exactly as marked", () => {
  const week = paintedWeekOf(GRID, sentWith([1, 17 * 60, 21 * 60], [3, 17 * 60, 21 * 60]));
  assert.equal(week.minimal, false);
  assert.equal(week.covers(at(1, "18:00")), true);
  assert.equal(week.covers(at(2, "18:00")), false);
  assert.equal(week.covers(at(1, "10:00")), false);
});

test("people who marked little time do not choose when groups meet", () => {
  const people = [
    { uid: "a", name: "a", week: paintedWeekOf(GRID, sentWith([2, 17 * 60, 21 * 60])) },
    { uid: "m", name: "m", week: paintedWeekOf(GRID, sentWith([1, 18 * 60, 19 * 60])) },
  ];
  const picture = timesPicture({ grid: GRID, minutes: 120, people, groups: [] });
  assert.equal(picture.said, 2);
  assert.equal(picture.littleMarked, 1);
  const total = picture.counts.flat().reduce((sum, n) => sum + n, 0);
  const tuesday = picture.counts.map((row) => row[1]).reduce((sum, n) => sum + n, 0);
  assert.equal(total, tuesday, "only the real week's Tuesday is counted; the little-marked Monday chooses nothing");
});

test("everybody who marked a real week is seated before anybody who marked little time", () => {
  // One seat on Tuesday. The little-marked person could make it too, but the real week gets it.
  const real = person("z-real", freeAt(TUE_18));
  const little = person("a-little", { ...freeAt(TUE_18), minimal: true, firstMarks: [null, null, 1080, null, null, null, null] });
  const groups = [{ id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 1 }];
  // No spare start times, so no group is added: the one seat is the question.
  const result = plan([little, real], groups, { best: [] });
  assert.deepEqual(result.groups[0].memberUids, ["z-real"]);
  assert.deepEqual(result.unplaced, [{ uid: "a-little", reason: "no-room" }]);
  assert.deepEqual(result.nearUids, []);
});

test("somebody who marked little time and fits no group goes to the nearest one after their time, flagged", () => {
  // Marked Wednesday 7pm. Groups meet Tuesday 6pm and Thursday 6pm: neither is a Wednesday.
  const little = person("m", { kind: "given", covers: () => false, minimal: true, firstMarks: [null, null, null, 1140, null, null, null] });
  const groups = [
    { id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 3 },
    { id: "thu", name: "Thu", session: slotFor(THU_18, MINUTES), capacity: 3 },
  ];
  const result = plan([little], groups);
  assert.deepEqual(result.nearUids, ["m"]);
  assert.deepEqual(result.unplaced, []);
  assert.ok(result.groups.some((g) => g.memberUids.includes("m")));
  // Nearness: after their time on their own day first, then after it on another day, then before.
  assert.deepEqual(nearness([null, null, null, 1140, null, null, null], slotFor({ weekday: 3, start: 1200 }, 90)), [0, 60]);
  assert.deepEqual(nearness([null, null, null, 1140, null, null, null], slotFor({ weekday: 3, start: 1080 }, 90)), [2, 60]);
  assert.deepEqual(nearness([null, null, null, 1140, null, null, null], slotFor({ weekday: 4, start: 1200 }, 90)), [1, 60]);
  assert.deepEqual(nearness([null, null, null, 1140, null, null, null], slotFor({ weekday: 4, start: 1080 }, 90)), [3, 60]);
});

test("somebody who marked a real week that fits no group is still left for a person", () => {
  const groups = [{ id: "tue", name: "Tue", session: slotFor(TUE_18, MINUTES), capacity: 3 }];
  const result = plan([person("r", freeAt(WED_18))], groups);
  assert.deepEqual(result.unplaced, [{ uid: "r", reason: "fits-none" }]);
  assert.deepEqual(result.nearUids, []);
});
