/**
 * Pitching week's collection, `coursePitches`, goes with the two things it
 * belongs to: an account that is deleted, and a run that is destroyed.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Both cascades are executed for real against the in-memory store: the
 * account's sweep (`clearCoursePitches` in `src/lib/firestore/accountDeletion.ts`,
 * and its place in `deleteAccountCascade`), and the run's whole destroy
 * (`destroyRunCascade` in `src/lib/firestore/courseDeletion.ts`), whose
 * manifest counts the pitches and whose drain deletes them. The store has no
 * aggregate queries, so `count()` is answered here by counting what a query
 * returns.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AT, INC, makePitchingWorld } from "./lib/pitchingWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makePitchingWorld("__pitchingDeletion");
const { world, reset, ask, pitchBody, pitchTitled, pitches, loadTs } = made;
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

/** Amara pitches with Dev, Bea and Tariq alone; Amara would join Bea's, Dev Tariq's, Bea Amara's. */
async function pitchingDone() {
  for (const [who, title, partnerUid] of [
    ["amara", "Probe transfer", "dev"],
    ["bea", "Steering at scale", null],
    ["tariq", "Unlearning check", null],
  ]) {
    assert.equal((await ask.pitch(who, pitchBody({ title, partnerUid }))).status, 200);
  }
  for (const [who, title] of [
    ["amara", "Steering at scale"],
    ["dev", "Unlearning check"],
    ["bea", "Probe transfer"],
  ]) {
    assert.equal((await ask.pick(who, pitchTitled(title).id)).status, 200);
  }
}

describe("an account that is deleted", () => {
  test("a pitch with a partner stays the partner's; the person comes off every list of who would join", async () => {
    await pitchingDone();
    const cleared = await accountDeletion.clearCoursePitches(world.courseDb, "amara");
    // Her own pitch, and Bea's that she would join.
    assert.equal(cleared, 2);
    assert.deepEqual(pitchTitled("Probe transfer").pitcherUids, ["dev"]);
    assert.deepEqual(pitchTitled("Probe transfer").wouldJoinUids, ["bea"]);
    assert.deepEqual(pitchTitled("Steering at scale").wouldJoinUids, []);
    assert.deepEqual(pitchTitled("Unlearning check").wouldJoinUids, ["dev"]);
    // Dev now holds the pitch alone, and chooses who is on it.
    const dev = (await ask.view("dev")).body.view;
    assert.equal(dev.mine.sentByMe, true);
    assert.equal(dev.mine.partner, null);
  });

  test("a pitch only they pitched is deleted with them", async () => {
    await pitchingDone();
    assert.equal(await accountDeletion.clearCoursePitches(world.courseDb, "bea"), 2);
    assert.equal(pitchTitled("Steering at scale"), null);
    assert.deepEqual(pitchTitled("Probe transfer").wouldJoinUids, []);
    assert.equal(pitches().length, 2);
  });

  test("somebody on no pitch and on no list changes nothing", async () => {
    await pitchingDone();
    const before = JSON.stringify(pitches());
    assert.equal(await accountDeletion.clearCoursePitches(world.courseDb, "omar"), 0);
    assert.equal(JSON.stringify(pitches()), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*coursePitchesCleared: number;/m);
    assert.match(source, /^\s*coursePitchesCleared: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.coursePitchesCleared = await clearCoursePitches\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
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
  test("its manifest counts the pitches, and the destroy deletes every one, and no other run's", async () => {
    await pitchingDone();
    // Another run's pitch, which must survive.
    world.db.seed("coursePitches/elsewhere", {
      runId: "another-run",
      groupId: "another-group",
      weekId: "w03",
      weekNumber: 3,
      title: "Somewhere else",
      twist: "Not this run's",
      pitcherUids: ["nina"],
      wouldJoinUids: [],
    });
    // A run with people on it has to be settled before it can be destroyed.
    world.db.poke(`courseRuns/${INC.run}`, { status: "completed" });
    const db = counting(world.courseDb);
    const run = world.db.read(`courseRuns/${INC.run}`);
    assert.ok(run);

    const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(INC.run, run));
    assert.equal(counts.pitches, 3);

    const result = await courseDeletion.destroyRunCascade(db, null, INC.run, {
      actorUid: "zach",
      actorName: "Zach Levin",
    });
    assert.equal(result.deleted.pitches, 3);
    assert.deepEqual(
      pitches().map((pitch) => pitch.id),
      ["elsewhere"],
    );
    assert.equal(world.db.read(`courseRuns/${INC.run}`), undefined, "the run itself is gone");
  });

  test("the pitches drain with the run's other leaves, before the enrolments that open the pitching routes", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.includes("pitches"), "the cascade has no pitches stage");
    assert.ok(order.indexOf("pitches") < order.indexOf("enrolments"));
    assert.match(table, /drainQuery\(db, PITCHES_COLLECTION, byRunId\(PITCHES_COLLECTION\), budget\)/);
  });
});
