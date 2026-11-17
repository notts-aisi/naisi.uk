/**
 * The AI at Nottingham survey's totals: the counts, and above all what each
 * share is a share OF.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A total is easy to get subtly wrong in the one way that matters: the
 * denominator. Two rules, held here by running the shipping function:
 *
 *  - a COUNT is out of the answer sets that saved the question's page, so
 *    somebody who stopped at page 3 is not counted as skipping page 9;
 *  - a SHARE on an agree or support scale is out of the people who GAVE A
 *    VIEW on that line. "Don't know" and "Don't know enough" sit outside the
 *    scale and are left out of every share, and so are blanks.
 *
 * And the page that shows them returns numbers only: no answer set, no
 * comment, nothing that could be one person.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { loadTs } = createLoader();
const { share, surveyTotals } = await loadTs("lib/aiSurvey/totals.ts");
const { AI_SURVEY } = await loadTs("lib/aiSurvey/definition.ts");

const set = (pages, finished = false) => ({ surveyVersion: 1, finished, proposalPageOrder: ["d1", "d2", "d3", "d4", "d5"], pages });
const question = (totals, pageId, id) => totals.pages.find((p) => p.id === pageId).questions.find((q) => q.id === id);
const count = (q, id) => q.counts.find((c) => c.id === id).count;

describe("counts are out of the answer sets that saved the page", () => {
  const sets = [
    set({ about1: { A1: "ug", A2: "maths" }, use: { B1: "daily", B2: ["explain", "code"] } }, true),
    set({ about1: { A1: "ug" }, use: { B2: ["none"] } }),
    set({ about1: {} }),
    set({}),
  ];
  const totals = surveyTotals(sets);

  test("started and finished", () => {
    assert.deepEqual([totals.started, totals.finished], [4, 1]);
  });

  test("a page is counted for those who saved it, however little they answered on it", () => {
    assert.equal(totals.pages.find((p) => p.id === "about1").saved, 3);
    assert.equal(totals.pages.find((p) => p.id === "use").saved, 2);
    assert.equal(totals.pages.find((p) => p.id === "last").saved, 0);
  });

  test("a single-choice question: each answer's count, and how many answered at all", () => {
    const a1 = question(totals, "about1", "A1");
    assert.deepEqual([count(a1, "ug"), count(a1, "pgt"), a1.answered], [2, 0, 2]);
    const a2 = question(totals, "about1", "A2");
    assert.deepEqual([count(a2, "maths"), count(a2, "not_sure"), a2.answered], [1, 0, 1]);
  });

  test("a multi-choice question counts each option, and a person once", () => {
    const b2 = question(totals, "use", "B2");
    assert.equal(b2.multi, true);
    assert.deepEqual([count(b2, "explain"), count(b2, "code"), count(b2, "none"), b2.answered], [1, 1, 1, 2]);
  });

  test("every question and line of the survey has its totals, in the survey's order", () => {
    const ids = totals.pages.flatMap((p) => p.questions.flatMap((q) => (q.kind === "lines" ? q.lines.map((l) => l.id) : [q.id])));
    const expected = AI_SURVEY.pages.flatMap((p) => p.questions.flatMap((q) => (q.type === "lines" ? q.lines.map((l) => l.id) : [q.id])));
    assert.deepEqual(ids, expected);
  });
});

describe("a share is out of those who gave a view", () => {
  // Five people saved the page. On C1: two agree, one disagrees, one does
  // not know, one left it blank.
  const sets = [
    set({ stand: { C1: "sa" } }),
    set({ stand: { C1: "a" } }),
    set({ stand: { C1: "sd" } }),
    set({ stand: { C1: "dk" } }),
    set({ stand: {} }),
  ];
  const c1 = question(surveyTotals(sets), "stand", "C").lines.find((l) => l.id === "C1");

  test("'Don't know' is counted as itself and left out of the share, and so is a blank", () => {
    assert.equal(count(c1, "dk"), 1);
    assert.equal(c1.withAView, 3);
    assert.deepEqual([c1.inFavour, c1.against], [2, 1]);
    assert.equal(share(c1.inFavour, c1.withAView), 67);
    assert.equal(share(c1.against, c1.withAView), 33);
  });

  test("'Neither' is a view: it is in the denominator and on neither side", () => {
    const sets2 = [set({ d1: { P1: "ss" } }), set({ d1: { P1: "n" } }), set({ d1: { P1: "n" } }), set({ d1: { P1: "so" } }), set({ d1: { P1: "dk" } })];
    const p1 = question(surveyTotals(sets2), "d1", "D1").lines.find((l) => l.id === "P1");
    assert.deepEqual([p1.withAView, p1.inFavour, p1.against], [4, 1, 1]);
    assert.equal(share(p1.inFavour, p1.withAView), 25);
  });

  test("a line nobody had a view on has no share, not a share of nothing", () => {
    const totals = surveyTotals([set({ stand: { C2: "dk" } })]);
    const c2 = question(totals, "stand", "C").lines.find((l) => l.id === "C2");
    assert.equal(c2.withAView, 0);
    assert.equal(share(c2.inFavour, c2.withAView), null);
  });

  test("a yes, no, not sure scale has counts and no sides", () => {
    const b5 = question(surveyTotals([set({ seen: { B5a: "yes" } }), set({ seen: { B5a: "not_sure" } })]), "seen", "B5");
    assert.equal(b5.twoSided, false);
    assert.deepEqual(b5.lines[0].counts.map((c) => c.count), [1, 0, 1]);
  });

  test("'rank your top three' counts each line in each place, gives 3, 2 and 1 points, and counts 'None of these' apart", () => {
    const m1 = question(
      surveyTotals([
        set({ d1: { M1: ["P4", "P1", "P6"] } }),
        set({ d1: { M1: ["P4"] } }),
        set({ d1: { M1: ["P1", "P4"] } }),
        set({ d1: { M1: ["none"] } }),
        set({ d1: {} }),
      ]),
      "d1",
      "M1",
    );
    assert.equal(m1.kind, "rank");
    const line = (id) => m1.lines.find((l) => l.id === id);
    assert.deepEqual(line("P4").inPlace, [2, 1, 0]);
    assert.equal(line("P4").points, 2 * 3 + 1 * 2);
    assert.deepEqual(line("P1").inPlace, [1, 1, 0]);
    assert.equal(line("P1").points, 3 + 2);
    assert.deepEqual([line("P6").inPlace, line("P6").points], [[0, 0, 1], 1]);
    assert.deepEqual([line("P3").inPlace, line("P3").points], [[0, 0, 0], 0]);
    // Four answered (three rankings and one "None of these"); the empty page did not.
    assert.equal(m1.answered, 4);
    assert.deepEqual(m1.alone.map((a) => [a.id, a.count]), [["none", 1]]);
    assert.equal(m1.lines.length, 7);
    assert.equal(m1.places, 3);
  });

  test("a question's emphasis marks are not in the totals", () => {
    const b9 = question(surveyTotals([set({ seen: { B9: "yes" } })]), "seen", "B9");
    assert.equal(b9.text, "Have you been required to use an AI tool for assessed work this year?");
  });
});

describe("totals are numbers and nothing else", () => {
  test("a comment is counted, never returned", () => {
    const totals = surveyTotals([set({ last: { G1: "A sentence nobody else would write.", G2: true } }), set({ last: {} })]);
    assert.equal(question(totals, "last", "G1").written, 1);
    assert.equal(question(totals, "last", "G2").ticked, 1);
    assert.ok(!JSON.stringify(totals).includes("nobody else would write"), "a comment's words are in the totals");
  });

  test("a name every object carries is not an answer", () => {
    const totals = surveyTotals([set({ about1: JSON.parse('{"__proto__":"ug","constructor":"ug"}') })]);
    assert.equal(question(totals, "about1", "A1").answered, 0);
  });

  test("the page that shows them is for the survey's own list, and shows no comment", () => {
    const page = readFileSync(join(REPO_ROOT, "src/app/ai-survey/admin/totals/page.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(page, /const \{ signedIn, admin \} = await surveyAdmin\(\);/);
    assert.ok(page.indexOf("await surveyAdmin()") < page.indexOf("readAllSets("), "the answers are read before the gate");
    assert.match(page, /if \(!admin\) \{/);
    assert.doesNotMatch(page, /\.pages\[|G1\b|set\.pages/, "the totals page reads an answer set itself");
  });
});
