/**
 * What Claude is told about a proposed arrangement, and what is kept of its
 * advice, run for real.
 *
 * Run with `npm test`. `src/lib/applications/arrange/advice.ts` is pure.
 *
 *  - Claude is told numbers, never names, and never anybody's week: only
 *    which other planned groups a person can make.
 *  - A facilitator is kept only when they offered to facilitate and can make
 *    the group; one seated elsewhere is moved there when that fits.
 *  - A move is kept only to a group the person can make, with room, and
 *    never of somebody already told their group.
 *  - Everything not kept is listed with why.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const { adviceInputFrom, applyAdvice } = await loadTs("lib/applications/arrange/advice.ts");
const { slotFor } = await loadTs("lib/applications/arrange/plan.ts");

const TUE = slotFor({ weekday: 2, start: 18 * 60 }, 90);
const WED = slotFor({ weekday: 3, start: 18 * 60 }, 90);
const at = (...sessions) => ({ kind: "given", covers: (s) => sessions.some((x) => x.weekday === s.weekday && x.startTimeLocal === s.startTimeLocal) });

function world() {
  const people = new Map([
    ["ada", { uid: "ada", name: "Ada Lovelace", week: at(TUE, WED), facilitates: true, groupId: null, told: false }],
    ["bo", { uid: "bo", name: "Bo Chen", week: at(TUE), facilitates: false, groupId: null, told: false }],
    ["cy", { uid: "cy", name: "Cy Twombly", week: at(TUE, WED), facilitates: false, groupId: "g1", told: true }],
    ["di", { uid: "di", name: "Di Okafor", week: at(WED), facilitates: true, groupId: null, told: false }],
  ]);
  const plan = {
    groups: [
      { id: "g1", name: "Group A", session: TUE, timeIsNew: false, room: 3, memberUids: ["cy", "ada", "bo"] },
      { id: null, name: "Group B", session: WED, timeIsNew: true, room: 3, memberUids: ["di"] },
    ],
    unplaced: [],
    keptUids: ["cy"],
  };
  const reads = new Map([["ada", { lean: "strong", summary: "Reviewer A liked her rigour." }]]);
  const input = adviceInputFrom({ programmeName: "AGI Strategy", size: 3, plan, people, reads });
  return { people, plan, input };
}

test("Claude is told numbers and the groups each person can make, never a name or a week", () => {
  const { input } = world();
  for (const name of ["Ada", "Lovelace", "Bo Chen", "Cy", "Twombly", "Di", "Okafor", "ada", "Group A", "Group B"]) {
    assert.equal(input.message.includes(name), false, `the message names ${name}`);
  }
  // Applicants numbered in account-id order: ada 1, bo 2, cy 3, di 4.
  assert.match(input.message, /Applicant 1: would like to facilitate\. Can also make Group 2\. Lean strong\. a reviewer liked her rigour\./);
  assert.match(input.message, /Applicant 2: has not offered to facilitate\. Can make no other group\. Not read by Claude\./);
  assert.match(input.message, /Applicant 3: .*Already told their group, so stays\./);
  assert.doesNotMatch(input.message, /covers|weekday|days/);
});

test("a facilitator who offered and can make the group is kept, and moved to sit in it", () => {
  const { people, plan, input } = world();
  const applied = applyAdvice(plan, people, input, {
    facilitators: [{ group: "Group 2", applicant: "Applicant 1", why: "Rigorous." }],
    moves: [],
    notes: "",
  });
  assert.equal(applied.facilitators.get(1).uid, "ada");
  assert.deepEqual(applied.plan.groups[1].memberUids.sort(), ["ada", "di"]);
  assert.deepEqual(applied.plan.groups[0].memberUids.sort(), ["bo", "cy"]);
  assert.deepEqual(applied.dropped, []);
});

test("a facilitator who never offered, or cannot make the group, is dropped with why", () => {
  const { people, plan, input } = world();
  const applied = applyAdvice(plan, people, input, {
    facilitators: [
      { group: "Group 1", applicant: "Applicant 2", why: "" },
      { group: "Group 1", applicant: "Applicant 4", why: "" },
    ],
    moves: [],
    notes: "",
  });
  assert.equal(applied.facilitators.size, 0);
  assert.deepEqual(applied.dropped.map((d) => d.why), [
    "Applicant 2 has not offered to facilitate",
    "Applicant 4 cannot make Group 1",
  ]);
});

test("a move is kept only to a group the person can make, with room, and never of somebody told", () => {
  const { people, plan, input } = world();
  const applied = applyAdvice(plan, people, input, {
    facilitators: [],
    moves: [
      { applicant: "Applicant 2", to: "Group 2", why: "balance" },
      { applicant: "Applicant 3", to: "Group 2", why: "balance" },
      { applicant: "Applicant 1", to: "Group 2", why: "balance" },
      { applicant: "Applicant 9", to: "Group 1", why: "" },
    ],
    notes: "",
  });
  assert.deepEqual(applied.moves.map((m) => m.uid), ["ada"]);
  assert.deepEqual(applied.dropped.map((d) => d.why), [
    "Applicant 2 cannot make Group 2",
    "Applicant 3 has already been told their group",
    "names somebody or a group that is not in the plan",
  ]);
});

test("a full group takes nobody more", () => {
  const { people, plan, input } = world();
  plan.groups[1].room = 1;
  const applied = applyAdvice(plan, people, input, {
    facilitators: [],
    moves: [{ applicant: "Applicant 1", to: "Group 2", why: "" }],
    notes: "",
  });
  assert.deepEqual(applied.moves, []);
  assert.equal(applied.dropped[0].why, "Applicant 1 cannot join Group 2, which is full");
});
