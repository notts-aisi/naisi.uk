/**
 * One rule for who is in the term, held on every screen that counts.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * After decision day somebody can give a place back ("I can't make it") or
 * turn an invitation down ("No thanks"). Their reply is written to their own
 * application, which becomes `withdrawn`. It cannot touch the decision
 * documents, so those go on saying Accept, and the contract's arithmetic
 * (`tallyTerm`) counts a place from the decision documents. A place given
 * back is therefore free only where the caller of that arithmetic left the
 * withdrawn application out first.
 *
 * Until this change the decision-day screens did and the review list and the
 * term page did not, so "places left" on one screen went on counting somebody
 * the other had let go. The rule is now one predicate in the contract,
 * `isInTerm` (`src/lib/applications/decisions.ts`), and this file holds it in
 * three layers:
 *
 *  1. THE PREDICATE: every status, sent and not.
 *  2. THE SCREENS AGREE. One stored term, in which three people have left in
 *     the three ways there are to leave, is handed to each thing that counts:
 *     the review list's picture and builder, the decision-day plan, and the
 *     two loaders behind the programme's tab and the term's tally. Every
 *     number has to be the same number, and has to be what a recount of the
 *     people still in the term gives.
 *  3. THE TREE. Every file under `src/` that calls the arithmetic, or reads
 *     every sent application on a form, either asks `isInTerm` itself or is
 *     listed here with the function it hands the list to, which does. A new
 *     caller that does neither fails this file, so the next screen that
 *     counts cannot forget.
 *
 * ## What is real and what is stubbed
 *
 * Real: `decisions.ts`, `review/term.ts`, `review/board.ts`,
 * `decisionDay/plan.ts`, `editor/load.ts` and the normalisers under them.
 * Stubbed: `server-only`, and `../staffRepo` for the two editor loaders, so
 * they are handed this file's applications and decisions with no database.
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

globalThis.__inTerm = { applications: [], decisions: new Map() };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "../staffRepo",
      [
        "export async function listSentApplications() { return globalThis.__inTerm.applications; }",
        "export async function listDecisions() { return globalThis.__inTerm.decisions; }",
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

// ---------------------------------------------------------------------------
// 1. The predicate
// ---------------------------------------------------------------------------

const STATUSES = ["draft", "submitted", "accepted", "invited", "no-offer", "declined", "withdrawn"];

describe("who is in the term", () => {
  test("a sent application is, in every status but withdrawn", () => {
    for (const status of STATUSES) {
      assert.equal(decisions.isInTerm({ sent: {}, status }), status !== "withdrawn", status);
    }
  });

  test("an application that was never sent is not, whatever its status says", () => {
    for (const status of STATUSES) {
      assert.equal(decisions.isInTerm({ sent: null, status }), false, status);
    }
  });

  test("the decision-day screens ask the contract's own predicate, not one of their own", () => {
    assert.equal(plan.isInTerm, decisions.isInTerm);
  });
});

// ---------------------------------------------------------------------------
// 2. One term, every screen that counts
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const ROUND = "autumn-2026__k3f9a2b1";
const NOW = new Date("2026-10-24T10:00:00Z");
const SENT_AT = new Date("2026-10-17T13:20:00Z");
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

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
  reviewerUids: ["claudia"],
  finalDeciderUid: null,
  archived: false,
  authorUid: "zach",
  programmeIds: [AGI, TAIS],
  programmes: {
    [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy" }),
    [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", useScores: false }),
  },
  questionSetIds: [AGI],
  asksFacilitating: false,
  revealOtherReviews: true,
  noOfferWording: null,
  decisionsSentAt: SENT_AT,
  decisionsSentByUid: "zach",
});

const SETS = [
  normalise.normaliseQuestionSet(AGI, {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    intro: "",
    questions: [
      {
        id: "event",
        text: "Which event mattered most?",
        help: "",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 300,
        required: true,
        scored: true,
      },
    ],
  }),
];

const result = (kind, programmeId) => ({
  kind,
  programmeId,
  publishedAt: SENT_AT,
  email: "sent",
  emailedAt: SENT_AT,
  emailClaimedAt: null,
});

/**
 * The people, as decision day left them, and then how three of them left.
 *
 *  - amara: accepted by AGI Strategy, her 1st choice. Later: "I can't make it".
 *  - ben: accepted by AGI Strategy. Stays.
 *  - dev: AGI Strategy has not decided. Stays.
 *  - george: AGI Strategy has not decided. Later: withdraws.
 *  - wen: pooled by Technical AI Safety, invited to AGI Strategy. Later: "No thanks".
 *  - rosa: pooled by Technical AI Safety, invited to AGI Strategy. No reply yet.
 */
const PEOPLE = [
  { uid: "amara", name: "Amara Okafor", ranked: [AGI, TAIS], status: "accepted", result: result("accepted", AGI), leaves: true },
  { uid: "ben", name: "Ben Hartley", ranked: [AGI], status: "accepted", result: result("accepted", AGI) },
  { uid: "dev", name: "Dev Patel", ranked: [AGI], status: "submitted", result: null },
  { uid: "george", name: "George Mills", ranked: [AGI], status: "submitted", result: null, leaves: true },
  { uid: "wen", name: "Wen Zhao", ranked: [TAIS], status: "invited", result: result("invited", AGI), leaves: true },
  { uid: "rosa", name: "Rosa Lind", ranked: [TAIS], status: "invited", result: result("invited", AGI) },
];

const decided = (decision) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: "claudia",
  decidedAt: SENT_AT,
});
const invite = { kind: "invite", programmeId: AGI, setByUid: "zach", setAt: SENT_AT };

/** What the leads and the admin decided. A reply changes none of it. */
const DECISIONS = new Map(
  [
    ["amara", { [AGI]: decided("accept") }, null],
    ["ben", { [AGI]: decided("accept") }, null],
    ["wen", { [TAIS]: decided("pool") }, invite],
    ["rosa", { [TAIS]: decided("pool") }, invite],
  ].map(([uid, programmes, pooledOutcome]) => [
    uid,
    normalise.normaliseDecision(`${ROUND}__${uid}`, { roundId: ROUND, uid, programmes, pooledOutcome, exception: null }),
  ]),
);

/** Amara scored 5 on AGI Strategy's question, Ben 4, Dev 3, George 2. */
const REVIEWS = [
  ["amara", 5],
  ["ben", 4],
  ["dev", 3],
  ["george", 2],
].map(([uid, score]) =>
  normalise.normaliseReview(`${ROUND}__${uid}__claudia`, {
    roundId: ROUND,
    applicantUid: uid,
    reviewerUid: "claudia",
    scores: { [`${AGI}.event`]: score },
    comments: [],
    overallComment: "",
  }),
);

function application(person, left) {
  const content = {
    aboutYou: {
      preferredName: person.name.split(" ")[0],
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
    answers: person.ranked.includes(AGI) ? { [AGI]: { event: "A new law came into force." } } : {},
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
  return normalise.normaliseApplication(
    `${ROUND}__${person.uid}`,
    {
      formVersion: 2,
      roundId: ROUND,
      uid: person.uid,
      email: `${person.uid}@example.com`,
      displayName: person.name,
      draft: content,
      sent: content,
      status: left ? "withdrawn" : person.status,
      submittedAt: SENT_AT,
      sentAt: SENT_AT,
      withdrawnAt: left ? NOW : null,
      result: person.result,
      invitation:
        person.result?.kind === "invited"
          ? { programmeId: AGI, replyBy: "2026-10-25", response: left ? "declined" : null, respondedAt: left ? NOW : null, lastReminderOn: null }
          : null,
      attendance: left && person.result?.kind === "accepted" ? { answer: "cant-make-it", answeredAt: NOW } : null,
      createdAt: SENT_AT,
      updatedAt: SENT_AT,
    },
    GRID,
  );
}

/** The term before anybody left, and after the three who leave have. */
const BEFORE = PEOPLE.map((person) => application(person, false));
const AFTER = PEOPLE.map((person) => application(person, person.leaves === true));

/** An admin who has no application of their own on the form. */
const ADMIN = { uid: "zach", name: "Zach", isAdmin: true, roles: { [AGI]: "admin", [TAIS]: "admin" } };

const pictureOf = (applications, viewerUid = "zach") =>
  reviewTerm.termPictureFor({ form: FORM, applications, decisions: DECISIONS, reviews: REVIEWS, viewerUid });

const boardOf = (applications, programmeId) =>
  reviewBoard.buildProgrammeBoard({
    form: FORM,
    sets: SETS,
    term: pictureOf(applications),
    viewer: ADMIN,
    programmeId,
    canDecide: true,
    pendingUids: new Set(),
    staffNames: new Map(),
  });

/** The tally a careful person would make by hand: the people in the term, and nobody else. */
const recount = (applications) =>
  decisions.tallyTerm(
    FORM,
    applications
      .filter((entry) => entry.sent !== null && entry.status !== "withdrawn")
      .map((entry) => ({
        uid: entry.uid,
        ranked: entry.sent.rankedProgrammeIds,
        decision: DECISIONS.get(entry.uid) ?? null,
      })),
  );

describe("a place given back is free on every screen at once", () => {
  test("the sample term is what its comment says, before and after", () => {
    const before = recount(BEFORE);
    assert.equal(before.applicants, 6);
    assert.deepEqual(
      { ...before.programmes[AGI] },
      { applications: 4, firstChoice: 4, toReview: 2, accepted: 2, pooled: 0, declined: 0, placed: 2, joined: 0, invited: 2 },
    );
    assert.equal(decisions.freePlaces(FORM, before, AGI), 0);

    const after = recount(AFTER);
    assert.equal(after.applicants, 3);
    assert.deepEqual(
      { ...after.programmes[AGI] },
      { applications: 2, firstChoice: 2, toReview: 1, accepted: 1, pooled: 0, declined: 0, placed: 1, joined: 0, invited: 1 },
    );
    assert.equal(decisions.freePlaces(FORM, after, AGI), 2, "two of AGI Strategy's four places came back");
    assert.deepEqual(after.outcomes, { accepted: 1, invited: 1, noOffer: 0, declined: 0, needsOutcome: 0, undecided: 1 });
  });

  for (const [label, applications] of [
    ["before anybody leaves", BEFORE],
    ["after three people have left", AFTER],
  ]) {
    test(`${label}: the review list, the decision-day plan and the term's tally are one arithmetic`, async () => {
      const expected = recount(applications);
      assert.deepEqual(pictureOf(applications).tally, expected, "the review list's picture");
      assert.deepEqual(plan.planTerm(FORM, applications, DECISIONS).tally, expected, "the decision-day plan");

      globalThis.__inTerm = { applications, decisions: DECISIONS };
      assert.deepEqual(await editorLoad.loadTermTally({}, FORM), expected, "the term's tally");
      for (const programmeId of [AGI, TAIS]) {
        assert.equal(
          await editorLoad.countApplicationsTo({}, FORM, programmeId),
          expected.programmes[programmeId].applications,
          `the number beside ${programmeId}'s Applications tab`,
        );
      }
    });
  }

  test("the review list counts the term, and still lists who left, marked", () => {
    const board = boardOf(AFTER, AGI);
    const tally = recount(AFTER).programmes[AGI];

    // Listed: everybody whose sent application ranks AGI Strategy.
    assert.deepEqual(board.rows.map((row) => row.uid).sort(), ["amara", "ben", "dev", "george"]);
    assert.deepEqual(
      board.rows.filter((row) => row.withdrawn).map((row) => row.uid).sort(),
      ["amara", "george"],
    );

    // Counted: the people in the term.
    assert.deepEqual(board.counts, { all: 2, toReview: 1, accepted: 1, pooled: 0, declined: 0 });
    assert.equal(board.counts.all, tally.applications);
    assert.equal(board.progress.applications, 2);
    assert.equal(board.progress.decided, 1);
    assert.equal(board.progress.toReview, 1);
    assert.equal(board.progress.placed, 1);
    assert.equal(board.progress.invited, 1);
    assert.equal(board.progress.placesLeft, 2);
    // Ben was told. Amara was told too, and is no longer one of the people here.
    assert.equal(board.progress.emailed, 1);
    assert.ok(board.progress.emailed <= board.progress.applications);
  });

  test("nobody is waiting on an application its owner took out", () => {
    assert.deepEqual(boardOf(BEFORE, AGI).queue.sort(), ["dev", "george"]);
    const board = boardOf(AFTER, AGI);
    assert.deepEqual(board.queue, ["dev"]);
    assert.equal(board.queue.length, board.counts.toReview);
  });

  test("the scores recommend nobody who has left for a place", () => {
    // Amara has the highest score on AGI Strategy and has given her place back.
    assert.equal(boardOf(BEFORE, AGI).recommendations.top[0], "amara");
    const { recommendations } = boardOf(AFTER, AGI);
    assert.deepEqual(recommendations.top, ["ben", "dev"]);
    assert.equal(recommendations.scoredCount, 2);
    for (const uid of ["amara", "george"]) {
      assert.ok(!recommendations.top.includes(uid) && !recommendations.borderline.includes(uid), uid);
    }
  });

  test("a row names no programme somebody who has left is placed on", () => {
    // Technical AI Safety is Amara's 2nd choice. AGI Strategy accepted her, so
    // this programme owes her nothing, and its list said where she was placed.
    const before = boardOf(BEFORE, TAIS).rows.find((row) => row.uid === "amara");
    assert.equal(before.placedOn, "AGI Strategy");
    assert.equal(before.withdrawn, false);
    const after = boardOf(AFTER, TAIS).rows.find((row) => row.uid === "amara");
    assert.equal(after.placedOn, null);
    assert.equal(after.withdrawn, true);
  });

  test("the decision-day plan lists only the people in the term", () => {
    assert.deepEqual(
      plan.planTerm(FORM, AFTER, DECISIONS).people.map((person) => person.uid).sort(),
      ["ben", "dev", "rosa"],
    );
  });

  test("a caller's own application is still left out before anything is counted", () => {
    // Ben is in the term. Read as Ben, the picture neither lists nor counts him.
    const picture = pictureOf(AFTER, "ben");
    assert.ok(!picture.applications.some((entry) => entry.uid === "ben"));
    assert.equal(picture.tally.applicants, 2);
    assert.equal(picture.tally.programmes[AGI].accepted, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Every caller in the tree
// ---------------------------------------------------------------------------

/** A call of the arithmetic, or a read of every sent application on a form. */
const COUNTS = /(?<!function\s)\b(?:tallyTerm|listSentApplications)\s*\(/;
/** The predicate, called or handed to a filter. */
const ASKS = /\bisInTerm\b/;
/** An import or a re-export names the predicate without asking it. */
const NAMES_ONLY = /\b(?:import|export)\s*(?:type\s*)?\{[^}]*\}\s*(?:from\s*""\s*)?;/g;

/**
 * Files that read every sent application and do not ask `isInTerm`
 * themselves, with the function they hand the list to. That function's own
 * file has to ask it, which the test below checks, so an entry here cannot
 * outlive the thing it relies on.
 */
const HANDS_ON = new Map([
  [
    "src/lib/applications/review/load.ts",
    {
      to: "src/lib/applications/review/term.ts",
      why:
        "hands every sent application to termPictureFor, which keeps a withdrawn one in the " +
        "list for its marked row and leaves it out of the tally",
    },
  ],
  [
    "src/lib/applications/lifecycle/loadTermHome.ts",
    {
      to: "src/lib/applications/review/term.ts",
      why:
        "hands every sent application to termPictureFor for each programme's numbers and to " +
        "planTerm for the pooled numbers, and both leave a withdrawn one out before counting",
    },
  ],
  [
    "src/lib/scheduler/jobs/applicationInvitationReminders.ts",
    {
      to: "src/lib/applications/decisionDay/reminders.ts",
      why:
        "hands each sent application to invitationReminderDue, whose first question is whether " +
        "the application is still in the term, so nobody who has left is reminded",
    },
  ],
]);

/** Where the two functions are written. They are not callers of themselves. */
const DEFINES = new Set(["src/lib/applications/decisions.ts", "src/lib/applications/staffRepo.ts"]);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const repoPath = (file) => relative(ROOT, file).split(sep).join("/");
const codeOf = (path) => stripSource(readFileSync(join(ROOT, path), "utf8"));
const asks = (path) => ASKS.test(codeOf(path).replace(NAMES_ONLY, ""));

describe("every caller of the term's arithmetic asks who is in the term", () => {
  const callers = sourceFiles(SRC)
    .map(repoPath)
    .filter((path) => !DEFINES.has(path) && COUNTS.test(codeOf(path)))
    .sort();

  test("naming the predicate in an import is not asking it", () => {
    const imported = 'import { isInTerm, tallyTerm } from "";\nexport { isInTerm };\ntallyTerm(form, all);';
    assert.equal(ASKS.test(imported.replace(NAMES_ONLY, "")), false);
    assert.equal(ASKS.test(`${imported}\nall.filter(isInTerm);`.replace(NAMES_ONLY, "")), true);
  });

  test("the walk finds the callers there are known to be", () => {
    // If this list shrinks to nothing the pattern has stopped matching, and
    // every check below would pass by finding no file to hold.
    for (const known of [
      "src/lib/applications/decisionDay/plan.ts",
      "src/lib/applications/decisionDay/term.ts",
      "src/lib/applications/editor/load.ts",
      "src/lib/applications/review/term.ts",
    ]) {
      assert.ok(callers.includes(known), `${known} was not found by the walk`);
    }
  });

  test("each one asks isInTerm itself, or is listed with the function it hands on to", () => {
    const silent = callers.filter((path) => !asks(path));
    assert.deepEqual(
      silent,
      [...HANDS_ON.keys()].sort(),
      "these files call tallyTerm or read every sent application, and do not ask isInTerm. " +
        "Filter by isInTerm (src/lib/applications/decisions.ts) before counting, or, if the " +
        "list is handed whole to a function that does, add the file to HANDS_ON with that " +
        "function's file and the reason. A file listed in HANDS_ON that now asks for itself, " +
        "or no longer reads the list, comes off it.",
    );
  });

  test("each function a list is handed on to asks it", () => {
    for (const [path, { to, why }] of HANDS_ON) {
      assert.ok(asks(to), `${path} relies on ${to}, which no longer asks isInTerm`);
      assert.ok(typeof why === "string" && why.length > 40, `${path} needs a written reason`);
    }
  });

  test("the arithmetic says so where it is written", () => {
    const source = readFileSync(join(ROOT, "src/lib/applications/decisions.ts"), "utf8");
    assert.match(source, /EVERY CALLER OF `tallyTerm` FILTERS BY THIS FIRST/);
  });
});
