/**
 * A refusal says nothing about an application its caller may not read.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT  /api/admissions/forms/[roundId]/applications/[uid]/decision                 one decision
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/applications      several at once
 *
 * ## The rule this guards
 *
 * Who may read an application is one predicate, `canReadApplication` in
 * `src/lib/applications/access.ts`: an admin, and the lead and reviewers of a
 * programme the person ranked or joined by invitation. The review screens
 * answer "Not found" to everybody else.
 *
 * Deciding is a different right. It is a right over a PROGRAMME, and a lead
 * holds it whoever the request names. So a function that is handed somebody's
 * id and will not do what was asked has two different things it could say,
 * and only one of them is the caller's to hear:
 *
 *  - TO SOMEBODY WHO MAY READ THE APPLICATION, why: they did not rank the
 *    programme, they have already been told, with the applicant's name.
 *  - TO ANYBODY ELSE, exactly what it says when nothing was sent at all. The
 *    same status, the same words and no name, whatever the real reason, one
 *    decision at a time and several at once.
 *
 * ## The two halves of this file
 *
 * THE TREE. Every exported function under `src/lib/applications/review/` and
 * `src/lib/applications/decisionDay/` that takes the database is listed
 * below with what it is handed and what holds it. One that is handed an
 * applicant's id either asks the predicate before it names anybody, or is
 * for an admin alone, or is reached only from this library's own loaders. The
 * list is checked both ways and each entry's claim is read out of the source,
 * so a new function fails here until somebody decides what it is.
 *
 * THE HANDLERS. The two routes above are run for real against a small term,
 * as a programme's lead, with every way an application can be out of that
 * lead's reach, and the answers are compared with each other.
 *
 * Real: both handlers, `decide.ts`, `access.ts`, the eligibility bar and the
 * contract's pure functions. Faked: `next/server`, the sentinels
 * `firebase-admin/firestore` supplies, the view-as guard, the session, and
 * the Admin SDK handle, which is `tests/lib/applicationsStore.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  decisionPath,
  namesOf,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import {
  calls,
  firstCall,
  reachOf,
  resolveImport,
  scanModule,
  walkSource,
} from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const LIBRARY = join(SRC, "lib", "applications");
const posix = (path) => path.split(sep).join("/");

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** The folders whose functions are handed an applicant's id by a route or a page. */
const FOLDERS = ["review", "decisionDay"];

/**
 * EVERY EXPORTED FUNCTION IN THOSE FOLDERS THAT TAKES THE DATABASE, with what
 * it is and why that is safe. A function that cannot read cannot answer
 * about anybody, so the ones that take no database are not here.
 *
 *  - `asks`: handed an applicant's id by its caller. It reaches
 *    `canReadApplication`, and nothing names the applicant or says whether
 *    they have been told before that call.
 *  - `admin`: handed an applicant's id, and only an admin gets as far as a
 *    read. Either the function refuses anybody else itself, before its first
 *    read, or every file that calls it is named in `gatedIn` and refuses
 *    there, before the call.
 *  - `internal`: handed ids by this library's own loaders, which chose them.
 *    Nothing outside `src/lib/applications` can call it.
 *  - `no-applicant`: handed nobody's id but the caller's own.
 *
 * NOBODY IS ANSWERED ABOUT THEIR OWN APPLICATION. A function that a route or
 * a page hands an id to (`asks` and `admin`) compares it with the caller's
 * own before it reads an application, and `own` says which way it answers:
 * `refuses`, in a sentence, for something that would have written, and
 * `not-found` for something that would have shown.
 */
const HANDED = {
  "review/load.ts#loadReview": {
    kind: "asks",
    own: "not-found",
    why: "the review screen's read of one application: the predicate decides, and everybody else is told Not found",
  },
  "review/saveReview.ts#saveReview": {
    kind: "asks",
    own: "refuses",
    why: "a reviewer writes a row about an application only where they may read it",
  },
  "review/decide.ts#decideApplication": {
    kind: "asks",
    own: "refuses",
    why: "a refusal to decide says no more about an application than the review screen would",
  },
  "review/decide.ts#decideMany": {
    kind: "asks",
    own: "refuses",
    why: "each id in the list is decided by the same function as a single decision, under the same rule",
  },
  "review/decide.ts#revokeAcceptance": {
    kind: "admin",
    own: "refuses",
    why: "taking an acceptance back is part of running the term, and an admin reads every application",
  },
  "review/accessRequirements.ts#openAccessRequirements": {
    kind: "admin",
    own: "not-found",
    why: "only an admin opens an access-requirements answer, and is refused before anything is read",
  },
  "decisionDay/pool.ts#setPooledOutcome": {
    kind: "admin",
    own: "refuses",
    gatedIn: ["app/api/admissions/forms/[roundId]/pool/route.ts"],
    why: "what a pooled applicant hears is picked by an admin: the one route that calls this refuses everybody else first",
  },
  "review/load.ts#loadStaffNames": {
    kind: "internal",
    why: "first names of the committee members a screen already names; it reads accounts, never an application",
  },
  "decisionDay/people.ts#loadFirstNames": {
    kind: "internal",
    why: "first names of the admins and reviewers the decision-day screens name; it reads accounts, never an application",
  },
  "decisionDay/people.ts#loadAccountRoles": {
    kind: "internal",
    why: "whether the account of somebody the decision-day page already lists is still waiting",
  },
  "review/load.ts#loadProgrammeBoard": {
    kind: "no-applicant",
    why: "handed a programme: the caller's role on it is asked before any application is read",
  },
  "review/decide.ts#setRevealOtherReviews": {
    kind: "no-applicant",
    why: "a switch on the form, for an admin",
  },
  "decisionDay/armed.ts#invitationRemindersArmed": {
    kind: "no-applicant",
    why: "reads whether a scheduled job has run",
  },
  "decisionDay/letters.ts#emailContext": {
    kind: "no-applicant",
    why: "reads the course runs a form's programmes place people on",
  },
  "decisionDay/term.ts#loadTerm": {
    kind: "no-applicant",
    why: "the whole term, for the two decision-day screens an admin alone opens",
  },
  "decisionDay/pool.ts#buildPoolBoard": {
    kind: "no-applicant",
    why: "the pooled applicants page, which its route and its page open for an admin alone",
  },
  "decisionDay/send.ts#buildSendBoard": {
    kind: "no-applicant",
    why: "the decision-day page, which its route and its page open for an admin alone",
  },
  "decisionDay/send.ts#sendTestEmail": {
    kind: "no-applicant",
    why: "a test email to the admin who asked for it",
  },
  "decisionDay/send.ts#sendProgrammeTestEmail": {
    kind: "no-applicant",
    why: "a test email to the lead or admin who asked for it",
  },
  "decisionDay/send.ts#runDecisionDay": {
    kind: "no-applicant",
    why: "the send addresses everybody in the term and takes nobody's id from the request",
  },
};

/** A function handed on from another module, and why that needs no entry of its own. */
const HANDED_ON = {
  "review/own.ts#own": "the one accessor for a map kept by an id, from `keys.ts`: it reads a map it is given",
  "decisionDay/plan.ts#isInTerm": "who is in the term, from `decisions.ts`: it reads an application it is given",
};

/** A parameter that is the person calling, by the names this library gives one. */
const THE_CALLER = ["user", "actor", "viewer", "viewerUid"];
/** A property that holds an account id. */
const ID_PROPERTY = /(?<![A-Za-z0-9_$])(uid|uids|applicantUids?)\??\s*:/;
/** What names an applicant, or says whether they have been told. */
const SAYS_SOMETHING = ["applicantName", "applicantFirstName", "firstNameOf", "hasBeenTold", "alreadyTold", "alreadyToldTheyAreIn"];
/** The id a function was handed, compared with the caller's own. */
const IS_THEIR_OWN = /\b(applicantUid|request\.uid)\s*===\s*(user|actor)\.uid\b/;
/** What reads somebody's application, or what the committee wrote about it. */
const READS_AN_APPLICATION = ["loadApplication", "loadTerm", "listSentApplications", "listDecisions", "listReviews", "applicationRef", "decisionRef", "accessRequirementsRef"];
/** Types the language supplies, which hold no account id. */
const BUILT_IN = new Set(["Date", "Promise", "Map", "Set", "ReadonlyMap", "ReadonlySet", "Record", "Readonly", "Pick", "Omit", "Partial", "Array", "ReadonlyArray"]);

const modules = new Map();
const scan = (file) => {
  if (!modules.has(file)) modules.set(file, scanModule(file));
  return modules.get(file);
};
const keyOf = (file, name) => `${posix(relative(LIBRARY, file))}#${name}`;
const takesTheDatabase = (fn) => fn.params.some((param) => /\b(Firestore|Transaction)\b/.test(param.type));

/** Every exported function in the folders that takes the database, by key. */
function exportedReaders() {
  const found = new Map();
  const handedOn = [];
  const unread = [];
  for (const folder of FOLDERS) {
    for (const file of walkSource(join(LIBRARY, folder))) {
      const mod = scan(file);
      for (const fn of mod.functions.values()) {
        if (fn.exported && takesTheDatabase(fn)) found.set(keyOf(file, fn.name), { mod, fn });
      }
      for (const other of mod.otherExports) {
        if (other.kind === "handed-on") handedOn.push({ file, ...other });
        else unread.push(`${posix(relative(LIBRARY, file))}: ${other.what}`);
      }
    }
  }
  return { found, handedOn, unread };
}

/**
 * The parameters of a function that can carry an account id, and the types
 * this could not look into. A parameter carries one when its name says so,
 * or when its type, or a type that type names, has a property that holds one.
 */
function accountIdsIn(mod, fn) {
  const carrying = [];
  const unresolved = [];
  for (const param of fn.params) {
    const reasons = [];
    for (const name of param.names) if (/uid/i.test(name)) reasons.push(`it is named ${name}`);
    if (ID_PROPERTY.test(param.type)) reasons.push("its type has a property that holds an account id");
    for (const typeName of param.typeNames) {
      let text = mod.types.get(typeName) ?? null;
      if (text === null && mod.imports.has(typeName)) {
        const from = mod.imports.get(typeName);
        const file = resolveImport(mod.file, from, SRC);
        // A package's own type: the database handle, and nothing of ours.
        if (file === null) continue;
        text = scan(file).types.get(typeName) ?? null;
        if (text === null) unresolved.push(`${typeName}, which ${from} does not declare`);
      } else if (text === null && !BUILT_IN.has(typeName)) {
        unresolved.push(`${typeName}, which is neither declared nor imported`);
      }
      if (text !== null && ID_PROPERTY.test(text)) reasons.push(`${typeName} has a property that holds an account id`);
    }
    if (reasons.length > 0) carrying.push({ name: param.name, names: param.names, reasons });
  }
  return { carrying, unresolved };
}

/** Where a function body first reads a document, or -1. */
function firstRead(body) {
  const found = [
    ...["loadForm", "loadQuestionSets", "loadApplication", "listSentApplications", "listDecisions", "listReviews"].map(
      (name) => firstCall(body, name),
    ),
    body.search(/\.(get|getAll|runTransaction)\s*\(/),
  ].filter((at) => at >= 0);
  return found.length === 0 ? -1 : Math.min(...found);
}

/** Every source file outside `except` whose text calls `name(`. */
function callersOf(name, except) {
  const out = [];
  for (const file of walkSource(SRC)) {
    if (file === except) continue;
    if (calls(scan(file).text, name)) out.push(file);
  }
  return out;
}

describe("every function that is handed an applicant's id says what holds it", () => {
  const { found, handedOn, unread } = exportedReaders();

  test("the list is the tree: nothing missing from it, and nothing on it that has gone", () => {
    assert.deepEqual(
      [...found.keys()].filter((key) => !Object.hasOwn(HANDED, key)),
      [],
      "an exported function here takes the database and is not on the list. Decide what it is handed and what holds it, and add it to HANDED with the reason.",
    );
    assert.deepEqual(
      Object.keys(HANDED).filter((key) => !found.has(key)),
      [],
      "the list names a function that is no longer an exported function taking the database",
    );
    for (const [key, entry] of Object.entries(HANDED)) {
      assert.ok(["asks", "admin", "internal", "no-applicant"].includes(entry.kind), `${key}: ${entry.kind} is not a kind`);
      assert.ok(typeof entry.why === "string" && entry.why.length > 20, `${key} needs its reason written down`);
    }
  });

  test("a function exported in another form is followed to where it is declared, or reported", () => {
    assert.deepEqual(unread, [], "an export this guard cannot read as a function: export it as one, or teach the scanner");
    const keys = handedOn.map((entry) => keyOf(entry.file, entry.as));
    assert.deepEqual(keys.sort(), Object.keys(HANDED_ON).sort());
    for (const entry of handedOn) {
      const file = resolveImport(entry.file, entry.from, SRC);
      assert.ok(file, `${entry.name} is handed on from ${entry.from}, which is not a file here`);
      const fn = scan(file).functions.get(entry.name);
      assert.ok(fn, `${entry.name} is not a function declared in ${entry.from}`);
      assert.equal(takesTheDatabase(fn), false, `${entry.name} takes the database, so it needs an entry of its own`);
    }
  });

  test("what each function is handed is what its entry says", () => {
    const cannotSee = [];
    for (const [key, { mod, fn }] of found) {
      const entry = HANDED[key];
      if (!entry) continue;
      const { carrying, unresolved } = accountIdsIn(mod, fn);
      cannotSee.push(...unresolved.map((what) => `${key}: ${what}`));
      const somebodyElse = carrying.filter((param) => !param.names.every((name) => THE_CALLER.includes(name)));
      if (entry.kind === "no-applicant") {
        assert.deepEqual(
          somebodyElse.map((param) => `${param.name}: ${param.reasons.join(", ")}`),
          [],
          `${key} is listed as handed nobody's id but the caller's, and one of its parameters can carry one`,
        );
      } else {
        assert.ok(
          somebodyElse.length > 0,
          `${key} is listed as handed an applicant's id, and no parameter of it carries one: is its entry out of date?`,
        );
      }
    }
    assert.deepEqual(cannotSee, [], "a parameter's type this guard could not look into");
  });

  for (const [key, entry] of Object.entries(HANDED)) {
    const at = found.get(key);
    if (!at) continue;
    const { mod, fn } = at;

    if (entry.kind === "asks") {
      test(`${key} asks who may read the application before it says anything about it`, () => {
        assert.equal(
          resolveImport(mod.file, mod.imports.get("canReadApplication") ?? "", SRC),
          join(LIBRARY, "access.ts"),
          "the predicate is the one in access.ts, imported by name",
        );
        const asking = reachOf(mod, fn.name).filter((reached) => calls(reached.body, "canReadApplication"));
        assert.ok(asking.length > 0, `${key} never reaches canReadApplication`);
        for (const reached of asking) {
          const asked = firstCall(reached.body, "canReadApplication");
          for (const helper of SAYS_SOMETHING) {
            const said = firstCall(reached.body, helper);
            assert.ok(
              said === -1 || said > asked,
              `${reached.name} calls ${helper} before it has asked whether the caller may read the application`,
            );
          }
        }
      });
    }

    if (entry.kind === "admin" && !entry.gatedIn) {
      test(`${key} refuses anybody but an admin before it reads`, () => {
        const gate = firstCall(fn.body, "canRunTerm");
        const read = firstRead(fn.body);
        assert.ok(gate >= 0, `${key} never asks canRunTerm`);
        assert.ok(read === -1 || gate < read, `${key} reads before it asks canRunTerm`);
      });
    }

    if (entry.kind === "admin" && entry.gatedIn) {
      test(`${key} is called only where an admin has already been asked for`, () => {
        const callers = callersOf(fn.name, mod.file);
        assert.deepEqual(
          callers.map((file) => posix(relative(SRC, file))).sort(),
          [...entry.gatedIn].sort(),
          `every file that calls ${fn.name} is named in its entry, and refuses anybody but an admin first`,
        );
        for (const file of callers) {
          const calling = [...scan(file).functions.values()].filter((other) => calls(other.body, fn.name));
          assert.ok(calling.length > 0, `${posix(relative(SRC, file))} calls ${fn.name} outside any function`);
          for (const other of calling) {
            const gate = firstCall(other.body, "canRunTerm");
            assert.ok(
              gate >= 0 && gate < firstCall(other.body, fn.name),
              `${other.name} in ${posix(relative(SRC, file))} calls ${fn.name} before it has asked canRunTerm`,
            );
          }
        }
      });
    }

    if (entry.kind === "asks" || entry.kind === "admin") {
      test(`${key} does not answer about the caller's own application`, () => {
        assert.ok(["refuses", "not-found"].includes(entry.own), `${key} needs to say how it answers the caller's own id`);
        const comparing = reachOf(mod, fn.name).filter((reached) => IS_THEIR_OWN.test(reached.body));
        assert.ok(comparing.length > 0, `${key} never compares the id it is handed with the caller's own`);
        for (const reached of comparing) {
          const compared = reached.body.search(IS_THEIR_OWN);
          const reads = [
            ...READS_AN_APPLICATION.map((name) => firstCall(reached.body, name)),
            reached.body.search(/\.runTransaction\s*\(/),
          ].filter((at) => at >= 0);
          assert.ok(
            reads.every((at) => compared < at),
            `${reached.name} reads an application before it has asked whether the id is the caller's own`,
          );
          const answer = reached.body.slice(compared, compared + 160);
          if (entry.own === "refuses") {
            assert.match(answer, /\b403\b/, `${reached.name} refuses the caller's own id`);
          } else {
            assert.match(answer, /return NOT_FOUND/, `${reached.name} answers Not found for the caller's own id`);
          }
        }
      });
    }

    if (entry.kind === "internal") {
      test(`${key} is reached only from this library's own loaders`, () => {
        const outside = callersOf(fn.name, mod.file).filter((file) => !file.startsWith(LIBRARY + sep));
        assert.deepEqual(
          outside.map((file) => posix(relative(SRC, file))),
          [],
          `${fn.name} is handed ids, and something outside src/lib/applications calls it`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// The handlers
// ---------------------------------------------------------------------------

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
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__readableDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__readableUser ?? null;\n}"],
  ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
]);
const { loadTs } = createLoader({ stubs: STUBS });
const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const oneRoute = await loadTs(join(FORMS, "applications", "[uid]", "decision", "route.ts"));
const manyRoute = await loadTs(join(FORMS, "programmes", "[programmeId]", "applications", "route.ts"));

const NOTHING_SENT = "There is no sent application here.";
const TOLD_AT = new Date("2026-10-19T09:00:00+01:00");

const told = (kind, programmeId) => ({
  kind,
  programmeId,
  publishedAt: TOLD_AT,
  email: "sent",
  emailedAt: TOLD_AT,
  emailClaimedAt: null,
});
const invitedTo = (programmeId, response) => ({
  programmeId,
  replyBy: "2026-10-25",
  response,
  respondedAt: response ? TOLD_AT : null,
  lastReminderOn: null,
});
const decidedBy = (decision, by) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: TOLD_AT,
});
/** Nina's application, which ranks Technical AI Safety alone, with whatever is laid over it. */
const nina = (over = {}) => ({ [applicationPath("nina")]: { ...applicationDoc("nina", [TAIS]), ...over } });

/**
 * EVERY WAY AN APPLICATION CAN BE OUT OF CLAUDIA'S REACH. She leads AGI
 * Strategy and holds no other role, so she reads the applications that ranked
 * it and those of people who joined it by invitation, and no others.
 */
const OUT_OF_REACH = [
  ["nobody has that id", "ghost", {}],
  ["an account that has not applied", "yusuf", {}],
  ["a draft that was never sent", "nina", { [applicationPath("nina")]: applicationDoc("nina", [TAIS], { sent: false }) }],
  ["sent, to another programme alone", "nina", nina()],
  [
    "sent to another programme, which has decided",
    "nina",
    {
      ...nina(),
      [decisionPath("nina")]: { roundId: ROUND, uid: "nina", programmes: { [TAIS]: decidedBy("accept", "tess") }, pooledOutcome: null, exception: null },
    },
  ],
  ["sent to another programme, and already told", "nina", nina({ status: "accepted", result: told("accepted", TAIS) })],
  ["sent to another programme, and since withdrawn", "nina", nina({ status: "withdrawn", withdrawnAt: TOLD_AT })],
  [
    "invited to her programme, and not yet answered",
    "nina",
    nina({ status: "invited", result: told("invited", AGI), invitation: invitedTo(AGI, null) }),
  ],
  [
    "invited to her programme, and said no thanks",
    "nina",
    nina({ status: "withdrawn", withdrawnAt: TOLD_AT, result: told("invited", AGI), invitation: invitedTo(AGI, "declined") }),
  ],
];

let db;
function world(over = {}) {
  db = makeDb(seedTerm({ over }), { now: WHILE_DECIDING });
  globalThis.__readableDb = db;
  return db;
}
const as = (uid) => {
  globalThis.__readableUser = CAST[uid];
};
const request = (method, body) =>
  new Request("http://naisi.invalid/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const decideOne = (uid, programmeId = AGI, decision = "pool") =>
  oneRoute.PUT(request("PUT", { programmeId, decision }), { params: Promise.resolve({ roundId: ROUND, uid }) });
const decideSeveral = (uids, programmeId = AGI, decision = "pool") =>
  manyRoute.POST(request("POST", { decision, uids }), { params: Promise.resolve({ roundId: ROUND, programmeId }) });
/** Everything a response carries that could be somebody's name or address. */
const namesIn = (response, uid) => {
  const strings = stringsIn(response.body).join("\n");
  return CAST[uid] ? namesOf(uid).filter((word) => strings.includes(word)) : [];
};

describe("somebody who may not read an application is answered as if nothing had been sent", () => {
  for (const [how, uid, docs] of OUT_OF_REACH) {
    test(`one decision: ${how}`, async () => {
      world(docs);
      as("claudia");
      const response = await decideOne(uid);
      assert.deepEqual([response.status, response.body], [404, { error: NOTHING_SENT }]);
      assert.deepEqual(namesIn(response, uid), []);
      assert.deepEqual(db.stats.writes, [], "nothing is decided and nothing is logged");
    });

    test(`several at once: ${how}`, async () => {
      world(docs);
      as("claudia");
      const response = await decideSeveral([uid]);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.result, {
        decision: "pool",
        changed: 0,
        unchanged: 0,
        refused: [{ uid, name: "", reason: NOTHING_SENT }],
      });
      assert.deepEqual(namesIn(response, uid), []);
      assert.deepEqual(db.stats.writes, []);
    });
  }

  test("the answers are one answer: nothing in any of them tells one case from another", async () => {
    const answers = new Set();
    for (const [, uid, docs] of OUT_OF_REACH) {
      world(docs);
      as("claudia");
      const one = await decideOne(uid);
      const several = await decideSeveral([uid]);
      const [line] = several.body.result.refused;
      answers.add(JSON.stringify([one.status, one.body, several.status, { ...line, uid: "" }, several.body.result.changed]));
    }
    assert.equal(answers.size, 1, [...answers].join("\n"));
  });

  test("a whole list of ids comes back with one line for everybody out of reach, and decides the rest", async () => {
    // Everybody with an account, and an id nobody has. Amara, Dev and Wen
    // ranked AGI Strategy, so they are Claudia's to decide. Nina sent an
    // application that did not.
    world(nina());
    as("claudia");
    const everybody = [...Object.keys(CAST), "ghost"];
    const response = await decideSeveral(everybody, AGI, "accept");
    const { result } = response.body;
    assert.deepEqual([response.status, result.changed, result.unchanged], [200, 3, 0]);
    const lines = new Map(result.refused.map((line) => [line.uid, line]));
    assert.deepEqual(lines.get("claudia"), { uid: "claudia", name: "", reason: "You can’t decide your own application." });
    lines.delete("claudia");
    assert.deepEqual([...lines.keys()].sort(), ["ghost", "lloyd", "nina", "refused", "tess", "yusuf", "zach"]);
    for (const [uid, line] of lines) assert.deepEqual(line, { uid, name: "", reason: NOTHING_SENT });
    assert.deepEqual(namesIn(response, "nina"), []);
    assert.deepEqual(
      db.paths().filter((path) => path.startsWith("admissionDecisions/")).sort(),
      [decisionPath("amara"), decisionPath("dev"), decisionPath("wen")].sort(),
    );
  });
});

describe("somebody who may read the application is told what is in the way", () => {
  test("an admin reads every application, so an admin is told why", async () => {
    world(nina());
    as("zach");
    const one = await decideOne("nina");
    assert.deepEqual([one.status, one.body], [409, { error: "They did not rank AGI Strategy." }]);
    const several = await decideSeveral(["nina", "ghost"]);
    assert.deepEqual(several.body.result.refused, [
      { uid: "nina", name: "Nina Petrova", reason: "They did not rank AGI Strategy." },
      { uid: "ghost", name: "", reason: NOTHING_SENT },
    ]);
    assert.deepEqual(db.stats.writes, []);
  });

  test("an admin is told that somebody has already been told", async () => {
    world(nina({ status: "accepted", result: told("accepted", TAIS) }));
    as("zach");
    const one = await decideOne("nina", TAIS);
    assert.equal(one.status, 409);
    assert.match(one.body.error, /^Nina Petrova has already been told their decision/);
    const [line] = (await decideSeveral(["nina"], TAIS)).body.result.refused;
    assert.equal(line.name, "Nina Petrova");
    assert.match(line.reason, /^Nina Petrova has already been told their decision/);
  });

  test("a lead reads somebody who joined their programme by invitation, and is told they have been told", async () => {
    world(nina({ status: "accepted", result: told("invited", AGI), invitation: invitedTo(AGI, "accepted") }));
    as("claudia");
    const one = await decideOne("nina");
    assert.equal(one.status, 409);
    assert.match(one.body.error, /^Nina Petrova has already been told their decision/);
    assert.deepEqual(db.stats.writes, []);
  });

  test("a lead who reads an application through one programme is told it did not rank another of theirs", async () => {
    // Tess leads Technical AI Safety and the incubator. Amara ranked the
    // first and not the second, so Tess reads Amara's application.
    world();
    as("tess");
    const one = await decideOne("amara", INCUBATOR);
    assert.deepEqual([one.status, one.body], [409, { error: "They did not rank Research incubator." }]);
    const [line] = (await decideSeveral(["amara"], INCUBATOR)).body.result.refused;
    assert.deepEqual(line, { uid: "amara", name: "Amara Okafor", reason: "They did not rank Research incubator." });
  });

  test("and a decision the lead may make is still made", async () => {
    world(nina());
    as("claudia");
    const one = await decideOne("amara", AGI, "accept");
    assert.equal(one.status, 200);
    assert.equal(one.body.changed, true);
    assert.equal(db.read(decisionPath("amara")).programmes[AGI].decision, "accept");
  });
});
