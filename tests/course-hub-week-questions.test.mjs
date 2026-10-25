/**
 * A week's "Questions to think about" (C29, board wk-week-phone): what a week
 * keeps, how the run's week editor and a group's own copy write them, how
 * every copy of a week carries them, and how the week's page draws them.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   sanitizeWeekQuestions, normalizeCourseWeek       what a week keeps
 *   saveWeek, ensureWeekDoc (client-direct)          the run's week editor (WeekEditor)
 *   POST .../groups/[groupId]/weeks/[weekId]/fork    a group's own copy, carried from the run's week
 *   PATCH .../groups/[groupId]/weeks/[weekId]        the group's copy, edited (GroupWeekEditor)
 *   templateWeekFields, clone-weeks                  a template both ways, a run copied from another
 *   WeekView                                         the week's page
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/memberPagesWorld.mjs`),
 * on Tue 17 Nov 2026 at noon: Group B is Chloe, Farah and Kofi, with Rahul
 * and Sofia; Tom facilitates Group C; Claudia leads the programme; Zach is an
 * admin. The run's week editor writes through the browser SDK, which is
 * recorded here, never sent; the rules that check those writes are the
 * rules owner's (`firestore.rules`, the run's weeks block).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, textOf } from "./lib/memberPagesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makeMemberPagesWorld("__weekQuestions");
const { world, call, courseRoute, loadTs } = w;
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const { templateWeekFields } = await loadTs(join("lib", "firestore", "courseTemplates.ts"));
const forkRoute = await courseRoute("groups", "[groupId]", "weeks", "[weekId]", "fork");
const groupWeekRoute = await courseRoute("groups", "[groupId]", "weeks", "[weekId]");
const cloneRoute = await courseRoute("runs", "[runId]", "clone-weeks");
const editor = await loadTs(join("features", "courses", "WeekQuestionsEditor.tsx"));

/**
 * The run's week editor's writes go through the browser SDK: recorded here,
 * in the order they are made, with the document they address.
 */
const CLIENT_KEY = "__weekQuestionsClient";
const client = { writes: [], docs: {} };
globalThis[`${CLIENT_KEY}Ui`] = client;
const recorder = `globalThis[${JSON.stringify(`${CLIENT_KEY}Ui`)}]`;
const browser = makeWorld(CLIENT_KEY, [
  [
    "firebase/firestore",
    "export function doc(db, ...segments) { return { path: segments.join('/') }; }\n" +
      "export function collection(db, ...segments) { return { path: segments.join('/') }; }\n" +
      `export async function getDoc(ref) { const data = ${recorder}.docs[ref.path]; return { exists: () => data !== undefined, data: () => data, id: ref.path.split('/').pop() }; }\n` +
      `export async function setDoc(ref, data) { ${recorder}.writes.push({ op: 'set', path: ref.path, data }); }\n` +
      `export async function updateDoc(ref, data) { ${recorder}.writes.push({ op: 'update', path: ref.path, data }); }\n` +
      "export function serverTimestamp() { return 'serverTimestamp()'; }\n" +
      "export function deleteField() { return 'deleteField()'; }",
  ],
  [
    "@/lib/firebase/client",
    "export function getClientDb() { return { browser: true }; }\nexport function getClientAuth() { return { currentUser: { uid: 'claudia' } }; }",
  ],
]);
const mutations = await browser.loadTs(join("features", "courses", "courseMutations.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

const QUESTIONS = [
  "Which claim did you disagree with, and why?",
  "What would change your mind?",
  "What’s one thing you’d want to understand better?",
];
const weekPath = (n) => `courseRuns/${RUN.agi}/weeks/w0${n}`;
const forkPath = (n, groupId = B) => `courseGroups/${groupId}/weeks/w0${n}`;
const said = (answer) => [answer.status, answer.body?.error ?? null];
const patch = (who, body, n = 3, groupId = B) =>
  call(who, groupWeekRoute.PATCH, { groupId, weekId: `w0${n}` }, { body, course: true });
const fork = (who, n = 3, groupId = B) => call(who, forkRoute.POST, { groupId, weekId: `w0${n}` }, { course: true });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  client.writes = [];
  client.docs = {};
});

// ---------------------------------------------------------------------------
// 1. What a week keeps
// ---------------------------------------------------------------------------

describe("1. what a week keeps", () => {
  test("at most five questions, each one line of at most 160 characters", () => {
    assert.equal(courses.COURSE_FIELD_LIMITS.maxWeekQuestions, 5);
    assert.equal(courses.COURSE_FIELD_LIMITS.weekQuestion, 160);
  });

  test("each question is one line, trimmed; blanks and anything that is not text are dropped", () => {
    assert.deepEqual(
      courses.sanitizeWeekQuestions(["  Which claim did you\n disagree with,\tand why?  ", "", "   ", 7, null, { q: 1 }, "What would change your mind?"]),
      ["Which claim did you disagree with, and why?", "What would change your mind?"],
    );
    assert.deepEqual(courses.sanitizeWeekQuestions("Not a list."), []);
    assert.deepEqual(courses.sanitizeWeekQuestions(undefined), []);
  });

  test("a stored row over the limits is read inside them", () => {
    const many = Array.from({ length: 7 }, (_, i) => `Question ${i + 1}?`);
    assert.deepEqual(courses.sanitizeWeekQuestions(many), many.slice(0, 5));
    assert.equal(courses.sanitizeWeekQuestions(["x".repeat(200)])[0].length, 160);
  });

  test("a week's questions are read with it, and a week written before them has none", () => {
    assert.deepEqual(courses.normalizeCourseWeek("w03", { weekNumber: 3, questions: QUESTIONS }).questions, QUESTIONS);
    assert.deepEqual(courses.normalizeCourseWeek("w03", { weekNumber: 3 }).questions, []);
  });
});

// ---------------------------------------------------------------------------
// 2. The run's week editor
// ---------------------------------------------------------------------------

describe("2. the run's week editor writes them, client-direct", () => {
  test("a new week starts with none, present and empty, as every other part of it", async () => {
    await mutations.ensureWeekDoc(RUN.agi, "w03", 3);
    assert.equal(client.writes.length, 1);
    assert.deepEqual([client.writes[0].op, client.writes[0].path, client.writes[0].data.questions], ["set", weekPath(3), []]);
  });

  test("saving writes the list as the week keeps it, and only the questions", async () => {
    await mutations.saveWeek(RUN.agi, "w03", { questions: ["  Which claim did you disagree with, and why?\n", "", "What would change your mind?"] });
    assert.equal(client.writes.length, 1);
    const [write] = client.writes;
    assert.equal(write.op, "update");
    assert.equal(write.path, weekPath(3));
    assert.deepEqual(Object.keys(write.data).sort(), ["questions", "updatedAt", "updatedByUid"]);
    assert.deepEqual(write.data.questions, ["Which claim did you disagree with, and why?", "What would change your mind?"]);
  });

  test("an empty list clears them; six are written as five", async () => {
    await mutations.saveWeek(RUN.agi, "w03", { questions: [] });
    await mutations.saveWeek(RUN.agi, "w03", { questions: Array.from({ length: 6 }, (_, i) => `Q${i + 1}?`) });
    assert.deepEqual(client.writes.map((write) => write.data.questions), [[], ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"]]);
  });

  test("the editor's section: board pr-weeks's words, a labelled line each, and the count", () => {
    const html = renderToStaticMarkup(createElement(editor.default, { questions: QUESTIONS.slice(0, 2), onSave: async () => true }));
    const text = textOf(html);
    assert.ok(
      text.startsWith(
        "Questions for groups Up to 5 questions for each group to think about before the session, one line each. " +
          "The week’s page numbers them in this order. Question 1",
      ),
      text,
    );
    assert.match(text, /Question 2 .*Add a question 2\/5 questions Save questions$/);
    assert.match(html, /<ol[^>]*aria-label="Questions for groups"/);
    for (const [n, question] of [[1, QUESTIONS[0]], [2, QUESTIONS[1]]]) {
      assert.match(html, new RegExp(`aria-label="Remove question ${n}"`));
      assert.ok(html.includes(`value="${question}"`), question);
    }
    assert.equal((html.match(/maxLength="160"/g) ?? []).length, 2);
    // Nothing has changed yet, so Save is off.
    assert.match(html, /<button[^>]*disabled=""[^>]*><span>Save questions<\/span><\/button>/);
  });

  test("a group's copy says so, and a week with none says that", () => {
    const group = textOf(renderToStaticMarkup(createElement(editor.default, { questions: [], onSave: async () => true, forGroup: true })));
    assert.ok(group.startsWith("Questions for your group Up to 5 questions for your group to think about before the session"), group);
    assert.match(group, /No questions yet\. A week without any shows none\. Add a question 0\/5 questions Save questions/);
  });

  test("a full week offers no more", () => {
    const five = Array.from({ length: 5 }, (_, i) => `Q${i + 1}?`);
    const html = renderToStaticMarkup(createElement(editor.default, { questions: five, onSave: async () => true }));
    assert.match(html, /<button[^>]*disabled=""[^>]*><span>Add a question<\/span><\/button>/);
  });

  test("both editors draw the section and save through their own door", () => {
    const run = readFileSync(join(SRC, "features", "courses", "WeekEditor.tsx"), "utf8");
    assert.match(run, /<WeekQuestionsEditor questions=\{saved\.questions\} onSave=\{saveQuestions\} \/>/);
    assert.match(run, /await saveWeek\(runId, weekId, \{ questions \}\);/);
    const group = readFileSync(join(SRC, "features", "courses", "GroupWeekEditor.tsx"), "utf8");
    assert.match(group, /questions=\{week\.questions\}\s*onSave=\{\(questions\) => save\("questions", \{ questions \}\)\}\s*forGroup/);
  });
});

// ---------------------------------------------------------------------------
// 3. A group's own copy of a week
// ---------------------------------------------------------------------------

describe("3. a group's own copy of a week", () => {
  beforeEach(() => {
    world.db.poke(weekPath(3), { questions: QUESTIONS });
  });

  test("the copy carries the run's questions", async () => {
    assert.equal((await fork("rahul")).status, 200);
    assert.deepEqual(world.db.read(forkPath(3)).questions, QUESTIONS);
  });

  test("the group's facilitators write their own; the run's week keeps its", async () => {
    await fork("rahul");
    const ours = ["What surprised you most this week?", "Which reading would you drop?"];
    const answer = await patch("sofia", { questions: ["  What surprised you most\nthis week?  ", "Which reading would you drop?"] });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.updated, ["questions"]);
    assert.deepEqual(world.db.read(forkPath(3)).questions, ours);
    assert.deepEqual(world.db.read(weekPath(3)).questions, QUESTIONS);
  });

  test("the programme's lead and an admin edit a group's copy too; nobody else does", async () => {
    await fork("rahul");
    const answers = {};
    for (const who of ["claudia", "zach", "chloe", "tom", "lloyd", "nobody", null]) {
      answers[who ?? "signed out"] = (await patch(who, { questions: [`From ${who}?`] })).status;
    }
    assert.deepEqual(answers, { claudia: 200, zach: 200, chloe: 403, tom: 403, lloyd: 403, nobody: 403, "signed out": 401 });
    assert.deepEqual(world.db.read(forkPath(3)).questions, ["From zach?"]);
  });

  test("refused whole, in a sentence a person can act on", async () => {
    await fork("rahul");
    const cases = [
      [{ questions: "Why?" }, "questions must be a list."],
      [{ questions: Array.from({ length: 6 }, (_, i) => `Q${i + 1}?`) }, "A week holds at most 5 questions."],
      [{ questions: ["Fine?", 7] }, "Each question must be text."],
      [{ questions: ["Fine?", "   "] }, "Question 2 is empty. Write it, or remove it."],
      [{ questions: ["x".repeat(161)] }, "Questions must be 160 characters or fewer."],
    ];
    for (const [body, error] of cases) assert.deepEqual(said(await patch("rahul", body)), [400, error], JSON.stringify(body).slice(0, 60));
    assert.deepEqual(world.db.read(forkPath(3)).questions, QUESTIONS);
    // At the limits: five of 160 characters.
    const five = Array.from({ length: 5 }, (_, i) => `${i}`.padEnd(160, "x"));
    assert.equal((await patch("rahul", { questions: five })).status, 200);
    assert.deepEqual(world.db.read(forkPath(3)).questions, five);
  });

  test("before the group has its own copy the questions are the run's, and the route says to copy first", async () => {
    assert.deepEqual(said(await patch("rahul", { questions: ["Ours?"] })), [409, "This week still tracks the run's canonical content. Fork it for your group first."]);
    assert.equal(world.db.read(forkPath(3)) ?? null, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Every copy of a week
// ---------------------------------------------------------------------------

describe("4. every copy of a week carries its questions", () => {
  test("a template, both ways: run to snapshot to run, unchanged", () => {
    const week = courses.normalizeCourseWeek("w03", { weekNumber: 3, title: "Who decides what AGI means", questions: QUESTIONS });
    const snapshot = templateWeekFields(week);
    assert.deepEqual(snapshot.questions, QUESTIONS);
    const back = templateWeekFields(courses.normalizeCourseWeek("w03", snapshot));
    assert.deepEqual(back, snapshot);
  });

  test("a run copying another run's weeks carries them", async () => {
    world.db.seed(`courseRuns/${RUN.agiSpring}/weeks/w03`, {
      weekNumber: 3,
      title: "Who decides what AGI means",
      summary: "",
      guideBlocks: [],
      materials: [],
      exercises: [],
      checklist: [],
      questions: QUESTIONS,
      estimatedMinutes: null,
      published: true,
    });
    const answer = await call("zach", cloneRoute.POST, { runId: RUN.agi }, { body: { fromRunId: RUN.agiSpring, overwrite: true }, course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(world.db.read(weekPath(3)).questions, QUESTIONS);
  });

  /**
   * THE CLASS: a week copied without one of its fields. Every object literal
   * under `src` that writes a whole week (it names the week's guide, its
   * materials, its exercises and its checklist) must carry its questions
   * too, or every copy made that way drops them. Walks the tree, so a new
   * copy is held to it the day it is written.
   */
  test("every literal that writes a whole week carries its questions", () => {
    const WEEK_PARTS = ["guideBlocks", "materials", "exercises", "checklist"];
    const found = [];
    const missing = [];
    for (const file of walkSource(SRC)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes("guideBlocks")) continue;
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node) => {
        if (ts.isObjectLiteralExpression(node)) {
          const names = node.properties
            .map((property) => (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null))
            .filter(Boolean);
          if (WEEK_PARTS.every((part) => names.includes(part))) {
            const where = `${relative(SRC, file).split(sep).join("/")}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
            found.push(where);
            if (!names.includes("questions")) missing.push(where);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    // The walk sees the copies it exists for.
    for (const file of [
      "features/courses/courseMutations.ts",
      "app/api/courses/runs/[runId]/clone-weeks/route.ts",
      "app/api/courses/runs/[runId]/normalise-weeks/route.ts",
      "lib/firestore/courseTemplates.ts",
    ]) {
      assert.ok(found.some((where) => where.startsWith(`${file}:`)), `the walk did not see ${file}: ${found.join(", ")}`);
    }
    assert.deepEqual(missing, [], `a whole week written without its questions: ${missing.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// 5. The week's page
// ---------------------------------------------------------------------------

describe("5. the week's page draws them, numbered, between the readings and the exercise", () => {
  test("Chloe's week 3, as the board draws it", async () => {
    world.db.poke(weekPath(3), { questions: QUESTIONS });
    await w.asBrowser("chloe");
    const { html, text } = w.weekPage("chloe", 3);
    assert.ok(
      text.includes(
        "Questions to think about 01 Which claim did you disagree with, and why? 02 What would change your mind? " +
          "03 What’s one thing you’d want to understand better? Exercise",
      ),
      text,
    );
    assert.ok(text.indexOf("Before your session") < text.indexOf("Questions to think about"), "the readings are drawn first");
    // An ordered list, its numbers drawn and not read twice.
    assert.match(html, /<section[^>]*aria-labelledby="questions-to-think-about"[^>]*><div[^>]*><h2 id="questions-to-think-about"[^>]*>Questions to think about<\/h2><\/div><ol/);
    assert.equal((html.match(/<span aria-hidden="true" class="questionNumber">0[123]<\/span>/g) ?? []).length, 3);
  });

  test("a group's own copy draws the group's questions", async () => {
    world.db.poke(weekPath(3), { questions: QUESTIONS });
    await w.asBrowser("chloe");
    w.ui.weekDocs.w03 = courses.normalizeCourseWeek("w03", { ...world.db.read(weekPath(3)), questions: ["Ours?"] });
    assert.match(w.weekPage("chloe", 3).text, /Questions to think about 01 Ours\? Exercise/);
  });

  test("a week with none draws no heading", async () => {
    await w.asBrowser("chloe");
    const { text } = w.weekPage("chloe", 3);
    assert.doesNotMatch(text, /Questions to think about/);
    assert.match(text, /Exercise/);
  });

  test("a facilitator and an admin read them as members do", async () => {
    world.db.poke(weekPath(3), { questions: QUESTIONS });
    for (const [who, role] of [["rahul", "facilitator"], ["zach", "admin"]]) {
      await w.asBrowser(who);
      assert.match(w.weekPage(who, 3, role).text, /Questions to think about 01 Which claim did you disagree with, and why\?/, who);
    }
  });
});
