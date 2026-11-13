/**
 * How CI splits the browser specs across machines, held from both ends.
 *
 * Run with `npm test` (Node's built-in runner, offline: no browser, no project).
 *
 * The local end-to-end job runs on seven machines at once: the fetch
 * batteries on one, and one part of the browser specs on each of six
 * (`node scripts/run-e2e.mjs --local --shard N/6`). Three things make that
 * safe, and each is checked here; a fourth makes it worth doing:
 *
 *  1. EVERY SPEC RUNS, ONCE. Whatever the count, the parts between them hold
 *     every spec module in `scripts/e2e-fixtures/` exactly once, so a new spec
 *     is placed by adding its file and can never fall between two machines.
 *  2. A SPEC THAT BORROWS A SHARED SETTING RUNS IN PART 1. `config/membership`
 *     and the end of a programme's question set are each one document on the
 *     whole dev project; the spec that changes one puts it back in teardown,
 *     and two runs overlapping would each restore the other's. The walk below
 *     finds every fixture that reaches either and fails one missing from
 *     BORROWS_A_SHARED_SETTING.
 *  3. PART 1 IS THE PART IN THE SHARED QUEUE. In `.github/workflows/e2e.yml`
 *     only `specs-1` joins the group the nightly waits in; the other parts take
 *     a group of their own. The matrix and the runner's arithmetic agree.
 *  4. THE PARTS ARE LEVEL. A run waits for its slowest part, so the specs are
 *     dealt by how long each takes (`SPEC_SECONDS`), and part 1, which may
 *     wait in the shared queue, holds the least. Held at the count the
 *     workflow really runs, read out of its matrix.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BORROWS_A_SHARED_SETTING,
  DEFAULT_SPEC_SECONDS,
  SHARED_QUEUE_SECONDS,
  SPEC_SECONDS,
  namesInShard,
  parseShard,
  secondsFor,
} from "../scripts/e2e/lib/shard.mjs";

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

  for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`split ${count} ways, every spec lands in exactly one part`, () => {
      const placed = [];
      for (let index = 1; index <= count; index += 1) placed.push(...namesInShard(NAMES, index, count));
      assert.deepEqual([...placed].sort(), [...NAMES].sort());
    });
  }

  test("the split is the same whatever order the names arrive in, and a name given twice is placed once", () => {
    const reversed = [...NAMES].reverse();
    for (const count of [3, 6]) {
      for (let index = 1; index <= count; index += 1) {
        assert.deepEqual(namesInShard(reversed, index, count), namesInShard(NAMES, index, count));
        assert.deepEqual(namesInShard([...NAMES, ...NAMES], index, count), namesInShard(NAMES, index, count));
        // Each part is handed back in name order, so a run's log reads the same way every time.
        const part = namesInShard(NAMES, index, count);
        assert.deepEqual(part, [...part].sort());
      }
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
    assert.deepEqual(parseShard("6/6"), { index: 6, count: 6 });
    for (const bad of ["", "0/3", "4/3", "1/0", "x/3", "1-3", "1/3/5", undefined]) {
      assert.equal(parseShard(bad), null, `"${bad}" was accepted`);
    }
  });
});

describe("a spec that borrows a shared setting runs in part 1", () => {
  // Each door core.mjs opens onto a document the whole dev project shares, and what it reaches.
  const SHARED_DOORS = [
    ["membershipConfigDoc", "config/membership"],
    ["surveyQuestionSetDoc", "surveyQuestionSets/after"],
  ];

  for (const [door, what] of SHARED_DOORS) {
    test(`every fixture that reaches ${what} is on the list`, () => {
      const call = new RegExp(`\\b${door}\\s*\\(`);
      const reaching = SPECS.filter((spec) => call.test(spec.text)).map((spec) => spec.name);
      assert.ok(reaching.length > 0, `no fixture reaches ${what}: this guard has nothing to hold`);
      for (const name of reaching) {
        assert.ok(
          BORROWS_A_SHARED_SETTING.has(name),
          `${name} reaches ${what} and is not in BORROWS_A_SHARED_SETTING (scripts/e2e/lib/shard.mjs), ` +
            "so a split could run it beside another run's copy",
        );
      }
    });
  }

  test("every door onto a shared document is one this walk knows", () => {
    const core = readFileSync(join(FIXTURES, "core.mjs"), "utf8");
    const doors = [...core.matchAll(/\nexport function (\w+Doc)\(\)/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      doors,
      SHARED_DOORS.map(([door]) => door).sort(),
      "core.mjs exports a door onto one shared document that this test does not walk for, or lost one it does",
    );
  });

  test("every entry on the list is a spec that exists, with a reason", () => {
    for (const [name, why] of BORROWS_A_SHARED_SETTING) {
      assert.ok(NAMES.includes(name), `${name} is on the list and is not a spec`);
      assert.ok(why.length > 40, `${name}: the reason is too short to be one`);
    }
  });

  test("whatever the count, the borrowers are in part 1 and no other", () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
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

describe("the parts are level, at the count the workflow runs", () => {
  const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/e2e.yml"), "utf8");
  /** How many parts the browser specs are split into, read out of the local job's matrix. */
  const COUNT = [...workflow.matchAll(/^ {12}shard: \d+\/(\d+)$/gm)].map((match) => Number(match[1]));
  const count = COUNT[0];
  const work = (part) => part.reduce((sum, name) => sum + secondsFor(name), 0);
  const parts = () => Array.from({ length: count }, (_, i) => namesInShard(NAMES, i + 1, count));

  test("the workflow splits the specs six ways, and every part names the same count", () => {
    assert.equal(count, 6);
    assert.equal(COUNT.length, count);
    assert.ok(COUNT.every((n) => n === count), "the matrix's parts do not agree on how many there are");
  });

  test("every recorded time belongs to a spec that exists, and is a sensible number of seconds", () => {
    for (const [name, seconds] of SPEC_SECONDS) {
      assert.ok(NAMES.includes(name), `${name} has a recorded time and is not a spec: take the entry out`);
      assert.ok(Number.isInteger(seconds) && seconds >= 10 && seconds <= 3600, `${name}: ${seconds} is not a time in seconds`);
    }
    // A spec with no entry is placed all the same, at the default.
    assert.equal(secondsFor("a-spec-nobody-has-timed"), DEFAULT_SPEC_SECONDS);
    assert.ok(DEFAULT_SPEC_SECONDS >= 30 && DEFAULT_SPEC_SECONDS <= 600);
    const untimed = NAMES.filter((name) => !SPEC_SECONDS.has(name));
    assert.ok(
      untimed.length <= NAMES.length / 3,
      `${untimed.length} of ${NAMES.length} specs have no recorded time (${untimed.join(", ")}): the parts are being dealt mostly by guesswork. ` +
        "Read the times off a run's log into SPEC_SECONDS (scripts/e2e/lib/shard.mjs).",
    );
  });

  test("no part is empty, and the parts beside part 1 differ by less than the longest spec", () => {
    const dealt = parts();
    for (const [i, part] of dealt.entries()) assert.ok(part.length > 0, `part ${i + 1} of ${count} is empty`);
    const others = dealt.slice(1).map(work);
    const longest = Math.max(...NAMES.map(secondsFor));
    assert.ok(
      Math.max(...others) - Math.min(...others) <= longest,
      `parts 2 to ${count} hold ${others.join(", ")} seconds: one waits far longer than another`,
    );
    // The slowest part holds the longest spec or about a level share, whichever is more: never everything long at once.
    const share = (NAMES.reduce((sum, name) => sum + secondsFor(name), 0) + SHARED_QUEUE_SECONDS) / count;
    assert.ok(Math.max(...others) <= Math.max(longest, share) + longest / 2, `the slowest part holds ${Math.max(...others)} seconds`);
  });

  test("part 1, which may wait in the shared queue, holds the least work", () => {
    const dealt = parts().map(work);
    assert.ok(SHARED_QUEUE_SECONDS > 0);
    for (let index = 1; index < count; index += 1) {
      assert.ok(dealt[0] <= dealt[index], `part 1 holds ${dealt[0]} seconds and part ${index + 1} holds ${dealt[index]}`);
    }
  });

  test("the specs are dealt longest first: the three longest sit in three different parts", () => {
    const byLength = NAMES.filter((name) => !BORROWS_A_SHARED_SETTING.has(name)).sort((a, b) => secondsFor(b) - secondsFor(a) || (a < b ? -1 : 1));
    const dealt = parts();
    const partOf = (name) => dealt.findIndex((part) => part.includes(name));
    const homes = byLength.slice(0, 3).map(partOf);
    assert.equal(new Set(homes).size, 3, `the three longest specs (${byLength.slice(0, 3).join(", ")}) share a part: ${homes.map((i) => i + 1).join(", ")}`);
  });
});
