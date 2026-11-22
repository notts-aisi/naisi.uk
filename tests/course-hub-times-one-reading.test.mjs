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

/**
 * Readers that say a person's own times back to them in words: each asks the
 * one reading, hands back sentences and never the week, and is called only
 * from the places listed, which serve the person their own page.
 */
const WORDS_READERS = {
  "src/lib/applications/handover/whyOffered.ts": {
    why: "the \"Why:\" line under each session a person is offered on their own form for another session this week, and under each group on their own form to change group for good",
    callers: ["src/lib/courses/moveRequest/own.ts", "src/lib/courses/visitRequest/own.ts"],
  },
};

describe("readers that say a person's own times back to them", () => {
  for (const [file, { why, callers }] of Object.entries(WORDS_READERS)) {
    test(`${file}: through the one reading, words out, from its own callers alone`, () => {
      assert.ok(why.length > 40, `${file} needs its reason written down`);
      const code = codeOf(file);
      assert.match(code, /import \{ paintedWeekOf \} from "";/, "it does not import the one reading");
      assert.match(code, /\bpaintedWeekOf\(form\.round\.availabilityGrid, application\)/, "it does not ask it");
      assert.ok(!ASKS.test(code), "it asks a painted week a question of its own");
      // What comes back is the map of sentences, and nothing of the week.
      const kept = stripSource(readFileSync(join(REPO_ROOT, file), "utf8"), { keepStrings: true });
      const returned = [...kept.matchAll(/\breturn\s+([^;]+);/g)].map((match) => match[1].trim());
      assert.ok(returned.length > 0 && returned.every((each) => each === "out"), `it returns ${returned.join(", ")}`);
      assert.match(kept, /Promise<Map<string, string>>/);
      const importers = [...walkSource(SRC)]
        .map(repoPath)
        .filter((each) => each !== file && /\bwhyOfferedFor\b/.test(codeOf(each)))
        .sort();
      assert.deepEqual(importers, [...callers].sort());
    });
  }
});

/**
 * WHO HANDS A PERSON'S MARKED STRETCHES TO A STAFF SCREEN. The week itself
 * (each stretch somebody marked, `markedRanges`) is what a chart draws, and
 * it is shown only where its file's gate says. Every file that reads it is
 * listed with that gate, checked both ways, so a second reader cannot appear
 * unnoticed. A programme's lead is shown a person's week only through the one
 * gated read (`personWeekFor`), which asks the application's own rule
 * (`canReadApplication`) before it reads anything of the week.
 */
const STRETCH_READERS = {
  "src/lib/applications/arrange/load.ts":
    "Circles and an arrangement's preview, which loadCircles and the arrangement route open for an admin alone (canRunTerm), before anybody is read",
  "src/lib/courses/facilitatorAsks/people.ts":
    "the chart beside an ask to facilitate, which the Facilitators view leaves out for anybody but an admin, and which is never sent to Claude",
  "src/lib/courses/placementNotes/section.ts":
    "Outside the times they gave, on Publish's page: the week drawn for an admin alone beside their group's session while a note is written; a lead is sent no week there",
  "src/lib/applications/people/week.ts":
    "the one gated read of a person's week for a staff page (a person's page under a programme): the week only where canReadApplication admits the reader, and otherwise nothing derived from it",
};

/** Who asks the one gated read, and why. */
const GATED_READ_CALLERS = {
  "src/lib/courses/personPage/load.ts": "a person's page for the team: When they're free, never about the reader themselves",
};

describe("who hands a person's marked stretches to a staff screen", () => {
  const STRETCHES = /\bmarkedRanges\s*\(/;
  const readers = [...walkSource(SRC)]
    .map(repoPath)
    .filter((file) => file !== DEFINES && STRETCHES.test(codeOf(file)))
    .sort();

  test("every file that reads the stretches is listed with its gate, and every listed file reads them", () => {
    assert.deepEqual(
      readers,
      Object.keys(STRETCH_READERS).sort(),
      "a file reads the stretches somebody marked and is not on the list. A screen that shows a person's week to " +
        "anybody but an admin asks personWeekFor in src/lib/applications/people/week.ts, which asks canReadApplication " +
        "first; anything else goes on the list with the gate it stands behind.",
    );
    for (const [file, why] of Object.entries(STRETCH_READERS)) assert.ok(why.length > 40, `${file} needs its reason written down`);
  });

  test("the one gated read asks who may read the application before it reads anything of the week", () => {
    const code = stripSource(readFileSync(join(REPO_ROOT, "src/lib/applications/people/week.ts"), "utf8"), { keepStrings: true });
    const from = code.indexOf("export function personWeekFor(");
    assert.ok(from >= 0, "personWeekFor is not where it was");
    const body = code.slice(from);
    const asked = body.indexOf("canReadApplication(reader, form, ranked, joined)");
    assert.ok(asked > 0, "it does not ask canReadApplication of the ranking and the programme joined");
    assert.match(body, /if \(!canReadApplication\(reader, form, ranked, joined\)\) return \{ kind: "may-not" \};/);
    for (const read of ["paintedWeekOf(", "markedRanges(", "fromFirstMark(", ".availability", "covers("]) {
      const at = body.indexOf(read);
      assert.ok(at === -1 || at > asked, `it reads ${read} before it has asked whether the reader may read the application`);
    }
    // The reader's own week is never answered, before anything else.
    assert.ok(body.indexOf('if (person.uid === reader.uid) return { kind: "own" };') < asked);
  });

  test("the gated read is asked only from the pages listed, and the person's page reads no week of its own", () => {
    const callers = [...walkSource(SRC)]
      .map(repoPath)
      .filter((file) => file !== "src/lib/applications/people/week.ts" && /\bpersonWeekFor\s*\(/.test(codeOf(file)))
      .sort();
    assert.deepEqual(callers, Object.keys(GATED_READ_CALLERS).sort());
    for (const [file, why] of Object.entries(GATED_READ_CALLERS)) {
      assert.ok(why.length > 30, `${file} needs its reason written down`);
      const code = codeOf(file);
      assert.ok(!/\bmarkedRanges\s*\(|\bpaintedWeekOf\s*\(|\bfromFirstMark\s*\(|\.availability\b/.test(code), `${file} reads a week itself`);
    }
  });
});
