/**
 * Loading a week as blocks (board pr-weeks, Option B; Q39): the route the
 * run's week editor sends a week's Markdown to,
 * `/api/courses/runs/[runId]/weeks/[weekId]/blocks`, driven as every kind of
 * caller on week 3 of AGI Strategy's run (`tests/lib/memberPagesWorld.mjs`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   "Copy as Markdown": the stored block week, ids written in
 *   POST  "Read it": what was found, what to check, what stops a save, the answers at stake
 *   PUT   "Save": the same read, then the blocks and the title written
 *
 * Admins only: the programme's lead, the run's track lead, a group's
 * facilitator, a member and somebody signed out are all refused before a
 * document is read, and a view-as session is refused before that.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { NOW, RUN, makeMemberPagesWorld } from "./lib/memberPagesWorld.mjs";
import { syntheticGuideMarkdown, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const w = await makeMemberPagesWorld("__weekBlocksLoader");
const { world, call, courseRoute, loadTs } = w;
const route = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks");
const model = await loadTs(join("lib", "courses", "weekBlocks", "model.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

const W3 = `courseRuns/${RUN.agi}/weeks/w03`;
const AT = { runId: RUN.agi, weekId: "w03" };
const as = (who, method, body, params = AT, extra = {}) =>
  call(who, route[method], params, { ...(body !== undefined ? { body } : {}), course: true, ...extra });

/** The whole store as one string, to prove a request wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

function courseId() {
  return world.db.read(`courseRuns/${RUN.agi}`).courseId;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. Who may load a week
// ---------------------------------------------------------------------------

describe("1. who may load a week", () => {
  const REFUSED = [
    ["claudia", 403, "the programme's lead"],
    ["yusuf", 403, "the run's track lead"],
    ["rahul", 403, "a facilitator of one of the run's groups"],
    ["chloe", 403, "a member placed on the run"],
    ["nobody", 403, "a member on nothing"],
    [null, 401, "somebody signed out"],
  ];

  for (const [who, status, what] of REFUSED) {
    test(`${what}: refused on every method, and nothing is written`, async () => {
      world.db.seed(W3, syntheticWeekDoc());
      const before = everything();
      for (const method of ["GET", "POST", "PUT"]) {
        const answer = await as(who, method, method === "GET" ? undefined : { markdown: syntheticGuideMarkdown() });
        assert.equal(answer.status, status, `${method}: ${JSON.stringify(answer.body)}`);
        assert.deepEqual(Object.keys(answer.body), ["error"], "nothing about the week is said");
      }
      assert.equal(everything(), before);
    });
  }

  test("an admin in a view-as session is refused Read it and Save, before anything else", async () => {
    const before = everything();
    for (const method of ["POST", "PUT"]) {
      const answer = await as("zach", method, { markdown: syntheticGuideMarkdown() }, AT, { viewAs: true });
      assert.equal(answer.status, 403, method);
    }
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Read it
// ---------------------------------------------------------------------------

describe("2. Read it", () => {
  test("the guide's week, read onto a week written before blocks: found, checks, nothing written", async () => {
    const before = everything();
    const answer = await as("zach", "POST", { markdown: syntheticGuideMarkdown() });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.found[0], { state: "found", label: "Title", detail: "Week 3: How sure are you?", indent: false });
    assert.equal(answer.body.found.length, 14);
    assert.equal(answer.body.checks.length, 5);
    assert.deepEqual(answer.body.problems, []);
    assert.deepEqual(answer.body.removed, [], "a week written before blocks has no ids to lose");
    assert.equal(answer.body.answers, 0);
    assert.equal(answer.body.due, "by the end of the day before", "the course has no time of its own");
    assert.equal(answer.body.title, "How sure are you?");
    assert.deepEqual(
      Object.keys(answer.body).sort(),
      ["answers", "blockCount", "checks", "due", "found", "kept", "minted", "problems", "removed", "title"],
      "built field by field: no blocks, no stored document",
    );
    assert.equal(everything(), before, "Read it writes nothing");
  });

  test("the course's own day-before time is the words shown, and a Markdown that says otherwise is said", async () => {
    world.db.poke(`courses/${courseId()}`, { dayBeforeDueTime: "12:00" });
    const answer = await as("zach", "POST", { markdown: syntheticGuideMarkdown() });
    assert.equal(answer.body.due, "by noon the day before");
    assert.ok(
      answer.body.checks.includes(
        "The Markdown says written work is due by the end of the day before the session; this course’s setting says by noon the day before. The site goes by the setting: change it in the course’s details, or change the Markdown.",
      ),
      answer.body.checks.join("\n"),
    );
  });

  test("another week's Markdown is named as a problem", async () => {
    const answer = await as("zach", "POST", { markdown: syntheticGuideMarkdown().replace("# Week 3:", "# Week 4:") });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.problems[0], "This is week 4’s Markdown, and you’re loading week 3. Check the week, or change the first line.");
  });
});

// ---------------------------------------------------------------------------
// 3. Save, and the round trip through the route
// ---------------------------------------------------------------------------

describe("3. Save", () => {
  test("the blocks and the title are written, the old arrays left as they were, and the week is a block week", async () => {
    const legacy = world.db.read(W3);
    const answer = await as("zach", "PUT", { markdown: syntheticGuideMarkdown() });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.saved, true);
    const stored = world.db.read(W3);
    assert.ok(model.isBlockWeek(stored));
    assert.deepEqual(model.weekBlocksProblems(stored.blocks), []);
    assert.deepEqual(model.sanitizeWeekBlocks(stored.blocks), stored.blocks, "stored as the read side gives it back");
    assert.equal(stored.title, "How sure are you?");
    assert.equal(stored.updatedByUid, "zach");
    assert.deepEqual(stored.materials, legacy.materials);
    assert.deepEqual(stored.exercises, legacy.exercises);
    assert.equal(stored.published, legacy.published, "Save touches neither Published nor Ready");
    assert.equal("ready" in stored, "ready" in legacy);
  });

  test("copied out and pasted back through the route, the week is the same week", async () => {
    await as("zach", "PUT", { markdown: syntheticGuideMarkdown() });
    const saved = world.db.read(W3).blocks;
    const copy = await as("zach", "GET");
    assert.equal(copy.status, 200);
    assert.deepEqual(Object.keys(copy.body), ["markdown"]);
    for (const item of model.weekItems(saved)) assert.ok(copy.body.markdown.includes(`{#${item.id}}`), item.id);
    const read = await as("zach", "POST", { markdown: copy.body.markdown });
    assert.equal(read.body.kept, model.weekItems(saved).length);
    assert.equal(read.body.minted, 0);
    assert.deepEqual(read.body.removed, []);
    const again = await as("zach", "PUT", { markdown: copy.body.markdown });
    assert.equal(again.status, 200);
    assert.deepEqual(world.db.read(W3).blocks, saved);
  });

  test("a paste with a problem is refused, saying the first one, and nothing is written", async () => {
    const before = everything();
    const answer = await as("zach", "PUT", { markdown: syntheticGuideMarkdown().replace("https://example.com/base-rates", "http://example.com/base-rates") });
    assert.equal(answer.status, 400);
    assert.equal(answer.body.error, "The source “A field guide to base rates” needs an https link: http://example.com/base-rates isn’t one.");
    assert.deepEqual(answer.body.problems, [answer.body.error]);
    assert.equal(everything(), before);
  });

  test("a title over the week's cap is a problem, not a cut", async () => {
    const answer = await as("zach", "PUT", { markdown: syntheticGuideMarkdown().replace("How sure are you?", "T".repeat(130)) });
    assert.equal(answer.status, 400);
    assert.equal(answer.body.error, "The title is 130 characters; the most is 120.");
  });
});

// ---------------------------------------------------------------------------
// 4. Answers stay with their blocks
// ---------------------------------------------------------------------------

describe("4. answers stay with their blocks (K16)", () => {
  /** The synthetic block week, and answers on two of its items: a source with ticks and a note, the written answer. */
  function seedAnswers() {
    world.db.seed(W3, syntheticWeekDoc());
    const run = RUN.agi;
    world.db.seed(`courseProgress/${run}__chloe__src-1`, { runId: run, uid: "chloe", itemId: "src-1", completed: true });
    world.db.seed(`courseProgress/${run}__farah__src-1`, { runId: run, uid: "farah", itemId: "src-1", completed: true, rating: 4 });
    world.db.seed(`courseMaterialNotes/${run}__src-1__rahul`, { runId: run, itemId: "src-1", uid: "rahul", weekNumber: 3, note: "Landed well." });
    world.db.seed(`courseExerciseResponses/${run}__chloe__w03__wa-1`, { runId: run, uid: "chloe", weekId: "w03", exerciseId: "wa-1", text: "My forecast." });
    // An answer to the same id in another week is not this week's.
    world.db.seed(`courseExerciseResponses/${run}__chloe__w02__wa-1`, { runId: run, uid: "chloe", weekId: "w02", exerciseId: "wa-1", text: "Elsewhere." });
  }

  /** The stored week copied out, with the source and the written answer's id taken out. */
  async function pasteTakingTwo() {
    const copy = await as("zach", "GET");
    const lines = copy.body.markdown.split("\n").filter((line) => !line.includes("{#src-1}"));
    return lines.join("\n").replace(" {#wa-1}", "");
  }

  test("Read it says what goes and how many answers go with it", async () => {
    seedAnswers();
    const answer = await as("zach", "POST", { markdown: await pasteTakingTwo() });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.problems, []);
    assert.deepEqual(answer.body.removed.filter((item) => item.answers > 0), [
      { id: "src-1", kind: "block:source", label: "A field guide to base rates", answers: 3 },
      { id: "wa-1", kind: "block:writtenAnswer", label: "Will your pack’s question come true by next year?", answers: 1 },
    ]);
    assert.equal(answer.body.answers, 4);
  });

  test("Save is refused until the count it was shown is confirmed, and an old count asks again", async () => {
    seedAnswers();
    const markdown = await pasteTakingTwo();
    const before = everything();
    const unconfirmed = await as("zach", "PUT", { markdown });
    assert.equal(unconfirmed.status, 409);
    assert.equal(unconfirmed.body.error, "This paste takes out items with 4 answers. Confirm to save it anyway.");
    const stale = await as("zach", "PUT", { markdown, confirmAnswers: 3 });
    assert.equal(stale.status, 409);
    assert.equal(everything(), before, "nothing is written while it asks");
    const confirmed = await as("zach", "PUT", { markdown, confirmAnswers: 4 });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const ids = model.weekItems(world.db.read(W3).blocks).map((item) => item.id);
    assert.ok(!ids.includes("src-1"));
    assert.ok(!ids.includes("wa-1"), "the answer's id was taken out, so a fresh one is minted");
    assert.ok(world.db.read(`courseProgress/${RUN.agi}__chloe__src-1`), "answers are never deleted by a paste");
  });

  test("a paste that moves things and takes nothing out needs no confirming", async () => {
    seedAnswers();
    const copy = await as("zach", "GET");
    const answer = await as("zach", "PUT", { markdown: copy.body.markdown.replace("Most questions have happened before, in some form.", "Most questions have happened before.") });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.answers, 0);
    assert.equal(answer.body.removed, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. What the route is sent
// ---------------------------------------------------------------------------

describe("5. what the route is sent", () => {
  test("each mistake in the request is a sentence, before any document is read", async () => {
    const cases = [
      [{}, "Paste the week’s Markdown first."],
      [{ markdown: "   " }, "Paste the week’s Markdown first."],
      [{ markdown: 7 }, "Paste the week’s Markdown first."],
      [{ markdown: "x".repeat(200_001) }, "That is 200001 characters; a week’s Markdown can be at most 200000."],
      [{ markdown: "# Week 3: A", confirmAnswers: "4" }, "The number of answers to confirm has to be a whole number."],
      [{ markdown: "# Week 3: A", confirmAnswers: -1 }, "The number of answers to confirm has to be a whole number."],
    ];
    for (const [body, error] of cases) {
      const answer = await as("zach", "POST", body);
      assert.equal(answer.status, 400, JSON.stringify(body).slice(0, 60));
      assert.equal(answer.body.error, error);
    }
    const notJson = await as("zach", "POST", "{not json");
    assert.equal(notJson.status, 400);
  });

  test("an address that is no week of a run", async () => {
    assert.equal((await as("zach", "POST", { markdown: "# Week 3: A" }, { runId: RUN.agi, weekId: "w3" })).status, 400);
    assert.equal((await as("zach", "GET", undefined, { runId: RUN.agi, weekId: "week-3" })).status, 400);
    assert.equal((await as("zach", "POST", { markdown: "# Week 3: A" }, { runId: "no-such-run", weekId: "w03" })).status, 404);
    const unwritten = await as("zach", "PUT", { markdown: "# Week 9: A" }, { runId: RUN.agi, weekId: "w09" });
    assert.equal(unwritten.status, 404);
    assert.equal(unwritten.body.error, "This week has no document yet: open it from the run’s week plan first.");
  });

  test("Copy as Markdown on a week written before blocks says there is nothing to copy", async () => {
    const answer = await as("zach", "GET");
    assert.equal(answer.status, 404);
    assert.equal(answer.body.error, "This week isn’t written as blocks yet, so there is nothing to copy.");
  });
});
