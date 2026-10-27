/**
 * A SURVEY'S QUESTIONS, WORDS AND TOTALS, as pure functions (docs/surveys.md):
 * the programme impact questionnaire's templates word for word (before a
 * programme, at its end, the follow-ups at 6 and 12 months, and an
 * incubator's additions), the stages pairing by id, the item model on
 * Worksheets' parts with the questions Worksheets lacks, the answers a route
 * accepts, the totals and the spreadsheet, the confidential box for every
 * kind of person, the two emails word for word, and the day names come off.
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
const templates = await loadTs(join("lib", "surveys", "templates.ts"));
const words = await loadTs(join("lib", "surveys", "words.ts"));
const { surveyResults } = await loadTs(join("lib", "surveys", "results.ts"));
const { surveyExportTable, exportFilename, NAME_TAKEN_OFF } = await loadTs(join("lib", "surveys", "exportTable.ts"));
const { twoYearsAfter, namesDueOff, NAMES_KEPT_YEARS } = await loadTs(join("lib", "surveys", "namesOff.ts"));
const records = await loadTs(join("lib", "firestore", "surveys.ts"));

const TEMPLATE = templates.templateItems("before", "fellowship", null);
const AFTER = templates.templateItems("after", "fellowship", null);
const FOLLOW_UP = templates.templateItems("followUp6", "fellowship", null);
const INCUBATOR_BEFORE = templates.templateItems("before", "incubator", "governance");
const INCUBATOR_AFTER = templates.templateItems("after", "incubator", "alignment");
const questionsOf = (list) => items.surveyQuestionsOf(list);
const questions = questionsOf(TEMPLATE);
const question = (list, id) => questionsOf(list).find((each) => each.id === id);
const labels = (list, id) => question(list, id).options.map((option) => option.label);
/** Each page's heading and what is on it, by id. */
const pagesOf = (list) =>
  items.surveyPagesOf(list).map((page) => ({
    heading: page.find((item) => item.kind === "section").heading,
    ids: page.filter((item) => item.kind !== "section").map((item) => item.id),
  }));

const STAGES = [
  "Haven’t really thought about working on AI safety",
  "Thought about it, not a serious option",
  "One of several options I’m seriously considering",
  "My leading plan, no concrete steps yet",
  "Taking concrete steps (applying, upskilling, choosing modules or a dissertation)",
  "Already doing AI safety work, paid or unpaid",
];
const AGREE = ["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"];
const C9_WORDS = [
  "Applied to an AI safety programme or job",
  "Attended an AI safety event outside NAISI",
  "Had a 1:1 with someone in the field",
  "Written something on AI safety",
  "Chosen a module, project or dissertation on it",
  "Started your own project",
  "None of these",
];

describe("the before survey, word for word (the questionnaire's P3 to P7 and C1 to C9)", () => {
  test("14 questions and the consent, on five pages under their headings", () => {
    assert.deepEqual(pagesOf(TEMPLATE), [
      { heading: "About you", ids: ["q_p3_level", "q_p3_subject", "q_p4", "q_p5"] },
      { heading: "Where you are now", ids: ["q_c1", "q_c2", "q_c3"] },
      { heading: "What you know, and who", ids: ["q_c4", "q_c5", "q_c6", "q_c7"] },
      { heading: "What you’ve done", ids: ["q_c8", "q_c9"] },
      { heading: "To finish", ids: ["q_p6", "c_p7"] },
    ]);
    assert.equal(questions.length, 14);
  });

  test("P3 to P6: each question's words and answers, exactly", () => {
    assert.deepEqual(
      ["q_p3_level", "q_p3_subject", "q_p4", "q_p5", "q_p6"].map((id) => question(TEMPLATE, id).title),
      [
        "Level of study",
        "Subject of study",
        "Before this programme, which of these had you done?",
        "How did you first hear about NAISI?",
        "What do you most want to get out of this programme?",
      ],
    );
    assert.deepEqual(labels(TEMPLATE, "q_p3_level"), [
      "Undergraduate, first year",
      "Undergraduate, second year",
      "Undergraduate, third year",
      "Undergraduate, fourth year or later",
      "Master’s",
      "PhD",
      "Staff",
      "Other",
    ]);
    assert.deepEqual(labels(TEMPLATE, "q_p3_subject"), ["Computer science", "Maths", "Physics or engineering", "Law", "Politics", "Philosophy", "Economics", "Other"]);
    for (const id of ["q_p3_level", "q_p3_subject"]) {
      assert.equal(question(TEMPLATE, id).look, "menu", `${id} is a menu`);
    }
    assert.equal(question(TEMPLATE, "q_p3_level").profile, "level", "P3 is offered from the profile where it holds it");
    assert.equal(question(TEMPLATE, "q_p3_subject").profile, "subject");
    assert.deepEqual(labels(TEMPLATE, "q_p4"), [
      "BlueDot or similar course",
      "Another AI safety group",
      "AI safety books, LessWrong or 80,000 Hours",
      "An AI safety talk or event",
      "ML research or coursework",
      "None of these",
    ]);
    assert.deepEqual(labels(TEMPLATE, "q_p5"), ["Freshers’ fair", "Intro talk", "Lecturer or module", "Friend", "Social media", "Newsletter", "Other"]);
    assert.equal(question(TEMPLATE, "q_p4").type, "multipleChoice");
    assert.equal(question(TEMPLATE, "q_p5").type, "multipleChoice");
    assert.equal(question(TEMPLATE, "q_p6").type, "shortText", "P6 is one line");
  });

  test("C1 to C9: each question's words, kind and answers, exactly", () => {
    const c1 = question(TEMPLATE, "q_c1");
    assert.equal(c1.title, "Which best describes you right now?");
    assert.deepEqual(labels(TEMPLATE, "q_c1"), STAGES);
    assert.equal(c1.look, "points", "every point of C1 is described, with its number");
    assert.deepEqual(c1.options.map((option) => c1.scores[option.id]), [0, 1, 2, 3, 4, 5]);
    const c2 = question(TEMPLATE, "q_c2");
    assert.deepEqual([c2.type, c2.title, c2.hint], [
      "percent",
      "How likely is it that in 5 years most of your working time goes on reducing risks from advanced AI?",
      "Research, policy, engineering, operations and fieldbuilding all count.",
    ]);
    const c3 = question(TEMPLATE, "q_c3");
    assert.equal(c3.title, "Which kinds of work interest you most?");
    assert.equal(c3.maxPicks, 3, "up to 3");
    assert.deepEqual(labels(TEMPLATE, "q_c3"), [
      "Technical research",
      "Engineering",
      "Governance or policy",
      "Strategy",
      "Operations or generalist",
      "Fieldbuilding or comms",
      "Founding something",
      "Not sure",
    ]);
    assert.deepEqual(question(TEMPLATE, "q_c4"), {
      kind: "question",
      id: "q_c4",
      type: "scale",
      title: "How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections?",
      min: 1,
      max: 7,
      anchors: [
        { at: 1, label: "Not at all" },
        { at: 4, label: "The gist, to a friend" },
        { at: 7, label: "Could hold my own with a researcher" },
      ],
    });
    assert.deepEqual(question(TEMPLATE, "q_c5"), {
      kind: "question",
      id: "q_c5",
      type: "scale",
      title: "How familiar are you with the main organisations, research agendas and policy debates in AI safety?",
      min: 1,
      max: 7,
      anchors: [
        { at: 1, label: "Couldn’t name any" },
        { at: 4, label: "Could name a few and roughly what they do" },
        { at: 7, label: "Could describe most major orgs’ agendas well enough that their staff would agree" },
      ],
    });
    assert.deepEqual(question(TEMPLATE, "q_c6"), {
      kind: "question",
      id: "q_c6",
      type: "number",
      title: "How many people working in AI safety would you feel comfortable messaging for 30 minutes of advice?",
      max: 1000,
    });
    const c7 = question(TEMPLATE, "q_c7");
    assert.equal(c7.title, "How much do you agree?");
    assert.deepEqual(c7.lines.map((line) => line.label), [
      "I know what my next concrete step towards AI safety work would be.",
      "I could make a meaningful contribution to AI safety.",
    ]);
    assert.deepEqual(c7.scale, { max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree", points: AGREE });
    assert.equal(question(TEMPLATE, "q_c8").title, "What, if anything, stands between you and contributing to AI safety?");
    assert.deepEqual(labels(TEMPLATE, "q_c8"), [
      "Not sure the risk is real",
      "Don’t know what roles exist",
      "Technical skills",
      "Research experience",
      "Credentials or publications",
      "Contacts",
      "Money, visa or location",
      "Other priorities",
      "Not sure I’d fit",
      "Nothing major",
    ]);
    assert.deepEqual(question(TEMPLATE, "q_c8").noneIds, ["o_nothing"]);
    assert.equal(question(TEMPLATE, "q_c9").title, "In the last 3 months, have you…");
    assert.deepEqual(labels(TEMPLATE, "q_c9"), C9_WORDS);
    assert.deepEqual(question(TEMPLATE, "q_c9").noneIds, ["o_none"]);
  });

  test("P7: the statement shown as text, one box for the follow-ups, unticked, and a place for the next", () => {
    const consent = TEMPLATE.find((item) => item.kind === "consent");
    assert.deepEqual(consent, {
      kind: "consent",
      id: "c_p7",
      statement: "Anonymised results go to our funders: totals, never your name.",
      boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months with a short follow-up survey" }],
    });
    // Nothing in the item says ticked: a box starts unticked on the page.
    assert.doesNotMatch(JSON.stringify(consent), /checked|default|given/);
    assert.equal(TEMPLATE.at(-1), consent, "the consent closes the survey, where a second box can go beside it");
  });

  test("nothing is required, and it is valid", () => {
    assert.ok(questions.every((each) => each.required !== true));
    assert.deepEqual(items.validateSurveyItems(TEMPLATE), []);
  });
});

describe("the survey at the end, word for word (C1 to C9 again, T1 to T3, A1 to A5, Q1 to Q3, N1 to N3)", () => {
  test("23 questions on seven pages under their headings", () => {
    assert.deepEqual(pagesOf(AFTER), [
      { heading: "Where you are now", ids: ["q_c1", "q_c2", "q_c3"] },
      { heading: "What you know, and who", ids: ["q_c4", "q_c5", "q_c6", "q_c7"] },
      { heading: "What you’ve done", ids: ["q_c8", "q_c9"] },
      { heading: "Looking back", ids: ["q_t1", "q_t2", "q_t3"] },
      { heading: "What the programme did", ids: ["q_a1", "q_a2", "q_a3", "q_a4", "q_a5"] },
      { heading: "How it went", ids: ["q_q1", "q_q2", "q_q3"] },
      // The follow-ups box again, for somebody the before survey never asked
      // (part (b) of the questionnaire's build; it asked none before).
      { heading: "What’s next", ids: ["q_n1", "q_n2", "q_n3", "c_end"] },
    ]);
    assert.deepEqual(items.validateSurveyItems(AFTER), []);
    assert.deepEqual(
      AFTER.at(-1),
      {
        kind: "consent",
        id: "c_end",
        statement: "Anonymised results go to our funders: totals, never your name.",
        boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months with a short follow-up survey" }],
      },
      "the end closes with P7's follow-ups box, in P7's words",
    );
    assert.doesNotMatch(JSON.stringify(AFTER.at(-1)), /checked|default|given/, "the box at the end starts ticked");
    assert.equal(AFTER.filter((item) => item.kind === "consent").length, 1, "the end asks one consent");
  });

  test("C1 to C8 in the same words as before; C9 since the programme started", () => {
    for (const id of ["q_c1", "q_c2", "q_c3", "q_c4", "q_c5", "q_c6", "q_c7", "q_c8"]) {
      assert.deepEqual(question(AFTER, id), question(TEMPLATE, id), `${id} changed between the stages`);
    }
    assert.equal(question(AFTER, "q_c9").title, "Since the programme started, have you…");
    assert.deepEqual(question(AFTER, "q_c9").options, question(TEMPLATE, "q_c9").options);
  });

  test("T1 to T3 look back on C1, C4 and C5, on their scales", () => {
    const t1 = question(AFTER, "q_t1");
    assert.deepEqual([t1.title, t1.lookBackOf, t1.look], ["Looking back, which best described you before the programme?", "q_c1", "points"]);
    assert.deepEqual(t1.options, question(TEMPLATE, "q_c1").options);
    assert.deepEqual(t1.scores, question(TEMPLATE, "q_c1").scores);
    const t2 = question(AFTER, "q_t2");
    assert.deepEqual([t2.title, t2.lookBackOf], ["Looking back, how well could you have explained the risk argument before?", "q_c4"]);
    assert.deepEqual(t2.anchors, question(TEMPLATE, "q_c4").anchors);
    const t3 = question(AFTER, "q_t3");
    assert.deepEqual([t3.title, t3.lookBackOf], ["Looking back, how familiar were you with the field before?", "q_c5"]);
    assert.deepEqual(t3.anchors, question(TEMPLATE, "q_c5").anchors);
  });

  test("A1 to A5", () => {
    assert.equal(question(AFTER, "q_a1").title, "How has the programme affected your career plans?");
    assert.deepEqual(labels(AFTER, "q_a1"), ["No change", "Clarified but didn’t change", "Sped up plans I already had", "Moved me towards AI safety", "Moved me away from it"]);
    const a2 = question(AFTER, "q_a2");
    assert.deepEqual([a2.type, a2.title, a2.ends], [
      "percent",
      "Without this programme, how likely is it you’d be where you are now on AI safety, with the same plans and next steps?",
      { min: "Definitely not", max: "Definitely anyway" },
    ]);
    assert.equal(question(AFTER, "q_a3").title, "Did it speed up anything you’d have done anyway?");
    assert.deepEqual(labels(AFTER, "q_a3"), ["No", "Under 1 month", "1 to 6 months", "Over 6 months"]);
    const a4 = question(AFTER, "q_a4");
    assert.deepEqual([a4.title, a4.most], ["What else has shaped your current plans?", "Which of those mattered most?"]);
    assert.deepEqual(labels(AFTER, "q_a4"), ["BlueDot", "80,000 Hours", "Other courses or groups", "Friends", "Lecturers", "AI news", "Other"]);
    assert.deepEqual([question(AFTER, "q_a5").type, question(AFTER, "q_a5").title], ["longText", "Did the programme have any negative effect on you or your plans?"]);
  });

  test("Q1 to Q3: 0 to 10, the parts, and their own answer at the start shown above Q3", () => {
    assert.deepEqual(question(AFTER, "q_q1"), {
      kind: "question",
      id: "q_q1",
      type: "scale",
      title: "How likely are you to recommend this programme to a friend with similar interests?",
      min: 0,
      max: 10,
      anchors: [
        { at: 0, label: "Not at all likely" },
        { at: 10, label: "Extremely likely" },
      ],
    });
    const q2 = question(AFTER, "q_q2");
    assert.deepEqual([q2.title, q2.hint], ["How valuable was each part?", "Leave a part blank if you didn’t have it."]);
    assert.deepEqual(q2.lines.map((line) => line.label), ["Sessions", "Readings", "Facilitator", "Other participants", "Speakers", "Socials", "1:1s"]);
    assert.deepEqual(q2.scale, { max: 5, minLabel: "Not valuable", maxLabel: "Very valuable" });
    const q3 = question(AFTER, "q_q3");
    assert.deepEqual([q3.title, q3.min, q3.max, q3.pipe], ["Did you get what you wanted from it?", 1, 5, { from: "q_p6", words: "At the start you said:" }]);
  });

  test("N1 to N3", () => {
    assert.equal(question(AFTER, "q_n1").title, "What are you planning next?");
    assert.deepEqual(labels(AFTER, "q_n1"), [
      "NAISI spring incubator",
      "SPAR",
      "MATS",
      "ARENA",
      "BlueDot advanced course",
      "GCP workshop",
      "Other fellowship (ERA, LASR, Pivotal)",
      "EAG or EAGx",
      "Own project",
      "Dissertation topic",
      "Nothing yet",
    ]);
    assert.equal(question(AFTER, "q_n2").title, "Would you like to facilitate or help organise NAISI next term?");
    assert.deepEqual(labels(AFTER, "q_n2"), ["Yes", "Maybe", "No"]);
    assert.equal(question(AFTER, "q_n3").title, "Would you like a 1:1 about next steps?");
    assert.deepEqual(labels(AFTER, "q_n3"), ["Yes", "No"]);
  });
});

describe("the follow-ups at 6 and 12 months, word for word (F1 to F7)", () => {
  test("the same 11 questions at both, on three pages", () => {
    assert.deepEqual(pagesOf(FOLLOW_UP), [
      { heading: "What you’re doing now", ids: ["q_f1", "q_f1_where", "q_f2", "q_f3"] },
      { heading: "Since the programme", ids: ["q_f4_applied", "q_f4_accepted", "q_c1", "q_c2"] },
      { heading: "Looking back", ids: ["q_a2", "q_a4", "q_f7"] },
    ]);
    assert.deepEqual(templates.templateItems("followUp12", "fellowship", null), FOLLOW_UP);
    assert.deepEqual(templates.templateItems("followUp6", "incubator", "alignment"), FOLLOW_UP, "an incubator's follow-ups are the same");
    assert.deepEqual(items.validateSurveyItems(FOLLOW_UP), []);
  });

  test("F1 to F4 and F7", () => {
    assert.equal(question(FOLLOW_UP, "q_f1").title, "What’s your main activity now?");
    assert.deepEqual(labels(FOLLOW_UP, "q_f1"), ["Studying", "Employed", "Fellowship or programme", "Independent work", "Other"]);
    assert.deepEqual([question(FOLLOW_UP, "q_f1_where").type, question(FOLLOW_UP, "q_f1_where").title], ["shortText", "The organisation or course"]);
    assert.deepEqual([question(FOLLOW_UP, "q_f3").title, question(FOLLOW_UP, "q_f3").hint], ["What is that work?", "Your role, and the organisation or programme."]);
    assert.equal(question(FOLLOW_UP, "q_f4_applied").title, "Since the programme, which programmes or jobs have you applied to?");
    assert.equal(question(FOLLOW_UP, "q_f4_accepted").title, "Which of those accepted you?");
    assert.equal(question(FOLLOW_UP, "q_f7").title, "Anything else that happened partly because of NAISI?");
  });

  test("F2 is scored as FTE: 0, 0.05, 0.3, 0.7 and 1", () => {
    const f2 = question(FOLLOW_UP, "q_f2");
    assert.equal(f2.title, "Roughly what share of your working time goes on AI safety?");
    assert.deepEqual(labels(FOLLOW_UP, "q_f2"), ["None", "Under 10%", "10 to 50%", "50 to 90%", "Over 90%"]);
    assert.deepEqual(f2.options.map((option) => f2.scores[option.id]), [0, 0.05, 0.3, 0.7, 1]);
    assert.equal(f2.scoreUnit, "FTE");
  });

  test("F5 is C1 and C2 again, F6 is A2 and A4 again: the same questions", () => {
    for (const id of ["q_c1", "q_c2"]) assert.deepEqual(question(FOLLOW_UP, id), question(TEMPLATE, id), id);
    for (const id of ["q_a2", "q_a4"]) assert.deepEqual(question(FOLLOW_UP, id), question(AFTER, id), id);
  });
});

describe("an incubator's additions (I1 to I7), each where the questionnaire puts it", () => {
  test("before: I1 with the rest about the person, I2 and I3 on their own page", () => {
    assert.deepEqual(pagesOf(INCUBATOR_BEFORE), [
      { heading: "About you", ids: ["q_p3_level", "q_p3_subject", "q_p4", "q_p5", "q_i1"] },
      { heading: "Where you are now", ids: ["q_c1", "q_c2", "q_c3"] },
      { heading: "What you know, and who", ids: ["q_c4", "q_c5", "q_c6", "q_c7"] },
      { heading: "Your research skills", ids: ["q_i2", "q_i3"] },
      { heading: "What you’ve done", ids: ["q_c8", "q_c9"] },
      { heading: "To finish", ids: ["q_p6", "c_p7"] },
    ]);
    assert.equal(question(INCUBATOR_BEFORE, "q_i1").title, "Research experience so far");
    assert.deepEqual(labels(INCUBATOR_BEFORE, "q_i1"), ["None", "Coursework project", "Independent project", "Paper or report submitted or published"]);
    assert.equal(question(INCUBATOR_BEFORE, "q_i3").title, "How many people could you approach to collaborate on an AI safety project?");
    assert.deepEqual(items.validateSurveyItems(INCUBATOR_BEFORE), []);
  });

  test("I2: its first line is worded for each incubator; the rest are the same", () => {
    const lines = (list) => question(list, "q_i2").lines.map((line) => line.label);
    const rest = [
      "I can scope a question answerable in a few weeks",
      "I can tell a promising direction from a dead end",
      "I could write results up well enough to post publicly",
      "I know how to get feedback from researchers outside NAISI",
    ];
    assert.deepEqual(lines(INCUBATOR_BEFORE), ["I could write a policy-relevant research memo", ...rest]);
    assert.deepEqual(lines(INCUBATOR_AFTER), ["I could reproduce the main result of an AI safety paper", ...rest]);
    assert.deepEqual(question(INCUBATOR_BEFORE, "q_i2").scale.points, AGREE);
    assert.deepEqual(
      question(INCUBATOR_BEFORE, "q_i2").lines.map((line) => line.id),
      question(INCUBATOR_AFTER, "q_i2").lines.map((line) => line.id),
      "the strand changes the words, never the line ids",
    );
  });

  test("at the end: I2 again with its look-back, I3 again, then the project page (I4 to I7)", () => {
    assert.deepEqual(pagesOf(INCUBATOR_AFTER), [
      { heading: "Where you are now", ids: ["q_c1", "q_c2", "q_c3"] },
      { heading: "What you know, and who", ids: ["q_c4", "q_c5", "q_c6", "q_c7"] },
      { heading: "Your research skills", ids: ["q_i2", "q_i3"] },
      { heading: "What you’ve done", ids: ["q_c8", "q_c9"] },
      { heading: "Looking back", ids: ["q_t1", "q_t2", "q_t3", "q_i2_back"] },
      { heading: "Your project", ids: ["q_i4", "q_i4_links", "q_i4_when", "q_i5", "q_i6", "q_i7"] },
      { heading: "What the programme did", ids: ["q_a1", "q_a2", "q_a3", "q_a4", "q_a5"] },
      { heading: "How it went", ids: ["q_q1", "q_q2", "q_q3"] },
      { heading: "What’s next", ids: ["q_n1", "q_n2", "q_n3", "c_end"] },
    ]);
    const back = question(INCUBATOR_AFTER, "q_i2_back");
    assert.deepEqual([back.title, back.lookBackOf], ["Looking back, how much would you have agreed before the incubator?", "q_i2"]);
    assert.deepEqual(back.lines, question(INCUBATOR_AFTER, "q_i2").lines);
    assert.equal(question(INCUBATOR_AFTER, "q_i4").title, "What did your team produce?");
    assert.deepEqual(labels(INCUBATOR_AFTER, "q_i4"), [
      "Replication completed",
      "Extension or twist with results",
      "Public code repo",
      "Blog, LessWrong or Alignment Forum post",
      "Policy brief or report",
      "Workshop or conference submission",
      "Talk at an event",
      "Nothing finished yet",
    ]);
    // The hint says the links may go to funders: the Kairos report lists them, and privacy v7 says so.
    assert.deepEqual([question(INCUBATOR_AFTER, "q_i4_links").title, question(INCUBATOR_AFTER, "q_i4_links").hint], ["Links to what your team produced", "One on each line. We may pass these on to our funders."]);
    assert.equal(question(INCUBATOR_AFTER, "q_i4_when").title, "If nothing is finished yet, when do you expect it to be?");
    assert.equal(question(INCUBATOR_AFTER, "q_i5").title, "Without the incubator, would this output exist?");
    assert.deepEqual(labels(INCUBATOR_AFTER, "q_i5"), ["Definitely", "Probably", "Possibly not", "Probably not"]);
    assert.equal(question(INCUBATOR_AFTER, "q_i6").title, "How much did the incubator speed it up?");
    assert.deepEqual(labels(INCUBATOR_AFTER, "q_i6"), ["Not at all", "Under 1 month", "1 to 6 months", "Over 6 months"]);
    assert.equal(question(INCUBATOR_AFTER, "q_i7").title, "What next, for the project and for you?");
    assert.deepEqual(labels(INCUBATOR_AFTER, "q_i7"), [
      "Continue the project",
      "Write it up for a venue",
      "Apply to SPAR, MATS, LASR, Pivotal or ERA",
      "AI safety Master’s or PhD",
      "AI safety dissertation",
      "Stop here",
    ]);
    assert.deepEqual(items.validateSurveyItems(INCUBATOR_AFTER), []);
  });

  test("a fellowship asks none of them, and an incubator with no strand asks none either", () => {
    for (const list of [TEMPLATE, AFTER, FOLLOW_UP]) {
      assert.ok(!questionsOf(list).some((each) => each.id.startsWith("q_i")), "a fellowship asks an incubator's question");
    }
    assert.deepEqual(templates.templateItems("before", "incubator", null), TEMPLATE);
    assert.deepEqual(templates.templateItems("before", "fellowship", "alignment"), TEMPLATE, "a fellowship's strand is ignored");
  });
});

describe("the stages pair: a question asked at two stages has one id, one kind and the same answers", () => {
  test("every id shared between stages is the same question but for its words", () => {
    const all = [TEMPLATE, AFTER, FOLLOW_UP, INCUBATOR_BEFORE, INCUBATOR_AFTER];
    const byId = new Map();
    for (const list of all) {
      for (const each of questionsOf(list)) {
        const shape = JSON.stringify({
          type: each.type,
          options: each.options?.map((option) => option.id),
          scores: each.scores,
          lines: each.lines?.map((line) => line.id),
          scale: each.scale ? { max: each.scale.max } : undefined,
          min: each.min,
          max: each.max,
        });
        if (byId.has(each.id)) assert.equal(shape, byId.get(each.id), `${each.id} is asked two ways`);
        byId.set(each.id, shape);
      }
    }
  });

  test("the questionnaire's sizes: about 5, 10 and 3 minutes", () => {
    assert.deepEqual(templates.TEMPLATE_MINUTES, { before: 5, after: 10, followUp6: 3, followUp12: 3 });
    assert.deepEqual([TEMPLATE, AFTER, FOLLOW_UP, INCUBATOR_BEFORE, INCUBATOR_AFTER].map((list) => questionsOf(list).length), [14, 23, 11, 17, 32]);
  });

  test("a template is a fresh copy each time, so editing one survey's words never edits another's", () => {
    const one = templates.templateItems("before", "fellowship", null);
    question(one, "q_c1").title = "Changed";
    assert.equal(question(templates.templateItems("before", "fellowship", null), "q_c1").title, "Which best describes you right now?");
  });
});

describe("the item model, on Worksheets' parts", () => {
  test("a stored survey reads back as it was written, every template and all", () => {
    for (const list of [TEMPLATE, AFTER, FOLLOW_UP, INCUBATOR_BEFORE, INCUBATOR_AFTER]) {
      assert.deepEqual(items.sanitizeSurveyItems(structuredClone(list)), list);
    }
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
    required.find((item) => item.id === "q_a1" || item.id === "q_c3").required = true;
    assert.match(items.validateSurveyItems(required)[0].message, /can be skipped/);
    const poll = [{ kind: "question", id: "p", type: "poll", title: "Poll", body: [], required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], poll: { resultsVisibility: "staff" } }];
    assert.ok(items.validateSurveyItems(poll).some((problem) => /can’t ask this kind/.test(problem.message)));
    const blankLine = structuredClone(TEMPLATE);
    blankLine.find((item) => item.id === "q_c7").lines[1].label = "  ";
    assert.ok(items.validateSurveyItems(blankLine).some((problem) => problem.message === "Every line needs its words."));
    const tooMany = structuredClone(TEMPLATE);
    tooMany.find((item) => item.id === "q_c7").lines = Array.from({ length: 11 }, (_, i) => ({ id: `l${i}`, label: "x" }));
    assert.ok(items.validateSurveyItems(tooMany).some((problem) => /11 lines/.test(problem.message)));
    const twice = structuredClone(TEMPLATE);
    twice.find((item) => item.id === "q_c7").lines[1].id = "l_next";
    assert.ok(items.validateSurveyItems(twice).some((problem) => /share an id/.test(problem.message)));
    assert.match(items.validateSurveyItems([])[0].message, /at least one question/);
  });

  test("the same questions: order may change, the set and the types may not", () => {
    const moved = structuredClone(TEMPLATE).reverse();
    assert.equal(items.sameQuestions(TEMPLATE, moved), true);
    assert.equal(items.sameQuestions(TEMPLATE, TEMPLATE.filter((item) => item.id !== "q_c2")), false);
    const retyped = structuredClone(TEMPLATE);
    retyped.find((item) => item.id === "q_c6").type = "percent";
    assert.equal(items.sameQuestions(TEMPLATE, items.sanitizeSurveyItems(retyped)), false);
  });
});

describe("the answers a person sends", () => {
  test("blank questions are skipped, and only what each type carries is kept", () => {
    const read = items.readSurveyAnswers(TEMPLATE, {
      q_c1: { type: "choice", optionId: "o_stage2", extra: "dropped" },
      q_c2: null,
      q_c7: { type: "lines", values: { l_next: 2, l_contribute: 0 } },
      q_c9: { type: "choices", optionIds: [] },
    });
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.answers, {
      q_c1: { type: "choice", optionId: "o_stage2" },
      q_c7: { type: "lines", values: { l_next: 2 } },
    });
  });

  test("anything not of the survey is refused", () => {
    const refused = (raw) => items.readSurveyAnswers(TEMPLATE, raw).problems.length > 0;
    assert.ok(refused("not answers"));
    assert.ok(refused({ q_other: { type: "choice", optionId: "o_stage0" } }));
    assert.ok(refused({ q_c1: { type: "choice", optionId: "o_made_up" } }));
    assert.ok(refused({ q_c1: { type: "text", text: "Not sure" } }));
    assert.ok(refused({ q_c7: { type: "lines", values: { l9: 3 } } }));
    assert.ok(refused({ q_c7: { type: "lines", values: { l_next: 6 } } }));
    assert.ok(refused({ q_c7: { type: "lines", values: { l_next: 2.5 } } }));
    assert.ok(refused({ q_c9: { type: "choices", optionIds: ["o_event", "o_event"] } }));
    assert.ok(refused({ c_p7: { type: "choice", optionId: "o_yes" } }), "the consent is never among the answers");
  });
});

describe("totals and comments, never a name", () => {
  const sets = [
    { answers: { q_c1: { type: "choice", optionId: "o_stage2" }, q_c7: { type: "lines", values: { l_next: 2, l_contribute: 4 } } } },
    { answers: { q_c1: { type: "choice", optionId: "o_stage4" }, q_c7: { type: "lines", values: { l_next: 4 } }, q_c9: { type: "choices", optionIds: ["o_event", "o_oneone"] } } },
    { answers: {} },
  ];
  const results = surveyResults(TEMPLATE, sets);

  test("a choice counts each option over the people who answered it, from the first answer", () => {
    const c1 = results.find((result) => result.id === "q_c1");
    assert.equal(c1.respondents, 2);
    assert.deepEqual(c1.options.find((option) => option.label === STAGES[2]), { label: STAGES[2], count: 1, percent: 50 });
    assert.deepEqual(c1.scored, { total: 6, mean: 3, unit: "" }, "a described stage is counted by its number too");
    const c9 = results.find((result) => result.id === "q_c9");
    assert.equal(c9.multiple, true);
    assert.equal(c9.respondents, 1);
  });

  test("each line of an agreement grid is counted on its own scale", () => {
    const c7 = results.find((result) => result.id === "q_c7");
    assert.equal(c7.kind, "scale");
    assert.deepEqual(c7.rows[0], { label: "I know what my next concrete step towards AI safety work would be.", respondents: 2, counts: [0, 1, 0, 1, 0], mean: 3, median: 3 });
    assert.deepEqual(c7.rows[1], { label: "I could make a meaningful contribution to AI safety.", respondents: 1, counts: [0, 0, 0, 1, 0], mean: 4, median: 4 });
    assert.equal(c7.minLabel, "Strongly disagree");
  });

  test("the results carry no person", () => {
    assert.doesNotMatch(JSON.stringify(results), /uid/);
  });
});

describe("the spreadsheet with names", () => {
  test("a column per question and per line, choices in words, a name taken off said so", () => {
    const table = surveyExportTable(TEMPLATE, [
      { name: "Zoe Example", sentAt: new Date("2026-10-29T09:00:00Z"), via: "link", afterFirstSession: false, answers: { q_p3_level: { type: "choice", optionId: "o_masters" }, q_c9: { type: "choices", optionIds: ["o_written", "o_event"] } } },
      { name: null, sentAt: new Date("2026-10-30T19:05:00Z"), via: "signed-in", afterFirstSession: true, answers: { q_c7: { type: "lines", values: { l_contribute: 1 } } } },
    ]);
    assert.deepEqual(table.header.slice(0, 5), ["Name", "Sent", "How", "After their first session", "1. Level of study"]);
    // 14 questions, C7 a column per line, and no column for the consent.
    assert.equal(table.header.length, 4 + 13 + 2);
    assert.ok(table.header.includes("11. How much do you agree?: I could make a meaningful contribution to AI safety."));
    assert.deepEqual(table.rows[0].slice(0, 5), ["Zoe Example", "2026-10-29 09:00", "Personal link", "No", "Master’s"]);
    const c9 = table.header.indexOf("13. In the last 3 months, have you…");
    // Several picks, in the order they were sent, joined by "; ".
    assert.equal(table.rows[0][c9], "Written something on AI safety; Attended an AI safety event outside NAISI");
    assert.equal(table.rows[1][0], NAME_TAKEN_OFF);
    assert.equal(table.rows[1][2], "Signed in");
    assert.equal(table.rows[1][3], "Yes");
    assert.equal(exportFilename("AGI Strategy: before", "2026-11-05"), "agi-strategy-before-answers-2026-11-05.csv");
  });
});

describe("the confidential box, for every kind of person (sv-privacy)", () => {
  const base = { namesOffOn: "2028-12-09", programmeKind: "fellowship" };
  const box = (facts) => words.confidentialPoints({ ...base, ...facts });

  test("the board's own words, for somebody in a group with two facilitators", () => {
    assert.deepEqual(box({ leadName: "Claudia", facilitatorNames: ["Rahul", "Sofia"] }), {
      points: [
        "Only NAISI’s admins can see who said what.",
        "Claudia sees totals and comments, never names. Rahul and Sofia never see your answers.",
        "Nothing you say here affects your place or a future application.",
        "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
        "Your name comes off on Sat 9 Dec 2028, two years after the fellowship ends. The totals stay.",
      ],
      note: "We ask who you are so we can compare your answers at the start and the end.",
    });
  });

  test("one facilitator, none told yet, no lead, and an incubator", () => {
    assert.equal(box({ leadName: "Claudia", facilitatorNames: ["Sofia"] }).points[1], "Claudia sees totals and comments, never names. Sofia never sees your answers.");
    assert.equal(box({ leadName: "Claudia", facilitatorNames: null }).points[1], "Claudia sees totals and comments, never names. Your facilitators never see your answers.");
    assert.equal(box({ leadName: null, facilitatorNames: ["Rahul", "Sofia", "Tom"] }).points[1], "Rahul, Sofia and Tom never see your answers.");
    assert.equal(box({ leadName: "Claudia", facilitatorNames: [] }).points[1], "Claudia sees totals and comments, never names.");
    assert.match(box({ leadName: "Tess", facilitatorNames: null, programmeKind: "incubator" }).points.at(-1), /two years after the incubator ends/);
  });
});

describe("the two emails, word for word (HANDOFF, Emails)", () => {
  const facts = {
    title: "Before you start",
    intro: words.beforeIntro(14, 5),
    questions: 14,
    minutes: 5,
    programmeName: "AGI Strategy",
    closesAt: new Date("2026-11-04T23:59:00Z"),
    signer: "Zach",
  };

  test("the before survey", () => {
    assert.deepEqual(words.surveyEmailWords(facts), {
      subject: "Before you start: 14 questions for AGI Strategy",
      paragraphs: [
        "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 14 questions and takes about 5 minutes.",
        "We’ll ask the same at the end.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
      ],
      button: "Answer the 14 questions",
      signOff: ["Zach", "For NAISI"],
    });
  });

  test("the reminder", () => {
    assert.deepEqual(words.reminderEmailWords(facts), {
      subject: "A reminder: 14 questions for AGI Strategy, by Wed 4 Nov",
      paragraphs: [
        "You haven’t answered yet. It’s 14 questions and takes about 5 minutes.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
      ],
      button: "Answer the 14 questions",
      signOff: ["Zach", "For NAISI"],
    });
  });

  test("the intros the other stages are made with", () => {
    assert.equal(words.introFor("after", 23, 10), "The same questions as week 1, then some about how it went and what’s next. It’s 23 questions and takes about 10 minutes.");
    assert.equal(words.introFor("followUp6", 11, 3), "You said we could ask how things have gone since the programme. It’s 11 questions and takes about 3 minutes.");
    assert.equal(words.introFor("followUp12", 11, 3), words.introFor("followUp6", 11, 3));
    assert.deepEqual(
      ["before", "after", "followUp6", "followUp12"].map((stage) => [words.STAGE_WORDS[stage].title, words.surveyNameFor("AGI Strategy", stage)]),
      [
        ["Before you start", "AGI Strategy: before"],
        ["At the end", "AGI Strategy: after"],
        ["Six months on", "AGI Strategy: six months on"],
        ["A year on", "AGI Strategy: a year on"],
      ],
    );
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
  test("two years after the last session, for everyone; 28 February for the 29th", () => {
    assert.equal(NAMES_KEPT_YEARS, 2, "Zach, 26 Oct 2026: two years for everyone");
    assert.equal(twoYearsAfter("2026-12-09"), "2028-12-09");
    assert.equal(twoYearsAfter("2028-02-29"), "2030-02-28");
    assert.equal(twoYearsAfter("2026-02-28"), "2028-02-28");
    assert.equal(twoYearsAfter("nonsense"), null);
  });

  test("names are due off on their day, once", () => {
    assert.equal(namesDueOff({ namesOffOn: "2028-12-09", namesOffAt: null }, "2028-12-08"), false);
    assert.equal(namesDueOff({ namesOffOn: "2028-12-09", namesOffAt: null }, "2028-12-09"), true);
    assert.equal(namesDueOff({ namesOffOn: "2028-12-09", namesOffAt: new Date() }, "2028-12-10"), false);
    assert.equal(namesDueOff({ namesOffOn: null, namesOffAt: null }, "2099-01-01"), false);
  });

  test("the words the pages use", () => {
    assert.equal(words.dateKeyWords("2028-12-09"), "Sat 9 Dec 2028");
    assert.equal(words.namesOffWords("2028-12-09"), "Sat 9 Dec 2028, two years after the programme ends.");
    assert.equal(words.closingWords(new Date("2026-11-04T23:59:00Z")), "It closes on Wed 4 Nov. Once sent, your answers can’t change.");
    assert.equal(words.deadlineWords(new Date("2026-11-04T23:59:00Z")), "Wed 4 Nov, 23:59");
    assert.equal(words.dayAndClockWords(new Date("2026-10-29T09:00:00Z")), "Thu 29 Oct, 9am");
    assert.equal(words.clockWords(new Date("2026-10-29T09:52:00Z")), "9:52am");
    assert.equal(words.programmeLine("fellowship", "AGI Strategy"), "Fellowship: AGI Strategy");
    assert.equal(words.programmeLine("incubator", "Alignment Research"), "Incubator: Alignment Research");
  });

  // The Send tab's progress line says who it was sent to and no longer
  // reaches, so it and "Remind 4 haven't answered" add up (walk 4b, L4).
  test("the Send tab's progress line, with the people Remind no longer reaches", () => {
    const closes = new Date("2026-11-04T23:59:00Z");
    assert.equal(words.progressWords(20, 32, closes, false), "20 of 32 have answered. It closes on Wed 4 Nov.");
    assert.equal(words.notReachedWords(0, "start"), "");
    assert.equal(
      words.progressWords(3, 8, closes, false, words.notReachedWords(1, "start")),
      "3 of 8 have answered, and 1 who hasn’t no longer holds a place. It closes on Wed 4 Nov.",
    );
    assert.equal(words.notReachedWords(2, "end"), "2 who haven’t no longer hold a place");
    assert.equal(words.notReachedWords(1, "followUps"), "1 who hasn’t no longer says yes to follow-ups");
    assert.equal(words.notReachedWords(3, "followUps"), "3 who haven’t no longer say yes to follow-ups");
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
    assert.deepEqual(items.readSurveyConsents(TEMPLATE, undefined), { consents: { followUps: false }, problem: null }, "the before survey asks about follow-ups");
    // The end asks the follow-ups box too (of the people it is shown to, which
    // the answer route decides); a follow-up asks none.
    assert.deepEqual(items.readSurveyConsents(AFTER, undefined), { consents: { followUps: false }, problem: null }, "the end asks about follow-ups");
    const FOLLOW_UP = templates.templateItems("followUp6", "fellowship", null);
    assert.deepEqual(items.readSurveyConsents(FOLLOW_UP, undefined), { consents: {}, problem: null }, "a survey with no consent block takes none");
    assert.equal(items.readSurveyConsents(FOLLOW_UP, { followUps: true }).problem, "One of those boxes isn’t on this survey.");
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
    assert.deepEqual(profileFactsOf({ email: "zoe@example.com", profile: { status: "phd", subject: "Law", motivation: "x", universityEmail: "someone@nottingham.ac.uk" } }), {
      status: "phd",
      subject: "Law",
    });
    assert.deepEqual(profileFactsOf({}), { status: "", subject: "" });
    // The degree is read as everywhere else on the site: an older account's is its `course`.
    assert.deepEqual(profileFactsOf({ profile: { status: "undergraduate", course: "BSc Mathematics" } }), { status: "undergraduate", subject: "BSc Mathematics" });
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

describe("the Facilitator line, not shown to somebody who facilitates a group of the run (Zach, 26 October 2026)", () => {
  const q2 = (personal) =>
    answerPagesOf({ items: AFTER }, personal).flatMap((page) => page.questions).find((each) => each.id === "q_q2");

  test("the survey at the end names the line by the template's one id", () => {
    const item = AFTER.find((each) => each.id === "q_q2");
    assert.ok(item.lines.some((line) => line.id === templates.FACILITATOR_LINE_ID && line.label === "Facilitator"));
  });

  test("a hidden line is not drawn, and every other line is, in its order", () => {
    const all = q2({ offered: {}, piped: {} }).lines.map((line) => line.id);
    const shown = q2({ offered: {}, piped: {}, hiddenLines: [templates.FACILITATOR_LINE_ID] }).lines.map((line) => line.id);
    assert.ok(all.includes("l_facilitator"));
    assert.deepEqual(shown, all.filter((id) => id !== "l_facilitator"));
  });

  test("a value sent for a line that was not shown says nothing, and a lines answer left with none is no answer", () => {
    const answers = {
      q_q2: { type: "lines", values: { l_sessions: 4, l_facilitator: 5 } },
      q_only: { type: "lines", values: { l_facilitator: 3 } },
      q_q1: { type: "scale", value: 9 },
    };
    assert.deepEqual(items.withoutLines(answers, ["l_facilitator"]), {
      q_q2: { type: "lines", values: { l_sessions: 4 } },
      q_q1: { type: "scale", value: 9 },
    });
    assert.equal(items.withoutLines(answers, []), answers, "nothing hidden hands the answers back as they are");
  });
});

// ---------------------------------------------------------------------------
// How answers changed, person by person (results for admins)
// ---------------------------------------------------------------------------

const change = await loadTs(join("lib", "surveys", "change.ts"));

describe("how answers changed, for people who answered both times", () => {
  const q = (list, id) => question(list, id);
  const before = [
    { uid: "amara", answers: { q_c1: { type: "choice", optionId: "o_stage1" }, q_c2: { type: "percent", value: 20 }, q_c4: { type: "scale", value: 2 }, q_c6: { type: "number", value: 0 }, q_c7: { type: "lines", values: { l_next: 2, l_contribute: 3 } }, q_c3: { type: "choices", optionIds: ["o_policy"] } } },
    { uid: "bea", answers: { q_c1: { type: "choice", optionId: "o_stage3" }, q_c2: { type: "percent", value: 50 }, q_c4: { type: "scale", value: 4 }, q_c6: { type: "number", value: 2 }, q_c3: { type: "choices", optionIds: ["o_research", "o_policy"] } } },
    // Dev answered only the before survey: he is in no comparison.
    { uid: "dev", answers: { q_c1: { type: "choice", optionId: "o_stage0" }, q_c2: { type: "percent", value: 90 } } },
  ];
  const after = [
    { uid: "amara", answers: { q_c1: { type: "choice", optionId: "o_stage3" }, q_t1: { type: "choice", optionId: "o_stage0" }, q_c2: { type: "percent", value: 45 }, q_c4: { type: "scale", value: 5 }, q_t2: { type: "scale", value: 1 }, q_c6: { type: "number", value: 4 }, q_c7: { type: "lines", values: { l_next: 4, l_contribute: 3 } }, q_c3: { type: "choices", optionIds: ["o_policy", "o_strategy"] } } },
    { uid: "bea", answers: { q_c1: { type: "choice", optionId: "o_stage3" }, q_t1: { type: "choice", optionId: "o_stage3" }, q_c2: { type: "percent", value: 40 }, q_c4: { type: "scale", value: 4 }, q_c6: { type: "number", value: 2 }, q_c3: { type: "choices", optionIds: ["o_research"] } } },
    // Tariq answered only the survey at the end.
    { uid: "tariq", answers: { q_c1: { type: "choice", optionId: "o_stage5" } } },
  ];
  const between = (id) => change.changeBetween("AGI Strategy: before", q(TEMPLATE, id), q(AFTER, id), before, after);

  test("a stage: who moved up, stayed and moved down, and the averages, of the two who answered both", () => {
    assert.deepEqual(between("q_c1"), {
      kind: "values",
      against: "AGI Strategy: before",
      both: 2,
      before: { mean: 2, median: 2 },
      after: { mean: 3, median: 3 },
      up: 1,
      same: 1,
      down: 0,
      unit: "",
    });
  });

  test("a percentage changes in points; a scale and a number by their averages and middle values", () => {
    const c2 = between("q_c2");
    assert.deepEqual([c2.both, c2.before.mean, c2.after.mean, c2.up, c2.down, c2.unit], [2, 35, 42.5, 1, 1, "%"]);
    assert.equal(words.averagesWords(c2.before, c2.after, c2.unit), "Average 35% then, 42.5% now (up 7.5 points). Middle value 35% then, 42.5% now.");
    const c4 = between("q_c4");
    assert.deepEqual([c4.both, c4.before.median, c4.after.median, c4.up, c4.same], [2, 3, 4.5, 1, 1]);
    const c6 = between("q_c6");
    assert.deepEqual([c6.both, c6.before.median, c6.after.median], [2, 1, 3]);
  });

  test("an agreement grid line by line, counting only people who answered that line both times", () => {
    assert.deepEqual(between("q_c7"), {
      kind: "lines",
      against: "AGI Strategy: before",
      rows: [
        { label: "I know what my next concrete step towards AI safety work would be.", both: 1, before: 2, after: 4, up: 1 },
        { label: "I could make a meaningful contribution to AI safety.", both: 1, before: 3, after: 3, up: 0 },
      ],
    });
    assert.equal(words.lineMovedWords(2, 4, 1, 1), "2 → 4, 1 of 1 moved up");
  });

  test("pick any: how many picked each answer then and now", () => {
    const c3 = between("q_c3");
    assert.equal(c3.kind, "options");
    assert.equal(c3.both, 2);
    assert.equal(c3.multiple, true);
    const of = (label) => c3.options.find((option) => option.label === label);
    assert.deepEqual(of("Governance or policy"), { label: "Governance or policy", before: 2, after: 1 });
    assert.deepEqual(of("Technical research"), { label: "Technical research", before: 1, after: 1 });
    assert.deepEqual(of("Strategy"), { label: "Strategy", before: 0, after: 1 });
  });

  test("a look-back is the before, the question itself the now, in the same survey", () => {
    const t1 = change.lookBackBetween(q(AFTER, "q_c1"), q(AFTER, "q_t1"), after, "Looking back, which best described you before the programme?");
    assert.deepEqual([t1.kind, t1.both, t1.before.mean, t1.after.mean, t1.up, t1.same], ["values", 2, 1.5, 3, 1, 1]);
    const t2 = change.lookBackBetween(q(AFTER, "q_c4"), q(AFTER, "q_t2"), after, "Looking back");
    assert.deepEqual([t2.both, t2.before.mean, t2.after.mean], [1, 1, 5], "only Amara answered both T2 and C4");
  });

  test("a text answer, or two questions of different kinds, are not compared", () => {
    assert.equal(change.changeBetween("x", q(TEMPLATE, "q_p6"), q(TEMPLATE, "q_p6"), before, after), null);
    assert.equal(change.changeBetween("x", q(TEMPLATE, "q_c2"), q(TEMPLATE, "q_c6"), before, after), null);
  });

  test("the words carry the count, and nothing about anybody", () => {
    assert.equal(words.movedWords(2, "AGI Strategy: before", 1, 1, 0), "Of the 2 who answered it both times (AGI Strategy: before): 1 moved up, 1 stayed, 0 moved down.");
    assert.equal(words.movedWords(0, "AGI Strategy: before", 0, 0, 0), "Nobody has answered it both times yet (AGI Strategy: before).");
    assert.equal(words.answersRateWords(12, 20), "12 answers from the 20 people it was sent to (60%).");
    assert.equal(words.answeredRateWords(12, 20), "12 answered, 60% of the 20 it was sent to");
    assert.equal(words.pairedWithWords([{ name: "AGI Strategy: before", answers: 24 }]), "Compared, person by person, with AGI Strategy: before (24 answers).");
    assert.doesNotMatch(JSON.stringify([between("q_c1"), between("q_c3"), between("q_c7")]), /amara|bea|dev|tariq/);
  });
});
