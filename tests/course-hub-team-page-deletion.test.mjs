/**
 * What a team writes on its page, `courseTeamEntries`, goes with the run it
 * belongs to, and a deleted account's name comes off it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Both cascades are executed for real against the in-memory store: the
 * account's sweep (`clearCourseTeamEntries` in
 * `src/lib/firestore/accountDeletion.ts`, and its place in the cascade), and
 * the run's whole destroy (`destroyRunCascade` in
 * `src/lib/firestore/courseDeletion.ts`), whose manifest counts the entries
 * and whose drain deletes them.
 *
 * THE DECISION, for what a team's shared words do when one person's account
 * goes: everything on a team's page is the team's (anybody in it may change
 * a check-in, remove a link or change the hand-in), so the words stay for
 * the rest of the team, as a group's register keeps its marks, and the
 * person's uid comes off every entry they saved last. Leaving keeps the
 * words with the team too (`tests/course-hub-team-page-routes.test.mjs`).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INC, WHEN, makeTeamPageWorld } from "./lib/teamPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: WHEN.madeAndTold });

const w = await makeTeamPageWorld("__teamPageDeletion");
const { world, ask, probe, entries, loadTs, view } = w;
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));

const at = (when) => mock.timers.setTime(when.getTime());

/** Probe transfer's check-in by Dev, a link by Dev and one by Amara, its hand-in by Dev; Reward hacking evals' check-in by Bea. */
async function pagesWritten() {
  at(WHEN.weekFive);
  assert.equal((await ask.checkIn("dev", { weekNumber: 5, did: "Probes train.", inTheWay: "" })).status, 200);
  assert.equal((await ask.checkIn("bea", { weekNumber: 5, did: "Evals written.", inTheWay: "" })).status, 200);
  assert.equal((await ask.addLink("dev", { label: "Repo", url: "https://example.com/repo" })).status, 200);
  assert.equal((await ask.addLink("amara", { label: "Write-up", url: "https://example.com/doc" })).status, 200);
  at(WHEN.dueDay);
  assert.equal(
    (await ask.handIn("dev", { url: "https://example.com/doc", summary: "Probes transfer.", whoDidWhat: "", shared: true })).status,
    200,
  );
}

beforeEach(async () => {
  at(WHEN.madeAndTold);
  await w.reset();
  await pagesWritten();
});

describe("an account that is deleted", () => {
  test("its uid comes off every entry it saved last, and the words stay with the team", async () => {
    const before = entries();
    const cleared = await accountDeletion.clearCourseTeamEntries(world.courseDb, "dev");
    assert.equal(cleared, 3);
    const after = entries();
    assert.equal(after.length, before.length, "an entry went with the account");
    for (const entry of after) {
      const was = before.find((each) => each.id === entry.id);
      assert.equal(entry.byUid, was.byUid === "dev" ? null : was.byUid, entry.id);
      for (const field of ["did", "inTheWay", "label", "url", "summary", "whoDidWhat", "teamId", "runId"]) {
        assert.deepEqual(entry[field], was[field], `${entry.id}.${field}`);
      }
    }
    assert.ok(!JSON.stringify(after).includes('"dev"'), "the deleted account is still named on a team's page");
  });

  test("the team still reads its page, with nobody named on what the deleted account saved", async () => {
    await accountDeletion.clearCourseTeamEntries(world.courseDb, "dev");
    await accountDeletion.clearCourseTeams(world.courseDb, "dev");
    at(WHEN.dueDay);
    const { html } = await view.team("amara");
    assert.ok(html.includes("Handed in on Thu 18 Feb."), "the hand-in's line still names somebody");
    assert.ok(html.includes("example.com/repo"), "a link the deleted account added went from the team's page");
  });

  test("somebody who saved nothing changes nothing", async () => {
    const before = JSON.stringify(entries());
    assert.equal(await accountDeletion.clearCourseTeamEntries(world.courseDb, "kai"), 0);
    assert.equal(JSON.stringify(entries()), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseTeamEntriesCleared: number;/m);
    assert.match(source, /^\s*courseTeamEntriesCleared: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseTeamEntriesCleared = await clearCourseTeamEntries\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    // One equality on who saved it last, and nothing deleted.
    const sweep = source.slice(source.indexOf("export async function clearCourseTeamEntries"));
    const body = sweep.slice(0, sweep.indexOf("\n}\n"));
    assert.match(body, /\.where\("byUid", "==", uid\)/);
    assert.match(body, /batch\.update\(doc\.ref, \{ byUid: null \}\)/);
    assert.ok(!/\.delete\(/.test(body), "the sweep deletes what the team wrote");
  });
});

/** The store, with `count()` on every query, answered by counting what the query returns. */
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
  test("its manifest counts the team pages' entries, and the destroy deletes every one, and no other run's", async () => {
    world.db.seed("courseTeamEntries/elsewhere__handin", {
      runId: "another-run",
      courseId: "another-course",
      groupId: "another-group",
      teamId: "elsewhere",
      kind: "hand-in",
      url: "https://example.com/elsewhere",
      summary: "Somewhere else.",
      whoDidWhat: "",
      byUid: "nina",
    });
    world.db.poke(`courseRuns/${INC.run}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(INC.run, world.db.read(`courseRuns/${INC.run}`)));
    assert.equal(counts.teamEntries, 5);

    const result = await courseDeletion.destroyRunCascade(db, null, INC.run, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.teamEntries, 5);
    assert.deepEqual(entries().map((entry) => entry.id), ["elsewhere__handin"]);
  });

  test("the entries drain with the teams they were written by, before the enrolments, and the dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.includes("teamEntries"), "the cascade has no stage for team pages");
    assert.ok(order.indexOf("teams") < order.indexOf("teamEntries") && order.indexOf("teamEntries") < order.indexOf("enrolments"));
    assert.match(table, /drainQuery\(db, TEAM_ENTRIES_COLLECTION, byRunId\(TEAM_ENTRIES_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /teamEntries: \{\s*label: "Team pages",\s*fate: "destroyed",/);
  });

  test("a run being destroyed takes no more writing on its team pages", async () => {
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    at(WHEN.weekFive);
    assert.equal((await ask.checkIn("amara", { weekNumber: 5, did: "x", inTheWay: "" })).status, 403);
    assert.equal((await ask.addLink("amara", { label: "x", url: "https://example.com/x" })).status, 403);
    // The learning space's own gate shuts a run being destroyed to everybody.
    assert.equal((await view.team("amara")).to, "/learn");
    assert.ok(probe(), "the team itself is the destroy's, not this suite's");
  });
});
