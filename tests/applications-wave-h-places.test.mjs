/**
 * Who holds a place on a programme now: one answer, read by every screen.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Places were counted from the decision documents alone. A reply never
 * touches those: an invitation accepted, an invitation turned down and a
 * place given back are all written on the person's own application. So after
 * decision day somebody who accepted an invitation was counted on no
 * programme, and the place went on reading "held for an invitation" after it
 * had been taken.
 *
 * The answer is now one function in the contract, `holdingOf`
 * (`src/lib/applications/decisions.ts`), which reads both halves of the
 * record, and `tallyTerm` counts places from it and from nothing else. This
 * file holds that in three layers:
 *
 *  1. THE FUNCTION: every way a person can stand, before and after they are
 *     told.
 *  2. BEFORE DECISION DAY NOTHING CHANGES. A term nobody has been told
 *     anything in counts exactly as the arithmetic counted it when it read
 *     the decisions alone, with the application handed over or without it.
 *  3. THE SCREENS AGREE. One stored term in which each kind of reply has been
 *     made is handed to everything that counts places (the review list, the
 *     term page's card, the decision-day plan, the editor's tally), and each
 *     has to give the numbers a recount of the applications gives. The tree
 *     is walked for callers of the arithmetic, so a new one has to be named
 *     here and held to the same thing.
 *
 * ## What is real and what is stubbed
 *
 * Real: `decisions.ts`, `status/standing.ts`, `review/term.ts`,
 * `review/board.ts`, `decisionDay/plan.ts`, `editor/load.ts` and the
 * normalisers under them. Stubbed: `server-only`, and `../staffRepo` for the
 * editor's loader, which is handed this file's documents with no database.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

globalThis.__places = { applications: [], decisions: new Map() };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "../staffRepo",
      [
        "export async function listSentApplications() { return globalThis.__places.applications; }",
        "export async function listDecisions() { return globalThis.__places.decisions; }",
        "export async function listReviews() { return []; }",
      ].join("\n"),
    ],
  ]),
});
const lib = (...parts) => join("lib", "applications", ...parts);

const decisions = await loadTs(lib("decisions.ts"));
const normalise = await loadTs(lib("normalise.ts"));
const reviewTerm = await loadTs(lib("review", "term.ts"));
const reviewBoard = await loadTs(lib("review", "board.ts"));
const plan = await loadTs(lib("decisionDay", "plan.ts"));
const editorLoad = await loadTs(lib("editor", "load.ts"));

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND = "autumn-2026__k3f9a2b1";
const NOW = new Date("2026-10-24T10:00:00Z");
const SENT_AT = new Date("2026-10-17T13:20:00Z");
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const ON_THE_FORM = new Set([AGI, TAIS, INC]);

// ---------------------------------------------------------------------------
// 1. The function
// ---------------------------------------------------------------------------

const decided = (decision) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: "claudia",
  decidedAt: SENT_AT,
});
/** A decision document, as the arithmetic reads one. */
const decisionOf = (programmes, pooledOutcome = null, exception = null) => ({ programmes, pooledOutcome, exception });
const inviteTo = (programmeId) => ({ kind: "invite", programmeId, setByUid: "zach", setAt: SENT_AT });
const NO_OFFER = { kind: "no-offer", setByUid: "zach", setAt: SENT_AT };

const result = (kind, programmeId = null) => ({
  kind,
  programmeId,
  publishedAt: SENT_AT,
  email: "sent",
  emailedAt: SENT_AT,
  emailClaimedAt: null,
});
const invitation = (programmeId, response = null) => ({
  programmeId,
  replyBy: "2026-10-25",
  response,
  respondedAt: response ? NOW : null,
  lastReminderOn: null,
});
/** An application's own state. Sent, and not told, unless it says otherwise. */
const own = (over = {}) => ({ sent: {}, status: "submitted", result: null, invitation: null, attendance: null, ...over });

const NOTHING = { places: [], byInvitation: null, heldFor: null };
const holding = (ranked, decision, application) =>
  decisions.holdingOf({ uid: "u", ranked, decision, application }, ON_THE_FORM);

describe("who holds a place, one person at a time", () => {
  const acceptedByAgi = decisionOf({ [AGI]: decided("accept") });
  const pooledAndInvited = decisionOf({ [TAIS]: decided("pool") }, inviteTo(INC));

  describe("until they are told, the committee's pick is all there is", () => {
    for (const [name, application] of [
      ["with no application handed over", undefined],
      ["with an application nothing is published on", own()],
    ]) {
      test(`${name}: accepted by a lead holds the place`, () => {
        assert.deepEqual(holding([AGI, TAIS], acceptedByAgi, application), { places: [AGI], byInvitation: null, heldFor: null });
      });

      test(`${name}: a pooled person picked for an invitation has the place kept for them`, () => {
        assert.deepEqual(holding([TAIS], pooledAndInvited, application), { places: [], byInvitation: null, heldFor: INC });
      });

      test(`${name}: no offer, declined, undecided and nothing picked hold nothing`, () => {
        assert.deepEqual(holding([TAIS], decisionOf({ [TAIS]: decided("pool") }, NO_OFFER), application), NOTHING);
        assert.deepEqual(holding([TAIS], decisionOf({ [TAIS]: decided("decline") }), application), NOTHING);
        assert.deepEqual(holding([TAIS], null, application), NOTHING);
        assert.deepEqual(holding([TAIS], decisionOf({ [TAIS]: decided("pool") }), application), NOTHING);
      });

      test(`${name}: an invitation to a programme that has left the form keeps nothing`, () => {
        const gone = decisionOf({ [TAIS]: decided("pool") }, inviteTo("left-the-form"));
        assert.deepEqual(holding([TAIS], gone, application), NOTHING);
      });
    }

    test("an admin's exception is a second place", () => {
      const twice = decisionOf(
        { [AGI]: decided("accept"), [TAIS]: decided("accept") },
        null,
        { programmeIds: [TAIS], reason: "Facilitates one, takes the other.", setByUid: "zach", setAt: SENT_AT },
      );
      assert.deepEqual(holding([AGI, TAIS], twice, own()).places, [AGI, TAIS]);
      // Without the exception the lower choice's Accept is not a place.
      assert.deepEqual(holding([AGI, TAIS], decisionOf({ [AGI]: decided("accept"), [TAIS]: decided("accept") }), own()).places, [AGI]);
    });
  });

  describe("once they are told, their own application is asked", () => {
    test("told they are in, and still in the term: the place is theirs, coming or not yet said", () => {
      for (const attendance of [null, { answer: "coming", answeredAt: NOW }]) {
        const application = own({ status: "accepted", result: result("accepted", AGI), attendance });
        assert.deepEqual(holding([AGI], acceptedByAgi, application), { places: [AGI], byInvitation: null, heldFor: null });
      }
    });

    test("told they are in, and gave the place back: nothing, though the decision still says Accept", () => {
      const application = own({
        status: "withdrawn",
        result: result("accepted", AGI),
        attendance: { answer: "cant-make-it", answeredAt: NOW },
      });
      assert.deepEqual(holding([AGI], acceptedByAgi, application), NOTHING);
    });

    test("an exception's second place is still held after decision day, and both go when the person does", () => {
      const twice = decisionOf(
        { [AGI]: decided("accept"), [TAIS]: decided("accept") },
        null,
        { programmeIds: [TAIS], reason: "Both.", setByUid: "zach", setAt: SENT_AT },
      );
      const told = own({ status: "accepted", result: result("accepted", AGI) });
      assert.deepEqual(holding([AGI, TAIS], twice, told).places, [AGI, TAIS]);
      assert.deepEqual(holding([AGI, TAIS], twice, { ...told, status: "withdrawn" }), NOTHING);
    });

    test("invited, and not answered: the place is kept for them, and they hold none", () => {
      const application = own({ status: "invited", result: result("invited", INC), invitation: invitation(INC) });
      assert.deepEqual(holding([TAIS], pooledAndInvited, application), { places: [], byInvitation: null, heldFor: INC });
    });

    test("invited, and accepted: the place is theirs, and nothing is kept any more", () => {
      const application = own({ status: "accepted", result: result("invited", INC), invitation: invitation(INC, "accepted") });
      assert.deepEqual(holding([TAIS], pooledAndInvited, application), { places: [INC], byInvitation: INC, heldFor: null });
    });

    test("invited, and said no thanks: nothing held and nothing kept", () => {
      const application = own({ status: "withdrawn", result: result("invited", INC), invitation: invitation(INC, "declined") });
      assert.deepEqual(holding([TAIS], pooledAndInvited, application), NOTHING);
    });

    test("invited, accepted, and then could not make it: the place is free again", () => {
      const application = own({
        status: "withdrawn",
        result: result("invited", INC),
        invitation: invitation(INC, "accepted"),
        attendance: { answer: "cant-make-it", answeredAt: NOW },
      });
      assert.deepEqual(holding([TAIS], pooledAndInvited, application), NOTHING);
    });

    test("no offer and declined hold nothing", () => {
      const noOffer = own({ status: "no-offer", result: result("no-offer") });
      assert.deepEqual(holding([TAIS], decisionOf({ [TAIS]: decided("pool") }, NO_OFFER), noOffer), NOTHING);
      const declined = own({ status: "declined", result: result("declined") });
      assert.deepEqual(holding([TAIS], decisionOf({ [TAIS]: decided("decline") }), declined), NOTHING);
    });

    test("what they were told is what is read: a pick that no longer matches it changes nothing", () => {
      // The application says the invitation to the incubator was accepted.
      // A decision document that named another programme would not move the place.
      const application = own({ status: "accepted", result: result("invited", INC), invitation: invitation(INC, "accepted") });
      const elsewhere = decisionOf({ [TAIS]: decided("pool") }, inviteTo(AGI));
      assert.deepEqual(holding([TAIS], elsewhere, application), { places: [INC], byInvitation: INC, heldFor: null });
    });

    test("a result that says invited with no invitation beside it keeps the place it named", () => {
      const application = own({ status: "invited", result: result("invited", INC), invitation: null });
      assert.deepEqual(holding([TAIS], pooledAndInvited, application), { places: [], byInvitation: null, heldFor: INC });
    });

    test("an invitation to something that is not a programme on the form holds and keeps nothing", () => {
      for (const programmeId of ["left-the-form", "constructor", "__proto__", "toString"]) {
        for (const response of [null, "accepted"]) {
          const application = own({
            status: response ? "accepted" : "invited",
            result: result("invited", programmeId),
            invitation: invitation(programmeId, response),
          });
          assert.deepEqual(holding([TAIS], pooledAndInvited, application), NOTHING, `${programmeId}, ${response}`);
          assert.deepEqual(holding([TAIS], pooledAndInvited, { ...application, invitation: null }), NOTHING, programmeId);
        }
      }
    });

    test("an application that was never sent holds nothing, whatever is decided", () => {
      assert.deepEqual(holding([AGI], acceptedByAgi, own({ sent: null })), NOTHING);
    });
  });
});

// ---------------------------------------------------------------------------
// The sample term
// ---------------------------------------------------------------------------

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "",
  starts: "w/c 26 Oct",
  places: 4,
  groupCount: 1,
  groupSize: "Up to 8",
  leadUid: "claudia",
  reviewerUids: [],
  useScores: false,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});

const formWith = (over = {}) =>
  normalise.normaliseForm(ROUND, {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    invitationReplyBy: "2026-10-25",
    stageIds: [],
    availabilityGrid: GRID,
    reviewerUids: ["claudia"],
    finalDeciderUid: null,
    archived: false,
    authorUid: "zach",
    programmeIds: [AGI, TAIS, INC],
    programmes: {
      [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy" }),
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", places: 3 }),
      [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", places: 2 }),
    },
    questionSetIds: [],
    asksFacilitating: false,
    revealOtherReviews: true,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    ...over,
  });

/**
 * The people. `told` is what decision day published, and `reply` what they
 * have answered since.
 *
 *  - amara: accepted by AGI Strategy. Coming.
 *  - ben: accepted by AGI Strategy. Then: "I can't make it".
 *  - cleo: accepted by both fellowships, AGI Strategy first. Placed there.
 *  - dev: pooled by Technical AI Safety, invited to the incubator. Then: accepts.
 *  - eve: pooled by Technical AI Safety, invited to the incubator. No answer yet.
 *  - finn: pooled by AGI Strategy, invited to Technical AI Safety. Then: "No thanks".
 *  - gita: pooled by AGI Strategy, invited to Technical AI Safety. Accepts, then cannot make it.
 *  - hana: pooled by the incubator. No offer.
 */
const PEOPLE = [
  { uid: "amara", ranked: [AGI], decision: [{ [AGI]: decided("accept") }], told: ["accepted", AGI], reply: "coming" },
  { uid: "ben", ranked: [AGI], decision: [{ [AGI]: decided("accept") }], told: ["accepted", AGI], reply: "cant-make-it" },
  { uid: "cleo", ranked: [AGI, TAIS], decision: [{ [AGI]: decided("accept"), [TAIS]: decided("accept") }], told: ["accepted", AGI], reply: null },
  { uid: "dev", ranked: [TAIS], decision: [{ [TAIS]: decided("pool") }, inviteTo(INC)], told: ["invited", INC], reply: "accept-invitation" },
  { uid: "eve", ranked: [TAIS], decision: [{ [TAIS]: decided("pool") }, inviteTo(INC)], told: ["invited", INC], reply: null },
  { uid: "finn", ranked: [AGI], decision: [{ [AGI]: decided("pool") }, inviteTo(TAIS)], told: ["invited", TAIS], reply: "decline-invitation" },
  { uid: "gita", ranked: [AGI], decision: [{ [AGI]: decided("pool") }, inviteTo(TAIS)], told: ["invited", TAIS], reply: "accept-then-cant" },
  { uid: "hana", ranked: [INC], decision: [{ [INC]: decided("pool") }, NO_OFFER], told: ["no-offer", null], reply: null },
];

const DECISIONS = new Map(
  PEOPLE.map(({ uid, decision: [programmes, pooledOutcome = null] }) => [
    uid,
    normalise.normaliseDecision(`${ROUND}__${uid}`, { roundId: ROUND, uid, programmes, pooledOutcome, exception: null }),
  ]),
);

/** One stored application: `stage` is "decided" (nobody told), "told" or "replied". */
function application(person, stage) {
  const [kind, programmeId] = person.told;
  const told = stage !== "decided";
  const reply = stage === "replied" ? person.reply : null;
  const gone = reply === "cant-make-it" || reply === "decline-invitation" || reply === "accept-then-cant";
  const content = {
    aboutYou: {
      preferredName: person.uid,
      universityEmail: "someone@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    rankedProgrammeIds: person.ranked,
    wantsToFacilitate: null,
    answers: {},
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
  let status = "submitted";
  if (told) status = kind;
  if (reply === "accept-invitation") status = "accepted";
  if (gone) status = "withdrawn";
  const response =
    reply === "accept-invitation" || reply === "accept-then-cant" ? "accepted" : reply === "decline-invitation" ? "declined" : null;
  const answer = reply === "coming" ? "coming" : reply === "cant-make-it" || reply === "accept-then-cant" ? "cant-make-it" : null;
  return normalise.normaliseApplication(
    `${ROUND}__${person.uid}`,
    {
      formVersion: 2,
      roundId: ROUND,
      uid: person.uid,
      email: `${person.uid}@example.com`,
      displayName: person.uid,
      draft: content,
      sent: content,
      status,
      submittedAt: SENT_AT,
      sentAt: SENT_AT,
      withdrawnAt: gone ? NOW : null,
      result: told ? result(kind, programmeId) : null,
      invitation: told && kind === "invited" ? invitation(programmeId, response) : null,
      attendance: answer ? { answer, answeredAt: NOW } : null,
      createdAt: SENT_AT,
      updatedAt: SENT_AT,
    },
    GRID,
  );
}

const termAt = (stage) => PEOPLE.map((person) => application(person, stage));
const rankedOf = (entry) => entry.sent.rankedProgrammeIds;

/** [who holds a place, kept for an invitation, left], per programme, from a tally. */
const placesIn = (form, tally) =>
  Object.fromEntries(
    [AGI, TAIS, INC].map((programmeId) => [
      programmeId,
      [tally.programmes[programmeId].placed, tally.programmes[programmeId].invited, decisions.freePlaces(form, tally, programmeId)],
    ]),
  );

// ---------------------------------------------------------------------------
// 2. Before decision day nothing changes
// ---------------------------------------------------------------------------

describe("before decision day the numbers are what the decisions alone give", () => {
  const FORM = formWith();
  const applications = termAt("decided");

  /** The arithmetic as it was: places from `placesHeld`, invitations from `outcomeFor`. */
  function byTheDecisionsAlone() {
    const places = Object.fromEntries([AGI, TAIS, INC].map((programmeId) => [programmeId, { placed: 0, invited: 0 }]));
    for (const entry of applications) {
      const decision = DECISIONS.get(entry.uid) ?? null;
      for (const programmeId of decisions.placesHeld(rankedOf(entry), decision)) places[programmeId].placed += 1;
      const outcome = decisions.outcomeFor(rankedOf(entry), decision, ON_THE_FORM);
      if (outcome.kind === "invited") places[outcome.programmeId].invited += 1;
    }
    return places;
  }

  const tallyOf = (withApplication) =>
    decisions.tallyTerm(
      FORM,
      applications.map((entry) => ({
        uid: entry.uid,
        ranked: rankedOf(entry),
        decision: DECISIONS.get(entry.uid) ?? null,
        ...(withApplication ? { application: entry } : {}),
      })),
    );

  test("with the application handed over or without it, the tally is the same tally", () => {
    assert.deepEqual(tallyOf(true), tallyOf(false));
  });

  test("and it is the count the decisions alone give", () => {
    const tally = tallyOf(true);
    const expected = byTheDecisionsAlone();
    for (const programmeId of [AGI, TAIS, INC]) {
      assert.equal(tally.programmes[programmeId].placed, expected[programmeId].placed, `${programmeId} placed`);
      assert.equal(tally.programmes[programmeId].invited, expected[programmeId].invited, `${programmeId} invited`);
      assert.equal(tally.programmes[programmeId].joined, 0, `${programmeId}: nobody has accepted an invitation yet`);
    }
    // AGI Strategy: amara, ben and cleo. Technical AI Safety: two places kept. The incubator: two kept.
    assert.deepEqual(placesIn(FORM, tally), { [AGI]: [3, 0, 1], [TAIS]: [0, 2, 1], [INC]: [0, 2, 0] });
  });

  test("being told changes no number until somebody answers", () => {
    const told = termAt("told");
    const tally = decisions.tallyTerm(
      FORM,
      told.map((entry) => ({ uid: entry.uid, ranked: rankedOf(entry), decision: DECISIONS.get(entry.uid) ?? null, application: entry })),
    );
    assert.deepEqual(tally, tallyOf(true));
  });
});

// ---------------------------------------------------------------------------
// 3. After the replies, every screen that counts places
// ---------------------------------------------------------------------------

const SENT_FORM = formWith({ decisionsSentAt: SENT_AT, decisionsSentByUid: "zach" });
const REPLIED = termAt("replied");
const ADMIN = { uid: "zach", name: "Zach", isAdmin: true, roles: { [AGI]: "admin", [TAIS]: "admin", [INC]: "admin" } };

/**
 * A recount from the applications alone. After decision day everything about
 * a place but an admin's exception is on the person's own document.
 */
function recount(applications, form) {
  const inTerm = applications.filter((entry) => entry.sent && entry.status !== "withdrawn");
  return Object.fromEntries(
    [AGI, TAIS, INC].map((programmeId) => {
      const here = inTerm.filter((entry) => entry.result?.programmeId === programmeId);
      const joined = here.filter((entry) => entry.result.kind === "invited" && entry.invitation?.response === "accepted").length;
      const placed = here.filter((entry) => entry.result.kind === "accepted").length + joined;
      const invited = here.filter((entry) => entry.result.kind === "invited" && !entry.invitation?.response).length;
      return [programmeId, [placed, invited, form.programmes[programmeId].places - placed - invited]];
    }),
  );
}

describe("after the replies, every screen counts the same places", () => {
  const picture = reviewTerm.termPictureFor({
    form: SENT_FORM,
    applications: REPLIED,
    decisions: DECISIONS,
    reviews: [],
    viewerUid: "zach",
  });
  const EXPECTED = { [AGI]: [2, 0, 2], [TAIS]: [0, 0, 3], [INC]: [1, 1, 0] };

  test("the sample term is what its comment says, and a recount of the applications agrees", () => {
    // AGI Strategy: amara and cleo (ben gave his back). Technical AI Safety:
    // nobody (cleo is placed on her first choice, finn said no, gita could
    // not make it). The incubator: dev is in, and a place is kept for eve.
    assert.deepEqual(recount(REPLIED, SENT_FORM), EXPECTED);
  });

  test("the review list's picture", () => {
    assert.deepEqual(placesIn(SENT_FORM, picture.tally), EXPECTED);
    assert.equal(picture.tally.programmes[INC].joined, 1);
    assert.equal(picture.tally.programmes[TAIS].joined, 0);
  });

  test("the head of each programme's list, which the term page's card repeats", () => {
    for (const programmeId of [AGI, TAIS, INC]) {
      const board = reviewBoard.buildProgrammeBoard({
        form: SENT_FORM,
        sets: [],
        term: picture,
        viewer: ADMIN,
        programmeId,
        canDecide: true,
        pendingUids: new Set(),
        staffNames: new Map(),
      });
      assert.deepEqual(
        [board.progress.placed, board.progress.invited, board.progress.placesLeft],
        EXPECTED[programmeId],
        programmeId,
      );
    }
  });

  test("the decision-day plan, which pooled applicants and the send are built on", () => {
    const term = plan.planTerm(SENT_FORM, REPLIED, DECISIONS);
    assert.deepEqual(placesIn(SENT_FORM, term.tally), EXPECTED);
    assert.deepEqual(term.tally, picture.tally, "one arithmetic");
  });

  test("the editor's tally of the term", async () => {
    globalThis.__places = { applications: REPLIED, decisions: DECISIONS };
    assert.deepEqual(placesIn(SENT_FORM, await editorLoad.loadTermTally({}, SENT_FORM)), EXPECTED);
  });

  test("a place is never counted twice: taken and kept are different people", () => {
    for (const programmeId of [AGI, TAIS, INC]) {
      const [placed, invited, left] = EXPECTED[programmeId];
      assert.equal(placed + invited + left, SENT_FORM.programmes[programmeId].places, programmeId);
    }
  });

  test("the decisions alone would have said otherwise, which is the fault this closes", () => {
    const blind = decisions.tallyTerm(
      SENT_FORM,
      REPLIED.filter(decisions.isInTerm).map((entry) => ({
        uid: entry.uid,
        ranked: rankedOf(entry),
        decision: DECISIONS.get(entry.uid) ?? null,
      })),
    );
    // Dev is in the incubator, and without his application he is a place still kept.
    assert.deepEqual([blind.programmes[INC].placed, blind.programmes[INC].invited], [0, 2]);
  });
});

// ---------------------------------------------------------------------------
// The tree: every caller of the arithmetic hands the application over
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const rel = (path) => relative(SRC, path).split(sep).join("/");

/**
 * Every file that calls `tallyTerm`, with the test above that runs it over
 * the sample term. Each of those tests fails for a caller that hands the
 * arithmetic an applicant without its application: the last test of that
 * group shows the numbers such a caller would get. A new caller is added
 * here and to that group.
 */
const CALLERS = {
  "lib/applications/decisionDay/plan.ts": "planTerm, checked above as the decision-day plan",
  "lib/applications/editor/load.ts": "loadTermTally, checked above as the editor's tally",
  "lib/applications/review/term.ts": "termPictureFor, checked above as the review list's picture and each list's head",
};

describe("every caller of the arithmetic hands the application over", () => {
  const found = walk(SRC)
    .filter((path) => rel(path) !== "lib/applications/decisions.ts")
    .filter((path) => /\btallyTerm\(/.test(stripSource(readFileSync(path, "utf8"))))
    .map(rel)
    .sort();

  test("the callers are the ones this file runs", () => {
    assert.deepEqual(found, Object.keys(CALLERS).sort());
  });

  test("nothing outside the contract counts a place from the decisions on its own", () => {
    // `placesHeld` answers for the decisions alone. Outside `decisions.ts` it
    // is asked only by the pooled-outcome writer, about somebody not yet told.
    const askers = walk(SRC)
      .filter((path) => /\bplacesHeld\(/.test(stripSource(readFileSync(path, "utf8"))))
      .map(rel)
      .sort();
    assert.deepEqual(askers, ["lib/applications/decisionDay/plan.ts", "lib/applications/decisions.ts"]);
  });
});
