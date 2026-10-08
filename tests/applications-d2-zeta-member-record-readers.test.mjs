/**
 * THE RECORD THE COMMITTEE KEEPS ABOUT AN APPLICATION IS READ BY ADMINS ONLY.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * When a term settles, or a form is destroyed, each applicant gets an entry
 * at `memberRecords/{uid}/applications/{roundId}`: what they applied for,
 * what they were told, average scores, and each reviewer's name with their
 * overall comment. It outlives the form, the application and the account.
 *
 * Who may read an application is narrow: admins, and the lead and reviewers
 * of each programme the person ranked or joined. A reviewer is told so on the
 * screen they write on. The entry copies their comment about a named person
 * out of that screen, so it must not be readable more widely than the
 * comment was. It is read by ADMINS, and by nobody else.
 *
 * That is two layers, and this file holds them to each other:
 *
 *  1. THE RULE. `firestore.rules` lets an admin read the two paths, and no
 *     other client. The entries are read from a browser, so the rule is the
 *     limit, whatever the page does.
 *  2. THE TREE. Every file in `src` that names the collection is listed with
 *     what it does. Exactly one of them SHOWS an entry to anybody, and every
 *     page that can reach it is inside the admin-only part of the admin
 *     area. Checked both ways, so a second reader, or a page outside that
 *     part, cannot arrive without this file being read.
 *
 * The rule's behaviour for every kind of account is run against the emulator
 * in `scripts/rules-tests/tests/member-records.test.mjs`. This file reads the
 * rule's text, so that the page gate and the rule cannot be moved apart in a
 * change that touches only one of them.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const abs = (path) => join(REPO_ROOT, ...path.split("/"));

function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Source with its comments gone, so a rule written in prose is not a use. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function valueSpecifiers(code) {
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (/^(?:import|export)\s+type\b/.test(match[1])) continue;
    out.push(match[2]);
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1]);
  return out;
}

function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableFrom(root) {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of valueSpecifiers(codeOf(file))) {
      const target = resolveLocal(specifier, file);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}

const ALL = sourceFiles();

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

/** One `match` block of the rules file, from its opening line to its closing brace. */
function ruleBlock(rules, opening) {
  const at = rules.indexOf(opening);
  assert.ok(at !== -1, `firestore.rules no longer has \`${opening}\``);
  let depth = 0;
  for (let i = rules.indexOf("{", at + opening.length - 1); i < rules.length; i += 1) {
    if (rules[i] === "{") depth += 1;
    else if (rules[i] === "}") {
      depth -= 1;
      if (depth === 0) return rules.slice(at, i + 1);
    }
  }
  throw new Error(`the block that opens \`${opening}\` never closes`);
}

/** A block's `allow` lines, with its comments gone. */
function allows(block) {
  return block
    .replace(/\/\/.*$/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("allow "));
}

describe("the rule", () => {
  const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");

  for (const opening of [
    "match /memberRecords/{uid} {",
    "match /memberRecords/{uid}/applications/{roundId} {",
  ]) {
    test(`${opening.slice(6, -2)}: an admin reads it, and no client writes it`, () => {
      assert.deepEqual(
        allows(ruleBlock(rules, opening)),
        ["allow read: if isAdmin();", "allow write: if false;"],
        "the record the committee keeps is read by admins and nobody else. It holds each " +
          "reviewer's comment about a named applicant, and those comments are shown on the " +
          "review screen only to admins and to that programme's lead and reviewers. A wider " +
          "read here is a wider read of them.",
      );
    });
  }

  test("an admin, in these rules, is the admin role and nothing wider", () => {
    assert.match(rules, /function isAdmin\(\)\s*\{ return hasRole\(\['admin'\]\); \}/);
  });
});

// ---------------------------------------------------------------------------
// 2. The tree
// ---------------------------------------------------------------------------

const NAMES_THE_RECORDS = /\bMEMBER_RECORDS_COLLECTION\b|["'`]memberRecords["'`]/;

/**
 * Every file in `src` whose code names the collection, and what it does.
 *
 *  - `writes`: it writes entries on the Admin SDK and hands none to anybody.
 *  - `counts`: it counts entries and reads none.
 *  - `shows`: it reads entries to put them in front of a person. There is one.
 */
const NAMES_THE_MEMBER_RECORDS = new Map([
  [
    "src/lib/firestore/memberRecords.ts",
    {
      role: "writes",
      why: "declares the collection, derives an entry from an application and its reviews, and writes it",
    },
  ],
  [
    "src/lib/admissions/memberRecordSync.ts",
    {
      role: "writes",
      why: "writes every applicant's entry when a term settles or a form is destroyed, and asks only whether one is already there",
    },
  ],
  [
    "src/lib/firestore/accountDeletion.ts",
    {
      role: "counts",
      why: "counts the entries an account deletion is leaving behind, for the summary the admin is shown",
    },
  ],
  [
    "src/features/admin/useMemberApplications.ts",
    {
      role: "shows",
      why: "the listener behind the application history on the admin Members page, which is where an admin reads a person's entries",
    },
  ],
]);

const SHOWN_BY = "src/features/admin/useMemberApplications.ts";
const ADMIN_ONLY_TREE = "src/app/(app)/admin/(admin-only)/";

describe("the tree", () => {
  test("every file that names the collection is listed, with what it does", () => {
    const found = ALL.filter((file) => NAMES_THE_RECORDS.test(codeOf(file))).map(rel).sort();
    assert.deepEqual(
      found,
      [...NAMES_THE_MEMBER_RECORDS.keys()].sort(),
      "the files that name the member records collection are not the ones listed in " +
        "NAMES_THE_MEMBER_RECORDS. A file that shows an entry to anybody is a second reader: " +
        "it has to be reached only from admin-only pages, as the one below is.",
    );
    for (const [file, entry] of NAMES_THE_MEMBER_RECORDS) {
      assert.ok(["writes", "counts", "shows"].includes(entry.role), `${file} has no role`);
      assert.ok(entry.why.length > 40, `${file} needs a written reason`);
    }
    assert.deepEqual(
      [...NAMES_THE_MEMBER_RECORDS].filter(([, entry]) => entry.role === "shows").map(([file]) => file),
      [SHOWN_BY],
      "there is one place an entry is shown",
    );
  });

  test("one file turns a stored entry into something to show", () => {
    // Whatever reads an entry for a person reads it through the one
    // normaliser. Its callers are therefore the readers.
    const callers = ALL.filter((file) => /\bnormalizeApplicationRecord\(/.test(codeOf(file)))
      .map(rel)
      .filter((file) => file !== "src/lib/firestore/memberRecords.ts");
    assert.deepEqual(callers, [SHOWN_BY]);
  });

  test("every page that can reach it is inside the admin-only part of the admin area", () => {
    const entries = ALL.filter((file) => /^src\/app\/.*\/(route|page|layout)\.tsx?$/.test(rel(file)));
    assert.ok(entries.length > 150, `only ${entries.length} routes and pages were found: the walk is broken`);
    const reaching = entries.filter((entry) => reachableFrom(entry).has(abs(SHOWN_BY))).map(rel);
    assert.ok(reaching.length > 0, "nothing draws the record any more, so this guard is about nothing");
    for (const entry of reaching) {
      assert.ok(
        entry.startsWith(ADMIN_ONLY_TREE),
        `${entry} can reach the member record's reader and is outside ${ADMIN_ONLY_TREE}. The ` +
          "record is an admin's to read: the rule refuses everybody else, so the panel would " +
          "be an error on this page for anybody who is not one.",
      );
    }
  });

  test("that part of the admin area lets in an admin and nobody else", () => {
    const layout = codeOf(abs(`${ADMIN_ONLY_TREE}layout.tsx`));
    assert.match(layout, /await requireAdminPage\(\);/);
    const gates = codeOf(abs("src/lib/firebase/pageGates.ts"));
    const at = gates.indexOf("export async function requireAdminPage()");
    assert.ok(at !== -1);
    assert.match(
      gates.slice(at, gates.indexOf("}", gates.indexOf("redirect(", at))),
      /if \(!user \|\| user\.role !== "admin"\) redirect\(/,
      "the admin-only gate has widened, and the member record's page gate with it",
    );
  });
});
