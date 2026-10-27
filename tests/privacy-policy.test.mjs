/**
 * The current privacy policy, the frozen versions behind it, and the
 * re-consent gate that publishing a new one fires.
 *
 * Run with `npm test`.
 *
 * The current version is v7: v6's text, changed where the course hub (a
 * programme while it runs and when it ends) made it untrue or left something
 * out. Certificates are sent to the people who finished and to facilitators,
 * each private until its owner turns the link on, where v6 said a person
 * mints their own and nothing is issued unless they choose to; what a
 * programme's lead sees is named; pitching week, teams, leaving, a place that
 * comes back and who finished are described; facilitators see names only; a
 * programme's attendance is a third logged download; the notes a group's
 * facilitators share, the notes a group shares on its week pages and the
 * calendar link are described, with who reads each and what a deletion does
 * to it; and so is the survey at a programme's start: confidential, nothing
 * kept about how it is filled in, the name off two years after the programme or
 * at once with the account, and its answers with names a fourth logged
 * download; and, with the impact questionnaire, sharing with Kairos unless
 * somebody says no (the Kairos file a fifth logged download), the ratings at
 * a programme's end, and totals to funders and sponsors that name nobody.
 * §2g holds those passages against the code. Three were worded as what
 * will happen until they were built: certificates, whose paragraph still
 * says what happens when a programme ends and is held to the code in §2; a
 * team's page, which now says each team has one and is held to the code in
 * §2g; and facilitators seeing, before the first session, who has said they
 * are coming, which now says they see it and is held to the code in §2g.
 *
 * v6 (7 October 2026) was v5's text, rewritten where the application form
 * (docs/applications.md) made it untrue. The people who read an application
 * see whose it is, where v5 said reviewers scored with names hidden; who
 * reads one is named; scores, comments and decisions are kept beside the
 * application and never on it; and decision day, the replies and what stays
 * afterwards are described. It also says how somebody with no account joins
 * on the form and what the browser keeps while they do, and names every form
 * the spam check runs on. v7 carries every one of those passages word for
 * word, so §2d still holds them against the code, and §2e the three lists of
 * places (where Google reCAPTCHA runs, where Google's sign-in script loads,
 * what is kept in local storage). v6 is frozen below.
 *
 * v5 (7 September 2026) was v4's text plus the
 * notification grid's four passages (the four rows and the two choices per
 * row, a notification chosen separately from its email, important notices
 * under performance of a contract, and no unsubscribe link on them), and is
 * frozen below. v4 is
 * the wording members accepted at the 6 September 2026 release and is frozen
 * below. Before that, v4 was v3 plus one sentence, under "When you join the
 * committee", about what a circulated worksheet records; that sentence was
 * first edited straight into v3, which was the wrong move and is the reason
 * §1b below exists. A version the owner has
 * accepted is frozen text. Editing it changes what somebody sees at the
 * archive URL for the wording they agreed to, and it changes it WITHOUT moving
 * CURRENT_POLICY_VERSION, so nobody is ever asked to accept the new sentence.
 * New wording goes in a new file, every time.
 *
 * A policy version is a promise, and the four ways it can quietly become a
 * lie are all pinned here:
 *
 *  1. **The section stops being exhaustive.** v4's "Courses and programmes"
 *     section is the one place the platform tells an applicant what it holds
 *     about them. A later PR that adds a category and forgets the policy has
 *     made the page wrong, so every category the courses hub holds is checked
 *     for by name. These are keyword checks over the rendered copy, which is
 *     coarse on purpose: they cannot judge wording (that is the owner's, see
 *     the OWNER TO CONFIRM block at the top of the file), only that the
 *     subject is addressed at all.
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
 *  4. **The gate stops firing.** Moving CURRENT_POLICY_VERSION is what asks
 *     members to re-accept, and the gate has to be somewhere every authed page
 *     passes through, must not run inside a view-as session, and must still
 *     name a version the site can render.
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
const CURRENT = read("src/content/legal/privacy/v8.tsx");
/**
 * The current policy with every run of whitespace collapsed to one space. The
 * copy is JSX, so a sentence is wrapped and indented across several lines and
 * no pattern written as a sentence would ever match the raw source. Every
 * content check below runs against this, because v8 is the text the site
 * serves at /privacy.
 */
const CURRENT_FLAT = CURRENT.replace(/\s+/g, " ");
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
  test("privacy v8 is current, and the combined version string moved with it", () => {
    assert.equal(currentPolicy("privacy").version, 8);
    assert.equal(CURRENT_POLICY_VERSION, "terms.1+privacy.8");
  });

  test("privacy v8 is dated the day its words last changed", () => {
    const eight = POLICIES.privacy.versions.find((v) => v.version === 8);
    assert.equal(eight?.lastUpdated, "27 October 2026");
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
 * Every category the courses hub holds or is about to hold this term, with a
 * phrase that must appear in the section. Sourced from the owner decisions:
 * if a category is dropped from here, it has to be dropped from the product
 * too, not just from the page.
 */
const MUST_NAME = [
  ["application answers", /Everything you type into the application form/i],
  ["drafts", /Drafts are saved on our servers/i],
  ["availability", /availability/i],
  ["access requirements", /access-requirements box|Access requirements/],
  ["access requirements are never scored", /never scored/],
  ["access-requirements reads are recorded", /every time one of them does we record who read it/i],
  // An application form has no criteria. A reviewer scores single answers
  // from 1 to 5, and only where the programme uses scores
  // (`ApplicationQuestion.scored`, `ProgrammeSettings.useScores`).
  ["reviewer scores", /give each of your answers to that programme&apos;s own questions a score from 1 to 5/i],
  ["reviewer comments", /write a comment on any of your answers, and an overall comment about your application/i],
  // OWNER DECISION, 7 October 2026: feedback on an application is not
  // promised. It can be asked for and will be considered. A copy of the
  // personal data held about somebody, these scores and comments included,
  // is their right, and "Your rights" is where the page says so: §2d holds
  // that section to the words this sentence relies on.
  ["feedback on an application is not promised, and can be asked for", /We do not send feedback on applications, and we cannot promise it for every one\. If you would like some, email us and we will consider it\./i],
  ["scores and comments are within the right to a copy of your data", /Your right to a copy of the data we hold about you, which includes these scores and comments, is under(?:\{" "\})? <a href="#your-rights">Your rights<\/a>\./i],
  ["attendance registers", /present, arrived late, left early, absent, or\s*\{?"?\s*excused/i],
  ["participant notes", /private note about a named\s+participant/i],
  // A week's written answer replaced the exercise (the coursework of v20),
  // and feedback is a level per row of the rubric and a comment: the two
  // entries this replaces were "Answers to exercises" and "feedback a
  // facilitator writes on your work", each the same claim in its old words.
  ["written answers", /Your written answers, the feedback on them, and your progress through each week&apos;s materials\./i],
  ["feedback on written answers", /Feedback is a level for each row of the course&apos;s rubric and a short comment, with the name of whoever gave it, and never a mark\./i],
  // A rating on every programme; the comment shown to the run only on a
  // programme anyone can join, and the group's notes in its place on one that
  // places people in groups (`runSharesGroupNotes`, which §2g runs). The entry
  // this replaces, "star rating and leave a comment", pinned the comment box
  // on every run, which a run with groups no longer draws.
  ["feedback on the material", /You can give a piece of course material a star rating\. On a programme anyone can join you can also leave a comment on it, which is shown to the rest of your run; on a programme that places you in a group, you share notes with your group instead \(see Notes shared with your group\)\. Ratings and comments are stored against your account and your name\./i],
  // The promise that an anonymous form would say it is anonymous and how,
  // with this policy first, is kept and replaced (the questionnaire's part (c),
  // 26 October 2026): the two entries this replaces pinned the promise. §2g
  // holds each sentence below to the code.
  ["the one anonymous form, apart from the surveys", /One form is anonymous: the keep, change and drop form linked from the end of the survey at a programme&apos;s end\./i],
  ["how the anonymous form never records who answers", /It never asks or records who answers, even when you are signed in: everybody on the programme has the same link, and your browser sends the answers without your sign-in\./i],
  ["what the anonymous form keeps, and nothing else", /With your three answers we keep only the programme and the day: no name, account, email address, IP address or detail of your device\./i],
  ["the anonymous form says it is anonymous, and how, at the top", /The form says so at the top\. <\/li>/i],
  ["the day and not the time, by the night's move", /We keep the day, not the time\. Until the day is over the answers wait in a holding record, which our database stamps with the time, as it does every record; soon after midnight a job moves the day&apos;s answers together into the record we keep, which holds the day and not the time, and deletes the holding records\./i],
  ["where a time is still held for a while, and never matched", /Recovery copies of our database, kept up to 14 days, can hold a holding record until they expire, and our hosting provider&apos;s request logs \(see Operational logs\) note the time and address of every request; those logs are never matched to the answers\./i],
  ["who reads the anonymous answers, and from when", /Only the programme&apos;s lead and NAISI&apos;s admins read the answers, from the day after they come in, in an order unrelated to when each came in\. The form closes when the survey at the end does\./i],
  ["how long the anonymous answers are kept, and that an account's deletion removes none", /<strong>Answers to the anonymous form\.<\/strong> Kept while the programme&apos;s course run is on the site, and deleted when the run is destroyed\. Nothing in them says whose they are, so deleting your account removes none of them\./i],
  ["membership tier", /membership tier \(paid, comped, alumni, staff\)/i],
  ["membership provenance", /a list the\s+Students&apos; Union gives us/i],
  ["the conduct flag", /an admin can\s+flag an\s+account and must record a reason/i],
  // No screen that reads an application is sent a conduct flag: the one
  // reader of `memberConductFlags` is the admin route on the Members page.
  ["the conduct flag and its reason are admin-only", /The flag and the reason are visible to admins alone/i],
  // OWNER DECISION, 25 October 2026 (Q8 with Q26, as the boards draw them):
  // the programme's lead or an admin sends a certificate to everybody who
  // finished and to each facilitator, and each starts private until its owner
  // turns its link on. The three entries these replace pinned v6's model, in
  // which a person minted their own and nothing was issued unless they chose
  // to; v7 takes that promise back, which is why it is a new version.
  ["certificates are sent to who finished and to facilitators", /we will send a certificate to everybody the programme&apos;s record says finished it \(see Who finished\), and to each person who facilitated one of its groups/i],
  ["a certificate starts private, until its owner turns the link on", /It starts private: until you turn its link on, only you can open it\./i],
  ["what a certificate page shows, and never shows", /The page shows your name, that you finished the programme or facilitated a group on it, the programme, the term, how many weeks it ran and the day it was issued\. It shows no email address, no photo and nobody else&apos;s name\./i],
  // OWNER DECISION, 7 October 2026: names are shown, and the form does not
  // say so, which leaves this page as the one place an applicant is told.
  // The two entries these replace pinned the opposite promise ("Reviewers
  // score name-blind by default", and deciders "never blind"), which the
  // application form made untrue.
  ["the people who read an application see whose it is", /They see your name\. Nothing hides who you are from the people who read, score and decide your application/i],
  ["who reads an application", /Admins, and the lead and the reviewers of each programme you ranked/i],
  ["a programme joined by invitation reads the application only once it is accepted", /can read your application from then on, and not before/i],
  // A programme's attendance became the third logged download, a survey's
  // answers with names the fourth and the Kairos file the fifth (each
  // Download writes the log first and refuses without it); §2g walks the tree
  // for every caller of the log. The entry this replaces said four, which was
  // true until the Kairos file joined the log.
  ["only the five logged downloads are recorded", /Five of those downloads are recorded/],
  ["what the Kairos file holds, and never holds", /The Kairos file holds, for each person on a programme at its end who has not said no to sharing with Kairos, their name, the programme, how many sessions they came to, whether they finished and the ratings they were given at the end, and never an email address, who gave a rating or a survey answer\./i],
  ["what the survey file holds, and never holds", /The survey file holds, for each person who answered, their name, when and how they sent their answers, whether their group had met by then, and the answers themselves, and never an email address\./i],
  ["what the attendance file holds, and never holds", /It holds each person&apos;s group, name and marks, how many sessions they came to and the day they left, if they did, and never an email address or a note\./i],
  ["who can see what", /Who can see what/],
  // What the application form holds (docs/applications.md, "Where the data
  // is"). One entry per thing an applicant would not guess at.
  ["the form's own copy of the joining questions", /saved on the application as a copy of its own/i],
  ["the ranking, and facilitating", /whether you said you would like to facilitate a group/i],
  ["the two copies", /the draft you are working on, and the application you sent/i],
  ["earlier sent versions are kept", /the version you sent before is kept with your application/i],
  ["how many earlier versions are kept", /We keep up to ten earlier versions/i],
  // The form has the box, on its last step, kept apart from the application
  // (`CheckStep.tsx`, `applicant/accessRequirementsDoc.ts`). §2d holds the
  // rest of that paragraph to the code.
  ["where the application form's access-requirements box is", /On the application form for the fellowships and the incubator it is on the last step/i],
  ["the access-requirements box is not part of what is sent", /It is not part of the application you send/i],
  ["joining on the form", /it is your request to join as well as the start of your application/i],
  ["a reason is asked for when a place is given back", /you choose a reason from a short list, or write a few words of your own/i],
  ["the SU membership answer", /asks whether you have SU membership/i],
  ["decisions are kept beside the application", /kept in a record of their own beside your application and are never written onto it/i],
  ["nothing about a decision reaches the applicant early", /Nothing about a decision is written onto it, shown on your page, or emailed to you before then/i],
  ["the decision-day email", /We also send it in one email/i],
  ["the daily invitation reminder", /email you a reminder once a day/i],
  ["replies are recorded", /We record your answer and when you gave it/i],
  ["a place approves a join request that was waiting", /that approves the request/i],
  ["what an applicant's own page does not show", /It does not show the scores, the comments, what each programme decided/i],
  // A programme while it runs and when it ends (v7). One entry per thing a
  // person taking part would not guess at; §2g holds each to the code.
  ["a place that comes back", /until the end of the programme&apos;s first week its lead or an admin can offer that place to somebody who ranked the programme and was told no offer this time, as long as the programme had not turned them down/i],
  ["a freed place's offer is emailed whatever the settings say, and is not reminded daily", /we email it to you whatever your notification settings say, with a day to reply by\. You answer it as you would an invitation\. The daily reminder about an invitation is not sent for these offers\./i],
  // Asking people to facilitate (src/lib/courses/facilitatorAsks/), added to
  // v7 before any member was asked to accept it: who reads the answers about
  // facilitating, a programme's lead included where it was not ranked, and
  // the record each ask leaves. §2g holds each to its code.
  ["the answers about facilitating, read by the lead of each programme somebody would facilitate", /the lead of each programme you said you would facilitate, by name or by choosing &quot;Either&quot;, can read your answers to the questions about facilitating, even if you did not rank that programme\./i],
  ["what the list of people who would like to facilitate shows, and nothing else", /which shows your name, your degree or area of work, and your status or the year you expect to graduate, and, from decision day, where you stand in a few words, such as taking part in another programme or no offer this time\. The list shows nothing else of your application\./i],
  ["an ask to facilitate is emailed whatever the settings say, with up to three reminders", /We email you the ask whatever your notification settings say, because it answers what you said on your application, and while it waits for your answer we may send you up to three reminders, at least twelve hours apart\./i],
  ["what the record of an ask holds, and that it holds no address", /We keep a record of each ask: who asked you and when, which group it was for, the day and time to answer by, whether the email went, any reminders, your answer and when you gave it, and a copy of the email as it was sent, with the name it was sent to\. The record holds no email address\./i],
  ["who sees the asks, and that they go with the account", /The programme&apos;s lead and admins can see these records, and you can see your own ask on its page\. They are kept with the rest of your course record, and deleted with your account\./i],
  // A facilitator who holds a place (the rule that nobody facilitates a
  // programme they take part in was lifted on 26 October 2026), added to v7
  // before any member was asked to accept it: a yes places them, they are on
  // the register and count towards who finished, their own written answers
  // are the programme's lead's and an admin's (Zach, Mon 26 Oct 2026), they
  // are stood down before they leave, and they are sent both certificates.
  // §2g holds each to its code.
  ["a yes from somebody holding a place puts them in that group", /If you hold a place on that programme, saying yes also puts you in that group, as one of its people: a facilitator who holds a place sits in the group they facilitate\./i],
  ["a facilitator who holds a place is on the group's register, marked by whoever takes it", /If you do, you are one of the group&apos;s people as well: you are on its register, and whoever takes the register marks you, which can be you;/i],
  ["a facilitator who holds a place counts towards who finished", /which can be you; you count towards who finished;/i],
  ["a facilitator's own written answers are the programme's lead's and an admin's, not the group's other facilitators'", /your written answers are not shown to the group&apos;s other facilitators, who do not give you feedback on them: the programme&apos;s lead or an admin does\./i],
  ["a facilitator who holds a place is stood down before they leave or are removed", /Before you can leave the programme, or be taken off it, the programme&apos;s lead or an admin takes you off the group&apos;s facilitators\./i],
  ["a facilitator who held a place and finished is sent both certificates", /A facilitator who held a place and finished is sent both\./i],
  ["\"I cannot make it\" from somebody in a group is leaving", /If you are already in a group when you say you cannot make it, that is the same as leaving the programme, and your reason goes where a leaver&apos;s does/i],
  ["pitching week, and that sending a pitch shares it with the group", /Sending a pitch is choosing to share it: everybody in your group sees it, with your name and your partner&apos;s, and the pitch form says so\./i],
  ["who picked a pitch is told to nobody in the group", /Nobody else in your group is told which ones you picked\./i],
  ["the lead sees how many would join a pitch, and not who", /The programme&apos;s lead and admins see each pitch and how many would join it, but not who\./i],
  ["how teams are made", /The site can make a team from a pitch \(the people who pitched it, then people who said they would join it\) or, where the programme&apos;s own questions on the application asked you to rank its projects, from your ranking\./i],
  ["what the team email says", /We then email you your team&apos;s name and the names of the people in it, and nothing else about them\./i],
  ["a team's page, and who reads what is written there", /What anybody in the team writes there is seen by everybody in the team, the programme&apos;s lead and admins, and the page says so beside what you write\./i],
  ["leaving, with its day", /If you leave a programme, we record that you left and when, and you leave your group straight away\./i],
  ["who reads a leaver's reason", /If you give a reason, only admins and, where the programme has one, its lead read it\./i],
  ["where a leaver's reason is kept, and that it goes with the account", /It is kept with your place on the programme, not with your application, and it is deleted with your account\./i],
  ["leaving gives a place on the form back, without the reason", /leaving gives that place back, so the people who read your application see that you gave it back, but not your reason/i],
  ["a leaver's marks stay on the register", /Your marks up to then stay on your group&apos;s register with the day you left/i],
  // Somebody who leaves keeps nothing, and the group keeps their notes: the
  // page names both, and §2g holds each to the code. CHANGED ON PURPOSE (Q46):
  // the page that says they left also draws the survey about leaving while
  // it is theirs to answer, and the sentence says so, word for word.
  [
    "a leaver is shown only that they left, and the survey about leaving",
    /After you leave, your programme page shows only that you left, and the survey about leaving while it is yours to answer \(see When you answer a survey\): your marks, notes and reflections stay in our records for the programme&apos;s lead and admins, and are no longer shown to you\./i,
  ],
  // The survey about leaving (Q46): who it reaches and how, what it asks,
  // who reads it and what may still show. §2g holds each to the code.
  [
    "the survey about leaving reaches only somebody who leaves, through their own link",
    /If you leave a programme yourself while it has a survey about leaving open, a link of your own to that survey is made when you leave\. It is on the page that says you left, in the email that tells you so, and on Home and My programmes until you answer it\. Nobody presses send, and it reaches nobody who did not leave\./i,
  ],
  ["what the survey about leaving asks", /It asks why you left, what would have helped you stay and whether you would take part again\./i],
  [
    "who reads the survey about leaving",
    /Like every survey here, the survey about leaving is confidential: only NAISI&apos;s admins can see who said what, and facilitators never see anything of it\. The programme&apos;s lead sees its totals and comments as answers come in, never your name, with the comments in an order that does not follow when they came in\./i,
  ],
  ["the lead may tell whose a leaving answer is", /When only a few people have left, the lead may still be able to tell which answer is yours\./i],
  [
    "the survey about leaving changes nothing, and its names come off as every survey's",
    /Nothing you say in it changes your account or a future application, and your name comes off it two years after the programme&apos;s last session, as for every survey\./i,
  ],
  ["the notes a leaver shared stay with the group", /The notes you shared with your group stay with it/i],
  ["who finished", /we mark as finished everybody who came to at least the number of sessions its lead has set/i],
  ["the lead's changes to who finished are recorded", /The lead can then change anybody&apos;s, and we record who changed it and when\./i],
  // Finishing's column counts written answers sent (en-finish v21), as the
  // tally always has; the entry this replaces said "how many exercises they
  // answered", the same claim in the old word.
  ["only the lead and admins see the number and the list", /Only the lead and admins see that number, and the list with how many sessions each person came to and how many written answers they sent\./i],
  ["somebody who did not finish is not told so", /Somebody who did not finish is not told so\./i],
  // The two kinds of notes the lead reads, and no register note: §2g holds
  // the sentence to the register's GET and to each kind's one reader. The
  // entry this replaces was the same sentence before the two were added.
  ["what a programme's lead does and reads once it is running", /Once the programme is running, the lead places its people in groups, reads every register of its groups, the notes its groups&apos; facilitators share, and the notes each of its groups shares on its week pages, sees the pitches and makes the teams on an incubator, reads the reason somebody gives for leaving, and says who finished\./i],
  ["facilitators see names only, and never an email address", /who is in them, by name only, attendance, written work/i],
  ["what facilitators read of their own groups", /the participant notes their colleagues wrote about people in that group, and the notes the group&apos;s facilitators share with each other\./i],
  // The notes a group's facilitators share (C30), the notes a group shares on
  // its week pages (C29) and the calendar link (Add to calendar), added to v7
  // before any member was asked to accept it. §2g holds each to its code.
  ["the notes a group's facilitators share, and that one can name a person", /A group&apos;s facilitators can keep notes for each other about how their group is going, and a note can mention you by name\./i],
  ["who reads the notes a group's facilitators share", /The group&apos;s facilitators, the programme&apos;s lead and admins read them; nobody in the group does\./i],
  ["the notes a group's facilitators share are shown on request", /If you ask to see what is written about you, we will show you these notes too\./i],
  ["the notes shared with a group", /On a programme that places you in a group, each week&apos;s page has notes the people in your group and its facilitators share with each other\./i],
  ["who sees a note shared with a group, and with what", /A note you add is shown with your name, the day you wrote it and the week it was written on, to everyone in your group, its facilitators, the programme&apos;s lead and admins, and to nobody else; the page says so under the notes\./i],
  ["a note shared with a group stays when its writer leaves", /If you leave the programme, the notes you shared stay with your group, as your marks stay on its register\./i],
  // A week's fill-in boxes (week 6's action plan, board wk-week6-phone): who
  // reads them, a facilitator's own, and a leaver's. §2g holds each to its code.
  ["fill-in boxes", /Some weeks have boxes for you to fill in, such as an action plan\. What you write saves as you type\./i],
  ["who reads what somebody fills in", /It is read by you, your group&apos;s facilitators, the programme&apos;s lead and admins, and by nobody else taking part; the page says so under the boxes\./i],
  ["a facilitator's own boxes", /If you facilitate a group, what you write is read by the programme&apos;s lead and admins, and not by the group&apos;s other facilitators\./i],
  ["a leaver's boxes", /If you leave the programme, the programme&apos;s lead and admins can still read it, and your group&apos;s facilitators and you no longer can\./i],
  // Pairs for a session in pairs (Technical AI Safety's hands-on night): who
  // records them, what each person sees of their own pair, who sees every
  // pair, a facilitator in a pair, and a leaver. §2g holds each to its code.
  ["pairs for a session, and who records them", /When a week&apos;s session is in pairs, your group&apos;s facilitators, the programme&apos;s lead or an admin record on the site who is in each pair and, where the week asks, who is bringing a laptop\./i],
  ["what a person sees of their own pair, and their partners of them", /On that week&apos;s page you see who you are paired with, by first name, and who in your pair is bringing a laptop, and your partners see the same about you\./i],
  ["who sees every pair, and nobody else in the group", /Your group&apos;s facilitators, the programme&apos;s lead and admins see every pair in the group; nobody else in your group sees your pair\./i],
  ["a facilitator in a pair, seen by co-facilitators", /If you facilitate the group, you can be in a pair like anybody, and your co-facilitators see it\./i],
  ["a leaver is shown in no pair, and pairs go with the account", /If you leave the programme, you are no longer shown in a pair\. It is deleted with your account\./i],
  ["the calendar link", /&quot;Add to calendar&quot; on your programme page gives you a private link to your sessions/i],
  ["what the calendar shows", /It shows the day, time and room of each session of your group \(and of any group you facilitate\), with the programme&apos;s and the group&apos;s name, and marks a session that is cancelled\./i],
  ["the calendar's provider fetches it and keeps what it shows", /your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us every so often and keeps what it shows, under its own privacy policy/i],
  ["anybody holding the calendar link sees the same", /Anyone else holding the link can see the same, so keep it to yourself\./i],
  ["facilitators email their group without seeing an address", /They never see your email address: they can email their group through the site without seeing anybody&apos;s\./i],
  ["what the people in a group and a team see on an incubator", /On an incubator, the people in your group also see any pitch you send, with your name, and the people in your team see that you are in it and anything you write on your team&apos;s page\./i],
  ["destroying a term's applications takes nobody off a programme", /Nobody is taken off a programme by it: a place on a course run, which notes the application form and programme it came from, stays with the rest of that person&apos;s course record\./i],
  // Reflections, ticks and private notes, as a group's facilitators, the
  // programme's lead and admins read them (Q30, Q31, Q37, Q38, and a
  // facilitator's own coursework), added to v7 before any member was asked
  // to accept it. §2g holds each to its code.
  ["the private note's readers, and that it is never read out", /You can also keep a private note against a piece of material: it is never shown to the rest of your run or read out\. Your group&apos;s facilitators and admins can read it, with your name, and we use what it says to improve the course; if you facilitate the group, only admins read yours\./i],
  ["a line of a reflection may be read out, without saying who wrote it", /We do not publish anything you write to the rest of your group unless you choose to share it, apart from a line of a reflection your facilitators may read out without saying who wrote it \(see Reflections\)/i],
  ["who reads a reflection, and that the week's page says so", /You, your group&apos;s facilitators, the programme&apos;s lead and admins can read your answers, and nobody else on the programme can; the week&apos;s page says so beside the boxes\./i],
  ["lines to read out are chosen on a page with no names", /A facilitator may read a line of one out in the session without saying who wrote it, and the page where they choose lines shows them the words with no name beside them\./i],
  ["a facilitator's own reflections are the lead's and admins'", /If you facilitate a group, your own reflections are read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and nobody reads them out\./i],
  ["who sees which sources somebody ticked, by name", /Your group&apos;s facilitators, the programme&apos;s lead and admins can see which sources you have ticked, with your name, and the week&apos;s page says so; nobody else on the programme can\. A tick never counts against you\./i],
  ["a facilitator's own ticks are the lead's and admins'", /If you facilitate a group, the programme&apos;s lead and admins see yours, and the group&apos;s other facilitators do not\./i],
  ["the lead reads reflections and sees ticks", /The lead also reads the reflections its groups&apos; people write and sees which sources each of them has ticked, a facilitator&apos;s own among them\./i],
  ["what facilitators read of their groups' reflections, ticks and private notes", /written work, the reflections the group&apos;s people write and which sources each of them has ticked, the private notes they keep on what they read, the participant notes/i],
  ["a facilitator never sees another facilitator's own work", /A facilitator never sees another facilitator&apos;s own reflections, ticks or private notes\./i],
  // The survey at a programme's start (docs/surveys.md), added to v7 before
  // any member was asked to accept it. §2g holds each to its code.
  ["a survey is confidential, and says so at the top", /Every survey is confidential: we keep your answers with your name, and each survey says so at the top\./i],
  ["only admins see who said what in a survey, and facilitators see nothing of one", /Only NAISI&apos;s admins can see who said what\. Facilitators never see anything of a survey\./i],
  // A programme's lead reads its surveys' totals and comments (Q41, Q49 A;
  // the stage four walk's finding L2), added to v7 before any member was
  // asked to accept it. §2g holds each to its code.
  ["the lead sees a programme's surveys' totals and comments as they come, in no order that follows when they came", /The programme&apos;s lead sees the totals and comments of its surveys before it, at its end and in the follow-ups as answers come in, with the comments in an order that does not follow when they came in\./i],
  ["the lead never sees a survey's names, who answered, or a download of its answers", /The lead never sees your name or who answered and who did not, and cannot download the answers\./i],
  ["the lead may tell whose a survey answer is", /When only a few people answer, the lead may still be able to tell which answer is yours\./i],
  ["what a programme's lead sees of its surveys and of the ratings of its material", /The lead also sees the totals and comments of the programme&apos;s surveys, never with a name \(see When you answer a survey\), and the average star rating of each piece of its course material once three people have rated it, never who gave which\./i],
  // The questionnaire (26 October 2026) compares at the end and in follow-ups: "and in any follow-ups" added.
  ["why a survey keeps the name, and who sees who has answered", /We keep your name with your answers so that we can compare them with your answers to the same questions at the end of the programme and in any follow-ups, and so that a reminder goes only to people who have not answered\. Only admins see who has answered\./i],
  ["who a programme's surveys go to, at each stage", /At the start of a programme and again at its end, NAISI&apos;s admins may send a survey to everybody holding a place on it, and 6 and 12 months later a follow-up to the people who said yes to one\./i],
  ["what a programme's surveys ask, by kind", /A programme&apos;s surveys ask about your level and subject of study, what you had done in AI safety before and how you first heard about NAISI; your career stage and plans, how likely you think you are to work on AI safety and the kinds of work that interest you;/i],
  ["the profile values a survey offers", /Where your profile holds them, the survey before a programme starts its questions about your level and subject of study on your profile&apos;s answers\. You can change or clear either before you send it, and only what you send is kept\./i],
  ["the survey at the end shows a person their own earlier answer, and nobody else", /The survey at the end shows you what you said you wanted from the programme, so you can say whether you got it; nobody else is shown it there\./i],
  // The survey at the end asks the same box of somebody the before survey
  // never had an answer from (part (b) of the questionnaire's build).
  ["the follow-ups go only to people who tick the box, which they can change later", /The survey before a programme asks whether we may contact you at 6 and 12 months with a short follow-up survey, in a box that starts unticked, and only people who tick it are sent the follow-ups\. If you did not answer it there, the survey at the end asks you the same\. You can change your answer at any time until your name comes off, on your survey&apos;s page, through its link or signed in, and the next follow-up goes by it\. We keep what you said, and when, with the record that the survey was sent to you\./i],
  ["every question in a survey can be skipped, and nothing said in one affects a place", /Every question can be skipped\. Nothing you say in a survey affects your place on a programme or an application\./i],
  ["a survey records nothing about how it is filled in", /A survey records nothing about how you fill it in: not when you opened it, how long you spent on it or which page you were on, and none of your answers is kept until you send them\./i],
  ["what a survey records with the answers, and never an IP address", /We record when you sent them, whether you used your own link or were signed in, and whether your group had met for the first time by then\. We never keep your IP address with them, and the request logs our hosting provider keeps \(see Operational logs\) are never matched to them\./i],
  ["a survey is emailed as an important notice, with a link of your own", /A survey and its reminder are emailed as important notices, so your notification settings do not switch them off\. Each email carries a link of your own, so you can answer without signing in\. Anyone holding it could answer in your name, so keep it to yourself\./i],
  // Two years since Zach chose it for everyone (26 October 2026); it said a year.
  ["names come off survey answers two years after the programme", /We take your name off your answers to a survey on the day it tells you, two years after the programme&apos;s last session, and delete the record that it was sent to you, with your link to answer it and what you said about follow-ups\. Your answers stay in its totals, no longer linked to you\./i],
  // Sharing with Kairos by default, and the ratings at a programme's end
  // (part (b) of the impact questionnaire's build, Zach, 26 October 2026);
  // §2g holds each to the code.
  ["what goes to Kairos unless you say no", /Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end: their name, the programme, how many sessions they came to, whether they finished, and the ratings they were given at the end/i],
  ["why it goes, and that agreeing helps", /We share it because it helps us make our case to our funders and sponsors, so leaving it on helps NAISI\./i],
  ["what never goes to Kairos", /It never holds your email address, your survey answers, or who gave a rating\./i],
  ["how to say no, and that it can change", /Every programme survey ends with a box to say no, and the same choice is on <a href="\/profile">your profile<\/a>\. You can change it at any time, and the next file goes by it\./i],
  ["what saying no does and does not change", /Saying no stops only what goes to Kairos with your name: NAISI&apos;s admins still see your survey answers, and they still count in our totals\./i],
  ["how long the choice is kept, and that a file sent is not recalled", /We keep your choice, and when you made it, until your account is deleted\. A file already sent is held by Kairos, and changing your choice later does not recall it\./i],
  ["totals to funders and sponsors name nobody", /We also report totals to our funders and sponsors, Kairos among them: .* These never name anybody\./i],
  ["an incubator's links to its work may go to funders, as its question says", /These never name anybody\. For an incubator we may also pass on the links its people give us, in the survey at its end, to the work their team produced; that question says so\./i],
  ["what funders are shown, the links included", /Show our funders and sponsors what our programmes achieve: totals that name nobody, the links to an incubator&apos;s work that its people give us, and, unless you say no, what we share with Kairos/i],
  ["the legal basis for sharing with Kairos, and objecting to it", /Sharing with Kairos rests on this basis too: it helps us make our case to our funders and sponsors, it shares only what Sharing with Kairos lists, and you can object to it at any time with the choice at the end of every programme survey or on your profile, which stops it\./i],
  ["who rates whom at a programme's end", /Nobody rates themselves, and two facilitators of one group never rate each other: a facilitator, who takes part in the group they run, is rated by the programme&apos;s lead or an admin, who can also rate anybody else on the programme\./i],
  ["who reads a rating, and that the person rated never does", /Ratings are read only by the programme&apos;s lead, NAISI&apos;s admins, and the person who gave each one, who sees only their own\. They are never shown to the person rated, on any page or in any email\./i],
  ["the sessions beside a rating come from the register", /Beside each rating we show how many sessions the person came to, read from the register, never typed in\./i],
  ["ratings are deleted two years after the programme and with an account", /We delete them two years after the programme&apos;s last session, and at once if the account of whoever gave or was given one is deleted\./i],
  ["a copy of your data covers the ratings you were given", /the notes a facilitator wrote about you, the ratings you were given at the end of a programme, and the reason behind a conduct flag\./i],
  // Every passage of v7 with a claim about something built since v6 that no
  // entry above names, whole and in page order (privacy pass 2, before v7
  // went live): the event and survey passages added after the owner approved
  // the wording, the course hub's passages whose sentences had no entry, and
  // the retention and rights passages that name them. A passage that drops a
  // claim fails here as a category the page stopped naming; §2g holds each
  // claim to its code.
  ["who came to an event, how and when, and who sees it by name", /If you come to an event, we may record that you came, how and when: you check yourself in with the code at the door, or a committee member ticks your name on the door list\. Only NAISI&apos;s admins and the committee members the Students&apos; Union recognises can see who came, as they can see who signed up\. The event&apos;s other organisers see how many came, never who\./],
  ["not coming to an event is recorded nowhere", /Not coming is recorded nowhere\. It is never held against you, and it never stops you signing up again\./],
  ["a walk-in's name, and an address only for that event's survey, deleted when it closes or a week on", /If you come without signing up, we take your name at the door, and an email address only if you want that event&apos;s survey\. We use the address for nothing else, and delete it when that survey closes, or a week after the event if that comes first\./],
  ["the check-in link in the email that confirms a place", /When your place at an event is confirmed, the email that tells you has a link that checks you in at the door, so you can check in without an account\. Anyone holding it could check in in your name, so keep it to yourself\./],
  ["the check-in record counts who comes, and lists nobody's events", /We use the record to count who comes\. Nobody is shown one person&apos;s list of the events they came to\./],
  ["how many different people came to a term's events, counted for admins alone", /NAISI&apos;s admins also see how many different people came to a term&apos;s events, and how many came to two or more of them\. To count you once, we match your check-ins by your account and its email address, and a sign-up you made without an account by the email address you gave; a walk-in with no account is never matched\. Admins see these as counts only, on a page and in a file of totals, never as who came to which events\./],
  ["what a programme's surveys ask at the start, at the end and in the follow-ups, and an incubator's besides", /A programme&apos;s surveys ask about your level and subject of study, what you had done in AI safety before and how you first heard about NAISI; your career stage and plans, how likely you think you are to work on AI safety and the kinds of work that interest you; what you understand and know of the field, how many people in it you could contact, and how sure you are of your next step and of what you could contribute; what stands in your way and the steps you have taken; and what you want from the programme\. At the end and in the follow-ups they also ask how the programme went, what it changed, what else shaped your plans, what you are doing now and what you plan next\. An incubator&apos;s also ask about your research skills and what your team produced\./],
  ["every programme survey ends with the Kairos choice, and the answers count the same", /Every programme survey ends with what we share with Kairos, one of our funders, and a box to say no to it, which starts as you last left it\. Whatever you choose there, your answers are kept and counted the same\. See Sharing with Kairos, under Sharing and processors\./],
  ["who the survey after an event goes to, and who reads it", /After an event, NAISI&apos;s admins may send a survey to the people who came to it, or to everybody whose place on it was confirmed, and to nobody else\. It is confidential like every survey: your answers keep your name, and only NAISI&apos;s admins can see who said what and whether they came\. The event&apos;s organisers are told that it went and when, and nothing of its results\./],
  ["what the survey after an event asks", /The survey after an event asks how it was, whether you would come to another, what we should run next, how you heard about it and what we should change\./],
  ["the survey after an event's QR code, its email and what is kept with the answers", /At the end of an event its QR code opens the survey\. Signed in, you answer it there if you came or signed up, and its email afterwards skips you; signed out, it asks you to sign in\. Its email is an important notice, like every survey&apos;s, with a link of your own, sent to your account&apos;s address, or if you have no account to the address you gave when you signed up or at the door\. With your answers we keep when you sent them and whether you used your link or were signed in\./],
  ["the box under a long answer to tick a comment to be quoted", /Under each long answer, a programme&apos;s surveys and the survey after an event have a box that says &quot;You can quote this, without my name&quot;\. It starts unticked\. If you tick it, the tick is kept with that answer, and like the rest of your answers it cannot change once you send them\. The survey about leaving has no such box\./],
  ["what admins may publish on a programme's page, and nothing else", /NAISI&apos;s admins may publish, on a programme&apos;s page on our site, numbers worked out from that programme&apos;s own surveys, with how many people answered them, and comments whose writers ticked that box, each shown with the term and no name\. Nothing else of anybody&apos;s answers is published there, and nothing from the survey about leaving, a survey after an event or the anonymous form\. An admin can take it down at any time\./],
  ["an admin opening one person's answers, recorded first", /An admin can open one person&apos;s answers to a programme&apos;s surveys, or to a survey after an event, together on one page\. Each time, before anything of them is read, we record who opened them, whose they were, by an id and never by name, which surveys and when, and never what the answers say; if that record cannot be written, nothing of them is shown\. We keep that record when names come off and when an account is deleted, as we keep the record of downloads\./],
  ["the five kinds of download the record names", /A record of the spreadsheet downloads the site generates\. Five kinds are logged today, a membership list, the responses to a circulated worksheet, a programme&apos;s attendance, a survey&apos;s answers and the Kairos file, and each row holds who asked for it, what it covered, how many people were in it, and when\. See\{" "\} <a href="#courses">Courses and programmes<\/a> for what that does and does not cover\./],
  ["when you are free: changed after decision day by somebody holding a place, and the reminder to say it", /<strong>Your availability\.<\/strong> The grid where you mark the times you are free, in 15 minute steps between 9am and 9pm on each day of the week\. The people who read your application can see it, and we use it to build groups\. If you are given a place on a fellowship, you can also change it on your application page from decision day until we email you your group\. That change counts at once, without sending your application again, and the version it replaces is kept with your earlier versions\. Until then, if you have not said when you are free, the programme&apos;s lead or an admin may email you to ask, at most once a day, whatever your notification settings say\./],
  ["a freed place's offer on the application page, emailed whatever the settings say", /<strong>A place that comes back\.<\/strong> If somebody gives their place back after decision day, then until the end of the programme&apos;s first week its lead or an admin can offer that place to somebody who ranked the programme and was told no offer this time, as long as the programme had not turned them down\. If that is you, the offer is written onto your application and shown on your application page, and we email it to you whatever your notification settings say, with a day to reply by\. You answer it as you would an invitation\. The daily reminder about an invitation is not sent for these offers\./],
  ["being asked to facilitate: who asks, how it is emailed and answered, and what a yes does", /<strong>Being asked to facilitate\.<\/strong> If you said you would like to facilitate a group, then from decision day the lead of a programme you said you would facilitate, or an admin, may ask you to facilitate one of its groups\. We email you the ask whatever your notification settings say, because it answers what you said on your application, and while it waits for your answer we may send you up to three reminders, at least twelve hours apart\. You answer on our site, on a page that shows the ask to you and nobody else, by the day and time the ask gives\. If you say yes, you become one of that group&apos;s facilitators\. We keep a record of each ask: who asked you and when, which group it was for, the day and time to answer by, whether the email went, any reminders, your answer and when you gave it, and a copy of the email as it was sent, with the name it was sent to\. The record holds no email address\. The programme&apos;s lead and admins can see these records, and you can see your own ask on its page\. They are kept with the rest of your course record, and deleted with your account\. If you hold a place on that programme, saying yes also puts you in that group, as one of its people: a facilitator who holds a place sits in the group they facilitate\./],
  ["the calendar link: what it shows, who else can see it, replacing it, a leaver's, and deletion", /<strong>Your calendar link\.<\/strong> &quot;Add to calendar&quot; on your programme page gives you a private link to your sessions, which you can add to Apple Calendar, Google Calendar, Outlook or any calendar that subscribes to a link\. It shows the day, time and room of each session of your group \(and of any group you facilitate\), with the programme&apos;s and the group&apos;s name, and marks a session that is cancelled\. An online week says to join on naisi\.uk, never the meeting link\. It shows no names and no email address\. Once you add it, your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us every so often and keeps what it shows, under its own privacy policy, so a session that moves or is cancelled changes in your calendar too\. Anyone else holding the link can see the same, so keep it to yourself\. You can replace it at any time from the same place, and the old link then shows nothing\. If you leave a programme, no session after the day you left is in it\. It is deleted with your account\./],
  ["the notes a group's facilitators share go with their writer's account", /<strong>Notes facilitators share\.<\/strong> A group&apos;s facilitators can keep notes for each other about how their group is going, and a note can mention you by name\. The group&apos;s facilitators, the programme&apos;s lead and admins read them; nobody in the group does\. A note goes when the account of the facilitator who wrote it is deleted\. If you ask to see what is written about you, we will show you these notes too\./],
  ["written work: who reads it, saving and sending, the lock, Late, feedback and its email", /<strong>Your written work\.<\/strong> Your written answers, the feedback on them, and your progress through each week&apos;s materials\. A written answer is read by you, your group&apos;s facilitators, the programme&apos;s lead and admins, and by nobody else taking part; the week&apos;s page says so beside it\. If you facilitate a group, your own answer is read by the programme&apos;s lead and admins, and not by the group&apos;s other facilitators\. It saves as you type, and until you send it, the others who read it see only that you have started it, never what it says\. We record when you first send it, and when you change it after that\. You can change it until one of your group&apos;s facilitators opens it \(for a facilitator&apos;s own answer, the programme&apos;s lead or an admin\), or feedback is sent on it; we record when it was opened, and any of its readers can reopen it for you to change\. Its readers can see when you sent it, and whether that was after it was due\. Your own pages show when you sent it, but never mark it late\. Feedback is a level for each row of the course&apos;s rubric and a short comment, with the name of whoever gave it, and never a mark\. One short email tells you that feedback is waiting; the feedback itself stays on the site\. You can also keep a private note against a piece of material: it is never shown to the rest of your run or read out\. Your group&apos;s facilitators and admins can read it, with your name, and we use what it says to improve the course; if you facilitate the group, only admins read yours\. We do not publish anything you write to the rest of your group unless you choose to share it, apart from a line of a reflection your facilitators may read out without saying who wrote it \(see Reflections\), and we will not use anything you write in a course to make decisions about you outside the programme\./],
  ["pathways and cases: what is recorded and by whom, who sees it, a pick, and the ready box", /<strong>Pathways and cases\.<\/strong> Some weeks give you a pack to read, such as a pathway, and a case to give a short talk on\. When your facilitators hand these out on paper in a session, which ones you were given is recorded on the site, by them or by the programme&apos;s lead or an admin, and you see yours on that week&apos;s page\. Your group&apos;s facilitators, the programme&apos;s lead and admins see what everyone in the group was given; nobody else in your group sees yours\. If you facilitate the group you take part in, your co-facilitators see what you were given, as they see everybody&apos;s\. When a week lets you pick a pack yourself, we keep the one you picked, and you can change it until your session starts\. Your group&apos;s facilitators, the programme&apos;s lead and admins can see which one you picked, except that if you facilitate the group, your co-facilitators cannot\. You can say you are ready for your talk, and that is shown on your own pages and nobody else&apos;s\./],
  ["a week's boxes go with the account", /<strong>Boxes you fill in\.<\/strong> Some weeks have boxes for you to fill in, such as an action plan\. What you write saves as you type\. It is read by you, your group&apos;s facilitators, the programme&apos;s lead and admins, and by nobody else taking part; the page says so under the boxes\. If you facilitate a group, what you write is read by the programme&apos;s lead and admins, and not by the group&apos;s other facilitators\. If you leave the programme, the programme&apos;s lead and admins can still read it, and your group&apos;s facilitators and you no longer can\. It is deleted with your account\./],
  ["sealed predictions: filling in, sealing, opening, who reads a card, each admin opening recorded, and deletion", /<strong>Sealed predictions\.<\/strong> On a programme whose course has a card of predictions, a week&apos;s page gives you that card to fill in: each question asks for a percentage, a number on a scale or a sentence, and each answer saves as you type\. Once you seal your card, nobody can change it, you included, and you cannot read it again until your group&apos;s session before the week it opens in has ended and you open it there, after answering the same questions again\. You then see both side by side, and neither changes after that\. A card you never seal can no longer be changed once that session has ended, and you can still read it\. Your card is read by you and by admins, who can open anybody&apos;s at any time, and by nobody else: not your group&apos;s facilitators, not the programme&apos;s lead and not other fellows\. If you facilitate a group, its other facilitators do not read yours either\. Each time an admin opens a card, we record who opened it, whose card it was by account id, the course run and when, before anything on the card is read, and never what it says; if that record cannot be written, the card stays closed\. An admin cannot open their own card that way\. If you leave the programme, you no longer see your card, and admins still can\. Your card is deleted with your account, and when the programme&apos;s course run is destroyed\. The records of admins opening a card stay when an account is deleted, and are deleted when the run is destroyed\./],
  ["a facilitator can hold a place in the group they facilitate", /<strong>If you facilitate your own group\.<\/strong> A facilitator can also hold a place on the programme, in the group they facilitate\. If you do, you are one of the group&apos;s people as well: you are on its register, and whoever takes the register marks you, which can be you; you count towards who finished; and your written answers are not shown to the group&apos;s other facilitators, who do not give you feedback on them: the programme&apos;s lead or an admin does\. Before you can leave the programme, or be taken off it, the programme&apos;s lead or an admin takes you off the group&apos;s facilitators\./],
  ["reflections save as they are typed and get no feedback and no mark", /<strong>Reflections\.<\/strong> At stops in a week&apos;s readings you answer set questions in boxes that save as you type\. You, your group&apos;s facilitators, the programme&apos;s lead and admins can read your answers, and nobody else on the programme can; the week&apos;s page says so beside the boxes\. A facilitator may read a line of one out in the session without saying who wrote it, and the page where they choose lines shows them the words with no name beside them\. Reflections get no feedback and no mark\. If you facilitate a group, your own reflections are read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and nobody reads them out\./],
  ["a tick for each source of a week's readings", /<strong>Ticks\.<\/strong> Each source in a week&apos;s readings has a tick for you\. Your group&apos;s facilitators, the programme&apos;s lead and admins can see which sources you have ticked, with your name, and the week&apos;s page says so; nobody else on the programme can\. A tick never counts against you\. If you facilitate a group, the programme&apos;s lead and admins see yours, and the group&apos;s other facilitators do not\./],
  ["a note shared with a group: deleted by its writer alone, and with their account", /<strong>Notes shared with your group\.<\/strong> On a programme that places you in a group, each week&apos;s page has notes the people in your group and its facilitators share with each other\. A note you add is shown with your name, the day you wrote it and the week it was written on, to everyone in your group, its facilitators, the programme&apos;s lead and admins, and to nobody else; the page says so under the notes\. While you are in the group you can delete a note you wrote, and nobody else can\. If you leave the programme, the notes you shared stay with your group, as your marks stay on its register\. They are deleted with your account\./],
  ["pitching week: what a pitch holds, picks, and a pitch made a team", /<strong>Pitching week\.<\/strong> On an incubator, one week can be its pitching week\. You can pitch a project: a title, the paper you would replicate and your twist on it, alone or with a partner from your group\. Sending a pitch is choosing to share it: everybody in your group sees it, with your name and your partner&apos;s, and the pitch form says so\. You can also say which of your group&apos;s pitches you would join\. Nobody else in your group is told which ones you picked\. The programme&apos;s lead and admins see each pitch and how many would join it, but not who\. If the lead makes a pitch into a team, the people who said they would join it are put in that team \(see Teams\)\./],
  ["teams are put together by the lead or an admin, who can move anybody", /<strong>Teams\.<\/strong> On an incubator, the programme&apos;s lead or an admin puts the people taking part into teams\. The site can make a team from a pitch \(the people who pitched it, then people who said they would join it\) or, where the programme&apos;s own questions on the application asked you to rank its projects, from your ranking\. The lead can move anybody\. We then email you your team&apos;s name and the names of the people in it, and nothing else about them\./],
  ["a team's page: what it holds, who changes it, the hand-in and the check-ins, leaving and deletion", /<strong>Your team&apos;s page\.<\/strong> On an incubator, each team has a page of its own: its project, a weekly check-in, the team&apos;s links and its hand-in\. What anybody in the team writes there is seen by everybody in the team, the programme&apos;s lead and admins, and the page says so beside what you write\. Anybody in the team can change what is there\. The hand-in says who handed it in, and the lead and admins also see who last saved each week&apos;s check-in\. If you leave, what you wrote stays with your team; if your account is deleted, it stays and your name comes off it\./],
  ["who finished: arriving late counts, what a member is told, and certificates follow it", /<strong>Who finished\.<\/strong> Once a programme&apos;s last session is over, we mark as finished everybody who came to at least the number of sessions its lead has set\. Arriving late or leaving early counts as coming\. The lead can then change anybody&apos;s, and we record who changed it and when\. Only the lead and admins see that number, and the list with how many sessions each person came to and how many written answers they sent\. Your programme page then tells you that you finished, or that the programme has ended\. Somebody who did not finish is not told so\. Who finished decides who is sent a certificate\./],
  ["certificates: the email and its link, the PDF, Add to LinkedIn, who is not sent one, and whose choice it is", /When a programme ends, we will send a certificate to everybody the programme&apos;s record says finished it \(see Who finished\), and to each person who facilitated one of its groups\. A facilitator who held a place and finished is sent both\. The programme&apos;s lead or an admin sends each one as an email with a link to its page on our site\. The page shows your name, that you finished the programme or facilitated a group on it, the programme, the term, how many weeks it ran and the day it was issued\. It shows no email address, no photo and nobody else&apos;s name\. It starts private: until you turn its link on, only you can open it\. While the link is on, anyone holding it can open the page and check the certificate, and you can turn it off again at any time\. The link is not guessable and the page is not listed anywhere\. You can also download the certificate as a PDF\. A copy you have downloaded or passed on is yours, and outside our reach\. Add to LinkedIn sends nothing until you press it; if you do, your browser takes the certificate&apos;s title, the date and its link to LinkedIn\. Somebody who did not finish is not sent one, and is not told\. Making a certificate is part of running the programme\. Whether anybody else sees it is your choice\./],
  ["what facilitators rate at a programme's end, and that the ratings go to Kairos unless you say no", /Once a programme&apos;s last session is over, each group&apos;s facilitators rate the people taking part in it: how much they joined in discussion, their grasp of the material, how much improving AI outcomes seems to drive them, and whether they would recommend them for a more demanding next step\. On an incubator they also rate how strongly they support the person&apos;s research continuing, their research or technical skill, and how independently they can steer it\. Beside each rating we show how many sessions the person came to, read from the register, never typed in\. Nobody rates themselves, and two facilitators of one group never rate each other: a facilitator, who takes part in the group they run, is rated by the programme&apos;s lead or an admin, who can also rate anybody else on the programme\. Ratings are read only by the programme&apos;s lead, NAISI&apos;s admins, and the person who gave each one, who sees only their own\. They are never shown to the person rated, on any page or in any email\. Unless you have said no, the ratings you were given go to Kairos with your name \(see Sharing and processors\)\. We delete them two years after the programme&apos;s last session, and at once if the account of whoever gave or was given one is deleted\./],
  ["the five recorded downloads: who may take each, and what each file holds", /Staff sometimes need a spreadsheet: a register to take to a session, a roster, the applications for a round, a membership list\. Five of those downloads are recorded, with who asked for it, what it covered, how many people were in it and when: the membership list, the answers to a circulated worksheet, a programme&apos;s attendance, a survey&apos;s answers with names, and the Kairos file; only admins can download the last two\. The attendance file is for the programme&apos;s lead and admins\. It holds each person&apos;s group, name and marks, how many sessions they came to and the day they left, if they did, and never an email address or a note\. The survey file holds, for each person who answered, their name, when and how they sent their answers, whether their group had met by then, and the answers themselves, and never an email address\. The file of a survey after an event has no column about a group, and names a guest by the name they gave the event\. The Kairos file holds, for each person on a programme at its end who has not said no to sharing with Kairos, their name, the programme, how many sessions they came to, whether they finished and the ratings they were given at the end, and never an email address, who gave a rating or a survey answer\. All five refuse to hand over the file if that record cannot be written\. The event attendee list and the subscriber list are built in your browser and are not recorded\. We are being careful with that sentence: it means we log five of the files the site produces\. It does not mean we can track a file once it has been downloaded, and it does not cover somebody copying what is on their screen\./],
  ["what a programme's lead sees and does, from decision day to the end", /<strong>The lead of each programme<\/strong> sees everything a reviewer sees, and records the decision for that programme\. After decision day the lead can also offer a place that comes back\. The lead also reads the answers about facilitating of everybody who said they would like to facilitate the programme, whether or not they ranked it, and from decision day can ask them to facilitate one of its groups\. Once the programme is running, the lead places its people in groups, reads every register of its groups, the notes its groups&apos; facilitators share, and the notes each of its groups shares on its week pages, sees the pitches and makes the teams on an incubator, reads the reason somebody gives for leaving, and says who finished\. The lead also reads the reflections its groups&apos; people write and sees which sources each of them has ticked, a facilitator&apos;s own among them\. When it ends, the lead also reads the ratings given to the people on it, and rates its facilitators\. The lead also sees the totals and comments of the programme&apos;s surveys, never with a name \(see When you answer a survey\), and the average star rating of each piece of its course material once three people have rated it, never who gave which\. Admins see every application but their own, with your email addresses\. On decision day they are the only ones who choose what somebody no programme took will hear, and they send the decisions\. Only admins can open what you wrote under access requirements, and each time one does it is recorded\. A programme&apos;s lead cannot\./],
  ["what facilitators see, before the first session and at the end", /<strong>Facilitators<\/strong> \(students, in most cases only a year or two ahead of you\) see their own groups: who is in them, by name only, attendance, written work, the reflections the group&apos;s people write and which sources each of them has ticked, the private notes they keep on what they read, the participant notes their colleagues wrote about people in that group, and the notes the group&apos;s facilitators share with each other\. A facilitator never sees another facilitator&apos;s own reflections, ticks or private notes\. They never see your email address: they can email their group through the site without seeing anybody&apos;s\. Before the first session, they also see whether each person in their group has said they are coming\. Apart from that one reply, they see nothing from applications, and no review scores\. When a programme ends they rate the people in their group, and see only the ratings they gave, never anybody&apos;s rating of them\./],
  ["what other participants see, and nothing else", /<strong>Other participants<\/strong> on your run see your name\. On a programme anyone can join, they also see any comment or star rating you leave on a piece of course material; on a programme that places you in a group, the people in your group see the notes you share with it\. On an incubator, the people in your group also see any pitch you send, with your name, and the people in your team see that you are in it and anything you write on your team&apos;s page\. When a session is in pairs, the people in your pair see your first name and, where the week asks, whether you are bringing a laptop\. They see nothing else about you\./],
  ["checking people in at an event, among how we use data", /Check people in at an event, and count who comes\./],
  ["running courses, among how we use data", /Run our courses: assess applications, place people into groups that fit their availability, keep registers, give feedback on work, make teams on an incubator, record who finished and send certificates, and ask how the sessions are going\./],
  ["showing a programme's last term on its page, among how we use data", /Show on a programme&apos;s page how its last term went: numbers from its own surveys, and comments their writers ticked to be quoted, with no name\./],
  ["the transactional emails, that feedback is waiting among them", /Send you transactional emails you have asked for, such as RSVP confirmations, application receipts and reminders, the decision on an application, the week&apos;s course materials, that feedback on your written answer is waiting, and account-related messages\./],
  ["consent, quoting a comment among it", /<strong>Consent<\/strong> for sending you the newsletter and any other marketing-style communication, and for push notifications\. You can withdraw consent at any time using the unsubscribe link in any such email, the notification settings on your profile, or by emailing us\. Quoting a comment of yours on our site rests on your consent too, given by ticking the box under it, and if you email us we will take the quote down\. Important notices about something you have signed up for, such as an event you are attending or a course group you are in, are sent under performance of a contract rather than consent, so your notification settings do not switch them off, and they are never marketing\./],
  ["no automated decisions, who finished and teams among them", /<strong>No automated decisions\.<\/strong> No decision about you is made solely by automated means\. Scores are given by named reviewers, and a programme&apos;s score for an application is only the average of what those reviewers gave\. Where a programme uses scores, the site shows the people reviewing its applications which ones scored highest, as a guide\. On a programme, who finished starts from the number of sessions its lead chose, and the lead can change anybody&apos;s; on an incubator, the site can put teams together from pitches or rankings when the lead asks, and the lead can move anybody before telling people their team\. Where an admin asks Claude or Pangram about an application, what they say is one view the admin weighs beside the reviewers&apos;, and nothing is done because of it alone\. Every decision is taken by a person\./],
  ["what goes to Kairos, what Kairos does with it, and why we share it", /Kairos supports AI safety groups at universities and is one of our funders\. Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end: their name, the programme, how many sessions they came to, whether they finished, and the ratings they were given at the end \(described under Ratings at the end of a programme\)\. Kairos uses it to see what its support achieves and to point promising people towards work in AI safety\. We share it because it helps us make our case to our funders and sponsors, so leaving it on helps NAISI\. It never holds your email address, your survey answers, or who gave a rating\./],
  ["how long course records are kept", /<strong>Course applications and course records\.<\/strong>\{" "\} Applications are kept against your account for as long as it exists, so you can see what you sent us and so we can make sense of a later application from the same person\. We do not strip them after a fixed period\. The scores, comments and decisions about an application are kept for as long as it is\. The same goes for the rest of your course record: attendance, written work, feedback you gave us \(survey answers, below, are the exception\), and notes written about you\. If you want any of it removed sooner, email us\./],
  ["survey answers' names come off two years on, a survey after an event's two years after the event", /<strong>Survey answers\.<\/strong> We take your name off your answers to a survey on the day it tells you, two years after the programme&apos;s last session, and delete the record that it was sent to you, with your link to answer it and what you said about follow-ups\. Your answers stay in its totals, no longer linked to you\. For the survey after an event, that day is two years after the event\./],
  ["how long what is published from a programme's surveys stays", /<strong>What we publish from a programme&apos;s surveys\.<\/strong>\{" "\} The numbers and quotes on a programme&apos;s page stay there until an admin takes them down, or publishes that programme&apos;s again, which replaces them\./],
  ["how long ratings at a programme's end are kept", /<strong>Ratings at the end of a programme\.<\/strong> We delete them two years after the programme&apos;s last session, the day names come off its surveys\./],
  ["how long the Kairos choice is kept", /<strong>Your choice about Kairos\.<\/strong> Kept for as long as your account exists, so a later programme goes by it too\./],
  ["how long who came to an event is kept with names, and a walk-in's address", /<strong>Who came to an event\.<\/strong> We keep the record of who came with names for a year after the event, then take the names off and keep the count\. A walk-in&apos;s email address is deleted when the event&apos;s survey closes, or a week after the event if that comes first\./],
  ["what a deletion removes, every course record named", /<strong>What a deletion removes\.<\/strong> Your account record and profile, your newsletter subscriptions and their history, your collaborator application if you made one, any outstanding email-verification links, your course enrolments, applications and drafts, the asks to facilitate a group sent to you and your replies to them, your progress, your written answers with the feedback on them, your reflections and what you wrote in a week&apos;s boxes, the packs and cases recorded for you and whether you said you were ready for your talks, your pairs for a session, your sealed predictions, your calendar link, the notes you shared with a group, notes you wrote for the other facilitators of a group, your name on your survey answers, the record of each survey sent to you with your link to answer it, a pitch you sent alone, your name on a pitch you sent with a partner, your picks in pitching week, your place in a team, any decision a lead recorded about whether you finished, a certificate whose link is off, your admission applications together with the access-requirements answer stored separately beside them, the decisions recorded about those applications, the review scores and notes written about those applications and any you wrote about somebody else, a conduct flag if there is one, every rating you gave or were given at the end of a programme, your choice about sharing with Kairos, your membership records and the lines naming you on a Students&apos; Union membership file, and your sign-in record\. Your marks and the notes about you are stripped out of attendance registers, which stay for the rest of the group\./],
  ["survey answers stay in the totals after a deletion", /Your answers to surveys, no longer linked to you: they stay in the totals\./],
  ["a quoted comment after a deletion", /A comment of yours quoted on a programme&apos;s page: it carries no name, and with your account gone nothing links it to you\. Email us and we will take it down\./],
  ["the anonymous form's answers after a deletion", /Your answers to the anonymous form: nothing in them says they were yours, so there is nothing of yours to remove\./],
  ["the record that somebody came to an event, after a deletion", /The record that you came to an event, no longer linked to you: it stays in the count\./],
  ["a pitch sent with a partner, after a deletion", /A pitch you sent with a partner: it stays theirs, without your name\./],
  ["what somebody wrote on a team's page, after a deletion", /What you wrote on your team&apos;s page: it stays with your team, and your name comes off it\./],
  ["a certificate whose link is on, after a deletion", /<strong>A certificate whose link is on is a deliberate exception\.<\/strong> If its link is on when your account is deleted, its page is not removed, because it exists for the people you gave the link to and that is the moment you are least likely to still have an account with us\. Email us and we will withdraw it, account or no account\. A certificate whose link is off is deleted with your account\./],
  ["the audit-style records a deletion leaves, the openings of sealed predictions and survey answers among them", /Audit-style records are kept for as long as needed to investigate issues and meet our accountability obligations, and are not removed when an account is deleted\. These are records of what staff did rather than of what you wrote: the email send log, the subscription event log, the impersonation log used for committee oversight, the log of course actions including who read an access-requirements answer and each decision made about an application, the record of each time an admin opened somebody&apos;s sealed predictions or survey answers, and the record of the five downloads the site logs\. They name the person who took the action and what it concerned\. A log line about a decision on an application, or about an admin opening an access-requirements answer, identifies the applicant by their account&apos;s id and not by name, names the programme where there is one, and says what was done\. It never holds the answer that was opened\. Where an admin took an acceptance back, the line holds the reason they typed\. Those lines stay when the applicant&apos;s account is deleted, and go only if that term&apos;s applications are destroyed\. Apart from that reason, the logs hold no course answers, marks or notes, and no scores or reviewers&apos; comments\./],
  ["saying no to Kairos on the profile, among the rights you serve yourself", /Most of these are self-serve\. You can edit your profile and notification preferences, and say no to sharing with Kairos, from <a href="\/profile">your profile page<\/a>, and unsubscribe from any marketing email through the link in that email\. Important notices carry no unsubscribe link, because there is nothing there to switch off\. Deleting your account is by request: email\{" "\} <a href="mailto:ai-safety@uonsu\.com">ai-safety@uonsu\.com<\/a>\{" "\} and we will delete it\. There is no delete button on the site, because removing a member&apos;s work from the committee tooling is done by hand\./],
  ["a copy of your data covers what others wrote about you, the ratings you were given among it", /A request for a copy of your data covers what other people have written about you as well as what you wrote yourself\. For courses that means the scores and notes a reviewer recorded on your application, what each programme decided about it and any reason noted, the notes a facilitator wrote about you, the ratings you were given at the end of a programme, and the reason behind a conduct flag\. Ask us and we will tell you\. Where a record names somebody else as well as you we may need to redact their part of it\./],
];

describe("the courses section", () => {
  test("exists, is in the table of contents, and is linkable from the apply form", () => {
    assert.match(CURRENT, /id="courses"/);
    assert.match(CURRENT, /\{ id: "courses", label: "Courses and programmes" \}/);
    const notice = read("src/features/admissions/ApplicationPrivacyNotice.tsx");
    assert.match(
      notice,
      /COURSES_PRIVACY_HREF = "\/privacy#courses"/,
      "the in-form notice must link to the section anchor",
    );
  });

  for (const [what, pattern] of MUST_NAME) {
    test(`names ${what}`, () => {
      assert.match(
        CURRENT_FLAT,
        pattern,
        `the current policy's courses section no longer names ${what}. The section is ` +
          "the platform's one statement of what it holds about an applicant; " +
          "a category present in the product and absent from the page makes " +
          "the page wrong. Add it back, or remove the feature.",
      );
    });
  }

  test("push subscriptions are named too, outside the courses section", () => {
    assert.match(CURRENT_FLAT, /push subscription from your browser/i);
  });

  test("retention says applications are kept on the account", () => {
    assert.match(CURRENT_FLAT, /Applications are kept against your account/);
  });

  test("retention says what a deletion removes and what it leaves behind", () => {
    // The cascade (`accountDeletion.ts`) removes the account, its
    // applications and reviews, its memberships and its register marks, and
    // deliberately keeps memberRecords, worksheet responses and reviews,
    // tasks, RSVPs, the email log and every Storage object. The policy lists
    // both sides and names no period.
    assert.match(CURRENT_FLAT, /What a deletion removes/);
    assert.match(CURRENT_FLAT, /What a deletion leaves behind/);
    assert.match(CURRENT_FLAT, /scores and notes the reviewers\s+wrote/i);
    assert.match(CURRENT_FLAT, /Nothing in file storage is removed by an account deletion/);
    // Narrowly worded: v4 does promise to answer a rights request within 30
    // days, which is the statutory deadline and nothing to do with deletion.
    // What it may not do is promise that data GOES after a period unless a
    // job enforces one.
    assert.ok(
      !/30 days afterwards/i.test(CURRENT_FLAT) && !/delete or anonymise/i.test(CURRENT_FLAT),
      "v7 must not promise a deletion period unless a job enforces that " +
        "period.",
    );
    assert.ok(
      !/Deleting your account deletes/.test(CURRENT_FLAT),
      "v7 must not say deleting the account deletes everything about you: " +
        "the cascade keeps memberRecords, worksheet answers, tasks and RSVPs.",
    );
  });

  test("certificates are described as the owner decided: sent, and private until their owner turns the link on", async () => {
    // OWNER DECISION, 25 October 2026 (Q8 with Q26, as the boards draw them).
    // When a programme ends, its lead or an admin sends a certificate to
    // everybody its record says finished and to each of its facilitators.
    // Each starts private: only its owner can open it until they turn its
    // link on, and they can turn it off again. Making one is part of running
    // the programme; whether anybody else sees it is the owner's choice. That
    // replaces v6's model, in which a participant minted their own and
    // nothing was issued unless they asked, so the retention carve-out below
    // now turns on the link rather than on who chose to make the page.
    //
    // BUILT (src/lib/courses/certificates/, the page at /c/<code>, its PDF,
    // the send on a programme's Overview). The paragraph keeps its words: "we
    // will send" says what happens when each programme ends. It was worded
    // that way before anything was built, and this test used to fail the day
    // the site kept a certificate; it now holds each of its sentences to the
    // code that makes it true, as the rest of §2g does: a rule RUN, the tree
    // WALKED against a named list, or one line of source matched.
    const page = CURRENT.slice(CURRENT.indexOf("export default function")).replace(/\s+/g, " ");
    assert.match(page, /When a programme ends, we will send a certificate to everybody/i);
    assert.match(page, /The programme&apos;s lead or an admin sends each one as an email with a link to its page on our site\./i);
    assert.match(page, /It starts private: until you turn its link on, only you can open it\./i);
    assert.match(page, /While the link is on, anyone holding it can open the page and check the certificate, and you can turn it off again at any time\./i);
    assert.match(page, /The link is not guessable and the page is not listed anywhere\./i);
    assert.match(page, /A copy you have downloaded or passed on is yours, and outside our reach\./i);
    assert.match(page, /Add to LinkedIn sends nothing until you press it; if you do, your browser takes the certificate&apos;s title, the date and its link to LinkedIn\./i);
    assert.match(page, /Somebody who did not finish is not sent one, and is not told\./i);
    assert.match(page, /Making a certificate is part of running the programme\. Whether anybody else sees it is your choice\./i);
    // v6's model is gone, every clause of it.
    for (const gone of [/\bmint/i, /Nothing is issued unless you choose to/i, /agree that we may offer this/i]) {
      assert.ok(
        !gone.test(page),
        `v7 matches ${gone}: it describes v6's certificates, which a person minted for ` +
          "themselves. Under v7 they are sent, and start private.",
      );
    }

    // The retention carve-out that follows from it: the link, not who made
    // the page, decides whether it outlives the account.
    assert.match(page, /A certificate whose link is on is a deliberate exception\.<\/strong> If its link is on when your account is deleted, its page is not removed/i);
    assert.match(page, /Email us and we will withdraw it, account or no account\. A certificate whose link is off is deleted with your account\./i);
    assert.match(page, /any decision a lead recorded about whether you finished, a certificate whose link is off, your admission applications/i);

    const certificates = (file) => withoutComments(read(`src/lib/courses/certificates/${file}`));
    const model = await loadTs("lib/courses/certificates/model.ts");
    const face = await loadTs("lib/courses/certificates/face.ts");
    const linkedin = await loadTs("lib/courses/certificates/linkedin.ts");
    const send = certificates("send.ts");
    const record = certificates("record.ts");

    // "We will send a certificate to everybody the programme's record says
    // finished it (see Who finished), and to each person who facilitated one
    // of its groups." Two kinds and no other; the send's one reader of who
    // asks the finished record for the first and the groups' facilitators,
    // held to their standing, for the second. Nobody else is given one.
    assert.deepEqual([...model.CERTIFICATE_KINDS], ["finished", "facilitated"]);
    assert.deepEqual(model.DID_WORDS, { finished: "finished the", facilitated: "facilitated a group on the" });
    assert.match(send, /if \(recordOf\(row, finishing, end\)\?\.finished !== true\) continue;/);
    assert.match(send, /if \(member && holdsStanding\(member, "courseEnrolments\.uid"\)\) give\(row\.uid, "finished"\);/);
    assert.match(
      send,
      /if \(facilitator && isNamedWithStanding\(facilitator, "courseGroups\.facilitatorUids", entry\.group\.facilitatorUids\)\) \{\s*give\(uid, "facilitated"\);/,
    );
    assert.equal((send.match(/\bgive\(/g) ?? []).length, 2, "the send gives a certificate from somewhere new");
    // "The programme's lead or an admin sends each one as an email with a
    // link to its page": the press's gate, and the link in the email.
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

    // "While the link is on, anyone holding it can open the page and check
    // the certificate, and you can turn it off again at any time." The check
    // line is drawn only while it is on; the switch takes on and off, and
    // only from its owner.
    const snapshot = model.normalizeCertificate("run1__amara__finished", stored()).snapshot;
    assert.equal(face.faceOf("finished", snapshot, { host: "naisi.uk", code: "K7Q2M9XH4PWR3TDB" }).check, "Check it at naisi.uk/c/K7Q2M9XH4PWR3TDB");
    assert.equal(face.faceOf("finished", snapshot, null).check, null);
    assert.deepEqual(model.parseLinkSwitch({ linkOn: false }), { ok: true, value: { linkOn: false } });
    assert.deepEqual(model.parseLinkSwitch({ linkOn: true }), { ok: true, value: { linkOn: true } });
    assert.match(record, /if \(!cert \|\| !isOwner\(cert, viewer, false\)\) return refuse;/);

    // "The link is not guessable and the page is not listed anywhere." Eighty
    // bits from the operating system's random source, never the boards' six
    // characters; the page tells search engines to leave it, and nothing that
    // lists the site's pages names it.
    assert.ok(model.CODE_LENGTH * Math.log2(model.CODE_ALPHABET.length) >= 80, "a certificate's code is guessable");
    assert.equal(model.codeFrom("K7Q2M9"), null);
    assert.match(certificates("code.ts"), /const bytes = randomBytes\(CODE_LENGTH\);/);
    assert.match(read("src/app/(public)/c/[code]/page.tsx"), /robots: \{ index: false, follow: false \}/);
    for (const file of ["src/app/sitemap.ts", "src/app/robots.ts", "src/layout/PublicHeader.tsx", "src/layout/PublicFooter.tsx", "src/content/links.ts"]) {
      assert.doesNotMatch(read(file), /["'`]\/c\/|\/c\/\$\{/, `${file} names a certificate's page`);
    }

    // "The page shows your name, that you finished the programme or
    // facilitated a group on it, the programme, the term, how many weeks it
    // ran and the day it was issued. It shows no email address, no photo and
    // nobody else's name." What a certificate keeps is exactly those words,
    // with the course's credit line (the course's, not the person's), and
    // anything else stored beside them is never read; every drawing of it
    // draws that view and no other field.
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

    // "Add to LinkedIn sends nothing until you press it; if you do, your
    // browser takes the certificate's title, the date and its link to
    // LinkedIn." A plain address, built for the person's own browser: the
    // title, the year and month, the link, and the word that says which of
    // LinkedIn's forms to open. Nothing else in the tree names that form.
    const href = new URL(
      linkedin.linkedInHref({ kind: "finished", programme: "AGI Strategy Fellowship", issuedAt: new Date("2026-12-14T10:00:00Z"), url: "https://naisi.uk/c/K7Q2M9XH4PWR3TDB" }),
    );
    assert.deepEqual([...href.searchParams.keys()], ["startTask", "name", "issueYear", "issueMonth", "certUrl"]);
    assert.deepEqual([...linkedin.LINKEDIN_PARAMETERS], ["startTask", "name", "issueYear", "issueMonth", "certUrl"]);
    assertExactlyTheseFiles(
      sourceFilesNaming(/linkedin\.com\/profile\/add/),
      new Map([["src/lib/courses/certificates/linkedin.ts", "builds the one address Add to LinkedIn opens, with the title, the date and the link"]]),
      "the places that send something to LinkedIn",
      "v7 says Add to LinkedIn takes the title, the date and the link, and nothing else. Build any address for it in linkedin.ts.",
    );

    // "A copy you have downloaded or passed on is yours": only its owner
    // downloads one, whether or not its link is on.
    assert.match(record, /if \(!cert \|\| !isOwner\(cert, viewer, viewAs\)\) return null;/);

    // "A certificate whose link is off is deleted with your account", and
    // one whose link is on is kept without it; destroying a run does the
    // same. The sweeps, a line each (both run in
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
      "Hold what it does to v7's words (sent by the programme's lead or an admin to who finished and to " +
        "facilitators, private until the owner turns the link on, the page showing no email address, photo " +
        "or other name, and a link that is off deleted with the account), and list it here with its reason.",
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
    assert.match(
      CURRENT_FLAT,
      /Turning notifications off deletes it, and so does deleting\s+your account/i,
    );
    assert.ok(
      !/deleting your account\s+does not/i.test(CURRENT_FLAT),
      "v7 still says deleting the account keeps the push record; the cascade " +
        "removes it.",
    );
    assert.ok(
      !/push notification record for any device/i.test(CURRENT_FLAT),
      "the push record is still listed among what a deletion leaves behind.",
    );
  });

  test("deletion is by email, not a button", () => {
    // POST /api/account/delete answers 409 for any account with a users or
    // collaborators document; an admin runs the cascade.
    assert.match(CURRENT_FLAT, /There is no delete button on the site/);
    // The other end of the same door: declining an updated policy signs you
    // out, and email is then the only way to have the account removed.
    assert.match(CURRENT_FLAT, /Declining signs you out, and you can then email\s+us to have the account removed/i);
  });

  test("the export sentence is not upgraded to a promise the code cannot keep", () => {
    // The wording is deliberately about what the SITE generates, so it does
    // not say that every export is logged.
    assert.ok(
      !/every export is logged/i.test(CURRENT_FLAT),
      "v7 must not claim every export is logged: the policy speaks only of " +
        "the exports the site itself generates.",
    );
  });

  test("the OWNER TO CONFIRM block is gone from the current policy", () => {
    // The wording of a privacy policy is the owner's. The current policy
    // carries no block of open questions for the owner. v3 keeps its own
    // list, which §1b checks, because v3 is frozen.
    assert.ok(
      !/OWNER TO CONFIRM/.test(CURRENT),
      "v7 carries an OWNER TO CONFIRM block again: resolve it with the owner " +
        "before merging, then delete it.",
    );
  });

  test("the disclosures of what the site does are all still in the policy", () => {
    // Each of these is something the site does that the policy has to say. A
    // future edit that drops one puts the policy out of step with the code.
    for (const [name, pattern] of [
      ["email-and-password accounts and the signup record", /create an account with an email address/i],
      ["external collaborator applications", /apply as an external collaborator/i],
      ["the SU membership file as received", /keep the file as we received it/i],
      ["Google reCAPTCHA as a processor", /Google reCAPTCHA/],
      ["reCAPTCHA as the one exception to no tracking cookies", /one exception is Google reCAPTCHA/i],
      ["the session cookie by name", /__session/],
      ["the view-as cookie by name", /__impersonator/],
      ["the last-route local storage key", /naisi\.lastRoute/],
      ["view as, as a processing activity", /open the site as you see it/i],
      ["the worksheet recipient picker's readers", /permission to circulate a worksheet/i],
      ["names are shown to whoever reads an application", /They see your name/],
      // A comment on a run anyone can join, the group's notes on one that
      // places people in groups. The entry this replaces, "any comment or
      // star rating you choose to leave", said the run saw a comment on every
      // programme; §2g holds the new sentence to the week page.
      ["what other participants see", /<strong>Other participants<\/strong> on your run see your name\. On a programme anyone can join, they also see any comment or star rating you leave on a piece of course material; on a programme that places you in a group, the people in your group see the notes you share with it\./i],
      ["the push record carries the account", /carries\s+your account so we know where to send/i],
      ["re-consent is the notice, not an email", /asked to accept\s+or decline it/i],
      ["the statutory response time", /respond within 30 days/i],
      ["no solely automated decisions", /No decision about you\s+is made solely by automated means/i],
      ["children", /do not\s+knowingly collect data from anyone under 16/i],
      ["RSVP dietary and accessibility answers are given by explicit consent", /dietary and accessibility\s+answers you give on an event signup form/i],
      ["the Google profile photo is fetched from Google by the visitor", /visitor&apos;s browser fetches it from Google&apos;s servers/i],
      ["a video thumbnail in an email is fetched from YouTube", /fetches\s+that thumbnail from YouTube/i],
      // Five since the Kairos file joined the log after a survey's answers:
      // §2g walks the tree for every caller of `logExport` and holds the list
      // to exactly five, and holds this sentence's kinds to that walk. The
      // pattern this replaces named four, ending at a survey's answers, which
      // stayed on the page after the Kairos file joined (privacy pass 2).
      ["the export log names the kinds that exist", /Five\s+kinds are logged today, a membership list, the\s+responses to a circulated worksheet, a programme&apos;s\s+attendance, a survey&apos;s answers and the Kairos file,/i],
      ["Google's sign-in script and where it is loaded from", /sign-in script is loaded from/i],
    ]) {
      assert.match(CURRENT_FLAT, pattern, `the current version no longer says: ${name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// §2b The committee tooling passage
// ---------------------------------------------------------------------------

/**
 * The courses section above is about what the platform holds on an APPLICANT
 * or a participant. What it holds on a committee member (tasks, comments,
 * attachments, and now worksheet activity) is a different passage under "Data
 * we collect", and the tests for it belong here rather than filed under
 * courses.
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
    assert.match(CURRENT_FLAT, /how many times you moved between its pages/i);
    assert.match(CURRENT_FLAT, /sampled in half-minute steps/i);
    assert.match(CURRENT_FLAT, /We do not record which page you were on, what you typed, or when you pasted/i);
    assert.ok(
      !/how many times you opened each page/i.test(CURRENT_FLAT),
      "v7 claims a per-page open count again; the code keeps one running total.",
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
 * Two of the tests are the two-layer half: the claim "never marketing" is made
 * to the member twice, once on this page and once in the marker line at the top
 * of the notice itself, and the promise that the lane carries no unsubscribe
 * link is held against the door that would have to grow one. Copy on the page
 * and behaviour in `src` are one promise made in two places, and they have to
 * move together.
 */
describe("the notification grid passage", () => {
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
      CURRENT_FLAT,
      /by category, with a separate email choice and notification choice for each/i,
      "the current version no longer says a category carries an email choice AND a notification " +
        "choice. The grid stores two parallel maps, and the page is where a " +
        "member is told that.",
    );
    assert.match(
      CURRENT_FLAT,
      /the newsletter, event announcements, course announcements, and tasks and worksheets/i,
      "v7 no longer names the four rows the grid draws.",
    );
  });

  test("the newsletter and event announcements go to people who opted in, and the account set-up form's two switches start off", () => {
    // OWNER DECISION, 7 October 2026: on the account set-up form the email
    // switches for the newsletter and for event announcements start switched
    // OFF. The page says those emails go to people who have opted in, and a
    // switch that starts on is not somebody opting in. So the sentence and
    // where the switches start are held together here.
    assert.match(
      CURRENT_FLAT,
      /Send you the newsletter and event announcements where you have opted in to those\./i,
    );
    assert.ok(
      !/left them switched on/i.test(CURRENT_FLAT),
      "v7 says the newsletter and event announcements also go to somebody " +
        "who left a switch on. The account set-up form's two switches start " +
        "off, so nobody is in that position.",
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
        "announcements no longer start switched off, so the policy's \"where " +
        "you have opted in\" is not true of somebody who never touched them. " +
        "Decide which is right and move the other.",
    );
    // Joining from the application form is the other way to make an account,
    // and it starts both off too: §2d runs that request.
    assert.equal(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories.newsletter, false);
    assert.equal(notificationPrefs.DEFAULT_NOTIFICATION_PREFS.categories.events, false);
  });

  test("says the notification choice is separate from the email choice", () => {
    assert.match(
      CURRENT_FLAT,
      /Each category has its own notification choice, set separately from its email choice/i,
      "v7 still describes push as one blanket choice, or as following the " +
        "email one. Every row has its own push cell, resolved by " +
        "src/lib/push/preferences.ts independently of the email cell.",
    );
    assert.match(
      CURRENT_FLAT,
      /a notification can still arrive for a category whose email you have switched off/i,
      "v7 no longer states the consequence a member actually meets: the task " +
        "and worksheet senders mirror to push after an email their row " +
        "skipped, and the cell copy in src/lib/firestore/notifications.ts " +
        "promises exactly that.",
    );
  });

  test("puts important notices under contract rather than consent", () => {
    assert.match(
      CURRENT_FLAT,
      /sent under performance of a contract rather than consent/i,
      "v4's Consent basis no longer carves out the notice lane. Without the " +
        "sentence the page promises that the notification settings switch off " +
        "every message, and an organiser's room change ignores them by design.",
    );
    assert.match(CURRENT_FLAT, /notification settings do not switch them off/i);
    assert.match(CURRENT_FLAT, /they are never marketing/i);
  });

  test("carves the notice lane out of the unsubscribe promise as well", () => {
    // The same defect in a second place. "Unsubscribe from any email through
    // the link in that email" is a promise the lane cannot keep:
    // src/lib/email/notice.ts takes no listUnsubscribe and neither notice
    // template carries a footer, on purpose. The two carve-outs are one
    // decision and have to move together.
    assert.match(
      CURRENT_FLAT,
      /unsubscribe from any marketing email through the link in that email/i,
      "v4's rights paragraph promises an unsubscribe link on every email " +
        "again. Transactional mail and the notice lane both ship without one.",
    );
    assert.match(
      CURRENT_FLAT,
      /Important notices carry no unsubscribe link/i,
      "v7 no longer tells a member the notice lane has no unsubscribe link, " +
        "while src/lib/email/notice.ts still refuses to grow one.",
    );
    const notice = read("src/lib/email/notice.ts");
    assert.ok(
      !/listUnsubscribe\s*\??\s*:/.test(notice),
      "sendNotice has grown a listUnsubscribe field, so the sentence the " +
        "policy now carries about the lane is the wrong shape.",
    );
  });

  test("the notice itself makes the same promise to the same person", () => {
    const marker = read("src/emails/NoticeMarker.tsx");
    assert.match(
      marker,
      /it is never marketing/i,
      "the marker line above every notice no longer says it is not marketing, " +
        "which is the claim privacy v4 makes on its behalf. The two are one " +
        "promise made in two places and have to move together.",
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
      CURRENT_FLAT,
      /They see your name\. Nothing hides who you are from the people who read, score and decide your application/i,
      "v7 no longer tells an applicant that the people reading their application " +
        "know whose it is. The form does not say it, so this page has to.",
    );
    for (const stale of [/name-blind/i, /the application form will say so/i]) {
      assert.ok(
        !stale.test(CURRENT_FLAT),
        `v7 matches ${stale}: it promises a review with names hidden, or a form that ` +
          "says when they are shown. An application form does neither.",
      );
    }
    // "Without your name" is how v5 promised a review with names hidden ("they
    // see your application without your name"), and until v7 the words were
    // pinned out of the page altogether. v7 says them once, about something
    // else: a pitch sent with a partner stays the partner's, without the name
    // of somebody whose account is deleted. That sentence is the one place on
    // the page they may appear, so any other use of them still fails here.
    const withoutYourName = [...PAGE_FLAT.matchAll(/without your name/gi)];
    assert.equal(
      withoutYourName.length,
      1,
      "v7 says \"without your name\" somewhere other than the pitch a partner " +
        "keeps: it promises a review with names hidden, or says something a " +
        "reader could take for one. An application form hides no name.",
    );
    assert.match(PAGE_FLAT, /A pitch you sent with a partner: it stays theirs, without your name\./);
    assert.ok(
      !/without your name/i.test(CURRENT_FLAT.slice(0, CURRENT_FLAT.indexOf("export default function"))),
      "the policy file's header says \"without your name\", which this check held " +
        "out of the whole file before v7. The one use it allows is the page's.",
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

  test("readers are shown when an account is still waiting, and the page says so", () => {
    // Not part of the application, and shown beside it: the list a reviewer
    // works from and the screen that reads one application both mark an
    // applicant whose request to join has not been approved yet.
    assert.match(
      PAGE_FLAT,
      /whether a programme you ranked higher has accepted you, and whether your request to join NAISI is still waiting/i,
      "the current version no longer says that the people who read an application are shown " +
        "when its owner's request to join is still waiting.",
    );
    assert.match(
      read("src/lib/applications/review/board.ts"),
      /accountWaiting: pendingUids\.has\(application\.uid\),/,
      "the list of applications no longer marks a waiting account, so the " +
        "policy says reviewers see something they are not shown.",
    );
    assert.match(
      read("src/lib/applications/review/load.ts"),
      /accountWaiting: pendingUids\.has\(applicantUid\),/,
      "the review screen no longer marks a waiting account, so the policy " +
        "says reviewers see something they are not shown.",
    );
  });

  test("feedback is not promised, and the right to a copy of what reviewers wrote is where the page points", () => {
    // The sentence that promised to tell an applicant what a reviewer wrote
    // has gone from the passage about reviewing, and the passage points at
    // "Your rights" instead. So that section has to go on saying it.
    assert.ok(
      !/If you ask us what a reviewer wrote about your application, we will tell you/i.test(PAGE_FLAT),
      "v7 promises again, where it describes reviewing, to tell an applicant " +
        "what a reviewer wrote. Feedback is not promised: the right to a copy " +
        "of the data is, under Your rights.",
    );
    const rights = PAGE_FLAT.slice(PAGE_FLAT.indexOf('<section id="your-rights"'), PAGE_FLAT.indexOf('<section id="security"'));
    assert.ok(rights.length > 500, "could not find the Your rights section of the page");
    assert.match(rights, /Ask for a copy of the personal data we hold about you\./i);
    assert.match(
      rights,
      /A request for a copy of your data covers what other people have written about you as well as what you wrote yourself\. For courses that means the scores and notes a reviewer recorded on your application/i,
    );
    assert.match(rights, /Ask us and we will tell you\./i);
    // And the passage's pointer is a link to that section.
    assert.match(PAGE_FLAT, /is under(?:\{" "\})? <a href="#your-rights">Your rights<\/a>\./);
  });

  test("admins see every application but their own, on every screen the committee reads applications from", () => {
    assert.match(PAGE_FLAT, /Admins see every application but their own, with your email addresses/i);
    assert.ok(
      !/Admins see every application, with your email addresses/i.test(PAGE_FLAT),
      "v7 says again that an admin sees every application. An admin who has " +
        "applied is not shown their own on any committee screen.",
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
    // The page says an admin who opens the site as somebody sees it is given
    // nothing they could not already see, and that the people reading an
    // application see what was last sent and never the draft. A draft is
    // seen by its author alone, so a session borrowed from them must not be
    // shown it.
    assert.match(PAGE_FLAT, /Doing so does not give them anything they could not already see/i);
    assert.match(PAGE_FLAT, /see what you last sent, never the draft/i);
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

  test("the access-requirements box is where the page says, apart from the application, and only an admin opens it", () => {
    // OWNER DECISION, 7 October 2026: the box is on the form, on its last
    // step. `createForm` writes an empty `accessRequirementsPrompt`, and that
    // is NOT what says whether the form has the box: the box asks a fixed
    // question of its own and reads no prompt. What makes the sentence true
    // is the step that draws the box.
    assert.match(PAGE_FLAT, /On the application form for the fellowships and the incubator it is on the last step/i);
    assert.ok(
      !/does not have a box for these/i.test(PAGE_FLAT),
      "v7 says the application form has no access-requirements box. It has one.",
    );
    assert.match(
      read("src/features/applications/apply/CheckStep.tsx"),
      /\{accessRequirements\}/,
      "the last step of the form no longer draws the access-requirements box, " +
        "so the policy describes a box an applicant cannot find.",
    );

    // "Stored separately ... in a different place in our database", and "not
    // part of the application you send": it has a collection of its own, and
    // the shape of a draft and of a sent application has no field for it.
    assert.match(PAGE_FLAT, /It is not part of the application you send: it is saved as you type/i);
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

    // "Only site admins can open it ... A programme's lead cannot": the one
    // reader refuses anybody `canRunTerm` refuses, and that is an admin and
    // nobody else. An application form has no final decider, so the page must
    // not promise one can open it.
    assert.match(
      PAGE_FLAT,
      /Only site admins can open it, they have to open it deliberately, one application at a time, and every time one of them does we record who read it and when/i,
    );
    assert.match(PAGE_FLAT, /A programme&apos;s lead cannot open them either/i);
    assert.match(PAGE_FLAT, /Only admins can open what you wrote under access requirements, and each time one does it is recorded\. A programme&apos;s lead cannot\./i);
    assert.ok(
      !/person making the final decision/i.test(PAGE_FLAT),
      "v7 names a person making the final decision. An application form has " +
        "none, and nobody but an admin can open an access-requirements answer.",
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

    // "Every time one of them does we record who read it and when": the read
    // and its record are one transaction, the record is of the kind the log
    // keeps for it, and it holds whose answer by account id and never the
    // answer.
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
    assert.match(PAGE_FLAT, /It never holds the answer that was opened/i);

    // "Once you have sent your application an admin who opens it reads
    // whatever is there": a draft's answer is nobody's to open.
    assert.match(PAGE_FLAT, /once you have sent your application an admin who opens it reads whatever is there at that moment/i);
    assert.match(reader, /if \(!application\?\.sent\) return NOT_FOUND;/);
  });

  test("replies to a decision email go where the page says", () => {
    assert.match(CURRENT_FLAT, /a reply to it goes to/i);
    assert.match(CURRENT, /mailto:ai-safety@uonsu\.com/);
    assert.match(
      read("src/lib/applications/decisionDay/emailCopy.ts"),
      /DECISION_REPLY_TO = "ai-safety@uonsu\.com"/,
      "decision-day mail no longer replies to the address the policy names.",
    );
  });

  test("the reminder's off switch is the one the page names", () => {
    assert.match(
      CURRENT_FLAT,
      /Switching off the email choice for course announcements on your profile stops these reminders/i,
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
    assert.match(PAGE_FLAT, /and only admins can read it/i);
    assert.ok(
      !/SU-recognised committee members can read it/i.test(PAGE_FLAT),
      "v7 still says SU-recognised committee members can read the short record.",
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
    // "None of the comments reviewers left on single answers": the record's
    // builder copies the overall comment and never reads the per-answer ones.
    assert.match(PAGE_FLAT, /none of the comments reviewers left on single answers/i);
    const record = read("src/lib/firestore/memberRecords.ts");
    assert.match(record, /notes: str\(review\.overallComment,/);
    assert.ok(
      !/review\.comments\b/.test(record),
      "the member record now reads a reviewer's comments on single answers, " +
        "which the policy says it does not keep.",
    );
  });

  test("a deletion removes the decisions, and the log lines hold an account id and never a name", () => {
    assert.match(PAGE_FLAT, /the decisions recorded about those applications/i);
    assert.match(
      read("src/lib/firestore/accountDeletion.ts"),
      /collection\("admissionDecisions"\)/,
      "account deletion no longer removes decision documents, which the policy " +
        "lists among what a deletion removes.",
    );

    // OWNER DECISION, 7 October 2026: a line about a decision says "an
    // applicant" and holds their account id. The log is kept when an account
    // is deleted, so a line must not be what goes on naming somebody who has
    // asked to be forgotten.
    assert.match(
      PAGE_FLAT,
      /A log line about a decision on an application, or about an admin opening an access-requirements answer, identifies the applicant by their account&apos;s id and not by name/i,
    );
    assert.ok(
      !/names the applicant and the programme/i.test(PAGE_FLAT),
      "v7 still says a decision's log line names the applicant.",
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

    // "Where an admin took an acceptance back, the line holds the reason they
    // typed", which is why the page cannot say the logs hold no notes at all.
    assert.match(PAGE_FLAT, /Where an admin took an acceptance back, the line holds the reason they typed/i);
    assert.match(sentences, /`Reason: \$\{input\.reason\}`/);

    // "Go only if that term's applications are destroyed", the lines about an
    // opened access-requirements answer included: every one is keyed to its
    // form, and a destroy drains the log by that key.
    assert.match(PAGE_FLAT, /and about each time an admin opened an access-requirements answer/i);
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
      /We keep up to ten earlier versions: the first one you sent, and the most recent ones after it/i,
    );
    // The rule itself, run: twelve versions replaced one after another leave
    // ten, the first one sent is still the first, and the two that went are
    // the oldest after it.
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
    // "It does not show ... the earlier versions you sent": what an applicant's
    // own requests are answered with is built field by field and names none
    // of the history.
    assert.match(PAGE_FLAT, /or the earlier versions you sent/i);
    assert.ok(
      !/sentHistory/.test(read("src/lib/applications/applicant/project.ts")),
      "an applicant is now sent their own earlier versions, which the policy " +
        "says their page does not show.",
    );
  });

  test("giving a place back asks for a reason, kept with the application and nowhere that outlives it", () => {
    assert.match(
      PAGE_FLAT,
      /To do either you choose a reason from a short list, or write a few words of your own\. Your reason is kept with your application, where the people who can read your application can see it/i,
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
      "a place can be given back with no reason again, so the policy's " +
        "sentence saying one is asked for is no longer what happens.",
    );
    // "No reason you gave for giving a place back" is in the short record,
    // which outlives the application, or in the log.
    assert.match(PAGE_FLAT, /no reason you gave for giving a place back/i);
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
    // it, and it bears on no decision.
    assert.match(PAGE_FLAT, /It is shown to admins only, and it does not affect whether you are offered a place/i);
    assert.ok(
      !/It is not shown to the people who read your application, and it does not affect/i.test(PAGE_FLAT),
      "v7 says again that nobody who reads an application is shown the answer. " +
        "An admin is, on the decision-day page.",
    );
    // The membership record is a different thing, and the screens where
    // applications are read show it to nobody (the next test walks for it).
    assert.match(
      PAGE_FLAT,
      /Your membership record \(see membership below\) is separate, and is not shown to the people who read your application\./i,
    );

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
      "The policy says the answer is shown to admins only, and that it does " +
        "not affect whether a place is offered. If this file shows it to " +
        "anybody else, or reads it where applications are decided, " +
        "recommended or ordered, the sentence is wrong and a new version has " +
        "to say so.",
    );

    // "Shown to admins only": the decision-day page is built in three places,
    // and each has answered everybody who is not an admin, and left, first.
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

    // "It does not affect whether you are offered a place": the builder reads
    // it in one expression, beside a name, and nothing that decides,
    // recommends or orders applications names it at all. The list above
    // already says so; these are named so that a failure says which half of
    // the sentence went.
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
          "scoring, and the policy says the answer does not affect whether a " +
          "place is offered.",
      );
    }
  });

  test("a conduct flag and the membership tier reach no screen where applications are read", () => {
    assert.match(
      PAGE_FLAT,
      /The flag and the reason are visible to admins alone: neither is shown on the screens where applications are read and scored/i,
    );
    assert.match(
      PAGE_FLAT,
      /They do not see your answer about SU membership, access requirements, the membership tier, or a conduct flag/i,
    );
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
      "The policy says a flag and its reason are shown to admins alone, and on " +
        "no screen where applications are read and scored. If this file shows " +
        "one there, the sentence is wrong and a new version has to say so.",
    );
    // The membership record is a collection of its own with its own readers.
    // Nothing in the application system's folders names it.
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
        "The policy says the people who read an application are not shown the " +
        "membership tier.",
    );
  });

  test("what is typed on the form's first step is kept in the tab it was typed in, for a day, until the join request is sent", (t) => {
    // The step keeps what somebody types in the tab's own session storage,
    // for every way of making an account. The paragraph says so in a
    // sentence of its own, ahead of the one about the copy that crosses
    // tabs, so that each copy's limits are said once and are its own. This
    // test is that one sentence's pin and nothing else's: the sentence and
    // the test come out together.
    assert.match(
      PAGE_FLAT,
      // The JSX keeps the space before the key with `{" "}`, so allow for it.
      /If you start an application before you have an account, what you type on the form&apos;s first step is kept in that browser tab, in its session storage under a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>: the copy in the tab is removed when your request to join is sent, it is ignored once it is a day old, and it goes when you close the tab\./i,
    );
    assert.ok(
      PAGE_FLAT.indexOf("is kept in that browser tab") < PAGE_FLAT.indexOf("is kept in your browser&apos;s local storage"),
      "the sentence about the tab's own copy has to come before the one about " +
        "the copy that crosses tabs: the second one's own words (\"also there\", " +
        "\"The copy in your browser\") are read against it.",
    );

    // "In that browser tab, in its session storage", which is also why "it
    // goes when you close the tab": the keeper's own store is session
    // storage, and every change to the answers is written there, whichever
    // way of making an account the person goes on to choose.
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
    // "Under a key beginning naisi.apply.join".
    assert.deepEqual([...tab.items.keys()], ["naisi.apply.join:the-tabs-own"]);
    assert.deepEqual(keptAnswers.loadKept("the-tabs-own"), typed, "the tab was not given back what was typed in it");

    // "It is ignored once it is a day old."
    const now = Date.UTC(2026, 9, 7, 12);
    const packed = joinRules.packKept(typed, now);
    assert.equal(joinRules.KEPT_MAX_AGE_MS, 24 * 3_600_000);
    assert.ok(joinRules.readKept(packed, now + 24 * 3_600_000), "the tab's own answers are no longer read back within the day");
    assert.equal(joinRules.readKept(packed, now + 24 * 3_600_000 + 1), null, "the tab's own answers were believed for more than a day");

    // "The copy in the tab is removed when your request to join is sent."
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
    assert.match(PAGE_FLAT, /You can start the form without an account/i);
    // OWNER DECISION, 7 October 2026: what is typed before there is an
    // account may be kept where another tab of the browser can read it, with
    // three limits: only for somebody who continues with an email address
    // (the emailed link opens in a tab of its own), for an hour at most, and
    // until the request to join has been sent. The page says each of the
    // three, and each is held to the code below.
    assert.match(
      PAGE_FLAT,
      // The JSX keeps the space before the key with `{" "}`, so allow for it.
      /If you start an application before you have an account and choose to continue with an email address, what you typed on the form&apos;s first step is kept in your browser&apos;s local storage, under a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>, so that it is also there in the tab our emailed link opens/i,
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

    // "Your answers to that step and the time you typed them, and nothing
    // else": the rule that packs them, run on more than it should keep.
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
      /It is your answers to that step and when you last changed them, and nothing else: no password, no sign-in address, and not whether you agreed to our terms/i,
    );
    assert.match(PAGE_FLAT, /Those answers are not sent to us until you have signed in/i);

    // LIMIT 1, "and choose to continue with an email address". Run: on a page
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

    // "So that it is also there in the tab our emailed link opens", and what
    // crosses is the tab's own text: the same answers and the same time.
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

    // LIMIT 2, "it is ignored once it is an hour old". The rule, run at the
    // hour and a millisecond past it, and then the function itself.
    assert.match(
      PAGE_FLAT,
      /The copy in your browser is removed when your request to join is sent, and it is ignored once it is an hour old\./i,
    );
    assert.equal(joinRules.ACROSS_TABS_MAX_AGE_MS, 3_600_000);
    assert.ok(joinRules.readKept(packed, now + 3_600_000, joinRules.ACROSS_TABS_MAX_AGE_MS));
    assert.equal(joinRules.readKept(packed, now + 3_600_001, joinRules.ACROSS_TABS_MAX_AGE_MS), null);
    assert.ok(keptAnswers.acrossTabs("link-asked", "read", now + 3_600_000), "the copy was not believed within its hour");
    assert.equal(keptAnswers.acrossTabs("link-asked", "read", now + 3_600_001), null, "a copy more than an hour old was believed");
    assert.equal(shared.items.size, 0, "a copy past its hour was left in local storage");

    // LIMIT 3, "removed when your request to join is sent": the step forgets
    // straight after the join request, and forgetting is both copies.
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
    // announcements": the join request the step sends, run.
    assert.match(
      PAGE_FLAT,
      /Joining this way does not sign you up to the newsletter or to event announcements: both start switched off until you choose them/i,
    );
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
      /A waiting account cannot send its application until the university email address on it has been verified/i,
    );
    assert.match(PAGE_FLAT, /until that address has been verified you can save your application but not send it/i);
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
      /The application form does not ask that question: its last step says that sending your application is agreeing to this policy, with the date it was last updated/i,
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
    // "Does not ask that question": the form is a public page, outside the
    // layout the re-consent gate lives on (§3).
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
 * a walk of the tree.
 */
describe("what loads from Google, and what the browser keeps", () => {
  test("Google reCAPTCHA runs on the forms the page names, and nowhere else", () => {
    assert.match(
      PAGE_FLAT,
      /checks that the person filling in our registration, event sign-up and course application forms is not a bot/i,
    );
    assert.match(
      PAGE_FLAT,
      /sets a cookie of its own while it is running on our registration, event sign-up and course application forms/i,
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
      "The policy names every form it runs on. Add the form to that sentence " +
        "in a new version, or take the check off the form.",
    );
    // "It runs only on the first step, while somebody who is not signed in is
    // making an account, and never for somebody who is already signed in":
    // the half of the step that mounts it is drawn for a visitor only, and
    // the form a signed-in applicant fills in does not load it at all.
    assert.match(
      PAGE_FLAT,
      /it runs only on the first step, while somebody who is not signed in is making an account, and never for somebody who is already signed in/i,
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
        "which the policy says it never does.",
    );
  });

  test("Google's sign-in script is loaded where the page says, and nowhere else", () => {
    assert.match(PAGE_FLAT, /on the sign-in and register pages, and as soon as you press a link to one of them/i);
    assert.match(
      PAGE_FLAT,
      /It is also loaded on the first step of the application form, when somebody who is not signed in continues to making an account, and not before/i,
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
    assert.match(PAGE_FLAT, /In your browser&apos;s own local storage the site keeps four small preferences/i);
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
      /is kept in your browser&apos;s local storage, under a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>/i,
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
 * One sentence under "When you register as a member" says that a member's own
 * change to their degree or their expected graduation is kept with what it
 * said before, and who is shown that. It is held here against the function
 * the profile's save calls, the rule that refuses a save without the entry,
 * and the one page that shows it.
 *
 * What the sentence is careful NOT to say is as much a part of it: it does
 * not say only admins can read the record (it is part of the account record,
 * which the Security section says who can read), and it does not say every
 * change to a profile is kept.
 */
const studyChange = await loadTs("features/profile/studyChange.ts");

describe("the account record passage", () => {
  const SENTENCE =
    /If you later change your degree \(or area of work\) or your expected graduation on your profile, we keep what it said before and when you changed it, as part of your account record\. Admins see that on their page for your account\./i;

  test("a member's own change of degree or graduation is kept with what it said before, and an admin's page shows it", () => {
    assert.match(PAGE_FLAT, SENTENCE);
    // It is the item after the profile fields, under "When you register as a
    // member": that list is where the page says what a profile holds.
    const registering = PAGE_FLAT.slice(
      PAGE_FLAT.indexOf("<h3>When you register as a member</h3>"),
      PAGE_FLAT.indexOf("<h3>When you apply as an external collaborator</h3>"),
    );
    assert.ok(registering.length > 200, "could not find the passage about registering as a member");
    assert.match(registering, SENTENCE);
    assert.ok(
      registering.indexOf("Profile fields you fill in") < registering.search(SENTENCE),
      "the sentence about a changed degree is no longer after the item that lists the profile's fields",
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

    // "On your profile": the profile's form sends what that function returns,
    // in its one write, with the server's own time.
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

    // "As part of your account record": the entries are on the account's own
    // document, and nothing under src copies them anywhere else. Every file
    // that names them, and why it may.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bstudyChanges\b/),
      new Map([
        ["src/lib/firestore/users.ts", "the shape of an account document, which is where the entries are declared and read back"],
        ["src/features/profile/studyChange.ts", "the one function that makes an entry, for the member's own save"],
        ["src/features/profile/ProfileForm.tsx", "the member's own profile form, which counts the entries and sends the new one"],
        ["src/features/admin/MemberItem.tsx", "the admin's page for one account, which hands the entries to the block that shows them"],
      ]),
      "naming the record of a changed degree or graduation",
      "The policy says the record is kept as part of the account record and " +
        "that admins see it on their page for the account. If this file " +
        "copies it somewhere else, or shows it to somebody else, the " +
        "sentence is wrong and a new version has to say so.",
    );
    assert.match(read("src/lib/firestore/users.ts"), /const studyChanges = asStudyChanges\(data\.studyChanges\);/);

    // "Admins see that on their page for your account": one component draws
    // it, one file mounts that component, and the page that file is drawn on
    // is under the layout that admits an admin and nobody else.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bStudyChangeNotes\b/),
      new Map([
        ["src/features/admin/StudyChangeNotes.tsx", "the block that shows what a member's degree and graduation said before"],
        ["src/features/admin/MemberItem.tsx", "the admin's page for one account, which is the one place the block is mounted"],
      ]),
      "showing what a degree or graduation said before",
      "The policy says admins see it on their page for the account, and names nobody else.",
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
      "The policy says admins see the record on their page for the account.",
    );
    assert.match(read("src/app/(app)/admin/(admin-only)/layout.tsx"), /await requireAdminPage\(\);/);

    // The account record goes when the account does, which is why the page's
    // list of what a deletion removes needs no line of its own for this.
    assert.match(PAGE_FLAT, /What a deletion removes\.<\/strong> Your account record and profile/i);
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
      "v7 says only admins can read what a degree or graduation said before. " +
        "It is part of the account record, which the Security section says " +
        "SU-recognised committee members can read as well.",
    );
    assert.match(
      PAGE_FLAT,
      /Member personal data is readable only by committee members the Students&apos; Union has formally recognised, and by admins/i,
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
 * What v7 says about a programme while it runs and when it ends, held against
 * the code that makes it true (docs/courses-ops.md).
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
 * Three passages were worded as what will happen until the thing was built,
 * and each is now held to the code: certificates, by their check in §2; a
 * team's page, by its tests below; and facilitators seeing who has said they
 * are coming before the first session, by the code below, as strictly.
 *
 * Four more were added to v7 while it was on dev, before any member had been
 * asked to accept it, so it kept its number: the notes a group's facilitators
 * share, the notes a group shares on its week pages, the calendar link, and
 * the survey at a programme's start (with the fourth logged download, the
 * name coming off two years after the programme, and a deletion taking it off at
 * once). Then the impact questionnaire's: sharing with Kairos unless somebody
 * says no, with the way to say no on every programme survey and the profile
 * and the Kairos file as the fifth logged download; the ratings at a
 * programme's end; and the totals that go to funders and sponsors. Each
 * describes code that is built, and is held to it below.
 */

/** A file's code with its comments taken out, so a note about a field is not taken for a use of it. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

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
/** What the written answer's pages say: who reads it, beside the box. Pure. */
const writtenWords = await loadTs("lib/courses/writtenAnswerWords.ts");
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
    // notes, so the page names the registers among what the lead sees, and no
    // register note.
    //
    // The lead does read two other kinds of notes, and the page names exactly
    // those two: the notes its groups' facilitators share (C30) and the notes
    // each group shares on its week pages (C29), each held to its own reader
    // further down. So the check is as strict as it was for a register's
    // notes: with the two phrases taken out, once each, no note is left in
    // what the page says the lead sees.
    const fromLead = PAGE_FLAT.slice(PAGE_FLAT.indexOf("<strong>The lead of each programme</strong>"));
    const lead = fromLead.slice(0, fromLead.indexOf("</li>"));
    assert.ok(lead.length > 200, "could not find what the page says a programme's lead sees");
    assert.match(lead, /reads every register of its groups,/);
    const SHARED_BY_FACILITATORS = " the notes its groups&apos; facilitators share,";
    const SHARED_ON_WEEK_PAGES = " and the notes each of its groups shares on its week pages,";
    assert.ok(lead.includes(`reads every register of its groups,${SHARED_BY_FACILITATORS}${SHARED_ON_WEEK_PAGES} sees the pitches`), "the current version no longer says the lead reads the notes its groups' facilitators share and the notes each group shares, right after the registers");
    const leadWithoutSharedNotes = lead.replace(SHARED_BY_FACILITATORS, "").replace(SHARED_ON_WEEK_PAGES, "");
    assert.ok(
      !/\bnotes?\b/i.test(leadWithoutSharedNotes),
      "v7 says a programme's lead reads the notes on a register. They are the " +
        "group's facilitators' and admins', and the register's GET sends a " +
        "lead none of them.",
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
      "The policy says a register's notes about named people are read by the " +
        "group's facilitators and admins, and names no other reader. If this " +
        "file hands them to anybody else, the sentence is wrong and a new " +
        "version has to say so.",
    );
    // tests/course-hub-lead-registers.test.mjs runs the GET as each caller.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-lead-registers.test.mjs")));
  });

  test("a leaver's reason is read by the programme's lead and admins, kept with the place, and copied nowhere that outlives it", () => {
    assert.match(
      PAGE_FLAT,
      /If you give a reason, only admins and, where the programme has one, its lead read it\. It is kept with your place on the programme, not with your application, and it is deleted with your account\./i,
    );
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
        "outlives the account, and the policy says the reason is deleted with it.",
    );
    // And it goes with the account: a deletion removes the place it is kept on.
    assert.match(read("src/lib/firestore/accountDeletion.ts"), /summary\.courseEnrolmentsDeleted = enrolSnap\.size;/);
    // tests/course-hub-leaving.test.mjs and
    // tests/course-hub-cant-make-it-after-placement.test.mjs run both doors.
    for (const suite of ["course-hub-leaving.test.mjs", "course-hub-cant-make-it-after-placement.test.mjs"]) {
      assert.ok(existsSync(join(REPO_ROOT, "tests", suite)), `tests/${suite} is gone`);
    }
  });

  test("somebody who left is shown only that they left, their records stay, and the notes they shared stay with their group", () => {
    // CHANGED ON PURPOSE (Q46): the page that says somebody left also draws
    // the survey about leaving while it is theirs to answer; the sentence is
    // pinned whole in its new words.
    assert.match(
      PAGE_FLAT,
      /After you leave, your programme page shows only that you left, and the survey about leaving while it is yours to answer \(see When you answer a survey\): your marks, notes and reflections stay in our records for the programme&apos;s lead and admins, and are no longer shown to you\. The notes you shared with your group stay with it/i,
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
    // "Shows only that you left": the page is drawn from the programme's name
    // and the day they left, and from nothing else of the run or the person.
    const view = /export type LeftView = \{([\s\S]*?)\};/.exec(withoutComments(read("src/lib/courses/leftView.ts")));
    assert.ok(view, "could not find what the page somebody who left reads is drawn from");
    assert.deepEqual(
      [...view[1].matchAll(/(\w+)\??:/g)].map((match) => match[1]),
      ["runId", "name", "leftOn"],
      "the page somebody who left reads is drawn from more than the programme's name and the day they left, " +
        "which the policy says is all it shows them.",
    );
    // The two pages that show somebody taking part their notes and the
    // reading list draw that same page for somebody who left, before either
    // is read. CHANGED ON PURPOSE (Q46): with the leaving survey's card while
    // it is theirs to answer, from the one reader the run's page asks too.
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

  // Asking people to facilitate (src/lib/courses/facilitatorAsks/) was added to
  // v7 while it was on dev, before any member had been asked to accept it, as
  // the passages named at the top of this section were. Two claims: who reads
  // the answers about facilitating, and the record each ask leaves. The
  // modules run here are pure, and are loaded inside each test.
  test("the answers about facilitating are read by the lead of each programme somebody would facilitate, ranked or not, on a list that shows nothing else of their application", async () => {
    assert.match(
      PAGE_FLAT,
      /<strong>If you would like to facilitate\.<\/strong> If you said you would like to facilitate a group, the lead of each programme you said you would facilitate, by name or by choosing &quot;Either&quot;, can read your answers to the questions about facilitating, even if you did not rank that programme\. They read them on a list of the people who would like to facilitate it, which shows your name, your degree or area of work, and your status or the year you expect to graduate, and, from decision day, where you stand in a few words, such as taking part in another programme or no offer this time\. The list shows nothing else of your application\./,
    );
    // The lead's own line under "Who can see what" says it too.
    const fromLead = PAGE_FLAT.slice(PAGE_FLAT.indexOf("<strong>The lead of each programme</strong>"));
    const lead = fromLead.slice(0, fromLead.indexOf("</li>"));
    assert.match(
      lead,
      /The lead also reads the answers about facilitating of everybody who said they would like to facilitate the programme, whether or not they ranked it, and from decision day can ask them to facilitate one of its groups\./,
    );

    const rules = await loadTs("lib/courses/facilitatorAsks/rules.ts");
    const reviewPeople = await loadTs("lib/applications/review/people.ts");

    // Who is on a programme's list, run: somebody who said yes to
    // facilitating and chose the programme by name, or "Either" where Either
    // covers it. Somebody who ranked only the other programme and chose this
    // one is on its list: "even if you did not rank that programme".
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

    // "Your answers to the questions about facilitating": the facilitator
    // sets' own questions, less the one that picks the programme, and no
    // answer from anywhere else on the form.
    assert.deepEqual(rules.facilitatorColumns(form, sets).map((column) => column.key), ["fac/before"]);
    assert.deepEqual(rules.answersFor(form, sets, sent("AGI Strategy")), { "fac/before": "I ran a reading group." });

    // "Your name, your degree or area of work, and your status or the year you
    // expect to graduate": the line under a name, run.
    assert.equal(
      reviewPeople.applicantDetail({ subject: "BA Philosophy", status: "undergraduate", statusOther: "", expectedGraduation: "2028-06" }),
      "BA Philosophy · Graduating 2028",
    );
    assert.equal(reviewPeople.applicantDetail({ subject: "PhD Politics", status: "phd", statusOther: "", expectedGraduation: "" }), "PhD Politics · Postgrad");

    // "From decision day, where you stand in a few words": nothing before
    // decision day's send, and the board's words after it.
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

    // "The list shows nothing else of your application": what is kept of each
    // person, field by field, and what the view sends of them, field by field.
    const people = withoutComments(read("src/lib/courses/facilitatorAsks/people.ts"));
    assert.match(people, /\(application\) => application\.sent !== null && wouldFacilitate\(form, sets, application\.sent, programme\),/);
    assert.match(
      people,
      /return \{\s*uid: application\.uid,\s*name: applicantName\(sent\.aboutYou, application\.displayName\),\s*firstName: applicantFirstName\(sent\.aboutYou, application\.displayName\),\s*detail: applicantDetail\(sent\.aboutYou\),\s*answers: answersFor\(form, sets, sent\),\s*standing: standingOf\(application\),\s*role: roleOf\.get\(application\.uid\) \?\? null,\s*\};/,
      "the list now keeps more of each application than the policy says it shows",
    );
    const load = withoutComments(read("src/lib/courses/facilitatorAsks/load.ts"));
    assert.match(
      load,
      /const view: ViewPerson = \{\s*uid: person\.uid,\s*name: person\.name,\s*firstName: person\.firstName,\s*detail: person\.detail,\s*answers: person\.answers,\s*status: \{ chip: status\.chip, note: status\.note, ask: status\.ask \},\s*\};/,
      "the view now sends more of each person on the list than the policy says it shows",
    );
    const viewPerson = /export type ViewPerson = \{([\s\S]*?)\n\};/.exec(load);
    assert.ok(viewPerson, "could not find what the view sends of each person on the list");
    assert.deepEqual([...viewPerson[1].matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), ["uid", "name", "firstName", "detail", "answers", "status"]);

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
      /const context = await askContext\(db, actor, roundId, programmeId\);\s*if \(!context\.ok\) return context;\s*const \{ form, programme, sets, run, groups \} = context;\s*const \[people, runAsks, training, test, lead, accounts\] = await Promise\.all\(\[\s*loadFacilitatorPeople\(db, form, sets, programme, actor\.uid\),/,
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
    assert.match(
      PAGE_FLAT,
      /<strong>Being asked to facilitate\.<\/strong> If you said you would like to facilitate a group, then from decision day the lead of a programme you said you would facilitate, or an admin, may ask you to facilitate one of its groups\. We email you the ask whatever your notification settings say, because it answers what you said on your application, and while it waits for your answer we may send you up to three reminders, at least twelve hours apart\. You answer on our site, on a page that shows the ask to you and nobody else, by the day and time the ask gives\. If you say yes, you become one of that group&apos;s facilitators\. We keep a record of each ask: who asked you and when, which group it was for, the day and time to answer by, whether the email went, any reminders, your answer and when you gave it, and a copy of the email as it was sent, with the name it was sent to\. The record holds no email address\. The programme&apos;s lead and admins can see these records, and you can see your own ask on its page\. They are kept with the rest of your course record, and deleted with your account\./,
    );
    assert.match(
      PAGE_FLAT,
      /your course enrolments, applications and drafts, the asks to facilitate a group sent to you and your replies to them, your progress/,
    );

    const model = await loadTs("lib/courses/facilitatorAsks/model.ts");
    const rules = await loadTs("lib/courses/facilitatorAsks/rules.ts");
    const words = await loadTs("lib/courses/facilitatorAsks/words.ts");
    const act = withoutComments(read("src/lib/courses/facilitatorAsks/act.ts"));

    // "From decision day", "the lead of a programme ... or an admin": an ask
    // is refused before decision day's send, behind the programme's own gate.
    assert.match(
      act,
      /const context = await askContext\(db, actor, roundId, programmeId\);\s*if \(!context\.ok\) return context;\s*if \(context\.form\.decisionsSentAt === null\) return refuse\(409, NOT_SENT_YET\);/,
      "an ask can now go before decision day has been sent",
    );

    // "Whatever your notification settings say": one call to the mail door,
    // and nothing in the writer reads a notification row or reaches the
    // notice lane.
    assert.match(act, /import \{ sendEmail \} from "@\/lib\/email\/send";/);
    assert.equal((act.match(/\bsendEmail\(/g) ?? []).length, 1, "asking somebody to facilitate sends from more than one place");
    for (const marker of ["wantsCategory(", "addressesForSend(", "wantsEmailForProfile(", "wantsPushFor(", "hasOptedOutOfCourseAnnouncements(", "sendNotice(", "sendNoticePush("]) {
      assert.ok(!act.includes(marker), `asking somebody to facilitate now calls ${marker}, so whether it is sent may depend on a notification setting`);
    }

    // "Up to three reminders, at least twelve hours apart", "while it waits
    // for your answer".
    assert.equal(model.FACILITATING_LIMITS.maxReminders, 3);
    assert.equal(model.FACILITATING_LIMITS.remindAfterMs, 12 * 60 * 60 * 1000);
    assert.match(act, /if \(!current \|\| askStateOf\(current, runAsks, now\)\.kind !== "waiting"\) return refuse\(409, NOT_WAITING\);/);
    assert.match(act, /if \(current\.reminders >= FACILITATING_LIMITS\.maxReminders\) return refuse\(409, REMINDED_ENOUGH\);/);
    assert.match(
      act,
      /if \(current\.remindedAt && now\.getTime\(\) - current\.remindedAt\.getTime\(\) < FACILITATING_LIMITS\.remindAfterMs\) \{\s*return refuse\(409, REMINDED_RECENTLY\);/,
    );

    // "On a page that shows the ask to you and nobody else": the page and the
    // answer each treat an ask that is not the caller's as no ask at all.
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
      "The policy says the page shows the ask to the person asked and nobody else.",
    );

    // "By the day and time the ask gives", run (12pm in London on Wed 28 Oct
    // is noon in UTC), and refused after it.
    const ask = { id: "a1", seat: "a1", uid: "kai", answer: null, replyBy: { dateKey: "2026-10-28", time: "12:00" } };
    assert.equal(rules.askStateOf(ask, [ask], new Date(Date.UTC(2026, 9, 28, 11, 59))).kind, "waiting");
    assert.equal(rules.askStateOf(ask, [ask], new Date(Date.UTC(2026, 9, 28, 12, 0))).kind, "late");
    assert.match(answer, /if \(state\.kind === "late"\) \{\s*return refuse\(409, lateWords\(/);

    // "If you say yes, you become one of that group's facilitators", through
    // the one place a group's facilitators change.
    assert.match(answer, /writeFacilitatorChange\(tx, db, \{[\s\S]*?next: \[\.\.\.current, actor\.uid\],/);

    // "We keep a record of each ask: ...": the one write of an ask, field by
    // field, built from the person on the list (who carries no address) and
    // the email as composed (which holds none).
    const created = /tx\.create\(ref, \{([\s\S]*?)\}\);/.exec(act);
    assert.ok(created, "could not find the write of an ask");
    assert.deepEqual(
      [...created[1].matchAll(/^\s*(\w+)(?::|,)/gm)].map((match) => match[1]),
      [
        "kind", "runId", "roundId", "programmeId", "groupId", "uid", "seat", "askedByUid", "askedAt", "replyBy",
        "answer", "answeredAt", "remindedAt", "reminders", "delivery", "email", "toName", "firstName", "leadName",
      ],
      "an ask is now kept with more, or less, than the policy lists",
    );
    assert.match(created[1], /toName: person\.name,/);
    const person = /export type FacilitatorPerson = \{([\s\S]*?)\n\};/.exec(withoutComments(read("src/lib/courses/facilitatorAsks/people.ts")));
    assert.ok(person, "could not find what is kept of each person on the list");
    assert.deepEqual([...person[1].matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), ["uid", "name", "firstName", "detail", "answers", "standing", "role"]);
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

    // "The programme's lead and admins can see these records, and you can see
    // your own ask on its page": every file that reads asks, and every file
    // that addresses the record, each for a reason.
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
      "The policy says what an ask keeps, who sees it, and that it goes with the account of the person asked. " +
        "If this file reads, shows or keeps asks otherwise, the sentence is wrong and a new version has to say so.",
    );

    // "Deleted with your account": every ask that names the account, found by
    // its one equality, is deleted.
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    assert.ok(
      cascade.includes("summary.courseFacilitatingCleared = await clearFacilitatorAsks(db, uid);"),
      "the account deletion no longer clears the asks to facilitate, which the policy lists among what a deletion removes",
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
    assert.match(
      PAGE_FLAT,
      /deleted with your account\. If you hold a place on that programme, saying yes also puts you in that group, as one of its people: a facilitator who holds a place sits in the group they facilitate\./,
    );
    assert.match(
      PAGE_FLAT,
      /<strong>If you facilitate your own group\.<\/strong> A facilitator can also hold a place on the programme, in the group they facilitate\. If you do, you are one of the group&apos;s people as well: you are on its register, and whoever takes the register marks you, which can be you; you count towards who finished; and your written answers are not shown to the group&apos;s other facilitators, who do not give you feedback on them: the programme&apos;s lead or an admin does\. Before you can leave the programme, or be taken off it, the programme&apos;s lead or an admin takes you off the group&apos;s facilitators\./,
    );

    // "Saying yes also puts you in that group": where somebody sits, run.
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
      "The policy says a yes from somebody holding a place puts them in that group. A new door that places people this way is a new sentence.",
    );
    const answer = withoutComments(read("src/lib/courses/facilitatorAsks/answer.ts"));
    assert.match(answer, /writeFacilitatorChange\(tx, db, \{[\s\S]*?next: \[\.\.\.current, actor\.uid\],[\s\S]*?placing,\s*\}\);/);

    // "On its register, and whoever takes the register marks you, which can
    // be you": the register lists every active row in the group, with no
    // question about anybody's role, and the group's facilitators mark it.
    const registerAccess = withoutComments(read("src/lib/courses/registerAccess.ts"));
    const members = registerAccess.slice(registerAccess.indexOf("export async function loadRegisterMembers("));
    const membersBody = members.slice(0, members.indexOf("\n}\n"));
    assert.match(membersBody, /\.where\("groupId", "==", groupId\)\s*\.where\("status", "==", "active"\)/);
    assert.ok(!/\brole\b/.test(membersBody), "the register now asks people's roles, so a facilitator who holds a place may be left off it");

    // "You count towards who finished": who finished is the run's learner
    // rows, and nothing in it leaves out a facilitator.
    const attendance = withoutComments(read("src/lib/courses/programmeAttendance.ts"));
    assert.match(attendance, /\.filter\(\(row\) => row\.role === "learner" && row\.uid !== "" && row\.runId === runId\)/);
    assert.ok(!/facilitatorUids/.test(withoutComments(read("src/lib/courses/finishing/whoFinished.ts"))), "who finished now asks who facilitates");

    // "Not shown to the group's other facilitators, who do not give you
    // feedback on them: the programme's lead or an admin does" (Zach, Mon 26
    // Oct 2026: a facilitator's own work is read by the programme's lead and
    // admins, not co-facilitators). One rule, run: whose work is a
    // facilitator's own, and who reads it.
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
      "The policy says a facilitator's own written answers are read by the programme's lead and admins and by none of the group's other facilitators. A new place that reads or reviews them asks the same rule.",
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

    // "Before you can leave the programme, or be taken off it": leaving's one
    // answer, its words run, and Remove's refusal.
    const leaving = withoutComments(read("src/lib/courses/leaving.ts"));
    assert.match(leaving, /if \(facilitated\) return \{ closed: "facilitating", groupName: /);
    const leavingWords = await loadTs("lib/courses/leavingWords.ts");
    assert.equal(
      leavingWords.leaveClosedLine({ closed: "facilitating", groupName: "Group A" }, "AGI Strategy Fellowship"),
      "You facilitate Group A, so you can’t leave the programme here. Ask the programme’s lead or an admin to take you off its facilitators first, then you can leave.",
    );
    const remove = withoutComments(read("src/app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts"));
    assert.match(remove, /if \(facilitated && existing\.status === "active"\) \{\s*throw new RemoveError\(facilitatesGroupLine\(/);

    // "A facilitator who held a place and finished is sent both": the two
    // lists the send reads can hold one person, who finished's (learner rows,
    // above) and the groups' facilitators, and a certificate is one a
    // person, run and kind, so both are made, and go in that person's one
    // email (§2's certificate test holds the rest of the paragraph).
    assert.match(PAGE_FLAT, /and to each person who facilitated one of its groups\. A facilitator who held a place and finished is sent both\./);
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
    // The page's two new passages, whole, and the private note's sentence.
    assert.match(
      PAGE_FLAT,
      /<strong>Reflections\.<\/strong> At stops in a week&apos;s readings you answer set questions in boxes that save as you type\. You, your group&apos;s facilitators, the programme&apos;s lead and admins can read your answers, and nobody else on the programme can; the week&apos;s page says so beside the boxes\. A facilitator may read a line of one out in the session without saying who wrote it, and the page where they choose lines shows them the words with no name beside them\. Reflections get no feedback and no mark\. If you facilitate a group, your own reflections are read by the programme&apos;s lead and admins, not by the group&apos;s other facilitators, and nobody reads them out\./,
    );
    assert.match(
      PAGE_FLAT,
      /<strong>Ticks\.<\/strong> Each source in a week&apos;s readings has a tick for you\. Your group&apos;s facilitators, the programme&apos;s lead and admins can see which sources you have ticked, with your name, and the week&apos;s page says so; nobody else on the programme can\. A tick never counts against you\. If you facilitate a group, the programme&apos;s lead and admins see yours, and the group&apos;s other facilitators do not\./,
    );

    // Who sees whose work, decided in one place, run: a facilitator is never
    // shown a facilitator's own; the lead and admins are, marked as theirs;
    // private notes are the group's facilitators' and admins', never the
    // lead's, and a facilitator's own note an admin's alone.
    const week = await loadTs("lib/courses/facilitatorWeek/model.ts");
    const VIEWERS = ["facilitator", "lead", "admin"];
    assert.deepEqual(VIEWERS.map(week.seesFacilitatorsOwnWork), [false, true, true], "who is shown a facilitator's own reflections and ticks moved");
    assert.deepEqual(VIEWERS.map(week.readsPrivateNotes), [true, false, true], "who reads private notes moved");
    assert.deepEqual(VIEWERS.map(week.readsFacilitatorsPrivateNotes), [false, false, true], "who reads a facilitator's own private note moved");
    const people = [{ uid: "fellow", name: "A Fellow" }, { uid: "facilitator", name: "A Facilitator" }];
    const facilitators = [{ uid: "facilitator", name: "A Facilitator", firstName: "A" }];
    assert.deepEqual(week.peopleShown("facilitator", people, facilitators).map((person) => person.uid), ["fellow"]);
    assert.deepEqual(week.peopleShown("lead", people, facilitators).map((person) => [person.uid, person.own]), [["fellow", false], ["facilitator", true]]);
    // "Shows them the words with no name beside them": a card is its words
    // and a key naming nothing but its place, in the order of the words.
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
        ["src/app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts", "a person's own note, kept as it was when they tick week 1 before groups go out, on their own row"],
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
    // lead or an admin, from the form).
    assertExactlyTheseFiles(
      sourceFilesNaming(/\b(?:loadGroupWeek|loadReadOutWeek)\(/),
      new Map([
        ["src/lib/courses/facilitatorWeek/readers.ts", "the two loaders, which ask nobody who is reading, so each caller decides that first"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/page.tsx", "the group's page, for its live facilitators and admins"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/reflections/page.tsx", "the page to read lines out, for the group's live facilitators and admins"],
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx", "the lead's view of a group's week, for the programme's lead and admins"],
        ["src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections/page.tsx", "the lead's reading of a group's reflections, for the programme's lead and admins"],
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

    // "A tick never counts against you": nothing that decides who finished
    // reads a tick. "Reflections get no feedback and no mark": the verdict
    // route reads a reflection as no row.
    assert.deepEqual(
      sourceFilesNaming(/["'`]courseProgress["'`]/).filter((file) => file.startsWith("src/lib/courses/finishing/")),
      [],
      "who finished now reads ticks, so a tick can count against somebody",
    );
    // It reads a reflection or a fill-in box as no row, and a reflection is one of those.
    assert.match(withoutComments(read("src/app/api/courses/exercise-responses/[responseId]/review/route.ts")), /snap\.exists && !isOwnBoxResponse\(data\)/);
    assert.match(withoutComments(read("src/lib/firestore/courseExercises.ts")), /return isReflectionResponse\(data\) \|\| isFillInResponse\(data\);/);

    // tests/course-hub-facilitator-week.test.mjs runs each page as every kind
    // of caller, and holds every reader of the progress store to a list.
    assert.ok(existsSync(join(REPO_ROOT, "tests", "course-hub-facilitator-week.test.mjs")), "tests/course-hub-facilitator-week.test.mjs is gone");
  });

  test("who finished: the number is shown to the programme's lead and admins, and a member is told only whether they finished", () => {
    // The words, run: the lead's sentences say who sees the rule, and a
    // member's carry a programme's name and nothing else.
    assert.equal(
      finishingWords.ruleSentence(4, 6),
      "We’ve ticked everyone who came to at least 4 of 6 sessions. Change any you disagree with. Only you and admins see this rule.",
    );
    assert.match(finishingWords.RULE_HINT, /Only you and admins see this\.$/);
    assert.equal(finishingWords.youFinished("AGI Strategy Fellowship"), "You finished AGI Strategy Fellowship.");
    assert.equal(finishingWords.hasEnded("AGI Strategy Fellowship"), "AGI Strategy Fellowship has ended.");
    // "Arriving late or leaving early counts as coming".
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
      "The policy says only the programme's lead and admins see the number " +
        "and the list. If this file shows either to anybody else, the sentence " +
        "is wrong and a new version has to say so.",
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
    assert.match(
      PAGE_FLAT,
      /a pitch you sent alone, your name on a pitch you sent with a partner, your picks in pitching week, your place in a team, any decision a lead recorded about whether you finished/i,
    );
    assert.match(PAGE_FLAT, /A pitch you sent with a partner: it stays theirs, without your name\./i);
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
      !/contact details/i.test(PAGE_FLAT),
      "v7 says facilitators see contact details again. They are shown names " +
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
    // BUILT, 26 October 2026 (Q14, board st-fac-before-phone). This sentence
    // said what would happen ("they will also see") while nothing showed a
    // facilitator a reply, and the code now does it: the summary behind a
    // facilitator's Home hands the group's facilitators, on the days before
    // its first session, each person's first name and whether they have said
    // they are coming. v7 had not been put to any member yet, so its tense
    // moved in place ("they also see"), the way the three passages added
    // while it was on dev were added in place. The whole sentence is pinned in
    // its new words, as strictly as the old words were, the old words must be
    // gone, and the sentence is held to the code below.
    assert.match(
      PAGE_FLAT,
      /Before the first session, they also see whether each person in their group has said they are coming\. Apart from that one reply, they see nothing from applications, and no review scores\./,
    );
    assert.ok(
      !/they will also see whether each person in their group/i.test(PAGE_FLAT),
      "v7 says facilitators will see who has said they are coming, as if it were not built yet",
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
      "Say who is shown the reply and why, and check v7 names them.",
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

  // Five since the Kairos file joined the log: the walk, the refusal loop and
  // the title each said four, and each names the fifth now, as exactly.
  test("five downloads are logged, each before its file is handed over, and the attendance, survey and Kairos files hold what the page says", () => {
    // Operational logs names as many kinds as there are writers of the
    // record, before the walk below names each: it said four after the
    // Kairos file had made five (privacy pass 2).
    const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const callers = sourceFilesNaming(/\blogExport\(/).filter((file) => file !== "src/lib/firestore/dataExports.ts").length;
    const logs = /A record of the spreadsheet downloads the site generates\. (\w+) kinds are logged today, (.*?), and each row holds who asked for it, what it covered, how many people were in it, and when\./.exec(PAGE_FLAT);
    assert.ok(logs, "Operational logs no longer says how many kinds of download are logged");
    assert.equal(logs[1].toLowerCase(), NUMBER_WORDS[callers], `Operational logs says ${logs[1]} kinds are logged, and ${callers} routes write the record of a download`);
    assert.equal(
      logs[2],
      "a membership list, the responses to a circulated worksheet, a programme&apos;s attendance, a survey&apos;s answers and the Kairos file",
      "Operational logs names other kinds than the five the walk below holds",
    );
    assertExactlyTheseFiles(
      sourceFilesNaming(/\blogExport\(/).filter((file) => file !== "src/lib/firestore/dataExports.ts"),
      new Map([
        ["src/app/api/admin/membership/export/route.ts", "the membership list for a period, the first of the five the policy names"],
        ["src/app/api/worksheets/circulations/[circulationId]/export/route.ts", "the answers to a circulated worksheet, the second of the five"],
        ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts", "a programme's attendance, for its lead and admins, the third of the five"],
        ["src/app/api/surveys/[surveyId]/export/route.ts", "a survey's answers with the names of the people who sent them, for admins alone, the fourth of the five"],
        ["src/app/api/kairos/export/route.ts", "the Kairos file, for admins alone, the fifth of the five"],
      ]),
      "writing the record of a download",
      "The policy says five downloads are recorded and names them. A " +
        "download recorded and not named, or named and no longer recorded, " +
        "makes the sentence wrong: say so in a new version.",
    );
    // "All five refuse to hand over the file if that record cannot be
    // written": the record first, and a failure to write it is a refusal.
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
    // "The attendance file is for the programme's lead and admins. It holds
    // each person's group, name and marks, how many sessions they came to
    // and the day they left, if they did, and never an email address or a
    // note."
    assert.match(
      read("src/lib/courses/programmeAttendance.ts"),
      /const header = \[\s*"Group",\s*"Name",\s*\.\.\.model\.weeks\.map\(\(week\) => `Week \$\{week\.weekNumber\}`\),\s*"Came",\s*"Of",\s*"Left",\s*\];/,
      "the attendance file's columns changed, so the policy's list of what it holds is no longer what it holds.",
    );
    const attendance = read("src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts");
    const refusedFirst = attendance.indexOf('if (outcome.status === "not-yours")');
    const readFirst = attendance.indexOf("await readRunRecords(db");
    assert.ok(refusedFirst !== -1 && readFirst !== -1 && refusedFirst < readFirst, "the attendance file is built before the caller is asked whether they lead the programme");

    // "A survey's answers with names, which only admins can download": the
    // export answers anybody but an admin before it reads anything.
    const survey = withoutComments(read("src/app/api/surveys/[surveyId]/export/route.ts"));
    const adminsOnly = survey.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
    const surveyRead = survey.indexOf("await readSurvey(db, surveyId)");
    assert.ok(adminsOnly !== -1 && surveyRead !== -1 && adminsOnly < surveyRead, "the survey's spreadsheet is built before the caller is asked whether they are an admin");
    assert.match(read("src/lib/surveys/repo.ts"), /export function canRunSurveys\(user: Pick<SessionUser, "role"> \| null\): boolean \{\s*return user\?\.role === "admin";\s*\}/);
    // "The survey file holds, for each person who answered, their name, when
    // and how they sent their answers, whether their group had met by then,
    // and the answers themselves, and never an email address": the layout,
    // run on the before survey's own questions and one person's answers.
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

    // "The Kairos file holds, for each person on a programme at its end who
    // has not said no to sharing with Kairos, their name, the programme, how
    // many sessions they came to, whether they finished and the ratings they
    // were given at the end, and never an email address, who gave a rating or
    // a survey answer": admins only, asked before anything is read; nobody
    // who said no; and the layout, run.
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
    assert.match(PAGE_FLAT, /and the pitch form says so\./);
    // The line on the form, above the button that sends it, in the words of
    // the question the owner answered with v7.
    const pitching = read("src/features/courses/pitching/PitchingWeek.tsx");
    const form = pitching.slice(pitching.indexOf("function PitchForm("), pitching.indexOf("function PitchItem("));
    const line = form.indexOf(">Your group sees your pitch and who pitched it.<");
    const send = form.indexOf('<button type="submit"');
    assert.ok(line !== -1, "the pitch form no longer says who sees a pitch, which the policy says it does");
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
    assert.match(PAGE_FLAT, /Nobody is taken off a programme by it: a place on a course run/);
    const destroy = read("src/lib/admissions/destroy.ts");
    assert.ok(
      !/courseEnrolments|courseApplications|COURSE_ENROLMENTS|COURSE_APPLICATIONS/.test(destroy),
      "destroying a term's applications now reaches the places on a course " +
        "run, which the policy says stay with the rest of a person's course record.",
    );
  });

  test("the notes a group's facilitators share are read by its facilitators, the programme's lead and admins, by nobody in the group, and go with their writer's account", () => {
    assert.match(
      PAGE_FLAT,
      /<strong>Notes facilitators share\.<\/strong> A group&apos;s facilitators can keep notes for each other about how their group is going, and a note can mention you by name\. The group&apos;s facilitators, the programme&apos;s lead and admins read them; nobody in the group does\. A note goes when the account of the facilitator who wrote it is deleted\. If you ask to see what is written about you, we will show you these notes too\./,
    );
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

  test("the notes a group shares on its week pages reach the group, its facilitators, the programme's lead and admins and nobody else, are deleted by their writer alone, stay when somebody leaves, and go with the writer's account", () => {
    assert.match(
      PAGE_FLAT,
      /<strong>Notes shared with your group\.<\/strong> On a programme that places you in a group, each week&apos;s page has notes the people in your group and its facilitators share with each other\. A note you add is shown with your name, the day you wrote it and the week it was written on, to everyone in your group, its facilitators, the programme&apos;s lead and admins, and to nobody else; the page says so under the notes\. While you are in the group you can delete a note you wrote, and nobody else can\. If you leave the programme, the notes you shared stay with your group, as your marks stay on its register\. They are deleted with your account\./,
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
        "programme's lead and admins and nobody else, that only their writer " +
        "deletes one, and that they go with the writer's account. If this file " +
        "reads, shows or removes them otherwise, the sentence is wrong and a new " +
        "version has to say so.",
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
    // What the page shows with a note, and the line under the notes that
    // names who reads them.
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
    // Deleted by its writer alone: everybody else, an admin included, is refused before the one delete.
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
    assert.match(
      PAGE_FLAT,
      /<strong>Pathways and cases\.<\/strong> Some weeks give you a pack to read, such as a pathway, and a case to give a short talk on\. When your facilitators hand these out on paper in a session, which ones you were given is recorded on the site, by them or by the programme&apos;s lead or an admin, and you see yours on that week&apos;s page\. Your group&apos;s facilitators, the programme&apos;s lead and admins see what everyone in the group was given; nobody else in your group sees yours\. If you facilitate the group you take part in, your co-facilitators see what you were given, as they see everybody&apos;s\. When a week lets you pick a pack yourself, we keep the one you picked, and you can change it until your session starts\. Your group&apos;s facilitators, the programme&apos;s lead and admins can see which one you picked, except that if you facilitate the group, your co-facilitators cannot\. You can say you are ready for your talk, and that is shown on your own pages and nobody else&apos;s\./,
    );
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
      "The policy says what is given out is seen by the group's facilitators, " +
        "the programme's lead and admins and nobody else in the group, that a " +
        "pick is seen by those three too, never a facilitator's own by their " +
        "co-facilitators, that the ready box reaches nobody's pages but the " +
        "person's, and that they go with the account. If this file reads, " +
        "shows or removes them otherwise, the sentence is wrong and a new " +
        "version has to say so.",
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
    assert.match(
      PAGE_FLAT,
      /<strong>Pairs for a session\.<\/strong> When a week&apos;s session is in pairs, your group&apos;s facilitators, the programme&apos;s lead or an admin record on the site who is in each pair and, where the week asks, who is bringing a laptop\. On that week&apos;s page you see who you are paired with, by first name, and who in your pair is bringing a laptop, and your partners see the same about you\. Your group&apos;s facilitators, the programme&apos;s lead and admins see every pair in the group; nobody else in your group sees your pair\. If you facilitate the group, you can be in a pair like anybody, and your co-facilitators see it\. If you leave the programme, you are no longer shown in a pair\. It is deleted with your account\./,
    );
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
      "The policy says pairs are recorded by the group's facilitators, the " +
        "programme's lead or an admin, that each person sees their own pair " +
        "and nothing of another, that the group's facilitators, the lead and " +
        "admins see every pair, and that they go with the account. If this " +
        "file reads, shows or removes them otherwise, the sentence is wrong " +
        "and a new version has to say so.",
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
    assert.match(
      PAGE_FLAT,
      /<strong>Boxes you fill in\.<\/strong> Some weeks have boxes for you to fill in, such as an action plan\. What you write saves as you type\. It is read by you, your group&apos;s facilitators, the programme&apos;s lead and admins, and by nobody else taking part; the page says so under the boxes\. If you facilitate a group, what you write is read by the programme&apos;s lead and admins, and not by the group&apos;s other facilitators\. If you leave the programme, the programme&apos;s lead and admins can still read it, and your group&apos;s facilitators and you no longer can\. It is deleted with your account\./,
    );
    // Somebody else's boxes are read in one place, after one gate.
    const gateFile = "src/lib/courses/fillInBoxes/access.ts";
    const readerFile = "src/app/api/courses/runs/[runId]/fill-in-boxes/route.ts";
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bboxesReaderFor\(/),
      new Map([
        [gateFile, "the gate itself: admins and the programme's lead for anybody's, a live facilitator of a fellow's own group for theirs, and nobody else for a facilitator's own"],
        [readerFile, "the one reader of somebody else's boxes, which asks the gate before a box is read"],
        ["src/lib/courses/facilitatorWeek/readers.ts", "a group's week for its facilitators, the programme's lead and admins: each person's boxes on the week the page shows, the gate asked person by person before a box is read, for exactly the people it admits"],
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
    // is placed there (active or finished, and told), so not after leaving.
    assert.match(gate, /\(enrolment\.status === "active" \|\| enrolment\.status === "completed"\) &&/);
    assert.match(gate, /if \(group && isNamedWithStanding\(actor, "courseGroups\.facilitatorUids", group\.facilitatorUids\)\) return "facilitator";/);
    // The page says so under the boxes, in the same people's names.
    assert.equal(
      fillInWords.fillInReadersWords(["Rahul", "Sofia"], "Claudia", "My action plan"),
      "Rahul, Sofia, Claudia and admins can read your action plan. Other fellows can’t.",
    );
    assert.equal(fillInWords.facilitatorFillInReadersWords("Claudia", "My action plan"), "Only Claudia and admins can read your action plan.");
    // The person reads their own back only while their place is live: after
    // leaving, my-exercises refuses them.
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
    assert.match(
      PAGE_FLAT,
      /<strong>Sealed predictions\.<\/strong> On a programme whose course has a card of predictions, a week&apos;s page gives you that card to fill in: each question asks for a percentage, a number on a scale or a sentence, and each answer saves as you type\. Once you seal your card, nobody can change it, you included, and you cannot read it again until your group&apos;s session before the week it opens in has ended and you open it there, after answering the same questions again\. You then see both side by side, and neither changes after that\. A card you never seal can no longer be changed once that session has ended, and you can still read it\. Your card is read by you and by admins, who can open anybody&apos;s at any time, and by nobody else: not your group&apos;s facilitators, not the programme&apos;s lead and not other fellows\. If you facilitate a group, its other facilitators do not read yours either\. Each time an admin opens a card, we record who opened it, whose card it was by account id, the course run and when, before anything on the card is read, and never what it says; if that record cannot be written, the card stays closed\. An admin cannot open their own card that way\. If you leave the programme, you no longer see your card, and admins still can\. Your card is deleted with your account, and when the programme&apos;s course run is destroyed\. The records of admins opening a card stay when an account is deleted, and are deleted when the run is destroyed\./,
    );
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
      "The policy says a card is read by its owner and admins alone, shut to " +
        "its owner once sealed until the week it opens in, and gone with the " +
        "account and the run. If this file reads, shows or removes cards " +
        "otherwise, the sentence is wrong and a new version has to say so.",
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
    assert.match(PAGE_FLAT, /On a programme anyone can join you can also leave a comment on it, which is shown to the rest of your run; on a programme that places you in a group, you share notes with your group instead \(see Notes shared with your group\)\./);
    assert.match(PAGE_FLAT, /On a programme anyone can join, they also see any comment or star rating you leave on a piece of course material; on a programme that places you in a group, the people in your group see the notes you share with it\./);
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
    assert.match(
      PAGE_FLAT,
      /<strong>Your calendar link\.<\/strong> &quot;Add to calendar&quot; on your programme page gives you a private link to your sessions, which you can add to Apple Calendar, Google Calendar, Outlook or any calendar that subscribes to a link\. It shows the day, time and room of each session of your group \(and of any group you facilitate\), with the programme&apos;s and the group&apos;s name, and marks a session that is cancelled\. An online week says to join on naisi\.uk, never the meeting link\. It shows no names and no email address\. Once you add it, your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us every so often and keeps what it shows, under its own privacy policy, so a session that moves or is cancelled changes in your calendar too\. Anyone else holding the link can see the same, so keep it to yourself\. You can replace it at any time from the same place, and the old link then shows nothing\. If you leave a programme, no session after the day you left is in it\. It is deleted with your account\./,
    );
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
    // Of any group you facilitate, too.
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
    // Deleted with the account: the one document at the person's uid.
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
    const passage = PAGE_FLAT.slice(PAGE_FLAT.indexOf("<strong>Your written work.</strong>"));
    const work = passage.slice(0, passage.indexOf("</li>"));
    for (const sentence of [
      /A written answer is read by you, your group&apos;s facilitators, the programme&apos;s lead and admins, and by nobody else taking part; the week&apos;s page says so beside it\./,
      /If you facilitate a group, your own answer is read by the programme&apos;s lead and admins, and not by the group&apos;s other facilitators\./,
      /We record when you first send it, and when you change it after that\./,
      /You can change it until one of your group&apos;s facilitators opens it \(for a facilitator&apos;s own answer, the programme&apos;s lead or an admin\), or feedback is sent on it; we record when it was opened, and any of its readers can reopen it for you to change\./,
      /Its readers can see when you sent it, and whether that was after it was due\. Your own pages show when you sent it, but never mark it late\./,
      /One short email tells you that feedback is waiting; the feedback itself stays on the site\./,
    ]) {
      assert.match(work, sentence, `v7's "Your written work" no longer says ${sentence}`);
    }
    assert.match(PAGE_FLAT, /that feedback on your written answer is waiting, and account-related messages\./);

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
    // The page beside the box says so: the words are run.
    const words = writtenWords;
    assert.equal(
      words.alsoReadByWords({ kind: "facilitators", names: ["Rahul", "Sofia"] }, "Claudia"),
      "Claudia and admins can read it too. Other fellows can’t.",
    );
    assert.equal(words.seenWhereWords({ kind: "facilitators", names: ["Rahul", "Sofia"] }), "Rahul and Sofia see it on their group page. No email.");

    // The first-sent time is stored once; a later change has its own stamp.
    const writer = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts"));
    assert.ok(writer.includes("const sending = send && !alreadySent;"), "the first send is no longer the only one that stamps the first-sent time");
    assert.ok(writer.includes("write.firstSentAt = FieldValue.serverTimestamp();"));
    assert.equal((writer.match(/write\.firstSentAt = /g) ?? []).length, 1, "the first-sent time is written in more than one place");
    assert.ok(writer.includes("if (changed) write.editedAt = FieldValue.serverTimestamp();"), "a change after sending no longer stores its own time");
    // Locked once opened, or once feedback is sent.
    assert.ok(writer.includes("if (record && (record.openedAt || record.feedback)) throw new AnswerError(ANSWER_LOCKED, 409);"), "the writer's route no longer refuses an opened answer");

    // Opened by a POST, never a GET; reopened by any of its readers.
    const review = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts"));
    assert.match(review, /export async function POST\(/);
    assert.doesNotMatch(review, /export (?:async )?function GET\b|export const GET\b/, "the review route answers a GET, which must never write");
    assert.ok(review.includes("if (role.locksOnOpen && !record.openedAt && !record.feedback) {"), "opening no longer locks the answer only for those whose opening the gate says locks it");
    assert.ok(review.includes("write.reopenedByUid = actor.uid;"), "Reopen for edits no longer records who reopened it");

    // "Late" travels to its readers only: the writer's wire has no such field.
    const wire = withoutComments(read("src/lib/courses/writtenAnswers/wire.ts"));
    assert.doesNotMatch(wire, /\blate\b/i, "the wire a writer reads carries whether their answer was late");
    assert.match(withoutComments(read("src/lib/courses/writtenAnswers/reviewPage.ts")), /late: record\?\.firstSentAt \? isLate\(record\.firstSentAt, due\) : false,/);

    // Feedback is levels and a comment, never a number.
    const rubric = withoutComments(read("src/lib/courses/rubric.ts"));
    assert.ok(rubric.includes("out.push({ row: row.name, level: rubric.levels[index], descriptor: row.descriptors[index] ?? \"\" });"));
    assert.doesNotMatch(review, /\b(?:score|mark|total|points)\s*:/i, "feedback stores a score, a mark or a total");

    // The one email: sent after the feedback is saved, never carrying it.
    assert.ok(review.includes("await sendWrittenFeedbackEmail({"), "the review route no longer sends the email that feedback is waiting");
    const template = withoutComments(read("src/emails/WrittenFeedbackEmail.tsx"));
    assert.doesNotMatch(template, /comment|levels|descriptor/i, "the email carries the feedback itself, which stays on the site");
  });

  // The span this pins grew by the two survey items, written where the page
  // lists them; the span it replaces ran from the facilitators' notes
  // straight to the pitch.
  test("a deletion removes the calendar link, the notes shared with a group and the notes written for a group's other facilitators", () => {
    assert.match(
      PAGE_FLAT,
      // The written answers and their feedback by name, where "your answers
      // to exercises" stood (the same rows, deleted by the same step below),
      // then the packs and cases recorded for a person (plan item 8), before
      // the calendar link. CHANGED ON PURPOSE (privacy pass 2): the list now
      // also names reflections and a week's boxes (the same rows as the
      // written answers, swept by the same step), pairs for a session and
      // sealed predictions, each deleted by a step held below, which their
      // own bullets said and the list did not; everything else is as it was.
      /your progress, your written answers with the feedback on them, your reflections and what you wrote in a week&apos;s boxes, the packs and cases recorded for you and whether you said you were ready for your talks, your pairs for a session, your sealed predictions, your calendar link, the notes you shared with a group, notes you wrote for the other facilitators of a group, your name on your survey answers, the record of each survey sent to you with your link to answer it, a pitch you sent alone,/,
    );
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
      assert.ok(cascade.includes(step), `the account deletion no longer runs \`${step}\`, which the policy lists among what a deletion removes`);
    }
    // Pairs and both predictions cards go whole, every row the uid owns.
    assert.match(cascade, /export async function deleteCoursePairs\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PAIRS_COLLECTION, uid\);\s*\}/);
    assert.match(cascade, /export async function deleteCoursePredictions\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, COURSE_PREDICTIONS_COLLECTION, uid\);\s*\}/);
    // "Your reflections and what you wrote in a week's boxes": both are rows
    // of the written answers' own store, keyed by their writer's uid, which
    // the cascade sweeps by uid whatever their kind.
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
    assert.match(
      PAGE_FLAT,
      /<h3>When you answer a survey<\/h3> <ul> <li> At the start of a programme and again at its end, NAISI&apos;s admins may send a survey to everybody holding a place on it, and 6 and 12 months later a follow-up to the people who said yes to one\. Every survey is confidential: we keep your answers with your name, and each survey says so at the top\. Only NAISI&apos;s admins can see who said what\. Facilitators never see anything of a survey\. <\/li>/,
    );
    // Confidential is the one setting a survey has, whatever is stored.
    assert.match(read("src/lib/firestore/surveys.ts"), /export type SurveyPrivacy = "confidential";/, "a survey can now be something other than confidential");
    assert.equal(surveyRecords.normalizeSurvey("s1", { privacy: "anonymous" }).privacy, "confidential");
    // The sentence about anonymous surveys, moved here from Feedback on the
    // material, promised that an anonymous form would say so and how, with
    // the policy first. The anonymous form keeps that promise and replaces the
    // sentence: the passage now closes with the form's three points, each on
    // the page once, and the promise is gone (the next test holds the three
    // to the code).
    const passage = PAGE_FLAT.slice(PAGE_FLAT.indexOf("<h3>When you answer a survey</h3>"), PAGE_FLAT.indexOf("<h3>When you subscribe to our newsletter</h3>"));
    assert.match(passage, /<li> One form is anonymous: [^<]* <\/li> <li> We keep the day, not the time\. [^<]* <\/li> <li> Only the programme&apos;s lead and NAISI&apos;s admins read the answers, [^<]* The form closes when the survey at the end does\. <\/li> <\/ul> $/);
    assert.equal((PAGE_FLAT.match(/We do not currently run anonymous surveys/g) ?? []).length, 0, "the promise is still on the page beside the form that kept it");
    assert.equal((PAGE_FLAT.match(/One form is anonymous/g) ?? []).length, 1);

    // Every page and route that reaches survey code from outside it, and why
    // each may: the admins' (behind the (admin-only) layout, or canRunSurveys
    // in the route), the person's own (by the secret in their link, or signed
    // in by their own row), and the two that take names off. No facilitator's
    // page, and no lead's but two: the programme's Surveys tab and one
    // survey's results under it, the totals and comments of the lead's own
    // programme's surveys, never a name (CHANGED ON PURPOSE, Q46 and Q49 A;
    // then finding L2, which widened the second from the leaving survey to
    // every survey of the programme and added the first).
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
        // This term in numbers (sv-term, Q51 B): counts made on the server, never a name.
        ["src/app/(app)/admin/(admin-only)/surveys/term/page.tsx", `${ADMIN_PAGE}; This term in numbers, counts made on the server, never a name`],
        ["src/app/api/surveys/term/totals/route.ts", `${ADMIN_ROUTE}; This term in numbers as a file of totals that names nobody, not a recorded download`],
      ]),
      "reaching survey code from outside it",
      "The policy says only admins see who said what or who has answered, and " +
        "that facilitators see nothing of a survey. If this file shows a " +
        "survey, its answers or who answered to anybody else, the sentence is " +
        "wrong and a new version has to say so.",
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
      ]),
      "addressing who a survey was sent to, or what somebody answered",
      "The policy says only admins see who said what or who has answered. If " +
        "this file reads either for anybody else, the sentence is wrong and a " +
        "new version has to say so.",
    );
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
    assert.match(
      PAGE_FLAT,
      /<li> A survey records nothing about how you fill it in: not when you opened it, how long you spent on it or which page you were on, and none of your answers is kept until you send them\. We record when you sent them, whether you used your own link or were signed in, and whether your group had met for the first time by then\. We never keep your IP address with them, and the request logs our hosting provider keeps \(see Operational logs\) are never matched to them\. <\/li>/,
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

  test("every question in a survey can be skipped, and no code of the applications, admissions or courses reads a survey", () => {
    assert.match(PAGE_FLAT, /<li> Every question can be skipped\. Nothing you say in a survey affects your place on a programme or an application\. <\/li>/);
    // The rule, run: the before survey requires nothing, and a question stored
    // as required is refused.
    // CHANGED ON PURPOSE (Q46): the leaving survey's template is held to it too.
    for (const [stage, kind, strand] of [["before", "fellowship", null], ["after", "fellowship", null], ["followUp6", "fellowship", null], ["before", "incubator", "alignment"], ["after", "incubator", "governance"], ["leaving", "fellowship", null]]) {
      const each = surveyTemplates.templateItems(stage, kind, strand);
      assert.deepEqual(surveyItems.validateSurveyItems(each), [], `the ${stage} template of a ${kind} is not valid`);
      assert.ok(surveyItems.surveyQuestionsOf(each).every((question) => question.required !== true), `the ${stage} template of a ${kind} requires an answer`);
    }
    const template = surveyTemplates.templateItems("before", "fellowship", null);
    const required = template.map((item) => (item.id === "q_c1" ? { ...item, required: true } : item));
    assert.deepEqual(
      surveyItems.validateSurveyItems(required).map((problem) => problem.message),
      ["Every question in a survey can be skipped, so none is required."],
    );
    assert.equal(surveyWords.ANSWER_WORDS.skippable, "Every question can be skipped.");
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
    assert.match(PAGE_FLAT, /<li> We keep your name with your answers so that we can compare them with your answers to the same questions at the end of the programme and in any follow-ups, and so that a reminder goes only to people who have not answered\. Only admins see who has answered\. The survey at the end shows you what you said you wanted from the programme, so you can say whether you got it; nobody else is shown it there\. <\/li>/);
    assert.match(PAGE_FLAT, /<li> A survey and its reminder are emailed as important notices, so your notification settings do not switch them off\. Each email carries a link of your own, so you can answer without signing in\. Anyone holding it could answer in your name, so keep it to yourself\. <\/li>/);
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
    // The reminder: people it was sent to who have not answered, and still hold a place.
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
    assert.match(
      PAGE_FLAT,
      /<strong>Survey answers\.<\/strong> We take your name off your answers to a survey on the day it tells you, two years after the programme&apos;s last session, and delete the record that it was sent to you, with your link to answer it and what you said about follow-ups\. Your answers stay in its totals, no longer linked to you\./,
    );
    assert.match(PAGE_FLAT, /written work, feedback you gave us \(survey answers, below, are the exception\), and notes written about you\./);
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
    assert.match(job, /const due = \(await listSurveys\(db\)\)\.filter\(\(survey\) => namesDueOff\(survey, today\)\);/);
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
    assert.match(PAGE_FLAT, /<li> Your answers to surveys, no longer linked to you: they stay in the totals\. <\/li>/);
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
  // questionnaire's part (c), 26 October 2026). Each of its three points, and
  // the retention and deletion sentences, held to the code that makes it true.
  test("the anonymous form keeps three answers, the programme and the day, reads nothing of the person, moves each day's answers overnight, is read from the next day by the lead and admins, and goes with the run", () => {
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
    // The form reads nothing about who is answering: no session, no cookie,
    // no header but the rate limit's key (the no-trace guard walks every file
    // both doors reach), and the browser sends the answers without its sign-in.
    const route = withoutComments(read("src/app/api/feedback/route.ts"));
    assert.ok(!/getCurrentUser|assertNotImpersonating|cookies\(|next\/headers/.test(route));
    assert.equal((route.match(/clientIp\(/g) ?? []).length, 1);
    assert.match(withoutComments(read("src/features/anonymousFeedback/AnonymousForm.tsx")), /credentials: "omit",/);
    // What it keeps: the three answers, the programme and the day, field by field, and nothing else.
    assert.match(anonymousModel, /export const ANSWER_FIELDS = \["roundId", "programmeId", "runId", "keep", "change", "drop", "day"\] as const;/);
    const added = /\.add\(\{([\s\S]*?)\}\);/.exec(withoutComments(read("src/lib/anonymousFeedback/answer.ts")));
    assert.deepEqual([...added[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]), ["roundId", "programmeId", "runId", "keep", "change", "drop", "day"]);
    assert.match(anonymousModel, /export function dayOf\(at: Date\): string \{\s*return londonDateKey\(at\);\s*\}/);
    // It says so at the top, before its questions.
    const screen = read("src/features/anonymousFeedback/AnonymousFormScreen.tsx");
    const box = screen.indexOf("<section className={styles.box} aria-label={screen.box.heading}>");
    const questions = screen.indexOf("<AnonymousForm ");
    assert.ok(box !== -1 && questions !== -1 && box < questions, "the anonymous box is no longer drawn above the form's questions");
    // The day and not the time: answers wait, and once their day is over the
    // night's move writes them, by name, into the record kept, and deletes
    // what waited. The job emails nobody, so it registers on.
    const move = withoutComments(read("src/lib/anonymousFeedback/move.ts"));
    assert.match(anonymousModel, /export function dueToMove\(answer: Pick<AnonymousAnswer, "day">, today: string\): boolean \{\s*return answer\.day < today;\s*\}/);
    assert.match(move, /tx\.create\(db\.collection\(ANONYMOUS_ANSWERS_COLLECTION\)\.doc\(\), \{/);
    assert.match(move, /tx\.delete\(snap\.ref\);/);
    const job = withoutComments(read("src/lib/scheduler/jobs/anonymousFeedbackMove.ts"));
    assert.match(job, /id: "anonymous-feedback-move",/);
    assert.ok(!/enabledByDefault/.test(job), "the move now waits for somebody to switch it on, while the policy says it happens");
    assert.match(withoutComments(read("src/lib/scheduler/registry.ts")), /^\s*anonymousFeedbackMoveJob,$/m);
    // Who reads them, and from when: the lead and admins, decided before any
    // answer is read; from the day after; each question's in alphabetical order.
    const page = withoutComments(read("src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback/page.tsx"));
    assert.ok(page.indexOf("loadProgrammeRun(db, user, roundId, programmeId)") < page.indexOf("readAnonymousAnswers("), "the answers are read before the page decides who is reading");
    assert.match(read("src/lib/applications/access.ts"), /export function opensProgrammeGroups\(role: ProgrammeRole \| null\): boolean \{\s*return role === "admin" \|\| role === "lead";\s*\}/);
    assert.match(withoutComments(read("src/lib/anonymousFeedback/readers.ts")), /answer\.day < today/);
    assert.deepEqual(
      anonymousRecords.answersInOrder([{ keep: "Zebra" }, { keep: "apple" }, { keep: "" }, { keep: "Mango" }], "keep"),
      ["apple", "Mango", "Zebra"],
      "the readers' order now follows something other than the words",
    );
    // Until the survey at the end closes: its closing time and its Close.
    assert.match(read("src/app/api/surveys/[surveyId]/close/route.ts"), /await closeAnonymousForm\(db, surveyId\);/);
    // Kept with the run's records and deleted with it; an account's deletion has nothing to find.
    const engine = withoutComments(read("src/lib/firestore/courseDeletion.ts"));
    assert.match(engine, /key: "anonymousFeedback",/);
    assert.match(engine, /\[ANONYMOUS_FORMS_COLLECTION, ANONYMOUS_WAITING_COLLECTION, ANONYMOUS_ANSWERS_COLLECTION\]\.map\(\s*\(collection\) => \(\) => drainQuery\(db, collection, byRunId\(collection\), budget\),/);
    assert.ok(!/anonymousFeedback|ANONYMOUS_/.test(withoutComments(read("src/lib/firestore/accountDeletion.ts"))), "an account's deletion now reaches the anonymous answers, which the policy says it removes none of");
    assert.match(PAGE_FLAT, /<li> Your answers to the anonymous form: nothing in them says they were yours, so there is nothing of yours to remove\. <\/li>/);
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
    const kinds = /<li> (A programme&apos;s surveys ask about [^<]*) <\/li>/.exec(PAGE_FLAT);
    assert.ok(kinds, "the passage no longer says what a programme's surveys ask");
    assert.equal(
      kinds[1],
      "A programme&apos;s surveys ask about your level and subject of study, what you had done in AI safety before and how you first heard about NAISI; your career stage and plans, how likely you think you are to work on AI safety and the kinds of work that interest you; what you understand and know of the field, how many people in it you could contact, and how sure you are of your next step and of what you could contribute; what stands in your way and the steps you have taken; and what you want from the programme. At the end and in the follow-ups they also ask how the programme went, what it changed, what else shaped your plans, what you are doing now and what you plan next. An incubator&apos;s also ask about your research skills and what your team produced.",
    );
    // Each kind the sentence names, and the questions it covers.
    const KINDS = new Map([
      ["your level and subject of study", ["q_p3_level", "q_p3_subject"]],
      ["what you had done in AI safety before", ["q_p4"]],
      ["how you first heard about NAISI", ["q_p5"]],
      ["your career stage and plans", ["q_c1", "q_t1"]],
      ["how likely you think you are to work on AI safety", ["q_c2"]],
      ["the kinds of work that interest you", ["q_c3"]],
      ["what you understand and know of the field", ["q_c4", "q_c5", "q_t2", "q_t3"]],
      ["how many people in it you could contact", ["q_c6", "q_i3"]],
      ["how sure you are of your next step and of what you could contribute", ["q_c7"]],
      ["what you want from the programme", ["q_p6", "q_q3"]],
      ["what stands in your way", ["q_c8"]],
      ["the steps you have taken", ["q_c9", "q_f4_applied", "q_f4_accepted"]],
      ["how the programme went", ["q_q1", "q_q2"]],
      ["what it changed", ["q_a1", "q_a2", "q_a3", "q_a5", "q_f7"]],
      ["what else shaped your plans", ["q_a4"]],
      ["what you are doing now", ["q_f1", "q_f1_where", "q_f2", "q_f3"]],
      ["what you plan next", ["q_n1", "q_n2", "q_n3", "q_i7"]],
      ["your research skills", ["q_i1", "q_i2", "q_i2_back"]],
      ["what your team produced", ["q_i4", "q_i4_links", "q_i4_when", "q_i5", "q_i6"]],
    ]);
    const asked = new Set();
    for (const [stage, kind, strand] of [["before", "fellowship", null], ["after", "fellowship", null], ["followUp6", "fellowship", null], ["followUp12", "fellowship", null], ["before", "incubator", "alignment"], ["after", "incubator", "governance"]]) {
      for (const question of surveyItems.surveyQuestionsOf(surveyTemplates.templateItems(stage, kind, strand))) asked.add(question.id);
    }
    const named = new Set();
    for (const [words, ids] of KINDS) {
      assert.ok(kinds[1].includes(words), `the sentence no longer names "${words}"`);
      for (const id of ids) {
        assert.ok(asked.has(id), `"${words}" covers ${id}, which no template asks any more`);
        named.add(id);
      }
    }
    assert.deepEqual([...asked].filter((id) => !named.has(id)), [], "a template asks a question of a kind the policy does not name");
    // The kinds the brief asked the policy to name, by their own words.
    for (const kind of ["career stage and plans", "could contact", "stands in your way", "steps you have taken", "shaped your plans", "plan next"]) {
      assert.ok(kinds[1].includes(kind), `the sentence no longer says ${kind}`);
    }
    // Every survey is made from a template, and a fellowship asks none of an incubator's questions.
    const create = withoutComments(read("src/lib/surveys/create.ts"));
    assert.match(create, /const items = templateItems\(input\.stage, programme\.kind, strand\);/);
    assert.ok(![...surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("after", "fellowship", null))].some((question) => question.id.startsWith("q_i")));
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-items.test.mjs")), "tests/surveys-items.test.mjs holds every template word for word");
  });

  test("a survey offers only the level and subject of study from a profile, as a starting answer the person can change, and keeps only what is sent", () => {
    assert.match(PAGE_FLAT, /<li> Where your profile holds them, the survey before a programme starts its questions about your level and subject of study on your profile&apos;s answers\. You can change or clear either before you send it, and only what you send is kept\. <\/li>/);
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
    // "If you did not answer it there, the survey at the end asks you the
    // same": the same box at the end, asked only of somebody whose before
    // survey has not had their word, kept on their row there, and read by the
    // follow-ups' audience after the before survey's.
    const endBox = surveyTemplates.templateItems("after", "fellowship", null).find((item) => item.kind === "consent");
    assert.deepEqual(endBox.boxes, consent.boxes, "the box at the end is not the before survey's box");
    const asking = withoutComments(read("src/lib/surveys/consent.ts"));
    assert.match(asking, /return saysFollowUps\(beforeRow\) \? purposes\.filter\(\(purpose\) => purpose !== "followUps"\) : purposes;/, "the survey at the end now asks somebody whose before survey has their word");
    assert.match(answer, /if \(!asked\.includes\(purpose\)\) delete said\.consents\[purpose\];/, "a box somebody was not shown now says something for them");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-follow-ups-at-end.test.mjs")), "tests/surveys-follow-ups-at-end.test.mjs asks the box at the end, keeps it and sends the follow-ups by it");
    // "Until your name comes off": names off deletes the rows that hold it.
    assert.match(withoutComments(read("src/lib/surveys/namesOff.ts")), /await inPages\(people\.docs, \(batch, doc\) => batch\.delete\(doc\.ref\), db\);/);
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-routes.test.mjs")), "tests/surveys-routes.test.mjs sends the follow-ups only to people who said yes and changes it by both doors");
  });

  test("Kairos is sent everybody's name and programme record unless they say no, on every programme survey and the profile, and saying no changes nothing else", () => {
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
    // "and the same choice is on your profile": the page draws it for the
    // person signed in, and its route changes their own record alone.
    assert.match(withoutComments(read("src/app/(app)/profile/page.tsx")), /<KairosSetting shared=\{shared\} \/>/);
    const route = withoutComments(read("src/app/api/account/kairos/route.ts"));
    assert.match(route, /await writeKairosChoice\(db, \{ uid: actor\.uid, shared, via: "settings" \}\);/);
    assert.match(route, /const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/);
    // "You can change it at any time, and the next file goes by it": the
    // file reads every choice when it is made.
    assert.match(withoutComments(read("src/lib/kairos/file.ts")), /kairosChoicesOf\(db, uids\),/);
    // "Saying no stops only what goes to Kairos with your name: NAISI's
    // admins still see your survey answers, and they still count in our
    // totals": nothing that shows or counts answers reads the choice.
    for (const file of ["src/lib/surveys/results.ts", "src/lib/surveys/adminView.ts", "src/lib/surveys/exportTable.ts", "src/lib/surveys/kairosReport.ts"]) {
      assert.ok(!/kairosChoicesOf|sharesWithKairos/.test(withoutComments(read(file))), `${file} now leaves out somebody who said no to Kairos`);
    }
    // "We keep your choice ... until your account is deleted": the account's
    // deletion takes it, and no job does. The same claim is made under
    // Retention ("Kept for as long as your account exists, so a later
    // programme goes by it too": one record for the person, read by every
    // programme's file), in the list of what a deletion removes, and under
    // Your rights, where the profile is one of the two places to say no
    // (held to the profile page above). Privacy pass 2 held those three here.
    assert.match(PAGE_FLAT, /<strong>Your choice about Kairos\.<\/strong> Kept for as long as your account exists, so a later programme goes by it too\./);
    assert.match(PAGE_FLAT, /every rating you gave or were given at the end of a programme, your choice about sharing with Kairos, your membership records/);
    assert.match(PAGE_FLAT, /You can edit your profile and notification preferences, and say no to sharing with Kairos, from <a href="\/profile">your profile page<\/a>/);
    assert.match(withoutComments(read("src/lib/firestore/accountDeletion.ts")), /summary\.kairosChoiceDeleted = await deleteKairosChoice\(db, uid\);/);
    assert.deepEqual(sourceFilesNaming(/\bdeleteKairosChoice\(/).filter((file) => file !== "src/lib/kairos/choice.ts"), ["src/lib/firestore/accountDeletion.ts"]);
    assert.match(withoutComments(read("src/lib/kairos/choice.ts")), /\.collection\(KAIROS_CHOICES_COLLECTION\)\.doc\(uid\)/, "the Kairos choice is no longer one record for the person, which every programme's file reads");
    // "These never name anybody": the report, run with people in it, carries
    // no uid out.
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
    // "Nobody rates themselves, and two facilitators of one group never rate
    // each other: a facilitator ... is rated by the programme's lead or an
    // admin, who can also rate anybody else on the programme."
    const group = { facilitatorUids: ["rahul", "sofia"], standingFacilitatorUids: ["rahul", "sofia"] };
    const as = (uid, roles = {}) => ({ uid, isAdmin: false, leads: false, ...roles });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "amara"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "rahul"), { ok: false, reason: "self" });
    assert.deepEqual(ratingRules.mayRate(as("rahul"), group, "sofia"), { ok: false, reason: "co-facilitator" });
    assert.deepEqual(ratingRules.mayRate(as("rahul", { isAdmin: true }), group, "sofia"), { ok: false, reason: "co-facilitator" }, "an admin who co-facilitates now rates a co-facilitator");
    assert.deepEqual(ratingRules.mayRate(as("claudia", { leads: true }), group, "sofia"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("zach", { isAdmin: true }), group, "amara"), { ok: true });
    assert.deepEqual(ratingRules.mayRate(as("amara"), group, "bea"), { ok: false, reason: "not-yours" });
    // "Beside each rating we show how many sessions the person came to, read
    // from the register, never typed in": a rating cannot carry it.
    assert.deepEqual(ratingModel.parseRatingAnswers({ f1: 6 }, "fellowship"), { ok: false, problem: ratingModel.RATING_PROBLEMS.notAsked });
    // "Ratings are read only by the programme's lead, NAISI's admins, and the
    // person who gave each one, who sees only their own. They are never shown
    // to the person rated, on any page or in any email."
    assert.equal(ratingRules.readsEveryRating(as("rahul")), false);
    const view = withoutComments(read("src/lib/ratings/view.ts"));
    assert.match(view, /if \(fellow\.uid === actor\.uid\) continue;/, "a page now shows somebody a rating of themselves");
    assert.match(view, /const others = reader\s*\? ratings/, "a facilitator now reads other people's ratings");
    const reachesRatings = /(?:\bfrom\s*|\bimport\s*\(\s*)"(?:@\/(?:lib|features)\/ratings|(?:\.{1,2}\/)+(?:[\w-]+\/)*ratings)[/"]/;
    assert.deepEqual(sourceFilesNaming(reachesRatings).filter((file) => file.startsWith("src/emails/")), [], "an email now reaches the ratings");
    // "We delete them two years after the programme's last session, and at
    // once if the account of whoever gave or was given one is deleted."
    const job = withoutComments(read("src/lib/scheduler/jobs/surveyNamesOff.ts"));
    assert.match(job, /const off = twoYearsAfter\(sheet\.lastSessionOn\);\s*return off !== null && off <= today;/);
    assert.match(job, /const ratings = await deleteRunRatings\(db, sheet\.runId\);/);
    // Retention says it again, "the day names come off its surveys": the same
    // job, and the same two years after the same last session that a
    // survey's own day is worked out from (privacy pass 2).
    assert.match(PAGE_FLAT, /<strong>Ratings at the end of a programme\.<\/strong> We delete them two years after the programme&apos;s last session, the day names come off its surveys\./);
    assert.match(withoutComments(read("src/lib/surveys/namesOff.ts")), /const last = runEndOf\(run, groups, now\)\.lastDateKey;\s*return last \? twoYearsAfter\(last\) : null;/);
    assert.ok(job.indexOf("await takeNamesOffSurvey(db, survey)") < job.indexOf("await deleteRunRatings(db, sheet.runId)"), "the ratings no longer go in the names-off job's own pass");
    // The list of what a deletion removes names them, held to the cascade's
    // step above (privacy pass 2).
    assert.match(PAGE_FLAT, /a conduct flag if there is one, every rating you gave or were given at the end of a programme,/);
    // A copy of a person's data covers the ratings they were given: each one
    // is found by the person it is about (the store's own reading, below).
    assert.match(PAGE_FLAT, /the notes a facilitator wrote about you, the ratings you were given at the end of a programme, and the reason behind a conduct flag\./);
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
 * What v7 says about check-in, held to the code that makes it true
 * (`src/lib/events/checkIns.ts`), the way the course hub passage is held
 * above: each sentence of "When you come to an event", its line under "How we
 * use it", its paragraph under Retention and its line under what a deletion
 * leaves behind, paired with a rule that is run or a line of source that is
 * matched. Added while v7 was on dev, before any member had been asked to
 * accept it, so it kept its number. The suites that run check-in as every
 * kind of caller are `tests/event-*.test.mjs`.
 */
const checkInAccess = await loadTs("lib/events/checkInAccess.ts");
const checkInRules = await loadTs("lib/events/checkIns.ts");
const checkInCounts = await loadTs("lib/events/checkInView.ts");
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
    assert.match(PAGE_FLAT, /<h3>When you come to an event<\/h3>/);
    assert.match(
      PAGE_FLAT,
      /If you come to an event, we may record that you came, how and when: you check yourself in with the code at the door, or a committee member ticks your name on the door list\. Only NAISI&apos;s admins and the committee members the Students&apos; Union recognises can see who came, as they can see who signed up\. The event&apos;s other organisers see how many came, never who\./,
    );
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
    assert.deepEqual(readers, [
      "src/app/(app)/events/manage/[id]/check-in/page.tsx",
      "src/app/(app)/events/manage/[id]/door/page.tsx",
      "src/app/api/events/[id]/check-ins/route.ts",
      "src/lib/surveys/term/load.ts",
    ]);
    for (const file of readers) assert.match(read(file), /runsCheckIn\((?:viewer|user)\)/, file);
    const tab = withoutComments(read("src/app/(app)/events/manage/[id]/check-in/page.tsx"));
    assert.match(tab, /const staff = runsCheckIn\(viewer\);/);
    assert.match(tab, /\{staff && takes && \(\s*<div className=\{styles\.columns\}>/);
  });

  test("not coming is recorded nowhere: a record says somebody came, and nothing else", () => {
    assert.match(
      PAGE_FLAT,
      /Not coming is recorded nowhere\. It is never held against you, and it never stops you signing up again\./,
    );
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
    assert.match(
      PAGE_FLAT,
      /If you come without signing up, we take your name at the door, and an email address only if you want that event&apos;s survey\. We use the address for nothing else, and delete it when that survey closes, or a week after the event if that comes first\./,
    );
    assert.match(PAGE_FLAT, /A walk-in&apos;s email address is deleted when the event&apos;s survey closes, or a week after the event if that comes first\./);
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
    assert.match(
      PAGE_FLAT,
      /<strong>Who came to an event\.<\/strong> We keep the record of who came with names for a year after the event, then take the names off and keep the count\./,
    );
    assert.match(PAGE_FLAT, /<li> The record that you came to an event, no longer linked to you: it stays in the count\. <\/li>/);
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
    assert.match(PAGE_FLAT, /<li> The record that you came to an event, no longer linked to you: it stays in the count\. <\/li>/);
    assert.match(PAGE_FLAT, /then take the names off and keep the count\./);
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
    // Counted: three people came, two by a sign-up (one with the code) and one walking in.
    const counts = checkInCounts.doorCounts([], checkInCounts.namesOffOf(records));
    assert.deepEqual([counts.here, counts.signupsHere, counts.walkIns, counts.byQr, counts.byList], [3, 2, 1, 1, 1]);
    // Every count of who came takes them, from the same check-ins as its rows.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bdoorCounts\(/).filter((file) => file !== "src/lib/events/checkInView.ts"),
      new Map([
        ["src/app/(app)/events/manage/[id]/check-in/page.tsx", "the Check-in tab's four numbers, which everybody in the events area sees"],
        ["src/features/events/checkIn/DoorList.tsx", "the door list's count of who is here and who is still to come"],
        ["src/features/events/checkIn/WhoCame.tsx", "the Check-in tab's list of who came, with its count, and of who didn't"],
      ]),
      "counting who came to an event",
      "Count the records whose names have come off too (`namesOffOf`), as the policy says they stay in the count, then list the file here.",
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

  test("the email that confirms a place carries the check-in link, and no other email does", () => {
    assert.match(
      PAGE_FLAT,
      /When your place at an event is confirmed, the email that tells you has a link that checks you in at the door, so you can check in without an account\. Anyone holding it could check in in your name, so keep it to yourself\./,
    );
    const send = withoutComments(read("src/lib/events/sendRsvpEmail.ts"));
    assert.match(send, /if \(holder\) \{\s*checkInUrl = `\$\{baseUrl\(\)\}\/events\/\$\{event\.id\}\/check-in\?r=/);
    assert.match(send, /return holdsPlace\(variant === "approved" \|\| variant === "promoted" \? "confirmed" : "pending"\);/);
  });

  test("the record is used to count who comes, and no page lists one person's events", () => {
    assert.match(PAGE_FLAT, /We use the record to count who comes\. Nobody is shown one person&apos;s list of the events they came to\./);
    assert.match(PAGE_FLAT, /<li>Check people in at an event, and count who comes\.<\/li>/);
    // The only read of check-ins by person is the account deletion's.
    const rules = withoutComments(read("src/lib/events/checkIns.ts"));
    assert.equal((rules.match(/\.where\("uid"/g) ?? []).length, 1);
    assert.equal((rules.match(/\.where\("rsvpId"/g) ?? []).length, 0);
  });

  // The survey about leaving (Q46, 26 October 2026): two sentences, each held
  // to the code that keeps it.
  test("the survey about leaving reaches only somebody who leaves, through their own link, on their page, in their email and on Home until answered, and nobody presses send", () => {
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
    // What it asks, by kind, both ways.
    const ASKS = new Map([
      ["why you left", ["q_leave_why"]],
      ["what would have helped you stay", ["q_leave_stay"]],
      ["whether you would take part again", ["q_leave_again"]],
    ]);
    const asked = surveyItems.surveyQuestionsOf(surveyTemplates.templateItems("leaving", "fellowship", null)).map((question) => question.id);
    const sentence = /It asks (why you left, what would have helped you stay and whether you would take part again)\./.exec(PAGE_FLAT);
    assert.ok(sentence, "the policy no longer says what the survey about leaving asks");
    for (const [words, ids] of ASKS) {
      assert.ok(sentence[1].includes(words), `the sentence no longer names "${words}"`);
      for (const id of ids) assert.ok(asked.includes(id), `"${words}" covers ${id}, which the leaving template no longer asks`);
    }
    assert.deepEqual(asked.filter((id) => ![...ASKS.values()].flat().includes(id)), [], "the leaving template asks a question the policy does not name");
    assert.ok(existsSync(join(REPO_ROOT, "tests", "surveys-leaving.test.mjs")), "tests/surveys-leaving.test.mjs runs both doors, the page and the email, and nobody else");
  });

  test("a programme's lead sees its surveys' totals and comments as they come, never a name, who answered or a download, in no order that follows when they came, and its material's average ratings from three", () => {
    assert.match(
      PAGE_FLAT,
      /<li> The programme&apos;s lead sees the totals and comments of its surveys before it, at its end and in the follow-ups as answers come in, with the comments in an order that does not follow when they came in\. The lead never sees your name or who answered and who did not, and cannot download the answers\. When only a few people answer, the lead may still be able to tell which answer is yours\. <\/li>/,
    );
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
 * What v7 says about the survey after an event (docs/surveys.md, "Surveys
 * after events"), held to the code that makes it true: who it goes to and who
 * reads it, what it asks, its QR code and its email, what is kept with the
 * answers, when names come off and what its file holds. Added while v7 was on
 * dev, before any member had been asked to accept it, so it kept its number.
 * `tests/surveys-events.test.mjs` runs every route and page as every kind of
 * caller; here each sentence is paired with a rule that is run or a line of
 * source that is matched.
 */
const eventSurveyTemplate = await loadTs("lib/surveys/events/template.ts");
const eventSurveyWords = await loadTs("lib/surveys/events/words.ts");

describe("the survey after an event", () => {
  const WHO = /<li> After an event, NAISI&apos;s admins may send a survey to the people who came to it, or to everybody whose place on it was confirmed, and to nobody else\. It is confidential like every survey: your answers keep your name, and only NAISI&apos;s admins can see who said what and whether they came\. The event&apos;s organisers are told that it went and when, and nothing of its results\. <\/li>/;
  const ASKS = /<li> The survey after an event asks how it was, whether you would come to another, what we should run next, how you heard about it and what we should change\. <\/li>/;
  const CODE = /<li> At the end of an event its QR code opens the survey\. Signed in, you answer it there if you came or signed up, and its email afterwards skips you; signed out, it asks you to sign in\. Its email is an important notice, like every survey&apos;s, with a link of your own, sent to your account&apos;s address, or if you have no account to the address you gave when you signed up or at the door\. With your answers we keep when you sent them and whether you used your link or were signed in\. <\/li>/;
  const NAMES_OFF = /no longer linked to you\. For the survey after an event, that day is two years after the event\./;
  const FILE = /The file of a survey after an event has no column about a group, and names a guest by the name they gave the event\./;

  test("the frozen v6 carries none of these sentences", () => {
    for (const pattern of [/After an event, NAISI&apos;s admins may send a survey/, /The survey after an event asks/, /its QR code opens the survey/, /For the survey after an event, that day/, /The file of a survey after an event/]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("who it goes to: the people who came or everybody confirmed, nobody else; confidential; the organisers see that it went, never its results", () => {
    assert.match(PAGE_FLAT, WHO);
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
    assert.match(PAGE_FLAT, ASKS);
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
      "the survey after an event asks something the policy does not say it asks",
    );
    assert.ok(items.every((item) => item.required === false), "a question of the survey after an event is required");
    assert.deepEqual(surveyItems.validateSurveyItems(items), []);
  });

  test("its QR code, its email and what is kept with the answers", () => {
    assert.match(PAGE_FLAT, CODE);
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
      "an answer to a survey after an event now keeps something the policy does not list",
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
    assert.match(PAGE_FLAT, NAMES_OFF);
    assert.match(PAGE_FLAT, FILE);
    const records = withoutComments(read("src/lib/surveys/events/records.ts"));
    assert.match(records, /const ends = eventEnds\(event\);\s*return ends \? twoYearsAfter\(londonDateKey\(ends\)\) : null;/);
    // The day is the survey's own, which the surveys-names-off job reads for every survey alike.
    assert.match(withoutComments(read("src/lib/surveys/events/create.ts")), /namesOffOn,\n/);
    assert.match(withoutComments(read("src/lib/scheduler/jobs/surveyNamesOff.ts")), /const due = \(await listSurveys\(db\)\)\.filter\(\(survey\) => namesDueOff\(survey, today\)\);/);
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
 * What v7 says about This term in numbers (board sv-term, Q51 B;
 * docs/surveys.md "This term in numbers"), held to the code that makes it
 * true: who sees it, how one person is matched across events and who never
 * is, and that it is counts and nothing else. Added while v7 was on dev,
 * before any member had been asked to accept it, so it kept its number.
 * `tests/surveys-term-numbers.test.mjs` and its page and file suites run it
 * as every kind of caller.
 */
const termModel = await loadTs("lib/surveys/term/model.ts");
const termTotals = await loadTs("lib/surveys/term/totals.ts");

describe("this term in numbers", () => {
  const SENTENCE =
    /<li> NAISI&apos;s admins also see how many different people came to a term&apos;s events, and how many came to two or more of them\. To count you once, we match your check-ins by your account and its email address, and a sign-up you made without an account by the email address you gave; a walk-in with no account is never matched\. Admins see these as counts only, on a page and in a file of totals, never as who came to which events\. <\/li>/;

  test("the frozen v6 carries none of it", () => {
    assert.ok(!/how many different people came/.test(V6_FLAT));
    assert.ok(!/a walk-in with no account is never matched/.test(V6_FLAT));
  });

  test("admins alone see it: the page, the file and the loader each ask before anything is read", () => {
    assert.match(PAGE_FLAT, SENTENCE);
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
    // The file is a GET that writes nothing, and records no download (the five recorded are listed above).
    const route = withoutComments(read("src/app/api/surveys/term/totals/route.ts"));
    assert.ok(!/logExport|dataExports/.test(route), "the file of totals is now a recorded download, which the policy's list of five does not name");
    assert.match(route, /^export async function GET\(\)/m);
  });
});

// ---------------------------------------------------------------------------
// §2g, continued: one person's answers, opened by an admin
// ---------------------------------------------------------------------------

/**
 * What v7 says about an admin opening one person's survey answers (board
 * sv-person; docs/surveys.md, "One person's answers"), held to the code that
 * makes it true: who may open them and on what, the record written before
 * anything of them is read and what it holds, nothing shown when it cannot be
 * written, and the record kept when names come off and when an account is
 * deleted. Added while v7 was on dev, before any member had been asked to
 * accept it, so it kept its number. `tests/surveys-one-person.test.mjs` runs
 * the route and the page as every kind of caller; here each sentence is
 * paired with a line of source that is matched or a rule that is run.
 */
describe("one person's answers, opened by an admin", () => {
  const BULLET =
    /<li> An admin can open one person&apos;s answers to a programme&apos;s surveys, or to a survey after an event, together on one page\. Each time, before anything of them is read, we record who opened them, whose they were, by an id and never by name, which surveys and when, and never what the answers say; if that record cannot be written, nothing of them is shown\. We keep that record when names come off and when an account is deleted, as we keep the record of downloads\. <\/li>/;

  test("the frozen v6 carries none of it", () => {
    for (const pattern of [/An admin can open one person&apos;s answers/, /whose they were, by an id and never by name/, /We keep that record when names come off/]) {
      assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
    }
  });

  test("an admin opens them, a programme's or an event's, on one page", () => {
    assert.match(PAGE_FLAT, BULLET);
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
    assert.match(PAGE_FLAT, BULLET);
    const log = withoutComments(read("src/lib/firestore/recordOpenings.ts"));
    const writer = log.slice(log.indexOf("export async function openSurveyAnswersRecorded"));
    const created = writer.indexOf("await ref.create({");
    assert.ok(created > -1 && writer.indexOf("const value = await read();") > created, "the answers are read before the opening is recorded");
    const row = writer.slice(created, writer.indexOf("});", created));
    assert.deepEqual(
      [...row.matchAll(/^\s*(\.\.\.)?(\w+)(?=[:,])/gm)].map((m) => `${m[1] ?? ""}${m[2]}`),
      ["kind", "actorUid", "actorName", "...subject", "surveyId", "surveyIds", "openedAt"],
      "an opening of survey answers now keeps something the policy does not list",
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
    assert.match(PAGE_FLAT, BULLET);
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
 * before it went live (v7 was on dev and nobody had accepted it, so it kept
 * its number): when you are free, once you hold a place, and the reminder to
 * say it; a written answer before it is sent; what the people in your pair
 * see of you, which made "They see nothing else about you" untrue until it
 * was said; and the record of an admin opening somebody's sealed predictions
 * or survey answers among the audit-style records a deletion leaves. Each is
 * paired with a rule that is run or a line of source that is matched, as the
 * rest of §2g is.
 */
const standingRules = await loadTs("lib/applications/status/standing.ts");
const pairsModel = await loadTs("lib/courses/pairs/model.ts");
const writtenModel = await loadTs("lib/courses/writtenAnswers/model.ts");

describe("the last pass before version 7 goes live", () => {
  const FREE =
    /If you are given a place on a fellowship, you can also change it on your application page from decision day until we email you your group\. That change counts at once, without sending your application again, and the version it replaces is kept with your earlier versions\./;
  const REMIND =
    /Until then, if you have not said when you are free, the programme&apos;s lead or an admin may email you to ask, at most once a day, whatever your notification settings say\./;
  const DRAFT =
    /It saves as you type, and until you send it, the others who read it see only that you have started it, never what it says\./;
  const PAIRS =
    /When a session is in pairs, the people in your pair see your first name and, where the week asks, whether you are bringing a laptop\. They see nothing else about you\./;
  const OPENINGS =
    /each decision made about an application, the record of each time an admin opened somebody&apos;s sealed predictions or survey answers, and the record of the five downloads the site logs\./;

  test("the frozen v6 carries none of these sentences", () => {
    for (const pattern of [FREE, REMIND, DRAFT, PAIRS, OPENINGS]) assert.ok(!pattern.test(V6_FLAT), `v6 already says ${pattern}`);
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
    assert.match(PAGE_FLAT, FREE);
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
      "The policy says somebody holding a place on a fellowship changes when they are free from decision day until their group is emailed. A new writer changes that sentence first.",
    );
  });

  test("the reminder to say when you are free: the programme's lead or an admin, a fellowship's people not yet told, at most once a day, whatever the settings say", () => {
    assert.match(PAGE_FLAT, REMIND);
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
    assert.ok(!/wantsEmailFor|addressesForSend|resolveCohortAudience|notifications|categories/.test(remind), "the reminder now reads a notification setting, which the policy says it does not");
    // Its one sender is that route.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bsendFreeReminders\(/).filter((file) => file !== "src/lib/courses/getReady/remind.ts"),
      new Map([["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind/route.ts", "Remind on the programme's Overview, pressed by its lead or an admin"]]),
      "sending the reminder to say when you are free",
      "The policy says the programme's lead or an admin may email this reminder. A new sender changes that sentence first.",
    );
  });

  test("a written answer saves as it is typed, and until it is sent its other readers see only that it has been started", () => {
    assert.match(PAGE_FLAT, DRAFT);
    // Saved without a Send: the words are written whatever the press, and only a Send stamps the first-sent time.
    const route = withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts"));
    assert.match(route, /\} else \{\s*write\.text = text;/);
    assert.match(route, /if \(sending\) \{\s*write\.firstSentAt = FieldValue\.serverTimestamp\(\);/);
    // "Draft" is all a reader is told of an answer not sent, run.
    const record = (over) => ({ text: "", boxes: null, words: 0, firstSentAt: null, editedAt: null, openedAt: null, openedByUid: "", reopenedAt: null, reopenedByUid: "", feedback: null, ...over });
    assert.equal(writtenModel.answerState(record({ text: "Half a thought", words: 3 })), "draft");
    assert.equal(writtenModel.answerState(null), "not-started");
    assert.equal(writtenModel.answerState(record({ text: "Sent", words: 1, firstSentAt: new Date("2026-11-03T10:00:00Z") })), "sent");
    // The review page opens only an answer that was sent, and the review route refuses one that was not.
    const page = withoutComments(read("src/lib/courses/writtenAnswers/reviewPage.ts"));
    assert.match(page, /const readable = \[\.\.\.toGive, \.\.\.feedbackSent\];/);
    assert.match(page, /\(askedPerson \? readable\.find\(\(person\) => person\.uid === askedPerson\) : undefined\) \?\? toGive\[0\] \?\? feedbackSent\[0\] \?\? null;/);
    assert.match(withoutComments(read("src/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts")), /if \(!record\.firstSentAt\) throw new ReviewError\("That answer hasn’t been sent yet\.", 409\);/);
    // This week's work says the same word, and links nothing for a draft.
    assert.match(withoutComments(read("src/lib/courses/facilitatorWeek/workColumns.ts")), /case "draft":\s*return \{ text: DRAFT, href: null \};/);
  });

  test("the people in your pair see your first name and, where the week asks, whether you are bringing a laptop", () => {
    assert.match(PAGE_FLAT, PAIRS);
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

  test("the record of an admin opening somebody's sealed predictions or survey answers is an audit-style record a deletion leaves", () => {
    assert.match(PAGE_FLAT, OPENINGS);
    assert.match(PAGE_FLAT, /Audit-style records are kept for as long as needed to investigate issues and meet our accountability obligations, and are not removed when an account is deleted\./);
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
  test("lives on the shared authed layout, so every authed page passes it", () => {
    assert.match(AUTHED_LAYOUT, /CURRENT_POLICY_VERSION/);
    assert.match(AUTHED_LAYOUT, /redirect\("\/re-consent"\)/);
  });

  test("the page says when somebody is asked: the next time they open the member area, or their collaborator space", () => {
    // Not "the next time you sign in". The gate is on two layouts and nowhere
    // else: the one every page of the member area passes through, and the one
    // an external collaborator's space passes through. The sentence names
    // both. Somebody who signs in from the application form goes back to the
    // form, which is a public page, and is not asked there (the page says
    // that too, and §2d holds it).
    assert.match(
      PAGE_FLAT,
      /the next time you open the member area, or your collaborator space, you will be shown the new version and asked to accept or decline it/i,
    );
    assert.ok(
      !/the next time you sign in you will be shown/i.test(PAGE_FLAT),
      "v7 says again that a member is asked at their next sign-in. They are " +
        "asked the next time they open the member area, or their " +
        "collaborator space.",
    );
    assert.match(AUTHED_LAYOUT, /redirect\("\/re-consent"\)/);
    // Every place that asks, with comments left out so a note about the gate
    // is not taken for one. It is a layout each time, never a sign-in: the
    // member area's, and the space an external collaborator signs in to,
    // which is that person's member area.
    const asks = textFilesUnder(join(SRC, "app"))
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        /redirect\("\/re-consent"\)/.test(
          readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"),
        ),
      )
      .map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"))
      .sort();
    assert.deepEqual(
      asks,
      ["src/app/(app)/layout.tsx", "src/app/collaborator/layout.tsx"],
      "somewhere new asks a member to accept a new policy version, or one of " +
        "the two layouts no longer does. The policy says when somebody is " +
        "asked: check the sentence against where the gate now is.",
    );
    // Signing in is not where it happens: neither sign-in route asks.
    for (const route of ["src/app/api/auth/session/route.ts", "src/app/(auth)/AuthEntry.tsx"]) {
      assert.ok(!/re-consent/.test(read(route)), `${route} now sends somebody to accept a new version at sign-in`);
    }
  });

  test("the accept page's \"What changed\" names what this version changes", () => {
    // The paragraph is what somebody reads before they press Accept, in the
    // words the owner approved with v7. v7 is about a programme while it runs
    // and when it ends, and the paragraph names each thing in it, in order.
    // Every phrase is held on both sides: the paragraph says it, and v7 says
    // the sentence it summarises, so the paragraph cannot describe a page the
    // policy is not.
    const accept = read("src/app/re-consent/page.tsx").replace(/\s+/g, " ");
    const from = accept.indexOf("What changed:");
    assert.ok(from !== -1, "the accept page no longer has its \"What changed\" paragraph");
    const paragraph = accept.slice(from, accept.indexOf("</p>", from));
    assert.match(
      paragraph,
      /the section on courses and programmes now covers a programme while it runs and when it ends\./,
    );
    for (const [what, said, policy] of [
      // The lead's clause names the notes its groups' facilitators share
      // beside the registers, as v7 does; the clause it replaces ended at the
      // registers.
      [
        "what a programme's lead sees",
        /It says what a programme&apos;s lead sees, including every register of its groups and the notes its groups&apos; facilitators share;/,
        /Once the programme is running, the lead places its people in groups, reads every register of its groups, the notes its groups&apos; facilitators share,/,
      ],
      [
        "that the people in a group see the notes somebody shares with it",
        /; that the people in your group see the notes you share with it;/,
        /on a programme that places you in a group, the people in your group see the notes you share with it\./,
      ],
      [
        "that a group sees a pitch with its sender's name",
        /that on an incubator your group sees a pitch you send, with your name,/,
        /Sending a pitch is choosing to share it: everybody in your group sees it, with your name/,
      ],
      ["how teams are made", /and how teams are made;/, /The site can make a team from a pitch/],
      [
        "what leaving does and who reads the reason",
        /what leaving a programme does and who reads your reason;/,
        /If you give a reason, only admins and, where the programme has one, its lead read it\./,
      ],
      [
        "a place that comes back",
        /that a place somebody gives back can be offered to somebody else until the end of the first week;/,
        /until the end of the programme&apos;s first week its lead or an admin can offer that place/,
      ],
      [
        "who finished",
        /how we record who finished;/,
        /we mark as finished everybody who came to at least the number of sessions its lead has set/,
      ],
      // No longer the list's last clause, so it sits between two semicolons;
      // the pattern it replaces ended it with "and that" and a full stop.
      [
        "certificates",
        /; that certificates are sent to the people who finished and to facilitators, private until you turn the link on;/,
        /It starts private: until you turn its link on, only you can open it\./,
      ],
      // No longer the list's last clause either, so it too sits between two
      // semicolons; the pattern it replaces began "and that" and ended the list.
      [
        "the calendar link",
        /; that you can add your sessions to your calendar with a private link, which your calendar&apos;s provider fetches and you can replace;/,
        /gives you a private link to your sessions.*your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us.*You can replace it at any time from the same place, and the old link then shows nothing\./,
      ],
      // Privacy pass 2: what a week's pages keep and who reads it, packs,
      // cases and pairs, and sealed predictions, each in a few words, before
      // the list's last clause. Each is held to the passage it summarises.
      [
        "who reads what somebody writes and ticks on a week's pages",
        /; who reads what you write and tick on a week&apos;s pages,/,
        /<strong>Reflections\.<\/strong> At stops in a week&apos;s readings you answer set questions in boxes that save as you type\. You, your group&apos;s facilitators, the programme&apos;s lead and admins can read your answers.*<strong>Ticks\.<\/strong> Each source in a week&apos;s readings has a tick for you\. Your group&apos;s facilitators, the programme&apos;s lead and admins can see which sources you have ticked, with your name/,
      ],
      [
        "who sees a person's pack, case and pair",
        /and who sees your pack, your case and your pair for a session;/,
        /Your group&apos;s facilitators, the programme&apos;s lead and admins see what everyone in the group was given; nobody else in your group sees yours\..*Your group&apos;s facilitators, the programme&apos;s lead and admins see every pair in the group; nobody else in your group sees your pair\./,
      ],
      [
        "who reads a sealed predictions card",
        /; that your sealed predictions are read by you and admins alone;/,
        /Your card is read by you and by admins, who can open anybody&apos;s at any time, and by nobody else:/,
      ],
      // CHANGED ON PURPOSE (finding L2): the clause names what the lead sees,
      // as v7 now says; it said only that admins see who said what.
      [
        "that a survey is confidential, what the lead sees, and when the name comes off",
        /; and that our surveys are confidential: only admins see who said what, a programme&apos;s lead sees totals and comments and never your name, and your name comes off two years after the programme\./,
        /Every survey is confidential: we keep your answers with your name, and each survey says so at the top\. Only NAISI&apos;s admins can see who said what\..*The programme&apos;s lead sees the totals and comments of its surveys .*The lead never sees your name.*We take your name off your answers to a survey on the day it tells you, two years after the programme&apos;s last session/,
      ],
      [
        "facilitators see names only",
        /It also says that facilitators see names only, never email addresses,/,
        /They never see your email address:/,
      ],
      // Sharing with Kairos by default, the ratings it carries, and the way to
      // say no (part (b) of the impact questionnaire's build).
      [
        "sharing with Kairos unless you say no",
        /And it says that, unless you say no, we share your name and your record on a programme with Kairos, one of our funders, including the ratings you were given at its end, which nobody is shown about themselves; you can say no at the end of any programme survey or on your profile, at any time\./,
        /Unless you say no, when a programme ends we send Kairos a file with, for each person on it at the end: their name, the programme, how many sessions they came to, whether they finished, and the ratings they were given at the end.*Every programme survey ends with a box to say no, and the same choice is on <a href="\/profile">your profile<\/a>\. You can change it at any time/,
      ],
      // The policy says five now, with the attendance among them; the pattern
      // this replaces said four.
      [
        "a programme's attendance is a logged download",
        /and that downloads of a programme&apos;s attendance are recorded\./,
        /Five of those downloads are recorded, with who asked for it, what it covered, how many people were in it and when: the membership list, the answers to a circulated worksheet, a programme&apos;s attendance,/,
      ],
      // Privacy pass 2: check-in and the survey after an event, and the quote
      // box with public numbers, which the paragraph had not named.
      [
        "who came to an event, and the survey after it",
        /It adds that we may record that you came to an event and send you a survey after it,/,
        /If you come to an event, we may record that you came, how and when.*After an event, NAISI&apos;s admins may send a survey to the people who came to it, or to everybody whose place on it was confirmed, and to nobody else\./,
      ],
      [
        "a comment ticked to be quoted on a programme's page",
        /and that a comment you tick to be quoted may be shown on a programme&apos;s page, without your name\./,
        /NAISI&apos;s admins may publish, on a programme&apos;s page on our site, numbers worked out from that programme&apos;s own surveys, with how many people answered them, and comments whose writers ticked that box, each shown with the term and no name\./,
      ],
    ]) {
      assert.match(paragraph, said, `the accept page no longer says v7 changed ${what}`);
      assert.match(CURRENT_FLAT, policy, `the accept page says v7 changed ${what}, and v7 does not say it`);
    }
    // The owner's wording, 25 October 2026: the list has one "and that",
    // before its last clause, rather than two in a row. The last clause is now
    // the survey's; it was the calendar link's.
    const list = paragraph.slice(paragraph.indexOf("It says what"), paragraph.indexOf("It also says"));
    assert.ok(list.length > 200, "could not find the accept page's list of what v7 says");
    assert.equal((list.match(/\band that\b/g) ?? []).length, 1, "the accept page's list of what v7 says has more than one \"and that\", or none");
    assert.match(list, /; and that our surveys are confidential: only admins see who said what, a programme&apos;s lead sees totals and comments and never your name, and your name comes off two years after the programme\. $/);
    // A register's notes are not among what a lead reads (§2g), so the
    // paragraph does not say they are. The notes it does name for the lead
    // are the ones its groups' facilitators share.
    assert.ok(
      !/notes facilitators write/i.test(paragraph),
      "the accept page says a programme's lead sees the notes facilitators " +
        "write. v7 does not: a register's notes are its group's facilitators' " +
        "and admins'.",
    );
    // Nothing here about the newsletter: v7 says of it what v6 said.
    assert.ok(
      !/newsletter/i.test(paragraph),
      "the accept page says v7 changed something about the newsletter. Its " +
        "sentence is version 6's, word for word.",
    );
  });

  test("is not left behind on the dashboard layout alone", () => {
    // The old placement asked only members who opened /dashboard, which is
    // less than the policy page promises.
    const dashboardLayout = join(REPO_ROOT, "src/app/(app)/dashboard/layout.tsx");
    if (existsSync(dashboardLayout)) {
      assert.match(
        AUTHED_LAYOUT,
        /policyVersion !== CURRENT_POLICY_VERSION/,
        "if a dashboard-level gate is reintroduced, the shared layout must " +
          "still hold one of its own",
      );
    }
  });

  test("keeps the deployed-builds-only condition", () => {
    assert.match(AUTHED_LAYOUT, /process\.env\.NODE_ENV === "production"/);
  });

  test("never fires inside a view-as session", () => {
    // Accepting is recorded on the member's own doc, and view-as records it
    // as the member: an admin could otherwise stamp a consent the member
    // never gave.
    assert.match(AUTHED_LAYOUT, /!viewingAs/);
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
    assert.match(CURRENT_FLAT, /every time one of them does we record who read it/i);
    const notice = read("src/features/admissions/ApplicationPrivacyNotice.tsx");
    assert.match(notice.replace(/\s+/g, " "), /We record each time one of them/i);
  });
});

describe("a team's page", () => {
  test("each team has a page, which its people read and write and the programme's lead and admins read", () => {
    assert.match(
      PAGE_FLAT,
      /team has a page of its own: its project, a weekly check-in, the team&apos;s links and its hand-in\. What anybody in the team writes there is seen by everybody in the team, the programme&apos;s lead and admins, and the page says so beside what you write\./,
    );
    assert.ok(!/will have a page of its own/.test(PAGE_FLAT), "v7 says a team's page will exist, and it is built");
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
    assert.match(PAGE_FLAT, /Anybody in the team can change what is there\./);
    const write = withoutComments(read("src/lib/courses/teamPage/write.ts"));
    // Every write records its writer, and none compares the writer with whoever wrote before.
    assert.equal((write.match(/byUid: person\.user\.uid,/g) ?? []).length, 3);
    assert.ok(!/\.byUid\s*(?:===|!==)/.test(write), "a team's page now lets only an entry's writer change it");
  });

  test("the hand-in says who handed it in; only the lead and admins see who last saved each check-in", () => {
    assert.match(
      PAGE_FLAT,
      /The hand-in says who handed it in, and the lead and admins also see who last saved each week&apos;s check-in\./,
    );
    const load = withoutComments(read("src/lib/courses/teamPage/load.ts"));
    // The hand-in's line names who handed it in, for the team as for the staff.
    assert.match(load, /handedIn: entry \? handedInDayWords\(saverName\(roster, entry\.byUid\),/);
    // The check-ins with who saved each are built for the staff's view alone.
    assert.match(load, /const checkIns: CheckInView\[\] = member\s*\? \[\]\s*: checkInsOf\(entries\)/);
    assert.match(load, /savedLine: savedWords\(saverName\(roster, entry\.byUid\),/);
  });

  test("what somebody wrote stays with the team when they leave, and loses their name with their account", () => {
    assert.match(
      PAGE_FLAT,
      /If you leave, what you wrote stays with your team; if your account is deleted, it stays and your name comes off it\./,
    );
    assert.match(PAGE_FLAT, /What you wrote on your team&apos;s page: it stays with your team, and your name comes off it\./);
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
 * What v7 says about the box under a long answer and about publishing a
 * programme's numbers and quotes on its page (sv-public), held to the code
 * that makes each sentence true: which surveys draw the box and where the
 * tick is kept, what is read to make the numbers and what is never read, that
 * only a ticked comment can be published and then with the term and no name,
 * that the record holds nobody, that only Take it down deletes it and nothing
 * else does, an account's deletion included. Added while v7 was on dev,
 * before any member had been asked to accept it, so it kept its number.
 * `tests/surveys-quote-tick.test.mjs`, `tests/surveys-public-numbers.test.mjs`
 * and `tests/public-numbers-last-term.test.mjs` drive the forms, the routes
 * and both pages as every kind of caller.
 */
const publicOffer = await loadTs("lib/surveys/publicNumbers.ts");
const publicRecord = await loadTs("lib/publicNumbers/model.ts");

describe("public numbers", () => {
  const BOX = /<li> Under each long answer, a programme&apos;s surveys and the survey after an event have a box that says &quot;You can quote this, without my name&quot;\. It starts unticked\. If you tick it, the tick is kept with that answer, and like the rest of your answers it cannot change once you send them\. The survey about leaving has no such box\. <\/li>/;
  const PUBLISH = /<li> NAISI&apos;s admins may publish, on a programme&apos;s page on our site, numbers worked out from that programme&apos;s own surveys, with how many people answered them, and comments whose writers ticked that box, each shown with the term and no name\. Nothing else of anybody&apos;s answers is published there, and nothing from the survey about leaving, a survey after an event or the anonymous form\. An admin can take it down at any time\. <\/li>/;
  const USE = /<li> Show on a programme&apos;s page how its last term went: numbers from its own surveys, and comments their writers ticked to be quoted, with no name\. <\/li>/;
  const BASIS = /Quoting a comment of yours on our site rests on your consent too, given by ticking the box under it, and if you email us we will take the quote down\./;
  const KEPT = /<strong>What we publish from a programme&apos;s surveys\.<\/strong>\{" "\} The numbers and quotes on a programme&apos;s page stay there until an admin takes them down, or publishes that programme&apos;s again, which replaces them\./;
  const LEFT = /<li> A comment of yours quoted on a programme&apos;s page: it carries no name, and with your account gone nothing links it to you\. Email us and we will take it down\. <\/li>/;

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
    assert.match(PAGE_FLAT, BOX);
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
    assert.match(PAGE_FLAT, PUBLISH);
    assert.match(PAGE_FLAT, USE);
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
      "what is published now keeps something the policy does not say",
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
    assert.match(PAGE_FLAT, BASIS);
    assert.match(withoutComments(read("src/lib/surveys/publicNumbers.ts")), /if \(!given \|\| given\.type !== "text" \|\| given\.quote !== true\) continue;/);
  });

  test("how long it stays: until an admin takes it down or publishes again; nothing else deletes it, an account's deletion included", () => {
    assert.match(CURRENT.replace(/\s+/g, " "), KEPT);
    assert.match(PAGE_FLAT, LEFT);
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
      "The policy says the numbers and quotes stay until an admin takes them down or publishes again, and that a deletion leaves them: a new reader, writer or deleter changes that sentence first.",
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

describe("v8 names Claude and Pangram, and says what they are sent", () => {
  const SENTENCES = [
    "An admin can ask Claude, an AI model made by Anthropic, to read your application together with the reviewers&apos; scores and comments and write a short assessment of it.",
    // PANGRAM_MIN_WORDS in src/lib/ai/pangram.ts.
    "those of 50 words or more, and nothing shorter.",
    // src/lib/applications/assessment/input.ts takes these out.
    "What is sent leaves out your name, your email addresses, your access-requirements answer and your answer about Students&apos; Union membership, and names each reviewer only by a letter.",
    // canRunTerm in src/lib/applications/assessment/run.ts.
    "Only admins see what comes back.",
    // The account deletion and the form destroy take it in the application's batch.
    "What comes back is kept with your application, is deleted with it, and is never copied to your member record.",
    "<strong>Anthropic</strong> provides Claude",
    "<strong>Pangram Labs</strong> checks the longer answers on an application",
  ];

  for (const sentence of SENTENCES) {
    test(`v8 says: ${sentence.slice(0, 60)}`, () => {
      assert.ok(CURRENT_FLAT.includes(sentence), `v8 no longer says: ${sentence}`);
      assert.ok(!V7_FLAT.includes(sentence), `v7 already said it, so it is not v8's change: ${sentence}`);
    });
  }

  test("the 50 words in the policy are the code's threshold", () => {
    const pangram = read("src/lib/ai/pangram.ts");
    assert.match(pangram, /export const PANGRAM_MIN_WORDS = 50;/);
  });
});
