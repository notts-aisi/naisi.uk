/**
 * One reading of a painted week, for every screen that asks whether somebody
 * can make a session.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * Two screens ask what the week somebody painted on the application form says
 * about a weekly session: the allocation board, whose cards say which groups
 * each person fits, and the times picture on a programme's Groups tab, which
 * counts who is free at each start time. An admin chooses a group's time from
 * one and places people from the other. If each read the week its own way,
 * the picture could count somebody free at a time their card says they cannot
 * make, and nothing on either screen would show it.
 *
 * So both ask `paintedWeekOf` (`src/lib/applications/handover/paintedWeek.ts`),
 * and only that function asks the availability module's two questions of a
 * painted week (`maskCoversSession`: does it cover the whole session;
 * `markedSlotCount`: did they paint anything), apart from the older rounds'
 * own queue, which never reads an application made on the form.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` that calls either question is listed here
 * with its reason, and the list is checked against the source both ways, so
 * a new screen that starts a reading of its own fails this file until
 * somebody decides. The two screens are then checked to ask `paintedWeekOf`.
 * Comments are read as nothing, so naming a function in prose is not calling
 * it.
 *
 * What the two screens then say is executed in
 * `tests/course-hub-times-page.test.mjs`, which holds the board's fit marks
 * and the picture's counts to the same numbers for every group.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const repoPath = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const codeOf = (file) => stripSource(readFileSync(join(REPO_ROOT, file), "utf8"));

/** Where the two questions are written. It is not a reader of itself. */
const DEFINES = "src/lib/admissions/availability.ts";

/** A call of either question. */
const ASKS = /\b(?:maskCoversSession|markedSlotCount)\s*\(/;

/** Every file that asks a painted week either question, and why it may. */
const READERS = {
  "src/lib/applications/handover/paintedWeek.ts":
    "the one reading the course side asks: the allocation board's fit marks and the times picture both come here",
  "src/lib/admissions/appointmentQueue.ts":
    "the older appointment rounds' queue, which counts the slots painted on a round of the older kind to say that nothing was given; it reads no application made on the form",
};

/** The two screens, and the module each asks through. */
const SCREENS = {
  "src/lib/applications/handover/board.ts": "the allocation board's facts about somebody the form placed on a run",
  "src/lib/applications/handover/timesLoad.ts": "the times picture on a programme's Groups tab",
};

describe("one reading of a painted week", () => {
  const askers = [...walkSource(SRC)]
    .map(repoPath)
    .filter((file) => file !== DEFINES && ASKS.test(codeOf(file)))
    .sort();

  test("the walk reads the tree and finds the readers there are known to be", () => {
    assert.ok([...walkSource(SRC)].length > 500, "too few files were read: has the tree moved?");
    assert.ok(askers.includes("src/lib/applications/handover/paintedWeek.ts"), "the one reading was not found");
    // A name in a comment is not a call: the board's own comment names the predicate.
    assert.match(readFileSync(join(REPO_ROOT, "src/lib/applications/handover/board.ts"), "utf8"), /maskCoversSession/);
    assert.ok(!askers.includes("src/lib/applications/handover/board.ts"));
  });

  test("every file that asks either question is listed with its reason, and every listed file asks", () => {
    assert.deepEqual(
      askers,
      Object.keys(READERS).sort(),
      "a file asks a painted week whether it covers a session, or whether anything was painted, and is " +
        "not on the list. A screen about people on the application form asks through paintedWeekOf in " +
        "src/lib/applications/handover/paintedWeek.ts, so that it cannot disagree with the allocation " +
        "board. Anything else goes on the list with the reason it reads a week of its own.",
    );
    for (const [file, why] of Object.entries(READERS)) {
      assert.ok(why.length > 40, `${file} needs its reason written down`);
    }
  });

  test("the one reading asks the availability module's own questions, and hands back no week", () => {
    const file = "src/lib/applications/handover/paintedWeek.ts";
    const code = codeOf(file);
    assert.match(code, /markedSlotCount\(mask, grid\) === 0/);
    // Somebody who marked under four hours is read "from then on", through the
    // availability module's own reading of a week (`fromFirstMark`).
    assert.match(code, /const read = minimal \? fromFirstMark\(mask, grid\) : mask;/);
    assert.match(code, /covers: \(session\) => maskCoversSession\(read, grid, session\)/);
    // What comes back is one of three answers: a kind, at most a predicate,
    // whether they marked little time, and each day's first marked minute
    // (where the nearest group is measured from), and never the painted week
    // itself.
    const kept = stripSource(readFileSync(join(REPO_ROOT, file), "utf8"), { keepStrings: true });
    const returned = [...kept.matchAll(/\breturn\s+([^;]+);/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
    assert.deepEqual(returned, [
      '{ kind: "not-on-file" }',
      '{ kind: "none-given" }',
      '{ kind: "given", covers: (session) => maskCoversSession(read, grid, session), minimal, firstMarks: firstMarkedMinutes(mask, grid), }',
    ]);
  });

  test("both screens ask through it", () => {
    for (const [file, what] of Object.entries(SCREENS)) {
      const code = codeOf(file);
      assert.match(code, /import \{ paintedWeekOf \} from "";/, `${what} does not import the one reading`);
      assert.match(code, /\bpaintedWeekOf\(form\.round\.availabilityGrid, /, `${what} does not ask it`);
      assert.ok(!/\bsent\.availability\b|\bsent\?\.availability\b/.test(code), `${what} reads a painted week itself`);
    }
  });
});
