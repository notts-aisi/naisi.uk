/**
 * THE QUESTIONS LEFT BLANK, AND THE ONE MERGE EVERY READER READS THROUGH
 * (docs/surveys.md, "Sending the questions left blank").
 *
 *  1. `mergedAnswers` adds a later send's answers only to questions that were
 *     blank, line by line on a lines question, and never replaces anything:
 *     with one later send, with two, and with a stored later send that tries.
 *  2. `blanksOf` finds the required questions still blank after merging, in
 *     the survey's order, by the survey's own rule (`missingRequired`): never
 *     a question marked optional, always one stored with Worksheets'
 *     `required: false`, never a consent box, never a line hidden from the
 *     person; an agreement grid's lines still blank, and "How valuable was
 *     each part?" blank only with no line answered.
 *  3. The two answer normalisers merge, so every read of the answers that goes
 *     through them reads the merged answers.
 *  4. THE WALK: every file in `src` that names the answers collection is in
 *     `ANSWER_FILES` with why, in both directions. A file that reads answers
 *     reads them through a normaliser and never off a snapshot's data, so no
 *     reader can go round the merge; a file that writes or takes names off
 *     reads no answer at all. The scanner's own reading is checked on
 *     synthetic snippets at the bottom.
 *
 * Run with `npm test`. Pure: nothing here reaches a Firestore project.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => ({}) };"],
  ]),
});

const blanks = await loadTs(join("lib", "surveys", "blanks.ts"));
const items = await loadTs(join("lib", "surveys", "items.ts"));
const templates = await loadTs(join("lib", "surveys", "templates.ts"));
const records = await loadTs(join("lib", "firestore", "surveys.ts"));
const words = await loadTs(join("lib", "surveys", "words.ts"));

const { mergedAnswers, blanksOf, blankItemsOf, outsideBlanks, laterAnswersOf } = blanks;

/** The before survey's questions, as a programme's survey holds them. */
const BEFORE = templates.templateItems("before", "fellowship", null);
const QUESTIONS = items.surveyQuestionsOf(BEFORE);
const C7 = QUESTIONS.find((question) => question.id === "q_c7");

const at = (iso) => new Date(iso);

// ---------------------------------------------------------------------------
// 1. The merge
// ---------------------------------------------------------------------------

describe("the one merge never overwrites and fills only what was blank", () => {
  const first = {
    q_c1: { type: "choice", optionId: "o_stage1" },
    q_c7: { type: "lines", values: { l_next: 2 } },
    q_p6: { type: "text", text: "To explain the risk clearly." },
  };

  test("a later send adds answers to blank questions, and a lines question takes only its blank lines", () => {
    const fill = {
      answers: {
        q_c2: { type: "percent", value: 20 },
        q_c7: { type: "lines", values: { l_next: 5, l_contribute: 3 } },
      },
    };
    const merged = mergedAnswers(first, [fill]);
    assert.deepEqual(merged.q_c1, first.q_c1, "the first send's choice stands");
    assert.deepEqual(merged.q_p6, first.q_p6, "the first send's words stand");
    assert.deepEqual(merged.q_c2, { type: "percent", value: 20 }, "the blank question is filled");
    assert.deepEqual(merged.q_c7, { type: "lines", values: { l_next: 2, l_contribute: 3 } }, "l_next keeps its 2; only the blank line is added");
  });

  test("a stored later send that answers what the first send holds changes nothing of it", () => {
    const fill = { answers: { q_c1: { type: "choice", optionId: "o_stage4" }, q_p6: { type: "text", text: "Something else." } } };
    assert.deepEqual(mergedAnswers(first, [fill]), first);
  });

  test("two later sends, in order: the earlier one wins a question both answer", () => {
    const one = { answers: { q_c2: { type: "percent", value: 20 } } };
    const two = { answers: { q_c2: { type: "percent", value: 90 }, q_c4: { type: "scale", value: 3 } } };
    const merged = mergedAnswers(first, [one, two]);
    assert.deepEqual(merged.q_c2, { type: "percent", value: 20 });
    assert.deepEqual(merged.q_c4, { type: "scale", value: 3 });
  });

  test("the first send's answers are not changed by merging, and no later send means the first send alone", () => {
    const before = structuredClone(first);
    mergedAnswers(first, [{ answers: { q_c7: { type: "lines", values: { l_contribute: 1 } } } }]);
    assert.deepEqual(first, before, "the merge wrote into the first send's answers");
    assert.deepEqual(mergedAnswers(first, []), first);
  });

  test("a key a plain object answers from its prototype is no answer", () => {
    const merged = mergedAnswers({}, [{ answers: JSON.parse('{"q_c2":{"type":"percent","value":5}}') }]);
    assert.deepEqual(Object.keys(merged), ["q_c2"]);
    assert.equal(mergedAnswers({ q_c2: { type: "percent", value: 1 } }, [{ answers: { constructor: { type: "percent", value: 9 } } }]).q_c2.value, 1);
  });

  test("which answers came later, and when: a whole question, or a line added to one", () => {
    const later = laterAnswersOf(first, [
      { answers: { q_c2: { type: "percent", value: 20 }, q_c1: { type: "choice", optionId: "o_stage4" } }, sentAt: at("2026-10-30T14:05:00Z") },
      { answers: { q_c7: { type: "lines", values: { l_contribute: 3 } } }, sentAt: at("2026-10-31T09:00:00Z") },
    ]);
    assert.deepEqual([...later.keys()].sort(), ["q_c2", "q_c7", "q_c7.l_contribute"], "q_c1 and l_next were not blank, so nothing of them came later");
    assert.equal(later.get("q_c2").toISOString(), "2026-10-30T14:05:00.000Z");
    assert.equal(later.get("q_c7").toISOString(), "2026-10-31T09:00:00.000Z");
    assert.equal(later.get("q_c7.l_contribute").toISOString(), "2026-10-31T09:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 2. What is blank
// ---------------------------------------------------------------------------

describe("the questions still blank", () => {
  test("every required question with no answer, in the survey's order; a consent box never", () => {
    const blank = blanksOf(BEFORE, {});
    assert.deepEqual(
      blank.map((each) => each.id),
      items.requiredQuestionsOf(BEFORE).map((question) => question.id),
    );
    assert.deepEqual(items.requiredQuestionsOf(BEFORE), QUESTIONS, "the before survey asks nothing optional: this test means every question");
    assert.ok(!blank.some((each) => BEFORE.find((item) => item.id === each.id)?.kind === "consent"), "a consent box counted as a blank");
    assert.ok(BEFORE.some((item) => item.kind === "consent"), "the before survey still asks its consent: this test means something");
  });

  test("an answered question is not blank; an agreement grid is blank in the lines it lacks", () => {
    const answers = { q_c1: { type: "choice", optionId: "o_stage1" }, q_c7: { type: "lines", values: { l_next: 2 } } };
    const blank = blanksOf(BEFORE, answers);
    assert.ok(!blank.some((each) => each.id === "q_c1"));
    const c7 = blank.find((each) => each.id === "q_c7");
    assert.deepEqual(c7.lines, C7.lines.map((line) => line.id).filter((id) => id !== "l_next"));
  });

  test("spaces are no words, and a pick-any question with no tick is blank", () => {
    const answers = { q_p6: { type: "text", text: "   " }, q_c3: { type: "choices", optionIds: [] } };
    const ids = blanksOf(BEFORE, answers).map((each) => each.id);
    assert.ok(ids.includes("q_p6") && ids.includes("q_c3"));
  });

  test("what is blank is the survey's own rule, `missingRequired`, for every template and every answer", () => {
    for (const [kind, programme] of [["before", "fellowship"], ["after", "fellowship"], ["after", "incubator"], ["followUp6", "fellowship"]]) {
      const its = templates.templateItems(kind, programme, null);
      for (const answers of [{}, { q_c1: { type: "choice", optionId: "o_stage1" } }, { q_q2: { type: "lines", values: { l_sessions: 3 } } }]) {
        assert.deepEqual(
          blanksOf(its, answers).map((each) => each.id),
          items.missingRequired(its, answers),
          `${kind} ${programme}`,
        );
      }
    }
  });

  test("an optional question left blank is never a blank: a template's, and one an admin switched off", () => {
    const follow = templates.templateItems("followUp6", "fellowship", null);
    const optional = items.surveyQuestionsOf(follow).filter((question) => !items.isQuestionRequired(question));
    assert.ok(optional.some((question) => question.id === "q_f7"), "the follow-up still asks an optional catch-all: this test means something");
    const blank = blanksOf(follow, {}).map((each) => each.id);
    for (const question of optional) assert.ok(!blank.includes(question.id), `${question.id} is optional and counted as a blank`);
    assert.equal(blank.length, items.requiredQuestionsOf(follow).length, "the count holds an optional question");

    const switchedOff = BEFORE.map((item) => (item.id === "q_p6" ? { ...item, optional: true } : item));
    const ids = blanksOf(switchedOff, {}).map((each) => each.id);
    assert.ok(!ids.includes("q_p6"), "a question switched to optional is counted as a blank");
    assert.equal(ids.length, QUESTIONS.length - 1);
  });

  test("a question stored before the switch existed, with `required: false`, is required and counted", () => {
    // Stored as surveys were before the switch: Worksheets' `required: false` on every question, no `optional`.
    const legacy = BEFORE.map((item) => {
      if (item.kind !== "question") return item;
      const { optional: _optional, ...rest } = item;
      return { ...rest, required: false };
    });
    assert.equal(legacy.find((item) => item.id === "q_p6").required, false);
    assert.ok(legacy.every((item) => item.kind !== "question" || !("optional" in item)));
    assert.ok(blanksOf(legacy, {}).some((each) => each.id === "q_p6"), "a legacy `required: false` question was read as optional");
    assert.equal(blanksOf(legacy, {}).length, QUESTIONS.length);
    // The switch turned back on wins over the list of questions that do not apply to everybody.
    const follow = templates.templateItems("followUp6", "fellowship", null).map((item) => (item.id === "q_f7" ? { ...item, optional: false } : item));
    assert.ok(blanksOf(follow, {}).some((each) => each.id === "q_f7"), "q_f7 switched on is not counted");
  });

  test("\"How valuable was each part?\" needs one line: blank only with none, and then every line it shows", () => {
    const after = templates.templateItems("after", "fellowship", null);
    const grid = items.surveyQuestionsOf(after).find((question) => question.type === "lines" && question.lines.some((line) => line.id === templates.FACILITATOR_LINE_ID));
    assert.ok(grid, "the survey at the end still rates the facilitators line by line");
    assert.equal(grid.scale.points, undefined, "the grid rates the parts with words at its ends only: any one line answers it");
    const every = grid.lines.map((line) => line.id);
    assert.deepEqual(blanksOf(after, {}).find((each) => each.id === grid.id).lines, every, "somebody shown every line has every line blank");
    assert.ok(!blanksOf(after, { [grid.id]: { type: "lines", values: { l_sessions: 4 } } }).some((each) => each.id === grid.id), "one line answered left it blank");
    assert.ok(!blanksOf(after, { [grid.id]: { type: "lines", values: { [templates.FACILITATOR_LINE_ID]: 2 } } }).some((each) => each.id === grid.id));
    // The facilitators line is hidden from a facilitator: never theirs, so never on their link.
    const hidden = [templates.FACILITATOR_LINE_ID];
    assert.deepEqual(blanksOf(after, {}, { hiddenLines: hidden }).find((each) => each.id === grid.id).lines, every.filter((id) => id !== templates.FACILITATOR_LINE_ID));
    // Their link shows the grid with its lines, and one line answers it there too.
    const shown = blankItemsOf(after, blanksOf(after, {}, { hiddenLines: hidden }));
    const onLink = shown.find((question) => question.id === grid.id);
    assert.deepEqual(onLink.lines.map((line) => line.id), every.filter((id) => id !== templates.FACILITATOR_LINE_ID));
    assert.deepEqual(items.missingRequired([onLink], { [grid.id]: { type: "lines", values: { l_readings: 5 } } }, { hiddenLines: hidden }), []);
    assert.deepEqual(items.missingRequired([onLink], {}, { hiddenLines: hidden }), [grid.id]);
  });

  test("the link shows each blank question whole, and an agreement grid with its blank lines alone", () => {
    const answers = { q_c7: { type: "lines", values: { l_next: 2 } } };
    const shown = blankItemsOf(BEFORE, blanksOf(BEFORE, answers));
    assert.ok(shown.every((item) => item.kind === "question"), "the link shows a section, a page break or a consent");
    assert.ok(shown.every((question) => items.isQuestionRequired(question)), "a question on the link is not required");
    const c7 = shown.find((question) => question.id === "q_c7");
    assert.deepEqual(c7.lines.map((line) => line.id), C7.lines.map((line) => line.id).filter((id) => id !== "l_next"));
    assert.equal(c7.title, C7.title);
  });

  test("a later send may answer only what was blank, and only the blank lines", () => {
    const blank = blanksOf(BEFORE, { q_c7: { type: "lines", values: { l_next: 2 } } });
    assert.equal(outsideBlanks({ q_c2: { type: "percent", value: 1 } }, blank), null);
    assert.equal(outsideBlanks({ q_c7: { type: "lines", values: { l_contribute: 1 } } }, blank), null);
    assert.equal(outsideBlanks({ q_c7: { type: "lines", values: { l_next: 5 } } }, blank), words.BLANKS_REFUSAL.notBlank);
    const answered = blanksOf(BEFORE, { q_c1: { type: "choice", optionId: "o_stage1" } });
    assert.equal(outsideBlanks({ q_c1: { type: "choice", optionId: "o_stage4" } }, answered), words.BLANKS_REFUSAL.notBlank);
    const follow = templates.templateItems("followUp6", "fellowship", null);
    assert.equal(outsideBlanks({ q_f7: { type: "text", text: "Nothing else." } }, blanksOf(follow, {})), words.BLANKS_REFUSAL.notBlank, "an optional question took a later answer");
  });
});

// ---------------------------------------------------------------------------
// 3. The normalisers merge
// ---------------------------------------------------------------------------

describe("every answer read through a normaliser is merged", () => {
  const read = (raw) => items.storedSurveyAnswers(BEFORE, raw);
  const stored = {
    surveyId: "s1",
    roundId: "r1",
    respondent: { kind: "account", uid: "amara" },
    answers: { q_c1: { type: "choice", optionId: "o_stage1" } },
    sentAt: at("2026-10-29T19:00:00Z"),
    via: "link",
    afterFirstSession: false,
    fills: [
      { answers: { q_c2: { type: "percent", value: 20 }, q_c1: { type: "choice", optionId: "o_stage4" } }, sentAt: at("2026-10-30T14:05:00Z"), via: "signed-in", afterFirstSession: true },
    ],
  };

  test("a programme survey's answer: merged, the first send as it was, and each later send", () => {
    const answer = records.normalizeSurveyAnswer("a1", stored, read);
    assert.deepEqual(answer.answers, { q_c1: { type: "choice", optionId: "o_stage1" }, q_c2: { type: "percent", value: 20 } });
    assert.deepEqual(answer.first, { q_c1: { type: "choice", optionId: "o_stage1" } });
    assert.equal(answer.fills.length, 1);
    assert.equal(answer.fills[0].via, "signed-in");
    assert.equal(answer.fills[0].afterFirstSession, true);
  });

  test("a survey after an event's answer: merged the same way", () => {
    const answer = records.normalizeEventAnswer("a1", { ...stored, respondent: { kind: "guest", signupId: "g1" } }, read);
    assert.deepEqual(answer.answers, { q_c1: { type: "choice", optionId: "o_stage1" }, q_c2: { type: "percent", value: 20 } });
  });

  test("an answer with no later send reads as it always did", () => {
    const { fills, ...plain } = stored;
    assert.equal(fills.length, 1);
    const answer = records.normalizeSurveyAnswer("a1", plain, read);
    assert.deepEqual(answer.answers, plain.answers);
    assert.deepEqual(answer.fills, []);
  });

  test("a row's link of blanks, read whole or not at all", () => {
    const row = {
      surveyId: "s1",
      respondent: { kind: "account", uid: "amara" },
      token: "a".repeat(43),
      blanks: { token: "b".repeat(43), sentAt: at("2026-10-30T14:00:00Z"), delivery: "sent", spentAt: null },
      blanksPresses: [{ at: at("2026-10-30T14:00:00Z"), byUid: "zach", count: 3 }],
    };
    const person = records.normalizeSurveyPerson("s1__amara", row);
    assert.equal(person.blanks.token, "b".repeat(43));
    assert.deepEqual(person.blanksPresses, [{ at: at("2026-10-30T14:00:00Z"), byUid: "zach", count: 3 }]);
    assert.equal(records.normalizeSurveyPerson("s1__amara", { ...row, blanks: { token: "short" } }).blanks, null, "a secret of the wrong shape opens nothing");
    assert.equal(records.normalizeEventPerson("s1__amara", row).blanks.token, "b".repeat(43));
  });
});

// ---------------------------------------------------------------------------
// 4. The walk
// ---------------------------------------------------------------------------

/** How a file that names the answers collection may treat it. */
const READS = "reads answers only through a normaliser, which merges";
const NO_ANSWERS = "writes answers or takes names off them, and reads no answer";

/**
 * EVERY FILE IN `src` THAT NAMES THE ANSWERS COLLECTION, and why. A new one
 * fails until it is written here; a file that no longer names it fails until
 * its entry goes.
 */
const ANSWER_FILES = new Map([
  ["src/lib/firestore/surveys.ts", { kind: "records", why: "the collection's name and the two normalisers, each of which merges through mergedAnswers" }],
  ["src/lib/surveys/repo.ts", { kind: READS, why: "a survey's answers, a person's own earlier answer and one person's answers, each normalised" }],
  ["src/lib/surveys/events/store.ts", { kind: READS, why: "a survey after an event's answers and one person's answer, each normalised, and its one writer of a first send" }],
  ["src/lib/surveys/blanksStore.ts", { kind: READS, why: "a person's answer, normalised, to find what is still blank, and the one writer of a later send" }],
  ["src/lib/surveys/answer.ts", { kind: NO_ANSWERS, why: "the one writer of a programme survey's first send" }],
  ["src/lib/surveys/namesOff.ts", { kind: NO_ANSWERS, why: "names off: sets each answer's person to null and reads nothing else of it" }],
]);

const NAMES_COLLECTION = /\bSURVEY_ANSWERS_COLLECTION\b|["'`]surveyAnswers["'`]/;

/** Answers read off a snapshot's data, round the normalisers. */
const RAW_ANSWERS = [
  /\.data\(\)\s*(?:\?\?\s*\{\s*\}\s*\))?\s*\??\.\s*answers\b/,
  /\.data\(\)\s*\)\s*\??\.\s*answers\b/,
  /\{[^}]*\banswers\b[^}]*\}\s*=\s*[^;]*\.data\(\)/,
  /\[\s*["'`]answers["'`]\s*\]/,
];

/** Whether some code reads answers off a snapshot's data. Strings kept, comments gone. */
export function readsRawAnswers(code) {
  return RAW_ANSWERS.some((pattern) => pattern.test(code));
}

const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

const NAMING = [...walkSource(SRC)]
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => ({ path: relative(REPO_ROOT, file).split("\\").join("/"), code: codeOf(file) }))
  .filter((file) => NAMES_COLLECTION.test(file.code));

describe("no read of a survey's answers goes round the merge", () => {
  test("the walk found the tree", () => {
    assert.ok(NAMING.length >= 5, `only ${NAMING.length} files name the answers collection: was the code moved?`);
  });

  test("every file that names the answers collection is listed, and every listed file still names it", () => {
    const found = NAMING.map((file) => file.path).sort();
    const listed = [...ANSWER_FILES.keys()].sort();
    assert.deepEqual(
      found.filter((path) => !ANSWER_FILES.has(path)),
      [],
      "a file names the answers collection and is not in ANSWER_FILES: say whether it reads answers (through a normaliser) or only writes",
    );
    assert.deepEqual(
      listed.filter((path) => !found.includes(path)),
      [],
      "an ANSWER_FILES entry no longer names the answers collection: take it out",
    );
  });

  test("a file that reads answers reads them through a normaliser, never off a snapshot's data", () => {
    for (const { path, code } of NAMING) {
      const entry = ANSWER_FILES.get(path);
      if (entry?.kind !== READS) continue;
      assert.ok(/normalize(?:Survey|Event)Answer\(/.test(code), `${path} reads the answers collection without a normaliser`);
      assert.ok(!readsRawAnswers(code), `${path} reads answers off a snapshot's data, round the merge`);
    }
  });

  test("a file that only writes or takes names off reads no answer", () => {
    for (const { path, code } of NAMING) {
      const entry = ANSWER_FILES.get(path);
      if (entry?.kind !== NO_ANSWERS) continue;
      assert.ok(!/normalize(?:Survey|Event)Answer\(/.test(code), `${path} now reads answers: it is a reader, so list it as one`);
      assert.ok(!readsRawAnswers(code), `${path} reads answers off a snapshot's data`);
    }
  });

  test("both normalisers merge through mergedAnswers, and nothing else in src merges", () => {
    const recordsCode = codeOf(join(SRC, "lib", "firestore", "surveys.ts"));
    for (const name of ["normalizeSurveyAnswer", "normalizeEventAnswer"]) {
      const body = new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`).exec(recordsCode)?.[0] ?? "";
      assert.match(body, /answers: mergedAnswers\(first, fills\),/, `${name} no longer merges`);
      assert.ok(!/answers: read\(data\.answers\)/.test(body), `${name} hands out the first send alone`);
    }
    // The one merge: only the records file and the module that defines it call it, and the admins' switch that re-merges.
    const callers = [...walkSource(SRC)]
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => relative(REPO_ROOT, file).split("\\").join("/"))
      .filter((path) => /\bmergedAnswers\(/.test(codeOf(join(REPO_ROOT, path))));
    assert.deepEqual(callers.sort(), ["src/lib/firestore/surveys.ts", "src/lib/surveys/adminView.ts", "src/lib/surveys/blanks.ts"].sort());
  });
});

describe("the scanner reads what it says it reads", () => {
  test("answers read off a snapshot are caught, in each shape", () => {
    assert.ok(readsRawAnswers("const a = doc.data().answers;"));
    assert.ok(readsRawAnswers("const a = (doc.data() ?? {}).answers;"));
    assert.ok(readsRawAnswers("const a = snap.data()?.answers;"));
    assert.ok(readsRawAnswers("const { answers } = doc.data();"));
    assert.ok(readsRawAnswers('const a = data["answers"];'));
  });

  test("a normalised read and a write are not", () => {
    assert.ok(!readsRawAnswers("const answer = normalizeSurveyAnswer(doc.id, doc.data() ?? {}, read); use(answer.answers);"));
    assert.ok(!readsRawAnswers("tx.set(answerRef, { surveyId, answers, sentAt });"));
    assert.ok(!readsRawAnswers("const surveyId = (doc.data() ?? {}).surveyId;"));
  });
});
