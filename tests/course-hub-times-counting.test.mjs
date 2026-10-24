/**
 * The times picture's arithmetic and its words, as pure functions.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   src/lib/applications/handover/times.ts        the counting
 *   src/lib/applications/handover/paintedWeek.ts  the one reading of a painted week
 *   src/features/applications/times/timesWords.ts what the page says
 *
 * ## What this guards
 *
 *  - A PERSON IS COUNTED IN A CELL ONLY WHEN THEIR PAINTED WEEK COVERS THE
 *    WHOLE SESSION from that start, through the availability module's own
 *    test. Half a session is not the session, and a session that runs past
 *    the end of the form's grid is never covered.
 *  - SOMEBODY WHO PAINTED NOTHING IS NOT COUNTED ANYWHERE, and is not listed
 *    as fitting no group: never saying is not being free at no time.
 *  - THE START TIMES COME FROM THE FORM'S GRID AND THE LENGTH, and from
 *    nothing else. 09:00 to 21:00 and two hours give 9am to 7pm; another grid
 *    gives other rows.
 *  - THE LENGTH COMES FROM THE RUN'S GROUPS, or is one the group editor
 *    offers, and the sentence says which.
 *  - A GROUP WITH NO TIME SET is never one anybody can make, is not marked in
 *    the grid, and is said in words.
 *  - THE WORDS ARE THE BOARD'S, with no pronoun for a person the site stores
 *    no pronoun for, and without the board's "(set in Settings)", a setting
 *    that does not exist.
 *
 * Who holds a place (a place given back is not counted, an invitation is
 * counted once accepted) is `holdingOf()`'s answer, asked by the loader:
 * `tests/course-hub-times-page.test.mjs` runs that against a stored term.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GRID, week } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const times = await loadTs(join("lib", "applications", "handover", "times.ts"));
const { paintedWeekOf } = await loadTs(join("lib", "applications", "handover", "paintedWeek.ts"));
const words = await loadTs(join("features", "applications", "times", "timesWords.ts"));
const lengths = await loadTs(join("lib", "courses", "sessionLength.ts"));

const { timesPicture, startRows, lengthFromGroups, defaultLength, lengthOptions, pickLength } = times;

const H = (clock) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

/** Somebody holding a place, with a week painted on the form's grid. */
const person = (uid, spans, grid = GRID) => ({
  uid,
  name: uid[0].toUpperCase() + uid.slice(1) + " Example",
  week: paintedWeekOf(grid, { sent: { availability: week(spans) } }),
});

const group = (id, name, weekday, start, durationMinutes) => ({
  id,
  name,
  session: { weekday, startTimeLocal: start, durationMinutes },
});

// Free Monday 17:00 to 21:00 and Thursday 09:00 to 13:00.
const AMARA = person("amara", { 1: [["17:00", "21:00"]], 4: [["09:00", "13:00"]] });
// Free Monday 18:00 to 19:30 only.
const DEV = person("dev", { 1: [["18:00", "19:30"]] });
// Free Monday 18:00 to 19:00: half of a ninety-minute session.
const TARIQ = person("tariq", { 1: [["18:00", "19:00"]] });
// Painted nothing.
const BEA = person("bea", {});

const MONDAY = group("g-mon", "Monday evening", 1, "18:00", 90);
const THURSDAY = group("g-thu", "Thursday morning", 4, "10:00", 90);
const UNSET = group("g-tbc", "To be arranged", 2, "", 90);

const picture = (over = {}) =>
  timesPicture({
    grid: GRID,
    minutes: 90,
    people: [AMARA, DEV, TARIQ, BEA],
    groups: [MONDAY, THURSDAY, UNSET],
    ...over,
  });

/** The count in one cell: weekday (0 is Sunday) and a wall clock. */
function cell(shown, weekday, clock) {
  const row = shown.rows.indexOf(H(clock));
  assert.notEqual(row, -1, `${clock} is not a row`);
  return shown.counts[row][times.WEEK_FROM_MONDAY.indexOf(weekday)];
}

// ---------------------------------------------------------------------------
// The start times
// ---------------------------------------------------------------------------

describe("the start times come from the form's grid and the length", () => {
  test("09:00 to 21:00 and two hours give 9am to 7pm, as the board draws", () => {
    const rows = startRows(GRID, 120);
    assert.deepEqual(
      rows.map((minute) => words.whenShort(1, minute).slice(4)),
      ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm"],
    );
  });

  test("a shorter session gives later starts, and every row's session ends by the grid's close", () => {
    assert.equal(startRows(GRID, 60).at(-1), H("20:00"));
    assert.equal(startRows(GRID, 90).at(-1), H("19:00"));
    for (const minutes of [60, 90, 120, 150]) {
      for (const start of startRows(GRID, minutes)) assert.ok(start + minutes <= GRID.endMinute);
    }
  });

  test("another grid gives other rows: nothing names an hour", () => {
    const evenings = { version: 1, startMinute: H("16:30"), endMinute: H("22:00"), slotMinutes: 15 };
    assert.deepEqual(startRows(evenings, 120).map((m) => m / 60), [17, 18, 19, 20]);
    const early = { version: 1, startMinute: H("07:00"), endMinute: H("12:00"), slotMinutes: 30 };
    assert.deepEqual(startRows(early, 60).map((m) => m / 60), [7, 8, 9, 10, 11]);
  });

  test("a length longer than the grid, or a grid nobody can draw on, gives no rows", () => {
    assert.deepEqual(startRows(GRID, 13 * 60), []);
    assert.deepEqual(startRows({ version: 1, startMinute: 600, endMinute: 540, slotMinutes: 15 }, 60), []);
    assert.deepEqual(startRows(GRID, 0), []);
    assert.deepEqual(startRows(GRID, Number.NaN), []);
  });
});

// ---------------------------------------------------------------------------
// The one reading of a painted week
// ---------------------------------------------------------------------------

describe("a painted week, read once for the board and the picture", () => {
  test("no sent application is not on file, and nothing painted is none given", () => {
    assert.equal(paintedWeekOf(GRID, null).kind, "not-on-file");
    assert.equal(paintedWeekOf(GRID, { sent: null }).kind, "not-on-file");
    assert.equal(BEA.week.kind, "none-given");
    assert.equal(AMARA.week.kind, "given");
  });

  test("a week covers a session only when it covers every minute of it", () => {
    const monday = (start, durationMinutes) => ({ weekday: 1, startTimeLocal: start, durationMinutes });
    assert.equal(DEV.week.covers(monday("18:00", 90)), true);
    assert.equal(DEV.week.covers(monday("18:00", 120)), false, "longer than any stretch they painted");
    assert.equal(TARIQ.week.covers(monday("18:00", 90)), false, "half of the session is not the session");
    assert.equal(TARIQ.week.covers(monday("18:00", 60)), true);
  });

  test("a session that runs past the grid's close is never covered, whatever was painted", () => {
    assert.equal(AMARA.week.covers({ weekday: 1, startTimeLocal: "20:00", durationMinutes: 60 }), true);
    assert.equal(AMARA.week.covers({ weekday: 1, startTimeLocal: "20:00", durationMinutes: 120 }), false);
  });
});

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

describe("the picture counts who is free for a whole session at each start", () => {
  test("it counts the people who said, out of everybody holding a place", () => {
    const shown = picture();
    assert.equal(shown.holders, 4);
    assert.equal(shown.said, 3, "somebody who painted nothing is not one of those who said");
  });

  test("each cell counts the people whose week covers the whole session from that start", () => {
    const shown = picture();
    assert.equal(cell(shown, 1, "18:00"), 2, "Amara and Dev; Tariq has half of it");
    assert.equal(cell(shown, 1, "17:00"), 1);
    assert.equal(cell(shown, 1, "19:00"), 1, "Dev's week stops at 19:30");
    assert.equal(cell(shown, 4, "11:00"), 1);
    assert.equal(cell(shown, 4, "12:00"), 0, "12:00 to 13:30 runs past Amara's 13:00");
    assert.equal(cell(shown, 0, "09:00"), 0);
    // Every cell, against a recount by hand.
    for (const [row, start] of shown.rows.entries()) {
      for (const [column, weekday] of times.WEEK_FROM_MONDAY.entries()) {
        const slot = { weekday, startTimeLocal: `${String(start / 60).padStart(2, "0")}:00`, durationMinutes: 90 };
        const recount = [AMARA, DEV, TARIQ].filter((one) => one.week.covers(slot)).length;
        assert.equal(shown.counts[row][column], recount, `${weekday} ${start}`);
      }
    }
  });

  test("a length longer than anybody's free stretch counts nobody there", () => {
    const shown = picture({ minutes: 120, people: [DEV] });
    assert.ok(shown.counts.flat().every((count) => count === 0));
    assert.deepEqual(shown.best, []);
  });

  test("a group is marked where it starts, and a group with no time is marked nowhere", () => {
    const shown = picture();
    const at = (weekday, clock) =>
      shown.meets[shown.rows.indexOf(H(clock))][times.WEEK_FROM_MONDAY.indexOf(weekday)];
    assert.deepEqual(at(1, "18:00"), ["g-mon"]);
    assert.deepEqual(at(4, "10:00"), ["g-thu"]);
    assert.ok(!shown.meets.flat(2).includes("g-tbc"));
  });

  test("two groups that start at the same time are both marked there", () => {
    const second = group("g-mon-2", "Group D", 1, "18:00", 120);
    const shown = picture({ groups: [MONDAY, second] });
    assert.deepEqual(shown.meets[shown.rows.indexOf(H("18:00"))][0], ["g-mon-2", "g-mon"]);
  });

  test("the best times are the highest counts, Monday first on a tie, each with the group that meets then", () => {
    const shown = picture();
    assert.deepEqual(
      shown.best.map((best) => [best.weekday, best.start / 60, best.count, best.groupIds]),
      [
        [1, 18, 2, ["g-mon"]],
        [1, 17, 1, []],
        [1, 19, 1, []],
        [4, 9, 1, []],
        [4, 10, 1, ["g-thu"]],
        [4, 11, 1, []],
      ],
    );
    assert.equal(shown.best.length, times.BEST_TIMES_SHOWN);
    assert.ok(shown.best.every((best) => best.count > 0), "a time nobody can make is not a best time");
  });

  test("each group is counted at its own session, and a group with no time set is said in words", () => {
    const shown = picture();
    assert.deepEqual(
      shown.groups.map((one) => [one.name, one.canMake]),
      [
        ["Monday evening", 2],
        ["Thursday morning", 1],
        ["To be arranged", null],
      ],
    );
    // Counted at the group's own length, whatever length the grid counts.
    assert.equal(picture({ minutes: 60 }).groups[0].canMake, 2);
    assert.equal(words.groupLine({ weekday: 2, startMinute: null, durationMinutes: 90 }, null, false), "No session time set");
  });

  test("a group whose session runs past the grid's close can be made by nobody", () => {
    const late = group("g-late", "Late", 1, "20:00", 120);
    const shown = picture({ groups: [late] });
    assert.equal(shown.groups[0].canMake, 0);
    assert.deepEqual(shown.fit.none.map((one) => one.uid), ["amara", "dev", "tariq"]);
  });

  test("who fits none of the groups, with the days they are free for the length counted", () => {
    const shown = picture();
    assert.equal(shown.fit.canMakeOne, 2);
    assert.deepEqual(shown.fit.none, [{ uid: "tariq", name: "Tariq Example", freeDays: [] }]);
    // Counting hour-long sessions, Tariq is free on Mondays.
    assert.deepEqual(picture({ minutes: 60 }).fit.none[0].freeDays, [1]);
    // Nobody who painted nothing is listed.
    assert.ok(!shown.fit.none.some((one) => one.uid === "bea"));
  });

  test("with no group that has a time, or nobody who said, nobody is said to fit none", () => {
    assert.equal(picture({ groups: [UNSET] }).fit, null);
    assert.equal(picture({ groups: [] }).fit, null);
    assert.equal(picture({ people: [BEA] }).fit, null);
    assert.equal(picture({ people: [] }).said, 0);
  });
});

// ---------------------------------------------------------------------------
// The length
// ---------------------------------------------------------------------------

describe("the length counted comes from the run's groups, or from the editor's own lengths", () => {
  test("groups that all last the same length give that length", () => {
    const source = lengthFromGroups([MONDAY, THURSDAY, UNSET]);
    assert.deepEqual(source, { kind: "groups", minutes: 90 });
    assert.equal(defaultLength(source), 90);
  });

  test("groups that differ give the length most of them have, and the longer when level", () => {
    const two = (minutes, id) => group(id, id, 2, "18:00", minutes);
    assert.deepEqual(lengthFromGroups([two(90, "a"), two(120, "b"), two(120, "c")]), {
      kind: "mixed",
      lengths: [90, 120],
      most: 120,
    });
    assert.equal(lengthFromGroups([two(120, "a"), two(90, "b")]).most, 120);
    assert.equal(lengthFromGroups([two(60, "a"), two(60, "b"), two(120, "c")]).most, 60);
  });

  test("with no group that has a time, a new group's length, which the editor already starts with", () => {
    const source = lengthFromGroups([UNSET]);
    assert.deepEqual(source, { kind: "none" });
    assert.equal(defaultLength(source), lengths.NEW_GROUP_SESSION_MINUTES);
  });

  test("the lengths offered are the group editor's, and any a group already has", () => {
    assert.deepEqual(lengthOptions([]), [...lengths.SESSION_LENGTH_PRESETS]);
    assert.deepEqual(lengthOptions([group("x", "x", 1, "18:00", 75)]), [60, 75, 90, 120]);
  });

  test("an address can pick only a length that is offered", () => {
    const options = [60, 90, 120];
    assert.equal(pickLength("120", options, 90), 120);
    assert.equal(pickLength(["60", "120"], options, 90), 60);
    for (const asked of [undefined, "", "45", "abc", "90.5", "-60", "120 ", "99999", 120, null]) {
      assert.equal(pickLength(asked, options, 90), 90, JSON.stringify(asked));
    }
  });

  test("the group editor reads the same list and the same default", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "courses");
    const field = readFileSync(join(root, "SessionSlotField.tsx"), "utf8");
    const editor = readFileSync(join(root, "GroupEditor.tsx"), "utf8");
    assert.match(field, /const DURATION_PRESETS = SESSION_LENGTH_PRESETS;/);
    assert.match(editor, /durationMinutes: NEW_GROUP_SESSION_MINUTES,/);
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const PRONOUN = /\b(he|she|him|her|his|hers|they|them|their|theirs|he’s|she’s|they’re)\b/i;

describe("the words are the board's", () => {
  test("the first sentence, without the board's setting that does not exist", () => {
    assert.equal(
      `${words.saidSentence(27, 30, "AGI Strategy")} ${words.lengthSentence({ kind: "groups", minutes: 120 }, 120)}`,
      "27 of the 30 people holding a place have said when they’re free. Sessions last 2 hours.",
    );
    assert.equal(words.saidSentence(1, 30, "AGI Strategy"), "1 of the 30 people holding a place has said when they’re free.");
    assert.equal(words.saidSentence(0, 30, "AGI Strategy"), "None of the 30 people holding a place have said when they’re free.");
    assert.equal(words.saidSentence(0, 0, "AGI Strategy"), "Nobody holds a place on AGI Strategy now.");
    for (const source of [{ kind: "groups", minutes: 120 }, { kind: "none" }, { kind: "mixed", lengths: [90, 120], most: 120 }]) {
      for (const counted of [60, 90, 120]) {
        assert.ok(!/Settings/.test(words.lengthSentence(source, counted)), JSON.stringify([source, counted]));
      }
    }
  });

  test("the length sentence says where the length came from", () => {
    assert.equal(
      words.lengthSentence({ kind: "groups", minutes: 120 }, 90),
      "Sessions last 2 hours. This counts 90-minute sessions.",
    );
    assert.equal(
      words.lengthSentence({ kind: "mixed", lengths: [90, 120], most: 120 }, 120),
      "Your groups’ sessions last 90 minutes or 2 hours. This counts 2-hour sessions, the length most of them have.",
    );
    assert.equal(
      words.lengthSentence({ kind: "none" }, 90),
      "No group has a session time yet. This counts 90-minute sessions, the length a new group starts with.",
    );
  });

  test("the grid's heading, caption and cells", () => {
    assert.equal(words.gridHeading(120), "Who can make a 2-hour session starting at…");
    assert.equal(words.gridCaption(120), "People free for a 2-hour session, by start time");
    assert.equal(words.cellLabel(1, H("09:00"), 3, 27, []), "Monday 9am: 3 of 27 free");
    assert.equal(words.cellLabel(3, H("13:00"), 11, 27, ["Group C"]), "Wednesday 1pm: 11 of 27 free. Group C meets then.");
    assert.equal(
      words.cellLabel(2, H("18:00"), 22, 27, ["Group B", "Group D"]),
      "Tuesday 6pm: 22 of 27 free. Group B and Group D meet then.",
    );
    assert.deepEqual(times.WEEK_FROM_MONDAY.map(words.dayShort), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  test("a group's tag, best times and the groups card", () => {
    assert.equal(words.groupTag("Group C"), "C");
    assert.equal(words.groupTag("group 12"), "12");
    assert.equal(words.groupTag("Tuesday evening"), "T");
    assert.equal(words.whenShort(2, H("18:00")), "Tue 6pm");
    assert.equal(words.freeCount(22), "22 free");
    assert.equal(words.yourGroups(4), "Your 4 groups");
    assert.equal(words.yourGroups(1), "Your 1 group");
    assert.equal(
      words.groupLine({ weekday: 4, startMinute: H("18:00"), durationMinutes: 120 }, 18, false),
      "Thu 6pm · 18 can make it",
    );
    assert.equal(
      words.groupLine({ weekday: 4, startMinute: H("18:30"), durationMinutes: 90 }, 12, true),
      "Thu 6:30pm · 90 minutes · 12 can make it",
    );
  });

  test("who fits none: by name, with the days they are free, and never a pronoun", () => {
    assert.equal(words.fitSentence(26, 27), "26 of 27 can make at least one of these times.");
    assert.equal(words.cantLine("Joel Adeyemi", [5], 120), "Joel Adeyemi can’t: free on Fridays only.");
    assert.equal(
      words.cantLine("Joel Adeyemi", [1, 5, 6], 120),
      "Joel Adeyemi can’t: free on Mondays, Fridays and Saturdays.",
    );
    assert.equal(
      words.cantLine("Joel Adeyemi", [], 120),
      "Joel Adeyemi can’t: not free for a 2-hour session at any of these start times.",
    );
    for (const days of [[], [5], [1, 2], [1, 2, 3, 4, 5, 6, 0]]) {
      assert.ok(!PRONOUN.test(words.cantLine("Joel Adeyemi", days, 120)), JSON.stringify(days));
    }
    assert.equal(words.seePerson("Joel Adeyemi"), "See Joel Adeyemi");
  });

  test("no em or en dash in anything the page says", () => {
    const said = [
      words.saidSentence(27, 30, "AGI Strategy"),
      words.lengthSentence({ kind: "mixed", lengths: [60, 90, 120], most: 90 }, 60),
      words.gridHeading(90),
      words.cellLabel(1, H("09:00"), 3, 27, ["Group A"]),
      words.groupLine({ weekday: 4, startMinute: H("18:00"), durationMinutes: 120 }, 18, true),
      words.cantLine("Joel Adeyemi", [5], 120),
    ].join(" ");
    assert.ok(!/[\u2013\u2014]/.test(said), said);
  });
});
