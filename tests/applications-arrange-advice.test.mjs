/**
 * Several arrangements of a programme's people into groups, what Claude is
 * told about them, and what is kept of what it says, run for real.
 *
 * Run with `npm test`. `src/lib/applications/arrange/options.ts` and
 * `advice.ts` are pure.
 *
 *  - THE OPTIONS (`candidatePlans`) differ in their times, never seat anybody
 *    in a group they cannot make or past its room, never move somebody already
 *    told, and spread the people who offered to facilitate so each group has
 *    one where it can (`spreadFacilitators`), the strongest shared out.
 *  - CLAUDE IS TOLD numbers and labels, never a name, never anybody's week,
 *    and never what Pangram found.
 *  - NOTHING CLAUDE SAYS IS TAKEN ON TRUST (`applyChoice`): an option has to
 *    be one it was shown; a move has to be within the option, to a group the
 *    person can make, with room, and never of somebody told; a lead sits in
 *    the group they lead and leads one; a lead who did not offer is given a
 *    back-up who did; a second beside a lead who offered is not kept; a group
 *    with no lead named gets the site's best guess who offered. Everything
 *    not kept is listed with why.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const { candidatePlans, spreadFacilitators, MAX_CANDIDATES } = await loadTs("lib/applications/arrange/options.ts");
const { applyChoice, choiceFrom, choiceInputFrom, siteOption } = await loadTs("lib/applications/arrange/advice.ts");
const { canMake, slotFor } = await loadTs("lib/applications/arrange/plan.ts");

const MINUTES = 90;
const TUE = { weekday: 2, start: 18 * 60 };
const WED = { weekday: 3, start: 18 * 60 };
const THU = { weekday: 4, start: 17 * 60 };
const FRI = { weekday: 5, start: 12 * 60 };

const freeAt = (...times) => ({
  kind: "given",
  covers: (session) =>
    times.some((t) => slotFor(t, MINUTES).weekday === session.weekday && slotFor(t, MINUTES).startTimeLocal === session.startTimeLocal),
});
const person = (uid, week, over = {}) => ({ uid, name: `Person ${uid.toUpperCase()}`, week, facilitates: false, groupId: null, told: false, ...over });
const names = (taken) => `Group ${String.fromCharCode(65 + taken.length)}`;
const asMap = (people) => new Map(people.map((p) => [p.uid, p]));
const options = (people, over = {}) =>
  candidatePlans({ people, groups: [], best: [TUE, WED, THU, FRI], minutes: MINUTES, size: 3, names, strength: new Map(), ...over });

describe("the options", () => {
  const everybody = [
    person("a", freeAt(TUE, WED, THU), { facilitates: true }),
    person("b", freeAt(TUE, WED, THU), { facilitates: true }),
    person("c", freeAt(TUE, WED, THU, FRI)),
    person("d", freeAt(TUE, WED, FRI)),
    person("e", freeAt(WED, THU)),
    person("f", freeAt(TUE, THU, FRI)),
  ];

  test("differ in their times, and never seat anybody where they cannot go", () => {
    const found = options(everybody);
    assert.ok(found.length >= 2 && found.length <= MAX_CANDIDATES, `${found.length} options`);
    const times = found.map((c) => c.plan.groups.map((g) => `${g.session.weekday}@${g.session.startTimeLocal}`).sort().join(","));
    assert.ok(new Set(times).size >= 2, "the options all meet at the same times");
    const people = asMap(everybody);
    for (const candidate of found) {
      for (const group of candidate.plan.groups) {
        assert.ok(group.memberUids.length <= group.room, "a group past its room");
        for (const uid of group.memberUids) assert.ok(canMake(people.get(uid), group.session), `${uid} cannot make ${group.session.startTimeLocal}`);
      }
      const seated = candidate.plan.groups.flatMap((g) => g.memberUids);
      assert.equal(new Set(seated).size, seated.length, "somebody seated twice");
    }
  });

  test("the best seat the most people, and a group with somebody who offered beats one without", () => {
    const [best] = options(everybody);
    assert.equal(best.score.unplaced, 0);
    assert.equal(best.score.covered, best.plan.groups.length, "every group has somebody who offered");
  });

  test("a group nobody has been told about may be given a new time; one somebody has keeps its own", () => {
    const groups = [
      { id: "g1", name: "Group A", session: slotFor(FRI, MINUTES), capacity: 3 },
      { id: "g2", name: "Group B", session: slotFor(TUE, MINUTES), capacity: 3 },
    ];
    const people = [person("t", freeAt(TUE, WED, FRI), { told: true, groupId: "g1" }), ...everybody];
    const found = options(people, { groups });
    // The groups as they are is one of the first five.
    assert.ok(
      found.slice(0, 5).some((c) => c.plan.groups.every((g) => !g.timeIsNew || g.id === null)),
      "no option keeps the run's groups at their own times",
    );
    for (const candidate of found) {
      const told = candidate.plan.groups.find((g) => g.id === "g1");
      assert.equal(told.session.weekday, FRI.weekday, "a group somebody was told about changed its time");
      for (const group of candidate.plan.groups) {
        const had = groups.find((g) => g.id === group.id)?.session;
        if (had && had.weekday === group.session.weekday && had.startTimeLocal === group.session.startTimeLocal) {
          assert.equal(group.timeIsNew, false, "a group given back its own time is marked as a new time");
        }
      }
    }
    assert.ok(found.some((c) => c.plan.groups.find((g) => g.id === "g2").timeIsNew), "no option tries another time for the untold group");
  });

  test("somebody already told their group stays in it in every option", () => {
    const groups = [{ id: "g1", name: "Group A", session: slotFor(FRI, MINUTES), capacity: 3 }];
    const people = [person("t", freeAt(TUE, WED, FRI), { told: true, groupId: "g1" }), ...everybody.slice(0, 4)];
    for (const candidate of options(people, { groups })) {
      assert.ok(candidate.plan.groups.find((g) => g.id === "g1").memberUids.includes("t"));
    }
  });
});

describe("spreading the facilitators", () => {
  const plan = (groups, kept = []) => ({ groups, unplaced: [], keptUids: kept, nearUids: [] });
  const group = (session, memberUids, room = 4) => ({ id: null, name: "", session: slotFor(session, MINUTES), timeIsNew: true, room, memberUids });

  test("a group with nobody who offered is given somebody from a group with two, into a free seat", () => {
    const people = asMap([
      person("a", freeAt(TUE, WED), { facilitates: true }),
      person("b", freeAt(TUE, WED), { facilitates: true }),
      person("c", freeAt(WED)),
    ]);
    const spread = spreadFacilitators(plan([group(TUE, ["a", "b"]), group(WED, ["c"])]), people, new Map([["a", 3], ["b", 1]]));
    // The stronger stays; the other moves.
    assert.deepEqual(spread.groups.map((g) => [...g.memberUids].sort()), [["a"], ["b", "c"]]);
  });

  test("into a full group, by swapping with somebody who did not offer and can make the other time", () => {
    const people = asMap([
      person("a", freeAt(TUE, WED), { facilitates: true }),
      person("b", freeAt(TUE, WED), { facilitates: true }),
      person("c", freeAt(TUE, WED)),
      person("d", freeAt(WED)),
    ]);
    const spread = spreadFacilitators(plan([group(TUE, ["a", "b"], 2), group(WED, ["c", "d"], 2)]), people, new Map());
    const wed = spread.groups[1].memberUids;
    assert.ok(wed.some((uid) => people.get(uid).facilitates), "Wednesday still has nobody who offered");
    assert.ok(spread.groups.every((g) => g.memberUids.length === 2));
    assert.ok(spread.groups[0].memberUids.includes("c"), "the one swapped out can make Tuesday");
  });

  test("the strongest are shared out, and nobody told or placed near their time moves", () => {
    const people = asMap([
      person("a", freeAt(TUE, WED), { facilitates: true }),
      person("b", freeAt(TUE, WED), { facilitates: true }),
      person("c", freeAt(TUE, WED), { facilitates: true }),
      person("d", freeAt(WED), { facilitates: true }),
    ]);
    const strength = new Map([["a", 3], ["b", 3], ["c", 1], ["d", 1]]);
    const spread = spreadFacilitators(plan([group(TUE, ["a", "b", "c"]), group(WED, ["d"])]), people, strength);
    const strongIn = spread.groups.map((g) => g.memberUids.filter((uid) => strength.get(uid) >= 3).length);
    assert.deepEqual(strongIn, [1, 1]);

    const told = spreadFacilitators(plan([group(TUE, ["a", "b"]), group(WED, ["d"])], ["b"]), people, strength);
    assert.ok(told.groups[0].memberUids.includes("b"), "somebody told their group moved");
  });
});

/** Two options of two groups, and the labels Claude is given. */
function world() {
  const everybody = [
    person("ada", freeAt(TUE, WED), { facilitates: true }),
    person("bo", freeAt(TUE)),
    person("cy", freeAt(TUE, WED), { told: true, groupId: "g1" }),
    person("di", freeAt(WED), { facilitates: true }),
    person("ed", freeAt(TUE, WED)),
  ];
  const people = asMap(everybody);
  const plan = (groups) => ({ groups, unplaced: [], keptUids: ["cy"], nearUids: [] });
  const group = (id, session, memberUids, room = 3) => ({ id, name: id ? "Group A" : "Group B", session: slotFor(session, MINUTES), timeIsNew: id === null, room, memberUids });
  const candidates = [
    { size: 3, score: { seated: 5 }, plan: plan([group("g1", TUE, ["cy", "ada", "bo"]), group(null, WED, ["di", "ed"])]) },
    { size: 3, score: { seated: 5 }, plan: plan([group("g1", TUE, ["cy", "bo", "ed"]), group(null, WED, ["ada", "di"])]) },
  ];
  const reads = new Map([
    ["ada", { lean: "strong", summary: "Reviewer A liked her rigour.", strengths: ["Clear"], concerns: [], thin: 0 }],
    ["ed", { lean: "weak", summary: "Short answers.", strengths: [], concerns: ["Brief"], thin: 2 }],
  ]);
  const input = choiceInputFrom({ programmeName: "AGI Strategy", candidates, people, reads, kept: new Set(["cy"]), staffed: new Map() });
  return { people, candidates, input };
}

const answer = (over = {}) =>
  choiceFrom({
    potential: [{ applicant: "Applicant 1", level: "high", why: "Thoughtful." }],
    options: [
      {
        option: "Option B",
        rank: 1,
        title: "Mixed",
        pros: ["Even"],
        cons: [],
        groups: [{ group: "Group B2", why: "Good mix.", facilitator: "Applicant 1", facilitatorWhy: "Strong.", second: "", secondWhy: "" }],
        moves: [],
      },
      { option: "Option A", rank: 2, title: "Popular", pros: [], cons: ["Uneven"], groups: [], moves: [] },
    ],
    preferred: "Option B",
    preferredWhy: "Option B spreads them.",
    notes: "",
    ...over,
  });

describe("what Claude is told", () => {
  test("numbers and labels, never a name, a week or a Pangram finding", () => {
    const { input } = world();
    for (const name of ["Person ADA", "Person BO", "ada", "Group A ", "Pangram", "worth a look", "covers"]) {
      assert.equal(input.message.includes(name), false, `the message carries ${name}`);
    }
    // Applicants numbered in account-id order: ada 1, bo 2, cy 3, di 4, ed 5.
    assert.match(input.message, /- Applicant 1: offered to facilitate\. Lean strong\. a reviewer liked her rigour\. Strengths: Clear\./);
    assert.match(input.message, /- Applicant 3: did not offer to facilitate\. Already told their group, so stays in it\./);
    assert.match(input.message, /- Applicant 5: did not offer to facilitate\. Lean weak\. Short answers\. Concerns: Brief\. 2 answers thin or brief\./);
    assert.match(input.message, /### Group A1: Tue 18:00, 90 minutes \(room for 3\)\n- Applicant 3 \(can also make A2\)/);
    assert.match(input.message, /### Group B2: Wed 18:00, 90 minutes \(room for 3; a new group\)/);
    assert.deepEqual(input.groups["Group B2"], [1, 1]);
  });
});

describe("what is kept of Claude's choice", () => {
  test("its options, best first, as it ranked them", () => {
    const { people, candidates, input } = world();
    const applied = applyChoice(candidates, people, new Map(), input, answer());
    assert.deepEqual(applied.options.map((o) => o.candidate), [1, 0]);
    assert.equal(applied.options[0].preferred, true);
    assert.equal(applied.potential.get("ada").level, "high");
  });

  test("an option it was not shown is dropped, and with none left the site's own are shown", () => {
    const { people, candidates, input } = world();
    const applied = applyChoice(candidates, people, new Map(), input, answer({ options: [{ option: "Option H", rank: 1, title: "", pros: [], cons: [], groups: [], moves: [] }], preferred: "" }));
    assert.equal(applied.dropped[0].why, "is not one of the options it was shown");
    assert.deepEqual(applied.options.map((o) => o.candidate), [0, 1]);
    assert.equal(applied.options[0].preferred, true);
  });

  test("a move is kept only within its option, to a group they can make, with room, and never of somebody told", () => {
    const { people, candidates, input } = world();
    const moves = [
      { applicant: "Applicant 2", to: "Group A2", why: "x" }, // bo cannot make Wednesday
      { applicant: "Applicant 3", to: "Group A2", why: "x" }, // cy was told
      { applicant: "Applicant 5", to: "Group B2", why: "x" }, // a group of the other option
      { applicant: "Applicant 1", to: "Group A2", why: "x" }, // fits
    ];
    const applied = applyChoice(candidates, people, new Map(), input, answer({
      options: [{ option: "Option A", rank: 1, title: "", pros: [], cons: [], groups: [], moves }],
      preferred: "Option A",
    }));
    const [chosen] = applied.options;
    assert.deepEqual(chosen.plan.groups.map((g) => [...g.memberUids].sort()), [["bo", "cy"], ["ada", "di", "ed"]]);
    assert.deepEqual(chosen.movedUids, ["ada"]);
    assert.deepEqual(applied.dropped.map((d) => d.why), [
      "Applicant 2 cannot make that group's time",
      "Applicant 3 has already been told their group",
      "names somebody or a group that is not in that option",
    ]);
  });

  test("a lead sits in the group they lead, and leads one group", () => {
    const { people, candidates, input } = world();
    const groups = [
      { group: "Group A2", why: "", facilitator: "Applicant 1", facilitatorWhy: "", second: "", secondWhy: "" },
      { group: "Group A1", why: "", facilitator: "Applicant 1", facilitatorWhy: "", second: "", secondWhy: "" },
    ];
    const applied = applyChoice(candidates, people, new Map(), input, answer({
      options: [{ option: "Option A", rank: 1, title: "", pros: [], cons: [], groups, moves: [] }],
      preferred: "Option A",
    }));
    const [chosen] = applied.options;
    assert.ok(chosen.plan.groups[1].memberUids.includes("ada"), "moved to the group she leads");
    assert.deepEqual(chosen.groups[1].facilitators.map((f) => [f.uid, f.role]), [["ada", "lead"]]);
    assert.equal(applied.dropped.at(-1).why, "Applicant 1 already facilitates another group in this option");
  });

  test("a lead who did not offer gets a back-up who did; a second beside a lead who offered is not kept", () => {
    const { people, candidates, input } = world();
    const groups = [
      // ed did not offer: Claude names no second, so the site picks di, who offered and is there.
      { group: "Group A2", why: "", facilitator: "Applicant 5", facilitatorWhy: "Stands out.", second: "", secondWhy: "" },
      // ada offered: a second is one too many.
      { group: "Group A1", why: "", facilitator: "Applicant 1", facilitatorWhy: "", second: "Applicant 2", secondWhy: "" },
    ];
    const applied = applyChoice(candidates, people, new Map(), input, answer({
      options: [{ option: "Option A", rank: 1, title: "", pros: [], cons: [], groups, moves: [] }],
      preferred: "Option A",
    }));
    const [chosen] = applied.options;
    assert.deepEqual(chosen.groups[1].facilitators.map((f) => [f.uid, f.role, f.offered, f.bySite]), [
      ["ed", "lead", false, false],
      ["di", "second", true, true],
    ]);
    assert.deepEqual(chosen.groups[0].facilitators.map((f) => f.uid), ["ada"]);
    assert.equal(applied.dropped.at(-1).why, "the lead offered, so one facilitator is enough");
  });

  test("a group Claude named nobody for gets the site's best guess who offered", () => {
    const { people, candidates } = world();
    const site = siteOption(candidates[0], 0, people, new Map([["ada", 3], ["di", 2]]));
    assert.deepEqual(site.groups.map((g) => g.facilitators.map((f) => [f.uid, f.bySite])), [[["ada", true]], [["di", true]]]);
  });
});
