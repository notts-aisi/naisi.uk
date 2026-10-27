/**
 * How CI splits the browser specs across machines, held from both ends.
 *
 * Run with `npm test` (Node's built-in runner, offline: no browser, no project).
 *
 * The local end-to-end job runs on four machines at once: the fetch batteries
 * on one, and a third of the browser specs on each of three
 * (`node scripts/run-e2e.mjs --local --shard N/3`). Three things make that
 * safe, and each is checked here:
 *
 *  1. EVERY SPEC RUNS, ONCE. Whatever the count, the parts between them hold
 *     every spec module in `scripts/e2e-fixtures/` exactly once, so a new spec
 *     is placed by adding its file and can never fall between two machines.
 *  2. A SPEC THAT BORROWS A SHARED SETTING RUNS IN PART 1. `config/membership`
 *     is one document on the whole dev project; the spec that moves it puts it
 *     back in teardown, and two runs overlapping would each restore the
 *     other's. The walk below finds every fixture that reaches it and fails
 *     one missing from BORROWS_A_SHARED_SETTING.
 *  3. PART 1 IS THE PART IN THE SHARED QUEUE. In `.github/workflows/e2e.yml`
 *     only `specs-1` joins the group the nightly waits in; the other parts take
 *     a group of their own. The matrix and the runner's arithmetic agree.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BORROWS_A_SHARED_SETTING, namesInShard, parseShard } from "../scripts/e2e/lib/shard.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(REPO_ROOT, "scripts/e2e-fixtures");

/** Every spec module, by the name its SPEC declares. */
function specModules() {
  const out = [];
  for (const entry of readdirSync(FIXTURES).sort()) {
    const path = join(FIXTURES, entry);
    if (!entry.endsWith(".mjs") || entry === "core.mjs" || statSync(path).isDirectory()) continue;
    const text = readFileSync(path, "utf8");
    const declared = /\nexport const SPEC = \{\n\s+name: "([^"]+)"/.exec(text);
    assert.ok(declared, `${entry} declares no SPEC name this test can read`);
    out.push({ file: entry, name: declared[1], text });
  }
  return out;
}

const SPECS = specModules();
const NAMES = SPECS.map((spec) => spec.name);

describe("every spec runs, once", () => {
  test("the walk finds the specs", () => {
    assert.ok(NAMES.length >= 10, `only ${NAMES.length} spec modules found`);
    assert.equal(new Set(NAMES).size, NAMES.length, "two modules declare the same SPEC name");
  });

  for (const count of [1, 2, 3, 4, 5]) {
    test(`split ${count} ways, every spec lands in exactly one part`, () => {
      const placed = [];
      for (let index = 1; index <= count; index += 1) placed.push(...namesInShard(NAMES, index, count));
      assert.deepEqual([...placed].sort(), [...NAMES].sort());
    });
  }

  test("the split is the same whatever order the names arrive in", () => {
    const reversed = [...NAMES].reverse();
    for (let index = 1; index <= 3; index += 1) {
      assert.deepEqual(namesInShard(reversed, index, 3), namesInShard(NAMES, index, 3));
    }
  });

  test("no part of three is empty, and none holds more than half", () => {
    for (let index = 1; index <= 3; index += 1) {
      const part = namesInShard(NAMES, index, 3);
      assert.ok(part.length > 0, `part ${index} of 3 is empty`);
      assert.ok(part.length <= Math.ceil(NAMES.length / 2), `part ${index} of 3 holds ${part.length}`);
    }
  });

  test("a part and a count are read strictly", () => {
    assert.deepEqual(parseShard("2/3"), { index: 2, count: 3 });
    for (const bad of ["", "0/3", "4/3", "1/0", "x/3", "1-3", "1/3/5", undefined]) {
      assert.equal(parseShard(bad), null, `"${bad}" was accepted`);
    }
  });
});

describe("a spec that borrows a shared setting runs in part 1", () => {
  test("every fixture that reaches the shared document is on the list", () => {
    const reaching = SPECS.filter((spec) => /\bmembershipConfigDoc\s*\(/.test(spec.text)).map((spec) => spec.name);
    assert.ok(reaching.length > 0, "no fixture reaches config/membership: this guard has nothing to hold");
    for (const name of reaching) {
      assert.ok(
        BORROWS_A_SHARED_SETTING.has(name),
        `${name} reaches config/membership and is not in BORROWS_A_SHARED_SETTING (scripts/e2e/lib/shard.mjs), ` +
          "so a split could run it beside another run's copy",
      );
    }
  });

  test("every entry on the list is a spec that exists, with a reason", () => {
    for (const [name, why] of BORROWS_A_SHARED_SETTING) {
      assert.ok(NAMES.includes(name), `${name} is on the list and is not a spec`);
      assert.ok(why.length > 40, `${name}: the reason is too short to be one`);
    }
  });

  test("whatever the count, the borrowers are in part 1 and no other", () => {
    for (const count of [1, 2, 3, 4]) {
      for (const name of BORROWS_A_SHARED_SETTING.keys()) {
        assert.ok(namesInShard(NAMES, 1, count).includes(name), `${name} is not in part 1 of ${count}`);
        for (let index = 2; index <= count; index += 1) {
          assert.ok(!namesInShard(NAMES, index, count).includes(name), `${name} is in part ${index} of ${count}`);
        }
      }
    }
  });
});

describe("part 1 is the part in the shared queue", () => {
  const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/e2e.yml"), "utf8");
  const local = workflow.slice(workflow.indexOf("\n  local:\n"), workflow.indexOf("\n  dev:\n"));

  test("the matrix is the batteries and every part of one split", () => {
    const parts = [];
    for (const line of local.split("\n")) {
      const part = /^ {10}- part: (\S+)$/.exec(line);
      if (part) parts.push([part[1], null]);
      const shard = /^ {12}shard: (\S+)$/.exec(line);
      if (shard && parts.length > 0) parts[parts.length - 1][1] = shard[1];
    }
    assert.deepEqual(parts[0], ["batteries", null]);
    const specs = parts.slice(1);
    assert.ok(specs.length >= 2, "the browser specs are not split");
    specs.forEach(([part, shard], i) => {
      assert.equal(part, `specs-${i + 1}`);
      assert.equal(shard, `${i + 1}/${specs.length}`);
    });
  });

  test("only specs-1 joins the group the nightly waits in", () => {
    assert.ok(
      local.includes(
        "group: ${{ matrix.part == 'specs-1' && format('e2e-{0}', github.workflow) || format('e2e-{0}-{1}-{2}', github.workflow, github.run_id, matrix.part) }}",
      ),
      "the local job's group no longer sends specs-1, and only specs-1, to the shared queue",
    );
    assert.match(workflow.slice(workflow.indexOf("\n  dev:\n")), /\n {6}group: e2e-\$\{\{ github\.workflow \}\}\n/);
  });

  test("each part of the browser specs runs its own shard", () => {
    assert.ok(local.includes('run: node scripts/run-e2e.mjs --local --shard "$SHARD"'));
    assert.ok(local.includes("SHARD: ${{ matrix.shard }}"));
  });
});
