/**
 * THE CUT-OFF: from when somebody's coursework may be used outside its
 * programme (privacy v13, `src/lib/legal/courseworkUse.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. The moment: the kept field, else an agreement to v13 or later at its
 *     own time (never earlier), else none.
 *  2. A row counts only when it was FIRST written strictly after the moment,
 *     and a row with no first-written time never counts.
 *  3. The writers: every path that records a member's agreement keeps the
 *     moment, once; the three routes that create a row of coursework stamp
 *     when it was first written and never stamp an old row; no browser
 *     writes the moment.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const code = (path) => stripSource(read(path), { keepStrings: true });

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const use = await loadTs("lib/legal/courseworkUse.ts");
const stamp = await loadTs("lib/legal/courseworkUseStamp.ts");
const { currentPolicy } = await loadTs("lib/legal/policies.ts");

const at = (iso) => new Date(iso);
const stampOf = (iso) => ({ toDate: () => new Date(iso) });

describe("the moment somebody's coursework counts from", () => {
  test("the version inside a stored agreement", () => {
    assert.equal(use.privacyVersionIn("terms.1+privacy.13"), 13);
    assert.equal(use.privacyVersionIn("privacy.14+terms.2"), 14);
    assert.equal(use.privacyVersionIn("terms.1+privacy.9"), 9);
    for (const nothing of [undefined, null, 13, "", "v13", "terms.1", "terms.1+privacy.", "terms.1+privacy.13x"]) {
      assert.equal(use.privacyVersionIn(nothing), null, String(nothing));
    }
  });

  test("an agreement covers coursework from v13, up to the version the site serves and no further", () => {
    assert.equal(use.COURSEWORK_USE_FROM_VERSION, 13);
    assert.equal(use.agreementCoversCourseworkUse("terms.1+privacy.12"), false);
    assert.equal(use.agreementCoversCourseworkUse("terms.1+privacy.13"), true);
    const served = currentPolicy("privacy").version;
    assert.equal(use.agreementCoversCourseworkUse(`terms.1+privacy.${served}`), served >= 13);
    // A version nobody was ever shown agrees to nothing.
    assert.equal(use.agreementCoversCourseworkUse(`terms.1+privacy.${served + 1}`), false);
    assert.equal(use.agreementCoversCourseworkUse("terms.1+privacy.99"), false);
  });

  test("the kept moment wins, as a Timestamp or a Date", () => {
    const kept = use.courseworkCountsFrom({
      courseworkUseAgreedAt: stampOf("2026-10-30T09:00:00Z"),
      policyVersion: "terms.1+privacy.13",
      policyAgreedAt: stampOf("2026-11-20T09:00:00Z"),
    });
    assert.equal(kept?.toISOString(), "2026-10-30T09:00:00.000Z");
    assert.equal(
      use.courseworkCountsFrom({ courseworkUseAgreedAt: at("2026-10-31T09:00:00Z") })?.toISOString(),
      "2026-10-31T09:00:00.000Z",
    );
  });

  test("with nothing kept, an agreement to v13 counts from its own time, which is never earlier", () => {
    const from = use.courseworkCountsFrom({ policyVersion: "terms.1+privacy.13", policyAgreedAt: stampOf("2026-10-30T10:00:00Z") });
    assert.equal(from?.toISOString(), "2026-10-30T10:00:00.000Z");
  });

  test("nobody counts without an agreement to v13 or later", () => {
    for (const user of [
      null,
      undefined,
      {},
      { policyVersion: "terms.1+privacy.12", policyAgreedAt: stampOf("2026-10-30T10:00:00Z") },
      { policyVersion: "terms.1+privacy.13" },
      { policyVersion: "terms.1+privacy.13", policyAgreedAt: "2026-10-30" },
      { courseworkUseAgreedAt: "2026-10-30T09:00:00Z" },
      { courseworkUseAgreedAt: new Date("not a date") },
    ]) {
      assert.equal(use.courseworkCountsFrom(user), null, JSON.stringify(user));
    }
  });
});

describe("a row counts only when it was written entirely after the moment", () => {
  const from = at("2026-10-30T09:00:00Z");

  test("first written after the moment: counts", () => {
    assert.equal(use.writtenAfter(stampOf("2026-10-30T09:00:00.001Z"), from), true);
    assert.equal(use.rowCountsFrom({ firstWrittenAt: at("2026-11-02T12:00:00Z") }, from), true);
  });

  test("first written at the very moment, or before it: does not count", () => {
    assert.equal(use.writtenAfter(stampOf("2026-10-30T09:00:00Z"), from), false);
    assert.equal(use.writtenAfter(stampOf("2026-10-30T08:59:59.999Z"), from), false);
    // Started before, changed after: its first words came before, so it does not count.
    assert.equal(use.rowCountsFrom({ firstWrittenAt: at("2026-10-29T12:00:00Z"), updatedAt: at("2026-11-02T12:00:00Z") }, from), false);
  });

  test("a row with no first-written time never counts, however recent its last change", () => {
    assert.equal(use.rowCountsFrom({ updatedAt: at("2026-12-01T00:00:00Z") }, from), false);
    assert.equal(use.rowCountsFrom({}, from), false);
    assert.equal(use.rowCountsFrom(null, from), false);
  });

  test("nothing counts for somebody with no moment", () => {
    assert.equal(use.rowCountsFrom({ firstWrittenAt: at("2026-12-01T00:00:00Z") }, null), false);
    assert.equal(use.cameAfter(at("2026-12-01T00:00:00Z"), null), false);
  });

  test("something written at a time came after the moment only when strictly after it", () => {
    assert.equal(use.cameAfter(at("2026-10-30T09:00:01Z"), from), true);
    assert.equal(use.cameAfter(at("2026-10-30T09:00:00Z"), from), false);
    assert.equal(use.cameAfter(null, from), false);
  });
});

describe("the stamps", () => {
  test("an agreement keeps the moment the first time it is to v13 or later, and never again", () => {
    assert.deepEqual(Object.keys(stamp.courseworkUseStampFor({ policyVersion: "terms.1+privacy.12" }, "terms.1+privacy.13")), [
      "courseworkUseAgreedAt",
    ]);
    assert.deepEqual(stamp.courseworkUseStampFor({ courseworkUseAgreedAt: at("2026-10-30T09:00:00Z") }, "terms.1+privacy.13"), {});
    assert.deepEqual(stamp.courseworkUseStampFor({}, "terms.1+privacy.12"), {});
    assert.deepEqual(stamp.courseworkUseStampFor(null, "terms.1+privacy.13"), {});
  });

  test("a new row is stamped, a row keeps its own, and an old row is never stamped", () => {
    assert.deepEqual(Object.keys(stamp.firstWrittenFor(null)), ["firstWrittenAt"]);
    const own = at("2026-11-01T00:00:00Z");
    assert.deepEqual(stamp.firstWrittenFor({ firstWrittenAt: own }), { firstWrittenAt: own });
    assert.deepEqual(stamp.firstWrittenFor({ text: "Written before the stamp existed" }), {});
  });

  test("every route that creates a row of coursework stamps it, from the row as it stood", () => {
    for (const [path, shape] of [
      ["src/app/api/courses/runs/[runId]/reflections/[promptId]/route.ts", /\.\.\.firstWrittenFor\(snap\.exists \? \(snap\.data\(\) \?\? \{\}\) : null\)/],
      ["src/app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts", /\.\.\.firstWrittenFor\(snap\.exists \? \(snap\.data\(\) \?\? \{\}\) : null\)/],
      ["src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts", /if \(!prior\) Object\.assign\(write, firstWrittenFor\(null\)\);\s*tx\.set\(ref, write, \{ merge: true \}\);/],
    ]) {
      assert.match(code(path), shape, `${path} no longer stamps when a row was first written`);
    }
  });

  test("every path that records a member's agreement keeps the moment; no browser writes it", () => {
    const reconsent = code("src/app/api/account/reconsent/route.ts");
    assert.match(reconsent, /db\.runTransaction\(async \(tx\) => \{\s*const snap = await tx\.get\(ref\);\s*tx\.update\(ref, \{\s*\.\.\.stamp,\s*\.\.\.courseworkUseStampFor\(snap\.exists \? \(snap\.data\(\) \?\? \{\}\) : null, CURRENT_POLICY_VERSION\),\s*\}\);/);
    const registered = code("src/app/api/register/profile-complete/route.ts");
    assert.match(registered, /await stampCourseworkUse\(db, session\.uid\);/);
    // Registration's browser write carries the agreement and never the moment.
    const browser = code("src/auth/signInWithGoogle.ts");
    assert.match(browser, /policyAgreedAt: serverTimestamp\(\),/);
    assert.doesNotMatch(browser, /courseworkUseAgreedAt/);
    // The only places in src that write it.
    const rules = read("firestore.rules");
    assert.match(rules, /&& !\('courseworkUseAgreedAt' in request\.resource\.data\)/);
    assert.match(rules, /&& request\.resource\.data\.get\('courseworkUseAgreedAt', null\)\s*== resource\.data\.get\('courseworkUseAgreedAt', null\)\s*&& smallEnough\(\);/);
  });
});
