/**
 * The current privacy policy, the frozen versions behind it, and the
 * re-consent gate.
 *
 * Run with `npm test`.
 *
 * The current version is v15: the whole policy arranged by kind of use, with
 * a summary at the top, and the last version anybody is asked to accept. It
 * says again, in fewer words, everything v14 said that is still true, takes
 * back some of v14's promises (facilitators never see anything of a survey,
 * notes are admins' alone, not coming is recorded nowhere, a tick never
 * counts, an unsent answer is never read, a conduct flag never shows where
 * applications are scored, sign-ups are seen by admins and SU-recognised
 * committee only), and says new uses with "may" where the code is not built
 * yet. The outside services moved to /privacy/services
 * (`src/content/legal/services.ts`, held in §5).
 *
 * Each section below holds v15's own sentence for a subject to the code that
 * makes it true, beside the code checks earlier versions' sentences were held
 * to. Where v15 leaves a detail out (which screen or tab shows something, the
 * names of jobs and fields, exact counts), the section says so in a comment
 * and its code check stays, so a later change that v15 would allow still
 * trips the check and makes somebody read the policy. Where v15's sentence is
 * not what the code does, the test holds the code and says the sentence is
 * reported. §2h onwards also keep the record of which version first made each
 * promise, held in the frozen files themselves.
 *
 * Every version behind the current one is frozen byte for byte (§1b): v1 to
 * v14. Editing an accepted version changes what somebody sees at the archive
 * URL for the wording they agreed to, without anybody being asked, so new
 * wording goes in a new file, every time. From v15 a new version is told,
 * not asked (`needsPolicyAcceptance`, §3), which makes the freeze matter
 * more, not less: the archive is the only record of what people accepted.
 *
 * A policy version is a promise, and the four ways it can quietly become a
 * lie are all pinned here:
 *
 *  1. **The policy stops being exhaustive.** The policy is the one place the
 *     platform tells an applicant or a member what it holds about them (from
 *     v15, under Applying to a programme, Taking part, Your work and the
 *     sections after them). A later PR that adds a category and forgets the
 *     policy has made the page wrong, so every category the courses hub
 *     holds is checked for by name (`MUST_NAME`, §2). These are checks over
 *     the policy's own words, which cannot judge wording (that is the
 *     owner's), only that the subject is addressed at all.
 *  2. **An archived version is edited in place.** Every published version
 *     stays readable at /privacy/v/N, and the only honest way to change a
 *     sentence is a new version. §1b holds EVERY version behind the current
 *     one to a sha256 of its bytes, so any edit to any of them fails here
 *     rather than sitting on an archive page nobody rereads. The digest list
 *     and POLICIES are checked against each other in both directions, which
 *     means publishing v5 cannot happen without freezing v4 in the same
 *     change: that is exactly the moment somebody is meant to stop editing
 *     it. The two phrases from the edit that already happened are pinned
 *     underneath as the named case, because a digest failure only says "this
 *     file changed" and the named case says what changed last time.
 *  3. **A pointer goes on naming last version's file.** Prose in `src` and
 *     `docs` that sends a reader to a version file is how the previous
 *     mistake was invited: a comment saying "keep this in step with v3.tsx"
 *     is an instruction to edit accepted text. §1c walks both trees and fails
 *     any pointer that names a version other than the current one.
 *  4. **The gate stops firing, or fires again.** Accepting version 15 is the
 *     last time anybody is asked: `needsPolicyAcceptance` asks an agreement
 *     older than privacy v15 or the current terms, and nothing else, so a
 *     later privacy version is told rather than asked. The gate has to be on
 *     the two layouts every authed page passes through, never at sign-in,
 *     never inside a view-as session (§3).
 *
 * The registry check is the fifth: a version listed in POLICIES with no
 * content component is a 404 or a crash on its archive URL, and the version
 * history page links to every one of them. It runs over every policy in
 * POLICIES, not privacy alone, so a second terms version is covered the day
 * it lands rather than the day somebody remembers.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;
const STUBS = new Map([["server-only", "export {};"]]);

function resolveLocalTs(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const graph = new Map();
let tsc = null;

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function transpileToDataUrl(file) {
  const cached = graph.get(file);
  if (cached) return cached;
  const { outputText } = tsc.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: tsc.ScriptTarget.ES2022,
      module: tsc.ModuleKind.ESNext,
      // SPECIFIER reads every `from "…"` in the output, so a doc comment such
      // as `"6pm" from "18:00"` would be taken for an import. Comments carry
      // nothing a module runs.
      removeComments: true,
    },
  });
  const rewrites = new Map();
  for (const [, , , specifier] of outputText.matchAll(SPECIFIER)) {
    if (rewrites.has(specifier)) continue;
    if (STUBS.has(specifier)) {
      rewrites.set(specifier, dataUrl(STUBS.get(specifier)));
    } else if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const target = resolveLocalTs(specifier, file);
      if (!target) throw new Error(`cannot resolve "${specifier}" imported from ${file}`);
      rewrites.set(specifier, await transpileToDataUrl(target));
    } else {
      rewrites.set(specifier, import.meta.resolve(specifier));
    }
  }
  const rewritten = outputText.replace(
    SPECIFIER,
    (whole, prefix, quote, specifier) =>
      rewrites.has(specifier)
        ? `${prefix}${quote}${rewrites.get(specifier)}${quote}`
        : whole,
  );
  const url = dataUrl(rewritten);
  graph.set(file, url);
  return url;
}

async function loadTs(relativePath) {
  if (!tsc) tsc = (await import("typescript")).default;
  return import(await transpileToDataUrl(join(SRC, relativePath)));
}

const { CURRENT_POLICY_VERSION, POLICIES, currentPolicy } =
  await loadTs("lib/legal/policies.ts");
/** The notification grid's own table of defaults, read by §2c and §2d. */
const notificationPrefs = await loadTs("lib/firestore/notifications.ts");

const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const CURRENT = read("src/content/legal/privacy/v15.tsx");
/**
 * The current policy with every run of whitespace collapsed to one space. The
 * copy is JSX, so a sentence is wrapped and indented across several lines and
 * no pattern written as a sentence would ever match the raw source. Every
 * content check below runs against this, because v15 is the text the site
 * serves at /privacy.
 */
const CURRENT_FLAT = CURRENT.replace(/\s+/g, " ");
/** v14, frozen: read by §1b, and by the v15 checks, which prove what v15 takes back is still in the words people accepted. */
const V14_FLAT = read("src/content/legal/privacy/v14.tsx").replace(/\s+/g, " ");
/** v13, frozen: read by §2n, which proves the required-questions sentences are not in it and "Every question can be skipped." is. */
const V13_FLAT = read("src/content/legal/privacy/v13.tsx").replace(/\s+/g, " ");
/** v12, frozen: read by §2m, which proves the coursework sentences are not in it and the promise is. */
const V12_FLAT = read("src/content/legal/privacy/v12.tsx").replace(/\s+/g, " ");
/** v11, frozen: read by §2l, which proves the two new notes are not in it. */
const V11_FLAT = read("src/content/legal/privacy/v11.tsx").replace(/\s+/g, " ");
/** v10, frozen: read by §2k, which proves the invitation's note is not in it. */
const V10_FLAT = read("src/content/legal/privacy/v10.tsx").replace(/\s+/g, " ");
/** v9, frozen: read by §2j, which proves confirming a place is not in it. */
const V9_FLAT = read("src/content/legal/privacy/v9.tsx").replace(/\s+/g, " ");
/** v8, frozen: read by §2i, which proves the whole term's sentences are not in it. */
const V8_FLAT = read("src/content/legal/privacy/v8.tsx").replace(/\s+/g, " ");
/** v7, frozen: read by §2h, which proves the second reader's sentences are not in it. */
const V7_FLAT = read("src/content/legal/privacy/v7.tsx").replace(/\s+/g, " ");
/** v6, frozen: read by §1b and by §2g, which proves the new sentences are not in it. */
const V6 = read("src/content/legal/privacy/v6.tsx");
const V6_FLAT = V6.replace(/\s+/g, " ");
/** v5, frozen: read by §1b and by §2d, which proves the new sentences are not in it. */
const V5 = read("src/content/legal/privacy/v5.tsx");
const V5_FLAT = V5.replace(/\s+/g, " ");
/** v4, frozen: read by §1b and by §2c, which proves the new sentences are not in it. */
const V4 = read("src/content/legal/privacy/v4.tsx");
const V4_FLAT = V4.replace(/\s+/g, " ");
/** v3, read only by §1b, which proves it was left as the owner accepted it. */
const V3 = read("src/content/legal/privacy/v3.tsx");
const V3_FLAT = V3.replace(/\s+/g, " ");
const REGISTRY = read("src/content/legal/registry.tsx");
const AUTHED_LAYOUT = read("src/app/(app)/layout.tsx");

// ---------------------------------------------------------------------------
// §1 The version moved, and every version still renders
// ---------------------------------------------------------------------------

/**
 * A policy key ("privacy") to the prefix its content components carry
 * ("PrivacyContentV3"). Derived rather than listed, so the checks below run
 * over whatever is in POLICIES: naming only privacy here is how the terms
 * side would go unchecked the day it gains a second version.
 */
const componentPrefix = (key) => `${key[0].toUpperCase()}${key.slice(1)}Content`;

/** Every policy key, so no loop below has to name one. */
const POLICY_KEYS = Object.keys(POLICIES);

describe("policy versions", () => {
  test("privacy v15 is current, and the combined version string moved with it", () => {
    assert.equal(currentPolicy("privacy").version, 15);
    assert.equal(CURRENT_POLICY_VERSION, "terms.1+privacy.15");
  });

  test("privacy v15 is dated the day its words last changed", () => {
    const fifteen = POLICIES.privacy.versions.find((v) => v.version === 15);
    assert.equal(fifteen?.lastUpdated, "31 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 15).length, 1);
    const fourteen = POLICIES.privacy.versions.find((v) => v.version === 14);
    assert.equal(fourteen?.lastUpdated, "30 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 14).length, 1);
    const thirteen = POLICIES.privacy.versions.find((v) => v.version === 13);
    assert.equal(thirteen?.lastUpdated, "30 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 13).length, 1);
    const twelve = POLICIES.privacy.versions.find((v) => v.version === 12);
    assert.equal(twelve?.lastUpdated, "29 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 12).length, 1);
    const eleven = POLICIES.privacy.versions.find((v) => v.version === 11);
    assert.equal(eleven?.lastUpdated, "28 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 11).length, 1);
    const ten = POLICIES.privacy.versions.find((v) => v.version === 10);
    assert.equal(ten?.lastUpdated, "28 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 10).length, 1);
    const nine = POLICIES.privacy.versions.find((v) => v.version === 9);
    assert.equal(nine?.lastUpdated, "28 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 9).length, 1);
    const eight = POLICIES.privacy.versions.find((v) => v.version === 8);
    assert.equal(eight?.lastUpdated, "28 October 2026");
    assert.equal(POLICIES.privacy.versions.filter((v) => v.version === 8).length, 1);
  });

  test("versions are newest first, which entry [0] depends on", () => {
    for (const key of POLICY_KEYS) {
      const versions = POLICIES[key].versions.map((v) => v.version);
      assert.deepEqual(
        versions,
        [...versions].sort((a, b) => b - a),
        `POLICIES.${key}.versions is not newest first, so currentPolicy("${key}") returns the wrong one`,
      );
    }
  });

  test("every listed version has a content component, so no archive URL is dead", () => {
    // /privacy/versions links every entry in POLICIES and
    // /privacy/v/[version] renders it out of LEGAL_CONTENT. A version listed
    // in one and missing from the other is a broken link on a legal page.
    for (const key of POLICY_KEYS) {
      for (const { version } of POLICIES[key].versions) {
        assert.match(
          REGISTRY,
          new RegExp(`\\b${version}:\\s*${componentPrefix(key)}V${version}\\b`),
          `${key} v${version} is listed in POLICIES but not mapped in registry.tsx`,
        );
        assert.ok(
          existsSync(join(SRC, `content/legal/${key}/v${version}.tsx`)),
          `src/content/legal/${key}/v${version}.tsx is missing`,
        );
      }
    }
  });

  test("every version file on disk is listed in POLICIES", () => {
    // The other direction of the check above. A version file that exists and
    // is not listed has no archive URL and no line on /privacy/versions, so
    // it renders nowhere and reads as a version somebody dropped half way
    // through publishing. Both lists are read off the filesystem and off
    // POLICIES rather than written down here, so adding v5 needs no edit, and
    // it runs per POLICY rather than over privacy alone: a `terms/v2.tsx`
    // dropped in without an entry used to pass this unread.
    for (const key of POLICY_KEYS) {
      const onDisk = readdirSync(join(SRC, "content/legal", key))
        .map((name) => /^v(\d+)\.tsx$/.exec(name))
        .filter(Boolean)
        .map((match) => Number(match[1]))
        .sort((a, b) => b - a);
      const listed = POLICIES[key].versions.map((v) => v.version);
      assert.deepEqual(
        onDisk,
        listed,
        `src/content/legal/${key} holds a different set of versions from ` +
          `POLICIES.${key}.versions. Add the missing entry, or delete the ` +
          "file: a version that is only in one of the two places is either a " +
          "dead file or a dead link on a legal page.",
      );
    }
  });

  test("an archived version is its own file, never a shim over the current one", () => {
    // An archived version must render as it did the day it was published, so
    // no older file may import a newer one to share markup. Derived from
    // POLICIES rather than a written list of v1, v2, v3: a written list stops
    // covering the version it was written before the moment v5 ships.
    for (const key of POLICY_KEYS) {
      const [current, ...archived] = POLICIES[key].versions;
      for (const { version } of archived) {
        const source = read(`src/content/legal/${key}/v${version}.tsx`);
        assert.ok(
          !source.includes(`./v${current.version}`) &&
            !source.includes(`${componentPrefix(key)}V${current.version}`),
          `${key}/v${version}.tsx must not reach into v${current.version}`,
        );
      }
      for (const { version } of POLICIES[key].versions) {
        assert.match(
          read(`src/content/legal/${key}/v${version}.tsx`),
          new RegExp(`export default function ${componentPrefix(key)}`),
          `${key}/v${version}.tsx must export its own content component`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §1b Archived versions are frozen, byte for byte
// ---------------------------------------------------------------------------

/**
 * Every published version that is no longer current, with a sha256 of the file
 * as it is accepted and one line saying whose agreement it records.
 *
 * ## Why a digest and not a list of sentences
 *
 * The failure this closes is "a version the owner accepted was edited in
 * place", and the shape it took was one sentence added to v3 while v3 was
 * live. Pinning that sentence catches that sentence. It does not catch the
 * next one, or a word changed in v1, and the whole point of an archive is
 * that a reader can go back to what they agreed to and find it there. A
 * digest over the file's bytes is the only check that covers every edit,
 * including the ones nobody thought of when this was written.
 *
 * ## Both directions, and what that buys
 *
 * The keys here and the non-current entries in POLICIES are compared as sets.
 * So publishing v5 fails this file until v4's digest is added, and adding a
 * digest for a version that is still current, or for a file that is not
 * there, fails too. That is deliberate: the moment a version stops being
 * current is exactly the moment people stop being asked about changes to it,
 * and it is therefore the moment to nail it down. Freezing it is one command
 * (`shasum -a 256 src/content/legal/<policy>/v<N>.tsx`) at the one point in
 * the process where somebody is already thinking about versions.
 *
 * ## When a digest legitimately changes
 *
 * Almost never, and never for wording. The only honest reasons are changes
 * that cannot alter what the page says (a rename of an imported component, a
 * lint rule reformatting the file). Update the digest in the same commit as
 * that change, say so in the commit message, and check the rendered copy is
 * identical. Anything that changes a word needs a new version instead.
 */
const FROZEN_VERSIONS = new Map([
  [
    "privacy/v14",
    {
      sha256: "fc6dbf494ef33d2e2c8e44a5e7d73949832708d83ee3061dc4a9b1bd56340e67",
      why: "required survey questions, current from 30 October 2026 until v15 replaced it; the wording members accepted while it still promised that facilitators see nothing of a survey, that notes are admins' alone, that not coming is recorded nowhere and that a tick never counts, frozen when v15 took those back and asked everybody one last time rather than editing it in place",
    },
  ],
  [
    "privacy/v13",
    {
      sha256: "a33cb4e40d95b6309a0ce8986b1788f65804d9ca5643b095d94b4b6ce9e33c9c",
      why: "Claude and Pangram on coursework and the notes admins keep, current from 30 October 2026 until v14 replaced it; the wording members accepted while it still said every survey question could be skipped, frozen when v14 made survey questions required rather than editing it in place",
    },
  ],
  [
    "privacy/v12",
    {
      sha256: "eeaafb72edf42ae7b6a686207b4665bbb7cf42d523ccf69a21cebda76ee2e733",
      why: "the version of the notes in a group's email and in an ask, current from 29 October 2026 until v13 replaced it; the wording members accepted while it still promised that nothing written in a course is used outside its programme, frozen when v13 took that promise back from its own agreement on rather than editing it in place",
    },
  ],
  [
    "privacy/v11",
    {
      sha256: "32d25e4940a0e3e0993fcd964b35e9b5fccf6b0e2066dde7855a13e386d77136",
      why: "the invitation note's version, current from 28 October 2026 until v12 replaced it; the wording members accepted when Claude's words could first reach somebody, frozen when two more notes took back its \"the one place\" rather than editing it in place",
    },
  ],
  [
    "privacy/v1",
    {
      sha256: "70e7ca0d3a43e143f2c8a6ded2d8f73d471de524bbac070c38ab81a7e649ec6d",
      why: "the first privacy policy the site published (25 May 2026); every account created before v2 accepted these exact words and can still read them at /privacy/v/1",
    },
  ],
  [
    "privacy/v2",
    {
      sha256: "3384da6ed2ed18a181cf887bb2f86a142e90da99530a03ca1a2a54e736e81cfc",
      why: "live from 29 June 2026 until v3 replaced it, so it is the wording anyone who joined in that window agreed to",
    },
  ],
  [
    "privacy/v3",
    {
      sha256: "7f0ca1ddc292b15311252c8375483e625df4c70c4ae7fcd23025b38e82464adb",
      why: "the version the owner accepted, and the one the worksheet sentence was edited into in place; this digest is the restored, accepted text and the reason the whole file exists",
    },
  ],
  [
    "privacy/v4",
    {
      sha256: "f18edb220a2ce52b873f70ebdf16f79a257e720a78634512191be371eaf0f708",
      why: "live from the 6 September 2026 release until v5 replaced it the next day; the wording every member re-accepted at that sign-in, frozen when the notification grid moved the version rather than editing it in place",
    },
  ],
  [
    "privacy/v5",
    {
      sha256: "8dc0f2b4de657ad5fb00009b66957880c5822d285db08405f63f9446f4b00684",
      why: "the notification grid's version, current from 7 September 2026 until v6 replaced it; the wording every member accepted at sign-in in that time, frozen when the application form moved the version rather than editing the names sentence in place",
    },
  ],
  [
    "privacy/v6",
    {
      sha256: "752d84f1765d1f0353fba8169011913e40d194b33f1be4755f1c3f550f5178a4",
      why: "the application form's version, current from 7 October 2026 until v7 replaced it; the wording every member and every applicant accepted in that time, frozen when the course hub moved the version rather than editing the certificates promise in place",
    },
  ],
  [
    "privacy/v10",
    {
      sha256: "e4ce29daa6b37f328eadca0ca4276ccf6ec189539164109f988b3fe673f22add",
      why: "the confirming-a-place version, current from 28 October 2026 until v11 replaced it; the wording members accepted when a place could be confirmed by a day, frozen when a personal note with an invitation moved the version rather than adding the paragraph in place",
    },
  ],
  [
    "privacy/v9",
    {
      sha256: "1f2333cd3b43a5c3293ee70de0c345fef388e5c5cb36b5007d14dee52bf7474f",
      why: "the whole term's version, current from 28 October 2026 until v10 replaced it; the wording members accepted when Claude began planning the intake, frozen when confirming a place by a day moved the version rather than adding the paragraph in place",
    },
  ],
  [
    "privacy/v8",
    {
      sha256: "c37a9fc88375a76ac6dc6d4f60238b6cebeaafde236a259ea667235e7bc81f10",
      why: "the second reader's version, current from 28 October 2026 until v9 replaced it; the wording members accepted when Claude and Pangram began reading applications, frozen when planning the whole term at once moved the version rather than adding the sentences in place",
    },
  ],
  [
    "privacy/v7",
    {
      sha256: "063bebb317d17094091103942702d6cfdb037c968c6ec10e11f10f48191ce70b",
      why: "the course hub's version, current from 27 October 2026 until v8 replaced it; the wording members accepted while the course hub went live, frozen when the second reader of applications moved the version rather than adding two processors in place",
    },
  ],
]);

describe("archived versions are frozen", () => {
  const archived = POLICY_KEYS.flatMap((key) =>
    POLICIES[key].versions.slice(1).map(({ version }) => `${key}/v${version}`),
  );

  test("the digest list and POLICIES agree on which versions are archived", () => {
    assert.deepEqual(
      [...FROZEN_VERSIONS.keys()].sort(),
      [...archived].sort(),
      "FROZEN_VERSIONS in this file and POLICIES disagree about which versions " +
        "are behind the current one. Publishing a version freezes the one it " +
        "replaces: run `shasum -a 256 src/content/legal/<policy>/v<N>.tsx`, add " +
        "the entry with one line saying whose agreement that file records, and " +
        "leave the file alone from then on. Removing an entry is only right if " +
        "the version is being unpublished from POLICIES as well.",
    );
  });

  test("each archived file still hashes to the digest recorded here", () => {
    for (const [key, { sha256, why }] of FROZEN_VERSIONS) {
      const file = join(SRC, "content/legal", `${key}.tsx`);
      assert.ok(
        existsSync(file),
        `src/content/legal/${key}.tsx is recorded as frozen but is not on disk. ` +
          "An archived version still renders at its own URL; deleting the file " +
          "breaks that page and the version history that links to it.",
      );
      assert.ok(
        typeof why === "string" && why.length > 30,
        `${key} is frozen with no reason a reader can weigh`,
      );
      assert.equal(
        createHash("sha256").update(readFileSync(file)).digest("hex"),
        sha256,
        `src/content/legal/${key}.tsx has changed since it was frozen. It is a ` +
          "version somebody already accepted, so editing it changes what they " +
          "see at its archive URL WITHOUT moving CURRENT_POLICY_VERSION, which " +
          "means nobody is ever asked about the change. Put the new wording in a " +
          "new version file. If the edit genuinely cannot alter the rendered " +
          "copy (a rename, a reformat), update the digest in the same commit and " +
          "say why there.",
      );
    }
  });
});

/**
 * The named case underneath the digest guard.
 *
 * The worksheet sentence went into v3 first, while v3 was the current version
 * and the owner had already accepted it. Two things were wrong with that, and
 * neither is visible from the page: the archive URL for the wording somebody
 * agreed to now showed a sentence they never saw, and because the version
 * number did not move, the re-consent gate never asked anybody about it. The
 * sentence lives in v4 now.
 *
 * The digest above would already fail if this came back, so these two tests
 * are not the guard. They are the message: a digest mismatch says only "this
 * file changed", and somebody reading that failure for the first time needs
 * to know what changed last time and why it was the wrong move.
 */
describe("v3 is archived, and archived means untouched", () => {
  test("does not carry the worksheet sentence, which belongs to v4", () => {
    assert.ok(
      !/when a worksheet is sent to you/i.test(V3_FLAT),
      "the worksheet sentence is back in v3. v3 is text the owner accepted; " +
        "adding a sentence to it changes what /privacy/v/3 shows without " +
        "moving CURRENT_POLICY_VERSION, so no member is ever asked to accept " +
        "it. Put new wording in a new version file instead.",
    );
    assert.ok(
      !/we never record keystrokes or pasting/i.test(V3_FLAT),
      "v3 must not carry the worksheet promise either: see above.",
    );
  });

  test("still carries its own OWNER TO CONFIRM block", () => {
    // The block is the record of which sentences in v3 state policy rather
    // than describe code. It stays on v3 for as long as v3 renders, because
    // an archived version still has to be readable as the thing the owner
    // was asked to confirm.
    assert.match(V3, /OWNER TO CONFIRM/);
  });
});

// ---------------------------------------------------------------------------
// §1c Pointers name the version that is current
// ---------------------------------------------------------------------------

/**
 * How the edit in §1b was invited, and the check that stops the invitation
 * being reissued.
 *
 * `ApplicationPrivacyNotice.tsx` carried a comment reading "it must stay
 * consistent with the current privacy policy (src/content/legal/privacy/
 * v3.tsx). If one changes, change both." By the time somebody read it, v3 was
 * no longer the one to change, so the comment was an instruction to edit
 * accepted text: the exact move this whole file exists to prevent, written
 * down as house style. `docs/worksheets.md` carried the same pointer, sending
 * the owner to confirm a sentence in the one file that no longer contains it.
 *
 * A pointer like that rots on a schedule nobody controls, so it is checked
 * rather than remembered. Every mention of a version FILE across `src` and
 * `docs` has to name the current version of its policy. Archive URLs
 * (/privacy/v/3) are a different thing and deliberately do not match: those
 * are meant to name an old version, which is what an archive is for.
 *
 * The exemption below is a named list rather than a pattern, so widening it is
 * a decision somebody made in writing.
 */
const POINTER = /(?:src\/)?content\/legal\/([a-z]+)\/v(\d+)(?:\.tsx)?/g;

/** The trees a pointer can hide in: shipping code and the docs that steer it. */
const POINTER_ROOTS = ["src", "docs"];

/** Text this walk can read. Anything else in those trees is not prose. */
const POINTER_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".md"];

const POINTER_EXEMPT = new Map([
  [
    "src/content/legal/registry.tsx",
    "the registry is the one file that MUST name every version, current or not: it maps each to the component that renders its archive URL. Its imports are relative (`./privacy/v1`) and so fall outside the pattern anyway, but the exemption is written down rather than left resting on that accident",
  ],
]);

function textFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) textFilesUnder(full, out);
    else if (POINTER_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

describe("pointers to a version file", () => {
  const hits = [];
  for (const root of POINTER_ROOTS) {
    for (const file of textFilesUnder(join(REPO_ROOT, root))) {
      const relative = file.slice(REPO_ROOT.length + 1).split(sep).join("/");
      if (POINTER_EXEMPT.has(relative)) continue;
      for (const match of readFileSync(file, "utf8").matchAll(POINTER)) {
        hits.push({
          relative,
          policy: match[1],
          version: Number(match[2]),
          text: match[0],
        });
      }
    }
  }

  test("the walk found pointers at all, so the check below is not vacuous", () => {
    assert.ok(
      hits.length > 0,
      "no pointer to a policy version file was found anywhere in src or docs. " +
        "Either every one was removed, or the pattern stopped matching the way " +
        "they are written; check the pattern before trusting the green.",
    );
  });

  test("every exemption still exists and carries a reason", () => {
    for (const [file, why] of POINTER_EXEMPT) {
      assert.ok(
        existsSync(join(REPO_ROOT, ...file.split("/"))),
        `${file} is exempt from the pointer check but no longer exists. Drop the entry.`,
      );
      assert.ok(
        typeof why === "string" && why.length > 30,
        `${file} is exempt with no reason a reader can weigh.`,
      );
    }
  });

  test("no pointer in src or docs names a superseded version", () => {
    const stale = hits.filter(
      (hit) =>
        POLICIES[hit.policy] &&
        hit.version !== POLICIES[hit.policy].versions[0].version,
    );
    assert.deepEqual(
      stale.map((hit) => `${hit.relative}: ${hit.text}`),
      [],
      "these pointers send a reader to a version that is no longer current. An " +
        "archived version is text somebody already accepted, so a comment " +
        "telling the next engineer to keep it in step with the product is an " +
        "instruction to change what an archive URL shows without anybody being " +
        "asked. Point them at the current version file instead, and move the " +
        "pointer again the next time a version ships.",
    );
  });

  test("every pointer names a policy that exists", () => {
    const unknown = hits.filter((hit) => !POLICIES[hit.policy]);
    assert.deepEqual(
      unknown.map((hit) => `${hit.relative}: ${hit.text}`),
      [],
      "these pointers name a policy directory that POLICIES does not know " +
        "about, so they lead nowhere. Fix the path, or add the policy.",
    );
  });
});

// ---------------------------------------------------------------------------
// §2 The courses section is exhaustive
// ---------------------------------------------------------------------------

/**
 * Every category the courses hub holds about somebody who applies or takes
 * part, with the words v15 says it in. Until v15 most of these sat in one
 * "Courses and programmes" section; v15 spreads them over its sections by
 * kind of use (Applying to a programme, Taking part, Your work, Feedback,
 * Surveys, Events, How long we keep it, Your rights), and leaves out which
 * screen shows what and the names of jobs and fields, so each entry is the
 * sentence v15 keeps for the category. Sourced from the owner decisions: if a
 * category is dropped from here, it has to be dropped from the product too,
 * not just from the page.
 */
const MUST_NAME = [
  ["application answers", /<strong>What you send\.<\/strong> Everything you type into the form, including drafts,/],
  ["drafts", /including drafts, which are saved on our servers so you can come back to them on another device\./],
  ["availability", /whether you would like to facilitate a group; when you are free each week;/],
  ["access requirements", /<strong>Access requirements\.<\/strong> Whatever you write in the box about what would make the programme work for you, we treat as sensitive, because people use it to tell us about disability, health or caring responsibilities\./],
  ["access requirements are never scored, and never shown to reviewers or a programme's lead", /it is never scored, and it is never shown to reviewers or to a programme&apos;s lead\./],
  ["access-requirements reads are recorded", /Only admins can open it, one application at a time, and we record each time one does\./],
  // An application form has no criteria. A reviewer scores single answers
  // from 1 to 5, and only where the programme uses scores
  // (`ApplicationQuestion.scored`, `ProgrammeSettings.useScores`).
  ["reviewer scores", /Where a programme uses scores, a reviewer may score your answers to its own questions from 1 to 5\./],
  ["reviewer comments", /Reviewers may also comment on your answers and on your application as a whole\./],
  // OWNER DECISION, 7 October 2026: feedback on an application is not
  // promised. It can be asked for and will be considered. A copy of the
  // personal data held about somebody, these scores and comments included,
  // is their right, and "Your rights" is where the page says so: §2d holds
  // that section to the words this sentence relies on.
  ["feedback on an application is not promised, and can be asked for", /We do not send feedback on applications as standard; ask us and we will consider it\./],
  ["scores and comments are within the right to a copy of your data", /A copy of your data covers what other people wrote about you as well as what you wrote: reviewers&apos; scores and comments,/],
  ["attendance registers", /<strong>Registers\.<\/strong> Your group&apos;s facilitators take the register at each session: present, arrived late, left early, absent or excused\./],
  ["participant notes", /Facilitators may also write a note about a named person after a session, which the group&apos;s facilitators and admins read\./],
  // v15 names everything a week's pages record in one sentence, written
  // answers among it; the entries below for ticks, reflections, boxes and
  // packs are the same sentence's words for each.
  ["written answers", /<strong>What we record\.<\/strong> What you tick, write and send on each week&apos;s pages, and when: the readings you tick, your reflections and written answers, the boxes you fill in, the packs you pick, your sealed predictions and the private notes you keep against the material\./],
  // v15 says who writes feedback and that it shows their name, and no longer
  // how it is made up (a level per row of the rubric and a comment, never a
  // mark): rubric levels may go from feedback, and the sentence is true
  // before and after.
  ["feedback on written answers, and the email that says it is waiting", /<strong>Feedback\.<\/strong> Feedback on your work is written by a person on the team running your programme, and shows their name\. It appears on the week&apos;s page, and we may email you to say feedback is waiting\./],
  // A rating on every programme, and the comment shown to the run only on a
  // programme anyone can join (`runSharesGroupNotes`, which §2g runs).
  ["feedback on the material", /<strong>Feedback on the material\.<\/strong> You can give a piece of course material a star rating, and on a programme anyone can join, leave a comment the rest of your run sees\./],
  // The anonymous form, as v15 says it: one form, never who answers, only the
  // programme and the day, read by the lead and admins from the next day in
  // no order that follows when each came in. §2g holds each to the code.
  ["the one anonymous form, apart from the surveys", /<strong>The anonymous form\.<\/strong> One form never records who answers: the keep, change and drop form at the end of a programme\./],
  ["how the anonymous form never records who answers", /It never asks who you are, even when you are signed in,/],
  ["what the anonymous form keeps, and nothing else", /and keeps only the programme and the day with your answers\./],
  ["who reads the anonymous answers, and from when", /The programme&apos;s lead and admins read them, from the next day, in an order unrelated to when each came in\./],
  ["how long the anonymous answers are kept", /Answers to the anonymous form are kept until the programme&apos;s run is deleted\./],
  ["membership tier", /We keep your membership tier for each year \(paid, comped, alumni or staff\)/],
  ["membership provenance", /and where we learned it: a list the Students&apos; Union gives us, or an admin adding you by hand\./],
  ["the conduct flag", /If there has been a conduct concern, an admin may flag an account and must record a reason: what happened, and when\./],
  // CHANGED ON PURPOSE (v15): v14 said neither the flag nor its reason is
  // shown where applications are read and scored; v15 says a marker asking
  // people to talk to an admin first may be. None is built: the one reader of
  // `memberConductFlags` is the admin route on the Members page, and §2d
  // walks the tree for any other.
  ["the reason for a conduct flag is admins' alone, and anybody else may see only a marker", /Only admins can read the reason for a conduct flag\. Where decisions about you are made, such as reading applications or deciding event sign-ups, other people may see only a marker asking them to talk to an admin first\./],
  // OWNER DECISION, 25 October 2026 (Q8 with Q26, as the boards draw them):
  // the programme's lead or an admin sends a certificate to everybody who
  // finished and to each facilitator, and each starts private until its owner
  // turns its link on. v7 took back v6's model, in which a person minted
  // their own and nothing was issued unless they chose to, and v15 keeps
  // v7's model in fewer words.
  ["certificates are sent to who finished and to facilitators", /If you finished, or facilitated a group, we send you a certificate:/],
  ["a certificate starts private, until its owner turns the link on", /It starts private: until you turn its link on, only you can open it, and you can turn it off again at any time\./],
  ["what a certificate shows", /we send you a certificate: a page with your name, the programme, the term, how many weeks it ran and the day it was issued, and a PDF\./],
  ["Add to LinkedIn sends nothing until it is pressed", /Add to LinkedIn sends nothing until you press it\./],
  // OWNER DECISION, 7 October 2026: names are shown, and the form does not
  // say so, which leaves this page as the one place an applicant is told.
  ["the people who read an application see whose it is", /They see your name and everything you sent,/],
  ["who reads an application", /<strong>Who reads your application\.<\/strong> Admins, and the lead and reviewers of each programme you ranked\./],
  // OWNER DECISION, 7 October 2026: an admin is shown each person's answer
  // about SU membership, and nobody else is (§2d walks the tree for it).
  ["only admins see the email addresses and the SU membership answer", /Only admins see your email addresses and your answer about SU membership\./],
  ["a programme joined by invitation reads the application from then on", /If you accept an invitation to a programme you did not rank, its lead and reviewers can read your application from then on\./],
  // The downloads the log records (each Download writes the log first and
  // refuses without it); §2g walks the tree for every caller of the log. v15
  // says what the record holds and no longer counts or names the kinds.
  ["the record of the five kinds of download, and the two that are not recorded", /a record of five kinds of spreadsheet staff download \(membership lists, a circulated worksheet&apos;s answers, a programme&apos;s attendance, a survey&apos;s answers with names, and the Kairos file\): who asked, what it covered, how many people were in it and when\. An event&apos;s list of sign-ups and the subscriber list are made in the browser and not recorded\./],
  ["who can see what", /<strong>Who sees it\.<\/strong> Admins see most of it\. The people leading a programme see what they need to run it\. Facilitators see their own groups, by name, never your email address\. Other people taking part see your name and what you share with them\./],
  // What the application form holds (docs/applications.md, "Where the data
  // is"). One entry per thing an applicant would not guess at.
  ["the ranking, and facilitating", /The form also asks which programmes you want, in your order; whether you would like to facilitate a group;/],
  ["the two copies", /A change counts only when you press Send again; until then the people reading your application see what you last sent\./],
  ["earlier sent versions are kept", /When you send again with something different, we keep the version before,/],
  ["how many earlier versions are kept", /up to ten earlier versions in all, deleted with your application\./],
  // The form has the box, on its last step, kept apart from the application
  // (`CheckStep.tsx`, `applicant/accessRequirementsDoc.ts`). v15 no longer
  // says which step; §2d holds the rest of that paragraph to the code.
  ["the form asks about access requirements, if you want to tell us", /and, if you want to tell us, anything we should know to make the programme work for you\./],
  ["the access-requirements answer is stored apart from the application", /It is stored apart from your application,/],
  ["joining on the form", /Its first step then also asks for your university email address and your agreement to our Terms of Use and this policy, and it is your request to join as well as the start of your application\./],
  ["a reply's reason is kept with the application", /Your reason is kept with your application, where the people who read it can see it\./],
  ["the SU membership answer", /whether you have SU membership;/],
  ["decisions are kept beside the application", /Each programme&apos;s decision on you is recorded beside your application, never on it, with who made it, when and any reason noted\./],
  ["one place a term, and an admin decides for somebody no programme took", /You are offered one place a term: the highest-ranked programme that accepts you\. If none does, an admin decides what you will hear instead: an invitation to a programme you did not rank, or no offer this time\./],
  ["nothing about a decision reaches the applicant early", /Nothing about a decision reaches you before decision day\./],
  ["the decision-day email", /On the day an admin sends every outcome together: it is shown on your application page and emailed to your account&apos;s address whatever your notification settings, because it answers your application\./],
  ["the daily invitation reminder", /If you are invited, or hold a place, we may ask you to reply or confirm by a day, and email you a reminder once a day until you do\./],
  ["replies are recorded", /When you reply \(you are coming, you can&apos;t make it, you accept an invitation, or no thanks\), we record your answer, when you gave it and any reason\./],
  ["a place approves a join request that was waiting", /A place on a programme approves your request, and we record when and which admin approved it\./],
  ["what an applicant's own page does not show", /Not the scores, the comments, each programme&apos;s decision or your earlier versions:/],
  // A programme while it runs and when it ends. One entry per thing a
  // person taking part would not guess at; §2g holds each to the code.
  ["a place that comes back", /If somebody gives a place back, until the end of the programme&apos;s first week it may be offered to somebody who ranked the programme and was told no offer this time, unless the programme turned them down\./],
  ["a freed place's offer is emailed whatever the settings say", /That offer is emailed whatever your settings\./],
  // Asking people to facilitate (src/lib/courses/facilitatorAsks/): who reads
  // the answers about facilitating, and the record each ask leaves. §2g holds
  // each to its code.
  ["the answers about facilitating, read by the lead of each programme somebody would facilitate", /If you said you would like to facilitate, the lead of each programme you named reads your answers about facilitating,/],
  ["what the lead is shown with the answers about facilitating", /with your name, your degree or area of work and your status or graduation year, and from decision day where you stand in a few words\./],
  ["an ask to facilitate is emailed whatever the settings say, with up to three reminders", /The ask is emailed whatever your settings, with up to three reminders, and saying no changes nothing about your place\./],
  ["what the record of an ask holds, and that it holds no address", /We keep a record of each ask \(who asked, when, for which group, your answer and when, and a copy of the email\) without your email address;/],
  ["who sees the asks", /without your email address; the programme&apos;s lead, admins and you can see it\./],
  // A facilitator who holds a place (the rule that nobody facilitates a
  // programme they take part in was lifted on 26 October 2026): they are on
  // the register and count towards who finished, and their own work is the
  // programme's lead's and an admin's (Zach, Mon 26 Oct 2026). §2g holds each
  // to its code.
  ["a facilitator who holds a place is on the group's register", /You are then one of its people as well: on its register/],
  ["a facilitator who holds a place counts towards who finished", /on its register and counted for who finished\./],
  ["a facilitator's own work is the programme's lead's and an admin's, not the group's other facilitators'", /Your own work is read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and they don&apos;t give you feedback on it\./],
  ["pitching, and that sending a pitch shares it with the group", /<strong>Incubators\.<\/strong> You may pitch a project, alone or with a partner from your group; sending a pitch shares it with your group, with your names\./],
  ["who picked a pitch is told to nobody in the group", /You can say which of your group&apos;s pitches you would join, and nobody in your group is told which;/],
  ["the lead sees how many would join a pitch, and not who", /the lead and admins see how many would join each one, not who\./],
  ["how teams are made", /The lead or an admin puts people into teams, from pitches or from the projects you ranked,/],
  ["what the team email says", /and we email you your team&apos;s name and who is in it\./],
  ["a team's page, and who reads what is written there", /Your team&apos;s page \(its project, a weekly update, its links and its hand-in\) is seen by your team, the lead and admins, and anybody in the team can change it\./],
  ["leaving, with its day", /<strong>Leaving\.<\/strong> If you leave, we record that you left and when, and you leave your group at once\./],
  ["who reads a leaver's reason", /A reason you give is read by admins and the programme&apos;s lead only,/],
  ["where a leaver's reason is kept", /and is kept with your place, not your application\./],
  ["a leaver's marks stay on the register", /The register keeps what it said about you up to then, with the day you left,/],
  ["what a leaver wrote stays for the lead and admins", /and what you wrote stays in our records for the lead and admins\./],
  // The survey about leaving (Q46): who it reaches and how. Who reads it,
  // what it asks and when the names come off are what v15 says of every
  // survey, in the entries further down. §2g holds each to the code.
  ["the survey about leaving reaches somebody who leaves", /If you leave a programme while it has a survey about leaving, a link to it appears where you are told you left\./],
  ["who finished", /<strong>Who finished, and certificates\.<\/strong> After the last session we record as finished everyone who came to the number of sessions the lead set;/],
  ["the lead's changes to who finished are recorded", /the lead can change anybody&apos;s, and we record who changed it and when\./],
  ["only the lead and admins see who finished", /Only the lead and admins see the list\./],
  ["somebody who did not finish is not told so", /If you did not finish, you are not sent one and not told\./],
  // REPORTED: "Everything a facilitator sees" is wider than the code. A lead
  // is sent no note from the register (`readsNotes` in
  // src/lib/courses/registerAccess.ts) and no private note on the material
  // (`privateNotesOf` in src/lib/courses/facilitatorWeek/readers.ts), and
  // v15 itself says the private notes are the facilitators' and admins'.
  ["what a programme's lead sees once it is running", /<strong>What the people leading a programme see\.<\/strong>\{" "\} Everything a facilitator sees, for every group, except the notes facilitators write about a named person or a session, and the private notes people keep on the material, and also: who can&apos;t make their group&apos;s time and why, the reasons people give for leaving, the pitches and teams on an incubator, who might facilitate, who finished, and the totals and comments of the programme&apos;s surveys, never with a name\./],
  ["facilitators see names only", /<strong>What your facilitators see\.<\/strong> Who is in their group, by name only:/],
  ["what facilitators read of their own groups", /The register, your work and progress \(see <a href="#your-work">Your work<\/a>\), and before the first session whether you have said you are coming\./],
  // The notes a group's facilitators share (C30) and the notes a group shares
  // on its week pages (C29). §2g holds each to its code.
  ["the notes a group's facilitators share, and that one can name a person", /<strong>Notes about a group\.<\/strong> A group&apos;s facilitators may keep notes for each other about how it is going, and a note may mention you;/],
  // Who reads each kind: the notes about a group, its facilitators, the
  // programme's lead and admins (`src/lib/courses/groupNotes/readers.ts`); a
  // note about a named person after a session, the group's facilitators and
  // admins (`readsNotes` in `src/lib/courses/registerAccess.ts`, held in §2g).
  ["who reads the notes a group's facilitators share", /and a note may mention you; they, the programme&apos;s lead and admins read them\./],
  // A facilitator's session report (src/lib/firestore/courseSessionReports.ts):
  // what it asks, who reads it, that the person it names never sees it on
  // the site and can ask for it. §2g holds each to its code.
  ["session reports, who reads them, and asking for what is written about you", /<strong>Session reports\.<\/strong> After a session, facilitators may report how it went, including who engaged well and who seemed to need a hand or hadn&apos;t done the reading\. The programme&apos;s lead and admins read these\. You don&apos;t see them on the site, but you can ask for what is written about you\./],
  ["the notes shared with a group", /<strong>Notes shared with your group\.<\/strong> On a programme that places you in a group, each week&apos;s page has notes the group and its facilitators share\./],
  ["who sees a note shared with a group, and with what", /A note you add is shown with your name and the day to your group, its facilitators, the programme&apos;s lead and admins\./],
  ["a note shared with a group can be deleted by its writer", /While you are in the group you can delete your own notes;/],
  ["a note shared with a group stays when its writer leaves", /if you leave, they stay with the group\./],
  ["fill-in boxes", /the boxes you fill in,/],
  // v15 says who reads somebody's work once, for all of it: written answers,
  // reflections, ticks and the boxes they fill in.
  ["who reads somebody's work, and that the week's page says so", /<strong>Who reads it\.<\/strong> You, your group&apos;s facilitators, the programme&apos;s lead and admins, and nobody else taking part; the week&apos;s page says so\./],
  ["a facilitator's own work is the lead's and admins' only", /If you facilitate a group, your own work is read by the lead and admins only\./],
  // Pairs for a session in pairs (Technical AI Safety's hands-on night).
  // §2g holds what each person sees of their pair to its code.
  ["what a person's partner sees in a session in pairs", /When a session is in pairs, your partner sees your first name and whether you are bringing a laptop\./],
  ["the calendar link", /<strong>Your calendar link\.<\/strong> &quot;Add to calendar&quot; gives you a private link to your sessions:/],
  ["what the calendar shows", /their days, times and rooms, with nobody&apos;s name, no email addresses and never a meeting link\./],
  ["the calendar's provider fetches it", /Your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us now and then, under its own privacy policy\./],
  ["anybody holding the calendar link sees the same, and it can be replaced", /Anyone holding the link sees the same, so keep it to yourself; you can replace it at any time\./],
  ["facilitators email their group without seeing an address", /never an email address \(they write to the group through the site\)\./],
  ["what the people in a group and a team see on an incubator, and nothing else", /On an incubator, your group sees a pitch you send, with your name, and your team sees that you are in it and what you write on its page\. Nothing else\./],
  // Reflections, ticks and private notes. §2g holds each to its code.
  ["the private note's readers", /Your private notes on the material are read by your group&apos;s facilitators and admins \(if you facilitate the group, by admins alone\), and we use them to improve the course\./],
  ["a line of a reflection may be read out, without saying who wrote it", /A facilitator may read out a line of a reflection without saying whose it is\./],
  // The surveys (docs/surveys.md). §2g holds each to its code.
  ["a survey is confidential, and says so at the top", /<strong>Confidential\.<\/strong> Every survey is confidential: we keep your answers with your name, and each survey says so at the top\./],
  ["only admins see who said what in a survey, and each time one does is recorded", /Only NAISI&apos;s admins can see who said what, and we record each time one of them does\./],
  // CHANGED ON PURPOSE (v15): v14 said facilitators never see anything of a
  // survey. v15 says they may see their own group's check-in totals, and
  // nothing else of one.
  ["facilitators may see their own group's check-in totals, and nothing else of a survey", /Facilitators may see their own group&apos;s check-in totals, never who said what and never the comments, and see nothing else of a survey\./],
  // A programme's lead reads its surveys' totals and comments (Q41, Q49 A;
  // the stage four walk's finding L2). §2g holds each to its code.
  ["the lead sees a programme's surveys' totals and comments", /The programme&apos;s lead sees the totals and comments of its surveys,/],
  ["the lead never sees a survey's names, who answered, or a download of its answers", /and never sees your name or who answered and who did not, and cannot download the answers\./],
  ["the lead may tell whose a survey answer is", /When only a few people answer, the lead may still be able to tell which answer is yours\./],
  ["the lead sees the average rating of the material, never who gave which", /The lead sees each piece&apos;s average once three people have rated it, never who gave which\./],
  ["when surveys are sent", /<strong>What we ask\.<\/strong> We may ask you to fill in surveys before, during and after a programme \(including short check-ins at the end of a session\), after events you had a place at, and in follow-ups you agree to\./],
  ["what surveys ask", /They ask about you and your plans, what you learned, and how the programme or event went; the questions vary\./],
  ["the follow-ups go only to people who tick the box, which they can change later", /Follow-ups at 6 and 12 months go only to people who tick the box saying we may send them, which starts unticked; you can change your answer later\./],
  // CHANGED ON PURPOSE (v14, Zach 30 Oct 2026): was "Every question can be
  // skipped." The rule that replaced it, the three permission boxes, and the
  // sentence about a place, word for word; v15 says the last in the
  // paragraph before.
  ["every question in a survey needs an answer unless marked optional, the permission boxes are up to the person, and nothing said in one affects a place", /Nothing you say in a survey affects your place on a programme or an application\.[\s\S]*<strong>Questions that need an answer\.<\/strong> Every question needs an answer unless it is marked optional\. The boxes that ask your permission are always up to you: whether we may contact you for follow-ups, whether we share your details with Kairos, and whether we may quote you\./],
  ["the questions left blank: a link to just those, never the earlier answers, added and never changed", /If you sent a survey with questions left blank, an admin may send you a link to answer just those; it shows none of your earlier answers, and adds to them without changing them\./],
  ["a survey records nothing about how it is filled in", /Nothing about how you filled it in, and none of your answers until you send them\./],
  ["what a survey records with the answers, and never an IP address", /<strong>What a survey records\.<\/strong> Your answers, when you sent them, whether you used your own link or were signed in, and whether your group had met by then\. Nothing about how you filled it in, and none of your answers until you send them\. We never keep your IP address with them\./],
  ["a survey is emailed as a notice, with a link of your own", /<strong>How a survey reaches you\.<\/strong> A survey&apos;s email is a notice, so your notification settings don&apos;t switch it off, and it carries a link of your own so you can answer without signing in\. Anyone holding it could answer in your name, so keep it to yourself\./],
  // Two years since Zach chose it for everyone (26 October 2026); it said a year.
  ["names come off survey answers two years after the programme or the event", /<strong>Survey answers:<\/strong> we take your name off two years after the programme&apos;s last session \(or the event\), and delete the record that the survey was sent to you with your link\. Your answers stay in the totals, no longer linked to you\./],
  // Sharing with Kairos by default, and the ratings at a programme's end
  // (part (b) of the impact questionnaire's build, Zach, 26 October 2026);
  // §2g holds each to the code.
  ["who Kairos is, and what it does with the file", /<strong>Sharing with Kairos\.<\/strong> Kairos supports AI safety groups at universities and is one of our funders\.[\s\S]*Kairos uses it to see what its support achieves and to point promising people towards work in AI safety\./],
  ["what goes to Kairos unless you say no", /Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end: their name, the programme, how many sessions they came to, whether they finished, and the ratings they were given at the end\./],
  ["what never goes to Kairos", /It never holds your email address, your survey answers or who gave a rating\./],
  ["how to say no, and that it can change", /Every programme survey ends with a box to say no, and the same choice is on\{" "\} <a href="\/profile">your profile<\/a>; you can change it at any time, and the next file goes by it\./],
  ["what saying no does and does not change", /Saying no changes nothing else: your survey answers still count in our totals\./],
  ["a file sent to Kairos is not recalled", /A file already sent is held by Kairos, and changing your mind later does not recall it\./],
  ["totals to funders and sponsors name nobody", /<strong>Funders and sponsors\.<\/strong> We report totals to them, Kairos among them: how many people applied to, started and finished a programme, how answers to our surveys changed between the start and the end, and figures like those, each with how many people it counts\. These never name anybody\./],
  ["an incubator's links to its work may go to funders, as its question says", /These never name anybody\. For an incubator we may also pass on the links its people give us, in the survey at its end, to the work their team produced; that question says so\./],
  ["reporting totals to funders, and sharing with Kairos that anybody can stop, among the legitimate interests", /reporting totals to funders; sharing with Kairos, which you can stop at any time;/],
  ["who rates whom at a programme's end", /Nobody rates themselves, and a facilitator who takes part in a group is rated by the programme&apos;s lead or an admin\./],
  ["who reads a rating, and that the person rated never does", /These ratings are read by the programme&apos;s lead, admins and the person who gave each one, and never by the person rated\./],
  ["the sessions beside a rating come from the register", /Beside each rating we show how many sessions the person came to, from the register\./],
  ["ratings are deleted two years after the programme and with an account", /<strong>Ratings at the end of a programme:<\/strong> two years after its last session\.[\s\S]*the notes and ratings about you, the ratings you gave,/],
  // Every event passage with a claim about something built since v6, in
  // v15's words. §2g and the check-in passage hold each claim to its code.
  ["who came to an event, how and when", /<strong>Coming to an event\.<\/strong> If you come, we may record that you came, how and when: a committee member checks you in on the door list, or, at an event that lets you, you check yourself in from the link in your confirmation email or with the code at the door\./],
  ["the check-in link in the email that confirms a place", /Anyone holding your email&apos;s link could check in in your name, so keep it to yourself\./],
  ["who sees who came to an event by name", /Only admins and the committee members the Students&apos; Union recognises can see who came; the event&apos;s other organisers see how many came, never who\./],
  ["a walk-in's name, and an address only for that event's survey, deleted when it closes or a week on", /If you come without signing up, we take your name at the door, and an email address only if you want the event&apos;s survey; we use it for nothing else, and delete it when that survey closes or a week after the event, whichever is sooner\./],
  // CHANGED ON PURPOSE (v15): v14 said not coming is recorded nowhere and
  // nobody is shown one person's list of the events they came to. v15 says
  // admins can see which events somebody signed up for and came to, that
  // missing two in a row may count, and what never does.
  ["what admins see of somebody's events, and what never counts", /<strong>Attendance\.<\/strong> Admins can see which events you signed up for and whether you came\. Missing two events in a row that you had a place at may be taken into account when places are decided\. Telling us beforehand that you can&apos;t make it, or giving your place back before the day, never counts, and the count starts again each academic year\./],
  ["how many different people came to a term's events, counted for admins", /Admins also see totals across a term&apos;s events \(how many different people came, and how many came to two or more\), counting you once by your account or email address; a walk-in with no account is never matched\./],
  ["what an event's organisers are told of its survey", /An event&apos;s organisers are told that its survey went and when, and nothing of its results\./],
  ["an event's survey: sent when it ends, and opened by its QR code", /An event&apos;s survey may be sent automatically after it ends\.[\s\S]*At the end of an event, its QR code opens its survey\./],
  ["the box under a long answer to tick a comment to be quoted", /Under a long answer there may be a box saying &quot;You can quote this, without my name&quot;, which starts unticked\./],
  ["what admins may publish on a programme's page, and taking it down", /NAISI&apos;s admins may publish, on a programme&apos;s page, numbers from that programme&apos;s own surveys, with how many people answered, and comments whose writers ticked that box, each with the term and no name\. An admin can take them down at any time, and will if you email us\./],
  ["being asked to facilitate, and why", /We may ask you to facilitate a group: because you said you would like to, or, if you hold a place, because an admin thinks you would be good at it\./],
  // CHANGED ON PURPOSE (v15): v14 said that until you send an answer, the
  // others who read it see only that you have started it, never what it
  // says. v15 keeps that, and says that if the week locks first they may
  // read it.
  ["changing your work, and what is read before it is sent", /<strong>Changing your work\.<\/strong> Your reflections and the boxes you fill in save as you type, and the people who read your work can read them as you write\. A written answer is yours until you send it: until then they see only that you have started it, never what it says, and if your week locks before you send it, they may then read what you wrote\. The week&apos;s page says until when you can change your work, and the people running your group can reopen it for you\./],
  // CHANGED ON PURPOSE (v13): v12 promised that nothing written in a course
  // is used outside its programme. v13 took it back from its own agreement
  // on and said the cut-off in its place; v15 says the same cut-off (§2m
  // holds the versions).
  ["using somebody's work later, from version 13 on", /<strong>Using your work later\.<\/strong> What you write on a programme after you first agreed to version 13 of this policy, or after you joined if that was later, may also be used when we consider you for something else with us, such as another programme, facilitating a group or the committee\. Anything you wrote before that is used only within its programme\./],
  ["the packs somebody picks", /the packs you pick,/],
  ["sealed predictions: who reads them, and each admin opening recorded first", /Your sealed predictions are read by you and admins alone, and each time an admin opens them we record it first; if we can&apos;t record it, they stay closed\./],
  ["a facilitator can hold a place in the group they facilitate", /<strong>If you facilitate your own group\.<\/strong> A facilitator can also hold a place in the group they run\./],
  ["reflections", /your reflections and written answers,/],
  ["a tick for each source of a week's readings", /the readings you tick,/],
  ["what facilitators rate at a programme's end, and that the ratings go to Kairos unless you say no", /<strong>Ratings at the end of a programme\.<\/strong> When a programme ends, each group&apos;s facilitators rate the people taking part in it: how much they joined in, their grasp of the material, how much improving AI outcomes seems to drive them, and whether they would recommend them for a more demanding next step\. On an incubator they also rate the person&apos;s research or technical skill, how independently they can steer their research and how strongly they support it continuing\.[\s\S]*Unless you say no, they go to Kairos \(see\{" "\} <a href="#sharing">Services we use, and sharing<\/a>\)\./],
  ["what facilitators are not shown of an application", /Nothing else from your application, and no review scores\./],
  ["what other participants see", /<strong>What other people taking part see\.<\/strong> Your name\. On a programme anyone can join, a comment or star rating you leave on its material\. In a group, the notes you share with it, with your name and the day\./],
  ["counting who comes to events, among the legitimate interests", /counting who comes to events;/],
  ["running courses, among what we use data for", /<strong>What we use it for\.<\/strong> Running the society: deciding applications, running programmes and events, keeping in touch in the ways you choose, and choosing people for things later, such as a place on a programme, facilitating a group or the committee\./],
  ["the emails that answer something somebody did", /Some answer something you did, such as a sign-up&apos;s confirmation, an application&apos;s receipt or a decision\./],
  ["consent, quoting a comment among it", /<strong>Consent<\/strong> for the newsletter, event announcements, notifications on your devices, follow-up surveys and quoting a comment of yours\. You can withdraw it at any time from your profile, through the link in the email, or by emailing us\./],
  ["no automated decisions, who finished and teams among them", /<strong>No decision by a machine alone\.<\/strong> No decision about you is made solely by automated means\. Scores are given by named reviewers, and a programme&apos;s score for an application is the average of theirs; the site shows reviewers which applications scored highest, as a guide\. Who finished starts from the number of sessions the lead chose, and the lead can change anybody&apos;s\. On an incubator the site can put teams together when the lead asks, and the lead can move anybody before people are told\. What Claude or Pangram says is one view a person weighs, and nothing is done because of it alone\./],
  ["how long course records are kept", /<strong>Your course record<\/strong> \(your place, the registers, your work and the feedback on it, notes facilitators wrote and session reports\): while your account exists\./],
  ["how long the Kairos choice is kept", /<strong>Your choice about Kairos:<\/strong> while your account exists, so a later programme goes by it too\./],
  ["how long who came to an event is kept with names, and a walk-in's address", /<strong>Who came to an event:<\/strong> names for a year after the event, then only the count\. A walk-in&apos;s email address until that event&apos;s survey closes, or a week after the event if sooner\./],
  ["what a deletion removes, every kind of course record named", /Deleting it removes your account and profile, your subscriptions, your applications and drafts with their access requirements and the scores, comments and decisions about them, your places on programmes, your work and the feedback on it, the notes and ratings about you, the ratings you gave, the notes you wrote for a group&apos;s other facilitators, the notes you shared with a group, a conduct flag, your survey links and your name on your survey answers, your membership records, your choice about Kairos and a certificate whose link is off\. Registers keep the rest of the group, without you\./],
  ["work goes with the account", /your places on programmes, your work and the feedback on it,/],
  ["notes and ratings go with the account of whoever they are about or wrote them", /the notes and ratings about you, the ratings you gave, the notes you wrote for a group&apos;s other facilitators,/],
  // A note on a register about a named person records no writer, so the
  // writer's deletion cannot find it: it stays, and the policy says so.
  ["a register's notes about somebody stay when their writer's account goes", /tasks you were on; notes you wrote about somebody on a register, which records no writer;/],
  ["survey answers and who came stay in the totals after a deletion", /survey answers and the count of who came, no longer linked to you;/],
  ["a quoted comment after a deletion", /a comment of yours quoted without your name \(email us and we will take it down\);/],
  ["a pitch with a partner and a team's page, after a deletion", /a pitch you sent with a partner, and what you wrote on your team&apos;s page, without your name;/],
  ["a certificate whose link is on, after a deletion", /and a certificate whose link is on, because it exists for the people you gave the link to \(email us and we will withdraw it\)\./],
  ["the staff records a deletion leaves, the openings of sealed predictions and survey answers among them", /We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers, and keep a log of decisions on applications\. These record what staff did, not what you wrote, and are kept as long as we need them to look into problems and show we acted properly\.[\s\S]*the email log and suppression list; staff logs;/],
  ["saying no to Kairos on the profile, among the rights you serve yourself", /Most of this you can do yourself: edit your profile and notification choices, and say no to sharing with Kairos, on\{" "\} <a href="\/profile">your profile page<\/a>, and unsubscribe from optional email through the link in it\./],
  ["a copy of your data covers what others wrote about you, notes and ratings among it", /A copy of your data covers what other people wrote about you as well as what you wrote: reviewers&apos; scores and comments, each programme&apos;s decision and any reason noted, notes facilitators and admins wrote, session reports, ratings, and the reason for a conduct flag\. Where a record also names somebody else, we may need to leave their part out\./],
];

describe("the courses section", () => {
  /** The page a reader is shown, so no entry can be satisfied by the file's header comment. */
  const page = CURRENT_FLAT.slice(CURRENT_FLAT.indexOf("export default function"));

  test("the applying section exists, is in the table of contents, and every link into the policy names a section it has", () => {
    // v15's "Applying to a programme" is where an applicant is told what an
    // application holds and who reads it, so the form's two links point at
    // it: the in-form notice of the older kind of round and the last step of
    // the application form. Until v15 both pointed at "Courses and
    // programmes" (#courses), which v15 does not have.
    assert.match(CURRENT, /<section id="applying" className=\{styles\.section\}>/);
    assert.match(CURRENT, /\{ id: "applying", label: "Applying to a programme" \}/);
    assert.match(
      read("src/features/admissions/ApplicationPrivacyNotice.tsx"),
      /COURSES_PRIVACY_HREF = "\/privacy#applying"/,
      "the in-form notice must link to the section anchor",
    );
    assert.match(
      read("src/features/applications/apply/CheckStep.tsx"),
      /const PRIVACY_HREF = "\/privacy#applying";/,
      "the application form's last step must link to the section anchor",
    );
    // Every link into the policy from src, the two above among them, names a
    // section the current version has: a link to an anchor the page lost
    // lands at the top of the page and reads as if it went nowhere.
    const links = [];
    for (const file of textFilesUnder(SRC)) {
      const relative = file.slice(REPO_ROOT.length + 1).split(sep).join("/");
      if (!/\.tsx?$/.test(relative) || relative.startsWith("src/content/legal/privacy/")) continue;
      for (const [, id] of read(relative).matchAll(/["'`]\/privacy#([\w-]+)["'`]/g)) {
        links.push({ relative, id });
      }
    }
    for (const [relative, id] of [
      ["src/features/admissions/ApplicationPrivacyNotice.tsx", "applying"],
      ["src/features/applications/apply/CheckStep.tsx", "applying"],
      ["src/features/anonymousFeedback/AnonymousFormScreen.tsx", "surveys"],
    ]) {
      assert.ok(
        links.some((link) => link.relative === relative && link.id === id),
        `the walk no longer finds ${relative}'s link to /privacy#${id}, so the check below may be looking at nothing`,
      );
    }
    for (const { relative, id } of links) {
      assert.ok(
        CURRENT.includes(` id="${id}"`),
        `${relative} links to /privacy#${id}, an anchor the current policy does not have`,
      );
    }
  });

  for (const [what, pattern] of MUST_NAME) {
    test(`names ${what}`, () => {
      assert.match(
        page,
        pattern,
        `the current policy no longer names ${what}. The policy is the ` +
          "platform's one statement of what it holds about somebody who " +
          "applies or takes part; a category present in the product and " +
          "absent from the page makes the page wrong. Add it back, or remove " +
          "the feature.",
      );
    });
  }

  test("push subscriptions are named too", () => {
    assert.match(
      page,
      /<strong>Notifications on your devices\.<\/strong> If you install the site as an app and turn notifications on, your browser gives us an address for that device and two keys that let us encrypt a message to it\. We keep them with your account, your browser&apos;s user-agent string and when the device last checked in, one record per device\./,
    );
  });

  test("retention says applications are kept on the account", () => {
    assert.match(
      page,
      /<strong>Applications<\/strong>, with their scores, comments and decisions: while your account exists, so a later application from you can be read in context\./,
    );
  });

  test("retention says what a deletion removes and what it leaves behind", () => {
    // The cascade (`accountDeletion.ts`) removes the account, its
    // applications and reviews, its memberships and its register marks, and
    // deliberately keeps memberRecords, worksheet responses and reviews,
    // tasks, RSVPs, the email log and every Storage object. The policy lists
    // both sides and names no period.
    assert.match(page, /Deleting it removes your account and profile,/);
    assert.match(page, /It leaves: the short record of each application described above;/);
    assert.match(page, /your applications and drafts with their access requirements and the scores, comments and decisions about them,/);
    assert.match(page, /tasks you were on; notes you wrote about somebody on a register, which records no writer; your event sign-ups, with any dietary or accessibility answers; files you uploaded;/);
    // Narrowly worded: the policy does promise to answer a rights request
    // within 30 days, which is the statutory deadline and nothing to do with
    // deletion. What it may not do is promise that data GOES after a period
    // unless a job enforces one.
    assert.ok(
      !/30 days afterwards/i.test(CURRENT_FLAT) && !/delete or anonymise/i.test(CURRENT_FLAT),
      "the policy must not promise a deletion period unless a job enforces " +
        "that period.",
    );
    assert.ok(
      !/Deleting your account deletes/.test(CURRENT_FLAT),
      "the policy must not say deleting the account deletes everything about " +
        "you: the cascade keeps memberRecords, worksheet answers, tasks and RSVPs.",
    );
  });

  test("certificates are described as the owner decided: sent, and private until their owner turns the link on", async () => {
    // OWNER DECISION, 25 October 2026 (Q8 with Q26, as the boards draw them).
    // When a programme ends, its lead or an admin sends a certificate to
    // everybody its record says finished and to each of its facilitators.
    // Each starts private: only its owner can open it until they turn its
    // link on, and they can turn it off again. That replaced v6's model, in
    // which a participant minted their own and nothing was issued unless they
    // asked, so the retention carve-out below turns on the link rather than
    // on who chose to make the page.
    //
    // BUILT (src/lib/courses/certificates/, the page at /c/<code>, its PDF,
    // the send on a programme's Overview). v15 says it in one paragraph, "Who
    // finished, and certificates", and leaves out what v7 to v14 spelled out:
    // who presses send, that the link cannot be guessed or found, what Add to
    // LinkedIn hands over once pressed, and that a downloaded copy is the
    // owner's. The code that made those sentences true is still held below,
    // each part to the v15 words it keeps true: a rule RUN, the tree WALKED
    // against a named list, or one line of source matched.
    assert.match(page, /If you finished, or facilitated a group, we send you a certificate: a page with your name, the programme, the term, how many weeks it ran and the day it was issued, and a PDF\./);
    assert.match(page, /It starts private: until you turn its link on, only you can open it, and you can turn it off again at any time\./);
    assert.match(page, /Add to LinkedIn sends nothing until you press it\./);
    assert.match(page, /If you did not finish, you are not sent one and not told\./);
    // v6's model is gone, every clause of it.
    for (const gone of [/\bmint/i, /Nothing is issued unless you choose to/i, /agree that we may offer this/i]) {
      assert.ok(
        !gone.test(page),
        `the policy matches ${gone}: it describes v6's certificates, which a person minted for ` +
          "themselves. Since v7 they are sent, and start private.",
      );
    }

    // The retention carve-out that follows from it: the link, not who made
    // the page, decides whether it outlives the account.
    assert.match(page, /your choice about Kairos and a certificate whose link is off\. Registers keep the rest of the group, without you\./);
    assert.match(page, /and a certificate whose link is on, because it exists for the people you gave the link to \(email us and we will withdraw it\)\./);

    const certificates = (file) => withoutComments(read(`src/lib/courses/certificates/${file}`));
    const model = await loadTs("lib/courses/certificates/model.ts");
    const face = await loadTs("lib/courses/certificates/face.ts");
    const linkedin = await loadTs("lib/courses/certificates/linkedin.ts");
    const send = certificates("send.ts");
    const record = certificates("record.ts");

    // "If you finished, or facilitated a group, we send you a certificate."
    // Two kinds and no other; the send's one reader of who asks the finished
    // record for the first and the groups' facilitators, held to their
    // standing, for the second. Nobody else is given one.
    assert.deepEqual([...model.CERTIFICATE_KINDS], ["finished", "facilitated"]);
    assert.deepEqual(model.DID_WORDS, { finished: "finished the", facilitated: "facilitated a group on the" });
    assert.match(send, /if \(recordOf\(row, finishing, end\)\?\.finished !== true\) continue;/);
    assert.match(send, /if \(member && holdsStanding\(member, "courseEnrolments\.uid"\)\) give\(row\.uid, "finished"\);/);
    assert.match(
      send,
      /if \(facilitator && isNamedWithStanding\(facilitator, "courseGroups\.facilitatorUids", entry\.group\.facilitatorUids\)\) \{\s*give\(uid, "facilitated"\);/,
    );
    assert.equal((send.match(/\bgive\(/g) ?? []).length, 2, "the send gives a certificate from somewhere new");
    // "We send you a certificate: a page": v14 said the programme's lead or
    // an admin sends each one as an email with a link to its page, and v15
    // no longer says who presses send. The press's gate, and the link in the
    // email, are still those.
    assert.match(send, /if \(!opensProgrammeGroups\(role\)\) return refuse\(403, LEADS_AND_ADMINS\);/);
    assert.match(send, /claimed\.map\(\(entry\) => certificateUrl\(appUrl, entry\.code\)\)/);

    // "It starts private: until you turn its link on, only you can open it."
    // Made with its link off; read as off unless it is stored as exactly
    // true; shown to anybody but its owner only while it is on; and its owner
    // is the account it was made for, signed in as themselves, never a
    // view-as session.
    assert.match(send, /linkOn: false,/);
    const stored = (over = {}) => ({
      kind: "finished",
      code: "K7Q2M9XH4PWR3TDB",
      uid: "amara",
      runId: "run1",
      issuedAt: new Date("2026-12-14T10:00:00Z"),
      snapshot: { name: "Amara Okafor", did: "finished the", programme: "AGI Strategy Fellowship", term: "Autumn 2026", weeks: "6 weeks", credit: null, issuedOn: "Mon 14 Dec 2026" },
      email: { state: "sent" },
      ...over,
    });
    for (const linkOn of [undefined, "true", 1, null]) {
      assert.equal(model.normalizeCertificate("run1__amara__finished", stored({ linkOn })).linkOn, false, `${linkOn} read as on`);
    }
    assert.match(record, /return !viewAs && viewer !== null && cert\.uid !== null && cert\.uid === viewer\.uid;/);
    assert.match(record, /if \(isOwner\(cert, viewer, viewAs\)\) \{[\s\S]*?\}\s*if \(!cert\.linkOn\) return \{ state: "none" \};/);

    // "You can turn it off again at any time", and a certificate whose link
    // is on "exists for the people you gave the link to". The check line is
    // drawn only while it is on; the switch takes on and off, and only from
    // its owner.
    const snapshot = model.normalizeCertificate("run1__amara__finished", stored()).snapshot;
    assert.equal(face.faceOf("finished", snapshot, { host: "naisi.uk", code: "K7Q2M9XH4PWR3TDB" }).check, "Check it at naisi.uk/c/K7Q2M9XH4PWR3TDB");
    assert.equal(face.faceOf("finished", snapshot, null).check, null);
    assert.deepEqual(model.parseLinkSwitch({ linkOn: false }), { ok: true, value: { linkOn: false } });
    assert.deepEqual(model.parseLinkSwitch({ linkOn: true }), { ok: true, value: { linkOn: true } });
    assert.match(record, /if \(!cert \|\| !isOwner\(cert, viewer, false\)\) return refuse;/);

    // "Only you can open it", and once its link is on, "the people you gave
    // the link to": nobody else reaches it by guessing or by finding it
    // listed (v14 said so in words; v15 leaves them out). Eighty bits from
    // the operating system's random source, never a six-character code; the
    // page tells search engines to leave it, and nothing that lists the
    // site's pages names it.
    assert.ok(model.CODE_LENGTH * Math.log2(model.CODE_ALPHABET.length) >= 80, "a certificate's code is guessable");
    assert.equal(model.codeFrom("K7Q2M9"), null);
    assert.match(certificates("code.ts"), /const bytes = randomBytes\(CODE_LENGTH\);/);
    assert.match(read("src/app/(public)/c/[code]/page.tsx"), /robots: \{ index: false, follow: false \}/);
    for (const file of ["src/app/sitemap.ts", "src/app/robots.ts", "src/layout/PublicHeader.tsx", "src/layout/PublicFooter.tsx", "src/content/links.ts"]) {
      assert.doesNotMatch(read(file), /["'`]\/c\/|\/c\/\$\{/, `${file} names a certificate's page`);
    }

    // "A page with your name, the programme, the term, how many weeks it ran
    // and the day it was issued." What a certificate keeps is exactly those,
    // with the words saying whether it is for finishing or facilitating and
    // the course's credit line (the course's, not the person's), and
    // anything else stored beside them is never read; every drawing of it
    // draws that view and no other field, so it shows no email address, no
    // photo and nobody else's name (v14's words).
    const extra = stored({ snapshot: { ...stored().snapshot, email: "amara@example.com", photoURL: "https://example.com/a.png", lead: "Claudia" } });
    assert.deepEqual(Object.keys(model.normalizeCertificate("run1__amara__finished", extra).snapshot).sort(), [
      "credit",
      "did",
      "issuedOn",
      "name",
      "programme",
      "term",
      "weeks",
    ]);
    assert.deepEqual(Object.keys(face.faceOf("finished", snapshot, null)).sort(), [
      "check",
      "did",
      "eyebrow",
      "issued",
      "kind",
      "label",
      "meta",
      "name",
      "programme",
    ]);
    const drawing = withoutComments(read("src/features/courses/certificates/CertificateFace.tsx"));
    assert.doesNotMatch(drawing, /<img\b|photo|email|address/i, "the drawing shows a picture or an address");

    // "Add to LinkedIn sends nothing until you press it." Pressing it opens a
    // plain address in the person's own browser, which carries what v14 said
    // it does: the title, the year and month, the link, and the word that
    // says which of LinkedIn's forms to open. Nothing else in the tree names
    // that form.
    const href = new URL(
      linkedin.linkedInHref({ kind: "finished", programme: "AGI Strategy Fellowship", issuedAt: new Date("2026-12-14T10:00:00Z"), url: "https://naisi.uk/c/K7Q2M9XH4PWR3TDB" }),
    );
    assert.deepEqual([...href.searchParams.keys()], ["startTask", "name", "issueYear", "issueMonth", "certUrl"]);
    assert.deepEqual([...linkedin.LINKEDIN_PARAMETERS], ["startTask", "name", "issueYear", "issueMonth", "certUrl"]);
    assertExactlyTheseFiles(
      sourceFilesNaming(/linkedin\.com\/profile\/add/),
      new Map([["src/lib/courses/certificates/linkedin.ts", "builds the one address Add to LinkedIn opens, with the title, the date and the link"]]),
      "the places that send something to LinkedIn",
      "Add to LinkedIn sends nothing until it is pressed, and then the title, the date and the link, and nothing else. Build any address for it in linkedin.ts.",
    );

    // "And a PDF", which is the owner's: only its owner downloads one,
    // whether or not its link is on.
    assert.match(record, /if \(!cert \|\| !isOwner\(cert, viewer, viewAs\)\) return null;/);

    // Deleting an account "removes ... a certificate whose link is off" and
    // "leaves ... a certificate whose link is on", kept without its owner;
    // destroying a run does the same. The sweeps, a line each (both run in
    // tests/course-hub-certificates-record.test.mjs).
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.match(cascade, /db\.collection\(CERTIFICATES_COLLECTION\)\.where\("uid", "==", uid\)\.get\(\)/);
    assert.match(cascade, /if \(\(doc\.data\(\) \?\? \{\}\)\.linkOn === true\) \{\s*kept \+= 1;\s*writes\.push\(\(batch\) => batch\.update\(doc\.ref, \{ uid: null, ownerGoneAt: FieldValue\.serverTimestamp\(\) \}\)\);\s*\} else \{\s*deleted \+= 1;\s*writes\.push\(\(batch\) => batch\.delete\(doc\.ref\)\);/);
    assert.match(cascade, /const certificates = await clearCourseCertificates\(db, uid\);/);
    const destroy = withoutComments(read("src/lib/firestore/courseDeletion.ts"));
    assert.match(destroy, /if \(\(d\.data\(\) \?\? \{\}\)\.linkOn === true\) \{\s*kept \+= 1;\s*batch\.update\(d\.ref, \{ runId: null, runGoneAt: FieldValue\.serverTimestamp\(\) \}\);\s*\} else \{\s*batch\.delete\(d\.ref\);/);

    // Every file that names the collection, held both ways, each with what
    // it does with it. A new reader or writer brings the paragraph with it.
    assertExactlyTheseFiles(
      sourceFilesNaming(/collection\(\s*["'`][A-Za-z]*[cC]ertificate[A-Za-z]*["'`]\s*\)|\b[A-Z_]*CERTIFICATES?_COLLECTION\b/),
      new Map([
        ["src/lib/courses/certificates/model.ts", "names the collection and reads a stored certificate whole, its link off unless it is exactly on"],
        ["src/lib/courses/certificates/record.ts", "finds a certificate by its code for its page and its PDF, and its owner's switch: the one place that decides who sees what"],
        ["src/lib/courses/certificates/send.ts", "the send: makes each certificate, private, for who finished and for facilitators, and settles its email"],
        ["src/lib/courses/certificates/own.ts", "reads a person's own two by their addresses, for the card on their programme's page"],
        ["src/lib/firestore/accountDeletion.ts", "deletes an account's certificates whose link is off and keeps those whose link is on without their owner"],
        ["src/lib/firestore/courseDeletion.ts", "deletes a destroyed run's certificates whose link is off and keeps those whose link is on without their run"],
        ["src/lib/applications/handover/finishingAct.ts", "reads whether somebody holds a certificate for finishing, so who finished never unticks them while it stands"],
      ]),
      "the places that keep certificates",
      "Hold what it does to the policy's words (sent to who finished and to facilitators, private until " +
        "the owner turns the link on, the page showing the name, the programme, the term, the weeks and the " +
        "day, and a link that is off deleted with the account), and list it here with its reason.",
    );

    // The suites that run each of these as every kind of caller.
    for (const suite of [
      "course-hub-certificates-record.test.mjs",
      "course-hub-certificates-page.test.mjs",
      "course-hub-certificates-pdf.test.mjs",
      "course-hub-certificates-send.test.mjs",
      "course-hub-certificates-card.test.mjs",
    ]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("the push record goes with the account", () => {
    // OWNER DECISION. The cascade removes pushSubscriptions rows for the
    // deleted uid, so the policy no longer tells a member to email and ask.
    // Both halves are pinned: the sentence that says so, and the absence of
    // the old one, which would otherwise survive a careless merge.
    assert.match(page, /Turning notifications off deletes it, and so does deleting your account\./);
    assert.ok(
      !/deleting your account\s+does not/i.test(CURRENT_FLAT),
      "the policy says again that deleting the account keeps the push record; " +
        "the cascade removes it.",
    );
    assert.ok(
      !/push notification record for any device/i.test(CURRENT_FLAT),
      "the push record is still listed among what a deletion leaves behind.",
    );
  });

  test("deletion is by email, not a button", () => {
    // POST /api/account/delete answers 409 for any account with a users or
    // collaborators document, before anything is deleted; an admin runs the
    // cascade. The one account it deletes is a sign-up that never reached a
    // profile or an application, which is what "once you are a member"
    // leaves room for.
    assert.match(
      page,
      /<strong>Deleting your account\.<\/strong> Email us and an admin will delete it without undue delay\. There is no delete button once you are a member, because taking somebody&apos;s work out of the committee&apos;s tools is done by hand\./,
    );
    const route = read("src/app/api/account/delete/route.ts");
    const refused = route.search(
      /if \(userSnap\.exists \|\| !collabSnap\.empty\) \{\s*return NextResponse\.json\(\s*\{[\s\S]*?\},\s*\{ status: 409 \},\s*\);\s*\}/,
    );
    assert.ok(refused !== -1, "the delete route no longer refuses an account with a profile or an application");
    assert.match(route, /db\.collection\("users"\)\.doc\(uid\)\.get\(\),/);
    assert.ok(
      refused < route.indexOf("await deleteAccountCascade("),
      "the delete route deletes before it asks whether the account is a member's",
    );
  });

  test("the export sentence is not upgraded to a promise the code cannot keep", () => {
    // The wording names the five kinds of download that are recorded, and
    // the two made in the browser that are not, so it does not say that
    // every export is logged. §2g holds the five to the code both ways.
    assert.match(page, /a record of five kinds of spreadsheet staff download \(membership lists, a circulated worksheet&apos;s answers, a programme&apos;s attendance, a survey&apos;s answers with names, and the Kairos file\)/);
    assert.match(page, /An event&apos;s list of sign-ups and the subscriber list are made in the browser and not recorded\./);
    assert.ok(
      !/every export is logged/i.test(CURRENT_FLAT),
      "the policy must not claim every export is logged: it names the five " +
        "kinds that are, and two that are not.",
    );
  });

  test("the OWNER TO CONFIRM block is gone from the current policy", () => {
    // The wording of a privacy policy is the owner's. The current policy
    // carries no block of open questions for the owner. v3 keeps its own
    // list, which §1b checks, because v3 is frozen.
    assert.ok(
      !/OWNER TO CONFIRM/.test(CURRENT),
      "the current policy carries an OWNER TO CONFIRM block again: resolve it " +
        "with the owner before merging, then delete it.",
    );
  });

  test("the disclosures of what the site does are all still in the policy", async () => {
    // Each of these is something the site does that the policy has to say. A
    // future edit that drops one puts the policy out of step with the code.
    for (const [name, pattern] of [
      ["email-and-password accounts and the signup record", /If you make an account with an email address, we hold the address, a password you choose \(Firebase Auth keeps it, and we can never read it\) and a record of the sign-up:/],
      ["external collaborator applications", /<strong>External collaborators\.<\/strong> If you apply as an external collaborator, we hold what the form asks:/],
      ["the SU membership file as received", /When the Students&apos; Union gives us a list, we keep the file as we received it/],
      ["reCAPTCHA as the one exception to no tracking cookies", /The one exception is Google reCAPTCHA, which sets a cookie of its own while it runs on our registration, event sign-up and application forms/],
      ["the outside services, each with what it receives, on a page of their own", /We use the outside services listed on\{" "\} <a href=\{SERVICES_HREF\}>Services we use<\/a> to run the site, each with what it receives\./],
      ["the session cookie by name", /<code>__session<\/code> keeps you signed in/],
      ["the view-as cookie by name", /<code>__impersonator<\/code> marks a &quot;view as&quot; session\./],
      ["the last-route local storage key", /<code>naisi\.lastRoute<\/code> \(the last page you had open, so the installed app can return you to it\)/],
      ["view as, as a processing activity", /Admins can open the site as you see it, to reproduce a problem you reported\./],
      ["the worksheet recipient picker's readers", /and by the few people we have allowed to send worksheets, who see members&apos; names and photos to choose who gets one\./],
      ["names are shown to whoever reads an application", /They see your name and everything you sent,/],
      // A comment on a run anyone can join, the group's notes on one that
      // places people in groups; §2g holds the sentence to the week page.
      ["what other participants see", /<strong>What other people taking part see\.<\/strong> Your name\. On a programme anyone can join, a comment or star rating you leave on its material\. In a group, the notes you share with it, with your name and the day\./],
      ["the push record carries the account", /We keep them with your account, your browser&apos;s user-agent string and when the device last checked in, one record per device\./],
      // CHANGED ON PURPOSE (v15): v14 said a material change asks everybody
      // to accept or decline it. v15 is the last version anybody is asked to
      // accept, and says a change to how it uses somebody's information is
      // told on the site and by email before it takes effect.
      ["a change is told before it takes effect, and this is the last version anybody is asked to accept", /we tell you on the site and by email before it takes effect, saying what changed\. Anything that relies on your consent asks you for that one thing on its own\. You were asked to accept this version\. If you decline it, you are signed out, and you can email us to have your account removed; an external collaborator can delete theirs there and then\. We will not ask you to accept later versions\./],
      ["the statutory response time", /We aim to answer within 30 days\./],
      ["no solely automated decisions", /No decision about you is made solely by automated means\./],
      ["children", /We do not knowingly collect data from anyone under 16\./],
      ["RSVP dietary and accessibility answers are given by explicit consent", /Dietary and accessibility questions are optional, and we use your answers only to run that event; for anything about health in them we rely on your explicit consent, given by answering\./],
      ["the Google profile photo is fetched from Google by the visitor", /The photo stays with Google: a browser showing it fetches it from Google, which tells Google that somebody loaded that page\./],
      // §2g walks the tree for every caller of `logExport`, both ways, against
      // the five kinds v15 names here, and finds the two browser downloads it
      // says are not recorded.
      ["the export log, and what each row of it holds", /\(membership lists, a circulated worksheet&apos;s answers, a programme&apos;s attendance, a survey&apos;s answers with names, and the Kairos file\): who asked, what it covered, how many people were in it and when\./],
      ["Google's sign-in script and where it is loaded from", /Google&apos;s sign-in script is loaded from\{" "\} <code>accounts\.google\.com<\/code>/],
    ]) {
      assert.match(page, pattern, `the current version no longer says: ${name}`);
    }
    // Two disclosures moved with the outside services to /privacy/services,
    // drawn from src/content/legal/services.ts, which the policy says lists
    // each service with what it receives: Google reCAPTCHA as a service we
    // use, and a video's thumbnail in an email fetched from YouTube.
    assert.match(CURRENT, /const SERVICES_HREF = "\/privacy\/services";/);
    const { OUTSIDE_SERVICES } = await loadTs("content/legal/services.ts");
    const service = (id) => OUTSIDE_SERVICES.find((entry) => entry.id === id);
    assert.equal(service("recaptcha")?.name, "Google reCAPTCHA", "the services page no longer names Google reCAPTCHA");
    assert.match(service("recaptcha").does, /^Checks that the person filling in our registration, event sign-up and application forms is not a bot\./);
    assert.equal(service("youtube")?.name, "YouTube (Google)", "the services page no longer names YouTube");
    assert.match(
      service("youtube").receives,
      /^If your mail client loads remote images, it fetches the thumbnail from YouTube, which tells Google the email was opened and roughly where\./,
    );
  });
});

// ---------------------------------------------------------------------------
// §2b The committee tooling passage
// ---------------------------------------------------------------------------

/**
 * The courses section above is about what the platform holds on an APPLICANT
 * or a participant. What it holds on a committee member (tasks, comments,
 * attachments, and now worksheet activity) is a different passage, "On the
 * committee" under "Your account", and the tests for it belong here rather
 * than filed under courses.
 */
describe("the committee tooling passage", () => {
  test("worksheet activity tracking is named, with the limit it promises", () => {
    // WORKSHEETS (docs/worksheets.md). A circulated worksheet stamps when the
    // recipient first opened it, counts moves between pages (one running
    // total, not per page), records when they were last active, and
    // accumulates active time in half-minute samples; the sender, the
    // author, the reviewers and admins see the figures. Measuring how long
    // somebody spent on a page is the item on this page a member is least
    // likely to guess at, so the sentence has to survive: both the half that
    // says what is recorded and the half that says what never is.
    const page = CURRENT_FLAT.slice(CURRENT_FLAT.indexOf("export default function"));
    assert.match(
      page,
      /When a worksheet is sent to you, we record when you first opened it, how many times you moved between its pages, when you were last active on it and roughly how long you spent on it, sampled in half-minute steps while it is in front of you\./,
    );
    assert.match(page, /The person who sent it, its author, your reviewers and admins can see those figures\./);
    assert.match(page, /We do not record which page you were on, what you typed or when you pasted\./);
    assert.ok(
      !/how many times you opened each page/i.test(CURRENT_FLAT),
      "the policy claims a per-page open count again; the code keeps one running total.",
    );
  });
});

// ---------------------------------------------------------------------------
// §2c The notification grid passage
// ---------------------------------------------------------------------------

/**
 * What the policy says about notifications, held against what the grid does.
 *
 * The notification grid (docs/notifications.md) gives every member four rows
 * and two columns, and adds a third class of message that reads neither: an
 * important notice from somebody responsible for an audience, sent under
 * performance of a contract rather than consent. Two of those three facts were
 * things the policy actively got WRONG before the grid landed rather than
 * merely omitted: it described the categories as "newsletter, events" and it
 * put every push notification under consent, which the notice lane makes
 * untrue. A page that says a setting switches something off, over a product
 * where it does not, is the failure this section exists to catch.
 *
 * Two of the tests are the two-layer half: what a notice is (about running
 * something the member is in, saying why it reached them) is said to the
 * member twice, once on this page and once in the marker line at the top of
 * the notice itself, and the promise that the lane carries no unsubscribe
 * link is held against the door that would have to grow one. Copy on the page
 * and behaviour in `src` are one promise made in two places, and they have to
 * move together.
 */
describe("the notification grid passage", () => {
  /** The page a reader is shown, so no claim can be satisfied by the file's header comment. */
  const page = CURRENT_FLAT.slice(CURRENT_FLAT.indexOf("export default function"));

  test("the frozen v4 carries none of these sentences, so the move was a version and not an edit", () => {
    for (const pattern of [
      /a separate email choice and notification choice for each/i,
      /Each category has its own notification choice/i,
      /sent under performance of a contract rather than consent/i,
      /Important notices carry no unsubscribe link/i,
    ]) {
      assert.ok(
        !pattern.test(V4_FLAT),
        `the accepted v4 text matches ${pattern}: the grid's wording was edited into ` +
          "the frozen version instead of living in v5, which is the in-place edit " +
          "§1b exists to refuse",
      );
    }
  });

  test("names the four rows and the two choices per row", () => {
    assert.match(
      page,
      /<strong>Your choices\.<\/strong> Your profile has four kinds of message: the newsletter, event announcements, course announcements, and tasks and worksheets\./,
      "the policy no longer names the four rows the grid draws.",
    );
    assert.match(
      page,
      /Each has its own email choice and its own notification choice,/,
      "the current version no longer says a category carries an email choice AND a notification " +
        "choice. The grid stores two parallel maps, and the page is where a " +
        "member is told that.",
    );
    // The two parallel maps, four rows each, and no other row.
    const rows = ["courses", "events", "newsletter", "tasks"];
    assert.deepEqual(Object.keys(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories).sort(), rows);
    assert.deepEqual(Object.keys(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.push).sort(), rows);
  });

  test("the newsletter and event announcements go to people who opted in, and the account set-up form's two switches start off", () => {
    // OWNER DECISION, 7 October 2026: on the account set-up form the email
    // switches for the newsletter and for event announcements start switched
    // OFF. The page says those two start switched off until somebody chooses
    // them, and a switch that starts on is not somebody choosing. So the
    // sentence and where the switches start are held together here.
    assert.match(
      page,
      /The newsletter and event announcements start switched off until you choose them\./,
    );
    assert.ok(
      !/left them switched on/i.test(CURRENT_FLAT),
      "the policy says the newsletter and event announcements also go to " +
        "somebody who left a switch on. The account set-up form's two " +
        "switches start off, so nobody is in that position.",
    );
    // The form draws a switch for each of the two, and each starts off, so
    // one that is on was turned on by the person in front of it.
    const setUp = read("src/app/(auth)/register/page.tsx");
    const rows = /const REGISTER_CATEGORIES: NotificationCategory\[\] = \[([^\]]*)\];/.exec(setUp);
    assert.ok(rows, "could not find the rows the account set-up form asks about");
    assert.match(rows[1], /"newsletter"/);
    assert.match(rows[1], /"events"/);
    assert.match(setUp, /\{REGISTER_CATEGORIES\.map\(\(cat\) => \(/);
    assert.match(setUp, /checked=\{prefs\.categories\[cat\]\}/);
    // One place sets where the switches start, and it is this line.
    assert.equal(
      (setUp.match(/categories: \{/g) ?? []).length,
      1,
      "the account set-up form sets its email switches in more than one place",
    );
    assert.match(
      setUp,
      /categories: \{ newsletter: false, events: false, courses: true, tasks: true \},/,
      "the account set-up form's switches for the newsletter and for event " +
        "announcements no longer start switched off, so the policy's \"start " +
        "switched off until you choose them\" is not true of somebody who " +
        "never touched them. Decide which is right and move the other.",
    );
    // Joining from the application form is the other way to make an account,
    // and it starts both off too: §2d runs that request.
    assert.equal(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories.newsletter, false);
    assert.equal(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories.events, false);
  });

  test("says the notification choice is separate from the email choice", () => {
    assert.match(
      page,
      /Each has its own email choice and its own notification choice, so a notification can still arrive for a kind whose email you switched off\./,
      "the policy describes push as one blanket choice again, or as following " +
        "the email one, or no longer states the consequence a member actually " +
        "meets. Every row has its own push cell, resolved by " +
        "src/lib/push/preferences.ts independently of the email cell, and the " +
        "task and worksheet senders mirror to push after an email their row " +
        "skipped, which the cell copy in src/lib/firestore/notifications.ts " +
        "promises.",
    );
  });

  test("puts important notices under contract rather than consent", () => {
    // v15 lists the notices under the contract basis, and leaves them out of
    // what consent covers. Without that the page promises that the
    // notification settings switch off every message, and an organiser's
    // room change ignores them by design.
    assert.match(
      page,
      /<strong>Our contract with you as a member<\/strong> for your account and member pages; handling your applications; running a programme you hold a place on, including registers, your work, feedback, reminders, check-ins, session reports and its notices; and handling your event sign-ups and their notices\./,
    );
    assert.match(
      page,
      /<strong>Consent<\/strong> for the newsletter, event announcements, notifications on your devices, follow-up surveys and quoting a comment of yours\./,
    );
    assert.match(page, /Notices reach you whatever your choices,/);
    // v14 said notices "are never marketing". v15 says what a notice is
    // instead, which is the same limit: from the people running something
    // you are in, about running it. The marker on every notice still says it
    // is never marketing (the last test here).
    assert.match(
      page,
      /And some are notices from the people running an event you signed up for or a programme you hold a place on, about running it: a room change, a survey, a reminder about this week&apos;s work\./,
    );
  });

  test("carves the notice lane out of the unsubscribe promise as well", () => {
    // The same defect in a second place. "Unsubscribe from any email through
    // the link in that email" is a promise the lane cannot keep:
    // src/lib/email/notice.ts takes no listUnsubscribe and neither notice
    // template carries a footer, on purpose. The two carve-outs are one
    // decision and have to move together.
    assert.match(
      page,
      /and unsubscribe from optional email through the link in it\./,
      "the rights paragraph promises an unsubscribe link on every email " +
        "again. Transactional mail and the notice lane both ship without one.",
    );
    assert.match(
      page,
      /Notices reach you whatever your choices, say why they reached you, and carry no unsubscribe link\. Unsubscribing from a programme&apos;s optional emails stops those and never its notices; to stop a programme&apos;s notices, leave the programme\./,
      "the policy no longer tells a member the notice lane has no unsubscribe " +
        "link, while src/lib/email/notice.ts still refuses to grow one.",
    );
    const notice = read("src/lib/email/notice.ts");
    assert.ok(
      !/listUnsubscribe\s*\??\s*:/.test(notice),
      "sendNotice has grown a listUnsubscribe field, so the sentence the " +
        "policy now carries about the lane is the wrong shape.",
    );
  });

  test("the notice itself makes the same promise to the same person", () => {
    // "Notices reach you whatever your choices, say why they reached you":
    // the marker line above every notice says why it reached them, that
    // their settings did not stop it, and that it is never marketing.
    assert.match(page, /Notices reach you whatever your choices, say why they reached you,/);
    const marker = read("src/emails/NoticeMarker.tsx");
    assert.match(
      marker,
      /it is never marketing/i,
      "the marker line above every notice no longer says it is not marketing, " +
        "which is what the policy's \"about running it\" holds a notice to. " +
        "The two are one promise made in two places and have to move together.",
    );
    assert.match(
      marker,
      /You are getting this because \{reason\}, so it reaches you whatever your\s+notification settings say, and it is never marketing\./,
      "the marker line no longer says why the notice reached its reader, or " +
        "that their settings did not stop it, which the policy says every " +
        "notice does.",
    );
  });
});

// ---------------------------------------------------------------------------
// §2d The application form passage
// ---------------------------------------------------------------------------

/**
 * What the policy says about the application form, held against what the form
 * does (docs/applications.md).
 *
 * v5 described a review that hid names by default and one final decider. The
 * application form shows names to everybody who reads an application and has
 * a lead for each programme, and the owner decided the FORM does not tell an
 * applicant that reviewers see their name. So the policy is the only place it
 * is said, and a sentence nobody is ever shown twice is exactly the kind that
 * drifts.
 *
 * Each test below is a claim the page makes about somebody's data, paired
 * with the line of code that makes it true. When one fails, either the code
 * stopped doing what the page promises or the page stopped saying what the
 * code does. Neither is fixed by editing this file alone, and a change to the
 * wording is a new version, never an edit to a published one.
 *
 * Three kinds of pairing are used, strongest first: the rule is RUN (the join
 * rules, the limit on kept versions, the reasons), the tree is WALKED against
 * a named list checked in both directions (who names the SU membership
 * answer, where the spam check and Google's script are loaded, what uses
 * local storage), or one line of source is matched. A walk reports a file it
 * did not expect as well as an entry that has gone, so a list cannot quietly
 * fall behind the tree.
 */

/**
 * The page a reader is shown: the policy without the file's header comment.
 * The claims below are looked for here, so none can be satisfied by a note
 * to maintainers.
 */
const PAGE_FLAT = CURRENT.slice(CURRENT.indexOf("export default function")).replace(/\s+/g, " ");

/**
 * Every TypeScript file under `src` whose text matches, as repository paths.
 * The policy versions themselves are left out: they are the prose under test
 * and name these things in words.
 */
function sourceFilesNaming(pattern) {
  return textFilesUnder(SRC)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"))
    .filter((file) => !file.startsWith("src/content/legal/"))
    .filter((file) => pattern.test(read(file)))
    .sort();
}

/**
 * Hold a walk of the tree to a named list, in both directions: a file that
 * matches and is not listed fails, and so does an entry that no longer
 * matches. Every entry carries a reason a reader can weigh.
 */
function assertExactlyTheseFiles(found, expected, what, ifNew) {
  for (const [file, reason] of expected) {
    assert.ok(
      typeof reason === "string" && reason.length > 20,
      `${file} is listed as ${what} with no reason a reader can weigh.`,
    );
  }
  const listed = [...expected.keys()].sort();
  assert.deepEqual(
    found.filter((file) => !expected.has(file)),
    [],
    `these files are ${what} and are not on the list. ${ifNew}`,
  );
  assert.deepEqual(
    listed.filter((file) => !found.includes(file)),
    [],
    `these files are listed as ${what} and no longer are. Drop the entry, and ` +
      "check the sentence it stood behind still describes the site.",
  );
}

const joinRules = await loadTs("lib/applications/applicant/join.ts");
const keptAnswers = await loadTs("features/applications/apply/keptAnswers.ts");
const keptVersions = await loadTs("lib/applications/versions/kept.ts");
const releaseReasons = await loadTs("lib/applications/status/reasons.ts");

describe("the application form passage", () => {
  const formWriter = read("src/lib/applications/editor/write.ts");

  /** A stand-in for one of the browser's two stores, which remembers each write. */
  const standInStore = (initial = {}) => {
    const items = new Map(Object.entries(initial));
    const written = [];
    return {
      items,
      written,
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => {
        written.push(key);
        items.set(key, String(value));
      },
      removeItem: (key) => {
        items.delete(key);
      },
    };
  };

  test("the frozen v5 carries none of these sentences, so the move was a version and not an edit", () => {
    for (const pattern of [
      /Nothing hides who you are from the people who read, score and decide/i,
      /kept in a record of their own beside your application/i,
      /We also send it in one email/i,
      /the version you sent before is kept with your application/i,
      /Only site admins can open it/i,
      /identifies the applicant by their account&apos;s id/i,
      /it is your request to join as well as the start of your application/i,
      /naisi\.apply\.join/,
      /event sign-up and course application forms/i,
    ]) {
      assert.ok(
        !pattern.test(V5_FLAT),
        `the accepted v5 text matches ${pattern}: the application form's wording was ` +
          "edited into the frozen version instead of living in v6, which is the " +
          "in-place edit §1b exists to refuse",
      );
    }
  });

  test("says names are shown, and no longer says they are hidden", () => {
    assert.match(
      PAGE_FLAT,
      /<strong>Who reads your application\.<\/strong> Admins, and the lead and reviewers of each programme you ranked\. They are students: admins and committee members the Students&apos; Union recognises\. They see your name and everything you sent,/,
      "the policy no longer tells an applicant that the people reading their " +
        "application know whose it is. The form does not say it, so this page has to.",
    );
    for (const stale of [/name-blind/i, /the application form will say so/i]) {
      assert.ok(
        !stale.test(CURRENT_FLAT),
        `the policy matches ${stale}: it promises a review with names hidden, or a form that ` +
          "says when they are shown. An application form does neither.",
      );
    }
    // "Without your name" is how v5 promised a review with names hidden ("they
    // see your application without your name"), and until v7 the words were
    // pinned out of the page altogether. v15 says them twice, both in what a
    // deletion leaves and neither about an application: a comment quoted
    // without the name of the person who wrote it, and a pitch sent with a
    // partner and a team's page, which stay without the name of somebody
    // whose account is deleted. Those two are the only places on the page
    // they may appear, so any other use of them still fails here.
    const withoutYourName = [...PAGE_FLAT.matchAll(/without your name/gi)];
    assert.equal(
      withoutYourName.length,
      2,
      "the policy says \"without your name\" somewhere other than a quoted " +
        "comment and the pitch and team page a deletion leaves: it promises a " +
        "review with names hidden, or says something a reader could take for " +
        "one. An application form hides no name.",
    );
    assert.match(PAGE_FLAT, /a comment of yours quoted without your name \(email us and we will take it down\);/);
    assert.match(PAGE_FLAT, /a pitch you sent with a partner, and what you wrote on your team&apos;s page, without your name;/);
    assert.ok(
      !/without your name/i.test(CURRENT_FLAT.slice(0, CURRENT_FLAT.indexOf("export default function"))),
      "the policy file's header says \"without your name\", which this check held " +
        "out of the whole file before v7. The only uses it allows are the page's.",
    );
    // The two places that make the sentence true: a form is made with names
    // shown, and what a reviewer is sent carries the applicant's name.
    assert.match(
      formWriter,
      /blind:\s*\{\s*hideNames:\s*false/,
      "an application form is no longer made with names shown, so the policy's " +
        "sentence about names describes something else. Decide which is right " +
        "and move the other, in a new policy version if it is the page.",
    );
    assert.match(
      read("src/lib/applications/review/detail.ts"),
      /name:\s*applicantName\(/,
      "the review payload no longer carries the applicant's name, so the policy's " +
        "sentence about names is no longer what the review screen does.",
    );
  });

  test("readers are shown when an account is still waiting", () => {
    // Not part of the application, and shown beside it: the list a reviewer
    // works from and the screen that reads one application both mark an
    // applicant whose request to join has not been approved yet, and v15
    // says so at the end of what readers see.
    assert.match(
      PAGE_FLAT,
      /They see your name and everything you sent, including your answers for the other programmes you ranked, the earlier versions you sent, when you are free, and whether your request to join is still waiting\./,
      "the current version no longer says what the people who read an application see.",
    );
    assert.match(
      PAGE_FLAT,
      /<strong>Your account while you apply\.<\/strong> You can apply while your request to join is waiting, and send once your university address is confirmed\./,
    );
    assert.match(
      read("src/lib/applications/review/board.ts"),
      /accountWaiting: pendingUids\.has\(application\.uid\),/,
      "the list of applications no longer marks a waiting account, which the " +
        "policy tells applicants their readers see.",
    );
    assert.match(
      read("src/lib/applications/review/load.ts"),
      /accountWaiting: pendingUids\.has\(applicantUid\),/,
      "the review screen no longer marks a waiting account, which the " +
        "policy tells applicants their readers see.",
    );
  });

  test("feedback is not promised, and the right to a copy of what reviewers wrote is where the page points", () => {
    // The sentence that promised to tell an applicant what a reviewer wrote
    // has gone from the passage about reviewing, and the passage points at
    // "Your rights" instead. So that section has to go on saying it.
    assert.ok(
      !/If you ask us what a reviewer wrote about your application, we will tell you/i.test(PAGE_FLAT),
      "the policy promises again, where it describes reviewing, to tell an " +
        "applicant what a reviewer wrote. Feedback is not promised: the right " +
        "to a copy of the data is, under Your rights.",
    );
    assert.match(PAGE_FLAT, /We do not send feedback on applications as standard; ask us and we will consider it\./);
    const rights = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="your-rights"'), PAGE_FLAT.indexOf('<section id="cookies"'));
    assert.ok(rights.length > 500, "could not find the Your rights section of the page");
    assert.match(rights, /you can ask us for a copy of the personal data we hold about you;/);
    assert.match(
      rights,
      /A copy of your data covers what other people wrote about you as well as what you wrote: reviewers&apos; scores and comments, each programme&apos;s decision and any reason noted,/,
    );
    // And the passage that says what an applicant is not shown points there,
    // with a link to that section: ask, and the copy is theirs.
    assert.match(
      PAGE_FLAT,
      /Not the scores, the comments, each programme&apos;s decision or your earlier versions: ask us for any of them \(see <a href="#your-rights">Your rights<\/a>\)\./,
    );
  });

  test("admins see every application but their own, on every screen the committee reads applications from", () => {
    // v15 names admins first among who reads an application, and says only
    // admins see the email addresses on it. It no longer says "but their
    // own" in words; the screens below still leave an admin's own
    // application out, so an admin who applies is read by the others named
    // there and never by themselves.
    assert.match(PAGE_FLAT, /<strong>Who reads your application\.<\/strong> Admins, and the lead and reviewers of each programme you ranked\./);
    assert.match(PAGE_FLAT, /Only admins see your email addresses and your answer about SU membership\./);
    assert.ok(
      !/Admins see every application, with your email addresses/i.test(PAGE_FLAT),
      "the policy says again that an admin sees every application. An admin " +
        "who has applied is not shown their own on any committee screen.",
    );
    // The review screens: the term a caller is shown leaves their own
    // application out, and the screen for one application answers their own
    // as it answers one that is not there.
    assert.match(
      read("src/lib/applications/review/term.ts"),
      /\(application\) => application\.sent !== null && application\.uid !== viewerUid,/,
      "the list of applications a caller reviews from no longer leaves their own out.",
    );
    assert.match(
      read("src/lib/applications/review/load.ts"),
      /if \(applicantUid === user\.uid\) return NOT_FOUND;/,
      "the screen that reads one application now opens the caller's own.",
    );
    // Pooled applicants and decision day: one function leaves the viewer's
    // own out before the term is planned, and both pages are built from it.
    const plan = read("src/lib/applications/decisionDay/plan.ts");
    assert.match(
      plan,
      /const shown = planTerm\(\s*form,\s*applications\.filter\(\(application\) => application\.uid !== viewerUid\),\s*decisions,\s*\);/,
      "the term the two decision-day pages are built from no longer leaves the viewer's own application out.",
    );
    assert.match(read("src/lib/applications/decisionDay/pool.ts"), /loadTerm\(db, form, viewerUid\)/);
    assert.match(read("src/lib/applications/decisionDay/send.ts"), /loadTerm\(db, form, viewerUid\)/);
    // What somebody wrote under access requirements: an admin opens anybody's
    // but their own.
    assert.match(
      read("src/lib/applications/review/accessRequirements.ts"),
      /if \(applicantUid === user\.uid\) return NOT_FOUND;/,
    );
  });

  test("a view-as session is shown nothing of a person's own application", () => {
    // The page says an admin who opens the site as somebody sees it is shown
    // nothing they could not already see, and that the people reading an
    // application see what was last sent (so never the draft). A draft is
    // seen by its author alone, so a session borrowed from them must not be
    // shown it.
    assert.match(PAGE_FLAT, /Admins can open the site as you see it, to reproduce a problem you reported\. It shows them nothing they could not already see,/);
    assert.match(PAGE_FLAT, /until then the people reading your application see what you last sent\./);
    // Every handler of the applicant's own route refuses while a view-as
    // session is live, the read included: the session is then not theirs.
    const route = read("src/app/api/admissions/forms/[roundId]/application/route.ts");
    const handlers = [...route.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)];
    assert.ok(handlers.length >= 2, "the applicant's own route exports no handlers the scan can see");
    for (const match of handlers) {
      assert.match(
        route.slice(match.index, match.index + 500),
        /assertNotImpersonating\(\)/,
        `the applicant's own ${match[1]} answers during a view-as session, so an admin is ` +
          "shown a draft the policy says nobody but its author reads.",
      );
    }
    // And the two pages that draw a person's own application draw a notice
    // in its place, before anything of the application is read.
    const form = read("src/features/applications/apply/ApplyScreen.tsx");
    const formNotice = form.indexOf("if (viewingAs) {");
    const formRead = form.indexOf("await loadApplicantView(");
    assert.ok(formNotice !== -1 && formRead !== -1 && formNotice < formRead, "the form reads the application before it asks whether the session is a view-as session");
    assert.match(form.slice(formNotice, formRead), /VIEW_AS_NOTICE\.title/);
    const status = read("src/features/applications/status/renderApplicationStatus.tsx");
    const statusNotice = status.indexOf("if (viewingAs) {");
    const statusRead = status.indexOf("await loadStatus(");
    assert.ok(statusNotice !== -1 && statusRead !== -1 && statusNotice < statusRead, "the page for one application reads it before it asks whether the session is a view-as session");
    assert.match(status.slice(statusNotice, statusRead), /VIEW_AS_NOTICE\.title/);
  });

  test("the access-requirements box is on the form, apart from the application, and only an admin opens it", () => {
    // OWNER DECISION, 7 October 2026: the box is on the form, on its last
    // step. `createForm` writes an empty `accessRequirementsPrompt`, and that
    // is NOT what says whether the form has the box: the box asks a fixed
    // question of its own and reads no prompt. What makes the sentence true
    // is the step that draws the box. v15 says the form asks it and no longer
    // says on which step.
    assert.match(
      PAGE_FLAT,
      /The form also asks which programmes you want, in your order; whether you would like to facilitate a group; when you are free each week; whether you have SU membership; and, if you want to tell us, anything we should know to make the programme work for you\./,
    );
    assert.ok(
      !/does not have a box for these/i.test(PAGE_FLAT),
      "the policy says the application form has no access-requirements box. It has one.",
    );
    assert.match(
      read("src/features/applications/apply/CheckStep.tsx"),
      /\{accessRequirements\}/,
      "the last step of the form no longer draws the access-requirements box, " +
        "so the policy describes a box an applicant cannot find.",
    );

    // "Stored apart from your application": it has a collection of its own,
    // and the shape of a draft and of a sent application has no field for it.
    assert.match(PAGE_FLAT, /It is stored apart from your application, it is never scored,/);
    assert.match(
      read("src/lib/applications/applicant/accessRequirementsDoc.ts"),
      /ACCESS_REQUIREMENTS_COLLECTION = "admissionApplicationPrivate"/,
      "the access-requirements answer is no longer kept in its own collection.",
    );
    assert.ok(
      !/accessRequirements/.test(read("src/lib/applications/model.ts")),
      "the application's own shape now names an access-requirements field, so " +
        "the answer would travel with the draft or with what is sent, to " +
        "everybody who reads an application. The policy says it does not.",
    );

    // "It is never shown to reviewers or to a programme's lead. Only admins
    // can open it": the one reader refuses anybody `canRunTerm` refuses, and
    // that is an admin and nobody else. An application form has no final
    // decider, so the page must not promise one can open it.
    assert.match(
      PAGE_FLAT,
      /it is never scored, and it is never shown to reviewers or to a programme&apos;s lead\. Only admins can open it, one application at a time, and we record each time one does\./,
    );
    assert.ok(
      !/person making the final decision/i.test(PAGE_FLAT),
      "the policy names a person making the final decision. An application " +
        "form has none, and nobody but an admin can open an access-requirements answer.",
    );
    const reader = read("src/lib/applications/review/accessRequirements.ts");
    assert.match(
      reader,
      /if \(!canRunTerm\(user\)\) \{\s*return refuse\(403,/,
      "the reader of an access-requirements answer no longer refuses everybody " +
        "but the people `canRunTerm` admits, before anything is read.",
    );
    assert.match(
      read("src/lib/applications/access.ts"),
      /export function canRunTerm\(user: SessionUser\): boolean \{\s*return user\.role === "admin";\s*\}/,
      "`canRunTerm` admits somebody who is not an admin, so more people than " +
        "the policy names can open an access-requirements answer.",
    );

    // "We record each time one does": the read and its record are one
    // transaction, the record is of the kind the log keeps for it, and it
    // holds whose answer by account id and never the answer.
    const row = /tx\.create\(db\.collection\(COURSE_AUDIT_COLLECTION\)\.doc\(\), \{([\s\S]*?)\n    \}\);/.exec(reader);
    assert.ok(row, "could not find the log row the reader of an access-requirements answer writes");
    assert.match(row[1], /kind: recordAs,/);
    assert.match(row[1], /subjectUid: applicantUid,/);
    assert.match(row[1], /at: FieldValue\.serverTimestamp\(\),/);
    assert.ok(
      !/accessRequirementsIn|ownSnap|applicantName|displayName/.test(row[1]),
      "the log row for an opened access-requirements answer now carries the " +
        "answer or the applicant's name. The policy says it holds neither.",
    );
    // "These record what staff did, not what you wrote": the log row about an
    // opening holds no answer (v14 said "It never holds the answer that was
    // opened").
    assert.match(
      PAGE_FLAT,
      /We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers, and keep a log of decisions on applications\. These record what staff did, not what you wrote,/,
    );

    // A draft's answer is nobody's to open: until an application is sent,
    // "the people reading your application see what you last sent", which is
    // nothing. v14 said it in so many words ("once you have sent your
    // application an admin who opens it reads whatever is there at that
    // moment"); v15 leaves them out.
    assert.match(PAGE_FLAT, /A change counts only when you press Send again; until then the people reading your application see what you last sent\./);
    assert.match(reader, /if \(!application\?\.sent\) return NOT_FOUND;/);
  });

  test("replies to a decision email go to the address the page gives", () => {
    // v14 said where a reply to the decision email goes ("a reply to it goes
    // to" the society's address). v15 no longer says it of that email, and
    // gives the same address for anything about somebody's data, so the
    // email's reply address is held to that one.
    assert.match(
      PAGE_FLAT,
      /We decide what happens to the personal data this website holds\. Email\{" "\} <a href="mailto:ai-safety@uonsu\.com">ai-safety@uonsu\.com<\/a>\{" "\} about any of it\./,
    );
    assert.match(CURRENT, /mailto:ai-safety@uonsu\.com/);
    assert.match(
      read("src/lib/applications/decisionDay/emailCopy.ts"),
      /DECISION_REPLY_TO = "ai-safety@uonsu\.com"/,
      "decision-day mail no longer replies to the address the policy names.",
    );
  });

  test("the reminder's off switch is the one the page names", () => {
    assert.match(
      PAGE_FLAT,
      /and email you a reminder once a day until you do\. Switching off course announcement emails on your profile stops these reminders\./,
    );
    assert.match(
      read("src/lib/scheduler/jobs/applicationInvitationReminders.ts"),
      /hasOptedOutOfCourseAnnouncements\(/,
      "the invitation reminder no longer asks the course announcements row " +
        "before it sends, so the policy names an off switch that does nothing.",
    );
  });

  test("the short record is read by who the page says, and holds what it says", () => {
    // OWNER DECISION, 7 October 2026: only admins read the record. It copies
    // reviewers' comments, which the review screen shows to nobody outside
    // the applicant's own programmes, so an SU-recognised committee member
    // named on none of them must not be able to read them here instead. Both
    // blocks are held: a subcollection does not inherit its parent's rule.
    assert.match(
      PAGE_FLAT,
      /When a term&apos;s applications are finished with or destroyed, we keep a short record of each application for admins only: what you applied for, the decision, and the reviewers&apos; names with their average scores and overall comments, with none of your own writing and no email address\./,
    );
    assert.ok(
      !/SU-recognised committee members can read it/i.test(PAGE_FLAT),
      "the policy still says SU-recognised committee members can read the short record.",
    );
    const rules = read("firestore.rules");
    for (const head of [
      /^    match \/memberRecords\/\{uid\} \{$/m,
      /^    match \/memberRecords\/\{uid\}\/applications\/\{roundId\} \{$/m,
    ]) {
      const start = head.exec(rules);
      assert.ok(start, `could not find the block ${head} in firestore.rules`);
      const block = rules.slice(start.index, rules.indexOf("\n    }", start.index));
      assert.match(
        block,
        /allow read: if isAdmin\(\);/,
        "who may read a member record changed, so the policy's sentence naming " +
          "them is no longer the rule.",
      );
      assert.ok(
        !/isSuCommittee|isCommittee|request\.auth\.uid/.test(block),
        "a member record can be read by somebody who is not an admin, which the " +
          "policy says nobody can.",
      );
    }
    // "The reviewers' names with their average scores and overall comments":
    // the record's builder copies the overall comment and never reads the
    // comments reviewers left on single answers (v14 said that in words).
    const record = read("src/lib/firestore/memberRecords.ts");
    assert.match(record, /notes: str\(review\.overallComment,/);
    assert.ok(
      !/review\.comments\b/.test(record),
      "the member record now reads a reviewer's comments on single answers, " +
        "which the policy says it does not keep.",
    );
  });

  test("a deletion removes the decisions, and the log lines hold an account id and never a name", () => {
    assert.match(
      PAGE_FLAT,
      /Deleting it removes your account and profile, your subscriptions, your applications and drafts with their access requirements and the scores, comments and decisions about them,/,
    );
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /collection\("admissionDecisions"\)/,
      "account deletion no longer removes decision documents, which the policy " +
        "lists among what a deletion removes.",
    );

    // OWNER DECISION, 7 October 2026: a line about a decision says "an
    // applicant" and holds their account id. The log is kept when an account
    // is deleted, so a line must not be what goes on naming somebody who has
    // asked to be forgotten. v14 said so in words ("identifies the applicant
    // by their account's id and not by name"); v15 says the staff logs stay
    // after a deletion and record what staff did, and the lines are still
    // written as v14 said.
    assert.match(
      PAGE_FLAT,
      /and keep a log of decisions on applications\. These record what staff did, not what you wrote, and are kept as long as we need them to look into problems and show we acted properly\./,
    );
    assert.match(PAGE_FLAT, /the email log and suppression list; staff logs;/);
    assert.ok(
      !/names the applicant and the programme/i.test(PAGE_FLAT),
      "the policy still says a decision's log line names the applicant.",
    );
    const sentences = read("src/lib/applications/review/audit.ts");
    assert.match(sentences, /const AN_APPLICANT = "an applicant";/);
    assert.ok(
      !/applicantName/.test(sentences),
      "the sentences a decision's log line carries take the applicant's name " +
        "again. The policy says the line holds an account id and no name.",
    );
    const decide = read("src/lib/applications/review/decide.ts");
    assert.ok(
      (decide.match(/subjectUid: applicantUid,/g) ?? []).length >= 2,
      "a decision or a revoked acceptance is no longer logged against the " +
        "applicant's account id.",
    );

    // Where an admin took an acceptance back, the line holds the reason they
    // typed, which is why the page cannot say the logs hold no notes at all:
    // v15's "what staff did, not what you wrote" is true of it, since the
    // admin wrote it (v14 said so in words).
    assert.match(sentences, /`Reason: \$\{input\.reason\}`/);

    // The lines about a decision and about an opened access-requirements
    // answer are kept "as long as we need them": every one is keyed to its
    // form, and destroying the term's applications drains the log by that
    // key (v14 said they "go only if that term's applications are
    // destroyed").
    assert.match(PAGE_FLAT, /We also record each time an admin opened an access-requirements answer,/);
    assert.match(
      read("src/lib/admissions/destroy.ts"),
      /db\.collection\(COURSE_AUDIT_COLLECTION\)\.where\("roundId", "==", roundId\)/,
      "destroying a form no longer removes the log lines keyed to it, which " +
        "the policy says go with the term's applications.",
    );
    assert.match(
      read("src/lib/applications/review/accessRequirements.ts"),
      /runId: "",\s*roundId,/,
      "a read of an access-requirements answer is no longer logged against its " +
        "form, so destroying the form would leave the line behind.",
    );
  });

  test("how many earlier versions are kept, and that an applicant's own page is not sent them", () => {
    assert.match(
      PAGE_FLAT,
      /When you send again with something different, we keep the version before, up to ten earlier versions in all, deleted with your application\./,
    );
    // The rule itself, run: twelve versions replaced one after another leave
    // ten, the first one sent is still the first, and the two that went are
    // the oldest after it. v15 says "up to ten"; which ten (the first one
    // sent, and the most recent ones after it) is v14's detail, still the
    // rule.
    let history = { versions: [], dropped: 0 };
    for (let sent = 1; sent <= 12; sent += 1) {
      history = keptVersions.keepVersion(history, { content: { marker: sent }, sentAt: null });
    }
    assert.equal(history.versions.length, 10, "the policy says up to ten earlier versions are kept");
    assert.equal(history.dropped, 2);
    assert.deepEqual(
      history.versions.map((version) => version.content.marker),
      [1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "the first version sent is no longer the one always kept, or the most " +
        "recent are no longer the ones kept after it.",
    );
    // "Not the scores, the comments, each programme's decision or your
    // earlier versions": what an applicant's own requests are answered with
    // is built field by field and names none of the history.
    assert.match(PAGE_FLAT, /<strong>What you can see\.<\/strong> Your answers, when you last sent them, your choices and, from decision day, your outcome and your replies\. Not the scores, the comments, each programme&apos;s decision or your earlier versions:/);
    assert.ok(
      !/sentHistory/.test(read("src/lib/applications/applicant/project.ts")),
      "an applicant is now sent their own earlier versions, which the policy " +
        "says their page does not show.",
    );
  });

  test("giving a place back asks for a reason, kept with the application and nowhere that outlives it", () => {
    // v15 says a reply is recorded "and any reason", kept with the
    // application; v14 also said a reason is asked for when a place is given
    // back, from a short list or in a few words of your own. The rule below
    // still asks for one.
    assert.match(
      PAGE_FLAT,
      /When you reply \(you are coming, you can&apos;t make it, you accept an invitation, or no thanks\), we record your answer, when you gave it and any reason\. Your reason is kept with your application, where the people who read it can see it\./,
    );
    // Run: nothing, and "Other" with no words, are both refused. A listed
    // reason is taken, and whatever was typed beside it is dropped.
    assert.equal(releaseReasons.parseReleaseReason({}).ok, false);
    assert.equal(releaseReasons.parseReleaseReason({ kind: "other", other: "  " }).ok, false);
    assert.deepEqual(releaseReasons.parseReleaseReason({ kind: "times", other: "typed anyway" }), {
      ok: true,
      reason: { kind: "times", other: "" },
    });
    assert.equal(releaseReasons.RELEASE_REASON_OPTIONS.at(-1).label, "Other");
    // And the reply itself is refused without one, inside the write.
    assert.match(
      read("src/lib/applications/status/record.ts"),
      /if \(decision\.releases && !reason\) throw new ApplicantError\(RELEASE_REASON_PROBLEMS\.none, 400\);/,
      "a place can be given back with no reason again. The rule asks for one, " +
        "as v14 said, and that reason is what the policy says is kept with " +
        "the application.",
    );
    // No reason you gave for giving a place back is in the short record,
    // which outlives the application ("with none of your own writing"), or
    // in the log ("what staff did, not what you wrote").
    assert.match(PAGE_FLAT, /and overall comments, with none of your own writing and no email address\./);
    assert.match(PAGE_FLAT, /These record what staff did, not what you wrote,/);
    for (const file of [
      "src/lib/firestore/memberRecords.ts",
      "src/lib/admissions/memberRecordSync.ts",
      "src/lib/applications/review/audit.ts",
    ]) {
      assert.ok(
        !/releaseReason|gaveBack/.test(read(file)),
        `${file} now reads the reason somebody gave for giving a place back, so ` +
          "it is copied somewhere that outlives their application. The policy " +
          "says it is not.",
      );
    }
  });

  test("the SU membership answer is shown to admins only, on one page, and nothing that decides reads it", () => {
    // OWNER DECISION, 7 October 2026: an admin is shown each person's answer
    // on the decision-day page, so that somebody can help the people joining
    // a programme to get their membership before term. Nobody else is shown
    // it, and it bears on no decision. v15 says the first half ("Only admins
    // see ... your answer about SU membership"); v14 also said "it does not
    // affect whether you are offered a place", which v15 leaves out, and the
    // walk below still holds the answer out of everything that decides.
    assert.match(PAGE_FLAT, /Only admins see your email addresses and your answer about SU membership\./);
    assert.ok(
      !/It is not shown to the people who read your application, and it does not affect/i.test(PAGE_FLAT),
      "the policy says again that nobody who reads an application is shown " +
        "the answer. An admin is, on the decision-day page.",
    );
    // The membership record is a different thing, and the screens where
    // applications are read show it to nobody (the next test walks for it).

    // Every file that names the answer, by any name code gives it, and why it
    // may. The first nine are the applicant's own form and the shape of an
    // application. The last four are the admin's decision-day page and
    // nothing else. A file that starts naming it fails here until somebody
    // has decided what the page should then say.
    assertExactlyTheseFiles(
      sourceFilesNaming(/suMembership/i),
      new Map([
        ["src/lib/applications/model.ts", "the shape of what an applicant fills in, which is where the answer is declared"],
        ["src/lib/applications/normalise.ts", "reads a stored draft or sent application back into that shape"],
        ["src/lib/applications/validate.ts", "a send is refused until the question has been answered"],
        ["src/lib/applications/applicant/draft.ts", "cleans the applicant's own draft on a save and on a send"],
        ["src/lib/applications/applicant/shape.ts", "an empty draft, and whether the applicant's own draft differs from what they sent"],
        ["src/lib/applications/applicant/project.ts", "what the applicant's own requests are answered with: their own answer, back to them"],
        ["src/lib/applications/applicant/join.ts", "an empty application for checking the first step's answers, where the answer is always null"],
        ["src/features/applications/apply/ApplicationForm.tsx", "the applicant's own form, which holds their answer while they fill it in"],
        ["src/features/applications/apply/CheckStep.tsx", "the applicant's own last step, where the question is asked"],
        ["src/lib/applications/decisionDay/views.ts", "the shape of what the decision-day page is sent, which an admin alone is: a person in one of its groups carries the answer"],
        ["src/lib/applications/decisionDay/send.ts", "builds that page, and reads the answer once, where a group's names are listed"],
        ["src/lib/applications/decisionDay/boardWords.ts", "the words the decision-day page says the answer in"],
        ["src/features/applications/decisionDay/SendBoard.tsx", "draws those words under each name on the decision-day page"],
      ]),
      "naming the SU membership answer",
      "The policy says only admins see the answer (and v14 said it does not " +
        "affect whether a place is offered). If this file shows it to " +
        "anybody else, or reads it where applications are decided, " +
        "recommended or ordered, the sentence is wrong and a new version has " +
        "to say so.",
    );

    // "Only admins see": the decision-day page is built in three places, and
    // each has answered everybody who is not an admin, and left, first.
    // `canRunTerm` is an admin and nobody else (held above, with the reader
    // of access requirements).
    const refusesFirst = (source, from, what) => {
      const built = source.indexOf("await buildSendBoard(", from);
      assert.ok(built !== -1, `${what} no longer builds the decision-day page`);
      const asked = source.lastIndexOf("if (!canRunTerm(user))", built);
      assert.ok(asked >= from, `${what} builds the decision-day page without asking whether the caller is an admin`);
      assert.match(
        source.slice(asked, built),
        /^if \(!canRunTerm\(user\)\) (return NextResponse\.json\(\{ error: NOT_ADMIN \}, \{ status: 403 \}\);|\{\s*return \()/,
        `${what} does not answer and leave when the caller is not an admin`,
      );
    };
    const sendRoute = read("src/app/api/admissions/forms/[roundId]/send/route.ts");
    refusesFirst(sendRoute, sendRoute.indexOf("export async function GET("), "the decision-day route's GET");
    refusesFirst(sendRoute, sendRoute.indexOf("export async function POST("), "the decision-day route's POST");
    const sendPage = read("src/app/(app)/admin/admissions/forms/[roundId]/send/page.tsx");
    refusesFirst(sendPage, sendPage.indexOf("export default async function"), "the decision-day page");
    const builders = textFilesUnder(SRC)
      .map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"))
      .filter((file) => /\bbuildSendBoard\(/.test(read(file)))
      .sort();
    assert.deepEqual(
      builders,
      [
        "src/app/(app)/admin/admissions/forms/[roundId]/send/page.tsx",
        "src/app/api/admissions/forms/[roundId]/send/route.ts",
        "src/lib/applications/decisionDay/send.ts",
      ],
      "the decision-day page is built somewhere new. It carries people's " +
        "answers about SU membership, which the policy says admins alone are shown.",
    );

    // It does not affect whether somebody is offered a place (v14's words,
    // which v15 leaves out; a reader shown an order made by the answer would
    // in effect be shown the answer, which "only admins see" rules out): the
    // builder reads it in one expression, beside a name, and nothing that
    // decides, recommends or orders applications names it at all. The list
    // above already says so; these are named so that a failure says which
    // half went.
    const builder = read("src/lib/applications/decisionDay/send.ts")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.equal(
      (builder.match(/suMembership/gi) ?? []).length,
      2,
      "the module that sends decisions names the answer somewhere other than " +
        "the one line that lists it beside a name.",
    );
    assert.match(builder, /suMembership: applicationOf\(person\.uid\)\?\.sent\?\.suMembership \?\? null,/);
    for (const decides of [
      "src/lib/applications/decisions.ts",
      "src/lib/applications/scoring.ts",
      "src/lib/applications/sections.ts",
      "src/lib/applications/decisionDay/plan.ts",
      "src/lib/applications/decisionDay/pool.ts",
      "src/lib/applications/decisionDay/term.ts",
      "src/lib/applications/review/board.ts",
      "src/lib/applications/review/detail.ts",
      "src/lib/applications/review/decide.ts",
      "src/lib/applications/review/term.ts",
    ]) {
      assert.ok(
        !/suMembership/i.test(read(decides)),
        `${decides} now reads the answer about SU membership. It is where ` +
          "applications are decided, recommended, ordered or read for " +
          "scoring, the policy says only admins see the answer, and v14 said " +
          "it does not affect whether a place is offered.",
      );
    }
  });

  test("a conduct flag and the membership tier reach no screen where applications are read", () => {
    // CHANGED ON PURPOSE (v15): v14 said neither the flag nor its reason is
    // shown where applications are read and scored. v15 says only admins
    // read the reason, and that where decisions are made other people may
    // see only a marker asking them to talk to an admin first. No marker is
    // built, so today the walk below still finds the flag on admin screens
    // alone; a marker that lands is one more file here, with its reason, and
    // it may say nothing more than that.
    assert.match(
      PAGE_FLAT,
      /Only admins can read the reason for a conduct flag\. Where decisions about you are made, such as reading applications or deciding event sign-ups, other people may see only a marker asking them to talk to an admin first\./,
    );
    // Who reads an application is shown neither the answer about SU
    // membership nor the access requirements (v14 listed the membership tier
    // and a conduct flag beside them, in one sentence).
    assert.match(PAGE_FLAT, /Only admins see your email addresses and your answer about SU membership\./);
    assert.match(PAGE_FLAT, /it is never shown to reviewers or to a programme&apos;s lead\./);
    // Every file that names a conduct flag, and why it may. None builds
    // anything a lead or a reviewer is shown.
    assertExactlyTheseFiles(
      sourceFilesNaming(/memberConductFlags|[cC]onductFlag|conduct-flag/),
      new Map([
        ["src/lib/firestore/memberConductFlags.ts", "the collection's own shape and the one function that reads a flag"],
        ["src/app/api/admin/members/[uid]/conduct-flag/route.ts", "the admin's route that reads, sets and clears a flag"],
        ["src/features/admin/ConductFlagControl.tsx", "the control for it on the admin Members page"],
        ["src/features/admin/MemberItem.tsx", "the row of the admin Members page that draws that control"],
        ["src/lib/firestore/accountDeletion.ts", "removes the flag when the account is deleted"],
        ["src/lib/firestore/memberRecords.ts", "a comment comparing the two collections' readers. It reads no flag"],
      ]),
      "naming a conduct flag",
      "The policy says only admins read the reason for a flag, and that " +
        "where decisions are made anybody else may see only a marker asking " +
        "them to talk to an admin first. If this file shows the reason to " +
        "anybody else, or more than that marker, the sentence is wrong and a " +
        "new version has to say so.",
    );
    // The membership record is a collection of its own with its own readers:
    // the policy says the person sees their own tier, and that whether they
    // hold membership may be shown to the people deciding sign-ups to an
    // event, and names nobody who reads applications. Nothing in the
    // application system's folders names it.
    assert.match(
      PAGE_FLAT,
      /You can see your own tier on your profile\.[\s\S]*We use the list to record who holds membership, and whether you hold it may be shown to the people deciding sign-ups to an event \(see\{" "\} <a href="#events">Events and attendance<\/a>\)\./,
    );
    const applicationSystem = [
      "src/lib/applications/",
      "src/features/applications/",
      "src/app/api/admissions/forms/",
      "src/app/(app)/admin/admissions/forms/",
      "src/app/(public)/apply/",
      "src/app/(public)/applications/",
    ];
    assert.deepEqual(
      sourceFilesNaming(/firestore\/memberships|firestore\/membershipImports|[mM]embershipTier|["'`]memberships["'`]/).filter(
        (file) => applicationSystem.some((folder) => file.startsWith(folder)),
      ),
      [],
      "these files of the application system now read the membership record. " +
        "The policy names nobody who reads an application among those who " +
        "see the membership tier.",
    );
  });

  test("what is typed on the form's first step is kept in the tab it was typed in, for a day, until the join request is sent", (t) => {
    // The step keeps what somebody types in the tab's own session storage,
    // for every way of making an account. v15 says both copies in one
    // paragraph and gives each its own limits: the tab's copy is kept in
    // that tab, is removed when the request to join is sent, is ignored once
    // it is a day old and goes when the tab is closed. This test holds the
    // tab's copy; the next holds the copy that crosses tabs.
    assert.match(
      PAGE_FLAT,
      /<p> If you start an application before you have an account, what you type on the form&apos;s first step is kept in that browser tab and,/,
    );
    assert.match(
      PAGE_FLAT,
      // The JSX keeps the space before the key with `{" "}`, so allow for it.
      /Both copies use a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>/,
    );
    assert.match(
      PAGE_FLAT,
      /Both are removed when your request to join is sent; the tab&apos;s copy is ignored once it is a day old and goes when you close the tab,/,
    );

    // "Kept in that browser tab", which is also why it "goes when you close
    // the tab": the keeper's own store is session storage, and every change
    // to the answers is written there, whichever way of making an account the
    // person goes on to choose.
    const keeperCode = read("src/features/applications/apply/keptAnswers.ts")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.match(keeperCode, /return typeof window === "undefined" \? null : window\.sessionStorage;/);
    assert.match(keeperCode, /store\.setItem\(keptKey\(roundId\), packKept\(about, Date\.now\(\)\)\)/);
    const tab = standInStore();
    const shared = standInStore();
    globalThis.window = { sessionStorage: tab, localStorage: shared };
    t.after(() => {
      delete globalThis.window;
    });
    const typed = {
      preferredName: "Ada",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: false,
      status: "undergraduate",
      statusOther: "",
      subject: "Mathematics",
      expectedGraduation: "2028-07",
      motivation: "Because it matters.",
      interests: "",
    };
    keptAnswers.keepAnswers("the-tabs-own", typed);
    // "Both copies use a key beginning naisi.apply.join".
    assert.deepEqual([...tab.items.keys()], ["naisi.apply.join:the-tabs-own"]);
    assert.deepEqual(keptAnswers.loadKept("the-tabs-own"), typed, "the tab was not given back what was typed in it");

    // "The tab's copy is ignored once it is a day old."
    const now = Date.UTC(2026, 9, 7, 12);
    const packed = joinRules.packKept(typed, now);
    assert.equal(joinRules.KEPT_MAX_AGE_MS, 24 * 3_600_000);
    assert.ok(joinRules.readKept(packed, now + 24 * 3_600_000), "the tab's own answers are no longer read back within the day");
    assert.equal(joinRules.readKept(packed, now + 24 * 3_600_000 + 1), null, "the tab's own answers were believed for more than a day");

    // "Both are removed when your request to join is sent": the tab's copy.
    assert.match(
      read("src/features/applications/apply/JoinStep.tsx"),
      /await completeRegistration\(joinRequestFrom\(answers\)\);[\s\S]{0,400}?forgetAnswers\(roundId\);/,
      "the join step no longer throws away what the tab kept once the join " +
        "request has gone.",
    );
    keptAnswers.forgetAnswers("the-tabs-own");
    assert.equal(tab.items.size, 0, "the join request has gone and the tab still holds what was typed");
    assert.deepEqual(shared.written, [], "the tab's own copy was written somewhere that outlives the tab");
  });

  test("somebody with no account joins on the form, and what is kept in the browser is what the page says", (t) => {
    assert.match(
      PAGE_FLAT,
      /<strong>Starting without an account\.<\/strong> You can start the form before you have joined\./,
    );
    // OWNER DECISION, 7 October 2026: what is typed before there is an
    // account may be kept where another tab of the browser can read it, with
    // three limits: only for somebody who continues with an email address
    // (the emailed link opens in a tab of its own), for an hour at most, and
    // until the request to join has been sent. The page says each of the
    // three, and each is held to the code below.
    assert.match(
      PAGE_FLAT,
      // The JSX keeps the space before the key with `{" "}`, so allow for it.
      /what you type on the form&apos;s first step is kept in that browser tab and, if you continue with an email address, in your browser&apos;s storage too, so the tab our emailed link opens can find it\. Both copies use a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>/,
    );
    assert.equal(joinRules.keptKey("autumn-2026"), "naisi.apply.join:autumn-2026");

    // The browser's local storage outlives the tab and is read by every tab,
    // so one function alone reaches it, and that function is where the three
    // limits are. Everything else the step keeps is in the tab's own session
    // storage.
    const keeper = read("src/features/applications/apply/keptAnswers.ts");
    const keeperCode = keeper.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.match(keeperCode, /return typeof window === "undefined" \? null : window\.sessionStorage;/);
    assert.equal(
      (keeperCode.match(/\blocalStorage\b/g) ?? []).length,
      1,
      "the step's keeper reaches local storage in more than one place, so " +
        "something typed can be kept there outside the three limits the " +
        "policy states.",
    );
    const oneFunction = keeperCode.slice(
      keeperCode.indexOf("export function acrossTabs("),
      keeperCode.indexOf("export function loadKept("),
    );
    assert.match(oneFunction, /const shared = window\.localStorage;/);

    const tab = standInStore();
    const shared = standInStore();
    globalThis.window = { sessionStorage: tab, localStorage: shared };
    t.after(() => {
      delete globalThis.window;
    });

    // "Hold only your answers to that step and when you last changed them":
    // the rule that packs both copies, run on more than it should keep.
    const typed = {
      preferredName: "Ada",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "Mathematics",
      expectedGraduation: "2028-07",
      motivation: "Because it matters.",
      interests: "",
      password: "not kept",
      email: "not-kept@example.com",
      agreed: true,
    };
    const now = Date.UTC(2026, 9, 7, 12);
    const packed = joinRules.packKept(typed, now);
    assert.deepEqual(Object.keys(JSON.parse(packed)).sort(), ["about", "at", "v"]);
    assert.deepEqual(Object.keys(JSON.parse(packed).about).sort(), [
      "expectedGraduation",
      "interests",
      "motivation",
      "preferredName",
      "status",
      "statusOther",
      "subject",
      "universityEmail",
    ]);
    assert.ok(
      !/not kept|not-kept@example\.com|agreed|universityEmailVerified/.test(packed),
      "what the tab keeps now holds something other than the first step's " +
        "answers. The policy says it holds no password, no sign-in address and " +
        "not whether the person agreed to the terms.",
    );
    assert.match(
      PAGE_FLAT,
      /and hold only your answers to that step and when you last changed them: no password, no sign-in address and not whether you agreed to our terms\. Nothing of it is sent to us until you have signed in\./,
    );

    // LIMIT 1, "if you continue with an email address". Run: on a page
    // that has not asked for an emailed link, nothing the step does writes to
    // local storage. That is every way of making an account but the emailed
    // link: Google's button, and both links to the sign-in page.
    const typedHere = { ...typed, universityEmailVerified: false };
    keptAnswers.keepAnswers("no-link-asked", typedHere);
    keptAnswers.acrossTabs("no-link-asked", "answers-changed", now);
    keptAnswers.loadKept("no-link-asked");
    assert.ok(tab.items.has("naisi.apply.join:no-link-asked"), "the tab kept nothing, so the next line proves nothing");
    assert.deepEqual(
      shared.written,
      [],
      "what somebody typed was written to local storage though no link had " +
        "been emailed. The policy says that happens only for somebody who " +
        "chooses to continue with an email address.",
    );
    // And the step asks for the copy in one place: once the register route
    // has taken the address the link will be emailed to.
    const step = read("src/features/applications/apply/JoinStep.tsx");
    const stepCode = step.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.equal((stepCode.match(/acrossTabs\(/g) ?? []).length, 1);
    assert.match(
      stepCode,
      /const started = await startEmailRegistration\(email, token, joinReturnFor\(roundId\)\);\s*setBusy\(null\);\s*if \(!started\.ok\) \{\s*setError\(started\.error\);\s*return;\s*\}\s*acrossTabs\(roundId, "link-emailed"\);/,
      "the copy that crosses tabs is no longer made at the one moment the " +
        "policy names: when somebody has chosen to continue with an email " +
        "address and the link is on its way.",
    );

    // "So the tab our emailed link opens can find it", and what crosses is
    // the tab's own text: the same answers and the same time.
    tab.items.set("naisi.apply.join:link-asked", packed);
    keptAnswers.acrossTabs("link-asked", "link-emailed", now + 60_000);
    assert.equal(shared.items.get("naisi.apply.join:link-asked"), packed);
    assert.deepEqual([...shared.items.keys()], ["naisi.apply.join:link-asked"]);
    // The link's tab has a session store of its own, with nothing in it.
    const linksTab = standInStore();
    globalThis.window = { sessionStorage: linksTab, localStorage: shared };
    assert.equal(
      keptAnswers.acrossTabs("link-asked", "read", now + 120_000)?.preferredName,
      "Ada",
      "the tab the emailed link opens was not given the answers",
    );
    assert.deepEqual(linksTab.written, [], "reading the copy wrote something");
    // And a page that opens asks for it: its own tab's answers first, then these.
    assert.match(keeperCode, /const left = acrossTabs\(roundId, "read"\);/);
    assert.match(keeperCode, /return readKept\(keptStore\(\)\?\.getItem\(keptKey\(roundId\)\), Date\.now\(\)\) \?\? left;/);

    // LIMIT 2, "the other is ignored once it is an hour old". The rule, run
    // at the hour and a millisecond past it, and then the function itself.
    assert.match(
      PAGE_FLAT,
      /Both are removed when your request to join is sent; the tab&apos;s copy is ignored once it is a day old and goes when you close the tab, and the other is ignored once it is an hour old\./,
    );
    assert.equal(joinRules.ACROSS_TABS_MAX_AGE_MS, 3_600_000);
    assert.ok(joinRules.readKept(packed, now + 3_600_000, joinRules.ACROSS_TABS_MAX_AGE_MS));
    assert.equal(joinRules.readKept(packed, now + 3_600_001, joinRules.ACROSS_TABS_MAX_AGE_MS), null);
    assert.ok(keptAnswers.acrossTabs("link-asked", "read", now + 3_600_000), "the copy was not believed within its hour");
    assert.equal(keptAnswers.acrossTabs("link-asked", "read", now + 3_600_001), null, "a copy more than an hour old was believed");
    assert.equal(shared.items.size, 0, "a copy past its hour was left in local storage");

    // LIMIT 3, "Both are removed when your request to join is sent": the step
    // forgets straight after the join request, and forgetting is both copies.
    assert.match(
      stepCode,
      /await completeRegistration\(joinRequestFrom\(answers\)\);\s*\} catch \(err\) \{[^}]*return false;\s*\}\s*forgetAnswers\(roundId\);/,
      "the join step no longer throws away what it kept the moment the join " +
        "request has gone.",
    );
    globalThis.window = { sessionStorage: tab, localStorage: shared };
    tab.items.set("naisi.apply.join:sent", packed);
    keptAnswers.acrossTabs("sent", "link-emailed", now);
    assert.equal(shared.items.size, 1);
    keptAnswers.forgetAnswers("sent");
    assert.equal(shared.items.size, 0, "the join request has gone and the copy is still in local storage");
    assert.equal(tab.items.has("naisi.apply.join:sent"), false);

    // "Joining this way does not sign you up to the newsletter or to event
    // announcements", which "start switched off until you choose them": the
    // join request the step sends, run.
    assert.match(PAGE_FLAT, /Joining this way does not sign you up to the newsletter or to event announcements\./);
    assert.match(PAGE_FLAT, /The newsletter and event announcements start switched off until you choose them\./);
    const request = joinRules.joinRequestFrom(typed);
    assert.equal(request.notifications.categories.newsletter, false);
    assert.equal(request.notifications.categories.events, false);
    assert.equal(request.notifications.push.newsletter, false);
    assert.equal(request.notifications.push.events, false);
    assert.equal(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories.newsletter, false);
    // And it never claims the university address is verified.
    assert.ok(!("verifiedTokenId" in request) && !("uniEmailVerifiedAt" in request));
  });

  test("a waiting account cannot send until its university address is verified, and an approved one is not held", () => {
    assert.match(
      PAGE_FLAT,
      /<strong>Your account while you apply\.<\/strong> You can apply while your request to join is waiting, and send once your university address is confirmed\./,
    );
    const unchecked = { universityEmail: "ada@nottingham.ac.uk", universityEmailVerified: false };
    const checked = { universityEmail: "ada@nottingham.ac.uk", universityEmailVerified: true };
    assert.equal(joinRules.sendHoldFor({ joined: true, role: "pending", about: unchecked })?.step, "check");
    assert.equal(joinRules.sendHoldFor({ joined: true, role: "pending", about: checked }), null);
    assert.equal(joinRules.sendHoldFor({ joined: true, role: "member", about: unchecked }), null);
    assert.equal(joinRules.sendHoldFor({ joined: false, role: "pending", about: checked })?.step, "about");
    // The send route asks that rule of the caller's own account, before the
    // application is read or sent.
    const sendRoute = read("src/app/api/admissions/forms/[roundId]/application/send/route.ts");
    const asked = sendRoute.indexOf("const hold = sendHoldFor({ joined: account.joined, role: user.role, about: account.about });");
    const sent = sendRoute.indexOf("await sendApplication(");
    assert.ok(asked !== -1, "the send route no longer asks whether this account's send is held");
    assert.ok(sent !== -1 && asked < sent, "the send route sends before it asks whether the send is held");
  });

  test("the last step says sending is agreeing to this policy, with the policy's own date", () => {
    assert.match(
      PAGE_FLAT,
      /The application form&apos;s last step says that sending your application is agreeing to this policy, with the date it was last updated\./,
    );
    const words = read("src/features/applications/apply/checkText.ts");
    assert.match(words, /before: "By sending, you agree to our ",/);
    assert.match(
      words,
      /const updated = policyDateLabel\(currentPolicy\("privacy"\)\.lastUpdated\);/,
      "the date on the form's last step is no longer read from the policy's " +
        "own list, so the page and the form can come to name different days.",
    );
    assert.match(read("src/features/applications/apply/CheckStep.tsx"), /\{agreement\.before\}/);
    // The form itself asks nobody to accept the policy, its last step says
    // what sending means (v14 said the form "does not ask that question"):
    // the form is a public page, outside the layout the re-consent gate
    // lives on (§3).
    assert.ok(existsSync(join(SRC, "app", "(public)", "apply", "[roundId]", "page.tsx")));
  });
});

// ---------------------------------------------------------------------------
// §2e What loads from Google, and what is kept in the browser
// ---------------------------------------------------------------------------

/**
 * Three sentences of the policy are lists of places: the forms Google
 * reCAPTCHA runs on, the pages Google's sign-in script is loaded on, and the
 * things the site keeps in the browser's local storage. A list is true until
 * somebody adds a place and does not think of this page, so each is held to
 * a walk of the tree. Since v15 the first is said twice, in the policy's
 * cookies section and in reCAPTCHA's line on /privacy/services
 * (src/content/legal/services.ts), and both are held here.
 */
describe("what loads from Google, and what the browser keeps", () => {
  test("Google reCAPTCHA runs on the forms the page names, and nowhere else", async () => {
    const { OUTSIDE_SERVICES } = await loadTs("content/legal/services.ts");
    const recaptcha = OUTSIDE_SERVICES.find((service) => service.id === "recaptcha");
    assert.ok(recaptcha, "the services page no longer lists Google reCAPTCHA");
    assert.match(
      recaptcha.does,
      /^Checks that the person filling in our registration, event sign-up and application forms is not a bot\./,
    );
    assert.match(
      PAGE_FLAT,
      /The one exception is Google reCAPTCHA, which sets a cookie of its own while it runs on our registration, event sign-up and application forms \(see\{" "\} <a href=\{SERVICES_HREF\}>Services we use<\/a>\)\./,
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/<RecaptchaInvisible\b/),
      new Map([
        ["src/app/(auth)/AuthEntry.tsx", "the registration form: mounted in register mode only, never on the sign-in screen"],
        ["src/features/events/RsvpForm.tsx", "an event's sign-up form, for everybody who has it on screen"],
        ["src/features/admissions/ApplyFlow.tsx", "the application form of the older kind of round, a course application form"],
        ["src/features/applications/apply/JoinAccount.tsx", "the application form's first step, at the point somebody with no account makes one"],
      ]),
      "rendering Google reCAPTCHA",
      "The policy and the services page name every form it runs on. Add the " +
        "form to those sentences (a new version for the policy's, and the " +
        "services list with its notice), or take the check off the form.",
    );
    // "On the application form it runs only while somebody who is not signed
    // in is making an account" (the services page; v14 added "and never for
    // somebody who is already signed in"): the half of the step that mounts
    // it is drawn for a visitor only, and the form a signed-in applicant
    // fills in does not load it at all.
    assert.match(
      recaptcha.does,
      /On the application form it runs only while somebody who is not signed in is making an account\.$/,
    );
    assert.match(
      read("src/features/applications/apply/JoinStep.tsx"),
      /const shown: View = signedIn \? "questions" : view;/,
      "the join step can now show the make-an-account half, and with it the " +
        "spam check, to somebody who is already signed in.",
    );
    assert.ok(
      !/Recaptcha/i.test(read("src/features/applications/apply/ApplicationForm.tsx")),
      "the form a signed-in applicant fills in now loads the spam check, " +
        "which the services page says it runs on only while somebody who is " +
        "not signed in is making an account.",
    );
  });

  test("Google's sign-in script is loaded where the page says, and nowhere else", () => {
    // v14 added "and not before" to the application form's place; v15's
    // "when somebody who is not signed in continues to making an account"
    // names the moment, and JoinAccount.tsx below is the half of the step
    // drawn from that moment on.
    assert.match(
      PAGE_FLAT,
      /Google&apos;s sign-in script is loaded from\{" "\} <code>accounts\.google\.com<\/code> on the sign-in and register pages, as soon as you press a link to one of them, and on the first step of the application form when somebody who is not signed in continues to making an account\. Loading it tells Google that a browser opened one of those pages\./,
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/accounts\.google\.com\/gsi\/client/),
      new Map([
        ["src/app/(auth)/layout.tsx", "the sign-in and register pages"],
        ["src/layout/TransitionLink.tsx", "a link to one of those pages, from the moment it is pressed"],
        ["src/features/applications/apply/JoinAccount.tsx", "the application form's first step, once a visitor continues to making an account"],
        ["src/components/GoogleSignInButton.tsx", "a comment saying which script the button needs. It loads nothing itself"],
        ["src/types/google.d.ts", "a comment on the types of that script. It loads nothing"],
      ]),
      "naming Google's sign-in script",
      "The policy says where that script is loaded, because loading it tells " +
        "Google a browser opened the page. Add the place to that sentence in a " +
        "new version, or do not load it there.",
    );
  });

  test("the browser's local storage holds the four preferences and the one copy the page describes, and nothing else", () => {
    assert.match(PAGE_FLAT, /In your browser&apos;s own storage the site keeps four small preferences that never leave your device:/);
    const users = new Map([
      ["src/layout/AppShell.tsx", "naisi.sidebar.collapsed"],
      ["src/features/pwa/lastRoute.ts", "naisi.lastRoute"],
      ["src/features/pwa/installPrompt.ts", "naisi.installCard.dismissed"],
      ["src/app/(auth)/AuthEntry.tsx", "naisi.auth.loaderOpen"],
    ]);
    for (const [file, key] of users) {
      assert.ok(read(file).includes(`"${key}"`), `${file} no longer keeps ${key} in local storage`);
      assert.ok(PAGE_FLAT.includes(`<code>${key}</code>`), `the policy no longer lists ${key}`);
    }
    // The fifth thing is not a preference: what somebody typed on the
    // application form's first step, for the tab an emailed link opens. The
    // page says so in a paragraph of its own, with the key it is under, and
    // §2d holds that paragraph's three limits to the one function that
    // reaches local storage from the form.
    assert.match(
      PAGE_FLAT,
      /if you continue with an email address, in your browser&apos;s storage too, so the tab our emailed link opens can find it\. Both copies use a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>/,
    );
    assert.ok(joinRules.keptKey("any-form").startsWith("naisi.apply.join"));
    assertExactlyTheseFiles(
      sourceFilesNaming(/\blocalStorage\b/),
      new Map([
        ...[...users].map(([file, key]) => [file, `keeps ${key}, which the page lists by name`]),
        [
          "src/features/applications/apply/keptAnswers.ts",
          "keeps, for somebody who continues with an email address, a copy of the application form's first step under a key beginning naisi.apply.join, which the page describes with its three limits",
        ],
        ["src/features/pwa/LastRouteTracker.tsx", "a comment about the last-route key, which lastRoute.ts keeps"],
        ["src/features/admissions/ApplyFlow.tsx", "a comment saying the older form deliberately keeps no copy there"],
        ["src/features/courses/PacingBanner.tsx", "a comment saying a dismissal is deliberately not kept there"],
      ]),
      "naming the browser's local storage",
      "The policy lists exactly what the site keeps there: four preferences " +
        "by name, and one copy of the application form's first step with the " +
        "key it is under. Something kept there that the page does not say " +
        "makes the page wrong: say it in a new version, or keep it somewhere " +
        "that does not outlive the tab.",
    );
  });
});

// ---------------------------------------------------------------------------
// §2f The account record passage
// ---------------------------------------------------------------------------

/**
 * One sentence under "Joining" (in "Your account") says that a member's own
 * change to their degree or their expected graduation is kept with what it
 * said before, and who is shown that. It is held here against the function
 * the profile's save calls, the rule that refuses a save without the entry,
 * and the one page that shows it. v14 also said the change is made on the
 * profile, that the entry is part of the account record and that admins see
 * it on their page for the account; v15 leaves those out, and the code that
 * made them true is still held below.
 *
 * What the sentence is careful NOT to say is as much a part of it: it does
 * not say only admins can read the record (it is part of the account record,
 * which the Security section says who can read), and it does not say every
 * change to a profile is kept.
 */
const studyChange = await loadTs("features/profile/studyChange.ts");

describe("the account record passage", () => {
  const SENTENCE =
    /If you later change your degree or expected graduation, we keep what it said before and when you changed it, and admins can see that\./;

  test("a member's own change of degree or graduation is kept with what it said before, and an admin's page shows it", () => {
    assert.match(PAGE_FLAT, SENTENCE);
    // It follows the profile's fields, in "Joining": that paragraph is where
    // the page says what a profile holds.
    const joining = PAGE_FLAT.slice(
      PAGE_FLAT.indexOf("<strong>Joining.</strong>"),
      PAGE_FLAT.indexOf("<strong>Membership.</strong>"),
    );
    assert.ok(joining.length > 200, "could not find the passage about joining");
    assert.match(joining, SENTENCE);
    assert.ok(
      joining.indexOf("and a profile: the name you go by") !== -1 &&
        joining.indexOf("and a profile: the name you go by") < joining.search(SENTENCE),
      "the sentence about a changed degree is no longer after the words that list the profile's fields",
    );

    // "We keep what it said before and when you changed it": the function the
    // profile's save calls, run. A change of both leaves one entry holding
    // what each said, and the time is the one it is handed, which the form
    // makes the server's.
    const write = studyChange.studyWrite({
      role: "member",
      stored: { subject: "BSc Mathematics", expectedGraduation: "2027-07" },
      subject: "BSc Physics",
      expectedGraduation: "2028-07",
      noted: 0,
      entryId: "entry1",
      serverTime: "the server's time",
    });
    assert.equal(write.ok, true);
    assert.deepEqual(write.patch["studyChanges.entry1"], {
      at: "the server's time",
      subject: "BSc Mathematics",
      expectedGraduation: "2027-07",
    });
    // "If you later change": a first answer is not a change, and a save that
    // changes neither field keeps nothing.
    const first = studyChange.studyWrite({
      role: "member",
      stored: {},
      subject: "BSc Physics",
      expectedGraduation: "2028-07",
      noted: 0,
      entryId: "entry2",
      serverTime: "the server's time",
    });
    assert.deepEqual(Object.keys(first.patch).sort(), ["profile.expectedGraduation", "profile.subject"]);
    const same = studyChange.studyWrite({
      role: "member",
      stored: { subject: "BSc Physics", expectedGraduation: "2028-07" },
      subject: "BSc Physics",
      expectedGraduation: "2028-07",
      noted: 0,
      entryId: "entry3",
      serverTime: "the server's time",
    });
    assert.deepEqual(same.patch, {});

    // On the profile (v14's words; v15 says "if you later change"): the
    // profile's form sends what that function returns, in its one write,
    // with the server's own time.
    const form = read("src/features/profile/ProfileForm.tsx");
    assert.match(form, /const study = studyWrite\(\{/);
    assert.match(form, /serverTime: serverTimestamp\(\),/);
    assert.match(form, /\.\.\.study\.patch,/);
    // And a member's own save that changes either field without the entry is
    // refused by the rule, so the record cannot be skipped from a console.
    const rules = read("firestore.rules");
    assert.match(rules, /function studyChangesHold\(\) \{/);
    assert.match(
      rules,
      /&& studyChangesHold\(\)\)\)/,
      "the users rule no longer holds a member's own update to the record of " +
        "what their degree and graduation said before.",
    );

    // Part of the account record (v14's words): the entries are on the
    // account's own document, and nothing under src copies them anywhere
    // else. Every file that names them, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bstudyChanges\b/),
      new Map([
        ["src/lib/firestore/users.ts", "the shape of an account document, which is where the entries are declared and read back"],
        ["src/features/profile/studyChange.ts", "the one function that makes an entry, for the member's own save"],
        ["src/features/profile/ProfileForm.tsx", "the member's own profile form, which counts the entries and sends the new one"],
        ["src/features/admin/MemberItem.tsx", "the admin's page for one account, which hands the entries to the block that shows them"],
      ]),
      "naming the record of a changed degree or graduation",
      "The policy says what the degree or graduation said before is kept and " +
        "that admins can see it (v14 added: as part of the account record, on " +
        "their page for the account). If this file copies it somewhere else, " +
        "or shows it to somebody else, the sentence is wrong and a new version " +
        "has to say so.",
    );
    assert.match(read("src/lib/firestore/users.ts"), /const studyChanges = asStudyChanges\(data\.studyChanges\);/);

    // "And admins can see that": one component draws it, one file mounts that
    // component, and the page that file is drawn on is under the layout that
    // admits an admin and nobody else.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bStudyChangeNotes\b/),
      new Map([
        ["src/features/admin/StudyChangeNotes.tsx", "the block that shows what a member's degree and graduation said before"],
        ["src/features/admin/MemberItem.tsx", "the admin's page for one account, which is the one place the block is mounted"],
      ]),
      "showing what a degree or graduation said before",
      "The policy says admins can see it, and names nobody else.",
    );
    assert.match(read("src/features/admin/MemberItem.tsx"), /<StudyChangeNotes\b/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/from "(?:\.\/|@\/features\/admin\/)MemberItem"/),
      new Map([["src/features/admin/MemberPage.tsx", "the page for one account, which draws that account's details"]]),
      "drawing the admin's view of one account",
      "The block that shows an earlier degree or graduation is on this view, which the policy says admins see.",
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/from "@\/features\/admin\/MemberPage"/),
      new Map([
        ["src/app/(app)/admin/(admin-only)/members/[uid]/page.tsx", "the admin area's page for one account, under the layout that admits an admin alone"],
      ]),
      "the page that draws one account for an admin",
      "The policy says admins can see the record, on this page alone.",
    );
    assert.match(read("src/app/(app)/admin/(admin-only)/layout.tsx"), /await requireAdminPage\(\);/);

    // The account record goes when the account does, which is why the page's
    // list of what a deletion removes needs no line of its own for this.
    assert.match(PAGE_FLAT, /Deleting it removes your account and profile,/);
    assert.match(read("src/lib/firestore/accountDeletion.ts"), /const userRef = db\.collection\("users"\)\.doc\(uid\);/);
  });

  test("the page does not say more about that record than is so", () => {
    // Who is SHOWN the record is admins, on one page. Who can READ an account
    // record is said in the Security section, and it is more people than
    // admins: the committee members the Students' Union recognises can read
    // members' account records, and this is part of one.
    const at = PAGE_FLAT.indexOf("If you later change your degree");
    assert.ok(at !== -1, "could not find the sentence about a changed degree");
    assert.ok(
      !/only admins (?:can )?(?:see|read) (?:that|it|what it said before)/i.test(PAGE_FLAT.slice(at, at + 500)),
      "the policy says only admins can read what a degree or graduation said " +
        "before. It is part of the account record, which the Security section " +
        "says SU-recognised committee members can read as well.",
    );
    assert.match(
      PAGE_FLAT,
      /Member personal data is readable only by the committee members the Students&apos; Union recognises and by admins,/,
    );
    // An account still waiting to be approved is not noted: what it holds is
    // its join request, and its owner cannot open the profile page to change it.
    const waiting = studyChange.studyWrite({
      role: "pending",
      stored: { subject: "BSc Mathematics" },
      subject: "BSc Physics",
      expectedGraduation: null,
      noted: 0,
      entryId: "entry4",
      serverTime: "the server's time",
    });
    assert.deepEqual(Object.keys(waiting.patch), ["profile.subject"]);
  });
});

// ---------------------------------------------------------------------------
// §2g The course hub passage
// ---------------------------------------------------------------------------

/**
 * What the policy says about a programme while it runs and when it ends, held
 * against the code that makes it true (docs/courses-ops.md).
 *
 * Each test is a claim the page makes about somebody's data, paired with the
 * code behind it the way §2d holds the application form: a rule is RUN, the
 * tree is WALKED against a named list checked in both directions, or one line
 * of source is matched. The suites that run each feature as every kind of
 * caller are named beside its pairing; this section holds the seam between
 * them and the page. When one fails, either the code stopped doing what the
 * page promises or the page stopped saying what the code does, and a change
 * to the words is a new version.
 *
 * v15 says what is kept, who reads it and for how long, and leaves out which
 * screen shows what and the names of jobs and fields. Where it left out a
 * detail v14 spelled out, the check on the code stayed, held to the sentence
 * of v15 that covers it, and the test says which detail went. Where a v15
 * sentence says more than the code does, the test holds the code, pins the
 * nearest sentence it can honestly hold, and says the sentence is reported.
 */

/** A file's code with its comments taken out, so a note about a field is not taken for a use of it. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/**
 * Each sentence, word for word as the page source has it (JSX entities and
 * `{" "}` included), or a failure that quotes it.
 */
const assertHubSays = (...sentences) => {
  for (const sentence of sentences) {
    assert.ok(PAGE_FLAT.includes(sentence), `the policy no longer says: ${sentence}`);
  }
};

/**
 * The paragraph or list item that starts with `leadIn` (its bold lead-in, as
 * a rule), up to the tag that closes it, or "" when the page has none. A
 * sentence pinned inside its passage moves with the passage, and a check that
 * a passage names nothing more reads only that passage.
 */
const hubPassageOf = (leadIn) => {
  const from = PAGE_FLAT.indexOf(leadIn);
  if (from === -1) return "";
  const ends = ["</p>", "</li>"].map((tag) => PAGE_FLAT.indexOf(tag, from)).filter((at) => at !== -1);
  return ends.length === 0 ? "" : PAGE_FLAT.slice(from, Math.min(...ends));
};

const finishingWords = await loadTs("lib/courses/finishing/words.ts");
const freedPlaceRules = await loadTs("lib/applications/freedPlaces/rules.ts");
const invitationReminders = await loadTs("lib/applications/decisionDay/reminders.ts");
const applicationAccess = await loadTs("lib/applications/access.ts");
/** The notes a group shares: the record's one question about a run, and the words around the notes. Both pure. */
const sharedNotesRecord = await loadTs("lib/firestore/courseGroupSharedNotes.ts");
const sharedNotesWords = await loadTs("lib/courses/sharedNotes/words.ts");
/** What each session in a calendar link says. Pure. */
const calendarWords = await loadTs("lib/courses/calendarWords.ts");
/** Who reads a week's fill-in boxes, as the page says it under them. Pure. */
const fillInWords = await loadTs("lib/courses/fillInWords.ts");
/**
 * A survey's words (the confidential box, the answer page), its questions
 * (Worksheets' item model), its spreadsheet's layout and its record's own
 * normaliser. All pure: the survey's readers and writers are read as source.
 */
const surveyWords = await loadTs("lib/surveys/words.ts");
const surveyItems = await loadTs("lib/surveys/items.ts");
const surveyTemplates = await loadTs("lib/surveys/templates.ts");
const surveyNamesOff = await loadTs("lib/surveys/namesOff.ts");
const surveyProfileOffer = await loadTs("lib/surveys/profileOffer.ts");
const surveyExport = await loadTs("lib/surveys/exportTable.ts");
const surveyRecords = await loadTs("lib/firestore/surveys.ts");
/** The check-in at the end of a session: its rules and its questions, both pure. */
const checkInModel = await loadTs("lib/surveys/checkIns/model.ts");
const checkInTemplate = await loadTs("lib/surveys/checkIns/template.ts");
/** The Kairos file's layout. Pure: its route and its loader are read as source. */
const kairosFileTable = await loadTs("lib/kairos/fileTable.ts");
/** The Kairos choice's record and words, who rates whom, and the Kairos report's counting. All pure. */
const kairosModel = await loadTs("lib/kairos/model.ts");
const kairosWords = await loadTs("lib/kairos/words.ts");
const ratingRules = await loadTs("lib/ratings/rules.ts");
const ratingModel = await loadTs("lib/ratings/model.ts");
const kairosReport = await loadTs("lib/surveys/kairosReport.ts");
/** Survey code imported from anywhere: the library, its components and its record. */
const SURVEY_CODE = /(?:\bfrom\s*|\bimport\s*\(\s*)"(?:@\/(?:lib\/surveys|features\/surveys|lib\/firestore\/surveys)|(?:\.{1,2}\/)+(?:[\w-]+\/)*surveys)["\/]/;
/** Whether a file is survey code itself, rather than code that reaches it. */
const insideSurveyCode = (file) =>
  file.startsWith("src/lib/surveys/") || file.startsWith("src/features/surveys/") || file === "src/lib/firestore/surveys.ts";
/** The two survey collections that name a person: who it was sent to, and what they answered. */
const SURVEY_STORE = /\bSURVEY_(?:ANSWERS|PEOPLE)_COLLECTION\b|["'`](?:surveyAnswers|surveyPeople)["'`]/;
/** Whether somebody has said they are coming: the one reading, pure. */
const comingReplies = await loadTs("lib/applications/status/coming.ts");
/** The week you submit: who reads a written answer and from when, its other words, and its one answer to whether the answer may be read. */
const weekWorkWords = await loadTs("lib/courses/weekWork/words.ts");
const weekWorkModel = await loadTs("lib/courses/weekWork/model.ts");
/** The anonymous form's records: what an answer holds, and the readers' order. Pure. */
const anonymousRecords = await loadTs("lib/anonymousFeedback/model.ts");

describe("the course hub passage", () => {
  test("the frozen v6 carries none of these sentences, so the move was a version and not an edit", () => {
    for (const pattern of [
      /we will send a certificate to everybody/i,
      /until you turn its link on, only you can open it/i,
      /A certificate whose link is off is deleted with your account/i,
      /Sending a pitch is choosing to share it/i,
      /We then email you your team&apos;s name/i,
      /If you give a reason, only admins and, where the programme has one, its lead read it/i,
      /A place that comes back/i,
      /If you would like to facilitate\./i,
      /can read your answers to the questions about facilitating/i,
      /Being asked to facilitate\./i,
      /We keep a record of each ask/i,
      /The lead also reads the answers about facilitating/i,
      /the asks to facilitate a group sent to you/i,
      /we mark as finished everybody who came to at least/i,
      /reads every register of its groups/i,
      /by name only/i,
      /Four\s+kinds are logged today/i,
      /Four of those downloads are recorded/i,
      /Five of those downloads are recorded/i,
      /The Kairos file holds/i,
      /Nobody is taken off a programme by it/i,
      /Notes facilitators share\./i,
      /the notes the group&apos;s facilitators share with each other/i,
      /the notes its groups&apos; facilitators share/i,
      /Notes shared with your group\./i,
      /the people in your group see the notes you share with it/i,
      /On a programme anyone can join you can also leave a comment on it/i,
      /Your calendar link\./i,
      /the old link then shows nothing/i,
      /Boxes you fill in\./i,
      /Some weeks have boxes for you to fill in/i,
      /your calendar link, the notes you shared with a group, notes you wrote for the other facilitators of a group/i,
      /<strong>Reflections\.<\/strong>/i,
      /<strong>Ticks\.<\/strong>/i,
      /without saying who wrote it/i,
      /we use what it says to improve the course/i,
      /When you answer a survey/i,
      /Every survey is confidential/i,
      /Facilitators never see anything of a survey/i,
      /A survey records nothing about how you fill it in/i,
      /One form is anonymous/i,
      /Answers to the anonymous form/i,
      /a job moves the day&apos;s answers together/i,
      /A survey and its reminder are emailed as important notices/i,
      /We take your name off your answers to a survey/i,
      /your name on your survey answers/i,
      /Your answers to surveys, no longer linked to you/i,
      /contact you at 6 and 12 months/i,
      /the survey at the end asks you the same/i,
      /Sharing with Kairos/i,
      /Kairos/,
      /Ratings at the end of a programme/i,
      /every rating you gave or were given/i,
      /These never name anybody/i,
      /For an incubator we may also pass on the links/i,
      /A programme&apos;s surveys ask about/i,
      /starts its questions about your level and subject of study/i,
      /what you said about follow-ups/i,
      /A written answer is read by you, your group&apos;s facilitators/i,
      /that feedback on your written answer is waiting/i,
      /how many written answers they sent/i,
      /your written answers with the feedback on them/i,
      /Pathways and cases\./i,
      /which ones you were given is recorded on the site/i,
      /the packs and cases recorded for you/i,
      /Pairs for a session\./i,
      /who you are paired with/i,
      /saying yes also puts you in that group/i,
      /If you facilitate your own group\./i,
      /A facilitator who held a place and finished is sent both/i,
      // The survey about leaving (Q46), new in v7.
      /a survey about leaving open/i,
      /the survey about leaving is confidential/i,
      /the lead may still be able to tell which answer is yours/i,
      /and the survey about leaving while it is yours to answer/i,
      // Sealed predictions (Zach's extra (d)), new in v7.
      /Sealed predictions\./i,
      /Once you seal your card, nobody can change it/i,
      /Each time an admin opens a card, we record who opened it/i,
    ]) {
      assert.ok(
        !pattern.test(V6_FLAT),
        `the accepted v6 text matches ${pattern}: the course hub's wording was edited into ` +
          "the frozen version instead of living in v7, which is the in-place edit " +
          "§1b exists to refuse",
      );
    }
  });

  test("a programme's lead reads every register of its groups, and is sent none of their notes", () => {
    // OWNER DECISION, 25 October 2026: the notes a facilitator writes on a
    // register, about a named person or about a session as a whole, are the
    // group's facilitators' and admins' (C30). A programme's lead reads every
    // register of the run its programme names, its marks and none of its
    // notes. The policy says a facilitator sees the register, that the lead
    // sees everything a facilitator sees, for every group, except the notes
    // facilitators write about a named person or a session (and people's
    // private notes on the material), and that a note about a named person
    // after a session is read by the group's facilitators and admins:
    // `readsNotes`, held below, which also keeps the register's note on a
    // session as a whole from a lead.
    // The lead does read the notes its groups' facilitators keep for each
    // other and the notes each group shares on its week pages, each held to
    // its reader further down.
    const EXCEPT = " except the notes facilitators write about a named person or a session, and the private notes people keep on the material,";
    const facilitators = hubPassageOf("<strong>What your facilitators see.</strong>");
    const lead = hubPassageOf("<strong>What the people leading a programme see.</strong>");
    assert.ok(facilitators.length > 100, "could not find what the page says a group's facilitators see");
    assert.ok(lead.length > 100, "could not find what the page says a programme's lead sees");
    assert.ok(facilitators.includes(" The register, your work and progress "), "the policy no longer says a group's facilitators see the register");
    assert.ok(
      lead.includes(`<strong>What the people leading a programme see.</strong>{" "} Everything a facilitator sees, for every group,${EXCEPT} and also:`),
      "the policy no longer says the lead sees everything a facilitator sees, for every group, but the notes about a named person and the private notes",
    );
    assert.ok(
      PAGE_FLAT.includes("Facilitators may also write a note about a named person after a session, which the group&apos;s facilitators and admins read."),
      "the policy no longer says a note about a named person after a session is read by the group's facilitators and admins",
    );
    assert.ok(
      !/\bnotes?\b/i.test(lead.replace(EXCEPT, "")),
      "the policy now names notes among what a programme's lead sees, beyond the ones it keeps from the lead. The notes on a register are the " +
        "group's facilitators' and admins', and the register's GET sends a lead none of them.",
    );
    assert.ok(
      !/\bnotes?\b/i.test(facilitators),
      "the paragraph the lead's \"Everything a facilitator sees\" points at now names notes, so the policy " +
        "says the lead reads them. The register's GET sends a lead none of a register's notes.",
    );

    // Admitted to read every register of the run: the read gate asks the
    // form whether the caller leads the programme that names the run.
    const gate = read("src/lib/courses/registerAccess.ts");
    assert.match(
      gate,
      /\(await programmeLedBy\(db, actor, group\.runId\)\) !== null;/,
      "the register's read gate no longer admits the programme's lead, so the " +
        "policy says the lead reads registers the lead cannot open.",
    );
    // And not one of the readers of its notes.
    assert.match(
      gate,
      /return \{ ok: true, group, runId: group\.runId, isAdmin, readsNotes: isAdmin \|\| facilitatesLiveGroup \};/,
      "the register's read gate no longer says that its notes are for an " +
        "admin and the group's live facilitators alone, so a caller admitted " +
        "only as the programme's lead may be sent them. The policy says the " +
        "lead reads the registers and names no note.",
    );
    const register = read("src/app/api/courses/groups/[groupId]/attendance/route.ts");
    assert.match(
      register,
      /const rawNotes = \(gated\.readsNotes \? \(data\.participantNotes \?\? \{\}\) : \{\}\) as Record<string, unknown>;/,
      "the register's GET sends the notes about named people to every caller " +
        "its gate admits, the programme's lead included.",
    );
    assert.match(
      register,
      /notes: gated\.readsNotes && typeof data\.notes === "string" \? data\.notes : "",/,
      "the register's GET sends a session's own note to every caller its gate " +
        "admits, the programme's lead included.",
    );
    // The drawer that writes a note is the register's own gate, which admits
    // the group's live facilitators and admins and no lead.
    assert.match(
      read("src/app/api/courses/groups/[groupId]/participant-notes/route.ts"),
      /const gated = await gateGroupRegister\(groupId, actor, db\);/,
    );
    // Every file that names the notes about named people, and why it may.
    // The register's GET is the one door that hands them to a reader.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bparticipantNotes\b/),
      new Map([
        ["src/app/api/courses/groups/[groupId]/attendance/route.ts", "the register's GET, the one door that hands a register's notes to a reader, and only to the readers its gate's readsNotes names"],
        ["src/app/api/courses/groups/[groupId]/participant-notes/route.ts", "the note drawer's write, behind the register's own gate: the group's live facilitators and admins"],
        ["src/features/courses/AttendanceGrid.tsx", "the register's grid, which draws the notes the GET sent it"],
        ["src/features/courses/useAttendance.ts", "the grid's data, which holds the notes the GET sent and keeps one just saved"],
        ["src/lib/courses/ownAttendance.ts", "a comment saying a member's own attendance is read without the room's notes"],
        ["src/lib/firestore/accountDeletion.ts", "takes a deleted person's notes out of every register"],
        ["src/lib/firestore/courseAttendance.ts", "the register document's own shape"],
      ]),
      "naming the notes on a register",
      "A register's notes about named people are read by the group's " +
        "facilitators and admins. The policy names the programme's lead as a " +
        "reader too, which this code does not do (see the REPORTED note at the " +
        "top of this test). If this file hands them to anybody beyond those " +
        "three, the policy is wrong and a new version has to say so; if it hands " +
        "them to the lead, this test changes with it.",
    );
    // tests/course-hub-lead-registers.test.mjs runs the GET as each caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-lead-registers.test.mjs")));
  });

  test("a leaver's reason is read by the programme's lead and admins, kept with the place, and copied nowhere that outlives it", () => {
    // The reason's readers and where it is kept, in Leaving; that the lead
    // reads it, in what the people leading a programme see; and that it goes
    // with the account, as the place it is kept on does.
    assert.ok(
      hubPassageOf("<strong>Leaving.</strong>").includes(
        "A reason you give is read by admins and the programme&apos;s lead only, and is kept with your place, not your application.",
      ),
      "the policy no longer says who reads a leaver's reason, and that it is kept with the place",
    );
    assert.ok(
      hubPassageOf("<strong>What the people leading a programme see.</strong>").includes(" the reasons people give for leaving,"),
      "the policy no longer names the reasons people give for leaving among what a programme's lead sees",
    );
    assert.ok(hubPassageOf("<strong>Deleting your account.</strong>").includes(" your places on programmes,"), "the policy no longer says a deletion removes somebody's places on programmes");
    // Every file that names it, and why it may. One reads it out to anybody:
    // the programme's Overview.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bdropOutReason\b/),
      new Map([
        ["src/lib/firestore/courseEnrolments.ts", "the place's own shape, where the reason is kept, and its length limit"],
        ["src/lib/courses/leaveRun.ts", "the one writer: leaving puts the reason on the place, and nowhere else"],
        ["src/lib/courses/programmeOverview.ts", "the one reader: the programme's Overview, which is built for its lead and admins"],
        ["src/app/api/courses/runs/[runId]/enrol/route.ts", "leaving from the programme page trims what was typed to the place's limit"],
        ["src/app/api/admissions/forms/[roundId]/application/reply/route.ts", "\"I can't make it\" from somebody in a group trims the reason to the place's limit and leaves"],
        ["src/app/api/courses/runs/[runId]/allocate/route.ts", "putting somebody who left back on the board clears the reason"],
        ["src/app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts", "reinstating somebody who left clears the reason"],
        ["src/app/(app)/learn/[runId]/leave/page.tsx", "the leaving page's box, which takes the limit and nothing else"],
        ["src/features/courses/DropOutCard.tsx", "the leaving box, which takes the limit and nothing else"],
      ]),
      "naming the reason somebody gave for leaving",
      "The policy says only admins and the programme's lead read it, that it is " +
        "kept with the place on the programme, and that it goes with the " +
        "account. If this file shows it to anybody else or copies it somewhere " +
        "that outlives the place, the sentence is wrong and a new version has " +
        "to say so.",
    );
    // The Overview is built for the programme's lead and admins alone: its one
    // page answers anybody else before building it.
    const overviewPage = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx";
    assert.deepEqual(
      sourceFilesNaming(/\bbuildProgrammeOverview\(/),
      [overviewPage, "src/lib/courses/programmeOverview.ts"],
      "the programme's Overview, which reads out a leaver's reason, is built somewhere new.",
    );
    const overview = read(overviewPage);
    const asked = overview.indexOf('if (outcome.status === "not-yours")');
    const built = overview.indexOf("buildProgrammeOverview(");
    assert.ok(asked !== -1 && built !== -1 && asked < built, "the Overview is built before the caller is asked whether they lead the programme");
    assert.match(read("src/lib/applications/handover/programmeRun.ts"), /if \(!opensProgrammeGroups\(role\)\) return \{ status: "not-yours" \};/);
    assert.equal(applicationAccess.opensProgrammeGroups("admin"), true);
    assert.equal(applicationAccess.opensProgrammeGroups("lead"), true);
    assert.equal(applicationAccess.opensProgrammeGroups("reviewer"), false, "a programme's reviewer now opens its Overview, and the reason somebody gave for leaving");
    assert.equal(applicationAccess.opensProgrammeGroups(null), false);

    // Kept with the place, never on the application: the leave writes it on
    // the place and gives a place on the form back with nothing about why.
    const leave = read("src/lib/courses/leaveRun.ts");
    assert.match(leave, /dropOutReason: reason,/);
    assert.match(leave, /if \(place\) givePlaceBack\(tx, place\);/);
    // The log of course actions outlives the account, so its line says what
    // was done and never what was said.
    const row = /await db\.collection\(COURSE_AUDIT_COLLECTION\)\.add\(\{([\s\S]*?)\}\);/.exec(withoutComments(leave));
    assert.ok(row, "could not find the log line leaving writes");
    assert.match(row[1], /detail: "Left the course\.",/);
    assert.ok(
      !/reason/i.test(row[1]),
      "the log line about somebody leaving now carries their reason. The log " +
        "outlives the account, and the policy says the reason is kept with the " +
        "place, which a deletion removes.",
    );
    // And it goes with the account: a deletion removes the place it is kept on.
    assert.match(read("src/lib/firestore/accountDeletion.ts"), /summary\.courseEnrolmentsDeleted = enrolSnap\.size;/);
    // tests/course-hub-leaving.test.mjs and
    // tests/course-hub-cant-make-it-after-placement.test.mjs run both doors.
    for (const suite of ["course-hub-leaving.test.mjs", "course-hub-cant-make-it-after-placement.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("somebody who left: their records stay for the lead and admins, the notes they shared stay with their group, and the survey about leaving is linked where they are told they left", () => {
    // v15 says what leaving records and what stays, and where the survey
    // about leaving is linked. It leaves out v14's "your programme page shows
    // only that you left ... and are no longer shown to you": the checks on
    // what that page is drawn from stay below, as the code's own.
    const leaving = hubPassageOf("<strong>Leaving.</strong>");
    assert.ok(leaving.length > 100, "could not find what the page says about leaving");
    for (const sentence of [
      "If you leave, we record that you left and when, and you leave your group at once.",
      "The register keeps what it said about you up to then, with the day you left, and what you wrote stays in our records for the lead and admins.",
    ]) {
      assert.ok(leaving.includes(sentence), `the policy's Leaving no longer says: ${sentence}`);
    }
    assert.ok(
      hubPassageOf("<strong>Notes shared with your group.</strong>").includes("if you leave, they stay with the group."),
      "the policy no longer says the notes somebody shared stay with their group when they leave",
    );
    assert.ok(
      hubPassageOf("<strong>How a survey reaches you.</strong>").includes(
        "If you leave a programme while it has a survey about leaving, a link to it appears where you are told you left.",
      ),
      "the policy no longer says where the survey about leaving is linked",
    );
    // The old words, that it shows only that they left, are gone.
    assert.ok(!/shows only that you left: your marks/i.test(PAGE_FLAT), "the policy still says the page shows only that they left");
    // The promise this replaced, that somebody who left keeps their notes,
    // the reading list or their marks to read, is made nowhere on the page.
    assert.doesNotMatch(
      PAGE_FLAT,
      /\byou keep\b[^.]*\b(?:notes|reading list|marks)\b|\bmarks to read\b/i,
      "the policy promises somebody who left their notes, the reading list or their marks again, which no page shows them.",
    );
    // The page that tells somebody they left is drawn from the programme's
    // name and the day they left, and from nothing else of the run or the
    // person. v14 said it shows only that; v15 leaves that out, and this
    // check stays as the code's own until that page is drawn from more.
    const view = /export type LeftView = \{([\s\S]*?)\};/.exec(withoutComments(read("src/lib/courses/leftView.ts")));
    assert.ok(view, "could not find what the page somebody who left reads is drawn from");
    assert.deepEqual(
      [...view[1].matchAll(/(\w+)\??:/g)].map((match) => match[1]),
      ["runId", "name", "leftOn"],
      "the page somebody who left reads is drawn from more than the programme's name and the day they left. " +
        "v15 no longer promises that is all it shows them: check what it now shows against the policy, and change this check with it.",
    );
    // The two pages that show somebody taking part their notes and the
    // reading list draw that same page for somebody who left, before either
    // is read, with the survey about leaving's card while it is theirs to
    // answer, from the one reader the run's page asks too: "a link to it
    // appears where you are told you left".
    for (const page of ["src/app/(app)/learn/[runId]/notes/page.tsx", "src/app/(app)/learn/[runId]/reading/page.tsx"]) {
      const code = withoutComments(read(page));
      const left = code.indexOf(
        "if (access.hasLeft) return <LeftProgramme view={await loadLeftView(db, { run: access.run, enrolment })} survey={await leftPageSurvey(db, access)} />;",
      );
      const theirs = code.search(/await load(?:OwnNotes|ReadingList)\(/);
      assert.ok(left !== -1 && theirs !== -1 && left < theirs, `${page} shows somebody who left their notes or the reading list`);
    }
    // "Stay in our records": leaving deletes none of their marks, their notes
    // or a note they shared.
    assert.ok(
      !/courseProgress|courseAttendance|courseGroupSharedNotes|COURSE_GROUP_SHARED_NOTES_COLLECTION/.test(withoutComments(read("src/lib/courses/leaveRun.ts"))),
      "leaving now reaches somebody's marks, notes or shared notes, which the policy says stay in the records.",
    );
    // "The notes you shared with your group stay with it": the group's reader
    // keeps a note whoever wrote it and wherever its writer is now.
    assert.match(
      withoutComments(read("src/lib/courses/sharedNotes/readers.ts")),
      /\.filter\(\(note\): note is CourseGroupSharedNoteDoc => note !== null && note\.runId === run\.id && note\.groupId === groupId\)/,
      "a group's notes are now filtered on who wrote them, so a note somebody who left shared may leave the group.",
    );
    // tests/course-hub-leaving.test.mjs runs each of these as every kind of caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-leaving.test.mjs")));
  });

  test("a place that comes back is offered by the programme's lead or an admin until the end of the first week, and is not reminded each day", () => {
    assert.equal(freedPlaceRules.offersFreedPlaces("admin"), true);
    assert.equal(freedPlaceRules.offersFreedPlaces("lead"), true);
    assert.equal(freedPlaceRules.offersFreedPlaces("reviewer"), false, "a programme's reviewer can now offer a place that comes back");
    assert.equal(freedPlaceRules.offersFreedPlaces(null), false);

    // "Until the end of the programme's first week": the window, run, on a
    // run whose week 1 is Thu 29 Oct to Wed 4 Nov. It opens with the send and
    // closes at midnight in London at the end of that Wednesday.
    const run = {
      startDate: "2026-10-29",
      weekPlan: [
        { kind: "week", weekNumber: 1 },
        { kind: "week", weekNumber: 2 },
      ],
    };
    const sent = new Date(Date.UTC(2026, 9, 26, 12));
    assert.equal(freedPlaceRules.freedPlaceWindow(null, run, sent).state, "before-send");
    assert.equal(freedPlaceRules.freedPlaceWindow(sent, run, new Date(Date.UTC(2026, 10, 4, 23, 59))).state, "open");
    assert.equal(freedPlaceRules.freedPlaceWindow(sent, run, new Date(Date.UTC(2026, 10, 5, 0, 0))).state, "closed");

    // "The daily reminder about an invitation is not sent for these offers":
    // an invitation beside "No offer this time" is skipped by name, and an
    // invitation from decision day is not skipped for that reason.
    const now = new Date(Date.UTC(2026, 10, 2, 12));
    const invitation = { programmeId: "governance", replyBy: "2026-11-04", response: null };
    const offered = {
      sent: { at: new Date(Date.UTC(2026, 9, 10)) },
      status: "invited",
      result: { kind: "no-offer", publishedAt: new Date(Date.UTC(2026, 9, 26)) },
      invitation,
    };
    assert.deepEqual(invitationReminders.invitationReminderDue(offered, now), { due: false, why: "freed-place" });
    const invited = { ...offered, result: { kind: "invited", publishedAt: new Date(Date.UTC(2026, 9, 26)) } };
    assert.notEqual(invitationReminders.invitationReminderDue(invited, now).why, "freed-place");
    // tests/applications-freed-places-*.test.mjs run the offer, its email and its reply.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "applications-freed-places-offer.test.mjs")));
  });

  // Asking people to facilitate (src/lib/courses/facilitatorAsks/). Two
  // claims: who reads the answers about facilitating, and the record each ask
  // leaves. The modules run here are pure, and are loaded inside each test.
  test("the answers about facilitating are read by the lead of each programme somebody would facilitate, ranked or not, on a list that shows nothing else of their application", async () => {
    // The lead of each programme somebody named reads their answers about
    // facilitating, with the line under their name and, from decision day,
    // where they stand; nothing else of the application is in that list.
    // v14 also said how a programme is named (by name or by choosing
    // "Either"), "even if you did not rank that programme", that it is read
    // on a list, and "The list shows nothing else of your application"; v15
    // leaves those words out and keeps the list of what the lead reads, which
    // the checks on the code below hold field by field.
    assert.ok(
      hubPassageOf("<strong>Who reads your application.</strong>").includes(
        "If you said you would like to facilitate, the lead of each programme you named reads your answers about facilitating, with your name, your degree or area of work and your status or graduation year, and from decision day where you stand in a few words.",
      ),
      "the policy no longer says who reads the answers about facilitating, and with what",
    );
    // The lead's own paragraph says it too.
    assert.ok(
      hubPassageOf("<strong>What the people leading a programme see.</strong>").includes(" who might facilitate,"),
      "the policy no longer names who might facilitate among what a programme's lead sees",
    );

    const rules = await loadTs("lib/courses/facilitatorAsks/rules.ts");
    const reviewPeople = await loadTs("lib/applications/review/people.ts");

    // Who is on a programme's list, run: somebody who said yes to
    // facilitating and chose the programme by name, or "Either" where Either
    // covers it ("each programme you named"). Somebody who ranked only the
    // other programme and chose this one is on its list, ranked or not.
    const form = {
      programmeIds: ["agi", "tais"],
      programmes: {
        agi: { id: "agi", shortName: "AGI Strategy", name: "AGI Strategy Fellowship" },
        tais: { id: "tais", shortName: "Technical AI Safety", name: "Technical AI Safety Fellowship" },
      },
    };
    const which = {
      id: "which",
      type: "choice",
      text: "Which would you like to facilitate?",
      options: ["AGI Strategy", "Technical AI Safety", "Either"],
      optionsFromRanking: false,
    };
    const before = { id: "before", type: "long", text: "Have you led a discussion before?", options: [], optionsFromRanking: false };
    const sets = [
      { id: "fac", role: "facilitator", questions: [which, before] },
      { id: "agi-own", role: "stream", questions: [{ id: "why", type: "long", text: "Why this one?", options: [], optionsFromRanking: false }] },
    ];
    const sent = (choice, wantsToFacilitate = true) => ({
      wantsToFacilitate,
      rankedProgrammeIds: ["tais"],
      answers: { fac: { which: choice, before: "I ran a reading group." }, "agi-own": { why: "Because it matters." } },
    });
    const { agi, tais } = form.programmes;
    assert.equal(rules.wouldFacilitate(form, sets, sent("AGI Strategy"), agi), true, "somebody who chose a programme they did not rank is not on its lead's list, and the policy says they are");
    assert.equal(rules.wouldFacilitate(form, sets, sent("AGI Strategy"), tais), false, "somebody is on the list of a programme they did not say they would facilitate");
    assert.equal(rules.wouldFacilitate(form, sets, sent("Either"), agi), true);
    assert.equal(rules.wouldFacilitate(form, sets, sent("Either"), tais), true);
    assert.equal(rules.wouldFacilitate(form, sets, sent("AGI Strategy", false), agi), false, "somebody who did not say they would like to facilitate is on a list");
    // Where the question's options are the ranking, Either covers only what was ranked.
    const fromRanking = [{ ...sets[0], questions: [{ ...which, options: [], optionsFromRanking: true }, before] }, sets[1]];
    assert.equal(rules.wouldFacilitate(form, fromRanking, sent("Either"), agi), false);
    assert.equal(rules.wouldFacilitate(form, fromRanking, sent("Either"), tais), true);

    // "Your answers about facilitating": the facilitator sets' own questions,
    // less the one that picks the programme, and no answer from anywhere else
    // on the form.
    assert.deepEqual(rules.facilitatorColumns(form, sets).map((column) => column.key), ["fac/before"]);
    assert.deepEqual(rules.answersFor(form, sets, sent("AGI Strategy")), { "fac/before": "I ran a reading group." });

    // "Your name, your degree or area of work and your status or graduation
    // year": the line under a name, run.
    assert.equal(
      reviewPeople.applicantDetail({ subject: "BA Philosophy", status: "undergraduate", statusOther: "", expectedGraduation: "2028-06" }),
      "BA Philosophy · Graduating 2028",
    );
    assert.equal(reviewPeople.applicantDetail({ subject: "PhD Politics", status: "phd", statusOther: "", expectedGraduation: "" }), "PhD Politics · Postgrad");

    // "From decision day where you stand in a few words": nothing before
    // decision day's send, and its words after it.
    const facts = (standing, decisionsSent = true) => ({
      programme: agi,
      standing,
      role: "member",
      decisionsSent,
      runAsks: [],
      facilitates: new Map(),
      groupNames: new Map(),
      now: new Date(Date.UTC(2026, 9, 27, 12)),
    });
    const elsewhere = { kind: "place", via: "ranking", programmeId: "tais", saidComing: true };
    assert.equal(rules.personStatus("kai", facts(elsewhere)).chip.words, "Taking part in another programme");
    assert.equal(rules.personStatus("omar", facts({ kind: "no-place" })).chip.words, "No offer this time");
    assert.equal(rules.personStatus("kai", facts(elsewhere, false)).chip, null, "where somebody stands is shown before decision day");

    // The lead reads what the policy lists and nothing else of the
    // application: what is kept of each person, field by field, and what the
    // view sends of them, field by field.
    const people = withoutComments(read("src/lib/courses/facilitatorAsks/people.ts"));
    assert.match(people, /\(application\) => application\.sent !== null && wouldFacilitate\(form, sets, application\.sent, programme\),/);
    assert.match(
      people,
      /return \{\s*uid: application\.uid,\s*name: applicantName\(sent\.aboutYou, application\.displayName\),\s*firstName: applicantFirstName\(sent\.aboutYou, application\.displayName\),\s*detail: applicantDetail\(sent\.aboutYou\),\s*answers: answersFor\(form, sets, sent\),\s*standing: standingOf\(application\),\s*role: roleOf\.get\(application\.uid\) \?\? null,\s*painted: paintedWeekOf\(form\.round\.availabilityGrid, application\),\s*marked: markedRanges\(sent\.availability, form\.round\.availabilityGrid\),\s*\};/,
      // The week is kept for an admin's chart beside an ask (v12) and the view
      // below sends it to an admin alone: an admin reads the application, and
      // the times in it, already. The lead's list still shows nothing else.
      "the list now keeps more of each application than the policy says it shows",
    );
    const load = withoutComments(read("src/lib/courses/facilitatorAsks/load.ts"));
    assert.match(
      load,
      /const view: ViewPerson = \{\s*uid: person\.uid,\s*name: person\.name,\s*firstName: person\.firstName,\s*detail: person\.detail,\s*answers: person\.answers,\s*status: \{ chip: status\.chip, note: status\.note, ask: status\.ask \},\s*week: context\.viewer === "admin" \? weekOf\(person\) : null,\s*\};/,
      "the view now sends more of each person on the list than the policy says it shows",
    );
    const viewPerson = /export type ViewPerson = \{([\s\S]*?)\n\};/.exec(load);
    assert.ok(viewPerson, "could not find what the view sends of each person on the list");
    // `week` is null for a lead (pinned above, and executed through the route
    // in tests/course-hub-facilitator-case-draft.test.mjs, "the lead gets no
    // week for anybody"): the lead's list still shows nothing else.
    assert.deepEqual([...viewPerson[1].matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), ["uid", "name", "firstName", "detail", "answers", "status", "week"]);

    // "The lead of each programme": the list is read behind the programme's
    // own gate, which answers its lead and admins and refuses a reviewer.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bloadFacilitatorPeople\(/),
      new Map([
        ["src/lib/courses/facilitatorAsks/people.ts", "where the list is read from the term's applications"],
        ["src/lib/courses/facilitatorAsks/load.ts", "the Facilitators view's model, read after askContext answers the programme's lead or an admin"],
        ["src/lib/courses/facilitatorAsks/act.ts", "an ask and its test, which take somebody from the list, behind the same gate"],
      ]),
      "reading the list of the people who would like to facilitate",
      "The policy says the lead of the programme somebody would facilitate reads their answers about facilitating, " +
        "with their name and the line under it. If this file shows the list to anybody else, the sentence is wrong " +
        "and a new version has to say so.",
    );
    assert.match(
      load,
      /const context = await askContext\(db, actor, roundId, programmeId\);\s*if \(!context\.ok\) return context;\s*const \{ form, programme, sets, run, groups \} = context;\s*const \[people, cases, runAsks, training, test, caseTest, lead, accounts\] = await Promise\.all\(\[\s*loadFacilitatorPeople\(db, form, sets, programme, actor\.uid\),\s*context\.viewer === "admin" \? loadCasePeople\(db, form, sets, programme, actor\.uid\) : Promise\.resolve\(\[\]\),/,
      "the Facilitators view reads the list before it asks whether the caller leads the programme",
    );
    // In the writer the list is read by one helper, which takes the gate's own answer.
    const act = withoutComments(read("src/lib/courses/facilitatorAsks/act.ts"));
    assert.equal((act.match(/\bloadFacilitatorPeople\(/g) ?? []).length, 1);
    assert.match(act, /async function personAndGroup\(\s*db: Firestore,\s*actor: SessionUser,\s*context: AskContext,/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bloadFacilitatorsModel\(/),
      new Map([
        ["src/lib/courses/facilitatorAsks/load.ts", "where the Facilitators view's model is built"],
        ["src/app/api/courses/runs/[runId]/facilitators/asking/route.ts", "the view's one read, answered only with what the gate let through"],
        ["src/lib/courses/getReady/read.ts", "the Overview's Get ready for week 1 and Publish's readiness check, behind the same gate, take each group's facilitators, the asks still waiting and the training from it, and nothing of the list"],
      ]),
      "building the Facilitators view",
      "The policy says the programme's lead and admins read the list. A new caller of the view's model is a new reader.",
    );
    const context = withoutComments(read("src/lib/courses/facilitatorAsks/context.ts"));
    assert.match(context, /const outcome = await loadProgrammeRun\(db, actor, roundId, programmeId\);/);
    assert.match(context, /if \(outcome\.status === "not-yours"\) return refuse\(403, LEADS_AND_ADMINS\);/);
    assert.equal(applicationAccess.opensProgrammeGroups("lead"), true);
    assert.equal(applicationAccess.opensProgrammeGroups("reviewer"), false, "a programme's reviewer now reads the list of the people who would like to facilitate it");
    // Nothing the person asked opens reaches the list.
    assert.ok(
      !/from "\.\/(?:people|load|act)"/.test(read("src/lib/courses/facilitatorAsks/answerPage.ts")),
      "the page the person asked opens now reaches the list of the people who would like to facilitate",
    );
    // tests/course-hub-facilitator-asks.test.mjs runs the view's read as every kind of caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-facilitator-asks.test.mjs")));
  });

  test("an ask to facilitate is emailed whatever the settings say, reminded at most three times, answered on a page only its person is shown, kept with what the page lists and no address, and deleted with that person's account", async () => {
    // The ask is one of the things that may happen after decision day: the
    // list the decision day paragraph ends with. v14 also named who asks (the
    // lead of a programme somebody would facilitate, or an admin), the twelve
    // hours between reminders, the page the ask is answered on and its
    // deadline, that a yes makes somebody one of the group's facilitators, the
    // record's other fields, and the ask among what a deletion removes. v15
    // leaves those out; the checks on the code below stay, held to the
    // sentences v15 keeps.
    const fromDecisionDay = PAGE_FLAT.slice(PAGE_FLAT.indexOf("is not emailed unless an admin chooses to. After that:"));
    const afterDecisionDay = fromDecisionDay.slice(0, fromDecisionDay.indexOf("</ul>"));
    assert.ok(afterDecisionDay.length > 200, "could not find the list of what may happen after decision day");
    assert.ok(
      afterDecisionDay.includes(
        "<li> We may ask you to facilitate a group: because you said you would like to, or, if you hold a place, because an admin thinks you would be good at it. The ask is emailed whatever your settings, with up to three reminders, and saying no changes nothing about your place. We keep a record of each ask (who asked, when, for which group, your answer and when, and a copy of the email) without your email address; the programme&apos;s lead, admins and you can see it. </li>",
      ),
      "the policy's list of what may happen after decision day no longer says what an ask to facilitate is, how it is sent, and what is kept of it",
    );
    // A deletion: v15 names the ask neither among what a deletion removes nor
    // among what it leaves, and the code deletes every ask sent to the
    // account (below).
    assert.ok(!hubPassageOf("It leaves:").includes("facilitat"), "the policy now says a deletion leaves the asks to facilitate, which the code deletes");

    const model = await loadTs("lib/courses/facilitatorAsks/model.ts");
    const rules = await loadTs("lib/courses/facilitatorAsks/rules.ts");
    const words = await loadTs("lib/courses/facilitatorAsks/words.ts");
    const act = withoutComments(read("src/lib/courses/facilitatorAsks/act.ts"));

    // After decision day ("After that:"), and asked by the programme's lead
    // or an admin (v14's words; v15 leaves who asks out): an ask is refused
    // before decision day's send, behind the programme's own gate.
    assert.match(
      act,
      /const context = await askContext\(db, actor, roundId, programmeId\);\s*if \(!context\.ok\) return context;\s*if \(context\.form\.decisionsSentAt === null\) return refuse\(409, NOT_SENT_YET\);/,
      "an ask can now go before decision day has been sent",
    );

    // "The ask is emailed whatever your settings": one call to the mail door,
    // and nothing in the writer reads a notification row or reaches the
    // notice lane.
    assert.match(act, /import \{ sendEmail \} from "@\/lib\/email\/send";/);
    assert.equal((act.match(/\bsendEmail\(/g) ?? []).length, 1, "asking somebody to facilitate sends from more than one place");
    for (const marker of ["wantsCategory(", "addressesForSend(", "wantsEmailForProfile(", "wantsPushFor(", "hasOptedOutOfCourseAnnouncements(", "sendNotice(", "sendNoticePush("]) {
      assert.ok(!act.includes(marker), `asking somebody to facilitate now calls ${marker}, so whether it is sent may depend on a notification setting`);
    }

    // "With up to three reminders". v14 added "at least twelve hours apart"
    // and "while it waits for your answer", which v15 leaves out; the code's
    // spacing and its stop once the ask is answered are held as they were.
    assert.equal(model.FACILITATING_LIMITS.maxReminders, 3);
    assert.equal(model.FACILITATING_LIMITS.remindAfterMs, 12 * 60 * 60 * 1000);
    assert.match(act, /if \(!current \|\| askStateOf\(current, runAsks, now\)\.kind !== "waiting"\) return refuse\(409, NOT_WAITING\);/);
    assert.match(act, /if \(current\.reminders >= FACILITATING_LIMITS\.maxReminders\) return refuse\(409, REMINDED_ENOUGH\);/);
    assert.match(
      act,
      /if \(current\.remindedAt && now\.getTime\(\) - current\.remindedAt\.getTime\(\) < FACILITATING_LIMITS\.remindAfterMs\) \{\s*return refuse\(409, REMINDED_RECENTLY\);/,
    );

    // "The programme's lead, admins and you can see it": the page the person
    // answers on, and the answer, each treat an ask that is not the caller's
    // as no ask at all, so the person asked is the one other reader.
    const page = withoutComments(read("src/lib/courses/facilitatorAsks/answerPage.ts"));
    assert.match(page, /const ask = await readAsk\(db, askId\);\s*if \(!ask \|\| ask\.uid !== actor\.uid\) return \{ kind: "not-yours" \};/);
    const answer = withoutComments(read("src/lib/courses/facilitatorAsks/answer.ts"));
    assert.match(answer, /if \(!seen \|\| seen\.uid !== actor\.uid\) return refuse\(404, NOT_AN_ASK\);/);
    assert.match(answer, /if \(!ask \|\| ask\.uid !== actor\.uid\) return refuse\(404, NOT_AN_ASK\);/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bloadAnswerPage\(/),
      new Map([
        ["src/lib/courses/facilitatorAsks/answerPage.ts", "the page's model, which is nothing for anybody but the person an ask names"],
        ["src/app/(app)/learn/facilitate/[askId]/page.tsx", "the page an ask's email opens"],
      ]),
      "drawing the page an ask opens",
      "The policy says the programme's lead, admins and the person asked see an ask, and this page shows it to the person asked and nobody else.",
    );
    // "Saying no changes nothing about your place": a no writes the answer
    // and its time onto the ask, and nothing else.
    assert.match(
      answer,
      /if \(answer === "no"\) \{\s*tx\.update\(askRef, \{ answer: "no", answeredAt: FieldValue\.serverTimestamp\(\) \}\);\s*return \{ ok: true as const, answer \};\s*\}/,
      "saying no to an ask now writes more than the answer on the ask, and the policy says it changes nothing about a place",
    );

    // By the day and time the ask gives (v14's words; v15 leaves the
    // deadline out), run (12pm in London on Wed 28 Oct is noon in UTC), and
    // refused after it.
    const ask = { id: "a1", seat: "a1", uid: "kai", answer: null, replyBy: { dateKey: "2026-10-28", time: "12:00" } };
    assert.equal(rules.askStateOf(ask, [ask], new Date(Date.UTC(2026, 9, 28, 11, 59))).kind, "waiting");
    assert.equal(rules.askStateOf(ask, [ask], new Date(Date.UTC(2026, 9, 28, 12, 0))).kind, "late");
    assert.match(answer, /if \(state\.kind === "late"\) \{\s*return refuse\(409, lateWords\(/);

    // A yes makes somebody one of that group's facilitators (v14's words; v15
    // says only that we may ask), through the one place a group's
    // facilitators change.
    assert.match(answer, /writeFacilitatorChange\(tx, db, \{[\s\S]*?next: \[\.\.\.current, actor\.uid\],/);

    // "We keep a record of each ask (who asked, when, for which group, your
    // answer and when, and a copy of the email) without your email address":
    // the one write of an ask, field by field, built from the person on the
    // list (who carries no address) and the email as composed (which holds
    // none). The list below is v14's, which named every field; v15 names
    // fewer and holds the same no address.
    const created = /tx\.create\(ref, \{([\s\S]*?)\}\);/.exec(act);
    assert.ok(created, "could not find the write of an ask");
    assert.deepEqual(
      [...created[1].matchAll(/^\s*(\w+)(?::|,)/gm)].map((match) => match[1]),
      [
        "kind", "runId", "roundId", "programmeId", "groupId", "uid", "seat", "askedByUid", "askedAt", "replyBy",
        "answer", "answeredAt", "remindedAt", "reminders", "delivery", "email", "toName", "firstName", "leadName",
        // The admin's sentence making the case to somebody who did not offer
        // (v9: "somebody who did not offer to facilitate is only ever asked").
        // It is also in "a copy of the email", so the record holds nothing the
        // policy does not cover; it is kept on its own so a reminder can make
        // the same case.
        "case",
      ],
      "an ask is now kept with more, or less, than this list. Check a new field against what the policy says an ask " +
        "keeps (who asked, when, for which group, the answer and when, a copy of the email, and no address).",
    );
    assert.match(created[1], /case: request\.case,/);
    // "If you hold a place, because an admin thinks you would be good at it":
    // the people an admin may make the case to are read for an admin alone.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bloadCasePeople\(/),
      new Map([
        ["src/lib/courses/facilitatorAsks/people.ts", "where the people holding a place who did not offer are read"],
        ["src/lib/courses/facilitatorAsks/load.ts", "the Facilitators view's model, which reads them only when askContext answers an admin"],
        ["src/lib/courses/facilitatorAsks/act.ts", "a case ask and its test, refused before this read unless askContext answers an admin"],
      ]),
      "reading the people an admin may make the case to",
      "Only an admin is shown the people who did not offer to facilitate. If another file reads them, say who for.",
    );
    assert.match(act, /if \(context\.viewer !== "admin"\) return refuse\(403, CASE_ADMINS_ONLY\);\s*const cases = await loadCasePeople\(/);
    assert.match(created[1], /toName: person\.name,/);
    const person = /export type FacilitatorPerson = \{([\s\S]*?)\n\};/.exec(withoutComments(read("src/lib/courses/facilitatorAsks/people.ts")));
    assert.ok(person, "could not find what is kept of each person on the list");
    assert.deepEqual([...person[1].matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), ["uid", "name", "firstName", "detail", "answers", "standing", "role", "painted", "marked"]);
    const sentEmail = /export type SentAskEmail = \{([\s\S]*?)\n\};/.exec(withoutComments(read("src/lib/courses/facilitatorAsks/model.ts")));
    assert.ok(sentEmail, "could not find the shape of the email an ask keeps");
    assert.deepEqual([...sentEmail[1].matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), ["subject", "greeting", "paragraphs", "button", "signOff"]);
    const composed = words.composeAskEmail({
      firstName: "Kai",
      shortName: "AGI Strategy",
      programmeName: "AGI Strategy Fellowship",
      groupName: "Group D",
      meets: "Mondays at 6pm",
      where: { kind: "room", room: "Room A13" },
      weeks: 6,
      firstSession: "Mon 2 Nov",
      capacity: 8,
      training: { day: "Wed 28 Oct", time: "6pm", room: "Room B5" },
      replyBy: { day: "Wed 28 Oct", time: "12pm" },
      leadName: "Claudia",
      link: "https://naisi.uk/learn/facilitate/a1",
    });
    assert.ok(composed, "the email an ask keeps could not be written whole");
    assert.ok(!JSON.stringify(composed).includes("@"), "the email an ask keeps now carries an email address");

    // "The programme's lead, admins and you can see it": every file that
    // reads asks, and every file that addresses the record, each for a reason.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:listRunAsks|readAsk)\(/),
      new Map([
        ["src/lib/courses/facilitatorAsks/read.ts", "the readers of the record, which answer only documents that are what was asked for"],
        ["src/lib/courses/facilitatorAsks/load.ts", "the Facilitators view, for the programme's lead and admins, behind askContext"],
        ["src/lib/courses/facilitatorAsks/act.ts", "Remind, behind askContext, which reads the one ask it reminds somebody of"],
        ["src/lib/courses/facilitatorAsks/answerPage.ts", "the page the person asked opens, which shows an ask to nobody else"],
      ]),
      "reading the record of asks to facilitate",
      "The policy says the programme's lead and admins see these records and the person asked sees their own. " +
        "If this file shows an ask to anybody else, the sentence is wrong and a new version has to say so.",
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bFACILITATING_COLLECTION\b|["'`]courseFacilitating["'`]/),
      new Map([
        ["src/lib/courses/facilitatorAsks/model.ts", "the record's own shape and the collection's name"],
        ["src/lib/courses/facilitatorAsks/read.ts", "every read of the record"],
        ["src/lib/courses/facilitatorAsks/act.ts", "the one writer of an ask, its reminders, the test before it and the run's training"],
        ["src/lib/courses/facilitatorAsks/answer.ts", "the answer, from the person asked and nobody else"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every ask sent to it"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run deletes its asks"],
      ]),
      "addressing the record of asks to facilitate",
      "The policy says what an ask keeps and who sees it, and does not say a deletion leaves it. " +
        "If this file reads, shows or keeps asks otherwise, the sentence is wrong and a new version has to say so.",
    );

    // A deletion takes them: every ask that names the account, found by its
    // one equality, is deleted (v14 named the asks among what a deletion
    // removes; v15 names them in neither list, checked at the top).
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.ok(
      cascade.includes("summary.courseFacilitatingCleared = await clearFacilitatorAsks(db, uid);"),
      "the account deletion no longer clears the asks to facilitate. v15 does not say a deletion leaves them: " +
        "keep the step, or say in a new version that they stay.",
    );
    const from = cascade.indexOf("export async function clearFacilitatorAsks(");
    assert.ok(from !== -1, "could not find the step that clears the asks to facilitate");
    const clear = cascade.slice(from, cascade.indexOf("\n}\n", from));
    assert.match(clear, /rows\.where\("uid", "==", uid\)\.get\(\),/);
    assert.match(clear, /for \(const doc of about\.docs\) \{\s*touched\.add\(doc\.id\);\s*writes\.push\(\(batch\) => batch\.delete\(doc\.ref\)\);\s*\}/);
    // tests/course-hub-facilitator-asks.test.mjs runs the ask, the reminder,
    // the answer and the deletions as every kind of caller, and
    // tests/course-hub-facilitator-asks-pages.test.mjs draws the page.
    for (const suite of ["course-hub-facilitator-asks.test.mjs", "course-hub-facilitator-asks-pages.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("a facilitator who holds a place is one of the group's people: a yes places them, the register and who finished count them, their answers are the programme's lead's and an admin's, they are stood down before they leave, and they are sent both certificates", async () => {
    // The paragraph, whole. v14 also said that a yes from somebody holding a
    // place puts them in that group, that whoever takes the register marks
    // them (which can be them), that they are taken off the group's
    // facilitators before they can leave, and that a facilitator who held a
    // place and finished is sent both certificates. v15 leaves those out; the
    // checks on the code below stay, each held to the sentence of v15 that
    // covers it.
    assertHubSays(
      "<strong>If you facilitate your own group.</strong> A facilitator can also hold a place in the group they run. You are then one of its people as well: on its register and counted for who finished. Your own work is read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and they don&apos;t give you feedback on it.",
    );

    // "A facilitator can also hold a place in the group they run": a yes from
    // somebody holding a place puts them in that group, as its people are.
    // Where somebody sits, run.
    const seats = await loadTs("lib/courses/groupFacilitators.ts");
    const fellow = (groupId, status = "active") => ({ row: { role: "learner", status, groupId }, accepted: true });
    assert.deepEqual(seats.seatFor("a", fellow(null)), { kind: "place", row: "update" });
    assert.deepEqual(seats.seatFor("a", { row: null, accepted: true }), { kind: "place", row: "create" });
    assert.deepEqual(seats.seatFor("a", fellow("a")), { kind: "in-the-group" });
    assert.deepEqual(seats.seatFor("a", fellow("b")), { kind: "elsewhere", groupId: "b" }, "a yes now moves somebody out of another group");
    assert.deepEqual(seats.seatFor("a", fellow("a", "withdrawn")), { kind: "facilitator-only" }, "somebody who left is placed again by an appointment");
    assert.deepEqual(seats.seatFor("a", { row: null, accepted: false }), { kind: "facilitator-only" });
    // "As one of its people": room in the group is asked as for anybody placed.
    const group = { id: "a", capacity: 2, memberCount: 2 };
    assert.deepEqual(
      seats.placementsFor({ group, added: ["amara"], seats: new Map([["amara", { row: null, accepted: true }]]), joinedWeekNumber: 1 }),
      { ok: false, problem: { kind: "full", uid: "amara" } },
    );
    // The two doors that appoint, and only they, place somebody this way, and
    // the answer hands its places to the one writer.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bplacementsFor\(/),
      new Map([
        ["src/lib/courses/groupFacilitators.ts", "where the places an appointment makes are decided"],
        ["src/lib/courses/facilitatorAsks/answer.ts", "a yes from the person asked, in the transaction that records it"],
        ["src/app/api/courses/groups/[groupId]/facilitators/route.ts", "a change of a group's facilitators by hand, in one transaction"],
      ]),
      "placing somebody as they are made a facilitator",
      "The policy says a facilitator can hold a place in the group they run, as one of its people, and a yes from " +
        "somebody holding a place puts them there. A new door that places people this way is a new sentence.",
    );
    const answer = withoutComments(read("src/lib/courses/facilitatorAsks/answer.ts"));
    assert.match(answer, /writeFacilitatorChange\(tx, db, \{[\s\S]*?next: \[\.\.\.current, actor\.uid\],[\s\S]*?placing,\s*\}\);/);

    // "On its register": the register lists every active row in the group,
    // with no question about anybody's role, and the group's facilitators
    // mark it (which can be the facilitator who holds the place).
    const registerAccess = withoutComments(read("src/lib/courses/registerAccess.ts"));
    const members = registerAccess.slice(registerAccess.indexOf("export async function loadRegisterMembers("));
    const membersBody = members.slice(0, members.indexOf("\n}\n"));
    assert.match(membersBody, /\.where\("groupId", "==", groupId\)\s*\.where\("status", "==", "active"\)/);
    assert.ok(!/\brole\b/.test(membersBody), "the register now asks people's roles, so a facilitator who holds a place may be left off it");

    // "Counted for who finished": who finished is the run's learner rows, and
    // nothing in it leaves out a facilitator.
    const attendance = withoutComments(read("src/lib/courses/programmeAttendance.ts"));
    assert.match(attendance, /\.filter\(\(row\) => row\.role === "learner" && row\.uid !== "" && row\.runId === runId\)/);
    assert.ok(!/facilitatorUids/.test(withoutComments(read("src/lib/courses/finishing/whoFinished.ts"))), "who finished now asks who facilitates");

    // "Your own work is read by the programme's lead and admins, not by the
    // group's other facilitators, and they don't give you feedback on it"
    // (Zach, Mon 26 Oct 2026: a facilitator's own work is read by the
    // programme's lead and admins, not co-facilitators). One rule, run: whose
    // work is a facilitator's own, and who reads it.
    const ownWork = await loadTs("lib/courses/writtenAnswers/access.ts");
    const groupNaming = (archived) => [{ id: "a", runId: "r", archived, facilitatorUids: ["sofia", "amara"] }];
    assert.equal(ownWork.facilitatesOnRun("amara", groupNaming(false)), true);
    assert.equal(ownWork.facilitatesOnRun("bea", groupNaming(false)), false);
    assert.equal(ownWork.facilitatesOnRun("amara", groupNaming(true)), false, "an archived group makes somebody's work a facilitator's own");
    const readsAmaras = (uid, facts) => ownWork.readsFacilitatorsOwnWork({ uid }, facts, "amara");
    assert.equal(readsAmaras("claudia", { isAdmin: false, isLead: true }), true, "the programme's lead no longer reads a facilitator's own work");
    assert.equal(readsAmaras("zach", { isAdmin: true, isLead: false }), true, "an admin no longer reads a facilitator's own work");
    assert.equal(readsAmaras("sofia", { isAdmin: false, isLead: false }), false, "a co-facilitator reads a facilitator's own work");
    assert.equal(readsAmaras("amara", { isAdmin: true, isLead: true }), false, "somebody reviews their own work");
    // Every place that reads or reviews other people's answers asks it: the
    // written answers' gate (every written answers page, route and count
    // asks that) and the summer's three. None decides it again.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\breadsFacilitatorsOwnWork\(/),
      new Map([
        ["src/lib/courses/writtenAnswers/access.ts", "the one rule, and the written answers' gate that every written answers page, route and count asks"],
        ["src/app/api/courses/exercise-responses/[responseId]/review/route.ts", "a verdict on an answer to the summer's exercises"],
        ["src/app/api/courses/groups/[groupId]/exercises/route.ts", "the summer's review queue: the answers a group's facilitators and admins are listed"],
        ["src/lib/courses/facilitatorGroup.ts", "the group page's and Home's To review count of the summer's answers"],
      ]),
      "deciding who reads a facilitator's own work",
      "The policy says a facilitator's own work is read by the programme's lead and admins and by none of the group's other facilitators. A new place that reads or reviews it asks the same rule.",
    );
    const ownGate = withoutComments(read("src/lib/courses/writtenAnswers/access.ts"));
    assert.ok(ownGate.includes("const own = readsFacilitatorsOwnWork(actor, facts, owner.uid);"), "the written answers' gate no longer asks the one rule for a facilitator's own answer");
    for (const file of [
      "src/app/api/courses/groups/[groupId]/exercises/route.ts",
      "src/app/api/courses/exercise-responses/[responseId]/review/route.ts",
      "src/lib/courses/facilitatorGroup.ts",
    ]) {
      const code = withoutComments(read(file));
      assert.match(code, /\bfacilitatesOnRun\(/, `${file} no longer asks whose work is a facilitator's own`);
      assert.doesNotMatch(code, /facilitatorUids\.includes\(/, `${file} decides a facilitator's own work by a rule of its own`);
    }

    // Taken off the group's facilitators before they can leave the programme,
    // or be taken off it (v14's words; v15 leaves this out, and the code's
    // order is held as it was): leaving's one answer, its words run, and
    // Remove's refusal.
    const leaving = withoutComments(read("src/lib/courses/leaving.ts"));
    assert.match(leaving, /if \(facilitated\) return \{ closed: "facilitating", groupName: /);
    const leavingWords = await loadTs("lib/courses/leavingWords.ts");
    assert.equal(
      leavingWords.leaveClosedLine({ closed: "facilitating", groupName: "Group A" }, "AGI Strategy Fellowship"),
      "You facilitate Group A, so you can’t leave the programme here. Ask the programme’s lead or an admin to take you off its facilitators first, then you can leave.",
    );
    const remove = withoutComments(read("src/app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts"));
    assert.match(remove, /if \(facilitated && existing\.status === "active"\) \{\s*throw new RemoveError\(facilitatesGroupLine\(/);

    // "If you finished, or facilitated a group, we send you a certificate":
    // one for each, so a facilitator who held a place and finished is sent
    // both (v14 said so in those words; v15 leaves them out). The two lists
    // the send reads can hold one person, who finished's (learner rows,
    // above) and the groups' facilitators, and a certificate is one a person,
    // run and kind, so both are made, and go in that person's one email (§2's
    // certificate test holds the rest of the paragraph).
    assert.ok(
      hubPassageOf("<strong>Who finished, and certificates.</strong>").includes(" If you finished, or facilitated a group, we send you a certificate: "),
      "the policy no longer says who is sent a certificate",
    );
    const certificateModel = await loadTs("lib/courses/certificates/model.ts");
    assert.notEqual(
      certificateModel.certificateId("run1", "amara", "finished"),
      certificateModel.certificateId("run1", "amara", "facilitated"),
      "one person's two certificates would be one document",
    );
    const send = withoutComments(read("src/lib/courses/certificates/send.ts"));
    assert.match(send, /give\(row\.uid, "finished"\)/);
    assert.match(send, /give\(uid, "facilitated"\)/);
    // Both kinds kept on the one person, who is sent one email with a button to each.
    assert.match(send, /const kinds = kindsOf\.get\(uid\) \?\? new Set<CertificateKind>\(\);\s*kinds\.add\(kind\);/);

    // The suites that run each of these as every kind of caller.
    for (const suite of [
      "course-hub-facilitator-fellows.test.mjs",
      "course-hub-facilitator-fellows-leaving.test.mjs",
      "course-hub-facilitator-fellows-finishing.test.mjs",
    ]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("reflections, ticks and private notes: who reads them, what may be read out and from what page, and a facilitator's own", async () => {
    // What a week's work records and who reads it. v14 gave reflections and
    // ticks a paragraph each; v15 says it once for all of a person's work,
    // with the private notes narrower and what may be read out. It leaves
    // out that reflections save as you type, that they get no feedback and
    // no mark, that the page where lines are chosen shows them with no name
    // beside them, and that a facilitator's own are never read out; and it
    // takes back "A tick never counts against you." The checks on the code
    // stay, each held to the sentence below that covers it. The private notes
    // are kept from the lead in so many words ("except ... the private notes
    // people keep on the material"), and a facilitator's own is read by admins
    // alone: `readsPrivateNotes` and `readsFacilitatorsPrivateNotes` below.
    assert.ok(
      PAGE_FLAT.includes("Everything a facilitator sees, for every group, except the notes facilitators write about a named person or a session, and the private notes people keep on the material, and also:"),
      "the policy no longer keeps the private notes on the material from what a programme's lead sees",
    );
    const record = hubPassageOf("<strong>What we record.</strong>");
    assert.ok(
      record.includes(" the readings you tick, your reflections and written answers,") &&
        record.includes(" and the private notes you keep against the material."),
      "the policy no longer says a week's work records the readings ticked, reflections and private notes",
    );
    const whoReads = hubPassageOf("<strong>Who reads it.</strong>");
    for (const sentence of [
      "<strong>Who reads it.</strong> You, your group&apos;s facilitators, the programme&apos;s lead and admins, and nobody else taking part; the week&apos;s page says so.",
      " If you facilitate a group, your own work is read by the lead and admins only.",
      " Your private notes on the material are read by your group&apos;s facilitators and admins (if you facilitate the group, by admins alone), and we use them to improve the course.",
      " A facilitator may read out a line of a reflection without saying whose it is.",
    ]) {
      assert.ok(whoReads.includes(sentence), `the policy's Who reads it no longer says: ${sentence}`);
    }

    // Who sees whose work, decided in one place, run: a facilitator is never
    // shown a facilitator's own; the lead and admins are, marked as theirs;
    // private notes are the group's facilitators' and admins', never the
    // lead's, and a facilitator's own note an admin's alone (the private
    // notes' readers, narrowed by "your own work is read by the lead and
    // admins only").
    const week = await loadTs("lib/courses/facilitatorWeek/model.ts");
    const VIEWERS = ["facilitator", "lead", "admin"];
    assert.deepEqual(VIEWERS.map(week.seesFacilitatorsOwnWork), [false, true, true], "who is shown a facilitator's own reflections and ticks moved");
    assert.deepEqual(VIEWERS.map(week.readsPrivateNotes), [true, false, true], "who reads private notes moved");
    assert.deepEqual(VIEWERS.map(week.readsFacilitatorsPrivateNotes), [false, false, true], "who reads a facilitator's own private note moved");
    const people = [{ uid: "fellow", name: "A Fellow" }, { uid: "facilitator", name: "A Facilitator" }];
    const facilitators = [{ uid: "facilitator", name: "A Facilitator", firstName: "A" }];
    assert.deepEqual(week.peopleShown("facilitator", people, facilitators).map((person) => person.uid), ["fellow"]);
    assert.deepEqual(week.peopleShown("lead", people, facilitators).map((person) => [person.uid, person.own]), [["fellow", false], ["facilitator", true]]);
    // "Without saying whose it is": the page where a facilitator chooses a
    // line shows them the words with no name beside them (v14's words), a
    // card being its words and a key naming nothing but its place, in the
    // order of the words.
    assert.deepEqual(week.readOutCards("p1", ["Zeta", "alpha"]), [{ key: "p1-1", text: "alpha" }, { key: "p1-2", text: "Zeta" }]);
    const readers = withoutComments(read("src/lib/courses/facilitatorWeek/readers.ts"));
    assert.match(readers, /cards: readOutCards\(key, wrote\.map\(\(person\) => reflections\.get\(person\.uid\)\?\.get\(prompt\.id\) \?\? ""\)\),/);
    // The private note's one reader is asked only for a viewer who reads
    // notes, and the page to read lines out reads none.
    assert.match(readers, /readsPrivateNotes\(viewer\) \? readPrivateNotes\(db, run\.id, at\.weekNumber, readable, sourceIds\)/);
    assert.doesNotMatch(readers.slice(readers.indexOf("export async function loadReadOutWeek(")), /privateNote|readPrivateNotes/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bprivateNote\b/).filter((file) => /\bprivateNote\b/.test(withoutComments(read(file)))),
      new Map([
        ["src/lib/firestore/courseProgress.ts", "the record: its shape, its limit and its normaliser"],
        ["src/features/courses/progressMutations.ts", "the writer: a person's own note, on their own row"],
        ["src/app/api/courses/runs/[runId]/ticks/[itemId]/route.ts", "a person's own note, kept as it was when they tick or untick, on their own row"],
        ["src/features/courses/WeekView.tsx", "a person's own note, in their own box on a week written before blocks"],
        ["src/features/courses/weekBlocks/SourceCard.tsx", "a person's own note, in their own box under a source"],
        ["src/lib/courses/leftView.ts", "a person's own notes, on their own notes page"],
        ["src/lib/courses/facilitatorWeek/readers.ts", "the one reader of somebody else's note: a group's facilitators and admins, after the page's gate"],
      ]),
      "reading a private note",
      "The policy says a private note is read by its writer, the group's facilitators and admins, and nobody else. A new reader is a new sentence.",
    );
    // The pages that read a group's week, each behind its own gate (the
    // group's: a live facilitator or an admin; the lead's: the programme's
    // lead or an admin, from the form). Reading reflections WITH names is the
    // group's facilitators', the lead's and admins' (Zach, Fri 30 Oct), which
    // the passage above says: "You, your group's facilitators, the
    // programme's lead and admins, and nobody else taking part".
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:loadGroupWeek|loadReadOutWeek|loadNamedReflections|readRunCoursework)\(/),
      new Map([
        ["src/lib/courses/facilitatorWeek/readers.ts", "the loaders and the run-wide read, which ask nobody who is reading, so each caller decides that first"],
        ["src/lib/courses/coursework/load.ts", "the Coursework tab and one person's page: everybody's reflections and ticks on a programme's run, for its lead and admins, after the programme's own gate"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/page.tsx", "the group's page, for its live facilitators and admins"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx", "the page to read lines out, for the group's live facilitators and admins"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/reflections/names/page.tsx", "the group's fellows' reflections with names, for the group's live facilitators and admins, never a facilitator's own"],
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx", "the lead's view of a group's week, for the programme's lead and admins"],
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx", "the lead's reading of a group's reflections with names, for the programme's lead and admins"],
      ]),
      "reading a group's reflections and ticks",
      "The policy says a person's reflections and ticks are read by their group's facilitators, the programme's lead and admins. A new reader is a new sentence.",
    );

    // "The week's page says so": the lines under the boxes and the sources,
    // run, and the page that draws them.
    const memberWords = await loadTs("lib/courses/memberPageWords.ts");
    assert.equal(memberWords.reflectionsReadByWords(["Rahul", "Sofia"], "Claudia"), "Rahul, Sofia, Claudia and admins can read your reflections. Other fellows can’t.");
    assert.equal(memberWords.ticksSeenByWords(["Rahul", "Sofia"], "Claudia"), "Rahul, Sofia, Claudia and admins can see which sources you tick.");
    assert.equal(memberWords.facilitatorReflectionsReadByWords("Claudia"), "Only Claudia and admins can read your reflections.");
    assert.equal(memberWords.facilitatorTicksSeenByWords("Claudia"), "Only Claudia and admins can see which sources you tick.");
    assert.equal(memberWords.PRIVATE_NOTE_HINT, "Only your facilitators and admins see this. It’s never read out.");
    assert.equal(memberWords.PRIVATE_NOTE_HINT_FACILITATOR, "Only admins see this. It’s never read out.");
    const blockWeek = withoutComments(read("src/features/courses/weekBlocks/BlockWeek.tsx"));
    assert.match(blockWeek, /: ticksSeenByWords\(facilitatorNames, leadFirstName\),/);
    // A facilitator's own note's hint, for a facilitator with no place and one who holds a place alike.
    assert.match(blockWeek, /privateNoteHint: ownWorkIsTheLeads \? PRIVATE_NOTE_HINT_FACILITATOR : PRIVATE_NOTE_HINT,/);
    assert.match(blockWeek, /const ownWorkIsTheLeads = asFacilitator \|\| overviewWeek\?\.thisWeek\?\.answersReadBy === "lead";/);

    // Who finished is decided by sessions: "we record as finished everyone
    // who came to the number of sessions the lead set". Nothing that decides
    // it reads a tick. (v14 promised "A tick never counts against you"; v15
    // takes that back, and this holds only what v15 says of who finished.)
    assert.ok(
      hubPassageOf("<strong>Who finished, and certificates.</strong>").includes(
        "After the last session we record as finished everyone who came to the number of sessions the lead set;",
      ),
      "the policy no longer says who finished is decided by the sessions somebody came to",
    );
    assert.deepEqual(
      sourceFilesNaming(/["'`]courseProgress["'`]/).filter((file) => file.startsWith("src/lib/courses/finishing/")),
      [],
      "who finished now reads ticks, and the policy says it is decided by the sessions somebody came to",
    );
    // Reflections get no feedback and no mark (v14's words; v15 leaves them
    // out, and this holds the code as it is until feedback or the team's
    // ratings reach reflections, when it changes with that code): the
    // verdict route reads a reflection or a fill-in box as no row, and a
    // reflection is one of those.
    assert.match(withoutComments(read("src/app/api/courses/exercise-responses/[responseId]/review/route.ts")), /snap\.exists && !isOwnBoxResponse\(data\)/);
    assert.match(withoutComments(read("src/lib/firestore/courseExercises.ts")), /return isReflectionResponse\(data\) \|\| isFillInResponse\(data\);/);

    // tests/course-hub-facilitator-week.test.mjs runs each page as every kind
    // of caller, and holds every reader of the progress store to a list.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-facilitator-week.test.mjs")), "tests/course-hub-facilitator-week.test.mjs is gone");
  });

  test("who finished: the number is shown to the programme's lead and admins, and a member is told only whether they finished", () => {
    // "Only the lead and admins see the list", and somebody who did not
    // finish is "not told". v14 also said only they see the number the lead
    // set, and that arriving late or leaving early counts as coming; v15
    // leaves those out, and the checks below stay.
    const finished = hubPassageOf("<strong>Who finished, and certificates.</strong>");
    for (const sentence of [" Only the lead and admins see the list.", " If you did not finish, you are not sent one and not told."]) {
      assert.ok(finished.includes(sentence), `the policy's Who finished no longer says: ${sentence}`);
    }
    // The words, run: the lead's sentences say who sees the rule, and a
    // member's carry a programme's name and nothing else.
    assert.equal(
      finishingWords.ruleSentence(4, 6),
      "We’ve ticked everyone who came to at least 4 of 6 sessions. Change any you disagree with. Only you and admins see this rule.",
    );
    assert.match(finishingWords.RULE_HINT, /Only you and admins see this\.$/);
    assert.equal(finishingWords.youFinished("AGI Strategy Fellowship"), "You finished AGI Strategy Fellowship.");
    assert.equal(finishingWords.hasEnded("AGI Strategy Fellowship"), "AGI Strategy Fellowship has ended.");
    // Arriving late or leaving early counts as coming (v14's words; v15 says
    // "came").
    assert.match(
      read("src/lib/courses/programmeAttendance.ts"),
      /const CAME: ReadonlySet<AttendanceStatus> = new Set\(\["present", "late", "left-early"\]\);/,
    );
    // The rule and the list are read only behind the lead's and admins' gate:
    // the programme's Settings and Overview pages, and the one writer.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:readFinishRule|loadWhoFinished)\(/),
      new Map([
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup/page.tsx", "the programme's Settings tab, which answers anybody but its lead and admins before it reads the rule"],
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx", "the programme's Overview, built for its lead and admins (loadProgrammeRun)"],
        ["src/lib/applications/handover/finishingAct.ts", "the one writer, which answers anybody but the lead and admins first (loadProgrammeRun)"],
        ["src/lib/courses/finishing/record.ts", "where the rule is read"],
        ["src/lib/courses/finishing/whoFinished.ts", "where the lead's list is built"],
      ]),
      "reading the rule or the list of who finished",
      "The policy says only the programme's lead and admins see the list (and " +
        "v14 said the number too). If this file shows either to anybody else, " +
        "check the policy and say so in a new version if it no longer holds.",
    );
    for (const page of [
      "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup/page.tsx",
      "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx",
    ]) {
      const source = read(page);
      const asked = source.indexOf('if (outcome.status === "not-yours")');
      const reads = source.search(/\b(?:readFinishRule|loadWhoFinished)\(/);
      assert.ok(asked !== -1 && reads !== -1 && asked < reads, `${page} reads who finished before it asks whether the caller leads the programme`);
    }
    assert.match(read("src/lib/applications/handover/finishingAct.ts"), /if \(outcome\.status === "not-yours"\) return refuse\(403, LEADS_AND_ADMINS\);/);
    // A member's own pages are sent whether they finished, as true or false,
    // and nothing else of who finished.
    assert.match(read("src/lib/courses/finishing/record.ts"), /export async function finishedForMember\([\s\S]*?\): Promise<boolean> \{/);
    for (const route of ["src/app/api/courses/me/route.ts", "src/app/api/courses/runs/[runId]/overview/route.ts"]) {
      const imported = [...read(route).matchAll(/import \{([^}]*)\} from "@\/lib\/courses\/finishing\/[A-Za-z]+";/g)].map((match) => match[1].trim());
      assert.deepEqual(imported, ["finishedForMember"], `${route} reads more of who finished than whether the caller finished`);
      assert.match(read(route), /\bfinished: boolean;/);
    }
  });

  test("a deletion takes somebody off pitching week, out of their team and out of who finished, and a partner keeps a shared pitch", () => {
    // A deletion removes somebody's places on programmes and their work, and
    // leaves a pitch sent with a partner without their name. v14 named each
    // piece: a pitch sent alone, the name on a shared pitch, the picks in
    // pitching week, the place in a team, and a lead's decision about whether
    // somebody finished. v15 says it in those general words and names none of
    // them among what a deletion leaves but the shared pitch; the code's three
    // steps below are held as they were.
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" your places on programmes, your work and the feedback on it,"),
      "the policy no longer says a deletion removes somebody's places on programmes and their work",
    );
    const leaves = hubPassageOf("It leaves:");
    assert.ok(
      leaves.includes(" a pitch you sent with a partner, and what you wrote on your team&apos;s page, without your name;"),
      "the policy no longer says a pitch sent with a partner stays without the name",
    );
    assert.ok(!/finish/i.test(leaves), "the policy now says a deletion leaves something of who finished, which the code deletes");
    const cascade = read("src/lib/firestore/accountDeletion.ts");
    for (const step of [
      "summary.coursePitchesCleared = await clearCoursePitches(db, uid);",
      "summary.courseTeamsCleared = await clearCourseTeams(db, uid);",
      "summary.courseFinishingCleared = await clearCourseFinishing(db, uid);",
    ]) {
      assert.ok(cascade.includes(step), `the account deletion no longer runs \`${step}\`, which the policy lists among what a deletion removes`);
    }
    // A pitch sent alone goes; one sent with a partner stays theirs, without
    // the name; every pick is taken off.
    assert.match(
      cascade,
      /if \(others\.length === 0\) \{\s*writes\.push\(\(batch\) => batch\.delete\(doc\.ref\)\);\s*\} else \{\s*writes\.push\(\(batch\) =>\s*batch\.update\(doc\.ref, \{ pitcherUids: others, wouldJoinUids: FieldValue\.arrayRemove\(uid\) \}\),\s*\);\s*\}/,
    );
    assert.match(cascade, /writes\.push\(\(batch\) => batch\.update\(doc\.ref, \{ wouldJoinUids: FieldValue\.arrayRemove\(uid\) \}\)\);/);
    // Off the team, and the team stays with whoever else is in it.
    assert.match(cascade, /writes\.push\(\(batch\) => batch\.update\(doc\.ref, \{ memberUids: people, toldAs: told \}\)\);/);
    // A decision a lead recorded about them is deleted.
    assert.match(cascade, /for \(const doc of about\.docs\) \{\s*touched\.add\(doc\.id\);\s*writes\.push\(\(batch\) => batch\.delete\(doc\.ref\)\);\s*\}/);
    // The suites that run each of the three on a store.
    for (const suite of ["course-hub-pitching-deletion.test.mjs", "course-hub-teams-deletion.test.mjs", "course-hub-finishing-deletion.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("facilitators are shown names and never an address, and email their group without seeing one", () => {
    assert.ok(
      hubPassageOf("<strong>What your facilitators see.</strong>").includes(
        "<strong>What your facilitators see.</strong> Who is in their group, by name only: never an email address (they write to the group through the site).",
      ),
      "the policy no longer says facilitators see their group by name only, never an email address",
    );
    assert.ok(
      !/contact details/i.test(PAGE_FLAT),
      "the policy says facilitators see contact details again. They are shown names " +
        "only: the group's roster and its register carry no address, and the " +
        "group email hands none out.",
    );
    // The roster: names only, in the payload's own shape and in its code.
    const roster = read("src/app/api/courses/groups/[groupId]/roster/route.ts");
    assert.match(roster, /facilitators: Array<\{ uid: string; displayName: string \}>;/);
    assert.match(roster, /members: Array<\{ uid: string; displayName: string \}>;/);
    assert.ok(!/email/i.test(withoutComments(roster)), "the group's roster route now reads an email address");
    // The register's names come from helpers that never read an address.
    for (const [file, helper] of [
      ["src/lib/courses/registerAccess.ts", "export function displayNameOf("],
      ["src/lib/courses/programmeLead.ts", "export function fullNameOfUser("],
    ]) {
      const code = withoutComments(read(file));
      const from = code.indexOf(helper);
      assert.ok(from !== -1, `could not find ${helper} in ${file}`);
      const body = code.slice(from, code.indexOf("\n}\n", from));
      assert.ok(!/email/i.test(body), `${helper} in ${file} now reads an email address, and a register shows what it returns`);
    }
    // The group email answers with counts, and never an address.
    const groupEmail = read("src/app/api/courses/groups/[groupId]/email/route.ts");
    assert.match(groupEmail, /return NextResponse\.json\(\{ ok: true, sent, skipped, pushed \}\);/);
    assert.match(groupEmail, /let skipped = 0;/);
    assert.match(groupEmail, /let pushed = 0;/);
  });

  test("before the first session, facilitators see whether each person in their group has said they are coming, and nothing else from an application", () => {
    // BUILT, 26 October 2026 (Q14): the summary behind a facilitator's Home
    // hands the group's facilitators, on the days before its first session,
    // each person's first name and whether they have said they are coming.
    // The policy says so in what facilitators see, with nothing else from an
    // application; both sentences are pinned in that paragraph, the words
    // from before it was built must stay gone, and the sentences are held to
    // the code below.
    const facilitatorsSee = hubPassageOf("<strong>What your facilitators see.</strong>");
    assert.ok(
      facilitatorsSee.includes(
        " and before the first session whether you have said you are coming. Nothing else from your application, and no review scores.",
      ),
      "the policy no longer says facilitators see, before the first session, who has said they are coming, and nothing else from an application",
    );
    assert.ok(
      !/they will also see whether each person in their group/i.test(PAGE_FLAT),
      "the policy says facilitators will see who has said they are coming, as if it were not built yet",
    );

    // The places the course side reads an application at all: the
    // facilitators' list, and week 1's door reading the caller's own.
    const COURSE_SIDE = /^src\/(?:lib\/courses|app\/api\/courses|app\/\(app\)\/learn|app\/\(app\)\/dashboard|features\/courses)\//;
    assertExactlyTheseFiles(
      sourceFilesNaming(/from "@\/lib\/applications\/staffRepo"/).filter((file) => COURSE_SIDE.test(file)),
      new Map([
        [
          "src/lib/courses/whosComing.ts",
          "who's coming, for a group's facilitators before its first session: each person's reply, read through comingReplyOf and handed on as a yes or a no beside a first name",
        ],
        [
          "src/lib/courses/weekOne/door.ts",
          "week 1's door: the caller's own application and decision, read only to answer whether they hold a place, which opens week 1 to them before groups go out. Nothing of either is shown to anybody, a facilitator least of all",
        ],
        [
          "src/lib/courses/placementNotes/section.ts",
          "Outside the times they gave, on Publish's own page: the week somebody marked, read for an ADMIN alone to draw beside their group's session while a note to them is written. The section refuses everybody but an admin and the programme's lead, and the lead is sent no week. A facilitator never reaches it",
        ],
        [
          "src/lib/courses/coursework/door.ts",
          "Claude and Pangram on coursework (v13): the form's applications and decisions, read only through placeHoldersOn to answer WHO holds a place on the programme, by the name on record, behind the Coursework tab's door (an admin or the programme's lead). Nothing an application says is sent or shown, and a facilitator never reaches it",
        ],
      ]),
      "reading applications on the course side",
      "A facilitator is shown nothing from applications but whether each person in their group has said " +
        "they are coming. Read that through src/lib/courses/whosComing.ts, or change the policy first.",
    );
    // The one reading of the reply, asked by the lead's People tab and the facilitators' list alone.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bcomingReplyOf\(/),
      new Map([
        ["src/lib/applications/status/coming.ts", "the one reading of whether somebody has said they are coming, and when"],
        ["src/lib/applications/people/model.ts", "the People tab's Coming? column, for the programme's lead and admins"],
        ["src/lib/courses/whosComing.ts", "a facilitator's who's coming: a yes or a no beside a first name"],
      ]),
      "reading whether somebody has said they are coming",
      "Say who is shown the reply and why, and check the policy names them.",
    );

    // What leaves for a facilitator: a first name and a yes or a no, and the
    // module reads nothing else of the application.
    const whosComing = withoutComments(read("src/lib/courses/whosComing.ts"));
    assert.match(whosComing, /export type WhosComingPerson = \{ firstName: string; coming: boolean \};/);
    assert.match(whosComing, /return people\.map\(\(person, at\) => \(\{ firstName: person\.firstName, coming: replies\[at\] === true \}\)\);/);
    for (const field of ["releaseReason", "answers", "aboutYou", "email", "availability", "attendance", "sent"]) {
      assert.ok(!new RegExp(`\\.${field}\\b`).test(whosComing), `the facilitators' list reads ${field} off an application`);
    }
    // Who is handed it, and when: a live facilitator of the group (an admin
    // is handed none), on a day before its first session, about the people
    // the facilitator's own view of the group lists, field by field.
    const route = withoutComments(read("src/app/api/courses/groups/[groupId]/summary/route.ts"));
    assert.match(route, /group && !group\.archived && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\)/);
    assert.match(route, /!isAdmin && isBeforeFirstSessionDay\(firstSessionDayOf\(run, group, now\), now\)/);
    // The reader is left out: a facilitator who holds a place is one of the
    // group's people, and is not told whether they themselves are coming.
    assert.match(
      route,
      /model\.people\s*\.filter\(\(person\) => person\.uid !== actor\.uid\)\s*\.map\(\(person\) => \(\{ uid: person\.uid, firstName: person\.firstName \}\)\)/,
    );
    assert.match(route, /whosComing\.map\(\(person\) => \(\{ firstName: person\.firstName, coming: person\.coming \}\)\)/);

    // The reply, run: "I can't make it", with its reason, is not a yes, and
    // the answer is a yes or a no and a day, never the reason.
    const gaveBack = comingReplies.comingReplyOf(
      {
        status: "withdrawn",
        result: { kind: "accepted", programmeId: "agi" },
        invitation: null,
        attendance: { answer: "cant-make-it", answeredAt: new Date("2026-10-26T10:00:00Z") },
        releaseReason: { kind: "other", other: "A reason nobody else reads." },
      },
      "agi",
    );
    assert.deepEqual(gaveBack, { said: false });
    const coming = comingReplies.comingReplyOf(
      {
        status: "accepted",
        result: { kind: "accepted", programmeId: "agi" },
        invitation: null,
        attendance: { answer: "coming", answeredAt: new Date("2026-10-26T10:00:00Z") },
      },
      "agi",
    );
    assert.deepEqual(Object.keys(coming).sort(), ["on", "said"]);
    assert.equal(coming.said, true);

    // tests/course-hub-facilitator-before.test.mjs runs the list through the
    // real routes as every caller, before and after Publish and the first
    // session; tests/course-hub-people-tab.test.mjs the lead's column.
    for (const suite of ["course-hub-facilitator-before.test.mjs", "course-hub-people-tab.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  // The recorded downloads. v15 names the five kinds a record is kept of, and
  // the two lists made in the browser that are not. The walk below holds the
  // five to the routes that write the record, both ways and kind by kind, and
  // the two to the components that build them in the browser with no record.
  test("the five kinds of download are logged, each before its file is handed over; an event's sign-ups and the subscriber list are made in the browser and not recorded; and the attendance, survey and Kairos files hold what the page says", () => {
    const logs = hubPassageOf("<strong>Logs:</strong>");
    const KINDS =
      "(membership lists, a circulated worksheet&apos;s answers, a programme&apos;s attendance, a survey&apos;s answers with names, and the Kairos file)";
    assert.ok(
      logs.includes(` a record of five kinds of spreadsheet staff download ${KINDS}: who asked, what it covered, how many people were in it and when.`),
      "the policy no longer names the five kinds of download that are recorded, with what each row holds",
    );
    assert.ok(
      logs.includes(" An event&apos;s list of sign-ups and the subscriber list are made in the browser and not recorded."),
      "the policy no longer says the event sign-ups and subscriber lists are made in the browser and not recorded",
    );
    assert.ok(logs.includes(" These record what staff did, not what you wrote,"), "the policy no longer says the staff logs record what staff did, not what was written");
    // Kind by kind, both ways: every route that writes the record is one of
    // the five the policy names, and every kind it names has its route.
    const RECORDED = new Map([
      ["src/app/api/admin/membership/export/route.ts", "membership lists"],
      ["src/app/api/worksheets/circulations/[circulationId]/export/route.ts", "a circulated worksheet&apos;s answers"],
      ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts", "a programme&apos;s attendance"],
      ["src/app/api/surveys/[surveyId]/export/route.ts", "a survey&apos;s answers with names"],
      ["src/app/api/kairos/export/route.ts", "the Kairos file"],
    ]);
    const named = KINDS.slice(1, -1).replace(", and ", ", ").split(", ");
    assert.deepEqual([...named].sort(), [...RECORDED.values()].sort(), "the kinds the policy names and the routes that record a download disagree");
    assert.equal(named.length, 5, "the policy says five kinds and names another number");
    assertExactlyTheseFiles(
      sourceFilesNaming(/\blogExport\(/).filter((file) => file !== "src/lib/firestore/dataExports.ts"),
      new Map([
        ["src/app/api/admin/membership/export/route.ts", "the membership list for a period"],
        ["src/app/api/worksheets/circulations/[circulationId]/export/route.ts", "the answers to a circulated worksheet"],
        ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts", "a programme's attendance, for its lead and admins"],
        ["src/app/api/surveys/[surveyId]/export/route.ts", "a survey's answers with the names of the people who sent them, for admins alone"],
        ["src/app/api/kairos/export/route.ts", "the Kairos file, for admins alone"],
      ]),
      "writing the record of a download",
      "The policy names the five kinds of download that are recorded. A download newly recorded is a sixth " +
        "kind the policy has to name; one listed and no longer recorded makes the sentence wrong: say so in a " +
        "new version.",
    );
    // The two the policy says are not recorded: each is built and saved by
    // the page itself, through the browser's own save, with no request to a
    // route that could write the record.
    for (const [file, what] of [
      ["src/features/events/AttendeeDashboard.tsx", "an event's list of sign-ups"],
      ["src/features/admin/SubscriptionsTable.tsx", "the subscriber list"],
      ["src/features/admin/NewsletterTable.tsx", "the newsletter's subscriber list"],
    ]) {
      const code = withoutComments(read(file));
      assert.match(code, /import \{[^}]*\bdownloadCSV\b[^}]*\} from "@\/lib\/csv";/, `${file} no longer builds ${what} in the browser`);
      assert.match(code, /downloadCSV\(`/, `${file} no longer saves ${what} from the browser`);
      assert.doesNotMatch(code, /logExport|dataExports|\/export["'`?]/, `${file} now records ${what}, and the policy says it is not recorded`);
    }
    assert.doesNotMatch(withoutComments(read("src/lib/csv.ts")), /fetch\(|logExport|firebase/, "the browser's CSV save now sends something somewhere");
    // Each refuses to hand over its file if that record cannot be written,
    // so no such download goes unrecorded: the record first, and a failure to
    // write it is a refusal.
    for (const route of [
      "src/app/api/admin/membership/export/route.ts",
      "src/app/api/worksheets/circulations/[circulationId]/export/route.ts",
      "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts",
      "src/app/api/surveys/[surveyId]/export/route.ts",
      "src/app/api/kairos/export/route.ts",
    ]) {
      const code = withoutComments(read(route));
      const logged = code.indexOf("await logExport(db, {");
      const refused = code.indexOf("{ status: 503 }", logged);
      const handed = code.indexOf("return new Response(", logged);
      assert.ok(logged !== -1 && refused !== -1 && handed !== -1, `${route} no longer records the download before it answers`);
      assert.ok(refused < handed, `${route} hands the file over without refusing when the record cannot be written`);
      assert.ok(code.indexOf("return new Response(") > logged, `${route} hands a file over before it records the download`);
    }
    // The attendance file is for the programme's lead and admins, and holds
    // each person's group, name and marks, how many sessions they came to
    // and the day they left, if they did, and never an email address or a
    // note (v14's words). v15 names no file: it says the lead sees what a
    // facilitator sees, for every group, and a facilitator sees the group
    // "by name only: never an email address" and the register, which is
    // what this file holds.
    assert.match(
      read("src/lib/courses/programmeAttendance.ts"),
      /const header = \[\s*"Group",\s*"Name",\s*\.\.\.model\.weeks\.map\(\(week\) => `Week \$\{week\.weekNumber\}`\),\s*"Came",\s*"Of",\s*"Left",\s*\];/,
      "the attendance file's columns changed. Check a new column against what the policy says the lead sees " +
        "(a group's register, by name, never an email address), and change this check with it.",
    );
    const attendance = read("src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts");
    const refusedFirst = attendance.indexOf('if (outcome.status === "not-yours")');
    const readFirst = attendance.indexOf("await readRunRecords(db");
    assert.ok(refusedFirst !== -1 && readFirst !== -1 && refusedFirst < readFirst, "the attendance file is built before the caller is asked whether they lead the programme");

    // A survey's answers with names, which only admins can download: "Only
    // NAISI's admins can see who said what", and the programme's lead
    // "cannot download the answers". The export answers anybody but an admin
    // before it reads anything.
    const confidential = hubPassageOf("<strong>Confidential.</strong>");
    assert.ok(confidential.includes(" Only NAISI&apos;s admins can see who said what,"), "the policy no longer says only admins see who said what in a survey");
    assert.ok(confidential.includes(" and cannot download the answers."), "the policy no longer says the programme's lead cannot download a survey's answers");
    const survey = withoutComments(read("src/app/api/surveys/[surveyId]/export/route.ts"));
    const adminsOnly = survey.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
    const surveyRead = survey.indexOf("await readSurvey(db, surveyId)");
    assert.ok(adminsOnly !== -1 && surveyRead !== -1 && adminsOnly < surveyRead, "the survey's spreadsheet is built before the caller is asked whether they are an admin");
    assert.match(read("src/lib/surveys/repo.ts"), /export function canRunSurveys\(user: Pick<SessionUser, "role"> \| null\): boolean \{\s*return user\?\.role === "admin";\s*\}/);
    // The survey file holds what a survey records, with the name: "Your
    // answers, when you sent them, whether you used your own link or were
    // signed in, and whether your group had met by then", and never an email
    // address (v14 said so of the file; v15 lists what the record holds, and
    // an address is not in it). The layout, run on the before survey's own
    // questions and one person's answers.
    assertHubSays(
      "<strong>What a survey records.</strong> Your answers, when you sent them, whether you used your own link or were signed in, and whether your group had met by then.",
    );
    const table = surveyExport.surveyExportTable(surveyTemplates.templateItems("before", "fellowship", null), [
      {
        name: "Amara Okafor",
        sentAt: new Date(Date.UTC(2026, 10, 2, 18, 5)),
        via: "link",
        afterFirstSession: false,
        answers: { q_p3_level: { type: "choice", optionId: "o_masters" } },
      },
    ]);
    assert.deepEqual(table.header.slice(0, 4), ["Name", "Sent", "How", "After their first session"], "the survey file's first columns changed, so the policy's list of what it holds may no longer be what it holds");
    const questionColumns = table.header.slice(4);
    assert.ok(questionColumns.length > 0 && questionColumns.every((column) => /^\d+\. /.test(column)), "a column of the survey file after the first four is not a question");
    assert.deepEqual(table.rows[0].slice(0, 4), ["Amara Okafor", "2026-11-02 18:05", "Personal link", "No"]);
    assert.equal(table.rows[0][4], "Master’s", "the survey file no longer writes a choice as its words");
    assert.ok(!table.header.some((column) => /e-?mail|address/i.test(column)), "the survey file has a column for an email address");
    // Its names come from the account's name and never its address.
    const names = withoutComments(read("src/lib/surveys/names.ts"));
    assert.match(names, /out\.set\(doc\.id, fullNameOfUser\(/);
    assert.ok(!/email/i.test(names), "the survey file's names are now read with an email address");
    // tests/surveys-routes.test.mjs downloads it as every caller, reads the
    // record written first, and is refused when the record cannot be written.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-routes.test.mjs")));

    // "Unless you say no, when a programme ends we send Kairos a file with,
    // for each person on it at the end: their name, the programme, how many
    // sessions they came to, whether they finished, and the ratings they were
    // given at the end. It never holds your email address, your survey
    // answers or who gave a rating." Admins only, asked before anything is
    // read (v14 said only admins download it; v15 names no downloader, and
    // the file holds the ratings, which the policy keeps from everybody but
    // the lead, admins and each rater); nobody who said no; and the layout,
    // run.
    assert.ok(
      hubPassageOf("<strong>Sharing with Kairos.</strong>").includes(
        " Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end: their name, the programme, how many sessions they came to, whether they finished, and the ratings they were given at the end. It never holds your email address, your survey answers or who gave a rating.",
      ),
      "the policy no longer says what the Kairos file holds, and never holds",
    );
    const kairos = withoutComments(read("src/app/api/kairos/export/route.ts"));
    const kairosAdmins = kairos.indexOf('if (actor.role !== "admin") return NextResponse.json({ error: KAIROS_FILE_WORDS.adminOnly }, { status: 403 });');
    const kairosRead = kairos.indexOf("await loadKairosProgramme(db, roundId, programmeId)");
    assert.ok(kairosAdmins !== -1 && kairosRead !== -1 && kairosAdmins < kairosRead, "the Kairos file is built before the caller is asked whether they are an admin");
    const builds = withoutComments(read("src/lib/kairos/file.ts"));
    assert.match(builds, /if \(!sharesWithKairos\(choices\.get\(row\.uid\)\)\) \{\s*leftOut \+= 1;\s*continue;\s*\}/, "the Kairos file no longer leaves out everybody who said no");
    assert.match(builds, /\.filter\(\(row\) => row\.left === null\);/, "the Kairos file now holds somebody who left");
    assert.match(builds, /finished: recordOf\(row, finishing, end\)\?\.finished === true,/);
    const kairosTable = kairosFileTable.kairosFileTable("AGI Strategy", "fellowship", [
      { name: "Amara Okafor", came: 6, of: 6, finished: true, ratings: [{ f2: 4, f5: "strongYes" }, { f2: 5 }] },
    ]);
    assert.deepEqual(
      kairosTable.header,
      ["Name", "Programme", "Sessions attended", "Of", "Finished", "Ratings", "Engagement (1 to 5)", "Grasp (1 to 5)", "Drive (1 to 5)", "Next step"],
      "the Kairos file's columns changed, so the policy's list of what it holds may no longer be what it holds",
    );
    assert.deepEqual(kairosTable.rows[0], ["Amara Okafor", "AGI Strategy", 6, 6, "Yes", 2, "4; 5", "", "", "Strong yes"]);
    assert.ok(!kairosTable.header.some((column) => /e-?mail|address|rater|rated by|answer/i.test(column)), "the Kairos file has a column for an address, a rater or a survey answer");
    // tests/kairos-file.test.mjs downloads it as every caller, reads the
    // record written first on each press, and is refused when it cannot be.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "kairos-file.test.mjs")));
  });

  test("a pitch is shown to the group with its people's names, the form says so, and nobody's picks are shown to the group", () => {
    // "Sending a pitch shares it with your group, with your names", and
    // nobody in the group is told who would join which pitch; the lead and
    // admins see how many, not who. v14 also said "the pitch form says so";
    // v15 leaves that out, and the check on the form's line stays below.
    const incubators = hubPassageOf("<strong>Incubators.</strong>");
    assert.ok(
      incubators.includes(
        " sending a pitch shares it with your group, with your names. You can say which of your group&apos;s pitches you would join, and nobody in your group is told which; the lead and admins see how many would join each one, not who.",
      ),
      "the policy no longer says who sees a pitch and who is told who would join it",
    );
    assert.ok(
      hubPassageOf("<strong>What other people taking part see.</strong>").includes(" On an incubator, your group sees a pitch you send, with your name,"),
      "the policy no longer says a group sees a pitch with its people's names",
    );
    // The line on the form, above the button that sends it, in the words of
    // the question the owner answered with v7 (the form saying so is v14's
    // words, which v15 leaves out).
    const pitching = read("src/features/courses/pitching/PitchingWeek.tsx");
    const form = pitching.slice(pitching.indexOf("function PitchForm("), pitching.indexOf("function PitchItem("));
    const line = form.indexOf(">Your group sees your pitch and who pitched it.<");
    const send = form.indexOf('<button type="submit"');
    assert.ok(line !== -1, "the pitch form no longer says who sees a pitch");
    assert.ok(send !== -1 && line < send, "the pitch form says who sees a pitch only after the button that sends it");
    // What the group is shown of a pitch: who pitched it, and never who would
    // join it or how many would.
    const row = /export type PitchRow = \{([\s\S]*?)\n\};/.exec(read("src/lib/courses/pitching/model.ts"));
    assert.ok(row, "could not find the shape of a pitch as the group is shown it");
    assert.match(row[1], /pitchedBy: string;/);
    assert.ok(!/wouldJoin|joiners|pickers|count/i.test(row[1]), "a pitch as the group is shown it now carries who would join it, or how many");
    // The lead and admins see how many would join each pitch, and not who:
    // the two lists of pitches they are shown count the picks.
    for (const [file, counted] of [
      ["src/lib/applications/handover/pitchesLoad.ts", /wouldJoin: pitch\.wouldJoinUids\.filter\([^\n]*\)\.length,/],
      ["src/lib/applications/handover/teamsLoad.ts", /const wouldJoin = pitch\.wouldJoinUids\.filter\([^\n]*\)\.length;/],
    ]) {
      assert.match(read(file), counted, `${file} no longer counts who would join a pitch, and may show who`);
    }
  });

  test("destroying a term's applications takes nobody off a programme", () => {
    // When a term's applications are destroyed a short record of each is
    // kept, and a person's course record, their place first, is kept while
    // their account exists. v14 said it in a sentence of its own ("Nobody is
    // taken off a programme by it"); v15 says it through the two retention
    // lines.
    const retention = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="retention"'), PAGE_FLAT.indexOf('<section id="your-rights"'));
    assert.ok(retention.length > 500, "could not find the policy's How long we keep it");
    for (const sentence of [
      " When a term&apos;s applications are finished with or destroyed, we keep a short record of each application for admins only:",
      "<strong>Your course record</strong> (your place, the registers, your work and the feedback on it, notes facilitators wrote and session reports): while your account exists.",
    ]) {
      assert.ok(retention.includes(sentence), `the policy's How long we keep it no longer says: ${sentence}`);
    }
    const destroy = read("src/lib/admissions/destroy.ts");
    assert.ok(
      !/courseEnrolments|courseApplications|COURSE_ENROLMENTS|COURSE_APPLICATIONS/.test(destroy),
      "destroying a term's applications now reaches the places on a course " +
        "run, which the policy says stay with the rest of a person's course record.",
    );
  });

  test("the notes a group's facilitators share are read by its facilitators, the programme's lead and admins, by nobody in the group, and go with their writer's account", () => {
    // "Notes about a group.": the notes a group's facilitators keep for each
    // other, and who reads them ("they, the programme's lead and admins"; the
    // register's notes about a named person, its second sentence, are held
    // by the test of a lead's registers). Nobody in the group reads them:
    // other people taking part see what the policy lists, "Nothing else". A
    // note goes with its writer's account: a deletion removes "the notes you
    // wrote for a group's other facilitators". And a copy of somebody's data
    // includes "notes facilitators and admins wrote". v14 said each of the
    // last three in a sentence of its own.
    const groupNotes = hubPassageOf("<strong>Notes about a group.</strong>");
    for (const sentence of [
      "<strong>Notes about a group.</strong> A group&apos;s facilitators may keep notes for each other about how it is going, and a note may mention you; they, the programme&apos;s lead and admins read them.",
      " Facilitators may also write a note about a named person after a session, which the group&apos;s facilitators and admins read.",
    ]) {
      assert.ok(groupNotes.includes(sentence), `the policy's Notes about a group no longer says: ${sentence}`);
    }
    assert.ok(hubPassageOf("<strong>What other people taking part see.</strong>").endsWith(" Nothing else. "), "the policy no longer says other people taking part see nothing beyond what it lists");
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" the notes and ratings about you, the ratings you gave, the notes you wrote for a group&apos;s other facilitators,"),
      "the policy no longer says a deletion removes the notes somebody wrote for a group's other facilitators",
    );
    assertHubSays("notes facilitators and admins wrote, session reports, ratings, and the reason for a conduct flag.");
    // The one reader, and the two pages that call it, each after its own
    // gate: the group's page lets in the group's live facilitators and
    // admins, the programme's Attendance tab its lead and admins.
    const groupPage = "src/app/(app)/learn/[runId]/group/[groupId]/page.tsx";
    const attendanceTab = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance/page.tsx";
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:readGroupNotes|readRunGroupNotes)\(/),
      new Map([
        ["src/lib/courses/groupNotes/readers.ts", "the one reader, which asks nobody who is reading, so each caller decides that first"],
        [groupPage, "the group's page, which sends away everybody but the group's live facilitators and admins first"],
        [attendanceTab, "the programme's Attendance tab, for its lead and admins (loadProgrammeRun)"],
      ]),
      "reading the notes a group's facilitators share",
      "The policy says the group's facilitators, the programme's lead and " +
        "admins read these notes, and nobody in the group. If this file shows " +
        "them to anybody else, the sentence is wrong and a new version has to say so.",
    );
    const page = read(groupPage);
    assert.match(
      page,
      /const facilitatesThisGroup =\s*!group\.archived &&\s*isNamedWithStanding\(\s*access\.user,\s*"courseGroups\.facilitatorUids",\s*group\.facilitatorUids,?\s*\);/,
      "the group's page no longer asks whether the caller is a live facilitator of the group",
    );
    const sentAway = page.indexOf("if (group.runId !== runId || !(access.isAdmin || facilitatesThisGroup)) {");
    const readOnPage = page.indexOf("readGroupNotes(db, group)");
    assert.ok(
      sentAway !== -1 && readOnPage !== -1 && sentAway < readOnPage,
      "the group's page reads its facilitators' notes before it sends away everybody but the group's live facilitators and admins",
    );
    const tab = read(attendanceTab);
    assert.match(tab, /const outcome = db \? await loadProgrammeRun\(db, user, roundId, programmeId\) : null;/);
    const notYours = tab.indexOf('if (outcome.status === "not-yours")');
    const readOnTab = tab.indexOf("readRunGroupNotes(db, view.run.id)");
    assert.ok(
      notYours !== -1 && readOnTab !== -1 && notYours < readOnTab,
      "the Attendance tab reads the facilitators' notes before it asks whether the caller leads the programme",
    );
    assert.equal(applicationAccess.opensProgrammeGroups("reviewer"), false, "a programme's reviewer now opens its Attendance tab, and the notes its groups' facilitators share");
    // Nothing hands a note to a browser: the one writer answers no GET, and
    // takes a note only from a live facilitator of the group.
    const route = withoutComments(read("src/app/api/courses/groups/[groupId]/notes/route.ts"));
    assert.ok(!/export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(route), "the facilitators' notes route now answers a GET");
    assert.match(route, /group && !group\.archived && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\),/);
    // A note goes with its writer's account, found by the writer's uid.
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /export async function deleteCourseGroupNotes\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_GROUP_NOTES_COLLECTION, uid, "authorUid"\);\s*\}/,
    );
    // tests/course-hub-group-notes.test.mjs runs the writer, the reader and
    // the deletions on a store; tests/course-hub-facilitator-pages.test.mjs
    // draws the group's page and the Attendance tab as each caller.
    for (const suite of ["course-hub-group-notes.test.mjs", "course-hub-facilitator-pages.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("a session report is written by the group's facilitators after a session, read by the programme's lead and admins and never by the person it names, kept with the course record, and found by account for a copy or a deletion", () => {
    // "Session reports.", whole, and the three lines elsewhere that name
    // them: kept while the account exists, in a lawful basis, and in a copy
    // of somebody's data.
    const passage = hubPassageOf("<strong>Session reports.</strong>");
    assert.equal(
      passage,
      "<strong>Session reports.</strong> After a session, facilitators may report how it went, including who engaged well and who seemed to need a hand or hadn&apos;t done the reading. The programme&apos;s lead and admins read these. You don&apos;t see them on the site, but you can ask for what is written about you. ",
    );
    assertHubSays(
      "<strong>Your course record</strong> (your place, the registers, your work and the feedback on it, notes facilitators wrote and session reports): while your account exists.",
      " notes facilitators and admins wrote, session reports, ratings, and the reason for a conduct flag.",
    );

    // "including who engaged well and who seemed to need a hand or hadn't
    // done the reading": the questions, by their fixed ids and in the form's
    // words.
    const record = read("src/lib/firestore/courseSessionReports.ts");
    assert.match(record, /export const SESSION_REPORT_QUESTIONS = \[\s*"how",\s*"wentWell",\s*"didnt",\s*"unclear",\s*"engaged",\s*"notRead",\s*"needsHand",\s*"forLead",\s*\] as const;/);
    const reportWords = read("src/lib/courses/sessionReports/words.ts");
    for (const question of ["How did the session go?", "Who engaged well?", "Did anyone seem not to have done the readings?", "Anyone who might need a hand?"]) {
      assert.ok(reportWords.includes(`"${question}"`), `the report no longer asks: ${question}`);
    }

    // "After a session, facilitators": the one writer takes a report only
    // from a live facilitator of the group, refuses an admin and the lead,
    // and only once the session has started.
    const gate = withoutComments(read("src/lib/courses/sessionReports/context.ts"));
    assert.match(gate, /group && !group\.archived && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\),/);
    assert.match(gate, /if \(actor\.role !== "admin"\) return \{ ok: false, status: 403, error: "Forbidden" \};/);
    const route = withoutComments(read("src/app/api/courses/groups/[groupId]/session-report/route.ts"));
    assert.ok(!/export\s+(?:async\s+)?function\s+(?:GET|POST|PATCH|DELETE)\b/.test(route), "the report route now answers more than its writer's PUT");
    assert.ok(route.indexOf("gateReportWriter(db, actor, groupId)") !== -1 && route.indexOf("gateReportWriter(db, actor, groupId)") < route.indexOf("tx.set(ref, {"), "the report route writes before it asks who is writing");
    assert.match(route, /if \(session\.state === "not-yet"\) \{/, "the report route takes a report before its session starts");
    assert.match(read("src/lib/courses/sessionReports/model.ts"), /return \{ session, opensAt: startsAt, closesAt: next, nextWeekNumber: later\.weekNumber \};/);

    // "The programme's lead and admins read these. You don't see them on the
    // site": every caller of the readers, each with its gate. Nothing under a
    // member's pages reads one, a co-facilitator reads only their own, and
    // the Surveys tab gets a count and no words.
    const leadPage = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports/page.tsx";
    const surveysTab = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/page.tsx";
    const ownPage = "src/app/(app)/learn/[runId]/group/[groupId]/report/page.tsx";
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:readRunSessionReports|countRunSessionReports|ownReportView|readOwnReport|loadReportPage)\(/),
      new Map([
        ["src/lib/courses/sessionReports/readers.ts", "the lead's and admins' reader and the tab's count, which ask nobody who is reading, so each caller decides that first"],
        ["src/lib/courses/sessionReports/context.ts", "the writer's own report, read by the id that names the writer"],
        ["src/lib/courses/sessionReports/page.ts", "the facilitator's page, after the writer's own gate: only the caller's own report"],
        [ownPage, "the facilitator's page, which sends everybody but the group's live facilitators away first"],
        [leadPage, "the programme's session reports, for its lead and admins (loadProgrammeRun)"],
        [surveysTab, "the Surveys tab, for its lead and admins (loadProgrammeRun): how many reports, never what one says"],
      ]),
      "reading session reports",
      "The policy says the programme's lead and admins read session reports, and the people they name don't see them on " +
        "the site. If this file shows them to anybody else, the sentence is wrong and a new version has to say so.",
    );
    const lead = withoutComments(read(leadPage));
    assert.match(lead, /const outcome = db \? await loadProgrammeRun\(db, user, roundId, programmeId\) : null;/);
    const refused = lead.indexOf('if (outcome.status === "not-yours") {');
    assert.ok(refused !== -1 && refused < lead.indexOf("readRunSessionReports(db, view.run.id)"), "the lead's page reads reports before it refuses a reviewer");
    assert.equal(applicationAccess.opensProgrammeGroups("reviewer"), false, "a programme's reviewer now opens its session reports");
    const own = withoutComments(read("src/lib/courses/sessionReports/page.ts"));
    assert.match(own, /const own = await readOwnReport\(db, run, group, chosen\.sessionKey, user\.uid\);/, "the facilitator's page reads somebody else's report");
    assert.match(withoutComments(read("src/lib/courses/sessionReports/context.ts")), /report\.writerUid === writerUid \? report : null;/);

    // "but you can ask for what is written about you": everybody a report
    // picks is stored by account, and every report that picks somebody is
    // found by that account, for a copy of their data as for a deletion.
    assert.match(route, /aboutUids: aboutUidsOf\(parsed\.answers\),/);
    assert.match(record, /export type ReportPick = \{ uid: string; note: string \};/);
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.match(cascade, /const about = await rows\.where\("aboutUids", "array-contains", uid\)\.get\(\);/);

    // "the notes and ratings about you": a deletion takes the person out of
    // every report that picks them. "while your account exists": nothing else
    // deletes a report but the run's destroy, which deletes the course record.
    assert.match(
      cascade,
      /try \{\s*summary\.courseSessionReportsCleared = await clearSessionReports\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bCOURSE_SESSION_REPORTS_COLLECTION\b|["'`]courseSessionReports["'`]/),
      new Map([
        ["src/lib/firestore/courseSessionReports.ts", "the record: its shape, its limits and its normaliser"],
        ["src/lib/courses/sessionReports/context.ts", "the writer's own report, read on the server"],
        ["src/lib/courses/sessionReports/readers.ts", "the lead's and admins' reader, read on the server"],
        ["src/app/api/courses/groups/[groupId]/session-report/route.ts", "the one writer, a live facilitator of the group"],
        ["src/lib/firestore/accountDeletion.ts", "a deletion takes the person out of every report, and keeps the reports they wrote with no writer"],
        ["src/lib/firestore/courseDeletion.ts", "destroying the run deletes its reports with the rest of its course record"],
      ]),
      "addressing session reports",
      "Session reports are kept while the account exists, taken out with the person's account and deleted with the run. " +
        "A new reader, writer or job here changes who sees them or how long they are kept, and the policy has to say so.",
    );
    // REPORTED: v15's "It leaves" does not name the reports a deleted account
    // wrote. They stay for the lead and admins with no writer at all (owner
    // decision, 1 November 2026: "as notes on a register do"), so no sentence
    // here is false; a date-only update can add them to the list.
    assert.match(cascade, /tx\.create\(rows\.doc\(\), \{ \.\.\.data, writerUid: null, answers, aboutUids: aboutUidsOf\(answers\) \}\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-session-reports.test.mjs")), "tests/course-session-reports.test.mjs runs the writer, the pages and both deletions as each kind of caller");
  });

  test("the notes a group shares on its week pages reach the group, its facilitators, the programme's lead and admins and nobody else, are deleted by their writer alone, stay when somebody leaves, and go with the writer's account", () => {
    // The paragraph, whole; that other people taking part see these and
    // "Nothing else"; and that a deletion removes "the notes you shared with a
    // group", which the cascade does (`deleteCourseGroupSharedNotes`, below)
    // and "It leaves" never names. v14 also said the week a note was written on is
    // shown with it, that the page says who reads them under the notes, and
    // that nobody but its writer can delete a note; v15 leaves those out, and
    // the checks on the code below stay.
    assertHubSays(
      "<strong>Notes shared with your group.</strong> On a programme that places you in a group, each week&apos;s page has notes the group and its facilitators share. A note you add is shown with your name and the day to your group, its facilitators, the programme&apos;s lead and admins. While you are in the group you can delete your own notes; if you leave, they stay with the group.",
    );
    const othersSee = hubPassageOf("<strong>What other people taking part see.</strong>");
    assert.ok(othersSee.includes(" In a group, the notes you share with it, with your name and the day.") && othersSee.endsWith(" Nothing else. "), "the policy no longer says the people in a group see the notes shared with it, and nothing else");
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" the notes you wrote for a group&apos;s other facilitators, the notes you shared with a group,"),
      "the policy no longer says a deletion removes the notes somebody shared with a group",
    );
    assert.match(
      withoutComments(read("src/lib/firestore/accountDeletion.ts")),
      /summary\.courseGroupSharedNotesDeleted = await deleteCourseGroupSharedNotes\(db, uid\);/,
      "a deletion no longer removes the notes somebody shared with a group, which the policy says it does",
    );
    assert.ok(
      !/shared? with (?:a|your) group/i.test(hubPassageOf("It leaves:")),
      "the policy now says a deletion leaves the notes somebody shared with a group, which the code deletes with the account",
    );
    // Every file that addresses the notes, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bCOURSE_GROUP_SHARED_NOTES_COLLECTION\b|["'`]courseGroupSharedNotes["'`]/),
      new Map([
        ["src/lib/firestore/courseGroupSharedNotes.ts", "the note's own shape, its limit, and the one question about a run"],
        ["src/lib/courses/sharedNotes/readers.ts", "the one reader, which asks who the reader is before it reads"],
        ["src/app/api/courses/groups/[groupId]/shared-notes/route.ts", "the one writer, for the group's people and its live facilitators"],
        ["src/app/api/courses/groups/[groupId]/shared-notes/[noteId]/route.ts", "deleting a note, for the person who wrote it alone"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run deletes its groups' notes"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every note it wrote"],
      ]),
      "addressing the notes shared with a group",
      "The policy says these notes reach the group, its facilitators, the " +
        "programme's lead and admins, that their writer can delete them while " +
        "in the group and they stay when the writer leaves, and that a deletion " +
        "removes the notes somebody wrote. If this file reads, shows or removes " +
        "them otherwise, the sentence is wrong and a new version has to say so.",
    );
    // Who reads: the group's people (told, not left, on an account that
    // stands), its live facilitators, and the programme's lead and admins.
    // No track lead and no reviewer.
    const readers = withoutComments(read("src/lib/courses/sharedNotes/readers.ts"));
    assert.match(readers, /\(enrolment\.status === "active" \|\| enrolment\.status === "completed"\) &&\s*placementIsTold\(enrolment\) &&\s*isNamedWithStanding\(actor, "courseEnrolments\.uid", enrolment\.uid\);/);
    assert.match(readers, /return !group\.archived && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\);/);
    assert.match(readers, /return \{ all: staffing\.isAdmin \|\| staffing\.leadOf !== null, reads, writes, own \};/);
    assert.ok(!/isTrackLead|doesTrackLeadWork/.test(readers), "the reader of the notes shared with a group now asks about a run's track lead");
    // Who writes: the group's people and its facilitators, sharing with each
    // other. The lead and admins read and write none.
    const writesGate = /export async function writesSharedNotesOn\([^)]*\): Promise<boolean> \{([\s\S]*?)\n\}/.exec(readers);
    assert.ok(writesGate, "could not find who may add a note to a group's notes");
    assert.ok(!/staffing|leadOf|isAdmin|\.role\b/.test(writesGate[1]), "the programme's lead or an admin may now add a note to a group's notes");
    // What the page shows with a note ("with your name and the day", and the
    // week, which v14 named), and the line under the notes that names who
    // reads them (v14 said the page says so; v15 leaves that out).
    const drawn = read("src/features/courses/weekly/GroupSharedNotes.tsx");
    assert.match(drawn, /<strong>\{note\.writerFirstName\}<\/strong>\s*\{day \? ` · \$\{day\}` : ""\}/);
    assert.match(drawn, /\{sharedNoteWeekLabel\(note\.weekNumber\)\} \{note\.body\}/);
    assert.equal(sharedNotesWords.sharedNoteWeekLabel(3), "Week 3:");
    const listed = drawn.indexOf("{section.notes.map(");
    const whoLine = drawn.indexOf("{section.whoLine}");
    assert.ok(listed !== -1 && whoLine !== -1 && listed < whoLine, "the line naming who reads a group's notes is no longer under the notes");
    assert.equal(
      sharedNotesWords.sharedNotesWhoLine({ groupName: "Group B", reader: "member", leadFirstName: "Claudia" }),
      "Everyone in Group B, your facilitators, Claudia and admins can see these.",
    );
    // "You can delete your own notes", and nobody else can (v14's words, left
    // out of v15; the code keeps it): everybody else, an admin included, is
    // refused before the one delete.
    const remove = withoutComments(read("src/app/api/courses/groups/[groupId]/shared-notes/[noteId]/route.ts"));
    assert.match(
      remove,
      /if \(!here \|\| note\.authorUid !== actor\.uid\) \{\s*if \(actor\.role !== "admin"\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);\s*if \(!here\) return NextResponse\.json\(\{ error: "Note not found" \}, \{ status: 404 \}\);\s*return NextResponse\.json\(\{ error: SHARED_NOTE_REFUSAL\.notYoursToDelete \}, \{ status: 403 \}\);\s*\}\s*await ref\.delete\(\);/,
      "a note shared with a group can now be deleted by somebody other than its writer",
    );
    assert.equal((remove.match(/\.delete\(/g) ?? []).length, 1, "the route that deletes a shared note deletes in more than one place");
    assert.match(drawn, /\{note\.mine && asking !== note\.id && \(/, "the page offers Delete on notes the reader did not write");
    // Leaving touches no note: they stay with the group.
    assert.ok(
      !/courseGroupSharedNotes|COURSE_GROUP_SHARED_NOTES_COLLECTION|sharedNotes/i.test(read("src/lib/courses/leaveRun.ts")),
      "leaving a programme now touches the notes somebody shared with their group, which the policy says stay with it",
    );
    // They go with the writer's account, found by the writer's uid.
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /export async function deleteCourseGroupSharedNotes\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_GROUP_SHARED_NOTES_COLLECTION, uid, "authorUid"\);\s*\}/,
    );
    // tests/course-hub-shared-notes.test.mjs runs who writes, reads and
    // deletes as every caller, the week page and the Attendance tab.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-shared-notes.test.mjs")));
  });

  test("pathways and cases: what is given out is recorded by the group's facilitators, the lead or an admin and seen by those three, a pick seen by those three too but never by a facilitator's co-facilitators, the ready box by nobody else, and they go with the account", () => {
    // v15 names "the packs you pick" among a person's work, which is read by
    // them, their group's facilitators, the programme's lead and admins, and
    // nobody else taking part; a facilitator's own by the lead and admins
    // only; and a deletion removes a person's work. v14 had a paragraph of its
    // own: what is handed out on paper (a pack, such as a pathway, and a case
    // for a short talk) recorded on the site by the group's facilitators, the
    // lead or an admin and seen by those three and the person; a
    // facilitator's own seen by their co-facilitators too; a pick changeable
    // until the session starts; and the ready box shown on the person's own
    // pages alone. v15 leaves those out. The checks on the code below stay,
    // held to the sentences here: nobody else taking part sees any of it, and
    // the pick of a facilitator who takes part is the lead's and admins'.
    assert.ok(hubPassageOf("<strong>What we record.</strong>").includes(" the packs you pick,"), "the policy no longer names the packs somebody picks among their work");
    const whoReads = hubPassageOf("<strong>Who reads it.</strong>");
    for (const sentence of [
      "<strong>Who reads it.</strong> You, your group&apos;s facilitators, the programme&apos;s lead and admins, and nobody else taking part; the week&apos;s page says so.",
      " If you facilitate a group, your own work is read by the lead and admins only.",
    ]) {
      assert.ok(whoReads.includes(sentence), `the policy's Who reads it no longer says: ${sentence}`);
    }
    assert.ok(hubPassageOf("<strong>What other people taking part see.</strong>").endsWith(" Nothing else. "), "the policy no longer says other people taking part see nothing beyond what it lists");
    assert.ok(hubPassageOf("<strong>Deleting your account.</strong>").includes(" your work and the feedback on it,"), "the policy no longer says a deletion removes somebody's work");
    // Every file that addresses the record, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bCOURSE_PACKS_AND_CASES_COLLECTION\b|["'`]coursePacksAndCases["'`]/),
      new Map([
        ["src/lib/firestore/coursePacksAndCases.ts", "the record's own shape, its id and its normaliser"],
        ["src/lib/courses/packsAndCases/readers.ts", "the readers, each read by id from the people a page may show it to"],
        ["src/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts", "the person's own pick and ready box, in their own name only"],
        ["src/app/api/courses/groups/[groupId]/draw/route.ts", "the draw, typed in by the group's live facilitators, the programme's lead or an admin"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run deletes its records"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every record of theirs"],
      ]),
      "addressing the pathways and cases recorded for people",
      "The policy says a pick is read by the person, their group's " +
        "facilitators, the programme's lead and admins and nobody else taking " +
        "part, a facilitator's own by the lead and admins only, and that a " +
        "deletion removes it. What is handed out, and the ready box, are held " +
        "here as v14 described them: seen by the group's facilitators, the " +
        "lead and admins, and by nobody else in the group but the person. If " +
        "this file reads, shows or removes them otherwise, check the policy and " +
        "say so in a new version if it no longer holds.",
    );
    // Who records and reads the draw: the group's live facilitators, the
    // programme's lead and admins, by one gate, which the page and the route
    // both ask.
    const readers = withoutComments(read("src/lib/courses/packsAndCases/readers.ts"));
    assert.match(readers, /!group\.archived && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\);/);
    assert.match(readers, /const leadOf = await programmeLedBy\(db, actor, group\.runId\);/);
    assert.ok(!/isTrackLead|trackLeadUids|admissionsReviewer/.test(readers), "the draw's gate now admits a run's track lead or a reviewer");
    for (const file of ["src/app/api/courses/groups/[groupId]/draw/route.ts", "src/app/(app)/learn/draw/[groupId]/page.tsx"]) {
      assert.match(read(file), /await drawGate\(db, (?:actor|user), group\)/, `${file} no longer asks the draw's gate`);
    }
    // What the draw hands staff holds packs and cases, never the ready box:
    // the draw's state, the spread and This week's work's cells.
    const drawState = /export async function readDrawState\([\s\S]*?\n\}/.exec(readers);
    const weekWork = /export async function weekWorkOf\([\s\S]*?\n\}/.exec(readers);
    assert.ok(drawState && weekWork, "could not find the draw's readers");
    for (const body of [drawState[0], weekWork[0]]) {
      assert.ok(!/\bready\b/.test(body), "a reader of the draw for staff now carries the ready box");
    }
    // A pick reaches This week's work for the group's facilitators, the lead
    // and admins, and a facilitator's own pick is left blank for their
    // co-facilitators: only the lead and admins see that one.
    assert.match(weekWork[0], /const seesOwnWork = viewer\.isAdmin \|\| viewer\.leadOf !== null;/);
    assert.match(weekWork[0], /const hidden = picked && person\.facilitates && !seesOwnWork;/);
    // A person reads their own, by their own uid: the overview asks for the caller's.
    assert.match(
      read("src/app/api/courses/runs/[runId]/overview/route.ts"),
      /await readOwnPacksAndCases\(\s*db,\s*runId,\s*actor\.uid,/,
    );
    // The person's own route writes the caller's record, never anybody else's.
    assert.match(
      read("src/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts"),
      /\.doc\(packCaseRecordId\(runId, actor\.uid, blockId\)\)/,
    );
    // A pick stays open until the session starts.
    assert.match(
      read("src/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts"),
      /if \(startsAt && Date\.now\(\) >= startsAt\.at\.getTime\(\)\) \{/,
    );
    // They go with the account, found by the person's uid.
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /export async function deleteCoursePacksAndCases\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PACKS_AND_CASES_COLLECTION, uid\);\s*\}/,
    );
    // tests/course-hub-packs-and-cases.test.mjs runs the draw, the picks, the
    // ready box and the deletions as every kind of caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-packs-and-cases.test.mjs")));
  });

  test("pairs for a session: recorded by the group's facilitators, the lead or an admin; each person sees their own pair by first name and nothing of another; the group's facilitators, the lead and admins see every pair; a leaver is in none; and they go with the account", () => {
    // "When a session is in pairs, your partner sees your first name and
    // whether you are bringing a laptop", and other people taking part see
    // "Nothing else". Leaving takes somebody out of their group at once, so
    // out of every pair after it. v14 had a paragraph of its own: who records
    // pairs (the group's facilitators, the lead or an admin), that those three
    // see every pair in the group and nobody else in it sees yours, that a
    // facilitator who takes part can be in a pair their co-facilitators see,
    // that a leaver is shown in no pair, and that pairs are deleted with the
    // account. v15 leaves those out and names pairs nowhere among what a
    // deletion leaves; the checks on the code below stay.
    const othersSee = hubPassageOf("<strong>What other people taking part see.</strong>");
    assert.ok(
      othersSee.includes(" When a session is in pairs, your partner sees your first name and whether you are bringing a laptop.") &&
        othersSee.endsWith(" Nothing else. "),
      "the policy no longer says a partner sees a first name and the laptop, and nothing else",
    );
    assert.ok(
      hubPassageOf("<strong>Leaving.</strong>").includes(" If you leave, we record that you left and when, and you leave your group at once."),
      "the policy no longer says somebody who leaves leaves their group at once",
    );
    assert.ok(!/\bpair/i.test(hubPassageOf("It leaves:")), "the policy now says a deletion leaves somebody's pairs, which the code deletes");
    // Every file that addresses the record, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bCOURSE_PAIRS_COLLECTION\b|["'`]coursePairs["'`]/),
      new Map([
        ["src/lib/firestore/coursePairs.ts", "the record's own shape, its id and its normaliser"],
        ["src/lib/courses/pairs/readers.ts", "the readers, each read by id for the people a page may show it to"],
        ["src/app/api/courses/groups/[groupId]/pairs/route.ts", "the one writer, for the group's live facilitators, the programme's lead or an admin"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run deletes its records"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every record of theirs"],
      ]),
      "addressing the pairs recorded for a session in pairs",
      "The policy says a partner sees a person's first name and whether they " +
        "bring a laptop, and other people taking part see nothing else. Who " +
        "records pairs and who sees every pair are held here as v14 described " +
        "them: the group's facilitators, the programme's lead and admins. If " +
        "this file reads, shows or removes pairs otherwise, check the policy and " +
        "say so in a new version if it no longer holds.",
    );
    // Who records them, and who sees every pair: the draw's gate (the group's
    // live facilitators, the programme's lead and admins), asked by the route
    // and the pairs page; the group page's own gate (its live facilitators and
    // admins) for its card.
    for (const file of ["src/app/api/courses/groups/[groupId]/pairs/route.ts", "src/app/(app)/learn/pairs/[groupId]/page.tsx"]) {
      assert.match(read(file), /const gate = await drawGate\(db, (?:actor|user), group\);/, `${file} no longer asks the draw's gate`);
    }
    assert.match(
      read("src/app/(app)/learn/[runId]/group/[groupId]/page.tsx"),
      /const pairsWeek = drawWeek \? await readGroupPairs\(db, runId, groupId, drawWeek, drawList\) : null;/,
    );
    // Each person sees their own pair alone: the week page asks for the
    // session's own person, and the reader hands on one pair's first names
    // and laptops, never another pair or a record.
    assert.match(
      read("src/app/(app)/learn/[runId]/weeks/[n]/page.tsx"),
      /return await readOwnPairs\(db, access\.user, access\.run\.id, access\.groups, access\.enrolment, weekNumber, new Date\(\)\);/,
    );
    const readers = withoutComments(read("src/lib/courses/pairs/readers.ts"));
    const own = /export async function readOwnPairs\([\s\S]*?\n\}/.exec(readers);
    assert.ok(own, "could not find the reader of a person's own pair");
    assert.match(own[0], /const pair = pairOf\(groupPairs\.view, actor\.uid\);/);
    assert.match(own[0], /partners: partners\.map\(\(person\) => person\.firstName\),/);
    assert.match(own[0], /partnersBringing: pair \? pair\.laptops\.filter\(\(person\) => person\.uid !== actor\.uid\)\.map\(\(person\) => person\.firstName\) : \[\],/);
    // A leaver is shown in no pair: pairs are drawn from the group's people
    // taking part now (the draw's list, which takes in the group's
    // facilitators too), in the route, on both staff pages and for the person.
    assert.match(own[0], /const people = await readDrawPeople\(db, runId, group, \{ isAdmin: false \}, now\);/);
    assert.match(own[0], /if \(!people \|\| !people\.some\(\(person\) => person\.uid === actor\.uid\)\) continue;/);
    for (const file of ["src/app/api/courses/groups/[groupId]/pairs/route.ts", "src/app/(app)/learn/pairs/[groupId]/page.tsx"]) {
      assert.match(read(file), /readDrawPeople\(db, (?:group\.runId|run\.id), group, \{ isAdmin: gate\.isAdmin \}, now\)/, `${file} no longer reads the group's people now`);
    }
    // Leaving touches no pair: the record stays and nothing shows it.
    assert.ok(!/coursePairs|COURSE_PAIRS_COLLECTION/.test(read("src/lib/courses/leaveRun.ts")), "leaving now touches the pairs");
    // They go with the account, found by the person's uid.
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /export async function deleteCoursePairs\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PAIRS_COLLECTION, uid\);\s*\}/,
    );
    // tests/course-hub-pairs.test.mjs runs who types them, who sees which,
    // and the deletions as every kind of caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-pairs.test.mjs")));
  });

  test("what somebody fills in on a week is read by them, their group's facilitators, the lead and admins; a facilitator's own by the lead and admins; a leaver's by the lead and admins; and goes with the account", () => {
    // OWNER DECISIONS, 25 and 26 October 2026: Q30 C (the writer, their
    // group's facilitators, the programme's lead and admins; never other
    // fellows), and a facilitator's own work read by the lead and admins.
    // v15 names "the boxes you fill in" among a person's work and says who
    // reads it, a facilitator's own, what stays for the lead and admins when
    // somebody leaves, and that a deletion removes it. v14 also said the
    // boxes save as you type, that the page says who reads them under the
    // boxes, and that after leaving the group's facilitators and the person
    // no longer read them; v15 leaves those out, and the checks on the code
    // below stay.
    assert.ok(hubPassageOf("<strong>What we record.</strong>").includes(" the boxes you fill in,"), "the policy no longer names the boxes somebody fills in among their work");
    const whoReads = hubPassageOf("<strong>Who reads it.</strong>");
    for (const sentence of [
      "<strong>Who reads it.</strong> You, your group&apos;s facilitators, the programme&apos;s lead and admins, and nobody else taking part; the week&apos;s page says so.",
      " If you facilitate a group, your own work is read by the lead and admins only.",
    ]) {
      assert.ok(whoReads.includes(sentence), `the policy's Who reads it no longer says: ${sentence}`);
    }
    assert.ok(
      hubPassageOf("<strong>Leaving.</strong>").includes(" and what you wrote stays in our records for the lead and admins."),
      "the policy no longer says what somebody wrote stays for the lead and admins when they leave",
    );
    assert.ok(hubPassageOf("<strong>Deleting your account.</strong>").includes(" your work and the feedback on it,"), "the policy no longer says a deletion removes somebody's work");
    // Somebody else's boxes are read in one place, after one gate.
    const gateFile = "src/lib/courses/fillInBoxes/access.ts";
    const readerFile = "src/app/api/courses/runs/[runId]/fill-in-boxes/route.ts";
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bboxesReaderFor\(/),
      new Map([
        [gateFile, "the gate itself: admins and the programme's lead for anybody's, a live facilitator of a fellow's own group for theirs, and nobody else for a facilitator's own"],
        [readerFile, "the one reader of somebody else's boxes, which asks the gate before a box is read"],
        ["src/lib/courses/facilitatorWeek/readers.ts", "a group's week for its facilitators, the programme's lead and admins: each person's boxes on the week the page shows, the gate asked person by person before a box is read, for exactly the people it admits"],
        ["src/lib/courses/coursework/load.ts", "one person's coursework page, for the programme's lead and admins: the gate asked for that person, and their boxes drawn only when it answers"],
      ]),
      "deciding who reads somebody's fill-in boxes",
      "The policy says a person's boxes are read by them, their group's " +
        "facilitators, the programme's lead and admins, and a facilitator's own " +
        "by the lead and admins. A second gate is a second answer to that question.",
    );
    const reader = withoutComments(read(readerFile));
    const gated = reader.indexOf("const reader = await boxesReaderFor(db, actor, runId, uid);");
    const refused = reader.indexOf('if (!reader) return NextResponse.json({ error: "Forbidden" }, { status: 403 });');
    const readRows = reader.indexOf('.collection("courseExerciseResponses")');
    assert.ok(gated !== -1 && refused > gated && readRows > refused, "the reader reads a box before it asks who is reading");
    assert.match(reader, /if \(!isFillInResponse\(data\) \|\| data\.uid !== uid \|\| data\.runId !== runId\) continue;/);
    const gate = withoutComments(read(gateFile));
    // Admins and the programme's lead, for anybody's boxes on the run, a leaver's included.
    assert.match(gate, /if \(actor\.role === "admin"\) return "admin";\s*if \(await programmeLedBy\(db, actor, runId\)\) return "lead";/);
    // A facilitator's own boxes are nobody else's to read.
    assert.match(gate, /if \(liveGroups\.some\(\(group\) => group\.facilitatorUids\.includes\(ownerUid\)\)\) return null;/);
    // A fellow's: their group's live facilitators, and only while the fellow
    // is placed there (active or finished, and told), so not after leaving:
    // what a leaver wrote stays "for the lead and admins".
    assert.match(gate, /\(enrolment\.status === "active" \|\| enrolment\.status === "completed"\) &&/);
    assert.match(gate, /if \(group && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\)\) return "facilitator";/);
    // "The week's page says so": under the boxes, in the same people's names.
    assert.equal(
      fillInWords.fillInReadersWords(["Rahul", "Sofia"], "Claudia", "My action plan"),
      "Rahul, Sofia, Claudia and admins can read your action plan. Other fellows can’t.",
    );
    assert.equal(fillInWords.facilitatorFillInReadersWords("Claudia", "My action plan"), "Only Claudia and admins can read your action plan.");
    // The person reads their own back only while their place is live: after
    // leaving, my-exercises refuses them (v14 said so; v15 says only that
    // what a leaver wrote stays for the lead and admins).
    assert.match(
      withoutComments(read("src/app/api/courses/runs/[runId]/my-exercises/route.ts")),
      /\(enrolment\.status === "active" \|\| enrolment\.status === "completed"\) &&/,
    );
    // Stored in the store an account's deletion drains row by row, every kind of row.
    assert.match(read("src/app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts"), /db\.collection\("courseExerciseResponses"\)\.doc\(id\)/);
    assert.match(read("src/lib/firestore/accountDeletion.ts"), /courseExerciseResponses/);
    // tests/course-hub-week-six.test.mjs runs who writes and who reads as
    // every caller, a leaver and a facilitator who holds a place included.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-week-six.test.mjs")));
  });

  test("sealed predictions: saved as typed until sealed, shut to its owner until the week it opens in, read by them and admins alone, every admin opening recorded first, and gone with the account and the run", () => {
    // OWNER DECISION, 26 October 2026 (Zach's extra (d)): the fellow and
    // admins at any time read a card, nobody else, a facilitator's own
    // included; each admin opening recorded.
    //
    // v15 names sealed predictions among a person's work, says they are read
    // by the person and admins alone, that each admin opening is recorded
    // first and the card stays closed without the record, that the staff
    // logs hold what staff did and not what was written, that a deletion
    // removes a person's work and leaves the staff logs. v14 had a paragraph
    // of its own, which v15 leaves out: how a card is filled in, sealed and
    // opened again (and that it saves as typed and nobody changes it once
    // sealed), who the "nobody else" are, what an opening's record holds,
    // that an admin cannot open their own, what a leaver sees, and the run's
    // destroy. The checks on the code below stay.
    assert.ok(hubPassageOf("<strong>What we record.</strong>").includes(" your sealed predictions "), "the policy no longer names sealed predictions among somebody's work");
    assert.ok(
      hubPassageOf("<strong>Who reads it.</strong>").includes(
        " Your sealed predictions are read by you and admins alone, and each time an admin opens them we record it first; if we can&apos;t record it, they stay closed.",
      ),
      "the policy no longer says who reads sealed predictions, and that each admin opening is recorded first",
    );
    const logs = hubPassageOf("<strong>Logs:</strong>");
    assert.ok(
      logs.includes(" We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers,") &&
        logs.includes(" These record what staff did, not what you wrote,"),
      "the policy no longer says the record of an admin opening sealed predictions is a staff log of what staff did",
    );
    assert.ok(hubPassageOf("<strong>Deleting your account.</strong>").includes(" your work and the feedback on it,"), "the policy no longer says a deletion removes somebody's work");
    assert.ok(hubPassageOf("It leaves:").includes(" staff logs;"), "the policy no longer says a deletion leaves the staff logs");
    // Every file that addresses a person's cards, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bCOURSE_PREDICTIONS_COLLECTION\b|["'`]coursePredictions["'`]/),
      new Map([
        ["src/lib/firestore/coursePredictions.ts", "the record's own shape, its id and its normaliser"],
        ["src/lib/courses/predictions/own.ts", "the owner's own card, read by their own id, and what of it they may see now"],
        ["src/app/api/courses/runs/[runId]/predictions/route.ts", "the owner's answers, seal and opening, in their own name only"],
        ["src/app/api/courses/runs/[runId]/predictions/people/route.ts", "an admin's list of whose cards exist, three fields and never an answer"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every card of theirs"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run deletes its cards and the records of opening them"],
      ]),
      "addressing somebody's sealed predictions",
      "The policy says a card is read by its owner and admins alone, each " +
        "admin opening recorded first, and that a deletion removes it. Its " +
        "being shut to its owner once sealed until the week it opens in, and " +
        "gone with the run, are held here as v14 described them. If this file " +
        "reads, shows or removes cards otherwise, check the policy and say so " +
        "in a new version if it no longer holds.",
    );
    // Saved as typed into the owner's own card: the id is built from the session's uid.
    const route = withoutComments(read("src/app/api/courses/runs/[runId]/predictions/route.ts"));
    assert.match(route, /db\.collection\(COURSE_PREDICTIONS_COLLECTION\)\.doc\(predictionsRecordId\(runId, actor\.uid\)\)/);
    // Sealed, nothing changes it: the owner's own route refuses every change.
    assert.match(route, /if \(stage === "start" && stored\?\.start\.sealedAt\) throw new PredictionsError\(REFUSE_SEALED, 409\);/);
    // Opened only after answering again, and then neither changes.
    assert.match(route, /if \(answeredCount\(stored\.card\.questions, stored\.now\.answers\) === 0\) throw new PredictionsError\(REFUSE_OPEN_NEEDS_ONE, 409\);/);
    assert.match(route, /if \(stage === "now" && stored\?\.now\.openedAt\) throw new PredictionsError\(REFUSE_OPENED, 409\);/);
    // A card never sealed shuts on the card's own clock: once the group's session before the week it opens
    // in has ended (`cardOpenTo`). Every published week is open to read ahead since 27 October 2026, so the
    // week being open is not that moment.
    assert.match(route, /if \(opening\.open\) return NextResponse\.json\(\{ error: sealWindowShutWords\(openWeek\) \}, \{ status: 409 \}\);/);
    assert.match(route, /const opening = await cardOpenTo\(db, taker, openWeek, now\);/);
    const clock = withoutComments(read("src/lib/courses/predictions/taker.ts"));
    assert.match(clock, /weekOpening\(resolveSessions\(taker\.run, group\), weekNumber\)/);
    // Shut to its owner: a sealed card's answers travel only once opened, in the week it opens in.
    const own = withoutComments(read("src/lib/courses/predictions/own.ts"));
    assert.match(own, /answers: state === "draft" \|\| state === "closed" \? startAnswers : \{\},/);
    assert.match(own, /start: \{ state: state === "closed" \? "none" : state, answers: \{\}, sealedAt: iso\(sealedAt\) \},/);
    assert.match(own, /sealedAt && openedAt && opening\.open\s*\? \{ answers: startAnswers,/);
    // Nothing of a card in a view-as session.
    assert.match(own, /if \(!actor\.uid \|\| markerIsLive\(await getImpersonator\(\), actor\.uid\)\) return null;/);
    // Who has one: a live, told place (a leaver sees nothing), or a live group to facilitate.
    const taker = withoutComments(read("src/lib/courses/predictions/taker.ts"));
    assert.match(taker, /\(row\.status === "active" \|\| row\.status === "completed"\) &&/);
    assert.match(taker, /placementIsShownTo\(row, \{ isAdmin: actor\.role === "admin" \}\)/);
    // Nobody else reads one: both routes about somebody else's card are an admin's, and not their own.
    const list = withoutComments(read("src/app/api/courses/runs/[runId]/predictions/people/route.ts"));
    const opening = withoutComments(read("src/app/api/courses/runs/[runId]/predictions/people/[uid]/route.ts"));
    for (const source of [list, opening]) {
      assert.match(source, /if \(actor\.role !== "admin"\) return NextResponse\.json\(\{ error: REFUSE_ADMIN_ONLY \}, \{ status: 403 \}\);/);
    }
    assert.match(list, /\.select\("uid", "start\.sealedAt", "now\.openedAt"\)/);
    assert.match(opening, /if \(uid === actor\.uid\) return NextResponse\.json\(\{ error: REFUSE_OWN_CARD \}, \{ status: 403 \}\);/);
    // Recorded first, with who, whose by account id, the run and when, never what it says.
    const openings = withoutComments(read("src/lib/firestore/recordOpenings.ts"));
    const recorded = openings.indexOf(".create({");
    assert.ok(recorded > -1 && openings.indexOf("await read()") > recorded, "the card is read before its opening is recorded");
    const row = openings.slice(recorded, openings.indexOf("});", recorded));
    assert.deepEqual([...row.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]), ["kind", "actorUid", "actorName", "subjectUid", "runId", "openedAt"]);
    assert.match(openings, /return \{ ok: false \};\s*\}\s*return \{ ok: true, value: await read\(\) \};/);
    assert.ok(opening.indexOf("openRecorded(") > -1 && opening.indexOf("ownRecordOf(") > opening.indexOf("openRecorded("));
    assert.match(opening, /if \(!opened\.ok\) return NextResponse\.json\(\{ error: REFUSE_NOT_RECORDED \}, \{ status: 500 \}\);/);
    // Gone with the account; the openings stay; both go with the run's destroy.
    const sweep = read("src/lib/firestore/accountDeletion.ts");
    assert.match(sweep, /return deleteOwnedCourseRows\(db, COURSE_PREDICTIONS_COLLECTION, uid\);/);
    assert.match(sweep, /summary\.coursePredictionsDeleted = await deleteCoursePredictions\(db, uid\);/);
    assert.doesNotMatch(withoutComments(sweep), /RECORD_OPENINGS_COLLECTION|["'`]recordOpenings["'`]/);
    const destroy = read("src/lib/firestore/courseDeletion.ts");
    assert.match(destroy, /drainQuery\(db, COURSE_PREDICTIONS_COLLECTION, byRunId\(COURSE_PREDICTIONS_COLLECTION\), budget\)/);
    assert.match(destroy, /drainQuery\(db, RECORD_OPENINGS_COLLECTION, byRunId\(RECORD_OPENINGS_COLLECTION\), budget\)/);
    // tests/course-hub-sealed-predictions.test.mjs runs every one of these as
    // every caller: the owner before and after sealing and in the week it
    // opens in, a fellow, a facilitator, a co-facilitator, a facilitator who
    // holds a place, the lead, an admin, view-as and signed out.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-sealed-predictions.test.mjs")));
  });

  test("a comment on the material is shown to the run only on a programme anyone can join, and the group's notes take its place on one that places people in groups", () => {
    // A comment the run sees, only on a programme anyone can join; notes the
    // group shares on a programme that places people in groups; and what the
    // other people taking part see of each. v14 said "instead" in so many
    // words; v15 says each where it applies.
    assert.ok(
      hubPassageOf("<strong>Feedback on the material.</strong>").includes(" and on a programme anyone can join, leave a comment the rest of your run sees."),
      "the policy no longer says a comment on the material is seen by the run only on a programme anyone can join",
    );
    assert.ok(
      hubPassageOf("<strong>What other people taking part see.</strong>").includes(
        " On a programme anyone can join, a comment or star rating you leave on its material. In a group, the notes you share with it, with your name and the day.",
      ),
      "the policy no longer says what other people taking part see of a comment and of the notes shared with a group",
    );
    assert.ok(
      hubPassageOf("<strong>Notes shared with your group.</strong>").includes(
        "<strong>Notes shared with your group.</strong> On a programme that places you in a group, each week&apos;s page has notes the group and its facilitators share.",
      ),
      "the policy no longer says the notes a group shares are on a programme that places people in groups",
    );
    // The two kinds of programme there are, and which of them shares notes.
    assert.match(
      read("src/lib/firestore/courses.ts"),
      /export const COURSE_ENROL_MODES: CourseEnrolMode\[\] = \["admissions", "open"\];/,
      "a run can now be of a third kind, and the policy names two",
    );
    assert.equal(sharedNotesRecord.runSharesGroupNotes({ enrolMode: "open" }), false, "a run anyone can join now shares notes in groups");
    assert.equal(sharedNotesRecord.runSharesGroupNotes({ enrolMode: "admissions" }), true, "a run that places people in groups no longer shares notes");
    // The week's page draws the run's comments only where it draws no group's notes.
    assert.match(read("src/app/(app)/learn/[runId]/weeks/[n]/page.tsx"), /if \(!runSharesGroupNotes\(access\.run\) \|\| access\.groups\.length === 0\) return null;/);
    // Nor to somebody holding a place before groups go out, who opens week 1
    // (Q35 B) on a programme that places people in groups and is in no group
    // yet: they are drawn neither.
    assert.match(read("src/features/courses/WeekView.tsx"), /cohortNotes=\{sharedNotes === null && !beforeGroups\}/);
    // tests/course-hub-shared-notes.test.mjs §5 draws both kinds of week page.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-shared-notes.test.mjs")));
  });

  test("the calendar link shows each session's day, time and room with the programme and the group, never a meeting link, a name or an address; a replaced link shows nothing; a leaver's stops at the day they left", () => {
    // The paragraph, whole; that leaving takes somebody out of their group at
    // once (so no session after that day is theirs); and that v15 names the
    // link nowhere among what a deletion leaves. v14 also said where the
    // link is, which calendars take it, that it carries the programme's and
    // the group's names (the "no names" is nobody's name), that it marks a
    // cancelled session and says to join on naisi.uk for an online week, that
    // a replaced link shows nothing, that a leaver's link stops at the day
    // they left, and that it is deleted with the account. v15 leaves those
    // out; the checks on the code below stay.
    assertHubSays(
      "<strong>Your calendar link.</strong> &quot;Add to calendar&quot; gives you a private link to your sessions: their days, times and rooms, with nobody&apos;s name, no email addresses and never a meeting link. Your calendar&apos;s provider (Apple, Google or Microsoft, for example) fetches it from us now and then, under its own privacy policy. Anyone holding the link sees the same, so keep it to yourself; you can replace it at any time.",
    );
    assert.ok(
      hubPassageOf("<strong>Leaving.</strong>").includes(" If you leave, we record that you left and when, and you leave your group at once."),
      "the policy no longer says somebody who leaves leaves their group at once",
    );
    assert.ok(!/calendar/i.test(hubPassageOf("It leaves:")), "the policy now says a deletion leaves the calendar link, which the code deletes");
    const feed = withoutComments(read("src/lib/courses/calendarFeed.ts"));
    // Every field a session carries in the calendar: a hash for its id, the
    // programme and the group (marked when cancelled), its times, the week's
    // room or "Join on naisi.uk", where to join, the programme page, and when
    // it last changed. Nothing else.
    assert.match(
      feed,
      /return \{\s*uid: sessionUid\(run, group, session\),\s*title: session\.cancelled \? cancelledTitle\(title\) : title,\s*startAt: startsAt,\s*endAt: endsAt,\s*location: room \?\? \(online \? JOIN_ON_SITE : undefined\),\s*description: online && !session\.cancelled \? joinWords\(pageUrl\) : undefined,\s*url: pageUrl \?\? undefined,\s*updatedAt: changedAt\(run, group, session\),\s*status: session\.cancelled \? "cancelled" : "confirmed",\s*\};/,
      "what a session carries in the calendar link changed, so the policy's list of what it shows may no longer be what it shows",
    );
    assert.match(feed, /const title = sessionTitle\(programmeName, group\.name\);/);
    assert.equal(calendarWords.sessionTitle("AGI Strategy", "Group B"), "AGI Strategy · Group B");
    assert.equal(calendarWords.cancelledTitle("AGI Strategy · Group B"), "Cancelled · AGI Strategy · Group B");
    assert.equal(calendarWords.JOIN_ON_SITE, "Join on naisi.uk");
    assert.equal(calendarWords.joinWords("https://naisi.uk/learn/run-1"), "Join on naisi.uk: https://naisi.uk/learn/run-1");
    // A group's meeting link is only ever asked about, in one line.
    assert.deepEqual(
      feed.split("\n").filter((line) => /meetingUrl/.test(line)).map((line) => line.trim()),
      ['const hasLink = typeof slot.meetingUrl === "string" && validateSubmissionUrl(slot.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl) === null;'],
      "the calendar link's sessions now read a group's meeting link for more than whether there is one",
    );
    // No person's name and no address, and no organiser or guest in the file.
    assert.ok(!/\b(?:email|displayName|preferredName|fullNameOfUser|firstNameOfUser)\b/i.test(feed), "the calendar link's sessions now read a person's name or address");
    assert.ok(!/ORGANIZER|ATTENDEE/.test(read("src/lib/events/ics.ts")), "a calendar file now names an organiser or a guest");
    // "Your sessions": those of any group you facilitate, too.
    assert.match(feed, /db\.collection\("courseGroups"\)\.where\("facilitatorUids", "array-contains", owner\.uid\)/);
    // The calendar's provider is asked to fetch it again, every so often.
    const route = withoutComments(read("src/app/api/courses/calendar/[token]/sessions.ics/route.ts"));
    assert.match(route, /buildCalendarIcs\(\{ name: CALENDAR_NAME, refreshMinutes: REFRESH_MINUTES, events \}\)/);
    // Replacing writes a new secret over the old one at the person's own uid,
    // and a secret that is not held by exactly one link opens nothing: the
    // same empty calendar as a link that never was.
    const link = withoutComments(read("src/lib/courses/calendarLink.ts"));
    assert.match(link, /const ref = db\.collection\("calendarLinks"\)\.doc\(uid\);/);
    assert.match(link, /if \(stored && !replace\) return stored\.token;\s*const token = mintCalendarToken\(\);\s*tx\.set\(ref, \{ uid, token, createdAt: FieldValue\.serverTimestamp\(\) \}\);/);
    assert.match(link, /\.where\("token", "==", token\)\.limit\(2\)\.get\(\);\s*if \(snap\.docs\.length !== 1\) return null;/);
    assert.match(route, /if \(!isCalendarToken\(token\)\) return calendar\(\[\]\);/);
    assert.match(route, /const uid = await calendarLinkOwner\(db, token\);\s*if \(!uid\) return calendar\(\[\]\);/, "a replaced or unknown calendar link no longer answers with the empty calendar");
    // Somebody who left keeps only the sessions before they left, and none with no day recorded.
    assert.match(feed, /if \(!live && !seat\.droppedOutAt\) continue;/);
    assert.match(feed, /until: live \? null : seat\.droppedOutAt,/);
    assert.match(feed, /if \(seat\.until && startsAt\.getTime\(\) >= seat\.until\.getTime\(\)\) continue;/, "a calendar link now keeps sessions after the day somebody left");
    // A deletion takes it (v14 said so; v15 names it nowhere among what a
    // deletion leaves): the one document at the person's uid.
    assert.match(
      link,
      /export async function deleteCalendarLink\(db: Firestore, uid: string\): Promise<boolean> \{\s*const ref = db\.collection\(CALENDAR_LINKS_COLLECTION\)\.doc\(uid\);\s*if \(!\(await ref\.get\(\)\)\.exists\) return false;\s*await ref\.delete\(\);\s*return true;\s*\}/,
    );
    // tests/course-hub-calendar-feed.test.mjs runs the feed and its route for
    // every kind of link and seat; tests/course-hub-calendar-link.test.mjs the
    // link, its replacing and its deletion; tests/course-hub-calendar-guard.test.mjs
    // walks every calendar the site builds for a meeting link.
    for (const suite of ["course-hub-calendar-feed.test.mjs", "course-hub-calendar-link.test.mjs", "course-hub-calendar-guard.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("a written answer is read by its writer, their group's facilitators, the lead and admins; it locks when opened; Late is its readers' alone; one email says feedback is waiting", () => {
    // OWNER DECISIONS, 25 and 26 October 2026: Q30 C (the writer, their
    // group's facilitators, the programme's lead and admins; never other
    // fellows), Q33 (changeable after sending until a facilitator opens it,
    // the first-sent time kept, "Late" for staff only), Q34 B (one email,
    // the feedback on the site), and a facilitator's own answer read and
    // given feedback by the lead or an admin. Each sentence is held to its
    // code below; tests/course-hub-written-answers.test.mjs runs the routes
    // and pages as every kind of caller.
    //
    // v15 says it for all of a person's work: what is recorded and when, who
    // reads it, a facilitator's own, that the week's page says until when it
    // can change and that the people running the group can reopen it, and
    // that feedback shows on the week's page with one email to say it is
    // waiting. v14 said it of the written answer in its own words, and also
    // that it can change until a facilitator opens it or feedback is sent,
    // that opening it is recorded, that its readers see whether it was late
    // and the writer's own pages never mark it so, that feedback is rubric
    // levels and a comment and never a mark, and, among the emails, "that
    // feedback on your written answer is waiting". v15 leaves those out; the
    // checks on the code below stay.
    assert.ok(
      hubPassageOf("<strong>What we record.</strong>").includes(
        "<strong>What we record.</strong> What you tick, write and send on each week&apos;s pages, and when: the readings you tick, your reflections and written answers,",
      ),
      "the policy no longer says written answers, and when they are sent, are recorded",
    );
    const whoReads = hubPassageOf("<strong>Who reads it.</strong>");
    for (const sentence of [
      "<strong>Who reads it.</strong> You, your group&apos;s facilitators, the programme&apos;s lead and admins, and nobody else taking part; the week&apos;s page says so.",
      " If you facilitate a group, your own work is read by the lead and admins only.",
    ]) {
      assert.ok(whoReads.includes(sentence), `the policy's Who reads it no longer says: ${sentence}`);
    }
    assert.ok(
      hubPassageOf("<strong>If you facilitate your own group.</strong>").includes(
        " Your own work is read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and they don&apos;t give you feedback on it.",
      ),
      "the policy no longer says a facilitator's own work is the lead's and admins' to read and give feedback on",
    );
    assert.ok(
      hubPassageOf("<strong>Changing your work.</strong>").includes(
        " The week&apos;s page says until when you can change your work, and the people running your group can reopen it for you.",
      ),
      "the policy no longer says the week's page says until when work can change, and who can reopen it",
    );
    assertHubSays(
      "<strong>Feedback.</strong> Feedback on your work is written by a person on the team running your programme, and shows their name. It appears on the week&apos;s page, and we may email you to say feedback is waiting.",
    );
    // "The week's page says until when you can change your work": under the
    // week's title, for somebody taking part, the line that says when the
    // week locks, or that it has, run in every state, and drawn by the week
    // page from where the week stands (the week you submit).
    const until = (state) => weekWorkWords.lockLineWords(state, { room: "Portland A21", reopenedBy: "Rahul" });
    const wed = new Date("2026-11-18T15:00:00Z");
    assert.equal(until({ kind: "open", locksAt: wed, by: "session" }), "Your session: Wed 18 Nov, 3pm, Portland A21. This week locks when it starts.");
    assert.equal(until({ kind: "open", locksAt: null, by: "undated" }), "This week locks when your group’s session starts. Your group’s time isn’t set yet.");
    assert.equal(until({ kind: "open", locksAt: null, by: "no-group" }), "This week locks when you submit it.");
    assert.equal(until({ kind: "locked", at: wed }), "Locked when your session started on Wed 18 Nov, 3pm.");
    assert.match(until({ kind: "reopened", at: wed, byUid: "rahul", locksAt: wed }), /^Rahul reopened this week for you\. It locks again when you submit it, or at your next session, Wed 18 Nov, 3pm\.$/);
    const weekPage = withoutComments(read("src/features/courses/weekBlocks/BlockWeek.tsx"));
    assert.match(weekPage, /\{work && \(\s*<p className=\{weekWorkStyles\.lockLine\}>\s*\{lockLineWords\(weekWorkStateOf\(work\)/, "the week page no longer says until when the work can change");
    // ...and the people running the group can reopen it: the reopen route asks
    // the one gate on whose work a reader may act on, and records who reopened it.
    const reopen = withoutComments(read("src/app/api/courses/runs/[runId]/weeks/[weekId]/reopen/route.ts"));
    assert.ok(reopen.includes("const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;"), "Reopen no longer asks the one gate");
    assert.ok(reopen.includes('if (!run || !owner || !role?.mayReview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });'));
    assert.ok(reopen.includes("reopenedByUid: actor.uid,"), "Reopen no longer records who reopened the week");

    // Who reads it: the one gate, its three lines that decide.
    const gate = withoutComments(read("src/lib/courses/writtenAnswers/access.ts"));
    assert.ok(gate.includes('if (!actor.uid || actor.uid === owner.uid) return { mayReview: false, locksOnOpen: false, ownerFacilitates };'), "the gate no longer refuses everybody their own answer");
    // A facilitator's own answer: the one rule for a facilitator's own work,
    // asked here and by the summer's answers (the test of "If you facilitate
    // your own group" runs it), its body pinned as this line pinned the
    // gate's own before the rule was shared.
    assert.ok(gate.includes("const own = readsFacilitatorsOwnWork(actor, facts, owner.uid);") && gate.includes("return { mayReview: own, locksOnOpen: own, ownerFacilitates };"), "the gate no longer keeps a facilitator's own answer for the lead and admins");
    assert.ok(gate.includes("return Boolean(actor.uid) && actor.uid !== ownerUid && (facts.isAdmin || facts.isLead);"), "the rule for a facilitator's own work no longer admits the lead and admins alone, and never its owner");
    assert.ok(gate.includes("return { mayReview: staff || facilitatesTheirGroup, locksOnOpen: facilitatesTheirGroup, ownerFacilitates };"), "the gate no longer admits a fellow's group's facilitators, the lead and admins, and nobody else");
    // The page beside the box says so, and from when: the words are run, and drawn by the answer's card.
    assert.equal(
      weekWorkWords.answerReadersWords({ kind: "facilitators", names: ["Rahul", "Sofia"] }, "Claudia"),
      "Once you submit, or your week locks, Rahul, Sofia, Claudia and admins can read your written answer.",
    );
    assert.equal(weekWorkWords.othersReadWords({ kind: "facilitators", names: ["Rahul"] }), "Other fellows can’t.");
    assert.match(read("src/features/courses/weekBlocks/WrittenAnswerCard.tsx"), /\{answerReadersWords\(readers, leadName\)\}/);

    // "And when": an answer is sent by submitting its week, which stamps the
    // first-sent time once, and only there; a later change has its own stamp.
    const writer = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts"));
    const submit = withoutComments(read("src/app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts"));
    assert.ok(submit.includes("if (written.words > 0 && !written.firstSentAt) toSend.push(index);"), "Submit no longer sends only an answer never sent");
    assert.ok(submit.includes("tx.update(answerRefs[index], { firstSentAt: at, submittedAt: at });"));
    assert.doesNotMatch(writer, /firstSentAt\s*=|firstSentAt:/, "the writer's route stamps the first-sent time");
    assert.ok(writer.includes("if (changed) write.editedAt = FieldValue.serverTimestamp();"), "a change after sending no longer stores its own time");
    // Locked once the week is submitted or locks, asked inside the write's
    // transaction; an answer opened before weeks were submitted stays locked
    // until the week is reopened.
    assert.ok(writer.includes("assertWeekTakesWork(week.state);"), "the writer's route no longer refuses a locked week");
    assert.ok(writer.includes("if (record?.openedAt) throw new AnswerError(ANSWER_LOCKED, 409);"), "the writer's route no longer refuses an answer opened before weeks were submitted");

    // "Until then they see only that you have started it, never what it says,
    // and if your week locks before you send it, they may then read what you
    // wrote": the one answer, run, and asked by every reader of an answer's
    // words (tests/course-written-answer-readers.test.mjs walks the tree).
    const draft = { firstSentAt: null };
    assert.equal(weekWorkModel.workIsReadable({ kind: "open", locksAt: wed, by: "session" }, draft), false);
    assert.equal(weekWorkModel.workIsReadable({ kind: "reopened", at: wed, byUid: "rahul", locksAt: null }, { firstSentAt: wed }), false);
    assert.equal(weekWorkModel.workIsReadable({ kind: "submitted", at: wed }, draft), true);
    assert.equal(weekWorkModel.workIsReadable({ kind: "locked", at: wed }, draft), true);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-written-answer-readers.test.mjs")), "the guard on every reader of a written answer's words is gone");
    for (const reader of [
      "src/lib/courses/writtenAnswers/reviewPage.ts",
      "src/lib/courses/writtenAnswers/queue.ts",
      "src/lib/courses/facilitatorWeek/readers.ts",
      "src/lib/courses/coursework/gather.ts",
    ]) {
      assert.match(withoutComments(read(reader)), /\bworkIsReadable\(/, `${reader} reads a written answer's words without asking whether it may`);
    }

    // Feedback by a POST, never a GET, and only on an answer its readers may read.
    const review = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts"));
    assert.match(review, /export async function POST\(/);
    assert.doesNotMatch(review, /export (?:async )?function GET\b|export const GET\b/, "the review route answers a GET, which must never write");
    assert.ok(review.includes("if (record.words === 0 || !workIsReadable(standing.state, record)) {"), "feedback is given on an answer its readers may not read");

    // "Late" travels to its readers only (v14's words; v15 leaves them out,
    // and the code keeps it): the writer's wire has no such field.
    const wire = withoutComments(read("src/lib/courses/writtenAnswers/wire.ts"));
    assert.doesNotMatch(wire, /\blate\b/i, "the wire a writer reads carries whether their answer was late");
    assert.match(withoutComments(read("src/lib/courses/writtenAnswers/reviewPage.ts")), /late: record\?\.firstSentAt \? isLate\(record\.firstSentAt, due\) : false,/);

    // Feedback is levels and a comment, never a number (v14: "never a
    // mark"; v15 says only that it shows its writer's name).
    const rubric = withoutComments(read("src/lib/courses/rubric.ts"));
    assert.ok(rubric.includes("out.push({ row: row.name, level: rubric.levels[index], descriptor: row.descriptors[index] ?? \"\" });"));
    assert.doesNotMatch(review, /\b(?:score|mark|total|points)\s*:/i, "feedback stores a score, a mark or a total");

    // "It appears on the week's page, and we may email you to say feedback
    // is waiting": the one email, sent after the feedback is saved, never
    // carrying it.
    assert.ok(review.includes("await sendWrittenFeedbackEmail({"), "the review route no longer sends the email that feedback is waiting");
    const template = withoutComments(read("src/emails/WrittenFeedbackEmail.tsx"));
    assert.doesNotMatch(template, /comment|levels|descriptor/i, "the email carries the feedback itself, which stays on the site");
  });

  // v14 listed what a deletion removes item by item, and this test pinned
  // the span from progress to a pitch sent alone. v15 says it in general
  // words: a person's work and the feedback on it (its What we record names
  // the readings ticked, written answers, reflections, a week's boxes, the
  // packs picked and sealed predictions), the notes they gave (shared with a
  // group, or written for a group's other facilitators) and their survey
  // links and name on their answers; and it names neither the calendar link
  // nor pairs nor what was handed out, in this list or in what a deletion
  // leaves. The cascade's steps below are held as they were.
  test("a deletion removes the calendar link, the notes shared with a group and the notes written for a group's other facilitators", () => {
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(
        " your places on programmes, your work and the feedback on it, the notes and ratings about you, the ratings you gave, the notes you wrote for a group&apos;s other facilitators, the notes you shared with a group, a conduct flag, your survey links and your name on your survey answers,",
      ),
      "the policy no longer says a deletion removes somebody's work, the notes they gave and their survey links",
    );
    const leaves = hubPassageOf("It leaves:");
    assert.ok(leaves.length > 200, "could not find what the policy says a deletion leaves");
    // The one kind of note a deletion leaves: what somebody wrote about
    // another person on a register. The register keeps it under the person it
    // is about (`participantNotes`, a map from their account to the words,
    // with no writer), and the cascade takes out only the deleted person's
    // own key, so a writer's deletion cannot find what they wrote.
    const REGISTER_NOTES = " notes you wrote about somebody on a register, which records no writer;";
    assert.ok(leaves.includes(REGISTER_NOTES), "the policy no longer says a deletion leaves the notes somebody wrote about another person on a register");
    assert.match(read("src/lib/firestore/courseAttendance.ts"), /participantNotes: Record<string, string>;/, "a register's notes now record more than the words about each person");
    const cascadeCode = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.match(cascadeCode, /new FieldPath\("participantNotes", uid\),/, "a deletion no longer takes the deleted person's own note out of every register");
    for (const [what, named, text] of [
      ["the calendar link", /calendar/i, leaves],
      ["pairs for a session", /\bpair/i, leaves],
      ["what was handed out, packs and cases", /\bpack|\bcase\b|pathway/i, leaves],
      ["a week's work", /reflection|written answer|\bbox(?:es)?\b|progress|prediction/i, leaves],
      ["the notes somebody shared or wrote for other facilitators", /\bnotes?\b/i, leaves.replace(REGISTER_NOTES, "")],
    ]) {
      assert.ok(!named.test(text), `the policy now says a deletion leaves ${what}, which the code deletes`);
    }
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    for (const step of [
      '["courseExerciseResponses", "courseExerciseResponsesDeleted"],',
      "summary.calendarLinkDeleted = await deleteCalendarLink(db, uid);",
      "summary.courseGroupSharedNotesDeleted = await deleteCourseGroupSharedNotes(db, uid);",
      "summary.courseGroupNotesDeleted = await deleteCourseGroupNotes(db, uid);",
      "summary.coursePacksAndCasesDeleted = await deleteCoursePacksAndCases(db, uid);",
      "summary.coursePairsDeleted = await deleteCoursePairs(db, uid);",
      "summary.coursePredictionsDeleted = await deleteCoursePredictions(db, uid);",
    ]) {
      assert.ok(
        cascade.includes(step),
        `the account deletion no longer runs \`${step}\`. The policy says a deletion removes what it took, or does not say a deletion leaves it.`,
      );
    }
    // Pairs and both predictions cards go whole, every row the uid owns.
    assert.match(cascade, /export async function deleteCoursePairs\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PAIRS_COLLECTION, uid\);\s*\}/);
    assert.match(cascade, /export async function deleteCoursePredictions\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PREDICTIONS_COLLECTION, uid\);\s*\}/);
    // "Your work": reflections and what somebody wrote in a week's boxes are
    // rows of the written answers' own store, keyed by their writer's uid,
    // which the cascade sweeps by uid whatever their kind.
    for (const [route, kind] of [
      ["src/app/api/courses/runs/[runId]/reflections/[promptId]/route.ts", "reflection"],
      ["src/app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts", "fillIn"],
    ]) {
      const writer = withoutComments(read(route));
      assert.match(writer, /db\.collection\("courseExerciseResponses"\)\.doc\(id\)/, `${route} no longer writes the store the cascade sweeps`);
      assert.match(writer, /uid: actor\.uid,/, `${route} no longer keys its row by its writer`);
      assert.match(writer, new RegExp(`kind: "${kind}",`), `${route} no longer writes a ${kind} row`);
    }
    const sweep = /async function deleteOwnedCourseRows\([\s\S]*?\n\}/.exec(cascade)?.[0] ?? "";
    assert.match(sweep, /\.where\(field, "==", uid\)\s*\.limit\(COURSE_PAGE_SIZE\)\s*\.get\(\);/);
    assert.ok(!/kind/.test(sweep), "the cascade's sweep of a person's rows now picks among kinds, so it may leave reflections or boxes behind");
  });

  test("a survey is confidential: its answers keep the person's name, only admins see who said what or who has answered, facilitators see nothing of it, and the survey says so at the top", () => {
    // The policy's Confidential, sentence by sentence: confidential with the
    // name kept, said at the top; only admins see who said what; the lead
    // sees totals and comments and never a name or who answered; facilitators
    // see nothing of a survey but their own group's check-ins (v15 says they
    // MAY see their own group's check-in totals, and v14's "Facilitators
    // never see anything of a survey" is taken back for that: the register's
    // check-in card shows them how many have sent it while it is open, and its
    // totals from three answers once it has closed, never a comment or who
    // said what, held below); an event's organisers see that its survey went
    // and when.
    const confidential = hubPassageOf("<strong>Confidential.</strong>");
    for (const sentence of [
      "<strong>Confidential.</strong> Every survey is confidential: we keep your answers with your name, and each survey says so at the top. Only NAISI&apos;s admins can see who said what, and we record each time one of them does.",
      " The programme&apos;s lead sees the totals and comments of its surveys, and never sees your name or who answered and who did not, and cannot download the answers.",
      " Facilitators may see their own group&apos;s check-in totals, never who said what and never the comments, and see nothing else of a survey.",
      " An event&apos;s organisers are told that its survey went and when, and nothing of its results.",
    ]) {
      assert.ok(confidential.includes(sentence), `the policy's Confidential no longer says: ${sentence}`);
    }
    // Confidential is the one setting a survey has, whatever is stored.
    assert.match(read("src/lib/firestore/surveys.ts"), /export type SurveyPrivacy = "confidential";/, "a survey can now be something other than confidential");
    assert.equal(surveyRecords.normalizeSurvey("s1", { privacy: "anonymous" }).privacy, "confidential");
    // The sentence about anonymous surveys promised that an anonymous form
    // would say so and how, with the policy first. The anonymous form keeps
    // that promise and replaces the sentence: the surveys section closes
    // with the form's paragraph, on the page once, and the promise is gone
    // (the anonymous form's test holds the paragraph to the code).
    const surveys = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="surveys"'), PAGE_FLAT.indexOf('<section id="ai-review"'));
    assert.match(surveys, /<p> <strong>The anonymous form\.<\/strong> One form never records who answers: [^<]* <\/p> <\/section> $/, "the surveys section no longer closes with the anonymous form");
    assert.equal((PAGE_FLAT.match(/We do not currently run anonymous surveys/g) ?? []).length, 0, "the promise is still on the page beside the form that kept it");
    assert.equal((PAGE_FLAT.match(/One form never records who answers/g) ?? []).length, 1);

    // Every page and route that reaches survey code from outside it, and why
    // each may: the admins' (behind the (admin-only) layout, or canRunSurveys
    // in the route), the person's own (by the secret in their link, or signed
    // in by their own row), and the two that take names off. No facilitator's
    // page, and no lead's but the programme's: its Surveys tab, one survey's
    // results under it and the Overview's count, the totals and comments of
    // the lead's own programme's surveys, never a name (CHANGED ON PURPOSE,
    // Q46 and Q49 A; then finding L2, which widened the second from the
    // leaving survey to every survey of the programme and added the first).
    const ADMIN_PAGE = "an admins' page: the (admin-only) layout sends everybody else to the dashboard first";
    const ADMIN_ROUTE = "an admin's action: canRunSurveys refuses everybody else before anything is read";
    assertExactlyTheseFiles(
      sourceFilesNaming(SURVEY_CODE).filter((file) => !insideSurveyCode(file)),
      new Map([
        ["src/app/(app)/admin/(admin-only)/surveys/page.tsx", ADMIN_PAGE],
        ["src/app/(app)/admin/(admin-only)/surveys/new/page.tsx", ADMIN_PAGE],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/page.tsx", ADMIN_PAGE],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/questions/page.tsx", ADMIN_PAGE],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/send/page.tsx", ADMIN_PAGE],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/page.tsx", `${ADMIN_PAGE}; the one page that names who has answered`],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/[who]/page.tsx", `${ADMIN_PAGE}; one person's answers, drawn only from what the opening route hands back`],
        ["src/app/(app)/admin/(admin-only)/surveys/[surveyId]/results/page.tsx", `${ADMIN_PAGE}; totals, made on the server, with no name`],
        ["src/app/(app)/admin/(admin-only)/surveys/kairos/[roundId]/[programmeId]/page.tsx", `${ADMIN_PAGE}; the Kairos report, totals made on the server, with no name`],
        // Public numbers (sv-public): an admin publishes totals and ticked
        // comments, never a name, on a programme's public page, which the
        // policy says; the public page reads only the published record,
        // outside survey code (the public numbers block below).
        ["src/app/(app)/admin/(admin-only)/surveys/public-numbers/page.tsx", `${ADMIN_PAGE}; totals and ticked comments made on the server, with no name`],
        ["src/app/api/surveys/public-numbers/route.ts", `${ADMIN_ROUTE}; publishes totals and ticked comments, never a name or an answer's id`],
        ["src/app/api/surveys/public-numbers/take-down/route.ts", `${ADMIN_ROUTE}; deletes what was published, and reads no answer`],
        ["src/app/api/surveys/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/questions/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/test/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/send/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/remind/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/close/route.ts", ADMIN_ROUTE],
        ["src/app/api/surveys/[surveyId]/open/route.ts", `${ADMIN_ROUTE}; opens a leaving survey, which emails nobody`],
        ["src/app/api/surveys/[surveyId]/export/route.ts", `${ADMIN_ROUTE}; the spreadsheet with names`],
        ["src/app/api/surveys/[surveyId]/people/[who]/route.ts", `${ADMIN_ROUTE}; opens one person's answers, the opening recorded before any is read`],
        ["src/app/survey/[token]/page.tsx", "the person's own survey, by the secret in their link, which opens their own row and nobody else's"],
        ["src/app/api/surveys/answer/route.ts", "the person's own answers, sent through the secret in their link"],
        ["src/app/(app)/learn/[runId]/survey/[surveyId]/page.tsx", "the person's own survey, signed in: shown only to somebody it was sent to, by their own row"],
        ["src/app/api/surveys/[surveyId]/answer/route.ts", "the person's own answers, signed in, to their own row: there is no uid in the request"],
        ["src/app/api/surveys/consent/route.ts", "the person's own follow-ups consent, changed through the secret in their link, on their own row"],
        ["src/app/api/surveys/[surveyId]/consent/route.ts", "the person's own follow-ups consent, changed signed in, on their own row: there is no uid in the request"],
        // The questions somebody left blank (docs/surveys.md): an admin's
        // press for one person, and the person's own later send, by the
        // secret in their link of blanks or signed in on their own row.
        ["src/app/api/surveys/[surveyId]/people/[who]/blanks/route.ts", `${ADMIN_ROUTE}; emails one person a link to the questions they left blank, never an answer`],
        ["src/app/api/surveys/blanks/route.ts", "the person's own answers to the questions they left blank, sent through the secret in their link of blanks, beside their first answers"],
        ["src/app/api/surveys/[surveyId]/blanks/route.ts", "the person's own answers to the questions they left blank, signed in, to their own row: there is no uid in the request"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account takes its name off its survey answers and deletes its survey rows"],
        ["src/lib/scheduler/jobs/surveyNamesOff.ts", "the job that takes names off two years after the programme"],
        // CHANGED ON PURPOSE (Q50 B): the cards of the surveys waiting for the
        // person, drawn on their own pages. Each card is a survey's title,
        // size and closing day and the person's own link: no answer, no name,
        // never how many others have answered.
        [`src/app/(app)/dashboard/page.tsx`, "Home asks surveysWaitingFor for the session's own person, and hands on the cards of surveys sent to them"],
        [`src/app/(app)/dashboard/HomeMember.tsx`, "Home draws the survey cards it is handed: the card's type and its component"],
        // CHANGED ON PURPOSE (Q48 B, wk-lastweek-phone): in its programme's
        // last week, the survey at the end is drawn among the programme's
        // cards, the one card HomeMember was handed and moved there, so it is
        // drawn once. No answer, no name, never how many others answered.
        [`src/app/(app)/dashboard/HomeProgramme.tsx`, "Home's programme card draws the survey at the end it is handed in the last week: the card's type and its component"],
        // CHANGED ON PURPOSE (Q48 B, en-after-phone): the programme page once
        // it is over draws the survey at the end as it stands for its reader,
        // theirs to answer or sent, by endSurveyFor, which asks
        // surveysWaitingFor and reads only the reader's own row and answer.
        ["src/app/(app)/learn/[runId]/page.tsx", "the programme page once it is over asks endSurveyFor for the session's own person: the survey at the end waiting for them, or the day they sent theirs"],
        ["src/features/courses/weekly/AfterTheEnd.tsx", "the programme page once it is over draws the survey at the end it is handed: the card's type and its component"],
        [`src/app/(app)/learn/page.tsx`, "My programmes asks surveysWaitingFor for the session's own person, as Home does"],
        [`src/app/(app)/learn/LearnHub.tsx`, "My programmes draws the survey cards it is handed: the card's type and its component"],
        ["src/app/(app)/learn/[runId]/weeks/[n]/page.tsx", "week 1's first card: the run's before survey while it waits for the reader, by beforeSurveyCardFor"],
        ["src/features/courses/WeekView.tsx", "week 1's page draws the before survey's card it is handed: the card's type and its component"],
        // CHANGED ON PURPOSE (Q46): the leaving survey reaches somebody as
        // they leave, through their own row made then, and the page that
        // says they left draws its card while it is theirs to answer.
        ["src/lib/courses/leaveRun.ts", "leaving makes the leaver's own row on the programme's open leaving survey, with their own link for their email: no answer is read"],
        ["src/features/courses/leaving/leftSurvey.ts", "the page that says somebody left asks surveysWaitingFor whether the run's leaving survey waits for them"],
        ["src/features/courses/leaving/LeftProgramme.tsx", "the page that says somebody left draws the leaving survey's card it is handed: the card's type and its component"],
        [
          "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]/page.tsx",
          "the programme's lead and admins (loadProgrammeRun first): one of its surveys' totals and comments, made on the server, never a name",
        ],
        [
          "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/page.tsx",
          "the programme's lead and admins (loadProgrammeRun first): its Surveys tab, its surveys' totals and comments made on the server, never a name or a row per person",
        ],
        [
          "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx",
          "the programme's lead and admins (loadProgrammeRun first): once the programme is over, its Overview draws how many have answered the survey at the end, the Surveys tab's own count (leadAfterSurveyCard), never a name",
        ],
        // Surveys after events (the event survey block below holds each to its gate).
        ["src/app/api/surveys/[surveyId]/open-at-event/route.ts", `${ADMIN_ROUTE}; opening a survey after an event for its QR code`],
        ["src/app/events/[id]/survey/page.tsx", "the survey after an event by its QR code: signed in, shown only to somebody who signed up or came, by their own row; signed out, it names nobody"],
        ["src/app/(app)/events/manage/[id]/survey/page.tsx", "the event's Survey after tab: everybody in the events area reads that it went and when; the people who run check-in its QR code while it takes answers (surveyCodeAtEvent), never an answer; its results only when canRunSurveys says the viewer is an admin"],
        ["src/app/(app)/events/manage/[id]/check-in/page.tsx", "the Check-in tab reads when the event's survey closes, the end of adding somebody who came and of a walk-in's email, and nothing of its answers or who answered"],
        ["src/app/(app)/events/manage/[id]/door/page.tsx", "the door list reads when the event's survey closes, for the day a walk-in's email goes, and nothing of its answers or who answered"],
        ["src/app/api/events/[id]/check-ins/route.ts", "the door list's route reads when the event's survey closes, the end of adding somebody who came and the day a walk-in's email goes, and nothing of its answers or who answered"],
        ["src/lib/qr/codeAccess.ts", "who may draw a code: an event survey's code for the people who run check-in while that survey takes answers (surveyCodeAtEvent), from the survey's state alone, and nothing of its answers or who answered"],
        // Who a message is for: which term this is, by its forms alone.
        ["src/lib/audience/load.ts", "which term the picker's tags are for (chooseTerm, the forms alone), and nothing of any survey, its answers or who answered"],
        // This term in numbers (sv-term, Q51 B): counts made on the server, never a name.
        ["src/app/(app)/admin/(admin-only)/surveys/term/page.tsx", `${ADMIN_PAGE}; This term in numbers, counts made on the server, never a name`],
        ["src/app/api/surveys/term/totals/route.ts", `${ADMIN_ROUTE}; This term in numbers as a file of totals that names nobody, not a recorded download`],
        // CHANGED ON PURPOSE (v15, "Facilitators may see their own group's
        // check-in totals"): the check-in at the end of a session, opened from
        // the register by the group's facilitator, and the one floored view of
        // it a facilitator reads (docs/surveys.md, "Check-ins").
        [
          "src/app/api/courses/groups/[groupId]/check-in/route.ts",
          "the group's live facilitators and admins (gateGroupRegister first): opens a session's check-in, a row and an email for each person the register marks there, and hands the register's card how many have sent it while it is open and its totals from three answers once closed, never a comment, an answer or a name",
        ],
        ["src/app/api/courses/groups/[groupId]/check-in/close/route.ts", "the group's live facilitators and admins (gateGroupRegister first): closes a session's check-in, reading no answer"],
        ["src/features/courses/register/CheckInCard.tsx", "the register's check-in card: draws what the check-in route hands it, a count while it is open and totals once closed, never a comment, an answer or a name"],
        ["src/app/api/courses/groups/[groupId]/attendance/route.ts", "the register's marking route: somebody marked at a session while its check-in is open gets their own row on it (reachLateMarks), with no email, and no answer is read"],
      ]),
      "reaching survey code from outside it",
      "The policy says only admins see who said what; the programme's lead " +
        "sees totals and comments, never a name or who answered; facilitators " +
        "see nothing of a survey beyond their own group's check-ins, how many " +
        "have sent one while it is open and its totals from three answers once " +
        "it has closed, never a comment or who said what; and an event's " +
        "organisers see only that its survey went and when. If this file shows " +
        "a survey, its answers or who answered to anybody else, the sentence " +
        "is wrong and a new version has to say so.",
    );
    // The two collections that name a person are addressed by survey code alone.
    assertExactlyTheseFiles(
      sourceFilesNaming(/./).filter((file) => SURVEY_STORE.test(withoutComments(read(file)))),
      new Map([
        ["src/lib/firestore/surveys.ts", "the records' own names and shapes"],
        ["src/lib/surveys/repo.ts", "the readers: a person's own row, the row a link opens, the answers for the admins' pages and the spreadsheet, a person's own earlier answer, shown back to them alone, and one person's rows and answers for the admins' page that opens them, read once that opening is recorded"],
        ["src/lib/surveys/consent.ts", "a person changing their own consent later, on their own row"],
        ["src/lib/surveys/answer.ts", "the one writer of an answer: a person's own, once"],
        ["src/lib/surveys/sending.ts", "the send, which writes each person's row with their link before their email"],
        ["src/lib/surveys/namesOff.ts", "names off: two years after the programme, and at once with an account"],
        // CHANGED ON PURPOSE (Q50 B): which surveys wait for a person is read
        // from their own rows, for them alone.
        ["src/lib/surveys/waiting.ts", "the cards: a person's own rows, read for that person alone, to say which surveys sent to them wait for an answer"],
        // CHANGED ON PURPOSE (Q46): the leaving survey's row for a person is made as they leave.
        ["src/lib/surveys/leaving.ts", "the leaving survey's row for a person, made as they leave the programme, with their own link: never an answer"],
        ["src/lib/surveys/events/store.ts", "a survey after an event's rows and its one writer of answers: each person's row before their email, their own answers, once, by their link or signed in, and one person's row and answers for the admins' page that opens them, read once that opening is recorded"],
        // The questions somebody left blank (docs/surveys.md): an admin's press
        // writes the person's own link of blanks on their row, and the one
        // writer of what they send through it keeps it beside their first
        // answers. Their answer is read to count what is blank, and the admins
        // are shown a count, never an answer.
        ["src/lib/surveys/blanksStore.ts", "the questions left blank: a person's own link of blanks on their own row, made by an admin's press and recorded with it, their own answer read to count what is still blank, and the one writer of what they send later, kept beside their first answers"],
        // The check-in at the end of a session (docs/surveys.md, "Check-ins"):
        // each person the register marks there gets their own row with their
        // own link as it opens, or as they are marked while it is open. Never
        // an answer; its readers of answers are repo.ts's, above.
        ["src/lib/surveys/checkIns/open.ts", "the check-in's rows as it opens: one for each person the register marks at the session, with their own link, before their email; never an answer"],
        ["src/lib/surveys/checkIns/lateMark.ts", "the check-in's row for somebody marked at the session after it opened, with their own link and no email; never an answer"],
      ]),
      "addressing who a survey was sent to, or what somebody answered",
      "The policy says only admins see who said what or who has answered. If " +
        "this file reads either for anybody else, the sentence is wrong and a " +
        "new version has to say so.",
    );
    // "Facilitators may see their own group's check-in totals, never who said
    // what and never the comments, and see nothing else of a survey." What a
    // group's facilitators are ever handed of a check-in is the register's
    // card (`checkInRegisterView`), from the register's own gate: while it is
    // open, how many have sent it of how many; once it has closed, its totals
    // from three answers (`facilitatorCount`), and below that only that there
    // are too few. The short answers are never read for it, so no comment can
    // reach it, and nothing in it names or numbers a person.
    assert.equal(checkInModel.TOTALS_FROM, 3);
    const ciItems = checkInTemplate.checkInItems({ parts: [{ id: "part_a", title: "Compute as a lever" }], hasReading: true });
    const ciAnswer = (useful, comment) => ({
      answers: {
        q_ci_useful: { type: "rating", value: useful },
        q_ci_most: { type: "text", text: comment },
        q_ci_better: { type: "text", text: `${comment}, again` },
        q_ci_unclear: { type: "choices", optionIds: ["part_a"] },
        q_ci_reading: { type: "choice", optionId: "o_ci_read_most" },
        q_ci_confident: { type: "rating", value: 3 },
      },
    });
    const ciAnswers = [ciAnswer(5, "Riya’s point about chips"), ciAnswer(4, "The races reading"), ciAnswer(3, "The debate")];
    assert.deepEqual(checkInModel.facilitatorCount("open", ciItems, ciAnswers, 6), { state: "open", answered: 3, of: 6 }, "an open check-in hands a facilitator more than a count");
    assert.deepEqual(checkInModel.facilitatorCount("closed", ciItems, ciAnswers.slice(0, 2), 6), { state: "closed", answered: 2, of: 6, totals: null }, "a check-in with two answers shows its facilitators totals");
    const ciTotals = checkInModel.facilitatorCount("closed", ciItems, ciAnswers, 6).totals;
    assert.deepEqual(Object.keys(ciTotals).sort(), ["answered", "confident", "of", "readMost", "unclear", "useful"]);
    assert.ok(!/Riya|races reading|debate|again/.test(JSON.stringify(ciTotals)), "a check-in's totals carry a comment");
    const ciView = withoutComments(read("src/lib/surveys/checkIns/facilitatorView.ts"));
    assert.ok(!/\btotalsOf\(|\.answers\b(?!Of)|respondent/.test(ciView.replace(/answersOf\(db, survey\)/g, "")), "the register's view of a check-in reads answers round the floored count");
    assert.match(ciView, /return facilitatorCount\("closed", survey\.items, answers, sentCountOf\(survey\)\);/);
    const ciRoute = withoutComments(read("src/app/api/courses/groups/[groupId]/check-in/route.ts"));
    for (const verb of ["GET", "POST"]) {
      const handler = new RegExp(`export async function ${verb}\\([\\s\\S]*?\\n\\}`).exec(ciRoute)?.[0] ?? "";
      const gate = handler.indexOf("await gateGroupRegister(groupId, actor, db)");
      const reads = Math.min(...["checkInRegisterView(", "openCheckIn("].map((call) => handler.indexOf(call)).filter((at) => at !== -1));
      assert.ok(gate !== -1 && gate < reads, `the check-in route's ${verb} reads the check-in before the register's gate`);
    }
    assert.match(ciRoute, /return NextResponse\.json\(\{ sessionKey: view\.sessionKey, card: view\.card, last: view\.last \}\);/);
    // tests/surveys-check-ins.test.mjs drives the card, the route and the floors as every kind of caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-check-ins.test.mjs")), "tests/surveys-check-ins.test.mjs is gone");
    // The admins' pages: the layout every one of them sits under.
    assert.match(read("src/app/(app)/admin/(admin-only)/layout.tsx"), /await requireAdminPage\(\);/);
    // The admins' routes: each refuses everybody but an admin before it reads.
    assert.match(read("src/lib/surveys/repo.ts"), /export function canRunSurveys\(user: Pick<SessionUser, "role"> \| null\): boolean \{\s*return user\?\.role === "admin";\s*\}/);
    for (const route of [
      "src/app/api/surveys/route.ts",
      "src/app/api/surveys/[surveyId]/questions/route.ts",
      "src/app/api/surveys/[surveyId]/test/route.ts",
      "src/app/api/surveys/[surveyId]/send/route.ts",
      "src/app/api/surveys/[surveyId]/remind/route.ts",
      "src/app/api/surveys/[surveyId]/close/route.ts",
      "src/app/api/surveys/[surveyId]/open/route.ts",
      "src/app/api/surveys/[surveyId]/export/route.ts",
      "src/app/api/surveys/[surveyId]/open-at-event/route.ts",
      "src/app/api/surveys/[surveyId]/people/[who]/route.ts",
      "src/app/api/surveys/[surveyId]/people/[who]/blanks/route.ts",
    ]) {
      const code = withoutComments(read(route));
      const refused = code.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
      const db = code.indexOf("getAdminDb()");
      assert.ok(refused !== -1 && db !== -1 && refused < db, `${route} reaches the database before it refuses everybody but an admin`);
    }
    // The person's own: a link opens the one row holding its secret, and the
    // signed-in page and route read the caller's own row.
    const repo = withoutComments(read("src/lib/surveys/repo.ts"));
    assert.match(repo, /const people = await db\.collection\(SURVEY_PEOPLE_COLLECTION\)\.where\("token", "==", token\)\.get\(\);/);
    assert.match(repo, /if \(people\.docs\.length > 1\) return \{ kind: "none" \};/);
    assert.match(read("src/app/survey/[token]/page.tsx"), /const target = await openLink\(db, token\);/);
    assert.match(read("src/app/api/surveys/answer/route.ts"), /const target = await openLink\(db, body\.token\);/);
    assert.match(read("src/app/api/surveys/[surveyId]/answer/route.ts"), /await readPerson\(db, survey\.id, \{ kind: "account", uid: actor\.uid \}\)/);
    const signedIn = read("src/app/(app)/learn/[runId]/survey/[surveyId]/page.tsx");
    assert.match(signedIn, /await readPerson\(db, survey\.id, \{ kind: "account", uid: user\.uid \}\)/);
    assert.match(signedIn, /if \(survey && person && person\.sentAt !== null\) \{/);
    // "Each survey says so at the top": the box, run, and drawn above the questions.
    assert.equal(surveyWords.CONFIDENTIAL_HEADING, "Confidential");
    const box = surveyWords.confidentialPoints({ leadName: null, facilitatorNames: ["Rahul", "Sofia"], namesOffOn: "2027-12-09", programmeKind: "fellowship" });
    assert.equal(box.points[0], "Only NAISI’s admins can see who said what.");
    assert.ok(box.points.includes("Rahul and Sofia never see your answers."), "the box no longer tells somebody their facilitators never see their answers");
    assert.equal(box.note, "We ask who you are so we can compare your answers at the start and the end.");
    const untold = surveyWords.confidentialPoints({ leadName: null, facilitatorNames: null, namesOffOn: "2027-12-09", programmeKind: "fellowship" });
    assert.ok(untold.points.includes("Your facilitators never see your answers."));
    const screen = read("src/features/surveys/answer/AnswerScreen.tsx");
    const drawnBox = screen.indexOf("<section className={styles.box} aria-label={survey.box.heading}>");
    const drawnQuestions = screen.indexOf("<SurveyForm ");
    assert.ok(drawnBox !== -1 && drawnQuestions !== -1 && drawnBox < drawnQuestions, "the confidential box is no longer drawn above a survey's questions");
    // tests/surveys-routes.test.mjs drives every route and page as every kind
    // of caller; tests/surveys-items.test.mjs holds the box word for word.
    for (const suite of ["surveys-routes.test.mjs", "surveys-items.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("a survey keeps nothing about how it is filled in; with the answers, only when they were sent, how, and whether the group had met; and never an IP address", () => {
    // The paragraph, whole, and what the hosting provider's request logs are
    // used for. v14 also named what is not recorded (when somebody opened a
    // survey, how long they spent, which page they were on), said "for the
    // first time" of the group meeting, and said the request logs are never
    // matched to the answers; v15 says "Nothing about how you filled it in"
    // and that those logs are used only to fix errors and stop abuse. The
    // checks on the code below stay.
    assertHubSays(
      "<strong>What a survey records.</strong> Your answers, when you sent them, whether you used your own link or were signed in, and whether your group had met by then. Nothing about how you filled it in, and none of your answers until you send them. We never keep your IP address with them.",
      " Our hosting provider&apos;s request logs (IP address, browser and time) are used only to fix errors and stop abuse, never for analytics.",
    );
    // The one write of an answer, field by field.
    const answer = withoutComments(read("src/lib/surveys/answer.ts"));
    const kept = /tx\.set\(answerRef, \{([\s\S]*?)\}\);/.exec(answer);
    assert.ok(kept, "could not find where an answer is kept");
    assert.deepEqual(
      [...kept[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((field) => field[1]),
      ["surveyId", "roundId", "respondent", "answers", "sentAt", "via", "afterFirstSession"],
      "an answer now keeps something the policy does not list",
    );
    assert.match(kept[1], /sentAt: FieldValue\.serverTimestamp\(\),/);
    assert.match(answer, /const afterFirstSession = groupHasMet\(await toldGroupOf\(db, survey\.runId, person\.respondent\.uid\), now\);/);
    // "Whether you used your own link or were signed in": each route says which.
    assert.match(read("src/app/api/surveys/answer/route.ts"), /via: "link",/);
    assert.match(read("src/app/api/surveys/[surveyId]/answer/route.ts"), /via: "signed-in",/);
    // Nothing before Send: the pages a survey is answered on, and what they
    // read, write nothing, and the form keeps nothing in the browser.
    for (const file of [
      "src/app/survey/[token]/page.tsx",
      "src/app/(app)/learn/[runId]/survey/[surveyId]/page.tsx",
      "src/lib/surveys/answerView.ts",
      "src/lib/surveys/personFacts.ts",
      // The page a link of the questions left blank opens, and the signed-in page when it shows them.
      "src/lib/surveys/blanksView.ts",
      // A check-in's own page: its eyebrow, line, box and button.
      "src/lib/surveys/checkIns/answerView.ts",
    ]) {
      assert.ok(
        !/\.(?:set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/.test(withoutComments(read(file))),
        `${file} now writes something when a survey is opened`,
      );
    }
    assert.deepEqual(
      sourceFilesNaming(/\b(?:localStorage|sessionStorage|indexedDB)\b/).filter((file) => insideSurveyCode(file) || file.startsWith("src/app/survey/")),
      [],
      "a survey's page now keeps something in the browser before it is sent",
    );
    // The address is read once, inside the rate limit's key, and kept nowhere.
    const link = withoutComments(read("src/app/api/surveys/answer/route.ts"));
    assert.equal((link.match(/clientIp\(/g) ?? []).length, 1, "the link's answer route reads the caller's address for more than its rate limit");
    assert.match(link, /rateLimit\(`surveys:answer:ip:\$\{clientIp\(req\)\}`, 30, 60_000\)/);
    // tests/surveys-no-tracking.test.mjs walks every survey file for an
    // activity record, an address or a user agent, and a page that writes.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-no-tracking.test.mjs")));
  });

  test("every question in a survey is required unless marked optional, the permission boxes never are, and no code of the applications, admissions or courses reads a survey", () => {
    // CHANGED ON PURPOSE (v14): v13's "Every question can be skipped." was
    // replaced by the rule (§2n holds both versions). v15 keeps the rule word
    // for word under Questions that need an answer, and the sentence about a
    // place or an application, also word for word, closes Confidential.
    assert.ok(
      hubPassageOf("<strong>Questions that need an answer.</strong>").includes(
        "<strong>Questions that need an answer.</strong> Every question needs an answer unless it is marked optional. The boxes that ask your permission are always up to you: whether we may contact you for follow-ups, whether we share your details with Kairos, and whether we may quote you.",
      ),
      "the policy no longer says every question needs an answer unless marked optional, and the permission boxes are up to the person",
    );
    assert.ok(
      hubPassageOf("<strong>Confidential.</strong>").includes(" Nothing you say in a survey affects your place on a programme or an application."),
      "the policy no longer says nothing said in a survey affects a place or an application",
    );
    // The answer page says the same rule, in one line.
    assert.equal(surveyWords.answerRuleWords(true), "Every question needs an answer unless it’s marked optional. The boxes asking your permission are up to you.");
    assert.equal(surveyWords.answerRuleWords(false), "Every question needs an answer unless it’s marked optional.");
    // CHANGED ON PURPOSE (Zach, 30 Oct 2026): this walk held "every question
    // can be skipped". It now holds the rule that replaced it, run over every
    // template, both kinds of programme, the leaving survey and the survey
    // after an event: every question not on the not-for-everybody list is
    // required, every listed one is written optional and is a text question,
    // and every consent box is never required.
    const every = [
      ...[["before", "fellowship", null], ["after", "fellowship", null], ["followUp6", "fellowship", null], ["followUp12", "fellowship", null], ["before", "incubator", "alignment"], ["after", "incubator", "governance"], ["leaving", "fellowship", null]].map(
        ([stage, kind, strand]) => [`the ${stage} template of a ${kind}`, surveyTemplates.templateItems(stage, kind, strand)],
      ),
      ["the survey after an event", eventSurveyTemplate.eventTemplateItems()],
    ];
    for (const [name, each] of every) {
      assert.deepEqual(surveyItems.validateSurveyItems(each), [], `${name} is not valid`);
      for (const question of surveyItems.surveyQuestionsOf(each)) {
        const listed = surveyItems.NOT_FOR_EVERYBODY_IDS.includes(question.id);
        assert.equal(surveyItems.isQuestionRequired(question), !listed, `${name}: ${question.id}`);
        if (listed) assert.ok(question.optional === true && (question.type === "shortText" || question.type === "longText"), `${name}: ${question.id}`);
      }
      for (const consent of surveyItems.consentItemsOf(each)) assert.equal(surveyItems.isQuestionRequired(consent), false, `${name}: ${consent.id} is required`);
    }
    // A blank required answer is refused by both answer writers, before anything is written.
    for (const file of ["src/lib/surveys/answer.ts", "src/lib/surveys/events/store.ts"]) {
      assert.match(withoutComments(read(file)), /const blank = blankRefusal\(survey\.items, [^)]*\);\s*if \(blank\) return blank;/, `${file} keeps an answer with a required question blank`);
    }
    // Worksheets' own `required` is never what decides; it only names a contradiction with the switch.
    const template = surveyTemplates.templateItems("before", "fellowship", null);
    const contradicted = template.map((item) => (item.id === "q_c1" ? { ...item, required: true, optional: true } : item));
    assert.deepEqual(
      surveyItems.validateSurveyItems(contradicted).map((problem) => problem.message),
      [surveyItems.REQUIRED_CONTRADICTION],
    );
    // Nothing said in one reaches a place or an application: the code that
    // decides them reaches no survey code (the walk above names every file
    // that does).
    const decides = sourceFilesNaming(SURVEY_CODE)
      .filter((file) => !insideSurveyCode(file))
      .filter((file) => /^src\/(?:lib|features|app\/api)\/(?:applications|admissions|courses)\//.test(file) || /^src\/app\/\(app\)\/(?:admin\/admissions|admin\/courses|learn\/\[runId\]\/(?!survey\/))/.test(file));
    // CHANGED ON PURPOSE (Q50 B, Q46, Q49 A): was "none at all". Week 1's
    // page and the page that says somebody left draw the card of a survey
    // waiting for their reader, which reads whether it waits and never an
    // answer; leaving makes the leaver's own row on the leaving survey,
    // reading no answer; and a programme's lead reads its surveys' totals and
    // comments, never a name (finding L2: every survey of the programme, and
    // its Surveys tab). Each file listed reaches survey code through exactly
    // the modules beside it, and decides nothing by it.
    const REACHES_NO_ANSWER = new Map([
      ["src/app/(app)/learn/[runId]/weeks/[n]/page.tsx", ["week 1's first card: asks beforeSurveyCardFor whether the run's before survey waits for the reader", ["@/lib/surveys/waiting"]]],
      ["src/features/courses/WeekView.tsx", ["draws the card it is handed, by the card's own component", ["@/lib/surveys/waiting", "@/features/surveys/cards/SurveyCards"]]],
      ["src/features/courses/leaving/leftSurvey.ts", ["asks leavingSurveyCardFor whether the leaving survey of the run they left waits for them", ["@/lib/surveys/waiting"]]],
      ["src/features/courses/leaving/LeftProgramme.tsx", ["draws the leaving survey's card it is handed, by the card's own component", ["@/lib/surveys/waiting", "@/features/surveys/cards/LeavingSurveyCard"]]],
      // CHANGED ON PURPOSE (Q48 B): the programme page once it is over draws
      // the survey at the end as it stands for its reader, which reads
      // whether it waits and the day they sent theirs, never an answer's
      // words, and decides nothing by it.
      ["src/app/(app)/learn/[runId]/page.tsx", ["the programme page once it is over: asks endSurveyFor for the survey at the end as it stands for the reader", ["@/lib/surveys/waiting"]]],
      ["src/features/courses/weekly/AfterTheEnd.tsx", ["draws the survey at the end it is handed, by the card's own component", ["@/lib/surveys/waiting", "@/features/surveys/cards/EndSurveyCard"]]],
      ["src/lib/courses/leaveRun.ts", ["leaving makes the leaver's own row on the programme's open leaving survey (reachLeaver), after the leave has committed", ["@/lib/surveys/leaving"]]],
      [
        "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]/page.tsx",
        [
          "a reading of answers here: one of the programme's surveys' totals and comments for its lead and admins, never a name, deciding nothing",
          ["@/features/surveys/admin/ResultsTab", "@/features/surveys/admin/surveyAdmin.module.css", "@/lib/surveys/adminView", "@/lib/surveys/leadResults", "@/lib/surveys/words"],
        ],
      ],
      [
        "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/page.tsx",
        [
          "the other reading of answers here: the programme's Surveys tab, its surveys' totals and comments for its lead and admins, never a name, deciding nothing",
          ["@/features/surveys/lead/LeadSurveysTab", "@/lib/surveys/leadTab", "@/lib/surveys/words"],
        ],
      ],
      [
        "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx",
        [
          "the Overview once the programme is over: how many have answered the survey at the end, the Surveys tab's own count for its lead and admins, never a name, deciding nothing",
          ["@/lib/surveys/leadTab"],
        ],
      ],
      // CHANGED ON PURPOSE (v15, check-ins at the end of a session): the
      // register opens and closes a session's check-in, and its card shows
      // the group's facilitators a count and, from three answers, its totals.
      // None of it decides a place: no mark, no attendance and no record of
      // who finished reads what a check-in says.
      [
        "src/app/api/courses/groups/[groupId]/check-in/route.ts",
        [
          "a reading of answers here: a closed check-in's totals for the group's own facilitators, from three answers, never a comment or a name; and its opening, a row and an email for each person marked there; deciding nothing",
          ["@/lib/surveys/checkIns/facilitatorView", "@/lib/surveys/checkIns/open", "@/lib/surveys/checkIns/sessionRead", "@/lib/surveys/checkIns/words"],
        ],
      ],
      [
        "src/app/api/courses/groups/[groupId]/check-in/close/route.ts",
        ["closes a session's check-in, reading no answer and deciding nothing", ["@/lib/surveys/checkIns/close", "@/lib/surveys/checkIns/sessionRead", "@/lib/surveys/checkIns/words"]],
      ],
      [
        "src/features/courses/register/CheckInCard.tsx",
        ["draws the check-in card the route hands it, by its words, deciding nothing", ["@/lib/surveys/checkIns/facilitatorView", "@/lib/surveys/checkIns/words"]],
      ],
      [
        "src/app/api/courses/groups/[groupId]/attendance/route.ts",
        ["after a mark is kept, gives somebody marked there their own row on the session's open check-in, reading no answer; the mark is decided before it, and nothing of a check-in changes it", ["@/lib/surveys/checkIns/lateMark"]],
      ],
    ]);
    assertExactlyTheseFiles(
      decides,
      new Map([...REACHES_NO_ANSWER].map(([file, [why]]) => [file, why])),
      "code of the applications, admissions or courses that reaches survey code",
      "Nothing said in a survey may affect a place or an application: reach survey code only to draw a card, through src/lib/surveys/waiting.ts, or change the policy first.",
    );
    for (const [file, [, modules]] of REACHES_NO_ANSWER) {
      const reached = [...withoutComments(read(file)).matchAll(/from\s*"(@\/(?:lib\/surveys|features\/surveys|lib\/firestore\/surveys)[^"]*)"/g)].map((match) => match[1]);
      assert.deepEqual([...new Set(reached)].sort(), [...modules].sort(), `${file} reaches survey code through ${reached.join(", ")}`);
    }
    // Leaving reaches the survey only after the leave has committed, and only for somebody who left.
    const leave = withoutComments(read("src/lib/courses/leaveRun.ts"));
    assert.ok(leave.indexOf("if (!dropped) return") < leave.indexOf("reachLeaverSafely(db,"), "leaving reaches the survey before it knows the leave took");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-items.test.mjs")));
  });

  test("a survey and its reminder go as important notices, each with a link of its person's own, and the reminder only to people who have not answered", () => {
    // A survey's email is a notice, with a link of the person's own; notices
    // reach somebody whatever their choices, say why, and carry no
    // unsubscribe link; a programme's surveys go to the people holding a
    // place on it. v14 also said why the name is kept with the answers (to
    // compare them at the end and in follow-ups, and so that a reminder goes
    // only to people who have not answered), that only admins see who has
    // answered, that the survey at the end shows a person what they said
    // they wanted, and nobody else, and named the reminder beside the survey.
    // v15 leaves those out; the lead never sees who answered (Confidential,
    // held by the confidential test) and the checks on the code below stay.
    assert.ok(
      hubPassageOf("<strong>How a survey reaches you.</strong>").includes(
        "<strong>How a survey reaches you.</strong> A survey&apos;s email is a notice, so your notification settings don&apos;t switch it off, and it carries a link of your own so you can answer without signing in. Anyone holding it could answer in your name, so keep it to yourself.",
      ),
      "the policy no longer says a survey's email is a notice with a link of the person's own",
    );
    assert.ok(
      hubPassageOf("<strong>Three kinds of email.</strong>").includes(
        " And some are notices from the people running an event you signed up for or a programme you hold a place on, about running it: a room change, a survey, a reminder about this week&apos;s work. Notices reach you whatever your choices, say why they reached you, and carry no unsubscribe link.",
      ),
      "the policy no longer says a survey is a notice to the people holding a place, which says why it reached them",
    );
    assert.ok(
      hubPassageOf("<strong>What we ask.</strong>").includes(
        "<strong>What we ask.</strong> We may ask you to fill in surveys before, during and after a programme (including short check-ins at the end of a session), after events you had a place at, and in follow-ups you agree to.",
      ),
      "the policy no longer says when surveys are sent, and that follow-ups go to the people who agreed to them",
    );
    // Both go through the notice lane, which reads nobody's settings and has
    // no unsubscribe link (§2c holds the lane to that), and through no other door.
    const sending = withoutComments(read("src/lib/surveys/sending.ts"));
    assert.match(sending, /const result = await sendNotice\(\{/);
    // A follow-up is a notice too, whose line says it reached the person because they said yes to it.
    assert.match(sending, /surface: survey\.audience\.kind === "followUps" \? "course-follow-up" : "course-survey",/);
    const marker = withoutComments(read("src/emails/NoticeMarker.tsx"));
    assert.match(marker, /"course-survey": "you hold a place on this programme",/);
    assert.match(marker, /"course-follow-up": "you said we could send you follow-ups about this programme",/);
    assert.ok(!/\bsendEmail\(|wantsEmailFor|addressesForSend/.test(sending), "a survey or its reminder now goes through a door that reads the notification settings");
    // The reminder: people it was sent to who have not answered, and still
    // hold a place (v14: "a reminder goes only to people who have not
    // answered"; v15 leaves it out, and the code keeps it).
    assert.match(sending, /\.filter\(\(person\) => person\.sentAt !== null && !person\.answered && holding\.has\(person\.respondent\.uid\)\)/);
    assert.match(sending, /const owed = plan\.unanswered;/);
    // A link of their own: 32 random bytes, one row each. CHANGED ON PURPOSE
    // (Q46): the one minting function moved to its own module, which the
    // leave's row asks too, and the send asks it from there.
    assert.match(withoutComments(read("src/lib/surveys/token.ts")), /return randomBytes\(32\)\.toString\("base64url"\);/);
    assert.match(sending, /import \{ mintSurveyToken \} from "\.\/token";/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/\brandomBytes\(/).filter((file) => insideSurveyCode(file)),
      new Map([
        ["src/lib/surveys/token.ts", "the one place a survey link's secret is made"],
        ["src/lib/surveys/sending.ts", "a press's own id, which is no secret of anybody's"],
        ["src/lib/surveys/events/sending.ts", "a press's own id for a survey after an event, which is no secret of anybody's"],
      ]),
      "making random bytes in survey code",
      "A survey link's secret is made by mintSurveyToken in src/lib/surveys/token.ts alone.",
    );
    // Who it is for: everybody holding a place, by the hand-over's own test.
    assert.match(read("src/lib/surveys/audience.ts"), /holders: placeHoldersOn\(form, audience\.programmeId, applications, decisions\)/);
    // tests/notification-classification.test.mjs holds both sends to the
    // notice class; tests/surveys-routes.test.mjs reads every email.
    for (const suite of ["notification-classification.test.mjs", "surveys-routes.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("names come off survey answers two years after the programme's last session, by a job that is on unless an admin turns it off, and the answers stay in the totals", () => {
    // The pairing §2's check on deletion periods cannot make: that check knows
    // "30 days afterwards" and "delete or anonymise", and not "two years after".
    // v14 also said the day is the one the survey tells the person and that
    // what they said about follow-ups goes with the record of the send; v15
    // leaves those out, and the checks on the code below stay. The summary
    // at the top says the same two years.
    const retention = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="retention"'), PAGE_FLAT.indexOf('<section id="your-rights"'));
    assert.ok(retention.length > 500, "could not find the policy's How long we keep it");
    assert.ok(
      retention.includes(
        "<strong>Survey answers:</strong> we take your name off two years after the programme&apos;s last session (or the event), and delete the record that the survey was sent to you with your link. Your answers stay in the totals, no longer linked to you.",
      ),
      "the policy no longer says names come off survey answers two years after the programme, and the answers stay in the totals",
    );
    assertHubSays(" your name comes off survey answers after two years,");
    // Survey answers are not part of the course record that is kept while an
    // account exists (v14 said so in brackets beside it): the course record's
    // line names no survey.
    const courseRecord = hubPassageOf("<strong>Your course record</strong>");
    assert.ok(courseRecord.length > 50 && !/survey/i.test(courseRecord), "the policy now keeps survey answers with the course record, for as long as the account exists");
    const namesOff = withoutComments(read("src/lib/surveys/namesOff.ts"));
    // The day: two years after the run's last session, from each live group's own calendar.
    assert.match(namesOff, /const last = runEndOf\(run, groups, now\)\.lastDateKey;\s*return last \? twoYearsAfter\(last\) : null;/);
    assert.match(namesOff, /export const NAMES_KEPT_YEARS = 2;/);
    assert.match(namesOff, /const year = Number\(match\[1\]\) \+ NAMES_KEPT_YEARS;/);
    assert.equal(surveyNamesOff.twoYearsAfter("2026-12-09"), "2028-12-09", "the day is no longer two years after the last session");
    // On it, every answer's person goes and every row of who it was sent to
    // is deleted; the answers stay.
    const survey = /export async function takeNamesOffSurvey\([\s\S]*?\n\}/.exec(namesOff);
    assert.ok(survey, "could not find how names come off a survey");
    assert.match(survey[0], /await inPages\(named, \(batch, doc\) => batch\.update\(doc\.ref, \{ respondent: null \}\), db\);/);
    assert.match(survey[0], /await inPages\(people\.docs, \(batch, doc\) => batch\.delete\(doc\.ref\), db\);/);
    assert.equal((survey[0].match(/\.delete\(/g) ?? []).length, 1, "names coming off a survey now deletes more than who it was sent to");
    // The job that keeps the promise, `surveys-names-off`: registered, and on
    // unless an admin turns it off, because it emails nobody.
    const job = withoutComments(read("src/lib/scheduler/jobs/surveyNamesOff.ts"));
    assert.match(job, /id: "surveys-names-off",/);
    assert.ok(!/enabledByDefault/.test(job), "the job that takes names off now waits for somebody to switch it on, while the policy says it happens");
    // CHANGED ON PURPOSE (the check-in at the end of a session): the job read
    // every survey through the list of surveys, which now leaves check-ins
    // out, so it reads the surveys due by their day instead: one range on
    // `namesOffOn`, with no other filter, so every kind is found, check-ins
    // included, and only those not taken off yet are kept.
    assert.match(job, /const due = \(await surveysNamesDueBy\(db, today\)\)\.filter\(\(survey\) => namesDueOff\(survey, today\)\);/);
    const dueBy = /export async function surveysNamesDueBy\([\s\S]*?\n\}/.exec(withoutComments(read("src/lib/surveys/repo.ts")))?.[0] ?? "";
    assert.match(dueBy, /db\.collection\(SURVEYS_COLLECTION\)\.where\("namesOffOn", "<=", today\)\.get\(\)/, "the names-off job no longer finds every survey due by its day");
    assert.equal((dueBy.match(/\.where\(/g) ?? []).length, 1, "the names-off job's read now leaves some kind of survey out");
    assert.ok(surveyNamesOff.namesDueOff({ namesOffOn: "2028-12-09", namesOffAt: null }, "2028-12-09"), "a survey is no longer due on its day");
    assert.match(job, /const done = await takeNamesOffSurvey\(db, survey\);/);
    const registry = withoutComments(read("src/lib/scheduler/registry.ts"));
    assert.match(registry, /^\s*"surveys-names-off",$/m);
    assert.match(registry, /^\s*surveyNamesOffJob,$/m);
    assert.match(registry, /return job\.enabledByDefault !== false;/);
    // The box tells each person the same day, and that the totals stay.
    const box = surveyWords.confidentialPoints({ leadName: null, facilitatorNames: null, namesOffOn: "2028-12-09", programmeKind: "fellowship" });
    assert.ok(box.points.includes("Your name comes off on Sat 9 Dec 2028, two years after the fellowship ends. The totals stay."), "the box no longer tells somebody the day their name comes off");
    // tests/surveys-routes.test.mjs runs the job the day before and on the
    // day; tests/surveys-items.test.mjs counts the year, 29 February included.
    for (const suite of ["surveys-routes.test.mjs", "surveys-items.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("a deletion takes the name off a person's survey answers at once and deletes the record of each survey sent to them, and the answers stay", () => {
    // A deletion removes "your survey links and your name on your survey
    // answers", and leaves "survey answers and the count of who came, no
    // longer linked to you".
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" your survey links and your name on your survey answers,"),
      "the policy no longer says a deletion removes the survey links and the name on survey answers",
    );
    assert.ok(
      hubPassageOf("It leaves:").includes(" survey answers and the count of who came, no longer linked to you;"),
      "the policy no longer says a deletion leaves survey answers, no longer linked to the person",
    );
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.match(
      cascade,
      /const off = await takeNamesOffForAccount\(db, uid\);\s*summary\.surveyPeopleDeleted = off\.people;\s*summary\.surveyAnswersNamesTakenOff = off\.answers;/,
      "the account deletion no longer takes the name off survey answers, which the policy lists among what a deletion removes",
    );
    const account = /export async function takeNamesOffForAccount\([\s\S]*?\n\}/.exec(withoutComments(read("src/lib/surveys/namesOff.ts")));
    assert.ok(account, "could not find how a deleted account's name comes off its survey answers");
    assert.match(account[0], /db\.collection\(SURVEY_ANSWERS_COLLECTION\)\.where\("respondent\.uid", "==", uid\)\.get\(\)/);
    assert.match(account[0], /db\.collection\(SURVEY_PEOPLE_COLLECTION\)\.where\("respondent\.uid", "==", uid\)\.get\(\)/);
    assert.match(account[0], /await inPages\(answers\.docs, \(batch, doc\) => batch\.update\(doc\.ref, \{ respondent: null \}\), db\);/);
    assert.match(account[0], /await inPages\(people\.docs, \(batch, doc\) => batch\.delete\(doc\.ref\), db\);/);
    assert.equal((account[0].match(/\.delete\(/g) ?? []).length, 1, "a deletion now removes survey answers, which the policy says stay in the totals");
    // tests/surveys-deletion.test.mjs runs the cascade over survey records.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-deletion.test.mjs")));
  });

  // The anonymous keep, change and drop form (docs/surveys.md, the
  // questionnaire's part (c), 26 October 2026). Its paragraph and its
  // retention line, held to the code that makes them true. v14 gave the
  // form three points and a line among what a deletion leaves; v15 leaves
  // out that the form says it is anonymous at the top, that a day's answers
  // wait and move overnight, that the form closes when the survey at the end
  // does, and that a deletion has nothing of the person's to remove there.
  // The checks on the code below stay, each held to the sentence that covers
  // it: "never records who answers", "keeps only the programme and the day",
  // "from the next day", and "kept until the programme's run is deleted",
  // which an account's deletion does not reach.
  test("the anonymous form keeps three answers, the programme and the day, reads nothing of the person, moves each day's answers overnight, is read from the next day by the lead and admins, and goes with the run", () => {
    assertHubSays(
      "<strong>The anonymous form.</strong> One form never records who answers: the keep, change and drop form at the end of a programme. It never asks who you are, even when you are signed in, and keeps only the programme and the day with your answers. The programme&apos;s lead and admins read them, from the next day, in an order unrelated to when each came in.",
      " Answers to the anonymous form are kept until the programme&apos;s run is deleted.",
    );
    const anonymousModel = withoutComments(read("src/lib/anonymousFeedback/model.ts"));
    // Not a survey: no file of the form reaches survey code, and survey code
    // takes from it only its opening, closing, link and card
    // (tests/anonymous-feedback-no-trace.test.mjs holds the wall both ways).
    for (const file of sourceFilesNaming(/./).filter((path) => path.startsWith("src/lib/anonymousFeedback/") || path.startsWith("src/features/anonymousFeedback/"))) {
      assert.ok(!SURVEY_CODE.test(read(file)), `${file} now reaches survey code`);
    }
    // Linked from the end of the survey at the end, once sent: its first send opens the form, and the card shows only after it is sent.
    assert.match(read("src/lib/surveys/sending.ts"), /if \(survey\.kind === "after" && survey\.closesAt\) \{\s*await openAnonymousForm\(/);
    assert.match(read("src/features/surveys/answer/SurveyForm.tsx"), /<p className=\{styles\.sentLine\}>\{ANSWER_WORDS\.thanks\}<\/p>\s*<AnonymousFormCard \/>/);
    // One link per programme, the same for everybody: the form's secret and nothing else.
    assert.match(withoutComments(read("src/lib/anonymousFeedback/forms.ts")), /return `\/feedback\/\$\{form\.token\}`;/);
    // "It never asks who you are, even when you are signed in": the form
    // reads nothing about who is answering: no session, no cookie,
    // no header but the rate limit's key (the no-trace guard walks every file
    // both doors reach), and the browser sends the answers without its sign-in.
    const route = withoutComments(read("src/app/api/feedback/route.ts"));
    assert.ok(!/getCurrentUser|assertNotImpersonating|cookies\(|next\/headers/.test(route));
    assert.equal((route.match(/clientIp\(/g) ?? []).length, 1);
    assert.match(withoutComments(read("src/features/anonymousFeedback/AnonymousForm.tsx")), /credentials: "omit",/);
    // "Keeps only the programme and the day with your answers": the three
    // answers, the programme and the day, field by field, and nothing else.
    assert.match(anonymousModel, /export const ANSWER_FIELDS = \["roundId", "programmeId", "runId", "keep", "change", "drop", "day"\] as const;/);
    const added = /\.add\(\{([\s\S]*?)\}\);/.exec(withoutComments(read("src/lib/anonymousFeedback/answer.ts")));
    assert.deepEqual([...added[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]), ["roundId", "programmeId", "runId", "keep", "change", "drop", "day"]);
    assert.match(anonymousModel, /export function dayOf\(at: Date\): string \{\s*return londonDateKey\(at\);\s*\}/);
    // It says so at the top, before its questions (v14's words; v15 leaves
    // them out, and the form keeps the box).
    const screen = read("src/features/anonymousFeedback/AnonymousFormScreen.tsx");
    const box = screen.indexOf("<section className={styles.box} aria-label={screen.box.heading}>");
    const questions = screen.indexOf("<AnonymousForm ");
    assert.ok(box !== -1 && questions !== -1 && box < questions, "the anonymous box is no longer drawn above the form's questions");
    // The day and not the time: answers wait, and once their day is over the
    // night's move writes them, by name, into the record kept, and deletes
    // what waited. The job emails nobody, so it registers on. (v14 named the
    // move; v15 says the record keeps only the day.)
    const move = withoutComments(read("src/lib/anonymousFeedback/move.ts"));
    assert.match(anonymousModel, /export function dueToMove\(answer: Pick<AnonymousAnswer, "day">, today: string\): boolean \{\s*return answer\.day < today;\s*\}/);
    assert.match(move, /tx\.create\(db\.collection\(ANONYMOUS_ANSWERS_COLLECTION\)\.doc\(\), \{/);
    assert.match(move, /tx\.delete\(snap\.ref\);/);
    const job = withoutComments(read("src/lib/scheduler/jobs/anonymousFeedbackMove.ts"));
    assert.match(job, /id: "anonymous-feedback-move",/);
    assert.ok(!/enabledByDefault/.test(job), "the move now waits for somebody to switch it on, and the policy says the form keeps only the day");
    assert.match(withoutComments(read("src/lib/scheduler/registry.ts")), /^\s*anonymousFeedbackMoveJob,$/m);
    // "The programme's lead and admins read them, from the next day, in an
    // order unrelated to when each came in": the lead and admins, decided
    // before any answer is read; from the day after; each question's in
    // alphabetical order.
    const page = withoutComments(read("src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback/page.tsx"));
    assert.ok(page.indexOf("loadProgrammeRun(db, user, roundId, programmeId)") < page.indexOf("readAnonymousAnswers("), "the answers are read before the page decides who is reading");
    assert.match(read("src/lib/applications/access.ts"), /export function opensProgrammeGroups\(role: ProgrammeRole \| null\): boolean \{\s*return role === "admin" \|\| role === "lead";\s*\}/);
    assert.match(withoutComments(read("src/lib/anonymousFeedback/readers.ts")), /answer\.day < today/);
    assert.deepEqual(
      anonymousRecords.answersInOrder([{ keep: "Zebra" }, { keep: "apple" }, { keep: "" }, { keep: "Mango" }], "keep"),
      ["apple", "Mango", "Zebra"],
      "the readers' order now follows something other than the words",
    );
    // Until the survey at the end closes (v14's words; v15 leaves them out):
    // its closing time and its Close.
    assert.match(read("src/app/api/surveys/[surveyId]/close/route.ts"), /await closeAnonymousForm\(db, surveyId\);/);
    // "Kept until the programme's run is deleted": kept with the run's
    // records and deleted with it; an account's deletion has nothing to find.
    const engine = withoutComments(read("src/lib/firestore/courseDeletion.ts"));
    assert.match(engine, /key: "anonymousFeedback",/);
    assert.match(engine, /\[ANONYMOUS_FORMS_COLLECTION, ANONYMOUS_WAITING_COLLECTION, ANONYMOUS_ANSWERS_COLLECTION\]\.map\(\s*\(collection\) => \(\) => drainQuery\(db, collection, byRunId\(collection\), budget\),/);
    assert.ok(
      !/anonymousFeedback|ANONYMOUS_/.test(withoutComments(read("src/lib/firestore/accountDeletion.ts"))),
      "an account's deletion now reaches the anonymous answers, which the policy says are kept until the programme's run is deleted",
    );
    // tests/anonymous-feedback.test.mjs drives all of it as every caller.
    for (const suite of ["anonymous-feedback.test.mjs", "anonymous-feedback-no-trace.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  // The programme impact questionnaire (26 October 2026): what the surveys
  // ask, what they offer from a profile, the survey at the end showing a
  // person their own answer, and the follow-ups. Each sentence is held to the
  // templates and the code that keeps it, both ways.
  test("what a programme's surveys ask is said by kind, and every question of every template is one of those kinds", () => {
    // v15 says what surveys ask in three kinds: "you and your plans, what you
    // learned, and how the programme or event went; the questions vary". v14
    // named nineteen narrower kinds (the second keys below, kept to say what
    // each group of questions is), each held to its questions; v15 does not
    // name them, so the sentence is held to the three, and every question of
    // every programme template is still one of the kinds it names, both ways.
    const kinds = hubPassageOf("<strong>What we ask.</strong>");
    const SENTENCE = " They ask about you and your plans, what you learned, and how the programme or event went; the questions vary.";
    assert.ok(kinds.includes(SENTENCE), "the policy no longer says what surveys ask");
    // Each kind the sentence names, and the questions it covers, by the
    // narrower kind v14 gave them.
    const KINDS = new Map([
      [
        "you and your plans",
        new Map([
          ["your level and subject of study", ["q_p3_level", "q_p3_subject"]],
          ["what you had done in AI safety before", ["q_p4"]],
          ["how you first heard about NAISI", ["q_p5"]],
          ["your career stage and plans", ["q_c1", "q_t1"]],
          ["how likely you think you are to work on AI safety", ["q_c2"]],
          ["the kinds of work that interest you", ["q_c3"]],
          ["how many people in it you could contact", ["q_c6", "q_i3"]],
          ["how sure you are of your next step and of what you could contribute", ["q_c7"]],
          ["what you want from the programme", ["q_p6", "q_q3"]],
          ["what stands in your way", ["q_c8"]],
          ["the steps you have taken", ["q_c9", "q_f4_applied", "q_f4_accepted"]],
          ["what else shaped your plans", ["q_a4"]],
          ["what you are doing now", ["q_f1", "q_f1_where", "q_f2", "q_f3"]],
          ["what you plan next", ["q_n1", "q_n2", "q_n3", "q_i7"]],
          ["your research skills", ["q_i1", "q_i2", "q_i2_back"]],
        ]),
      ],
      ["what you learned", new Map([["what you understand and know of the field", ["q_c4", "q_c5", "q_t2", "q_t3"]]])],
      [
        "how the programme or event went",
        new Map([
          ["how the programme went", ["q_q1", "q_q2"]],
          ["what it changed", ["q_a1", "q_a2", "q_a3", "q_a5", "q_f7"]],
          ["what your team produced", ["q_i4", "q_i4_links", "q_i4_when", "q_i5", "q_i6"]],
        ]),
      ],
    ]);
    const asked = new Set();
    for (const [stage, kind, strand] of [["before", "fellowship", null], ["after", "fellowship", null], ["followUp6", "fellowship", null], ["followUp12", "fellowship", null], ["before", "incubator", "alignment"], ["after", "incubator", "governance"]]) {
      for (const question of surveyItems.surveyQuestionsOf(surveyTemplates.templateItems(stage, kind, strand))) asked.add(question.id);
    }
    const named = new Set();
    for (const [words, narrower] of KINDS) {
      assert.ok(SENTENCE.includes(` ${words}`), `the sentence no longer names "${words}"`);
      for (const [what, ids] of narrower) {
        for (const id of ids) {
          assert.ok(asked.has(id), `"${what}" (${words}) covers ${id}, which no template asks any more`);
          named.add(id);
        }
      }
    }
    assert.deepEqual([...asked].filter((id) => !named.has(id)), [], "a template asks a question of a kind the policy does not name");
    // Every survey is made from a template, and a fellowship asks none of an incubator's questions.
    const create = withoutComments(read("src/lib/surveys/create.ts"));
    assert.match(create, /const items = templateItems\(input\.stage, programme\.kind, strand\);/);
    assert.ok(![...surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("after", "fellowship", null))].some((question) => question.id.startsWith("q_i")));
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-items.test.mjs")), "tests/surveys-items.test.mjs holds every template word for word");
  });

  test("a survey offers only the level and subject of study from a profile, as a starting answer the person can change, and keeps only what is sent", () => {
    // "None of your answers until you send them": only what is sent is kept.
    // v14 also said that the survey before a programme starts its questions
    // about level and subject of study on the profile's answers, which the
    // person can change or clear; v15 leaves that out, and the checks on the
    // code below stay, so that a survey still offers nothing else from a
    // profile.
    assert.ok(
      hubPassageOf("<strong>What a survey records.</strong>").includes(" Nothing about how you filled it in, and none of your answers until you send them."),
      "the policy no longer says none of a survey's answers is kept until it is sent",
    );
    // Only the two values are read from the account, and nothing else of it.
    const offer = withoutComments(read("src/lib/surveys/profileOffer.ts"));
    // The degree through `degreeOf`, the site's one reading of it (an older account's `course` included).
    assert.match(offer, /return \{\s*status: typeof profile\.status === "string" \? profile\.status : "",\s*subject: degreeOf\(profile\),\s*\};/);
    assert.deepEqual(Object.keys(surveyProfileOffer.profileFactsOf({ email: "a@example.com", displayName: "A", profile: { status: "phd", subject: "Law", motivation: "x", expectedGraduation: "2028-07" } })), ["status", "subject"]);
    // Only the two questions that say so are offered, and only on the before survey.
    const offered = (items) => surveyItems.surveyQuestionsOf(items).filter((question) => question.profile).map((question) => [question.id, question.profile]);
    assert.deepEqual(offered(surveyTemplates.templateItems("before", "fellowship", null)), [["q_p3_level", "level"], ["q_p3_subject", "subject"]]);
    for (const stage of ["after", "followUp6", "followUp12"]) assert.deepEqual(offered(surveyTemplates.templateItems(stage, "fellowship", null)), [], `the ${stage} survey offers something from a profile`);
    // "Where your profile holds them": an undergraduate's year and a subject that matches no answer are not offered.
    const levels = ["o_ug1", "o_ug2", "o_ug3", "o_ug4", "o_masters", "o_phd", "o_staff", "o_other"];
    assert.equal(surveyProfileOffer.offerFromProfile("level", { status: "undergraduate", subject: "" }, levels), null);
    assert.equal(surveyProfileOffer.offerFromProfile("level", { status: "masters", subject: "" }, levels), "o_masters");
    // Read for the person whose page it is, and drawn as the menu's starting answer, which the person can change.
    const view = withoutComments(read("src/lib/surveys/answerView.ts"));
    assert.match(view, /const snap = await db\.collection\("users"\)\.doc\(uid\)\.get\(\);/);
    assert.match(view, /profileOffersFor\(db, survey, input\.uid\)/);
    const form = withoutComments(read("src/features/surveys/answer/SurveyForm.tsx"));
    assert.match(form, /<Select name=\{question\.id\} defaultValue=\{question\.offered\}/);
    assert.match(form, /<option value="">\{ANSWER_WORDS\.chooseOne\}<\/option>/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-routes.test.mjs")), "tests/surveys-routes.test.mjs draws the offer for a person whose profile holds it, and none for one whose does not");
  });

  test("the survey at the end shows a person their own answer from the start, read for them alone, and a test shows nobody's", () => {
    // v14 said the survey at the end shows a person what they said they
    // wanted from the programme, and nobody else is shown it there; v15
    // leaves that out. "Only NAISI's admins can see who said what" still
    // holds: the earlier answer is read for its own person alone.
    const q3 = surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("after", "fellowship", null)).find((question) => question.pipe);
    assert.deepEqual([q3.id, q3.pipe], ["q_q3", { from: "q_p6", words: "At the start you said:" }]);
    assert.equal(surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("before", "fellowship", null)).find((question) => question.id === "q_p6").title, "What do you most want to get out of this programme?");
    const view = withoutComments(read("src/lib/surveys/answerView.ts"));
    assert.match(view, /const answers = \(await ownAnswerOf\(db, source, uid\)\)\?\.answers;/);
    assert.match(view, /if \(test\) return Object\.fromEntries\(piping\.map\(\(question\) => \[question\.id, pipeTestWords\(question\.pipe!\.words\)\]\)\);/);
    const repo = withoutComments(read("src/lib/surveys/repo.ts"));
    const own = /export async function ownAnswerOf\([\s\S]*?\n\}/.exec(repo);
    assert.ok(own, "could not find how a person's own earlier answer is read");
    assert.match(own[0], /\.where\("respondent\.uid", "==", uid\)\.get\(\)/);
    assert.match(own[0], /if \(answer\.surveyId === survey\.id && answer\.respondent\?\.uid === uid\) return answer;/);
    // The results and the admins' pages carry no piped words.
    assert.ok(!/pipedAnswersFor|ownAnswerOf/.test(withoutComments(read("src/lib/surveys/adminView.ts"))), "an admins' page now reads a person's earlier answer as that person");
  });

  test("the follow-ups go only to people who tick an unticked box, which each person can change later, kept with when on their own row", () => {
    // "Follow-ups at 6 and 12 months go only to people who tick the box
    // saying we may send them, which starts unticked; you can change your
    // answer later." v14 also said where the box is asked (before the
    // programme, and at the end of somebody who did not answer it there) and
    // that what somebody said is kept, with when, with the record of the
    // send; v15 leaves those out, and the checks on the code below stay.
    assert.ok(
      hubPassageOf("<strong>What we ask.</strong>").includes(
        " Follow-ups at 6 and 12 months go only to people who tick the box saying we may send them, which starts unticked; you can change your answer later.",
      ),
      "the policy no longer says the follow-ups go only to people who tick an unticked box they can change later",
    );
    // The box: one purpose, unticked until ticked.
    const consent = surveyTemplates.templateItems("before", "fellowship", null).find((item) => item.kind === "consent");
    assert.deepEqual(consent.boxes, [{ purpose: "followUps", label: "Contact me at 6 and 12 months with a short follow-up survey" }]);
    const form = withoutComments(read("src/features/surveys/answer/SurveyForm.tsx"));
    assert.match(form, /<OptionRow key=\{box\.purpose\} type="checkbox" name=\{consentField\(box\.purpose\)\} value="yes">/);
    assert.ok(!/consentField\([^)]*\)[^>]*(?:defaultChecked|checked)/.test(form), "the follow-ups box is ticked before the person ticks it");
    // Kept on the person's own row with when, never in the answers.
    const answer = withoutComments(read("src/lib/surveys/answer.ts"));
    assert.match(answer, /consented \? \{ answered: true, consents: said\.consents, consentsAt: FieldValue\.serverTimestamp\(\) \} : \{ answered: true \}/);
    assert.deepEqual(surveyItems.readSurveyConsents(consent ? [consent] : [], undefined), { consents: { followUps: false }, problem: null }, "a box left unticked is no longer a no");
    // Only people who said yes are sent the follow-ups, as their row says at each press.
    // A yes on the before survey's row, or, for somebody whose row there says
    // nothing, a yes on their row on the survey at the end, which asked them
    // the same box: as their rows say at each press.
    const audienceCode = withoutComments(read("src/lib/surveys/audience.ts"));
    assert.match(audienceCode, /const rows = await peopleOf\(db, consentFrom\);\s*const said = rows\.filter\(\(person\) => person\.consents\.followUps === true\);/);
    assert.match(audienceCode, /const spoke = new Set\(rows\.filter\(\(person\) => person\.consents\.followUps !== undefined\)\.map\(\(person\) => person\.respondent\.uid\)\);/);
    assert.match(audienceCode, /\(await peopleOf\(db, atEnd\.id\)\)\.filter\(\(person\) => person\.consents\.followUps === true && !spoke\.has\(person\.respondent\.uid\)\)/);
    const create = withoutComments(read("src/lib/surveys/create.ts"));
    assert.match(create, /\? \{ kind: "followUps", roundId: input\.roundId, programmeId: input\.programmeId, consentFrom: before\.id \}/);
    // Changed later by the person alone, on their own row, by their link or signed in.
    const change = withoutComments(read("src/lib/surveys/consent.ts"));
    assert.match(change, /const ref = db\.collection\(SURVEY_PEOPLE_COLLECTION\)\.doc\(surveyPersonId\(holder, person\.respondent\)\);/);
    assert.match(change, /tx\.update\(ref, \{ \[`consents\.\$\{purpose\}`\]: given, consentsAt: FieldValue\.serverTimestamp\(\) \}\);/);
    assert.match(read("src/app/api/surveys/consent/route.ts"), /const target = await openLink\(db, body\.token\);/);
    assert.match(read("src/app/api/surveys/[surveyId]/consent/route.ts"), /await readPerson\(db, survey\.id, \{ kind: "account", uid: actor\.uid \}\)/);
    for (const route of ["src/app/api/surveys/consent/route.ts", "src/app/api/surveys/[surveyId]/consent/route.ts"]) {
      assert.match(read(route), /const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/, `${route} lets an admin viewing as somebody change what they said`);
    }
    // The same box at the end (v14: "If you did not answer it there, the
    // survey at the end asks you the same"), asked only of somebody whose
    // before survey has not had their word, kept on their row there, and read
    // by the follow-ups' audience after the before survey's.
    const endBox = surveyTemplates.templateItems("after", "fellowship", null).find((item) => item.kind === "consent");
    assert.deepEqual(endBox.boxes, consent.boxes, "the box at the end is not the before survey's box");
    const asking = withoutComments(read("src/lib/surveys/consent.ts"));
    assert.match(asking, /return saysFollowUps\(beforeRow\) \? purposes\.filter\(\(purpose\) => purpose !== "followUps"\) : purposes;/, "the survey at the end now asks somebody whose before survey has their word");
    assert.match(answer, /if \(!asked\.includes\(purpose\)\) delete said\.consents\[purpose\];/, "a box somebody was not shown now says something for them");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-follow-ups-at-end.test.mjs")), "tests/surveys-follow-ups-at-end.test.mjs asks the box at the end, keeps it and sends the follow-ups by it");
    // What somebody said goes when their name comes off (v14: "until your
    // name comes off"; v15: the record that the survey was sent is deleted
    // then): names off deletes the rows that hold it.
    assert.match(withoutComments(read("src/lib/surveys/namesOff.ts")), /await inPages\(people\.docs, \(batch, doc\) => batch\.delete\(doc\.ref\), db\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-routes.test.mjs")), "tests/surveys-routes.test.mjs sends the follow-ups only to people who said yes and changes it by both doors");
  });

  test("Kairos is sent everybody's name and programme record unless they say no, on every programme survey and the profile, and saying no changes nothing else", () => {
    // Sharing with Kairos, sentence by sentence as the code below holds it.
    // v14 also said that saying no leaves admins seeing the survey answers;
    // v15 says "Saying no changes nothing else", and the checks below hold
    // both.
    const kairos = hubPassageOf("<strong>Sharing with Kairos.</strong>");
    for (const sentence of [
      " Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end:",
      ' Every programme survey ends with a box to say no, and the same choice is on{" "} <a href="/profile">your profile</a>; you can change it at any time, and the next file goes by it.',
      " Saying no changes nothing else: your survey answers still count in our totals.",
    ]) {
      assert.ok(kairos.includes(sentence), `the policy's Sharing with Kairos no longer says: ${sentence}`);
    }
    // "Unless you say no": no record, or one that is not whole, reads as shared.
    assert.equal(kairosModel.sharesWithKairos(null), true);
    assert.equal(kairosModel.sharesWithKairos(kairosModel.normalizeKairosChoice("amara", { uid: "amara", shared: false })), false);
    assert.match(withoutComments(read("src/lib/kairos/model.ts")), /return choice\?\.shared !== false;/);
    // "Every programme survey ends with a box to say no": every programme
    // survey, whatever its items, ends its last page with the choice, in
    // words that say sharing helps.
    assert.match(withoutComments(read("src/lib/firestore/surveys.ts")), /return survey\.audience\.kind === "programme" \|\| survey\.audience\.kind === "followUps";/);
    const form = withoutComments(read("src/features/surveys/answer/SurveyForm.tsx"));
    assert.match(form, /\{index === last && kairos && <KairosChoice kairos=\{kairos\} \/>\}/);
    assert.match(form, /defaultChecked=\{kairos\.said === "no"\}/, "the box no longer starts where the person's record stands");
    assert.equal(kairosWords.KAIROS_FORM_WORDS.why, "Sharing helps us make our case to our funders and sponsors, so leaving it on helps NAISI.");
    assert.equal(kairosWords.KAIROS_FORM_WORDS.box, "Don’t share my details with Kairos");
    // "And the same choice is on your profile": the page draws it for the
    // person signed in, and its route changes their own record alone.
    assert.match(withoutComments(read("src/app/(app)/profile/page.tsx")), /<KairosSetting shared=\{shared\} \/>/);
    const route = withoutComments(read("src/app/api/account/kairos/route.ts"));
    assert.match(route, /await writeKairosChoice\(db, \{ uid: actor\.uid, shared, via: "settings" \}\);/);
    assert.match(route, /const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/);
    // "You can change it at any time, and the next file goes by it": the
    // file reads every choice when it is made.
    assert.match(withoutComments(read("src/lib/kairos/file.ts")), /kairosChoicesOf\(db, uids\),/);
    // "Saying no changes nothing else: your survey answers still count in our
    // totals" (and, v14 added, admins still see them): nothing that shows or
    // counts answers reads the choice.
    for (const file of ["src/lib/surveys/results.ts", "src/lib/surveys/adminView.ts", "src/lib/surveys/exportTable.ts", "src/lib/surveys/kairosReport.ts"]) {
      assert.ok(!/kairosChoicesOf|sharesWithKairos/.test(withoutComments(read(file))), `${file} now leaves out somebody who said no to Kairos`);
    }
    // The choice is kept while the account exists: the account's deletion
    // takes it, and no job does. The claim is made under How long we keep it
    // ("while your account exists, so a later programme goes by it too": one
    // record for the person, read by every programme's file), in what a
    // deletion removes, and under Your rights, where the profile is one of
    // the two places to say no (held to the profile page above). Privacy pass
    // 2 held those three here.
    assertHubSays(
      "<strong>Your choice about Kairos:</strong> while your account exists, so a later programme goes by it too.",
      ' Most of this you can do yourself: edit your profile and notification choices, and say no to sharing with Kairos, on{" "} <a href="/profile">your profile page</a>,',
    );
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" your membership records, your choice about Kairos and a certificate whose link is off."),
      "the policy no longer says a deletion removes the choice about Kairos",
    );
    assert.match(withoutComments(read("src/lib/firestore/accountDeletion.ts")), /summary\.kairosChoiceDeleted = await deleteKairosChoice\(db, uid\);/);
    assert.deepEqual(sourceFilesNaming(/\bdeleteKairosChoice\(/).filter((file) => file !== "src/lib/kairos/choice.ts"), ["src/lib/firestore/accountDeletion.ts"]);
    assert.match(withoutComments(read("src/lib/kairos/choice.ts")), /\.collection\(KAIROS_CHOICES_COLLECTION\)\.doc\(uid\)/, "the Kairos choice is no longer one record for the person, which every programme's file reads");
    // "These never name anybody": the report, run with people in it, carries
    // no uid out.
    const funders = hubPassageOf("<strong>Funders and sponsors.</strong>");
    for (const sentence of [
      " These never name anybody.",
      " For an incubator we may also pass on the links its people give us, in the survey at its end, to the work their team produced; that question says so.",
    ]) {
      assert.ok(funders.includes(sentence), `the policy's Funders and sponsors no longer says: ${sentence}`);
    }
    const report = kairosReport.buildKairosReport({
      programmeName: "AGI Strategy",
      kind: "fellowship",
      applications: 2,
      started: 2,
      atEnd: 2,
      finished: 1,
      finishRule: 4,
      lastDay: "Wed 9 Dec",
      surveys: [],
      rated: [{ uid: "uid-amara-okafor", ratings: [{ f5: "strongYes" }] }],
      sharing: new Set(["uid-amara-okafor"]),
    });
    assert.ok(!JSON.stringify(report).includes("uid-amara-okafor"), "the report carries a person out");
    // "For an incubator we may also pass on the links its people give us, in
    // the survey at its end, to the work their team produced; that question
    // says so": the report lists that one question's lines and nothing else
    // written (other written answers are only counted), and the question
    // tells whoever answers it.
    const reportCode = withoutComments(read("src/lib/surveys/kairosReport.ts"));
    assert.deepEqual(
      [...reportCode.matchAll(/links\.push\(([^;]*)\)/g)].map((m) => m[1]),
      ['...linesOf(answer, "q_i4_links")'],
      "the report now lists other written answers",
    );
    assert.match(
      withoutComments(read("src/lib/surveys/templates.ts")),
      /text\("q_i4_links", "Links to what your team produced", true, \{ hint: "One on each line\. We may pass these on to our funders\." \}\)/,
      "the links question no longer says the links may go to funders",
    );
    // tests/kairos-choice.test.mjs drives the form, the profile and both routes as every caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "kairos-choice.test.mjs")));
  });

  test("ratings at a programme's end: who rates whom, who reads them, never the person rated, and gone two years on and with an account", () => {
    // The policy's paragraph, sentence by sentence as the code below holds
    // it. v14 also said that two facilitators of one group never rate each
    // other and that the lead or an admin can rate anybody on the programme,
    // that the sessions beside a rating are never typed in, that the person
    // who gave a rating sees only their own, and that a rating reaches the
    // person rated on no page and in no email; v15 says those in fewer words
    // ("a facilitator who takes part in a group is rated by the programme's
    // lead or an admin", "from the register", "never by the person rated"),
    // and the checks below stay.
    const ratings = hubPassageOf("<strong>Ratings at the end of a programme.</strong>");
    for (const sentence of [
      "<strong>Ratings at the end of a programme.</strong> When a programme ends, each group&apos;s facilitators rate the people taking part in it:",
      " Beside each rating we show how many sessions the person came to, from the register. Nobody rates themselves, and a facilitator who takes part in a group is rated by the programme&apos;s lead or an admin. These ratings are read by the programme&apos;s lead, admins and the person who gave each one, and never by the person rated.",
    ]) {
      assert.ok(ratings.includes(sentence), `the policy's Ratings at the end of a programme no longer says: ${sentence}`);
    }
    // "Each group's facilitators rate the people taking part in it", "Nobody
    // rates themselves, and a facilitator who takes part in a group is rated
    // by the programme's lead or an admin": who may rate whom, run.
    const group = { facilitatorUids: ["rahul", "sofia"], standingFacilitatorUids: ["rahul", "sofia"] };
    const as = (uid, roles = {}) => ({ uid, isAdmin: false, leads: false, ...roles });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "amara"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "rahul"), { ok: false, reason: "self" });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "sofia"), { ok: false, reason: "co-facilitator" });
    assert.deepEqual(ratingRules.mayRate(as("rahul", { isAdmin: true }), group, "sofia"), { ok: false, reason: "co-facilitator" }, "an admin who co-facilitates now rates a co-facilitator");
    assert.deepEqual(ratingRules.mayRate(as("claudia", { leads: true }), group, "sofia"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("zach", { isAdmin: true }), group, "amara"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("amara"), group, "bea"), { ok: false, reason: "not-yours" });
    // "Beside each rating we show how many sessions the person came to, from
    // the register": a rating cannot carry it, so it is never typed in.
    assert.deepEqual(ratingModel.parseRatingAnswers({ f1: 6 }, "fellowship"), { ok: false, problem: ratingModel.RATING_PROBLEMS.notAsked });
    // "These ratings are read by the programme's lead, admins and the person
    // who gave each one, and never by the person rated": a facilitator reads
    // the ratings they gave and nobody else's, no page shows somebody a rating
    // of themselves, and no email reaches the ratings.
    assert.equal(ratingRules.readsEveryRating(as("rahul")), false);
    const view = withoutComments(read("src/lib/ratings/view.ts"));
    assert.match(view, /if \(fellow\.uid === actor\.uid\) continue;/, "a page now shows somebody a rating of themselves");
    assert.match(view, /const others = reader\s*\? ratings/, "a facilitator now reads other people's ratings");
    const reachesRatings = /(?:\bfrom\s*|\bimport\s*\(\s*)"(?:@\/(?:lib|features)\/ratings|(?:\.{1,2}\/)+(?:[\w-]+\/)*ratings)[/"]/;
    assert.deepEqual(sourceFilesNaming(reachesRatings).filter((file) => file.startsWith("src/emails/")), [], "an email now reaches the ratings");
    // How long they are kept: "two years after its last session", and a
    // deletion removes "the notes and ratings about you, the ratings you gave".
    const job = withoutComments(read("src/lib/scheduler/jobs/surveyNamesOff.ts"));
    assert.match(job, /const off = twoYearsAfter\(sheet\.lastSessionOn\);\s*return off !== null && off <= today;/);
    assert.match(job, /const ratings = await deleteRunRatings\(db, sheet\.runId\);/);
    // The same job, and the same two years after the same last session that
    // a survey's own day is worked out from (privacy pass 2; v14 said "the
    // day names come off its surveys", which v15 leaves out).
    assertHubSays("<strong>Ratings at the end of a programme:</strong> two years after its last session.");
    assert.match(withoutComments(read("src/lib/surveys/namesOff.ts")), /const last = runEndOf\(run, groups, now\)\.lastDateKey;\s*return last \? twoYearsAfter\(last\) : null;/);
    assert.ok(job.indexOf("await takeNamesOffSurvey(db, survey)") < job.indexOf("await deleteRunRatings(db, sheet.runId)"), "the ratings no longer go in the names-off job's own pass");
    // What a deletion removes names them, held to the cascade's step below
    // (privacy pass 2).
    assert.ok(
      hubPassageOf("<strong>Deleting your account.</strong>").includes(" the notes and ratings about you, the ratings you gave,"),
      "the policy no longer says a deletion removes the ratings somebody was given and gave",
    );
    // A copy of a person's data covers the ratings they were given: each one
    // is found by the person it is about (the store's own reading, below).
    assertHubSays(" notes facilitators and admins wrote, session reports, ratings, and the reason for a conduct flag.");
    assert.match(withoutComments(read("src/lib/firestore/accountDeletion.ts")), /summary\.programmeRatingsDeleted = await deleteRatingsForAccount\(db, uid\);/);
    const store = withoutComments(read("src/lib/ratings/store.ts"));
    assert.match(store, /\.where\("raterUid", "==", uid\)\.get\(\),\s*db\.collection\(RATINGS_COLLECTION\)\.where\("ratedUid", "==", uid\)\.get\(\),/);
    // tests/course-ratings.test.mjs drives the route and both pages as every
    // caller, and walks the tree for every file that reaches the ratings.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-ratings.test.mjs")));
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: When you come to an event
// ---------------------------------------------------------------------------

/**
 * What the policy says about check-in, held to the code that makes it true
 * (`src/lib/events/checkIns.ts`), the way the course hub passage is held
 * above: v15's "Coming to an event" and "Attendance" paragraphs, its line
 * under How long we keep it and what a deletion leaves, each paired with a
 * rule that is run or a line of source that is matched. Check-in was first
 * described by v7. The suites that run check-in as every kind of caller are
 * `tests/event-*.test.mjs`.
 *
 * "At an event that lets you" is the event's own switch (`selfCheckIn`, only
 * a stored true is on, off for a new event and for every event made before
 * it), and only once its author or an admin has opened the door. "How" is
 * each way in recorded as itself: the door list or the event's page by a
 * committee member, or yourself by your email's link, the code at the door,
 * or the check-in page that code opens. The link is in the email that
 * confirms a place only at an event that lets you.
 */
/** v15's paragraph about coming to an event, whole. */
const COMING_TO_AN_EVENT =
  "<strong>Coming to an event.</strong> If you come, we may record that you came, how and when: a committee member checks you in on the door list, or, at an event that lets you, you check yourself in from the link in your confirmation email or with the code at the door. Anyone holding your email&apos;s link could check in in your name, so keep it to yourself. Only admins and the committee members the Students&apos; Union recognises can see who came; the event&apos;s other organisers see how many came, never who. If you come without signing up, we take your name at the door, and an email address only if you want the event&apos;s survey; we use it for nothing else, and delete it when that survey closes or a week after the event, whichever is sooner.";
/** v15's line under How long we keep it. */
const WHO_CAME_KEPT =
  "<strong>Who came to an event:</strong> names for a year after the event, then only the count. A walk-in&apos;s email address until that event&apos;s survey closes, or a week after the event if sooner.";
const checkInAccess = await loadTs("lib/events/checkInAccess.ts");
const checkInRules = await loadTs("lib/events/checkIns.ts");
const checkInCounts = await loadTs("lib/events/checkInView.ts");
const checkInRecords = await loadTs("lib/firestore/eventCheckIns.ts");
const selfCheckInRules = await loadTs("lib/events/selfCheckIn.ts");
const eventRecords = await loadTs("lib/firestore/events.ts");
/** Every file that reads or builds a list of who came, by name. */
const NAMED_CHECK_IN_READERS = /\bloadEventAtTheDoor\(|\bdoorRows\(/;

describe("the check-in passage", () => {
  const VR = { startAt: new Date("2026-11-01T14:00:00Z"), endAt: new Date("2026-11-01T17:00:00Z") };

  test("the frozen v6 carries none of these sentences", () => {
    for (const pattern of [
      /When you come to an event/,
      /Who came to an event\./,
      /checks you in at the door/,
      /Not coming is recorded nowhere/,
      /The record that you came to an event/,
    ]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("who sees who came: admins and SU-recognised committee, as for sign-ups; the other organisers see numbers", () => {
    assert.ok(PAGE_FLAT.includes(COMING_TO_AN_EVENT), "the policy no longer says, whole, what coming to an event records and who sees it");
    // The same people as see who signed up, which the policy says beside it.
    assert.ok(PAGE_FLAT.includes("<strong>Who sees sign-ups.</strong> Admins and the committee members the Students&apos; Union recognises see who signed up."));
    // The bar, run.
    const { runsCheckIn } = checkInAccess;
    assert.equal(runsCheckIn({ role: "admin", suRecognised: false }), true);
    assert.equal(runsCheckIn({ role: "committee", suRecognised: true }), true);
    assert.equal(runsCheckIn({ role: "committee", suRecognised: false }), false);
    assert.equal(runsCheckIn({ role: "member", suRecognised: true }), false);
    assert.equal(runsCheckIn({ role: "pending", suRecognised: true }), false);
    assert.equal(runsCheckIn(null), false);
    // The same bar as who signed up.
    const attendees = withoutComments(read("src/app/(app)/events/manage/[id]/attendees/page.tsx"));
    assert.match(attendees, /viewer\.role === "admin" \|\|\s*\(viewer\.role === "committee" && viewer\.suRecognised\)/);
    // Every file that lists who came by name asks the bar, and the one page
    // that also shows numbers to everybody draws names only behind it.
    const readers = sourceFilesNaming(NAMED_CHECK_IN_READERS).filter(
      (file) => file !== "src/lib/events/checkInLoad.ts" && file !== "src/lib/events/checkInView.ts",
    );
    // CHANGED ON PURPOSE (Q51 B): This term in numbers counts the people the
    // Check-in tab's rows hold, across a term's events, for admins alone; its
    // loader asks the check-in bar beside the surveys' own, and hands on
    // counts only (the "this term in numbers" block below).
    // CHANGED ON PURPOSE (the picker, "Who is this for?"): the tags of each
    // of the term's events, "Came to" among them, are read for somebody who
    // runs check-in, by the Check-in tab's own records; See who hands on
    // names behind the same bar and never an address (src/lib/audience/).
    assert.deepEqual(readers, [
      "src/app/(app)/events/manage/[id]/check-in/page.tsx",
      "src/app/(app)/events/manage/[id]/door/page.tsx",
      "src/app/api/events/[id]/check-ins/route.ts",
      "src/lib/audience/load.ts",
      "src/lib/surveys/term/load.ts",
    ]);
    for (const file of readers) assert.match(read(file), /runsCheckIn\((?:viewer|user)\)/, file);
    const tab = withoutComments(read("src/app/(app)/events/manage/[id]/check-in/page.tsx"));
    assert.match(tab, /const staff = runsCheckIn\(viewer\);/);
    assert.match(tab, /\{staff && takes && \(\s*<div className=\{styles\.columns\}>/);
  });

  // TAKEN BACK BY v15: v14 said not coming is recorded nowhere and never held
  // against anybody. v15 says admins can see which events somebody signed up
  // for and whether they came, and that missing two in a row may count when
  // places are decided. What a check-in itself records is unchanged: that
  // somebody came, how and when, and no row for not coming.
  test("a check-in records that somebody came, how and when, and nothing about not coming", () => {
    assert.ok(PAGE_FLAT.includes("If you come, we may record that you came, how and when:"));
    assert.ok(
      PAGE_FLAT.includes(
        "<strong>Attendance.</strong> Admins can see which events you signed up for and whether you came. Missing two events in a row that you had a place at may be taken into account when places are decided. Telling us beforehand that you can&apos;t make it, or giving your place back before the day, never counts, and the count starts again each academic year.",
      ),
    );
    assert.ok(!/Not coming is recorded nowhere/.test(PAGE_FLAT), "the policy still says not coming is recorded nowhere, which v15 took back");
    assert.ok(V14_FLAT.includes("Not coming is recorded nowhere. It is never held against you, and it never stops you signing up again."), "v14 is frozen and should still carry the promise its readers accepted");
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    const data = /const data = \{([\s\S]*?)\n {4}\};/.exec(rules);
    assert.ok(data, "could not find the record a check-in writes");
    // Written out and written short (`email,`), both read.
    const fields = [...data[1].matchAll(/^\s{6}(\w+)(?::|,)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(fields, ["at", "byUid", "email", "emailGoesAt", "eventId", "how", "kind", "name", "namesOff", "namesOffAt", "rsvpId", "uid"]);
    assert.match(rules, /kind: walkIn \? "walk-in" : "signup",/);
  });

  // Since the surveys after events (Q44), the email goes when the event's
  // survey closes, or a week after the event if that comes first: the week
  // when there is no survey or it closes later, the survey's close when that
  // is sooner. Both ways are run below, and the old sentence is held gone.
  test("a walk-in's email is only for that event's survey, and is deleted when that survey closes or a week after the event, whichever comes first", () => {
    assert.ok(
      PAGE_FLAT.includes(
        "If you come without signing up, we take your name at the door, and an email address only if you want the event&apos;s survey; we use it for nothing else, and delete it when that survey closes or a week after the event, whichever is sooner.",
      ),
    );
    assert.ok(PAGE_FLAT.includes(WHO_CAME_KEPT), "the policy no longer says how long who came, and a walk-in's email, are kept");
    assert.ok(!/delete it a week after the event\.|email address is deleted a week after the event\./.test(PAGE_FLAT), "the page still says a walk-in's email is kept a week whatever the survey does");
    assert.equal(checkInRules.walkInEmailGoesAt(VR).toISOString(), "2026-11-08T17:00:00.000Z");
    assert.equal(checkInRules.walkInEmailGoesAt(VR, new Date("2026-11-05T23:59:00Z")).toISOString(), "2026-11-05T23:59:00.000Z", "a survey closing sooner no longer takes the email with it");
    assert.equal(checkInRules.walkInEmailGoesAt(VR, new Date("2026-11-20T23:59:00Z")).toISOString(), "2026-11-08T17:00:00.000Z", "a survey closing later keeps a walk-in's email past the week");
    // The day is moved with the survey's own: made, saved, and closed by hand,
    // when the email goes at once.
    const checkIns = withoutComments(read("src/lib/events/checkIns.ts"));
    const align = /export async function setWalkInEmailDeadlines\([\s\S]*?\n\}/.exec(checkIns);
    assert.ok(align, "could not find how a walk-in's email follows the survey");
    assert.match(align[0], /const goesAt = walkInEmailGoesAt\(event, surveyClosesAt\);/);
    assert.match(align[0], /if \(!goesAt \|\| goesAt\.getTime\(\) <= now\.getTime\(\)\) \{\s*return \{ moved: 0, gone: await updateAll\(db, keeping\.map\(\(doc\) => doc\.ref\), EMAIL_GONE_FIELDS\) \};/);
    assert.match(withoutComments(read("src/lib/surveys/events/create.ts")), /await alignWalkInEmails\(db, ref\.id, now\);/);
    assert.match(withoutComments(read("src/lib/surveys/create.ts")), /if \(saved\.ok && isEventSurvey\(survey\)\) await alignWalkInEmails\(db, survey\.id, now\);/);
    assert.match(withoutComments(read("src/app/api/surveys/[surveyId]/close/route.ts")), /await alignWalkInEmails\(db, surveyId, now\);/);
    assert.match(withoutComments(read("src/app/api/events/[id]/check-ins/route.ts")), /surveyClosesAt,\s*\}\);/);
    assert.deepEqual({ ...checkInRules.EMAIL_GONE_FIELDS }, { email: null, emailGoesAt: null });
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    assert.match(rules, /const emailsDue = await col\.where\("emailGoesAt", "<=", now\)\.get\(\);/);
    assert.match(rules, /emailsDue\.docs\.map\(\(doc\) => doc\.ref\),\s*EMAIL_GONE_FIELDS,/);
    // The job that keeps it: registered, and on unless an admin turns it off.
    const job = withoutComments(read("src/lib/scheduler/jobs/eventCheckInsTidy.ts"));
    assert.match(job, /id: "event-check-ins-tidy",/);
    assert.ok(!/enabledByDefault/.test(job), "the job that deletes walk-ins' emails now waits for a switch, while the policy says it happens");
    assert.match(job, /const done = await tidyCheckIns\(db, ctx\.now\);/);
    const registry = withoutComments(read("src/lib/scheduler/registry.ts"));
    assert.match(registry, /^\s*"event-check-ins-tidy",$/m);
    assert.match(registry, /^\s*eventCheckInsTidyJob,$/m);
  });

  test("names come off a year after the event, and at once with the account; the count stays", () => {
    assert.ok(PAGE_FLAT.includes(WHO_CAME_KEPT), "the policy no longer says names come off who came a year after the event");
    // What a deletion leaves: the count of who came, no longer linked to the account.
    assert.ok(PAGE_FLAT.includes("It leaves: the short record of each application described above; worksheets sent to you and their reviews; survey answers and the count of who came, no longer linked to you;"));
    assert.equal(checkInRules.checkInNamesOffAt(VR).toISOString(), "2027-11-01T17:00:00.000Z");
    assert.deepEqual(
      { ...checkInRules.NAMES_OFF_FIELDS },
      { rsvpId: null, uid: null, name: null, email: null, emailGoesAt: null, byUid: null, namesOffAt: null, namesOff: true },
    );
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    assert.match(rules, /const namesDue = await col\.where\("namesOffAt", "<=", now\)\.get\(\);/);
    const account = /export async function takeCheckInNamesOffForAccount\([\s\S]*?\n\}/.exec(rules);
    assert.ok(account, "could not find how a deleted account's name comes off its check-ins");
    assert.match(account[0], /\.where\("uid", "==", uid\)\.get\(\)/);
    assert.match(account[0], /NAMES_OFF_FIELDS,/);
    assert.ok(!/\.delete\(/.test(account[0]), "a deletion now removes check-ins, which the policy says stay in the count");
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.match(cascade, /summary\.eventCheckInsNamesTakenOff = await takeCheckInNamesOffForAccount\(db, uid\);/);
  });

  // "It stays in the count" and "keep the count", run: a record whose names
  // have come off is one person who came, by a sign-up or walking in, and is
  // counted wherever who came is counted, and listed nowhere. Every file that
  // counts who came is held to it.
  test("a record whose names have come off stays in the count, wherever who came is counted", () => {
    assert.ok(PAGE_FLAT.includes("names for a year after the event, then only the count."));
    assert.ok(PAGE_FLAT.includes("survey answers and the count of who came, no longer linked to you;"));
    const off = (kind, how) => ({
      id: `${kind}-${how}`,
      eventId: "e",
      kind,
      how,
      rsvpId: null,
      uid: null,
      name: null,
      email: null,
      emailGoesAt: null,
      byUid: null,
      at: null,
      namesOffAt: null,
      namesOff: true,
    });
    const records = [off("signup", "qr"), off("signup", "door"), off("walk-in", "door")];
    // Listed nowhere: no row, since a row is a name.
    assert.deepEqual(checkInCounts.doorRows([], records), []);
    // Counted: three people came, two by a sign-up (one who checked
    // themselves in before the ways were told apart, one on the door list)
    // and one walking in. CHANGED ON PURPOSE (each way in recorded as
    // itself): who checked themselves in is `themselves`, split by the way
    // they came in `themselvesBy`, where it was one count of the code.
    const counts = checkInCounts.doorCounts([], checkInCounts.namesOffOf(records));
    assert.deepEqual([counts.here, counts.signupsHere, counts.walkIns, counts.themselves, counts.byList], [3, 2, 1, 1, 1]);
    assert.deepEqual({ ...counts.themselvesBy }, { code: 0, email: 0, site: 0, qr: 1 });
    // "How" stays in the count as itself once the names are off: a sign-up
    // and a walk-in for every way a record can say, each counted by its own way.
    const hows = checkInRecords.CHECK_IN_HOWS;
    const selfWays = checkInRecords.SELF_WAYS;
    const every = hows.flatMap((how) => [off("signup", how), off("walk-in", how)]);
    assert.deepEqual(checkInCounts.doorRows([], every), []);
    const all = checkInCounts.doorCounts([], checkInCounts.namesOffOf(every));
    assert.deepEqual(
      [all.here, all.signupsHere, all.walkIns, all.themselves, all.walkInsThemselves, all.byList, all.notListed],
      [2 * hows.length, hows.length, hows.length, 2 * selfWays.length, selfWays.length, hows.length - selfWays.length, 2 * hows.length],
    );
    assert.deepEqual({ ...all.themselvesBy }, Object.fromEntries(selfWays.map((way) => [way, 2])));
    // Every count of who came takes them, from the same check-ins as its rows.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bdoorCounts\(/).filter((file) => file !== "src/lib/events/checkInView.ts"),
      new Map([
        ["src/app/(app)/events/manage/[id]/check-in/page.tsx", "the Check-in tab's four numbers, which everybody in the events area sees"],
        ["src/features/events/checkIn/DoorList.tsx", "the door list's count of who is here and who is still to come"],
        ["src/features/events/checkIn/WhoCame.tsx", "the Check-in tab's list of who came, with its count, and of who didn't"],
      ]),
      "counting who came to an event",
      "Count the records whose names have come off too (`namesOffOf`), as the policy says only the count stays, then list the file here.",
    );
    for (const file of ["src/app/(app)/events/manage/[id]/check-in/page.tsx", "src/features/events/checkIn/DoorList.tsx", "src/features/events/checkIn/WhoCame.tsx"]) {
      const source = withoutComments(read(file));
      assert.equal((source.match(/\bdoorCounts\(rows, namesOff\)/g) ?? []).length, (source.match(/\bdoorCounts\(/g) ?? []).length, `${file} counts who came without the records whose names have come off`);
    }
    const tab = withoutComments(read("src/app/(app)/events/manage/[id]/check-in/page.tsx"));
    assert.match(tab, /const namesOff = namesOffOf\(checkIns\);\s*const counts = doorCounts\(rows, namesOff\);/);
    assert.match(tab, /initialRows=\{rows\}\s*namesOff=\{namesOff\}/);
    assert.match(withoutComments(read("src/app/(app)/events/manage/[id]/door/page.tsx")), /initialRows=\{doorRows\(doorListSignups\(signups\), checkIns\)\}\s*namesOff=\{namesOffOf\(checkIns\)\}/);
    // This term in numbers counts each as one more person nobody can match,
    // and the head over a survey after an event's results counts it as came.
    assert.match(withoutComments(read("src/lib/surveys/term/load.ts")), /for \(const checkIn of checkIns\) if \(checkIn\.namesOff\) counted\.push\(\{ how: checkIn\.how, keys: \[\], namesOff: true \}\);/);
    assert.match(withoutComments(read("src/lib/surveys/events/audience.ts")), /namesOff: namesOffOf\(checkIns\.filter\(\(checkIn\) => checkIn\.eventId === eventId\)\)/);
    const head = withoutComments(read("src/lib/surveys/events/adminView.ts"));
    assert.match(head, /const namesOff = plan\.read\?\.namesOff \?\? NO_NAMES_OFF;/);
    assert.match(head, /const total = came\.length \+ namesOff\.signups \+ namesOff\.walkIns;/);
  });

  // CHANGED ON PURPOSE (v15, the self check-in switch): v14 said the email
  // that confirms a place always has a link that checks you in. v15 says "at
  // an event that lets you": the link is built only while the event lets
  // people check themselves in (only a stored true), only on an email that
  // holds a place, and in one place. Off, that email says to give your name
  // at the door. The link alone is a credential, as v15 warns.
  test("the email that confirms a place carries the check-in link only at an event that lets you, and no other email does", () => {
    assert.ok(
      PAGE_FLAT.includes(
        "you check yourself in from the link in your confirmation email or with the code at the door. Anyone holding your email&apos;s link could check in in your name, so keep it to yourself.",
      ),
    );
    assert.ok(
      V14_FLAT.includes("When your place at an event is confirmed, the email that tells you has a link that checks you in at the door, so you can check in without an account."),
      "v14 is frozen and should still carry the link it promised",
    );
    const send = withoutComments(read("src/lib/events/sendRsvpEmail.ts"));
    assert.match(send, /const selfCheckIn = event\.selfCheckIn === true;/);
    assert.match(send, /if \(holder && selfCheckIn\) \{\s*checkInUrl = `\$\{baseUrl\(\)\}\/events\/\$\{event\.id\}\/check-in\?r=/);
    assert.equal((send.match(/\bcheckInUrl = /g) ?? []).length, 1, "the check-in link is built in more than one place");
    assert.match(send, /return holdsPlace\(variant === "approved" \|\| variant === "promoted" \? "confirmed" : "pending"\);/);
    assert.match(send, /const atTheDoor = holder && !checkInUrl;/);
    // The two routes that send an email holding a place hand it the event's switch as it stands.
    assert.match(withoutComments(read("src/app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts")), /selfCheckIn: evt\.selfCheckIn === true,/);
    assert.match(withoutComments(read("src/app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts")), /selfCheckIn: outcome\.event\.selfCheckIn === true,/);
    // No other file builds a link that checks somebody in with a sign-up's token.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\/check-in\?r=/),
      new Map([
        ["src/lib/events/sendRsvpEmail.ts", "the email that holds a place builds the check-in link, at an event that lets people check themselves in"],
      ]),
      "building a check-in link that carries a sign-up's token",
      "The policy says the link is in the email that confirms a place, at an event that lets you. Build it in sendRsvpEmail, or change the policy first.",
    );
    // "Anyone holding your email's link could check in in your name": the
    // link decides before any session is read, signed in or not.
    const decide = withoutComments(read("src/lib/events/selfCheckIn.ts"));
    const byLink = decide.indexOf("if (rsvpId && token) {");
    assert.ok(byLink !== -1 && byLink < decide.indexOf('if (!user) return { kind: "sign-in" };'), "the link no longer decides on its own");
    assert.match(withoutComments(read("src/app/events/[id]/check-in/page.tsx")), /const user = link\.token \? null : await getCurrentUser\(\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "event-self-check-in.test.mjs")), "tests/event-self-check-in.test.mjs sends the emails both ways, and through the routes");
  });

  // "At an event that lets you": the event's switch, off for a new event and
  // for every event made before it, on only as a stored true, and then only
  // once the door is open. Off, nobody checks themselves in by any way: the
  // page and the press say check-in is at the door and write nothing, the
  // email carries no link (above), and neither the Check-in tab nor a sign
  // offers the door code as a way in.
  test("at an event that lets you: only a stored true lets anybody check themselves in, and only once the door is open", () => {
    assert.ok(PAGE_FLAT.includes("or, at an event that lets you, you check yourself in from the link in your confirmation email or with the code at the door."));
    for (const [stored, on] of [[true, true], [false, false], ["true", false], [1, false], [null, false]]) {
      assert.equal(eventRecords.normalizeEvent("e", { selfCheckIn: stored }).selfCheckIn, on, JSON.stringify(stored));
    }
    assert.equal(eventRecords.normalizeEvent("e", {}).selfCheckIn, false, "an event made before the switch existed lets nobody");
    // Run: the one rule every way in asks.
    const opened = { ...VR, status: "published", doorOpenedAt: new Date("2026-11-01T13:05:00Z"), doorOpenedBy: "iris" };
    const during = new Date("2026-11-01T14:05:00Z");
    assert.equal(checkInRules.selfCheckInOpen({ ...opened, selfCheckIn: true }, during), true);
    assert.equal(selfCheckInRules.selfClosedWords({ ...opened, selfCheckIn: true }, during), null);
    for (const selfCheckIn of [false, "true", undefined]) {
      assert.equal(checkInRules.selfCheckInOpen({ ...opened, selfCheckIn }, during), false, String(selfCheckIn));
      assert.equal(selfCheckInRules.selfClosedWords({ ...opened, selfCheckIn }, during), selfCheckInRules.AT_THE_DOOR_ONLY, String(selfCheckIn));
    }
    const unopened = { ...opened, selfCheckIn: true, doorOpenedAt: null, doorOpenedBy: null };
    assert.equal(checkInRules.selfCheckInOpen(unopened, during), false, "before the door is opened");
    assert.equal(selfCheckInRules.selfClosedWords(unopened, during), selfCheckInRules.DOOR_NOT_OPEN_YET);
    // The press and the page ask it before they decide anybody.
    const press = withoutComments(read("src/app/api/events/[id]/check-in/route.ts"));
    const refused = press.indexOf("if (closed) return NextResponse.json({ error: closed }, { status: 409 });");
    assert.ok(press.indexOf("const closed = selfClosedWords(event, now);") !== -1 && refused !== -1 && refused < press.indexOf("decideSelf(db,"), "the press decides somebody before it asks whether the event lets them");
    const page = withoutComments(read("src/app/events/[id]/check-in/page.tsx"));
    const closedAt = page.indexOf("const closed = selfClosedWords(event, new Date());");
    assert.ok(closedAt !== -1 && closedAt < page.indexOf("selfCheckInView(db,"), "the page decides somebody before it asks whether the event lets them");
    assert.match(withoutComments(read("src/lib/events/selfCheckIn.ts")), /export function selfClosedWords\(event: EventDoc, now: Date\): string \| null \{\s*if \(event\.selfCheckIn !== true\) return AT_THE_DOOR_ONLY;/);
    // The editor writes a boolean; the route behind a published event takes only a strict true.
    assert.match(withoutComments(read("src/app/api/events/[id]/update/route.ts")), /const selfCheckIn = body\.selfCheckIn === true;/);
    assert.match(withoutComments(read("src/features/events/eventMutations.ts")), /if \(fields\.selfCheckIn !== undefined\) patch\.selfCheckIn = fields\.selfCheckIn === true;/);
    // Off, the door code is no way in: the tab does not offer it, and its sign says check-in is at the door.
    assert.match(withoutComments(read("src/app/(app)/events/manage/[id]/check-in/page.tsx")), /\{event\.selfCheckIn && \(\s*<DoorCodeCard/);
    assert.match(withoutComments(read("src/lib/qr/codeAccess.ts")), /note: event\?\.selfCheckIn \? doorCodeLine\(event\) : AT_THE_DOOR_ONLY,/);
    // The survey's code offers the way to check in only while you can.
    assert.match(withoutComments(read("src/lib/surveys/events/codePage.ts")), /const door = event !== null && selfCheckInOpen\(event, now\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "event-self-check-in.test.mjs")), "tests/event-self-check-in.test.mjs presses I'm here as every kind of person, the switch off and on");
  });

  // "How": each way in is recorded as itself. By a committee member, on the
  // door list (`door`) or from the event's page afterwards (`page`); by
  // yourself, at an event that lets you, from your email's link (`email`),
  // with the code at the door (`code`), or on the check-in page that code
  // opens while signed in (`site`). A record from before the ways were told
  // apart says `qr`: read back as somebody who checked themselves in, the
  // way not recorded, and never written again.
  test("how you came is recorded as itself: the door list or the event's page by a committee member, or yourself by your email's link, the code at the door or its check-in page", () => {
    assert.ok(PAGE_FLAT.includes("If you come, we may record that you came, how and when: a committee member checks you in on the door list, or, at an event that lets you, you check yourself in from the link in your confirmation email or with the code at the door."));
    assert.deepEqual([...checkInRecords.CHECK_IN_HOWS], ["code", "email", "site", "qr", "door", "page"]);
    assert.deepEqual([...checkInRecords.SELF_WAYS], ["code", "email", "site", "qr"]);
    for (const how of checkInRecords.CHECK_IN_HOWS) {
      assert.equal(checkInRecords.normalizeCheckIn("c", { how }).how, how, `${how} is read back as itself`);
      assert.equal(checkInRecords.checkedThemselvesIn(how), checkInRecords.SELF_WAYS.includes(how), how);
    }
    assert.equal(checkInRecords.normalizeCheckIn("c", { how: "teleport" }).how, "door", "a way nobody knows reads as the door list, as a record with none always has");
    // A press is recorded by the way it came: the email's link decides alone, then the door code, then the page.
    assert.equal(selfCheckInRules.selfHow({ viaLink: true, doorCode: true }), "email");
    assert.equal(selfCheckInRules.selfHow({ viaLink: true, doorCode: false }), "email");
    assert.equal(selfCheckInRules.selfHow({ viaLink: false, doorCode: true }), "code");
    assert.equal(selfCheckInRules.selfHow({ viaLink: false, doorCode: false }), "site");
    assert.match(
      withoutComments(read("src/app/api/events/[id]/check-in/route.ts")),
      /how: selfHow\(\{ viaLink: decision\.viaLink, doorCode: parsed\.doorCode \}\),\s*byUid: null,/,
    );
    // A committee member: only somebody who runs check-in, recorded as the one who did, on the door list only once the door is open.
    const list = withoutComments(read("src/app/api/events/[id]/check-ins/route.ts"));
    assert.equal((list.match(/how: parsed\.from === "door" \? "door" : "page",\s*byUid: user\.uid,/g) ?? []).length, 2);
    const asked = list.indexOf("if (!runsCheckIn(user)) {");
    assert.ok(asked !== -1 && asked < list.indexOf("recordCheckIn(db"), "the door list writes a check-in before it asks who is pressing");
    assert.match(list, /if \(parsed\.from === "door"\) \{\s*const closed = doorClosedWords\(phase, window, openingOf\(event\) !== null\);/);
    // The old catch-all is never written again.
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    assert.match(rules, /const RECORDED_HOWS: readonly string\[\] = CHECK_IN_HOWS\.filter\(\(how\) => how !== "qr"\);/);
    assert.match(rules, /if \(!RECORDED_HOWS\.includes\(how\)\) throw new Error\(/);
    // Each way as the Check-in tab says it, to the people who see who came.
    assert.deepEqual(
      { ...checkInCounts.HOW_WORDS },
      { code: "Scanned the door code", email: "From their email", site: "On the check-in page", qr: "Checked themselves in", door: "Door list", page: "Added later" },
    );
    // Every writer of a check-in, and the way each writes, is registered, both ways.
    assert.match(read("tests/event-check-ins.test.mjs"), /describe\("every check-in is written with its own way in"/);
  });

  // The Check-in tab and the door list, as v15 has them: a committee member
  // checks you in on the door list, which only somebody who runs check-in
  // opens; the event's other organisers read the tab's numbers, split by the
  // way people came, and the one name it shows them is whoever opened the
  // door (the event's author or an admin), never anybody who came.
  test("the door list and the Check-in tab: who checks you in, and the one name the other organisers read", () => {
    assert.ok(PAGE_FLAT.includes("Only admins and the committee members the Students&apos; Union recognises can see who came; the event&apos;s other organisers see how many came, never who."));
    const door = withoutComments(read("src/app/(app)/events/manage/[id]/door/page.tsx"));
    const gate = door.indexOf("if (!runsCheckIn(viewer)) redirect(");
    assert.ok(gate !== -1 && gate < door.indexOf("loadEventAtTheDoor(db, id)"), "the door list reads who signed up before it asks who is looking");
    const tab = withoutComments(read("src/app/(app)/events/manage/[id]/check-in/page.tsx"));
    // Names of who checked people in for the people who run check-in; for everybody else, the opener's alone.
    assert.match(tab, /const names = await staffNames\(db, staff \? \[\.\.\.checkIns\.map\(\(row\) => row\.byUid\), opening\?\.by \?\? null\] : \[opening\?\.by \?\? null\]\);/);
    assert.match(tab, /const rows = doorRows\(doorListSignups\(signups\), checkIns, staff \? names : undefined\);/);
    assert.match(tab, /name: names\.get\(opening\.by\) \?\? null, isViewer: opening\.by === viewer\.uid/);
    // Who may open the door: the event's author while their account stands, and admins. Opening it checks nobody in.
    const opens = withoutComments(read("src/app/api/events/[id]/door/route.ts"));
    assert.match(opens, /const mayOpen = viewer\.role === "admin" \|\| \(raw !== null && isNamedWithStanding\(viewer, "events\.authorUid", authorUid\)\);/);
    assert.ok(!/recordCheckIn\(/.test(opens), "opening the door now checks somebody in");
    // The tab's numbers, by the way people came, name nobody.
    const counts = checkInCounts.doorCounts([], checkInCounts.namesOffOf([]));
    for (const event of [{ selfCheckIn: true, noSignup: false }, { selfCheckIn: true, noSignup: true }, { selfCheckIn: false, noSignup: false }]) {
      assert.match(checkInCounts.themselvesWords(counts, event), /^(With the door code(, or the link in their email)?|Self check-in is off for this event)$/);
    }
    assert.ok(existsSync(join(REPO_ROOT, "tests", "event-check-in-tab.test.mjs")), "tests/event-check-in-tab.test.mjs renders the tab as an organiser the SU does not recognise and finds no name of anybody who came");
  });

  // TAKEN BACK BY v15: v14 said nobody is shown one person's list of the
  // events they came to. v15 says admins can see which events somebody signed
  // up for and whether they came. No page lists them yet, so the walk below
  // still finds one read by person, the deletion's: the day a page lists one
  // person's events, this check fails, and whoever builds it shows it to
  // admins alone, as v15 says, and moves the check with it.
  test("the record is used to count who comes, and one person's list of events is an admin's alone", () => {
    assert.ok(PAGE_FLAT.includes("counting who comes to events;"), "the policy no longer names counting who comes among its legitimate interests");
    assert.ok(PAGE_FLAT.includes("Admins can see which events you signed up for and whether you came."));
    assert.ok(!/Nobody is shown one person&apos;s list of the events they came to/.test(PAGE_FLAT), "the policy still says nobody is shown one person's events, which v15 took back");
    // The only read of check-ins by person is the account deletion's.
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    assert.equal((rules.match(/\.where\("uid"/g) ?? []).length, 1);
    assert.equal((rules.match(/\.where\("rsvpId"/g) ?? []).length, 0);
  });

  // The survey about leaving (Q46, 26 October 2026): two sentences, each held
  // to the code that keeps it.
  test("the survey about leaving reaches only somebody who leaves, through a link of their own where they are told they left, and nobody presses send", () => {
    assert.ok(PAGE_FLAT.includes("If you leave a programme while it has a survey about leaving, a link to it appears where you are told you left."));
    // Made as they leave, and only then: after the leave has committed, by the one leave.
    const leave = withoutComments(read("src/lib/courses/leaveRun.ts"));
    assert.ok(leave.indexOf("if (!dropped) return") < leave.indexOf("reachLeaverSafely(db,"), "the survey reaches somebody before their leave has taken");
    assert.match(leave, /const reached = path\.kind === "form" \? await reachLeaverSafely\(db, \{ roundId: path\.roundId, programmeId: path\.programmeId, uid: user\.uid, now \}\) : null;/);
    assertExactlyTheseFiles(
      sourceFilesNaming(/\breachLeaver\(/),
      new Map([
        ["src/lib/surveys/leaving.ts", "the one writer of a leaver's row on the leaving survey"],
        ["src/lib/courses/leaveRun.ts", "the one leave, both doors, after it has committed"],
      ]),
      "making a person's row on a leaving survey",
      "The policy says the survey about leaving reaches nobody who did not leave. Only the leave may make that row.",
    );
    // A link of their own, made once: a second leave keeps the first row.
    const leaving = withoutComments(read("src/lib/surveys/leaving.ts"));
    assert.match(leaving, /if \(existing && existing\.respondent\.uid === uid\) return \{ token: existing\.token, answered: existing\.answered \};\s*const minted = mintSurveyToken\(\);/);
    assert.match(leaving, /if \(survey\.kind !== "leaving" \|\| survey\.audience\.kind !== "leaving"\) continue;/);
    // On the page that says they left, in the email that tells them so, and on Home and My programmes until answered.
    assert.match(withoutComments(read("src/features/courses/leaving/LeftProgramme.tsx")), /\{survey && <LeavingSurveyCard card=\{survey\} \/>\}/);
    assert.match(leave, /survey: reached\?\.link && !reached\.answered \? \{ href: reached\.link, \.\.\.reached\.email \} : null,/);
    assert.match(withoutComments(read("src/emails/CourseDroppedOutEmail.tsx")), /<Link href=\{survey\.href\} style=\{emailLinkStyle\}>/);
    const waiting = withoutComments(read("src/lib/surveys/waiting.ts"));
    assert.match(waiting, /if \(row && row\.respondent\.uid === uid && row\.sentAt !== null && !row\.answered\) rows\.push\(row\);/);
    assert.match(waiting, /if \(survey\.audience\.kind === "leaving"\) return leftTheRun\(db, survey\.runId, uid\);/);
    // Nobody presses send: a leaving survey's audience names nobody, and send, remind and test refuse it.
    assert.match(read("src/lib/surveys/audience.ts"), /if \(audience\.kind === "leaving"\) return \{ status: "ok", form, programme, holders: \[\] \};/);
    for (const route of ["send", "remind", "test"]) {
      assert.match(
        withoutComments(read(`src/app/api/surveys/[surveyId]/${route}/route.ts`)),
        /if \(survey\.kind === "leaving"\) return NextResponse\.json\(\{ error: REFUSAL\.leavingNotSent \}, \{ status: 409 \}\);/,
        `the ${route} route sends a leaving survey`,
      );
    }
    // What it asks, by kind, both ways. v15 names the kinds every survey asks
    // about rather than each survey's questions, and the survey about
    // leaving's three (why you left, what would have helped you stay, whether
    // you would take part again) are all about how the programme went.
    const KIND = "how the programme or event went";
    assert.ok(PAGE_FLAT.includes(`They ask about you and your plans, what you learned, and ${KIND}; the questions vary.`), "the policy no longer says what surveys ask about");
    const ASKS = new Map([[KIND, ["q_leave_why", "q_leave_stay", "q_leave_again"]]]);
    const asked = surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("leaving", "fellowship", null)).map((question) => question.id);
    for (const [words, ids] of ASKS) {
      for (const id of ids) assert.ok(asked.includes(id), `"${words}" covers ${id}, which the leaving template no longer asks`);
    }
    assert.deepEqual(asked.filter((id) => ![...ASKS.values()].flat().includes(id)), [], "the leaving template asks a question nobody has held to the kinds the policy names");
    // As in every survey, each needs an answer unless it is marked optional; the template marks none.
    assert.ok(PAGE_FLAT.includes("Every question needs an answer unless it is marked optional."));
    assert.deepEqual(surveyItems.missingRequired(surveyTemplates.templateItems("leaving", "fellowship", null), {}), asked, "a question of the survey about leaving is optional");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-leaving.test.mjs")), "tests/surveys-leaving.test.mjs runs both doors, the page and the email, and nobody else");
  });

  test("a programme's lead sees its surveys' totals and comments as they come, never a name, who answered or a download, in no order that follows when they came, and its material's average ratings from three", () => {
    assert.ok(
      PAGE_FLAT.includes(
        "The programme&apos;s lead sees the totals and comments of its surveys, and never sees your name or who answered and who did not, and cannot download the answers. When only a few people answer, the lead may still be able to tell which answer is yours.",
      ),
      "the policy no longer says what a programme's lead sees of its surveys, and never sees",
    );
    assert.ok(PAGE_FLAT.includes("The lead sees each piece&apos;s average once three people have rated it, never who gave which."));
    // v15 leaves out when the lead sees them (as answers come in) and the order
    // of the comments; the code below still shows them as they come, sorted by
    // their words rather than by when they came in, which v15 allows.
    // Every kind of survey the programme has of its own, and never one after an event or another programme's.
    const reads = withoutComments(read("src/lib/surveys/leadResults.ts"));
    assert.match(reads, /export const LEAD_READS: readonly SurveyKind\[\] = \["before", "after", "followUp6", "followUp12", "leaving"\];/);
    assert.match(reads, /if \(!isProgrammeAudience\(survey\.audience, roundId, programmeId\)\) return null;/);
    // Its two pages, the Surveys tab and one survey's results, each ask the lead's gate before any survey is read.
    const TABS = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys";
    for (const [page, reader] of [
      [`${TABS}/page.tsx`, "leadSurveysTab(db,"],
      [`${TABS}/[surveyId]/page.tsx`, "leadSurveyOf(db,"],
    ]) {
      const code = withoutComments(read(page));
      const gate = code.indexOf("loadProgrammeRun(db, user, roundId, programmeId)");
      const refused = code.indexOf('if (outcome.status === "not-yours") {');
      assert.ok(gate !== -1 && refused > gate, `${page} no longer asks who the caller is, then refuses a reviewer`);
      assert.ok(code.indexOf(reader) > refused, `${page} reads a survey before it refuses a reviewer`);
    }
    // The tab's numbers are each survey's Results, with the comments by their
    // words, and it lists only those surveys, once each has gone out.
    const tab = withoutComments(read("src/lib/surveys/leadTab.ts"));
    assert.match(tab, /await resultsView\(db, survey, false, \{ commentsInOrder: "words" \}\)/);
    assert.match(tab, /LEAD_READS\.includes\(survey\.kind\) && isProgrammeAudience\(survey\.audience, roundId, programmeId\) && survey\.firstSentAt !== null/);
    // No admins' switch that shows a smaller set beside a larger one on the lead's page.
    assert.match(withoutComments(read(`${TABS}/[surveyId]/page.tsx`)), /<ResultsTab view=\{view\} surveyId=\{survey\.id\} beforeFirstSession=\{false\} switches=\{false\} \/>/);
    // "Cannot download the answers": the one download of a survey's answers is an admin's.
    const exported = withoutComments(read("src/app/api/surveys/[surveyId]/export/route.ts"));
    assert.ok(
      exported.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });") !== -1,
      "the download of a survey's answers no longer refuses everybody but an admin",
    );
    // "The average star rating ... once three people have rated it, never who
    // gave which": the retrospective's count and its floor, through its
    // projection, which reads no uid.
    const ratings = withoutComments(read("src/lib/courses/sourceRatings.ts"));
    assert.match(ratings, /\.select\("itemId", "rating", "completed"\)/);
    assert.match(ratings, /aggregateRetrospective\(\{ weeks, progress, notes: \[\], enrolledCount: 0 \}\)/);
    assert.match(ratings, /row\.avgRating === null \? \[\]/);
    assert.match(read("src/lib/firestore/courseTemplates.ts"), /export const RETRO_ANONYMITY_FLOOR = 3;/);
    assert.ok(
      existsSync(join(REPO_ROOT, "tests", "surveys-lead-tab.test.mjs")),
      "tests/surveys-lead-tab.test.mjs renders the tab and each survey's results for every kind of caller, and finds no name",
    );
  });

  test("the survey about leaving is confidential: admins see who said what, the lead its totals and comments as they come and never a name, in no order that follows when they came, facilitators nothing, and names come off as every survey's", () => {
    // CHANGED ON PURPOSE (finding L2; Q41, Q49 A): was the leaving survey
    // alone. The lead reads every kind of survey the programme has of its own,
    // the leaving survey among them, and never a survey after an event, under
    // the programme, after the lead's own gate.
    assert.match(
      read("src/lib/surveys/leadResults.ts"),
      /export const LEAD_READS: readonly SurveyKind\[\] = \["before", "after", "followUp6", "followUp12", "leaving"\];/,
    );
    const page = withoutComments(read("src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]/page.tsx"));
    assert.ok(page.indexOf("loadProgrammeRun(db, user, roundId, programmeId)") < page.indexOf("leadSurveyOf(db,"), "the lead's page reads a survey before it asks who the caller is");
    assert.match(page, /if \(outcome\.status === "not-yours"\) \{/);
    // As answers come in, with no floor, in an order that does not follow when they came.
    assert.match(page, /const view = await resultsView\(db, survey, false, \{ commentsInOrder: "words" \}\);/);
    assert.match(
      withoutComments(read("src/lib/surveys/adminView.ts")),
      /options\.commentsInOrder === "words" && result\.kind === "comments"\s*\? \{ \.\.\.result, comments: \[\.\.\.result\.comments\]\.sort\(\(a, b\) => a\.localeCompare\(b, "en-GB"\)\) \}/,
    );
    // The box says so: confidential, the lead without names, the facilitators never.
    const box = surveyWords.confidentialPoints({ stage: "leaving", leadName: "Claudia", facilitatorNames: null, namesOffOn: "2028-12-09", programmeKind: "fellowship" });
    assert.deepEqual(box.points.slice(0, 2), ["Only NAISI’s admins can see who said what.", "Claudia sees totals and comments, never names. Your facilitators never see your answers."]);
    assert.ok(box.points.includes("Nothing you say changes your account or a future application."));
    assert.ok(box.points.includes("Your name comes off on Sat 9 Dec 2028, two years after the fellowship ends. The totals stay."));
    // Names come off as every survey's: the day is worked out the same way when it is made and fixed when it is opened.
    assert.match(withoutComments(read("src/lib/surveys/leaving.ts")), /const namesOffOn = await namesOffDayFor\(db, survey\.runId, now\);/);
    assert.match(withoutComments(read("src/lib/surveys/create.ts")), /const namesOffOn = await namesOffDayFor\(db, runId, now\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-leaving.test.mjs")), "tests/surveys-leaving.test.mjs renders the lead's page for every kind of caller");
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: the survey after an event
// ---------------------------------------------------------------------------

/**
 * What the policy says about the survey after an event (docs/surveys.md,
 * "Surveys after events"), held to the code that makes it true: who it goes
 * to and who reads it, what it asks, its QR code and its email, what is kept
 * with the answers and when names come off. v15 says these among the words
 * it says of every survey, under Surveys and check-ins and How long we keep
 * it; what v7 spelled out about the event's own survey alone (exactly who it
 * may go to, the address it is sent to, what its file holds) v15 leaves to
 * those words, and the code checks of them stay below.
 * `tests/surveys-events.test.mjs` runs every route and page as every kind of
 * caller; here each sentence is paired with a rule that is run or a line of
 * source that is matched.
 */
const eventSurveyTemplate = await loadTs("lib/surveys/events/template.ts");
const eventSurveyWords = await loadTs("lib/surveys/events/words.ts");

describe("the survey after an event", () => {
  /** Who it may go to, and who reads it, in v15's words for every survey. */
  const WHO = [
    "We may ask you to fill in surveys before, during and after a programme (including short check-ins at the end of a session), after events you had a place at, and in follow-ups you agree to.",
    "An event&apos;s survey may be sent automatically after it ends.",
    "<strong>Confidential.</strong> Every survey is confidential: we keep your answers with your name, and each survey says so at the top. Only NAISI&apos;s admins can see who said what, and we record each time one of them does.",
    "An event&apos;s organisers are told that its survey went and when, and nothing of its results.",
    // A walk-in, who had no place, gives an address for this survey alone.
    "and an email address only if you want the event&apos;s survey; we use it for nothing else,",
  ];
  /** What it asks: v15 names the kinds every survey asks about, and that every question needs an answer unless marked optional. */
  const ASKS = [
    "They ask about you and your plans, what you learned, and how the programme or event went; the questions vary.",
    "Every question needs an answer unless it is marked optional.",
  ];
  /** Its QR code, its email, and what is kept with the answers. */
  const CODE = [
    "<strong>How a survey reaches you.</strong> A survey&apos;s email is a notice, so your notification settings don&apos;t switch it off, and it carries a link of your own so you can answer without signing in. Anyone holding it could answer in your name, so keep it to yourself. At the end of an event, its QR code opens its survey.",
    "<strong>What a survey records.</strong> Your answers, when you sent them, whether you used your own link or were signed in, and whether your group had met by then. Nothing about how you filled it in, and none of your answers until you send them.",
  ];
  const NAMES_OFF = "<strong>Survey answers:</strong> we take your name off two years after the programme&apos;s last session (or the event), and delete the record that the survey was sent to you with your link. Your answers stay in the totals, no longer linked to you.";
  const says = (sentences) => {
    for (const sentence of [].concat(sentences)) assert.ok(PAGE_FLAT.includes(sentence), `the policy no longer says: ${sentence}`);
  };

  test("the frozen v6 carries none of these sentences", () => {
    for (const pattern of [/After an event, NAISI&apos;s admins may send a survey/, /The survey after an event asks/, /its QR code opens the survey/, /For the survey after an event, that day/, /The file of a survey after an event/]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("who it goes to: the people who came or everybody confirmed, nobody else; confidential; the organisers see that it went, never its results", () => {
    says(WHO);
    // v15 leaves out "to the people who came to it, or to everybody whose
    // place on it was confirmed, and to nobody else": the audience below is
    // still exactly that.
    // Who it can reach, read from the event's own sign-ups and check-ins.
    const audience = withoutComments(read("src/lib/surveys/events/audience.ts"));
    assert.match(audience, /if \(row\.status !== "confirmed"\) continue;/, "a sign-up that is not confirmed now reaches the survey");
    assert.match(audience, /if \(checkIn\.namesOff \|\| checkIn\.eventId !== eventId\) continue;/);
    assert.match(audience, /return read\.people\.filter\(\(member\) => \(kind === "event-came" \? member\.came : member\.signedUp\)\);/);
    assert.match(audience, /\.filter\(\(row\) => row\.eventId === eventId && !row\.synthetic\);/);
    // Confidential: an answer keeps its person, an account or a guest.
    assert.equal(surveyRecords.normalizeSurvey("s1", { kind: "event", privacy: "anonymous", audience: { kind: "event-came", eventId: "e1" }, event: { title: "VR games night" } }).privacy, "confidential");
    // Who reads it: the admins' pages, and the event's tab draws results only for an admin.
    const tab = withoutComments(read("src/app/(app)/events/manage/[id]/survey/page.tsx"));
    assert.match(tab, /const admin = canRunSurveys\(viewer\);/);
    assert.match(tab, /const results =\s*admin && survey && survey\.firstSentAt\s*\?/, "the event's tab reads results for somebody other than an admin");
    assert.ok(!/eventAnswersOf|eventPeopleOf|resultsView|SURVEY_(?:ANSWERS|PEOPLE)_COLLECTION/.test(withoutComments(read("src/lib/surveys/events/tab.ts"))), "what the tab tells the organisers now reads answers or who answered");
    // The organisers are told it went and when: the sentence, run.
    assert.match(withoutComments(read("src/lib/surveys/events/tab.ts")), /\$\{survey\.name\}: \$\{who\} emailed it to \$\{peopleWords\(first\.count\)\} \$\{when\}\./);
    // tests/surveys-events.test.mjs renders the tab as the organiser, SU-recognised committee and an admin.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-events.test.mjs")));
  });

  test("what it asks, by kind, is the template's every question", () => {
    says(ASKS);
    // v15 names the kinds every survey asks about rather than this survey's
    // five questions, so the template is held to its questions here: a new
    // one is checked against "how the programme or event went" before it is
    // added to this list.
    const items = eventSurveyTemplate.eventTemplateItems();
    assert.deepEqual(
      items.map((item) => [item.title, item.type]),
      [
        ["How was it?", "rating"],
        ["Would you come to another NAISI social?", "singleChoice"],
        ["What should we run next?", "multipleChoice"],
        ["How did you hear about it?", "singleChoice"],
        ["Anything we should change?", "longText"],
      ],
      "the survey after an event asks something new: check it against the kinds the policy names, then list it here",
    );
    // CHANGED ON PURPOSE (v14): was "no question is required". What the policy
    // says, run: every question needs an answer unless it is marked optional,
    // and the last ("Anything we should change?") is the one marked optional.
    assert.deepEqual(
      items.map((item) => surveyItems.isQuestionRequired(item)),
      [true, true, true, true, false],
      "the survey after an event's questions are not required as the policy says",
    );
    assert.deepEqual(surveyItems.validateSurveyItems(items), []);
  });

  test("its QR code, its email and what is kept with the answers", () => {
    says(CODE);
    // v15 leaves out the signed-in and signed-out detail and which address
    // the email goes to; the code checks of both stay.
    // Signed out, asked to sign in before anything about the person is read;
    // signed in, only somebody who signed up or came.
    const page = withoutComments(read("src/lib/surveys/events/codePage.ts"));
    const signIn = page.indexOf('if (!user) return { kind: "sign-in"');
    const may = page.indexOf("await mayAnswerSignedIn(db, survey.audience.eventId, user.uid)");
    assert.ok(signIn !== -1 && may !== -1 && signIn < may, "the QR code's page reads the person before asking a signed-out visitor to sign in");
    assert.match(withoutComments(read("src/lib/surveys/events/audience.ts")), /return member !== undefined && \(member\.signedUp \|\| member\.came\);/);
    const route = withoutComments(read("src/app/api/surveys/[surveyId]/answer/route.ts"));
    const gate = route.indexOf("if (!(await mayAnswerSignedIn(db, survey.audience.eventId, actor.uid))) {");
    const kept = route.indexOf("await recordEventAnswer(db, {");
    assert.ok(gate !== -1 && kept !== -1 && gate < kept, "an answer signed in is kept before the person is asked whether they signed up or came");
    // The email skips whoever answered: the people owed it have neither a sent nor an answered row.
    const sending = withoutComments(read("src/lib/surveys/events/sending.ts"));
    assert.match(sending, /const reached = new Set\(rows\.filter\(\(row\) => row\.sentAt !== null \|\| row\.answered\)/);
    // An important notice, with its own line, through the notice door alone.
    assert.match(sending, /const result = await sendNotice\(\{/);
    assert.match(sending, /surface: "event-survey",/);
    assert.ok(!/\bsendEmail\(|wantsEmailFor|addressesForSend/.test(sending), "the survey after an event now goes through a door that reads the notification settings");
    assert.match(withoutComments(read("src/emails/NoticeMarker.tsx")), /"event-survey": "you came to this event or signed up for it",/);
    // To the account's address, or to the address a guest or a walk-in gave the event.
    const audience = withoutComments(read("src/lib/surveys/events/audience.ts"));
    assert.match(audience, /const address = typeof data\.email === "string" \? data\.email\.trim\(\) : "";/);
    assert.match(audience, /guestAddress: row\.email\.trim\(\) \|\| null/);
    assert.match(audience, /add\(\{ kind: "guest", signupId: checkIn\.id \}, \{ came: true, guestName: checkIn\.name \?\? "", guestAddress: checkIn\.email \}\);/);
    // A link of their own: one row each, its secret made where every survey's is.
    assert.match(withoutComments(read("src/lib/surveys/events/store.ts")), /const token = mintSurveyToken\(\);/);
    // What is kept with the answers, field by field: no group, no record of opening it.
    const store = withoutComments(read("src/lib/surveys/events/store.ts"));
    const set = /tx\.set\(answerRef, \{([\s\S]*?)\}\);/.exec(store);
    assert.ok(set, "could not find where an answer to a survey after an event is kept");
    assert.deepEqual(
      [...set[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((field) => field[1]),
      ["surveyId", "eventId", "respondent", "answers", "sentAt", "via"],
      "an answer to a survey after an event now keeps something the policy's What a survey records does not list",
    );
    assert.match(set[1], /sentAt: FieldValue\.serverTimestamp\(\),/);
    assert.match(withoutComments(read("src/app/api/surveys/answer/route.ts")), /via: "link",/);
    assert.match(withoutComments(read("src/app/api/surveys/[surveyId]/answer/route.ts")), /via: "signed-in",/);
    // Nothing before Send: the code's page and what it reads write nothing.
    for (const file of ["src/app/events/[id]/survey/page.tsx", "src/lib/surveys/events/codePage.ts", "src/lib/surveys/events/answerView.ts"]) {
      assert.ok(!/\.(?:set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/.test(withoutComments(read(file))), `${file} now writes something when a survey is opened`);
    }
    // The box says so at the top, in its own words, with the two years.
    const box = eventSurveyWords.eventBoxPoints({ namesOffOn: "2028-11-01", signedInAs: null, came: true });
    assert.equal(box.points[0], "Only NAISI’s admins can see who said what.");
    assert.ok(box.points.includes("Your name comes off on Wed 1 Nov 2028, two years after the event. The totals stay."));
    assert.equal(box.note, "We keep your answers with your name, and that you came, so nobody is emailed it twice.");
  });

  test("names come off two years after the event by the surveys' own job, and the file names no group", () => {
    says(NAMES_OFF);
    // v15 leaves out what the file holds; it is an admin's download of who
    // said what, which only admins see, and still names no group.
    const records = withoutComments(read("src/lib/surveys/events/records.ts"));
    assert.match(records, /const ends = eventEnds\(event\);\s*return ends \? twoYearsAfter\(londonDateKey\(ends\)\) : null;/);
    // The day is the survey's own, which the surveys-names-off job reads for every survey alike.
    assert.match(withoutComments(read("src/lib/surveys/events/create.ts")), /namesOffOn,\n/);
    assert.match(withoutComments(read("src/lib/scheduler/jobs/surveyNamesOff.ts")), /const due = \(await surveysNamesDueBy\(db, today\)\)\.filter\(\(survey\) => namesDueOff\(survey, today\)\);/);
    // The file: the programme surveys' table, less the group's column, a guest by the name they gave.
    const file = withoutComments(read("src/lib/surveys/events/exportTable.ts"));
    assert.match(file, /const drop = table\.header\.indexOf\("After their first session"\);/);
    assert.match(file, /const names = new Map\(\(read\?\.people \?\? \[\]\)\.map\(\(member\) => \[member\.key, member\.name\]\)\);/);
    // tests/surveys-events.test.mjs runs the job the day before and on the day, guests and accounts alike, and downloads the file.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-events.test.mjs")));
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: this term in numbers
// ---------------------------------------------------------------------------

/**
 * What the policy says about This term in numbers (Q51 B; docs/surveys.md
 * "This term in numbers"), held to the code that makes it true: who sees it,
 * how one person is matched across events and who never is, and that it is
 * totals and nothing else. First said by v7; v15 says it in the last
 * sentence of Attendance. `tests/surveys-term-numbers.test.mjs` and its page
 * and file suites run it as every kind of caller.
 */
const termModel = await loadTs("lib/surveys/term/model.ts");
const termTotals = await loadTs("lib/surveys/term/totals.ts");

describe("this term in numbers", () => {
  const SENTENCE =
    "Admins also see totals across a term&apos;s events (how many different people came, and how many came to two or more), counting you once by your account or email address; a walk-in with no account is never matched.";

  test("the frozen v6 carries none of it", () => {
    assert.ok(!/how many different people came/.test(V6_FLAT));
    assert.ok(!/a walk-in with no account is never matched/.test(V6_FLAT));
  });

  test("admins alone see it: the page, the file and the loader each ask before anything is read", () => {
    assert.ok(PAGE_FLAT.includes(SENTENCE), "the policy no longer says what admins see across a term's events");
    const askedFirst = (source, ask, read) => {
      const at = source.indexOf(ask);
      return at !== -1 && at < source.indexOf(read);
    };
    const page = withoutComments(read("src/app/(app)/admin/(admin-only)/surveys/term/page.tsx"));
    assert.ok(askedFirst(page, "if (!viewer || !canRunSurveys(viewer)) redirect(\"/dashboard\");", "loadTermNumbers(db"), "the page reads before it asks who the caller is");
    const route = withoutComments(read("src/app/api/surveys/term/totals/route.ts"));
    assert.ok(askedFirst(route, "if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });", "loadTermNumbers(db"), "the file is built before the caller is asked whether they are an admin");
    const load = withoutComments(read("src/lib/surveys/term/load.ts"));
    const body = /export async function loadTermNumbers\([\s\S]*?\n\}/.exec(load);
    assert.ok(body, "could not find the loader");
    assert.match(body[0], /^export async function loadTermNumbers[^\n]*\n {2}if \(!canRunSurveys\(viewer\) \|\| !runsCheckIn\(viewer\)\) return null;/, "the loader reads something before it asks");
    assert.match(read("src/lib/surveys/repo.ts"), /export function canRunSurveys\(user: Pick<SessionUser, "role"> \| null\): boolean \{\s*return user\?\.role === "admin";\s*\}/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-term-numbers-page.test.mjs")), "the page's suite renders it as every kind of caller");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-term-numbers-file.test.mjs")), "the file's suite asks for it as every kind of caller");
  });

  test("one person is matched by account and its address, and a sign-up without an account by its address; a walk-in with no account never is", () => {
    assert.ok(PAGE_FLAT.includes("counting you once by your account or email address; a walk-in with no account is never matched."));
    const load = withoutComments(read("src/lib/surveys/term/load.ts"));
    // The keys a counted check-in carries: its account, and the address on its sign-up.
    assert.match(load, /if \(uid\) \{\s*keys\.push\(accountKey\(uid\)\);/);
    assert.match(load, /if \(signup && signup\.email\.trim\(\)\) keys\.push\(addressKey\(signup\.email\)\);/);
    // An account's own address joins it to the sign-ups made on that address.
    assert.match(load, /const email = snap\.exists \? \(snap\.data\(\) \?\? \{\}\)\.email : null;/);
    // A walk-in's address is read for nothing here: it is for that event's survey alone.
    assert.ok(!/record\??\.email|checkIn\.email|\.emailGoesAt/.test(load), "the loader reads the address a walk-in left");
    // Run: keys that meet are one person; a walk-in with no keys is never anybody else.
    const visit = (...keys) => ({ how: "door", keys });
    assert.deepEqual(termModel.peopleAcross([{ counted: [visit("address:g")] }, { counted: [visit("account:g", "address:g")] }]), { people: 1, cameTwice: 1, unmatched: false });
    assert.deepEqual(termModel.peopleAcross([{ counted: [visit()] }, { counted: [visit()] }]), { people: 2, cameTwice: 0, unmatched: true });
  });

  test("counts only, on the page and in the file: nothing it hands on can name anybody, and the file is not a recorded download", () => {
    // "Totals": v15 leaves out v14's "never as who came to which events",
    // which it took back for admins (Attendance), but these totals still name
    // nobody, and the walk below holds them to it.
    assert.ok(PAGE_FLAT.includes("Admins also see totals across a term&apos;s events"));
    const view = termModel.buildTermView({
      label: "Autumn 2026",
      events: [
        {
          title: "VR games night",
          startAt: new Date("2026-11-01T14:00:00Z"),
          endsAt: new Date("2026-11-01T17:00:00Z"),
          noSignup: false,
          counted: [{ how: "qr", keys: ["account:amara", "address:amara@example.com"] }, { how: "door", keys: [] }],
          survey: { sent: true, answers: 3, average: 4.5 },
        },
      ],
      checkInSince: new Date("2026-11-01T14:05:00Z"),
      programmes: [],
    });
    const handedOn = JSON.stringify(view) + termTotals.termTotalsCsv(view);
    for (const bit of ["amara", "example.com", "account:", "address:"]) assert.ok(!handedOn.includes(bit), `what the page and file are handed holds "${bit}"`);
    // The file is a GET that writes nothing, and records no download: the
    // policy records the downloads that hold the most about people, and a file
    // of totals holds nobody.
    const route = withoutComments(read("src/app/api/surveys/term/totals/route.ts"));
    assert.ok(!/logExport|dataExports/.test(route), "the file of totals is now a recorded download, though it holds nobody: check it against the policy's Logs line");
    assert.match(route, /^export async function GET\(\)/m);
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: one person's answers, opened by an admin
// ---------------------------------------------------------------------------

/**
 * What the policy says about an admin opening one person's survey answers
 * (docs/surveys.md, "One person's answers"), held to the code that makes it
 * true: who may open them, the record written each time and what it holds,
 * and the record kept when names come off and when an account is deleted.
 * v7 spelled each of these out in one paragraph; v15 says them in three
 * places (Confidential, the Logs line, and what a deletion leaves), and
 * leaves out that the record is written before anything is read and names
 * the person by an id. The code checks of both stay below.
 * `tests/surveys-one-person.test.mjs` runs the route and the page as every
 * kind of caller; here each sentence is paired with a line of source that is
 * matched or a rule that is run.
 */
describe("one person's answers, opened by an admin", () => {
  /** v15's words for who sees one person's answers, the record of each opening, and how long it is kept. */
  const BULLET = [
    "Only NAISI&apos;s admins can see who said what, and we record each time one of them does.",
    "We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers,",
    "These record what staff did, not what you wrote, and are kept as long as we need them to look into problems and show we acted properly.",
    "the email log and suppression list; staff logs;",
  ];
  const saysBullet = () => {
    for (const sentence of BULLET) assert.ok(PAGE_FLAT.includes(sentence), `the policy no longer says: ${sentence}`);
  };

  test("the frozen v6 carries none of it", () => {
    for (const pattern of [/An admin can open one person&apos;s answers/, /whose they were, by an id and never by name/, /We keep that record when names come off/]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("an admin opens them, a programme's or an event's, on one page", () => {
    saysBullet();
    // Admins only: the route refuses a view-as session, then anybody but an admin, before the database.
    const route = withoutComments(read("src/app/api/surveys/[surveyId]/people/[who]/route.ts"));
    const guard = route.indexOf("const blocked = await assertNotImpersonating();");
    const refused = route.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
    const db = route.indexOf("getAdminDb()");
    assert.ok(guard > -1 && refused > guard && db > refused, "the opening route reaches the database before it refuses everybody but an admin");
    // The page is in the admins' tree, and reads the survey alone.
    assert.match(read("src/app/(app)/admin/(admin-only)/layout.tsx"), /await requireAdminPage\(\);/);
    assert.doesNotMatch(
      withoutComments(read("src/app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/[who]/page.tsx")),
      /personOnSurveys|eventPersonOn|openPersonAnswers|SURVEY_(?:ANSWERS|PEOPLE)_COLLECTION/,
      "the page reads something of the person without recording an opening",
    );
    // A programme's surveys together, or a survey after an event alone.
    const person = withoutComments(read("src/lib/surveys/onePerson.ts"));
    assert.match(person, /if \(isEventSurvey\(survey\)\) return \[survey\];/);
    assert.match(person, /\.filter\(\(each\) => !isEventSurvey\(each\) && isProgrammeAudience\(each\.audience, roundId, programmeId\)\)/);
  });

  test("each opening is recorded first, with who, whose by an id, which surveys and when, and never what they say", () => {
    saysBullet();
    const log = withoutComments(read("src/lib/firestore/recordOpenings.ts"));
    const writer = log.slice(log.indexOf("export async function openSurveyAnswersRecorded"));
    const created = writer.indexOf("await ref.create({");
    assert.ok(created > -1 && writer.indexOf("const value = await read();") > created, "the answers are read before the opening is recorded");
    const row = writer.slice(created, writer.indexOf("});", created));
    assert.deepEqual(
      [...row.matchAll(/^\s*(\.\.\.)?(\w+)(?=[:,])/gm)].map((m) => `${m[1] ?? ""}${m[2]}`),
      ["kind", "actorUid", "actorName", "...subject", "surveyId", "surveyIds", "openedAt"],
      "an opening of survey answers now keeps something more than who opened what and when, which is all the policy's Logs line says it records",
    );
    // Whose, by an id: an account's uid, or a guest's sign-up; never a name.
    assert.match(writer, /opening\.subject\.kind === "account" \? \{ subjectUid: opening\.subject\.uid \} : \{ subjectSignupId: opening\.subject\.signupId \}/);
    // Nothing of the person is read but inside the read the opening hands back, and nothing is shown when it is refused.
    const person = withoutComments(read("src/lib/surveys/onePerson.ts"));
    const recorded = person.indexOf("const opened = await openSurveyAnswersRecorded(");
    assert.ok(recorded > -1 && person.indexOf("() => readPerson(db, survey, shown, subject),") > recorded);
    assert.match(person, /if \(!opened\.ok\) return \{ kind: "not-recorded" \};/);
    assert.match(
      withoutComments(read("src/app/api/surveys/[surveyId]/people/[who]/route.ts")),
      /if \(opening\.kind === "not-recorded"\) return NextResponse\.json\(\{ error: PERSON_WORDS\.notRecorded \}, \{ status: 500 \}\);/,
    );
  });

  test("the record stays when names come off and when an account is deleted, as the record of downloads does", () => {
    saysBullet();
    // Nothing that takes names off, or deletes an account, names the log.
    for (const file of ["src/lib/firestore/accountDeletion.ts", "src/lib/surveys/namesOff.ts", "src/lib/scheduler/jobs/surveyNamesOff.ts"]) {
      assert.doesNotMatch(withoutComments(read(file)), /RECORD_OPENINGS_COLLECTION|["'`]recordOpenings["'`]/, `${file} now reaches the record of openings`);
    }
    // A run's destroy deletes the log's rows by run, and an opening of survey answers holds none.
    assert.match(read("src/lib/firestore/courseDeletion.ts"), /drainQuery\(db, RECORD_OPENINGS_COLLECTION, byRunId\(RECORD_OPENINGS_COLLECTION\), budget\)/);
    const log = withoutComments(read("src/lib/firestore/recordOpenings.ts"));
    const writer = log.slice(log.indexOf("export async function openSurveyAnswersRecorded"));
    assert.doesNotMatch(writer.slice(0, writer.indexOf("const value = await read();")), /runId/, "an opening of survey answers now names a run, so a run's destroy would take it");
    // The record of downloads is kept by both cascades, the same way.
    assert.doesNotMatch(withoutComments(read("src/lib/firestore/accountDeletion.ts")), /DATA_EXPORTS_COLLECTION|["'`]dataExports["'`]/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-one-person.test.mjs")));
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: the last pass before version 7 goes live
// ---------------------------------------------------------------------------

/**
 * Sentences made true, or added, in the last check of v7 against the code
 * before it went live, and held to v15's words since: when you are free,
 * once you hold a place, and the reminder to say it; a written answer before
 * it is sent; what the people in your pair see of you; and the record of an
 * admin opening somebody's sealed predictions or survey answers among the
 * staff logs a deletion leaves. Each is paired with a rule that is run or a
 * line of source that is matched, as the rest of §2g is.
 *
 * v15 leaves out changing when you are free after decision day and the
 * reminder to say it, so those two tests hold the code to the nearest words
 * v15 has (the versions it keeps, and an email that answers something you
 * did); v15's "A change counts only when you press Send again" is not true of
 * a changed week after decision day, which counts at once, and is reported.
 */
const standingRules = await loadTs("lib/applications/status/standing.ts");
const pairsModel = await loadTs("lib/courses/pairs/model.ts");
const writtenModel = await loadTs("lib/courses/writtenAnswers/model.ts");

describe("the last pass before version 7 goes live, held to v15", () => {
  // v7's own sentences, as the frozen versions carry them: v6 had none.
  const V7_SAID = [
    /If you are given a place on a fellowship, you can also change it on your application page from decision day until we email you your group\./,
    /Until then, if you have not said when you are free, the programme&apos;s lead or an admin may email you to ask, at most once a day, whatever your notification settings say\./,
    /It saves as you type, and until you send it, the others who read it see only that you have started it, never what it says\./,
    /When a session is in pairs, the people in your pair see your first name and, where the week asks, whether you are bringing a laptop\. They see nothing else about you\./,
    /each decision made about an application, the record of each time an admin opened somebody&apos;s sealed predictions or survey answers, and the record of the five downloads the site logs\./,
  ];
  /** A changed week after decision day: counts at once, until the group is told, keeping the version it replaces. */
  const FREE = "Once you hold a place on a fellowship, a change to when you are free counts at once, until we tell you your group, and we keep the version it replaces.";
  /** The rule it is the exception to, said just before it. */
  const SEND_AGAIN = "A change counts only when you press Send again; until then the people reading your application see what you last sent. Once you hold a place on a fellowship,";
  /** The class of email the reminder to say when you are free is: it answers the person's own application. */
  const REMIND = "Some answer something you did, such as a sign-up&apos;s confirmation, an application&apos;s receipt or a decision.";
  const DRAFT = "A written answer is yours until you send it: until then they see only that you have started it, never what it says,";
  /** Reflections and boxes have no Send: what is saved is what their readers read. */
  const AS_TYPED = "<strong>Changing your work.</strong> Your reflections and the boxes you fill in save as you type, and the people who read your work can read them as you write.";
  const PAIRS = "When a session is in pairs, your partner sees your first name and whether you are bringing a laptop.";
  const OPENINGS = [
    "We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers, and keep a log of decisions on applications.",
    "These record what staff did, not what you wrote, and are kept as long as we need them to look into problems and show we acted properly.",
    "the email log and suppression list; staff logs;",
  ];
  const says = (sentences) => {
    for (const sentence of [].concat(sentences)) assert.ok(PAGE_FLAT.includes(sentence), `the policy no longer says: ${sentence}`);
  };

  test("the frozen v6 carries none of v7's sentences, and frozen v14 still does", () => {
    for (const pattern of V7_SAID) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
      assert.ok(pattern.test(V14_FLAT), `v14 is frozen and no longer says ${pattern}`);
    }
  });

  // The list at the top of v7 is how a maintainer finds the code behind each
  // change from v6. It is held here as the last pass checked it: numbered in
  // order with no gap, every cross-reference naming an item that is there,
  // and every file it names in the tree (a bare file name somewhere under
  // src, as the items name a module beside the folder they gave).
  test("the list of changes from v6 is numbered in order, cross-refers to items that are there, and names files that exist", () => {
    // The list is v7's own, frozen with it; v8 carries its own short list above a copy.
    const V7 = read("src/content/legal/privacy/v7.tsx");
    const header = V7.slice(0, V7.indexOf("*/"));
    const numbers = [...header.matchAll(/^ \* {0,2}(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    assert.ok(numbers.length >= 38, "could not find the list of changes from v6");
    assert.deepEqual(numbers, numbers.map((_, at) => at + 1), "the list of changes from v6 skips or repeats a number");
    for (const [, refs] of header.matchAll(/\((\d+(?:(?:, | and )\d+)*)[,)]/g)) {
      for (const ref of refs.split(/, | and /).map(Number)) {
        assert.ok(ref >= 1 && ref <= numbers.length, `the list refers to item ${ref}, which it does not have`);
      }
    }
    const everyFile = textFilesUnder(SRC).map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"));
    for (const [, named] of header.matchAll(/`([^`\s]+\.(?:tsx?|mjs|md))`/g)) {
      const found = named.includes("/") ? existsSync(join(REPO_ROOT, named)) : everyFile.some((file) => file.endsWith(`/${named}`));
      assert.ok(found, `the list of changes from v6 names ${named}, which is not in the tree`);
    }
    for (const [, folder] of header.matchAll(/`((?:src|docs|tests)\/[^`\s]+\/)`/g)) {
      assert.ok(existsSync(join(REPO_ROOT, folder)), `the list of changes from v6 names the folder ${folder}, which is not in the tree`);
    }
  });

  test("when you are free changes from decision day, for a fellowship's place, until the group is emailed, at once and keeping the version it replaces", () => {
    says(FREE);
    // The exception to "A change counts only when you press Send again", said
    // straight after it: `changeSentAvailability` below writes what was sent,
    // for a fellowship's place, until Publish has told the person their group.
    says(SEND_AGAIN);
    const whenFree = withoutComments(read("src/lib/applications/status/whenFree.ts"));
    // A place, read from the person's own application; a fellowship's; shut once Publish has told them their group.
    assert.match(whenFree, /const standing = standingOf\(application\);\s*if \(standing\.kind !== "place" \|\| !standing\.programmeId\) return \{ open: false, why: "no-place" \};/);
    assert.match(whenFree, /if \(!programme \|\| programme\.kind !== "fellowship"\) return \{ open: false, why: "no-place" \};/);
    assert.match(whenFree, /if \(onRun\.kind !== "not-in-a-group"\) return \{ open: false, why: "told" \};/);
    // "From decision day": nothing is a place until an outcome is written, and
    // nothing is written before decision day ("Nothing early").
    assert.equal(standingRules.standingOf({ status: "submitted", result: null, invitation: null, attendance: null }).kind, "waiting");
    assert.equal(standingRules.standingOf({ status: "submitted", result: { kind: "accepted", programmeId: "agi" }, invitation: null, attendance: null }).kind, "place");
    assert.equal(
      standingRules.standingOf({ status: "submitted", result: { kind: "accepted", programmeId: "agi" }, invitation: null, attendance: { answer: "cant-make-it" } }).kind,
      "released",
      "somebody who gave the place back can still change when they are free",
    );
    // At once: written into what was sent, with no Send; the version it replaces kept as a send keeps one.
    const store = withoutComments(read("src/lib/applications/applicant/store.ts"));
    const change = /export async function changeSentAvailability\([\s\S]*?\n\}/.exec(store)?.[0] ?? "";
    assert.ok(change, "could not find the one writer of a changed week");
    assert.match(change, /const history = keepVersion\(/);
    assert.match(change, /"sent\.availability": next,/);
    assert.match(change, /sentHistory: history\.versions\.map\(/);
    // The one route that calls it, from the person's own application page.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bchangeSentAvailability\(/).filter((file) => file !== "src/lib/applications/applicant/store.ts"),
      new Map([["src/lib/applications/status/whenFree.ts", "the rule for changing when you are free after decision day, asked by the person's own route"]]),
      "changing a sent application's week",
      "The policy says somebody holding a place on a fellowship changes when they are free at once, until they are told their group. A new writer changes that sentence first.",
    );
  });

  test("the reminder to say when you are free: the programme's lead or an admin, a fellowship's people not yet told, at most once a day, whatever the settings say", () => {
    // v15 leaves this reminder out by name; it is an email that answers the
    // person's own application, which reaches them whatever their choices.
    says(REMIND);
    const route = withoutComments(read("src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind/route.ts"));
    // The lead or an admin, asked before anybody is read; a fellowship's alone.
    const gate = route.indexOf("const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);");
    const refused = route.indexOf('if (outcome.status === "not-yours") {');
    const people = route.indexOf("await loadProgrammePeople(db,");
    assert.ok(gate !== -1 && refused > gate && people > refused, "the reminder reads who to email before it refuses a reviewer");
    assert.match(route, /if \(programme\.kind !== "fellowship"\) \{/);
    // Who has not said when they are free: the People tab's own rows.
    assert.match(route, /people\.view\.rows\.filter\(\(row\) => rowMatches\(row, "not-said-free"\)\)/);
    assert.match(read("src/lib/applications/people/filters.ts"), /case "not-said-free":\s*return row\.category === "holding" && row\.free\.kind === "not-said";/);
    // Until their group is emailed; once a London day; the day claimed before the email goes.
    const remind = withoutComments(read("src/lib/courses/getReady/remind.ts"));
    assert.match(remind, /const told = notSaid\.filter\(\(_, at\) => isTold\[at\]\)\.map\(\(row\) => row\.uid\);\s*const open = notSaid\.filter\(\(_, at\) => !isTold\[at\]\);/);
    assert.match(remind, /return `freeremind__\$\{runId\}__\$\{uid\}__\$\{dateKey\}`;/);
    const claim = remind.indexOf("await ref.create({");
    const send = remind.indexOf("await sendEmail({");
    assert.ok(claim !== -1 && send > claim, "a reminder goes before the day's claim is made, so a second press could send it twice");
    assert.match(remind, /const dateKey = londonDateKey\(input\.now\);/);
    // Whatever the settings say: nothing here reads a notification choice.
    assert.ok(!/wantsEmailFor|addressesForSend|resolveCohortAudience|notifications|categories/.test(remind), "the reminder now reads a notification setting, though it answers the person's own application");
    // Its one sender is that route.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bsendFreeReminders\(/).filter((file) => file !== "src/lib/courses/getReady/remind.ts"),
      new Map([["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind/route.ts", "Remind on the programme's Overview, pressed by its lead or an admin"]]),
      "sending the reminder to say when you are free",
      "The programme's lead or an admin may email this reminder, as v14 said. A new sender checks the policy first.",
    );
  });

  test("a written answer saves as it is typed, and until it is sent its other readers see only that it has been started", () => {
    says(DRAFT);
    // v15 takes back part of this: if the week locks before somebody sends it, its readers may read it.
    // Built by the week you submit: `workIsReadable` (src/lib/courses/weekWork/model.ts), held above.
    says("never what it says, and if your week locks before you send it, they may then read what you wrote.");
    // Reflections and the boxes to fill in have no Send at all: each card
    // saves as it is typed, a reflection is stored as never sent, and the
    // group's page reads every saved reflection with no sent mark asked for.
    says(AS_TYPED);
    for (const card of ["src/features/courses/weekBlocks/ReflectStop.tsx", "src/features/courses/weekBlocks/FillInCard.tsx"]) {
      assert.match(read(card), /const saver = useDebouncedWrite\(/, `${card} no longer saves as it is typed`);
    }
    const reflection = withoutComments(read("src/app/api/courses/runs/[runId]/reflections/[promptId]/route.ts"));
    assert.match(reflection, /submittedAt: null,/, "a reflection now has a Send, so the policy's 'save as you type' and 'read as you write' need a look");
    const groupWeek = withoutComments(read("src/lib/courses/facilitatorWeek/readers.ts"));
    assert.match(groupWeek, /if \(!isReflectionResponse\(data\) \|\| data\.runId !== runId\) continue;/);
    assert.doesNotMatch(groupWeek, /submittedAt/, "the group's page now reads only reflections that were sent, which the policy says it reads as written");
    // Saved as it is typed: the words are written whatever the press, and only submitting the week stamps the first-sent time.
    const route = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts"));
    assert.match(route, /\} else \{\s*write\.text = text;/);
    assert.match(withoutComments(read("src/app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts")), /tx\.update\(answerRefs\[index\], \{ firstSentAt: at, submittedAt: at \}\);/);
    // A draft is a draft to its writer, run.
    const record = (over) => ({ text: "", boxes: null, words: 0, firstSentAt: null, editedAt: null, openedAt: null, openedByUid: "", savedAt: null, reopenedAt: null, reopenedByUid: "", feedback: null, ...over });
    assert.equal(writtenModel.answerState(record({ text: "Half a thought", words: 3 })), "draft");
    assert.equal(writtenModel.answerState(null), "not-started");
    assert.equal(writtenModel.answerState(record({ text: "Sent", words: 1, firstSentAt: new Date("2026-11-03T10:00:00Z") })), "sent");
    // The review page opens only an answer its readers may read, and the review route refuses feedback on any other.
    const page = withoutComments(read("src/lib/courses/writtenAnswers/reviewPage.ts"));
    assert.match(page, /const readable = \[\.\.\.toGive, \.\.\.feedbackSent\];/);
    assert.match(page, /\(askedPerson \? readable\.find\(\(person\) => person\.uid === askedPerson\) : undefined\) \?\? toGive\[0\] \?\? feedbackSent\[0\] \?\? null;/);
    assert.match(
      withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts")),
      /if \(record\.words === 0 \|\| !workIsReadable\(standing\.state, record\)\) \{\s*throw new ReviewError\("That answer hasn’t been submitted yet\.", 409\);/,
    );
    // This week's work says only that it is started ("Started", never its length), and links nothing to it.
    assert.match(
      withoutComments(read("src/lib/courses/facilitatorWeek/workColumns.ts")),
      /return \{ text: person\.state === "not-started" \? NOT_STARTED : STARTED, href: null \};/,
    );
  });

  test("the people in your pair see your first name and, where the week asks, whether you are bringing a laptop", () => {
    says(PAIRS);
    says("and your team sees that you are in it and what you write on its page. Nothing else.");
    // Run: a laptop is said only where the week asks.
    const people = [{ uid: "amara" }, { uid: "kofi" }];
    const entries = new Map([["amara", { pair: 1, laptop: true }], ["kofi", { pair: 1, laptop: false }]]);
    assert.deepEqual(pairsModel.pairsView(people, (uid) => entries.get(uid), true).pairs[0].laptops.map((person) => person.uid), ["amara"]);
    assert.deepEqual(pairsModel.pairsView(people, (uid) => entries.get(uid), false).pairs[0].laptops, [], "a laptop is said in a week that does not ask");
    // What a person is handed of their pair: their partners' first names, and which of them is bringing a laptop.
    const readers = withoutComments(read("src/lib/courses/pairs/readers.ts"));
    assert.match(readers, /partners: partners\.map\(\(person\) => person\.firstName\),/);
    assert.match(readers, /partnersBringing: pair \? pair\.laptops\.filter\(\(person\) => person\.uid !== actor\.uid\)\.map\(\(person\) => person\.firstName\) : \[\],/);
    const own = /export async function readOwnPairs\([\s\S]*?\n\}/.exec(readers)?.[0] ?? "";
    assert.ok(own, "could not find what a person is handed of their own pairs");
    assert.ok(!/fullName|email|person\.name\b/.test(own), "a person's own pairs now carry more of a partner than a first name");
  });

  test("the record of an admin opening somebody's sealed predictions or survey answers is a staff log a deletion leaves", () => {
    says(OPENINGS);
    // The two kinds, and nothing a record says in a row.
    assert.match(read("src/lib/firestore/recordOpenings.ts"), /export const RECORD_OPENING_KINDS: readonly RecordOpeningKind\[\] = \["sealed-predictions", "survey-answers"\];/);
    const log = withoutComments(read("src/lib/firestore/recordOpenings.ts"));
    const sealed = log.slice(log.indexOf("export async function openRecorded"), log.indexOf("export async function openSurveyAnswersRecorded"));
    const row = sealed.slice(sealed.indexOf(".create({"), sealed.indexOf("});", sealed.indexOf(".create({")));
    assert.deepEqual(
      [...row.matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]),
      ["kind", "actorUid", "actorName", "subjectUid", "runId", "openedAt"],
      "an opening of a sealed card now keeps something an audit record of what staff did does not",
    );
    // A deletion takes none, in either direction.
    assert.doesNotMatch(withoutComments(read("src/lib/firestore/accountDeletion.ts")), /RECORD_OPENINGS_COLLECTION|["'`]recordOpenings["'`]/);
  });
});

// ---------------------------------------------------------------------------
// §3 The re-consent gate
// ---------------------------------------------------------------------------

describe("the re-consent gate", () => {
  /**
   * Version 15 is the last version anybody is asked to accept: from it on,
   * the gate is `needsPolicyAcceptance` (`src/lib/legal/acceptance.ts`), which
   * asks an agreement that is missing, unreadable, names a version the site
   * never served, or is older than privacy v15 or the current terms, and
   * nothing else. `tests/policy-acceptance.test.mjs` runs it on a table,
   * including the day a later privacy version is served; here it is held to
   * where it runs and to what the policy and the accept page say.
   */
  const ACCEPTANCE = read("src/lib/legal/acceptance.ts");
  const COLLABORATOR_LAYOUT = read("src/app/collaborator/layout.tsx");
  const ACCEPT_PAGE = read("src/app/re-consent/page.tsx");
  /** A file's code with its comments taken out, so a note about the gate is not taken for the gate. */
  const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  test("lives on the shared authed layout, so every authed page passes it, and asks the helper", () => {
    const layout = codeOnly(AUTHED_LAYOUT);
    assert.match(layout, /import \{ needsPolicyAcceptance \} from "@\/lib\/legal\/acceptance";/);
    assert.match(layout, /needsPolicyAcceptance\(user\.policyVersion\)\s*\) \{\s*redirect\("\/re-consent"\);/);
    // The old rule, an exact match against the current version, would ask
    // everybody again at every later version, which v15 says we will not do.
    assert.doesNotMatch(layout, /CURRENT_POLICY_VERSION/, "the authed layout compares the current version again rather than asking the helper");
  });

  test("the collaborator's space asks the same helper, and the accept page sends home anybody it would not ask", () => {
    const collaborator = codeOnly(COLLABORATOR_LAYOUT);
    assert.match(collaborator, /import \{ needsPolicyAcceptance \} from "@\/lib\/legal\/acceptance";/);
    assert.match(collaborator, /needsPolicyAcceptance\(collaborator\.policyVersion\)\s*\) \{\s*redirect\("\/re-consent"\);/);
    assert.doesNotMatch(collaborator, /CURRENT_POLICY_VERSION/);
    // The accept page's "nothing to accept" door is the same rule, so the page
    // and the gates never disagree about who is asked.
    const page = codeOnly(ACCEPT_PAGE);
    assert.match(page, /if \(!needsPolicyAcceptance\(policyVersion\)\) redirect\(homeHref\);/);
    assert.doesNotMatch(page, /policyVersion === CURRENT_POLICY_VERSION/);
    // Every file that decides whether somebody is asked, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bneedsPolicyAcceptance\(/).filter((file) => file !== "src/lib/legal/acceptance.ts"),
      new Map([
        ["src/app/(app)/layout.tsx", "the member area's gate"],
        ["src/app/collaborator/layout.tsx", "an external collaborator's space's gate"],
        ["src/app/re-consent/page.tsx", "the accept page, which sends home anybody the gates would not send there"],
      ]),
      "deciding whether somebody is asked to accept the policies",
      "The policy says version 15 was asked once and later versions are told, not asked. A new place that asks has to ask on the same rule.",
    );
  });

  test("the rule: version 15 is the last asked, and what accepting stamps is never asked again", async () => {
    const acceptance = await loadTs("lib/legal/acceptance.ts");
    assert.equal(acceptance.LAST_PRIVACY_VERSION_ASKED, 15);
    assert.ok(currentPolicy("privacy").version >= acceptance.LAST_PRIVACY_VERSION_ASKED, "the last version asked is one the site does not serve yet");
    assert.equal(acceptance.needsPolicyAcceptance(CURRENT_POLICY_VERSION), false);
    for (const older of ["terms.1+privacy.14", "terms.1+privacy.1", undefined, null, "", "2026-01-01"]) {
      assert.equal(acceptance.needsPolicyAcceptance(older), true, `${String(older)} is not asked`);
    }
    // Pure, so either layout and the page may call it: no server-only import.
    assert.doesNotMatch(ACCEPTANCE, /["']server-only["']/);
    // Accepting still stamps the current version, and the coursework moment
    // with it the first time (src/lib/legal/courseworkUse.ts).
    const route = codeOnly(read("src/app/api/account/reconsent/route.ts"));
    assert.match(route, /policyVersion: CURRENT_POLICY_VERSION,\s*policyAgreedAt: FieldValue\.serverTimestamp\(\),/);
    assert.match(route, /\.\.\.courseworkUseStampFor\(snap\.exists \? \(snap\.data\(\) \?\? \{\}\) : null, CURRENT_POLICY_VERSION\),/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "policy-acceptance.test.mjs")), "tests/policy-acceptance.test.mjs runs the rule on a table");
  });

  test("the policy says this version was asked and later ones are told, and the gate asks on exactly the two layouts, never at sign-in", () => {
    // v15 says what the gate now does: asked once, at this version; later
    // changes told on the site and by email first. v14 said when somebody is
    // asked ("the next time you open the member area, or your collaborator
    // space"); v15 does not, and the walk below still holds where.
    assert.ok(
      PAGE_FLAT.includes(
        "You were asked to accept this version. If you decline it, you are signed out, and you can email us to have your account removed; an external collaborator can delete theirs there and then. We will not ask you to accept later versions.",
      ),
    );
    // Declining, as the accept page does it: a member presses "I don't
    // accept" and is signed out, and the page says to email us to delete the
    // account; the route refuses a member's own deletion and says to email us.
    const actions = withoutComments(read("src/app/re-consent/ReConsentActions.tsx"));
    assert.match(actions, /async function signOutOnly\(\) \{\s*setBusy\("decline"\);\s*try \{\s*await signOut\(\);/);
    assert.match(actions, /\{isMember \? \(\s*<Button variant="secondary" onClick=\{signOutOnly\} disabled=\{busy !== null\}>/);
    assert.match(actions, /If you don&apos;t accept, you&apos;ll be signed out\. To delete your\s+account, email\{" "\}/);
    const reconsent = withoutComments(read("src/app/api/account/reconsent/route.ts"));
    assert.match(
      reconsent,
      /if \(isMember\) \{\s*return NextResponse\.json\(\s*\{\s*error:\s*"Your account has a member profile, so it can't be self-deleted here\. You've been signed out; email ai-safety@uonsu\.com to have it removed\.",/,
    );
    // "An external collaborator can delete theirs there and then": the page
    // offers anybody without a member profile "Delete my account" behind a
    // second press, and the route deletes that account through the cascade
    // and clears its session, once it has refused a member.
    assert.match(actions, /\) : !confirmDelete \? \(\s*<Button\s*variant="secondary"\s*onClick=\{\(\) => setConfirmDelete\(true\)\}/);
    assert.match(actions, /<Button variant="danger" onClick=\{deleteAccount\} disabled=\{busy !== null\}>/);
    assert.match(actions, /body: JSON\.stringify\(\{ action: "delete" \}\),/);
    const refusedMember = reconsent.indexOf("so it can't be self-deleted here.");
    const deleted = reconsent.indexOf("const summary = await deleteAccountCascade(auth, db, uid);");
    assert.ok(refusedMember !== -1 && deleted > refusedMember, "the reconsent route deletes an account before it refuses a member");
    assert.equal((reconsent.match(/deleteAccountCascade\(/g) ?? []).length, 1, "the reconsent route deletes an account somewhere new");
    assert.match(reconsent, /const summary = await deleteAccountCascade\(auth, db, uid\);\s*await clearSessionCookieOnly\(\);/);
    // A collaborator's record is what the page is told: no member document, so the delete is theirs.
    assert.match(read("src/app/re-consent/page.tsx"), /const isMember = !collaborator;/);
    assert.ok(
      PAGE_FLAT.includes(
        "If a change affects how we use your information (a new use, a new outside service, or keeping something longer), we tell you on the site and by email before it takes effect, saying what changed.",
      ),
    );
    assert.ok(PAGE_FLAT.includes("<strong>Changes.</strong> If we change how we use your information, we tell you on the site and by email before the change takes effect."));
    assert.ok(!/asked to accept or decline it/.test(PAGE_FLAT), "the policy still says every material change is asked, which v15 took back");
    assert.ok(V14_FLAT.includes("you will be shown the new version and asked to accept or decline it"), "v14 is frozen and should still say what it promised");
    // Every place that asks, with comments left out so a note about the gate
    // is not taken for one. It is a layout each time, never a sign-in: the
    // member area's, and the space an external collaborator signs in to,
    // which is that person's member area.
    const asks = textFilesUnder(join(SRC, "app"))
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /redirect\("\/re-consent"\)/.test(codeOnly(readFileSync(file, "utf8"))))
      .map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"))
      .sort();
    assert.deepEqual(
      asks,
      ["src/app/(app)/layout.tsx", "src/app/collaborator/layout.tsx"],
      "somewhere new asks a member to accept a policy version, or one of the two layouts no longer does.",
    );
    // Signing in is not where it happens: neither sign-in route asks.
    for (const route of ["src/app/api/auth/session/route.ts", "src/app/(auth)/AuthEntry.tsx"]) {
      assert.ok(!/re-consent/.test(read(route)), `${route} now sends somebody to accept a new version at sign-in`);
    }
  });

  test("the accept page says what version 15 changes, each clause held to version 15's own sentence", () => {
    const accept = ACCEPT_PAGE.replace(/\s+/g, " ");
    const from = accept.indexOf("What changed in version 15.</strong>");
    assert.ok(from !== -1, "the accept page no longer says what version 15 changed");
    const said = accept.slice(from, accept.indexOf("Read the full", from));
    assert.ok(said.length > 1000, "could not find the accept page's paragraphs about version 15");
    for (const [what, page, policy] of [
      [
        "that it is arranged by use and the last version anybody is asked to accept",
        "This policy is now arranged by what we use your information for, and it is the last version you&apos;ll be asked to accept: from now on, if a change affects how we use your information, we&apos;ll tell you on the site and by email before it takes effect.",
        "You were asked to accept this version. If you decline it, you are signed out, and you can email us to have your account removed; an external collaborator can delete theirs there and then. We will not ask you to accept later versions.",
      ],
      [
        "the team's ratings of written work, never shown",
        "What&apos;s new: the people running a programme may rate your written work for each other, and you never see those ratings;",
        "The people running a programme may rate your written work and comment on it for each other, alongside the feedback you see. You are never shown these ratings or comments.",
      ],
      [
        "reminders before a session",
        "before a session we may remind you of what&apos;s left of that week&apos;s work;",
        "Before your group&apos;s session we may email you about what is left of that week&apos;s work.",
      ],
      [
        "notes by the people leading a programme",
        "the people leading your programme may keep notes about you, as admins already do;",
        "<strong>Notes about you.</strong> Admins, and the people leading a programme you are on, may keep notes about you,",
      ],
      [
        "facilitators' check-in totals",
        "facilitators may see their own group&apos;s check-in totals, never who said what;",
        "Facilitators may see their own group&apos;s check-in totals, never who said what and never the comments,",
      ],
      [
        "work read once a week locks",
        "and if your week locks before you send your work, the people running your group may read what you wrote.",
        "never what it says, and if your week locks before you send it, they may then read what you wrote.",
      ],
      [
        "Claude on coursework, surveys and reports, and the weekly note",
        "Claude may help admins review coursework, survey answers and session reports, and draft a short weekly note on how each person is doing from the work they submitted and the team&apos;s feedback.",
        "Admins may ask Claude to help review coursework, survey answers and session reports: to grade answers, pick out the strongest and weakest, and say what people found hard and who might need a hand.",
      ],
      [
        "never a name to Claude, and what comes back admins only",
        "It never receives your name, and only admins see what comes back.",
        "The tools receive the words with a number in place of each name, and no email address. What comes back is seen by admins only,",
      ],
      [
        "attendance, and two missed events",
        "Admins can see which events you signed up for and whether you came, and missing two in a row may be taken into account when places are decided.",
        "Missing two events in a row that you had a place at may be taken into account when places are decided.",
      ],
      [
        "what an event's organisers may see of a request for a place",
        "When you ask for a place at an event, its organisers may see whether you&apos;re on a programme, whether you facilitate, and whether you hold SU membership.",
        "The people organising an event may see who has asked for a place, with a few words about each: whether you are on a programme and in which group, whether you facilitate a group, and whether you hold SU membership.",
      ],
    ]) {
      assert.ok(said.includes(page), `the accept page no longer says v15 changed ${what}`);
      assert.ok(PAGE_FLAT.includes(policy), `the accept page says v15 changed ${what}, and v15 does not say it`);
    }
    // The weekly note is drafted from submitted work and the team's feedback.
    assert.ok(PAGE_FLAT.includes("Once a week Claude may also draft a short note on how each person is doing, using only the work they submitted and the feedback, ratings and comments people on the team gave it."));
    // "Only admins see what comes back" is the code's: Claude's best answers,
    // and Pangram on coursework, refuse anybody but an admin on the session.
    for (const route of [
      "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/best-answers/route.ts",
      "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/pangram/route.ts",
    ]) {
      const code = codeOnly(read(route));
      for (const handler of code.split(/export async function (?=GET|POST)/).slice(1)) {
        const refused = handler.indexOf("if (!canRunTerm(user)) return NextResponse.json(");
        assert.ok(refused !== -1, `${route} lets somebody other than an admin read what Claude or Pangram returned`);
        for (const later of ["ctx.params", "req.json()", "getAdminDb()"]) {
          const at = handler.indexOf(later);
          assert.ok(at === -1 || at > refused, `${route} reads ${later} before it refuses somebody other than an admin`);
        }
      }
    }
    // Version 15 replaces every earlier paragraph: nothing of 14's, 13's or 7's is left.
    for (const gone of ["Since version 14:", "Since version 13:", "What changed:</strong>", "the section on courses and programmes now covers"]) {
      assert.ok(!accept.includes(gone), `the accept page still carries "${gone}", which version 15's paragraphs replace`);
    }
    // A register's notes are not among what a lead reads, and the newsletter is unchanged: neither is said.
    assert.ok(!/notes facilitators write/i.test(said), "the accept page says a programme's lead sees the notes facilitators write on a register");
    assert.ok(!/newsletter/i.test(said), "the accept page says v15 changed something about the newsletter");
  });

  test("is not left behind on the dashboard layout alone", () => {
    // The old placement asked only members who opened /dashboard, which is
    // less than the policy page promises.
    const dashboardLayout = join(REPO_ROOT, "src/app/(app)/dashboard/layout.tsx");
    if (existsSync(dashboardLayout)) {
      assert.match(
        AUTHED_LAYOUT,
        /needsPolicyAcceptance\(user\.policyVersion\)/,
        "if a dashboard-level gate is reintroduced, the shared layout must " +
          "still hold one of its own",
      );
    }
  });

  test("keeps the deployed-builds-only condition", () => {
    assert.match(AUTHED_LAYOUT, /process\.env\.NODE_ENV === "production"/);
    assert.match(COLLABORATOR_LAYOUT, /process\.env\.NODE_ENV === "production"/);
  });

  test("never fires inside a view-as session", () => {
    // Accepting is recorded on the member's own doc, and view-as records it
    // as the member: an admin could otherwise stamp a consent the member
    // never gave.
    assert.match(AUTHED_LAYOUT, /!viewingAs &&\s*needsPolicyAcceptance\(user\.policyVersion\)/);
    const route = read("src/app/api/account/reconsent/route.ts");
    assert.match(route, /assertNotImpersonating\(\)/);
  });
});

// ---------------------------------------------------------------------------
// §4 The access-requirements read log: the promise, and the guard on it
// ---------------------------------------------------------------------------

/**
 * v4 tells an applicant, twice, that their access-requirements answer is
 * stored apart, is never scored, and that "every time one of them does we
 * record who read it". The in-form notice says the same thing on the page
 * where the answer is typed.
 *
 * The `access-requirements-read` audit kind in `CourseAuditKind` is what a
 * staff route that reveals the answer records each read under, so the
 * sentence is a promise about that route, which is exactly the shape of claim
 * a policy quietly breaks.
 *
 * This guard is what keeps it honest. It walks EVERY route file under
 * src/app/api and refuses one that reaches `admissionApplicationPrivate` (by
 * collection name, through the shared id helper, or through the apply tree's
 * shared context module, which addresses the collection on a route's behalf)
 * without also naming the audit kind. A reveal route that forgets the log
 * cannot ship, so the two always land together and the policy stays true.
 *
 * A route that only DELETES these rows should go through
 * `accountDeletion.ts` rather than naming the collection itself, which is
 * what the account-deletion cascade already does.
 *
 * ## The owner lane, and why it is exempt
 *
 * The promise the policy makes is about somebody ELSE reading the answer:
 * "only the person making the final decision and site admins can open it, and
 * every time one of them does we record who read it". The applicant's own
 * apply routes read the row back to put the applicant's own words in their own
 * textarea, which is not a disclosure to anybody and is not what the sentence
 * is about. Logging it would also drown the real audit: a two-minute autosave
 * writes and reads the row on every cycle, so one applicant writing an essay
 * would generate more rows than the whole decision week.
 *
 * The exemption is therefore a NAMED LIST, not a pattern. Each entry is a
 * route that may address the collection only in the owner's own lane, and
 * adding one is a decision somebody made rather than a wildcard a later route
 * slides through. Every entry is checked to still exist, so a rename shows up
 * here rather than silently widening the allowance.
 *
 * ## What "the owner's own lane" rests on, and the one thing that breaks it
 *
 * The whole exemption is the claim that the session the route reads from IS
 * the person whose answer it is. Admin "view as" is the one mechanism on this
 * site that makes that claim false: it swaps the `__session` cookie for the
 * TARGET's, so `getCurrentUser()` returns the member and the doc id the route
 * builds is the member's. Without a guard the owner lane would hand an admin
 * somebody's disability and health information with nothing recording the
 * read, and the exemption would be laundering exactly the disclosure the
 * policy sentence is about.
 *
 * So every entry below calls `assertNotImpersonating()` before it touches the
 * collection, and the test after this list checks that rather than trusting
 * the prose. The server-rendered `/apply/[roundId]` page is the same lane
 * without a route handler in it, and it answers the same question its own way:
 * it checks the marker and omits the private join, which is pinned in
 * `tests/admissions-apply-flow.test.mjs`.
 */
function routeFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routeFilesUnder(full, out);
    else if (/^route\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const REACHES_PRIVATE =
  /["'`]admissionApplicationPrivate["'`]|admissionApplicationPrivateId\b|admissions\/applyContext|applications\/(?:applicant|review)\/accessRequirements/;
const NAMES_AUDIT_KIND = /access-requirements-read/;

/**
 * Routes that may reach the collection WITHOUT a log, because they only ever
 * read the caller's own answer back to the caller. See the section comment.
 */
const OWNER_LANE = [
  [
    "src/app/api/admissions/rounds/[roundId]/apply/route.ts",
    "reads and writes the applicant's own access-requirements answer, addressed by their own uid, and shows it back to them in their own form; every handler including the GET refuses while a view-as session is live, so the session it reads from is always really the owner's",
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/apply/submit/route.ts",
    "re-reads the caller's own row after committing the submission, to answer with their own application, and refuses during a view-as session",
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/apply/stage/[stageId]/route.ts",
    "same, for one later-released stage, and refuses during a view-as session",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/application/access-requirements/route.ts",
    "the application form's own box: reads and saves the caller's own answer, addressed by their own uid, and both handlers, the GET included, refuse while a view-as session is live",
  ],
];

const OWNER_LANE_PATHS = new Set(OWNER_LANE.map(([file]) => file));

describe("the access-requirements read log", () => {
  const routes = routeFilesUnder(join(SRC, "app/api"));

  test("the walk found routes at all, so the guard below is not vacuous", () => {
    assert.ok(
      routes.length > 20,
      `only ${routes.length} route files found under src/app/api; the walk is broken`,
    );
  });

  test("the audit kind the policy promises exists in the enum", () => {
    const audit = read("src/lib/firestore/courseAudit.ts");
    assert.match(audit, NAMES_AUDIT_KIND);
  });

  test("every owner-lane exemption still exists and carries a reason", () => {
    for (const [file, reason] of OWNER_LANE) {
      assert.ok(
        existsSync(join(REPO_ROOT, ...file.split("/"))),
        `${file} is exempt from the access-requirements read log but no longer exists. Drop the entry.`,
      );
      assert.ok(
        typeof reason === "string" && reason.length > 20,
        `${file} is exempt with no reason a reader can weigh.`,
      );
    }
  });

  test("every owner-lane handler refuses a view-as session, reads included", () => {
    // The exemption's whole premise is that the session is the owner's. A
    // view-as session makes that false, so a handler in this lane that did not
    // guard would be an unlogged disclosure of the one answer the policy
    // singles out. READS are included deliberately: the private join is a
    // read, and it is the disclosure.
    for (const [file] of OWNER_LANE) {
      const src = readFileSync(join(REPO_ROOT, ...file.split("/")), "utf8");
      const handlers = [...src.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)];
      assert.ok(handlers.length > 0, `${file} exports no handlers the scan can see`);
      for (const match of handlers) {
        const window = src.slice(match.index, match.index + 500);
        assert.match(
          window,
          /assertNotImpersonating\(\)/,
          `${file} ${match[1]} is in the owner lane but does not refuse a view-as session at the top of the handler`,
        );
      }
    }
  });

  test("no route reaches admissionApplicationPrivate without logging the read", () => {
    const offenders = routes.filter((file) => {
      const relative = file.slice(REPO_ROOT.length + 1).split(sep).join("/");
      if (OWNER_LANE_PATHS.has(relative)) return false;
      const source = readFileSync(file, "utf8");
      return REACHES_PRIVATE.test(source) && !NAMES_AUDIT_KIND.test(source);
    });
    assert.deepEqual(
      offenders.map((f) => f.slice(REPO_ROOT.length + 1)),
      [],
      "these routes reach the access-requirements collection without naming " +
        "the `access-requirements-read` audit kind. The privacy policy and " +
        "the in-form notice both promise that every read of that answer is " +
        "recorded, so a route that reveals it without appending a courseAudit " +
        "row makes both pages false. Append the row in the same route, or " +
        "take the promise off the policy.",
    );
  });

  test("the promise is on the page and in the in-form notice", () => {
    assert.ok(
      PAGE_FLAT.includes("It is stored apart from your application, it is never scored, and it is never shown to reviewers or to a programme&apos;s lead. Only admins can open it, one application at a time, and we record each time one does."),
      "the policy no longer says only admins open an access-requirements answer and each opening is recorded",
    );
    assert.ok(PAGE_FLAT.includes("We also record each time an admin opened an access-requirements answer, sealed predictions or survey answers,"));
    const notice = read("src/features/admissions/ApplicationPrivacyNotice.tsx");
    assert.match(notice.replace(/\s+/g, " "), /We record each time one of them/i);
  });

  test("the older form's notice says who reads it and how it is reviewed in the policy's terms, and nothing the policy does not", () => {
    // Until November 2026 the in-form notice of the older kind of round said
    // reviewers scored applications without the applicant's name attached,
    // and that the person making the final decision could open the
    // access-requirements answer. The policy says neither, and the code does
    // neither. The box above the notice said the second as well.
    const flat = (path) => read(path).replace(/\s+/g, " ");
    const notice = flat("src/features/admissions/ApplicationPrivacyNotice.tsx");
    const box = flat("src/features/admissions/ApplyFlow.tsx");
    for (const [policy, form] of [
      [
        "They are students: admins and committee members the Students&apos; Union recognises.",
        "They are students: admins and committee members the Students&apos; Union recognises.",
      ],
      ["Where a programme uses scores, a reviewer may score your answers", "Where a programme uses scores, a reviewer may score your answers."],
      ["Reviewers may also comment on your answers", "Reviewers may also comment on them,"],
      [
        "it is never shown to reviewers or to a programme&apos;s lead. Only admins can open it,",
        "it is never shown to reviewers or to the programme&apos;s lead. Only admins can open it,",
      ],
    ]) {
      assert.ok(PAGE_FLAT.includes(policy), `the policy no longer says: ${policy}`);
      assert.ok(notice.includes(form), `the in-form notice no longer says: ${form}`);
    }
    assert.ok(box.includes("it is never shown to reviewers or to the programme&apos;s lead, and only admins can open it."), "the box's own note");
    for (const [file, text] of [["the notice", notice], ["the box", box]]) {
      for (const stale of [/without your name/i, /name attached/i, /person making the final decision/i, /site admins can open/i]) {
        assert.doesNotMatch(text, stale, `${file} says something the policy does not`);
      }
    }
  });
});

describe("a team's page", () => {
  /** v15's sentence about a team's page, whole. */
  const TEAM_PAGE = "Your team&apos;s page (its project, a weekly update, its links and its hand-in) is seen by your team, the lead and admins, and anybody in the team can change it.";

  test("each team has a page, which its people read and write and the programme's lead and admins read", () => {
    assert.ok(PAGE_FLAT.includes(TEAM_PAGE), "the policy no longer says who sees and changes a team's page");
    assert.ok(!/will have a page of its own/.test(PAGE_FLAT), "the policy says a team's page will exist, and it is built");
    const access = withoutComments(read("src/lib/courses/teamPage/access.ts"));
    // The team's people, told their team by its email, read and write it.
    assert.match(access, /export function toldTheirTeam\(team: TeamDoc, uid: string\): boolean/);
    assert.match(access, /export async function teamPagePerson\(/);
    // The lead and admins read every team's page and write none of it: the
    // writes take the one person the team gate hands them.
    const write = withoutComments(read("src/lib/courses/teamPage/write.ts"));
    for (const writer of ["saveCheckIn", "addLink", "removeLink", "saveHandIn"]) {
      assert.match(write, new RegExp(`export async function ${writer}\\(\\s*db: Firestore,\\s*person: TeamPagePerson`), writer);
    }
  });

  test("anybody in the team can change what is there: an entry has a last writer and no owner", () => {
    assert.ok(PAGE_FLAT.includes("and anybody in the team can change it."));
    const write = withoutComments(read("src/lib/courses/teamPage/write.ts"));
    // Every write records its writer, and none compares the writer with whoever wrote before.
    assert.equal((write.match(/byUid: person\.user\.uid,/g) ?? []).length, 3);
    assert.ok(!/\.byUid\s*(?:===|!==)/.test(write), "a team's page now lets only an entry's writer change it");
  });

  test("the hand-in says who handed it in; only the lead and admins see who last saved each check-in", () => {
    // v15 leaves out who handed in and who last saved: the page is seen by
    // the team, the lead and admins, and the code below still shows who saved
    // each week's update to the lead and admins alone.
    assert.ok(PAGE_FLAT.includes(TEAM_PAGE));
    const load = withoutComments(read("src/lib/courses/teamPage/load.ts"));
    // The hand-in's line names who handed it in, for the team as for the staff.
    assert.match(load, /handedIn: entry \? handedInDayWords\(saverName\(roster, entry\.byUid\),/);
    // The check-ins with who saved each are built for the staff's view alone.
    assert.match(load, /const checkIns: CheckInView\[\] = member\s*\? \[\]\s*: checkInsOf\(entries\)/);
    assert.match(load, /savedLine: savedWords\(saverName\(roster, entry\.byUid\),/);
  });

  test("what somebody wrote stays with the team when they leave, and loses their name with their account", () => {
    assert.ok(PAGE_FLAT.includes("The register keeps what it said about you up to then, with the day you left, and what you wrote stays in our records for the lead and admins."));
    assert.ok(PAGE_FLAT.includes("a pitch you sent with a partner, and what you wrote on your team&apos;s page, without your name;"), "the policy no longer says a deletion leaves what somebody wrote on their team's page, without their name");
    // Leaving touches no entry.
    assert.ok(
      !/courseTeamEntries|TEAM_ENTRIES_COLLECTION/.test(withoutComments(read("src/lib/courses/leaveRun.ts"))),
      "leaving now changes what somebody wrote on their team's page",
    );
    // A deletion takes the uid off every entry it saved last, and deletes none.
    const cascade = read("src/lib/firestore/accountDeletion.ts");
    assert.ok(cascade.includes("summary.courseTeamEntriesCleared = await clearCourseTeamEntries(db, uid);"));
    const clear = /export async function clearCourseTeamEntries[\s\S]*?\n\}/.exec(cascade)?.[0] ?? "";
    assert.match(clear, /\.where\("byUid", "==", uid\)/);
    assert.match(clear, /batch\.update\(doc\.ref, \{ byUid: null \}\)/);
    assert.ok(!/\.delete\(/.test(clear), "the deletion now removes what somebody wrote on a team's page");
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: comments ticked to be quoted
// ---------------------------------------------------------------------------

/**
 * Every survey's confidential box says "Totals, and comments you tick to be
 * quoted, may go in reports to the committee and our funder, Kairos, or on our
 * site." Until 26 October 2026 no form drew a box to tick, so the sentence
 * promised a tick nobody could give. It is held here to the code that makes
 * it true: the box at the top says it on every survey whose form draws "You
 * can quote this, without my name" under each long answer, and on no other,
 * and the tick is kept with the answer it is under and nowhere else.
 * `tests/surveys-quote-tick.test.mjs` drives the forms and the answer routes.
 */
describe("comments ticked to be quoted", () => {
  const BOX = "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.";

  test("the box at the top says it on exactly the surveys whose form draws the tick under each long answer, unticked", () => {
    for (const kind of [...surveyTemplates.SURVEY_TEMPLATES, "event"]) {
      const box =
        kind === "event"
          ? eventSurveyWords.eventBoxPoints({ namesOffOn: "2028-11-01", signedInAs: null, came: true }).points
          : surveyWords.confidentialPoints({ stage: kind, leadName: null, facilitatorNames: null, namesOffOn: "2028-12-09", programmeKind: "fellowship" }).points;
      assert.equal(box.includes(BOX), surveyRecords.asksQuotes({ kind }), `${kind}: the box and the tick disagree`);
    }
    // The answer page asks the one decision for each long answer.
    const view = withoutComments(read("src/lib/surveys/answerView.ts"));
    assert.match(view, /const quotes = asksQuotes\(survey\);/);
    assert.match(view, /quote: quotes && isQuotable\(item\),/);
    assert.equal(surveyItems.isQuotable({ kind: "question", id: "q", type: "longText", title: "x", body: [], required: false }), true);
    assert.equal(surveyItems.isQuotable({ kind: "question", id: "q", type: "shortText", title: "x", body: [], required: false }), false);
    // The form draws the box under it, in the board's words, unticked.
    const form = withoutComments(read("src/features/surveys/answer/SurveyForm.tsx"));
    const drawn = form.slice(form.indexOf("{question.quote && ("), form.indexOf("{question.quote && (") + 400);
    assert.match(drawn, /<OptionRow plain type="checkbox" name=\{quoteField\(question\.id\)\} value="yes" description=\{ANSWER_WORDS\.quoteLine\}>/);
    assert.ok(!/defaultChecked|checked=/.test(drawn), "the box starts ticked");
    assert.equal(surveyWords.ANSWER_WORDS.quote, "You can quote this, without my name");
  });

  test("the tick is kept with the answer it is under, only where the box was drawn", () => {
    const items = surveyTemplates.templateItems("after", "fellowship", null);
    const ticked = { q_a5: { type: "text", text: "It changed my plans.", quote: true } };
    assert.deepEqual(surveyItems.readSurveyAnswers(items, ticked, { quotes: true }).answers.q_a5, { type: "text", text: "It changed my plans.", quote: true });
    assert.equal(surveyItems.readSurveyAnswers(items, ticked, { quotes: false }).problems.length, 1, "a tick is kept where no box was drawn");
    // Both writers of an answer read the tick by the survey's own decision.
    for (const file of ["src/lib/surveys/answer.ts", "src/lib/surveys/events/store.ts"]) {
      assert.match(withoutComments(read(file)), /readSurveyAnswers\(survey\.items, input\.raw, \{ quotes: asksQuotes\(survey\) \}\)/, file);
    }
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-quote-tick.test.mjs")));
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: public numbers
// ---------------------------------------------------------------------------

/**
 * What the policy says about the box under a long answer and about publishing
 * a programme's numbers and quotes on its page, held to the code that makes
 * each sentence true: which surveys draw the box and where the tick is kept,
 * what is read to make the numbers and what is never read, that only a ticked
 * comment can be published and then with the term and no name, that the
 * record holds nobody, that only Take it down deletes it and nothing else
 * does, an account's deletion included. First said by v7; v15 says it in one
 * paragraph ("Quoting you, and what we publish"), its consent line and what a
 * deletion leaves, and leaves out which surveys are never published from, how
 * long a published block stays and that publishing again replaces it. The
 * code checks of those stay below.
 * `tests/surveys-quote-tick.test.mjs`, `tests/surveys-public-numbers.test.mjs`
 * and `tests/public-numbers-last-term.test.mjs` drive the forms, the routes
 * and both pages as every kind of caller.
 */
const publicOffer = await loadTs("lib/surveys/publicNumbers.ts");
const publicRecord = await loadTs("lib/publicNumbers/model.ts");

describe("public numbers", () => {
  const BOX = "<strong>Quoting you, and what we publish.</strong> Under a long answer there may be a box saying &quot;You can quote this, without my name&quot;, which starts unticked.";
  const PUBLISH =
    "NAISI&apos;s admins may publish, on a programme&apos;s page, numbers from that programme&apos;s own surveys, with how many people answered, and comments whose writers ticked that box, each with the term and no name. An admin can take them down at any time, and will if you email us.";
  const BASIS = "<strong>Consent</strong> for the newsletter, event announcements, notifications on your devices, follow-up surveys and quoting a comment of yours.";
  const LEFT = "a comment of yours quoted without your name (email us and we will take it down);";

  /** AGI Strategy's two surveys with one ticked comment and one not, as the offer reads them. */
  const offerOf = () =>
    publicOffer.buildOffer({
      kind: "fellowship",
      term: "Autumn 2026",
      surveys: [
        {
          stage: "after",
          items: surveyTemplates.templateItems("after", "fellowship", null),
          sent: 3,
          answers: [
            { id: "a1", uid: "amara", answers: { q_q1: { type: "scale", value: 10 }, q_a5: { type: "text", text: "Ticked words.", quote: true } } },
            { id: "a2", uid: "bea", answers: { q_q1: { type: "scale", value: 7 }, q_a5: { type: "text", text: "Unticked words." } } },
          ],
        },
      ],
    });

  test("the frozen v6 carries none of these sentences", () => {
    for (const pattern of [/You can quote this, without my name/, /how its last term went/, /What we publish from a programme/, /A comment of yours quoted on a programme/, /Quoting a comment of yours on our site/]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("the box: on a programme's surveys and the survey after an event, unticked, kept with its answer; none on the survey about leaving", () => {
    assert.ok(PAGE_FLAT.includes(BOX), "the policy no longer says what the box under a long answer says, unticked");
    // v15 says the box "may be" there; which surveys draw it, and that the
    // tick is kept with its answer, are the code's below.
    for (const kind of [...surveyTemplates.SURVEY_TEMPLATES, "event"]) {
      assert.equal(surveyRecords.asksQuotes({ kind }), kind !== "leaving", kind);
    }
    // Under a long answer and no other.
    assert.match(withoutComments(read("src/lib/surveys/items.ts")), /export function isQuotable\(question: SurveyQuestion\): boolean \{\s*return question\.type === "longText";\s*\}/);
    // "It cannot change once you send them": an answer is kept once, and the
    // tick inside it, by the one writer of a programme survey's answers.
    const answer = withoutComments(read("src/lib/surveys/answer.ts"));
    assert.match(answer, /if \(person\.answered\) return \{ ok: false, status: 409, error: REFUSAL\.answered \};/);
    assert.match(answer, /tx\.set\(answerRef, \{/);
    assert.ok(!/tx\.update\(answerRef/.test(answer), "a kept answer, and the tick in it, can now change");
  });

  test("what may be published: numbers from the programme's own surveys with how many answered, ticked comments with the term and no name, nothing else", () => {
    assert.ok(PAGE_FLAT.includes(PUBLISH), "the policy no longer says what may be published on a programme's page");
    // v15 leaves out that nothing comes from the survey about leaving, an
    // event's survey or the anonymous form; the load below still reads only
    // the programme's own stage surveys, and the leaving survey draws no box.
    // Its own surveys alone: a stage survey of that programme, never the leaving survey or an event's.
    const load = withoutComments(read("src/lib/surveys/publicNumbersLoad.ts"));
    assert.match(load, /for \(const stage of SURVEY_STAGES\) \{/);
    assert.match(load, /\.filter\(\(each\) => each\.kind === stage && isProgrammeAudience\(each\.audience, programme\.roundId, programme\.programmeId\)\)/);
    assert.ok(!/anonymousFeedback|programmeRatings|kairos|events\//i.test(load), "public numbers now read something besides the programme's own surveys");
    assert.ok(!surveyTemplates.SURVEY_STAGES.includes("leaving"));
    // With how many people answered them: the closing line, and every number's base for the admin.
    const offer = offerOf();
    assert.equal(offer.footer, "From the fellowship’s own surveys, autumn 2026: 2 of 3 fellows answered at the end.");
    assert.ok(offer.numbers.every((number) => /^From (the )?\d+ /.test(number.base)), "a number is offered without its base");
    // A ticked comment alone, its words and the term, no name.
    assert.deepEqual(offer.quotes.map((quote) => quote.text), ["Ticked words."]);
    assert.deepEqual(publicOffer.publishedFrom(offer, { numbers: [], quotes: ["a2.q_a5"] }), { ok: false, why: "changed" }, "an unticked comment can be published");
    assert.equal(offer.attribution, "Autumn 2026 fellow");
    // The record keeps exactly what is published, and nobody.
    const route = withoutComments(read("src/app/api/surveys/public-numbers/route.ts"));
    const kept = /\.set\(\{([\s\S]*?)\}\);/.exec(route);
    assert.ok(kept, "could not find what Publish keeps");
    assert.deepEqual(
      [...kept[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((field) => field[1]),
      ["roundId", "programmeId", "courseId", "term", "lastSessionOn", "heading", "numbers", "quotes", "attribution", "footer", "publishedAt", "publishedByUid"],
      "what is published now keeps something more than the numbers, the ticked words and the term the policy says it may",
    );
    assert.deepEqual(
      publicOffer.publishedFrom(offer, { numbers: ["recommend"], quotes: ["a1.q_a5"] }).block.quotes,
      [{ text: "Ticked words." }],
      "a published quote keeps more than its words",
    );
    // The page draws the block's fields and nothing else of the record.
    assert.deepEqual(Object.keys(publicRecord.blockOf(publicRecord.normalizePublicNumbers("r", { heading: "h", quotes: [{ text: "q" }] }))).sort(), ["attribution", "footer", "heading", "numbers", "quotes"]);
    assert.match(read("src/lib/publicNumbers/fetch.ts"), /return latest \? blockOf\(latest\) : null;/);
  });

  test("the legal basis for a quote is the tick, and only a ticked comment is ever offered", () => {
    assert.ok(PAGE_FLAT.includes(BASIS), "the policy no longer says quoting a comment rests on consent");
    assert.ok(PAGE_FLAT.includes("You can withdraw it at any time from your profile, through the link in the email, or by emailing us."));
    assert.match(withoutComments(read("src/lib/surveys/publicNumbers.ts")), /if \(!given \|\| given\.type !== "text" \|\| given\.quote !== true\) continue;/);
  });

  test("how long it stays: until an admin takes it down or publishes again; nothing else deletes it, an account's deletion included", () => {
    // v15 leaves out how long a published block stays; it says an admin can
    // take it down, and that a deletion leaves a quoted comment.
    assert.ok(PAGE_FLAT.includes("An admin can take them down at any time, and will if you email us."));
    assert.ok(PAGE_FLAT.includes(LEFT), "the policy no longer says a deletion leaves a quoted comment, without the name");
    // Every file that names the record, and why.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bPUBLIC_NUMBERS_COLLECTION\b|["'`]publicNumbers["'`]/),
      new Map([
        ["src/lib/publicNumbers/model.ts", "the record's own name and shape"],
        ["src/lib/publicNumbers/fetch.ts", "the public page's read, one equality on courseId, projected to the block's fields"],
        ["src/lib/surveys/publicNumbersLoad.ts", "the admins' page reads what is published for a programme"],
        ["src/app/api/surveys/public-numbers/route.ts", "Publish: an admin's, replacing the programme's record whole"],
        ["src/app/api/surveys/public-numbers/take-down/route.ts", "Take it down: an admin's, the one delete"],
      ]),
      "naming the public numbers record",
      "The policy says an admin can take the numbers and quotes down, and that a deletion leaves a quoted comment: a new reader, writer or deleter checks those sentences first.",
    );
    const publish = withoutComments(read("src/app/api/surveys/public-numbers/route.ts"));
    assert.ok(!/\.delete\(|merge: true/.test(publish), "Publish now deletes, or merges into what was published");
    assert.match(withoutComments(read("src/app/api/surveys/public-numbers/take-down/route.ts")), /await ref\.delete\(\);/);
    // An account's deletion has nothing of it to find: the record holds no respondent.
    assert.ok(!/publicNumbers|PUBLIC_NUMBERS/.test(read("src/lib/firestore/accountDeletion.ts")), "an account's deletion now reaches what was published");
  });
});

// ---------------------------------------------------------------------------
// §2h The second reader: what v8 says about Claude and Pangram is the code's
// ---------------------------------------------------------------------------

/**
 * The sections from here on were written, one version each, as "what vN adds
 * is the code's": each held the sentences a version added, said that the
 * version before did not say them, and held the code behind them. v15 says
 * all of it again in fewer words (AI-assisted review, Applying to a
 * programme, Services we use), so each section now does two things. It holds
 * what the version added to the frozen file that added it, and to the one
 * before it that did not, which is the record of when each promise was first
 * made. And it holds v15's own words for each of those promises, beside the
 * code checks that were already here. Where v15 leaves a detail out, the pair
 * says so in a comment and its code check stays.
 */
/** What a version added, held both ways in the frozen files: in the version, and not in the one before. */
function addedBy(version, sentences, now, before) {
  for (const sentence of sentences) {
    assert.ok(now.includes(sentence), `v${version} is frozen and should still say: ${sentence}`);
    assert.ok(!before.includes(sentence), `v${version - 1} already said it, so it is not v${version}'s: ${sentence}`);
  }
}
/** Each of v15's sentences, whole, in the policy as served. */
function v15Says(sentences) {
  for (const sentence of [].concat(sentences)) assert.ok(PAGE_FLAT.includes(sentence), `v15 no longer says: ${sentence}`);
}
/** The outside services' page, which names the processors v8 first named. */
const outsideServices = (await loadTs("content/legal/services.ts")).OUTSIDE_SERVICES;

describe("v8 named Claude and Pangram on applications; v15 says it, and the code agrees", () => {
  // Each line v8 added, then v15's words for the same promise.
  const SAID = [
    [
      "An admin can ask Claude, an AI model made by Anthropic, to read your application together with the reviewers&apos; scores and comments and write a short assessment of it, and to compare those assessments across the applications to the same programme.",
      [
        "<strong>Claude</strong>, an AI model made by Anthropic, can read, compare, summarise and draft.",
        "An admin may ask Claude to read an application, first on its own and then with the reviewers&apos; scores and comments, and write a short assessment; to compare the applications to a programme;",
      ],
    ],
    // v15 leaves out that a comparison is not kept; nothing in askAboutProgramme
    // (src/lib/applications/assessment/run.ts) writes, and v15's "kept with
    // what it was about" allows more than that.
    ["A comparison across a programme is shown to the admin who asked and is not kept.", ["What comes back is seen by admins only,"]],
    // choiceInputFrom (src/lib/applications/arrange/advice.ts) sends group
    // labels, never a week. v15 leaves out that the site checks each
    // suggestion against those times.
    [
      "Claude is told which of the proposed groups&apos; session times each person can make, never the times you marked, and the site checks every suggestion against those times.",
      ["For groups, Claude is told which of the proposed times each person can make, never the times you marked."],
    ],
    // Nothing in src/lib/applications/arrange/ writes; Apply is the admin's press.
    [
      "An admin decides, and nobody is placed until they apply it.",
      ["Groups are made from the times people gave, and a person places everybody.", "What Claude or Pangram says is one view a person weighs, and nothing is done because of it alone."],
    ],
    // PANGRAM_MIN_WORDS in src/lib/ai/pangram.ts: v15 says "longer answers", and the threshold is held below.
    ["those of 50 words or more, and nothing shorter.", ["An admin may ask Pangram to check an application&apos;s longer answers."]],
    // src/lib/applications/assessment/input.ts takes these out.
    [
      "What is sent leaves out your name, your email addresses, your access-requirements answer and your answer about Students&apos; Union membership, and names each reviewer only by a letter.",
      ["What is sent leaves out your name, your email addresses, your access requirements and your answer about SU membership; each applicant is a number and each reviewer a letter."],
    ],
    // canRunTerm in src/lib/applications/assessment/run.ts.
    ["Only admins see what comes back.", ["What comes back is seen by admins only, and is a reason for a person to look, never a decision about you."]],
    // The account deletion and the form destroy take it in the application's batch.
    [
      "What comes back is kept with your application, is deleted with it, and is never copied to your member record.",
      [
        "It is kept with what it was about (the application, or the programme&apos;s run) and deleted with it. Nothing of it is filed on your profile, except a note an admin has read, edited and saved, which says it was drafted by Claude.",
      ],
    ],
    ["<strong>Anthropic</strong> provides Claude", ["<strong>Claude</strong>, an AI model made by Anthropic,"]],
    ["<strong>Pangram Labs</strong> checks the longer answers on an application", ["<strong>Pangram</strong>, from Pangram Labs, estimates whether writing was produced with AI."]],
  ];

  test("v8, frozen, added these sentences, and v7 did not", () => {
    addedBy(8, SAID.map(([v8]) => v8), V8_FLAT, V7_FLAT);
  });

  for (const [v8, v15] of SAID) {
    test(`v15 says what v8 said: ${v8.slice(0, 60)}`, () => v15Says(v15));
  }

  test("the two processors are on the services page, with what each receives", () => {
    v15Says("We use the outside services listed on{\" \"} <a href={SERVICES_HREF}>Services we use</a> to run the site, each with what it receives.");
    const byName = new Map(outsideServices.map((service) => [service.name, service]));
    assert.equal(byName.get("Anthropic")?.does, "Provides Claude (see AI-assisted review).");
    assert.equal(
      byName.get("Anthropic")?.receives,
      "It receives what is sent for each request, with no name or email address in it, and does not use it to train its models.",
    );
    assert.equal(byName.get("Pangram Labs")?.does, "Provides Pangram (see AI-assisted review).");
    assert.equal(byName.get("Pangram Labs")?.receives, "It receives the words of the answers it checks and nothing else.");
  });

  test("the policy's longer answers are the code's 50 words", () => {
    const pangram = read("src/lib/ai/pangram.ts");
    assert.match(pangram, /export const PANGRAM_MIN_WORDS = 50;/);
  });
});

// ---------------------------------------------------------------------------
// §2i The whole term at once: what v9 adds is the code's
// ---------------------------------------------------------------------------

describe("v9 said Claude reads blind first and may plan the whole term; v15 says it, and the code agrees", () => {
  const SAID = [
    // askForClaudeRead in src/lib/applications/assessment/claudeRead.ts: the
    // blind pass, then the second. v15 leaves out that the first view is kept
    // beside the second.
    [
      "Claude reads your application first on its own, and only then with the reviewers&apos; scores and comments, and its first view is kept beside the second.",
      ["An admin may ask Claude to read an application, first on its own and then with the reviewers&apos; scores and comments, and write a short assessment;"],
    ],
    // loadIntake (src/lib/applications/intake/load.ts) refuses once decisions have gone out.
    [
      "Before decision day, an admin can also ask Claude to look across every programme at once and suggest who might suit which programme they ranked, and who would make a good facilitator, including people who did not offer to facilitate.",
      ["before decision day, to suggest who might suit which of the programmes they ranked and who would make a good facilitator, including people who did not offer;"],
    ],
    // intakeInputFrom (src/lib/applications/intake/advice.ts) labels people
    // "Applicant N". v15 leaves out the list of what Claude is told.
    [
      "For that, Claude is told each applicant&apos;s ranking, each programme&apos;s decision on them so far, the reviewers&apos; scores, its own earlier assessments and whether they offered to facilitate, under a number and never a name.",
      ["each applicant is a number and each reviewer a letter."],
    ],
    // Nothing in src/lib/applications/intake/ writes; Apply is the admin's press, through the decision route.
    [
      "Nothing changes until an admin applies the plan, and somebody who did not offer to facilitate is only ever asked.",
      [
        "What Claude or Pangram says is one view a person weighs, and nothing is done because of it alone.",
        "We may ask you to facilitate a group: because you said you would like to, or, if you hold a place, because an admin thinks you would be good at it.",
      ],
    ],
  ];

  test("v9, frozen, added these sentences, and v8 did not", () => {
    addedBy(9, SAID.map(([v9]) => v9), V9_FLAT, V8_FLAT);
  });

  for (const [v9, v15] of SAID) {
    test(`v15 says what v9 said: ${v9.slice(0, 60)}`, () => v15Says(v15));
  }

  test("nothing under src/lib/applications/intake/ writes to the database but a suggestion, and the decisions an admin places", () => {
    // run.ts keeps each person's suggestion with their application (on the
    // assessment document, as a read is kept), and only that field.
    const run = read("src/lib/applications/intake/run.ts");
    assert.match(run, /batch\.set\(\s*db\.collection\(ASSESSMENTS_COLLECTION\)[\s\S]*?\{ roundId, uid, suggestion \},\s*\{ merge: true \},?\s*\)/);
    assert.equal((run.match(/\.batch\(\)/g) ?? []).length, 1);
    // placement.ts writes decisions only through the decision route's own writer, as the admin who pressed.
    const placement = read("src/lib/applications/intake/placement.ts");
    assert.ok(!/\.doc\([^)]*\)\s*\.(set|update|create|delete)\(|\.batch\(\)|runTransaction|FieldValue/.test(placement), "placement.ts writes by itself");
    assert.match(placement, /decideApplication\(db, user, roundId, uid, \{/);
    for (const file of ["load.ts", "advice.ts", "match.ts", "suggestion.ts"]) {
      const source = read(`src/lib/applications/intake/${file}`);
      // A Firestore write, not a Map's `.set`: a document's write, a batch, a transaction or a sentinel.
      assert.ok(
        !/\.doc\([^)]*\)\s*\.(set|update|create|delete)\(|\.batch\(\)|runTransaction|FieldValue/.test(source),
        `intake/${file} writes`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §2j Confirming a place, and being asked when you did not offer: v10's words are the code's
// ---------------------------------------------------------------------------

describe("v10 said how a place is confirmed and that somebody who did not offer may be asked; v15 says it, and the code agrees", () => {
  const SAID = [
    // placeConfirmBy on the form; "I'm coming" is the reply that confirms (src/lib/applications/status/confirming.ts).
    [
      "We may ask everybody holding a place to confirm it by a day, by pressing “I’m coming” on their application page.",
      ["If you are invited, or hold a place, we may ask you to reply or confirm by a day, and email you a reminder once a day until you do."],
    ],
    // confirmationReminderDue: once a day, up to the day; the job reads the courses row.
    [
      "Until you do, we may email you a reminder once a day, up to that day.",
      ["and email you a reminder once a day until you do. Switching off course announcement emails on your profile stops these reminders."],
    ],
    // confirmReminderOn on the application, written only by the job. v15
    // leaves out that the last reminder's day is recorded.
    [
      "We record the date of the last one on your application. If the day passes and you have not confirmed, nothing happens by itself: your place is still yours,",
      ["If the day passes, nothing happens by itself: your place stays yours until a person decides to offer it to somebody else."],
    ],
    // Nothing writes a place after the day: the People tab says so, and Remove is a person's press.
    [
      "They may then take you off the programme so that your place can be offered to somebody else, and a person decides that.",
      ["your place stays yours until a person decides to offer it to somebody else."],
    ],
    // loadCasePeople: holding a place, did not offer; an admin's alone (act.ts, CASE_ADMINS_ONLY).
    [
      "If you hold a place and did not say you would like to facilitate, an admin may still ask you to facilitate one of its groups, in the same way and with the same record, adding a sentence of their own on why we think you would be good at it.",
      [
        "or, if you hold a place, because an admin thinks you would be good at it.",
        "We keep a record of each ask (who asked, when, for which group, your answer and when, and a copy of the email) without your email address;",
      ],
    ],
    // The ask's `case` field. v15 leaves out that a reminder says it again.
    ["That sentence is part of the email, and is kept with the ask so that a reminder can say it again.", ["and a copy of the email) without your email address;"]],
  ];

  test("v10, frozen, added these sentences, and v9 did not", () => {
    addedBy(10, SAID.map(([v10]) => v10), V10_FLAT, V9_FLAT);
  });

  for (const [v10, v15] of SAID) {
    test(`v15 says what v10 said: ${v10.slice(0, 60)}`, () => v15Says(v15));
  }

  test("nothing writes a place because a day to confirm by passed", () => {
    for (const file of ["src/lib/applications/status/confirming.ts", "src/lib/scheduler/jobs/applicationPlaceConfirmations.ts"]) {
      const source = read(file);
      assert.ok(!/attendance|status:|withdrawn|givePlaceBack/.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/"attendance"/g, "")), `${file} changes a place`);
    }
    const job = read("src/lib/scheduler/jobs/applicationPlaceConfirmations.ts");
    assert.deepEqual([...job.matchAll(/tx\.update\(ref, \{ (\w+):/g)].map((m) => m[1]), ["confirmReminderOn", "confirmReminderOn"]);
  });
});

// ---------------------------------------------------------------------------
// §2k A personal note with an invitation: v11's words are the code's
// ---------------------------------------------------------------------------

describe("v11 said an invitation may carry a note an admin saved, which Claude may have drafted; v15 says it, and the code agrees", () => {
  const SAID = [
    // PooledOutcome.note, under the invitation's first paragraph (emailCopy.ts withNote).
    [
      "If you are invited to a programme you did not rank, an admin may add a few sentences of their own to the invitation email on why we think that programme suits you, drawn from your application.",
      ["Claude may draft a few sentences that an admin then sends you: a note in an invitation to a programme you did not rank,"],
    ],
    // inviteNote.ts: the application alone (assessment/run.ts applicationAlone) and the programmes' descriptions.
    [
      "For that, Claude is sent your application alone, as for its first reading, with the descriptions of the programmes, and never the reviewers&apos; scores or comments.",
      ["For these Claude is sent your application alone, with the programme&apos;s description, and never the reviewers&apos; scores or comments or the times you marked."],
    ],
    // inviteDraft on the assessment document; setInviteNote is the only writer of the note.
    [
      "Claude&apos;s draft is shown only to admins and is never sent unless an admin saves it:",
      ["Nothing Claude drafts reaches you until a person has read it, changed it as they see fit, and saved or sent it.", "What comes back is seen by admins only,"],
    ],
    // inviteNoteFor in the send and in the invitation reminder job. v15
    // leaves out where the saved note is kept and that a reminder repeats it.
    [
      "The saved note is kept with the record of the decisions about you and is repeated in any reminder about the invitation;",
      ["<strong>Applications</strong>, with their scores, comments and decisions: while your account exists,"],
    ],
    ["Both are deleted with your application.", ["It is kept with what it was about (the application, or the programme&apos;s run) and deleted with it."]],
  ];

  test("v11, frozen, added these sentences, and v10 did not", () => {
    addedBy(11, SAID.map(([v11]) => v11), V11_FLAT, V10_FLAT);
  });

  for (const [v11, v15] of SAID) {
    test(`v15 says what v11 said: ${v11.slice(0, 60)}`, () => v15Says(v15));
  }

  test("what Claude drafts is written only beside its read, and what an email carries comes only from the saved note", () => {
    const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // The draft's one write: the assessment document, merged, as `inviteDraft`.
    const drafting = strip(read("src/lib/applications/decisionDay/inviteNote.ts"));
    assert.deepEqual([...drafting.matchAll(/\.set\(\s*\{([^}]*)\}/g)].map((m) => m[1].trim()), [
      "roundId, uid: applicantUid, inviteDraft: draft, updatedAt: FieldValue.serverTimestamp()",
    ]);
    assert.match(drafting, /\.collection\(ASSESSMENTS_COLLECTION\)/);
    assert.doesNotMatch(drafting, /decisionRef\([^)]*\)\s*,\s*\{|tx\.set|\.update\(/, "drafting writes nothing but the draft");
    // Claude is sent the application alone: never the committee's part of a read.
    assert.match(drafting, /applicationAlone\(/);
    assert.doesNotMatch(drafting, /\.committee\b|\.message\b/);
    const alone = strip(read("src/lib/applications/assessment/run.ts"));
    assert.match(alone, /application: assessmentInputFrom\(gated\.reviews, user\.uid\)\.application/);
    // An email's note is read through one function, from the saved note on the invitation.
    const plan = strip(read("src/lib/applications/decisionDay/plan.ts"));
    assert.match(plan, /return picked\.note\?\.text \?\? null;/);
    for (const file of ["src/lib/applications/decisionDay/send.ts", "src/lib/scheduler/jobs/applicationInvitationReminders.ts"]) {
      const source = strip(read(file));
      assert.match(source, /note: [^\n]*inviteNoteFor\(/, `${file} takes the note from the saved invitation`);
      assert.doesNotMatch(source, /inviteDraft/, `${file} never reads a draft`);
    }
  });
});

// ---------------------------------------------------------------------------
// §2l Two more notes: v12's words are the code's
// ---------------------------------------------------------------------------

describe("v12 said a group's email and an ask may carry words Claude drafted, never anybody's times; v15 says it, and the code agrees", () => {
  const SAID = [
    // v11's "the one place", taken back (it stays in v11, frozen, below).
    [
      "This and the two below (a note with your group, and a sentence asking you to facilitate) are the only places words Claude drafted can reach you, and only once a person has saved or sent them.",
      [
        "<strong>Words that may reach you.</strong> Claude may draft a few sentences that an admin then sends you: a note in an invitation to a programme you did not rank, a note with your group if it meets outside your times, or a sentence asking you to facilitate.",
        "Nothing Claude drafts reaches you until a person has read it, changed it as they see fit, and saved or sent it.",
      ],
    ],
    // caseDraft.ts: the application alone and the programme's description;
    // nothing stored. v15 leaves out "which group it is or when it meets".
    [
      "An admin can ask Claude to draft that sentence. For that, Claude is sent your application alone, as for its first reading, with the programme&apos;s description, and never the reviewers&apos; scores or comments, the times you marked, or which group it is or when it meets.",
      ["For these Claude is sent your application alone, with the programme&apos;s description, and never the reviewers&apos; scores or comments or the times you marked."],
    ],
    // v15 leaves out that the draft is not kept; the case's draft writes nothing (below).
    [
      "Claude&apos;s draft is shown only to the admin who asked and is not kept: only the email the admin sends reaches you.",
      ["Nothing Claude drafts reaches you until a person has read it, changed it as they see fit, and saved or sent it."],
    ],
    // The note with a group, above the details in the Publish email. v15
    // leaves out who writes it (an admin or the programme's lead).
    [
      "If the group we put you in meets at a time outside the times you told us you are free, the email that tells you your group may start with a few sentences written to you about it by an admin or the programme&apos;s lead.",
      ["If your group meets outside the times you gave, the email telling you your group may start with a few sentences written to you about it."],
    ],
    // v15 leaves out "never when your group meets".
    [
      "with the programme&apos;s description and only the fact that your group meets outside the times you gave: never the times you marked, never when your group meets, and never the reviewers&apos; scores or comments.",
      ["For these Claude is sent your application alone, with the programme&apos;s description, and never the reviewers&apos; scores or comments or the times you marked."],
    ],
    // v15 leaves out where the saved note is kept; the course record's line says how long.
    [
      "The saved note, or the choice to send none, is kept with your place on the programme, where the programme&apos;s lead and admins can see it, and is deleted with your account or with the programme&apos;s run.",
      ["<strong>Your course record</strong> (your place, the registers, your work and the feedback on it, notes facilitators wrote and session reports): while your account exists."],
    ],
    // The seat's timeAnswer: the person's own answer to their group's time.
    [
      "If you cannot, you tell us why and which other times would work, so that we can move you to another group; this keeps your place.",
      ["Once you know your group, you can tell us whether you can make its time, and if not, why and what would work."],
    ],
    [
      "Your answer, your reason and the times you suggest are kept with your place on the programme, where the programme&apos;s lead and admins can see them and nobody else, not your group&apos;s facilitators.",
      ["Only the programme&apos;s lead and admins see that, not your facilitators."],
    ],
    // v15 leaves out that a move clears them; the course record's line says how long.
    [
      "Moving you to another group clears them, and they are deleted with your account or with the programme&apos;s run.",
      ["<strong>Your place and your group.</strong> We record your place, your group, when you were told it and any later move."],
    ],
  ];

  test("v12, frozen, added these sentences, and v11 did not", () => {
    addedBy(12, SAID.map(([v12]) => v12), V12_FLAT, V11_FLAT);
  });

  for (const [v12, v15] of SAID) {
    test(`v15 says what v12 said: ${v12.slice(0, 60)}`, () => v15Says(v15));
  }

  test("v11 still says what it said, frozen: the one place", () => {
    assert.ok(V11_FLAT.includes("This is the one place words Claude drafted can reach you."));
    assert.ok(!CURRENT_FLAT.includes("This is the one place words Claude drafted can reach you."));
  });

  test("the case's draft writes nothing, and is sent the application alone and no times", () => {
    const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const drafting = strip(read("src/lib/courses/facilitatorAsks/caseDraft.ts"));
    assert.doesNotMatch(drafting, /\.set\(|\.update\(|\.create\(|tx\.|\.add\(/, "drafting the case stores nothing");
    assert.match(drafting, /applicationAlone\(/);
    assert.match(drafting, /message: caseMessage\(programme, alone\.application\)/);
    for (const never of ["availability", "painted", "marked", "session", "slot", "startTime", "weekday"]) {
      assert.doesNotMatch(drafting.match(/export function caseMessage[\s\S]*?\n}/)[0], new RegExp(never), `the case's message reads ${never}`);
    }
  });
});

// ---------------------------------------------------------------------------
// §2m Coursework: what v13 says is the code's, and the promise it takes back
// ---------------------------------------------------------------------------

describe("v13 took back the coursework promise from its own agreement on, and named admins' notes, Claude and Pangram on coursework; v15 says it, and the code agrees", () => {
  const PROMISE = "and we will not use anything you write in a course to make decisions about you outside the programme.";
  /** v15's words for the cut-off, said where the work is and where Claude is. */
  const CUT_OFF = [
    "<strong>Using your work later.</strong> What you write on a programme after you first agreed to version 13 of this policy, or after you joined if that was later, may also be used when we consider you for something else with us, such as another programme, facilitating a group or the committee. Anything you wrote before that is used only within its programme.",
    "Only what you wrote after you first agreed to version 13 of this policy, or after you joined if that was later, is ever sent.",
  ];
  // Each line v13 added, then v15's words for the same promise.
  const SAID = [
    [
      "what you write on a course after you agree to version 13, and the notes admins keep about you, may also be used when we consider you for something else with us later: another application, facilitating a group, or the committee.",
      [CUT_OFF[0], "the team&apos;s ratings and notes about you, and using them and your work (written after version 13) when we consider you for something else later;"],
    ],
    ["Anything you wrote before you agreed to version 13 is used only within its programme.", ["Anything you wrote before that is used only within its programme."]],
    [
      "<strong>New in version 13.</strong> Admins can keep notes about you, and Claude may draft them from your coursework.",
      ["<strong>Notes about you.</strong> Admins, and the people leading a programme you are on, may keep notes about you,", "Claude may draft a note (see{\" \"} <a href=\"#ai-review\">AI-assisted review</a>);"],
    ],
    // TAKEN BACK BY v15, for notes written from it on: the people leading a
    // programme may keep notes too. Notes written before v15 stay admins'
    // alone, which the lead's place in `notesShownIn`
    // (src/lib/memberNotes/model.ts) makes true of every note: §2m′ below.
    [
      "Only admins read and write them, and they are never shown to you on the site.",
      ["Notes written before version 15 stay readable by admins only. You don&apos;t see notes on the site,"],
    ],
    // v15 leaves out that one record follows a person across programmes.
    ["There is one record of them for each person, and it follows you across programmes and terms.", ["Each says who wrote it and when,"]],
    // v15 leaves out the list of what Claude is never sent; it says the tools
    // get the words with a number for each name, and only work from after the
    // agreement. It may send survey answers later, which v13 said it never would.
    [
      "Only what you sent after you agreed to version 13 is used, and Claude is never sent your name, your email address, your private notes, your survey answers or when you are free.",
      [CUT_OFF[1], "The tools receive the words with a number in place of each name, and no email address."],
    ],
    [
      "Claude&apos;s draft is shown only to the admin who asked and is not kept unless an admin saves it, and a saved note says it was drafted by Claude.",
      ["a person reads and edits it before it is kept, and a kept note says it was drafted by Claude."],
    ],
    // The notes shown beside an application are those written after the
    // person's moment (`notesShownIn`); v15 says it of notes and work together.
    [
      "A note written before you agreed to version 13 is never used when we consider you for something else.",
      ["the team&apos;s ratings and notes about you, and using them and your work (written after version 13) when we consider you for something else later;"],
    ],
    ["If you ask for a copy of your data, it includes these notes.", ["but they are part of a copy of your data if you ask."]],
    // NARROWED BY v15: Claude's best answers are admins' alone (the route
    // refuses anybody else on the session; held below and in §3).
    [
      "An admin or a programme&apos;s lead can ask Claude to pick the strongest answers to each question of a week across the programme, with a reason for each, and to say what the people on it found hard.",
      ["Admins may ask Claude to help review coursework, survey answers and session reports: to grade answers, pick out the strongest and weakest, and say what people found hard and who might need a hand."],
    ],
    ["No name, email address or account is sent: each person is a number, and the site puts the names back.", ["The tools receive the words with a number in place of each name, and no email address."]],
    ["What comes back is shown to admins and the programme&apos;s lead only, never to other fellows.", ["What comes back is seen by admins only,"]],
    // PANGRAM_MIN_WORDS (50) is v15's "longer answers", held in §2h.
    [
      "An admin can ask Pangram to check your written answers and reflections of 50 words or more, and nothing shorter, only those sent after you agreed to version 13.",
      ["Admins may ask Pangram to check longer answers for writing produced with AI.", CUT_OFF[1]],
    ],
    ["Only admins see what comes back, never the programme&apos;s lead or your facilitators.", ["What comes back is seen by admins only,"]],
    ["A flag is a reason for a person to read it again, never a decision or an accusation.", ["and is a reason for a person to look, never a decision about you."]],
    ["The lead never sees what Pangram found.", ["What comes back is seen by admins only,"]],
    [
      "Nothing about your coursework is decided by Claude or Pangram either:",
      ["No decision about you is made solely by automated means.", "What Claude or Pangram says is one view a person weighs, and nothing is done because of it alone."],
    ],
  ];

  test("v13, frozen, added these sentences, and v12 did not", () => {
    addedBy(13, SAID.map(([v13]) => v13), V13_FLAT, V12_FLAT);
  });

  for (const [v13, v15] of SAID) {
    test(`v15 says what v13 said: ${v13.slice(0, 60)}`, () => v15Says(v15));
  }

  test("the policy no longer makes the promise, and v12, frozen, still does", () => {
    assert.ok(V12_FLAT.includes(PROMISE), "v12 is frozen and should still carry the promise its readers accepted");
    assert.ok(!CURRENT_FLAT.includes(PROMISE), "the policy promises nothing written in a course is used outside its programme again");
    assert.ok(!/will not use anything you write in a course/i.test(CURRENT_FLAT.replace(/\/\*[\s\S]*?\*\//g, "")));
  });

  test("the cut-off is said where the work is and where Claude is, and is the moment the code keeps", async () => {
    const yourWork = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="your-work"'), PAGE_FLAT.indexOf('<section id="feedback-and-notes"'));
    const aiReview = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="ai-review"'), PAGE_FLAT.indexOf('<section id="events"'));
    assert.ok(yourWork.length > 500 && aiReview.length > 500, "could not find Your work or AI-assisted review");
    assert.ok(yourWork.includes(CUT_OFF[0]), "Your work no longer says from when work may be used outside its programme");
    assert.ok(aiReview.includes(CUT_OFF[1]), "AI-assisted review no longer says only work from after the agreement is ever sent");
    // "After you first agreed to version 13, or after you joined if that was
    // later": the moment kept once, at the first agreement to 13 or later,
    // which for somebody who joined later is their joining.
    const use = await loadTs("lib/legal/courseworkUse.ts");
    assert.equal(use.COURSEWORK_USE_FROM_VERSION, 13);
    assert.equal(use.COURSEWORK_USE_FIELD, "courseworkUseAgreedAt");
    const stamped = read("src/lib/legal/courseworkUseStamp.ts");
    assert.match(stamped, /if \(!prior \|\| prior\[COURSEWORK_USE_FIELD\] != null\) return \{\};/, "the moment can be moved by a later agreement");
    assert.match(read("src/app/api/account/reconsent/route.ts"), /courseworkUseStampFor\(/);
  });

  test("notes about a person are an admin's alone on the admins' routes, both ways; a programme's lead reaches them only through §2m′", () => {
    assert.match(read("src/lib/memberNotes/store.ts"), /if \(user\.role !== "admin"\) return refuse\(403, NOTES_WORDS\.onlyAdmins\);/);
    for (const route of ["src/app/api/admin/members/[uid]/notes/route.ts", "src/app/api/admin/members/[uid]/notes/[noteId]/route.ts", "src/app/api/admin/members/[uid]/notes/draft/route.ts"]) {
      assert.match(read(route), /gateNotes\(user, uid\)/, `${route} no longer asks the admins' gate`);
    }
  });
});

// ---------------------------------------------------------------------------
// §2m′ Notes the people leading a programme read and write (v15)
// ---------------------------------------------------------------------------

describe("v15 lets the people leading a programme keep notes, and keeps every note written before it an admin's; the code agrees", () => {
  const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const AGREED = new Date("2026-11-02T09:00:00Z");
  const BEFORE = new Date("2026-10-20T09:00:00Z");
  const AFTER = new Date("2026-11-10T09:00:00Z");
  const PROGRAMME_ROUTES = [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/route.ts",
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/[noteId]/route.ts",
  ];

  test("v15 says it", () => {
    v15Says([
      "<strong>Notes about you.</strong> Admins, and the people leading a programme you are on, may keep notes about you,",
      "Each says who wrote it and when, and admins can keep some to themselves.",
      "Notes written before version 15 stay readable by admins only.",
      "a person reads and edits it before it is kept, and a kept note says it was drafted by Claude.",
    ]);
  });

  test("\"Notes written before version 15 stay readable by admins only\": a lead is shown a note only when it is kept for leads and was written after its person agreed to v15", async () => {
    const use = await loadTs("lib/legal/reviewUse.ts");
    assert.equal(use.REVIEW_USE_FROM_VERSION, 15);
    assert.equal(use.reviewUseFrom({ policyVersion: "terms.1+privacy.14", policyAgreedAt: AGREED }), null, "a person on v14 has no moment");
    assert.equal(use.reviewUseFrom({ policyVersion: "terms.1+privacy.15", policyAgreedAt: AGREED })?.getTime(), AGREED.getTime());
    const model = await loadTs("lib/memberNotes/model.ts");
    const note = (id, createdAt, audience) =>
      model.normalizeMemberNote(id, { uid: "u", text: id, authorUid: "a", runId: "r", createdAt, updatedAt: createdAt, ...(audience ? { audience } : {}) });
    const notes = [note("before-v15", BEFORE, "leads"), note("nobody-chose", AFTER), note("admins", AFTER, "admins"), note("for-leads", AFTER, "leads")];
    const lead = { kind: "lead", runId: "r" };
    assert.deepEqual(model.notesShownIn(lead, notes, BEFORE, AGREED).shown.map((shown) => shown.id), ["for-leads"]);
    assert.deepEqual(model.notesShownIn(lead, notes, BEFORE, null).shown, [], "a lead is shown a note about somebody who has not agreed to v15");
    // Every note written before v15 existed has no audience, and reads as admins only.
    assert.equal(model.normalizeMemberNote("old", {}).audience, "admins");
    // The lead's reads go through that place, and the lead's place alone.
    const door = strip(read("src/lib/memberNotes/programme.ts"));
    assert.equal((door.match(/notesShownIn\(\{ kind: "lead", runId: door\.runId \}/g) ?? []).length, 2, "the lead reads or changes a note outside the lead's place");
    assert.match(door, /reviewFrom: reviewUseFrom\(subject\)/);
  });

  test("\"the people leading a programme you are on\": the programme's own gate, then the person on the programme now, before anything about them is read", () => {
    const door = strip(read("src/lib/memberNotes/programme.ts"));
    const body = door.slice(door.indexOf("export async function openProgrammeNotes("));
    const order = [
      "if (user.uid === subjectUid) return refuse(403, NOTES_WORDS.notYours);",
      "const outcome = await loadProgrammeRun(db, user, roundId, programmeId);",
      'if (outcome.status === "not-yours") return refuse(403, NOTES_WORDS.notTheirs);',
      "if (!form || form.decisionsSentAt === null) return refuse(404, NOTES_WORDS.notOnProgramme);",
      "holdsPlaceOn(form, view.programmeId, application,",
      "if (!onProgramme) return refuse(404, NOTES_WORDS.notOnProgramme);",
      "loadSubject(db, subjectUid)",
    ];
    let at = -1;
    for (const step of order) {
      const next = body.indexOf(step);
      assert.ok(next > at, `the programme's door no longer does this in order: ${step}`);
      at = next;
    }
    for (const route of PROGRAMME_ROUTES) {
      const code = strip(read(route));
      assert.match(code, /openProgrammeNotes\(db, user, roundId, programmeId, uid\)/, `${route} does not open the programme's door`);
      assert.doesNotMatch(code, /draftNote|askClaude|pangram/i, `${route} reaches Claude or Pangram`);
    }
    // "Only admins see what they return": the lead is answered before whether Claude is set up is even asked.
    const list = strip(read(PROGRAMME_ROUTES[0]));
    const leadAnswered = list.indexOf('if (loaded.viewer === "lead") return NextResponse.json(projectNotesForLead(loaded.lead)');
    assert.ok(leadAnswered !== -1 && leadAnswered < list.indexOf("claudeConfigured()"), "the lead's answer is built after Claude is asked about");
  });

  test("\"admins can keep some to themselves\": a lead's note is always kept for leads, and only an admin saves a note Claude drafted", async () => {
    const store = strip(read("src/lib/memberNotes/store.ts"));
    assert.match(store, /if \(viewer === "lead" && raw !== "leads"\) return refuse\(403, NOTES_WORDS\.leadsAlways\);/);
    assert.match(store, /if \(draftedByClaude && viewer !== "admin"\) return refuse\(403, NOTES_WORDS\.onlyAdminsKeepDrafts\);/);
    const door = strip(read("src/lib/memberNotes/programme.ts"));
    assert.match(door, /if \(fields\.audience !== "leads"\) return refuse\(403, NOTES_WORDS\.leadsAlways\);/);
    assert.match(door, /if \(fields\.draftedByClaude\) return refuse\(403, NOTES_WORDS\.onlyAdminsKeepDrafts\);/);
    // A note kept for leads only about somebody who agreed to v15, written after they did.
    assert.match(store, /if \(fields\.audience === "leads" && reviewFrom === null\) return refuse\(409, NOTES_WORDS\.notYetForLeads409\);/);
    assert.match(store, /if \(change\.audience === "leads" && !writtenAfterReviewUse\(note\.createdAt, reviewFrom\)\) \{/);
  });

  test("\"Each says who wrote it and when\" and \"a kept note says it was drafted by Claude\", to a lead as to an admin; nothing else of an admin's reaches a lead", () => {
    const door = strip(read("src/lib/memberNotes/programme.ts"));
    const projection = door.slice(door.indexOf("export function projectNotesForLead("), door.indexOf("export async function addProgrammeNote("));
    for (const field of ["authorName:", "createdAt:", "draftedByClaude: note.draftedByClaude,"]) {
      assert.ok(projection.includes(field), `the lead's projection no longer carries ${field}`);
    }
    for (const never of ["hidden", "agreed", "runs", "claude:", "beforeAgreement", "leadsMayRead"]) {
      assert.ok(!projection.includes(never), `the lead's projection carries ${never}`);
    }
    const list = strip(read(PROGRAMME_ROUTES[0]));
    assert.match(list, /if \(loaded\.viewer === "lead"\) return NextResponse\.json\(projectNotesForLead\(loaded\.lead\), \{ headers: NO_STORE \}\);/);
  });
});

// ---------------------------------------------------------------------------
// §2n Required survey questions: what v14 says is the code's, and what it takes back
// ---------------------------------------------------------------------------

describe("v14 made survey questions required unless marked optional and named the questions left blank; v15 says it, and the code agrees", () => {
  const SKIPPED = "Every question can be skipped.";
  const KEPT = "Nothing you say in a survey affects your place on a programme or an application.";
  /** v15's paragraph, whole. */
  const QUESTIONS =
    "<strong>Questions that need an answer.</strong> Every question needs an answer unless it is marked optional. The boxes that ask your permission are always up to you: whether we may contact you for follow-ups, whether we share your details with Kairos, and whether we may quote you. If you sent a survey with questions left blank, an admin may send you a link to answer just those; it shows none of your earlier answers, and adds to them without changing them.";
  // Each line v14 added, then v15's words for the same promise.
  const SAID = [
    ["<strong>New in version 14.</strong> Every question in a survey now needs an answer unless it is marked optional, and the boxes that ask your permission are still up to you.", [QUESTIONS]],
    ["If you sent a survey with questions left blank, an admin may send you a link to answer just those.", ["If you sent a survey with questions left blank, an admin may send you a link to answer just those;"]],
    // v15 says every survey's email is a notice; the link to the questions left blank is one.
    [
      "If you sent a survey with questions left blank, an admin may send you a link of your own to answer just those, as an important notice like the survey&apos;s own email.",
      ["<strong>How a survey reaches you.</strong> A survey&apos;s email is a notice, so your notification settings don&apos;t switch it off,"],
    ],
    ["It shows only the questions you left blank, never your earlier answers.", ["it shows none of your earlier answers,"]],
    ["Your first answers are kept exactly as you sent them, and the new ones are added to them, with when you sent them.", ["and adds to them without changing them."]],
    // v15 leaves out that their name comes off on the same day as the rest;
    // it says when names come off survey answers, which these are.
    [
      "They are confidential like the rest, none of them is kept until you send them, and your name comes off them on the same day as the rest.",
      ["Every survey is confidential:", "and none of your answers until you send them.", "<strong>Survey answers:</strong> we take your name off two years after the programme&apos;s last session (or the event),"],
    ],
    // The survey about leaving and the survey after an event follow the same rule (held in their own sections).
    ["whether you would take part again. As in every survey, each needs an answer unless it is marked optional.", ["Every question needs an answer unless it is marked optional."]],
    ["how you heard about it and what we should change. The last is marked optional; as in every survey, the others need an answer.", ["Every question needs an answer unless it is marked optional."]],
  ];

  test("v14, frozen, added these sentences, and v13 did not", () => {
    addedBy(14, SAID.map(([v14]) => v14), V14_FLAT, V13_FLAT);
  });

  for (const [v14, v15] of SAID) {
    test(`v15 says what v14 said: ${v14.slice(0, 60)}`, () => v15Says(v15));
  }

  test("the policy does not say every question can be skipped, and v13, frozen, still does; the sentence about a place stays", () => {
    const body = (flat) => flat.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(V13_FLAT.includes(SKIPPED), "v13 is frozen and should still carry the sentence its readers accepted");
    assert.ok(!body(CURRENT_FLAT).includes(SKIPPED), "the policy says every question can be skipped again");
    assert.ok(!/can be skipped/i.test(body(CURRENT_FLAT)), "the policy says a question can be skipped again");
    assert.ok(body(CURRENT_FLAT).includes(KEPT) && V13_FLAT.includes(KEPT), "the sentence about a place or an application changed");
  });

  test("the surveys' own words and the policy agree: required unless optional, the three permission boxes never", () => {
    // The not-for-everybody list is text questions only, and a consent box is never required (tests/surveys-required.test.mjs walks every template).
    const template = surveyTemplates.templateItems("before", "fellowship", null);
    assert.ok(surveyItems.surveyQuestionsOf(template).every((question) => surveyItems.isQuestionRequired(question)));
    assert.ok(surveyItems.consentItemsOf(template).every((consent) => !surveyItems.isQuestionRequired(consent)));
    // The quote tick and the Kairos box are not items at all: no answer route can require them.
    assert.ok(!surveyItems.requiredQuestionsOf(template).some((question) => /quote|kairos/i.test(question.id)));
  });

  test("the rule is said once, in Surveys and check-ins", () => {
    const surveys = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="surveys"'), PAGE_FLAT.indexOf('<section id="ai-review"'));
    assert.ok(surveys.length > 500, "could not find Surveys and check-ins");
    assert.ok(surveys.includes(QUESTIONS), "Surveys and check-ins no longer says which questions need an answer");
    assert.equal(PAGE_FLAT.split("Every question needs an answer unless it is marked optional.").length - 1, 1, "the rule is said more than once, and the copies can drift apart");
  });
});

// ---------------------------------------------------------------------------
// §5 The services we use: the page the policy points to, held to the code
// ---------------------------------------------------------------------------

/**
 * From v15 the outside services are listed on a page of their own,
 * /privacy/services, drawn from `src/content/legal/services.ts`, and the
 * policy says we use the services listed there, each with what it receives,
 * and that adding one updates the page and is told before it receives
 * anything. So the list is the policy's own words kept outside a version
 * file, and it is held here both ways: every service the code calls is on the
 * list, and every service on the list is one the code calls. A new service is
 * a new entry in both maps below, and a notice, before it receives anything.
 */
describe("the services we use", () => {
  const SERVICES_PAGE = "src/app/(public)/privacy/services/page.tsx";
  /** Each listed service, with the line of code or configuration that calls it. */
  const CALLED_BY = new Map([
    ["Google (Firebase and Google Cloud)", ["src/lib/firebase/admin.ts", /from "firebase-admin\/app"/]],
    ["Resend", ["apphosting.yaml", /value: smtp\.resend\.com/]],
    ["Google reCAPTCHA", ["src/lib/recaptcha/server.ts", /www\.google\.com\/recaptcha\/api\/siteverify/]],
    ["YouTube (Google)", ["src/lib/firestore/newsletterBlocks.ts", /https:\/\/i\.ytimg\.com\/vi\//]],
    ["Anthropic", ["src/lib/ai/claude.ts", /from "@anthropic-ai\/sdk"/]],
    ["Pangram Labs", ["src/lib/ai/pangram.ts", /const BASE_URL = "https:\/\/text\.external-api\.pangram\.com";/]],
    ["Your browser's push service (Google, Apple or Mozilla, for example)", ["src/lib/push/send.ts", /from "web-push"/]],
  ]);
  /** The packages that talk to an outside service, each with the service it is. */
  const SERVICE_PACKAGES = new Map([
    ["@anthropic-ai/sdk", "Anthropic"],
    ["firebase", "Google (Firebase and Google Cloud)"],
    ["firebase-admin", "Google (Firebase and Google Cloud)"],
    ["web-push", "Your browser's push service (Google, Apple or Mozilla, for example)"],
  ]);

  test("the policy points to the page, says what it holds, and promises to tell before a new service receives anything", () => {
    assert.ok(PAGE_FLAT.includes('const SERVICES_HREF = "/privacy/services";') || CURRENT_FLAT.includes('const SERVICES_HREF = "/privacy/services";'));
    assert.ok(PAGE_FLAT.includes("We do not sell your data, and we do not share it for advertising."));
    assert.ok(PAGE_FLAT.includes("If we add a service, we update that page and tell you before it receives anything about you."));
    assert.ok(PAGE_FLAT.includes("<strong>Outside services.</strong> We use a few, listed under{\" \"} <a href={SERVICES_HREF}>Services we use</a>."));
    assert.ok(existsSync(join(REPO_ROOT, SERVICES_PAGE)), "the page the policy points to is gone");
  });

  test("the page draws every service, with what it does, what it receives and its policy, and reads nothing", () => {
    const page = withoutComments(read(SERVICES_PAGE));
    assert.doesNotMatch(page, /^\s*["']use client["']/m, "the page is a client component");
    assert.match(page, /import \{ AI_REVIEW_LINK, OUTSIDE_SERVICES, SERVICES_LAST_UPDATED \} from "@\/content\/legal\/services";/);
    assert.match(page, /\{OUTSIDE_SERVICES\.map\(\(service\) => \(/);
    for (const field of ["service.name", "service.receives", "service.policy.href", "service.policy.label"]) {
      assert.ok(page.includes(`{${field}}`) || page.includes(`href={${field}}`), `the page no longer draws ${field}`);
    }
    assert.match(page, /\{linked\(service\.does\)\}/);
    assert.match(page, /Updated \{SERVICES_LAST_UPDATED\}/);
    assert.doesNotMatch(page, /getAdminDb|firebase|fetch\(/, "the page reads something: it is the same words for everybody");
  });

  test("every entry is whole: a name, what it does, what it receives, and an https policy where it has one", async () => {
    const { OUTSIDE_SERVICES, AI_REVIEW_LINK, SERVICES_LAST_UPDATED } = await loadTs("content/legal/services.ts");
    assert.match(SERVICES_LAST_UPDATED, /^\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
    assert.equal(new Set(OUTSIDE_SERVICES.map((service) => service.id)).size, OUTSIDE_SERVICES.length, "two services share an id");
    for (const service of OUTSIDE_SERVICES) {
      for (const field of ["id", "name", "does", "receives"]) {
        assert.ok(typeof service[field] === "string" && service[field].trim().length > 0, `${service.id} has no ${field}`);
      }
      assert.ok(service.policy === null || /^https:\/\/[^\s]+$/.test(service.policy.href), `${service.id}'s privacy policy is not an https address`);
      assert.doesNotMatch(`${service.does} ${service.receives}`, /[\u2013\u2014]/, `${service.id} carries a dash`);
    }
    // Claude and Pangram point to the part of the policy that says what they are asked to do.
    assert.equal(AI_REVIEW_LINK.href, "/privacy#ai-review");
    assert.ok(PAGE_FLAT.includes('<section id="ai-review" className={styles.section}>'));
    for (const name of ["Anthropic", "Pangram Labs"]) {
      assert.ok(OUTSIDE_SERVICES.find((service) => service.name === name).does.includes(AI_REVIEW_LINK.words), `${name} no longer points to AI-assisted review`);
    }
    // The training promise is version 14's, and the only one: nothing new about retention or training.
    const words = OUTSIDE_SERVICES.map((service) => `${service.does} ${service.receives}`).join(" ");
    assert.equal((words.match(/train/g) ?? []).length, 1);
    assert.ok(V14_FLAT.includes("and does not use it to train its models."), "the promise about training is not version 14's");
    assert.doesNotMatch(words, /\b(retain|retention|delete|deleted|days|months)\b/i, "a service's line now promises something about how long it keeps things");
  });

  test("every service the code calls is listed, and every listed service is one the code calls", async () => {
    const { OUTSIDE_SERVICES } = await loadTs("content/legal/services.ts");
    const listed = OUTSIDE_SERVICES.map((service) => service.name).sort();
    assert.deepEqual([...CALLED_BY.keys()].sort(), listed, "the list and the code's services disagree: add the entry here and on the page, or take it off both");
    for (const [name, [file, pattern]] of CALLED_BY) {
      assert.match(read(file), pattern, `${name} is listed because ${file} calls it, and it no longer does`);
    }
    // A package that talks to an outside service is one of them.
    const dependencies = Object.keys(JSON.parse(read("package.json")).dependencies ?? {});
    for (const [pkg, name] of SERVICE_PACKAGES) {
      assert.ok(dependencies.includes(pkg), `${pkg} is no longer a dependency: take it off this map`);
      assert.ok(listed.includes(name), `${pkg} talks to ${name}, which is not listed`);
    }
    for (const pkg of dependencies.filter((dep) => /anthropic|openai|resend|sendgrid|mailgun|postmark|twilio|stripe|posthog|sentry|segment|mixpanel|amplitude|google-analytics|gtag|intercom|hotjar|pangram/i.test(dep))) {
      assert.ok(SERVICE_PACKAGES.has(pkg), `${pkg} talks to an outside service the list has not been checked against: add it to the page and to this map, and tell people before it receives anything`);
    }
  });
});
