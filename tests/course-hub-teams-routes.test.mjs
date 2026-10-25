/**
 * An incubator's teams, made and changed through the real route, as every
 * kind of caller (boards in-teams, option C, and in-agenda).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. Who may: the programme's lead and admins; a reviewer is refused; the
 *     run's track lead, a group's facilitator, the lead of another programme,
 *     a member taking part, a member who left and somebody signed out are not.
 *     A refusal writes nothing.
 *  2. From the pitches: a pitch becomes a team of its pitchers and the people
 *     who would join it, within the smallest and largest team, and the
 *     pitches say "Became a team" and "Not taken forward".
 *  3. Moves and removing a team.
 *  4. From the agenda: teams from first choices, within the same sizes, and
 *     each person's ranks on their row.
 *  5. The rankings reach nobody but the programme's lead and admins.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA,
  AGI,
  AT,
  CALLERS,
  INC,
  INCUBATOR,
  PITCH,
  ROUND,
  THURSDAY,
  makeTeamsWorld,
  short,
  teamsSeed,
} from "./lib/teamsWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makeTeamsWorld("__teamsRoutes");
const { world, reset, ask, teams, teamNamed, everything } = made;

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

const NO_PROGRAMME = "That programme is not on this form.";
const LEADS_AND_ADMINS = "Only the programme’s lead and admins can make its teams.";

/** A team's people, by uid, as stored. */
const people = (name) => teamNamed(name)?.memberUids ?? null;

/** The tab as the programme's lead reads it. */
async function viewOf(who = "tess") {
  const outcome = await ask.view(who);
  assert.equal(outcome.status, "ok", `${who}: ${outcome.status}`);
  return outcome.view;
}

describe("1. who may make and change teams", () => {
  test("the programme's lead and an admin; a reviewer is refused; nobody else is shown the programme", async () => {
    const expected = new Map([
      ["zach", [200, null]],
      ["tess", [200, null]],
      ["claudia", [404, NO_PROGRAMME]],
      ["yusuf", [403, LEADS_AND_ADMINS]],
      ["tomas", [404, NO_PROGRAMME]],
      ["sofia", [404, NO_PROGRAMME]],
      ["amara", [404, NO_PROGRAMME]],
      ["wen", [404, NO_PROGRAMME]],
      [null, [401, "Not signed in"]],
    ]);
    for (const [who, words] of CALLERS) {
      reset();
      const before = everything();
      const answer = await ask.fromPitch(who, PITCH.probe);
      assert.deepEqual(short(answer), expected.get(who), words);
      if (answer.status === 200) {
        assert.deepEqual(people("Probe transfer"), ["amara", "dev", "bea", "lena"], words);
      } else {
        assert.equal(everything(), before, `${words}: a refusal wrote something`);
      }
    }
  });

  test("every action is refused the same way to everybody who may not make teams", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const probe = teamNamed("Probe transfer");
    const before = everything();
    for (const body of [
      { action: "from-pitch", pitchId: PITCH.reward },
      { action: "from-agenda" },
      { action: "move", uid: "kai", teamId: probe.id },
      { action: "remove", teamId: probe.id },
    ]) {
      for (const [who, words] of CALLERS) {
        if (who === "zach" || who === "tess") continue;
        const answer = await ask.act(who, body);
        assert.ok([401, 403, 404].includes(answer.status), `${words}, ${body.action}: ${answer.status}`);
      }
    }
    assert.equal(everything(), before, "a refusal wrote something");
  });

  test("an admin viewing as somebody else is turned away first", async () => {
    const before = everything();
    assert.deepEqual(short(await ask.fromPitch("zach", PITCH.probe, { viewAs: true })), [403, "view-as"]);
    assert.equal(everything(), before);
  });

  test("a lead who no longer meets the lead's bar is nobody here, and a lead put in their place is", async () => {
    world.db.poke("users/tess", { role: "member", suRecognised: false });
    assert.deepEqual(short(await ask.fromPitch("tess", PITCH.probe)), [404, NO_PROGRAMME]);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.leadUid`]: "claudia" });
    assert.equal((await ask.fromPitch("claudia", PITCH.probe)).status, 200);
  });

  test("a fellowship has no teams, and its own lead is told so", async () => {
    assert.deepEqual(short(await ask.fromPitch("claudia", PITCH.probe, { programmeId: AGI })), [
      409,
      "Teams are an incubator’s. This programme is a fellowship, so its people are in groups.",
    ]);
  });

  test("a body is checked before anything is read, and an id that addresses nothing is a missing programme", async () => {
    for (const body of [{}, { action: "nonsense" }, "[]"]) {
      assert.deepEqual(short(await ask.act("amara", body)), [400, "Say what to do with the teams."]);
    }
    const answer = await made.call("zach", made.routes.teams.POST, { roundId: "e2e-missing-round", programmeId: "e2e-missing-programme" }, { body: { action: "from-agenda" } });
    assert.deepEqual(short(answer), [404, NO_PROGRAMME]);
  });

  test("a group that no longer meets takes no part: its people are nobody's to put in a team", async () => {
    world.db.poke(`courseGroups/${INC.wednesday}`, { archived: true });
    const view = await viewOf();
    assert.equal(view.takingPart, 8);
    assert.ok(!view.noTeam.some((person) => person.uid === "omar"));
    assert.deepEqual(short(await ask.move("tess", "omar", null)), [404, "That person isn’t taking part in this programme."]);
  });

  test("a programme that names no run, or a run being destroyed, has nobody to put in a team", async () => {
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    assert.deepEqual(short(await ask.fromPitch("tess", PITCH.probe)), [409, "The course run this programme names is no longer on the site."]);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.runId`]: null });
    assert.deepEqual(short(await ask.fromPitch("tess", PITCH.probe)), [
      409,
      "This programme doesn’t name a course run yet, so there is nobody to put in a team.",
    ]);
  });
});

describe("2. teams from the pitches", () => {
  test("a pitch becomes a team: its pitchers, then who would join it, fewest picks first, up to the largest team", async () => {
    const answer = await ask.fromPitch("tess", PITCH.probe);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.said, "Probe transfer is a team of 4 people.");
    const team = teamNamed("Probe transfer");
    // Bea and Lena picked one pitch each, Kai two; Ines (never told) and Wen
    // (who left) said they would join and are nobody's.
    assert.deepEqual(team.memberUids, ["amara", "dev", "bea", "lena"]);
    assert.equal(team.runId, INC.run);
    assert.equal(team.courseId, INC.course);
    assert.equal(team.groupId, INC.thursday);
    assert.equal(team.project, "Replicate Probes that transfer, then: test whether the probes still work on a smaller open model");
    assert.deepEqual(team.source, { kind: "pitch", pitchId: PITCH.probe });
    assert.deepEqual(team.toldAs, []);
    assert.deepEqual(team.createdAt, AT.wednesdayNoon);
  });

  test("a pitch's pitcher goes to its team, out of the team they were in", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const answer = await ask.fromPitch("tess", PITCH.reward);
    assert.equal(answer.status, 200);
    assert.deepEqual(people("Reward hacking evals"), ["bea", "maya", "noor", "tariq"]);
    assert.deepEqual(people("Probe transfer"), ["amara", "dev", "lena"]);
    assert.equal(teamNamed("Reward hacking evals").project, "Replicate Reward hacking in the wild, then: rebuild the evaluation with tasks written by the team");
  });

  test("the pitches say which became a team and which were not taken forward, with how many would join", async () => {
    const before = (await viewOf()).pitches;
    assert.deepEqual(
      before.rows.map((row) => [row.title, row.wouldJoinLine, row.pitchedBy, row.state]),
      [
        ["Reward hacking evals", "5 would join", "Pitched by Bea", "no-team-yet"],
        // Bea, Kai and Lena: Ines and Wen do not count.
        ["Probe transfer", "3 would join", "Pitched by Amara and Dev", "no-team-yet"],
        ["Interpretability of chess models", "0 would join", "Pitched by Tariq", "no-team-yet"],
        ["Red-teaming a small chatbot", "0 would join", "Pitched by Omar", "no-team-yet"],
      ],
    );
    assert.equal(before.weekNumber, 3);
    await ask.fromPitch("tess", PITCH.probe);
    await ask.fromPitch("tess", PITCH.reward);
    const after = await viewOf();
    assert.deepEqual(
      after.pitches.rows.map((row) => [row.title, row.state, row.groupName]),
      [
        ["Reward hacking evals", "became-a-team", "Thursday evening"],
        ["Probe transfer", "became-a-team", "Thursday evening"],
        ["Interpretability of chess models", "not-taken-forward", "Thursday evening"],
        ["Red-teaming a small chatbot", "not-taken-forward", "Wednesday evening"],
      ],
    );
    assert.equal(after.teams.length, 2);
    assert.deepEqual(after.teams.map((team) => team.name), ["Probe transfer", "Reward hacking evals"]);
    assert.equal(after.inATeam, 7);
    assert.equal(after.takingPart, 9);
    assert.deepEqual(after.noTeam.map((person) => person.name), ["Kai", "Omar"]);
  });

  test("below the smallest team it is refused, and nothing moves", async () => {
    await ask.fromPitch("tess", PITCH.reward);
    const before = everything();
    assert.deepEqual(short(await ask.fromPitch("tess", PITCH.chess)), [
      409,
      "Interpretability of chess models would be a team of 1 person, and the smallest team is 2 people. Move people into the other teams with Move to… instead.",
    ]);
    assert.equal(everything(), before);
  });

  test("at the sizes' edges: a team of exactly the largest size, and one left under the smallest by a pitcher's move is said", async () => {
    reset(teamsSeed({ sizes: { min: 3, max: 3 } }));
    await ask.fromPitch("tess", PITCH.probe);
    assert.deepEqual(people("Probe transfer"), ["amara", "dev", "bea"]);
    await ask.fromPitch("tess", PITCH.reward);
    assert.deepEqual(people("Reward hacking evals"), ["bea", "maya", "noor"]);
    const view = await viewOf();
    const probe = view.teams.find((team) => team.name === "Probe transfer");
    assert.equal(probe.people.length, 2);
    assert.equal(probe.sizeNote, "Smaller than the smallest team, 3 people.");
    assert.equal(view.teams.find((team) => team.name === "Reward hacking evals").sizeNote, null);
  });

  test("somebody in another group who said they would join counts for nothing and is never put in", async () => {
    world.db.poke(`coursePitches/${PITCH.chess}`, { wouldJoinUids: ["omar", "kai"] });
    const chess = (await viewOf()).pitches.rows.find((row) => row.title === "Interpretability of chess models");
    assert.equal(chess.wouldJoin, 1);
    assert.equal((await ask.fromPitch("tess", PITCH.chess)).status, 200);
    assert.deepEqual(people("Interpretability of chess models"), ["tariq", "kai"]);
  });

  test("a pitch is a team once", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const before = everything();
    assert.deepEqual(short(await ask.fromPitch("zach", PITCH.probe)), [409, "Probe transfer is a team already."]);
    assert.equal(everything(), before);
  });

  test("a pitch that is not this programme's pitching week's is not here", async () => {
    world.db.seed("coursePitches/elsewhere", {
      runId: "another-run",
      groupId: "another-group",
      weekId: "w03",
      weekNumber: 3,
      title: "Somewhere else",
      twist: "Not this run's",
      pitcherUids: ["amara"],
      wouldJoinUids: ["dev"],
    });
    for (const pitchId of ["elsewhere", "no-such-pitch"]) {
      assert.deepEqual(short(await ask.fromPitch("tess", pitchId)), [404, "That pitch isn’t one of this programme’s pitching week."]);
    }
  });

  test("with no sizes, or the run's teams made another way, or no way set, nothing is made", async () => {
    for (const [seed, error] of [
      [teamsSeed({ sizes: null }), "Set the smallest and largest team in the run editor’s Pitching week section first, so teams are made within them."],
      [teamsSeed({ madeFrom: "agenda" }), "This programme’s teams are made from the agenda, not from pitches."],
      [teamsSeed({ madeFrom: null }), "Nobody has said how this programme’s teams are made yet. Set it in the run editor’s Pitching week section."],
    ]) {
      reset(seed);
      const before = everything();
      assert.deepEqual(short(await ask.fromPitch("tess", PITCH.probe)), [409, error]);
      assert.equal(everything(), before);
    }
  });
});

describe("3. moving people, and removing a team", () => {
  test("Move to… another team of the group, then to no team", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    await ask.fromPitch("tess", PITCH.reward);
    const probe = teamNamed("Probe transfer");
    const reward = teamNamed("Reward hacking evals");

    let answer = await ask.move("tess", "kai", probe.id);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.said, "Kai is in Probe transfer now.");
    assert.deepEqual(people("Probe transfer"), ["amara", "dev", "lena", "kai"]);

    answer = await ask.move("zach", "kai", reward.id);
    assert.equal(answer.body.said, "Kai is in Reward hacking evals now.");
    assert.deepEqual(people("Probe transfer"), ["amara", "dev", "lena"]);
    assert.deepEqual(people("Reward hacking evals"), ["bea", "maya", "noor", "tariq", "kai"]);
    // Past the largest team is allowed, and said on the team.
    const view = answer.body.view;
    assert.equal(view.teams.find((team) => team.name === "Reward hacking evals").sizeNote, "Larger than the largest team, 4 people.");

    answer = await ask.move("tess", "kai", null);
    assert.equal(answer.body.said, "Kai is in no team now.");
    assert.ok(teams().every((team) => !team.memberUids.includes("kai")));
  });

  test("a move to another group's team, of somebody not taking part, or to a team that is not here, is refused and writes nothing", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const probe = teamNamed("Probe transfer");
    const before = everything();
    assert.deepEqual(short(await ask.move("tess", "omar", probe.id)), [
      409,
      "That team meets in another group. A person moves only between their own group’s teams.",
    ]);
    for (const uid of ["ines", "wen", "refused", "sofia", "nobody-at-all"]) {
      assert.deepEqual(short(await ask.move("tess", uid, probe.id)), [404, "That person isn’t taking part in this programme."], uid);
    }
    assert.deepEqual(short(await ask.move("tess", "kai", "no-such-team")), [404, "That team isn’t one of this programme’s teams."]);
    assert.equal(everything(), before);
  });

  test("moving somebody takes their record of what they were told off the team they leave", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const probe = teamNamed("Probe transfer");
    world.db.poke(`courseTeams/${probe.id}`, { toldAs: [{ uid: "lena", fingerprint: "f" }, { uid: "amara", fingerprint: "g" }] });
    await ask.move("tess", "lena", null);
    assert.deepEqual(teamNamed("Probe transfer").toldAs, [{ uid: "amara", fingerprint: "g" }]);
  });

  test("stored data that names somebody in two teams shows them in the team made first, and counts them once", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    await ask.fromPitch("tess", PITCH.reward);
    const reward = teamNamed("Reward hacking evals");
    world.db.poke(`courseTeams/${reward.id}`, { memberUids: [...reward.memberUids, "lena"] });
    const view = await viewOf();
    const where = view.teams.filter((team) => team.people.some((person) => person.uid === "lena")).map((team) => team.name);
    assert.deepEqual(where, ["Probe transfer"]);
    assert.equal(view.inATeam, 7);
  });

  test("removing a team puts its people in no team, and its pitch can be made a team again", async () => {
    await ask.fromPitch("tess", PITCH.probe);
    const probe = teamNamed("Probe transfer");
    const answer = await ask.remove("tess", probe.id);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.said, "Probe transfer is removed. Its people are in no team now.");
    assert.equal(teams().length, 0);
    assert.equal(answer.body.view.pitches.rows.find((row) => row.title === "Probe transfer").state, "no-team-yet");
    assert.equal((await ask.fromPitch("tess", PITCH.probe)).status, 200);
    assert.deepEqual(short(await ask.remove("tess", "no-such-team")), [404, "That team isn’t one of this programme’s teams."]);
  });
});

describe("4. teams from the agenda", () => {
  beforeEach(() => reset(teamsSeed({ madeFrom: "agenda", sizes: { min: 2, max: 3 } })));

  test("What people ranked counts everybody taking part, before any team", async () => {
    const view = await viewOf();
    assert.equal(view.madeFrom, "agenda");
    assert.equal(view.takingPart, 9);
    assert.equal(view.agenda.found, true);
    assert.deepEqual(
      view.agenda.rows.map((row) => [row.item, row.ranked, row.teams.length]),
      [
        ["Compute governance", [4, 3, 1], 0],
        ["International coordination", [2, 3, 1], 0],
        ["Frontier lab safety policies", [1, 2, 2], 0],
        ["Open-weight models", [1, 1, 3], 0],
        ["AI in elections", [1, 0, 2], 0],
      ],
    );
    assert.equal(view.pitches, null);
    const amara = view.noTeam.find((person) => person.uid === "amara");
    assert.deepEqual(amara.ranks, [
      { place: "1st", item: "Compute governance", above: false },
      { place: "2nd", item: "Open-weight models", above: false },
      { place: "3rd", item: "AI in elections", above: false },
    ]);
  });

  test("teams from first choices, within the sizes, each group on its own", async () => {
    const answer = await ask.fromAgenda("tess");
    assert.equal(answer.status, 200);
    assert.equal(answer.body.said, "Made 3 teams from first choices. 1 person is in no team yet. Use Move to… to put them in one.");
    assert.deepEqual(people("Compute governance"), ["amara", "bea", "dev"]);
    assert.deepEqual(people("International coordination"), ["kai", "noor", "tariq"]);
    assert.deepEqual(people("Frontier lab safety policies"), ["lena", "maya"]);
    for (const team of teams()) {
      assert.equal(team.groupId, INC.thursday);
      assert.equal(team.project, "");
      assert.deepEqual(team.source, { kind: "agenda", item: team.name });
    }
    const view = answer.body.view;
    // In the agenda's order, as in-agenda lists them.
    assert.deepEqual(view.teams.map((team) => team.name), ["Compute governance", "International coordination", "Frontier lab safety policies"]);
    assert.deepEqual(view.noTeam.map((person) => person.name), ["Omar"]);
    assert.equal(view.inATeam, 8);
    // Each person shows what they ranked, down to the item their team is on;
    // the choices above it are the ones they did not get.
    const person = (uid) => view.teams.flatMap((team) => team.people).find((one) => one.uid === uid);
    assert.deepEqual(person("amara").ranks, [{ place: "1st", item: "Compute governance", above: false }]);
    assert.deepEqual(person("noor").ranks, [
      { place: "1st", item: "Compute governance", above: true },
      { place: "2nd", item: "International coordination", above: false },
    ]);
    assert.deepEqual(person("maya").ranks, [
      { place: "1st", item: "Open-weight models", above: true },
      { place: "2nd", item: "Compute governance", above: true },
      { place: "3rd", item: "Frontier lab safety policies", above: false },
    ]);
    assert.deepEqual(
      view.agenda.rows.map((row) => [row.item, row.teams.map((team) => team.people.map((one) => one.name))]),
      [
        ["Compute governance", [["Amara", "Bea", "Dev"]]],
        ["International coordination", [["Kai", "Noor", "Tariq"]]],
        ["Frontier lab safety policies", [["Lena", "Maya"]]],
        ["Open-weight models", []],
        ["AI in elections", []],
      ],
    );
  });

  test("teams are made from first choices once; a second press is refused and writes nothing", async () => {
    await ask.fromAgenda("tess");
    const before = everything();
    assert.deepEqual(short(await ask.fromAgenda("zach")), [
      409,
      "This programme has teams already. Move people with Move to…, or remove every team to make them again from first choices.",
    ]);
    assert.equal(everything(), before);
  });

  test("somebody moved off their choices shows every choice as one above their team; somebody who ranked nothing says so", async () => {
    await ask.fromAgenda("tess");
    world.db.poke(`admissionApplications/${ROUND}__omar`, { sent: null });
    const compute = teamNamed("Compute governance");
    const answer = await ask.move("tess", "kai", compute.id);
    const kai = answer.body.view.teams.flatMap((team) => team.people).find((one) => one.uid === "kai");
    assert.deepEqual(kai.ranks, [
      { place: "1st", item: "International coordination", above: true },
      { place: "2nd", item: "Frontier lab safety policies", above: true },
      { place: "3rd", item: "Open-weight models", above: true },
    ]);
    const omar = answer.body.view.noTeam.find((one) => one.uid === "omar");
    assert.equal(omar.rankedNothing, true);
    assert.deepEqual(omar.ranks, []);
  });

  test("with no ranking on the programme's own questions there is no agenda, and nothing is made", async () => {
    world.db.poke(`admissionRounds/${ROUND}/questionSets/incubator`, {
      questions: [{ id: "why", text: "Why?", help: "", type: "long", options: [], optionsFromRanking: false, wordLimit: null, required: true, scored: false }],
    });
    assert.equal((await viewOf()).agenda.found, false);
    const before = everything();
    assert.deepEqual(short(await ask.fromAgenda("tess")), [
      409,
      "The application form asks this programme’s applicants to rank nothing, so there is no agenda to make teams from.",
    ]);
    assert.equal(everything(), before);
  });

  test("an answer that is no longer one of the agenda's items is not a choice, and is shown nowhere", async () => {
    world.db.poke(`admissionApplications/${ROUND}__kai`, { "sent.answers.incubator.agenda": ["A project since renamed", "Open-weight models"] });
    const view = await viewOf();
    assert.deepEqual(view.noTeam.find((person) => person.uid === "kai").ranks, [{ place: "1st", item: "Open-weight models", above: false }]);
    assert.ok(!JSON.stringify(view).includes("A project since renamed"));
    assert.deepEqual(view.agenda.rows.find((row) => row.item === "Open-weight models").ranked, [2, 1, 2]);
  });

  test("a ranking asked of another programme's applicants, earlier on the form, is not this programme's agenda", async () => {
    world.db.poke(`admissionRounds/${ROUND}/questionSets/${AGI}`, {
      questions: [
        { id: "topics", text: "Rank these topics.", help: "", type: "rank", options: ["Forecasting", "Compute"], optionsFromRanking: false, wordLimit: null, required: true, scored: false },
      ],
    });
    assert.deepEqual((await viewOf()).agenda.rows.map((row) => row.item), AGENDA);
  });

  test("a run whose teams come from the pitches does not make them from the agenda", async () => {
    reset(teamsSeed({ madeFrom: "pitches" }));
    assert.deepEqual(short(await ask.fromAgenda("tess")), [409, "This programme’s teams are made from the pitches, not from the agenda."]);
  });
});

describe("5. the rankings reach the programme's lead and admins, and nobody else", () => {
  beforeEach(() => reset(teamsSeed({ madeFrom: "agenda", sizes: { min: 2, max: 3 } })));

  /** Every collection the loader asks for while `who` reads the tab. */
  async function readsAs(who) {
    const reads = [];
    const collection = world.courseDb.collection;
    world.courseDb.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      return { outcome: await ask.view(who), reads };
    } finally {
      world.courseDb.collection = collection;
    }
  }

  test("the lead and an admin are shown each person's ranks; nobody else reads an application", async () => {
    for (const who of ["tess", "zach"]) {
      const { outcome, reads } = await readsAs(who);
      assert.equal(outcome.status, "ok", who);
      assert.ok(reads.includes("admissionApplications"), `${who} was not shown the rankings`);
      assert.ok(outcome.view.noTeam.some((person) => person.ranks?.length > 0), who);
    }
    for (const [who, words] of CALLERS) {
      // Somebody signed out never reaches the loader: the page's gate sends
      // them away first, which the page suite holds.
      if (who === "tess" || who === "zach" || who === null) continue;
      const { outcome, reads } = await readsAs(who);
      assert.ok(!reads.includes("admissionApplications"), `${words} reached the applications`);
      assert.ok(!JSON.stringify(outcome).includes("Compute governance"), `${words} was shown a ranking`);
      assert.equal(outcome.status, who === "yusuf" ? "not-yours" : "none", words);
    }
  });

  test("an application the lead may not read gives no ranks to the lead, even with the answer stored; an admin reads it", async () => {
    // Omar's application ranked only AGI Strategy, which Tess has no role on,
    // though an older answer to the incubator's agenda is still stored on it.
    world.db.poke(`admissionApplications/${ROUND}__omar`, { "sent.rankedProgrammeIds": [AGI] });
    const omar = async (who) => (await viewOf(who)).noTeam.find((person) => person.uid === "omar");
    assert.equal((await omar("tess")).rankedNothing, true);
    assert.deepEqual((await omar("tess")).ranks, []);
    assert.deepEqual((await omar("zach")).ranks.map((rank) => rank.item), ["AI in elections", "Compute governance", "Open-weight models"]);
  });

  test("a press's answer carries ranks only for the lead and admins who made it, and never an address", async () => {
    const answer = await ask.fromAgenda("tess");
    const wire = JSON.stringify(answer.body);
    assert.ok(wire.includes("1st"));
    assert.ok(!/@/.test(wire), "an address reached the page");
    assert.ok(!wire.includes("A sentence nobody else wrote."), "an answer that is not the ranking reached the page");
    for (const uid of THURSDAY) assert.ok(!wire.includes(`${uid}@`), uid);
  });
});
