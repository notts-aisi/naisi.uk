/**
 * The first draft of who goes where across a whole term, run for real.
 *
 * Run with `npm test`. `src/lib/applications/intake/match.ts` is pure.
 *
 *  - each person ends on the highest programme on their own list that has
 *    room and would have them;
 *  - a programme orders people by its lead's decision, then Claude's lean,
 *    then the committee's score;
 *  - a lead's Decline is never overruled;
 *  - the result is stable and does not depend on the order people arrive in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const { matchIntake } = await loadTs("lib/applications/intake/match.ts");

const on = (entries) => Object.fromEntries(entries.map(([id, standing = "to-review", lean = null, score = null]) => [id, { standing, lean, score }]));
const person = (uid, ranked, entries) => ({ uid, ranked, on: on(entries ?? ranked.map((id) => [id])) });
const result = (people, programmes) => Object.fromEntries(matchIntake(people, programmes));

test("everybody gets their first choice when there is room", () => {
  const got = result(
    [person("a", ["agi", "tech"]), person("b", ["tech", "agi"])],
    [{ id: "agi", places: 5 }, { id: "tech", places: 5 }],
  );
  assert.deepEqual(got, { a: "agi", b: "tech" });
});

test("a full programme keeps its lead's Accept first, and the other tries their next choice", () => {
  const people = [
    person("a", ["agi", "tech"], [["agi", "to-review", "strong", 5], ["tech"]]),
    person("b", ["agi", "tech"], [["agi", "accepted", "weak", 2], ["tech"]]),
  ];
  assert.deepEqual(result(people, [{ id: "agi", places: 1 }, { id: "tech", places: 1 }]), { a: "tech", b: "agi" });
});

test("among the undecided, Claude's lean and then the score decide", () => {
  const people = [
    person("a", ["agi"], [["agi", "to-review", "borderline", 5]]),
    person("b", ["agi"], [["agi", "to-review", "strong", 3]]),
    person("c", ["agi"], [["agi", "to-review", "strong", 4]]),
  ];
  const got = result(people, [{ id: "agi", places: 2 }]);
  assert.deepEqual(got, { a: null, b: "agi", c: "agi" });
});

test("a lead's Decline is never overruled, even with room", () => {
  const got = result([person("a", ["agi", "tech"], [["agi", "declined", "strong", 5], ["tech"]])], [{ id: "agi", places: 9 }, { id: "tech", places: 9 }]);
  assert.deepEqual(got, { a: "tech" });
});

test("somebody nobody can take is left without a programme", () => {
  assert.deepEqual(result([person("a", ["agi"])], [{ id: "agi", places: 0 }]), { a: null });
});

test("no set number of places takes everybody who reaches it", () => {
  const people = ["a", "b", "c", "d"].map((uid) => person(uid, ["inc"]));
  assert.deepEqual(Object.values(result(people, [{ id: "inc", places: null }])), ["inc", "inc", "inc", "inc"]);
});

test("the draft is stable: nobody would rather a programme that would rather have them", () => {
  const ids = ["agi", "tech", "inc"];
  const people = Array.from({ length: 30 }, (_, i) => {
    const ranked = [ids[i % 3], ids[(i + 1) % 3]];
    return person(`p${String(i).padStart(2, "0")}`, ranked, ranked.map((id, j) => [id, "to-review", ["strong", "borderline", "weak"][(i + j) % 3], (i * 7) % 5]));
  });
  const programmes = ids.map((id) => ({ id, places: 6 }));
  const got = matchIntake(people, programmes);
  const order = (id, a, b) => {
    const rank = { strong: 0, borderline: 1, weak: 2 };
    const x = a.on[id], y = b.on[id];
    return rank[x.lean] - rank[y.lean] || y.score - x.score || (a.uid < b.uid ? -1 : 1);
  };
  for (const p of people) {
    const mine = got.get(p.uid);
    const better = mine === null ? p.ranked : p.ranked.slice(0, p.ranked.indexOf(mine));
    for (const id of better) {
      const kept = people.filter((q) => got.get(q.uid) === id);
      const room = programmes.find((x) => x.id === id).places;
      assert.ok(
        kept.length >= room && kept.every((q) => order(id, q, p) < 0),
        `${p.uid} would rather ${id}, and ${id} would rather have them than somebody it kept`,
      );
    }
  }
  // And the same answer whatever order the people arrive in.
  assert.deepEqual([...matchIntake([...people].reverse(), programmes)].sort(), [...got].sort());
});
