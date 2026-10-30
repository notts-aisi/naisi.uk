/**
 * A survey waiting for somebody, and week 1's first card (Q50 B;
 * docs/surveys.md, "The cards").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. ONE ANSWER. `surveysWaitingFor` alone says whether a survey waits for
 *     somebody: open, sent to them and still theirs, and not answered. A
 *     programme's survey is theirs while they hold the place; a follow-up is
 *     theirs once it was sent to them.
 *  2. WEEK 1'S FIRST CARD. The real week page hands week 1 the run's before
 *     survey while it waits for the reader, and nothing on any other week,
 *     and the page draws it above everything else of the week.
 *  3. THE CARD'S WORDS: what it is, how long, when it closes and "Answer",
 *     which opens the person's own link; never how many others have answered.
 *  4. NOTHING IN A VIEW-AS SESSION, and nothing read to find out.
 *
 * Home and My programmes draw the same cards: that is held in
 * tests/applications-place-in-the-member-area.test.mjs, MAY_SHOW's third
 * entry, where what those two pages may say is held.
 *
 * Real: the survey routes that make, test, send, close and answer a survey,
 * the week page's server shell and its client page, the readers. Faked: what
 * tests/lib/memberPagesWorld.mjs fakes. The clock is Tue 17 Nov 2026 at noon
 * in London, week 3 of AGI Strategy's run; Amara, Dev, Bea and Tariq hold
 * places on it through the form, Amara in Group A, told.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NOW, RUN, makeMemberPagesWorld, textOf } from "./lib/memberPagesWorld.mjs";
import { AGI, ROUND } from "./lib/applicationsSmallTerm.mjs";
import { withEveryRequired } from "./lib/surveyAnswers.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__surveyCards");
const route = async (...parts) => w.loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const routes = {
  create: await route(),
  test: await route("[surveyId]", "test"),
  send: await route("[surveyId]", "send"),
  close: await route("[surveyId]", "close"),
  answer: await route("answer"),
};
const waiting = await w.loadTs(join("lib", "surveys", "waiting.ts"));
const items = await w.loadTs(join("lib", "surveys", "items.ts"));

const CLOSES_ON = "2026-11-30";
const HOW_MANY = /\b\d+\s+(?:of\s+\d+\s+)?(?:people\s+)?(?:have\s+|has\s+)?answered\b/i;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

/** The survey rows, as stored. */
const rows = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => w.world.db.read(path));
const tokenOf = (uid) => rows().find((row) => row.respondent?.uid === uid)?.token ?? null;
/**
 * Every required question of the survey a link opens answered plainly, as the
 * answer routes insist since 30 Oct 2026 (tests/lib/surveyAnswers.mjs).
 */
const everyRequired = (token) => {
  const surveyId = rows().find((row) => row.token === token)?.surveyId;
  return withEveryRequired(items, w.world.db.read(`surveys/${surveyId}`).items, {});
};

/** An admin makes AGI Strategy's survey of `stage`, tests it and sends it to everybody it reaches; answers its id. */
async function sent(stage = "before", body = {}) {
  const made = await w.call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage, closesOn: CLOSES_ON, ...body } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  assert.equal((await w.call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } })).status, 200);
  // The number on the button, as the Send tab reads it, then the press.
  const count = (await w.call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 0 } })).body.emails;
  const press = await w.call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: count } });
  assert.equal(press.status, 200, JSON.stringify(press.body));
  return id;
}

/** Week `n`'s page as the server shell hands it to `who`, then drawn as the browser would. */
async function weekOne(who, n = 1, viewerRole = "learner") {
  const shell = await w.weekShell(who, n);
  if (!shell.props) return { shell, text: "", html: "" };
  await w.asBrowser(who);
  const html = renderToStaticMarkup(createElement(w.components.WeekView, { ...shell.props, viewerRole: shell.props.viewerRole ?? viewerRole }));
  return { shell, html, text: textOf(html) };
}

const CARD = "A survey for you Before you start 14 questions, about 5 minutes · Closes Mon 30 Nov Answer";

describe("1. one answer: open, theirs, not answered", () => {
  test("the before survey waits for each person it was sent to who still holds the place, and for nobody else", async () => {
    const id = await sent();
    const sentTo = rows().map((row) => row.respondent.uid).sort();
    assert.deepEqual(sentTo, ["amara", "bea", "dev", "tariq"]);
    for (const uid of sentTo) {
      const cards = await waiting.surveysWaitingFor(w.world.db, { uid }, new Date());
      assert.deepEqual(cards.map((card) => card.surveyId), [id], uid);
    }
    // Somebody it was not sent to: a facilitator, the lead, an admin, a member of another group not on the form.
    for (const uid of ["rahul", "claudia", "zach", "chloe", "tess"]) {
      assert.deepEqual(await waiting.surveysWaitingFor(w.world.db, { uid }, new Date()), [], uid);
    }
  });

  test("the card says what it is, how long, when it closes and Answer, with the person's own link and nothing of anybody else", async () => {
    const id = await sent();
    const [card] = await waiting.surveysWaitingFor(w.world.db, { uid: "amara" }, new Date());
    assert.deepEqual(card, {
      surveyId: id,
      runId: RUN.agi,
      kind: "before",
      eyebrow: "A survey for you",
      title: "Before you start",
      programme: "AGI Strategy",
      size: "14 questions, about 5 minutes",
      closes: "Closes Mon 30 Nov",
      href: `/survey/${tokenOf("amara")}`,
      answer: "Answer",
    });
  });

  test("gone once answered, once closed by hand, and once its closing time has passed", async () => {
    const id = await sent();
    const waits = async (uid) => (await waiting.surveysWaitingFor(w.world.db, { uid }, new Date())).length;
    // Amara answers through Amara's own link: Amara's card is gone, Bea's stays.
    const answered = await w.call(null, routes.answer.POST, {}, { body: { token: tokenOf("amara"), answers: everyRequired(tokenOf("amara")) } });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.equal(await waits("amara"), 0);
    assert.equal(await waits("bea"), 1);
    // Closed by hand: gone for everybody.
    assert.equal((await w.call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    assert.equal(await waits("bea"), 0);
    // And a survey past its closing time.
    w.reset();
    await sent();
    mock.timers.setTime(new Date("2026-12-01T00:00:00Z").getTime());
    assert.equal(await waits("bea"), 0);
  });

  test("somebody who no longer holds the place is not asked again, as the reminder does not ask them", async () => {
    await sent();
    // Tariq's place is given back on the form: the survey sent to Tariq is no longer Tariq's.
    w.world.db.poke(`admissionApplications/${ROUND}__tariq`, { status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: NOW }, withdrawnAt: NOW });
    assert.deepEqual(await waiting.surveysWaitingFor(w.world.db, { uid: "tariq" }, new Date()), []);
    assert.equal((await waiting.surveysWaitingFor(w.world.db, { uid: "dev" }, new Date())).length, 1);
  });

  test("a follow-up waits for the person it was sent to, whatever their place says now", async () => {
    const before = await sent();
    await w.call(null, routes.answer.POST, {}, { body: { token: tokenOf("amara"), answers: everyRequired(tokenOf("amara")), consents: { followUps: true } } });
    const followUp = await sent("followUp6", { closesOn: "2026-12-20" });
    assert.notEqual(followUp, before);
    // Amara's place given back since: the follow-up went because Amara said yes, so it is still Amara's.
    w.world.db.poke(`admissionApplications/${ROUND}__amara`, { status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: NOW }, withdrawnAt: NOW });
    const cards = await waiting.surveysWaitingFor(w.world.db, { uid: "amara" }, new Date());
    assert.deepEqual(cards.map((card) => [card.surveyId, card.title]), [[followUp, "Six months on"]]);
    // Week 1's first card is the before survey's and no other: a follow-up waiting is not it.
    assert.equal(await waiting.beforeSurveyCardFor(w.world.db, { uid: "amara" }, RUN.agi, new Date()), null);
  });

  test("in a view-as session there is no card, and no survey record is read", async () => {
    await sent();
    w.world.viewAs = true;
    const touched = [];
    const collection = w.world.db.collection.bind(w.world.db);
    w.world.db.collection = (name) => {
      touched.push(name);
      return collection(name);
    };
    try {
      assert.deepEqual(await waiting.surveysWaitingFor(w.world.db, { uid: "amara" }, new Date()), []);
    } finally {
      w.world.db.collection = collection;
      w.world.viewAs = false;
    }
    assert.deepEqual(touched, []);
  });
});

describe("2. week 1's first card", () => {
  test("the week page hands week 1 the run's before survey while it waits for the reader, and draws it first", async () => {
    await sent();
    const { shell, html, text } = await weekOne("amara");
    assert.equal(shell.component, "WeekView");
    assert.equal(shell.props.survey.title, "Before you start");
    assert.equal(shell.props.survey.href, `/survey/${tokenOf("amara")}`);
    // Above everything else of the week: the card comes before its readings.
    assert.ok(text.includes(CARD), text);
    // Each part of the line under its title wraps as one piece: a phone never splits the closing day.
    assert.ok(html.includes('<span class="part">Closes Mon 30 Nov</span>'), html);
    assert.ok(text.indexOf(CARD) < text.indexOf("Week 1 reading one"), text);
    assert.doesNotMatch(text, HOW_MANY);
    // The programme's own page: its name is not repeated on the card.
    assert.ok(!CARD.includes("AGI Strategy"));
  });

  test("on every other week, once answered, and for somebody it was not sent to, there is no card", async () => {
    await sent();
    for (const n of [2, 3]) assert.equal((await w.weekShell("amara", n)).props?.survey, undefined, `week ${n}`);
    await w.call(null, routes.answer.POST, {}, { body: { token: tokenOf("amara"), answers: everyRequired(tokenOf("amara")) } });
    assert.equal((await w.weekShell("amara", 1)).props.survey, undefined);
    // A facilitator of the run and an admin read week 1 too, and were not sent it.
    for (const [who, role] of [["rahul", "facilitator"], ["zach", "admin"]]) {
      const { shell, text } = await weekOne(who, 1, role);
      assert.equal(shell.props.survey, undefined, who);
      assert.ok(!text.includes("A survey for you"), who);
    }
  });

  test("a facilitator who holds a place, and was sent it, has their own card on week 1", async () => {
    // Rahul facilitates Group B and holds a place through the form, as Amara does.
    for (const path of [`admissionApplications/${ROUND}__`, `admissionDecisions/${ROUND}__`]) {
      w.world.db.seed(`${path}rahul`, { ...w.world.db.read(`${path}amara`), uid: "rahul" });
    }
    await sent();
    assert.ok(tokenOf("rahul"));
    const { shell } = await weekOne("rahul", 1, "facilitator");
    assert.equal(shell.props.survey.href, `/survey/${tokenOf("rahul")}`);
  });
});
