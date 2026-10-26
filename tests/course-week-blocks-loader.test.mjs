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
 * Admins and the programme's lead (from the Weeks tab, board pr-weeks), the
 * lead answered exactly as an admin: the lead of another programme, a lead
 * who no longer stands as one, the run's track lead, a group's facilitator, a
 * member and somebody signed out are all refused before a document of the run
 * is read, and a view-as session is refused before that.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NOW, RUN, makeMemberPagesWorld, memberSeed } from "./lib/memberPagesWorld.mjs";
import { syntheticGuideMarkdown, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const w = await makeMemberPagesWorld("__weekBlocksLoader");
const { world, call, courseRoute, loadTs } = w;
const route = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks");
const model = await loadTs(join("lib", "courses", "weekBlocks", "model.ts"));
const { emptyWeekFields } = await loadTs(join("lib", "firestore", "courses.ts"));

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
  // The programme's lead loads the run's weeks from the Weeks tab (board
  // pr-weeks, Q39), so the lead moved out of this list into the test below,
  // which holds every answer of theirs to the admin's. The lead of ANOTHER
  // programme takes the lead's old place here, refused as strictly.
  const REFUSED = [
    ["tess", 403, "the lead of another programme"],
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

  test("the programme's lead is answered exactly as an admin: Read it, Save and Copy as Markdown", async () => {
    world.db.seed(W3, syntheticWeekDoc());
    const asked = { markdown: syntheticGuideMarkdown() };
    const admin = await as("zach", "POST", asked);
    const lead = await as("claudia", "POST", asked);
    assert.equal(lead.status, 200, JSON.stringify(lead.body));
    assert.deepEqual(lead.body, admin.body, "the same read, the same checks, the same answers at stake");
    const saved = await as("claudia", "PUT", { ...asked, confirmAnswers: admin.body.answers });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(world.db.read(W3).updatedByUid, "claudia", "the save is recorded as the lead's");
    const copy = await as("claudia", "GET");
    assert.equal(copy.status, 200);
    assert.deepEqual(copy.body, (await as("zach", "GET")).body);
  });

  test("a lead who no longer stands as one is refused on every method, and nothing is written", async () => {
    world.db.seed(W3, syntheticWeekDoc());
    world.db.poke("users/claudia", { role: "member", suRecognised: false });
    const before = everything();
    for (const method of ["GET", "POST", "PUT"]) {
      const answer = await as("claudia", method, method === "GET" ? undefined : { markdown: syntheticGuideMarkdown() });
      assert.equal(answer.status, 403, method);
      assert.deepEqual(Object.keys(answer.body), ["error"]);
    }
    assert.equal(everything(), before);
  });

  test("the lead is refused on a run their programme does not name", async () => {
    const other = { runId: RUN.tais, weekId: "w01" };
    world.db.seed(`courseRuns/${RUN.tais}/weeks/w01`, syntheticWeekDoc({ weekNumber: 1, title: "Week one" }));
    const before = everything();
    for (const method of ["GET", "POST", "PUT"]) {
      const answer = await as("claudia", method, method === "GET" ? undefined : { markdown: syntheticGuideMarkdown() }, other);
      assert.equal(answer.status, 403, method);
    }
    assert.equal(everything(), before);
  });

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
    const before = everything();
    for (const method of ["GET", "POST", "PUT"]) {
      const unplanned = await as("zach", method, method === "GET" ? undefined : { markdown: "# Week 9: A" }, { runId: RUN.agi, weekId: "w09" });
      assert.deepEqual([unplanned.status, unplanned.body.error], [404, "That week isn’t in this run’s week plan."], method);
    }
    assert.equal(everything(), before, "a week out of the plan is not made");
  });

  test("Copy as Markdown on a week written before blocks says there is nothing to copy", async () => {
    const answer = await as("zach", "GET");
    assert.equal(answer.status, 404);
    assert.equal(answer.body.error, "This week isn’t written as blocks yet, so there is nothing to copy.");
  });
});

// ---------------------------------------------------------------------------
// 6. The card in the run's week editor
// ---------------------------------------------------------------------------

describe("6. the card in the run's week editor", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  test("drawn with its box, its note on answers and Read it; Copy as Markdown only for a block week", async () => {
    const { default: WeekBlocksLoader } = await loadTs(join("features", "courses", "WeekBlocksLoader.tsx"));
    const draw = (blockWeek) =>
      renderToStaticMarkup(createElement(WeekBlocksLoader, { runId: RUN.agi, weekId: "w03", weekNumber: 3, blockWeek, onSaved() {} }));
    const block = draw(true);
    assert.match(block, /Paste the week, then check it/);
    assert.match(block, /<label[^>]*for="week-markdown-w03"[^>]*>Paste the week’s Markdown<\/label>/);
    assert.match(block, /Pasting again replaces the week\. Answers stay with their blocks; if a block that has answers would go, it says\s+how many first\./);
    assert.match(block, /Read it/);
    assert.match(block, /Copy as Markdown/);
    assert.doesNotMatch(draw(false), /Copy as Markdown/, "nothing to copy on a week written before blocks");
  });

  test("the editor draws the card for an admin alone, and offers a block week none of the old sections", () => {
    const editor = readFileSync(join(SRC, "features", "courses", "WeekEditor.tsx"), "utf8");
    assert.match(editor, /\{role === "admin" && \(\s*<WeekBlocksLoader /);
    assert.match(editor, /const blockWeek = isBlockWeek\(saved\);/);
    // The guide, the materials, the exercises and the checklist sit inside the two `!blockWeek` blocks.
    const guide = editor.indexOf("{/* ---- Guide ---- */}");
    const checklist = editor.indexOf("Save checklist");
    const firstGate = editor.indexOf("{!blockWeek && (");
    const secondGate = editor.indexOf("{!blockWeek && (", firstGate + 1);
    assert.ok(firstGate > 0 && firstGate < guide && secondGate > guide && secondGate < checklist);
  });
});

// ---------------------------------------------------------------------------
// 7. A week of the plan with no page yet (Zach, 26 October 2026)
// ---------------------------------------------------------------------------

describe("7. a week of the plan with no page yet", () => {
  beforeEach(() => {
    const seed = memberSeed();
    delete seed[W3];
    w.reset(seed);
  });

  test("Read it reads it as an empty week and writes nothing; Copy as Markdown has nothing to copy", async () => {
    const before = everything();
    for (const who of ["claudia", "zach"]) {
      const read = await as(who, "POST", { markdown: syntheticGuideMarkdown() });
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.deepEqual(read.body.problems, []);
      assert.deepEqual(read.body.removed, [], "an empty week has nothing to take out");
      assert.equal(read.body.answers, 0);
      const copy = await as(who, "GET");
      assert.deepEqual([copy.status, copy.body.error], [404, "This week isn’t written as blocks yet, so there is nothing to copy."]);
    }
    assert.equal(everything(), before);
  });

  for (const who of ["claudia", "zach"]) {
    test(`the first save makes its page as the week editor would, unpublished, with the blocks and the title (${who})`, async () => {
      const answer = await as(who, "PUT", { markdown: syntheticGuideMarkdown() });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(answer.body.saved, true);
      const stored = world.db.read(W3);
      const empty = emptyWeekFields(3);
      assert.deepEqual(Object.keys(stored).sort(), [...Object.keys(empty), "blocks", "updatedAt", "updatedByUid"].sort());
      for (const [key, value] of Object.entries(empty)) {
        if (key !== "title") assert.deepEqual(stored[key], value, key);
      }
      assert.equal(stored.published, false, "a new page is shown to nobody until it is published");
      assert.equal(stored.title, "How sure are you?");
      assert.ok(model.isBlockWeek(stored));
      assert.deepEqual(model.weekBlocksProblems(stored.blocks), []);
      assert.equal(stored.updatedByUid, who);
      assert.ok(stored.updatedAt instanceof Date);
      // Copied out and pasted back, the second save is an ordinary one onto the page the first made.
      const copied = await as(who, "GET");
      assert.equal(copied.status, 200, JSON.stringify(copied.body));
      const again = await as(who, "PUT", { markdown: copied.body.markdown });
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assert.equal(again.body.minted, 0, "every id the first save minted is kept");
      assert.deepEqual(world.db.read(W3).blocks, stored.blocks);
    });
  }

  test("a page made by somebody else between the read and the write is never overwritten: 409, read it again", async () => {
    const theirs = syntheticWeekDoc();
    const view = world.courseDb;
    const real = view.collection;
    let seen = null;
    const meanwhile = (ref) => ({
      ...ref,
      collection: (name) => around(ref.collection(name)),
      create: async (data) => {
        if (ref.path === W3) {
          world.db.seed(W3, theirs);
          seen = JSON.stringify(world.db.read(W3));
        }
        return ref.create(data);
      },
    });
    const around = (collection) => ({ ...collection, doc: (id) => meanwhile(collection.doc(id)) });
    view.collection = (name) => around(real(name));
    try {
      const answer = await as("claudia", "PUT", { markdown: syntheticGuideMarkdown() });
      assert.deepEqual([answer.status, answer.body.error], [409, "This week has just changed. Read it again, then save."]);
    } finally {
      view.collection = real;
    }
    assert.ok(seen, "the page was made between the read and the write");
    assert.equal(JSON.stringify(world.db.read(W3)), seen, "the page made meanwhile is as it was made");
  });
});
