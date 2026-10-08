/**
 * A programme's lead and reviewers can see who joined by invitation, and
 * nobody sooner.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * A lead read only the people who RANKED their programme. Somebody invited
 * to it did not rank it, so once they accepted they were in the programme and
 * on none of its screens, and their page answered "We can't find that" to the
 * one person who most needed to open it.
 *
 * The rule now (`joinedByInvitation` in `src/lib/applications/decisions.ts`,
 * `canReadApplication` in `access.ts`): from the moment an invited person
 * ACCEPTS, that programme's lead and reviewers read their application as if
 * they had ranked it, and they have a row in its list, marked as there by
 * invitation, with no decision left to make. Until they accept, the
 * programme's staff see a number of places kept for invitations and never
 * the person: they did not pick the programme and may yet say no.
 *
 * ## What is executed
 *
 *  1. THE PREDICATES, for every way an invitation can stand.
 *  2. WHO CAN READ WHOM: every person in the sample term against every kind
 *     of account, through the real `canReadApplication`.
 *  3. THE LIST AND THE SINGLE APPLICATION, through the loaders the pages and
 *     the GET routes call (`review/load.ts`), as each kind of account: the
 *     joined programme's lead and its reviewer, the lead and the reviewer of
 *     another programme, a committee member named on nothing, an admin, and
 *     the applicant themselves.
 *
 * Stubbed: `server-only`, the Admin SDK's one value, and the two repository
 * modules, which are handed this file's documents. The predicates, the
 * eligibility module and the builders are the shipping ones.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

globalThis.__joined = { form: null, applications: [], decisions: new Map() };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => new Date(0) };"],
    [
      "../repo",
      [
        "export async function loadForm() { return globalThis.__joined.form; }",
        "export async function loadQuestionSets() { return []; }",
      ].join("\n"),
    ],
    [
      "../staffRepo",
      [
        "export async function listSentApplications() { return globalThis.__joined.applications; }",
        "export async function listDecisions() { return globalThis.__joined.decisions; }",
        "export async function listReviews() { return []; }",
      ].join("\n"),
    ],
  ]),
});
const lib = (...parts) => join("lib", "applications", ...parts);

const decisions = await loadTs(lib("decisions.ts"));
const normalise = await loadTs(lib("normalise.ts"));
const access = await loadTs(lib("access.ts"));
const reviewLoad = await loadTs(lib("review", "load.ts"));

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND = "autumn-2026__k3f9a2b1";
const NOW = new Date("2026-10-24T10:00:00Z");
const SENT_AT = new Date("2026-10-17T13:20:00Z");
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

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
  displayName: uid,
  role,
  suRecognised,
  admissionsReviewer: suRecognised,
  permissions: PERMISSIONS,
});

/** Who each account is to Technical AI Safety, the programme people are invited to. */
const STAFF = {
  zach: session("zach", "admin"),
  // Its lead and its reviewer.
  tess: session("tess", "committee", true),
  rae: session("rae", "committee", true),
  // The lead and the reviewer of another programme.
  claudia: session("claudia", "committee", true),
  lloyd: session("lloyd", "committee", true),
  // The lead of the incubator, which everybody invited here ranked.
  ines: session("ines", "committee", true),
  // SU-recognised committee, named on nothing.
  yusuf: session("yusuf", "committee", true),
};

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "",
  starts: "w/c 26 Oct",
  places: 4,
  groupCount: 1,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});

const FORM = normalise.normaliseForm(ROUND, {
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
  reviewerUids: ["claudia", "lloyd", "tess", "rae", "ines"],
  finalDeciderUid: null,
  archived: false,
  authorUid: "zach",
  programmeIds: [AGI, TAIS, INC],
  programmes: {
    [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", leadUid: "claudia", reviewerUids: ["lloyd"] }),
    [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "tess", reviewerUids: ["rae"] }),
    [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", leadUid: "ines", places: 2 }),
  },
  questionSetIds: [],
  asksFacilitating: false,
  revealOtherReviews: false,
  noOfferWording: null,
  decisionsSentAt: null,
  decisionsSentByUid: null,
});

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

const decided = (decision) => ({ decision, poolReason: null, couldSuitProgrammeId: null, decidedByUid: "ines", decidedAt: SENT_AT });
const inviteToTais = { kind: "invite", programmeId: TAIS, setByUid: "zach", setAt: SENT_AT };
const result = (kind, programmeId = null) => ({ kind, programmeId, publishedAt: SENT_AT, email: "sent", emailedAt: SENT_AT, emailClaimedAt: null });

/**
 * Everybody but Pia ranked the incubator alone, was pooled by it, and has
 * Technical AI Safety picked for an invitation.
 *
 *  - oli: told, and ACCEPTED. He is in Technical AI Safety.
 *  - gil: told, accepted, and then could not make it.
 *  - una: told, and has not answered.
 *  - ned: told, and said no thanks.
 *  - vic: picked for the invitation, and not told yet.
 *  - pia: ranked Technical AI Safety herself, and its lead accepted her.
 */
const PEOPLE = {
  oli: { ranked: [INC], status: "accepted", told: true, response: "accepted" },
  gil: { ranked: [INC], status: "withdrawn", told: true, response: "accepted", attendance: "cant-make-it" },
  una: { ranked: [INC], status: "invited", told: true, response: null },
  ned: { ranked: [INC], status: "withdrawn", told: true, response: "declined" },
  vic: { ranked: [INC], status: "submitted", told: false, response: null },
  pia: { ranked: [TAIS], status: "accepted", told: true, own: true },
};
const NAMES = { oli: "Oli Marsh", gil: "Gil Odum", una: "Una Brook", ned: "Ned Farrow", vic: "Vic Lang", pia: "Pia Senn" };

function application(uid) {
  const person = PEOPLE[uid];
  const content = {
    aboutYou: {
      preferredName: NAMES[uid].split(" ")[0],
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
  return normalise.normaliseApplication(
    `${ROUND}__${uid}`,
    {
      formVersion: 2,
      roundId: ROUND,
      uid,
      email: `${uid}@example.com`,
      displayName: NAMES[uid],
      draft: content,
      sent: content,
      status: person.status,
      submittedAt: SENT_AT,
      sentAt: SENT_AT,
      withdrawnAt: person.status === "withdrawn" ? NOW : null,
      result: !person.told ? null : person.own ? result("accepted", TAIS) : result("invited", TAIS),
      invitation:
        person.told && !person.own
          ? { programmeId: TAIS, replyBy: "2026-10-25", response: person.response, respondedAt: person.response ? NOW : null, lastReminderOn: null }
          : null,
      attendance: person.attendance ? { answer: person.attendance, answeredAt: NOW } : null,
      createdAt: SENT_AT,
      updatedAt: SENT_AT,
    },
    GRID,
  );
}

const APPLICATIONS = Object.fromEntries(Object.keys(PEOPLE).map((uid) => [uid, application(uid)]));
const DECISIONS = new Map(
  Object.keys(PEOPLE).map((uid) => [
    uid,
    normalise.normaliseDecision(`${ROUND}__${uid}`, {
      roundId: ROUND,
      uid,
      programmes: PEOPLE[uid].own ? { [TAIS]: decided("accept") } : { [INC]: decided("pool") },
      pooledOutcome: PEOPLE[uid].own ? null : inviteToTais,
      exception: null,
    }),
  ]),
);

globalThis.__joined = { form: FORM, applications: Object.values(APPLICATIONS), decisions: DECISIONS };

/** A database that knows the accounts and nothing else. */
const ACCOUNTS = {
  ...Object.fromEntries(Object.keys(STAFF).map((uid) => [uid, { displayName: uid, role: STAFF[uid].role }])),
  ...Object.fromEntries(Object.keys(PEOPLE).map((uid) => [uid, { displayName: NAMES[uid], role: "member" }])),
};
const db = {
  collection: (name) => ({
    doc: (id) => ({ id, collection: name }),
    where: () => ({ get: async () => ({ docs: [] }) }),
  }),
  getAll: async (...refs) =>
    refs.map((ref) => ({ id: ref.id, exists: ACCOUNTS[ref.id] !== undefined, data: () => ACCOUNTS[ref.id] })),
};

// ---------------------------------------------------------------------------
// 1. The predicates
// ---------------------------------------------------------------------------

describe("who has joined a programme by invitation", () => {
  test("only somebody who ACCEPTED, and then for good", () => {
    assert.deepEqual(
      Object.fromEntries(Object.keys(PEOPLE).map((uid) => [uid, decisions.joinedByInvitation(APPLICATIONS[uid])])),
      // Gil accepted and later could not make it: still the programme he joined.
      { oli: TAIS, gil: TAIS, una: null, ned: null, vic: null, pia: null },
    );
  });

  test("an invitation on an application that was never sent, or beside another result, is nothing", () => {
    const accepted = { programmeId: TAIS, replyBy: "2026-10-25", response: "accepted" };
    assert.equal(decisions.joinedByInvitation({ sent: null, result: result("invited", TAIS), invitation: accepted }), null);
    assert.equal(decisions.joinedByInvitation({ sent: {}, result: null, invitation: accepted }), null);
    assert.equal(decisions.joinedByInvitation({ sent: {}, result: result("accepted", TAIS), invitation: accepted }), null);
    assert.equal(decisions.joinedByInvitation({ sent: {}, result: result("invited", TAIS), invitation: null }), null);
  });
});

// ---------------------------------------------------------------------------
// 2. Who can read whom
// ---------------------------------------------------------------------------

const canRead = (user, uid) =>
  access.canReadApplication(
    user,
    FORM,
    APPLICATIONS[uid].sent.rankedProgrammeIds,
    decisions.joinedByInvitation(APPLICATIONS[uid]),
  );

describe("who can read whom", () => {
  const readers = (uid) => Object.keys(STAFF).filter((who) => canRead(STAFF[who], uid));

  test("somebody who accepted an invitation: the staff of what they ranked, and now of what they joined", () => {
    assert.deepEqual(readers("oli"), ["zach", "tess", "rae", "ines"]);
    // And still, after giving the place back, as for anybody who left after applying.
    assert.deepEqual(readers("gil"), ["zach", "tess", "rae", "ines"]);
  });

  test("somebody invited who has not accepted: only the staff of what they ranked", () => {
    for (const uid of ["una", "ned", "vic"]) assert.deepEqual(readers(uid), ["zach", "ines"], uid);
  });

  test("somebody who ranked the programme is read as before", () => {
    assert.deepEqual(readers("pia"), ["zach", "tess", "rae"]);
  });

  test("a role on another programme, or on none, reads nobody who was invited here", () => {
    for (const who of ["claudia", "lloyd", "yusuf"]) {
      for (const uid of Object.keys(PEOPLE)) assert.equal(canRead(STAFF[who], uid), false, `${who} reads ${uid}`);
    }
  });

  test("the applicant's own account has no role, so it reads nothing here, its own application included", () => {
    const oli = session("oli", "member");
    for (const uid of Object.keys(PEOPLE)) assert.equal(canRead(oli, uid), false, uid);
  });

  test("a lead who has lost their standing reads nobody, joined or not", () => {
    const fallen = { ...STAFF.tess, role: "member", suRecognised: false };
    for (const uid of Object.keys(PEOPLE)) assert.equal(canRead(fallen, uid), false, uid);
  });

  test("a joined programme that is not on the form gives nobody anything", () => {
    assert.equal(access.canReadApplication(STAFF.tess, FORM, [INC], "left-the-form"), false);
    assert.equal(access.canReadApplication(STAFF.tess, FORM, [INC], "constructor"), false);
    assert.equal(access.canReadApplication(STAFF.tess, FORM, [INC], null), false);
    assert.equal(access.canReadApplication(STAFF.tess, FORM, [INC]), false);
  });
});

// ---------------------------------------------------------------------------
// 3. The list and the single application, as each kind of account
// ---------------------------------------------------------------------------

const listFor = (who, programmeId) => reviewLoad.loadProgrammeBoard(db, STAFF[who], ROUND, programmeId);
const open = (user, uid, programmeId) => reviewLoad.loadReview(db, user, ROUND, uid, programmeId);

describe("the list of the programme somebody joined", () => {
  for (const who of ["tess", "rae", "zach"]) {
    test(`as ${who}: the people who ranked it, and the people who accepted an invitation to it`, async () => {
      const list = await listFor(who, TAIS);
      assert.equal(list.ok, true);
      const rows = Object.fromEntries(list.board.rows.map((row) => [row.uid, row]));
      // Nobody who was only picked, has not answered, or said no.
      assert.deepEqual(Object.keys(rows).sort(), ["gil", "oli", "pia"]);

      const { oli, gil, pia } = rows;
      assert.deepEqual(
        [oli.byInvitation, oli.choice, oli.firstChoiceName, oli.standing, oli.owesDecision, oli.told, oli.withdrawn, oli.placedOn],
        [true, 0, "Research incubator", "accepted", false, true, false, null],
      );
      assert.deepEqual([gil.byInvitation, gil.withdrawn, gil.standing], [true, true, "accepted"]);
      assert.deepEqual([pia.byInvitation, pia.choice, pia.standing], [false, 1, "accepted"]);

      // The numbers: Pia and Oli hold two of the four places, and two more
      // are kept for Una and Vic, who are counted and not shown.
      assert.deepEqual(
        [list.board.progress.placed, list.board.progress.invited, list.board.progress.placesLeft],
        [2, 2, 0],
      );
      assert.deepEqual(list.board.counts, { all: 2, toReview: 0, accepted: 2, pooled: 0, declined: 0 });
      assert.deepEqual(
        [list.board.progress.applications, list.board.progress.decided, list.board.progress.toReview, list.board.progress.emailed],
        [2, 2, 0, 2],
      );
      // Rows in the term are the ones counted; Gil is listed and not counted.
      assert.equal(list.board.rows.filter((row) => !row.withdrawn).length, list.board.counts.all);
      // Nobody is waiting on somebody who joined by invitation, and the scores recommend nobody for it.
      assert.deepEqual(list.board.queue, []);
      assert.ok(!JSON.stringify(list.board.recommendations).includes("oli"));
    });
  }

  test("nobody who has not accepted is anywhere in what the lead is sent", async () => {
    const sent = JSON.stringify((await listFor("tess", TAIS)).board);
    for (const uid of ["una", "ned", "vic"]) {
      assert.ok(!sent.includes(`"${uid}"`), `${uid}'s id`);
      assert.ok(!sent.includes(NAMES[uid]), `${uid}'s name`);
    }
    assert.ok(!sent.includes("@"), "no address");
  });

  test("the list of the programme they ranked still has every one of them, joined or not", async () => {
    const list = await listFor("ines", INC);
    assert.deepEqual(list.board.rows.map((row) => row.uid).sort(), ["gil", "ned", "oli", "una", "vic"]);
    assert.ok(list.board.rows.every((row) => row.byInvitation === false));
  });

  test("the list of a programme they neither ranked nor joined has none of them", async () => {
    for (const who of ["claudia", "lloyd"]) {
      const list = await listFor(who, AGI);
      assert.equal(list.ok, true);
      assert.deepEqual(list.board.rows, [], who);
    }
  });

  test("somebody with no role on the programme is told there is nothing here", async () => {
    for (const who of ["claudia", "lloyd", "ines", "yusuf"]) {
      assert.deepEqual(await listFor(who, TAIS), { ok: false, status: 404, error: "Not found" }, who);
    }
  });
});

describe("the application of somebody who joined by invitation", () => {
  for (const who of ["tess", "rae"]) {
    test(`as ${who}: opened under the programme they joined, as a record with nothing to decide`, async () => {
      const found = await open(STAFF[who], "oli", TAIS);
      assert.equal(found.ok, true);
      const { applicant, decision, review, programme: under, viewer } = found.review;
      assert.equal(applicant.name, "Oli Marsh");
      assert.deepEqual(applicant.invitedTo, { programmeId: TAIS, shortName: "Technical AI Safety" });
      // What he ranked is shown as he ranked it, and none of it is this screen's.
      assert.deepEqual(applicant.ranked, [{ programmeId: INC, shortName: "Research incubator", choice: 1, focus: false }]);
      assert.equal(under.id, TAIS);
      assert.deepEqual(
        [decision.byInvitation, decision.standing, decision.kind, decision.owesDecision, decision.told, decision.placedOn],
        [true, "accepted", null, false, true, null],
      );
      // Nothing of this programme's to score: he never answered its questions.
      assert.deepEqual(review.scorableKeys, []);
      assert.equal(viewer.canDecide, who === "tess");
      // An address is an admin's to see, here as everywhere.
      assert.ok(!("email" in applicant) && !("universityEmail" in applicant));
    });

    test(`as ${who}: with no programme named, it opens under the one they joined`, async () => {
      const found = await open(STAFF[who], "oli", null);
      assert.equal(found.ok, true);
      assert.equal(found.review.programme.id, TAIS);
    });

    test(`as ${who}: somebody who accepted and then could not make it can still be opened, marked`, async () => {
      const found = await open(STAFF[who], "gil", TAIS);
      assert.equal(found.ok, true);
      assert.deepEqual([found.review.applicant.withdrawn, found.review.decision.byInvitation], [true, true]);
    });

    test(`as ${who}: nobody who has not accepted can be opened, under any programme`, async () => {
      for (const uid of ["una", "ned", "vic"]) {
        for (const programmeId of [TAIS, INC, null]) {
          assert.deepEqual(await open(STAFF[who], uid, programmeId), { ok: false, status: 404, error: "Not found" }, `${uid} ${programmeId}`);
        }
      }
    });
  }

  test("an admin opens it under the programme they joined, and under the one they ranked", async () => {
    const joined = await open(STAFF.zach, "oli", TAIS);
    assert.equal(joined.ok, true);
    assert.equal(joined.review.decision.byInvitation, true);
    assert.equal(joined.review.applicant.email, "oli@example.com");
    const ranked = await open(STAFF.zach, "oli", INC);
    assert.equal(ranked.ok, true);
    assert.deepEqual([ranked.review.decision.byInvitation, ranked.review.applicant.invitedTo], [false, null]);
    // And not under a programme they are on the list of in neither way.
    assert.equal((await open(STAFF.zach, "oli", AGI)).ok, false);
  });

  test("the lead of what they ranked still opens it there, and is not shown it under the other", async () => {
    const found = await open(STAFF.ines, "oli", INC);
    assert.equal(found.ok, true);
    assert.equal(found.review.decision.byInvitation, false);
    assert.equal((await open(STAFF.ines, "oli", TAIS)).ok, false);
  });

  test("the lead and the reviewer of another programme, and somebody named on nothing, cannot", async () => {
    for (const who of ["claudia", "lloyd", "yusuf"]) {
      for (const programmeId of [TAIS, INC, AGI, null]) {
        assert.deepEqual(await open(STAFF[who], "oli", programmeId), { ok: false, status: 404, error: "Not found" }, `${who} ${programmeId}`);
      }
    }
  });

  test("the applicant themselves cannot, as a member or as somebody who also leads the programme", async () => {
    assert.equal((await open(session("oli", "member"), "oli", TAIS)).ok, false);
    // Even with a role there: nobody reads their own application through these screens.
    const alsoLead = { ...STAFF.tess, uid: "oli" };
    assert.equal((await open(alsoLead, "oli", TAIS)).ok, false);
    assert.equal((await open({ ...STAFF.zach, uid: "oli" }, "oli", TAIS)).ok, false);
  });
});
