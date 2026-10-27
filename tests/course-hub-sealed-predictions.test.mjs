/**
 * Sealed predictions (Zach's extra (d)): a course's credence card as a
 * record, each person's first card filled in and sealed in the week it is
 * sealed in, shut to everybody but admins until the week it opens in has
 * opened to their group, and opened there beside the same questions asked
 * again; an admin opening one, the opening recorded first; deletion and the
 * run's destroy.
 *
 * Driven through the real routes (the course's card, the person's own card,
 * the admins' list and opening), the week page's real server shell and the
 * real pages, as every kind of caller: Chloe and Kofi, placed in Group B and
 * told; Farah, placed in Group B and facilitating it too; Amara, in Group A;
 * Una, placed and not told; Sam, who left; Omar, taken off; Rahul, who
 * facilitates Group B; Sofia, who facilitates Groups A and B; Grace, who
 * facilitates Group D; Claudia, the programme's lead; Tess, who leads
 * another; Yusuf, the run's track lead; Zach, an admin; Nobody, on nothing;
 * a view-as session; and somebody signed out.
 *
 *  1. The card as the course's record: read as printed, written back out,
 *     refused when it cannot be read whole, saved by admins only.
 *  2. Week 1: the owner fills it in and seals it; sealed, nothing changes it
 *     and nothing hands it back.
 *  3. Whose card: everybody's own, nobody else's.
 *  4. Week 6: fresh answers first, then the sealed card beside them.
 *  5. Admins: who has a card, never an answer; an opening recorded first.
 *  6. Deletion and the run's destroy.
 *  7. The tree: who reads and writes the records, and where the card goes.
 *
 * Every word on the card is made up; every address is on example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { CARD_TEXT, COURSE, RUN, STORED_CARD, makeCardEditorRenderer, makeSealedWorld, recordPath } from "./lib/sealedPredictionsWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

/** Tue 17 Nov 2026 at noon in London: week 3. */
const NOW = "2026-11-17T12:00:00Z";
/** Group B's week 5 session ends at 8pm on Tue 1 Dec: week 6 opens to it then. */
const BEFORE_B = "2026-12-01T19:59:00Z";
const AFTER_B = "2026-12-01T20:01:00Z";
/** Group A's week 5 session ends at 8pm on Thu 26 Nov. */
const BEFORE_A = "2026-11-26T19:59:00Z";
const AFTER_A = "2026-11-26T20:01:00Z";

mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

const w = await makeSealedWorld();
const drawEditor = await makeCardEditorRenderer();

beforeEach(() => {
  at(NOW);
  w.reset();
});

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const found = text.indexOf(phrase, from);
    assert.ok(found >= 0, `missing, or out of order: "${phrase}"`);
    from = found + phrase.length;
  }
}

const short = (response) => [response.status, response.body?.error ?? null];

/** `who` answers every question on their first card. */
async function fillStart(who, answers = { q1: 35, q2: 7, q3: 60, q4: "The north light." }) {
  for (const [questionId, value] of Object.entries(answers)) {
    const answer = await w.answer(who, "start", questionId, value);
    assert.equal(answer.status, 200, `${who} ${questionId}: ${JSON.stringify(answer.body)}`);
  }
}

/** `who` answers every question again on their second card. */
async function fillNow(who, answers = { q1: 60, q2: 5, q3: 60, q4: "The harbour light." }) {
  for (const [questionId, value] of Object.entries(answers)) {
    const answer = await w.answer(who, "now", questionId, value);
    assert.equal(answer.status, 200, `${who} ${questionId}: ${JSON.stringify(answer.body)}`);
  }
}

/** Every value a person typed on a card, as the page would draw it. */
const STARTS = ["35%", "The north light."];

// ---------------------------------------------------------------------------
// 1. The card as the course's record
// ---------------------------------------------------------------------------

describe("1. the card as the course's record", () => {
  test("a card pasted as printed reads as its heading, its line, and four questions of three kinds", () => {
    const { card, problems } = w.lib.cardText.readPredictionCardText(CARD_TEXT, { sealWeek: 1, openWeek: 6 });
    assert.deepEqual(problems, []);
    assert.deepEqual(card, {
      title: "MY LAMP CARD (sealed until week 6)",
      intro: "Put a number on each, from 0% to 100%.",
      sealWeek: 1,
      openWeek: 6,
      questions: STORED_CARD.questions.map((question, index) => ({ id: `q${index + 1}`, ...question })),
    });
  });

  test("written back out, it reads back as the same card", () => {
    const { card } = w.lib.cardText.readPredictionCardText(CARD_TEXT, { sealWeek: 1, openWeek: 6 });
    const again = w.lib.cardText.readPredictionCardText(w.lib.cardText.predictionCardToText(card), { sealWeek: 1, openWeek: 6 });
    assert.deepEqual(again, { card, problems: [] });
    assert.equal(w.lib.cardText.foundWords(card.questions), "4 questions: 2 percentages, 1 number on a scale and 1 sentence");
  });

  test("what cannot be read whole is a problem with its sentence, never cut short", () => {
    const { readPredictionCardText } = w.lib.cardText;
    const weeks = { sealWeek: 1, openWeek: 6 };
    const problems = (text, given = weeks) => readPredictionCardText(text, given).problems;
    assert.match(problems("HEAD\n\n1. A question with no blank and no colon.")[0], /^Question 1 doesn’t say how it’s answered/);
    assert.match(problems("HEAD\n\n1. A scale with no ends. ____")[0], /^Question 1 ends in a blank with no % sign/);
    assert.match(problems("HEAD\n\nA line.\n\n1. One. ____%\n\nAnother line that asks nothing.")[0], /is neither a question nor the line under the heading/);
    assert.deepEqual(problems("HEAD (sealed until week 5)\n\n1. One. ____%"), [
      "The heading says the card is sealed until week 5, and it opens in week 6: make them the same.",
    ]);
    assert.deepEqual(problems("HEAD\n\n1. One. ____%", { sealWeek: 6, openWeek: 6 }), ["The card has to open in a later week than the one it’s sealed in."]);
    assert.deepEqual(problems("HEAD\n\n1. One. ____%", { sealWeek: null, openWeek: 6 }), ["Say the week the card is filled in and sealed in."]);
    assert.deepEqual(problems("HEAD\n\n1. One. ____%", { sealWeek: 1, openWeek: "6" }), ["Say the week the card opens in."]);
    assert.deepEqual(problems("1. One. ____%"), ["Start with the card’s heading, as printed."]);
    const many = Array.from({ length: 13 }, (_, i) => `${i + 1}. Question. ____%`).join("\n\n");
    assert.deepEqual(problems(`HEAD\n\n${many}`), ["There are 13 questions; the most is 12."]);
    assert.deepEqual(problems(`HEAD\n\n1. ${"Long ".repeat(90)}____%`), ["Question 1 is longer than 400 characters."]);
    assert.deepEqual(problems("HEAD\n\n1. A scale. (0 = none, 101 = all) ____"), ["Question 1’s scale has to run from 0 to a whole number up to 100."]);
    assert.deepEqual(readPredictionCardText("", weeks), { card: null, problems: ["There’s nothing in that to read."] });
    assert.deepEqual(readPredictionCardText("x".repeat(8001), weeks).problems, ["That’s too long for a card: keep it under 8000 characters."]);
  });

  test("a stored card is read back inside its shape, or as none", () => {
    const { normalizePredictionCard, normalizePredictionQuestions } = w.lib.model;
    assert.equal(normalizePredictionCard({ ...STORED_CARD, sealWeek: 6, openWeek: 6 }), null);
    assert.equal(normalizePredictionCard({ ...STORED_CARD, openWeek: 61 }), null);
    assert.equal(normalizePredictionCard({ ...STORED_CARD, questions: [] }), null);
    assert.equal(normalizePredictionCard(null), null);
    // A question that cannot be read whole is left out, and the ones after it keep their ids.
    const read = normalizePredictionQuestions({ ...STORED_CARD, questions: [{ kind: "riddle", statement: "?" }, ...STORED_CARD.questions] });
    assert.deepEqual(read.questions.map((question) => question.id), ["q2", "q3", "q4", "q5"]);
  });

  test("an admin reads and saves a card; it is stored field by field, and taken off again", async () => {
    w.reset({ card: false });
    const body = { text: CARD_TEXT, sealWeek: 1, openWeek: 6 };
    const readIt = await w.readCard("zach", body);
    assert.equal(readIt.status, 200);
    assert.deepEqual(readIt.body.problems, []);
    assert.equal(readIt.body.card.questions.length, 4);
    // Reading writes nothing.
    assert.equal(w.world.db.read(`courses/${COURSE.agi}`).predictionCard, undefined);
    const saved = await w.saveCard("zach", { ...body, stray: "kept out" });
    assert.equal(saved.status, 200);
    const stored = w.world.db.read(`courses/${COURSE.agi}`).predictionCard;
    assert.deepEqual(stored, STORED_CARD);
    const removed = await w.saveCard("zach", { remove: true });
    assert.equal(removed.status, 200);
    assert.equal(w.world.db.read(`courses/${COURSE.agi}`).predictionCard, null);
  });

  test("a card with a problem is not saved, and says why", async () => {
    w.reset({ card: false });
    const refused = await w.saveCard("zach", { text: "HEAD\n\n1. No way to answer.", sealWeek: 1, openWeek: 6 });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /^Question 1 doesn’t say how it’s answered/);
    assert.equal(w.world.db.read(`courses/${COURSE.agi}`).predictionCard, undefined);
    assert.deepEqual(short(await w.saveCard("zach", {})), [400, "Send the card as text, with the week it’s sealed in and the week it opens in."]);
  });

  test("the course editor's card shows the card to anybody who opens the course, and its box and weeks to an admin alone", () => {
    const stored = w.lib.model.normalizePredictionCard(STORED_CARD);
    const admin = drawEditor("admin", { courseId: COURSE.agi, stored });
    inOrder(admin.text, [
      "Sealed predictions",
      "MY LAMP CARD (sealed until week 6)",
      "Put a number on each, from 0% to 100%.",
      "1.",
      "By 2035, most lighthouses will run with no keeper on the island.",
      "0 to 100%",
      "How hard is it to keep a lamp lit through a winter storm?",
      "0 = calm work, 10 = hopeless",
      "The lamp I'd most like to tend, if I chose today:",
      "A sentence",
      "Sealed in week 1, opened in week 6.",
      "Filled in and sealed in week",
      "Opens in week",
      "The card, as printed",
      "Read it",
      "Save the card",
      "Take it off",
    ]);
    // Each box has its label.
    for (const label of ["Filled in and sealed in week", "Opens in week", "The card, as printed"]) {
      const id = new RegExp(`<label for="([^"]+)"[^>]*>${label}</label>`).exec(admin.html)?.[1];
      assert.ok(id && admin.html.includes(`id="${id}"`), label);
    }
    // The box holds the card written back out, which reads back as the same card.
    const box = /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(admin.html)[1].replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
    assert.deepEqual(w.lib.cardText.readPredictionCardText(box, { sealWeek: 1, openWeek: 6 }).card, stored);
    for (const role of ["committee", "member", null]) {
      const other = drawEditor(role, { courseId: COURSE.agi, stored });
      assert.match(other.text, /By 2035, most lighthouses will run with no keeper on the island\./);
      assert.match(other.text, /Only an admin can change the card\./);
      assert.ok(!other.html.includes("<textarea") && !other.html.includes("<input"), String(role));
    }
    assert.match(drawEditor("admin", { courseId: COURSE.agi, stored: null }).text, /This course has no card yet\./);
  });

  test("nobody but an admin reads or saves a course's card: the lead, a facilitator, a fellow, signed out, view-as", async () => {
    const body = { text: CARD_TEXT, sealWeek: 1, openWeek: 6 };
    for (const who of ["claudia", "tess", "yusuf", "rahul", "farah", "chloe", "nobody"]) {
      assert.deepEqual(short(await w.readCard(who, body)), [403, "Only an admin can change a course’s predictions card."], who);
      assert.deepEqual(short(await w.saveCard(who, body)), [403, "Only an admin can change a course’s predictions card."], who);
    }
    assert.equal((await w.saveCard(null, body)).status, 401);
    const viewAs = await w.call("zach", w.routes.courseCard.PUT, { courseId: COURSE.agi }, { course: true, body, viewAs: true });
    assert.equal(viewAs.status, 403);
    assert.deepEqual(w.world.db.read(`courses/${COURSE.agi}`).predictionCard, STORED_CARD);
  });
});

// ---------------------------------------------------------------------------
// 2. Week 1: the owner fills it in and seals it
// ---------------------------------------------------------------------------

describe("2. week 1: filled in, then sealed", () => {
  test("Chloe's week 1 page draws Chloe's own card after In the session, word for word", async () => {
    const { view, text } = await w.weekCard("chloe", 1);
    assert.equal(view.stage, "seal");
    assert.equal(view.canWrite, true);
    assert.equal(view.start.state, "none");
    inOrder(text, [
      "In the session",
      "Your predictions",
      "MY LAMP CARD (sealed until week 6)",
      "Answer these on your own, then seal the card. Nobody can change it after that, you included, and it stays shut until week 6, when you answer the same questions again and see what moved.",
      "Put a number on each, from 0% to 100%.",
      "Saves as you type, until you seal it.",
      "1",
      "By 2035, most lighthouses will run with no keeper on the island.",
      "%",
      "2",
      "How hard is it to keep a lamp lit through a winter storm?",
      "0 = calm work, 10 = hopeless",
      "3",
      "Somebody like me could keep a lamp lit for a whole year.",
      "The lamp I'd most like to tend, if I chose today:",
      "Seal my predictions",
      "Only you and admins can read your card. Each time an admin opens one, it’s recorded.",
      "Go further (optional)",
    ]);
  });

  test("each answer saves as it is typed, under the questions Chloe was given, kept to one decimal place", async () => {
    assert.deepEqual((await w.answer("chloe", "start", "q1", 0.25)).body, { ok: true, questionId: "q1", value: 0.3 });
    await w.answer("chloe", "start", "q4", "  The   north light.  ");
    const stored = w.record("chloe");
    assert.deepEqual(stored.start.answers, { q1: 0.3, q4: "The north light." });
    assert.equal(stored.start.sealedAt, null);
    assert.equal(stored.uid, "chloe");
    assert.equal(stored.runId, RUN.agi);
    assert.equal(stored.courseId, COURSE.agi);
    // Chloe's own copy of the questions, so a new card changes nothing already started.
    assert.deepEqual(stored.card, { title: STORED_CARD.title, intro: STORED_CARD.intro, questions: STORED_CARD.questions });
    w.world.db.poke(`courses/${COURSE.agi}`, { "predictionCard.questions": [STORED_CARD.questions[3]] });
    assert.equal((await w.answer("chloe", "start", "q2", 4)).status, 200);
    assert.equal((await w.weekCard("chloe", 1)).view.card.questions.length, 4);
    // An emptied box takes the answer away.
    await w.answer("chloe", "start", "q4", null);
    assert.deepEqual(w.record("chloe").start.answers, { q1: 0.3, q2: 4 });
  });

  test("an answer outside its question's range or kind is refused with a sentence, and nothing is stored", async () => {
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 101)), [400, "Give a percentage from 0 to 100."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q2", 11)), [400, "Give a number from 0 to 10."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q2", -1)), [400, "Give a number from 0 to 10."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", "lots")), [400, "Send your answer to that one as a number."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q4", 7)), [400, "Send your answer to that one as words."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q4", "x".repeat(301))), [400, "Keep it to one sentence: under 300 characters."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q9", 5)), [404, "That question isn’t on your card. Reload the page."]);
    assert.deepEqual(short(await w.answer("chloe", "later", "q1", 5)), [400, 'Say which card: "start" or "now".']);
    assert.deepEqual(short(await w.answer("chloe", "start", "1", 5)), [400, "Say which question, like “q1”."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", { much: 5 })), [400, "Send your answer as a number or as words, or null to take it away."]);
    assert.equal(w.record("chloe"), undefined);
  });

  test("a card with nothing on it cannot be sealed", async () => {
    assert.deepEqual(short(await w.act("chloe", "seal")), [409, "Answer at least one question before you seal your card."]);
    await w.answer("chloe", "start", "q1", 20);
    await w.answer("chloe", "start", "q1", null);
    assert.deepEqual(short(await w.act("chloe", "seal")), [409, "Answer at least one question before you seal your card."]);
  });

  test("sealed, nothing changes it, its owner's answers included, and nothing hands it back to its owner", async () => {
    await fillStart("chloe");
    const sealed = await w.act("chloe", "seal");
    assert.equal(sealed.status, 200);
    assert.equal(sealed.body.view.start.state, "sealed");
    assert.deepEqual(sealed.body.view.start.answers, {});
    assert.equal(sealed.body.view.opened, null);
    const stored = w.record("chloe");
    assert.ok(stored.start.sealedAt instanceof Date);
    assert.equal(stored.start.opensInWeek, 6);
    assert.deepEqual(stored.start.answers, { q1: 35, q2: 7, q3: 60, q4: "The north light." });
    // No route changes a sealed card, its owner's included.
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 90)), [409, "Your card is sealed, so it can’t change now."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q4", null)), [409, "Your card is sealed, so it can’t change now."]);
    assert.deepEqual(short(await w.act("chloe", "seal")), [409, "Your card is already sealed."]);
    assert.deepEqual(w.record("chloe").start.answers, stored.start.answers);
    // Chloe's week 1 page says when it was sealed and when it opens, and nothing answered on it.
    const { view, text, html } = await w.weekCard("chloe", 1);
    assert.deepEqual(view.start, { state: "sealed", answers: {}, sealedAt: "2026-11-17T12:00:00.000Z" });
    assert.match(text, /Sealed on Tue 17 Nov\. It opens in week 6, after your session on Tue 1 Dec\./);
    for (const typed of [...STARTS, "60%", ">7<"]) assert.ok(!html.includes(typed), `the sealed page shows ${typed}`);
    assert.ok(!JSON.stringify(view).includes("north light"));
    // Nor does any other week's page: only weeks 1 and 6 hold the card.
    for (const n of [2, 3]) assert.equal((await w.weekCard("chloe", n)).view, null, `week ${n}`);
  });

  test("the seal asks first, and says what sealing does and how many are blank", () => {
    const { sealConfirmWords } = w.lib.words;
    assert.equal(
      sealConfirmWords(6, 0, 4),
      "Seal your card? Nobody can change it after that, you included, and you won’t see your answers again until week 6.",
    );
    assert.equal(
      sealConfirmWords(6, 2, 4),
      "Seal your card? Nobody can change it after that, you included, and you won’t see your answers again until week 6. 2 of 4 have no answer.",
    );
  });

  test("the day it opens is said as the group's own session, tonight's on the day", () => {
    const { sealedWords, waitingWords } = w.lib.words;
    const after = { dateKey: "2026-12-01", startTimeLocal: "18:00" };
    assert.equal(sealedWords("2026-11-03T19:00:00.000Z", 6, after, "2026-11-20"), "Sealed on Tue 3 Nov. It opens in week 6, after your session on Tue 1 Dec.");
    assert.equal(sealedWords("2026-11-03T19:00:00.000Z", 6, after, "2026-12-01"), "Sealed on Tue 3 Nov. It opens in week 6, tonight, after your session.");
    assert.equal(sealedWords("2026-11-03T19:00:00.000Z", 6, null, "2026-11-20"), "Sealed on Tue 3 Nov. It opens in week 6.");
    assert.equal(waitingWords(after, "2026-11-30"), "Your sealed card opens here after your session on Tue 1 Dec.");
    assert.equal(waitingWords(null, "2026-11-30"), "Your sealed card opens here once this week opens to your group.");
  });

  test("a run with no card, or a course that took it off, shows no card and takes no answer", async () => {
    w.reset({ card: false });
    assert.equal((await w.weekCard("chloe", 1)).view, null);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 5)), [404, "This programme has no predictions card."]);
    assert.deepEqual(short(await w.act("chloe", "seal")), [404, "This programme has no predictions card."]);
  });

  test("a run being destroyed takes no answer, seal or opening", async () => {
    await fillStart("chloe");
    w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 5)), [404, "That isn’t on this programme."]);
    assert.deepEqual(short(await w.act("chloe", "seal")), [404, "That isn’t on this programme."]);
    assert.equal(w.record("chloe").start.answers.q1, 35);
  });
});

// ---------------------------------------------------------------------------
// 3. Whose card: everybody's own, and nobody else's
// ---------------------------------------------------------------------------

describe("3. whose card", () => {
  test("every write is the caller's own card: Kofi's answers make Kofi's record and touch Chloe's not at all", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    const before = JSON.stringify(w.record("chloe"));
    await fillStart("kofi", { q1: 90 });
    await w.act("kofi", "seal");
    assert.equal(JSON.stringify(w.record("chloe")), before);
    assert.deepEqual(w.record("kofi").start.answers, { q1: 90 });
    // Nothing in a request names whose card it is: the route has no uid to take.
    const route = read("app", "api", "courses", "runs", "[runId]", "predictions", "route.ts");
    assert.match(route, /predictionsRecordId\(runId, actor\.uid\)/);
    assert.doesNotMatch(stripSource(route), /body\.uid|params\.uid|\buid\s*:\s*body/);
  });

  test("a facilitator has a card of their own: Rahul (no place) and Farah (a place in the group Farah runs)", async () => {
    for (const who of ["rahul", "farah", "sofia", "grace"]) {
      await fillStart(who, { q1: 50 });
      assert.equal((await w.act(who, "seal")).status, 200, who);
      assert.equal(w.record(who).start.sealedAt instanceof Date, true, who);
    }
    // Their pages show their own cards, sealed.
    assert.equal((await w.weekCard("farah", 1)).view.start.state, "sealed");
    assert.equal((await w.weekCard("rahul", 1)).view.start.state, "sealed");
  });

  test("Farah's card is Farah's: Farah's co-facilitators, the lead and the other fellows read nothing of it, anywhere", async () => {
    await fillStart("farah", { q1: 12, q4: "The far light." });
    // The week page of each of them shows their own card or none, never Farah's.
    for (const who of ["rahul", "sofia", "chloe", "kofi"]) {
      const { view, html } = await w.weekCard(who, 1);
      assert.ok(!html.includes("The far light."), who);
      assert.ok(!JSON.stringify(view).includes("far light"), who);
    }
    // Nobody but an admin is told whose cards exist, or can open one.
    for (const who of ["rahul", "sofia", "chloe", "claudia", "tess", "yusuf", "grace", "nobody"]) {
      assert.deepEqual(short(await w.people(who)), [403, "Only an admin can open somebody’s predictions card."], who);
      assert.deepEqual(short(await w.openCard(who, "farah")), [403, "Only an admin can open somebody’s predictions card."], who);
    }
    assert.equal((await w.people(null)).status, 401);
    assert.equal((await w.openCard(null, "farah")).status, 401);
    assert.deepEqual(w.openings(), []);
  });

  test("nobody without a live, told place or a group to facilitate has a card: refused, and shown none", async () => {
    for (const who of ["una", "sam", "omar", "nobody", "claudia", "tess", "yusuf", "zach"]) {
      assert.deepEqual(short(await w.answer(who, "start", "q1", 5)), [403, "Only somebody taking part in this programme has a predictions card on it."], who);
      assert.deepEqual(short(await w.act(who, "seal")), [403, "Only somebody taking part in this programme has a predictions card on it."], who);
      assert.equal(w.record(who), undefined, who);
    }
    for (const who of ["claudia", "zach"]) assert.equal((await w.weekCard(who, 1)).view, null, who);
    assert.equal((await w.answer(null, "start", "q1", 5)).status, 401);
  });

  test("a leaver has no card even with Publish's stamp kept on their row, and a finished place keeps theirs", async () => {
    await fillStart("chloe", { q1: 30 });
    await w.act("chloe", "seal");
    // Chloe leaves; leaving keeps Publish's stamp on the row.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn" });
    assert.ok(w.world.db.read(`courseEnrolments/${RUN.agi}__chloe`).allocatedEmailAt);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 31)), [403, "Only somebody taking part in this programme has a predictions card on it."]);
    assert.equal((await w.weekCard("chloe", 1)).view, null);
    // Her card stays for admins.
    assert.equal((await w.openCard("zach", "chloe")).body.card.start.answers.q1, 30);
    // Kofi finishes the programme: the card is still Kofi's.
    await fillStart("kofi", { q1: 9 });
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { status: "completed" });
    assert.equal((await w.answer("kofi", "start", "q1", 10)).status, 200);
  });

  test("a view-as session is refused every write, and the page shows no card in it", async () => {
    await fillStart("chloe", { q1: 44 });
    assert.equal((await w.answer("chloe", "start", "q1", 5, { viewAs: true })).status, 403);
    assert.equal((await w.act("chloe", "seal", { viewAs: true })).status, 403);
    assert.equal((await w.openCard("zach", "chloe", { viewAs: true })).status, 403);
    const { view, html } = await w.weekCard("chloe", 1, { viewAs: true });
    assert.equal(view, null);
    assert.ok(!html.includes("Your predictions"));
    assert.equal(w.record("chloe").start.answers.q1, 44);
    assert.deepEqual(w.openings(), []);
  });
});

// ---------------------------------------------------------------------------
// 4. Week 6: fresh answers first, then the sealed card beside them
// ---------------------------------------------------------------------------

describe("4. week 6", () => {
  test("before week 6 opens to Chloe's group, Chloe's card stays shut: no second card, no opening, and no week 6 page", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    at(BEFORE_B);
    assert.deepEqual(short(await w.answer("chloe", "now", "q1", 10)), [409, "Week 6 isn’t open to you yet."]);
    assert.deepEqual(short(await w.act("chloe", "open")), [409, "Week 6 isn’t open to you yet."]);
    assert.equal((await w.weekCard("chloe", 6)).shell.component, "WeekNotOpen");
    // Her first card is still shut, and still shuts out a change.
    assert.deepEqual((await w.weekCard("chloe", 1)).view.start.answers, {});
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 1)), [409, "Your card is sealed, so it can’t change now."]);
  });

  test("a week that is not published opens no card, whatever the clock says", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w06`, { published: false });
    at(AFTER_B);
    assert.deepEqual(short(await w.answer("chloe", "now", "q1", 10)), [409, "Week 6 isn’t open to you yet."]);
    assert.deepEqual(short(await w.act("chloe", "open")), [409, "Week 6 isn’t open to you yet."]);
    // Her first card stays shut, and somebody else's unsealed one stays theirs to change.
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 1)), [409, "Your card is sealed, so it can’t change now."]);
    await fillStart("kofi", { q1: 5 });
    assert.equal((await w.answer("kofi", "start", "q1", 6)).status, 200);
    assert.equal((await w.act("kofi", "seal")).status, 200);
  });

  test("a facilitator reading week 1 before it is published is told the card opens with the week", async () => {
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w01`, { published: false });
    const { view, text } = await w.weekCard("rahul", 1);
    assert.equal(view.canWrite, false);
    assert.equal(view.start.state, "none");
    assert.match(text, /You can fill in this card once week 1 is open to you\./);
    assert.deepEqual(short(await w.answer("rahul", "start", "q1", 5)), [409, "Week 1 isn’t open to you yet."]);
  });

  test("a facilitator reads week 6 early, and their own card waits for their group", async () => {
    await fillStart("rahul", { q1: 30 });
    await w.act("rahul", "seal");
    at(BEFORE_B);
    const { view, text, html } = await w.weekCard("rahul", 6);
    assert.equal(view.stage, "open");
    assert.equal(view.opensNow, false);
    assert.equal(view.canWrite, false);
    assert.equal(view.opened, null);
    assert.match(text, /Your sealed card opens here tonight, after your session\./);
    assert.ok(!html.includes('type="number"'));
    assert.deepEqual(short(await w.act("rahul", "open")), [409, "Week 6 isn’t open to you yet."]);
  });

  test("once it opens: fresh answers first, then the sealed card beside them, with how each moved", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    at(AFTER_B);
    const first = await w.weekCard("chloe", 6);
    assert.equal(first.view.stage, "open");
    assert.equal(first.view.opensNow, true);
    assert.equal(first.view.canWrite, true);
    assert.equal(first.view.opened, null);
    // Nothing of week 1 travels before Chloe opens it.
    assert.deepEqual(first.view.start, { state: "sealed", answers: {}, sealedAt: "2026-11-17T12:00:00.000Z" });
    for (const typed of STARTS) assert.ok(!first.html.includes(typed), typed);
    inOrder(first.text, [
      "Your predictions",
      "MY LAMP CARD (sealed until week 6)",
      "Answer the questions again first. Then open the card you sealed in week 1 and see what moved.",
      "Saves as you type, until you open your sealed card.",
      "By 2035, most lighthouses will run with no keeper on the island.",
      "Open my sealed card",
      "Only you and admins can read your card. Each time an admin opens one, it’s recorded.",
      "Go further (optional)",
    ]);
    // Opening asks for fresh answers first.
    assert.deepEqual(short(await w.act("chloe", "open")), [409, "Answer at least one question first, then open your sealed card."]);
    await fillNow("chloe");
    const opened = await w.act("chloe", "open");
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.view.opened, {
      answers: { q1: 35, q2: 7, q3: 60, q4: "The north light." },
      sealedAt: "2026-11-17T12:00:00.000Z",
      openedAt: "2026-12-01T20:01:00.000Z",
    });
    const after = await w.weekCard("chloe", 6);
    inOrder(after.text, [
      "Sealed on Tue 17 Nov, opened on Tue 1 Dec.",
      "By 2035, most lighthouses will run with no keeper on the island.",
      "Week 1",
      "35%",
      "Week 6",
      "60%",
      "Up 25 points",
      "How hard is it to keep a lamp lit through a winter storm?",
      "7",
      "5",
      "Down 2",
      "Somebody like me could keep a lamp lit for a whole year.",
      "60%",
      "60%",
      "No change",
      "The lamp I'd most like to tend, if I chose today:",
      "The north light.",
      "The harbour light.",
    ]);
    // From then neither card changes.
    assert.deepEqual(short(await w.answer("chloe", "now", "q1", 1)), [409, "You’ve opened your sealed card, so today’s answers stay as they are."]);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 1)), [409, "Your card is sealed, so it can’t change now."]);
    assert.deepEqual(short(await w.act("chloe", "open")), [409, "You’ve already opened your sealed card."]);
    // Week 1's page says it was opened, and still shows none of it.
    const weekOne = await w.weekCard("chloe", 1);
    assert.match(weekOne.text, /Sealed on Tue 17 Nov, opened on Tue 1 Dec\./);
    assert.deepEqual(weekOne.view.start.answers, {});
  });

  test("each group's card opens on its own group's clock: Amara's with Group A's, Farah's with Farah's place in Group B", async () => {
    for (const who of ["amara", "farah", "sofia"]) {
      await fillStart(who, { q1: 40 });
      await w.act(who, "seal");
    }
    at(BEFORE_A);
    for (const who of ["amara", "farah", "sofia"]) assert.equal((await w.answer(who, "now", "q1", 41)).status, 409, who);
    at(AFTER_A);
    assert.equal((await w.answer("amara", "now", "q1", 41)).status, 200);
    // Sofia runs Groups A and B: Sofia's card opens with the first of them.
    assert.equal((await w.answer("sofia", "now", "q1", 41)).status, 200);
    // Farah facilitates Group B from a place in it: Farah's waits for Group B.
    assert.deepEqual(short(await w.answer("farah", "now", "q1", 41)), [409, "Week 6 isn’t open to you yet."]);
    at(AFTER_B);
    assert.equal((await w.answer("farah", "now", "q1", 41)).status, 200);
    assert.equal((await w.act("farah", "open")).status, 200);
  });

  test("somebody who sealed nothing answers again with nothing to open", async () => {
    at(AFTER_B);
    const { view, text } = await w.weekCard("kofi", 6);
    assert.equal(view.start.state, "none");
    assert.equal(view.canWrite, true);
    inOrder(text, ["Your predictions", "You didn’t seal a card in week 1, so there’s nothing to open.", "Saves as you type."]);
    assert.ok(!text.includes("Open my sealed card"));
    await fillNow("kofi", { q1: 70 });
    assert.deepEqual(short(await w.act("kofi", "open")), [409, "You didn’t seal a card in week 1, so there’s nothing to open."]);
    // Kofi's second card is Kofi's own and keeps the course's questions.
    assert.deepEqual(w.record("kofi").now.answers, { q1: 70 });
    assert.equal(w.record("kofi").card.questions.length, 4);
  });

  test("a card never sealed shuts once week 6 opens, and stays its owner's to read on week 1", async () => {
    await fillStart("chloe", { q1: 15, q4: "The north light." });
    at(AFTER_B);
    assert.deepEqual(short(await w.answer("chloe", "start", "q1", 16)), [409, "Week 6 has opened, so this card can’t change or be sealed now."]);
    assert.deepEqual(short(await w.act("chloe", "seal")), [409, "Week 6 has opened, so this card can’t change or be sealed now."]);
    const { view, text } = await w.weekCard("chloe", 1);
    assert.equal(view.start.state, "closed");
    assert.equal(view.canWrite, false);
    inOrder(text, ["You didn’t seal this card, and week 6 has opened, so it can’t be sealed now.", "15%", "The north light."]);
    // Week 6 hands none of the unsealed card over, and says there is nothing to open.
    const six = await w.weekCard("chloe", 6);
    assert.deepEqual(six.view.start, { state: "none", answers: {}, sealedAt: null });
    assert.match(six.text, /You didn’t seal a card in week 1, so there’s nothing to open\./);
  });

  test("a card sealed to open in week 6 opens in week 6, on week 6's page, even if the course's card later says another week", async () => {
    await fillStart("chloe", { q1: 15 });
    await w.act("chloe", "seal");
    w.world.db.poke(`courses/${COURSE.agi}`, { "predictionCard.openWeek": 3 });
    // Week 3 is open now: it holds nothing for Chloe, whose card was sealed until week 6.
    assert.equal((await w.weekCard("chloe", 3)).view, null);
    assert.deepEqual(short(await w.act("chloe", "open")), [409, "Week 6 isn’t open to you yet."]);
    // Kofi sealed nothing: the course's week 3 is the one Kofi's second card is on.
    const kofi = await w.weekCard("kofi", 3);
    assert.equal(kofi.view.stage, "open");
    assert.equal(kofi.view.weekNumber, 3);
    at(AFTER_B);
    const six = await w.weekCard("chloe", 6);
    assert.equal(six.view.stage, "open");
    assert.equal(six.view.weekNumber, 6);
    await fillNow("chloe", { q1: 20 });
    assert.equal((await w.act("chloe", "open")).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 5. Admins: who has a card, and an opening recorded first
// ---------------------------------------------------------------------------

describe("5. admins", () => {
  test("the list names who has a card and where it stands, and never an answer", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    await fillStart("kofi", { q1: 90 });
    const list = await w.people("zach");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, {
      people: [
        { uid: "chloe", name: "Chloe Nguyen", sealedAt: "2026-11-17T12:00:00.000Z", openedAt: null },
        { uid: "kofi", name: "Kofi Asante", sealedAt: null, openedAt: null },
      ],
    });
    // It asks Firestore for three fields, never the answers, and records nothing.
    assert.match(read("app", "api", "courses", "runs", "[runId]", "predictions", "people", "route.ts"), /\.select\("uid", "start\.sealedAt", "now\.openedAt"\)/);
    assert.deepEqual(w.openings(), []);
    assert.equal((await w.people("zach", "no-such-run")).status, 404);
  });

  test("an admin opens one card: the opening is recorded with who, whose, the run and when, then both cards come back", async () => {
    await fillStart("chloe");
    await w.act("chloe", "seal");
    const opened = await w.openCard("zach", "chloe");
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.card, {
      uid: "chloe",
      name: "Chloe Nguyen",
      card: { title: STORED_CARD.title, intro: STORED_CARD.intro, questions: STORED_CARD.questions.map((question, index) => ({ id: `q${index + 1}`, ...question })) },
      sealWeek: 1,
      openWeek: 6,
      start: { answers: { q1: 35, q2: 7, q3: 60, q4: "The north light." }, sealedAt: "2026-11-17T12:00:00.000Z" },
      now: { answers: {}, openedAt: null },
    });
    const rows = w.openings();
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), ["actorName", "actorUid", "kind", "openedAt", "runId", "subjectUid"]);
    assert.deepEqual(
      { ...rows[0], openedAt: rows[0].openedAt.toISOString() },
      { kind: "sealed-predictions", actorUid: "zach", actorName: "Zach Levin", subjectUid: "chloe", runId: RUN.agi, openedAt: "2026-11-17T12:00:00.000Z" },
    );
    // Opening it again is another opening.
    await w.openCard("zach", "chloe");
    assert.equal(w.openings().length, 2);
    // Opening it changes nothing of the card: it stays sealed to its owner.
    assert.deepEqual((await w.weekCard("chloe", 1)).view.start.answers, {});
  });

  test("the opening is written before anything of the card is read", async () => {
    await fillStart("chloe", { q1: 35 });
    const order = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      const inner = collection(path);
      if (path === "coursePredictions") order.push("read the card");
      if (path !== "recordOpenings") return inner;
      return { ...inner, doc: (id) => ({ ...inner.doc(id), create: async (data) => { order.push("recorded"); return inner.doc(id).create(data); } }) };
    };
    try {
      assert.equal((await w.openCard("zach", "chloe")).status, 200);
    } finally {
      w.world.db.collection = collection;
    }
    assert.deepEqual(order, ["recorded", "read the card"]);
  });

  test("when the opening cannot be recorded, the card stays closed and nothing of it is read", async () => {
    await fillStart("chloe", { q1: 35 });
    const touched = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      touched.push(path);
      const inner = collection(path);
      if (path !== "recordOpenings") return inner;
      return { ...inner, doc: () => ({ create: async () => { throw new Error("unavailable"); } }) };
    };
    let answer;
    try {
      answer = await w.openCard("zach", "chloe");
    } finally {
      w.world.db.collection = collection;
    }
    assert.deepEqual(short(answer), [500, "We couldn’t record that you opened it, so it stays closed. Try again."]);
    assert.ok(!JSON.stringify(answer.body).includes("35"));
    assert.ok(!touched.includes("coursePredictions"), "the card was read although the opening was not recorded");
  });

  test("an opening of somebody with no card is recorded too, and says there is none", async () => {
    assert.deepEqual(short(await w.openCard("zach", "kofi")), [404, "There’s no card for them on this run."]);
    assert.equal(w.openings().length, 1);
    assert.equal(w.openings()[0].subjectUid, "kofi");
  });

  test("an admin cannot open their own card there, and a missing run records nothing", async () => {
    assert.deepEqual(short(await w.openCard("zach", "zach")), [403, "Your own card opens on your week page, in the week it opens in."]);
    const missing = await w.call("zach", w.routes.openCard.POST, { runId: "no-such-run", uid: "chloe" }, { course: true });
    assert.equal(missing.status, 404);
    assert.deepEqual(w.openings(), []);
  });

  test("the panel's and the card's words", () => {
    const { panelStateWords, movedWords, answerWords, openCardLabel } = w.lib.words;
    assert.equal(panelStateWords(null, null), "Started, not sealed");
    assert.equal(panelStateWords("2026-11-03T19:00:00.000Z", null), "Sealed Tue 3 Nov");
    assert.equal(panelStateWords("2026-11-03T19:00:00.000Z", "2026-12-04T12:00:00.000Z"), "Opened Fri 4 Dec");
    assert.equal(openCardLabel("Chloe Nguyen"), "Open Chloe Nguyen’s card");
    const [percent, scale, , sentence] = STORED_CARD.questions;
    assert.equal(movedWords(percent, 30, 31), "Up 1 point");
    assert.equal(movedWords(percent, 30, 29.5), "Down 0.5 points");
    assert.equal(movedWords(scale, 7, 9), "Up 2");
    assert.equal(movedWords(sentence, "a", "b"), null);
    assert.equal(movedWords(percent, undefined, 5), null);
    assert.equal(answerWords(percent, 0.5), "0.5%");
    assert.equal(answerWords(scale, 7), "7");
    assert.equal(answerWords(percent, undefined), "No answer");
  });
});

// ---------------------------------------------------------------------------
// 6. Deletion and the run's destroy
// ---------------------------------------------------------------------------

/** A database whose count queries answer, as the destroy's manifest asks them. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

const allRecords = () => w.world.db.paths().filter((path) => path.startsWith("coursePredictions/")).sort();

describe("6. deletion and the run's destroy", () => {
  test("deleting an account deletes their cards on every run, and nobody else's; the openings stay", async () => {
    await fillStart("chloe");
    await fillStart("kofi", { q1: 9 });
    w.world.db.seed("coursePredictions/another-run__chloe", { runId: "another-run", uid: "chloe", courseId: COURSE.agi, start: { answers: {} }, now: { answers: {} } });
    await w.openCard("zach", "chloe");
    assert.equal(await w.lib.accountDeletion.deleteCoursePredictions(w.world.courseDb, "chloe"), 2);
    assert.deepEqual(allRecords(), [recordPath("kofi")]);
    assert.equal(await w.lib.accountDeletion.deleteCoursePredictions(w.world.courseDb, "farah"), 0);
    // The record of an admin opening Chloe's card stays, naming Chloe by id alone.
    assert.deepEqual(w.openings().map((row) => row.subjectUid), ["chloe"]);
  });

  test("the account's cascade runs the sweep in a step of its own, and touches no opening", () => {
    const source = read("lib", "firestore", "accountDeletion.ts");
    assert.match(source, /^\s*coursePredictionsDeleted: number;/m);
    assert.match(source, /^\s*coursePredictionsDeleted: 0,/m);
    assert.match(source, /try \{\s*summary\.coursePredictionsDeleted = await deleteCoursePredictions\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/);
    assert.match(source, /return deleteOwnedCourseRows\(db, COURSE_PREDICTIONS_COLLECTION, uid\);/);
    assert.doesNotMatch(stripSource(source), /recordOpenings|RECORD_OPENINGS_COLLECTION/);
  });

  test("destroying the run counts and deletes its cards and the records of opening them, and no other run's", async () => {
    await fillStart("chloe");
    await fillStart("kofi", { q1: 9 });
    await w.openCard("zach", "chloe");
    w.world.db.seed("coursePredictions/another-run__chloe", { runId: "another-run", uid: "chloe", courseId: COURSE.agi, start: { answers: {} }, now: { answers: {} } });
    w.world.db.seed("recordOpenings/elsewhere", { kind: "sealed-predictions", runId: "another-run", subjectUid: "chloe", actorUid: "zach", actorName: "Zach Levin" });
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(w.world.courseDb);
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const counts = await w.lib.courseDeletion.countRunDestroyTargets(db, run);
    assert.equal(counts.predictions, 2);
    assert.equal(counts.recordOpenings, 1);
    const result = await w.lib.courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.predictions, 2);
    assert.equal(result.deleted.recordOpenings, 1);
    assert.deepEqual(allRecords(), ["coursePredictions/another-run__chloe"]);
    assert.deepEqual(w.openings().map((row) => row.runId), ["another-run"]);
  });

  test("the destroy drains them with the run's leaves, before its groups and weeks, and its dialog names them", () => {
    const engine = read("lib", "firestore", "courseDeletion.ts");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    for (const key of ["predictions", "recordOpenings"]) {
      assert.ok(order.indexOf(key) > -1 && order.indexOf(key) < order.indexOf("groups"), key);
    }
    assert.ok(order.indexOf("predictions") < order.indexOf("recordOpenings"));
    assert.match(table, /drainQuery\(db, COURSE_PREDICTIONS_COLLECTION, byRunId\(COURSE_PREDICTIONS_COLLECTION\), budget\)/);
    assert.match(table, /drainQuery\(db, RECORD_OPENINGS_COLLECTION, byRunId\(RECORD_OPENINGS_COLLECTION\), budget\)/);
    const dialog = read("features", "courses", "useDestroy.ts");
    assert.match(dialog, /predictions: \{\s*label: "Sealed predictions",\s*fate: "destroyed",/);
    assert.match(dialog, /recordOpenings: \{\s*label: "Records of admins opening a card",\s*fate: "destroyed",/);
  });

  test("the record reads back only what it can place, and answers only to its own questions", () => {
    const { normalizeCoursePredictions, predictionsRecordId, COURSE_PREDICTIONS_COLLECTION } = w.lib.store;
    assert.equal(COURSE_PREDICTIONS_COLLECTION, "coursePredictions");
    assert.equal(predictionsRecordId("run-1", "amara"), "run-1__amara");
    assert.equal(normalizeCoursePredictions("x", { uid: "amara" }), null);
    assert.equal(normalizeCoursePredictions("x", { runId: "run-1" }), null);
    const stored = normalizeCoursePredictions("x", {
      runId: "run-1",
      uid: "amara",
      card: STORED_CARD,
      start: { answers: { q1: 150, q2: 4, q4: 3, q9: 5 }, opensInWeek: 6 },
      now: { answers: { q3: "lots" } },
    });
    assert.deepEqual(stored.start.answers, { q2: 4 });
    assert.deepEqual(stored.now.answers, {});
    // Not sealed: a week it opens in means nothing yet.
    assert.equal(stored.start.opensInWeek, null);
  });
});

// ---------------------------------------------------------------------------
// 7. The tree
// ---------------------------------------------------------------------------

/** Files under `src` whose code (comments left out, strings kept) matches `pattern`. */
function filesNaming(pattern) {
  const out = [];
  for (const file of walkSource(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    if (pattern.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) out.push(relative(SRC, file).split(sep).join("/"));
  }
  return out.sort();
}

describe("7. the tree", () => {
  test("every file that addresses a person's cards is one of these, each for its reason", () => {
    const expected = new Map([
      ["lib/firestore/coursePredictions.ts", "the record's own shape, its id and its normaliser"],
      ["lib/courses/predictions/own.ts", "the owner's own card, read by their own id, and what of it they may see now"],
      ["app/api/courses/runs/[runId]/predictions/route.ts", "the owner's answers, seal and opening, in their own name only"],
      ["app/api/courses/runs/[runId]/predictions/people/route.ts", "an admin's list of whose cards exist, three fields and never an answer"],
      ["lib/firestore/accountDeletion.ts", "deleting an account deletes its cards"],
      ["lib/firestore/courseDeletion.ts", "destroying a run counts and deletes its cards"],
    ]);
    const found = filesNaming(/\bCOURSE_PREDICTIONS_COLLECTION\b|["'`]coursePredictions["'`]/);
    assert.deepEqual(found, [...expected.keys()].sort(), "a new reader or writer of the cards needs a reason here, and a gate");
    for (const [, why] of expected) assert.ok(why.length > 20);
  });

  test("an admin's opening goes through the one module that records first, and nothing else writes an opening", () => {
    assert.deepEqual(filesNaming(/\bRECORD_OPENINGS_COLLECTION\b|["'`]recordOpenings["'`]/), [
      "lib/firestore/courseDeletion.ts",
      "lib/firestore/recordOpenings.ts",
    ]);
    assert.deepEqual(filesNaming(/\bopenRecorded\b/), ["app/api/courses/runs/[runId]/predictions/people/[uid]/route.ts", "lib/firestore/recordOpenings.ts"]);
    const route = stripSource(read("app", "api", "courses", "runs", "[runId]", "predictions", "people", "[uid]", "route.ts"));
    // The only read of the card is inside the read the opening hands back.
    const recorded = route.indexOf("openRecorded(");
    assert.ok(recorded > -1 && route.indexOf("ownRecordOf(") > recorded);
    assert.equal(route.split("ownRecordOf(").length, 2);
    const openings = stripSource(read("lib", "firestore", "recordOpenings.ts"));
    assert.ok(openings.indexOf(".create(") < openings.indexOf("await read()"));
  });

  test("the card's place on a week: after In the session, otherwise before Go further and the hands-on route", async () => {
    const one = (await w.weekCard("chloe", 1)).html;
    assert.ok(one.indexOf("In the session") < one.indexOf("Your predictions") && one.indexOf("Your predictions") < one.indexOf("Go further"));
    at(AFTER_B);
    const six = (await w.weekCard("chloe", 6)).html;
    assert.ok(six.indexOf('id="block-k6-p4"') < six.indexOf('id="your-predictions"'));
    assert.ok(six.indexOf('id="your-predictions"') < six.indexOf("Go further"));
    // "On this page" names it once.
    assert.equal(six.split('href="#your-predictions"').length, 2);
  });

  test("a number is typed in a box labelled by its question, with a slider beside it that a keyboard and a screen reader pass over", async () => {
    const { html } = await w.weekCard("chloe", 1);
    const numbers = [...html.matchAll(/<input type="number"[^>]*>/g)].map((m) => m[0]);
    assert.equal(numbers.length, 3);
    for (const box of numbers) assert.match(box, /aria-labelledby="[^"]+"/);
    const sliders = [...html.matchAll(/<input type="range"[^>]*>/g)].map((m) => m[0]);
    assert.equal(sliders.length, 3);
    for (const slider of sliders) {
      assert.match(slider, /aria-hidden="true"/);
      assert.match(slider, /tabindex="-1"/i);
    }
    assert.equal([...html.matchAll(/<textarea[^>]*aria-labelledby="[^"]+"/g)].length, 1);
  });

  test("the words carry no dash and name nobody's group or lead", () => {
    const words = read("lib", "courses", "predictions", "words.ts");
    assert.doesNotMatch(words, /[–—]/);
    for (const file of [
      ["features", "courses", "weekBlocks", "PredictionsCard.tsx"],
      ["features", "courses", "SealedPredictionsPanel.tsx"],
      ["features", "courses", "CoursePredictionsCard.tsx"],
    ]) {
      assert.doesNotMatch(read(...file), /[–—]/, file.join("/"));
    }
  });

  test("the card on the page belongs to the reader alone: the shell reads it through the one view, for the session's own user", () => {
    const shell = read("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx");
    assert.match(shell, /ownPredictionsView\(db, access\.user, access\.run\.id, weekNumber, new Date\(\)\)/);
    const own = stripSource(read("lib", "courses", "predictions", "own.ts"));
    assert.match(own, /if \(!actor\.uid \|\| markerIsLive\(await getImpersonator\(\), actor\.uid\)\) return null;/);
    assert.match(own, /const record = await ownRecordOf\(db, runId, actor\.uid\);/);
  });
});
