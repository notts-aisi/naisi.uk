/**
 * "The weeks" on a team's page (board in-team): the group's taught weeks in
 * runs between the breaks of the run's own plan, each run one row of the
 * bar, and the line above it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Pure: `teamWeeks` in `src/lib/courses/teamPage/weeks.ts`, handed the plan
 * as the loader hands it (each taught week's first day and session day, and
 * the breaks), and a London day. Nothing about a term is in the code: the
 * runs, their labels and the line all come from the plan and its dates.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadPure } from "./lib/teamPageWorld.mjs";

const { teamWeeks, daysListWords, weekRangeWords } = await loadPure("lib", "courses", "teamPage", "weeks.ts");

/** Civil date arithmetic at noon UTC. */
const plusDays = (key, days) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A plan from Thursday `start`: `shape` lists "w" for a taught week and "b" for a break; sessions on the slot's first day. */
function plan(start, shape) {
  let week = 0;
  return shape.split("").map((kind, index) => {
    if (kind === "b") return { kind: "break" };
    week += 1;
    const slotStartKey = plusDays(start, index * 7);
    return { kind: "week", weekNumber: week, slotStartKey, dateKey: slotStartKey };
  });
}

const TWO_TERMS = plan("2026-10-29", "wwwwwwwbbbbbbbwww");

const states = (view) => view.segments.map((segment) => [segment.label, segment.weeks.map((week) => `${week.weekNumber}${week.state[0]}`).join(" ")]);

describe("an incubator's two terms: 7 weeks, 7 breaks, 3 weeks", () => {
  test("in week 5 (Thu 26 Nov), as the board draws it", () => {
    const view = teamWeeks(TWO_TERMS, "2026-11-26");
    assert.equal(view.sentence, "Week 7, Thu 10 Dec, is the last this term. Weeks 8 to 10: Thu 4, 11 and 18 Feb.");
    assert.deepEqual(states(view), [
      ["This term", "1d 2d 3d 4d 5c 6u 7u"],
      ["Feb", "8u 9u 10u"],
    ]);
  });

  test("before anything starts, the first run is this term", () => {
    const view = teamWeeks(TWO_TERMS, "2026-10-26");
    assert.equal(view.segments[0].label, "This term");
    assert.ok(view.segments[0].weeks.every((week) => week.state === "upcoming"));
    assert.equal(view.sentence, "Week 7, Thu 10 Dec, is the last this term. Weeks 8 to 10: Thu 4, 11 and 18 Feb.");
  });

  test("on the last session's day it is still this term; the day after, the break", () => {
    assert.equal(teamWeeks(TWO_TERMS, "2026-12-10").segments[0].label, "This term");
    const after = teamWeeks(TWO_TERMS, "2026-12-11");
    assert.deepEqual(after.segments.map((segment) => segment.label), ["Oct to Dec", "Feb"]);
    assert.equal(after.sentence, "Weeks 8 to 10: Thu 4, 11 and 18 Feb.");
    // Week 7's seven days run to Wed 16 Dec.
    assert.equal(after.segments[0].weeks[6].state, "current");
  });

  test("in the break, nothing is this term, and every week of the first is done", () => {
    const view = teamWeeks(TWO_TERMS, "2027-01-02");
    assert.deepEqual(states(view), [
      ["Oct to Dec", "1d 2d 3d 4d 5d 6d 7d"],
      ["Feb", "8u 9u 10u"],
    ]);
    assert.equal(view.sentence, "Weeks 8 to 10: Thu 4, 11 and 18 Feb.");
  });

  test("in February, the February run is this term", () => {
    const view = teamWeeks(TWO_TERMS, "2027-02-11");
    assert.deepEqual(states(view), [
      ["Oct to Dec", "1d 2d 3d 4d 5d 6d 7d"],
      ["This term", "8d 9c 10u"],
    ]);
    assert.equal(view.sentence, "Week 10, Thu 18 Feb, is the last.");
  });

  test("after the last week, every run by its months, and the line says it was the last", () => {
    const view = teamWeeks(TWO_TERMS, "2027-03-01");
    assert.deepEqual(view.segments.map((segment) => segment.label), ["Oct to Dec", "Feb"]);
    assert.ok(view.segments.every((segment) => segment.weeks.every((week) => week.state === "done")));
    assert.equal(view.sentence, "Week 10, Thu 18 Feb, was the last.");
  });
});

describe("other shapes, from the plan alone", () => {
  test("one run with no break: this term, and its last week", () => {
    const view = teamWeeks(plan("2026-10-29", "wwwwww"), "2026-11-12");
    assert.deepEqual(view.segments.map((segment) => segment.label), ["This term"]);
    assert.equal(view.sentence, "Week 6, Thu 3 Dec, is the last.");
  });

  test("a run across a month's end names both months, and the next run's days across months", () => {
    const view = teamWeeks(plan("2026-12-31", "wwbww"), "2026-12-31");
    assert.deepEqual(view.segments.map((segment) => segment.label), ["This term", "Jan"]);
    assert.equal(view.sentence, "Week 2, Thu 7 Jan, is the last this term. Weeks 3 and 4: Thu 21 and 28 Jan.");
  });

  test("a calendar that cannot be dated draws its weeks with no line, the first run as this term", () => {
    const undated = [1, 2, 3].map((weekNumber) => ({ kind: "week", weekNumber, slotStartKey: "", dateKey: "" }));
    const view = teamWeeks([...undated, { kind: "break" }, { kind: "week", weekNumber: 4, slotStartKey: "", dateKey: "" }], "2026-11-12");
    assert.equal(view.sentence, null);
    assert.deepEqual(states(view), [
      ["This term", "1u 2u 3u"],
      ["Week 4", "4u"],
    ]);
  });

  test("a plan with no taught week has no weeks to draw", () => {
    assert.equal(teamWeeks([{ kind: "break" }], "2026-11-12"), null);
    assert.equal(teamWeeks([], "2026-11-12"), null);
  });

  test("a week whose session is moved to another day is listed by that day", () => {
    const moved = TWO_TERMS.map((slot) => (slot.kind === "week" && slot.weekNumber === 9 ? { ...slot, dateKey: "2027-02-10" } : slot));
    assert.equal(
      teamWeeks(moved, "2026-11-26").sentence,
      "Week 7, Thu 10 Dec, is the last this term. Weeks 8 to 10: Thu 4 Feb, Wed 10 Feb and Thu 18 Feb.",
    );
  });
});

describe("the words", () => {
  test("days as the board lists them", () => {
    assert.equal(daysListWords(["2027-02-04", "2027-02-11", "2027-02-18"]), "Thu 4, 11 and 18 Feb");
    assert.equal(daysListWords(["2027-01-28", "2027-02-04", "2027-02-11"]), "Thu 28 Jan, 4 and 11 Feb");
    assert.equal(daysListWords(["2027-02-04"]), "Thu 4 Feb");
    assert.equal(daysListWords(["2027-02-04", "2027-02-10"]), "Thu 4 Feb and Wed 10 Feb");
    assert.equal(daysListWords(["2027-02-04", "not a day"]), "");
    assert.equal(daysListWords([]), "");
  });

  test("weeks as the board names them", () => {
    assert.equal(weekRangeWords([8]), "Week 8");
    assert.equal(weekRangeWords([8, 9]), "Weeks 8 and 9");
    assert.equal(weekRangeWords([8, 9, 10]), "Weeks 8 to 10");
    assert.equal(weekRangeWords([]), "");
  });
});
