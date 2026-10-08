/**
 * A LOG LINE ABOUT A DECISION NAMES THE APPLICANT BY ACCOUNT ID, NEVER BY NAME.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * The course audit log is kept when an account is deleted: it is the record
 * of what the committee did, and erasing it with the account would erase the
 * only evidence an action happened. So a line about a decision on an
 * application must not be the thing that goes on naming somebody who has
 * asked to be forgotten. Who a line is about is its `subjectUid`. While the
 * account exists the id leads to the name; once the account has gone it leads
 * nowhere. No other field on the row may say who it was.
 *
 * Five kinds of line are about an application form, the ones that start
 * `application-`. This file holds every one of them to the rule, two ways:
 *
 *  1. THE TREE IS WALKED. Every file in `src` that names one of the five
 *     kinds is listed below with what it does with it. A file that WRITES a
 *     line has to be one the second half runs. Checked both ways, so a new
 *     writer cannot arrive without being read against the rule.
 *  2. EVERY WRITER IS RUN, against a term in which each applicant has a name
 *     no other string contains, and every row it writes is searched for those
 *     names, field by field.
 *
 * Real: the writers, `access.ts`, the eligibility bar and the contract's pure
 * functions. Faked: `server-only`, the sentinels `firebase-admin/firestore`
 * supplies, and the Admin SDK handle, the session and the mail door, none of
 * which is called. The database is `tests/lib/applicationsStore.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  APPLICANTS,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  decisionPath,
  namesOf,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    // The send's module reaches the Admin SDK handle and the mail door. This
    // file calls neither: it runs the one pure function that writes the
    // sentence, so both are stubs that refuse to be used.
    ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ["@/lib/email/send", "export async function sendEmail() { throw new Error('no mail leaves a test'); }"],
  ]),
});
const audit = await loadTs(join("lib", "applications", "review", "audit.ts"));
const decide = await loadTs(join("lib", "applications", "review", "decide.ts"));
const pool = await loadTs(join("lib", "applications", "decisionDay", "pool.ts"));
const send = await loadTs(join("lib", "applications", "decisionDay", "send.ts"));
const { COURSE_AUDIT_KINDS, COURSE_AUDIT_COLLECTION } = await loadTs(
  join("lib", "firestore", "courseAudit.ts"),
);

/** The kinds that are about an application form. Read off the log's own list. */
const APPLICATION_KINDS = COURSE_AUDIT_KINDS.filter((kind) => kind.startsWith("application-"));

// ---------------------------------------------------------------------------
// 1. The tree: who names an application kind
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

/** The constants that hold a kind, so a file is found whichever way it names one. */
const KIND_CONSTANTS = [
  "DECISION_AUDIT_KIND",
  "REVOCATION_AUDIT_KIND",
  "POOLED_OUTCOME_AUDIT_KIND",
  "DECISIONS_SENT_AUDIT_KIND",
];

function namesAKind(code) {
  if (KIND_CONSTANTS.some((name) => new RegExp(`\\b${name}\\b`).test(code))) return true;
  return APPLICATION_KINDS.some((kind) => new RegExp(`["'\`]${kind}["'\`]`).test(code));
}

/** A call that puts a row into the log. */
const WRITES_A_ROW = /COURSE_AUDIT_COLLECTION\)\s*\.doc\(\)|COURSE_AUDIT_COLLECTION\)\s*\.add\(/;

/**
 * Every file in `src` whose code names an application kind, and what it does
 * with it.
 *
 *  - `declares`: it gives the kind its name, and writes nothing.
 *  - `reads`: it finds rows of that kind and writes none.
 *  - `writes`: it appends rows. `ran` says where this file runs it.
 *
 * A NEW ENTRY IS A DECISION. A file that writes a line about an application
 * stores the applicant in `subjectUid` and nowhere else, and gets a case in
 * the second half of this file that proves it.
 */
const NAMES_AN_APPLICATION_KIND = new Map([
  [
    "src/lib/firestore/courseAudit.ts",
    { role: "declares", why: "the log's own union, list and labels for every kind" },
  ],
  [
    "src/lib/applications/review/audit.ts",
    {
      role: "declares",
      why: "names the two kinds a decision writes, and builds their sentences, neither of which is handed a name",
    },
  ],
  [
    "src/lib/applications/decisionDay/programmes.ts",
    { role: "declares", why: "names the two kinds decision day writes" },
  ],
  [
    "src/lib/applications/review/load.ts",
    {
      role: "reads",
      why: "finds the last revocation for one programme, to show its lead who took the acceptance back and why",
    },
  ],
  [
    "src/lib/applications/review/decide.ts",
    {
      role: "writes",
      why: "one row for each decision, one of several or on its own, and one for each acceptance taken back",
      ran: "a lead's decision, several at once, and a revoked acceptance",
    },
  ],
  [
    "src/lib/applications/decisionDay/pool.ts",
    {
      role: "writes",
      why: "one row for one pooled applicant's outcome, and one row with no subject for everybody left",
      ran: "an outcome picked for one pooled applicant, and for everybody left",
    },
  ],
  [
    "src/lib/applications/decisionDay/send.ts",
    {
      role: "writes",
      why: "one row for each press of Send, with no subject, listing account ids for emails still owed",
      ran: "the sentence a press of Send writes",
    },
  ],
]);

describe("who names an application kind", () => {
  test("the five kinds are the ones this file was written for", () => {
    assert.deepEqual([...APPLICATION_KINDS].sort(), [
      "application-decision",
      "application-decision-revoked",
      "application-decisions-sent",
      "application-exception",
      "application-pooled-outcome",
    ]);
  });

  test("every file that names one is listed, with what it does", () => {
    const found = sourceFiles()
      .filter((file) => namesAKind(codeOf(file)))
      .map(rel)
      .sort();
    assert.deepEqual(
      found,
      [...NAMES_AN_APPLICATION_KIND.keys()].sort(),
      "the files that name an application audit kind are not the ones listed in " +
        "NAMES_AN_APPLICATION_KIND. A file that writes a line about an application is added " +
        "as `writes`, stores the applicant in `subjectUid` and nowhere else, and gets a case " +
        "below that runs it. An entry for a file that no longer names a kind is removed.",
    );
    for (const [file, entry] of NAMES_AN_APPLICATION_KIND) {
      assert.ok(["declares", "reads", "writes"].includes(entry.role), `${file} has no role`);
      assert.ok(entry.why.length > 30, `${file} needs a written reason`);
    }
  });

  test("what each entry says it does is what its code does", () => {
    for (const [file, entry] of NAMES_AN_APPLICATION_KIND) {
      const writes = WRITES_A_ROW.test(codeOf(join(REPO_ROOT, file)));
      assert.equal(
        writes,
        entry.role === "writes",
        `${file} is listed as \`${entry.role}\` and its code ${writes ? "appends" : "does not append"} to the log`,
      );
      if (entry.role === "writes") {
        assert.ok(entry.ran?.length > 10, `${file} writes rows and does not say which case runs it`);
      }
    }
  });

  test("nothing writes the exception kind yet, and the day something does it is caught above", () => {
    // The kind is declared for an action no route offers. Its writer, when
    // one is written, names the kind and so lands in the walk.
    const writers = sourceFiles().filter((file) => {
      const code = codeOf(file);
      return /["'`]application-exception["'`]/.test(code) && WRITES_A_ROW.test(code);
    });
    assert.deepEqual(writers.map(rel), []);
  });
});

// ---------------------------------------------------------------------------
// 2. Every writer, run
// ---------------------------------------------------------------------------

const auditRows = (db) =>
  db
    .paths()
    .filter((path) => path.startsWith(`${COURSE_AUDIT_COLLECTION}/`))
    .map((path) => db.read(path));

/** Every word of every applicant's name, and every address of theirs. */
const APPLICANT_NAMES = APPLICANTS.flatMap(([uid]) => namesOf(uid));

/**
 * The rule, asked of one row: it says whose it is by id, where it is about
 * one person, and no string anywhere in it is an applicant's name or address.
 * `reason` is what an admin typed, which this file passes in without a name.
 */
function assertNamesNobody(row, subjectUid) {
  assert.equal(row.subjectUid, subjectUid, "the row's subject is the applicant's account id");
  assert.equal(row.roundId, ROUND, "and it is keyed to its form, so the form's destroy finds it");
  assert.equal(row.runId, "");
  const strings = stringsIn(row);
  for (const name of APPLICANT_NAMES) {
    assert.ok(
      !strings.some((text) => text.includes(name)),
      `a ${row.kind} row holds "${name}": ${JSON.stringify(row)}`,
    );
  }
}

const deciding = (over = {}) =>
  makeDb(seedTerm({ round: { status: "deciding" }, over }), { now: WHILE_DECIDING });

const accepted = (by) => ({
  decision: "accept",
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: WHILE_DECIDING,
});
const pooled = (by) => ({ ...accepted(by), decision: "pool" });

describe("a lead's decision", () => {
  for (const decision of ["accept", "pool", "decline"]) {
    test(`${decision}: the row holds the applicant's id and not their name`, async () => {
      const db = deciding();
      const result = await decide.decideApplication(db, CAST.claudia, ROUND, "amara", {
        programmeId: AGI,
        decision,
        poolReason: null,
        couldSuitProgrammeId: null,
      });
      assert.deepEqual(result, { ok: true, changed: true });
      const rows = auditRows(db);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, "application-decision");
      assertNamesNobody(rows[0], "amara");
      // The actor is named: the log is the record of who did what.
      assert.equal(rows[0].actorUid, "claudia");
    });
  }

  test("several at once: one row each, each with its own applicant's id", async () => {
    const db = deciding();
    const result = await decide.decideMany(db, CAST.claudia, ROUND, AGI, {
      uids: ["amara", "dev", "wen"],
      decision: "pool",
    });
    assert.equal(result.ok && result.result.changed, 3);
    const rows = auditRows(db);
    assert.deepEqual(rows.map((row) => row.subjectUid).sort(), ["amara", "dev", "wen"]);
    for (const row of rows) assertNamesNobody(row, row.subjectUid);
  });

  test("a changed mind: the second row says what it replaced, and still names nobody", async () => {
    const db = deciding();
    const change = { programmeId: AGI, poolReason: null, couldSuitProgrammeId: null };
    await decide.decideApplication(db, CAST.claudia, ROUND, "dev", { ...change, decision: "accept" });
    await decide.decideApplication(db, CAST.claudia, ROUND, "dev", { ...change, decision: "pool" });
    const rows = auditRows(db);
    assert.equal(rows.length, 2);
    for (const row of rows) assertNamesNobody(row, "dev");
    assert.ok(rows.some((row) => row.detail.endsWith("It was accepted before.")));
  });
});

describe("an acceptance taken back", () => {
  test("the row holds the applicant's id, the reason as typed, and not their name", async () => {
    const db = deciding({
      [decisionPath("amara")]: {
        roundId: ROUND,
        uid: "amara",
        programmes: { [AGI]: accepted("claudia") },
        pooledOutcome: null,
        exception: null,
      },
    });
    const result = await decide.revokeAcceptance(db, CAST.zach, ROUND, "amara", {
      programmeId: AGI,
      reason: "The place was offered by mistake.",
    });
    assert.deepEqual(result, { ok: true });
    const rows = auditRows(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "application-decision-revoked");
    assert.equal(rows[0].reason, "The place was offered by mistake.");
    assertNamesNobody(rows[0], "amara");
  });
});

describe("a pooled applicant's outcome", () => {
  const everyPooled = () =>
    deciding({
      [decisionPath("dev")]: {
        roundId: ROUND,
        uid: "dev",
        programmes: { [AGI]: pooled("claudia") },
        pooledOutcome: null,
        exception: null,
      },
      [decisionPath("amara")]: {
        roundId: ROUND,
        uid: "amara",
        programmes: { [AGI]: pooled("claudia"), [TAIS]: pooled("tess") },
        pooledOutcome: null,
        exception: null,
      },
    });
  const ACTOR = { uid: "zach", displayName: "Zach Levin" };

  test("an invitation for one person: their id, and not their name", async () => {
    const db = everyPooled();
    const result = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      uid: "dev",
      choice: { kind: "invite", programmeId: INCUBATOR },
    });
    assert.deepEqual(result, { ok: true, changed: 1 });
    const rows = auditRows(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "application-pooled-outcome");
    assertNamesNobody(rows[0], "dev");
  });

  test("no offer for everybody left: one row, about nobody in particular", async () => {
    const db = everyPooled();
    const result = await pool.setPooledOutcome(db, ACTOR, ROUND, {
      everyoneWithoutOne: true,
      choice: { kind: "no-offer" },
    });
    assert.deepEqual(result, { ok: true, changed: 2 });
    const rows = auditRows(db);
    assert.equal(rows.length, 1);
    assertNamesNobody(rows[0], null);
  });
});

describe("a press of Send", () => {
  const REPORT = {
    owedOnly: false,
    published: 3,
    retried: 0,
    emailed: 1,
    held: 0,
    suppressed: 0,
    failed: 1,
    unconfirmed: 1,
    notEmailed: 0,
    skipped: 0,
    changed: 0,
    notReached: 0,
    stopped: null,
    complete: true,
    accountsApproved: 0,
    // The page that reports the press names these people. The log must not.
    unconfirmedNames: ["Amara Okafor"],
  };

  test("the sentence lists account ids for emails still owed, and no name", () => {
    const sentence = send.auditDetail("Autumn 2026", REPORT, ["dev"], ["amara"]);
    assert.match(sentence, /Email still owed to: dev\./);
    assert.match(sentence, /Email unconfirmed for: amara\.$/);
    for (const name of APPLICANT_NAMES) {
      assert.ok(!sentence.includes(name), `the sentence holds "${name}": ${sentence}`);
    }
  });

  test("the row a press writes is about no one person, and takes its sentence from that function", () => {
    const code = codeOf(join(SRC, "lib", "applications", "decisionDay", "send.ts"));
    const at = code.indexOf("kind: DECISIONS_SENT_AUDIT_KIND");
    assert.ok(at !== -1, "the send no longer writes a decisions-sent row where this looks");
    const row = code.slice(at, code.indexOf("});", at));
    assert.match(row, /subjectUid: null,/);
    assert.match(row, /detail: auditDetail\(form\.round\.label, report, failedUids, unconfirmedUids\),/);
    assert.doesNotMatch(row, /unconfirmedNames|\.name\b|displayName(?!\s*\?\?)/);
  });
});

describe("the two sentences a decision writes", () => {
  test("neither function can be handed a name", () => {
    // The parameter lists, read off the source: a name is not among them.
    const code = codeOf(join(SRC, "lib", "applications", "review", "audit.ts"));
    for (const fn of ["decisionSentence", "revocationSentence"]) {
      const at = code.indexOf(`export function ${fn}(`);
      assert.ok(at !== -1, `${fn} has gone`);
      const signature = code.slice(at, code.indexOf("}): string {", at));
      assert.doesNotMatch(signature, /applicant/i, `${fn} takes something about the applicant`);
    }
    assert.equal(audit.decisionSentence.length, 1);
    assert.equal(audit.revocationSentence.length, 1);
  });
});
