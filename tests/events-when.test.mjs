/**
 * How the public events pages say when an event is and how many places it has.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * `src/features/events/eventWhen.ts` is read by three pages (the list, the
 * event page and the add-to-calendar page) and by the sign-up panel, so the
 * words are worked out there once. This file holds what they say:
 *
 *  1. LONDON TIME, whatever the process zone. The pages render on a container
 *     that is UTC, and a card that said "6pm" for a 7pm start all summer is
 *     the failure `tests/server-date-formatting.test.mjs` exists for. The
 *     helper formats nothing itself, and this proves the words it builds from
 *     `formatSiteDate` come out in London time too.
 *  2. A CARD THAT SAYS "ENDED" IS TRUE. An event is over when its end has
 *     passed, never merely because it has started.
 *  3. THE PLACES WORDS MATCH THE NUMBERS, and a drop-in never has places to
 *     count: it keeps its capacity setting and ignores it.
 */

// Before anything reads the clock. A zone far from London is the point: every
// assertion below would pass on a London laptop with the zone left out.
process.env.TZ = "America/Los_Angeles";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const {
  clockTime,
  endWords,
  hasEnded,
  placesState,
  placesTone,
  placesWords,
  shortDate,
  tileParts,
} = await loadTs("features/events/eventWhen.ts");

const at = (iso) => new Date(iso);
const NOW = at("2026-10-07T12:00:00Z");

describe("the words for a time", () => {
  test("the suite really is running outside London", () => {
    assert.notEqual(at("2026-09-21T17:00:00Z").getHours(), 18);
  });

  test("a summer evening is said in British Summer Time", () => {
    // 18:00 UTC on 16 Oct 2026 is 7pm in London.
    assert.equal(clockTime(at("2026-10-16T18:00:00Z")), "7pm");
  });

  test("a winter evening is said in Greenwich Mean Time", () => {
    assert.equal(clockTime(at("2026-11-12T18:30:00Z")), "6:30pm");
  });

  test("minutes are shown only when there are some, and noon and midnight are twelve", () => {
    assert.equal(clockTime(at("2026-05-28T16:30:00Z")), "5:30pm");
    assert.equal(clockTime(at("2026-11-01T14:00:00Z")), "2pm");
    assert.equal(clockTime(at("2026-11-01T12:00:00Z")), "12pm");
    assert.equal(clockTime(at("2026-11-01T00:00:00Z")), "12am");
    assert.equal(clockTime(at("2026-11-01T09:05:00Z")), "9:05am");
  });
});

describe("the words for a date", () => {
  test("a tile's three lines are the London weekday, day and month", () => {
    // 23:30 UTC on 21 Sep is already Tuesday 22 Sep in London.
    assert.deepEqual(tileParts(at("2026-09-21T23:30:00Z")), {
      weekday: "Tue",
      day: "22",
      month: "Sep",
    });
  });

  test("every month fits a tile: three letters, September included", () => {
    for (let month = 0; month < 12; month += 1) {
      const { month: shown } = tileParts(new Date(Date.UTC(2026, month, 15, 12)));
      assert.equal(shown.length, 3, shown);
    }
  });

  test("a date this year carries no year, and a date in another year does", () => {
    assert.equal(shortDate(at("2026-10-16T18:00:00Z"), NOW), "Fri 16 Oct");
    assert.equal(shortDate(at("2025-05-28T16:30:00Z"), NOW), "Wed 28 May 2025");
    assert.equal(shortDate(at("2027-01-14T18:00:00Z"), NOW), "Thu 14 Jan 2027");
  });

  test("an end on the same London day is a time, and on another day it repeats the day", () => {
    const start = at("2026-10-16T18:00:00Z");
    assert.equal(endWords(start, at("2026-10-16T20:30:00Z"), NOW), "9:30pm");
    assert.equal(endWords(start, at("2026-10-17T08:00:00Z"), NOW), "Sat 17 Oct, 9am");
  });
});

describe("whether an event is over", () => {
  const start = at("2026-10-07T10:00:00Z");

  test("with an end time, only once the end has passed", () => {
    assert.equal(hasEnded(start, at("2026-10-07T13:00:00Z"), NOW), false, "still on");
    assert.equal(hasEnded(start, at("2026-10-07T11:00:00Z"), NOW), true);
  });

  test("with no end time, only once its London day is over", () => {
    assert.equal(hasEnded(start, null, NOW), false, "it started two hours ago, today");
    assert.equal(hasEnded(at("2026-10-06T18:00:00Z"), null, NOW), true, "yesterday");
  });

  test("an event that has not started, or has no date, is not over", () => {
    assert.equal(hasEnded(at("2026-10-16T18:00:00Z"), null, NOW), false);
    assert.equal(hasEnded(at("2026-10-16T18:00:00Z"), at("2026-10-16T20:00:00Z"), NOW), false);
    assert.equal(hasEnded(null, null, NOW), false);
  });
});

describe("how many places are left", () => {
  const event = (over) => ({
    capacity: 60,
    rsvpCountConfirmed: 22,
    waitlistEnabled: false,
    noSignup: false,
    ...over,
  });

  test("the count is the capacity less the confirmed places", () => {
    const state = placesState(event());
    assert.deepEqual(state, { kind: "left", left: 38, capacity: 60, few: false });
    assert.equal(placesWords(state), "38 places left");
    assert.equal(placesTone(state), "neutral");
  });

  test("a quarter or fewer is few, and says so with a word and a tone", () => {
    const state = placesState(event({ capacity: 56, rsvpCountConfirmed: 42 }));
    assert.equal(state.few, true);
    assert.equal(placesWords(state), "14 places left");
    assert.equal(placesTone(state), "warning");
    assert.equal(placesState(event({ capacity: 56, rsvpCountConfirmed: 41 })).few, false);
  });

  test("one place is singular", () => {
    assert.equal(placesWords(placesState(event({ rsvpCountConfirmed: 59 }))), "1 place left");
  });

  test("full says whether there is a waiting list, and never counts below nothing", () => {
    const full = placesState(event({ rsvpCountConfirmed: 60 }));
    assert.deepEqual(full, { kind: "full", capacity: 60, waitingList: false });
    assert.equal(placesWords(full), "Full");
    assert.equal(placesTone(full), "danger");
    const waiting = placesState(event({ rsvpCountConfirmed: 64, waitlistEnabled: true }));
    assert.equal(placesWords(waiting), "Full · waiting list open");
    assert.equal(placesTone(waiting), "warning");
  });

  test("no limit, and a drop-in whatever its capacity, have nothing to count", () => {
    for (const open of [event({ capacity: null }), event({ noSignup: true, rsvpCountConfirmed: 60 })]) {
      const state = placesState(open);
      assert.deepEqual(state, { kind: "open" });
      assert.equal(placesWords(state), null);
      assert.equal(placesTone(state), "neutral");
    }
  });

  test("an event nobody has been confirmed for yet has every place left", () => {
    assert.equal(placesWords(placesState(event({ rsvpCountConfirmed: null }))), "60 places left");
  });
});
