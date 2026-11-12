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
 *
 * Version 18 came inside version 17's 14 days, so for the days the two
 * overlap the line says both (version 17's line, then version 18's
 * `updateLineAdds`), and after version 17's days, version 18's own line until
 * its days end. Run on every day from the day before version 18's date to the
 * day after its last, worked out from the two dates as they stand, so moving
 * version 18's date when it goes live moves the expected days with it.
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
        `export const POLICIES = { privacy: { versions: [{ version: 19, lastUpdated: ${JSON.stringify(lastUpdated)}${
          words === null ? "" : `, updateLine: ${JSON.stringify(words)}`
        } }, { version: 18, lastUpdated: "13 November 2026" }] } };\n` +
          "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
      ],
    ],
  });
  return (await loadStubbed("lib/legal/updateLine.ts")).policyUpdateLine;
}

/** The same function over a policy list of the two versions given, newest first. */
async function lineOverTwo(current, previous) {
  const { loadTs: loadStubbed } = createLoader({
    stubs: [
      ["server-only", "export {};"],
      [
        "./policies",
        `export const POLICIES = { privacy: { versions: [${JSON.stringify(current)}, ${JSON.stringify(previous)}] } };\n` +
          "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
      ],
    ],
  });
  return (await loadStubbed("lib/legal/updateLine.ts")).policyUpdateLine;
}

/** Version 17's line, unchanged. */
const WORDS =
  "We've updated our privacy policy. It now also covers registers and corrections, requests and messages to the team, work added after a session and reminders after it, anonymous feedback and conduct records.";
/** Version 18's own line, once version 17's days are over. */
const V18_WORDS =
  "We've updated our privacy policy. The short note Claude may draft each week now uses your work as it stands after your session, sent or not.";
/** What version 18 adds to version 17's line while both run. */
const V18_ADDS = "and the short note Claude may draft each week now uses your work as it stands after your session, sent or not.";
/** The line while both versions' days run. */
const BOTH =
  "We've updated our privacy policy. It now also covers registers and corrections, requests and messages to the team, work added after a session and reminders after it, anonymous feedback and conduct records, and the short note Claude may draft each week now uses your work as it stands after your session, sent or not.";

const LINK = { link: "Read what's changed", href: "/privacy#whats-changed" };

describe("what the line says, for version 18 inside version 17's days", () => {
  test("the current version carries its own line and what it adds to version 17's, version 17 keeps its line, and the link goes to what changed", () => {
    const current = policies.currentPolicy("privacy");
    assert.equal(current.version, 18);
    assert.equal(current.updateLine, V18_WORDS);
    assert.equal(current.updateLineAdds, V18_ADDS);
    const seventeen = policies.POLICIES.privacy.versions.find((v) => v.version === 17);
    assert.equal(seventeen?.updateLine, WORDS);
    assert.equal(seventeen?.lastUpdated, "12 November 2026");
    assert.equal(updateLine.UPDATE_LINE_LINK, "Read what's changed");
    assert.equal(updateLine.UPDATE_LINE_HREF, "/privacy#whats-changed");
    // The anchor is the policy's own "What's changed in version 18", with version 17's line under it.
    assert.match(read("src/content/legal/privacy/v18.tsx"), /<p id="whats-changed">\s*<strong>What&apos;s changed in version 18:<\/strong>/);
  });

  test("every day from the day before version 18's date to the day after its last: nothing, then both lines, then version 18's alone, then nothing", () => {
    const from18 = updateLine.civilDayOf(policies.currentPolicy("privacy").lastUpdated);
    const from17 = updateLine.civilDayOf(policies.POLICIES.privacy.versions.find((v) => v.version === 17).lastUpdated);
    assert.ok(from18 && from17, "a version's date cannot be read");
    assert.ok(from17 <= from18, "version 18 is dated before version 17");
    const dayAt = (key, offset) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
    };
    const end17 = dayAt(from17, 14);
    const end18 = dayAt(from18, 14);
    const seen = new Set();
    for (let offset = -1; offset <= 15; offset += 1) {
      const day = dayAt(from18, offset);
      // Noon in London, either side of the change of the clocks.
      const at = new Date(`${day}T12:00:00Z`);
      const expected = day < from18 ? null : day < end17 ? BOTH : day < end18 ? V18_WORDS : null;
      const line = updateLine.policyUpdateLine(at);
      assert.deepEqual(line, expected === null ? null : { version: 18, words: expected, ...LINK }, day);
      seen.add(expected);
    }
    // With version 18 dated 13 November, both run to 25 November and version 18 alone on 26 November.
    assert.ok(seen.has(null) && seen.has(V18_WORDS), "the run never reached version 18's own line, or never ended");
    if (from18 < end17) assert.ok(seen.has(BOTH), "the line never said both while version 17's days ran");
  });
});

describe("two versions at once, on a stubbed list", () => {
  const v18 = { version: 18, lastUpdated: "13 November 2026", updateLine: "Version 18 changed things." };
  const v19 = { version: 19, lastUpdated: "20 November 2026", updateLine: "Version 19 changed one thing.", updateLineAdds: "and version 19 one more." };

  test("inside both: the earlier line, its full stop for a comma, and the later clause; after the earlier days: the later line alone", async () => {
    const line = await lineOverTwo(v19, v18);
    assert.equal(line(new Date("2026-11-19T12:00:00Z")), null, "the line is there before the current version's date");
    assert.equal(line(new Date("2026-11-20T12:00:00Z")).words, "Version 18 changed things, and version 19 one more.");
    // 26 November is version 18's fourteenth day, and 27 November the first after it.
    assert.equal(line(new Date("2026-11-26T23:59:59Z")).words, "Version 18 changed things, and version 19 one more.");
    assert.equal(line(new Date("2026-11-27T00:00:00Z")).words, "Version 19 changed one thing.");
    assert.equal(line(new Date("2026-12-03T12:00:00Z")).words, "Version 19 changed one thing.");
    assert.equal(line(new Date("2026-12-04T00:00:00Z")), null);
    assert.equal(line(new Date("2026-11-20T12:00:00Z")).version, 19);
  });

  test("a current version that adds nothing, or an earlier one with no line or no readable date, says the current line alone", async () => {
    const at = new Date("2026-11-21T12:00:00Z");
    const { updateLineAdds, ...noAdds } = v19;
    assert.ok(updateLineAdds);
    assert.equal((await lineOverTwo(noAdds, v18))(at).words, "Version 19 changed one thing.");
    assert.equal((await lineOverTwo(v19, { version: 18, lastUpdated: "13 November 2026" }))(at).words, "Version 19 changed one thing.");
    assert.equal((await lineOverTwo(v19, { ...v18, lastUpdated: "soon" }))(at).words, "Version 19 changed one thing.");
    // An earlier version dated after the current one is not inside its days on the current one's first day.
    assert.equal((await lineOverTwo(v19, { ...v18, lastUpdated: "22 November 2026" }))(at).words, "Version 19 changed one thing.");
    // Nothing joins once the current version's own days are over, whatever the earlier one's.
    assert.equal((await lineOverTwo(v19, { ...v18, lastUpdated: "1 December 2026" }))(new Date("2026-12-05T12:00:00Z")), null);
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
