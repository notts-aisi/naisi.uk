/**
 * REQUIRED SURVEY QUESTIONS (Zach, 30 Oct 2026; docs/surveys.md, "The rules,
 * in one place"): every question of every survey must be answered unless it
 * is marked optional, and a consent box is never required.
 *
 *  1. THE RULE, `isQuestionRequired`: the question's own `optional` wins;
 *     with none, only an id on `NOT_FOR_EVERYBODY` is optional; Worksheets'
 *     `required` field is never read, so the surveys stored before the rule
 *     (every choice and text question carrying `required: false`) are
 *     required the moment the code is live.
 *  2. THE TEMPLATES: every question of every template is required but those
 *     on the list, which a survey made since writes as optional, and every
 *     list entry is a TEXT question some template asks (a walk of every
 *     template, both ways). Nothing that is not a question is required.
 *  3. WHAT ANSWERED MEANS, `missingRequired`, for each type: one option, at
 *     least one tick (a "none" counts), a value (0 counts), words that are
 *     more than spaces, and a grid's every line (an agreement grid) or any
 *     line (a grid of a programme's parts, whose own line says to leave a part
 *     blank), less the lines a person is not shown.
 *
 * Run with `npm test`. No database, no browser.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });

const items = await loadTs(join("lib", "surveys", "items.ts"));
const templates = await loadTs(join("lib", "surveys", "templates.ts"));
const { eventTemplateItems } = await loadTs(join("lib", "surveys", "events", "template.ts"));
const { checkInItems } = await loadTs(join("lib", "surveys", "checkIns", "template.ts"));

/**
 * Every template a survey is made from, both kinds of programme, the event's,
 * and the check-in's for a week with parts and reading and for a week with
 * neither (it asks one question fewer there).
 */
const EVERY_TEMPLATE = [
  ...templates.SURVEY_TEMPLATES.flatMap((stage) => [
    [`${stage}, fellowship`, templates.templateItems(stage, "fellowship", null)],
    [`${stage}, incubator`, templates.templateItems(stage, "incubator", "alignment")],
  ]),
  ["after an event", eventTemplateItems()],
  [
    "a check-in, a week with parts and reading",
    checkInItems({ parts: [{ id: "part_a", title: "Why powerful AI might seek power" }, { id: "part_b", title: "Races between AI developers" }], hasReading: true }),
  ],
  ["a check-in, a week with neither", checkInItems({ parts: [], hasReading: false })],
];

const question = (extra = {}) => ({ kind: "question", id: "q_x", type: "shortText", title: "A question", body: [], required: false, ...extra });

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

describe("1. isQuestionRequired: the question's own switch wins, then the list, never Worksheets' field", () => {
  test("with no switch, a question is required unless its id is on the list", () => {
    assert.equal(items.isQuestionRequired(question()), true);
    assert.equal(items.isQuestionRequired(question({ id: "q_p6" })), true, "a text question everybody can answer");
    assert.equal(items.isQuestionRequired(question({ id: "q_f7" })), false, "a catch-all on the list");
    assert.equal(items.isQuestionRequired(question({ id: "q_i4_when" })), false);
  });

  test("an explicit switch wins over the list, both ways", () => {
    assert.equal(items.isQuestionRequired(question({ id: "q_f7", optional: false })), true, "an admin switched a listed question on");
    assert.equal(items.isQuestionRequired(question({ id: "q_p6", optional: true })), false, "an admin switched a question off");
    assert.equal(items.isQuestionRequired(question({ optional: true })), false);
    assert.equal(items.isQuestionRequired(question({ optional: false })), true);
  });

  test("Worksheets' `required` is never read: a stored `required: false` is required, `true` on a listed one optional", () => {
    assert.equal(items.isQuestionRequired(question({ required: false })), true);
    assert.equal(items.isQuestionRequired(question({ id: "q_f3", required: true })), false);
    assert.equal(items.isQuestionRequired(question({ id: "q_f3", required: true, optional: false })), true);
  });

  test("every kind of question is required by default; nothing that is not a question is ever required", () => {
    for (const type of ["singleChoice", "multipleChoice", "rating", "longText", "lines", "percent", "number", "scale"]) {
      assert.equal(items.isQuestionRequired(question({ type })), true, type);
    }
    assert.equal(items.isQuestionRequired({ kind: "section", id: "s", heading: "H", body: [] }), false);
    assert.equal(items.isQuestionRequired({ kind: "pageBreak", id: "pb" }), false);
    const consent = { kind: "consent", id: "c", statement: "S", boxes: [{ purpose: "followUps", label: "Contact me" }] };
    assert.equal(items.isQuestionRequired(consent), false, "a consent box is never required");
    assert.equal(items.isQuestionRequired({ ...consent, optional: false }), false, "not even with a switch written on it");
  });

  test("the reader keeps a boolean switch and drops anything else", () => {
    const read = items.sanitizeSurveyItems([
      question({ id: "a", optional: true }),
      question({ id: "b", optional: false }),
      question({ id: "c", optional: "yes" }),
      { kind: "question", id: "d", type: "percent", title: "Share", ends: { min: "", max: "" }, optional: true },
      { kind: "question", id: "e", type: "lines", title: "Agree?", lines: [{ id: "l1", label: "One" }], scale: { max: 5, minLabel: "", maxLabel: "" }, optional: false },
    ]);
    assert.deepEqual(read.map((each) => each.optional), [true, false, undefined, true, false]);
    assert.equal("optional" in read[2], false, "nothing is written as undefined");
  });

  test("the validator no longer refuses `required`, and names a contradiction instead", () => {
    const valid = (list) => items.validateSurveyItems(items.sanitizeSurveyItems(list, { clampLimits: false })).map((problem) => problem.message);
    assert.deepEqual(valid([question({ required: true })]), [], "required and required agree");
    assert.deepEqual(valid([question({ optional: true })]), []);
    assert.deepEqual(valid([question({ required: true, optional: true })]), [items.REQUIRED_CONTRADICTION]);
    assert.deepEqual(valid([question({ id: "q_f7", required: true })]), [items.REQUIRED_CONTRADICTION], "a listed question marked required by the old field");
    assert.deepEqual(valid([question({ id: "q_f7", required: true, optional: false })]), []);
  });

  test("the fixed shape lets the switch change and nothing else", () => {
    const before = [question({ id: "a" }), question({ id: "b", type: "longText" })];
    const after = [question({ id: "a", optional: true }), question({ id: "b", type: "longText", optional: false })];
    assert.equal(items.sameQuestions(before, after), true);
  });
});

// ---------------------------------------------------------------------------
// 2. The templates, walked
// ---------------------------------------------------------------------------

describe("2. every template: required but the list, and the list only ever text questions a template asks", () => {
  test("every question of every template is required unless it is on the list; every listed one is written optional", () => {
    for (const [name, list] of EVERY_TEMPLATE) {
      assert.deepEqual(items.validateSurveyItems(list), [], name);
      for (const each of items.surveyQuestionsOf(list)) {
        const listed = items.NOT_FOR_EVERYBODY_IDS.includes(each.id);
        assert.equal(items.isQuestionRequired(each), !listed, `${name}: ${each.id}`);
        if (listed) assert.equal(each.optional, true, `${name}: ${each.id} is written optional, so the editor's switch starts off`);
        else assert.equal("optional" in each, false, `${name}: ${each.id} writes nothing, so it is required`);
      }
    }
  });

  test("every consent box of every template is never required, and carries no switch", () => {
    let boxes = 0;
    for (const [name, list] of EVERY_TEMPLATE) {
      for (const consent of items.consentItemsOf(list)) {
        boxes += consent.boxes.length;
        assert.equal(items.isQuestionRequired(consent), false, `${name}: ${consent.id}`);
        assert.equal("optional" in consent, false, `${name}: ${consent.id}`);
      }
      assert.ok(items.requiredQuestionsOf(list).every((each) => each.kind === "question"), name);
    }
    assert.ok(boxes >= 2, "the before survey's P7 and the end's box are walked");
  });

  test("every id on the list is a text question some template asks, with its reason", () => {
    const asked = new Map();
    for (const [, list] of EVERY_TEMPLATE) for (const each of items.surveyQuestionsOf(list)) asked.set(each.id, each);
    assert.ok(items.NOT_FOR_EVERYBODY_IDS.length > 0);
    for (const id of items.NOT_FOR_EVERYBODY_IDS) {
      const each = asked.get(id);
      assert.ok(each, `${id} is on the list but no template asks it`);
      assert.ok(each.type === "shortText" || each.type === "longText", `${id} is a ${each.type}: only text questions go on the list`);
      assert.ok(items.NOT_FOR_EVERYBODY[id].trim().length > 10, `${id} carries its reason`);
    }
  });

  test("the list is exactly the questions that do not apply to everybody (Zach's examples among them)", () => {
    // CHANGED ON PURPOSE (the check-in at the end of a session): its "What
    // could have gone better?" is a catch-all, like the event's.
    assert.deepEqual([...items.NOT_FOR_EVERYBODY_IDS].sort(), [
      "q_ci_better",
      "q_ev_change",
      "q_f1_where",
      "q_f3",
      "q_f4_accepted",
      "q_f4_applied",
      "q_f7",
      "q_i4_links",
      "q_i4_when",
    ]);
    // Text questions everybody can answer stay required.
    for (const id of ["q_p6", "q_a5", "q_leave_stay", "q_ci_most"]) assert.equal(items.NOT_FOR_EVERYBODY_IDS.includes(id), false, id);
  });

  test("requiredQuestionsOf: the required questions in the survey's order", () => {
    const follow = templates.templateItems("followUp6", "fellowship", null);
    assert.deepEqual(
      items.requiredQuestionsOf(follow).map((each) => each.id),
      ["q_f1", "q_f2", "q_c1", "q_c2", "q_a2", "q_a4"],
    );
  });
});

// ---------------------------------------------------------------------------
// 3. What answered means
// ---------------------------------------------------------------------------

const AGREE = ["Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"];
const KINDS = [
  { kind: "section", id: "s_one", heading: "One", body: [] },
  question({ id: "q_one", type: "singleChoice", options: [{ id: "o_a", label: "A" }, { id: "o_b", label: "B" }] }),
  question({ id: "q_many", type: "multipleChoice", options: [{ id: "o_a", label: "A" }, { id: "o_none", label: "None of these" }], noneIds: ["o_none"] }),
  question({ id: "q_rate", type: "rating", rating: { max: 5, minLabel: "Bad", maxLabel: "Good" } }),
  { kind: "question", id: "q_scale", type: "scale", title: "Likely?", min: 0, max: 10, anchors: [] },
  { kind: "question", id: "q_pct", type: "percent", title: "Share?", ends: { min: "", max: "" } },
  { kind: "question", id: "q_num", type: "number", title: "How many?", max: 100 },
  question({ id: "q_text", type: "longText" }),
  {
    kind: "question",
    id: "q_agree",
    type: "lines",
    title: "How much do you agree?",
    lines: [{ id: "l_one", label: "One" }, { id: "l_two", label: "Two" }],
    scale: { max: 5, minLabel: AGREE[0], maxLabel: AGREE[4], points: AGREE },
  },
  {
    kind: "question",
    id: "q_parts",
    type: "lines",
    title: "How valuable was each part?",
    lines: [{ id: "l_sessions", label: "Sessions" }, { id: "l_facilitator", label: "Facilitator" }],
    scale: { max: 5, minLabel: "Not valuable", maxLabel: "Very valuable" },
  },
  question({ id: "q_extra", type: "shortText", optional: true }),
  { kind: "consent", id: "c_box", statement: "S", boxes: [{ purpose: "followUps", label: "Contact me" }] },
];
const REQUIRED_IDS = ["q_one", "q_many", "q_rate", "q_scale", "q_pct", "q_num", "q_text", "q_agree", "q_parts"];
const FULL = {
  q_one: { type: "choice", optionId: "o_a" },
  q_many: { type: "choices", optionIds: ["o_none"] },
  q_rate: { type: "rating", value: 4 },
  q_scale: { type: "scale", value: 0 },
  q_pct: { type: "percent", value: 0 },
  q_num: { type: "number", value: 0 },
  q_text: { type: "text", text: "Something." },
  q_agree: { type: "lines", values: { l_one: 2, l_two: 5 } },
  q_parts: { type: "lines", values: { l_sessions: 4 } },
};
const without = (id, value) => {
  const out = structuredClone(FULL);
  if (value === undefined) delete out[id];
  else out[id] = value;
  return out;
};

describe("3. missingRequired: what answered means, for each type", () => {
  test("nothing sent leaves every required question blank, in the survey's order; the optional one and the consent never", () => {
    assert.deepEqual(items.missingRequired(KINDS, {}), REQUIRED_IDS);
    assert.deepEqual(items.missingRequired(KINDS, null), REQUIRED_IDS, "no answers at all is every one blank");
  });

  test("every required question answered is nothing missing; 0, a \"none\" tick and one part count", () => {
    assert.deepEqual(items.missingRequired(KINDS, FULL), []);
  });

  test("each type's blank, one at a time", () => {
    const blanks = [
      ["q_one", undefined],
      ["q_one", { type: "choice", optionId: "" }],
      ["q_many", { type: "choices", optionIds: [] }],
      ["q_rate", { type: "rating", value: 0 }],
      ["q_scale", { type: "scale", value: null }],
      ["q_pct", { type: "percent" }],
      ["q_num", { type: "number", value: Number.NaN }],
      ["q_text", { type: "text", text: "   \n " }],
      ["q_agree", { type: "lines", values: { l_one: 2 } }],
      ["q_agree", { type: "lines", values: { l_one: 2, l_two: 0 } }],
      ["q_parts", { type: "lines", values: {} }],
      ["q_parts", { type: "lines", values: { l_sessions: 0 } }],
      ["q_one", "not an answer"],
    ];
    for (const [id, value] of blanks) {
      assert.deepEqual(items.missingRequired(KINDS, without(id, value)), [id], `${id}: ${JSON.stringify(value)}`);
    }
  });

  test("a line the person was not shown is never needed", () => {
    const hidden = ["l_two", "l_facilitator"];
    assert.deepEqual(items.missingRequired(KINDS, without("q_agree", { type: "lines", values: { l_one: 3 } }), { hiddenLines: hidden }), []);
    assert.deepEqual(items.missingRequired(KINDS, without("q_agree", { type: "lines", values: {} }), { hiddenLines: hidden }), ["q_agree"]);
  });

  test("an optional question left blank, or answered, changes nothing", () => {
    assert.deepEqual(items.missingRequired(KINDS, { ...FULL, q_extra: { type: "text", text: "Yes" } }), []);
    const switched = KINDS.map((each) => (each.id === "q_text" ? { ...each, optional: true } : each));
    assert.deepEqual(items.missingRequired(switched, without("q_text", undefined)), []);
  });

  test("the answers the routes keep after reading are checked the same way as what was sent", () => {
    const read = items.readSurveyAnswers(KINDS, without("q_agree", { type: "lines", values: { l_one: 2, l_two: 0 } }));
    assert.deepEqual(read.problems, []);
    assert.deepEqual(items.missingRequired(KINDS, read.answers), ["q_agree"]);
    assert.deepEqual(items.missingRequired(KINDS, items.readSurveyAnswers(KINDS, FULL).answers), []);
  });

  test("the form's needs and missingRequired are one check", () => {
    const needs = items.requiredQuestionsOf(KINDS).map((each) => items.requiredNeedOf(each, ["l_two"]));
    assert.deepEqual(
      needs.find((need) => need.id === "q_agree"),
      { id: "q_agree", lines: ["l_one"] },
      "an agreement grid needs every line shown",
    );
    assert.deepEqual(needs.find((need) => need.id === "q_parts"), { id: "q_parts", lines: null }, "a grid of parts needs any one");
    for (const answers of [{}, FULL, without("q_agree", { type: "lines", values: { l_one: 1 } })]) {
      assert.deepEqual(items.missingOf(needs, answers), items.missingRequired(KINDS, answers, { hiddenLines: ["l_two"] }));
    }
  });

  test("the template's own grids: C7 needs both lines, Q2 any part, and a facilitator is never asked the Facilitator line", () => {
    const after = templates.templateItems("after", "fellowship", null);
    const needOf = (id, hidden = []) => items.requiredNeedOf(items.surveyQuestionsOf(after).find((each) => each.id === id), hidden);
    assert.deepEqual(needOf("q_c7"), { id: "q_c7", lines: ["l_next", "l_contribute"] });
    assert.deepEqual(needOf("q_q2"), { id: "q_q2", lines: null });
    assert.match(items.surveyQuestionsOf(after).find((each) => each.id === "q_q2").hint, /Leave a part blank if you didn’t have it/);
  });
});
