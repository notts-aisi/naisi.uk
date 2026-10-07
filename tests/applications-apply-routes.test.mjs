/**
 * The applicant's three handlers, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 *   GET  /api/admissions/forms/[roundId]/application       what an applicant may know
 *   PUT  /api/admissions/forms/[roundId]/application       save the draft
 *   POST /api/admissions/forms/[roundId]/application/send  send it
 *
 * ## The rules this guards
 *
 *  - WHO. The applicant's gate: no session is a 401, a refused account is a
 *    403, and an account still waiting to be approved is admitted, because
 *    "make an account, then apply" is the journey. Nothing is written during
 *    a view-as session.
 *  - WHICH FORM. A form that is still a draft, or archived, or not an
 *    application form at all answers exactly like one that does not exist.
 *  - WHEN. Nothing is saved or sent outside the form's window.
 *  - WHOSE. The document is the session's own, addressed by its uid, with the
 *    session's own email and name on it whatever the request says.
 *  - TWO COPIES. A save writes the draft and nothing else. A send takes no
 *    content from the request: it holds the STORED draft to the form and,
 *    when nothing is wrong, makes it the application of record. After a send,
 *    a save changes the draft and leaves the sent copy alone.
 *  - COUNTERS MOVE WITH THE STATUS, in the same transaction, and only when
 *    the status moves.
 *  - A SEND WAITS. An account with no join request cannot send, and an
 *    account still waiting to be approved cannot send until its university
 *    address has been checked. Both are read off the account, and neither
 *    stops a save.
 *
 * ## What is real and what is faked
 *
 * Real: both route files, the applicant's gate (`applicantSession.ts`), the
 * rate limiter, the site notice, and everything under
 * `src/lib/applications/`. Faked: `next/server`, the two sentinels
 * `firebase-admin/firestore` supplies, the view-as guard, the session, and
 * the Admin SDK handle, which is an in-memory store small enough to read
 * (addressed documents, one subcollection read, and transactions that commit
 * whole or not at all).
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "    this.headers = (init && init.headers) || {};\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  [
    "firebase-admin/firestore",
    "export const FieldValue = {\n" +
      "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
      "  increment: (by) => ({ __op: 'increment', by }),\n" +
      "};",
  ],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__applyDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__applyUser ?? null;\n}"],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__applyBlocked ?? null;\n}",
  ],
]);

const { loadTs } = createLoader({ stubs: STUBS });

const route = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "application", "route.ts"));
const sendRoute = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "application", "send", "route.ts"));
const store = await loadTs(join("lib", "applications", "applicant", "store.ts"));
const joinRules = await loadTs(join("lib", "applications", "applicant", "join.ts"));
const requests = await loadTs(join("lib", "applications", "applicant", "requests.ts"));
const siteNotice = await loadTs(join("lib", "siteNotice.ts"));
const validate = await loadTs(join("lib", "applications", "validate.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

/** Every `serverTimestamp()` in one commit resolves to the same instant, and each commit is a second later. */
let clock = new Date("2026-10-07T12:00:00Z").getTime();

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, each] of Object.entries(value)) out[key] = clone(each);
    return out;
  }
  return value;
}

function resolve(value, existing, stamp) {
  if (value && typeof value === "object" && value.__op === "serverTimestamp") return stamp;
  if (value && typeof value === "object" && value.__op === "increment") {
    return (typeof existing === "number" ? existing : 0) + value.by;
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((each) => resolve(each, undefined, stamp));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, each] of Object.entries(value)) out[key] = resolve(each, undefined, stamp);
    return out;
  }
  return value;
}

class FakeDb {
  constructor() {
    this.docs = new Map();
    /** Every committed write, so a test can say "nothing was written". */
    this.writes = [];
    this.reads = [];
  }

  seed(path, data) {
    this.docs.set(path, clone(data));
  }

  data(path) {
    return this.docs.has(path) ? clone(this.docs.get(path)) : null;
  }

  ref(path) {
    return {
      path,
      id: path.split("/").pop(),
      get: async () => {
        this.reads.push(path);
        const stored = this.docs.get(path);
        return { id: path.split("/").pop(), exists: stored !== undefined, data: () => (stored ? clone(stored) : undefined) };
      },
      collection: (name) => this.collection(`${path}/${name}`),
    };
  }

  collection(path) {
    return {
      doc: (id) => this.ref(`${path}/${id}`),
      get: async () => {
        this.reads.push(`${path}/*`);
        const docs = [];
        for (const [key, stored] of this.docs) {
          if (!key.startsWith(`${path}/`) || key.slice(path.length + 1).includes("/")) continue;
          docs.push({ id: key.split("/").pop(), exists: true, data: () => clone(stored) });
        }
        return { docs };
      },
    };
  }

  async runTransaction(fn) {
    const ops = [];
    const tx = {
      get: (ref) => ref.get(),
      create: (ref, data) => void ops.push({ kind: "create", path: ref.path, data }),
      update: (ref, data) => void ops.push({ kind: "update", path: ref.path, data }),
    };
    const result = await fn(tx);
    // All or nothing: check every write can land before any of them does.
    for (const op of ops) {
      if (op.kind === "create" && this.docs.has(op.path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      if (op.kind === "update" && !this.docs.has(op.path)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    }
    clock += 1000;
    const stamp = new Date(clock);
    for (const op of ops) {
      if (op.kind === "create") {
        this.docs.set(op.path, resolve(op.data, undefined, stamp));
      } else {
        const target = this.docs.get(op.path);
        for (const [field, value] of Object.entries(op.data)) {
          const parts = field.split(".");
          let at = target;
          for (const part of parts.slice(0, -1)) {
            if (!at[part] || typeof at[part] !== "object") at[part] = {};
            at = at[part];
          }
          const last = parts[parts.length - 1];
          at[last] = resolve(value, at[last], stamp);
        }
      }
      this.writes.push({ kind: op.kind, path: op.path, fields: Object.keys(op.data).sort() });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// A small term
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const CLOSED = "governance";
const ROUND_PATH = `admissionRounds/${ROUND}`;
const appPath = (uid) => `admissionApplications/${ROUND}__${uid}`;
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const NOTICE_PATH = `${siteNotice.SITE_NOTICE_PATH.collection}/${siteNotice.SITE_NOTICE_PATH.doc}`;

function programme(overrides = {}) {
  return {
    kind: "fellowship",
    name: "A fellowship",
    shortName: "A fellowship",
    pitch: "",
    facts: "6 WEEKS",
    starts: "w/c 26 Oct",
    places: 24,
    groupCount: 3,
    groupSize: "Up to 8",
    leadUid: "claudia",
    reviewerUids: ["lloyd"],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: {},
    ...overrides,
  };
}

function round(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    academicYear: "2026/27",
    status: "open",
    archived: false,
    // Far either side of the real clock, so "open" does not depend on the day this runs.
    opensAt: new Date("2020-01-01T00:00:00Z"),
    closesAt: new Date("2099-01-01T00:00:00Z"),
    decisionsByDate: "2026-10-23",
    availabilityGrid: GRID,
    reviewerUids: ["claudia", "lloyd"],
    applicationCounts: { draft: 0, submitted: 0 },
    programmeIds: [TAIS, AGI, CLOSED],
    programmes: {
      [TAIS]: programme({ shortName: "Technical AI Safety" }),
      [AGI]: programme({ shortName: "AGI Strategy" }),
      [CLOSED]: programme({ shortName: "AI Governance", closed: true }),
    },
    questionSetIds: ["fellowships", AGI],
    asksFacilitating: true,
    ...overrides,
  };
}

const question = (id, more = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: 300,
  required: true,
  scored: false,
  ...more,
});

const SET_DOCS = {
  fellowships: {
    roundId: ROUND,
    role: "general",
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    intro: "Asked once, to anyone who ticks a fellowship.",
    questions: [question("why"), question("read", { required: false })],
  },
  [AGI]: {
    roundId: ROUND,
    role: "stream",
    scope: { type: "programme", programmeId: AGI },
    label: "AGI Strategy",
    intro: "",
    questions: [question("event", { scored: true })],
  },
};

function userDoc(uid, overrides = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: `${uid[0].toUpperCase()}${uid.slice(1)} Example`,
    role: "member",
    profile: {
      preferredName: "Amara",
      universityEmail: "ada@nottingham.ac.uk",
      uniEmailVerifiedAt: new Date("2026-09-25T08:00:00Z"),
      status: "undergraduate",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know whether this is a real problem.",
      interests: "",
    },
    ...overrides,
  };
}

/** A draft with nothing wrong with it for somebody who ticked AGI Strategy and said no to facilitating. */
function fullDraft(overrides = {}) {
  return {
    aboutYou: {
      preferredName: "Amara",
      universityEmail: "someone@nottingham.ac.uk",
      universityEmailVerified: false,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "Philosophy got me into it.",
      interests: "",
    },
    rankedProgrammeIds: [AGI],
    wantsToFacilitate: false,
    answers: { fellowships: { why: "To understand the strategic picture." }, [AGI]: { event: "Open weights." } },
    availability: { days: ["000000000000", "000000000fff"] },
    suMembership: "not-yet",
    ...overrides,
  };
}

let db;
/** The uid the current test is signed in as. */
let me = "amara";
let people = 0;
/**
 * A new person for every test. The rate limiter is the real one and counts
 * per account for as long as this file runs, so a shared uid would have one
 * test spending another's allowance.
 */
function freshUid() {
  people += 1;
  return `amara${people}`;
}
const nameOf = (uid) => `${uid[0].toUpperCase()}${uid.slice(1)}`;

function world({ uid = freshUid(), role = "member", roundOverrides = {}, user = {} } = {}) {
  me = uid;
  db = new FakeDb();
  db.seed(ROUND_PATH, round(roundOverrides));
  for (const [id, set] of Object.entries(SET_DOCS)) db.seed(`${ROUND_PATH}/questionSets/${id}`, set);
  db.seed(`users/${uid}`, userDoc(uid, user));
  globalThis.__applyDb = db;
  globalThis.__applyBlocked = null;
  signIn(uid, role);
  return db;
}

function signIn(uid, role = "member") {
  globalThis.__applyUser = uid
    ? { uid, email: `${uid}@example.com`, role, displayName: `${uid[0].toUpperCase()}${uid.slice(1)} Example` }
    : null;
}

const ctx = (roundId = ROUND) => ({ params: Promise.resolve({ roundId }) });
let requestNumber = 0;
/** Each request comes from its own address, so one test cannot use up another's allowance. */
function request(method, body, { ip } = {}) {
  requestNumber += 1;
  return new Request("http://naisi.invalid/api", {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `10.0.${requestNumber >> 8}.${requestNumber & 255}` },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const GET = (roundId) => route.GET(request("GET"), ctx(roundId));
const PUT = (body, roundId, options) => route.PUT(request("PUT", body, options), ctx(roundId));
const SEND = (body = {}, roundId, options) => sendRoute.POST(request("POST", body, options), ctx(roundId));
const counts = () => db.data(ROUND_PATH).applicationCounts;

beforeEach(() => {
  world();
});

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

describe("the applicant's gate", () => {
  test("no session is a 401 on all three, and nothing is read", async () => {
    signIn(null);
    for (const call of [GET, () => PUT({ draft: fullDraft() }), SEND]) {
      const response = await call();
      assert.equal(response.status, 401);
    }
    assert.deepEqual(db.reads, [], "a caller with no session learned nothing about any document");
    assert.deepEqual(db.writes, []);
  });

  test("a refused account is a 403 on all three", async () => {
    signIn(me, "rejected");
    for (const call of [GET, () => PUT({ draft: fullDraft() }), SEND]) {
      const response = await call();
      assert.equal(response.status, 403);
      assert.equal(response.body.error, "This account cannot apply.");
    }
    assert.deepEqual(db.writes, []);
  });

  test("an account still waiting to be approved can read the form, save and send", async () => {
    // Her university address is checked (`userDoc` stamps it). What a waiting
    // account with an unchecked address can and cannot do is the next section.
    world({ uid: "jasmine", role: "pending" });
    assert.ok(db.data("users/jasmine").profile.uniEmailVerifiedAt, "the fixture's address is no longer a checked one");
    assert.equal((await GET()).status, 200);
    assert.equal((await PUT({ draft: fullDraft() })).status, 200);
    const sent = await SEND();
    assert.equal(sent.status, 200);
    assert.equal(db.data(appPath("jasmine")).status, "submitted");
  });

  test("during a view-as session the save and the send refuse before anything else", async () => {
    globalThis.__applyBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    assert.equal((await PUT({ draft: fullDraft() })).body.error, "view-as");
    assert.equal((await SEND()).body.error, "view-as");
    assert.deepEqual(db.reads, []);
    assert.deepEqual(db.writes, []);
    // Reading what the member sees is what view-as is for.
    assert.equal((await GET()).status, 200);
  });
});

// ---------------------------------------------------------------------------
// A send waits for a join request, and for the university address
// ---------------------------------------------------------------------------

/** An account whose university address is on its profile and has not been checked. */
function unchecked(uid) {
  const { uniEmailVerifiedAt: _stamp, ...profile } = userDoc(uid).profile;
  return { profile };
}

describe("a send waits for the university address", () => {
  const HELD = { step: "check", questionId: null, message: joinRules.VERIFY_FIRST };

  test("a waiting account whose address is not checked can read and save, and cannot send", async () => {
    const uid = freshUid();
    world({ uid, role: "pending", user: unchecked(uid) });

    const read = await GET();
    assert.equal(read.status, 200);
    assert.equal(read.body.joined, true);
    assert.equal(read.body.account.universityEmail, "ada@nottingham.ac.uk");
    assert.equal(read.body.account.universityEmailVerified, false);

    const saved = await PUT({ draft: fullDraft() });
    assert.equal(saved.status, 200, "an application cannot be saved before the address is checked");
    assert.equal(saved.body.created, true);
    assert.equal(counts().draft, 1);
    const afterSave = db.writes.length;

    const refused = await SEND();
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, joinRules.VERIFY_FIRST);
    assert.deepEqual(refused.body.issues, [HELD]);
    assert.equal(db.writes.length, afterSave, "a held send wrote something");
    const stored = db.data(appPath(uid));
    assert.equal(stored.status, "draft");
    assert.equal(stored.sent, null);
    assert.equal(stored.sentAt, null);
    assert.deepEqual([counts().draft, counts().submitted], [1, 0], "a held send moved a counter");
  });

  test("the moment the address is checked, the same application sends", async () => {
    const uid = freshUid();
    world({ uid, role: "pending", user: unchecked(uid) });
    await PUT({ draft: fullDraft() });
    assert.equal((await SEND()).status, 400);

    // What following the emailed link does: the server stamps the profile.
    db.seed(`users/${uid}`, userDoc(uid));
    const sent = await SEND();
    assert.equal(sent.status, 200);
    assert.equal(sent.body.first, true);
    const stored = db.data(appPath(uid));
    assert.equal(stored.status, "submitted");
    assert.equal(stored.sent.aboutYou.universityEmailVerified, true, "the application of record does not say the address was checked");
    assert.deepEqual([counts().draft, counts().submitted], [0, 1]);
  });

  test("it is read off the account: a draft or a request that says the address is checked changes nothing", async () => {
    const uid = freshUid();
    world({ uid, role: "pending", user: unchecked(uid) });
    const claimed = fullDraft();
    claimed.aboutYou.universityEmailVerified = true;
    await PUT({ draft: claimed });
    assert.equal(db.data(appPath(uid)).draft.aboutYou.universityEmailVerified, false, "a save stored a typed verified flag");
    for (const body of [{ verified: true }, { universityEmailVerified: true, account: { universityEmailVerified: true } }]) {
      const refused = await SEND(body);
      assert.equal(refused.status, 400);
      assert.deepEqual(refused.body.issues, [HELD]);
    }
    assert.equal(db.data(appPath(uid)).status, "draft");
  });

  test("an approved account is not held, whether or not its address was ever checked", async () => {
    for (const role of ["member", "committee", "admin"]) {
      const uid = freshUid();
      world({ uid, role, user: unchecked(uid) });
      await PUT({ draft: fullDraft() });
      const sent = await SEND();
      assert.equal(sent.status, 200, `${role} was held`);
      assert.equal(db.data(appPath(uid)).status, "submitted");
      // And nothing claims the address was checked when it was not.
      assert.equal(db.data(appPath(uid)).sent.aboutYou.universityEmailVerified, false);
    }
  });

  test("a waiting account with no address is told to add one, which is the About you rule and not this one", async () => {
    const uid = freshUid();
    const { universityEmail: _address, ...profile } = unchecked(uid).profile;
    world({ uid, role: "pending", user: { profile } });
    await PUT({ draft: fullDraft() });
    const refused = await SEND();
    assert.equal(refused.status, 400);
    assert.deepEqual(
      refused.body.issues.map((issue) => [issue.step, issue.message]),
      [["about", "Add your university email."]],
    );
  });

  test("the hold answers after the form and its window, so it says nothing about a form nobody may see", async () => {
    const uid = freshUid();
    world({ uid, role: "pending", user: unchecked(uid), roundOverrides: { status: "draft" } });
    assert.equal((await SEND()).status, 404);
    world({ uid: freshUid(), role: "pending", user: unchecked(uid), roundOverrides: { closesAt: new Date("2026-10-01T00:00:00Z") } });
    assert.equal((await SEND()).status, 403);
  });
});

describe("an account with no join request", () => {
  /** Signed in, and no `users` document: the session reads that as an account that is waiting. */
  function halfMade() {
    const uid = freshUid();
    world({ uid, role: "pending" });
    db.docs.delete(`users/${uid}`);
    return uid;
  }

  test("the read says so, and hands back a blank About you", async () => {
    const uid = halfMade();
    const read = await GET();
    assert.equal(read.status, 200);
    assert.equal(read.body.joined, false);
    assert.deepEqual(read.body.account, joinRules.emptyJoinAnswers());
    assert.equal(db.data(`users/${uid}`), null, "reading the form made a join request");
    assert.deepEqual(db.writes, []);
  });

  test("it cannot send, is told which step to go to, and nothing is written", async () => {
    const uid = halfMade();
    await PUT({ draft: fullDraft() });
    const before = db.writes.length;
    const refused = await SEND();
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, joinRules.JOIN_FIRST);
    assert.deepEqual(refused.body.issues, [{ step: "about", questionId: null, message: joinRules.JOIN_FIRST }]);
    assert.equal(db.writes.length, before);
    assert.equal(db.data(appPath(uid)).status, "draft");
    assert.equal(db.data(`users/${uid}`), null, "the send route made a join request");
  });

  test("every other account the suite uses has one", async () => {
    assert.equal((await GET()).body.joined, true);
  });
});

// ---------------------------------------------------------------------------
// Which form
// ---------------------------------------------------------------------------

describe("a form an applicant must not learn exists", () => {
  const cases = [
    ["a draft form", { roundOverrides: { status: "draft" } }],
    ["an archived form", { roundOverrides: { archived: true } }],
    ["a round of the older kind", { roundOverrides: { formVersion: undefined } }],
  ];

  for (const [name, options] of cases) {
    test(`${name} answers like a form that is not there`, async () => {
      world(options);
      const missing = [await GET("no-such-round"), await PUT({ draft: fullDraft() }, "no-such-round"), await SEND({}, "no-such-round")];
      const hidden = [await GET(), await PUT({ draft: fullDraft() }), await SEND()];
      for (let i = 0; i < 3; i += 1) {
        assert.equal(hidden[i].status, 404);
        assert.deepEqual(hidden[i].body, missing[i].body, "the body must not say which of the two it is");
        assert.deepEqual(hidden[i].body, { error: "Form not found." });
      }
      assert.deepEqual(db.writes, []);
    });
  }

  test("an id that could not name one document is a 404 before any read of it", async () => {
    for (const bad of ["a/b", "a.b", "", "x".repeat(81)]) {
      db.reads.length = 0;
      assert.equal((await GET(bad)).status, 404);
      assert.equal((await PUT({ draft: fullDraft() }, bad)).status, 404);
      assert.equal((await SEND({}, bad)).status, 404);
      assert.equal(db.reads.some((path) => path.startsWith("admissionRounds/")), false, `"${bad}" reached a round read`);
    }
  });

  test("the page's title is the form's own, and a form nobody may see yet has none", async () => {
    const now = new Date();
    world();
    assert.deepEqual(await store.loadFormTitle(db, ROUND, now), { label: "Autumn 2026", windowState: "open" });
    // A form that has not opened, and one that has closed, are there to be
    // seen, so each has a title that says which.
    world({ roundOverrides: { opensAt: new Date("2098-01-01T00:00:00Z") } });
    assert.deepEqual(await store.loadFormTitle(db, ROUND, now), { label: "Autumn 2026", windowState: "not-yet" });
    world({ roundOverrides: { status: "closed" } });
    assert.deepEqual(await store.loadFormTitle(db, ROUND, now), { label: "Autumn 2026", windowState: "closed" });
    // A draft form, an archived form and a round of the older kind answer as a
    // round that is not there does: a title would say the form exists.
    for (const overrides of [{ status: "draft" }, { archived: true }, { formVersion: 1 }, { formVersion: undefined }]) {
      world({ roundOverrides: overrides });
      assert.equal(await store.loadFormTitle(db, ROUND, now), null, JSON.stringify(overrides));
    }
    assert.equal(await store.loadFormTitle(db, "no-such-round", now), null);
    assert.equal(await store.loadFormTitle(db, "a/b", now), null);
  });

  test("the loader agrees: nothing comes back for any of them", async () => {
    const now = new Date();
    assert.ok(await store.loadVisibleForm(db, ROUND, now));
    for (const overrides of [{ status: "draft" }, { archived: true }, { formVersion: 1 }]) {
      world({ roundOverrides: overrides });
      assert.equal(await store.loadVisibleForm(db, ROUND, now), null);
      assert.equal(await store.loadApplicantView(db, ROUND, me, now), null);
    }
  });
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

describe("nothing is saved or sent outside the window", () => {
  test("before it opens", async () => {
    world({ roundOverrides: { opensAt: new Date("2098-01-01T00:00:00Z") } });
    const get = await GET();
    assert.equal(get.status, 200);
    assert.equal(get.body.form.windowState, "not-yet");
    for (const response of [await PUT({ draft: fullDraft() }), await SEND()]) {
      assert.equal(response.status, 403);
      assert.equal(response.body.error, "Applications have not opened yet.");
    }
    assert.deepEqual(db.writes, []);
  });

  test("after it closes, by the clock or by an admin moving the round on", async () => {
    for (const overrides of [{ closesAt: new Date("2021-01-01T00:00:00Z") }, { status: "deciding" }, { status: "settled" }]) {
      world({ roundOverrides: overrides });
      db.seed(appPath(me), {
        formVersion: 2,
        roundId: ROUND,
        uid: me,
        draft: normalise.normaliseContent(fullDraft(), GRID),
        sent: null,
        status: "draft",
      });
      const get = await GET();
      assert.equal(get.body.form.windowState, "closed");
      assert.ok(get.body.application, "somebody can still read their own application after the close");
      for (const response of [await PUT({ draft: fullDraft() }), await SEND()]) {
        assert.equal(response.status, 403);
        assert.equal(response.body.error, "Applications have closed, so this application can no longer be changed.");
      }
      assert.deepEqual(db.writes, []);
    }
  });
});

// ---------------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------------

describe("GET", () => {
  test("answers with the form, its sets, the caller's application and their account, and writes nothing", async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ["account", "application", "form", "joined", "sets"]);
    assert.equal(response.body.joined, true);
    assert.equal(response.body.application, null);
    assert.deepEqual(response.body.sets.map((set) => set.id), ["fellowships", AGI]);
    assert.equal(response.body.account.preferredName, "Amara");
    assert.equal(response.body.account.universityEmail, "ada@nottingham.ac.uk");
    assert.deepEqual(db.writes, [], "a read never writes, and opening the form does not start an application");
    assert.equal(db.data(appPath(me)), null);
  });

  test("carries nothing about who leads, reviews or scores", async () => {
    const text = JSON.stringify((await GET()).body);
    for (const word of ["leadUid", "reviewerUids", "claudia", "lloyd", "places", "groupSize", "useScores", "scored", "applicationCounts", "intro"]) {
      assert.equal(text.includes(word), false, `the GET mentions ${word}`);
    }
  });

  test("is the caller's own application and nobody else's", async () => {
    await PUT({ draft: fullDraft() });
    db.seed("users/ben", userDoc("ben"));
    signIn("ben");
    assert.equal((await GET()).body.application, null);
    signIn(me);
    assert.equal((await GET()).body.application.id, `${ROUND}__${me}`);
  });
});

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

describe("PUT, the draft save", () => {
  test("a body with no draft in it is a 400 before any document is read", async () => {
    for (const body of [{}, { draft: null }, { draft: [] }, { draft: "x" }, "not json", "[]"]) {
      db.reads.length = 0;
      const response = await PUT(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.error, "There was nothing to save. Reload the page and try again.");
      assert.equal(db.reads.some((path) => path.startsWith("admissionRounds/")), false);
    }
    assert.deepEqual(db.writes, []);
  });

  test("a body too big to be a form is refused", async () => {
    const response = await PUT(JSON.stringify({ draft: { aboutYou: { motivation: "x".repeat(requests.MAX_DRAFT_BODY_CHARS) } } }));
    assert.equal(response.status, 400);
    assert.deepEqual(db.writes, []);
  });

  test("the first save creates the application, as a draft, and counts it", async () => {
    const response = await PUT({ draft: fullDraft() });
    assert.equal(response.status, 200);
    assert.equal(response.body.created, true);
    const stored = db.data(appPath(me));
    assert.deepEqual(Object.keys(stored).sort(), [
      "attendance",
      "createdAt",
      "displayName",
      "draft",
      "email",
      "formVersion",
      "invitation",
      "result",
      "roundId",
      "sent",
      "sentAt",
      "status",
      "submittedAt",
      "uid",
      "updatedAt",
      "withdrawnAt",
    ]);
    assert.equal(stored.formVersion, 2);
    assert.equal(stored.status, "draft");
    assert.equal(stored.roundId, ROUND);
    assert.equal(stored.uid, me);
    assert.equal(stored.sent, null);
    assert.equal(stored.submittedAt, null);
    assert.ok(stored.createdAt instanceof Date);
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
    assert.deepEqual(
      db.writes.map((write) => `${write.kind} ${write.path}`),
      [`create ${appPath(me)}`, `update ${ROUND_PATH}`],
    );
  });

  test("the email and the name on it are the session's, whatever the request says", async () => {
    await PUT({
      draft: { ...fullDraft(), email: "victim@nottingham.ac.uk", displayName: "Somebody Else", uid: "ben", status: "accepted", sent: fullDraft() },
      email: "victim@nottingham.ac.uk",
      displayName: "Somebody Else",
      uid: "ben",
      status: "accepted",
      sent: fullDraft(),
      result: { kind: "accepted", programmeId: AGI },
    });
    const stored = db.data(appPath(me));
    assert.equal(stored.email, `${me}@example.com`);
    assert.equal(stored.displayName, `${nameOf(me)} Example`);
    assert.equal(stored.uid, me);
    assert.equal(stored.status, "draft");
    assert.equal(stored.sent, null);
    assert.equal(stored.result, null);
    assert.equal(db.data(appPath("ben")), null);
    assert.equal(JSON.stringify(stored).includes("victim@"), false);
    assert.deepEqual(Object.keys(stored.draft).sort(), ["aboutYou", "answers", "availability", "rankedProgrammeIds", "suMembership", "wantsToFacilitate"]);
  });

  test("the university email on the draft is the account's", async () => {
    await PUT({ draft: fullDraft() });
    const about = db.data(appPath(me)).draft.aboutYou;
    assert.equal(about.universityEmail, "ada@nottingham.ac.uk");
    assert.equal(about.universityEmailVerified, true);
  });

  test("a later save replaces the draft, moves no counter and touches nothing else", async () => {
    await PUT({ draft: fullDraft() });
    db.writes.length = 0;
    const response = await PUT({ draft: fullDraft({ rankedProgrammeIds: [TAIS, AGI], suMembership: "yes" }) });
    assert.equal(response.status, 200);
    assert.equal(response.body.created, false);
    assert.deepEqual(db.writes, [{ kind: "update", path: appPath(me), fields: ["draft", "updatedAt"] }]);
    assert.deepEqual(db.data(appPath(me)).draft.rankedProgrammeIds, [TAIS, AGI]);
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
  });

  test("a half-written form saves", async () => {
    const response = await PUT({ draft: { rankedProgrammeIds: [AGI] } });
    assert.equal(response.status, 200);
    assert.deepEqual(db.data(appPath(me)).draft.answers, {});
  });

  test("a ranking keeps only programmes this form is taking applications for", async () => {
    await PUT({ draft: fullDraft({ rankedProgrammeIds: ["constructor", CLOSED, AGI, "__proto__", "nope", AGI] }) });
    assert.deepEqual(db.data(appPath(me)).draft.rankedProgrammeIds, [AGI]);
  });

  test("the answer is the caller's own application, projected", async () => {
    const response = await PUT({ draft: fullDraft() });
    assert.deepEqual(Object.keys(response.body).sort(), ["application", "created", "ok", "savedAt"]);
    assert.equal(response.body.application.status, "draft");
    assert.equal("email" in response.body.application, false);
    assert.equal("displayName" in response.body.application, false);
  });

  test("two first saves at once make one application and count it once", async () => {
    const responses = await Promise.all([PUT({ draft: fullDraft() }), PUT({ draft: fullDraft() })]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const lost = responses.find((response) => response.status === 409);
    assert.equal(lost.body.retry, true, "the form is told the same save will land if it is made again");
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
    assert.equal((await PUT({ draft: fullDraft() })).status, 200);
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
  });

  test("while applications are paused nobody can START one, and a draft that exists still saves", async () => {
    await PUT({ draft: fullDraft() });
    db.seed(NOTICE_PATH, {
      [siteNotice.SITE_NOTICE_SURFACE_FLAGS.courseApplications]: true,
      message: "Back shortly.",
      updatedAt: new Date(),
    });
    assert.equal((await PUT({ draft: fullDraft({ suMembership: "yes" }) })).status, 200, "an existing draft is not stranded");
    db.seed("users/ben", userDoc("ben"));
    signIn("ben");
    const refused = await PUT({ draft: fullDraft() });
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error, "Back shortly.");
    assert.equal(db.data(appPath("ben")), null);
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
  });

  test("an application that has been decided cannot be written over", async () => {
    await PUT({ draft: fullDraft() });
    for (const status of ["accepted", "invited", "no-offer", "declined", "withdrawn"]) {
      db.docs.get(appPath(me)).status = status;
      db.writes.length = 0;
      const response = await PUT({ draft: fullDraft({ suMembership: "yes" }) });
      assert.equal(response.status, 409, status);
      assert.deepEqual(db.writes, []);
    }
  });

  test("a document from an older form at the same address is left alone", async () => {
    db.seed(appPath(me), { roundId: ROUND, uid: me, status: "draft", stageAnswers: { s1: {} } });
    const response = await PUT({ draft: fullDraft() });
    assert.equal(response.status, 409);
    assert.deepEqual(db.writes, []);
    assert.deepEqual(db.data(appPath(me)).stageAnswers, { s1: {} });
  });

  test("one account can only save so often", async () => {
    world({ uid: "flood" });
    const limit = requests.APPLICANT_RATE_LIMITS.saveUidMax;
    let last = null;
    for (let i = 0; i <= limit; i += 1) last = await PUT({ draft: { rankedProgrammeIds: [] } });
    assert.equal(last.status, 429);
    assert.equal(last.body.error, requests.TOO_MANY_ATTEMPTS);
    assert.ok(Number(last.headers["Retry-After"]) >= 1);
  });

  test("one address is throttled before the session is even looked up", async () => {
    signIn(null);
    const limit = requests.APPLICANT_RATE_LIMITS.sendIpMax;
    let last = null;
    for (let i = 0; i <= limit; i += 1) last = await SEND({}, ROUND, { ip: "192.0.2.7, 198.51.100.1" });
    assert.equal(last.status, 429, "the per-address limit answers before the 401 would");
    assert.ok(Number(last.headers["Retry-After"]) >= 1);
  });
});

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

describe("POST, the send", () => {
  test("with nothing saved there is nothing to send", async () => {
    const response = await SEND();
    assert.equal(response.status, 404);
    assert.deepEqual(db.writes, []);
  });

  test("a draft with something missing is refused, says what and where, and changes nothing", async () => {
    await PUT({ draft: fullDraft({ answers: {}, suMembership: null, wantsToFacilitate: null }) });
    db.writes.length = 0;
    const response = await SEND();
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Your application is not ready to send yet.");
    assert.deepEqual(
      response.body.issues.map((issue) => issue.step),
      ["facilitating", "set:fellowships", `set:${AGI}`, "check"],
    );
    for (const issue of response.body.issues) {
      assert.deepEqual(Object.keys(issue).sort(), ["message", "questionId", "step"]);
      assert.ok(issue.message.length > 5);
    }
    assert.deepEqual(db.writes, []);
    assert.equal(db.data(appPath(me)).status, "draft");
    assert.deepEqual(counts(), { draft: 1, submitted: 0 });
  });

  test("a good draft becomes the application of record, and the counters move with the status", async () => {
    await PUT({ draft: fullDraft() });
    db.writes.length = 0;
    const response = await SEND();
    assert.equal(response.status, 200);
    assert.equal(response.body.first, true);
    const stored = db.data(appPath(me));
    assert.equal(stored.status, "submitted");
    assert.ok(stored.submittedAt instanceof Date);
    assert.equal(stored.sentAt.getTime(), stored.submittedAt.getTime());
    assert.deepEqual(stored.sent.rankedProgrammeIds, [AGI]);
    assert.deepEqual(stored.sent.answers, { fellowships: { why: "To understand the strategic picture." }, [AGI]: { event: "Open weights." } });
    assert.deepEqual(counts(), { draft: 0, submitted: 1 });
    assert.deepEqual(
      db.writes.map((write) => `${write.kind} ${write.path}`),
      [`update ${appPath(me)}`, `update ${ROUND_PATH}`],
      "the status and its counter land in one transaction",
    );
    assert.equal(response.body.application.status, "submitted");
    assert.ok(response.body.application.sent);
  });

  test("what is sent is the stored draft, held to the form by the same rule the form shows", async () => {
    await PUT({ draft: fullDraft() });
    await SEND();
    const stored = db.data(appPath(me));
    const form = normalise.normaliseForm(ROUND, db.data(ROUND_PATH));
    const sets = Object.entries(SET_DOCS).map(([id, set]) => normalise.normaliseQuestionSet(id, set));
    assert.deepEqual(validate.issuesFor(form, sets, normalise.normaliseContent(stored.draft, GRID)), []);
    assert.deepEqual(
      normalise.normaliseContent(stored.sent, GRID),
      validate.contentForSend(form, sets, normalise.normaliseContent(stored.draft, GRID)),
    );
  });

  test("it takes no content from the request", async () => {
    await PUT({ draft: fullDraft() });
    await SEND({
      draft: fullDraft({ rankedProgrammeIds: [TAIS] }),
      sent: fullDraft({ rankedProgrammeIds: [TAIS] }),
      rankedProgrammeIds: [TAIS],
      status: "accepted",
      email: "victim@nottingham.ac.uk",
    });
    const stored = db.data(appPath(me));
    assert.deepEqual(stored.sent.rankedProgrammeIds, [AGI]);
    assert.equal(stored.status, "submitted");
    assert.equal(stored.email, `${me}@example.com`);
  });

  test("answers to a programme that was unticked are not sent", async () => {
    await PUT({ draft: fullDraft({ rankedProgrammeIds: [AGI, TAIS] }) });
    await PUT({ draft: fullDraft({ rankedProgrammeIds: [TAIS], answers: { fellowships: { why: "Still this." }, [AGI]: { event: "Left behind." } } }) });
    await SEND();
    const stored = db.data(appPath(me));
    assert.deepEqual(Object.keys(stored.sent.answers), ["fellowships"]);
    assert.equal(stored.draft.answers[AGI].event, "Left behind.", "the draft keeps it, in case the programme is ticked again");
  });

  test("after a send, a save changes the draft and leaves the sent copy alone", async () => {
    await PUT({ draft: fullDraft() });
    await SEND();
    const before = db.data(appPath(me));
    db.writes.length = 0;
    const response = await PUT({ draft: fullDraft({ answers: { fellowships: { why: "A better answer." }, [AGI]: { event: "Open weights." } } }) });
    assert.equal(response.status, 200);
    const after = db.data(appPath(me));
    assert.equal(after.draft.answers.fellowships.why, "A better answer.");
    assert.deepEqual(after.sent, before.sent);
    assert.equal(after.status, "submitted");
    assert.equal(after.sentAt.getTime(), before.sentAt.getTime());
    assert.deepEqual(db.writes, [{ kind: "update", path: appPath(me), fields: ["draft", "updatedAt"] }]);
    assert.deepEqual(counts(), { draft: 0, submitted: 1 });
  });

  test("sending again replaces the sent copy whole and moves no counter", async () => {
    await PUT({ draft: fullDraft() });
    await SEND();
    const first = db.data(appPath(me));
    await PUT({ draft: fullDraft({ answers: { fellowships: { why: "A better answer." }, [AGI]: { event: "Open weights." } }, suMembership: "yes" }) });
    db.writes.length = 0;
    const response = await SEND();
    assert.equal(response.status, 200);
    assert.equal(response.body.first, false);
    const second = db.data(appPath(me));
    assert.equal(second.sent.answers.fellowships.why, "A better answer.");
    assert.equal(second.sent.suMembership, "yes");
    assert.equal(second.status, "submitted");
    assert.equal(second.submittedAt.getTime(), first.submittedAt.getTime(), "the first time they pressed Send is kept");
    assert.ok(second.sentAt.getTime() > first.sentAt.getTime());
    assert.deepEqual(db.writes.map((write) => write.path), [appPath(me)], "no counter moves when no status does");
    assert.deepEqual(counts(), { draft: 0, submitted: 1 });
  });

  test("a change that breaks the draft cannot unseat the application already sent", async () => {
    await PUT({ draft: fullDraft() });
    await SEND();
    const good = db.data(appPath(me)).sent;
    await PUT({ draft: fullDraft({ answers: {} }) });
    const response = await SEND();
    assert.equal(response.status, 400);
    assert.deepEqual(db.data(appPath(me)).sent, good);
    assert.equal(db.data(appPath(me)).status, "submitted");
  });

  test("the university email sent is the account's at the moment of sending", async () => {
    await PUT({ draft: fullDraft() });
    db.docs.get(`users/${me}`).profile.universityEmail = "someone@nottingham.ac.uk";
    await SEND();
    assert.equal(db.data(appPath(me)).sent.aboutYou.universityEmail, "someone@nottingham.ac.uk");
    // And an account with no university email cannot send at all.
    world({ uid: "nomail", user: { profile: { preferredName: "No", status: "undergraduate", subject: "x", expectedGraduation: "2028-07", motivation: "y" } } });
    await PUT({ draft: fullDraft() });
    const refused = await SEND();
    assert.equal(refused.status, 400);
    assert.ok(refused.body.issues.some((issue) => issue.step === "about" && issue.message === "Add your university email."));
  });

  test("a programme that closed after it was ticked stops the send, in words", async () => {
    await PUT({ draft: fullDraft({ rankedProgrammeIds: [TAIS, AGI] }) });
    db.docs.get(ROUND_PATH).programmes[TAIS].closed = true;
    const response = await SEND();
    assert.equal(response.status, 400);
    assert.ok(
      response.body.issues.some(
        (issue) => issue.step === "choose" && issue.message === "Technical AI Safety is not taking applications. Untick it to carry on.",
      ),
    );
    assert.equal(db.data(appPath(me)).status, "draft");
  });

  test("a stored draft is cleaned before it is held to the form, whoever wrote it", async () => {
    await PUT({ draft: fullDraft() });
    const stored = db.docs.get(appPath(me));
    stored.draft.rankedProgrammeIds = ["constructor", AGI, "nope"];
    stored.draft.aboutYou.status = "constructor";
    stored.draft.answers.invented = { why: "x" };
    const refused = await SEND();
    assert.equal(refused.status, 400, "a status that is not one the site offers is a blank status");
    assert.ok(refused.body.issues.some((issue) => issue.message === "Tell us what you do at UoN."));
    stored.draft.aboutYou.status = "undergraduate";
    assert.equal((await SEND()).status, 200);
    const sent = db.data(appPath(me)).sent;
    assert.deepEqual(sent.rankedProgrammeIds, [AGI]);
    assert.deepEqual(Object.keys(sent.answers).sort(), [AGI, "fellowships"].sort());
  });

  test("paused, decided, and older-form applications are all refused without a write", async () => {
    await PUT({ draft: fullDraft() });
    db.seed(NOTICE_PATH, { [siteNotice.SITE_NOTICE_SURFACE_FLAGS.courseApplications]: true, updatedAt: new Date() });
    db.writes.length = 0;
    const paused = await SEND();
    assert.equal(paused.status, 503);
    assert.equal(paused.body.error, siteNotice.DEFAULT_PAUSED_MESSAGE);
    db.docs.delete(NOTICE_PATH);
    db.docs.get(appPath(me)).status = "accepted";
    assert.equal((await SEND()).status, 409);
    db.seed(appPath(me), { roundId: ROUND, uid: me, status: "draft" });
    assert.equal((await SEND()).status, 409);
    assert.deepEqual(db.writes, []);
  });

  test("one account can only send so often", async () => {
    world({ uid: "eager" });
    await PUT({ draft: fullDraft() });
    const limit = requests.APPLICANT_RATE_LIMITS.sendUidMax;
    let last = null;
    for (let i = 0; i <= limit; i += 1) last = await SEND();
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers["Retry-After"]) >= 1);
  });
});

// ---------------------------------------------------------------------------
// What a send replaces is kept
// ---------------------------------------------------------------------------

/**
 * Sending again replaces the application of record. When the new one is
 * different, the one it replaces is kept on the same document, with when it
 * was sent, for the people reviewing the application. The rule is in
 * `src/lib/applications/versions/kept.ts`; these run it through the route.
 */
describe("POST, the send: what it replaces is kept", () => {
  const HISTORY_FIELDS = ["sentChangedAt", "sentHistory", "sentHistoryDropped"];
  const FIRST_WHY = "The first thing I wrote, before I thought again.";
  const draftSaying = (why, more = {}) =>
    fullDraft({ answers: { fellowships: { why }, [AGI]: { event: "Open weights." } }, ...more });
  const stored = () => db.data(appPath(me));
  /** Save a draft and send it, expecting both to work. */
  async function sendDraft(draft) {
    assert.equal((await PUT({ draft })).status, 200);
    const response = await SEND();
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response;
  }

  test("the first send keeps nothing, and says when the application of record began", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const first = stored();
    assert.equal(first.sentHistory, undefined, "there is nothing earlier to keep");
    assert.equal(first.sentHistoryDropped, undefined);
    assert.equal(first.sentChangedAt.getTime(), first.sentAt.getTime());
    assert.equal(first.sentChangedAt.getTime(), first.submittedAt.getTime());
  });

  test("a save alone keeps nothing: only a send replaces the application of record", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const first = stored();
    await PUT({ draft: draftSaying("A better answer.") });
    const saved = stored();
    assert.equal(saved.sentHistory, undefined);
    assert.equal(saved.sentChangedAt.getTime(), first.sentChangedAt.getTime());
  });

  test("sending again after a change keeps the version it replaces, whole, with when it was sent", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const first = stored();
    db.writes.length = 0;
    await sendDraft(draftSaying("A better answer."));
    const second = stored();

    assert.equal(second.sent.answers.fellowships.why, "A better answer.");
    assert.equal(second.sentHistory.length, 1);
    assert.deepEqual(second.sentHistory[0].content, first.sent, "the kept version is what was the application of record");
    assert.equal(
      second.sentHistory[0].sentAt.getTime(),
      first.sentChangedAt.getTime(),
      "kept with the time IT became the application of record, not the time of this send",
    );
    assert.equal(second.sentHistoryDropped, 0);
    assert.equal(second.sentChangedAt.getTime(), second.sentAt.getTime());
    assert.ok(second.sentChangedAt.getTime() > first.sentChangedAt.getTime());
    // One transaction: the history lands with the send that replaces `sent`, or not at all.
    assert.deepEqual(db.writes.at(-1), {
      kind: "update",
      path: appPath(me),
      fields: ["draft", "sent", "sentAt", "sentChangedAt", "sentHistory", "sentHistoryDropped", "updatedAt"],
    });

    // And again: oldest first, each with its own time.
    await sendDraft(draftSaying("A third answer."));
    const third = stored();
    assert.deepEqual(
      third.sentHistory.map((version) => version.content.answers.fellowships.why),
      [FIRST_WHY, "A better answer."],
    );
    assert.equal(third.sentHistory[1].sentAt.getTime(), second.sentChangedAt.getTime());
    // The list is written whole each time, and what was already in it comes through unchanged.
    assert.deepEqual(third.sentHistory[0], second.sentHistory[0]);
    assert.deepEqual(third.sentHistory[1].content, second.sent);
    assert.equal(third.sent.answers.fellowships.why, "A third answer.");
    assert.equal(third.submittedAt.getTime(), first.submittedAt.getTime());
  });

  test("a send that changes nothing keeps nothing, and the current version keeps its date", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    await sendDraft(draftSaying("A better answer."));
    const before = stored();
    db.writes.length = 0;

    // Pressed again as it is, and again after a save of the very same draft.
    assert.equal((await SEND()).status, 200);
    await sendDraft(draftSaying("A better answer."));
    const after = stored();
    assert.deepEqual(after.sentHistory, before.sentHistory);
    assert.equal(after.sentHistoryDropped, before.sentHistoryDropped);
    assert.equal(after.sentChangedAt.getTime(), before.sentChangedAt.getTime());
    assert.ok(after.sentAt.getTime() > before.sentAt.getTime(), "the last press of Send is still recorded");
    for (const write of db.writes.filter((entry) => entry.fields.includes("sent"))) {
      assert.deepEqual(write.fields, ["draft", "sent", "sentAt", "updatedAt"], "a send with no change writes no history");
    }
  });

  test("a draft that changed in a way the send does not carry is not a change", async () => {
    // An answer to a programme they have unticked stays in the draft and is never sent.
    const unticked = (event) =>
      fullDraft({ rankedProgrammeIds: [TAIS], answers: { fellowships: { why: FIRST_WHY }, [AGI]: { event } } });
    await sendDraft(unticked("One thing."));
    const first = stored();
    await sendDraft(unticked("Another thing."));
    const second = stored();
    assert.equal(second.draft.answers[AGI].event, "Another thing.", "the draft did change");
    assert.deepEqual(second.sent, first.sent);
    assert.equal(second.sentHistory, undefined);
    assert.equal(second.sentChangedAt.getTime(), first.sentChangedAt.getTime());
  });

  test("a change to any part of the application is a change", async () => {
    const changes = {
      "an answer": draftSaying("Something else."),
      "About you": fullDraft({ aboutYou: { ...fullDraft().aboutYou, subject: "BSc Mathematics" }, answers: draftSaying(FIRST_WHY).answers }),
      "the ranking": draftSaying(FIRST_WHY, { rankedProgrammeIds: [TAIS, AGI] }),
      facilitating: draftSaying(FIRST_WHY, { wantsToFacilitate: true }),
      availability: draftSaying(FIRST_WHY, { availability: { days: ["000000000000", "00000000ffff"] } }),
      "the SU membership answer": draftSaying(FIRST_WHY, { suMembership: "yes" }),
    };
    for (const [part, changed] of Object.entries(changes)) {
      world();
      await sendDraft(draftSaying(FIRST_WHY));
      await sendDraft(changed);
      assert.equal(stored().sentHistory?.length, 1, `changing ${part} kept no earlier version`);
      assert.equal(stored().sentHistory[0].content.answers.fellowships.why, FIRST_WHY, part);
    }
  });

  test("nothing an applicant is answered with carries an earlier version, even their own", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const again = await sendDraft(draftSaying("A better answer."));
    const look = await GET();
    const save = await PUT({ draft: draftSaying("A third answer, not sent.") });
    assert.equal(stored().sentHistory.length, 1, "the version is kept");
    for (const [name, response] of Object.entries({ "the send": again, "the read": look, "the save": save })) {
      const said = JSON.stringify(response.body);
      assert.ok(!said.includes(FIRST_WHY), `${name} answered with what the earlier version said`);
      for (const field of HISTORY_FIELDS) assert.ok(!said.includes(field), `${name} answered with ${field}`);
    }
    assert.deepEqual(Object.keys(look.body.application).sort(), [
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
  });

  test("at the cap the first version stays, the oldest after it goes, and it is counted", async () => {
    await sendDraft(draftSaying("Version 11, the one on record."));
    const cap = (await loadTs(join("lib", "applications", "model.ts"))).SENT_HISTORY_LIMITS.maxVersions;
    assert.equal(cap, 10);
    const record = db.docs.get(appPath(me));
    const at = (n) => new Date(Date.UTC(2026, 9, 1, 12, n));
    // Ten versions already kept: the cap, exactly.
    record.sentHistory = Array.from({ length: cap }, (_, i) => ({
      content: { ...clone(record.sent), answers: { ...clone(record.sent.answers), fellowships: { why: `Version ${i + 1}.` } } },
      sentAt: at(i + 1),
    }));
    record.sentHistoryDropped = 0;
    record.sentChangedAt = at(cap + 1);

    await sendDraft(draftSaying("Version 12."));
    const after = stored();
    assert.deepEqual(
      after.sentHistory.map((version) => version.content.answers.fellowships.why),
      ["Version 1.", "Version 3.", "Version 4.", "Version 5.", "Version 6.", "Version 7.", "Version 8.", "Version 9.", "Version 10.", "Version 11, the one on record."],
      "the first is kept, the second went, and the one just replaced is on the end",
    );
    assert.equal(after.sentHistory[0].sentAt.getTime(), at(1).getTime());
    assert.equal(after.sentHistory.at(-1).sentAt.getTime(), at(cap + 1).getTime());
    assert.equal(after.sentHistoryDropped, 1);

    await sendDraft(draftSaying("Version 13."));
    assert.equal(stored().sentHistory.length, cap);
    assert.equal(stored().sentHistory[0].content.answers.fellowships.why, "Version 1.");
    assert.equal(stored().sentHistoryDropped, 2);
  });

  test("a stored history that is not one reads as none, and the next send writes a clean one", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const record = db.docs.get(appPath(me));
    record.sentHistory = { 0: "not a list" };
    record.sentHistoryDropped = "many";
    await sendDraft(draftSaying("A better answer."));
    assert.equal(stored().sentHistory.length, 1);
    assert.equal(stored().sentHistory[0].content.answers.fellowships.why, FIRST_WHY);
    assert.equal(stored().sentHistoryDropped, 0);

    record.sentHistory = [null, "x", { sentAt: new Date() }, { content: [] }, ...clone(record.sentHistory)];
    await sendDraft(draftSaying("A third answer."));
    assert.deepEqual(
      stored().sentHistory.map((version) => version.content.answers.fellowships.why),
      [FIRST_WHY, "A better answer."],
      "entries with no content of their own are not versions",
    );
  });

  test("a refused send keeps nothing", async () => {
    await sendDraft(draftSaying(FIRST_WHY));
    const before = stored();
    await PUT({ draft: fullDraft({ answers: {} }) });
    assert.equal((await SEND()).status, 400);
    assert.deepEqual(stored().sent, before.sent);
    assert.equal(stored().sentHistory, undefined);
    assert.equal(stored().sentChangedAt.getTime(), before.sentChangedAt.getTime());
  });

  // Three rules meet on a press of Send, and each was written without sight
  // of the other two. A send that changes the application keeps the version
  // it replaces. Before it sends, the form waits for the access-requirements
  // box to be saved, so that answer is already stored, apart from the
  // application, when the request arrives. And a send is held for an account
  // with no join request, and for a waiting account whose university address
  // is not checked. A held send is no send at all, so nothing of the other
  // two may move. The two tests below hold all three together.
  const accessPath = (uid) => `admissionApplicationPrivate/${ROUND}__${uid}`;
  const WROTE = { accessRequirements: "I use a wheelchair, so a step-free room please." };
  /** Every stored document, as text, so "nothing changed" is one comparison. */
  const everything = () => JSON.stringify([...db.docs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const readsOfTheAnswer = (since) => db.reads.slice(since).filter((path) => path.startsWith("admissionApplicationPrivate/"));

  test("a held send keeps nothing, writes nothing and leaves the access-requirements answer as it was", async () => {
    const VERIFY = { step: "check", questionId: null, message: joinRules.VERIFY_FIRST };
    const JOIN = { step: "about", questionId: null, message: joinRules.JOIN_FIRST };
    const cases = [
      {
        name: "a waiting account that has never sent, whose address is not checked",
        issue: VERIFY,
        draftWhy: FIRST_WHY,
        sentWhy: null,
        async arrange(uid) {
          world({ uid, role: "pending", user: unchecked(uid) });
          assert.equal((await PUT({ draft: draftSaying(FIRST_WHY) })).status, 200);
        },
      },
      {
        // The one case in which a send that went through WOULD keep a version:
        // there is an application of record and the draft differs from it.
        // What the account says at the moment of the press decides, and here
        // the check has gone since the first send (a changed address clears it).
        name: "a waiting account that sent once, changed its answers, and whose address is no longer checked",
        issue: VERIFY,
        draftWhy: "A better answer.",
        sentWhy: FIRST_WHY,
        async arrange(uid) {
          world({ uid, role: "pending" });
          await sendDraft(draftSaying(FIRST_WHY));
          assert.equal((await PUT({ draft: draftSaying("A better answer.") })).status, 200);
          db.seed(`users/${uid}`, userDoc(uid, unchecked(uid)));
        },
      },
      {
        name: "an account with no join request",
        issue: JOIN,
        draftWhy: FIRST_WHY,
        sentWhy: null,
        async arrange(uid) {
          world({ uid, role: "pending" });
          db.docs.delete(`users/${uid}`);
          assert.equal((await PUT({ draft: draftSaying(FIRST_WHY) })).status, 200);
        },
      },
    ];
    for (const each of cases) {
      const uid = freshUid();
      await each.arrange(uid);
      // What the box saved beside the application before the press.
      db.seed(accessPath(uid), WROTE);
      const before = everything();
      const writes = db.writes.length;
      const reads = db.reads.length;
      const countsBefore = counts();

      const refused = await SEND();
      assert.equal(refused.status, 400, each.name);
      assert.deepEqual(refused.body.issues, [each.issue], each.name);
      assert.equal(db.writes.length, writes, `${each.name}: a held send wrote something`);
      assert.equal(everything(), before, `${each.name}: a held send changed a stored document`);

      // Said again one by one, so that a failure names what moved.
      const held = stored();
      assert.equal(held.sentHistory, undefined, `${each.name}: a held send kept a version`);
      assert.equal(held.sentHistoryDropped, undefined, each.name);
      assert.equal(held.draft.answers.fellowships.why, each.draftWhy, each.name);
      assert.equal(held.sent ? held.sent.answers.fellowships.why : null, each.sentWhy, each.name);
      assert.equal(held.status, each.sentWhy ? "submitted" : "draft", each.name);
      assert.deepEqual(counts(), countsBefore, `${each.name}: a held send moved a counter`);
      assert.deepEqual(db.data(accessPath(uid)), WROTE, `${each.name}: a held send touched the access-requirements answer`);
      // The send route does not so much as read where that answer is kept.
      assert.deepEqual(readsOfTheAnswer(reads), [], each.name);
      // And the applicant is told nothing but why: no application comes back.
      assert.deepEqual(Object.keys(refused.body).sort(), ["error", "issues"], each.name);
    }
  });

  test("once the address is checked the same press sends, keeps the version it replaces, and still leaves that answer and the account alone", async () => {
    const uid = freshUid();
    world({ uid, role: "pending" });
    await sendDraft(draftSaying(FIRST_WHY));
    const first = stored();
    assert.equal((await PUT({ draft: draftSaying("A better answer.") })).status, 200);
    db.seed(accessPath(uid), WROTE);
    db.seed(`users/${uid}`, userDoc(uid, unchecked(uid)));
    assert.equal((await SEND()).status, 400);

    // What following the emailed link does: the server stamps the profile.
    // The account also carries the record made when it joined, which a send
    // has no business reading, restating or moving.
    const joinedOn = new Date("2026-09-25T08:01:00Z");
    db.seed(`users/${uid}`, userDoc(uid, { policyVersion: "terms.1+privacy.5", policyAgreedAt: joinedOn }));
    const account = JSON.stringify(db.data(`users/${uid}`));
    db.writes.length = 0;
    const reads = db.reads.length;

    const sent = await SEND();
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.first, false);
    const second = stored();
    assert.equal(second.sent.answers.fellowships.why, "A better answer.");
    // One version kept, by the press that went. The held one kept none.
    assert.equal(second.sentHistory.length, 1);
    assert.deepEqual(second.sentHistory[0].content, first.sent);
    assert.equal(second.sentHistory[0].sentAt.getTime(), first.sentChangedAt.getTime());

    // The send wrote the application and nothing else.
    assert.deepEqual(db.writes.map((write) => write.path), [appPath(uid)]);
    assert.equal(JSON.stringify(db.data(`users/${uid}`)), account, "a send changed the account");
    assert.deepEqual(db.data(accessPath(uid)), WROTE, "a send touched the access-requirements answer");
    assert.deepEqual(readsOfTheAnswer(reads), []);
    // Nothing of that answer is on the application, in the version that was
    // kept, or in what the applicant is answered with.
    for (const [where, text] of [
      ["the application", JSON.stringify(second)],
      ["the reply", JSON.stringify(sent.body)],
    ]) {
      assert.ok(!text.includes("wheelchair") && !text.includes("accessRequirements"), `${where} carries the access-requirements answer`);
    }
    // And sending records no agreement of its own: the line on the last step
    // states one, and the record made at joining stays the only record.
    const speaksOfAgreeing = (value) => Object.keys(value).filter((key) => /polic|agree|consent/i.test(key));
    assert.deepEqual(speaksOfAgreeing(second), []);
    assert.deepEqual(Object.keys(sent.body).sort(), ["application", "first", "ok"]);
    assert.deepEqual(speaksOfAgreeing(sent.body.application), []);
  });
});

// ---------------------------------------------------------------------------
// The shape of the files, where the tree-walking guards read them
// ---------------------------------------------------------------------------

describe("the handlers are written the way the guards read them", () => {
  const source = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
  const code = (path) => source(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ROUTE = "src/app/api/admissions/forms/[roundId]/application/route.ts";
  const SEND_ROUTE = "src/app/api/admissions/forms/[roundId]/application/send/route.ts";
  const handler = (text, method) => {
    const start = text.indexOf(`export async function ${method}(`);
    assert.ok(start !== -1, `no ${method} handler`);
    const next = text.indexOf("export async function ", start + 10);
    return text.slice(start, next === -1 ? undefined : next);
  };

  test("each mutating handler's first statement is the view-as guard", () => {
    for (const [path, method] of [[ROUTE, "PUT"], [SEND_ROUTE, "POST"]]) {
      const body = handler(code(path), method);
      const opening = body.slice(body.indexOf("{") + 1).trimStart();
      assert.ok(
        opening.startsWith("const blocked = await assertNotImpersonating();\n  if (blocked) return blocked;"),
        `${path} ${method} does something before the view-as guard`,
      );
    }
  });

  test("the gate is the applicant's own, from the module that reaches nothing else", () => {
    for (const path of [ROUTE, SEND_ROUTE]) {
      const text = code(path);
      assert.match(text, /import \{ requireApplicant \} from "@\/lib\/admissions\/applicantSession";/);
      assert.match(text, /const caller = await requireApplicant\(\);\n\s*if \(caller instanceof NextResponse\) return caller;/);
      assert.equal(/admissions\/applyContext/.test(text), false, `${path} imports the older form's context`);
      assert.equal(/staffRepo/.test(text), false, `${path} reaches the staff reads`);
    }
  });

  test("nothing in the applicant's lane imports the staff reads or the older form's context", () => {
    for (const file of ["account.ts", "draft.ts", "keys.ts", "project.ts", "requests.ts", "shape.ts", "store.ts", "types.ts", "window.ts"]) {
      const text = code(`src/lib/applications/applicant/${file}`);
      assert.equal(/staffRepo|admissions\/applyContext|admissionReviews|admissionDecisions/.test(text), false, file);
    }
  });

  test("the window is asked before the write, in both write handlers", () => {
    const put = handler(code(ROUTE), "PUT");
    assert.ok(put.indexOf("formWindowRefusal(") !== -1 && put.indexOf("formWindowRefusal(") < put.indexOf("saveDraft("));
    const post = handler(code(SEND_ROUTE), "POST");
    assert.ok(post.indexOf("formWindowRefusal(") !== -1 && post.indexOf("formWindowRefusal(") < post.indexOf("sendApplication("));
  });

  test("the send route never reads the request's body", () => {
    const post = handler(code(SEND_ROUTE), "POST");
    assert.equal(/req\.json\(|req\.text\(|readJsonBody\(|\bbody\b/.test(post), false);
  });

  test("the GET calls nothing that writes", () => {
    const get = handler(code(ROUTE), "GET");
    assert.equal(/saveDraft\(|sendApplication\(|runTransaction\(|\.set\(|\.update\(|\.create\(|\.delete\(/.test(get), false);
  });

  test("no file in the lane deletes an application", () => {
    for (const path of [ROUTE, SEND_ROUTE, "src/lib/applications/applicant/store.ts"]) {
      assert.equal(/\.delete\(/.test(code(path)), false, path);
    }
  });

  test("the page hands a form to the new screen before the older path runs, and changes nothing else", () => {
    const page = source("src/app/(public)/apply/[roundId]/page.tsx");
    const handOff = page.indexOf("await renderApplicationForm({");
    const older = page.indexOf("const loaded = await loadRound(roundId, user?.uid ?? null, !viewingAs);");
    assert.ok(handOff !== -1 && older !== -1 && handOff < older);
    assert.match(page, /if \(applicationForm\) return applicationForm;/);
  });
});
