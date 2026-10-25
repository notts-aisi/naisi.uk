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
 *   courseWeekPrepLine, groupNudgeFacts        next week's email: its line and summary
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
const nudge = await loadTs(join("lib", "email", "courseNudgeEmail.ts"));
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
  test("a block week's sources: its parts' sources and every pack's, in page order, never Go further", () => {
    const sources = reader.weekSources(blockWeek());
    assert.deepEqual(sources.map((s) => s.id), ["src-1", "src-2", "src-3", "src-4", "src-5", "src-6"]);
    assert.deepEqual(sources.map((s) => s.packId), [null, null, "pk-1", "pk-1", "pk-2", "pk-3"]);
    assert.deepEqual(sources.map((s) => s.partId), ["pt-1", "pt-2", "pt-3", "pt-3", "pt-3", "pt-3"]);
    assert.deepEqual(sources[1], {
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
        prompt: "Make one forecast about your pack’s question, with a number and three reasons.",
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
    const ok = await call("zach", notesRoute.POST, { runId: RUN.agi }, { body: { itemId: "src-4", weekNumber: 1, note: "Landed well." }, course: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.weekNumber, 3, "the week is the one the source is in, not the one claimed");
    const missing = await call("zach", notesRoute.POST, { runId: RUN.agi }, { body: { itemId: "gf-1", weekNumber: 3, note: "Hm." }, course: true });
    assert.equal(missing.status, 400, "Go further is not on the path");
  });

  test("the retrospective's rows: every source on the path, packs included, Go further never", () => {
    const rows = aggregateRetrospective({
      weeks: [blockWeek()],
      progress: [
        { itemId: "src-3", rating: 4, completed: true },
        { itemId: "ci-1", completed: true },
      ],
      notes: [],
      enrolledCount: 3,
    });
    assert.deepEqual(rows.map((row) => row.itemId), ["src-1", "src-2", "src-3", "src-4", "src-5", "src-6"]);
    assert.equal(rows[2].completedCount, 1);
    assert.equal(rows[2].ratingCount, 1);
  });

  test("the reading list lists a block week's sources; a week written before blocks is drawn as it was", async () => {
    world.db.seed(W3, syntheticWeekDoc());
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const enrolmentPath = world.db.paths().find((path) => path.startsWith("courseEnrolments/") && path.endsWith("__chloe"));
    const enrolment = enrolments.normalizeCourseEnrolment(enrolmentPath.split("/")[1], world.db.read(enrolmentPath));
    const list = await leftView.loadReadingList(world.courseDb ?? world.db, { run, enrolment });
    const week3 = list.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual(week3.items.map((item) => item.id), ["src-1", "src-2", "src-3", "src-4", "src-5", "src-6"]);
    assert.deepEqual(week3.items[0], { id: "src-1", title: "A field guide to base rates", href: "https://example.com/base-rates", meta: "Read · 15 minutes", body: null });
    const week2 = list.weeks.find((week) => week.weekNumber === 2);
    assert.deepEqual(week2.items.map((item) => item.meta), ["Reading · 25 min", "Video · 20 min", "Reading · 30 min"]);
  });

  test("the My Work mirror: a block week's card says its Why this week and mirrors its checklist blocks' items", async () => {
    const doc = syntheticWeekDoc();
    doc.blocks.find((b) => b.id === "pt-5").blocks.find((b) => b.id === "ck-1").items[0].mirrorToMyWork = true;
    world.db.seed(W3, doc);
    const enrolmentPath = world.db.paths().find((path) => path.startsWith("courseEnrolments/") && path.endsWith("__chloe"));
    world.db.poke(enrolmentPath, { lastTaskSyncedWeek: 0 });
    const answer = await call("chloe", syncRoute.POST, { runId: RUN.agi }, { course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.weekNumber, 3);
    const task = world.db.read(`tasks/course-w03__${RUN.agi}__chloe`);
    assert.ok(task, "the card was made");
    assert.match(task.description, /^Forecasts are only useful if someone checks them\./);
    assert.deepEqual(task.subtasks.map((s) => s.id), ["ci-1"]);
  });

  test("finishing counts a block week's written answer by its id, not the old exercise", async () => {
    finish.reset();
    const records = () => finish.lib.attendance.readRunRecords(finish.world.courseDb, FINISH_RUN.agi);
    const before = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    const path = `courseRuns/${FINISH_RUN.agi}/weeks/w05`;
    const asAnswer = (id) => [{ id: "pt-a", type: "part", title: "Your answer", time: "", framing: [], blocks: [{ id, type: "writtenAnswer", prompt: [{ text: "Why?" }], guidance: [], words: null, due: "dayBefore" }] }];
    finish.world.db.poke(path, { blocks: asAnswer("x5") });
    const same = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    assert.deepEqual(same.get("amara"), before.get("amara"), "the same id, the same answers");
    finish.world.db.poke(path, { blocks: asAnswer("wa-new") });
    const moved = await finish.lib.who.readExerciseTallies(finish.world.courseDb, await records());
    assert.equal(moved.get("amara").done, before.get("amara").done - 1, "answers to the old exercise no longer count");
    assert.equal(moved.get("amara").of, before.get("amara").of);
  });

  test("next week's email: a block week's line counts This week's tasks, says In all, and never says exercise", () => {
    assert.equal(nudge.courseWeekPrepLine(blockWeek()), "There are three things to do this week, about 2 hours in all.");
    const one = courses.normalizeCourseWeek("w01", syntheticWeekDoc({
      blocks: [{ ...syntheticWeekBlocks()[0], rows: [syntheticWeekBlocks()[0].rows[0], syntheticWeekBlocks()[0].rows[3]], total: "About 80 minutes" }],
    }));
    assert.equal(nudge.courseWeekPrepLine(one), "There is one thing to do this week, about 80 minutes in all.");
    const noTotal = courses.normalizeCourseWeek("w01", syntheticWeekDoc({ blocks: [{ ...syntheticWeekBlocks()[0], total: "" }] }));
    assert.equal(nudge.courseWeekPrepLine(noTotal), "There are three things to do this week.");
    assert.equal(nudge.courseWeekPrepLine(courses.normalizeCourseWeek("w01", syntheticWeekDoc({ blocks: [] }))), "", "no task yet holds an email that goes whole");
    for (const week of [blockWeek(), one, noTotal]) assert.doesNotMatch(nudge.courseWeekPrepLine(week), /exercise/i);
    // A week written before blocks reads as it always did.
    assert.equal(nudge.courseWeekPrepLine(legacyWeek()), "There are three things to read or watch this week.");
    assert.equal(
      nudge.courseWeekPrepLine({ materials: [{}, {}], exercises: [{ required: true }], estimatedMinutes: null }),
      "There are two things to read or watch and one exercise to write up this week.",
    );
  });

  test("next week's email: a block week with no summary of its own says its Why this week, so it is not held", () => {
    const facts = nudge.groupNudgeFacts({
      courseTitle: "AGI Strategy",
      runLabel: "Autumn 2026",
      runId: RUN.agi,
      appUrl: "https://naisi.invalid",
      feedbackUrl: "",
      session: { weekNumber: 3, dateKey: "2026-11-17", session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "A room", meetingUrl: null, notes: "" } },
      mode: null,
      week: blockWeek(),
    });
    assert.match(facts.context.weekSummary, /^Forecasts are only useful/);
    assert.equal(facts.context.weekPrep, "There are three things to do this week, about 2 hours in all.");
  });
});
