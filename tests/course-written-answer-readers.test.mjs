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
import { createLoader } from "./lib/tsLoader.mjs";

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
  "lib/courses/weekEdit/counts.ts": {
    treats: "no-words",
    why: "the in-place editor counts the written answers written and sent beside the block, reading a row only for whether it holds something: numbers, never words",
  },
  "lib/courses/weekEdit/askedThen.ts": {
    treats: "no-words",
    why: "the words a question had when it was answered: a person's rows read only for which question each answers and when it was first written",
  },
  "lib/courses/weekWork/readers.ts": { treats: "no-words", why: "how far each person has got: which answers are sent and how many words they hold, projected so no word is read" },
  "lib/courses/weekWork/firstRead.ts": {
    treats: "no-words",
    why: "when an answer was first read: a reflection's or a fill-in box's row is read only for whether it holds words, and a written answer only through feedbackStandingIn, which asks readableAnswer; nothing is read out or sent back",
  },
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
    /export function readableAnswer\(piece: PieceFacts \| null, dueAt: Date \| null, now: Date\): ReadVersion \| null \{\s*if \(!piece\) return null;\s*if \(sessionStartedAt\(dueAt, now\)\) return latestOf\(piece\);\s*return answerAsLastSent\(piece\);\s*\}/,
  );
  // Before the session: never sent, nothing; changed since the last send (by the database's own times,
  // never a kept version's route clock), the newest version kept as sent, or nothing at all.
  assert.match(versions, /const recorded = lastSentAt\(piece\);\s*if \(recorded === null\) return null;/);
  assert.match(
    versions,
    /const changedSinceSent =\s*\(piece\.savedAt !== null && piece\.savedAt\.getTime\(\) > sent\.getTime\(\)\) \|\|\s*\(keptAsSent !== null && keptAsSent\.sentAt\.getTime\(\) >= sent\.getTime\(\)\);\s*if \(!changedSinceSent\) return latestOf\(piece\);\s*return keptAsSent \? readOf\(keptAsSent\) : null;/,
  );
  assert.doesNotMatch(versions, /replacedAt\.getTime\(\) > sent/, "which words are read goes by a kept version's route clock again");
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

// ---------------------------------------------------------------------------
// The stored answer behind a person's Coursework page stays on the server
// ---------------------------------------------------------------------------

/**
 * A PERSON'S PAGE ON THE COURSEWORK TAB reads each written answer through
 * `readRunCoursework` (`lib/courses/facilitatorWeek/readers.ts`), which hands
 * its loader the stored answer whole, `PersonAnswerWrite.piece`: the latest
 * words and every kept version, so the loader can tell which version each
 * piece of feedback was about. Before the session that holds words its
 * readers may not read, and a kept version can hold words a feedback card
 * never shows. It is for the server alone: no route answers with it and no
 * client component is handed it.
 *
 * Every file that names its types, its map or its reader is listed here,
 * both ways. None may be a route handler or a client component; a file that
 * reads `.piece` must be server-only; and `personWeeks`, the one builder of
 * what the page is handed from it, is run with a piece full of words that
 * must not leave.
 */
const HOLDS_PIECE = /\bPersonAnswerWrite\b|\bPersonWrites\b|\bwrites\.answers\b|\breadRunCoursework\(/;
const PIECE_HOLDERS = {
  "lib/courses/facilitatorWeek/readers.ts": "builds it: `readRunCoursework`, server-only, asked by each caller after its own gate",
  "lib/courses/coursework/tabLoad.ts":
    "server-only: the Coursework tab's states, flags and list of what waits through `readRunCoursework` with words for nobody (each answer's facts, never its words, are worked out inside the reader); it reads no `.piece`",
  "lib/courses/coursework/readingLoad.ts":
    "server-only: the reading view's one loader; reads `.piece` for the version each feedback card was about, whether the week and the answer take feedback, and the ratings' changes; hands the page `personWeeks`' answers, never the stored one",
  "lib/courses/coursework/model.ts": "pure: `personWeeks` copies an answer's named fields into what the page is handed, and never `piece` (run below)",
  "lib/courses/coursework/questionLoad.ts":
    "server-only: the loader of one question across a group; words for the people the one gate lets the reader read, through `readRunCoursework`, `.piece` read for the version each feedback card was about and the ratings' changes; hands the page each answer's named fields, never the stored one (tests/course-question-view.test.mjs runs it with a change not sent)",
};

test("the stored answer behind a person's Coursework page (PersonAnswerWrite.piece) is held only by the files listed, both ways", () => {
  const found = [];
  for (const file of walkSource(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    if (HOLDS_PIECE.test(codeOf(file))) found.push(inSrc(file));
  }
  assert.ok(found.includes("lib/courses/facilitatorWeek/readers.ts"), "the scan missed the reader that builds it, so it is not reading the tree");
  assert.deepEqual(found.sort(), Object.keys(PIECE_HOLDERS).sort());
  for (const [file, why] of Object.entries(PIECE_HOLDERS)) {
    assert.ok(why.length > 30, `${file}: say why`);
    const source = readFileSync(join(SRC, file), "utf8");
    assert.doesNotMatch(source, /^\s*["']use client["']/m, `${file} is a client component and holds the stored answer`);
    assert.ok(!/(^|\/)route\.tsx?$/.test(file), `${file} is a route handler and holds the stored answer`);
    if (/\.piece\b/.test(codeOf(join(SRC, file)))) {
      assert.match(source, /^import "server-only";/m, `${file} reads the stored answer and is not server-only`);
    }
  }
});

test("no route and no client component imports what carries the stored answer", () => {
  for (const file of walkSource(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const rel = inSrc(file);
    const source = readFileSync(file, "utf8");
    const client = /^\s*["']use client["']/m.test(source);
    const route = /(^|\/)route\.tsx?$/.test(rel);
    if (!client && !route) continue;
    assert.doesNotMatch(codeOf(file), /\bPersonAnswerWrite\b|\bPersonWrites\b|\breadRunCoursework\b/, `${rel} is handed the stored answer`);
  }
});

test("personWeeks hands the page an answer's named fields, never the stored answer or a word kept in it", async () => {
  const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
  const model = await loadTs("lib/courses/coursework/model.ts");
  const KEPT = "AKEPTVERSIONNOREADERSEES";
  const LATEST = "ALATESTCHANGENOTSENT";
  const at = new Date("2026-11-16T10:00:00Z");
  const piece = {
    text: LATEST,
    boxes: null,
    words: 1,
    savedAt: at,
    firstSentAt: at,
    sentAt: at,
    earlierVersions: [{ text: KEPT, boxes: null, words: 1, savedAt: at, replacedAt: at, sentAt: at, reasons: ["sent"] }],
  };
  const week = { weekNumber: 3, title: "Week 3", parts: [], sources: [], answer: { id: "wa", prompt: "Write a plan.", boxes: [] }, boxes: [], tasks: [], writes: true };
  const write = {
    state: "sent",
    words: 1,
    text: "The words sent.",
    boxes: null,
    sentAt: at,
    lastSentAt: at,
    changedAt: at,
    changedLateMs: null,
    sentLateMs: null,
    atSession: null,
    piece,
    feedback: null,
  };
  const weeks = model.personWeeks({
    columns: [{ weekNumber: 3, title: "Week 3" }],
    weekOf: () => week,
    writes: { reflections: new Map(), boxes: new Map(), answers: new Map([[model.workKey(3, "wa"), write]]), ticked: new Set() },
    boxesRead: true,
    notes: null,
    writtenHref: () => null,
    feedbackOf: () => ({ cards: [], own: null, open: false }),
  });
  const handed = JSON.stringify(weeks);
  assert.ok(handed.includes("The words sent."), "the fixture did not reach the page, so this proves nothing");
  for (const never of [KEPT, LATEST, "earlierVersions", '"piece"', "replacedAt"]) {
    assert.ok(!handed.includes(never), `what the page is handed carries ${never}`);
  }
});
