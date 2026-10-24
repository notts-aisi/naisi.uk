/**
 * What a card on the allocation board says about when somebody is free.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   src/features/courses/allocationFit.ts   the card's one rule
 *   GET /api/courses/runs/[runId]/allocation   what the rule is handed
 *
 * ## What this guards
 *
 * Two kinds of people sit on the board. Somebody who applied to the run
 * itself ticked its sessions, and their row carries those labels. Somebody
 * the term's application form placed there painted a week, and their row
 * carries `fromForm`: which groups that week covers, worked out by the
 * server. `cardFit` turns either into what a card draws.
 *
 * A rule like that fails in the seam: the server sends one shape and the
 * card reads another, and each is right by its own test. So the second half
 * of this file takes the rows the REAL route sends, after a real hand-over,
 * and puts them through the card's rule:
 *
 *  - a person is shown the sessions they can make, and the one they sit in
 *    is the one highlighted;
 *  - somebody put in a group they cannot make is marked, and somebody put in
 *    one they can is not;
 *  - "gave no availability" is said in words, and is never a clash;
 *  - a week that covers none of the sessions is a warning, which is a
 *    different thing from having given none;
 *  - somebody who has given their place back is marked, wherever they sit;
 *  - somebody who applied to the run itself is drawn exactly as before.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE, GROUP, RUN, loadJoin, makeWorld, namedSeed } from "./lib/handoverWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const made = makeWorld();
const { world, reset } = made;
const { press, board, place, reply, rowPath } = await loadJoin(made);
const fit = await made.lib("..", "features", "courses", "allocationFit.ts");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-24T10:00:00Z") });
beforeEach(() => {
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
});

// A session's label is the course side's own: a weekday and two times joined by
// the character it writes between them, given here by its code point.
const MONDAY = { id: "g-mon", sessionLabel: "Mondays 18:00\u201319:30" };
const THURSDAY = { id: "g-thu", sessionLabel: "Thursdays 10:00\u201311:30" };
const UNSET = { id: "g-tbc", sessionLabel: "" };
const GROUPS = [MONDAY, THURSDAY, UNSET];

const fromForm = (over = {}) => ({
  availability: [],
  fromForm: { availability: "given", canMakeGroupIds: [], holdsPlace: true, ...over },
});
const ticked = (...labels) => ({ availability: labels, fromForm: null });

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

describe("somebody the application form placed on the run", () => {
  test("is shown the sessions their painted week covers, in the board's order", () => {
    const card = fit.cardFit(fromForm({ canMakeGroupIds: ["g-thu", "g-mon"] }), null, GROUPS);
    assert.deepEqual(card, {
      slots: [MONDAY.sessionLabel, THURSDAY.sessionLabel],
      note: null,
      noteWarns: false,
      conflict: false,
      gaveBack: false,
    });
  });

  test("is marked when they sit in a group whose session their week does not cover, and not when it does", () => {
    const row = fromForm({ canMakeGroupIds: ["g-mon"] });
    assert.equal(fit.cardFit(row, THURSDAY, GROUPS).conflict, true);
    assert.equal(fit.cardFit(row, MONDAY, GROUPS).conflict, false);
    // In the pool there is no session to miss.
    assert.equal(fit.cardFit(row, null, GROUPS).conflict, false);
  });

  test("a group with no session time yet is neither made nor missed", () => {
    const row = fromForm({ canMakeGroupIds: ["g-mon"] });
    assert.equal(fit.cardFit(row, UNSET, GROUPS).conflict, false);
    // Even if the server were to list it, a column with no label draws no chip.
    assert.deepEqual(fit.cardFit(fromForm({ canMakeGroupIds: ["g-tbc"] }), null, GROUPS).slots, []);
  });

  test("gave no availability: said in words, and never a clash", () => {
    const row = fromForm({ availability: "none-given" });
    for (const group of [null, MONDAY, THURSDAY]) {
      assert.deepEqual(fit.cardFit(row, group, GROUPS), {
        slots: [],
        note: "No availability given",
        noteWarns: false,
        conflict: false,
        gaveBack: false,
      });
    }
  });

  test("a week that covers none of the sessions is a warning, which is not the same as giving none", () => {
    const card = fit.cardFit(fromForm(), null, GROUPS);
    assert.deepEqual([card.slots, card.note, card.noteWarns], [[], "Can’t make any of these sessions", true]);
    assert.equal(fit.cardFit(fromForm(), MONDAY, GROUPS).conflict, true);
    // With no session set on any group, there is nothing to make or miss.
    const none = fit.cardFit(fromForm(), null, [UNSET]);
    assert.deepEqual([none.note, none.noteWarns], [null, false]);
  });

  test("an application that is no longer on file claims nothing about their week", () => {
    const card = fit.cardFit(fromForm({ availability: "not-on-file" }), MONDAY, GROUPS);
    assert.deepEqual([card.slots, card.note, card.noteWarns, card.conflict], [[], "Availability no longer on file", false, false]);
  });

  test("somebody who has given their place back is marked, wherever they sit and whatever they can make", () => {
    for (const availability of ["given", "none-given", "not-on-file"]) {
      for (const group of [null, MONDAY]) {
        assert.equal(fit.cardFit(fromForm({ availability, holdsPlace: false }), group, GROUPS).gaveBack, true);
        assert.equal(fit.cardFit(fromForm({ availability }), group, GROUPS).gaveBack, false);
      }
    }
  });

  test("two groups that meet at the same time are one session on the card", () => {
    const twin = { id: "g-mon-2", sessionLabel: MONDAY.sessionLabel };
    const card = fit.cardFit(fromForm({ canMakeGroupIds: ["g-mon", "g-mon-2"] }), twin, [...GROUPS, twin]);
    assert.deepEqual([card.slots, card.conflict], [[MONDAY.sessionLabel], false]);
  });
});

describe("somebody who applied to the run itself is drawn as before", () => {
  test("the sessions they ticked are the chips, and a group not among them is a clash", () => {
    const row = ticked(MONDAY.sessionLabel);
    assert.deepEqual(fit.cardFit(row, MONDAY, GROUPS), { slots: [MONDAY.sessionLabel], note: null, noteWarns: false, conflict: false, gaveBack: false });
    assert.equal(fit.cardFit(row, THURSDAY, GROUPS).conflict, true);
  });

  test("ticking nothing is silence: no line, and no clash", () => {
    for (const group of [null, MONDAY, UNSET]) {
      assert.deepEqual(fit.cardFit(ticked(), group, GROUPS), { slots: [], note: null, noteWarns: false, conflict: false, gaveBack: false });
    }
  });
});

// ---------------------------------------------------------------------------
// The seam: what the route sends, through the card's rule
// ---------------------------------------------------------------------------

describe("the rows the board's own route sends, through the card's rule", () => {
  /** Each person's card, from one read of the board. */
  async function cards() {
    const { groups, people } = (await board()).body;
    const byId = new Map(groups.map((group) => [group.id, group]));
    return Object.fromEntries(
      people.map((row) => [row.uid, fit.cardFit(row, row.groupId ? byId.get(row.groupId) : null, groups)]),
    );
  }

  test("in the pool, each person is shown what they can make", async () => {
    await press();
    const shown = await cards();
    assert.deepEqual(shown.amara.slots, ["Mondays 18:00\u201319:30", "Thursdays 10:00\u201311:30"]);
    assert.deepEqual(shown.dev.slots, ["Mondays 18:00\u201319:30"]);
    assert.deepEqual([shown.tariq.slots, shown.tariq.note, shown.tariq.noteWarns], [[], "Can’t make any of these sessions", true]);
    assert.deepEqual([shown.bea.slots, shown.bea.note, shown.bea.noteWarns], [[], "No availability given", false]);
    for (const card of Object.values(shown)) assert.deepEqual([card.conflict, card.gaveBack], [false, false]);
  });

  test("put in a group, somebody who cannot make it is marked and somebody who can is not", async () => {
    await press();
    const placed = await place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.thursday },
      { uid: "bea", groupId: GROUP.thursday },
      { uid: "tariq", groupId: GROUP.monday },
    ]);
    assert.equal(placed.body.placed, 4);
    const shown = await cards();
    assert.deepEqual(
      Object.fromEntries(Object.entries(shown).map(([uid, card]) => [uid, card.conflict])),
      // Dev is free on Monday only. Tariq is free for an hour of a ninety
      // minute session. Bea gave no availability, which is not a clash.
      { amara: false, dev: true, bea: false, tariq: true },
    );
  });

  test("somebody who gives their place back is marked on the next read, and stays where they are", async () => {
    await press();
    await place("zach", [{ uid: "amara", groupId: GROUP.monday }]);
    await reply("amara", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    const shown = await cards();
    assert.equal(shown.amara.gaveBack, true);
    assert.deepEqual(shown.amara.slots, ["Mondays 18:00\u201319:30", "Thursdays 10:00\u201311:30"]);
    assert.equal(shown.dev.gaveBack, false);
    assert.equal(world.db.read(rowPath("amara")).status, "accepted");
  });

  test("a person who applied to the run itself, beside them, is drawn by what they ticked", async () => {
    await press();
    world.db.seed(rowPath("nobody"), {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid: "nobody",
      displayName: "Nell Carter",
      status: "accepted",
      availability: "Thursdays 10:00\u201311:30",
    });
    await place("zach", [{ uid: "nobody", groupId: GROUP.monday }]);
    const shown = await cards();
    assert.deepEqual([shown.nobody.slots, shown.nobody.conflict, shown.nobody.note], [["Thursdays 10:00\u201311:30"], true, null]);
  });
});

// ---------------------------------------------------------------------------
// The board draws from the rule
// ---------------------------------------------------------------------------

describe("the board draws a card from the rule, and from nothing else", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "courses");
  const code = stripSource(readFileSync(join(ROOT, "AllocationBoard.tsx"), "utf8"), { keepStrings: true });

  test("every card's facts come from cardFit", () => {
    assert.match(code, /const fit = cardFit\(row, group, \[\.\.\.groupsById\.values\(\)\]\);/);
    assert.match(code, /availabilityConflict: fit\.conflict,/);
  });

  test("the card reads when somebody is free from those facts, and never off the row again", () => {
    assert.ok(!/row\.availability\b/.test(code), "the board compares the ticked labels itself again");
    assert.ok(!/row\.fromForm\b/.test(code), "the board reads the form's answer itself, past the rule");
    for (const drawn of ["facts.fit.gaveBack", "facts.fit.slots", "facts.fit.note", "facts.fit.noteWarns"]) {
      assert.ok(code.includes(drawn), `the card no longer draws ${drawn}`);
    }
  });

  test("the hook's row carries what the route sends", () => {
    const hook = stripSource(readFileSync(join(ROOT, "useAllocation.ts"), "utf8"), { keepStrings: true });
    assert.match(hook, /fromForm: FormPlace \| null;/);
    const route = stripSource(
      readFileSync(join(ROOT, "..", "..", "app", "api", "courses", "runs", "[runId]", "allocation", "route.ts"), "utf8"),
      { keepStrings: true },
    );
    assert.match(route, /fromForm: FormPlaceFacts \| null;/);
    for (const field of ["availability", "canMakeGroupIds", "holdsPlace"]) {
      assert.ok(new RegExp(`${field}: fromForm\\.${field},`).test(route), `the route no longer sends ${field}`);
    }
  });
});
