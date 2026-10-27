/**
 * The format a week is written in (`docs/course-weeks.md`): the reader
 * (Markdown to blocks), the writer (blocks to Markdown, "Copy as Markdown"),
 * the ids a paste keeps (K16), and what the loader says it found and what to
 * check (board pr-weeks, Option B), in the board's words.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   weekToMarkdown                 the canonical form, ids written in
 *   readWeekMarkdown               the guide's shape and the canonical form, read
 *   mergeWeekIds, finishWeekBlocks ids kept by kind, fresh ones minted, what goes said
 *   readPastedWeek                 the whole read: found, checks, problems
 *
 * Two weeks, both made up (`tests/lib/weekBlocksFixture.mjs`): the
 * synthetic week as stored, every kind of block in it, and a week in the
 * guide's own shape as its export pastes, with no ids.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { createLoader } from "./lib/tsLoader.mjs";
import { syntheticGuideMarkdown, syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const { weekToMarkdown } = await loadTs("lib/courses/weekBlocks/markdownWrite.ts");
const { readWeekMarkdown } = await loadTs("lib/courses/weekBlocks/markdownRead.ts");
const { mergeWeekIds, finishWeekBlocks, coversFor } = await loadTs("lib/courses/weekBlocks/merge.ts");
const { readPastedWeek } = await loadTs("lib/courses/weekBlocks/paste.ts");
const model = await loadTs("lib/courses/weekBlocks/model.ts");

/** A counter for fresh ids, so a test can say which it expects. */
function counter() {
  let n = 0;
  return (prefix) => `${prefix}-new${++n}`;
}

const TITLE = "How sure are you?";
const copy = (blocks = syntheticWeekBlocks()) => weekToMarkdown({ weekNumber: 3, title: TITLE, blocks });
const paste = (markdown, stored = syntheticWeekBlocks(), weekNumber = 3, dayBeforeTime = null) =>
  readPastedWeek({ markdown, weekNumber, stored, dayBeforeTime, mint: counter() });

/** The words of some Markdown, addresses and ids left out, as a count of each. */
function wordBag(markdown) {
  const bag = new Map();
  const words = markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/\{#[^}]*\}/g, "")
    .toLowerCase()
    .match(/[a-z0-9’']+/g) ?? [];
  for (const word of words) bag.set(word.replace(/’/g, "'"), (bag.get(word.replace(/’/g, "'")) ?? 0) + 1);
  return bag;
}

/** The words `before` has more of than `after`. */
function wordsLost(before, after) {
  const a = wordBag(before);
  const b = wordBag(after);
  return [...a].flatMap(([word, n]) => Array.from({ length: Math.max(0, n - (b.get(word) ?? 0)) }, () => word)).sort();
}

/** A week's blocks with every id taken out, to compare two reads by shape alone. */
function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, inner]) => [key, key === "covers" || key === "packId" ? (inner === null ? null : "set") : withoutIds(inner)]),
  );
}

// ---------------------------------------------------------------------------
// 1. The round trip
// ---------------------------------------------------------------------------

describe("1. copied as Markdown and pasted back, a week is the same week", () => {
  test("every kind of block, every id, every word: read back exactly as stored", () => {
    const blocks = syntheticWeekBlocks();
    const read = paste(copy(blocks), blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks, blocks);
    assert.equal(read.kept, model.weekItems(blocks).length, "every id kept");
    assert.equal(read.minted, 0);
    assert.deepEqual(read.removed, []);
    assert.equal(read.title, TITLE);
  });

  test("the Markdown is a fixed point: copying what was read writes the same text", () => {
    const markdown = copy();
    assert.equal(weekToMarkdown({ weekNumber: 3, title: TITLE, blocks: paste(markdown).blocks }), markdown);
  });

  test("every block and every thing a person answers or ticks has its id written in", () => {
    const markdown = copy();
    for (const item of model.weekItems(syntheticWeekBlocks())) assert.ok(markdown.includes(`{#${item.id}}`), item.id);
    assert.match(markdown, /^# Week 3: How sure are you\?\n/);
  });

  test("into a week with no blocks yet, the same week with every id fresh", () => {
    const read = paste(copy(), null);
    assert.deepEqual(read.problems, []);
    assert.equal(read.kept, 0);
    assert.equal(read.minted, model.weekItems(syntheticWeekBlocks()).length);
    assert.deepEqual(withoutIds(read.blocks), withoutIds(syntheticWeekBlocks()));
    // The pointers follow the fresh ids.
    const thisWeek = read.blocks.find((block) => block.type === "thisWeek");
    const parts = read.blocks.filter((block) => block.type === "part").map((part) => part.id);
    assert.deepEqual(thisWeek.rows[0].covers, parts.slice(0, 3));
  });

  test("text Markdown would read as markup comes back as the same text", () => {
    const tricky = [
      "Stars * and _underscores_ and [brackets] and `ticks`",
      "A pipe | inside, and {#not-an-id} braces, &amp; an entity, <b>tags</b>",
      "1. starts like a list",
      "# starts like a heading",
      "- starts like a bullet",
      "+ starts like a plus",
      "--- starts like a rule",
      "A back\\slash and a ~tilde~",
    ];
    const blocks = syntheticWeekBlocks();
    const part = blocks.find((block) => block.id === "pt-2");
    part.title = tricky[0];
    part.blocks.find((block) => block.id === "rs-2").prompts[0].text = tricky[1];
    part.blocks.find((block) => block.id === "tx-2").body = tricky.slice(2).map((text) => ({ type: "p", runs: [{ text }] }));
    blocks.find((block) => block.type === "outcomes").items = tricky.slice(0, 4);
    const thisWeek = blocks.find((block) => block.type === "thisWeek");
    thisWeek.rows[3].note = tricky[1];
    const source = blocks.find((block) => block.id === "pt-1").blocks[0];
    source.title = "A [bracketed] title * with marks";
    source.by = "Ada_Example";
    assert.deepEqual(model.weekBlocksProblems(blocks), []);
    const read = paste(copy(blocks), blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks, blocks);
  });

  test("bold, italics, both, and links with brackets in their address come back as they were", () => {
    const blocks = syntheticWeekBlocks();
    const why = blocks.find((block) => block.id === "tx-why");
    why.body = [
      {
        type: "p",
        runs: [
          { text: "Both", bold: true, italic: true },
          { text: " then " },
          { text: "a page", href: "https://example.com/wiki/Thing_(idea)" },
          { text: ", and " },
          { text: "a bold link", bold: true, href: "https://example.com/b" },
          { text: "." },
        ],
      },
      { type: "ol", items: [{ runs: [{ text: "One" }] }, { runs: [{ text: "Two", italic: true }] }] },
    ];
    const read = paste(copy(blocks), blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks.find((block) => block.id === "tx-why").body, why.body);
  });

  test("two lists side by side stay two lists, wherever they meet", () => {
    const blocks = syntheticWeekBlocks();
    const ul = (...texts) => ({ type: "ul", items: texts.map((text) => ({ runs: [{ text }] })) });
    const ol = (...texts) => ({ type: "ol", items: texts.map((text) => ({ runs: [{ text }] })) });
    const find = (id) => model.allBlocks(blocks).find((block) => block.id === id);
    find("tx-why").body = [ul("a", "b"), ul("c"), ol("d"), ol("e", "f")];
    find("cn-1").body = [ul("Before the links")];
    find("pt-1").framing = [ol("A numbered step before the sources")];
    find("cs-1").intro = [ul("An intro list")];
    find("cs-1").prepare = [{ type: "p", runs: [{ text: "Prepare from these:" }] }, ul("A prepare list")];
    find("is-1").beforeYouCome = [{ type: "p", runs: [{ text: "Before you come, three things:", bold: true }] }, ol("Charge a laptop")];
    find("is-1").body = [ul("In the session"), ol("Then in pairs")];
    find("gf-1").intro = [ul("Before the items")];
    const read = paste(copy(blocks), blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks, blocks);
  });

  test("code is copied out and read back to the character, backticks inside it and all", () => {
    const blocks = syntheticWeekBlocks();
    const handsOn = blocks.find((block) => block.id === "ho-1");
    const text = "```\nnot the end\n```\n  indented, with trailing spaces  \n\n\n\tand a tab";
    handsOn.body = [...handsOn.body, { type: "code", lang: "", text }];
    const markdown = copy(blocks);
    assert.match(markdown, /^````$/m, "a fence longer than the backticks inside");
    const read = paste(markdown, blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks.find((block) => block.id === "ho-1").body, handsOn.body);
  });

  test("the course's day-before time is the words written, and the week reads back the same", () => {
    const blocks = syntheticWeekBlocks();
    const markdown = weekToMarkdown({ weekNumber: 3, title: TITLE, blocks }, { dayBeforeTime: "12:00" });
    assert.match(markdown, /\*\*Written answer\*\* · 200 to 300 words · due by noon the day before the session \{#wa-1\}/);
    const read = paste(markdown, blocks, 3, "12:00");
    assert.deepEqual(read.blocks, blocks);
    assert.deepEqual(read.checks.filter((line) => line.includes("setting")), [], "the words and the setting agree");
    assert.match(weekToMarkdown({ weekNumber: 3, title: TITLE, blocks }, { dayBeforeTime: "17:30" }), /due by 5:30pm the day before the session/);
  });

  test("a written answer made of labelled boxes goes out and comes back with its boxes and their ids", () => {
    const blocks = syntheticWeekBlocks();
    const answer = model.allBlocks(blocks).find((block) => block.id === "wa-1");
    answer.words = null;
    answer.boxes = [
      { id: "wb-1", label: "What I want to forecast", hint: "one sentence." },
      { id: "wb-2", label: "Why it matters", hint: "" },
    ];
    const markdown = copy(blocks);
    // The question ends on a numbered list, so the boxes' list takes "1)" and stays a list of its own.
    assert.match(markdown, /^1\) \*\*What I want to forecast:\*\* one sentence\. \{#wb-1\}$/m);
    const read = paste(markdown, blocks);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks, blocks);
  });
});

// ---------------------------------------------------------------------------
// 2. The guide's own shape
// ---------------------------------------------------------------------------

describe("2. the guide's own Markdown, read", () => {
  const read = () => paste(syntheticGuideMarkdown(), null);

  test("what we found, in the board's words and order", () => {
    assert.deepEqual(
      read().found.map((row) => [row.state, row.label, row.detail, row.indent]),
      [
        ["found", "Title", "Week 3: How sure are you?", false],
        ["found", "This week", "3 tasks · In all: About 2 hours · 1 optional, not counted", false],
        ["found", "Why this week", "1 paragraph", false],
        ["found", "After this week you can", "3 outcomes", false],
        ["missing", "Content note", "Not in the Markdown", false],
        ["found", "Before the session", "4 parts · About 70 minutes, plus your forecast", false],
        ["found", "Part 1: Start with a base rate", "About 20 minutes · 2 sources, 1 reflection stop", true],
        ["found", "Part 2: Two ways to be wrong", "About 25 minutes · 1 source, 1 reflection stop", true],
        ["check", "Part 3: Your pack", "20 to 30 minutes · choose one of 3 packs, from its table", true],
        ["found", "Part 4: Your forecast, the week's written answer", "The written answer, 200 to 300 words", true],
        ["found", "Your case study", "3 cases in 2 groups", false],
        ["missing", "In the session", "Not in the Markdown", false],
        ["found", "Go further", "2 sources", false],
        ["found", "Hands-on route (optional, for coders)", "1 block of code · optional, not counted", false],
      ],
    );
  });

  test("the things to check, in the board's words", () => {
    assert.deepEqual(read().checks, [
      "Part 3’s packs give one time each, not one per source.",
      "2 of 14 links can’t be checked automatically (openai.com, weforum.org). They work in a browser.",
      "No “In the session” section: add one or leave it out.",
      "“It's the heaviest week of the course”, says Why this week, but there’s no content note: add one with support links.",
      "3 lines call the written answer “the week’s one exercise”, and 1 points to “the Start here tab”. Change them in the guide?",
    ]);
    assert.deepEqual(read().problems, [], "nothing to check stops a save");
  });

  test("the guide's lines are flagged in the guide's words only: a hands-on route's exercises are not the written answer", () => {
    const markdown = syntheticGuideMarkdown().replace("Score a forecast in code.", "Exercises: score a forecast in code, as two exercises.");
    assert.ok(paste(markdown, null).checks.includes("3 lines call the written answer “the week’s one exercise”, and 1 points to “the Start here tab”. Change them in the guide?"));
    const clean = syntheticGuideMarkdown().replaceAll("the week's one exercise", "the week's written answer").replace("on the Start here tab", "in Start here");
    assert.ok(!paste(clean, null).checks.some((line) => line.includes("Change them in the guide") || line.includes("Change it in the guide")));
  });

  test("This week: the guide's when words read as the board's three, each task covers what it names, and the optional row is outside In all", () => {
    const blocks = read().blocks;
    const thisWeek = blocks.find((block) => block.type === "thisWeek");
    const parts = model.partsOf(blocks);
    const cases = blocks.find((block) => block.type === "cases");
    assert.deepEqual(thisWeek.rows.map((row) => row.type), ["task", "task", "task", "optional"]);
    const tasks = thisWeek.rows.filter((row) => row.type === "task");
    assert.deepEqual(tasks.map((row) => row.when), ["before", "dayBefore", "atSession"]);
    assert.deepEqual(tasks.map((row) => row.whenText), ["Before session 3", "To your facilitator by the end of the day before session 3", "At session 3"]);
    assert.deepEqual(tasks.map((row) => row.covers), [parts.slice(0, 3).map((p) => p.id), [parts[3].id], [cases.id]]);
    assert.equal(thisWeek.rows[3].note, "Any time; not counted in the total");
    assert.equal(thisWeek.total, "About 2 hours");
  });

  test("sources as the guide writes them: who and when after the link, a time, a note, words before the title", () => {
    const [one, two] = model.partsOf(read().blocks);
    assert.deepEqual(
      { ...one.blocks[0], id: "" },
      { id: "", type: "source", kind: "read", lead: "", title: "A field guide to base rates", url: "https://example.com/base-rates", by: "Ada Example", date: "2024", time: "15 minutes", compute: "", note: [] },
    );
    assert.deepEqual(
      { ...one.blocks[1], id: "" },
      { id: "", type: "source", kind: "read", lead: 'section 2, "Counting", of', title: "The forecaster's handbook", url: "https://example.org/handbook", by: "Example Press", date: "2023", time: "5 minutes", compute: "", note: [{ text: "Only the first table." }] },
    );
    assert.deepEqual(one.blocks[2].prompts.map((p) => p.text), ["Pick a question you care about. What is its base rate?", "What makes your case different?"], "a Reflect's two prompts are one stop");
    assert.deepEqual(two.blocks.map((block) => block.type), ["source", "reflection"]);
    assert.equal(two.blocks[0].kind, "watch");
    assert.deepEqual(two.blocks[0].note, [{ text: "The first half is enough." }]);
  });

  test("packs from a table, with the questions to read them against; given out by a facilitator", () => {
    const three = model.partsOf(read().blocks)[2];
    const choose = three.blocks[0];
    assert.equal(choose.type, "chooseOne");
    assert.equal(choose.form, "table");
    assert.equal(choose.givenBy, "facilitator", "the one you chose or were given: a facilitator's draw (Q32)");
    assert.equal(choose.title, "Pack");
    assert.equal(prosePlain(choose.questions), "Base rate: what has happened before?\nChange: what is different now?");
    assert.match(prosePlain(three.framing), /Read it against these:$/, "the line before the questions stays the part's");
    assert.deepEqual(
      choose.packs.map((pack) => [pack.name, pack.time, pack.read.filter((run) => run.href).map((run) => run.href)]),
      [
        ["Elections", "25 minutes", ["https://example.com/polls", "https://example.org/swing"]],
        ["Markets", "About 30 minutes", ["https://example.com/prices"]],
        ["Technology", "20 minutes", ["https://openai.com/example-timeline"]],
      ],
    );
    assert.equal(three.blocks[1].type, "text", "the paragraph after the packs is everyone's");
  });

  test("the written answer: its range from the heading, its question, guidance and due rule; the send line is the site's to say", () => {
    const four = model.partsOf(read().blocks)[3];
    assert.equal(four.time, "200 to 300 words", "the heading's brackets, as the board draws them");
    assert.deepEqual(four.blocks.map((block) => block.type), ["writtenAnswer"]);
    const answer = four.blocks[0];
    assert.deepEqual(answer.words, { min: 200, max: 300 });
    assert.equal(answer.due, "dayBefore");
    assert.deepEqual(answer.boxes, []);
    assert.deepEqual(answer.prompt.map((paragraph) => paragraph.type), ["p", "ol"]);
    assert.equal(answer.prompt[0].runs[0].bold, true, "the milestone question stays bold");
    assert.equal(prosePlain(answer.guidance), "A strong answer names its base rate and says what would change it.");
    assert.ok(!JSON.stringify(four).includes("Send it to your facilitator"));
  });

  test("the case study: one table with a pack column, each group pointing at its pack, a content note kept on its case", () => {
    const blocks = read().blocks;
    const choose = model.allBlocks(blocks).find((block) => block.type === "chooseOne");
    const cases = blocks.find((block) => block.type === "cases");
    assert.deepEqual(cases.talk, { minutes: 3, name: "talk" }, "the talk is named in This week");
    assert.equal(cases.givenBy, "facilitator");
    assert.equal(cases.groupLabel, "Pack");
    assert.deepEqual(cases.groups.map((group) => [group.name, group.packId, group.cases.length]), [
      ["Elections", choose.packs[0].id, 2],
      ["Markets", choose.packs[1].id, 1],
    ]);
    const [first, second] = cases.groups[0].cases;
    assert.deepEqual(first.start.filter((run) => run.href).map((run) => run.text), ["A summary", "a review"]);
    assert.equal(second.contentNote, "The sources quote abusive posts: talk to your facilitator before you take this one.");
    assert.deepEqual(second.what, [{ text: "A forecast within a point." }]);
    assert.equal(prosePlain(cases.note), "If a case weighs on you, swap it.");
  });

  test("Go further and the hands-on route: never on the path, the code exactly as written", () => {
    const blocks = read().blocks;
    const further = blocks.find((block) => block.type === "goFurther");
    assert.deepEqual(further.items.map((item) => [item.kind, item.title]), [["read", "Superforecasting, a summary"], ["watchOrRead", ""]]);
    assert.deepEqual(further.items[1].why.filter((run) => run.href).map((run) => run.href), ["https://example.org/video", "https://example.com/essay"]);
    const handsOn = blocks.find((block) => block.type === "handsOn");
    assert.deepEqual(handsOn.body[1], { type: "code", lang: "python", text: "def brier(p, outcome):\n    return (p - outcome) ** 2" });
  });

  // A facilitator guide's template keeps the blank lines at its end (the room
  // under its last line); a week's code is read as it always was, so no week
  // changes. Only the guide asks for them (`TEMPLATE_ENDS`).
  test("a week's code still loses the blank lines at its very end: only a facilitator guide keeps a template's", async () => {
    const roomy = syntheticGuideMarkdown().replace("    return (p - outcome) ** 2\n```", "    return (p - outcome) ** 2\n\n\n```");
    assert.notEqual(roomy, syntheticGuideMarkdown(), "the fixture's code block moved: point this test at it again");
    const handsOn = paste(roomy, null).blocks.find((block) => block.type === "handsOn");
    assert.deepEqual(handsOn.body[1], { type: "code", lang: "python", text: "def brier(p, outcome):\n    return (p - outcome) ** 2" });
    const reader = await loadTs("lib/courses/weekBlocks/markdownRead.ts");
    const { sanitizeProse } = await loadTs("lib/courses/weekBlocks/prose.ts");
    const { TEMPLATE_ENDS } = await loadTs("lib/courses/facilitatorGuide/model.ts");
    const fenced = marked.lexer("```\nA command\n\n\n```\n", { gfm: true });
    assert.deepEqual(reader.readProseTokens(fenced, reader.noneLeftOut()), [{ type: "code", lang: "", text: "A command" }]);
    assert.deepEqual(reader.readProseTokens(fenced, reader.noneLeftOut(), TEMPLATE_ENDS), [{ type: "code", lang: "", text: "A command\n\n" }]);
    const storedCode = [{ type: "code", lang: "", text: "A command\n\n" }];
    assert.deepEqual(sanitizeProse(storedCode), [{ type: "code", lang: "", text: "A command" }]);
    assert.deepEqual(sanitizeProse(storedCode, undefined, TEMPLATE_ENDS), storedCode);
    assert.deepEqual(TEMPLATE_ENDS, { keepBlankLinesAtEnd: true });
  });

  test("once read, the guide's week copies out with its ids and reads back the same", () => {
    const first = read();
    const again = paste(weekToMarkdown({ weekNumber: 3, title: first.title, blocks: first.blocks }), first.blocks);
    assert.deepEqual(again.problems, []);
    assert.deepEqual(again.blocks, first.blocks);
    assert.equal(again.minted, 0);
  });

  test("no word of the guide is lost on the way through but its send line, which the site says itself", () => {
    const first = read();
    const out = weekToMarkdown({ weekNumber: 3, title: first.title, blocks: first.blocks });
    const sendLine = "Send it to your facilitator by the end of the day before your session.";
    const lost = wordsLost(syntheticGuideMarkdown(), out);
    const allowed = wordBag(sendLine);
    for (const word of lost) assert.ok(allowed.has(word), `the word “${word}” was lost`);
    assert.ok(lost.includes("send"), "the send line is the one thing left out");
  });
});

/** Prose as plain text, lines joined: what a test compares. */
function prosePlain(prose) {
  return prose
    .map((paragraph) =>
      paragraph.type === "p"
        ? paragraph.runs.map((run) => run.text).join("")
        : paragraph.type === "ul" || paragraph.type === "ol"
          ? paragraph.items.map((item) => item.runs.map((run) => run.text).join("")).join("\n")
          : "",
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// 3. Ids across a paste (K16)
// ---------------------------------------------------------------------------

describe("3. answers stay with their blocks", () => {
  const NOTEBOOK = "2. **Notebook:** [Score your own forecasts](https://example.com/notebook), Example Lab. About 10 minutes. Runs on a free notebook service. {#src-8}";

  test("a source moved to another part keeps its id, so its ticks follow it", () => {
    const markdown = copy()
      .replace(`\n${NOTEBOOK}`, "")
      .replace("Only the first table. {#src-7}", `Only the first table. {#src-7}\n3. ${NOTEBOOK.slice(3)}`);
    const read = paste(markdown);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(model.partsOf(read.blocks)[0].blocks.map((block) => block.id), ["src-1", "src-7", "src-8", "rs-1"]);
    assert.deepEqual(model.partsOf(read.blocks)[1].blocks.map((block) => block.id), ["src-2", "rs-2", "tx-2"]);
    assert.deepEqual(read.removed, []);
  });

  test("a pack keeps its id when its row moves, and a pack taken out is listed with its name", () => {
    const rows = copy().split("\n");
    const at = (start) => rows.findIndex((line) => line.startsWith(start));
    const [elections, markets] = [at("| Elections {#pk-1}"), at("| Markets {#pk-2}")];
    [rows[elections], rows[markets]] = [rows[markets], rows[elections]];
    const swapped = paste(rows.join("\n"));
    assert.deepEqual(swapped.problems, []);
    assert.deepEqual(model.allBlocks(swapped.blocks).find((block) => block.id === "co-1").packs.map((pack) => pack.id), ["pk-2", "pk-1", "pk-3"]);
    assert.deepEqual(swapped.removed, []);
    const without = paste(copy().replace(/^\| Technology \{#pk-3\}.*\n/m, ""));
    assert.deepEqual(without.removed, [{ id: "pk-3", kind: "pack", label: "Technology" }]);
  });

  test("what the paste leaves out is listed, with its words", () => {
    const markdown = copy().replace("- What makes your case different from the base rate? {#rp-2}\n", "");
    const read = paste(markdown);
    assert.deepEqual(read.removed, [{ id: "rp-2", kind: "prompt", label: "What makes your case different from the base rate?" }]);
  });

  test("a new line with no id gets a fresh one; nothing else moves", () => {
    const markdown = copy().replace(
      "15 minutes. {#src-1}",
      "15 minutes. {#src-1}\n2. **Read:** [A second guide](https://example.com/second), Example Press, 2025.",
    );
    const read = paste(markdown);
    assert.deepEqual(read.problems, []);
    assert.equal(read.minted, 1);
    assert.deepEqual(model.partsOf(read.blocks)[0].blocks.map((block) => block.id), ["src-1", "src-new1", "src-7", "rs-1"]);
  });

  test("an id used twice keeps its first place; the second gets a fresh id", () => {
    const markdown = copy().replace("{#rp-3}", "{#rp-1}");
    const read = paste(markdown);
    const prompts = model.allBlocks(read.blocks).filter((b) => b.type === "reflection").flatMap((b) => b.prompts.map((p) => p.id));
    assert.deepEqual(prompts, ["rp-1", "rp-2", "rp-new1"]);
    assert.deepEqual(read.removed.map((item) => item.id), ["rp-3"], "the prompt whose id was taken is the one that goes");
  });

  test("an id on a different kind of thing, or one the week never had, is replaced, never trusted", () => {
    const markdown = copy().replace("{#src-1}", "{#rp-3}").replace("{#ci-2}", "{#ci-elsewhere}");
    const read = paste(markdown);
    const ids = model.weekItems(read.blocks).map((item) => item.id);
    assert.ok(!ids.includes("ci-elsewhere"));
    assert.ok(ids.includes("rp-3"), "the prompt keeps its own id");
    assert.equal(model.partsOf(read.blocks)[0].blocks[0].id, "src-new1");
    assert.deepEqual(read.removed.map((item) => item.id).sort(), ["ci-2", "src-1"]);
  });

  test("merging on its own: ids kept by kind, fresh ones only where needed", () => {
    const blocks = syntheticWeekBlocks();
    const parsed = structuredClone(blocks);
    parsed[0].id = "";
    const merged = mergeWeekIds(blocks, parsed, counter());
    assert.equal(merged.blocks[0].id, "tw-new1");
    assert.deepEqual(merged.removed.map((item) => item.id), ["tw-1"]);
    assert.equal(merged.kept, model.weekItems(blocks).length - 1);
  });
});

// ---------------------------------------------------------------------------
// 4. What a task covers
// ---------------------------------------------------------------------------

describe("4. what a This week task covers, from its words", () => {
  const blocks = finishWeekBlocks(syntheticWeekBlocks());
  const parts = model.partsOf(blocks).map((part) => part.id);
  const cover = (what) => coversFor(what, blocks);

  test("named parts, a range, a list, or every part", () => {
    assert.deepEqual(cover("Part 4: your forecast"), [parts[3]]);
    assert.deepEqual(cover("Parts 1 to 3 below"), parts.slice(0, 3));
    assert.deepEqual(cover("Parts 1 and 2"), parts.slice(0, 2));
    assert.deepEqual(cover("parts 1, 2 and 5"), [parts[0], parts[1], parts[4]]);
    assert.deepEqual(cover("Work through the three parts below, noting your answers"), parts);
    assert.deepEqual(cover("Part 9"), [], "a part the week does not have is no part");
  });

  test("with no part named: the case study, the written answer, a pitch, or getting ready for the session", () => {
    assert.deepEqual(cover("Your case study: a 3-minute talk"), ["cs-1"]);
    assert.deepEqual(cover("Send the written answer"), ["wa-1"]);
    assert.deepEqual(cover("Prepare your pitch"), ["cs-2"]);
    assert.deepEqual(cover("Get ready for the hands-on session"), ["is-1"], "In the session’s Before you come");
    assert.deepEqual(cover("Come along"), []);
  });

  test("a first week in the guide's shape: one task over every part, filled in by id when it is read", () => {
    const markdown = [
      "# Week 1: Where to start",
      "## This week",
      "| Do this | Time | When |\n| --- | --- | --- |\n| Work through the three parts below, noting your answers to the questions | About 80 minutes | Before session 1, if you can |\n| Case study and written question | None this week | You'll draw your first case at the end of session 1 |\n| **In all** | **About 80 minutes** |  |",
      "## Why this week",
      "A first look at the questions the course asks.",
      "## Before the session (about 80 minutes)",
      "### Part 1: Your first guess (about 10 minutes)",
      "**Reflect**\n\n- What do you expect to change most in ten years?",
      "### Part 2: Two views (about 40 minutes)",
      "1. **Read:** [\"A hopeful view\"](https://example.com/hopeful), Ada Example, 2025. 20 minutes.\n2. **Read:** [\"A worried view\"](https://example.org/worried), Example Press, 2025. 20 minutes.",
      "**Reflect**\n\n- Which view do you lean towards, and why?",
      "### Part 3: What would change your mind? (about 30 minutes)",
      "1. **Watch:** [\"A short talk\"](https://example.com/talk), Example Lectures, 2024. 25 minutes.",
      "**Reflect**\n\n- What evidence would move you?",
    ].join("\n\n");
    const read = paste(markdown, null, 1);
    assert.deepEqual(read.problems, []);
    const thisWeek = read.blocks.find((block) => block.type === "thisWeek");
    const parts = model.partsOf(read.blocks);
    assert.equal(parts.length, 3);
    assert.deepEqual(thisWeek.rows.map((row) => row.type), ["task", "none"]);
    assert.deepEqual(thisWeek.rows[0].covers, parts.map((part) => part.id), "the three parts below: every part, by its stored id");
    assert.equal(thisWeek.rows[0].whenText, "Before session 1, if you can", "the guide's own words kept");
    assert.equal(thisWeek.rows[0].when, "before");
    // Each part's reflection stops and sources are covered through their part.
    assert.deepEqual(parts.map((part) => part.blocks.map((block) => block.type)), [["reflection"], ["source", "source", "reflection"], ["source", "reflection"]]);
    // The bare reading is not a week to store: its ids and pointers are settled by the paste.
    const bare = readWeekMarkdown(markdown);
    assert.deepEqual(bare.blocks.find((block) => block.type === "thisWeek").rows[0].covers, [], "covers wait for the ids");
    assert.ok(model.allBlocks(bare.blocks).every((block) => block.id === ""), "no id is minted before the paste");
  });

  test("a task that names nothing is said to need it", () => {
    const markdown = copy().replace("| Your case study: a 3-minute talk on a case from your pack |", "| Something to bring along |");
    assert.ok(paste(markdown).checks.includes("This week’s “Something to bring along” doesn’t name what it covers: write “Part 2”, “Parts 1 to 3”, “your case study” or “the written answer” in it."));
  });
});

// ---------------------------------------------------------------------------
// 5. What stops a save, and what is left out
// ---------------------------------------------------------------------------

describe("5. what stops a save, and what is said", () => {
  test("another week's Markdown", () => {
    const read = paste(copy(), syntheticWeekBlocks(), 4);
    assert.equal(read.problems[0], "This is week 3’s Markdown, and you’re loading week 4. Check the week, or change the first line.");
  });

  test("nothing that reads as a week", () => {
    assert.deepEqual(paste("", null).problems, ["Nothing in this Markdown reads as a week: paste the week’s Markdown, starting with its title line."]);
  });

  test("a source whose link is not https is named, not dropped", () => {
    const read = paste(copy().replace("https://example.com/base-rates", "http://example.com/base-rates"));
    assert.ok(read.problems.includes("The source “A field guide to base rates” needs an https link: http://example.com/base-rates isn’t one."), read.problems.join("\n"));
  });

  test("a Reflect line with no prompt, and a stop with three", () => {
    const empty = paste(copy().replace("- Where were you most overconfident this year? {#rp-3}", "Nothing here."));
    assert.ok(empty.problems.includes("A Reflect line has no prompt after it: list the prompts under it, one to a line."));
    const three = paste(copy().replace("- What makes your case different from the base rate? {#rp-2}", "- What makes your case different from the base rate? {#rp-2}\n- And a third?"));
    assert.ok(three.problems.includes("Part 1’s reflection stop has 3 prompts; a stop holds 1 or 2. Start another Reflect for more."));
  });

  test("a word range on an answer in boxes is refused, saying why", () => {
    const blocks = syntheticWeekBlocks();
    const answer = model.allBlocks(blocks).find((block) => block.id === "wa-1");
    answer.words = null;
    answer.boxes = [{ id: "wb-1", label: "One", hint: "" }];
    const read = paste(copy(blocks).replace("**Written answer** ·", "**Written answer** · 100 to 200 words ·"), blocks);
    assert.ok(read.problems.includes("Part 4’s written answer: a word range is counted over one box, so an answer in boxes has none."), read.problems.join("\n"));
  });

  test("the Markdown's day-before time and the course's setting disagreeing is said, and the setting wins", () => {
    const read = paste(syntheticGuideMarkdown().replace(/by the end of the day before/g, "by noon the day before"), null);
    assert.ok(read.checks.includes("The Markdown says written work is due by noon the day before the session; this course’s setting says by the end of the day before. The site goes by the setting: change it in the course’s details, or change the Markdown."), read.checks.join("\n"));
    assert.deepEqual(read.problems, []);
  });

  test("a field longer than its cap is named, never cut short", () => {
    const read = paste(copy().replace("A field guide to base rates", "A".repeat(400)));
    assert.ok(read.problems.some((line) => line.includes("the title is 400 characters; the most is 300")), read.problems.join("\n"));
    const note = paste(copy().replace("Only the first table.", "N".repeat(1200)));
    assert.ok(
      note.problems.includes("Part 1’s source “The forecaster’s handbook”: the note is 1200 characters; the most is 1000."),
      note.problems.join("\n"),
    );
  });

  test("a picture is left out, and said", () => {
    const read = paste(copy().replace("Work through the parts in order.", "Work through the parts in order. ![A chart](https://example.com/chart.png)"));
    assert.deepEqual(read.problems, []);
    assert.ok(read.checks.includes("1 picture was left out: the week page shows no pictures."));
  });

  test("a This week row with no when it can read is named", () => {
    const read = paste(copy().replace("| About 30 minutes | At session 3 |", "| About 30 minutes | Whenever suits |"));
    assert.ok(read.problems.some((line) => line.startsWith("This week: say when “Your case study")));
  });
});

// ---------------------------------------------------------------------------
// 6. The reader of Markdown is a declared dependency
// ---------------------------------------------------------------------------

test("6. marked is declared at the version the lock already holds (K17)", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  assert.equal(pkg.dependencies.marked, `^${lock.packages["node_modules/marked"].version}`);
  assert.equal(lock.packages[""].dependencies.marked, pkg.dependencies.marked, "the lock's own record of package.json agrees");
  // The model a browser loads never reaches it: only the server reads a paste.
  for (const file of ["model.ts", "prose.ts", "limits.ts", "reader.ts", "markdownWrite.ts", "due.ts"]) {
    const source = readFileSync(join(ROOT, "src", "lib", "courses", "weekBlocks", file), "utf8");
    assert.doesNotMatch(source, /from "marked"/, file);
  }
  assert.equal(typeof readWeekMarkdown, "function");
});
