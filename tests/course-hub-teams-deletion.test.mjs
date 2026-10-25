/**
 * An incubator's teams, `courseTeams`, go with the two things they belong to:
 * an account that is deleted, and a run that is destroyed.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Both cascades are executed for real against the in-memory store: the
 * account's sweep (`clearCourseTeams` in `src/lib/firestore/accountDeletion.ts`,
 * and its place in `deleteAccountCascade`), and the run's whole destroy
 * (`destroyRunCascade` in `src/lib/firestore/courseDeletion.ts`), whose
 * manifest counts the teams and whose drain deletes them. The store has no
 * aggregate queries, so `count()` is answered here by counting what a query
 * returns.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AT, INC, PITCH, makeTeamsWorld } from "./lib/teamsWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makeTeamsWorld("__teamsDeletion");
const { world, reset, ask, teams, teamNamed, loadTs } = made;
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));

/** Probe transfer (Amara, Dev, Lena) and Reward hacking evals (Bea, Maya, Noor, Tariq), everybody told. */
async function teamsMadeAndTold() {
  assert.equal((await ask.fromPitch("tess", PITCH.probe)).status, 200);
  assert.equal((await ask.fromPitch("tess", PITCH.reward)).status, 200);
  assert.equal((await ask.test("tess")).status, 200);
  assert.equal((await ask.tell("tess", 7)).status, 200);
}

beforeEach(async () => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
  await teamsMadeAndTold();
});

describe("an account that is deleted", () => {
  test("comes off its team's people and its record of who was told; the team stays with everybody else", async () => {
    const cleared = await accountDeletion.clearCourseTeams(world.courseDb, "dev");
    assert.equal(cleared, 1);
    const probe = teamNamed("Probe transfer");
    assert.deepEqual(probe.memberUids, ["amara", "lena"]);
    assert.deepEqual(probe.toldAs.map((told) => told.uid).sort(), ["amara", "lena"]);
    assert.deepEqual(teamNamed("Reward hacking evals").memberUids, ["bea", "maya", "noor", "tariq"]);
    // The two left in the team are owed an email again: their teammates changed.
    assert.equal((await ask.view("tess")).view.tell.owed, 2);
  });

  test("the last person in a team leaves it empty, and the team is still the lead's", async () => {
    for (const uid of ["amara", "dev", "lena"]) await accountDeletion.clearCourseTeams(world.courseDb, uid);
    const probe = teamNamed("Probe transfer");
    assert.deepEqual(probe.memberUids, []);
    assert.deepEqual(probe.toldAs, []);
  });

  test("the markers of tests of the team email they sent go, and nobody else's markers", async () => {
    world.db.seed(`courseNudges/publishtest__${INC.run}`, { kind: "allocation-test", runId: INC.run, byUid: "tess", wording: "w" });
    world.db.seed(`courseNudges/teamstest__${INC.run}__zach`, { kind: "teams-test", runId: INC.run, byUid: "zach" });
    assert.ok(world.db.read(`courseNudges/teamstest__${INC.run}__tess`));
    assert.equal(await accountDeletion.clearCourseTeams(world.courseDb, "tess"), 0);
    assert.equal(world.db.read(`courseNudges/teamstest__${INC.run}__tess`), undefined);
    assert.ok(world.db.read(`courseNudges/publishtest__${INC.run}`), "Publish's own marker is not this sweep's");
    assert.ok(world.db.read(`courseNudges/teamstest__${INC.run}__zach`), "another presser's test went too");
  });

  test("somebody in no team changes nothing", async () => {
    const before = JSON.stringify(teams());
    assert.equal(await accountDeletion.clearCourseTeams(world.courseDb, "kai"), 0);
    assert.equal(JSON.stringify(teams()), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseTeamsCleared: number;/m);
    assert.match(source, /^\s*courseTeamsCleared: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseTeamsCleared = await clearCourseTeams\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
  });
});

/**
 * The store, with `count()` on every query it hands out, answered by counting
 * what the query returns. Everything else is the store's own.
 */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("a run that is destroyed", () => {
  test("its manifest counts the teams, and the destroy deletes every one, and no other run's", async () => {
    world.db.seed("courseTeams/elsewhere", {
      runId: "another-run",
      courseId: "another-course",
      groupId: "another-group",
      name: "Somewhere else",
      project: "",
      source: { kind: "hand" },
      memberUids: ["nina"],
      toldAs: [],
    });
    // A run with people on it has to be settled before it can be destroyed.
    world.db.poke(`courseRuns/${INC.run}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(INC.run, world.db.read(`courseRuns/${INC.run}`)));
    assert.equal(counts.teams, 2);

    const result = await courseDeletion.destroyRunCascade(db, null, INC.run, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.teams, 2);
    assert.deepEqual(teams().map((team) => team.id), ["elsewhere"]);
    // The team email's markers carry the run, so they go with it.
    assert.ok(!world.db.paths().some((path) => path.startsWith("courseNudges/teams") && path.includes(INC.run)));
    assert.equal(world.db.read(`courseRuns/${INC.run}`), undefined, "the run itself is gone");
  });

  test("the teams drain with the pitches they came from, before the enrolments, and the dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.includes("teams"), "the cascade has no teams stage");
    assert.ok(order.indexOf("pitches") < order.indexOf("teams") && order.indexOf("teams") < order.indexOf("enrolments"));
    assert.match(table, /drainQuery\(db, TEAMS_COLLECTION, byRunId\(TEAMS_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /teams: \{\s*label: "Teams",\s*fate: "destroyed",/);
  });

  test("a run being destroyed has no teams to change and nobody to tell", async () => {
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    const kai = await ask.move("tess", "kai", teamNamed("Probe transfer").id);
    assert.equal(kai.status, 409);
    assert.equal((await ask.tell("tess", 1)).status, 409);
    assert.equal((await ask.view("tess")).view.blank, "run-gone");
  });
});
