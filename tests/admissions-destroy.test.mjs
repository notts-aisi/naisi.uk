/**
 * DESTROYING AN ADMISSION ROUND, executed against a fake Firestore: the
 * engine, the two routes, and the member record the whole thing exists to
 * protect.
 *
 * Run with `npm test` (Node's built-in runner: no browser, no emulator, no
 * credentials, nothing on the wire).
 *
 * ## Why this one is executed rather than pinned
 *
 * A destroy cannot be undone by pressing something else, and this one is
 * allowed to remove an intake ONLY because the part of it that is about a
 * person is copied onto that person first. That promise is not a property of
 * any single document: it is an ORDER of writes across four collections, a
 * refusal that has to happen before the first delete, and a resume that must
 * not lose either. None of that is visible in a source pin, so the requests
 * are made and the store is read afterwards.
 *
 * The seven properties worth the harness, each with the failure it is guarding
 * against:
 *
 *  1. **Records first, and a failing record write aborts.** If the sweep ran
 *     after the deletes, or carried on past a failure, a destroy would quietly
 *     forget somebody. The test asserts the ORDER from the store's own write
 *     log, and that a forced failure leaves every application in place.
 *  2. **The destroy FILLS GAPS rather than rewriting.** A settle records a
 *     reviewer's assessment; that reviewer deletes their account, which deletes
 *     the review; a rewrite at destroy time would replace the entry with one
 *     that has never heard of them. The destroy would then have deleted the
 *     committee reasoning the settle had preserved, which is the exact loss the
 *     record exists to prevent.
 *  3. **A half-destroyed round is MARKED, and its status will not move.** A
 *     destroy runs in pages, and between them the round's status is untouched.
 *     Unmarked, it could be reopened to applicants whose applications the next
 *     resume would delete.
 *  4. **Nothing that is not a deletion appears in the `deleted` map.** The
 *     receipt prints every key of it under "no longer exist"; the member
 *     records must never be listed there.
 *  5. **The blockers are real refusals.** An open round must not be
 *     destroyable, and the refusal must arrive before an audit row is opened,
 *     or a round nobody destroyed would report an interrupted destroy for ever.
 *  6. **The reviewer nav flag clears for the right people only.** It is the
 *     one write that reaches a document belonging to somebody who is not on
 *     this round, and the predicate has to match the roles route's.
 *  7. **A resume finishes the job without double counting.** The budget is
 *     spent deliberately, the second call is the identical call, and the
 *     member-record sweep must not run (or count) twice.
 *  8. **An application form goes whole.** A round that is an application form
 *     keeps question sets under it, a decision document beside each
 *     application and log lines about those decisions. A destroy that left any
 *     of them would leave a judgement about a named applicant in a collection
 *     nothing lists by person. Section 10 seeds a real form, counts it and
 *     reads the store afterwards, and holds the member record written from it
 *     to what the applicant ranked and what decision day told them.
 *
 * WHO IS TESTED: an admin, and then the three personas who are refused. The
 * refusals worth the lines are the NEAR MISSES, not the plain member: an
 * `approveCourse` holder (which is the predicate the sibling status route in
 * this same directory uses) and a reviewer the round itself names.
 *
 * ## What is faked, and what is real
 *
 * The engine, the member-record sync, the audit module, both routes, the
 * status route and every normaliser are the REAL modules. Faked:
 * `next/server`, `firebase-admin/firestore` (sentinels this store
 * interprets), the Admin SDK handle, the session and the impersonation guard.
 * Nothing here can reach a Firestore project, and nothing in this lane sends
 * email at all, so there is no transport to stub.
 *
 * The loader is the shared `tests/lib/tsLoader.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

/** Every `serverTimestamp()` in this file resolves to this instant. */
const STAMP = new Date("2026-09-07T10:00:00Z");

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export const NextResponse = {\n" +
      "  json(body, init) {\n" +
      "    return { status: (init && init.status) || 200, body };\n  },\n};",
  ],
  [
    "firebase-admin/firestore",
    "export const FieldValue = {\n" +
      "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
      "  increment: (by) => ({ __op: 'increment', by }),\n" +
      "  arrayRemove: (...values) => ({ __op: 'arrayRemove', values }),\n" +
      "};\n" +
      "export class Timestamp {\n" +
      "  constructor(ms) { this.ms = ms; }\n" +
      "  static fromMillis(ms) { return new Timestamp(ms); }\n" +
      "  static fromDate(d) { return new Timestamp(d.getTime()); }\n" +
      "  static now() { return new Timestamp(Date.now()); }\n" +
      "  toMillis() { return this.ms; }\n" +
      "  toDate() { return new Date(this.ms); }\n" +
      "}",
  ],
  [
    "@/lib/firebase/admin",
    "export function getAdminDb() {\n  return globalThis.__fakeDb;\n}\n" +
      "export function getAdminStorage() {\n  return null;\n}",
  ],
  [
    "@/lib/firebase/session",
    "export async function getCurrentUser() {\n  return globalThis.__fakeUser;\n}",
  ],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__blocked ?? null;\n}",
  ],
]);

const { loadTs } = createLoader({ stubs: STUBS });

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

/**
 * Paths are `collection/doc/collection/doc`, so a subcollection is a longer
 * path under the same map and a query on a collection matches its DIRECT
 * children only. That is what makes `admissionRounds/r1/stages` a collection
 * the engine can drain without `admissionRounds` itself seeing those rows.
 *
 * The store keeps a WRITE LOG. It is not decoration: the central promise of
 * this feature is an ordering ("the member records are written before
 * anything is deleted"), and an ordering can only be asserted by watching the
 * writes go past.
 */
function makeDb(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  const log = [];
  /**
   * The paths each committed batch deleted, one list per commit. "In the same
   * batch" is a claim about atomicity, and the flat write log above cannot
   * tell one commit from two that ran back to back.
   */
  const batches = [];
  /** Paths whose next write must throw, to force a failure on purpose. */
  const failWrites = new Set();
  let autoId = 0;

  function resolveSentinels(value) {
    if (Array.isArray(value)) return value.map(resolveSentinels);
    if (value instanceof Date) return value;
    // A fake Timestamp is opaque: walking its entries would strip the methods
    // the lease check calls.
    if (value && typeof value === "object" && typeof value.toMillis === "function") {
      return value;
    }
    if (value && typeof value === "object") {
      if ("__op" in value) {
        if (value.__op === "serverTimestamp") return STAMP;
        if (value.__op === "increment") return value.by;
      }
      const out = {};
      for (const [key, v] of Object.entries(value)) out[key] = resolveSentinels(v);
      return out;
    }
    return value;
  }

  /** `deleted.reviews` is a path into a nested map, not a key with a dot. */
  function setPath(target, path, value) {
    const parts = path.split(".");
    let node = target;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part];
    }
    node[parts.at(-1)] = value;
  }

  function readPath(target, path) {
    let node = target;
    for (const part of path.split(".")) {
      if (node === undefined || node === null) return undefined;
      node = node[part];
    }
    return node;
  }

  function guard(path) {
    if (failWrites.has(path)) {
      throw new Error(`fake Firestore: writes to ${path} are failing on purpose`);
    }
  }

  function apply(path, data, { merge = true } = {}) {
    guard(path);
    const before = docs.get(path);
    const next = merge ? { ...(before ?? {}) } : {};
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        typeof value.toMillis !== "function" &&
        "__op" in value
      ) {
        if (value.__op === "serverTimestamp") setPath(next, key, STAMP);
        else if (value.__op === "increment") {
          const current = readPath(next, key);
          setPath(next, key, (typeof current === "number" ? current : 0) + value.by);
        } else if (value.__op === "arrayRemove") {
          const list = readPath(next, key);
          setPath(
            next,
            key,
            Array.isArray(list) ? list.filter((v) => !value.values.includes(v)) : [],
          );
        }
      } else {
        setPath(next, key, resolveSentinels(value));
      }
    }
    docs.set(path, next);
    log.push({ op: before === undefined ? "create" : "write", path });
  }

  function remove(path) {
    guard(path);
    if (docs.delete(path)) log.push({ op: "delete", path });
  }

  function snapshot(path, projection) {
    const data = docs.get(path);
    const project = (raw) => {
      if (!projection) return { ...raw };
      const out = {};
      for (const field of projection) {
        if (raw[field] !== undefined) out[field] = raw[field];
      }
      return out;
    };
    return {
      id: path.split("/").pop(),
      path,
      ref: docRef(path),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : project(data)),
    };
  }

  function docRef(path) {
    return {
      id: path.split("/").pop(),
      path,
      collection: (name) => collectionRef(`${path}/${name}`),
      async get() {
        return snapshot(path);
      },
      async set(data, options) {
        apply(path, data, { merge: options?.merge === true });
      },
      async update(data) {
        if (!docs.has(path)) {
          // Firestore's own behaviour, and the reason the flag sweep filters
          // on existence: an update to a missing document rejects.
          throw new Error(`NOT_FOUND: ${path}`);
        }
        apply(path, data);
      },
      async delete() {
        remove(path);
      },
    };
  }

  function matches(data, filter) {
    const actual = readPath(data ?? {}, filter.field);
    if (filter.op === "in") {
      return Array.isArray(filter.value) && filter.value.includes(actual);
    }
    if (filter.op === "array-contains") {
      return Array.isArray(actual) && actual.includes(filter.value);
    }
    return actual === filter.value;
  }

  function rows(path, filters) {
    const out = [];
    for (const [docPath, data] of docs) {
      if (!docPath.startsWith(`${path}/`)) continue;
      if (docPath.slice(path.length + 1).includes("/")) continue;
      if (!filters.every((f) => matches(data, f))) continue;
      out.push(docPath);
    }
    return out;
  }

  function query(path, filters, max, projection) {
    return {
      where: (field, op, value) =>
        query(path, [...filters, { field, op, value }], max, projection),
      limit: (n) => query(path, filters, n, projection),
      select: (...fields) => query(path, filters, max, fields),
      count: () => ({
        async get() {
          const n = rows(path, filters).length;
          return { data: () => ({ count: n }) };
        },
      }),
      async get() {
        const all = rows(path, filters);
        const page = typeof max === "number" ? all.slice(0, max) : all;
        const snaps = page.map((p) => snapshot(p, projection));
        return { docs: snaps, empty: snaps.length === 0, size: snaps.length };
      },
    };
  }

  function collectionRef(path) {
    return {
      path,
      doc: (id) => docRef(`${path}/${id ?? `auto${(autoId += 1)}`}`),
      ...query(path, [], undefined, undefined),
    };
  }

  const db = {
    docs,
    log,
    batches,
    failWrites,
    collection: collectionRef,
    doc: (path) => docRef(path),
    async getAll(...refs) {
      return refs.map((ref) => snapshot(ref.path));
    },
    batch() {
      const ops = [];
      return {
        set(ref, data, options) {
          ops.push({ kind: "set", ref, data, options });
        },
        update(ref, data) {
          ops.push({ kind: "update", ref, data });
        },
        delete(ref) {
          ops.push({ kind: "delete", ref });
        },
        async commit() {
          // A batch fails WHOLE: an update to a missing document rejects it
          // all, which is the property the reviewer-flag sweep is written
          // against.
          for (const op of ops) {
            if (op.kind === "update" && !docs.has(op.ref.path)) {
              throw new Error(`NOT_FOUND: ${op.ref.path}`);
            }
            if (failWrites.has(op.ref.path)) {
              throw new Error(
                `fake Firestore: writes to ${op.ref.path} are failing on purpose`,
              );
            }
          }
          for (const op of ops) {
            if (op.kind === "delete") remove(op.ref.path);
            else if (op.kind === "update") apply(op.ref.path, op.data);
            else apply(op.ref.path, op.data, { merge: op.options?.merge === true });
          }
          batches.push(ops.filter((op) => op.kind === "delete").map((op) => op.ref.path));
        },
      };
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(ref.path),
        set: (ref, data, options) => writes.push({ kind: "set", ref, data, options }),
        update: (ref, data) => writes.push({ kind: "update", ref, data }),
        delete: (ref) => writes.push({ kind: "delete", ref }),
      };
      // A refusal throws before any write, so a throw must leave the store
      // untouched: writes are collected and applied at the end.
      const result = await fn(tx);
      for (const write of writes) {
        if (write.kind === "delete") remove(write.ref.path);
        else if (write.kind === "update") apply(write.ref.path, write.data);
        else apply(write.ref.path, write.data, { merge: write.options?.merge === true });
      }
      return result;
    },
  };

  /**
   * `upsertApplicationRecord` takes its server-timestamp sentinel off the
   * Firestore CLASS the handle came from (`db.constructor.FieldValue`) rather
   * than value-importing the Admin SDK, so a fake has to carry one.
   */
  Object.defineProperty(db, "constructor", {
    value: { FieldValue: { serverTimestamp: () => ({ __op: "serverTimestamp" }) } },
  });

  return db;
}

// ---------------------------------------------------------------------------
// The modules under test
// ---------------------------------------------------------------------------

const API = join("app", "api", "admissions", "rounds", "[roundId]");
const { POST: destroyRound } = await loadTs(join(API, "destroy", "route.ts"));
const { GET: destroyManifest } = await loadTs(join(API, "destroy-manifest", "route.ts"));
const { POST: setStatus } = await loadTs(join(API, "status", "route.ts"));
const { roundDestroyBlockers, countRoundDestroyTargets } = await loadTs(
  join("lib", "admissions", "destroy.ts"),
);
const { writeRecordsForRound } = await loadTs(
  join("lib", "admissions", "memberRecordSync.ts"),
);
const { normalizeApplicationRecord } = await loadTs(
  join("lib", "firestore", "memberRecords.ts"),
);
const { normalizeAdmissionRound } = await loadTs(
  join("lib", "firestore", "admissionRounds.ts"),
);
const { DECISIONS_COLLECTION } = await loadTs(join("lib", "applications", "staffRepo.ts"));
const { QUESTION_SETS_SUBCOLLECTION } = await loadTs(join("lib", "applications", "model.ts"));
const { COURSE_AUDIT_COLLECTION } = await loadTs(join("lib", "firestore", "courseAudit.ts"));

const NO_PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
};

const ADMIN = { uid: "admin1", role: "admin", displayName: "Ada Admin", suRecognised: true };
const MEMBER = {
  uid: "u1",
  role: "member",
  displayName: "Mo Member",
  suRecognised: false,
  permissions: NO_PERMISSIONS,
};

/**
 * THE TWO NEAR-MISS PERSONAS, and they are the ones worth spending tests on.
 *
 * `MEMBER` has every key false, so a refusal for them tells you almost nothing:
 * it takes the same branch a signed-out caller does. The people who can actually
 * reach this page are the ones to pin.
 *
 *  - `COURSE_AUTHOR` holds `approveCourse`, which is `canAuthorAdmissionRound`
 *    (users.ts) and therefore `canAuthorRounds`. That is the predicate the
 *    STATUS route in this same directory uses, and it is the mistake these two
 *    routes must not make: an author of a round is not somebody who may delete
 *    other people's applications.
 *  - `REVIEWER` is on the round's own `reviewerUids`, so `canSeeRound` lets them
 *    read the applications they are assessing. Reading them is not removing
 *    them.
 */
const COURSE_AUTHOR = {
  uid: "auth1",
  role: "committee",
  displayName: "Cass Author",
  suRecognised: true,
  permissions: { ...NO_PERMISSIONS, draftCourse: true, approveCourse: true },
};
const REVIEWER = {
  uid: "rev1",
  role: "member",
  displayName: "Rae Reviewer",
  suRecognised: false,
  permissions: NO_PERMISSIONS,
};

function ctx(roundId) {
  return { params: Promise.resolve({ roundId }) };
}

function request(body) {
  return {
    url: "https://naisi.uk/api/admissions/rounds/r1/destroy",
    async json() {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  };
}

function manifestRequest(search = "") {
  return { url: `https://naisi.uk/api/admissions/rounds/r1/destroy-manifest${search}` };
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const ROUND_LABEL = "Autumn 2026 intake";

/**
 * One closed round with two applicants, two reviewers and a decider, plus a
 * SECOND round that still names `rev2`. The second round is what makes the
 * flag assertions mean anything: without it every reviewer would clear and
 * the predicate could be "clear everybody" and still pass.
 */
function seedWorld(overrides = {}) {
  const world = {
    "admissionRounds/r1": {
      kind: "enrolment",
      label: ROUND_LABEL,
      slug: "autumn-2026",
      academicYear: "2026/27",
      status: "closed",
      stageIds: ["s1"],
      reviewerUids: ["rev1", "rev2"],
      finalDeciderUid: "dec1",
      criteria: [
        { id: "c1", label: "Motivation", guidance: "" },
        { id: "c2", label: "Fit", guidance: "" },
      ],
      scoreScale: { min: 1, max: 5 },
      programmePreference: {
        enabled: true,
        streams: [{ id: "st1", label: "Technical incubator" }],
        fellowships: [{ id: "f1", label: "Governance fellowship" }],
        maxRankedFellowships: 2,
        offerFellowshipFallback: true,
      },
      applicationCounts: { draft: 1, submitted: 1 },
      authorUid: "admin1",
    },
    "admissionRounds/r1/stages/s1": {
      roundId: "r1",
      label: "The application",
      intro: "",
      questions: [],
      order: 0,
    },
    "admissionRounds/r2": {
      kind: "enrolment",
      label: "Spring 2027 intake",
      status: "draft",
      reviewerUids: ["rev2"],
      finalDeciderUid: null,
      authorUid: "admin1",
    },
    "admissionApplications/r1__u1": {
      roundId: "r1",
      uid: "u1",
      email: "u1@example.com",
      displayName: "Mo Member",
      status: "accepted",
      createdAt: new Date("2026-08-01T09:00:00Z"),
      submittedAt: new Date("2026-08-10T09:00:00Z"),
      programmePreference: {
        streamId: "st1",
        rankedFellowshipIds: ["f1"],
        openToFellowship: true,
      },
      outcome: { decision: "accept", targetRunId: "run1", decidedByUid: "dec1" },
    },
    "admissionApplications/r1__u2": {
      roundId: "r1",
      uid: "u2",
      displayName: "Dee Draft",
      status: "draft",
      createdAt: new Date("2026-08-02T09:00:00Z"),
      programmePreference: { streamId: null, rankedFellowshipIds: [], openToFellowship: false },
    },
    "admissionApplicationPrivate/r1__u1": {
      accessRequirements: "I need a step-free room.",
    },
    "admissionReviews/r1__u1__rev1": {
      roundId: "r1",
      applicantUid: "u1",
      reviewerUid: "rev1",
      scores: { c1: 4, c2: 5 },
      total: 9,
      recommendation: "advance",
      notes: "Strong on the technical side, and clear about why.",
      knowsApplicant: false,
    },
    "admissionReviews/r1__u1__rev2": {
      roundId: "r1",
      applicantUid: "u1",
      reviewerUid: "rev2",
      scores: { c1: 3, c2: 4 },
      total: 7,
      recommendation: "hold",
      notes: "Would want to see more of the governance reading.",
      knowsApplicant: false,
    },
    // A review on the OTHER round, which must survive untouched.
    "admissionReviews/r2__u1__rev2": {
      roundId: "r2",
      applicantUid: "u1",
      reviewerUid: "rev2",
      scores: { c1: 2 },
      total: 2,
      notes: "A different intake entirely.",
    },
    "users/rev1": { displayName: "Rae Reviewer", admissionsReviewer: true },
    "users/rev2": { displayName: "Sam Second", admissionsReviewer: true },
    "users/dec1": { displayName: "Dee Decider", admissionsReviewer: true },
    "users/u1": { displayName: "Mo Member" },
    "users/u2": { displayName: "Dee Draft" },
    "emailSends/e1": { referenceId: "r1", kind: "task" },
    "dataExports/d1": { kind: "admissions-applications", scope: { roundId: "r1" } },
    ...overrides,
  };
  return makeDb(world);
}

function install(db, user) {
  globalThis.__fakeDb = db;
  globalThis.__fakeUser = user;
  globalThis.__blocked = null;
}

function roundDoc(db, id = "r1") {
  const raw = db.docs.get(`admissionRounds/${id}`);
  return raw ? normalizeAdmissionRound(id, raw) : null;
}

/** Run the destroy to completion, the way the client's resume loop does. */
async function destroyToCompletion(db, confirmName = ROUND_LABEL, max = 10) {
  let last = null;
  for (let pass = 0; pass < max; pass += 1) {
    last = await destroyRound(request({ confirmName }), ctx("r1"));
    if (last.status !== 200 || last.body.complete) return { last, passes: pass + 1 };
  }
  throw new Error("the destroy never reported complete");
}

// ===========================================================================
// 1. WHO MAY DO THIS
// ===========================================================================

test("a member is refused by both routes, and nothing is touched", async () => {
  const db = seedWorld();
  install(db, MEMBER);
  const before = db.docs.size;

  const destroyed = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(destroyed.status, 403);
  assert.match(destroyed.body.error, /admin/i);

  const manifest = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(manifest.status, 403);
  assert.equal(manifest.body.counts, undefined, "a refusal must not leak the counts");

  assert.equal(db.docs.size, before, "a refused destroy writes nothing at all");
  assert.equal(
    [...db.docs.keys()].some((path) => path.startsWith("destroyAudits/")),
    false,
    "and opens no audit row, or a round nobody destroyed would report an " +
      "interrupted destroy for ever",
  );
});

test("a signed-out caller is refused before the round is even looked up", async () => {
  const db = seedWorld();
  install(db, null);
  const res = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(res.status, 401);
});

test("a round author with approveCourse is refused by both routes", async () => {
  const db = seedWorld();
  install(db, COURSE_AUTHOR);
  const before = db.docs.size;

  const destroyed = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(
    destroyed.status,
    403,
    "`canAuthorRounds` is the STATUS route's bar in this same directory, and " +
      "these two must not fall back to it: authoring a round is not permission " +
      "to delete other people's applications",
  );

  const manifest = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(manifest.status, 403);
  assert.equal(manifest.body.counts, undefined, "and no preview of the decision either");

  assert.equal(db.docs.size, before, "nothing was written");
});

test("a reviewer named on the round is refused by both routes", async () => {
  const db = seedWorld();
  install(db, REVIEWER);

  // `canSeeRound` lets a named reviewer read this round and the applications on
  // it. Reading them is not removing them.
  const destroyed = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(destroyed.status, 403);
  const manifest = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(manifest.status, 403);
  assert.ok(db.docs.has("admissionRounds/r1"));
});

test("a round that is not there is a 404 on both routes, never a half-finished destroy", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  // There is deliberately no "finish a cascade whose round has gone" mode: the
  // routes read the round first and answer 404, so a mode nothing can reach is
  // a mode nothing has to test. See the note on `destroyRoundCascade`.
  const destroyed = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("nope"));
  assert.equal(destroyed.status, 404);
  const manifest = await destroyManifest(manifestRequest(), ctx("nope"));
  assert.equal(manifest.status, 404);
  assert.equal(
    [...db.docs.keys()].some((path) => path.startsWith("destroyAudits/")),
    false,
    "and no audit row is opened for a round nobody can name",
  );
});

test("the destroy route refuses a confirmation that is not byte-equal", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  for (const typed of [
    "autumn 2026 intake",
    " Autumn 2026 intake",
    "Autumn 2026 intake ",
    "Autumn 2026 intak",
    "",
  ]) {
    const res = await destroyRound(request({ confirmName: typed }), ctx("r1"));
    assert.equal(res.status, 400, `"${typed}" must not confirm the destroy`);
  }
  assert.ok(db.docs.has("admissionApplications/r1__u1"));
});

// ===========================================================================
// 2. THE BLOCKERS
// ===========================================================================

test("an open round is refused, with the sentence, and no audit row is opened", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "open",
  });
  install(db, ADMIN);

  const res = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Close or settle the round first/);
  assert.equal(res.body.blockers.length, 1);
  assert.ok(db.docs.has("admissionApplications/r1__u1"), "nothing is deleted");
  assert.equal(
    [...db.docs.keys()].some((path) => path.startsWith("destroyAudits/")),
    false,
  );
});

test("the blocker predicate answers for every status the machine has", () => {
  assert.deepEqual(roundDestroyBlockers({ status: "draft" }), []);
  assert.deepEqual(roundDestroyBlockers({ status: "closed" }), []);
  assert.deepEqual(roundDestroyBlockers({ status: "settled" }), []);
  assert.deepEqual(roundDestroyBlockers({ status: "cancelled" }), []);
  for (const status of ["open", "deciding"]) {
    const blockers = roundDestroyBlockers({ status });
    assert.equal(blockers.length, 1, `${status} must refuse`);
    assert.match(
      blockers[0],
      /Close or settle the round first/,
      "every refusal names the way out, because destroy is never the first tool",
    );
  }
});

test("the manifest reports the blockers rather than pretending the destroy is offered", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);

  const res = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(res.status, 200);
  assert.equal(res.body.blockers.length, 1);
  assert.match(res.body.blockers[0], /still being decided/);
});

// ===========================================================================
// 3. THE MANIFEST
// ===========================================================================

test("the manifest counts what dies, what is written and what is kept", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  const res = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.counts, {
    applications: 2,
    applicationPrivateRows: 1,
    reviews: 2,
    // The three counters an application form adds. This round is not one, so
    // each is counted and found to be nothing: a zero that was measured, which
    // section 10 sets beside a form where none of them is zero.
    decisions: 0,
    stages: 1,
    questionSets: 0,
    auditRows: 0,
    memberRecordEntriesWritten: 2,
    // rev1 and dec1 are named on no other round; rev2 is on r2.
    reviewerFlagsCleared: 2,
    emailSendRows: 1,
    dataExportRows: 1,
  });
  assert.equal(res.body.target.label, ROUND_LABEL);
  assert.equal(res.body.interrupted, null);
});

test("the probe reads the interrupted report alone and omits the counts entirely", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  const res = await destroyManifest(manifestRequest("?probe=interrupted"), ctx("r1"));
  assert.equal(res.status, 200);
  assert.equal(res.body.target.id, "r1");
  assert.equal(
    "counts" in res.body,
    false,
    "an omitted counter must be ABSENT rather than zero: the client reads a " +
      "missing count as 'not read', and a zero as 'there are none'",
  );
});

test("the manifest's counts are the rows the cascade actually removes", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  const counts = await countRoundDestroyTargets(db, roundDoc(db));

  await destroyToCompletion(db);
  const audit = [...db.docs.entries()].find(([path]) => path.startsWith("destroyAudits/"))[1];

  assert.equal(audit.deleted.applications, counts.applications);
  assert.equal(audit.deleted.reviews, counts.reviews);
  assert.equal(audit.deleted.stages, counts.stages);
  assert.equal(audit.deleted.applicationPrivateRows, counts.applicationPrivateRows);
  // A round that is not an application form has none of these, and its
  // receipt must not grow a line for something that was never there.
  for (const key of ["decisions", "questionSets", "auditRows"]) {
    assert.equal(counts[key], 0);
    assert.equal(key in audit.deleted, false, `${key} was reported as removed from a round with none`);
  }

  // The two counters that are NOT deletions live on the row as their own
  // fields, never inside `deleted`. See the next test for why that matters.
  assert.equal(audit.reviewerFlagsCleared, counts.reviewerFlagsCleared);
  assert.equal(
    [...db.docs.keys()].filter((path) => path.endsWith("/applications/r1")).length,
    counts.memberRecordEntriesWritten,
    "the manifest promises one member record per application, so the destroy " +
      "owes exactly that many ENTRIES IN EXISTENCE afterwards (it writes the " +
      "ones that are missing, so the write count can legitimately be smaller)",
  );
});

test("the audit row's `deleted` map holds deletions and nothing else", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  const { last } = await destroyToCompletion(db);
  const audit = db.docs.get(`destroyAudits/${last.body.auditId}`);

  // The receipt the admin reads prints EVERY key of this map under the sentence
  // "and the records listed below no longer exist", and `destroyAudit.ts`
  // documents the row as the only surviving evidence of a destroy. A destroy
  // that signed off with "member record entries written: 2" among the things
  // that no longer exist would be denying the one promise that makes it
  // allowable, so the non-deletions are kept out by construction.
  for (const key of [
    "memberRecordEntriesWritten",
    "memberRecordEntriesAlreadyPresent",
    "reviewerFlagsCleared",
  ]) {
    assert.equal(
      key in audit.deleted,
      false,
      `${key} is not a deletion and must not be reported as one`,
    );
    assert.equal(key in last.body.deleted, false, `${key} must not reach the receipt`);
  }

  assert.deepEqual(
    last.body.writes,
    {
      memberRecordEntriesWritten: 2,
      memberRecordEntriesAlreadyPresent: 0,
      reviewerFlagsCleared: 2,
    },
    "they are reported, just not as losses",
  );
  assert.equal(audit.memberRecordEntriesWritten, 2, "and they are on the row itself");
  assert.equal(audit.reviewerFlagsCleared, 2);
});

// ===========================================================================
// 4. THE MEMBER RECORD
// ===========================================================================

test("every record is written BEFORE the first delete", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  const lastRecordWrite = db.log.findLastIndex((entry) =>
    entry.path.startsWith("memberRecords/"),
  );
  const firstDelete = db.log.findIndex((entry) => entry.op === "delete");
  assert.ok(lastRecordWrite >= 0, "records were written");
  assert.ok(firstDelete >= 0, "rows were deleted");
  assert.ok(
    lastRecordWrite < firstDelete,
    "the LAST record write must land before the FIRST delete. A sweep that " +
      "interleaved would leave a window in which an application had been " +
      "deleted and the record of it had not been written.",
  );
});

test("the record keeps the scores, the notes and what was applied for", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  const raw = db.docs.get("memberRecords/u1/applications/r1");
  assert.ok(raw, "the applicant's entry survives the round it came from");
  const entry = normalizeApplicationRecord("r1", raw);

  assert.equal(entry.roundTitle, ROUND_LABEL);
  assert.equal(entry.roundKind, "enrolment");
  assert.deepEqual(entry.appliedFor, [
    "Technical incubator",
    "Governance fellowship",
    "Open to a fellowship place",
  ]);
  assert.equal(entry.outcome.decision, "accept");
  assert.equal(entry.outcome.status, "accepted");
  assert.equal(entry.outcome.targetRunId, "run1");
  assert.equal(entry.writtenBy, "destroy");
  assert.equal(entry.writtenByUid, "admin1");

  assert.equal(entry.scoreSummary.reviewerCount, 2);
  assert.equal(entry.scoreSummary.total, 16);
  assert.equal(entry.scoreSummary.mean, 8);
  assert.equal(entry.scoreSummary.byCriterion.c1, 3.5);
  assert.equal(entry.scoreSummary.byCriterion.c2, 4.5);

  assert.deepEqual(
    entry.reviewerNotes.map((note) => [note.reviewerName, note.recommendation, note.total]),
    [
      ["Rae Reviewer", "advance", 9],
      ["Sam Second", "hold", 7],
    ],
  );
  assert.match(entry.reviewerNotes[0].notes, /Strong on the technical side/);

  // The draft applicant is recorded too, AS a draft: "they started and never
  // sent it" is an answer to "have they come to us before".
  const draft = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u2/applications/r1"),
  );
  assert.equal(draft.outcome.status, "draft");
  assert.equal(draft.submittedAt, null);
  assert.deepEqual(draft.appliedFor, []);
});

test("a record that cannot be written refuses the destroy, and nothing is deleted", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  db.failWrites.add("memberRecords/u2/applications/r1");

  const res = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Nothing was deleted/);
  assert.match(
    res.body.error,
    /Still to record: Dee Draft\./,
    "the NAME is in `error`, because `error` is the field the dialog renders and " +
      "a uid is not something an admin can go and look at",
  );
  assert.deepEqual(
    res.body.failedRecords.map((entry) => entry.uid),
    ["u2"],
    "the refusal names the person whose record could not be written",
  );

  assert.equal(
    db.docs.get("admissionRounds/r1").destroying,
    undefined,
    "and the round is NOT marked: the marker goes on after the records are " +
      "safe, so a refused attempt leaves the round entirely usable",
  );

  for (const path of [
    "admissionRounds/r1",
    "admissionRounds/r1/stages/s1",
    "admissionApplications/r1__u1",
    "admissionApplications/r1__u2",
    "admissionApplicationPrivate/r1__u1",
    "admissionReviews/r1__u1__rev1",
  ]) {
    assert.ok(db.docs.has(path), `${path} must survive a refused destroy`);
  }
  assert.equal(
    db.log.some((entry) => entry.op === "delete"),
    false,
    "not one delete may have happened",
  );
});

test("a refused destroy closes its row rather than leaving a resume banner", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  db.failWrites.add("memberRecords/u2/applications/r1");
  await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));

  const manifest = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(
    manifest.body.interrupted,
    null,
    "nothing was deleted, so there is nothing to resume and the round must " +
      "not be reported as half destroyed",
  );

  // And the consequence that makes it matter: a round reopened after a failed
  // attempt is blocked again. An open row would have been read as a destroy
  // in progress, and a resume is never re-blocked.
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "open",
  });
  const reopened = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(reopened.status, 409);
  assert.match(reopened.body.error, /Close or settle the round first/);
});

// ===========================================================================
// 5. WHAT THE CASCADE REMOVES
// ===========================================================================

test("a completed destroy removes the round and everything keyed to it", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  const { last } = await destroyToCompletion(db);

  assert.equal(last.status, 200);
  assert.equal(last.body.ok, true);
  assert.equal(last.body.complete, true);

  for (const path of [
    "admissionRounds/r1",
    "admissionRounds/r1/stages/s1",
    "admissionApplications/r1__u1",
    "admissionApplications/r1__u2",
    "admissionApplicationPrivate/r1__u1",
    "admissionReviews/r1__u1__rev1",
    "admissionReviews/r1__u1__rev2",
  ]) {
    assert.equal(db.docs.has(path), false, `${path} must be gone`);
  }

  // The other round, its review, the delivery log and the download log all
  // outlive this destroy.
  assert.ok(db.docs.has("admissionRounds/r2"));
  assert.ok(db.docs.has("admissionReviews/r2__u1__rev2"));
  assert.ok(db.docs.has("emailSends/e1"), "the delivery log is evidence, not content");
  assert.ok(db.docs.has("dataExports/d1"), "so is the download log");
  assert.ok(db.docs.has("memberRecords/u1/applications/r1"));

  const [auditPath, audit] = [...db.docs.entries()].find(([path]) =>
    path.startsWith("destroyAudits/"),
  );
  assert.equal(last.body.auditId, auditPath.split("/").pop());
  assert.equal(audit.kind, "admission-round");
  assert.equal(audit.label, ROUND_LABEL, "the label outlives the id it named");
  assert.equal(audit.startedByName, "Ada Admin");
  assert.ok(audit.completedAt, "a finished destroy closes its row");
  assert.equal(audit.passInFlightUntil, null, "and hands the claim back");
  assert.equal(audit.deleted.round, 1);
});

// ===========================================================================
// 6. THE REVIEWER NAV FLAG
// ===========================================================================

test("the flag clears only for people no other round names", async () => {
  const db = seedWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  assert.equal(db.docs.get("users/rev1").admissionsReviewer, false);
  assert.equal(db.docs.get("users/dec1").admissionsReviewer, false);
  assert.equal(
    db.docs.get("users/rev2").admissionsReviewer,
    true,
    "rev2 still reviews r2, so the Admissions entry must stay in their sidebar",
  );
});

test("a reviewer whose account has gone does not take the flag sweep down with it", async () => {
  const db = seedWorld();
  db.docs.delete("users/rev1");
  install(db, ADMIN);

  const { last } = await destroyToCompletion(db);
  assert.equal(last.body.complete, true);
  assert.equal(
    last.body.writes.reviewerFlagsCleared,
    1,
    "only dec1 is left to clear, and a batch update to a missing user " +
      "document would have rejected the whole write",
  );
});

// ===========================================================================
// 7. SETTLING WRITES THE RECORD
// ===========================================================================

test("settling a round writes the member records", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);

  const res = await setStatus(request({ status: "settled" }), ctx("r1"));
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "settled");
  assert.equal(res.body.recordWarning, undefined, "a clean settle warns about nothing");

  const entry = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u1/applications/r1"),
  );
  assert.equal(entry.writtenBy, "settle");
  assert.equal(entry.scoreSummary.total, 16);
  assert.ok(db.docs.has("admissionApplications/r1__u1"), "settling deletes nothing");
});

test("a record that fails on settle is a warning, not a refusal", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);
  db.failWrites.add("memberRecords/u2/applications/r1");

  const res = await setStatus(request({ status: "settled" }), ctx("r1"));
  assert.equal(res.status, 200, "one bad row must not hold a whole intake in deciding");
  assert.equal(db.docs.get("admissionRounds/r1").status, "settled");
  assert.match(res.body.recordWarning, /could not be written for 1 applicant/);
  assert.ok(
    db.docs.has("memberRecords/u1/applications/r1"),
    "the applications that could be recorded still were",
  );
});

test("a settle whose records are all written leaves the destroy nothing to redo", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);
  await setStatus(request({ status: "settled" }), ctx("r1"));

  // The destroy FILLS GAPS. It finds both entries already on file and leaves
  // them exactly as the settle wrote them, which is why the stamp still reads
  // "settle" afterwards.
  const { last } = await destroyToCompletion(db);
  const entry = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u1/applications/r1"),
  );
  assert.equal(entry.writtenBy, "settle");
  assert.deepEqual(last.body.writes, {
    memberRecordEntriesWritten: 0,
    memberRecordEntriesAlreadyPresent: 2,
    reviewerFlagsCleared: 2,
  });
});

/**
 * THE REASON THE DESTROY FILLS GAPS RATHER THAN REWRITING.
 *
 * A round settles and the entry stores reviewer rev2's written assessment. rev2
 * then deletes their account, which deletes the `admissionReviews` rows they
 * authored (`accountDeletion.ts`). An admin destroys the round afterwards. If
 * the destroy rewrote the entry from the reviews that still exist, rev2's
 * assessment would be replaced with an entry that has never heard of them, and
 * the destroy would have deleted committee reasoning that the settle had
 * safely preserved. That is precisely what `memberRecords.ts` says the
 * collection exists to prevent.
 */
test("a departed reviewer's notes survive a destroy of a settled round", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);
  await setStatus(request({ status: "settled" }), ctx("r1"));

  const settled = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u1/applications/r1"),
  );
  assert.equal(settled.reviewerNotes.length, 2, "both reviewers are on the settled entry");

  // rev2 leaves the society: their account cascade takes their authored review
  // and their user document with it.
  db.docs.delete("admissionReviews/r1__u1__rev2");
  db.docs.delete("users/rev2");

  await destroyToCompletion(db);
  const after = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u1/applications/r1"),
  );
  assert.deepEqual(
    after.reviewerNotes.map((note) => note.reviewerUid).sort(),
    ["rev1", "rev2"],
    "the destroy must not have rebuilt the entry from the reviews that are left",
  );
  assert.equal(
    after.reviewerNotes.find((note) => note.reviewerUid === "rev2").notes,
    "Would want to see more of the governance reading.",
  );
});

// ===========================================================================
// 8. RESUMING
// ===========================================================================

/**
 * More rows than one invocation's budget, so the first call has to stop short
 * and the second has to finish. The numbers are the point: 260 applications
 * plus 260 reviews is 520 documents against a 500-document budget, which is
 * the smallest seed that spends it.
 */
function seedBigRound() {
  return seedBigRoundWith({});
}

/** The same round, with more documents laid over it. */
function seedBigRoundWith(extra) {
  const world = {};
  for (let i = 0; i < 260; i += 1) {
    world[`admissionApplications/r1__b${i}`] = {
      roundId: "r1",
      uid: `b${i}`,
      displayName: `Applicant ${i}`,
      status: "submitted",
      createdAt: new Date("2026-08-01T09:00:00Z"),
      submittedAt: new Date("2026-08-10T09:00:00Z"),
      programmePreference: {
        streamId: null,
        rankedFellowshipIds: [],
        openToFellowship: false,
      },
      outcome: {},
    };
    world[`admissionReviews/r1__b${i}__rev1`] = {
      roundId: "r1",
      applicantUid: `b${i}`,
      reviewerUid: "rev1",
      scores: { c1: 3 },
      total: 3,
      notes: "Fine.",
    };
  }
  return seedWorld({ ...world, ...extra });
}

test("a destroy that spends its budget reports incomplete and the same call resumes it", async () => {
  const db = seedBigRound();
  install(db, ADMIN);

  const first = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(first.status, 200);
  assert.equal(first.body.complete, false, "520 rows cannot fit in a 500-row budget");
  assert.ok(db.docs.has("admissionRounds/r1"), "the round survives an unfinished pass");
  assert.equal(
    db.docs.get(`destroyAudits/${first.body.auditId}`).passInFlightUntil,
    null,
    "an unfinished pass hands its claim back, or the resume waits out the lease",
  );

  const { last, passes } = await destroyToCompletion(db);
  assert.equal(last.body.complete, true);
  assert.ok(passes >= 1);
  assert.equal(db.docs.has("admissionRounds/r1"), false);

  const audit = db.docs.get(`destroyAudits/${first.body.auditId}`);
  assert.equal(
    last.body.auditId,
    first.body.auditId,
    "a resume carries on in the row the first pass opened rather than starting a second",
  );
  assert.equal(audit.deleted.applications, 262);
  assert.equal(audit.deleted.reviews, 262);
  assert.equal(
    audit.memberRecordEntriesWritten,
    262,
    "the record sweep runs once per destroy, not once per pass: counting a " +
      "second sweep would report more records than there are applicants",
  );
  assert.deepEqual(
    last.body.writes,
    {
      memberRecordEntriesWritten: 262,
      memberRecordEntriesAlreadyPresent: 0,
      reviewerFlagsCleared: 2,
    },
    "and the resuming pass reports the WHOLE destroy's non-deletion totals, " +
      "not its own (it may be driven from a tab that never saw the first pass)",
  );
  assert.ok(audit.completedAt);
});

/**
 * THE HAZARD THIS PINS, spelled out because it is not obvious from the code.
 *
 * A destroy runs in pages, so a big round sits HALF DESTROYED between passes,
 * and its `status` is still whatever it was when the destroy started. Without a
 * marker, that half-destroyed round is indistinguishable from a live closed
 * one: the status route would take `closed -> open` on it, and `roundReadiness`
 * would pass, because the stages drain LAST and are all still there. Real
 * applicants would then file applications into a round whose next resume
 * deletes them, and a resume is deliberately never re-blocked, so nobody would
 * ever be asked whether that was wanted.
 *
 * The two sibling cascades in this wave both mark their target before deleting.
 * This is the round's version of that.
 */
test("a half-destroyed round is marked, and its status will not move", async () => {
  const db = seedBigRound();
  install(db, ADMIN);

  const first = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(first.body.complete, false, "520 rows cannot fit in a 500-row budget");

  const round = db.docs.get("admissionRounds/r1");
  assert.equal(round.destroying, true, "the round says a destroy is under way");
  assert.equal(round.destroyAuditId, first.body.auditId, "and which row is recording it");
  assert.equal(
    round.status,
    "closed",
    "the status is untouched, which is precisely why the marker has to exist",
  );

  const marked = db.log.findIndex(
    (entry) => entry.path === "admissionRounds/r1" && entry.op === "write",
  );
  const firstDelete = db.log.findIndex((entry) => entry.op === "delete");
  assert.ok(marked >= 0 && marked < firstDelete, "and it is marked BEFORE the first delete");

  for (const next of ["open", "cancelled"]) {
    const res = await setStatus(request({ status: next, confirm: true }), ctx("r1"));
    assert.equal(res.status, 409, `${next} must be refused on a round being destroyed`);
    assert.match(res.body.error, /destroy of this round has begun/);
  }
  assert.equal(
    db.docs.get("admissionRounds/r1").status,
    "closed",
    "and no transition landed",
  );

  // The way out is to finish the destroy, which the danger zone offers.
  const { last } = await destroyToCompletion(db);
  assert.equal(last.body.complete, true);
  assert.equal(db.docs.has("admissionRounds/r1"), false, "the marker goes with the round");
});

test("an ordinary round's status still moves", async () => {
  const db = seedWorld();
  db.docs.set("admissionRounds/r1", {
    ...db.docs.get("admissionRounds/r1"),
    status: "deciding",
  });
  install(db, ADMIN);

  // The other direction of the refusal above: it must fire on the marker and on
  // nothing else, or every round in the console would be frozen.
  const res = await setStatus(request({ status: "settled" }), ctx("r1"));
  assert.equal(res.status, 200);
  assert.equal(db.docs.get("admissionRounds/r1").status, "settled");
});

test("a pass already in flight is refused rather than allowed to double count", async () => {
  const db = seedBigRound();
  install(db, ADMIN);

  const first = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(first.body.complete, false);

  // Put the claim back by hand: the pass released it on the way out, and this
  // is the state a request that is still running would leave behind.
  db.docs.set(`destroyAudits/${first.body.auditId}`, {
    ...db.docs.get(`destroyAudits/${first.body.auditId}`),
    passInFlightUntil: { toMillis: () => Date.now() + 60_000 },
  });

  const second = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already running/);
});

test("the manifest offers no blockers while a destroy is interrupted", async () => {
  const db = seedBigRound();
  install(db, ADMIN);
  await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));

  const res = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.deepEqual(
    res.body.blockers,
    [],
    "a resume is never re-blocked, so the manifest must not report a refusal " +
      "the server would not make",
  );
  assert.ok(res.body.interrupted.auditId, "and it names the row to resume into");
});

// ===========================================================================
// 9. THE SYNC ON ITS OWN
// ===========================================================================

test("the record sync is idempotent and reports its failures without stopping", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  const once = await writeRecordsForRound(db, roundDoc(db), "backfill", "admin1");
  assert.deepEqual(once, { written: 2, alreadyPresent: 0, failed: [] });

  const twice = await writeRecordsForRound(db, roundDoc(db), "backfill", "admin1");
  assert.deepEqual(
    twice,
    { written: 2, alreadyPresent: 0, failed: [] },
    "a backfill RESTATES what it finds, so running it twice rewrites the same two",
  );
  assert.equal(
    [...db.docs.keys()].filter((path) => path.startsWith("memberRecords/u1/")).length,
    1,
    "and does not leave a second copy of anybody's entry",
  );

  db.failWrites.add("memberRecords/u1/applications/r1");
  const partial = await writeRecordsForRound(db, roundDoc(db), "backfill", "admin1");
  assert.equal(partial.written, 1, "the other applicant is still recorded");
  assert.deepEqual(
    partial.failed.map((entry) => `${entry.uid}:${entry.name}`),
    ["u1:Mo Member"],
    "a failure names the applicant, because a list of uids is not an answer to " +
      "the admin the destroy just refused",
  );
});

test("a destroy sweep writes only the entries that are missing", async () => {
  const db = seedWorld();
  install(db, ADMIN);

  // u1 is recorded by a settle-style restatement; u2 is not recorded at all.
  await writeRecordsForRound(db, roundDoc(db), "settle", "admin1");
  db.docs.delete("memberRecords/u2/applications/r1");

  const sweep = await writeRecordsForRound(db, roundDoc(db), "destroy", "admin1");
  assert.deepEqual(sweep, { written: 1, alreadyPresent: 1, failed: [] });
  assert.equal(
    normalizeApplicationRecord("r1", db.docs.get("memberRecords/u1/applications/r1"))
      .writtenBy,
    "settle",
    "the entry already on file was left exactly as it was",
  );
  assert.equal(
    normalizeApplicationRecord("r1", db.docs.get("memberRecords/u2/applications/r1"))
      .writtenBy,
    "destroy",
    "and the missing one was written",
  );
});

// ===========================================================================
// 10. AN APPLICATION FORM
// ===========================================================================

/**
 * A closed application form with three programmes, three applicants and the
 * documents only a form keeps: its question sets, a decision document beside
 * each sent application, and log lines about those decisions.
 *
 * Each piece is here to make one assertion mean something:
 *
 *  - `u1` ranked Technical AI Safety ABOVE AGI Strategy while the form lists
 *    them the other way round, and was placed on their 2nd choice, so the
 *    record's order and its outcome can only be right if they were read off
 *    the application.
 *  - `rev2` scored TWELVE answers, ten at 5 and two at 2. A reader that kept
 *    ten scores a row would call that a 5.
 *  - `u2` never pressed Send.
 *  - `u3` was pooled and invited to a programme they did not rank.
 *  - The decision document for `u3` DOES NOT SAY WHICH ROUND IT IS FOR, and
 *    the one for `gone` has NO APPLICATION. Between them they are the two
 *    documents each of the cascade's two ways of finding a decision would miss
 *    on its own.
 *  - `lead2` is named on a programme and missing from the round's own
 *    reviewer list, and `rev1` is named on a programme of ANOTHER form whose
 *    list is empty. The flag predicate has to read the programmes to get
 *    either of them right.
 *  - One log line is keyed to a run and one to another round. Both stay.
 */
function seedFormWorld() {
  const techScores = {};
  for (let i = 1; i <= 12; i += 1) techScores[`tech.q${i}`] = i <= 10 ? 5 : 2;

  return makeDb({
    "admissionRounds/r1": {
      kind: "enrolment",
      label: ROUND_LABEL,
      slug: "autumn-2026",
      academicYear: "2026/27",
      status: "closed",
      formVersion: 2,
      programmeIds: ["agi", "tech", "inc"],
      programmes: {
        agi: {
          kind: "fellowship",
          name: "AGI Strategy Fellowship",
          shortName: "AGI Strategy",
          useScores: true,
          leadUid: "lead1",
          reviewerUids: ["rev1"],
          runId: "run-agi",
        },
        tech: {
          kind: "fellowship",
          name: "Technical AI Safety Fellowship",
          shortName: "Technical AI Safety",
          useScores: true,
          leadUid: "lead2",
          reviewerUids: ["rev2"],
        },
        inc: {
          kind: "incubator",
          name: "Research Incubator",
          shortName: "Incubator",
          useScores: false,
          leadUid: "lead1",
          reviewerUids: [],
        },
      },
      questionSetIds: ["fellowships", "agi", "tech"],
      asksFacilitating: true,
      // The union the roles writer keeps, WITHOUT lead2: a list that has
      // drifted from its programmes.
      reviewerUids: ["lead1", "rev1", "rev2"],
      finalDeciderUid: null,
      authorUid: "admin1",
    },
    "admissionRounds/r1/questionSets/fellowships": {
      roundId: "r1",
      role: "general",
      scope: { type: "kind", kind: "fellowship" },
      label: "Fellowships",
      intro: "",
      questions: [{ id: "why", text: "Why a fellowship?", type: "long", required: true }],
    },
    "admissionRounds/r1/questionSets/agi": {
      roundId: "r1",
      role: "stream",
      scope: { type: "programme", programmeId: "agi" },
      label: "AGI Strategy",
      intro: "",
      questions: [
        { id: "event", text: "Which event?", type: "long", scored: true },
        { id: "plan", text: "What would you do next?", type: "long", scored: true },
      ],
    },
    "admissionRounds/r1/questionSets/tech": {
      roundId: "r1",
      role: "stream",
      scope: { type: "programme", programmeId: "tech" },
      label: "Technical AI Safety",
      intro: "",
      questions: Array.from({ length: 12 }, (_, i) => ({
        id: `q${i + 1}`,
        text: `Question ${i + 1}`,
        type: "short",
        scored: true,
      })),
    },

    // Another round, and another FORM. Everything under either must survive.
    "admissionRounds/r2": {
      kind: "enrolment",
      label: "Spring 2027 intake",
      status: "draft",
      reviewerUids: ["rev2"],
      finalDeciderUid: null,
      authorUid: "admin1",
    },
    "admissionRounds/r3": {
      kind: "enrolment",
      label: "Spring 2027 applications",
      status: "draft",
      formVersion: 2,
      programmeIds: ["agi"],
      programmes: { agi: { kind: "fellowship", name: "AGI Strategy", leadUid: "rev1" } },
      // Empty although a programme names rev1: the other direction of drift.
      reviewerUids: [],
      finalDeciderUid: null,
      authorUid: "admin1",
    },
    "admissionRounds/r3/questionSets/agi": {
      roundId: "r3",
      role: "stream",
      scope: { type: "programme", programmeId: "agi" },
      label: "AGI Strategy",
      questions: [],
    },

    "admissionApplications/r1__u1": {
      roundId: "r1",
      uid: "u1",
      email: "u1@example.com",
      displayName: "Mo Member",
      formVersion: 2,
      status: "accepted",
      createdAt: new Date("2026-10-01T09:00:00Z"),
      submittedAt: new Date("2026-10-10T09:00:00Z"),
      sentAt: new Date("2026-10-12T09:00:00Z"),
      draft: { rankedProgrammeIds: ["tech", "agi"] },
      sent: {
        rankedProgrammeIds: ["tech", "agi"],
        answers: { agi: { event: "The reading group." } },
      },
      result: { kind: "accepted", programmeId: "agi", publishedAt: new Date("2026-10-18T17:00:00Z") },
    },
    "admissionApplications/r1__u2": {
      roundId: "r1",
      uid: "u2",
      displayName: "Dee Draft",
      formVersion: 2,
      status: "draft",
      createdAt: new Date("2026-10-02T09:00:00Z"),
      draft: { rankedProgrammeIds: ["inc"] },
      sent: null,
    },
    "admissionApplications/r1__u3": {
      roundId: "r1",
      uid: "u3",
      displayName: "Indra Invited",
      formVersion: 2,
      status: "invited",
      createdAt: new Date("2026-10-03T09:00:00Z"),
      submittedAt: new Date("2026-10-11T09:00:00Z"),
      draft: { rankedProgrammeIds: ["agi"] },
      sent: { rankedProgrammeIds: ["agi"] },
      result: { kind: "invited", programmeId: "tech", publishedAt: new Date("2026-10-18T17:00:00Z") },
      invitation: { programmeId: "tech", replyBy: "2026-10-22", response: null },
    },

    [`${DECISIONS_COLLECTION}/r1__u1`]: {
      roundId: "r1",
      uid: "u1",
      programmes: {
        tech: { decision: "pool", poolReason: "capacity", decidedByUid: "lead2" },
        agi: { decision: "accept", decidedByUid: "lead1" },
      },
      pooledOutcome: null,
      exception: null,
    },
    // Says nothing about which round it is for. Found only at its
    // application's id.
    [`${DECISIONS_COLLECTION}/r1__u3`]: {
      uid: "u3",
      programmes: { agi: { decision: "pool", poolReason: "better-fit", decidedByUid: "lead1" } },
      pooledOutcome: { kind: "invite", programmeId: "tech", setByUid: "admin1" },
    },
    // Names the round and has no application. Found only by the round it names.
    [`${DECISIONS_COLLECTION}/r1__gone`]: {
      roundId: "r1",
      uid: "gone",
      programmes: { agi: { decision: "decline", decidedByUid: "lead1" } },
    },
    // Another round's decision about the same person.
    [`${DECISIONS_COLLECTION}/r3__u1`]: {
      roundId: "r3",
      uid: "u1",
      programmes: { agi: { decision: "accept", decidedByUid: "rev1" } },
    },

    "admissionReviews/r1__u1__rev1": {
      roundId: "r1",
      applicantUid: "u1",
      reviewerUid: "rev1",
      scores: { "agi.event": 4, "agi.plan": 3 },
      notes: "Clear about the event, thinner on what comes next.",
      comments: [
        { id: "c1", questionKey: "agi.event", text: "This is the strongest answer." },
      ],
    },
    "admissionReviews/r1__u1__rev2": {
      roundId: "r1",
      applicantUid: "u1",
      reviewerUid: "rev2",
      scores: techScores,
      notes: "Strong on the technical questions.",
    },
    "admissionReviews/r1__u1__lead1": {
      roundId: "r1",
      applicantUid: "u1",
      reviewerUid: "lead1",
      scores: {},
      notes: "Read it. No scores from me.",
    },
    "admissionReviews/r1__u3__rev1": {
      roundId: "r1",
      applicantUid: "u3",
      reviewerUid: "rev1",
      scores: { "agi.event": 2 },
      notes: "A better fit for the technical fellowship.",
    },

    [`${COURSE_AUDIT_COLLECTION}/a1`]: {
      kind: "application-decision",
      runId: "",
      roundId: "r1",
      subjectUid: "u1",
      actorUid: "lead1",
      actorName: "Lena Lead",
      targetLabel: "AGI Strategy",
      detail: "Accepted for AGI Strategy.",
    },
    [`${COURSE_AUDIT_COLLECTION}/a2`]: {
      kind: "application-decisions-sent",
      runId: "",
      roundId: "r1",
      actorUid: "admin1",
      actorName: "Ada Admin",
      detail: "Decision day sent.",
    },
    // Keyed to a RUN: the run's own history, which a round destroy leaves.
    [`${COURSE_AUDIT_COLLECTION}/a3`]: {
      kind: "facilitator-appointed",
      runId: "run-agi",
      actorUid: "admin1",
      detail: "Appointed a facilitator.",
    },
    // Keyed to another round.
    [`${COURSE_AUDIT_COLLECTION}/a4`]: {
      kind: "application-decision",
      runId: "",
      roundId: "r3",
      subjectUid: "u1",
      actorUid: "rev1",
      detail: "Accepted for AGI Strategy.",
    },

    "users/lead1": { displayName: "Lena Lead", admissionsReviewer: true },
    "users/lead2": { displayName: "Lou Lead", admissionsReviewer: true },
    "users/rev1": { displayName: "Rae Reviewer", admissionsReviewer: true },
    "users/rev2": { displayName: "Sam Second", admissionsReviewer: true },
    "users/u1": { displayName: "Mo Member" },
    "users/u2": { displayName: "Dee Draft" },
    "users/u3": { displayName: "Indra Invited" },
    "emailSends/e1": { referenceId: "r1", kind: "task" },
  });
}

test("the names this file seeds under are the ones the application system reads", () => {
  // The engine imports these three; the account cascade spells the decisions
  // collection as a literal. Pinned so a rename in one place cannot leave a
  // cascade sweeping a collection nothing writes to.
  assert.equal(DECISIONS_COLLECTION, "admissionDecisions");
  assert.equal(QUESTION_SETS_SUBCOLLECTION, "questionSets");
  assert.equal(COURSE_AUDIT_COLLECTION, "courseAudit");
});

test("a form's manifest counts its question sets, its decisions and its log lines", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);

  const res = await destroyManifest(manifestRequest(), ctx("r1"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.counts, {
    applications: 3,
    // An application form asks no access-requirements question.
    applicationPrivateRows: 0,
    reviews: 4,
    // u1's (which names the round AND sits at an application's id, counted
    // once), u3's (at its application's id only) and the one with no
    // application (by the round it names only).
    decisions: 3,
    stages: 0,
    questionSets: 3,
    // The two keyed to this round. Not the run's, and not the other round's.
    auditRows: 2,
    memberRecordEntriesWritten: 3,
    // lead1 (on the list, named nowhere else) and lead2 (named by a programme
    // only). rev1 is named by a programme of r3 and rev2 by r2's list.
    reviewerFlagsCleared: 2,
    emailSendRows: 1,
    dataExportRows: 0,
  });
});

test("a destroyed form takes its question sets, every decision and its log lines with it", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);
  const counts = await countRoundDestroyTargets(db, roundDoc(db));
  const { last } = await destroyToCompletion(db);

  assert.equal(last.status, 200);
  assert.equal(last.body.complete, true);

  for (const path of [
    "admissionRounds/r1",
    "admissionRounds/r1/questionSets/fellowships",
    "admissionRounds/r1/questionSets/agi",
    "admissionRounds/r1/questionSets/tech",
    "admissionApplications/r1__u1",
    "admissionApplications/r1__u2",
    "admissionApplications/r1__u3",
    "admissionDecisions/r1__u1",
    "admissionDecisions/r1__u3",
    "admissionDecisions/r1__gone",
    "admissionReviews/r1__u1__rev1",
    "admissionReviews/r1__u1__rev2",
    "admissionReviews/r1__u1__lead1",
    "admissionReviews/r1__u3__rev1",
    "courseAudit/a1",
    "courseAudit/a2",
  ]) {
    assert.equal(db.docs.has(path), false, `${path} must be gone`);
  }
  assert.deepEqual(
    [...db.docs.keys()].filter(
      (path) =>
        path.startsWith("admissionDecisions/r1__") ||
        path.startsWith("admissionRounds/r1/") ||
        path.startsWith("admissionApplications/r1__"),
    ),
    [],
    "nothing addressed under the destroyed form is left, listed or not",
  );

  // What belongs to another round, to a run, or to the person, stays.
  for (const path of [
    "admissionRounds/r2",
    "admissionRounds/r3",
    "admissionRounds/r3/questionSets/agi",
    "admissionDecisions/r3__u1",
    "courseAudit/a3",
    "courseAudit/a4",
    "memberRecords/u1/applications/r1",
    "memberRecords/u2/applications/r1",
    "memberRecords/u3/applications/r1",
    "emailSends/e1",
  ]) {
    assert.ok(db.docs.has(path), `${path} must survive`);
  }

  // The receipt agrees with the manifest, key for key, on what a form adds.
  const audit = db.docs.get(`destroyAudits/${last.body.auditId}`);
  assert.equal(audit.deleted.decisions, counts.decisions);
  assert.equal(audit.deleted.questionSets, counts.questionSets);
  assert.equal(audit.deleted.auditRows, counts.auditRows);
  assert.equal(audit.deleted.applications, counts.applications);
  assert.equal(audit.deleted.reviews, counts.reviews);
  assert.equal(audit.deleted.round, 1);
  assert.deepEqual(
    last.body.deleted,
    { reviews: 4, decisions: 3, applications: 3, questionSets: 3, auditRows: 2, round: 1 },
    "and it lists deletions only: no stage and no access-requirements line for " +
      "a form that had neither",
  );
});

test("a decision that names no round leaves in the same batch as its application", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  // The stage that drains decisions by the round they name cannot see this
  // one. It is the document at the application's own id, so it rides with the
  // application, and "with" has to mean one commit: a decision deleted in a
  // batch of its own could be left standing by a failure between the two.
  const together = db.batches.find((paths) => paths.includes("admissionApplications/r1__u3"));
  assert.ok(together, "the application was deleted in a batch");
  assert.ok(
    together.includes("admissionDecisions/r1__u3"),
    "the decision at an application's id was not deleted in that application's batch",
  );

  // And the ones that DO name the round were already gone by then: they are
  // about the applications, so they go first, exactly as the reviews do.
  const firstApplication = db.log.findIndex(
    (entry) => entry.op === "delete" && entry.path.startsWith("admissionApplications/"),
  );
  for (const path of ["admissionDecisions/r1__u1", "admissionDecisions/r1__gone"]) {
    const at = db.log.findIndex((entry) => entry.op === "delete" && entry.path === path);
    assert.ok(at >= 0 && at < firstApplication, `${path} must be deleted before any application`);
  }
});

test("a form's records are written before the first delete, as any round's are", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  const lastRecordWrite = db.log.findLastIndex((entry) =>
    entry.path.startsWith("memberRecords/"),
  );
  const firstDelete = db.log.findIndex((entry) => entry.op === "delete");
  assert.ok(lastRecordWrite >= 0 && firstDelete >= 0);
  assert.ok(
    lastRecordWrite < firstDelete,
    "the question sets say which scored answer belongs to which programme, so " +
      "the records have to be finished while the sets are still there",
  );
});

test("the record of a form application says what they ranked and what they were told", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);
  await destroyToCompletion(db);

  const entry = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u1/applications/r1"),
  );
  assert.equal(entry.roundTitle, ROUND_LABEL);
  assert.deepEqual(
    entry.appliedFor,
    ["Technical AI Safety", "AGI Strategy"],
    "their ranking, by short name, 1st choice first. The form lists the two " +
      "the other way round, and the form's order must not win.",
  );
  assert.deepEqual(entry.outcome, {
    decision: "accepted (AGI Strategy)",
    status: "accepted",
    targetRunId: "run-agi",
  });
  assert.deepEqual(entry.submittedAt, new Date("2026-10-10T09:00:00Z"));
  assert.equal(entry.writtenBy, "destroy");

  // Three people assessed them and two scored. rev1 gave 4 and 3 (3.5); rev2
  // gave ten 5s and two 2s (4.5). A reader that kept ten scores a row would
  // have made rev2 a 5 and the mean 4.25.
  assert.deepEqual(entry.scoreSummary, {
    reviewerCount: 3,
    total: null,
    mean: 4,
    byCriterion: { tech: 4.5, agi: 3.5 },
  });
  assert.deepEqual(
    entry.reviewerNotes.map((note) => [note.reviewerName, note.recommendation, note.total]),
    [
      ["Lena Lead", null, null],
      ["Rae Reviewer", null, 3.5],
      ["Sam Second", null, 4.5],
    ],
  );
  assert.equal(entry.reviewerNotes[1].notes, "Clear about the event, thinner on what comes next.");
  assert.ok(
    !JSON.stringify(db.docs.get("memberRecords/u1/applications/r1")).includes(
      "The reading group.",
    ),
    "none of the applicant's own answers reaches the record",
  );

  // Pooled, then invited to a programme they did not rank. The record names
  // the programme the invitation was to, and keeps what they asked for apart.
  const invited = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u3/applications/r1"),
  );
  assert.deepEqual(invited.appliedFor, ["AGI Strategy"]);
  assert.deepEqual(invited.outcome, {
    decision: "invited (Technical AI Safety)",
    status: "invited",
    targetRunId: null,
  });
  assert.deepEqual(invited.scoreSummary, {
    reviewerCount: 1,
    total: null,
    mean: 2,
    byCriterion: { agi: 2 },
  });

  // Never sent. Recorded as a draft, with what they had ranked so far.
  const draft = normalizeApplicationRecord(
    "r1",
    db.docs.get("memberRecords/u2/applications/r1"),
  );
  assert.deepEqual(draft.appliedFor, ["Incubator"]);
  assert.deepEqual(draft.outcome, { decision: null, status: "draft", targetRunId: null });
  assert.equal(draft.submittedAt, null);
  assert.deepEqual(
    draft.scoreSummary,
    { reviewerCount: 0, total: null, mean: null, byCriterion: {} },
    "the incubator does not score its answers, so it has no score to be missing",
  );
});

test("a form whose question sets cannot be read refuses, and nothing is deleted", async (t) => {
  // The sync logs the read failure with its stack, which under this loader is
  // a `data:` URL holding a whole module graph. The message is right in
  // production and expected here, so it is muted for this case alone.
  t.mock.method(console, "error", () => {});
  const db = seedFormWorld();
  install(db, ADMIN);
  // The sets decide which scored answer belongs to which programme. A record
  // written without them would be written from half the facts.
  const realCollection = db.collection;
  db.collection = (path) => {
    const ref = realCollection(path);
    if (path !== "admissionRounds") return ref;
    return {
      ...ref,
      doc: (id) => {
        const doc = ref.doc(id);
        return {
          ...doc,
          collection: (name) => {
            if (name === QUESTION_SETS_SUBCOLLECTION && id === "r1") {
              return {
                ...doc.collection(name),
                async get() {
                  throw new Error("UNAVAILABLE: questionSets");
                },
              };
            }
            return doc.collection(name);
          },
        };
      },
    };
  };

  const res = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));

  assert.equal(res.status, 409);
  assert.match(res.body.error, /Nothing was deleted/);
  assert.deepEqual(
    res.body.failedRecords.map((entry) => entry.uid).sort(),
    ["u1", "u2", "u3"],
    "every application that needed the form is named, not just the first",
  );
  assert.match(res.body.failedRecords[0].message, /application form could not be read/);
  assert.equal(
    db.log.some((entry) => entry.op === "delete"),
    false,
    "not one delete may have happened",
  );
  assert.ok(db.docs.has("admissionDecisions/r1__u1"));
});

test("a form's flag sweep reads the programmes as well as the list", async () => {
  const db = seedFormWorld();
  install(db, ADMIN);
  const { last } = await destroyToCompletion(db);

  assert.equal(db.docs.get("users/lead1").admissionsReviewer, false);
  assert.equal(
    db.docs.get("users/lead2").admissionsReviewer,
    false,
    "lead2 led a programme on this form and was missing from its reviewer " +
      "list. They are named on nothing else, so the Admissions entry goes.",
  );
  assert.equal(
    db.docs.get("users/rev1").admissionsReviewer,
    true,
    "rev1 leads a programme on another form whose reviewer list is empty. " +
      "That form still names them, so the entry stays.",
  );
  assert.equal(db.docs.get("users/rev2").admissionsReviewer, true, "rev2 reviews r2");
  assert.equal(last.body.writes.reviewerFlagsCleared, 2);
});

/**
 * A destroy that stops between passes must never leave a decision standing
 * over an application that has gone: that is a judgement about a named person
 * with nothing left to say what it was a judgement of.
 */
test("no pass ends with a decision whose application has gone", async () => {
  const world = {};
  for (let i = 0; i < 260; i += 1) {
    world[`admissionDecisions/r1__b${i}`] = {
      roundId: "r1",
      uid: `b${i}`,
      programmes: { p1: { decision: "accept", decidedByUid: "rev1" } },
    };
  }
  const db = seedBigRoundWith(world);
  install(db, ADMIN);

  const orphans = () =>
    [...db.docs.keys()]
      .filter((path) => path.startsWith("admissionDecisions/"))
      .filter((path) => !db.docs.has(path.replace("admissionDecisions/", "admissionApplications/")));

  let passes = 0;
  for (;;) {
    const res = await destroyRound(request({ confirmName: ROUND_LABEL }), ctx("r1"));
    assert.equal(res.status, 200);
    passes += 1;
    assert.deepEqual(orphans(), [], `pass ${passes} left a decision without its application`);
    if (res.body.complete) {
      assert.equal(res.body.deleted.decisions, 260, "each counted once across the passes");
      break;
    }
    assert.ok(passes < 10, "the destroy never reported complete");
  }
  assert.ok(passes > 1, "the seed is meant to spend more than one pass's budget");
});
