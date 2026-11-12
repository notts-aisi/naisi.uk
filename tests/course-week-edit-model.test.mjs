/**
 * Changing one block of a week where it stands: the pure half
 * (`src/lib/courses/weekEdit/model.ts`), the comparison of two versions
 * (`compare.ts`) and the words a question had when it was answered
 * (`wordsThen.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The week is `tests/lib/weekBlocksFixture.mjs`: made-up words in the
 * guide's shape, every kind of block in it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const edit = await loadTs("lib/courses/weekEdit/model.ts");
const { compareWeeks, comparisonLine, kindsIn } = await loadTs("lib/courses/weekEdit/compare.ts");
const { askedOf, earlierWords, versionInForce, wordsInForce } = await loadTs("lib/courses/weekEdit/wordsThen.ts");
const weekBlocks = await loadTs("lib/courses/weekBlocks/model.ts");
const { EDIT_REFUSAL } = await loadTs("lib/courses/weekEdit/words.ts");

const blocks = () => syntheticWeekBlocks();
const find = (list, id) => weekBlocks.allBlocks(list).find((block) => block.id === id) ?? null;
const ids = (list) => weekBlocks.weekItems(list).map((item) => `${item.kind}:${item.id}`);
const base = (list, id) => edit.blockFingerprint(find(list, id));
const part = (list, id) => list.find((block) => block.id === id);

/** A save's body for the block `id` of `list`, with `fields`. */
function body(list, id, fields, extra = {}) {
  const type = find(list, id).type;
  const parsed = edit.parseEditBody({ base: base(list, id), fields, ...extra }, type);
  assert.ok(!("error" in parsed), JSON.stringify(parsed));
  return parsed;
}

// ---------------------------------------------------------------------------
// 1. Every edit keeps every id, so every tick and answer stays with its block
// ---------------------------------------------------------------------------

describe("1. an edit in place keeps every id in the week", () => {
  const CASES = [
    ["a source: a new title and the same reading at a new address", "src-1", { title: "A field guide to base rates, revised", url: "https://example.com/base-rates-2" }, { reading: "same" }],
    ["a source: its kind, author, date, time and note", "src-7", { kind: "watchOrRead", by: "Example Press", date: "2025", time: "6 minutes", note: "Only the *first* table." }, {}],
    ["a text: its words", "tx-before", { body: "Work through the parts **in order**.\n\nThen rest." }, {}],
    ["a text inside a part: its words", "tx-2", { body: "- Write a number.\n- Write two reasons." }, {}],
    ["a reflection: both prompts reworded", "rs-1", { prompts: [{ id: "rp-1", text: "What is your question's base rate?" }, { id: "rp-2", text: "Why might yours differ?" }] }, {}],
    ["a written answer: question, guidance, range and due rule", "wa-1", { question: "Will it come true **next year**?", guidance: "Name the base rate.", words: { min: 250, max: 400 }, due: "before" }, {}],
  ];
  for (const [what, id, fields, extra] of CASES) {
    test(what, () => {
      const week = blocks();
      const applied = edit.applyBlockEdit(week, id, body(week, id, fields, extra));
      assert.equal(applied.ok, true, applied.error);
      assert.deepEqual(ids(applied.blocks), ids(week), "every id, on the same kind of thing, in the same place");
      assert.equal(applied.noChange, false);
      assert.deepEqual(weekBlocks.sanitizeWeekBlocks(applied.blocks), applied.blocks, "it reads back exactly as written");
      assert.deepEqual(weekBlocks.weekBlocksProblems(applied.blocks), [], "the paste's own checks pass");
      // Nothing but this block (and, for a written answer, the words repeating its range) changed.
      const others = (list) => JSON.stringify(list.filter((block) => block.id !== "tw-1").map((block) => (block.type === "part" ? { ...block, blocks: block.blocks.filter((child) => child.id !== id) } : block)).filter((block) => block.id !== id));
      if (id !== "wa-1") assert.equal(others(applied.blocks), others(week));
    });
  }

  test("a written answer's new range is put right where other blocks repeat it, and only there", () => {
    const week = blocks();
    week[0].rows[1].what = "Part 4: your forecast, the week’s written answer (200 to 300 words)";
    const partFour = week.find((block) => block.id === "pt-4");
    partFour.time = "200 to 300 words";
    const applied = edit.applyBlockEdit(week, "wa-1", body(week, "wa-1", { words: { min: 250, max: 400 } }));
    assert.equal(applied.ok, true, applied.error);
    assert.equal(applied.blocks[0].rows[1].what, "Part 4: your forecast, the week’s written answer (250 to 400 words)");
    assert.equal(applied.blocks.find((block) => block.id === "pt-4").time, "250 to 400 words");
    assert.equal(applied.blocks[0].rows[0].what, week[0].rows[0].what, "a row that covers something else is left as written");
    assert.deepEqual(applied.change.followed, ["This week’s line for Part 4", "Part 4’s heading"]);
  });

  test("a written answer's heading is its part's title, and the part keeps its id", () => {
    const week = blocks();
    const applied = edit.applyBlockEdit(week, "wa-1", body(week, "wa-1", { heading: "Your forecast" }));
    assert.equal(applied.ok, true);
    assert.equal(applied.blocks.find((block) => block.id === "pt-4").title, "Your forecast");
    assert.deepEqual(applied.change.changed, ["heading"]);
  });

  test("saving what is stored changes nothing, and says so", () => {
    const week = blocks();
    const applied = edit.applyBlockEdit(week, "src-1", body(week, "src-1", { title: "A field guide to base rates" }));
    assert.equal(applied.ok, true);
    assert.equal(applied.noChange, true);
  });

  test("the editor's fields go out as Markdown and come back as the same block", () => {
    const week = blocks();
    for (const id of ["src-1", "src-7", "tx-before", "tx-why", "rs-1", "wa-1"]) {
      const located = edit.locateBlock(week, id);
      const shown = edit.editorFieldsOf(located);
      const fields = { ...shown.fields };
      for (const key of ["role", "headingAllowed", "timeAllowed", "boxes"]) delete fields[key];
      if (shown.type === "text" && !shown.fields.timeAllowed) delete fields.time;
      if (shown.type === "text" && !shown.fields.headingAllowed) delete fields.heading;
      if (shown.type === "writtenAnswer" && fields.heading === null) delete fields.heading;
      const applied = edit.applyBlockEdit(week, id, body(week, id, fields));
      assert.equal(applied.ok, true, `${id}: ${applied.error}`);
      assert.equal(applied.noChange, true, `${id} came back changed`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What is refused, in one sentence each
// ---------------------------------------------------------------------------

describe("2. what an edit refuses", () => {
  test("every other kind of block, with the paste named", () => {
    const week = blocks();
    const parsed = { base: base(week, "co-1"), edit: { type: "source", fields: { title: "x" }, reading: null } };
    const applied = edit.applyBlockEdit(week, "co-1", parsed);
    assert.deepEqual(applied, { ok: false, status: 400, error: EDIT_REFUSAL.kind });
    assert.equal(edit.isEditableType("chooseOne"), false);
    assert.equal(edit.isEditableType("handsOn"), false);
  });

  test("a block that changed since the editor loaded it: 409, load the week again", () => {
    const week = blocks();
    const stale = body(week, "src-1", { title: "New" });
    part(week, "pt-1").blocks[0].time = "16 minutes";
    assert.deepEqual(edit.applyBlockEdit(week, "src-1", stale), { ok: false, status: 409, error: EDIT_REFUSAL.blockChanged });
    assert.deepEqual(edit.applyBlockEdit(week, "src-gone", stale), { ok: false, status: 409, error: EDIT_REFUSAL.blockGone });
  });

  test("a changed link must say it is the same reading; a different reading is not built yet", () => {
    const week = blocks();
    const silent = edit.applyBlockEdit(week, "src-1", body(week, "src-1", { url: "https://example.com/elsewhere" }));
    assert.deepEqual(silent, { ok: false, status: 400, error: EDIT_REFUSAL.sayWhichReading });
    const different = edit.applyBlockEdit(week, "src-1", body(week, "src-1", { url: "https://example.com/elsewhere" }, { reading: "different" }));
    assert.deepEqual(different, { ok: false, status: 400, error: EDIT_REFUSAL.differentReading });
  });

  test("the paste's own checks: a link that is not https, a title over its cap, an empty prompt, a range the wrong way round", () => {
    const week = blocks();
    const refused = (id, fields, extra) => edit.applyBlockEdit(week, id, body(week, id, fields, extra));
    assert.match(refused("src-1", { url: "http://example.com/x" }, { reading: "same" }).error, /needs an https link/);
    assert.match(refused("src-1", { title: "x".repeat(301) }).error, /the title is 301 characters; the most is 300/);
    assert.match(refused("rs-1", { prompts: [{ id: "rp-1", text: "  " }, { id: "rp-2", text: "Fine" }] }).error, /empty prompt/);
    assert.match(refused("wa-1", { words: { min: 400, max: 250 } }).error, /smaller number to a larger one/);
    assert.match(refused("tx-before", { body: "A [link](http://example.com/x)." }).error, /isn’t an https link/);
    assert.match(refused("tx-before", { body: "<div>bold</div>\n\nText" }).error, /HTML can’t go in a week/);
    assert.match(refused("src-7", { note: "One.\n\nTwo." }).error, /is one line/);
    // Facilitator material never goes in a week, by the paste's own refusal.
    assert.match(refused("tx-before", { body: "## Run sheet\n\nTen minutes on the reading." }).error, /Facilitator material never goes in a week/);
    assert.match(refused("wa-1", { guidance: "## Answer key\n\nThe base rate is ten percent." }).error, /Facilitator material never goes in a week/);
  });

  test("a reflection keeps its prompts: no more, no fewer, none swapped", () => {
    const week = blocks();
    const refused = (prompts) => edit.applyBlockEdit(week, "rs-1", body(week, "rs-1", { prompts })).error;
    assert.equal(refused([{ id: "rp-1", text: "Only one now" }]), EDIT_REFUSAL.samePrompts);
    assert.equal(refused([{ id: "rp-2", text: "a" }, { id: "rp-1", text: "b" }]), EDIT_REFUSAL.samePrompts);
  });

  test("a body that is not one: unknown fields, wrong types, no fingerprint", () => {
    assert.deepEqual(edit.parseEditBody(null, "source"), { error: EDIT_REFUSAL.body });
    assert.deepEqual(edit.parseEditBody({ fields: { title: "x" } }, "source"), { error: EDIT_REFUSAL.base });
    assert.deepEqual(edit.parseEditBody({ base: "0123456789abcdef", fields: {} }, "source"), { error: EDIT_REFUSAL.nothing });
    assert.deepEqual(edit.parseEditBody({ base: "0123456789abcdef", fields: { packs: [] } }, "source"), { error: EDIT_REFUSAL.unknownField("packs") });
    assert.deepEqual(edit.parseEditBody({ base: "0123456789abcdef", fields: { title: 3 } }, "source"), { error: EDIT_REFUSAL.notText("title") });
    assert.deepEqual(edit.parseEditBody({ base: "0123456789abcdef", fields: { words: { min: 1.5, max: 3 } } }, "writtenAnswer"), { error: EDIT_REFUSAL.wordsShape });
  });
});

// ---------------------------------------------------------------------------
// 3. The history's line for an edit
// ---------------------------------------------------------------------------

describe("3. the history's line", () => {
  test("in the week's own words", () => {
    const week = blocks();
    const line = (id, fields, extra) => {
      const applied = edit.applyBlockEdit(week, id, body(week, id, fields, extra));
      return edit.editSummary(applied.change, edit.locateBlock(applied.blocks, id));
    };
    assert.equal(line("src-1", { url: "https://example.com/new" }, { reading: "same" }), "Part 1: new link for Ada Example’s reading");
    assert.equal(line("src-1", { title: "Base rates", url: "https://example.com/new" }, { reading: "same" }), "Part 1: new title and link for Ada Example’s reading");
    assert.equal(line("rs-1", { prompts: [{ id: "rp-1", text: "Reworded" }, { id: "rp-2", text: "What makes your case different from the base rate?" }] }), "Part 1: reflection reworded");
    assert.equal(line("wa-1", { words: { min: 250, max: 400 } }), "Part 4: written answer’s word range now 250 to 400");
    assert.equal(line("tx-why", { body: "Reworded." }), "“Why this week”: text reworded");
  });
});

// ---------------------------------------------------------------------------
// 4. Comparing two versions
// ---------------------------------------------------------------------------

describe("4. compare", () => {
  test("the same week: nothing differs", () => {
    const result = compareWeeks({ title: "T", blocks: blocks() }, { title: "T", blocks: blocks() });
    assert.equal(result.same, true);
    assert.equal(comparisonLine(result, 0), "No block differs.");
  });

  test("a changed source, a removed reflection and an added text, block by block", () => {
    const before = blocks();
    const after = blocks();
    part(after, "pt-1").blocks[0].url = "https://example.org/moved";
    part(after, "pt-1").blocks = part(after, "pt-1").blocks.filter((block) => block.id !== "rs-1");
    part(after, "pt-1").blocks.push({ id: "tx-new", type: "text", role: "plain", heading: "", time: "", body: [{ type: "p", runs: [{ text: "New words." }] }] });
    const result = compareWeeks({ title: "T", blocks: before }, { title: "T2", blocks: after });
    assert.deepEqual(
      result.rows.map((row) => [row.state, row.blockId, row.place, row.fields]),
      [
        ["changed", "src-1", "Part 1’s source", "link"],
        ["added", "tx-new", "Part 1’s text", ""],
        ["removed", "rs-1", "Part 1’s reflection", ""],
      ],
    );
    assert.deepEqual(result.rows[2].itemsTakenOut, ["rs-1", "rp-1", "rp-2"]);
    assert.match(result.rows[0].before[0], /example\.com link$/);
    assert.match(result.rows[0].after[0], /example\.org link$/);
    assert.deepEqual(result.title, { before: "T", after: "T2" });
    assert.equal(comparisonLine(result, 2), "Changed: 1 · Added: 1 · Removed: 1, 2 answers kept with the people who wrote them");
  });

  test("what a pasted week holds, by kind", () => {
    const kinds = kindsIn(blocks());
    assert.equal(kinds[0].label, "This week");
    assert.equal(kinds.find((kind) => kind.type === "source").count, 4);
    assert.equal(kinds.find((kind) => kind.type === "part").count, 5);
  });
});

// ---------------------------------------------------------------------------
// 5. The words a question had when it was answered
// ---------------------------------------------------------------------------

describe("5. the words then", () => {
  const at = (iso) => new Date(iso);
  const before = blocks();
  const reworded = blocks();
  part(reworded, "pt-1").blocks[2].prompts[0].text = "What is your question's base rate, roughly?";
  const ranged = structuredClone(reworded);
  ranged.find((block) => block.id === "pt-4").blocks[0].words = { min: 250, max: 400 };
  const versions = [
    { seq: 1, at: at("2026-11-10T14:00:00Z"), asked: askedOf(before) },
    { seq: 2, at: at("2026-11-10T14:00:00Z"), asked: askedOf(reworded) },
    { seq: 3, at: at("2026-11-12T09:00:00Z"), asked: askedOf(ranged) },
  ];
  const now = askedOf(ranged);

  test("a save's words of every prompt and written answer", () => {
    const asked = askedOf(before);
    assert.deepEqual(asked["rp-1"], { kind: "prompt", text: "Pick a question you care about. What is its base rate?" });
    assert.equal(asked["wa-1"].kind, "writtenAnswer");
    assert.deepEqual(asked["wa-1"].words, { min: 200, max: 300 });
    assert.equal(asked["wa-1"].due, "dayBefore");
  });

  test("the save in force: the last at or before the moment, else the first", () => {
    assert.equal(versionInForce(versions, at("2026-11-01T00:00:00Z")).seq, 1, "before every save: the week as found");
    assert.equal(versionInForce(versions, at("2026-11-10T14:00:00Z")).seq, 2, "two saves at one moment: the later");
    assert.equal(versionInForce(versions, at("2026-11-11T00:00:00Z")).seq, 2);
    assert.equal(versionInForce(versions, null).seq, 1, "no moment known: the earliest words");
    assert.equal(versionInForce([], at("2026-11-11T00:00:00Z")), null);
  });

  test("earlier words only when they differ from now", () => {
    assert.deepEqual(earlierWords(versions, now, "rp-1", at("2026-11-05T10:00:00Z")), {
      kind: "prompt",
      text: "Pick a question you care about. What is its base rate?",
    });
    assert.equal(earlierWords(versions, now, "rp-1", at("2026-11-11T10:00:00Z")), null, "written to today's words");
    assert.equal(earlierWords(versions, now, "rp-2", at("2026-11-05T10:00:00Z")), null, "never reworded");
    assert.deepEqual(earlierWords(versions, now, "wa-1", at("2026-11-11T10:00:00Z")).words, { min: 200, max: 300 });
    assert.equal(earlierWords([], now, "rp-1", at("2026-11-05T10:00:00Z")), null, "a week never changed here");
    assert.equal(wordsInForce(versions, "nothing", null), null);
  });
});

// ---------------------------------------------------------------------------
// 6. Every block saved back unchanged comes back identical
// ---------------------------------------------------------------------------

describe("6. every block that can be changed in place, saved back unchanged, comes back identical", () => {
  /** Prose read from Markdown exactly as a save reads it. */
  const prose = (markdown) => {
    const read = edit.proseFromMarkdown("A test", markdown);
    assert.ok(read.ok, JSON.stringify(read));
    return read.value;
  };
  const runs = (markdown) => {
    const read = edit.runsFromMarkdown("A test", markdown);
    assert.ok(read.ok, JSON.stringify(read));
    return read.value;
  };
  /** Every kind of Markdown the reader keeps: paragraphs, bold, italics, links (https and mailto), both lists, a table and code. */
  const EVERY_KIND = [
    "A paragraph with **bold**, *italics*, ***both***, a [link](https://example.com/a?b=1) and [an address](mailto:someone@example.com).",
    "- A point\n- A point with **bold** and a [link](https://example.org/x)",
    "1. First\n2. Second, *in italics*",
    "| When | What |\n| --- | --- |\n| Monday | **Read** the [diary](https://example.com/d) |\n| Tuesday | Write |",
    "```python\nprint('hello')\n```",
    "A last paragraph.",
  ].join("\n\n");

  test("the synthetic week, every kind of block in it: no problem", () => {
    assert.deepEqual(edit.roundTripProblems(blocks()), []);
  });

  test("a text, a source, a reflection and a written answer holding every kind of Markdown the reader keeps: no problem", () => {
    const week = weekBlocks.sanitizeWeekBlocks([
      { id: "tx-every", type: "text", role: "plain", heading: "", time: "", body: prose(EVERY_KIND) },
      { id: "tx-section", type: "text", role: "section", heading: "A section", time: "", body: prose(EVERY_KIND) },
      { id: "tx-before", type: "text", role: "before", heading: "Before the session", time: "About 10 minutes", body: prose(EVERY_KIND) },
      {
        id: "pt-every",
        type: "part",
        title: "Every kind of Markdown",
        time: "About 20 minutes",
        framing: prose("Framing with **bold** and *italics*."),
        blocks: [
          {
            id: "src-every",
            type: "source",
            kind: "read",
            lead: "",
            title: "A field guide",
            url: "https://example.com/guide",
            by: "Ada Example",
            date: "2024",
            time: "20 minutes",
            compute: "",
            note: runs("Read **sections 1 and 2**, *slowly*, then [the appendix](https://example.com/appendix)."),
          },
          { id: "tx-in-part", type: "text", role: "plain", heading: "A text in a part", time: "", body: prose(EVERY_KIND) },
          { id: "rs-every", type: "reflection", prompts: [{ id: "rp-every-1", text: "What did you notice?" }, { id: "rp-every-2", text: "What would you change?" }] },
          {
            id: "wa-every",
            type: "writtenAnswer",
            prompt: prose(EVERY_KIND),
            boxes: [],
            guidance: prose("A strong answer is **specific**.\n\n- Names its source\n- Says what would change it"),
            words: { min: 200, max: 300 },
            due: "dayBefore",
          },
        ],
      },
    ]);
    assert.equal(weekBlocks.allBlocks(week).length, 8, "the reader kept every block");
    const kinds = new Set(find(week, "tx-every").body.map((paragraph) => paragraph.type));
    assert.deepEqual([...kinds].sort(), ["code", "ol", "p", "table", "ul"], "every kind of Markdown is in the block");
    assert.deepEqual(edit.roundTripProblems(week), []);
  });

  test("a block that does not come back identical is named, with the field", () => {
    // A source stored with spaces a save trims, alone in its week: saving it back as loaded changes it.
    const source = structuredClone(find(blocks(), "src-1"));
    source.title = "  A field guide to base rates  ";
    const problems = edit.roundTripProblems([source]);
    assert.ok(problems.length > 0, "nothing reported");
    assert.ok(problems.every((problem) => problem.blockId === "src-1" && problem.type === "source"), JSON.stringify(problems));
    assert.ok(problems.some((problem) => problem.field === "title"), JSON.stringify(problems));
    for (const problem of problems) assert.ok(typeof problem.problem === "string" && problem.problem.length > 0);
    // Read as the reader of weeks reads it, the same source comes back identical.
    assert.deepEqual(edit.roundTripProblems(weekBlocks.sanitizeWeekBlocks([source])), []);
  });
});
