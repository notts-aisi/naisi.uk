/**
 * Making an incubator's teams, worked out before anything is written, and
 * the words the Teams tab and the team email are built from.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - Teams from first choices (`teamsFromFirstChoices`) reproduce in-agenda's
 *    own sample exactly, keep every team within the smallest and largest
 *    size, let go of an under-size team one at a time, and never put a person
 *    in two teams.
 *  - A pitch's team (`pitchTeamPeople`) takes its pitchers, then the people
 *    who would join it and are in no team, fewest picks first, up to the
 *    largest size, and says when it would be under the smallest.
 *  - The words, from records: sizes, places, the project line, the day the
 *    teams are made, the email.
 *  - The run's setting: only the two ways are kept, and the run editor
 *    writes what the reader keeps.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { INC, makeTeamsWorld } from "./lib/teamsWorld.mjs";

const made = await makeTeamsWorld("__teamsMake");
const make = await made.loadTs(join("lib", "courses", "teams", "make.ts"));
const words = await made.loadTs(join("lib", "courses", "teams", "words.ts"));
const model = await made.loadTs(join("lib", "courses", "teams", "model.ts"));
const courses = await made.loadTs(join("lib", "firestore", "courses.ts"));
const mutations = await made.loadClient(join("features", "courses", "courseMutations.ts"));

/** in-agenda's items, in the form's order. */
const ITEMS = [
  "Compute governance",
  "International coordination",
  "Frontier lab safety policies",
  "Open-weight models",
  "AI in elections",
];
const [CG, IC, FL, OW, AI] = ITEMS;

/**
 * in-agenda's ten people, with rankings that give the board's own table:
 * 1st 4, 3, 2, 1, 0; 2nd 2, 3, 3, 1, 1; 3rd 2, 1, 2, 3, 2.
 */
const BOARD = [
  { uid: "clara", name: "Clara Jensen", ranking: [CG, IC, FL] },
  { uid: "dominic", name: "Dominic Osei", ranking: [CG, FL, OW] },
  { uid: "elena", name: "Elena Popescu", ranking: [CG, IC, AI] },
  { uid: "luca", name: "Luca Romano", ranking: [CG, OW, IC] },
  { uid: "fatima", name: "Fatima Zahra", ranking: [IC, CG, OW] },
  { uid: "gabriel", name: "Gabriel Silva", ranking: [IC, FL, OW] },
  { uid: "harriet", name: "Harriet Lowe", ranking: [IC, CG, FL] },
  { uid: "ibrahim", name: "Ibrahim Khan", ranking: [FL, IC, AI] },
  { uid: "jonah", name: "Jonah Weiss", ranking: [FL, AI, CG] },
  { uid: "keira", name: "Keira Doyle", ranking: [OW, FL, CG] },
];

/** Every person placed once at most, and every team within the sizes. */
function assertWellMade(result, people, sizes) {
  const placed = result.teams.flatMap((team) => team.uids);
  assert.equal(new Set(placed).size, placed.length, "somebody is in two teams");
  assert.deepEqual(
    [...placed, ...result.unplaced].sort(),
    people.map((person) => person.uid).sort(),
    "somebody is neither in a team nor left in no team",
  );
  for (const team of result.teams) {
    assert.ok(team.uids.length >= sizes.min && team.uids.length <= sizes.max, `${team.item} has ${team.uids.length}`);
  }
}

describe("teams from first choices", () => {
  test("in-agenda's own sample, with teams of 2 to 3, comes out as the board draws it", () => {
    const sizes = { min: 2, max: 3 };
    const result = make.teamsFromFirstChoices(BOARD, ITEMS, sizes);
    assert.deepEqual(result.teams, [
      { item: CG, uids: ["clara", "dominic", "elena"] },
      { item: IC, uids: ["fatima", "gabriel", "harriet"] },
      { item: FL, uids: ["ibrahim", "jonah"] },
      { item: OW, uids: ["keira", "luca"] },
    ]);
    assert.deepEqual(result.unplaced, []);
    assertWellMade(result, BOARD, sizes);
  });

  test("at the largest size, a contested item goes to whoever ranked fewest items, then by name", () => {
    const people = [
      { uid: "y", name: "Ada", ranking: ["A", "B"] },
      { uid: "x", name: "Zoe", ranking: ["A"] },
      { uid: "w", name: "Ben", ranking: ["A", "B"] },
    ];
    const result = make.teamsFromFirstChoices(people, ["A", "B"], { min: 1, max: 2 });
    // Zoe ranked only A, so she has nowhere else to go; then Ada by name.
    assert.deepEqual(result.teams, [
      { item: "A", uids: ["y", "x"] },
      { item: "B", uids: ["w"] },
    ]);
  });

  test("a team at exactly the smallest size stays; one below it is let go, the one fewer people ranked at all, and its people try their next choices", () => {
    const people = [
      { uid: "a1", name: "A one", ranking: ["A", "C"] },
      { uid: "a2", name: "A two", ranking: ["A", "C"] },
      { uid: "b1", name: "B one", ranking: ["B", "C"] },
      { uid: "c1", name: "C one", ranking: ["C"] },
    ];
    const kept = make.teamsFromFirstChoices(people, ["A", "B", "C"], { min: 2, max: 4 });
    // A has two: kept. B and C have one each, and one first choice each; four
    // people ranked C and one ranked B, so B is let go, and B one goes to C.
    assert.deepEqual(kept.teams, [
      { item: "A", uids: ["a1", "a2"] },
      { item: "C", uids: ["b1", "c1"] },
    ]);
    assertWellMade(kept, people, { min: 2, max: 4 });
  });

  test("letting go one at a time can bring another team up to size", () => {
    const people = [
      { uid: "p1", name: "P one", ranking: ["A", "B"] },
      { uid: "p2", name: "P two", ranking: ["A", "B"] },
      { uid: "p3", name: "P three", ranking: ["B", "A"] },
      { uid: "p4", name: "P four", ranking: ["B", "A"] },
      { uid: "p5", name: "P five", ranking: ["C"] },
      { uid: "p6", name: "P six", ranking: ["C"] },
      { uid: "p7", name: "P seven", ranking: ["C"] },
    ];
    const sizes = { min: 3, max: 4 };
    const result = make.teamsFromFirstChoices(people, ["A", "B", "C"], sizes);
    // A and B both have two. B, the later on the agenda, is let go first; its
    // people's second choice is A, which then has four. Letting both go at
    // once would have left four people in no team.
    // A team's people come back in name order: "P four", "P one", "P three", "P two".
    assert.deepEqual(result.teams, [
      { item: "A", uids: ["p4", "p1", "p3", "p2"] },
      { item: "C", uids: ["p5", "p7", "p6"] },
    ]);
    assert.deepEqual(result.unplaced, []);
    assertWellMade(result, people, sizes);
  });

  test("somebody who ranked nothing, or whose choices all filled or were let go, is in no team", () => {
    const people = [
      { uid: "full1", name: "One", ranking: ["A"] },
      { uid: "full2", name: "Two", ranking: ["A"] },
      { uid: "late", name: "Zed", ranking: ["A"] },
      { uid: "none", name: "Nobody", ranking: [] },
      { uid: "alone", name: "Alone", ranking: ["B"] },
    ];
    const result = make.teamsFromFirstChoices(people, ["A", "B"], { min: 2, max: 2 });
    assert.deepEqual(result.teams, [{ item: "A", uids: ["full1", "full2"] }]);
    assert.deepEqual(result.unplaced.sort(), ["alone", "late", "none"]);
  });

  test("an item not on the agenda, or ranked twice, is not a choice", () => {
    const people = [
      { uid: "a", name: "A", ranking: ["Elsewhere", "A", "A"] },
      { uid: "b", name: "B", ranking: ["A"] },
    ];
    const result = make.teamsFromFirstChoices(people, ["A"], { min: 2, max: 3 });
    assert.deepEqual(result.teams, [{ item: "A", uids: ["a", "b"] }]);
  });

  test("whatever the sizes, nobody is in two teams and every team is within them", () => {
    for (const [min, max] of [[1, 1], [1, 3], [2, 2], [2, 4], [3, 3], [3, 5], [4, 6], [5, 10]]) {
      const result = make.teamsFromFirstChoices(BOARD, ITEMS, { min, max });
      assertWellMade(result, BOARD, { min, max });
    }
  });
});

describe("a pitch's team", () => {
  const inGroup = new Map([
    ["amara", "Amara"],
    ["dev", "Dev"],
    ["bea", "Bea"],
    ["kai", "Kai"],
    ["lena", "Lena"],
    ["maya", "Maya"],
  ]);

  test("its pitchers, then the people who would join it, fewest picks first and then by name, up to the largest team", () => {
    const result = make.pitchTeamPeople({
      pitcherUids: ["amara", "dev"],
      wouldJoinUids: ["lena", "kai", "bea", "outsider"],
      inGroup,
      teamOf: new Map(),
      picks: new Map([
        ["lena", 3],
        ["kai", 1],
        ["bea", 3],
      ]),
      sizes: { min: 2, max: 4 },
    });
    // Kai picked one pitch; Bea and Lena three each, so Bea by name.
    assert.deepEqual(result, { uids: ["amara", "dev", "kai", "bea"], takenFrom: [], short: false });
  });

  test("a pitcher in another team is taken out of it; somebody who would join and is in a team stays there", () => {
    const result = make.pitchTeamPeople({
      pitcherUids: ["amara"],
      wouldJoinUids: ["bea", "kai"],
      inGroup,
      teamOf: new Map([
        ["amara", "team-x"],
        ["bea", "team-y"],
      ]),
      picks: new Map(),
      sizes: { min: 2, max: 4 },
    });
    assert.deepEqual(result, { uids: ["amara", "kai"], takenFrom: [{ uid: "amara", teamId: "team-x" }], short: false });
  });

  test("below the smallest team it says so; at the smallest it does not", () => {
    const base = { pitcherUids: ["maya"], inGroup, teamOf: new Map(), picks: new Map() };
    assert.equal(make.pitchTeamPeople({ ...base, wouldJoinUids: [], sizes: { min: 2, max: 4 } }).short, true);
    assert.equal(make.pitchTeamPeople({ ...base, wouldJoinUids: ["lena"], sizes: { min: 2, max: 4 } }).short, false);
  });

  test("never more than the largest team, pitchers included", () => {
    const result = make.pitchTeamPeople({
      pitcherUids: ["amara", "dev"],
      wouldJoinUids: ["bea"],
      inGroup,
      teamOf: new Map(),
      picks: new Map(),
      sizes: { min: 1, max: 1 },
    });
    assert.deepEqual(result.uids, ["amara"]);
  });
});

describe("the words", () => {
  test("places, people, and the count on the button", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23].map(words.placeWords),
      ["1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "21st", "22nd", "23rd"],
    );
    assert.equal(words.peopleWords(1), "1 person");
    assert.equal(words.peopleWords(3), "3 people");
    assert.equal(words.emailsWords(12), "Emails 12 people");
    assert.equal(words.emailsWords(1), "Emails 1 person");
    assert.deepEqual(words.inATeamWords(12, 12), { count: "12 of 12", rest: " in a team." });
  });

  test("the project line, with the paper as the slot and the twist's first letter lowered only when that changes no name", () => {
    assert.equal(
      words.projectLine("Probes that transfer", "Test whether the probes still work on a smaller open model"),
      "Replicate Probes that transfer, then: test whether the probes still work on a smaller open model",
    );
    assert.equal(words.projectLine("A paper", "GPT-2 sized models only"), "Replicate A paper, then: GPT-2 sized models only");
    assert.equal(words.projectLine("A paper", "AI labs first"), "Replicate A paper, then: AI labs first");
    assert.equal(words.projectLine("A paper", "I’d rebuild it"), "Replicate A paper, then: I’d rebuild it");
    assert.equal(words.projectLine(null, "Rebuild the evaluation"), "Rebuild the evaluation");
  });

  test("the day the teams are made, and the line that says it, up to and on that day", () => {
    assert.equal(words.teamsByDay("2026-11-19"), "Thu 19 Nov");
    assert.equal(words.teamsByDay(null), null);
    assert.equal(words.changeUntilWords("2026-11-18", "2026-11-11"), "You can change them until Wed 18 Nov.");
    assert.equal(words.changeUntilWords("2026-11-18", "2026-11-18"), "You can change them until Wed 18 Nov.");
    assert.equal(words.changeUntilWords("2026-11-18", "2026-11-19"), null);
    assert.equal(words.changeUntilWords(null, "2026-11-11"), null);
  });

  test("a team outside the sizes says which way", () => {
    assert.equal(words.sizeNoteWords(1, { min: 2, max: 4 }), "Smaller than the smallest team, 2 people.");
    assert.equal(words.sizeNoteWords(5, { min: 2, max: 4 }), "Larger than the largest team, 4 people.");
    assert.equal(words.sizeNoteWords(2, { min: 2, max: 4 }), null);
    assert.equal(words.sizeNoteWords(9, null), null);
  });

  test("the email, written whole, or not at all", () => {
    const facts = {
      firstName: "Wen",
      teamName: "Probe transfer",
      project: "Replicate Probes that transfer, then: test whether the probes still work on a smaller open model",
      teammates: ["George", "Lily"],
      programmeName: "Alignment Research",
      leadFirstName: "Zach",
    };
    assert.deepEqual(words.teamEmailWords(facts), {
      subject: "Your team: Probe transfer",
      greeting: "Hi Wen,",
      paragraphs: [
        "You’re in Probe transfer, one of Alignment Research’s teams.",
        "Your project: Replicate Probes that transfer, then: test whether the probes still work on a smaller open model.",
        "You’re with George and Lily.",
        "Your weekly session stays as it is: the teams work inside it.",
        "If something here isn’t right, reply to this email.",
      ],
      signOff: "Zach",
    });
    const alone = words.teamEmailWords({ ...facts, project: "", teammates: [], firstName: "", leadFirstName: null });
    assert.deepEqual(alone.paragraphs.slice(0, 2), ["You’re in Probe transfer, one of Alignment Research’s teams.", "Nobody else is in it yet."]);
    assert.equal(alone.greeting, null);
    assert.equal(alone.signOff, null);
    assert.equal(words.teamEmailWords({ ...facts, teamName: " " }), null);
    assert.equal(words.teamEmailWords({ ...facts, programmeName: "" }), null);
    assert.equal(words.testSubject("Your team: Probe transfer"), "[TEST] Your team: Probe transfer");
  });

  test("what a press did, a sentence each", () => {
    assert.deepEqual(words.tellReportWords({ sent: 12, held: 0, suppressed: 0, failed: [], noAddress: [] }), [
      "Told 12 people their team.",
    ]);
    assert.deepEqual(
      words.tellReportWords({ sent: 1, held: 1, suppressed: 1, failed: ["Kai"], noAddress: ["Lena", "Maya"] }),
      [
        "Told 1 person their team.",
        "1 person wasn’t emailed: this copy of the site doesn’t send to their address.",
        "1 person is on the do-not-email list, so wasn’t emailed.",
        "The email to Kai didn’t go. Press Tell everyone their team again to try it again.",
        "Lena and Maya have no email address on file, so aren’t emailed.",
      ],
    );
  });

  test("no sentence carries a dash of any kind", () => {
    const said = [
      words.NO_PROGRAMME,
      words.LEADS_AND_ADMINS,
      words.NOT_AN_INCUBATOR,
      words.NO_RUN,
      words.RUN_GONE,
      words.NO_WAY_SET,
      words.NO_SIZES,
      words.FROM_THE_AGENDA_HERE,
      words.FROM_PITCHES_HERE,
      words.NO_SUCH_PITCH,
      words.NO_SUCH_TEAM,
      words.NOT_TAKING_PART,
      words.OTHER_GROUP,
      words.NO_AGENDA,
      words.TEAMS_EXIST,
      words.tooFewForATeam("Chess", 1, 2),
      words.madeFromAgendaWords(4, 2),
    ];
    for (const sentence of said) assert.ok(!/[–—]/.test(sentence), sentence);
  });
});

describe("the run's setting", () => {
  test("only the two ways are kept, and anything else is unset", () => {
    assert.equal(model.normalizeTeamsFrom("pitches"), "pitches");
    assert.equal(model.normalizeTeamsFrom("agenda"), "agenda");
    for (const value of [undefined, null, "", "Pitches", "both", 1, true, {}]) {
      assert.equal(model.normalizeTeamsFrom(value), null, String(value));
    }
    assert.equal(courses.normalizeCourseRun(INC.run, {}).teamsFrom, null);
    assert.equal(courses.normalizeCourseRun(INC.run, { teamsFrom: "agenda" }).teamsFrom, "agenda");
  });

  test("the run editor writes the way it is set beside pitching week's settings, and only one the reader keeps", async () => {
    made.reset();
    const settings = { pickLimit: 3, teamSize: { min: 2, max: 4 }, teamsMadeOn: "2026-11-19" };
    await mutations.updateRun(INC.run, { pitchSettings: settings, teamsFrom: "agenda" });
    await mutations.updateRun(INC.run, { teamsFrom: null });
    await mutations.updateRun(INC.run, { teamsFrom: "spreadsheet" });
    assert.deepEqual(
      made.world.clientWrites.map(([kind, path, data]) => [kind, path, data.teamsFrom]),
      [
        ["update", `courseRuns/${INC.run}`, "agenda"],
        ["update", `courseRuns/${INC.run}`, null],
        ["update", `courseRuns/${INC.run}`, null],
      ],
    );
    // Pitching week's own settings are written as they always were, beside it.
    assert.deepEqual(made.world.clientWrites[0][2].pitchSettings, {
      pickLimit: 3,
      teamSizeMin: 2,
      teamSizeMax: 4,
      teamsMadeOn: "2026-11-19",
    });
  });

  test("a stored team is read: a member's record of what they were told, and nobody else's", () => {
    const team = model.normalizeTeam("t1", {
      runId: "r",
      groupId: "g",
      name: "  Probe transfer ",
      project: "Replicate it",
      source: { kind: "pitch", pitchId: "p1" },
      memberUids: ["a", "b", "a", 7],
      toldAs: [
        { uid: "a", fingerprint: "f1" },
        { uid: "a", fingerprint: "f2" },
        { uid: "gone", fingerprint: "f3" },
        { uid: "b" },
      ],
    });
    assert.equal(team.name, "Probe transfer");
    assert.deepEqual(team.memberUids, ["a", "b"]);
    assert.deepEqual(team.toldAs, [{ uid: "a", fingerprint: "f1" }]);
    assert.deepEqual(model.normalizeTeam("t2", { source: { kind: "agenda", item: "" } }).source, { kind: "hand" });
  });

  test("a request is checked before anything is read, with a sentence for each refusal", () => {
    assert.deepEqual(model.parseTeamsAction({ action: "move", uid: "amara", teamId: null }), {
      ok: true,
      value: { action: "move", uid: "amara", teamId: null },
    });
    for (const [body, error] of [
      [null, "Say what to do with the teams."],
      [{}, "Say what to do with the teams."],
      [{ action: "from-pitch" }, "Say which pitch to make a team."],
      [{ action: "move", uid: "a/b", teamId: null }, "Say who to move."],
      [{ action: "move", uid: "amara", teamId: "x/y" }, "Say which team to move them to, or no team."],
      [{ action: "remove" }, "Say which team to remove."],
    ]) {
      assert.deepEqual(model.parseTeamsAction(body), { ok: false, error }, JSON.stringify(body));
    }
    assert.deepEqual(model.parseTellRequest({ emails: 12 }), { ok: true, value: { emails: 12 } });
    for (const body of [{}, { emails: 0 }, { emails: 2.5 }, { emails: "12" }, null]) {
      assert.equal(model.parseTellRequest(body).ok, false, JSON.stringify(body));
    }
  });
});
