/**
 * A week as an ordered list of blocks (the coursework boards pr-weeks,
 * wk-week, wk-week-phone, st-week1-phone and wk-week6-phone): the model
 * every later page builds on.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   sanitizeWeekBlocks      the read side: rebuilds every block, inside the caps
 *   weekBlocksProblems      the write side: what stops a week being stored
 *   prose.ts                rich text as data: runs, links, no markup
 *   normalizeCourseWeek     blocks absent on every week written before them; Ready
 *   templateWeekFields      every copy of a week carries its blocks
 *   due.ts                  when work is due, for one group, from its own calendar
 *
 * The week is `tests/lib/weekBlocksFixture.mjs`: made-up words in the
 * guide's shape, every kind of block in it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { syntheticWeekBlocks, syntheticWeekDoc } from "./lib/weekBlocksFixture.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/weekBlocks/model.ts");
const prose = await loadTs("lib/courses/weekBlocks/prose.ts");
const { WEEK_BLOCK_LIMITS: L } = await loadTs("lib/courses/weekBlocks/limits.ts");
const { dueMoment, isLate } = await loadTs("lib/courses/weekBlocks/due.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const { templateWeekFields } = await loadTs("lib/firestore/courseTemplates.ts");

const clone = (value) => structuredClone(value);
const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** The fixture with one block replaced, found by id anywhere in the week. */
function withBlock(id, change) {
  const blocks = syntheticWeekBlocks();
  const visit = (list) =>
    list.map((block) => {
      if (block.id === id) return change(clone(block));
      if (block.type === "part") return { ...block, blocks: visit(block.blocks) };
      return block;
    });
  return visit(blocks);
}

function findBlock(blocks, id) {
  return model.allBlocks(blocks).find((block) => block.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// 1. Every kind of block, read and checked
// ---------------------------------------------------------------------------

describe("1. every kind of block", () => {
  test("the synthetic week holds the boards' fifteen kinds and the hands-on route, and every Text role", () => {
    const kinds = new Set(model.allBlocks(syntheticWeekBlocks()).map((block) => block.type));
    assert.deepEqual(
      [...kinds].sort(),
      [
        "cases", "checklist", "chooseOne", "contentNote", "fillIn", "goFurther", "handsOn", "inTheSession", "outcomes",
        "part", "reflection", "source", "table", "text", "thisWeek", "writtenAnswer",
      ].sort(),
    );
    const roles = model.allBlocks(syntheticWeekBlocks()).filter((b) => b.type === "text").map((b) => b.role);
    assert.deepEqual([...new Set(roles)].sort(), ["before", "plain", "section", "why"]);
  });

  test("a week that passes the check reads back exactly as written", () => {
    const blocks = syntheticWeekBlocks();
    assert.deepEqual(model.weekBlocksProblems(blocks), []);
    assert.deepEqual(model.sanitizeWeekBlocks(clone(blocks)), blocks);
  });

  test("what is not a list of blocks reads as no blocks", () => {
    for (const raw of [undefined, null, "blocks", 7, { 0: {} }]) assert.deepEqual(model.sanitizeWeekBlocks(raw), []);
  });

  test("an unknown kind, a block with no id and a part-only kind at the top are dropped on read and named on write", () => {
    const blocks = syntheticWeekBlocks();
    const source = findBlock(blocks, "src-1");
    const read = model.sanitizeWeekBlocks([{ id: "zz-1", type: "poll" }, { type: "text", role: "plain", body: [p(run("x"))] }, source, ...blocks]);
    assert.deepEqual(read, blocks);
    assert.deepEqual(model.weekBlocksProblems([source]), ["The source “A field guide to base rates” has to sit inside a part."]);
  });

  test("a part may not hold a part, This week or Go further: the read side drops them", () => {
    const blocks = withBlock("pt-1", (part) => ({ ...part, blocks: [...part.blocks, { id: "tw-9", type: "thisWeek", rows: [{ type: "task", what: "x", time: "", when: "before", whenText: "", covers: [] }], total: "", note: [] }] }));
    assert.deepEqual(findBlock(model.sanitizeWeekBlocks(blocks), "pt-1").blocks.map((b) => b.id), ["src-1", "src-7", "rs-1"]);
  });

  test("each block is rebuilt key by key: a stray key never survives a read", () => {
    const blocks = withBlock("src-1", (source) => ({ ...source, html: "<script>x</script>", __proto__x: 1 }));
    const read = findBlock(model.sanitizeWeekBlocks(blocks), "src-1");
    assert.deepEqual(Object.keys(read).sort(), ["by", "compute", "date", "id", "kind", "lead", "note", "time", "title", "type", "url"]);
  });

  test("Choose one and Cases say who settles which a person has; a stored nonsense value reads as the default", () => {
    const blocks = syntheticWeekBlocks();
    assert.equal(findBlock(blocks, "co-1").givenBy, "facilitator");
    assert.equal(findBlock(blocks, "cs-2").givenBy, "fellow");
    const odd = withBlock("co-1", (block) => ({ ...block, givenBy: "lottery" }));
    assert.equal(findBlock(model.sanitizeWeekBlocks(odd), "co-1").givenBy, "fellow");
    const oddCases = withBlock("cs-1", (block) => ({ ...block, givenBy: 1 }));
    assert.equal(findBlock(model.sanitizeWeekBlocks(oddCases), "cs-1").givenBy, "facilitator");
  });

  test("a This week task's when is one of the board's three, and its covers name parts, answers or talks in the week", () => {
    assert.deepEqual([...model.WHENS], ["before", "dayBefore", "atSession"]);
    const blocks = withBlock("tw-1", (block) => ({
      ...block,
      rows: [{ ...block.rows[0], when: "whenever", covers: ["pt-1", "src-1", "gone-1", "pt-1"] }],
    }));
    const row = findBlock(model.sanitizeWeekBlocks(blocks), "tw-1").rows[0];
    assert.equal(row.when, "before");
    assert.deepEqual(row.covers, ["pt-1"], "only ids of a part, a written answer or a talk the week has, once each");
    const bad = withBlock("tw-1", (block) => ({ ...block, rows: [{ ...block.rows[0], covers: ["gone-1"] }] }));
    assert.ok(model.weekBlocksProblems(bad).some((line) => line.includes("points at something the week doesn’t have")));
  });

  test("a case group's pack is a pack of the week, or none", () => {
    const blocks = withBlock("cs-1", (block) => ({ ...block, groups: block.groups.map((group) => ({ ...group, packId: "pk-404" })) }));
    for (const group of findBlock(model.sanitizeWeekBlocks(blocks), "cs-1").groups) assert.equal(group.packId, null);
  });

  test("the source kinds and their words are the boards’ six, then a notebook", () => {
    assert.deepEqual(Object.values(model.SOURCE_KIND_LABEL), ["Read", "Watch", "Listen", "Watch or listen", "Watch or read", "Explore", "Notebook"]);
    const notebook = findBlock(syntheticWeekBlocks(), "src-8");
    assert.equal(notebook.kind, "notebook");
    assert.equal(notebook.compute, "Runs on a free notebook service", "a notebook says what it needs to run");
  });

  test("This week: a row offered and not counted is its own kind, outside In all", () => {
    const rows = findBlock(syntheticWeekBlocks(), "tw-1").rows;
    assert.deepEqual(rows.map((row) => row.type), ["task", "task", "task", "none", "optional"]);
    assert.equal(rows[4].note, "Any time; not counted in the total");
    assert.equal(rows[1].whenText, "To your facilitator by the end of the day before session 3", "the guide's own words for when, kept");
    const odd = withBlock("tw-1", (block) => ({ ...block, rows: [{ type: "optional", what: "Extra", time: "Any", note: "Not counted", covers: ["pt-1"] }] }));
    assert.deepEqual(findBlock(model.sanitizeWeekBlocks(odd), "tw-1").rows, [{ type: "optional", what: "Extra", time: "Any", note: "Not counted" }], "an optional row covers nothing");
  });

  test("how to prepare for a talk starts with a line that begins Prepare, so the Markdown can tell it from the introduction", () => {
    const bad = withBlock("cs-1", (block) => ({ ...block, prepare: [p(run("Think about these:"))] }));
    assert.deepEqual(model.weekBlocksProblems(bad), ["“Your case study”: how to prepare starts with a line that begins “Prepare”."]);
  });

  test("what to do before you come starts with a line that begins Before you come, for the same reason", () => {
    const bad = withBlock("is-1", (block) => ({ ...block, beforeYouCome: [p(run("Charge your laptop."))] }));
    assert.deepEqual(model.weekBlocksProblems(bad), ["In the session: what to do before you come starts with a line that begins “Before you come”."]);
  });

  test("a case can carry a content note of its own; the note is kept apart from what happened", () => {
    const cases = findBlock(syntheticWeekBlocks(), "cs-1");
    const noted = cases.groups.flatMap((group) => group.cases).filter((item) => item.contentNote);
    assert.deepEqual(noted.map((item) => item.id), ["ca-2"]);
    assert.doesNotMatch(prose.runsText(noted[0].what), /talk to your facilitator/);
  });

  test("a pack is its words and links as written, one time for all of it", () => {
    const pack = findBlock(syntheticWeekBlocks(), "co-1").packs[0];
    assert.deepEqual(prose.runsLinks(pack.read), ["https://example.com/polls", "https://example.org/swing"]);
    assert.equal(pack.time, "25 minutes");
    assert.ok(findBlock(syntheticWeekBlocks(), "co-1").questions.length > 0, "questions to read every pack against");
    const noLink = withBlock("co-1", (block) => ({ ...block, packs: [{ ...block.packs[0], read: [run("No link here")] }, block.packs[1], block.packs[2]] }));
    assert.ok(model.weekBlocksProblems(noLink).includes("Part 3’s packs, “Elections” needs a link to what to read."));
  });

  test("a written answer is one box with a word range, or labelled boxes sent together with none", () => {
    const boxed = withBlock("wa-1", (block) => ({
      ...block,
      words: null,
      boxes: [
        { id: "wb-1", label: "What I want to forecast", hint: "one sentence." },
        { id: "wb-2", label: "Why it matters", hint: "" },
      ],
    }));
    assert.deepEqual(model.weekBlocksProblems(boxed), []);
    assert.deepEqual(model.sanitizeWeekBlocks(boxed), boxed);
    assert.deepEqual(model.weekItems(boxed).filter((item) => item.kind === "answerBox").map((item) => item.id), ["wb-1", "wb-2"]);
    const both = withBlock("wa-1", (block) => ({ ...block, boxes: [{ id: "wb-1", label: "One", hint: "" }] }));
    assert.ok(model.weekBlocksProblems(both).includes("Part 4’s written answer: a word range is counted over one box, so an answer in boxes has none."));
  });

  test("code is kept exactly, every space and blank line; In the session keeps Before you come", () => {
    const code = findBlock(syntheticWeekBlocks(), "ho-1").body.find((paragraph) => paragraph.type === "code");
    assert.equal(code.text, "def brier(p, outcome):\n    return (p - outcome) ** 2\n\nprint(brier(0.7, 1))");
    const spaced = prose.sanitizeProse([{ type: "code", lang: "", text: "  two leading\n\n\ttab and  gaps  " }]);
    assert.deepEqual(spaced, [{ type: "code", lang: "", text: "  two leading\n\n\ttab and  gaps  " }]);
    assert.ok(findBlock(syntheticWeekBlocks(), "is-1").beforeYouCome.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Caps, one per kind and field
// ---------------------------------------------------------------------------

describe("2. the caps", () => {
  test("the caps live in COURSE_FIELD_LIMITS beside the week's others", () => {
    for (const [key, value] of Object.entries(L)) assert.equal(courses.COURSE_FIELD_LIMITS[key], value, key);
    // The old caps are untouched.
    assert.equal(courses.COURSE_FIELD_LIMITS.maxMaterials, 30);
    assert.equal(courses.COURSE_FIELD_LIMITS.maxChecklistItems, 15);
  });

  /** One change per cap: each must be named by the check and cut by the read. */
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const long = (n) => "x".repeat(n + 1);
  const OVER = [
    ["maxWeekBlocks", (b) => [...b, ...many(L.maxWeekBlocks, (i) => ({ id: `tx-x${i}`, type: "text", role: "section", heading: `More ${i}`, time: "", body: [p(run("x"))] }))]],
    ["maxPartBlocks", (b) => withBlockIn(b, "pt-2", (part) => ({ ...part, blocks: [...part.blocks, ...many(L.maxPartBlocks, (i) => ({ id: `tx-y${i}`, type: "text", role: "plain", heading: "", time: "", body: [p(run("y"))] }))] }))],
    ["maxWeekBlocksChars", (b) => [...b, ...many(36, (i) => ({ id: `tx-h${i}`, type: "text", role: "section", heading: `Long ${i}`, time: "", body: many(40, () => p(run("h".repeat(190)))) }))]],
    ["blockId", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, id: `src-${long(L.blockId)}` }))],
    ["maxProseParagraphs", (b) => withBlockIn(b, "tx-why", (block) => ({ ...block, body: many(L.maxProseParagraphs + 1, () => p(run("x"))) }))],
    ["maxProseListItems", (b) => withBlockIn(b, "tx-why", (block) => ({ ...block, body: [{ type: "ul", items: many(L.maxProseListItems + 1, () => ({ runs: [run("i")] })) }] }))],
    ["maxRuns", (b) => withBlockIn(b, "src-2", (block) => ({ ...block, note: many(L.maxRuns + 1, (i) => run(`n${i} `, { bold: i % 2 === 0 })) }))],
    ["proseChars", (b) => withBlockIn(b, "tx-why", (block) => ({ ...block, body: [p(run(long(L.proseChars)))] }))],
    ["inlineChars", (b) => withBlockIn(b, "src-2", (block) => ({ ...block, note: [run(long(L.inlineChars))] }))],
    ["linkUrl", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, url: `https://example.com/${long(L.linkUrl)}` }))],
    ["codeChars", (b) => withBlockIn(b, "ho-1", (block) => ({ ...block, body: [{ type: "code", lang: "", text: long(L.codeChars) }] }))],
    ["codeLang", (b) => withBlockIn(b, "ho-1", (block) => ({ ...block, body: [{ type: "code", lang: long(L.codeLang), text: "x = 1" }] }))],
    ["maxProseTableColumns", (b) => withBlockIn(b, "tx-next", (block) => ({ ...block, body: [{ type: "table", header: many(L.maxProseTableColumns + 1, () => ({ runs: [run("h")] })), rows: [] }] }))],
    ["maxProseTableRows", (b) => withBlockIn(b, "tx-next", (block) => ({ ...block, body: [{ type: "table", header: [{ runs: [run("h")] }], rows: many(L.maxProseTableRows + 1, () => ({ cells: [{ runs: [run("c")] }] })) }] }))],
    ["maxThisWeekRows", (b) => withBlockIn(b, "tw-1", (block) => ({ ...block, rows: many(L.maxThisWeekRows + 1, () => block.rows[3]) }))],
    ["thisWeekWhat", (b) => withBlockIn(b, "tw-1", (block) => ({ ...block, rows: [{ ...block.rows[0], what: long(L.thisWeekWhat) }] }))],
    ["thisWeekTime", (b) => withBlockIn(b, "tw-1", (block) => ({ ...block, total: long(L.thisWeekTime) }))],
    ["thisWeekRowNote", (b) => withBlockIn(b, "tw-1", (block) => ({ ...block, rows: [block.rows[0], { ...block.rows[4], note: long(L.thisWeekRowNote) }] }))],
    ["textHeading", (b) => withBlockIn(b, "tx-next", (block) => ({ ...block, heading: long(L.textHeading) }))],
    ["textTime", (b) => withBlockIn(b, "tx-before", (block) => ({ ...block, time: long(L.textTime) }))],
    ["maxOutcomes", (b) => withBlockIn(b, "oc-1", (block) => ({ ...block, items: many(L.maxOutcomes + 1, (i) => `Outcome ${i}`) }))],
    ["outcome", (b) => withBlockIn(b, "oc-1", (block) => ({ ...block, items: [long(L.outcome)] }))],
    ["maxSupportLinks", (b) => withBlockIn(b, "cn-1", (block) => ({ ...block, links: many(L.maxSupportLinks + 1, () => block.links[0]) }))],
    ["supportLabel", (b) => withBlockIn(b, "cn-1", (block) => ({ ...block, links: [{ ...block.links[0], label: long(L.supportLabel) }] }))],
    ["supportDetail", (b) => withBlockIn(b, "cn-1", (block) => ({ ...block, links: [{ ...block.links[0], detail: long(L.supportDetail) }] }))],
    ["partTitle", (b) => withBlockIn(b, "pt-1", (block) => ({ ...block, title: long(L.partTitle) }))],
    ["partTime", (b) => withBlockIn(b, "pt-1", (block) => ({ ...block, time: long(L.partTime) }))],
    ["sourceTitle", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, title: long(L.sourceTitle) }))],
    ["sourceBy", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, by: long(L.sourceBy) }))],
    ["sourceDate", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, date: long(L.sourceDate) }))],
    ["sourceTime", (b) => withBlockIn(b, "src-1", (block) => ({ ...block, time: long(L.sourceTime) }))],
    ["sourceLead", (b) => withBlockIn(b, "src-7", (block) => ({ ...block, lead: long(L.sourceLead) }))],
    ["sourceCompute", (b) => withBlockIn(b, "src-8", (block) => ({ ...block, compute: long(L.sourceCompute) }))],
    ["maxReflectionPrompts", (b) => withBlockIn(b, "rs-1", (block) => ({ ...block, prompts: [...block.prompts, { id: "rp-9", text: "A third?" }] }))],
    ["reflectionPrompt", (b) => withBlockIn(b, "rs-2", (block) => ({ ...block, prompts: [{ id: "rp-3", text: long(L.reflectionPrompt) }] }))],
    ["chooseOneTitle", (b) => withBlockIn(b, "co-2", (block) => ({ ...block, title: long(L.chooseOneTitle) }))],
    ["maxPacks", (b) => withBlockIn(b, "co-1", (block) => ({ ...block, packs: many(L.maxPacks + 1, (i) => ({ ...block.packs[1], id: `pk-z${i}`, name: `Pack ${i}` })) }))],
    ["packName", (b) => withBlockIn(b, "co-1", (block) => ({ ...block, packs: [{ ...block.packs[0], name: long(L.packName) }, block.packs[1]] }))],
    ["packRead", (b) => withBlockIn(b, "co-1", (block) => ({ ...block, packs: [{ ...block.packs[0], read: [...block.packs[0].read, run(long(L.packRead))] }, block.packs[1]] }))],
    ["chooseOneHeading", (b) => withBlockIn(b, "co-1", (block) => ({ ...block, noteHeading: long(L.chooseOneHeading) }))],
    ["maxTableColumns", (b) => withBlockIn(b, "tb-1", (block) => ({ ...block, header: many(L.maxTableColumns + 1, () => block.header[0]), rows: [] }))],
    ["maxTableRows", (b) => withBlockIn(b, "tb-1", (block) => ({ ...block, rows: many(L.maxTableRows + 1, () => block.rows[0]) }))],
    ["maxAnswerWords", (b) => withBlockIn(b, "wa-1", (block) => ({ ...block, words: { min: 10, max: L.maxAnswerWords + 1 } }))],
    ["maxAnswerBoxes", (b) => withBlockIn(b, "wa-1", (block) => ({ ...block, words: null, boxes: many(L.maxAnswerBoxes + 1, (i) => ({ id: `wb-z${i}`, label: `Box ${i}`, hint: "" })) }))],
    ["answerBoxLabel", (b) => withBlockIn(b, "wa-1", (block) => ({ ...block, words: null, boxes: [{ id: "wb-1", label: long(L.answerBoxLabel), hint: "" }] }))],
    ["answerBoxHint", (b) => withBlockIn(b, "wa-1", (block) => ({ ...block, words: null, boxes: [{ id: "wb-1", label: "One", hint: long(L.answerBoxHint) }] }))],
    ["casesHeading", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, heading: long(L.casesHeading) }))],
    ["maxTalkMinutes", (b) => withBlockIn(b, "cs-2", (block) => ({ ...block, talk: { minutes: L.maxTalkMinutes + 1, name: "pitch" } }))],
    ["talkName", (b) => withBlockIn(b, "cs-2", (block) => ({ ...block, talk: { minutes: 2, name: long(L.talkName) } }))],
    ["maxCaseGroups", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: many(L.maxCaseGroups + 1, (i) => ({ name: `Group ${i}`, packId: null, cases: [{ ...block.groups[1].cases[0], id: `ca-g${i}` }] })) }))],
    ["maxCases", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: [{ ...block.groups[0], cases: many(L.maxCases + 1, (i) => ({ ...block.groups[0].cases[0], id: `ca-z${i}` })) }] }))],
    ["caseGroupName", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: [{ ...block.groups[0], name: long(L.caseGroupName) }] }))],
    ["caseTitle", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: [{ ...block.groups[0], cases: [{ ...block.groups[0].cases[0], title: long(L.caseTitle) }] }] }))],
    ["caseStart", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: [{ ...block.groups[0], cases: [{ ...block.groups[0].cases[0], start: [run(long(L.caseStart))] }] }] }))],
    ["caseContentNote", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, groups: [{ ...block.groups[0], cases: [{ ...block.groups[0].cases[1], contentNote: long(L.caseContentNote) }] }] }))],
    ["casesColumn", (b) => withBlockIn(b, "cs-1", (block) => ({ ...block, startLabel: long(L.casesColumn) }))],
    ["fillInTitle", (b) => withBlockIn(b, "fi-1", (block) => ({ ...block, title: long(L.fillInTitle) }))],
    ["maxFillInGroups", (b) => withBlockIn(b, "fi-1", (block) => ({ ...block, groups: many(L.maxFillInGroups + 1, (i) => ({ heading: `Heading ${i}`, boxes: [{ id: `fb-g${i}`, label: "" }] })) }))],
    ["maxFillInBoxes", (b) => withBlockIn(b, "fi-1", (block) => ({ ...block, groups: [{ heading: "Many", boxes: many(L.maxFillInBoxes + 1, (i) => ({ id: `fb-z${i}`, label: `Box ${i}` })) }] }))],
    ["fillInHeading", (b) => withBlockIn(b, "fi-1", (block) => ({ ...block, groups: [{ ...block.groups[0], heading: long(L.fillInHeading) }] }))],
    ["fillInLabel", (b) => withBlockIn(b, "fi-1", (block) => ({ ...block, groups: [{ ...block.groups[1], boxes: [{ id: "fb-2", label: long(L.fillInLabel) }] }] }))],
    ["maxChecklistBlockItems", (b) => withBlockIn(b, "ck-1", (block) => ({ ...block, items: many(L.maxChecklistBlockItems + 1, (i) => ({ id: `ci-z${i}`, title: `Step ${i}`, mirrorToMyWork: false })) }))],
    ["checklistItemTitle", (b) => withBlockIn(b, "ck-1", (block) => ({ ...block, items: [{ ...block.items[0], title: long(L.checklistItemTitle) }] }))],
    ["checklistItemDetail", (b) => withBlockIn(b, "ck-1", (block) => ({ ...block, items: [{ ...block.items[1], detail: long(L.checklistItemDetail) }] }))],
    ["goFurtherHeading", (b) => withBlockIn(b, "gf-1", (block) => ({ ...block, heading: long(L.goFurtherHeading) }))],
    ["maxGoFurther", (b) => withBlockIn(b, "gf-1", (block) => ({ ...block, items: many(L.maxGoFurther + 1, () => block.items[0]) }))],
    ["handsOnHeading", (b) => withBlockIn(b, "ho-1", (block) => ({ ...block, heading: long(L.handsOnHeading) }))],
  ];

  /** Caps that are floors, not ceilings: each is broken the other way, by having too few. */
  const UNDER = [
    ["minReflectionPrompts", (b) => withBlockIn(b, "rs-2", (block) => ({ ...block, prompts: [] }))],
    ["minPacks", (b) => withBlockIn(b, "co-1", (block) => ({ ...block, packs: [block.packs[0]] }))],
  ];

  test("every cap is broken once, here", () => {
    const named = new Set([...OVER, ...UNDER].map(([cap]) => cap));
    assert.deepEqual(Object.keys(L).filter((cap) => !named.has(cap)), [], "a cap with no test that breaks it");
    assert.deepEqual([...named].filter((cap) => !(cap in L)), [], "a test for a cap that is gone");
  });

  for (const [cap, under] of UNDER) {
    test(`under ${cap}: the check says so, and the read drops what cannot stand`, () => {
      const blocks = under(syntheticWeekBlocks());
      assert.ok(model.weekBlocksProblems(blocks).length > 0, `${cap}: nothing said`);
      const read = model.sanitizeWeekBlocks(blocks);
      assert.deepEqual(model.weekBlocksProblems(read).filter((line) => !line.includes("points at")), [], `${cap}: still under after a read`);
    });
  }

  function withBlockIn(blocks, id, change) {
    const visit = (list) =>
      list.map((block) => {
        if (block.id === id) return change(clone(block));
        if (block.type === "part") return { ...block, blocks: visit(block.blocks) };
        return block;
      });
    return visit(blocks);
  }

  for (const [cap, over] of OVER) {
    test(`over ${cap}: the check says so, and the read cuts it back inside`, () => {
      const blocks = over(syntheticWeekBlocks());
      const problems = model.weekBlocksProblems(blocks);
      assert.ok(problems.length > 0, `${cap}: nothing said`);
      const read = model.sanitizeWeekBlocks(blocks);
      assert.deepEqual(model.weekBlocksProblems(read).filter((line) => !line.includes("points at")), [], `${cap}: still over after a read`);
    });
  }

  test("the whole list has a size cap, so a week's document stays far under Firestore's 1 MiB", () => {
    assert.ok(L.maxWeekBlocksChars <= 400_000);
    const week = syntheticWeekBlocks();
    const huge = Array.from({ length: 39 }, (_, i) => ({ id: `tx-h${i}`, type: "text", role: "section", heading: `Long ${i}`, time: "", body: Array.from({ length: 40 }, () => p(run("h".repeat(190)))) }));
    const problems = model.weekBlocksProblems([...week.slice(0, 1), ...huge]);
    assert.ok(problems.some((line) => line.includes("characters stored")), problems.join("\n"));
  });
});

// ---------------------------------------------------------------------------
// 3. Rich text as data, and links
// ---------------------------------------------------------------------------

describe("3. rich text is data, never markup", () => {
  test("a link is https or mailto; anything else keeps its words and loses the link", () => {
    assert.equal(prose.safeLinkUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(prose.safeLinkUrl("mailto:someone@example.com"), "mailto:someone@example.com");
    for (const bad of ["javascript:alert(1)", "java\nscript:alert(1)", "http://example.com", "data:text/html,x", "//example.com", "https://user:pw@example.com", "https://", "", 7]) {
      assert.equal(prose.safeLinkUrl(bad), null, String(bad));
    }
    assert.deepEqual(prose.sanitizeRuns([{ text: "click", href: "javascript:alert(1)" }]), [{ text: "click" }]);
  });

  test("a source's link is https only: mailto is for running text", () => {
    assert.equal(prose.safeSourceUrl("mailto:someone@example.com"), null);
    const blocks = withBlock("src-1", (source) => ({ ...source, url: "mailto:someone@example.com" }));
    assert.equal(findBlock(model.sanitizeWeekBlocks(blocks), "src-1"), null, "a source with no https link is not read");
    assert.ok(model.weekBlocksProblems(blocks).includes("Part 1’s source “A field guide to base rates” needs an https link."));
  });

  test("markup in text is text: nothing is ever parsed as HTML", () => {
    const runs = prose.sanitizeRuns([{ text: "<script>alert(1)</script> & <b>bold</b>" }]);
    assert.deepEqual(runs, [{ text: "<script>alert(1)</script> & <b>bold</b>" }]);
  });

  test("a line is canonical: spaces folded, ends trimmed, edge spaces outside a mark, neighbours with one style joined", () => {
    assert.deepEqual(
      prose.canonicalRuns([
        { text: "  Read\n the " },
        { text: " bold ", bold: true },
        { text: "words", bold: true },
        { text: " and " },
        { text: "", italic: true },
        { text: "a link ", href: "https://example.com" },
        { text: " here.  " },
      ]),
      [
        { text: "Read the " },
        { text: "bold words", bold: true },
        { text: " and " },
        { text: "a link", href: "https://example.com" },
        { text: " here." },
      ],
    );
    const once = prose.canonicalRuns([{ text: " a " }, { text: " b ", italic: true }, { text: " c" }]);
    assert.deepEqual(prose.canonicalRuns(once), once, "canonical twice is canonical once");
  });

  test("prose keeps paragraphs and lists in order, drops empty ones, and is cut to its caps", () => {
    const read = prose.sanitizeProse([
      { type: "p", runs: [{ text: "One." }] },
      { type: "h1", runs: [{ text: "not a kind" }] },
      { type: "ul", items: [{ runs: [{ text: "a" }] }, { runs: [] }, { runs: [{ text: "b" }] }] },
      { type: "ol", items: [] },
      { type: "p", runs: [{ text: "   " }] },
    ]);
    assert.deepEqual(read, [p(run("One.")), { type: "ul", items: [{ runs: [run("a")] }, { runs: [run("b")] }] }]);
    assert.equal(prose.proseText(read), "One.\n\na\nb");
    assert.equal(prose.proseChars(prose.sanitizeProse([p(run("x".repeat(20)))], 5)), 5);
  });
});

// ---------------------------------------------------------------------------
// 4. Ids
// ---------------------------------------------------------------------------

describe("4. stable ids", () => {
  test("an id is letters, digits, - and _, at most 48, never holding __", () => {
    for (const good of ["src-1", "m_abc_def", "A1", "x".repeat(48)]) assert.equal(model.isWeekItemId(good), true, good);
    for (const bad of ["", "-x", "_x", "a__b", "a b", "a/b", "x".repeat(49), 7, null]) assert.equal(model.isWeekItemId(bad), false, String(bad));
  });

  test("a fresh id has its prefix and ten random characters, and two are never the same", () => {
    const ids = new Set(Array.from({ length: 500 }, () => model.newWeekItemId("src")));
    assert.equal(ids.size, 500);
    for (const id of ids) {
      assert.match(id, /^src-[a-z0-9]{10}$/);
      assert.equal(model.isWeekItemId(id), true);
    }
  });

  test("every block and every thing a person answers or ticks has an id, listed with what it names", () => {
    const items = model.weekItems(syntheticWeekBlocks());
    const kinds = new Map(items.map((item) => [item.id, item.kind]));
    assert.equal(kinds.get("src-1"), "block:source");
    assert.equal(kinds.get("rp-1"), "prompt");
    assert.equal(kinds.get("pk-2"), "pack");
    assert.equal(kinds.get("pk-5"), "pack", "an option in a list is a pack too");
    assert.equal(kinds.get("ca-3"), "case");
    assert.equal(kinds.get("fb-3"), "box");
    assert.equal(kinds.get("ci-2"), "checkItem");
    assert.equal(kinds.get("wa-1"), "block:writtenAnswer");
    assert.equal(items.length, new Set(items.map((item) => item.id)).size, "unique in the week");
  });

  test("a reused id: the first item keeps it on read, and the check names it", () => {
    const blocks = withBlock("rs-2", (stop) => ({ ...stop, prompts: [{ id: "rp-1", text: "Reused?" }] }));
    assert.ok(model.weekBlocksProblems(blocks).includes("The id rp-1 is used twice."));
    const read = model.sanitizeWeekBlocks(blocks);
    assert.equal(findBlock(read, "rs-2"), null, "a stop left with no prompt is not read");
    assert.equal(findBlock(read, "rs-1").prompts[0].id, "rp-1");
  });

  test("an id the site can't use is named, and the block is not read", () => {
    const blocks = withBlock("src-1", (source) => ({ ...source, id: "src__1" }));
    assert.ok(model.weekBlocksProblems(blocks).some((line) => line.includes("has an id the site can’t use")));
    assert.equal(findBlock(model.sanitizeWeekBlocks(blocks), "src__1"), null);
  });
});

// ---------------------------------------------------------------------------
// 5. Two shapes of week, and Ready
// ---------------------------------------------------------------------------

describe("5. two shapes of week", () => {
  const LEGACY = {
    weekNumber: 3,
    title: "Goal misgeneralisation",
    summary: "Why a model that scores well can still be doing the wrong thing.",
    guideBlocks: [{ id: "b1", type: "richText", html: "<p>Read in this order.</p>" }],
    materials: [{ id: "m1", type: "reading", title: "A paper", url: "https://example.org/paper", estimatedMinutes: 40 }],
    exercises: [{ id: "e1", prompt: "Describe a case.", responseType: "text", required: true, maxLength: 2000, peerVisible: false }],
    checklist: [{ id: "c1", title: "Bring a question", mirrorToMyWork: false }],
    questions: [],
    estimatedMinutes: 60,
    published: true,
  };

  test("a week written before blocks has no blocks key, and reads as it always has", () => {
    const week = courses.normalizeCourseWeek("w03", LEGACY);
    assert.equal("blocks" in week, false);
    assert.equal(model.isBlockWeek(week), false);
    assert.deepEqual(week.materials.map((m) => m.id), ["m1"]);
    assert.deepEqual(model.weekBlocksField(week), {});
  });

  test("a block week keeps its blocks; an empty list is still a block week", () => {
    const week = courses.normalizeCourseWeek("w03", syntheticWeekDoc());
    assert.deepEqual(week.blocks, syntheticWeekBlocks());
    assert.equal(model.isBlockWeek(week), true);
    const empty = courses.normalizeCourseWeek("w03", { ...LEGACY, blocks: [] });
    assert.deepEqual(empty.blocks, []);
    assert.equal(model.isBlockWeek(empty), true);
  });

  test("Ready counts only on a published week, and only a stored true is on", () => {
    const ready = (data) => courses.normalizeCourseWeek("w01", { weekNumber: 1, ...data }).ready;
    assert.equal(ready({ published: true, ready: true }), true);
    assert.equal(ready({ published: false, ready: true }), false, "a ready week is always a published one");
    assert.equal(ready({ published: true }), false);
    assert.equal(ready({ published: true, ready: "yes" }), false);
    assert.equal(ready({}), false);
  });

  test("a copy of a week written before blocks has the same keys it always had", () => {
    const fields = templateWeekFields(courses.normalizeCourseWeek("w03", LEGACY));
    assert.deepEqual(Object.keys(fields).sort(), [
      "checklist", "estimatedMinutes", "exercises", "guideBlocks", "materials", "published", "questions", "summary", "title", "weekNumber",
    ]);
  });

  test("a copy of a block week carries its blocks, ids and all, and not its Ready", () => {
    const week = courses.normalizeCourseWeek("w03", syntheticWeekDoc({ ready: true }));
    assert.equal(week.ready, true);
    const fields = templateWeekFields(week);
    assert.deepEqual(fields.blocks, syntheticWeekBlocks());
    assert.equal("ready" in fields, false, "Ready is the run's own week's, as pitching is");
    const back = templateWeekFields(courses.normalizeCourseWeek("w03", fields));
    assert.deepEqual(back, fields, "run to template to run is a fixpoint");
  });

  /**
   * THE CLASS: a week copied without its blocks. Every object literal under
   * `src` that writes a whole week (it names the week's guide, materials,
   * exercises and checklist) must carry the blocks too, by spreading
   * `weekBlocksField(...)` (the read side's own literal spreads a `blocks:`
   * of its own), or every copy made that way drops a block week's content.
   * One literal makes a NEW week, which has none yet. Walks the tree, so a
   * new copy is held to it the day it is written.
   */
  test("every literal that writes a whole week carries its blocks", () => {
    const WEEK_PARTS = ["guideBlocks", "materials", "exercises", "checklist"];
    /** Literals that write a whole week and rightly carry no blocks, each with why. */
    const MAKES_A_NEW_WEEK = new Map([
      ["features/courses/courseMutations.ts", "ensureWeekDoc creates an empty week for a slot nobody has written: a new week has no blocks"],
    ]);
    const found = [];
    const missing = [];
    for (const file of walkSource(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("guideBlocks")) continue;
      const where = relative(SRC, file).split(sep).join("/");
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node) => {
        if (ts.isObjectLiteralExpression(node)) {
          const names = node.properties
            .map((property) => (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null))
            .filter(Boolean);
          if (WEEK_PARTS.every((part) => names.includes(part))) {
            const at = `${where}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
            found.push(at);
            const carries =
              names.includes("blocks") ||
              node.properties.some(
                (property) =>
                  ts.isSpreadAssignment(property) && /\bweekBlocksField\(|\bblocks\s*:/.test(property.expression.getText(tree)),
              );
            if (!carries && !MAKES_A_NEW_WEEK.has(where)) missing.push(at);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    for (const file of [
      "app/api/courses/runs/[runId]/clone-weeks/route.ts",
      "app/api/courses/runs/[runId]/normalise-weeks/route.ts",
      "lib/firestore/courseTemplates.ts",
      ...MAKES_A_NEW_WEEK.keys(),
    ]) {
      assert.ok(found.some((at) => at.startsWith(`${file}:`)), `the walk did not see ${file}: ${found.join(", ")}`);
    }
    assert.deepEqual(missing, [], `a whole week written without its blocks: ${missing.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// 6. When work is due, for one group
// ---------------------------------------------------------------------------

describe("6. due moments, from the group's own calendar", () => {
  /** A group meeting on Tuesdays at 18:00 for two hours, week by week from Tue 3 Nov 2026. */
  function sessions({ cancelled = [], undated = [] } = {}) {
    const dates = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"];
    return dates.map((dateKey, i) => {
      const weekNumber = i + 1;
      return {
        weekNumber,
        weekId: `w0${weekNumber}`,
        occurrence: 1,
        sessionKey: `w0${weekNumber}`,
        slotStartKey: dateKey,
        dateKey: undated.includes(weekNumber) ? "" : dateKey,
        session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "", meetingUrl: null, notes: "" },
        cancelled: cancelled.includes(weekNumber),
      };
    });
  }

  test("by the end of the day before: the London midnight that starts the session's day", () => {
    const due = dueMoment(sessions(), 3, "dayBefore");
    assert.equal(due.at.toISOString(), "2026-11-17T00:00:00.000Z");
    assert.equal(due.dateKey, "2026-11-16", "the day to name is the Monday");
    assert.equal(due.moved, false);
  });

  test("before the session and at the session: the session's start", () => {
    for (const rule of ["before", "atSession"]) {
      const due = dueMoment(sessions(), 3, rule);
      assert.equal(due.at.toISOString(), "2026-11-17T18:00:00.000Z");
      assert.equal(due.dateKey, "2026-11-17");
    }
  });

  test("a cancelled session moves the work to the group's next session, by the same rule", () => {
    const due = dueMoment(sessions({ cancelled: [4] }), 4, "dayBefore");
    assert.equal(due.moved, true);
    assert.equal(due.dateKey, "2026-11-30", "the day before Tue 1 Dec");
    assert.equal(due.at.toISOString(), "2026-12-01T00:00:00.000Z");
    const talk = dueMoment(sessions({ cancelled: [4] }), 4, "atSession");
    assert.equal(talk.at.toISOString(), "2026-12-01T18:00:00.000Z", "the talk moves with it");
    assert.equal(dueMoment(sessions({ cancelled: [4, 5] }), 4, "dayBefore").dateKey, "2026-12-07", "and past two in a row");
  });

  test("in British Summer Time the midnight is London's, an hour before UTC's", () => {
    const summer = sessions().map((s, i) => ({ ...s, dateKey: `2026-06-0${i + 2}` }));
    assert.equal(dueMoment(summer, 1, "dayBefore").at.toISOString(), "2026-06-01T23:00:00.000Z");
  });

  test("nothing to date is no due moment, never a guess", () => {
    assert.equal(dueMoment(sessions({ undated: [3] }), 3, "dayBefore"), null, "no date yet");
    assert.equal(dueMoment(sessions(), 9, "dayBefore"), null, "a week the group does not teach");
    assert.equal(dueMoment(sessions({ cancelled: [5, 6] }), 5, "dayBefore"), null, "nothing held after it");
    assert.equal(dueMoment([], 1, "before"), null);
  });

  test("the course says the day before's time: noon is London's noon, in winter and in summer", () => {
    const due = dueMoment(sessions(), 3, "dayBefore", "12:00");
    assert.equal(due.at.toISOString(), "2026-11-16T12:00:00.000Z");
    assert.equal(due.dateKey, "2026-11-16");
    const summer = sessions().map((s, i) => ({ ...s, dateKey: `2026-06-0${i + 2}` }));
    assert.equal(dueMoment(summer, 1, "dayBefore", "12:00").at.toISOString(), "2026-06-01T11:00:00.000Z");
    assert.equal(dueMoment(sessions({ cancelled: [4] }), 4, "dayBefore", "12:00").at.toISOString(), "2026-11-30T12:00:00.000Z", "a cancelled session moves it by the same setting");
    for (const odd of [null, "", "25:00", "noon", 12]) {
      assert.equal(dueMoment(sessions(), 3, "dayBefore", odd).at.toISOString(), "2026-11-17T00:00:00.000Z", `${String(odd)} reads as the end of the day`);
    }
    assert.equal(dueMoment(sessions(), 3, "atSession", "12:00").at.toISOString(), "2026-11-17T18:00:00.000Z", "only the day before reads the setting");
  });

  test("the course's setting is a time or nothing, wherever a course is read", () => {
    const course = (data) => courses.normalizeCourse("c1", { title: "A course", ...data }).dayBeforeDueTime;
    assert.equal(course({ dayBeforeDueTime: "12:00" }), "12:00");
    assert.equal(course({}), null, "every course written before it: the end of the day");
    for (const odd of ["24:00", "9:00", "noon", 900, true]) assert.equal(course({ dayBeforeDueTime: odd }), null, String(odd));
    assert.equal(model.isClockTime("23:59"), true);
    assert.equal(model.isClockTime("00:00"), true);
  });

  test("late means first sent after the moment, and nothing is late without one", () => {
    const due = dueMoment(sessions(), 3, "dayBefore");
    assert.equal(isLate(new Date("2026-11-16T23:59:59Z"), due), false);
    assert.equal(isLate(new Date("2026-11-17T00:00:01Z"), due), true);
    assert.equal(isLate(new Date("2030-01-01T00:00:00Z"), null), false);
  });
});
