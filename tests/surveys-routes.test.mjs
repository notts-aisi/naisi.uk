/**
 * THE BEFORE SURVEY, THROUGH ITS REAL ROUTES AND PAGES (docs/surveys.md):
 * making it, changing it until it is sent, the test the send waits for, the
 * send and its count, people who join since, reminding by hand, closing,
 * answering by a personal link and signed in, once, the admins' pages, the
 * spreadsheet with names and the record of it, names coming off, and a
 * survey that outlives its form.
 *
 * Every caller is tried where it matters: an admin, the programme's lead, the
 * lead of another programme, a facilitator, a member holding a place, a
 * member who holds none, somebody signed out with and without a link, a
 * wrong link, a closed survey and a view-as session.
 *
 * The world is `tests/lib/surveyWorld.mjs` (AGI Strategy on Thu 29 Oct 2026,
 * week 1). The mail door records each message and sends none. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AGI, LINES, NOW, ROUND, RUN, formPath, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";
import { applicationPath } from "./lib/applicationsSmallTerm.mjs";

const w = await makeSurveyWorld("__surveysRoutes");
const { routes, call } = w;
const { REFUSAL } = w.lib.words;

/** The clock, set to `at` for one test: Date only, so the mail dispatcher's pauses stay real. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

/** A term where Ines can still accept her invitation, and a second admin to press buttons. */
function seed(over = {}) {
  const base = surveySeed();
  base[applicationPath("ines")].invitation.replyBy = "2026-11-06";
  base["users/ada"] = { ...base["users/zach"], uid: "ada", email: "ada@example.com", displayName: "Ada Lovelace", profile: { ...base["users/zach"].profile, preferredName: "Ada" } };
  return { ...base, ...over };
}

/** Made and sent to the four holding a place, by the admin, after a test. */
async function sentSurvey() {
  const made = await w.make();
  const id = made.body.survey.id;
  const sent = await w.sendFirst(id);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return id;
}

const short = (response) => [response.status, response.body?.error ?? null];

const CHOICES = {
  q_catastrophe: { type: "choice", optionId: "o_notsure" },
  q_when: { type: "choice", optionId: "o_2036to2045" },
  q_important: { type: "choice", optionId: "o_agree" },
  q_explain: { type: "lines", values: { l1: 2, l2: 2, l3: 1, l4: 1, l5: 2 } },
  q_where: { type: "choice", optionId: "o_curious" },
  q_next12: { type: "choices", optionIds: ["o_course"] },
};

// ---------------------------------------------------------------------------
// Who may make, change, send, remind, close and export
// ---------------------------------------------------------------------------

describe("only an admin makes, changes, sends, reminds, closes and exports", () => {
  const NOT_ADMINS = [
    ["claudia", "the programme's lead"],
    ["tess", "the lead of another programme"],
    ["rahul", "a facilitator of one of its groups"],
    ["amara", "a member holding a place"],
    ["nobody", "a member who holds none"],
  ];

  test("making one: refused to everybody but an admin, before anything is read", async (t) => {
    clock(t);
    w.reset(seed());
    for (const [who, why] of NOT_ADMINS) {
      const before = w.everything();
      assert.deepEqual(short(await w.make(who)), [403, REFUSAL.adminOnly], why);
      assert.equal(w.everything(), before, `${why} changed something`);
    }
    assert.deepEqual(short(await w.make(null)), [401, REFUSAL.notSignedIn]);
    const viewAs = await call("zach", routes.create.POST, {}, { body: {}, viewAs: true });
    assert.equal(viewAs.status, 403, "an admin viewing the site as somebody makes nothing");
    assert.equal(w.surveyIds().length, 0);
  });

  test("every admin route refuses the same callers, and a view-as session", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    const presses = [
      ["questions", routes.questions.POST, { title: "x" }],
      ["test", routes.test.POST, { email: "survey" }],
      ["send", routes.send.POST, { to: "everyone", emails: 4 }],
      ["remind", routes.remind.POST, { emails: 0 }],
      ["close", routes.close.POST, {}],
      ["export", routes.exportCsv.POST, {}],
    ];
    for (const [name, handler, body] of presses) {
      for (const [who, why] of NOT_ADMINS) {
        assert.equal((await call(who, handler, { surveyId: id }, { body })).status, 403, `${name}: ${why}`);
      }
      assert.equal((await call(null, handler, { surveyId: id }, { body })).status, 401, `${name}: signed out`);
      assert.equal((await call("zach", handler, { surveyId: id }, { body, viewAs: true })).status, 403, `${name}: view-as`);
    }
    assert.equal(w.world.mail.length, 0, "nobody refused sent anything");
    assert.equal(w.people(id).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Making it, from the template
// ---------------------------------------------------------------------------

describe("making the before survey", () => {
  test("from the template, with the programme's lines, its closing day and the day names come off", async (t) => {
    clock(t);
    w.reset(seed());
    const made = await w.make();
    assert.equal(made.status, 200);
    const stored = w.survey(made.body.survey.id);
    assert.equal(stored.name, "AGI Strategy: before");
    assert.equal(stored.title, "Before you start");
    assert.equal(
      stored.intro,
      "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 6 questions and takes about 3 minutes.\n\nWe’ll ask the same at the end.",
    );
    assert.equal(stored.privacy, "confidential");
    assert.deepEqual(stored.audience, { kind: "programme", roundId: ROUND, programmeId: AGI });
    assert.equal(stored.runId, RUN.agi);
    // The run's last session is Group C's on Wed 9 Dec; a year after.
    assert.equal(stored.namesOffOn, "2027-12-09");
    // 23:59 in London on Wed 4 Nov (GMT).
    assert.equal(new Date(stored.closesAt).toISOString(), "2026-11-04T23:59:00.000Z");
    assert.equal(stored.firstSentAt, null);
    const lines = stored.items.find((item) => item.id === "q_explain").lines.map((line) => line.label);
    assert.deepEqual(lines, LINES);
    assert.equal(w.people(made.body.survey.id).length, 0, "nobody is anybody's until it is sent");
  });

  test("a second before survey for the same programme is refused", async (t) => {
    clock(t);
    w.reset(seed());
    await w.make();
    assert.deepEqual(short(await w.make()), [409, "It has its before survey already."]);
  });

  test("refused without a run to end it, without a closing day, with a day gone, and without the lines", async (t) => {
    clock(t);
    w.reset(seed());
    assert.equal((await w.make("zach", { closesOn: "2026-10-28" })).body.error, REFUSAL.closesPast);
    assert.equal((await w.make("zach", { closesOn: "not a day" })).status, 400);
    assert.equal((await w.make("zach", { lines: ["", "", "", "", ""] })).status, 400);
    w.world.db.poke(formPath, { [`programmes.${AGI}.runId`]: null });
    const noRun = await w.make();
    assert.equal(noRun.status, 409);
    assert.match(noRun.body.error, /Name the programme’s course run/);
    assert.equal(w.surveyIds().length, 0);
  });
});

// ---------------------------------------------------------------------------
// Changing it until it is sent
// ---------------------------------------------------------------------------

describe("the questions change until the first send, and never after", () => {
  test("wording, options, lines and order are saved; the questions themselves cannot be added or taken out", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    const stored = w.survey(id);
    const items = structuredClone(stored.items);
    const q1 = items.findIndex((item) => item.id === "q_catastrophe");
    const q2 = items.findIndex((item) => item.id === "q_when");
    items[q1].title = "How likely is a catastrophe from advanced AI this century?";
    items.find((item) => item.id === "q_explain").lines[0].label = "How fast AI is getting better";
    [items[q1], items[q2]] = [items[q2], items[q1]];
    const body = { title: "Before you start", intro: "Hello.", minutes: 4, closesOn: "2026-11-05", items };
    assert.equal((await call("zach", routes.questions.POST, { surveyId: id }, { body })).status, 200);
    const saved = w.survey(id);
    assert.equal(saved.items.find((item) => item.id === "q_catastrophe").title, "How likely is a catastrophe from advanced AI this century?");
    assert.equal(saved.items[q1].id, "q_when", "the order moved");
    assert.equal(saved.minutes, 4);
    assert.equal(saved.intro, "Hello.");

    const fewer = { ...body, items: items.filter((item) => item.id !== "q_next12") };
    const refused = await call("zach", routes.questions.POST, { surveyId: id }, { body: fewer });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /can’t be added, taken out or changed in kind/);
    const required = structuredClone(items);
    required.find((item) => item.id === "q_where").required = true;
    assert.equal((await call("zach", routes.questions.POST, { surveyId: id }, { body: { ...body, items: required } })).status, 400);
  });

  test("once sent, nothing about it changes", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const before = JSON.stringify(w.survey(id).items);
    const body = { title: "Changed", intro: "", minutes: 3, closesOn: "2026-11-05", items: w.survey(id).items };
    assert.deepEqual(short(await call("zach", routes.questions.POST, { surveyId: id }, { body })), [409, REFUSAL.sent]);
    assert.equal(JSON.stringify(w.survey(id).items), before);
  });
});

// ---------------------------------------------------------------------------
// The test, the lock and the count
// ---------------------------------------------------------------------------

describe("the first send waits for a test, says how many it reaches, and goes once", () => {
  test("refused until the presser has had a test of this wording, word for word", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    assert.deepEqual(short(await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } })), [409, REFUSAL.noTest]);
    assert.equal(w.world.mail.length, 0);
    assert.equal(w.survey(id).firstSentAt, null, "a refused press fixes nothing");

    const tested = await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    assert.deepEqual(tested.body, { ok: true, delivery: "sent", recorded: true });
    const [test] = w.mailText();
    assert.equal(test.to, "zach@example.com", "the test goes to the presser and nobody else");
    assert.equal(test.subject, "[TEST] Before you start: 6 questions for AGI Strategy");
    assert.equal(test.kind, "course-test", "a test is no notice");

    // The words change after the test: the test no longer counts.
    const stored = w.survey(id);
    await call("zach", routes.questions.POST, { surveyId: id }, {
      body: { title: stored.title, intro: "Week 1 is open.", minutes: 3, closesOn: "2026-11-04", items: stored.items },
    });
    assert.deepEqual(short(await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } })), [409, REFUSAL.staleTest]);
    // Another admin's own test is theirs: it is signed by them.
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    assert.deepEqual(short(await call("ada", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } })), [409, REFUSAL.staleTest]);
    assert.equal(w.world.mail.filter((message) => message.kind === "notice").length, 0);
  });

  test("a test held by this copy of the site reached nobody, and is not recorded", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    w.world.mailFate = () => "held";
    const tested = await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    assert.deepEqual(tested.body, { ok: true, delivery: "held", recorded: false });
    assert.equal(w.survey(id).tests.survey, null);
  });

  test("the number on the button must be the number it reaches now", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    const wrong = await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 30 } });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.error, "Nothing was sent: the number of people this reaches is now 4. Check the list and press again.");
    assert.equal(wrong.body.emails, 4);
    assert.equal(w.world.mail.filter((message) => message.kind === "notice").length, 0);
    assert.equal(w.survey(id).firstSentAt, null);
  });

  test("everybody holding a place gets one email each, a notice with their own link, word for word", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const notices = w.mailText().filter((message) => message.kind === "notice");
    assert.deepEqual(notices.map((message) => message.to).sort(), ["amara@example.com", "bea@example.com", "dev@example.com", "tariq@example.com"]);
    for (const message of notices) {
      assert.equal(message.surface, "course-survey");
      assert.equal(message.subject, "Before you start: 6 questions for AGI Strategy");
      for (const sentence of [
        "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 6 questions and takes about 3 minutes.",
        "We’ll ask the same at the end.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
        "Answer the 6 questions",
        "Zach For NAISI",
        "Sent as an important notice",
      ]) {
        assert.ok(message.text.includes(sentence), `${message.to}: missing "${sentence}"`);
      }
      assert.doesNotMatch(message.text, /unsubscribe/i);
    }
    // One message per address, never a list, and each carries its own secret.
    const raw = w.world.mail.filter((message) => message.kind === "notice");
    for (const message of raw) {
      assert.equal(typeof message.to, "string");
      assert.equal(message.replyTo, "ai-safety@uonsu.com");
      assert.equal(message.fromName, "NAISI");
    }
    for (const row of w.people(id)) {
      const mine = w.mailText().find((message) => message.to === `${row.respondent.uid}@example.com` && message.kind === "notice");
      assert.ok(mine.text.includes(`https://naisi.invalid/survey/${row.token}`), `${row.respondent.uid}'s email carries their own link`);
      for (const other of w.people(id).filter((each) => each.token !== row.token)) {
        assert.ok(!mine.text.includes(other.token), `${row.respondent.uid}'s email carries ${other.respondent.uid}'s link`);
      }
      assert.equal(row.delivery, "sent");
      assert.equal(row.answered, false);
    }
    const stored = w.survey(id);
    assert.ok(stored.firstSentAt, "the first send fixes the survey");
    assert.equal(stored.presses.length, 1);
    assert.equal(stored.presses[0].kind, "first");
    assert.equal(stored.presses[0].count, 4);
    assert.equal(stored.inFlight, undefined, "the claim is handed back");
    // Pressed again: it has been sent.
    assert.deepEqual(short(await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } })), [409, REFUSAL.alreadySent]);
  });

  test("the claim itself refuses a second first send, whatever the press read before it", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    // Both presses hold the survey as it was before either was made.
    const { readSurvey } = await w.loadTs("lib/surveys/repo.ts");
    const { pressSend } = await w.loadTs("lib/surveys/sending.ts");
    const stale = await readSurvey(w.world.db, id);
    const input = { survey: stale, presserUid: "zach", emails: 4, namesOffOn: "2027-12-09", now: new Date() };
    assert.equal((await pressSend(w.world.db, "first", input)).ok, true);
    // Somebody joins, so a second "first" press would have somebody to send to.
    const reply = await w.formRoute("application", "reply");
    assert.equal((await call("ines", reply.POST, { roundId: ROUND }, { body: { reply: "accept-invitation" } })).status, 200);
    const second = await pressSend(w.world.db, "first", { ...input, emails: 1 });
    assert.equal(second.ok, false);
    assert.equal(second.error, REFUSAL.alreadySent);
    assert.equal(w.world.mail.filter((message) => message.kind === "notice").length, 4);
  });

  test("two presses at once send it once", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    const [one, two] = await Promise.all([
      call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } }),
      call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 4 } }),
    ]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    assert.equal(w.world.mail.filter((message) => message.kind === "notice").length, 4);
  });
});

// ---------------------------------------------------------------------------
// Joined since, and reminders
// ---------------------------------------------------------------------------

describe("people who join since get it with one button; reminders go only to who hasn't answered", () => {
  test("somebody who accepts after the send is owed it, and gets it from the joined-since press", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const reply = await w.formRoute("application", "reply");
    assert.equal((await call("ines", reply.POST, { roundId: ROUND }, { body: { reply: "accept-invitation" } })).status, 200);
    w.world.mail.length = 0;
    const wrong = await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "joined", emails: 2 } });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.emails, 1);
    const joined = await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "joined", emails: 1 } });
    assert.equal(joined.status, 200);
    assert.deepEqual(w.world.mail.map((message) => message.to), ["ines@example.com"]);
    assert.equal(w.survey(id).presses.at(-1).kind, "joined");
    assert.equal((await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "joined", emails: 0 } })).body.error, REFUSAL.nobody);
  });

  test("a reminder waits for its own test and goes only to people who haven't answered and still hold a place", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    assert.equal((await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)).status, 200);
    // Bea gives her place back, as Nina did: she is not reminded.
    w.world.db.poke(applicationPath("bea"), {
      status: "withdrawn",
      attendance: { answer: "cant-make-it", answeredAt: NOW },
      withdrawnAt: NOW,
      releaseReason: { kind: "times", other: "" },
    });
    w.world.mail.length = 0;
    assert.deepEqual(short(await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 2 } })), [409, REFUSAL.noTest]);
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "reminder" } });
    const [test] = w.mailText();
    assert.equal(test.subject, "[TEST] A reminder: 6 questions for AGI Strategy, by Wed 4 Nov");
    assert.ok(test.text.includes("You haven’t answered yet. It’s 6 questions and takes about 3 minutes."));
    w.world.mail.length = 0;
    const reminded = await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 2 } });
    assert.equal(reminded.status, 200, JSON.stringify(reminded.body));
    assert.deepEqual(w.world.mail.map((message) => message.to).sort(), ["dev@example.com", "tariq@example.com"]);
    for (const message of w.mailText()) {
      assert.equal(message.subject, "A reminder: 6 questions for AGI Strategy, by Wed 4 Nov");
      assert.equal(message.surface, "course-survey");
      assert.ok(message.text.includes("It closes on Wed 4 Nov."));
    }
    const dev = w.people(id).find((row) => row.respondent.uid === "dev");
    assert.equal(dev.reminders, 1);
    assert.equal(w.survey(id).presses.at(-1).kind, "remind");
  });

  test("closed, nothing more is sent and nobody can answer", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    assert.equal((await call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    assert.deepEqual(short(await call("zach", routes.close.POST, { surveyId: id }, { body: {} })), [409, REFUSAL.closed]);
    assert.deepEqual(short(await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 4 } })), [409, REFUSAL.closedSend]);
    assert.deepEqual(short(await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)), [409, REFUSAL.closed]);
    assert.equal(w.answers(id).length, 0);
  });

  test("closed while an answer is on its way, the answer is refused, not kept", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    // The survey is closed by hand between the answer's first read and its commit.
    w.world.db.beforeCommit = () => w.world.db.poke(`surveys/${id}`, { closedAt: new Date() });
    assert.deepEqual(short(await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)), [409, REFUSAL.closed]);
    assert.equal(w.answers(id).length, 0);
    assert.equal(w.people(id).find((row) => row.respondent.uid === "amara").answered, false);
  });

  test("past its closing time it refuses answers on its own", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    t.mock.timers.setTime(new Date("2026-11-05T00:00:00Z").getTime());
    assert.deepEqual(short(await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)), [409, REFUSAL.closed]);
  });
});

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

describe("answering: by a personal link or signed in, once, every question skippable", () => {
  test("by the link, signed out: kept against the person, with the day and time, how, and whether their group had met", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    assert.equal((await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)).status, 200);
    // Bea's group meets at 6pm tonight: an answer after it is labelled.
    t.mock.timers.setTime(new Date("2026-10-29T20:30:00Z").getTime());
    assert.equal((await w.answerByLink(w.tokenOf(id, "bea"), {})).status, 200, "every question can be skipped");
    const [amara, bea] = ["amara", "bea"].map((uid) => w.answers(id).find((row) => row.respondent.uid === uid));
    assert.deepEqual(Object.keys(amara).sort(), ["afterFirstSession", "answers", "path", "respondent", "roundId", "sentAt", "surveyId", "via"]);
    assert.equal(amara.via, "link");
    assert.equal(amara.afterFirstSession, false, "Group B first meets on Tue 3 Nov");
    assert.equal(bea.afterFirstSession, true, "Group A met at 6pm");
    assert.deepEqual(bea.answers, {});
    assert.equal(new Date(amara.sentAt).toISOString(), NOW.toISOString());
    assert.equal(w.people(id).find((row) => row.respondent.uid === "amara").answered, true);
  });

  test("once: a second send is refused, and two at once keep one", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const token = w.tokenOf(id, "dev");
    const [one, two] = await Promise.all([w.answerByLink(token, CHOICES), w.answerByLink(token, CHOICES)]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    assert.deepEqual(short(await w.answerByLink(token, CHOICES)), [409, REFUSAL.answered]);
    assert.equal(w.answers(id).length, 1);
  });

  test("a wrong link, a malformed one and a test link keep nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    assert.deepEqual(short(await w.answerByLink("x".repeat(43), CHOICES)), [404, REFUSAL.noLink]);
    assert.deepEqual(short(await w.answerByLink("short", CHOICES)), [400, REFUSAL.noLink]);
    assert.deepEqual(short(await w.answerByLink(w.survey(id).testToken, CHOICES)), [409, REFUSAL.testLink]);
    assert.equal(w.answers(id).length, 0);
  });

  test("answers are checked against the survey's own questions", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const token = w.tokenOf(id, "tariq");
    assert.equal((await w.answerByLink(token, { q_nope: { type: "choice", optionId: "o_x" } })).status, 400);
    assert.equal((await w.answerByLink(token, { q_explain: { type: "lines", values: { l1: 6 } } })).status, 400);
    assert.equal((await w.answerByLink(token, { q_where: { type: "choice", optionId: "o_nope" } })).status, 400);
    assert.equal(w.answers(id).length, 0);
    assert.equal((await w.answerByLink(token, { q_explain: { type: "lines", values: { l1: 5, l2: null } } })).status, 200);
    assert.deepEqual(w.answers(id)[0].answers, { q_explain: { type: "lines", values: { l1: 5 } } });
  });

  test("signed in: the caller's own row, refused to anybody it wasn't sent to and during view-as", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const as = (who, options = {}) => call(who, routes.answerSignedIn.POST, { surveyId: id }, { body: { answers: CHOICES }, ...options });
    assert.equal((await as("amara", { viewAs: true })).status, 403);
    for (const who of ["claudia", "rahul", "nobody", "zach"]) {
      assert.deepEqual(short(await as(who)), [404, REFUSAL.notYours], who);
    }
    assert.equal((await as(null)).status, 401);
    assert.equal((await as("amara")).status, 200);
    const kept = w.answers(id);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].respondent.uid, "amara");
    assert.equal(kept[0].via, "signed-in");
    assert.deepEqual(short(await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)), [409, REFUSAL.answered]);
  });
});

// ---------------------------------------------------------------------------
// The pages people see
// ---------------------------------------------------------------------------

describe("the answer page, by link and signed in, records nothing", () => {
  test("Amara's page, signed out: the board's words, her lead and her facilitators named", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const before = w.everything();
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "amara") }) });
    assert.equal(w.everything(), before, "opening the page wrote something");
    for (const words of [
      "Fellowship: AGI Strategy · Week 1",
      "Before you start",
      "Every question can be skipped.",
      "Confidential",
      "Only NAISI’s admins can see who said what.",
      "Claudia sees totals and comments, never names. Rahul and Sofia never see your answers.",
      "Nothing you say here affects your place or a future application.",
      "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
      "Your name comes off on Thu 9 Dec 2027, a year after the fellowship ends. The totals stay.",
      "We ask who you are so we can compare your answers at the start and the end.",
      "Page 1 of 3 What you think about AI",
      "1 How likely is it that advanced AI causes a catastrophe for humanity this century?",
      "Page 2 of 3 What you could explain",
      "4 How confident would you be explaining these to a friend?",
      "Not at all Very",
      "6 In the next 12 months, which of these might you do? Tick as many as apply",
      "Send my answers",
      "It closes on Wed 4 Nov. Once sent, your answers can’t change.",
    ]) {
      assert.ok(page.text.includes(words), `missing "${words}"`);
    }
    // Before the script, every page shows and Send waits.
    assert.match(page.html, /<button type="submit"[^>]*disabled=""/);
    assert.doesNotMatch(page.html, /hidden=""/);
  });

  test("the box says the nearest true thing for somebody not told their group, or in none", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const boxOf = async (uid) => (await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, uid) }) })).text;
    assert.ok((await boxOf("bea")).includes("Claudia sees totals and comments, never names. Sofia never sees your answers."));
    for (const uid of ["dev", "tariq"]) {
      const text = await boxOf(uid);
      assert.ok(text.includes("Claudia sees totals and comments, never names. Your facilitators never see your answers."), uid);
      assert.ok(!/Sofia|Rahul|Tom/.test(text), `${uid}'s page names a group they have not been told`);
    }
  });

  test("a wrong link, an answered survey and a closed one each say so in a sentence", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const at = async (token) => (await w.page(w.pages.link, { params: Promise.resolve({ token }) })).text;
    assert.match(await at("x".repeat(43)), /This link doesn’t open a survey/);
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    assert.match(await at(w.tokenOf(id, "amara")), /You’ve answered/);
    await call("zach", routes.close.POST, { surveyId: id }, { body: {} });
    assert.match(await at(w.tokenOf(id, "dev")), /This survey has closed It closed on Thu 29 Oct/);
    // The test link opens the survey whatever its state, and keeps nothing.
    const test = await at(w.survey(id).testToken);
    assert.ok(test.includes("Before you start") && test.includes("there is no Send button"), test.slice(0, 200));
  });

  test("the test link shows the survey and offers no Send", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(id).testToken }) });
    assert.ok(page.text.includes("Before you start"));
    assert.ok(page.text.includes("This is a test of the survey’s link. Nothing you send from here is kept, so there is no Send button."));
    assert.doesNotMatch(page.html, /type="submit"/);
  });

  test("signed in, inside the programme: only for somebody it was sent to", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const as = (who) => w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.agi, surveyId: id }) }, who);
    const amara = await as("amara");
    assert.ok(amara.text.includes("Claudia sees totals and comments, never names. Rahul and Sofia never see your answers."));
    assert.ok(amara.html.includes(`href="/learn/${RUN.agi}"`), "the crumb goes back to the programme");
    for (const who of ["claudia", "rahul", "nobody", "zach"]) {
      assert.match((await as(who)).text, /This survey isn’t one you were sent/, who);
    }
    const otherRun = await w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.tais, surveyId: id }) }, "amara");
    assert.match(otherRun.text, /This survey isn’t one you were sent/);
  });
});

// ---------------------------------------------------------------------------
// The admins' pages, the results and the spreadsheet
// ---------------------------------------------------------------------------

describe("the admins' pages", () => {
  test("the Send tab before the first send: the email, the test and the number", async (t) => {
    clock(t);
    w.reset(seed());
    const id = (await w.make()).body.survey.id;
    const page = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    for (const words of [
      "Surveys › AGI Strategy: before › Send",
      "Before you start: 6 questions for AGI Strategy",
      "Reply to ai-safety@uonsu.com",
      "To 4 people",
      "Send a test to me",
      "Email 4 people",
      "Send yourself a test of this email first. The button waits for it.",
      "Everyone holding a place on AGI Strategy (4)",
      "Wed 4 Nov, 23:59",
      "Thu 9 Dec 2027, a year after the programme ends.",
      "Answers sent after someone’s first session are labelled, so the comparison can leave them out.",
    ]) {
      assert.ok(page.text.includes(words), `missing "${words}"`);
    }
  });

  test("the Send tab after it: what went, the progress, joined since and Remind, each with its count", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    const page = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    for (const words of [
      "Thu 29 Oct, 9am Emailed the 4 people holding a place",
      "1 of 4 have answered. It closes on Wed 4 Nov.",
      "Nobody new since Thu 29 Oct.",
      "3 haven’t answered. Nothing goes until you press the button.",
      "A reminder: 6 questions for AGI Strategy, by Wed 4 Nov",
      "Email 3 people",
      "Reminders go only to people who haven’t answered. Nobody else is told who has.",
      "Close it now",
    ]) {
      assert.ok(page.text.includes(words), `missing "${words}"`);
    }
  });

  test("the list, Who answered and the results", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    await w.answerByLink(w.tokenOf(id, "dev"), { q_catastrophe: { type: "choice", optionId: "o_1to10" } });
    const list = await w.page(w.pages.list, {}, "zach");
    for (const words of ["Surveys", "Only admins make and send surveys.", "Open 1", "AGI Strategy: before", "Fellowship: AGI Strategy", "2 of 4", "Closes Wed 4 Nov", "2 haven’t answered"]) {
      assert.ok(list.text.includes(words), `list: missing "${words}"`);
    }
    const answered = await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(answered.text.includes("2 of 4 have answered"));
    assert.ok(answered.text.includes("Amara Okafor"));
    assert.ok(answered.text.includes("Personal link"));
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(results.text.includes("2 answers."), "results show from the first answers: there is no floor");
    assert.ok(results.text.includes("1. How likely is it that advanced AI causes a catastrophe for humanity this century?"));
    assert.ok(results.text.includes("2 answered"));
    assert.ok(results.text.includes("Not sure"));
    assert.doesNotMatch(results.text, /Amara|Okafor|Dev Patel/, "results never name anybody");
  });

  test("the spreadsheet with names: recorded as a download before it is handed over, and refused when it cannot be", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    const file = await w.exportAs("zach", id);
    assert.equal(file.status, 200);
    assert.match(file.headers["content-disposition"], /attachment; filename="agi-strategy-before-answers-2026-10-29\.csv"/);
    const [header, row] = file.text.trim().split(/\r?\n/);
    assert.match(header, /^Name,Sent,How,After their first session,1\. How likely/);
    assert.match(row, /^Amara Okafor,2026-10-29 09:00,Personal link,No,Not sure,/);
    assert.doesNotMatch(file.text, /@example\.com/, "never an address");
    const logged = w.world.db.paths().filter((path) => path.startsWith("dataExports/")).map((path) => w.world.db.read(path));
    assert.equal(logged.length, 1);
    assert.equal(logged[0].kind, "survey-answers");
    assert.deepEqual(logged[0].scope, { surveyId: id, roundId: ROUND });
    assert.equal(logged[0].rowCount, 1);
    assert.equal(logged[0].actorUid, "zach");

    // A record that cannot be written refuses the file.
    const realAdd = w.world.db.collection;
    w.world.db.collection = (path) => {
      const found = realAdd(path);
      if (path === "dataExports") found.add = async () => { throw new Error("the log is down"); };
      return found;
    };
    t.mock.method(console, "error", () => {});
    try {
      const refused = await w.exportAs("zach", id);
      assert.equal(refused.status, 503);
    } finally {
      w.world.db.collection = realAdd;
    }
  });
});

// ---------------------------------------------------------------------------
// Names come off, and a survey outlives its form
// ---------------------------------------------------------------------------

describe("names come off a year after the programme, and the totals stay", () => {
  test("the job takes the person off every answer and deletes the people rows on the day, and not before", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    const ctx = (now) => ({ now, log() {}, maxPerTick: 5, maxLateHours: 0, budget: { remainingMs: () => 60000, expired: () => false }, policy: {} });
    const early = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2027-12-08T12:00:00Z")));
    assert.equal(early.processed, 0);
    assert.equal(w.answers(id)[0].respondent.uid, "amara");
    const due = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2027-12-09T00:30:00Z")));
    assert.equal(due.processed, 1);
    assert.equal(w.answers(id)[0].respondent, null, "the answer stays without its person");
    assert.deepEqual(w.answers(id)[0].answers, CHOICES, "the answers themselves are untouched");
    assert.equal(w.people(id).length, 0, "nobody's link or row is left");
    assert.ok(w.survey(id).namesOffAt);
    assert.equal(w.world.mail.filter((message) => message.kind !== "course-test" && message.kind !== "notice").length, 0);
    const again = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2027-12-10T00:30:00Z")));
    assert.equal(again.processed, 0, "a survey is visited once");
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(results.text.includes("1 answer."), "the totals stay");
    const file = await w.exportAs("zach", id);
    assert.match(file.text, /\(name taken off\)/);
  });

  test("the job emails nobody and registers on: the policy's promise rests on it", () => {
    const job = w.lib.job.surveyNamesOffJob;
    assert.equal(job.id, "surveys-names-off");
    assert.notEqual(job.enabledByDefault, false);
  });
});

describe("a survey outlives its form", () => {
  test("its results, who answered and its spreadsheet stay; nothing more can be sent", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    // The form goes, as a destroy leaves it.
    const store = w.world.db;
    const before = store.read(formPath);
    assert.ok(before);
    store.seed(formPath, { destroyed: true });
    assert.equal((await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "joined", emails: 0 } })).body.error, REFUSAL.formGone);
    const answered = await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(answered.text.includes("Amara Okafor"));
    const list = await w.page(w.pages.list, {}, "zach");
    assert.ok(list.text.includes("Fellowship: AGI Strategy"), "the survey names its programme without the form");
    assert.equal((await w.exportAs("zach", id)).status, 200);
  });
});
