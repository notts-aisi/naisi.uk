/**
 * A FREED PLACE, AS THE PERSON IT IS OFFERED TO AND EVERY COUNT OF PLACES
 * READ IT.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * After decision day an admin can offer a place somebody gave back to a
 * pooled applicant who was told "No offer this time" and who ranked the
 * programme (`src/lib/applications/freedPlaces/`). The offer is written as an
 * `invitation` beside the person's result, and the result stays what decision
 * day said. From then on it is decision day's invitation in every way that
 * matters:
 *
 *  1. WHERE THEY STAND (`standingOf`) is an invitation until they answer, a
 *     place once they accept, and a place given back once they say no
 *     thanks, read exactly as decision day's own. An invitation beside a
 *     DECLINED result is never read: nothing offers a place to somebody
 *     every programme declined.
 *  2. WHAT A REPLY DOES (`decideReply`) is decision day's table: Accept turns
 *     it into a place, No thanks gives it back, and the reply-by day is not a
 *     wall unless the one switch says so.
 *  3. EVERY COUNT OF PLACES (`holdingOf`, `tallyTerm`, `freePlaces`) keeps the
 *     place while the offer is unanswered and counts it as held once it is
 *     accepted, WITHOUT counting the person twice on a programme they ranked.
 *  4. AN ACCEPTANCE APPROVES A WAITING ACCOUNT (`holdsAcceptance`), as decision
 *     day's does.
 *  5. THE PAGE AND THE LIST say "Invitation", and the card's first sentence is
 *     the offer's own: decision day's "a great fit instead" is untrue of a
 *     programme they ranked.
 *  6. THE RECORD KEPT WHEN THE TERM SETTLES says both: no offer, then invited.
 *
 * Everything under test is the shipping module. The stubs are `server-only`,
 * `next/link` (an anchor), the router and the stylesheets.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

globalThis.__freedPerson = { h: createElement };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__freedPerson.h('a', { href, className }, children);"],
    ["next/navigation", "export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });"],
    ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
    ["./status.module.css", CLASS_NAMES],
    // `approve.ts` writes through the Admin SDK in its transaction, which no
    // test here runs: only its pure predicate is asked.
    ["firebase-admin/firestore", "export const FieldValue = {}; export class Timestamp {}"],
  ]),
});

const lib = (...parts) => loadTs(join("lib", "applications", ...parts));
const standing = await lib("status", "standing.ts");
const replies = await lib("status", "replies.ts");
const statusWords = await lib("status", "words.ts");
const view = await lib("status", "view.ts");
const decisions = await lib("decisions.ts");
const approve = await lib("accounts", "approve.ts");
const normalise = await lib("normalise.ts");
const project = await lib("applicant", "project.ts");
const records = await loadTs(join("lib", "firestore", "memberRecords.ts"));
const { default: StatusPage } = await loadTs(join("features", "applications", "status", "StatusPage.tsx"));

const ROUND = "autumn-2026__fr33dp1c";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";
const REPLY_BY = "2026-10-29";
const ON_THE_DAY = "2026-10-29";
const DAY_AFTER = "2026-10-30";
const TOLD_AT = new Date("2026-10-26T09:00:00Z");

// ---------------------------------------------------------------------------
// Every state a freed place can be in, beside decision day's own
// ---------------------------------------------------------------------------

/** Told "No offer this time", then offered a freed place on AGI Strategy. */
const freed = (response = null, more = {}) => ({
  status: response === "accepted" ? "accepted" : response === "declined" ? "withdrawn" : "invited",
  result: { kind: "no-offer", programmeId: null },
  invitation: { programmeId: AGI, replyBy: REPLY_BY, response },
  attendance: null,
  ...more,
});

const STATES = {
  "offered a freed place, not answered": freed(),
  "accepted a freed place": freed("accepted"),
  "accepted a freed place, then gave it back": freed("accepted", {
    status: "withdrawn",
    attendance: { answer: "cant-make-it" },
  }),
  "said no thanks to a freed place": freed("declined"),
  "offered a freed place, then withdrawn by somebody else": freed(null, { status: "withdrawn" }),
  "no offer, and nothing offered since": {
    status: "no-offer",
    result: { kind: "no-offer", programmeId: null },
    invitation: null,
    attendance: null,
  },
  "declined, with an invitation beside it that nothing writes": {
    status: "invited",
    result: { kind: "declined", programmeId: null },
    invitation: { programmeId: AGI, replyBy: REPLY_BY, response: null },
    attendance: null,
  },
};

describe("where somebody offered a freed place stands", () => {
  const EXPECTED = {
    "offered a freed place, not answered": { kind: "invitation", programmeId: AGI, replyBy: REPLY_BY },
    "accepted a freed place": { kind: "place", via: "invitation", programmeId: AGI, saidComing: true },
    "accepted a freed place, then gave it back": {
      kind: "released",
      via: "invitation",
      programmeId: AGI,
      how: "cant-make-it",
    },
    "said no thanks to a freed place": { kind: "released", via: "invitation", programmeId: AGI, how: "no-thanks" },
    "offered a freed place, then withdrawn by somebody else": { kind: "withdrawn" },
    "no offer, and nothing offered since": { kind: "no-place" },
    "declined, with an invitation beside it that nothing writes": { kind: "no-place" },
  };

  test("the table names every state", () => {
    assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(STATES).sort());
  });

  for (const [name, state] of Object.entries(STATES)) {
    test(name, () => assert.deepEqual(standing.standingOf(state), EXPECTED[name]));
  }

  test("it is read exactly as decision day's invitation is, state for state", () => {
    // The same invitation beside an invitation result: only the result differs.
    for (const name of [
      "offered a freed place, not answered",
      "accepted a freed place",
      "accepted a freed place, then gave it back",
      "said no thanks to a freed place",
      "offered a freed place, then withdrawn by somebody else",
    ]) {
      const state = STATES[name];
      const decisionDays = { ...state, result: { kind: "invited", programmeId: AGI } };
      assert.deepEqual(standing.standingOf(state), standing.standingOf(decisionDays), name);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What a reply does
// ---------------------------------------------------------------------------

describe("what a reply does to a freed place", () => {
  const offered = STATES["offered a freed place, not answered"];

  test("Accept makes it a place, and is the reply that takes one", () => {
    assert.deepEqual(replies.decideReply(offered, "accept-invitation", ON_THE_DAY), {
      kind: "write",
      attendance: null,
      invitationResponse: "accepted",
      status: "accepted",
      releases: false,
      takesPlace: true,
    });
  });

  test("No thanks gives it back", () => {
    assert.deepEqual(replies.decideReply(offered, "decline-invitation", ON_THE_DAY), {
      kind: "write",
      attendance: null,
      invitationResponse: "declined",
      status: "withdrawn",
      releases: true,
      takesPlace: false,
    });
  });

  test("the two replies of somebody with a place are refused until it is answered", () => {
    for (const reply of ["coming", "cant-make-it"]) {
      assert.deepEqual(replies.decideReply(offered, reply, ON_THE_DAY), {
        kind: "refused",
        error: replies.REPLY_REFUSALS.invitationFirst,
      });
    }
  });

  test("a late yes still counts, as decision day's does, unless the one switch makes the day a wall", () => {
    // Decision day's soft rule, kept on purpose: the board's email says
    // "Please accept by", draws no wall, and the window closing stops offers,
    // not replies. A place kept for somebody is handed to nobody else.
    assert.equal(replies.REPLY_BY_IS_A_DEADLINE, false);
    assert.equal(replies.decideReply(offered, "accept-invitation", DAY_AFTER).kind, "write");
    assert.deepEqual(replies.decideReply(offered, "accept-invitation", DAY_AFTER, true), {
      kind: "refused",
      error: replies.lateInvitationRefusal(REPLY_BY),
    });
    assert.equal(replies.decideReply(offered, "decline-invitation", DAY_AFTER, true).kind, "write");
  });

  test("once accepted it is a place like any other: saying yes again changes nothing, and the way out is I can't make it", () => {
    const placed = STATES["accepted a freed place"];
    assert.deepEqual(replies.decideReply(placed, "accept-invitation", ON_THE_DAY), { kind: "unchanged" });
    assert.deepEqual(replies.decideReply(placed, "decline-invitation", ON_THE_DAY), {
      kind: "refused",
      error: replies.REPLY_REFUSALS.alreadyAccepted,
    });
    assert.equal(replies.decideReply(placed, "cant-make-it", ON_THE_DAY).releases, true);
  });

  test("a freed place given back stays given back", () => {
    for (const name of ["said no thanks to a freed place", "accepted a freed place, then gave it back"]) {
      assert.deepEqual(replies.decideReply(STATES[name], "accept-invitation", ON_THE_DAY), {
        kind: "refused",
        error: replies.REPLY_REFUSALS.gaveBack,
      });
    }
  });

  test("somebody with no offer, and an invitation beside a declined result, still have nothing to answer", () => {
    for (const name of ["no offer, and nothing offered since", "declined, with an invitation beside it that nothing writes"]) {
      assert.deepEqual(replies.decideReply(STATES[name], "accept-invitation", ON_THE_DAY), {
        kind: "refused",
        error: replies.REPLY_REFUSALS.noPlace,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Every count of places
// ---------------------------------------------------------------------------

const FORM = { programmeIds: [TAIS, AGI, INCUBATOR], programmes: { [AGI]: { places: 3 }, [TAIS]: { places: 2 }, [INCUBATOR]: { places: 4 } } };
const accept = { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: null };
const pool = { ...accept, decision: "pool", poolReason: "capacity" };

const sentApplication = (ranked, state) => ({
  sent: { rankedProgrammeIds: ranked },
  ...state,
});

/** One person in the term: AGI Strategy's own, accepted and holding. */
const HOLDER = {
  uid: "amara",
  ranked: [AGI],
  decision: { programmes: { [AGI]: accept }, pooledOutcome: null, exception: null },
  application: sentApplication([AGI], {
    status: "accepted",
    result: { kind: "accepted", programmeId: AGI },
    invitation: null,
    attendance: null,
  }),
};

/** Pooled by AGI Strategy, told no offer, in a given freed state. */
const pooledPerson = (state) => ({
  uid: "omar",
  ranked: [AGI, TAIS],
  decision: {
    programmes: { [AGI]: pool, [TAIS]: pool },
    pooledOutcome: { kind: "no-offer", setByUid: "zach", setAt: null },
    exception: null,
  },
  application: sentApplication([AGI, TAIS], state),
});

const tallyOf = (people) =>
  decisions.tallyTerm(
    FORM,
    people.filter((person) => decisions.isInTerm(person.application)),
  );

describe("every count of places", () => {
  test("an unanswered freed place keeps the place it was offered, and holds none", () => {
    const tally = tallyOf([HOLDER, pooledPerson(STATES["offered a freed place, not answered"])]);
    assert.equal(tally.programmes[AGI].placed, 1);
    assert.equal(tally.programmes[AGI].invited, 1, "the place is kept for the invitation");
    assert.equal(decisions.freePlaces(FORM, tally, AGI), 1);
  });

  test("an accepted one is held, and the person is counted once on a programme they ranked", () => {
    const tally = tallyOf([HOLDER, pooledPerson(STATES["accepted a freed place"])]);
    assert.equal(tally.programmes[AGI].placed, 2);
    assert.equal(tally.programmes[AGI].invited, 0);
    // `joined` is somebody on the list by an invitation alone. A freed place
    // is on a programme they ranked, so they are among its applications by
    // their ranking already: counting them as joined would count them twice.
    assert.equal(tally.programmes[AGI].joined, 0);
    assert.equal(tally.programmes[AGI].applications, 2);
    assert.equal(decisions.freePlaces(FORM, tally, AGI), 1);
    // The lead's own Pool still stands as the record of the lead's decision.
    assert.equal(tally.programmes[AGI].pooled, 1);
  });

  test("decision day's own joiner, who did not rank the programme, is still counted as joined", () => {
    const invitedToAgi = {
      uid: "ines",
      ranked: [TAIS],
      decision: {
        programmes: { [TAIS]: pool },
        pooledOutcome: { kind: "invite", programmeId: AGI, setByUid: "zach", setAt: null },
        exception: null,
      },
      application: sentApplication([TAIS], {
        status: "accepted",
        result: { kind: "invited", programmeId: AGI },
        invitation: { programmeId: AGI, replyBy: REPLY_BY, response: "accepted" },
        attendance: null,
      }),
    };
    const tally = tallyOf([HOLDER, invitedToAgi]);
    assert.equal(tally.programmes[AGI].joined, 1);
    assert.equal(tally.programmes[AGI].placed, 2);
  });

  test("a freed place said no to, or given back, is free again", () => {
    for (const name of ["said no thanks to a freed place", "accepted a freed place, then gave it back"]) {
      const tally = tallyOf([HOLDER, pooledPerson(STATES[name])]);
      assert.equal(decisions.freePlaces(FORM, tally, AGI), 2, name);
    }
  });

  test("holdingOf names the place, the way it was come by, and what is kept", () => {
    const invitable = new Set(FORM.programmeIds);
    const of = (name) => decisions.holdingOf(pooledPerson(STATES[name]), invitable);
    assert.deepEqual(of("offered a freed place, not answered"), { places: [], byInvitation: null, heldFor: AGI });
    assert.deepEqual(of("accepted a freed place"), { places: [AGI], byInvitation: AGI, heldFor: null });
    assert.deepEqual(of("no offer, and nothing offered since"), { places: [], byInvitation: null, heldFor: null });
  });
});

// ---------------------------------------------------------------------------
// 4. An acceptance approves a waiting account
// ---------------------------------------------------------------------------

describe("an accepted freed place is an acceptance", () => {
  const withSent = (state) => ({ sent: {}, ...state });

  test("accepted, it approves a waiting account as decision day's does; otherwise it does not", () => {
    const answer = Object.fromEntries(
      Object.entries(STATES).map(([name, state]) => [name, approve.holdsAcceptance(withSent(state))]),
    );
    assert.deepEqual(answer, {
      "offered a freed place, not answered": false,
      "accepted a freed place": true,
      "accepted a freed place, then gave it back": false,
      "said no thanks to a freed place": false,
      "offered a freed place, then withdrawn by somebody else": false,
      "no offer, and nothing offered since": false,
      "declined, with an invitation beside it that nothing writes": false,
    });
  });

  test("decision day's own acceptances read as they always did", () => {
    const own = (result, more = {}) => withSent({ status: "accepted", result, invitation: null, attendance: null, ...more });
    assert.equal(approve.holdsAcceptance(own({ kind: "accepted", programmeId: AGI })), true);
    assert.equal(
      approve.holdsAcceptance(own({ kind: "accepted", programmeId: AGI }, { attendance: { answer: "cant-make-it" } })),
      false,
    );
    assert.equal(
      approve.holdsAcceptance(
        own({ kind: "invited", programmeId: AGI }, { invitation: { programmeId: AGI, replyBy: REPLY_BY, response: "accepted" } }),
      ),
      true,
    );
    assert.equal(approve.holdsAcceptance(own({ kind: "invited", programmeId: AGI })), false);
    assert.equal(approve.holdsAcceptance(null), false);
  });
});

// ---------------------------------------------------------------------------
// 5. The person's own page, and the list of their applications
// ---------------------------------------------------------------------------

const programmeSettings = (kind, name, shortName) => ({
  kind,
  name,
  shortName,
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 3,
  leadUid: "claudia",
  reviewerUids: [],
  useScores: true,
  closed: false,
});

const STORED_FORM = normalise.normaliseForm(ROUND, {
  formVersion: 2,
  label: "Autumn 2026",
  status: "deciding",
  opensAt: new Date("2026-10-06T09:00:00+01:00"),
  closesAt: new Date("2026-10-18T23:59:00+01:00"),
  decisionsByDate: "2026-10-26",
  programmeIds: [TAIS, AGI, INCUBATOR],
  programmes: {
    [TAIS]: programmeSettings("fellowship", "Technical AI Safety Fellowship", "Technical AI Safety"),
    [AGI]: programmeSettings("fellowship", "AGI Strategy Fellowship", "AGI Strategy"),
    [INCUBATOR]: programmeSettings("incubator", "Research Incubator", "Research incubator"),
  },
  questionSetIds: [],
  decisionsSentAt: TOLD_AT,
  decisionsSentByUid: "zach",
});

const NOW = new Date("2026-10-28T12:00:00Z");
const TODAY = "2026-10-28";

/** The person's own application, stored, in a given state, as their page reads it. */
const storedApplication = (state) =>
  project.projectApplicationForOwner(
    normalise.normaliseApplication(`${ROUND}__omar`, {
      formVersion: 2,
      roundId: ROUND,
      uid: "omar",
      email: "omar@example.com",
      displayName: "Omar Haddad",
      draft: { rankedProgrammeIds: [AGI, TAIS] },
      sent: { aboutYou: { preferredName: "Omar" }, rankedProgrammeIds: [AGI, TAIS] },
      submittedAt: new Date("2026-10-09T14:20:00+01:00"),
      sentAt: new Date("2026-10-09T14:20:00+01:00"),
      ...state,
      result: state.result ? { ...state.result, publishedAt: TOLD_AT, email: "sent" } : null,
      freedPlace: state.result?.kind === "no-offer" && state.invitation
        ? { groupId: "group-c", offeredAt: TOLD_AT, email: "sent", emailedAt: TOLD_AT }
        : undefined,
    }),
  );

const viewOf = (state) =>
  view.statusViewFor(project.projectFormForApplicant(STORED_FORM, NOW), [], storedApplication(state), TODAY);

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const pageOf = (state) =>
  textOf(renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view: viewOf(state), viewingAs: false })));

describe("the person's own page", () => {
  test("nothing the committee keeps about the offer reaches the person", () => {
    const sent = storedApplication(STATES["offered a freed place, not answered"]);
    assert.equal("freedPlace" in sent, false, "the offer's own record is the committee's");
    assert.equal(JSON.stringify(sent).includes("group-c"), false);
  });

  test("an unanswered freed place is decision day's invitation card, marked as a freed place", () => {
    const shown = viewOf(STATES["offered a freed place, not answered"]);
    assert.equal(shown.kind, "invitation");
    assert.equal(shown.freed, true);
    assert.equal(shown.programme.shortName, "AGI Strategy");
    assert.equal(shown.replyByLabel, "Thu 29 Oct");
    assert.equal(shown.canAccept, true);
  });

  test("decision day's own invitation is not marked", () => {
    const shown = viewOf({ ...STATES["offered a freed place, not answered"], result: { kind: "invited", programmeId: AGI } });
    assert.equal(shown.kind, "invitation");
    assert.equal(shown.freed, false);
  });

  test("the card says what happened, in the offer's own words, and offers decision day's Accept and No thanks", () => {
    const page = pageOf(STATES["offered a freed place, not answered"]);
    assert.ok(page.includes("You’re invited to AGI Strategy."), page);
    assert.ok(
      page.includes("On Mon 26 Oct we couldn’t offer you a place this term. Someone has given theirs back, and we’d love you to have it."),
      page,
    );
    assert.ok(page.includes("Accept your invitation by Thu 29 Oct to let us know you’re coming."), page);
    assert.ok(page.includes("Accept your invitation"), page);
    assert.ok(page.includes("No thanks"), page);
    // Decision day's sentence is about a programme they did not pick.
    assert.equal(page.includes("instead"), false, page);
    assert.equal(page.includes("The pool was really strong"), false, page);
  });

  test("once accepted it is the accepted card decision day's joiners read", () => {
    const shown = viewOf(STATES["accepted a freed place"]);
    assert.deepEqual([shown.kind, shown.via, shown.programme.shortName], ["place", "invitation", "AGI Strategy"]);
    const page = pageOf(STATES["accepted a freed place"]);
    assert.ok(page.includes("You’ve accepted your invitation."), page);
    assert.ok(page.includes("You’re in AGI Strategy"), page);
  });

  test("said no thanks, it reads as an invitation turned down", () => {
    const page = pageOf(STATES["said no thanks to a freed place"]);
    assert.ok(page.includes("You said no thanks to AGI Strategy."), page);
  });

  test("the list of their applications says what the page says, and nothing about the offer it does not", () => {
    const list = (name) => statusWords.listWordsFor(viewOf(STATES[name]));
    assert.deepEqual(list("offered a freed place, not answered"), {
      chip: "Invitation",
      tone: "accent",
      sentence: "You’re invited to AGI Strategy.",
    });
    assert.deepEqual(list("accepted a freed place"), {
      chip: "Accepted",
      tone: "success",
      sentence: "You’re in AGI Strategy.",
    });
    assert.deepEqual(list("said no thanks to a freed place"), {
      chip: "Invitation turned down",
      tone: "neutral",
      sentence: "You said no thanks to AGI Strategy.",
    });
    assert.deepEqual(list("no offer, and nothing offered since"), {
      chip: "No place this term",
      tone: "neutral",
      sentence: "We can’t offer you a place this term.",
    });
  });
});

// ---------------------------------------------------------------------------
// 6. The record kept when the term settles
// ---------------------------------------------------------------------------

describe("the record kept when the term settles", () => {
  const recordFields = normalise.normaliseFormFields({
    formVersion: 2,
    programmeIds: [AGI, TAIS],
    programmes: {
      [AGI]: { kind: "fellowship", name: "AGI Strategy Fellowship", shortName: "AGI Strategy", runId: "run-agi" },
      [TAIS]: { kind: "fellowship", name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety" },
    },
    questionSetIds: [],
  });
  const recordOf = (state) =>
    records.buildFormApplicationRecord({
      round: { id: ROUND, label: "Autumn 2026", kind: "enrolment" },
      form: recordFields,
      sets: [],
      application: normalise.normaliseApplication(`${ROUND}__omar`, {
        formVersion: 2,
        roundId: ROUND,
        uid: "omar",
        displayName: "Omar Haddad",
        draft: { rankedProgrammeIds: [AGI] },
        sent: { rankedProgrammeIds: [AGI] },
        ...state,
        result: { ...state.result, publishedAt: TOLD_AT },
      }),
      reviews: [],
      reviewerNames: {},
      writtenBy: "settle",
      writtenByUid: "zach",
    }).outcome;

  test("an accepted freed place is recorded as no offer, then invited, with the run it places people on", () => {
    assert.deepEqual(recordOf(STATES["accepted a freed place"]), {
      decision: "no-offer, then invited (AGI Strategy)",
      status: "accepted",
      targetRunId: "run-agi",
    });
  });

  test("one said no to keeps the same decision, and the status says they left", () => {
    assert.deepEqual(recordOf(STATES["said no thanks to a freed place"]), {
      decision: "no-offer, then invited (AGI Strategy)",
      status: "withdrawn",
      targetRunId: "run-agi",
    });
  });

  test("no offer with nothing since, and a declined result, are recorded as they always were", () => {
    assert.deepEqual(recordOf(STATES["no offer, and nothing offered since"]), {
      decision: "no-offer",
      status: "no-offer",
      targetRunId: null,
    });
    assert.deepEqual(recordOf(STATES["declined, with an invitation beside it that nothing writes"]), {
      decision: "declined",
      status: "invited",
      targetRunId: null,
    });
  });
});
