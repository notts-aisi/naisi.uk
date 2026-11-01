/**
 * Every reader of somebody else's written answer asks whether it may be read.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards (privacy v15, "Changing your work")
 *
 * "A written answer is yours until you send it: until then they see only that
 * you have started it, never what it says, and if your week locks before you
 * send it, they may then read what you wrote." Since weeks are submitted, an
 * answer is sent by submitting its week, and the one answer to whether its
 * readers may read it is `workIsReadable` (`src/lib/courses/weekWork/model.ts`):
 * the week submitted or locked, or the answer sent before weeks were
 * submitted. The class of failure is a reader that hands a facilitator, the
 * lead, an admin or Claude the words of a draft: one more page, queue or
 * export that reads the answers store and forgets to ask.
 *
 * Reflections and fill-in boxes are read as they are typed, as v15 says, and
 * are not this guard's.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` whose code hands the answers store's name
 * to a database call or a deletion sweep, and every file that reads a stored
 * written answer (`readWrittenAnswer(`), is listed below with what it does
 * with a written answer's words:
 *
 *  - `others`: it reads, counts as waiting, or hands on the words of
 *    somebody other than the caller. Its code asks `workIsReadable(`.
 *  - `own`: it reads the caller's own rows only, by their own uid, and says
 *    which literal shows it.
 *  - `no-words`: it never reads a written answer's words for anybody: it
 *    writes them, counts rows, deletes them, or reads states and times, and
 *    says why.
 *
 * Both directions: a new reader fails this file until somebody decides, and
 * an entry whose file no longer reads the store fails it too.
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
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/** The answers store handed to a database call, a deletion sweep or the account deletion's list. */
const ADDRESSES =
  /\.collection\(\s*["'`]courseExerciseResponses["'`]\s*\)|\bbyRunId\(\s*["'`]courseExerciseResponses["'`]\s*\)|\[\s*["'`]courseExerciseResponses["'`]\s*,|\bdrainQuery\([^,]+,\s*["'`]courseExerciseResponses["'`]/;
/**
 * A stored written answer read whole, its words and its boxes among it: the
 * written answers' own reader imported (a week's block reader of the same
 * name, in `weekBlocks/model.ts`, reads a pasted block, not anybody's answer).
 */
const READS_ANSWER =
  /import\s*\{[^}]*\breadWrittenAnswer\b[^}]*\}\s*from\s*["'](?:@\/lib\/courses\/writtenAnswers\/model|\.\/model|\.\.\/writtenAnswers\/model)["']/;

const READERS = {
  // ---- others: each asks workIsReadable ------------------------------------
  "lib/courses/writtenAnswers/reviewPage.ts": {
    treats: "others",
    why: "the review page: an answer is listed to give feedback on, opened and shown with its count only once its readers may read it",
  },
  "lib/courses/writtenAnswers/queue.ts": {
    treats: "others",
    why: "the review queue: an answer waits for feedback only once its readers may read it",
  },
  "lib/courses/facilitatorWeek/readers.ts": {
    treats: "others",
    why: "the Coursework tab and one person's page: an answer's words, count and feedback only once its readers may read it, its state otherwise",
  },
  "lib/courses/coursework/gather.ts": {
    treats: "others",
    why: "Claude, Pangram, the notes draft and best answers: a written answer is gathered only once its readers may read it",
  },
  "lib/courses/feedback/access.ts": {
    treats: "others",
    why: "feedback is saved only on work its readers may read, asked inside the save's transaction; the words are never read out or sent back",
  },
  // ---- own: the caller's own rows only -------------------------------------
  "app/api/courses/runs/[runId]/my-exercises/route.ts": { treats: "own", proof: "actor.uid", why: "the person's own rows on their own week page, by their own uid" },
  "app/api/courses/runs/[runId]/overview/route.ts": { treats: "own", proof: "actor.uid", why: "the caller's own rows, for This week's count and their answer's line, by their own uid" },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts": { treats: "own", proof: "actor.uid", why: "the writer's own route: it writes their own answer, at an id built from their own uid" },
  "app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts": { treats: "own", proof: "actor.uid", why: "Submit stamps the caller's own answers as sent, never reading their words out" },
  // ---- no-words: never a written answer's words ------------------------------
  "app/api/courses/exercise-responses/[responseId]/review/route.ts": { treats: "no-words", why: "a verdict on a summer exercise answer; a written answer reads as no row" },
  "app/api/courses/groups/[groupId]/exercises/route.ts": { treats: "no-words", why: "the summer's review queue; written answers and boxes are left out" },
  "app/api/courses/groups/[groupId]/weeks/[weekId]/route.ts": { treats: "no-words", why: "counts rows naming an exercise a group's edit removes" },
  "app/api/courses/runs/[runId]/apply-template/route.ts": { treats: "no-words", why: "refuses to replace weeks that have any answers, by count" },
  "app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts": { treats: "no-words", why: "the summer exercise answer's writer: it refuses to write over any other kind of row" },
  "app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts": { treats: "no-words", why: "a fill-in box's writer: never a written answer" },
  "app/api/courses/runs/[runId]/fill-in-boxes/route.ts": { treats: "no-words", why: "the one reader of somebody's fill-in boxes, read as typed as v15 says: never a written answer" },
  "app/api/courses/runs/[runId]/normalise-weeks/route.ts": { treats: "no-words", why: "refuses to renumber weeks that have any answers, by count" },
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": { treats: "no-words", why: "a reflection's writer: never a written answer" },
  "app/api/courses/runs/[runId]/reflections/route.ts": { treats: "no-words", why: "the one reader of somebody's reflections, read as typed as v15 says: never a written answer" },
  "app/api/courses/runs/[runId]/weeks/[weekId]/reopen/route.ts": { treats: "no-words", why: "reopening clears an opened answer's lock, reading only whether it was opened" },
  "lib/courses/facilitatorGroup.ts": { treats: "no-words", why: "a facilitator's To review card counts the summer's answers sent" },
  "lib/courses/finishing/whoFinished.ts": { treats: "no-words", why: "who finished counts written answers sent, by their first-sent time, never their words" },
  "lib/courses/weekPaste.ts": { treats: "no-words", why: "a paste counts the rows on the items it would take out, never their words" },
  "lib/courses/weekWork/readers.ts": { treats: "no-words", why: "how far each person has got: which answers are sent and how many words they hold, projected so no word is read" },
  "lib/firestore/accountDeletion.ts": { treats: "no-words", why: "deleting an account deletes every row its owner wrote" },
  "lib/firestore/courseDeletion.ts": { treats: "no-words", why: "destroying a run counts and deletes every row on it" },
};

const KINDS = new Set(["others", "own", "no-words"]);

function readersInTree() {
  const found = [];
  for (const file of walkSource(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const code = codeOf(file);
    if (ADDRESSES.test(code) || READS_ANSWER.test(code)) found.push(inSrc(file));
  }
  return found.sort();
}

test("the scan is reading: it finds readers this file knows by name", () => {
  const found = readersInTree();
  for (const known of ["lib/courses/writtenAnswers/reviewPage.ts", "lib/courses/coursework/gather.ts", "lib/firestore/courseDeletion.ts"]) {
    assert.ok(found.includes(known), `the scan missed ${known}, so it is not reading the tree`);
  }
});

test("every reader of the answers store, and of a stored written answer, is listed, and every entry still reads it", () => {
  assert.deepEqual(readersInTree(), Object.keys(READERS).sort());
});

test("every entry says what it does with a written answer's words, and why", () => {
  for (const [file, entry] of Object.entries(READERS)) {
    assert.ok(KINDS.has(entry.treats), `${file}: "${entry.treats}" is not one of ${[...KINDS].join(", ")}`);
    assert.ok(entry.why && entry.why.length > 30, `${file}: say why`);
  }
});

for (const [file, entry] of Object.entries(READERS)) {
  if (entry.treats === "others") {
    test(`${file} asks whether a written answer may be read`, () => {
      assert.match(codeOf(join(SRC, file)), /\bworkIsReadable\(/, `${file} reads somebody's written answer and never asks workIsReadable`);
    });
  }
  if (entry.treats === "own") {
    test(`${file} reads the caller's own rows`, () => {
      assert.ok(entry.proof, `${file}: say which literal shows the rows are the caller's own`);
      assert.ok(codeOf(join(SRC, file)).includes(entry.proof), `${file} no longer reads by ${entry.proof}`);
    });
  }
}

test("the readers of somebody else's words are the five that review, queue, read the Coursework tab, gather for Claude and give feedback", () => {
  assert.deepEqual(
    Object.entries(READERS)
      .filter(([, entry]) => entry.treats === "others")
      .map(([file]) => file)
      .sort(),
    [
      "lib/courses/coursework/gather.ts",
      "lib/courses/facilitatorWeek/readers.ts",
      "lib/courses/feedback/access.ts",
      "lib/courses/writtenAnswers/queue.ts",
      "lib/courses/writtenAnswers/reviewPage.ts",
    ],
  );
});

test("the one answer: submitted or locked, or sent before weeks were submitted, and never while open or reopened otherwise", () => {
  const model = codeOf(join(SRC, "lib", "courses", "weekWork", "model.ts"));
  assert.match(
    model,
    /export function workIsReadable\(state: WeekWorkState, answer: \{ firstSentAt: Date \| null \} \| null\): boolean \{\s*if \(state\.kind === "submitted" \|\| state\.kind === "locked"\) return true;\s*return state\.kind === "open" && answer\?\.firstSentAt != null;\s*\}/,
  );
  // The words leave the person's page only once they may be read: the gated readers hand on nothing else.
  const readers = codeOf(join(SRC, "lib", "courses", "facilitatorWeek", "readers.ts"));
  assert.match(readers, /text: readable \? record\.text : "",/);
  assert.match(readers, /boxes: readable \? record\.boxes : null,/);
  const review = codeOf(join(SRC, "lib", "courses", "writtenAnswers", "reviewPage.ts"));
  assert.match(review, /words: readable \? \(record\?\.words \?\? 0\) : 0,/);
  assert.match(review, /if \(chosen && answer && chosen\.readable\) \{/);
});
