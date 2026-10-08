/**
 * Nothing that serves an applicant can reach the reviews or the decisions.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * An applicant's own document changes only when they act, or when decision
 * day publishes. Everything the committee does in between lives somewhere an
 * applicant's request cannot touch: scores and comments in `admissionReviews`,
 * and each lead's decision, each pooled applicant's outcome and each exception
 * in `admissionDecisions`. The routes that read those go through
 * `src/lib/applications/staffRepo.ts`.
 *
 * "Nobody hears anything early" is therefore a property of the import graph,
 * and this file is what holds it there:
 *
 *  1. THE COLLECTION HAS ONE NAME IN ONE PLACE. The string `admissionDecisions`
 *     is written in the files listed below and nowhere else in `src`, each
 *     with the reason it is there. Checked in both directions.
 *  2. NO APPLICANT-FACING FILE REACHES THEM. Every route gated by the
 *     applicant's session (`requireApplicant(`), every page in the public
 *     tree, and the applicant-safe reads in `src/lib/applications/repo.ts` are
 *     walked through their value imports, and none may arrive at the staff
 *     module or at any file that names either collection.
 *
 * The roots are DERIVED, not listed: a new route that serves an applicant is
 * covered the day it calls the applicant's gate, without anybody remembering
 * this file exists. Type-only imports are not followed, because a type carries
 * no data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

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

// ---------------------------------------------------------------------------
// 1. One name, in listed places
// ---------------------------------------------------------------------------

/**
 * Every file in `src` whose CODE names the decisions collection, by its
 * string or by the constant that holds it, and why. A file that reads or
 * deletes decisions belongs here with its reason; anything else naming the
 * collection is a second way in.
 */
const NAMES_THE_DECISIONS = new Map([
  [
    "src/lib/applications/staffRepo.ts",
    "declares the collection's name, once, and holds the committee's reads: one decision " +
      "document by id, and every decision on a form",
  ],
  [
    "src/lib/admissions/destroy.ts",
    "the round destroy, which counts and deletes every decision document on the round it " +
      "removes: by the round each names, and at each application's id in that application's " +
      "batch. It reads none of them and returns only counts",
  ],
  [
    "src/lib/firestore/accountDeletion.ts",
    "the account cascade, which deletes the decision document at each of the deleted " +
      "account's application ids in the same batch as the application. It writes the name as " +
      "a literal, as it does every collection it sweeps, and returns only a count",
  ],
]);

const DECISIONS_NAME = /admissionDecisions|DECISIONS_COLLECTION/;

test("the decisions collection is named only where this file says it is", () => {
  const found = [];
  for (const file of sourceFiles()) {
    if (DECISIONS_NAME.test(codeOf(file))) found.push(rel(file));
  }
  const listed = [...NAMES_THE_DECISIONS.keys()].sort();
  assert.deepEqual(
    found.sort(),
    listed,
    "the files that name the decisions collection are not the ones listed in " +
      "NAMES_THE_DECISIONS. A new reader or writer is added there with its reason; an entry " +
      "for a file that no longer names the collection is removed.",
  );
  for (const [file, why] of NAMES_THE_DECISIONS) {
    assert.ok(why.length > 30, `${file} needs a written reason for naming the decisions collection.`);
  }
});

// ---------------------------------------------------------------------------
// 2. No applicant-facing file reaches them
// ---------------------------------------------------------------------------

const STAFF_MODULE = "src/lib/applications/staffRepo.ts";

/** A file whose code names either collection is one an applicant's request must not load. */
const NAMES_COMMITTEE_DATA = /["'`]admissionReviews["'`]|admissionDecisions|DECISIONS_COLLECTION/;

/** `import type …` and `export type …` statements carry no data. */
function valueSpecifiers(code) {
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (/^(?:import|export)\s+type\b/.test(match[1])) continue;
    out.push(match[2]);
  }
  for (const match of code.matchAll(/(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g)) out.push(match[1]);
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1]);
  return out;
}

function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every `src` file reachable from `root` by value imports, with the chain that got there. */
function reachableFrom(root) {
  const chains = new Map([[root, [root]]]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of valueSpecifiers(codeOf(file))) {
      const target = resolveLocal(specifier, file);
      if (!target || chains.has(target)) continue;
      chains.set(target, [...chains.get(file), target]);
      queue.push(target);
    }
  }
  return chains;
}

/** The files that serve an applicant. Derived from the tree, never listed. */
function applicantRoots() {
  const roots = [];
  for (const file of sourceFiles()) {
    const path = rel(file);
    if (path === "src/lib/applications/repo.ts") roots.push(file);
    else if (path.startsWith("src/app/(public)/")) roots.push(file);
    else if (path.startsWith("src/app/api/") && /requireApplicant\(/.test(codeOf(file))) roots.push(file);
  }
  return roots;
}

test("no file that serves an applicant can reach the reviews or the decisions", () => {
  const roots = applicantRoots();
  const applicantRoutes = roots.filter((file) => rel(file).startsWith("src/app/api/"));
  assert.ok(
    applicantRoutes.length >= 4,
    `only ${applicantRoutes.length} route(s) gated by requireApplicant( were found. The walk has ` +
      "stopped seeing them, so this guard is asserting about almost nothing.",
  );
  assert.ok(roots.some((file) => rel(file) === "src/lib/applications/repo.ts"));

  const breaches = [];
  for (const root of roots) {
    for (const [file, chain] of reachableFrom(root)) {
      const path = rel(file);
      const reason =
        path === STAFF_MODULE
          ? "the staff module"
          : NAMES_COMMITTEE_DATA.test(codeOf(file))
            ? "a file that names the reviews or the decisions collection"
            : null;
      if (reason) breaches.push(`${chain.map(rel).join("\n      -> ")}\n      (${reason})`);
    }
  }
  assert.deepEqual(
    breaches,
    [],
    "a file that serves an applicant can reach the committee's data. Scores, comments and " +
      "decisions must stay unreachable from an applicant's request until decision day " +
      "publishes them onto the applicant's own document. Move the read into a staff route, " +
      "or import the applicant-safe half (src/lib/applications/repo.ts) instead.",
  );
});

test("the walk follows value imports and leaves type imports alone", () => {
  const sample = [
    'import type { A } from "@/lib/types-only";',
    'import { b } from "@/lib/real";',
    'export { c } from "./also-real";',
    'export type { D } from "./types-again";',
    'import "side-effect";',
    'const lazy = await import("@/lib/lazy");',
  ].join("\n");
  assert.deepEqual(valueSpecifiers(sample), ["@/lib/real", "./also-real", "side-effect", "@/lib/lazy"]);
});

test("the staff module exists and is server-only", () => {
  const source = readFileSync(join(REPO_ROOT, STAFF_MODULE), "utf8");
  assert.match(source, /^import "server-only";/m, `${STAFF_MODULE} must stay server-only.`);
});
