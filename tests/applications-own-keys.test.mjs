/**
 * A NAME EVERY OBJECT CARRIES IS NEVER A PROGRAMME, A QUESTION SET OR A
 * QUESTION.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * The application system keeps its data in plain maps keyed by an id: a
 * form's `programmes`, an application's `answers`, a review's `scores`, a
 * decision document's `programmes`. The ids those maps are read by mostly do
 * not come from the map. They come from the ranking an applicant typed, from
 * a programme id in an address, from the form's questions being used to look
 * inside what an applicant sent.
 *
 * A plain object answers such a read from more than its own keys.
 * `programmes["constructor"]` is a function, and it is truthy. Code that
 * takes it for a programme reads fields off it, hands out a role on it, waits
 * for a lead to decide it, or adds one to a counter on it, which is a write
 * to a function every object in the process shares.
 *
 * Two rules in `src/lib/applications/keys.ts` close that:
 *
 *  1. `isId` refuses any name `Object.prototype` carries, so the normalisers,
 *     which keep only ids, drop such a name wherever it is stored.
 *  2. `own` is how a map is read by a key that did not come from it, and it
 *     answers from the map's own keys only.
 *
 * ## What is executed here
 *
 * EVERY EXPORTED FUNCTION OF THE CONTRACT IS ENUMERATED. Each one that reads
 * a map by an id is run against every name `Object.prototype` carries and has
 * to read it as not there; each one that does not says why. The table is
 * checked against the modules' real exports in both directions, so a function
 * added to the contract tomorrow has to say which kind it is.
 *
 * Then the four things the rule is for, as an applicant and a lead would meet
 * them: such a name cannot be sent, cannot give anybody a role, cannot be
 * what decision day is waiting on, and cannot be written to.
 *
 * Stubbed: `server-only`, and the one value `firebase-admin/firestore`
 * supplies. Everything under test is the shipping module.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_DIR = join(REPO_ROOT, "src", "lib", "applications");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => new Date(0) };"],
  ]),
});

/** Every module in the contract's own folder, loaded for real. */
const MODULE_FILES = readdirSync(CONTRACT_DIR)
  .filter((name) => name.endsWith(".ts"))
  .sort();
const modules = {};
for (const file of MODULE_FILES) {
  modules[file] = await loadTs(join("lib", "applications", file));
}
const { keys, normalise, sections, validate, scoring, decisions, access, roles } = {
  keys: modules["keys.ts"],
  normalise: modules["normalise.ts"],
  sections: modules["sections.ts"],
  validate: modules["validate.ts"],
  scoring: modules["scoring.ts"],
  decisions: modules["decisions.ts"],
  access: modules["access.ts"],
  roles: modules["roles.ts"],
};

/**
 * Every name a plain object answers to without owning it, read off the
 * running `Object.prototype` so the list cannot fall behind the runtime.
 */
const FURNITURE = Object.getOwnPropertyNames(Object.prototype);

/** An object holding `value` under `key` AS ITS OWN, whatever the key is. */
function holding(key, value) {
  // Not an object literal: `{ __proto__: x }` sets a prototype, and a stored
  // document read off the wire holds that name as an own key.
  return Object.defineProperty({}, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// The world: one form, its sets, one sent application
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const ROUND = "autumn-2026__k3f9a2b1";

function programme(overrides = {}) {
  return {
    kind: "fellowship",
    name: "A fellowship",
    shortName: "A fellowship",
    places: 10,
    leadUid: null,
    reviewerUids: [],
    useScores: true,
    ...overrides,
  };
}

function roundData(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "open",
    programmeIds: [AGI, TAIS],
    programmes: {
      [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", leadUid: "lead", reviewerUids: ["reviewer"] }),
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety" }),
    },
    questionSetIds: ["agi", "tais"],
    asksFacilitating: false,
    reviewerUids: ["lead", "reviewer"],
    finalDeciderUid: null,
    ...overrides,
  };
}

const FORM = normalise.normaliseForm(ROUND, roundData());

const question = (id) => ({ id, text: `Question ${id}`, type: "long", required: true, scored: true });

const SETS = [
  normalise.normaliseQuestionSet("agi", {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [question("event")],
  }),
  normalise.normaliseQuestionSet("tais", {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [question("built")],
  }),
];

/** Everything the send checks, filled in, so the ranking is the only variable. */
function content(rankedProgrammeIds, answers = { agi: { event: "The reading group." }, tais: { built: "A probe." } }) {
  return {
    aboutYou: {
      preferredName: "Ada",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "staff",
      statusOther: "",
      subject: "Computer science",
      expectedGraduation: "",
      motivation: "I want to work on this.",
      interests: "",
    },
    rankedProgrammeIds,
    wantsToFacilitate: null,
    answers,
    availability: normalise.normaliseContent({}).availability,
    suMembership: "yes",
  };
}

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};
const session = (uid, role, suRecognised = false) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  suRecognised,
  permissions: PERMISSIONS,
});
const ADMIN = session("admin", "admin");
const LEAD = session("lead", "committee", true);
const REVIEWER = session("reviewer", "committee", true);

const accept = () => ({ decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "lead", decidedAt: null });
const pool = () => ({ decision: "pool", poolReason: "capacity", couldSuitProgrammeId: null, decidedByUid: "lead", decidedAt: null });
const decline = () => ({ decision: "decline", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "lead", decidedAt: null });
const decided = (programmes, pooledOutcome = null) => ({ programmes, pooledOutcome, exception: null });

const review = (scores) => ({
  id: "r",
  roundId: ROUND,
  applicantUid: "applicant",
  reviewerUid: "reviewer",
  scores,
  comments: [],
  overallComment: "",
  createdAt: null,
  updatedAt: null,
});

/** A Firestore that answers the one read `setProgrammeRoles` makes before it refuses. */
function formDb() {
  const writes = [];
  return {
    writes,
    collection: () => ({
      doc: () => ({
        async get() {
          return { exists: true, id: ROUND, data: () => roundData() };
        },
      }),
    }),
    async runTransaction() {
      writes.push("transaction");
      throw new Error("a refusal must come before any transaction is opened");
    },
  };
}

// ---------------------------------------------------------------------------
// 1. The two rules themselves
// ---------------------------------------------------------------------------

describe("what is an id", () => {
  test("no name Object.prototype carries is an id", () => {
    assert.ok(FURNITURE.length >= 10, "the runtime's Object.prototype was not read");
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      assert.ok(FURNITURE.includes(name), `${name} is not in the list this file reads`);
    }
    for (const name of FURNITURE) {
      assert.equal(keys.isId(name), false, `${name} was accepted as an id`);
    }
  });

  test("an ordinary id still is one, and the shape still holds", () => {
    for (const id of [AGI, TAIS, "p1", "a_b-c", "Constructor", "tostring", "x".repeat(80)]) {
      assert.equal(keys.isId(id), true, `${id} was refused`);
    }
    for (const notId of ["", "has.dot", "has space", "x".repeat(81), 7, null, undefined, {}]) {
      assert.equal(keys.isId(notId), false);
    }
  });

  test("the normaliser's two functions are the same rule, not a second one", () => {
    // Routes look for `isId` on the normaliser, so it is a function there too.
    // It has to be the SAME rule: two definitions of what an id is would
    // disagree the first time one of them was changed.
    const samples = [...FURNITURE, AGI, TAIS, "p1", "", "has.dot", "has space", "x".repeat(81), 7, null];
    for (const sample of samples) {
      assert.equal(normalise.isId(sample), keys.isId(sample), `the two disagree about ${String(sample)}`);
      for (const key of [`${String(sample)}.q`, `agi.${String(sample)}`, sample]) {
        assert.equal(normalise.isQuestionKey(key), keys.isQuestionKey(key));
      }
    }
    for (const delegate of [normalise.isId, normalise.isQuestionKey]) {
      assert.match(
        String(delegate),
        /return \w+\.(isId|isQuestionKey)\(v\);/,
        "the normaliser's copy no longer hands the question to src/lib/applications/keys.ts",
      );
    }
  });

  test("a question key is two ids, so neither half can be such a name", () => {
    assert.equal(keys.isQuestionKey("agi.event"), true);
    for (const name of FURNITURE) {
      assert.equal(keys.isQuestionKey(`${name}.event`), false, `${name}.event was accepted`);
      assert.equal(keys.isQuestionKey(`agi.${name}`), false, `agi.${name} was accepted`);
    }
    for (const notKey of ["agi", "agi.event.more", ".event", "agi.", 7, null]) {
      assert.equal(keys.isQuestionKey(notKey), false);
    }
  });
});

describe("reading a map by a key that did not come from it", () => {
  test("own answers from the map's own keys and from nothing else", () => {
    const map = { [AGI]: 1 };
    assert.equal(keys.own(map, AGI), 1);
    assert.equal(keys.own(map, TAIS), undefined);
    for (const name of FURNITURE) {
      assert.notEqual(map[name], undefined, `a plain read of ${name} finds something, which is the hazard`);
      assert.equal(keys.own(map, name), undefined, `own found ${name} on a map that does not hold it`);
    }
  });

  test("a missing map reads as an empty one", () => {
    assert.equal(keys.own(undefined, AGI), undefined);
    assert.equal(keys.own(null, AGI), undefined);
  });

  test("a value the map does hold is returned whatever it is", () => {
    // Falsy values are values. `own` reports what is held, not whether it is truthy.
    assert.equal(keys.own({ a: 0 }, "a"), 0);
    assert.equal(keys.own({ a: null }, "a"), null);
    assert.equal(keys.own({ a: "" }, "a"), "");
  });
});

// ---------------------------------------------------------------------------
// 2. The normalisers drop such a name wherever it is stored
// ---------------------------------------------------------------------------

describe("stored data that carries such a name", () => {
  for (const name of FURNITURE) {
    test(`a form that lists ${name} as a programme does not have one`, () => {
      const form = normalise.normaliseForm(
        ROUND,
        roundData({
          programmeIds: [name, AGI],
          programmes: Object.assign(holding(name, programme({ leadUid: "lead" })), {
            [AGI]: programme(),
          }),
          questionSetIds: [name, "agi"],
        }),
      );
      assert.deepEqual(form.programmeIds, [AGI]);
      assert.deepEqual(Object.keys(form.programmes), [AGI]);
      assert.deepEqual(form.questionSetIds, ["agi"]);
      assert.equal(Object.getPrototypeOf(form.programmes), Object.prototype, "the map's prototype was replaced");
    });

    test(`${name} is not the id of a question set, a question or a scope`, () => {
      assert.equal(normalise.normaliseQuestionSet(name, { scope: { type: "facilitating" } }), null);
      assert.equal(
        normalise.normaliseQuestionSet("agi", { scope: { type: "programme", programmeId: name } }),
        null,
        "a set scoped to a programme that cannot exist is not a set",
      );
      assert.equal(normalise.normaliseQuestion({ id: name, text: "?" }), null);
    });

    test(`an application that names ${name} reads as one that does not`, () => {
      const application = normalise.normaliseApplication(`${ROUND}__u`, {
        roundId: ROUND,
        uid: "u",
        formVersion: 2,
        status: "submitted",
        draft: { rankedProgrammeIds: [name, AGI] },
        sent: {
          rankedProgrammeIds: [name, AGI],
          answers: Object.assign(holding(name, { event: "x" }), {
            agi: Object.assign(holding(name, "x"), { event: "The reading group." }),
          }),
        },
        result: { kind: "accepted", programmeId: name },
        invitation: { programmeId: name, replyBy: "2026-10-22" },
      });
      assert.deepEqual(application.draft.rankedProgrammeIds, [AGI]);
      assert.deepEqual(application.sent.rankedProgrammeIds, [AGI]);
      assert.deepEqual(Object.keys(application.sent.answers), ["agi"]);
      assert.deepEqual(Object.keys(application.sent.answers.agi), ["event"]);
      assert.equal(application.result.programmeId, null);
      assert.equal(application.invitation, null);
    });

    test(`a review and a decision that name ${name} read as ones that do not`, () => {
      const row = normalise.normaliseReview("r", {
        scores: { [`${name}.event`]: 5, [`agi.${name}`]: 5, "agi.event": 4 },
        comments: [
          { id: "c1", questionKey: `${name}.event`, text: "x" },
          { id: name, questionKey: "agi.event", text: "x" },
          { id: "c3", questionKey: "agi.event", text: "kept" },
        ],
      });
      assert.deepEqual(row.scores, { "agi.event": 4 });
      assert.deepEqual(row.comments.map((c) => c.id), ["c3"]);

      const decision = normalise.normaliseDecision(`${ROUND}__u`, {
        programmes: Object.assign(holding(name, accept()), { [AGI]: pool() }),
        pooledOutcome: { kind: "invite", programmeId: name, setByUid: "admin" },
        exception: { programmeIds: [name], reason: "x", setByUid: "admin" },
      });
      assert.deepEqual(Object.keys(decision.programmes), [AGI]);
      assert.equal(decision.pooledOutcome, null);
      assert.equal(decision.exception, null);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Every exported function of the contract, enumerated
// ---------------------------------------------------------------------------

/**
 * Each exported FUNCTION of each contract module, and what it does with an id.
 *
 *  - A function: it reads a map by an id, and this is that read made with one
 *    name `Object.prototype` carries. It asserts the name reads as not there.
 *  - A string: it reads no map by an id, and this is why.
 *
 * A NEW EXPORT HAS TO BE ADDED HERE, which is the point: whoever writes a
 * function that takes a programme id, a set id or a question id is asked, by
 * a failing test, how it reads the map.
 */
const CONTRACT = {
  "access.ts": {
    roleOnProgramme: (name) => {
      for (const user of [ADMIN, LEAD, REVIEWER]) {
        assert.equal(access.roleOnProgramme(user, FORM, name), null, `${user.uid} got a role on ${name}`);
      }
    },
    programmeRolesFor:
      "walks the form's own programmeIds, which the normaliser has already held to ids; " +
      "takes no id from its caller",
    canSeeForm: "asks programmeRolesFor, and takes no id from its caller",
    canReadApplication: (name) => {
      assert.equal(access.canReadApplication(LEAD, FORM, [name]), false);
      assert.equal(access.canReadApplication(REVIEWER, FORM, [name]), false);
      // An admin reads every application whatever it ranks. That is the rule, not a leak.
      assert.equal(access.canReadApplication(ADMIN, FORM, [name]), true);
    },
    canReviewFor: (name) => {
      for (const user of [ADMIN, LEAD, REVIEWER]) assert.equal(access.canReviewFor(user, FORM, name), false);
    },
    canDecideFor: (name) => {
      for (const user of [ADMIN, LEAD]) assert.equal(access.canDecideFor(user, FORM, name), false);
    },
    canEditProgramme: (name) => {
      for (const user of [ADMIN, LEAD]) assert.equal(access.canEditProgramme(user, FORM, name), false);
    },
    canRunTerm: "decided by the caller's role alone",
  },
  "decisions.ts": {
    standingWith: (name) => {
      assert.equal(decisions.standingWith(null, name), "to-review");
      assert.equal(decisions.standingWith(decided({}), name), "to-review");
      // Even a decision that somehow HOLDS an entry under the name gives it no
      // standing: it is not an id, so it is not a programme.
      assert.equal(decisions.standingWith(decided(holding(name, accept())), name), "to-review");
    },
    placementFor: (name) => {
      assert.equal(decisions.placementFor([name], decided({})), null);
      assert.equal(decisions.placementFor([name], decided(holding(name, accept()))), null);
      assert.equal(decisions.placementFor([name, AGI], decided({ [AGI]: accept() })), AGI);
    },
    placesHeld: (name) => {
      const withException = {
        ...decided({ [AGI]: accept() }),
        exception: { programmeIds: [name], reason: "x", setByUid: "admin", setAt: null },
      };
      assert.deepEqual(decisions.placesHeld([AGI], withException), [AGI]);
      assert.deepEqual(decisions.placesHeld([name], decided({})), []);
    },
    holdingOf: (name) => {
      const all = new Set(FORM.programmeIds);
      const nothing = { places: [], byInvitation: null, heldFor: null };
      // "Accepted" under such a name is not a place.
      assert.deepEqual(
        decisions.holdingOf({ uid: "u", ranked: [name], decision: decided(holding(name, accept())) }, all),
        nothing,
      );
      // A pick that invites to it keeps nothing before the person is told...
      const invitedTo = decided({ [AGI]: pool() }, { kind: "invite", programmeId: name, setByUid: "admin", setAt: null });
      assert.deepEqual(decisions.holdingOf({ uid: "u", ranked: [AGI], decision: invitedTo }, all), nothing);
      // ...and nothing after, answered or not.
      for (const response of [null, "accepted"]) {
        const application = {
          sent: {},
          status: response ? "accepted" : "invited",
          result: { kind: "invited", programmeId: name },
          invitation: { programmeId: name, replyBy: "2026-10-25", response },
          attendance: null,
        };
        assert.deepEqual(
          decisions.holdingOf({ uid: "u", ranked: [AGI], decision: invitedTo, application }, all),
          nothing,
        );
      }
    },
    joinedByInvitation: "reads the invitation on the application it is handed, and takes no id from its caller",
    owesDecision: (name) => {
      assert.equal(decisions.owesDecision([name], null, name), false, `${name} is owed a decision nobody can make`);
      assert.equal(decisions.owesDecision([name, AGI], null, name), false);
      assert.equal(decisions.owesDecision([name, AGI], null, AGI), true, "the real choice behind it is still owed one");
    },
    outcomeFor: (name) => {
      const all = new Set(FORM.programmeIds);
      // Ranked before a real choice that accepted them: the real choice decides.
      assert.deepEqual(decisions.outcomeFor([name, AGI], decided({ [AGI]: accept() }), all), {
        kind: "accepted",
        programmeId: AGI,
      });
      // And exactly as if the name had never been in the ranking, in every
      // state, wherever in the ranking it sits. Declined is the state that
      // tells: it means EVERY programme they ranked declined them, and a name
      // that is not a programme must not be the one that did not.
      const states = [
        null,
        decided({ [AGI]: pool() }),
        decided({ [AGI]: accept() }),
        decided({ [AGI]: decline() }),
      ];
      for (const decision of states) {
        const expected = decisions.outcomeFor([AGI], decision, all);
        assert.deepEqual(decisions.outcomeFor([name, AGI], decision, all), expected);
        assert.deepEqual(decisions.outcomeFor([AGI, name], decision, all), expected);
      }
      assert.deepEqual(decisions.outcomeFor([AGI, name], decided({ [AGI]: decline() }), all), {
        kind: "declined",
      });
      // An invitation cannot name it either.
      const invitedTo = decided({ [AGI]: pool() }, { kind: "invite", programmeId: name, setByUid: "admin", setAt: null });
      assert.deepEqual(decisions.outcomeFor([AGI], invitedTo, all), { kind: "needs-outcome" });
    },
    isPooled: "reads an outcome's kind, and takes no id",
    isInTerm: "reads whether an application was sent and its status, and takes no id",
    hasBeenTold: "reads whether an application carries a result, and takes no id",
    decisionDayHasBegun: "reads the form's stamp and four of its own counters by fixed names, and takes no id",
    tallyTerm: (name) => {
      const clean = decisions.tallyTerm(FORM, [{ uid: "u", ranked: [AGI], decision: decided({ [AGI]: accept() }) }]);
      const dirty = decisions.tallyTerm(FORM, [
        { uid: "u", ranked: [name, AGI], decision: decided({ [AGI]: accept() }) },
      ]);
      assert.deepEqual(dirty, clean, `ranking ${name} changed the term's counts`);
      assert.deepEqual(Object.keys(dirty.programmes), FORM.programmeIds);
    },
    freePlaces: (name) => {
      const tally = decisions.tallyTerm(FORM, []);
      assert.equal(decisions.freePlaces(FORM, tally, name), null);
    },
    readinessFor: "walks the tally's own programmes, and takes no id from its caller",
    recommendationsFor:
      "takes applicants already reduced to scores, and walks each one's own `elsewhere` entries",
  },
  "keys.ts": {
    isId: (name) => assert.equal(keys.isId(name), false),
    isQuestionKey: (name) => assert.equal(keys.isQuestionKey(`${name}.q`), false),
    own: (name) => assert.equal(keys.own({}, name), undefined),
  },
  "model.ts": {
    questionKey: "builds a string from two ids and reads nothing",
    applicationId: "builds a document id from a round id and a uid and reads nothing",
  },
  "normalise.ts": {
    isId: (name) => assert.equal(normalise.isId(name), false),
    isQuestionKey: (name) => assert.equal(normalise.isQuestionKey(`${name}.q`), false),
    normaliseProgramme:
      "reads one stored programme entry it is handed; the id is only copied onto the result, " +
      "and normaliseFormFields is what decides which ids reach it",
    isApplicationForm: "reads one fixed field of a round document",
    normaliseFormFields: (name) => {
      const fields = normalise.normaliseFormFields(roundData({ programmeIds: [name, AGI] }));
      assert.deepEqual(fields.programmeIds, [AGI]);
      assert.equal(keys.own(fields.programmes, name), undefined);
    },
    normaliseForm: (name) => {
      const form = normalise.normaliseForm(ROUND, roundData({ programmeIds: [name, AGI] }));
      assert.deepEqual(form.programmeIds, [AGI]);
    },
    normaliseQuestion: (name) => assert.equal(normalise.normaliseQuestion({ id: name }), null),
    normaliseQuestionSet: (name) =>
      assert.equal(normalise.normaliseQuestionSet(name, { scope: { type: "facilitating" } }), null),
    normaliseContent: (name) =>
      assert.deepEqual(normalise.normaliseContent({ rankedProgrammeIds: [name, AGI] }).rankedProgrammeIds, [AGI]),
    normaliseApplication: (name) => {
      const application = normalise.normaliseApplication("a", {
        formVersion: 2,
        draft: { rankedProgrammeIds: [name] },
      });
      assert.deepEqual(application.draft.rankedProgrammeIds, []);
    },
    normaliseReview: (name) =>
      assert.deepEqual(normalise.normaliseReview("r", { scores: { [`${name}.q`]: 3 } }).scores, {}),
    normaliseDecision: (name) =>
      assert.deepEqual(
        normalise.normaliseDecision("d", { programmes: holding(name, accept()) }).programmes,
        {},
      ),
    emptyDecision: "builds an empty decision document and reads nothing",
  },
  "repo.ts": {
    formRef: "addresses a document by id; reads no map",
    questionSetRef: "addresses a document by id; reads no map",
    applicationRef: "addresses a document by id; reads no map",
    loadForm: "addresses a document by id and normalises it; reads no map by an id",
    loadQuestionSets: "lists a subcollection and normalises each document; reads no map by an id",
    loadOwnApplication: "addresses a document by id and normalises it; reads no map by an id",
  },
  "roles.ts": {
    everyoneNamedOn:
      "walks the form's own programmeIds, which the normaliser has already held to ids; " +
      "takes no id from its caller",
    setProgrammeRoles: async (name) => {
      // The programme id here goes on to be written into a field path, so the
      // refusal has to come before any write is opened.
      const db = formDb();
      const result = await roles.setProgrammeRoles(db, ADMIN, ROUND, name, { leadUid: "lead" });
      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
      assert.deepEqual(db.writes, [], `a write was opened for the programme ${name}`);
    },
  },
  "scoring.ts": {
    scoredKeysFor: (name) => assert.deepEqual(scoring.scoredKeysFor(FORM, SETS, name), []),
    scorableKeysFor: (name) =>
      assert.deepEqual(scoring.scorableKeysFor(FORM, SETS, name, content([AGI])), []),
    reviewerScore: (name) => {
      assert.equal(scoring.reviewerScore(review({}), [name]), null);
      assert.equal(scoring.reviewerScore(review({ "agi.event": 4 }), [name, "agi.event"]), 4);
    },
    hasScored: (name) => assert.equal(scoring.hasScored(review({}), [name]), false),
    otherReviewsShownTo: (name) =>
      // Somebody who is not an admin and has scored nothing. Read as scored
      // under a name every object carries, they would be shown what the other
      // reviewer gave before giving their own.
      assert.equal(
        scoring.otherReviewsShownTo(false, review({}), [name], { revealOtherReviews: false }),
        false,
        `a reviewer who had scored nothing was read as having scored ${name}`,
      ),
    sectionScore: (name) =>
      assert.deepEqual(scoring.sectionScore([review({})], [name]), { score: null, reviewers: [] }),
    reviewsVisibleTo: (name) => {
      // The viewer has a review and has scored nothing. Read as scored, they
      // would be shown what the other reviewer gave before giving their own.
      const mine = review({});
      const theirs = { ...review({ "agi.event": 5 }), reviewerUid: "somebody-else" };
      assert.deepEqual(
        scoring.reviewsVisibleTo("reviewer", [mine, theirs], [name], { revealOtherReviews: false }),
        [mine],
        `a reviewer who had scored nothing was read as having scored ${name}`,
      );
    },
    hiddenReviewCount: (name) => {
      const mine = review({});
      const theirs = { ...review({ "agi.event": 5 }), reviewerUid: "somebody-else" };
      assert.equal(
        scoring.hiddenReviewCount("reviewer", [mine, theirs], [name], { revealOtherReviews: false }),
        1,
      );
    },
    formatScore: "formats a number and takes no id",
    cleanScores: (name) =>
      assert.deepEqual(
        scoring.cleanScores(holding(name, 5), ["agi.event"], { min: 1, max: 5 }),
        {},
        "a score under a key that is not on the allowed list was kept",
      ),
  },
  "sections.ts": {
    openProgrammes: "walks the form's own programmeIds, which the normaliser has already held to ids",
    rankedProgrammes: (name) => {
      assert.deepEqual(sections.rankedProgrammes(FORM, content([name])), []);
      assert.deepEqual(
        sections.rankedProgrammes(FORM, content([name, AGI])).map((p) => p.id),
        [AGI],
      );
    },
    choiceNumber: (name) => {
      assert.equal(sections.choiceNumber(FORM, content([name, AGI]), name), null);
      assert.equal(sections.choiceNumber(FORM, content([name, AGI]), AGI), 1, "the real choice is their 1st");
    },
    setApplies: (name) => {
      for (const set of SETS) assert.equal(sections.setApplies(set, FORM, content([name])), false);
    },
    orderedSets: "looks sets up in a Map it builds from the sets it is handed",
    applicableSets: (name) => assert.deepEqual(sections.applicableSets(FORM, SETS, content([name])), []),
    streamSetsFor: (name) => assert.deepEqual(sections.streamSetsFor(FORM, SETS, name), []),
    stepsFor: (name) => {
      const steps = sections.stepsFor(FORM, SETS, content([name, AGI])).map((step) => step.id);
      assert.ok(!steps.includes("rank"), "ranking one real programme and one that is not there is not a ranking");
      assert.deepEqual(steps.filter((id) => id.startsWith("set:")), ["set:agi"]);
    },
  },
  "staffRepo.ts": {
    decisionRef: "addresses a document by id; reads no map",
    reviewRef: "addresses a document by id; reads no map",
    loadApplication: "addresses a document by id and normalises it; reads no map by an id",
    listSentApplications: "queries a collection and normalises each document; reads no map by an id",
    listDecisions: "queries a collection and keys the answer in a Map",
    loadDecision: "addresses a document by id and normalises it; reads no map by an id",
    listReviews: "queries a collection and normalises each document; reads no map by an id",
    listReviewsOf: "queries a collection and normalises each document; reads no map by an id",
  },
  "validate.ts": {
    countWords: "counts words in a string and takes no id",
    optionsFor: (name) => {
      const fromRanking = { id: "q", text: "?", help: "", type: "choice", options: [], optionsFromRanking: true, wordLimit: null, required: true, scored: false };
      assert.deepEqual(validate.optionsFor(fromRanking, FORM, content([name, AGI])), ["AGI Strategy"]);
    },
    isAnswered: "reads one answer it is handed and takes no id",
    answerProblem: "checks one answer against one question it is handed and takes no id",
    issuesFor: (name) => {
      const issues = validate.issuesFor(FORM, SETS, content([name]));
      assert.deepEqual(
        issues.map((issue) => issue.message),
        ["Tick at least one programme."],
        `an application that ranks only ${name} can be sent, or is refused in words nobody could act on`,
      );
    },
    contentForSend: (name) => {
      const sent = validate.contentForSend(FORM, SETS, content([name, AGI]));
      assert.deepEqual(sent.rankedProgrammeIds, [AGI]);
      assert.deepEqual(Object.keys(sent.answers), ["agi"]);
    },
    answeredCount: (name) => {
      const set = { ...SETS[0], id: name };
      assert.equal(validate.answeredCount(set, content([AGI])), 0);
      const question = { ...SETS[0].questions[0], id: name };
      assert.equal(validate.answeredCount({ ...SETS[0], questions: [question] }, content([AGI])), 0);
    },
  },
  "words.ts": {
    ordinal: "formats a number and takes no id",
    choiceLabel: "formats a number and takes no id",
  },
};

describe("every exported function of the contract says how it reads a map", () => {
  test("the table names every module and every exported function, and nothing else", () => {
    assert.deepEqual(
      Object.keys(CONTRACT).sort(),
      MODULE_FILES,
      "the modules in src/lib/applications are not the ones CONTRACT lists. A new module's " +
        "exported functions are added with either the read made with a name every object " +
        "carries, or the reason it reads no map by an id.",
    );
    for (const file of MODULE_FILES) {
      const exported = Object.entries(modules[file])
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort();
      assert.deepEqual(
        Object.keys(CONTRACT[file]).sort(),
        exported,
        `${file}: the exported functions are not the ones CONTRACT lists. A function that takes ` +
          "a programme id, a question set id or a question id reads its map through `own` " +
          "(src/lib/applications/keys.ts) and is added here with that read made as a test; one " +
          "that takes none is added with the reason.",
      );
    }
  });

  test("a reason is a sentence, not a placeholder", () => {
    for (const [file, entries] of Object.entries(CONTRACT)) {
      for (const [name, entry] of Object.entries(entries)) {
        if (typeof entry === "function") continue;
        assert.ok(typeof entry === "string" && entry.length > 25, `${file} ${name} needs a written reason`);
      }
    }
  });

  for (const [file, entries] of Object.entries(CONTRACT)) {
    for (const [name, entry] of Object.entries(entries)) {
      if (typeof entry !== "function") continue;
      test(`${file} ${name}: a name every object carries reads as not there`, async () => {
        for (const furniture of FURNITURE) await entry(furniture);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 4. What the rule is for
// ---------------------------------------------------------------------------

describe("an applicant who ranks such a name", () => {
  test("cannot send it, and is told so in words they can act on", () => {
    for (const name of FURNITURE) {
      const issues = validate.issuesFor(FORM, SETS, content([name]));
      assert.ok(issues.length > 0, `an application ranking only ${name} could be sent`);
      assert.deepEqual(issues.map((issue) => issue.step), ["choose"]);
      for (const issue of issues) {
        assert.ok(!/undefined|\[object|function/i.test(issue.message), `the refusal reads "${issue.message}"`);
      }
    }
  });

  test("can send their real choice, and the name is not in what is sent", () => {
    for (const name of FURNITURE) {
      const draft = content([name, AGI]);
      assert.deepEqual(validate.issuesFor(FORM, SETS, draft), []);
      const sent = validate.contentForSend(FORM, SETS, draft);
      assert.deepEqual(sent.rankedProgrammeIds, [AGI], `${name} reached the application of record`);
    }
  });
});

describe("a stored application that somehow ranks such a name", () => {
  /** A term where every real application is decided and every pooled one has an outcome. */
  const decidedTerm = () => [
    { uid: "a", ranked: [AGI, TAIS], decision: decided({ [AGI]: accept() }) },
    { uid: "b", ranked: [TAIS], decision: decided({ [TAIS]: accept() }) },
    {
      uid: "c",
      ranked: [AGI],
      decision: decided({ [AGI]: pool() }, { kind: "no-offer", setByUid: "admin", setAt: null }),
    },
  ];

  test("gives nobody a role, an admin included", () => {
    for (const name of FURNITURE) {
      for (const user of [ADMIN, LEAD, REVIEWER]) {
        assert.equal(access.roleOnProgramme(user, FORM, name), null);
        assert.equal(access.canReviewFor(user, FORM, name), false);
        assert.equal(access.canDecideFor(user, FORM, name), false);
      }
    }
  });

  test("cannot be what decision day is waiting on", () => {
    const all = new Set(FORM.programmeIds);
    assert.equal(decisions.readinessFor(decisions.tallyTerm(FORM, decidedTerm())).ready, true);

    for (const name of FURNITURE) {
      // Ranked FIRST, ahead of a real choice that accepted them. Read as a
      // programme, it would be a 1st choice nobody can ever decide.
      const term = decidedTerm();
      term[0] = { ...term[0], ranked: [name, AGI, TAIS] };

      assert.deepEqual(decisions.outcomeFor(term[0].ranked, term[0].decision, all), {
        kind: "accepted",
        programmeId: AGI,
      });
      const tally = decisions.tallyTerm(FORM, term);
      assert.deepEqual(tally, decisions.tallyTerm(FORM, decidedTerm()), `${name} moved a count`);
      assert.equal(tally.programmes[AGI].firstChoice, 2, "their real 1st choice is still counted as one");
      assert.deepEqual(decisions.readinessFor(tally), {
        ready: true,
        toReview: { [AGI]: 0, [TAIS]: 0 },
        needsOutcome: 0,
      });
    }
  });

  test("and nothing else leaves somebody who ranked no programme at all waiting for ever", () => {
    // Read through the normaliser, an application that ranked ONLY such a name
    // ranks nothing. No programme can ever decide it, so it must not read as
    // owed a decision: that would hold the send with nothing on screen to
    // clear. It is pooled, which is true (no programme they ranked took them)
    // and leaves the committee the ordinary thing to do about it.
    const all = new Set(FORM.programmeIds);
    for (const ranked of [[], ...FURNITURE.map((name) => [name])]) {
      assert.deepEqual(decisions.outcomeFor(ranked, null, all), { kind: "needs-outcome" });

      const waiting = decisions.tallyTerm(FORM, [...decidedTerm(), { uid: "d", ranked, decision: null }]);
      assert.equal(waiting.outcomes.undecided, 0, "nobody is owed a decision no programme can make");
      assert.equal(waiting.outcomes.needsOutcome, 1);
      assert.deepEqual(decisions.readinessFor(waiting), {
        ready: false,
        toReview: { [AGI]: 0, [TAIS]: 0 },
        needsOutcome: 1,
      });

      // The committee picks what they hear, and the send is free to go.
      const picked = decided({}, { kind: "no-offer", setByUid: "admin", setAt: null });
      const cleared = decisions.tallyTerm(FORM, [...decidedTerm(), { uid: "d", ranked, decision: picked }]);
      assert.equal(cleared.outcomes.noOffer, 2);
      assert.equal(decisions.readinessFor(cleared).ready, true);
    }
  });

  test("declined still takes a programme to have declined them", () => {
    // `every` is true of an empty list. Somebody who ranked nothing was not
    // declined by everything they ranked, and must not be told so.
    const all = new Set(FORM.programmeIds);
    assert.notDeepEqual(decisions.outcomeFor([], decided({}), all), { kind: "declined" });
    assert.deepEqual(decisions.outcomeFor([AGI], decided({ [AGI]: decline() }), all), {
      kind: "declined",
    });
  });

  test("is never written to", () => {
    // The plainest form of the hazard: a counter kept in a map, read by an
    // applicant's ranking. `tally["constructor"]` is a function every object
    // shares, and adding one to a field on it is a write to that function.
    const snapshot = () => ({
      object: Object.getOwnPropertyNames(Object).sort(),
      objectPrototype: Object.getOwnPropertyNames(Object.prototype).sort(),
      functionPrototype: Object.getOwnPropertyNames(Function.prototype).sort(),
    });
    const before = snapshot();
    const applicants = FURNITURE.map((name, i) => ({
      uid: `u${i}`,
      ranked: [name],
      decision: decided(holding(name, accept())),
    }));
    decisions.tallyTerm(FORM, applicants);
    assert.deepEqual(snapshot(), before, "tallying a ranking wrote to something every object shares");
  });
});
