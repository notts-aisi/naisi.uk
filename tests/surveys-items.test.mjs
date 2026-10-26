/**
 * A SURVEY'S QUESTIONS, WORDS AND TOTALS, as pure functions (docs/surveys.md):
 * the before survey's template word for word as sv-before-phone draws it, the
 * item model on Worksheets' parts with the one question Worksheets lacks,
 * the answers a route accepts, the totals and the spreadsheet, the
 * confidential box for every kind of person, the two emails word for word,
 * and the day names come off.
 *
 * Run with `npm test`. No database, no browser.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => ({}) };"],
  ]),
});

const items = await loadTs(join("lib", "surveys", "items.ts"));
const words = await loadTs(join("lib", "surveys", "words.ts"));
const { surveyResults } = await loadTs(join("lib", "surveys", "results.ts"));
const { surveyExportTable, exportFilename, NAME_TAKEN_OFF } = await loadTs(join("lib", "surveys", "exportTable.ts"));
const { aYearAfter, namesDueOff } = await loadTs(join("lib", "surveys", "namesOff.ts"));
const records = await loadTs(join("lib", "firestore", "surveys.ts"));

const LINES = [
  "How fast AI is improving, and why",
  "How advanced AI could go wrong",
  "What’s being done to make it go well",
  "The race between labs and countries, and the plans to handle it",
  "What you could do about it yourself",
];
const TEMPLATE = items.beforeSurveyItems(LINES);
const questions = items.surveyQuestionsOf(TEMPLATE);
const labels = (id) => questions.find((question) => question.id === id).options.map((option) => option.label);

describe("the before survey's template, as sv-before-phone draws it", () => {
  test("six questions on three pages, under the three headings", () => {
    assert.equal(questions.length, 6);
    const pages = items.surveyPagesOf(TEMPLATE);
    assert.equal(pages.length, 3);
    assert.deepEqual(
      pages.map((page) => page.find((item) => item.kind === "section").heading),
      ["What you think about AI", "What you could explain", "Your plans"],
    );
    assert.deepEqual(
      pages.map((page) => page.filter((item) => item.kind === "question").map((question) => question.id)),
      [["q_catastrophe", "q_when", "q_important"], ["q_explain"], ["q_where", "q_next12"]],
    );
    assert.deepEqual(questions.map((question) => question.id), [...items.CHANGE_QUESTION_IDS]);
  });

  test("each question's words and options, exactly", () => {
    assert.deepEqual(
      questions.map((question) => question.title),
      [
        "How likely is it that advanced AI causes a catastrophe for humanity this century?",
        "When do you think AI will be able to do most work done at a computer as well as a skilled person?",
        "Making AI go well is one of the most important problems of our time.",
        "How confident would you be explaining these to a friend?",
        "Which is closest to where you are with working on making AI go well?",
        "In the next 12 months, which of these might you do?",
      ],
    );
    assert.deepEqual(labels("q_catastrophe"), ["Under 1%", "1 to 10%", "10 to 25%", "25 to 50%", "Over 50%", "Not sure"]);
    assert.deepEqual(labels("q_when"), ["Before 2030", "2030 to 2035", "2036 to 2045", "After 2045", "Never", "Not sure"]);
    assert.deepEqual(labels("q_important"), ["Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"]);
    assert.deepEqual(labels("q_where"), [
      "It’s not something I’m considering",
      "Curious, not sure yet",
      "Considering it seriously",
      "Planning to: applying or preparing",
      "Already doing it: a job, research or study",
    ]);
    assert.deepEqual(labels("q_next12"), [
      "Apply to a research programme or incubator",
      "Do a research project on AI safety",
      "Apply for a job or internship in AI safety or policy",
      "Choose modules or a dissertation on it",
      "Take another AI safety course",
      "None of these yet",
    ]);
    const explain = questions.find((question) => question.id === "q_explain");
    assert.equal(explain.type, "lines");
    assert.deepEqual(explain.lines.map((line) => line.label), LINES);
    assert.deepEqual(explain.scale, { max: 5, minLabel: "Not at all", maxLabel: "Very" });
    assert.equal(questions.find((question) => question.id === "q_important").look, "agree");
    assert.equal(questions.find((question) => question.id === "q_next12").type, "multipleChoice");
  });

  test("nothing is required, and the template is valid", () => {
    assert.ok(questions.every((question) => question.required !== true));
    assert.deepEqual(items.validateSurveyItems(TEMPLATE), []);
  });

  test("its ids are fixed, so every programme's answers compare and the after survey can repeat them", () => {
    assert.deepEqual(items.beforeSurveyItems(["a", "b", "c", "d", "e"]).map((item) => item.id), TEMPLATE.map((item) => item.id));
  });
});

describe("the item model, on Worksheets' parts", () => {
  test("a stored survey reads back as it was written, lines question and all", () => {
    assert.deepEqual(items.sanitizeSurveyItems(structuredClone(TEMPLATE)), TEMPLATE);
  });

  test("the reader drops what it cannot read, and keeps `look` only on a single choice", () => {
    const read = items.sanitizeSurveyItems([
      { kind: "nonsense", id: "x" },
      { kind: "question", id: "q1", type: "multipleChoice", title: "t", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], look: "agree" },
      null,
    ]);
    assert.equal(read.length, 1);
    assert.equal("look" in read[0], false);
  });

  test("the validator names what a survey cannot ask", () => {
    const required = structuredClone(TEMPLATE);
    required.find((item) => item.id === "q_where").required = true;
    assert.match(items.validateSurveyItems(required)[0].message, /can be skipped/);
    const poll = [{ kind: "question", id: "p", type: "poll", title: "Poll", body: [], required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], poll: { resultsVisibility: "staff" } }];
    assert.ok(items.validateSurveyItems(poll).some((problem) => /can’t ask this kind/.test(problem.message)));
    const blankLine = structuredClone(TEMPLATE);
    blankLine.find((item) => item.id === "q_explain").lines[2].label = "  ";
    assert.ok(items.validateSurveyItems(blankLine).some((problem) => problem.message === "Every line needs its words."));
    const tooMany = structuredClone(TEMPLATE);
    tooMany.find((item) => item.id === "q_explain").lines = Array.from({ length: 11 }, (_, i) => ({ id: `l${i}`, label: "x" }));
    assert.ok(items.validateSurveyItems(tooMany).some((problem) => /11 lines/.test(problem.message)));
    const twice = structuredClone(TEMPLATE);
    twice.find((item) => item.id === "q_explain").lines[1].id = "l1";
    assert.ok(items.validateSurveyItems(twice).some((problem) => /share an id/.test(problem.message)));
    assert.match(items.validateSurveyItems([])[0].message, /at least one question/);
  });

  test("the same questions: order may change, the set and the types may not", () => {
    const moved = structuredClone(TEMPLATE).reverse();
    assert.equal(items.sameQuestions(TEMPLATE, moved), true);
    assert.equal(items.sameQuestions(TEMPLATE, TEMPLATE.filter((item) => item.id !== "q_when")), false);
    const retyped = structuredClone(TEMPLATE);
    retyped.find((item) => item.id === "q_where").type = "multipleChoice";
    assert.equal(items.sameQuestions(TEMPLATE, retyped), false);
  });
});

describe("the answers a person sends", () => {
  test("blank questions are skipped, and only what each type carries is kept", () => {
    const read = items.readSurveyAnswers(TEMPLATE, {
      q_catastrophe: { type: "choice", optionId: "o_notsure", extra: "dropped" },
      q_when: null,
      q_explain: { type: "lines", values: { l1: 2, l2: 0, l3: null } },
      q_next12: { type: "choices", optionIds: [] },
    });
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.answers, {
      q_catastrophe: { type: "choice", optionId: "o_notsure" },
      q_explain: { type: "lines", values: { l1: 2 } },
    });
  });

  test("anything not of the survey is refused", () => {
    const refused = (raw) => items.readSurveyAnswers(TEMPLATE, raw).problems.length > 0;
    assert.ok(refused("not answers"));
    assert.ok(refused({ q_other: { type: "choice", optionId: "o_notsure" } }));
    assert.ok(refused({ q_catastrophe: { type: "choice", optionId: "o_made_up" } }));
    assert.ok(refused({ q_catastrophe: { type: "text", text: "Not sure" } }));
    assert.ok(refused({ q_explain: { type: "lines", values: { l9: 3 } } }));
    assert.ok(refused({ q_explain: { type: "lines", values: { l1: 6 } } }));
    assert.ok(refused({ q_explain: { type: "lines", values: { l1: 2.5 } } }));
    assert.ok(refused({ q_next12: { type: "choices", optionIds: ["o_course", "o_course"] } }));
  });
});

describe("totals and comments, never a name", () => {
  const sets = [
    { answers: { q_catastrophe: { type: "choice", optionId: "o_notsure" }, q_explain: { type: "lines", values: { l1: 2, l2: 4 } } } },
    { answers: { q_catastrophe: { type: "choice", optionId: "o_1to10" }, q_explain: { type: "lines", values: { l1: 4 } }, q_next12: { type: "choices", optionIds: ["o_course", "o_project"] } } },
    { answers: {} },
  ];
  const results = surveyResults(TEMPLATE, sets);

  test("a choice counts each option over the people who answered it, from the first answer", () => {
    const q1 = results.find((result) => result.id === "q_catastrophe");
    assert.equal(q1.respondents, 2);
    assert.deepEqual(q1.options.find((option) => option.label === "Not sure"), { label: "Not sure", count: 1, percent: 50 });
    const q6 = results.find((result) => result.id === "q_next12");
    assert.equal(q6.multiple, true);
    assert.equal(q6.respondents, 1);
  });

  test("each line of question 4 is counted on its own scale", () => {
    const q4 = results.find((result) => result.id === "q_explain");
    assert.equal(q4.kind, "scale");
    // Each row also carries its middle value, which the change view reads.
    assert.deepEqual(q4.rows[0], { label: LINES[0], respondents: 2, counts: [0, 1, 0, 1, 0], mean: 3, median: 3 });
    assert.deepEqual(q4.rows[1], { label: LINES[1], respondents: 1, counts: [0, 0, 0, 1, 0], mean: 4, median: 4 });
    assert.equal(q4.rows[2].mean, null);
  });

  test("the results carry no person", () => {
    assert.doesNotMatch(JSON.stringify(results), /uid/);
  });
});

describe("the spreadsheet with names", () => {
  test("a column per question and per line, choices in words, a name taken off said so", () => {
    const table = surveyExportTable(TEMPLATE, [
      { name: "Zoe Example", sentAt: new Date("2026-10-29T09:00:00Z"), via: "link", afterFirstSession: false, answers: { q_catastrophe: { type: "choice", optionId: "o_notsure" }, q_next12: { type: "choices", optionIds: ["o_course", "o_project"] } } },
      { name: null, sentAt: new Date("2026-10-30T19:05:00Z"), via: "signed-in", afterFirstSession: true, answers: { q_explain: { type: "lines", values: { l3: 1 } } } },
    ]);
    assert.deepEqual(table.header.slice(0, 5), ["Name", "Sent", "How", "After their first session", "1. How likely is it that advanced AI causes a catastrophe for humanity this century?"]);
    assert.equal(table.header.length, 4 + 3 + 5 + 2);
    assert.ok(table.header.includes(`4. How confident would you be explaining these to a friend?: ${LINES[2]}`));
    assert.deepEqual(table.rows[0].slice(0, 5), ["Zoe Example", "2026-10-29 09:00", "Personal link", "No", "Not sure"]);
    // Several picks, in the order they were sent, joined by "; ".
    assert.equal(table.rows[0].at(-1), "Take another AI safety course; Do a research project on AI safety");
    assert.equal(table.rows[1][0], NAME_TAKEN_OFF);
    assert.equal(table.rows[1][2], "Signed in");
    assert.equal(table.rows[1][3], "Yes");
    assert.equal(exportFilename("AGI Strategy: before", "2026-11-05"), "agi-strategy-before-answers-2026-11-05.csv");
  });
});

describe("the confidential box, for every kind of person (sv-privacy)", () => {
  const base = { namesOffOn: "2027-12-09", programmeKind: "fellowship" };
  const box = (facts) => words.confidentialPoints({ ...base, ...facts });

  test("the board's own words, for somebody in a group with two facilitators", () => {
    assert.deepEqual(box({ leadName: "Claudia", facilitatorNames: ["Rahul", "Sofia"] }), {
      points: [
        "Only NAISI’s admins can see who said what.",
        "Claudia sees totals and comments, never names. Rahul and Sofia never see your answers.",
        "Nothing you say here affects your place or a future application.",
        "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
        "Your name comes off on Thu 9 Dec 2027, a year after the fellowship ends. The totals stay.",
      ],
      note: "We ask who you are so we can compare your answers at the start and the end.",
    });
  });

  test("one facilitator, none told yet, no lead, and an incubator", () => {
    assert.equal(box({ leadName: "Claudia", facilitatorNames: ["Sofia"] }).points[1], "Claudia sees totals and comments, never names. Sofia never sees your answers.");
    assert.equal(box({ leadName: "Claudia", facilitatorNames: null }).points[1], "Claudia sees totals and comments, never names. Your facilitators never see your answers.");
    assert.equal(box({ leadName: null, facilitatorNames: ["Rahul", "Sofia", "Tom"] }).points[1], "Rahul, Sofia and Tom never see your answers.");
    assert.equal(box({ leadName: "Claudia", facilitatorNames: [] }).points[1], "Claudia sees totals and comments, never names.");
    assert.match(box({ leadName: "Tess", facilitatorNames: null, programmeKind: "incubator" }).points.at(-1), /a year after the incubator ends/);
  });
});

describe("the two emails, word for word (HANDOFF, Emails)", () => {
  const facts = {
    title: "Before you start",
    intro: words.beforeIntro(6, 3),
    questions: 6,
    minutes: 3,
    programmeName: "AGI Strategy",
    closesAt: new Date("2026-11-04T23:59:00Z"),
    signer: "Zach",
  };

  test("the before survey", () => {
    assert.deepEqual(words.surveyEmailWords(facts), {
      subject: "Before you start: 6 questions for AGI Strategy",
      paragraphs: [
        "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 6 questions and takes about 3 minutes.",
        "We’ll ask the same at the end.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
      ],
      button: "Answer the 6 questions",
      signOff: ["Zach", "For NAISI"],
    });
  });

  test("the reminder", () => {
    assert.deepEqual(words.reminderEmailWords(facts), {
      subject: "A reminder: 6 questions for AGI Strategy, by Wed 4 Nov",
      paragraphs: [
        "You haven’t answered yet. It’s 6 questions and takes about 3 minutes.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
      ],
      button: "Answer the 6 questions",
      signOff: ["Zach", "For NAISI"],
    });
  });

  test("a presser with no name signs for NAISI; one question and one minute read as such", () => {
    assert.deepEqual(words.surveyEmailWords({ ...facts, signer: "" }).signOff, ["NAISI"]);
    assert.equal(words.reminderEmailWords({ ...facts, questions: 1, minutes: 1 }).paragraphs[0], "You haven’t answered yet. It’s 1 question and takes about a minute.");
  });

  test("never an answer, a result or a dash", () => {
    for (const email of [words.surveyEmailWords(facts), words.reminderEmailWords(facts)]) {
      assert.doesNotMatch(JSON.stringify(email), /[–—]/);
    }
  });
});

describe("dates, in London", () => {
  test("a year after the last session; 28 February for the 29th", () => {
    assert.equal(aYearAfter("2026-12-09"), "2027-12-09");
    assert.equal(aYearAfter("2028-02-29"), "2029-02-28");
    assert.equal(aYearAfter("nonsense"), null);
  });

  test("names are due off on their day, once", () => {
    assert.equal(namesDueOff({ namesOffOn: "2027-12-09", namesOffAt: null }, "2027-12-08"), false);
    assert.equal(namesDueOff({ namesOffOn: "2027-12-09", namesOffAt: null }, "2027-12-09"), true);
    assert.equal(namesDueOff({ namesOffOn: "2027-12-09", namesOffAt: new Date() }, "2027-12-10"), false);
    assert.equal(namesDueOff({ namesOffOn: null, namesOffAt: null }, "2099-01-01"), false);
  });

  test("the words the pages use", () => {
    assert.equal(words.dateKeyWords("2027-12-09"), "Thu 9 Dec 2027");
    assert.equal(words.closingWords(new Date("2026-11-04T23:59:00Z")), "It closes on Wed 4 Nov. Once sent, your answers can’t change.");
    assert.equal(words.deadlineWords(new Date("2026-11-04T23:59:00Z")), "Wed 4 Nov, 23:59");
    assert.equal(words.dayAndClockWords(new Date("2026-10-29T09:00:00Z")), "Thu 29 Oct, 9am");
    assert.equal(words.clockWords(new Date("2026-10-29T09:52:00Z")), "9:52am");
    assert.equal(words.programmeLine("fellowship", "AGI Strategy"), "Fellowship: AGI Strategy");
    assert.equal(words.programmeLine("incubator", "Alignment Research"), "Incubator: Alignment Research");
  });
});

describe("the records", () => {
  test("a person's link is 43 characters of the URL-safe alphabet, and nothing else is one", () => {
    assert.equal(records.isSurveyToken("A".repeat(43)), true);
    assert.equal(records.isSurveyToken("A".repeat(42)), false);
    assert.equal(records.isSurveyToken(`${"A".repeat(42)}/`), false);
  });

  test("a person is an account today; a row without one, or with a bad secret, is nobody's", () => {
    assert.equal(records.normalizeSurveyPerson("s__amara", { respondent: { kind: "account", uid: "amara" }, token: "x" }), null);
    assert.equal(records.normalizeSurveyPerson("s__amara", { respondent: null, token: "A".repeat(43) }), null);
    assert.equal(records.surveyPersonId("s1", { kind: "account", uid: "amara" }), "s1__amara");
  });

  test("an answer whose name has come off reads back with nobody", () => {
    const answer = records.normalizeSurveyAnswer("a1", { surveyId: "s1", respondent: null, answers: {}, via: "link" }, () => ({}));
    assert.equal(answer.respondent, null);
  });
});

// ---------------------------------------------------------------------------
// The survey's own question types, and the settings it adds to Worksheets'
// ---------------------------------------------------------------------------

const { offerFromProfile, profileFactsOf, LEVEL_OPTION, SUBJECT_OPTION } = await loadTs(join("lib", "surveys", "profileOffer.ts"));
const { answerPagesOf } = await loadTs(join("lib", "surveys", "answerView.ts"));

/** One of each kind a questionnaire asks, as a template would write them. */
const KINDS = [
  { kind: "section", id: "s_one", heading: "Where you are now", body: [] },
  {
    kind: "question",
    id: "q_stage",
    type: "singleChoice",
    title: "Which best describes you right now?",
    body: [],
    required: false,
    options: [
      { id: "o_s0", label: "Haven’t really thought about it" },
      { id: "o_s1", label: "Thought about it" },
      { id: "o_s2", label: "Seriously considering it" },
    ],
    look: "points",
    scores: { o_s0: 0, o_s1: 1, o_s2: 2 },
  },
  { kind: "question", id: "q_likely", type: "percent", title: "How likely is it?", hint: "Research and policy both count.", ends: { min: "Not at all", max: "Certain" } },
  {
    kind: "question",
    id: "q_kinds",
    type: "multipleChoice",
    title: "Which kinds of work interest you most?",
    body: [],
    required: false,
    options: [
      { id: "o_research", label: "Technical research" },
      { id: "o_policy", label: "Governance or policy" },
      { id: "o_ops", label: "Operations" },
      { id: "o_unsure", label: "Not sure" },
    ],
    maxPicks: 2,
    noneIds: ["o_unsure"],
  },
  { kind: "question", id: "q_explain", type: "scale", title: "How well could you explain it?", min: 1, max: 7, anchors: [{ at: 1, label: "Not at all" }, { at: 4, label: "The gist" }, { at: 7, label: "Hold my own" }] },
  { kind: "question", id: "q_people", type: "number", title: "How many people could you message?", max: 1000 },
  {
    kind: "question",
    id: "q_agree",
    type: "lines",
    title: "How much do you agree?",
    lines: [{ id: "l_next", label: "I know my next step." }, { id: "l_can", label: "I could contribute." }],
    scale: { max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree", points: ["Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"] },
  },
  { kind: "pageBreak", id: "pb_1" },
  { kind: "section", id: "s_two", heading: "About the programme", body: [] },
  { kind: "question", id: "q_back", type: "singleChoice", title: "Looking back, which described you before?", body: [], required: false, options: [{ id: "o_s0", label: "Haven’t really thought about it" }, { id: "o_s1", label: "Thought about it" }, { id: "o_s2", label: "Seriously considering it" }], look: "points", scores: { o_s0: 0, o_s1: 1, o_s2: 2 }, lookBackOf: "q_stage" },
  { kind: "question", id: "q_recommend", type: "scale", title: "How likely are you to recommend it?", min: 0, max: 10, anchors: [{ at: 0, label: "Not at all likely" }, { at: 10, label: "Extremely likely" }] },
  {
    kind: "question",
    id: "q_shaped",
    type: "multipleChoice",
    title: "What else has shaped your plans?",
    body: [],
    required: false,
    options: [{ id: "o_bluedot", label: "BlueDot" }, { id: "o_friends", label: "Friends" }, { id: "o_news", label: "AI news" }],
    most: "Which mattered most?",
  },
  { kind: "question", id: "q_got", type: "scale", title: "Did you get what you wanted from it?", min: 1, max: 5, anchors: [{ at: 1, label: "Not at all" }, { at: 5, label: "Completely" }], pipe: { from: "q_want", words: "At the start you said:" } },
  { kind: "question", id: "q_level", type: "singleChoice", title: "Your level of study", body: [], required: false, options: [{ id: "o_masters", label: "Master’s" }, { id: "o_phd", label: "PhD" }, { id: "o_other", label: "Other" }], look: "menu", profile: "level" },
  { kind: "question", id: "q_fte", type: "singleChoice", title: "What share of your working time goes on it?", body: [], required: false, options: [{ id: "o_0", label: "None" }, { id: "o_half", label: "About half" }, { id: "o_all", label: "All of it" }], scores: { o_0: 0, o_half: 0.5, o_all: 1 }, scoreUnit: "FTE" },
  { kind: "consent", id: "c_consent", statement: "Results with no names go to our funders.", boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months" }] },
];
const OWN = items.sanitizeSurveyItems(structuredClone(KINDS));
const byId = (id) => OWN.find((item) => item.id === id);

describe("the survey's own questions: stored and read back", () => {
  test("every kind and setting reads back as it was written", () => {
    assert.deepEqual(OWN, KINDS);
    assert.deepEqual(items.validateSurveyItems(OWN), []);
    assert.equal(items.surveyQuestionsOf(OWN).length, 12, "a consent block is not a question");
    assert.deepEqual(items.consentPurposesOf(OWN), ["followUps"]);
    assert.equal(items.scoreOf(byId("q_fte"), "o_half"), 0.5);
  });

  test("settings a kind cannot carry are dropped on reading", () => {
    const read = items.sanitizeSurveyItems([
      { kind: "question", id: "a", type: "multipleChoice", title: "t", body: [], required: false, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], look: "points", scores: { x: 1 }, profile: "level" },
      { kind: "question", id: "b", type: "singleChoice", title: "t", body: [], required: false, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], maxPicks: 1, most: "Most?", noneIds: ["x"], scores: { x: 1, gone: 2 } },
      { kind: "consent", id: "c", statement: "s", boxes: [{ purpose: "made-up", label: "x" }] },
      { kind: "question", id: "d", type: "percent", title: "t", ends: "nonsense", pipe: { words: "no source" } },
    ]);
    assert.deepEqual(Object.keys(read[0]).filter((key) => ["look", "scores", "profile"].includes(key)), [], "pick any takes no points, scores or profile");
    assert.deepEqual(Object.keys(read[1]).filter((key) => ["maxPicks", "most", "noneIds"].includes(key)), [], "choose one takes no limit and no second part");
    assert.deepEqual(read[1].scores, { x: 1 }, "a score for an option that is not there is dropped");
    assert.deepEqual(read[2].boxes, [], "a box for a purpose the site does not know is dropped");
    assert.deepEqual(read[3].ends, { min: "", max: "" });
    assert.equal("pipe" in read[3], false, "a pipe that names no question is dropped");
  });
});

describe("the survey's own questions: what the editor's save is refused", () => {
  const broken = (id, change) => {
    const copy = structuredClone(KINDS);
    change(copy.find((item) => item.id === id));
    return items.validateSurveyItems(items.sanitizeSurveyItems(copy, { clampLimits: false })).map((problem) => problem.message);
  };

  test("each kind's own limits", () => {
    assert.ok(broken("q_likely", (q) => (q.ends.max = "x".repeat(81))).some((m) => /0% or 100%/.test(m)));
    assert.ok(broken("q_people", (q) => (q.max = 0)).some((m) => /largest number/.test(m)));
    assert.ok(broken("q_explain", (q) => (q.min = 2)).some((m) => /starts at 0 or at 1/.test(m)));
    assert.ok(broken("q_explain", (q) => (q.max = 11)).some((m) => /tops out by 10/.test(m)));
    assert.ok(broken("q_explain", (q) => (q.anchors[1].at = 9)).some((m) => /a point the scale doesn’t have: 9/.test(m)));
    assert.ok(broken("q_explain", (q) => (q.anchors[1].at = 1)).some((m) => /same point/.test(m)));
    assert.ok(broken("q_agree", (q) => q.scale.points.pop()).some((m) => /Every point of the scale needs its words: 5/.test(m)));
    assert.ok(broken("q_stage", (q) => q.options.push({ id: "o_new", label: "New" })).some((m) => /reworded but not added/.test(m)));
    assert.ok(broken("q_kinds", (q) => (q.maxPicks = 5)).some((m) => /from 1 to 4/.test(m)));
    assert.ok(broken("c_consent", (c) => (c.statement = " ")).some((m) => /needs its statement/.test(m)));
    assert.ok(broken("c_consent", (c) => c.boxes.push({ purpose: "followUps", label: "Again" })).some((m) => /ask the same thing/.test(m)));
    assert.ok(broken("q_back", (q) => (q.lookBackOf = "q_people")).some((m) => /looks back on a question/.test(m)));
    assert.ok(broken("q_likely", (q) => (q.hint = "x".repeat(301))).some((m) => /line under this question/.test(m)));
  });

  test("none of them can be required, and a consent box is no question", () => {
    assert.ok(broken("q_stage", (q) => (q.required = true)).includes("Every question in a survey can be skipped, so none is required."));
  });

  test("the same questions: a consent block counts, and its boxes too", () => {
    assert.equal(items.sameQuestions(OWN, OWN.filter((item) => item.kind !== "consent")), false);
    const moved = structuredClone(OWN).reverse();
    assert.equal(items.sameQuestions(OWN, moved), true);
    const retyped = structuredClone(OWN);
    retyped.find((item) => item.id === "q_people").type = "percent";
    assert.equal(items.sameQuestions(OWN, items.sanitizeSurveyItems(retyped)), false);
  });
});

describe("the survey's own questions: the answers a person sends", () => {
  const read = (raw) => items.readSurveyAnswers(OWN, raw);
  const refused = (raw) => read(raw).problems.map((problem) => problem.message);

  test("a percentage, a number and a scale keep the number given, 0 included", () => {
    const { answers, problems } = read({
      q_likely: { type: "percent", value: 0 },
      q_people: { type: "number", value: 0 },
      q_recommend: { type: "scale", value: 0 },
      q_explain: { type: "scale", value: 7 },
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(answers, {
      q_likely: { type: "percent", value: 0 },
      q_people: { type: "number", value: 0 },
      q_recommend: { type: "scale", value: 0 },
      q_explain: { type: "scale", value: 7 },
    });
  });

  test("each is refused out of its range, or not whole, in a sentence", () => {
    assert.deepEqual(refused({ q_likely: { type: "percent", value: 101 } }), ["Give a number from 0 to 100."]);
    assert.deepEqual(refused({ q_likely: { type: "percent", value: 40.5 } }), ["Give a number from 0 to 100."]);
    assert.deepEqual(refused({ q_people: { type: "number", value: 1001 } }), ["Give a whole number from 0 to 1000."]);
    assert.deepEqual(refused({ q_people: { type: "number", value: -1 } }), ["Give a whole number from 0 to 1000."]);
    assert.deepEqual(refused({ q_explain: { type: "scale", value: 0 } }), ["Pick a number from 1 to 7."]);
    assert.deepEqual(refused({ q_recommend: { type: "percent", value: 5 } }), ["That answer is not in a shape this question understands."]);
  });

  test("pick up to: more than the limit is refused", () => {
    assert.deepEqual(refused({ q_kinds: { type: "choices", optionIds: ["o_research", "o_policy", "o_ops"] } }), ["Pick up to 2."]);
    assert.deepEqual(read({ q_kinds: { type: "choices", optionIds: ["o_research", "o_policy"] } }).answers.q_kinds, { type: "choices", optionIds: ["o_research", "o_policy"] });
  });

  test("which mattered most: one of those ticked, or nothing", () => {
    assert.deepEqual(read({ q_shaped: { type: "choices", optionIds: ["o_bluedot", "o_news"], most: "o_news" } }).answers.q_shaped, {
      type: "choices",
      optionIds: ["o_bluedot", "o_news"],
      most: "o_news",
    });
    assert.deepEqual(refused({ q_shaped: { type: "choices", optionIds: ["o_bluedot"], most: "o_news" } }), ["Pick the one that mattered most from those you ticked."]);
    assert.deepEqual(read({ q_shaped: { type: "choices", optionIds: ["o_friends"], most: "" } }).answers.q_shaped, { type: "choices", optionIds: ["o_friends"] });
    // A question with no second part keeps none, whatever was sent.
    assert.deepEqual(read({ q_kinds: { type: "choices", optionIds: ["o_ops"], most: "o_ops" } }).answers.q_kinds, { type: "choices", optionIds: ["o_ops"] });
  });

  test("a consent box is a yes or a no on its own, never an answer", () => {
    assert.deepEqual(items.readSurveyConsents(OWN, { followUps: true }), { consents: { followUps: true }, problem: null });
    assert.deepEqual(items.readSurveyConsents(OWN, undefined), { consents: { followUps: false }, problem: null }, "a box left unticked is a no");
    assert.deepEqual(items.readSurveyConsents(OWN, {}), { consents: { followUps: false }, problem: null });
    assert.equal(items.readSurveyConsents(OWN, { kairos: true }).problem, "One of those boxes isn’t on this survey.");
    assert.equal(items.readSurveyConsents(OWN, { followUps: "yes" }).problem, "Your answers did not arrive in a shape the survey understands.");
    assert.deepEqual(items.readSurveyConsents(TEMPLATE, undefined), { consents: {}, problem: null }, "a survey with no consent block takes none");
    assert.deepEqual(refused({ c_consent: { type: "choice", optionId: "x" } }), ["One of those answers is to a question this survey doesn’t ask."]);
  });
});

describe("the survey's own questions: totals", () => {
  const sets = [
    { answers: { q_stage: { type: "choice", optionId: "o_s1" }, q_likely: { type: "percent", value: 10 }, q_people: { type: "number", value: 0 }, q_recommend: { type: "scale", value: 10 }, q_shaped: { type: "choices", optionIds: ["o_bluedot", "o_news"], most: "o_news" }, q_fte: { type: "choice", optionId: "o_half" } } },
    { answers: { q_stage: { type: "choice", optionId: "o_s2" }, q_likely: { type: "percent", value: 60 }, q_people: { type: "number", value: 4 }, q_recommend: { type: "scale", value: 6 }, q_shaped: { type: "choices", optionIds: ["o_news"], most: "o_news" }, q_fte: { type: "choice", optionId: "o_all" } } },
    { answers: { q_likely: { type: "percent", value: 35 }, q_people: { type: "number", value: 12 }, q_recommend: { type: "scale", value: 9 } } },
  ];
  const results = surveyResults(OWN, sets);
  const result = (id) => results.find((each) => each.id === id);

  test("a percentage and a number: average, middle value, spread and bands", () => {
    assert.deepEqual(result("q_likely"), {
      kind: "value",
      id: "q_likely",
      number: 2,
      title: "How likely is it?",
      unit: "%",
      respondents: 3,
      mean: 35,
      median: 35,
      lowest: 10,
      highest: 60,
      bands: [
        { label: "0 to 19%", count: 1 },
        { label: "20 to 39%", count: 1 },
        { label: "40 to 59%", count: 0 },
        { label: "60 to 79%", count: 1 },
        { label: "80 to 100%", count: 0 },
      ],
    });
    assert.deepEqual(result("q_people").bands.map((band) => band.count), [1, 0, 1, 0, 1]);
    assert.equal(result("q_people").median, 4);
  });

  test("a 0 to 10 scale counts from 0 and gives its net promoter score", () => {
    const recommend = result("q_recommend");
    assert.equal(recommend.min, 0);
    assert.equal(recommend.rows[0].counts.length, 11);
    assert.equal(recommend.rows[0].counts[10], 1);
    // One at 9 or 10 twice over, one at 6: (2 - 1) of 3.
    assert.equal(recommend.promoterScore, 33);
    assert.equal(result("q_explain").promoterScore, null, "only a 0 to 10 scale has one");
  });

  test("which mattered most is counted on its own; scored answers total their numbers", () => {
    assert.equal(result("q_shaped").most.respondents, 2);
    assert.equal(result("q_shaped").most.options.find((option) => option.label === "AI news").count, 2);
    assert.deepEqual(result("q_fte").scored, { total: 1.5, mean: 0.75, unit: "FTE" });
    assert.deepEqual(result("q_stage").scored, { total: 3, mean: 1.5, unit: "" });
  });

  test("the results carry no person", () => {
    assert.doesNotMatch(JSON.stringify(results), /uid/);
  });
});

describe("the survey's own questions: the spreadsheet", () => {
  test("a number for a scale, a percentage or a number, and a column for which mattered most", () => {
    const table = surveyExportTable(OWN, [
      { name: "Zoe Example", sentAt: new Date("2026-10-29T09:00:00Z"), via: "link", afterFirstSession: false, answers: { q_likely: { type: "percent", value: 0 }, q_explain: { type: "scale", value: 4 }, q_shaped: { type: "choices", optionIds: ["o_bluedot", "o_news"], most: "o_news" } } },
    ]);
    const cell = (header) => table.rows[0][table.header.indexOf(header)];
    assert.equal(cell("2. How likely is it?"), "0");
    assert.equal(cell("4. How well could you explain it?"), "4");
    assert.equal(cell("9. What else has shaped your plans?"), "BlueDot; AI news");
    assert.equal(cell("9. What else has shaped your plans?: Which mattered most?"), "AI news");
    assert.ok(table.header.every((column, at) => at < 4 || /^\d+\. /.test(column)), "every column after the first four is a question's");
    assert.ok(!table.header.some((column) => /consent|contact me/i.test(column)), "what the consent boxes say is not in the file");
  });
});

describe("what a survey offers from a person's profile", () => {
  const levels = Object.values(LEVEL_OPTION);
  const subjects = Object.values(SUBJECT_OPTION);
  const facts = (status, subject = "") => ({ status, subject });

  test("the level, only where the profile holds it", () => {
    assert.equal(offerFromProfile("level", facts("masters"), levels), LEVEL_OPTION.masters);
    assert.equal(offerFromProfile("level", facts("phd"), levels), LEVEL_OPTION.phd);
    assert.equal(offerFromProfile("level", facts("employee"), levels), LEVEL_OPTION.staff);
    assert.equal(offerFromProfile("level", facts("postdoc"), levels), LEVEL_OPTION.staff);
    assert.equal(offerFromProfile("level", facts("undergraduate"), levels), null, "the profile does not say which year");
    assert.equal(offerFromProfile("level", facts("foundation"), levels), null);
    assert.equal(offerFromProfile("level", facts("masters"), levels.filter((id) => id !== LEVEL_OPTION.masters)), null, "an answer the question no longer has");
  });

  test("the subject, only when exactly one subject's words are in it", () => {
    assert.equal(offerFromProfile("subject", facts("undergraduate", "BA Philosophy"), subjects), SUBJECT_OPTION.philosophy);
    assert.equal(offerFromProfile("subject", facts("undergraduate", "BSc Mathematics"), subjects), SUBJECT_OPTION.maths);
    assert.equal(offerFromProfile("subject", facts("undergraduate", "Computer Science with Artificial Intelligence"), subjects), SUBJECT_OPTION.cs);
    assert.equal(offerFromProfile("subject", facts("masters", "MEng Mechanical Engineering"), subjects), SUBJECT_OPTION.physicsEngineering);
    assert.equal(offerFromProfile("subject", facts("undergraduate", "Politics and International Relations"), subjects), SUBJECT_OPTION.politics);
    assert.equal(offerFromProfile("subject", facts("undergraduate", "Philosophy, Politics and Economics"), subjects), null);
    assert.equal(offerFromProfile("subject", facts("undergraduate", "History"), subjects), null);
    assert.equal(offerFromProfile("subject", facts("undergraduate", ""), subjects), null);
  });

  test("only the two values an offer needs are read from the account", () => {
    assert.deepEqual(profileFactsOf({ email: "zoe@example.com", profile: { status: "phd", subject: "Law", motivation: "x", universityEmail: "z@nottingham.ac.uk" } }), {
      status: "phd",
      subject: "Law",
    });
    assert.deepEqual(profileFactsOf({}), { status: "", subject: "" });
  });
});

describe("the answer page's model of each kind", () => {
  const pages = answerPagesOf({ items: OWN }, { offered: { q_level: "o_phd" }, piped: { q_got: "At the start you said: “To explain it clearly.”" } });
  const question = (id) => pages.flatMap((page) => page.questions).find((each) => each.id === id);

  test("two pages, numbered across them, the consent block on the page that holds it", () => {
    assert.deepEqual(pages.map((page) => page.heading), ["Where you are now", "About the programme"]);
    assert.deepEqual(pages.map((page) => page.questions.map((each) => each.number)), [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
    assert.deepEqual(pages[1].consents, [{ id: "c_consent", statement: "Results with no names go to our funders.", boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months" }] }]);
    assert.deepEqual(pages[0].consents, []);
  });

  test("each kind carries what it is drawn with, and nothing of anybody else", () => {
    assert.deepEqual(question("q_stage").options.map((option) => option.point), ["0", "1", "2"]);
    assert.equal(question("q_stage").look, "points");
    assert.equal(question("q_fte").look, "rows", "a scored answer without points is drawn as rows");
    assert.equal(question("q_fte").options[0].point, "");
    assert.equal(question("q_kinds").maxPicks, 2);
    assert.equal(question("q_shaped").most, "Which mattered most?");
    assert.equal(question("q_level").look, "menu");
    assert.equal(question("q_level").offered, "o_phd");
    assert.equal(question("q_got").piped, "At the start you said: “To explain it clearly.”");
    assert.equal(question("q_likely").hint, "Research and policy both count.");
    assert.deepEqual(question("q_explain").anchors, [{ at: 1, label: "Not at all" }, { at: 4, label: "The gist" }, { at: 7, label: "Hold my own" }]);
    assert.deepEqual(question("q_agree").points, ["Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"]);
    assert.equal(question("q_people").max, 1000);
    // An offer for an answer the menu does not have is no offer.
    const stale = answerPagesOf({ items: OWN }, { offered: { q_level: "o_ug1" }, piped: {} });
    assert.equal(stale.flatMap((page) => page.questions).find((each) => each.id === "q_level").offered, "");
  });
});
