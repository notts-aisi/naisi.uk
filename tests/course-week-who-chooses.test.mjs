/**
 * Who chooses, in the check on a pasted week: each Choose one and Cases block
 * is given out by the facilitator or picked by each person, decided by the
 * pasted words through the reader's rules. The check names the rule that
 * decided each block, lets the author change it before saving (a table
 * either way, Cases only to given out, a list never), carries the change with
 * the paste to Read it and to Save behind the paste's own gate, and says what
 * a change does to people already on the week, counted.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. the reader's rules, each named truthfully
 *  2. what the check offers: a table both ways, a list nothing, Cases given out alone
 *  3. the change at Read it and at Save, and refused from anybody who may not paste
 *  4. the round trip through Copy as Markdown, and a fresh paste going back to its words
 *  5. a paste that changes nothing about who chooses reads and saves as it always has
 *  6. what a change does to people already on the week, counted, and then done
 *  7. a group's own copy of the week
 *  8. the card draws each row with the answers it offers
 *  9. a facilitator's own pick is never put in front of their co-facilitators by a switch
 * 10. the check's comparison and the week's history name who chooses
 *
 * On AGI Strategy's run in week 3 (`tests/lib/packsAndCasesWorld.mjs`): Group
 * B meets tonight at 6pm with Chloe, Farah and Kofi; Claudia leads the
 * programme; Zach is an admin. Every word in the weeks is made up.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, B, NOW, RUN, W3, makePacksAndCasesWorld, textOf } from "./lib/packsAndCasesWorld.mjs";
import { syntheticGuideMarkdown } from "./lib/weekBlocksFixture.mjs";

const w = await makePacksAndCasesWorld("__whoChooses");
const { world, call, courseRoute, loadTs } = w;
const blocksRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks");
const groupBlocksRoute = await courseRoute("groups", "[groupId]", "weeks", "[weekId]", "blocks");
const historyRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "history");
const saveRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "history", "[saveId]");
const { readPastedWeek } = await loadTs(join("lib", "courses", "weekBlocks", "paste.ts"));
const { readWeekMarkdown } = await loadTs(join("lib", "courses", "weekBlocks", "markdownRead.ts"));
const { weekToMarkdown } = await loadTs(join("lib", "courses", "weekBlocks", "markdownWrite.ts"));
const who = await loadTs(join("lib", "courses", "weekBlocks", "whoChooses.ts"));
const { HISTORY_PAGE, WHO_CHOOSES } = await loadTs(join("lib", "courses", "weekEdit", "pageWords.ts"));
const model = await loadTs(join("lib", "courses", "weekBlocks", "model.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

const W3_PATH = `courseRuns/${RUN.agi}/weeks/w03`;
const AT = { runId: RUN.agi, weekId: "w03" };
const paste = (person, method, body, params = AT) => call(person, blocksRoute[method], params, { course: true, ...(body !== undefined ? { body } : {}) });
const pasteForGroup = (person, method, body, groupId = A) =>
  call(person, groupBlocksRoute[method], { groupId, weekId: "w03" }, { course: true, ...(body !== undefined ? { body } : {}) });

/** The whole store as one string, to prove a request wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

/** Week 3 as stored, copied out through the route. */
async function copyOut(person = "zach") {
  const answer = await paste(person, "GET");
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.markdown;
}

/** Each Choose one and Cases block of a stored week, by id. */
function storedChoices() {
  return new Map(who.choiceBlocks(world.db.read(W3_PATH).blocks).map((block) => [block.id, block]));
}

/** The check's row for a block, found by what it says. */
function rowOf(answer, label, kind = "chooseOne") {
  const row = answer.body.whoChooses.find((each) => each.kind === kind && each.label === label);
  assert.ok(row, `no row ${kind} "${label}" in ${JSON.stringify(answer.body.whoChooses)}`);
  return row;
}

beforeEach(() => w.reset());

/** Week 3's pack table stored as picked by each person, copied out. */
async function storePicked() {
  const blocks = structuredClone(world.db.read(W3_PATH).blocks);
  who.choiceBlocks(blocks).find((block) => block.id === W3.given).givenBy = "fellow";
  world.db.poke(W3_PATH, { blocks });
  return copyOut();
}

/** The draw page's pack options chosen, for a Choose one's packs: what a facilitator opening it is shown. */
async function packsOnTheDraw(person, groupId) {
  const page = await w.drawPage(person, groupId, 3);
  const packs = [W3.elections, W3.markets, W3.technology];
  return [...page.html.matchAll(/<option value="([^"]+)" selected="">/g)].map((match) => match[1]).filter((value) => packs.includes(value));
}

// ---------------------------------------------------------------------------
// Weeks written for the rules, every word made up
// ---------------------------------------------------------------------------

/** A week of one part holding a Choose one table, under `lines` (the part's words, or a Choose one line). */
function tableWeek(lines) {
  return [
    "# Week 3: Picking a pack",
    "",
    "## Before the session",
    "",
    "### Part 1: Your pack (20 minutes)",
    "",
    ...lines,
    "",
    "| Pack | Read | Time |",
    "| --- | --- | --- |",
    "| Elections | [Polls](https://example.com/polls) | 20 minutes |",
    "| Markets | [Prices](https://example.com/prices) | 25 minutes |",
    "",
  ].join("\n");
}

/** A case study under `heading`, its Talk line saying `talk` ("" for none at all). */
function casesWeek(heading, talk) {
  return [
    "# Week 3: A case each",
    "",
    `## ${heading}`,
    "",
    ...(talk ? [talk, ""] : ["Prepare a 3-minute talk on your case.", ""]),
    "| Case | What happened | Start here |",
    "| --- | --- | --- |",
    "| The surprise result, 2016 | Most polls pointed the other way. | [A summary](https://example.com/surprise) |",
    "| The close call, 2019 | A forecast within a point. | [Report](https://example.com/close) |",
    "",
  ].join("\n");
}

/** A week with a list Choose one, a Talk line inside a part, and a pitch taken from a part's title. */
const LIST_AND_TALKS = [
  "# Week 3: Plans",
  "",
  "## Before the session",
  "",
  "### Part 1: Careers (20 minutes)",
  "",
  "1. **Read:** one guide that fits you, 10 to 15 minutes:",
  "   - [Forecasting at work](https://example.com/work), if you like numbers",
  "   - [Forecasting in public](https://example.org/public), if you like writing",
  "",
  "### Part 2: Getting ready (10 minutes)",
  "",
  "**Talk:** a 2-minute brief",
  "",
  "Say what you would change.",
  "",
  "### Part 3: Your 2-minute pitch",
  "",
  "Prepare a pitch for your plan.",
  "",
].join("\n");

const read = (markdown, whoChooses) => readPastedWeek({ markdown, weekNumber: 3, stored: null, dayBeforeTime: null, ...(whoChooses ? { whoChooses } : {}) });

// ---------------------------------------------------------------------------
// 1. The reader's rules, each named truthfully
// ---------------------------------------------------------------------------

describe("1. the reader's rules, each named truthfully", () => {
  test("a Choose one line that says so: its own words, either way", () => {
    for (const [line, givenBy, words] of [
      ["**Choose one** · given out by your facilitator", "facilitator", "given out"],
      ["**Choose one** · picked by each person", "fellow", "picked by"],
    ]) {
      const [row] = read(tableWeek([line])).whoChooses;
      assert.equal(row.start, givenBy, line);
      assert.equal(row.why, `The pasted week says so: its Choose one line says “${words}”.`);
    }
  });

  test("a table whose line says neither: the words before it, as the reader reads them", () => {
    const cases = [
      [["Read one pack: choose one that fits you."], "fellow", "The pasted week doesn’t say, and the words before it say “choose one”, so a Choose one starts as picked by each person."],
      [["Pick one at the end of session 2, or read the one you were given."], "facilitator", "The pasted week doesn’t say, and the words before it say “pick one” but also “given”, so a Choose one starts as given out by your facilitator."],
      [["Read your pack."], "facilitator", "The pasted week doesn’t say, and the words before it don’t say “choose one” or “pick one”, so a Choose one starts as given out by your facilitator."],
      // The rule looks for those words only, and the line says so: a part that asks in other words is told just that.
      [["Choose the pack that fits you."], "facilitator", "The pasted week doesn’t say, and the words before it don’t say “choose one” or “pick one”, so a Choose one starts as given out by your facilitator."],
      [["Read your pack.", "", "**Choose one**"], "facilitator", "Its Choose one line doesn’t say “given out” or “picked by”, and the words before it don’t say “choose one” or “pick one”, so it starts as given out by your facilitator."],
    ];
    for (const [lines, givenBy, why] of cases) {
      const [row] = read(tableWeek(lines)).whoChooses;
      assert.deepEqual([row.start, row.why], [givenBy, why], lines.join(" / "));
      assert.equal(row.givenBy, givenBy, "nobody changed it, so it saves as it reads");
    }
  });

  test("the guide's own part 3 (“the pack you chose or were given”) is named as it reads", () => {
    const rows = read(syntheticGuideMarkdown()).whoChooses;
    assert.deepEqual(
      rows.map((row) => [row.kind, row.label, row.detail, row.start, row.why]),
      [
        ["chooseOne", "Part 3: Your pack", "Choose one · 3 packs", "facilitator", WHO_CHOOSES.partSilent],
        ["cases", "Your case study", "Cases · 3, by pack", "facilitator", "The pasted week doesn’t say. Cases under “Your case study” start as given out."],
      ],
    );
  });

  test("a list is always picked; a case study under its heading starts given out; its Talk line can say otherwise", () => {
    const [list] = read(LIST_AND_TALKS).whoChooses;
    assert.deepEqual([list.kind, list.detail, list.start, list.why], ["chooseOne", "Choose one · 2 options", "fellow", "A list is always picked by each person."]);
    const [heading] = read(casesWeek("Your case study", "")).whoChooses;
    assert.deepEqual([heading.start, heading.why], ["facilitator", "The pasted week doesn’t say. Cases under “Your case study” start as given out."]);
    const [named] = read(casesWeek("Case studies", "**Talk:** a 3-minute talk")).whoChooses;
    assert.equal(named.why, "The pasted week doesn’t say. Cases under “Case studies” start as given out.", "the heading named is the week's own");
    const [said] = read(casesWeek("Your case study", "**Talk:** a 3-minute talk · picked by each person")).whoChooses;
    assert.deepEqual([said.start, said.why], ["fellow", "The pasted week says so: its Talk line says “picked by”."]);
  });

  test("a talk inside a part and a talk from a part's title carry their rules, and have no row: nothing in them is given out or picked", () => {
    const parsed = readWeekMarkdown(LIST_AND_TALKS);
    assert.deepEqual(parsed.choices, [
      { rule: "list" },
      { rule: "inPart" },
      { rule: "partTitle", followsChooseOne: false },
    ]);
    assert.equal(who.whyWords({ rule: "inPart" }), "The pasted week doesn’t say, and a talk inside a part starts as picked by each person.");
    assert.equal(who.whyWords({ rule: "partTitle", followsChooseOne: true }), "The pasted week doesn’t say, so a talk taken from a part’s title follows that part’s Choose one.");
    assert.deepEqual(read(LIST_AND_TALKS).whoChooses.map((row) => row.kind), ["chooseOne"], "only the list has a row");
  });

  test("every Choose one and Cases block the reader makes has its rule recorded, in the week's own fixtures", () => {
    for (const markdown of [syntheticGuideMarkdown(), LIST_AND_TALKS, tableWeek(["Read your pack."]), casesWeek("Your case study", "")]) {
      const parsed = readWeekMarkdown(markdown);
      assert.equal(parsed.choices.length, who.choiceBlocks(parsed.blocks).length);
      assert.ok(parsed.choices.every((rule) => rule !== null), JSON.stringify(parsed.choices));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What the check offers
// ---------------------------------------------------------------------------

describe("2. what the check offers", () => {
  test("a table either way, a list nothing, Cases only given out, with the line that says why", () => {
    const table = read(tableWeek(["Read your pack."])).whoChooses[0];
    assert.equal(table.can, "both");
    assert.equal(table.only, null);
    const list = read(LIST_AND_TALKS).whoChooses[0];
    assert.equal(list.can, "none", "a list is never offered a switch");
    const cases = read(casesWeek("Your case study", "")).whoChooses[0];
    assert.equal(cases.can, "given", "Cases are never offered picked");
    assert.equal(cases.only, "Cases can only be given out: no page lets a member pick a case.");
    const picked = read(casesWeek("Your case study", "**Talk:** a 3-minute talk · picked by each person")).whoChooses[0];
    assert.equal(picked.can, "given");
    assert.equal(picked.only, "As pasted, no more cases can be given out: no page lets a member pick one. Choose “Given out by your facilitator”.");
  });

  test("a change the check does not offer is a problem, in its own sentence, and changes nothing", () => {
    const listWeek = read(LIST_AND_TALKS, [{ place: 0, kind: "chooseOne", givenBy: "facilitator" }]);
    assert.ok(listWeek.problems.includes("A list is always picked by each person."), listWeek.problems.join("\n"));
    assert.equal(who.choiceBlocks(listWeek.blocks)[0].givenBy, "fellow");
    const casesPicked = read(casesWeek("Your case study", ""), [{ place: 0, kind: "cases", givenBy: "fellow" }]);
    assert.ok(casesPicked.problems.includes("Cases can only be given out: no page lets a member pick a case."));
    assert.equal(who.choiceBlocks(casesPicked.blocks)[0].givenBy, "facilitator");
    const elsewhere = "Who chooses was changed on a block where this paste can’t change it. Read it again, then save.";
    for (const override of [
      { place: 1, kind: "cases", givenBy: "facilitator" }, // the Talk line inside a part: no cases
      { place: 0, kind: "cases", givenBy: "fellow" }, // the list's place, the wrong kind
      { place: 9, kind: "chooseOne", givenBy: "fellow" }, // no such place
    ]) {
      assert.ok(read(LIST_AND_TALKS, [override]).problems.includes(elsewhere), JSON.stringify(override));
    }
  });

  test("Cases read as picked can be given out", () => {
    const given = read(casesWeek("Your case study", "**Talk:** a 3-minute talk · picked by each person"), [{ place: 0, kind: "cases", givenBy: "facilitator" }]);
    assert.deepEqual(given.problems, []);
    const [row] = given.whoChooses;
    assert.deepEqual([row.start, row.givenBy, row.only], ["fellow", "facilitator", WHO_CHOOSES.casesOnlyGiven]);
    assert.equal(who.choiceBlocks(given.blocks)[0].givenBy, "facilitator");
  });
});

// ---------------------------------------------------------------------------
// 3. The change at Read it and at Save, behind the paste's gate
// ---------------------------------------------------------------------------

describe("3. the change travels with the paste", () => {
  test("Read it applies it and says so; Save writes it; nothing else of the week moves", async () => {
    const markdown = await copyOut();
    const before = world.db.read(W3_PATH).blocks;
    const first = await paste("claudia", "POST", { markdown });
    const row = rowOf(first, "Part 3: Your pack");
    assert.deepEqual([row.start, row.givenBy, row.changed], ["facilitator", "facilitator", null]);
    const change = { place: row.place, kind: "chooseOne", givenBy: "fellow" };
    const unchanged = everything();
    const changed = await paste("claudia", "POST", { markdown, whoChooses: [change] });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const now = rowOf(changed, "Part 3: Your pack");
    assert.deepEqual([now.start, now.givenBy, now.changed], ["facilitator", "fellow", "Changed from the pasted week. Once saved, Copy as Markdown writes it into the week’s words."]);
    assert.equal(everything(), unchanged, "Read it writes nothing");
    const saved = await paste("claudia", "PUT", { markdown, whoChooses: [change] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = world.db.read(W3_PATH).blocks;
    assert.equal(storedChoices().get(W3.given).givenBy, "fellow");
    // Everything but the one field is as it was.
    const put = (blocks) => JSON.stringify(blocks).replace(/"givenBy":"(?:fellow|facilitator)"/g, "");
    assert.equal(put(after), put(before));
  });

  const REFUSED = [
    ["tess", 403, "the lead of another programme"],
    ["yusuf", 403, "the run's track lead"],
    ["rahul", 403, "a facilitator of one of the run's groups"],
    ["chloe", 403, "a member placed on the run"],
    [null, 401, "somebody signed out"],
  ];
  for (const [person, status, what] of REFUSED) {
    test(`${what}: a change to who chooses is refused with the paste, before anything is read, and nothing is written`, async () => {
      const markdown = await copyOut();
      const before = everything();
      for (const method of ["POST", "PUT"]) {
        const answer = await paste(person, method, { markdown, whoChooses: [{ place: 0, kind: "chooseOne", givenBy: "fellow" }] });
        assert.equal(answer.status, status, `${method}: ${JSON.stringify(answer.body)}`);
        assert.deepEqual(Object.keys(answer.body), ["error"], "nothing about the week is said");
      }
      assert.equal(everything(), before);
    });
  }

  test("a change the check would not offer is refused at Save in its own sentence, and nothing is written", async () => {
    const markdown = await copyOut();
    const listRow = rowOf(await paste("zach", "POST", { markdown }), "Part 5: Plan and pitch");
    assert.equal(listRow.can, "none");
    const caseRow = rowOf(await paste("zach", "POST", { markdown }), "Your case study", "cases");
    const before = everything();
    for (const [change, error] of [
      [{ place: listRow.place, kind: "chooseOne", givenBy: "facilitator" }, "A list is always picked by each person."],
      [{ place: caseRow.place, kind: "cases", givenBy: "fellow" }, "Cases can only be given out: no page lets a member pick a case."],
    ]) {
      const answer = await paste("zach", "PUT", { markdown, whoChooses: [change] });
      assert.deepEqual([answer.status, answer.body.error], [400, error]);
    }
    assert.equal(everything(), before);
  });

  test("a change in a shape the site can't read is a sentence, before any document is read", async () => {
    const shape = "Who chooses each block was sent in a form the site can’t read. Read it again, then save.";
    for (const whoChooses of [
      "fellow",
      [{ place: -1, kind: "chooseOne", givenBy: "fellow" }],
      [{ place: 0, kind: "pack", givenBy: "fellow" }],
      [{ place: 0, kind: "chooseOne", givenBy: "everybody" }],
      [{ place: 0, kind: "chooseOne", givenBy: "fellow" }, { place: 0, kind: "chooseOne", givenBy: "facilitator" }],
      Array.from({ length: 61 }, (_, place) => ({ place, kind: "chooseOne", givenBy: "fellow" })),
    ]) {
      const answer = await paste("zach", "POST", { markdown: "# Week 3: A", whoChooses });
      assert.deepEqual([answer.status, answer.body.error], [400, shape], JSON.stringify(whoChooses).slice(0, 80));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The round trip through Copy as Markdown
// ---------------------------------------------------------------------------

describe("4. the round trip", () => {
  for (const givenBy of ["fellow", "facilitator"]) {
    test(`a table changed to ${givenBy === "fellow" ? "picked" : "given out"} copies out with the words that read it back the same`, async () => {
      // Start from the other side, so the change is a change.
      const other = givenBy === "fellow" ? "facilitator" : "fellow";
      const blocks = structuredClone(world.db.read(W3_PATH).blocks);
      who.choiceBlocks(blocks).find((block) => block.id === W3.given).givenBy = other;
      world.db.poke(W3_PATH, { blocks });
      const markdown = await copyOut();
      const row = rowOf(await paste("zach", "POST", { markdown }), "Part 3: Your pack");
      assert.equal(row.start, other);
      const saved = await paste("zach", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy }] });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const copied = await copyOut();
      const words = givenBy === "fellow" ? "picked by each person" : "given out by your facilitator";
      assert.ok(copied.includes(`**Choose one** · ${words} {#${W3.given}}`), copied.split("\n").find((line) => line.includes(W3.given)));
      const again = await paste("zach", "POST", { markdown: copied });
      const back = rowOf(again, "Part 3: Your pack");
      assert.deepEqual([back.start, back.givenBy, back.changed], [givenBy, givenBy, null], "read back as changed, with nothing sent beside it");
      assert.equal(back.why, `The pasted week says so: its Choose one line says “${givenBy === "fellow" ? "picked by" : "given out"}”.`);
      const resaved = await paste("zach", "PUT", { markdown: copied });
      assert.equal(resaved.status, 200);
      assert.equal(storedChoices().get(W3.given).givenBy, givenBy);
    });
  }

  test("Cases given out copy out given out", async () => {
    const blocks = structuredClone(world.db.read(W3_PATH).blocks);
    who.choiceBlocks(blocks).find((block) => block.id === W3.caseStudy).givenBy = "fellow";
    world.db.poke(W3_PATH, { blocks });
    const markdown = await copyOut();
    const row = rowOf(await paste("zach", "POST", { markdown }), "Your case study", "cases");
    assert.deepEqual([row.start, row.can], ["fellow", "given"]);
    assert.equal((await paste("zach", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "cases", givenBy: "facilitator" }] })).status, 200);
    const copied = await copyOut();
    assert.ok(copied.includes("**Talk:** a 3-minute talk · given out by your facilitator"), copied);
    const back = rowOf(await paste("zach", "POST", { markdown: copied }), "Your case study", "cases");
    assert.deepEqual([back.start, back.givenBy, back.changed], ["facilitator", "facilitator", null]);
  });

  test("a fresh paste of the guide's own words goes back to what they say, and the check shows it", async () => {
    const pasted = await paste("zach", "PUT", { markdown: syntheticGuideMarkdown() });
    assert.equal(pasted.status, 200, JSON.stringify(pasted.body));
    const markdown = await copyOut();
    const row = rowOf(await paste("zach", "POST", { markdown }), "Part 3: Your pack");
    assert.equal((await paste("zach", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }] })).status, 200);
    const fresh = await paste("zach", "POST", { markdown: syntheticGuideMarkdown() });
    const back = rowOf(fresh, "Part 3: Your pack");
    assert.deepEqual([back.start, back.givenBy, back.changed], ["facilitator", "facilitator", null]);
    assert.equal(back.why, WHO_CHOOSES.partSilent);
  });
});

// ---------------------------------------------------------------------------
// 5. A paste that changes nothing about who chooses
// ---------------------------------------------------------------------------

describe("5. a paste that changes nothing about who chooses reads and saves as it always has", () => {
  test("no change, an empty list and a change to what it already reads save the same bytes, and Read it answers the same", async () => {
    const markdown = await copyOut();
    const rows = (await paste("zach", "POST", { markdown })).body.whoChooses;
    const same = rows.filter((row) => row.can !== "none").map((row) => ({ place: row.place, kind: row.kind, givenBy: row.start }));
    assert.ok(same.length >= 2, "the table and the case study");
    const reads = [];
    const saved = [];
    for (const body of [{ markdown }, { markdown, whoChooses: [] }, { markdown, whoChooses: same }]) {
      reads.push(JSON.stringify((await paste("zach", "POST", body)).body));
      w.reset();
      assert.equal((await paste("zach", "PUT", body)).status, 200);
      saved.push(JSON.stringify(world.db.read(W3_PATH).blocks));
      w.reset();
    }
    assert.equal(new Set(reads).size, 1, "Read it");
    assert.equal(new Set(saved).size, 1, "Save");
    assert.equal(saved[0], JSON.stringify(world.db.read(W3_PATH).blocks), "and the week copied out and pasted back is the week");
  });

  test("the reader hands back the very blocks it read when nothing is changed", () => {
    const parsed = readWeekMarkdown(syntheticGuideMarkdown());
    assert.equal(who.applyWhoChooses(parsed.blocks, []).blocks, parsed.blocks);
    const plain = read(syntheticGuideMarkdown());
    const withNone = read(syntheticGuideMarkdown(), []);
    assert.deepEqual(model.weekItems(plain.blocks).length, model.weekItems(withNone.blocks).length);
    assert.deepEqual(plain.found, withNone.found);
    assert.deepEqual(plain.checks, withNone.checks);
    assert.deepEqual(plain.problems, withNone.problems);
  });

  test("the guide's week copies out with the same Choose one and Talk lines as before", () => {
    const blocks = readPastedWeek({ markdown: syntheticGuideMarkdown(), weekNumber: 3, stored: null, dayBeforeTime: null }).blocks;
    const markdown = weekToMarkdown({ weekNumber: 3, title: "How sure are you?", blocks }, { dayBeforeTime: null });
    assert.match(markdown, /\*\*Choose one\*\* · given out by your facilitator/);
    assert.match(markdown, /\*\*Talk:\*\* a 3-minute talk · given out by your facilitator/);
  });
});

// ---------------------------------------------------------------------------
// 6. What a change does to people already on the week
// ---------------------------------------------------------------------------

describe("6. what a change does to people already on the week", () => {
  /** Week 3's pack table stored as picked by each person, and the check's row for it. */
  async function pickedTable() {
    const blocks = structuredClone(world.db.read(W3_PATH).blocks);
    who.choiceBlocks(blocks).find((block) => block.id === W3.given).givenBy = "fellow";
    world.db.poke(W3_PATH, { blocks });
    const markdown = await copyOut();
    return { markdown, row: rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack") };
  }

  test("picked to given: the check counts who has picked; after Save each keeps their pick and can no longer change it", async () => {
    const { markdown, row } = await pickedTable();
    assert.equal(row.people, null, "nothing changes, so nothing is said");
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.markets)).status, 200);
    // Neither counts: a pack no longer in the block, and another block's record.
    world.db.seed(`coursePacksAndCases/${RUN.agi}__farah__${W3.given}`, { runId: RUN.agi, uid: "farah", weekId: "w03", weekNumber: 3, blockId: W3.given, kind: "pack", packId: "pk-gone" });
    world.db.seed(`coursePacksAndCases/${RUN.agi}__farah__${W3.picked}`, { runId: RUN.agi, uid: "farah", weekId: "w03", weekNumber: 3, blockId: W3.picked, kind: "pack", packId: W3.atWork });
    const change = [{ place: row.place, kind: "chooseOne", givenBy: "facilitator" }];
    const checked = rowOf(await paste("claudia", "POST", { markdown, whoChooses: change }), "Part 3: Your pack");
    assert.equal(
      checked.people,
      "2 people have picked one. They keep their picks and can no longer change them. Facilitators give one to everybody else. This counts everybody on the programme, so it can be a little high.",
    );
    const records = JSON.stringify(w.records().map((path) => world.db.read(path)));
    assert.equal((await paste("claudia", "PUT", { markdown, whoChooses: change })).status, 200);
    assert.equal(JSON.stringify(w.records().map((path) => world.db.read(path))), records, "the save writes no record: every pick is kept");
    const refused = await w.pick("chloe", W3.given, "w03", W3.markets);
    assert.deepEqual([refused.status, refused.body.error], [403, "Your facilitators give these out. To switch, ask one of them."]);
    assert.equal(w.recordOf("chloe", W3.given).packId, W3.elections, "Chloe keeps hers");
    // The draw now gives it out, starting from the picks.
    const drawn = await w.saveDraw("rahul", "w03", [["farah", W3.given, W3.technology]]);
    assert.equal(drawn.status, 200, JSON.stringify(drawn.body));
  });

  test("given to picked: the check counts who was given one; after Save each holds it as their own pick, changeable until their session starts", async () => {
    const markdown = await copyOut();
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    w.seedDraw("kofi", "w3", { pack: W3.markets });
    const change = [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }];
    const checked = rowOf(await paste("claudia", "POST", { markdown, whoChooses: change }), "Part 3: Your pack");
    assert.equal(
      checked.people,
      "2 people were given one. It becomes their own pick, which they can change until their session for the week starts. Facilitators can no longer give one out. This counts everybody on the programme, so it can be a little high.",
    );
    assert.equal((await paste("claudia", "PUT", { markdown, whoChooses: change })).status, 200);
    assert.equal(w.recordOf("chloe", W3.given).packId, W3.elections, "what was given is kept");
    // Before tonight's 6pm session Chloe can change it; after it starts she can't.
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.markets)).status, 200);
    assert.equal(w.recordOf("chloe", W3.given).packId, W3.markets);
    w.at("2026-11-17T18:00:00Z");
    const late = await w.pick("kofi", W3.given, "w03", W3.elections);
    assert.deepEqual([late.status, late.body.error], [409, "Your session has started, so your choice stays as it is."]);
    assert.equal(w.recordOf("kofi", W3.given).packId, W3.markets);
    // The draw no longer gives it out.
    const drawn = await w.saveDraw("rahul", "w03", [["farah", W3.given, W3.technology]]);
    assert.deepEqual([drawn.status, drawn.body.error], [400, "That isn’t given out in week 3. Reload the page."]);
  });

  test("nobody yet: the check says so either way", async () => {
    const markdown = await copyOut();
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    const toPicked = rowOf(await paste("claudia", "POST", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }] }), "Part 3: Your pack");
    assert.equal(toPicked.people, "Nobody has been given one yet. Each person picks their own before their session for the week starts, and facilitators can no longer give one out.");
    const { markdown: picked, row: pickedRow } = await pickedTable();
    const toGiven = rowOf(await paste("claudia", "POST", { markdown: picked, whoChooses: [{ place: pickedRow.place, kind: "chooseOne", givenBy: "facilitator" }] }), "Part 3: Your pack");
    assert.equal(toGiven.people, "Nobody has picked one yet. Facilitators give one to everybody.");
  });

  test("a week pasted with fresh ids reaches nobody's records, so there is nothing to count", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const fresh = await paste("claudia", "POST", { markdown: syntheticGuideMarkdown() });
    const row = rowOf(fresh, "Part 3: Your pack");
    const changed = rowOf(await paste("claudia", "POST", { markdown: syntheticGuideMarkdown(), whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }] }), "Part 3: Your pack");
    assert.equal(changed.people, null);
  });

  test("one person is counted in the singular", () => {
    assert.equal(WHO_CHOOSES.nowGiven(1), "1 person has picked one. They keep their pick and can no longer change it. Facilitators give one to everybody else.");
    assert.equal(WHO_CHOOSES.nowPicked(1), "1 person was given one. It becomes their own pick, which they can change until their session for the week starts. Facilitators can no longer give one out.");
  });
});

// ---------------------------------------------------------------------------
// 7. A group's own copy of the week
// ---------------------------------------------------------------------------

describe("7. a group's own copy of the week", () => {
  test("the lead's change travels the same way, and counts the group's own people alone", async () => {
    const markdown = (await pasteForGroup("claudia", "GET")).body.markdown;
    assert.ok(markdown, "the group reads the run's week until it has a copy");
    const row = rowOf(await pasteForGroup("claudia", "POST", { markdown }), "Part 3: Your pack");
    w.seedDraw("chloe", "w3", { pack: W3.elections }); // Group B
    w.seedDraw("amara", "w3", { pack: W3.markets }); // Group A
    const change = [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }];
    const checked = rowOf(await pasteForGroup("claudia", "POST", { markdown, whoChooses: change }), "Part 3: Your pack");
    assert.match(checked.people, /^1 person was given one\./);
    const saved = await pasteForGroup("claudia", "PUT", { markdown, whoChooses: change });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const copy = world.db.read(`courseGroups/${A}/weeks/w03`);
    assert.equal(who.choiceBlocks(copy.blocks).find((block) => block.id === W3.given).givenBy, "fellow");
    assert.equal(storedChoices().get(W3.given).givenBy, "facilitator", "the run's week is never written");
  });

  test("the group's facilitator is refused a change as they are refused Read it", async () => {
    const markdown = (await pasteForGroup("sofia", "GET")).body.markdown;
    const before = everything();
    const answer = await pasteForGroup("sofia", "POST", { markdown, whoChooses: [{ place: 0, kind: "chooseOne", givenBy: "fellow" }] });
    assert.equal(answer.status, 403);
    assert.deepEqual(Object.keys(answer.body), ["error"]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 9. A facilitator's own pick stays theirs
// ---------------------------------------------------------------------------

describe("9. a facilitator's own pick is never put in front of their co-facilitators by a switch", () => {
  const ONE =
    "This can’t be changed to given out yet. 1 person who facilitates their own group has picked one, and their pick is theirs alone: the group’s other facilitators would see it.";

  test("the switch is refused before Save, in place of the count, and at Save, with nothing written; the block saves as picked", async () => {
    const markdown = await storePicked();
    // Farah facilitates Group B and takes part in it; Chloe only takes part.
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    const change = [{ place: row.place, kind: "chooseOne", givenBy: "facilitator" }];
    const checked = await paste("claudia", "POST", { markdown, whoChooses: change });
    assert.equal(rowOf(checked, "Part 3: Your pack").people, ONE, "the check says so before Save, in place of the count");
    assert.ok(checked.body.problems.includes(ONE), "and Save is off");
    assert.doesNotMatch(JSON.stringify(checked.body), /farah|Farah/, "it names nobody");
    const before = everything();
    for (const person of ["claudia", "zach"]) {
      const refused = await paste(person, "PUT", { markdown, whoChooses: change });
      assert.deepEqual([refused.status, refused.body.error], [400, ONE], person);
    }
    assert.equal(everything(), before, "nothing is written");
    // Left as picked, the rest of the paste saves.
    assert.equal((await paste("claudia", "PUT", { markdown })).status, 200);
    assert.equal(storedChoices().get(W3.given).givenBy, "fellow");
    for (const person of ["rahul", "sofia"]) assert.deepEqual(await packsOnTheDraw(person, B), [], `${person}'s draw shows no pick`);
  });

  test("the same refusal when the pasted words make the change, and the switch back to picked lets it save", async () => {
    const copied = await storePicked();
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    const markdown = copied.replace(`**Choose one** · picked by each person {#${W3.given}}`, `**Choose one** · given out by your facilitator {#${W3.given}}`);
    assert.notEqual(markdown, copied);
    const checked = await paste("claudia", "POST", { markdown });
    const row = rowOf(checked, "Part 3: Your pack");
    assert.deepEqual([row.start, row.givenBy, row.people], ["facilitator", "facilitator", ONE]);
    const before = everything();
    const refused = await paste("claudia", "PUT", { markdown });
    assert.deepEqual([refused.status, refused.body.error], [400, ONE]);
    assert.equal(everything(), before);
    const back = await paste("claudia", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }] });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(storedChoices().get(W3.given).givenBy, "fellow");
  });

  test("a facilitator who holds no place in the group is counted too: their pick is their own work as well", async () => {
    const markdown = await storePicked();
    assert.equal((await w.pick("rahul", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.pick("sofia", W3.given, "w03", W3.elections)).status, 200);
    const row = rowOf(await paste("zach", "POST", { markdown }), "Part 3: Your pack");
    const refused = await paste("zach", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "facilitator" }] });
    assert.deepEqual(
      [refused.status, refused.body.error],
      [400, "This can’t be changed to given out yet. 2 people who facilitate their own group have picked one, and their picks are theirs alone: the group’s other facilitators would see them."],
    );
  });

  test("allowed as before when only people who do not facilitate have picked, and no co-facilitator's draw then carries a facilitator's own pick", async () => {
    const markdown = await storePicked();
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.markets)).status, 200);
    // A facilitator's pick on another block is not this block's.
    assert.equal((await w.pick("farah", W3.picked, "w03", W3.atWork)).status, 200);
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    const saved = await paste("claudia", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "facilitator" }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    for (const person of ["rahul", "sofia", "farah"]) {
      assert.deepEqual((await packsOnTheDraw(person, B)).sort(), [W3.elections, W3.markets].sort(), `${person}'s draw: Chloe's and Kofi's picks, nobody else's`);
    }
    // And once given out, a facilitator can no longer pick one of their own.
    const late = await w.pick("farah", W3.given, "w03", W3.technology);
    assert.equal(late.status, 403);
  });

  test("a group's own copy counts that group's facilitators and people alone", async () => {
    await storePicked();
    // Farah facilitates Group B, not Group A.
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    const groupMarkdown = (await pasteForGroup("claudia", "GET", undefined, A)).body.markdown;
    const rowA = rowOf(await pasteForGroup("claudia", "POST", { markdown: groupMarkdown }, A), "Part 3: Your pack");
    const change = [{ place: rowA.place, kind: "chooseOne", givenBy: "facilitator" }];
    const forA = rowOf(await pasteForGroup("claudia", "POST", { markdown: groupMarkdown, whoChooses: change }, A), "Part 3: Your pack");
    assert.equal(forA.people, "Nobody has picked one yet. Facilitators give one to everybody.", "nobody of Group A has picked");
    const forB = await pasteForGroup("claudia", "POST", { markdown: groupMarkdown, whoChooses: change }, B);
    assert.equal(rowOf(forB, "Part 3: Your pack").people, ONE);
    const before = everything();
    const refusedB = await pasteForGroup("claudia", "PUT", { markdown: groupMarkdown, whoChooses: change }, B);
    assert.deepEqual([refusedB.status, refusedB.body.error], [400, ONE]);
    assert.equal(everything(), before, "Group B's copy is not made");
    const savedA = await pasteForGroup("claudia", "PUT", { markdown: groupMarkdown, whoChooses: change }, A);
    assert.equal(savedA.status, 200, JSON.stringify(savedA.body));
    assert.deepEqual(await packsOnTheDraw("rahul", B), [], "Group B still reads the run's week, picked: Farah's pick is on no draw");
    // The run's week, read for every group, is refused for Farah's pick.
    const runRow = rowOf(await paste("claudia", "POST", { markdown: await copyOut() }), "Part 3: Your pack");
    const forRun = await paste("claudia", "PUT", { markdown: await copyOut(), whoChooses: [{ place: runRow.place, kind: "chooseOne", givenBy: "facilitator" }] });
    assert.deepEqual([forRun.status, forRun.body.error], [400, ONE]);
  });

  test("given to picked is never refused: a pick is less widely seen than what was given", async () => {
    const markdown = await copyOut();
    w.seedDraw("farah", "w3", { pack: W3.markets });
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    const saved = await paste("claudia", "PUT", { markdown, whoChooses: [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  });
});

// ---------------------------------------------------------------------------
// 10. The comparison and the history name who chooses
// ---------------------------------------------------------------------------

describe("10. the check's comparison and the week's history name who chooses", () => {
  test("a paste that changes only who chooses says so, in the check and in the history", async () => {
    const markdown = await copyOut();
    const row = rowOf(await paste("claudia", "POST", { markdown }), "Part 3: Your pack");
    const change = [{ place: row.place, kind: "chooseOne", givenBy: "fellow" }];
    const checked = await paste("claudia", "POST", { markdown, whoChooses: change });
    assert.deepEqual(
      checked.body.comparison.rows.map((each) => [each.state, each.blockId, each.fields]),
      [["changed", W3.given, "who chooses"]],
    );
    assert.equal(HISTORY_PAGE.fields("who chooses"), "Who chooses changed.");
    assert.equal(HISTORY_PAGE.fields("link and title"), "Its link and title changed.", "the other blocks' words are as they were");
    assert.equal((await paste("claudia", "PUT", { markdown, whoChooses: change })).status, 200);
    const history = await call("claudia", historyRoute.GET, AT, { course: true });
    assert.equal(history.status, 200, JSON.stringify(history.body));
    const first = history.body.saves[history.body.saves.length - 1];
    const compared = await call("claudia", saveRoute.GET, { ...AT, saveId: first.id }, { course: true });
    assert.equal(compared.status, 200, JSON.stringify(compared.body));
    assert.deepEqual(
      compared.body.comparison.rows.map((each) => [each.state, each.fields]),
      [["changed", "who chooses"]],
      "the week as it was, against now",
    );
  });

  test("a Cases block names it too, and a Choose one whose packs change names nothing new", async () => {
    const { compareWeeks } = await loadTs(join("lib", "courses", "weekEdit", "compare.ts"));
    const blocks = world.db.read(W3_PATH).blocks;
    const flipped = structuredClone(blocks);
    who.choiceBlocks(flipped).find((block) => block.id === W3.caseStudy).givenBy = "fellow";
    const rows = compareWeeks({ title: "A", blocks }, { title: "A", blocks: flipped }).rows;
    assert.deepEqual(rows.map((each) => [each.state, each.fields]), [["changed", "who chooses"]]);
    const renamed = structuredClone(blocks);
    who.choiceBlocks(renamed).find((block) => block.id === W3.given).packs[0].name = "Polls";
    assert.deepEqual(compareWeeks({ title: "A", blocks }, { title: "A", blocks: renamed }).rows.map((each) => each.fields), [""]);
  });
});

// ---------------------------------------------------------------------------
// 8. The card draws each row with the answers it offers
// ---------------------------------------------------------------------------

describe("8. the card's rows", () => {
  test("a table two radios, Cases read as picked one, a list and Cases given out none", async () => {
    const { WhoChoosesBlock } = await loadTs(join("features", "courses", "WeekBlocksLoader.tsx"));
    const draw = (row) => renderToStaticMarkup(createElement(WhoChoosesBlock, { row, chosen: row.givenBy, name: "who-0", disabled: false, onChoose() {} }));
    const radios = (html) => [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => match[0]);
    const base = { place: 0, label: "Part 3: Your pathway", detail: "Choose one · 4 packs", why: "Why.", only: null, changed: null, people: null };

    const table = draw({ ...base, kind: "chooseOne", start: "fellow", givenBy: "fellow", can: "both" });
    assert.equal(radios(table).length, 2);
    assert.match(textOf(table), /Part 3: Your pathway Choose one · 4 packs Given out by your facilitator Picked by each person Why\./);
    assert.match(radios(table)[1], /checked/);
    assert.doesNotMatch(radios(table)[0], /checked/);

    const list = draw({ ...base, kind: "chooseOne", detail: "Choose one · 2 options", start: "fellow", givenBy: "fellow", can: "none", why: "A list is always picked by each person." });
    assert.equal(radios(list).length, 0, "a list is never offered a switch");
    assert.match(textOf(list), /Picked by each person A list is always picked by each person\./);

    const given = draw({ ...base, kind: "cases", label: "Your case study", detail: "Cases · 22, by pathway", start: "facilitator", givenBy: "facilitator", can: "given", only: WHO_CHOOSES.casesOnlyGiven });
    assert.equal(radios(given).length, 0);
    assert.doesNotMatch(given, /Picked by each person/, "Cases are never offered picked");

    const picked = draw({ ...base, kind: "cases", label: "Your case study", start: "fellow", givenBy: "fellow", can: "given", only: WHO_CHOOSES.casesPicked });
    assert.equal(radios(picked).length, 1);
    assert.match(textOf(picked), /Given out by your facilitator/);
    assert.doesNotMatch(picked, /Picked by each person/);
  });

  test("a change of radio keeps the radios on and announces the count", async () => {
    const { WhoChoosesBlock } = await loadTs(join("features", "courses", "WeekBlocksLoader.tsx"));
    const row = { place: 0, kind: "chooseOne", label: "Part 3: Your pack", detail: "Choose one · 3 packs", start: "facilitator", givenBy: "facilitator", can: "both", why: "Why.", only: null, changed: null, people: null };
    const quiet = renderToStaticMarkup(createElement(WhoChoosesBlock, { row, chosen: "fellow", name: "who-0", disabled: false, onChoose() {} }));
    assert.match(quiet, /<p[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/p>/, "the live region is there before the count arrives");
    assert.doesNotMatch(quiet, /disabled/);
    assert.match([...quiet.matchAll(/<input[^>]*type="radio"[^>]*>/g)][1][0], /checked/, "the radio the author chose shows chosen while the check reads again");
    const counted = renderToStaticMarkup(createElement(WhoChoosesBlock, { row: { ...row, people: "Count." }, chosen: "fellow", name: "who-0", disabled: false, onChoose() {} }));
    assert.match(counted, /role="status"[^>]*>Count\.<\/p>/);
    // The read again for a radio turns nothing off, and an answer overtaken by a newer read is dropped.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/features/courses/WeekBlocksLoader.tsx", import.meta.url), "utf8");
    assert.match(source, /if \(again\) setRereading\(true\);\s*else setBusy\(true\);/);
    assert.match(source, /if \(mine !== latest\.current\) return;/);
    assert.match(source, /void readIt\(givenBy === row\.start \? others : \[\.\.\.others, \{ place: row\.place, kind: row\.kind, givenBy \}\], true\);/);
  });

  test("the lede says how many can be changed", () => {
    assert.equal(WHO_CHOOSES.lede(0), "Each block that offers a choice, and who makes it.");
    assert.equal(WHO_CHOOSES.lede(2), "Each block that offers a choice, and who makes it. Change either before you save.");
  });
});
