/**
 * What decision day told somebody, what they can answer, and what each answer
 * does.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rules this guards
 *
 *  - WHERE SOMEBODY STANDS is read off their own application: a place, an
 *    invitation not yet answered, a place given back, a kind no. Every
 *    combination of result, reply and status is run, and every one has an
 *    answer.
 *  - WHAT A REPLY DOES. All four replies are put to every standing. Each
 *    pair is a write, a no-op or a refusal in a sentence, and the table here
 *    is the whole of it: a place given back cannot be taken again from the
 *    page, a reply said twice is said once, and a reply that does not belong
 *    to the application is refused.
 *  - THE REPLY-BY DAY is shown and is not a wall, unless the one switch says
 *    it is. Both settings are run, on the day and the day after.
 *  - A PLACE GIVEN BACK IS FREE. The application leaves the term's count the
 *    way the decision-day screens already count, so the programme's free
 *    places go up by one without those screens knowing about replies.
 *  - THE WORDS are the boards', and somebody every programme declined reads
 *    exactly what somebody with no offer reads.
 *
 * Everything under test is the shipping module. The only stub is
 * `server-only`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCREEN_DIR = join(REPO_ROOT, "src", "features", "applications", "status");
const RULES_DIR = join(REPO_ROOT, "src", "lib", "applications", "status");

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const at = (file) => join("lib", "applications", "status", file);

const standing = await loadTs(at("standing.ts"));
const replies = await loadTs(at("replies.ts"));
const view = await loadTs(at("view.ts"));
const shape = await loadTs(join("lib", "applications", "applicant", "shape.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const decisions = await loadTs(join("lib", "applications", "decisions.ts"));
const plan = await loadTs(join("lib", "applications", "decisionDay", "plan.ts"));
const words = await loadTs(join("lib", "applications", "words.ts"));

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";
const REPLY_BY = "2026-10-25";
const ON_THE_DAY = "2026-10-25";
const DAY_AFTER = "2026-10-26";

// ---------------------------------------------------------------------------
// Every state an application can be in after decision day
// ---------------------------------------------------------------------------

const accepted = (more = {}) => ({
  status: "accepted",
  result: { kind: "accepted", programmeId: AGI },
  invitation: null,
  attendance: null,
  ...more,
});
const invited = (response = null, more = {}) => ({
  status: response === "accepted" ? "accepted" : response === "declined" ? "withdrawn" : "invited",
  result: { kind: "invited", programmeId: TAIS },
  invitation: { programmeId: TAIS, replyBy: REPLY_BY, response },
  attendance: null,
  ...more,
});

/** Each state by a name a failure can be read by. */
const STATES = {
  "nothing published": { status: "submitted", result: null, invitation: null, attendance: null },
  "a draft": { status: "draft", result: null, invitation: null, attendance: null },
  "withdrawn before decision day": { status: "withdrawn", result: null, invitation: null, attendance: null },
  "placed, nothing said": accepted(),
  "placed, said coming": accepted({ attendance: { answer: "coming" } }),
  "placed, gave it back": accepted({ status: "withdrawn", attendance: { answer: "cant-make-it" } }),
  "placed, then withdrawn by somebody else": accepted({ status: "withdrawn" }),
  "invited, not answered": invited(),
  "invited, accepted": invited("accepted"),
  "invited, accepted, then gave it back": invited("accepted", { status: "withdrawn", attendance: { answer: "cant-make-it" } }),
  "invited, said no thanks": invited("declined"),
  "invited, then withdrawn by somebody else": invited(null, { status: "withdrawn" }),
  "invited with no invitation beside it": { status: "invited", result: { kind: "invited", programmeId: TAIS }, invitation: null, attendance: null },
  "no offer": { status: "no-offer", result: { kind: "no-offer", programmeId: null }, invitation: null, attendance: null },
  declined: { status: "declined", result: { kind: "declined", programmeId: null }, invitation: null, attendance: null },
};

describe("where somebody stands, from their own application", () => {
  const EXPECTED = {
    "nothing published": { kind: "waiting" },
    "a draft": { kind: "waiting" },
    "withdrawn before decision day": { kind: "withdrawn" },
    "placed, nothing said": { kind: "place", via: "ranking", programmeId: AGI, saidComing: false },
    "placed, said coming": { kind: "place", via: "ranking", programmeId: AGI, saidComing: true },
    "placed, gave it back": { kind: "released", via: "ranking", programmeId: AGI, how: "cant-make-it" },
    "placed, then withdrawn by somebody else": { kind: "withdrawn" },
    "invited, not answered": { kind: "invitation", programmeId: TAIS, replyBy: REPLY_BY },
    "invited, accepted": { kind: "place", via: "invitation", programmeId: TAIS, saidComing: true },
    "invited, accepted, then gave it back": { kind: "released", via: "invitation", programmeId: TAIS, how: "cant-make-it" },
    "invited, said no thanks": { kind: "released", via: "invitation", programmeId: TAIS, how: "no-thanks" },
    "invited, then withdrawn by somebody else": { kind: "withdrawn" },
    "invited with no invitation beside it": { kind: "unclear" },
    "no offer": { kind: "no-place" },
    declined: { kind: "no-place" },
  };

  test("the table names every state", () => {
    assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(STATES).sort());
  });

  for (const [name, state] of Object.entries(STATES)) {
    test(name, () => {
      assert.deepEqual(standing.standingOf(state), EXPECTED[name]);
    });
  }

  test("a place is held by somebody placed and by an invitation not yet answered, and by nobody else", () => {
    const held = Object.fromEntries(Object.entries(STATES).map(([name, state]) => [name, standing.placeHeldBy(state)]));
    assert.deepEqual(
      Object.entries(held).filter(([, programmeId]) => programmeId !== null),
      [
        ["placed, nothing said", AGI],
        ["placed, said coming", AGI],
        ["invited, not answered", TAIS],
        ["invited, accepted", TAIS],
      ],
    );
  });

  test("a result that names an invitation it does not carry is neither an offer nor a no", () => {
    const state = STATES["invited with no invitation beside it"];
    assert.equal(standing.standingOf(state).kind, "unclear");
    assert.equal(standing.placeHeldBy(state), null);
  });
});

// ---------------------------------------------------------------------------
// Every reply, against every standing
// ---------------------------------------------------------------------------

const WRITE = {
  coming: { kind: "write", attendance: "coming", invitationResponse: null, status: "accepted", releases: false, takesPlace: false },
  giveBack: { kind: "write", attendance: "cant-make-it", invitationResponse: null, status: "withdrawn", releases: true, takesPlace: false },
  accept: { kind: "write", attendance: null, invitationResponse: "accepted", status: "accepted", releases: false, takesPlace: true },
  noThanks: { kind: "write", attendance: null, invitationResponse: "declined", status: "withdrawn", releases: true, takesPlace: false },
};
const SAME = { kind: "unchanged" };
const no = (key) => ({ kind: "refused", error: replies.REPLY_REFUSALS[key] });

/** state -> [coming, cant-make-it, accept-invitation, decline-invitation] */
const TABLE = {
  "nothing published": [no("waiting"), no("waiting"), no("waiting"), no("waiting")],
  "a draft": [no("waiting"), no("waiting"), no("waiting"), no("waiting")],
  "withdrawn before decision day": [no("withdrawn"), no("withdrawn"), no("withdrawn"), no("withdrawn")],
  "placed, nothing said": [WRITE.coming, WRITE.giveBack, no("placeNotInvitation"), no("placeNotInvitation")],
  "placed, said coming": [SAME, WRITE.giveBack, no("placeNotInvitation"), no("placeNotInvitation")],
  "placed, gave it back": [no("gaveBack"), SAME, no("placeNotInvitation"), no("placeNotInvitation")],
  "placed, then withdrawn by somebody else": [no("withdrawn"), no("withdrawn"), no("withdrawn"), no("withdrawn")],
  "invited, not answered": [no("invitationFirst"), no("invitationFirst"), WRITE.accept, WRITE.noThanks],
  "invited, accepted": [SAME, WRITE.giveBack, SAME, no("alreadyAccepted")],
  "invited, accepted, then gave it back": [no("gaveBack"), SAME, no("gaveBack"), SAME],
  "invited, said no thanks": [no("gaveBack"), SAME, no("gaveBack"), SAME],
  "invited, then withdrawn by somebody else": [no("withdrawn"), no("withdrawn"), no("withdrawn"), no("withdrawn")],
  "invited with no invitation beside it": [no("unclear"), no("unclear"), no("unclear"), no("unclear")],
  "no offer": [no("noPlace"), no("noPlace"), no("noPlace"), no("noPlace")],
  declined: [no("noPlace"), no("noPlace"), no("noPlace"), no("noPlace")],
};

describe("what each reply does", () => {
  test("there are four replies, and the table answers each for every state", () => {
    assert.deepEqual([...replies.REPLIES], ["coming", "cant-make-it", "accept-invitation", "decline-invitation"]);
    assert.deepEqual(Object.keys(TABLE).sort(), Object.keys(STATES).sort());
    for (const row of Object.values(TABLE)) assert.equal(row.length, replies.REPLIES.length);
  });

  for (const [name, state] of Object.entries(STATES)) {
    replies.REPLIES.forEach((reply, at) => {
      test(`${name}: ${reply}`, () => {
        assert.deepEqual(replies.decideReply(state, reply, ON_THE_DAY), TABLE[name][at]);
      });
    });
  }

  test("only a word this page sends is a reply", () => {
    for (const reply of replies.REPLIES) assert.equal(replies.isReply(reply), true);
    for (const junk of ["", "accept", "no-thanks", "Coming", "constructor", "__proto__", "toString", 1, null, undefined, {}, ["coming"], true]) {
      assert.equal(replies.isReply(junk), false, String(junk));
    }
  });

  test("a place given back cannot be taken again from the page, however it was given back", () => {
    const takingItAgain = [
      ["placed, gave it back", "coming"],
      ["invited, accepted, then gave it back", "coming"],
      ["invited, accepted, then gave it back", "accept-invitation"],
      ["invited, said no thanks", "coming"],
      ["invited, said no thanks", "accept-invitation"],
    ];
    for (const [name, reply] of takingItAgain) {
      const decision = replies.decideReply(STATES[name], reply, ON_THE_DAY);
      assert.deepEqual(decision, no("gaveBack"), `${name}: ${reply}`);
      assert.match(decision.error, /ai-safety@uonsu\.com/, "the refusal says who to write to");
      assert.match(decision.error, /may have gone to someone else/);
    }
  });

  test("a write never changes what decision day told them, and names the status it leaves", () => {
    for (const [name, state] of Object.entries(STATES)) {
      for (const reply of replies.REPLIES) {
        const decision = replies.decideReply(state, reply, ON_THE_DAY);
        if (decision.kind !== "write") continue;
        assert.deepEqual(Object.keys(decision).sort(), ["attendance", "invitationResponse", "kind", "releases", "status", "takesPlace"], name);
        assert.equal(decision.status, decision.releases ? "withdrawn" : "accepted", `${name}: ${reply}`);
        // One reply writes one of the two reply fields, never both.
        assert.equal((decision.attendance === null) !== (decision.invitationResponse === null), true, `${name}: ${reply}`);
      }
    }
  });

  test("every refusal is a sentence a person can act on, in plain words", () => {
    const sentences = [...Object.values(replies.REPLY_REFUSALS), replies.lateInvitationRefusal(REPLY_BY), replies.lateInvitationRefusal("not-a-date")];
    for (const sentence of sentences) {
      assert.match(sentence, /^[A-Z].*\.$/, sentence);
      assert.equal(/undefined|null|\[object/.test(sentence), false, sentence);
      const lower = sentence.toLowerCase();
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) assert.equal(lower.includes(word), false, sentence);
      assert.equal(/\bpool(ed)?\b|\bdeclined\b/.test(lower), false, sentence);
    }
    assert.equal(replies.lateInvitationRefusal(REPLY_BY), "This invitation was open until Sun 25 Oct. Email ai-safety@uonsu.com and we will tell you whether the place is still free.");
  });
});

describe("the day replies were asked for by", () => {
  const waiting = STATES["invited, not answered"];

  test("it is not a wall: a late yes is still a yes", () => {
    assert.equal(replies.REPLY_BY_IS_A_DEADLINE, false);
    assert.deepEqual(replies.decideReply(waiting, "accept-invitation", DAY_AFTER), WRITE.accept);
    assert.deepEqual(replies.decideReply(waiting, "accept-invitation", "2027-01-01"), WRITE.accept);
  });

  test("with the switch on, accepting is refused from the day after, and not on the day", () => {
    assert.deepEqual(replies.decideReply(waiting, "accept-invitation", ON_THE_DAY, true), WRITE.accept);
    assert.deepEqual(replies.decideReply(waiting, "accept-invitation", DAY_AFTER, true), {
      kind: "refused",
      error: replies.lateInvitationRefusal(REPLY_BY),
    });
  });

  test("no thanks is never refused for being late: it only ever frees a place", () => {
    for (const wall of [false, true]) {
      assert.deepEqual(replies.decideReply(waiting, "decline-invitation", "2027-01-01", wall), WRITE.noThanks);
    }
  });

  test("somebody who accepted in time can still give the place back after the day", () => {
    assert.deepEqual(replies.decideReply(STATES["invited, accepted"], "cant-make-it", DAY_AFTER, true), WRITE.giveBack);
  });
});

// ---------------------------------------------------------------------------
// A place given back is free, the way the committee's screens already count
// ---------------------------------------------------------------------------

describe("a place given back is free in the term's own arithmetic", () => {
  const form = {
    programmeIds: [AGI, TAIS],
    programmes: { [AGI]: { places: 2 }, [TAIS]: { places: 1 } },
  };
  const decide = (decision) => ({ decision, poolReason: null, couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: null });
  /** Three people: two placed on AGI Strategy, one invited to Technical AI Safety. */
  const people = [
    { uid: "amara", ranked: [AGI], decision: { programmes: { [AGI]: decide("accept") }, pooledOutcome: null, exception: null } },
    { uid: "kofi", ranked: [AGI], decision: { programmes: { [AGI]: decide("accept") }, pooledOutcome: null, exception: null } },
    {
      uid: "oliver",
      ranked: [AGI],
      decision: { programmes: { [AGI]: decide("pool") }, pooledOutcome: { kind: "invite", programmeId: TAIS, setByUid: "zach", setAt: null }, exception: null },
    },
  ];
  /** The term as the decision-day screens count it: sent, and not withdrawn. */
  const free = (statusOf) => {
    const inTerm = people.filter((person) => plan.isInTerm({ sent: {}, status: statusOf[person.uid] }));
    const tally = decisions.tallyTerm(form, inTerm);
    return { [AGI]: decisions.freePlaces(form, tally, AGI), [TAIS]: decisions.freePlaces(form, tally, TAIS) };
  };
  const published = { amara: "accepted", kofi: "accepted", oliver: "invited" };

  test("before anybody answers, every place is held", () => {
    assert.deepEqual(free(published), { [AGI]: 0, [TAIS]: 0 });
  });

  test("I can’t make it frees the place", () => {
    const written = replies.decideReply(STATES["placed, nothing said"], "cant-make-it", ON_THE_DAY);
    assert.deepEqual(free({ ...published, amara: written.status }), { [AGI]: 1, [TAIS]: 0 });
  });

  test("No thanks frees the invitation's place", () => {
    const written = replies.decideReply(STATES["invited, not answered"], "decline-invitation", ON_THE_DAY);
    assert.deepEqual(free({ ...published, oliver: written.status }), { [AGI]: 0, [TAIS]: 1 });
  });

  test("I’m coming and an accepted invitation go on holding theirs", () => {
    const coming = replies.decideReply(STATES["placed, nothing said"], "coming", ON_THE_DAY);
    const took = replies.decideReply(STATES["invited, not answered"], "accept-invitation", ON_THE_DAY);
    assert.deepEqual(free({ ...published, amara: coming.status, oliver: took.status }), { [AGI]: 0, [TAIS]: 0 });
  });
});

// ---------------------------------------------------------------------------
// What the page shows for each outcome
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const programme = (id, kind, name, shortName, facts) => ({ id, kind, name, shortName, pitch: "", facts, starts: "w/c 26 Oct", closed: false });
const FORM = {
  id: ROUND,
  label: "Autumn 2026",
  windowState: "closed",
  opensLabel: "Tue 6 Oct",
  closesLabel: "Sun 18 Oct, 23:59",
  decisionsLabel: "Fri 23 Oct",
  programmes: [
    programme(TAIS, "fellowship", "Technical AI Safety Fellowship", "Technical AI Safety", "6 WEEKS · ~5 HRS A WEEK"),
    programme(AGI, "fellowship", "AGI Strategy Fellowship", "AGI Strategy", "6 WEEKS · ~5 HRS A WEEK"),
    programme(INCUBATOR, "incubator", "Research incubator", "Research incubator", "10 WEEKS · SELECTIVE"),
  ],
  questionSetIds: [],
  asksFacilitating: false,
  availabilityGrid: GRID,
};
const SETS = [];

function person(name, ranked, state) {
  const written = {
    aboutYou: {
      preferredName: name,
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "",
      interests: "",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: null,
    answers: {},
    availability: { ...GRID, days: [] },
    suMembership: "yes",
  };
  const sent = validate.contentForSend(shape.formShapeOf(FORM), shape.questionSetsOf(FORM, SETS), written);
  return {
    id: `${ROUND}__${name.toLowerCase()}`,
    roundId: ROUND,
    draft: written,
    sent,
    createdAt: null,
    updatedAt: null,
    submittedAt: "2026-10-17T13:20:00.000Z",
    sentAt: "2026-10-17T13:20:00.000Z",
    sentLabel: "Sat 17 Oct",
    ...state,
    result: state.result ? { ...state.result, publishedAt: "2026-10-23T11:00:00.000Z" } : null,
    invitation: state.invitation ? { ...state.invitation, respondedAt: null } : null,
    attendance: state.attendance ? { ...state.attendance, answeredAt: null } : null,
  };
}
const viewOf = (application, today = "2026-10-23", form = FORM) => view.statusViewFor(form, SETS, application, today);

const AGI_VIEW = {
  name: "AGI Strategy Fellowship",
  shortName: "AGI Strategy",
  facts: "6 WEEKS · ~5 HRS A WEEK · starts w/c 26 Oct",
  shortFacts: "6 WEEKS · starts w/c 26 Oct",
};
const TAIS_VIEW = {
  name: "Technical AI Safety Fellowship",
  shortName: "Technical AI Safety",
  facts: "6 WEEKS · ~5 HRS A WEEK · starts w/c 26 Oct",
  shortFacts: "6 WEEKS · starts w/c 26 Oct",
};

describe("ap-offer, as Amara sees it", () => {
  test("the programme, its facts with when it starts, and the day she was told", () => {
    assert.deepEqual(viewOf(person("Amara", [AGI, TAIS], STATES["placed, nothing said"])), {
      kind: "place",
      label: "Autumn 2026",
      decidedLabel: "Fri 23 Oct",
      via: "ranking",
      programme: AGI_VIEW,
      saidComing: false,
    });
  });

  test("once she has said she is coming, the page knows", () => {
    assert.equal(viewOf(person("Amara", [AGI], STATES["placed, said coming"])).saidComing, true);
  });

  test("the day is the one the result was published on, in London, whatever the form planned", () => {
    const late = person("Amara", [AGI], STATES["placed, nothing said"]);
    // Half past midnight in London, while it is still the 23rd in UTC.
    late.result.publishedAt = "2026-10-23T23:30:00.000Z";
    assert.equal(viewOf(late).decidedLabel, "Sat 24 Oct");
    // With no time on the result, the form's own decision day is what is left.
    late.result.publishedAt = null;
    assert.equal(viewOf(late).decidedLabel, "Fri 23 Oct");
  });

  test("a programme the form no longer carries is not described, and the place is still said", () => {
    const gone = viewOf(person("Amara", [AGI], accepted({ result: { kind: "accepted", programmeId: "left-the-form" } })));
    assert.equal(gone.kind, "place");
    assert.equal(gone.programme, null);
    const nameless = viewOf(person("Amara", [AGI], accepted({ result: { kind: "accepted", programmeId: null } })));
    assert.equal(nameless.kind, "place");
    assert.equal(nameless.programme, null);
  });
});

describe("ap-outcomes, the invitation as Oliver sees it", () => {
  const oliver = person("Oliver", [INCUBATOR], STATES["invited, not answered"]);

  test("what he applied for, what he is invited to, and the day to reply by", () => {
    assert.deepEqual(viewOf(oliver), {
      kind: "invitation",
      label: "Autumn 2026",
      decidedLabel: "Fri 23 Oct",
      programme: TAIS_VIEW,
      appliedFor: "the Research incubator",
      replyByLabel: "Sun 25 Oct",
      late: false,
      canAccept: true,
    });
  });

  test("the day is not late on the day, and is the day after", () => {
    assert.equal(viewOf(oliver, ON_THE_DAY).late, false);
    assert.equal(viewOf(oliver, DAY_AFTER).late, true);
  });

  test("the page offers Accept exactly when the route would take it, under either setting of the switch", () => {
    for (const wall of [false, true]) {
      for (const today of [ON_THE_DAY, DAY_AFTER, "2027-01-01"]) {
        const shown = view.statusViewFor(FORM, SETS, oliver, today, wall);
        const taken = replies.decideReply(STATES["invited, not answered"], "accept-invitation", today, wall);
        assert.equal(shown.canAccept, taken.kind === "write", JSON.stringify({ wall, today }));
      }
    }
    // As shipped the day is not a wall, so a late invitation can still be accepted.
    assert.equal(viewOf(oliver, DAY_AFTER).canAccept, true);
    assert.equal(view.statusViewFor(FORM, SETS, oliver, DAY_AFTER, true).canAccept, false);
  });

  test("somebody who ranked two is told both", () => {
    const both = viewOf(person("Rosa", [INCUBATOR, AGI], STATES["invited, not answered"]));
    assert.equal(both.appliedFor, "the Research incubator and the AGI Strategy Fellowship");
    assert.equal(view.inWords(["a", "b", "c"]), "a, b and c");
    assert.equal(view.inWords([]), "");
  });

  test("once accepted it is a place, drawn as the accepted card", () => {
    assert.deepEqual(viewOf(person("Oliver", [INCUBATOR], STATES["invited, accepted"])), {
      kind: "place",
      label: "Autumn 2026",
      decidedLabel: "Fri 23 Oct",
      via: "invitation",
      programme: TAIS_VIEW,
      saidComing: true,
    });
  });
});

describe("a place or an invitation given back", () => {
  test("says how it was given back, and which programme", () => {
    assert.deepEqual(viewOf(person("Amara", [AGI], STATES["placed, gave it back"])), {
      kind: "released",
      label: "Autumn 2026",
      decidedLabel: "Fri 23 Oct",
      via: "ranking",
      how: "cant-make-it",
      programme: AGI_VIEW,
    });
    assert.equal(viewOf(person("Oliver", [INCUBATOR], STATES["invited, said no thanks"])).how, "no-thanks");
    assert.equal(viewOf(person("Oliver", [INCUBATOR], STATES["invited, accepted, then gave it back"])).how, "cant-make-it");
  });
});

describe("ap-outcomes, the kind no as Hannah sees it", () => {
  const hannah = viewOf(person("Hannah", [AGI], STATES["no offer"]));

  test("what she applied for and what to call her", () => {
    assert.deepEqual(hannah, {
      kind: "no-place",
      label: "Autumn 2026",
      decidedLabel: "Fri 23 Oct",
      appliedFor: "AGI Strategy",
      firstName: "Hannah",
    });
  });

  test("somebody every programme declined reads exactly the same page", () => {
    assert.deepEqual(viewOf(person("Hannah", [AGI], STATES.declined)), hannah);
  });

  test("an application with no name on it is thanked without one", () => {
    assert.equal(viewOf(person(" ", [AGI, TAIS], STATES["no offer"])).firstName, "");
    assert.equal(viewOf(person("Lily", [AGI, TAIS], STATES["no offer"])).appliedFor, "AGI Strategy and Technical AI Safety");
  });
});

describe("the states that are nobody's outcome", () => {
  test("a result that cannot be read, and an application withdrawn by somebody else, say only that", () => {
    assert.deepEqual(viewOf(person("Oliver", [INCUBATOR], STATES["invited with no invitation beside it"])), { kind: "unclear", label: "Autumn 2026" });
    assert.deepEqual(viewOf(person("Amara", [AGI], STATES["placed, then withdrawn by somebody else"])), { kind: "withdrawn", label: "Autumn 2026" });
  });

  test("every state has a page, and none of them is the waiting page once a result is published", () => {
    for (const [name, state] of Object.entries(STATES)) {
      const shown = viewOf(person("Amara", [AGI], state));
      assert.ok(shown.kind, name);
      if (state.result) assert.notEqual(shown.kind, "sent", name);
    }
  });
});

// ---------------------------------------------------------------------------
// The words on the screen
// ---------------------------------------------------------------------------

const flat = (text) => text.replace(/\s+/g, " ");
const sourceOf = (dir, file) => readFileSync(join(dir, file), "utf8");
const codeOf = (dir, file) =>
  sourceOf(dir, file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("what an applicant reads on decision day", () => {
  const page = flat(sourceOf(SCREEN_DIR, "StatusPage.tsx"));
  const buttons = flat(sourceOf(SCREEN_DIR, "ReplyButtons.tsx"));

  test("ap-offer, word for word", () => {
    for (const fixed of [
      "<span>Your application</span>",
      "<Chip tone=\"ok\">Accepted</Chip>",
      "`You’re in ${programme.shortName}.`",
      "You’ll be in a small group with a facilitator, on campus. Before you start, we’ll email you your group and when it meets.",
      "Questions? <Contact />",
    ]) {
      assert.ok(page.includes(fixed), `missing: ${fixed}`);
    }
    for (const fixed of ["\"I’m coming\"", "Optional. It helps us plan groups.", "I can’t make it", "This frees your place for someone else."]) {
      assert.ok(buttons.includes(fixed), `missing: ${fixed}`);
    }
    assert.match(page, /const CONTACT = "ai-safety@uonsu\.com";/);
  });

  test("ap-outcomes, word for word", () => {
    for (const fixed of [
      "<Chip tone=\"accent\">Invitation</Chip>",
      "`You’re invited to ${programme.shortName}.`",
      "{view.appliedFor ? `You applied for ${view.appliedFor}. ` : null} The pool was really strong and we don’t have space for you this time, but we think you’d be a great fit for {programme ? programme.shortName : \"this programme\"} instead.",
      "Accept your invitation by <span className={styles.together}>{view.replyByLabel}</span> to let us know you’re coming.",
      "<Chip>No place this term</Chip>",
      "We can’t offer you a place this term.",
      "Applied for {view.appliedFor}",
      "{view.firstName ? `Thanks for applying, ${view.firstName}.` : \"Thanks for applying.\"} We’ll email you when applications next open.",
      "Our events are open to everyone, so come along to one.",
      "<span>See what’s on</span>",
      "You’ll be in a small group with a facilitator, on campus.",
    ]) {
      assert.ok(page.includes(fixed), `missing: ${fixed}`);
    }
    for (const fixed of ["\"Accept your invitation\"", "No thanks"]) assert.ok(buttons.includes(fixed), `missing: ${fixed}`);
    assert.match(page, /const EVENTS = "\/events";/);
  });

  test("the committee's word for the people nothing took appears once, in the board's own sentence", () => {
    const files = [
      ...readdirSync(SCREEN_DIR).filter((name) => /\.tsx?$/.test(name)).map((name) => [SCREEN_DIR, name]),
      ...readdirSync(RULES_DIR).filter((name) => /\.ts$/.test(name)).map((name) => [RULES_DIR, name]),
    ];
    let uses = 0;
    for (const [dir, file] of files) {
      // The one place the code COMPARES an account's role to the site's own
      // value for a refused account is a value it reads, never a word shown.
      const lower = codeOf(dir, file).replace(/role === "rejected"/g, "").toLowerCase();
      for (const word of words.WORDS_APPLICANTS_NEVER_SEE) assert.equal(lower.includes(word), false, `${file} uses "${word}"`);
      assert.equal(/\bpooled\b/.test(lower), false, `${file} says somebody was pooled`);
      uses += (lower.match(/\bpool\b/g) ?? []).length;
    }
    assert.equal(uses, 1);
    assert.ok(page.includes("The pool was really strong"));
  });

  test("an applicant is never shown the committee's name for a group", () => {
    // "Declined" and "No offer this time" are what the committee calls two of
    // the groups. The page's chip for both is "No place this term".
    for (const file of readdirSync(SCREEN_DIR).filter((name) => /\.tsx$/.test(name))) {
      const code = codeOf(SCREEN_DIR, file);
      assert.equal(/No offer this time|>\s*Declined\s*</.test(code), false, file);
      assert.equal(/RESULT_LABEL|ADMISSION_APPLICATION_STATUS_LABEL/.test(code), false, `${file} draws a committee label`);
    }
  });
});

describe("the reply buttons", () => {
  const buttons = codeOf(SCREEN_DIR, "ReplyButtons.tsx");

  test("they post one word to the reply route and then have the server draw the page again", () => {
    assert.match(buttons, /`\/api\/admissions\/forms\/\$\{encodeURIComponent\(roundId\)\}\/application\/reply`/);
    assert.match(buttons, /method: "POST"/);
    assert.match(buttons, /body: JSON\.stringify\(\{ reply \}\)/);
    assert.match(buttons, /startRedraw\(\(\) => router\.refresh\(\)\)/);
    const sent = [...buttons.matchAll(/send\("([a-z-]+)"\)/g)].map((found) => found[1]).sort();
    assert.deepEqual(sent, ["accept-invitation", "cant-make-it", "coming", "decline-invitation"]);
    for (const reply of sent) assert.equal(replies.isReply(reply), true, reply);
  });

  test("giving a place back is asked twice, and saying yes is one press", () => {
    // The two buttons that give something back only open the question.
    assert.equal((buttons.match(/onClick=\{\(\) => setAsking\(true\)\}/g) ?? []).length, 2);
    assert.match(buttons, /onClick=\{\(\) => setAsking\(true\)\} disabled=\{off\}>\s+I can’t make it/);
    assert.match(buttons, /onClick=\{\(\) => setAsking\(true\)\} disabled=\{off\}>\s+No thanks/);
    assert.match(buttons, /onConfirm=\{\(\) => send\("cant-make-it"\)\}/);
    assert.match(buttons, /onConfirm=\{\(\) => send\("decline-invitation"\)\}/);
    assert.match(buttons, /onClick=\{\(\) => send\("coming"\)\}/);
    assert.match(buttons, /onClick=\{\(\) => send\("accept-invitation"\)\}/);
  });

  test("Accept is only drawn when the page was told it can be taken", () => {
    assert.match(buttons, /\{canAccept \? \(\s+<button/);
    assert.match(flat(sourceOf(SCREEN_DIR, "StatusPage.tsx")), /<InvitationReply roundId=\{roundId\} canAccept=\{view\.canAccept\} locked=\{viewingAs\} \/>/);
  });

  test("nothing can be pressed before the scripts load, while one is being sent, or by an admin viewing as the member", () => {
    assert.equal((buttons.match(/const off = !hydrated \|\| busy \|\| locked;/g) ?? []).length, 2);
    assert.match(sourceOf(SCREEN_DIR, "renderApplicationStatus.tsx"), /const viewingAs = markerIsLive\(await getImpersonator\(\), user\.uid\);/);
    assert.equal((flat(sourceOf(SCREEN_DIR, "StatusPage.tsx")).match(/locked=\{viewingAs\}/g) ?? []).length, 3);
  });

  test("they are real buttons, and a refusal is announced where they are", () => {
    assert.equal(/<a\b|<Link\b/.test(buttons), false, "a reply is a button, never a link");
    assert.equal((buttons.match(/<button\b/g) ?? []).length, (buttons.match(/type="button"/g) ?? []).length);
    assert.match(buttons, /<p className=\{styles\.problem\} role="alert">/);
    assert.match(buttons, /<p className=\{styles\.said\} role="status">/);
  });
});
