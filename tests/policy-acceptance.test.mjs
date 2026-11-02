/**
 * WHO IS SENT TO ACCEPT THE POLICIES (`needsPolicyAcceptance` in
 * `src/lib/legal/acceptance.ts`), on a table of stored agreements.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Privacy version 15 is the last version anybody is asked to accept. So the
 * accept page is for an agreement that is missing or cannot be read, one to a
 * privacy version below 15, one to an older Terms of Use, and one naming a
 * version the site has never served; never for an agreement to 15 or any
 * later privacy version the site serves. The table runs against the real
 * policy list, and again against a list where privacy has moved on to 17 and
 * the terms to 2, so "later versions are told, not asked" is held before a
 * later version exists. Where the helper is used (the two gated layouts and
 * the accept page) is held by `tests/privacy-policy.test.mjs`, section 3.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const acceptance = await loadTs("lib/legal/acceptance.ts");
const policies = await loadTs("lib/legal/policies.ts");

/** The helper again, over a policy list where privacy is at 17 and the terms at 2. */
const { loadTs: loadLater } = createLoader({
  stubs: [
    ["server-only", "export {};"],
    [
      "./policies",
      "export const POLICIES = { terms: { versions: [{ version: 2, lastUpdated: \"1 March 2027\" }, { version: 1, lastUpdated: \"25 May 2026\" }] }, " +
        "privacy: { versions: [{ version: 17, lastUpdated: \"1 March 2027\" }, { version: 16, lastUpdated: \"1 January 2027\" }, { version: 15, lastUpdated: \"31 October 2026\" }] } };\n" +
        "export function currentPolicy(key) { return POLICIES[key].versions[0]; }\n" +
        "export const CURRENT_POLICY_VERSION = \"terms.2+privacy.17\";",
    ],
  ],
});
const later = await loadLater("lib/legal/acceptance.ts");

/** Every stored value nobody can read: asked, whatever the policy list says. */
const UNREADABLE = [
  undefined,
  null,
  "",
  15,
  { terms: 1, privacy: 15 },
  ["terms.1", "privacy.15"],
  // Legacy shapes from before the version string had two parts.
  "2026-01-01",
  "v1",
  "privacy.15",
  "terms.1",
  // Malformed parts.
  "terms.1+privacy.",
  "terms.1+privacy.15x",
  "terms.1+privacy.015",
  "terms.0+privacy.15",
  "terms.1+privacy.0",
  "terms.1 + privacy.15",
  " terms.1+privacy.15",
  "Terms.1+Privacy.15",
  "terms.1+privacy.15+privacy.16",
  "terms.1+terms.1",
  "privacy.15+privacy.15",
  "terms.1+privacy.15+",
  "terms.1+privacy.99999",
  `terms.1+privacy.15${"0".repeat(80)}`,
];

describe("needsPolicyAcceptance, against the policies the site serves today", () => {
  test("the site serves privacy 15 and terms 1, and 15 is the last version anybody is asked to accept", () => {
    assert.equal(acceptance.LAST_PRIVACY_VERSION_ASKED, 15);
    assert.equal(policies.currentPolicy("privacy").version, 15);
    assert.equal(policies.currentPolicy("terms").version, 1);
    assert.equal(policies.CURRENT_POLICY_VERSION, "terms.1+privacy.15");
  });

  test("what accepting stamps is never asked about again", () => {
    assert.equal(acceptance.needsPolicyAcceptance(policies.CURRENT_POLICY_VERSION), false);
  });

  const TABLE = [
    // An agreement to 15 with the current terms, in either order.
    ["terms.1+privacy.15", false],
    ["privacy.15+terms.1", false],
    // Every version before 15 is asked once more.
    ...Array.from({ length: 14 }, (_, i) => [`terms.1+privacy.${i + 1}`, true]),
    ["privacy.14+terms.1", true],
    // A version the site has never served is no agreement to anything.
    ["terms.1+privacy.16", true],
    ["terms.1+privacy.99", true],
    ["terms.2+privacy.15", true],
    ["terms.9+privacy.99", true],
    ...UNREADABLE.map((value) => [value, true]),
  ];

  for (const [stored, asked] of TABLE) {
    test(`${JSON.stringify(stored) ?? "undefined"} is ${asked ? "asked" : "not asked"}`, () => {
      assert.equal(acceptance.needsPolicyAcceptance(stored), asked);
    });
  }
});

describe("needsPolicyAcceptance, once privacy has moved on to 17 and the terms to 2", () => {
  const TABLE = [
    // Any privacy version from 15 to the one served, with the current terms: told, not asked.
    ["terms.2+privacy.15", false],
    ["terms.2+privacy.16", false],
    ["terms.2+privacy.17", false],
    ["privacy.16+terms.2", false],
    // An older Terms of Use is asked, whichever privacy version came with it.
    ["terms.1+privacy.15", true],
    ["terms.1+privacy.17", true],
    // Before 15 is still asked.
    ["terms.2+privacy.14", true],
    ["terms.2+privacy.1", true],
    // Never served.
    ["terms.2+privacy.18", true],
    ["terms.3+privacy.17", true],
    ...UNREADABLE.map((value) => [value, true]),
  ];

  for (const [stored, asked] of TABLE) {
    test(`${JSON.stringify(stored) ?? "undefined"} is ${asked ? "asked" : "not asked"}`, () => {
      assert.equal(later.needsPolicyAcceptance(stored), asked);
    });
  }

  test("the last version asked does not move when a later version is served", () => {
    assert.equal(later.LAST_PRIVACY_VERSION_ASKED, 15);
  });
});

describe("reading a stored agreement", () => {
  test("both parts, in either order, as numbers", () => {
    assert.deepEqual(acceptance.agreementIn("terms.1+privacy.15"), { terms: 1, privacy: 15 });
    assert.deepEqual(acceptance.agreementIn("privacy.9+terms.3"), { terms: 3, privacy: 9 });
    assert.deepEqual(acceptance.agreementIn("terms.1+privacy.1234"), { terms: 1, privacy: 1234 });
  });

  test("anything else is unreadable", () => {
    for (const value of UNREADABLE) assert.equal(acceptance.agreementIn(value), null, JSON.stringify(value) ?? "undefined");
  });
});

describe("the helper is safe anywhere", () => {
  test("pure: no server-only import, no read, no clock", () => {
    const source = readFileSync(join(REPO_ROOT, "src", "lib", "legal", "acceptance.ts"), "utf8");
    assert.doesNotMatch(source, /["']server-only["']/);
    assert.doesNotMatch(source, /firebase|getAdminDb|fetch\(|Date\.now|new Date\(/);
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(imports, ["./policies"], "the helper reads something other than the policy list");
  });
});
