/**
 * The application form editor's routes, executed against an in-memory
 * Firestore, as every kind of person who might call them.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The committee edits one application form a term through six route files
 * under `src/app/api/admissions/forms`. The form, its question sets and each
 * programme's settings are closed to the browser, so these handlers are the
 * whole boundary, and each rule the editor promises is asked of them here by
 * calling them:
 *
 *  1. WHO MAY. An admin edits the form and its question sets. A programme's
 *     lead edits that programme's settings and names its reviewers. A
 *     reviewer reads and changes nothing. Everybody else, including an
 *     SU-recognised committee member named nowhere, is told there is nothing
 *     here, in the same words whether or not there is.
 *  2. THE LOCK. Once anybody has sent an application a question set cannot be
 *     edited, reordered, added to or deleted, and that is decided from the
 *     round's own counts inside the transaction that writes, so a send that
 *     lands while a set is being saved is honoured.
 *  3. SCORED IS FOR STREAMS. A body that scores a question in a general or a
 *     facilitator set is refused.
 *  4. IDS ARE MINTED. Whatever id a browser sends for something new is thrown
 *     away, and an address that names something every object has
 *     (`constructor`) finds nothing and writes nothing.
 *  5. TWO EDITORS DO NOT OVERWRITE EACH OTHER. A programme's settings are
 *     written at their own field paths.
 *  6. A FORM IS NEVER OPENED HERE. No route in this tree writes a form's
 *     status, and the older round console refuses to edit a form at all.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler, and everything under `src/lib/applications`
 * including `access.ts`, `roles.ts` and the eligibility bar they ask.
 * Stubbed: `server-only`, `next/server`, the session, the view-as guard, the
 * Admin SDK handle, and the one value `firebase-admin/firestore` supplies.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.__editor = { db: null, user: null, viewAs: false };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body, json: async () => body }; } };",
    ],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {" +
        " serverTimestamp: () => ({ __sentinel: 'now' })," +
        " delete: () => ({ __sentinel: 'delete' })," +
        " increment: (n) => ({ __sentinel: 'increment', n })," +
        " arrayRemove: (...values) => ({ __sentinel: 'arrayRemove', values })," +
        " };" +
        " export class Timestamp {}",
    ],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__editor.db; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__editor.user; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {" +
        " return globalThis.__editor.viewAs ? { status: 403, body: { error: 'view-as' }, json: async () => ({ error: 'view-as' }) } : null; }",
    ],
  ]),
});

const route = (path) => loadTs(join("app", "api", "admissions", "forms", path, "route.ts"));
const forms = await route("");
const form = await route("[roundId]");
const setsRoute = await route(join("[roundId]", "sets"));
const setRoute = await route(join("[roundId]", "sets", "[setId]"));
const programmeRoute = await route(join("[roundId]", "programmes", "[programmeId]"));
const rolesRoute = await route(join("[roundId]", "programmes", "[programmeId]", "roles"));
const rounds = await loadTs(join("lib", "firestore", "admissionRounds.ts"));
/** The writers the routes call, for the cases that have to get past the parser to reach them. */
const write = await loadTs(join("lib", "applications", "editor", "write.ts"));

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

/**
 * Documents by path, with the calls the editor makes: documents and
 * subcollections, a filter or two, `getAll`, a batch, and a transaction that
 * runs again when something it read changed before it committed, which is the
 * property the lock depends on.
 */
function makeDb(seed) {
  const docs = new Map();
  const versions = new Map();
  const stats = { reads: 0, writes: [] };
  const put = (path, data) => {
    docs.set(path, data);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const drop = (path) => {
    docs.delete(path);
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
  const fieldAt = (data, field) => field.split(".").reduce((node, part) => (node == null ? undefined : node[part]), data);
  const matches = (data, [field, op, value]) => {
    const found = fieldAt(data, field);
    if (op === "==") return found === value;
    if (op === "in") return value.includes(found);
    if (op === "array-contains") return Array.isArray(found) && found.includes(value);
    throw new Error(`the test database does not know the operator ${op}`);
  };
  const query = (collectionPath, filters) => ({
    path: collectionPath,
    isQuery: true,
    where: (field, op, value) => query(collectionPath, [...filters, [field, op, value]]),
    get: async () => {
      stats.reads += 1;
      return {
        docs: childrenOf(collectionPath)
          .filter((path) => filters.every((filter) => matches(docs.get(path), filter)))
          .map(snap),
      };
    },
  });
  function docRef(path) {
    return {
      id: last(path),
      path,
      get: async () => read(path),
      collection: (name) => collection(`${path}/${name}`),
    };
  }
  function collection(path) {
    return { ...query(path, []), doc: (id) => docRef(`${path}/${id}`) };
  }

  const resolve = (value, current) => {
    if (value && value.__sentinel === "now") return new Date("2026-10-05T12:00:00Z");
    if (value && value.__sentinel === "increment") return (typeof current === "number" ? current : 0) + value.n;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const out = {};
      for (const [key, inner] of Object.entries(value)) out[key] = resolve(inner, undefined);
      return out;
    }
    return value;
  };
  const applyUpdate = (path, patch) => {
    if (!docs.has(path)) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    const next = structuredClone(docs.get(path));
    for (const [field, value] of Object.entries(patch)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) {
        if (!Object.hasOwn(node, part) || typeof node[part] !== "object" || node[part] === null) node[part] = {};
        node = node[part];
      }
      const key = parts[parts.length - 1];
      if (value && value.__sentinel === "delete") delete node[key];
      else node[key] = resolve(value, node[key]);
    }
    put(path, next);
  };
  const applyCreate = (path, data) => {
    if (docs.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path}`), { code: 6 });
    put(path, resolve(data, undefined));
  };
  const apply = (writes) => {
    for (const [kind, path, data] of writes) {
      stats.writes.push([kind, path, data ? Object.keys(data) : []]);
      if (kind === "update") applyUpdate(path, data);
      else if (kind === "create") applyCreate(path, data);
      else if (kind === "delete") drop(path);
    }
  };

  const db = {
    stats,
    /** Runs once, after a transaction's function returns and before it commits. */
    beforeCommit: null,
    collection,
    getAll: async (...refs) => refs.map((ref) => read(ref.path)),
    batch() {
      const writes = [];
      return {
        create: (ref, data) => writes.push(["create", ref.path, data]),
        update: (ref, data) => writes.push(["update", ref.path, data]),
        commit: async () => apply(writes),
      };
    },
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const seen = new Map();
        const writes = [];
        const tx = {
          get: async (target) => {
            const result = await target.get();
            if (target.isQuery) {
              seen.set(`list:${target.path}`, childrenOf(target.path).join("|"));
              for (const doc of result.docs) seen.set(doc.ref.path, versions.get(doc.ref.path) ?? 0);
            } else {
              seen.set(target.path, versions.get(target.path) ?? 0);
            }
            return result;
          },
          update: (ref, data) => writes.push(["update", ref.path, data]),
          create: (ref, data) => writes.push(["create", ref.path, data]),
          delete: (ref) => writes.push(["delete", ref.path]),
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
        apply(writes);
        return result;
      }
      throw new Error("the transaction never settled");
    },
    read: (path) => docs.get(path),
    paths: () => [...docs.keys()],
    /** A change made by somebody else, outside any request under test. */
    poke: (path, patch) => applyUpdate(path, patch),
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
  claudia: session("claudia", "committee", true),
  lloyd: session("lloyd", "committee", true),
  /** SU-recognised committee, named nowhere on the form. */
  yusuf: session("yusuf", "committee", true),
  priya: session("priya", "member"),
  jasmine: session("jasmine", "pending"),
};
const EVERYBODY = [...Object.keys(CAST), "nobody"];

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
  draft: 0,
  submitted: 0,
  accepted: 0,
  "fellowship-offered": 0,
  waitlisted: 0,
  rejected: 0,
  withdrawn: 0,
  appointed: 0,
  invited: 0,
  "no-offer": 0,
  declined: 0,
};

function seed({ counts = {}, round = {} } = {}) {
  const userDoc = (uid, extra = {}) => ({
    role: CAST[uid].role,
    suRecognised: CAST[uid].suRecognised,
    displayName: uid === "zach" ? "Zach Levin" : uid[0].toUpperCase() + uid.slice(1),
    email: `${uid}@example.com`,
    profile: { preferredName: uid[0].toUpperCase() + uid.slice(1), motivation: "" },
    ...extra,
  });
  const set = (data) => ({ roundId: ROUND, intro: "", ...data });
  return {
    [ROUND_PATH]: {
      formVersion: 2,
      kind: "enrolment",
      label: "Autumn 2026",
      slug: "autumn-2026",
      status: "draft",
      opensAt: new Date("2026-10-06T08:00:00Z"),
      closesAt: new Date("2026-10-18T22:59:00Z"),
      decisionsByDate: "2026-10-23",
      invitationReplyBy: "2026-10-25",
      stageIds: [],
      reviewerUids: ["zach", "claudia", "lloyd"],
      finalDeciderUid: null,
      applicationCounts: { ...COUNTS, ...counts },
      archived: false,
      authorUid: "zach",
      programmeIds: [TAIS, AGI, INC],
      programmes: {
        [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "zach" }),
        [AGI]: programme({
          name: "AGI Strategy Fellowship",
          shortName: "AGI Strategy",
          places: 32,
          groupCount: 4,
          leadUid: "claudia",
          reviewerUids: ["lloyd"],
        }),
        [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", places: 12, leadUid: "zach" }),
      },
      questionSetIds: ["fellowships", AGI, "incubator", "facilitator"],
      asksFacilitating: true,
      createdAt: new Date("2026-10-01T09:00:00Z"),
      ...round,
    },
    [setPath("fellowships")]: set({
      role: "general",
      scope: { type: "kind", kind: "fellowship" },
      label: "Fellowships",
      questions: [question("why"), question("read", { required: false })],
    }),
    [setPath(AGI)]: set({
      role: "stream",
      scope: { type: "programme", programmeId: AGI },
      label: "AGI Strategy",
      questions: [question("event", { scored: true }), question("law", { scored: true })],
    }),
    [setPath("incubator")]: set({
      role: "general",
      scope: { type: "kind", kind: "incubator" },
      label: "Research incubator",
      questions: [],
    }),
    [setPath("facilitator")]: set({
      role: "facilitator",
      scope: { type: "facilitating" },
      label: "Facilitator questions",
      questions: [question("led")],
    }),
    // An older round, which is not an application form.
    "admissionRounds/older-round": { kind: "enrolment", label: "Older", status: "open", reviewerUids: [], finalDeciderUid: null },
    "users/zach": userDoc("zach"),
    "users/claudia": userDoc("claudia", { admissionsReviewer: true }),
    "users/lloyd": userDoc("lloyd", { admissionsReviewer: true }),
    "users/yusuf": userDoc("yusuf"),
    "users/priya": userDoc("priya"),
    "users/jasmine": userDoc("jasmine"),
  };
}

let db;
beforeEach(() => {
  db = makeDb(seed());
  globalThis.__editor = { db, user: null, viewAs: false };
});

const as = (who) => {
  globalThis.__editor.user = who === "nobody" ? null : CAST[who];
};
const request = (body) => ({ json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body) });
const ctx = (params) => ({ params: Promise.resolve(params) });
const stored = () => db.read(ROUND_PATH);
const storedSet = (id) => db.read(setPath(id));

/** Call a handler as somebody. */
async function call(who, handler, params, body) {
  as(who);
  return handler(request(body), ctx(params));
}

/** Every key anywhere in a response body. */
function keysIn(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) keysIn(item, found);
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysIn(inner, found);
    }
  }
  return found;
}

/** Keys of a stored round that no screen is ever handed. */
const NEVER_IN_A_RESPONSE = ["leadUid", "reviewerUids", "applicationCounts", "authorUid", "finalDeciderUid", "email"];

function assertProjected(response, topLevel) {
  assert.deepEqual(Object.keys(response.body).sort(), [...topLevel].sort());
  const keys = keysIn(response.body);
  for (const key of NEVER_IN_A_RESPONSE) {
    assert.ok(!keys.has(key), `the response carries "${key}", which is the stored document's and not a screen's`);
  }
}

// ---------------------------------------------------------------------------
// 1. Who may
// ---------------------------------------------------------------------------

describe("the forms list and a new form", () => {
  test("everybody signed in gets a list, and only people on a form see it", async () => {
    const expected = { zach: 1, claudia: 1, lloyd: 1, yusuf: 0, priya: 0, jasmine: 0 };
    for (const [who, count] of Object.entries(expected)) {
      const response = await call(who, forms.GET);
      assert.equal(response.status, 200, who);
      assert.equal(response.body.forms.length, count, who);
      assert.equal(response.body.canCreate, who === "zach", who);
      assertProjected(response, ["canCreate", "forms"]);
    }
    assert.equal((await call("nobody", forms.GET)).status, 401);
  });

  test("the caller's own role rides on each programme", async () => {
    const roles = async (who) =>
      (await call(who, forms.GET)).body.forms[0].programmes.map((p) => [p.id, p.role]);
    assert.deepEqual(await roles("zach"), [[TAIS, "admin"], [AGI, "admin"], [INC, "admin"]]);
    assert.deepEqual(await roles("claudia"), [[TAIS, null], [AGI, "lead"], [INC, null]]);
    assert.deepEqual(await roles("lloyd"), [[TAIS, null], [AGI, "reviewer"], [INC, null]]);
  });

  test("only an admin makes a form, and it is refused before the body is read", async () => {
    for (const who of ["claudia", "lloyd", "yusuf", "priya", "jasmine"]) {
      const before = db.stats.reads;
      const response = await call(who, forms.POST, undefined, { label: "Spring 2027" });
      assert.equal(response.status, 403, who);
      assert.equal(db.stats.reads, before, `${who} caused a read`);
    }
    assert.equal((await call("nobody", forms.POST, undefined, { label: "Spring 2027" })).status, 401);
    assert.equal((await call("zach", forms.POST, undefined, {})).status, 400);
    assert.equal((await call("zach", forms.POST, undefined, undefined)).status, 400);
  });

  test("a new form is a draft round carrying everything the round's own reader expects", async () => {
    const response = await call("zach", forms.POST, undefined, { label: "Spring 2027" });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body), ["id"]);
    assert.match(response.body.id, /^spring-2027__[0-9a-z]{8}$/);
    const created = db.read(`admissionRounds/${response.body.id}`);

    assert.equal(created.formVersion, 2);
    assert.equal(created.status, "draft", "a form is never made open");
    assert.equal(created.asksFacilitating, true);
    assert.deepEqual(created.availabilityGrid, { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 });
    assert.deepEqual(created.programmeIds, []);
    assert.deepEqual(created.programmes, {});
    assert.equal(created.authorUid, "zach");
    assert.deepEqual(created.stageIds, [], "a form asks through question sets, not stages");
    assert.deepEqual(created.reminderOffsets, [], "the older round's reminders are not this form's");
    assert.equal(created.blind.hideNames, false, "reviewers see who they are reading");

    // Every field the round normaliser reads is on the stored document, so
    // nothing that already reads a round meets a field it has to guess.
    const normalised = rounds.normalizeAdmissionRound(response.body.id, created);
    for (const key of Object.keys(normalised)) {
      if (key === "id") continue;
      assert.ok(key in created, `a new form is stored without "${key}"`);
    }
    assert.deepEqual(normalised.applicationCounts, COUNTS);

    // The facilitator set is on it, empty.
    assert.equal(created.questionSetIds.length, 1);
    const facilitator = db.read(`admissionRounds/${response.body.id}/questionSets/${created.questionSetIds[0]}`);
    assert.deepEqual(
      [facilitator.role, facilitator.scope, facilitator.label, facilitator.questions],
      ["facilitator", { type: "facilitating" }, "Facilitator questions", []],
    );
  });
});

describe("one form, as each person finds it", () => {
  test("people on the form are given it, and nobody else learns whether it exists", async () => {
    for (const who of ["zach", "claudia", "lloyd"]) {
      const response = await call(who, form.GET, { roundId: ROUND });
      assert.equal(response.status, 200, who);
      assertProjected(response, ["form"]);
      assert.equal(response.body.form.canRunTerm, who === "zach");
    }
    const missing = await call("zach", form.GET, { roundId: "no-such-form__00000000" });
    assert.equal(missing.status, 404);
    for (const who of ["yusuf", "priya", "jasmine"]) {
      const response = await call(who, form.GET, { roundId: ROUND });
      assert.deepEqual([response.status, response.body], [404, missing.body], who);
    }
    assert.equal((await call("nobody", form.GET, { roundId: ROUND })).status, 401);
  });

  test("a round that is not an application form is not one here", async () => {
    assert.equal((await call("zach", form.GET, { roundId: "older-round" })).status, 404);
    assert.equal((await call("zach", form.PATCH, { roundId: "older-round" }, { label: "Taken over" })).status, 404);
    assert.equal(db.read("admissionRounds/older-round").label, "Older");
  });

  test("an id that is not shaped like one never names a document", async () => {
    for (const roundId of ["a/b", "..", "a.b", "", "x".repeat(81)]) {
      const before = db.stats.reads;
      assert.equal((await call("zach", form.GET, { roundId })).status, 404, roundId);
      assert.equal(db.stats.reads, before, `"${roundId}" reached the database`);
    }
  });
});

describe("only an admin changes the form and its question sets", () => {
  const ADMIN_ONLY = [
    ["PATCH the form", () => [form.PATCH, { roundId: ROUND }, { label: "Autumn term" }]],
    ["GET the question sets", () => [setsRoute.GET, { roundId: ROUND }]],
    ["POST a question set", () => [setsRoute.POST, { roundId: ROUND }, { label: "Extra", scope: { type: "facilitating" } }]],
    ["PATCH a question set", () => [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { label: "Strategy" }]],
    ["DELETE a question set", () => [setRoute.DELETE, { roundId: ROUND, setId: AGI }]],
  ];

  for (const [name, build] of ADMIN_ONLY) {
    test(`${name}: refused for everybody else, before anything is read`, async () => {
      for (const who of ["claudia", "lloyd", "yusuf", "priya", "jasmine"]) {
        const before = JSON.stringify([...db.paths().map((path) => db.read(path))]);
        const reads = db.stats.reads;
        const [handler, params, body] = build();
        const response = await call(who, handler, params, body);
        assert.equal(response.status, 403, `${who} was answered ${response.status}`);
        assert.equal(db.stats.reads, reads, `${who} caused a read`);
        assert.equal(JSON.stringify([...db.paths().map((path) => db.read(path))]), before, `${who} changed something`);
      }
      const [handler, params, body] = build();
      assert.equal((await call("nobody", handler, params, body)).status, 401);
      const ok = await call("zach", handler, params, body);
      assert.ok(ok.status === 200 || ok.status === 201, `an admin was answered ${ok.status}`);
    });
  }

  test("the editor's own read carries every question, in the form's order", async () => {
    const response = await call("zach", setsRoute.GET, { roundId: ROUND });
    assertProjected(response, ["form", "sets"]);
    assert.deepEqual(response.body.sets.map((set) => [set.id, set.role, set.questions.length]), [
      ["fellowships", "general", 2],
      [AGI, "stream", 2],
      ["incubator", "general", 0],
      ["facilitator", "facilitator", 1],
    ]);
  });
});

describe("a programme's settings are its lead's and an admin's", () => {
  const params = { roundId: ROUND, programmeId: AGI };

  test("who is given the settings", async () => {
    const expected = { zach: 200, claudia: 200, lloyd: 403, yusuf: 404, priya: 404, jasmine: 404, nobody: 401 };
    for (const who of EVERYBODY) {
      const response = await call(who, programmeRoute.GET, params);
      assert.equal(response.status, expected[who], who);
      if (response.status === 200) assertProjected(response, ["programme"]);
    }
    // The lead of one programme has no role on another.
    assert.equal((await call("claudia", programmeRoute.GET, { roundId: ROUND, programmeId: TAIS })).status, 404);
    assert.equal((await call("zach", programmeRoute.GET, { roundId: ROUND, programmeId: "nope" })).status, 404);
  });

  test("a stranger and a missing programme are answered identically", async () => {
    const missing = await call("zach", programmeRoute.GET, { roundId: ROUND, programmeId: "nope" });
    const stranger = await call("yusuf", programmeRoute.GET, params);
    assert.deepEqual([stranger.status, stranger.body], [missing.status, missing.body]);
    const strangerWrite = await call("yusuf", programmeRoute.PATCH, params, { places: 1 });
    assert.deepEqual([strangerWrite.status, strangerWrite.body], [404, missing.body]);
    assert.equal(stored().programmes[AGI].places, 32);
  });

  test("who may change them", async () => {
    const expected = { zach: 200, claudia: 200, lloyd: 403, yusuf: 404, priya: 404, jasmine: 404, nobody: 401 };
    for (const who of EVERYBODY) {
      db = makeDb(seed());
      globalThis.__editor.db = db;
      const response = await call(who, programmeRoute.PATCH, params, { places: 40 });
      assert.equal(response.status, expected[who], who);
      assert.equal(stored().programmes[AGI].places, response.status === 200 ? 40 : 32, who);
    }
  });

  test("the lead is shown as themselves, with the people they could add", async () => {
    const view = (await call("claudia", programmeRoute.GET, params)).body.programme;
    assert.equal(view.role, "lead");
    assert.deepEqual(view.lead, { uid: "claudia", name: "Claudia", you: true });
    assert.deepEqual(view.reviewers, [{ uid: "lloyd", name: "Lloyd", you: false }]);
    // Admins and SU-recognised committee, and nobody else.
    assert.deepEqual(view.candidates.map((candidate) => candidate.uid).sort(), ["claudia", "lloyd", "yusuf", "zach"]);
    assert.equal(view.applications, 0);
  });

  test("closing a programme, and opening it again, is an admin's alone", async () => {
    const refused = await call("claudia", programmeRoute.PATCH, params, { closed: true });
    assert.equal(refused.status, 403);
    assert.equal(stored().programmes[AGI].closed, false);
    // A lead's other changes in the same body do not slip through with it.
    const mixed = await call("claudia", programmeRoute.PATCH, params, { closed: true, places: 99 });
    assert.equal(mixed.status, 403);
    assert.equal(stored().programmes[AGI].places, 32);

    assert.equal((await call("zach", programmeRoute.PATCH, params, { closed: true })).status, 200);
    assert.equal(stored().programmes[AGI].closed, true);
    assert.equal((await call("zach", programmeRoute.PATCH, params, { closed: false })).status, 200);
    assert.equal(stored().programmes[AGI].closed, false);
  });

  test("a malformed body is refused the same way whether or not the programme exists", async () => {
    const real = await call("yusuf", programmeRoute.PATCH, params, {});
    const unreal = await call("yusuf", programmeRoute.PATCH, { roundId: ROUND, programmeId: "nope" }, {});
    assert.deepEqual([real.status, real.body], [400, unreal.body]);
    assert.equal(unreal.status, 400);
  });
});

describe("naming a lead and reviewers goes through the one writer", () => {
  const params = { roundId: ROUND, programmeId: AGI };

  test("a stranger is told there is nothing here, not that only a lead may do this", async () => {
    const missing = await call("zach", rolesRoute.PUT, { roundId: ROUND, programmeId: "nope" }, { reviewerUids: [] });
    assert.equal(missing.status, 404);
    for (const who of ["yusuf", "priya", "jasmine"]) {
      const response = await call(who, rolesRoute.PUT, params, { reviewerUids: [who] });
      assert.deepEqual([response.status, response.body], [404, missing.body], who);
    }
    assert.deepEqual(stored().programmes[AGI].reviewerUids, ["lloyd"]);
    assert.equal((await call("nobody", rolesRoute.PUT, params, { reviewerUids: [] })).status, 401);
  });

  test("a lead adds and removes their own reviewers, and cannot change the lead", async () => {
    const added = await call("claudia", rolesRoute.PUT, params, { reviewerUids: ["lloyd", "yusuf"] });
    assert.equal(added.status, 200);
    assertProjected(added, ["programme"]);
    assert.deepEqual(added.body.programme.reviewers.map((person) => person.name), ["Lloyd", "Yusuf"]);
    assert.deepEqual(stored().programmes[AGI].reviewerUids, ["lloyd", "yusuf"]);
    assert.deepEqual([...stored().reviewerUids].sort(), ["claudia", "lloyd", "yusuf", "zach"], "the round's union follows");
    assert.equal(db.read("users/yusuf").admissionsReviewer, true);

    const lead = await call("claudia", rolesRoute.PUT, params, { leadUid: "lloyd" });
    assert.equal(lead.status, 403);
    assert.equal(stored().programmes[AGI].leadUid, "claudia");
  });

  test("a reviewer changes nothing, and a member cannot be named", async () => {
    assert.equal((await call("lloyd", rolesRoute.PUT, params, { reviewerUids: [] })).status, 403);
    assert.deepEqual(stored().programmes[AGI].reviewerUids, ["lloyd"]);
    const member = await call("zach", rolesRoute.PUT, params, { reviewerUids: ["lloyd", "priya"] });
    assert.equal(member.status, 400);
    assert.match(member.body.error, /Priya/);
    assert.deepEqual(stored().programmes[AGI].reviewerUids, ["lloyd"]);
  });

  test("an admin changes the lead", async () => {
    const response = await call("zach", rolesRoute.PUT, params, { leadUid: "yusuf" });
    assert.equal(response.status, 200);
    assert.equal(stored().programmes[AGI].leadUid, "yusuf");
    assert.equal(response.body.programme.lead.name, "Yusuf");
  });

  test("an empty body is refused before anything is read", async () => {
    const reads = db.stats.reads;
    assert.equal((await call("yusuf", rolesRoute.PUT, params, {})).status, 400);
    assert.equal(db.stats.reads, reads);
  });
});

describe("nothing is written while an admin is viewing as somebody else", () => {
  test("every mutating handler asks the view-as guard first", async () => {
    const mutating = [
      [forms.POST, undefined, { label: "Spring 2027" }],
      [form.PATCH, { roundId: ROUND }, { label: "Autumn term" }],
      [setsRoute.POST, { roundId: ROUND }, { label: "Extra", scope: { type: "facilitating" } }],
      [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { label: "Strategy" }],
      [setRoute.DELETE, { roundId: ROUND, setId: AGI }],
      [programmeRoute.PATCH, { roundId: ROUND, programmeId: AGI }, { places: 1 }],
      [rolesRoute.PUT, { roundId: ROUND, programmeId: AGI }, { reviewerUids: [] }],
    ];
    globalThis.__editor.viewAs = true;
    for (const [handler, params, body] of mutating) {
      const reads = db.stats.reads;
      const response = await call("zach", handler, params, body);
      assert.deepEqual([response.status, response.body], [403, { error: "view-as" }]);
      assert.equal(db.stats.reads, reads, "the guard has to come before any read");
    }
    assert.equal(db.stats.writes.length, 0);
  });
});

describe("a request that addresses nothing, with an empty body", () => {
  // What each handler answers before it has a document to look at: the gate's
  // answer, or the first validation's. An admin and everybody else, and
  // nobody at all.
  const MISSING = {
    roundId: "e2e-missing-roundId",
    setId: "e2e-missing-setId",
    programmeId: "e2e-missing-programmeId",
  };
  const CASES = [
    ["GET the forms", () => forms.GET, 200, 200],
    ["POST a form", () => forms.POST, 400, 403],
    ["GET a form", () => form.GET, 404, 404],
    ["PATCH a form", () => form.PATCH, 400, 403],
    ["GET the sets", () => setsRoute.GET, 404, 403],
    ["POST a set", () => setsRoute.POST, 400, 403],
    ["PATCH a set", () => setRoute.PATCH, 400, 403],
    ["DELETE a set", () => setRoute.DELETE, 404, 403],
    ["GET a programme", () => programmeRoute.GET, 404, 404],
    ["PATCH a programme", () => programmeRoute.PATCH, 400, 400],
    ["PUT a programme's roles", () => rolesRoute.PUT, 400, 400],
  ];

  for (const [name, handler, admin, others] of CASES) {
    test(`${name}: an admin ${admin}, everybody else ${others}, nobody 401`, async () => {
      assert.equal((await call("zach", handler(), MISSING, {})).status, admin, "an admin");
      for (const who of ["claudia", "lloyd", "yusuf", "priya", "jasmine"]) {
        assert.equal((await call(who, handler(), MISSING, {})).status, others, who);
      }
      assert.equal((await call("nobody", handler(), MISSING, {})).status, 401);
      assert.equal(db.stats.writes.length, 0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The lock
// ---------------------------------------------------------------------------

describe("questions lock once anybody has sent an application", () => {
  const LOCKED = "1 person has applied, so the questions are locked.";
  const useLocked = () => {
    db = makeDb(seed({ counts: { submitted: 1 } }));
    globalThis.__editor.db = db;
  };

  test("a set cannot be edited, renamed, reordered, added to or deleted", async () => {
    useLocked();
    const before = structuredClone(storedSet(AGI));
    const attempts = [
      [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [question("law"), question("event")] }],
      [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [] }],
      [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { label: "Strategy" }],
      [setRoute.PATCH, { roundId: ROUND, setId: AGI }, { intro: "New line" }],
      [setRoute.DELETE, { roundId: ROUND, setId: AGI }],
      [setsRoute.POST, { roundId: ROUND }, { label: "Extra", scope: { type: "programme", programmeId: AGI } }],
    ];
    for (const [handler, params, body] of attempts) {
      const response = await call("zach", handler, params, body);
      assert.deepEqual([response.status, response.body.error], [409, LOCKED]);
    }
    assert.deepEqual(storedSet(AGI), before);
    assert.deepEqual(stored().questionSetIds, ["fellowships", AGI, "incubator", "facilitator"]);
  });

  test("the facilitating question locks with them, and a programme's short name with it", async () => {
    useLocked();
    const facilitating = await call("zach", form.PATCH, { roundId: ROUND }, { asksFacilitating: false });
    assert.equal(facilitating.status, 409);
    assert.ok(facilitating.body.error.startsWith(LOCKED));
    assert.equal(stored().asksFacilitating, true);

    const short = await call("claudia", programmeRoute.PATCH, { roundId: ROUND, programmeId: AGI }, { shortName: "Strategy" });
    assert.equal(short.status, 409);
    assert.equal(stored().programmes[AGI].shortName, "AGI Strategy");
  });

  test("what is not a question stays editable: the name, the places, the dates, the scores switch", async () => {
    useLocked();
    const settings = await call(
      "claudia",
      programmeRoute.PATCH,
      { roundId: ROUND, programmeId: AGI },
      { name: "AGI Strategy", pitch: "Shorter.", places: 30, useScores: false, shortName: "AGI Strategy" },
    );
    assert.equal(settings.status, 200);
    assert.equal(settings.body.programme.lockedSentence, LOCKED);
    assert.equal(stored().programmes[AGI].places, 30);
    assert.equal(stored().programmes[AGI].useScores, false);
    const dates = await call("zach", form.PATCH, { roundId: ROUND }, { decisions: "2026-10-24", asksFacilitating: true });
    assert.equal(dates.status, 200);
    assert.equal(stored().decisionsByDate, "2026-10-24");
  });

  test("a send that lands while a set is being saved is honoured", async () => {
    // Unlocked when the request starts. Somebody sends before it commits.
    db.beforeCommit = () => db.poke(ROUND_PATH, { "applicationCounts.submitted": 1 });
    const before = structuredClone(storedSet(AGI));
    const response = await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [question("event")] });
    assert.deepEqual([response.status, response.body.error], [409, LOCKED]);
    assert.deepEqual(storedSet(AGI), before, "the save that raced the send wrote nothing");

    db = makeDb(seed());
    globalThis.__editor.db = db;
    db.beforeCommit = () => db.poke(ROUND_PATH, { "applicationCounts.submitted": 1 });
    const removed = await call("zach", setRoute.DELETE, { roundId: ROUND, setId: AGI });
    assert.equal(removed.status, 409);
    assert.ok(db.read(setPath(AGI)), "the delete that raced the send removed nothing");
  });

  test("drafts lock nothing", async () => {
    db = makeDb(seed({ counts: { draft: 30 } }));
    globalThis.__editor.db = db;
    const response = await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [question("event")] });
    assert.equal(response.status, 200);
    assert.equal(storedSet(AGI).questions.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. Scored, and 4. ids
// ---------------------------------------------------------------------------

describe("editing a question set", () => {
  test("scored is refused anywhere but a stream set, and nothing is saved", async () => {
    for (const setId of ["fellowships", "facilitator"]) {
      const before = structuredClone(storedSet(setId));
      const response = await call(
        "zach",
        setRoute.PATCH,
        { roundId: ROUND, setId },
        { questions: [{ text: "Why?", type: "long", scored: true }] },
      );
      assert.equal(response.status, 400, setId);
      assert.match(response.body.error, /aren’t scored/);
      assert.deepEqual(storedSet(setId), before);
    }
    const stream = await call(
      "zach",
      setRoute.PATCH,
      { roundId: ROUND, setId: AGI },
      { questions: [{ text: "Why?", type: "long", scored: true }] },
    );
    assert.equal(stream.status, 200);
    assert.equal(storedSet(AGI).questions[0].scored, true);
  });

  test("a stored question keeps its id through an edit and a reorder", async () => {
    const response = await call(
      "zach",
      setRoute.PATCH,
      { roundId: ROUND, setId: AGI },
      { questions: [{ ...question("law"), text: "Reworded" }, question("event")] },
    );
    assertProjected(response, ["set"]);
    assert.deepEqual(storedSet(AGI).questions.map((q) => [q.id, q.text]), [
      ["law", "Reworded"],
      ["event", "Question event"],
    ]);
  });

  test("whatever id a browser sends for a new question is thrown away", async () => {
    const claimed = ["constructor", "__proto__", "why", "a.b", "programmes", null, undefined];
    const response = await call(
      "zach",
      setRoute.PATCH,
      { roundId: ROUND, setId: AGI },
      { questions: [question("event"), ...claimed.map((id) => ({ ...question("x"), id, text: "What would you change?" }))] },
    );
    assert.equal(response.status, 200);
    const ids = storedSet(AGI).questions.map((q) => q.id);
    assert.equal(ids[0], "event");
    assert.equal(new Set(ids).size, ids.length, "every question has its own id");
    for (const id of ids.slice(1)) {
      assert.match(id, /^what-would-you-change-[0-9a-z]{4}$/, `${id} was not minted from the question's own text`);
      assert.ok(!(id in Object.prototype));
    }
    // What is stored is exactly the model's question, nothing a body added.
    assert.deepEqual(Object.keys(storedSet(AGI).questions[1]).sort(), [
      "help",
      "id",
      "options",
      "optionsFromRanking",
      "required",
      "scored",
      "text",
      "type",
      "wordLimit",
    ]);
  });

  test("a question left out of the list is deleted, and an empty list empties the set", async () => {
    await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [question("law", { scored: true })] });
    assert.deepEqual(storedSet(AGI).questions.map((q) => q.id), ["law"]);
    await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [] });
    assert.deepEqual(storedSet(AGI).questions, []);
  });

  test("a set that is not on this form is not found", async () => {
    for (const setId of ["nope", "constructor", "__proto__", "toString", "a.b"]) {
      assert.equal((await call("zach", setRoute.PATCH, { roundId: ROUND, setId }, { label: "X" })).status, 404, setId);
      assert.equal((await call("zach", setRoute.DELETE, { roundId: ROUND, setId })).status, 404, setId);
    }
    // A set document the form's own order does not list is not the form's.
    db.poke(ROUND_PATH, { questionSetIds: ["fellowships", "incubator", "facilitator"] });
    assert.equal((await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { label: "X" })).status, 404);
  });

  test("a new set is minted its id, placed with its family, and starts empty", async () => {
    const response = await call(
      "zach",
      setsRoute.POST,
      { roundId: ROUND },
      { label: "Technical stream", scope: { type: "programme", programmeId: INC } },
    );
    assert.equal(response.status, 201);
    assertProjected(response, ["form", "id", "sets"]);
    assert.match(response.body.id, /^technical-stream-[0-9a-z]{4}$/);
    assert.deepEqual(stored().questionSetIds, ["fellowships", AGI, "incubator", response.body.id, "facilitator"]);
    const created = storedSet(response.body.id);
    assert.deepEqual([created.role, created.scope, created.questions], ["stream", { type: "programme", programmeId: INC }, []]);
  });

  test("a set cannot be made for a programme the form does not hold", async () => {
    const make = (programmeId) =>
      call("zach", setsRoute.POST, { roundId: ROUND }, { label: "Stray", scope: { type: "programme", programmeId } });
    // A well-formed id the form does not hold gets as far as the form: the
    // writer reads the form's own programmes, finds none, and says so.
    assert.equal((await make("nope")).status, 404, "nope");
    // A name every object carries is not an id at all (`isId`, in the
    // contract's `keys.ts`), so the body is refused where it is read, before
    // any document is: 400 with a sentence, where it used to travel to the
    // writer and be answered 404 there. It is refused sooner, never later.
    const before = db.stats.reads;
    for (const programmeId of ["constructor", "__proto__", "hasOwnProperty", "toString"]) {
      const response = await make(programmeId);
      assert.equal(response.status, 400, programmeId);
      assert.match(response.body.error, /who the question set is for/, programmeId);
    }
    assert.equal(db.stats.reads, before, "a refused body reads nothing");
    assert.deepEqual(stored().questionSetIds, ["fellowships", AGI, "incubator", "facilitator"]);
    assert.deepEqual(db.stats.writes, []);
  });

  test("the writer reads the form's programmes by their own keys, whatever the parser let through", async () => {
    // The parser now stops these names, so the writer is called directly: its
    // own-key lookup is the second of the two rules, and it has to hold on
    // its own for the day a caller reaches it by another road.
    for (const programmeId of ["constructor", "__proto__", "hasOwnProperty", "toString"]) {
      const result = await write.createSet(db, CAST.zach, ROUND, {
        label: "Stray",
        scope: { type: "programme", programmeId },
      });
      assert.deepEqual([result.ok, result.status], [false, 404], programmeId);
    }
    assert.deepEqual(stored().questionSetIds, ["fellowships", AGI, "incubator", "facilitator"]);
    assert.deepEqual(db.stats.writes, []);
  });

  test("deleting a set takes it out of the form's order too", async () => {
    const response = await call("zach", setRoute.DELETE, { roundId: ROUND, setId: "incubator" });
    assert.equal(response.status, 200);
    assertProjected(response, ["form", "sets"]);
    assert.equal(db.read(setPath("incubator")), undefined);
    assert.deepEqual(stored().questionSetIds, ["fellowships", AGI, "facilitator"]);
  });
});

describe("an address that names something every object has finds nothing", () => {
  test("as a programme: nothing is read as one and nothing is written", async () => {
    for (const programmeId of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const params = { roundId: ROUND, programmeId };
      const before = JSON.stringify(stored());
      assert.equal((await call("zach", programmeRoute.GET, params)).status, 404, programmeId);
      assert.equal((await call("zach", programmeRoute.PATCH, params, { places: 5 })).status, 404, programmeId);
      assert.equal((await call("zach", rolesRoute.PUT, params, { leadUid: "zach" })).status, 404, programmeId);
      assert.equal((await call("zach", rolesRoute.PUT, params, { reviewerUids: ["lloyd"] })).status, 404, programmeId);
      assert.equal(JSON.stringify(stored()), before, `${programmeId} changed the form`);
      assert.deepEqual(Object.keys(stored().programmes), [TAIS, AGI, INC]);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Two editors, and the form's own fields
// ---------------------------------------------------------------------------

describe("a programme's settings are written at their own paths", () => {
  test("a save touches only the fields it changes", async () => {
    await call("claudia", programmeRoute.PATCH, { roundId: ROUND, programmeId: AGI }, { places: 40, pitch: "New." });
    const write = db.stats.writes.at(-1);
    assert.deepEqual(write.slice(0, 2), ["update", ROUND_PATH]);
    assert.deepEqual([...write[2]].sort(), [`programmes.${AGI}.pitch`, `programmes.${AGI}.places`, "updatedAt"]);
    assert.deepEqual(stored().programmes[AGI].reviewerUids, ["lloyd"], "the people it names are untouched");
    assert.equal(stored().programmes[AGI].leadUid, "claudia");
  });

  test("two leads saving two programmes at once both keep their change", async () => {
    // While Claudia's save is in flight, the other programme's lead saves.
    db.beforeCommit = () => db.poke(ROUND_PATH, { [`programmes.${TAIS}.places`]: 18 });
    const response = await call("claudia", programmeRoute.PATCH, { roundId: ROUND, programmeId: AGI }, { places: 40 });
    assert.equal(response.status, 200);
    assert.equal(stored().programmes[AGI].places, 40);
    assert.equal(stored().programmes[TAIS].places, 18);
    assert.equal(stored().programmes[TAIS].name, "Technical AI Safety Fellowship");
  });

  test("a wording is stored for one email and cleared again", async () => {
    const params = { roundId: ROUND, programmeId: AGI };
    const saved = await call("claudia", programmeRoute.PATCH, params, {
      emailWording: { accepted: { subject: "Welcome", body: "Hello" } },
    });
    assert.deepEqual(stored().programmes[AGI].emailWording, { accepted: { subject: "Welcome", body: "Hello" } });
    assert.equal(saved.body.programme.emails[0].subject, "Welcome");
    await call("claudia", programmeRoute.PATCH, params, { emailWording: { accepted: null } });
    assert.deepEqual(stored().programmes[AGI].emailWording, {});
  });

  test("two programmes cannot share a short name", async () => {
    const response = await call(
      "zach",
      programmeRoute.PATCH,
      { roundId: ROUND, programmeId: AGI },
      { shortName: "technical ai safety" },
    );
    assert.equal(response.status, 400);
    assert.equal(stored().programmes[AGI].shortName, "AGI Strategy");
  });
});

describe("the form's own fields", () => {
  const patch = (body) => call("zach", form.PATCH, { roundId: ROUND }, body);

  test("its status is never written here, whatever is sent", async () => {
    for (const status of ["open", "closed", "deciding", "settled", "cancelled"]) {
      const response = await patch({ status, label: "Autumn 2026" });
      assert.equal(response.status, 400, status);
    }
    assert.equal(stored().status, "draft");
  });

  test("the dates are held to each other", async () => {
    assert.equal((await patch({ closes: { date: "2026-10-05", time: "23:59" } })).status, 400);
    assert.equal((await patch({ decisions: "2026-10-17" })).status, 400);
    assert.equal((await patch({ replyBy: "2026-10-22" })).status, 400);
    const ok = await patch({
      opens: { date: "2026-11-30", time: "09:00" },
      closes: { date: "2026-12-13", time: "23:59" },
      decisions: "2026-12-18",
      replyBy: "2026-12-20",
    });
    assert.equal(ok.status, 200);
    assertProjected(ok, ["addedProgrammeId", "form"]);
    assert.equal(stored().opensAt.toISOString(), "2026-11-30T09:00:00.000Z");
    assert.equal(stored().closesAt.toISOString(), "2026-12-13T23:59:00.000Z");
    assert.deepEqual([stored().decisionsByDate, stored().invitationReplyBy], ["2026-12-18", "2026-12-20"]);
    assert.equal(ok.body.form.closes.dayAndTime, "Sun 13 Dec, 23:59");
  });

  test("the name changes, and the slug follows it while the form is a draft", async () => {
    await patch({ label: "Autumn term 2026" });
    assert.deepEqual([stored().label, stored().slug], ["Autumn term 2026", "autumn-term-2026"]);
  });

  test("the programme order has to be the form's own programmes", async () => {
    // Too few, and a well-formed id the form does not hold in place of one it
    // does: each is a list of ids, so each reaches the comparison with the
    // form's own list and is refused there.
    assert.equal((await patch({ programmeIds: [AGI, TAIS] })).status, 409);
    assert.equal((await patch({ programmeIds: [AGI, TAIS, "nope"] })).status, 409);
    // A name every object carries is not an id (`isId`, in the contract's
    // `keys.ts`), so a list holding one is not a list of ids. It is refused
    // where the body is read, before any document is: 400, where it used to
    // reach the comparison and be answered 409. Refused sooner, never later.
    const before = db.stats.reads;
    for (const name of ["constructor", "__proto__", "toString"]) {
      const response = await patch({ programmeIds: [AGI, TAIS, name] });
      assert.equal(response.status, 400, name);
      assert.match(response.body.error, /not a list of this form.s programmes/, name);
    }
    assert.equal(db.stats.reads, before, "a refused body reads nothing");
    // The comparison holds on its own too: handed such a list directly, past
    // the parser, the writer still refuses it and writes nothing.
    const direct = await write.changeForm(db, CAST.zach, ROUND, { programmeIds: [AGI, TAIS, "constructor"] });
    assert.deepEqual([direct.ok, direct.status], [false, 409]);
    assert.deepEqual(stored().programmeIds, [TAIS, AGI, INC]);
    assert.deepEqual(db.stats.writes, []);
    assert.equal((await patch({ programmeIds: [AGI, INC, TAIS] })).status, 200);
    assert.deepEqual(stored().programmeIds, [AGI, INC, TAIS]);
  });

  test("adding a programme mints its id and gives it somewhere to put its questions", async () => {
    const response = await patch({ addProgramme: { name: "Governance Fellowship", shortName: "Governance", kind: "fellowship" } });
    assert.equal(response.status, 200);
    const id = response.body.addedProgrammeId;
    assert.match(id, /^governance-[0-9a-z]{4}$/);
    assert.deepEqual(stored().programmeIds, [TAIS, AGI, INC, id]);
    const added = stored().programmes[id];
    assert.deepEqual(
      [added.name, added.shortName, added.kind, added.leadUid, added.reviewerUids, added.closed, added.places],
      ["Governance Fellowship", "Governance", "fellowship", null, [], false, null],
    );
    // The fellowships already have a general set, so only the stream is new,
    // and it sits with the other fellowship sets.
    const order = stored().questionSetIds;
    assert.equal(order.length, 5);
    const streamId = order[2];
    assert.deepEqual(order, ["fellowships", AGI, streamId, "incubator", "facilitator"]);
    assert.deepEqual(
      [storedSet(streamId).role, storedSet(streamId).scope, storedSet(streamId).label],
      ["stream", { type: "programme", programmeId: id }, "Governance"],
    );
    // The other programmes are as they were.
    assert.equal(stored().programmes[AGI].leadUid, "claudia");
  });

  test("the first programme of a kind brings its general set with it", async () => {
    db = makeDb({ ...seed(), [setPath("incubator")]: undefined });
    db.poke(ROUND_PATH, { programmeIds: [TAIS, AGI], questionSetIds: ["fellowships", AGI, "facilitator"] });
    globalThis.__editor.db = db;
    const response = await patch({ addProgramme: { name: "Research Incubator", shortName: "Research incubator", kind: "incubator" } });
    assert.equal(response.status, 200);
    const order = stored().questionSetIds;
    assert.equal(order.length, 5);
    assert.deepEqual([order[0], order[1], order[4]], ["fellowships", AGI, "facilitator"]);
    const [general, stream] = [storedSet(order[2]), storedSet(order[3])];
    assert.deepEqual([general.role, general.label], ["general", "Research incubator"]);
    // Two sections called the same thing would read as one listed twice.
    assert.deepEqual([stream.role, stream.label], ["stream", "Research incubator stream"]);
  });

  test("a refused change writes nothing, even a set it had already planned", async () => {
    const paths = db.paths().length;
    const response = await patch({
      addProgramme: { name: "Governance Fellowship", shortName: "Governance", kind: "fellowship" },
      programmeIds: [AGI, TAIS],
    });
    assert.equal(response.status, 409);
    assert.equal(db.paths().length, paths, "a question set was left behind by a change that was refused");
    assert.deepEqual(Object.keys(stored().programmes), [TAIS, AGI, INC]);
  });

  test("a form takes at most its cap of programmes, and no two with one short name", async () => {
    assert.equal(
      (await patch({ addProgramme: { name: "Another", shortName: "AGI strategy", kind: "fellowship" } })).status,
      400,
    );
    for (let i = 0; i < 5; i += 1) {
      const added = await patch({ addProgramme: { name: `Fellowship ${i}`, kind: "fellowship" } });
      assert.equal(added.status, 200, `programme ${i}`);
    }
    assert.equal(stored().programmeIds.length, 8);
    assert.equal((await patch({ addProgramme: { name: "One too many", kind: "fellowship" } })).status, 400);
  });

  test("switching the facilitating question back on restores a set for its questions", async () => {
    await call("zach", setRoute.DELETE, { roundId: ROUND, setId: "facilitator" });
    await patch({ asksFacilitating: false });
    assert.equal(stored().asksFacilitating, false);
    await patch({ asksFacilitating: true });
    const order = stored().questionSetIds;
    assert.equal(storedSet(order.at(-1)).scope.type, "facilitating");
  });
});

// ---------------------------------------------------------------------------
// 6. A form is never opened here, and the older console never edits one
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

describe("no route in this tree writes a form's status", () => {
  const TREES = ["src/app/api/admissions/forms", "src/lib/applications/editor"];

  test("the only status ever stored by the editor is the draft a new form starts as", () => {
    let files = 0;
    for (const tree of TREES) {
      for (const file of walk(join(REPO_ROOT, tree))) {
        files += 1;
        const source = code(file);
        // A status VALUE: one of the round's own words, written as a string.
        const values = [...source.matchAll(/status:\s*"([a-z-]+)"/g)].map((match) => match[1]);
        assert.deepEqual(
          values.filter((value) => rounds.ADMISSION_ROUND_STATUSES.includes(value) && value !== "draft"),
          [],
          `${rel(file)} stores a form status other than "draft"`,
        );
        assert.ok(
          !/update\.status\b|\[\s*["'`]status["'`]\s*\]\s*=|["'`]status["'`]\s*:/.test(source),
          `${rel(file)} writes a status field`,
        );
      }
    }
    assert.ok(files >= 12, `only ${files} files were read: the trees have moved`);
  });

  test("after every kind of edit the form is still a draft", async () => {
    await call("zach", form.PATCH, { roundId: ROUND }, { label: "Autumn term", asksFacilitating: true });
    await call("zach", setRoute.PATCH, { roundId: ROUND, setId: AGI }, { questions: [question("event")] });
    await call("claudia", programmeRoute.PATCH, { roundId: ROUND, programmeId: AGI }, { places: 30 });
    await call("zach", rolesRoute.PUT, { roundId: ROUND, programmeId: AGI }, { reviewerUids: [] });
    assert.equal(stored().status, "draft");
  });
});

describe("the older round console refuses to edit an application form", () => {
  const OLDER = "src/app/api/admissions/rounds/[roundId]";
  /**
   * Each older mutating handler that could edit a round, and how many it holds.
   *
   * The refusal is the fence's: `refuseApplicationForm` in
   * `src/lib/admissions/formFence.ts` asks the contract's own question of the
   * stored document and answers 409 with the one sentence. These handlers used
   * to spell that out themselves, so this block read the spelling. They make
   * the fence's call now, and the same three things are held of the call: it
   * comes once the round is loaded, before the round is read as one of the
   * older kind, and what it answers is returned. What it answers is executed
   * below. `tests/admissions-form-fence.test.mjs` holds every older handler in
   * the tree to the same and calls each one with a stored form.
   */
  const REFUSING = {
    [`${OLDER}/route.ts`]: ["PATCH"],
    [`${OLDER}/roles/route.ts`]: ["PUT"],
    [`${OLDER}/status/route.ts`]: ["POST"],
    [`${OLDER}/stages/[stageId]/route.ts`]: ["PUT", "DELETE"],
    [`${OLDER}/stages/[stageId]/release/route.ts`]: ["POST"],
  };

  for (const [path, methods] of Object.entries(REFUSING)) {
    test(`${path} refuses in ${methods.join(" and ")}, once the round is loaded and before it is read as a round`, () => {
      const source = code(join(REPO_ROOT, ...path.split("/")));
      assert.match(source, /import \{ refuseApplicationForm \} from "@\/lib\/admissions\/formFence";/);
      for (const method of methods) {
        const start = source.search(new RegExp(`export async function ${method}\\(`));
        assert.ok(start > -1, `${path} has no ${method}`);
        const next = source.slice(start + 1).search(/\nexport async function /);
        const body = next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
        const loaded = body.search(/[Ss]nap\.exists/);
        const refusal = body.indexOf("refuseApplicationForm(");
        const normalised = body.indexOf("normalizeAdmissionRound(");
        assert.ok(loaded > -1 && refusal > loaded, `${method} asks before the round is loaded, or not at all`);
        assert.ok(normalised === -1 || refusal < normalised, `${method} reads the form as a round before it refuses`);
        // The stored document is what is asked, never the round the older
        // normaliser made of it, which has lost the field that says what it is.
        // And the answer is returned: a refusal worked out and dropped refuses
        // nothing.
        assert.match(
          body.slice(body.lastIndexOf("\n", refusal), refusal + 220),
          /\n\s*const (\w+) = refuseApplicationForm\(\w*[Ss]nap\.data\(\)\);\s*if \(\1\) return \1;/,
          `${method} does not return what the fence answers for the stored document`,
        );
        assert.equal(body.split("refuseApplicationForm(").length - 1, 1, `${method} asks more than once`);
      }
    });
  }

  test("what the fence answers is the sentence that says where a form is edited instead", async () => {
    const fence = await loadTs(join("lib", "admissions", "formFence.ts"));
    assert.match(fence.EDITED_IN_THE_APPLICATION_FORM, /application form/);
    const refusal = fence.refuseApplicationForm({ formVersion: 2, label: "Autumn 2026" });
    assert.deepEqual([refusal.status, refusal.body], [409, { error: fence.EDITED_IN_THE_APPLICATION_FORM }]);
    // A round of the older kind is not refused, so the older console still edits it.
    assert.equal(fence.refuseApplicationForm({ kind: "enrolment", label: "Facilitators" }), null);
  });

  test("the sentence is declared once, in the fence, and the editor keeps only the address", async () => {
    const older = await loadTs(join("lib", "applications", "editor", "olderRounds.ts"));
    assert.deepEqual(Object.keys(older), ["applicationFormPath"]);
    assert.equal(older.applicationFormPath(ROUND), `/admin/admissions/forms/${ROUND}`);
    // One spelling in the tree: a second declaration is a second sentence
    // waiting to drift from the first.
    const declares = [];
    for (const file of walk(join(REPO_ROOT, "src"))) {
      if (/\bEDITED_IN_THE_APPLICATION_FORM\s*=/.test(code(file))) declares.push(rel(file));
    }
    assert.deepEqual(declares, ["src/lib/admissions/formFence.ts"]);
  });

  test("the round list sends an application form to its own editor", () => {
    const source = code(join(REPO_ROOT, "src", "features", "admissions", "RoundList.tsx"));
    assert.match(source, /formIds\.has\(round\.id\)\s*\?\s*applicationFormPath\(round\.id\)/);
  });

  test("the older Admissions page links to the application forms, at an address that is a page", () => {
    // The form's own screens are in neither the sidebar nor the admin tabs, so
    // this link is how somebody reaches them without typing an address.
    const source = code(join(REPO_ROOT, "src", "features", "admissions", "RoundList.tsx"));
    assert.match(source, /<Link href="\/admin\/admissions\/forms">Application forms<\/Link>/);
    assert.ok(
      statSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "admissions", "forms", "page.tsx")).isFile(),
      "the link leads to a page that is gone",
    );
  });
});
