/**
 * Accepting somebody approves an account that is still waiting: the one
 * function that does it, EXECUTED against an in-memory Firestore as every
 * kind of account and in every kind of approver's name.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * `approveWaitingAccount` (`src/lib/applications/accounts/approve.ts`) changes
 * a role, which is a trust boundary, so it is held to three things whoever
 * calls it and whatever they pass:
 *
 *  1. ONLY A WAITING ACCOUNT IS APPROVED. `pending` becomes `member`, with the
 *     change the Approvals tab makes and no other. A member, a committee
 *     member, an admin and a refused account are left exactly as they are, so
 *     it can demote nobody and undo no refusal, and calling it twice changes
 *     nothing the second time.
 *  2. ONLY ON AN ACCEPTANCE: a place they were told they have and have not
 *     given up, or an invitation they have accepted, on the form that is
 *     named. It is not a way to approve an arbitrary account.
 *  3. ONLY IN AN ADMIN'S NAME, checked on the approver's own account at the
 *     moment of the write. A lead, a reviewer, a member and the waiting
 *     account itself cannot be the approver.
 *
 * It also must stay importable by a route that serves an applicant (an
 * invited person accepting), so its import graph is walked here and must not
 * reach the staff repository or name either staff-only collection.
 *
 * Faked: `server-only` and the `firebase-admin/firestore` sentinels. The
 * function, the normaliser and the repository's references are the shipping
 * code.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const NOW = new Date("2026-10-23T11:00:00Z");
const BEFORE = new Date("2026-10-20T09:00:00Z");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  delete: () => ({ __op: 'delete' }),\n" +
        "};",
    ],
  ]),
});

const { approveWaitingAccount, holdsAcceptance } = await loadTs(
  join("lib", "applications", "accounts", "approve.ts"),
);
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));

// ---------------------------------------------------------------------------
// A Firestore small enough to read, whose transactions conflict like the real one
// ---------------------------------------------------------------------------

function makeDb(initial) {
  const docs = new Map(Object.entries(initial).map(([path, data]) => [path, structuredClone(data)]));
  const versions = new Map();
  const counters = { reads: 0, writes: 0 };
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
    versions.set(op.path, (versions.get(op.path) ?? 0) + 1);
    if (!docs.has(op.path)) throw new Error(`NOT_FOUND: ${op.path}`);
    const next = structuredClone(docs.get(op.path));
    for (const [field, value] of Object.entries(op.data)) {
      if (value && typeof value === "object" && value.__op === "delete") delete next[field];
      else if (value && typeof value === "object" && value.__op === "serverTimestamp") next[field] = new Date(NOW);
      else next[field] = value;
    }
    docs.set(op.path, next);
  };
  return {
    counters,
    collection: (name) => ({ doc: (id) => ({ id, path: `${name}/${id}` }) }),
    async runTransaction(fn) {
      for (let attempt = 1; ; attempt += 1) {
        const ops = [];
        const seen = new Map();
        const result = await fn({
          get: async (r) => {
            if (!seen.has(r.path)) seen.set(r.path, versions.get(r.path) ?? 0);
            return snap(r.path);
          },
          update: (r, data) => ops.push({ path: r.path, data }),
        });
        if ([...seen].some(([path, version]) => (versions.get(path) ?? 0) !== version)) {
          if (attempt >= 5) throw new Error("ABORTED: too much contention");
          continue;
        }
        ops.forEach(apply);
        return result;
      }
    },
    read: (path) => docs.get(path),
  };
}

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const OTHER_ROUND = "spring-2027__z9y8x7w6";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";

const account = (name, role, extra = {}) => ({
  uid: name.toLowerCase(),
  email: `${name.toLowerCase()}@example.com`,
  displayName: `${name} Example`,
  role,
  profile: { preferredName: name, subject: "BSc Physics", motivation: "I want to help." },
  createdAt: BEFORE,
  ...extra,
});

function application(uid, over = {}, roundId = ROUND) {
  const content = {
    aboutYou: { preferredName: uid, subject: "BSc Physics", status: "undergraduate", expectedGraduation: "2027-07" },
    rankedProgrammeIds: [AGI],
    wantsToFacilitate: false,
    answers: {},
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId,
    uid,
    email: `${uid}@example.com`,
    displayName: `${uid} Example`,
    draft: content,
    sent: content,
    status: "accepted",
    result: { kind: "accepted", programmeId: AGI, publishedAt: NOW, email: "sent", emailedAt: NOW, emailClaimedAt: null },
    invitation: null,
    attendance: null,
    ...over,
  };
}

const INVITED = (response) => ({
  status: "invited",
  result: { kind: "invited", programmeId: TAIS, publishedAt: NOW, email: "sent", emailedAt: NOW, emailClaimedAt: null },
  invitation: { programmeId: TAIS, replyBy: "2026-10-25", response, respondedAt: response ? NOW : null, lastReminderOn: null },
});

/** Wen is accepted and waiting. Zach is an admin. The rest are who they say. */
function seed(over = {}) {
  return {
    "users/zach": account("Zach", "admin"),
    "users/priya": account("Priya", "admin"),
    "users/claudia": account("Claudia", "committee", { suRecognised: true }),
    "users/lloyd": account("Lloyd", "committee", { suRecognised: true }),
    "users/amara": account("Amara", "member"),
    "users/wen": account("Wen", "pending"),
    [`admissionApplications/${ROUND}__wen`]: application("wen"),
    ...over,
  };
}

const approve = (db, over = {}) =>
  approveWaitingAccount(db, { uid: "wen", roundId: ROUND, approvedByUid: "zach", ...over });

// ---------------------------------------------------------------------------
// 1. A waiting account, accepted, in an admin's name
// ---------------------------------------------------------------------------

describe("a waiting account that has been accepted is approved", () => {
  test("it becomes a member's, with who approved and when, and nothing else on it moves", async () => {
    const db = makeDb(seed());
    const before = structuredClone(db.read("users/wen"));
    assert.deepEqual(await approve(db), { approved: true });
    assert.deepEqual(db.read("users/wen"), { ...before, role: "member", approvedAt: NOW, approvedBy: "zach" });
    assert.equal(db.counters.writes, 1);
  });

  test("what an earlier refusal left behind is cleared, as the Approvals tab clears it", async () => {
    // Refused once, put back in the queue, and now accepted.
    const requeued = account("Wen", "pending", { rejectedAt: BEFORE, rejectedBy: "priya", rejectionReason: "not-uon" });
    const db = makeDb(seed({ "users/wen": requeued }));
    assert.deepEqual(await approve(db), { approved: true });
    const after = db.read("users/wen");
    assert.deepEqual([after.role, after.approvedBy, "rejectedAt" in after, "rejectedBy" in after], ["member", "zach", false, false]);
    assert.equal(after.rejectionReason, "not-uon", "only the two fields the Approvals tab removes are removed");
  });

  test("nobody else's document is written: not the approver's, not the application", async () => {
    const db = makeDb(seed());
    const zach = structuredClone(db.read("users/zach"));
    const sent = structuredClone(db.read(`admissionApplications/${ROUND}__wen`));
    await approve(db);
    assert.deepEqual(db.read("users/zach"), zach);
    assert.deepEqual(db.read(`admissionApplications/${ROUND}__wen`), sent);
  });

  test("called twice, the second call changes nothing and says why", async () => {
    const db = makeDb(seed());
    await approve(db);
    const once = structuredClone(db.read("users/wen"));
    // A different admin, a moment later: the first approval stands as recorded.
    assert.deepEqual(await approve(db, { approvedByUid: "priya" }), { approved: false, why: "not-waiting", role: "member" });
    assert.deepEqual(db.read("users/wen"), once);
    assert.equal(db.counters.writes, 1);
  });

  test("two calls at once approve it once", async () => {
    const db = makeDb(seed());
    const outcomes = await Promise.all([approve(db), approve(db, { approvedByUid: "priya" })]);
    assert.deepEqual(outcomes.filter((outcome) => outcome.approved).length, 1);
    assert.deepEqual(
      outcomes.find((outcome) => !outcome.approved),
      { approved: false, why: "not-waiting", role: "member" },
    );
    assert.equal(db.counters.writes, 1);
    assert.equal(db.read("users/wen").role, "member");
  });
});

// ---------------------------------------------------------------------------
// 2. Every kind of account
// ---------------------------------------------------------------------------

describe("only a waiting account is approved: every other kind is left exactly as it is", () => {
  const KINDS = [
    ["a member", account("Wen", "member", { approvedAt: BEFORE, approvedBy: "priya" }), "member"],
    ["a committee member", account("Wen", "committee", { suRecognised: true, title: "Events lead" }), "committee"],
    ["an admin", account("Wen", "admin"), "admin"],
    ["a refused account", account("Wen", "rejected", { rejectedAt: BEFORE, rejectedBy: "priya", rejectionReason: "not-uon" }), "rejected"],
    ["an account whose role is a word nobody knows", account("Wen", "superuser"), "superuser"],
    ["an account with no role at all", (() => { const a = account("Wen", "pending"); delete a.role; return a; })(), ""],
    ["an account whose role is not text", account("Wen", 7), ""],
    ["an account whose role is nearly the word", account("Wen", "Pending"), "Pending"],
  ];

  for (const [who, stored, role] of KINDS) {
    test(`${who}: untouched, and reported as not waiting`, async () => {
      const db = makeDb(seed({ "users/wen": stored }));
      const before = structuredClone(db.read("users/wen"));
      assert.deepEqual(await approve(db), { approved: false, why: "not-waiting", role });
      assert.deepEqual(db.read("users/wen"), before);
      assert.equal(db.counters.writes, 0);
    });
  }

  test("nobody's account is ever made anything but a member's", async () => {
    // Whatever goes in, the only role this function writes is `member`, and
    // only over `pending`.
    for (const [, stored] of KINDS) {
      const db = makeDb(seed({ "users/wen": stored }));
      await approve(db);
      assert.deepEqual(db.read("users/wen").role, stored.role);
    }
  });

  test("somebody with no account document: nothing is created for them", async () => {
    const db = makeDb(seed());
    const gone = Object.fromEntries(Object.entries(seed()).filter(([path]) => path !== "users/wen"));
    const empty = makeDb(gone);
    assert.deepEqual(await approve(empty), { approved: false, why: "no-account" });
    assert.equal(empty.read("users/wen"), undefined);
    assert.equal(empty.counters.writes, 0);
    assert.equal(db.counters.writes, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Only on an acceptance
// ---------------------------------------------------------------------------

describe("only somebody accepted on the named form is approved", () => {
  const NOT_ACCEPTED = [
    ["no application on the form at all", null],
    ["an application sent and not yet decided", { status: "submitted", result: null }],
    ["a kind no", { status: "no-offer", result: { kind: "no-offer", programmeId: null, publishedAt: NOW } }],
    ["a declined application", { status: "declined", result: { kind: "declined", programmeId: null, publishedAt: NOW } }],
    ["an invitation nobody has answered", INVITED(null)],
    ["an invitation they turned down", INVITED("declined")],
    ["a place they have said they can't take", { attendance: { answer: "cant-make-it", answeredAt: NOW } }],
    ["a place on an application since withdrawn", { status: "withdrawn", withdrawnAt: NOW }],
    ["a result on an application that was never sent", { sent: null }],
    ["a result of a kind nobody knows", { result: { kind: "shortlisted", programmeId: AGI, publishedAt: NOW } }],
  ];

  for (const [what, over] of NOT_ACCEPTED) {
    test(`${what}: the account stays waiting`, async () => {
      const path = `admissionApplications/${ROUND}__wen`;
      const docs = seed();
      if (over === null) delete docs[path];
      else docs[path] = application("wen", over);
      const db = makeDb(docs);
      const before = structuredClone(db.read("users/wen"));
      assert.deepEqual(await approve(db), { approved: false, why: "not-accepted" });
      assert.deepEqual(db.read("users/wen"), before);
      assert.equal(db.counters.writes, 0);
    });
  }

  test("a place they have said they are coming to, and one they have not replied about, both count", async () => {
    for (const attendance of [null, { answer: "coming", answeredAt: NOW }]) {
      const db = makeDb(seed({ [`admissionApplications/${ROUND}__wen`]: application("wen", { attendance }) }));
      assert.deepEqual(await approve(db), { approved: true });
    }
  });

  test("an invitation they have accepted counts", async () => {
    const db = makeDb(seed({ [`admissionApplications/${ROUND}__wen`]: application("wen", INVITED("accepted")) }));
    assert.deepEqual(await approve(db), { approved: true });
    assert.equal(db.read("users/wen").role, "member");
  });

  test("an acceptance on another form is not an acceptance on this one", async () => {
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__wen`]: application("wen", { status: "submitted", result: null }),
        [`admissionApplications/${OTHER_ROUND}__wen`]: application("wen", {}, OTHER_ROUND),
      }),
    );
    assert.deepEqual(await approve(db), { approved: false, why: "not-accepted" });
    assert.deepEqual(await approve(db, { roundId: OTHER_ROUND }), { approved: true });
  });

  test("somebody else's acceptance approves nobody but them", async () => {
    // Amara is accepted; Wen is not. Naming Wen with Amara's form changes nothing.
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__wen`]: application("wen", { status: "submitted", result: null }),
        [`admissionApplications/${ROUND}__amara`]: application("amara"),
      }),
    );
    assert.deepEqual(await approve(db), { approved: false, why: "not-accepted" });
    assert.equal(db.read("users/wen").role, "pending");
  });

  test("an application stored under her id that says it is somebody else's is not hers", async () => {
    const db = makeDb(seed({ [`admissionApplications/${ROUND}__wen`]: application("amara") }));
    assert.deepEqual(await approve(db), { approved: false, why: "not-accepted" });
    const elsewhere = makeDb(seed({ [`admissionApplications/${ROUND}__wen`]: application("wen", {}, OTHER_ROUND) }));
    assert.deepEqual(await approve(elsewhere), { approved: false, why: "not-accepted" });
  });

  test("an application to an older kind of round is not an acceptance", async () => {
    const older = { ...application("wen"), formVersion: 1 };
    const db = makeDb(seed({ [`admissionApplications/${ROUND}__wen`]: older }));
    assert.deepEqual(await approve(db), { approved: false, why: "not-accepted" });
  });

  test("the acceptance is read off the stored application, the way every screen reads it", () => {
    const read = (over) => normalise.normaliseApplication(`${ROUND}__wen`, application("wen", over));
    assert.equal(holdsAcceptance(read({})), true);
    assert.equal(holdsAcceptance(read(INVITED("accepted"))), true);
    assert.equal(holdsAcceptance(read(INVITED(null))), false);
    assert.equal(holdsAcceptance(read({ attendance: { answer: "cant-make-it" } })), false);
    assert.equal(holdsAcceptance(read({ status: "withdrawn" })), false);
    assert.equal(holdsAcceptance(null), false);
  });
});

// ---------------------------------------------------------------------------
// 4. Only in an admin's name
// ---------------------------------------------------------------------------

describe("only an admin can be the one who approved", () => {
  const NOT_ADMINS = [
    ["the lead of the programme that accepted her", "claudia"],
    ["a reviewer on the form", "lloyd"],
    ["a member", "amara"],
    ["the waiting account itself", "wen"],
    ["somebody with no account", "nobody-here"],
  ];

  for (const [who, approvedByUid] of NOT_ADMINS) {
    test(`${who}: refused, and the account stays waiting`, async () => {
      const db = makeDb(seed());
      const before = structuredClone(db.read("users/wen"));
      assert.deepEqual(await approve(db, { approvedByUid }), { approved: false, why: "approver-not-admin" });
      assert.deepEqual(db.read("users/wen"), before);
      assert.equal(db.counters.writes, 0);
    });
  }

  test("an admin who has since stopped being one cannot be named", async () => {
    for (const role of ["committee", "member", "pending", "rejected", "Admin", "", undefined]) {
      const demoted = account("Zach", role);
      if (role === undefined) delete demoted.role;
      const db = makeDb(seed({ "users/zach": demoted }));
      assert.deepEqual(await approve(db), { approved: false, why: "approver-not-admin" }, String(role));
      assert.equal(db.read("users/wen").role, "pending");
    }
  });

  test("the approver is asked first, so a non-admin learns nothing about the account", async () => {
    // Whatever state the account is in, a non-admin approver gets one answer.
    for (const stored of [account("Wen", "member"), account("Wen", "rejected"), account("Wen", "pending")]) {
      const db = makeDb(seed({ "users/wen": stored }));
      assert.deepEqual(await approve(db, { approvedByUid: "claudia" }), { approved: false, why: "approver-not-admin" });
    }
    const gone = makeDb(Object.fromEntries(Object.entries(seed()).filter(([path]) => path !== "users/wen")));
    assert.deepEqual(await approve(gone, { approvedByUid: "claudia" }), { approved: false, why: "approver-not-admin" });
  });

  test("a request with a piece missing approves nobody and reads nothing", async () => {
    for (const over of [{ uid: "" }, { roundId: "" }, { approvedByUid: "" }]) {
      const db = makeDb(seed());
      const outcome = await approve(db, over);
      assert.equal(outcome.approved, false, JSON.stringify(over));
      assert.deepEqual(db.counters, { reads: 0, writes: 0 });
    }
  });
});

// ---------------------------------------------------------------------------
// 5. A route that serves an applicant may import it
// ---------------------------------------------------------------------------

describe("it can be imported where an applicant is served", () => {
  /** Every local file `entry` reaches, by following its imports. */
  function graph(entry) {
    const seen = new Set();
    const resolve = (from, specifier) => {
      const base = specifier.startsWith("@/")
        ? join(SRC, specifier.slice(2))
        : specifier.startsWith(".")
          ? join(dirname(from), specifier)
          : null;
      if (!base) return null;
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base]) {
        if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
      }
      return null;
    };
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
        const next = resolve(file, match[1]);
        if (next) walk(next);
      }
    };
    walk(entry);
    return [...seen];
  }

  const files = graph(join(SRC, "lib", "applications", "accounts", "approve.ts"));

  test("the walk found the function's own file and what it reads through", () => {
    const names = files.map((file) => file.slice(SRC.length + 1));
    assert.ok(names.includes(join("lib", "applications", "accounts", "approve.ts")));
    assert.ok(names.includes(join("lib", "applications", "repo.ts")), "it reads the application through the applicant-safe repository");
    assert.ok(names.includes(join("lib", "applications", "normalise.ts")));
  });

  test("it never reaches the staff repository, and no file it reaches names a staff-only collection", () => {
    for (const file of files) {
      const name = file.slice(SRC.length + 1);
      assert.ok(!/staffRepo\.ts$/.test(file), `${name} is the staff repository`);
      const source = readFileSync(file, "utf8");
      for (const collection of ["admissionDecisions", "admissionReviews"]) {
        assert.ok(!source.includes(`"${collection}"`), `${name} names ${collection}`);
      }
    }
  });
});
