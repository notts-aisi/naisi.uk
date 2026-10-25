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
 * programme's attendance is a third logged download; and the notes a group's
 * facilitators share, the notes a group shares on its week pages and the
 * calendar link are described, with who reads each and what a deletion does
 * to it. §2g holds those passages against the code. Three of them are worded
 * as what will happen,
 * because they are not built yet (certificates, facilitators seeing who has
 * said they are coming, a team's page), and §2g holds that nothing has been
 * built that they would then have to describe.
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
const CURRENT = read("src/content/legal/privacy/v7.tsx");
/**
 * The current policy with every run of whitespace collapsed to one space. The
 * copy is JSX, so a sentence is wrapped and indented across several lines and
 * no pattern written as a sentence would ever match the raw source. Every
 * content check below runs against this, because v7 is the text the site
 * serves at /privacy.
 */
const CURRENT_FLAT = CURRENT.replace(/\s+/g, " ");
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
  test("privacy v7 is current, and the combined version string moved with it", () => {
    assert.equal(currentPolicy("privacy").version, 7);
    assert.equal(CURRENT_POLICY_VERSION, "terms.1+privacy.7");
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
  ["exercise responses", /Answers to exercises/i],
  ["facilitator feedback", /feedback a facilitator writes on your work/i],
  // A rating on every programme; the comment shown to the run only on a
  // programme anyone can join, and the group's notes in its place on one that
  // places people in groups (`runSharesGroupNotes`, which §2g runs). The entry
  // this replaces, "star rating and leave a comment", pinned the comment box
  // on every run, which a run with groups no longer draws.
  ["feedback on the material", /You can give a piece of course material a star rating\. On a programme anyone can join you can also leave a comment on it, which is shown to the rest of your run; on a programme that places you in a group, you share notes with your group instead \(see Notes shared with your group\)\. Ratings and comments are stored against your account and your name\./i],
  ["no anonymous survey is claimed yet", /We do not\s+currently run anonymous surveys on this site/i],
  ["an anonymous form would say so and move the policy first", /the form will say that it is anonymous and how that is done/i],
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
  // A programme's attendance became the third logged download (its Download
  // CSV writes the log first and refuses without it); §2g walks the tree for
  // every caller of the log.
  ["only the three logged downloads are recorded", /Three of those downloads are recorded/],
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
  ["who finished", /we mark as finished everybody who came to at least the number of sessions its lead has set/i],
  ["the lead's changes to who finished are recorded", /The lead can then change anybody&apos;s, and we record who changed it and when\./i],
  ["only the lead and admins see the number and the list", /Only the lead and admins see that number, and the list with how many sessions each person came to and how many exercises they answered\./i],
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
  ["the calendar link", /&quot;Add to calendar&quot; on your programme page gives you a private link to your sessions/i],
  ["what the calendar shows", /It shows the day, time and room of each session of your group \(and of any group you facilitate\), with the programme&apos;s and the group&apos;s name, and marks a session that is cancelled\./i],
  ["the calendar's provider fetches it and keeps what it shows", /your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us every so often and keeps what it shows, under its own privacy policy/i],
  ["anybody holding the calendar link sees the same", /Anyone else holding the link can see the same, so keep it to yourself\./i],
  ["facilitators email their group without seeing an address", /They never see your email address: they can email their group through the site without seeing anybody&apos;s\./i],
  ["what the people in a group and a team see on an incubator", /On an incubator, the people in your group also see any pitch you send, with your name, and the people in your team see that you are in it and anything you write on your team&apos;s page\./i],
  ["destroying a term's applications takes nobody off a programme", /Nobody is taken off a programme by it: a place on a course run, which notes the application form and programme it came from, stays with the rest of that person&apos;s course record\./i],
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

  test("certificates are described as the owner decided: sent, and private until their owner turns the link on", () => {
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
    // NOT BUILT YET, so the paragraph says what will happen ("we will send"),
    // the way v6 worded certificates. Every clause below is load-bearing:
    // certificates are built to these words, or a new version says otherwise
    // first.
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

    // The cascade check stays, with the rule it now waits for. No sweep
    // exists, because no certificate does: the day one appears, it deletes a
    // certificate whose link is off and keeps one whose link is on, and this
    // check is replaced by one that runs it.
    const cascade = read("src/lib/firestore/accountDeletion.ts");
    assert.ok(
      !/collection\(\s*["'`][A-Za-z]*[cC]ertificate[A-Za-z]*["'`]\s*\)/.test(cascade),
      "account deletion now sweeps certificates. v7 says a certificate whose " +
        "link is off is deleted with the account and one whose link is on is " +
        "kept until somebody asks us to withdraw it: pin that rule here, by " +
        "running the sweep, in place of this check.",
    );
    // And nothing anywhere makes a certificate yet, which is what keeps the
    // future tense honest. A collection of them appearing is the moment the
    // paragraph stops being a promise and becomes a description.
    assertExactlyTheseFiles(
      sourceFilesNaming(/collection\(\s*["'`][A-Za-z]*[cC]ertificate[A-Za-z]*["'`]\s*\)|\b[A-Z_]*CERTIFICATES?_COLLECTION\b/),
      new Map(),
      "keeping certificates",
      "Certificates are being built. Build them to v7's words (sent by the " +
        "programme's lead or an admin to who finished and to facilitators, " +
        "private until the owner turns the link on, the page showing no " +
        "email address, photo or other name, and a link that is off deleted " +
        "with the account), and replace this check with pairings that hold " +
        "each of those sentences to the code.",
    );
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
      // Three since a programme's attendance joined the log: §2g walks the tree
      // for every caller of `logExport` and holds the list to exactly three.
      ["the export log names the kinds that exist", /Three\s+kinds are logged today, a membership list, the\s+responses to a circulated worksheet and a programme&apos;s\s+attendance/i],
      ["Google's sign-in script and where it is loaded from", /sign-in script is loaded from/i],
    ]) {
      assert.match(CURRENT_FLAT, pattern, `v7 no longer says: ${name}`);
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
      "v7 no longer says a category carries an email choice AND a notification " +
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
      "v7 no longer says that the people who read an application are shown " +
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
 * Three passages say what will happen, because the thing is not built yet:
 * certificates, facilitators seeing who has said they are coming, and a
 * team's page. They are built to these words. Certificates carry a check of
 * their own in §2, which fails the day the site starts keeping them.
 *
 * Three more were added to v7 while it was on dev, before any member had been
 * asked to accept it, so it kept its number: the notes a group's facilitators
 * share, the notes a group shares on its week pages, and the calendar link.
 * Each describes code that is built, and is held to it below.
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
      /we mark as finished everybody who came to at least/i,
      /reads every register of its groups/i,
      /by name only/i,
      /Three\s+kinds are logged today/i,
      /Nobody is taken off a programme by it/i,
      /Notes facilitators share\./i,
      /the notes the group&apos;s facilitators share with each other/i,
      /the notes its groups&apos; facilitators share/i,
      /Notes shared with your group\./i,
      /the people in your group see the notes you share with it/i,
      /On a programme anyone can join you can also leave a comment on it/i,
      /Your calendar link\./i,
      /the old link then shows nothing/i,
      /your calendar link, the notes you shared with a group, notes you wrote for the other facilitators of a group/i,
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
    assert.ok(lead.includes(`reads every register of its groups,${SHARED_BY_FACILITATORS}${SHARED_ON_WEEK_PAGES} sees the pitches`), "v7 no longer says the lead reads the notes its groups' facilitators share and the notes each group shares, right after the registers");
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

  test("three downloads are logged, each before its file is handed over, and the attendance file holds what the page says", () => {
    assertExactlyTheseFiles(
      sourceFilesNaming(/\blogExport\(/).filter((file) => file !== "src/lib/firestore/dataExports.ts"),
      new Map([
        ["src/app/api/admin/membership/export/route.ts", "the membership list for a period, the first of the three the policy names"],
        ["src/app/api/worksheets/circulations/[circulationId]/export/route.ts", "the answers to a circulated worksheet, the second of the three"],
        ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts", "a programme's attendance, for its lead and admins, the third of the three"],
      ]),
      "writing the record of a download",
      "The policy says three downloads are recorded and names them. A " +
        "download recorded and not named, or named and no longer recorded, " +
        "makes the sentence wrong: say so in a new version.",
    );
    // "All three refuse to hand over the file if that record cannot be
    // written": the record first, and a failure to write it is a refusal.
    for (const route of [
      "src/app/api/admin/membership/export/route.ts",
      "src/app/api/worksheets/circulations/[circulationId]/export/route.ts",
      "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts",
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
    assert.match(read("src/features/courses/WeekView.tsx"), /cohortNotes=\{sharedNotes === null\}/);
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

  test("a deletion removes the calendar link, the notes shared with a group and the notes written for a group's other facilitators", () => {
    assert.match(
      PAGE_FLAT,
      /your progress and your answers to exercises, your calendar link, the notes you shared with a group, notes you wrote for the other facilitators of a group, a pitch you sent alone,/,
    );
    const cascade = withoutComments(read("src/lib/firestore/accountDeletion.ts"));
    for (const step of [
      "summary.calendarLinkDeleted = await deleteCalendarLink(db, uid);",
      "summary.courseGroupSharedNotesDeleted = await deleteCourseGroupSharedNotes(db, uid);",
      "summary.courseGroupNotesDeleted = await deleteCourseGroupNotes(db, uid);",
    ]) {
      assert.ok(cascade.includes(step), `the account deletion no longer runs \`${step}\`, which the policy lists among what a deletion removes`);
    }
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
      [
        "the calendar link",
        /; and that you can add your sessions to your calendar with a private link, which your calendar&apos;s provider fetches and you can replace\./,
        /gives you a private link to your sessions.*your calendar&apos;s provider \(Apple, Google or Microsoft, for example\) fetches it from us.*You can replace it at any time from the same place, and the old link then shows nothing\./,
      ],
      [
        "facilitators see names only",
        /It also says that facilitators see names only, never email addresses,/,
        /They never see your email address:/,
      ],
      [
        "a programme's attendance is a logged download",
        /and that downloads of a programme&apos;s attendance are recorded\./,
        /Three of those downloads are recorded/,
      ],
    ]) {
      assert.match(paragraph, said, `the accept page no longer says v7 changed ${what}`);
      assert.match(CURRENT_FLAT, policy, `the accept page says v7 changed ${what}, and v7 does not say it`);
    }
    // The owner's wording, 25 October 2026: the list has one "and that",
    // before its last clause, rather than two in a row.
    const list = paragraph.slice(paragraph.indexOf("It says what"), paragraph.indexOf("It also says"));
    assert.ok(list.length > 200, "could not find the accept page's list of what v7 says");
    assert.equal((list.match(/\band that\b/g) ?? []).length, 1, "the accept page's list of what v7 says has more than one \"and that\", or none");
    assert.match(list, /; and that you can add your sessions to your calendar with a private link, which your calendar&apos;s provider fetches and you can replace\. $/);
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
