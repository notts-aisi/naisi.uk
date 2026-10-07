/**
 * What an application said before, kept and shown to whoever reviews it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * An applicant's edit counts only once they press Send again, and a send
 * replaces the application of record whole. When the new one is different,
 * the one it replaces is KEPT on the same document (`sentHistory`), with when
 * it was sent, and the review screens show what each part said before.
 *
 * Six things have to hold, and each has a section here:
 *
 *  1. WHAT COUNTS AS A CHANGE is any difference in the content, and nothing
 *     else: the order a map's keys came back in is not one.
 *  2. THE HISTORY IS BOUNDED, and the first version sent is never the one
 *     that goes. What goes is counted.
 *  3. A STORED HISTORY IS READ SAFELY, whatever is in it.
 *  4. A PART THAT CHANGED SHOWS WHAT IT SAID BEFORE, newest first, with the
 *     day that version was sent. A part that did not change shows nothing.
 *  5. A SCORE STAYS ON THE QUESTION, so the screen says when one was given
 *     before the answer changed, and names nobody whose review the reader is
 *     not shown.
 *  6. NOBODY ELSE IS SENT IT: not the applicant on their own pages, not a
 *     stranger, not the list, not the record the committee keeps afterwards.
 *
 * The send itself (that the version is kept in the same transaction, and
 * that a send with no change keeps nothing) is run through the route in
 * `tests/applications-apply-routes.test.mjs`, and one whole term in
 * `tests/applications-journey.test.mjs`.
 *
 * ## What is real and what is stubbed
 *
 * Real: the contract, `versions/kept.ts`, the review loaders and builders,
 * `access.ts`, the applicant's projections, the status page's read and the
 * member record's builder. Stubbed: `server-only` and the sentinels
 * `firebase-admin/firestore` supplies. The database is
 * `tests/lib/applicationsStore.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ]),
});
const lib = (...parts) => loadTs(join("lib", "applications", ...parts));

const model = await lib("model.ts");
const normalise = await lib("normalise.ts");
const kept = await lib("versions", "kept.ts");
const earlier = await lib("review", "earlier.ts");
const load = await lib("review", "load.ts");
const project = await lib("applicant", "project.ts");
const statusLoad = await lib("status", "load.ts");
const memberRecords = await loadTs(join("lib", "firestore", "memberRecords.ts"));
const words = await loadTs(join("features", "applications", "review", "changesWords.ts"));

// ---------------------------------------------------------------------------
// One small term
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__v3rs0001";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const NOW = new Date("2026-10-19T10:00:00+01:00");

/** The three days Amara pressed Send with something different, in London. */
const SAT_10 = new Date("2026-10-10T19:40:00+01:00");
const WED_14 = new Date("2026-10-14T21:05:00+01:00");
const SAT_17 = new Date("2026-10-17T14:20:00+01:00");
/** Claudia scored between the first and the second, Lloyd between the second and the third. */
const MON_12 = new Date("2026-10-12T18:00:00+01:00");
const THU_15 = new Date("2026-10-15T20:10:00+01:00");

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
const session = (uid, role, suRecognised, displayName) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  suRecognised,
  displayName,
  permissions: PERMISSIONS,
});
const CAST = {
  zach: session("zach", "admin", false, "Zach Levin"),
  claudia: session("claudia", "committee", true, "Claudia Reyes"),
  lloyd: session("lloyd", "committee", true, "Lloyd Brandon"),
  tess: session("tess", "committee", true, "Tess Okoro"),
  // SU-recognised committee, named on no programme.
  yusuf: session("yusuf", "committee", true, "Yusuf Demir"),
  amara: session("amara", "member", false, "Amara Okafor"),
  ben: session("ben", "member", false, "Ben Hartley"),
  nell: session("nell", "member", false, "Nell Carter"),
};

const question = (id, text, over = {}) => ({
  id,
  text,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
  ...over,
});
const SETS = {
  fellowships: {
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    questions: [question("why", "Why this term?"), question("read", "What have you read?", { required: false })],
  },
  [AGI]: {
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    questions: [
      question("event", "Pick something that happened in AI this year.", { scored: true }),
      question("plan", "What would you do about it?", { scored: true }),
    ],
  },
  [TAIS]: {
    role: "stream",
    scope: { type: "programme", programmeId: TAIS },
    label: "Technical AI Safety",
    questions: [
      question("python", "How comfortable are you writing Python?", {
        type: "scale",
        options: ["Never tried", "Can follow it", "Write it often"],
        scored: true,
      }),
      question("built", "Something you have built.", { scored: true }),
    ],
  },
  facilitator: {
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    questions: [question("led", "Have you led a discussion before?")],
  },
};

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "6 WEEKS",
  starts: "w/c 26 Oct",
  groupSize: "Up to 8",
  groupCount: 4,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});
const roundDoc = () => ({
  formVersion: 2,
  kind: "enrolment",
  label: "Autumn 2026",
  slug: "autumn-2026",
  status: "deciding",
  archived: false,
  opensAt: new Date("2026-10-06T09:00:00+01:00"),
  closesAt: new Date("2026-10-18T23:59:00+01:00"),
  decisionsByDate: "2026-10-23",
  availabilityGrid: GRID,
  applicationCounts: { draft: 0, submitted: 4 },
  reviewerUids: ["claudia", "lloyd", "tess"],
  programmeIds: [AGI, TAIS],
  programmes: {
    [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", places: 3, leadUid: "claudia", reviewerUids: ["lloyd"] }),
    [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", places: 2, leadUid: "tess" }),
  },
  questionSetIds: ["fellowships", AGI, TAIS, "facilitator"],
  asksFacilitating: true,
  invitationReplyBy: "2026-10-25",
  revealOtherReviews: false,
  noOfferWording: null,
  decisionsSentAt: null,
  decisionsSentByUid: null,
});

/** Evenings on Monday, as the form's grid stores them. */
const EVENINGS = ["", "000000000fff", "", "", "", "", ""];
/** The same, and Saturday morning. */
const EVENINGS_AND_SATURDAY = ["", "000000000fff", "", "", "", "", "0fff00000000"];

/** A whole content. `over` replaces whole parts; `answers` is merged set by set. */
function content(over = {}) {
  const { answers, aboutYou, ...rest } = over;
  return {
    aboutYou: {
      preferredName: "Amara",
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance and ethics",
      ...aboutYou,
    },
    rankedProgrammeIds: [AGI, TAIS],
    wantsToFacilitate: true,
    answers: {
      fellowships: { why: "WHY-CURRENT I want to understand the strategic picture.", read: "A few chapters." },
      [AGI]: { event: "EVENT-CURRENT Open-weight models, and who decides.", plan: "Read the evidence." },
      [TAIS]: { python: 1, built: "A small classifier." },
      facilitator: { led: "A reading group." },
      ...answers,
    },
    availability: { ...GRID, days: EVENINGS_AND_SATURDAY },
    suMembership: "yes",
    ...rest,
  };
}

/** What Amara sent first: other words, the other order, no facilitating, fewer times, no interests. */
const AMARA_FIRST = content({
  aboutYou: { interests: "", universityEmail: "someone@nottingham.ac.uk" },
  rankedProgrammeIds: [TAIS, AGI],
  wantsToFacilitate: false,
  answers: {
    fellowships: { why: "WHY-FIRST I wrote an essay and want to learn more.", read: "A few chapters." },
    [AGI]: { event: "EVENT-FIRST A new law came into force.", plan: "Read the evidence." },
    facilitator: undefined,
  },
  availability: { ...GRID, days: EVENINGS },
});
delete AMARA_FIRST.answers.facilitator;
/** What she sent second: the ranking, facilitating and times she has now; the event answer rewritten. */
const AMARA_SECOND = content({
  aboutYou: { interests: "Governance" },
  answers: {
    fellowships: { why: "WHY-FIRST I wrote an essay and want to learn more.", read: "A few chapters." },
    [AGI]: { event: "EVENT-SECOND Open-weight models are mostly a good thing.", plan: "Read the evidence." },
  },
});
const AMARA_NOW = content();
/** Every word that is only in a version Amara has since replaced. */
const EARLIER_WORDS = ["WHY-FIRST", "EVENT-FIRST", "EVENT-SECOND"];

function applicationDoc(uid, name, sent, over = {}) {
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: sent,
    sent,
    status: "submitted",
    submittedAt: SAT_17,
    sentAt: SAT_17,
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: SAT_10,
    updatedAt: SAT_17,
    ...over,
  };
}

const AMARA = applicationDoc("amara", "Amara Okafor", AMARA_NOW, {
  submittedAt: SAT_10,
  sentChangedAt: SAT_17,
  sentHistory: [
    { content: AMARA_FIRST, sentAt: SAT_10 },
    { content: AMARA_SECOND, sentAt: WED_14 },
  ],
  sentHistoryDropped: 0,
});

const reviewDoc = (applicantUid, reviewerUid, scores, at, notes = "") => ({
  roundId: ROUND,
  applicantUid,
  reviewerUid,
  scores,
  total: Object.values(scores).reduce((sum, value) => sum + value, 0),
  comments: [],
  notes,
  createdAt: at,
  updatedAt: at,
});

function seed(over = {}) {
  const docs = { [`admissionRounds/${ROUND}`]: roundDoc() };
  for (const [id, set] of Object.entries(SETS)) {
    docs[`admissionRounds/${ROUND}/questionSets/${id}`] = { roundId: ROUND, intro: "", ...set };
  }
  for (const who of Object.values(CAST)) {
    docs[`users/${who.uid}`] = {
      uid: who.uid,
      email: who.email,
      displayName: who.displayName,
      role: who.role,
      suRecognised: who.suRecognised,
      profile: { preferredName: who.displayName.split(" ")[0] },
    };
  }
  docs[`admissionApplications/${ROUND}__amara`] = AMARA;
  // Ben sent once and never again.
  docs[`admissionApplications/${ROUND}__ben`] = applicationDoc(
    "ben",
    "Ben Hartley",
    content({ aboutYou: { preferredName: "Ben" }, rankedProgrammeIds: [AGI], wantsToFacilitate: false, answers: { [TAIS]: undefined, facilitator: undefined } }),
  );
  // Claudia has scored both AGI Strategy answers, so her first review is over.
  docs[`admissionReviews/${ROUND}__amara__claudia`] = reviewDoc("amara", "claudia", { [`${AGI}.event`]: 4, [`${AGI}.plan`]: 5 }, MON_12, "Strong.");
  // Lloyd has scored one of the two, so his is not.
  docs[`admissionReviews/${ROUND}__amara__lloyd`] = reviewDoc("amara", "lloyd", { [`${AGI}.event`]: 3 }, THU_15, "A bit general.");
  return { ...docs, ...over };
}
const dbWith = (over) => makeDb(seed(over), { now: NOW });
const appPath = (uid) => `admissionApplications/${ROUND}__${uid}`;

const reviewAs = (db, who, applicant, programmeId = AGI) =>
  load.loadReview(db, CAST[who], ROUND, applicant, programmeId);
const boardAs = (db, who, programmeId = AGI) => load.loadProgrammeBoard(db, CAST[who], ROUND, programmeId);

/** Every string anywhere inside a value. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => stringsIn(entry, out));
  return out;
}
/** The earlier words a value carries, out of `words`. */
const carried = (value, words = EARLIER_WORDS) => {
  const said = stringsIn(value).join("\n");
  return words.filter((word) => said.includes(word));
};
const sectionOf = (review, id) => review.sections.find((section) => section.id === id);
const answerOf = (review, setId, questionId) =>
  sectionOf(review, setId).answers.find((answer) => answer.key === `${setId}.${questionId}`);

// ---------------------------------------------------------------------------
// 1. What counts as a change
// ---------------------------------------------------------------------------

describe("what counts as a change", () => {
  /** The same content with every map's keys in the opposite order, as a database may hand it back. */
  function reordered(value) {
    if (Array.isArray(value)) return value.map(reordered);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reordered(inner)]));
    }
    return value;
  }

  test("the same content is the same, in whatever order its maps come back", () => {
    assert.equal(kept.sameContent(AMARA_NOW, structuredClone(AMARA_NOW)), true);
    const shuffled = reordered(AMARA_NOW);
    assert.notEqual(JSON.stringify(shuffled), JSON.stringify(AMARA_NOW), "the fixture did not reorder anything");
    assert.equal(kept.sameContent(AMARA_NOW, shuffled), true);
  });

  test("a stored copy read back and a freshly built one are the same when they say the same", () => {
    const read = normalise.normaliseContent(reordered(AMARA_NOW), GRID);
    assert.equal(kept.sameContent(read, normalise.normaliseContent(AMARA_NOW, GRID)), true);
  });

  test("a list in another order IS a change: the order of a ranking is the ranking", () => {
    assert.equal(kept.sameContent(AMARA_NOW, content({ rankedProgrammeIds: [TAIS, AGI] })), false);
  });

  test("a difference in any part is a change, however small", () => {
    const changes = {
      "a letter of an answer": content({ answers: { [AGI]: { event: "EVENT-CURRENT Open-weight models, and who decides!", plan: "Read the evidence." } } }),
      "an answer taken away": content({ answers: { fellowships: { why: AMARA_NOW.answers.fellowships.why } } }),
      "a point on a scale": content({ answers: { [TAIS]: { python: 2, built: "A small classifier." } } }),
      "a question set gone": content({ answers: { facilitator: undefined } }),
      "an About you fact": content({ aboutYou: { subject: "BSc Mathematics" } }),
      "the university address": content({ aboutYou: { universityEmail: "someone@nottingham.ac.uk" } }),
      facilitating: content({ wantsToFacilitate: false }),
      availability: content({ availability: { ...GRID, days: EVENINGS } }),
      "the SU membership answer": content({ suMembership: "not-yet" }),
    };
    for (const [part, changed] of Object.entries(changes)) {
      assert.equal(kept.sameContent(AMARA_NOW, changed), false, `${part} changed and was read as the same`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. How much is kept
// ---------------------------------------------------------------------------

describe("the history is bounded, and the first version sent is never dropped", () => {
  const version = (n) => ({ content: content({ answers: { fellowships: { why: `Version ${n}.` } } }), sentAt: new Date(Date.UTC(2026, 9, n, 12)) });
  const whys = (history) => history.versions.map((entry) => entry.content.answers.fellowships.why);

  test("the limits are the ones written down", () => {
    assert.deepEqual(model.SENT_HISTORY_LIMITS, { maxVersions: 10, maxBytes: 300_000 });
  });

  test("a version goes on the end, oldest first, and nothing is dropped inside the limits", () => {
    let history = { versions: [], dropped: 0 };
    for (let n = 1; n <= 10; n += 1) history = kept.keepVersion(history, version(n));
    assert.deepEqual(whys(history), Array.from({ length: 10 }, (_, i) => `Version ${i + 1}.`));
    assert.equal(history.dropped, 0);
  });

  test("past ten, the oldest that is not the first goes, and each one is counted", () => {
    let history = { versions: [], dropped: 0 };
    for (let n = 1; n <= 14; n += 1) history = kept.keepVersion(history, version(n));
    assert.deepEqual(whys(history), ["Version 1.", "Version 6.", "Version 7.", "Version 8.", "Version 9.", "Version 10.", "Version 11.", "Version 12.", "Version 13.", "Version 14."]);
    assert.equal(history.dropped, 4);
    assert.equal(history.versions[0].sentAt.getTime(), version(1).sentAt.getTime(), "the first keeps its own time");
  });

  test("past the weight, the same rule: the first stays and the oldest after it goes", () => {
    const one = kept.weightOf([version(1)]);
    // Room for three versions and not for four.
    const limits = { maxVersions: 10, maxBytes: kept.weightOf([version(1), version(2), version(3)]) + 10 };
    let history = { versions: [], dropped: 0 };
    for (let n = 1; n <= 5; n += 1) history = kept.keepVersion(history, version(n), limits);
    assert.deepEqual(whys(history), ["Version 1.", "Version 4.", "Version 5."]);
    assert.equal(history.dropped, 2);
    assert.ok(kept.weightOf(history.versions) <= limits.maxBytes);
    assert.ok(one > 100, "a version weighs something");
  });

  test("the first alone over the weight is kept alone: nothing later can push it out", () => {
    const limits = { maxVersions: 10, maxBytes: 50 };
    let history = kept.keepVersion({ versions: [], dropped: 0 }, version(1), limits);
    assert.deepEqual(whys(history), ["Version 1."]);
    assert.equal(history.dropped, 0, "keeping the first drops nothing");
    history = kept.keepVersion(history, version(2), limits);
    history = kept.keepVersion(history, version(3), limits);
    assert.deepEqual(whys(history), ["Version 1."]);
    assert.equal(history.dropped, 2);
  });

  test("the weight counts every character of what was written, in bytes", () => {
    const plain = { content: content({ answers: { fellowships: { why: "a".repeat(1000) } } }), sentAt: SAT_10 };
    const accented = { content: content({ answers: { fellowships: { why: "é".repeat(1000) } } }), sentAt: SAT_10 };
    assert.equal(kept.weightOf([accented]) - kept.weightOf([plain]), 1000, "é is two bytes where a is one");
  });

  test("the versions are read oldest first with the current one last, each with the time it began", () => {
    const application = normalise.normaliseApplication(appPath("amara"), AMARA, GRID);
    const versions = kept.versionsOf(application);
    assert.deepEqual(versions.map((entry) => entry.sentAt.getTime()), [SAT_10.getTime(), WED_14.getTime(), SAT_17.getTime()]);
    assert.deepEqual(versions.map((entry) => entry.content.answers[AGI].event.split(" ")[0]), ["EVENT-FIRST", "EVENT-SECOND", "EVENT-CURRENT"]);
    assert.equal(kept.changeCount(application), 2);
    assert.equal(kept.hasGap(application), false);
  });

  test("the current version's time is when it BEGAN, not the last press of Send", () => {
    // Sent again on the Monday with nothing changed: `sentAt` moved, `sentChangedAt` did not.
    const resent = normalise.normaliseApplication(appPath("amara"), { ...AMARA, sentAt: NOW }, GRID);
    assert.equal(kept.versionsOf(resent).at(-1).sentAt.getTime(), SAT_17.getTime());
    // A document from before that field existed falls back to the last press.
    const older = normalise.normaliseApplication(appPath("amara"), { ...AMARA, sentChangedAt: undefined }, GRID);
    assert.equal(kept.versionsOf(older).at(-1).sentAt.getTime(), SAT_17.getTime());
  });

  test("an application never sent has no versions, and one sent once has one", () => {
    assert.deepEqual(kept.versionsOf({ sent: null, sentAt: null }), []);
    assert.equal(kept.changeCount({ sent: null, sentAt: null, sentHistory: [{ content: AMARA_FIRST, sentAt: SAT_10 }] }), 0);
    const once = { sent: AMARA_NOW, sentAt: SAT_17 };
    assert.equal(kept.versionsOf(once).length, 1);
    assert.equal(kept.changeCount(once), 0);
    assert.equal(kept.hasGap(once), false);
  });

  test("what was dropped still counts as a change, and marks the gap", () => {
    const application = { sent: AMARA_NOW, sentAt: SAT_17, sentHistory: [{ content: AMARA_FIRST, sentAt: SAT_10 }], sentHistoryDropped: 3 };
    assert.equal(kept.changeCount(application), 4);
    assert.equal(kept.hasGap(application), true);
  });
});

// ---------------------------------------------------------------------------
// 3. Reading what is stored
// ---------------------------------------------------------------------------

describe("a stored history is read safely", () => {
  const read = (over) => normalise.normaliseApplication(appPath("amara"), { ...AMARA, ...over }, GRID);

  test("each kept version is read the way the application of record is", () => {
    const application = read({});
    assert.equal(application.sentHistory.length, 2);
    assert.deepEqual(application.sentHistory[0].content, normalise.normaliseContent(AMARA_FIRST, GRID));
    assert.equal(application.sentHistory[0].sentAt.getTime(), SAT_10.getTime());
    assert.equal(application.sentChangedAt.getTime(), SAT_17.getTime());
    assert.equal(application.sentHistoryDropped, 0);
  });

  test("reading a version twice changes nothing, so writing the list back cannot wear it away", () => {
    for (const version of [AMARA_FIRST, AMARA_SECOND, AMARA_NOW]) {
      const once = normalise.normaliseContent(version, GRID);
      assert.deepEqual(normalise.normaliseContent(once, GRID), once);
      assert.equal(kept.sameContent(once, normalise.normaliseContent(structuredClone(once), GRID)), true);
    }
  });

  test("a document with none of it reads as an application that never changed", () => {
    const application = read({ sentHistory: undefined, sentHistoryDropped: undefined, sentChangedAt: undefined });
    assert.deepEqual(application.sentHistory, []);
    assert.equal(application.sentHistoryDropped, 0);
    assert.equal(application.sentChangedAt, null);
  });

  test("anything that is not a version is dropped, and nothing throws", () => {
    for (const stored of [null, "x", 7, { 0: AMARA_FIRST }, [null, "x", 7, [], { sentAt: SAT_10 }, { content: "words" }, { content: [] }]]) {
      assert.deepEqual(read({ sentHistory: stored }).sentHistory, [], JSON.stringify(stored)?.slice(0, 40));
    }
    const mixed = read({ sentHistory: [null, { content: AMARA_FIRST, sentAt: "not a date" }, "x"] });
    assert.equal(mixed.sentHistory.length, 1);
    assert.equal(mixed.sentHistory[0].sentAt, null);
    for (const count of ["many", -1, 1.5e9, null, {}]) {
      assert.equal(read({ sentHistoryDropped: count }).sentHistoryDropped, 0, String(count));
    }
    assert.equal(read({ sentHistoryDropped: 3 }).sentHistoryDropped, 3);
  });

  test("a kept version cannot carry a name every object carries into the answers", () => {
    const hostile = structuredClone(AMARA_FIRST);
    Object.defineProperty(hostile.answers, "__proto__", { value: { why: "x" }, enumerable: true, configurable: true, writable: true });
    hostile.answers.constructor = { why: "x" };
    hostile.rankedProgrammeIds = ["constructor", AGI];
    const [version] = read({ sentHistory: [{ content: hostile, sentAt: SAT_10 }] }).sentHistory;
    assert.deepEqual(Object.keys(version.content.answers).sort(), [AGI, "fellowships", TAIS].sort());
    assert.deepEqual(version.content.rankedProgrammeIds, [AGI]);
  });

  test("a list longer than the cap keeps the first and the most recent, as the cap does", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      content: content({ answers: { fellowships: { why: `Version ${i + 1}.` } } }),
      sentAt: new Date(Date.UTC(2026, 9, i + 1, 12)),
    }));
    const application = read({ sentHistory: many });
    assert.equal(application.sentHistory.length, model.SENT_HISTORY_LIMITS.maxVersions);
    assert.equal(application.sentHistory[0].content.answers.fellowships.why, "Version 1.");
    assert.equal(application.sentHistory.at(-1).content.answers.fellowships.why, "Version 14.");
    assert.equal(application.sentHistory[1].content.answers.fellowships.why, "Version 6.");
  });

  test("an application never sent has no history, whatever is stored beside it", () => {
    const application = read({ sent: null, status: "draft" });
    assert.deepEqual(application.sentHistory, []);
    assert.equal(application.sentHistoryDropped, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. What a part said before
// ---------------------------------------------------------------------------

describe("one part's history", () => {
  const says = (value, at) => ({ content: content({ answers: { fellowships: { why: value } } }), sentAt: at });
  const why = (entry) => entry.answers.fellowships.why;
  const timeline = (versions, gap = false) => ({ versions, gap });

  test("a part that never changed has nothing before, though other parts did", () => {
    const history = earlier.partHistory(timeline([says("A", SAT_10), says("A", WED_14), says("A", SAT_17)]), why);
    assert.deepEqual(history, { earlier: [], changedAt: null });
  });

  test("the same words across several versions are one entry, dated the day they were first sent", () => {
    const history = earlier.partHistory(timeline([says("A", SAT_10), says("A", WED_14), says("B", SAT_17)]), why);
    assert.deepEqual(history.earlier, [{ sentOn: "Sat 10 Oct", value: "A" }]);
    assert.equal(history.changedAt.getTime(), SAT_17.getTime());
  });

  test("what it said before is newest first, and words that came back are listed each time", () => {
    const history = earlier.partHistory(timeline([says("A", SAT_10), says("B", WED_14), says("A", SAT_17)]), why);
    assert.deepEqual(history.earlier, [
      { sentOn: "Wed 14 Oct", value: "B" },
      { sentOn: "Sat 10 Oct", value: "A" },
    ]);
    assert.equal(history.changedAt.getTime(), SAT_17.getTime());
  });

  test("when it last changed is the version that BROUGHT what it says now, not the latest version", () => {
    const history = earlier.partHistory(timeline([says("A", SAT_10), says("B", WED_14), says("B", SAT_17)]), why);
    assert.deepEqual(history.earlier, [{ sentOn: "Sat 10 Oct", value: "A" }]);
    assert.equal(history.changedAt.getTime(), WED_14.getTime());
  });

  test("the days are London's, whatever zone the server is in", () => {
    // 23:30 UTC on Fri 9 Oct is 00:30 on Sat 10 Oct in London, still on summer time.
    const late = new Date("2026-10-09T23:30:00Z");
    const history = earlier.partHistory(timeline([says("A", late), says("B", SAT_17)]), why);
    assert.equal(history.earlier[0].sentOn, "Sat 10 Oct");
  });

  test("a version with no time is still listed, and says no day", () => {
    const history = earlier.partHistory(timeline([says("A", null), says("B", SAT_17)]), why);
    assert.deepEqual(history.earlier, [{ sentOn: null, value: "A" }]);
  });

  test("a version the part was not in is passed over, and the versions either side are compared", () => {
    const absent = (at) => ({ content: content({ answers: { fellowships: { why: "ABSENT" } } }), sentAt: at });
    const read = (entry) => (why(entry) === "ABSENT" ? undefined : why(entry));
    // The same words before and after: not a change.
    assert.deepEqual(earlier.partHistory(timeline([says("A", SAT_10), absent(WED_14), says("A", SAT_17)]), read), { earlier: [], changedAt: null });
    // Different words: what it said before, and it changed when it came back.
    const changed = earlier.partHistory(timeline([says("A", SAT_10), absent(WED_14), says("B", SAT_17)]), read);
    assert.deepEqual(changed.earlier, [{ sentOn: "Sat 10 Oct", value: "A" }]);
    assert.equal(changed.changedAt.getTime(), SAT_17.getTime());
    // Not in the first version at all: it has no history, it arrived.
    assert.deepEqual(earlier.partHistory(timeline([absent(SAT_10), says("A", WED_14), says("A", SAT_17)]), read), { earlier: [], changedAt: null });
    // With versions dropped after the first: the part was missing from the next one kept, so
    // whatever the dropped ones said, what it says now began when it came back. That is exact.
    const gapped = earlier.partHistory(timeline([says("A", SAT_10), absent(WED_14), says("B", SAT_17)], true), read);
    assert.equal(gapped.changedAt.getTime(), SAT_17.getTime());
    assert.deepEqual(gapped.earlier, [{ sentOn: "Sat 10 Oct", value: "A" }]);
  });

  test("when a set joined the application: the day, or that it is not known exactly", () => {
    const form = normalise.normaliseForm(ROUND, roundDoc());
    const set = normalise.normaliseQuestionSet("facilitator", { roundId: ROUND, intro: "", ...SETS.facilitator });
    const wanting = (wants, at) => ({ content: content({ wantsToFacilitate: wants }), sentAt: at });
    assert.equal(earlier.setAddedOn(timeline([wanting(true, SAT_10), wanting(true, SAT_17)]), form, set), null, "always there");
    assert.deepEqual(earlier.setAddedOn(timeline([wanting(false, SAT_10), wanting(true, WED_14), wanting(true, SAT_17)]), form, set), { on: "Wed 14 Oct" });
    assert.deepEqual(earlier.setAddedOn(timeline([wanting(false, SAT_10), wanting(true, WED_14)], true), form, set), { on: null });
    assert.equal(earlier.addedChipText({ on: "Wed 14 Oct" }), "Added Wed 14 Oct");
    assert.equal(earlier.addedChipText({ on: null }), "Added after it was first sent");
  });

  test("across a gap, what it said is still shown and when it changed is not claimed", () => {
    // Versions were dropped between the first kept and the next, so "B" may be older than Wed 14.
    const across = earlier.partHistory(timeline([says("A", SAT_10), says("B", WED_14), says("B", SAT_17)], true), why);
    assert.deepEqual(across.earlier, [{ sentOn: "Sat 10 Oct", value: "A" }]);
    assert.equal(across.changedAt, null);
    // A change that arrived after the gap is as exact as ever.
    const after = earlier.partHistory(timeline([says("A", SAT_10), says("A", WED_14), says("B", SAT_17)], true), why);
    assert.equal(after.changedAt.getTime(), SAT_17.getTime());
  });
});

describe("the line that says an answer changed after it was scored", () => {
  const KEY = `${AGI}.event`;
  const scored = (at, key = KEY) => ({ scores: { [key]: 4 }, updatedAt: at });
  const line = (over) => earlier.changedSinceScoredLine({ key: KEY, changedAt: SAT_17, mine: null, others: [], ...over });

  test("says it of the reader, of the reviewers they are shown, and of both", () => {
    assert.equal(line({ mine: scored(MON_12) }), "This answer changed on Sat 17 Oct, after you scored it.");
    assert.equal(line({ others: [{ name: "Lloyd", review: scored(THU_15) }] }), "This answer changed on Sat 17 Oct, after Lloyd scored it.");
    assert.equal(
      line({ mine: scored(MON_12), others: [{ name: "Lloyd", review: scored(THU_15) }, { name: "Tess", review: scored(MON_12) }] }),
      "This answer changed on Sat 17 Oct, after you, Lloyd and Tess scored it.",
    );
  });

  test("says nothing when the answer has not changed, or nobody had scored it", () => {
    assert.equal(line({ changedAt: null, mine: scored(MON_12) }), null);
    assert.equal(line({}), null);
    assert.equal(line({ mine: scored(MON_12, `${AGI}.plan`) }), null, "a score on another answer is not a score on this one");
    assert.equal(line({ mine: { scores: {}, updatedAt: MON_12 } }), null);
  });

  test("says nothing of somebody who has saved their review since the change", () => {
    assert.equal(line({ mine: scored(NOW) }), null);
    assert.equal(line({ mine: scored(SAT_17) }), null, "saved in the same instant is not before");
    assert.equal(line({ mine: scored(MON_12), others: [{ name: "Lloyd", review: scored(NOW) }] }), "This answer changed on Sat 17 Oct, after you scored it.");
  });

  test("says nothing it cannot be sure of: a review with no time claims nothing", () => {
    assert.equal(line({ mine: scored(null) }), null);
    assert.equal(line({ mine: { scores: { [KEY]: 4 } } }), null);
  });

  test("a name every object carries is not a score", () => {
    for (const name of Object.getOwnPropertyNames(Object.prototype)) {
      assert.equal(earlier.changedSinceScoredLine({ key: name, changedAt: SAT_17, mine: { scores: {}, updatedAt: MON_12 }, others: [] }), null, name);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 and 5, through the loader a reviewer's page and route both use
// ---------------------------------------------------------------------------

describe("the review screen is sent what each part said before", () => {
  test("the line near the top: how often, when, and where on the screen", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    assert.deepEqual(review.changes, {
      count: 2,
      lastOn: "Sat 17 Oct",
      dropped: 0,
      // The cards with something earlier to open, in the order the screen draws them.
      // Technical AI Safety's answers never changed, so its card is not among them.
      where: ["about", "fellowships", AGI, "facilitator", "availability"],
    });
  });

  test("an answer that changed carries what it said before, newest first, with each version's day", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    const event = answerOf(review, AGI, "event");
    assert.equal(event.text, AMARA_NOW.answers[AGI].event, "the answer itself is the one on record");
    assert.deepEqual(event.earlier, [
      { sentOn: "Wed 14 Oct", answered: true, text: AMARA_SECOND.answers[AGI].event, items: null, scale: null },
      { sentOn: "Sat 10 Oct", answered: true, text: AMARA_FIRST.answers[AGI].event, items: null, scale: null },
    ]);
    // The same words in the first two versions are one entry, dated the first.
    assert.deepEqual(
      answerOf(review, "fellowships", "why").earlier.map((entry) => [entry.sentOn, entry.text]),
      [["Sat 10 Oct", AMARA_FIRST.answers.fellowships.why]],
    );
  });

  test("an answer that did not change shows nothing extra", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    for (const [setId, questionId] of [["fellowships", "read"], [AGI, "plan"], [TAIS, "python"], [TAIS, "built"]]) {
      const answer = answerOf(review, setId, questionId);
      assert.deepEqual(answer.earlier, [], `${setId}.${questionId}`);
      assert.equal(answer.changedSinceScored, null, `${setId}.${questionId}`);
    }
  });

  test("a question asked and left blank before is an answer of its own: no answer", async () => {
    const blank = structuredClone(AMARA);
    blank.sentHistory[1].content.answers.fellowships = { why: AMARA_SECOND.answers.fellowships.why };
    const { review } = await reviewAs(dbWith({ [appPath("amara")]: blank }), "claudia", "amara");
    assert.deepEqual(answerOf(review, "fellowships", "read").earlier, [
      { sentOn: "Wed 14 Oct", answered: false, text: null, items: null, scale: null },
      { sentOn: "Sat 10 Oct", answered: true, text: "A few chapters.", items: null, scale: null },
    ]);
  });

  test("questions they were not asked before say so once, on the card, and not under each answer", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    // She had not said yes to facilitating when she first sent, so nobody asked her these.
    const facilitator = sectionOf(review, "facilitator");
    assert.deepEqual(facilitator.chips.map((chip) => chip.text), ["Added Wed 14 Oct"]);
    for (const answer of facilitator.answers) assert.deepEqual(answer.earlier, [], answer.key);
    assert.ok(review.changes.where.includes("facilitator"), "the line near the top still names the card");
    // No other card was ever absent.
    for (const id of ["fellowships", AGI, TAIS]) {
      assert.ok(!sectionOf(review, id).chips.some((chip) => chip.text.startsWith("Added")), id);
    }
  });

  test("a set that left and came back is compared across the version it was missing from", async () => {
    // Facilitating: yes, then no, then yes again. The same answer both times she was asked.
    const back = structuredClone(AMARA);
    back.sentHistory[0].content.wantsToFacilitate = true;
    back.sentHistory[0].content.answers.facilitator = { led: "A reading group." };
    back.sentHistory[1].content.wantsToFacilitate = false;
    delete back.sentHistory[1].content.answers.facilitator;
    const same = await reviewAs(dbWith({ [appPath("amara")]: back }), "claudia", "amara");
    assert.deepEqual(answerOf(same.review, "facilitator", "led").earlier, [], "the same words either side of the gap are not a change");
    assert.deepEqual(sectionOf(same.review, "facilitator").chips.map((chip) => chip.text), ["Added Sat 17 Oct"]);
    assert.deepEqual(
      same.review.applicant.earlierFacilitating,
      [{ sentOn: "Wed 14 Oct", wanted: false }, { sentOn: "Sat 10 Oct", wanted: true }],
    );

    // Different words the first time: that is what it said before.
    back.sentHistory[0].content.answers.facilitator = { led: "LED-FIRST A seminar." };
    const differs = await reviewAs(dbWith({ [appPath("amara")]: back }), "claudia", "amara");
    assert.deepEqual(answerOf(differs.review, "facilitator", "led").earlier, [
      { sentOn: "Sat 10 Oct", answered: true, text: "LED-FIRST A seminar.", items: null, scale: null },
    ]);
    assert.deepEqual(sectionOf(differs.review, "facilitator").chips.map((chip) => chip.text), ["Added Sat 17 Oct", "Changed"]);
  });

  test("a point on a scale is shown as the point it was", async () => {
    const scaled = structuredClone(AMARA);
    scaled.sentHistory[1].content.answers[TAIS] = { python: 2, built: "A small classifier." };
    const { review } = await reviewAs(dbWith({ [appPath("amara")]: scaled }), "tess", "amara", TAIS);
    assert.deepEqual(answerOf(review, TAIS, "python").earlier, [
      { sentOn: "Wed 14 Oct", answered: true, text: null, items: null, scale: { options: ["Never tried", "Can follow it", "Write it often"], index: 2 } },
      { sentOn: "Sat 10 Oct", answered: true, text: null, items: null, scale: { options: ["Never tried", "Can follow it", "Write it often"], index: 1 } },
    ]);
  });

  test("a card with something earlier in it is marked Changed, and no other card is", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    const marked = review.sections.filter((section) => section.chips.some((chip) => chip.text === "Changed")).map((section) => section.id);
    assert.deepEqual(marked, ["fellowships", AGI]);
    assert.deepEqual(review.sections.map((section) => section.id), ["fellowships", AGI, TAIS, "facilitator"]);
    // The marks come after the chips the card already had, and Technical AI Safety has none.
    assert.deepEqual(
      Object.fromEntries(review.sections.map((section) => [section.id, section.chips.map((chip) => chip.text)])),
      {
        fellowships: ["For both fellowships", "Not scored", "Changed"],
        [AGI]: ["Scored", "Changed"],
        [TAIS]: [],
        facilitator: ["Added Wed 14 Oct"],
      },
    );
  });

  test("About you: each fact that changed, and nothing for the ones that did not", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    assert.deepEqual(review.applicant.about.earlierFacts, [
      {
        label: "Interests",
        earlier: [
          { sentOn: "Wed 14 Oct", value: "Governance" },
          { sentOn: "Sat 10 Oct", value: "" },
        ],
      },
    ]);
    assert.deepEqual(review.applicant.about.earlierMotivation, []);
    const rewritten = structuredClone(AMARA);
    rewritten.sentHistory[0].content.aboutYou.motivation = "MOTIVE-FIRST Curiosity.";
    rewritten.sentHistory[0].content.aboutYou.subject = "BSc Mathematics";
    rewritten.sentHistory[0].content.aboutYou.status = "masters";
    rewritten.sentHistory[0].content.aboutYou.expectedGraduation = "2027-09";
    const { review: second } = await reviewAs(dbWith({ [appPath("amara")]: rewritten }), "claudia", "amara");
    assert.deepEqual(second.applicant.about.earlierMotivation, [{ sentOn: "Sat 10 Oct", text: "MOTIVE-FIRST Curiosity." }]);
    assert.deepEqual(
      second.applicant.about.earlierFacts.map((fact) => [fact.label, fact.earlier.map((entry) => entry.value)]),
      [
        ["At UoN", ["Master's"]],
        ["Degree", ["BSc Mathematics"]],
        ["Graduating", ["September 2027"]],
        ["Interests", ["Governance", ""]],
      ],
    );
  });

  test("the ranking and facilitating: what they chose before", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    assert.deepEqual(review.applicant.earlierRankings, [
      {
        sentOn: "Sat 10 Oct",
        ranked: [
          { shortName: "Technical AI Safety", choice: 1 },
          { shortName: "AGI Strategy", choice: 2 },
        ],
      },
    ]);
    assert.deepEqual(review.applicant.earlierFacilitating, [{ sentOn: "Sat 10 Oct", wanted: false }]);
    // What the screen shows now is what is on record.
    assert.deepEqual(review.applicant.ranked.map((entry) => entry.shortName), ["AGI Strategy", "Technical AI Safety"]);
    assert.equal(review.applicant.wantsToFacilitate, true);
  });

  test("when they were free before, as the same lines of words", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    assert.deepEqual(review.earlierAvailability, [
      { sentOn: "Sat 10 Oct", empty: false, lines: ["Mon, 6pm to 9pm"], total: "3 hours across 1 day" },
    ]);
    assert.deepEqual(review.availability.lines, ["Mon, 6pm to 9pm", "Sat, 10am to 1pm"]);
  });

  test("an application that never changed carries none of it", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "ben");
    assert.equal(review.changes, null);
    assert.deepEqual(review.earlierAvailability, []);
    assert.deepEqual(review.applicant.earlierRankings, []);
    assert.deepEqual(review.applicant.earlierFacilitating, []);
    assert.deepEqual(review.applicant.about.earlierFacts, []);
    assert.deepEqual(review.applicant.about.earlierMotivation, []);
    for (const section of review.sections) {
      assert.ok(!section.chips.some((chip) => chip.text === "Changed"), section.id);
      for (const answer of section.answers) {
        assert.deepEqual(answer.earlier, [], answer.key);
        assert.equal(answer.changedSinceScored, null, answer.key);
      }
    }
  });

  test("a send that changed nothing left no trace: only `sentAt` moved, and the screen says nothing", async () => {
    const resent = { ...applicationDoc("ben", "Ben Hartley", seed()[appPath("ben")].sent), sentAt: NOW, sentChangedAt: SAT_17 };
    const { review } = await reviewAs(dbWith({ [appPath("ben")]: resent }), "claudia", "ben");
    assert.equal(review.changes, null);
  });

  test("what changed is from what was SENT each time: a draft in progress is never part of it", async () => {
    const drafting = structuredClone(AMARA);
    drafting.draft = content({ answers: { [AGI]: { event: "DRAFT-ONLY not sent yet.", plan: "Read the evidence." } } });
    const { review } = await reviewAs(dbWith({ [appPath("amara")]: drafting }), "claudia", "amara");
    assert.deepEqual(carried(review, ["DRAFT-ONLY"]), []);
    assert.equal(review.changes.count, 2);
  });
});

describe("what is kept and not shown", () => {
  test("a change to the SU membership answer alone is counted, and nothing on the screen says what it was", async () => {
    const first = structuredClone(seed()[appPath("ben")].sent);
    first.suMembership = "not-yet";
    const ben = { ...seed()[appPath("ben")], submittedAt: SAT_10, sentChangedAt: SAT_17, sentHistory: [{ content: first, sentAt: SAT_10 }], sentHistoryDropped: 0 };
    const { review } = await reviewAs(dbWith({ [appPath("ben")]: ben }), "claudia", "ben");
    assert.deepEqual(review.changes, { count: 1, lastOn: "Sat 17 Oct", dropped: 0, where: [] });
    assert.deepEqual(review.applicant.earlierRankings, []);
    assert.deepEqual(review.applicant.earlierFacilitating, []);
    const said = JSON.stringify(review);
    assert.ok(!said.includes("suMembership") && !said.includes("not-yet"), "the review screen was sent the SU membership answer");
    for (const section of review.sections) assert.ok(!section.chips.some((chip) => chip.text === "Changed"), section.id);
  });

  test("an answer to a programme they have since unticked is kept, and no reviewer is shown it", async () => {
    // Ben first ranked both and answered Technical AI Safety's questions, then unticked it.
    const first = content({
      aboutYou: { preferredName: "Ben" },
      rankedProgrammeIds: [AGI, TAIS],
      wantsToFacilitate: false,
      answers: { [TAIS]: { python: 2, built: "UNTICKED-ANSWER A model of my own." }, facilitator: undefined },
    });
    delete first.answers.facilitator;
    const ben = { ...seed()[appPath("ben")], submittedAt: SAT_10, sentChangedAt: SAT_17, sentHistory: [{ content: first, sentAt: SAT_10 }], sentHistoryDropped: 0 };
    const db = dbWith({ [appPath("ben")]: ben });
    for (const who of ["claudia", "lloyd", "zach"]) {
      const { review } = await reviewAs(db, who, "ben");
      assert.deepEqual(carried(review, ["UNTICKED-ANSWER"]), [], who);
      // The ranking's own history says the programme went.
      assert.deepEqual(review.applicant.earlierRankings[0].ranked.map((entry) => entry.shortName), ["AGI Strategy", "Technical AI Safety"], who);
      assert.deepEqual(review.sections.map((section) => section.id), ["fellowships", AGI], who);
    }
    // Its lead no longer has the application at all: it is not on her list and does not open.
    assert.equal((await reviewAs(db, "tess", "ben", TAIS)).status, 404);
    assert.equal(normalise.normaliseApplication(appPath("ben"), db.read(appPath("ben")), GRID).sentHistory[0].content.answers[TAIS].built, "UNTICKED-ANSWER A model of my own.");
  });

  test("the university address in an earlier version is an admin's to read, like the one on record", async () => {
    const db = dbWith();
    const { review: asAdmin } = await reviewAs(db, "zach", "amara");
    assert.deepEqual(
      asAdmin.applicant.about.earlierFacts.find((fact) => fact.label === "University email"),
      { label: "University email", earlier: [{ sentOn: "Sat 10 Oct", value: "someone@nottingham.ac.uk" }] },
    );
    for (const who of ["claudia", "lloyd", "tess"]) {
      const { review } = await reviewAs(db, who, "amara", who === "tess" ? TAIS : AGI);
      assert.ok(!JSON.stringify(review).includes("@"), `${who} was sent an address`);
      assert.ok(!review.applicant.about.earlierFacts.some((fact) => fact.label === "University email"), who);
    }
  });

  test("when versions are no longer kept the screen says how many, and still counts them as changes", async () => {
    const capped = { ...AMARA, sentHistoryDropped: 3 };
    const { review } = await reviewAs(dbWith({ [appPath("amara")]: capped }), "claudia", "amara");
    assert.equal(review.changes.count, 5);
    assert.equal(review.changes.dropped, 3);
  });
});

describe("a score stays on the question, and the screen says when the answer has changed since", () => {
  test("the lead scored before the last change, and so did the reviewer she is shown", async () => {
    const { review } = await reviewAs(dbWith(), "claudia", "amara");
    assert.deepEqual(review.review.others.visible.map((other) => other.name), ["Lloyd"], "her first review is over, so she is shown his");
    assert.equal(answerOf(review, AGI, "event").changedSinceScored, "This answer changed on Sat 17 Oct, after you and Lloyd scored it.");
    // Her score for it is still her score: nothing moved it to a version.
    assert.equal(review.review.scores[`${AGI}.event`], 4);
    assert.equal(answerOf(review, AGI, "plan").changedSinceScored, null, "that answer never changed");
  });

  test("a reviewer on a first review is told about their own score, and never that somebody else has scored", async () => {
    const { review } = await reviewAs(dbWith(), "lloyd", "amara");
    assert.equal(review.review.others.hidden, 1, "Claudia's review is held back from him");
    assert.deepEqual(review.review.others.visible, []);
    assert.equal(answerOf(review, AGI, "event").changedSinceScored, "This answer changed on Sat 17 Oct, after you scored it.");
    assert.ok(!JSON.stringify(review).includes("Claudia scored"), "the line named a review he is not shown");
  });

  test("somebody who has saved their review since the change is not told", async () => {
    const db = dbWith();
    db.poke(`admissionReviews/${ROUND}__amara__claudia`, { updatedAt: NOW });
    const { review } = await reviewAs(db, "claudia", "amara");
    assert.equal(answerOf(review, AGI, "event").changedSinceScored, "This answer changed on Sat 17 Oct, after Lloyd scored it.");
    db.poke(`admissionReviews/${ROUND}__amara__lloyd`, { updatedAt: NOW });
    assert.equal(answerOf((await reviewAs(db, "claudia", "amara")).review, AGI, "event").changedSinceScored, null);
  });

  test("it is only ever said of an answer the reader scores on this screen", async () => {
    // Tess leads Technical AI Safety. The AGI Strategy answers are not hers to score.
    const db = dbWith({ [`admissionReviews/${ROUND}__amara__tess`]: reviewDoc("amara", "tess", { [`${TAIS}.built`]: 4, [`${TAIS}.python`]: 3 }, MON_12) });
    const { review } = await reviewAs(db, "tess", "amara", TAIS);
    for (const section of review.sections) {
      for (const answer of section.answers) assert.equal(answer.changedSinceScored, null, answer.key);
    }
    // She still reads what the other stream's answer said before.
    assert.equal(answerOf(review, AGI, "event").earlier.length, 2);
  });

  test("across a gap nothing is claimed about a score, and what it said before is still shown", async () => {
    // Versions were dropped after the first, so the second kept version's words may be older than it.
    const gapped = structuredClone(AMARA);
    gapped.sentHistoryDropped = 2;
    gapped.sent = AMARA_SECOND;
    gapped.draft = AMARA_SECOND;
    gapped.sentHistory = [{ content: AMARA_FIRST, sentAt: SAT_10 }];
    gapped.sentChangedAt = SAT_17;
    const { review } = await reviewAs(dbWith({ [appPath("amara")]: gapped }), "claudia", "amara");
    const event = answerOf(review, AGI, "event");
    assert.equal(event.earlier.length, 1);
    assert.equal(event.changedSinceScored, null);
    assert.deepEqual([review.changes.count, review.changes.dropped], [3, 2]);
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

describe("the words the two screens use", () => {
  test("the line under the name says how often and when it last changed", () => {
    assert.equal(
      words.changesLine({ count: 2, lastOn: "Sat 17 Oct", dropped: 0 }),
      "Changed 2 times since it was first sent. Last changed Sat 17 Oct.",
    );
    assert.equal(
      words.changesLine({ count: 1, lastOn: "Sat 17 Oct", dropped: 0 }),
      "Changed 1 time since it was first sent. Last changed Sat 17 Oct.",
    );
    assert.equal(words.changesLine({ count: 3, lastOn: null, dropped: 0 }), "Changed 3 times since it was first sent.");
  });

  test("it says how many versions can no longer be opened, when any cannot", () => {
    assert.equal(
      words.changesLine({ count: 12, lastOn: "Sat 17 Oct", dropped: 2 }),
      "Changed 12 times since it was first sent. Last changed Sat 17 Oct. 2 earlier versions are no longer kept.",
    );
    assert.match(words.changesLine({ count: 11, lastOn: "Sat 17 Oct", dropped: 1 }), / 1 earlier version is no longer kept\.$/);
  });

  test("the mark on a row of the list, and what the controls are called", () => {
    assert.equal(words.changedMark("Wed 14 Oct"), "Changed Wed 14 Oct");
    assert.equal(words.changedMark(null), "Changed");
    assert.equal(words.WHAT_IT_SAID_BEFORE, "What it said before");
    assert.equal(words.WHAT_THEY_CHOSE_BEFORE, "What they chose before");
    assert.equal(words.NOTHING_SHOWN, "What changed isn’t shown on this screen.");
  });

  test("no applicant ever reads these: they are on the review screens and nowhere else", () => {
    const users = sourceFiles(SRC)
      .filter((path) => /changesWords/.test(readFileSync(path, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(users, [
      "src/features/applications/review/ApplicationsBoard.tsx",
      "src/features/applications/review/ReviewScreen.tsx",
      "src/features/applications/review/ReviewSections.tsx",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe("the list marks an application that changed, and carries nothing of what it said", () => {
  test("a row says that it changed and when, and an unchanged row says neither", async () => {
    const { board } = await boardAs(dbWith(), "claudia");
    const row = (uid) => board.rows.find((entry) => entry.uid === uid);
    assert.deepEqual([row("amara").changed, row("amara").changedOn], [true, "Sat 17 Oct"]);
    assert.deepEqual([row("ben").changed, row("ben").changedOn], [false, null]);
  });

  test("the day is the day it last changed, not the last press of Send", async () => {
    const { board } = await boardAs(dbWith({ [appPath("amara")]: { ...AMARA, sentAt: NOW } }), "claudia");
    assert.equal(board.rows.find((entry) => entry.uid === "amara").changedOn, "Sat 17 Oct");
  });

  test("no row carries an answer, earlier or current", async () => {
    for (const who of ["claudia", "lloyd", "zach"]) {
      const { board } = await boardAs(dbWith(), who);
      assert.deepEqual(carried(board, [...EARLIER_WORDS, "WHY-CURRENT", "EVENT-CURRENT"]), [], who);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Who is never sent it
// ---------------------------------------------------------------------------

describe("nobody else is sent an earlier version", () => {
  test("nobody without a role on a programme the person ranked can open the application at all", async () => {
    const db = dbWith();
    // SU-recognised committee named on nothing, another applicant, a member, and Amara herself.
    for (const who of ["yusuf", "ben", "nell", "amara"]) {
      const result = await reviewAs(db, who, "amara");
      assert.deepEqual([result.ok, result.status], [false, 404], who);
      assert.deepEqual(carried(result), [], who);
      const list = await boardAs(db, who);
      assert.equal(list.ok, false, who);
    }
  });

  test("the applicant's own projection carries the application of record and none before it", () => {
    const application = normalise.normaliseApplication(appPath("amara"), AMARA, GRID);
    const mine = project.projectApplicationForOwner(application);
    assert.deepEqual(carried(mine), []);
    assert.ok(JSON.stringify(mine).includes("EVENT-CURRENT"), "the projection lost the application of record");
    for (const field of ["sentHistory", "sentHistoryDropped", "sentChangedAt"]) {
      assert.ok(!(field in mine), `the applicant is sent ${field}`);
      assert.ok(!JSON.stringify(mine).includes(field), field);
    }
  });

  test("the applicant's own page, and the line on the list of their applications, carry none", async () => {
    const db = dbWith();
    const page = await statusLoad.loadStatus(db, ROUND, "amara", NOW);
    assert.equal(page.view.kind, "sent");
    assert.deepEqual(carried(page), []);
    const listed = await statusLoad.loadListWords(db, "amara", [ROUND], NOW);
    assert.deepEqual(carried([...listed.values()]), []);
  });

  test("the record the committee keeps holds none of what the applicant wrote, in any version", () => {
    const form = normalise.normaliseForm(ROUND, roundDoc());
    const sets = Object.entries(SETS).map(([id, set]) => normalise.normaliseQuestionSet(id, { roundId: ROUND, intro: "", ...set }));
    const application = normalise.normaliseApplication(appPath("amara"), AMARA, GRID);
    const record = memberRecords.buildFormApplicationRecord({
      round: form.round,
      form,
      sets,
      application,
      reviews: [
        normalise.normaliseReview(`${ROUND}__amara__claudia`, reviewDoc("amara", "claudia", { [`${AGI}.event`]: 4 }, MON_12, "Strong.")),
      ],
      reviewerNames: { claudia: "Claudia Reyes" },
      writtenBy: "settle",
      writtenByUid: "zach",
    });
    assert.deepEqual(carried(record, [...EARLIER_WORDS, "WHY-CURRENT", "EVENT-CURRENT"]), []);
    // It records what they applied for as it stands on record, not as it once stood.
    assert.deepEqual(record.appliedFor, ["AGI Strategy", "Technical AI Safety"]);
    assert.equal(record.submittedAt.getTime(), SAT_10.getTime(), "and when they FIRST sent it");
    for (const field of ["sentHistory", "sentHistoryDropped", "sentChangedAt"]) assert.ok(!(field in record), field);
  });
});

// ---------------------------------------------------------------------------
// Where the history is named
// ---------------------------------------------------------------------------

/**
 * Every file under `src` that names one of the three stored fields, with why
 * it does. The walk holds the list both ways, so a new reader of the history
 * is written down from the change that adds it, and so nothing that builds an
 * applicant's page can come to name it unnoticed.
 */
const NAMES_THE_HISTORY = new Map([
  ["src/lib/applications/model.ts", "declares the three fields and the limits"],
  ["src/lib/applications/normalise.ts", "reads them off a stored document, safely"],
  ["src/lib/applications/versions/kept.ts", "the rules: what is a change, what is kept, how the versions are read"],
  ["src/lib/applications/applicant/store.ts", "the one writer: the send keeps what it replaces, in its own transaction"],
  ["src/lib/applications/review/detail.ts", "the review screen's payload says how many versions are no longer kept"],
]);
const HISTORY_FIELD = /\bsent(History|HistoryDropped|ChangedAt)\b/;

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
const SRC = join(REPO_ROOT, "src");
const rel = (path) => relative(REPO_ROOT, path).split(sep).join("/");
const source = (path) => readFileSync(join(REPO_ROOT, path), "utf8");

describe("where the history is named", () => {
  test("only the files listed name a stored history field, and each is still one that does", () => {
    const found = sourceFiles(SRC).filter((path) => HISTORY_FIELD.test(readFileSync(path, "utf8"))).map(rel).sort();
    assert.deepEqual(
      found,
      [...NAMES_THE_HISTORY.keys()].sort(),
      "the files that name sentHistory, sentHistoryDropped or sentChangedAt are not the ones listed. " +
        "A new reader of an application's earlier versions is added to NAMES_THE_HISTORY with what it " +
        "does with them. Nothing that builds an applicant's page belongs on the list.",
    );
    for (const [file, why] of NAMES_THE_HISTORY) assert.ok(why.length > 20, `${file} needs a written reason`);
  });

  test("the applicant's side names it in one place, the send, and nowhere it answers from", () => {
    const applicantSide = [...NAMES_THE_HISTORY.keys()].filter(
      (file) => file.includes("/applicant/") || file.includes("/status/") || file.includes("/apply/"),
    );
    assert.deepEqual(applicantSide, ["src/lib/applications/applicant/store.ts"]);
    // The send writes it and hands nothing back but which kind of send it was.
    assert.match(source("src/lib/applications/applicant/store.ts"), /Promise<"sent" \| "sent-again">/);
  });

  test("the send compares the two copies read the same way, and keeps the time the version began", () => {
    const store = source("src/lib/applications/applicant/store.ts");
    assert.ok(
      store.includes("!sameContent(replaced, normaliseContent(sent, form.round.availabilityGrid))"),
      "the stored copy comes back through normaliseContent, so the new one has to as well before the two are compared",
    );
    assert.ok(store.includes("{ content: replaced, sentAt: application.sentChangedAt ?? application.sentAt }"));
    // No server timestamp inside the list: the database refuses one there.
    const written = store.slice(store.indexOf("update.sentHistory ="), store.indexOf("update.sentHistoryDropped ="));
    assert.ok(written.length > 0 && !written.includes("serverTimestamp"));
  });

  test("the review screens draw earlier words as text, through the one component that does", () => {
    const sections = source("src/features/applications/review/ReviewSections.tsx");
    assert.ok(!/dangerouslySetInnerHTML/.test(sections));
    assert.ok(sections.includes("<MemberText text={entry.text} className={styles.answer} />"));
  });
});
