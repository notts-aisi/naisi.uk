/**
 * QUESTION SETS (docs/surveys.md, "Question sets"): the questions each kind
 * of survey starts with, which an admin changes on Run NAISI › Surveys ›
 * Question sets ("Change them here, or per survey").
 *
 *  1. WORDS ONLY for before a programme, its end, leaving it, the weekly
 *     check-in and the session report. Every word of every one of those sets
 *     changed at once leaves every question's id, kind, answers, scores and
 *     place as the code has them, in every shape a template takes; and a
 *     save that would add, take out or retype anything is refused.
 *  2. THE SURVEY AFTER AN EVENT, WHOLE: added to, removed, reworded and
 *     retyped, of the event editor's five kinds, a question the code asks
 *     keeping its kind; and the step reading the stored set as its standard.
 *  3. THE ROUTE AS EVERY CALLER: view-as refused first, then the session and
 *     the admin bar, before anything is read; each set kept as only what
 *     differs from the code's, and a set back to the code's deleted.
 *  4. THE PAGES AS EVERY CALLER: the Question sets tab, and each set's page.
 *  5. NEVER ONE ALREADY MADE: a programme's surveys made before a change keep
 *     their words, and those made after take the set's. The check-in's, the
 *     survey after an event's and the session report's are proved in their
 *     own suites (`tests/surveys-check-ins.test.mjs`,
 *     `tests/event-survey-after.test.mjs`, `tests/course-session-reports.test.mjs`).
 *  6. THE TREE: every place a survey is made from a template reads its set,
 *     nothing else makes one from the code's, and only the record's own
 *     modules name the collection.
 *
 * The world is `tests/lib/surveyWorld.mjs` (AGI Strategy on Thu 29 Oct 2026,
 * the morning its before survey goes out). Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { NOW, makeSurveyWorld } from "./lib/surveyWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const w = await makeSurveyWorld("__questionSets");
const route = await w.loadTs(join("app", "api", "surveys", "question-sets", "[kind]", "route.ts"));
const setPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "question-sets", "[kind]", "page.tsx"))).default;
const sets = await w.loadTs(join("lib", "surveys", "questionSets.ts"));
const record = await w.loadTs(join("lib", "firestore", "surveyQuestionSets.ts"));
const items = w.lib.items;
const templates = w.lib.templates;
const { eventTemplateItems, STANDARD_QUESTION_IDS } = await w.loadTs(join("lib", "surveys", "events", "template.ts"));
const { checkInItems } = await w.loadTs(join("lib", "surveys", "checkIns", "template.ts"));
const after = await w.loadTs(join("lib", "surveys", "events", "after.ts"));
const { SESSION_REPORT_QUESTIONS } = await w.loadTs(join("lib", "firestore", "courseSessionReports.ts"));
const reportWords = await w.loadTs(join("lib", "courses", "sessionReports", "words.ts"));

/** The clock, set for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const put = (who, kind, body, options = {}) => w.call(who, route.PUT, { kind }, { body, ...options });
const stored = (kind) => w.world.db.read(`surveyQuestionSets/${kind}`) ?? null;
const hubAs = (who) => w.page(w.pages.list, { searchParams: Promise.resolve({ tab: "question-sets" }) }, who);
const setPageAs = (who, kind) => w.page(setPage, { params: Promise.resolve({ kind }) }, who);

/** Everybody but an admin, and how a failure names them. */
const NOT_ADMINS = [
  ["claudia", "AGI Strategy's lead, SU-recognised committee"],
  ["nadia", "SU-recognised committee"],
  ["rahul", "a facilitator of one of its groups"],
  ["amara", "a member holding a place"],
  ["refused", "a refused account"],
];

/**
 * A survey's shape with every word left out: what a question set may never
 * change. Ids, kinds, answers' and lines' ids, scales, scores, picks, the
 * Required switch, where a question looks back to and whose answer it pipes,
 * the consent's purposes, the sections and page breaks and their order.
 */
function shapeOf(list) {
  return list.map((item) => {
    if (item.kind === "pageBreak") return ["pageBreak", item.id];
    if (item.kind === "section") return ["section", item.id];
    if (item.kind === "consent") return ["consent", item.id, item.boxes.map((box) => box.purpose)];
    return [
      "question",
      item.id,
      item.type,
      (item.options ?? []).map((option) => option.id),
      (item.lines ?? []).map((line) => line.id),
      item.scale ? [item.scale.max, item.scale.points?.length ?? null] : null,
      item.rating ? item.rating.max : null,
      item.type === "scale" ? [item.min, item.max, item.anchors.map((anchor) => anchor.at)] : null,
      item.type === "number" ? item.max : null,
      item.scores ?? null,
      item.scoreUnit ?? null,
      item.maxPicks ?? null,
      item.noneIds ?? null,
      item.most === undefined ? null : "most",
      item.look ?? null,
      item.profile ?? null,
      item.lookBackOf ?? null,
      item.pipe?.from ?? null,
      item.limit ?? null,
      items.isQuestionRequired(item),
    ];
  });
}

/** Every shape a words-only survey set is asked in: both kinds of programme, both strands, and check-ins with and without parts and reading. */
const SHAPES = [
  ["before", "before, a fellowship", () => templates.templateItems("before", "fellowship", null)],
  ["before", "before, an incubator on alignment", () => templates.templateItems("before", "incubator", "alignment")],
  ["before", "before, an incubator on governance", () => templates.templateItems("before", "incubator", "governance")],
  ["after", "the end, a fellowship", () => templates.templateItems("after", "fellowship", null)],
  ["after", "the end, an incubator on alignment", () => templates.templateItems("after", "incubator", "alignment")],
  ["after", "the end, an incubator on governance", () => templates.templateItems("after", "incubator", "governance")],
  ["leaving", "leaving", () => templates.templateItems("leaving", "fellowship", null)],
  [
    "check-in",
    "a check-in with parts and reading",
    () => checkInItems({ parts: [{ id: "pt-power", title: "Why powerful AI might seek power" }, { id: "pt-races", title: "Races between AI developers" }], hasReading: true }),
  ],
  ["check-in", "a check-in with neither", () => checkInItems({ parts: [], hasReading: false })],
];

/** A set that changes every word it may: each one's own new words, short enough to fit. */
function everyWordChanged(kind) {
  const out = {};
  for (const entry of sets.setEntries(kind, {})) {
    for (const slot of entry.slots) out[slot.key] = `New ${slot.key}`.slice(0, slot.max);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Words only
// ---------------------------------------------------------------------------

describe("1. words only: before, end, leaving, the check-in and the session report change their words and nothing else", () => {
  test("the six sets, in the board's order, and which edits whole", () => {
    assert.deepEqual(record.QUESTION_SET_KINDS, ["event", "check-in", "session-report", "before", "after", "leaving"]);
    assert.deepEqual(
      record.QUESTION_SET_KINDS.map((kind) => [sets.QUESTION_SETS[kind].name, sets.editsWhole(kind)]),
      [
        ["After an event", true],
        ["Weekly check-in", false],
        ["Facilitator’s session report", false],
        ["Before a programme", false],
        ["End of a programme", false],
        ["Leaving", false],
      ],
    );
    // A follow-up has no set: it asks in the code's words.
    assert.deepEqual(templates.SURVEY_TEMPLATES.map((stage) => sets.setOfTemplate(stage)), ["before", "after", null, null, "leaving"]);
  });

  test("every word changed at once: every shape a template takes keeps every id, kind, answer and place, and asks in the new words", () => {
    for (const [kind, name, make] of SHAPES) {
      const words = everyWordChanged(kind);
      const code = make();
      const read = sets.withSetWords(kind, code, words);
      assert.deepEqual(shapeOf(read), shapeOf(code), `${name}: a word changed something besides words`);
      assert.deepEqual(items.validateSurveyItems(read), [], `${name}: the new words make an invalid survey`);
      // Every question's own words are the set's.
      for (const question of items.surveyQuestionsOf(read)) {
        const key = `${question.id}:title`;
        if (words[key] !== undefined) assert.equal(question.title, words[key], `${name}: ${question.id} still asks in the code's words`);
      }
      assert.ok(items.surveyQuestionsOf(read).some((question) => question.title.startsWith("New ")), `${name}: no word changed`);
    }
  });

  test("an incubator's first skills line stays its research's words, whatever is stored", () => {
    for (const strand of ["alignment", "governance"]) {
      for (const stage of ["before", "after"]) {
        const read = sets.withSetWords(stage, templates.templateItems(stage, "incubator", strand), {
          "q_i2:line:l_a": "Stored over the strand",
          "q_i2_back:line:l_a": "Stored over the strand",
          "q_i2:line:l_b": "I can scope a question in a fortnight",
        });
        const grid = read.find((item) => item.id === "q_i2");
        assert.equal(grid.lines[0].label, templates.STRAND_WORDS[strand].line, `${stage}, ${strand}: the strand's line was reworded`);
        assert.equal(grid.lines[1].label, "I can scope a question in a fortnight");
        const back = read.find((item) => item.id === "q_i2_back");
        if (back) assert.equal(back.lines[0].label, templates.STRAND_WORDS[strand].line);
      }
    }
    const fixed = sets.setEntries("before", {}).find((entry) => entry.id === "q_i2").fixed;
    // Shown in its own place: line 1, before line 2's box.
    assert.deepEqual(fixed.map((each) => [each.label, each.before]), [["Line 1", "q_i2:line:l_b"]]);
    assert.match(fixed[0].why, /Worded for the incubator’s research when its survey is made\./);
  });

  test("a stored word with no place in the set, or one that would not pass a save, changes nothing", () => {
    const code = templates.templateItems("before", "fellowship", null);
    const read = sets.withSetWords("before", code, {
      "q_c1:option:o_new": "An answer the code doesn't have",
      "q_nope:title": "A question the code doesn't ask",
      "q_c1:type": "longText",
      "q_c1:title": "",
      "q_c2:title": "x".repeat(201),
      __proto__: "nothing",
      constructor: "nothing",
      "q_ev_how:title": "Another set's question",
    });
    assert.deepEqual(read, code);
  });

  test("the session report's places are its record's questions, in its order; the lead's question stays as it is", () => {
    assert.deepEqual(sets.REPORT_ENTRY_IDS, [...SESSION_REPORT_QUESTIONS]);
    const entries = sets.setEntries("session-report", {});
    assert.deepEqual(entries.map((entry) => entry.slots.map((slot) => slot.key)), [
      ["how:title", "how:low", "how:high"],
      ["wentWell:title"],
      ["didnt:title"],
      ["unclear:title", "unclear:option:something-else"],
      ["engaged:title"],
      ["notRead:title"],
      ["needsHand:title"],
      [],
    ]);
    assert.equal(entries[7].fixed[0].words, "Anything for the admins?");
    // The code's words, and a set's over them; anything else stored is not read.
    assert.deepEqual(sets.sessionReportWordsWith(null), reportWords.REPORT_QUESTION_WORDS);
    assert.deepEqual(sets.sessionReportWordsWith({ "how:title": "How did it go?", "forLead:title": "Anything else?", "engaged:title": "", "notRead:title": 7 }), {
      ...reportWords.REPORT_QUESTION_WORDS,
      how: "How did it go?",
    });
    assert.equal(reportWords.REPORT_QUESTION_WORDS.how, reportWords.REPORT_WORDS.how);
  });

  test("a save of a words-only set: only its places and their words, kept as what differs from the code's", () => {
    assert.deepEqual(sets.checkWordsChange("before", { words: { "q_c1:title": "Which of these is most like you?", "q_c2:title": templates.templateItems("before", "fellowship", null).find((item) => item.id === "q_c2").title } }), {
      ok: true,
      words: { "q_c1:title": "Which of these is most like you?" },
    });
    // Spaces are folded as the reader folds them, so a word typed back to the code's keeps nothing.
    assert.deepEqual(sets.checkWordsChange("leaving", { words: { "q_leave_why:title": "  What made   you leave? " } }), { ok: true, words: {} });
    const refused = (kind, body) => {
      const checked = sets.checkWordsChange(kind, body);
      assert.equal(checked.ok, false, JSON.stringify(body));
      return checked.error;
    };
    // Adding, taking out or retyping a question, or an answer: no place for it, refused whole.
    for (const body of [
      { words: { "q_c1:option:o_new": "Something new" } },
      { words: { "q_new:title": "A question of my own" } },
      { words: { "q_c1:type": "shortText" } },
      { words: {}, items: templates.templateItems("before", "fellowship", null) },
      { items: [] },
      { words: { "q_i2:line:l_a": "The strand's line" } },
    ]) {
      assert.equal(refused("before", body), sets.QUESTION_SET_REFUSAL.wordsOnly, JSON.stringify(body).slice(0, 80));
    }
    assert.equal(refused("check-in", { words: { "q_ci_unclear:option:pt-power": "A part" } }), sets.QUESTION_SET_REFUSAL.wordsOnly);
    assert.equal(refused("session-report", { words: { "forLead:title": "Anything else?" } }), sets.QUESTION_SET_REFUSAL.wordsOnly);
    // Numbered as the set's page numbers them, an incubator's questions among them.
    assert.equal(refused("before", { words: { "q_c1:title": "  " } }), "Question 6 needs its words.");
    assert.equal(refused("before", { words: { "q_c1:option:o_stage0": "x".repeat(121) } }), "Question 6, answer 1 is over the 120-character limit.");
    assert.equal(refused("before", { words: { "c_p7:statement": "" } }), "The consent’s statement needs its words.");
    assert.equal(refused("before", { words: { "q_c1:title": 5 } }), sets.QUESTION_SET_REFUSAL.body);
    assert.equal(refused("before", "words"), sets.QUESTION_SET_REFUSAL.body);
    // The line under a question and the words at a scale's ends may be left empty.
    assert.equal(sets.checkWordsChange("before", { words: { "q_c2:hint": "", "q_c2:low": "Not at all" } }).ok, true);
  });

  test("a words-only set's page: every place in the form's order, an incubator's questions marked, and the check-in's notes", () => {
    const before = sets.setEntries("before", {});
    const questions = before.filter((entry) => entry.kind === "question");
    assert.equal(questions.length, items.surveyQuestionsOf(templates.templateItems("before", "incubator", "alignment")).length);
    assert.deepEqual(
      questions.filter((entry) => entry.only).map((entry) => entry.id),
      ["q_i1", "q_i2", "q_i3"],
    );
    for (const entry of before) for (const slot of entry.slots) assert.equal(slot.words, slot.original, slot.key);
    const changed = sets.setEntries("before", { "q_c1:title": "Which of these is most like you?" });
    const c1 = changed.find((entry) => entry.id === "q_c1").slots[0];
    assert.deepEqual([c1.words, c1.original], ["Which of these is most like you?", "Which best describes you right now?"]);
    const checkIn = sets.setEntries("check-in", {});
    assert.deepEqual(
      checkIn.map((entry) => entry.id),
      ["q_ci_useful", "q_ci_most", "q_ci_better", "q_ci_unclear", "q_ci_reading", "q_ci_confident"],
    );
    assert.match(checkIn[3].notes.join(" "), /The week’s parts come first/);
  });
});

// ---------------------------------------------------------------------------
// 2. The survey after an event, whole
// ---------------------------------------------------------------------------

const CODE_EVENT = () => eventTemplateItems();
const question = (over) => ({ kind: "question", body: [], required: false, ...over });

describe("2. the survey after an event's set: added to, removed, reworded and retyped, a code question keeping its kind", () => {
  test("a save keeps only what the editor makes, and the code's own set is no set at all", () => {
    const code = CODE_EVENT();
    const kept = sets.checkWholeChange({ items: code });
    assert.equal(kept.ok, true);
    assert.equal(sets.isCodeEventSet(kept.items), true);
    // Every question's switch is written out; nothing the step does not make survives.
    const odd = sets.checkWholeChange({
      items: [
        { ...code[0], title: "  How did it   go? ", pipe: { from: "q_p6", words: "You said:" }, hint: "A line", look: "agree" },
        question({ id: "q_mine", type: "multipleChoice", title: "What should we try?", options: [{ id: "o_a", label: "A quiz" }, { id: "o_b", label: "A walk" }], maxPicks: 1, noneIds: ["o_b"] }),
      ],
    });
    assert.equal(odd.ok, true, JSON.stringify(odd));
    assert.deepEqual(odd.items, [
      { kind: "question", id: "q_ev_how", type: "rating", title: "How did it go?", body: [], required: false, optional: false, rating: { max: 5, minLabel: "Not good", maxLabel: "Great" } },
      {
        kind: "question",
        id: "q_mine",
        type: "multipleChoice",
        title: "What should we try?",
        body: [],
        required: false,
        optional: false,
        options: [
          { id: "o_a", label: "A quiz" },
          { id: "o_b", label: "A walk" },
        ],
      },
    ]);
    assert.equal(sets.isCodeEventSet(odd.items), false);
  });

  test("refused: a code question retyped, a kind the step does not add, anything but questions, a 1 to 5 that isn't, and an invalid survey", () => {
    const code = CODE_EVENT();
    const refused = (body) => {
      const checked = sets.checkWholeChange(body);
      assert.equal(checked.ok, false, JSON.stringify(body).slice(0, 120));
      return checked.error;
    };
    assert.equal(refused({ items: [{ ...code[0], type: "shortText", rating: undefined, limit: { unit: "characters", max: 200 } }, ...code.slice(1)] }), "Question 1 can’t change its kind.");
    for (const type of ["lines", "percent", "number", "scale", "poll", "imageUpload"]) {
      assert.equal(refused({ items: [question({ id: "q_x", type, title: "Words" })] }), sets.QUESTION_SET_REFUSAL.kinds, type);
    }
    assert.equal(refused({ items: [{ kind: "section", id: "s_x", heading: "A page", body: [] }, ...code] }), sets.QUESTION_SET_REFUSAL.body);
    assert.equal(refused({ items: [{ kind: "consent", id: "c_x", statement: "S", boxes: [] }, ...code] }), sets.QUESTION_SET_REFUSAL.body);
    assert.equal(refused({ items: [{ ...code[0], rating: { max: 7 } }] }), sets.QUESTION_SET_REFUSAL.rating);
    assert.equal(refused({ items: [] }), "A survey needs at least one question.");
    assert.equal(refused({ items: [question({ id: "q_x", type: "shortText", title: "" })] }), "Question 1: This question needs a title.");
    assert.equal(refused({ items: [question({ id: "q_x", type: "singleChoice", title: "One?", options: [{ id: "o_a", label: "Only" }] })] }), "Question 1: This question needs at least 2 options.");
    assert.equal(refused({ items: [question({ id: "bad id", type: "shortText", title: "Words" })] }), sets.QUESTION_SET_REFUSAL.body);
    assert.equal(refused({ items: code, words: {} }), sets.QUESTION_SET_REFUSAL.body);
    assert.equal(refused({ words: {} }), sets.QUESTION_SET_REFUSAL.body);
  });

  test("the set as read: the stored set, else the code's, and a stored set that would not pass a save now is not used", () => {
    assert.deepEqual(sets.eventSetItems(null), CODE_EVENT());
    const mine = sets.checkWholeChange({ items: [CODE_EVENT()[0], question({ id: "q_mine", type: "longText", title: "What did you make?", optional: true })] }).items;
    assert.deepEqual(sets.eventSetItems({ items: mine }), mine);
    assert.deepEqual(sets.eventSetItems({ items: [{ ...mine[0], type: "longText" }] }), CODE_EVENT(), "a code question stored retyped");
    assert.deepEqual(sets.eventSetItems({ items: "not a list" }), CODE_EVENT());
  });

  test("the event editor's step takes the stored set as its standard: its questions start there, keep their kinds, and none is marked added", () => {
    const standard = sets.checkWholeChange({ items: [CODE_EVENT()[1], question({ id: "q_set_food", type: "singleChoice", title: "How was the food?", options: [{ id: "o_a", label: "Good" }, { id: "o_b", label: "Not good" }] })] }).items;
    const setting = { on: true, items: null, who: "came", missed: false, when: "standard", hours: 12, reminder: true, showCode: true };
    const settings = after.settingsOf(setting, standard);
    assert.equal(settings.standard, true);
    assert.deepEqual(settings.items, standard);
    assert.equal(after.isStandardQuestion("q_set_food", standard), true);
    assert.equal(after.isStandardQuestion("q_ev_how", standard), true, "a code question removed from the set is still the code's");
    assert.equal(after.isStandardQuestion("q_step_own", standard), false);
    // The set's own question keeps its kind in the step, as the code's do.
    assert.deepEqual(after.questionProblems([{ ...standard[1], title: "How was the pizza?" }], standard), []);
    assert.deepEqual(after.questionProblems([{ ...standard[1], type: "shortText", options: undefined, limit: { unit: "characters", max: 200 } }], standard), [
      "Question 1 can’t change its kind.",
    ]);
    assert.deepEqual(after.questionProblems([{ ...CODE_EVENT()[0], type: "longText", rating: undefined, limit: { unit: "characters", max: 2000 } }], standard), [
      "Question 1 can’t change its kind.",
    ]);
    assert.deepEqual([...STANDARD_QUESTION_IDS], CODE_EVENT().map((item) => item.id));
  });
});

// ---------------------------------------------------------------------------
// 3. The route
// ---------------------------------------------------------------------------

describe("3. PUT /api/surveys/question-sets/[kind] as every caller", () => {
  test("view-as first, then the session and the admin bar, before anything is read or written", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const body = { words: { "q_c1:title": "Which of these is most like you?" } };
    assert.equal((await put(null, "before", body)).status, 401);
    for (const [who, what] of NOT_ADMINS) {
      const reads = w.world.db.stats.reads;
      const answer = await put(who, "before", body);
      assert.equal(answer.status, 403, what);
      assert.equal(w.world.db.stats.reads, reads, `${what}: the route read something before refusing`);
    }
    const viewAs = await put("zach", "before", body, { viewAs: true });
    assert.deepEqual([viewAs.status, viewAs.body.error], [403, "view-as"]);
    assert.equal(w.everything(), before, "a refused caller changed something");
  });

  test("an admin: a set by its kind, kept as what differs from the code's, by whom and when; back to the code's, it goes", async (t) => {
    clock(t);
    w.reset();
    assert.deepEqual(await put("zach", "the-term", { words: {} }), { status: 404, body: { error: sets.QUESTION_SET_REFUSAL.noSet } });
    const saved = await put("zach", "before", { words: { "q_c1:title": "Which of these is most like you?", "q_p6:title": "What do you most want to get out of this programme?" } });
    assert.deepEqual(saved, { status: 200, body: { ok: true } });
    const kept = stored("before");
    assert.deepEqual(kept.words, { "q_c1:title": "Which of these is most like you?" });
    assert.equal(kept.kind, "before");
    assert.equal(kept.updatedByUid, "zach");
    assert.equal(kept.updatedAt.toISOString(), NOW.toISOString());
    assert.equal("items" in kept, false, "a words-only set keeps questions");
    // Every word as the code has it again: the set goes.
    assert.deepEqual(await put("zach", "before", { words: { "q_c1:title": "Which best describes you right now?" } }), { status: 200, body: { ok: true } });
    assert.equal(stored("before"), null);
  });

  test("the route refuses what the page would never send: a question added, taken out or retyped in a words-only set, and a code question retyped after an event", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const code = templates.templateItems("before", "fellowship", null);
    for (const [kind, body, error] of [
      ["before", { items: code.map((item) => (item.id === "q_c1" ? { ...item, type: "multipleChoice" } : item)) }, sets.QUESTION_SET_REFUSAL.wordsOnly],
      ["before", { words: { "q_c1:option:o_extra": "An answer of my own" } }, sets.QUESTION_SET_REFUSAL.wordsOnly],
      ["leaving", { words: { "q_leave_mine:title": "A question of my own" } }, sets.QUESTION_SET_REFUSAL.wordsOnly],
      ["check-in", { words: {}, items: [] }, sets.QUESTION_SET_REFUSAL.wordsOnly],
      ["session-report", { words: { "forLead:title": "Anything else?" } }, sets.QUESTION_SET_REFUSAL.wordsOnly],
      ["after", { words: { "q_c1:title": "" } }, "Question 1 needs its words."],
      ["event", { items: [{ ...CODE_EVENT()[0], type: "longText", limit: { unit: "characters", max: 2000 } }] }, "Question 1 can’t change its kind."],
      ["event", { words: { "q_ev_how:title": "How did it go?" } }, sets.QUESTION_SET_REFUSAL.body],
      ["event", null, sets.QUESTION_SET_REFUSAL.body],
    ]) {
      const answer = await put("zach", kind, body);
      assert.deepEqual([answer.status, answer.body.error], [400, error], `${kind}: ${JSON.stringify(body).slice(0, 80)}`);
    }
    assert.equal(w.everything(), before, "a refused save changed something");
  });

  test("the survey after an event's set: kept whole, and the code's own again is no set", async (t) => {
    clock(t);
    w.reset();
    const mine = [CODE_EVENT()[0], question({ id: "q_set_food", type: "singleChoice", title: "How was the food?", optional: false, options: [{ id: "o_a", label: "Good" }, { id: "o_b", label: "Not good" }] })];
    assert.equal((await put("zach", "event", { items: mine })).status, 200);
    assert.deepEqual(stored("event").items, sets.checkWholeChange({ items: mine }).items);
    assert.equal("words" in stored("event"), false);
    assert.equal((await put("zach", "event", { items: CODE_EVENT() })).status, 200);
    assert.equal(stored("event"), null);
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

describe("4. the Question sets tab and each set's page, as every caller", () => {
  test("everybody but an admin, a view-as session and somebody signed out are sent to the dashboard before anything is read", async (t) => {
    clock(t);
    w.reset();
    for (const [who, what] of NOT_ADMINS) {
      for (const [where, draw] of [
        ["the tab", () => hubAs(who)],
        ["a set's page", () => setPageAs(who, "before")],
        ["a set that isn't", () => setPageAs(who, "the-term")],
      ]) {
        const reads = w.world.db.stats.reads;
        assert.equal((await draw()).to, "/dashboard", `${where}: ${what}`);
        assert.equal(w.world.db.stats.reads, reads, `${where}: ${what}: the page read something before sending them away`);
      }
    }
    assert.equal((await hubAs(null)).to, "/dashboard");
    assert.equal((await setPageAs(null, "event")).to, "/dashboard");
    w.world.viewAs = true;
    try {
      assert.equal((await hubAs("amara")).to, "/dashboard", "a view-as session is the member's");
      assert.equal((await setPageAs("amara", "event")).to, "/dashboard");
    } finally {
      w.world.viewAs = false;
    }
  });

  test("the tab: the six sets in the board's order, each with its size and Edit, and the day a changed one changed", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const { text, html } = await hubAs("zach");
    assert.equal(w.everything(), before, "the tab wrote something");
    assert.match(html, /<a href="\/admin\/surveys" class="tab">By programme<\/a><a href="\/admin\/surveys\?tab=events" class="tab">Events<\/a><a href="\/admin\/surveys\?tab=question-sets" class="tab current" aria-current="page">Question sets<\/a>/);
    const card = text.slice(text.indexOf("Question sets The questions"));
    assert.equal(
      card,
      "Question sets The questions each kind starts with. Change them here, or per survey. " +
        "After an event · 5 questions, about a minute Edit " +
        "Weekly check-in · 6 questions, about 2 minutes Edit " +
        "Facilitator’s session report · 8 questions, about 2 minutes Edit " +
        "Before a programme · 14 questions, 17 for an incubator, about 5 minutes Edit " +
        "End of a programme · 23 questions, 32 for an incubator, about 10 minutes Edit " +
        "Leaving · 3 questions, about a minute Edit",
    );
    for (const kind of record.QUESTION_SET_KINDS) {
      assert.ok(html.includes(`<a href="/admin/surveys/question-sets/${kind}" class="action" aria-label="Edit the questions for `), kind);
    }
    // A set changed: its size from the set, and the day.
    await put("zach", "event", { items: [CODE_EVENT()[0]] });
    await put("zach", "leaving", { words: { "q_leave_why:title": "Why did you leave?" } });
    const changed = (await hubAs("zach")).text;
    assert.ok(changed.includes("After an event · 1 question, about a minute · Changed Thu 29 Oct Edit"), changed);
    assert.ok(changed.includes("Leaving · 3 questions, about a minute · Changed Thu 29 Oct Edit"), changed);
  });

  test("a words-only set's page: its words in their boxes, the original under a changed one, and who changed it", async (t) => {
    clock(t);
    w.reset();
    const fresh = await setPageAs("zach", "leaving");
    assert.equal(fresh.to, null);
    assert.ok(fresh.text.startsWith("Question sets Leaving The survey that reaches somebody as they leave a programme. Only the words change here."), fresh.text.slice(0, 200));
    assert.ok(fresh.text.includes("A change reaches surveys made after it, never one already made."));
    assert.ok(fresh.text.includes("Nobody has changed these yet."));
    assert.match(fresh.html, />What made you leave\?<\/textarea>/);
    assert.ok(!fresh.text.includes("The original:"), "an unchanged word shows an original");
    await put("zach", "leaving", { words: { "q_leave_why:title": "Why did you leave?" } });
    const changed = await setPageAs("zach", "leaving");
    assert.match(changed.html, />Why did you leave\?<\/textarea>/);
    assert.ok(changed.text.includes("The original: “What made you leave?”"), changed.text);
    assert.ok(changed.text.includes("Last changed Thu 29 Oct by Zach."), changed.text);
    // The session report says what a change does to reports already sent.
    assert.ok((await setPageAs("zach", "session-report")).text.includes("Reports already sent keep their answers, which are kept by question, not by its words."));
  });

  test("the survey after an event's page draws its questions, the code's until a set is kept; a set that isn't is a sentence", async (t) => {
    clock(t);
    w.reset();
    const page = await setPageAs("zach", "event");
    for (const said of ["After an event", "How was it?", "Would you come to another?", "What should we run next?", "How did you hear about it?", "Anything we should change?", "Add a question", "Back to the original questions"]) {
      assert.ok(page.text.includes(said), `${said}\n${page.text}`);
    }
    const missing = await setPageAs("zach", "the-term");
    assert.ok(missing.text.includes("There’s no question set by that name. Back to the question sets"), missing.text);
  });
});

// ---------------------------------------------------------------------------
// 5. Never one already made
// ---------------------------------------------------------------------------

describe("5. a change reaches surveys made after it, never one already made", () => {
  test("a programme's survey keeps the words it was made with; one made after the change takes its own stage's set; a follow-up's stage has no set", async (t) => {
    clock(t);
    w.reset();
    const made = await w.make("zach", { stage: "before" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const before = made.body.survey.id;
    const itemsBefore = structuredClone(w.survey(before).items);
    assert.equal(itemsBefore.find((item) => item.id === "q_c1").title, "Which best describes you right now?");

    assert.equal((await put("zach", "before", { words: { "q_c1:title": "Which of these is most like you?", "q_c1:option:o_stage0": "I haven’t thought about it" } })).status, 200);
    assert.equal((await put("zach", "after", { words: { "q_c1:title": "Where are you now?" } })).status, 200);
    assert.equal((await put("zach", "leaving", { words: { "q_leave_why:title": "Why did you leave?" } })).status, 200);

    // Made before the change: as it was.
    assert.deepEqual(w.survey(before).items, itemsBefore, "a change to the set reached a survey already made");

    // Made after: each stage in its own set's words, in the code's shape.
    const end = await w.make("zach", { stage: "after" });
    assert.equal(end.status, 200, JSON.stringify(end.body));
    const endItems = w.survey(end.body.survey.id).items;
    assert.equal(endItems.find((item) => item.id === "q_c1").title, "Where are you now?", "the end's survey is not in the end's set's words");
    assert.equal(endItems.find((item) => item.id === "q_c1").options[0].label, "Haven’t really thought about working on AI safety", "the before set's words reached the survey at the end");
    assert.deepEqual(shapeOf(endItems), shapeOf(templates.templateItems("after", "fellowship", null)));
    const leaving = await w.make("zach", { stage: "leaving" });
    assert.equal(leaving.status, 200, JSON.stringify(leaving.body));
    assert.equal(w.survey(leaving.body.survey.id).items.find((item) => item.id === "q_leave_why").title, "Why did you leave?");

    // Back to the code's words: the set goes, and the surveys made with the set's keep them.
    assert.equal((await put("zach", "leaving", { words: { "q_leave_why:title": "What made you leave?" } })).status, 200);
    assert.equal(stored("leaving"), null);
    assert.equal(w.survey(leaving.body.survey.id).items.find((item) => item.id === "q_leave_why").title, "Why did you leave?", "putting the set back reached a survey already made");
  });

  test("the before survey made after its set changed asks in the set's words, and in nothing but words", async (t) => {
    clock(t);
    w.reset();
    assert.equal((await put("zach", "before", { words: { "q_c1:title": "Which of these is most like you?", "q_c1:option:o_stage0": "I haven’t thought about it" } })).status, 200);
    const made = await w.make("zach", { stage: "before" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const read = w.survey(made.body.survey.id).items;
    const c1 = read.find((item) => item.id === "q_c1");
    assert.deepEqual([c1.title, c1.options[0].label], ["Which of these is most like you?", "I haven’t thought about it"]);
    assert.deepEqual(shapeOf(read), shapeOf(templates.templateItems("before", "fellowship", null)));
    // Its intro counts its questions as the code's template does: a set changes no number.
    assert.equal(w.survey(made.body.survey.id).intro, w.lib.words.introFor("before", 14, templates.templateMinutes("before")));
  });
});

// ---------------------------------------------------------------------------
// 6. The tree
// ---------------------------------------------------------------------------

/** Every source file under `src`, repo-relative, with its comments taken out. */
const SOURCES = [...walkSource(SRC)].map((file) => [relative(REPO_ROOT, file).split("\\").join("/"), readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1")]);
const filesCalling = (pattern) => SOURCES.filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();

describe("6. the tree: every survey made from a template reads its set, and nothing else makes one from the code's", () => {
  test("the code's templates are called only where a set is read over them, or for what no set changes", () => {
    const SETS = ["src/lib/surveys/questionSets.ts", "src/lib/surveys/questionSetsStore.ts"];
    const CALLERS = new Map([
      [/\btemplateItems\(/, new Map([
        ["src/lib/surveys/templates.ts", "where the templates are written"],
        ...SETS.map((file) => [file, "the question sets: the code's template, with its set's words over it"]),
        ["src/app/(app)/admin/(admin-only)/surveys/new/page.tsx", "New survey's cards count each stage's questions: a set changes their words, never how many"],
      ])],
      [/\beventTemplateItems\(/, new Map([
        ["src/lib/surveys/events/template.ts", "where the standard questions are written"],
        ["src/lib/surveys/questionSets.ts", "the question set: the code's set, read when nothing is stored, and the one a save is told apart from"],
        ["src/lib/surveys/events/after.ts", "the kinds the code's questions keep for good, which no set changes"],
        ["src/app/(app)/events/manage/[id]/page.tsx", "the editor's step falls back to the code's when the set can't be read; publishing reads the set again"],
        ["src/app/(app)/admin/(admin-only)/surveys/new/page.tsx", "After a social's size on a copy of the site with no database"],
        ["src/app/(app)/admin/(admin-only)/surveys/question-sets/[kind]/page.tsx", "the set's page: the code's set, for Back to the original questions"],
      ])],
      [/\bcheckInItems\(/, new Map([
        ["src/lib/surveys/checkIns/template.ts", "where the check-in's questions are written"],
        ...SETS.map((file) => [file, "the question set: the check-in's questions for its week, with the set's words over them"]),
      ])],
    ]);
    for (const [pattern, reasons] of CALLERS) {
      assert.deepEqual(filesCalling(pattern), [...reasons.keys()].sort(), `${pattern}: a file makes questions from the code's template. Read its set through ./questionSetsStore.ts, or list it here with why no set applies.`);
      for (const [file, why] of reasons) assert.ok(why.length > 20, `${file} carries its reason`);
    }
  });

  test("every survey made from a template is made through a set's reader, and each reader has these callers alone", () => {
    const READERS = new Map([
      ["programmeTemplateItems", ["src/lib/surveys/create.ts"]],
      ["eventStandardItems", [
        "src/app/(app)/admin/(admin-only)/surveys/new/page.tsx",
        "src/app/(app)/events/manage/[id]/page.tsx",
        "src/lib/surveys/events/afterView.ts",
        "src/lib/surveys/events/create.ts",
        "src/lib/surveys/events/setUp.ts",
      ]],
      ["checkInSetItems", ["src/lib/surveys/checkIns/open.ts"]],
      ["sessionReportWords", ["src/lib/courses/sessionReports/page.ts"]],
    ]);
    for (const [reader, callers] of READERS) {
      const found = filesCalling(new RegExp(`\\b${reader}\\(`)).filter((file) => file !== "src/lib/surveys/questionSetsStore.ts");
      assert.deepEqual(found, [...callers].sort(), `${reader}`);
    }
    // The makers themselves, read: each takes its questions from its reader.
    const source = (file) => SOURCES.find(([path]) => path === file)[1];
    assert.match(source("src/lib/surveys/create.ts"), /const items = await programmeTemplateItems\(db, input\.stage, programme\.kind, strand\);/);
    assert.match(source("src/lib/surveys/checkIns/open.ts"), /const items = await checkInSetItems\(db, week\);/);
    assert.match(source("src/lib/surveys/events/create.ts"), /const items = await eventStandardItems\(db\);/);
    assert.match(source("src/lib/surveys/events/setUp.ts"), /const standard = await eventStandardItems\(db\);\s*const settings = settingsOf\(setting, standard\);/);
    // The session report's form asks in the words it is handed, never the code's own.
    const form = source("src/features/courses/report/SessionReportForm.tsx");
    assert.ok(!/REPORT_WORDS\.(?:how|howLow|howHigh|wentWell|didnt|unclear|somethingElse|engaged|notRead|needsHand)\b/.test(form), "the report's form asks a question in the code's words");
    for (const key of Object.keys(reportWords.REPORT_QUESTION_WORDS)) assert.ok(form.includes(`{questions.${key}}`), `the report's form doesn't ask ${key} in the set's words`);
    // The set's page warns beside the question This term in numbers reads, by that reader's own id.
    assert.match(source("src/lib/surveys/term/load.ts"), new RegExp(`const HOW_WAS_IT = "${sets.HOW_WAS_IT_ID}";`));
    assert.ok(CODE_EVENT().some((item) => item.id === sets.HOW_WAS_IT_ID), "the code's set no longer asks the question This term in numbers reads");
  });

  test("only the record's own modules name the collection, and only the route keeps a set", () => {
    assert.deepEqual(filesCalling(/\bSURVEY_QUESTION_SETS_COLLECTION\b|["'`]surveyQuestionSets["'`]/), [
      "src/lib/firestore/surveyQuestionSets.ts",
      "src/lib/surveys/questionSetsStore.ts",
    ]);
    assert.deepEqual(filesCalling(/\bsaveQuestionSet\(/), ["src/app/api/surveys/question-sets/[kind]/route.ts", "src/lib/surveys/questionSetsStore.ts"]);
    const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");
    assert.match(rules, /match \/surveyQuestionSets\/\{kind\} \{\s*allow read, write: if false;\s*\}/);
  });
});
