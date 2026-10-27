/**
 * What a member's programme page and Home say when a week changes, in the
 * last week, and once the programme is over (boards wk-changes,
 * wk-lastweek-phone, en-after-phone and en-after-nofinish-phone).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. A CHANGED WEEK (wk-changes), on the programme page and on Home: a
 *     cancelled evening's notice ("No session tonight", the day and its
 *     reason, what to do instead) over the next session's ticket, which names
 *     its day and the weeks it covers ("Tue 1 Dec · weeks 4 and 5") over the
 *     hours alone; on that session's own day, "Tonight · weeks 4 and 5"; an
 *     online week's "Tonight · week 6 · online", "Join online" and the line
 *     that the link is only here, with no room and no chip saying it again.
 *  2. THE SURVEY AT THE END, read from the surveys' own record
 *     (`endSurveyFor`): theirs to answer while `surveysWaitingFor` says it
 *     waits for them, with its own facts (questions, minutes, the questions
 *     it shares with week 1's, its closing day); sent, with the day they sent
 *     it and the day their name comes off; nothing once it closed unanswered,
 *     for anybody it was not sent to, in a view-as session or for another
 *     run; never how many others answered. Its card's words in each state.
 *  3. THE LAST WEEK ON HOME (wk-lastweek-phone), by the member's own
 *     calendar: "Tonight · your last session" on its day and "Your last
 *     session · week 6" before it; "The survey at the end" above "After
 *     tonight" (the certificate line, with no day: no record holds one), then
 *     "What’s next" from the term's form, open (its term, its closing day,
 *     Find out more, and the facilitate line only while that form asks it),
 *     opening (the month), or nothing; the survey moved from Home's top so it
 *     is drawn once; What's next handed only to somebody taking part, only in
 *     the last week and after.
 *  4. AFTER THE END (en-after-phone, en-after-nofinish-phone), the programme
 *     page as the real server page hands it: "You finished AGI Strategy."
 *     with the term, group and facilitators only where the finished record
 *     says so, otherwise "AGI Strategy has ended." with the thanks, the term
 *     and the group, never that they did not finish; the survey at the end,
 *     theirs to answer or sent; what they keep, each linked only to a page
 *     that holds it; what's next with the next event; the weeks after. As
 *     every caller: a member who finished, one who did not, a facilitator who
 *     holds a place, one who left (the left page, keeping nothing), the
 *     programme's lead, another programme's lead, an admin, a facilitator and
 *     somebody signed out. 5a's guard that nothing else says "You finished"
 *     stays green (tests/course-hub-finishing-claims.test.mjs).
 *
 * Real: the overview, roster and hub routes, the programme page and Home's
 * card, and every library under them. Faked: what
 * `tests/lib/memberPagesWorld.mjs` fakes (the session, the Admin SDK handle,
 * the clock, the stylesheets, the browser's data hooks).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, ROUND, roundDoc } from "./lib/applicationsSmallTerm.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, textOf } from "./lib/memberPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__changedLastAfter");
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const surveyRoute = async (...parts) => w.loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const surveyRoutes = {
  create: await surveyRoute(),
  test: await surveyRoute("[surveyId]", "test"),
  send: await surveyRoute("[surveyId]", "send"),
  close: await surveyRoute("[surveyId]", "close"),
  answer: await surveyRoute("answer"),
};
const waiting = await w.loadTs(join("lib", "surveys", "waiting.ts"));
const surveyWords = await w.loadTs(join("lib", "surveys", "words.ts"));
const EndSurveyCard = (await w.loadTs(join("features", "surveys", "cards", "EndSurveyCard.tsx"))).default;
const { whoStepsOut } = await w.loadTs(join("features", "courses", "weekly", "whoStepsOut.ts"));

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

/** A joining link on the site's own list of good ones. */
const LINK = "https://meet.example.com/group-b";
const AWAY = "Rahul and Sofia are both away.";

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** Group B's stored document, changed in place. */
function changeGroupB(change) {
  const path = `courseGroups/${B}`;
  const stored = w.world.db.read(path);
  const next = typeof change === "function" ? change(stored) : change;
  w.world.db.seed(path, { ...stored, ...next });
}

/** Week 4's evening (Tue 24 Nov) cancelled by Rahul, the group keeping pace. */
function cancelWeekFour() {
  changeGroupB({
    sessionChanges: { w04: { kind: "cancelled", reason: AWAY, dateKey: "2026-11-24", byUid: "rahul", at: new Date("2026-11-19T09:00:00Z") } },
  });
}

/** Week 6 held online, with the group's link. */
function weekSixOnline({ link = true } = {}) {
  changeGroupB((stored) => ({
    session: { ...stored.session, meetingUrl: link ? LINK : "" },
    sessionModes: { w06: "virtual" },
  }));
}

/** The ticket's own markup, out of a page's: what is inside its section. */
function ticketOf(html) {
  const label = html.indexOf('aria-label="Your next session"');
  assert.ok(label >= 0, "no ticket on the page");
  const start = html.indexOf(">", label) + 1;
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

/** The words of a piece of markup. */
const words = (html) => textOf(html);

describe("1. a changed week (wk-changes)", () => {
  test("a cancelled evening, on the day: the notice, then the ticket naming its day and both weeks over the hours alone", async () => {
    cancelWeekFour();
    at("2026-11-24T12:00:00Z");
    await w.asBrowser("chloe");
    const { text, html } = w.programmeHome("chloe");
    assert.match(
      text,
      /No session tonight Tue 24 Nov is cancelled\. Rahul and Sofia are both away\. Do week 4’s reading anyway\. On Tue 1 Dec you’ll talk about weeks 4 and 5 together\. Tue 1 Dec Tue 1 Dec · weeks 4 and 5 6pm to 8pm Hallward B12/,
    );
    // The day is said under the stub and in the eyebrow, never a third time in the heading.
    assert.doesNotMatch(words(ticketOf(html)), /Tue 1 Dec, 6pm/);
    assert.doesNotMatch(text, /Your next session/);
  });

  test("the same on Home: the notice over the ticket, which names the day and both weeks", async () => {
    cancelWeekFour();
    at("2026-11-24T12:00:00Z");
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.match(
      home.text,
      /No session tonight Tue 24 Nov is cancelled\. Rahul and Sofia are both away\. Do week 4’s reading anyway\. On Tue 1 Dec you’ll talk about weeks 4 and 5 together\. Tue 1 Dec Tue 1 Dec · weeks 4 and 5 Group B, 6pm to 8pm/,
    );
    // The notice comes before the ticket, as on the programme page.
    assert.ok(home.text.indexOf("No session tonight") < home.text.indexOf("Group B, 6pm to 8pm"));
  });

  test("before the evening: the notice names the day; once it has passed, the notice goes and the ticket still names both weeks", async () => {
    cancelWeekFour();
    at("2026-11-20T12:00:00Z");
    await w.asBrowser("chloe");
    const before = w.programmeHome("chloe").text;
    // Week 3's session (Tue 17 Nov) is over, so the next one held is Tue 1 Dec.
    assert.match(before, /No session on Tue 24 Nov Tue 24 Nov is cancelled\./);
    assert.match(before, /Tue 1 Dec · weeks 4 and 5 6pm to 8pm/);

    at("2026-11-26T12:00:00Z");
    await w.asBrowser("chloe");
    const after = w.programmeHome("chloe").text;
    assert.doesNotMatch(after, /No session/);
    assert.match(after, /Tue 1 Dec Tue 1 Dec · weeks 4 and 5 6pm to 8pm Hallward B12/);
    const home = await w.homeCard("chloe");
    assert.doesNotMatch(home.text, /No session/);
    assert.match(home.text, /Tue 1 Dec · weeks 4 and 5 Group B, 6pm to 8pm/);
  });

  test("on the covering session's own day: Tonight with both weeks, and the heading dates it", async () => {
    cancelWeekFour();
    at("2026-12-01T12:00:00Z");
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.match(text, /Tue 1 Dec Tonight · weeks 4 and 5 Tue 1 Dec, 6pm to 8pm Hallward B12/);
    const home = await w.homeCard("chloe");
    assert.match(home.text, /Tue 1 Dec Tonight · weeks 4 and 5 Group B, 6pm to 8pm/);
  });

  test("an online week, on the day: online in the eyebrow, Join online with its line, no room and no chip", async () => {
    weekSixOnline();
    at("2026-12-08T12:00:00Z");
    for (const n of [5, 6]) w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w0${n}`, { published: true });
    await w.asBrowser("chloe");
    const { html } = w.programmeHome("chloe");
    const ticket = ticketOf(html);
    const said = words(ticket);
    assert.match(said, /^Tue 8 Dec Tonight · week 6 · online Tue 8 Dec, 6pm to 8pm/);
    assert.match(ticket, new RegExp(`<a class="joinButton" href="${LINK}" target="_blank" rel="noopener noreferrer">Join online</a>`));
    assert.match(said, /Join online The link is here, not in your emails, so it can’t be forwarded\.$/);
    // The row under the card holds it, as wk-changes draws it.
    assert.match(ticket, /<div class="ticketFoot joinFoot"><a class="joinButton"/);
    assert.doesNotMatch(said, /Hallward B12|Online this week|Add to calendar/);

    // Home names the last session as such on its day (wk-lastweek-phone), and says it is online.
    const home = await w.homeCard("chloe");
    const homeTicket = ticketOf(home.html);
    assert.match(words(homeTicket), /Tonight · your last session · online Group B, 6pm to 8pm/);
    assert.match(homeTicket, new RegExp(`href="${LINK}"`));
    assert.match(words(homeTicket), /The link is here, not in your emails, so it can’t be forwarded\./);
    assert.doesNotMatch(words(homeTicket), /Hallward B12|Online this week/);
  });

  test("an online week before its day says so in the eyebrow; with no link it says where the link will be, never that anybody sends it", async () => {
    weekSixOnline({ link: false });
    at("2026-12-03T12:00:00Z");
    await w.asBrowser("chloe");
    const said = words(ticketOf(w.programmeHome("chloe").html));
    // Week 6 is the group's last session: "Your last session" before its day.
    assert.match(said, /Your last session · week 6 · online Tue 8 Dec, 6pm to 8pm/);
    assert.match(said, /The link to join will be here, not in your emails\./);
    assert.doesNotMatch(said, /Join online|send/i);
  });

  test("an online week that is not the last: Your next session · week 5 · online, and Join online", async () => {
    changeGroupB((stored) => ({ session: { ...stored.session, meetingUrl: LINK }, sessionModes: { w05: "virtual" } }));
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w05`, { published: true });
    at("2026-11-26T12:00:00Z");
    await w.asBrowser("chloe");
    const ticket = ticketOf(w.programmeHome("chloe").html);
    assert.match(words(ticket), /^Tue 1 Dec Your next session · week 5 · online Tue 1 Dec, 6pm to 8pm/);
    assert.match(ticket, new RegExp(`href="${LINK}"`));
    const home = await w.homeCard("chloe");
    assert.match(words(ticketOf(home.html)), /Your next session · week 5 · online Group B, 6pm to 8pm/);
  });

  test("a week like any other: no online in the eyebrow, and the room and the people on the ticket", async () => {
    await w.asBrowser("chloe");
    const said = words(ticketOf(w.programmeHome("chloe").html));
    assert.match(said, /Tonight · week 3 Tue 17 Nov, 6pm to 8pm Hallward B12/);
    assert.doesNotMatch(said, /online/i);
  });
});

// ---------------------------------------------------------------------------
// 2. The survey at the end, read from the surveys' own record
// ---------------------------------------------------------------------------

const CLOSES_ON = "2026-11-30";
const HOW_MANY = /\b\d+\s+(?:of\s+\d+\s+)?(?:people\s+)?(?:have\s+|has\s+)?answered\b/i;

/** The survey rows, as stored. */
const surveyRows = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => w.world.db.read(path));
const tokenOf = (uid, surveyId) => surveyRows().find((row) => row.respondent?.uid === uid && row.surveyId === surveyId)?.token ?? null;

/** An admin makes AGI Strategy's survey of `stage`, tests it and sends it to everybody it reaches; answers its id. */
async function sentSurvey(stage) {
  const made = await w.call("zach", surveyRoutes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage, closesOn: CLOSES_ON } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  assert.equal((await w.call("zach", surveyRoutes.test.POST, { surveyId: id }, { body: { email: "survey" } })).status, 200);
  const count = (await w.call("zach", surveyRoutes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 0 } })).body.emails;
  const press = await w.call("zach", surveyRoutes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: count } });
  assert.equal(press.status, 200, JSON.stringify(press.body));
  return id;
}

/** `uid` sends their answers to survey `id` through their own link. */
async function answerAs(uid, id) {
  const answered = await w.call(null, surveyRoutes.answer.POST, {}, { body: { token: tokenOf(uid, id), answers: {} } });
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
}

const endFor = (uid, runId = RUN.agi) => waiting.endSurveyFor(w.world.db, { uid }, runId, new Date());

describe("2. the survey at the end, read from the surveys' own record", () => {
  test("it waits for each person still on the programme, with its own facts: the questions it shares with week 1's, its minutes and its closing day", async () => {
    await sentSurvey("before");
    const id = await sentSurvey("after");
    for (const uid of ["amara", "dev", "bea", "tariq"]) {
      const end = await endFor(uid);
      assert.equal(end?.state, "open", uid);
      assert.equal(end.card.surveyId, id);
      assert.equal(end.card.href, `/survey/${tokenOf(uid, id)}`, `${uid}'s card opens somebody else's link`);
      // The survey's own record: 23 questions, 10 minutes, C1 to C9 asked in week 1 too.
      assert.deepEqual(end.card.atTheEnd, { questions: 23, minutes: 10, sameAsStart: 9, closesOn: "Mon 30 Nov" });
    }
    // The same card the top of Home and My programmes are handed: one answer.
    const [card] = (await waiting.surveysWaitingFor(w.world.db, { uid: "amara" }, new Date())).filter((each) => each.kind === "after");
    assert.deepEqual((await endFor("amara")).card, card);
    // The before survey's card carries none of it.
    const before = (await waiting.surveysWaitingFor(w.world.db, { uid: "amara" }, new Date())).find((each) => each.kind === "before");
    assert.equal("atTheEnd" in before, false);
  });

  test("with no survey before it to pair with, it shares nothing with week 1, and says how many questions it asks", async () => {
    await sentSurvey("after");
    const end = await endFor("amara");
    assert.deepEqual(end.card.atTheEnd, { questions: 23, minutes: 10, sameAsStart: 0, closesOn: "Mon 30 Nov" });
  });

  test("once sent: the day they sent it and the day their name comes off it, and it stays after it closes", async () => {
    const id = await sentSurvey("after");
    at("2026-11-19T15:00:00Z");
    await answerAs("amara", id);
    const end = await endFor("amara");
    const stored = w.world.db.read(`surveys/${id}`);
    assert.ok(stored.namesOffOn, "the survey has no day names come off");
    assert.deepEqual(end, { state: "sent", surveyId: id, sentOn: "Thu 19 Nov", keptUntil: surveyWords.dateKeyWords(stored.namesOffOn) });
    assert.match(end.keptUntil, /^\w{3} \d{1,2} \w{3} \d{4}$/);
    // Closed afterwards: what they sent is still theirs to be told of.
    assert.equal((await w.call("zach", surveyRoutes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    assert.equal((await endFor("amara")).state, "sent");
    // Bea, who never answered, is shown nothing once it has closed.
    assert.equal(await endFor("bea"), null);
  });

  test("nothing once its closing time passes unanswered, for anybody it was not sent to, for another run, or in a view-as session", async () => {
    await sentSurvey("after");
    // Not sent to: a member of Group B not on the form, the programme's lead, an admin, another programme's lead, a facilitator.
    for (const uid of ["chloe", "claudia", "zach", "tess", "rahul"]) assert.equal(await endFor(uid), null, uid);
    // Signed out: no uid, nothing read.
    assert.equal(await waiting.endSurveyFor(w.world.db, { uid: "" }, RUN.agi, new Date()), null);
    // Another run's page asks for its own survey at the end, not this one.
    assert.equal(await endFor("amara", "another-run__run00009"), null);
    // A view-as session reads nothing of the person's.
    w.world.viewAs = true;
    const touched = [];
    const collection = w.world.db.collection.bind(w.world.db);
    w.world.db.collection = (name) => {
      touched.push(name);
      return collection(name);
    };
    try {
      assert.equal(await endFor("amara"), null);
    } finally {
      w.world.db.collection = collection;
      w.world.viewAs = false;
    }
    assert.deepEqual(touched, []);
    // Past its closing time, unanswered: nothing.
    at("2026-12-01T12:00:00Z");
    assert.equal(await endFor("amara"), null);
  });

  test("its card: in the last week, once the programme is over, and once sent; never how many others answered", async () => {
    await sentSurvey("before");
    const id = await sentSurvey("after");
    const open = await endFor("amara");
    const draw = (props) => textOf(renderToStaticMarkup(createElement(EndSurveyCard, props)));
    // Who steps out is the group's facilitators who hold no place in it (`whoStepsOut`): a facilitator who
    // holds one answers it too, and is never said to step out (a default taken for Zach on 27 October 2026).
    const out = (stepOut, takePart = []) => ({ stepOut, takePart });
    const tonight = draw({ survey: open, look: "card", lastSession: { when: "tonight", facilitators: out(["Rahul", "Sofia"]), online: false } });
    assert.equal(
      tonight,
      "The survey at the end At the end of tonight’s session: the same 9 questions as week 1, then how it went. About 10 minutes. " +
        "Rahul and Sofia leave you 10 minutes for it and step out of the room. Open the survey It closes on Mon 30 Nov.",
    );
    // Rahul and Sofia step out; Priya, who holds a place in the group, takes it with it and is not named.
    assert.equal(draw({ survey: open, look: "card", lastSession: { when: "tonight", facilitators: out(["Rahul", "Sofia"], ["Priya"]), online: false } }), tonight);
    const html = renderToStaticMarkup(createElement(EndSurveyCard, { survey: open, look: "card", lastSession: { when: "tonight", facilitators: out(["Rahul"]), online: false } }));
    assert.match(html, new RegExp(`<a href="/survey/${tokenOf("amara", id)}" class="endButton"`));
    // Every facilitator holds a place: nobody steps out, and the line says so.
    assert.match(
      draw({ survey: open, look: "card", lastSession: { when: { day: "Tue 8 Dec" }, facilitators: out([], ["Priya"]), online: true } }),
      /^The survey at the end At the end of your last session, on Tue 8 Dec: the same 9 questions as week 1, then how it went\. About 10 minutes\. Priya takes it too, so nobody steps away from the call\. Open the survey/,
    );
    assert.match(
      draw({ survey: open, look: "card", lastSession: { when: "tonight", facilitators: out([], ["Priya", "Sam"]), online: false } }),
      /About 10 minutes\. Priya and Sam take it too, so nobody steps out of the room\. Open the survey/,
    );
    assert.match(draw({ survey: open, look: "card", lastSession: { when: "today", facilitators: out(["Tom"]), online: false } }), /At the end of today’s session: .* Tom leaves you 10 minutes for it and steps out of the room\. Open the survey/);
    // Not known yet (the group's names have not loaded), or a group with no facilitator: nothing of who steps out.
    for (const facilitators of [null, out([], [])]) {
      assert.equal(
        draw({ survey: open, look: "card", lastSession: { when: "tonight", facilitators, online: false } }),
        "The survey at the end At the end of tonight’s session: the same 9 questions as week 1, then how it went. About 10 minutes. Open the survey It closes on Mon 30 Nov.",
      );
    }
    assert.equal(
      draw({ survey: open, look: "section" }),
      "The survey at the end The same 9 questions as week 1, then how it went. About 10 minutes. It closes on Mon 30 Nov. Answer it",
    );
    await answerAs("amara", id);
    const sent = await endFor("amara");
    assert.match(draw({ survey: sent, look: "section" }), /^Your survey at the end Sent Tue 17 Nov\. Thank you\. It’s here until \w{3} \d{1,2} \w{3} \d{4}, when your name comes off your answers\.$/);
    for (const text of [tonight, draw({ survey: sent, look: "section" })]) assert.doesNotMatch(text, HOW_MANY);
  });
});

// ---------------------------------------------------------------------------
// 3. The last week on Home
// ---------------------------------------------------------------------------

/** Next term's form, on the site beside this term's. */
const SPRING = "spring-2027__sm4llspr1";

/** Next term's form: taking applications from Mon 30 Nov to Sun 13 Dec (or as `over` says), asking about facilitating. */
function springForm(over = {}) {
  w.world.db.seed(`admissionRounds/${SPRING}`, roundDoc({
    label: "Spring 2027",
    slug: "spring-2027",
    status: "open",
    opensAt: new Date("2026-11-30T09:00:00Z"),
    closesAt: new Date("2026-12-13T23:59:00Z"),
    decisionsByDate: "2026-12-20",
    asksFacilitating: true,
    ...over,
  }));
}

/** Weeks 5 and 6 published: the run as it is in its last week. */
function allWeeksUp() {
  for (const n of [5, 6]) w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w0${n}`, { published: true });
}

/** The before survey and the survey at the end, both sent, the end one closing on Fri 18 Dec. */
async function surveysSent() {
  await sentSurvey("before");
  const made = await w.call("zach", surveyRoutes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "after", closesOn: "2026-12-18" } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  assert.equal((await w.call("zach", surveyRoutes.test.POST, { surveyId: id }, { body: { email: "survey" } })).status, 200);
  const count = (await w.call("zach", surveyRoutes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 0 } })).body.emails;
  assert.equal((await w.call("zach", surveyRoutes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: count } })).status, 200);
  return id;
}

/** Home's programme card as `who` sees it, handed the survey at the end as HomeMember hands it in the last week. */
async function homeOf(who, { endSurvey = null } = {}) {
  await w.asBrowser(who);
  const runs = (await w.call(who, w.routes.me.GET, {}, { course: true })).body?.runs ?? [];
  const entry = runs.find((row) => row.runId === RUN.agi);
  assert.ok(entry, `${who} has no hub entry`);
  const html = renderToStaticMarkup(
    createElement(w.components.HomeProgramme, { given: "Amara", invite: null, entry, comingUp: null, applications: null, more: null, endSurvey }),
  );
  return { html, text: textOf(html), entry };
}

const afterCardOf = async (uid) => (await waiting.surveysWaitingFor(w.world.db, { uid }, new Date())).find((card) => card.kind === "after") ?? null;

describe("2b. who steps out while the group answers it", () => {
  test("the group's facilitators who hold no place in it, by the roster route's own lists; never the reader; nothing while not known", () => {
    const person = (uid, displayName) => ({ uid, displayName });
    const [rahul, sofia, priya, amara] = [person("rahul", "Rahul Mehta"), person("sofia", "Sofia Rossi"), person("priya", "Priya Shah"), person("amara", "Amara Okafor")];
    // Priya facilitates Group B and holds a place in it: the roster lists Priya among its members too.
    const roster = { group: { id: B }, facilitators: [rahul, sofia, priya], members: [amara, priya] };
    const uids = (split) => split && { stepOut: split.stepOut.map((p) => p.uid), takePart: split.takePart.map((p) => p.uid) };
    assert.deepEqual(uids(whoStepsOut(roster, "amara")), { stepOut: ["rahul", "sofia"], takePart: ["priya"] });
    // The reader is named in neither list, whichever they are.
    assert.deepEqual(uids(whoStepsOut(roster, "priya")), { stepOut: ["rahul", "sofia"], takePart: [] });
    assert.deepEqual(uids(whoStepsOut(roster, "rahul")), { stepOut: ["sofia"], takePart: ["priya"] });
    assert.deepEqual(uids(whoStepsOut({ ...roster, facilitators: [priya] }, "amara")), { stepOut: [], takePart: ["priya"] });
    // Before the group's names have landed: not known.
    assert.equal(whoStepsOut({ group: null, facilitators: [], members: [] }, "amara"), null);
  });
});

describe("3. the last week on Home (wk-lastweek-phone)", () => {
  test("on the last session's day: Tonight · your last session, the survey at the end above After tonight, then What’s next", async () => {
    allWeeksUp();
    springForm();
    const id = await surveysSent();
    // Group A meets on Thursdays: its last session is Thu 3 Dec, the first day of week 6.
    at("2026-12-03T12:00:00Z");
    const card = await afterCardOf("amara");
    assert.equal(card?.surveyId, id);
    const { text, html } = await homeOf("amara", { endSurvey: card });
    assert.match(
      text,
      new RegExp(
        "Thu 3 Dec Tonight · your last session Group A, 6pm to 8pm Portland A13 S with Sofia Add to calendar " +
          "The survey at the end At the end of tonight’s session: the same 9 questions as week 1, then how it went\\. About 10 minutes\\. " +
          "Sofia leaves you 10 minutes for it and steps out of the room\\. Open the survey It closes on Fri 18 Dec\\. " +
          "After tonight Everyone who finishes gets a certificate\\. " +
          "What’s next Applications for Spring 2027 close on Sun 13 Dec\\. Find out more → Facilitate a group next term: say so when you apply\\. " +
          "Before tonight",
      ),
    );
    // The survey opens Amara's own link; Find out more, the form's own page.
    assert.match(html, new RegExp(`href="/survey/${tokenOf("amara", id)}"`));
    assert.match(html, new RegExp(`<a href="/apply/${SPRING}" class="cardLink">Find out more`));
    // No day for the certificates: no record holds one.
    assert.doesNotMatch(text, /certificate by/);
    assert.doesNotMatch(text, HOW_MANY);
  });

  test("before the last session's day: Your last session · week 6, and After your last session", async () => {
    allWeeksUp();
    springForm();
    // Group B meets on Tuesdays: on Sat 5 Dec, week 6, its last session is Tue 8 Dec.
    at("2026-12-05T12:00:00Z");
    const { text } = await homeOf("chloe");
    assert.match(text, /Tue 8 Dec Your last session · week 6 Group B, 6pm to 8pm/);
    assert.match(text, /After your last session Everyone who finishes gets a certificate\. What’s next Applications for Spring 2027 close on Sun 13 Dec\./);
    // Chloe was sent no survey: there is no card for one.
    assert.doesNotMatch(text, /The survey at the end/);
  });

  test("once the last session is over, in the same week: no ticket, the survey's words for after it, and After your last session", async () => {
    allWeeksUp();
    const id = await surveysSent();
    at("2026-12-04T12:00:00Z");
    const card = await afterCardOf("amara");
    assert.equal(card?.surveyId, id);
    const { text } = await homeOf("amara", { endSurvey: card });
    assert.doesNotMatch(text, /Tonight|Your last session|Your next session/);
    assert.match(
      text,
      /The survey at the end The same 9 questions as week 1, then how it went\. About 10 minutes\. It closes on Fri 18 Dec\. Answer it After your last session Everyone who finishes gets a certificate\./,
    );
    // No form taking applications or opening: nothing to say of what's next.
    assert.doesNotMatch(text, /What’s next/);
  });

  test("a form that opens later: Applications for next term open in January, and no facilitate line", async () => {
    allWeeksUp();
    springForm({ opensAt: new Date("2027-01-11T09:00:00Z"), closesAt: new Date("2027-01-24T23:59:00Z") });
    at("2026-12-05T12:00:00Z");
    const { text } = await homeOf("chloe");
    assert.match(text, /What’s next Applications for next term open in January\./);
    assert.doesNotMatch(text, /Facilitate a group|Find out more/);
  });

  test("Home's programme card draws the survey at the end only in the last week, whatever it is handed", async () => {
    allWeeksUp();
    await surveysSent();
    const card = await afterCardOf("amara");
    // Week 5 by Amara's own calendar: the card stays at the top of Home, never here.
    at("2026-11-27T12:00:00Z");
    const { text } = await homeOf("amara", { endSurvey: card });
    assert.doesNotMatch(text, /The survey at the end|After your last session|After tonight/);
  });

  test("the facilitate line only while the form taking applications asks it", async () => {
    allWeeksUp();
    springForm({ asksFacilitating: false });
    at("2026-12-05T12:00:00Z");
    const { text } = await homeOf("chloe");
    assert.match(text, /What’s next Applications for Spring 2027 close on Sun 13 Dec\. Find out more/);
    assert.doesNotMatch(text, /Facilitate a group/);
  });

  test("What’s next is handed to somebody taking part, in the last week and after the end, and to nobody else", async () => {
    allWeeksUp();
    springForm();
    const whatsNextOf = async (who) => {
      const answer = await w.overview(who);
      return answer.status === 200 ? answer.body.whatsNext : "refused";
    };
    // Week 3: nobody is told.
    at("2026-11-17T12:00:00Z");
    assert.equal(await whatsNextOf("chloe"), null);
    // Week 6 and after the end: the member taking part is, and staff are not.
    for (const when of ["2026-12-05T12:00:00Z", "2026-12-12T12:00:00Z"]) {
      at(when);
      assert.deepEqual(await whatsNextOf("chloe"), {
        applications: { kind: "open", label: "Spring 2027", closesOn: "2026-12-13", href: `/apply/${SPRING}` },
        facilitate: true,
      }, when);
      for (const who of ["rahul", "zach"]) assert.equal(await whatsNextOf(who), null, `${who} on ${when}`);
    }
    // The lead and another programme's lead are not on the run's own pages.
    for (const who of ["claudia", "tess"]) assert.ok([null, "refused"].includes(await whatsNextOf(who)), who);
  });
});

describe("3b. the survey at the end is drawn once on Home", () => {
  const programmeEnd = () => w.loadTs(join("lib", "courses", "programmeEnd.ts"));
  const before = { surveyId: "s-before", runId: RUN.agi, kind: "before" };
  const end = { surveyId: "s-after", runId: RUN.agi, kind: "after" };
  const elsewhere = { surveyId: "s-other", runId: "another-run__run00009", kind: "after" };
  const entry = (week) => ({ runId: RUN.agi, currentWeek: week, totalWeeks: 6 });
  const ids = ({ top, programme }) => ({ top: top.map((card) => card.surveyId), programme: programme?.surveyId ?? null });

  test("in the last week it leaves the top and is handed to the programme's cards; any other week it stays at the top", async () => {
    const { endSurveyOnHome } = await programmeEnd();
    const surveys = [before, end, elsewhere];
    assert.deepEqual(ids(endSurveyOnHome(surveys, entry({ phase: "running", weekNumber: 6 }))), { top: ["s-before", "s-other"], programme: "s-after" });
    for (const week of [
      { phase: "running", weekNumber: 5 },
      { phase: "after", weekNumber: null },
      { phase: "before", weekNumber: null },
      { phase: "running", weekNumber: null },
    ]) {
      assert.deepEqual(ids(endSurveyOnHome(surveys, entry(week))), { top: ["s-before", "s-after", "s-other"], programme: null }, JSON.stringify(week));
    }
    // Another run's survey at the end is never this programme's, and a Home about no programme moves nothing.
    assert.deepEqual(ids(endSurveyOnHome([before, elsewhere], entry({ phase: "running", weekNumber: 6 }))), { top: ["s-before", "s-other"], programme: null });
    assert.deepEqual(ids(endSurveyOnHome(surveys, null)), { top: ["s-before", "s-after", "s-other"], programme: null });
  });

  test("Home asks it for the programme Home is about, never a facilitator's, and draws each half where it says", () => {
    const code = readFileSync(join(SRC, "app", "(app)", "dashboard", "HomeMember.tsx"), "utf8");
    assert.match(code, /const \{ top: topSurveys, programme: endSurvey \} = endSurveyOnHome\(surveys, facilitated \? null : learning\);/);
    assert.match(code, /<SurveyCards cards=\{topSurveys\} \/>/);
    assert.match(code, /<HomeProgramme[\s\S]*?endSurvey=\{endSurvey\}[\s\S]*?\/>/);
    assert.doesNotMatch(code, /<SurveyCards cards=\{surveys\}/, "Home draws every survey at the top again");
  });
});

// ---------------------------------------------------------------------------
// 4. After the end: the programme page as the real server page hands it
// ---------------------------------------------------------------------------

const runPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "page.tsx"))).default;
const finishingPath = (uid) => `courseFinishing/${RUN.agi}__${uid}`;

/** The lead's decision that `uid` finished (or not), as the switch on the Overview stores it. */
function decided(uid, finished) {
  w.world.db.seed(finishingPath(uid), { kind: "person", runId: RUN.agi, uid, finished, byUid: "claudia", at: new Date("2026-12-09T10:00:00Z") });
}

/** The next event Home would pick: the welcome back social, Thu 28 Jan at 7pm. */
function welcomeBack() {
  w.world.db.seed("events/welcome-back__evt00001", {
    title: "Welcome back social",
    status: "published",
    visibility: "members",
    startAt: new Date("2027-01-28T19:00:00Z"),
    endAt: new Date("2027-01-28T21:00:00Z"),
    location: "Room E5",
    locationHidden: false,
    noSignup: true,
    archived: false,
  });
}

/**
 * The programme page as the server page hands it to `who`, drawn as the
 * browser would: the element the page returns, its props, and its words.
 */
async function programmePage(who) {
  w.world.user = who ? w.sessionOf(who) : null;
  w.world.course = true;
  let element;
  try {
    element = await runPage({ params: Promise.resolve({ runId: RUN.agi }) });
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { to: err.to, component: null, props: null, text: "", html: "" };
  } finally {
    w.world.course = false;
  }
  const component = element?.type?.name ?? null;
  if (component === "RunHome") await w.asBrowser(who);
  const html = renderToStaticMarkup(element);
  return { to: null, component, props: element.props, html, text: textOf(html) };
}

describe("4. after the end (en-after-phone, en-after-nofinish-phone)", () => {
  /** Thu 10 Dec: every group's calendar is past its last week. */
  const AFTER = "2026-12-10T12:00:00Z";

  test("somebody who finished: the head, the survey they sent, what they keep, what's next with the next event, then the weeks", async () => {
    allWeeksUp();
    springForm({ opensAt: new Date("2027-01-11T09:00:00Z"), closesAt: new Date("2027-01-24T23:59:00Z") });
    welcomeBack();
    const id = await surveysSent();
    at("2026-12-03T20:30:00Z");
    await answerAs("amara", id);
    decided("amara", true);
    at(AFTER);
    const page = await programmePage("amara");
    assert.equal(page.component, "RunHome");
    const stored = w.world.db.read(`surveys/${id}`);
    assert.equal(
      page.text,
      "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group A · with Sofia " +
        `Your survey at the end Sent Thu 3 Dec. Thank you. It’s here until ${surveyWords.dateKeyWords(stored.namesOffOn)}, when your name comes off your answers. ` +
        "What you keep The reading list for all 6 weeks " +
        // The event's stub, then its date again for a screen reader, which skips the stub.
        "What’s next Applications for next term open in January. Thu 28 Jan Thu 28 Jan: Welcome back social 7pm · Room E5 " +
        // Amara ticked none of the weeks' readings here, so none is Done, finished or not (A3: Done only when done).
        "The 6 weeks Week 1 Week 1 readings Thu 29 Oct · Not done 0 of 3 Week 2 Week 2 readings Thu 5 Nov · Not done 0 of 3 " +
        "Week 3 Who decides what AGI means Thu 12 Nov · Not done 0 of 3 Week 4 Week 4 readings Thu 19 Nov · Not done 0 of 3 " +
        "Week 5 Week 5 readings Thu 26 Nov · Not done 0 of 3 Week 6 Week 6 readings Thu 3 Dec · Not done 0 of 3 See your progress week by week →",
    );
    // The finished colour on the head; the reading list's own page; the event's own page.
    assert.match(page.html, /<header class="afterHead afterHeadFinished"><h1 class="afterTitle">You finished AGI Strategy\.<\/h1>/);
    assert.match(page.html, new RegExp(`<a href="/learn/${RUN.agi}/reading" class="keepLink">`));
    assert.match(page.html, /<a href="\/events\/welcome-back__evt00001" class="eventCard">/);
    // Nothing the board does not draw once it is over: no marks, no updates, no group, no way out.
    assert.doesNotMatch(page.text, /Your marks|Your group|Leave the programme|Every week stays open|Course complete/);
    assert.doesNotMatch(page.text, HOW_MANY);
  });

  test("somebody who did not finish: has ended, the thanks, the term and the group, the survey theirs to answer, and nothing about finishing", async () => {
    allWeeksUp();
    const id = await surveysSent();
    at(AFTER);
    const page = await programmePage("bea");
    assert.equal(page.component, "RunHome");
    assert.match(
      page.text,
      /^My programmes AGI Strategy AGI Strategy has ended\. Thanks for being part of it\. Autumn 2026 · Group A\. The survey at the end The same 9 questions as week 1, then how it went\. About 10 minutes\. It closes on Fri 18 Dec\. Answer it What you keep The reading list for all 6 weeks The 6 weeks /,
    );
    assert.match(page.html, new RegExp(`href="/survey/${tokenOf("bea", id)}" class="endButton"`));
    assert.match(page.html, /<header class="afterHead"><h1 class="afterTitle">AGI Strategy has ended\.<\/h1>/);
    // The term and the group stay together after the thanks, as the board keeps them.
    assert.match(page.html, /<p class="afterHeadLine">Thanks for being part of it\. <span class="afterPart">Autumn 2026 · Group A\.<\/span><\/p>/);
    assert.doesNotMatch(page.text, /You finished|did not finish|didn’t finish|not finished|at least \d/i);
    // With no form taking applications or opening and no event to come, there is no What's next.
    assert.doesNotMatch(page.text, /What’s next/);
  });

  test("before the member's own last session is over, the page reads nothing of the end", async () => {
    allWeeksUp();
    welcomeBack();
    await surveysSent();
    // Week 6, Group A's last session not yet held.
    at("2026-12-03T12:00:00Z");
    const page = await programmePage("amara");
    assert.equal(page.component, "RunHome");
    assert.equal("endSurvey" in page.props, false);
    assert.equal("nextEvent" in page.props, false);
    assert.doesNotMatch(page.text, /What you keep|survey at the end/);
  });

  test("the survey at the end, once closed unanswered, is gone; answered, it stays", async () => {
    allWeeksUp();
    const id = await surveysSent();
    at("2026-12-04T12:00:00Z");
    await answerAs("dev", id);
    at("2026-12-19T12:00:00Z");
    assert.doesNotMatch((await programmePage("bea")).text, /survey at the end/);
    assert.match((await programmePage("dev")).text, /Your survey at the end Sent Fri 4 Dec\. Thank you\./);
  });

  test("what they keep: the action plan, on the one week page whose fill-in boxes hold it, once they wrote in it", async () => {
    allWeeksUp();
    at(AFTER);
    await w.asBrowser("chloe");
    const week6 = w.ui.overview.weeks.find((week) => week.weekNumber === 6);
    // Week 6's action plan: one task whose fill-in boxes are the plan, as the overview hands it.
    week6.thisWeek = {
      rows: [
        {
          type: "task",
          what: "Write your action plan",
          time: "About 20 minutes",
          when: "before",
          whenText: "",
          label: "Your action plan",
          needs: { tickIds: [], promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: ["box1", "box2"], unseenIds: [] },
          written: [],
          sent: [],
          answer: null,
          packs: {},
          ready: [],
          talk: null,
          due: null,
        },
      ],
      total: "",
      dayBeforeTime: null,
      answers: [],
      feedbackOn: [],
      answersReadBy: "facilitators",
    };
    // A4: only what the person has. With nothing written in its boxes there is no plan to keep.
    const none = w.programmeHome("chloe");
    assert.match(none.text, / What you keep The reading list for all 6 weeks The 6 weeks /);
    assert.doesNotMatch(none.text, /Your action plan/);
    assert.doesNotMatch(none.html, new RegExp(`<a href="/learn/${RUN.agi}/weeks/6" class="keepLink">`));
    // One box written of two: a plan to keep, on its week's page.
    week6.thisWeek.rows[0].written = ["box1"];
    const { html, text } = w.programmeHome("chloe");
    assert.match(text, / What you keep Your action plan Week 6 The reading list for all 6 weeks /);
    assert.match(html, new RegExp(`<a href="/learn/${RUN.agi}/weeks/6" class="keepLink">`));
    // The board's other four have no page that holds them all yet: none is drawn as a link to nowhere.
    assert.doesNotMatch(text, /Your reflections|Your written answers|Notes shared with your group|Go further list/);
  });

  test("a facilitator who holds a place reads the page as anybody taking part, with their group's panel after it", async () => {
    allWeeksUp();
    w.world.db.seed(`courseEnrolments/${RUN.agi}__rahul`, {
      ...w.world.db.read(`courseEnrolments/${RUN.agi}__chloe`),
      uid: "rahul",
    });
    at(AFTER);
    await w.asBrowser("rahul");
    const { text } = w.programmeHome("rahul");
    assert.match(text, /^My programmes AGI Strategy AGI Strategy has ended\. Thanks for being part of it\. Autumn 2026 · Group B\. What you keep /);
    // The group they hold a place in is their seat, not their post, so it draws no panel of its own (as on every week).
    assert.match(text, /See your progress week by week →$/);
  });

  test("staff read the head's sentence over the page as before, and nothing of the after page", async () => {
    allWeeksUp();
    at(AFTER);
    for (const who of ["rahul", "zach"]) {
      await w.asBrowser(who);
      const { text } = w.programmeHome(who);
      assert.match(text, /AGI Strategy Fellowship has ended\. Thanks for being part of it\. Every week stays open, so you can go back to any of them\./, who);
      assert.doesNotMatch(text, /What you keep|survey at the end|You finished/, who);
    }
  });

  test("somebody who left reads the page that says so, and keeps nothing; the leads, anybody else and somebody signed out are sent away", async () => {
    allWeeksUp();
    await surveysSent();
    // Tariq leaves on Fri 20 Nov, keeping Publish's stamp, as leaving does.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { status: "withdrawn", droppedOutAt: new Date("2026-11-20T10:00:00Z") });
    at(AFTER);
    const left = await programmePage("tariq");
    assert.equal(left.component, "LeftProgramme");
    assert.doesNotMatch(left.text, /What you keep|survey at the end|What’s next|reading list/i);
    for (const who of ["claudia", "tess", "nobody"]) {
      const page = await programmePage(who);
      assert.notEqual(page.component, "RunHome", who);
    }
    assert.equal((await programmePage(null)).to, "/learn");
  });
});
