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
    assert.deepEqual(q4.rows[0], { label: LINES[0], respondents: 2, counts: [0, 1, 0, 1, 0], mean: 3 });
    assert.deepEqual(q4.rows[1], { label: LINES[1], respondents: 1, counts: [0, 0, 0, 1, 0], mean: 4 });
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
