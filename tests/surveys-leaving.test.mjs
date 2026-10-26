/**
 * The leaving survey (Q46; docs/surveys.md, "The leaving survey"):
 * confidential like every survey on the site, one per programme, made by an
 * admin from its own template, never sent, with no closing day.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE TEMPLATE: three questions, about a minute, every one skippable,
 *     with ids of its own, the same for every programme.
 *  2. MAKING IT: admins only, one per programme, no closing day, pairing with
 *     nothing (the stages still pair with each other), and its test link
 *     made with it, so an admin can see it as people will.
 *  3. OPENING IT, NEVER SENDING IT: one press by an admin, claimed once,
 *     which fixes its words as a first send does; the send, the reminder and
 *     the test of an email are refused for it in a sentence; it takes answers
 *     until an admin closes it by hand.
 *  4. THE ADMINS' PAGES: New survey's card in sv-new's words, the list's "No
 *     closing date", its Open tab before and after.
 *  5. THE PAGE PEOPLE ANSWER: the confidential box in its own words (the
 *     boards drew it anonymous; Zach: confidential, Q46), and no closing day.
 *  6. REACHING IT: somebody who leaves by their own hand, by either door,
 *     while it is open, gets their own row once, made as they leave; their
 *     email links their own link in place of the outside form; the page that
 *     says they left draws its card while it is theirs to answer, and then
 *     only that they left; My programmes draws "A survey for you". Nobody
 *     presses send, and nothing reaches anybody who did not leave: somebody
 *     staff took off, somebody who stays, somebody on an open run, anybody
 *     while it is a draft or once it is closed.
 *  7. RESULTS: on its results page as every survey's, counted of the people
 *     it reached, for admins; and for the programme's lead (Q49 A), under the
 *     programme, from the first answer, never a name, its comments in an
 *     order that says nothing of when each came. Another programme's lead, a
 *     reviewer, a facilitator, a member and somebody signed out read none.
 *
 * Real: every survey route and page this loads, the leave routes and pages
 * the leaving world loads, the libraries. Faked: what
 * tests/lib/leavingWorld.mjs fakes. The clock is Tue 17 Nov 2026 at noon in
 * London, week 3 of AGI Strategy's run, which Claudia leads.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { AGI, NOW, OPEN_RUN, RUN, ROUND, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";
import { TAIS } from "./lib/applicationsSmallTerm.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeLeavingWorld("__surveysLeaving");
const { call, loadTs, world } = w;

const route = async (...parts) => loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const routes = {
  create: await route(),
  open: await route("[surveyId]", "open"),
  send: await route("[surveyId]", "send"),
  remind: await route("[surveyId]", "remind"),
  test: await route("[surveyId]", "test"),
  close: await route("[surveyId]", "close"),
  questions: await route("[surveyId]", "questions"),
  answerByLink: await route("answer"),
};
const admin = async (...parts) => (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", ...parts, "page.tsx"))).default;
const pages = {
  newSurvey: await admin("new"),
  list: await admin(),
  send: await admin("[surveyId]", "send"),
  results: await admin("[surveyId]", "results"),
  answered: await admin("[surveyId]", "answered"),
  link: (await loadTs(join("app", "survey", "[token]", "page.tsx"))).default,
  lead: (
    await loadTs(join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "surveys", "[surveyId]", "page.tsx"))
  ).default,
};
const lib = {
  templates: await loadTs(join("lib", "surveys", "templates.ts")),
  items: await loadTs(join("lib", "surveys", "items.ts")),
  words: await loadTs(join("lib", "surveys", "words.ts")),
  repo: await loadTs(join("lib", "surveys", "repo.ts")),
  records: await loadTs(join("lib", "firestore", "surveys.ts")),
};
const NewSurveyForm = (await loadTs(join("features", "surveys", "admin", "NewSurveyForm.tsx"))).default;
const { REFUSAL, OPEN_WORDS } = lib.words;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

const survey = (id) => world.db.read(`surveys/${id}`);
const surveyIds = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("surveys/"))
    .map((path) => path.slice("surveys/".length));

/** An admin makes AGI Strategy's leaving survey (or another stage, by `body.stage`); answers the request's answer. */
const make = (who = "zach", body = {}) => call(who, routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving", ...body } });

/** Make it and answer its id. */
async function made() {
  const answer = await make();
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.survey.id;
}

/** Make it, open it and answer its id. */
async function opened() {
  const id = await made();
  const open = await call("zach", routes.open.POST, { surveyId: id }, { body: {} });
  assert.equal(open.status, 200, JSON.stringify(open.body));
  return id;
}

/** A page's words, rendered as the server would render it for `who`; a redirect answers where it went. */
async function page(render, props, who = null) {
  world.user = w.sessionOf(who);
  try {
    const html = renderToStaticMarkup(await render(props));
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. The template
// ---------------------------------------------------------------------------

describe("1. the leaving template", () => {
  test("three questions, about a minute, every one skippable, the same for every programme", () => {
    const items = lib.templates.templateItems("leaving", "fellowship", null);
    const questions = lib.items.surveyQuestionsOf(items);
    assert.deepEqual(
      questions.map((question) => [question.id, question.type, question.title]),
      [
        ["q_leave_why", "multipleChoice", "What made you leave?"],
        ["q_leave_stay", "longText", "What would have helped you stay?"],
        ["q_leave_again", "singleChoice", "Would you take part in a NAISI programme again?"],
      ],
    );
    assert.deepEqual(
      questions[0].options.map((option) => option.label),
      [
        "I didn’t have enough time",
        "The session times stopped working for me",
        "It wasn’t what I expected",
        "The reading or the pace was too much",
        "My group didn’t work for me",
        "Something outside the programme",
        "Something else",
      ],
    );
    assert.equal(questions[1].hint, "Anything we could change, however small.");
    assert.deepEqual(questions[2].options.map((option) => option.label), ["Yes", "Maybe", "No"]);
    assert.deepEqual(lib.items.validateSurveyItems(items), []);
    assert.ok(questions.every((question) => question.required !== true), "a leaving question is required");
    assert.equal(lib.templates.templateMinutes("leaving"), 1);
    assert.deepEqual(lib.templates.templateItems("leaving", "incubator", "alignment"), items, "an incubator's leaving survey is the same");
    // None of its ids is a stage's: it compares with nothing they ask.
    const staged = new Set(
      lib.templates.SURVEY_STAGES.flatMap((stage) => lib.items.surveyQuestionsOf(lib.templates.templateItems(stage, "incubator", "alignment")).map((question) => question.id)),
    );
    assert.deepEqual(questions.filter((question) => staged.has(question.id)), []);
  });

  test("its words: its card, its name, its title and its intro", () => {
    const { STAGE_WORDS, surveyNameFor, introFor } = lib.words;
    assert.deepEqual(STAGE_WORDS.leaving, {
      name: "leaving",
      title: "Why you left",
      card: "Leaving a programme",
      cardLine: "Linked from the leaving screen and email. Replaces today’s outside form.",
    });
    assert.equal(surveyNameFor("AGI Strategy", "leaving"), "AGI Strategy: leaving");
    assert.equal(introFor("leaving", 3, 1), "Tell us why you left, so we can do better. It’s 3 questions and takes about a minute.");
  });
});

// ---------------------------------------------------------------------------
// 2. Making it
// ---------------------------------------------------------------------------

describe("2. making it: admins only, one per programme, no closing day, no pair", () => {
  test("an admin makes it from its template, with no closing day, pairing with nothing, and its test link made with it", async () => {
    const id = await made();
    const stored = survey(id);
    assert.equal(stored.kind, "leaving");
    assert.deepEqual(stored.audience, { kind: "leaving", roundId: ROUND, programmeId: AGI });
    assert.equal(stored.name, "AGI Strategy: leaving");
    assert.equal(stored.title, "Why you left");
    assert.equal(stored.intro, "Tell us why you left, so we can do better. It’s 3 questions and takes about a minute.");
    assert.equal(stored.minutes, 1);
    assert.equal(stored.closesAt, null);
    assert.equal(stored.pairOf, null);
    assert.equal(stored.firstSentAt, null);
    assert.equal(stored.reached, 0);
    assert.ok(lib.records.isSurveyToken(stored.testToken), "no test link was made with it");
    assert.match(stored.namesOffOn, /^2028-12-\d\d$/, "names come off two years after the programme");
    assert.deepEqual(lib.items.surveyQuestionsOf(stored.items).map((question) => question.id), ["q_leave_why", "q_leave_stay", "q_leave_again"]);
  });

  test("a closing day sent with it is not read: it has none", async () => {
    const answer = await make("zach", { closesOn: "2026-11-30" });
    assert.equal(answer.status, 200);
    assert.equal(survey(answer.body.survey.id).closesAt, null);
  });

  test("one per programme: a second for the same programme is refused, and New survey offers another programme its own", async () => {
    await made();
    assert.deepEqual(await make(), { status: 409, body: { error: "It has its leaving survey already." } });
    const offered = await page(pages.newSurvey, {}, "zach");
    assert.ok(offered.text.includes("AGI Strategy (Autumn 2026): It has its leaving survey already."), offered.text);
    assert.ok(!offered.text.includes("Technical AI Safety (Autumn 2026): It has its leaving survey already."));
    assert.equal(surveyIds().length, 1);
  });

  test("it pairs with nothing, and the stages still pair with each other", async () => {
    const before = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: "2026-11-30" } });
    assert.equal(before.status, 200, JSON.stringify(before.body));
    const leaving = await made();
    assert.equal(survey(leaving).pairOf, null);
    const after = await call("zach", routes.create.POST, { }, { body: { roundId: ROUND, programmeId: AGI, stage: "after", closesOn: "2026-12-20" } });
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.equal(survey(after.body.survey.id).pairOf, before.body.survey.id);
  });

  test("only admins make it, and never in a view-as session", async () => {
    for (const who of ["claudia", "tess", "rahul", "amara", "lloyd"]) {
      assert.equal((await make(who)).status, 403, who);
    }
    assert.equal((await make(null)).status, 401);
    assert.equal((await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving" }, viewAs: true })).status, 403);
    assert.deepEqual(surveyIds(), []);
  });
});

// ---------------------------------------------------------------------------
// 3. Opening it, never sending it
// ---------------------------------------------------------------------------

describe("3. opened by an admin, once; never sent, reminded or tested", () => {
  test("an admin opens it once: it fixes the survey and the day names come off, and emails nobody", async () => {
    const id = await made();
    const mailBefore = world.mail.length;
    for (const who of ["claudia", "rahul", "amara"]) {
      assert.equal((await call(who, routes.open.POST, { surveyId: id }, { body: {} })).status, 403, who);
    }
    assert.equal((await call(null, routes.open.POST, { surveyId: id }, { body: {} })).status, 401);
    assert.equal((await call("zach", routes.open.POST, { surveyId: id }, { body: {}, viewAs: true })).status, 403);
    assert.equal(survey(id).firstSentAt, null);
    assert.deepEqual(await call("zach", routes.open.POST, { surveyId: id }, { body: {} }), { status: 200, body: { ok: true } });
    assert.ok(survey(id).firstSentAt, "opening it stamped nothing");
    assert.match(survey(id).namesOffOn, /^2028-12-\d\d$/);
    assert.deepEqual(await call("zach", routes.open.POST, { surveyId: id }, { body: {} }), { status: 409, body: { error: REFUSAL.alreadyOpen } });
    assert.equal(world.mail.length, mailBefore, "opening it emailed somebody");
    // Its words are fixed now, as a sent survey's are.
    const save = await call("zach", routes.questions.POST, { surveyId: id }, { body: { title: "Why you left", intro: "x", minutes: 1, closesOn: "", items: survey(id).items } });
    assert.deepEqual(save, { status: 409, body: { error: REFUSAL.sent } });
  });

  test("two presses of Open it at once open it once: its transaction holds", async () => {
    const id = await made();
    const presses = await Promise.all([1, 2].map(() => call("zach", routes.open.POST, { surveyId: id }, { body: {} })));
    assert.deepEqual(presses.map((press) => press.status).sort(), [200, 409]);
    assert.ok(survey(id).firstSentAt);
  });

  test("a survey that is not a leaving survey is not opened: it is sent", async () => {
    const before = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: "2026-11-30" } });
    assert.deepEqual(await call("zach", routes.open.POST, { surveyId: before.body.survey.id }, { body: {} }), {
      status: 409,
      body: { error: REFUSAL.notLeaving },
    });
    assert.deepEqual(await call("zach", routes.open.POST, { surveyId: "nothingHere" }, { body: {} }), { status: 404, body: { error: REFUSAL.noSurvey } });
  });

  test("the send, the reminder and an email's test are refused for it, open or not, in one sentence", async () => {
    const id = await made();
    for (const step of ["draft", "open"]) {
      if (step === "open") await call("zach", routes.open.POST, { surveyId: id }, { body: {} });
      assert.deepEqual(await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 0 } }), { status: 409, body: { error: REFUSAL.leavingNotSent } }, step);
      assert.deepEqual(await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "joined", emails: 0 } }), { status: 409, body: { error: REFUSAL.leavingNotSent } }, step);
      assert.deepEqual(await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 0 } }), { status: 409, body: { error: REFUSAL.leavingNotSent } }, step);
      assert.deepEqual(await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } }), { status: 409, body: { error: REFUSAL.leavingNotSent } }, step);
    }
    assert.equal(REFUSAL.leavingNotSent, "A leaving survey isn’t sent: once it’s open, it reaches each person as they leave the programme.");
    assert.equal(world.mail.length, 0);
  });

  test("it takes answers until an admin closes it, with no closing day", async () => {
    const id = await opened();
    const read = () => lib.records.normalizeSurvey(id, survey(id));
    assert.equal(lib.repo.isOpen(read(), new Date("2031-01-01T00:00:00Z")), true, "a leaving survey closed on its own");
    assert.equal((await call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    assert.equal(lib.repo.isOpen(read(), new Date()), false);
    // Any other survey with no closing time takes nothing.
    assert.equal(lib.repo.isOpen({ ...read(), kind: "before", closedAt: null }, new Date()), false);
  });

  test("its editor saves its words with no closing day, until it is opened", async () => {
    const id = await made();
    const items = survey(id).items;
    const save = await call("zach", routes.questions.POST, { surveyId: id }, { body: { title: "Why did you leave?", intro: "Tell us.", minutes: 2, closesOn: "", items } });
    assert.deepEqual(save, { status: 200, body: { ok: true } });
    assert.equal(survey(id).title, "Why did you leave?");
    assert.equal(survey(id).closesAt, null);
  });
});

// ---------------------------------------------------------------------------
// 4. The admins' pages
// ---------------------------------------------------------------------------

describe("4. the admins' pages", () => {
  test("New survey offers its card in sv-new's words, with no closing day to pick", async () => {
    const offered = await page(pages.newSurvey, {}, "zach");
    assert.ok(offered.text.includes("Leaving a programme Confidential 3 questions · about a minute. Linked from the leaving screen and email. Replaces today’s outside form."), offered.text);
    const card = renderToStaticMarkup(
      createElement(NewSurveyForm, {
        stage: "leaving",
        heading: "Leaving a programme",
        line: "Linked from the leaving screen and email. Replaces today’s outside form.",
        size: "3 questions · about a minute",
        programmes: [{ roundId: ROUND, programmeId: AGI, name: "AGI Strategy", formName: "Autumn 2026", kind: "fellowship", blocked: "" }],
        strands: [],
        today: "2026-11-17",
        closes: false,
      }),
    );
    assert.ok(!card.includes('name="closesOn"'), "the leaving card asks for a closing day");
    assert.ok(
      textOf(card).includes(
        "No closing day, and nobody presses send: once you open it, everybody who leaves the programme gets their own link to it, on the page that says they left and in the email that says so.",
      ),
    );
  });

  test("the list says No closing date while it is open, and offers no reminder, with somebody yet to answer", async () => {
    const id = await opened();
    // Amara has left and not answered: a sent survey's row would offer Remind here.
    assert.equal((await w.leave("amara")).status, 200);
    const listed = await page(pages.list, {}, "zach");
    assert.ok(listed.text.includes("AGI Strategy: leaving Confidential Fellowship: AGI Strategy 0 of 1 No closing date"), listed.text);
    assert.ok(!listed.html.includes(`/admin/surveys/${id}/send"`), "the list offers a reminder for a leaving survey");
    assert.ok(!listed.text.includes("haven’t answered"), listed.text);
  });

  test("its Open tab: before opening, what it does, the way to see it and Open it; once open, since when and what it reached", async () => {
    const id = await made();
    const before = await page(pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(before.text.includes(`${OPEN_WORDS.heading} ${OPEN_WORDS.how}`), before.text);
    assert.ok(before.html.includes(`href="/survey/${survey(id).testToken}"`), "no way to see it as people will");
    assert.ok(before.text.includes(`${OPEN_WORDS.see} ${OPEN_WORDS.fixes} ${OPEN_WORDS.open}`), before.text);
    assert.ok(before.text.includes("Who Everyone who leaves AGI Strategy"), before.text);
    // Its tabs: the fourth is Open, at the Send tab's address.
    assert.ok(before.text.includes("Results Who answered 0 Questions Open"), before.text);
    await call("zach", routes.open.POST, { surveyId: id }, { body: {} });
    const after = await page(pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(after.text.includes("Open since Tue 17 Nov. Nobody has left since it opened."), after.text);
    assert.ok(after.text.includes("Close it now"), after.text);
    assert.ok(!after.text.includes(OPEN_WORDS.open + " "), "Open it is still offered once open");
  });
});

// ---------------------------------------------------------------------------
// 5. The page people answer
// ---------------------------------------------------------------------------

describe("5. the page people answer: confidential, in its own words, with no closing day", () => {
  test("its test link shows it as people will: the box in its own words, no closing day, and nothing kept", async () => {
    const id = await made();
    const shown = await page(pages.link, { params: Promise.resolve({ token: survey(id).testToken }) });
    const names = lib.words.dateKeyWords(survey(id).namesOffOn);
    for (const words of [
      "Fellowship: AGI Strategy Why you left Tell us why you left, so we can do better. It’s 3 questions and takes about a minute.",
      "Confidential Only NAISI’s admins can see who said what. Claudia sees totals and comments, never names. Your facilitators never see your answers. " +
        "Nothing you say changes your account or a future application. Totals may go in reports to the committee and our funder, Kairos. " +
        `Your name comes off on ${names}, two years after the fellowship ends. The totals stay. We ask who you are so each person answers once.`,
      "What made you leave?",
      "Once sent, your answers can’t change.",
      lib.words.STATE_WORDS.test,
    ]) {
      assert.ok(shown.text.includes(words), `missing "${words}": ${shown.text}`);
    }
    // Never the words the boards drew for an anonymous survey, and no closing day.
    assert.doesNotMatch(shown.text, /anonymous|never records who answers|It closes on/i);
    assert.ok(!shown.html.includes("Send my answers"), "a test link offers to send");
  });
});

// ---------------------------------------------------------------------------
// 6. Reaching it: as somebody leaves, and nobody else
// ---------------------------------------------------------------------------

/** The outside form, set in Settings: the leaving email offers it only where no leaving survey reached the person. */
const OUTSIDE_FORM = "https://example.com/naisi-leaving-form";

/** Every survey row, as stored. */
const rows = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => world.db.read(path));
const rowOf = (uid) => rows().find((row) => row.respondent?.uid === uid) ?? null;

/** The email handed to the mail door for `to`, as its reader reads it, and the links in it. */
async function emailTo(to) {
  const sent = world.mail.filter((message) => message.to === to);
  assert.equal(sent.length, 1, `${to} was emailed ${sent.length} times`);
  const html = await render(sent[0].react);
  // A link's closing tag reads as a space before the comma after it; the email shows none.
  return { text: textOf(html).replace(/ ,/g, ","), hrefs: [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]) };
}

/** "I can’t make it" from somebody in a group, the reply route's own door to the same leave. */
const cantMakeIt = (who) =>
  call(who, w.join.routes.reply.POST, { roundId: ROUND }, { body: { reply: "cant-make-it", reason: { kind: "times", other: "" } } });

const draw = (Page, who, params) => w.draw(Page, who, params);

const LEAVING_LINE = "We’d like to know why you left, so we can do better: tell us in 3 questions, about a minute. " +
  "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.";
const CARD = "Tell us why Answer 3 questions, about a minute. It’s confidential: only NAISI’s admins can see who said what.";

describe("6. reaching it: as somebody leaves by their own hand, and nobody else", () => {
  beforeEach(() => {
    world.db.seed("config/courses", { dropOutFeedbackUrl: OUTSIDE_FORM });
  });

  test("leaving from the programme page makes their own row, once, and their email links it in place of the outside form", async () => {
    const id = await opened();
    const left = await w.leave("amara");
    assert.equal(left.status, 200, JSON.stringify(left.body));
    // The outside form is not handed back beside the survey.
    assert.equal(left.body.feedbackUrl, "");
    const row = rowOf("amara");
    assert.ok(row, "leaving made no row");
    assert.equal(row.surveyId, id);
    assert.ok(lib.records.isSurveyToken(row.token));
    assert.equal(row.answered, false);
    assert.ok(row.sentAt, "the row does not say when it reached Amara");
    assert.equal(survey(id).reached, 1);
    // Its Open tab counts the person who left, and says nobody has answered yet.
    const tab = await page(pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(tab.text.includes("1 person has left since it opened, and nobody has answered yet."), tab.text);
    const email = await emailTo("amara@example.com");
    assert.ok(email.text.includes(LEAVING_LINE), email.text);
    assert.ok(email.hrefs.includes(`https://naisi.invalid/survey/${row.token}`), "the email does not open Amara's own link");
    assert.ok(!email.hrefs.includes(OUTSIDE_FORM) && !/anonymous/i.test(email.text), "the email still offers the outside form");
    // A second press reaches Amara once: no second row, no second count, no second email.
    const again = await w.leave("amara");
    assert.equal(again.status, 200);
    assert.equal(rows().length, 1);
    assert.equal(survey(id).reached, 1);
    assert.equal(world.mail.filter((message) => message.to === "amara@example.com").length, 1);
  });

  test("I can’t make it reaches them the same way, through the one leave", async () => {
    const id = await opened();
    const answer = await cantMakeIt("dev");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    await w.settle();
    assert.equal(rowOf("dev")?.surveyId, id);
    assert.equal(survey(id).reached, 1);
    const email = await emailTo("dev@example.com");
    assert.ok(email.hrefs.includes(`https://naisi.invalid/survey/${rowOf("dev").token}`), email.text);
  });

  test("the page that says they left draws its card while it is theirs, then only that they left", async () => {
    await opened();
    const before = await draw(w.pages.home, "amara", { runId: RUN.agi });
    await w.leave("amara");
    const token = rowOf("amara").token;
    for (const [name, Page] of [["home", w.pages.home], ["notes", w.pages.notes], ["reading", w.pages.reading]]) {
      const page = await draw(Page, "amara", { runId: RUN.agi });
      assert.ok(page.text.includes(`That was on Tue 17 Nov. Thanks for coming along. ${CARD} Changed your mind?`), `${name}: ${page.text}`);
      assert.ok(page.html.includes(`href="/survey/${token}"`), `${name} does not open Amara's own link`);
      assert.equal(page.wrote, false, `${name} wrote`);
    }
    assert.ok(!before.text.includes("Tell us why"), "the card was drawn before Amara left");
    // Once answered, the page says only that Amara left.
    const answered = await call(null, routes.answerByLink.POST, {}, { body: { token, answers: { q_leave_again: { type: "choice", optionId: "o_maybe" } } } });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    const after = await draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.ok(!after.text.includes("Tell us why") && !after.html.includes("/survey/"), after.text);
    assert.ok(after.text.endsWith("Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do."), after.text);
  });

  test("My programmes draws A survey for you while it waits, beside the card that says they left", async () => {
    await opened();
    await w.leave("amara");
    w.ui.myRuns = { runs: [], loading: false, error: null, reload() {} };
    const page = await draw(w.pages.programmes, "amara", {});
    assert.ok(page.text.includes("A survey for you Why you left AGI Strategy · 3 questions, about a minute Answer"), page.text);
    assert.ok(page.html.includes(`href="/survey/${rowOf("amara").token}"`));
    assert.ok(page.text.includes("You left AGI Strategy"));
    // Never how many others have answered, or who else left.
    assert.doesNotMatch(page.text, /\b\d+\s+(?:of\s+\d+\s+)?(?:people\s+)?(?:have\s+|has\s+)?answered\b|Sam|Omar/i);
  });

  test("nothing reaches somebody who did not leave: taken off by staff, still taking part, or leaving an open run", async () => {
    const id = await opened();
    // Omar was taken off by staff; Bea stays; Kai leaves the open run, which no programme names.
    const kai = await w.leave("kai", { confirmName: "Pre-course" }, OPEN_RUN);
    assert.equal(kai.status, 200, JSON.stringify(kai.body));
    assert.equal(kai.body.feedbackUrl, OUTSIDE_FORM, "the open run's leaver is not offered the outside form");
    assert.deepEqual(rows(), []);
    assert.equal(survey(id).reached, 0);
    const email = await emailTo("kai@example.com");
    assert.ok(email.hrefs.includes(OUTSIDE_FORM) && !email.text.includes(LEAVING_LINE));
    for (const who of ["omar", "bea", "sam"]) {
      const page = await draw(w.pages.home, who, { runId: RUN.agi });
      assert.ok(!page.text.includes("Tell us why") && !page.html.includes("/survey/"), who);
    }
  });

  test("nothing reaches them while it is a draft, or once it is closed: the email offers the outside form as before", async () => {
    for (const step of ["draft", "closed"]) {
      w.reset();
      world.db.seed("config/courses", { dropOutFeedbackUrl: OUTSIDE_FORM });
      const id = step === "draft" ? await made() : await opened();
      if (step === "closed") assert.equal((await call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
      const left = await w.leave("amara");
      assert.equal(left.body.feedbackUrl, OUTSIDE_FORM, step);
      assert.deepEqual(rows(), [], step);
      assert.equal(survey(id).reached, 0, step);
      const email = await emailTo("amara@example.com");
      assert.ok(email.hrefs.includes(OUTSIDE_FORM) && !email.text.includes(LEAVING_LINE), step);
      const page = await draw(w.pages.home, "amara", { runId: RUN.agi });
      assert.ok(!page.text.includes("Tell us why"), step);
    }
  });

  test("somebody who leaves, is put back and leaves again keeps their one answer, and is not asked again", async () => {
    const id = await opened();
    await w.leave("amara");
    const first = rowOf("amara");
    const answered = await call(null, routes.answerByLink.POST, {}, { body: { token: first.token, answers: { q_leave_again: { type: "choice", optionId: "o_yes" } } } });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    // An admin puts Amara back, and Amara leaves again.
    world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { status: "active", droppedOutAt: null });
    const again = await w.leave("amara");
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(rows().length, 1);
    assert.equal(rowOf("amara").token, first.token, "the second leave gave Amara a second link");
    assert.equal(rowOf("amara").answered, true, "the second leave let Amara answer again");
    assert.equal(survey(id).reached, 1, "the second leave was counted again");
    // The second email asks nothing: no survey line, and no outside form beside it.
    const sent = world.mail.filter((message) => message.to === "amara@example.com");
    assert.equal(sent.length, 2);
    const html = await render(sent[1].react);
    assert.ok(!textOf(html).includes("tell us in") && !html.includes(OUTSIDE_FORM), textOf(html));
  });

  test("somebody put back on the programme is not asked why they left: the card is gone until they leave again", async () => {
    await opened();
    await w.leave("amara");
    const waiting = await loadTs(join("lib", "surveys", "waiting.ts"));
    assert.equal((await waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date())).length, 1);
    // An admin puts Amara back: Amara's seat is taking part again.
    world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { status: "active", droppedOutAt: null });
    assert.deepEqual(await waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date()), []);
  });

  test("an admin viewing the site as somebody who left is shown no card, and nothing of theirs is read for one", async () => {
    await opened();
    await w.leave("amara");
    world.viewAs = true;
    try {
      const page = await draw(w.pages.home, "amara", { runId: RUN.agi });
      assert.ok(!page.text.includes("Tell us why") && !page.html.includes("/survey/"), page.text);
    } finally {
      world.viewAs = false;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Results: admins, and the programme's lead
// ---------------------------------------------------------------------------

describe("7. results: for admins, and for the programme's lead, never a name", () => {
  /** Amara and Dev leave while it is open, and each answers through their own link. */
  async function twoAnswered() {
    const id = await opened();
    await w.leave("amara");
    assert.equal((await cantMakeIt("dev")).status, 200);
    await w.settle();
    for (const [uid, text] of [["amara", "Shorter readings in week 2."], ["dev", "A later session time."]]) {
      const answered = await call(null, routes.answerByLink.POST, {}, {
        body: { token: rowOf(uid).token, answers: { q_leave_why: { type: "choices", optionIds: ["o_time"] }, q_leave_stay: { type: "text", text } } },
      });
      assert.equal(answered.status, 200, JSON.stringify(answered.body));
    }
    return id;
  }
  /** The session getCurrentUser() builds from the stored account, with the reviewer flag the roles writer keeps. */
  const sessionFor = (uid) => {
    const base = w.sessionOf(uid);
    return base ? { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true } : null;
  };
  /** The lead's results page under a programme, as `who` sees it; a redirect answers where it went. */
  async function leadPage(who, surveyId, programmeId = AGI) {
    world.user = who === null ? null : sessionFor(who);
    try {
      const html = renderToStaticMarkup(await pages.lead({ params: Promise.resolve({ roundId: ROUND, programmeId, surveyId }) }));
      return { html, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
      throw err;
    }
  }
  const results = (surveyId) => page(pages.results, { params: Promise.resolve({ surveyId }), searchParams: Promise.resolve({}) }, "zach");

  test("its results page counts the people it reached, and carries no name", async () => {
    const id = await twoAnswered();
    const shown = await results(id);
    assert.ok(shown.text.includes("2 answers from the 2 people it reached (100%)."), shown.text);
    assert.ok(shown.text.includes("2 answered, 100% of the 2 it reached"), shown.text);
    assert.ok(shown.text.includes("Shorter readings in week 2.") && shown.text.includes("A later session time."));
    for (const name of ["Amara", "Dev", "Okafor", "Patel"]) assert.ok(!shown.text.includes(name), `the results name ${name}`);
    assert.ok(!shown.text.includes("it was sent to"), "a leaving survey's results say it was sent");
    // Who answered is the admins' tab, with names, as for every survey.
    const answered = await page(pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(answered.text.includes("Amara Okafor") && answered.text.includes("Dev Patel"), answered.text);
  });

  test("the programme's lead reads them under the programme, from the first answer, never a name, comments by their words", async () => {
    const id = await twoAnswered();
    const page = await leadPage("claudia", id);
    assert.equal(page.to, null);
    assert.ok(page.text.includes(`AGI Strategy: leaving ${lib.words.LEAD_RESULTS_WORDS.line}`), page.text);
    assert.ok(page.text.includes("2 answers from the 2 people it reached (100%)."), page.text);
    for (const name of ["Amara", "Dev", "Okafor", "Patel"]) assert.ok(!page.text.includes(name), `the lead's page names ${name}`);
    // The comments in the order of their words: Dev's came second and is listed first.
    assert.ok(page.text.indexOf("A later session time.") < page.text.indexOf("Shorter readings in week 2."), page.text);
    const admins = await results(id);
    assert.ok(admins.text.indexOf("Shorter readings in week 2.") < admins.text.indexOf("A later session time."), "the admins' page no longer lists comments as they came");
    // An admin reads the lead's page too.
    assert.ok((await leadPage("zach", id)).text.includes("2 answers from the 2 people it reached (100%)."));
    // From the first answer: no floor.
    w.reset();
    const one = await opened();
    await w.leave("amara");
    await call(null, routes.answerByLink.POST, {}, { body: { token: rowOf("amara").token, answers: { q_leave_again: { type: "choice", optionId: "o_no" } } } });
    assert.ok((await leadPage("claudia", one)).text.includes("1 answer from the 1 person it reached (100%)."));
  });

  test("nobody else reads them: another programme's lead, a reviewer, a facilitator, a member, somebody signed out", async () => {
    const id = await twoAnswered();
    // Tess leads another programme: AGI Strategy is nothing of Tess's, and Tess's own programme has no such survey.
    const tess = await leadPage("tess", id);
    assert.ok(!tess.text.includes("2 answers") && !tess.text.includes("A later session time."), tess.text);
    const tessOwn = await leadPage("tess", id, TAIS);
    assert.ok(tessOwn.text.includes(lib.words.LEAD_RESULTS_WORDS.notHere), tessOwn.text);
    // Lloyd reviews AGI Strategy's applications: the results are the lead's and the admins'.
    const lloyd = await leadPage("lloyd", id);
    assert.ok(lloyd.text.includes(lib.words.LEAD_RESULTS_WORDS.notYours) && !lloyd.text.includes("A later session time."), lloyd.text);
    for (const who of ["rahul", "sofia", "amara", "bea", null]) {
      const page = await leadPage(who, id);
      assert.ok(!page.text.includes("A later session time.") && !page.text.includes("2 answers"), `${who} reads the results`);
    }
  });

  test("the lead reads the leaving survey alone: another survey of the programme is answered in a sentence", async () => {
    const before = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: "2026-11-30" } });
    const page = await leadPage("claudia", before.body.survey.id);
    assert.ok(page.text.includes(lib.words.LEAD_RESULTS_WORDS.notHere), page.text);
  });
});
