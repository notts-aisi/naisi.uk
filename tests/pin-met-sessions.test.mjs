/**
 * The plan behind `scripts/pin-met-sessions.mjs`: which weeks that met now
 * resolve to another start, and the override that pins each back.
 *
 * Run with `npm test` (no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE SCRIPT DATES WEEKS AS THE SITE DOES. The script is plain JavaScript
 *     and cannot import the site's resolver, so its own dating is held to
 *     `resolveSessions` over every shape below: the run's plan, a group's own
 *     plan with a break, overrides of a day or a start, and both sides of the
 *     autumn clock change. A drift fails here, not on production.
 *  2. ONLY A WEEK THAT MET. A register that was taken (finished, marked, or
 *     said not to have happened) and holds `sessionAt` is compared; a
 *     register holding only words in advance is not. `registerIsTaken` is
 *     held to the site's own over the same table.
 *  3. THE PIN. The week is given the weekday and the start of `sessionAt` in
 *     London time, keeping the rest of its override, and then resolves to the
 *     register's start. Run again, it plans nothing.
 *  4. WHAT IS NEVER WRITTEN. A week whose override already has its own day or
 *     start (a one-week change made through the site), and a start outside the
 *     week's own seven days, are reported and left alone.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";
import {
  londonPartsOf,
  londonWallClockToInstant,
  planGroupPins,
  registerIsTaken,
  resolveWeekStarts,
} from "../scripts/lib/pinMetSessions.mjs";

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const sessions = await loadTs("lib/courses/sessions.ts");
const groups = await loadTs("lib/firestore/courseGroups.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const attendance = await loadTs("lib/firestore/courseAttendance.ts");

const weeks = (n, breakAfter = null) => {
  const plan = [];
  for (let i = 1; i <= n; i += 1) {
    plan.push({ kind: "week", weekNumber: i, weekId: `w${String(i).padStart(2, "0")}` });
    if (i === breakAfter) plan.push({ kind: "break", label: "Reading week" });
  }
  return plan;
};

/** A run that starts on Mon 2 Nov 2026, six taught weeks: this term's. */
const RUN = { startDate: "2026-11-02", weekPlan: weeks(6), courseId: "c", label: "Autumn", status: "running" };
/** A run that starts on Mon 19 Oct 2026: its second week is the first after the clocks go back (Sun 25 Oct). */
const AUTUMN = { startDate: "2026-10-19", weekPlan: weeks(4), courseId: "c", label: "Clocks", status: "running" };

const slot = (weekday, startTimeLocal) => ({
  weekday,
  startTimeLocal,
  durationMinutes: 120,
  location: "Portland A21",
  meetingUrl: null,
  notes: "",
});

/** Each week's first-session start, as the site resolves it, by week number. */
function siteStarts(run, group) {
  const normalRun = courses.normalizeCourseRun("run", run);
  const normalGroup = groups.normalizeCourseGroup("g", { runId: "run", name: "Group", ...group });
  return new Map(
    sessions
      .resolveSessions(normalRun, normalGroup)
      .filter((session) => session.occurrence === 1)
      .map((session) => [session.weekNumber, sessions.sessionInstants(session).startsAt?.toISOString() ?? null]),
  );
}

function scriptStarts(run, group) {
  return new Map(resolveWeekStarts(run, group).map((week) => [week.weekNumber, week.startsAt?.toISOString() ?? null]));
}

/** A register that was taken: finished, with the start its session had. */
const finished = (weekNumber, sessionAt) => ({
  id: `run__g__w${String(weekNumber).padStart(2, "0")}`,
  data: { weekNumber, occurrence: 1, pushedAt: new Date("2026-11-03T00:00:00Z"), markedByUid: "rahul", sessionAt: new Date(sessionAt) },
});

describe("1. the script dates weeks as the site does", () => {
  const SHAPES = [
    ["the run's plan", RUN, { session: slot(2, "17:30") }],
    ["a day and a start of a week's own", RUN, { session: slot(2, "17:30"), sessionOverrides: { w01: { weekday: 1, startTimeLocal: "18:00" }, w03: { startTimeLocal: "19:15" } } }],
    ["the group's own plan with a break", RUN, { session: slot(3, "15:00"), paceWeekPlan: weeks(6, 2) }],
    ["the group's own start", RUN, { session: slot(6, "15:00"), paceStartDate: "2026-11-09" }],
    ["both sides of the clock change", AUTUMN, { session: slot(1, "18:00") }],
    ["a Sunday group across the clock change", AUTUMN, { session: slot(0, "01:30") }],
    ["a group with no start yet", RUN, { session: { ...slot(2, "17:30"), startTimeLocal: "" } }],
  ];
  for (const [what, run, group] of SHAPES) {
    test(`${what}: every week's start agrees`, () => {
      assert.deepEqual(scriptStarts(run, group), siteStarts(run, group));
    });
  }

  test("London's wall clock, either side of the change", () => {
    assert.equal(londonWallClockToInstant("2026-10-19", "18:00").toISOString(), "2026-10-19T17:00:00.000Z");
    assert.equal(londonWallClockToInstant("2026-10-26", "18:00").toISOString(), "2026-10-26T18:00:00.000Z");
    assert.deepEqual(londonPartsOf(new Date("2026-10-19T17:00:00Z")), { dateKey: "2026-10-19", hhmm: "18:00", weekday: 1 });
    assert.deepEqual(londonPartsOf(new Date("2026-10-26T18:00:00Z")), { dateKey: "2026-10-26", hhmm: "18:00", weekday: 1 });
  });
});

describe("2. only a week that met", () => {
  const TABLE = [
    ["no register", undefined],
    ["words in advance only", { excusedInAdvance: { amara: new Date() }, records: { amara: "excused" } }],
    ["joining online only", { onlineSaid: { amara: new Date() } }],
    ["held, nothing else", { held: true }],
    ["finished", { pushedAt: new Date() }],
    ["marked", { markedByUid: "rahul" }],
    ["did not happen", { held: false }],
    ["an empty marker", { markedByUid: "" }],
    ["a null push", { pushedAt: null }],
  ];
  test("taken means the site's own rule, case by case", () => {
    for (const [what, data] of TABLE) {
      assert.equal(registerIsTaken(data), attendance.registerIsTaken(data), what);
    }
    assert.deepEqual(
      TABLE.filter(([, data]) => registerIsTaken(data)).map(([what]) => what),
      ["finished", "marked", "did not happen"],
    );
  });

  test("a register holding only words in advance plans nothing, however its start reads", () => {
    const group = { session: slot(2, "17:30") };
    const register = { id: "run__g__w01", data: { weekNumber: 1, excusedInAdvance: { amara: new Date() }, sessionAt: new Date("2026-11-02T18:00:00Z") } };
    assert.deepEqual(planGroupPins({ run: RUN, group, registers: [register] }), { pins: [], skipped: [] });
  });
});

describe("3. the pin", () => {
  test("a week that met on its old day is pinned back to it, and then resolves to its register's start", () => {
    // Met Mon 2 Nov at 6pm; the group's regular slot was later changed to Tuesdays, 5:30pm.
    const group = { session: slot(2, "17:30"), sessionOverrides: { w02: { meetingUrl: "https://meet.example/x" } } };
    const registers = [finished(1, "2026-11-02T18:00:00Z")];
    const { pins, skipped } = planGroupPins({ run: RUN, group, registers });
    assert.deepEqual(skipped, []);
    assert.equal(pins.length, 1);
    assert.deepEqual(
      { week: pins[0].weekId, override: pins[0].override, resolvedAt: pins[0].resolvedAt.toISOString() },
      { week: "w01", override: { weekday: 1, startTimeLocal: "18:00" }, resolvedAt: "2026-11-03T17:30:00.000Z" },
    );
    const pinned = { ...group, sessionOverrides: { ...group.sessionOverrides, w01: pins[0].override } };
    assert.equal(siteStarts(RUN, pinned).get(1), "2026-11-02T18:00:00.000Z");
    // The rest keep the regular slot, and run again it plans nothing.
    assert.equal(siteStarts(RUN, pinned).get(2), "2026-11-10T17:30:00.000Z");
    assert.deepEqual(planGroupPins({ run: RUN, group: pinned, registers }), { pins: [], skipped: [] });
  });

  test("keeps whatever else the week's override carries", () => {
    const group = { session: slot(2, "17:30"), sessionOverrides: { w01: { location: "George Green A04", notes: "Bring laptops" } } };
    const { pins } = planGroupPins({ run: RUN, group, registers: [finished(1, "2026-11-02T18:00:00Z")] });
    assert.deepEqual(pins[0].override, { location: "George Green A04", notes: "Bring laptops", weekday: 1, startTimeLocal: "18:00" });
  });

  test("either side of the clock change, each week is pinned to its own London start", () => {
    // Met Mondays at 6pm (BST on 19 Oct, GMT on 26 Oct); the slot later moved to Wednesdays, 7pm.
    const group = { session: slot(3, "19:00") };
    const registers = [finished(1, "2026-10-19T17:00:00Z"), finished(2, "2026-10-26T18:00:00Z")];
    const { pins } = planGroupPins({ run: AUTUMN, group, registers });
    assert.deepEqual(
      pins.map((pin) => [pin.weekId, pin.override]),
      [
        ["w01", { weekday: 1, startTimeLocal: "18:00" }],
        ["w02", { weekday: 1, startTimeLocal: "18:00" }],
      ],
    );
    const pinned = { ...group, sessionOverrides: Object.fromEntries(pins.map((pin) => [pin.weekId, pin.override])) };
    const starts = siteStarts(AUTUMN, pinned);
    assert.equal(starts.get(1), "2026-10-19T17:00:00.000Z");
    assert.equal(starts.get(2), "2026-10-26T18:00:00.000Z");
    assert.equal(starts.get(3), "2026-11-04T19:00:00.000Z", "a week that has not met keeps the new slot");
    assert.deepEqual(planGroupPins({ run: AUTUMN, group: pinned, registers }).pins, []);
  });

  test("a week that agrees with its register plans nothing", () => {
    const group = { session: slot(1, "18:00") };
    assert.deepEqual(planGroupPins({ run: RUN, group, registers: [finished(1, "2026-11-02T18:00:00Z")] }), { pins: [], skipped: [] });
  });
});

describe("4. what is never written", () => {
  test("a week whose override already has its own day or start is reported, never overwritten", () => {
    // A move made through the site: the register kept the old start, the week its new one.
    const group = { session: slot(2, "17:30"), sessionOverrides: { w02: { weekday: 2, startTimeLocal: "18:00" } } };
    const { pins, skipped } = planGroupPins({ run: RUN, group, registers: [finished(2, "2026-11-10T17:30:00Z")] });
    assert.deepEqual(pins, []);
    assert.deepEqual(
      skipped.map((each) => [each.weekId, each.why]),
      [["w02", "the week already has its own day or start"]],
    );
  });

  test("a start outside the week's own seven days is reported, never written", () => {
    const group = { session: slot(2, "17:30") };
    const { pins, skipped } = planGroupPins({ run: RUN, group, registers: [finished(1, "2026-11-09T18:00:00Z")] });
    assert.deepEqual(pins, []);
    assert.deepEqual(skipped.map((each) => [each.weekId, each.why]), [["w01", "it met outside its own week"]]);
  });
});
