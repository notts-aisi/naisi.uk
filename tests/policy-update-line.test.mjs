/**
 * THE LINE THAT SAYS THE PRIVACY POLICY CHANGED (`policyUpdateLine` in
 * `src/lib/legal/updateLine.ts`), on Home and at the top of /privacy, for 14
 * days from the current version's date.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * From privacy version 17 a change to how somebody's information is used is
 * told on the site ("Changes to this policy"), and this line is how. The
 * window is worked out from the date in `src/lib/legal/policies.ts` and
 * nothing else: no stored state, no cookie, nothing dismissed. So the window
 * is run here on the real policy list and on a stubbed one, by London days,
 * across the change of the clocks, and the three places that draw it are
 * held to the one function.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const updateLine = await loadTs("lib/legal/updateLine.ts");
const policies = await loadTs("lib/legal/policies.ts");

/** The same function over a policy list whose current version is dated `lastUpdated`. */
async function lineOver(lastUpdated, words = "We've updated our privacy policy.") {
  const { loadTs: loadStubbed } = createLoader({
    stubs: [
      ["server-only", "export {};"],
      [
        "./policies",
        `export const POLICIES = { privacy: { versions: [{ version: 18, lastUpdated: ${JSON.stringify(lastUpdated)}${
          words === null ? "" : `, updateLine: ${JSON.stringify(words)}`
        } }, { version: 17, lastUpdated: "12 November 2026" }] } };\n` +
          "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
      ],
    ],
  });
  return (await loadStubbed("lib/legal/updateLine.ts")).policyUpdateLine;
}

const WORDS =
  "We've updated our privacy policy. It now also covers registers and corrections, requests and messages to the team, work added after a session and reminders after it, anonymous feedback and conduct records.";

describe("what the line says, for version 17", () => {
  test("the current version carries the line's words, and the link goes to what changed", () => {
    const current = policies.currentPolicy("privacy");
    assert.equal(current.version, 17);
    assert.equal(current.updateLine, WORDS);
    assert.equal(updateLine.UPDATE_LINE_LINK, "Read what's changed");
    assert.equal(updateLine.UPDATE_LINE_HREF, "/privacy#whats-changed");
    // The anchor is the policy's own "What's changed in version 17".
    assert.match(read("src/content/legal/privacy/v17.tsx"), /<p id="whats-changed">\s*<strong>What&apos;s changed in version 17:<\/strong>/);
  });

  test("on the version's own date it says so, and fourteen days on it says nothing", () => {
    const from = updateLine.civilDayOf(policies.currentPolicy("privacy").lastUpdated);
    assert.ok(from, "the current version's date cannot be read");
    const [y, m, d] = from.split("-").map(Number);
    const noonOn = (offset) => new Date(Date.UTC(y, m - 1, d + offset, 12));
    assert.deepEqual(updateLine.policyUpdateLine(noonOn(0)), { version: 17, words: WORDS, link: "Read what's changed", href: "/privacy#whats-changed" });
    assert.ok(updateLine.policyUpdateLine(noonOn(13)), "the line is gone before its fourteenth day");
    assert.equal(updateLine.policyUpdateLine(noonOn(14)), null, "the line is still there after fourteen days");
    assert.equal(updateLine.policyUpdateLine(noonOn(-1)), null, "the line is there before the version's date");
  });
});

describe("the window, by London days", () => {
  test("in winter: from midnight on the date to the end of the thirteenth day after it", async () => {
    const line = await lineOver("12 November 2026");
    // November is GMT, so London midnight is UTC midnight.
    assert.equal(line(new Date("2026-11-11T23:59:59Z")), null);
    assert.ok(line(new Date("2026-11-12T00:00:00Z")));
    assert.ok(line(new Date("2026-11-25T23:59:59Z")));
    assert.equal(line(new Date("2026-11-26T00:00:00Z")), null);
  });

  test("in summer the day is London's, not the server's", async () => {
    const line = await lineOver("1 July 2027");
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
    assert.ok(line(new Date("2027-06-30T23:30:00Z")), "the line waits for the UTC day, not London's");
    assert.equal(line(new Date("2027-06-30T22:30:00Z")), null);
    // 14 July is the last day; 23:30 UTC on 14 July is already 15 July in London.
    assert.ok(line(new Date("2027-07-14T22:30:00Z")));
    assert.equal(line(new Date("2027-07-14T23:30:00Z")), null);
  });

  test("across the clocks going back, still fourteen London days", async () => {
    const line = await lineOver("20 October 2027");
    assert.ok(line(new Date("2027-11-02T23:30:00Z")), "2 November, the fourteenth day");
    assert.equal(line(new Date("2027-11-03T00:00:00Z")), null);
  });

  test("a version with no line, or a date that cannot be read, says nothing", async () => {
    assert.equal((await lineOver("12 November 2026", null))(new Date("2026-11-12T12:00:00Z")), null);
    assert.equal((await lineOver("12 November 2026", "   "))(new Date("2026-11-12T12:00:00Z")), null);
    for (const date of ["soon", "12 Nov 2026", "31 February 2027", "2026-11-12", "12 november 2026"]) {
      assert.equal(updateLine.civilDayOf(date), null, date);
      assert.equal((await lineOver(date))(new Date("2026-11-12T12:00:00Z")), null, date);
    }
    assert.equal(updateLine.civilDayOf("12 November 2026"), "2026-11-12");
    assert.equal(updateLine.civilDayOf("1 March 2027"), "2027-03-01");
  });
});

describe("worked out from the date alone, and drawn in the two places", () => {
  test("nothing is stored: no database, no cookie, no browser storage, and the clock is the caller's", () => {
    const source = code("src/lib/legal/updateLine.ts");
    assert.doesNotMatch(source, /firebase|getAdminDb|cookies\(|document\.cookie|localStorage|sessionStorage|Date\.now|new Date\(\)/);
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(imports, ["@/lib/datetime/siteTime", "./policies"]);
  });

  test("Home draws it under the greeting on every form, from the page's own clock, with no client part", () => {
    const page = code("src/app/(app)/dashboard/page.tsx");
    assert.match(page, /const invite = \(\s*<>\s*<PolicyUpdate line=\{policyUpdateLine\(now\)\} \/>/);
    for (const form of ["HomeAdmin", "HomeMember"]) assert.match(page, new RegExp(`<${form}[\\s\\S]*?invite=\\{invite\\}`), `${form} is not handed the line`);
    const line = read("src/app/(app)/dashboard/PolicyUpdate.tsx");
    assert.doesNotMatch(line, /^["']use client["']/m);
    assert.match(code("src/app/(app)/dashboard/PolicyUpdate.tsx"), /if \(!line\) return null;/);
    assert.match(code("src/app/(app)/dashboard/PolicyUpdate.tsx"), /<Link href=\{line\.href\} className=\{homeStyles\.textLink\}>/);
  });

  test("/privacy draws it at the top of the current version only, and is rebuilt often enough for it to come and go", () => {
    const legal = code("src/components/legal/LegalPolicyPage.tsx");
    assert.match(legal, /const updated = !archived && policy === "privacy" && v === meta\.versions\[0\]\.version \? policyUpdateLine\(new Date\(\)\) : null;/);
    assert.match(legal, /\) : updated \? \(\s*<Notice tone="info" role="note" className=\{styles\.updateBanner\}>/);
    assert.match(code("src/app/(public)/privacy/page.tsx"), /^export const revalidate = 3600;$/m);
    // An archived version keeps its own notice, and never the line.
    assert.match(code("src/app/(public)/privacy/v/[version]/page.tsx"), /<LegalPolicyPage policy="privacy" version=\{n\} archived \/>/);
  });
});
