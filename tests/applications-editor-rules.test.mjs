/**
 * The rules the application form's editor is built on, executed.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The committee edits one application form a term: its question sets, and
 * each programme's settings. Five small modules under
 * `src/lib/applications/editor/` hold every rule that is not about a
 * database, and each is run here against the cases it exists for:
 *
 *  - `lock.ts`: questions lock once anybody has sent an application, decided
 *    from the round's own counts.
 *  - `ids.ts`: an id is minted from a name and never taken from one, so it is
 *    always a safe key in a Firestore field path.
 *  - `sets.ts`: which family a set belongs to, where a new one goes, and the
 *    sentences that say who is shown it. The sentences are checked against
 *    the words the design uses for the autumn form.
 *  - `parse.ts`: every body the editor's routes accept, and the sentence each
 *    refusal carries.
 *  - `views.ts`: what each screen is handed, field by field, so a field added
 *    to a stored document does not reach a browser by accident.
 *
 * The routes themselves, with their access rules and their transactions, are
 * executed in `tests/applications-editor-routes.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const at = (file) => join("lib", "applications", "editor", file);

const lock = await loadTs(at("lock.ts"));
const ids = await loadTs(at("ids.ts"));
const sets = await loadTs(at("sets.ts"));
const parse = await loadTs(at("parse.ts"));
const views = await loadTs(at("views.ts"));
const ownership = await loadTs(at("own.ts"));
const keys = await loadTs(join("lib", "applications", "keys.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const model = await loadTs(join("lib", "applications", "model.ts"));

// ---------------------------------------------------------------------------
// The autumn form, as the design draws it
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND = "autumn-2026__k3f9a2b1";

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 24,
  groupCount: 3,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  ...over,
});

const question = (id, over = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: 300,
  required: true,
  scored: false,
  ...over,
});

const SET_DATA = {
  fellowships: {
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    questions: [question("why"), question("read", { required: false, wordLimit: 150 })],
  },
  [TAIS]: {
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [
      question("python", { type: "scale", options: ["Never tried", "Can follow it", "Write it often"], scored: true, wordLimit: null }),
      question("built", { scored: true }),
    ],
  },
  [AGI]: {
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [question("event", { scored: true })],
  },
  incubator: {
    role: "general",
    scope: { type: "kind", kind: "incubator" },
    label: "Research incubator",
    questions: [question("project"), question("research", { required: false })],
  },
  "incubator-technical": {
    role: "stream",
    scope: { type: "programme", programmeId: INC },
    label: "Technical stream",
    questions: [
      question("areas", { type: "multi", options: ["Interpretability", "Evals", "Robustness", "Control", "Something else"], scored: true, wordLimit: null }),
      question("pytorch", { type: "scale", options: ["Never tried", "Can follow it", "Write it often"], scored: true, wordLimit: null }),
    ],
  },
  facilitator: {
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    questions: [
      question("led"),
      question("which", { type: "choice", optionsFromRanking: true, wordLimit: null }),
      question("training", { type: "choice", options: ["Yes", "No"], wordLimit: null }),
    ],
  },
};

function roundData(over = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "draft",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    invitationReplyBy: "2026-10-25",
    programmeIds: [TAIS, AGI, INC],
    programmes: {
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "zach" }),
      [AGI]: programme({
        name: "AGI Strategy Fellowship",
        shortName: "AGI Strategy",
        places: 32,
        groupCount: 4,
        leadUid: "claudia",
        reviewerUids: ["lloyd"],
      }),
      [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", places: 12, leadUid: "zach" }),
    },
    questionSetIds: ["fellowships", TAIS, AGI, "incubator", "incubator-technical", "facilitator"],
    asksFacilitating: true,
    reviewerUids: ["zach", "claudia", "lloyd"],
    applicationCounts: {},
    ...over,
  };
}

const FORM = normalise.normaliseForm(ROUND, roundData());
const SETS = Object.entries(SET_DATA).map(([id, data]) =>
  normalise.normaliseQuestionSet(id, { roundId: ROUND, intro: "", ...data }),
);
const setById = (id) => SETS.find((set) => set.id === id);

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

describe("questions lock once anybody has sent an application", () => {
  const counts = (over) => ({
    draft: 0,
    submitted: 0,
    accepted: 0,
    "fellowship-offered": 0,
    waitlisted: 0,
    rejected: 0,
    withdrawn: 0,
    appointed: 0,
    invited: 0,
    "no-offer": 0,
    declined: 0,
    ...over,
  });

  test("drafts alone lock nothing", () => {
    assert.equal(lock.sentCount(counts({ draft: 40 })), 0);
    assert.equal(lock.questionsLocked(counts({ draft: 40 })), false);
    assert.equal(lock.questionsLocked(counts()), false);
  });

  test("one sent application locks, and so does every status a sent one can reach", () => {
    assert.equal(lock.questionsLocked(counts({ submitted: 1 })), true);
    for (const status of ["accepted", "invited", "no-offer", "declined", "withdrawn"]) {
      assert.equal(lock.questionsLocked(counts({ [status]: 1 })), true, status);
    }
    assert.equal(lock.sentCount(counts({ draft: 3, submitted: 20, accepted: 5, invited: 2 })), 27);
  });

  test("the sentence is the design's, with a singular", () => {
    assert.equal(lock.lockedSentence(57), "57 people have applied, so the questions are locked.");
    assert.equal(lock.lockedSentence(1), "1 person has applied, so the questions are locked.");
  });
});

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

describe("an id is minted from a name and never taken from one", () => {
  test("whatever is typed, the id is letters, digits, hyphen and underscore", () => {
    const names = [
      "AGI Strategy Fellowship",
      "programmes.agi.places",
      "a/b/../c",
      "  ",
      "Café Société: the “plan”",
      "__proto__",
      "x".repeat(400),
      "日本語",
    ];
    for (const name of names) {
      const id = ids.mintId(name);
      assert.ok(normalise.isId(id), `${JSON.stringify(name)} minted ${JSON.stringify(id)}`);
      assert.ok(!id.includes("."), "a dot in an id would address a different field");
      assert.ok(id.length <= 40, "an id stays short enough to read");
    }
  });

  test("it reads like the name and ends in a short suffix", () => {
    assert.match(ids.mintId("AGI Strategy"), /^agi-strategy-[0-9a-z]{4}$/);
  });

  test("it never repeats one that is taken, and two minted from one name differ", () => {
    const taken = new Set();
    for (let i = 0; i < 400; i += 1) {
      const id = ids.mintId("Fellowships", taken);
      assert.ok(!taken.has(id));
      taken.add(id);
    }
  });
});

describe("a map is read by its own keys only", () => {
  const FURNITURE = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf"];

  test("an id every object answers to finds nothing", () => {
    const programmes = { "agi-strategy": { name: "AGI Strategy Fellowship" } };
    assert.deepEqual(ownership.own(programmes, "agi-strategy"), { name: "AGI Strategy Fellowship" });
    assert.equal(ownership.own(programmes, "technical-ai-safety"), undefined);
    for (const id of FURNITURE) {
      assert.equal(ownership.own(programmes, id), undefined, id);
      assert.equal(ownership.isObjectFurniture(id), true, id);
      // Each one is SHAPED like an id: letters, digits, hyphen and underscore.
      // That is why the shape alone is not enough.
      assert.match(id, /^[A-Za-z0-9_-]{1,80}$/, id);
      // And each one is refused as an id all the same. The contract's `isId`
      // turns away a name every object carries, so such a name is stopped
      // where a request is read as well as here. Both rules are kept because
      // they fail differently: `isId` is only as good as every write path
      // asking it, and `own` is only as good as every read going through it.
      assert.equal(normalise.isId(id), false, id);
    }
    assert.equal(ownership.isObjectFurniture("agi-strategy"), false);
    assert.equal(normalise.isId("agi-strategy"), true);
  });

  test("the accessor is the contract's own, not a second one", () => {
    // One function, reached by two import paths. A copy kept here would be a
    // second place for the rule to drift.
    assert.equal(ownership.own, keys.own);
    // It takes a missing map as an empty one.
    assert.equal(ownership.own(undefined, "agi-strategy"), undefined);
    assert.equal(ownership.own(null, "constructor"), undefined);
  });

  test("a stream whose programme id is one of them is shown to nobody and belongs nowhere", () => {
    for (const programmeId of FURNITURE) {
      const stray = { id: "stray", label: "Stray", scope: { type: "programme", programmeId } };
      assert.equal(sets.familyOf(stray, FORM), "unplaced", programmeId);
      assert.match(sets.whoSees(stray, FORM), /^Nobody\./, programmeId);
      assert.match(sets.describeSet(stray, FORM, SETS), /^Nobody sees these\./, programmeId);
      assert.deepEqual(sets.setsForProgramme(FORM, SETS, programmeId), [], programmeId);
    }
  });

  test("an id is never minted as one", () => {
    for (const name of FURNITURE) assert.ok(!ownership.isObjectFurniture(ids.mintId(name)), name);
  });
});

// ---------------------------------------------------------------------------
// Who sees a set, in the design's words
// ---------------------------------------------------------------------------

describe("the sentences that say who sees a set", () => {
  test("the line under each set in the list, for the autumn form", () => {
    const expected = {
      fellowships: "People who tick either fellowship",
      [TAIS]: "People who tick Technical AI Safety",
      [AGI]: "People who tick AGI Strategy",
      incubator: "People who tick the incubator",
      "incubator-technical": "Everyone who ticks the incubator",
      facilitator: "People who say yes to facilitating",
    };
    for (const [id, sentence] of Object.entries(expected)) {
      assert.equal(sets.whoSees(setById(id), FORM), sentence, id);
    }
  });

  test("the sentence under an open set's heading", () => {
    assert.equal(sets.describeSet(setById("fellowships"), FORM, SETS), "Asked once, to anyone who ticks a fellowship.");
    assert.equal(
      sets.describeSet(setById(AGI), FORM, SETS),
      "People who tick AGI Strategy see these after the fellowship questions.",
    );
    assert.equal(
      sets.describeSet(setById("incubator-technical"), FORM, SETS),
      "Everyone who ticks the incubator sees these after the incubator questions.",
    );
    // With no general set there is nothing for a stream to come after.
    assert.equal(sets.describeSet(setById(AGI), FORM, [setById(AGI)]), "People who tick AGI Strategy see these.");
  });

  test("a closed programme's stream, and one whose programme has gone, are shown to nobody", () => {
    const closed = normalise.normaliseForm(
      ROUND,
      roundData({ programmes: { ...roundData().programmes, [AGI]: { ...roundData().programmes[AGI], closed: true } } }),
    );
    assert.equal(sets.whoSees(setById(AGI), closed), "Nobody while AGI Strategy is closed");
    assert.equal(sets.whoSees(setById("fellowships"), closed), "People who tick a fellowship");
    const gone = normalise.normaliseForm(ROUND, roundData({ programmeIds: [TAIS, INC] }));
    assert.match(sets.whoSees(setById(AGI), gone), /^Nobody\./);
    assert.equal(sets.familyOf(setById(AGI), gone), "unplaced");
  });

  test("what a programme's settings call its sets", () => {
    assert.deepEqual(
      sets.setsForProgramme(FORM, SETS, AGI).map((set) => sets.summaryLabel(set, FORM, AGI)),
      ["Fellowship questions, shared with Technical AI Safety", "AGI Strategy questions"],
    );
    assert.deepEqual(
      sets.setsForProgramme(FORM, SETS, INC).map((set) => sets.summaryLabel(set, FORM, INC)),
      ["Incubator questions", "Technical stream questions"],
    );
    assert.deepEqual(sets.setsForProgramme(FORM, SETS, "not-on-the-form"), []);
  });

  test("the chips under a question", () => {
    assert.deepEqual(sets.questionChips(setById("fellowships").questions[0]), ["Long answer", "300 words"]);
    assert.deepEqual(sets.questionChips(setById(TAIS).questions[0]), ["Scale", "3 points"]);
    assert.deepEqual(sets.questionChips(setById("incubator-technical").questions[0]), ["Multi-choice", "5 options"]);
    assert.deepEqual(sets.questionChips(setById("facilitator").questions[1]), ["Choice", "From their ranking"]);
  });

  test("only a stream set is scored, and the others say why not", () => {
    assert.equal(sets.scoredRefusal("stream"), null);
    assert.equal(sets.scoredRefusal("general"), "General questions aren’t scored.");
    assert.equal(typeof sets.scoredRefusal("facilitator"), "string");
    assert.equal(sets.isScoredSet(setById(AGI)), true);
    assert.equal(sets.isScoredSet(setById("fellowships")), false);
  });

  test("the built-in sections, with the grid's own times", () => {
    assert.deepEqual(
      sets.fixedSectionsBefore({ asksFacilitating: true }).map((section) => section.label),
      ["About you", "Choose", "Rank", "Facilitating"],
    );
    assert.deepEqual(
      sets.fixedSectionsBefore({ asksFacilitating: false }).map((section) => section.label),
      ["About you", "Choose", "Rank"],
    );
    const after = sets.fixedSectionsAfter({ version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 });
    assert.deepEqual(after.map((section) => section.label), ["Availability", "Check and send"]);
    assert.equal(after[0].detail, "15-minute slots, 9am to 9pm");
    assert.equal(
      sets.fixedSectionsAfter({ version: 1, startMinute: 570, endMinute: 1080, slotMinutes: 30 })[0].detail,
      "30-minute slots, 9:30am to 6pm",
    );
  });
});

describe("where a new set goes in the form's order", () => {
  const order = FORM.questionSetIds;

  test("a stream joins the end of its own family", () => {
    const added = { id: "incubator-governance", scope: { type: "programme", programmeId: INC } };
    assert.deepEqual(sets.orderWithNewSet(order, SETS, FORM, added), [
      "fellowships",
      TAIS,
      AGI,
      "incubator",
      "incubator-technical",
      "incubator-governance",
      "facilitator",
    ]);
  });

  test("a family the form has not met goes before the facilitator questions", () => {
    const fellowshipOnly = SETS.filter((set) => ["fellowships", AGI, "facilitator"].includes(set.id));
    const added = { id: "incubator", scope: { type: "kind", kind: "incubator" } };
    assert.deepEqual(sets.orderWithNewSet(["fellowships", AGI, "facilitator"], fellowshipOnly, FORM, added), [
      "fellowships",
      AGI,
      "incubator",
      "facilitator",
    ]);
  });

  test("facilitator questions go last, and an empty form takes anything", () => {
    assert.deepEqual(
      sets.orderWithNewSet(["fellowships"], [setById("fellowships")], FORM, { id: "fac", scope: { type: "facilitating" } }),
      ["fellowships", "fac"],
    );
    assert.deepEqual(sets.orderWithNewSet([], [], FORM, { id: "a", scope: { type: "kind", kind: "fellowship" } }), ["a"]);
  });

  test("the role follows from who the set is for", () => {
    assert.equal(sets.roleForScope({ type: "kind", kind: "fellowship" }), "general");
    assert.equal(sets.roleForScope({ type: "programme", programmeId: AGI }), "stream");
    assert.equal(sets.roleForScope({ type: "facilitating" }), "facilitator");
  });
});

// ---------------------------------------------------------------------------
// Reading what the editor sends
// ---------------------------------------------------------------------------

const refusal = (parsed) => {
  assert.equal(parsed.ok, false, `expected a refusal, got ${JSON.stringify(parsed)}`);
  assert.ok(parsed.error.length > 10, "a refusal is a sentence a person can act on");
  return parsed.error;
};

describe("a new form and a change to the form", () => {
  test("a form needs a name within its limit", () => {
    assert.deepEqual(parse.parseNewForm({ label: "  Autumn 2026 " }), { ok: true, value: { label: "Autumn 2026" } });
    for (const body of [null, {}, { label: "" }, { label: "   " }, { label: 7 }, []]) refusal(parse.parseNewForm(body));
    assert.match(refusal(parse.parseNewForm({ label: "x".repeat(81) })), /1 character over its limit of 80/);
  });

  test("the dates arrive as a London date and time and leave as the instant they name", () => {
    const parsed = parse.parseFormChange({
      opens: { date: "2026-10-06", time: "09:00" },
      closes: { date: "2026-10-18", time: "23:59" },
      decisions: "2026-10-23",
      replyBy: "2026-10-25",
    });
    assert.equal(parsed.ok, true);
    // British Summer Time: 09:00 in London is 08:00 UTC.
    assert.equal(parsed.value.opensAt.toISOString(), "2026-10-06T08:00:00.000Z");
    assert.equal(parsed.value.closesAt.toISOString(), "2026-10-18T22:59:00.000Z");
    assert.equal(parsed.value.decisionsByDate, "2026-10-23");
    assert.equal(parsed.value.invitationReplyBy, "2026-10-25");
    // After the clocks go back the same wall clock is the same hour in UTC.
    const winter = parse.parseFormChange({ closes: { date: "2026-12-13", time: "23:59" } });
    assert.equal(winter.value.closesAt.toISOString(), "2026-12-13T23:59:00.000Z");
  });

  test("a date can be cleared, and a date that is not one is refused", () => {
    assert.deepEqual(parse.parseFormChange({ opens: null, decisions: null }).value, { opensAt: null, decisionsByDate: null });
    refusal(parse.parseFormChange({ opens: { date: "2026-02-31", time: "09:00" } }));
    refusal(parse.parseFormChange({ closes: { date: "2026-10-18", time: "25:00" } }));
    refusal(parse.parseFormChange({ closes: "2026-10-18T23:59:00Z" }));
    refusal(parse.parseFormChange({ decisions: "23 October" }));
    refusal(parse.parseFormChange({ replyBy: "2026-13-01" }));
  });

  test("the form's status, and everything written elsewhere, is refused with where it is done", () => {
    for (const field of ["status", "programmes", "questionSetIds", "reviewerUids", "applicationCounts", "formVersion"]) {
      refusal(parse.parseFormChange({ [field]: field === "status" ? "open" : {}, label: "Autumn 2026" }));
    }
    assert.match(refusal(parse.parseFormChange({ status: "open" })), /not done here/);
  });

  test("an empty change is refused, and so is a field of the wrong type", () => {
    refusal(parse.parseFormChange({}));
    refusal(parse.parseFormChange(null));
    refusal(parse.parseFormChange({ asksFacilitating: "yes" }));
    refusal(parse.parseFormChange({ label: "" }));
    refusal(parse.parseFormChange({ programmeIds: "a,b" }));
    refusal(parse.parseFormChange({ programmeIds: ["a", "a"] }));
    refusal(parse.parseFormChange({ programmeIds: ["a.b"] }));
  });

  test("a new programme needs a name and a kind, and its short name defaults to the name", () => {
    assert.deepEqual(
      parse.parseFormChange({ addProgramme: { name: " AGI Strategy ", kind: "fellowship" } }).value.addProgramme,
      { name: "AGI Strategy", shortName: "AGI Strategy", kind: "fellowship" },
    );
    refusal(parse.parseFormChange({ addProgramme: { name: "", kind: "fellowship" } }));
    refusal(parse.parseFormChange({ addProgramme: { name: "A", kind: "seminar" } }));
    refusal(parse.parseFormChange({ addProgramme: { name: "x".repeat(60), kind: "fellowship" } }));
  });
});

describe("a question set and its questions", () => {
  const long = { text: "Why this term?", type: "long", wordLimit: 300, required: true };

  test("a question is read into exactly the stored shape", () => {
    const parsed = parse.parseSetChange({ questions: [{ ...long, id: "why", help: " Be brief. ", extra: "dropped" }] });
    assert.deepEqual(parsed.value.questions, [
      {
        id: "why",
        text: "Why this term?",
        help: "Be brief.",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 300,
        required: true,
        scored: false,
      },
    ]);
  });

  test("an id that is not shaped like one is treated as no id at all", () => {
    for (const id of ["a.b", "programmes/agi", "", 7, null, "x".repeat(81)]) {
      assert.equal(parse.parseSetChange({ questions: [{ ...long, id }] }).value.questions[0].id, null, String(id));
    }
  });

  test("each way a question can be wrong names the question", () => {
    const bad = [
      [{ ...long, text: "  " }, /Question 2 needs its text/],
      [{ ...long, text: "x".repeat(301) }, /Question 2 is 1 character over its limit of 300/],
      [{ ...long, type: "essay" }, /Question 2 has an answer type/],
      [{ ...long, wordLimit: 0 }, /word limit/],
      [{ ...long, wordLimit: 2.5 }, /word limit/],
      [{ ...long, wordLimit: 1001 }, /word limit/],
      [{ text: "Pick", type: "choice", options: ["Yes"] }, /Question 2 needs at least 2 options/],
      [{ text: "Pick", type: "multi" }, /Question 2 needs its options/],
      [{ text: "Pick", type: "scale", options: ["Low", "Low"] }, /lists “Low” twice/],
      [{ text: "Pick", type: "multi", options: Array.from({ length: 11 }, (_, i) => `o${i}`) }, /at most 10 options/],
      [{ ...long, required: "yes" }, /required/],
      [{ ...long, scored: 1 }, /scored/],
      ["not a question", /Question 2 is not a question/],
    ];
    for (const [question, pattern] of bad) {
      assert.match(refusal(parse.parseSetChange({ questions: [long, question] })), pattern);
    }
  });

  test("options from the ranking need no list, and a text question keeps none", () => {
    const parsed = parse.parseSetChange({
      questions: [
        { text: "Which?", type: "choice", optionsFromRanking: true, options: ["ignored"] },
        { ...long, options: ["ignored"], optionsFromRanking: true },
        { text: "How?", type: "scale", options: ["Low", "High"], wordLimit: 300 },
      ],
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value.questions.map((q) => [q.options, q.optionsFromRanking, q.wordLimit]), [
      [[], true, null],
      [[], false, 300],
      [["Low", "High"], false, null],
    ]);
  });

  test("a set takes at most its cap, and the same question twice is refused", () => {
    const many = Array.from({ length: model.APPLICATION_LIMITS.maxQuestionsPerSet + 1 }, () => long);
    assert.match(refusal(parse.parseSetChange({ questions: many })), /at most 12 questions/);
    refusal(parse.parseSetChange({ questions: [{ ...long, id: "why" }, { ...long, id: "why" }] }));
    refusal(parse.parseSetChange({ questions: "none" }));
  });

  test("who a set is for cannot be changed after it is made", () => {
    refusal(parse.parseSetChange({ scope: { type: "facilitating" } }));
    refusal(parse.parseSetChange({ role: "stream" }));
    refusal(parse.parseSetChange({}));
    assert.deepEqual(parse.parseSetChange({ label: " Technical stream ", intro: "" }).value, {
      label: "Technical stream",
      intro: "",
    });
    refusal(parse.parseSetChange({ label: "" }));
  });

  test("a new set needs a name and somebody to show it to", () => {
    assert.deepEqual(parse.parseNewSet({ label: "Technical stream", scope: { type: "programme", programmeId: INC } }).value, {
      label: "Technical stream",
      scope: { type: "programme", programmeId: INC },
    });
    refusal(parse.parseNewSet({ label: "Technical stream" }));
    refusal(parse.parseNewSet({ label: "", scope: { type: "facilitating" } }));
    refusal(parse.parseNewSet({ label: "A", scope: { type: "kind", kind: "seminar" } }));
    refusal(parse.parseNewSet({ label: "A", scope: { type: "programme", programmeId: "a.b" } }));
  });
});

describe("a programme's settings and who reviews it", () => {
  test("every field is read within its limit", () => {
    const parsed = parse.parseProgrammeChange({
      name: " AGI Strategy Fellowship ",
      pitch: "Where AI is heading.",
      starts: "w/c 26 Oct",
      places: 32,
      groupCount: 4,
      groupSize: "Up to 8",
      useScores: false,
    });
    assert.deepEqual(parsed.value, {
      name: "AGI Strategy Fellowship",
      pitch: "Where AI is heading.",
      starts: "w/c 26 Oct",
      groupSize: "Up to 8",
      places: 32,
      groupCount: 4,
      useScores: false,
    });
    assert.deepEqual(parse.parseProgrammeChange({ places: null, groupCount: "" }).value, { places: null, groupCount: null });
  });

  test("what it refuses", () => {
    refusal(parse.parseProgrammeChange({}));
    refusal(parse.parseProgrammeChange({ name: "" }));
    refusal(parse.parseProgrammeChange({ pitch: "x".repeat(161) }));
    refusal(parse.parseProgrammeChange({ places: 32.5 }));
    refusal(parse.parseProgrammeChange({ places: -1 }));
    refusal(parse.parseProgrammeChange({ places: "32" }));
    refusal(parse.parseProgrammeChange({ groupCount: 0 }));
    refusal(parse.parseProgrammeChange({ useScores: "on" }));
    refusal(parse.parseProgrammeChange({ closed: "yes" }));
  });

  test("the lead, the reviewers and the kind are never saved through the settings", () => {
    for (const field of ["leadUid", "reviewerUids", "kind", "id", "runId"]) {
      refusal(parse.parseProgrammeChange({ [field]: "x", name: "A" }));
    }
  });

  test("the course a programme is for is a course's id, or nothing", () => {
    assert.deepEqual(parse.parseProgrammeChange({ courseId: "agi-strategy-fellowship__a1b2c3d4" }).value, {
      courseId: "agi-strategy-fellowship__a1b2c3d4",
    });
    // "No course page" is null, and an empty box means the same.
    assert.deepEqual(parse.parseProgrammeChange({ courseId: null }).value, { courseId: null });
    assert.deepEqual(parse.parseProgrammeChange({ courseId: "" }).value, { courseId: null });
    // Anything that could not be a document's id is refused before a document is read:
    // a path, a name every object carries, a number, a list.
    for (const bad of ["courses/x", "a.b", "constructor", "__proto__", " ", 7, ["x"], { id: "x" }, true, "x".repeat(81)]) {
      const refused = parse.parseProgrammeChange({ courseId: bad });
      refusal(refused);
      assert.equal(refused.error, parse.COURSE_NOT_ON_OFFER, JSON.stringify(bad));
    }
    // It travels with the other fields of one save.
    assert.deepEqual(parse.parseProgrammeChange({ courseId: "c1", places: 12 }).value, { places: 12, courseId: "c1" });
  });

  test("a wording is stored, two empty boxes are the standard wording, and null clears it", () => {
    const parsed = parse.parseProgrammeChange({
      emailWording: { accepted: { subject: " You’re in ", body: "Hello" }, invitation: { subject: "", body: " " }, declined: null },
    });
    assert.deepEqual(parsed.value.emailWording, {
      accepted: { subject: "You’re in", body: "Hello" },
      invitation: null,
      declined: null,
    });
    refusal(parse.parseProgrammeChange({ emailWording: { "no-offer": { subject: "a", body: "b" } } }));
    refusal(parse.parseProgrammeChange({ emailWording: { accepted: { subject: "x".repeat(121), body: "" } } }));
    refusal(parse.parseProgrammeChange({ emailWording: {} }));
  });

  test("a roles change says who leads or who reviews, and nothing about who may say so", () => {
    assert.deepEqual(parse.parseRolesChange({ leadUid: null }).value, { leadUid: null });
    assert.deepEqual(parse.parseRolesChange({ reviewerUids: ["lloyd"] }).value, { reviewerUids: ["lloyd"] });
    refusal(parse.parseRolesChange({}));
    refusal(parse.parseRolesChange(null));
    refusal(parse.parseRolesChange({ leadUid: 7 }));
    refusal(parse.parseRolesChange({ reviewerUids: "lloyd" }));
    refusal(parse.parseRolesChange({ reviewerUids: ["lloyd", ""] }));
  });
});

// ---------------------------------------------------------------------------
// What each screen is handed
// ---------------------------------------------------------------------------

const NAMES = new Map([
  ["zach", "Zach"],
  ["claudia", "Claudia"],
  ["lloyd", "Lloyd"],
]);

const context = (over = {}) => ({
  now: new Date("2026-10-05T12:00:00Z"),
  viewerUid: "claudia",
  roleOn: (programmeId) => (programmeId === AGI ? "lead" : null),
  names: NAMES,
  canRunTerm: false,
  ...over,
});

describe("what the staff screens are handed", () => {
  test("the form, field by field, and nothing the list does not name", () => {
    const view = views.projectFormForStaff(FORM, context());
    assert.deepEqual(Object.keys(view).sort(), [
      "asksFacilitating",
      "canRunTerm",
      "closes",
      "decisions",
      "draft",
      "id",
      "label",
      "locked",
      "opens",
      "programmes",
      "replyBy",
      "sent",
      "state",
    ]);
    assert.deepEqual(Object.keys(view.programmes[0]).sort(), [
      "closed",
      "facts",
      "groupCount",
      "id",
      "kind",
      "lead",
      "name",
      "places",
      "role",
      "shortName",
      "starts",
    ]);
    assert.deepEqual(view.opens, { date: "2026-10-06", time: "09:00", day: "Tue 6 Oct", dayAndTime: "Tue 6 Oct, 09:00" });
    assert.equal(view.closes.dayAndTime, "Sun 18 Oct, 23:59");
    assert.deepEqual(view.decisions, { date: "2026-10-23", day: "Fri 23 Oct" });
    assert.deepEqual(view.replyBy, { date: "2026-10-25", day: "Sun 25 Oct" });
  });

  test("each programme carries the caller's own role, and the lead is marked when it is them", () => {
    const view = views.projectFormForStaff(FORM, context());
    assert.deepEqual(view.programmes.map((p) => [p.id, p.role, p.lead?.name, p.lead?.you]), [
      [TAIS, null, "Zach", false],
      [AGI, "lead", "Claudia", true],
      [INC, null, "Zach", false],
    ]);
  });

  test("somebody named whose account has gone is still shown as somebody", () => {
    const view = views.projectFormForStaff(FORM, context({ names: new Map() }));
    assert.equal(view.programmes[1].lead.name, "Somebody whose account has gone");
  });

  test("the one chip that says where the form is follows the window", () => {
    const state = (over, now) => views.formStateFor(normalise.normaliseForm(ROUND, roundData(over)), new Date(now));
    assert.deepEqual(state({}, "2026-10-05T12:00:00Z"), { key: "draft", label: "Draft", live: false });
    assert.deepEqual(state({ status: "open" }, "2026-10-05T12:00:00Z"), {
      key: "opens",
      label: "Opens Tue 6 Oct",
      live: false,
    });
    assert.deepEqual(state({ status: "open" }, "2026-10-10T12:00:00Z"), { key: "open", label: "Open", live: true });
    assert.equal(state({ status: "open" }, "2026-10-19T12:00:00Z").key, "closed");
    assert.deepEqual(state({ status: "deciding" }, "2026-10-19T12:00:00Z"), {
      key: "deciding",
      label: "Deciding",
      live: true,
    });
    assert.equal(state({ status: "open", archived: true }, "2026-10-10T12:00:00Z").key, "archived");
  });

  test("a question set for the editor carries its questions and who sees it", () => {
    const view = views.projectSetForEditor(setById(AGI), FORM, SETS);
    // `applicantLine` is the line shown to applicants under the set's heading,
    // beside `intro`, the note for admins. An admin edits both.
    assert.deepEqual(Object.keys(view).sort(), [
      "applicantLine",
      "audience",
      "description",
      "family",
      "id",
      "intro",
      "label",
      "questions",
      "role",
      "scope",
    ]);
    assert.equal(view.family, "fellowship");
    assert.equal(view.audience, "People who tick AGI Strategy");
    assert.deepEqual(Object.keys(view.questions[0]).sort(), [
      "help",
      "id",
      "optionsFromRanking",
      "options",
      "required",
      "scored",
      "text",
      "type",
      "wordLimit",
    ].sort());
    assert.deepEqual(
      views.setsInFormOrder(FORM, [...SETS].reverse()).map((set) => set.id),
      FORM.questionSetIds,
    );
  });

  test("a programme's settings, for its lead", () => {
    const setup = views.projectProgrammeForSetup(FORM, SETS, FORM.programmes[AGI], {
      ...context(),
      role: "lead",
      candidates: [{ uid: "yusuf", name: "Yusuf", fullName: "Yusuf Demir" }],
      courses: [],
      applications: 0,
    });
    assert.equal(setup.courseId, null, "a programme starts with no course page");
    assert.deepEqual(setup.courses, []);
    assert.equal(setup.lockedSentence, null, "nobody has applied, so nothing is locked");
    assert.deepEqual(setup.lead, { uid: "claudia", name: "Claudia", you: true });
    assert.deepEqual(setup.reviewers, [{ uid: "lloyd", name: "Lloyd", you: false }]);
    assert.deepEqual(setup.questionSets, [
      { id: "fellowships", label: "Fellowship questions, shared with Technical AI Safety", questions: 2, scored: false },
      { id: AGI, label: "AGI Strategy questions", questions: 1, scored: true },
    ]);
    assert.deepEqual(
      setup.emails.map((email) => [email.kind, email.title, email.subject, email.note, email.wording]),
      [
        ["accepted", "You’re in", "You’re in AGI Strategy", "with I’m coming and I can’t make it", null],
        ["invitation", "Invitation", "An invitation to AGI Strategy", "if the committee invites a pooled applicant here", null],
        ["declined", "Declined", "Your NAISI application", "off unless an admin switches it on", null],
      ],
    );
    assert.ok(!("leadUid" in setup) && !("reviewerUids" in setup), "people leave as names, not as the stored uids");
  });

  test("the lock sentence counts this programme's own applicants while it has any", () => {
    const locked = normalise.normaliseForm(ROUND, roundData({ applicationCounts: { submitted: 122 } }));
    const base = { ...context(), role: "lead", candidates: [], courses: [] };
    assert.equal(
      views.projectProgrammeForSetup(locked, SETS, locked.programmes[AGI], { ...base, applications: 57 }).lockedSentence,
      "57 people have applied, so the questions are locked.",
    );
    // Nobody ranked this programme, and the form is locked all the same.
    assert.equal(
      views.projectProgrammeForSetup(locked, SETS, locked.programmes[AGI], { ...base, applications: 0 }).lockedSentence,
      "122 people have applied, so the questions are locked.",
    );
  });

  test("a programme's own wording replaces the standard subject", () => {
    const worded = normalise.normaliseForm(
      ROUND,
      roundData({
        programmes: {
          ...roundData().programmes,
          [AGI]: { ...roundData().programmes[AGI], emailWording: { accepted: { subject: "Welcome", body: "Hello" } } },
        },
      }),
    );
    const setup = views.projectProgrammeForSetup(worded, SETS, worded.programmes[AGI], {
      ...context(),
      role: "lead",
      candidates: [],
      courses: [],
      applications: 0,
    });
    assert.equal(setup.emails[0].subject, "Welcome");
    assert.deepEqual(setup.emails[0].wording, { subject: "Welcome", body: "Hello" });
  });

  test("the course a programme is for, and the picker's entries, field by field", () => {
    const tied = normalise.normaliseForm(
      ROUND,
      roundData({
        programmes: {
          ...roundData().programmes,
          [AGI]: { ...roundData().programmes[AGI], courseId: "agi-strategy-fellowship__a1b2c3d4" },
        },
      }),
    );
    // What the loader hands over, with a field the screen is not for.
    const courses = [
      { id: "agi-strategy-fellowship__a1b2c3d4", label: "AGI Strategy Fellowship", standing: "published", selectable: true, authorUid: "zach" },
      { id: "tais__e5f6a7b8", label: "A course that is not published yet", standing: "draft", selectable: false, title: "Unannounced" },
    ];
    const setup = views.projectProgrammeForSetup(tied, SETS, tied.programmes[AGI], {
      ...context(),
      role: "lead",
      candidates: [],
      courses,
      applications: 0,
    });
    assert.equal(setup.courseId, "agi-strategy-fellowship__a1b2c3d4");
    assert.deepEqual(setup.courses, [
      { id: "agi-strategy-fellowship__a1b2c3d4", label: "AGI Strategy Fellowship", standing: "published", selectable: true },
      { id: "tais__e5f6a7b8", label: "A course that is not published yet", standing: "draft", selectable: false },
    ]);
    assert.ok(!JSON.stringify(setup).includes("Unannounced"), "only the label the loader wrote leaves");
  });

  test("a stored course id that could not be one is read as no course", () => {
    for (const bad of ["courses/x", "a.b", "constructor", "", 7, null, undefined, ["x"]]) {
      const form = normalise.normaliseForm(
        ROUND,
        roundData({ programmes: { ...roundData().programmes, [AGI]: { ...roundData().programmes[AGI], courseId: bad } } }),
      );
      assert.equal(form.programmes[AGI].courseId, null, JSON.stringify(bad));
    }
  });
});

describe("the editor never offers a word an applicant must not read", () => {
  test("no sentence these modules can produce uses one", async () => {
    const words = await loadTs(join("lib", "applications", "words.ts"));
    const sentences = [
      ...SETS.flatMap((set) => [sets.whoSees(set, FORM), sets.describeSet(set, FORM, SETS)]),
      lock.lockedSentence(57),
      ...sets.fixedSectionsBefore({ asksFacilitating: true }).map((s) => `${s.label} ${s.detail}`),
      ...["accepted", "invitation", "declined"].map((kind) => views.defaultEmailSubject(kind, "AGI Strategy")),
    ];
    for (const sentence of sentences) {
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) {
        assert.ok(!sentence.toLowerCase().includes(word), `"${sentence}" uses "${word}"`);
      }
    }
  });
});
