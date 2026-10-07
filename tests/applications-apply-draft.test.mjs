/**
 * Reading a draft off the wire.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * The form saves as somebody types, so a save has to accept a half-written
 * application: a required box still empty, an answer over its limit. What a
 * save must never do is store something this form could not have asked for.
 * `src/lib/applications/applicant/draft.ts` is that clean-up, and this file
 * runs it for real against a small form:
 *
 *  - a ranking holds programmes that are on the form and taking
 *    applications, found on the form's own list. An id that is merely the
 *    name of something every object inherits (`constructor`, `__proto__`) is
 *    not a programme, however a plain lookup would answer;
 *  - an answer is to a question on the form and is the kind of value that
 *    question collects;
 *  - the availability grid's geometry is the form's, whatever the request
 *    says;
 *  - the university email is the account's, whatever the request says.
 *
 * The same clean-up runs on the stored draft before a send
 * (`cleanContent(..., "on-form")`), which keeps a closed programme in the
 * order so that the send can refuse it in words.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const at = (file) => join("lib", "applications", "applicant", file);

const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const draft = await loadTs(at("draft.ts"));
const account = await loadTs(at("account.ts"));
const keysModule = await loadTs(at("keys.ts"));
const availability = await loadTs(join("lib", "admissions", "availability.ts"));

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";
const CLOSED = "governance";

function programme(overrides = {}) {
  return {
    kind: "fellowship",
    name: "A fellowship",
    shortName: "A fellowship",
    pitch: "",
    facts: "6 WEEKS",
    starts: "w/c 26 Oct",
    places: 24,
    groupCount: 3,
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

const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

function form(overrides = {}) {
  return normalise.normaliseForm(ROUND, {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "open",
    availabilityGrid: GRID,
    programmeIds: [TAIS, AGI, INCUBATOR, CLOSED],
    programmes: {
      [TAIS]: programme({ shortName: "Technical AI Safety" }),
      [AGI]: programme({ shortName: "AGI Strategy" }),
      [INCUBATOR]: programme({ kind: "incubator", shortName: "Research incubator" }),
      [CLOSED]: programme({ shortName: "AI Governance", closed: true }),
    },
    questionSetIds: ["fellowships", TAIS, AGI, "incubator-technical", "facilitator"],
    asksFacilitating: true,
    ...overrides,
  });
}

const q = (id, type, more = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type,
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
  ...more,
});

const SETS = [
  normalise.normaliseQuestionSet("fellowships", {
    roundId: ROUND,
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    questions: [q("why", "long", { wordLimit: 5 }), q("name", "short", { required: false })],
  }),
  normalise.normaliseQuestionSet(TAIS, {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [q("python", "scale", { options: ["Never tried", "Can follow it", "Write it often"] })],
  }),
  normalise.normaliseQuestionSet(AGI, {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [q("event", "long")],
  }),
  normalise.normaliseQuestionSet("incubator-technical", {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: INCUBATOR },
    label: "Technical stream",
    questions: [q("areas", "multi", { options: ["Interpretability", "Evals", "Robustness"] })],
  }),
  normalise.normaliseQuestionSet("facilitator", {
    roundId: ROUND,
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    questions: [
      q("which", "choice", { optionsFromRanking: true }),
      q("training", "choice", { options: ["Yes", "No"] }),
    ],
  }),
];

/** What the account's own profile says. The request never gets to say otherwise. */
const ACCOUNT = {
  preferredName: "Amara",
  universityEmail: "ada@nottingham.ac.uk",
  universityEmailVerified: true,
  status: "undergraduate",
  statusOther: "",
  subject: "BA Philosophy",
  expectedGraduation: "2028-07",
  motivation: "From the account.",
  interests: "",
};

function body(overrides = {}) {
  return {
    aboutYou: {
      preferredName: " Amara ",
      universityEmail: "someone@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "ignored unless the status is other",
      subject: " BA Philosophy ",
      expectedGraduation: "2028-07",
      motivation: "Typed on the form. ",
      interests: "",
    },
    rankedProgrammeIds: [AGI, TAIS],
    wantsToFacilitate: true,
    answers: {},
    availability: { days: [] },
    suMembership: "yes",
    ...overrides,
  };
}

const read = (raw, onForm = form()) => draft.readDraft(raw, onForm, SETS, ACCOUNT);

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe("a save that is not a draft at all is refused with a sentence", () => {
  test("anything but an object", () => {
    for (const raw of [null, undefined, "draft", 7, [], true]) {
      const result = read(raw);
      assert.ok(draft.isDraftError(result), `${JSON.stringify(raw)} should be refused`);
      assert.match(result.error, /Reload the page and try again\.$/);
    }
  });

  test("a part of the wrong kind", () => {
    for (const raw of [
      body({ aboutYou: "Amara" }),
      body({ answers: ["a"] }),
      body({ availability: "always" }),
      body({ rankedProgrammeIds: AGI }),
      body({ availability: { days: "fff" } }),
    ]) {
      assert.ok(draft.isDraftError(read(raw)));
    }
  });

  test("more days than a week has", () => {
    const result = read(body({ availability: { days: new Array(8).fill("000000000000") } }));
    assert.deepEqual(result, { error: "That is more days than the availability grid has." });
  });

  test("an empty object is a draft: nothing ticked, nothing answered", () => {
    const result = read({});
    assert.equal(draft.isDraftError(result), false);
    assert.deepEqual(result.rankedProgrammeIds, []);
    assert.deepEqual(result.answers, {});
    assert.equal(result.wantsToFacilitate, null);
    assert.equal(result.suMembership, null);
  });
});

// ---------------------------------------------------------------------------
// A half-written form saves
// ---------------------------------------------------------------------------

describe("a half-written form is saved as it is", () => {
  test("a required answer left blank, and one over its word limit, are both kept", () => {
    const result = read(
      body({ answers: { fellowships: { why: "one two three four five six seven eight", name: "" } } }),
    );
    assert.equal(draft.isDraftError(result), false);
    assert.equal(result.answers.fellowships.why, "one two three four five six seven eight");
    assert.equal(result.answers.fellowships.name, "");
    // The send is what holds it to the form.
    const issues = validate.issuesFor(form(), SETS, result).map((issue) => issue.message);
    assert.ok(issues.includes("Keep this to 5 words."));
  });

  test("a programme ticked with none of its questions answered", () => {
    const result = read(body({ rankedProgrammeIds: [INCUBATOR], answers: {} }));
    assert.deepEqual(result.rankedProgrammeIds, [INCUBATOR]);
    assert.deepEqual(result.answers, {});
  });

  test("answers to a set that does not apply right now are kept, in case it is ticked again", () => {
    const result = read(body({ rankedProgrammeIds: [AGI], answers: { [TAIS]: { python: 2 } } }));
    assert.deepEqual(result.answers[TAIS], { python: 2 });
  });
});

// ---------------------------------------------------------------------------
// The ranking
// ---------------------------------------------------------------------------

describe("a ranking holds programmes on this form that are taking applications", () => {
  test("unknown ids, repeats and a closed programme are dropped; the order is kept", () => {
    const result = read(body({ rankedProgrammeIds: [INCUBATOR, "not-a-programme", AGI, INCUBATOR, CLOSED, TAIS] }));
    assert.deepEqual(result.rankedProgrammeIds, [INCUBATOR, AGI, TAIS]);
  });

  test("the name of something every object inherits is not a programme", () => {
    const furniture = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "prototype"];
    const result = read(body({ rankedProgrammeIds: [...furniture, AGI] }));
    assert.deepEqual(result.rankedProgrammeIds, [AGI]);
    // And the same list straight off JSON, where `__proto__` arrives as a real key.
    const parsed = JSON.parse(`{"rankedProgrammeIds":["__proto__","constructor","${TAIS}"]}`);
    assert.deepEqual(read(parsed).rankedProgrammeIds, [TAIS]);
  });

  test("values that are not ids at all", () => {
    const result = read(body({ rankedProgrammeIds: [7, null, { id: AGI }, "a.b", "a/b", "", AGI] }));
    assert.deepEqual(result.rankedProgrammeIds, [AGI]);
  });

  test("the open list is read off the form's own order", () => {
    assert.deepEqual(draft.openProgrammeIds(form()), [TAIS, AGI, INCUBATOR]);
    assert.deepEqual(draft.rankingOnForm(form(), [CLOSED, AGI, "constructor"], true), [AGI]);
  });

  test("before a send a closed programme stays in the order, so the send can refuse it in words", () => {
    assert.deepEqual(draft.rankingOnForm(form(), [CLOSED, AGI, "constructor", "__proto__"], false), [CLOSED, AGI]);
    const stored = { ...read(body()), rankedProgrammeIds: [CLOSED, AGI, "constructor"] };
    const cleaned = draft.cleanContent(stored, form(), SETS, ACCOUNT, "on-form");
    assert.deepEqual(cleaned.rankedProgrammeIds, [CLOSED, AGI]);
    const messages = validate.issuesFor(form(), SETS, cleaned).map((issue) => issue.message);
    assert.ok(messages.includes("AI Governance is not taking applications. Untick it to carry on."));
  });
});

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

describe("an answer is to a question on the form, in the shape that question collects", () => {
  test("a set or a question the form does not have is dropped", () => {
    const result = read(
      body({
        answers: {
          fellowships: { why: "Because.", invented: "x" },
          "not-a-set": { why: "x" },
        },
      }),
    );
    assert.deepEqual(Object.keys(result.answers), ["fellowships"]);
    assert.deepEqual(result.answers.fellowships, { why: "Because." });
  });

  test("text is text, and is cut at the hard ceiling for its kind", () => {
    const result = read(
      body({ answers: { fellowships: { why: "x".repeat(9000), name: "y".repeat(500) }, [AGI]: { event: 7 } } }),
    );
    assert.equal(result.answers.fellowships.why.length, 8000);
    assert.equal(result.answers.fellowships.name.length, 400);
    assert.deepEqual(result.answers[AGI], {}, "a number is not an answer to a text question");
  });

  test("a scale answer is a point that exists on the scale", () => {
    for (const [given, kept] of [
      [0, 0],
      [2, 2],
      [3, undefined],
      [-1, undefined],
      ["1", undefined],
      [1.5, 2],
    ]) {
      const result = read(body({ answers: { [TAIS]: { python: given } } }));
      assert.equal(result.answers[TAIS].python, kept, `python: ${JSON.stringify(given)}`);
    }
  });

  test("a multiple choice keeps the options that exist, in the question's own order", () => {
    const result = read(
      body({
        rankedProgrammeIds: [INCUBATOR],
        answers: { "incubator-technical": { areas: ["Robustness", "Invented", "Interpretability", "Robustness"] } },
      }),
    );
    assert.deepEqual(result.answers["incubator-technical"].areas, ["Interpretability", "Robustness"]);
  });

  test("a choice is one of the options, or it is nothing", () => {
    const kept = read(body({ answers: { facilitator: { training: "Yes" } } }));
    assert.equal(kept.answers.facilitator.training, "Yes");
    const dropped = read(body({ answers: { facilitator: { training: "Maybe", which: ["Either"] } } }));
    assert.deepEqual(dropped.answers.facilitator, {});
  });

  test("a choice from the person's own ranking follows the ranking in the same save", () => {
    const both = read(body({ rankedProgrammeIds: [AGI, TAIS], answers: { facilitator: { which: "Either" } } }));
    assert.equal(both.answers.facilitator.which, "Either");
    // With one programme ticked there is no "Either" to choose.
    const one = read(body({ rankedProgrammeIds: [AGI], answers: { facilitator: { which: "Either" } } }));
    assert.deepEqual(one.answers.facilitator, {});
    const named = read(body({ rankedProgrammeIds: [AGI], answers: { facilitator: { which: "AGI Strategy" } } }));
    assert.equal(named.answers.facilitator.which, "AGI Strategy");
  });

  test("keys that name an object's own furniture bring nothing with them", () => {
    const parsed = JSON.parse(
      '{"answers":{"__proto__":{"fellowships":"smuggled","why":"smuggled"},"constructor":{"why":"x"},"fellowships":{"__proto__":{"why":"smuggled"},"constructor":"x","name":"real"}}}',
    );
    const result = read({ ...body(), answers: parsed.answers });
    assert.equal(draft.isDraftError(result), false);
    assert.deepEqual(Object.keys(result.answers), ["fellowships"]);
    assert.deepEqual(Object.keys(result.answers.fellowships), ["name"]);
    assert.equal(result.answers.fellowships.name, "real");
    assert.equal(Object.getPrototypeOf(result.answers), Object.prototype);
    assert.equal(Object.getPrototypeOf(result.answers.fellowships), Object.prototype);
    assert.equal(JSON.stringify(result).includes("smuggled"), false);
  });
});

// ---------------------------------------------------------------------------
// About you
// ---------------------------------------------------------------------------

describe("About you is the person's own copy, except the university email", () => {
  test("the university email and its verified flag are the account's, whatever was sent", () => {
    const result = read(body());
    assert.equal(result.aboutYou.universityEmail, "ada@nottingham.ac.uk");
    assert.equal(result.aboutYou.universityEmailVerified, true);
    const unverified = draft.readDraft(body(), form(), SETS, { ...ACCOUNT, universityEmail: "", universityEmailVerified: false });
    assert.equal(unverified.aboutYou.universityEmail, "");
    assert.equal(unverified.aboutYou.universityEmailVerified, false, "a request cannot mark an address as verified");
  });

  test("everything else is what was typed on the form, not what the account holds", () => {
    const result = read(body());
    assert.equal(result.aboutYou.preferredName, "Amara");
    assert.equal(result.aboutYou.subject, "BA Philosophy");
    assert.equal(result.aboutYou.motivation, "Typed on the form. ", "a long answer is not trimmed mid-sentence");
  });

  test("what somebody does at UoN is one of the answers the site offers, or blank", () => {
    for (const status of ["undergraduate", "masters", "phd", "postdoc", "employee", "foundation", "other"]) {
      assert.equal(read(body({ aboutYou: { ...body().aboutYou, status } })).aboutYou.status, status);
    }
    for (const status of ["constructor", "__proto__", "toString", "hasOwnProperty", "professor", ""]) {
      assert.equal(read(body({ aboutYou: { ...body().aboutYou, status } })).aboutYou.status, "", `status: ${status}`);
    }
  });

  test("the role description is kept only for 'other', the graduation date only for students", () => {
    const student = read(body()).aboutYou;
    assert.equal(student.statusOther, "");
    assert.equal(student.expectedGraduation, "2028-07");
    const other = read(body({ aboutYou: { ...body().aboutYou, status: "other", statusOther: " Visiting researcher " } })).aboutYou;
    assert.equal(other.statusOther, "Visiting researcher");
    assert.equal(other.expectedGraduation, "");
    const staff = read(body({ aboutYou: { ...body().aboutYou, status: "employee" } })).aboutYou;
    assert.equal(staff.expectedGraduation, "");
  });
});

// ---------------------------------------------------------------------------
// The rest
// ---------------------------------------------------------------------------

describe("the grid's geometry is the form's", () => {
  test("a request that brings its own start time does not get to keep it", () => {
    // Monday 09:00 to 10:00 on the form's grid: the first four slots.
    const days = ["000000000000", "f00000000000"];
    const result = read(
      body({ availability: { version: 9, startMinute: 0, endMinute: 1440, slotMinutes: 60, days } }),
    );
    assert.equal(result.availability.startMinute, 540);
    assert.equal(result.availability.endMinute, 1260);
    assert.equal(result.availability.slotMinutes, 15);
    assert.equal(result.availability.version, 1);
    assert.equal(result.availability.days.length, 7);
    const columns = availability.decodeMask(result.availability.days, GRID);
    assert.deepEqual(columns[1].slice(0, 5), [true, true, true, true, false]);
  });

  test("a malformed day is an empty day, never a guess", () => {
    const result = read(body({ availability: { days: ["zzzz", 7, "f".repeat(40), "0f0000000000"] } }));
    assert.equal(result.availability.days[0], "000000000000");
    assert.equal(result.availability.days[1], "000000000000");
    assert.equal(result.availability.days[2], "000000000000");
    assert.equal(result.availability.days[3], "0f0000000000");
  });
});

describe("the two answers that are not questions on a set", () => {
  test("facilitating is not stored on a form that does not ask it", () => {
    assert.equal(read(body()).wantsToFacilitate, true);
    assert.equal(read(body(), form({ asksFacilitating: false })).wantsToFacilitate, null);
  });

  test("SU membership is yes, not yet, or not answered", () => {
    assert.equal(read(body({ suMembership: "yes" })).suMembership, "yes");
    assert.equal(read(body({ suMembership: "not-yet" })).suMembership, "not-yet");
    assert.equal(read(body({ suMembership: "no" })).suMembership, null);
  });
});

// ---------------------------------------------------------------------------
// The account
// ---------------------------------------------------------------------------

describe("About you, read off the account", () => {
  test("a full profile opens the form filled in", () => {
    const about = account.aboutYouFromAccount({
      profile: {
        preferredName: "Amara",
        universityEmail: "ada@nottingham.ac.uk",
        uniEmailVerifiedAt: new Date("2026-09-25T08:00:00Z"),
        status: "undergraduate",
        subject: "BA Philosophy",
        expectedGraduation: "2028-07",
        motivation: "Philosophy got me into it.",
        interests: "Governance and ethics",
      },
    });
    assert.deepEqual(about, {
      preferredName: "Amara",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "Philosophy got me into it.",
      interests: "Governance and ethics",
    });
  });

  test("an address is verified only when the account has proved it", () => {
    const unproved = account.aboutYouFromAccount({ profile: { universityEmail: "ada@nottingham.ac.uk" } });
    assert.equal(unproved.universityEmailVerified, false);
    const stampOnly = account.aboutYouFromAccount({ profile: { uniEmailVerifiedAt: new Date() } });
    assert.equal(stampOnly.universityEmailVerified, false, "a stamp with no address verifies nothing");
  });

  test("no document, no profile and junk all read as a blank form", () => {
    const blank = normalise.EMPTY_ABOUT_YOU;
    for (const raw of [null, undefined, {}, { profile: null }, { profile: "x" }, { profile: { status: "constructor", expectedGraduation: "soon", preferredName: 7 } }]) {
      assert.deepEqual(account.aboutYouFromAccount(raw), blank, JSON.stringify(raw));
    }
  });

  test("the account's email replaces whatever an About you held", () => {
    const about = account.withAccountEmail(
      { ...ACCOUNT, preferredName: "Typed", universityEmail: "someone@nottingham.ac.uk", universityEmailVerified: false },
      ACCOUNT,
    );
    assert.equal(about.preferredName, "Typed");
    assert.equal(about.universityEmail, "ada@nottingham.ac.uk");
    assert.equal(about.universityEmailVerified, true);
  });
});

// ---------------------------------------------------------------------------
// The lookups themselves
// ---------------------------------------------------------------------------

describe("a lookup answers only for a key the object itself holds", () => {
  const map = { real: 1 };

  test("own", () => {
    assert.equal(keysModule.own(map, "real"), 1);
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", "missing"]) {
      assert.equal(keysModule.own(map, key), undefined, key);
    }
    assert.equal(keysModule.own(null, "real"), undefined);
    assert.equal(keysModule.own(undefined, "real"), undefined);
  });

  test("hasOwn", () => {
    assert.equal(keysModule.hasOwn(map, "real"), true);
    assert.equal(keysModule.hasOwn(map, "constructor"), false);
    assert.equal(keysModule.hasOwn(map, "__proto__"), false);
    assert.equal(keysModule.hasOwn(JSON.parse('{"__proto__":1}'), "__proto__"), true, "a key somebody really put there is its own");
  });

  test("a key holding nothing reads as not there", () => {
    assert.equal(keysModule.hasOwn({ empty: undefined }, "empty"), false);
    assert.equal(keysModule.hasOwn(null, "real"), false);
    assert.equal(keysModule.hasOwn(undefined, "real"), false);
  });

  test("the accessor is the contract's own, not a second one", async () => {
    const contract = await loadTs(join("lib", "applications", "keys.ts"));
    assert.equal(keysModule.own, contract.own);
  });

  test("a key that may be written is an id, and no name every object carries is one", () => {
    assert.equal(keysModule.isSafeKey("agi-strategy"), true);
    // The contract's `isId` refuses every name a plain object answers to
    // without owning it, so none of them can be the id of a programme, a
    // question set or a question, and none can be written as a key. That
    // includes `constructor`, which this test once allowed as an ordinary key,
    // and `__proto__`, the one name whose assignment swaps a prototype.
    const carried = Object.getOwnPropertyNames(Object.prototype);
    assert.ok(carried.includes("constructor") && carried.includes("__proto__"));
    for (const key of [...carried, "", "a.b", "a/b", 7, null, undefined]) {
      assert.equal(keysModule.isSafeKey(key), false, String(key));
    }
  });
});

// ---------------------------------------------------------------------------
// The own-key read, by a name that IS an id
// ---------------------------------------------------------------------------

describe("a well-formed id a map only inherits is still not in it", () => {
  // Every name `Object.prototype` carries is refused as an id before any
  // lookup, so those names no longer reach the own-key read at all. The case
  // that does is an ordinary id the map answers to without holding it: a map
  // whose prototype carries it. A plain `map[id]` finds it; `own` does not.
  test("a programme", () => {
    const base = form();
    const programmes = Object.assign(Object.create({ ghost: programme({ shortName: "Ghost" }) }), base.programmes);
    const haunted = { ...base, programmeIds: [...base.programmeIds, "ghost"], programmes };
    assert.equal(normalise.isId("ghost"), true, "it has the shape of an id");
    assert.equal(haunted.programmes.ghost.shortName, "Ghost", "and a plain lookup answers for it");
    assert.deepEqual(draft.rankingOnForm(haunted, ["ghost", AGI], false), [AGI]);
    assert.deepEqual(draft.rankingOnForm(haunted, ["ghost", AGI], true), [AGI]);
    assert.deepEqual(draft.openProgrammeIds(haunted), [TAIS, AGI, INCUBATOR]);
    assert.deepEqual(read(body({ rankedProgrammeIds: ["ghost", AGI] }), haunted).rankedProgrammeIds, [AGI]);
  });

  test("an answer", () => {
    const answers = Object.create({ fellowships: { why: "inherited", name: "inherited" } });
    answers[AGI] = Object.create({ event: "inherited" });
    assert.equal(answers.fellowships.why, "inherited", "a plain lookup answers for the set");
    assert.equal(answers[AGI].event, "inherited", "and for the question");
    const stored = { ...read(body()), answers };
    const cleaned = draft.cleanContent(stored, form(), SETS, ACCOUNT, "on-form");
    assert.equal(JSON.stringify(cleaned).includes("inherited"), false);
    assert.deepEqual(cleaned.answers[AGI], {});
    assert.equal(Object.hasOwn(cleaned.answers, "fellowships"), false);
  });

  test("a status", () => {
    const labels = Object.create({ professor: "Professor" });
    assert.equal(labels.professor, "Professor");
    assert.equal(keysModule.hasOwn(labels, "professor"), false);
    assert.equal(keysModule.own(labels, "professor"), undefined);
  });
});
