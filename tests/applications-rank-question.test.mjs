/**
 * A question that asks for an order.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A question's type can be `rank`. Its options are the things to put in order
 * (two to ten). The answer is the options the person placed, in their order:
 * each one of the question's own, none of them twice, as many as they like,
 * and at least a first choice when the question is required. What is held:
 *
 *  - EVERY TYPE IS ITSELF, EVERYWHERE A TYPE DECIDES. Three functions used to
 *    end in a branch that treated any type they did not know as a scale, so
 *    a new type would have been checked, cleaned and drawn as one. Each is
 *    now a switch with no default, and each type the model declares is run
 *    through all three: its own answer passes, and every other type's answer
 *    does not.
 *  - STORED AS A LIST OF OPTION TEXTS, the shape "several choices" has, in
 *    the PERSON'S order. So no rule and no stored shape changes. A save keeps
 *    only the question's own options, each once, and the send checks again.
 *  - NEVER SCORED, wherever it sits. The reader clears the flag, the editor's
 *    route ignores one sent, the editor does not send one, and no reviewer is
 *    offered a score for it.
 *  - ONE RANKING CONTROL. The Rank step's list of programmes and a ranking
 *    question's list of options are one component, which needs no drag: every
 *    row has an up and a down button, and its handle answers the keyboard.
 *  - A NUMBERED LIST on the review screen, and its order in words on the
 *    form's last step. Placing the same options in another order is a
 *    change, to the applicant's own page and to whoever reviews them.
 *  - WHEN AN AUTHOR CHANGES THE OPTIONS, a ranking does what "pick one" and
 *    "several choices" do: nothing can change once anybody has sent, and
 *    before that a draft keeps only what is still an option from its owner's
 *    next save.
 *
 * Real: every route handler used, the loaders, builders and writers under
 * `src/lib/applications/`, and the form's own components. Faked:
 * `next/server`, the sentinels `firebase-admin/firestore` supplies, the
 * view-as guard, the session, the mail door, the stylesheets, and the Admin
 * SDK handle, which is `tests/lib/applicationsStore.mjs`.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  WHILE_OPEN,
  applicationDoc,
  applicationPath,
  contentFor,
  seedTerm,
  userDoc,
} from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(REPO_ROOT, file), "utf8");

const world = { db: null, user: null };
globalThis.__rankQuestion = world;

/** A stylesheet: every class it is asked for is its own name. */
const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";

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
    ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__rankQuestion.db;\n}"],
    ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__rankQuestion.user;\n}"],
    ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
    // Nothing in this file sends, and nothing could.
    ["@/lib/email/send", "export async function sendEmail() {\n  throw new Error('this suite sends nothing');\n}"],
    ["./form.module.css", STYLES],
    ["./rank.module.css", STYLES],
    ["./check.module.css", STYLES],
    ["./parts.module.css", STYLES],
    ["./ReviewScreen.module.css", STYLES],
    ["./MemberText.module.css", STYLES],
    ["@/features/applications/kit/kit.module.css", STYLES],
  ]),
});
const lib = (...parts) => loadTs(join("lib", "applications", ...parts));
const feature = (...parts) => loadTs(join("features", "applications", ...parts));
const api = (...parts) => loadTs(join("app", "api", "admissions", "forms", "[roundId]", ...parts, "route.ts"));

const model = await lib("model.ts");
const normalise = await lib("normalise.ts");
const validate = await lib("validate.ts");
const scoring = await lib("scoring.ts");
const draft = await lib("applicant", "draft.ts");
const shape = await lib("applicant", "shape.ts");
const kept = await lib("versions", "kept.ts");
const editorParse = await lib("editor", "parse.ts");
const editorSets = await lib("editor", "sets.ts");
const lock = await lib("editor", "lock.ts");
const readiness = await lib("lifecycle", "readiness.ts");
const statusLoad = await lib("status", "load.ts");
const questionModel = await feature("editor", "questionModel.ts");
const checkText = await feature("apply", "checkText.ts");
const { default: QuestionsStep } = await feature("apply", "QuestionsStep.tsx");
const rankQuestion = await feature("apply", "RankQuestion.tsx");
const { default: RankQuestion } = rankQuestion;
const { default: RankStep } = await feature("apply", "RankStep.tsx");
const { SectionCard } = await feature("review", "ReviewSections.tsx");

const routes = {
  set: await api("sets", "[setId]"),
  application: await api("application"),
  send: await api("application", "send"),
  review: await api("applications", "[uid]"),
  saveReview: await api("applications", "[uid]", "review"),
};

mock.timers.enable({ apis: ["Date"], now: WHILE_OPEN });
const at = (when) => mock.timers.setTime(when.getTime());

// ---------------------------------------------------------------------------
// The term: AGI Strategy's own questions hold one of every kind that offers options
// ---------------------------------------------------------------------------

const PROJECTS = ["Evals", "Interpretability", "Governance", "Field building", "Forecasting"];
const UNI = "someone@nottingham.ac.uk";

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

/**
 * AGI Strategy's stream, which is scored. The ranking is stored as scored, as
 * a document written by hand or by an older build could be.
 */
const agiSet = (over = {}) => ({
  roundId: ROUND,
  role: "stream",
  scope: { type: "programme", programmeId: AGI },
  label: "AGI Strategy",
  intro: "",
  questions: [
    question("event", "Pick something that happened in AI this year.", { scored: true }),
    question("order", "Put the projects in the order you’d like them.", { type: "rank", options: PROJECTS, scored: true }),
    question("areas", "Which of these interest you?", { type: "multi", options: PROJECTS, required: false }),
    question("first", "Which would you start with?", { type: "choice", options: PROJECTS, required: false }),
  ],
  ...over,
});

const setPath = (id) => `admissionRounds/${ROUND}/questionSets/${id}`;
const roundPath = `admissionRounds/${ROUND}`;

/** Nina's account, holding a university address that passes the form's own check. */
function ninaAccount() {
  const account = userDoc(CAST.nina);
  return { "users/nina": { ...account, profile: { ...account.profile, universityEmail: UNI } } };
}

function termDocs({ round = {}, over = {}, applications = true } = {}) {
  const docs = seedTerm({ round, over: { [setPath(AGI)]: agiSet(), ...ninaAccount(), ...over } });
  if (!applications) {
    for (const path of Object.keys(docs)) {
      if (path.startsWith("admissionApplications/")) delete docs[path];
    }
  }
  return docs;
}

/** An open form with nobody's application yet, which an admin can still change. */
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

/** What somebody who picked AGI Strategy wrote, with this ranking. */
function answered(uid, order, more = {}) {
  const content = contentFor(uid, [AGI]);
  content.aboutYou.universityEmail = UNI;
  content.answers[AGI] = { event: "A new law came into force.", order, ...more };
  return content;
}
const save = (who, content) => call(who, routes.application.PUT, {}, { body: { draft: content } });
const sendIt = (who) => call(who, routes.send.POST, {}, { body: {} });

const rank = (over = {}) => question("order", "Put the projects in the order you’d like them.", { type: "rank", options: PROJECTS, ...over });

// ---------------------------------------------------------------------------
// 1. Every type is itself, everywhere a type decides
// ---------------------------------------------------------------------------

/** Every type a question can have, with an answer to it. Held to `model.ts` by the first test below. */
const TYPES = {
  short: { options: [], answer: "A few words." },
  long: { options: [], answer: "A paragraph about it." },
  choice: { options: ["Evals", "Governance"], answer: "Governance" },
  multi: { options: ["Evals", "Governance", "Forecasting"], answer: ["Evals", "Forecasting"] },
  scale: { options: ["Never", "Sometimes", "Often"], answer: 2 },
  rank: { options: ["Evals", "Governance", "Forecasting"], answer: ["Forecasting", "Evals"] },
};

/**
 * Which other types' answers are also an answer to a question of each type.
 * Text is text, so a choice that was picked (a piece of text) reads as words
 * to a text question. A list of a question's own options is a list of them,
 * whichever of the two kinds of list the question asks for. Nothing else of
 * one type's is ever an answer to another's.
 */
const ALSO_AN_ANSWER_TO = {
  short: ["long", "choice"],
  long: ["short", "choice"],
  choice: [],
  multi: ["rank"],
  scale: [],
  rank: ["multi"],
};

/** The members of the `QuestionType` union, read out of the source. */
function declaredTypes() {
  const file = join(REPO_ROOT, "src", "lib", "applications", "model.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const types = [];
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "QuestionType") {
      assert.ok(ts.isUnionTypeNode(node.type), "a question's type is no longer a list of names");
      for (const member of node.type.types) types.push(member.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return types;
}

describe("every type a question can have is itself, everywhere a type decides", () => {
  const typeNames = Object.keys(TYPES);
  const questionOf = (type, over = {}) => question(`a-${type}`, `A ${type} question`, { type, options: TYPES[type].options, ...over });

  test("the types tried here are the types the model declares", () => {
    assert.deepEqual([...typeNames].sort(), declaredTypes().sort());
    assert.deepEqual([...model.QUESTION_TYPES].sort(), declaredTypes().sort());
    assert.deepEqual(declaredTypes().at(-1), "rank");
    for (const type of typeNames) {
      assert.ok(editorSets.QUESTION_TYPE_LABEL[type], `the editor has no name for a ${type} question`);
    }
  });

  test("an answer to a type passes that type's check, and no other type's answer does", () => {
    let refused = 0;
    for (const type of typeNames) {
      const asked = questionOf(type);
      for (const other of typeNames) {
        const problem = validate.answerProblem(asked, TYPES[other].answer, asked.options);
        if (type === other || ALSO_AN_ANSWER_TO[type].includes(other)) {
          assert.equal(problem, null, `a ${other} answer to a ${type} question: ${problem}`);
        } else {
          assert.equal(typeof problem, "string", `a ${other} answer passed as the answer to a ${type} question`);
          refused += 1;
        }
      }
    }
    assert.equal(refused, 24, "the table of types has stopped being read");
  });

  test("a save keeps an answer to its own type, and drops another type's", () => {
    world.db = makeDb(termDocs());
    const { form } = stored();
    for (const type of typeNames) {
      const set = normalise.normaliseQuestionSet(AGI, agiSet({ questions: [questionOf(type)] }));
      for (const other of typeNames) {
        const given = TYPES[other].answer;
        const content = { ...contentFor("nina", [AGI]), answers: { [AGI]: { [`a-${type}`]: given } } };
        const cleaned = draft.cleanContent(content, form, [set], content.aboutYou, "open").answers[AGI];
        if (type === other || ALSO_AN_ANSWER_TO[type].includes(other)) {
          // Several choices are kept in the question's own order, whatever order they came in.
          const expected = type === "multi" ? TYPES.multi.options.filter((option) => given.includes(option)) : given;
          assert.deepEqual(cleaned[`a-${type}`], expected, `a ${other} answer to a ${type} question was not kept`);
        } else {
          assert.equal(
            Object.hasOwn(cleaned, `a-${type}`),
            false,
            `a ${other} answer was kept as the answer to a ${type} question: ${JSON.stringify(cleaned[`a-${type}`])}`,
          );
        }
      }
    }
  });

  test("the form draws each type with a control of its own", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionsStep, {
        set: { id: AGI, role: "stream", scope: { type: "programme", programmeId: AGI }, label: "AGI Strategy", intro: "", questions: typeNames.map((type) => questionOf(type)) },
        answers: Object.fromEntries(typeNames.map((type) => [`a-${type}`, TYPES[type].answer])),
        optionsOf: (id) => TYPES[id.slice(2)].options,
        onAnswer: () => {},
        showProblems: false,
      }),
    );
    // One text box, one tall box, and the option controls of the four types that offer options.
    assert.equal((html.match(/<input [^>]*type="text"/g) ?? []).length, 1);
    assert.equal((html.match(/<textarea/g) ?? []).length, 1);
    const fieldsets = html.split("<fieldset").slice(1);
    assert.equal(fieldsets.length, 4);
    const [choice, multi, scale, ranking] = fieldsets;
    assert.match(choice, /A choice question/);
    assert.equal((choice.match(/type="radio"/g) ?? []).length, 2);
    assert.match(multi, /A multi question/);
    assert.equal((multi.match(/type="checkbox"/g) ?? []).length, 3);
    assert.ok(!multi.includes("<ol"), "several choices are drawn with an order");
    assert.match(scale, /A scale question/);
    assert.equal((scale.match(/type="radio"/g) ?? []).length, 3);
    assert.match(scale, /class="scale"/);
    // The ranking: its options to tick, and what is ticked as a list in the person's order.
    assert.match(ranking, /A rank question/);
    assert.equal((ranking.match(/type="checkbox"/g) ?? []).length, 3);
    assert.ok(!ranking.includes('type="radio"'), "a ranking is drawn as a scale");
    assert.match(ranking, /<ol aria-label="Your order for: A rank question"/);
    assert.deepEqual(
      [...ranking.matchAll(/aria-label="Move ([^"]+) up"/g)].map((match) => match[1]),
      ["Forecasting", "Evals"],
    );
  });

  test("each function that decides by type names every type, so the compiler refuses a new one", () => {
    // Each used to end in a branch that took whatever was left for a scale.
    for (const [file, name] of [
      ["src/lib/applications/validate.ts", "answerProblem"],
      ["src/lib/applications/applicant/draft.ts", "cleanAnswer"],
      ["src/features/applications/apply/QuestionsStep.tsx", "controlFor"],
    ]) {
      const code = stripSource(read(file), { keepStrings: true });
      const from = code.indexOf(`function ${name}(`);
      assert.ok(from !== -1, `${file} no longer declares ${name}`);
      const body = code.slice(from, code.indexOf("\n}\n", from));
      assert.match(body, /switch \(question\.type\) \{/, `${name} no longer decides by a switch on the type`);
      assert.ok(!/\bdefault:/.test(body), `${name} has a default branch, which answers for a type nobody named`);
      for (const type of declaredTypes()) {
        assert.ok(body.includes(`case "${type}":`), `${name} does not name the type "${type}"`);
      }
    }
    // What makes a missing case a compile error: a return type with no room for "nothing".
    assert.match(read("src/lib/applications/validate.ts"), /options: readonly string\[\],\n\): string \| null \{\n {2}if \(!isAnswered\(value\)\)/);
    assert.match(read("src/lib/applications/applicant/draft.ts"), /options: readonly string\[\],\n\): AnswerValue \| null \{/);
    assert.match(read("src/features/applications/apply/QuestionsStep.tsx"), /onAnswer: \(value: AnswerValue\) => void,\n\): ReactElement \{/);
  });
});

// ---------------------------------------------------------------------------
// 2. What a ranking is
// ---------------------------------------------------------------------------

describe("the answer is the options somebody placed, in their order", () => {
  test("as many as they like, and a required one needs a first choice", () => {
    const required = rank();
    const optional = rank({ required: false });
    assert.equal(validate.RANK_NEEDS_A_FIRST_CHOICE, "Pick at least a first choice.");
    for (const nothing of [undefined, []]) {
      assert.equal(validate.answerProblem(required, nothing, PROJECTS), "Pick at least a first choice.");
      assert.equal(validate.answerProblem(optional, nothing, PROJECTS), null);
    }
    assert.equal(validate.isAnswered([]), false);
    for (const placed of [["Governance"], ["Governance", "Evals"], [...PROJECTS].reverse(), PROJECTS]) {
      assert.equal(validate.answerProblem(required, placed, PROJECTS), null, placed.join(", "));
      assert.equal(validate.answerProblem(optional, placed, PROJECTS), null, placed.join(", "));
    }
  });

  test("each one of the question's options, and none of them twice", () => {
    const asked = rank();
    assert.equal(validate.answerProblem(asked, ["Governance", "Something else"], PROJECTS), "Pick from the options.");
    assert.equal(validate.answerProblem(asked, ["governance"], PROJECTS), "Pick from the options.");
    assert.equal(validate.answerProblem(asked, ["Governance", "Evals", "Governance"], PROJECTS), "Put each one in your order once.");
    assert.equal(validate.answerProblem(asked, ["Governance", "Governance"], PROJECTS), "Put each one in your order once.");
    for (const notAList of ["Governance", 1, "Governance, Evals"]) {
      assert.equal(validate.answerProblem(asked, notAList, PROJECTS), "Pick from the options.");
    }
    // A ranking takes its own options. Only "pick one" can take them from the programmes ranked.
    world.db = makeDb(termDocs());
    const { form } = stored();
    assert.deepEqual(validate.optionsFor(rank({ optionsFromRanking: true }), form, { rankedProgrammeIds: [AGI, TAIS] }), PROJECTS);
    assert.equal(normalise.normaliseQuestion(rank({ optionsFromRanking: true })).optionsFromRanking, false);
  });

  test("the reader keeps the order it was stored in, without a repeat", () => {
    const read_ = (order) => normalise.normaliseContent({ answers: { [AGI]: { order } } }).answers[AGI].order;
    assert.deepEqual(read_(["Governance", "Evals", "Forecasting"]), ["Governance", "Evals", "Forecasting"]);
    assert.deepEqual(read_(["Forecasting", "Evals", "Governance"]), ["Forecasting", "Evals", "Governance"]);
    assert.deepEqual(read_(["Governance", "Evals", "Governance", "", 4, "Evals"]), ["Governance", "Evals"]);
    // No more entries than a question can have options.
    const many = Array.from({ length: 30 }, (_, index) => `Option ${index}`);
    assert.equal(read_(many).length, model.APPLICATION_LIMITS.maxOptions);
    assert.deepEqual(read_(many), many.slice(0, model.APPLICATION_LIMITS.maxOptions));
  });

  test("a save keeps the person's order, where several choices keep the question's", () => {
    world.db = makeDb(termDocs());
    const { form, sets } = stored();
    const typed = ["Forecasting", "Evals", "Forecasting", "Not one of them", "Governance"];
    const content = answered("nina", typed, { areas: typed });
    const cleaned = draft.cleanContent(content, form, sets, content.aboutYou, "open").answers[AGI];
    assert.deepEqual(cleaned.order, ["Forecasting", "Evals", "Governance"], "a ranking was not kept in the person's order, each option once");
    assert.deepEqual(cleaned.areas, ["Evals", "Governance", "Forecasting"], "several choices are no longer kept in the question's order");
    // What is not a list is not a ranking.
    const text = draft.cleanContent(answered("nina", "Governance"), form, sets, content.aboutYou, "open").answers[AGI];
    assert.equal(Object.hasOwn(text, "order"), false);
  });

  test("it counts as answered once something is placed, and what is sent is what was placed", () => {
    world.db = makeDb(termDocs());
    const { form, sets } = stored();
    const set = sets.find((each) => each.id === AGI);
    // "2 of 4 answered" on the form's last step: the long answer and the ranking.
    assert.equal(validate.answeredCount(set, answered("nina", ["Evals"])), 2);
    assert.equal(validate.answeredCount(set, answered("nina", [])), 1);
    const sent = validate.contentForSend(form, sets, answered("nina", ["Forecasting", "Evals"]));
    assert.deepEqual(sent.answers[AGI], { event: "A new law came into force.", order: ["Forecasting", "Evals"] });
    // A ranking with nothing in it is no answer, so nothing of it is sent.
    assert.equal(Object.hasOwn(validate.contentForSend(form, sets, answered("nina", [])).answers[AGI], "order"), false);
  });

  test("the same options in another order are another answer", () => {
    const one = answered("nina", ["Governance", "Evals"]);
    const other = answered("nina", ["Evals", "Governance"]);
    assert.equal(shape.sameContent(one, structuredClone(one)), true);
    assert.equal(shape.sameContent(one, other), false, "the form would say nothing had changed");
    assert.equal(kept.sameContent(one, structuredClone(one)), true);
    assert.equal(kept.sameContent(one, other), false, "sending again would keep nothing of what it said before");
  });
});

// ---------------------------------------------------------------------------
// 3. Through the applicant's routes
// ---------------------------------------------------------------------------

describe("an applicant saves a ranking and sends it", () => {
  test("they are sent the question as what it is", async () => {
    openForm();
    const view = await call("nina", routes.application.GET, {});
    assert.equal(view.status, 200);
    const sent = view.body.sets.find((set) => set.id === AGI).questions.find((each) => each.id === "order");
    assert.deepEqual(sent, {
      id: "order",
      text: "Put the projects in the order you’d like them.",
      help: "",
      type: "rank",
      options: PROJECTS,
      optionsFromRanking: false,
      wordLimit: null,
      required: true,
    });
  });

  test("what is stored is the question's own options, each once, in the order given", async () => {
    openForm();
    const saved = await save("nina", answered("nina", ["Forecasting", "Evals", "Forecasting", "Not one of them", "Governance"]));
    assert.equal(saved.status, 200);
    assert.deepEqual(world.db.read(applicationPath("nina")).draft.answers[AGI].order, ["Forecasting", "Evals", "Governance"]);
    assert.deepEqual(saved.body.application.draft.answers[AGI].order, ["Forecasting", "Evals", "Governance"]);
    const sent = await sendIt("nina");
    assert.equal(sent.status, 200);
    const application = world.db.read(applicationPath("nina"));
    assert.deepEqual(application.sent.answers[AGI].order, ["Forecasting", "Evals", "Governance"]);
    assert.ok(Array.isArray(application.sent.answers[AGI].order));
    assert.ok(application.sent.answers[AGI].order.every((item) => typeof item === "string"));
  });

  test("a send waits for a first choice", async () => {
    openForm();
    for (const nothing of [[], ["Not one of them"], undefined]) {
      const content = answered("nina", nothing);
      if (nothing === undefined) delete content.answers[AGI].order;
      assert.equal((await save("nina", content)).status, 200);
      const held = await sendIt("nina");
      assert.equal(held.status, 400);
      assert.deepEqual(held.body.issues, [{ step: `set:${AGI}`, questionId: "order", message: "Pick at least a first choice." }]);
      assert.equal(world.db.read(applicationPath("nina")).sent, null);
    }
    assert.equal((await save("nina", answered("nina", ["Evals"]))).status, 200);
    assert.equal((await sendIt("nina")).status, 200);
    assert.deepEqual(world.db.read(applicationPath("nina")).sent.answers[AGI].order, ["Evals"]);
  });

  test("the send reads the stored draft again, so a document nobody saved through the form is held to the same rule", async () => {
    openForm();
    await save("nina", answered("nina", ["Evals", "Governance"]));
    // Written straight into the document: an option twice, and one the question never had.
    world.db.poke(applicationPath("nina"), {
      [`draft.answers.${AGI}.order`]: ["Governance", "Governance", "Made up", "Evals"],
    });
    assert.equal((await sendIt("nina")).status, 200);
    const application = world.db.read(applicationPath("nina"));
    assert.deepEqual(application.sent.answers[AGI].order, ["Governance", "Evals"]);
    assert.deepEqual(application.draft.answers[AGI].order, ["Governance", "Evals"]);
  });

  test("putting the same options in another order is a change she has not sent, and sending it keeps what it said", async () => {
    openForm();
    await save("nina", answered("nina", ["Governance", "Evals", "Forecasting"]));
    assert.equal((await sendIt("nina")).status, 200);
    const page = async () => (await statusLoad.loadStatus(world.db, ROUND, "nina", new Date())).view;
    assert.equal((await page()).unsentChanges, false);
    await save("nina", answered("nina", ["Evals", "Governance", "Forecasting"]));
    assert.equal((await page()).unsentChanges, true, "a ranking put in another order was not noticed");

    at(new Date(WHILE_OPEN.getTime() + 3_600_000));
    assert.equal((await sendIt("nina")).status, 200);
    const application = world.db.read(applicationPath("nina"));
    assert.deepEqual(application.sent.answers[AGI].order, ["Evals", "Governance", "Forecasting"]);
    assert.equal(application.sentHistory.length, 1);
    assert.deepEqual(application.sentHistory[0].content.answers[AGI].order, ["Governance", "Evals", "Forecasting"]);

    // Whoever reviews her is shown the order as it stands, and the one before it.
    at(WHILE_DECIDING);
    const review = await call("claudia", routes.review.GET, { uid: "nina" }, { query: `?programme=${AGI}` });
    assert.equal(review.status, 200);
    const answer = review.body.review.sections.find((section) => section.id === AGI).answers.find((each) => each.key === `${AGI}.order`);
    assert.deepEqual(
      { type: answer.type, answered: answer.answered, text: answer.text, items: answer.items, scale: answer.scale },
      { type: "rank", answered: true, text: null, items: ["Evals", "Governance", "Forecasting"], scale: null },
    );
    assert.deepEqual(answer.earlier.map((entry) => entry.items), [["Governance", "Evals", "Forecasting"]]);
    assert.equal(review.body.review.changes.count, 1);
    assert.deepEqual(review.body.review.changes.where, [AGI]);
  });

  test("the last step of the form says the order in words", () => {
    const set = normalise.normaliseQuestionSet(AGI, agiSet());
    const content = answered("nina", ["Forecasting", "Evals"], { areas: ["Evals", "Governance"], first: "Governance" });
    assert.equal(
      checkText.answersPreview(set, content, (id) => set.questions.find((each) => each.id === id).options),
      "A new law came into force. 1. Forecasting, 2. Evals. Evals, Governance. Governance.",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Never scored
// ---------------------------------------------------------------------------

/** A sent application whose AGI Strategy answers include a ranking. */
const sentBy = (uid, order) => {
  const content = answered(uid, order);
  return { ...applicationDoc(uid, [AGI]), draft: content, sent: content };
};

function reviewingTerm() {
  at(WHILE_DECIDING);
  world.db = makeDb(
    termDocs({
      round: { status: "deciding" },
      over: { [applicationPath("dev")]: sentBy("dev", ["Governance", "Evals"]) },
    }),
    { now: WHILE_DECIDING },
  );
  return world.db;
}

describe("a ranking is never scored", () => {
  test("the model says which types are not, and it is this one", () => {
    assert.deepEqual([...model.NEVER_SCORED_TYPES], ["rank"]);
  });

  test("the reader clears the flag, whatever is stored and wherever the question sits", () => {
    const stream = normalise.normaliseQuestionSet(AGI, agiSet());
    assert.deepEqual(
      stream.questions.map((each) => [each.id, each.type, each.scored]),
      [
        ["event", "long", true],
        ["order", "rank", false],
        ["areas", "multi", false],
        ["first", "choice", false],
      ],
    );
    assert.equal(normalise.normaliseQuestion(rank({ scored: true })).scored, false);
    assert.equal(normalise.normaliseQuestion(question("why", "Why?", { scored: true })).scored, true);
    // So nothing that reads a set offers a score for it.
    world.db = makeDb(termDocs());
    const { form, sets } = stored();
    assert.deepEqual(scoring.scoredKeysFor(form, sets, AGI), [`${AGI}.event`]);
    assert.deepEqual(scoring.scorableKeysFor(form, sets, AGI, answered("dev", ["Governance"])), [`${AGI}.event`]);
    assert.equal(editorSets.isScoredSet(normalise.normaliseQuestionSet(AGI, agiSet({ questions: [rank({ scored: true })] }))), false);
  });

  test("the editor's route ignores one sent, and stores the question unscored", async () => {
    openForm();
    const parsed = editorParse.parseSetChange({
      questions: [
        { id: "order", text: "Put them in order.", type: "rank", options: PROJECTS, scored: true, required: true },
        { id: "event", text: "Pick something.", type: "long", scored: true, required: true },
      ],
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value.questions.map((each) => [each.type, each.scored]), [["rank", false], ["long", true]]);

    const written = await call("zach", routes.set.PATCH, { setId: AGI }, {
      body: {
        questions: [
          { id: "order", text: "Put the projects in the order you’d like them.", help: "", type: "rank", options: PROJECTS, optionsFromRanking: false, wordLimit: null, required: true, scored: true },
          { id: "event", text: "Pick something that happened in AI this year.", help: "", type: "long", options: [], optionsFromRanking: false, wordLimit: null, required: true, scored: true },
        ],
      },
    });
    assert.equal(written.status, 200, "a ranking sent as scored was refused, where it is to be ignored");
    assert.deepEqual(world.db.read(setPath(AGI)).questions.map((each) => [each.id, each.scored]), [["order", false], ["event", true]]);
    assert.deepEqual(written.body.set.questions.map((each) => [each.id, each.scored]), [["order", false], ["event", true]]);
    // In a set that cannot be scored at all, a scored ranking is ignored too, and a scored anything else is still refused.
    const general = await call("zach", routes.set.PATCH, { setId: "fellowships" }, {
      body: { questions: [{ id: null, text: "Put them in order.", type: "rank", options: PROJECTS, scored: true, required: false }] },
    });
    assert.equal(general.status, 200);
    assert.equal(world.db.read(setPath("fellowships")).questions[0].scored, false);
    const refused = await call("zach", routes.set.PATCH, { setId: "fellowships" }, {
      body: { questions: [{ id: null, text: "Why?", type: "long", scored: true, required: false }] },
    });
    assert.equal(refused.status, 400);
  });

  test("the editor does not send one, and its Scored switch passes a ranking by", () => {
    assert.equal(questionModel.canBeScored("rank"), false);
    for (const type of model.QUESTION_TYPES.filter((each) => each !== "rank")) assert.equal(questionModel.canBeScored(type), true, type);
    const local = { key: "k", id: "order", text: "Put them in order.", help: "", type: "rank", options: PROJECTS, optionsFromRanking: false, wordLimit: null, required: true, scored: true };
    assert.equal(questionModel.toPatch(local).scored, false);
    assert.equal(questionModel.toPatch({ ...local, type: "long", options: [] }).scored, true);

    const editor = stripSource(read("src/features/applications/editor/FormEditor.tsx"), { keepStrings: true });
    // The switch is read off the questions that can be scored, and nothing else.
    assert.match(
      editor,
      /const scorable = set\.questions\.filter\(\(question\) => canBeScored\(question\.type\)\);\s*return scorable\.length > 0\s*\? scorable\.some\(\(question\) => question\.scored\)\s*: \(own\(scoredWhenEmpty, set\.id\) \?\? true\);/,
    );
    // A question whose type changes takes its set's switch.
    assert.match(editor, /const carried = patch\.type === undefined \? patch : \{ \.\.\.patch, scored: scoredFor\(set\) \};/);
    const card = stripSource(read("src/features/applications/editor/QuestionCard.tsx"), { keepStrings: true });
    assert.match(card, /\{props\.inScoredSet && !canBeScored\(question\.type\) \? <Chip>Not scored<\/Chip> : null\}/);
    assert.match(card, /A ranking isn’t\s+scored\./);
    assert.match(editor, /inScoredSet=\{scored\}/);
  });

  test("no reviewer is offered a score for one, and a score sent anyway is refused", async () => {
    reviewingTerm();
    for (const who of ["zach", "claudia", "lloyd"]) {
      const review = await call(who, routes.review.GET, { uid: "dev" }, { query: `?programme=${AGI}` });
      assert.equal(review.status, 200, who);
      assert.deepEqual(review.body.review.review.scorableKeys, [`${AGI}.event`], who);
      const answers = review.body.review.sections.find((section) => section.id === AGI).answers;
      assert.deepEqual(
        answers.map((answer) => [answer.key, answer.type, answer.scorable]),
        [
          [`${AGI}.event`, "long", true],
          [`${AGI}.order`, "rank", false],
          [`${AGI}.areas`, "multi", false],
          [`${AGI}.first`, "choice", false],
        ],
        who,
      );
    }
    const scored = await call("lloyd", routes.saveReview.PUT, { uid: "dev" }, { body: { programmeId: AGI, scores: { [`${AGI}.order`]: 5 } } });
    assert.equal(scored.status, 400);
    assert.equal(scored.body.error, "You can only score the answers of a programme you review.");
    assert.equal(world.db.read(`admissionReviews/${ROUND}__dev__lloyd`), undefined);
    // A comment on it is taken, as on any answer.
    const commented = await call("lloyd", routes.saveReview.PUT, { uid: "dev" }, {
      body: { programmeId: AGI, comments: [{ op: "add", key: `${AGI}.order`, text: "Wants governance first." }] },
    });
    assert.equal(commented.status, 200);
  });
});

// ---------------------------------------------------------------------------
// 5. The editor, and readiness
// ---------------------------------------------------------------------------

describe("an author writes a ranking with two to ten options", () => {
  const input = (options, over = {}) => ({ questions: [{ id: null, text: "Put them in order.", type: "rank", options, required: true, ...over }] });

  test("the editor's reader holds its options to two to ten, each once", () => {
    const max = model.APPLICATION_LIMITS.maxOptions;
    assert.equal(max, 10);
    assert.deepEqual(editorParse.parseSetChange(input([])), { ok: false, error: "Question 1 needs at least 2 options." });
    assert.deepEqual(editorParse.parseSetChange(input(["Only one"])), { ok: false, error: "Question 1 needs at least 2 options." });
    assert.equal(editorParse.parseSetChange(input(["One", "Two"])).ok, true);
    assert.equal(editorParse.parseSetChange(input(Array.from({ length: max }, (_, index) => `Option ${index}`))).ok, true);
    assert.deepEqual(
      editorParse.parseSetChange(input(Array.from({ length: max + 1 }, (_, index) => `Option ${index}`))),
      { ok: false, error: `Question 1 takes at most ${max} options.` },
    );
    assert.deepEqual(editorParse.parseSetChange(input(["One", "Two", "One"])), { ok: false, error: "Question 1 lists “One” twice." });
    assert.deepEqual(editorParse.parseSetChange({ questions: [{ id: null, text: "Put them in order.", type: "rank", required: true }] }), {
      ok: false,
      error: "Question 1 needs its options.",
    });
    // What only other types carry is left off it.
    const read_ = editorParse.parseSetChange(input(["One", "Two"], { optionsFromRanking: true, wordLimit: 50 })).value.questions[0];
    assert.deepEqual(
      { options: read_.options, optionsFromRanking: read_.optionsFromRanking, wordLimit: read_.wordLimit },
      { options: ["One", "Two"], optionsFromRanking: false, wordLimit: null },
    );
  });

  test("the route stores it, and refuses one that is not ready", async () => {
    openForm();
    const written = await call("zach", routes.set.PATCH, { setId: AGI }, { body: input(PROJECTS) });
    assert.equal(written.status, 200);
    const [storedQuestion] = world.db.read(setPath(AGI)).questions;
    assert.deepEqual(
      { type: storedQuestion.type, options: storedQuestion.options, required: storedQuestion.required, scored: storedQuestion.scored },
      { type: "rank", options: PROJECTS, required: true, scored: false },
    );
    const before = JSON.stringify(world.db.read(setPath(AGI)));
    const refused = await call("zach", routes.set.PATCH, { setId: AGI }, { body: input(["Only one"]) });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, "Question 1 needs at least 2 options.");
    assert.equal(JSON.stringify(world.db.read(setPath(AGI))), before);
  });

  test("the editor holds it back in the browser with the same words, and names and counts it", () => {
    const local = (options) => ({ key: "k", id: null, text: "Put them in order.", help: "", type: "rank", options, optionsFromRanking: false, wordLimit: null, required: true, scored: false });
    assert.equal(questionModel.takesOptions("rank"), true);
    assert.equal(questionModel.takesWordLimit("rank"), false);
    assert.equal(questionModel.firstProblem([local(["Only one", ""])]), "Question 1 needs at least 2 options.");
    assert.equal(questionModel.firstProblem([local(["One", "Two"])]), null);
    assert.equal(questionModel.firstProblem([local(["One", " One "])]), "Question 1 lists “One” twice.");
    assert.deepEqual(questionModel.toPatch(local([" One ", "", "Two"])).options, ["One", "Two"]);
    assert.equal(editorSets.QUESTION_TYPE_LABEL.rank, "Ranking");
    assert.deepEqual(editorSets.questionChips(rank()), ["Ranking", "5 to put in order"]);
    const card = stripSource(read("src/features/applications/editor/QuestionCard.tsx"), { keepStrings: true });
    assert.match(card, /\? "Options to put in order"/);
    assert.match(card, /People tick the ones they’d like and put them in order, and can leave some out\./);
  });

  test("a form does not open while a ranking has fewer than two options", () => {
    // Stored by hand: the editor's own route would have refused it.
    world.db = makeDb(termDocs({ over: { [setPath(AGI)]: agiSet({ questions: [rank({ options: ["Only one"] })] }) } }));
    const { form, sets } = stored();
    const result = readiness.formReadiness(
      {
        opensAt: new Date("2026-10-06T09:00:00+01:00"),
        closesAt: new Date("2026-10-18T23:59:00+01:00"),
        decisionsByDate: "2026-10-23",
        form,
        sets,
        leadsInStanding: new Set(["claudia", "tess"]),
      },
      new Date("2026-10-05T09:00:00+01:00"),
    );
    const check = result.checks.find((each) => each.id === "questions");
    assert.equal(check.ok, false);
    assert.equal(check.hint, "Question 1 in “AGI Strategy” has fewer than 2 options to put in order. Finish it or delete it.");
  });
});

// ---------------------------------------------------------------------------
// 6. When an author changes the options after answers exist
// ---------------------------------------------------------------------------

describe("when the options change, a ranking does what pick one and several choices do", () => {
  const fewer = PROJECTS.filter((project) => project !== "Governance");
  const withOptions = (options) => ({
    questions: agiSet().questions.map((each) => ({ ...each, options: each.options.length > 0 ? options : [] })),
  });

  test("once anybody has sent, nothing about a question can change", async () => {
    at(WHILE_OPEN);
    world.db = makeDb(termDocs(), { now: WHILE_OPEN });
    const before = JSON.stringify(world.db.read(setPath(AGI)));
    const refused = await call("zach", routes.set.PATCH, { setId: AGI }, { body: withOptions(fewer) });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, lock.lockedSentence(3));
    assert.equal(JSON.stringify(world.db.read(setPath(AGI))), before);
  });

  test("before that, a draft keeps what is still an option from its owner's next save", async () => {
    openForm();
    const typed = answered("nina", ["Governance", "Forecasting", "Evals"], { areas: ["Evals", "Governance"], first: "Governance" });
    assert.equal((await save("nina", typed)).status, 200);

    // The author takes "Governance" off all three questions. Nobody has sent, so it is allowed.
    assert.equal((await call("zach", routes.set.PATCH, { setId: AGI }, { body: withOptions(fewer) })).status, 200);
    // Nothing writes to her draft: it says what it said.
    assert.deepEqual(world.db.read(applicationPath("nina")).draft.answers[AGI], typed.answers[AGI]);
    // In the form, each of the three is asked for again in its own words once she presses Send.
    const { sets } = stored();
    const asked = Object.fromEntries(sets.find((set) => set.id === AGI).questions.map((each) => [each.id, each]));
    assert.equal(validate.answerProblem(asked.first, "Governance", fewer), "Pick one of the options.");
    assert.equal(validate.answerProblem(asked.areas, ["Evals", "Governance"], fewer), "Pick from the options.");
    assert.equal(validate.answerProblem(asked.order, ["Governance", "Forecasting", "Evals"], fewer), "Pick from the options.");
    // And what the form shows her of the ranking is what is still an option, in her order.
    assert.deepEqual(rankQuestion.placedOf(["Governance", "Forecasting", "Evals"], fewer), ["Forecasting", "Evals"]);

    // Her next save, of the very same answers, keeps only what is still an option.
    assert.equal((await save("nina", typed)).status, 200);
    assert.deepEqual(world.db.read(applicationPath("nina")).draft.answers[AGI], {
      event: "A new law came into force.",
      // The ranking closes up in her order: her second choice is now her first.
      order: ["Forecasting", "Evals"],
      // Several choices keep the ticks that are left.
      areas: ["Evals"],
      // Pick one has nothing left, so it reads as not answered.
    });
    assert.equal((await sendIt("nina")).status, 200);
    assert.deepEqual(world.db.read(applicationPath("nina")).sent.answers[AGI].order, ["Forecasting", "Evals"]);
  });

  test("a required ranking with nothing left stops the send, as an unanswered one does", async () => {
    openForm();
    await save("nina", answered("nina", ["Governance"]));
    assert.equal((await call("zach", routes.set.PATCH, { setId: AGI }, { body: withOptions(fewer) })).status, 200);
    const held = await sendIt("nina");
    assert.equal(held.status, 400);
    assert.deepEqual(held.body.issues, [{ step: `set:${AGI}`, questionId: "order", message: "Pick at least a first choice." }]);
  });
});

// ---------------------------------------------------------------------------
// 7. One ranking control, which needs no drag
// ---------------------------------------------------------------------------

describe("the form has one ranking control, and it works without a drag", () => {
  const drawQuestion = (value, over = {}) =>
    renderToStaticMarkup(
      createElement(RankQuestion, {
        legend: "Put the projects in the order you’d like them.",
        options: PROJECTS,
        value,
        onChange: () => {},
        ...over,
      }),
    );
  /** The rows of a drawn list: their numbers, and what their buttons say. */
  const rowsIn = (html) =>
    html
      .split("<li")
      .slice(1)
      .map((row) => ({
        number: />(\d+)<\/span>/.exec(row)?.[1],
        handle: /<button[^>]*aria-label="(Drag to reorder [^"]+)"/.exec(row)?.[1],
        up: /<button[^>]*aria-label="(Move [^"]+ up)"/.exec(row)?.[1],
        down: /<button[^>]*aria-label="(Move [^"]+ down)"/.exec(row)?.[1],
        upOff: /<button[^>]*disabled=""[^>]*aria-label="Move [^"]+ up"|<button[^>]*aria-label="Move [^"]+ up"[^>]*disabled=""/.test(row),
        downOff: /<button[^>]*disabled=""[^>]*aria-label="Move [^"]+ down"|<button[^>]*aria-label="Move [^"]+ down"[^>]*disabled=""/.test(row),
      }));

  test("nothing placed: the options to tick, what to do, and no list", () => {
    const html = drawQuestion([]);
    assert.ok(html.includes(rankQuestion.RANK_INSTRUCTION.replace(/’/g, "’")));
    assert.equal(rankQuestion.RANK_INSTRUCTION, "Tick the ones you’d like, then put them in order. You can leave some out.");
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, PROJECTS.length);
    assert.equal((html.match(/checked=""/g) ?? []).length, 0);
    assert.ok(!html.includes("<ol"), "an order is drawn before anything is in it");
    assert.ok(!html.includes("Your order"));
  });

  test("what is ticked is a list in the person's order, each row with its own way up and down", () => {
    const html = drawQuestion(["Governance", "Evals", "Forecasting"]);
    assert.equal((html.match(/checked=""/g) ?? []).length, 3);
    assert.match(html, /<ol aria-label="Your order for: Put the projects in the order you’d like them\."/);
    assert.deepEqual(rowsIn(html), [
      { number: "1", handle: "Drag to reorder Governance", up: "Move Governance up", down: "Move Governance down", upOff: true, downOff: false },
      { number: "2", handle: "Drag to reorder Evals", up: "Move Evals up", down: "Move Evals down", upOff: false, downOff: false },
      { number: "3", handle: "Drag to reorder Forecasting", up: "Move Forecasting up", down: "Move Forecasting down", upOff: false, downOff: true },
    ]);
    // Every one of those is a button, so a keyboard and a switch reach it.
    assert.equal((html.match(/<button type="button"/g) ?? []).length, 9);
    // And what the list says happened is said to a screen reader.
    assert.match(html, /<div role="status" aria-live="polite" class="visually-hidden">/);
  });

  test("ticking adds to the end of the order, unticking takes out, and what cannot be an answer is not shown", () => {
    assert.deepEqual(rankQuestion.placedOf(["Governance", "Evals"], PROJECTS), ["Governance", "Evals"]);
    assert.deepEqual(rankQuestion.placedOf(["Governance", "Made up", "Governance", 3, "Evals"], PROJECTS), ["Governance", "Evals"]);
    assert.deepEqual(rankQuestion.placedOf("Governance", PROJECTS), []);
    assert.deepEqual(rankQuestion.placedOf(undefined, PROJECTS), []);
    const source = stripSource(read("src/features/applications/apply/RankQuestion.tsx"), { keepStrings: true });
    assert.match(
      source,
      /onChange\(placed\.includes\(option\) \? placed\.filter\(\(each\) => each !== option\) : \[\.\.\.placed, option\]\);/,
    );
    // The tick boxes are the ones "several choices" uses, and the list is the Rank step's.
    assert.match(source, /<Chips options=\{options\} isOn=\{\(option\) => placed\.includes\(option\)\} onToggle=\{toggle\} \/>/);
    assert.match(source, /<RankList\b/);
  });

  test("the Rank step draws its programmes through the same list", () => {
    const programmes = [
      { id: TAIS, kind: "fellowship", name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", pitch: "", facts: "8 WEEKS · ~5 HRS A WEEK", starts: "", closed: false },
      { id: AGI, kind: "fellowship", name: "AGI Strategy Fellowship", shortName: "AGI Strategy", pitch: "", facts: "6 WEEKS", starts: "", closed: false },
    ];
    const html = renderToStaticMarkup(createElement(RankStep, { programmes, onReorder: () => {} }));
    assert.match(html, /<ol aria-label="Your order"/);
    assert.deepEqual(rowsIn(html), [
      { number: "1", handle: "Drag to reorder Technical AI Safety", up: "Move Technical AI Safety up", down: "Move Technical AI Safety down", upOff: true, downOff: false },
      { number: "2", handle: "Drag to reorder AGI Strategy", up: "Move AGI Strategy up", down: "Move AGI Strategy down", upOff: false, downOff: true },
    ]);
    // The first fact of each programme, under its name.
    assert.match(html, />8 WEEKS</);
    assert.match(html, />6 WEEKS</);
    // One file builds the list. Both callers hand it rows and are handed back an order.
    const list = stripSource(read("src/features/applications/apply/RankList.tsx"), { keepStrings: true });
    assert.match(list, /useSensor\(KeyboardSensor, \{ coordinateGetter: sortableKeyboardCoordinates \}\)/);
    assert.match(list, /onReorder\(arrayMove\(ids, from, to\)\);/);
    for (const file of ["RankStep.tsx", "RankQuestion.tsx"]) {
      const code = stripSource(read(`src/features/applications/apply/${file}`), { keepStrings: true });
      assert.ok(!/@dnd-kit|useSortable|DndContext/.test(code), `${file} builds a list of its own`);
    }
  });

  test("on a phone a row that holds a sentence puts its buttons under its name, and every control keeps its 44px", () => {
    const css = read("src/features/applications/apply/rank.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const phone = /@media \(max-width: 36rem\) \{([\s\S]*?)\n\}\n/.exec(css);
    assert.ok(phone, "the stylesheet has no block for a narrow phone");
    assert.match(phone[1], /\.row\[data-roomy="true"\] \{\s*flex-wrap: wrap;/);
    assert.match(phone[1], /\.row\[data-roomy="true"\] \.moves \{\s*flex: 1 0 100%;\s*justify-content: flex-end;/);
    for (const name of ["handle", "move"]) {
      assert.match(css, new RegExp(`\\.${name} \\{[^}]*min-height: 2\\.75rem`), `.${name} lost its 44px floor`);
    }
    // The ranking question asks for the room; the Rank step's short names do not need it.
    assert.match(read("src/features/applications/apply/RankQuestion.tsx"), /dndId=\{`rank-\$\{id\}`\}\s*roomy\s/);
    assert.ok(!/\broomy\b/.test(stripSource(read("src/features/applications/apply/RankStep.tsx"), { keepStrings: true })));
    assert.match(drawQuestion(["Governance"]), /data-roomy="true"/);
  });
});

// ---------------------------------------------------------------------------
// 8. The review screen
// ---------------------------------------------------------------------------

describe("the review screen draws a ranking as a numbered list", () => {
  const actions = {
    ready: true,
    scores: {},
    activeKey: null,
    comments: [],
    fresh: new Set(),
    onScore: () => {},
    onFocusAnswer: () => {},
    onAddComment: async () => true,
    onRemoveComment: () => {},
  };
  const answer = (key, type, items, earlier = []) => ({
    key,
    question: `A ${type} question`,
    optional: false,
    type,
    answered: true,
    text: null,
    items,
    scale: null,
    scorable: false,
    earlier,
    changedSinceScored: null,
  });
  const draw = (answers) =>
    renderToStaticMarkup(
      createElement(SectionCard, {
        section: { id: AGI, title: "AGI Strategy questions", tab: "AGI Strategy", role: "stream", mode: "focus", chips: [], note: null, answers },
        shown: true,
        actions,
      }),
    );

  test("in the person's order, where several choices are chips", () => {
    const html = draw([
      answer("a.order", "rank", ["Governance", "Evals", "Forecasting"]),
      answer("a.areas", "multi", ["Evals", "Governance"]),
    ]);
    assert.match(html, /<ol class="ranked"><li>Governance<\/li><li>Evals<\/li><li>Forecasting<\/li><\/ol>/);
    assert.match(html, /<ul class="picked">/);
    assert.equal((html.match(/<ol class="ranked">/g) ?? []).length, 1, "several choices were numbered as well");
    // Numbered by the list itself, so a screen reader hears the order.
    const css = read("src/features/applications/review/ReviewScreen.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /\.ranked \{([^}]*)\}/.exec(css);
    assert.ok(rule, "the review screen has no style for a ranking");
    assert.ok(!/list-style:\s*none/.test(rule[1]), "the list's own numbers were switched off");
    assert.match(rule[1], /overflow-wrap: anywhere;/);
  });

  test("what it said before is numbered too", () => {
    const html = draw([
      answer("a.order", "rank", ["Evals", "Governance"], [
        { sentOn: "Sat 10 Oct", answered: true, text: null, items: ["Governance", "Evals"], scale: null },
      ]),
    ]);
    assert.deepEqual(
      [...html.matchAll(/<ol class="ranked">(.*?)<\/ol>/g)].map((match) => match[1]),
      ["<li>Evals</li><li>Governance</li>", "<li>Governance</li><li>Evals</li>"],
    );
  });

  test("a ranking left blank reads as no answer", () => {
    const blank = { ...answer("a.order", "rank", null), answered: false };
    const html = draw([blank]);
    assert.match(html, /No answer\./);
    assert.ok(!html.includes('class="ranked"'));
  });
});

// ---------------------------------------------------------------------------
// 9. The rules
// ---------------------------------------------------------------------------

describe("the stored shape needs no rule of its own", () => {
  test("applications and question sets are closed to every browser, and nothing there reads an answer", () => {
    const rules = read("firestore.rules");
    const literal = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    for (const path of ["/admissionApplications/{applicationId}", "/admissionRounds/{roundId}/questionSets/{setId}"]) {
      assert.ok(rules.includes(`match ${path} {`), `the rules no longer name ${path}`);
      assert.match(
        rules,
        new RegExp(`match ${literal(path)} \\{\\s*allow read, write: if false;\\s*\\}`),
        `${path} is no longer closed outright`,
      );
    }
    // So an answer's shape is decided by the routes alone, and a ranking is a
    // shape they already wrote: a list of option texts, as several choices are.
    const reader = stripSource(read("src/lib/applications/normalise.ts"), { keepStrings: true });
    assert.match(reader, /if \(Array\.isArray\(v\)\) \{\s*const out: string\[\] = \[\];/);
  });
});
