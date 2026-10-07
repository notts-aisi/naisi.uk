/**
 * The reply route, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 *   POST /api/admissions/forms/[roundId]/application/reply     { reply }
 *
 * ## The rules this guards
 *
 *  - WHO. The applicant's gate: no session is a 401, a refused account a 403,
 *    and an account still waiting to be approved is admitted. Nothing is
 *    written during a view-as session, and nothing is read either.
 *  - THE BODY FIRST. A request that does not carry one of the four replies is
 *    a 400 before any document is read.
 *  - WHICH FORM. A form that does not exist, a round of the older kind and an
 *    id that is not one all answer the same 404. So does a form that is a
 *    draft or archived, for a caller with no application on it.
 *  - WHOSE. The one application read and written is the session's own,
 *    addressed by its uid. Somebody else's application, a decision and a
 *    review sit in the same store carrying a marker, and are never read,
 *    never written and never echoed.
 *  - WHAT IS WRITTEN. Every state an application can be in is put through
 *    every reply. A write lands in ONE transaction: the reply fields, the
 *    status when it moves, and the form's counters with it. `result` is never
 *    touched and the invitation's other fields are left exactly as they were.
 *  - A REFUSAL WRITES NOTHING, and neither does saying the same thing twice.
 *
 * ## What is real and what is faked
 *
 * Real: the route file, the applicant's gate (`applicantSession.ts`), the
 * rate limiter and everything under `src/lib/applications/`. Faked:
 * `next/server`, the two sentinels `firebase-admin/firestore` supplies, the
 * view-as guard, the session, and the Admin SDK handle, which is an
 * in-memory store small enough to read (addressed documents, and
 * transactions that commit whole or not at all).
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
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__replyDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__replyUser ?? null;\n}"],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__replyBlocked ?? null;\n}",
  ],
]);

const { loadTs } = createLoader({ stubs: STUBS });

const ROUTE = join("app", "api", "admissions", "forms", "[roundId]", "application", "reply", "route.ts");
const route = await loadTs(ROUTE);
const replies = await loadTs(join("lib", "applications", "status", "replies.ts"));
const record = await loadTs(join("lib", "applications", "status", "record.ts"));
const store = await loadTs(join("lib", "applications", "applicant", "store.ts"));
const requests = await loadTs(join("lib", "applications", "applicant", "requests.ts"));
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

/** Every `serverTimestamp()` in one commit resolves to the same instant, and each commit is a second later. */
let clock = new Date("2026-10-23T12:00:00Z").getTime();

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
    this.reads = [];
    /** Every committed write, with the commit it landed in. */
    this.writes = [];
    this.commits = 0;
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
        const held = this.docs.get(path);
        return { id: path.split("/").pop(), exists: held !== undefined, data: () => (held ? clone(held) : undefined) };
      },
      collection: (name) => this.collection(`${path}/${name}`),
    };
  }

  collection(path) {
    return {
      doc: (id) => this.ref(`${path}/${id}`),
      get: async () => {
        this.reads.push(`${path}/*`);
        return { docs: [] };
      },
    };
  }

  async runTransaction(fn) {
    const ops = [];
    const tx = {
      get: (ref) => ref.get(),
      update: (ref, data) => void ops.push({ path: ref.path, data }),
    };
    // A refusal throws out of `fn`, so nothing below runs and nothing lands.
    const result = await fn(tx);
    for (const op of ops) {
      if (!this.docs.has(op.path)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    }
    if (ops.length > 0) {
      clock += 1000;
      this.commits += 1;
    }
    const stamp = new Date(clock);
    for (const op of ops) {
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
      this.writes.push({ commit: this.commits, path: op.path, fields: Object.keys(op.data).sort() });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// A small term, after decision day
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const ROUND_PATH = `admissionRounds/${ROUND}`;
const appPath = (uid, round = ROUND) => `admissionApplications/${round}__${uid}`;
const GRID = { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 };
const MARK = "MARKER-not-for-an-applicant";
const PUBLISHED = new Date("2026-10-23T11:00:00Z");
/** Far enough ahead that no run of this file is "after the day". */
const REPLY_BY = "2099-10-25";

function programme(shortName) {
  return {
    kind: "fellowship",
    name: `${shortName} Fellowship`,
    shortName,
    pitch: "",
    facts: "6 WEEKS",
    starts: "w/c 26 Oct",
    places: 24,
    groupCount: 3,
    groupSize: "Up to 8",
    leadUid: `${MARK}-lead`,
    reviewerUids: [`${MARK}-reviewer`],
    useScores: true,
    closed: false,
    runId: null,
    emailWording: {},
  };
}

const COUNTS = { draft: 0, submitted: 3, accepted: 11, invited: 2, "no-offer": 5, declined: 1, withdrawn: 0 };

function round(overrides = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    academicYear: "2026/27",
    status: "settled",
    archived: false,
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    availabilityGrid: GRID,
    reviewerUids: [`${MARK}-reviewer`],
    applicationCounts: { ...COUNTS },
    programmeIds: [TAIS, AGI],
    programmes: { [TAIS]: programme("Technical AI Safety"), [AGI]: programme("AGI Strategy") },
    questionSetIds: [],
    asksFacilitating: false,
    invitationReplyBy: REPLY_BY,
    ...overrides,
  };
}

function application(uid, overrides = {}) {
  const written = {
    aboutYou: {
      preferredName: uid,
      universityEmail: "ada@nottingham.ac.uk",
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "",
      interests: "",
    },
    rankedProgrammeIds: [AGI],
    wantsToFacilitate: null,
    answers: {},
    availability: { ...GRID, days: [] },
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: `${uid} Example`,
    draft: written,
    sent: written,
    status: "submitted",
    submittedAt: new Date("2026-10-17T13:20:00Z"),
    sentAt: new Date("2026-10-17T13:20:00Z"),
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    createdAt: new Date("2026-10-08T18:00:00Z"),
    updatedAt: new Date("2026-10-17T13:20:00Z"),
    ...overrides,
  };
}

const placed = (more = {}) => ({
  status: "accepted",
  result: { kind: "accepted", programmeId: AGI, publishedAt: PUBLISHED },
  ...more,
});
const invitedTo = (response = null, more = {}) => ({
  status: response === "accepted" ? "accepted" : response === "declined" ? "withdrawn" : "invited",
  result: { kind: "invited", programmeId: TAIS, publishedAt: PUBLISHED },
  invitation: {
    programmeId: TAIS,
    replyBy: REPLY_BY,
    response,
    respondedAt: response ? new Date("2026-10-24T09:00:00Z") : null,
    lastReminderOn: "2026-10-24",
  },
  ...more,
});
const answered = (answer) => ({ answer, answeredAt: new Date("2026-10-24T09:00:00Z") });

/** Every state an application can be in, as it is stored. */
const STATES = {
  "nothing published": {},
  "a draft": { status: "draft", sent: null },
  "withdrawn before decision day": { status: "withdrawn", withdrawnAt: new Date("2026-10-19T09:00:00Z") },
  "placed, nothing said": placed(),
  "placed, said coming": placed({ attendance: answered("coming") }),
  "placed, gave it back": placed({ status: "withdrawn", attendance: answered("cant-make-it") }),
  "invited, not answered": invitedTo(),
  "invited, accepted": invitedTo("accepted"),
  "invited, accepted, then gave it back": invitedTo("accepted", { status: "withdrawn", attendance: answered("cant-make-it") }),
  "invited, said no thanks": invitedTo("declined"),
  "no offer": { status: "no-offer", result: { kind: "no-offer", programmeId: null, publishedAt: PUBLISHED } },
  declined: { status: "declined", result: { kind: "declined", programmeId: null, publishedAt: PUBLISHED } },
};

let db;
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

function signIn(uid, role = "member") {
  globalThis.__replyUser = uid
    ? { uid, email: `${uid}@example.com`, role, displayName: `${uid} Example` }
    : null;
}

/** A store holding the form, the caller's application in `state`, and things that are not the caller's. */
function world({ uid = freshUid(), role = "member", state = STATES["placed, nothing said"], roundOverrides = {}, mine = true } = {}) {
  me = uid;
  db = new FakeDb();
  db.seed(ROUND_PATH, round(roundOverrides));
  if (mine) db.seed(appPath(uid), application(uid, state));
  // Somebody else, invited and not yet answered, and the committee's own work on the caller.
  db.seed(appPath("ben"), application("ben", { ...invitedTo(), displayName: `${MARK}-ben` }));
  db.seed(`admissionDecisions/${ROUND}__${uid}`, { roundId: ROUND, uid, programmes: { [AGI]: { decision: "accept", decidedByUid: `${MARK}-lead` } } });
  db.seed(`admissionReviews/${ROUND}__${uid}__lloyd`, { roundId: ROUND, applicantUid: uid, reviewerUid: "lloyd", overallComment: `${MARK}-comment` });
  globalThis.__replyDb = db;
  globalThis.__replyBlocked = null;
  signIn(uid, role);
  return db;
}

const ctx = (roundId = ROUND) => ({ params: Promise.resolve({ roundId }) });
let requestNumber = 0;
/** Each request comes from its own address, so one test cannot use up another's allowance. */
function request(body, { ip } = {}) {
  requestNumber += 1;
  return new Request("http://naisi.invalid/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `10.1.${requestNumber >> 8}.${requestNumber & 255}` },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const REPLY = (reply, roundId, options) => route.POST(request(reply === undefined ? undefined : { reply }, options), ctx(roundId));
const counts = () => db.data(ROUND_PATH).applicationCounts;
const snapshot = () => JSON.stringify([...db.docs.entries()]);

beforeEach(() => {
  world();
});

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

describe("the applicant's gate", () => {
  test("no session is a 401, and nothing is read or written", async () => {
    signIn(null);
    const response = await REPLY("coming");
    assert.equal(response.status, 401);
    assert.deepEqual(db.reads, []);
    assert.deepEqual(db.writes, []);
  });

  test("a refused account is a 403, and nothing is read or written", async () => {
    signIn(me, "rejected");
    const response = await REPLY("coming");
    assert.equal(response.status, 403);
    assert.equal(response.body.error, "This account cannot apply.");
    assert.deepEqual(db.reads, []);
    assert.deepEqual(db.writes, []);
  });

  test("an account still waiting to be approved can reply", async () => {
    world({ uid: "jasmine", role: "pending" });
    const response = await REPLY("coming");
    assert.equal(response.status, 200);
    assert.equal(db.data(appPath("jasmine")).attendance.answer, "coming");
  });

  test("every other kind of account that can hold an application replies the same way", async () => {
    for (const role of ["member", "committee", "admin"]) {
      world({ role });
      const response = await REPLY("coming");
      assert.equal(response.status, 200, role);
      assert.equal(db.data(appPath(me)).attendance.answer, "coming", role);
    }
  });

  test("during a view-as session the reply is refused before anything else", async () => {
    globalThis.__replyBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    const response = await REPLY("cant-make-it");
    assert.equal(response.body.error, "view-as");
    assert.deepEqual(db.reads, []);
    assert.deepEqual(db.writes, []);
  });
});

// ---------------------------------------------------------------------------
// The body, before any read
// ---------------------------------------------------------------------------

describe("a request that is not one of the four replies", () => {
  const junk = [
    ["no body", undefined],
    ["an empty object", {}],
    ["not JSON", "coming"],
    ["an array", ["coming"]],
    ["a word this page does not send", { reply: "accept" }],
    ["a name every object carries", { reply: "constructor" }],
    ["a list", { reply: ["coming"] }],
    ["an object", { reply: { answer: "coming" } }],
    ["a number", { reply: 1 }],
    ["the right word under the wrong key", { answer: "coming" }],
  ];

  for (const [name, body] of junk) {
    test(`${name} is a 400 before any document is read`, async () => {
      const response = await route.POST(request(body), ctx());
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "That reply was not one this page sends. Reload the page and try again.");
      assert.deepEqual(db.reads, []);
      assert.deepEqual(db.writes, []);
    });
  }

  test("the same 400 whatever form the address names, so a bad body learns nothing about a form", async () => {
    for (const id of [ROUND, "nothing-here__00000000", "constructor"]) {
      const response = await route.POST(request({}), ctx(id));
      assert.equal(response.status, 400, id);
    }
    assert.deepEqual(db.reads, []);
  });
});

// ---------------------------------------------------------------------------
// Which form
// ---------------------------------------------------------------------------

describe("a form that is not there to be answered", () => {
  test("an id that addresses nothing, a round of the older kind and an id that is not one all answer the same 404", async () => {
    db.seed("admissionRounds/older__00000001", { kind: "enrolment", label: "An older round", status: "settled" });
    db.seed(appPath(me, "older__00000001"), { roundId: "older__00000001", uid: me, status: "accepted" });
    const answers = [];
    for (const id of ["nothing-here__00000000", "older__00000001", "constructor", "__proto__", "a.b", "has space"]) {
      const response = await REPLY("coming", id);
      assert.equal(response.status, 404, id);
      answers.push(JSON.stringify(response.body));
    }
    assert.deepEqual([...new Set(answers)], [JSON.stringify({ error: store.FORM_NOT_FOUND })]);
    assert.deepEqual(db.writes, []);
  });

  for (const [name, hidden] of [["a draft", { status: "draft" }], ["archived", { archived: true }]]) {
    test(`${name} form: a caller with no application on it gets that same 404`, async () => {
      world({ roundOverrides: hidden, mine: false });
      const response = await REPLY("coming");
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { error: store.FORM_NOT_FOUND });
      assert.deepEqual(db.writes, []);
    });

    test(`${name} form: somebody who applied on it can still reply, as they can still read their page`, async () => {
      world({ roundOverrides: hidden });
      const response = await REPLY("coming");
      assert.equal(response.status, 200);
      assert.equal(db.data(appPath(me)).attendance.answer, "coming");
    });
  }

  test("on a form that is there, a caller with no application is told so", async () => {
    world({ mine: false });
    const response = await REPLY("coming");
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: record.NO_APPLICATION });
    assert.deepEqual(db.writes, []);
  });
});

// ---------------------------------------------------------------------------
// Whose
// ---------------------------------------------------------------------------

describe("the application is the session's own", () => {
  test("the only documents read are the form and the caller's own application", async () => {
    await REPLY("coming");
    assert.deepEqual([...new Set(db.reads)].sort(), [appPath(me), ROUND_PATH].sort());
  });

  test("somebody else's application is never written, whatever the caller replies", async () => {
    const before = JSON.stringify(db.data(appPath("ben")));
    for (const reply of replies.REPLIES) await REPLY(reply);
    assert.equal(JSON.stringify(db.data(appPath("ben"))), before);
    assert.equal(db.writes.some((write) => write.path === appPath("ben")), false);
  });

  test("a caller with no application cannot answer somebody else's invitation", async () => {
    // Ben is invited and has not answered. The caller has nothing.
    world({ mine: false });
    for (const reply of replies.REPLIES) {
      const response = await REPLY(reply);
      assert.equal(response.status, 404, reply);
    }
    assert.equal(db.data(appPath("ben")).invitation.response, null);
    assert.deepEqual(db.writes, []);
    assert.equal(db.reads.includes(appPath("ben")), false);
  });

  test("nothing in the request can name another person's document", async () => {
    world({ state: STATES["nothing published"] });
    const response = await route.POST(
      request({ reply: "accept-invitation", uid: "ben", roundId: ROUND, applicationId: `${ROUND}__ben` }),
      ctx(),
    );
    assert.equal(response.status, 409);
    assert.equal(db.data(appPath("ben")).invitation.response, null);
    assert.equal(db.reads.includes(appPath("ben")), false);
  });

  test("no decision and no review is read, and none of the committee's work comes back", async () => {
    const response = await REPLY("coming");
    assert.equal(db.reads.some((path) => /admissionDecisions|admissionReviews/.test(path)), false);
    assert.equal(JSON.stringify(response.body).includes(MARK), false);
  });
});

// ---------------------------------------------------------------------------
// Every state, every reply
// ---------------------------------------------------------------------------

/** What a recorded reply leaves behind: [status, attendance, invitation response, counters that moved]. */
const WROTE = {
  coming: ["accepted", "coming", undefined, {}],
  giveBack: ["withdrawn", "cant-make-it", undefined, { accepted: -1, withdrawn: 1 }],
  accept: ["accepted", undefined, "accepted", { invited: -1, accepted: 1 }],
  noThanks: ["withdrawn", undefined, "declined", { invited: -1, withdrawn: 1 }],
};
const SAME = "unchanged";
const no = (key) => replies.REPLY_REFUSALS[key];

/** state -> [coming, cant-make-it, accept-invitation, decline-invitation] */
const TABLE = {
  "nothing published": [no("waiting"), no("waiting"), no("waiting"), no("waiting")],
  "a draft": [no("waiting"), no("waiting"), no("waiting"), no("waiting")],
  "withdrawn before decision day": [no("withdrawn"), no("withdrawn"), no("withdrawn"), no("withdrawn")],
  "placed, nothing said": [WROTE.coming, WROTE.giveBack, no("placeNotInvitation"), no("placeNotInvitation")],
  "placed, said coming": [SAME, WROTE.giveBack, no("placeNotInvitation"), no("placeNotInvitation")],
  "placed, gave it back": [no("gaveBack"), SAME, no("placeNotInvitation"), no("placeNotInvitation")],
  "invited, not answered": [no("invitationFirst"), no("invitationFirst"), WROTE.accept, WROTE.noThanks],
  "invited, accepted": [SAME, WROTE.giveBack, SAME, no("alreadyAccepted")],
  "invited, accepted, then gave it back": [no("gaveBack"), SAME, no("gaveBack"), SAME],
  "invited, said no thanks": [no("gaveBack"), SAME, no("gaveBack"), SAME],
  "no offer": [no("noPlace"), no("noPlace"), no("noPlace"), no("noPlace")],
  declined: [no("noPlace"), no("noPlace"), no("noPlace"), no("noPlace")],
};

describe("every state of an application, against every reply", () => {
  test("the table names every state and every reply", () => {
    assert.deepEqual(Object.keys(TABLE).sort(), Object.keys(STATES).sort());
    for (const row of Object.values(TABLE)) assert.equal(row.length, replies.REPLIES.length);
  });

  for (const [name, state] of Object.entries(STATES)) {
    replies.REPLIES.forEach((reply, at) => {
      const expected = TABLE[name][at];

      test(`${name}: ${reply}`, async () => {
        world({ state });
        const before = db.data(appPath(me));
        const stored = snapshot();
        const response = await REPLY(reply);

        if (typeof expected === "string" && expected !== SAME) {
          // Refused, in a sentence, and nothing at all was written.
          assert.equal(response.status, 409);
          assert.deepEqual(response.body, { error: expected });
          assert.equal(snapshot(), stored);
          assert.deepEqual(db.writes, []);
          return;
        }

        assert.equal(response.status, 200);
        assert.equal(response.body.ok, true);

        if (expected === SAME) {
          // Said already: not an error, and not a write.
          assert.equal(response.body.changed, false);
          assert.equal(snapshot(), stored);
          assert.deepEqual(db.writes, []);
          return;
        }

        const [status, attendance, invitationResponse, moved] = expected;
        const after = db.data(appPath(me));
        assert.equal(response.body.changed, true);
        assert.equal(after.status, status);
        if (attendance) {
          assert.equal(after.attendance.answer, attendance);
          assert.ok(after.attendance.answeredAt instanceof Date);
        } else {
          assert.deepEqual(after.attendance, before.attendance);
        }
        if (invitationResponse) {
          assert.equal(after.invitation.response, invitationResponse);
          assert.ok(after.invitation.respondedAt instanceof Date);
          // The rest of the invitation is decision day's, and is left as it was.
          assert.equal(after.invitation.programmeId, before.invitation.programmeId);
          assert.equal(after.invitation.replyBy, before.invitation.replyBy);
          assert.equal(after.invitation.lastReminderOn, before.invitation.lastReminderOn);
        } else {
          assert.deepEqual(after.invitation, before.invitation);
        }
        // What decision day told them never changes, and nor does what they wrote.
        assert.deepEqual(after.result, before.result);
        assert.deepEqual(after.sent, before.sent);
        assert.deepEqual(after.draft, before.draft);
        assert.equal(after.email, before.email);
        assert.ok(after.updatedAt > before.updatedAt);
        if (status === "withdrawn") assert.ok(after.withdrawnAt instanceof Date);
        else assert.equal(after.withdrawnAt, before.withdrawnAt);

        // The counters move with the status, by exactly this much, and in the same commit.
        const expectedCounts = { ...COUNTS };
        for (const [key, by] of Object.entries(moved)) expectedCounts[key] += by;
        assert.deepEqual(counts(), expectedCounts);
        assert.equal(Object.values(counts()).reduce((sum, each) => sum + each, 0), Object.values(COUNTS).reduce((sum, each) => sum + each, 0));
        assert.equal(db.commits, 1, "one transaction");
        const paths = db.writes.map((write) => write.path).sort();
        assert.deepEqual(paths, Object.keys(moved).length > 0 ? [ROUND_PATH, appPath(me)].sort() : [appPath(me)]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// What a write is made of
// ---------------------------------------------------------------------------

describe("what is written, field by field", () => {
  const fieldsOf = (path) => db.writes.filter((write) => write.path === path).flatMap((write) => write.fields);

  test("I’m coming writes the reply and the time, and moves nothing", async () => {
    await REPLY("coming");
    assert.deepEqual(fieldsOf(appPath(me)), ["attendance", "updatedAt"]);
    assert.deepEqual(fieldsOf(ROUND_PATH), []);
    assert.deepEqual(counts(), COUNTS);
  });

  test("I can’t make it writes the reply, the status and when it was withdrawn, with the counters", async () => {
    await REPLY("cant-make-it");
    assert.deepEqual(fieldsOf(appPath(me)), ["attendance", "status", "updatedAt", "withdrawnAt"]);
    assert.deepEqual(fieldsOf(ROUND_PATH), ["applicationCounts.accepted", "applicationCounts.withdrawn", "updatedAt"]);
  });

  test("accepting an invitation writes two fields of the invitation by path, never the map", async () => {
    world({ state: STATES["invited, not answered"] });
    await REPLY("accept-invitation");
    assert.deepEqual(fieldsOf(appPath(me)), ["invitation.respondedAt", "invitation.response", "status", "updatedAt"]);
    assert.deepEqual(fieldsOf(ROUND_PATH), ["applicationCounts.accepted", "applicationCounts.invited", "updatedAt"]);
  });

  test("no thanks writes the same two fields, and takes the application out of the term", async () => {
    world({ state: STATES["invited, not answered"] });
    await REPLY("decline-invitation");
    assert.deepEqual(fieldsOf(appPath(me)), ["invitation.respondedAt", "invitation.response", "status", "updatedAt", "withdrawnAt"]);
    assert.deepEqual(fieldsOf(ROUND_PATH), ["applicationCounts.invited", "applicationCounts.withdrawn", "updatedAt"]);
  });

  test("no reply ever writes the result, the sent copy, the email or the name", async () => {
    for (const [state, reply] of [
      ["placed, nothing said", "coming"],
      ["placed, nothing said", "cant-make-it"],
      ["invited, not answered", "accept-invitation"],
      ["invited, not answered", "decline-invitation"],
      ["invited, accepted", "cant-make-it"],
    ]) {
      world({ state: STATES[state] });
      await REPLY(reply);
      for (const field of fieldsOf(appPath(me))) {
        assert.equal(/^(result|sent|draft|email|displayName|uid|roundId|formVersion)\b/.test(field), false, `${state}: ${reply} wrote ${field}`);
      }
    }
  });

  test("somebody who said coming and then cannot make it ends withdrawn, with the place counted once", async () => {
    await REPLY("coming");
    const second = await REPLY("cant-make-it");
    assert.equal(second.status, 200);
    assert.equal(db.data(appPath(me)).status, "withdrawn");
    assert.deepEqual(counts(), { ...COUNTS, accepted: COUNTS.accepted - 1, withdrawn: 1 });
    // And then cannot take it again.
    const third = await REPLY("coming");
    assert.equal(third.status, 409);
    assert.deepEqual(third.body, { error: replies.REPLY_REFUSALS.gaveBack });
    assert.deepEqual(counts(), { ...COUNTS, accepted: COUNTS.accepted - 1, withdrawn: 1 });
  });

  test("an invitation accepted, then given back: the acceptance stays on the record", async () => {
    world({ state: STATES["invited, not answered"] });
    await REPLY("accept-invitation");
    await REPLY("cant-make-it");
    const after = db.data(appPath(me));
    assert.equal(after.invitation.response, "accepted");
    assert.equal(after.attendance.answer, "cant-make-it");
    assert.equal(after.status, "withdrawn");
    assert.deepEqual(counts(), { ...COUNTS, invited: COUNTS.invited - 1, withdrawn: 1 });
  });

  test("pressing the same button twice moves the counters once", async () => {
    world({ state: STATES["invited, not answered"] });
    await REPLY("accept-invitation");
    const again = await REPLY("accept-invitation");
    assert.equal(again.status, 200);
    assert.equal(again.body.changed, false);
    assert.deepEqual(counts(), { ...COUNTS, invited: COUNTS.invited - 1, accepted: COUNTS.accepted + 1 });
    assert.equal(db.commits, 1);
  });

  test("a status the counters have no row for is counted from zero, never left as not-a-number", async () => {
    world({ roundOverrides: { applicationCounts: { accepted: 1 } } });
    await REPLY("cant-make-it");
    assert.deepEqual(counts(), { accepted: 0, withdrawn: 1 });
  });
});

// ---------------------------------------------------------------------------
// The reply-by day, through the route
// ---------------------------------------------------------------------------

describe("an invitation whose day to reply by has passed", () => {
  const late = invitedTo(null, { invitation: { programmeId: TAIS, replyBy: "2020-10-25", response: null, respondedAt: null, lastReminderOn: null } });

  test("can still be accepted: the day is shown, and is not a wall", async () => {
    assert.equal(replies.REPLY_BY_IS_A_DEADLINE, false);
    world({ state: late });
    const response = await REPLY("accept-invitation");
    assert.equal(response.status, 200);
    assert.equal(db.data(appPath(me)).invitation.response, "accepted");
  });

  test("and can be turned down", async () => {
    world({ state: late });
    const response = await REPLY("decline-invitation");
    assert.equal(response.status, 200);
    assert.equal(db.data(appPath(me)).status, "withdrawn");
  });
});

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

describe("the answer is the caller's own application, as an applicant may know it", () => {
  test("exactly the fields of the applicant's projection, with the reply on it", async () => {
    world({ state: STATES["invited, not answered"] });
    const response = await REPLY("accept-invitation");
    assert.deepEqual(Object.keys(response.body).sort(), ["application", "changed", "ok"]);
    assert.deepEqual(Object.keys(response.body.application).sort(), [
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
    assert.equal(response.body.application.status, "accepted");
    assert.deepEqual(Object.keys(response.body.application.invitation).sort(), ["programmeId", "replyBy", "respondedAt", "response"]);
    assert.equal(response.body.application.invitation.response, "accepted");
    // The reminder job's own bookkeeping, the stored email and the stored name stay behind.
    const sent = JSON.stringify(response.body);
    assert.equal(sent.includes("lastReminderOn"), false);
    assert.equal(sent.includes(`${me}@example.com`), false);
    assert.equal(sent.includes("displayName"), false);
  });
});

// ---------------------------------------------------------------------------
// Throttles
// ---------------------------------------------------------------------------

describe("replies are throttled per account and per address", () => {
  test("one account gets a bounded number in the window, and a refused one writes nothing", async () => {
    const limit = requests.APPLICANT_RATE_LIMITS.sendUidMax;
    for (let i = 0; i < limit; i += 1) assert.notEqual((await REPLY("coming")).status, 429);
    const writesBefore = db.writes.length;
    const refused = await REPLY("cant-make-it");
    assert.equal(refused.status, 429);
    assert.equal(refused.body.error, requests.TOO_MANY_ATTEMPTS);
    assert.ok(Number(refused.headers["Retry-After"]) > 0);
    assert.equal(db.writes.length, writesBefore);
    assert.equal(db.data(appPath(me)).status, "accepted");
  });

  test("one address is throttled before the session is looked up", async () => {
    const limit = requests.APPLICANT_RATE_LIMITS.sendIpMax;
    signIn(null);
    for (let i = 0; i < limit; i += 1) assert.equal((await REPLY("coming", ROUND, { ip: "10.9.9.9" })).status, 401);
    assert.equal((await REPLY("coming", ROUND, { ip: "10.9.9.9" })).status, 429);
    assert.deepEqual(db.reads, []);
  });
});

// ---------------------------------------------------------------------------
// The handler, as the guards read it
// ---------------------------------------------------------------------------

describe("the handler is written the way the guards read it", () => {
  const source = readFileSync(join(REPO_ROOT, "src", ROUTE), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const recordCode = readFileSync(join(REPO_ROOT, "src", "lib", "applications", "status", "record.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  test("an exported async function whose first statement is the view-as guard", () => {
    assert.match(code, /export async function POST\(req: Request, ctx: Ctx\) \{\s+const blocked = await assertNotImpersonating\(\);\s+if \(blocked\) return blocked;/);
    assert.equal(/export const (GET|POST|PUT|PATCH|DELETE)\b/.test(code), false);
    assert.equal(/export async function (GET|PUT|PATCH|DELETE)\b/.test(code), false, "the reply route only takes a POST");
  });

  test("the gate comes before the body, and the body before any read", () => {
    const gate = code.indexOf("await requireApplicant()");
    const body = code.indexOf("await readJsonBody(req)");
    const refusal = code.indexOf("if (!isReply(reply))");
    const firstRead = code.indexOf("await loadForm(");
    assert.ok(gate !== -1 && body !== -1 && refusal !== -1 && firstRead !== -1);
    assert.ok(gate < body && body < refusal && refusal < firstRead);
    assert.ok(code.indexOf("await recordReply(") > firstRead);
  });

  test("it reads through the applicant-safe half of the data layer and nothing of the committee's", () => {
    for (const each of [code, recordCode]) {
      assert.equal(/staffRepo|admissionDecisions|admissionReviews|DECISIONS_COLLECTION|REVIEWS_COLLECTION/.test(each), false);
    }
    assert.match(code, /from "@\/lib\/applications\/repo";/);
    assert.match(recordCode, /from "\.\.\/repo";/);
  });

  test("it emails nobody and approves no account", () => {
    for (const each of [code, recordCode]) {
      assert.equal(/sendEmail|@\/lib\/email|@\/emails\/|approve|collection\("users"\)|\.auth\(\)/i.test(each), false);
    }
  });

  test("every write is inside the one transaction, on the caller's own document and the form's counters", () => {
    assert.equal((recordCode.match(/db\.runTransaction\(/g) ?? []).length, 1);
    assert.equal(/\.set\(|\.create\(|\.delete\(|batch\(/.test(recordCode), false);
    const updates = [...recordCode.matchAll(/tx\.update\((\w+),/g)].map((found) => found[1]).sort();
    assert.deepEqual(updates, ["appRef", "roundRef"]);
    assert.match(recordCode, /const appRef = applicationRef\(db, roundId, uid\);/);
    assert.equal(/\.update\(/.test(code), false, "the route file writes nothing itself");
  });

  test("the answer is built field by field from the applicant's projection", () => {
    assert.match(code, /application: mine \? projectApplicationForOwner\(mine\) : null,/);
    assert.equal(/\.\.\.\s*(mine|form|recorded|application)\b/.test(code), false, "the route spreads a stored document");
    assert.equal(/\.data\(\)/.test(code), false);
  });
});
