/**
 * Changing a week in place: the routes, driven as every kind of caller on
 * week 3 of AGI Strategy's run (`tests/lib/memberPagesWorld.mjs`), with the
 * week written as blocks (`tests/lib/weekBlocksFixture.mjs`) and people's
 * work on it: Chloe's tick on Part 1's first source and her reflection, and
 * Farah's written answer, sent.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PATCH  .../weeks/[weekId]/blocks/[blockId]           one block, in place
 *   GET    .../weeks/[weekId]/editor                     the week as the editor needs it
 *   GET    .../weeks/[weekId]/history                    every save
 *   GET    .../weeks/[weekId]/history/[saveId]           one save, compared
 *   POST   .../weeks/[weekId]/history/[saveId]/restore   a save brought back
 *   *      .../weeks/[weekId]/lock                       one editor at a time
 *   GET/POST .../weeks/[weekId]/tell                     telling people, as a choice
 *   POST/PUT .../weeks/[weekId]/blocks                   the paste's check and save
 *
 * Admins and the programme's lead, the lead answered exactly as an admin;
 * everybody else refused before a document of the run is read; a view-as
 * session refused every write first.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { NOW, RUN, makeMemberPagesWorld } from "./lib/memberPagesWorld.mjs";
import { syntheticGuideMarkdown, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const w = await makeMemberPagesWorld("__weekEditRoutes");
const { world, courseRoute, loadTs } = w;
const R = {
  block: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks", "[blockId]"),
  editor: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "editor"),
  history: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "history"),
  save: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "history", "[saveId]"),
  restore: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "history", "[saveId]", "restore"),
  lock: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "lock"),
  tell: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "tell"),
  paste: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks"),
  myExercises: await courseRoute("runs", "[runId]", "my-exercises"),
};
const { weekItems } = await loadTs(join("lib", "courses", "weekBlocks", "model.ts"));
const { weekReflectionPrompts, weekSources, weekWrittenAnswers } = await loadTs(join("lib", "courses", "weekBlocks", "reader.ts"));
const { EDIT_REFUSAL, LOCK_WORDS, TELL_REFUSAL } = await loadTs(join("lib", "courses", "weekEdit", "words.ts"));
const { LOCK_TTL_MS } = await loadTs(join("lib", "courses", "weekEdit", "lock.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

const W3 = `courseRuns/${RUN.agi}/weeks/w03`;
const AT = { runId: RUN.agi, weekId: "w03" };
const HISTORY = `${W3}/history`;
const LOCK = `${W3}/editLock/current`;

/** One request with a URL of its own (for a query), as `who`. */
async function ask(who, handler, params, { body, query = "", viewAs = false } = {}) {
  world.user = w.sessionOf(who);
  world.course = true;
  world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    world.course = false;
    world.viewAs = false;
  }
}

const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
const saves = () => world.db.paths().filter((path) => path.startsWith(`${HISTORY}/`)).sort().map((path) => ({ id: path.split("/").pop(), ...world.db.read(path) }));
const stored = () => world.db.read(W3);

const T_WROTE = new Date("2026-11-12T10:00:00Z");

/** Week 3 as blocks, and people's work on it. */
function seedWeek(over = {}) {
  world.db.seed(W3, syntheticWeekDoc({ weekNumber: 3, ...over }));
  world.db.seed(`courseProgress/${RUN.agi}__chloe__src-1`, {
    runId: RUN.agi,
    uid: "chloe",
    weekNumber: 3,
    itemKind: "material",
    itemId: "src-1",
    completed: true,
    completedAt: T_WROTE,
    hasPublicComment: false,
  });
  world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__rp-1`, {
    runId: RUN.agi,
    uid: "chloe",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "rp-1",
    kind: "reflection",
    responseType: "text",
    text: "About one in ten.",
    firstWrittenAt: T_WROTE,
    updatedAt: T_WROTE,
    submittedAt: null,
    reviewStatus: "pending",
  });
  world.db.seed(`courseExerciseResponses/${RUN.agi}__farah__w03__wa-1`, {
    runId: RUN.agi,
    uid: "farah",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "wa-1",
    responseType: "text",
    text: "My forecast is sixty percent, for three reasons.",
    words: 8,
    firstWrittenAt: T_WROTE,
    updatedAt: T_WROTE,
    firstSentAt: T_WROTE,
    submittedAt: T_WROTE,
    reviewStatus: "pending",
  });
}

/** The editor's line for a block: its fingerprint and fields. */
async function itemOf(who, blockId) {
  const view = await ask(who, R.editor.GET, AT);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  return view.body.items.find((item) => item.blockId === blockId);
}

/** Change one block as `who`, from the editor's own fingerprint. */
async function change(who, blockId, fields, extra = {}) {
  const item = await itemOf(who, blockId);
  return ask(who, R.block.PATCH, { ...AT, blockId }, { body: { base: item.fingerprint, fields, ...extra } });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may edit a week in place, read its history, hold its lock and tell people", () => {
  const REFUSED = [
    ["tess", 403, "the lead of another programme"],
    ["yusuf", 403, "the run's track lead"],
    ["rahul", 403, "a facilitator of one of the run's groups"],
    ["chloe", 403, "a member placed on the run"],
    ["nobody", 403, "a member on nothing"],
    [null, 401, "somebody signed out"],
  ];
  const CALLS = [
    [R.block.PATCH, { ...AT, blockId: "src-1" }, { base: "0123456789abcdef", fields: { title: "x" } }],
    [R.editor.GET, AT],
    [R.history.GET, AT],
    [R.save.GET, { ...AT, saveId: "s000001" }],
    [R.restore.POST, { ...AT, saveId: "s000001" }, { base: "0123456789abcdef" }],
    [R.lock.GET, AT],
    [R.lock.POST, AT],
    [R.lock.PUT, AT],
    [R.lock.DELETE, AT],
    [R.tell.GET, AT, undefined, "?save=s000001"],
    [R.tell.POST, AT, { save: "s000001", test: true }],
  ];
  for (const [who, status, what] of REFUSED) {
    test(`${what}: refused on every route, and nothing is written`, async () => {
      seedWeek();
      const before = everything();
      for (const [handler, params, body, query] of CALLS) {
        const answer = await ask(who, handler, params, { body, query });
        assert.equal(answer.status, status, `${handler.name}: ${JSON.stringify(answer.body)}`);
        assert.deepEqual(Object.keys(answer.body), ["error"], "nothing about the week is said");
      }
      assert.equal(everything(), before);
      assert.equal(world.mail.length, 0);
    });
  }

  test("a view-as session is refused every write before anything else", async () => {
    seedWeek();
    const before = everything();
    for (const [handler, params, body] of CALLS) {
      if (handler.name === "GET") continue;
      const answer = await ask("zach", handler, params, { body, viewAs: true });
      assert.equal(answer.status, 403, handler.name);
    }
    assert.equal(everything(), before);
  });

  test("the programme's lead is answered as an admin, and the save is recorded as theirs", async () => {
    seedWeek();
    const admin = await ask("zach", R.editor.GET, AT);
    const lead = await ask("claudia", R.editor.GET, AT);
    assert.equal(lead.status, 200);
    assert.deepEqual({ ...lead.body, lock: null }, { ...admin.body, lock: null });
    const saved = await change("claudia", "src-1", { title: "A field guide to base rates, revised" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(stored().updatedByUid, "claudia");
    assert.equal(saves().at(-1).byUid, "claudia");
  });
});

// ---------------------------------------------------------------------------
// 2. One block, in place: every tick and answer stays with it
// ---------------------------------------------------------------------------

describe("2. one block changed in place", () => {
  test("the editor sees each block's counts: ticks, answers and sends, never a name", async () => {
    seedWeek();
    const view = await ask("zach", R.editor.GET, AT);
    assert.equal(view.status, 200);
    const by = (id) => view.body.items.find((item) => item.blockId === id);
    assert.deepEqual(by("src-1").counts, { ticks: 1, answers: 0, sent: 0 });
    assert.deepEqual(by("rs-1").counts, { ticks: 0, answers: 1, sent: 0 });
    assert.deepEqual(by("wa-1").counts, { ticks: 0, answers: 1, sent: 1 });
    assert.equal(by("co-1").editable, false);
    assert.equal(by("co-1").fields, null);
    assert.equal(view.body.live, true);
    assert.equal(view.body.reach.started, 2, "Chloe and Farah");
    assert.deepEqual(view.body.reach.copies, []);
    assert.deepEqual(view.body.lock, { state: "free" });
    assert.doesNotMatch(JSON.stringify(view.body.items), /chloe|farah|Chloe|Farah/);
  });

  const KINDS = [
    ["a source: the same reading at a new address", "src-1", { url: "https://example.com/base-rates-moved" }, { reading: "same" }, { ticks: 1, answers: 0, sent: 0 }],
    ["a text: its words", "tx-before", { body: "Work through the parts **in order**." }, {}, { ticks: 0, answers: 0, sent: 0 }],
    ["a reflection: its prompt reworded", "rs-1", { prompts: [{ id: "rp-1", text: "What is your question's base rate, roughly?" }, { id: "rp-2", text: "What makes your case different from the base rate?" }] }, {}, { ticks: 0, answers: 1, sent: 0 }],
    ["a written answer: a new word range", "wa-1", { words: { min: 250, max: 400 } }, {}, { ticks: 0, answers: 1, sent: 1 }],
  ];
  for (const [what, id, fields, extra, counts] of KINDS) {
    test(`${what}: saved in place, ids kept, the same people's work still read against it`, async () => {
      seedWeek();
      const idsBefore = weekItems(stored().blocks).map((item) => `${item.kind}:${item.id}`);
      const work = ["courseProgress", "courseExerciseResponses"].flatMap((c) => world.db.paths().filter((p) => p.startsWith(`${c}/`)).map((p) => [p, JSON.stringify(world.db.read(p))]));
      const saved = await change("zach", id, fields, extra);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.saved, true);
      assert.deepEqual(saved.body.item.counts, counts, "the counts beside the saved block");
      assert.deepEqual(weekItems(stored().blocks).map((item) => `${item.kind}:${item.id}`), idsBefore, "every id kept");
      for (const [path, json] of work) assert.equal(JSON.stringify(world.db.read(path)), json, `${path} is untouched`);
      // Read back through the one reader of a week, the tick and answers still meet their blocks.
      const week = { summary: "", materials: [], exercises: [], checklist: [], blocks: stored().blocks };
      assert.ok(weekSources(week).some((source) => source.id === "src-1"));
      assert.ok(weekReflectionPrompts(week).some((prompt) => prompt.id === "rp-1"));
      assert.ok(weekWrittenAnswers(week).some((answer) => answer.id === "wa-1"));
      assert.deepEqual((await itemOf("zach", id)).counts, counts, "and the editor reads the same counts after the save");
    });
  }

  test("a new word range puts This week's line right, and says so", async () => {
    seedWeek();
    const doc = stored();
    doc.blocks[0].rows[1].what = "Part 4: your forecast, the week’s written answer (200 to 300 words)";
    world.db.seed(W3, doc);
    const saved = await change("zach", "wa-1", { words: { min: 250, max: 400 } });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.followed, ["This week’s line for Part 4"]);
    assert.equal(stored().blocks[0].rows[1].what, "Part 4: your forecast, the week’s written answer (250 to 400 words)");
  });

  test("refused: another kind of block, a block changed meanwhile, a due rule once sent, a different reading", async () => {
    seedWeek();
    const before = everything();
    const kind = await ask("zach", R.block.PATCH, { ...AT, blockId: "co-1" }, { body: { base: "0123456789abcdef", fields: { title: "x" } } });
    assert.deepEqual([kind.status, kind.body.error], [400, EDIT_REFUSAL.kind]);
    const stale = await ask("zach", R.block.PATCH, { ...AT, blockId: "src-1" }, { body: { base: "0123456789abcdef", fields: { title: "x" } } });
    assert.deepEqual([stale.status, stale.body.error], [409, EDIT_REFUSAL.blockChanged]);
    const due = await change("zach", "wa-1", { due: "before" });
    assert.deepEqual([due.status, due.body.error], [409, EDIT_REFUSAL.dueAfterSent(1)]);
    const different = await change("zach", "src-1", { url: "https://example.com/other" }, { reading: "different" });
    assert.deepEqual([different.status, different.body.error], [400, EDIT_REFUSAL.differentReading]);
    assert.equal(everything(), before, "a refusal writes nothing");
  });

  test("a week written before blocks, and a week with no page, are refused in plain words", async () => {
    w.reset();
    const legacy = await ask("zach", R.block.PATCH, { ...AT, blockId: "src-1" }, { body: { base: "0123456789abcdef", fields: { title: "x" } } });
    assert.deepEqual([legacy.status, legacy.body.error], [400, EDIT_REFUSAL.notBlocks]);
  });

  test("saving what is stored writes nothing", async () => {
    seedWeek();
    const before = everything();
    const same = await change("zach", "src-1", { title: "A field guide to base rates" });
    assert.equal(same.status, 200);
    assert.equal(same.body.saved, false);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. The history: every save, compare, restore
// ---------------------------------------------------------------------------

describe("3. a week's history", () => {
  test("the first save keeps the week as it was found first; later saves add one record each", async () => {
    seedWeek();
    const original = structuredClone(stored().blocks);
    await change("zach", "src-1", { title: "Base rates, a field guide" });
    let rows = saves();
    assert.deepEqual(rows.map((row) => [row.id, row.seq, row.kind, row.byUid]), [
      ["s000001", 1, "found", null],
      ["s000002", 2, "edit", "zach"],
    ]);
    assert.deepEqual(rows[0].blocks, original, "the week before its first change here");
    assert.equal(rows[1].summary, "Part 1: new title for Ada Example’s reading");
    assert.deepEqual(rows[1].work, { ticks: 1, answers: 0, takenOut: 0 });
    assert.equal(rows[1].reach.groups, 4);
    assert.equal(rows[1].asked["rp-1"].text, "Pick a question you care about. What is its base rate?");
    await change("claudia", "tx-before", { body: "Rest first." });
    rows = saves();
    assert.deepEqual(rows.map((row) => row.kind), ["found", "edit", "edit"]);

    const list = await ask("zach", R.history.GET, AT);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.saves.map((row) => [row.id, row.by, row.current]), [
      ["s000003", "Claudia", true],
      ["s000002", "Zach", false],
      ["s000001", null, false],
    ]);
    assert.equal(list.body.saves[1].kept, "1 tick kept");
    assert.equal(list.body.saves[1].reach, "Every group (4)");
    assert.equal(list.body.saves[0].when, "Tue 17 Nov, 12pm");
  });

  test("a week changed where no history is kept is found again before the next save", async () => {
    seedWeek();
    await change("zach", "src-1", { title: "Base rates, a field guide" });
    const doc = stored();
    doc.blocks[1].body = [{ type: "p", runs: [{ text: "Changed elsewhere." }] }];
    world.db.seed(W3, doc);
    await change("zach", "tx-before", { body: "Rest first." });
    const rows = saves();
    assert.deepEqual(rows.map((row) => row.kind), ["found", "edit", "found", "edit"]);
    assert.equal(rows[2].summary, "The week as it stood, changed where no history is kept");
  });

  test("compare a save with now, and restore it as a new save that brings back what it said", async () => {
    seedWeek();
    await change("zach", "src-1", { url: "https://example.com/moved" }, { reading: "same" });
    const compared = await ask("claudia", R.save.GET, { ...AT, saveId: "s000001" });
    assert.equal(compared.status, 200, JSON.stringify(compared.body));
    assert.deepEqual(compared.body.comparison.rows.map((row) => [row.state, row.blockId, row.fields]), [["changed", "src-1", "link"]]);
    assert.equal(compared.body.line, "Changed: 1");
    assert.deepEqual(compared.body.restore.answers, 0);

    const restored = await ask("claudia", R.restore.POST, { ...AT, saveId: "s000001" }, { body: { base: compared.body.restore.base } });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(stored().blocks[5].blocks[0].url, "https://example.com/base-rates");
    const rows = saves();
    assert.equal(rows.at(-1).kind, "restore");
    assert.equal(rows.at(-1).restoredFrom, 1);
    assert.match(rows.at(-1).summary, /^Restored the version from /);
    assert.equal(rows.length, 3, "nothing earlier is overwritten: the history only grows");

    const stale = await ask("claudia", R.restore.POST, { ...AT, saveId: "s000002" }, { body: { base: compared.body.restore.base } });
    assert.equal(stale.status, 409, "a week changed since the page looked is refused");
  });

  test("a restore that takes out answered items asks for the count first, and keeps the answers stored", async () => {
    seedWeek();
    // A paste that adds a reflection, answered after it lands.
    const doc = stored();
    await change("zach", "src-1", { title: "Base rates, a field guide" });
    const added = structuredClone(stored());
    added.blocks[5].blocks.push({ id: "rs-9", type: "reflection", prompts: [{ id: "rp-9", text: "A new question?" }] });
    world.db.seed(W3, added);
    world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__rp-9`, { runId: RUN.agi, uid: "kofi", weekId: "w03", exerciseId: "rp-9", kind: "reflection", text: "Yes." });
    const compared = await ask("zach", R.save.GET, { ...AT, saveId: "s000001" });
    assert.equal(compared.body.restore.answers, 1);
    const asked = await ask("zach", R.restore.POST, { ...AT, saveId: "s000001" }, { body: { base: compared.body.restore.base } });
    assert.equal(asked.status, 409);
    assert.equal(asked.body.answers, 1);
    const done = await ask("zach", R.restore.POST, { ...AT, saveId: "s000001" }, { body: { base: compared.body.restore.base, confirmAnswers: 1 } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(stored().blocks, doc.blocks);
    assert.ok(world.db.read(`courseExerciseResponses/${RUN.agi}__kofi__w03__rp-9`), "the answer stays with the person who wrote it");
  });

  test("the paste goes in the history, and its check says what it holds and what it changes", async () => {
    seedWeek();
    const check = await ask("zach", R.paste.POST, AT, { body: { markdown: syntheticGuideMarkdown() } });
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.ok(check.body.kinds.length > 0);
    assert.equal(check.body.kinds[0].label, "This week");
    assert.equal(typeof check.body.comparisonLine, "string");
    assert.ok(Array.isArray(check.body.comparison.rows));
    const saved = await ask("zach", R.paste.PUT, AT, { body: { markdown: syntheticGuideMarkdown(), confirmAnswers: check.body.answers } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const rows = saves();
    assert.deepEqual(rows.map((row) => row.kind), ["found", "paste"]);
    assert.match(rows[1].summary, /^Pasted the week: \d+ blocks$/);
    assert.equal(saved.body.saveId, "s000002");
  });

  test("a paste onto a week written before blocks keeps no week as found: there are no blocks to keep", async () => {
    const params = { runId: RUN.agi, weekId: "w06" };
    const path = `courseRuns/${RUN.agi}/weeks/w06`;
    assert.equal(Array.isArray(world.db.read(path).blocks), false, "week 6 is written before blocks");
    const markdown = syntheticGuideMarkdown().replace("# Week 3:", "# Week 6:");
    const check = await ask("zach", R.paste.POST, params, { body: { markdown } });
    assert.equal(check.status, 200, JSON.stringify(check.body));
    const saved = await ask("zach", R.paste.PUT, params, { body: { markdown, confirmAnswers: check.body.answers } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const rows = world.db.paths().filter((p) => p.startsWith(`${path}/history/`));
    assert.deepEqual(rows, [`${path}/history/s000001`]);
    assert.equal(world.db.read(rows[0]).kind, "paste");
  });
});

// ---------------------------------------------------------------------------
// 4. One editor at a time
// ---------------------------------------------------------------------------

describe("4. the week's lock", () => {
  test("taken by one editor, it refuses the other's saves with the holder's name, and lapses by itself", async () => {
    seedWeek();
    const taken = await ask("zach", R.lock.POST, AT);
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.lock.state, "yours");
    const seen = await ask("claudia", R.lock.GET, AT);
    assert.deepEqual(seen.body.lock, { state: "held", name: "Zach", since: "12pm", line: LOCK_WORDS.heldBy("Zach", 3, "12pm") });
    const theirs = await ask("claudia", R.lock.POST, AT);
    assert.equal(theirs.status, 409);
    const blocked = await change("claudia", "src-1", { title: "Claudia's title" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, LOCK_WORDS.heldBy("Zach", 3, "12pm"));
    assert.deepEqual(blocked.body.holder, { name: "Zach", since: "12pm" });
    const paste = await ask("claudia", R.paste.PUT, AT, { body: { markdown: syntheticGuideMarkdown(), confirmAnswers: 3 } });
    assert.ok([409].includes(paste.status), JSON.stringify(paste.body));
    // The holder's own saves go through, and reading is never blocked.
    assert.equal((await change("zach", "src-1", { title: "Zach's title" })).status, 200);
    assert.equal((await ask("claudia", R.editor.GET, AT)).status, 200);
    // Not kept alive, it lapses.
    mock.timers.setTime(NOW.getTime() + LOCK_TTL_MS + 1000);
    assert.equal((await ask("claudia", R.lock.GET, AT)).body.lock.state, "free");
    assert.equal((await change("claudia", "src-1", { title: "Claudia's title" })).status, 200);
  });

  test("kept alive while open, lost once somebody else takes a lapsed one, given back when closed", async () => {
    seedWeek();
    await ask("zach", R.lock.POST, AT);
    mock.timers.setTime(NOW.getTime() + 30_000);
    assert.equal((await ask("zach", R.lock.PUT, AT)).status, 200);
    mock.timers.setTime(NOW.getTime() + 30_000 + LOCK_TTL_MS + 1);
    assert.equal((await ask("claudia", R.lock.POST, AT)).status, 200);
    const lost = await ask("zach", R.lock.PUT, AT);
    assert.deepEqual([lost.status, lost.body.error], [409, LOCK_WORDS.lost]);
    const notTheirs = await ask("zach", R.lock.DELETE, AT);
    assert.equal(notTheirs.body.lock.state, "held", "giving back what you do not hold changes nothing");
    assert.ok(world.db.read(LOCK));
    const given = await ask("claudia", R.lock.DELETE, AT);
    assert.equal(given.body.lock.state, "free");
    assert.equal(world.db.read(LOCK), undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. Telling people
// ---------------------------------------------------------------------------

describe("5. telling people about a change", () => {
  async function savedLink() {
    seedWeek();
    const saved = await change("zach", "src-1", { url: "https://example.com/base-rates-moved" }, { reading: "same" });
    assert.equal(saved.status, 200);
    return saved.body.saveId;
  }

  test("the preview: a count for each choice and the email's words, nothing written", async () => {
    const saveId = await savedLink();
    const before = everything();
    const preview = await ask("claudia", R.tell.GET, AT, { query: `?save=${saveId}` });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(everything(), before);
    assert.equal(preview.body.canTell, true);
    assert.deepEqual(preview.body.choices.map((choice) => choice.audience), ["nobody", "started", "open", "programme"]);
    const started = preview.body.choices.find((choice) => choice.audience === "started");
    assert.equal(started.count, 2, "Chloe and Farah: the two with work on the week and a told place");
    const open = preview.body.choices.find((choice) => choice.audience === "open");
    const programme = preview.body.choices.find((choice) => choice.audience === "programme");
    assert.ok(open.count >= started.count && programme.count >= open.count, "each choice reaches at least the one before it");
    assert.equal(preview.body.letter.subject, "A new link for a week 3 reading");
    assert.equal(
      preview.body.letter.lines[0],
      "The link to Ada Example’s “A field guide to base rates”, in week 3’s part 1, has changed. Your ticks are as they were.",
    );
  });

  test("sent only with the count it was shown, to the choice, as a notice, never to the presser; once", async () => {
    const saveId = await savedLink();
    const preview = await ask("zach", R.tell.GET, AT, { query: `?save=${saveId}` });
    const started = preview.body.choices.find((choice) => choice.audience === "started");
    const wrong = await ask("zach", R.tell.POST, AT, { body: { save: saveId, audience: "started", count: started.count + 1 } });
    assert.deepEqual([wrong.status, wrong.body.count], [409, started.count]);
    assert.equal(world.mail.length, 0);
    const sent = await ask("zach", R.tell.POST, AT, { body: { save: saveId, audience: "started", count: started.count } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(world.mail.length, started.count);
    for (const message of world.mail) {
      assert.equal(message.kind, "notice");
      assert.equal(message.surface, "course-run");
      assert.equal(message.subject, "A new link for a week 3 reading");
      assert.doesNotMatch(JSON.stringify(message), /meet\.google|zoom\.us|teams\.microsoft/i);
    }
    const save = saves().find((row) => row.id === saveId);
    assert.equal(save.told.audience, "started");
    assert.equal(save.told.count, started.count);
    const again = await ask("zach", R.tell.POST, AT, { body: { save: saveId, audience: "started", count: started.count } });
    assert.deepEqual([again.status, again.body.error], [409, TELL_REFUSAL.alreadyTold]);
  });

  test("Send me a test first reaches the presser alone, marked [TEST], and tells nobody", async () => {
    const saveId = await savedLink();
    const test1 = await ask("claudia", R.tell.POST, AT, { body: { save: saveId, test: true } });
    assert.equal(test1.status, 200, JSON.stringify(test1.body));
    assert.equal(world.mail.length, 1);
    assert.equal(world.mail[0].subject, "[TEST] A new link for a week 3 reading");
    assert.equal(world.mail[0].kind, "course-test");
    assert.equal(saves().find((row) => row.id === saveId).told, null);
  });

  test("only the newest save can be told about", async () => {
    const saveId = await savedLink();
    await change("zach", "tx-before", { body: "Rest first." });
    const preview = await ask("zach", R.tell.GET, AT, { query: `?save=${saveId}` });
    assert.equal(preview.body.canTell, false);
    const refused = await ask("zach", R.tell.POST, AT, { body: { save: saveId, audience: "programme", count: 1 } });
    assert.deepEqual([refused.status, refused.body.error], [409, TELL_REFUSAL.notLatest]);
    assert.equal(world.mail.length, 0);
  });

  test("a week that is not published has nobody to tell", async () => {
    seedWeek({ published: false });
    const saved = await change("zach", "src-1", { title: "Base rates" });
    const refused = await ask("zach", R.tell.POST, AT, { body: { save: saved.body.saveId, audience: "programme", count: 1 } });
    assert.deepEqual([refused.status, refused.body.error], [400, TELL_REFUSAL.notLive]);
  });
});

// ---------------------------------------------------------------------------
// 6. They go with the run
// ---------------------------------------------------------------------------

/** The store as the destroy reads it: a count is the rows a query returns. */
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

describe("6. a run's destroy counts and deletes each week's history and lock", () => {
  test("counted on the manifest, drained before the weeks, nothing left under them", async () => {
    seedWeek();
    await change("zach", "src-1", { title: "Base rates, a field guide" });
    await change("zach", "tx-before", { body: "Rest first." });
    await ask("claudia", R.lock.POST, AT);
    assert.equal(saves().length, 3);
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
    const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.weekHistory, 3);
    assert.equal(counts.weekEditLocks, 1);
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.weekHistory, 3, JSON.stringify(result));
    assert.equal(result.deleted.weekEditLocks, 1);
    assert.deepEqual(world.db.paths().filter((path) => path.startsWith(`courseRuns/${RUN.agi}/`)), []);
  });

  test("a run being destroyed is no run to edit: nothing is written behind the cascade", async () => {
    seedWeek();
    const item = await itemOf("zach", "src-1");
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const before = everything();
    const refused = await ask("zach", R.block.PATCH, { ...AT, blockId: "src-1" }, { body: { base: item.fingerprint, fields: { title: "x" } } });
    assert.equal(refused.status, 404);
    assert.equal((await ask("zach", R.lock.POST, AT)).status, 404);
    assert.equal((await ask("zach", R.paste.PUT, AT, { body: { markdown: syntheticGuideMarkdown(), confirmAnswers: 3 } })).status, 404);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 7. The words a question had when it was answered
// ---------------------------------------------------------------------------

describe("7. the words a question had when it was answered, beside the answer", () => {
  const OLD_PROMPT = "Pick a question you care about. What is its base rate?";
  const NEW_PROMPT = "What is your question's base rate, roughly?";

  test("the person's own week page is handed the words their reflection answered, and only once they changed", async () => {
    seedWeek();
    const before = await ask("chloe", R.myExercises.GET, { runId: RUN.agi }, { query: "?week=3" });
    assert.equal(before.status, 200, JSON.stringify(before.body));
    assert.deepEqual(before.body.askedThen, {}, "nothing changed in place: nothing to say");
    await change("zach", "rs-1", { prompts: [{ id: "rp-1", text: NEW_PROMPT }, { id: "rp-2", text: "What makes your case different from the base rate?" }] });
    const after = await ask("chloe", R.myExercises.GET, { runId: RUN.agi }, { query: "?week=3" });
    assert.deepEqual(after.body.askedThen, { "rp-1": { kind: "prompt", text: OLD_PROMPT } });
    // An answer first written after the change was written to today's words.
    world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__rp-1`, { firstWrittenAt: new Date(NOW.getTime() + 60_000) });
    const later = await ask("chloe", R.myExercises.GET, { runId: RUN.agi }, { query: "?week=3" });
    assert.deepEqual(later.body.askedThen, {});
  });

  test("the staff pages' loaders: a written answer's range when it was written, and a reflection's prompt", async () => {
    seedWeek();
    await change("zach", "wa-1", { words: { min: 250, max: 400 } });
    const { askedThenFor, personAskedThen } = await loadTs(join("lib", "courses", "weekEdit", "askedThen.ts"));
    const found = await askedThenFor(world.courseDb, RUN.agi, "w03", null, [{ key: "farah", itemId: "wa-1", writtenAt: T_WROTE }]);
    assert.deepEqual(found.get("farah").words, { min: 200, max: 300 });
    const person = await personAskedThen(world.courseDb, RUN.agi, "farah", null);
    assert.deepEqual(Object.keys(person), ["3 wa-1"]);
    assert.equal(person["3 wa-1"].kind, "writtenAnswer");
  });
});
