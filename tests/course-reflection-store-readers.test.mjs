/**
 * Every reader of the week's answers store in `src` says what it does with a
 * reflection.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * `courseExerciseResponses` holds three kinds of row (`src/lib/firestore/
 * courseExercises.ts`, "Three kinds of row"): an answer to an exercise or a
 * written answer, and since the coursework of v20 two kinds of BOX a person
 * fills in on a week written as blocks: a REFLECTION (`kind: "reflection"`)
 * and a FILL-IN BOX (`kind: "fillIn"`, week 6's action plan). A box is never
 * reviewed, never sent and never counted as an answer, and only its writer
 * reads it back on a page (anybody else through each kind's one reader
 * route). The class of failure is a reader that takes every row for an
 * answer: a review queue that hands a facilitator somebody's reflection or
 * plan to give a verdict on, a finishing tally that counts boxes as answers
 * sent, a "to review" card that counts them. A reader of answers leaves
 * every kind of box out with one question, `isOwnBoxResponse`, so a kind of
 * box added later is left out everywhere at once.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` whose code hands the collection's name to
 * a database call or a deletion sweep is listed below with what it does with
 * a reflection, and each claim is checked where it can be:
 *
 *  - `tells`: it tells the kinds apart. Its code asks for a kind by name
 *    (`isReflectionResponse(`, `isFillInResponse(`), for every box at once
 *    (`isOwnBoxResponse(`), or reads a normalised row's `kind`. A reader of
 *    ANSWERS (it reviews, queues, counts or writes them) says `answers:
 *    true`, and its code asks `isOwnBoxResponse(`.
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
const TELLS = /\bisReflectionResponse\(|\bisFillInResponse\(|\bisOwnBoxResponse\(|\.kind\s*===\s*["'`](?:reflection|fillIn)["'`]/;

const READERS = {
  "app/(app)/learn/[runId]/weeks/[n]/feedback/page.tsx": {
    treats: "tells",
    why: "the writer's own feedback page: their own written answer, read by its id; a reflection's row reads as no answer",
  },
  "app/api/courses/exercise-responses/[responseId]/review/route.ts": {
    treats: "tells",
    answers: true,
    why: "a verdict on one answer: a reflection's or a fill-in box's row reads as no row, refused as a missing one is",
  },
  "app/api/courses/groups/[groupId]/exercises/route.ts": {
    treats: "tells",
    answers: true,
    why: "the facilitator's review queue: reflections and fill-in boxes are left out before a field is copied",
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
    answers: true,
    why: "the answer's writer: it refuses to write over a reflection's or a fill-in box's row",
  },
  "app/api/courses/runs/[runId]/my-exercises/route.ts": {
    treats: "tells",
    why: "the person's own rows: each reflection and fill-in box travels marked as what it is, to the one person it is for",
  },
  "app/api/courses/runs/[runId]/normalise-weeks/route.ts": {
    treats: "every-row",
    why: "refuses to renumber a run's weeks once anybody has an answer or a reflection keyed on them",
  },
  "app/api/courses/runs/[runId]/overview/route.ts": {
    treats: "tells",
    why: "the caller's own rows: which boxes (reflection prompts and fill-in boxes) they have written in, for This week's count",
  },
  "app/api/courses/runs/[runId]/reflections/route.ts": {
    treats: "tells",
    why: "the one reader of somebody else's reflections (the lead and admins): reflections only",
  },
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": {
    treats: "tells",
    why: "the reflection's writer: it refuses to write over an answer's row",
  },
  "app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts": {
    treats: "tells",
    why: "the fill-in box's writer: it refuses to write over a row of any other kind",
  },
  "app/api/courses/runs/[runId]/fill-in-boxes/route.ts": {
    treats: "tells",
    why: "the one reader of somebody else's fill-in boxes (their group's facilitators, the lead and admins): fill-in boxes only",
  },
  "lib/courses/weekPaste.ts": {
    treats: "every-row",
    why:
      "the checks behind both week loaders (the run's week and a group's own copy) count every row of the week on the " +
      "items a paste would take out, reflections included, because a reflection is an answer somebody gave; the lead " +
      "or an admin, or a group's facilitator, is shown the count, never a row",
  },
  "app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts": {
    treats: "tells",
    why: "submitting a week stamps when each of its written answers was first sent: a reflection's or a fill-in box's row is never stamped",
  },
  "app/api/courses/runs/[runId]/weeks/[weekId]/reopen/route.ts": {
    treats: "tells",
    why: "reopening a week clears the lock an opened written answer kept: a reflection's row is never touched",
  },
  "lib/courses/weekWork/readers.ts": {
    treats: "tells",
    why: "how far each person has got with a week: which boxes hold something and which written answers are sent, by who and which item, never a word",
  },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts": {
    treats: "tells",
    why: "the written answer's writer: it refuses to write over a reflection's row, or any row not counted in words",
  },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts": {
    treats: "tells",
    why: "opening, reopening and feedback on one written answer: a reflection's row is refused as an answer not sent",
  },
  "lib/courses/facilitatorGroup.ts": {
    treats: "tells",
    answers: true,
    why: "a facilitator's To review card counts answers sent; reflections and fill-in boxes are left out",
  },
  "lib/courses/facilitatorWeek/readers.ts": {
    treats: "tells",
    why: "a group's week for its facilitators, the programme's lead and admins: reflections, of the people each viewer is shown, and fill-in boxes (week 6's action plan), of exactly the people the boxes' own gate admits; never an answer",
  },
  "lib/courses/coursework/gather.ts": {
    treats: "tells",
    why: "Claude and Pangram on coursework (privacy v13): reflections, written answers sent and fill-in boxes, each matched to the kind its question asks for, and only the rows that count, for an admin or the programme's lead behind their door; an exercise answer of a week before blocks is left out",
  },
  "lib/courses/finishing/whoFinished.ts": {
    treats: "tells",
    answers: true,
    why: "who finished counts written answers sent; reflections and fill-in boxes are left out",
  },
  "lib/courses/writtenAnswers/queue.ts": {
    treats: "tells",
    why: "the review queue's written answers half: reflections, and the summer's answers, are left out before anything is counted",
  },
  "lib/courses/writtenAnswers/reviewPage.ts": {
    treats: "tells",
    why: "the review page's answers, each read by its id: a reflection's row reads as no answer",
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

/**
 * A reader of ANSWERS leaves out every box its writer fills in, by the one
 * question that covers them all. Asking for reflections alone would hand a
 * facilitator somebody's plan to give a verdict on, or count it as sent.
 */
for (const [file, entry] of Object.entries(READERS)) {
  if (!entry.answers) continue;
  test(`${file} leaves every box its writer fills in out of the answers`, () => {
    assert.equal(entry.treats, "tells", `${file}: a reader of answers tells the kinds apart`);
    assert.match(codeOf(join(SRC, file)), /\bisOwnBoxResponse\(/, `${file} reads answers and does not leave every kind of box out`);
  });
}

test("the readers of answers are the five that review, queue, count or write them", () => {
  assert.deepEqual(
    Object.entries(READERS)
      .filter(([, entry]) => entry.answers)
      .map(([file]) => file)
      .sort(),
    [
      "app/api/courses/exercise-responses/[responseId]/review/route.ts",
      "app/api/courses/groups/[groupId]/exercises/route.ts",
      "app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts",
      "lib/courses/facilitatorGroup.ts",
      "lib/courses/finishing/whoFinished.ts",
    ],
  );
});

test("the store's own module says how to tell, and normalises the kind", () => {
  const code = readFileSync(join(SRC, "lib", "firestore", "courseExercises.ts"), "utf8");
  assert.match(code, /export function isReflectionResponse\(/);
  assert.match(code, /export function isFillInResponse\(/);
  assert.match(code, /export function isOwnBoxResponse\([^)]*\)[^{]*\{\s*return isReflectionResponse\(data\) \|\| isFillInResponse\(data\);\s*\}/);
  assert.match(code, /kind: isReflectionResponse\(data\) \? "reflection" : isFillInResponse\(data\) \? "fillIn" : "exercise"/);
});
