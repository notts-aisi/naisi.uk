/**
 * SENDING SOMEBODY THE QUESTIONS THEY LEFT BLANK, THROUGH THE REAL ROUTES AND
 * PAGES (docs/surveys.md, "Sending the questions left blank").
 *
 *  1. THE PRESS: an admin's alone (view-as refused first), for one person who
 *     sent the survey with required questions left blank, while it takes
 *     answers. A new secret for their link of blanks, the press recorded on
 *     their row before the email, one notice to their own address with the
 *     survey's name and the count and never an answer. Refused for a stale
 *     count, nothing blank, nobody, somebody who has not answered, a closed
 *     survey and a fourth press in a day; the do-not-email list is respected.
 *  2. THE LINK AND THE SIGNED-IN PAGE: only the questions still blank (a grid
 *     with only its blank lines), never an earlier answer, nothing written by
 *     opening. What comes back answers only what was blank, every one of it,
 *     once; it is kept beside the first answers, which never change; the link
 *     is then spent.
 *  3. EVERY READER MERGES: Who answered, the results, the spreadsheet and one
 *     person's page (which marks what came later, and when); the admins'
 *     before-the-first-session switch leaves out a later send that came after.
 *  4. NAMES OFF AND DELETION: a later send is nameless with the answer it is
 *     beside, and the link goes with the row.
 *  5. A SURVEY AFTER AN EVENT: a guest with no account, by the address they
 *     gave the event.
 *
 * The answers with blanks are written straight into the store, as answers
 * sent before every question was required were kept. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { NOW, ROUND, RUN, makeSurveyWorld } from "./lib/surveyWorld.mjs";
import { EVENT_ID, NEXT_DAY, RSVP, makeEventSurveyWorld } from "./lib/eventSurveyWorld.mjs";

const w = await makeSurveyWorld("__surveysBlanks");
const { call } = w;
const words = w.lib.words;
const { BLANKS_REFUSAL, BLANKS_WORDS, REFUSAL } = words;

const route = (...parts) => w.loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const pressRoute = await route("[surveyId]", "people", "[who]", "blanks");
const byLinkRoute = await route("blanks");
const signedInRoute = await route("[surveyId]", "blanks");
const openingRoute = await route("[surveyId]", "people", "[who]");
const adminView = await w.loadTs(join("lib", "surveys", "adminView.ts"));
const repo = await w.loadTs(join("lib", "surveys", "repo.ts"));

/** The clock, set to `at` for one test: Date only, so the mail dispatcher's pauses stay real. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];

/** Amara's first send: every question of the before survey but three, C7 with one of its two lines. */
const AMARA = {
  q_p3_level: { type: "choice", optionId: "o_ug1" },
  q_p3_subject: { type: "choice", optionId: "o_cs" },
  q_p4: { type: "choices", optionIds: ["o_course"] },
  q_p5: { type: "choices", optionIds: ["o_fair"] },
  q_c1: { type: "choice", optionId: "o_stage1" },
  q_c3: { type: "choices", optionIds: ["o_policy"] },
  q_c4: { type: "scale", value: 3 },
  q_c5: { type: "scale", value: 4 },
  q_c6: { type: "number", value: 2 },
  q_c7: { type: "lines", values: { l_next: 2 } },
  q_c8: { type: "choices", optionIds: ["o_risk"] },
  q_c9: { type: "choices", optionIds: ["o_event"] },
};
/** Every question of the before survey answered. */
const WHOLE = { ...AMARA, q_c2: { type: "percent", value: 10 }, q_c7: { type: "lines", values: { l_next: 2, l_contribute: 4 } }, q_p6: { type: "text", text: "To explain it." } };
/** What Amara sends through her link of blanks. */
const FILL = { q_c2: { type: "percent", value: 35 }, q_c7: { type: "lines", values: { l_contribute: 5 } }, q_p6: { type: "text", text: "Somewhere to start." } };

/** The before survey, made and sent to the four holding a place by an admin, after a test. */
async function sentSurvey() {
  const id = (await w.make()).body.survey.id;
  const sent = await w.sendFirst(id);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  w.world.mail.length = 0;
  return id;
}

/** A person's answers, kept as an answer sent before every question was required was kept, and their row marked answered. */
function answered(id, uid, answers, sentAt = NOW) {
  w.world.db.seed(`surveyAnswers/a_${uid}_${id}`, {
    surveyId: id,
    roundId: ROUND,
    respondent: { kind: "account", uid },
    answers,
    sentAt,
    via: "link",
    afterFirstSession: false,
  });
  const row = w.people(id).find((each) => each.respondent?.uid === uid);
  const { path, ...data } = row;
  w.world.db.seed(path, { ...data, answered: true });
}

const press = (id, who, body = { questions: 3 }, options = {}) => call(who, pressRoute.POST, { surveyId: id, who: options.subject ?? "amara" }, { body, viewAs: options.viewAs });
const rowOf = (id, uid) => w.people(id).find((each) => each.respondent?.uid === uid);
const answerOf = (id, uid) => w.answers(id).find((each) => each.respondent?.uid === uid);
const sendByLink = (token, answers) => call(null, byLinkRoute.POST, {}, { body: { token, answers } });
const linkPage = async (token) => (await w.page(w.pages.link, { params: Promise.resolve({ token }) })).text;

// ---------------------------------------------------------------------------
// 1. The press
// ---------------------------------------------------------------------------

describe("the press: an admin's alone, one person, a new link, one notice", () => {
  test("refused to everybody but an admin, and to an admin viewing as somebody, before anything is read or sent", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    const before = w.everything();
    for (const who of ["claudia", "tess", "rahul", "amara", "bea", "nobody"]) {
      assert.deepEqual(short(await press(id, who)), [403, REFUSAL.adminOnly], who);
    }
    assert.deepEqual(short(await press(id, null)), [401, REFUSAL.notSignedIn]);
    assert.equal((await press(id, "zach", undefined, { viewAs: true })).status, 403, "an admin viewing as somebody sent it");
    assert.equal(w.everything(), before, "a refused press changed something");
    assert.deepEqual(w.world.mail, []);
  });

  test("an admin sends Amara a link to her three blank questions: a new secret, the press on her row, one notice, no answer in it", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    const first = structuredClone(answerOf(id, "amara"));
    const sent = await press(id, "zach");
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, { ok: true, delivery: "sent", pressed: "Sent Thu 29 Oct, 9am by Zach Levin" });
    const row = rowOf(id, "amara");
    assert.match(row.blanks.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(row.blanks.token, row.token, "the first link was reused: it would reopen the whole survey");
    assert.equal(row.blanks.delivery, "sent");
    assert.equal(row.blanks.spentAt, null);
    assert.deepEqual(row.blanksPresses.map((each) => [each.byUid, each.count]), [["zach", 3]]);
    assert.deepEqual(answerOf(id, "amara"), first, "the press touched Amara's answers");
    // One message, to her own address, as a notice with its own line.
    const mail = w.mailText();
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, "amara@example.com");
    assert.equal(mail[0].kind, "notice");
    assert.equal(mail[0].surface, "survey-blanks");
    assert.equal(mail[0].subject, "Before you start: 3 questions you left blank");
    assert.match(mail[0].text, /You are getting this because you sent this survey with some of its questions left blank/);
    assert.match(
      mail[0].text,
      /You sent “Before you start” for AGI Strategy with 3 questions left blank\. This link shows only those questions, never your answers\. Your first answers stay exactly as you sent them, and what you send now is added to them\. It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it\. It closes on Wed 4 Nov\./,
    );
    assert.match(mail[0].text, /Answer the 3 questions/);
    assert.ok(mail[0].text.includes(`/survey/${row.blanks.token}`), "the email does not carry the link of blanks");
    assert.ok(!mail[0].text.includes(row.token), "the email carries the first link");
    // Never an answer: none of the words her answers stand for.
    for (const label of ["Undergraduate", "Computer science", "Considering"]) assert.ok(!mail[0].text.includes(label), `the email names an answer: ${label}`);
    assert.equal(w.world.mail[0].replyTo, "ai-safety@uonsu.com");
  });

  test("refused: a stale count, nothing blank, nobody, somebody who has not answered, and a closed survey; nothing is sent", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    answered(id, "bea", WHOLE);
    assert.deepEqual(short(await press(id, "zach", {})), [400, REFUSAL.body]);
    assert.deepEqual(short(await press(id, "zach", { questions: 0 })), [400, REFUSAL.body]);
    const stale = await press(id, "zach", { questions: 2 });
    assert.deepEqual([stale.status, stale.body], [409, { error: words.blanksCountChangedWords(3), questions: 3 }]);
    assert.deepEqual(short(await press(id, "zach", { questions: 1 }, { subject: "bea" })), [409, BLANKS_REFUSAL.nothingLeft]);
    assert.deepEqual(short(await press(id, "zach", { questions: 1 }, { subject: "dev" })), [409, BLANKS_REFUSAL.notAnswered]);
    assert.deepEqual(short(await press(id, "zach", { questions: 1 }, { subject: "nobody" })), [404, BLANKS_REFUSAL.nobody]);
    assert.deepEqual(short(await press(id, "zach", { questions: 1 }, { subject: "a/b" })), [404, BLANKS_REFUSAL.nobody]);
    assert.equal(rowOf(id, "amara").blanks, undefined, "a refused press wrote the link");
    assert.equal((await call("zach", w.routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    assert.deepEqual(short(await press(id, "zach")), [409, BLANKS_REFUSAL.closed]);
    assert.deepEqual(w.world.mail, []);
  });

  test("the do-not-email list is read as the survey's own email reads it, and a fourth press in a day is refused", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    w.world.mailFate = () => "suppressed";
    const held = await press(id, "zach");
    assert.equal(held.status, 200);
    assert.equal(held.body.delivery, "suppressed");
    assert.equal(held.body.pressed, "Not sent Thu 29 Oct, 9am by Zach Levin: the address is on the do-not-email list.");
    assert.equal(rowOf(id, "amara").blanks.delivery, "suppressed");
    w.world.mailFate = null;
    // A second press: a new secret, and the first link of blanks opens nothing.
    const firstBlanks = rowOf(id, "amara").blanks.token;
    assert.equal((await press(id, "zach")).status, 200);
    const secondBlanks = rowOf(id, "amara").blanks.token;
    assert.notEqual(secondBlanks, firstBlanks);
    assert.match(await linkPage(firstBlanks), /This link doesn’t open a survey/);
    assert.match(await linkPage(secondBlanks), new RegExp(BLANKS_WORDS.lead.slice(0, 40)));
    assert.equal((await press(id, "zach")).status, 200);
    assert.deepEqual(short(await press(id, "zach")), [429, BLANKS_REFUSAL.tooMany]);
    assert.equal(rowOf(id, "amara").blanksPresses.length, 3);
  });
});

// ---------------------------------------------------------------------------
// 2. The link, and the signed-in page
// ---------------------------------------------------------------------------

describe("the link shows only what was left blank, and keeps what comes back beside the first answers", () => {
  test("only the blank questions, a grid with only its blank line, never an answer; opening it writes nothing", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    await press(id, "zach");
    const { token, blanks } = rowOf(id, "amara");
    const before = w.everything();
    const text = await linkPage(blanks.token);
    assert.equal(w.everything(), before, "opening the link wrote something");
    assert.ok(text.includes(BLANKS_WORDS.lead), "the line at the top is not there");
    for (const shown of ["How likely is it that in 5 years", "How much do you agree?", "What do you most want to get out of this programme"]) {
      assert.ok(text.includes(shown), `${shown} is not on the link`);
    }
    for (const hidden of ["Which best describes you right now?", "Level of study", "How did you first hear about NAISI?", "Don’t share my details"]) {
      assert.ok(!text.includes(hidden), `${hidden} is on the link`);
    }
    const c7 = w.survey(id).items.find((item) => item.id === "q_c7");
    assert.ok(text.includes(c7.lines.find((line) => line.id === "l_contribute").label), "the blank line is not shown");
    assert.ok(!text.includes(c7.lines.find((line) => line.id === "l_next").label), "the line she answered is shown");
    // The first link still says she has answered; it never reopens the survey.
    assert.match(await linkPage(token), /You’ve answered/);
  });

  test("what comes back answers only what was blank, every one of it, once; the first answers never change", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    await press(id, "zach");
    const token = rowOf(id, "amara").blanks.token;
    const first = structuredClone(answerOf(id, "amara").answers);
    assert.deepEqual(short(await sendByLink(token, { ...FILL, q_c1: { type: "choice", optionId: "o_stage4" } })), [400, BLANKS_REFUSAL.notBlank]);
    assert.deepEqual(short(await sendByLink(token, { ...FILL, q_c7: { type: "lines", values: { l_next: 5, l_contribute: 5 } } })), [400, BLANKS_REFUSAL.notBlank]);
    const missing = await sendByLink(token, { q_c2: FILL.q_c2, q_c7: FILL.q_c7 });
    assert.deepEqual([missing.status, missing.body], [400, { error: BLANKS_REFUSAL.missing, missing: ["q_p6"] }]);
    assert.deepEqual(short(await sendByLink(token, { ...FILL, q_c2: { type: "percent", value: 101 } })), [400, "Give a number from 0 to 100."]);
    assert.deepEqual(short(await sendByLink("x".repeat(43), FILL)), [404, REFUSAL.noLink]);
    assert.deepEqual(short(await sendByLink(rowOf(id, "amara").token, FILL)), [404, REFUSAL.noLink], "the first link keeps a later send");
    assert.equal(answerOf(id, "amara").fills, undefined, "a refused send kept something");

    assert.deepEqual(short(await sendByLink(token, FILL)), [200, null]);
    const kept = answerOf(id, "amara");
    assert.deepEqual(kept.answers, first, "the first answers changed");
    assert.equal(kept.fills.length, 1);
    assert.deepEqual(kept.fills[0].answers, FILL);
    assert.equal(kept.fills[0].via, "link");
    assert.equal(kept.fills[0].afterFirstSession, false);
    assert.equal(kept.fills[0].sentAt.toISOString(), NOW.toISOString());
    assert.deepEqual(Object.keys(kept.fills[0]).sort(), ["afterFirstSession", "answers", "sentAt", "via"], "a later send keeps something more");
    assert.ok(rowOf(id, "amara").blanks.spentAt, "the link was not spent");
    assert.deepEqual(short(await sendByLink(token, FILL)), [409, BLANKS_REFUSAL.spent]);
    assert.match(await linkPage(token), /You’ve sent these/);
    // Nothing is blank now, so the press is refused.
    assert.deepEqual(short(await press(id, "zach")), [409, BLANKS_REFUSAL.nothingLeft]);
  });

  test("signed in, the survey's page shows only the blanks until they are sent; refused during view-as and to anybody else", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    answered(id, "bea", WHOLE);
    const page = async (who) => (await w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.agi, surveyId: id }) }, who)).text;
    assert.match(await page("amara"), /You’ve answered/, "before a press, the page is as it was");
    await press(id, "zach");
    const shown = await page("amara");
    assert.ok(shown.includes(BLANKS_WORDS.lead));
    assert.ok(!shown.includes("Which best describes you right now?"));
    const send = (who, answers = FILL, options = {}) => call(who, signedInRoute.POST, { surveyId: id }, { body: { answers }, ...options });
    assert.equal((await send("amara", FILL, { viewAs: true })).status, 403);
    assert.deepEqual(short(await send(null)), [401, REFUSAL.notSignedIn]);
    assert.deepEqual(short(await send("nobody")), [404, REFUSAL.notYours]);
    assert.deepEqual(short(await send("bea")), [409, BLANKS_REFUSAL.nothingLeft]);
    assert.deepEqual(short(await call("amara", signedInRoute.POST, { surveyId: id }, { body: {} })), [400, REFUSAL.body]);
    assert.equal(answerOf(id, "amara").fills, undefined);
    assert.deepEqual(short(await send("amara")), [200, null]);
    assert.equal(answerOf(id, "amara").fills[0].via, "signed-in");
    assert.match(await page("amara"), /You’ve answered/);
    assert.deepEqual(short(await send("amara")), [409, BLANKS_REFUSAL.spent]);
  });

  test("a survey that has closed: the link says so and keeps nothing", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    await press(id, "zach");
    const token = rowOf(id, "amara").blanks.token;
    await call("zach", w.routes.close.POST, { surveyId: id }, { body: {} });
    assert.match(await linkPage(token), /This survey has closed/);
    assert.deepEqual(short(await sendByLink(token, FILL)), [409, REFUSAL.closed]);
    assert.equal(answerOf(id, "amara").fills, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Every reader merges
// ---------------------------------------------------------------------------

describe("every reader reads the first answers with what came later", () => {
  test("Who answered marks what is blank and the press; the results, the spreadsheet and one person's page read the later answers", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    answered(id, "bea", WHOLE);
    const tab = async () => (await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach")).text;
    const before = await tab();
    assert.match(before, /Amara Okafor .* Left 3 blank Send the questions they left blank/);
    assert.equal((before.match(/Left \d+ blank/g) ?? []).length, 1, "somebody with nothing blank is marked");
    await press(id, "zach");
    assert.match(await tab(), /Left 3 blank Sent Thu 29 Oct, 9am by Zach Levin Send the questions they left blank/);
    await sendByLink(rowOf(id, "amara").blanks.token, FILL);
    const after = await tab();
    assert.ok(!/Left \d+ blank/.test(after), "a filled survey is still marked as left blank");
    assert.match(after, /Answered the blanks Thu 29 Oct, 9am/);

    // Results count the later answer.
    const results = await adminView.resultsView(w.world.db, await repo.readSurvey(w.world.db, id), false);
    const c2 = results.questions.find((question) => question.id === "q_c2");
    assert.equal(c2.respondents, 2, "the results leave out the percentage Amara sent later");
    assert.equal(c2.highest, 35);

    // The spreadsheet has it, in its place.
    const file = await w.exportAs("zach", id);
    assert.equal(file.status, 200);
    assert.ok(file.text.includes("35"), "the spreadsheet leaves out what came later");

    // One person's page marks it, and when.
    const opened = await call("zach", openingRoute.POST, { surveyId: id, who: "amara" });
    assert.equal(opened.status, 200);
    const cells = [opened.body.person.change, ...opened.body.person.rest].filter(Boolean).flatMap((table) => table.rows).flatMap((row) => row.cells ?? []);
    assert.ok(cells.some((cell) => cell.lines.includes("35%") && cell.later === "Sent later, Thu 29 Oct, 9am"), "the later answer is not marked");
    assert.ok(cells.some((cell) => cell.lines.includes("5") && cell.later === "Sent later, Thu 29 Oct, 9am"), "the later line is not marked");
    assert.ok(cells.some((cell) => cell.lines.includes("2") && cell.later === ""), "a first answer is marked as later");
    assert.deepEqual(opened.body.person.blanks.map((each) => [each.name, each.row.marker, each.row.pressed]), [["AGI Strategy: before", "", "Answered the blanks Thu 29 Oct, 9am"]]);
  });

  test("before the first session: a later send after it is left out, the first answers it sits beside are kept", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "bea", AMARA);
    await press(id, "zach", undefined, { subject: "bea" });
    // Bea's group meets at 6pm tonight: her later send comes after it.
    t.mock.timers.setTime(new Date("2026-10-29T19:30:00Z").getTime());
    assert.deepEqual(short(await sendByLink(rowOf(id, "bea").blanks.token, FILL)), [200, null]);
    assert.equal(answerOf(id, "bea").fills[0].afterFirstSession, true);
    const survey = await repo.readSurvey(w.world.db, id);
    const all = await adminView.resultsView(w.world.db, survey, false);
    const kept = await adminView.resultsView(w.world.db, survey, true);
    assert.equal(all.answers, 1);
    assert.equal(kept.answers, 1, "the first answers, sent before the session, were left out");
    const has = (view, qid) => JSON.stringify(view.questions.find((question) => question.id === qid));
    assert.match(has(all, "q_c2"), /35/);
    assert.ok(!/35/.test(has(kept, "q_c2")), "the later send after the first session was counted");
    assert.equal(has(kept, "q_c1"), has(all, "q_c1"), "the first send's answers changed with the switch");
  });
});

// ---------------------------------------------------------------------------
// 4. Names off, and an account deleted
// ---------------------------------------------------------------------------

describe("names off and deletion take a later send with the answer it sits beside", () => {
  test("names off: the answer and its later send name nobody; the row, and its link of blanks, are gone", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    await press(id, "zach");
    const token = rowOf(id, "amara").blanks.token;
    await sendByLink(token, FILL);
    await w.lib.namesOff.takeNamesOffSurvey(w.world.db, { id });
    const [answer] = w.answers(id);
    assert.equal(answer.respondent, null);
    assert.deepEqual(answer.fills[0].answers, FILL, "the later send went with the name");
    assert.ok(!JSON.stringify(answer.fills).includes("amara"), "a later send names the person");
    assert.equal(w.people(id).length, 0);
    assert.match(await linkPage(token), /This link doesn’t open a survey/);
  });

  test("an account deleted: the same, at once", async (t) => {
    clock(t);
    w.reset();
    const id = await sentSurvey();
    answered(id, "amara", AMARA);
    await press(id, "zach");
    await sendByLink(rowOf(id, "amara").blanks.token, FILL);
    const off = await w.lib.namesOff.takeNamesOffForAccount(w.world.db, "amara");
    assert.deepEqual(off, { answers: 1, people: 1 });
    assert.equal(answerOf(id, "amara"), undefined);
    assert.equal(w.answers(id).filter((answer) => answer.respondent === null && answer.fills?.length === 1).length, 1);
  });
});

// ---------------------------------------------------------------------------
// 5. A survey after an event: a guest
// ---------------------------------------------------------------------------

describe("a survey after an event: a guest with no account, by the address they gave the event", () => {
  test("pressed, emailed to the guest, answered through the link, and marked on Who answered", async (t) => {
    const e = await makeEventSurveyWorld("__surveysBlanksEvent");
    t.mock.timers.enable({ apis: ["Date"], now: NEXT_DAY });
    e.reset();
    const id = (await e.make()).body.survey.id;
    const evPress = (path, who, body = {}, params = {}) => e.call(who, path, { surveyId: id, ...params }, { body });
    await evPress((await e.route("surveys/[surveyId]/test")).POST, "zach", { email: "survey" });
    assert.equal((await evPress((await e.route("surveys/[surveyId]/send")).POST, "zach", { to: "everyone", emails: 5 })).status, 200);
    e.world.mail.length = 0;
    // Gwen answered three of the five, before every question was required.
    const row = e.rowOf(id, RSVP.gwen);
    e.world.db.seed(`surveyAnswers/a_gwen`, {
      surveyId: id,
      eventId: EVENT_ID,
      respondent: { kind: "guest", signupId: RSVP.gwen },
      answers: { q_ev_how: { type: "rating", value: 5 }, q_ev_again: { type: "choice", optionId: "o_ev_yes" }, q_ev_heard: { type: "choice", optionId: "o_ev_friend" } },
      sentAt: NEXT_DAY,
      via: "link",
    });
    const { path, ...data } = row;
    e.world.db.seed(path, { ...data, answered: true });

    const tab = async () => (await e.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/page.tsx", { params: Promise.resolve({ surveyId: id }) }, "zach")).text;
    assert.match(await tab(), /Gwen Price .* Left 2 blank Send the questions they left blank/);

    const blanksPress = (await e.route("surveys/[surveyId]/people/[who]/blanks")).POST;
    const pressed = await evPress(blanksPress, "zach", { questions: 2 }, { who: `g_${RSVP.gwen}` });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const mail = e.mailText();
    assert.deepEqual(mail.map((message) => [message.to, message.kind, message.surface]), [["gwen@example.com", "notice", "survey-blanks"]]);
    assert.match(mail[0].text, /You sent “How was VR games night\?” for VR games night with 2 questions left blank\./);
    const token = e.rowOf(id, RSVP.gwen).blanks.token;
    const page = await e.page("app/survey/[token]/page.tsx", { params: Promise.resolve({ token }) });
    assert.match(page.text, /VR games night · Sun 1 Nov/);
    assert.ok(page.text.includes(BLANKS_WORDS.lead));
    assert.ok(!page.text.includes("How was it?"), "a question Gwen answered is on the link");

    const fill = { q_ev_next: { type: "choices", optionIds: ["o_ev_quiz"] }, q_ev_change: { type: "text", text: "More games." } };
    const sent = await e.call(null, (await e.route("surveys/blanks")).POST, {}, { body: { token, answers: fill } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const kept = e.answers(id).find((answer) => answer.respondent?.signupId === RSVP.gwen);
    assert.deepEqual(Object.keys(kept.fills[0]).sort(), ["answers", "sentAt", "via"], "a survey after an event keeps no group");
    assert.match(await tab(), /Answered the blanks Mon 2 Nov, 10am/);
  });
});

