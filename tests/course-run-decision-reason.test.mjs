/**
 * A REASON GIVEN ON A RUN'S OWN APPLICATIONS PAGE IS NEVER EMAILED, AND THE
 * PAGE SAYS SO.
 *
 * Run with `npm test` (Node's built-in runner, nothing to install).
 *
 * ## The rule this guards
 *
 * The run's decide route keeps the reason for a decision on the application's
 * row (`decidedReason`), where the run's applications page shows it to whoever
 * can open that list, and it hands the decision email nothing of it: no
 * course email has a slot the route fills with it. The runbook
 * (`docs/courses-ops.md`, "When somebody gives their place back") sends an
 * admin to that page to change the row of somebody who gave their place back
 * on the application form, and such a row has no address at all. So the box
 * the reason is typed into must not tell the admin it goes in an email, or
 * that the person will read it.
 *
 * ## Two layers
 *
 * Both are read from the source, as the hand-over panel's own words are
 * (`tests/applications-handover-panel.test.mjs`): the route's one call of the
 * mail door, and the words of the box. A change to either that makes them
 * disagree fails here.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

describe("a reason given on a run's own applications page", () => {
  test("is kept on the row, and the decide route hands the decision email nothing of it", () => {
    const route = read("src/app/api/courses/runs/[runId]/applications/[uid]/decide/route.ts");
    assert.match(route, /decidedReason: reason \? reason : FieldValue\.delete\(\)/, "the reason is no longer kept on the row");
    const calls = [...route.matchAll(/sendCourseApplicationEmail\(\{([\s\S]*?)\}\)/g)].map((match) => match[1]);
    assert.equal(calls.length, 1, "the decide route sends its email from one place");
    assert.doesNotMatch(calls[0], /\breason\b/, "the decision email is handed the reason");
  });

  test("is typed into a box that says it stays on the list and is never emailed", () => {
    const page = read("src/features/courses/AdmissionsQueue.tsx");
    const box = /<div className=\{styles\.rejectBox\}>([\s\S]*?)<\/div>\s*\) : \(/.exec(page)?.[1] ?? "";
    assert.ok(box.length > 0, "the reason box is not where this test reads it");
    const words = box.replace(/\s+/g, " ");
    assert.ok(words.includes("Reason (optional). It stays on this list and is never emailed."), "the box's label");
    assert.ok(words.includes('placeholder="Why, for whoever opens this list next."'), "the box's placeholder");
    assert.doesNotMatch(words, /in their email|will read this|included in/i);
  });
});
