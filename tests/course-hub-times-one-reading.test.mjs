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
 * EVERY FILE THAT TURNS A MARKED WEEK INTO SOMETHING A SCREEN DRAWS, and who
 * it is for. A week is stored as hex strings (`AvailabilityMask`), so
 * anything that shows it, or a stretch, an hour, a fit or a word made from
 * it, either calls one of the codec's readers of a mask (`DECODERS`, in
 * `src/lib/admissions/availability.ts`) or calls a function listed in
 * `DERIVED`, which hands back something made from one. Both lists are held
 * to the source (every exported reader of a mask in the codec is named, and
 * every derived reader is where it says and reads a week), and every file
 * that calls either is listed in `WEEK_READERS` with who it serves and the
 * gate it stands behind, checked both ways. So a new screen that draws a
 * week, the application's own review page included, fails here until it is
 * listed with its gate.
 *
 * WHO MAY SEE A PERSON'S WEEK on the staff side is who may read their
 * application (`canReadApplication`): the review page asks it through
 * `loadReview`, and any other staff screen through the one gated read
 * (`personWeekFor`). What this cannot see is a file that decodes the hex
 * strings by hand without the codec: the codec's own comment says nothing
 * else reads a week out, and a review catches one that tries.
 */
const DECODERS = ["decodeMask", "markedRanges", "fromFirstMark", "firstMarkedMinutes", "markedMinutes", "maskCoversSession", "markedSlotCount"];

/** The codec's exports that take a mask and are not readers of what was marked, and why. */
const NOT_DECODERS = {
  encodeMask: "writes a mask from a drawn grid: the applicant's own form, never a reader",
};

/** Functions that hand back something made from a marked week, by name, and the file that defines each. */
const DERIVED = {
  availabilityViewFor: "src/lib/applications/review/availabilityView.ts",
  availabilityHistory: "src/lib/applications/review/earlier.ts",
  buildReview: "src/lib/applications/review/detail.ts",
  freeInWords: "src/lib/applications/freedPlaces/words.ts",
  freeOnInTheirWeek: "src/lib/applications/freedPlaces/words.ts",
  paintedWeekOf: "src/lib/applications/handover/paintedWeek.ts",
  personWeekFor: "src/lib/applications/people/week.ts",
  boardWeeksFor: "src/lib/applications/people/week.ts",
  whyOfferedFor: "src/lib/applications/handover/whyOffered.ts",
  maskToColumns: "src/features/admissions/availabilityModel.ts",
};

/** Every file that calls a decoder or a derived reader, with who it serves and the gate it stands behind. */
const WEEK_READERS = {
  // The person's own week, back to them.
  "src/features/admissions/availabilityModel.ts": "the applicant's own grid on the form: their own week, drawn back to them as they paint it",
  "src/features/admissions/ApplyFlow.tsx": "the older rounds' application form: the applicant's own week, drawn back to them",
  "src/features/applications/apply/ApplicationForm.tsx": "the application form: the applicant's own week, drawn back to them as they paint it",
  "src/features/applications/status/WhenYoureFree.tsx": "the person's own application page: their own week, read only",
  "src/features/applications/status/WhenYoureFreeEditor.tsx": "the person's own application page: changing their own week once they hold a place",
  "src/lib/applications/handover/whyOffered.ts": "the \"Why:\" line under each session offered to a person on their own form to change session or group: their own week, in words",
  "src/lib/courses/moveRequest/own.ts": "a person's own form to change group for good: whyOfferedFor about their own week",
  "src/lib/courses/visitRequest/own.ts": "a person's own form for another session this week: whyOfferedFor about their own week",
  // Older rounds.
  "src/lib/admissions/appointmentQueue.ts":
    "the older appointment rounds' own queue, which counts the slots painted on a round of the older kind; it reads no application made on the form",
  // The application's own review page: who may read the application.
  "src/lib/applications/review/availabilityView.ts": "the review page's drawing of a week, handed only what loadReview may show",
  "src/lib/applications/review/earlier.ts": "the review page's earlier versions of a week, handed only what loadReview may show",
  "src/lib/applications/review/detail.ts": "the review page's payload (buildReview), whose one caller is loadReview",
  "src/lib/applications/review/load.ts": "the review page's loader (loadReview), which asks canReadApplication before it builds anything",
  // The one reading of a week as fits, and the screens of the programme's team.
  "src/lib/applications/handover/paintedWeek.ts": "the one reading the course side asks: a predicate and the first marks, never the week",
  "src/lib/applications/handover/board.ts": "the allocation board's fit marks, for the rows rowIsServedTo serves (an admin, and the lead whose programme's hand-over wrote them)",
  "src/lib/applications/handover/timesLoad.ts": "the times picture on a programme's Groups tab: counts of who can make each start time, never a person's week",
  "src/lib/applications/people/model.ts": "the People tab's fit marks, for rows of people whose application the reader may read (canReadApplication)",
  "src/lib/applications/people/week.ts":
    "the one gated read of a person's week for a staff screen (one person, or everybody on a board at once through boardWeeksFor): canReadApplication first, and otherwise nothing derived from the week",
  "src/lib/applications/handover/boardPanel.ts":
    "the person's panel on People in groups, and every mark Rings draws about a person's time (src/features/applications/groups/ringsModel.ts reads its answer and no week), for an admin or the programme's lead (loadProgrammeRun): everybody on the board through boardWeeksFor alone, never about the reader",
  "src/lib/courses/personPage/load.ts": "a person's page for the team: When they're free through personWeekFor alone",
  "src/lib/applications/arrange/load.ts":
    "Circles' arranging (an admin's Suggest groups on People in groups shown as Rings) and an arrangement's preview, which loadCircles and the preview open for an admin alone (canRunTerm); and the arrangement route's suggestion without Claude for the programme's lead (arrangingReader), worked out only from the rows rowIsServedTo serves the lead and each week only where canReadApplication lets the lead read the application, asked before the week is read",
  "src/lib/courses/facilitatorAsks/people.ts": "the chart beside an ask to facilitate, which the Facilitators view leaves out for anybody but an admin, and never sends to Claude",
  "src/lib/courses/placementNotes/section.ts": "Outside the times they gave, on Publish's page: the week drawn for an admin alone; a lead is sent no week there",
  "src/lib/applications/freedPlaces/words.ts": "a freed place's words about a person's week (\"Free Wed afternoons\"), for the freed places page and the offer's email",
  "src/lib/applications/freedPlaces/groups.ts": "which of the run's groups a person on the freed places page can make, for the page offersFreedPlaces opens (an admin and the lead)",
  "src/lib/applications/freedPlaces/load.ts": "the freed places page, which offersFreedPlaces opens for an admin and the lead alone, about people who ranked the programme",
  "src/lib/applications/freedPlaces/offer.ts": "the freed place offer's email to the person themselves: the part of their own week the session falls in",
};

/** Who asks the one gated read (for one person, or for everybody on a board at once), and why. */
const GATED_READ_CALLERS = {
  "src/lib/courses/personPage/load.ts": "a person's page for the team: When they're free, never about the reader themselves",
  "src/lib/applications/handover/boardPanel.ts":
    "the person's panel on People in groups, and the marks of People in groups shown as Rings, for an admin or the programme's lead: everybody on the board at once, over the applications the board's own read holds, never about the reader themselves",
};

describe("every file that turns a marked week into something a screen draws", () => {
  const callsAny = (code, names) => names.some((name) => new RegExp(`(?<![A-Za-z0-9_$.])${name}\\s*\\(`).test(code));
  const names = [...DECODERS, ...Object.keys(DERIVED)];
  const readers = [...walkSource(SRC)]
    .map(repoPath)
    .filter((file) => file !== DEFINES && callsAny(codeOf(file), names))
    .sort();

  test("the codec's readers of a mask are all named, and each one is there", () => {
    const codec = codeOf(DEFINES);
    const exported = [...codec.matchAll(/export function (\w+)\s*\(([^)]*)\)/g)]
      .filter((match) => /\bmask\s*:|\bdays\s*:/.test(match[2]))
      .map((match) => match[1])
      .sort();
    assert.deepEqual(exported, [...DECODERS, ...Object.keys(NOT_DECODERS)].sort(), "the codec has a new export that takes a mask: is it a reader of what was marked?");
    for (const [name, why] of Object.entries(NOT_DECODERS)) assert.ok(why.length > 30, `${name} needs its reason written down`);
  });

  test("each derived reader is defined where it says, and reads a marked week", () => {
    for (const [name, file] of Object.entries(DERIVED)) {
      const code = codeOf(file);
      assert.match(code, new RegExp(`export (?:async )?function ${name}\\s*\\(`), `${name} is not exported from ${file}`);
      assert.ok(callsAny(code, names.filter((other) => other !== name)), `${file} defines ${name} and reads no week: drop it from DERIVED`);
    }
  });

  test("every file that reads a marked week is listed with who it serves and its gate, and every listed file reads one", () => {
    assert.ok(readers.includes("src/lib/applications/review/load.ts"), "the walk found no review page: has the tree moved?");
    assert.deepEqual(
      readers,
      Object.keys(WEEK_READERS).sort(),
      "a file reads a marked week, or something made from one, and is not on the list, or a listed file no longer does. " +
        "A staff screen that shows a person's week asks personWeekFor in src/lib/applications/people/week.ts, which asks " +
        "canReadApplication first; anything else goes on the list with who it serves and the gate it stands behind.",
    );
    for (const [file, why] of Object.entries(WEEK_READERS)) assert.ok(why.length > 40, `${file} needs its reason written down`);
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

  test("the board's read of everybody's week asks the one gated read for each person, and reads nothing of a week itself", () => {
    const code = stripSource(readFileSync(join(REPO_ROOT, "src/lib/applications/people/week.ts"), "utf8"), { keepStrings: true });
    const from = code.indexOf("export function boardWeeksFor(");
    assert.ok(from >= 0, "boardWeeksFor is not where it was");
    const body = code.slice(from);
    assert.match(body, /out\.set\(uid, personWeekFor\(reader, form, \{ uid, application: byUid\.get\(uid\) \?\? null \}, groups, null\)\);/);
    for (const read of ["paintedWeekOf(", "markedRanges(", "fromFirstMark(", ".availability", "covers(", "canReadApplication("]) {
      assert.equal(body.indexOf(read), -1, `boardWeeksFor reads ${read} itself`);
    }
  });

  test("the gated read is asked only from the pages listed, and the person's page reads no week of its own", () => {
    const callers = [...walkSource(SRC)]
      .map(repoPath)
      .filter((file) => file !== "src/lib/applications/people/week.ts" && /\b(?:personWeekFor|boardWeeksFor)\s*\(/.test(codeOf(file)))
      .sort();
    assert.deepEqual(callers, Object.keys(GATED_READ_CALLERS).sort());
    for (const [file, why] of Object.entries(GATED_READ_CALLERS)) {
      assert.ok(why.length > 30, `${file} needs its reason written down`);
      const code = codeOf(file);
      // No reader of a week but the gated one: no decoder, no derived reader, and no mask read off an application.
      assert.ok(!callsAny(code, names.filter((name) => name !== "personWeekFor" && name !== "boardWeeksFor")), `${file} reads a week itself`);
      assert.ok(!/\.availability\b/.test(code), `${file} reads a mask off an application`);
    }
  });
});
