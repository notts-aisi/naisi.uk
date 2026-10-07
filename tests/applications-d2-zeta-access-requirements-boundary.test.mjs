/**
 * WHO CAN REACH AN ACCESS-REQUIREMENTS ANSWER, held as a property of the tree.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * Applicants are told that what they write in the access-requirements box is
 * kept apart from their application, that the people who read the
 * application never see it, that only an admin can open it, and that every
 * time one does it is recorded. Each of those is true only for as long as no
 * other code can get at the collection the answers are in. So this file does
 * not test a route. It walks every file:
 *
 *  1. THE COLLECTION IS ADDRESSED IN LISTED PLACES. Every file in `src` whose
 *     code names `admissionApplicationPrivate` is below with what it does
 *     there. Checked both ways.
 *  2. EVERY ROUTE AND PAGE THAT CAN REACH ONE OF THOSE FILES IS LISTED, by
 *     following its imports, with which of four things it is: the owner's
 *     own answer, the one reader for an admin, a deletion, or a count. Each
 *     kind is then held to what makes it safe. A new route that can reach an
 *     answer fails here until somebody says which it is.
 *  3. ON AN APPLICATION FORM THE CHAIN IS THREE LINKS LONG AND NO WIDER: one
 *     module addresses the collection, two modules import it, two routes
 *     import those. Anything else importing any of them fails.
 *  4. WHAT A LEAD, A REVIEWER AND AN ADMIN ARE SENT IS BUILT WITHOUT IT. The
 *     loaders behind the review screens are run for each of them over a term
 *     where two people wrote in the box, and neither the collection nor the
 *     words are anywhere in what comes back.
 *
 * `tests/privacy-policy.test.mjs` holds a narrower version of the second
 * point by reading each route's own source. This one follows imports, so a
 * route that reaches the collection through a module is seen as well.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  privatePath,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const abs = (path) => join(REPO_ROOT, ...path.split("/"));

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

/** Every module a file imports from. `types` says whether `import type` counts. */
function specifiers(code, { types }) {
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (!types && /^(?:import|export)\s+type\b/.test(match[1])) continue;
    out.push(match[2]);
  }
  for (const match of code.matchAll(/(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g)) out.push(match[1]);
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1]);
  return out;
}

function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every `src` file reachable from `root` by imports that carry data, with the chain that got there. */
function reachableFrom(root) {
  const chains = new Map([[root, [root]]]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of specifiers(codeOf(file), { types: false })) {
      const target = resolveLocal(specifier, file);
      if (!target || chains.has(target)) continue;
      chains.set(target, [...chains.get(file), target]);
      queue.push(target);
    }
  }
  return chains;
}

const ALL = sourceFiles();

// ---------------------------------------------------------------------------
// 1. Where the collection is addressed
// ---------------------------------------------------------------------------

const NAMES_THE_COLLECTION = /["'`]admissionApplicationPrivate["'`]/;

/**
 * Every file in `src` whose code names the collection, and what it does there.
 * Anything that can hold a reference to a row belongs here with its reason;
 * anything else naming the collection is a new way in.
 */
const ADDRESSES_THE_ANSWERS = new Map([
  [
    "src/lib/applications/applicant/accessRequirementsDoc.ts",
    "the application form's one address for a row: the reference, and the answer a stored row holds. " +
      "Imported by the applicant's own module and by the admin's reader, and by nothing else",
  ],
  [
    "src/lib/admissions/applyContext.ts",
    "the older rounds' apply routes: the reference to the caller's own row, and the caller's own " +
      "application with that row joined on, for the three routes that put it back in its author's form",
  ],
  [
    "src/app/(public)/apply/[roundId]/page.tsx",
    "the older rounds' apply page, which reads the signed-in person's own row to open their own form " +
      "holding it, and leaves the read out during a view-as session",
  ],
  [
    "src/lib/admissions/destroy.ts",
    "the round destroy, which deletes the row at each application's id in that application's batch " +
      "and counts the rows for its manifest. It looks only at whether a row exists",
  ],
  [
    "src/lib/firestore/accountDeletion.ts",
    "the account cascade, which deletes the row at each of the deleted account's application ids in " +
      "the same batch as the application. It looks only at whether a row exists",
  ],
]);

describe("where the collection is addressed", () => {
  test("in the listed files and nowhere else", () => {
    const found = ALL.filter((file) => NAMES_THE_COLLECTION.test(codeOf(file))).map(rel).sort();
    assert.deepEqual(
      found,
      [...ADDRESSES_THE_ANSWERS.keys()].sort(),
      "the files that name the access-requirements collection are not the ones listed in " +
        "ADDRESSES_THE_ANSWERS. A new reader, writer or deleter is added there with its reason, " +
        "and to the routes below that can reach it. An entry for a file that no longer names the " +
        "collection is removed.",
    );
    for (const [file, why] of ADDRESSES_THE_ANSWERS) {
      assert.ok(why.length > 40, `${file} needs a written reason for addressing the answers`);
    }
  });

  test("the two that only delete never read what a row says", () => {
    for (const file of ["src/lib/admissions/destroy.ts", "src/lib/firestore/accountDeletion.ts"]) {
      assert.doesNotMatch(
        codeOf(abs(file)),
        /\baccessRequirements\b|normalizeAdmissionApplicationPrivate/,
        `${file} deletes these rows and has started reading the answer in them`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Every route and page that can reach one
// ---------------------------------------------------------------------------

/**
 * Every route, page and layout whose imports lead to a file that addresses
 * the collection, and which of four things it is.
 *
 *  - `owner`: it serves the caller their OWN answer, addressed by the
 *    session's uid. No log is owed, because nothing is disclosed to anybody.
 *    That is only true while the session really is the person's, so every
 *    handler refuses a view-as session before it does anything, reads
 *    included.
 *  - `admin-reader`: it shows somebody else's answer. Admins only, and every
 *    read is recorded in the transaction that makes it.
 *  - `deletes`: it removes rows with the applications they sit beside and
 *    returns counts.
 *  - `counts`: it counts rows and changes nothing.
 *
 * A NEW ENTRY IS A DECISION. A route that shows an answer to anybody but its
 * author is an `admin-reader` and has to record the read.
 */
const REACHES_THE_ANSWERS = new Map([
  [
    "src/app/api/admissions/forms/[roundId]/application/access-requirements/route.ts",
    {
      kind: "owner",
      why: "reads and saves the caller's own answer on an application form, addressed by their own uid",
    },
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/access-requirements/route.ts",
    {
      kind: "admin-reader",
      why: "an admin opens one applicant's answer; the read and its log line are one transaction",
    },
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/apply/route.ts",
    {
      kind: "owner",
      why: "the older rounds' form: reads and saves the caller's own answer with their own application",
    },
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/apply/submit/route.ts",
    {
      kind: "owner",
      why: "the older rounds' form: answers a submission with the caller's own application, their answer joined on",
    },
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/apply/stage/[stageId]/route.ts",
    {
      kind: "owner",
      why: "the older rounds' form: the same, for one later stage",
    },
  ],
  [
    "src/app/(public)/apply/[roundId]/page.tsx",
    {
      kind: "owner",
      why: "the older rounds' apply page, which opens the signed-in person's own form holding their own answer",
    },
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/destroy/route.ts",
    { kind: "deletes", why: "destroys a round or a form, and with each application the row beside it" },
  ],
  [
    "src/app/api/admissions/rounds/[roundId]/destroy-manifest/route.ts",
    { kind: "counts", why: "says how many rows a destroy would remove, before it is confirmed" },
  ],
  [
    "src/app/api/account/delete/route.ts",
    {
      kind: "deletes",
      why: "somebody who registered and never finished deletes their own account, through the account cascade",
    },
  ],
  [
    "src/app/api/account/reconsent/route.ts",
    {
      kind: "deletes",
      why: "somebody declining a new policy has an unfinished or collaborator account deleted, through the same cascade",
    },
  ],
  [
    "src/app/api/admin/users/[uid]/route.ts",
    { kind: "deletes", why: "an admin deletes an account, and with each of its applications the row beside it" },
  ],
  [
    "src/app/api/admin/registrations/[uid]/route.ts",
    { kind: "deletes", why: "an admin deletes an account from the registrations list, through the same cascade" },
  ],
  [
    "src/app/api/collaborators/[id]/route.ts",
    { kind: "deletes", why: "an admin deletes a collaborator's application and account, through the same cascade" },
  ],
]);

/** Routes, pages and layouts: everything a request can enter the tree through. */
const ENTRIES = ALL.filter((file) => /^src\/app\/.*\/(route|page|layout)\.tsx?$/.test(rel(file)));

function entriesThatReach(targets) {
  const set = new Set(targets.map(abs));
  const found = new Map();
  for (const entry of ENTRIES) {
    const chains = reachableFrom(entry);
    const hit = [...chains.keys()].find((file) => set.has(file));
    if (hit) found.set(rel(entry), chains.get(hit).map(rel));
  }
  return found;
}

describe("every route and page that can reach an answer", () => {
  const reaching = entriesThatReach([...ADDRESSES_THE_ANSWERS.keys()]);

  test("the walk sees the tree, so the checks below are about something", () => {
    assert.ok(ENTRIES.length > 150, `only ${ENTRIES.length} routes and pages were found: the walk is broken`);
    assert.ok(reaching.size >= 8);
  });

  test("is listed, with what it is", () => {
    assert.deepEqual(
      [...reaching.keys()].sort(),
      [...REACHES_THE_ANSWERS.keys()].sort(),
      "the routes and pages that can reach an access-requirements answer are not the ones " +
        "listed in REACHES_THE_ANSWERS. One that shows an answer to anybody but its author is an " +
        "`admin-reader`: admins only, and it records every read. One that only serves the " +
        "caller's own is an `owner` and refuses a view-as session. An entry that can no longer " +
        "reach the collection is removed.",
    );
    for (const [file, entry] of REACHES_THE_ANSWERS) {
      assert.ok(["owner", "admin-reader", "deletes", "counts"].includes(entry.kind), `${file} has no kind`);
      assert.ok(entry.why.length > 30, `${file} needs a written reason`);
    }
  });

  test("an owner's route refuses a view-as session at the top of every handler, reads included", () => {
    const routes = [...REACHES_THE_ANSWERS].filter(([file, entry]) => entry.kind === "owner" && file.endsWith("route.ts"));
    assert.ok(routes.length >= 4);
    for (const [file] of routes) {
      const code = codeOf(abs(file));
      const handlers = [...code.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
      assert.ok(handlers.length > 0, `${file} exports no handler this can read`);
      for (const match of handlers) {
        const body = code.slice(code.indexOf("{", code.indexOf(")", match.index)));
        assert.match(
          body,
          /^\{\s*const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/,
          `${file} ${match[1]} serves somebody their own answer and does not refuse a view-as ` +
            "session as its first statement. During one the session is the member's, so this " +
            "would hand an admin their answer with nothing recording it.",
        );
      }
    }
  });

  test("the owner's page leaves the read out during a view-as session", () => {
    const page = codeOf(abs("src/app/(public)/apply/[roundId]/page.tsx"));
    assert.match(page, /const viewingAs = markerIsLive\(/);
    assert.match(page, /loadRound\(roundId, user\?\.uid \?\? null, !viewingAs\)/);
  });

  test("the one reader for an admin names the record it makes, and makes it with the read", () => {
    const readers = [...REACHES_THE_ANSWERS].filter(([, entry]) => entry.kind === "admin-reader");
    assert.equal(readers.length, 1, "there is one way for anybody but its author to read an answer");
    const route = codeOf(abs(readers[0][0]));
    assert.match(route, /openAccessRequirements\(db, user, roundId, uid, "access-requirements-read"\)/);
    assert.doesNotMatch(route, /export\s+async\s+function\s+GET\b/, "a read that is recorded writes, so it is not a GET");

    const reader = codeOf(abs("src/lib/applications/review/accessRequirements.ts"));
    // Only an admin, asked before anything is read.
    assert.ok(
      reader.indexOf("if (!canRunTerm(user))") !== -1 &&
        reader.indexOf("if (!canRunTerm(user))") < reader.indexOf("loadForm(db, roundId)"),
      "the reader no longer refuses everybody but an admin before it reads",
    );
    // The log line and the answer leave one transaction, the line first.
    const inside = reader.slice(reader.indexOf("db.runTransaction("));
    const logged = inside.indexOf("tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {");
    const answered = inside.indexOf("return { ok: true, accessRequirements: accessRequirementsIn(ownSnap) };");
    assert.ok(logged !== -1 && answered !== -1 && logged < answered, "the read is no longer recorded in the transaction that makes it");
    assert.match(inside, /kind: recordAs,/);
    assert.match(inside, /subjectUid: applicantUid,/);
  });
});

// ---------------------------------------------------------------------------
// 3. On an application form: three links, and no wider
// ---------------------------------------------------------------------------

/** Every file that imports `target`, types included: a type import is how a shape starts to travel. */
function importersOf(target) {
  const wanted = abs(target);
  return ALL.filter(
    (file) =>
      file !== wanted &&
      specifiers(codeOf(file), { types: true }).some((specifier) => resolveLocal(specifier, file) === wanted),
  )
    .map(rel)
    .sort();
}

describe("on an application form the way to an answer is three links long", () => {
  const DOC = "src/lib/applications/applicant/accessRequirementsDoc.ts";
  const OWN = "src/lib/applications/applicant/accessRequirements.ts";
  const OPEN = "src/lib/applications/review/accessRequirements.ts";

  test("one module addresses the collection, and two import it", () => {
    assert.deepEqual(importersOf(DOC), [OWN, OPEN].sort());
  });

  test("the applicant's module is imported by the applicant's route and nothing else", () => {
    assert.deepEqual(importersOf(OWN), [
      "src/app/api/admissions/forms/[roundId]/application/access-requirements/route.ts",
    ]);
  });

  test("the admin's reader is imported by the admin's route and nothing else", () => {
    assert.deepEqual(importersOf(OPEN), [
      "src/app/api/admissions/forms/[roundId]/applications/[uid]/access-requirements/route.ts",
    ]);
  });

  test("nothing else in the application system, and nothing that builds the kept record, can reach it", () => {
    // Derived, not listed: every other route of the form, every page of its
    // staff screens, every module of the application system, and the two
    // modules that write the record the committee keeps.
    const roots = ALL.filter((file) => {
      const path = rel(file);
      if ([DOC, OWN, OPEN].includes(path) || REACHES_THE_ANSWERS.has(path)) return false;
      return (
        path.startsWith("src/app/api/admissions/forms/") ||
        path.startsWith("src/app/(app)/admin/admissions/") ||
        path.startsWith("src/lib/applications/") ||
        path.startsWith("src/features/applications/") ||
        path === "src/lib/firestore/memberRecords.ts" ||
        path === "src/lib/admissions/memberRecordSync.ts"
      );
    });
    assert.ok(roots.length > 120, `only ${roots.length} files were walked: the walk has stopped seeing the application system`);
    const addressed = new Set([...ADDRESSES_THE_ANSWERS.keys()].map(abs));
    const breaches = [];
    for (const root of roots) {
      for (const [file, chain] of reachableFrom(root)) {
        if (addressed.has(file)) breaches.push(chain.map(rel).join("\n      -> "));
      }
    }
    assert.deepEqual(
      breaches,
      [],
      "a file that builds what a lead, a reviewer or the kept record is given can reach the " +
        "access-requirements answers. They are read through the admin's own route and nowhere " +
        "else: keep the import out, or the promise on the form stops being true.",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. What the review screens are sent, run
// ---------------------------------------------------------------------------

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ]),
});
const load = await loadTs(join("lib", "applications", "review", "load.ts"));

describe("what the review screens are sent", () => {
  const MARKER = "Zeta-marker: a step-free room, please.";

  function term() {
    const db = makeDb(
      seedTerm({
        round: { status: "deciding" },
        over: {
          [privatePath("amara")]: { accessRequirements: MARKER },
          [privatePath("dev")]: { accessRequirements: `${MARKER} And a seat near the door.` },
        },
      }),
      { now: WHILE_DECIDING },
    );
    const touched = [];
    const collection = db.collection;
    db.collection = (name) => {
      touched.push(name);
      return collection(name);
    };
    const getAll = db.getAll;
    db.getAll = (...refs) => {
      for (const ref of refs) touched.push(ref.path.split("/")[0]);
      return getAll(...refs);
    };
    return { db, touched };
  }

  /** [who, the programme they open it under] */
  const VIEWERS = [
    ["zach", AGI],
    ["zach", TAIS],
    ["claudia", AGI],
    ["lloyd", AGI],
    ["tess", TAIS],
  ];

  for (const [who, programmeId] of VIEWERS) {
    test(`${who} on ${programmeId}: the list and the application, with no answer and no read of one`, async () => {
      const { db, touched } = term();
      const board = await load.loadProgrammeBoard(db, CAST[who], ROUND, programmeId);
      const review = await load.loadReview(db, CAST[who], ROUND, "amara", programmeId);
      assert.ok(board.ok && review.ok, `${who} can open ${programmeId}, so this case is about a real payload`);

      assert.ok(
        !touched.includes("admissionApplicationPrivate"),
        "a review screen's loader addressed the access-requirements collection",
      );
      for (const payload of [board.board, review.review]) {
        const strings = stringsIn(payload);
        assert.ok(!strings.some((text) => text.includes("Zeta-marker")), "a review payload holds the answer");
        assert.ok(!strings.includes("accessRequirements"), "a review payload has a field for the answer");
      }
    });
  }

  test("an admin's payload says only that they are an admin, which is what draws the block", async () => {
    const { db } = term();
    const admin = await load.loadReview(db, CAST.zach, ROUND, "amara", AGI);
    const lead = await load.loadReview(db, CAST.claudia, ROUND, "amara", AGI);
    const reviewer = await load.loadReview(db, CAST.lloyd, ROUND, "amara", AGI);
    assert.deepEqual(
      [admin.review.viewer.isAdmin, lead.review.viewer.isAdmin, reviewer.review.viewer.isAdmin],
      [true, false, false],
    );
  });
});
