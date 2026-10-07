/**
 * Who may read, score and decide an application, and what each of them is sent.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 * The review screens are where the committee's private work on an application
 * happens, so every rule here is about what must NOT happen:
 *
 *  - NOBODY WITHOUT A ROLE LEARNS ANYTHING. A stranger, an SU-recognised
 *    committee member named nowhere, another programme's lead and the
 *    applicant themselves are all answered "Not found", in the same words as
 *    for a form that does not exist.
 *  - NOBODY SEES THEIR OWN APPLICATION through the committee's screens: not a
 *    row, not a count, not a review of themselves.
 *  - A FIRST REVIEW IS BLIND. What another reviewer scored or wrote is not in
 *    the payload until the caller has scored every answer there is to score,
 *    or an admin has switched that off for the form. The list's score column
 *    follows the same rule, and what is held back leaves as a count.
 *  - AN ADDRESS IS FOR AN ADMIN. No payload a lead or a reviewer is sent
 *    carries an applicant's email, anywhere in it.
 *  - A REVIEWER WRITES ONLY THEIR OWN ROW, scores only the answers of a
 *    programme they review, and the row's total is worked out by the server.
 *  - A DECISION TOUCHES THE DECISION DOCUMENT AND THE LOG, AND NOTHING ELSE.
 *    The applicant's own document is byte-for-byte what it was, the round's
 *    counters do not move, and a read writes nothing at all. That is what
 *    keeps anybody from hearing before decision day.
 *  - AFTER DECISION DAY NOTHING CHANGES.
 *
 * Everything under test is the real code: the loaders, the builders, the
 * writers, `access.ts`, the eligibility bar and the contract's pure functions.
 * Stubbed: `server-only`, and the one value `firebase-admin/firestore`
 * supplies (`FieldValue`). The database is a small in-memory one below.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __sentinel: 'now' }),\n" +
        "  delete: () => ({ __sentinel: 'delete' }),\n" +
        "  increment: (by) => ({ __sentinel: 'increment', by }),\n" +
        "};",
    ],
  ]),
});
const lib = (file) => join("lib", "applications", "review", file);
const load = await loadTs(lib("load.ts"));
const saveReviewModule = await loadTs(lib("saveReview.ts"));
const decide = await loadTs(lib("decide.ts"));

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-19T10:00:00+01:00");

function isSentinel(value, kind) {
  return Boolean(value) && typeof value === "object" && value.__sentinel === kind;
}

/** Deep copy that keeps Dates as Dates. */
function copy(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = copy(entry);
    return out;
  }
  return value;
}

/** What a write stores: server timestamps become the clock, deletes are applied by the caller. */
function settle(value) {
  if (isSentinel(value, "now")) return new Date(NOW.getTime());
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(settle);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!isSentinel(entry, "delete")) out[key] = settle(entry);
    }
    return out;
  }
  return value;
}

function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isSentinel(value, "delete")) {
      delete target[key];
    } else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !isSentinel(value, "now")) {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
      mergeInto(target[key], value);
    } else {
      target[key] = settle(value);
    }
  }
}

function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, copy(data)]));
  const writes = [];
  /** Every collection a read touched, in order: what a caller cost the database. */
  const reads = [];
  let minted = 0;

  const snap = (path) => ({
    exists: docs.has(path),
    id: path.split("/").pop(),
    data: () => (docs.has(path) ? copy(docs.get(path)) : undefined),
  });
  const readDoc = (path) => {
    reads.push(path.split("/").slice(0, -1).join("/"));
    return snap(path);
  };

  const apply = {
    set(path, data, options) {
      writes.push({ op: options?.merge ? "merge" : "set", path });
      if (options?.merge && docs.has(path)) {
        const next = copy(docs.get(path));
        mergeInto(next, data);
        docs.set(path, next);
      } else {
        docs.set(path, settle(data));
      }
    },
    create(path, data) {
      if (docs.has(path)) throw new Error(`ALREADY_EXISTS: ${path}`);
      writes.push({ op: "create", path });
      docs.set(path, settle(data));
    },
    update(path, patch) {
      if (!docs.has(path)) throw new Error(`NOT_FOUND: ${path}`);
      writes.push({ op: "update", path });
      const next = copy(docs.get(path));
      for (const [field, value] of Object.entries(patch)) {
        const parts = field.split(".");
        let node = next;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        const last = parts[parts.length - 1];
        if (isSentinel(value, "delete")) delete node[last];
        else node[last] = settle(value);
      }
      docs.set(path, next);
    },
  };

  const docRef = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => readDoc(path),
    set: async (data, options) => apply.set(path, data, options),
    update: async (patch) => apply.update(path, patch),
    collection: (name) => collectionRef(`${path}/${name}`),
  });

  const query = (prefix, filters) => ({
    where: (field, op, value) => query(prefix, [...filters, [field, op, value]]),
    get: async () => {
      reads.push(prefix);
      const depth = prefix.split("/").length + 1;
      const found = [...docs.keys()]
        .filter((path) => path.startsWith(`${prefix}/`) && path.split("/").length === depth)
        .filter((path) =>
          filters.every(([field, op, value]) => {
            assert.equal(op, "==", "the review screens only ever ask for equality");
            return docs.get(path)[field] === value;
          }),
        )
        .map(snap);
      return { docs: found, empty: found.length === 0 };
    },
  });

  function collectionRef(prefix) {
    return {
      doc: (id) => docRef(`${prefix}/${id ?? `auto-${(minted += 1)}`}`),
      where: (field, op, value) => query(prefix, [[field, op, value]]),
      get: () => query(prefix, []).get(),
    };
  }

  return {
    collection: (name) => collectionRef(name),
    getAll: async (...refs) => refs.map((ref) => readDoc(ref.path)),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => readDoc(ref.path),
        set: (ref, data, options) => apply.set(ref.path, data, options),
        update: (ref, patch) => apply.update(ref.path, patch),
        create: (ref, data) => apply.create(ref.path, data),
      }),
    read: (path) => (docs.has(path) ? copy(docs.get(path)) : undefined),
    /** Change a document behind the code's back, as another request would. */
    poke: (path, change) => docs.set(path, { ...copy(docs.get(path)), ...change }),
    paths: (prefix) => [...docs.keys()].filter((path) => path.startsWith(prefix)),
    writes,
    reads,
  };
}

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__t3st0001";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const SENT_AT = new Date("2026-10-17T14:20:00+01:00");
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };

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

/** The cast. Lloyd reviews AGI Strategy and has also applied to it. */
const CAST = {
  zach: session("zach", "admin", false, "Zach Levin"),
  claudia: session("claudia", "committee", true, "Claudia Reyes"),
  lloyd: session("lloyd", "committee", true, "Lloyd Brandon"),
  tess: session("tess", "committee", true, "Tess Okoro"),
  yusuf: session("yusuf", "committee", true, "Yusuf Demir"),
  amara: session("amara", "member", false, "Amara Okafor"),
  /** Named as a reviewer on AGI Strategy, and no longer SU-recognised. */
  kofi: session("kofi", "committee", false, "Kofi Asante"),
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
      question("plan", "What would you do about it?", { scored: true, required: false }),
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

function programme(over) {
  return {
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
  };
}

function roundDoc(over = {}) {
  return {
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
    applicationCounts: { draft: 0, submitted: 7 },
    reviewerUids: ["claudia", "lloyd", "tess", "kofi"],
    programmeIds: [TAIS, AGI],
    programmes: {
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", places: 2, leadUid: "tess" }),
      [AGI]: programme({
        name: "AGI Strategy Fellowship",
        shortName: "AGI Strategy",
        places: 3,
        leadUid: "claudia",
        reviewerUids: ["lloyd", "kofi"],
      }),
    },
    questionSetIds: ["fellowships", AGI, TAIS, "facilitator"],
    asksFacilitating: true,
    invitationReplyBy: "2026-10-25",
    revealOtherReviews: false,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    ...over,
  };
}

/** [uid, name, ranking, facilitate, answers the AGI "plan" question, minutes after the first] */
const APPLICANTS = [
  ["amara", "Amara Okafor", [AGI, TAIS], true, true, 0],
  ["ben", "Ben Hartley", [AGI], false, false, 1],
  ["dev", "Dev Patel", [AGI], false, false, 2],
  ["wen", "Wen Zhao", [TAIS, AGI], false, false, 3],
  ["sam", "Sam Whitfield", [TAIS], false, false, 4],
  // Two of the committee have applied as well.
  ["lloyd", "Lloyd Brandon", [AGI], false, false, 5],
  ["claudia", "Claudia Reyes", [TAIS, AGI], false, false, 6],
];

function applicationDoc([uid, name, ranked, facilitate, plan, minute]) {
  const answers = {
    fellowships: { why: `${name} wants to understand it.`, read: "A few articles." },
  };
  if (ranked.includes(AGI)) {
    answers[AGI] = { event: "A new law came into force.", ...(plan ? { plan: "Read it properly." } : {}) };
  }
  if (ranked.includes(TAIS)) answers[TAIS] = { python: 1, built: "A small classifier." };
  if (facilitate) answers.facilitator = { led: "A reading group." };
  const content = {
    aboutYou: {
      preferredName: name.split(" ")[0],
      universityEmail: `${uid}@nottingham.ac.uk`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: facilitate,
    answers,
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
  const at = new Date(SENT_AT.getTime() - minute * 60_000);
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: content,
    sent: content,
    status: "submitted",
    submittedAt: at,
    sentAt: at,
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: at,
    updatedAt: at,
  };
}

const reviewDoc = (applicantUid, reviewerUid, scores, comments = [], notes = "") => ({
  roundId: ROUND,
  applicantUid,
  reviewerUid,
  scores,
  total: Object.values(scores).reduce((sum, value) => sum + value, 0),
  comments: comments.map(([id, questionKey, text]) => ({ id, questionKey, text, createdAt: SENT_AT, updatedAt: SENT_AT })),
  notes,
  createdAt: SENT_AT,
  updatedAt: SENT_AT,
});

const decided = (decision, by) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: NOW,
});

const userDoc = (who, over = {}) => ({
  uid: who.uid,
  email: who.email,
  displayName: who.displayName,
  role: who.role,
  suRecognised: who.suRecognised,
  profile: { preferredName: who.displayName.split(" ")[0] },
  ...over,
});

function seed(over = {}) {
  const docs = {
    [`admissionRounds/${ROUND}`]: roundDoc(),
    "admissionRounds/older-round": { kind: "enrolment", label: "An older round", reviewerUids: [] },
  };
  for (const [id, set] of Object.entries(SETS)) {
    docs[`admissionRounds/${ROUND}/questionSets/${id}`] = { roundId: ROUND, intro: "", ...set };
  }
  for (const who of Object.values(CAST)) docs[`users/${who.uid}`] = userDoc(who);
  for (const entry of APPLICANTS) {
    docs[`admissionApplications/${ROUND}__${entry[0]}`] = applicationDoc(entry);
    docs[`users/${entry[0]}`] ??= {
      uid: entry[0],
      displayName: entry[1],
      role: entry[0] === "wen" ? "pending" : "member",
      profile: { preferredName: entry[1].split(" ")[0] },
    };
  }
  // A draft nobody sent, and an application to a different round.
  docs[`admissionApplications/${ROUND}__zara`] = { ...applicationDoc(["zara", "Zara Ahmed", [AGI], false, false, 9]), sent: null, status: "draft" };
  docs["admissionApplications/older-round__amara"] = { roundId: "older-round", uid: "amara", status: "submitted" };

  // Amara: Claudia has scored both AGI answers, Lloyd only one, Tess both of hers.
  docs[`admissionReviews/${ROUND}__amara__claudia`] = reviewDoc(
    "amara",
    "claudia",
    { [`${AGI}.event`]: 4, [`${AGI}.plan`]: 5 },
    [["c1", `${AGI}.event`, "Argued from both sides."]],
    "Strong. Would do well in a group.",
  );
  docs[`admissionReviews/${ROUND}__amara__lloyd`] = reviewDoc(
    "amara",
    "lloyd",
    { [`${AGI}.event`]: 3 },
    [["c1", "fellowships.why", "Clear about why this term."]],
    "A bit general.",
  );
  docs[`admissionReviews/${ROUND}__amara__tess`] = reviewDoc(
    "amara",
    "tess",
    { [`${TAIS}.python`]: 3, [`${TAIS}.built`]: 4 },
    [["c1", `${TAIS}.built`, "Careful write-up."]],
  );
  docs[`admissionReviews/${ROUND}__ben__claudia`] = reviewDoc("ben", "claudia", { [`${AGI}.event`]: 2 });

  docs[`admissionDecisions/${ROUND}__ben`] = { roundId: ROUND, uid: "ben", programmes: { [AGI]: decided("pool", "claudia") }, pooledOutcome: null, exception: null };
  docs[`admissionDecisions/${ROUND}__wen`] = { roundId: ROUND, uid: "wen", programmes: { [TAIS]: decided("accept", "tess") }, pooledOutcome: null, exception: null };
  docs[`admissionDecisions/${ROUND}__sam`] = {
    roundId: ROUND,
    uid: "sam",
    programmes: { [TAIS]: decided("pool", "tess") },
    pooledOutcome: { kind: "no-offer", setByUid: "zach", setAt: NOW },
    exception: null,
  };
  return { ...docs, ...over };
}

const board = async (db, who, programmeId = AGI, roundId = ROUND) =>
  load.loadProgrammeBoard(db, CAST[who], roundId, programmeId);
const review = async (db, who, applicant, programmeId = AGI) =>
  load.loadReview(db, CAST[who], ROUND, applicant, programmeId);
const rowOf = (result, uid) => result.board.rows.find((row) => row.uid === uid);

/** Every string anywhere inside a payload. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => stringsIn(entry, out));
  return out;
}
const mentionsAnAddress = (payload) => stringsIn(payload).some((text) => /@(example\.com|nottingham\.ac\.uk)/.test(text));

// ---------------------------------------------------------------------------
// Who gets in
// ---------------------------------------------------------------------------

describe("who may open a programme's applications", () => {
  /** [who, AGI Strategy, Technical AI Safety] */
  const EXPECTED = [
    ["zach", "admin", "admin"],
    ["claudia", "lead", null],
    ["lloyd", "reviewer", null],
    ["tess", null, "lead"],
    ["yusuf", null, null],
    ["amara", null, null],
    ["kofi", null, null],
  ];
  for (const [who, onAgi, onTais] of EXPECTED) {
    test(`${who}`, async () => {
      const db = makeDb(seed());
      const agi = await board(db, who, AGI);
      const tais = await board(db, who, TAIS);
      assert.equal(agi.ok ? agi.board.viewer.role : null, onAgi);
      assert.equal(tais.ok ? tais.board.viewer.role : null, onTais);
      for (const refused of [agi, tais].filter((result) => !result.ok)) {
        assert.deepEqual(refused, { ok: false, status: 404, error: "Not found" });
      }
    });
  }

  test("somebody refused is told exactly what a missing form says, and nothing more", async () => {
    const db = makeDb(seed());
    const missingForm = await board(db, "zach", AGI, "no-such-round");
    const notAForm = await board(db, "zach", AGI, "older-round");
    const missingProgramme = await board(db, "zach", "no-such-programme");
    const stranger = await board(db, "yusuf", AGI);
    for (const result of [missingForm, notAForm, missingProgramme]) assert.deepEqual(result, stranger);
  });

  test("an id that is the name of something every object carries is not a programme", async () => {
    const db = makeDb(seed());
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "a/b", ""]) {
      const asBoard = await board(db, "zach", id);
      assert.deepEqual([id, asBoard.ok, asBoard.status], [id, false, 404]);
      const asReview = await review(db, "zach", "amara", id);
      assert.deepEqual([id, asReview.ok, asReview.status], [id, false, 404]);
    }
  });

  test("only the lead and an admin are told they can decide", async () => {
    const db = makeDb(seed());
    assert.equal((await board(db, "claudia")).board.viewer.canDecide, true);
    assert.equal((await board(db, "zach")).board.viewer.canDecide, true);
    assert.equal((await board(db, "lloyd")).board.viewer.canDecide, false);
  });
});

describe("who may open one application", () => {
  /** [who, applicant, programme, expected] */
  const CASES = [
    ["zach", "amara", AGI, 200],
    ["claudia", "amara", AGI, 200],
    ["lloyd", "amara", AGI, 200],
    ["tess", "amara", TAIS, 200],
    ["tess", "amara", AGI, 404, "a lead reads it under their own programme only"],
    ["claudia", "amara", TAIS, 404],
    ["claudia", "sam", null, 404, "Sam did not rank AGI Strategy"],
    ["tess", "ben", null, 404],
    ["yusuf", "amara", AGI, 404],
    ["amara", "amara", AGI, 404, "the applicant, about themselves"],
    ["amara", "ben", AGI, 404],
    ["kofi", "amara", AGI, 404, "named, and no longer SU-recognised"],
    ["zach", "zara", AGI, 404, "a draft that was never sent is not an application"],
    ["zach", "nobody", AGI, 404],
    ["lloyd", "lloyd", AGI, 404, "a reviewer, about their own application"],
    ["claudia", "claudia", AGI, 404, "a lead, about their own application"],
  ];
  for (const [who, applicant, programmeId, expected, why] of CASES) {
    test(`${who} opening ${applicant} under ${programmeId ?? "no programme"}${why ? ` (${why})` : ""}`, async () => {
      const db = makeDb(seed());
      const result = await load.loadReview(db, CAST[who], ROUND, applicant, programmeId);
      assert.equal(result.ok ? 200 : result.status, expected);
      if (!result.ok) assert.equal(result.error, "Not found");
    });
  }

  test("with no programme named, it opens under the first one the caller reviews in the applicant's ranking", async () => {
    const db = makeDb(seed());
    assert.equal((await load.loadReview(db, CAST.claudia, ROUND, "amara", null)).review.programme.id, AGI);
    assert.equal((await load.loadReview(db, CAST.tess, ROUND, "amara", null)).review.programme.id, TAIS);
    assert.equal((await load.loadReview(db, CAST.zach, ROUND, "wen", null)).review.programme.id, TAIS);
  });
});

describe("the gate comes before the applications", () => {
  test("somebody with no role costs one read of the form, and never reaches an application", async () => {
    for (const [who, programmeId] of [["yusuf", AGI], ["amara", AGI], ["tess", AGI], ["zach", "constructor"], ["zach", "no-such-programme"]]) {
      const db = makeDb(seed());
      const result = await board(db, who, programmeId);
      assert.equal(result.ok, false);
      assert.deepEqual(db.reads, ["admissionRounds"], `${who} asking for ${programmeId}`);
    }
    for (const who of ["yusuf", "amara"]) {
      const db = makeDb(seed());
      await review(db, who, "ben");
      assert.deepEqual(db.reads, ["admissionRounds"], `${who} asking for one application`);
    }
  });

  test("a refused write reads the form and stops", async () => {
    const db = makeDb(seed());
    await save(db, "yusuf", "amara", { overallComment: "Hello." });
    await decideAs(db, "yusuf", "amara", { programmeId: AGI, decision: "accept" });
    await decide.decideMany(db, CAST.yusuf, ROUND, AGI, { decision: "accept", uids: ["amara", "dev"] });
    assert.deepEqual([...new Set(db.reads)], ["admissionRounds"]);
    const noReads = makeDb(seed());
    await decide.revokeAcceptance(noReads, CAST.claudia, ROUND, "amara", { programmeId: AGI, reason: "No." });
    await decide.setRevealOtherReviews(noReads, CAST.claudia, ROUND, true);
    assert.deepEqual(noReads.reads, [], "an admin-only write refuses a lead before it reads anything");
  });
});

describe("a read writes nothing", () => {
  test("the list and the review screen leave every document as it was", async () => {
    const db = makeDb(seed());
    await board(db, "claudia");
    await board(db, "yusuf");
    await review(db, "claudia", "amara");
    await review(db, "zach", "amara");
    await review(db, "amara", "amara");
    assert.deepEqual(db.writes, []);
  });
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe("one programme's applications", () => {
  test("the lead sees who ranked it, without their own application and without drafts", async () => {
    const db = makeDb(seed());
    const result = await board(db, "claudia");
    assert.deepEqual(
      result.board.rows.map((row) => row.uid),
      ["amara", "ben", "dev", "wen", "lloyd"],
      "newest first; Sam did not rank it, Zara never sent, and Claudia is not shown herself",
    );
    assert.deepEqual(result.board.counts, { all: 5, toReview: 3, accepted: 0, pooled: 1, declined: 0 });
    assert.deepEqual(result.board.progress, {
      applications: 5,
      decided: 1,
      toReview: 3,
      placedElsewhere: 1,
      emailed: 0,
      placed: 0,
      invited: 0,
      placesLeft: 3,
    });
  });

  test("a row says where the programme sits in their ranking and where the application stands", async () => {
    const db = makeDb(seed());
    const result = await board(db, "claudia");
    const wen = rowOf(result, "wen");
    assert.deepEqual(
      [wen.choice, wen.firstChoiceName, wen.standing, wen.owesDecision, wen.placedOn, wen.accountWaiting],
      [2, "Technical AI Safety", "to-review", false, "Technical AI Safety", true],
      "their 1st choice accepted them, so this programme owes nothing",
    );
    const amara = rowOf(result, "amara");
    assert.deepEqual(
      [amara.choice, amara.firstChoiceName, amara.standing, amara.owesDecision, amara.wantsToFacilitate, amara.comments],
      [1, null, "to-review", true, true, 3],
    );
    assert.equal(amara.detail, "BA Philosophy · Graduating 2028");
    assert.deepEqual([rowOf(result, "ben").standing, rowOf(result, "ben").owesDecision], ["pooled", false]);
  });

  test("the score column is the mean of the reviewers, one voice each, once the caller has scored", async () => {
    const db = makeDb(seed());
    const result = await board(db, "claudia");
    // Claudia gave 4 and 5 (4.5); Lloyd gave 3. One voice each: 3.75.
    assert.equal(rowOf(result, "amara").score, "3.8");
    // Ben left the optional scored answer blank, so there is one thing to score.
    assert.equal(rowOf(result, "ben").score, "2.0");
    assert.equal(rowOf(result, "dev").score, null);
  });

  test("the score column is blind too: a reviewer who has not finished sees their own score or nothing", async () => {
    const db = makeDb(seed());
    const result = await board(db, "lloyd");
    assert.deepEqual(
      result.board.rows.map((row) => row.uid),
      ["amara", "ben", "dev", "wen", "claudia"],
      "Lloyd applied too, and is not shown his own application. His lead's is his to read.",
    );
    assert.equal(rowOf(result, "amara").score, "3.0", "his own score; Claudia's is held back until he has scored both answers");
    assert.equal(rowOf(result, "ben").score, null, "Claudia scored Ben, Lloyd has not");
    assert.deepEqual(result.board.counts, { all: 5, toReview: 3, accepted: 0, pooled: 1, declined: 0 });
  });

  test("an admin who has scored nothing sees no scores, until the switch is on for the form", async () => {
    const blind = await board(makeDb(seed()), "zach");
    assert.equal(rowOf(blind, "amara").score, null);
    assert.equal(blind.board.recommendations.scoredCount, 0);
    const open = await board(
      makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ revealOtherReviews: true }) })),
      "zach",
    );
    assert.equal(rowOf(open, "amara").score, "3.8");
    assert.equal(open.board.recommendations.scoredCount, 2);
  });

  test("what is left to review is the lead's undecided, and a reviewer's unscored", async () => {
    const db = makeDb(seed());
    assert.deepEqual((await board(db, "claudia")).board.queue, ["amara", "dev", "lloyd"]);
    assert.deepEqual(
      (await board(db, "lloyd")).board.queue,
      ["amara", "dev", "claudia"],
      "Amara is half scored; Ben is decided; Wen is placed by a higher choice",
    );
    assert.deepEqual((await board(db, "zach")).board.queue, ["amara", "dev", "lloyd", "claudia"]);
  });

  test("the recommendations come from the scores the caller may see", async () => {
    const db = makeDb(seed());
    const found = (await board(db, "claudia")).board.recommendations;
    assert.deepEqual(found.top, ["amara", "ben"]);
    assert.equal(found.scoredCount, 2);
    assert.equal(found.fillsPlaces, false, "two scored, three places");
    assert.deepEqual(found.rankedLower, ["wen"]);
    assert.equal(found.rankedLowerAllSecond, true);
    assert.equal(found.margin, "0.2");
    // Amara's Technical AI Safety score is 3.5, below her 3.75 here.
    assert.deepEqual(found.scoredHigherElsewhere, []);
  });

  test("a programme that does not use scores has no recommendations and no score column to fill", async () => {
    const noScores = roundDoc();
    noScores.programmes[AGI].useScores = false;
    const result = await board(makeDb(seed({ [`admissionRounds/${ROUND}`]: noScores })), "claudia");
    assert.equal(result.board.recommendations, null);
    assert.equal(result.board.programme.usesScores, false);
    assert.ok(result.board.rows.every((row) => row.score === null));
    assert.deepEqual(result.board.queue, ["amara", "dev", "lloyd"]);
  });

  test("somebody who scored higher on another programme's questions is named for it", async () => {
    const db = makeDb(
      seed({
        // Tess gave Amara 5 and 5 on the Technical AI Safety answers.
        [`admissionReviews/${ROUND}__amara__tess`]: reviewDoc("amara", "tess", { [`${TAIS}.python`]: 5, [`${TAIS}.built`]: 5 }),
      }),
    );
    const forClaudia = (await board(db, "claudia")).board.recommendations;
    assert.deepEqual(forClaudia.scoredHigherElsewhere, [
      { programmeId: TAIS, shortName: "Technical AI Safety", uids: ["amara"] },
    ]);
    // Lloyd has not finished his first review of Amara, so nothing else is shown to him about her.
    const forLloyd = (await board(db, "lloyd")).board.recommendations;
    assert.deepEqual(forLloyd.scoredHigherElsewhere, []);
  });

  test("after decision day the list says so, and counts who was emailed", async () => {
    const sent = seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }) });
    sent[`admissionApplications/${ROUND}__ben`].result = { kind: "no-offer", programmeId: null, publishedAt: NOW };
    sent[`admissionApplications/${ROUND}__dev`].result = { kind: "declined", programmeId: null, publishedAt: NOW };
    const result = await board(makeDb(sent), "claudia");
    assert.equal(result.board.round.decisionsSent, true);
    assert.equal(result.board.progress.emailed, 1, "a declined application is published and not emailed");
  });

  test("no row, count or recommendation a lead is sent carries an address", async () => {
    const db = makeDb(seed());
    for (const who of ["claudia", "lloyd", "zach"]) {
      const result = await board(db, who);
      assert.equal(mentionsAnAddress(result.board), false, `${who}'s list carries an address`);
    }
  });
});

// ---------------------------------------------------------------------------
// One application
// ---------------------------------------------------------------------------

describe("one application, for review", () => {
  test("the answers come in the order they were asked, each section in its place", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "claudia", "amara");
    assert.deepEqual(
      seen.sections.map((section) => [section.id, section.title, section.tab, section.mode, section.note]),
      [
        ["fellowships", "Fellowship questions", "Fellowships", "open", null],
        [AGI, "AGI Strategy questions", "AGI Strategy", "focus", null],
        [TAIS, "Technical AI Safety questions", "Technical AI Safety", "collapsed", "Tess reviews these"],
        ["facilitator", "Facilitator questions", "Facilitator", "collapsed", "You and admins decide these"],
      ],
    );
    assert.deepEqual(seen.sections[0].chips.map((chip) => chip.text), ["For both fellowships", "Not scored"]);
    assert.deepEqual(seen.sections[1].chips, [{ text: "Scored", tone: "accent" }]);
    assert.deepEqual(
      seen.applicant.ranked.map((entry) => [entry.shortName, entry.choice, entry.focus]),
      [["AGI Strategy", 1, true], ["Technical AI Safety", 2, false]],
    );
  });

  test("only this programme's scored answers can be scored on this screen", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "claudia", "amara");
    assert.deepEqual(seen.review.scorableKeys, [`${AGI}.event`, `${AGI}.plan`]);
    const scorable = seen.sections.flatMap((section) => section.answers).filter((answer) => answer.scorable);
    assert.deepEqual(scorable.map((answer) => answer.key), [`${AGI}.event`, `${AGI}.plan`]);
    // Ben left the optional scored answer blank: there is nothing there to score.
    const ben = (await review(db, "claudia", "ben")).review;
    assert.deepEqual(ben.review.scorableKeys, [`${AGI}.event`]);
    assert.equal(ben.sections[1].answers[1].answered, false);
    assert.equal(ben.sections[1].answers[1].scorable, false);
  });

  test("a scale answer carries its points, and what was sent is what is read", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "tess", "amara", TAIS);
    const python = seen.sections.find((section) => section.id === TAIS).answers[0];
    assert.deepEqual(python.scale, { options: ["Never tried", "Can follow it", "Write it often"], index: 1 });
    assert.equal(seen.sections.find((section) => section.id === AGI).note, "Claudia reviews these");
    assert.equal(seen.sections.find((section) => section.id === "facilitator").note, "You and admins decide these");
  });

  test("the draft is never read: a half-made change does not reach a reviewer", async () => {
    const docs = seed();
    docs[`admissionApplications/${ROUND}__amara`].draft = {
      ...docs[`admissionApplications/${ROUND}__amara`].draft,
      rankedProgrammeIds: [TAIS],
      answers: { fellowships: { why: "REWRITTEN AND NOT SENT" } },
    };
    const { review: seen } = await review(makeDb(docs), "claudia", "amara");
    assert.equal(stringsIn(seen).some((text) => text.includes("REWRITTEN")), false);
    assert.equal(seen.applicant.ranked.length, 2);
  });

  test("a first review is blind: what Claudia scored and wrote is not in Lloyd's payload at all", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "lloyd", "amara");
    assert.deepEqual(seen.review.scores, { [`${AGI}.event`]: 3 });
    assert.equal(seen.review.ownScore, "3.0");
    assert.deepEqual(seen.review.others, { count: 1, hidden: 1, visible: [] });
    assert.deepEqual(seen.review.comments.map((comment) => [comment.key, comment.mine]), [["fellowships.why", true]]);
    const everything = stringsIn(seen).join("\n");
    assert.equal(everything.includes("Argued from both sides."), false, "her comment");
    assert.equal(everything.includes("Strong. Would do well in a group."), false, "her overall comment");
    assert.equal(everything.includes("Careful write-up."), false, "another programme's reviewer's comment");
  });

  test("once every answer is scored, the other reviews for the programme are there", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "claudia", "amara");
    assert.equal(seen.review.ownScore, "4.5");
    assert.equal(seen.review.overallComment, "Strong. Would do well in a group.");
    assert.deepEqual(seen.review.others, {
      count: 1,
      hidden: 0,
      visible: [{ reviewerUid: "lloyd", name: "Lloyd", score: "3.0", overallComment: "A bit general." }],
    });
    assert.deepEqual(
      seen.review.comments.map((comment) => [comment.authorName, comment.key, comment.mine, comment.when]),
      [
        ["Claudia", `${AGI}.event`, true, "Sat 17 Oct"],
        ["Lloyd", "fellowships.why", false, "Sat 17 Oct"],
        ["Tess", `${TAIS}.built`, false, "Sat 17 Oct"],
      ],
    );
  });

  test("a row that only scores another programme's answers is not one of this programme's reviews", async () => {
    const db = makeDb(seed());
    // Tess scored Amara's Technical AI Safety answers. That is not an AGI Strategy review.
    assert.equal((await review(db, "claudia", "amara")).review.review.others.count, 1);
    assert.equal((await review(db, "tess", "amara", TAIS)).review.review.others.count, 0);
  });

  test("the admin's switch lifts the blind for everybody on the form", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ revealOtherReviews: true }) }));
    const { review: seen } = await review(db, "lloyd", "amara");
    assert.equal(seen.review.others.hidden, 0);
    assert.deepEqual(seen.review.others.visible.map((other) => [other.name, other.score]), [["Claudia", "4.5"]]);
    assert.ok(seen.review.comments.some((comment) => comment.text === "Argued from both sides."));
  });

  test("an admin is blind as well, stream by stream, and is told how many reviews are held back", async () => {
    const db = makeDb(seed());
    const { review: seen } = await review(db, "zach", "amara");
    assert.deepEqual(seen.review.others, { count: 2, hidden: 2, visible: [] });
    assert.deepEqual(seen.review.comments, []);
    assert.deepEqual(seen.admin, {
      revealOtherReviews: false,
      sections: [
        { programmeId: AGI, shortName: "AGI Strategy", score: null, line: null, hidden: 2 },
        { programmeId: TAIS, shortName: "Technical AI Safety", score: null, line: null, hidden: 1 },
      ],
    });
  });

  test("with the switch on an admin reads each section's score and who gave what", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ revealOtherReviews: true }) }));
    const { review: seen } = await review(db, "zach", "amara");
    assert.deepEqual(seen.admin.sections, [
      { programmeId: AGI, shortName: "AGI Strategy", score: "3.8", line: "Claudia 4.5 · Lloyd 3 so far", hidden: 0 },
      { programmeId: TAIS, shortName: "Technical AI Safety", score: "3.5", line: "Tess scored 3 and 4", hidden: 0 },
    ]);
  });

  test("a comment on another stream's answer waits for that stream's first review, where the caller reviews it", async () => {
    // Zach has finished AGI Strategy for Amara and has not touched Technical AI Safety.
    const db = makeDb(
      seed({
        [`admissionReviews/${ROUND}__amara__zach`]: reviewDoc("amara", "zach", { [`${AGI}.event`]: 4, [`${AGI}.plan`]: 4 }),
      }),
    );
    const { review: seen } = await review(db, "zach", "amara");
    const texts = seen.review.comments.map((comment) => comment.text);
    assert.ok(texts.includes("Argued from both sides."), "AGI Strategy is unblinded for him");
    assert.ok(texts.includes("Clear about why this term."));
    assert.equal(texts.includes("Careful write-up."), false, "that one is on a stream he still owes a first review");
    assert.deepEqual(seen.admin.sections.map((section) => section.hidden), [0, 1]);
  });

  test("an applicant's addresses are on an admin's payload and on nobody else's", async () => {
    const db = makeDb(seed());
    const forAdmin = (await review(db, "zach", "amara")).review;
    assert.equal(forAdmin.applicant.email, "amara@example.com");
    assert.equal(forAdmin.applicant.universityEmail, "amara@nottingham.ac.uk");
    for (const who of ["claudia", "lloyd"]) {
      const seen = (await review(db, who, "amara")).review;
      assert.equal("email" in seen.applicant, false);
      assert.equal("universityEmail" in seen.applicant, false);
      assert.equal(mentionsAnAddress(seen), false, `${who}'s payload carries an address`);
      assert.equal(seen.admin, null);
    }
    assert.equal(mentionsAnAddress((await review(db, "tess", "amara", TAIS)).review), false);
  });

  test("the decision block says where the application stands and what the lead can do about it", async () => {
    const db = makeDb(seed());
    const amara = (await review(db, "claudia", "amara")).review;
    assert.deepEqual(
      [amara.decision.standing, amara.decision.owesDecision, amara.decision.kind, amara.viewer.canDecide],
      ["to-review", true, null, true],
    );
    assert.deepEqual(amara.decision.couldSuitOptions, [{ programmeId: TAIS, shortName: "Technical AI Safety" }]);
    assert.deepEqual([amara.programme.places, amara.programme.placesLeft], [3, 3]);
    const ben = (await review(db, "claudia", "ben")).review;
    assert.deepEqual(
      [ben.decision.standing, ben.decision.kind, ben.decision.decidedByName, ben.decision.decidedOn],
      ["pooled", "pool", "Claudia", "Mon 19 Oct"],
    );
    const wen = (await review(db, "claudia", "wen")).review;
    assert.deepEqual([wen.decision.owesDecision, wen.decision.placedOn], [false, "Technical AI Safety"]);
    assert.equal((await review(db, "lloyd", "amara")).review.viewer.canDecide, false);
  });

  test("the queue is the same one the list walks", async () => {
    const db = makeDb(seed());
    assert.deepEqual((await review(db, "claudia", "dev")).review.queue, {
      position: 2,
      total: 3,
      previousUid: "amara",
      nextUid: "lloyd",
    });
    assert.deepEqual((await review(db, "claudia", "ben")).review.queue, {
      position: null,
      total: 3,
      previousUid: "amara",
      nextUid: "dev",
    });
  });
});

// ---------------------------------------------------------------------------
// Saving a review
// ---------------------------------------------------------------------------

const save = (db, who, applicant, body) => {
  const parsed = saveReviewModule.parseReviewChange(body);
  assert.equal(parsed.ok, true, `the request should parse: ${parsed.error}`);
  return saveReviewModule.saveReview(db, CAST[who], ROUND, applicant, parsed.change);
};

describe("what a review request may look like", () => {
  const refused = [
    [null, "no body"],
    [[], "a list"],
    [{}, "nothing in it"],
    [{ scores: {} }, "no scores"],
    [{ scores: { [`${AGI}.event`]: 6 } }, "out of range"],
    [{ scores: { [`${AGI}.event`]: 0 } }, "out of range"],
    [{ scores: { [`${AGI}.event`]: 3.5 } }, "not a whole number"],
    [{ scores: { [`${AGI}.event`]: "4" } }, "a string"],
    [{ scores: { event: 4 } }, "not a question key"],
    [{ scores: [4] }, "a list of scores"],
    [{ overallComment: 7 }, "not text"],
    [{ overallComment: "x".repeat(4001) }, "too long"],
    [{ comments: "nice" }, "not a list"],
    [{ comments: [{ op: "add", key: `${AGI}.event`, text: "   " }] }, "an empty comment"],
    [{ comments: [{ op: "add", key: "event", text: "Good." }] }, "a comment on no answer"],
    [{ comments: [{ op: "add", key: `${AGI}.event`, text: "x".repeat(1001) }] }, "too long"],
    [{ comments: [{ op: "edit", id: "no dots.allowed", text: "Good." }] }, "not a comment id"],
    [{ comments: [{ op: "shout", id: "c1" }] }, "not an operation"],
    [{ comments: Array.from({ length: 21 }, () => ({ op: "remove", id: "c1" })) }, "too many at once"],
  ];
  for (const [body, why] of refused) {
    test(`refused: ${why}`, () => {
      const parsed = saveReviewModule.parseReviewChange(body);
      assert.deepEqual([parsed.ok, parsed.status], [false, 400]);
      assert.ok(parsed.error.length > 10, "a refusal is a sentence somebody can act on");
    });
  }

  test("a score can be taken back, and text is trimmed", () => {
    const parsed = saveReviewModule.parseReviewChange({
      scores: { [`${AGI}.event`]: null },
      overallComment: "  Strong.  ",
      comments: [{ op: "add", key: `${AGI}.event`, text: "  Good.  " }, { op: "remove", id: "c1" }],
    });
    assert.deepEqual(parsed.change, {
      scores: { [`${AGI}.event`]: null },
      overallComment: "Strong.",
      comments: [{ op: "add", key: `${AGI}.event`, text: "Good." }, { op: "remove", id: "c1" }],
    });
  });
});

describe("a reviewer saving their own review", () => {
  test("the row written is the caller's own, with the total worked out from its scores", async () => {
    const db = makeDb(seed());
    const result = await save(db, "lloyd", "amara", { scores: { [`${AGI}.plan`]: 4 }, total: 99, reviewerUid: "claudia" });
    assert.deepEqual(result, { ok: true });
    const row = db.read(`admissionReviews/${ROUND}__amara__lloyd`);
    assert.deepEqual(row.scores, { [`${AGI}.event`]: 3, [`${AGI}.plan`]: 4 });
    assert.equal(row.total, 7, "the sum of the scores, never what the request said");
    assert.equal(row.reviewerUid, "lloyd");
    assert.equal(row.notes, "A bit general.", "what was not sent is left as it was");
    assert.deepEqual(db.writes.map((write) => write.path), [`admissionReviews/${ROUND}__amara__lloyd`]);
    // And that finished his first review.
    const { review: seen } = await review(db, "lloyd", "amara");
    assert.equal(seen.review.others.hidden, 0);
    assert.deepEqual(seen.review.others.visible.map((other) => other.name), ["Claudia"]);
  });

  test("a first save creates the row with the fields the rest of the site reads", async () => {
    const db = makeDb(seed());
    await save(db, "claudia", "dev", { scores: { [`${AGI}.event`]: 5 }, overallComment: "Sharp." });
    assert.deepEqual(db.read(`admissionReviews/${ROUND}__dev__claudia`), {
      roundId: ROUND,
      applicantUid: "dev",
      reviewerUid: "claudia",
      scores: { [`${AGI}.event`]: 5 },
      total: 5,
      comments: [],
      notes: "Sharp.",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  test("a score taken back leaves the row without it and the total lower", async () => {
    const db = makeDb(seed());
    await save(db, "claudia", "amara", { scores: { [`${AGI}.plan`]: null } });
    const row = db.read(`admissionReviews/${ROUND}__amara__claudia`);
    assert.deepEqual(row.scores, { [`${AGI}.event`]: 4 });
    assert.equal(row.total, 4);
    // Her first review is open again, so the others are held back again.
    assert.equal((await review(db, "claudia", "amara")).review.review.others.hidden, 1);
  });

  test("a score lands only on a programme the caller reviews", async () => {
    const db = makeDb(seed());
    const onAnother = await save(db, "lloyd", "amara", { scores: { [`${TAIS}.built`]: 5 } });
    assert.deepEqual([onAnother.ok, onAnother.status], [false, 400]);
    const onAGeneralAnswer = await save(db, "lloyd", "amara", { scores: { "fellowships.why": 5 } });
    assert.deepEqual([onAGeneralAnswer.ok, onAGeneralAnswer.status], [false, 400]);
    const onABlank = await save(db, "claudia", "ben", { scores: { [`${AGI}.plan`]: 3 } });
    assert.deepEqual([onABlank.ok, onABlank.status], [false, 400], "Ben did not answer that one");
    assert.deepEqual(db.writes, []);
    // Tess reviews Technical AI Safety, and an admin reviews both.
    assert.deepEqual(await save(db, "tess", "amara", { scores: { [`${TAIS}.built`]: 5 } }), { ok: true });
    assert.deepEqual(await save(db, "zach", "amara", { scores: { [`${TAIS}.built`]: 2, [`${AGI}.event`]: 4 } }), { ok: true });
  });

  test("comments are added, edited and removed on the caller's own row", async () => {
    const db = makeDb(seed());
    await save(db, "lloyd", "amara", { comments: [{ op: "add", key: "about-you.motivation", text: "Thoughtful." }] });
    let row = db.read(`admissionReviews/${ROUND}__amara__lloyd`);
    assert.equal(row.comments.length, 2);
    const added = row.comments[1];
    assert.deepEqual([added.questionKey, added.text], ["about-you.motivation", "Thoughtful."]);
    assert.match(added.id, /^[A-Za-z0-9_-]{1,80}$/);

    await save(db, "lloyd", "amara", { comments: [{ op: "edit", id: added.id, text: "Thoughtful, and specific." }] });
    row = db.read(`admissionReviews/${ROUND}__amara__lloyd`);
    assert.equal(row.comments[1].text, "Thoughtful, and specific.");

    await save(db, "lloyd", "amara", { comments: [{ op: "remove", id: "c1" }] });
    row = db.read(`admissionReviews/${ROUND}__amara__lloyd`);
    assert.deepEqual(row.comments.map((comment) => comment.id), [added.id]);
    // Claudia's comment with the same id, on her own row, was never his to touch.
    assert.equal(db.read(`admissionReviews/${ROUND}__amara__claudia`).comments.length, 1);
  });

  test("a comment has to be on an answer this applicant sent, and an edit on a comment that exists", async () => {
    const db = makeDb(seed());
    const elsewhere = await save(db, "claudia", "ben", { comments: [{ op: "add", key: `${TAIS}.built`, text: "?" }] });
    assert.deepEqual([elsewhere.ok, elsewhere.status], [false, 400], "Ben did not rank that programme");
    const gone = await save(db, "claudia", "amara", { comments: [{ op: "edit", id: "not-there", text: "?" }] });
    assert.deepEqual([gone.ok, gone.status], [false, 409]);
  });

  test("a review holds a bounded number of comments", async () => {
    const full = Array.from({ length: 60 }, (_, i) => [`c${i}`, "fellowships.why", `Note ${i}`]);
    const db = makeDb(seed({ [`admissionReviews/${ROUND}__dev__claudia`]: reviewDoc("dev", "claudia", {}, full) }));
    const result = await save(db, "claudia", "dev", { comments: [{ op: "add", key: "fellowships.why", text: "One more." }] });
    assert.deepEqual([result.ok, result.status], [false, 409]);
  });

  test("nobody reviews their own application", async () => {
    const db = makeDb(seed());
    const result = await save(db, "lloyd", "lloyd", { scores: { [`${AGI}.event`]: 5 } });
    assert.deepEqual([result.ok, result.status], [false, 403]);
    assert.deepEqual(db.writes, []);
  });

  test("everybody without a claim on the application is told it is not there", async () => {
    const body = { overallComment: "Hello." };
    for (const [who, applicant] of [["yusuf", "amara"], ["amara", "ben"], ["amara", "amara"], ["tess", "ben"], ["kofi", "amara"], ["claudia", "zara"], ["claudia", "nobody"]]) {
      const db = makeDb(seed());
      const result = await save(db, who, applicant, body);
      assert.deepEqual([who, applicant, result.ok, result.status], [who, applicant, false, 404]);
      assert.deepEqual(db.writes, []);
    }
  });

  test("a form that is archived, a draft or cancelled takes no review", async () => {
    for (const over of [{ archived: true }, { status: "draft" }, { status: "cancelled" }]) {
      const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc(over) }));
      const result = await save(db, "claudia", "amara", { overallComment: "Late." });
      assert.deepEqual([result.ok, result.status], [false, 409]);
    }
  });
});

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

const decideAs = (db, who, applicant, body) => {
  const parsed = decide.parseDecision(body);
  assert.equal(parsed.ok, true, `the request should parse: ${parsed.error}`);
  return decide.decideApplication(db, CAST[who], ROUND, applicant, parsed.change);
};
const auditRows = (db) => db.paths("courseAudit/").map((path) => db.read(path));

describe("what a decision request may look like", () => {
  const refused = [
    [{}, "nothing in it"],
    [null, "no body"],
    [{ programmeId: AGI }, "no decision"],
    [{ programmeId: AGI, decision: "waitlist" }, "not one of the three"],
    [{ decision: "accept" }, "no programme"],
    [{ programmeId: "a.b", decision: "accept" }, "not an id"],
    [{ programmeId: AGI, decision: "pool", poolReason: "vibes" }, "not a reason"],
    [{ programmeId: AGI, decision: "pool", couldSuitProgrammeId: AGI }, "could suit the same programme"],
  ];
  for (const [body, why] of refused) {
    test(`refused: ${why}`, () => {
      const parsed = decide.parseDecision(body);
      assert.deepEqual([parsed.ok, parsed.status], [false, 400]);
    });
  }

  test("a reason and a programme they could suit belong to Pool only", () => {
    assert.deepEqual(
      decide.parseDecision({ programmeId: AGI, decision: "accept", poolReason: "capacity", couldSuitProgrammeId: TAIS }).change,
      { programmeId: AGI, decision: "accept", poolReason: null, couldSuitProgrammeId: null },
    );
    assert.deepEqual(
      decide.parseDecision({ programmeId: AGI, decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: TAIS }).change,
      { programmeId: AGI, decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: TAIS },
    );
  });
});

describe("a lead deciding for their programme", () => {
  test("it writes the decision and a line in the log, and nothing else", async () => {
    const db = makeDb(seed());
    const application = JSON.stringify(db.read(`admissionApplications/${ROUND}__amara`));
    const round = JSON.stringify(db.read(`admissionRounds/${ROUND}`));

    const result = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    assert.deepEqual(result, { ok: true, changed: true });

    assert.deepEqual(db.read(`admissionDecisions/${ROUND}__amara`), {
      roundId: ROUND,
      uid: "amara",
      programmes: {
        [AGI]: { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: NOW },
      },
      updatedAt: NOW,
    });
    assert.deepEqual(
      db.writes.map((write) => write.path.split("/")[0]).sort(),
      ["admissionDecisions", "courseAudit"],
    );
    assert.equal(JSON.stringify(db.read(`admissionApplications/${ROUND}__amara`)), application, "the applicant's own document is untouched");
    assert.equal(JSON.stringify(db.read(`admissionRounds/${ROUND}`)), round, "no counter moves: nobody's status changed");

    const [row] = auditRows(db);
    assert.deepEqual(
      { ...row },
      {
        kind: "application-decision",
        runId: "",
        groupId: null,
        subjectUid: "amara",
        actorUid: "claudia",
        actorName: "Claudia Reyes",
        targetLabel: "Autumn 2026 · AGI Strategy",
        detail: "Claudia accepted Amara Okafor for AGI Strategy.",
        roundId: ROUND,
        programmeId: AGI,
        at: NOW,
      },
    );
  });

  test("another programme's decision, the pooled outcome and the round's ids survive a second decision", async () => {
    const db = makeDb(seed());
    // Sam is pooled by Technical AI Safety with an outcome picked. Make Sam an AGI applicant too.
    const sam = db.read(`admissionApplications/${ROUND}__sam`);
    sam.sent.rankedProgrammeIds = [TAIS, AGI];
    sam.sent.answers[AGI] = { event: "A new model." };
    const next = makeDb({ ...seed(), [`admissionApplications/${ROUND}__sam`]: sam });
    await decideAs(next, "claudia", "sam", { programmeId: AGI, decision: "pool", poolReason: "capacity" });
    const stored = next.read(`admissionDecisions/${ROUND}__sam`);
    assert.deepEqual(Object.keys(stored.programmes).sort(), [AGI, TAIS].sort());
    assert.equal(stored.programmes[TAIS].decidedByUid, "tess");
    assert.deepEqual(stored.programmes[AGI].poolReason, "capacity");
    assert.deepEqual(stored.pooledOutcome, { kind: "no-offer", setByUid: "zach", setAt: NOW });
    assert.deepEqual([stored.roundId, stored.uid], [ROUND, "sam"]);
    void db;
  });

  test("a decision document that somehow lacks its round and applicant gets them on the next write", async () => {
    const db = makeDb(
      seed({ [`admissionDecisions/${ROUND}__dev`]: { programmes: {}, pooledOutcome: null, exception: null } }),
    );
    await decideAs(db, "claudia", "dev", { programmeId: AGI, decision: "accept" });
    const stored = db.read(`admissionDecisions/${ROUND}__dev`);
    assert.deepEqual([stored.roundId, stored.uid], [ROUND, "dev"]);
  });

  test("a lead can change their mind, and the log says what it replaced", async () => {
    const db = makeDb(seed());
    await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    const again = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    assert.deepEqual(again, { ok: true, changed: false }, "the same decision twice is one decision");
    await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: TAIS });
    const entry = db.read(`admissionDecisions/${ROUND}__amara`).programmes[AGI];
    assert.deepEqual(
      [entry.decision, entry.poolReason, entry.couldSuitProgrammeId],
      ["pool", "better-fit", TAIS],
    );
    assert.deepEqual(
      auditRows(db).map((row) => row.detail),
      [
        "Claudia accepted Amara Okafor for AGI Strategy.",
        "Claudia pooled Amara Okafor for AGI Strategy. It was accepted before.",
      ],
    );
    await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "decline" });
    assert.equal(db.read(`admissionDecisions/${ROUND}__amara`).programmes[AGI].poolReason, null);
  });

  test("an admin decides for any programme", async () => {
    const db = makeDb(seed());
    assert.deepEqual(await decideAs(db, "zach", "sam", { programmeId: TAIS, decision: "accept" }), { ok: true, changed: true });
    assert.equal(db.read(`admissionDecisions/${ROUND}__sam`).programmes[TAIS].decidedByUid, "zach");
  });

  test("a reviewer cannot decide, and everybody with no role is told there is nothing there", async () => {
    const body = { programmeId: AGI, decision: "accept" };
    const reviewer = makeDb(seed());
    const refused = await decideAs(reviewer, "lloyd", "amara", body);
    assert.deepEqual([refused.ok, refused.status], [false, 403]);
    assert.deepEqual(reviewer.writes, []);
    for (const who of ["tess", "yusuf", "amara", "kofi"]) {
      const db = makeDb(seed());
      const result = await decideAs(db, who, "amara", body);
      assert.deepEqual([who, result.ok, result.status, result.error], [who, false, 404, "Not found"]);
      assert.deepEqual(db.writes, []);
    }
  });

  test("nobody decides their own application", async () => {
    const db = makeDb(seed());
    const result = await decideAs(db, "claudia", "claudia", { programmeId: AGI, decision: "accept" });
    assert.deepEqual([result.ok, result.status], [false, 403]);
    assert.deepEqual(db.writes, []);
  });

  test("the applicant has to have sent an application that ranks the programme", async () => {
    const db = makeDb(seed());
    const body = { programmeId: AGI, decision: "accept" };
    assert.equal((await decideAs(db, "claudia", "sam", body)).status, 409, "Sam did not rank it");
    assert.equal((await decideAs(db, "claudia", "zara", body)).status, 404, "a draft");
    assert.equal((await decideAs(db, "claudia", "nobody", body)).status, 404);
    assert.equal((await decideAs(db, "zach", "amara", { programmeId: "no-such-programme", decision: "accept" })).status, 404);
    assert.equal(
      (await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "pool", couldSuitProgrammeId: "gone" })).status,
      400,
    );
    assert.deepEqual(db.writes, []);
  });

  test("an id that is the name of something every object carries decides nothing", async () => {
    for (const id of ["constructor", "__proto__", "toString"]) {
      const db = makeDb(seed());
      const result = await decideAs(db, "zach", "amara", { programmeId: id, decision: "accept" });
      assert.deepEqual([id, result.ok, result.status], [id, false, 404]);
      const suits = await decideAs(db, "zach", "amara", { programmeId: AGI, decision: "pool", couldSuitProgrammeId: id });
      assert.deepEqual([id, suits.ok, suits.status], [id, false, 400]);
      assert.deepEqual(db.writes, []);
    }
  });

  test("after decision day nothing changes", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }) }));
    const result = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    assert.deepEqual([result.ok, result.status], [false, 409]);
    assert.match(result.error, /have been sent/);
    const asAdmin = await decideAs(db, "zach", "amara", { programmeId: AGI, decision: "pool" });
    assert.equal(asAdmin.status, 409);
    assert.deepEqual(db.writes, []);
  });

  test("a decision and the send cannot both win: the form is read again inside the transaction", async () => {
    const db = makeDb(seed());
    // Decision day runs after this request has passed its gate and before its write.
    const transact = db.runTransaction;
    db.runTransaction = async (fn) => {
      db.poke(`admissionRounds/${ROUND}`, { decisionsSentAt: NOW, decisionsSentByUid: "zach" });
      return transact(fn);
    };
    const result = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    assert.deepEqual([result.ok, result.status], [false, 409]);
    assert.deepEqual(db.writes, []);
    assert.equal(db.read(`admissionDecisions/${ROUND}__amara`), undefined);

    const revoking = makeDb(seed({
      [`admissionDecisions/${ROUND}__amara`]: { roundId: ROUND, uid: "amara", programmes: { [AGI]: decided("accept", "claudia") } },
    }));
    const inner = revoking.runTransaction;
    revoking.runTransaction = async (fn) => {
      revoking.poke(`admissionRounds/${ROUND}`, { decisionsSentAt: NOW });
      return inner(fn);
    };
    const revoked = await decide.revokeAcceptance(revoking, CAST.zach, ROUND, "amara", { programmeId: AGI, reason: "Late." });
    assert.deepEqual([revoked.ok, revoked.status], [false, 409]);
    assert.deepEqual(revoking.writes, []);
  });

  test("a lead whose name comes off the programme mid-request decides nothing", async () => {
    const db = makeDb(seed());
    const transact = db.runTransaction;
    db.runTransaction = async (fn) => {
      const round = db.read(`admissionRounds/${ROUND}`);
      round.programmes[AGI].leadUid = "tess";
      db.poke(`admissionRounds/${ROUND}`, { programmes: round.programmes });
      return transact(fn);
    };
    const result = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    assert.deepEqual([result.ok, result.status], [false, 404]);
    assert.deepEqual(db.writes, []);
  });

  test("a form that is archived, a draft or cancelled takes no decision", async () => {
    for (const over of [{ archived: true }, { status: "draft" }, { status: "cancelled" }]) {
      const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc(over) }));
      const result = await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
      assert.deepEqual([result.ok, result.status], [false, 409]);
    }
  });

  test("the list and the review screen follow the decision without anything being recounted", async () => {
    const db = makeDb(seed());
    await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "accept" });
    const result = await board(db, "claudia");
    assert.deepEqual(result.board.counts, { all: 5, toReview: 2, accepted: 1, pooled: 1, declined: 0 });
    assert.deepEqual([result.board.progress.placed, result.board.progress.placesLeft], [1, 2]);
    assert.deepEqual(result.board.queue, ["dev", "lloyd"]);
    const seen = (await review(db, "claudia", "amara")).review;
    assert.deepEqual(
      [seen.decision.standing, seen.decision.decidedByName, seen.decision.decidedOn, seen.queue.position],
      ["accepted", "Claudia", "Mon 19 Oct", null],
    );
  });
});

describe("accepting or pooling several at once", () => {
  test("what a bulk request may look like", () => {
    for (const body of [{}, { decision: "decline", uids: ["amara"] }, { decision: "accept" }, { decision: "accept", uids: [] }, { decision: "accept", uids: ["a/b"] }, { decision: "accept", uids: [7] }, { decision: "pool", uids: Array.from({ length: 201 }, (_, i) => `u${i}`) }]) {
      const parsed = decide.parseBulkDecision(body);
      assert.deepEqual([parsed.ok, parsed.status], [false, 400]);
    }
    assert.deepEqual(decide.parseBulkDecision({ decision: "pool", uids: ["amara", "dev", "amara"] }), {
      ok: true,
      decision: "pool",
      uids: ["amara", "dev"],
    });
  });

  test("each application is decided under the same rules, and the answer says which were refused and why", async () => {
    const db = makeDb(seed());
    const outcome = await decide.decideMany(db, CAST.claudia, ROUND, AGI, {
      decision: "accept",
      uids: ["amara", "dev", "sam", "ghost", "claudia"],
    });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result, {
      decision: "accept",
      changed: 2,
      unchanged: 0,
      refused: [
        { uid: "sam", name: "Sam Whitfield", reason: "They did not rank AGI Strategy." },
        { uid: "ghost", name: "", reason: "There is no sent application here." },
        { uid: "claudia", name: "", reason: "You can’t decide your own application." },
      ],
    });
    assert.equal(db.read(`admissionDecisions/${ROUND}__amara`).programmes[AGI].decision, "accept");
    assert.equal(db.read(`admissionDecisions/${ROUND}__dev`).programmes[AGI].decision, "accept");
    assert.equal(db.read(`admissionDecisions/${ROUND}__sam`).programmes[AGI], undefined);
    assert.equal(auditRows(db).length, 2, "one line in the log for each decision made");
    assert.ok(db.writes.every((write) => !write.path.startsWith("admissionApplications/")));

    const again = await decide.decideMany(db, CAST.claudia, ROUND, AGI, { decision: "accept", uids: ["amara", "ben"] });
    assert.deepEqual([again.result.changed, again.result.unchanged], [1, 1], "Ben was pooled and is now accepted; Amara already was");
  });

  test("the same people who cannot decide one cannot decide many", async () => {
    const input = { decision: "pool", uids: ["amara"] };
    const db = makeDb(seed());
    assert.equal((await decide.decideMany(db, CAST.lloyd, ROUND, AGI, input)).status, 403);
    for (const who of ["tess", "yusuf", "amara"]) {
      assert.equal((await decide.decideMany(db, CAST[who], ROUND, AGI, input)).status, 404);
    }
    assert.equal((await decide.decideMany(db, CAST.zach, ROUND, "constructor", input)).status, 404);
    assert.equal((await decide.decideMany(db, CAST.zach, "no-such-round", AGI, input)).status, 404);
    assert.deepEqual(db.writes, []);
    const sent = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW }) }));
    assert.equal((await decide.decideMany(sent, CAST.claudia, ROUND, AGI, input)).status, 409);
  });
});

// ---------------------------------------------------------------------------
// Revoking an acceptance
// ---------------------------------------------------------------------------

describe("an admin revoking an acceptance", () => {
  const accepted = () => {
    const docs = seed();
    docs[`admissionDecisions/${ROUND}__amara`] = {
      roundId: ROUND,
      uid: "amara",
      programmes: { [AGI]: decided("accept", "claudia"), [TAIS]: decided("pool", "tess") },
      pooledOutcome: null,
      exception: null,
    };
    return docs;
  };

  test("it needs a programme and a reason", () => {
    for (const body of [{}, { programmeId: AGI }, { programmeId: AGI, reason: "   " }, { reason: "Why." }, { programmeId: AGI, reason: "x".repeat(501) }]) {
      const parsed = decide.parseRevocation(body);
      assert.deepEqual([parsed.ok, parsed.status], [false, 400]);
    }
    assert.deepEqual(decide.parseRevocation({ programmeId: AGI, reason: "  She withdrew.  " }), {
      ok: true,
      programmeId: AGI,
      reason: "She withdrew.",
    });
  });

  test("the acceptance goes, the application is to review again, and the reason is logged", async () => {
    const db = makeDb(accepted());
    const application = JSON.stringify(db.read(`admissionApplications/${ROUND}__amara`));
    const result = await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", { programmeId: AGI, reason: "She has taken a place elsewhere." });
    assert.deepEqual(result, { ok: true });

    const stored = db.read(`admissionDecisions/${ROUND}__amara`);
    assert.deepEqual(Object.keys(stored.programmes), [TAIS], "only this programme's entry is taken out");
    assert.deepEqual([stored.roundId, stored.uid], [ROUND, "amara"]);
    assert.equal(JSON.stringify(db.read(`admissionApplications/${ROUND}__amara`)), application);

    const [row] = auditRows(db);
    assert.deepEqual(
      [row.kind, row.runId, row.roundId, row.programmeId, row.subjectUid, row.actorUid, row.reason],
      ["application-decision-revoked", "", ROUND, AGI, "amara", "zach", "She has taken a place elsewhere."],
    );
    assert.equal(row.detail, "Zach revoked Amara Okafor’s acceptance for AGI Strategy. Reason: She has taken a place elsewhere.");

    const seen = (await review(db, "claudia", "amara")).review;
    assert.deepEqual([seen.decision.standing, seen.decision.owesDecision], ["to-review", true]);
    assert.deepEqual(seen.decision.lastRevocation, {
      byName: "Zach",
      on: "Mon 19 Oct",
      reason: "She has taken a place elsewhere.",
    });
    // A reviewer cannot decide, and is not shown why an admin overruled the lead.
    assert.equal((await review(db, "lloyd", "amara")).review.decision.lastRevocation, null);
  });

  test("once the lead decides again the note has done its job", async () => {
    const db = makeDb(accepted());
    await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", { programmeId: AGI, reason: "A mistake." });
    await decideAs(db, "claudia", "amara", { programmeId: AGI, decision: "pool" });
    assert.equal((await review(db, "claudia", "amara")).review.decision.lastRevocation, null);
  });

  test("only an admin can, and only an acceptance can be revoked", async () => {
    const input = { programmeId: AGI, reason: "No." };
    for (const who of ["claudia", "lloyd", "tess", "yusuf", "amara"]) {
      const db = makeDb(accepted());
      const result = await decide.revokeAcceptance(db, CAST[who], ROUND, "amara", input);
      assert.deepEqual([who, result.ok, result.status], [who, false, 403]);
      assert.deepEqual(db.writes, []);
    }
    const db = makeDb(accepted());
    assert.equal((await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", { programmeId: TAIS, reason: "No." })).status, 409, "pooled, not accepted");
    assert.equal((await decide.revokeAcceptance(db, CAST.zach, ROUND, "dev", input)).status, 409, "nothing decided");
    assert.equal((await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", { programmeId: "constructor", reason: "No." })).status, 404);
    assert.equal((await decide.revokeAcceptance(db, CAST.zach, "no-such-round", "amara", input)).status, 404);
    assert.deepEqual(db.writes, []);
  });

  test("after decision day an acceptance stands", async () => {
    const docs = accepted();
    docs[`admissionRounds/${ROUND}`] = roundDoc({ decisionsSentAt: NOW });
    const db = makeDb(docs);
    const result = await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", { programmeId: AGI, reason: "Too late." });
    assert.deepEqual([result.ok, result.status], [false, 409]);
    assert.deepEqual(db.writes, []);
  });
});

// ---------------------------------------------------------------------------
// The admin's switch
// ---------------------------------------------------------------------------

describe("showing other reviewers' scores on a first review", () => {
  test("an admin switches it for the form, and nothing else on the form moves", async () => {
    const db = makeDb(seed());
    const before = db.read(`admissionRounds/${ROUND}`);
    const result = await decide.setRevealOtherReviews(db, CAST.zach, ROUND, true);
    assert.deepEqual(result, { ok: true, revealOtherReviews: true });
    const after = db.read(`admissionRounds/${ROUND}`);
    assert.equal(after.revealOtherReviews, true);
    assert.deepEqual({ ...after, revealOtherReviews: false, updatedAt: undefined }, { ...before, updatedAt: undefined });
    assert.deepEqual(db.writes.map((write) => write.path), [`admissionRounds/${ROUND}`]);
  });

  test("a lead cannot, a value that is not yes or no is refused, and a missing form is not found", async () => {
    const db = makeDb(seed());
    for (const who of ["claudia", "lloyd", "yusuf", "amara"]) {
      assert.equal((await decide.setRevealOtherReviews(db, CAST[who], ROUND, true)).status, 403);
    }
    assert.equal((await decide.setRevealOtherReviews(db, CAST.zach, ROUND, "yes")).status, 400);
    assert.equal((await decide.setRevealOtherReviews(db, CAST.zach, ROUND, undefined)).status, 400);
    assert.equal((await decide.setRevealOtherReviews(db, CAST.zach, "no-such-round", true)).status, 404);
    assert.equal((await decide.setRevealOtherReviews(db, CAST.zach, "older-round", true)).status, 404);
    assert.deepEqual(db.writes, []);
  });
});

// ---------------------------------------------------------------------------
// The routes themselves
// ---------------------------------------------------------------------------

describe("the route files", () => {
  const FORMS = join(REPO_ROOT, "src", "app", "api", "admissions", "forms");
  const REVIEW_ROUTES = [
    "[roundId]/programmes/[programmeId]/applications/route.ts",
    "[roundId]/applications/[uid]/route.ts",
    "[roundId]/applications/[uid]/review/route.ts",
    "[roundId]/applications/[uid]/decision/route.ts",
    "[roundId]/review-settings/route.ts",
  ];
  const sourceOf = (route) => readFileSync(join(FORMS, ...route.split("/")), "utf8");
  const codeOf = (route) => sourceOf(route).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

  test("every review route is where this file says it is", () => {
    for (const route of REVIEW_ROUTES) assert.ok(statSync(join(FORMS, ...route.split("/"))).isFile(), route);
  });

  test("no review route reaches the database itself: the loaders and writers are the only way in", () => {
    for (const route of REVIEW_ROUTES) {
      const code = codeOf(route);
      assert.doesNotMatch(code, /\.(collection|doc|runTransaction|batch|getAll)\(/, `${route} touches Firestore directly`);
      assert.match(code, /from "@\/lib\/applications\/review\//, `${route} does not go through the review library`);
    }
  });

  test("every handler asks who is calling before anything else, and a writer refuses a view-as session first", () => {
    for (const route of REVIEW_ROUTES) {
      const code = codeOf(route);
      const handlers = [...code.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)];
      assert.ok(handlers.length > 0, `${route} exports no handler`);
      handlers.forEach((match, at) => {
        const body = code.slice(match.index, handlers[at + 1]?.index ?? code.length);
        const session = body.indexOf("getCurrentUser()");
        assert.ok(session > -1, `${route} ${match[1]} never asks who is calling`);
        assert.match(body, /if \(!user\) return NextResponse\.json\(\{ error: "Not signed in" \}, \{ status: 401 \}\);/);
        if (match[1] !== "GET") {
          const guard = body.indexOf("assertNotImpersonating()");
          assert.ok(guard > -1 && guard < session, `${route} ${match[1]} must refuse a view-as session before anything else`);
        }
        for (const call of ["loadProgrammeBoard(", "loadReview(", "saveReview(", "decideApplication(", "decideMany(", "revokeAcceptance(", "setRevealOtherReviews("]) {
          const at = body.indexOf(call);
          if (at > -1) assert.ok(at > session, `${route} ${match[1]} calls ${call} before it knows who is calling`);
        }
      });
    }
  });

  test("nothing in the review library or its screens emails anybody or touches an applicant's own document", () => {
    const roots = [
      join(REPO_ROOT, "src", "lib", "applications", "review"),
      join(REPO_ROOT, "src", "features", "applications", "review"),
      FORMS,
    ];
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    roots.forEach(walk);
    assert.ok(files.length >= 15, `only ${files.length} files found: the walk has stopped seeing the lane`);
    for (const file of files) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
      assert.doesNotMatch(code, /sendEmail|@\/lib\/email\//, `${file} can send email`);
      assert.doesNotMatch(code, /applicationCounts/, `${file} moves a counter, which only a change of status may`);
      // The application is read (to know its ranking) and never written.
      assert.doesNotMatch(code, /appRef\.(set|update|delete|create)\(|tx\.(set|update|delete|create)\(\s*appRef/, `${file} writes an application`);
    }
  });
});
