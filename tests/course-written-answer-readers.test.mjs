/**
 * Every reader of somebody else's written answer asks whether it may be read.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards (privacy v17, "Changing your work")
 *
 * "A written answer is yours until you send it: until then they see only that
 * you've started it. Once the session it's due at has started, they may read
 * what you've written so far, sent or not." The week stays open: an answer
 * has its own Send, may be changed and sent again, and before the session its
 * readers read it as LAST SENT. The one answer to which of its words they may
 * read is `readableAnswer` (`src/lib/courses/weekWork/versions.ts`): null
 * before the session for an answer never sent, the words as last sent before
 * it, the latest once it has started. The class of failure is a reader that
 * hands a facilitator, the lead, an admin or Claude the words of a draft, or
 * of a change not sent yet: one more page, queue or export that reads the
 * answers store and forgets to ask, or asks and then reads the row's own
 * latest words instead of the words it was handed.
 *
 * Reflections and fill-in boxes are read as they are typed, as v17 says, and
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
 *    somebody other than the caller. Its code asks `readableAnswer(`.
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
    why: "the review page: an answer is listed to give feedback on, opened and shown with its count only as its readers may read it, as last sent before the session",
  },
  "lib/courses/writtenAnswers/queue.ts": {
    treats: "others",
    why: "the review queue: an answer waits for feedback only once its readers may read it",
  },
  "lib/courses/facilitatorWeek/readers.ts": {
    treats: "others",
    why: "the Coursework tab and one person's page: an answer's words, count and feedback only as its readers may read it, its state otherwise",
  },
  "lib/courses/coursework/gather.ts": {
    treats: "others",
    why: "Claude, Pangram, the notes draft and best answers: a written answer is gathered only as its readers may read it, never a change not sent yet before the session",
  },
  "lib/courses/feedback/access.ts": {
    treats: "others",
    why: "feedback and ratings are saved only on work its readers may read, asked inside the save's transaction, which says which version they read; the words are never read out or sent back",
  },
  // ---- own: the caller's own rows only -------------------------------------
  "app/api/courses/runs/[runId]/my-exercises/route.ts": { treats: "own", proof: "actor.uid", why: "the person's own rows on their own week page, by their own uid" },
  "app/api/courses/runs/[runId]/overview/route.ts": { treats: "own", proof: "actor.uid", why: "the caller's own rows, for This week's count and their answer's line, by their own uid" },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts": { treats: "own", proof: "actor.uid", why: "the writer's own route: it writes their own answer, at an id built from their own uid" },
  "app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts": { treats: "own", proof: "actor.uid", why: "the old Submit stamps the caller's own answers as sent, never reading their words out" },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/send/route.ts": {
    treats: "own",
    proof: "actor.uid",
    why: "the answer's own Send stamps the caller's own answer as sent, at an id built from their own uid, and echoes it to them alone",
  },
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
  "lib/courses/facilitatorGroup.ts": { treats: "no-words", why: "a facilitator's To review card counts the summer's answers sent" },
  "lib/courses/finishing/whoFinished.ts": { treats: "no-words", why: "who finished counts written answers sent, by their first-sent time, never their words" },
  "lib/courses/weekPaste.ts": { treats: "no-words", why: "a paste counts the rows on the items it would take out, never their words" },
  "lib/courses/weekWork/readers.ts": { treats: "no-words", why: "how far each person has got: which answers are sent and how many words they hold, projected so no word is read" },
  "lib/applications/nextTerm/load.ts": {
    treats: "no-words",
    why: "a term's Next term page: each written answer a rating for the team rates, read by its id only for when it was first written, and nothing else of it kept",
  },
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
      assert.match(codeOf(join(SRC, file)), /\breadableAnswer\(/, `${file} reads somebody's written answer and never asks readableAnswer`);
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

test("the one answer: as last sent before the session, the latest once it has started, and nothing never sent before it", () => {
  const versions = codeOf(join(SRC, "lib", "courses", "weekWork", "versions.ts"));
  assert.match(
    versions,
    /export function readableAnswer\(piece: PieceFacts \| null, dueAt: Date \| null, now: Date\): ReadVersion \| null \{\s*if \(!piece\) return null;\s*if \(sessionStartedAt\(dueAt, now\)\) return latestOf\(piece\);\s*const sent = lastSentAt\(piece\);\s*if \(sent === null\) return null;/,
  );
  // Before the session, a change since the last send is not read: the version kept as sent is.
  assert.match(versions, /if \(keptAsSent && keptAsSent\.replacedAt\.getTime\(\) > sent\.getTime\(\)\) return readOf\(keptAsSent\);/);
  // The words leave the person's page only as they may be read: the gated readers hand on nothing else.
  const readers = codeOf(join(SRC, "lib", "courses", "facilitatorWeek", "readers.ts"));
  assert.match(readers, /const read = readableAnswer\(piece, due\.at, on\.now\);/);
  assert.match(readers, /text: read\?\.text \?\? "",/);
  assert.match(readers, /boxes: read\?\.boxes \?\? null,/);
  const review = codeOf(join(SRC, "lib", "courses", "writtenAnswers", "reviewPage.ts"));
  assert.match(review, /const read = record \? readableAnswer\(answerPiece\(record\), due\.at, now\) : null;/);
  assert.match(review, /words: readable \? \(read\?\.words \?\? 0\) : 0,/);
  assert.match(review, /if \(chosen && answer && chosen\.readable\) \{/);
  // The answer shown is the words handed back, never the row's own latest words.
  assert.match(review, /text: shown\?\.text \?\? "",/);
  assert.match(review, /boxes: shown\?\.boxes \?\? null,/);
  assert.doesNotMatch(review, /text: record\?\.text/, "the review page shows the row's latest words, sent or not");
  // Claude and Pangram are handed the words as read, never the row's own.
  const gather = codeOf(join(SRC, "lib", "courses", "coursework", "gather.ts"));
  assert.match(gather, /rows\.push\(\{ id: doc\.id, uid, question, data: read \? \{ \.\.\.data, text: read\.text, boxes: read\.boxes \?\? undefined \} : data \}\);/);
});
