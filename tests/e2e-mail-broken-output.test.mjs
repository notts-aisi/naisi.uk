/**
 * Broken output in an email, looked for in a way luck cannot fail.
 *
 * Run with `npm test` (Node's built-in runner, no Mailpit, no server).
 *
 * The end-to-end batteries check that an email shows no template value that
 * failed to render ("undefined", "[object Object]", "NaN"). Until 28 October
 * 2026 two of them searched the raw body, links and all, and a link's random
 * base64url token spelled "NaN" and failed a promotion over an email nothing
 * had changed. `brokenOutputIn` (`scripts/e2e/lib/mailpit.mjs`) is how that
 * check is made now. This proves it still catches what it is for, no longer
 * catches a token, and that no spec goes back to searching a raw body.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brokenOutputIn } from "../scripts/e2e/lib/mailpit.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The token of 28 October's failure, near enough: base64url with "NaN" inside. */
const TOKEN = "eyJ2IjoiZk9OYU5xZ3kifQ.k3NaNzT0p_Qw-x9";
const LINK = `https://naisi.invalid/verify-email/${TOKEN}`;

describe("what counts as broken output", () => {
  test("a random token that spells NaN is not, in a link, an href or the text part", () => {
    assert.deepEqual(brokenOutputIn(`<p>Verify your address.</p><a href="${LINK}">Verify</a><p>${LINK}</p>`), []);
    assert.deepEqual(brokenOutputIn(`Verify your address: ${LINK}\nThe link works for 10 minutes.`), []);
    assert.deepEqual(brokenOutputIn(`<img src="data:image/png;base64,iVBORw0KGgoNaNAAA" alt="">`), []);
  });

  test("a value that failed to render is, in the words", () => {
    assert.deepEqual(brokenOutputIn("<p>The link works for NaN minutes.</p>"), ["NaN"]);
    assert.deepEqual(brokenOutputIn("Hi undefined,"), ["undefined"]);
    assert.deepEqual(brokenOutputIn("<p>[object Object]</p>"), ["[object Object]"]);
  });

  test("and in a link, where a whole segment or value failed", () => {
    assert.deepEqual(brokenOutputIn('<a href="https://naisi.invalid/verify?exp=NaN">Verify</a>'), ["NaN"]);
    assert.deepEqual(brokenOutputIn("https://naisi.invalid/events/NaN/rsvp"), ["NaN"]);
    assert.deepEqual(brokenOutputIn('<a href="https://naisi.invalid/a/undefined">Open</a>'), ["undefined"]);
  });
});

/** Every spec file of both end-to-end trees. */
function specFiles() {
  const out = [];
  for (const dir of ["scripts/e2e/tests", "tests/e2e"]) {
    for (const name of readdirSync(join(REPO_ROOT, dir))) {
      if (/\.(spec|test)\.mjs$/.test(name)) out.push(join(dir, name));
    }
  }
  return out;
}

describe("no spec searches a raw email for broken output", () => {
  test("NaN is looked for only through brokenOutputIn", () => {
    const files = specFiles();
    assert.ok(files.length >= 10, `only ${files.length} spec files were found: the walk has stopped reading`);
    // Code, not what a comment says about it.
    const code = (file) =>
      readFileSync(join(REPO_ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const searching = files.filter((file) => /["'`]NaN["'`]/.test(code(file)));
    assert.deepEqual(
      searching,
      [],
      "These specs name NaN themselves. A link's random token can spell it, so a search over an email's raw " +
        "body fails by chance: use brokenOutputIn from scripts/e2e/lib/mailpit.mjs.",
    );
  });

  test("the two batteries that read a verification email use it", () => {
    for (const file of ["scripts/e2e/tests/uni-email-inbox.test.mjs", "scripts/e2e/tests/register-email-flow.test.mjs"]) {
      assert.match(readFileSync(join(REPO_ROOT, file), "utf8"), /brokenOutputIn\(/, `${file} no longer uses it`);
    }
  });
});
