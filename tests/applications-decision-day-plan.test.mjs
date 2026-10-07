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

  test("an application that ranks nothing still on the form holds it, and is said", () => {
    const rows = [...ready, ["tom", "Tomasz Nowak", ["a-programme-that-left"], null]];
    assert.deepEqual(blockers(makeForm(), rows), [
      "1 application ranks nothing that is still on the form, so no programme can decide it.",
    ]);
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
