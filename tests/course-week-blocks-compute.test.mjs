/**
 * What a notebook needs to run, in a week's Markdown: written out and read
 * back for a notebook alone, so a week copied out and pasted back is always
 * the same week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * A source's `compute` ("Runs on a free notebook service", "Needs a paid API
 * key") is what a NOTEBOOK needs to run. The Markdown's reader takes that
 * sentence back for a notebook alone, and leaves a "Needs ..." sentence on any
 * other kind in its note, where its author put it. So:
 *
 *  1. A NOTEBOOK keeps what it needs through a copy and a paste, on the path
 *     and in Go further: the sentence is written, and read back as `compute`.
 *  2. EVERY OTHER KIND has none to keep: the model (`sanitizeWeekBlocks`, which
 *     every stored week and every paste goes through) keeps no `compute` on
 *     it, the copy writes no such sentence for it, and the week reads back the
 *     same. Before this, the writer wrote the sentence for any kind and the
 *     reader folded it into the note, so the week pasted back was another.
 *  3. A "Needs ..." SENTENCE IN AN ORDINARY SOURCE'S NOTE stays in its note,
 *     through a copy and a paste.
 *
 * Every word and address here is made up (`tests/lib/weekBlocksFixture.mjs`).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const { weekToMarkdown } = await loadTs("lib/courses/weekBlocks/markdownWrite.ts");
const { readPastedWeek } = await loadTs("lib/courses/weekBlocks/paste.ts");
const model = await loadTs("lib/courses/weekBlocks/model.ts");

const TITLE = "How sure are you?";
const NEEDS = "Needs a free account";

/** A counter for fresh ids, so a paste that mints one is seen to. */
function counter() {
  let n = 0;
  return (prefix) => `${prefix}-new${++n}`;
}

/** The week as the site holds it: through the one reading every stored week and every paste takes. */
const asHeld = (blocks) => model.sanitizeWeekBlocks(structuredClone(blocks));

/** Copied out as Markdown and pasted back over itself. */
function roundTrip(held) {
  const markdown = weekToMarkdown({ weekNumber: 3, title: TITLE, blocks: held });
  const read = readPastedWeek({ markdown, weekNumber: 3, stored: held, dayBeforeTime: null, mint: counter() });
  return { markdown, read };
}

/** Every source on the week's path, a part's own included. */
const pathSources = (blocks) => model.allBlocks(blocks).filter((block) => block.type === "source");

/** Every Go further item. */
const furtherItems = (blocks) => blocks.filter((block) => block.type === "goFurther").flatMap((block) => block.items);

/** The synthetic week with its first source on the path, and its first Go further item, made `kind` and given what it needs. */
function weekWith(kind) {
  const blocks = syntheticWeekBlocks();
  Object.assign(pathSources(blocks)[0], { kind, compute: NEEDS });
  Object.assign(furtherItems(blocks)[0], { kind, compute: NEEDS });
  return blocks;
}

const OTHER_KINDS = model.SOURCE_KINDS.filter((kind) => kind !== "notebook");

describe("1. a notebook keeps what it needs to run, through a copy and a paste", () => {
  test("on the path and in Go further, the sentence is written and read back as what it needs", () => {
    const held = asHeld(weekWith("notebook"));
    assert.equal(pathSources(held)[0].compute, NEEDS);
    assert.equal(furtherItems(held)[0].compute, NEEDS);
    const { markdown, read } = roundTrip(held);
    assert.equal(markdown.split(`${NEEDS}.`).length - 1, 2, "the sentence, once for each notebook");
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.blocks, held);
    assert.equal(read.minted, 0);
  });

  test("the fixture's own notebook, on the path, comes back with its sentence", () => {
    const held = asHeld(syntheticWeekBlocks());
    const notebook = pathSources(held).find((source) => source.kind === "notebook");
    assert.equal(notebook.compute, "Runs on a free notebook service");
    const { markdown, read } = roundTrip(held);
    assert.ok(markdown.includes("Runs on a free notebook service."));
    assert.deepEqual(read.blocks, held);
  });
});

describe("2. every other kind has nothing to run, and the week reads back the same", () => {
  for (const kind of OTHER_KINDS) {
    const label = model.SOURCE_KIND_LABEL[kind];
    test(`${/^[AEIOU]/.test(label) ? "an" : "a"} ${label} source given what a notebook needs: none is kept, none written, and the same week comes back`, () => {
      const held = asHeld(weekWith(kind));
      assert.deepEqual([pathSources(held)[0].kind, pathSources(held)[0].compute], [kind, ""]);
      assert.deepEqual([furtherItems(held)[0].kind, furtherItems(held)[0].compute], [kind, ""]);
      const { markdown, read } = roundTrip(held);
      assert.ok(!markdown.includes(NEEDS), `a ${kind} source's copy says what a notebook needs`);
      assert.deepEqual(read.problems, []);
      assert.deepEqual(read.blocks, held);
      assert.equal(read.minted, 0);
    });
  }

  test("the copy writes the sentence for a notebook alone, even handed a week the model has not read", () => {
    const blocks = weekWith("read");
    const markdown = weekToMarkdown({ weekNumber: 3, title: TITLE, blocks });
    assert.ok(!markdown.includes(NEEDS), "the copy wrote a read's compute");
  });
});

describe("3. a sentence about what a reading needs stays in its note", () => {
  test("a Read whose note says what it needs keeps it in its note, through a copy and a paste", () => {
    const blocks = syntheticWeekBlocks();
    const first = pathSources(blocks)[0];
    Object.assign(first, { kind: "read", compute: "", note: [{ text: `${NEEDS}. The first half is enough.` }] });
    const held = asHeld(blocks);
    const { read } = roundTrip(held);
    assert.deepEqual(read.blocks, held);
    const back = pathSources(read.blocks)[0];
    assert.deepEqual([back.compute, back.note.map((run) => run.text).join("")], ["", `${NEEDS}. The first half is enough.`]);
  });
});
