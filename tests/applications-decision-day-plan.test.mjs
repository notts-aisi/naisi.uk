/**
 * The term as pooled applicants and decision day read it, and the sentences
 * the two screens build from its numbers.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * Who is pooled, what each person will hear, every count and whether the send
 * may go are worked out in `src/lib/applications/decisions.ts`. The two
 * screens add only three things on top, and all three are executed here:
 *
 *  1. THE LINE-UP (`planTerm`): the sent applications and the decision
 *     documents become one list of people, each with what they would be told.
 *     A withdrawn application is not in it.
 *  2. WHAT MAY BE PICKED FOR A POOLED PERSON (`poolProblem`, `inviteProblem`):
 *     only somebody pooled gets an outcome, an invitation needs a free place
 *     and is never to something they ranked, and an id that is not one of the
 *     form's own programmes is not a programme.
 *  3. WHY THE SEND CANNOT GO (`sendBlockers`): one sentence per reason.
 *  4. WHAT BECAME OF AN EMAIL (`emailState.ts`): which of the states a result
 *     can record is taken up by a later press (only `owed`), when a claim a
 *     press left behind stops reading as a press at work, and which failures
 *     of the mail door are known to have handed nothing over. Anything not
 *     positively known is left alone, because the alternative is somebody
 *     getting their decision twice.
 *
 * The last block runs the whole thing against the term the design was drawn
 * for (122 applicants: 66 accepted, 2 invited, 53 no offer, 1 declined) and
 * holds every sentence on the two screens to the design's own numbers.
 *
 * Nothing is stubbed: every module here is pure.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const at = (file) => join("lib", "applications", file);

const plan = await loadTs(at(join("decisionDay", "plan.ts")));
const say = await loadTs(at(join("decisionDay", "boardWords.ts")));
const programmes = await loadTs(at(join("decisionDay", "programmes.ts")));
const emailState = await loadTs(at(join("decisionDay", "emailState.ts")));
const decisions = await loadTs(at("decisions.ts"));
const normalise = await loadTs(at("normalise.ts"));

// ---------------------------------------------------------------------------
// Building a term the way the real code reads one
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";

const WHEN = new Date("2026-10-19T09:00:00Z");
/** Fri 23 Oct 2026, midday in London: decision day. */
const DECISION_DAY = new Date("2026-10-23T11:00:00Z");

function makeForm(places = { [AGI]: 32, [TAIS]: 24, [INC]: 12 }, over = {}) {
  const programme = (name, shortName, id, extra = {}) => ({
    kind: "fellowship",
    name,
    shortName,
    starts: "w/c 26 Oct",
    places: places[id],
    leadUid: "zach",
    reviewerUids: [],
    useScores: true,
    ...extra,
    ...(over.programmes?.[id] ?? {}),
  });
  return normalise.normaliseForm(ROUND, {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    programmeIds: [AGI, TAIS, INC],
    programmes: {
      [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", AGI),
      [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", TAIS),
      [INC]: programme("Research incubator", "Research incubator", INC, { kind: "incubator" }),
    },
    questionSetIds: [],
    invitationReplyBy: "2026-10-25",
    ...(over.form ?? {}),
  });
}

function application(uid, name, ranked, over = {}) {
  const content = {
    aboutYou: { preferredName: name.split(" ")[0], subject: "BSc Physics", status: "undergraduate", expectedGraduation: "2027-07" },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: false,
    answers: {},
    suMembership: "yes",
  };
  return normalise.normaliseApplication(`${ROUND}__${uid}`, {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    status: "submitted",
    draft: content,
    sent: content,
    ...over,
  });
}

function decision(uid, perProgramme, pooledOutcome = null) {
  const entries = {};
  for (const [programmeId, kind] of Object.entries(perProgramme)) {
    const [verdict, poolReason = null, couldSuitProgrammeId = null] = [].concat(kind);
    entries[programmeId] = { decision: verdict, poolReason, couldSuitProgrammeId, decidedByUid: "zach", decidedAt: WHEN };
  }
  return normalise.normaliseDecision(`${ROUND}__${uid}`, {
    roundId: ROUND,
    uid,
    programmes: entries,
    pooledOutcome: pooledOutcome ? { ...pooledOutcome, setByUid: "zach", setAt: WHEN } : null,
  });
}

/** `[uid, name, ranked, decisions, pooledOutcome?, applicationOverrides?]` rows into a term. */
function termOf(form, rows) {
  const applications = [];
  const byUid = new Map();
  for (const [uid, name, ranked, verdicts, outcome, over] of rows) {
    applications.push(application(uid, name, ranked, over));
    if (verdicts) byUid.set(uid, decision(uid, verdicts, outcome));
  }
  return plan.planTerm(form, applications, byUid);
}

const person = (term, uid) => term.people.find((candidate) => candidate.uid === uid);

// ---------------------------------------------------------------------------
// 1. The line-up
// ---------------------------------------------------------------------------

describe("the term is lined up from sent applications and their decisions", () => {
  const form = makeForm();
  const term = termOf(form, [
    ["oliver", "Oliver Grant", [INC], { [INC]: ["pool", "better-fit", TAIS] }, { kind: "invite", programmeId: TAIS }],
    ["amara", "Amara Okafor", [AGI, TAIS], { [AGI]: "accept" }],
    ["nina", "Nina Petrova", [AGI], { [AGI]: ["pool", "capacity"] }, { kind: "no-offer" }],
    ["rosa", "Rosa García", [INC, AGI], { [INC]: "pool", [AGI]: "pool" }],
    ["zara", "Zara Ahmed", [AGI], { [AGI]: "decline" }],
    ["dev", "Dev Patel", [AGI, INC], { [INC]: "accept" }],
    ["ben", "Ben Hartley", [AGI], null, null, { status: "withdrawn", withdrawnAt: WHEN }],
    ["kofi", "Kofi Asante", [AGI], null, null, { sent: null, status: "draft" }],
  ]);

  test("people are listed by name, each with what they would be told", () => {
    assert.deepEqual(
      term.people.map((p) => [p.name, p.outcome.kind]),
      [
        ["Amara Okafor", "accepted"],
        ["Dev Patel", "undecided"],
        ["Nina Petrova", "no-offer"],
        ["Oliver Grant", "invited"],
        ["Rosa García", "needs-outcome"],
        ["Zara Ahmed", "declined"],
      ],
    );
  });

  test("a withdrawn application and a draft that was never sent are not in the term", () => {
    assert.equal(person(term, "ben"), undefined);
    assert.equal(person(term, "kofi"), undefined);
    assert.equal(plan.isInTerm({ sent: {}, status: "withdrawn" }), false);
    assert.equal(plan.isInTerm({ sent: null, status: "submitted" }), false);
    assert.equal(plan.isInTerm({ sent: {}, status: "submitted" }), true);
    assert.equal(plan.isInTerm({ sent: {}, status: "accepted" }), true);
  });

  test("the counts are the decisions module's own, over the same people", () => {
    assert.equal(term.tally.applicants, 6);
    assert.deepEqual(term.tally.outcomes, {
      accepted: 1,
      invited: 1,
      noOffer: 1,
      declined: 1,
      needsOutcome: 1,
      undecided: 1,
    });
    assert.equal(term.readiness.ready, false);
    assert.deepEqual(term.readiness, decisions.readinessFor(term.tally));
  });

  test("somebody is called what they asked to be called, with a fallback", () => {
    assert.equal(person(term, "oliver").firstName, "Oliver");
    const noPreferred = application("x", "Sam Whitfield", [AGI]);
    noPreferred.sent.aboutYou.preferredName = "";
    const anonymous = application("y", "", [AGI]);
    anonymous.sent.aboutYou.preferredName = "";
    const lined = plan.planTerm(form, [noPreferred, anonymous], new Map());
    assert.deepEqual(
      lined.people.map((p) => [p.name, p.firstName]),
      [
        ["Sam Whitfield", "Sam"],
        ["Unnamed applicant", ""],
      ],
    );
  });

  test("what somebody would be told is their outcome, until they have been told", () => {
    assert.deepEqual(plan.toldTo(person(term, "amara")), { kind: "accepted", programmeId: AGI });
    assert.deepEqual(plan.toldTo(person(term, "oliver")), { kind: "invited", programmeId: TAIS });
    assert.deepEqual(plan.toldTo(person(term, "nina")), { kind: "no-offer", programmeId: null });
    assert.deepEqual(plan.toldTo(person(term, "zara")), { kind: "declined", programmeId: null });
    assert.equal(plan.toldTo(person(term, "rosa")), null, "pooled with nothing picked");
    assert.equal(plan.toldTo(person(term, "dev")), null, "a higher choice still owes a decision");

    // Once published, the result is what they heard, whatever a decision says later.
    const told = { ...person(term, "nina"), result: { kind: "invited", programmeId: INC, publishedAt: WHEN } };
    assert.deepEqual(plan.toldTo(told), { kind: "invited", programmeId: INC });
  });

  test("a declined application is emailed only when an admin says so", () => {
    const declined = { kind: "declined", programmeId: null };
    assert.equal(plan.emailOutcomeFor(declined, false), null);
    assert.deepEqual(plan.emailOutcomeFor(declined, true), { kind: "declined" });
    assert.deepEqual(plan.emailOutcomeFor({ kind: "accepted", programmeId: AGI }, false), {
      kind: "accepted",
      programmeId: AGI,
    });
    assert.deepEqual(plan.emailOutcomeFor({ kind: "no-offer", programmeId: null }, false), { kind: "no-offer" });
    assert.equal(plan.emailCount(term.people, false), 3, "accepted, invited and no offer");
    assert.equal(plan.emailCount(term.people, true), 4, "and the declined one when switched on");
  });

  test("two outcomes are the same only when the kind and the programme both match", () => {
    const a = { kind: "invited", programmeId: TAIS };
    assert.equal(plan.samePublication(a, { kind: "invited", programmeId: TAIS }), true);
    assert.equal(plan.samePublication(a, { kind: "invited", programmeId: INC }), false);
    assert.equal(plan.samePublication(a, { kind: "accepted", programmeId: TAIS }), false);
    assert.equal(plan.samePublication(a, null), false);
    assert.equal(plan.samePublication(null, null), true);
  });
});

// ---------------------------------------------------------------------------
// 2. What may be picked for a pooled person
// ---------------------------------------------------------------------------

describe("only a pooled applicant gets an outcome", () => {
  const form = makeForm();
  const term = termOf(form, [
    ["amara", "Amara Okafor", [AGI], { [AGI]: "accept" }],
    ["zara", "Zara Ahmed", [AGI], { [AGI]: "decline" }],
    ["dev", "Dev Patel", [AGI, INC], { [INC]: "pool" }],
    ["rosa", "Rosa García", [INC], { [INC]: "pool" }],
  ]);

  test("somebody pooled may be given one", () => {
    assert.equal(plan.poolProblem(form, person(term, "rosa")), null);
  });

  test("everybody else is refused in a sentence that says why", () => {
    assert.match(plan.poolProblem(form, person(term, "amara")), /has a place on AGI Strategy, so they are not pooled/);
    assert.match(plan.poolProblem(form, person(term, "zara")), /declined them, so they are not pooled/);
    assert.match(plan.poolProblem(form, person(term, "dev")), /still owes Dev Patel a decision/);
  });

  test("and nobody who has already been told", () => {
    const told = { ...person(term, "rosa"), result: { kind: "no-offer", programmeId: null, publishedAt: WHEN } };
    assert.match(plan.poolProblem(form, told), /has already been told their outcome/);
  });
});

describe("an invitation needs a free place, and is to something they did not pick", () => {
  // Technical AI Safety has 2 places: one taken by an acceptance, one by an invitation.
  const form = makeForm({ [AGI]: 1, [TAIS]: 2, [INC]: null });
  const term = termOf(form, [
    ["sam", "Sam Whitfield", [TAIS], { [TAIS]: "accept" }],
    ["oliver", "Oliver Grant", [AGI], { [AGI]: "pool" }, { kind: "invite", programmeId: TAIS }],
    ["nina", "Nina Petrova", [AGI], { [AGI]: "pool" }],
    ["lily", "Lily Chen", [TAIS], { [TAIS]: "pool" }],
  ]);

  test("the free places are the decisions module's, with invitations counted", () => {
    assert.equal(decisions.freePlaces(form, term.tally, TAIS), 0);
    assert.equal(decisions.freePlaces(form, term.tally, AGI), 1);
    assert.equal(decisions.freePlaces(form, term.tally, INC), null);
  });

  test("a full programme takes no more invitations", () => {
    assert.equal(
      plan.inviteProblem(form, term.tally, person(term, "nina"), TAIS),
      "Technical AI Safety has no free places left.",
    );
  });

  test("the place somebody's own invitation holds is still theirs", () => {
    assert.equal(plan.inviteProblem(form, term.tally, person(term, "oliver"), TAIS), null);
  });

  test("nobody is invited to a programme they ranked", () => {
    assert.match(
      plan.inviteProblem(form, term.tally, person(term, "nina"), AGI),
      /ranked AGI Strategy, so its lead has already decided\. An invitation is to something they didn’t pick\./,
    );
    assert.equal(plan.inviteProblem(form, term.tally, person(term, "lily"), AGI), null, "a free place she did not rank");
  });

  test("a programme with no number of places cannot be invited to", () => {
    assert.match(
      plan.inviteProblem(form, term.tally, person(term, "nina"), INC),
      /Research incubator has no number of places set/,
    );
  });

  test("a closed programme cannot be invited to", () => {
    const closed = makeForm({ [AGI]: 5, [TAIS]: 5, [INC]: 5 }, { programmes: { [INC]: { closed: true } } });
    const lined = termOf(closed, [["nina", "Nina Petrova", [AGI], { [AGI]: "pool" }]]);
    assert.match(plan.inviteProblem(closed, lined.tally, person(lined, "nina"), INC), /is closed this term/);
  });

  test("the options offered are exactly the programmes with no problem", () => {
    assert.deepEqual(plan.invitableFor(form, term.tally, person(term, "nina")), []);
    assert.deepEqual(plan.invitableFor(form, term.tally, person(term, "oliver")), [TAIS]);
    assert.deepEqual(plan.invitableFor(form, term.tally, person(term, "lily")), [AGI]);
  });

  test("an id that is not one of the form's own programmes is not a programme", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "not-on-the-form", ""]) {
      assert.equal(
        plan.inviteProblem(form, term.tally, person(term, "nina"), id),
        "That programme is not on this form.",
        id,
      );
      assert.equal(programmes.programmeOf(form, id), undefined, id);
    }
    assert.equal(programmes.programmeOf(form, null), undefined);
    assert.equal(programmes.programmeOf(form, TAIS).shortName, "Technical AI Safety");
    assert.equal(programmes.shortNameOf(form, "constructor"), "constructor");
  });
});

// ---------------------------------------------------------------------------
// 3. Why the send cannot go
// ---------------------------------------------------------------------------

describe("the send is held, one sentence per reason", () => {
  const ready = [
    ["amara", "Amara Okafor", [AGI], { [AGI]: "accept" }],
    ["oliver", "Oliver Grant", [INC], { [INC]: "pool" }, { kind: "invite", programmeId: TAIS }],
    ["nina", "Nina Petrova", [AGI], { [AGI]: "pool" }, { kind: "no-offer" }],
    ["zara", "Zara Ahmed", [AGI], { [AGI]: "decline" }],
  ];
  const blockers = (form, rows, over = {}) =>
    plan.sendBlockers({ form, term: termOf(form, rows), now: DECISION_DAY, appUrl: "https://staging.example.com", ...over });

  test("a term with every decision made and every outcome picked may go", () => {
    assert.deepEqual(blockers(makeForm(), ready), []);
  });

  test("a programme that still owes decisions is named with how many", () => {
    const rows = [...ready, ["sam", "Sam Whitfield", [TAIS, AGI], null], ["leah", "Leah Fischer", [TAIS], null]];
    assert.deepEqual(blockers(makeForm(), rows), [
      "AGI Strategy still owes 1 application a decision.",
      "Technical AI Safety still owes 2 applications a decision.",
    ]);
  });

  test("pooled people with nothing picked hold it", () => {
    const rows = [...ready, ["rosa", "Rosa García", [INC], { [INC]: "pool" }]];
    assert.deepEqual(blockers(makeForm(), rows), ["1 pooled person still needs an outcome."]);
    const two = [...rows, ["ben", "Ben Hartley", [AGI], { [AGI]: "pool" }]];
    assert.deepEqual(blockers(makeForm(), two), ["2 pooled people still need an outcome."]);
  });

  // The contract reads somebody whose ranking holds nothing the form still
  // carries as POOLED (`outcomeFor`): no programme they ranked took them, and
  // no programme can owe them a decision. So they hold the send the way any
  // pooled person does, under the one ordinary sentence, and an admin clears
  // it the ordinary way, by picking what they hear. They get no sentence of
  // their own: the reading this replaces (`undecided`, waiting on nothing)
  // held the send for a reason nobody on either screen could do anything about.
  test("an application that ranks nothing still on the form is pooled: it holds the send until an outcome is picked", () => {
    const form = makeForm();
    const left = ["tom", "Tomasz Nowak", ["a-programme-that-left"], null];
    const term = termOf(form, [...ready, left]);
    const tom = person(term, "tom");
    assert.deepEqual(tom.ranked, [], "the form carries nothing they ranked");
    assert.deepEqual(tom.outcome, { kind: "needs-outcome" });
    assert.equal(decisions.isPooled(tom.outcome), true);
    assert.equal(term.tally.outcomes.undecided, 0, "no programme is waited on");
    assert.equal(term.tally.outcomes.needsOutcome, 1);

    // Held, in the one sentence a pooled person without an outcome earns.
    assert.deepEqual(blockers(form, [...ready, left]), ["1 pooled person still needs an outcome."]);
    const another = ["una", "Una Byrne", ["another-that-left"], null];
    assert.deepEqual(blockers(form, [...ready, left, another]), ["2 pooled people still need an outcome."]);

    // And an admin can clear it: either outcome may be picked for them.
    assert.equal(plan.poolProblem(form, tom), null);
    assert.equal(plan.inviteProblem(form, term.tally, tom, INC), null);
    const told = (outcome) => ["tom", "Tomasz Nowak", ["a-programme-that-left"], {}, outcome];
    const noOffer = [...ready, told({ kind: "no-offer" })];
    assert.deepEqual(person(termOf(form, noOffer), "tom").outcome, { kind: "no-offer" });
    assert.deepEqual(blockers(form, noOffer), [], "once picked, nothing is left that nobody can clear");
    const invited = [...ready, told({ kind: "invite", programmeId: INC })];
    assert.deepEqual(person(termOf(form, invited), "tom").outcome, { kind: "invited", programmeId: INC });
    assert.deepEqual(blockers(form, invited), []);
  });

  test("an invitation needs a reply-by day, and one that has not passed", () => {
    assert.deepEqual(blockers(makeForm(undefined, { form: { invitationReplyBy: null } }), ready), [
      "Invitations need a reply-by date. Set it in the application form.",
    ]);
    assert.deepEqual(blockers(makeForm(undefined, { form: { invitationReplyBy: "2026-10-22" } }), ready), [
      "The reply-by date for invitations, Thu 22 Oct, has passed. Move it in the application form.",
    ]);
    // The day itself has not passed.
    assert.deepEqual(blockers(makeForm(undefined, { form: { invitationReplyBy: "2026-10-23" } }), ready), []);
    // With nobody invited there is no day to need.
    const nobodyInvited = ready.filter(([uid]) => uid !== "oliver");
    assert.deepEqual(blockers(makeForm(undefined, { form: { invitationReplyBy: null } }), nobodyInvited), []);
  });

  test("a form still taking applications, not yet open, cancelled or archived sends nothing", () => {
    // The clocks go back that morning, so 23:59 in London is 23:59 UTC.
    const open = makeForm(undefined, { form: { status: "open", closesAt: new Date("2026-10-25T23:59:00Z") } });
    assert.deepEqual(blockers(open, ready), [
      "Applications are still open until Sun 25 Oct, 23:59. Decisions go out after they close.",
    ]);
    assert.deepEqual(blockers(makeForm(undefined, { form: { status: "draft" } }), ready), [
      "Applications have not opened on this form yet.",
    ]);
    assert.deepEqual(blockers(makeForm(undefined, { form: { status: "cancelled" } }), ready), [
      "This application form was cancelled, so nothing can be sent from it.",
    ]);
    assert.deepEqual(blockers(makeForm(undefined, { form: { archived: true } }), ready), [
      "This application form is archived, so nothing can be sent from it.",
    ]);
  });

  test("a term that has been sent is not sent again", () => {
    const sent = makeForm(undefined, { form: { decisionsSentAt: DECISION_DAY, decisionsSentByUid: "zach" } });
    assert.deepEqual(blockers(sent, ready), [
      "Decisions for Autumn 2026 went out on Fri 23 Oct. They can’t be sent again.",
    ]);
  });

  test("nobody having applied, and a site that does not know its own address, both hold it", () => {
    assert.deepEqual(blockers(makeForm(), []), ["Nobody has sent an application, so there is nothing to send."]);
    assert.deepEqual(blockers(makeForm(), ready, { appUrl: "  " }), [
      "This copy of the site doesn’t know its own address, so the buttons in the emails would lead nowhere.",
    ]);
  });

  test("nobody is told they have a place on, or an invitation to, a closed programme", () => {
    const closed = makeForm(undefined, { programmes: { [TAIS]: { closed: true }, [AGI]: { closed: true } } });
    assert.deepEqual(blockers(closed, ready), [
      "AGI Strategy is closed, and 1 person has a place on it.",
      "Technical AI Safety is closed, and 1 person is invited to it.",
    ]);
  });

  test("whenever the decisions' own rule says not ready, something is said", () => {
    const form = makeForm();
    const rows = [...ready, ["rosa", "Rosa García", [INC], { [INC]: "pool" }], ["sam", "Sam Whitfield", [TAIS], null]];
    const term = termOf(form, rows);
    assert.equal(term.readiness.ready, false);
    assert.ok(plan.sendBlockers({ form, term, now: DECISION_DAY, appUrl: "https://staging.example.com" }).length >= 2);
  });
});

// ---------------------------------------------------------------------------
// 4. The sentences, and the term the design was drawn for
// ---------------------------------------------------------------------------

describe("the two screens say the design's sentences, with the design's numbers", () => {
  // 122 applicants. Accepted: AGI Strategy 32, Technical AI Safety 22, Research
  // incubator 12. Pooled 55 (by 1st choice: 24, 20, 11), of whom two from the
  // incubator are invited to Technical AI Safety's last two places and 53 get
  // no offer. One declined.
  const form = makeForm();
  const rows = [];
  const add = (prefix, count, ranked, verdict, outcome) => {
    for (let i = 0; i < count; i += 1) {
      const uid = `${prefix}${String(i).padStart(2, "0")}`;
      rows.push([uid, `Person ${uid}`, ranked, { [ranked[0]]: verdict }, typeof outcome === "function" ? outcome(i) : outcome]);
    }
  };
  add("agi-in-", 32, [AGI], "accept");
  add("tais-in-", 22, [TAIS], "accept");
  add("inc-in-", 12, [INC], "accept");
  add("agi-pool-", 24, [AGI], ["pool", "capacity"], { kind: "no-offer" });
  add("tais-pool-", 20, [TAIS], ["pool", "capacity"], { kind: "no-offer" });
  add("inc-pool-", 11, [INC], ["pool", "better-fit", TAIS], (i) =>
    i < 2 ? { kind: "invite", programmeId: TAIS } : { kind: "no-offer" },
  );
  add("spam-", 1, [AGI], "decline");
  const term = termOf(form, rows);
  const pooled = term.people.filter((p) => decisions.isPooled(p.outcome));

  test("the term adds up: 122 applied, 66 accepted, 2 invited, 53 no offer, 1 declined", () => {
    assert.equal(term.tally.applicants, 122);
    assert.deepEqual(term.tally.outcomes, {
      accepted: 66,
      invited: 2,
      noOffer: 53,
      declined: 1,
      needsOutcome: 0,
      undecided: 0,
    });
    assert.equal(pooled.length, 55);
    assert.deepEqual(
      [AGI, TAIS, INC].map((id) => pooled.filter((p) => p.ranked[0] === id).length),
      [24, 20, 11],
    );
    assert.deepEqual(plan.sendBlockers({ form, term, now: DECISION_DAY, appUrl: "https://staging.example.com" }), []);
  });

  test("the button says 121 emails, and 122 with the declined one switched on", () => {
    const todo = plan.unpublished(term);
    assert.equal(todo.length, 122);
    assert.equal(plan.emailCount(todo, false), 121);
    assert.equal(plan.emailCount(todo, false), term.tally.emails, "the number on the button is the tally's");
    assert.equal(plan.emailCount(todo, true), 122);
    assert.equal(say.sendButtonLabel(121, 122, 150, 0), "Send 121 emails");
  });

  test("Pooled applicants: the free places cards", () => {
    const card = (id) => {
      const places = form.programmes[id].places;
      const { placed, invited } = term.tally.programmes[id];
      const open = Math.max(0, places - placed);
      return [open, say.placesTakenLine(places, placed), say.invitationsPickedLine(open, invited)];
    };
    assert.deepEqual(card(AGI), [0, "All 32 places taken.", ""]);
    assert.deepEqual(card(TAIS), [2, "22 of 24 places taken.", "Both are picked for invitations."]);
    assert.deepEqual(card(INC), [0, "All 12 places taken.", ""]);
    assert.equal(decisions.freePlaces(form, term.tally, TAIS), 0, "so nobody else can be invited there");
  });

  test("Pooled applicants: the totals under the table", () => {
    const { invited, noOffer, needsOutcome } = term.tally.outcomes;
    assert.equal(
      say.poolTotalsLine({ pooled: pooled.length, invitations: invited, noOffer, needsOutcome }),
      "55 pooled · 2 invitations · 53 no offer",
    );
  });

  test("Send decisions: the readiness rows and the totals", () => {
    const row = (id) => {
      const { placed, invited } = term.tally.programmes[id];
      return say.placesDetail(form.programmes[id].places, placed, invited);
    };
    assert.equal(row(AGI), "32 of 32 places");
    assert.equal(row(TAIS), "22 of 24 places, and 2 invitations");
    assert.equal(row(INC), "12 of 12 places");
    assert.equal(say.pooledDetail(2, 53), "2 invitations, 53 no offer");
    assert.equal(say.sendTotalsLine(66, 2, 53), "66 accepted, 2 invitations and 53 no offer");
    assert.equal(say.declinedLine(1, false), "The declined application isn’t emailed.");
    assert.equal(say.emailsLabel(66), "66 emails");
    assert.equal(say.applicationsLabel(1), "1 application");
  });
});

describe("the sentences agree with their numbers", () => {
  test("one of something is singular", () => {
    assert.equal(say.emailsLabel(1), "1 email");
    assert.equal(say.applicationsLabel(3), "3 applications");
    assert.equal(say.pooledDetail(1, 0), "1 invitation, 0 no offer");
    assert.equal(say.sendTotalsLine(1, 1, 1), "1 accepted, 1 invitation and 1 no offer");
    assert.equal(say.placesDetail(8, 3, 1), "3 of 8 places, and 1 invitation");
    assert.equal(say.placesDetail(null, 3, 0), "3 placed");
  });

  test("the places line and the invitations line cover every case", () => {
    assert.equal(say.placesTakenLine(null, 0), "No number of places set yet.");
    assert.equal(say.placesTakenLine(24, 3), "3 of 24 places taken.");
    assert.equal(say.placesTakenLine(24, 26), "26 of 24 places taken.");
    assert.equal(say.invitationsPickedLine(5, 0), "");
    assert.equal(say.invitationsPickedLine(null, 2), "");
    assert.equal(say.invitationsPickedLine(1, 1), "It’s picked for an invitation.");
    assert.equal(say.invitationsPickedLine(3, 3), "All 3 are picked for invitations.");
    assert.equal(say.invitationsPickedLine(5, 1), "1 is picked for an invitation.");
    assert.equal(say.invitationsPickedLine(5, 2), "2 are picked for invitations.");
    assert.equal(say.invitationsPickedLine(1, 2), "2 invitations picked, for 1 free place.");
  });

  test("the totals say who still needs an outcome", () => {
    assert.equal(
      say.poolTotalsLine({ pooled: 7, invitations: 2, noOffer: 2, needsOutcome: 3 }),
      "7 pooled · 2 invitations · 2 no offer · 3 need an outcome",
    );
    assert.equal(
      say.poolTotalsLine({ pooled: 3, invitations: 1, noOffer: 1, needsOutcome: 1 }),
      "3 pooled · 1 invitation · 1 no offer · 1 needs an outcome",
    );
  });

  test("the declined line follows the switch", () => {
    assert.equal(say.declinedLine(0, false), "");
    assert.equal(say.declinedLine(3, false), "The 3 declined applications aren’t emailed.");
    assert.equal(say.declinedLine(1, true), "The declined application gets the “No offer this time” email.");
    assert.equal(say.declinedLine(2, true), "The 2 declined applications get the “No offer this time” email.");
  });

  test("the button always says what a press will do", () => {
    assert.equal(say.sendButtonLabel(1, 1, 150, 0), "Send 1 email");
    assert.equal(say.sendButtonLabel(40, 41, 150, 80), "Send the remaining 40 emails");
    assert.equal(say.sendButtonLabel(290, 300, 150, 0), "Send the first 150 of 300 decisions");
    assert.equal(say.sendButtonLabel(140, 150, 150, 150), "Send the remaining 140 emails");
    assert.equal(say.sendButtonLabel(160, 170, 150, 150), "Send the next 150 of 170 decisions");
    assert.equal(say.sendButtonLabel(0, 0, 150, 122), "Finish the send");
  });

  test("the button's number counts the emails still owed to people already told", () => {
    // 6 people not yet told and 1 owed: seven emails go.
    assert.equal(say.sendButtonLabel(7, 6, 150, 1, 1), "Send the remaining 7 emails");
    // Everybody told, the term never marked: the owed emails are what is left.
    assert.equal(say.sendButtonLabel(2, 0, 150, 122, 2), "Send the 2 emails still owed");
    assert.equal(say.sendButtonLabel(1, 0, 150, 122, 1), "Send the 1 email still owed");
    // Owed emails count towards what one press can reach.
    assert.equal(say.sendButtonLabel(155, 148, 150, 10, 5), "Send the next 150 of 153 decisions");
    assert.equal(say.owedButtonLabel(1), "Send the 1 email still owed");
    assert.equal(say.owedButtonLabel(4), "Send the 4 emails still owed");
  });

  test("a list of names reads the way a person would say it, and stops", () => {
    assert.equal(say.nameList([]), "");
    assert.equal(say.nameList(["Ada Obi"]), "Ada Obi");
    assert.equal(say.nameList(["Ada Obi", "Ben Hartley"]), "Ada Obi and Ben Hartley");
    assert.equal(say.nameList(["Ada Obi", "Ben Hartley", "Chloe Tan"]), "Ada Obi, Ben Hartley and Chloe Tan");
    assert.equal(say.nameList(["A", "B", "C", "D"], 2), "A, B and 2 more");
    const ten = Array.from({ length: 10 }, (_, i) => `P${i}`);
    assert.equal(say.nameList(ten), "P0, P1, P2, P3, P4, P5, P6, P7 and 2 more");
  });

  test("the card for emails still owed says who, and which button sends them", () => {
    assert.equal(
      say.owedLine(["Nina Petrova"], false),
      "Nina Petrova has their result on the site, but their email has not gone.",
    );
    assert.equal(
      say.owedLine(["Nina Petrova"], true),
      "Nina Petrova has their result on the site, but their email has not gone. The Send button below sends it too.",
    );
    assert.equal(
      say.owedLine(["Nina Petrova", "Ben Hartley"], true),
      "Nina Petrova and Ben Hartley have their result on the site, but their emails have not gone. The Send button below sends them too.",
    );
    assert.equal(
      say.noAddressLine(["Sam Whitfield"]),
      "Sam Whitfield has no email address on their application, so there is nowhere to send their email. Their result is on the site.",
    );
    assert.equal(
      say.noAddressLine(["Sam Whitfield", "Wen Zhao"]),
      "Sam Whitfield and Wen Zhao have no email address on their applications, so there is nowhere to send their emails. Their results are on the site.",
    );
    assert.equal(say.inFlightLine(1), "1 email is being sent right now. Reload the page in a minute.");
    assert.equal(say.inFlightLine(3), "3 emails are being sent right now. Reload the page in a minute.");
    assert.equal(
      say.unconfirmedLine(["Ben Hartley"]),
      "We can’t tell whether the email to Ben Hartley went: the send was cut off while it was being handed over. " +
        "It won’t be sent again, so nobody gets their decision twice. " +
        "Look for it in Deliverability, and write to them yourself if it isn’t there.",
    );
  });

  test("what a press did is said in sentences whose numbers are the report's", () => {
    const report = (over) => ({
      owedOnly: false, published: 0, retried: 0, emailed: 0, held: 0, suppressed: 0, failed: 0,
      unconfirmed: 0, notEmailed: 0, skipped: 0, changed: 0, notReached: 0, failedNames: [],
      unconfirmedNames: [], accountsApproved: 0, accountsFailed: [], accountsRefused: [],
      stopped: null, complete: false, ...over,
    });
    assert.deepEqual(say.reportLines(report({ published: 122, emailed: 121, notEmailed: 1, complete: true })), [
      "122 people told: 121 emailed, 1 declined and not emailed.",
      "Everybody in the term now has their result.",
    ]);
    assert.deepEqual(say.reportLines(report({ skipped: 8, complete: true })), [
      "Nobody new was told.",
      "8 people already had their result, so nothing went to them again.",
      "Everybody in the term now has their result.",
    ]);
    // A press that told the rest and took an owed email up with them.
    assert.deepEqual(
      say.reportLines(report({ published: 7, retried: 1, emailed: 7, notEmailed: 1, complete: true })),
      ["7 people told and 1 owed email taken up: 7 emailed, 1 declined and not emailed.", "Everybody in the term now has their result."],
    );
    // An email that failed is owed, and the page keeps saying so.
    assert.deepEqual(
      say.reportLines(report({ published: 8, emailed: 6, failed: 1, notEmailed: 1, failedNames: ["Nina Petrova"], complete: true })),
      [
        "8 people told: 6 emailed, 1 failed, 1 declined and not emailed.",
        "The email could not be sent to Nina Petrova. Their result is on their application page, and the email is still owed: it is listed on this page until it goes.",
        "Everybody in the term now has their result.",
      ],
    );
    // One nobody can vouch for is named, and is not sent again.
    assert.deepEqual(
      say.reportLines(report({ published: 1, unconfirmed: 1, unconfirmedNames: ["Ben Hartley"], notReached: 7, stopped: "emails-failing" })),
      [
        "1 person told: 0 emailed, 1 not confirmed.",
        say.unconfirmedLine(["Ben Hartley"]),
        "The send stopped because emails were failing. Nobody else was told. Press Send again once the mail is working.",
      ],
    );
    // The press that only sends what is owed tells nobody, and says nothing about telling.
    assert.deepEqual(say.reportLines(report({ owedOnly: true, retried: 2, emailed: 2, skipped: 120, complete: true })), [
      "2 owed emails taken up: 2 emailed.",
    ]);
    assert.deepEqual(say.reportLines(report({ owedOnly: true, skipped: 122, complete: true })), ["No owed email was sent."]);
    assert.deepEqual(
      say.reportLines(report({ owedOnly: true, retried: 1, failed: 1, failedNames: ["Nina Petrova"], notReached: 2, stopped: "emails-failing" })),
      [
        "1 owed email taken up: 0 emailed, 1 failed.",
        "The email could not be sent to Nina Petrova. Their result is on their application page, and the email is still owed: it is listed on this page until it goes.",
        "The send stopped because emails were failing. Try again once the mail is working.",
      ],
    );
    assert.deepEqual(say.reportLines(report({ owedOnly: true, retried: 150, emailed: 150, notReached: 3 }))[1],
      "3 owed emails were not reached. Press the button again for the rest.");
    assert.deepEqual(
      say.reportLines(report({ published: 150, emailed: 150, notReached: 20, held: 0 })),
      ["150 people told: 150 emailed.", "20 people still to be told. Press Send again for the rest."],
    );
    assert.deepEqual(say.reportLines(report({ published: 2, held: 2, changed: 1 })), [
      "2 people told: 0 emailed, 2 held.",
      "Held means this copy of the site may not write to that address, so nothing was sent to it. That is how a rehearsal works.",
      "1 person was left out because their decision changed after you pressed Send. Check the page and send again.",
    ]);
  });

  test("what a press did about waiting accounts is said, and only when there is something to say", () => {
    const report = (over) => ({
      owedOnly: false, published: 3, retried: 0, emailed: 3, held: 0, suppressed: 0, failed: 0,
      unconfirmed: 0, notEmailed: 0, skipped: 0, changed: 0, notReached: 0, failedNames: [],
      unconfirmedNames: [], accountsApproved: 0, accountsFailed: [], accountsRefused: [],
      stopped: null, complete: false, ...over,
    });
    assert.deepEqual(say.reportLines(report({})), ["3 people told: 3 emailed."]);
    assert.deepEqual(say.reportLines(report({ accountsApproved: 1 })), [
      "3 people told: 3 emailed.",
      "1 account that was waiting is now approved.",
    ]);
    assert.equal(say.reportLines(report({ accountsApproved: 12 }))[1], "12 accounts that were waiting are now approved.");
    assert.equal(
      say.reportLines(report({ accountsFailed: ["Wen Zhao"] }))[1],
      "Could not approve the account of Wen Zhao. Approve it in Approvals.",
    );
    assert.equal(
      say.reportLines(report({ accountsFailed: ["Wen Zhao", "Sam Whitfield"] }))[1],
      "Could not approve the accounts of Wen Zhao and Sam Whitfield. Approve them in Approvals.",
    );
    assert.equal(
      say.reportLines(report({ accountsRefused: ["Sam Whitfield"] }))[1],
      "Sam Whitfield was accepted, but their join request was refused earlier. Sending leaves that account as it is.",
    );
  });

  test("the note under You’re in says who is still waiting, and who was refused", () => {
    // After a send that approves accounts, somebody's can still be waiting.
    assert.equal(say.accountsWaitingLine(1, true), "1 of them has an account that’s still waiting. Approve it in Approvals.");
    assert.equal(say.accountsWaitingLine(3, true), "3 of them have an account that’s still waiting. Approve them in Approvals.");
    // Where the send approves nobody, the page says so.
    assert.equal(
      say.accountsWaitingLine(2, false),
      "2 of them have an account that’s still waiting. Sending doesn’t approve it, so approve them in Approvals.",
    );
    assert.equal(
      say.accountsRefusedLine(["Sam Whitfield", "Wen Zhao"]),
      "Sam Whitfield and Wen Zhao were accepted, but their join requests were refused earlier. Sending leaves those accounts as they are.",
    );
  });

  test("the line under a degree is what the form asked", () => {
    assert.equal(say.studyLine({ status: "undergraduate", statusOther: "", expectedGraduation: "2027-07" }), "Graduating July 2027");
    assert.equal(say.studyLine({ status: "postdoc", statusOther: "", expectedGraduation: "" }), "Post-doc");
    assert.equal(say.studyLine({ status: "other", statusOther: " Visiting researcher ", expectedGraduation: "" }), "Visiting researcher");
    assert.equal(say.studyLine({ status: "", statusOther: "", expectedGraduation: "" }), "");
    assert.equal(say.studyLine({ status: "undergraduate", statusOther: "", expectedGraduation: "2027-13" }), "Undergraduate");
  });

  test("a civil date reads the way the screens state it", () => {
    assert.equal(plan.civilDateLabel("2026-10-25"), "Sun 25 Oct");
    assert.equal(plan.civilDateLabel(null), null);
    assert.equal(plan.countOf(1, "person", "people"), "1 person");
    assert.equal(plan.countOf(4, "person", "people"), "4 people");
  });
});

// ---------------------------------------------------------------------------
// 5. What became of an email, and which failures hand nothing over
// ---------------------------------------------------------------------------

describe("a result's email is read one way by the send and the page", () => {
  const at = new Date("2026-10-23T11:00:00Z");
  const minutes = (n) => new Date(at.getTime() + n * 60_000);

  test("every settled state reads as itself, whenever it is read", () => {
    for (const state of ["owed", "sent", "not-sent", "held", "suppressed", "unconfirmed"]) {
      for (const when of [at, minutes(1), minutes(600)]) {
        assert.equal(emailState.emailStanding({ email: state, emailClaimedAt: null }, when), state);
        // A time left on a settled result changes nothing.
        assert.equal(emailState.emailStanding({ email: state, emailClaimedAt: at }, when), state);
      }
    }
  });

  test("an email a press holds is in flight while the press could be alive, then nobody can vouch for it", () => {
    const held = { email: "sending", emailClaimedAt: at };
    assert.equal(emailState.EMAIL_CLAIM_MS, 5 * 60_000);
    assert.equal(emailState.emailStanding(held, at), "in-flight");
    assert.equal(emailState.emailStanding(held, minutes(1)), "in-flight");
    assert.equal(emailState.emailStanding(held, minutes(5)), "in-flight", "five minutes exactly is still a press at work");
    assert.equal(emailState.emailStanding(held, new Date(minutes(5).getTime() + 1)), "unconfirmed");
    assert.equal(emailState.emailStanding(held, minutes(600)), "unconfirmed");
    // The store's clock a little ahead of this one is not a stale claim.
    assert.equal(emailState.emailStanding(held, minutes(-1)), "in-flight");
    // A claim with no time on it cannot be waited out.
    assert.equal(emailState.emailStanding({ email: "sending", emailClaimedAt: null }, at), "unconfirmed");
  });

  test("it is never read as owed unless the record says owed", () => {
    for (const state of ["sending", "sent", "not-sent", "held", "suppressed", "unconfirmed"]) {
      for (const claimedAt of [null, at, minutes(-600)]) {
        for (const when of [at, minutes(6), minutes(6000)]) {
          assert.notEqual(emailState.emailStanding({ email: state, emailClaimedAt: claimedAt }, when), "owed", state);
        }
      }
    }
  });

  test("the normaliser reads a result that does not say as unconfirmed, and keeps every state that does", () => {
    const stored = (result) => application("amara", "Amara Okafor", [AGI], { status: "accepted", result }).result;
    assert.deepEqual(stored({ kind: "accepted", programmeId: AGI, publishedAt: WHEN }), {
      kind: "accepted",
      programmeId: AGI,
      publishedAt: WHEN,
      email: "unconfirmed",
      emailedAt: null,
      emailClaimedAt: null,
    });
    for (const state of ["owed", "sending", "sent", "not-sent", "held", "suppressed", "unconfirmed"]) {
      assert.equal(stored({ kind: "accepted", programmeId: AGI, email: state }).email, state);
    }
    for (const junk of ["", "OWED", "pending", 1, null, true, {}, ["owed"]]) {
      assert.equal(stored({ kind: "accepted", programmeId: AGI, email: junk }).email, "unconfirmed", JSON.stringify(junk));
    }
    assert.deepEqual(
      stored({ kind: "accepted", programmeId: AGI, email: "sent", emailedAt: WHEN, emailClaimedAt: "2026-10-19T09:00:00Z" }),
      { kind: "accepted", programmeId: AGI, publishedAt: null, email: "sent", emailedAt: WHEN, emailClaimedAt: WHEN },
    );
  });
});

describe("a failed send is tried again only when it is known to have handed nothing over", () => {
  const failure = (message, extra) => Object.assign(new Error(message), extra);
  const NOT_HANDED_OVER = [
    ["the provider refused the recipient", failure("Can't send mail - all recipients were rejected: 550 no such user", { code: "EENVELOPE", responseCode: 550, command: "RCPT TO" })],
    ["the provider said try later", failure("Message failed: 451 too many requests", { code: "EMESSAGE", responseCode: 451, command: "DATA" })],
    ["the provider refused the finished message", failure("Message failed: 554 transaction failed", { code: "EMESSAGE", responseCode: 554, command: "DATA" })],
    ["the provider was closing down", failure("Server terminates connection. response=421 try later", { code: "ECONNECTION", responseCode: 421, command: "EHLO" })],
    ["the sign-in was refused", failure("Invalid login: 535 authentication failed", { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" })],
    ["the sign-in had nothing to offer", failure("Missing credentials for PLAIN", { code: "EAUTH", command: "API" })],
    ["the connection was refused", failure("connect ECONNREFUSED 127.0.0.1:587", { code: "ESOCKET", syscall: "connect", command: "CONN" })],
    ["the host could not be reached", failure("connect EHOSTUNREACH 203.0.113.1:587", { code: "ESOCKET", syscall: "connect", command: "CONN" })],
    ["the name did not resolve", failure("getaddrinfo ENOTFOUND smtp.example.com", { code: "EDNS", syscall: "getaddrinfo", command: "CONN" })],
    ["the name did not resolve, by code alone", failure("queryA ENODATA", { code: "EDNS" })],
    ["the secure channel was never set up", failure("Error initiating TLS - handshake failed", { code: "ETLS", command: "CONN" })],
    ["no connection opened in time", failure("Connection timeout", { code: "ETIMEDOUT", command: "CONN" })],
    ["the provider never greeted", failure("Greeting never received", { code: "ETIMEDOUT", command: "CONN" })],
    ["the sender was refused, with no code kept", failure("Mail command failed", { code: "EENVELOPE", command: "MAIL FROM" })],
  ];
  const UNKNOWN = [
    ["the conversation timed out part way", failure("Timeout", { code: "ETIMEDOUT", command: "CONN" })],
    ["the connection dropped part way", failure("Connection closed unexpectedly", { code: "ECONNECTION", command: "CONN" })],
    ["the connection was reset part way", failure("read ECONNRESET", { code: "ESOCKET", syscall: "read", command: "CONN" })],
    ["the provider's reply could not be read", failure("Unexpected Response", { code: "EPROTOCOL", command: "CONN" })],
    ["the message stream broke", failure("stream error", { code: "ESTREAM", command: "API" })],
    ["a message failure with no reply code", failure("Message failed", { code: "EMESSAGE", command: "DATA" })],
    ["a reply code that is not a refusal", failure("odd", { responseCode: 250 })],
    ["a timeout whose words are not the two recognised", failure("Timeout while connecting", { code: "ETIMEDOUT" })],
    ["an error with nothing on it", new Error("something went wrong")],
    ["an error from the site's own code", new TypeError("cannot read properties of undefined")],
    ["a reply code typed as text", failure("refused", { responseCode: "550" })],
    ["not an error at all", "ECONNREFUSED"],
    ["nothing", undefined],
    ["null", null],
    ["a number", 550],
  ];

  for (const [what, err] of NOT_HANDED_OVER) {
    test(`${what}: nothing was handed over, so it may be tried again`, () => {
      assert.equal(emailState.handoverAfter(err), "not-handed-over");
    });
  }
  for (const [what, err] of UNKNOWN) {
    test(`${what}: nobody can say, so it is left alone`, () => {
      assert.equal(emailState.handoverAfter(err), "unknown");
    });
  }
});

describe("who a later press takes up", () => {
  const told = (kind, programmeId, email, over = {}) => ({
    status: kind,
    result: { kind, programmeId, publishedAt: WHEN, emailClaimedAt: null, ...email },
    ...over,
  });
  const form = makeForm();
  const rows = [
    ["amara", "Amara Okafor", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "owed" })],
    ["ben", "Ben Hartley", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "owed" }, { email: null })],
    ["chloe", "Chloe Tan", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "owed" }, { email: "   " })],
    ["dev", "Dev Patel", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "sent" })],
    ["farah", "Farah Malik", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "sending", emailClaimedAt: DECISION_DAY })],
    ["george", "George Hall", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "unconfirmed" })],
    ["hannah", "Hannah Lee", [AGI], { [AGI]: "accept" }, null, told("accepted", AGI, { email: "held" })],
    ["isaac", "Isaac Young", [AGI], { [AGI]: "accept" }, null],
  ];
  const term = termOf(form, rows);
  const names = (people) => people.map((p) => p.name);

  test("only somebody owed an email, with an address to send it to", () => {
    assert.deepEqual(names(plan.owedEmails(term, DECISION_DAY)), ["Amara Okafor"]);
    // Owed with nowhere to send it: on the page by name, in no press.
    assert.deepEqual(names(plan.toldWithEmail(term, "owed", DECISION_DAY)), ["Amara Okafor", "Ben Hartley", "Chloe Tan"]);
  });

  test("somebody not told yet is owed nothing: they are told, and emailed, by the send itself", () => {
    assert.deepEqual(names(plan.unpublished(term)), ["Isaac Young"]);
    for (const standing of ["owed", "in-flight", "sent", "not-sent", "held", "suppressed", "unconfirmed"]) {
      assert.ok(!names(plan.toldWithEmail(term, standing, DECISION_DAY)).includes("Isaac Young"), standing);
    }
  });

  test("an email a press holds moves from in flight to unconfirmed, and is never owed", () => {
    assert.deepEqual(names(plan.toldWithEmail(term, "in-flight", DECISION_DAY)), ["Farah Malik"]);
    const afterwards = new Date(DECISION_DAY.getTime() + 6 * 60_000);
    assert.deepEqual(names(plan.toldWithEmail(term, "in-flight", afterwards)), []);
    assert.deepEqual(names(plan.toldWithEmail(term, "unconfirmed", afterwards)), ["Farah Malik", "George Hall"]);
    assert.deepEqual(names(plan.owedEmails(term, afterwards)), ["Amara Okafor"]);
  });

  test("an owed email waits for much less than the term does", () => {
    const blockers = (over) => plan.owedBlockers({ form: makeForm(undefined, { form: over }), appUrl: "https://staging.example.com" });
    // A term that is sent, still open, or not ready does not hold an owed email.
    assert.deepEqual(blockers({ decisionsSentAt: WHEN }), []);
    assert.deepEqual(blockers({ status: "open", closesAt: new Date("2026-10-25T23:59:00Z") }), []);
    assert.deepEqual(blockers({ invitationReplyBy: null }), []);
    assert.deepEqual(blockers({ archived: true }), ["This application form is archived, so nothing can be sent from it."]);
    assert.deepEqual(blockers({ status: "cancelled" }), ["This application form was cancelled, so nothing can be sent from it."]);
    assert.deepEqual(plan.owedBlockers({ form, appUrl: " " }), [
      "This copy of the site doesn’t know its own address, so the buttons in the emails would lead nowhere.",
    ]);
  });
});
