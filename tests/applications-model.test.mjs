/**
 * The application system's rules, executed.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * `src/lib/applications/` is the data and the arithmetic of one application
 * form a term: which steps a person sees, what makes an application ready to
 * send, how an answer is scored and who sees whose score, and how each lead's
 * decision becomes the one thing a person hears on decision day. All of it is
 * pure, so all of it is run here against a small term (three programmes, six
 * question sets) and, for the decision-day arithmetic, against a full one.
 *
 * Nothing is faked: these are the shipping modules, loaded as they are.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const at = (file) => join("lib", "applications", file);

const model = await loadTs(at("model.ts"));
const normalise = await loadTs(at("normalise.ts"));
const sections = await loadTs(at("sections.ts"));
const validate = await loadTs(at("validate.ts"));
const scoring = await loadTs(at("scoring.ts"));
const decisions = await loadTs(at("decisions.ts"));
const words = await loadTs(at("words.ts"));
const statuses = await loadTs(join("lib", "firestore", "admissionApplications.ts"));
const blurbs = await loadTs(join("features", "admissions", "applicationStatus.ts"));

// ---------------------------------------------------------------------------
// A small term
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";

function programme(id, overrides = {}) {
  return {
    kind: "fellowship",
    name: `${id} fellowship`,
    shortName: id,
    pitch: "",
    facts: "6 WEEKS",
    starts: "w/c 26 Oct",
    places: 10,
    groupCount: 2,
    groupSize: "Up to 8",
    leadUid: null,
    reviewerUids: [],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: {},
    ...overrides,
  };
}

function roundData(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "open",
    programmeIds: [TAIS, AGI, INCUBATOR],
    programmes: {
      [TAIS]: programme(TAIS, { name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", places: 24 }),
      [AGI]: programme(AGI, { name: "AGI Strategy Fellowship", shortName: "AGI Strategy", places: 32 }),
      [INCUBATOR]: programme(INCUBATOR, {
        kind: "incubator",
        name: "Research Incubator",
        shortName: "Research incubator",
        places: 12,
      }),
    },
    questionSetIds: ["fellowships", "tais", "agi", "incubator", "incubator-technical", "facilitator"],
    asksFacilitating: true,
    ...overrides,
  };
}

const q = (id, overrides = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
  ...overrides,
});

const SETS_RAW = {
  fellowships: {
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    questions: [q("why", { wordLimit: 300 }), q("read", { required: false, wordLimit: 150 })],
  },
  tais: {
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [
      q("python", { type: "scale", options: ["Never tried", "Can follow it", "Write it often"], scored: true }),
      q("built", { scored: true }),
    ],
  },
  agi: {
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [q("event", { wordLimit: 300, scored: true })],
  },
  incubator: {
    role: "general",
    scope: { type: "kind", kind: "incubator" },
    label: "Research incubator",
    questions: [q("project"), q("research", { required: false })],
  },
  "incubator-technical": {
    role: "stream",
    scope: { type: "programme", programmeId: INCUBATOR },
    label: "Technical stream",
    questions: [
      q("areas", { type: "multi", options: ["Interpretability", "Evals", "Robustness", "Control", "Something else"], scored: true }),
      q("pytorch", { type: "scale", options: ["Never tried", "Can follow it", "Write it often"], scored: true }),
    ],
  },
  facilitator: {
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    questions: [
      q("led"),
      q("which", { type: "choice", optionsFromRanking: true }),
      q("training", { type: "choice", options: ["Yes", "No"] }),
    ],
  },
};

const FORM = normalise.normaliseForm("autumn-2026__k3f9a2b1", roundData());
const SETS = Object.entries(SETS_RAW).map(([id, raw]) =>
  normalise.normaliseQuestionSet(id, { ...raw, roundId: FORM.round.id }),
);

/** Amara: AGI Strategy first, Technical AI Safety second, yes to facilitating. */
function amara(overrides = {}) {
  return normalise.normaliseContent({
    aboutYou: {
      preferredName: "Amara",
      // A fixture address the tree already lists: the check needs a university domain.
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "Philosophy got me into it.",
      interests: "Governance and ethics",
    },
    rankedProgrammeIds: [AGI, TAIS],
    wantsToFacilitate: true,
    answers: {
      fellowships: { why: "I wrote my second-year essay on it.", read: "A few chapters." },
      agi: { event: "The arguments about releasing open-weight models." },
      tais: { python: 1, built: "My second-year logic module." },
      facilitator: { led: "A seminar.", which: "Either", training: "Yes" },
    },
    suMembership: "yes",
    ...overrides,
  });
}

/** Oliver: the incubator only, and not facilitating. */
function oliver(overrides = {}) {
  return normalise.normaliseContent({
    aboutYou: amara().aboutYou,
    rankedProgrammeIds: [INCUBATOR],
    wantsToFacilitate: false,
    answers: {
      incubator: { project: "To find out whether I like research." },
      "incubator-technical": { areas: ["Evals", "Control"], pytorch: 2 },
    },
    suMembership: "not-yet",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Reading stored documents
// ---------------------------------------------------------------------------

describe("reading the form", () => {
  test("a round is an application form only when it says so", () => {
    assert.equal(normalise.isApplicationForm(roundData()), true);
    assert.equal(normalise.isApplicationForm({ ...roundData(), formVersion: 1 }), false);
    assert.equal(normalise.isApplicationForm({}), false);
    assert.equal(normalise.isApplicationForm(null), false);
  });

  test("the programme order is the authority on which programmes exist", () => {
    const form = normalise.normaliseFormFields(
      roundData({ programmeIds: [AGI, "ghost", AGI, TAIS, "has.a.dot"] }),
    );
    assert.deepEqual(form.programmeIds, [AGI, TAIS]);
    assert.deepEqual(Object.keys(form.programmes).sort(), [AGI, TAIS].sort());
  });

  test("a programme reads as itself, and a short name falls back to the name", () => {
    const p = normalise.normaliseProgramme("p1", { name: "Research Incubator", kind: "incubator", places: 12.4 });
    assert.equal(p.shortName, "Research Incubator");
    assert.equal(p.kind, "incubator");
    assert.equal(p.places, 12);
    assert.equal(p.leadUid, null);
    assert.equal(normalise.normaliseProgramme("p2", { kind: "nonsense" }).kind, "fellowship");
    assert.equal(normalise.normaliseProgramme("p3", { places: -1 }).places, null);
  });

  test("only a stream set keeps its scored questions", () => {
    const byId = Object.fromEntries(SETS.map((set) => [set.id, set]));
    assert.equal(byId.tais.questions.every((question) => question.scored), true);
    const general = normalise.normaliseQuestionSet("g", {
      scope: { type: "kind", kind: "fellowship" },
      role: "stream",
      questions: [q("a", { scored: true })],
    });
    assert.equal(general.role, "general", "a kind-scoped set is general whatever it claims");
    assert.equal(general.questions[0].scored, false);
    const facilitator = normalise.normaliseQuestionSet("f", {
      scope: { type: "facilitating" },
      role: "stream",
      questions: [q("a", { scored: true })],
    });
    assert.equal(facilitator.role, "facilitator");
    assert.equal(facilitator.questions[0].scored, false);
  });

  test("a set nobody can be shown is not a set", () => {
    assert.equal(normalise.normaliseQuestionSet("x", { scope: { type: "everyone" } }), null);
    assert.equal(normalise.normaliseQuestionSet("x", { scope: { type: "programme" } }), null);
    assert.equal(normalise.normaliseQuestionSet("has.dot", { scope: { type: "facilitating" } }), null);
  });

  test("a question keeps only what its type uses", () => {
    const text = normalise.normaliseQuestion(q("a", { options: ["x"], wordLimit: 300 }));
    assert.deepEqual(text.options, []);
    assert.equal(text.wordLimit, 300);
    const scale = normalise.normaliseQuestion(q("b", { type: "scale", options: ["Low", "Low", "High"], wordLimit: 5 }));
    assert.deepEqual(scale.options, ["Low", "High"]);
    assert.equal(scale.wordLimit, null);
    assert.equal(normalise.normaliseQuestion({ text: "no id" }), null);
    assert.equal(normalise.normaliseQuestion(q("c", { type: "multi", optionsFromRanking: true })).optionsFromRanking, false);
  });
});

describe("reading what people write", () => {
  test("content drops what it cannot read and keeps the rest", () => {
    const content = normalise.normaliseContent({
      rankedProgrammeIds: [AGI, AGI, "bad.id", 7, TAIS],
      wantsToFacilitate: "yes",
      answers: { agi: { event: "x", junk: { nested: true } }, "bad.set": { a: "b" } },
      suMembership: "maybe",
    });
    assert.deepEqual(content.rankedProgrammeIds, [AGI, TAIS]);
    assert.equal(content.wantsToFacilitate, null);
    assert.deepEqual(content.answers, { agi: { event: "x" } });
    assert.equal(content.suMembership, null);
    assert.equal(content.aboutYou.preferredName, "");
  });

  test("an application on an older round is not read as an empty one", () => {
    assert.equal(normalise.normaliseApplication("r__u", { roundId: "r", uid: "u", status: "submitted" }), null);
    const application = normalise.normaliseApplication("r__u", {
      formVersion: 2,
      roundId: "r",
      uid: "u",
      status: "nonsense",
      draft: amara(),
    });
    assert.equal(application.status, "draft");
    assert.equal(application.sent, null);
    assert.deepEqual(application.draft.rankedProgrammeIds, [AGI, TAIS]);
  });

  test("a review keeps whole scores from 1 to 5 on question keys, and nothing else", () => {
    const review = normalise.normaliseReview("id", {
      scores: { "agi.event": 4, "agi.other": 6, "agi.half": 3.5, nokey: 3, "tais.built": 0 },
      comments: [
        { id: "c1", questionKey: "agi.event", text: "  Specific.  " },
        { id: "c1", questionKey: "agi.event", text: "duplicate id" },
        { id: "c2", questionKey: "not a key", text: "x" },
        { id: "c3", questionKey: "agi.event", text: "   " },
      ],
      notes: "Good answers.",
    });
    assert.deepEqual(review.scores, { "agi.event": 4 });
    assert.deepEqual(review.comments.map((c) => [c.id, c.text]), [["c1", "Specific."]]);
    assert.equal(review.overallComment, "Good answers.");
  });

  test("a decision keeps a pool reason only on a pool", () => {
    const decision = normalise.normaliseDecision("r__u", {
      roundId: "r",
      uid: "u",
      programmes: {
        [AGI]: { decision: "accept", poolReason: "capacity", decidedByUid: "lead" },
        [TAIS]: { decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: AGI, decidedByUid: "lead" },
        [INCUBATOR]: { decision: "maybe", decidedByUid: "lead" },
        "no.lead": { decision: "accept" },
      },
      pooledOutcome: { kind: "invite", setByUid: "admin" },
    });
    assert.equal(decision.programmes[AGI].poolReason, null);
    assert.equal(decision.programmes[TAIS].poolReason, "better-fit");
    assert.equal(decision.programmes[TAIS].couldSuitProgrammeId, AGI);
    assert.deepEqual(Object.keys(decision.programmes).sort(), [AGI, TAIS].sort());
    assert.equal(decision.pooledOutcome, null, "an invitation that names no programme is not one");
  });
});

// ---------------------------------------------------------------------------
// Which steps a person sees
// ---------------------------------------------------------------------------

describe("the steps one person walks through", () => {
  const ids = (content) => sections.stepsFor(FORM, SETS, content).map((step) => step.id);

  test("Amara has ten, and her stream questions follow her own ranking", () => {
    assert.deepEqual(ids(amara()), [
      "about",
      "choose",
      "rank",
      "facilitating",
      "set:fellowships",
      "set:agi",
      "set:tais",
      "set:facilitator",
      "availability",
      "check",
    ]);
  });

  test("ranking the other way round swaps the two stream steps and nothing else", () => {
    assert.deepEqual(ids(amara({ rankedProgrammeIds: [TAIS, AGI] })).slice(4, 7), [
      "set:fellowships",
      "set:tais",
      "set:agi",
    ]);
  });

  test("Oliver ranks one thing, so he is not asked to rank, and sees only the incubator's questions", () => {
    assert.deepEqual(ids(oliver()), [
      "about",
      "choose",
      "facilitating",
      "set:incubator",
      "set:incubator-technical",
      "availability",
      "check",
    ]);
  });

  test("the fellowship questions are asked once however many fellowships are ticked", () => {
    const one = ids(amara({ rankedProgrammeIds: [AGI] }));
    const two = ids(amara());
    assert.equal(one.filter((id) => id === "set:fellowships").length, 1);
    assert.equal(two.filter((id) => id === "set:fellowships").length, 1);
  });

  test("nothing ticked yet means no question sets at all", () => {
    assert.deepEqual(ids(amara({ rankedProgrammeIds: [], wantsToFacilitate: null })), [
      "about",
      "choose",
      "facilitating",
      "availability",
      "check",
    ]);
  });

  test("a form that does not ask about facilitating shows neither the step nor the questions", () => {
    const form = normalise.normaliseForm("r", roundData({ asksFacilitating: false }));
    const steps = sections.stepsFor(form, SETS, amara()).map((step) => step.id);
    assert.equal(steps.includes("facilitating"), false);
    assert.equal(steps.includes("set:facilitator"), false);
  });

  test("choice numbers count from the person's own first choice", () => {
    assert.equal(sections.choiceNumber(FORM, amara(), AGI), 1);
    assert.equal(sections.choiceNumber(FORM, amara(), TAIS), 2);
    assert.equal(sections.choiceNumber(FORM, amara(), INCUBATOR), null);
    assert.equal(words.choiceLabel(1), "1st choice");
    assert.equal(words.choiceLabel(2), "2nd choice");
    assert.deepEqual([3, 4, 11, 12, 13, 21, 22].map(words.ordinal), ["3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });

  test("a closed programme cannot be ticked, and a removed one stops counting", () => {
    const form = normalise.normaliseForm(
      "r",
      roundData({ programmes: { ...roundData().programmes, [TAIS]: programme(TAIS, { closed: true }) } }),
    );
    assert.deepEqual(sections.openProgrammes(form).map((p) => p.id), [AGI, INCUBATOR]);
    const without = normalise.normaliseForm("r", roundData({ programmeIds: [AGI, INCUBATOR] }));
    assert.deepEqual(sections.rankedProgrammes(without, amara()).map((p) => p.id), [AGI]);
  });
});

// ---------------------------------------------------------------------------
// Ready to send
// ---------------------------------------------------------------------------

describe("what stops an application being sent", () => {
  const steps = (content, form = FORM) => validate.issuesFor(form, SETS, content).map((issue) => issue.step);

  test("a finished application has nothing left to do", () => {
    assert.deepEqual(validate.issuesFor(FORM, SETS, amara()), []);
    assert.deepEqual(validate.issuesFor(FORM, SETS, oliver()), []);
  });

  test("a required answer left blank sends them back to its step", () => {
    const content = amara();
    content.answers.agi = { event: "   " };
    const issues = validate.issuesFor(FORM, SETS, content);
    assert.deepEqual(issues.map((i) => [i.step, i.questionId]), [["set:agi", "event"]]);
  });

  test("an optional answer may be blank, and is still held to its limit when written", () => {
    const blank = amara();
    delete blank.answers.fellowships.read;
    assert.deepEqual(steps(blank), []);
    const long = amara();
    long.answers.fellowships.read = Array.from({ length: 151 }, () => "word").join(" ");
    assert.deepEqual(steps(long), ["set:fellowships"]);
  });

  test("words are counted the way a person would count them", () => {
    assert.equal(validate.countWords(""), 0);
    assert.equal(validate.countWords("   "), 0);
    assert.equal(validate.countWords("one"), 1);
    assert.equal(validate.countWords("  two   words\nthree  "), 3);
  });

  test("a choice has to be one of the options, and the ranking can supply them", () => {
    const which = SETS.find((set) => set.id === "facilitator").questions.find((x) => x.id === "which");
    assert.deepEqual(validate.optionsFor(which, FORM, amara()), ["AGI Strategy", "Technical AI Safety", "Either"]);
    assert.deepEqual(validate.optionsFor(which, FORM, amara({ rankedProgrammeIds: [AGI] })), ["AGI Strategy"]);
    const wrong = amara();
    wrong.answers.facilitator.which = "Research incubator";
    assert.deepEqual(steps(wrong), ["set:facilitator"]);
  });

  test("a scale answer is a point that exists", () => {
    const off = amara();
    off.answers.tais.python = 3;
    assert.deepEqual(steps(off), ["set:tais"]);
  });

  test("nothing ticked, no facilitating answer, no SU answer: one issue each", () => {
    const empty = amara({ rankedProgrammeIds: [], wantsToFacilitate: null, suMembership: null, answers: {} });
    assert.deepEqual(steps(empty), ["choose", "facilitating", "check"]);
  });

  test("the About you answers are the ones joining asks for", () => {
    const content = amara();
    content.aboutYou = { ...normalise.EMPTY_ABOUT_YOU };
    const messages = validate.issuesFor(FORM, SETS, content).filter((i) => i.step === "about");
    assert.equal(messages.length, 5, "name, email, what you do, degree, why");
    const outside = amara();
    outside.aboutYou.universityEmail = "amara@example.com";
    assert.deepEqual(steps(outside), ["about"]);
    const noGraduation = amara();
    noGraduation.aboutYou.expectedGraduation = "";
    assert.deepEqual(steps(noGraduation), ["about"]);
    const staff = amara();
    staff.aboutYou.status = "employee";
    staff.aboutYou.expectedGraduation = "";
    assert.deepEqual(steps(staff), [], "graduation is only asked of students");
  });

  test("a programme that closed after they ticked it has to be unticked", () => {
    const form = normalise.normaliseForm(
      "r",
      roundData({ programmes: { ...roundData().programmes, [TAIS]: programme(TAIS, { shortName: "Technical AI Safety", closed: true }) } }),
    );
    assert.deepEqual(steps(amara(), form), ["choose"]);
  });

  test("what is sent holds answers only to what they were asked", () => {
    const content = amara();
    content.answers.incubator = { project: "Left over from before I unticked it." };
    content.answers.fellowships.read = "  ";
    const sent = validate.contentForSend(FORM, SETS, content);
    assert.deepEqual(Object.keys(sent.answers), ["fellowships", "agi", "tais", "facilitator"]);
    assert.deepEqual(Object.keys(sent.answers.fellowships), ["why"]);
    const notFacilitating = validate.contentForSend(FORM, SETS, amara({ wantsToFacilitate: false }));
    assert.equal("facilitator" in notFacilitating.answers, false);
  });

  test("the check page can say how many of a set are answered", () => {
    const fellowships = SETS.find((set) => set.id === "fellowships");
    assert.equal(validate.answeredCount(fellowships, amara()), 2);
    assert.equal(validate.answeredCount(fellowships, oliver()), 0);
  });
});

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

describe("scores, and who sees whose", () => {
  const review = (reviewerUid, scores) => normalise.normaliseReview(`r__a__${reviewerUid}`, { reviewerUid, scores });
  const agiKeys = scoring.scoredKeysFor(FORM, SETS, AGI);
  const taisKeys = scoring.scoredKeysFor(FORM, SETS, TAIS);

  test("a programme's scored questions are its stream set's, keyed by set and question", () => {
    assert.deepEqual(agiKeys, ["agi.event"]);
    assert.deepEqual(taisKeys, ["tais.python", "tais.built"]);
    assert.equal(model.questionKey("agi", "event"), "agi.event");
  });

  test("a programme that does not use scores has nothing to score", () => {
    const form = normalise.normaliseForm(
      "r",
      roundData({ programmes: { ...roundData().programmes, [AGI]: programme(AGI, { useScores: false }) } }),
    );
    assert.deepEqual(scoring.scoredKeysFor(form, SETS, AGI), []);
    // Nothing is left to score, which is what the list of applications still
    // waiting for a reviewer asks. It is not a review: with nothing to score,
    // somebody is shown other reviewers' work once they have saved an overall
    // comment of their own, and not before.
    assert.equal(scoring.hasScored(null, []), true, "nothing is left to score");
    const reading = (mine) => ({
      viewerIsAdmin: false,
      roles: { [AGI]: "reviewer" },
      form,
      sets: SETS,
      sent: amara(),
      listed: [AGI],
      mine,
    });
    assert.deepEqual(scoring.firstReviewOf(reading(null)), { over: false, needs: "overall-comment" });
    assert.equal(scoring.otherReviewsShownTo(reading(null)), false, "nothing to score is not already scored");
    const said = normalise.normaliseReview("r__a__claudia", { reviewerUid: "claudia", notes: "Clear and specific." });
    assert.equal(scoring.otherReviewsShownTo(reading(said)), true);
  });

  test("an optional scored question left blank does not hold a first review open", () => {
    const sent = amara();
    delete sent.answers.tais.built;
    assert.deepEqual(scoring.scorableKeysFor(FORM, SETS, TAIS, sent), ["tais.python"]);
  });

  test("the section score gives each reviewer one voice", () => {
    const claudia = review("claudia", { "agi.event": 4 });
    const lloyd = review("lloyd", { "agi.event": 3 });
    assert.equal(scoring.sectionScore([claudia, lloyd], agiKeys).score, 3.5);
    const zach = review("zach", { "tais.python": 3, "tais.built": 4 });
    const result = scoring.sectionScore([zach], taisKeys);
    assert.equal(result.score, 3.5);
    assert.deepEqual(result.reviewers, [{ reviewerUid: "zach", score: 3.5, scoredCount: 2 }]);
    assert.equal(scoring.sectionScore([review("nobody", {})], agiKeys).score, null);
    assert.equal(scoring.formatScore(4), "4.0");
    assert.equal(scoring.formatScore(3.4499), "3.4");
  });

  /**
   * Somebody who is not an admin, reviewing one programme, reading Amara's
   * application. The rule is asked about a person reading an application,
   * never about one programme's answers alone.
   */
  const reading = (programmeId, mine, form = FORM) => ({
    viewerIsAdmin: false,
    roles: { [programmeId]: "reviewer" },
    form,
    sets: SETS,
    sent: amara(),
    listed: [AGI, TAIS],
    mine,
  });

  test("a first review is blind to everybody else until you have scored", () => {
    const lloyd = review("lloyd", { "agi.event": 3 });
    assert.deepEqual(scoring.reviewsVisibleTo("claudia", [lloyd], reading(AGI, null)), []);
    assert.equal(scoring.hiddenReviewCount("claudia", [lloyd], reading(AGI, null)), 1);
    const claudia = review("claudia", { "agi.event": 4 });
    assert.equal(scoring.reviewsVisibleTo("claudia", [lloyd, claudia], reading(AGI, claudia)).length, 2);
    const half = review("zach", { "tais.python": 3 });
    const other = review("lloyd", { "tais.python": 5, "tais.built": 5 });
    assert.deepEqual(
      scoring.reviewsVisibleTo("zach", [half, other], reading(TAIS, half)).map((r) => r.reviewerUid),
      ["zach"],
      "scoring one of two answers is not having scored",
    );
  });

  test("an admin's switch shows other reviews to everybody", () => {
    const lloyd = review("lloyd", { "agi.event": 3 });
    const open = normalise.normaliseForm("r", roundData({ revealOtherReviews: true }));
    assert.equal(scoring.reviewsVisibleTo("claudia", [lloyd], reading(AGI, null, open)).length, 1);
    assert.equal(scoring.reviewsVisibleTo("claudia", [lloyd], reading(AGI, null)).length, 0, "and with it off, none");
  });

  test("a review write keeps only whole scores in range on the programme's own questions", () => {
    assert.deepEqual(
      scoring.cleanScores({ "agi.event": 5, "tais.built": 4, "agi.x": 3 }, agiKeys, { min: 1, max: 5 }),
      { "agi.event": 5 },
    );
    assert.deepEqual(scoring.cleanScores({ "agi.event": 6 }, agiKeys, { min: 1, max: 5 }), {});
    assert.deepEqual(scoring.cleanScores({ "agi.event": 2.5 }, agiKeys, { min: 1, max: 5 }), {});
    assert.deepEqual(scoring.cleanScores("nonsense", agiKeys, { min: 1, max: 5 }), {});
  });
});

// ---------------------------------------------------------------------------
// From decisions to outcomes
// ---------------------------------------------------------------------------

const BY = "lead";
const accept = () => ({ decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: BY, decidedAt: null });
const pool = (reason = "capacity") => ({ decision: "pool", poolReason: reason, couldSuitProgrammeId: null, decidedByUid: BY, decidedAt: null });
const decline = () => ({ decision: "decline", poolReason: null, couldSuitProgrammeId: null, decidedByUid: BY, decidedAt: null });
const decided = (programmes, pooledOutcome = null, exception = null) => ({ programmes, pooledOutcome, exception });
const ALL = new Set([AGI, TAIS, INCUBATOR]);

describe("one place a term, from the highest choice that accepts", () => {
  test("the higher choice wins when both accept", () => {
    const d = decided({ [AGI]: accept(), [TAIS]: accept() });
    assert.equal(decisions.placementFor([AGI, TAIS], d), AGI);
    assert.equal(decisions.placementFor([TAIS, AGI], d), TAIS);
    assert.deepEqual(decisions.placesHeld([AGI, TAIS], d), [AGI]);
  });

  test("a second place exists only as an admin's named exception, and only where they were accepted", () => {
    const exception = { programmeIds: [TAIS, INCUBATOR], reason: "Both leads asked.", setByUid: "admin", setAt: null };
    const d = decided({ [AGI]: accept(), [TAIS]: accept(), [INCUBATOR]: pool() }, null, exception);
    assert.deepEqual(decisions.placesHeld([AGI, TAIS, INCUBATOR], d), [AGI, TAIS]);
  });

  test("a programme owes a decision until it decides or a higher choice accepts", () => {
    const ranked = [AGI, TAIS];
    assert.equal(decisions.owesDecision(ranked, null, AGI), true);
    assert.equal(decisions.owesDecision(ranked, null, TAIS), true);
    assert.equal(decisions.owesDecision(ranked, decided({ [AGI]: accept() }), TAIS), false, "the first choice decided first");
    assert.equal(decisions.owesDecision(ranked, decided({ [TAIS]: accept() }), AGI), true, "a lower choice accepting does not let the higher one off");
    assert.equal(decisions.owesDecision(ranked, decided({ [AGI]: pool() }), TAIS), true);
    assert.equal(decisions.owesDecision(ranked, null, INCUBATOR), false, "they never ranked it");
  });

  test("nobody is told anything while a programme still owes a decision", () => {
    assert.deepEqual(decisions.outcomeFor([AGI, TAIS], decided({ [TAIS]: accept() }), ALL), {
      kind: "undecided",
      waitingOn: [AGI],
    });
    assert.deepEqual(decisions.outcomeFor([AGI, TAIS], null, ALL), { kind: "undecided", waitingOn: [AGI, TAIS] });
  });

  test("accepted, pooled and declined each read as what they are", () => {
    assert.deepEqual(decisions.outcomeFor([AGI, TAIS], decided({ [AGI]: pool(), [TAIS]: accept() }), ALL), {
      kind: "accepted",
      programmeId: TAIS,
    });
    assert.deepEqual(decisions.outcomeFor([AGI], decided({ [AGI]: decline() }), ALL), { kind: "declined" });
    assert.deepEqual(decisions.outcomeFor([AGI, TAIS], decided({ [AGI]: decline(), [TAIS]: pool() }), ALL), {
      kind: "needs-outcome",
    });
  });

  test("a pooled applicant hears what the committee picked, and only a programme on the form can be promised", () => {
    const pooledEverywhere = { [INCUBATOR]: pool("better-fit") };
    const invite = { kind: "invite", programmeId: TAIS, setByUid: "admin", setAt: null };
    assert.deepEqual(decisions.outcomeFor([INCUBATOR], decided(pooledEverywhere, invite), ALL), {
      kind: "invited",
      programmeId: TAIS,
    });
    assert.deepEqual(
      decisions.outcomeFor([INCUBATOR], decided(pooledEverywhere, { kind: "no-offer", setByUid: "admin", setAt: null }), ALL),
      { kind: "no-offer" },
    );
    assert.deepEqual(decisions.outcomeFor([INCUBATOR], decided(pooledEverywhere, invite), new Set([AGI, INCUBATOR])), {
      kind: "needs-outcome",
    });
    assert.equal(decisions.isPooled({ kind: "needs-outcome" }), true);
    assert.equal(decisions.isPooled({ kind: "accepted", programmeId: AGI }), false);
  });

  test("a lead's view of one application uses the committee's words", () => {
    assert.equal(decisions.standingWith(null, AGI), "to-review");
    assert.equal(words.PROGRAMME_STANDING_LABEL[decisions.standingWith(decided({ [AGI]: pool() }), AGI)], "Pooled");
    assert.equal(words.PROGRAMME_STANDING_LABEL[decisions.standingWith(decided({ [AGI]: accept() }), AGI)], "Accepted");
  });
});

/**
 * The term the design was drawn for. 122 people applied: 57 put AGI Strategy
 * first, 42 Technical AI Safety and 23 the Research incubator. On decision
 * day 66 are accepted (32, 22 and 12), 55 are pooled (24, 20 and 11 by first
 * choice), of whom 2 are invited to Technical AI Safety's last 2 places and
 * 53 get no offer, and 1 is declined and not emailed. 66 + 2 + 53 = 121.
 */
function theTerm({ invitationsPicked = true } = {}) {
  const applicants = [];
  const noOffer = { kind: "no-offer", setByUid: "admin", setAt: null };
  const invited = { kind: "invite", programmeId: TAIS, setByUid: "admin", setAt: null };
  const add = (prefix, count, ranked, decision) => {
    for (let i = 0; i < count; i += 1) applicants.push({ uid: `${prefix}-${i}`, ranked, decision });
  };

  // AGI Strategy first: 57.
  add("agi-in", 27, [AGI], decided({ [AGI]: accept() }));
  // Five more accepted who also ranked Technical AI Safety second: it never has to decide them.
  add("agi-in-also-tais", 5, [AGI, TAIS], decided({ [AGI]: accept() }));
  add("agi-pool", 14, [AGI], decided({ [AGI]: pool() }, noOffer));
  // Ten pooled who ranked Technical AI Safety second, and were pooled there too.
  add("agi-pool-also-tais", 10, [AGI, TAIS], decided({ [AGI]: pool(), [TAIS]: pool() }, noOffer));
  add("agi-spam", 1, [AGI], decided({ [AGI]: decline() }));

  // Technical AI Safety first: 42.
  add("tais-in", 22, [TAIS], decided({ [TAIS]: accept() }));
  add("tais-pool", 15, [TAIS], decided({ [TAIS]: pool() }, noOffer));
  add("tais-pool-also-agi", 5, [TAIS, AGI], decided({ [TAIS]: pool(), [AGI]: pool() }, noOffer));

  // The Research incubator first: 23.
  add("inc-in", 12, [INCUBATOR], decided({ [INCUBATOR]: accept() }));
  add("inc-pool", 9, [INCUBATOR], decided({ [INCUBATOR]: pool() }, noOffer));
  // Oliver ranked only the incubator; Rosa ranked AGI Strategy second.
  applicants.push({
    uid: "oliver",
    ranked: [INCUBATOR],
    decision: decided({ [INCUBATOR]: pool("better-fit") }, invitationsPicked ? invited : null),
  });
  applicants.push({
    uid: "rosa",
    ranked: [INCUBATOR, AGI],
    decision: decided({ [INCUBATOR]: pool("better-fit"), [AGI]: pool() }, invitationsPicked ? invited : null),
  });
  return applicants;
}

describe("decision day adds up", () => {
  test("the whole term: 122 applied, 66 accepted, 2 invited, 53 no offer, 1 declined, 121 emails", () => {
    const tally = decisions.tallyTerm(FORM, theTerm());
    assert.equal(tally.applicants, 122);
    assert.deepEqual(
      [tally.programmes[AGI].firstChoice, tally.programmes[TAIS].firstChoice, tally.programmes[INCUBATOR].firstChoice],
      [57, 42, 23],
    );
    assert.deepEqual(tally.outcomes, {
      accepted: 66,
      invited: 2,
      noOffer: 53,
      declined: 1,
      needsOutcome: 0,
      undecided: 0,
    });
    assert.equal(tally.emails, 121);
    assert.deepEqual(
      [tally.programmes[AGI].placed, tally.programmes[TAIS].placed, tally.programmes[INCUBATOR].placed],
      [32, 22, 12],
    );
    assert.equal(tally.programmes[TAIS].invited, 2);
    assert.equal(tally.programmes[AGI].declined, 1);
    assert.deepEqual(
      [AGI, TAIS, INCUBATOR].map((id) => decisions.freePlaces(FORM, tally, id)),
      [0, 0, 0],
      "32 of 32, 22 of 24 with 2 invitations, 12 of 12",
    );
    assert.deepEqual(decisions.readinessFor(tally), {
      ready: true,
      toReview: { [TAIS]: 0, [AGI]: 0, [INCUBATOR]: 0 },
      needsOutcome: 0,
    });
  });

  test("before the invitations are picked, two people need an outcome and two places are free", () => {
    const tally = decisions.tallyTerm(FORM, theTerm({ invitationsPicked: false }));
    assert.equal(tally.outcomes.needsOutcome, 2);
    assert.equal(tally.outcomes.invited, 0);
    assert.equal(decisions.freePlaces(FORM, tally, TAIS), 2);
    assert.equal(decisions.readinessFor(tally).ready, false);
    assert.equal(tally.emails, 119);
  });

  test("the people accepted by a higher choice are not owed a decision lower down", () => {
    const tally = decisions.tallyTerm(FORM, theTerm());
    // Technical AI Safety was ranked by 42 first-choice applicants and 15
    // second-choice ones. It decided 22 + 15 + 5 of its own and the 10 pooled
    // by AGI Strategy, and never had to decide the 5 AGI Strategy accepted.
    assert.equal(tally.programmes[TAIS].applications, 57);
    assert.equal(tally.programmes[TAIS].accepted, 22);
    assert.equal(tally.programmes[TAIS].pooled, 30);
    assert.equal(tally.programmes[TAIS].toReview, 0);
  });

  test("one undecided application is enough to hold the send", () => {
    const applicants = theTerm();
    applicants[0] = { ...applicants[0], decision: null };
    const tally = decisions.tallyTerm(FORM, applicants);
    assert.equal(tally.programmes[AGI].toReview, 1);
    assert.equal(tally.outcomes.undecided, 1);
    assert.equal(decisions.readinessFor(tally).ready, false);
  });

  test("a programme with no places figure has no free places to offer", () => {
    const form = normalise.normaliseForm(
      "r",
      roundData({ programmes: { ...roundData().programmes, [TAIS]: programme(TAIS, { places: null }) } }),
    );
    assert.equal(decisions.freePlaces(form, decisions.tallyTerm(form, theTerm()), TAIS), null);
  });
});

describe("what the scores suggest", () => {
  const applicant = (uid, score, choice = 1, elsewhere = {}) => ({ uid, score, choice, elsewhere });

  test("the top scores, the line they reach down to, and who sits close to it", () => {
    const rec = decisions.recommendationsFor(
      [
        applicant("a", 5),
        applicant("b", 4.5),
        applicant("c", 3.4),
        applicant("d", 3.3),
        applicant("e", 3.2),
        applicant("f", 2),
        applicant("g", null),
      ],
      3,
    );
    assert.deepEqual(rec.top, ["a", "b", "c"]);
    assert.equal(rec.cutoff, 3.4);
    assert.deepEqual(rec.borderline, ["d", "e"]);
  });

  test("people who ranked it lower, and people who scored higher elsewhere, are named", () => {
    const rec = decisions.recommendationsFor(
      [
        applicant("first", 4, 1),
        applicant("second", 4, 2),
        applicant("stronger-elsewhere", 3, 1, { [TAIS]: 4.5, [INCUBATOR]: 4 }),
        applicant("same-elsewhere", 3, 1, { [TAIS]: 3 }),
      ],
      10,
    );
    assert.deepEqual(rec.rankedLower, ["second"]);
    assert.deepEqual(rec.scoredHigherElsewhere, [{ uid: "stronger-elsewhere", programmeId: TAIS }]);
  });

  test("no scores or no places figure means no line, and nothing borderline", () => {
    assert.deepEqual(decisions.recommendationsFor([applicant("a", null)], 5).cutoff, null);
    const none = decisions.recommendationsFor([applicant("a", 4)], null);
    assert.equal(none.cutoff, null);
    assert.deepEqual(none.borderline, []);
  });
});

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

describe("the words", () => {
  test("nobody is ever waitlisted or rejected in this system's own wording", () => {
    const said = [
      ...Object.values(words.PROGRAMME_STANDING_LABEL),
      ...Object.values(words.POOL_REASON_LABEL),
      ...Object.values(words.RESULT_LABEL),
      ...["invited", "no-offer", "declined"].map((status) => statuses.ADMISSION_APPLICATION_STATUS_LABEL[status]),
      ...["invited", "no-offer", "declined"].map((status) => blurbs.applicationStatusBlurb(status, "closed")),
    ];
    for (const sentence of said) {
      for (const banned of words.WORDS_APPLICANTS_NEVER_SEE) {
        assert.ok(!sentence.toLowerCase().includes(banned), `"${sentence}" says "${banned}"`);
      }
    }
  });

  test("the three endings an application form adds are real statuses with a label and a sentence", () => {
    for (const status of ["invited", "no-offer", "declined"]) {
      assert.ok(statuses.ADMISSION_APPLICATION_STATUSES.includes(status));
      assert.ok(statuses.ADMISSION_APPLICATION_STATUS_LABEL[status]);
      assert.ok(blurbs.applicationStatusBlurb(status, "closed").length > 0);
      assert.ok(blurbs.APPLICATION_STATUS_TONE[status]);
    }
    assert.equal(statuses.ADMISSION_APPLICATION_STATUS_LABEL["no-offer"], "No offer this time");
    assert.equal(words.RESULT_LABEL["no-offer"], "No offer this time");
  });

  test("ids used as keys can never contain a dot", () => {
    assert.equal(normalise.isId("agi-strategy"), true);
    assert.equal(normalise.isId("has.dot"), false);
    assert.equal(normalise.isId(""), false);
    assert.equal(normalise.isQuestionKey("agi.event"), true);
    assert.equal(normalise.isQuestionKey("agi.event.extra"), false);
    assert.equal(model.applicationId("round", "uid"), "round__uid");
  });
});
