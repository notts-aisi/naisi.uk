/**
 * The words a question had when it was answered, ON THE PAGES: under a
 * person's own reflection and written answer on their week page ("You
 * answered an earlier wording:"), and under the answer on the pages of the
 * people who read it ("The question when this was written:"): the page of
 * one question across a group on the lead's side and on the facilitator's
 * (where the written answer's review page and the reflections with names now
 * forward), and a person's coursework page. Nothing when the words
 * are the same, and nothing where a reader is told only that an answer is
 * started (before the person's session).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The staff pages are drawn for real with `tests/lib/weeksTabWorld.mjs`
 * (week 3 of AGI Strategy's run, written as blocks and published, Tue 17 Nov
 * 2026 at noon; Group B meets at 6pm that evening). The lead rewords the
 * week's first reflection prompt and its written answer's question through
 * the block route, as the Weeks page does; the history it writes is what the
 * loaders read. The person's own boxes are the week page's renderers, drawn
 * with what their rows' route hands them.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, B, NOW, ROUND, RUN, makeWeeksTabWorld } from "./lib/weeksTabWorld.mjs";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeeksTabWorld("__wordsThenPages");
const { world, draw, call, courseRoute, loadTs } = w;
const model = await loadTs(join("lib", "courses", "weekEdit", "model.ts"));
const wordsThen = await loadTs(join("lib", "courses", "weekEdit", "wordsThen.ts"));
const blockRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks", "[blockId]");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const page = async (...parts) => (await loadTs(join(...parts))).default;
// The older pages' addresses, which now forward, and the pages they forward to.
const WrittenPage = await page(PROGRAMME, "written", "page.tsx");
const LeadReflections = await page(PROGRAMME, "reflections", "page.tsx");
const CourseworkPerson = await page(PROGRAMME, "coursework", "[uid]", "page.tsx");
const FacilitatorNames = await page("app", "(app)", "learn", "[runId]", "group", "[groupId]", "reflections", "names", "page.tsx");
const LeadQuestion = await page(PROGRAMME, "question", "page.tsx");
const GroupQuestion = await page("app", "(app)", "learn", "[runId]", "group", "[groupId]", "question", "page.tsx");
const { default: ReflectStop } = await loadTs(join("features", "courses", "weekBlocks", "ReflectStop.tsx"));
const { default: WrittenAnswerCard } = await loadTs(join("features", "courses", "weekBlocks", "WrittenAnswerCard.tsx"));

const OWN = "You answered an earlier wording:";
const STAFF = "The question when this was written:";
const OLD_PROMPT = "Pick a question you care about. What is its base rate?";
const NEW_PROMPT = "What is the base rate of the question you picked?";
const OLD_QUESTION = "Will your pack’s question come true by next year?";
const NEW_QUESTION = "Will your pack’s question come true within a year?";
const CHLOE_REFLECTION = "About one in five, from the pack.";
const CHLOE_ANSWER = "Sixty percent, for three reasons from my pack.";
const T_WROTE = new Date("2026-11-12T10:00:00Z");
const AT = { runId: RUN.agi, weekId: "w03" };

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  seedChloeAndKofi();
});

/** Chloe has written the first reflection and sent the written answer; Kofi has started his and not sent it. */
function seedChloeAndKofi() {
  world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__rp-1`, {
    runId: RUN.agi,
    uid: "chloe",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "rp-1",
    kind: "reflection",
    responseType: "text",
    text: CHLOE_REFLECTION,
    submittedAt: null,
    reviewStatus: "unreviewed",
    firstWrittenAt: T_WROTE,
    updatedAt: T_WROTE,
  });
  world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__wa-1`, {
    runId: RUN.agi,
    uid: "chloe",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "wa-1",
    responseType: "text",
    text: CHLOE_ANSWER,
    words: 8,
    firstWrittenAt: T_WROTE,
    updatedAt: T_WROTE,
    firstSentAt: T_WROTE,
    sentAt: T_WROTE,
    submittedAt: T_WROTE,
    reviewStatus: "unreviewed",
  });
  world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__wa-1`, {
    runId: RUN.agi,
    uid: "kofi",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "wa-1",
    responseType: "text",
    text: "A start, not sent yet.",
    words: 5,
    firstWrittenAt: T_WROTE,
    updatedAt: T_WROTE,
    submittedAt: null,
    reviewStatus: "unreviewed",
  });
}

/** The lead changes one block where it stands, as the Weeks page's side panel does. */
async function reword(blockId, fields) {
  const stored = world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
  const located = model.locateBlock(stored?.blocks ?? syntheticWeekBlocks(), blockId);
  assert.ok(located, blockId);
  const saved = await call("claudia", blockRoute.PATCH, { ...AT, blockId }, { body: { base: model.blockFingerprint(located.block), fields }, course: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

const rewordPrompt = () =>
  reword("rs-1", { prompts: [{ id: "rp-1", text: NEW_PROMPT }, { id: "rp-2", text: "What makes your case different from the base rate?" }] });

async function rewordQuestion() {
  const { fields } = model.editorFieldsOf(model.locateBlock(syntheticWeekBlocks(), "wa-1"));
  assert.ok(fields.question.includes(OLD_QUESTION), fields.question);
  await reword("wa-1", { question: fields.question.replace(OLD_QUESTION, NEW_QUESTION) });
}

/** The words right after a label, up to the next label or the end of the region. */
function after(text, label) {
  const at = text.indexOf(label);
  return at < 0 ? null : text.slice(at + label.length, at + label.length + 200);
}

// ---------------------------------------------------------------------------
// 1. The words, and when there are none
// ---------------------------------------------------------------------------

describe("1. what a page shows beside an answer", () => {
  test("the earlier words of a prompt or a question, only when they differ from today's", () => {
    const { earlierQuestionWords } = wordsThen;
    assert.equal(earlierQuestionWords({ kind: "prompt", text: OLD_PROMPT }, NEW_PROMPT), OLD_PROMPT);
    assert.equal(earlierQuestionWords({ kind: "prompt", text: `${NEW_PROMPT} ` }, NEW_PROMPT), null, "the same words");
    assert.equal(earlierQuestionWords(null, NEW_PROMPT), null);
    assert.equal(earlierQuestionWords(undefined, NEW_PROMPT), null);
    const then = { kind: "writtenAnswer", question: OLD_QUESTION, words: { min: 200, max: 300 }, due: "dayBefore" };
    assert.equal(earlierQuestionWords(then, NEW_QUESTION), OLD_QUESTION);
    assert.equal(earlierQuestionWords({ ...then, words: { min: 250, max: 400 } }, OLD_QUESTION), null, "a range changed alone: the question reads as it did");
    assert.equal(wordsThen.YOU_ANSWERED_AN_EARLIER_WORDING, OWN);
    assert.equal(wordsThen.THE_QUESTION_WHEN_WRITTEN, STAFF);
  });
});

// ---------------------------------------------------------------------------
// 2. The person's own week page
// ---------------------------------------------------------------------------

describe("2. the person's own week page: under their own words", () => {
  const reflection = () => syntheticWeekBlocks().flatMap((b) => (b.type === "part" ? b.blocks : [b])).find((b) => b.id === "rs-1");
  const answer = () => syntheticWeekBlocks().flatMap((b) => (b.type === "part" ? b.blocks : [b])).find((b) => b.id === "wa-1");
  const row = (exerciseId, extra = {}) => ({
    id: `${RUN.agi}__chloe__w03__${exerciseId}`,
    weekId: "w03",
    weekNumber: 3,
    exerciseId,
    responseType: "text",
    text: null,
    linkUrl: null,
    submittedAt: null,
    reviewStatus: "unreviewed",
    reviewerName: null,
    reviewerComment: null,
    reviewedAt: null,
    ...extra,
  });
  const noDue = { at: null, by: "no-group" };

  function drawReflection(rows, askedThen) {
    const block = { ...reflection(), prompts: [{ id: "rp-1", text: NEW_PROMPT }, ...reflection().prompts.slice(1)] };
    return renderToStaticMarkup(
      createElement(ReflectStop, {
        block,
        runId: RUN.agi,
        weekId: "w03",
        rows: new Map(rows.map((r) => [r.exerciseId, r])),
        loaded: true,
        loading: false,
        onRetry: () => {},
        ownBoxes: true,
        canWrite: true,
        readers: null,
        due: noDue,
        now: NOW,
        askedThen,
        onSaved: () => {},
      }),
    );
  }

  function drawAnswer(stored, askedThen) {
    const block = answer();
    return renderToStaticMarkup(
      createElement(WrittenAnswerCard, {
        block,
        runId: RUN.agi,
        weekId: "w03",
        weekNumber: 3,
        row: stored,
        loaded: true,
        loading: false,
        onRetry: () => {},
        ownBox: true,
        canWrite: true,
        readers: { kind: "facilitators", names: ["Rahul"] },
        leadName: "Claudia",
        feedback: null,
        dueDay: null,
        dayBeforeTime: null,
        first: true,
        todayKey: "2026-11-17",
        due: noDue,
        rest: null,
        askedThen,
        onSaved: () => {},
      }),
    );
  }

  test("a reflection: the earlier prompt under their words, and nothing without earlier words or without words of theirs", () => {
    const written = row("rp-1", { kind: "reflection", text: CHLOE_REFLECTION, savedAt: T_WROTE.toISOString() });
    const html = drawReflection([written], { "rp-1": { kind: "prompt", text: OLD_PROMPT } });
    assert.ok(html.includes(OWN), "the label");
    assert.ok(html.includes(OLD_PROMPT), "the earlier words");
    assert.ok(html.indexOf(OWN) > html.indexOf("<textarea"), "under their own words");
    assert.equal(drawReflection([written], {}).includes(OWN), false, "no earlier words: nothing");
    assert.equal(drawReflection([written], undefined).includes(OWN), false, "nothing handed: nothing");
    assert.equal(drawReflection([], { "rp-1": { kind: "prompt", text: OLD_PROMPT } }).includes(OWN), false, "nothing written: nothing");
    assert.equal(drawReflection([written], { "rp-1": { kind: "prompt", text: NEW_PROMPT } }).includes(OWN), false, "the same words: nothing");
  });

  test("a written answer: the earlier question under their answer; a range changed alone, or nothing written, shows nothing", () => {
    const sentAt = T_WROTE.toISOString();
    const written = row("wa-1", {
      text: CHLOE_ANSWER,
      submittedAt: sentAt,
      written: { boxes: null, words: 8, firstSentAt: sentAt, sentAt, editedAt: null, savedAt: sentAt, opened: null, reopened: null, feedback: null },
    });
    const then = { kind: "writtenAnswer", question: "Will it happen by next spring?", words: { min: 200, max: 300 }, due: "dayBefore" };
    const html = drawAnswer(written, then);
    assert.ok(html.includes(OWN), "the label");
    assert.ok(html.includes("Will it happen by next spring?"), "the earlier words");
    assert.ok(html.indexOf(OWN) > html.indexOf("<textarea"), "under their answer");
    assert.equal(drawAnswer(written, null).includes(OWN), false, "no earlier words: nothing");
    const sameQuestion = { ...then, question: wordsThen.askedOf([answer()])["wa-1"].question, words: { min: 100, max: 200 } };
    assert.equal(drawAnswer(written, sameQuestion).includes(OWN), false, "the question's words the same: nothing");
    assert.equal(drawAnswer(null, then).includes(OWN), false, "nothing written: nothing");
  });
});

// ---------------------------------------------------------------------------
// 3. The pages of the people who read it
// ---------------------------------------------------------------------------

describe("3. the staff pages: under the answer", () => {
  test("one question across the group, at the written answer (where the review page's address forwards): the question when it was written, only once it was reworded", async () => {
    const at = { roundId: ROUND, programmeId: AGI };
    // The review page's address for a group's answers forwards here.
    assert.equal((await draw("claudia", WrittenPage, at, { searchParams: { group: B, week: "3" } })).to, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/question?group=${B}&week=3&first=answer`);
    const query = { searchParams: { group: B, week: "3", first: "answer" } };
    const before = await draw("claudia", LeadQuestion, at, query);
    assert.equal(before.to, null);
    assert.ok(before.text.includes(CHLOE_ANSWER), "the answer is shown");
    assert.equal(before.text.includes(STAFF), false, "never reworded: nothing");
    await rewordQuestion();
    const { text } = await draw("claudia", LeadQuestion, at, query);
    assert.ok(text.includes(NEW_QUESTION), "the question as it is now, above");
    assert.match(after(text, STAFF) ?? "", new RegExp(`^ ${OLD_QUESTION}`), "the question then, under the answer");
    assert.ok(text.indexOf(STAFF) > text.indexOf(CHLOE_ANSWER), "under the answer");
    // Kofi's answer, started and not sent before the session, is shown not at all, and nothing beside it.
    assert.equal(text.split(STAFF).length - 1, 1, "beside an answer the page does not show");
  });

  test("one question across the group: a range changed alone shows nothing", async () => {
    await reword("wa-1", { words: { min: 250, max: 400 } });
    const { text } = await draw("claudia", LeadQuestion, { roundId: ROUND, programmeId: AGI }, { searchParams: { group: B, week: "3", first: "answer" } });
    assert.ok(text.includes(CHLOE_ANSWER));
    assert.equal(text.includes(STAFF), false);
  });

  test("the reflections with names (one question across the group, where the older pages forward), on the lead's side and on the facilitator's", async () => {
    assert.equal((await draw("claudia", LeadReflections, { roundId: ROUND, programmeId: AGI }, { searchParams: { group: B, week: "3" } })).to, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/question?group=${B}&week=3&first=reflection`);
    assert.equal((await draw("rahul", FacilitatorNames, { runId: RUN.agi, groupId: B }, { searchParams: { week: "3" } })).to, `/learn/${RUN.agi}/group/${B}/question?week=3&first=reflection`);
    const lead = () => draw("claudia", LeadQuestion, { roundId: ROUND, programmeId: AGI }, { searchParams: { group: B, week: "3", question: "rp-1" } });
    const facilitator = () => draw("rahul", GroupQuestion, { runId: RUN.agi, groupId: B }, { searchParams: { week: "3", question: "rp-1" } });
    for (const drawn of [await lead(), await facilitator()]) {
      assert.equal(drawn.to, null);
      assert.ok(drawn.text.includes(CHLOE_REFLECTION), "the reflection is shown");
      assert.equal(drawn.text.includes(STAFF), false, "never reworded: nothing");
    }
    await rewordPrompt();
    for (const [who, drawn] of [["the lead", await lead()], ["the facilitator", await facilitator()]]) {
      assert.ok(drawn.text.includes(NEW_PROMPT), `${who}: the prompt as it is now`);
      assert.match(after(drawn.text, STAFF) ?? "", new RegExp(`^ ${OLD_PROMPT}`), `${who}: the prompt then`);
      assert.ok(drawn.text.indexOf(STAFF) > drawn.text.indexOf(CHLOE_REFLECTION), `${who}: under the reflection`);
      assert.equal(drawn.text.split(STAFF).length - 1, 1, `${who}: once, beside the one reflection written to it`);
    }
  });

  test("a person's coursework page: under the reflection and under the written answer", async () => {
    const at = { roundId: ROUND, programmeId: AGI, uid: "chloe" };
    const before = await draw("claudia", CourseworkPerson, at);
    assert.equal(before.to, null);
    assert.ok(before.text.includes(CHLOE_ANSWER) && before.text.includes(CHLOE_REFLECTION));
    assert.equal(before.text.includes(STAFF), false, "never reworded: nothing");
    await rewordPrompt();
    await rewordQuestion();
    const { text } = await draw("claudia", CourseworkPerson, at);
    assert.equal(text.split(STAFF).length - 1, 2, "one under the reflection, one under the answer");
    assert.match(after(text, STAFF) ?? "", new RegExp(`^ ${OLD_PROMPT}`));
    assert.ok(text.indexOf(OLD_PROMPT) > text.indexOf(CHLOE_REFLECTION));
    assert.ok(text.lastIndexOf(STAFF) > text.indexOf(CHLOE_ANSWER), "under the answer");
    assert.ok(text.includes(OLD_QUESTION));
  });

  test("an answer the page says only is started (unsent, before the session) shows nothing beside it, and its loader hands nothing", async () => {
    await rewordQuestion();
    const drawn = await draw("claudia", CourseworkPerson, { roundId: ROUND, programmeId: AGI, uid: "kofi" });
    assert.equal(drawn.to, null);
    assert.equal(drawn.text.includes("A start, not sent yet."), false, "his words are not shown");
    assert.equal(drawn.text.includes(STAFF), false, "and nothing is said beside them");
    assert.equal(drawn.text.includes(OLD_QUESTION), false);
    // The loader itself: nothing handed for the started answer, and both for Chloe's shown words.
    await rewordPrompt();
    const { loadPersonCoursework } = await loadTs(join("lib", "courses", "coursework", "load.ts"));
    world.course = true;
    try {
      const kofi = await loadPersonCoursework(world.courseDb, w.sessionFor("claudia"), ROUND, AGI, "kofi");
      assert.equal(kofi.status, "ok", JSON.stringify(kofi.status));
      assert.deepEqual(kofi.view.askedThen, {}, "the started answer: nothing");
      const chloe = await loadPersonCoursework(world.courseDb, w.sessionFor("claudia"), ROUND, AGI, "chloe");
      assert.deepEqual(Object.keys(chloe.view.askedThen).sort(), ["3 rp-1", "3 wa-1"]);
      assert.deepEqual(chloe.view.askedThen["3 rp-1"], { kind: "prompt", text: OLD_PROMPT });
    } finally {
      world.course = false;
    }
  });
});
