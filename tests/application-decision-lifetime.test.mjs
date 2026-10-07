/**
 * A DECISION NEVER OUTLIVES THE APPLICATION IT IS ABOUT.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * An application form keeps a decision document beside each application, at
 * the application's own id (`admissionDecisions/{roundId}__{uid}`): each
 * lead's decision about that person, the outcome picked for them if they were
 * pooled, and any exception an admin made. It is a judgement about a named
 * applicant, held in a collection no browser can read and no screen lists by
 * person. Left standing after its application has gone, it would be exactly
 * that: a judgement about somebody, with nothing left to say what it judged
 * and nothing that would ever lead anybody back to it.
 *
 * So the rule is one sentence: WHATEVER DELETES AN APPLICATION DELETES THE
 * DECISION AT ITS ID IN THE SAME BATCH. Two things delete applications today,
 * the round destroy and the account cascade, and this file holds both to it:
 *
 *  1. THE TREE IS WALKED. Every file in `src` that names the applications
 *     collection and calls a delete is listed below with what it does. A file
 *     that deletes applications has to delete the decision in the same batch;
 *     a file that only deletes something else says so. Checked both ways, so a
 *     third deleter cannot arrive without being read against the rule.
 *  2. THE ACCOUNT CASCADE IS EXECUTED, against a fake Firestore that records
 *     each committed batch as a unit, because "in the same batch" is a claim
 *     about atomicity and a summary cannot show it. (The round destroy's half
 *     is executed in `tests/admissions-destroy.test.mjs`, section 10.)
 *
 * Faked: `firebase-admin/firestore` (sentinels this store can interpret) and
 * `server-only`. The cascade under test is the real one. Nothing here can
 * reach a Firestore project.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

/**
 * A failing batch makes the cascade log the error with its stack, which under
 * the test loader is a `data:` URL carrying a whole module graph. The message
 * is right in production and expected here, so that case mutes it for its own
 * duration (`tests/lib/outputGuard.mjs` fails a file on any line over 20 KB).
 */
const muteExpectedError = (t) => t.mock.method(console, "error", () => {});

// ---------------------------------------------------------------------------
// 1. The tree: who can delete an application
// ---------------------------------------------------------------------------

function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Source with its comments gone, so a rule written in prose is not a use. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * A file that can ADDRESS an application document: it names the collection, by
 * its string or by the constant that holds it, or it calls the helper that
 * builds a reference to one.
 */
const NAMES_APPLICATIONS = /["'`]admissionApplications["'`]|\bAPPLICATIONS_COLLECTION\b|\bapplicationRef\(/;

/**
 * A call that removes a DOCUMENT: on a batch, a transaction or a reference, or
 * a recursive delete. `FieldValue.delete()` removes a field and is not one.
 */
const DELETES_A_DOCUMENT = /(?<!FieldValue)\.delete\(|\brecursiveDelete\(/;

const NAMES_DECISIONS = /admissionDecisions|\bDECISIONS_COLLECTION\b/;

/**
 * Every file in `src` that names the applications collection AND deletes a
 * document, with what it does.
 *
 *  - `pairs`: it deletes applications, so it has to delete the decision at
 *    each one's id in the same batch. The check below reads that batch.
 *  - `never`: its deletes are of other documents, and it never removes an
 *    application. The reason says what it does to applications instead.
 *
 * A NEW ENTRY IS A DECISION, not a formality. If the file deletes
 * applications it is `pairs` and has to pass the batch check. A file that
 * serves an applicant cannot be `pairs` at all, because nothing an applicant's
 * request loads may name the decisions collection
 * (`tests/applications-boundary.test.mjs`), so an applicant never deletes
 * their own application: withdrawing is a status.
 */
const CAN_DELETE_NEAR_APPLICATIONS = new Map([
  [
    "src/lib/admissions/destroy.ts",
    {
      kind: "pairs",
      why:
        "the round destroy drains every application on the round, and each page deletes the " +
        "access-requirements row and the decision document at each application's id in the " +
        "same batch as the application",
    },
  ],
  [
    "src/lib/firestore/accountDeletion.ts",
    {
      kind: "pairs",
      why:
        "the account cascade deletes every application its account made, and each page deletes " +
        "the access-requirements row and the decision document at each application's id in the " +
        "same batch as the application",
    },
  ],
  [
    "src/lib/firestore/courseDeletion.ts",
    {
      kind: "never",
      why:
        "the run destroy RELEASES the applications placed on its run (the status moves to " +
        "withdrawn and two pointers are cleared) and never deletes one; its deletes are of the " +
        "run's own collections",
    },
  ],
]);

test("every file that could delete an application is listed, with what it does", () => {
  const found = [];
  for (const file of sourceFiles()) {
    const code = codeOf(file);
    if (NAMES_APPLICATIONS.test(code) && DELETES_A_DOCUMENT.test(code)) found.push(rel(file));
  }
  assert.ok(
    found.length >= 2,
    `only ${found.length} file(s) were found that name the applications collection and delete ` +
      "a document. The walk has stopped seeing them, so this guard is asserting about nothing.",
  );
  assert.deepEqual(
    found.sort(),
    [...CAN_DELETE_NEAR_APPLICATIONS.keys()].sort(),
    "the files that name the applications collection and delete a document are not the ones " +
      "listed in CAN_DELETE_NEAR_APPLICATIONS. A file that deletes applications is added as " +
      "`pairs` and has to delete the decision document at each one's id in the same batch; a " +
      "file whose deletes are of something else is added as `never` with what it does to " +
      "applications instead. An entry for a file that no longer does either is removed.",
  );
  for (const [file, entry] of CAN_DELETE_NEAR_APPLICATIONS) {
    assert.ok(["pairs", "never"].includes(entry.kind), `${file} has no kind`);
    assert.ok(entry.why.length > 30, `${file} needs a written reason`);
  }
});

/**
 * The batch that deletes applications, cut out of a file: from the first
 * `db.batch()` after `anchor` to the commit that follows it.
 */
function applicationBatch(file, anchor) {
  const code = codeOf(join(REPO_ROOT, file));
  const from = code.indexOf(anchor);
  assert.ok(from !== -1, `${file} no longer has \`${anchor}\`, so this guard cannot find its batch`);
  const batchAt = code.indexOf("const batch = db.batch();", from);
  const commitAt = code.indexOf("await batch.commit();", batchAt);
  assert.ok(batchAt !== -1 && commitAt !== -1, `${file} no longer deletes a page as one batch`);
  return code.slice(batchAt, commitAt);
}

/** Where each `pairs` file deletes its applications. */
const APPLICATION_BATCHES = new Map([
  ["src/lib/admissions/destroy.ts", "async function drainApplications("],
  ["src/lib/firestore/accountDeletion.ts", "async function deleteAdmissionApplications("],
]);

test("each file that deletes applications deletes their decisions in the SAME batch", () => {
  const pairing = [...CAN_DELETE_NEAR_APPLICATIONS]
    .filter(([, entry]) => entry.kind === "pairs")
    .map(([file]) => file);
  assert.deepEqual(
    pairing.sort(),
    [...APPLICATION_BATCHES.keys()].sort(),
    "a file listed as `pairs` has no entry saying where its application batch is, so the " +
      "check below never reads it",
  );

  for (const [file, anchor] of APPLICATION_BATCHES) {
    assert.match(
      codeOf(join(REPO_ROOT, file)),
      NAMES_DECISIONS,
      `${file} deletes applications and never names the decisions collection`,
    );
    const batch = applicationBatch(file, anchor);
    assert.match(
      batch,
      /for \(const (\w+) of liveDecisions\) batch\.delete\(\1\.ref\);/,
      `${file} does not delete the decision documents inside its application batch`,
    );
    assert.match(
      batch,
      /for \(const (\w+) of snap\.docs\) batch\.delete\(\1\.ref\);/,
      `${file} does not delete the applications inside that same batch`,
    );
  }
});

test("the account cascade has no second, separate sweep of the decisions", () => {
  // One batch is the design. A sweep of its own would be a second step that
  // can fail on its own, after which the application has gone and the
  // judgement about it has not.
  assert.doesNotMatch(
    codeOf(join(SRC, "lib", "firestore", "accountDeletion.ts")),
    /deleteOwnedCourseRows\(\s*db,\s*["'`]admissionDecisions["'`]/,
    "admissionDecisions is being swept separately from its applications",
  );
});

// ---------------------------------------------------------------------------
// 2. The account cascade, executed
// ---------------------------------------------------------------------------

const { loadTs } = createLoader({
  stubs: [
    ["server-only", "export {};"],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  arrayUnion: (...values) => ({ __op: 'arrayUnion', values }),\n" +
        "  arrayRemove: (...values) => ({ __op: 'arrayRemove', values }),\n" +
        "  increment: (by) => ({ __op: 'increment', by }),\n" +
        "  delete: () => ({ __op: 'delete' }),\n" +
        "};\n" +
        "export class FieldPath {\n" +
        "  constructor(...segments) { this.segments = segments; }\n" +
        "  static documentId() { return '__name__'; }\n" +
        "}\n" +
        "export const Timestamp = { fromDate: (d) => d, now: () => new Date() };",
    ],
  ],
});

const { deleteAccountCascade } = await loadTs("lib/firestore/accountDeletion.ts");
const { DECISIONS_COLLECTION } = await loadTs("lib/applications/staffRepo.ts");

/**
 * A Firestore small enough to read. Seeded by COLLECTION PATH. A batch is
 * atomic here as it is in Firestore: every operation is checked before any is
 * applied, and each committed batch is recorded as one list of deleted paths.
 */
function makeDb(seed = {}) {
  const store = new Map();
  for (const [path, docs] of Object.entries(seed)) {
    store.set(path, new Map(Object.entries(docs).map(([id, d]) => [id, { ...d }])));
  }
  /** One list of deleted paths per committed batch. */
  const batches = [];
  /** Paths whose delete must fail, to refuse a whole batch on purpose. */
  const failDeletes = new Set();

  function coll(path) {
    let rows = store.get(path);
    if (!rows) {
      rows = new Map();
      store.set(path, rows);
    }
    return rows;
  }

  function matches(data, { field, op, value }) {
    const actual = data[field];
    if (op === "==") return actual === value;
    if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
    throw new Error(`the fake Firestore does not implement "${op}"`);
  }

  function split(path) {
    const cut = path.lastIndexOf("/");
    return [path.slice(0, cut), path.slice(cut + 1)];
  }

  function docRef(path) {
    const [collPath, id] = split(path);
    return {
      id,
      path,
      collection: (name) => query(`${path}/${name}`),
      async get() {
        const data = coll(collPath).get(id);
        return {
          id,
          exists: data !== undefined,
          ref: docRef(path),
          data: () => (data === undefined ? undefined : { ...data }),
        };
      },
      async delete() {
        coll(collPath).delete(id);
      },
      async update() {
        if (!coll(collPath).has(id)) throw new Error(`NOT_FOUND: ${path}`);
      },
      async set(data) {
        coll(collPath).set(id, { ...data });
      },
    };
  }

  function query(collPath, filters = [], cap = Infinity) {
    const rows = () => {
      const all = [...coll(collPath).entries()].filter(([, data]) =>
        filters.every((f) => matches(data, f)),
      );
      return cap === Infinity ? all : all.slice(0, cap);
    };
    return {
      where: (field, op, value) => query(collPath, [...filters, { field, op, value }], cap),
      // Ordering and projection change nothing this store can observe.
      orderBy: () => query(collPath, filters, cap),
      startAfter: () => query(collPath, filters, cap),
      select: () => query(collPath, filters, cap),
      limit: (n) => query(collPath, filters, n),
      doc: (id) => docRef(`${collPath}/${id}`),
      count: () => ({ get: async () => ({ data: () => ({ count: rows().length }) }) }),
      async get() {
        const entries = rows();
        return {
          empty: entries.length === 0,
          size: entries.length,
          docs: entries.map(([id, data]) => ({
            id,
            exists: true,
            ref: docRef(`${collPath}/${id}`),
            data: () => ({ ...data }),
          })),
        };
      },
    };
  }

  return {
    collection: (name) => query(name),
    doc: (path) => docRef(path),
    collectionGroup: (name) => query(`__group__/${name}`),
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
    batch() {
      const queued = [];
      return {
        delete(ref) {
          queued.push(["delete", ref, []]);
        },
        update(ref, ...args) {
          queued.push(["update", ref, args]);
        },
        set(ref, data) {
          queued.push(["set", ref, [data]]);
        },
        async commit() {
          for (const [kind, ref] of queued) {
            if (kind === "delete" && failDeletes.has(ref.path)) {
              throw new Error(`UNAVAILABLE: the batch holding ${ref.path} was refused`);
            }
          }
          for (const [kind, ref, args] of queued) {
            if (kind === "delete") await ref.delete();
            else if (kind === "update") await ref.update(...args);
            else await ref.set(...args);
          }
          batches.push(queued.filter(([kind]) => kind === "delete").map(([, ref]) => ref.path));
        },
      };
    },
    batches,
    failDeletes,
    has: (path) => {
      const [collPath, id] = split(path);
      return coll(collPath).has(id);
    },
  };
}

const auth = {
  async deleteUser() {},
  async revokeRefreshTokens() {},
};

const UID = "gone";
const OTHER = "stays";

/**
 * One account with two applications: one made on an application form, with a
 * decision document beside it, and one made on an older round, with an
 * access-requirements row beside it. Somebody else applied to the same form
 * and has a decision of their own.
 */
function seed() {
  return {
    users: { [UID]: { uid: UID, role: "member" }, [OTHER]: { uid: OTHER, role: "member" } },
    registrations: { [UID]: { uid: UID } },
    admissionApplications: {
      [`form__${UID}`]: { roundId: "form", uid: UID, formVersion: 2, status: "submitted" },
      [`older__${UID}`]: { roundId: "older", uid: UID, status: "submitted" },
      [`form__${OTHER}`]: { roundId: "form", uid: OTHER, formVersion: 2, status: "submitted" },
    },
    admissionApplicationPrivate: {
      [`older__${UID}`]: { accessRequirements: "A step-free room." },
    },
    [DECISIONS_COLLECTION]: {
      // The `uid` field is deliberately WRONG on this one. The document at an
      // application's id is that applicant's whatever it says about itself,
      // and a sweep keyed on the field would walk straight past it.
      [`form__${UID}`]: {
        roundId: "form",
        uid: "somebody-else",
        programmes: { agi: { decision: "pool", decidedByUid: "lead1" } },
      },
      [`form__${OTHER}`]: {
        roundId: "form",
        uid: OTHER,
        programmes: { agi: { decision: "accept", decidedByUid: "lead1" } },
      },
    },
  };
}

test("the collection the cascade spells out is the one the application system writes", () => {
  // `accountDeletion.ts` names its collections as literals, so this one is in
  // two files. A rename in one and not the other would leave the cascade
  // sweeping a collection nothing fills, with nothing failing.
  assert.equal(DECISIONS_COLLECTION, "admissionDecisions");
  assert.match(
    codeOf(join(SRC, "lib", "firestore", "accountDeletion.ts")),
    /collection\("admissionDecisions"\)\.doc\(d\.id\)/,
    "the cascade no longer addresses the decision at its application's id",
  );
});

test("a deleted account's decision goes in the same batch as its application", async () => {
  const db = makeDb(seed());

  const summary = await deleteAccountCascade(auth, db, UID);

  assert.equal(summary.admissionApplicationsDeleted, 2);
  assert.equal(summary.admissionApplicationPrivateDeleted, 1);
  assert.equal(
    summary.admissionDecisionsDeleted,
    1,
    "one decision document existed for this account. A count of refs rather than of " +
      "documents would say 2, and a sweep keyed on the uid field would say 0.",
  );
  assert.equal(summary.warning, undefined, "a clean teardown carries no warning");

  for (const path of [
    `admissionApplications/form__${UID}`,
    `admissionApplications/older__${UID}`,
    `admissionApplicationPrivate/older__${UID}`,
    `admissionDecisions/form__${UID}`,
  ]) {
    assert.equal(db.has(path), false, `${path} must be gone`);
  }

  const together = db.batches.find((paths) =>
    paths.includes(`admissionApplications/form__${UID}`),
  );
  assert.ok(together, "the application was deleted in a batch");
  assert.ok(
    together.includes(`admissionDecisions/form__${UID}`),
    "the decision was not deleted in its application's batch",
  );
  assert.ok(
    together.includes(`admissionApplicationPrivate/older__${UID}`),
    "and the access-requirements row still rides in that batch, as it always did",
  );
});

test("nobody else's application or decision is touched", async () => {
  const db = makeDb(seed());

  await deleteAccountCascade(auth, db, UID);

  assert.ok(db.has(`admissionApplications/form__${OTHER}`));
  assert.ok(
    db.has(`admissionDecisions/form__${OTHER}`),
    "another applicant's decision was deleted. The cascade addresses the decision at each " +
      "of ITS OWN account's application ids and nothing else.",
  );
});

test("a batch that fails leaves the application and its decision both standing", async (t) => {
  muteExpectedError(t);
  const db = makeDb(seed());
  db.failDeletes.add(`admissionDecisions/form__${UID}`);

  const summary = await deleteAccountCascade(auth, db, UID);

  // The point of one batch: there is no outcome in which the application has
  // gone and the judgement about it has not. Both stay, and the retry is the
  // same operation again.
  assert.ok(db.has(`admissionApplications/form__${UID}`), "the application must survive");
  assert.ok(db.has(`admissionDecisions/form__${UID}`), "and so must its decision");
  assert.ok(db.has(`admissionApplicationPrivate/older__${UID}`));
  assert.equal(summary.admissionApplicationsDeleted, 0);
  assert.equal(summary.admissionDecisionsDeleted, 0);

  // Best-effort like every admissions step: the rest of the teardown still
  // ran, and the registration row is kept so the deletion is run again.
  assert.equal(summary.userDocDeleted, true);
  assert.equal(summary.registrationDeleted, false);
  assert.match(summary.warning ?? "", /registration row was kept/);

  // And the retry finishes it.
  db.failDeletes.clear();
  const retry = await deleteAccountCascade(auth, db, UID);
  assert.equal(retry.admissionApplicationsDeleted, 2);
  assert.equal(retry.admissionDecisionsDeleted, 1);
  assert.equal(db.has(`admissionDecisions/form__${UID}`), false);
  assert.equal(retry.registrationDeleted, true);
});

test("an account with applications and no decisions reports zero, measured", async () => {
  // Zero is also what a sweep that never ran would report, so it is measured
  // against a collection that exists and holds somebody else's decision.
  const world = seed();
  delete world[DECISIONS_COLLECTION][`form__${UID}`];
  const db = makeDb(world);

  const summary = await deleteAccountCascade(auth, db, UID);

  assert.equal(summary.admissionApplicationsDeleted, 2);
  assert.equal(summary.admissionDecisionsDeleted, 0);
  assert.ok(db.has(`admissionDecisions/form__${OTHER}`));
});
