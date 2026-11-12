/**
 * Editing a week where it stands, the pages: the pure half
 * (`src/lib/courses/weekEdit/pageModel.ts`, `pageWords.ts`), and the week's
 * page and its history page on a programme's Weeks tab drawn for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The pure half is held on the editor's own fields, read from the synthetic
 * week (`tests/lib/weekBlocksFixture.mjs`) by the server's loader
 * (`editorFieldsOf`), so what a save sends is checked against what the page
 * is really handed. The pages are drawn with `tests/lib/weeksTabWorld.mjs`
 * (week 3 of AGI Strategy's run, written as blocks and published, Tue 17 Nov
 * 2026 at noon), as the lead, an admin and the people who are refused.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, NOW, PROGRAMME_PATH, ROUND, RUN, makeWeeksTabWorld } from "./lib/weeksTabWorld.mjs";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeeksTabWorld("__weekEditPages");
const { world, draw, tabsPage, call, courseRoute, loadTs } = w;
const page = await loadTs(join("lib", "courses", "weekEdit", "pageModel.ts"));
const words = await loadTs(join("lib", "courses", "weekEdit", "pageWords.ts"));
const { EDIT_REFUSAL } = await loadTs(join("lib", "courses", "weekEdit", "words.ts"));
const model = await loadTs(join("lib", "courses", "weekEdit", "model.ts"));
const WeekPage = await tabsPage("weeks", "[weekId]", "page.tsx");
const HistoryPage = await tabsPage("weeks", "[weekId]", "history", "page.tsx");
const blockRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks", "[blockId]");
const { default: BlockPanel } = await loadTs(join("features", "applications", "weeks", "edit", "BlockPanel.tsx"));

const W3 = `courseRuns/${RUN.agi}/weeks/w03`;
const at = (weekId) => ({ roundId: ROUND, programmeId: AGI, weekId });
const T_TICKED = new Date("2026-11-13T10:00:00Z");

/** The editor's fields for one block of the synthetic week, as the server hands them to the page. */
function fieldsOf(id) {
  const located = model.locateBlock(syntheticWeekBlocks(), id);
  assert.ok(located, id);
  return model.editorFieldsOf(located);
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. The count beside a block: numbers only
// ---------------------------------------------------------------------------

describe("1. the count beside each block", () => {
  test("a source, a checklist and a Choose one count ticks; a reflection and fill-in boxes answers; a written answer the people who sent it", () => {
    const counts = { ticks: 7, answers: 3, sent: 2 };
    assert.equal(page.countLine("source", counts), "7 ticked");
    assert.equal(page.countLine("checklist", counts), "7 ticked");
    assert.equal(page.countLine("chooseOne", counts), "7 ticked");
    assert.equal(page.countLine("reflection", counts), "3 answers");
    assert.equal(page.countLine("reflection", { ...counts, answers: 1 }), "1 answer");
    assert.equal(page.countLine("fillIn", counts), "3 answers");
    assert.equal(page.countLine("writtenAnswer", counts), "2 sent");
  });

  test("a block nobody ticks or answers has no count at all", () => {
    for (const type of ["thisWeek", "text", "outcomes", "contentNote", "part", "table", "cases", "inTheSession", "goFurther", "handsOn"]) {
      assert.equal(page.countLine(type, { ticks: 4, answers: 4, sent: 4 }), null, type);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What a save sends: only what changed, the ids as loaded
// ---------------------------------------------------------------------------

describe("2. a save sends only the fields whose boxes changed", () => {
  test("nothing changed: nothing is sent", () => {
    for (const id of ["src-1", "tx-before", "tx-2", "rs-1", "wa-1"]) {
      const stored = fieldsOf(id);
      assert.equal(page.changesOf(stored, page.draftOf(stored)), null, id);
    }
  });

  test("a source: one field changed is the one field sent; a changed link says it is the same reading", () => {
    const stored = fieldsOf("src-1");
    const draft = page.draftOf(stored);
    assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, title: "A field guide to base rates, revised" } }), {
      fields: { title: "A field guide to base rates, revised" },
    });
    assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, url: "https://example.com/base-rates-2" } }), {
      fields: { url: "https://example.com/base-rates-2" },
      reading: "same",
    });
    assert.deepEqual(
      page.changesOf(stored, { ...draft, fields: { ...draft.fields, kind: "watchOrRead", time: "16 minutes" } }),
      { fields: { kind: "watchOrRead", time: "16 minutes" } },
      "never `reading` without a new link",
    );
  });

  test("a text: its words; a heading or a time only where the block may carry one", () => {
    const before = fieldsOf("tx-before");
    assert.equal(before.fields.timeAllowed, true);
    const draft = page.draftOf(before);
    assert.deepEqual(page.changesOf(before, { ...draft, fields: { ...draft.fields, body: "Work through the parts **in order**.", time: "About an hour" } }), {
      fields: { time: "About an hour", body: "Work through the parts **in order**." },
    });
    const plain = fieldsOf("tx-2");
    assert.equal(plain.fields.timeAllowed, false);
    const plainDraft = page.draftOf(plain);
    assert.deepEqual(
      page.changesOf(plain, { ...plainDraft, fields: { ...plainDraft.fields, time: "Ten minutes", body: "- Write a number." } }),
      { fields: { body: "- Write a number." } },
      "a time on a text that cannot carry one is never sent",
    );
  });

  test("a reflection: every prompt, each with the id it was loaded with, in order", () => {
    const stored = fieldsOf("rs-1");
    const draft = page.draftOf(stored);
    const reworded = { ...draft, fields: { prompts: draft.fields.prompts.map((prompt, at) => (at === 1 ? { ...prompt, text: "Why might yours differ?" } : prompt)) } };
    assert.deepEqual(page.changesOf(stored, reworded), {
      fields: {
        prompts: [
          { id: "rp-1", text: "Pick a question you care about. What is its base rate?" },
          { id: "rp-2", text: "Why might yours differ?" },
        ],
      },
    });
  });

  test("a written answer: a new range as two numbers, none as null, and a range that isn't two whole numbers is refused before anything is sent", () => {
    const stored = fieldsOf("wa-1");
    const draft = page.draftOf(stored);
    assert.deepEqual([draft.fields.min, draft.fields.max], ["200", "300"]);
    assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, max: "400" } }), { fields: { words: { min: 200, max: 400 } } });
    assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, min: "", max: "" } }), { fields: { words: null } });
    for (const [min, max] of [["200", ""], ["two hundred", "300"], ["200.5", "300"], ["-1", "300"]]) {
      assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, min, max } }), { error: EDIT_REFUSAL.wordsShape }, `${min} to ${max}`);
    }
    assert.deepEqual(page.changesOf(stored, { ...draft, fields: { ...draft.fields, due: "before", question: "Will it?" } }), {
      fields: { question: "Will it?", due: "before" },
    });
  });

  test("a written answer in boxes never sends a word range", () => {
    const stored = fieldsOf("wa-1");
    const boxed = { type: "writtenAnswer", fields: { ...stored.fields, words: null, boxes: [{ id: "bx-1", label: "Your plan" }] } };
    const draft = page.draftOf(boxed);
    assert.equal(page.changesOf(boxed, { ...draft, fields: { ...draft.fields, min: "10", max: "20" } }), null);
  });

  test("the fields a save sends are ones the route reads, and the route reads them back to the same block", () => {
    const stored = fieldsOf("src-1");
    const draft = page.draftOf(stored);
    const changes = page.changesOf(stored, { ...draft, fields: { ...draft.fields, url: "https://example.com/base-rates-2", title: "A field guide" } });
    const base = model.blockFingerprint(model.locateBlock(syntheticWeekBlocks(), "src-1").block);
    const parsed = model.parseEditBody({ base, ...changes }, "source");
    assert.ok(!("error" in parsed), JSON.stringify(parsed));
    const applied = model.applyBlockEdit(syntheticWeekBlocks(), "src-1", parsed);
    assert.equal(applied.ok, true, applied.error);
    const after = model.locateBlock(applied.blocks, "src-1").block;
    assert.deepEqual([after.id, after.title, after.url], ["src-1", "A field guide", "https://example.com/base-rates-2"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Who a save reaches, the history's helpers, and the paste's check
// ---------------------------------------------------------------------------

describe("3. the words around a save, the history and the paste", () => {
  test("Save for: every group, and the groups reading their own copy named", () => {
    const groups = [
      { id: "a", name: "Group A", ownCopy: false },
      { id: "k", name: "Group K", ownCopy: true },
    ];
    assert.deepEqual(page.saveScope({ groups, reading: 1, copies: ["Group K"] }, "AGI Strategy"), {
      title: "Every group on AGI Strategy (2)",
      line: "Group K reads its own copy of this week, so this save doesn’t reach it.",
    });
    assert.deepEqual(page.saveScope({ groups: groups.slice(0, 1), reading: 1, copies: [] }, "AGI Strategy"), {
      title: "Every group on AGI Strategy (1)",
      line: "The 1 group reads this.",
    });
    assert.equal(words.PANEL_WORDS.exceptCopies(["Group J", "Group K"]), "Group J and Group K read their own copy of this week, so this save doesn’t reach them.");
  });

  test("a restore names the day of its version; one tick compares with now, two with each other, a third lets the oldest go", () => {
    assert.equal(page.versionLabel("Mon 9 Nov, 6:40pm"), "Mon 9 Nov");
    assert.equal(words.HISTORY_PAGE.restore(page.versionLabel("Mon 9 Nov, 6:40pm")), "Restore the Mon 9 Nov version");
    assert.deepEqual(page.compareRequest(["s000002"]), { saveId: "s000002", against: "now" });
    assert.deepEqual(page.compareRequest(["s000002", "s000004"]), { saveId: "s000002", against: "s000004" });
    assert.equal(page.compareRequest([]), null);
    assert.deepEqual(page.tickRow(["s1", "s2"], "s3", true), ["s2", "s3"]);
    assert.deepEqual(page.tickRow(["s1", "s2"], "s1", false), ["s2"]);
  });

  test("the paste's check: what it holds by kind, what each changed block keeps and what a removed one takes out", () => {
    assert.equal(page.kindsLine([{ label: "This week", count: 1 }, { label: "Source", count: 6 }]), "This week · Source (6)");
    const rows = page.pasteRows(
      [
        { state: "changed", blockId: "src-2", place: "Part 2’s source", fields: "link", itemsTakenOut: [] },
        { state: "removed", blockId: "rs-3", place: "Part 3’s reflection", fields: "", itemsTakenOut: ["rp-5"] },
        { state: "added", blockId: "", place: "Part 4’s text", fields: "", itemsTakenOut: [] },
      ],
      (id) => (id === "src-2" ? { ticks: 7, answers: 0, sent: 0 } : null),
      [{ id: "rp-5", answers: 2 }],
    );
    assert.deepEqual(
      rows.map((row) => [row.state, row.keeps, row.answers]),
      [
        ["changed", "Keeps 7 ticks", 0],
        ["removed", "", 2],
        ["added", "", 0],
      ],
    );
    assert.equal(page.replaceLabel(3, { groups: [{}, {}, {}], reading: 3 }, 0), "Replace week 3 for every group (3)");
    assert.equal(page.replaceLabel(3, { groups: [{}, {}, {}], reading: 2 }, 2), "Replace week 3 for 2 of 3 groups and take out 2 answers");
  });

  test("every sentence the pages say is free of dashes", () => {
    const sentences = [];
    // A function is asked with a name and numbers, else a list of names, else a send's counts.
    const tries = [
      (n) => Array.from({ length: n }, (_, i) => (i === 0 ? "Name" : 3)),
      (n) => Array.from({ length: n }, (_, i) => (i === 0 ? ["Group J", "Group K"] : 3)),
      (n) => Array.from({ length: n }, () => ({ count: 3, sent: 2, held: 1, suppressed: 1, failed: 1 })),
    ];
    const walk = (value) => {
      if (typeof value === "string") sentences.push(value);
      else if (typeof value === "function") {
        for (const args of tries) {
          try {
            const said = value(...args(value.length));
            if (typeof said === "string") {
              sentences.push(said);
              break;
            }
          } catch {
            // The next shape of arguments.
          }
        }
      } else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    for (const [name, value] of Object.entries(words)) if (name !== "listWords") walk(value);
    assert.ok(sentences.length > 60, `${sentences.length} sentences read`);
    for (const said of sentences) assert.doesNotMatch(said, /[\u2013\u2014]/, said);
  });
});

// ---------------------------------------------------------------------------
// 3b. The side panel's boxes, each labelled by its own label
// ---------------------------------------------------------------------------

describe("3b. the side panel: every box has its own label, and no id is used twice", () => {
  for (const id of ["src-1", "tx-before", "rs-1", "wa-1"]) {
    test(`the panel for ${id}`, () => {
      const located = model.locateBlock(syntheticWeekBlocks(), id);
      const item = {
        blockId: id,
        type: located.block.type,
        place: model.placeWords(located),
        partNumber: located.partNumber,
        editable: true,
        fingerprint: model.blockFingerprint(located.block),
        fields: model.editorFieldsOf(located),
        counts: { ticks: 1, answers: 2, sent: 1 },
      };
      const html = renderToStaticMarkup(
        createElement(BlockPanel, {
          item,
          latest: item,
          runId: RUN.agi,
          weekId: "w03",
          weekNumber: 3,
          programme: "AGI Strategy",
          reach: { groups: [{ id: "a", name: "Group A", ownCopy: false }], reading: 1, copies: [] },
          live: true,
          lost: false,
          lockedBy: null,
          onClose() {},
          onSaved() {},
          onRefusedBy() {},
          onStale() {},
        }),
      );
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `an id is used twice: ${ids.join(" ")}`);
      const labels = [...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]*)</g)];
      assert.ok(labels.length > 0, "no labelled box");
      for (const [, target, words] of labels) {
        assert.match(html, new RegExp(`<(input|textarea|select)[^>]*id="${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `“${words}” labels no box`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The week's page, drawn
// ---------------------------------------------------------------------------

/** Chloe has ticked the first source; Farah has sent the written answer. */
function seedWork() {
  world.db.seed(`courseProgress/${RUN.agi}__chloe__src-1`, {
    runId: RUN.agi,
    uid: "chloe",
    weekNumber: 3,
    itemKind: "material",
    itemId: "src-1",
    completed: true,
    completedAt: T_TICKED,
  });
  world.db.seed(`courseExerciseResponses/${RUN.agi}__farah__w03__wa-1`, {
    runId: RUN.agi,
    uid: "farah",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "wa-1",
    responseType: "text",
    text: "Sixty percent, for three reasons.",
    words: 5,
    firstWrittenAt: T_TICKED,
    updatedAt: T_TICKED,
    firstSentAt: T_TICKED,
    submittedAt: T_TICKED,
    reviewStatus: "pending",
  });
}

describe("4. the week's page: as it reads, with what people have done beside each block", () => {
  test("the lead and an admin: the week's line, its blocks in order with their counts, Change on the four kinds alone, and the paste kept", async () => {
    seedWork();
    for (const who of ["claudia", "zach"]) {
      const drawn = await draw(who, WeekPage, at("w03"));
      assert.equal(drawn.to, null, who);
      const { html, text } = drawn;
      assert.match(text, /Week 3, as it reads/, who);
      // Ten people hold a told place in the four groups; Chloe and Farah have something of theirs on week 3.
      assert.match(text, /Live Open for 4 groups and 10 people · 2 people have started it/, who);
      assert.match(html, new RegExp(`href="${PROGRAMME_PATH}/weeks/w03/history"`), `${who}: History`);
      assert.match(html, /href="#paste-the-week"/, `${who}: Paste the week leads to the paste`);
      assert.match(html, /id="paste-the-week"/);
      assert.match(text, /Paste the week, then check it/, "the paste keeps its place");
      // Every block of the week, in page order, each a card.
      const cards = [...html.matchAll(/<li id="edit-([^"]+)"[^>]*data-block-type="([^"]+)"/g)].map((m) => [m[1], m[2]]);
      const expected = [];
      for (const block of syntheticWeekBlocks()) {
        expected.push([block.id, block.type]);
        if (block.type === "part") for (const child of block.blocks) expected.push([child.id, child.type]);
      }
      assert.deepEqual(cards, expected, `${who}: one card per block, in page order`);
      // A Change on each source, text, reflection and written answer, and on nothing else.
      const changes = [...html.matchAll(/aria-label="Change ([^"]+)"/g)].map((m) => m[1]);
      const editable = expected.filter(([, type]) => ["source", "text", "reflection", "writtenAnswer"].includes(type));
      assert.equal(changes.length, editable.length, `${who}: ${changes.join(" | ")}`);
      // Each told apart from its neighbours: two sources in one part are two names.
      assert.ok(changes.includes("Part 1’s source: A field guide to base rates"), changes.join(" | "));
      assert.ok(changes.includes("Part 1’s source: The forecaster’s handbook"), changes.join(" | "));
      assert.equal(new Set(changes).size, changes.length, `two Change buttons share a name: ${changes.join(" | ")}`);
      // Counts, numbers only.
      const card = (id) => new RegExp(`<li id="edit-${id}"[\\s\\S]*?</li>`).exec(html)?.[0] ?? "";
      assert.match(textOf(card("src-1")), /Source · Part 1 1 ticked Change A field guide to base rates/);
      assert.match(textOf(card("wa-1")), /1 sent Change/);
      assert.match(textOf(card("rs-1")), /0 answers Change/);
      assert.doesNotMatch(card("tw-1"), /Change|ticked|answers/, "This week: nothing pressable, no count");
      for (const name of ["Chloe", "Farah", "Sixty percent"]) assert.ok(!text.includes(name), `${who}: no name and no word of anybody's work: ${name}`);
      // Nothing is pressable before the page's script has arrived.
      assert.equal([...html.matchAll(/<button[^>]*aria-label="Change [^"]+"[^>]*>/g)].filter((m) => !m[0].includes('disabled=""')).length, 0);
    }
  });

  test("while somebody else is editing the week, the page names them and since when, and stays readable", async () => {
    world.db.seed(`${W3}/editLock/current`, { holderUid: "zach", since: new Date(NOW.getTime() - 60_000), keptAt: new Date(NOW.getTime() - 10_000), runId: RUN.agi, weekId: "w03" });
    const { text } = await draw("claudia", WeekPage, at("w03"));
    assert.match(text, /Zach is editing week 3 Since 11:59am\. You can read it; editing opens when Zach saves or leaves\./);
    assert.match(text, /Week 3, as it reads/);
    // A hold not kept alive has lapsed: nobody is named.
    world.db.seed(`${W3}/editLock/current`, { holderUid: "zach", since: new Date(NOW.getTime() - 600_000), keptAt: new Date(NOW.getTime() - 300_000), runId: RUN.agi, weekId: "w03" });
    assert.doesNotMatch((await draw("claudia", WeekPage, at("w03"))).text, /is editing week 3/);
  });

  test("the week as it reads is drawn read only: no box, no tick, no Send, and nothing it draws can write", async () => {
    seedWork();
    // Chloe's reflection, so there are words of somebody's on the week to keep off the page.
    world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__rp-1`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      exerciseId: "rp-1",
      kind: "reflection",
      responseType: "text",
      text: "Base rates first, always.",
      firstWrittenAt: T_TICKED,
      updatedAt: T_TICKED,
    });
    const { html } = await draw("claudia", WeekPage, at("w03"));
    const cards = [...html.matchAll(/<li id="edit-[^"]+"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    assert.ok(cards.length > 5, "the week's blocks are drawn");
    for (const card of cards) {
      assert.doesNotMatch(card, /<textarea|<input|<form|role="checkbox"|aria-pressed/, "no box and no tick on the week as it reads");
      assert.doesNotMatch(card, /Send my answer|Change my answer|Rate it or leave a note|Saved/, "no Send and no save line");
      assert.doesNotMatch(card, /Base rates first|Sixty percent/, "nobody's words");
    }
    // Every block drawn alone, by the renderers as they are now: the only
    // buttons it may draw are none at all, so nothing on it can write.
    const { default: WeekBlockView } = await loadTs(join("features", "applications", "weeks", "edit", "WeekBlockView.tsx"));
    for (const block of syntheticWeekBlocks().flatMap((b) => (b.type === "part" ? [b, ...b.blocks] : [b]))) {
      const drawn = renderToStaticMarkup(createElement(WeekBlockView, { block, runId: RUN.agi, weekId: "w03", weekNumber: 3 }));
      assert.doesNotMatch(drawn, /<textarea|<input|<button|<form/, `${block.type} ${block.id}: nothing to press or type in`);
    }
    // And the module hands each renderer the switches that keep it read only, and never a writer.
    const source = readFileSync(join(process.cwd(), "src", "features", "applications", "weeks", "edit", "WeekBlockView.tsx"), "utf8");
    for (const off of ["showTicks={false}", "canWrite={false}", "canNote={false}", "canRate={false}", "ownBoxes={false}", "ownBox={false}"]) {
      assert.ok(source.includes(off), off);
    }
    assert.doesNotMatch(source, /fetch\(|boxWrites|progressMutations|putReflection|useMaterialTicks/, "no write of any kind is reachable from the read-only week");
  });

  test("a week not written as blocks draws no blocks, and keeps the paste", async () => {
    const { text } = await draw("claudia", WeekPage, at("w02"));
    assert.doesNotMatch(text, /as it reads/);
    assert.match(text, /Paste the week, then check it/);
  });
});

// ---------------------------------------------------------------------------
// 5. The history page
// ---------------------------------------------------------------------------

describe("5. the week's history, a page of its own", () => {
  test("every save newest first, by first name, what it kept, and the save that is the week now", async () => {
    seedWork();
    const base = model.blockFingerprint(model.locateBlock(syntheticWeekBlocks(), "src-1").block);
    const saved = await call("claudia", blockRoute.PATCH, { runId: RUN.agi, weekId: "w03", blockId: "src-1" }, { body: { base, fields: { title: "A field guide to base rates, revised" } }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    for (const who of ["claudia", "zach"]) {
      const { html, text, to } = await draw(who, HistoryPage, at("w03"));
      assert.equal(to, null, who);
      assert.match(text, /Week 3 History Every save Tick two to compare, or one to compare with now\./);
      const rows = [...html.matchAll(/<li[^>]*data-save-id="([^"]+)"[\s\S]*?<\/li>/g)].map((m) => textOf(m[0]));
      assert.equal(rows.length, 2, rows.join("\n"));
      assert.match(rows[0], /Tue 17 Nov, 12pm Claudia Part 1: new title for Ada Example’s reading Every group \(4\) · 1 tick kept · What the week says now/);
      assert.match(rows[1], /The week before its first change here/);
      assert.match(html, /aria-label="Compare Tue 17 Nov, 12pm: Part 1: new title for Ada Example’s reading"/);
      assert.match(text, /Tell people about it/, "the newest save of a live week has told nobody");
    }
  });

  test("a week never changed here says so", async () => {
    const { text } = await draw("claudia", HistoryPage, at("w03"));
    assert.match(text, /Nothing is in week 3’s history yet\./);
  });

  test("anybody the Weeks tab is not for is turned away before the week is read", async () => {
    for (const who of ["rahul", "chloe", "drew"]) {
      const { to } = await draw(who, HistoryPage, at("w03"));
      assert.equal(to, "/dashboard", who);
    }
    assert.equal((await draw("claudia", HistoryPage, at("w09"))).to, `${PROGRAMME_PATH}/weeks`, "a week not in the plan goes back to the tab");
  });
});

/** The words of a piece of HTML, as the world reads them. */
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
