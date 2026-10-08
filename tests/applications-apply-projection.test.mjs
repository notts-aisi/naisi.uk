/**
 * What an applicant may know, and nothing else.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * The applicant's routes and the public apply page answer with three
 * projections from `src/lib/applications/applicant/project.ts`: the form, a
 * question set, and the caller's own application. A stored form also says who
 * leads each programme, who reviews it, how many places it has, whether it is
 * scored and what its emails will say. A stored question says whether
 * reviewers score it. A stored round carries its counters, its reviewers and
 * its author. None of that is an applicant's to read.
 *
 * So this file does the thing a reader of a diff cannot: it fills EVERY
 * staff-only field with a marker, runs the real normalisers and the real
 * projections over it, and fails if one marker survives anywhere in the
 * result. Then it holds each projection to its exact list of keys, so a field
 * added to the model does not arrive in an applicant's payload unannounced.
 *
 * Nothing is faked but `server-only`: these are the shipping modules.
 */

// Before anything reads the clock: a zone far from London, so a date label
// that only looks right on a laptop in Nottingham fails here.
process.env.TZ = "America/Los_Angeles";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });

const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const project = await loadTs(join("lib", "applications", "applicant", "project.ts"));
const shape = await loadTs(join("lib", "applications", "applicant", "shape.ts"));
const sections = await loadTs(join("lib", "applications", "sections.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));

/** Every staff-only string below starts with this, so one search finds them all. */
const MARK = "STAFF-ONLY-";
/**
 * Staff-only numbers, inside the ranges the normalisers keep and chosen so
 * their digits appear nowhere else in the fixture.
 */
const PLACES = 9183;
const GROUPS = 847;
const COUNT = 19283;

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INCUBATOR = "research-incubator";

function programme(overrides = {}) {
  return {
    kind: "fellowship",
    name: "AGI Strategy Fellowship",
    shortName: "AGI Strategy",
    pitch: "Where AI is heading and what could go wrong.",
    facts: "6 WEEKS · ~5 HRS A WEEK",
    starts: "w/c 26 Oct",
    places: PLACES,
    groupCount: GROUPS,
    groupSize: `${MARK}groupSize`,
    leadUid: `${MARK}leadUid`,
    reviewerUids: [`${MARK}reviewer-one`, `${MARK}reviewer-two`],
    useScores: true,
    closed: false,
    runId: `${MARK}runId`.replace(/[^A-Za-z0-9_-]/g, "-"),
    emailWording: {
      accepted: { subject: `${MARK}accepted-subject`, body: `${MARK}accepted-body` },
      invitation: { subject: `${MARK}invitation-subject`, body: `${MARK}invitation-body` },
      declined: { subject: `${MARK}declined-subject`, body: `${MARK}declined-body` },
    },
    ...overrides,
  };
}

/** A round as it is STORED, with every field an applicant must not read marked. */
function storedRound(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    blurb: "",
    academicYear: "2026/27",
    status: "open",
    archived: false,
    // 09:00 and 23:59 in London (British Summer Time), as instants.
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    availabilityGrid: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 },
    programmeIds: [TAIS, AGI, INCUBATOR],
    programmes: {
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety" }),
      [AGI]: programme(),
      [INCUBATOR]: programme({
        kind: "incubator",
        name: "Research incubator",
        shortName: "Research incubator",
        facts: "10 WEEKS · SELECTIVE",
        closed: true,
      }),
    },
    questionSetIds: ["fellowships", AGI, "facilitator"],
    asksFacilitating: true,
    // --- everything below is the committee's ---
    reviewerUids: [`${MARK}round-reviewer`],
    finalDeciderUid: `${MARK}finalDecider`,
    authorUid: `${MARK}author`,
    clonedFromRoundId: `${MARK}clonedFrom`,
    criteria: [{ id: "c1", label: `${MARK}criterion`, description: `${MARK}criterion-description` }],
    scoreScale: { min: 1, max: 5 },
    reviewersPerApplication: 2,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [`${MARK}evidence-run`],
    outcomeRunIds: [`${MARK}outcome-run`],
    accessRequirementsPrompt: `${MARK}access-prompt`,
    applicationCounts: { draft: COUNT, submitted: COUNT, accepted: COUNT },
    invitationReplyBy: "2026-10-25",
    revealOtherReviews: true,
    noOfferWording: { subject: `${MARK}no-offer-subject`, body: `${MARK}no-offer-body` },
    decisionsSentAt: new Date("2026-10-23T11:00:00Z"),
    decisionsSentByUid: `${MARK}sentBy`,
    ...overrides,
  };
}

function storedSet(overrides = {}) {
  return {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    intro: `${MARK}intro, written for the committee`,
    questions: [
      {
        id: "event",
        text: "Pick something that happened in AI this year. Why does it matter?",
        help: "",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 300,
        required: true,
        scored: true,
      },
      {
        id: "python",
        text: "How comfortable are you writing Python?",
        help: "",
        type: "scale",
        options: ["Never tried", "Can follow it", "Write it often"],
        optionsFromRanking: false,
        wordLimit: null,
        required: true,
        scored: true,
      },
    ],
    ...overrides,
  };
}

function content(overrides = {}) {
  return {
    aboutYou: {
      preferredName: "Amara",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "Philosophy got me into it.",
      interests: "Governance",
    },
    rankedProgrammeIds: [AGI, TAIS],
    wantsToFacilitate: true,
    answers: { [AGI]: { event: "The arguments about open weights.", python: 1 } },
    availability: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15, days: [] },
    suMembership: "yes",
    ...overrides,
  };
}

/** An application as it is STORED, with what the committee keeps on it marked. */
function storedApplication(overrides = {}) {
  return {
    formVersion: 2,
    roundId: ROUND,
    uid: "amara",
    email: `${MARK}session-email@example.com`,
    displayName: `${MARK}display-name`,
    draft: content(),
    sent: content({ suMembership: "not-yet" }),
    status: "invited",
    submittedAt: new Date("2026-10-17T13:20:00Z"),
    sentAt: new Date("2026-10-17T13:20:00Z"),
    withdrawnAt: null,
    result: { kind: "invited", programmeId: TAIS, publishedAt: new Date("2026-10-23T11:00:00Z") },
    invitation: {
      programmeId: TAIS,
      replyBy: "2026-10-25",
      response: null,
      respondedAt: null,
      lastReminderOn: "2026-10-24",
    },
    attendance: { answer: "coming", answeredAt: new Date("2026-10-23T12:00:00Z") },
    createdAt: new Date("2026-10-08T18:00:00Z"),
    updatedAt: new Date("2026-10-17T13:20:00Z"),
    // Fields other parts of the site, or an older build, may have left behind.
    membershipAtApply: true,
    evidence: { note: `${MARK}evidence` },
    outcome: { reason: `${MARK}decision-reason`, decidedBy: `${MARK}decidedBy` },
    reviewerNotes: `${MARK}reviewer-notes`,
    scores: { [`${AGI}.event`]: 5 },
    ...overrides,
  };
}

const NOW = new Date("2026-10-07T12:00:00Z");
const keys = (value) => Object.keys(value).sort();

function assertNoMarker(value, what) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(MARK), false, `${what} carries a staff-only string: ${text.match(new RegExp(`${MARK}[\\w-]*`))?.[0]}`);
  for (const number of [PLACES, GROUPS, COUNT]) {
    assert.equal(text.includes(String(number)), false, `${what} carries a staff-only number (${number})`);
  }
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

describe("the form, as an applicant may know it", () => {
  const form = normalise.normaliseForm(ROUND, storedRound());
  const projected = project.projectFormForApplicant(form, NOW);

  test("the fixture really does carry the markers, so their absence means something", () => {
    assert.ok(JSON.stringify(form).includes(MARK));
    for (const number of [PLACES, GROUPS, COUNT]) {
      assert.ok(JSON.stringify(form).includes(String(number)), `the stored form should carry ${number}`);
    }
    assert.equal(form.programmes[AGI].leadUid, `${MARK}leadUid`);
    assert.equal(form.programmes[AGI].useScores, true);
  });

  test("no staff-only value survives the projection", () => {
    assertNoMarker(projected, "the projected form");
  });

  test("it is exactly these fields", () => {
    assert.deepEqual(keys(projected), [
      "asksFacilitating",
      "availabilityGrid",
      "closesLabel",
      "decisionsLabel",
      "id",
      "label",
      "opensLabel",
      "programmes",
      "questionSetIds",
      "windowState",
    ]);
    for (const programmeView of projected.programmes) {
      assert.deepEqual(keys(programmeView), ["closed", "facts", "id", "kind", "name", "pitch", "shortName", "starts"]);
    }
    assert.deepEqual(keys(projected.availabilityGrid), ["endMinute", "slotMinutes", "startMinute", "version"]);
  });

  test("every programme on the form is there, in the form's order, with its public half", () => {
    assert.deepEqual(
      projected.programmes.map((each) => each.id),
      [TAIS, AGI, INCUBATOR],
    );
    assert.deepEqual(projected.programmes[1], {
      id: AGI,
      kind: "fellowship",
      name: "AGI Strategy Fellowship",
      shortName: "AGI Strategy",
      pitch: "Where AI is heading and what could go wrong.",
      facts: "6 WEEKS · ~5 HRS A WEEK",
      starts: "w/c 26 Oct",
      closed: false,
    });
    assert.equal(projected.programmes[2].closed, true, "a closed programme is said to be closed, so its tick can be taken off");
  });

  test("its dates are labels written in London, whatever zone the server is in", () => {
    assert.equal(projected.opensLabel, "Tue 6 Oct");
    assert.equal(projected.closesLabel, "Sun 18 Oct, 23:59");
    assert.equal(projected.decisionsLabel, "Fri 23 Oct");
    assert.equal(projected.windowState, "open");
  });

  test("a form with no dates says so with nulls, not with an invented date", () => {
    const undated = project.projectFormForApplicant(
      normalise.normaliseForm(ROUND, storedRound({ opensAt: null, closesAt: null, decisionsByDate: null })),
      NOW,
    );
    assert.equal(undated.opensLabel, null);
    assert.equal(undated.closesLabel, null);
    assert.equal(undated.decisionsLabel, null);
  });

  test("the window is the round's: not yet, open, closed", () => {
    const at = (iso) => project.projectFormForApplicant(form, new Date(iso)).windowState;
    assert.equal(at("2026-10-06T07:59:59Z"), "not-yet");
    assert.equal(at("2026-10-06T08:00:00Z"), "open");
    assert.equal(at("2026-10-18T22:59:00Z"), "open", "the deadline itself is still inside the window");
    assert.equal(at("2026-10-18T22:59:00.001Z"), "closed");
  });

  test("a draft or archived form never reads as anything but closed", () => {
    for (const hidden of [{ status: "draft" }, { archived: true }]) {
      const view = project.projectFormForApplicant(normalise.normaliseForm(ROUND, storedRound(hidden)), NOW);
      assert.equal(view.windowState, "closed");
      assert.equal(JSON.stringify(view).includes("draft"), false);
      assert.equal(JSON.stringify(view).includes("inactive"), false);
    }
  });
});

// ---------------------------------------------------------------------------
// A question set
// ---------------------------------------------------------------------------

describe("a question set, as it is asked", () => {
  const set = normalise.normaliseQuestionSet(AGI, storedSet());
  const projected = project.projectQuestionSetForApplicant(set);

  test("the stored set is scored and carries the committee's line", () => {
    assert.equal(set.questions[0].scored, true);
    assert.ok(set.intro.startsWith(MARK));
  });

  test("neither the scored flag nor the committee's line survives", () => {
    assertNoMarker(projected, "the projected question set");
    assert.equal(JSON.stringify(projected).includes("scored"), false);
    assert.equal(JSON.stringify(projected).includes("intro"), false);
  });

  test("it is exactly these fields", () => {
    // `applicantLine` is the line a set's author wrote FOR applicants, drawn
    // under the set's heading. It is a field of its own. The set's other
    // line, the note for admins (`intro`), is still not sent: the test above
    // holds that word, and the note's own marked text, out of the whole
    // payload, this field included. That the line sent is never the note is
    // held in `applications-set-line-for-applicants.test.mjs`.
    assert.deepEqual(keys(projected), ["applicantLine", "id", "label", "questions", "role", "scope"]);
    for (const question of projected.questions) {
      assert.deepEqual(keys(question), [
        "help",
        "id",
        "optionsFromRanking",
        "options",
        "required",
        "text",
        "type",
        "wordLimit",
      ].sort());
    }
    assert.deepEqual(projected.scope, { type: "programme", programmeId: AGI });
  });

  test("each kind of scope is copied field by field", () => {
    const general = project.projectQuestionSetForApplicant(
      normalise.normaliseQuestionSet("fellowships", storedSet({ role: "general", scope: { type: "kind", kind: "fellowship", extra: MARK } })),
    );
    assert.deepEqual(general.scope, { type: "kind", kind: "fellowship" });
    const facilitator = project.projectQuestionSetForApplicant(
      normalise.normaliseQuestionSet("facilitator", storedSet({ role: "facilitator", scope: { type: "facilitating", extra: MARK } })),
    );
    assert.deepEqual(facilitator.scope, { type: "facilitating" });
  });
});

// ---------------------------------------------------------------------------
// The caller's own application
// ---------------------------------------------------------------------------

describe("somebody's own application", () => {
  const application = normalise.normaliseApplication(`${ROUND}__amara`, storedApplication());
  const projected = project.projectApplicationForOwner(application);

  test("the stored document carries the session's email and name", () => {
    assert.ok(application.email.startsWith(MARK));
    assert.ok(application.displayName.startsWith(MARK));
  });

  test("nothing the committee keeps on it survives", () => {
    assertNoMarker(projected, "the projected application");
    assert.equal(JSON.stringify(projected).includes("lastReminderOn"), false);
  });

  test("it is exactly these fields", () => {
    assert.deepEqual(keys(projected), [
      "attendance",
      "createdAt",
      "draft",
      "id",
      "invitation",
      "result",
      "roundId",
      "sent",
      "sentAt",
      "sentLabel",
      "status",
      "submittedAt",
      "updatedAt",
    ]);
    for (const part of [projected.draft, projected.sent]) {
      assert.deepEqual(keys(part), [
        "aboutYou",
        "answers",
        "availability",
        "rankedProgrammeIds",
        "suMembership",
        "wantsToFacilitate",
      ]);
      assert.deepEqual(keys(part.aboutYou), [
        "expectedGraduation",
        "interests",
        "motivation",
        "preferredName",
        "status",
        "statusOther",
        "subject",
        "universityEmail",
        "universityEmailVerified",
      ]);
    }
    assert.deepEqual(keys(projected.result), ["kind", "programmeId", "publishedAt"]);
    assert.deepEqual(keys(projected.invitation), ["programmeId", "replyBy", "respondedAt", "response"]);
    assert.deepEqual(keys(projected.attendance), ["answer", "answeredAt"]);
  });

  test("both copies are there, and they are the applicant's own words", () => {
    assert.equal(projected.draft.suMembership, "yes");
    assert.equal(projected.sent.suMembership, "not-yet");
    assert.deepEqual(projected.draft.answers, { [AGI]: { event: "The arguments about open weights.", python: 1 } });
    assert.equal(projected.status, "invited");
    assert.equal(projected.sentAt, "2026-10-17T13:20:00.000Z");
    assert.equal(projected.sentLabel, "Sat 17 Oct");
  });

  test("before decision day there is nothing to hear early", () => {
    const waiting = project.projectApplicationForOwner(
      normalise.normaliseApplication(
        `${ROUND}__amara`,
        storedApplication({ status: "submitted", result: null, invitation: null, attendance: null }),
      ),
    );
    assert.equal(waiting.result, null);
    assert.equal(waiting.invitation, null);
    assert.equal(waiting.attendance, null);
    assert.equal(waiting.status, "submitted");
  });

  test("a decline and no offer are one thing to the person who gets them, here as on their page", () => {
    const told = (kind) =>
      project.projectApplicationForOwner(
        normalise.normaliseApplication(
          `${ROUND}__amara`,
          storedApplication({
            status: kind,
            result: { kind, programmeId: null, publishedAt: new Date("2026-10-23T11:00:00Z") },
            invitation: null,
            attendance: null,
          }),
        ),
      );
    const declined = told("declined");
    assert.equal(declined.status, "no-offer");
    assert.equal(declined.result.kind, "no-offer");
    // Whole, so nothing else on it can tell the two apart either.
    assert.deepEqual(declined, told("no-offer"));
    assert.equal(JSON.stringify(declined).includes("declined"), false);
    // Every other status is said as it is.
    for (const status of ["draft", "submitted", "accepted", "invited", "no-offer", "withdrawn"]) {
      const shown = project.projectApplicationForOwner(
        normalise.normaliseApplication(`${ROUND}__amara`, storedApplication({ status })),
      );
      assert.equal(shown.status, status, status);
    }
  });

  test("a draft that was never sent has no sent copy and no sent date", () => {
    const draft = project.projectApplicationForOwner(
      normalise.normaliseApplication(
        `${ROUND}__amara`,
        storedApplication({ status: "draft", sent: null, sentAt: null, submittedAt: null }),
      ),
    );
    assert.equal(draft.sent, null);
    assert.equal(draft.sentAt, null);
    assert.equal(draft.sentLabel, null);
  });

  test("the projection is a copy: changing it changes nothing stored", () => {
    projected.draft.rankedProgrammeIds.push("another");
    projected.draft.answers[AGI].event = "changed";
    assert.deepEqual(application.draft.rankedProgrammeIds, [AGI, TAIS]);
    assert.equal(application.draft.answers[AGI].event, "The arguments about open weights.");
  });
});

// ---------------------------------------------------------------------------
// The browser rebuilds the rule shapes from the projection, and loses nothing
// the rules read
// ---------------------------------------------------------------------------

describe("the rules give the same answer on the projection as on the stored form", () => {
  const stored = storedRound({ questionSetIds: ["fellowships", TAIS, AGI, "facilitator"] });
  const form = normalise.normaliseForm(ROUND, stored);
  const sets = [
    normalise.normaliseQuestionSet("fellowships", storedSet({ role: "general", scope: { type: "kind", kind: "fellowship" }, label: "Fellowships" })),
    normalise.normaliseQuestionSet(TAIS, storedSet({ scope: { type: "programme", programmeId: TAIS }, label: "Technical AI Safety" })),
    normalise.normaliseQuestionSet(AGI, storedSet()),
    normalise.normaliseQuestionSet(
      "facilitator",
      storedSet({
        role: "facilitator",
        scope: { type: "facilitating" },
        label: "Facilitator questions",
        questions: [
          { id: "which", text: "Which would you rather facilitate?", type: "choice", optionsFromRanking: true, required: true },
        ],
      }),
    ),
  ];
  const ordered = sections.orderedSets(form, sets);
  const view = project.projectFormForApplicant(form, NOW);
  const rebuiltForm = shape.formShapeOf(view);
  const rebuiltSets = shape.questionSetsOf(view, ordered.map(project.projectQuestionSetForApplicant));

  const cases = [
    content(),
    content({ rankedProgrammeIds: [TAIS], wantsToFacilitate: false, answers: {} }),
    content({ rankedProgrammeIds: [], wantsToFacilitate: null, suMembership: null }),
    content({ rankedProgrammeIds: [INCUBATOR, AGI] }),
  ];

  test("the same steps, in the same order", () => {
    for (const each of cases) {
      assert.deepEqual(sections.stepsFor(rebuiltForm, rebuiltSets, each), sections.stepsFor(form, ordered, each));
    }
  });

  test("the same things stop a send", () => {
    for (const each of cases) {
      assert.deepEqual(validate.issuesFor(rebuiltForm, rebuiltSets, each), validate.issuesFor(form, ordered, each));
    }
  });

  test("the same options for a question that offers the person's own ranking", () => {
    const which = rebuiltSets.find((set) => set.id === "facilitator").questions[0];
    assert.deepEqual(validate.optionsFor(which, rebuiltForm, cases[0]), ["AGI Strategy", "Technical AI Safety", "Either"]);
  });

  test("the rebuilt shapes hold nothing an applicant was not sent", () => {
    assertNoMarker(rebuiltForm, "the rebuilt form");
    assertNoMarker(rebuiltSets, "the rebuilt question sets");
    for (const programmeShape of Object.values(rebuiltForm.programmes)) {
      assert.equal(programmeShape.leadUid, null);
      assert.deepEqual(programmeShape.reviewerUids, []);
      assert.equal(programmeShape.places, null);
      assert.equal(programmeShape.useScores, false);
    }
    assert.ok(rebuiltSets.every((set) => set.questions.every((question) => question.scored === false)));
  });
});

// ---------------------------------------------------------------------------
// Where the projections are used
// ---------------------------------------------------------------------------

describe("the routes and the page answer with the projections", () => {
  const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
  const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ROUTE = "src/app/api/admissions/forms/[roundId]/application/route.ts";
  const SEND = "src/app/api/admissions/forms/[roundId]/application/send/route.ts";
  const STORE = "src/lib/applications/applicant/store.ts";

  test("the GET returns the three projections and the account's own About you", () => {
    const source = code(ROUTE);
    assert.match(source, /form: projectFormForApplicant\(loaded\.form, now\)/);
    assert.match(source, /sets: loaded\.sets\.map\(projectQuestionSetForApplicant\)/);
    assert.match(source, /application: application \? projectApplicationForOwner\(application\) : null/);
    assert.match(source, /account: account\.about/);
  });

  test("the save and the send answer with the caller's own application, projected", () => {
    assert.match(code(ROUTE), /application: saved \? projectApplicationForOwner\(saved\) : null/);
    assert.match(code(SEND), /application: sent \? projectApplicationForOwner\(sent\) : null/);
  });

  test("the page's loader builds the very same four fields", () => {
    const source = code(STORE);
    assert.match(source, /form: projectFormForApplicant\(loaded\.form, now\)/);
    assert.match(source, /sets: loaded\.sets\.map\(projectQuestionSetForApplicant\)/);
    assert.match(source, /application: application \? projectApplicationForOwner\(application\) : null/);
  });

  test("no response in the applicant's lane spreads a stored document", () => {
    for (const path of [ROUTE, SEND, STORE, "src/lib/applications/applicant/project.ts"]) {
      const source = code(path);
      // A spread of the document itself. Copying one of its lists (`[...form.questionSetIds]`) is not that.
      assert.equal(
        /\.\.\.\s*(form|loaded|application|round|snap|set|question|programme|content|about)\b(?!\s*\.)/.test(source),
        false,
        `${path} spreads a stored document`,
      );
      assert.equal(/\.data\(\)\s*[,})]/.test(source.replace(/normaliseApplication\([^)]*\)/g, "").replace(/aboutYouFromAccount\([^)]*\)/g, "")), false, `${path} hands on a raw document`);
    }
  });

  test("a signed-out visitor's page is handed the form's id, its name and its two dates, nothing more", () => {
    // The first step for a visitor is their join request (`JoinStep`). It is
    // handed nothing of the form but what an open form says to anybody: no
    // programme, no question set, no question.
    const screen = code("src/features/applications/apply/ApplyScreen.tsx");
    const signedOut = screen.slice(screen.indexOf("if (!user) {"), screen.indexOf('if (user.role === "rejected")'));
    assert.match(
      signedOut,
      /<JoinStep\s+roundId=\{form\.id\}\s+label=\{form\.label\}\s+closesLabel=\{form\.closesLabel\}\s+decisionsLabel=\{form\.decisionsLabel\}\s+signedIn=\{false\}\s+signedInAs=\{null\}\s+fromLink=\{false\}\s+\/>/,
    );
    // One step is drawn for a visitor, and that element is the whole of what
    // reaches their browser from the form.
    const drawn = signedOut.match(/<JoinStep\b[\s\S]*?\/>/g) ?? [];
    assert.equal(drawn.length, 1);
    assert.equal(/\{\.\.\.|form=\{|sets=\{|programmes|questionSetIds/.test(drawn[0]), false, "a visitor's page is handed part of the form");
  });
});
