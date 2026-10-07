/**
 * Who may write, asked inside the transaction that writes.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/roles
 *
 * ## The rule this guards
 *
 * Naming a programme's reviewers is an access grant: being named is what
 * lets a person read applications. Two questions decide it. Is the caller
 * this programme's lead, or an admin? And is each person named an admin or
 * SU-recognised committee? Both answers are read off stored documents, and a
 * stored document can change between the moment it is read and the moment a
 * write lands. So:
 *
 *  - BOTH ARE ASKED INSIDE THE TRANSACTION THAT WRITES, of the documents that
 *    transaction read. A lead replaced after the request began, or somebody
 *    named who stopped being eligible, makes the transaction run again and
 *    meet the refusal. Nothing is written on the strength of an earlier read.
 *  - The same holds for every writer in the application system: a question
 *    whose answer depends on a stored document, asked by a function that
 *    writes in a transaction, is asked inside that transaction.
 *
 * ## The two halves of this file
 *
 * THE TREE. Every function under `src/lib/applications` that opens a
 * transaction is read for the questions it asks, and where each is asked.
 *
 * THE ROUTE, run for real against a small term, with the form or a user
 * document changed at each of the two moments that matter: after the
 * request's first read and before its transaction, and while the transaction
 * is running.
 *
 * Real: the handler, `setProgrammeRoles`, `access.ts`, the eligibility bar
 * and the loaders the route answers with. Faked: `next/server`, the
 * sentinels `firebase-admin/firestore` supplies, the view-as guard, the
 * session, and the Admin SDK handle, which is `tests/lib/applicationsStore.mjs`:
 * its transactions run again when something they read was written first.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { AGI, CAST, ROUND, TAIS, WHILE_OPEN, seedTerm } from "./lib/applicationsSmallTerm.mjs";
import { calls, reachOf, scanModule, walkSource } from "./lib/functionScan.mjs";
import { balancedEnd } from "./lib/routeScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY = join(REPO_ROOT, "src", "lib", "applications");
const posix = (path) => path.split(sep).join("/");

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/**
 * THE QUESTIONS WHOSE ANSWER DEPENDS ON A STORED DOCUMENT: a role on a form,
 * a right to read an application, somebody's standing on their account.
 */
const ASKED_OF_A_DOCUMENT = [
  "roleOnProgramme",
  "programmeRolesFor",
  "canSeeForm",
  "canReadApplication",
  "canReviewFor",
  "canDecideFor",
  "canEditProgramme",
  "isNamedWithStanding",
  "isEligibleAdmissionsReviewer",
];

/**
 * A QUESTION THAT ANSWERS ANOTHER. Asking the first inside a transaction is
 * asking the second there too, of the same programme. Each line is read out
 * of `access.ts` below, so it cannot outlive the code it describes.
 */
const ANSWERS = {
  canDecideFor: ["roleOnProgramme"],
  canEditProgramme: ["canDecideFor", "roleOnProgramme"],
  canReviewFor: ["roleOnProgramme"],
};

/**
 * A function that asks one of them before a transaction and not inside it,
 * with why that is right for it. Checked both ways: an entry for a function
 * that now asks inside fails, so the list cannot go on excusing what no
 * longer needs it.
 */
const ASKS_BEFORE_ONLY = {
  "review/saveReview.ts#saveReview":
    "it writes one document, the caller's own review row, and names nobody: no write of it lets anybody read or decide anything",
};

/** The questions a piece of code asks by name. */
const askedIn = (text) => ASKED_OF_A_DOCUMENT.filter((question) => calls(text, question));
/** Those, and every question each of them answers. */
function withWhatTheyAnswer(questions) {
  const out = new Set(questions);
  for (const question of questions) for (const answered of ANSWERS[question] ?? []) out.add(answered);
  return out;
}

/**
 * Every function of the library that reaches a transaction, through itself
 * or the functions of its own file that it calls: what is asked along the
 * way OUTSIDE a transaction, and what is asked INSIDE one.
 *
 * A function is taken with the others of its file it calls, because that is
 * how these writers are written: an exported function checks, and hands on
 * to a private one that opens the transaction. What this cannot see is a
 * question asked in one FILE about a write made in another. The route files
 * are that, and they ask only what the writers ask again.
 */
function throughTransactions() {
  const out = new Map();
  for (const file of walkSource(LIBRARY)) {
    const mod = scanModule(file);
    /** Each function's body, cut into what is inside a transaction and what is not. */
    const cut = new Map();
    for (const fn of mod.functions.values()) {
      const at = fn.body.search(/\.runTransaction\s*(<[^>]*>)?\s*\(/);
      if (at === -1) {
        cut.set(fn.name, { inside: "", outside: fn.body, opens: false });
        continue;
      }
      const open = fn.body.indexOf("(", fn.body.indexOf("runTransaction", at));
      const close = balancedEnd(fn.body, open);
      assert.ok(close > open, `${fn.name}: the end of its transaction was not found`);
      cut.set(fn.name, {
        inside: fn.body.slice(open, close + 1),
        outside: fn.body.slice(0, open) + fn.body.slice(close + 1),
        opens: true,
      });
    }
    /** Everything a function asks, with the functions of its file it calls. */
    const asksWithHelpers = (name) => reachOf(mod, name).flatMap((reached) => askedIn(reached.body));
    for (const fn of mod.functions.values()) {
      const reached = reachOf(mod, fn.name);
      if (!reached.some((other) => cut.get(other.name).opens)) continue;
      const inside = new Set();
      const outside = new Set();
      for (const other of reached) {
        const { inside: within, outside: without } = cut.get(other.name);
        for (const question of askedIn(without)) outside.add(question);
        for (const question of askedIn(within)) inside.add(question);
        // A helper called inside a transaction asks what it asks there.
        for (const helper of mod.functions.keys()) {
          if (helper !== other.name && calls(within, helper)) {
            for (const question of asksWithHelpers(helper)) inside.add(question);
          }
        }
      }
      out.set(`${posix(relative(LIBRARY, file))}#${fn.name}`, {
        inside: [...inside].sort(),
        outside: [...outside].sort(),
      });
    }
  }
  return out;
}

describe("a question about a stored document is asked inside the transaction that writes", () => {
  const found = throughTransactions();

  test("the walk still sees the writers", () => {
    for (const key of [
      "roles.ts#setProgrammeRoles",
      "editor/write.ts#changeProgramme",
      "review/decide.ts#decideApplication",
      "review/decide.ts#decideMany",
      "review/decide.ts#applyDecision",
    ]) {
      assert.ok(found.has(key), `${key} was not found as a function that reaches a transaction`);
    }
    assert.ok(found.size >= 18, `only ${found.size} were found`);
  });

  test("whatever is asked on the way to a transaction is asked inside it, or the function says why it need not be", () => {
    const beforeOnly = [];
    for (const [key, { inside, outside }] of found) {
      const answered = withWhatTheyAnswer(inside);
      if (outside.some((question) => !answered.has(question))) beforeOnly.push(key);
    }
    assert.deepEqual(
      beforeOnly.sort(),
      Object.keys(ASKS_BEFORE_ONLY).sort(),
      "a function decides who may from a read made before a transaction and does not ask again inside it. " +
        "Ask inside, of the documents the transaction read, or add it to ASKS_BEFORE_ONLY with why.",
    );
    for (const [key, why] of Object.entries(ASKS_BEFORE_ONLY)) {
      assert.ok(typeof why === "string" && why.length > 40, `${key} needs its reason written down`);
    }
  });

  test("naming a programme's people asks both of its questions inside", () => {
    const { inside } = found.get("roles.ts#setProgrammeRoles");
    assert.deepEqual(inside, ["isEligibleAdmissionsReviewer", "isNamedWithStanding"]);
  });

  test("a decision asks, inside, whether the caller may decide for the programme and may read the application", () => {
    for (const key of ["review/decide.ts#decideApplication", "review/decide.ts#decideMany"]) {
      assert.deepEqual(found.get(key).inside, ["canDecideFor", "canReadApplication"], key);
    }
  });

  test("a question said to answer another does, in the predicates' own source", () => {
    const access = scanModule(join(LIBRARY, "access.ts"));
    const body = (name) => access.functions.get(name).body.replace(/\s+/g, " ");
    assert.equal(body("canDecideFor"), '{ const role = roleOnProgramme(user, form, programmeId); return role === "admin" || role === "lead"; }');
    assert.equal(body("canEditProgramme"), "{ return canDecideFor(user, form, programmeId); }");
    assert.equal(body("canReviewFor"), "{ return roleOnProgramme(user, form, programmeId) !== null; }");
    assert.deepEqual(Object.keys(ANSWERS).sort(), ["canDecideFor", "canEditProgramme", "canReviewFor"]);
  });

  test("running the term is asked of the session alone, which no stored document can change", () => {
    // `canRunTerm` is not on the list above, and this is why it need not be.
    const access = scanModule(join(LIBRARY, "access.ts"));
    const fn = access.functions.get("canRunTerm");
    assert.deepEqual(fn.params.map((param) => param.name), ["user"]);
    assert.match(fn.body, /^\{\s*return user\.role === "admin";\s*\}$/);
  });
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

const world = { db: null, user: null };
globalThis.__rolesInTx = world;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__rolesInTx.db;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__rolesInTx.user;\n}"],
  ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
]);
const { loadTs } = createLoader({ stubs: STUBS });
const rolesRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "roles", "route.ts"),
);

const ROUND_PATH = `admissionRounds/${ROUND}`;
const NOT_THEIRS = "Only an admin or this programme's lead can change who reviews it.";

function term() {
  world.db = makeDb(seedTerm(), { now: WHILE_OPEN });
  return world.db;
}
const put = (who, programmeId, body) => {
  world.user = CAST[who];
  return rolesRoute.PUT(
    new Request("http://naisi.invalid/api", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roundId: ROUND, programmeId }) },
  );
};
const programmeOf = (db, programmeId) => db.read(ROUND_PATH).programmes[programmeId];
/** Whether the sidebar flag was ever set for this person. */
const flagged = (db, uid) => db.read(`users/${uid}`)?.admissionsReviewer;

/**
 * THE TWO MOMENTS. `beforeTheTransaction` makes a change after the request's
 * own first reads and before its transaction opens. `whileItRuns` makes it
 * after the transaction has read and before it commits, which a real
 * database answers by running the transaction again.
 */
const MOMENTS = {
  "after the request's first read, before its transaction": (db, change) => {
    const run = db.runTransaction;
    let done = false;
    db.runTransaction = (fn) => {
      if (!done) {
        done = true;
        change();
      }
      return run.call(db, fn);
    };
  },
  "while the transaction is running": (db, change) => {
    db.beforeCommit = change;
  },
};

describe("a lead adds and removes their own programme's reviewers", () => {
  test("the lead names a reviewer, the form's own list follows, and the sidebar entry is switched on", async () => {
    const db = term();
    const response = await put("claudia", AGI, { reviewerUids: ["lloyd", "yusuf"] });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(programmeOf(db, AGI).reviewerUids, ["lloyd", "yusuf"]);
    assert.ok(db.read(ROUND_PATH).reviewerUids.includes("yusuf"));
    assert.equal(flagged(db, "yusuf"), true);
  });
});

for (const [moment, at] of Object.entries(MOMENTS)) {
  describe(`who may is decided from the form the transaction read: ${moment}`, () => {
    test("a lead who has been replaced names nobody, and nothing is written", async () => {
      const db = term();
      const before = JSON.stringify(db.read(ROUND_PATH));
      at(db, () => db.poke(ROUND_PATH, { [`programmes.${AGI}.leadUid`]: "tess" }));
      const response = await put("claudia", AGI, { reviewerUids: ["lloyd", "yusuf"] });
      assert.deepEqual([response.status, response.body], [403, { error: NOT_THEIRS }]);
      assert.deepEqual(programmeOf(db, AGI).reviewerUids, ["lloyd"], "her list was written to a programme she no longer leads");
      assert.equal(programmeOf(db, AGI).leadUid, "tess");
      assert.equal(flagged(db, "yusuf"), undefined);
      assert.deepEqual(db.stats.writes, [], "something was written by a request that was refused");
      // Nothing of the form moved but the change that was made to it.
      const after = db.read(ROUND_PATH);
      after.programmes[AGI].leadUid = "claudia";
      assert.equal(JSON.stringify(after), before);
    });

    test("a lead whose programme has left the form writes nothing to it", async () => {
      const db = term();
      at(db, () => {
        const round = structuredClone(db.read(ROUND_PATH));
        delete round.programmes[AGI];
        round.programmeIds = round.programmeIds.filter((id) => id !== AGI);
        db.seed(ROUND_PATH, round);
      });
      const response = await put("claudia", AGI, { reviewerUids: ["yusuf"] });
      assert.equal(response.status, 404);
      assert.equal(db.read(ROUND_PATH).programmes[AGI], undefined);
      assert.deepEqual(db.stats.writes, []);
    });
  });

  describe(`who may be named is decided from the accounts the transaction read: ${moment}`, () => {
    test("somebody who stopped being SU-recognised is not named, and the refusal names them", async () => {
      const db = term();
      at(db, () => db.poke("users/yusuf", { suRecognised: false }));
      const response = await put("claudia", AGI, { reviewerUids: ["lloyd", "yusuf"] });
      assert.equal(response.status, 400);
      assert.match(response.body.error, /^Yusuf Demir cannot be named here\. Leads and reviewers have to be admins or SU-recognised committee/);
      assert.deepEqual(programmeOf(db, AGI).reviewerUids, ["lloyd"]);
      assert.equal(db.read(ROUND_PATH).reviewerUids.includes("yusuf"), false);
      assert.equal(flagged(db, "yusuf"), undefined);
      assert.deepEqual(db.stats.writes, []);
    });

    test("somebody whose account has gone is not named", async () => {
      const db = term();
      // The store records a delete as a write of its own: it is the one write expected.
      at(db, () => db.collection("users").doc("yusuf").delete());
      const response = await put("claudia", AGI, { reviewerUids: ["lloyd", "yusuf"] });
      assert.equal(response.status, 400);
      assert.match(response.body.error, /no longer has an account on this site/);
      assert.deepEqual(programmeOf(db, AGI).reviewerUids, ["lloyd"]);
      assert.deepEqual(db.stats.writes.map(([kind, path]) => [kind, path]), [["delete", "users/yusuf"]]);
    });

    test("a new lead who stopped being eligible is not made lead, even by an admin", async () => {
      const db = term();
      at(db, () => db.poke("users/yusuf", { role: "member" }));
      const response = await put("zach", TAIS, { leadUid: "yusuf" });
      assert.equal(response.status, 400);
      assert.equal(programmeOf(db, TAIS).leadUid, "tess");
      assert.deepEqual(db.stats.writes, []);
    });
  });
}

describe("and a change that does not bear on the request does not stop it", () => {
  test("another programme's lead changing while this one saves: the save goes through, on the form as it now is", async () => {
    const db = term();
    MOMENTS["while the transaction is running"](db, () => db.poke(ROUND_PATH, { [`programmes.${TAIS}.leadUid`]: "yusuf" }));
    const response = await put("claudia", AGI, { reviewerUids: ["lloyd"] });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(programmeOf(db, TAIS).leadUid, "yusuf", "the other change was kept");
    assert.ok(db.read(ROUND_PATH).reviewerUids.includes("yusuf"), "and the form's own list was worked out from it");
  });
});
