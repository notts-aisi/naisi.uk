/**
 * A FACILITATOR DOCUMENT'S MARKDOWN, READ AND WRITTEN, and the places in a
 * course's facilitator guide (`src/lib/courses/facilitatorGuide/`): the
 * contract is `docs/course-facilitator-guide.md`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. EVERY WORD IS KEPT. Each made-up document in the export's shape reads
 *     with no problem, and what it says, drawn by Markdown's own renderer, is
 *     word for word what its copy says.
 *  2. THE BYLINE, AND ONLY THE BYLINE, IS LEFT OUT, and the loader says so.
 *  3. THE ROUND TRIP. Copied out and pasted back, a document is the same
 *     document, for one holding every kind of block and every awkward line.
 *  4. NOTHING IS CUT SHORT IN SILENCE. Each cap is broken once and named; a
 *     document with no problem reads back from the store exactly as saved.
 *  5. A DOCUMENT IN THE WRONG PLACE is refused or flagged, by its own title.
 *  6. THE PLACES AND PAGES are spelt one way, and a stored row that cannot
 *     say which course and place it is, is nobody's.
 *
 * Every document here is made up (`tests/lib/facilitatorGuideFixture.mjs`).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import {
  CASE_STUDIES,
  FELLOW_WEEK_3,
  HANDBOOK,
  HOW_TO_USE,
  NOTES_W3,
  PLAN_W1,
  PLAN_W3,
  PRINTABLES,
  SESSIONS,
  WEEK_NOTES,
} from "./lib/facilitatorGuideFixture.mjs";
import { loadGuideModules } from "./lib/facilitatorGuideWorld.mjs";

const { model, markdown, recognise, record } = await loadGuideModules();
const { readGuideMarkdown, guideToMarkdown, isByline } = markdown;

const slot = (key) => model.parseSlotKey(key);
const DOCUMENTS = [
  ["how-to-use", HOW_TO_USE],
  ["handbook", HANDBOOK],
  ["case-studies", CASE_STUDIES],
  ["printables", PRINTABLES],
  ["w01-plan", PLAN_W1],
  ["w03-plan", PLAN_W3],
  ["w03-notes", NOTES_W3],
  ["sessions", SESSIONS],
  ["week-notes", WEEK_NOTES],
];

/** What Markdown's own renderer says a text holds, as words. */
const words = (text) =>
  marked
    .parse(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

// ---------------------------------------------------------------------------
// 1. Every word kept
// ---------------------------------------------------------------------------

describe("1. every document in the export's shape reads, word for word", () => {
  for (const [key, text] of DOCUMENTS) {
    test(key, () => {
      const read = readGuideMarkdown(text, slot(key));
      assert.deepEqual(read.problems, [], key);
      const source = read.byline ? text.split("\n").filter((line) => line.trim() !== read.byline).join("\n") : text;
      assert.equal(words(guideToMarkdown(read.doc)), words(source), key);
    });
  }

  test("a session plan reads as headings, its text, its boxes to tick, its run sheet and its lists", () => {
    const { doc } = readGuideMarkdown(PLAN_W3, slot("w03-plan"));
    assert.equal(doc.title, "Session 3: Reading the sky");
    assert.deepEqual(
      doc.blocks.map((block) => (block.type === "heading" ? `h${block.level}` : block.type)),
      ["h2", "p", "p", "p", "checklist", "p", "h2", "table", "h2", "h3", "p", "ol", "h3", "p", "ol", "h2", "ul"],
    );
    const boxes = doc.blocks.find((block) => block.type === "checklist");
    assert.deepEqual(boxes.items.map((item) => item.runs.map((run) => run.text).join("")), [
      "One cloud atlas per pair (Printables)",
      "Pens in blue and green",
      "Next week's case slips in an envelope",
    ]);
    assert.deepEqual(doc.blocks[1].runs, [{ text: "Aims.", bold: true }, { text: " Each person leaves with a rain forecast for Friday and one reason for it." }]);
  });

  test("a week's notes keep their quoted answer as a quote, and a link as a link", () => {
    const { doc } = readGuideMarkdown(NOTES_W3, slot("w03-notes"));
    const quote = doc.blocks.find((block) => block.type === "quote");
    assert.deepEqual(quote.body.map((p) => p.runs.map((run) => run.text).join("")), [
      "65% for rain by Friday lunchtime: the barometer has dropped two days running.",
      "I'd change my mind if the wind swung back to the east.",
    ]);
    assert.match(JSON.stringify(doc.blocks), /"href":"https:\/\/example\.org\/models"/);
  });

  test("a template keeps every space and line, its language word with it", () => {
    const { doc } = readGuideMarkdown(PRINTABLES, slot("printables"));
    const code = doc.blocks.find((block) => block.type === "code");
    assert.deepEqual(code, { type: "code", lang: "markdown", text: "FRIDAY FORECAST                 Name: ____________\n\nChance of rain:  ____%" });
  });
});

// ---------------------------------------------------------------------------
// 2. The byline
// ---------------------------------------------------------------------------

describe("2. the byline, and only the byline, is left out", () => {
  test("the shapes a byline takes, and lines that only look like one", () => {
    for (const line of ["Oct 25, 2026", "Oct 25, 2026 · @ada example", "25 Oct 2026", "@ada example · Oct 25, 2026", "Sept 3, 2026 · @ada example · @grace hopper"]) {
      assert.equal(isByline(line), true, line);
    }
    for (const line of ["Oct 25, 2026 is the day we start.", "Ask @ada example for help", "Weather Fellowship", "", "October"]) {
      assert.equal(isByline(line), false, line);
    }
  });

  test("it is left out under the title, said, and never written back", () => {
    const read = readGuideMarkdown(HANDBOOK, slot("handbook"));
    assert.equal(read.byline, "Oct 25, 2026 · @ada example");
    assert.equal(read.checks[0], "The byline under the title was left out (“Oct 25, 2026 · @ada example”): bylines aren’t page content.");
    assert.doesNotMatch(JSON.stringify(read.doc), /ada example|Oct 25/);
    assert.doesNotMatch(guideToMarkdown(read.doc), /ada example|Oct 25/);
    assert.equal(readGuideMarkdown(HOW_TO_USE, slot("how-to-use")).byline, "Oct 25, 2026");
  });

  test("a line of the same shape anywhere else is the document's own, and kept", () => {
    const text = `# Printables\n\nCut along the lines.\n\nOct 25, 2026\n`;
    const read = readGuideMarkdown(text, slot("printables"));
    assert.equal(read.byline, null);
    assert.match(JSON.stringify(read.doc.blocks), /Oct 25, 2026/);
  });
});

// ---------------------------------------------------------------------------
// 3. The round trip
// ---------------------------------------------------------------------------

/** A document holding every kind of block, and the lines that are hardest to write back. */
const AWKWARD = `# Session 2: Odd cases

Before any heading, a line with *stars*, _lines_, \`ticks\`, [brackets] and a \\{#brace}.

## A heading that ends in a hash \\#

- A plain list
- of two lines

* [ ] Then boxes to tick
* [x] One ticked already

- And a plain list straight after the boxes

1. A numbered list
2. of two

1) Another numbered list straight after it

#3 is not a heading, and this line starts with a number.

| A cell with a \\| in it | **Bold** | [a link](https://example.com/a?b=c) |
| --- | --- | --- |
| one | two | three |

> A quote holding a list:
>
> - one
> - two
>
> \`\`\`
> code inside a quote
> \`\`\`

\`\`\`text
A template with \`\`\` three ticks inside.
    Indented.
\`\`\`

### A deeper heading

#### Deeper still

Last line, with a link to [write](mailto:someone@example.com).
`;

describe("3. copied out and pasted back, a document is the same document", () => {
  for (const [key, text] of [...DOCUMENTS, ["w02-plan", AWKWARD]]) {
    test(key, () => {
      const first = readGuideMarkdown(text, slot(key));
      assert.deepEqual(first.problems, [], key);
      const copy = guideToMarkdown(first.doc);
      const again = readGuideMarkdown(copy, slot(key));
      assert.deepEqual(again.problems, [], key);
      assert.deepEqual(again.doc, first.doc, key);
      assert.equal(guideToMarkdown(again.doc), copy, key);
    });
  }

  test("the awkward document keeps its lists apart and its marks as marks", () => {
    const { doc } = readGuideMarkdown(AWKWARD, slot("w02-plan"));
    assert.deepEqual(
      doc.blocks.map((block) => block.type),
      ["p", "heading", "ul", "checklist", "ul", "ol", "ol", "p", "table", "quote", "code", "heading", "heading", "p"],
    );
    assert.deepEqual(doc.blocks[1].runs, [{ text: "A heading that ends in a hash #" }]);
    assert.deepEqual(doc.blocks[3].items.map((item) => item.checked === true), [false, true]);
    assert.deepEqual(doc.blocks[0].runs.filter((run) => run.bold || run.italic).map((run) => run.text), ["stars", "lines"]);
    assert.equal(doc.blocks[10].text, "A template with ``` three ticks inside.\n    Indented.");
  });
});

// ---------------------------------------------------------------------------
// 4. Nothing cut short in silence
// ---------------------------------------------------------------------------

describe("4. a document over a cap is named, and one with no problem reads back as saved", () => {
  const { GUIDE_LIMITS } = model;
  const problemsOf = (text, key = "w03-plan") => readGuideMarkdown(text, slot(key)).problems;

  test("each cap, broken once", () => {
    const longTitle = `Session 3: ${"a".repeat(GUIDE_LIMITS.title)}`;
    assert.match(problemsOf(`# ${longTitle}\n\nText.\n`)[0], new RegExp(`^The title: it is ${longTitle.length} characters; the most is 200\\.$`));
    assert.match(problemsOf(`# Session 3: A\n\n## ${"h".repeat(301)}\n`).join("\n"), /is 301 characters; the most is 300\./);
    assert.match(problemsOf(`# Session 3: A\n\n| x |\n| --- |\n| ${"c".repeat(1001)} |\n`).join("\n"), /a cell of a table is 1001 characters; the most is 1000\./);
    assert.match(problemsOf(`# Session 3: A\n\n\`\`\`\n${"c".repeat(4001)}\n\`\`\`\n`).join("\n"), /a block of code is 4001 characters; the most is 4000\./);
    assert.match(problemsOf(`# Session 3: A\n\n${Array.from({ length: 41 }, (_, i) => `- line ${i}`).join("\n")}\n`).join("\n"), /has 41 items in a list; the most is 40\./);
    assert.match(problemsOf(`# Session 3: A\n\n${Array.from({ length: 41 }, (_, i) => `- [ ] box ${i}`).join("\n")}\n`).join("\n"), /has 41 lines in a list of boxes to tick; the most is 40\./);
    assert.match(problemsOf(`# Session 3: A\n\n|${" a |".repeat(9)}\n|${" --- |".repeat(9)}\n|${" b |".repeat(9)}\n`).join("\n"), /has 9 columns in a table; the most is 8\./);
    assert.match(problemsOf(`# Session 3: A\n\n| a |\n| --- |\n${"| b |\n".repeat(61)}`).join("\n"), /has 61 rows in a table; the most is 60\./);
    assert.match(problemsOf(`# Session 3: A\n\n${"Line.\n\n".repeat(801)}`).join("\n"), /The document has 801 headings, paragraphs, lists, tables, quotes and blocks of code; the most is 800\./);
    const big = Array.from({ length: 40 }, () => `${"word ".repeat(800)}\n`).join("\n");
    assert.match(problemsOf(`# Session 3: A\n\n${big}`).join("\n"), /^The document is \d+ characters; the most is 150000\.$/m);
    assert.match(problemsOf(`# Session 3: A\n\n${"x".repeat(GUIDE_LIMITS.maxPasteChars)}`)[0], /a document’s Markdown can be at most 250000\.$/);
  });

  test("what cannot be drawn where it is written stops a save, with what to change", () => {
    assert.deepEqual(problemsOf("Text first.\n\n# Session 3: A\n\nMore.\n"), ["Something comes before the title line: start the Markdown with the line beginning “# ”."]);
    assert.deepEqual(problemsOf("No title at all.\n"), ["The document has no title line: it starts with a line beginning “# ”, its title."]);
    assert.deepEqual(problemsOf("# Session 3: A\n\nText.\n\n# Session 4: B\n\nText.\n"), ["“Session 4: B” is a second title line: paste one document at a time."]);
    assert.deepEqual(problemsOf("# Session 3: A\n\n## Run sheet\n\n- A step:\n\n  ```\n  code\n  ```\n"), [
      "Under “Run sheet”, a list holds a block of code inside one of its lines, which the page can’t draw there: move it out of the list.",
    ]);
    assert.deepEqual(problemsOf("# Session 3: A\n\n- [ ] A box\n  - with a list in it\n"), [
      "Before the first heading, a box to tick has a list inside it, which the page can’t draw: make each line its own box.",
    ]);
    assert.deepEqual(problemsOf("# Session 3: A\n"), ["The document has nothing under its title."]);
  });

  test("a document with no problem is stored as the store reads it back", () => {
    for (const [key, text] of [...DOCUMENTS, ["w02-plan", AWKWARD]]) {
      const { doc } = readGuideMarkdown(text, slot(key));
      assert.deepEqual(model.sanitizeGuideBlocks(JSON.parse(JSON.stringify(doc.blocks))), doc.blocks, key);
      assert.deepEqual(model.guideDocumentProblems(doc), [], key);
    }
  });

  test("the read side cuts what came in some other way down to the caps, and drops what is not a block", () => {
    const blocks = model.sanitizeGuideBlocks([
      { type: "heading", level: 9, runs: [{ text: "Too deep" }] },
      { type: "heading", level: 2, runs: [{ text: "h".repeat(400) }] },
      { type: "script", text: "alert(1)" },
      { type: "p", runs: [{ text: "A link", href: "javascript:alert(1)" }] },
      { type: "checklist", items: [{ runs: [{ text: "Box" }], checked: "yes" }] },
      { type: "quote", body: [{ type: "p", runs: [{ text: "Quoted" }] }] },
    ]);
    assert.deepEqual(blocks, [
      { type: "heading", level: 2, runs: [{ text: "h".repeat(300) }] },
      { type: "p", runs: [{ text: "A link" }] },
      { type: "checklist", items: [{ runs: [{ text: "Box" }] }] },
      { type: "quote", body: [{ type: "p", runs: [{ text: "Quoted" }] }] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. The wrong place
// ---------------------------------------------------------------------------

describe("5. a document's own title says where it goes", () => {
  test("titles read as what they are", () => {
    const { readDocumentTitle } = recognise;
    assert.deepEqual(readDocumentTitle("Session 3: Reading the sky"), { kind: "plan", weekNumber: 3 });
    assert.deepEqual(readDocumentTitle("Week 12 notes: Reading the sky"), { kind: "notes", weekNumber: 12 });
    assert.deepEqual(readDocumentTitle("Week 3: Reading the sky"), { kind: "week", weekNumber: 3 });
    for (const title of ["Weather Fellowship: facilitator guide", "Weather Fellowship: session plans", "Case studies and feedback", "Printables", "Sessions", "Week notes"]) {
      assert.deepEqual(readDocumentTitle(title), { kind: "course" }, title);
    }
    for (const title of ["Weather Fellowship: fellow guide", "Glossary", "The six weeks", "Sessions to come"]) {
      assert.deepEqual(readDocumentTitle(title), { kind: "other" }, title);
    }
  });

  test("a title that does not say which week, or a course document whose title lacks its words, is a thing to check", () => {
    assert.deepEqual(readGuideMarkdown("# Running the evening\n\nText.\n", slot("w03-plan")).checks, [
      "The title doesn’t say which session this is (“Session 3: …”): check it is Week 3 session plan.",
    ]);
    assert.deepEqual(readGuideMarkdown("# Background\n\nText.\n", slot("w03-notes")).checks, [
      "The title doesn’t say which week’s notes these are (“Week 3 notes: …”): check they are Week 3 notes.",
    ]);
    assert.deepEqual(readGuideMarkdown(CASE_STUDIES, slot("handbook")).checks, ["Check this is Handbook: its title doesn’t say so."]);
    assert.deepEqual(readGuideMarkdown(PLAN_W3.replace("# Session 3: Reading the sky", "# Weather Fellowship: facilitator guide"), slot("handbook")).checks, [
      "“Run sheet” is a heading a session plan or a week’s notes has: check this is Handbook.",
    ]);
    assert.equal(readGuideMarkdown(FELLOW_WEEK_3, slot("handbook")).problems[0], "This is week 3 of the fellow guide, which goes in the run’s week, not in the facilitator guide.");
  });

  test("Sessions and Week notes read in their own places with nothing to check, and as course documents anywhere else", () => {
    for (const [key, text, title] of [["sessions", SESSIONS, "Sessions"], ["week-notes", WEEK_NOTES, "Week notes"]]) {
      const read = readGuideMarkdown(text, slot(key));
      assert.deepEqual([read.problems, read.checks], [[], []], key);
      assert.deepEqual(
        read.found.map((row) => [row.state, row.label, row.detail]),
        [
          ["found", "Title", title],
          ["found", "Before the first heading", "1 paragraph"],
          ["found", "At a glance", "1 table"],
        ],
        key,
      );
    }
    // Each in the other's place is a thing to check, as between any two course documents.
    assert.deepEqual(readGuideMarkdown(SESSIONS, slot("week-notes")).checks, ["Check this is Week notes: its title doesn’t say so."]);
    assert.deepEqual(readGuideMarkdown(WEEK_NOTES, slot("sessions")).checks, ["Check this is Sessions: its title doesn’t say so."]);
    assert.deepEqual(readGuideMarkdown(SESSIONS, slot("handbook")).checks, ["Check this is Handbook: its title doesn’t say so."]);
    // In a week's place, refused by its title; and a week's own document is refused in theirs.
    assert.equal(readGuideMarkdown(SESSIONS, slot("w01-plan")).problems[0], "“Sessions” is one of the course’s own documents, and you’re loading Week 1 session plan. Load it in its own place, or change the title line.");
    assert.equal(readGuideMarkdown(WEEK_NOTES, slot("w01-notes")).problems[0], "“Week notes” is one of the course’s own documents, and you’re loading Week 1 notes. Load it in its own place, or change the title line.");
    assert.equal(readGuideMarkdown(PLAN_W3, slot("sessions")).problems[0], "This is session 3’s plan, and you’re loading Sessions. Load it as Week 3 session plan, or change the title line.");
    assert.equal(readGuideMarkdown(NOTES_W3, slot("week-notes")).problems[0], "This is week 3’s notes, and you’re loading Week notes. Load it as Week 3 notes, or change the title line.");
    assert.equal(readGuideMarkdown(FELLOW_WEEK_3, slot("week-notes")).problems[0], "This is week 3 of the fellow guide, which goes in the run’s week, not in the facilitator guide.");
  });

  test("what the page leaves out is said", () => {
    const read = readGuideMarkdown("# Printables\n\nOne.\n\n---\n\n- [ ] a box\n- a line\n", slot("printables"));
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.checks, [
      "Before the first heading, a list mixes boxes to tick with plain lines: it is read as a plain list, without its boxes.",
      "1 line across the page was left out: the page divides by its headings.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6. Places, pages and the stored shape
// ---------------------------------------------------------------------------

describe("6. the places and pages are spelt one way", () => {
  test("every place of a six-week course, by key and back", () => {
    const slots = model.guideSlots(6);
    // Six course documents since the two tabs over every week, Sessions and
    // Week notes, have places of their own (October 2026; four before), then
    // two places a week.
    assert.equal(slots.length, 18);
    for (const one of slots) assert.deepEqual(model.parseSlotKey(model.slotKey(one)), one);
    assert.deepEqual(model.guideSlots(0).map(model.slotKey), ["how-to-use", "handbook", "case-studies", "printables", "sessions", "week-notes"]);
    assert.equal(model.guideSlots(99).length, 6 + 2 * 60);
    for (const bad of ["w00-plan", "w61-plan", "w3-plan", "W03-plan", "w03-Plan", "handbook ", "", null, 3]) {
      assert.equal(model.parseSlotKey(bad), null, String(bad));
    }
  });

  test("every page by its address, and the address written once", () => {
    assert.deepEqual(model.parseGuidePage("week-3"), { kind: "week", weekNumber: 3 });
    assert.deepEqual(model.parseGuidePage("week-60"), { kind: "week", weekNumber: 60 });
    assert.deepEqual(model.parseGuidePage("handbook"), { kind: "course", key: "handbook" });
    // The two tabs over every week: course documents, with pages of their own, which the course page places at the top of Each week.
    assert.deepEqual(model.parseGuidePage("sessions"), { kind: "course", key: "sessions" });
    assert.deepEqual(model.parseGuidePage("week-notes"), { kind: "course", key: "week-notes" });
    assert.equal(model.facilitatorGuidePath("c", { kind: "course", key: "week-notes" }), "/learn/facilitator-guide/c/week-notes");
    assert.deepEqual([model.slotLabel(slot("sessions")), model.slotLabel(slot("week-notes"))], ["Sessions", "Week notes"]);
    assert.deepEqual(model.COURSE_DOCUMENT_KEYS.filter(model.isWeeksAtAGlance), ["sessions", "week-notes"]);
    for (const bad of ["week-note", "weeknotes", "Sessions", "session", "w00-notes"]) {
      assert.equal(model.parseGuidePage(bad), null, bad);
      assert.equal(model.parseSlotKey(bad), null, bad);
    }
    for (const bad of ["week-0", "week-03", "week-61", "week-", "w03-plan", "Week-3", "preface"]) {
      assert.equal(model.parseGuidePage(bad), null, bad);
    }
    assert.equal(model.facilitatorGuidePath("a b"), "/learn/facilitator-guide/a%20b");
    assert.equal(model.facilitatorGuidePath("c", { kind: "week", weekNumber: 3 }), "/learn/facilitator-guide/c/week-3");
    assert.equal(model.facilitatorGuideAdminPath("c"), "/admin/courses/c/facilitator-guide");
    assert.deepEqual(model.slotsOfPage({ kind: "week", weekNumber: 3 }).map(model.slotKey), ["w03-plan", "w03-notes"]);
  });

  test("a stored row that cannot say which course and place it is, is nobody's", () => {
    const { normalizeCourseFacilitatorGuide: normalize, facilitatorGuideDocId } = record;
    const good = { courseId: "c1", slot: "w03-plan", weekNumber: 3, title: "Session 3: A", blocks: [{ type: "p", runs: [{ text: "x" }] }], extra: "dropped" };
    const id = facilitatorGuideDocId("c1", { kind: "week", weekNumber: 3, part: "plan" });
    assert.equal(id, "c1__w03-plan");
    assert.deepEqual(Object.keys(normalize(id, good)).sort(), ["blocks", "courseId", "id", "slot", "title", "updatedAt"]);
    assert.equal(normalize("c1__w04-plan", good), null);
    assert.equal(normalize(id, { ...good, courseId: "" }), null);
    assert.equal(normalize(id, { ...good, slot: "w03-answers" }), null);
  });
});
