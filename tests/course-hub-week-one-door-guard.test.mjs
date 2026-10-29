/**
 * Week 1 before groups go out (Q35 B) is opened by one door, decided by one
 * test, on one answer to whether a week is ready, and walked for over the
 * whole of `src`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class this guards
 *
 * Somebody holding a place whom Publish has not told yet may open week 1 of
 * the run their programme names, once it is ready, and nothing else of the
 * run. Four ways that can quietly stop being true:
 *
 *  1. A SECOND DOOR. A page or route that works out for itself whether a
 *     holder may in, and so can let in somebody the door shuts out (somebody
 *     who left, a place given back). Every caller of `weekOneDoorFor` is
 *     listed with what it opens, both ways.
 *  2. A SECOND TEST FOR HOLDING A PLACE. `holdsPlaceOn`, the test the
 *     hand-over and Publish share, is called by them and by the door, and by
 *     nothing else.
 *  3. A SECOND ANSWER TO READY. A stored week's `ready` is read by its
 *     normaliser and by `weekIsReady`, and written by its one route, and by
 *     nothing else; every page asks `weekIsReady`.
 *  4. A PAGE UNDER THE RUN THAT OPENS TO A HOLDER. The run's layout lets a
 *     holder in for week 1's sake, so every page under `/learn/[runId]` that
 *     reads `beforeGroups` is listed with what it shows them. A page that
 *     opens to exactly the people week 1 opens to (Start here, the Glossary)
 *     asks `canLearn || beforeGroups` and is listed here when it lands.
 *
 * And each of the holder's write doors asks the door before it writes.
 *
 * What the door then does is executed in
 * `tests/course-hub-week-one-before-groups.test.mjs`.
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
const inSrc = (file) => relative(SRC, file).split(sep).join("/");
/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);
const read = (path) => FILES.find(([file]) => file === path)?.[1] ?? "";
const filesWhere = (pattern) => FILES.filter(([, code]) => pattern.test(code)).map(([file]) => file).sort();

/** Every caller of week 1's door, and what it opens with the answer. */
const DOOR_ASKERS = {
  "features/courses/runAccess.ts": "the gate of every page under /learn/[runId], for anybody with no other way in: it carries the answer as beforeGroups",
  "app/api/courses/runs/[runId]/overview/route.ts": "the week page's one read: week 1 alone, with no group, session or other week, for somebody the door opens to",
  "app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts": "a holder's tick of one of week 1's own items, written as the browser writes it",
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": "a holder's own reflection box, in week 1 only",
  "app/api/courses/runs/[runId]/my-exercises/route.ts": "a holder's own rows read back, for week 1 only",
  "lib/courses/weekOne/cards.ts": "Home's and My programmes' card for a place held before groups go out, and its Week 1 is open",
};

/** Every caller of the test the hand-over and Publish share. */
const PLACE_TESTERS = {
  "lib/applications/handover/holders.ts": "placeHoldersOn, the hand-over's own list, asks it of each person",
  "lib/applications/handover/onAcceptance.ts": "the hand-over that follows an accepted invitation: whether the place just taken is one the press would hand over, asked of the person's own document",
  "lib/applications/handover/board.ts": "the allocation board and Publish's plan: whether each person from the form still holds the place",
  "lib/courses/weekOne/door.ts": "week 1's door: whether this person holds a place on the programme that names the run",
  "lib/applications/people/model.ts": "the programme's People tab, for its lead and admins: everybody holding a place, by the same one test",
  "lib/surveys/waiting.ts": "a survey waiting for somebody (Home, My programmes, week 1's first card): whether they still hold the place a programme's survey before it or at its end was sent for, the test its own reminder asks through placeHoldersOn",
};

/** Every page under the run that reads a holder's way in, and what it shows them. */
const PAGES_FOR_HOLDERS = {
  "app/(app)/learn/[runId]/layout.tsx": "lets a holder in, for week 1's page; every other page narrows to its own predicate",
  "app/(app)/learn/[runId]/weeks/[n]/page.tsx": "draws week 1 for a holder and sends every other week to week 1",
  "features/courses/guide/door.ts": "Start here and the Glossary (both pages ask guideDoor): open to exactly the people week 1 opens to, canLearn || beforeGroups",
};

describe("week 1's door is asked through one function", () => {
  test("the scan is reading: it finds the door itself", () => {
    assert.ok(FILES.length > 500, `only ${FILES.length} files were read`);
    assert.match(read("lib/courses/weekOne/door.ts"), /export async function weekOneDoorFor\(/);
  });

  test("every caller is listed with what it opens, both ways", () => {
    const asking = filesWhere(/\bweekOneDoorFor\s*\(/).filter((file) => file !== "lib/courses/weekOne/door.ts");
    assert.deepEqual(
      asking,
      Object.keys(DOOR_ASKERS).sort(),
      "a file asks week 1's door and is not listed, or a listed file no longer asks it. List it with what it opens: " +
        "never open week 1, or anything of the run, to somebody holding a place any other way.",
    );
    for (const [file, why] of Object.entries(DOOR_ASKERS)) assert.ok(why.length > 40, `${file} needs its reason`);
  });

  test("each of a holder's write doors asks the door before it writes, and a view-as session first", () => {
    for (const [file, writes] of [
      ["app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts", "db.runTransaction("],
      ["app/api/courses/runs/[runId]/reflections/[promptId]/route.ts", "db.runTransaction("],
    ]) {
      const code = read(file);
      const guard = code.indexOf("const blocked = await assertNotImpersonating();");
      const door = code.indexOf("weekOneDoorFor(");
      const write = code.indexOf(writes);
      assert.ok(guard !== -1 && door > guard && write > door, `${file} writes before it asks the door, or before view-as`);
    }
    const own = read("app/api/courses/runs/[runId]/my-exercises/route.ts");
    assert.ok(own.indexOf("weekOneDoorFor(") < own.indexOf('.collection("courseExerciseResponses")'), "own rows are read before the door is asked");
    // Week 1 and nothing else: both doors that are not week 1's own route hold it to week 1.
    assert.match(read("app/api/courses/runs/[runId]/reflections/[promptId]/route.ts"), /weekNumber === 1 && \(await weekOneDoorFor\(db, actor, runId\)\)\.open/);
    assert.match(read("app/api/courses/runs/[runId]/my-exercises/route.ts"), /week === 1 && \(await weekOneDoorFor\(db, actor, runId\)\)\.open/);
  });
});

describe("holding a place is one test", () => {
  test("holdsPlaceOn is called by the hand-over, the board, week 1's door and the People tab, and nothing else", () => {
    assert.deepEqual(
      filesWhere(/\bholdsPlaceOn\s*\(/),
      Object.keys(PLACE_TESTERS).sort(),
      "a file decides whether somebody holds a place with the hand-over's test and is not listed. Ask week 1's door " +
        "(weekOneDoorFor) for anything a holder may open before groups go out.",
    );
    for (const [file, why] of Object.entries(PLACE_TESTERS)) assert.ok(why.length > 40, `${file} needs its reason`);
  });

  test("the door reads a decision only after decision day has told the person", () => {
    const door = read("lib/courses/weekOne/door.ts");
    const told = door.indexOf("!hasBeenTold(application)");
    const decision = door.indexOf("loadDecision(db, form.round.id, person.uid)");
    assert.ok(told !== -1 && decision > told, "the door reads a decision before it knows the person was told");
  });
});

// Every file that reads a stored `ready` as true, and which `ready` it reads.
// A week's is read by its normaliser and weekIsReady alone. A talk's (packs
// and cases: the person's own "Ready for my talk") is another field of
// another record, read by that record's normaliser and the route that sets
// it, and neither of those reads a week's.
const READS_READY = {
  "lib/courses/weekReady.ts": "weekIsReady, the one answer to whether a week is ready, which every page that says so asks",
  "lib/firestore/courses.ts": "the week's normaliser: a stored ready counts only on a published week",
  "lib/firestore/coursePacksAndCases.ts": "a talk's ready on a person's packs and cases record, their own mark, never a week's",
  "app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts":
    "the body of a person marking themselves ready for a talk, never a week's ready",
};

describe("whether a week is ready is one answer", () => {
  test("a stored week's ready is read by its normaliser and weekIsReady alone", () => {
    assert.deepEqual(filesWhere(/\.ready\s*===\s*true/), Object.keys(READS_READY).sort());
    for (const [file, why] of Object.entries(READS_READY)) assert.ok(why.length > 40, `${file} needs its reason`);
    for (const file of ["lib/firestore/coursePacksAndCases.ts", "app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts"]) {
      assert.doesNotMatch(read(file), /\bweek\w*\.ready\b/, `${file} reads a week's ready`);
    }
    assert.match(read("lib/firestore/courses.ts"), /ready: data\.ready === true && data\.published === true,/);
    assert.match(read("lib/courses/weekReady.ts"), /week\.published === true && week\.ready === true/);
  });

  test("it is written by its one route alone", () => {
    assert.deepEqual(filesWhere(/\bready:\s*true,\s*readyAt:/), ["app/api/courses/runs/[runId]/weeks/[weekId]/ready/route.ts"]);
    assert.deepEqual(filesWhere(/\breadyByUid:\s*(?:actor|FieldValue)/), ["app/api/courses/runs/[runId]/weeks/[weekId]/ready/route.ts"]);
  });

  test("the pages that say whether a week is ready ask weekIsReady", () => {
    for (const file of [
      "lib/courses/weekOne/door.ts",
      "lib/courses/programmeOverview.ts",
      "features/courses/WeekEditor.tsx",
      "lib/courses/weekBlocks/reader.ts",
      "app/api/courses/runs/[runId]/weeks/[weekId]/ready/route.ts",
    ]) {
      assert.match(read(file), /\bweekIsReady\(/, `${file} decides readiness some other way`);
    }
  });
});

describe("the pages under the run that open to somebody holding a place", () => {
  test("every page under /learn/[runId] that reads a holder's way in is listed, both ways", () => {
    // The pages under the run, and Start here's and the Glossary's door, which both of those pages ask.
    const reading = FILES.filter(
      ([file, code]) =>
        (file.startsWith("app/(app)/learn/[runId]/") || file === "features/courses/guide/door.ts") &&
        /\bbeforeGroups\b/.test(code),
    )
      .map(([file]) => file)
      .sort();
    assert.deepEqual(
      reading,
      Object.keys(PAGES_FOR_HOLDERS).sort(),
      "a page under the run reads beforeGroups and is not listed. Week 1 is all a holder may open before groups " +
        "go out: a page that opens to exactly the people week 1 opens to asks canLearn || beforeGroups, and is listed.",
    );
  });

  test("the week page sends a holder from every other week to week 1, and draws week 1 as somebody taking part", () => {
    const page = read("app/(app)/learn/[runId]/weeks/[n]/page.tsx").replace(/\s+/g, " ");
    assert.ok(page.includes('if (!access.canLearn && access.beforeGroups) { if (n !== "1") redirect(`/learn/${encodeURIComponent(runId)}/weeks/1`);'));
    // The holder's week 1 also hands the Start here and Glossary links, as st-week1-phone draws them for this
    // reader, and the before survey's card while it waits for them (Q50 B: week 1's first card).
    assert.ok(page.includes('return <WeekView runId={runId} weekNumber={1} uid={access.user.uid} viewerRole="learner" sharedNotes={null} {...(holderGuide ? { guide: holderGuide } : {})} {...(holderSurvey ? { survey: holderSurvey } : {})} />;'));
  });

  test("the gate asks the door only of somebody with no other way in", () => {
    const gate = read("features/courses/runAccess.ts").replace(/\s+/g, " ");
    assert.ok(gate.includes("const door = canLearn || hasLeft ? null : await weekOneDoorFor(db, user, run.id);"));
    assert.ok(gate.includes("beforeGroups: door?.open ? door.place : null,"));
  });
});
