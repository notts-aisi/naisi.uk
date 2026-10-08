/**
 * A set of questions asked once, of everybody.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A general set used to belong to a KIND of programme, so a question meant
 * for everybody had to be written into the fellowships' set and again into
 * the incubator's, and somebody who picked one of each was asked it twice. A
 * question set's scope can now be `everybody`. What is held here:
 *
 *  - ONE SET, ASKED ONCE, FIRST. Anybody who has picked a programme the form
 *    carries is asked it, whatever kind that programme is, before every other
 *    set. Where it is asked is a rule (`everybodyFirst`), whatever the form's
 *    stored order says. A form has at most one, and the writer refuses a
 *    second inside the transaction that would have made it.
 *  - NEVER SCORED. Its role is always `general`, whatever is stored, so a
 *    scored question is refused on write and cleared on read, and no reviewer
 *    is offered a score for one of its answers.
 *  - READ BY EVERYBODY WHO MAY READ THE APPLICATION, and by nobody else: an
 *    admin, and the lead and reviewers of each programme the person ranked or
 *    joined by accepting an invitation.
 *  - EVERY SCOPE THE MODEL DECLARES SURVIVES EVERY PLACE A SCOPE IS COPIED.
 *    Two projections used to end in a branch that answered "facilitating" for
 *    anything they did not know, so a new scope would have reached an
 *    applicant's browser as the wrong one. The scopes are read out of
 *    `model.ts` and each is put through every copy.
 *
 * Real: every route handler used, the loaders, builders and writers under
 * `src/lib/applications/`, and the form's own naming of its steps. Faked:
 * `next/server`, the sentinels `firebase-admin/firestore` supplies, the
 * view-as guard, the session, the mail door, and the Admin SDK handle, which
 * is `tests/lib/applicationsStore.mjs`.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  WHILE_OPEN,
  applicationDoc,
  applicationPath,
  contentFor,
  decisionPath,
  seedTerm,
  userDoc,
} from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(REPO_ROOT, file), "utf8");

const world = { db: null, user: null };
globalThis.__forEverybody = world;

const { loadTs } = createLoader({
  stubs: new Map([
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
    ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__forEverybody.db;\n}"],
    ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__forEverybody.user;\n}"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
    // Nothing in this file sends, and nothing could.
    ["@/lib/email/send", "export async function sendEmail() {\n  throw new Error('this suite sends nothing');\n}"],
  ]),
});
const lib = (...parts) => loadTs(join("lib", "applications", ...parts));
const api = (...parts) => loadTs(join("app", "api", "admissions", "forms", "[roundId]", ...parts, "route.ts"));

const normalise = await lib("normalise.ts");
const sections = await lib("sections.ts");
const validate = await lib("validate.ts");
const scoring = await lib("scoring.ts");
const editorSets = await lib("editor", "sets.ts");
const editorParse = await lib("editor", "parse.ts");
const editorViews = await lib("editor", "views.ts");
const editorWrite = await lib("editor", "write.ts");
const lock = await lib("editor", "lock.ts");
const project = await lib("applicant", "project.ts");
const shape = await lib("applicant", "shape.ts");
const readiness = await lib("lifecycle", "readiness.ts");
const statusLoad = await lib("status", "load.ts");
const model = await lib("model.ts");
const steps = await loadTs(join("features", "applications", "apply", "steps.ts"));

const routes = {
  sets: await api("sets"),
  set: await api("sets", "[setId]"),
  application: await api("application"),
  send: await api("application", "send"),
  review: await api("applications", "[uid]"),
  saveReview: await api("applications", "[uid]", "review"),
  programme: await api("programmes", "[programmeId]"),
  status: await api("status"),
};

mock.timers.enable({ apis: ["Date"], now: WHILE_OPEN });
const at = (when) => mock.timers.setTime(when.getTime());

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

const SHARED = "shared";
const LOOKED = "looked";
const CV = "cv";

const question = (id, text, over = {}) => ({
  id,
  text,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: null,
  required: true,
  scored: false,
  ...over,
});

/** The set for everybody, as it is stored: one question that has to be answered and one that need not be. */
const sharedSet = (over = {}) => ({
  roundId: ROUND,
  role: "general",
  scope: { type: "everybody" },
  label: "Shared",
  intro: "",
  questions: [
    question(LOOKED, "How much have you looked into AI safety before?"),
    question(CV, "A link to your CV, if you have one.", { type: "short", required: false }),
  ],
  ...over,
});

const INCUBATOR_SET = "incubator-stream";

/**
 * The small term, with a set for everybody and a set of the incubator's own,
 * so that somebody who picks a fellowship and the incubator meets a general
 * set, two streams and the set for everybody.
 */
function termDocs({ round = {}, over = {}, applications = true } = {}) {
  const docs = seedTerm({
    round: { questionSetIds: [SHARED, "fellowships", AGI, TAIS, INCUBATOR_SET], ...round },
    over: {
      [`admissionRounds/${ROUND}/questionSets/${SHARED}`]: sharedSet(),
      [`admissionRounds/${ROUND}/questionSets/${INCUBATOR_SET}`]: {
        roundId: ROUND,
        role: "stream",
        scope: { type: "programme", programmeId: INCUBATOR },
        label: "Research incubator",
        intro: "",
        questions: [question("idea", "What would you work on?")],
      },
      ...over,
    },
  });
  if (!applications) {
    for (const path of Object.keys(docs)) {
      if (path.startsWith("admissionApplications/")) delete docs[path];
    }
  }
  return docs;
}

const setPath = (id) => `admissionRounds/${ROUND}/questionSets/${id}`;
const roundPath = `admissionRounds/${ROUND}`;

/** A form nobody has applied to yet, which an admin can still change. */
function draftForm(more = {}) {
  at(WHILE_OPEN);
  world.db = makeDb(
    termDocs({ round: { status: "draft", applicationCounts: { draft: 0, submitted: 0 }, ...more.round }, over: more.over, applications: false }),
    { now: WHILE_OPEN },
  );
  return world.db;
}

/** An open form with the set on it and nobody's application yet. */
function openForm(more = {}) {
  at(WHILE_OPEN);
  world.db = makeDb(
    termDocs({ round: { status: "open", applicationCounts: { draft: 0, submitted: 0 }, ...more.round }, over: more.over, applications: false }),
    { now: WHILE_OPEN },
  );
  return world.db;
}

let requests = 0;
/** One request to a real handler, as `who`. Each from its own address, so only the per-account limits count. */
async function call(who, handler, params, { body, query = "" } = {}) {
  requests += 1;
  world.user = who ? CAST[who] : null;
  const init = {
    method: handler.name,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(requests >> 16) & 255}.${(requests >> 8) & 255}.${requests & 255}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), {
    params: Promise.resolve({ roundId: ROUND, ...params }),
  });
  return { status: response.status, body: structuredClone(response.body) };
}
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

/** The form and its sets as the library reads them, from whatever is stored. */
function stored() {
  const form = normalise.normaliseForm(ROUND, world.db.read(roundPath));
  const sets = world.db
    .paths()
    .filter((path) => path.startsWith(`${roundPath}/questionSets/`))
    .map((path) => normalise.normaliseQuestionSet(path.split("/").pop(), world.db.read(path)))
    .filter(Boolean);
  return { form, sets };
}

/** An address a university check accepts. The small term's own are on a reserved domain, which it refuses. */
const UNI = "someone@nottingham.ac.uk";

/** Nina's account, holding a university address that has been checked. */
function ninaAccount() {
  const account = userDoc(CAST.nina);
  return { "users/nina": { ...account, profile: { ...account.profile, universityEmail: UNI } } };
}

/** What somebody wrote, with the set for everybody answered. */
function answered(uid, ranked, looked = "A little: some articles and a podcast.") {
  const content = contentFor(uid, ranked);
  content.aboutYou.universityEmail = UNI;
  content.answers[SHARED] = { [LOOKED]: looked };
  if (ranked.includes(INCUBATOR)) content.answers[INCUBATOR_SET] = { idea: "Measure it." };
  return content;
}

// ---------------------------------------------------------------------------
// 1. The shape, and every place a scope is copied
// ---------------------------------------------------------------------------

/** Every scope a set can have. Held to `model.ts` by the first test below. */
const SCOPES = [
  { type: "everybody" },
  { type: "kind", kind: "fellowship" },
  { type: "kind", kind: "incubator" },
  { type: "programme", programmeId: AGI },
  { type: "facilitating" },
];

/** The `type` of each member of the `QuestionSetScope` union, read out of the source. */
function declaredScopeTypes() {
  const file = join(REPO_ROOT, "src", "lib", "applications", "model.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const types = [];
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "QuestionSetScope") {
      const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const member of members) {
        assert.ok(ts.isTypeLiteralNode(member), "a scope is declared as something other than a plain shape");
        const tag = member.members.find((each) => each.name?.getText(source) === "type");
        assert.ok(tag && ts.isLiteralTypeNode(tag.type), "a scope has no `type` to tell it by");
        types.push(tag.type.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return types;
}

describe("a scope is the same scope wherever it is copied", () => {
  const { form } = (() => {
    world.db = makeDb(termDocs());
    return stored();
  })();
  const setWith = (scope) => normalise.normaliseQuestionSet("a-set", { ...sharedSet(), scope, role: "general" });

  test("the scopes tried here are the scopes the model declares", () => {
    assert.deepEqual(
      [...new Set(SCOPES.map((scope) => scope.type))].sort(),
      declaredScopeTypes().sort(),
      "the model's scopes and this file's are not the same. A new scope is added to SCOPES, " +
        "so that every copy below is asked about it.",
    );
    assert.equal(declaredScopeTypes().length, 4);
  });

  test("the reader keeps it", () => {
    for (const scope of SCOPES) assert.deepEqual(setWith(scope).scope, scope);
    for (const unknown of [{ type: "everyone" }, { type: "all" }, { type: "kind", kind: "course" }, {}, null, "everybody"]) {
      assert.equal(
        normalise.normaliseQuestionSet("a-set", { ...sharedSet(), scope: unknown }),
        null,
        `a set with the scope ${JSON.stringify(unknown)} was read as a set somebody can be shown`,
      );
    }
  });

  test("the editor's reader of a request keeps it", () => {
    for (const scope of SCOPES) {
      assert.deepEqual(editorParse.parseNewSet({ label: "A set", scope }), { ok: true, value: { label: "A set", scope } });
    }
    assert.equal(editorParse.parseNewSet({ label: "A set", scope: { type: "everyone" } }).ok, false);
  });

  test("what the editor is sent keeps it", () => {
    for (const scope of SCOPES) {
      const set = setWith(scope);
      assert.deepEqual(editorViews.projectSetForEditor(set, form, [set]).scope, scope);
    }
  });

  test("what an applicant is sent keeps it", () => {
    for (const scope of SCOPES) {
      const sent = project.projectQuestionSetForApplicant(setWith(scope));
      assert.deepEqual(sent.scope, scope);
      // And the copy the form in the browser rebuilds from it.
      const [rebuilt] = shape.questionSetsOf({ id: ROUND }, [sent]);
      assert.deepEqual(rebuilt.scope, scope);
    }
  });

  test("each scope has its own role and its own place in the editor", () => {
    const told = SCOPES.map((scope) => [
      scope.type,
      editorSets.roleForScope(scope),
      editorSets.familyOf({ scope }, form),
      setWith(scope).role,
    ]);
    assert.deepEqual(told, [
      ["everybody", "general", "everybody", "general"],
      ["kind", "general", "fellowship", "general"],
      ["kind", "general", "incubator", "general"],
      ["programme", "stream", "fellowship", "general"],
      ["facilitating", "facilitator", "facilitating", "facilitator"],
    ]);
  });

  test("a function that copies a scope names every scope, so the compiler refuses a new one", () => {
    // Each of these used to end in a branch that answered for anything it was
    // not told about. Written as a switch with no default, a scope they do not
    // name is a function that can end without answering, and the build fails.
    for (const [file, name] of [
      ["src/lib/applications/applicant/project.ts", "scopeForApplicant"],
      ["src/lib/applications/editor/views.ts", "scopeView"],
      ["src/lib/applications/editor/sets.ts", "roleForScope"],
      ["src/lib/applications/editor/sets.ts", "familyOf"],
    ]) {
      const code = stripSource(read(file), { keepStrings: true });
      const from = code.indexOf(`function ${name}(`);
      assert.ok(from !== -1, `${file} no longer declares ${name}`);
      const body = code.slice(from, code.indexOf("\n}\n", from));
      assert.match(body, /switch \(scope\.type\) \{/, `${name} no longer decides by a switch on the scope`);
      assert.ok(!/\bdefault:/.test(body), `${name} has a default branch, which answers for a scope nobody named`);
      for (const type of declaredScopeTypes()) {
        assert.ok(body.includes(`case "${type}":`), `${name} does not name the scope "${type}"`);
      }
    }
  });
});

describe("the set for everybody is a general set, whatever is stored", () => {
  test("its role is general and none of its questions is scored", () => {
    for (const role of ["general", "stream", "facilitator", "scored", undefined]) {
      const set = normalise.normaliseQuestionSet(
        SHARED,
        sharedSet({ role, questions: [question(LOOKED, "How much?", { scored: true })] }),
      );
      assert.equal(set.role, "general", `stored as ${role}`);
      assert.deepEqual(set.questions.map((each) => each.scored), [false], `stored as ${role}`);
    }
  });

  test("so no programme's reviewers are asked to score an answer to it", () => {
    world.db = makeDb(
      termDocs({
        over: {
          [setPath(SHARED)]: sharedSet({ role: "stream", questions: [question(LOOKED, "How much?", { scored: true })] }),
        },
      }),
    );
    const { form, sets } = stored();
    const sent = answered("amara", [AGI, TAIS, INCUBATOR]);
    for (const programmeId of [AGI, TAIS, INCUBATOR]) {
      for (const keys of [scoring.scoredKeysFor(form, sets, programmeId), scoring.scorableKeysFor(form, sets, programmeId, sent)]) {
        assert.ok(!keys.some((key) => key.startsWith(`${SHARED}.`)), `${programmeId} is asked to score ${keys.join(", ")}`);
      }
    }
    assert.deepEqual(scoring.scoredKeysFor(form, sets, AGI), [`${AGI}.event`]);
  });
});

// ---------------------------------------------------------------------------
// 2. Who is asked, once, and where
// ---------------------------------------------------------------------------

describe("everybody who has picked a programme is asked it, once, first", () => {
  world.db = makeDb(termDocs());
  const { form, sets } = stored();
  const shared = sets.find((set) => set.id === SHARED);
  const choices = (rankedProgrammeIds, wantsToFacilitate = null) => ({ rankedProgrammeIds, wantsToFacilitate });
  const setSteps = (content, which = form, from = sets) =>
    sections.stepsFor(which, from, content).filter((step) => step.kind === "questions").map((step) => step.setId);

  test("whatever kind of programme they picked", () => {
    assert.equal(sections.setApplies(shared, form, choices([])), false, "somebody who has picked nothing is asked it");
    assert.equal(sections.setApplies(shared, form, choices([AGI])), true);
    assert.equal(sections.setApplies(shared, form, choices([INCUBATOR])), true);
    assert.equal(sections.setApplies(shared, form, choices([TAIS, INCUBATOR, AGI])), true);
    // A programme the form does not carry is not a programme picked.
    assert.equal(sections.setApplies(shared, form, choices(["no-such-programme"])), false);
    assert.equal(sections.setApplies(shared, form, choices(["constructor", "toString"])), false);
  });

  test("somebody who picks a fellowship and the incubator meets it once", () => {
    const asked = setSteps(choices([AGI, INCUBATOR]));
    assert.deepEqual(asked, [SHARED, "fellowships", AGI, INCUBATOR_SET]);
    assert.equal(asked.filter((id) => id === SHARED).length, 1);
    // And so does somebody who picks one of each kind in the other order. Two
    // streams side by side are asked in the order the person ranked them.
    assert.deepEqual(setSteps(choices([INCUBATOR, TAIS])), [SHARED, "fellowships", INCUBATOR_SET, TAIS]);
  });

  test("it is the first set of questions for everybody, straight after the form's own steps", () => {
    for (const ranked of [[AGI], [TAIS, AGI], [INCUBATOR], [INCUBATOR, AGI, TAIS]]) {
      const all = sections.stepsFor(form, sets, choices(ranked)).map((step) => step.id);
      const first = all.findIndex((id) => id.startsWith("set:"));
      assert.equal(all[first], `set:${SHARED}`, ranked.join(" then "));
      assert.deepEqual(all.slice(0, first), ranked.length > 1 ? ["about", "choose", "rank"] : ["about", "choose"]);
    }
    // Nothing picked yet: no questions at all.
    assert.deepEqual(setSteps(choices([])), []);
  });

  test("wherever the form's stored order has it", () => {
    for (const questionSetIds of [
      ["fellowships", AGI, TAIS, INCUBATOR_SET, SHARED],
      ["fellowships", SHARED, AGI, TAIS, INCUBATOR_SET],
      [AGI, TAIS, SHARED, "fellowships", INCUBATOR_SET],
    ]) {
      const moved = { ...form, questionSetIds };
      assert.deepEqual(setSteps(choices([AGI, INCUBATOR]), moved)[0], SHARED, questionSetIds.join(", "));
      assert.equal(sections.orderedSets(moved, sets)[0].id, SHARED);
      assert.equal(sections.applicableSets(moved, sets, choices([TAIS]))[0].id, SHARED);
      assert.equal(editorViews.setsInFormOrder(moved, sets)[0].id, SHARED);
      assert.equal(editorSets.setsForProgramme(moved, sets, INCUBATOR)[0].id, SHARED);
    }
  });

  test("with no questions in it, it asks nobody anything", () => {
    const empty = sets.map((set) => (set.id === SHARED ? { ...set, questions: [] } : set));
    assert.deepEqual(setSteps(choices([AGI, INCUBATOR]), form, empty), ["fellowships", AGI, INCUBATOR_SET]);
  });

  test("its required question stops a send, on its own step, and its answers are what is sent", () => {
    const content = answered("amara", [AGI, INCUBATOR]);
    assert.deepEqual(validate.issuesFor(form, sets, content), []);
    const blank = structuredClone(content);
    blank.answers[SHARED][LOOKED] = "  ";
    assert.deepEqual(validate.issuesFor(form, sets, blank), [
      { step: `set:${SHARED}`, questionId: LOOKED, message: "Answer this question." },
    ]);
    // The optional one may be left alone.
    assert.equal(validate.answeredCount(shared, content), 1);
    assert.deepEqual(Object.keys(validate.contentForSend(form, sets, content).answers), [
      SHARED,
      "fellowships",
      AGI,
      INCUBATOR_SET,
    ]);
    assert.deepEqual(validate.contentForSend(form, sets, content).answers[SHARED], content.answers[SHARED]);
  });
});

// ---------------------------------------------------------------------------
// 3. Through the editor's routes
// ---------------------------------------------------------------------------

describe("an admin adds it, names it, edits it and removes it", () => {
  const withoutShared = () =>
    draftForm({ round: { questionSetIds: ["fellowships", AGI, TAIS, INCUBATOR_SET] }, over: { [setPath(SHARED)]: undefined } });

  /** A draft form with no set for everybody on it. */
  function bare() {
    const db = withoutShared();
    // `over` cannot take a document away, so the seeded set is dropped here.
    world.db = makeDb(
      Object.fromEntries(db.paths().filter((path) => path !== setPath(SHARED)).map((path) => [path, db.read(path)])),
      { now: WHILE_OPEN },
    );
    return world.db;
  }
  const add = (who, label = "A few questions for everyone") =>
    call(who, routes.sets.POST, {}, { body: { label, scope: { type: "everybody" } } });

  test("it is made first in the form's order, with the author's own name", async () => {
    bare();
    const made = await add("zach");
    assert.equal(made.status, 201);
    const id = made.body.id;
    assert.deepEqual(world.db.read(roundPath).questionSetIds, [id, "fellowships", AGI, TAIS, INCUBATOR_SET]);
    const doc = world.db.read(setPath(id));
    assert.deepEqual(
      { role: doc.role, scope: doc.scope, label: doc.label, questions: doc.questions },
      { role: "general", scope: { type: "everybody" }, label: "A few questions for everyone", questions: [] },
    );
    // What the editor is sent: first in the list, with who sees it in words.
    const [first] = made.body.sets;
    assert.deepEqual(
      { id: first.id, role: first.role, scope: first.scope, family: first.family, label: first.label, audience: first.audience },
      {
        id,
        role: "general",
        scope: { type: "everybody" },
        family: "everybody",
        label: "A few questions for everyone",
        audience: "Everyone, whatever they tick",
      },
    );
    assert.equal(
      first.description,
      "Asked once, to everyone, before every other set. The lead and reviewers of each programme they pick read the answers.",
    );
  });

  test("a form has at most one: a second is refused, and nothing is written", async () => {
    bare();
    const first = await add("zach", "Shared");
    assert.equal(first.status, 201);
    const before = everything();
    const second = await add("zach", "Shared again");
    assert.equal(second.status, 409);
    assert.equal(second.body.error, editorWrite.ONE_SET_FOR_EVERYBODY);
    assert.equal(everything(), before, "the refused request changed something");
    // Other sets are still made as before.
    const stream = await call("zach", routes.sets.POST, {}, { body: { label: "More", scope: { type: "programme", programmeId: AGI } } });
    assert.equal(stream.status, 201);
  });

  test("two admins adding one at the same moment make one", async () => {
    bare();
    // Somebody else's set lands while this request is between its read and its write.
    world.db.beforeCommit = () => {
      world.db.seed(setPath("theirs"), sharedSet({ label: "Theirs", questions: [] }));
      world.db.poke(roundPath, { questionSetIds: ["theirs", "fellowships", AGI, TAIS, INCUBATOR_SET] });
    };
    const mine = await add("zach", "Mine");
    assert.equal(mine.status, 409);
    assert.equal(mine.body.error, editorWrite.ONE_SET_FOR_EVERYBODY);
    const everybodySets = world.db
      .paths()
      .filter((path) => path.startsWith(`${roundPath}/questionSets/`))
      .filter((path) => world.db.read(path).scope.type === "everybody");
    assert.deepEqual(everybodySets, [setPath("theirs")]);
  });

  test("its name and its questions are the author's, and a scored question is refused", async () => {
    draftForm();
    const renamed = await call("zach", routes.set.PATCH, { setId: SHARED }, { body: { label: "About you and AI safety" } });
    assert.equal(renamed.status, 200);
    assert.equal(world.db.read(setPath(SHARED)).label, "About you and AI safety");
    assert.equal(renamed.body.set.label, "About you and AI safety");

    const one = question(null, "Would you like to hear about joining the committee?", { type: "choice", options: ["Yes please", "No thanks"], required: false });
    const written = await call("zach", routes.set.PATCH, { setId: SHARED }, { body: { questions: [one] } });
    assert.equal(written.status, 200);
    assert.deepEqual(world.db.read(setPath(SHARED)).questions.map((each) => [each.text, each.type, each.scored]), [
      ["Would you like to hear about joining the committee?", "choice", false],
    ]);

    const before = everything();
    const scored = await call("zach", routes.set.PATCH, { setId: SHARED }, { body: { questions: [{ ...one, scored: true }] } });
    assert.equal(scored.status, 400);
    assert.equal(scored.body.error, "General questions aren’t scored.");
    assert.equal(everything(), before);
    assert.equal(editorSets.scoredRefusal("general"), "General questions aren’t scored.");
    // Who it is for cannot be changed afterwards, as for any set.
    const moved = await call("zach", routes.set.PATCH, { setId: SHARED }, { body: { scope: { type: "facilitating" } } });
    assert.equal(moved.status, 400);
  });

  test("it is removed like any other set, and another can then be made", async () => {
    draftForm();
    const removed = await call("zach", routes.set.DELETE, { setId: SHARED });
    assert.equal(removed.status, 200);
    assert.equal(world.db.read(setPath(SHARED)), undefined);
    assert.deepEqual(world.db.read(roundPath).questionSetIds, ["fellowships", AGI, TAIS, INCUBATOR_SET]);
    assert.ok(!removed.body.sets.some((set) => set.scope.type === "everybody"));
    const again = await add("zach", "Shared");
    assert.equal(again.status, 201);
    assert.equal(world.db.read(roundPath).questionSetIds[0], again.body.id);
  });

  test("it counts towards the sets a form may have", async () => {
    const many = Array.from({ length: model.APPLICATION_LIMITS.maxQuestionSets }, (_, index) => `extra-${index}`);
    bare();
    for (const id of many) {
      world.db.seed(setPath(id), { roundId: ROUND, role: "stream", scope: { type: "programme", programmeId: AGI }, label: id, intro: "", questions: [] });
    }
    world.db.poke(roundPath, { questionSetIds: many });
    const refused = await add("zach");
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, `A form takes at most ${model.APPLICATION_LIMITS.maxQuestionSets} question sets.`);
  });

  test("once somebody has applied it is locked with the rest of the form's questions", async () => {
    at(WHILE_OPEN);
    world.db = makeDb(termDocs(), { now: WHILE_OPEN });
    const sentence = lock.lockedSentence(3);
    for (const [name, response] of [
      ["add", await call("zach", routes.sets.POST, {}, { body: { label: "Late", scope: { type: "everybody" } } })],
      ["edit", await call("zach", routes.set.PATCH, { setId: SHARED }, { body: { questions: [] } })],
      ["remove", await call("zach", routes.set.DELETE, { setId: SHARED })],
    ]) {
      assert.equal(response.status, 409, name);
      assert.equal(response.body.error, sentence, name);
    }
    assert.ok(world.db.read(setPath(SHARED)).questions.length === 2);
  });

  test("only an admin does any of it", async () => {
    draftForm();
    const before = everything();
    for (const who of ["claudia", "lloyd", "yusuf", "amara", null]) {
      for (const response of [
        await call(who, routes.sets.POST, {}, { body: { label: "Mine", scope: { type: "everybody" } } }),
        await call(who, routes.set.PATCH, { setId: SHARED }, { body: { label: "Mine" } }),
        await call(who, routes.set.DELETE, { setId: SHARED }),
      ]) {
        assert.ok([401, 403, 404].includes(response.status), `${who}: ${response.status}`);
      }
    }
    assert.equal(everything(), before);
  });

  test("the dialog offers it only while the form has none", () => {
    const editor = stripSource(read("src/features/applications/editor/FormEditor.tsx"), { keepStrings: true });
    assert.match(editor, /hasEverybody=\{sets\.some\(\(set\) => set\.scope\.type === "everybody"\)\}/);
    assert.match(
      editor,
      /if \(!hasEverybody\) \{\s*out\.push\(\{\s*value: "everybody",\s*label: "Everyone, whatever they tick",\s*scope: \{ type: "everybody" \},\s*\}\);\s*\}/,
    );
  });
});

describe("how the editor and the form name it", () => {
  world.db = makeDb(termDocs());
  const { form, sets } = stored();
  const shared = sets.find((set) => set.id === SHARED);
  const named = (label) => ({ ...shared, label });

  test("the editor says who sees it", () => {
    assert.equal(editorSets.whoSees(shared, form), "Everyone, whatever they tick");
    assert.equal(
      editorSets.describeSet(shared, form, sets),
      "Asked once, to everyone, before every other set. The lead and reviewers of each programme they pick read the answers.",
    );
    assert.equal(editorSets.SET_ROLE_LABEL[shared.role], "General");
  });

  test("a new one goes first in the order, and every other set goes where it went", () => {
    const order = ["fellowships", AGI, TAIS, "facilitator"];
    const known = [
      ...sets.filter((set) => set.id !== SHARED && set.id !== INCUBATOR_SET),
      { id: "facilitator", scope: { type: "facilitating" } },
    ];
    assert.deepEqual(
      editorSets.orderWithNewSet(order, known, form, { id: "new", scope: { type: "everybody" } }),
      ["new", "fellowships", AGI, TAIS, "facilitator"],
    );
    // A stream and a kind's general set land where they did before there was one.
    const withShared = ["new", ...order];
    const knownWithShared = [...known, { id: "new", scope: { type: "everybody" } }];
    assert.deepEqual(
      editorSets.orderWithNewSet(withShared, knownWithShared, form, { id: "more", scope: { type: "programme", programmeId: AGI } }),
      ["new", "fellowships", AGI, TAIS, "more", "facilitator"],
    );
    assert.deepEqual(
      editorSets.orderWithNewSet(withShared, knownWithShared, form, { id: "inc", scope: { type: "kind", kind: "incubator" } }),
      ["new", "fellowships", AGI, TAIS, "inc", "facilitator"],
    );
  });

  test("every programme's settings list it first, as asked of everyone", async () => {
    world.db = makeDb(termDocs(), { now: WHILE_OPEN });
    for (const programmeId of [AGI, TAIS, INCUBATOR]) {
      const settings = await call("zach", routes.programme.GET, { programmeId });
      assert.equal(settings.status, 200);
      assert.deepEqual(settings.body.programme.questionSets[0], {
        id: SHARED,
        label: "Shared questions, asked of everyone",
        questions: 2,
        scored: false,
      });
    }
    assert.equal(editorSets.summaryLabel(named("Questions for everyone"), form, AGI), "Questions for everyone, asked of everyone");
    assert.equal(editorSets.summaryLabel(named("About you questions"), form, AGI), "About you questions, asked of everyone");
  });

  test("the form calls its step by the author's name for it", () => {
    assert.equal(steps.setStepLabel(shared), "Shared questions");
    assert.equal(steps.setStepLabel(named("A few questions for everyone")), "A few questions for everyone");
    assert.equal(steps.setStepLabel(named("One question first")), "One question first");
    assert.equal(steps.setStepLabel(named("About you and AI safety")), "About you and AI safety questions");
    assert.equal(steps.setHeading(named("A few questions for everyone")), "A few questions for everyone");
    assert.equal(steps.setChangeLabel(named("A few questions for everyone")), "answers to A few questions for everyone");
    assert.equal(steps.setChip(shared, Object.values(form.programmes)), null);
    // The other sets are named as they always were.
    const byId = (id) => sets.find((set) => set.id === id);
    assert.deepEqual(
      ["fellowships", AGI, INCUBATOR_SET].map((id) => [steps.setStepLabel(byId(id)), steps.setChangeLabel(byId(id))]),
      [
        ["Fellowship questions", "fellowship answers"],
        ["AGI Strategy questions", "AGI Strategy answers"],
        ["Research incubator questions", "Research incubator answers"],
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// 4. The applicant
// ---------------------------------------------------------------------------

describe("an applicant is sent it, saves it, sends it and sees what changed", () => {
  const draftOf = (uid, ranked, looked) => answered(uid, ranked, looked);

  test("it is the first set they are sent, as what it is", async () => {
    openForm({ over: ninaAccount() });
    const view = await call("nina", routes.application.GET, {});
    assert.equal(view.status, 200);
    const [first] = view.body.sets;
    assert.deepEqual(first, {
      id: SHARED,
      role: "general",
      scope: { type: "everybody" },
      label: "Shared",
      applicantLine: "",
      questions: [
        { id: LOOKED, text: "How much have you looked into AI safety before?", help: "", type: "long", options: [], optionsFromRanking: false, wordLimit: null, required: true },
        { id: CV, text: "A link to your CV, if you have one.", help: "", type: "short", options: [], optionsFromRanking: false, wordLimit: null, required: false },
      ],
    });
    // And the form in the browser works its steps out from what it was sent.
    const shapeForm = shape.formShapeOf(view.body.form);
    const shapeSets = shape.questionSetsOf(view.body.form, view.body.sets);
    const asked = sections
      .stepsFor(shapeForm, shapeSets, { rankedProgrammeIds: [TAIS, INCUBATOR], wantsToFacilitate: null })
      .filter((step) => step.kind === "questions")
      .map((step) => step.setId);
    assert.deepEqual(asked, [SHARED, "fellowships", TAIS, INCUBATOR_SET]);
  });

  test("a send waits for its required answer, and then the answer is on the application once", async () => {
    openForm({ over: ninaAccount() });
    const blank = draftOf("nina", [TAIS, INCUBATOR]);
    delete blank.answers[SHARED];
    assert.equal((await call("nina", routes.application.PUT, {}, { body: { draft: blank } })).status, 200);
    const held = await call("nina", routes.send.POST, {}, { body: {} });
    assert.equal(held.status, 400);
    assert.deepEqual(held.body.issues, [{ step: `set:${SHARED}`, questionId: LOOKED, message: "Answer this question." }]);
    assert.equal(world.db.read(applicationPath("nina")).sent, null);

    const full = draftOf("nina", [TAIS, INCUBATOR], "A fair bit: a course last year.");
    full.answers[SHARED][CV] = "https://example.org/nina";
    assert.equal((await call("nina", routes.application.PUT, {}, { body: { draft: full } })).status, 200);
    const sent = await call("nina", routes.send.POST, {}, { body: {} });
    assert.equal(sent.status, 200);
    const stored = world.db.read(applicationPath("nina"));
    assert.deepEqual(stored.sent.answers[SHARED], { [LOOKED]: "A fair bit: a course last year.", [CV]: "https://example.org/nina" });
    assert.deepEqual(Object.keys(stored.sent.answers), [SHARED, "fellowships", TAIS, INCUBATOR_SET]);
    // One answer, although she picked a fellowship and the incubator.
    assert.equal(JSON.stringify(stored.sent).split("A fair bit: a course last year.").length - 1, 1);
  });

  test("after sending, a change to it is a change she has not sent yet, and sending again keeps what it said", async () => {
    openForm({ over: ninaAccount() });
    const first = draftOf("nina", [TAIS], "Not at all: this would be my first real look.");
    await call("nina", routes.application.PUT, {}, { body: { draft: first } });
    assert.equal((await call("nina", routes.send.POST, {}, { body: {} })).status, 200);
    const page = async () => (await statusLoad.loadStatus(world.db, ROUND, "nina", new Date())).view;
    assert.deepEqual([(await page()).kind, (await page()).unsentChanges], ["sent", false]);

    const second = draftOf("nina", [TAIS], "A little: I read a book over the summer.");
    await call("nina", routes.application.PUT, {}, { body: { draft: second } });
    assert.equal((await page()).unsentChanges, true, "a changed answer to the set for everybody was not noticed");
    assert.equal(world.db.read(applicationPath("nina")).sent.answers[SHARED][LOOKED], first.answers[SHARED][LOOKED]);

    at(new Date(WHILE_OPEN.getTime() + 3_600_000));
    assert.equal((await call("nina", routes.send.POST, {}, { body: {} })).status, 200);
    const stored = world.db.read(applicationPath("nina"));
    assert.equal(stored.sent.answers[SHARED][LOOKED], second.answers[SHARED][LOOKED]);
    assert.equal(stored.sentHistory.length, 1);
    assert.equal(stored.sentHistory[0].content.answers[SHARED][LOOKED], first.answers[SHARED][LOOKED]);

    // Whoever reviews her is told it changed, and what it said before.
    at(WHILE_DECIDING);
    const review = await call("tess", routes.review.GET, { uid: "nina" }, { query: `?programme=${TAIS}` });
    assert.equal(review.status, 200);
    assert.equal(review.body.review.changes.count, 1);
    assert.deepEqual(review.body.review.changes.where, [SHARED]);
    const section = review.body.review.sections.find((each) => each.id === SHARED);
    const answer = section.answers.find((each) => each.key === `${SHARED}.${LOOKED}`);
    assert.equal(answer.text, second.answers[SHARED][LOOKED]);
    assert.deepEqual(answer.earlier.map((entry) => entry.text), [first.answers[SHARED][LOOKED]]);
    assert.ok(section.chips.some((chip) => chip.text === "Changed"));
    // It was always part of her application, so nothing says it was added.
    assert.ok(!section.chips.some((chip) => chip.text.startsWith("Added")));
  });
});

// ---------------------------------------------------------------------------
// 5. Who reads the answers
// ---------------------------------------------------------------------------

const SENT_AT = new Date("2026-10-09T14:20:00+01:00");
const TOLD_AT = new Date("2026-10-23T09:00:00+01:00");

/** A sent application whose answers include the set for everybody. */
const sentBy = (uid, ranked, looked, over = {}) => {
  const content = answered(uid, ranked, looked);
  return { ...applicationDoc(uid, ranked), draft: content, sent: content, ...over };
};

/**
 * Nina ranked AGI Strategy alone, was pooled, and was invited to Technical AI
 * Safety, which Tess leads. `response` is her reply, or null while there is none.
 */
const invitedNina = (response) => ({
  [applicationPath("nina")]: sentBy("nina", [AGI], "Nina’s own answer, which nobody else gave.", {
    status: response === "accepted" ? "accepted" : "invited",
    result: { kind: "invited", programmeId: TAIS, publishedAt: TOLD_AT, email: "sent", emailedAt: TOLD_AT, emailClaimedAt: null },
    invitation: { programmeId: TAIS, replyBy: "2026-10-25", response, respondedAt: response ? TOLD_AT : null, lastReminderOn: null },
  }),
  [decisionPath("nina")]: {
    roundId: ROUND,
    uid: "nina",
    programmes: { [AGI]: { decision: "pool", poolReason: "capacity", couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: SENT_AT } },
    pooledOutcome: { kind: "invite", programmeId: TAIS, setByUid: "zach", setAt: SENT_AT },
    exception: null,
  },
});

function reviewingTerm(more = {}) {
  at(WHILE_DECIDING);
  world.db = makeDb(
    termDocs({
      round: { status: "deciding", applicationCounts: { draft: 0, submitted: 4 } },
      over: {
        [applicationPath("amara")]: sentBy("amara", [AGI, TAIS], "Amara’s own answer, which nobody else gave."),
        [applicationPath("dev")]: sentBy("dev", [AGI], "Dev’s own answer, which nobody else gave."),
        [applicationPath("wen")]: sentBy("wen", [TAIS, AGI], "Wen’s own answer, which nobody else gave."),
        ...more,
      },
    }),
    { now: WHILE_DECIDING },
  );
  return world.db;
}
const reviewOf = (who, uid, programmeId) =>
  call(who, routes.review.GET, { uid }, { query: programmeId ? `?programme=${programmeId}` : "" });

describe("its answers are read by everybody who may read the application, and by nobody else", () => {
  test("an admin, and the lead and reviewers of each programme the person ranked", async () => {
    reviewingTerm();
    for (const [who, programmeId] of [
      ["zach", AGI],
      ["zach", TAIS],
      ["claudia", AGI],
      ["lloyd", AGI],
      ["tess", TAIS],
    ]) {
      const response = await reviewOf(who, "amara", programmeId);
      assert.equal(response.status, 200, `${who} under ${programmeId}`);
      const [first] = response.body.review.sections;
      assert.deepEqual(
        { id: first.id, title: first.title, role: first.role, mode: first.mode, chips: first.chips },
        {
          id: SHARED,
          title: "Shared questions",
          role: "general",
          mode: "open",
          chips: [
            { text: "Asked of everyone", tone: "neutral" },
            { text: "Not scored", tone: "neutral" },
          ],
        },
        `${who} under ${programmeId}`,
      );
      assert.deepEqual(
        first.answers.map((answer) => [answer.key, answer.answered, answer.text, answer.scorable]),
        [
          [`${SHARED}.${LOOKED}`, true, "Amara’s own answer, which nobody else gave.", false],
          [`${SHARED}.${CV}`, false, null, false],
        ],
        `${who} under ${programmeId}`,
      );
      assert.ok(
        !response.body.review.review.scorableKeys.some((key) => key.startsWith(`${SHARED}.`)),
        `${who} is offered a score for an answer to the set for everybody`,
      );
    }
  });

  test("nobody else: no role on the form, or a role only on a programme the person did not pick", async () => {
    reviewingTerm();
    for (const [who, uid, programmeId] of [
      ["yusuf", "amara", AGI],
      ["yusuf", "amara", null],
      ["amara", "dev", AGI],
      ["refused", "amara", AGI],
      [null, "amara", AGI],
      // Tess leads Technical AI Safety and the incubator. Dev picked neither.
      ["tess", "dev", TAIS],
      ["tess", "dev", INCUBATOR],
      ["tess", "dev", null],
      // And nobody reads Amara under a programme she did not pick.
      ["tess", "amara", INCUBATOR],
    ]) {
      const response = await reviewOf(who, uid, programmeId);
      assert.ok([401, 403, 404].includes(response.status), `${who} read ${uid} under ${programmeId}: ${response.status}`);
      assert.ok(
        !JSON.stringify(response.body).includes("own answer, which nobody else gave"),
        `${who} was sent an answer of ${uid}’s`,
      );
    }
  });

  test("the programme somebody joins by invitation reads it once they accept, and not before", async () => {
    // Invited, and not answered: Tess, who leads the programme she is invited to, reads nothing.
    reviewingTerm(invitedNina(null));
    const before = await reviewOf("tess", "nina", TAIS);
    assert.equal(before.status, 404);
    assert.ok(!JSON.stringify(before.body).includes("Nina’s own answer"));
    // Said no thanks: still nothing.
    reviewingTerm(invitedNina("declined"));
    assert.equal((await reviewOf("tess", "nina", TAIS)).status, 404);

    // Accepted: read as if she had ranked it.
    reviewingTerm(invitedNina("accepted"));
    const after = await reviewOf("tess", "nina", TAIS);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body.review.applicant.invitedTo, { programmeId: TAIS, shortName: "Technical AI Safety" });
    const [first] = after.body.review.sections;
    assert.equal(first.id, SHARED);
    assert.equal(first.answers[0].text, "Nina’s own answer, which nobody else gave.");
    // The programme she did rank reads it as it always did.
    assert.equal((await reviewOf("claudia", "nina", AGI)).body.review.sections[0].answers[0].text, "Nina’s own answer, which nobody else gave.");
  });

  test("a reviewer may comment on one of its answers and may not score one", async () => {
    reviewingTerm();
    const key = `${SHARED}.${LOOKED}`;
    const scored = await call("lloyd", routes.saveReview.PUT, { uid: "amara" }, { body: { programmeId: AGI, scores: { [key]: 4 } } });
    assert.equal(scored.status, 400);
    assert.equal(scored.body.error, "You can only score the answers of a programme you review.");
    assert.equal(world.db.read(`admissionReviews/${ROUND}__amara__lloyd`), undefined);

    const commented = await call(
      "lloyd",
      routes.saveReview.PUT,
      { uid: "amara" },
      { body: { programmeId: AGI, comments: [{ op: "add", key, text: "Has done more than most." }] } },
    );
    assert.equal(commented.status, 200);
    assert.deepEqual(
      world.db.read(`admissionReviews/${ROUND}__amara__lloyd`).comments.map((comment) => [comment.questionKey, comment.text]),
      [[key, "Has done more than most."]],
    );
  });

  test("the last step of the form still names exactly the people who can", () => {
    // The sentence the form makes to somebody sending, and the predicate
    // behind every read above. Neither changed for this set.
    assert.match(
      read("src/features/applications/apply/CheckStep.tsx"),
      /Your application is read by the lead and the reviewers of each programme you pick, and by NAISI’s admins\./,
    );
    const access = stripSource(read("src/lib/applications/access.ts"), { keepStrings: true });
    assert.match(
      access,
      /if \(user\.role === "admin"\) return true;\s*if \(joined !== null && roleOnProgramme\(user, form, joined\) !== null\) return true;\s*return ranked\.some\(\(programmeId\) => roleOnProgramme\(user, form, programmeId\) !== null\);/,
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Readiness to open
// ---------------------------------------------------------------------------

describe("a form whose shared questions are all in the set for everybody can open", () => {
  const NOW = new Date("2026-10-05T09:00:00+01:00");
  const ask = (form, sets) =>
    readiness.formReadiness(
      {
        opensAt: new Date("2026-10-06T09:00:00+01:00"),
        closesAt: new Date("2026-10-18T23:59:00+01:00"),
        decisionsByDate: "2026-10-23",
        form,
        sets,
        leadsInStanding: new Set(["claudia", "tess"]),
      },
      NOW,
    );
  const ids = (result) => result.checks.map((check) => check.id);
  /** The stored term with only these sets on the form. */
  function only(setIds, replace = {}) {
    world.db = makeDb(termDocs({ round: { questionSetIds: setIds }, over: replace }));
    return stored();
  }

  test("with a question in it, no kind of programme needs a general set of its own", () => {
    const { form, sets } = only([SHARED, AGI, TAIS, INCUBATOR_SET]);
    const result = ask(form, sets);
    assert.deepEqual(result.unmet, []);
    assert.equal(result.ready, true);
    assert.deepEqual(ids(result), ["window", "decisions", "programmes", "leads", "general-everybody", "questions"]);
    assert.deepEqual(
      result.checks.find((check) => check.id === "general-everybody"),
      { id: "general-everybody", label: "Everybody who applies is asked the questions for everyone", ok: true, hint: "", fixAt: null },
    );
    // A kind's own general set that is there and empty asks nobody anything, like a stream with no questions.
    const emptyKind = only([SHARED, "fellowships", AGI, TAIS], {
      [setPath("fellowships")]: { roundId: ROUND, role: "general", scope: { type: "kind", kind: "fellowship" }, label: "Fellowships", intro: "", questions: [] },
    });
    assert.equal(ask(emptyKind.form, emptyKind.sets).ready, true);
  });

  test("with no question in it, each kind needs its own, as it always has", () => {
    const empty = only([SHARED, AGI, TAIS, INCUBATOR_SET], { [setPath(SHARED)]: sharedSet({ questions: [] }) });
    const result = ask(empty.form, empty.sets);
    assert.equal(result.ready, false);
    assert.deepEqual(ids(result), ["window", "decisions", "programmes", "leads", "general-fellowship", "general-incubator", "questions"]);
    assert.deepEqual(result.unmet.map((check) => check.id), ["general-fellowship", "general-incubator"]);
  });

  test("without one, nothing about readiness has changed", () => {
    const { form, sets } = only(["fellowships", AGI, TAIS, INCUBATOR_SET]);
    const result = ask(form, sets);
    assert.deepEqual(ids(result), ["window", "decisions", "programmes", "leads", "general-fellowship", "general-incubator", "questions"]);
    assert.deepEqual(result.unmet.map((check) => check.id), ["general-incubator"]);
  });

  test("a question in it that cannot be answered still holds the form shut", () => {
    const broken = only([SHARED, AGI, TAIS, INCUBATOR_SET], {
      [setPath(SHARED)]: sharedSet({ questions: [question("pick", "Pick one.", { type: "choice", options: ["Only one"] })] }),
    });
    const result = ask(broken.form, broken.sets);
    assert.deepEqual(result.unmet.map((check) => check.id), ["questions"]);
    assert.match(result.unmet[0].hint, /^Question 1 in “Shared” has fewer than 2 options to pick from\./);
  });

  test("the route that opens a form goes by the same answer", async () => {
    at(NOW);
    const seed = (sharedQuestions) =>
      makeDb(
        termDocs({
          round: {
            status: "draft",
            applicationCounts: { draft: 0, submitted: 0 },
            questionSetIds: [SHARED, AGI, TAIS, INCUBATOR_SET],
          },
          over: { [setPath(SHARED)]: sharedSet({ questions: sharedQuestions }) },
          applications: false,
        }),
        { now: NOW },
      );
    world.db = seed([]);
    const refused = await call("zach", routes.status.POST, {}, { body: { status: "open" } });
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.body.unmet.map((line) => line.id), ["general-fellowship", "general-incubator"]);
    assert.equal(world.db.read(roundPath).status, "draft");

    world.db = seed(sharedSet().questions);
    const opened = await call("zach", routes.status.POST, {}, { body: { status: "open" } });
    assert.equal(opened.status, 200);
    assert.equal(world.db.read(roundPath).status, "open");
  });
});

// ---------------------------------------------------------------------------
// 7. What the privacy policy says about answers
// ---------------------------------------------------------------------------

describe("the privacy policy's sentences about answers are still what happens", () => {
  const policy = read("src/content/legal/privacy/v6.tsx").replace(/\s+/g, " ");

  test("every answer is read by the people who read the application, and only a programme's own questions are scored", () => {
    assert.match(
      policy,
      /They read the application you sent: what you told us about yourself, the order of your choices, your availability, and every answer, including your answers to the other programmes you ranked\./,
    );
    assert.match(
      policy,
      /a reviewer can give each of your answers to that programme&apos;s own questions a score from 1 to 5/,
    );
    assert.match(policy, /Admins, and the lead and the reviewers of each programme you ranked\./);
    // The form's own description: the questions go with what somebody ticked.
    // The set for everybody is asked of nobody who has ticked nothing.
    assert.match(policy, /answer the questions that go with the ones you ticked/);
    world.db = makeDb(termDocs());
    const { form, sets } = stored();
    assert.deepEqual(sections.applicableSets(form, sets, { rankedProgrammeIds: [], wantsToFacilitate: true }), []);
  });
});
