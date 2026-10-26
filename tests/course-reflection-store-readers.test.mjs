/**
 * Every reader of the week's answers store in `src` says what it does with a
 * reflection.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * `courseExerciseResponses` holds two kinds of row (`src/lib/firestore/
 * courseExercises.ts`, "Two kinds of row"): an answer to an exercise or a
 * written answer, and since the coursework of v20 a REFLECTION, one box on a
 * week written as blocks, marked `kind: "reflection"`. A reflection is never
 * reviewed, never sent and never counted as an answer, and only its writer
 * reads it back on a page (the programme's lead and admins through the one
 * reader route). The class of failure is a reader that takes every row for
 * an answer: a review queue that hands a facilitator somebody's reflection
 * to give a verdict on, a finishing tally that counts reflections as answers
 * sent, a "to review" card that counts them.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` whose code hands the collection's name to
 * a database call or a deletion sweep is listed below with what it does with
 * a reflection, and each claim is checked where it can be:
 *
 *  - `tells`: it tells the two kinds apart. Its code asks
 *    `isReflectionResponse(` or reads a normalised row's `kind`.
 *  - `every-row`: it reads every row of either kind on purpose (deleting an
 *    account's or a run's, or refusing to renumber a run that has any), and
 *    says why in its entry.
 *  - `by-id`: it reads only rows that name an exercise by its id, which a
 *    reflection never does (its id is a prompt's), and says so.
 *
 * A new reader fails this file until somebody decides, and an entry whose
 * file no longer reads the collection fails it too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const inSrc = (file) => posix(relative(SRC, file));

/** A file's code with its comments gone and its strings kept, so the name can be found. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/**
 * A file ADDRESSES the collection when its code hands the name to a database
 * call (`.collection("courseExerciseResponses")`), to a deletion sweep's
 * helper, or to the account deletion's list of collections. Saying the word
 * in a comment addresses nothing.
 */
const ADDRESSES =
  /\.collection\(\s*["'`]courseExerciseResponses["'`]\s*\)|\bbyRunId\(\s*["'`]courseExerciseResponses["'`]\s*\)|\[\s*["'`]courseExerciseResponses["'`]\s*,|\bdrainQuery\([^,]+,\s*["'`]courseExerciseResponses["'`]/;

/** How a `tells` file shows it tells the kinds apart. */
const TELLS = /\bisReflectionResponse\(|\.kind\s*===\s*["'`]reflection["'`]/;

const READERS = {
  "app/api/courses/exercise-responses/[responseId]/review/route.ts": {
    treats: "tells",
    why: "a verdict on one answer: a reflection's row reads as no row, refused as a missing one is",
  },
  "app/api/courses/groups/[groupId]/exercises/route.ts": {
    treats: "tells",
    why: "the facilitator's review queue: reflections are left out before a field is copied",
  },
  "app/api/courses/groups/[groupId]/weeks/[weekId]/route.ts": {
    treats: "by-id",
    why: "counts the rows naming an exercise this edit removes, by its id; a reflection names a prompt, never an exercise",
  },
  "app/api/courses/runs/[runId]/apply-template/route.ts": {
    treats: "every-row",
    why: "refuses to replace the weeks of a run that has any answers or reflections, which the new weeks would strand",
  },
  "app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts": {
    treats: "tells",
    why: "the answer's writer: it refuses to write over a reflection's row",
  },
  "app/api/courses/runs/[runId]/my-exercises/route.ts": {
    treats: "tells",
    why: "the person's own rows: each reflection travels marked as one, to the one person it is for",
  },
  "app/api/courses/runs/[runId]/normalise-weeks/route.ts": {
    treats: "every-row",
    why: "refuses to renumber a run's weeks once anybody has an answer or a reflection keyed on them",
  },
  "app/api/courses/runs/[runId]/overview/route.ts": {
    treats: "tells",
    why: "the caller's own rows: which reflection boxes they have written in, for This week's count",
  },
  "app/api/courses/runs/[runId]/reflections/route.ts": {
    treats: "tells",
    why: "the one reader of somebody else's reflections (the lead and admins): reflections only",
  },
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": {
    treats: "tells",
    why: "the reflection's writer: it refuses to write over an answer's row",
  },
  "lib/courses/facilitatorGroup.ts": {
    treats: "tells",
    why: "a facilitator's To review card counts answers sent; reflections are left out",
  },
  "lib/courses/finishing/whoFinished.ts": {
    treats: "tells",
    why: "who finished counts written answers sent; reflections are left out",
  },
  "lib/firestore/accountDeletion.ts": {
    treats: "every-row",
    why: "deleting an account deletes every answer and every reflection its owner wrote",
  },
  "lib/firestore/courseDeletion.ts": {
    treats: "every-row",
    why: "destroying a run counts and deletes every answer and every reflection on it",
  },
};

const KINDS = new Set(["tells", "every-row", "by-id"]);

function readersInTree() {
  const found = [];
  for (const file of walkSource(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    if (ADDRESSES.test(codeOf(file))) found.push(inSrc(file));
  }
  return found.sort();
}

test("the scan is reading: it finds readers this file knows by name", () => {
  const found = readersInTree();
  for (const known of ["app/api/courses/runs/[runId]/my-exercises/route.ts", "lib/firestore/courseDeletion.ts"]) {
    assert.ok(found.includes(known), `the scan missed ${known}, so it is not reading the tree`);
  }
});

test("every reader of the store is listed, and every entry is a file that still reads it", () => {
  assert.deepEqual(readersInTree(), Object.keys(READERS).sort());
});

test("every entry says what it does with a reflection, and why", () => {
  for (const [file, entry] of Object.entries(READERS)) {
    assert.ok(KINDS.has(entry.treats), `${file}: "${entry.treats}" is not one of ${[...KINDS].join(", ")}`);
    assert.ok(entry.why && entry.why.length > 20, `${file}: say why`);
  }
});

for (const [file, entry] of Object.entries(READERS)) {
  if (entry.treats !== "tells") continue;
  test(`${file} tells a reflection from an answer`, () => {
    assert.match(codeOf(join(SRC, file)), TELLS, `${file} reads the store and never asks what kind of row it has`);
  });
}

test("the store's own module says how to tell, and normalises the kind", () => {
  const code = readFileSync(join(SRC, "lib", "firestore", "courseExercises.ts"), "utf8");
  assert.match(code, /export function isReflectionResponse\(/);
  assert.match(code, /kind: isReflectionResponse\(data\) \? "reflection" : "exercise"/);
});
