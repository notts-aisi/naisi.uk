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
 *  1. THE DEFINITION is what was agreed: twelve pages, five of
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
 *
 * `tests/ai-survey-no-trace.test.mjs` walks the survey's files for what must
 * never be there. `scripts/rules-tests/tests/ai-survey.test.mjs` holds its
 * collections locked to every browser.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

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
const { answerSetKey, newCode, newPassId, openPass, PASS_LIFETIME_MS, renewPass, sealPass } = await loadTs("lib/aiSurvey/pass.ts");
const { CLOSING_GRACE_MS, hashAddress, PEOPLE_PER_GENERATION, shardsInUse, SMALL_SURVEY, stageAt } = await loadTs("lib/aiSurvey/store.ts");
const { publicSurvey } = await loadTs("features/aiSurvey/projectSurvey.ts");
const { sequenceOf } = await loadTs("features/aiSurvey/publicSurvey.ts");
const { Timestamp } = await import("firebase-admin/firestore");

// ---------------------------------------------------------------------------
// 1. The definition
// ---------------------------------------------------------------------------

/** The export's columns, as promised to the people who will analyse it. */
const COLUMNS = [
  "finished", "A1", "A2", "B1",
  "B2_explain", "B2_summarise", "B2_ideas", "B2_plan", "B2_sources", "B2_draft", "B2_paste", "B2_media", "B2_grammar", "B2_code", "B2_none",
  "B3", "B4", "B5a", "B5b", "B5c", "B6", "B7", "B8", "B9", "B10",
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12",
  "X1", "X2", "X3", "X4",
  "P1", "P2a", "P2b", "P3", "P4", "P5", "P6", "M1",
  "P7", "P8", "P9", "P10", "P11", "P12", "M2",
  "P13", "P14", "P15", "P16", "P17", "M3",
  "P18", "P30", "P19", "P20", "P21", "P22", "P23", "P24", "M4",
  "P25", "P26", "P27", "P28", "P29", "M5",
  "E1", "F1", "F2", "G1", "G2", "A3", "A4", "A5", "A6", "H1",
];

/** Every string anywhere in a value. */
function stringsIn(value, into = []) {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, into);
  return into;
}

describe("the definition", () => {
  test("twelve pages, five of them proposals shown as one block", () => {
    assert.equal(AI_SURVEY.pages.length, 12);
    assert.deepEqual(proposalPageIds(), ["d1", "d2", "d3", "d4", "d5"]);
    assert.deepEqual(
      pageSequence(["d3", "d1", "d5", "d2", "d4"]),
      ["about1", "use", "seen", "stand", "choices", "d3", "d1", "d5", "d2", "d4", "priorities", "last"],
    );
  });

  test("46 lines answered on a scale: 12 statements, 31 proposals and 3 yes or no", () => {
    const lines = AI_SURVEY.pages.flatMap((p) => p.questions).filter((q) => q.type === "lines");
    const count = (scale) => lines.filter((q) => q.scale === scale).reduce((n, q) => n + q.lines.length, 0);
    assert.deepEqual([count("agree"), count("support"), count("yesNoNotSure")], [12, 31, 3]);
  });

  test("the export has exactly the promised 87 columns, in order", () => {
    assert.equal(COLUMNS.length, 87);
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
  });

  test("each 'which matters most' draws on a lines question of its own page", () => {
    for (const page of AI_SURVEY.pages) {
      for (const q of page.questions) {
        if (q.type !== "mostOf") continue;
        const source = page.questions.find((other) => other.id === q.linesFrom);
        assert.equal(source?.type, "lines", `${q.id} points at ${q.linesFrom}`);
        assert.deepEqual(q.extraOptions.map((o) => o.id), ["none"]);
      }
    }
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
    assert.deepEqual(ok("use", { B1: "", B2: [], B3: null }), {});
    assert.deepEqual(ok("last", { G1: "   ", G2: false }), {});
  });

  test("known codes and known answers are kept as given", () => {
    assert.deepEqual(ok("about1", { A1: "ug", A2: "maths" }), { A1: "ug", A2: "maths" });
    assert.deepEqual(ok("stand", { C1: "sa", C2: "dk" }), { C1: "sa", C2: "dk" });
    assert.deepEqual(ok("d1", { P1: "ss", P2a: "dk", M1: "P2b" }), { P1: "ss", P2a: "dk", M1: "P2b" });
    assert.deepEqual(ok("d1", { M1: "none" }), { M1: "none" });
    assert.deepEqual(ok("last", { G1: " One thing. ", G2: true }), { G1: "One thing.", G2: true });
  });

  test("a multi-choice answer is stored in the survey's order, not the order of ticking", () => {
    assert.deepEqual(ok("use", { B2: ["code", "explain"] }), { B2: ["explain", "code"] });
    assert.deepEqual(ok("use", { B2: ["none"] }), { B2: ["none"] });
  });

  test("anything else is refused whole, never trimmed to fit", () => {
    refused("nowhere", {});
    refused("about1", { A1: "ug", ZZ: "x" });
    refused("about1", { A1: "phd" });
    refused("about1", { A1: ["ug"] });
    refused("about1", { C1: "sa" }); // a real code, on the wrong page
    refused("stand", { C1: "ss" }); // the other scale's answer
    refused("stand", { C1: 6 }); // "Don't know" is never a sixth point
    refused("d1", { M1: "P7" }); // another page's line
    refused("use", { B2: ["none", "code"] });
    refused("use", { B2: ["code", "code"] });
    refused("use", { B2: "code" });
    refused("last", { G1: "x".repeat(501) });
    refused("last", { G2: "yes" });
    refused("about1", null);
    refused("about1", []);
    refused("about1", "A1=ug");
    refused("about1", Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i}`, "x"])));
  });

  test("the comment may be exactly its limit, counted as the page's box counts it", () => {
    assert.equal(ok("last", { G1: "x".repeat(500) }).G1.length, 500);
    assert.equal(ok("last", { G1: `${"x".repeat(249)}\r\n${"y".repeat(250)}` }).G1.length, 500);
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
    assert.equal(row.length, 87);
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
    const set = { ...whole, pages: { ...whole.pages, last: { G2: true, G1: "said" }, stand: { C1: "dk" }, d1: { P1: "dk", M1: "none" } } };
    assert.equal(cell(set, "G2"), "1");
    assert.equal(cell(whole, "G2"), "");
    assert.equal(cell(set, "C1"), "dk");
    assert.equal(cell(set, "P1"), "dk");
    assert.equal(cell(set, "M1"), "none");
  });

  test("the file has a header and a row a set, in an order that is not the order stored", () => {
    const sets = ["ug", "pgt", "pgr", "other"].map((A1) => ({ ...whole, pages: { ...whole.pages, about1: { A1 } } }));
    const csv = buildExport(sets, (n) => n - 1);
    const lines = csv.trimEnd().split("\n");
    assert.equal(lines.length, 5);
    assert.equal(lines[0], COLUMNS.join(","));
    assert.deepEqual(lines.slice(1).map((l) => l.split(",")[1]).sort(), ["other", "pgr", "pgt", "ug"]);
    const reversed = buildExport(sets, () => 0).trimEnd().split("\n").slice(1).map((l) => l.split(",")[1]);
    assert.notDeepEqual(reversed, ["ug", "pgt", "pgr", "other"], "the rows came out in the order they were stored");
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
    assert.equal(openPass(`${payload}.${signature.slice(0, -2)}AA`, key, now), null);
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
  const state = (over) => ({ stage: "open", epoch: "e", passKey: "", pilotKey: "", accepted: 0, shardDocs: 16, adminUids: [], closedEarly: null, lastLevel: null, usedListDeleted: null, ...over });

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

  test("few shared documents while there are few people, so each soon holds many", () => {
    assert.deepEqual(shardsInUse(0), { from: 0, count: 2 });
    assert.deepEqual(shardsInUse(47), { from: 0, count: 2 });
    assert.deepEqual(shardsInUse(48), { from: 0, count: 4 });
    assert.deepEqual(shardsInUse(SMALL_SURVEY), { from: 0, count: 8 });
    assert.deepEqual(shardsInUse(320), { from: 0, count: 16 });
    assert.deepEqual(shardsInUse(PEOPLE_PER_GENERATION - 1), { from: 0, count: 16 });
    assert.deepEqual(shardsInUse(PEOPLE_PER_GENERATION), { from: 16, count: 16 });
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
