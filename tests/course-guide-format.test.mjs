/**
 * A programme's Start here and Glossary as records (`src/lib/courses/guide/`):
 * read from the fellow guide's own Markdown, written back for "Copy as
 * Markdown", read from storage, held to their own caps, and carried by every
 * copy of a run.
 *
 *  1. Start here in the guide's shape: the title, the byline left out, the
 *     opening, each section with its lists and tables as written (the rubric
 *     and the numbered questions are text, never a case block), Support in a
 *     box, the credit line; what was found and what to check.
 *  2. The Glossary in the guide's shape: each term and its definition in the
 *     table's order, links kept; what stops it and what to check.
 *  3. Copied out and pasted back is the same document, for both.
 *  4. The read side: a stored document reads back unchanged; anything else
 *     is cut to the caps or read as no document.
 *  5. Every cap, broken once, stops a save with a sentence that says so.
 *  6. The one copy (`runGuideFields`), and every curriculum copy in the tree
 *     carrying it.
 *
 * Every word is made up (`tests/lib/guideFixture.mjs`).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createLoader } from "./lib/tsLoader.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { GLOSSARY_MARKDOWN, START_HERE_MARKDOWN, glossaryDoc, startHereDoc } from "./lib/guideFixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const md = await loadTs("lib/courses/guide/markdown.ts");
const model = await loadTs("lib/courses/guide/model.ts");
const { GUIDE_LIMITS: L } = await loadTs("lib/courses/guide/limits.ts");
const { WEEK_BLOCK_LIMITS: W } = await loadTs("lib/courses/weekBlocks/limits.ts");

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });
const textOf = (runs) => runs.map((r) => r.text).join("").length;

// ---------------------------------------------------------------------------
// 1. Start here
// ---------------------------------------------------------------------------

describe("1. Start here, read from the guide's shape", () => {
  test("the document, every section in order, lists and tables kept as written", () => {
    const read = md.readStartHereMarkdown(START_HERE_MARKDOWN);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.doc, startHereDoc());
  });

  test("the rubric is a table with its empty corner and the questions a numbered list: text, never a case block", () => {
    const { doc } = md.readStartHereMarkdown(START_HERE_MARKDOWN);
    const rubric = doc.sections[3].body.find((paragraph) => paragraph.type === "table");
    assert.deepEqual(rubric.header.map((cell) => cell.runs.map((r) => r.text).join("")), ["", "Not yet", "Solid", "Strong"]);
    const questions = doc.sections[2].body.find((paragraph) => paragraph.type === "ol");
    assert.equal(questions.items.length, 3);
    assert.deepEqual(questions.items[0].runs[0], { text: "What happened?", bold: true });
    for (const section of doc.sections) {
      for (const paragraph of section.body) assert.ok(["p", "ul", "ol", "table", "code"].includes(paragraph.type), paragraph.type);
    }
  });

  test("a level-3 section keeps its level, Support is drawn in a box, and the credit line is the last paragraph's own", () => {
    const { doc } = md.readStartHereMarkdown(START_HERE_MARKDOWN);
    const support = doc.sections.at(-1);
    assert.equal(support.level, 3);
    assert.equal(model.isSupportHeading(support.heading), true);
    assert.equal(model.isSupportHeading("Support and wellbeing"), false);
    assert.equal(support.body.length, 1, "the credit line is not left in Support");
    assert.equal(doc.credit.map((r) => r.text).join(""), "Adapted from Example Harbour's lighthouse course, with the evenings redesigned for a group on the rocks.");
  });

  test("what was found, row by row, and the byline said as left out", () => {
    const read = md.readStartHereMarkdown(START_HERE_MARKDOWN);
    assert.deepEqual(
      read.found.map((row) => [row.state, row.label, row.detail, row.indent]),
      [
        ["found", "Title", "Lighthouse Fellowship: fellow guide", false],
        ["found", "Opening", "1 paragraph", false],
        ["found", "What you'll get out of it", "1 paragraph, 1 list", false],
        ["found", "A week, step by step", "3 paragraphs, 1 table", false],
        ["found", "Talks", "2 paragraphs, 2 lists", false],
        ["found", "Written work and feedback", "1 paragraph, 1 table", false],
        ["found", "How we behave", "1 list", false],
        ["found", "Support", "1 paragraph · drawn in a box", true],
        ["found", "Who reads reflections", "Under “Reflections.” in “A week, step by step”: the reader’s facilitators and the programme’s lead, by name", false],
        ["found", "Credit line", "Adapted from Example Harbour's lighthouse course, with the evenings redesigned for a group on the rocks.", false],
      ],
    );
    assert.deepEqual(read.checks, ["The date under the title (“Mar 3, 2026”) was left out: it’s the guide’s byline, not part of the page."]);
  });

  test("where the line about who reads reflections goes: under the first paragraph opening with a bold Reflections", () => {
    const doc = startHereDoc();
    assert.deepEqual(model.reflectionsLineAt(doc), { section: 1, paragraph: 2 });
    doc.sections[1].body[2] = p(run("Reflections. Not bold, so not the guide's marker."));
    assert.equal(model.reflectionsLineAt(doc), null);
  });

  test("the guide's lines the site words differently are flagged, as a week's are", () => {
    const markdown = START_HERE_MARKDOWN.replace(
      "Jot a few lines for each as you go.",
      "In week 2 the one exercise is the forecast. See the Start here tab.",
    );
    const read = md.readStartHereMarkdown(markdown);
    assert.ok(
      read.checks.includes("1 line calls the written answer “the week’s one exercise”, and 1 points to “the Start here tab”. Change them in the guide?"),
      read.checks.join(" | "),
    );
  });

  test("no Reflections paragraph: the page has nowhere for its line, said and found as a thing to check", () => {
    const read = md.readStartHereMarkdown(START_HERE_MARKDOWN.replace("**Reflections.**", "Reflections:"));
    assert.ok(read.checks.includes("No paragraph starts with “Reflections.”, so the page has nowhere to say who reads a person’s reflections. Add it in the guide?"));
    assert.deepEqual(read.found.find((row) => row.label === "Who reads reflections"), {
      state: "check",
      label: "Who reads reflections",
      detail: "No paragraph starts with “Reflections.”",
      indent: false,
    });
    assert.deepEqual(read.problems, [], "a thing to check, never a stop");
  });

  test("pictures, HTML, a link that is not https, a deep heading and a link a checker cannot read are each said", () => {
    const markdown = `${START_HERE_MARKDOWN}\n#### Small print\n\n![A lamp](https://example.com/lamp.png) See [the old log](http://example.com/old) and [a report](https://openai.com/report).\n\n<div>boxed</div>\n`;
    const read = md.readStartHereMarkdown(markdown);
    assert.ok(read.checks.includes("1 heading below “###” was read as a bold line."), read.checks.join(" | "));
    assert.ok(read.checks.includes("1 picture was left out: Start here shows no pictures."));
    assert.ok(read.checks.includes("A link was left as words: a link has to start with https:// (or mailto: for an address). http://example.com/old"));
    assert.ok(read.checks.includes("A piece of HTML was left out: write it as Markdown."));
    assert.ok(read.checks.some((line) => /^1 of \d+ links can’t be checked automatically \(openai\.com\)\. They work in a browser\.$/.test(line)), read.checks.join(" | "));
  });

  test("more than one title line, or nothing at all, stops a save", () => {
    assert.ok(md.readStartHereMarkdown(`# One\n\n# Two\n\n## A\n\nText.\n`).problems.includes("The Markdown has more than one title line (a line starting “# ”): keep one."));
    assert.deepEqual(md.readStartHereMarkdown("# Only a title\n").problems, [
      "Nothing in this Markdown reads as Start here: paste the guide’s Start here page, starting with its title line.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. The Glossary
// ---------------------------------------------------------------------------

describe("2. the Glossary, read from the guide's shape", () => {
  test("each term and its definition, in the table's order, links and italics kept", () => {
    const read = md.readGlossaryMarkdown(GLOSSARY_MARKDOWN);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.checks, []);
    assert.deepEqual(read.doc, glossaryDoc());
    assert.deepEqual(
      read.found.map((row) => [row.state, row.label, row.detail]),
      [
        ["found", "Title", "Glossary"],
        ["found", "Opening", "1 paragraph"],
        ["found", "Terms", "5 terms, in the table’s order"],
        ["found", "Columns", "Term · In plain words"],
      ],
    );
  });

  test("the order is the table's, never sorted", () => {
    const markdown = GLOSSARY_MARKDOWN.replace("| Beam |", "| Zenith |");
    const terms = md.readGlossaryMarkdown(markdown).doc.terms.map((entry) => entry.term[0].text);
    assert.deepEqual(terms, ["Zenith", "Fresnel lens", "Keeper", "Light list", "Wick"]);
  });

  test("no table, two tables, three columns, a row with no term and a term with no definition each stop a save", () => {
    assert.ok(md.readGlossaryMarkdown("# Glossary\n\nJust words.\n").problems.includes("There’s no table of terms: the Glossary reads one table, with a term and what it means on each row."));
    assert.ok(md.readGlossaryMarkdown(`${GLOSSARY_MARKDOWN}\n| A | B |\n| --- | --- |\n| c | d |\n`).problems.includes("The Markdown has 2 tables: the Glossary reads one, with a term and what it means on each row."));
    assert.ok(md.readGlossaryMarkdown("| Term | Means | Notes |\n| --- | --- | --- |\n| a | b | c |\n").problems.includes("The table has 3 columns: the Glossary reads two, the term and what it means."));
    const holes = md.readGlossaryMarkdown("| Term | Means |\n| --- | --- |\n|  | An orphan definition. |\n| Lonely |  |\n");
    assert.ok(holes.problems.includes("Row 1 of the table has no term."), holes.problems.join(" | "));
    assert.ok(holes.problems.includes("“Lonely” has no definition."), holes.problems.join(" | "));
  });

  test("a term twice is a thing to check, once per term", () => {
    const read = md.readGlossaryMarkdown(`${GLOSSARY_MARKDOWN.trimEnd()}\n| keeper | Said again. |\n| Keeper | And again. |\n`);
    assert.deepEqual(read.checks, ["“Keeper” is in the table more than once."]);
    assert.deepEqual(read.problems, []);
  });
});

// ---------------------------------------------------------------------------
// 3. The round trip
// ---------------------------------------------------------------------------

describe("3. copied out and pasted back is the same document", () => {
  test("Start here: the copy reads back as the document, and copying that writes the same text", () => {
    const doc = startHereDoc();
    const copy = md.startHereToMarkdown(doc);
    const read = md.readStartHereMarkdown(copy);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.doc, doc);
    assert.equal(md.startHereToMarkdown(read.doc), copy);
  });

  test("the Glossary: the copy reads back as the document, and copying that writes the same text", () => {
    const doc = glossaryDoc();
    const copy = md.glossaryToMarkdown(doc);
    const read = md.readGlossaryMarkdown(copy);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.doc, doc);
    assert.equal(md.glossaryToMarkdown(read.doc), copy);
  });

  test("text that Markdown reads as markup survives: stars, underscores, brackets, pipes, a closing hash, an entity and code", () => {
    const tricky = {
      title: "C# and *stars* for keepers #",
      lead: [p(run("1. Not a list: 3 * 4 = 12, snake_case, [brackets] and {#not-an-id} & &amp; too."))],
      sections: [
        {
          heading: "Pipes | and stars *",
          level: 2,
          body: [
            {
              type: "table",
              header: [{ runs: [run("A | B")] }, { runs: [run("C")] }],
              rows: [{ cells: [{ runs: [run("x | y", { italic: true })] }, { runs: [run("- dash first")] }] }],
            },
            { type: "code", lang: "python", text: "print('lamp')\n  # indented ```" },
            { type: "ul", items: [{ runs: [run("one")] }] },
            { type: "ul", items: [{ runs: [run("a second list straight after")] }] },
          ],
        },
        { heading: "Ends with hashes ##", level: 3, body: [] },
      ],
      credit: [],
    };
    const copy = md.startHereToMarkdown(tricky);
    const read = md.readStartHereMarkdown(copy);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.doc, tricky);

    const glossary = {
      title: "",
      lead: [],
      columns: ["", ""],
      terms: [{ term: [run("A | pipe")], definition: [run("*Not* italic, and a "), run("link", { href: "https://example.com/a_(b)" }), run(" with brackets.")] }],
      after: [p(run("Something after the table."))],
    };
    const back = md.readGlossaryMarkdown(md.glossaryToMarkdown(glossary));
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.doc, glossary);
  });
});

// ---------------------------------------------------------------------------
// 4. The read side
// ---------------------------------------------------------------------------

describe("4. a stored document, read", () => {
  test("a document the check passes reads back unchanged, through the run's one reader of each", () => {
    const run = { label: "Spring", startHere: startHereDoc(), glossary: glossaryDoc() };
    assert.deepEqual(model.readRunStartHere(structuredClone(run)), startHereDoc());
    assert.deepEqual(model.readRunGlossary(structuredClone(run)), glossaryDoc());
  });

  test("anything that is not a document, or has nothing to draw, is no document", () => {
    for (const raw of [undefined, null, "words", 7, [], {}, { sections: "no" }, { lead: [], sections: [{ heading: "", body: [] }] }]) {
      assert.equal(model.sanitizeStartHere(raw), null, JSON.stringify(raw));
    }
    for (const raw of [undefined, null, [], {}, { terms: [{ term: [], definition: [run("orphan")] }] }]) {
      assert.equal(model.sanitizeGlossary(raw), null, JSON.stringify(raw));
    }
    assert.equal(model.readRunStartHere({ startHere: "<b>markup</b>" }), null);
    assert.equal(model.readRunGlossary(null), null);
  });

  test("junk inside is dropped and caps are held on read: a link that is not https, a third level, a term over its cap", () => {
    const stored = startHereDoc();
    stored.sections[0].level = 4;
    stored.sections[1].body.push({ type: "script", text: "alert(1)" });
    stored.lead = [p(run("Go ", {}), run("here", { href: "javascript:alert(1)" }))];
    const read = model.sanitizeStartHere(stored);
    assert.equal(read.sections[0].level, 2);
    assert.equal(read.sections[1].body.some((paragraph) => paragraph.type === "script"), false);
    assert.deepEqual(read.lead, [p(run("Go here"))]);

    const glossary = glossaryDoc();
    glossary.terms[0].term = [run("x".repeat(L.term + 5))];
    glossary.terms.push(...Array.from({ length: L.maxTerms + 3 }, (_, i) => ({ term: [run(`T${i}`)], definition: [run("d")] })));
    const cut = model.sanitizeGlossary(glossary);
    assert.equal(cut.terms[0].term[0].text.length, L.term);
    assert.equal(cut.terms.length, L.maxTerms);
  });
});

// ---------------------------------------------------------------------------
// 5. Every cap, broken once
// ---------------------------------------------------------------------------

describe("5. every cap stops a save, in a sentence that says so", () => {
  const long = (n) => "w".repeat(n);

  test("Start here", () => {
    const cases = [
      [(d) => (d.title = long(L.title + 1)), `The title is ${L.title + 1} characters; the most is ${L.title}.`],
      [(d) => (d.lead = [p(run(long(L.leadChars + 1)))]), `The opening: the text is ${L.leadChars + 1} characters; the most is ${L.leadChars}.`],
      [
        (d) => (d.sections = Array.from({ length: L.maxSections + 1 }, (_, i) => ({ heading: `S${i}`, level: 2, body: [] }))),
        `Start here has ${L.maxSections + 1} sections; the most is ${L.maxSections}.`,
      ],
      [(d) => (d.sections[0].heading = long(L.heading + 1)), `“${long(L.heading + 1)}”: the heading is ${L.heading + 1} characters; the most is ${L.heading}.`],
      [(d) => (d.sections[0].heading = ""), "A section’s heading has no words: give it some."],
      [(d) => (d.sections[0].body = [p(run(long(L.sectionChars + 1)))]), `“What you'll get out of it”: the text is ${L.sectionChars + 1} characters; the most is ${L.sectionChars}.`],
      [
        (d) => (d.sections[0].body = Array.from({ length: W.maxProseParagraphs + 1 }, () => p(run("x")))),
        `“What you'll get out of it” has ${W.maxProseParagraphs + 1} paragraphs, lists, tables and code blocks; the most is ${W.maxProseParagraphs}.`,
      ],
      [
        (d) => (d.sections[1].body[1].rows[0].cells[1] = { runs: [run(long(W.inlineChars + 1))] }),
        `“A week, step by step”: a table cell is ${W.inlineChars + 1} characters; the most is ${W.inlineChars}.`,
      ],
      [
        (d) => (d.sections[0].body = [p(...Array.from({ length: W.maxRuns + 1 }, (_, i) => run(`w${i}`, i % 2 ? { bold: true } : {})))]),
        "“What you'll get out of it”: a line has too many changes of style.",
      ],
      [(d) => (d.credit = [run(long(L.creditChars + 1))]), `Start here: the credit line is ${L.creditChars + 1} characters; the most is ${L.creditChars}.`],
      [
        (d) => (d.sections = Array.from({ length: 4 }, (_, i) => ({ heading: `S${i}`, level: 2, body: [p(run(long(L.sectionChars)))] }))),
        `Start here is ${4 * L.sectionChars + textOf(startHereDoc().lead[0].runs) + textOf(startHereDoc().credit)} characters; the most is ${L.startHereChars}.`,
      ],
    ];
    for (const [breakIt, sentence] of cases) {
      const doc = startHereDoc();
      breakIt(doc);
      const problems = model.startHereProblems(doc);
      assert.ok(problems.includes(sentence), `wanted "${sentence.slice(0, 120)}", got: ${problems.join(" | ").slice(0, 400)}`);
    }
    assert.deepEqual(model.startHereProblems(startHereDoc()), []);
  });

  test("the Glossary", () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ term: [run(`T${i}`)], definition: [run("d")] }));
    const cases = [
      [(d) => (d.terms = many(L.maxTerms + 1)), `The Glossary has ${L.maxTerms + 1} terms; the most is ${L.maxTerms}.`],
      [(d) => (d.terms[0].term = [run(long(L.term + 1))]), `“${long(L.term + 1)}”: the term is ${L.term + 1} characters; the most is ${L.term}.`],
      [(d) => (d.terms[0].definition = [run(long(L.definition + 1))]), `“Beam”: the definition is ${L.definition + 1} characters; the most is ${L.definition}.`],
      [(d) => (d.columns[1] = long(L.column + 1)), `The table’s second column heading is ${L.column + 1} characters; the most is ${L.column}.`],
      [(d) => (d.lead = [p(run(long(L.glossaryLeadChars + 1)))]), `The opening: the text is ${L.glossaryLeadChars + 1} characters; the most is ${L.glossaryLeadChars}.`],
      [(d) => (d.after = [p(run(long(L.glossaryLeadChars + 1)))]), `The text after the table: the text is ${L.glossaryLeadChars + 1} characters; the most is ${L.glossaryLeadChars}.`],
      [(d) => (d.terms = []), "The Glossary has no terms: it reads a table with a term and what it means on each row."],
      [
        (d) => (d.terms = Array.from({ length: 50 }, (_, i) => ({ term: [run(`T${i}`)], definition: [run(long(L.definition))] }))),
        `The terms and definitions are ${50 * L.definition + 140} characters; the most is ${L.glossaryChars}.`,
      ],
    ];
    for (const [breakIt, sentence] of cases) {
      const doc = glossaryDoc();
      breakIt(doc);
      const problems = model.glossaryProblems(doc);
      assert.ok(problems.includes(sentence), `wanted "${sentence.slice(0, 120)}", got: ${problems.join(" | ").slice(0, 400)}`);
    }
    assert.deepEqual(model.glossaryProblems(glossaryDoc()), []);
  });

  test("a document as stored is held to its own size, so the run's document stays small", () => {
    const doc = startHereDoc();
    doc.sections = Array.from({ length: L.maxSections }, (_, i) => ({
      heading: `S${i}`,
      level: 2,
      body: Array.from({ length: 30 }, () => p(...Array.from({ length: 12 }, (_, j) => run(`w${j}`, j % 2 ? { italic: true } : {})))),
    }));
    const stored = JSON.stringify(doc).length;
    assert.ok(stored > L.storedChars, `the test's document is ${stored} characters stored`);
    assert.ok(model.startHereProblems(doc).includes(`Start here is ${stored} characters stored; the most is ${L.storedChars}. Make it shorter.`));
  });
});

// ---------------------------------------------------------------------------
// 6. Every copy of a run carries its guide
// ---------------------------------------------------------------------------

describe("6. the one copy, and every curriculum copy carrying it", () => {
  test("runGuideFields carries each document the run has, read as stored, and no key for one it has not", () => {
    assert.deepEqual(model.runGuideFields({ startHere: startHereDoc(), glossary: glossaryDoc(), label: "x" }), {
      startHere: startHereDoc(),
      glossary: glossaryDoc(),
    });
    assert.deepEqual(model.runGuideFields({ glossary: glossaryDoc() }), { glossary: glossaryDoc() });
    assert.deepEqual(model.runGuideFields({ startHere: "junk", glossary: { terms: [] } }), {});
    assert.deepEqual(model.runGuideFields(null), {});
  });

  /**
   * THE CLASS: a run's curriculum copied without its guide. A copy of a
   * run's curriculum writes another run's weeks, or a template's, from this
   * one's (`templateWeekFields(` or a whole-week literal carrying
   * `weekBlocksField(`); a file that does so must spread `runGuideFields(`
   * too, or the programme's Start here and Glossary stay behind. Files that
   * copy one week within one run or into a group's own copy are named with
   * why. Walks the tree, so a new copy is held to it the day it is written.
   */
  test("every file that copies a run's curriculum to another run or a template carries the guide", () => {
    const NOT_A_RUN_COPY = new Map([
      ["app/api/courses/runs/[runId]/normalise-weeks/route.ts", "renumbers one run's own weeks in place: the run keeps its guide"],
      ["app/api/courses/groups/[groupId]/weeks/[weekId]/fork/route.ts", "copies one week into a group's own copy: the guide is the run's, not a group's"],
      ["lib/firestore/courseTemplates.ts", "the shape a template week is copied through; the routes that use it carry the guide"],
    ]);
    const copies = [];
    const missing = [];
    for (const file of walkSource(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!/\btemplateWeekFields\(|\bweekBlocksField\(/.test(source)) continue;
      const where = relative(SRC, file).split(sep).join("/");
      if (where.startsWith("lib/courses/weekBlocks/")) continue;
      copies.push(where);
      if (NOT_A_RUN_COPY.has(where)) continue;
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      let carries = false;
      const visit = (node) => {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === "runGuideFields") carries = true;
        ts.forEachChild(node, visit);
      };
      visit(tree);
      if (!carries) missing.push(where);
    }
    for (const file of [
      "app/api/courses/runs/[runId]/clone-weeks/route.ts",
      "app/api/courses/runs/[runId]/apply-template/route.ts",
      "app/api/courses/[courseId]/templates/route.ts",
    ]) {
      assert.ok(copies.includes(file), `the walk did not see ${file}: ${copies.join(", ")}`);
    }
    for (const file of NOT_A_RUN_COPY.keys()) assert.ok(copies.includes(file), `${file} is listed but no longer copies a week: take it off`);
    assert.deepEqual(missing, [], `a run's curriculum copied without its guide: ${missing.join(", ")}`);
  });
});
