/**
 * Who finished, `courseFinishing`, goes with the two things it belongs to: a
 * run that is destroyed, and an account that is deleted.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Both cascades are executed for real against the in-memory store: the run's
 * whole destroy (`destroyRunCascade` in `src/lib/firestore/courseDeletion.ts`),
 * whose manifest counts the run's rule and decisions and whose drain deletes
 * them; and the account's sweep (`clearCourseFinishing` in
 * `src/lib/firestore/accountDeletion.ts`, and its place in
 * `deleteAccountCascade`). The store has no aggregate queries, so `count()`
 * is answered here by counting what a query returns.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { END, RULE, RUN, decision, decisionPath, makeFinishWorld, rulePath } from "./lib/finishWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__finishDeletion");
const { world, reset, loadTs, ask } = made;
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));

const finishing = () => world.db.paths().filter((path) => path.startsWith("courseFinishing/")).sort();

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(rulePath, RULE(4));
  world.db.seed(decisionPath("kofi"), decision("kofi", true, "claudia"));
  world.db.seed(decisionPath("dev"), decision("dev", false, "zach"));
  world.db.seed(decisionPath("bea"), decision("bea", true, "claudia"));
  // Another run's, which no cascade here may touch.
  world.db.seed("courseFinishing/another-run", { kind: "rule", runId: "another-run", atLeast: 2, setAt: END });
  world.db.seed("courseFinishing/another-run__kofi", { kind: "person", runId: "another-run", uid: "kofi", finished: true, byUid: "tess", at: END });
});

describe("an account that is deleted", () => {
  test("the lead's decisions about them go, on every run, and nothing else", async () => {
    assert.equal(await accountDeletion.clearCourseFinishing(world.courseDb, "kofi"), 2);
    assert.deepEqual(finishing(), [
      "courseFinishing/another-run",
      rulePath,
      decisionPath("bea"),
      decisionPath("dev"),
    ].sort());
  });

  test("decisions they made about other people stay, with who made them cleared", async () => {
    assert.equal(await accountDeletion.clearCourseFinishing(world.courseDb, "claudia"), 2);
    assert.deepEqual(
      [world.db.read(decisionPath("kofi")).byUid, world.db.read(decisionPath("kofi")).finished],
      [null, true],
    );
    assert.equal(world.db.read(decisionPath("bea")).byUid, null);
    assert.equal(world.db.read(decisionPath("dev")).byUid, "zach");
    // Their record does not change: Kofi still finished, marked plainly as changed.
    const model = (await ask.decide("zach", "tariq", false)).body.model;
    const kofi = model.rows.find((row) => row.uid === "kofi");
    assert.deepEqual([kofi.finished, kofi.changed], [true, "Changed"]);
  });

  test("somebody with no record changes nothing, and the rule names nobody", async () => {
    const before = JSON.stringify(finishing().map((path) => world.db.read(path)));
    assert.equal(await accountDeletion.clearCourseFinishing(world.courseDb, "hamza"), 0);
    assert.equal(JSON.stringify(finishing().map((path) => world.db.read(path))), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseFinishingCleared: number;/m);
    assert.match(source, /^\s*courseFinishingCleared: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseFinishingCleared = await clearCourseFinishing\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
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
  test("its manifest counts its rule and decisions, and the destroy deletes every one, and no other run's", async () => {
    // A run with people on it has to be settled before it can be destroyed.
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.finishing, 4);

    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.finishing, 4);
    assert.deepEqual(finishing(), ["courseFinishing/another-run", "courseFinishing/another-run__kofi"]);
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`), undefined, "the run itself is gone");
  });

  test("who finished drains with the run's other leaves, before the enrolments, and the dialog names it", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.includes("finishing"), "the cascade has no finishing stage");
    assert.ok(order.indexOf("teams") < order.indexOf("finishing") && order.indexOf("finishing") < order.indexOf("enrolments"));
    assert.match(table, /drainQuery\(db, FINISHING_COLLECTION, byRunId\(FINISHING_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /finishing: \{\s*label: "Who finished",\s*fate: "destroyed",/);
  });

  test("a run being destroyed takes no rule and no switch", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const before = JSON.stringify(finishing().map((path) => world.db.read(path)));
    assert.equal((await ask.rule("claudia", 5)).status, 409);
    assert.equal((await ask.decide("claudia", "tariq", true)).status, 409);
    assert.equal(JSON.stringify(finishing().map((path) => world.db.read(path))), before);
  });
});
