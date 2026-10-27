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
import { readFileSync } from "node:fs";
import { AGI, B, NOW, ROUND, RUN, formPath, makeSurveyWorld, seat, surveySeed } from "./lib/surveyWorld.mjs";
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

/** Answers to the before survey's questionnaire, of each kind it asks. */
const CHOICES = {
  q_c1: { type: "choice", optionId: "o_stage1" },
  q_c2: { type: "percent", value: 20 },
  q_c3: { type: "choices", optionIds: ["o_policy", "o_strategy"] },
  q_c4: { type: "scale", value: 3 },
  q_c6: { type: "number", value: 2 },
  q_c7: { type: "lines", values: { l_next: 2, l_contribute: 3 } },
  q_c9: { type: "choices", optionIds: ["o_event"] },
  q_p6: { type: "text", text: "To explain the risk clearly." },
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
      "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 14 questions and takes about 5 minutes.\n\nWe’ll ask the same at the end.",
    );
    assert.equal(stored.kind, "before");
    assert.equal(stored.minutes, 5);
    assert.equal(stored.pairOf, null, "the before survey pairs with nothing");
    assert.equal(stored.strand, null, "a fellowship has no strand");
    assert.deepEqual(stored.items, w.lib.templates.templateItems("before", "fellowship", null), "the questionnaire's before survey, as made");
    assert.equal(stored.privacy, "confidential");
    assert.deepEqual(stored.audience, { kind: "programme", roundId: ROUND, programmeId: AGI });
    assert.equal(stored.runId, RUN.agi);
    // The run's last session is Group C's on Wed 9 Dec 2026; two years after.
    assert.equal(stored.namesOffOn, "2028-12-09");
    // 23:59 in London on Wed 4 Nov (GMT).
    assert.equal(new Date(stored.closesAt).toISOString(), "2026-11-04T23:59:00.000Z");
    assert.equal(stored.firstSentAt, null);
    assert.equal(w.people(made.body.survey.id).length, 0, "nobody is anybody's until it is sent");
  });

  test("a second before survey for the same programme is refused", async (t) => {
    clock(t);
    w.reset(seed());
    await w.make();
    assert.deepEqual(short(await w.make()), [409, "It has its before survey already."]);
  });

  test("refused without a run to end it, without a closing day, with a day gone, and for a stage that isn't one", async (t) => {
    clock(t);
    w.reset(seed());
    assert.equal((await w.make("zach", { closesOn: "2026-10-28" })).body.error, REFUSAL.closesPast);
    assert.equal((await w.make("zach", { closesOn: "not a day" })).status, 400);
    assert.deepEqual(short(await w.make("zach", { stage: "during" })), [400, "Pick which of the programme’s surveys to make."]);
    assert.deepEqual(short(await w.make("zach", { strand: "biology" })), [400, REFUSAL.strand]);
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
    const q1 = items.findIndex((item) => item.id === "q_c1");
    const q2 = items.findIndex((item) => item.id === "q_c2");
    items[q1].title = "Which of these is closest to you right now?";
    items.find((item) => item.id === "q_c7").lines[0].label = "I know my next concrete step.";
    [items[q1], items[q2]] = [items[q2], items[q1]];
    const body = { title: "Before you start", intro: "Hello.", minutes: 4, closesOn: "2026-11-05", items };
    assert.equal((await call("zach", routes.questions.POST, { surveyId: id }, { body })).status, 200);
    const saved = w.survey(id);
    assert.equal(saved.items.find((item) => item.id === "q_c1").title, "Which of these is closest to you right now?");
    assert.equal(saved.items.find((item) => item.id === "q_c7").lines[0].label, "I know my next concrete step.");
    assert.equal(saved.items[q1].id, "q_c2", "the order moved");
    assert.equal(saved.minutes, 4);
    assert.equal(saved.intro, "Hello.");

    const fewer = { ...body, items: items.filter((item) => item.id !== "q_c9") };
    const refused = await call("zach", routes.questions.POST, { surveyId: id }, { body: fewer });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /can’t be added, taken out or changed in kind/);
    const required = structuredClone(items);
    required.find((item) => item.id === "q_c3").required = true;
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
    assert.equal(test.subject, "[TEST] Before you start: 14 questions for AGI Strategy");
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
      assert.equal(message.subject, "Before you start: 14 questions for AGI Strategy");
      for (const sentence of [
        "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 14 questions and takes about 5 minutes.",
        "We’ll ask the same at the end.",
        "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.",
        "It closes on Wed 4 Nov.",
        "Answer the 14 questions",
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
    const input = { survey: stale, presserUid: "zach", emails: 4, namesOffOn: "2028-12-09", now: new Date() };
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
    assert.equal(test.subject, "[TEST] A reminder: 14 questions for AGI Strategy, by Wed 4 Nov");
    assert.ok(test.text.includes("You haven’t answered yet. It’s 14 questions and takes about 5 minutes."));
    w.world.mail.length = 0;
    const reminded = await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 2 } });
    assert.equal(reminded.status, 200, JSON.stringify(reminded.body));
    assert.deepEqual(w.world.mail.map((message) => message.to).sort(), ["dev@example.com", "tariq@example.com"]);
    for (const message of w.mailText()) {
      assert.equal(message.subject, "A reminder: 14 questions for AGI Strategy, by Wed 4 Nov");
      assert.equal(message.surface, "course-survey");
      assert.ok(message.text.includes("It closes on Wed 4 Nov."));
    }
    const dev = w.people(id).find((row) => row.respondent.uid === "dev");
    assert.equal(dev.reminders, 1);
    assert.equal(w.survey(id).presses.at(-1).kind, "remind");
  });

  // The survey list's "Remind 2 haven't answered" is the number its Remind
  // button reaches (`remindReach`), not everybody it was sent to who has not
  // answered; the Send tab says the one it no longer reaches beside who
  // answered, so its two lines add up (walk 4b, L4).
  test("once somebody gives their place back, the list's Remind count is what the button reaches, and the Send tab says who it no longer reaches", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    assert.equal((await w.answerByLink(w.tokenOf(id, "amara"), CHOICES)).status, 200);
    w.world.db.poke(applicationPath("bea"), {
      status: "withdrawn",
      attendance: { answer: "cant-make-it", answeredAt: NOW },
      withdrawnAt: NOW,
      releaseReason: { kind: "times", other: "" },
    });
    const list = await w.page(w.pages.list, {}, "zach");
    assert.ok(list.text.includes("1 of 4 Closes Wed 4 Nov Remind 2 haven’t answered"), list.text);
    const send = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach");
    for (const words of [
      "1 of 4 have answered, and 1 who hasn’t no longer holds a place. It closes on Wed 4 Nov.",
      "2 haven’t answered. Nothing goes until you press the button.",
      "Email 2 people",
    ]) {
      assert.ok(send.text.includes(words), `missing "${words}"`);
    }
    // The press reaches the same 2, and says so to a wrong number.
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "reminder" } });
    const wrong = await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 3 } });
    assert.deepEqual([wrong.status, wrong.body.emails], [409, 2]);
    // Nobody left: the Send tab's line is the board's, and the list's count is everybody not answered.
    w.reset(seed());
    const again = await sentSurvey();
    assert.equal((await w.answerByLink(w.tokenOf(again, "amara"), CHOICES)).status, 200);
    assert.ok((await w.page(w.pages.list, {}, "zach")).text.includes("1 of 4 Closes Wed 4 Nov Remind 3 haven’t answered"));
    assert.ok((await w.page(w.pages.send, { params: Promise.resolve({ surveyId: again }) }, "zach")).text.includes("1 of 4 have answered. It closes on Wed 4 Nov."));
  });

  test("the list reads who a survey is for once for each programme, and not for a draft, a closed or a leaving survey", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await sentSurvey();
    // The survey at the end, made and sent: the same programme's audience.
    const after = (await w.make("zach", { stage: "after" })).body.survey.id;
    assert.equal((await w.sendFirst(after)).status, 200);
    // The leaving survey, opened: it reaches each person as they leave, and is never reminded.
    const leaving = (await w.make("zach", { stage: "leaving", closesOn: undefined })).body.survey.id;
    const open = await w.loadTs("app/api/surveys/[surveyId]/open/route.ts");
    assert.equal((await call("zach", open.POST, { surveyId: leaving }, { body: {} })).status, 200);
    const queried = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      queried.push(path);
      return collection(path);
    };
    try {
      await w.page(w.pages.list, {}, "zach");
    } finally {
      w.world.db.collection = collection;
    }
    const count = (name) => queried.filter((path) => path === name).length;
    assert.deepEqual([count("admissionApplications"), count("admissionDecisions")], [1, 1], "two open surveys of one programme share one read");
    // Closed, neither reads it.
    for (const id of [before, after]) assert.equal((await call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    queried.length = 0;
    w.world.db.collection = (path) => {
      queried.push(path);
      return collection(path);
    };
    try {
      await w.page(w.pages.list, {}, "zach");
    } finally {
      w.world.db.collection = collection;
    }
    assert.deepEqual([count("admissionApplications"), count("admissionDecisions")], [0, 0], "no survey on the list offers Remind");
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

  test("B4: closed early, the Summary says only the day it closed, as the head and the progress line do", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const sendPage = async () => (await w.page(w.pages.send, { params: Promise.resolve({ surveyId: id }) }, "zach")).text;
    // Open: when it closes, to the minute.
    assert.match(await sendPage(), / Who Everyone holding a place on AGI Strategy \(4\) Closes Wed 4 Nov, 23:59 Names come off /);
    assert.equal((await call("zach", routes.close.POST, { surveyId: id }, { body: {} })).status, 200);
    // Closed by hand on Thu 29 Oct: one date everywhere on the page, the day it closed.
    const closed = await sendPage();
    assert.match(closed, / Who Everyone holding a place on AGI Strategy \(4\) Closed Thu 29 Oct Names come off /);
    assert.match(closed, /^Surveys › AGI Strategy: before › Send AGI Strategy: before Closed Confidential Fellowship: AGI Strategy Closed Thu 29 Oct /);
    assert.match(closed, / It closed on Thu 29 Oct\. Summary /);
    // The email it sent keeps its own words; nothing else on the page names the day it would have closed.
    assert.deepEqual(closed.match(/Wed 4 Nov[^.]*/g), ["Wed 4 Nov"]);
    assert.ok(closed.includes("It closes on Wed 4 Nov. Answer the 14 questions"), "the email as it was sent");
    assert.doesNotMatch(closed, /Closes Wed 4 Nov/);
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
    assert.equal((await w.answerByLink(token, { q_c7: { type: "lines", values: { l_next: 6 } } })).status, 400);
    assert.equal((await w.answerByLink(token, { q_c1: { type: "choice", optionId: "o_nope" } })).status, 400);
    assert.equal((await w.answerByLink(token, { q_c3: { type: "choices", optionIds: ["o_research", "o_policy", "o_strategy", "o_founding"] } })).status, 400, "C3 takes up to 3");
    assert.equal((await w.answerByLink(token, { q_c2: { type: "percent", value: 101 } })).status, 400);
    assert.equal(w.answers(id).length, 0);
    assert.equal((await w.answerByLink(token, { q_c7: { type: "lines", values: { l_next: 5, l_contribute: null } } })).status, 200);
    assert.deepEqual(w.answers(id)[0].answers, { q_c7: { type: "lines", values: { l_next: 5 } } });
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
      "Your name comes off on Sat 9 Dec 2028, two years after the fellowship ends. The totals stay.",
      "We ask who you are so we can compare your answers at the start and the end.",
      "Page 1 of 5 About you",
      "1 Level of study",
      "3 Before this programme, which of these had you done? Tick as many as apply",
      "Page 2 of 5 Where you are now",
      "5 Which best describes you right now? 0 Haven’t really thought about working on AI safety",
      "6 How likely is it that in 5 years most of your working time goes on reducing risks from advanced AI? Research, policy, engineering, operations and fieldbuilding all count.",
      "7 Which kinds of work interest you most? Pick up to 3",
      "8 How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections?",
      "1 Not at all 4 The gist, to a friend 7 Could hold my own with a researcher",
      "Strongly disagree Strongly agree",
      "13 In the last 3 months, have you… Tick as many as apply",
      "Page 5 of 5 To finish",
      "14 What do you most want to get out of this programme?",
      "Consent Anonymised results go to our funders: totals, never your name. Contact me at 6 and 12 months with a short follow-up survey",
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

  test("a facilitator who holds a place in the group they run is left out of its facilitators in the box, and is not shown the Facilitator line", async (t) => {
    // Zach, 26 October 2026: the box never tells a reader they cannot see their
    // own answers, and nobody rates their own facilitating.
    clock(t);
    // Rahul runs group B with Sofia, and holds a place in it.
    w.reset(seed({ [`courseEnrolments/${RUN.agi}__rahul`]: seat("rahul", B) }));
    const facts = await w.loadTs("lib/surveys/personFacts.ts");
    const after = { runId: RUN.agi, namesOffOn: "2028-12-09", programmeKind: "fellowship", items: w.lib.templates.templateItems("after", "fellowship", null) };
    assert.deepEqual((await facts.confidentialFactsFor(w.world.db, after, "rahul")).facilitatorNames, ["Sofia"]);
    assert.deepEqual((await facts.confidentialFactsFor(w.world.db, after, "amara")).facilitatorNames, ["Rahul", "Sofia"]);
    assert.deepEqual(await facts.hiddenLinesFor(w.world.db, after, "rahul"), ["l_facilitator"]);
    assert.deepEqual(await facts.hiddenLinesFor(w.world.db, after, "amara"), []);
    // A facilitator with no place is not shown it either: Sofia facilitates group B.
    assert.deepEqual(await facts.hiddenLinesFor(w.world.db, after, "sofia"), ["l_facilitator"]);
    // A survey without the line hides nothing from anybody.
    const before = { ...after, items: w.lib.templates.templateItems("before", "fellowship", null) };
    assert.deepEqual(await facts.hiddenLinesFor(w.world.db, before, "rahul"), []);
    // Sending keeps only the lines the person was shown: the answer route drops
    // a value for a hidden line before anything is written.
    const answerCode = readFileSync(new URL("../src/lib/surveys/answer.ts", import.meta.url), "utf8");
    assert.match(answerCode, /const answers = withoutLines\(read\.answers, await hiddenLinesFor\(db, survey, person\.respondent\.uid\)\);/);
    assert.doesNotMatch(answerCode, /answers: read\.answers,/, "the answer is written as it was sent, hidden lines and all");
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
      "Before you start: 14 questions for AGI Strategy",
      "Reply to ai-safety@uonsu.com",
      "To 4 people",
      "Send a test to me",
      "Email 4 people",
      "Send yourself a test of this email first. The button waits for it.",
      "Everyone holding a place on AGI Strategy (4)",
      "Wed 4 Nov, 23:59",
      "Sat 9 Dec 2028, two years after the programme ends.",
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
      "A reminder: 14 questions for AGI Strategy, by Wed 4 Nov",
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
    await w.answerByLink(w.tokenOf(id, "dev"), { q_c1: { type: "choice", optionId: "o_stage3" } });
    const list = await w.page(w.pages.list, {}, "zach");
    for (const words of ["Surveys", "Only admins make and send surveys.", "Open 1", "AGI Strategy: before", "Fellowship: AGI Strategy", "2 of 4", "Closes Wed 4 Nov", "2 haven’t answered"]) {
      assert.ok(list.text.includes(words), `list: missing "${words}"`);
    }
    // B6: sv-list's lede whole, in the board's words, now that the lead's Surveys tab it names exists.
    assert.ok(
      list.text.startsWith("Surveys Only admins make and send surveys. Leads see results for their own programme, in its Surveys tab. "),
      list.text.slice(0, 200),
    );
    const answered = await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(answered.text.includes("2 of 4 have answered"));
    assert.ok(answered.text.includes("Amara Okafor"));
    assert.ok(answered.text.includes("Personal link"));
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    // Every number has its n and the response rate beside it.
    assert.ok(results.text.includes("2 answers from the 4 people it was sent to (50%)."), "results show from the first answers: there is no floor");
    assert.ok(results.text.includes("5. Which best describes you right now?"));
    assert.ok(results.text.includes("2 answered, 50% of the 4 it was sent to"));
    assert.ok(results.text.includes("My leading plan, no concrete steps yet"));
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
    assert.match(header, /^Name,Sent,How,After their first session,1\. Level of study,2\. Subject of study,/);
    assert.match(row, /^Amara Okafor,2026-10-29 09:00,Personal link,No,,,/);
    assert.ok(row.includes("Thought about it, not a serious option"), "a choice is written in its words");
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

describe("names come off two years after the programme, and the totals stay", () => {
  test("the job takes the person off every answer and deletes the people rows on the day, and not before", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), CHOICES);
    const ctx = (now) => ({ now, log() {}, maxPerTick: 5, maxLateHours: 0, budget: { remainingMs: () => 60000, expired: () => false }, policy: {} });
    // A year on, when names came off before Zach chose two years, they are still on.
    const aYear = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2027-12-09T12:00:00Z")));
    assert.equal(aYear.processed, 0);
    const early = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2028-12-08T12:00:00Z")));
    assert.equal(early.processed, 0);
    assert.equal(w.answers(id)[0].respondent.uid, "amara");
    const due = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2028-12-09T00:30:00Z")));
    assert.equal(due.processed, 1);
    assert.equal(w.answers(id)[0].respondent, null, "the answer stays without its person");
    assert.deepEqual(w.answers(id)[0].answers, CHOICES, "the answers themselves are untouched");
    assert.equal(w.people(id).length, 0, "nobody's link or row is left");
    assert.ok(w.survey(id).namesOffAt);
    assert.equal(w.world.mail.filter((message) => message.kind !== "course-test" && message.kind !== "notice").length, 0);
    const again = await w.lib.job.surveyNamesOffJob.handler(ctx(new Date("2028-12-10T00:30:00Z")));
    assert.equal(again.processed, 0, "a survey is visited once");
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(results.text.includes("1 answer from the 4 people it was sent to (25%)."), "the totals stay");
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

// ---------------------------------------------------------------------------
// The survey's own question kinds, through the real page and routes
// ---------------------------------------------------------------------------

/** A survey of every kind, as an admin's draft holds it before the first send. */
const EVERY_KIND = [
  { kind: "section", id: "s_one", heading: "Where you are now", body: [] },
  { kind: "question", id: "q_stage", type: "singleChoice", title: "Which best describes you right now?", body: [], required: false, options: [{ id: "o_s0", label: "Haven’t thought about it" }, { id: "o_s1", label: "Thought about it" }], look: "points", scores: { o_s0: 0, o_s1: 1 } },
  { kind: "question", id: "q_likely", type: "percent", title: "How likely is it?", ends: { min: "Not at all", max: "Certain" } },
  { kind: "question", id: "q_kinds", type: "multipleChoice", title: "Which kinds of work interest you most?", body: [], required: false, options: [{ id: "o_a", label: "Research" }, { id: "o_b", label: "Policy" }, { id: "o_c", label: "Operations" }], maxPicks: 2 },
  { kind: "question", id: "q_people", type: "number", title: "How many people could you message?", max: 1000 },
  { kind: "question", id: "q_explain", type: "scale", title: "How well could you explain it?", min: 1, max: 7, anchors: [{ at: 1, label: "Not at all" }, { at: 4, label: "The gist" }, { at: 7, label: "Hold my own" }] },
  { kind: "question", id: "q_recommend", type: "scale", title: "Would you recommend it?", min: 0, max: 10, anchors: [{ at: 0, label: "Not at all likely" }, { at: 10, label: "Extremely likely" }] },
  { kind: "question", id: "q_shaped", type: "multipleChoice", title: "What else has shaped your plans?", body: [], required: false, options: [{ id: "o_x", label: "Friends" }, { id: "o_y", label: "AI news" }], most: "Which mattered most?" },
  { kind: "question", id: "q_subject", type: "singleChoice", title: "Your subject", body: [], required: false, options: [{ id: "o_philosophy", label: "Philosophy" }, { id: "o_law", label: "Law" }], look: "menu", profile: "subject" },
  { kind: "consent", id: "c_consent", statement: "Results with no names go to our funders.", boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months" }] },
];

/** Every tag in some markup that carries `attribute`, whole. */
const tagsWith = (html, attribute) => [...html.matchAll(/<[a-z]+\b[^>]*>/g)].map((match) => match[0]).filter((tag) => tag.includes(attribute));

describe("every kind of question, on the page and through the routes", () => {
  /** AGI Strategy's survey, made, its questions set to every kind, then sent. */
  async function everyKindSurvey() {
    const id = (await w.make()).body.survey.id;
    w.world.db.poke(`surveys/${id}`, { items: EVERY_KIND });
    const sent = await w.sendFirst(id);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    return id;
  }

  test("each is drawn with a real control that works before the script, and the consent box starts unticked", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await everyKindSurvey();
    const before = w.everything();
    // Amara's profile says "BA Philosophy", so her subject is offered.
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "amara") }) });
    assert.equal(w.everything(), before, "opening the page wrote something");
    const { html, text } = page;
    for (const words of [
      "0 Haven’t thought about it",
      "1 Thought about it",
      "0%: Not at all. 100%: Certain.",
      "Pick up to 2",
      "1 Not at all 4 The gist 7 Hold my own",
      "Which mattered most?",
      "From your profile. Change it if it’s not right.",
      "Consent",
      "Results with no names go to our funders.",
      "Contact me at 6 and 12 months",
    ]) {
      assert.ok(text.includes(words), `missing "${words}"`);
    }
    // The typed percentage is the answer and needs no dragging; the slider is a second way in.
    const [typed] = tagsWith(html, 'name="q_likely"');
    for (const attribute of ['type="number"', 'inputMode="numeric"', 'min="0"', 'max="100"', 'step="1"', 'aria-labelledby="q-q_likely"']) {
      assert.ok(typed.includes(attribute), `the typed percentage lacks ${attribute}: ${typed}`);
    }
    const [slider] = tagsWith(html, 'type="range"');
    for (const attribute of ['disabled=""', 'aria-hidden="true"', 'tabindex="-1"']) {
      assert.ok(slider.includes(attribute), `the slider lacks ${attribute}: ${slider}`);
    }
    assert.ok(!slider.includes("name="), "the slider sends nothing of its own");
    const [people] = tagsWith(html, 'name="q_people"');
    assert.ok(people.includes('type="number"') && people.includes('max="1000"') && people.includes('aria-labelledby="q-q_people"'), people);
    // Eleven points for 0 to 10, each with its words for a screen reader.
    assert.equal((html.match(/name="q_recommend"/g) ?? []).length, 11);
    assert.match(html, /aria-label="0 out of 10: Not at all likely"/);
    assert.match(html, /aria-label="4 out of 7: The gist"/);
    // The menu starts on the profile's answer, and still has "Choose one".
    assert.match(html, /<option value="o_philosophy" selected="">Philosophy<\/option>/);
    assert.match(html, /<option value="">Choose one<\/option>/);
    const [menu] = tagsWith(html, 'name="q_subject"');
    assert.ok(menu.startsWith("<select") && menu.includes('aria-labelledby="q-q_subject"'), menu);
    // Before the script, which mattered most offers every option.
    assert.equal((html.match(/name="q_shaped\.most"/g) ?? []).length, 2);
    const [box] = tagsWith(html, 'name="consent.followUps"');
    assert.ok(box.includes('type="checkbox"') && box.includes('value="yes"'), box);
    assert.ok(!box.includes("checked"), "the consent box is ticked before anybody ticks it");
  });

  test("Dev's profile holds no subject an answer matches, so nothing is offered", async (t) => {
    clock(t);
    w.reset(seed());
    w.world.db.poke("users/dev", { "profile.subject": "History" });
    const id = await everyKindSurvey();
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "dev") }) });
    assert.match(page.html, /<option value="" selected="">Choose one<\/option>/);
    assert.doesNotMatch(page.html, /<option value="o_[a-z]+" selected="">/);
    assert.ok(!page.text.includes("From your profile."));
  });

  test("the consent ticks go on the person's own row with when, never into the answers; left unticked is a no", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await everyKindSurvey();
    const answers = {
      q_stage: { type: "choice", optionId: "o_s1" },
      q_likely: { type: "percent", value: 0 },
      q_shaped: { type: "choices", optionIds: ["o_x", "o_y"], most: "o_y" },
    };
    const said = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers, consents: { followUps: true } } });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    assert.equal((await w.answerByLink(w.tokenOf(id, "bea"), {})).status, 200);
    const row = (uid) => w.people(id).find((each) => each.respondent.uid === uid);
    assert.deepEqual(row("amara").consents, { followUps: true });
    assert.ok(row("amara").consentsAt, "when it was said is kept");
    assert.deepEqual(row("bea").consents, { followUps: false }, "a box left unticked is a no");
    const amara = w.answers(id).find((each) => each.respondent.uid === "amara");
    assert.deepEqual(amara.answers, answers, "the answers are only the questions'");
    assert.deepEqual(Object.keys(amara).sort(), ["afterFirstSession", "answers", "path", "respondent", "roundId", "sentAt", "surveyId", "via"]);
  });

  test("a box the survey doesn't have, or an answer out of range, is refused and nothing is kept", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await everyKindSurvey();
    const token = w.tokenOf(id, "tariq");
    const as = (body) => call(null, routes.answerByLink.POST, {}, { body: { token, answers: {}, ...body } });
    assert.deepEqual(short(await as({ consents: { kairos: true } })), [400, "One of those boxes isn’t on this survey."]);
    assert.deepEqual(short(await as({ answers: { q_kinds: { type: "choices", optionIds: ["o_a", "o_b", "o_c"] } } })), [400, "Pick up to 2."]);
    assert.deepEqual(short(await as({ answers: { q_likely: { type: "percent", value: 140 } } })), [400, "Give a number from 0 to 100."]);
    assert.deepEqual(short(await as({ answers: { q_shaped: { type: "choices", optionIds: ["o_x"], most: "o_y" } } })), [400, "Pick the one that mattered most from those you ticked."]);
    assert.equal(w.answers(id).length, 0);
    assert.equal(w.people(id).find((each) => each.respondent.uid === "tariq").answered, false);
    assert.deepEqual(w.people(id).find((each) => each.respondent.uid === "tariq").consents, undefined);
  });

  test("signed in, the consent ticks go on the caller's own row too", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await everyKindSurvey();
    const sent = await call("amara", routes.answerSignedIn.POST, { surveyId: id }, { body: { answers: {}, consents: { followUps: true } } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(w.people(id).find((each) => each.respondent.uid === "amara").consents, { followUps: true });
  });

  test("the results and the spreadsheet show each kind, with no name in the results", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await everyKindSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), { q_likely: { type: "percent", value: 30 }, q_recommend: { type: "scale", value: 9 }, q_people: { type: "number", value: 3 } });
    await w.answerByLink(w.tokenOf(id, "bea"), { q_likely: { type: "percent", value: 50 }, q_recommend: { type: "scale", value: 4 } });
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    for (const words of [
      "2 answered, 50% of the 4 it was sent to. Average 40%, middle value 40%, from 30% to 50%.",
      "Net promoter score 0, from 2 answers: the share at 9 or 10 less the share at 0 to 6.",
      "0 is Not at all likely, 10 is Extremely likely.",
      "1 answered, 25% of the 4 it was sent to. Average 3, middle value 3, from 3 to 3.",
    ]) {
      assert.ok(results.text.includes(words), `results: missing "${words}"`);
    }
    assert.doesNotMatch(results.text, /Amara|Okafor|Bea /);
    const file = await w.exportAs("zach", id);
    const [header, ...rows] = file.text.trim().split(/\r?\n/);
    assert.match(header, /2\. How likely is it\?/);
    assert.ok(rows.some((row) => row.startsWith("Amara Okafor,") && row.includes(",30,")));
  });
});

// ---------------------------------------------------------------------------
// The later stages: at the end, and the follow-ups at 6 and 12 months
// ---------------------------------------------------------------------------

describe("the survey at the end and the follow-ups pair with the one before, person by person", () => {
  /** The before survey sent, and answered by Amara (yes to follow-ups) and Bea (no). */
  async function beforeAnswered() {
    const id = await sentSurvey();
    const amara = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers: CHOICES, consents: { followUps: true } } });
    assert.equal(amara.status, 200, JSON.stringify(amara.body));
    assert.equal((await w.answerByLink(w.tokenOf(id, "bea"), { q_c1: { type: "choice", optionId: "o_stage0" } })).status, 200);
    return id;
  }

  /** One stage made and sent by the admin, after a test. */
  async function makeAndSend(stage, emails) {
    const made = await w.make("zach", { stage, closesOn: "2026-12-20" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const id = made.body.survey.id;
    const sent = await w.sendFirst(id, "zach", { emails });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    return id;
  }

  test("the survey at the end: its template, paired with the before survey, to everybody still holding a place", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await beforeAnswered();
    // Tariq gives his place back: he is not on the programme at its end.
    w.world.db.poke(applicationPath("tariq"), { status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: NOW }, withdrawnAt: NOW, releaseReason: { kind: "times", other: "" } });
    const made = await w.make("zach", { stage: "after", closesOn: "2026-12-20" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const stored = w.survey(made.body.survey.id);
    assert.equal(stored.kind, "after");
    assert.equal(stored.name, "AGI Strategy: after");
    assert.equal(stored.title, "At the end");
    assert.equal(stored.pairOf, before, "it pairs with the before survey");
    assert.equal(stored.minutes, 10);
    assert.equal(stored.intro, "The same questions as week 1, then some about how it went and what’s next. It’s 23 questions and takes about 10 minutes.");
    assert.deepEqual(stored.items, w.lib.templates.templateItems("after", "fellowship", null));
    assert.deepEqual(stored.audience, { kind: "programme", roundId: ROUND, programmeId: AGI });
    assert.deepEqual(short(await w.make("zach", { stage: "after", closesOn: "2026-12-20" })), [409, "It has its survey at the end already."]);
    const send = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: stored.id ?? made.body.survey.id }) }, "zach");
    assert.ok(send.text.includes("Everyone still holding a place on AGI Strategy (3)"), send.text.slice(0, 400));
    assert.ok(!send.text.includes("Answers sent after someone’s first session are labelled"), "only a before survey labels answers by the first session");
    const sent = await w.sendFirst(made.body.survey.id, "zach", { emails: 3 });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const notices = w.mailText().filter((message) => message.kind === "notice" && message.subject.startsWith("At the end"));
    assert.deepEqual(notices.map((message) => message.to).sort(), ["amara@example.com", "bea@example.com", "dev@example.com"]);
    assert.ok(notices.every((message) => message.subject === "At the end: 23 questions for AGI Strategy"));
  });

  test("its page: the last week beside the programme, and Q3 shows each person what they said at the start", async (t) => {
    clock(t);
    w.reset(seed());
    await beforeAnswered();
    const after = await makeAndSend("after", 4);
    const before = w.everything();
    const page = async (uid) => (await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(after, uid) }) })).text;
    const amara = await page("amara");
    assert.equal(w.everything(), before, "opening the page wrote something");
    assert.ok(amara.includes("Fellowship: AGI Strategy · Week 6"), "the run's last week");
    assert.ok(amara.includes("At the start you said: “To explain the risk clearly.” Did you get") || amara.includes("At the start you said: “To explain the risk clearly.”"));
    assert.ok(amara.includes("We ask who you are so we can compare your answers at the start and the end."));
    const bea = await page("bea");
    assert.ok(!bea.includes("At the start you said"), "Bea said nothing to P6, so nothing is shown");
    assert.ok(!bea.includes("To explain the risk clearly."), "nobody sees another person's answer");
    // The test link shows where it would go, and nobody's words.
    await call("zach", routes.test.POST, { surveyId: after }, { body: { email: "survey" } });
    const test = (await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(after).testToken }) })).text;
    assert.ok(test.includes("At the start you said: what each person wrote at the start shows here."));
    assert.ok(!test.includes("To explain the risk clearly."));
    // A follow-up's test link shows no consent panel: a test is nobody's.
    const six = (await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })).body.survey.id;
    await call("zach", routes.test.POST, { surveyId: six }, { body: { email: "survey" } });
    const sixTest = (await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(six).testToken }) })).text;
    assert.ok(sixTest.includes("Six months on"), sixTest.slice(0, 200));
    assert.ok(!sixTest.includes("Stop the follow-ups") && !sixTest.includes("You said we may contact you"), "a test link shows somebody's consent");
    // Even handed a person's row, a test is drawn as nobody's.
    assert.equal((await w.sendFirst(six, "zach", { emails: 1 })).status, 200);
    const { answerScreenFor } = await w.loadTs("lib/surveys/answerView.ts");
    const { readSurvey, readPerson } = await w.loadTs("lib/surveys/repo.ts");
    const stored = await readSurvey(w.world.db, six);
    const amaraRow = await readPerson(w.world.db, six, { kind: "account", uid: "amara" });
    assert.ok(amaraRow, "Amara was sent the follow-up");
    const screen = await answerScreenFor(w.world.db, stored, { uid: null, answered: false, answeredAt: null, submit: { kind: "test" }, now: new Date(), person: amaraRow });
    assert.equal(screen.consent, null);
    const hers = await answerScreenFor(w.world.db, stored, { uid: "amara", answered: false, answeredAt: null, submit: { kind: "link", token: amaraRow.token }, now: new Date(), person: amaraRow });
    assert.equal(hers.consent?.button, "Stop the follow-ups", "her own page shows it");
  });

  test("a follow-up waits for a sent before survey, and goes only to people who said yes", async (t) => {
    clock(t);
    w.reset(seed());
    const waits = [409, "Its before survey asks who may be contacted for follow-ups, and it hasn’t been sent."];
    assert.deepEqual(short(await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })), waits, "no before survey");
    const draft = (await w.make()).body.survey.id;
    assert.deepEqual(short(await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })), waits, "a before survey made but not sent");
    assert.deepEqual(short(await w.make("zach", { stage: "followUp12", closesOn: "2026-12-20" })), waits);
    // The same before survey, now sent and answered.
    const sent = await w.sendFirst(draft);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const amara = await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(draft, "amara"), answers: CHOICES, consents: { followUps: true } } });
    assert.equal(amara.status, 200);
    assert.equal((await w.answerByLink(w.tokenOf(draft, "bea"), { q_c1: { type: "choice", optionId: "o_stage0" } })).status, 200);
    const before = draft;
    const after = await makeAndSend("after", 4);
    const made = await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const six = made.body.survey.id;
    const stored = w.survey(six);
    assert.deepEqual(stored.audience, { kind: "followUps", roundId: ROUND, programmeId: AGI, consentFrom: before });
    assert.equal(stored.pairOf, after, "the six-month follow-up pairs with the survey at the end");
    assert.equal(stored.title, "Six months on");
    assert.equal(stored.namesOffOn, w.survey(before).namesOffOn, "names come off every stage on the same day");
    // One button, its count the people who said yes: Amara alone.
    const wrong = await w.sendFirst(six, "zach", { emails: 4 });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.emails, 1);
    w.world.mail.length = 0;
    assert.equal((await w.sendFirst(six, "zach", { emails: 1 })).status, 200);
    assert.deepEqual(w.world.mail.filter((message) => message.kind === "notice").map((message) => message.to), ["amara@example.com"]);
    // Its line says why it reached her: her yes, not a place she may no longer hold.
    const [followUp] = w.mailText().filter((message) => message.kind === "notice");
    assert.equal(followUp.surface, "course-follow-up");
    assert.equal(followUp.subject, "Six months on: 11 questions for AGI Strategy");
    assert.ok(followUp.text.includes("You are getting this because you said we could send you follow-ups about this programme"), followUp.text.slice(0, 300));
    assert.ok(followUp.text.includes("You said we could ask how things have gone since the programme. It’s 11 questions and takes about 3 minutes."));
    const send = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: six }) }, "zach");
    assert.ok(send.text.includes("Emailed the 1 person who said yes to follow-ups"));
    assert.ok(send.text.includes("Everyone on AGI Strategy who said yes to follow-ups (1)"));
    // A year on pairs with six months on.
    const twelve = await w.make("zach", { stage: "followUp12", closesOn: "2026-12-20" });
    assert.equal(w.survey(twelve.body.survey.id).pairOf, six);
    assert.equal(w.survey(twelve.body.survey.id).title, "A year on");
  });

  test("somebody who says yes later is sent it by the said-yes-since press; somebody who stops is not reminded", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await beforeAnswered();
    const six = await makeAndSend("followUp6", 1);
    // Bea says yes after all, from her before survey's page; Amara stops them from the follow-up's.
    const bea = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(before, "bea"), purpose: "followUps", given: true } });
    assert.deepEqual(bea.body, { ok: true, given: true });
    const send = await w.page(w.pages.send, { params: Promise.resolve({ surveyId: six }) }, "zach");
    assert.ok(send.text.includes("Said yes since"), send.text.slice(0, 300));
    w.world.mail.length = 0;
    assert.equal((await call("zach", routes.send.POST, { surveyId: six }, { body: { to: "joined", emails: 1 } })).status, 200);
    assert.deepEqual(w.world.mail.map((message) => message.to), ["bea@example.com"]);
    const amara = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(six, "amara"), purpose: "followUps", given: false } });
    assert.deepEqual(amara.body, { ok: true, given: false });
    assert.equal(w.people(before).find((row) => row.respondent.uid === "amara").consents.followUps, false, "the follow-up's page changes the before survey's row");
    await call("zach", routes.test.POST, { surveyId: six }, { body: { email: "reminder" } });
    w.world.mail.length = 0;
    const reminded = await call("zach", routes.remind.POST, { surveyId: six }, { body: { emails: 1 } });
    assert.equal(reminded.status, 200, JSON.stringify(reminded.body));
    assert.deepEqual(w.world.mail.map((message) => message.to), ["bea@example.com"], "Amara stopped them, so she is not reminded");
  });

  test("an incubator's surveys: the strand words its skills question, and the end takes the before survey's", async (t) => {
    clock(t);
    w.reset(seed({}));
    w.world.db.poke(formPath, { [`programmes.${AGI}.kind`]: "incubator" });
    assert.deepEqual(short(await w.make("zach")), [400, REFUSAL.strand], "an incubator's before survey needs its strand");
    const made = await w.make("zach", { strand: "governance" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const items = w.survey(made.body.survey.id).items;
    assert.equal(items.find((item) => item.id === "q_i2").lines[0].label, "I could write a policy-relevant research memo");
    assert.equal(w.survey(made.body.survey.id).strand, "governance");
    const after = await w.make("zach", { stage: "after", closesOn: "2026-12-20" });
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.equal(w.survey(after.body.survey.id).strand, "governance", "the end takes its pair's strand");
    assert.ok(w.survey(after.body.survey.id).items.some((item) => item.id === "q_i4"));
  });
});

describe("changing the follow-ups consent later, by the person alone", () => {
  async function beforeAnsweredByAmara(yes) {
    const id = await sentSurvey();
    await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers: {}, consents: { followUps: yes } } });
    return id;
  }

  test("her answered page says where it stands and changes it, by her link and signed in", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await beforeAnsweredByAmara(true);
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "amara") }) });
    assert.ok(page.text.includes("You’ve answered"));
    assert.ok(page.text.includes("You said we may contact you at 6 and 12 months with a short follow-up survey. Stop the follow-ups"));
    assert.match(page.html, /<button type="button"[^>]*disabled=""[^>]*>Stop the follow-ups<\/button>/, "the button waits for the page's script");
    const stopped = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), purpose: "followUps", given: false } });
    assert.deepEqual(stopped.body, { ok: true, given: false });
    const row = w.people(id).find((each) => each.respondent.uid === "amara");
    assert.equal(row.consents.followUps, false);
    assert.ok(row.consentsAt);
    const again = await w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.agi, surveyId: id }) }, "amara");
    assert.ok(again.text.includes("You haven’t said we may contact you at 6 and 12 months. Contact me at 6 and 12 months"));
    const yes = await call("amara", routes.consentSignedIn.POST, { surveyId: id }, { body: { purpose: "followUps", given: true } });
    assert.deepEqual(yes.body, { ok: true, given: true });
    assert.equal(w.people(id).find((each) => each.respondent.uid === "amara").consents.followUps, true);
  });

  test("a closed survey still shows it to somebody it was sent to; the open survey shows its own box instead", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    const open = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "dev") }) });
    assert.ok(!open.text.includes("Stop the follow-ups") && !open.text.includes("You haven’t said we may contact you"), "while it can be answered, the box is on the form");
    await call("zach", routes.close.POST, { surveyId: id }, { body: {} });
    const closed = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(id, "dev") }) });
    assert.ok(closed.text.includes("This survey has closed"));
    assert.ok(closed.text.includes("You haven’t said we may contact you at 6 and 12 months. Contact me at 6 and 12 months"));
    assert.equal((await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(id, "dev"), purpose: "followUps", given: true } })).status, 200);
  });

  test("the change is the person's own row: a row on the before survey that names somebody else is changed by nobody", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await beforeAnsweredByAmara(true);
    const six = (await w.make("zach", { stage: "followUp6", closesOn: "2026-12-20" })).body.survey.id;
    assert.equal((await w.sendFirst(six, "zach", { emails: 1 })).status, 200);
    // Amara's row on the before survey, made to name Bea, as no writer here makes one.
    w.world.db.poke(`surveyPeople/${before}__amara`, { "respondent.uid": "bea" });
    const refused = await call(null, routes.consentByLink.POST, {}, { body: { token: w.tokenOf(six, "amara"), purpose: "followUps", given: false } });
    assert.deepEqual(short(refused), [404, REFUSAL.consentNoRow]);
    assert.equal(w.world.db.read(`surveyPeople/${before}__amara`).consents.followUps, true, "a row that names somebody else is left alone");
  });

  test("refused to everybody else: a wrong or test link, another person, view-as, signed out, and a survey that doesn't ask it", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await beforeAnsweredByAmara(true);
    const byLink = (body) => call(null, routes.consentByLink.POST, {}, { body: { purpose: "followUps", given: false, ...body } });
    assert.deepEqual(short(await byLink({ token: "x".repeat(43) })), [404, REFUSAL.noLink]);
    assert.deepEqual(short(await byLink({ token: "short" })), [400, REFUSAL.noLink]);
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
    assert.deepEqual(short(await byLink({ token: w.survey(id).testToken })), [409, REFUSAL.testLink]);
    assert.deepEqual(short(await byLink({ token: w.tokenOf(id, "amara"), purpose: "kairos" })), [400, REFUSAL.body]);
    assert.deepEqual(short(await byLink({ token: w.tokenOf(id, "amara"), given: "no" })), [400, REFUSAL.body]);
    const signedIn = (who, options = {}) => call(who, routes.consentSignedIn.POST, { surveyId: id }, { body: { purpose: "followUps", given: false }, ...options });
    assert.equal((await signedIn("amara", { viewAs: true })).status, 403, "an admin viewing as Amara changes nothing of hers");
    for (const who of ["claudia", "rahul", "nobody", "zach"]) assert.deepEqual(short(await signedIn(who)), [404, REFUSAL.notYours], who);
    assert.equal((await signedIn(null)).status, 401);
    assert.equal(w.people(id).find((each) => each.respondent.uid === "amara").consents.followUps, true, "nothing refused changed her row");
    // A survey that asks no consent and is no follow-up changes none: a
    // survey at the end made before it asked the follow-ups box, as one is
    // when its consent block is not among its items.
    const after = (await w.make("zach", { stage: "after", closesOn: "2026-12-20" })).body.survey.id;
    await w.sendFirst(after, "zach", { emails: 4 });
    const asked = w.survey(after).items;
    w.world.db.poke(`surveys/${after}`, { items: asked.filter((item) => item.kind !== "consent") });
    assert.deepEqual(short(await byLink({ token: w.tokenOf(after, "amara") })), [409, REFUSAL.consentNotAsked]);
    // The survey at the end as the template makes it asks the box, and Amara's
    // change through its link reaches the row that holds Amara's word: the
    // before survey's.
    w.world.db.poke(`surveys/${after}`, { items: asked });
    assert.deepEqual((await byLink({ token: w.tokenOf(after, "amara") })).body, { ok: true, given: false });
    assert.equal(w.people(id).find((each) => each.respondent.uid === "amara").consents.followUps, false);
    assert.equal(w.people(after).find((each) => each.respondent.uid === "amara").consents?.followUps, undefined, "Amara's row at the end holds nothing of it");
  });
});

describe("the New survey page offers every stage's template", () => {
  test("four cards, each saying which programmes can have it and why not", async (t) => {
    clock(t);
    w.reset(seed());
    const empty = await w.page(w.pages.newSurvey, {}, "zach");
    for (const words of [
      "Before the programme",
      "14 questions for a fellowship, 17 for an incubator · about 5 minutes",
      "At the end of the programme",
      "23 questions for a fellowship, 32 for an incubator · about 10 minutes",
      "Six months on",
      "11 questions · about 3 minutes",
      "A year on",
      "AGI Strategy (Autumn 2026): Its before survey asks who may be contacted for follow-ups, and it hasn’t been sent.",
    ]) {
      assert.ok(empty.text.includes(words), `missing "${words}"`);
    }
    await sentSurvey();
    const later = await w.page(w.pages.newSurvey, {}, "zach");
    assert.ok(later.text.includes("AGI Strategy (Autumn 2026): It has its before survey already."));
  });
});

describe("results for admins: n and the response rate beside every number, the change and the look-back", () => {
  test("the survey at the end compares each shared question with the before survey, for people who answered both, never naming them", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await sentSurvey();
    await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(before, "amara"), answers: CHOICES, consents: { followUps: true } } });
    await w.answerByLink(w.tokenOf(before, "bea"), { q_c1: { type: "choice", optionId: "o_stage3" }, q_c2: { type: "percent", value: 50 } });
    await w.answerByLink(w.tokenOf(before, "dev"), { q_c1: { type: "choice", optionId: "o_stage0" } });
    const after = (await w.make("zach", { stage: "after", closesOn: "2026-12-20" })).body.survey.id;
    await w.sendFirst(after, "zach", { emails: 4 });
    await w.answerByLink(w.tokenOf(after, "amara"), {
      q_c1: { type: "choice", optionId: "o_stage3" },
      q_t1: { type: "choice", optionId: "o_stage0" },
      q_c2: { type: "percent", value: 45 },
      q_c7: { type: "lines", values: { l_next: 4 } },
    });
    await w.answerByLink(w.tokenOf(after, "bea"), { q_c1: { type: "choice", optionId: "o_stage3" }, q_t1: { type: "choice", optionId: "o_stage3" }, q_c2: { type: "percent", value: 40 } });
    const page = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: after }), searchParams: Promise.resolve({}) }, "zach");
    for (const words of [
      "2 answers from the 4 people it was sent to (50%).",
      "Compared, person by person, with AGI Strategy: before (3 answers).",
      "1. Which best describes you right now?",
      "2 answered, 50% of the 4 it was sent to",
      "Before and now Of the 2 who answered it both times (AGI Strategy: before): 1 moved up, 1 stayed, 0 moved down. Average 2 then, 3 now (up 1). Middle value 2 then, 3 now.",
      "Looking back Of the 2 who answered it both times (Looking back, which best described you before the programme?): 1 moved up, 1 stayed, 0 moved down. Average 1.5 then, 3 now (up 1.5).",
      "Average 35% then, 42.5% now (up 7.5 points).",
      "I know what my next concrete step towards AI safety work would be. 2 → 4, 1 of 1 moved up",
      "Leave out before-survey answers sent after someone’s first session",
    ]) {
      assert.ok(page.text.includes(words), `missing "${words}"`);
    }
    assert.doesNotMatch(page.text, /Amara|Okafor|Bea |Dev Patel|To explain the risk clearly/, "results name nobody and quote no one's earlier answer");
  });

  test("a reminder sends nobody new, so the response rate stays of the people it was sent to", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await w.answerByLink(w.tokenOf(id, "amara"), {});
    await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "reminder" } });
    assert.equal((await call("zach", routes.remind.POST, { surveyId: id }, { body: { emails: 3 } })).status, 200);
    const page = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(page.text.includes("1 answer from the 4 people it was sent to (25%)."), page.text.slice(0, 300));
  });

  test("the before survey's results say how many said yes to follow-ups, of the people it was sent to", async (t) => {
    clock(t);
    w.reset(seed());
    const id = await sentSurvey();
    await call(null, routes.answerByLink.POST, {}, { body: { token: w.tokenOf(id, "amara"), answers: {}, consents: { followUps: true } } });
    await w.answerByLink(w.tokenOf(id, "bea"), {});
    const page = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(page.text.includes("Consent 1 said yes, 25% of the 4 it was sent to: Contact me at 6 and 12 months with a short follow-up survey."), page.text.slice(0, 600));
    assert.ok(!page.text.includes("Compared, person by person"), "the before survey pairs with nothing");
  });

  test("leaving out answers sent after the first session counts them out of the before side too", async (t) => {
    clock(t);
    w.reset(seed());
    const before = await sentSurvey();
    // Bea answers after her group first met at 6pm: left out of a before.
    t.mock.timers.setTime(new Date("2026-10-29T20:30:00Z").getTime());
    await w.answerByLink(w.tokenOf(before, "bea"), { q_c1: { type: "choice", optionId: "o_stage1" } });
    const after = (await w.make("zach", { stage: "after", closesOn: "2026-12-20" })).body.survey.id;
    await w.sendFirst(after, "zach", { emails: 4 });
    await w.answerByLink(w.tokenOf(after, "bea"), { q_c1: { type: "choice", optionId: "o_stage4" } });
    const all = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: after }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(all.text.includes("Of the 1 who answered it both times (AGI Strategy: before): 1 moved up"));
    const strict = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: after }), searchParams: Promise.resolve({ "before-first-session": "1" }) }, "zach");
    assert.ok(strict.text.includes("1 sent after the person’s first session is left out."));
    assert.ok(strict.text.includes("Nobody has answered it both times yet (AGI Strategy: before)."));
  });
});
