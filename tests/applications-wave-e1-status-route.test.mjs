/**
 * Opening, closing, reopening and settling an application form: the status
 * route, executed against an in-memory Firestore as every kind of person who
 * might call it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * `POST /api/admissions/forms/[roundId]/status` is the one way a form's
 * status is written. A form that is open can be reached by real applicants,
 * and once one of them has sent an application its questions lock, so each
 * thing the route promises is asked of it here by calling it:
 *
 *  1. WHO MAY. An admin, and nobody else. A lead, a reviewer, an
 *     SU-recognised committee member named nowhere, a member and an account
 *     still waiting are all refused in the same words whether or not the form
 *     exists, before a single document is read.
 *  2. AN UNREADY FORM DOES NOT OPEN, AND WRITES NOTHING. Each line of the
 *     readiness list is taken away in turn and the route is asked to open.
 *  3. THE TABLE. Every move the round's own table does not have is refused
 *     and writes nothing.
 *  4. THE FOUR REFUSALS A ROUND HAS, a form keeps: being destroyed, reopening
 *     unconfirmed, opening unready, opening archived.
 *  5. SETTLING waits for decision day, walks the table to get there, and
 *     writes the member records through the sweep a round uses. A record that
 *     cannot be written is a warning on a settle that still landed.
 *  6. A MOVE WRITES `status` AND `updatedAt` AND NOTHING ELSE. The counts of
 *     applications do not move.
 *  7. A CHANGE THAT LANDS WHILE OPEN IS BEING PRESSED IS HONOURED: readiness
 *     is asked inside the transaction that writes.
 *
 * ## What is real and what is stubbed
 *
 * Real: the route handler and everything under `src/lib/applications`,
 * including `access.ts` and the readiness list. Stubbed: `server-only`,
 * `next/server`, the session, the view-as guard, the Admin SDK handle, the one
 * value `firebase-admin/firestore` supplies, and the member record sweep
 * (`writeRecordsForRound`), which has a suite of its own and is recorded here
 * rather than run.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.__lifecycle = { db: null, user: null, viewAs: false, records: null };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body, json: async () => body }; } };",
    ],
    [
      "firebase-admin/firestore",
      "export const FieldValue = { serverTimestamp: () => ({ __sentinel: 'now' }) }; export class Timestamp {}",
    ],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__lifecycle.db; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__lifecycle.user; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {" +
        " return globalThis.__lifecycle.viewAs ? { status: 403, body: { error: 'view-as' }, json: async () => ({ error: 'view-as' }) } : null; }",
    ],
    [
      "@/lib/admissions/memberRecordSync",
      "export async function writeRecordsForRound(db, round, writtenBy, actorUid) {" +
        " return globalThis.__lifecycle.records(db, round, writtenBy, actorUid); }",
    ],
  ]),
});

const route = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "status", "route.ts"));
const rounds = await loadTs(join("lib", "firestore", "admissionRounds.ts"));

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

/**
 * Documents by path, with the calls a move makes: a document, a
 * subcollection, a batch read, and a transaction that runs again when
 * something it read changed before it committed. That last property is what
 * "readiness is asked inside the transaction" depends on.
 */
function makeDb(seed) {
  const docs = new Map();
  const versions = new Map();
  const stats = { reads: 0, writes: [] };
  const put = (path, data) => {
    docs.set(path, data);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  for (const [path, data] of Object.entries(seed)) put(path, structuredClone(data));

  const last = (path) => path.split("/").pop();
  const snap = (path) => ({
    id: last(path),
    exists: docs.has(path),
    ref: docRef(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const read = (path) => {
    stats.reads += 1;
    return snap(path);
  };
  const childrenOf = (collectionPath) =>
    [...docs.keys()].filter(
      (path) => path.startsWith(`${collectionPath}/`) && !path.slice(collectionPath.length + 1).includes("/"),
    );
  function docRef(path) {
    return {
      id: last(path),
      path,
      get: async () => read(path),
      collection: (name) => collection(`${path}/${name}`),
    };
  }
  function collection(path) {
    return {
      path,
      isQuery: true,
      doc: (id) => docRef(`${path}/${id}`),
      get: async () => {
        stats.reads += 1;
        return { docs: childrenOf(path).map(snap) };
      },
    };
  }
  const resolve = (value) => (value && value.__sentinel === "now" ? new Date() : value);
  const applyUpdate = (path, patch) => {
    if (!docs.has(path)) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    const next = structuredClone(docs.get(path));
    for (const [field, value] of Object.entries(patch)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) node = node[part];
      node[parts[parts.length - 1]] = resolve(value);
    }
    put(path, next);
  };

  const db = {
    stats,
    /** Runs once, after a transaction's function returns and before it commits. */
    beforeCommit: null,
    collection,
    getAll: async (...refs) => refs.map((ref) => read(ref.path)),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const seen = new Map();
        const writes = [];
        const see = (path) => seen.set(path, versions.get(path) ?? 0);
        const tx = {
          get: async (target) => {
            const result = await target.get();
            if (target.isQuery) {
              seen.set(`list:${target.path}`, childrenOf(target.path).join("|"));
              for (const doc of result.docs) see(doc.ref.path);
            } else {
              see(target.path);
            }
            return result;
          },
          getAll: async (...refs) =>
            refs.map((ref) => {
              see(ref.path);
              return read(ref.path);
            }),
          update: (ref, data) => writes.push([ref.path, data]),
        };
        const result = await fn(tx);
        if (db.beforeCommit) {
          const hook = db.beforeCommit;
          db.beforeCommit = null;
          hook();
        }
        const moved = [...seen].some(([key, was]) =>
          key.startsWith("list:") ? childrenOf(key.slice(5)).join("|") !== was : (versions.get(key) ?? 0) !== was,
        );
        if (moved) continue;
        for (const [path, data] of writes) {
          stats.writes.push([path, Object.keys(data).sort()]);
          applyUpdate(path, data);
        }
        return result;
      }
      throw new Error("the transaction never settled");
    },
    read: (path) => docs.get(path),
    /** A change made by somebody else, outside the request under test. */
    poke: (path, patch) => applyUpdate(path, patch),
    remove: (path) => {
      docs.delete(path);
      versions.set(path, (versions.get(path) ?? 0) + 1);
    },
  };
  return db;
}

// ---------------------------------------------------------------------------
// The cast and the term
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND_PATH = `admissionRounds/${ROUND}`;
const setPath = (id) => `${ROUND_PATH}/questionSets/${id}`;

/**
 * The route reads the real clock, so the term is laid out around it: opening
 * tomorrow, closing in a fortnight, everybody hearing a few days after that.
 */
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.now();
const fromNow = (days) => new Date(T0 + days * DAY);
const londonDay = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
/** An open form, part way through its window. */
const MID_WINDOW = { status: "open", opensAt: fromNow(-3), closesAt: fromNow(10) };
/** The close has passed. */
const PAST_CLOSE = { opensAt: fromNow(-20), closesAt: fromNow(-6), decisionsByDate: londonDay(fromNow(-1)) };
const DECISIONS_SENT = { ...PAST_CLOSE, decisionsSentAt: fromNow(-1), decisionsSentByUid: "zach" };

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
  role,
  suRecognised,
  permissions: PERMISSIONS,
});
const CAST = {
  zach: session("zach", "admin"),
  /** Leads AGI Strategy. */
  claudia: session("claudia", "committee", true),
  /** Reviews AGI Strategy. */
  lloyd: session("lloyd", "committee", true),
  /** SU-recognised committee, named nowhere on the form. */
  yusuf: session("yusuf", "committee", true),
  priya: session("priya", "member"),
  /** An account still waiting to be approved. */
  jasmine: session("jasmine", "pending"),
};
const NOT_ADMINS = ["claudia", "lloyd", "yusuf", "priya", "jasmine"];

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 24,
  groupCount: 3,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});
const question = (id, over = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: 300,
  required: true,
  scored: false,
  ...over,
});
const COUNTS = {
  draft: 2,
  submitted: 9,
  accepted: 0,
  "fellowship-offered": 0,
  waitlisted: 0,
  rejected: 0,
  withdrawn: 1,
  appointed: 0,
  invited: 0,
  "no-offer": 0,
  declined: 0,
};

/** A form that is ready to open, unless `round` says otherwise. */
function seed({ round = {} } = {}) {
  const userDoc = (uid) => ({
    role: CAST[uid].role,
    suRecognised: CAST[uid].suRecognised,
    displayName: uid[0].toUpperCase() + uid.slice(1),
    email: `${uid}@example.com`,
    profile: { preferredName: uid[0].toUpperCase() + uid.slice(1), motivation: "" },
  });
  const set = (data) => ({ roundId: ROUND, intro: "", ...data });
  return {
    [ROUND_PATH]: {
      formVersion: 2,
      kind: "enrolment",
      label: "Autumn 2026",
      slug: "autumn-2026",
      status: "draft",
      opensAt: fromNow(1),
      closesAt: fromNow(14),
      decisionsByDate: londonDay(fromNow(19)),
      invitationReplyBy: londonDay(fromNow(21)),
      stageIds: [],
      reviewerUids: ["zach", "claudia", "lloyd"],
      finalDeciderUid: null,
      applicationCounts: { ...COUNTS },
      archived: false,
      authorUid: "zach",
      programmeIds: [TAIS, AGI, INC],
      programmes: {
        [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "zach" }),
        [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", leadUid: "claudia", reviewerUids: ["lloyd"] }),
        [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", leadUid: "zach" }),
      },
      questionSetIds: ["fellowships", AGI, "incubator", "facilitator"],
      asksFacilitating: true,
      decisionsSentAt: null,
      createdAt: fromNow(-5),
      updatedAt: fromNow(-5),
      ...round,
    },
    [setPath("fellowships")]: set({
      role: "general",
      scope: { type: "kind", kind: "fellowship" },
      label: "Fellowships",
      questions: [question("why")],
    }),
    [setPath(AGI)]: set({
      role: "stream",
      scope: { type: "programme", programmeId: AGI },
      label: "AGI Strategy",
      questions: [question("event", { scored: true })],
    }),
    [setPath("incubator")]: set({
      role: "general",
      scope: { type: "kind", kind: "incubator" },
      label: "Research incubator",
      questions: [question("idea")],
    }),
    [setPath("facilitator")]: set({
      role: "facilitator",
      scope: { type: "facilitating" },
      label: "Facilitator questions",
      questions: [question("led")],
    }),
    // An older round, which is not an application form.
    "admissionRounds/older-round": { kind: "enrolment", label: "Older", status: "draft", reviewerUids: [], finalDeciderUid: null },
    ...Object.fromEntries(Object.keys(CAST).map((uid) => [`users/${uid}`, userDoc(uid)])),
  };
}

let db;
let recorded;
function start(options) {
  db = makeDb(seed(options));
  recorded = [];
  globalThis.__lifecycle = {
    db,
    user: null,
    viewAs: false,
    records: async (handle, round, writtenBy, actorUid) => {
      recorded.push({ sameDb: handle === db, roundId: round.id, status: round.status, writtenBy, actorUid });
      return { written: 9, alreadyPresent: 0, failed: [] };
    },
  };
}
beforeEach(() => start());

const stored = () => db.read(ROUND_PATH);

/** Ask the route to move the form, as somebody. `undefined` sends no body at all. */
async function move(who, body, roundId = ROUND) {
  globalThis.__lifecycle.user = who === "nobody" ? null : CAST[who];
  const request = { json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body) };
  return route.POST(request, { params: Promise.resolve({ roundId }) });
}

/** The move was refused and nothing at all was written. */
function assertRefused(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  if (code) assert.equal(response.body.code, code, JSON.stringify(response.body));
  assert.equal(typeof response.body.error, "string");
  assert.ok(response.body.error.length > 10, "a refusal is a sentence");
  assert.deepEqual(db.stats.writes, [], "a refusal writes nothing");
}

// ---------------------------------------------------------------------------
// 1. Who may
// ---------------------------------------------------------------------------

describe("who may move a form", () => {
  test("an admin opens a form that is ready", async () => {
    const response = await move("zach", { status: "open" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, changed: true, status: "open" });
    assert.equal(stored().status, "open");
  });

  test("nobody else does: a lead, a reviewer, committee named nowhere, a member, a waiting account", async () => {
    for (const who of NOT_ADMINS) {
      for (const body of [{ status: "open" }, { status: "closed" }, { status: "settled" }, { status: "cancelled" }]) {
        const response = await move(who, body);
        assertRefused(response, 403);
        assert.equal(response.body.error, "Only an admin can open, close or settle an application form.", who);
      }
    }
    assert.equal(db.stats.reads, 0, "it is decided before anything is read");
    assert.equal(stored().status, "draft");
  });

  test("they are told the same thing about a form that does not exist, and about a body that makes no sense", async () => {
    for (const who of NOT_ADMINS) {
      const missing = await move(who, { status: "open" }, "no-such-form");
      const older = await move(who, { status: "open" }, "older-round");
      const nonsense = await move(who, { status: "published" });
      const empty = await move(who, undefined);
      for (const response of [missing, older, nonsense, empty]) {
        assert.deepEqual([response.status, response.body], [403, { error: "Only an admin can open, close or settle an application form." }], who);
      }
    }
    assert.equal(db.stats.reads, 0);
  });

  test("somebody signed out is asked to sign in, and reads nothing", async () => {
    const response = await move("nobody", { status: "open" });
    assert.deepEqual([response.status, response.body], [401, { error: "Not signed in" }]);
    assert.equal(db.stats.reads, 0);
    assert.equal(stored().status, "draft");
  });

  test("an admin viewing the site as a member is stopped first, whatever else is true", async () => {
    globalThis.__lifecycle.viewAs = true;
    for (const who of ["zach", "claudia", "nobody"]) {
      const response = await move(who, { status: "open" });
      assert.deepEqual([response.status, response.body.error], [403, "view-as"], who);
    }
    assert.equal(db.stats.reads, 0);
    assert.deepEqual(db.stats.writes, []);
  });

  test("the handler's first statement is the view-as guard, and the gate comes before the database", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src", "app", "api", "admissions", "forms", "[roundId]", "status", "route.ts"),
      "utf8",
    );
    const body = source.slice(source.indexOf("export async function POST("));
    const opened = body.indexOf("{\n", body.indexOf("{ params:") + 1);
    assert.match(body.slice(opened + 2).trimStart(), /^const blocked = await assertNotImpersonating\(\);\s+if \(blocked\) return blocked;/);
    const order = ["assertNotImpersonating(", "getCurrentUser(", "canRunTerm(", "getAdminDb(", "req.json(", "moveFormStatus("].map(
      (call) => body.indexOf(call),
    );
    assert.ok(order.every((at) => at > -1), "the handler has lost one of its steps");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "the steps are out of order");
    assert.doesNotMatch(source, /export const (GET|POST|PUT|PATCH|DELETE)\b/);
    assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)\b/, "the route only moves a form");
  });
});

// ---------------------------------------------------------------------------
// 2. The request
// ---------------------------------------------------------------------------

describe("what a move has to say", () => {
  test("a body that names no status, or one a form cannot be in, is refused before anything is read", async () => {
    const cases = [
      [undefined, "Say which status to move the form to."],
      [{}, "Say which status to move the form to."],
      [{ confirm: true }, "Say which status to move the form to."],
      [{ status: "published" }, "That is not a status an application form can be in."],
      [{ status: "constructor" }, "That is not a status an application form can be in."],
      [{ status: 2 }, "That is not a status an application form can be in."],
      [{ status: "open", confirm: "yes" }, "Whether the move was confirmed is either true or false."],
    ];
    for (const [body, error] of cases) {
      const response = await move("zach", body);
      assert.deepEqual([response.status, response.body], [400, { error }], JSON.stringify(body));
    }
    assert.equal(db.stats.reads, 0);
    assert.deepEqual(db.stats.writes, []);
  });

  test("a form that is not there, a round that is not a form, and an id that is no id", async () => {
    for (const roundId of ["no-such-form", "older-round", "constructor", "__proto__", "a.b", "a/b"]) {
      const response = await move("zach", { status: "open" }, roundId);
      assertRefused(response, 404, "no-form");
      assert.equal(response.body.error, "There is no application form here.", roundId);
    }
    assert.equal(db.read("admissionRounds/older-round").status, "draft", "an older round is never moved from here");
  });
});

// ---------------------------------------------------------------------------
// 3. Opening
// ---------------------------------------------------------------------------

describe("opening a form", () => {
  test("it writes the status and when, and nothing else", async () => {
    const before = structuredClone(stored());
    const response = await move("zach", { status: "open" });
    assert.equal(response.status, 200);
    assert.deepEqual(db.stats.writes, [[ROUND_PATH, ["status", "updatedAt"]]]);
    const after = stored();
    assert.equal(after.status, "open");
    assert.ok(after.updatedAt.getTime() >= T0);
    // Every other field is as it was, the counts of applications among them.
    assert.deepEqual({ ...after, status: null, updatedAt: null }, { ...before, status: null, updatedAt: null });
    assert.deepEqual(after.applicationCounts, COUNTS);
    assert.deepEqual(recorded, [], "opening keeps no records");
  });

  test("pressing it twice is not an error and does not write twice", async () => {
    await move("zach", { status: "open" });
    const again = await move("zach", { status: "open" });
    assert.deepEqual([again.status, again.body], [200, { ok: true, changed: false, status: "open" }]);
    assert.equal(db.stats.writes.length, 1);
  });

  /** Each line of the readiness list, taken away, and what the route says. */
  const UNREADY = [
    ["no opening time", (d) => d.poke(ROUND_PATH, { opensAt: null }), "window", /^Set when applications open\./],
    ["no close", (d) => d.poke(ROUND_PATH, { closesAt: null }), "window", /^Set when applications close\./],
    ["a close before the opening", (d) => d.poke(ROUND_PATH, { closesAt: fromNow(0.5) }), "window", /close after they open/],
    [
      "a close that has passed",
      (d) => d.poke(ROUND_PATH, { opensAt: fromNow(-9), closesAt: fromNow(-1) }),
      "window",
      /has already passed/,
    ],
    ["no day to hear", (d) => d.poke(ROUND_PATH, { decisionsByDate: null }), "decisions", /^Set the day everybody hears\./],
    [
      "hearing before the close",
      (d) => d.poke(ROUND_PATH, { decisionsByDate: londonDay(fromNow(3)) }),
      "decisions",
      /^Everyone hears after applications close\./,
    ],
    ["no programmes", (d) => d.poke(ROUND_PATH, { programmeIds: [], programmes: {} }), "programmes", /^Add a programme\./],
    [
      "every programme closed",
      (d) => {
        for (const id of [AGI, TAIS, INC]) d.poke(ROUND_PATH, { [`programmes.${id}.closed`]: true });
      },
      "programmes",
      /^Every programme on this form is closed\./,
    ],
    ["a programme with no lead", (d) => d.poke(ROUND_PATH, { [`programmes.${AGI}.leadUid`]: null }), "leads", /^Name a lead for AGI Strategy\./],
    [
      "a lead who is no longer SU-recognised",
      (d) => d.poke("users/claudia", { suRecognised: false }),
      "leads",
      /^The lead of AGI Strategy is no longer an admin or SU-recognised committee/,
    ],
    [
      "a lead who is now only a member",
      (d) => d.poke("users/claudia", { role: "member" }),
      "leads",
      /^The lead of AGI Strategy is no longer/,
    ],
    ["a lead whose account has gone", (d) => d.remove("users/claudia"), "leads", /^The lead of AGI Strategy is no longer/],
    [
      "an empty general set",
      (d) => d.poke(setPath("fellowships"), { questions: [] }),
      "general-fellowship",
      /^“Fellowships” has no questions yet\./,
    ],
    [
      "a general set deleted",
      (d) => d.remove(setPath("incubator")),
      "general-incubator",
      /^There is no question set for everybody who ticks the incubator\./,
    ],
    [
      "no facilitator questions",
      (d) => d.poke(setPath("facilitator"), { questions: [] }),
      "facilitator",
      /^“Facilitator questions” has no questions yet\./,
    ],
    [
      "a question with no text",
      (d) => d.poke(setPath(AGI), { questions: [question("event"), question("blank", { text: "" })] }),
      "questions",
      /^Question 2 in “AGI Strategy” has no text\./,
    ],
  ];

  for (const [name, spoil, id, hint] of UNREADY) {
    test(`a form with ${name} does not open, and nothing is written`, async () => {
      spoil(db);
      const response = await move("zach", { status: "open" });
      assertRefused(response, 409, "not-ready");
      assert.equal(stored().status, "draft");
      assert.deepEqual(Object.keys(response.body).sort(), ["code", "error", "unmet"]);
      assert.deepEqual(response.body.unmet.map((line) => line.id), [id]);
      const [line] = response.body.unmet;
      assert.deepEqual(Object.keys(line).sort(), ["hint", "id", "label"]);
      assert.match(line.hint, hint);
      assert.equal(response.body.error, `This form is not ready to open. ${line.hint}`);
    });
  }

  test("several things missing are all listed, in the list's own order", async () => {
    db.poke(ROUND_PATH, { decisionsByDate: null, [`programmes.${TAIS}.leadUid`]: null });
    db.poke(setPath("facilitator"), { questions: [] });
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "not-ready");
    assert.deepEqual(response.body.unmet.map((line) => line.id), ["decisions", "leads", "facilitator"]);
  });

  test("what does not apply does not hold it shut", async () => {
    // A closed programme with no lead, a form that does not ask about
    // facilitating and has no questions for it, a broken question in a closed
    // programme's stream.
    db.poke(ROUND_PATH, {
      [`programmes.${AGI}.closed`]: true,
      [`programmes.${AGI}.leadUid`]: null,
      asksFacilitating: false,
    });
    db.remove(setPath("facilitator"));
    db.poke(setPath(AGI), { questions: [question("blank", { text: "" })] });
    const response = await move("zach", { status: "open" });
    assert.deepEqual([response.status, response.body.status], [200, "open"]);
  });

  test("an archived form cannot be opened", async () => {
    db.poke(ROUND_PATH, { archived: true });
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "archived");
    assert.match(response.body.error, /^This form is archived\./);
  });

  test("a form that is being destroyed does not move at all", async () => {
    for (const round of [{}, MID_WINDOW, { ...MID_WINDOW, status: "closed" }]) {
      start({ round: { ...round, destroying: true } });
      for (const target of rounds.ADMISSION_ROUND_STATUSES) {
        const response = await move("zach", { status: target, confirm: true });
        assertRefused(response, 409, "destroying");
        assert.match(response.body.error, /^A destroy of this form has begun/);
      }
    }
  });

  test("a status this site does not know is not taken for a draft and opened", async () => {
    db.poke(ROUND_PATH, { status: "live" });
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "unknown-status");
    assert.equal(stored().status, "live");
  });
});

// ---------------------------------------------------------------------------
// 4. A change that lands while Open is being pressed
// ---------------------------------------------------------------------------

describe("readiness is asked inside the transaction that writes", () => {
  test("a question set emptied before the commit is seen, and the form stays a draft", async () => {
    db.beforeCommit = () => db.poke(setPath("fellowships"), { questions: [] });
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "not-ready");
    assert.deepEqual(response.body.unmet.map((line) => line.id), ["general-fellowship"]);
    assert.equal(stored().status, "draft");
  });

  test("a set deleted before the commit is seen", async () => {
    db.beforeCommit = () => db.remove(setPath("incubator"));
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "not-ready");
    assert.equal(stored().status, "draft");
  });

  test("a lead who loses their standing before the commit is seen", async () => {
    db.beforeCommit = () => db.poke("users/claudia", { suRecognised: false });
    const response = await move("zach", { status: "open" });
    assertRefused(response, 409, "not-ready");
    assert.deepEqual(response.body.unmet.map((line) => line.id), ["leads"]);
  });

  test("a form archived, or a destroy begun, before the commit is seen", async () => {
    db.beforeCommit = () => db.poke(ROUND_PATH, { archived: true });
    assertRefused(await move("zach", { status: "open" }), 409, "archived");
    start();
    db.beforeCommit = () => db.poke(ROUND_PATH, { destroying: true });
    assertRefused(await move("zach", { status: "open" }), 409, "destroying");
  });

  test("two admins pressing different buttons do not both win", async () => {
    start({ round: { ...MID_WINDOW, status: "closed" } });
    // While one admin is moving the form on to deciding, another reopens it.
    db.beforeCommit = () => db.poke(ROUND_PATH, { status: "open" });
    const response = await move("zach", { status: "deciding" });
    // The move is planned again from the form as it now is: open cannot go to deciding.
    assertRefused(response, 409, "illegal");
    assert.equal(stored().status, "open");
  });
});

// ---------------------------------------------------------------------------
// 5. Closing and reopening
// ---------------------------------------------------------------------------

describe("closing early and reopening", () => {
  test("an open form is closed with nothing to confirm", async () => {
    start({ round: MID_WINDOW });
    const response = await move("zach", { status: "closed" });
    assert.deepEqual([response.status, response.body], [200, { ok: true, changed: true, status: "closed" }]);
    assert.deepEqual(db.stats.writes, [[ROUND_PATH, ["status", "updatedAt"]]]);
    assert.deepEqual(stored().applicationCounts, COUNTS);
    assert.deepEqual(recorded, []);
  });

  test("reopening has to be confirmed", async () => {
    start({ round: { ...MID_WINDOW, status: "closed" } });
    for (const body of [{ status: "open" }, { status: "open", confirm: false }]) {
      const response = await move("zach", body);
      assertRefused(response, 409, "needs-confirmation");
      assert.equal(response.body.needsConfirmation, true);
      assert.match(response.body.error, /^Reopening tells everybody/);
      assert.deepEqual(Object.keys(response.body).sort(), ["code", "error", "needsConfirmation"]);
    }
    const confirmed = await move("zach", { status: "open", confirm: true });
    assert.deepEqual([confirmed.status, confirmed.body], [200, { ok: true, changed: true, status: "open" }]);
    assert.equal(stored().status, "open");
  });

  test("a confirmed reopening still needs the form to be ready, close included", async () => {
    start({ round: { ...PAST_CLOSE, status: "closed" } });
    const late = await move("zach", { status: "open", confirm: true });
    assertRefused(late, 409, "not-ready");
    assert.deepEqual(late.body.unmet.map((line) => line.id), ["window"]);

    start({ round: { ...MID_WINDOW, status: "closed" } });
    db.poke(ROUND_PATH, { [`programmes.${INC}.leadUid`]: null });
    assertRefused(await move("zach", { status: "open", confirm: true }), 409, "not-ready");
    assert.equal(stored().status, "closed");
  });

  test("a form whose decisions have been sent cannot take applications again", async () => {
    start({ round: { ...DECISIONS_SENT, closesAt: fromNow(5), status: "closed" } });
    const response = await move("zach", { status: "open", confirm: true });
    assertRefused(response, 409, "decisions-sent");
    assert.match(response.body.error, /so the form cannot take applications again\.$/);
  });

  test("an archived form cannot be reopened either", async () => {
    start({ round: { ...MID_WINDOW, status: "closed", archived: true } });
    assertRefused(await move("zach", { status: "open", confirm: true }), 409, "archived");
  });
});

// ---------------------------------------------------------------------------
// 6. The table
// ---------------------------------------------------------------------------

describe("the round's own table, through the route", () => {
  test("every move the table does not have is refused and writes nothing", async () => {
    const STATUSES = rounds.ADMISSION_ROUND_STATUSES;
    let refused = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to || to === "settled") continue;
        if (rounds.ADMISSION_ROUND_TRANSITIONS[from].includes(to)) continue;
        start({ round: { ...MID_WINDOW, status: from } });
        const response = await move("zach", { status: to, confirm: true });
        assertRefused(response, 409);
        assert.ok(["illegal", "terminal"].includes(response.body.code), `${from} to ${to}: ${response.body.code}`);
        assert.doesNotMatch(response.body.error, /\bround\b/i);
        assert.equal(stored().status, from);
        refused += 1;
      }
    }
    // 25 pairs that are not a move to settled or to where the form already is, less the table's 6 arrows.
    assert.equal(refused, 19, "the table has changed: read the new arrows against a form");
  });

  test("every single arrow the table has, that a form does not hold for another reason, moves it", async () => {
    const arrows = [
      ["draft", "cancelled", {}],
      ["open", "closed", MID_WINDOW],
      ["open", "cancelled", MID_WINDOW],
      ["closed", "deciding", PAST_CLOSE],
      ["deciding", "settled", DECISIONS_SENT],
    ];
    for (const [from, to, round] of arrows) {
      start({ round: { ...round, status: from } });
      const response = await move("zach", { status: to });
      assert.deepEqual([response.status, response.body.status, stored().status], [200, to, to], `${from} to ${to}`);
      assert.deepEqual(db.stats.writes, [[ROUND_PATH, ["status", "updatedAt"]]]);
      assert.deepEqual(stored().applicationCounts, COUNTS, "no count moves with the form");
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Settling
// ---------------------------------------------------------------------------

describe("settling the term", () => {
  test("it waits for decision day, wherever the form is", async () => {
    for (const from of ["open", "closed", "deciding"]) {
      start({ round: { ...PAST_CLOSE, status: from } });
      const response = await move("zach", { status: "settled" });
      assertRefused(response, 409, "decisions-not-sent");
      assert.equal(response.body.error, "Decision day has not been sent, so there is nothing to settle yet. Send every decision first.");
      assert.equal(stored().status, from);
      assert.deepEqual(recorded, [], "no record is kept for a term that was not settled");
    }
  });

  test("once decisions are sent it settles from open, closed or deciding in one press, and keeps the records", async () => {
    for (const from of ["open", "closed", "deciding"]) {
      start({ round: { ...DECISIONS_SENT, status: from } });
      const response = await move("zach", { status: "settled" });
      assert.deepEqual([response.status, response.body], [200, { ok: true, changed: true, status: "settled" }], from);
      assert.equal(stored().status, "settled");
      assert.deepEqual(db.stats.writes, [[ROUND_PATH, ["status", "updatedAt"]]], "one write, where the walk ends");
      assert.deepEqual(stored().applicationCounts, COUNTS);
      // The sweep a settled round uses, once, for this form, in the admin's name.
      assert.deepEqual(recorded, [{ sameDb: true, roundId: ROUND, status: "settled", writtenBy: "settle", actorUid: "zach" }]);
    }
  });

  test("a form that never opened is not settled", async () => {
    start({ round: { ...DECISIONS_SENT, status: "draft" } });
    assertRefused(await move("zach", { status: "settled" }), 409, "illegal");
    assert.deepEqual(recorded, []);
  });

  test("a form that is still taking applications is not settled", async () => {
    start({ round: { ...MID_WINDOW, decisionsSentAt: fromNow(-1) } });
    const response = await move("zach", { status: "settled" });
    assertRefused(response, 409, "still-open");
    assert.match(response.body.error, /^Applications are still open until /);
    assert.deepEqual(recorded, []);
  });

  test("settling twice writes once and sweeps once", async () => {
    start({ round: { ...DECISIONS_SENT, status: "deciding" } });
    await move("zach", { status: "settled" });
    const again = await move("zach", { status: "settled" });
    assert.deepEqual([again.status, again.body], [200, { ok: true, changed: false, status: "settled" }]);
    assert.equal(db.stats.writes.length, 1);
    assert.equal(recorded.length, 1);
  });

  test("a record that could not be written is a warning on a settle that still landed", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    start({ round: { ...DECISIONS_SENT, status: "deciding" } });
    globalThis.__lifecycle.records = async () => ({
      written: 7,
      alreadyPresent: 0,
      failed: [
        { uid: "amara", name: "Amara", message: "no" },
        { uid: "ben", name: "Ben", message: "no" },
      ],
    });
    const response = await move("zach", { status: "settled" });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ["changed", "ok", "recordWarning", "status"]);
    assert.match(response.body.recordWarning, /^The term is settled, but the member record could not be written for 2 applicants\. Nothing is lost yet/);
    assert.doesNotMatch(response.body.recordWarning, /Amara|Ben|amara|ben/, "the warning names nobody");
    assert.equal(stored().status, "settled");
    // The server's own line says which accounts, by id, and never by name.
    assert.equal(logged.mock.calls.length, 1);
    const line = JSON.stringify(logged.mock.calls[0].arguments);
    assert.match(line, /"amara","ben"/);
    assert.doesNotMatch(line, /Amara|Ben|"message"/);

    start({ round: { ...DECISIONS_SENT, status: "deciding" } });
    globalThis.__lifecycle.records = async () => ({ written: 8, alreadyPresent: 0, failed: [{ uid: "amara", name: "Amara", message: "no" }] });
    assert.match((await move("zach", { status: "settled" })).body.recordWarning, /for 1 applicant\./);
  });

  test("a sweep that throws is a warning too, and the term stays settled", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    start({ round: { ...DECISIONS_SENT, status: "closed" } });
    globalThis.__lifecycle.records = async () => {
      throw new Error("the database went away");
    };
    const response = await move("zach", { status: "settled" });
    assert.equal(response.status, 200);
    assert.match(response.body.recordWarning, /^The term is settled, but the member records could not be written\./);
    assert.doesNotMatch(response.body.recordWarning, /database went away/, "the warning is ours, not the error's");
    assert.equal(stored().status, "settled");
    assert.equal(logged.mock.calls.length, 1, "the failure is in the server's log");
  });

  test("no other move sweeps", async () => {
    const others = [
      [{}, { status: "open" }],
      [{}, { status: "cancelled" }],
      [MID_WINDOW, { status: "closed" }],
      [{ ...MID_WINDOW, status: "closed" }, { status: "open", confirm: true }],
      [{ ...PAST_CLOSE, status: "closed" }, { status: "deciding" }],
    ];
    for (const [round, body] of others) {
      start({ round });
      assert.equal((await move("zach", body)).status, 200, JSON.stringify(body));
      assert.deepEqual(recorded, [], JSON.stringify(body));
    }
  });
});

// ---------------------------------------------------------------------------
// 8. One writer
// ---------------------------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}
const code = (file) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

describe("a form's status has one writer", () => {
  const MOVE = "src/lib/applications/lifecycle/move.ts";
  const ROUTE = "src/app/api/admissions/forms/[roundId]/status/route.ts";

  test("only the status route reaches the module that writes it", () => {
    const importers = [];
    let files = 0;
    for (const file of walk(join(REPO_ROOT, "src"))) {
      files += 1;
      const path = rel(file);
      if (path === MOVE) continue;
      const source = code(file);
      if (/from\s+["'](@\/lib\/applications\/lifecycle\/move|\.\/move|\.\.\/lifecycle\/move)["']/.test(source)) {
        // `./move` only counts from inside the lifecycle folder itself.
        if (/["']\.\/move["']/.test(source) && !path.startsWith("src/lib/applications/lifecycle/")) continue;
        importers.push(path);
      }
    }
    assert.ok(files > 500, `only ${files} files were read: the tree has moved`);
    assert.deepEqual(importers, [ROUTE]);
  });

  test("nothing else in the application system stores a form status", () => {
    // A round status VALUE written against a `status` key, anywhere under the
    // form's routes or its library. The draft a new form starts as is the one
    // other status ever stored, and it is not a move.
    const moving = rounds.ADMISSION_ROUND_STATUSES.filter((value) => value !== "draft");
    const storing = [];
    let files = 0;
    for (const tree of ["src/app/api/admissions/forms", "src/lib/applications"]) {
      for (const file of walk(join(REPO_ROOT, tree))) {
        files += 1;
        const source = code(file);
        const values = [...source.matchAll(/\bstatus:\s*"([a-z-]+)"/g)].map((match) => match[1]);
        if (values.some((value) => moving.includes(value)) || /\bstatus:\s*plan\.to\b/.test(source)) {
          storing.push(rel(file));
        }
      }
    }
    assert.ok(files >= 40, `only ${files} files were read: the trees have moved`);
    assert.deepEqual(storing, [MOVE]);
  });

  test("the writer queues its one write after its last refusal", () => {
    const source = code(join(REPO_ROOT, ...MOVE.split("/")));
    const writes = [...source.matchAll(/tx\.(update|set|create|delete)\(/g)];
    assert.equal(writes.length, 1, "a move is one write");
    const transaction = source.slice(source.indexOf("db.runTransaction("), source.indexOf("if (!moved.ok)"));
    const afterWrite = transaction.slice(transaction.indexOf("tx.update("));
    assert.doesNotMatch(afterWrite, /refusal|NO_FORM|ok: false/, "something can still refuse after the write is queued");
    assert.match(source, /tx\.update\(ref, \{ status: plan\.to, updatedAt: FieldValue\.serverTimestamp\(\) \}\)/);
    assert.doesNotMatch(source, /applicationCounts|FieldValue\.increment/, "a move does not touch the counts");
  });
});
