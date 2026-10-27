/**
 * "YOU CAN QUOTE THIS, WITHOUT MY NAME" (docs/surveys.md, "The quote tick").
 *
 * Every survey's confidential box says "Totals, and comments you tick to be
 * quoted, may go in reports to the committee and our funder, Kairos, or on our
 * site." This suite holds the box and the tick to one decision, and the tick
 * to the person's own hand:
 *
 *  1. ONE DECISION. For every kind of survey, the box says comments ticked to
 *     be quoted may go in reports exactly when the form draws the tick
 *     (`asksQuotes`): a programme's surveys and a survey after an event do;
 *     the survey about leaving, whose box speaks of totals alone, does not.
 *  2. THE FORM. Under every long answer of such a survey, the board's box and
 *     its line, unticked; under a short answer, and anywhere on the survey
 *     about leaving, none.
 *  3. KEPT WITH THE ANSWER IT IS UNDER, through the real answer routes, by a
 *     link and signed in: `quote: true` on that text answer when ticked, and
 *     no `quote` at all when not; nothing for a tick under an empty answer;
 *     refused, with nothing kept, where no box was drawn (a short answer, the
 *     survey about leaving) or in a shape the form never sends.
 *
 * The worlds are `tests/lib/surveyWorld.mjs` (AGI Strategy, week 1) and
 * `tests/lib/eventSurveyWorld.mjs` (VR games night). Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AGI, NOW, ROUND, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";
import { EVENT_ID, LATE, makeEventSurveyWorld } from "./lib/eventSurveyWorld.mjs";

const w = await makeSurveyWorld("__surveysQuoteTick");
const { routes, call } = w;
const { templates, words, records } = w.lib;
const { answerPagesOf } = await w.loadTs(join("lib", "surveys", "answerView.ts"));
const events = await makeEventSurveyWorld("__surveysQuoteTickEvents");
const eventWords = await events.load("lib/surveys/events/words.ts");
const { eventTemplateItems } = await events.load("lib/surveys/events/template.ts");

const BOX_LINE = "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.";
const TICK = "You can quote this, without my name";
const TICK_LINE = "We might put it in a report for the committee or our funder, Kairos, or on our site.";
const NO_BOX = "That answer has no box to tick for quoting.";

function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];

/** Every template's items, by the kind of survey made from it. */
const TEMPLATE_ITEMS = {
  before: templates.templateItems("before", "incubator", "alignment"),
  after: templates.templateItems("after", "incubator", "alignment"),
  followUp6: templates.templateItems("followUp6", "fellowship", null),
  followUp12: templates.templateItems("followUp12", "fellowship", null),
  leaving: templates.templateItems("leaving", "fellowship", null),
  event: eventTemplateItems(),
};

/** The box at the top of a survey of each kind, as its form draws it. */
function boxOf(kind) {
  if (kind === "event") return eventWords.eventBoxPoints({ namesOffOn: "2028-11-01", signedInAs: null, came: true }).points;
  return words.confidentialPoints({ stage: kind, leadName: "Claudia", facilitatorNames: ["Rahul"], namesOffOn: "2028-12-09", programmeKind: "fellowship" }).points;
}

const textQuestions = (kind) =>
  answerPagesOf({ items: TEMPLATE_ITEMS[kind], kind })
    .flatMap((page) => page.questions)
    .filter((question) => question.kind === "text");

// ---------------------------------------------------------------------------
// 1. One decision
// ---------------------------------------------------------------------------

describe("the box at the top and the tick under a long answer are one decision", () => {
  test("every kind of survey is listed here, so a new one is decided on purpose", () => {
    assert.deepEqual(Object.keys(TEMPLATE_ITEMS).sort(), [...templates.SURVEY_TEMPLATES, "event"].sort());
  });

  test("the box says ticked comments may be quoted exactly where the form draws the tick", () => {
    for (const kind of Object.keys(TEMPLATE_ITEMS)) {
      const says = boxOf(kind).includes(BOX_LINE);
      assert.equal(says, records.asksQuotes({ kind }), `${kind}: the box and the tick disagree`);
    }
    // Spelled out, so a change to either side is a change made here first.
    assert.deepEqual(
      Object.keys(TEMPLATE_ITEMS).filter((kind) => records.asksQuotes({ kind })),
      ["before", "after", "followUp6", "followUp12", "event"],
    );
    assert.ok(boxOf("leaving").includes("Totals may go in reports to the committee and our funder, Kairos."), "the leaving box speaks of totals alone");
  });

  test("every long answer of a survey that asks for the tick carries it; no short answer does; the survey about leaving has none", () => {
    let longAnswers = 0;
    for (const kind of Object.keys(TEMPLATE_ITEMS)) {
      for (const question of textQuestions(kind)) {
        assert.equal(question.quote, question.long && records.asksQuotes({ kind }), `${kind}: ${question.title}`);
        if (question.long && question.quote) longAnswers += 1;
      }
    }
    // Not vacuous: the end's negative-effects question, an incubator's links, the follow-ups' three and the event's change.
    assert.ok(longAnswers >= 6, `only ${longAnswers} long answers carry the tick`);
    assert.ok(textQuestions("leaving").some((question) => question.long && !question.quote), "the survey about leaving has a long answer, with no box");
    assert.ok(textQuestions("before").some((question) => !question.long && !question.quote), "the before survey's short answer has no box");
  });
});

// ---------------------------------------------------------------------------
// 2. The form
// ---------------------------------------------------------------------------

async function makeAndSend(stage) {
  const made = await w.make("zach", { stage, closesOn: stage === "before" ? "2026-11-04" : "2026-12-20" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  const sent = await w.sendFirst(id, "zach", { emails: 4 });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return id;
}

const pageOf = (id, uid) => w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, uid) }) });

/** The tick's checkbox for a question, as the form draws it, or null. */
function tickOn(html, questionId) {
  const found = new RegExp(`<input[^>]*name="${questionId}\\.quote"[^>]*>`).exec(html);
  return found ? found[0] : null;
}

describe("the form draws the box under every long answer, unticked", () => {
  test("the survey at the end: under the long answer, with the board's words, after the answer's own box", async (t) => {
    clock(t);
    w.reset(surveySeed());
    await makeAndSend("before");
    const after = await makeAndSend("after");
    const page = await pageOf(after, "amara");
    const tick = tickOn(page.html, "q_a5");
    assert.ok(tick, "no box under the negative-effects question");
    assert.match(tick, /type="checkbox"/);
    assert.match(tick, /value="yes"/);
    assert.ok(!/\bchecked\b/.test(tick), "the box is ticked before the person touches it");
    const area = page.html.indexOf('name="q_a5"');
    assert.ok(area > 0 && area < page.html.indexOf('name="q_a5.quote"'), "the box is not under the answer it is about");
    assert.ok(page.text.includes(`${TICK} ${TICK_LINE}`));
    // One box per long answer: the fellowship's end has one long answer.
    assert.equal((page.html.match(/name="q_[a-z0-9_]+\.quote"/g) ?? []).length, 1);
  });

  test("the before survey's short answer has none, and the survey about leaving none at all", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const before = await makeAndSend("before");
    const page = await pageOf(before, "amara");
    assert.ok(page.html.includes('name="q_p6"'), "the short answer is drawn");
    assert.equal(tickOn(page.html, "q_p6"), null, "a short answer has the box");
    assert.ok(!page.text.includes(TICK));
    const leaving = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving" } });
    const id = leaving.body?.survey?.id ?? w.surveyIds().find((each) => w.survey(each).kind === "leaving");
    assert.ok(id, JSON.stringify(leaving.body));
    const test = await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(id).testToken }) });
    assert.ok(test.html.includes('name="q_leave_stay"'), "the leaving survey's long answer is drawn");
    assert.equal(tickOn(test.html, "q_leave_stay"), null, "the survey about leaving draws the box");
    assert.ok(!test.text.includes(TICK));
  });
});

// ---------------------------------------------------------------------------
// 3. Kept with the answer it is under
// ---------------------------------------------------------------------------

describe("the tick is kept with the answer it is under, and nowhere else", () => {
  const WORDS = "It made me rethink my dissertation, in a good way.";

  test("by a link: ticked, kept as quote: true on that answer; unticked, no quote at all", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const after = await makeAndSend("after");
    const send = (uid, a5) => call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(after, uid), answers: { q_a5: a5 } } });
    assert.deepEqual(short(await send("amara", { type: "text", text: WORDS, quote: true })), [200, null]);
    assert.deepEqual(short(await send("bea", { type: "text", text: "Nothing negative." })), [200, null]);
    assert.deepEqual(short(await send("dev", { type: "text", text: "None.", quote: false })), [200, null]);
    const kept = new Map(w.answers(after).map((answer) => [answer.respondent.uid, answer.answers.q_a5]));
    assert.deepEqual(kept.get("amara"), { type: "text", text: WORDS, quote: true });
    assert.deepEqual(kept.get("bea"), { type: "text", text: "Nothing negative." });
    assert.deepEqual(kept.get("dev"), { type: "text", text: "None." }, "an unticked box keeps no quote");
    assert.ok(!("quote" in kept.get("bea")) && !("quote" in kept.get("dev")));
  });

  test("signed in, the same; a tick under an answer left blank keeps nothing", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const after = await makeAndSend("after");
    const signedIn = (uid, answers) => call(uid, routes.answerSignedIn.POST, { surveyId: after }, { body: { answers } });
    assert.deepEqual(short(await signedIn("amara", { q_a5: { type: "text", text: WORDS, quote: true } })), [200, null]);
    assert.deepEqual(short(await signedIn("bea", { q_a5: { type: "text", text: "   ", quote: true } })), [200, null]);
    const kept = new Map(w.answers(after).map((answer) => [answer.respondent.uid, answer.answers]));
    assert.deepEqual(kept.get("amara").q_a5, { type: "text", text: WORDS, quote: true });
    assert.deepEqual(kept.get("bea"), {}, "a tick with no words was kept as something to quote");
  });

  test("refused where no box was drawn, or in a shape the form never sends, and nothing is kept", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const before = await makeAndSend("before");
    const after = await makeAndSend("after");
    const byLink = (id, uid, answers) => call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, uid), answers } });
    // A short answer has no box.
    assert.deepEqual(short(await byLink(before, "amara", { q_p6: { type: "text", text: "To explain it.", quote: true } })), [400, NO_BOX]);
    assert.deepEqual(w.answers(before), []);
    assert.equal(w.people(before).find((row) => row.respondent.uid === "amara").answered, false);
    // A tick is a yes or nothing.
    assert.deepEqual(short(await byLink(after, "amara", { q_a5: { type: "text", text: WORDS, quote: "yes" } })), [400, "That answer is not in a shape this question understands."]);
    assert.deepEqual(w.answers(after), []);
    // The same answer, sent as the form sends it, is then kept.
    assert.deepEqual(short(await byLink(after, "amara", { q_a5: { type: "text", text: WORDS, quote: true } })), [200, null]);
  });

  test("the survey about leaving draws no box, so a tick sent to it is refused and nothing is kept", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const open = await w.loadTs(join("app", "api", "surveys", "[surveyId]", "open", "route.ts"));
    const made = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving" } });
    const id = made.body?.survey?.id ?? w.surveyIds().find((each) => w.survey(each).kind === "leaving");
    assert.ok(id, JSON.stringify(made.body));
    assert.equal((await call("zach", open.POST, { surveyId: id }, { body: {} })).status, 200);
    // Amara's own row, as leaving makes it (src/lib/surveys/leaving.ts).
    const token = "L".repeat(43);
    await w.world.db.collection("surveyPeople").doc(`${id}__amara`).set({
      surveyId: id,
      roundId: ROUND,
      respondent: { kind: "account", uid: "amara" },
      token,
      pressId: "",
      sentAt: NOW,
      delivery: null,
      remindedAt: null,
      reminders: 0,
      answered: false,
    });
    const sent = await call(null, routes.answerByLink.POST, {}, { body: { token, answers: { q_leave_stay: { type: "text", text: "Earlier sessions.", quote: true } } } });
    assert.deepEqual(short(sent), [400, NO_BOX]);
    assert.deepEqual(w.answers(id), []);
    // Without the tick it is kept, as it always was.
    assert.deepEqual(short(await call(null, routes.answerByLink.POST, {}, { body: { token, answers: { q_leave_stay: { type: "text", text: "Earlier sessions." } } } })), [200, null]);
    assert.deepEqual(w.answers(id)[0].answers.q_leave_stay, { type: "text", text: "Earlier sessions." });
  });

  test("a survey after an event keeps the tick with its long answer", async (t) => {
    clock(t, LATE);
    events.reset();
    const made = await events.make();
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const id = made.body.survey.id;
    const press = async (path, who, body = {}) => events.call(who, (await events.route(`surveys/[surveyId]/${path}`)).POST, { surveyId: id }, { body });
    assert.equal((await press("open-at-event", "zach")).status, 200);
    const answers = {
      q_ev_how: { type: "rating", value: 5 },
      q_ev_change: { type: "text", text: "Loved meeting people from the fellowships.", quote: true },
    };
    assert.deepEqual(short(await press("answer", "kofi", { answers })), [200, null]);
    const kept = events.answers(id).find((answer) => answer.respondent?.uid === "kofi");
    assert.deepEqual(kept.answers.q_ev_change, { type: "text", text: "Loved meeting people from the fellowships.", quote: true });
    assert.equal(kept.eventId, EVENT_ID);
  });

  test("a stored tick reads back with its answer, so what was ticked is what results and public numbers see", () => {
    const items = TEMPLATE_ITEMS.after;
    const read = w.lib.items.storedSurveyAnswers(items, {
      q_a5: { type: "text", text: WORDS, quote: true },
      q_q1: { type: "scale", value: 9 },
    });
    assert.deepEqual(read.q_a5, { type: "text", text: WORDS, quote: true });
    assert.deepEqual(read.q_q1, { type: "scale", value: 9 });
  });
});
