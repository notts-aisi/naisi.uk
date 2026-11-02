/**
 * The one reader of a week's content (`src/lib/courses/weekBlocks/reader.ts`)
 * and the server-side readers switched onto it, for both shapes of week: a
 * block week and a week written before blocks.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   weekSources, weekWrittenAnswers,          the one reader: the path's sources (every
 *   weekReflectionPrompts, weekChecklistItems  pack's, never Go further), written answers,
 *                                              reflection prompts and checklist items
 *   material-notes route                       a facilitator's note finds a source in blocks
 *   loadReadingList, loadOwnNotes              the reading list and its titles
 *   aggregateRetrospective                     the retrospective's rows
 *   sync-tasks route                           the My Work mirror's card
 *   readExerciseTallies                        finishing's count of written answers
 *   blockWeekAsks, legacyWeekAsks              "Week N is open": what the week asks for
 *   pitching readings                          pitching week's papers
 *
 * Week 3 of AGI Strategy's run (`tests/lib/memberPagesWorld.mjs`) is turned
 * into the synthetic block week (`tests/lib/weekBlocksFixture.mjs`) where a
 * suite needs one; every other week stays as it was written.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { syntheticWeekBlocks, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";
import { NOW, RUN, makeMemberPagesWorld } from "./lib/memberPagesWorld.mjs";
import { makeFinishWorld, RUN as FINISH_RUN } from "./lib/finishWorld.mjs";

const w = await makeMemberPagesWorld("__weekBlocksReader");
const { world, call, courseRoute, loadTs } = w;
const reader = await loadTs(join("lib", "courses", "weekBlocks", "reader.ts"));
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const { aggregateRetrospective } = await loadTs(join("lib", "firestore", "courseTemplates.ts"));
const weekEmails = await loadTs(join("lib", "courses", "weekEmails", "model.ts"));
const weekEmailWords = await loadTs(join("lib", "courses", "weekEmails", "words.ts"));
const { weekTaskNeeds } = await loadTs(join("lib", "courses", "weekBlocks", "progress.ts"));
const leftView = await loadTs(join("lib", "courses", "leftView.ts"));
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const notesRoute = await courseRoute("runs", "[runId]", "material-notes");
const syncRoute = await courseRoute("runs", "[runId]", "sync-tasks");

const finish = await makeFinishWorld("__weekBlocksFinish");

mock.timers.enable({ apis: ["Date"], now: NOW });

const W3 = `courseRuns/${RUN.agi}/weeks/w03`;
const blockWeek = () => courses.normalizeCourseWeek("w03", syntheticWeekDoc());
const legacyWeek = () => courses.normalizeCourseWeek("w03", world.db.read(W3));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. The one reader
// ---------------------------------------------------------------------------

describe("1. the one reader, both shapes", () => {
  test("a block week's sources: its parts' sources and every pack, each pack one source, in page order, never Go further", () => {
    const sources = reader.weekSources(blockWeek());
    assert.deepEqual(sources.map((s) => s.id), ["src-1", "src-7", "src-2", "src-8", "pk-1", "pk-2", "pk-3", "pk-4", "pk-5"]);
    assert.deepEqual(sources.map((s) => s.packId), [null, null, null, null, "pk-1", "pk-2", "pk-3", "pk-4", "pk-5"]);
    assert.deepEqual(sources.map((s) => s.partId), ["pt-1", "pt-1", "pt-2", "pt-2", "pt-3", "pt-3", "pt-3", "pt-5", "pt-5"]);
    assert.deepEqual(sources[4], {
      id: "pk-1",
      title: "Elections",
      url: "https://example.com/polls",
      kindLabel: "Read",
      kind: "read",
      legacyType: null,
      by: "",
      date: "",
      time: "25 minutes",
      minutes: null,
      optional: false,
      packId: "pk-1",
      partId: "pt-3",
      note: "Example Press, “Polls and their errors” (2023), and Example Radio, “A podcast on swing” (2022), from 10 minutes in",
    });
    assert.equal(sources[7].time, "10 to 15 minutes", "a list's one time is each option's");
    assert.deepEqual(sources[2], {
      id: "src-2",
      title: "Overconfidence, explained",
      url: "https://example.org/talk",
      kindLabel: "Watch",
      kind: "watch",
      legacyType: null,
      by: "Example Lectures",
      date: "March 2025",
      time: "About 20 minutes",
      minutes: null,
      optional: false,
      packId: null,
      partId: "pt-2",
      note: "The first half is enough.",
    });
    const goFurther = reader.weekGoFurther(blockWeek());
    assert.equal(goFurther.length, 2);
    for (const item of goFurther) assert.equal(sources.some((s) => s.title === item.title && item.title), false);
  });

  test("a week written before blocks: its materials, every one, as stored", () => {
    const week = legacyWeek();
    assert.deepEqual(
      reader.weekSources(week).map((s) => [s.id, s.legacyType, s.minutes, s.optional, s.kind]),
      week.materials.map((m) => [m.id, m.type, m.estimatedMinutes ?? null, m.optional === true, null]),
    );
  });

  test("written answers: a block week's one, with its words and due rule; otherwise the exercises", () => {
    assert.deepEqual(reader.weekWrittenAnswers(blockWeek()), [
      {
        id: "wa-1",
        prompt: "Will your pack’s question come true by next year?\n\nGive a number.\nGive three reasons, from your pack.",
        boxes: [],
        words: { min: 200, max: 300 },
        maxLength: null,
        required: true,
        due: "dayBefore",
        partId: "pt-4",
      },
    ]);
    assert.deepEqual(reader.weekWrittenAnswers(legacyWeek()).map((a) => [a.id, a.maxLength, a.words, a.due]), [["x3", 2000, null, null]]);
  });

  test("reflection prompts with their stop and part; a week written before blocks has none", () => {
    assert.deepEqual(
      reader.weekReflectionPrompts(blockWeek()).map((p) => [p.id, p.stopId, p.partId]),
      [["rp-1", "rs-1", "pt-1"], ["rp-2", "rs-1", "pt-1"], ["rp-3", "rs-2", "pt-2"]],
    );
    assert.deepEqual(reader.weekReflectionPrompts(legacyWeek()), []);
  });

  test("checklist items: a block week's Checklist blocks' items; otherwise the week's checklist", () => {
    assert.deepEqual(reader.weekChecklistItems(blockWeek()).map((item) => item.id), ["ci-1", "ci-2"]);
    const legacy = { ...legacyWeek(), checklist: [{ id: "c1", title: "Bring a question", mirrorToMyWork: true }] };
    assert.deepEqual(reader.weekChecklistItems(legacy), legacy.checklist);
  });

  test("This week's tasks, the summary and where a week stands", () => {
    assert.deepEqual(reader.weekTasks(blockWeek()).map((t) => t.when), ["before", "dayBefore", "atSession"]);
    assert.equal(
      reader.weekSummaryText(blockWeek()),
      "Forecasts are only useful if someone checks them. This week practises base rates and calibration, using a short guide. It is the heaviest week of the course: look after yourself.",
    );
    assert.equal(reader.weekSummaryText({ ...blockWeek(), summary: "  Its own words.  " }), "Its own words.", "a summary of its own wins");
    assert.equal(reader.weekSummaryText(legacyWeek()), legacyWeek().summary);
    assert.equal(reader.weekReadiness(blockWeek()), "draft");
    assert.equal(reader.weekReadiness(courses.normalizeCourseWeek("w03", syntheticWeekDoc({ ready: true }))), "ready");
    assert.equal(reader.weekReadiness(courses.normalizeCourseWeek("w03", syntheticWeekDoc({ blocks: [] }))), "empty");
    assert.equal(reader.weekReadiness(courses.normalizeCourseWeek("w09", { weekNumber: 9 })), "empty");
    assert.equal(reader.weekReadiness(legacyWeek()), "draft");
  });
});

// ---------------------------------------------------------------------------
// 2. The readers switched onto it
// ---------------------------------------------------------------------------

describe("2. the server-side readers, on a block week", () => {
  test("a facilitator's note on a source in a block week's pack is filed against its week; an unknown id is refused", async () => {
    world.db.seed(W3, syntheticWeekDoc());
    const ok = await call("zach", notesRoute.POST, { runId: RUN.agi }, { body: { itemId: "pk-2", weekNumber: 1, note: "Landed well." }, course: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.weekNumber, 3, "the week is the one the source is in, not the one claimed");
    const missing = await call("zach", notesRoute.POST, { runId: RUN.agi }, { body: { itemId: "gf-1", weekNumber: 3, note: "Hm." }, course: true });
    assert.equal(missing.status, 400, "Go further is not on the path");
  });

  test("the retrospective's rows: every source on the path, packs included, Go further never", () => {
    const rows = aggregateRetrospective({
      weeks: [blockWeek()],
      progress: [
        { itemId: "pk-1", rating: 4, completed: true },
        { itemId: "ci-1", completed: true },
      ],
      notes: [],
      enrolledCount: 3,
    });
    assert.deepEqual(rows.map((row) => row.itemId), ["src-1", "src-7", "src-2", "src-8", "pk-1", "pk-2", "pk-3", "pk-4", "pk-5"]);
    assert.equal(rows[4].completedCount, 1);
    assert.equal(rows[4].ratingCount, 1);
  });

  test("the reading list lists a block week's sources; a week written before blocks is drawn as it was", async () => {
    world.db.seed(W3, syntheticWeekDoc());
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const enrolmentPath = world.db.paths().find((path) => path.startsWith("courseEnrolments/") && path.endsWith("__chloe"));
    const enrolment = enrolments.normalizeCourseEnrolment(enrolmentPath.split("/")[1], world.db.read(enrolmentPath));
    const list = await leftView.loadReadingList(world.courseDb ?? world.db, { run, enrolment });
    const week3 = list.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual(week3.items.map((item) => item.id), ["src-1", "src-7", "src-2", "src-8", "pk-1", "pk-2", "pk-3", "pk-4", "pk-5"]);
    assert.deepEqual(week3.items[0], { id: "src-1", title: "A field guide to base rates", href: "https://example.com/base-rates", meta: "Read · 15 minutes", body: null });
    const week2 = list.weeks.find((week) => week.weekNumber === 2);
    assert.deepEqual(week2.items.map((item) => item.meta), ["Reading · 25 min", "Video · 20 min", "Reading · 30 min"]);
  });

  test("the My Work mirror: a block week makes no weekly card, and stamps nothing; the same week written before blocks still makes one", async () => {
    // A default taken for Zach (27 October 2026): a week written as blocks is counted by This week's tasks on
    // Home and its pages, so a card in My work beside them, which nothing closes, said the week was open after
    // the page said it was done. Until then a block week's card said its Why this week and mirrored its
    // checklist blocks' items.
    const legacy = world.db.read(W3);
    const doc = syntheticWeekDoc();
    doc.blocks.find((b) => b.id === "pt-5").blocks.find((b) => b.id === "ck-1").items[0].mirrorToMyWork = true;
    world.db.seed(W3, doc);
    const enrolmentPath = world.db.paths().find((path) => path.startsWith("courseEnrolments/") && path.endsWith("__chloe"));
    world.db.poke(enrolmentPath, { lastTaskSyncedWeek: 0 });
    const blocks = await call("chloe", syncRoute.POST, { runId: RUN.agi }, { course: true });
    assert.equal(blocks.status, 200, JSON.stringify(blocks.body));
    assert.deepEqual(blocks.body, { ok: true, weekNumber: null, created: 0, alreadyPresent: 0, conflicted: 0 });
    assert.ok(!world.db.read(`tasks/course-w03__${RUN.agi}__chloe`), "a card was made for a week written as blocks");
    assert.equal(world.db.read(enrolmentPath).lastTaskSyncedWeek, 0, "the mark was stamped for a week with nothing mirrored");
    // The same week, written before blocks, makes its card as it always has.
    world.db.seed(W3, legacy);
    const summer = await call("chloe", syncRoute.POST, { runId: RUN.agi }, { course: true });
    assert.deepEqual([summer.status, summer.body.weekNumber, summer.body.created], [200, 3, 1], JSON.stringify(summer.body));
    assert.ok(world.db.read(`tasks/course-w03__${RUN.agi}__chloe`), "the card was not made");
  });

  test("finishing counts a block week's written answer by its id, not the old exercise", async () => {
    finish.reset();
    const records = () => finish.lib.attendance.readRunRecords(finish.world.courseDb, FINISH_RUN.agi);
    const before = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    const path = `courseRuns/${FINISH_RUN.agi}/weeks/w05`;
    const asAnswer = (id) => [{ id: "pt-a", type: "part", title: "Your answer", time: "", framing: [], blocks: [{ id, type: "writtenAnswer", prompt: [{ type: "p", runs: [{ text: "Why?" }] }], boxes: [], guidance: [], words: null, due: "dayBefore" }] }];
    finish.world.db.poke(path, { blocks: asAnswer("x5") });
    const same = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    assert.deepEqual(same.get("amara"), before.get("amara"), "the same id, the same answers");
    finish.world.db.poke(path, { blocks: asAnswer("wa-new") });
    const moved = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    assert.equal(moved.get("amara").done, before.get("amara").done - 1, "answers to the old exercise no longer count");
    assert.equal(moved.get("amara").of, before.get("amara").of);
  });

  test("Week N is open: a block week lists what its tasks ask for, read from its blocks, and never says exercise", () => {
    const asks = (week) => weekEmails.blockWeekAsks(week.blocks, weekTaskNeeds(week.blocks));
    const lines = (week) => asks(week).map(weekEmailWords.weekAskWords);
    assert.deepEqual(lines(blockWeek()), [
      "4 readings",
      "Your pack’s reading",
      "2 short reflections",
      "Your plan",
      "A written answer",
      "Getting ready for your talk",
    ]);
    // A This week box whose tasks cover no block asks for nothing yet, and
    // holds an email that goes whole rather than send it with an empty list.
    const one = courses.normalizeCourseWeek("w01", syntheticWeekDoc({
      blocks: [{ ...syntheticWeekBlocks()[0], rows: [syntheticWeekBlocks()[0].rows[0], syntheticWeekBlocks()[0].rows[3]], total: "About 80 minutes" }],
    }));
    assert.deepEqual(asks(one), []);
    assert.deepEqual(asks(courses.normalizeCourseWeek("w01", syntheticWeekDoc({ blocks: [] }))), []);
    for (const week of [blockWeek(), one]) for (const line of lines(week)) assert.doesNotMatch(line, /exercise/i);
    // A week written before blocks reads its materials and exercises, as it always did.
    assert.deepEqual(weekEmails.legacyWeekAsks(legacyWeek()).map(weekEmailWords.weekAskWords), ["3 things to read or watch"]);
    assert.deepEqual(
      weekEmails.legacyWeekAsks({ materials: [{}, {}], exercises: [{ required: true }] }).map(weekEmailWords.weekAskWords),
      ["2 things to read or watch", "An exercise to write up"],
    );
  });

  test("Week N is open: a block week is not held for anything a block week has no box for", () => {
    // The email carries no summary, so a block week with no summary of its own
    // is whole once it has a title, a session and something to ask for.
    const week = blockWeek();
    const facts = {
      courseTitle: "AGI Strategy",
      weekNumber: 3,
      weekTitle: week.title,
      sessionAt: new Date("2026-11-17T18:00:00Z"),
      where: "A room",
      first: false,
      cancelled: false,
      change: "",
      asks: weekEmails.blockWeekAsks(week.blocks, weekTaskNeeds(week.blocks)),
      weekUrl: `https://naisi.invalid/learn/${RUN.agi}/weeks/3`,
      feedbackUrl: "",
      locks: true,
    };
    assert.deepEqual(weekEmailWords.missingWeekOpenValues(facts), []);
  });
});
