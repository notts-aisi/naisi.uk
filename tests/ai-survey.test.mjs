/**
 * The AI at Nottingham survey: its definition, its checks, its export and the
 * pass a browser holds.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The survey is anonymous, with a University-email check in front of it, and
 * it is built beside the Surveys feature with nothing shared. Its words are
 * one data module; everything else is a shell around it. This file runs the
 * shipping code:
 *
 *  1. THE DEFINITION is what was agreed: thirteen pages, five of
 *     them proposals, every code used once, and an export of exactly the
 *     columns the people analysing it were promised, in that order. ONCE THE
 *     SURVEY IS OPEN THE QUESTIONS DO NOT CHANGE: a change that moves a code
 *     or a column fails here, and the fix is to raise `version`, never to
 *     edit this list to match.
 *  2. WHICH ADDRESSES COUNT: exactly `nottingham.ac.uk`, one form per student.
 *  3. A SAVED PAGE holds known codes and known answers and nothing else.
 *  4. THE EXPORT: `not_seen` for a page never reached, an empty cell for a
 *     skipped question, 1 or 0 per option, `dk` as itself.
 *  5. THE PASS cannot be written by a browser, runs out, and is renewed.
 *  6. THE STAGES, and how few shared documents a small survey uses.
 *  7. THE EMAIL CHECK'S STEPS: which step a page opens at, where each press
 *     leads, and the one word the page's address carries at the code step,
 *     so a page that reloaded while somebody read their code comes back to
 *     the code box, never past the start screen.
 *
 * `tests/ai-survey-no-trace.test.mjs` walks the survey's files for what must
 * never be there. `scripts/rules-tests/tests/ai-survey.test.mjs` holds its
 * collections locked to every browser.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["@/lib/firebase/admin", "export const getAdminDb = () => undefined; export const getAdminDbNamed = () => undefined;"],
  ]),
});

const { AI_SURVEY, answerColumns, closesAtInstant, fill, fillValues, isProposalOrder, missingBeforeOpening, pageSequence, proposalPageIds } =
  await loadTs("lib/aiSurvey/definition.ts");
const { normaliseCode, normaliseUniversityAddress } = await loadTs("lib/aiSurvey/address.ts");
const { checkPageAnswers } = await loadTs("lib/aiSurvey/answers.ts");
const { buildExport, exportHeader, exportRow, shuffled } = await loadTs("lib/aiSurvey/exportCsv.ts");
const { answerSetKey, claimHash, isClaim, newCode, newPassId, openPass, passFromClaim, PASS_LIFETIME_MS, renewPass, sealPass } =
  await loadTs("lib/aiSurvey/pass.ts");
const { CLOSING_GRACE_MS, hashAddress, passSigningKey, PEOPLE_PER_DOCUMENT, PEOPLE_PER_GENERATION, SHARDS_PER_GENERATION, shardsInUse, stageAt } =
  await loadTs("lib/aiSurvey/store.ts");
const { plainText } = await loadTs("lib/aiSurvey/types.ts");
const { publicSurvey } = await loadTs("features/aiSurvey/projectSurvey.ts");
const { sequenceOf } = await loadTs("features/aiSurvey/publicSurvey.ts");
const steps = await loadTs("features/aiSurvey/emailSteps.ts");
const { Timestamp } = await import("firebase-admin/firestore");

// ---------------------------------------------------------------------------
// 1. The definition
// ---------------------------------------------------------------------------

/** The export's columns, as promised to the people who will analyse it. */
const COLUMNS = [
  "finished", "A1", "A2", "B1",
  "B2_explain", "B2_summarise", "B2_ideas", "B2_plan", "B2_sources", "B2_draft", "B2_paste", "B2_media", "B2_grammar", "B2_code", "B2_none",
  "B3a", "B3b", "B3c", "B3d",
  "B4a", "B4b", "B4c", "B4d", "B4e", "B4f", "B4g", "B4h", "B4i", "B4j",
  "B5a", "B5b", "B5c", "B6", "B7", "B8", "B8w", "B9", "B10",
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13",
  "X1", "X2", "X3", "X3o", "X4",
  "P1", "P2a", "P2b", "P3", "P4", "P5", "P6", "M1_1", "M1_2", "M1_3", "M1w",
  "P7", "P8", "P9", "P10", "P11", "P12", "M2_1", "M2_2", "M2_3", "M2w",
  "P13", "P14", "P15", "P16", "P17", "M3_1", "M3_2", "M3_3", "M3w",
  "P18", "P30", "P19", "P20", "P21", "P22", "P23", "P24", "M4_1", "M4_2", "M4_3", "M4w",
  "P25", "P26", "P27", "P28", "P29", "M5_1", "M5_2", "M5_3", "M5w",
  "F1", "F2", "G1", "G2", "A3", "A4", "A5", "A6", "H1",
];

/** Every string anywhere in a value. */
function stringsIn(value, into = []) {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, into);
  return into;
}

describe("the definition", () => {
  test("thirteen pages, five of them proposals shown as one block", () => {
    assert.equal(AI_SURVEY.pages.length, 13);
    assert.deepEqual(proposalPageIds(), ["d1", "d2", "d3", "d4", "d5"]);
    assert.deepEqual(
      pageSequence(["d3", "d1", "d5", "d2", "d4"]),
      ["about1", "use", "rules", "seen", "stand", "choices", "d3", "d1", "d5", "d2", "d4", "priorities", "last"],
    );
  });

  test("61 lines answered on a scale: 13 statements, 31 proposals, 3 yes or no, 4 effects and 10 uses the rules cover", () => {
    const lines = AI_SURVEY.pages.flatMap((p) => p.questions).filter((q) => q.type === "lines");
    const count = (scale) => lines.filter((q) => q.scale === scale).reduce((n, q) => n + q.lines.length, 0);
    assert.deepEqual(
      [count("agree"), count("support"), count("yesNoNotSure"), count("effect"), count("clarity")],
      [13, 31, 3, 4, 10],
    );
    // Every lines question names a scale the survey has.
    for (const q of lines) assert.ok(AI_SURVEY.scales[q.scale]?.length > 0, `${q.id} is answered on "${q.scale}", which is not a scale`);
    // The rules are asked about the same ten uses, in the same order, that B2 lists.
    const uses = AI_SURVEY.pages.flatMap((p) => p.questions).find((q) => q.id === "B2").options.filter((o) => !o.exclusive).map((o) => o.label);
    assert.deepEqual(lines.find((q) => q.id === "B4").lines.map((l) => l.text), uses);
  });

  test("the export has exactly the promised 116 columns, in order", () => {
    assert.equal(COLUMNS.length, 116);
    assert.deepEqual(exportHeader(), COLUMNS);
  });

  test("every code is used once, across questions, lines and pages", () => {
    const codes = [];
    for (const page of AI_SURVEY.pages) {
      for (const q of page.questions) {
        codes.push(q.id);
        if (q.type === "lines") for (const line of q.lines) codes.push(line.id);
      }
    }
    assert.equal(new Set(codes).size, codes.length, "a code is used twice");
    assert.equal(new Set(AI_SURVEY.pages.map((p) => p.id)).size, AI_SURVEY.pages.length);
    // A code is stored as a field name inside a shared document.
    for (const code of [...codes, ...AI_SURVEY.pages.map((p) => p.id)]) assert.match(code, /^[A-Za-z][A-Za-z0-9]*$/);
  });

  test("every answer's id is plain, and every scale has its answers outside the scale marked", () => {
    for (const page of AI_SURVEY.pages) {
      for (const q of page.questions) {
        const options = q.type === "single" || q.type === "multi" ? q.options : q.type === "select" ? [...q.optionGroups.flatMap((g) => g.options), ...(q.extraOptions ?? [])] : [];
        for (const option of options) assert.match(option.id, /^[a-z0-9_]+$/, `${q.id}: ${option.id}`);
      }
    }
    assert.deepEqual(AI_SURVEY.scales.agree.filter((a) => a.outsideScale).map((a) => a.id), ["dk"]);
    assert.deepEqual(AI_SURVEY.scales.support.filter((a) => a.outsideScale).map((a) => a.id), ["dk"]);
    assert.equal(AI_SURVEY.scales.agree.length, 6);
    assert.equal(AI_SURVEY.scales.support.length, 6);
    // The rules: five points, and "Not covered" beside them. The effect of AI: five points and nothing beside.
    assert.deepEqual(AI_SURVEY.scales.clarity.filter((a) => a.outsideScale).map((a) => a.id), ["not_covered"]);
    assert.equal(AI_SURVEY.scales.clarity.length, 6);
    assert.equal(AI_SURVEY.scales.effect.filter((a) => a.outsideScale).length, 0);
    assert.equal(AI_SURVEY.scales.effect.length, 5);
    // An answer's id is a cell of the export, and one scale never reuses another's word for a different thing on the same line.
    for (const [name, answers] of Object.entries(AI_SURVEY.scales)) {
      assert.equal(new Set(answers.map((a) => a.id)).size, answers.length, `${name} has an id twice`);
      for (const answer of answers) assert.match(answer.id, /^[a-z0-9_]+$/, `${name}: ${answer.id}`);
    }
  });

  test("each 'rank your top three' draws on a lines question of its own page, and is followed by its 'why' box", () => {
    let rankings = 0;
    for (const page of AI_SURVEY.pages) {
      for (const [at, q] of page.questions.entries()) {
        if (q.type !== "rank") continue;
        rankings += 1;
        const source = page.questions.find((other) => other.id === q.linesFrom);
        assert.equal(source?.type, "lines", `${q.id} points at ${q.linesFrom}`);
        assert.equal(q.places, 3);
        assert.ok(source.lines.length >= q.places, `${q.id} asks for more places than its page has lines`);
        assert.deepEqual(q.extraOptions.map((o) => o.id), ["none"]);
        // "None of these" must never be mistaken for a line.
        assert.ok(!source.lines.some((line) => line.id === "none"));
        const why = page.questions[at + 1];
        assert.deepEqual([why?.type, why?.id], ["text", `${q.id}w`]);
      }
    }
    // Every proposal page ends with one, and no other page has one.
    assert.equal(rankings, proposalPageIds().length);
    for (const id of proposalPageIds()) assert.ok(AI_SURVEY.pages.find((p) => p.id === id).questions.some((q) => q.type === "rank"), id);
  });

  test("a box shown for one answer points at a question of its own page and an answer that question has", () => {
    let conditional = 0;
    for (const page of AI_SURVEY.pages) {
      for (const q of page.questions) {
        if (q.type !== "text" || !q.showIf) continue;
        conditional += 1;
        const asked = page.questions.find((other) => other.id === q.showIf.code);
        assert.equal(asked?.type, "single", `${q.id} depends on ${q.showIf.code}`);
        assert.ok(asked.options.some((o) => o.id === q.showIf.is), `${q.showIf.code} has no answer "${q.showIf.is}"`);
      }
    }
    assert.equal(conditional, 1);
  });

  test("a word marked for emphasis is drawn bold on the page and read plain everywhere else", () => {
    const B9 = AI_SURVEY.pages.flatMap((p) => p.questions).find((q) => q.id === "B9");
    assert.match(B9.text, /\*\*required\*\*/);
    assert.equal(plainText(B9.text), "Have you been required to use an AI tool for assessed work this year?");
    assert.equal(plainText("no marks here"), "no marks here");
    // Only question text is ever marked: an option, a line or a scale's answer with asterisks would be shown as typed.
    const marked = [];
    JSON.stringify(AI_SURVEY, (key, value) => {
      if (typeof value === "string" && value.includes("**") && key !== "text") marked.push(`${key}: ${value}`);
      return value;
    });
    assert.deepEqual(marked, []);
    for (const page of AI_SURVEY.pages) for (const q of page.questions) for (const line of q.lines ?? []) assert.ok(!line.text.includes("**"), line.id);
  });

  test("every text box takes 5,000 characters, and a page with one still fits in a request", () => {
    const boxes = AI_SURVEY.pages.flatMap((p) => p.questions.filter((q) => q.type === "text").map((q) => [p.id, q]));
    assert.equal(boxes.length, 8);
    for (const [, q] of boxes) assert.equal(q.maxLength, 5000, q.id);
    // request.ts reads a body up to 16,000 characters. One box to a page, and
    // even a box of quotation marks, which double when sent, leaves room.
    const perPage = new Map();
    for (const [pageId] of boxes) perPage.set(pageId, (perPage.get(pageId) ?? 0) + 1);
    for (const [pageId, count] of perPage) assert.equal(count, 1, `${pageId} has ${count} text boxes`);
    assert.ok(JSON.stringify({ pass: "p".repeat(1024), pageId: "choices", answers: { X3o: '"'.repeat(5000) }, finish: false }).length < 16_000);
  });

  test("every value a student's sentence needs is filled, and none shows a curly bracket", () => {
    assert.deepEqual(missingBeforeOpening(), [], "a value that must be set before opening is empty");
    const survey = publicSurvey();
    for (const text of stringsIn({ start: survey.start, end: survey.end })) {
      assert.doesNotMatch(text, /\{\w+\}/, `an unfilled value in: ${text}`);
    }
    // The notice, as its page shows it: the organiser's sentence that applies,
    // and a sentence marked `onlyIf` only while that value is true.
    const values = AI_SURVEY.values;
    for (const section of AI_SURVEY.privacyNotice.sections) {
      const body = typeof section.body === "string" ? section.body : section.body ? (values.unionCoBadged ? section.body.ifUnionCoBadged : section.body.otherwise) : "";
      const sentences = (section.sentences ?? []).filter((s) => !s.onlyIf || values[s.onlyIf] === true).map((s) => s.text);
      for (const text of [body, ...sentences, ...stringsIn(section.table ?? []), ...(section.list ?? [])]) {
        assert.doesNotMatch(fillValues(text), /\{\w+\}/, `an unfilled value in the notice: ${text}`);
      }
    }
    // A name with no value is left showing, never dropped.
    assert.equal(fill("by {who}", { who: null }), "by {who}");
  });

  test("the writing rules: no em or en dash, and none of the words a student should never read", () => {
    const shown = stringsIn({ ...AI_SURVEY, admin: null, export: null, shortLinks: null, id: null, values: null });
    for (const text of shown) {
      assert.doesNotMatch(text, /[–—]/, `a dash in: ${text}`);
      assert.doesNotMatch(text, /\b(respondent|questionnaire|verify|token|hash|submission)\b/i, `a word students never read: ${text}`);
    }
  });

  test("the words around the questions say what the survey does, and promise nothing that is done with its results", () => {
    // The survey is the society's own, and its results are published as totals
    // for anybody to use. Its QUESTIONS ask about proposals and a student
    // vote, and those are locked. The words around them (the start screen,
    // the email step, the end screen, the code email, the notice) promise no
    // petition and no vote, and say nothing of who drafts anything.
    // docs/ai-survey-changes.md keeps what they said before.
    const survey = publicSurvey();
    const around = stringsIn({
      title: survey.title,
      ui: survey.ui,
      start: survey.start,
      support: survey.support,
      emailCheck: survey.emailCheck,
      end: survey.end,
      codeEmail: AI_SURVEY.codeEmail,
    });
    // The notice, as its page shows it.
    const values = AI_SURVEY.values;
    around.push(AI_SURVEY.privacyNotice.title);
    for (const section of AI_SURVEY.privacyNotice.sections) {
      const body = typeof section.body === "string" ? section.body : section.body ? (values.unionCoBadged ? section.body.ifUnionCoBadged : section.body.otherwise) : "";
      const sentences = (section.sentences ?? []).filter((s) => !s.onlyIf || values[s.onlyIf] === true).map((s) => s.text);
      around.push(section.heading, body, ...sentences, ...stringsIn(section.table ?? []), ...(section.list ?? []));
    }
    assert.ok(around.length > 100, "the words around the questions were not found");
    for (const text of around) {
      assert.doesNotMatch(text, /petition|campaign|\bvot(e|es|ed|ing|er|ers)\b|proposal|drafting/i, `outside the questions, the survey says: ${text}`);
    }
    // And the page is handed neither word at all, as text or as the name of a field.
    assert.doesNotMatch(JSON.stringify(survey), /petition|campaign/i);
  });

  test("the notice names a service only while the survey uses it", () => {
    const services = AI_SURVEY.privacyNotice.sections.find((s) => s.heading === "Services we use");
    const gated = Object.fromEntries(services.sentences.filter((s) => s.onlyIf).map((s) => [s.onlyIf, s.text]));
    assert.match(gated.botCheck, /reCAPTCHA/);
    assert.match(gated.commentsGroupedWithClaude, /Claude/);
    // Today: the bot check is on, and comments are grouped by hand.
    assert.equal(AI_SURVEY.values.botCheck, true);
    assert.equal(AI_SURVEY.values.commentsGroupedWithClaude, false);
  });

  test("the notes that are for the team are not in the repository's copy", () => {
    const keys = new Set();
    JSON.stringify(AI_SURVEY, (key, value) => (keys.add(key), value));
    for (const key of ["teamNote", "valueNotes", "about", "leans", "who", "clause"]) {
      assert.ok(!keys.has(key), `the definition carries "${key}", which is for the team`);
    }
  });

  test("what a browser is handed carries no results name, admin word or export word", () => {
    const text = JSON.stringify(publicSurvey());
    assert.ok(!text.includes('"short"'), "a line's short name, for results tables, reached the page");
    assert.ok(!text.includes(AI_SURVEY.admin.clearConfirmLabel));
    assert.ok(!text.includes(AI_SURVEY.codeEmail.textBody[0]), "the code email's words reached the page");
    assert.equal(publicSurvey().end.newsletterHref, "https://naisi.uk/stay-in-touch", "the newsletter link carries something after its address");
  });

  test("it closes as the clock leaves 23:59 in London on Sunday 29 November 2026", () => {
    assert.equal(closesAtInstant().toISOString(), "2026-11-30T00:00:00.000Z");
    // A summer close is worked out, not assumed: London is an hour ahead of UTC in July.
    const summer = { ...AI_SURVEY, values: { ...AI_SURVEY.values, closesAt: "2027-07-01T23:59" } };
    assert.equal(closesAtInstant(summer).toISOString(), "2027-07-01T23:00:00.000Z");
  });

  test("the page a browser builds its order from agrees with the server's", () => {
    const order = ["d5", "d4", "d1", "d3", "d2"];
    assert.deepEqual(sequenceOf(publicSurvey().pages, order), pageSequence(order));
    assert.equal(isProposalOrder(order), true);
    assert.equal(isProposalOrder(["d5", "d4", "d1", "d3"]), false);
    assert.equal(isProposalOrder(["d5", "d4", "d1", "d3", "d3"]), false);
    assert.equal(isProposalOrder(["d5", "d4", "d1", "d3", "about1"]), false);
  });
});

// ---------------------------------------------------------------------------
// 2. Addresses and codes
// ---------------------------------------------------------------------------

describe("which addresses count", () => {
  const ONE = "someone@nottingham.ac.uk";
  for (const typed of ["someone@nottingham.ac.uk", "  Someone@Nottingham.AC.UK ", "someone+survey@nottingham.ac.uk", "SOMEONE+a+b@nottingham.ac.uk"]) {
    test(`${JSON.stringify(typed)} is one student`, () => assert.equal(normaliseUniversityAddress(typed), ONE));
  }
  for (const typed of [
    "someone@gmail.com",
    "someone@cs.nottingham.ac.uk",
    "someone@nottingham.ac.uk.",
    "someone@nottingham.ac.uk.evil.example",
    "someone@evil-nottingham.ac.uk",
    "someone@nottingham.edu.cn",
    "@nottingham.ac.uk",
    "+tag@nottingham.ac.uk",
    "a b@nottingham.ac.uk",
    "a@b@nottingham.ac.uk",
    'a"b@nottingham.ac.uk',
    "a\r\nBcc: x@example.com@nottingham.ac.uk",
    "a..b@nottingham.ac.uk",
    `${"a".repeat(65)}@nottingham.ac.uk`,
    "",
    null,
    42,
    ["someone@nottingham.ac.uk"],
  ]) {
    test(`${JSON.stringify(typed)} is refused`, () => assert.equal(normaliseUniversityAddress(typed), null));
  }

  test("a code is six digits, with the spaces a paste may add taken out", () => {
    assert.equal(normaliseCode("482193"), "482193");
    assert.equal(normaliseCode(" 482 193 "), "482193");
    assert.equal(normaliseCode("048219"), "048219");
    for (const bad of ["48219", "4821930", "48219a", "", null, 482193]) assert.equal(normaliseCode(bad), null);
  });

  test("a new code is six digits, leading zeros kept", () => {
    for (let i = 0; i < 200; i++) assert.match(newCode(), /^\d{6}$/);
  });
});

// ---------------------------------------------------------------------------
// 3. A saved page
// ---------------------------------------------------------------------------

describe("a saved page", () => {
  const ok = (pageId, answers) => {
    const result = checkPageAnswers(pageId, answers);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.answers;
  };
  const refused = (pageId, answers) => assert.equal(checkPageAnswers(pageId, answers).ok, false);

  test("every question can be skipped: an empty page is a page", () => {
    for (const page of AI_SURVEY.pages) assert.deepEqual(ok(page.id, {}), {});
  });

  test("a skipped question is absent, however the page spelt 'nothing'", () => {
    assert.deepEqual(ok("use", { B1: "", B2: [], B3a: null }), {});
    assert.deepEqual(ok("d1", { M1: [], M1w: "  " }), {});
    assert.deepEqual(ok("last", { G1: "   ", G2: false }), {});
  });

  test("known codes and known answers are kept as given", () => {
    assert.deepEqual(ok("about1", { A1: "ug", A2: "maths" }), { A1: "ug", A2: "maths" });
    assert.deepEqual(ok("stand", { C1: "sa", C2: "dk" }), { C1: "sa", C2: "dk" });
    assert.deepEqual(ok("d1", { P1: "ss", P2a: "dk", M1: ["P2b"] }), { P1: "ss", P2a: "dk", M1: ["P2b"] });
    assert.deepEqual(ok("d1", { M1: ["none"] }), { M1: ["none"] });
    assert.deepEqual(ok("use", { B3a: "better", B3d: "much_worse" }), { B3a: "better", B3d: "much_worse" });
    assert.deepEqual(ok("rules", { B4a: "very_clear", B4j: "not_covered" }), { B4a: "very_clear", B4j: "not_covered" });
    assert.deepEqual(ok("last", { G1: " One thing. ", G2: true }), { G1: "One thing.", G2: true });
  });

  test("a multi-choice answer is stored in the survey's order, not the order of ticking", () => {
    assert.deepEqual(ok("use", { B2: ["code", "explain"] }), { B2: ["explain", "code"] });
    assert.deepEqual(ok("use", { B2: ["none"] }), { B2: ["none"] });
  });

  test("a ranking is kept in the order given, because the order is the answer", () => {
    assert.deepEqual(ok("d1", { M1: ["P6", "P1", "P3"] }), { M1: ["P6", "P1", "P3"] });
    assert.deepEqual(ok("d1", { M1: ["P3", "P6"] }), { M1: ["P3", "P6"] });
    refused("d1", { M1: ["P1", "P2a", "P3", "P4"] }); // four, of three places
    refused("d1", { M1: ["P1", "P1"] }); // a line twice
    refused("d1", { M1: ["none", "P1"] }); // "None of these" beside a ranking
    refused("d1", { M1: ["P7"] }); // another page's line
    refused("d1", { M1: "P1" }); // not a list
    refused("d1", { M1: [1, 2] });
  });

  test("a box shown for one answer is stored only with that answer", () => {
    assert.deepEqual(ok("choices", { X3: "other", X3o: "Ask students first." }), { X3: "other", X3o: "Ask students first." });
    assert.deepEqual(ok("choices", { X3: "stop" }), { X3: "stop" });
    refused("choices", { X3: "stop", X3o: "Ask students first." });
    refused("choices", { X3o: "Ask students first." });
  });

  test("anything else is refused whole, never trimmed to fit", () => {
    refused("nowhere", {});
    refused("about1", { A1: "ug", ZZ: "x" });
    refused("about1", { A1: "phd" });
    refused("about1", { A1: ["ug"] });
    refused("about1", { C1: "sa" }); // a real code, on the wrong page
    refused("stand", { C1: "ss" }); // the other scale's answer
    refused("stand", { C1: 6 }); // "Don't know" is never a sixth point
    refused("use", { B3a: "sa" }); // the agree scale's answer, on the effect scale
    refused("rules", { B4a: "dk" });
    refused("use", { B2: ["none", "code"] });
    refused("use", { B2: ["code", "code"] });
    refused("use", { B2: "code" });
    refused("last", { G1: "x".repeat(5001) });
    refused("last", { G2: "yes" });
    refused("about1", null);
    refused("about1", []);
    refused("about1", "A1=ug");
    refused("about1", Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i}`, "x"])));
  });

  test("the comment may be exactly its limit, counted as the page's box counts it", () => {
    assert.equal(ok("last", { G1: "x".repeat(5000) }).G1.length, 5000);
    assert.equal(ok("last", { G1: `${"x".repeat(2499)}\r\n${"y".repeat(2500)}` }).G1.length, 5000);
  });

  test("a name every object carries is not a code", () => {
    refused("about1", JSON.parse('{"__proto__":"ug"}'));
    refused("about1", { constructor: "ug" });
    refused("constructor", {});
  });
});

// ---------------------------------------------------------------------------
// 4. The export
// ---------------------------------------------------------------------------

describe("the export", () => {
  const whole = {
    surveyVersion: 1,
    finished: true,
    proposalPageOrder: ["d3", "d1", "d5", "d2", "d4"],
    pages: Object.fromEntries(AI_SURVEY.pages.map((p) => [p.id, {}])),
  };
  const cell = (set, name) => exportRow(set)[COLUMNS.indexOf(name)];

  test("a page never reached is not_seen in every one of its columns, and nowhere else", () => {
    const stopped = { ...whole, finished: false, pages: { about1: { A1: "ug" }, use: {} } };
    const row = exportRow(stopped);
    assert.equal(row.length, COLUMNS.length);
    assert.equal(row[0], "0");
    for (const column of answerColumns()) {
      const value = row[COLUMNS.indexOf(column.name)];
      const reached = column.pageId === "about1" || column.pageId === "use";
      assert.equal(value === "not_seen", !reached, `${column.name} read ${JSON.stringify(value)}`);
    }
    assert.equal(cell(stopped, "A1"), "ug");
  });

  test("a skipped question is an empty cell", () => {
    for (const name of COLUMNS.slice(1)) assert.equal(cell(whole, name), "", name);
    assert.equal(cell(whole, "finished"), "1");
  });

  test("a multi-choice question is one column an option, 1 or 0", () => {
    const set = { ...whole, pages: { ...whole.pages, use: { B2: ["explain", "code"] } } };
    assert.deepEqual(
      COLUMNS.filter((c) => c.startsWith("B2_")).map((c) => cell(set, c)),
      ["1", "0", "0", "0", "0", "0", "0", "0", "0", "1", "0"],
    );
  });

  test("a tick is 1 when ticked and empty when not, and 'Don't know' is dk", () => {
    const set = { ...whole, pages: { ...whole.pages, last: { G2: true, G1: "said" }, stand: { C1: "dk" }, d1: { P1: "dk", M1: ["none"] } } };
    assert.equal(cell(set, "G2"), "1");
    assert.equal(cell(whole, "G2"), "");
    assert.equal(cell(set, "C1"), "dk");
    assert.equal(cell(set, "P1"), "dk");
    assert.deepEqual([cell(set, "M1_1"), cell(set, "M1_2"), cell(set, "M1_3")], ["none", "", ""]);
  });

  test("a ranking is one column a place, holding that place's line, and empty for a place left unranked", () => {
    const set = { ...whole, pages: { ...whole.pages, d1: { M1: ["P6", "P1"], M1w: "Because of my data." }, d3: { M3: ["P15", "P13", "P17"] } } };
    assert.deepEqual([cell(set, "M1_1"), cell(set, "M1_2"), cell(set, "M1_3"), cell(set, "M1w")], ["P6", "P1", "", "Because of my data."]);
    assert.deepEqual([cell(set, "M3_1"), cell(set, "M3_2"), cell(set, "M3_3")], ["P15", "P13", "P17"]);
    // Skipped on a saved page: empty. On a page never reached: not_seen.
    assert.deepEqual([cell(set, "M2_1"), cell(set, "M2_3")], ["", ""]);
    const stopped = { ...whole, pages: { about1: {} } };
    assert.deepEqual([cell(stopped, "M1_1"), cell(stopped, "M1_3"), cell(stopped, "M1w")], ["not_seen", "not_seen", "not_seen"]);
  });

  test("the file has a header and a row a set, in an order that is not the order stored", () => {
    const sets = ["ug", "pgt", "pgr", "foundation"].map((A1) => ({ ...whole, pages: { ...whole.pages, about1: { A1 } } }));
    const csv = buildExport(sets, (n) => n - 1);
    const lines = csv.trimEnd().split("\n");
    assert.equal(lines.length, 5);
    assert.equal(lines[0], COLUMNS.join(","));
    assert.deepEqual(lines.slice(1).map((l) => l.split(",")[1]).sort(), ["foundation", "pgr", "pgt", "ug"]);
    const reversed = buildExport(sets, () => 0).trimEnd().split("\n").slice(1).map((l) => l.split(",")[1]);
    assert.notDeepEqual(reversed, ["ug", "pgt", "pgr", "foundation"], "the rows came out in the order they were stored");
    // The proposal-page order is kept on the set and never exported.
    assert.ok(!csv.includes("d3"));
  });

  test("a comment cannot run as a formula when the file is opened", () => {
    const set = { ...whole, pages: { ...whole.pages, last: { G1: '=HYPERLINK("https://example.com","x")' } } };
    const row = buildExport([set], () => 0).split("\n")[1];
    assert.ok(row.includes('"\t=HYPERLINK('), row);
  });

  test("the shuffle keeps every item exactly once", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffled(items, (n) => Math.floor(Math.random() * n));
    assert.deepEqual([...out].sort((a, b) => a - b), items);
  });
});

// ---------------------------------------------------------------------------
// 5. The pass
// ---------------------------------------------------------------------------

/** What a browser makes for itself before it checks its code. */
const newClaim = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

describe("the pass a browser holds", () => {
  const key = Buffer.from("k".repeat(32));
  const now = Date.UTC(2026, 10, 17, 12);
  const pass = { epoch: "abc123", id: newPassId(), shard: 3, order: ["d2", "d1", "d4", "d3", "d5"], expiresAt: now + PASS_LIFETIME_MS };

  test("what is sealed is what is opened", () => {
    assert.deepEqual(openPass(sealPass(pass, key), key, now), pass);
  });

  test("a browser cannot write one: a changed pass, a pass from another key and a made-up one are all refused", () => {
    const token = sealPass(pass, key);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "abc123", i: pass.id, s: 0, o: pass.order, x: now + 10 * PASS_LIFETIME_MS })).toString("base64url");
    assert.equal(openPass(`${forged}.${signature}`, key, now), null);
    // A changed signature: its FIRST character, to one it was not. (The last
    // characters of a signature carry spare bits, so fixed characters put
    // there can spell the same signature, about one run in a thousand.)
    const changed = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    assert.equal(openPass(`${payload}.${changed}`, key, now), null);
    assert.equal(openPass(token, Buffer.from("x".repeat(32)), now), null);
    assert.equal(openPass(payload, key, now), null);
    assert.equal(openPass(`${token}.${signature}`, key, now), null);
    for (const junk of ["", ".", "a.b", null, undefined, 7, {}, "x".repeat(2000)]) assert.equal(openPass(junk, key, now), null);
  });

  test("it stops working 24 hours after it was made, and each save gives it another 24", () => {
    const token = sealPass(pass, key);
    assert.ok(openPass(token, key, now + PASS_LIFETIME_MS - 1));
    assert.equal(openPass(token, key, now + PASS_LIFETIME_MS), null);
    const later = now + 20 * 60 * 60 * 1000;
    const renewed = sealPass(renewPass(pass, later), key);
    assert.ok(openPass(renewed, key, now + PASS_LIFETIME_MS + 1));
    assert.equal(openPass(renewed, key, later + PASS_LIFETIME_MS), null);
  });

  test("a pass made from a browser's claim is the same every time it is asked for, and another claim's is another", () => {
    const claim = newClaim(); // 32 random bytes as 64 hex characters: the shape a browser makes
    const place = { epoch: "abc123", shards: { from: 0, count: 16 }, pageIds: ["d1", "d2", "d3", "d4", "d5"] };
    const one = passFromClaim(claim, key, place, now);
    assert.deepEqual(passFromClaim(claim, key, place, now), one);
    assert.deepEqual({ ...passFromClaim(claim, key, place, now + 5000), expiresAt: 0 }, { ...one, expiresAt: 0 });
    assert.equal(one.expiresAt, now + PASS_LIFETIME_MS);
    assert.deepEqual([...one.order].sort(), place.pageIds);
    assert.ok(one.shard >= 0 && one.shard < 16);
    const other = passFromClaim(newClaim(), key, place, now);
    assert.notEqual(other.id, one.id);
    // Under another key the same claim leads somewhere else.
    assert.notEqual(passFromClaim(claim, Buffer.from("j".repeat(32)), place, now).id, one.id);
    // What the server keeps of a claim is a hash, and it is not the pass.
    assert.match(claimHash(claim), /^[0-9a-f]{64}$/);
    assert.ok(!one.id.includes(claim) && !claimHash(claim).includes(answerSetKey(one)));
  });

  test("the pages and the document a claim leads to are spread evenly", () => {
    const firstPage = new Map();
    const shard = new Map();
    const place = { epoch: "e", shards: { from: 0, count: 16 }, pageIds: ["d1", "d2", "d3", "d4", "d5"] };
    for (let n = 0; n < 4000; n++) {
      const pass = passFromClaim(newClaim(), key, place, now);
      firstPage.set(pass.order[0], (firstPage.get(pass.order[0]) ?? 0) + 1);
      shard.set(pass.shard, (shard.get(pass.shard) ?? 0) + 1);
    }
    assert.equal(firstPage.size, 5);
    assert.equal(shard.size, 16);
    // 800 expected for each page and 250 for each document; far outside
    // these bounds would be a draw that favours some.
    for (const [page, count] of firstPage) assert.ok(count > 680 && count < 920, `${page} came first ${count} times in 4000`);
    for (const [index, count] of shard) assert.ok(count > 180 && count < 320, `document ${index} took ${count} of 4000`);
  });

  test("a claim is 32 random bytes as 64 hex characters, and nothing else is one", () => {
    assert.equal(isClaim(newClaim()), true);
    for (const bad of ["", "short", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), `${"a".repeat(63)}/`, null, 7, ["a".repeat(64)]]) {
      assert.equal(isClaim(bad), false);
    }
  });

  test("an answer set is kept under a hash of the pass, never the pass", () => {
    const stored = answerSetKey(pass);
    assert.match(stored, /^[A-Za-z0-9_-]{22}$/);
    assert.ok(!pass.id.includes(stored) && !stored.includes(pass.id.slice(0, 10)));
    assert.equal(answerSetKey({ id: pass.id }), stored);
    assert.notEqual(answerSetKey({ id: newPassId() }), stored);
  });
});

// ---------------------------------------------------------------------------
// 6. Stages, and the shared documents
// ---------------------------------------------------------------------------

describe("stages and storage", () => {
  const closes = closesAtInstant().getTime();
  const state = (over) => ({ stage: "open", epoch: "e", passKey: "", pilotKey: "", accepted: 0, shardDocs: 16, adminUids: [], closedEarly: null, lastLevel: null, usedListDeleted: null, codeCeiling: null, ...over });

  test("an open survey closes itself at its closing time, with thirty minutes for anybody under way", () => {
    assert.deepEqual(stageAt(state({}), closes - 1), { stage: "open", takesNewPeople: true, takesSaves: true });
    assert.deepEqual(stageAt(state({}), closes), { stage: "closed", takesNewPeople: false, takesSaves: true });
    assert.deepEqual(stageAt(state({}), closes + CLOSING_GRACE_MS - 1), { stage: "closed", takesNewPeople: false, takesSaves: true });
    assert.deepEqual(stageAt(state({}), closes + CLOSING_GRACE_MS), { stage: "closed", takesNewPeople: false, takesSaves: false });
  });

  test("closed by hand: nobody new at once, thirty minutes from the press", () => {
    const pressed = closes - 5 * 24 * 60 * 60 * 1000;
    const closed = state({ stage: "closed", closedEarly: Timestamp.fromMillis(pressed) });
    assert.equal(stageAt(closed, pressed + 1).takesNewPeople, false);
    assert.equal(stageAt(closed, pressed + CLOSING_GRACE_MS - 1).takesSaves, true);
    assert.equal(stageAt(closed, pressed + CLOSING_GRACE_MS).takesSaves, false);
  });

  test("pilot takes people and saves", () => {
    assert.deepEqual(stageAt(state({ stage: "pilot" }), closes - 1), { stage: "pilot", takesNewPeople: true, takesSaves: true });
  });

  test("all sixteen shared documents from the first person on, so a document's number is not a clock", () => {
    for (const accepted of [0, 1, 47, 48, 128, 320, PEOPLE_PER_GENERATION - 1]) {
      assert.deepEqual(shardsInUse(accepted), { from: 0, count: 16 }, `after ${accepted} people`);
    }
    // A second sixteen only when the first is full.
    assert.deepEqual(shardsInUse(PEOPLE_PER_GENERATION), { from: 16, count: 16 });
  });

  test("the most people one shared document can hold, each with every answer given, stays inside Firestore's limits", () => {
    // The fullest answer set the survey allows: every question answered, every
    // tick box ticked, every ranking full, with the longest answer each takes.
    const longest = (ids) => ids.reduce((a, b) => (b.length > a.length ? b : a), "");
    const pages = {};
    for (const page of AI_SURVEY.pages) {
      const answers = {};
      for (const q of page.questions) {
        if (q.type === "single") answers[q.id] = longest(q.options.map((o) => o.id));
        else if (q.type === "select") answers[q.id] = longest([...q.optionGroups.flatMap((g) => g.options), ...(q.extraOptions ?? [])].map((o) => o.id));
        else if (q.type === "multi") answers[q.id] = q.options.filter((o) => !o.exclusive).map((o) => o.id);
        else if (q.type === "lines") for (const line of q.lines) answers[line.id] = longest(AI_SURVEY.scales[q.scale].map((a) => a.id));
        else if (q.type === "rank") answers[q.id] = page.questions.find((o) => o.id === q.linesFrom).lines.slice(0, q.places).map((l) => l.id);
        else if (q.type === "tick") answers[q.id] = true;
        // Text boxes are left out here and budgeted below.
      }
      pages[page.id] = answers;
    }
    const full = { surveyVersion: AI_SURVEY.version, finished: true, proposalPageOrder: proposalPageIds(), pages };

    // Index entries, as Firestore counts them when nothing is exempt. Measured
    // against the database on 17 November 2026 with scratch documents: two
    // for every field whatever it holds (19,999 plain fields fit in one map,
    // 9,999 one-field maps do), and two more for every item of a list (4,999
    // lists of three fit).
    let entries = 2; // the set itself is a field of the shared document
    let boxes = 0;
    const walk = (value) => {
      for (const inner of Object.values(value)) {
        entries += 2;
        if (Array.isArray(inner)) entries += 2 * inner.length;
        else if (inner && typeof inner === "object") walk(inner);
      }
    };
    walk(full);
    for (const page of AI_SURVEY.pages) for (const q of page.questions) if (q.type === "text") boxes += 1;
    entries += 2 * boxes;

    // People are spread over a generation's documents at random, so one can
    // hold more than its share: four standard deviations above the average.
    assert.equal(PEOPLE_PER_GENERATION, SHARDS_PER_GENERATION * PEOPLE_PER_DOCUMENT);
    const most = Math.ceil(PEOPLE_PER_DOCUMENT + 4 * Math.sqrt(PEOPLE_PER_DOCUMENT));
    assert.ok(entries * most <= 40_000, `${entries} index entries a set, ${most} sets: ${entries * most} of 40,000`);

    // Size: the answers themselves, and an average of 4,000 characters of
    // comment for EVERY person in the fullest document, far above any survey.
    const bytes = Buffer.byteLength(JSON.stringify(full)) + 4000;
    assert.ok(bytes * most <= 1_000_000, `${bytes} bytes a set, ${most} sets: ${bytes * most} of 1,000,000`);
  });

  test("the key that signs passes is made from the secret, never read from the survey's record", () => {
    const record = state({ stage: "open", passKey: "cGFzcw==", pilotKey: "cGlsb3Q=" });
    const before = process.env.AI_SURVEY_EMAIL_KEY;
    try {
      delete process.env.AI_SURVEY_EMAIL_KEY;
      assert.equal(passSigningKey(record), null, "an open survey with no secret can still sign a pass");
      process.env.AI_SURVEY_EMAIL_KEY = "a".repeat(48);
      const one = passSigningKey(record);
      process.env.AI_SURVEY_EMAIL_KEY = "b".repeat(48);
      const two = passSigningKey(record);
      assert.ok(one && two && !one.equals(two), "the signing key does not depend on the secret");
      assert.ok(!one.equals(Buffer.from(record.passKey, "base64")));
      // A record with no value of its own, or no epoch, signs nothing.
      assert.equal(passSigningKey({ ...record, passKey: "" }), null);
      assert.equal(passSigningKey({ ...record, epoch: "" }), null);
      // Pilot, with no secret: the stand-in, so the survey can be tried.
      delete process.env.AI_SURVEY_EMAIL_KEY;
      assert.ok(passSigningKey({ ...record, stage: "pilot" }));
    } finally {
      if (before === undefined) delete process.env.AI_SURVEY_EMAIL_KEY;
      else process.env.AI_SURVEY_EMAIL_KEY = before;
    }
  });

  test("an address has three hashes that cannot be matched to each other, and none is the address", () => {
    const key = Buffer.from("k".repeat(32));
    const one = hashAddress("someone@nottingham.ac.uk", key);
    assert.equal(new Set([one.used, one.pending, one.limit]).size, 3);
    for (const hash of Object.values(one)) assert.match(hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(hashAddress("someone@nottingham.ac.uk", key), one);
    assert.notEqual(hashAddress("someone@nottingham.ac.uk", Buffer.from("j".repeat(32))).used, one.used);
    assert.notEqual(hashAddress("x@nottingham.ac.uk", key).used, one.used);
  });
});

// ---------------------------------------------------------------------------
// 7. The email check's steps
// ---------------------------------------------------------------------------

describe("the email check's steps", () => {
  const { afterSend, alreadyHaveCode, arrive, asksForAddress, CODE_MARK, errorBox, firstStep, LEAD_WORDS, opening } = steps;
  const errors = AI_SURVEY.emailCheck.errors;
  const flow = stripSource(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src/features/aiSurvey/SurveyFlow.tsx"), "utf8"),
    { keepStrings: true },
  );
  /** Every step a page can be at, with every way of arriving at the code step. */
  const EVERY_STEP = [
    { at: "start" }, { at: "declined" }, { at: "comingBack" }, { at: "address" },
    { at: "code", lead: "sent" }, { at: "code", lead: "sentRecently" }, { at: "code", lead: "comeBack" },
    { at: "already" }, { at: "in" }, { at: "page", index: 0 }, { at: "end" }, { at: "closed" },
  ];
  const codeStep = (lead) => ({ at: "code", lead });

  test("the three sentences, word for word, reach the page with the rest of the email check", () => {
    const words = publicSurvey().emailCheck;
    assert.equal(words.comeBackToCode, "This page reloaded, so type your University email again, then the code we sent you.");
    assert.equal(words.codeSentRecently, "We sent you a code less than a minute ago. Enter it below.");
    assert.equal(words.haveCodeLink, "I already have a code");
    assert.deepEqual(LEAD_WORDS, { sent: "codeSent", sentRecently: "codeSentRecently", comeBack: "comeBackToCode" });
    // The sentences around them stay as they were.
    assert.equal(words.codeSent, "We've sent a 6-digit code to your University email. It works for 15 minutes.");
    assert.equal(words.errors.askedAgainTooSoon, "We've just sent you a code. Wait a minute before asking for another.");
    assert.equal(words.errors.tooManyCodesToday, "You've asked for several codes today. Try again tomorrow, or write to ai-safety@uonsu.com.");
    assert.equal(words.errors.notUniversityAddress, "Use your University email, ending @nottingham.ac.uk.");
  });

  test("a fresh load opens at the start screen, and comes back to the code box only with the mark, no kept pass and a survey taking people", () => {
    assert.deepEqual(opening({ closed: false, hash: "", passKept: false }), { comeBack: false, dropMark: false });
    assert.deepEqual(opening({ closed: false, hash: "#code", passKept: false }), { comeBack: true, dropMark: false });
    // A kept pass always wins, and the mark comes off.
    assert.deepEqual(opening({ closed: false, hash: "#code", passKept: true }), { comeBack: false, dropMark: true });
    assert.deepEqual(opening({ closed: false, hash: "", passKept: true }), { comeBack: false, dropMark: false });
    // A closed survey says so, with or without the mark, and the mark comes off.
    assert.deepEqual(opening({ closed: true, hash: "#code", passKept: false }), { comeBack: false, dropMark: true });
    assert.deepEqual(opening({ closed: true, hash: "", passKept: false }), { comeBack: false, dropMark: false });
    // The reload after the right code is its own mark, and is not this one.
    assert.deepEqual(opening({ closed: false, hash: "#in", passKept: true }), { comeBack: false, dropMark: false });
    // Only the one word, exactly.
    for (const hash of ["#Code", "#code2", "#codes", "#code?x=1", "#/code", "code", "#"]) {
      assert.equal(opening({ closed: false, hash, passKept: false }).comeBack, false, hash);
    }
    // The page's load acts on exactly this: the fragment as it is, the kept
    // pass when the survey is open, the come-back held in memory, and the
    // mark taken off when it is not acted on. Before anything else it does.
    assert.match(
      flow,
      /useEffect\(\(\) => \{\s*const pass = closed \? null : keptPass\(\);\s*const opened = opening\(\{ closed, hash: window\.location\.hash, passKept: pass !== null \}\);\s*comeBack\.current = opened\.comeBack;\s*if \(opened\.dropMark\) markAddress\(null\);\s*if \(closed\) return;/,
    );
    // The kept pass read there is the one the page asks the server about.
    assert.match(flow, /if \(!pass\) \{\s*clearMark\(\);\s*return;\s*\}[\s\S]{0,200}callSurvey<[^>]*>\("session", \{ pass \}\)/);
  });

  test("the start screen asks everything again: no load opens past it, and its button alone leads to the code box", () => {
    // The first screen is the start screen, or the closed screen, and the
    // page draws its first screen from this and nothing else: the address and
    // the browser's storage are read only after it is drawn.
    assert.deepEqual(firstStep(false), { at: "start" });
    assert.deepEqual(firstStep(true), { at: "closed" });
    assert.match(flow, /const \[step, setStep\] = useState<Step>\(\(\) => firstStep\(closed\)\);/);
    assert.equal([...flow.matchAll(/useState<Step>/g)].length, 1);
    // The button asks for the email step and is given the code box, once.
    const first = arrive({ at: "address" }, true);
    assert.deepEqual(first, { step: codeStep("comeBack"), comeBack: false, mark: "#code" });
    assert.deepEqual(arrive({ at: "address" }, first.comeBack), { step: { at: "address" }, comeBack: false, mark: null });
    // "No" leads to the closing screen, and the code box is not waiting behind it.
    assert.deepEqual(arrive({ at: "declined" }, true), { step: { at: "declined" }, comeBack: false, mark: null });
    assert.deepEqual(arrive({ at: "start" }, false), { step: { at: "start" }, comeBack: false, mark: null });
    // While still on the start screen, a further reload comes back too.
    assert.deepEqual(arrive({ at: "start" }, true), { step: { at: "start" }, comeBack: true, mark: "#code" });
    // On the page itself: the button is the start screen's only way on, it
    // waits for the ticks and consent, and nothing in the page goes to the
    // code step but what emailSteps.ts decides.
    const startScreen = flow.slice(flow.indexOf('if (step.at === "start") {'), flow.indexOf('if (step.at === "declined") {'));
    assert.equal([...startScreen.matchAll(/\bgo\(/g)].length, 1);
    assert.match(startScreen, /disabled=\{!hydrated \|\| !canStart\}\s*aria-describedby="ticks-needed"\s*onClick=\{\(\) => go\(consent === "no" \? \{ at: "declined" \} : \{ at: "address" \}\)\}/);
    assert.doesNotMatch(flow, /at: "code"/, "the page goes to the code step by itself");
    assert.match(flow, /const arrival = arrive\(next, comeBack\.current\);\s*comeBack\.current = arrival\.comeBack;\s*markAddress\(arrival\.mark\);\s*setStep\(arrival\.step\);/);
    // The setStep calls outside `go` are the coming-back answers to a kept pass, never the email check.
    for (const call of flow.matchAll(/\bsetStep\(([^;]*)\);/g)) {
      assert.match(call[1], /^arrival\.step$|"in"|"comingBack"|"closed"/, `setStep(${call[1]})`);
      assert.doesNotMatch(call[1], /"code"|"address"/);
    }
  });

  test("the address carries the mark at the code step and nowhere else, and the mark is one word", () => {
    assert.equal(CODE_MARK, "#code");
    for (const step of EVERY_STEP) {
      for (const comeBack of [false, true]) {
        const arrival = arrive(step, comeBack);
        assert.ok(arrival.mark === null || arrival.mark === CODE_MARK, JSON.stringify(arrival));
        if (arrival.step.at === "code") assert.equal(arrival.mark, CODE_MARK);
        else if (arrival.step.at !== "start") assert.equal(arrival.mark, null, `${arrival.step.at} keeps the mark`);
        // Leaving the start screen for anywhere ends the come-back.
        if (arrival.step.at !== "start") assert.equal(arrival.comeBack, false);
      }
    }
    // In the page: the address is written with the mark or nothing, and with
    // nothing the person typed. Two fixed fragments, and replaceState for the
    // code step's, so no history entry is added.
    const writes = [...flow.matchAll(/window\.location\.hash = ([^;]+);/g)].map((m) => m[1]).sort();
    assert.deepEqual(writes, ['""', "JUST_IN"]);
    const replaces = [...flow.matchAll(/replaceState\((.*?)\);/g)].map((m) => m[1]).sort();
    assert.deepEqual(replaces, ['null, "", wanted', 'null, "", window.location.href.split("#")[0]']);
    assert.match(flow, /function markAddress\(mark: typeof CODE_MARK \| null\) \{\s*const bare = window\.location\.href\.split\("#"\)\[0\];\s*const wanted = mark \? `\$\{bare\}\$\{mark\}` : bare;\s*if \(window\.location\.href !== wanted\) window\.history\.replaceState\(null, "", wanted\);\s*\}/);
    const marks = [...flow.matchAll(/markAddress\(([^)]*)\)/g)].map((m) => m[1]).filter((arg) => !arg.startsWith("mark:"));
    assert.deepEqual([...new Set(marks)].sort(), ["arrival.mark", "null"]);
    // Past the right code the mark comes off before the one reload, so going
    // back to the entry the page leaves behind does not open the code box.
    assert.match(flow, /markAddress\(null\);\s*window\.location\.hash = JUST_IN;\s*window\.location\.reload\(\);/);
  });

  test("Send my code on the email step: a code leads to the code box, and asking again inside the minute does too", () => {
    assert.deepEqual(afterSend("address", { ok: true }, errors), { go: codeStep("sent"), error: null, clearCode: true });
    // A note, not an error: the code sent a moment ago is the one to type.
    assert.deepEqual(afterSend("address", { ok: false, error: "askedAgainTooSoon" }, errors), { go: codeStep("sentRecently"), error: null, clearCode: true });
    assert.deepEqual(afterSend("address", { ok: false, error: "tooManyCodesToday" }, errors), { go: null, error: "tooManyCodesToday", clearCode: false });
    assert.deepEqual(afterSend("address", { ok: false, error: "notUniversityAddress" }, errors), { go: null, error: "notUniversityAddress", clearCode: false });
    assert.deepEqual(afterSend("address", { ok: false, error: "botCheckFailed" }, errors), { go: null, error: "botCheckFailed", clearCode: false });
    assert.deepEqual(afterSend("address", { ok: false, error: "busy" }, errors), { go: null, error: "busy", clearCode: false });
    assert.deepEqual(afterSend("address", { ok: false, error: "closed" }, errors), { go: { at: "closed" }, error: null, clearCode: false });
    // Anything the page has no sentence for is "couldn't send", as before.
    for (const error of ["failed", "refused", "toString", "constructor"]) {
      assert.deepEqual(afterSend("address", { ok: false, error }, errors), { go: null, error: "couldNotSend", clearCode: false }, error);
    }
  });

  test("Send a new code on the code step: inside the minute it keeps today's sentence and stays", () => {
    for (const lead of ["sent", "sentRecently", "comeBack"]) {
      assert.deepEqual(afterSend(lead, { ok: false, error: "askedAgainTooSoon" }, errors), { go: null, error: "askedAgainTooSoon", clearCode: false }, lead);
      assert.deepEqual(afterSend(lead, { ok: false, error: "tooManyCodesToday" }, errors), { go: null, error: "tooManyCodesToday", clearCode: false }, lead);
      assert.deepEqual(afterSend(lead, { ok: false, error: "closed" }, errors), { go: { at: "closed" }, error: null, clearCode: false }, lead);
    }
    // The come-back form needs a University address typed before it asks.
    assert.deepEqual(afterSend("comeBack", { ok: false, error: "notUniversityAddress" }, errors), { go: null, error: "notUniversityAddress", clearCode: false });
    // A new code sent: the code step in its ordinary form, saying a code was sent.
    assert.deepEqual(afterSend("sent", { ok: true }, errors), { go: null, error: null, clearCode: true });
    assert.deepEqual(afterSend("sentRecently", { ok: true }, errors), { go: codeStep("sent"), error: null, clearCode: true });
    assert.deepEqual(afterSend("comeBack", { ok: true }, errors), { go: codeStep("sent"), error: null, clearCode: true });
  });

  test("I already have a code: with a University address, the code box and nothing asked of the server; without one, the sentence for that", () => {
    for (const address of ["someone@nottingham.ac.uk", "  Someone@Nottingham.ac.uk ", "someone+survey@nottingham.ac.uk"]) {
      assert.deepEqual(alreadyHaveCode(address), { go: codeStep("sent"), error: null, clearCode: true }, address);
    }
    for (const address of ["", "someone", "someone@gmail.com", "someone@exmail.nottingham.ac.uk", "someone@nottingham.ac.uk."]) {
      assert.deepEqual(alreadyHaveCode(address), { go: null, error: "notUniversityAddress", clearCode: false }, address);
    }
    // It is a plain function of what is typed: nothing it could call.
    assert.equal(alreadyHaveCode.length, 1);
    assert.match(flow, /onClick=\{\(\) => follow\(alreadyHaveCode\(address\)\)\}/);
  });

  test("the come-back form asks for the address beside the code, and each sentence goes under its own box", () => {
    assert.equal(asksForAddress(codeStep("comeBack")), true);
    assert.equal(asksForAddress(codeStep("sent")), false);
    assert.equal(asksForAddress(codeStep("sentRecently")), false);
    assert.equal(asksForAddress({ at: "address" }), false);
    const notUni = errors.notUniversityAddress;
    assert.equal(errorBox({ at: "address" }, errors.busy, notUni), "email");
    assert.equal(errorBox(codeStep("comeBack"), notUni, notUni), "email");
    assert.equal(errorBox(codeStep("comeBack"), errors.wrongCode, notUni), "code");
    assert.equal(errorBox(codeStep("comeBack"), errors.codeRunOut, notUni), "code");
    assert.equal(errorBox(codeStep("sent"), errors.askedAgainTooSoon, notUni), "code");
    assert.equal(errorBox(codeStep("sent"), null, notUni), null);
    // Check my code sends the two together, as it always has, with this page's own value.
    assert.match(flow, /const body = \{ email: typed, code: digits, claim: claim\.current \};/);
    // On the page: the code step draws the line its lead names, then the
    // address box when the form asks for it, then the code box; each sentence
    // under the box `errorBox` names; and the address box is the email step's own.
    const codeForm = flow.slice(flow.indexOf('{step.at === "code" && ('), flow.indexOf('{step.at === "already" && ('));
    assert.match(codeForm, /<form className=\{styles\.form\} onSubmit=\{onCode\} noValidate>\s*<p className=\{styles\.info\}>\{words\[LEAD_WORDS\[step\.lead\]\]\}<\/p>\s*\{asksForAddress\(step\) && emailField\}\s*<div className=\{styles\.field\}>\s*<label htmlFor="code"/);
    assert.match(codeForm, /\{codeError && <ErrorLine id="code-err">\{codeError\}<\/ErrorLine>\}/);
    assert.match(flow, /const box = errorBox\(step, fieldError, words\.errors\.notUniversityAddress\);\s*const emailError = box === "email" \? fieldError : null;\s*const codeError = box === "code" \? fieldError : null;/);
    const emailField = flow.slice(flow.indexOf("const emailField = ("), flow.indexOf("return (", flow.indexOf("const emailField = (")));
    assert.match(emailField, /<label htmlFor="email" className=\{styles\.fieldLabel\}>\s*\{words\.fieldLabel\}\s*<\/label>\s*<p id="email-help" className=\{styles\.small\}>\s*\{words\.fieldHelp\}\s*<\/p>/);
    assert.match(emailField, /id="email"[\s\S]*type="email"[\s\S]*autoComplete="email"[\s\S]*value=\{address\}\s*onChange=\{\(event\) => setAddress\(event\.target\.value\)\}/);
    assert.match(emailField, /\{emailError && <ErrorLine id="email-err">\{emailError\}<\/ErrorLine>\}/);
    assert.match(flow, /<form className=\{styles\.form\} onSubmit=\{onAddress\} noValidate>\s*\{emailField\}/);
  });

  test("on the page, every press does what emailSteps.ts says, and nothing on the code step can be pressed twice at once", () => {
    // What a press led to: the code box emptied when it says so, then the step, or the sentence.
    assert.match(flow, /const follow = \(outcome: Outcome\) => \{\s*if \(outcome\.clearCode\) setCode\(""\);\s*if \(outcome\.go\) \{\s*go\(outcome\.go\);\s*return;\s*\}\s*setFieldError\(outcome\.error \? words\.errors\[outcome\.error\] : null\);\s*\};/);
    assert.match(flow, /const result = await sendCode\(\);\s*if \(result\) follow\(afterSend\(from, result, words\.errors\)\);/);
    assert.match(flow, /const onAddress = async \(event: FormEvent\) => \{\s*event\.preventDefault\(\);\s*await send\("address"\);\s*\};/);
    // The code step's two links wait while a code is being asked for, so a
    // late answer cannot pull the page back to a step it has left.
    const codeForm = flow.slice(flow.indexOf('{step.at === "code" && ('), flow.indexOf('{step.at === "already" && ('));
    assert.match(codeForm, /disabled=\{busy\} onClick=\{\(\) => void send\(step\.lead\)\}>\s*\{words\.newCodeLink\}/);
    assert.match(codeForm, /disabled=\{busy\} onClick=\{\(\) => go\(\{ at: "address" \}\)\}>\s*\{words\.differentEmailLink\}/);
    assert.match(flow, /disabled=\{busy\} onClick=\{\(\) => follow\(alreadyHaveCode\(address\)\)\}>\s*\{words\.haveCodeLink\}/);
  });
});
