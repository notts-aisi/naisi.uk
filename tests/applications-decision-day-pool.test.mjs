/**
 * Pooled applicants: the page's data, the one writer of a pooled outcome, and
 * the route in front of both, EXECUTED against an in-memory Firestore.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * Before decision day an admin picks what each pooled applicant will hear: an
 * invitation to a programme with a free place, or no offer this time. That
 * pick must tell nobody anything, so what matters is what is written where,
 * and only running the writer shows it:
 *
 *  1. THE PICK LANDS ON THE DECISION DOCUMENT AND NOWHERE ELSE. The
 *     applicant's own document is byte for byte what it was, and the decision
 *     document still says whose it is (`roundId`, `uid`).
 *  2. AN INVITATION NEEDS A FREE PLACE, counting the invitations already
 *     picked, and is never to a programme the person ranked.
 *  3. NOBODY ALREADY TOLD IS CHANGED, and nothing changes once the term is sent.
 *  4. EVERY CHANGE IS LOGGED, by uid and not by name.
 *  5. ONLY AN ADMIN, decided before anything is read: a lead, a reviewer, a
 *     member and a signed-out caller are refused with the store untouched and
 *     unread.
 *  6. WHAT THE PAGE IS SENT HOLDS NO EMAIL ADDRESS.
 *
 * Real: the writer, the board builder, the route, the pure modules beneath
 * them, the staff and applicant repositories, and the access predicates with
 * the real eligibility bar. Faked: `server-only`, `next/server`, the
 * `firebase-admin/firestore` sentinels (which this store interprets), the
 * Admin SDK handle, the session and the view-as guard. Nothing here can reach
 * a Firestore project.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const NOW = new Date("2026-10-21T15:00:00Z");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
    ],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  increment: (by) => ({ __op: 'increment', by }),\n" +
        "};",
    ],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__ddDb; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__ddUser; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() { return globalThis.__ddBlocked ?? null; }",
    ],
  ]),
});

const pool = await loadTs(join("lib", "applications", "decisionDay", "pool.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));
const route = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "pool", "route.ts"));

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const counters = { reads: 0, writes: 0 };
  let autoId = 0;

  const resolveValue = (current, value) => {
    if (value && typeof value === "object" && value.__op === "serverTimestamp") return new Date(NOW);
    if (value && typeof value === "object" && value.__op === "increment") return (current ?? 0) + value.by;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolveValue(undefined, inner)]));
    }
    return value;
  };
  const snap = (path) => {
    counters.reads += 1;
    return {
      exists: docs.has(path),
      id: path.split("/").pop(),
      data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    };
  };
  const apply = (op) => {
    counters.writes += 1;
    if (op.kind === "create") {
      if (docs.has(op.path)) throw new Error(`ALREADY_EXISTS: ${op.path}`);
      docs.set(op.path, resolveValue(undefined, op.data));
      return;
    }
    if (op.kind === "update") {
      if (!docs.has(op.path)) throw new Error(`NOT_FOUND: ${op.path}`);
      const next = structuredClone(docs.get(op.path));
      for (const [field, value] of Object.entries(op.data)) {
        const parts = field.split(".");
        let node = next;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        const last = parts[parts.length - 1];
        node[last] = resolveValue(node[last], value);
      }
      docs.set(op.path, next);
      return;
    }
    // set: whole document, or only the fields the write names.
    const next = op.options?.mergeFields ? structuredClone(docs.get(op.path) ?? {}) : {};
    const fields = op.options?.mergeFields ?? Object.keys(op.data);
    for (const field of fields) next[field] = resolveValue(undefined, op.data[field]);
    docs.set(op.path, next);
  };
  const ref = (path) => ({ id: path.split("/").pop(), path, get: async () => snap(path) });

  return {
    counters,
    collection(name) {
      return {
        doc: (id) => ref(`${name}/${id ?? `auto-${(autoId += 1)}`}`),
        where: (field, _op, value) => ({
          get: async () => ({
            docs: [...docs.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
              .map(([path]) => snap(path)),
          }),
        }),
      };
    },
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    async runTransaction(fn) {
      const ops = [];
      const result = await fn({
        get: async (r) => snap(r.path),
        getAll: async (...refs) => refs.map((r) => snap(r.path)),
        update: (r, data) => ops.push({ kind: "update", path: r.path, data }),
        set: (r, data, options) => ops.push({ kind: "set", path: r.path, data, options }),
        create: (r, data) => ops.push({ kind: "create", path: r.path, data }),
      });
      // Nothing is stored until the function has returned, as in a real transaction.
      ops.forEach(apply);
      return result;
    },
    read: (path) => docs.get(path),
    paths: (prefix) => [...docs.keys()].filter((path) => path.startsWith(prefix)),
    dump: () => structuredClone(Object.fromEntries(docs)),
  };
}

// ---------------------------------------------------------------------------
// A small term
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const DECIDED = new Date("2026-10-19T09:00:00Z");

const programme = (name, shortName, places, leadUid, over = {}) => ({
  kind: "fellowship",
  name,
  shortName,
  pitch: "",
  facts: "",
  starts: "w/c 26 Oct",
  places,
  groupCount: null,
  groupSize: "",
  leadUid,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});

function roundDoc(over = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    academicYear: "2026/27",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    reviewerUids: ["zach", "claudia", "lloyd"],
    finalDeciderUid: null,
    applicationCounts: { submitted: 8 },
    archived: false,
    programmeIds: [AGI, TAIS, INC],
    programmes: {
      [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", 2, "claudia", { reviewerUids: ["lloyd"] }),
      // Three places: two acceptances and Oliver's invitation fill it.
      [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", 3, "zach"),
      // One place, nobody accepted: one invitation fills it.
      [INC]: programme("Research Incubator", "Research incubator", 1, "zach", { kind: "incubator" }),
    },
    questionSetIds: [],
    asksFacilitating: true,
    invitationReplyBy: "2026-10-25",
    revealOtherReviews: false,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    ...over,
  };
}

function applicationDoc(uid, name, ranked, subject, over = {}) {
  const content = {
    aboutYou: {
      preferredName: name.split(" ")[0],
      universityEmail: "someone@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject,
      expectedGraduation: "2027-07",
      motivation: "",
      interests: "",
    },
    rankedProgrammeIds: ranked,
    wantsToFacilitate: false,
    answers: {},
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: content,
    sent: content,
    status: "submitted",
    submittedAt: DECIDED,
    sentAt: DECIDED,
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    ...over,
  };
}

const verdict = (decision, by, over = {}) => ({
  decision,
  poolReason: decision === "pool" ? "capacity" : null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: DECIDED,
  ...over,
});

function decisionDoc(uid, programmes, pooledOutcome = null) {
  return {
    roundId: ROUND,
    uid,
    programmes,
    pooledOutcome: pooledOutcome ? { ...pooledOutcome, setByUid: "zach", setAt: DECIDED } : null,
    exception: null,
    updatedAt: DECIDED,
  };
}

const review = (applicantUid, reviewerUid, notes, updatedAt = DECIDED) => ({
  roundId: ROUND,
  applicantUid,
  reviewerUid,
  scores: {},
  comments: [],
  notes,
  createdAt: updatedAt,
  updatedAt,
});

const userDoc = (name, role, suRecognised = false) => ({
  displayName: name,
  email: "",
  role,
  suRecognised,
  profile: { preferredName: name.split(" ")[0], motivation: "" },
});

function seed(over = {}) {
  const A = (uid, ...rest) => [`admissionApplications/${ROUND}__${uid}`, applicationDoc(uid, ...rest)];
  const D = (uid, ...rest) => [`admissionDecisions/${ROUND}__${uid}`, decisionDoc(uid, ...rest)];
  return {
    [`admissionRounds/${ROUND}`]: roundDoc(),
    ...Object.fromEntries([
      A("amara", "Amara Okafor", [AGI, TAIS], "BA Philosophy"),
      A("sam", "Sam Whitfield", [TAIS], "BSc Mathematics"),
      A("wen", "Wen Zhao", [TAIS, AGI], "MSc Computer Science"),
      A("oliver", "Oliver Grant", [INC], "MEng Electrical Engineering"),
      A("rosa", "Rosa García", [INC, AGI], "BSc Physics"),
      A("nina", "Nina Petrova", [AGI], "BA Modern Languages"),
      A("ben", "Ben Hartley", [AGI], "BSc Economics"),
      A("zara", "Zara Ahmed", [AGI], "BSc Politics"),
      D("amara", { [AGI]: verdict("accept", "claudia") }),
      D("sam", { [TAIS]: verdict("accept", "zach") }),
      D("wen", { [TAIS]: verdict("accept", "zach") }),
      D(
        "oliver",
        { [INC]: verdict("pool", "zach", { poolReason: "better-fit", couldSuitProgrammeId: TAIS }) },
        { kind: "invite", programmeId: TAIS },
      ),
      D("rosa", {
        [INC]: verdict("pool", "zach", { poolReason: "better-fit", couldSuitProgrammeId: TAIS }),
        [AGI]: verdict("pool", "claudia"),
      }),
      D("nina", { [AGI]: verdict("pool", "claudia") }, { kind: "no-offer" }),
      D("ben", { [AGI]: verdict("pool", "claudia") }),
      D("zara", { [AGI]: verdict("decline", "claudia") }),
    ]),
    [`admissionReviews/${ROUND}__nina__claudia`]: review("nina", "claudia", "Only free on Monday evenings."),
    [`admissionReviews/${ROUND}__oliver__zach`]: review(
      "oliver",
      "zach",
      "Strong on the technical questions. A fellowship first would suit him.",
    ),
    // A newer comment on the same person, from a second reviewer.
    [`admissionReviews/${ROUND}__oliver__lloyd`]: review(
      "oliver",
      "lloyd",
      "Agreed.",
      new Date("2026-10-20T09:00:00Z"),
    ),
    // No overall comment: nothing to show.
    [`admissionReviews/${ROUND}__rosa__lloyd`]: review("rosa", "lloyd", "  "),
    // A comment on somebody who is not pooled is not this page's business.
    [`admissionReviews/${ROUND}__amara__claudia`]: review("amara", "claudia", "A clear yes."),
    "users/zach": userDoc("Zach Levin", "admin"),
    "users/claudia": userDoc("Claudia Reyes", "committee", true),
    "users/lloyd": userDoc("Lloyd Brandon", "committee", true),
    ...over,
  };
}

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
const session = (uid, role, suRecognised = false, displayName = uid) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  displayName,
  suRecognised,
  permissions: PERMISSIONS,
});
const ZACH = session("zach", "admin", false, "Zach Levin");
const ACTOR = { uid: "zach", displayName: "Zach Levin" };

const board = async (db) => pool.buildPoolBoard(db, await repo.loadForm(db, ROUND), NOW);
const row = (view, uid) => view.rows.find((r) => r.uid === uid);
const decisionOf = (db, uid) => db.read(`admissionDecisions/${ROUND}__${uid}`);
const applicationOf = (db, uid) => db.read(`admissionApplications/${ROUND}__${uid}`);
const auditRows = (db) => db.paths("courseAudit/").map((path) => db.read(path));

// ---------------------------------------------------------------------------
// 1. The page
// ---------------------------------------------------------------------------

describe("the pooled applicants page", () => {
  test("lists exactly the people no programme they ranked took, by name", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(
      view.rows.map((r) => r.name),
      ["Ben Hartley", "Nina Petrova", "Oliver Grant", "Rosa García"],
    );
    assert.deepEqual(view.counts, { pooled: 4, invitations: 1, noOffer: 1, needsOutcome: 2 });
    assert.deepEqual([view.termLabel, view.today, view.hearOn, view.sentOn], ["Autumn 2026", "Wed 21 Oct", "Fri 23 Oct", null]);
  });

  test("each row says what they ranked, why they were pooled and what could suit them", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(
      { ...row(view, "rosa"), comments: undefined, inviteOptions: undefined },
      {
        uid: "rosa",
        name: "Rosa García",
        degree: "BSc Physics",
        detail: "Graduating July 2027",
        ranked: [
          { rank: 1, programmeId: INC, shortName: "Research incubator" },
          { rank: 2, programmeId: AGI, shortName: "AGI Strategy" },
        ],
        // Each reason once, in the order she ranked the programmes.
        reasons: ["Better fit", "Capacity"],
        couldSuit: ["Technical AI Safety"],
        comments: undefined,
        outcome: null,
        inviteOptions: undefined,
        told: false,
      },
    );
    assert.deepEqual(row(view, "nina").couldSuit, [], "nobody named a programme, so the page says next term");
    assert.deepEqual(row(view, "oliver").outcome, { kind: "invite", programmeId: TAIS });
    assert.deepEqual(row(view, "nina").outcome, { kind: "no-offer" });
  });

  test("the reviewers' overall comments are shown newest first, with who wrote each", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(row(view, "oliver").comments, [
      { text: "Agreed.", by: "Lloyd" },
      { text: "Strong on the technical questions. A fellowship first would suit him.", by: "Zach" },
    ]);
    assert.deepEqual(row(view, "nina").comments, [{ text: "Only free on Monday evenings.", by: "Claudia" }]);
    assert.deepEqual(row(view, "rosa").comments, [], "a blank overall comment is not a comment");
  });

  test("the free places count acceptances and invitations", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(view.programmes, [
      { id: AGI, shortName: "AGI Strategy", places: 2, placed: 1, invited: 0, open: 1, left: 1, firstChoice: 2 },
      { id: TAIS, shortName: "Technical AI Safety", places: 3, placed: 2, invited: 1, open: 1, left: 0, firstChoice: 0 },
      { id: INC, shortName: "Research incubator", places: 1, placed: 0, invited: 0, open: 1, left: 1, firstChoice: 2 },
    ]);
  });

  test("somebody is offered only the programmes they could be invited to right now", async () => {
    const view = await board(makeDb(seed()));
    const options = (uid) => row(view, uid).inviteOptions.map((option) => option.shortName);
    assert.deepEqual(options("ben"), ["Research incubator"], "AGI Strategy is his own choice, Technical AI Safety is full");
    assert.deepEqual(options("nina"), ["Research incubator"]);
    assert.deepEqual(options("rosa"), [], "she ranked both programmes that have a place");
    assert.deepEqual(options("oliver"), ["AGI Strategy", "Technical AI Safety"], "his own invitation's place is still his");
  });

  test("what the page is sent holds no email address", async () => {
    const sent = JSON.stringify(await board(makeDb(seed())));
    assert.ok(!sent.includes("@"), "an address reached the pooled applicants page");
  });

  test("a read writes nothing", async () => {
    const db = makeDb(seed());
    await board(db);
    assert.equal(db.counters.writes, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. The writer
// ---------------------------------------------------------------------------

describe("picking a pooled applicant's outcome", () => {
  test("an invitation is written to the decision document, with who picked it and when", async () => {
    const db = makeDb(seed());
    const before = applicationOf(db, "ben");
    const result = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      uid: "ben",
      choice: { kind: "invite", programmeId: INC },
    });
    assert.deepEqual(result, { ok: true, changed: 1 });
    const stored = decisionOf(db, "ben");
    assert.deepEqual(stored.pooledOutcome, { kind: "invite", programmeId: INC, setByUid: "zach", setAt: NOW });
    assert.deepEqual([stored.roundId, stored.uid], [ROUND, "ben"], "the decision document still says whose it is");
    assert.equal(stored.programmes[AGI].decision, "pool", "the lead's own decision is untouched");
    assert.deepEqual(applicationOf(db, "ben"), before, "nothing on the applicant's own document changed");
  });

  test("changing an invitation to no offer leaves no programme behind in it", async () => {
    const db = makeDb(seed());
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "oliver", choice: { kind: "no-offer" } });
    assert.deepEqual(decisionOf(db, "oliver").pooledOutcome, { kind: "no-offer", setByUid: "zach", setAt: NOW });
  });

  test("it tells nobody anything: no application document is written at all", async () => {
    const db = makeDb(seed());
    const before = db.dump();
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "ben", choice: { kind: "no-offer" } });
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "nina", choice: { kind: "invite", programmeId: INC } });
    const after = db.dump();
    for (const path of Object.keys(before)) {
      if (path.startsWith("admissionApplications/") || path.startsWith("admissionRounds/")) {
        assert.deepEqual(after[path], before[path], `${path} changed`);
      }
    }
  });

  test("a programme's last place goes to one person, and the next is refused", async () => {
    const db = makeDb(seed());
    const first = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      uid: "nina",
      choice: { kind: "invite", programmeId: INC },
    });
    assert.equal(first.ok, true);
    const second = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      uid: "ben",
      choice: { kind: "invite", programmeId: INC },
    });
    assert.deepEqual(second, { ok: false, status: 409, error: "Research incubator has no free places left." });
    assert.equal(decisionOf(db, "ben").pooledOutcome, null, "a refused pick writes nothing");
  });

  test("a full programme, a programme they ranked, and one that is not on the form are all refused", async () => {
    const db = makeDb(seed());
    const invite = (uid, programmeId) =>
      pool.setPooledOutcome(db, ACTOR, ROUND, { uid, choice: { kind: "invite", programmeId } });
    assert.deepEqual(await invite("ben", TAIS), {
      ok: false,
      status: 409,
      error: "Technical AI Safety has no free places left.",
    });
    const ranked = await invite("rosa", AGI);
    assert.equal(ranked.status, 409);
    assert.match(ranked.error, /Rosa García ranked AGI Strategy/);
    for (const id of ["not-on-the-form", "constructor", "__proto__"]) {
      assert.deepEqual(await invite("ben", id), {
        ok: false,
        status: 400,
        error: "That programme is not on this form.",
      });
    }
    assert.equal(db.counters.writes, 0);
  });

  test("only somebody pooled gets an outcome", async () => {
    const db = makeDb(seed());
    const noOffer = (uid) => pool.setPooledOutcome(db, ACTOR, ROUND, { uid, choice: { kind: "no-offer" } });
    assert.match((await noOffer("amara")).error, /has a place on AGI Strategy, so they are not pooled/);
    assert.match((await noOffer("zara")).error, /declined them, so they are not pooled/);
    assert.deepEqual(await noOffer("nobody"), {
      ok: false,
      status: 404,
      error: "Nobody by that id has an application on this form.",
    });
    assert.equal(db.counters.writes, 0);
  });

  test("picking what is already picked changes nothing and keeps who picked it first", async () => {
    const db = makeDb(seed());
    const result = await pool.setPooledOutcome(db, { uid: "claudia" }, ROUND, {
      uid: "oliver",
      choice: { kind: "invite", programmeId: TAIS },
    });
    assert.deepEqual(result, { ok: true, changed: 0 });
    assert.deepEqual(decisionOf(db, "oliver").pooledOutcome, {
      kind: "invite",
      programmeId: TAIS,
      setByUid: "zach",
      setAt: DECIDED,
    });
    assert.equal(db.counters.writes, 0);
  });

  test("everybody with nothing picked can be given no offer at once, and nobody else is touched", async () => {
    const db = makeDb(seed());
    const result = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      everyoneWithoutOne: true,
      choice: { kind: "no-offer" },
    });
    assert.deepEqual(result, { ok: true, changed: 2 });
    assert.equal(decisionOf(db, "ben").pooledOutcome.kind, "no-offer");
    assert.equal(decisionOf(db, "rosa").pooledOutcome.kind, "no-offer");
    assert.deepEqual(decisionOf(db, "oliver").pooledOutcome.programmeId, TAIS, "an invitation already picked stays");
    assert.deepEqual(decisionOf(db, "nina").pooledOutcome.setAt, DECIDED, "an outcome already picked is not rewritten");
    assert.equal(decisionOf(db, "amara").pooledOutcome, null, "somebody with a place is not pooled");
    assert.equal(decisionOf(db, "zara").pooledOutcome, null, "nor is somebody declined");
    // A second press finds nobody left.
    assert.deepEqual(
      await pool.setPooledOutcome(db, ACTOR, ROUND, { everyoneWithoutOne: true, choice: { kind: "no-offer" } }),
      { ok: true, changed: 0 },
    );
  });

  test("nobody who has already been told is changed", async () => {
    const told = applicationDoc("nina", "Nina Petrova", [AGI], "BA Modern Languages", {
      status: "no-offer",
      result: { kind: "no-offer", programmeId: null, publishedAt: NOW },
    });
    const db = makeDb(seed({ [`admissionApplications/${ROUND}__nina`]: told }));
    const result = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      uid: "nina",
      choice: { kind: "invite", programmeId: INC },
    });
    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error: "Nina Petrova has already been told their outcome.",
    });
    assert.equal(decisionOf(db, "nina").pooledOutcome.kind, "no-offer");
  });

  test("nothing changes once the term has been sent", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }) }));
    for (const request of [
      { uid: "ben", choice: { kind: "no-offer" } },
      { everyoneWithoutOne: true, choice: { kind: "no-offer" } },
    ]) {
      assert.deepEqual(await pool.setPooledOutcome(db, ACTOR, ROUND, request), {
        ok: false,
        status: 409,
        error: "Decisions for Autumn 2026 have gone out, so an outcome can no longer change.",
      });
    }
    assert.equal(db.counters.writes, 0);
  });

  test("a form that is not there, or a round that is not an application form, is not found", async () => {
    const db = makeDb(seed({ "admissionRounds/older-round": { kind: "enrolment", label: "Older" } }));
    for (const roundId of ["no-such-form", "older-round"]) {
      const result = await pool.setPooledOutcome(db, ACTOR, roundId, { uid: "ben", choice: { kind: "no-offer" } });
      assert.deepEqual([result.ok, result.status], [false, 404]);
    }
  });
});

describe("every pick is logged", () => {
  test("one row for one person's outcome, naming them by uid and not by name", async () => {
    const db = makeDb(seed());
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "ben", choice: { kind: "invite", programmeId: INC } });
    assert.deepEqual(auditRows(db), [
      {
        kind: "application-pooled-outcome",
        runId: "",
        roundId: ROUND,
        groupId: null,
        subjectUid: "ben",
        actorUid: "zach",
        actorName: "Zach Levin",
        targetLabel: "Autumn 2026",
        detail: "Picked an invitation to Research incubator for a pooled applicant.",
        at: NOW,
      },
    ]);
    assert.ok(!JSON.stringify(auditRows(db)).includes("Hartley"), "the log holds no applicant's name");
  });

  test("one row for giving everybody left no offer, and none when nothing changed", async () => {
    const db = makeDb(seed());
    await pool.setPooledOutcome(db, ACTOR, ROUND, { everyoneWithoutOne: true, choice: { kind: "no-offer" } });
    await pool.setPooledOutcome(db, ACTOR, ROUND, { everyoneWithoutOne: true, choice: { kind: "no-offer" } });
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "nina", choice: { kind: "no-offer" } });
    const rows = auditRows(db);
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].subjectUid, rows[0].detail],
      [null, "Picked no offer this time for the 2 pooled applicants who had nothing picked."],
    );
  });

  test("a refused pick is not logged", async () => {
    const db = makeDb(seed());
    await pool.setPooledOutcome(db, ACTOR, ROUND, { uid: "ben", choice: { kind: "invite", programmeId: TAIS } });
    assert.deepEqual(auditRows(db), []);
  });
});

// ---------------------------------------------------------------------------
// 3. The route
// ---------------------------------------------------------------------------

const ctx = (roundId = ROUND) => ({ params: Promise.resolve({ roundId }) });
const put = (body) => ({ json: async () => body });
const badJson = { json: async () => { throw new SyntaxError("bad json"); } };

describe("the route is an admin's, decided before anything is read", () => {
  let db;
  beforeEach(() => {
    db = makeDb(seed());
    globalThis.__ddDb = db;
    globalThis.__ddUser = ZACH;
    globalThis.__ddBlocked = null;
  });

  const CALLERS = [
    ["signed out", null, 401],
    ["the lead of a programme on this form", session("claudia", "committee", true), 403],
    ["a reviewer on this form", session("lloyd", "committee", true), 403],
    ["a member", session("amara", "member"), 403],
    ["an account still waiting", session("jasmine", "pending"), 403],
  ];

  for (const [who, user, status] of CALLERS) {
    test(`${who}: refused on both methods, with the store unread`, async () => {
      globalThis.__ddUser = user;
      const read = await route.GET({}, ctx());
      const written = await route.PUT(put({ uid: "ben", outcome: { kind: "no-offer" } }), ctx());
      assert.deepEqual([read.status, written.status], [status, status]);
      // The same answer for a form that does not exist: nothing is learned.
      assert.equal((await route.GET({}, ctx("no-such-form"))).status, status);
      assert.deepEqual(db.counters, { reads: 0, writes: 0 });
      assert.equal(decisionOf(db, "ben").pooledOutcome, null);
    });
  }

  test("a view-as session is turned away before anything else", async () => {
    globalThis.__ddBlocked = { status: 403, body: { error: "viewing as" } };
    const response = await route.PUT(put({ uid: "ben", outcome: { kind: "no-offer" } }), ctx());
    assert.equal(response.status, 403);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("an admin reads the board", async () => {
    const response = await route.GET({}, ctx());
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ["board"]);
    assert.equal(response.body.board.counts.pooled, 4);
    assert.equal(db.counters.writes, 0, "a GET writes nothing");
  });

  test("an admin is told a form is missing", async () => {
    assert.equal((await route.GET({}, ctx("no-such-form"))).status, 404);
  });

  test("a body that does not say who or what is refused before anything is read", async () => {
    const BAD = [
      [{}, "Say who this outcome is for."],
      [{ uid: "", outcome: { kind: "no-offer" } }, "Say who this outcome is for."],
      [{ uid: "a/b", outcome: { kind: "no-offer" } }, "Say who this outcome is for."],
      [{ uid: "ben" }, "An outcome is an invitation to a programme, or no offer this time."],
      [{ uid: "ben", outcome: { kind: "accept" } }, "An outcome is an invitation to a programme, or no offer this time."],
      [{ uid: "ben", outcome: { kind: "invite" } }, "Say which programme the invitation is to."],
      [{ uid: "ben", outcome: { kind: "invite", programmeId: "a.b" } }, "Say which programme the invitation is to."],
      [
        { everyoneWithoutOne: true, outcome: { kind: "invite", programmeId: INC } },
        "Only “No offer this time” can be given to everybody at once.",
      ],
    ];
    for (const [body, error] of BAD) {
      const response = await route.PUT(put(body), ctx());
      assert.deepEqual([response.status, response.body.error], [400, error], JSON.stringify(body));
    }
    assert.equal((await route.PUT(badJson, ctx())).status, 400);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("an admin's pick is saved under their own name and the page is redrawn from the store", async () => {
    const response = await route.PUT(put({ uid: "ben", outcome: { kind: "invite", programmeId: INC } }), ctx());
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ["ok", "changed", "board"]);
    assert.equal(response.body.changed, 1);
    assert.equal(decisionOf(db, "ben").pooledOutcome.setByUid, "zach");
    const after = response.body.board;
    assert.deepEqual(after.counts, { pooled: 4, invitations: 2, noOffer: 1, needsOutcome: 1 });
    // The incubator's one place is now picked, so nobody else is offered it.
    assert.deepEqual(row(after, "nina").inviteOptions, []);
  });

  test("the writer's refusals come back with their own status and sentence", async () => {
    const full = await route.PUT(put({ uid: "ben", outcome: { kind: "invite", programmeId: TAIS } }), ctx());
    assert.deepEqual([full.status, full.body.error], [409, "Technical AI Safety has no free places left."]);
    // A well-formed id the form does not carry is the writer's to refuse.
    const unknown = await route.PUT(put({ uid: "ben", outcome: { kind: "invite", programmeId: "not-on-the-form" } }), ctx());
    assert.deepEqual([unknown.status, unknown.body.error], [400, "That programme is not on this form."]);
    const missing = await route.PUT(put({ uid: "ben", outcome: { kind: "no-offer" } }), ctx("no-such-form"));
    assert.equal(missing.status, 404);
    assert.equal(decisionOf(db, "ben").pooledOutcome, null, "no refusal wrote anything");
  });

  // A name every object carries is not an id (`isId`, the contract), so it
  // cannot be the programme an invitation is to. The route says so while it
  // is still reading the body, which is earlier than the writer would have
  // and costs no read: the request never reaches the store. The writer's own
  // refusal of the same names stands behind it and is executed above.
  test("a name every object carries is not a programme id: refused with the body, before anything is read", async () => {
    for (const programmeId of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const response = await route.PUT(put({ uid: "ben", outcome: { kind: "invite", programmeId } }), ctx());
      assert.deepEqual(
        [response.status, response.body.error],
        [400, "Say which programme the invitation is to."],
        programmeId,
      );
    }
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
    assert.equal(decisionOf(db, "ben").pooledOutcome, null);
  });

  test("everybody left can be given no offer through the route", async () => {
    const response = await route.PUT(put({ everyoneWithoutOne: true, outcome: { kind: "no-offer" } }), ctx());
    assert.deepEqual([response.status, response.body.changed], [200, 2]);
    assert.equal(response.body.board.counts.needsOutcome, 0);
  });
});
