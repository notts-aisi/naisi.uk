/**
 * Every browser spec that records its steps writes its completion marker.
 *
 * WHY. A spec runs its work through the step recorder
 * (`createStepRecorder`, `scripts/e2e/lib/browser.mjs`), and the runner
 * refuses to report a pass unless the spec's marker comes back naming every
 * step in `SPEC.steps`: `node --test` exits 0 over a spec that skipped
 * itself, which is indistinguishable from a pass. The recorder writes the
 * marker only when the spec tells it to (`recorder.writeMarker()`), once the
 * browser is closed. A spec that never does can pass every step and still be
 * "not a pass", and the first place that shows is a run of the whole suite.
 * This holds it in `npm test` instead.
 *
 * WHAT IT CHECKS, with comments stripped first: a spec under `tests/e2e`
 * that makes a step recorder calls `.writeMarker()` in a `finally` block, so
 * the steps that did run are recorded even when a later one throws.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";

const SPEC_DIR = join(dirname(fileURLToPath(import.meta.url)), "e2e");
const specs = readdirSync(SPEC_DIR)
  .filter((name) => name.endsWith(".spec.mjs"))
  .sort();

/** True when `.writeMarker()` is called somewhere after a `finally {` in the code. */
const writesMarkerInFinally = (code) => {
  const last = code.lastIndexOf(".writeMarker()");
  return last >= 0 && /\bfinally\s*\{/.test(code.slice(0, last));
};

test("the specs are found, and most of them record their steps", () => {
  const recording = specs.filter((name) => /\bcreateStepRecorder\s*\(/.test(stripSource(readFileSync(join(SPEC_DIR, name), "utf8"))));
  assert.ok(specs.length >= 30, `only ${specs.length} specs under tests/e2e`);
  assert.ok(recording.length >= 30, `only ${recording.length} specs make a step recorder`);
});

test("every spec that makes a step recorder writes its completion marker in a finally block", () => {
  const missing = [];
  for (const name of specs) {
    const code = stripSource(readFileSync(join(SPEC_DIR, name), "utf8"));
    if (!/\bcreateStepRecorder\s*\(/.test(code)) continue;
    if (!writesMarkerInFinally(code)) missing.push(name);
  }
  assert.deepEqual(
    missing,
    [],
    "Call recorder.writeMarker() in the spec's finally block, after the browser is closed. " +
      "Without it the runner reports the spec as never having run, however many steps passed.",
  );
});

test("the check itself tells a spec that writes the marker from one that does not", () => {
  assert.equal(writesMarkerInFinally("try { await step(); } finally { await browser.close(); recorder.writeMarker(); }"), true);
  assert.equal(writesMarkerInFinally("try { await step(); } finally { await browser.close(); }"), false);
  assert.equal(writesMarkerInFinally("recorder.writeMarker(); try { await step(); } finally { await browser.close(); }"), false);
});
