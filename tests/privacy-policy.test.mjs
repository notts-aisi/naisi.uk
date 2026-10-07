/**
 * The current privacy policy, the frozen versions behind it, and the
 * re-consent gate that publishing a new one fires.
 *
 * Run with `npm test`.
 *
 * The current version is v6: v5's text, rewritten where the application form
 * (docs/applications.md) made it untrue. The people who read an application
 * see whose it is, where v5 said reviewers scored with names hidden; who
 * reads one is named; scores, comments and decisions are kept beside the
 * application and never on it; and decision day, the replies and what stays
 * afterwards are described. It also says how somebody with no account joins
 * on the form and what the browser keeps while they do, and names every form
 * the spam check runs on. §2d holds the application form's passages against
 * the code, and §2e the three lists of places (where Google reCAPTCHA runs,
 * where Google's sign-in script loads, what is kept in local storage).
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

const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const CURRENT = read("src/content/legal/privacy/v6.tsx");
/**
 * The current policy with every run of whitespace collapsed to one space. The
 * copy is JSX, so a sentence is wrapped and indented across several lines and
 * no pattern written as a sentence would ever match the raw source. Every
 * content check below runs against this, because v6 is the text the site
 * serves at /privacy.
 */
const CURRENT_FLAT = CURRENT.replace(/\s+/g, " ");
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
  test("privacy v6 is current, and the combined version string moved with it", () => {
    assert.equal(currentPolicy("privacy").version, 6);
    assert.equal(CURRENT_POLICY_VERSION, "terms.1+privacy.6");
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
  ["reviewer notes are disclosable", /what a reviewer wrote about your application, we will tell you/i],
  ["attendance registers", /present, arrived late, left early, absent, or\s*\{?"?\s*excused/i],
  ["participant notes", /private note about a named\s+participant/i],
  ["exercise responses", /Answers to exercises/i],
  ["facilitator feedback", /feedback a facilitator writes on your work/i],
  ["feedback on the material", /star rating and leave a comment/i],
  ["no anonymous survey is claimed yet", /We do not\s+currently run anonymous surveys on this site/i],
  ["an anonymous form would say so and move the policy first", /the form will say that it is anonymous and how that is done/i],
  ["membership tier", /membership tier \(paid, comped, alumni, staff\)/i],
  ["membership provenance", /a list the\s+Students&apos; Union gives us/i],
  ["the conduct flag", /an admin can\s+flag an\s+account and must record a reason/i],
  // No screen that reads an application is sent a conduct flag: the one
  // reader of `memberConductFlags` is the admin route on the Members page.
  ["the conduct flag and its reason are admin-only", /The flag and the reason are visible to admins alone/i],
  ["certificates are minted by the participant", /able to mint a certificate for yourself/i],
  ["minting a certificate is opt-in", /Nothing is issued unless you choose to/i],
  ["what a certificate page shows", /names you, the programme and the date/i],
  // OWNER DECISION, 7 October 2026: names are shown, and the form does not
  // say so, which leaves this page as the one place an applicant is told.
  // The two entries these replace pinned the opposite promise ("Reviewers
  // score name-blind by default", and deciders "never blind"), which the
  // application form made untrue.
  ["the people who read an application see whose it is", /They see your name\. Nothing hides who you are from the people who read, score and decide your application/i],
  ["who reads an application", /Admins, and the lead and the reviewers of each programme you ranked/i],
  ["a programme joined by invitation reads the application only once it is accepted", /can read your application from then on, and not before/i],
  ["only the two logged downloads are recorded", /Two of those downloads are recorded/],
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
      "v6 must not promise a deletion period unless a job enforces that " +
        "period.",
    );
    assert.ok(
      !/Deleting your account deletes/.test(CURRENT_FLAT),
      "v6 must not say deleting the account deletes everything about you: " +
        "the cascade keeps memberRecords, worksheet answers, tasks and RSVPs.",
    );
  });

  test("certificates are described in the conditional, opt-in voice the owner chose", () => {
    // OWNER DECISION. Certificates will exist for participants and
    // completers of the fellowship and the incubator, and the PARTICIPANT
    // mints their own: nothing is issued unless they ask for it, so somebody
    // who does not want a page on our site naming them simply never mints
    // one. Applicants agree to the mechanism when they apply. Every clause
    // below is load-bearing, because the whole justification for a public
    // page that outlives an account deletion is that the person chose to
    // create it.
    assert.match(CURRENT_FLAT, /able to mint a certificate for yourself/i);
    assert.match(CURRENT_FLAT, /Nothing is issued unless you choose to/i);
    assert.match(CURRENT_FLAT, /anyone holding the link can open/i);
    assert.match(CURRENT_FLAT, /not listed anywhere/i);
    assert.match(CURRENT_FLAT, /By applying to a programme you\s+agree that we may offer this/i);
    // And the retention carve-out that follows from it.
    assert.match(CURRENT_FLAT, /A certificate you minted is a deliberate\s+exception/i);
    assert.match(CURRENT_FLAT, /Email us and we\s+will withdraw it, account or no account/i);

    // The cascade check stays, with the opposite message: no sweep exists
    // yet, so the carve-out above is currently a statement about a feature
    // nobody can trip over. The day one appears, the carve-out is the
    // paragraph that has to be revisited.
    const cascade = read("src/lib/firestore/accountDeletion.ts");
    assert.ok(
      !/collection\(\s*"certificates"\s*\)/.test(cascade),
      "account deletion now sweeps certificates, so the retention carve-out " +
        "that says a minted certificate survives an account deletion must be " +
        "revisited: say what the sweep removes and what it leaves.",
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
      "v6 still says deleting the account keeps the push record; the cascade " +
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
      "v6 must not claim every export is logged: the policy speaks only of " +
        "the exports the site itself generates.",
    );
  });

  test("the OWNER TO CONFIRM block is gone from the current policy", () => {
    // The wording of a privacy policy is the owner's. The current policy
    // carries no block of open questions for the owner. v3 keeps its own
    // list, which §1b checks, because v3 is frozen.
    assert.ok(
      !/OWNER TO CONFIRM/.test(CURRENT),
      "v6 carries an OWNER TO CONFIRM block again: resolve it with the owner " +
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
      ["what other participants see", /any comment or star rating you choose to leave/i],
      ["the push record carries the account", /carries\s+your account so we know where to send/i],
      ["re-consent is the notice, not an email", /asked to accept\s+or decline it/i],
      ["the statutory response time", /respond within 30 days/i],
      ["no solely automated decisions", /No decision about you\s+is made solely by automated means/i],
      ["children", /do not\s+knowingly collect data from anyone under 16/i],
      ["RSVP dietary and accessibility answers are given by explicit consent", /dietary and accessibility\s+answers you give on an event signup form/i],
      ["the Google profile photo is fetched from Google by the visitor", /visitor&apos;s browser fetches it from Google&apos;s servers/i],
      ["a video thumbnail in an email is fetched from YouTube", /fetches\s+that thumbnail from YouTube/i],
      ["the export log names the kinds that exist", /Two\s+kinds are logged today/i],
      ["Google's sign-in script and where it is loaded from", /sign-in script is loaded from/i],
    ]) {
      assert.match(CURRENT_FLAT, pattern, `v6 no longer says: ${name}`);
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
      "v6 claims a per-page open count again; the code keeps one running total.",
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
      "v6 no longer says a category carries an email choice AND a notification " +
        "choice. The grid stores two parallel maps, and the page is where a " +
        "member is told that.",
    );
    assert.match(
      CURRENT_FLAT,
      /the newsletter, event announcements, course announcements, and tasks and worksheets/i,
      "v6 no longer names the four rows the grid draws.",
    );
  });

  test("says the notification choice is separate from the email choice", () => {
    assert.match(
      CURRENT_FLAT,
      /Each category has its own notification choice, set separately from its email choice/i,
      "v6 still describes push as one blanket choice, or as following the " +
        "email one. Every row has its own push cell, resolved by " +
        "src/lib/push/preferences.ts independently of the email cell.",
    );
    assert.match(
      CURRENT_FLAT,
      /a notification can still arrive for a category whose email you have switched off/i,
      "v6 no longer states the consequence a member actually meets: the task " +
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
      "v6 no longer tells a member the notice lane has no unsubscribe link, " +
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
const keptVersions = await loadTs("lib/applications/versions/kept.ts");
const releaseReasons = await loadTs("lib/applications/status/reasons.ts");
const notificationPrefs = await loadTs("lib/firestore/notifications.ts");

describe("the application form passage", () => {
  const formWriter = read("src/lib/applications/editor/write.ts");

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
      "v6 no longer tells an applicant that the people reading their application " +
        "know whose it is. The form does not say it, so this page has to.",
    );
    for (const stale of [/name-blind/i, /without your name/i, /the application form will say so/i]) {
      assert.ok(
        !stale.test(CURRENT_FLAT),
        `v6 matches ${stale}: it promises a review with names hidden, or a form that ` +
          "says when they are shown. An application form does neither.",
      );
    }
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
      "v6 no longer says that the people who read an application are shown " +
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

  test("the access-requirements box is where the page says, apart from the application, and only an admin opens it", () => {
    // OWNER DECISION, 7 October 2026: the box is on the form, on its last
    // step. `createForm` writes an empty `accessRequirementsPrompt`, and that
    // is NOT what says whether the form has the box: the box asks a fixed
    // question of its own and reads no prompt. What makes the sentence true
    // is the step that draws the box.
    assert.match(PAGE_FLAT, /On the application form for the fellowships and the incubator it is on the last step/i);
    assert.ok(
      !/does not have a box for these/i.test(PAGE_FLAT),
      "v6 says the application form has no access-requirements box. It has one.",
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
      "v6 names a person making the final decision. An application form has " +
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
      "v6 still says SU-recognised committee members can read the short record.",
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
      "v6 still says a decision's log line names the applicant.",
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

  test("the SU membership answer reaches nobody who reads an application", () => {
    assert.match(PAGE_FLAT, /It is not shown to the people who read your application, and it does not affect whether you are offered a place/i);
    // Every file that names the answer, and why it may. None is a screen, a
    // payload or a record a reader of applications is given. A file that
    // starts naming it fails here until somebody has decided what the page
    // should then say.
    assertExactlyTheseFiles(
      sourceFilesNaming(/\bsuMembership\b/),
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
      ]),
      "naming the SU membership answer",
      "The policy says the answer is not shown to the people who read an " +
        "application. If this file shows it to one of them, the sentence is " +
        "wrong and a new version has to say who sees it.",
    );
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

  test("somebody with no account joins on the form, and what is kept in the browser is what the page says", () => {
    assert.match(PAGE_FLAT, /You can start the form without an account/i);
    assert.match(
      PAGE_FLAT,
      // The JSX keeps the space before the key with `{" "}`, so allow for it.
      /kept in that browser tab, in its session storage under a key beginning(?:\{" "\})? <code>naisi\.apply\.join<\/code>/i,
    );
    // The tab's session storage, and not the browser's local storage, which
    // outlives the tab and which the page lists separately.
    const keeper = read("src/features/applications/apply/keptAnswers.ts");
    assert.match(keeper, /return typeof window === "undefined" \? null : window\.sessionStorage;/);
    assert.ok(
      !/\blocalStorage\b/.test(keeper),
      "what is typed before there is an account is now kept in local storage, " +
        "which outlives the tab. The policy says it is kept in the tab and goes " +
        "when the tab closes.",
    );
    assert.equal(joinRules.keptKey("autumn-2026"), "naisi.apply.join:autumn-2026");

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

    // "It is ignored once it is a day old."
    assert.match(PAGE_FLAT, /it is ignored once it is a day old, and it goes when you close the tab/i);
    assert.ok(joinRules.readKept(packed, now + 23 * 3_600_000), "kept answers are no longer read back within the day");
    assert.equal(joinRules.readKept(packed, now + 24 * 3_600_000 + 1), null);

    // "Removed when your request to join is sent."
    assert.match(PAGE_FLAT, /The copy in the tab is removed when your request to join is sent/i);
    assert.match(
      read("src/features/applications/apply/JoinStep.tsx"),
      /await completeRegistration\(joinRequestFrom\(answers\)\);[\s\S]{0,400}?forgetAnswers\(roundId\);/,
      "the join step no longer throws away what the tab kept once the join " +
        "request has gone.",
    );

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

  test("the browser's local storage holds the four things the page lists, and nothing else", () => {
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
    assertExactlyTheseFiles(
      sourceFilesNaming(/\blocalStorage\b/),
      new Map([
        ...[...users].map(([file, key]) => [file, `keeps ${key}, which the page lists by name`]),
        ["src/features/pwa/LastRouteTracker.tsx", "a comment about the last-route key, which lastRoute.ts keeps"],
        ["src/features/admissions/ApplyFlow.tsx", "a comment saying the older form deliberately keeps no copy there"],
        ["src/features/courses/PacingBanner.tsx", "a comment saying a dismissal is deliberately not kept there"],
      ]),
      "naming the browser's local storage",
      "The policy lists exactly what the site keeps there, by name, and says " +
        "there are four. Something kept there that the page does not list " +
        "makes the page wrong: list it in a new version, or keep it somewhere " +
        "that does not outlive the tab and say so.",
    );
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
