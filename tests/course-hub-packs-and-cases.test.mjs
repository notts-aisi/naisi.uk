/**
 * PACKS, CASES AND TALKS (plan item 8; Q32 A; boards wk-cases, wk-week,
 * wk-week-phone, wk-week6-phone, wk-fac-group and wk-programme), driven
 * through the real routes and pages as every kind of caller:
 *
 *  1. the per-person record, its normaliser, and what takes it away;
 *  2. Choose one on the week page: a pack picked and changed until the
 *     session, a pack given out shown as the person's, and "done" counting
 *     only the pack the person has (`progress.ts`);
 *  3. the draw: the page a facilitator copies the slips into, its route, who
 *     may type it, the case lists, and the spread on the group page;
 *  4. Your case study: the case given, "Ready for my talk", the words before
 *     a case is given, and the programme page's task row;
 *  5. This week's work's pathway and case columns, for the group page's table
 *     (`weekWorkOf`): a pack given out is the draw, seen by every facilitator
 *     of the group; a pack somebody picked is their own coursework.
 *
 * The world is `tests/lib/packsAndCasesWorld.mjs`: AGI Strategy in week 3,
 * Group B (Chloe, Farah, Kofi; Rahul, Sofia and Farah facilitating) meeting
 * tonight at 6pm. Every word in the weeks is made up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { A, B, C, D, NOW, RUN, W2, W3, makePacksAndCasesWorld, textOf } from "./lib/packsAndCasesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makePacksAndCasesWorld();

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

/** Each phrase, in this order, somewhere in `text`. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}"`);
    from = at + phrase.length;
  }
}

/** The store, with `count()` on every query it hands out, answered by counting what the query returns. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

// ---------------------------------------------------------------------------
// 1. The record
// ---------------------------------------------------------------------------

describe("1. the per-person record", () => {
  test("its id is built from the run, the person and the block, and it reads back only what it can place", () => {
    const { normalizeCoursePackCase, packCaseRecordId, COURSE_PACKS_AND_CASES_COLLECTION } = w.lib.record;
    assert.equal(COURSE_PACKS_AND_CASES_COLLECTION, "coursePacksAndCases");
    assert.equal(packCaseRecordId("run-1", "amara", "co-1"), "run-1__amara__co-1");
    const pack = normalizeCoursePackCase("x", { runId: "run-1", uid: "amara", blockId: "co-1", kind: "pack", packId: "pk-1", weekId: "w03", weekNumber: 3, caseId: "ca-1", ready: true });
    assert.deepEqual(
      { kind: pack.kind, packId: pack.packId, caseId: pack.caseId, ready: pack.ready, weekNumber: pack.weekNumber },
      { kind: "pack", packId: "pk-1", caseId: null, ready: false, weekNumber: 3 },
      "a pack's record holds a pack and nothing of a talk's",
    );
    const talk = normalizeCoursePackCase("y", { runId: "run-1", uid: "amara", blockId: "cs-1", kind: "talk", packId: "pk-1", caseId: "ca-1", ready: true });
    assert.deepEqual({ packId: talk.packId, caseId: talk.caseId, ready: talk.ready }, { packId: null, caseId: "ca-1", ready: true });
    // A row nobody can place is read as nothing.
    for (const broken of [
      { uid: "amara", blockId: "co-1", kind: "pack" },
      { runId: "run-1", blockId: "co-1", kind: "pack" },
      { runId: "run-1", uid: "amara", kind: "pack" },
      { runId: "run-1", uid: "amara", blockId: "co-1", kind: "something" },
    ]) {
      assert.equal(normalizeCoursePackCase("z", broken), null, JSON.stringify(broken));
    }
    // Only a stored true is ready.
    assert.equal(normalizeCoursePackCase("t", { runId: "r", uid: "u", blockId: "b", kind: "talk", ready: "yes" }).ready, false);
  });

  test("destroying the run counts its records, deletes every one of them, and no other run's", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    w.seedDraw("amara", "w2", { pack: W2.markets });
    w.world.db.seed("coursePacksAndCases/another-run__chloe__co-1", { runId: "another-run", uid: "chloe", blockId: "co-1", kind: "pack", packId: "pk-1" });
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(w.world.courseDb);
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const counts = await w.lib.courseDeletion.countRunDestroyTargets(db, run);
    assert.equal(counts.packsAndCases, 3);
    const result = await w.lib.courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.packsAndCases, 3);
    assert.deepEqual(w.records(), ["coursePacksAndCases/another-run__chloe__co-1"]);
  });

  test("the records drain with the run's leaves, before the weeks they name, and the destroy dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("packsAndCases") > -1 && order.indexOf("packsAndCases") < order.indexOf("groups"));
    assert.ok(order.indexOf("packsAndCases") < order.indexOf("weeks"));
    assert.match(table, /drainQuery\(db, COURSE_PACKS_AND_CASES_COLLECTION, byRunId\(COURSE_PACKS_AND_CASES_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /packsAndCases: \{\s*label: "Packs, cases and ready marks",\s*fate: "destroyed",/);
  });

  test("deleting an account deletes every record of theirs, on every run, and nobody else's", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    w.seedDraw("chloe", "w2", { pack: W2.markets });
    w.seedDraw("kofi", "w3", { pack: W3.markets });
    w.world.db.seed("coursePacksAndCases/another-run__chloe__co-1", { runId: "another-run", uid: "chloe", blockId: "co-1", kind: "pack", packId: "pk-1" });
    assert.equal(await w.lib.accountDeletion.deleteCoursePacksAndCases(w.world.courseDb, "chloe"), 4);
    assert.deepEqual(w.records(), [`coursePacksAndCases/${RUN.agi}__kofi__${W3.given}`]);
    assert.equal(await w.lib.accountDeletion.deleteCoursePacksAndCases(w.world.courseDb, "farah"), 0);
  });

  test("the account's cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*coursePacksAndCasesDeleted: number;/m);
    assert.match(source, /^\s*coursePacksAndCasesDeleted: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.coursePacksAndCasesDeleted = await deleteCoursePacksAndCases\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assert.match(source, /return deleteOwnedCourseRows\(db, COURSE_PACKS_AND_CASES_COLLECTION, uid\);/);
  });

  test("a person's own records are read by their own uid, held to the week's blocks as they are now", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    // A pack and a case the week no longer has are read as none.
    w.seedDraw("chloe", "w2", { pack: "w2-gone", caseId: "w2-gone-too" });
    const weeks = ["w02", "w03"].map((id) => ({ id, blocks: w.world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`).blocks }));
    const own = await w.lib.readers.readOwnPacksAndCases(w.world.courseDb, RUN.agi, "chloe", weeks);
    assert.deepEqual(own.get("w03"), { packs: { [W3.given]: W3.elections }, cases: { [W3.caseStudy]: W3.surprise }, ready: [W3.caseStudy] });
    assert.deepEqual(own.get("w02"), { packs: {}, cases: {}, ready: [] });
    // Kofi's read finds nothing of Chloe's.
    const kofi = await w.lib.readers.readOwnPacksAndCases(w.world.courseDb, RUN.agi, "kofi", weeks);
    assert.deepEqual(kofi.get("w03"), { packs: {}, cases: {}, ready: [] });
    // A row at a record's address that names another run is not this run's record.
    w.world.db.seed(`coursePacksAndCases/${RUN.agi}__kofi__${W3.given}`, { runId: "another-run", uid: "kofi", blockId: W3.given, kind: "pack", packId: W3.markets });
    const stray = await w.lib.readers.readOwnPacksAndCases(w.world.courseDb, RUN.agi, "kofi", weeks);
    assert.deepEqual(stray.get("w03").packs, {});
  });
});

// ---------------------------------------------------------------------------
// 2. Choose one on the week page
// ---------------------------------------------------------------------------

describe("2. Choose one on the week page", () => {
  test("a pack given out shows as the person's own, open, with its tick; the line says who gives them and who to ask", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const { html, text } = await w.weekPage("chloe", 3);
    inOrder(text, [
      "Your pack",
      "Packs",
      "Given out at the end of session 2. Only your pack counts. To switch, ask Rahul, Sofia or Farah.",
      "Elections",
      "Your pack",
      "25 minutes · 2 sources",
      "Markets",
      "Technology",
    ]);
    // Chloe's pack is open with one tick; the others are closed and have none.
    assert.match(html, /<details class="pack packMine" open=""><summary class="packSummary"><span class="packHead"><span class="packName">Elections<\/span><span class="chip">Your pack<\/span>/);
    assert.equal((html.match(/<details class="pack">/g) ?? []).length, 2);
    assert.equal((html.match(/type="checkbox"[^>]*aria-label="Done: Elections"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /aria-label="Done: (?:Markets|Technology)"/);
  });

  test("before a pack is given out, the packs are listed and none is the person's", async () => {
    const { html, text } = await w.weekPage("kofi", 3);
    assert.match(text, /Given out at the end of session 2\. Only your pack counts\. To switch, ask Rahul, Sofia or Farah\./);
    assert.doesNotMatch(html, /packMine/);
    assert.doesNotMatch(html, /<span class="chip">Your pack<\/span>/);
  });

  test("a facilitator with no place of their own takes part as themselves: their pack shows as theirs", async () => {
    w.seedDraw("rahul", "w3", { pack: W3.technology });
    const { html } = await w.weekPage("rahul", 3);
    assert.match(html, /<details class="pack packMine" open=""><summary class="packSummary"><span class="packHead"><span class="packName">Technology<\/span><span class="chip">Your pack<\/span>/);
  });

  test("a facilitator who takes part is not told to ask themselves", async () => {
    w.seedDraw("farah", "w3", { pack: W3.markets });
    const { text } = await w.weekPage("farah", 3);
    assert.match(text, /To switch, ask Rahul or Sofia\./);
    assert.doesNotMatch(text, /ask Rahul, Sofia or Farah/);
  });

  test("a fellow picks a pack on their own page, changes it until the session starts, and then it stays", async () => {
    let answer = await w.pick("chloe", W3.picked, "w03", W3.atWork);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.record, { blockId: W3.picked, weekId: "w03", packId: W3.atWork, caseId: null, ready: false });
    assert.equal(w.recordOf("chloe", W3.picked).packId, W3.atWork);
    assert.equal(w.recordOf("chloe", W3.picked).kind, "pack");
    // Changed, before the session.
    answer = await w.pick("chloe", W3.picked, "w03", W3.inPublic);
    assert.equal(answer.status, 200);
    assert.equal(w.recordOf("chloe", W3.picked).packId, W3.inPublic);
    // The page shows it chosen, with its tick and "Done" beside it, and once
    // the page has hydrated each radio takes a press.
    w.ui.hydrated = true;
    let page = await w.weekPage("chloe", 3);
    assert.match(page.html, /<li class="option packMine">/);
    assert.match(page.html, /<input type="radio" class="radio" name="pick-w3-co-2" checked=""\/><span class="optionText"><span class="packName">Forecasting in public<\/span>/);
    assert.equal((page.html.match(/type="radio"[^>]*disabled=""/g) ?? []).length, 0);
    assert.match(page.text, /Forecasting in public if you like writing Read Done/);
    // Group B meets at 6pm: from then on the pick stays as it is.
    w.at("2026-11-17T18:00:00Z");
    answer = await w.pick("chloe", W3.picked, "w03", W3.atWork);
    assert.deepEqual([answer.status, answer.body.error], [409, "Your session has started, so your choice stays as it is."]);
    assert.equal(w.recordOf("chloe", W3.picked).packId, W3.inPublic);
    page = await w.weekPage("chloe", 3);
    assert.match(page.text, /Your session has started, so your choice stays as it is\./);
    // The radios are drawn, and none takes a press.
    assert.equal((page.html.match(/type="radio" class="radio" disabled=""/g) ?? []).length, 2);
  });

  test("a pack a facilitator gives out cannot be picked, and a pack or a block the week does not have is refused", async () => {
    let answer = await w.pick("chloe", W3.given, "w03", W3.markets);
    assert.equal(answer.status, 403);
    assert.equal(answer.body.error, "Your facilitators give these out. To switch, ask one of them.");
    answer = await w.pick("chloe", W3.picked, "w03", W3.elections);
    assert.equal(answer.status, 404, "a pack of another Choose one");
    answer = await w.pick("chloe", "w3-nothing", "w03", W3.atWork);
    assert.equal(answer.status, 404);
    answer = await w.pick("chloe", W3.picked, "w02", W3.atWork);
    assert.equal(answer.status, 404, "a block of another week");
    assert.deepEqual(w.records(), []);
  });

  test("the body is checked before anything is read", async () => {
    for (const body of [{}, { weekId: "w03" }, { weekId: "week 3", packId: W3.atWork }, { weekId: "w03", packId: W3.atWork, ready: true }, { weekId: "w03", packId: "" }, { weekId: "w03", ready: "yes" }]) {
      const answer = await w.call("chloe", w.routes.mine.PUT, { runId: RUN.agi, blockId: W3.picked }, { course: true, body });
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
  });

  test("only somebody taking part picks, and only for themselves", async () => {
    // Somebody who left, somebody taken off, somebody not told, nobody, the lead, another programme's lead,
    // the run's track lead and an admin pick nothing.
    for (const who of ["sam", "omar", "una", "nobody", "claudia", "tess", "yusuf", "zach"]) {
      const answer = await w.pick(who, W3.picked, "w03", W3.atWork);
      assert.equal(answer.status, 403, who);
    }
    assert.equal((await w.pick(null, W3.picked, "w03", W3.atWork)).status, 401);
    // View-as is refused before anything else.
    assert.equal((await w.pick("chloe", W3.picked, "w03", W3.atWork, { viewAs: true })).status, 403);
    assert.deepEqual(w.records(), []);
    // A facilitator takes part as themselves; their record is their own.
    assert.equal((await w.pick("rahul", W3.picked, "w03", W3.atWork)).status, 200);
    assert.deepEqual(w.records(), [`coursePacksAndCases/${RUN.agi}__rahul__${W3.picked}`]);
  });

  test("done counts only the pack the person has: its tick, and nothing until they have one", async () => {
    const { taskNeeds, taskDone, handedTaskDone } = w.lib.progress;
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const task = blocks[0].rows[0];
    const needs = taskNeeds(blocks, task);
    assert.deepEqual(needs.chooseOneIds, [W3.given]);
    assert.deepEqual(needs.unseenIds, []);
    const ticked = new Set(needs.tickIds);
    const written = new Set(needs.promptIds);
    const base = { isTicked: (id) => ticked.has(id), isWritten: (id) => written.has(id) };
    // No pack: not done, whatever else is ticked.
    assert.equal(taskDone(needs, base), false);
    assert.equal(taskDone(needs, { ...base, packOf: () => null }), false);
    // A pack, not ticked: not done. Another pack ticked: still not done.
    ticked.add(W3.markets);
    assert.equal(taskDone(needs, { ...base, packOf: () => W3.elections }), false);
    // Their own pack ticked: done.
    ticked.add(W3.elections);
    assert.equal(taskDone(needs, { ...base, packOf: () => W3.elections }), true);
    // As the overview hands it.
    assert.equal(handedTaskDone({ needs, written: [...written], packs: { [W3.given]: W3.elections } }, (id) => ticked.has(id)), true);
    assert.equal(handedTaskDone({ needs, written: [...written], packs: {} }, (id) => ticked.has(id)), false);
  });

  test("the overview hands the person their own packs, and each task the pack it needs", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    await w.pick("chloe", W3.picked, "w03", W3.atWork);
    const answer = await w.overview("chloe");
    const week3 = answer.body.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual(week3.picks, { packs: { [W3.given]: W3.elections, [W3.picked]: W3.atWork }, cases: {}, ready: [], open: true });
    const [task] = week3.thisWeek.rows;
    assert.deepEqual(task.packs, { [W3.given]: W3.elections });
    assert.deepEqual(answer.body.askToSwap, ["Rahul", "Sofia", "Farah"]);
    // Kofi's overview carries nothing of Chloe's.
    const kofi = await w.overview("kofi");
    assert.deepEqual(kofi.body.weeks.find((week) => week.weekNumber === 3).picks, { packs: {}, cases: {}, ready: [], open: true });
    // Week 2's session is over: its picks are shut.
    assert.equal(answer.body.weeks.find((week) => week.weekNumber === 2).picks.open, false);
    // Staff with no part in the run read no picks: an admin's overview has none.
    const zach = await w.overview("zach");
    assert.equal(zach.body.weeks.find((week) => week.weekNumber === 3).picks, null);
    assert.deepEqual(zach.body.askToSwap, []);
  });

  test("the week page counts the pack: done once the person's own pack is ticked, with every box written", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const needs = w.lib.progress.taskNeeds(blocks, blocks[0].rows[0]);
    // The page reads Chloe's rows through my-exercises: write the boxes through the real route.
    for (const promptId of needs.promptIds) {
      const answer = await w.call("chloe", (await w.courseRoute("runs", "[runId]", "reflections", "[promptId]")).PUT, { runId: RUN.agi, promptId }, { course: true, body: { weekId: "w03", text: "Written." } });
      assert.equal(answer.status, 200);
    }
    const home = await w.programmeHome("chloe", [...needs.tickIds]);
    assert.match(home.text, /This week 0 of 3 done/, "the pack is not ticked yet");
    const done = await w.programmeHome("chloe", [...needs.tickIds, W3.elections]);
    assert.match(done.text, /This week 1 of 3 done/);
    // The week page counts it the same way, from the pack it was handed.
    assert.match((await w.weekPage("chloe", 3, [...needs.tickIds])).text, /This week 0 of 3 done/);
    assert.match((await w.weekPage("chloe", 3, [...needs.tickIds, W3.elections])).text, /This week 1 of 3 done/);
    // Home lists Chloe's pack among the rows to tick, and no other pack.
    const card = await w.homeCard("chloe");
    assert.match(card.text, /Elections/);
    assert.doesNotMatch(card.text, /Markets|Technology/);
  });

  test("staff read the packs with no tick, no radio and no pack marked as theirs", async () => {
    const { html, text } = await w.weekPage("zach", 3);
    assert.match(text, /Elections/);
    assert.doesNotMatch(html, /type="radio"/);
    assert.doesNotMatch(html, /packMine/);
    assert.doesNotMatch(text, /To switch, ask/);
  });

  test("the words a week's own titles make", () => {
    const words = w.lib.words;
    assert.equal(words.packsEyebrowWords("Pathway"), "Pathway packs");
    assert.equal(words.packsEyebrowWords("Pack"), "Packs");
    assert.equal(words.yourPackWords("Pathway"), "Your pathway");
    assert.equal(words.givenPacksLineWords(3, "Pathway", ["Rahul", "Sofia"]), "Given out at the end of session 2. Only your pathway counts. To switch, ask Rahul or Sofia.");
    assert.equal(words.givenPacksLineWords(1, "Pathway", []), "Only your pathway counts.");
    assert.equal(words.packMetaWords("32 minutes", 2), "32 minutes · 2 sources");
    assert.equal(words.packMetaWords("", 1), "1 source");
    assert.equal(textOf("<p>a &amp; b</p>"), "a & b");
  });
});


// ---------------------------------------------------------------------------
// 3. The draw
// ---------------------------------------------------------------------------

/** Each `<select>` on a page, as its options' words, the chosen one first-marked with `*`. */
function selects(html) {
  return [...html.matchAll(/<select[^>]*>(.*?)<\/select>/g)].map(([whole, inner]) => ({
    disabled: /<select[^>]* disabled=""/.test(whole),
    options: [...inner.matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, , chosen, words]) => `${chosen ? "*" : ""}${words}`),
  }));
}

describe("3. the draw", () => {
  test("the draw page: the week of the group's next session, a row per person and their facilitators, as the board draws it", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    const page = await w.drawPage("rahul");
    assert.equal(page.to, null);
    inOrder(page.text, [
      "Group B",
      "Packs and cases",
      "Group B · after session 2",
      "Week 3 · Packs and cases",
      "Copy in the slips you handed out tonight.",
      "Swap two people",
      "Chloe Nguyen",
      "Farah Hussain",
      "Kofi Asante",
      "Rahul Mehta",
      "Sofia Rossi",
      "Save",
      "Each person sees theirs on their week 3 page. No email.",
    ]);
    const lists = selects(page.html);
    assert.equal(lists.length, 10, "a pack and a case for each of five people");
    // Chloe has both: no "Not given yet", and one case for Elections (the other has a content note).
    assert.deepEqual(lists[0].options, ["*Elections", "Markets", "Technology"]);
    assert.deepEqual(lists[1].options, ["*The surprise result, 2016"]);
    // Farah has nothing yet: "Not given yet", and "Choose a pack first" for the case, which takes no press.
    assert.deepEqual(lists[2].options, ["*Not given yet", "Elections", "Markets", "Technology"]);
    assert.deepEqual(lists[3], { disabled: true, options: ["*Choose a pack first"] });
    // Labels are real, one per select.
    assert.equal((page.html.match(/<label class="drawLabel" for="/g) ?? []).length, 10);
    // Nobody who left, and nobody of another group.
    assert.doesNotMatch(page.text, /Sam Whitfield|Omar Haddad|Amara Okafor/);
    // Save waits for the page to be live.
    assert.match(page.html, /<button type="button" class="buttonPrimary saveButton" disabled="">Save<\/button>/);
  });

  test("a case with a content note is never in the draw: no list offers it, and the route refuses it", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const page = await w.drawPage("rahul");
    assert.doesNotMatch(page.html, /The close call, 2019/);
    const answer = await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.closeCall]]);
    assert.equal(answer.status, 400);
    assert.equal(answer.body.error, "Chloe Nguyen’s case isn’t one their list offers. Choose one of its cases, or leave it not given yet.");
    assert.equal(w.recordOf("chloe", W3.caseStudy), null);
    // The model says the same.
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const talk = w.lib.model.drawTalkOf(blocks, w.lib.model.talksOf(blocks).find((t) => t.id === W3.caseStudy));
    const options = w.lib.model.caseOptions(talk, () => W3.elections);
    assert.deepEqual(options, { kind: "cases", cases: [{ id: W3.surprise, title: "The surprise result, 2016" }] });
  });

  test("the group's facilitator copies the slips in: packs, then each pack's cases; nobody is emailed", async () => {
    const answer = await w.saveDraw("rahul", "w03", [
      ["chloe", W3.given, W3.elections],
      ["chloe", W3.caseStudy, W3.surprise],
      ["kofi", W3.given, W3.markets],
      ["kofi", W3.caseStudy, W3.crash],
    ]);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, saved: 4 });
    assert.deepEqual(
      { packId: w.recordOf("chloe", W3.given).packId, kind: w.recordOf("chloe", W3.given).kind, weekId: w.recordOf("chloe", W3.given).weekId },
      { packId: W3.elections, kind: "pack", weekId: "w03" },
    );
    assert.equal(w.recordOf("kofi", W3.caseStudy).caseId, W3.crash);
    assert.equal(w.recordOf("kofi", W3.caseStudy).ready, false);
    assert.equal(w.world.mail.length, 0);
    // Saving the same again changes nothing.
    const again = await w.saveDraw("rahul", "w03", [["chloe", W3.given, W3.elections]]);
    assert.deepEqual(again.body, { ok: true, saved: 0 });
  });

  test("each case list offers only its pack's cases, as the person's packs stand once the save is applied", async () => {
    // A Markets case for somebody given Elections in the same save.
    let answer = await w.saveDraw("rahul", "w03", [
      ["kofi", W3.given, W3.elections],
      ["kofi", W3.caseStudy, W3.crash],
    ]);
    assert.equal(answer.status, 400);
    // A case before any pack.
    answer = await w.saveDraw("rahul", "w03", [["kofi", W3.caseStudy, W3.crash]]);
    assert.equal(answer.status, 400);
    assert.deepEqual(w.records(), []);
    // A pack changed while the case it had stays: refused, the case no longer fits.
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    answer = await w.saveDraw("rahul", "w03", [["chloe", W3.given, W3.markets]]);
    assert.equal(answer.status, 400);
    assert.equal(w.recordOf("chloe", W3.given).packId, W3.elections);
    // The pack and a case of it together: saved, and the ready mark, which was for the old case, is cleared.
    answer = await w.saveDraw("rahul", "w03", [
      ["chloe", W3.given, W3.markets],
      ["chloe", W3.caseStudy, W3.crash],
    ]);
    assert.equal(answer.status, 200);
    assert.deepEqual([w.recordOf("chloe", W3.caseStudy).caseId, w.recordOf("chloe", W3.caseStudy).ready], [W3.crash, false]);
    // Taken back: "Not given yet".
    answer = await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, null]]);
    assert.equal(answer.status, 200);
    assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, null);
  });

  test("swapping two people is one save of what each now has", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    w.seedDraw("kofi", "w3", { pack: W3.markets, caseId: W3.crash });
    const answer = await w.saveDraw("sofia", "w03", [
      ["chloe", W3.given, W3.markets],
      ["chloe", W3.caseStudy, W3.crash],
      ["kofi", W3.given, W3.elections],
      ["kofi", W3.caseStudy, W3.surprise],
    ]);
    assert.equal(answer.status, 200);
    assert.deepEqual(
      [w.recordOf("chloe", W3.given).packId, w.recordOf("chloe", W3.caseStudy).caseId, w.recordOf("kofi", W3.given).packId, w.recordOf("kofi", W3.caseStudy).caseId],
      [W3.markets, W3.crash, W3.elections, W3.surprise],
    );
    // The page's own swap: the button opens two real selects and "Swap them".
    const page = await w.drawPage("sofia");
    assert.match(page.html, /<button type="button" class="buttonGhost swapButton">Swap two people<\/button>/);
  });

  test("who may type the draw: the group's live facilitators, a facilitator who takes part, the programme's lead and admins", async () => {
    for (const who of ["rahul", "sofia", "farah", "claudia", "zach"]) {
      w.reset();
      const answer = await w.saveDraw(who, "w03", [["kofi", W3.given, W3.markets]]);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      assert.equal(w.recordOf("kofi", W3.given).packId, W3.markets, who);
    }
    // Another group's facilitator, the people in the group, another group's, somebody who left,
    // another programme's lead, the run's track lead, its reviewer and somebody on nothing type nothing.
    for (const who of ["grace", "tom", "chloe", "kofi", "amara", "sam", "tess", "yusuf", "lloyd", "nobody"]) {
      w.reset();
      const answer = await w.saveDraw(who, "w03", [["kofi", W3.given, W3.markets]]);
      assert.deepEqual([answer.status, answer.body.error], [403, "Forbidden"], who);
      assert.deepEqual(w.records(), [], who);
    }
    assert.equal((await w.saveDraw(null, "w03", [["kofi", W3.given, W3.markets]])).status, 401);
    // View-as is refused before anything is read.
    assert.equal((await w.saveDraw("rahul", "w03", [["kofi", W3.given, W3.markets]], { viewAs: true })).status, 403);
    assert.deepEqual(w.records(), []);
  });

  test("a facilitator who takes part is given a pathway like anybody, by a co-facilitator", async () => {
    const answer = await w.saveDraw("sofia", "w03", [["farah", W3.given, W3.technology]]);
    assert.equal(answer.status, 200);
    // The spread shows it to the group's facilitators: the draw is the group's logistics.
    const group = await w.groupPage("rahul");
    assert.match(group.text, /Technology 1 FH Farah/);
  });

  test("only the group's own people are in its draw: nobody who left, nobody another group holds, nobody not told", async () => {
    // Sam left Group A.
    let answer = await w.saveDraw("sofia", "w03", [["sam", W3.given, W3.markets]], { groupId: A });
    assert.deepEqual([answer.status, answer.body.error], [409, "Somebody you named isn’t in Group A any more. Reload the page."]);
    // Amara is in Group A, not B.
    answer = await w.saveDraw("rahul", "w03", [["amara", W3.given, W3.markets]]);
    assert.equal(answer.status, 409);
    // Una is placed in Group C and not told: not in Tom's draw.
    answer = await w.saveDraw("tom", "w03", [["una", W3.given, W3.markets]], { groupId: C });
    assert.equal(answer.status, 409);
    assert.deepEqual(w.records(), []);
    const page = await w.drawPage("tom", C);
    assert.doesNotMatch(page.text, /Una Byrne/);
    assert.match(page.text, /Hamza Qureshi/);
  });

  test("an archived group's draw is closed: its page sends its facilitators away, and nothing on it changes", async () => {
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await w.drawPage("rahul")).to, "/learn");
    assert.equal((await w.drawPage("zach")).to, "/learn");
    let answer = await w.saveDraw("rahul", "w03", [["kofi", W3.given, W3.markets]]);
    assert.equal(answer.status, 403);
    answer = await w.saveDraw("zach", "w03", [["kofi", W3.given, W3.markets]]);
    assert.deepEqual([answer.status, answer.body.error], [409, "Group B is archived, so nothing on it changes."]);
    assert.deepEqual(w.records(), []);
  });

  test("the body is checked before anything is read, and a week with nothing given out refuses", async () => {
    for (const body of [
      {},
      { weekId: "w03" },
      { weekId: "w03", entries: [] },
      { weekId: "week three", entries: [{ uid: "kofi", blockId: W3.given, value: W3.markets }] },
      { weekId: "w03", entries: [{ uid: "kofi", blockId: W3.given }] },
      { weekId: "w03", entries: [{ uid: "kofi", blockId: W3.given, value: 3 }] },
      { weekId: "w03", entries: [{ uid: "kofi", blockId: W3.given, value: W3.markets }, { uid: "kofi", blockId: W3.given, value: W3.elections }] },
    ]) {
      const answer = await w.call("rahul", w.routes.draw.PUT, { groupId: B }, { course: true, body });
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
    // Week 1 gives nothing out.
    let answer = await w.saveDraw("rahul", "w01", [["kofi", W3.given, W3.markets]]);
    assert.deepEqual([answer.status, answer.body.error], [404, "Nothing is given out in week 1. Reload the page."]);
    // A Choose one each person picks is not the draw's.
    answer = await w.saveDraw("rahul", "w03", [["kofi", W3.picked, W3.atWork]]);
    assert.equal(answer.status, 400);
    // A pack of another week's Choose one.
    answer = await w.saveDraw("rahul", "w03", [["kofi", W3.given, W2.markets]]);
    assert.equal(answer.status, 400);
    assert.deepEqual(w.records(), []);
    const page = await w.drawPage("rahul", B, 1);
    assert.match(page.text, /Week 1 Nothing is given out in week 1\./);
  });

  test("who reaches the draw page: the group's facilitators, the lead by its address, and admins; everybody else is sent away", async () => {
    for (const who of ["rahul", "sofia", "farah", "zach"]) {
      const page = await w.drawPage(who);
      assert.equal(page.to, null, who);
      assert.match(page.html, new RegExp(`href="/learn/${RUN.agi}/group/${B}" class="back"`), who);
    }
    // The lead goes back to their programme's Groups.
    const lead = await w.drawPage("claudia");
    assert.equal(lead.to, null);
    assert.match(lead.html, /href="\/admin\/admissions\/forms\/[^"]+\/programmes\/[^"]+\/groups" class="back"><svg[^>]*>.*?<\/svg><span>Groups<\/span>/);
    for (const who of ["grace", "tom", "chloe", "amara", "sam", "tess", "yusuf", "lloyd", "nobody"]) {
      const page = await w.drawPage(who);
      assert.equal(page.to, "/learn", who);
    }
    assert.match((await w.drawPage(null)).to, /^\/login\?next=/);
    assert.equal((await w.drawPage("zach", "no-such-group")).to, "/learn");
  });

  test("the group page's spread: each pack with who has it, who has nothing yet, and the way to the draw", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    w.seedDraw("kofi", "w3", { pack: W3.elections });
    w.seedDraw("farah", "w3", { pack: W3.markets });
    const group = await w.groupPage("rahul");
    inOrder(group.text, ["Packs in Group B", "Elections 2", "Chloe and Kofi", "Markets 1", "Farah", "Technology 0", "Not given yet: Rahul and Sofia", "Change packs and cases"]);
    assert.match(group.html, new RegExp(`href="/learn/draw/${B}\\?week=3"`));
    // An admin sees it too; a group whose next week gives nothing out has none.
    assert.match((await w.groupPage("zach")).text, /Packs in Group B/);
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w03`, { blocks: w.world.db.read(`courseRuns/${RUN.agi}/weeks/w01`).blocks });
    assert.doesNotMatch((await w.groupPage("rahul")).text, /Packs in Group B|Change packs and cases/);
  });

  test("the draw's words", () => {
    const words = w.lib.words;
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const draw = w.lib.model.drawOf(blocks);
    assert.equal(words.drawTitleWords(draw), "Packs and cases");
    assert.equal(words.drawTitleWords({ packs: [{ title: "Pathway" }], cases: [{}] }), "Pathways and cases");
    assert.equal(words.drawTitleWords({ packs: [{ title: "Plan" }], cases: [] }), "Plans");
    assert.equal(words.drawTitleWords({ packs: [], cases: [{}] }), "Cases");
    assert.equal(words.changeDrawWords({ packs: [{ title: "Pathway" }], cases: [{}] }), "Change pathways and cases");
    assert.equal(words.spreadTitleWords({ packs: [{ title: "Pathway" }], cases: [] }, "Group B"), "Pathways in Group B");
    assert.equal(words.choosePackFirstWords("Pathway"), "Choose a pathway first");
    assert.equal(words.drawEyebrowWords("Group B", 3), "Group B · after session 2");
    assert.equal(words.drawFootWords(3), "Each person sees theirs on their week 3 page. No email.");
    void D;
  });
});

// ---------------------------------------------------------------------------
// 4. Your case study
// ---------------------------------------------------------------------------

describe("4. Your case study", () => {
  test("the case given: its pack, name, what happened, where to start, who to ask to swap, and the ready box", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    const { html, text } = await w.weekPage("chloe", 3);
    inOrder(text, [
      "Your case study: a 3-minute talk on a case from your pack",
      "Your case: The surprise result, 2016",
      "Not ready yet",
      "Your case study",
      "You get a case from your pack at the end of the previous session.",
      "Your case",
      "Elections",
      "The surprise result, 2016",
      "Most polls pointed the other way.",
      "Start here",
      "A summary (2 min) and a review",
      "Given out at the end of session 2. To swap, ask Rahul, Sofia or Farah.",
      "Ready for my talk",
      "Prepare a 3-minute talk: the three questions",
      "All 3 cases this week",
      "Elections",
      "2 cases",
      "Your pack",
      "The surprise result, 2016",
      "Your case",
    ]);
    // Chloe's pack's group is open; the other is closed.
    assert.match(html, /<details class="caseGroup caseGroupMine" open="">/);
    assert.equal((html.match(/<details class="caseGroup">/g) ?? []).length, 1);
    // The ready box is a real checkbox with its words as its label.
    assert.match(html, /<label class="readyRow" for="[^"]+"><span class="tickBox"><input id="[^"]+" type="checkbox" class="tickInput"[^>]*\/>/);
    // "On this page" lists the case study.
    inOrder(text, ["On this page", "Your case study", "In the session"]);
  });

  test("before a case is given: \"Not given yet\", when it is given out, and no ready box to press", async () => {
    w.ui.hydrated = true;
    const { html, text } = await w.weekPage("kofi", 3);
    inOrder(text, ["Your case: Not given yet", "Not ready yet", "Your case study", "Your case", "Not given yet", "Given out at the end of session 2.", "Ready for my talk"]);
    assert.doesNotMatch(text, /Given out at the end of session 2\. To swap/);
    assert.match(html, /type="checkbox" class="tickInput" disabled=""/);
    assert.doesNotMatch(html, /caseGroupMine/);
    // Before a pack, nothing is marked as Kofi's pack's.
    assert.doesNotMatch(html, /<span class="chip">Your pack<\/span>/);
  });

  test("Ready for my talk: the person's own mark, saved, counted, and taken back", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    let answer = await w.markReady("chloe", W3.caseStudy, "w03", true);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.record, { blockId: W3.caseStudy, weekId: "w03", packId: null, caseId: W3.surprise, ready: true });
    assert.equal(w.recordOf("chloe", W3.caseStudy).ready, true);
    // The case is kept: marking ready never touches it.
    assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, W3.surprise);
    // Counted: the case study's task is done.
    let page = await w.weekPage("chloe", 3);
    assert.match(page.text, /This week 1 of 3 done/);
    assert.match(page.html, /type="checkbox" class="tickInput"[^>]*checked=""/);
    assert.doesNotMatch(page.text, /Your case: The surprise result, 2016 Not ready yet/);
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /This week 1 of 3 done/);
    assert.match(home.text, /Done: Your case talk The surprise result, 2016 Done/);
    // Taken back.
    answer = await w.markReady("chloe", W3.caseStudy, "w03", false);
    assert.equal(answer.status, 200);
    assert.equal(w.recordOf("chloe", W3.caseStudy).ready, false);
    home = await w.programmeHome("chloe");
    assert.match(home.text, /Not done yet: Your case talk The surprise result, 2016 Not ready yet/);
  });

  test("ready waits for a case on a case study, and a pitch with no cases can be marked any time", async () => {
    let answer = await w.markReady("kofi", W3.caseStudy, "w03", true);
    assert.deepEqual([answer.status, answer.body.error], [409, "You haven’t been given a case yet."]);
    assert.equal(w.recordOf("kofi", W3.caseStudy), null);
    answer = await w.markReady("kofi", W3.pitch, "w03", true);
    assert.equal(answer.status, 200);
    assert.deepEqual({ kind: w.recordOf("kofi", W3.pitch).kind, ready: w.recordOf("kofi", W3.pitch).ready }, { kind: "talk", ready: true });
    const page = await w.weekPage("kofi", 3);
    assert.match(page.text, /Ready for my pitch/);
    // A block that is not a talk is refused.
    answer = await w.markReady("kofi", W3.given, "w03", true);
    assert.equal(answer.status, 404);
  });

  test("only the person marks their own: nobody else's, and nobody who is not taking part", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    for (const who of ["sam", "omar", "una", "nobody", "claudia", "tess", "yusuf", "zach"]) {
      assert.equal((await w.markReady(who, W3.caseStudy, "w03", true)).status, 403, who);
    }
    assert.equal((await w.markReady(null, W3.caseStudy, "w03", true)).status, 401);
    assert.equal((await w.markReady("chloe", W3.caseStudy, "w03", true, { viewAs: true })).status, 403);
    // Kofi marking a talk ready touches only Kofi's record.
    assert.equal((await w.markReady("kofi", W3.pitch, "w03", true)).status, 200);
    assert.equal(w.recordOf("chloe", W3.caseStudy).ready, false);
  });

  test("a facilitator who takes part is given a case like anybody and marks their own ready, which their co-facilitators never see", async () => {
    assert.equal((await w.saveDraw("sofia", "w03", [["farah", W3.given, W3.markets], ["farah", W3.caseStudy, W3.crash]])).status, 200);
    let page = await w.weekPage("farah", 3);
    inOrder(page.text, ["Your case", "Markets", "The crash nobody priced, 2008", "Given out at the end of session 2. To swap, ask Rahul or Sofia."]);
    assert.equal((await w.markReady("farah", W3.caseStudy, "w03", true)).status, 200);
    page = await w.weekPage("farah", 3);
    assert.match(page.html, /type="checkbox" class="tickInput"[^>]*checked=""/);
    // Neither the group page nor the draw page says who is ready.
    for (const shown of [await w.groupPage("rahul"), await w.drawPage("rahul"), await w.groupPage("sofia")]) {
      assert.doesNotMatch(shown.text, /Ready for my|ready/i);
    }
  });

  test("somebody who left keeps nothing: no week page, no case, no mark", async () => {
    w.seedDraw("sam", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    assert.equal((await w.weekShell("sam", 3)).to, "/learn");
    assert.equal((await w.overview("sam")).status, 403);
    // The record stays for the lead and admins: leaving deletes nothing.
    assert.equal(w.recordOf("sam", W3.caseStudy).caseId, W3.surprise);
  });

  test("staff read the cases with no case of their own and no ready box", async () => {
    const { text } = await w.weekPage("zach", 3);
    assert.match(text, /All 3 cases this week/);
    assert.doesNotMatch(text, /Ready for my talk|Your case: /);
  });

  test("the overview hands each talk's task its line: whether it has cases, the case given and the mark", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    const answer = await w.overview("chloe");
    const rows = answer.body.weeks.find((week) => week.weekNumber === 3).thisWeek.rows;
    const talkTask = rows.find((row) => row.type === "task" && row.needs.talkIds.length > 0);
    assert.deepEqual(talkTask.talk, { hasCases: true, caseTitle: "The surprise result, 2016", ready: true });
    assert.deepEqual(talkTask.ready, [W3.caseStudy]);
    assert.deepEqual(answer.body.weeks.find((week) => week.weekNumber === 3).picks.cases, { [W3.caseStudy]: W3.surprise });
  });

  test("the talk's words", () => {
    const words = w.lib.words;
    assert.equal(words.readyWords({ minutes: 3, name: "talk" }), "Ready for my talk");
    assert.equal(words.readyWords({ minutes: 2, name: "pitch" }), "Ready for my pitch");
    assert.equal(words.readyWords(null), "Ready for my talk");
    assert.equal(words.givenCaseLineWords(3, ["Rahul", "Sofia"]), "Given out at the end of session 2. To swap, ask Rahul or Sofia.");
    assert.equal(words.allCasesWords(22), "All 22 cases this week");
    assert.equal(words.casesWords(8), "8 cases");
  });
});

// ---------------------------------------------------------------------------
// 5. This week's work: the pathway and case columns
// ---------------------------------------------------------------------------

describe("5. This week's work: the pathway and case columns", () => {
  /** The cells `who` is shown for Group B's week 3, by first name. */
  async function cellsFor(viewer) {
    const group = w.world.db.read(`courseGroups/${B}`);
    const week = await w.lib.readers.readGroupWeek(w.world.courseDb, RUN.agi, B, 3);
    const people = w.lib.readers.drawPeople(
      [
        { uid: "chloe", name: "Chloe Nguyen" },
        { uid: "farah", name: "Farah Hussain" },
        { uid: "kofi", name: "Kofi Asante" },
      ],
      group.facilitatorUids.map((uid) => {
        const name = w.world.db.read(`users/${uid}`).profile.preferredName;
        return { uid, firstName: name.split(" ")[0], name };
      }),
    );
    const out = await w.lib.readers.weekWorkOf(w.world.courseDb, RUN.agi, week, people, viewer);
    return { packTitle: out.packTitle, cells: Object.fromEntries([...out.cells].map(([uid, cell]) => [uid, [cell.pack, cell.case]])) };
  }

  test("given out: the pack's name and the case's title, for every facilitator of the group, the facilitator who takes part included", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    w.seedDraw("farah", "w3", { pack: W3.markets, caseId: W3.crash });
    const facilitator = await cellsFor({ isAdmin: false, leadOf: null });
    assert.equal(facilitator.packTitle, "Pack");
    assert.deepEqual(facilitator.cells.chloe, ["Elections", "The surprise result, 2016"]);
    assert.deepEqual(facilitator.cells.farah, ["Markets", "The crash nobody priced, 2008"]);
    assert.deepEqual(facilitator.cells.kofi, [null, null]);
    // Nothing of a ready mark travels: a cell is a pack's name and a case's title.
    const week = await w.lib.readers.readGroupWeek(w.world.courseDb, RUN.agi, B, 3);
    const chloe = { uid: "chloe", name: "Chloe Nguyen", firstName: "Chloe", facilitates: false };
    const out = await w.lib.readers.weekWorkOf(w.world.courseDb, RUN.agi, week, [chloe], { isAdmin: false, leadOf: null });
    assert.deepEqual(Object.keys(out.cells.get("chloe")).sort(), ["case", "pack"]);
  });

  test("picked by each person: a facilitator who takes part keeps theirs from their co-facilitators; the lead and admins see it", async () => {
    // Week 3's first Choose one made one each person picks.
    const stored = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
    const blocks = structuredClone(stored.blocks);
    const part = blocks.find((block) => block.type === "part" && block.blocks.some((child) => child.id === W3.given));
    part.blocks.find((child) => child.id === W3.given).givenBy = "fellow";
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, { ...stored, blocks });
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    const coFacilitator = await cellsFor({ isAdmin: false, leadOf: null });
    assert.deepEqual([coFacilitator.cells.chloe[0], coFacilitator.cells.farah[0]], ["Elections", null]);
    const lead = await cellsFor({ isAdmin: false, leadOf: { roundId: "r", programmeId: "p" } });
    assert.deepEqual([lead.cells.chloe[0], lead.cells.farah[0]], ["Elections", "Markets"]);
    const admin = await cellsFor({ isAdmin: true, leadOf: null });
    assert.equal(admin.cells.farah[0], "Markets");
  });
});
