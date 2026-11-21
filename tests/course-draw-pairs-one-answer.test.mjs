/**
 * THE DRAW'S AND THE PAIRS' ROUTES ANSWER A GROUP THAT IS NOT THERE AS THEY
 * ANSWER ONE THE CALLER HAS NO PART IN. `PUT /api/courses/groups/[groupId]/draw`
 * and `PUT /api/courses/groups/[groupId]/pairs` identify the caller, then ask
 * the draw's gate (`openDrawGroup`), then read the body: a group id that
 * names nothing and a group the caller has no part in get the same 403,
 * whatever the body, as the registers' routes answer. An admin, who is
 * admitted to every group, alone is told a group is not there.
 *
 * The world is `tests/lib/packsAndCasesWorld.mjs`: Group B (Rahul, Sofia and
 * Farah facilitating; Chloe and Kofi taking part); Group A facilitated by
 * Sofia; Claudia leads the programme; Zach is an admin.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { A, B, NOW, makePacksAndCasesWorld } from "./lib/packsAndCasesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const w = await makePacksAndCasesWorld("__drawPairsOneAnswer");
const pairs = await w.courseRoute("groups", "[groupId]", "pairs");

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

const ROUTES = { draw: w.routes.draw.PUT, pairs: pairs.PUT };
const WHOLE = {
  draw: { weekId: "w03", entries: [{ uid: "chloe", blockId: "w3-co-1", value: null }] },
  pairs: { weekId: "w03", blockId: "w3-pairs", entries: [{ uid: "chloe", pair: 1, laptop: false }] },
};
const ask = (who, route, groupId, body) => w.call(who, ROUTES[route], { groupId }, { course: true, body });
const FORBIDDEN = [403, { error: "Forbidden" }];

describe("a group that is not there, and a group the caller has no part in", () => {
  for (const route of Object.keys(ROUTES)) {
    test(`${route}: the same 403 for both, before the body is read, whatever the body`, async () => {
      for (const body of [undefined, {}, { weekId: "nonsense" }, WHOLE[route]]) {
        for (const groupId of ["no-such-group", A]) {
          const answer = await ask("kofi", route, groupId, body);
          assert.deepEqual([answer.status, answer.body], FORBIDDEN, `${route} ${groupId} ${JSON.stringify(body)}`);
        }
        // Rahul facilitates Group B and not Group A: the same answer about Group A as about nothing.
        const other = await ask("rahul", route, A, body);
        assert.deepEqual([other.status, other.body], FORBIDDEN, `${route} as Rahul ${JSON.stringify(body)}`);
      }
      // Signed out is told so first.
      assert.equal((await ask(null, route, "no-such-group", {})).status, 401);
    });

    test(`${route}: somebody the gate admits meets the body's check; an admin alone is told a group is not there`, async () => {
      for (const who of ["rahul", "claudia", "zach"]) {
        const answer = await ask(who, route, B, {});
        assert.equal(answer.status, 400, `${route} as ${who}: ${JSON.stringify(answer.body)}`);
      }
      const missing = await ask("zach", route, "no-such-group", {});
      assert.deepEqual([missing.status, missing.body], [404, { error: "That group isn’t on this programme." }]);
    });
  }

  test("both routes ask the one helper before they read the body", () => {
    for (const route of ["draw", "pairs"]) {
      const code = readFileSync(join(SRC, "app", "api", "courses", "groups", "[groupId]", route, "route.ts"), "utf8");
      const gate = code.indexOf("const opened = await openDrawGroup(db, actor, groupId);");
      assert.ok(gate > 0, `${route} no longer asks openDrawGroup`);
      assert.ok(gate < code.indexOf("await req.json()"), `${route} reads the body before the gate`);
      assert.ok(code.indexOf("getCurrentUser()") < gate, `${route} asks the gate before it knows the caller`);
      assert.doesNotMatch(code, /drawGate\(/, `${route} asks the draw's gate for itself`);
    }
  });
});
