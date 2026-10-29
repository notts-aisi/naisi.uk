/**
 * What "Apply N changes" on Circles sends, run for real, and the words for
 * every refusal it can meet.
 *
 * Run with `npm test`. `src/lib/applications/arrange/changes.ts` is pure.
 *
 * What it guards:
 *  - ONLY THE DIFFERENCES. A preview over the run's groups sends a new group,
 *    a new time, a place or a facilitator only where it differs from the run
 *    as it is: somebody already in the group the preview puts them in is not
 *    sent, a facilitator a group has already is not sent, and a preview that
 *    changes nothing sends nothing.
 *  - A GROUP AN EARLIER PRESS MADE IS RECOGNISED: a new group whose name and
 *    time the run now has is that group, and one whose name is taken at
 *    another time is renamed, never sent to be refused.
 *  - SOMEBODY WHO DID NOT OFFER IS NEVER MADE A FACILITATOR: they are listed
 *    to ask by hand.
 *  - A seat a move frees is freed first: out of a group, then between groups,
 *    then into one.
 *  - EVERY REASON THE ALLOCATE ROUTE CAN REFUSE A PLACEMENT FOR HAS WORDS
 *    (`notMovedWords`), read out of the route's own source, so a new reason
 *    cannot reach a screen as a bare code.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const { changesBetween, draftOver, freeGroupName, placementOrder, recognise } = await loadTs("lib/applications/arrange/changes.ts");
const { notMovedWords } = await loadTs("features/applications/groups/peopleInGroupsWords.ts");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const at = (weekday, start, minutes = 120) => ({ weekday, startTimeLocal: start, durationMinutes: minutes });
const TUE = at(2, "18:00");
const WED = at(3, "18:00");
const THU = at(4, "18:00");

/** The run as it is: Group A on Tuesday with ana and bo, led by fay; Group B on Wednesday with cy. */
function liveRun() {
  return {
    groups: [
      { id: "ga", name: "Group A", session: TUE, slot: { weekday: 2, start: "18:00" }, facilitatorUids: ["fay"], memberUids: ["ana", "bo", "fay"] },
      { id: "gb", name: "Group B", session: WED, slot: { weekday: 3, start: "18:00" }, facilitatorUids: [], memberUids: ["cy"] },
      { id: "gc", name: "Group C", session: null, slot: { weekday: 1, start: "" }, facilitatorUids: [], memberUids: [] },
    ],
    people: {
      ana: { groupId: "ga", offered: false },
      bo: { groupId: "ga", offered: true },
      fay: { groupId: "ga", offered: true },
      cy: { groupId: "gb", offered: false },
      dee: { groupId: null, offered: true },
      eli: { groupId: null, offered: false },
    },
  };
}

/** A preview that is the run exactly as it is. */
const asItIs = () => [
  { key: "A1", id: "ga", name: "Group A", session: TUE, room: 8, memberUids: ["ana", "bo", "fay"], facilitators: [] },
  { key: "A2", id: "gb", name: "Group B", session: WED, room: 8, memberUids: ["cy"], facilitators: [] },
];

describe("only the differences", () => {
  test("a preview of the run as it is sends nothing", () => {
    const live = liveRun();
    const changes = changesBetween(live, draftOver(asItIs(), live.groups));
    assert.equal(changes.count, 0);
    assert.deepEqual([changes.groups, changes.times, changes.places, changes.facilitators, changes.toAsk], [[], [], [], [], []]);
  });

  test("each kind of change is sent once, and nobody who stays where they are", () => {
    const live = liveRun();
    const draft = [
      // Group A as it is, with fay (already its facilitator) marked lead again.
      { key: "A1", id: "ga", name: "Group A", session: TUE, room: 8, memberUids: ["ana", "fay"], facilitators: [{ uid: "fay", role: "lead" }] },
      // Group B gains bo, who offered and leads it, and eli, who did not offer and backs up.
      { key: "A2", id: "gb", name: "Group B", session: WED, room: 8, memberUids: ["cy", "bo", "eli"], facilitators: [{ uid: "bo", role: "lead" }, { uid: "eli", role: "second" }] },
      // Group C is given a time, and a new Group D takes dee.
      { key: "A3", id: "gc", name: "Group C", session: THU, room: 8, memberUids: [], facilitators: [] },
      { key: "A4", id: null, name: "Group D", session: at(5, "17:00"), room: 6, memberUids: ["dee"], facilitators: [{ uid: "dee", role: "lead" }] },
    ];
    const changes = changesBetween(live, draft);
    assert.deepEqual(changes.groups, [{ key: "A4", name: "Group D", session: at(5, "17:00"), room: 6 }]);
    assert.deepEqual(changes.times, [{ key: "A3", groupId: "gc", name: "Group C", session: THU, from: { weekday: 1, start: "" } }]);
    assert.deepEqual(changes.places, [
      { uid: "bo", from: "ga", to: "A2" },
      { uid: "dee", from: null, to: "A4" },
      { uid: "eli", from: null, to: "A2" },
    ]);
    assert.deepEqual(changes.facilitators, [
      { key: "A2", added: ["bo"], uids: ["bo"] },
      { key: "A4", added: ["dee"], uids: ["dee"] },
    ]);
    assert.deepEqual(changes.toAsk, [{ uid: "eli", key: "A2" }], "somebody who did not offer was sent as a facilitator");
    assert.equal(changes.count, 1 + 1 + 3 + 2);
  });

  test("somebody taken out of every group is sent as no group, and somebody nowhere in either is not sent", () => {
    const live = liveRun();
    const draft = asItIs().map((group) => ({ ...group, memberUids: group.memberUids.filter((uid) => uid !== "cy") }));
    const changes = changesBetween(live, draft);
    assert.deepEqual(changes.places, [{ uid: "cy", from: "gb", to: null }]);
    assert.equal(changes.count, 1);
  });

  test("a group of the run a suggestion could not draw keeps its people", () => {
    const live = liveRun();
    // Group B is missing from the suggestion; cy is seated nowhere in it.
    const draft = draftOver([asItIs()[0]], live.groups);
    assert.deepEqual(changesBetween(live, draft).places, []);
    // Seated elsewhere in the suggestion, cy is moved and not kept twice.
    const moved = draftOver([{ ...asItIs()[0], memberUids: ["ana", "bo", "fay", "cy"] }], live.groups);
    assert.deepEqual(changesBetween(live, moved).places, [{ uid: "cy", from: "gb", to: "A1" }]);
    assert.deepEqual(moved.find((group) => group.id === "gb").memberUids, []);
  });
});

describe("a group an earlier press made", () => {
  test("is recognised by its name at the same time, and is not made again", () => {
    const live = liveRun();
    live.groups.push({ id: "gd", name: "Group D", session: at(5, "17:00"), slot: { weekday: 5, start: "17:00" }, facilitatorUids: [], memberUids: ["dee"] });
    live.people.dee.groupId = "gd";
    const draft = recognise(
      [...asItIs(), { key: "A4", id: null, name: "group d ", session: at(5, "17:00"), room: 6, memberUids: ["dee"], facilitators: [] }],
      live.groups,
    );
    assert.equal(draft[2].id, "gd");
    const changes = changesBetween(live, draft);
    assert.deepEqual(changes.groups, []);
    assert.equal(changes.count, 0, "a second press would make the group again or move dee");
  });

  test("a name taken at another time is given a free name instead", () => {
    const live = liveRun();
    const draft = recognise([...asItIs(), { key: "A4", id: null, name: "Group B", session: THU, room: 6, memberUids: ["dee"], facilitators: [] }], live.groups);
    assert.equal(draft[2].id, null);
    assert.equal(draft[2].name, "Group D");
    assert.equal(freeGroupName(["Group A", "Group C"]), "Group D");
    assert.equal(freeGroupName(["Monday", "Group A"]), "Group B");
    assert.equal(freeGroupName([]), "Group A");
  });
});

test("the places are sent out of a group first, then between groups, then into one", () => {
  const order = placementOrder([
    { uid: "a", from: null, to: "A1" },
    { uid: "b", from: "g1", to: "A2" },
    { uid: "c", from: "g2", to: null },
    { uid: "d", from: "g1", to: "A1" },
  ]);
  assert.deepEqual(order.map((place) => place.uid), ["c", "b", "d", "a"]);
});

describe("every reason the allocate route refuses a placement for has words", () => {
  const route = readFileSync(join(REPO_ROOT, "src", "app", "api", "courses", "runs", "[runId]", "allocate", "route.ts"), "utf8");
  const reasons = [...new Set([...route.matchAll(/reason:\s*"([a-z-]+)"/g)].map((match) => match[1]))].sort();
  const fallback = notMovedWords("Pat Doe", "Group A", "a-reason-nobody-sends");

  test("the scanner finds the route's reasons", () => {
    // Five today; the list grows with the route, and each one is checked below.
    assert.ok(reasons.length >= 5, `only ${reasons.join(", ")}`);
    for (const known of ["not-accepted", "group-not-found", "group-archived", "group-full", "facilitates-another-group"]) {
      assert.ok(reasons.includes(known), `the scanner missed ${known}`);
    }
  });

  for (const reason of ["not-accepted", "group-not-found", "group-archived", "group-full", "facilitates-another-group"]) {
    test(`${reason} is said in words`, () => {
      const words = notMovedWords("Pat Doe", "Group A", reason);
      assert.notEqual(words, fallback, `${reason} reaches the screen as the catch-all`);
      assert.ok(!words.includes(reason), `${reason} reaches the screen as a code`);
      assert.match(words, /^Pat Doe wasn’t moved: /);
    });
  }

  test("and no reason the route sends is without its own words", () => {
    for (const reason of reasons) {
      assert.notEqual(notMovedWords("Pat Doe", "Group A", reason), fallback, `${reason} has no words of its own`);
    }
  });
});
