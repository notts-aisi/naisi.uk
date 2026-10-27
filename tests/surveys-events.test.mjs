/**
 * SURVEYS AFTER EVENTS, THROUGH THEIR REAL ROUTES AND PAGES (docs/surveys.md,
 * "Surveys after events"): who one can reach (the people who came, or
 * everybody who signed up, never anybody who did neither), making one from
 * "After a social", the QR code at the event, the email and its reminder,
 * answering by a personal link and signed in, the admins' pages and the
 * event's Survey after tab.
 *
 * Every caller is tried where it matters: an admin, the event's organiser
 * (committee the SU does not recognise), SU-recognised committee, a member
 * who came, one who signed up and did not come, a guest by their link, a
 * walk-in by their link, somebody signed out with the QR code, a member who
 * did neither, and a view-as session. The code shown at the event (section
 * 5's last tests) is tried as those and as an organiser who is a member
 * holding draftEvent.
 *
 * The world is `tests/lib/eventSurveyWorld.mjs` (VR games night, Sun 1 Nov
 * 2026). The mail door records each message and sends none. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_ID, LATE, MORNING, NEXT_DAY, RSVP, checkIn, eventSurveySeed, makeEventSurveyWorld, textOf } from "./lib/eventSurveyWorld.mjs";

const w = await makeEventSurveyWorld("__eventSurveys");

/** The clock, set to `at` for one test: Date only, so the mail dispatcher's pauses stay real. */
function clock(t, at = MORNING) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

// ---------------------------------------------------------------------------
// 1. Who a survey after an event can reach
// ---------------------------------------------------------------------------

describe("the audiences: the people who came, or everybody who signed up, and nobody else", () => {
  test("the people who came: every check-in, once each, an account by its account and a guest by the sign-up or the door", async (t) => {
    clock(t);
    w.reset();
    const { readEventAudience, membersOf } = await w.load("lib/surveys/events/audience.ts");
    const read = await readEventAudience(w.world.db, EVENT_ID);
    const came = membersOf(read, "event-came").map((member) => [member.name, member.key, member.address, member.cameBySignup]);
    assert.deepEqual(came, [
      ["Dan Fitzgerald", "g:ci-dan", null, false],
      ["Gwen Price", `g:${RSVP.gwen}`, "gwen@example.com", true],
      ["Kofi Asante", "a:kofi", "kofi@example.com", true],
      ["Mo Rahman", "a:mo", "mo@example.com", false],
      ["Rosa Martinez", "g:ci-rosa", "rosa@example.com", false],
      ["Wren Hale", "a:wren", "wren@example.com", true],
    ]);
  });

  test("everybody who signed up: confirmed sign-ups alone, never a test one, the waiting list, the undecided, the cancelled or the refused", async (t) => {
    clock(t);
    w.reset();
    const { readEventAudience, membersOf } = await w.load("lib/surveys/events/audience.ts");
    const read = await readEventAudience(w.world.db, EVENT_ID);
    assert.deepEqual(
      membersOf(read, "event-signups").map((member) => [member.name, member.key, member.came]),
      [
        ["Chloe Nguyen", "a:chloe", false],
        ["Gwen Price", `g:${RSVP.gwen}`, true],
        ["Kofi Asante", "a:kofi", true],
      ],
    );
    // Pat (pending), Cora (cancelled), Dina (refused) and the test sign-up are
    // nobody's: they neither came nor hold a confirmed place.
    const everybody = read.people.map((member) => member.key);
    for (const nobody of ["a:pat", "a:cora", "a:dina", `g:${RSVP.test}`]) assert.ok(!everybody.includes(nobody), nobody);
  });

  test("a check-in whose names have come off, or another event's, reaches nobody; an account that has gone is nobody", async (t) => {
    clock(t);
    w.reset(
      eventSurveySeed({
        "eventCheckIns/ci-mo": { eventId: EVENT_ID, kind: "walk-in", rsvpId: null, uid: null, name: null, email: null, emailGoesAt: null, how: "qr", byUid: null, at: new Date("2026-11-01T14:10:00Z"), namesOffAt: null, namesOff: true },
        "eventCheckIns/ci-other": { eventId: "another-event", kind: "walk-in", rsvpId: null, uid: "chloe", name: "Chloe Nguyen", email: null, emailGoesAt: null, how: "qr", byUid: null, at: new Date("2026-11-01T14:10:00Z"), namesOffAt: null, namesOff: false },
      }),
    );
    await w.world.db.collection("users").doc("wren").delete();
    const { readEventAudience, membersOf } = await w.load("lib/surveys/events/audience.ts");
    const read = await readEventAudience(w.world.db, EVENT_ID);
    const came = membersOf(read, "event-came").map((member) => member.key);
    assert.ok(!came.includes("a:mo"), "a check-in with its names off reached somebody");
    assert.ok(!came.includes("a:chloe"), "another event's check-in reached somebody");
    assert.ok(!came.includes("a:wren"), "an account that has gone is still somebody this survey reaches");
    assert.deepEqual(came, [`g:ci-dan`, `g:${RSVP.gwen}`, "a:kofi", "g:ci-rosa"]);
  });

  test("readAudience answers an event's audience, and an event that is gone as gone", async (t) => {
    clock(t);
    w.reset();
    const { readAudience } = await w.load("lib/surveys/audience.ts");
    const read = await readAudience(w.world.db, { kind: "event-came", eventId: EVENT_ID });
    assert.equal(read.status, "event");
    assert.equal(read.event.people.filter((member) => member.came).length, 6);
    assert.deepEqual(await readAudience(w.world.db, { kind: "event-signups", eventId: "no-such-event" }), { status: "gone" });
    assert.deepEqual(await readAudience(w.world.db, { kind: "event-signups", eventId: "a/b" }), { status: "gone" });
  });

  test("a stored audience and person read back as an event's, and a guest's row by its own id", async () => {
    const records = await w.load("lib/firestore/surveys.ts");
    const survey = records.normalizeSurvey("s1", {
      kind: "event",
      audience: { kind: "event-signups", eventId: EVENT_ID },
      event: { title: "VR games night", startAt: new Date("2026-11-01T14:00:00Z"), endAt: null },
    });
    assert.equal(survey.kind, "event");
    assert.deepEqual(survey.audience, { kind: "event-signups", eventId: EVENT_ID });
    assert.equal(records.isEventSurvey(survey), true);
    assert.deepEqual(records.programmeOf(survey.audience), { roundId: "", programmeId: "" });
    assert.equal(records.isEventSurvey(records.normalizeSurvey("s2", { kind: "before", audience: { kind: "programme", roundId: "r", programmeId: "p" } })), false);
    assert.equal(records.eventPersonId("s1", { kind: "guest", signupId: RSVP.gwen }), `s1__g_${RSVP.gwen}`);
    assert.equal(records.eventPersonId("s1", { kind: "account", uid: "kofi" }), "s1__kofi");
    const token = "A".repeat(43);
    const guest = records.normalizeEventPerson("s1__g_x", { surveyId: "s1", respondent: { kind: "guest", signupId: "x" }, token });
    assert.deepEqual(guest.respondent, { kind: "guest", signupId: "x" });
    // A programme's reader never takes a guest's row for somebody's.
    assert.equal(records.normalizeSurveyPerson("s1__g_x", { surveyId: "s1", respondent: { kind: "guest", signupId: "x" }, token }), null);
    assert.equal(records.normalizeEventPerson("bad", { surveyId: "s1", respondent: { kind: "guest", signupId: "a/b" }, token }), null);
  });
});

// ---------------------------------------------------------------------------
// 2. The template: "After a social", made per event by an admin
// ---------------------------------------------------------------------------

const short = (response) => [response.status, response.body?.error ?? null];

describe("making one: After a social, an admin's alone, one per published event", () => {
  const NOT_ADMINS = [
    ["iris", "the event's organiser"],
    ["sue", "SU-recognised committee"],
    ["kofi", "a member who came"],
    ["chloe", "a member who signed up and did not come"],
    ["mo", "a member who walked in"],
    [null, "somebody signed out"],
  ];

  test("refused to everybody but an admin, before anything is written", async (t) => {
    clock(t);
    w.reset();
    for (const [who, why] of NOT_ADMINS) {
      const made = await w.make(who);
      assert.equal(made.status, who ? 403 : 401, `${why}: ${JSON.stringify(made.body)}`);
    }
    const viewAs = await w.call("zach", (await w.route("surveys")).POST, {}, { body: { template: "event", eventId: EVENT_ID, audience: "came", closesOn: "2026-11-08" }, viewAs: true });
    assert.equal(viewAs.status, 403, "made during a view-as session");
    assert.deepEqual(w.surveyIds(), []);
  });

  test("an admin makes it from the template, word for word, with the event's name and day", async (t) => {
    clock(t);
    w.reset();
    const made = await w.make();
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const stored = w.survey(made.body.survey.id);
    assert.equal(stored.kind, "event");
    assert.equal(stored.privacy, "confidential");
    assert.equal(stored.name, "After VR games night");
    assert.equal(stored.title, "How was VR games night?");
    assert.equal(stored.intro, "Thanks for coming on Sunday. 5 quick questions, about a minute.");
    assert.equal(stored.minutes, 1);
    assert.deepEqual(stored.audience, { kind: "event-came", eventId: EVENT_ID });
    assert.equal(stored.eventId, EVENT_ID);
    assert.equal(stored.event.title, "VR games night");
    // Names come off two years after the event, as every survey's do.
    assert.equal(stored.namesOffOn, "2028-11-01");
    assert.equal(stored.closesAt.toISOString(), "2026-11-08T23:59:00.000Z");
    assert.equal(stored.firstSentAt, null);
    assert.deepEqual(
      stored.items.map((item) => [item.id, item.type, item.title, item.required]),
      [
        ["q_ev_how", "rating", "How was it?", false],
        ["q_ev_again", "singleChoice", "Would you come to another NAISI social?", false],
        ["q_ev_next", "multipleChoice", "What should we run next?", false],
        ["q_ev_heard", "singleChoice", "How did you hear about it?", false],
        ["q_ev_change", "longText", "Anything we should change?", false],
      ],
    );
    assert.deepEqual(stored.items[0].rating, { max: 5, minLabel: "Not good", maxLabel: "Great" });
    assert.deepEqual(stored.items[1].options.map((o) => o.label), ["Yes", "Maybe", "No"]);
    assert.deepEqual(stored.items[2].options.map((o) => o.label), ["Another games night", "A film night", "A quiz", "A talk with food", "Something else"]);
    assert.deepEqual(stored.items[3].options.map((o) => o.label), ["A friend", "Instagram", "Our emails", "The freshers’ fair", "A poster", "Something else"]);
    const { validateSurveyItems } = await w.load("lib/surveys/items.ts");
    assert.deepEqual(validateSurveyItems(stored.items), []);
  });

  test("one survey per event; an event not published, cancelled, undated or more than a week over has none", async (t) => {
    clock(t);
    w.reset();
    assert.equal((await w.make()).status, 200);
    assert.deepEqual(short(await w.make()), [409, "This event has its survey already."]);
    for (const [over, words] of [
      [{ status: "draft" }, "Publish the event first: a survey after an event is for the people who signed up or came."],
      [{ status: "cancelled" }, "Publish the event first: a survey after an event is for the people who signed up or came."],
      [{ startAt: null, endAt: null }, "The event has no date, so the day names come off can’t be worked out. Give it its date first."],
    ]) {
      w.reset(eventSurveySeed({ [`events/${EVENT_ID}`]: { ...eventSurveySeed()[`events/${EVENT_ID}`], ...over } }));
      assert.deepEqual(short(await w.make()), [409, words], JSON.stringify(over));
    }
    w.reset();
    t.mock.timers.setTime(new Date("2026-11-08T17:00:01Z").getTime());
    assert.deepEqual(short(await w.make("zach", { closesOn: "2026-11-10" })), [409, "That event was more than a week ago, so its survey would reach people too late."]);
    assert.deepEqual(w.surveyIds(), []);
  });

  test("everybody who signed up is no audience for an event nobody signs up for; a bad body is a 400 that says what to do", async (t) => {
    clock(t);
    w.reset(eventSurveySeed({ [`events/${EVENT_ID}`]: { ...eventSurveySeed()[`events/${EVENT_ID}`], noSignup: true } }));
    assert.deepEqual(short(await w.make("zach", { audience: "signups" })), [409, "Nobody signs up for this event, so its survey can only go to the people who came."]);
    assert.deepEqual(short(await w.make("zach", { audience: "everyone" })), [400, "Pick who it emails: everyone who came, or everyone who signed up."]);
    assert.deepEqual(short(await w.make("zach", { eventId: "a/b" })), [400, "Pick the event the survey is about."]);
    assert.deepEqual(short(await w.make("zach", { closesOn: "2026-10-31" })), [400, "The closing day has to be today or later."]);
    assert.deepEqual(short(await w.make("zach", { eventId: "no-such-event" })), [404, "That event isn’t here any more."]);
    // Made the week before, it cannot close before the event itself.
    t.mock.timers.setTime(new Date("2026-10-26T12:00:00Z").getTime());
    assert.deepEqual(short(await w.make("zach", { closesOn: "2026-10-31" })), [400, "The survey after an event can’t close before the event. Pick its day or a later one."]);
    assert.deepEqual(w.surveyIds(), []);
    assert.equal((await w.make("zach", { audience: "came", closesOn: "2026-11-01" })).status, 200);
  });

  test("edited until it opens: the words and the closing day save, the questions themselves stay, and names off follows the event", async (t) => {
    clock(t);
    w.reset();
    const id = (await w.make()).body.survey.id;
    const questions = (await w.route("surveys/[surveyId]/questions")).POST;
    const stored = w.survey(id);
    const items = structuredClone(stored.items);
    items[1].title = "Would you come to another one?";
    items[2].options[0].label = "Another VR night";
    const saved = await w.call("zach", questions, { surveyId: id }, { body: { title: "How was it?", intro: "Thanks for coming.", minutes: 2, closesOn: "2026-11-07", items } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(w.survey(id).items[1].title, "Would you come to another one?");
    assert.equal(w.survey(id).closesAt.toISOString(), "2026-11-07T23:59:00.000Z");
    assert.equal(w.survey(id).namesOffOn, "2028-11-01");
    // A question taken out is refused, as for every survey.
    const fewer = await w.call("zach", questions, { surveyId: id }, { body: { title: "How was it?", intro: "", minutes: 1, closesOn: "2026-11-07", items: items.slice(1) } });
    assert.equal(fewer.status, 400);
    assert.equal((await w.call("iris", questions, { surveyId: id }, { body: { title: "x", intro: "", minutes: 1, closesOn: "2026-11-07", items } })).status, 403);
  });

  test("New survey offers After a social with the events that can have one, and starts on the one it was opened from", async (t) => {
    clock(t);
    w.reset(
      eventSurveySeed({
        "events/quiz-night": { ...eventSurveySeed()[`events/${EVENT_ID}`], title: "Quiz night", startAt: new Date("2026-11-26T19:00:00Z"), endAt: new Date("2026-11-26T21:00:00Z") },
        "events/old-social": { ...eventSurveySeed()[`events/${EVENT_ID}`], title: "Old social", startAt: new Date("2026-10-01T19:00:00Z"), endAt: new Date("2026-10-01T21:00:00Z") },
        "events/draft-talk": { ...eventSurveySeed()[`events/${EVENT_ID}`], title: "Draft talk", status: "draft" },
      }),
    );
    const page = await w.page("app/(app)/admin/(admin-only)/surveys/new/page.tsx", { searchParams: Promise.resolve({ event: "quiz-night" }) }, "zach");
    assert.match(page.text, /After a social Confidential 5 questions · about a minute\. A QR code at the event, then an email to the people who came\./);
    assert.match(page.html, /<option value="vr-games-night-ev01">VR games night · Sun 1 Nov<\/option>/);
    assert.match(page.html, /<option value="quiz-night"[^>]*>Quiz night · Thu 26 Nov<\/option>/);
    assert.ok(!/Old social|Draft talk/.test(page.text), "an event more than a week over, or not published, was offered");
    assert.match(page.html, /<select[^>]*name="eventId"[^>]*>/);
    assert.match(page.text, /Who it emails Everyone who came, with an email Everyone who signed up/);
    // Opened from Quiz night's tab, the menu starts on it.
    assert.match(page.html, /<option value="quiz-night" selected="">/);
    // Once VR games night has its survey, it is offered no more, and says why.
    assert.equal((await w.make()).status, 200);
    const after = await w.page("app/(app)/admin/(admin-only)/surveys/new/page.tsx", { searchParams: Promise.resolve({}) }, "zach");
    assert.ok(!/<option value="vr-games-night-ev01">/.test(after.html));
    assert.match(after.text, /VR games night · Sun 1 Nov: This event has its survey already\./);
  });
});

// ---------------------------------------------------------------------------
// 3. Sending, and answering by a link or signed in
// ---------------------------------------------------------------------------

/** One of the survey routes, as a function of who presses it and what they send. */
async function press(path, who, id, body = {}, options = {}) {
  return w.call(who, (await w.route(`surveys/[surveyId]/${path}`)).POST, { surveyId: id }, { body, ...options });
}

/** The survey made by an admin, its id. */
async function made(body = {}) {
  const response = await w.make("zach", body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.survey.id;
}

/** Answers to the five questions. */
const ANSWERS = {
  q_ev_how: { type: "rating", value: 5 },
  q_ev_again: { type: "choice", optionId: "o_ev_yes" },
  q_ev_next: { type: "choices", optionIds: ["o_ev_games", "o_ev_quiz"] },
  q_ev_heard: { type: "choice", optionId: "o_ev_friend" },
  q_ev_change: { type: "text", text: "Loved meeting people from the fellowships." },
};

/** Somebody's answers, signed in, through the QR code's page's route. */
const answerSignedIn = async (who, id, answers = ANSWERS, options = {}) => press("answer", who, id, { answers }, options);

/** Somebody's answers by the personal link an email gave them. */
async function answerByLink(token, answers = ANSWERS) {
  return w.call(null, (await w.route("surveys/answer")).POST, {}, { body: { token, answers } });
}

/** The secret in a link. */
const tokenOf = (link) => link.slice(link.lastIndexOf("/") + 1);

describe("the QR code takes answers once an admin opens it; the email skips anybody who answered", () => {
  test("opening it is an admin's alone, emails nobody, fixes the questions and is claimed once", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    for (const who of ["iris", "sue", "kofi", null]) {
      assert.equal((await press("open-at-event", who, id)).status, who ? 403 : 401, String(who));
    }
    assert.equal((await press("open-at-event", "zach", id, {}, { viewAs: true })).status, 403, "opened during a view-as session");
    assert.equal(w.survey(id).firstSentAt, null);
    assert.deepEqual(short(await press("open-at-event", "zach", id)), [200, null]);
    assert.ok(w.survey(id).firstSentAt, "opening did not fix the survey");
    assert.equal(w.survey(id).namesOffOn, "2028-11-01");
    assert.deepEqual(w.world.mail, [], "opening it emailed somebody");
    assert.deepEqual(short(await press("open-at-event", "zach", id)), [409, "This survey is open already."]);
    // Fixed: the editor is refused once it is open.
    const items = structuredClone(w.survey(id).items);
    const saved = await press("questions", "zach", id, { title: "x", intro: "", minutes: 1, closesOn: "2026-11-08", items });
    assert.equal(saved.status, 409);
  });

  test("signed in, whoever came or signed up answers once; nobody who did neither, signed out or viewing as somebody", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    assert.deepEqual(short(await answerSignedIn("kofi", id)), [409, "This survey isn’t taking answers yet."]);
    await press("open-at-event", "zach", id);
    for (const [who, why] of [
      ["pat", "pending, did not come"],
      ["cora", "cancelled, did not come"],
      ["dina", "refused, did not come"],
      ["iris", "the organiser, who neither signed up nor came"],
      ["zach", "an admin who neither signed up nor came"],
    ]) {
      assert.deepEqual(short(await answerSignedIn(who, id)), [404, "This survey is for the people who came to the event or signed up for it."], why);
    }
    assert.equal((await answerSignedIn(null, id)).status, 401, "signed out answered");
    assert.equal((await answerSignedIn("kofi", id, ANSWERS, { viewAs: true })).status, 403, "answered during a view-as session");
    assert.deepEqual(w.answers(id), []);
    // Kofi came; Chloe signed up and did not come; Mo walked in.
    for (const who of ["kofi", "chloe", "mo"]) assert.deepEqual(short(await answerSignedIn(who, id)), [200, null], who);
    assert.deepEqual(short(await answerSignedIn("kofi", id)), [409, "You’ve already sent your answers to this survey. They can’t change."]);
    const kept = w.answers(id).find((answer) => answer.respondent?.uid === "kofi");
    assert.deepEqual(Object.keys(kept).filter((key) => key !== "path").sort(), ["answers", "eventId", "respondent", "sentAt", "surveyId", "via"]);
    assert.equal(kept.via, "signed-in");
    assert.deepEqual(kept.respondent, { kind: "account", uid: "kofi" });
    assert.deepEqual(kept.answers.q_ev_how, { type: "rating", value: 5 });
    // Their rows were made as they answered, with no email sent.
    const row = w.rowOf(id, "kofi");
    assert.equal(row.answered, true);
    assert.equal(row.sentAt, null);
  });

  test("the test, then the email: the board's words, a notice to each person's own address with their own link, and nobody who answered at the event", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id);
    t.mock.timers.setTime(NEXT_DAY.getTime());
    // Refused until the presser has a test of this wording.
    assert.deepEqual(short(await press("send", "zach", id, { to: "everyone", emails: 4 })), [409, "Nobody has sent themselves a test of this email yet. Send yourself one before you send it."]);
    const test = await press("test", "zach", id, { email: "survey" });
    assert.equal(test.status, 200, JSON.stringify(test.body));
    const [sentTest] = w.mailText();
    assert.equal(sentTest.to, "zach@example.com");
    assert.equal(sentTest.kind, "course-test");
    assert.equal(sentTest.subject, "[TEST] How was VR games night?");
    w.world.mail.length = 0;
    // Came, with an email: Gwen, Wren, Mo and Rosa. Kofi answered at the event; Dan left no address.
    assert.deepEqual(short(await press("send", "zach", id, { to: "everyone", emails: 5 })), [409, "Nothing was sent: the number of people this reaches is now 4. Check the list and press again."]);
    const sent = await press("send", "zach", id, { to: "everyone", emails: 4 });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.sent, 4);
    const mail = w.mailText();
    assert.deepEqual(mail.map((message) => message.to).sort(), ["gwen@example.com", "mo@example.com", "rosa@example.com", "wren@example.com"]);
    for (const message of mail) {
      assert.equal(message.kind, "notice");
      assert.equal(message.surface, "event-survey");
      assert.equal(message.subject, "How was VR games night?");
      assert.match(
        message.text,
        /Sent as an important notice You are getting this because you came to this event or signed up for it, so it reaches you whatever your notification settings say, and it is never marketing\. Thanks for coming on Sunday\. 5 quick questions, about a minute\. It’s confidential: only NAISI’s admins can see who said what\. It closes on Sun 8 Nov\./,
      );
      assert.match(message.text, /Answer the survey (?:&#8202;|&#8203;)* Or paste this into your browser: https:\/\/naisi\.invalid\/survey\/[A-Za-z0-9_-]{43} Zach For NAISI/);
    }
    // Each person's own link, on their own row: a guest's by sign-up, a walk-in's by the door's record.
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    assert.equal(tokenOf(links.get("gwen@example.com")), w.rowOf(id, RSVP.gwen).token);
    assert.equal(tokenOf(links.get("rosa@example.com")), w.rowOf(id, "ci-rosa").token);
    assert.deepEqual(w.rowOf(id, RSVP.gwen).respondent, { kind: "guest", signupId: RSVP.gwen });
    assert.equal(new Set(links.values()).size, 4, "two people shared a link");
    // Claimed once.
    assert.deepEqual(short(await press("send", "zach", id, { to: "everyone", emails: 0 })), [409, "This survey’s email has gone already. Send it to people who came since instead."]);
    assert.equal(w.survey(id).presses.filter((p) => p.kind === "first").length, 1);
  });

  test("by their own link: a guest and a walk-in answer once; a wrong link opens nothing; the test link keeps nothing", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    assert.equal((await press("send", "zach", id, { to: "everyone", emails: 5 })).status, 200);
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    assert.deepEqual(short(await answerByLink(tokenOf(links.get("gwen@example.com")))), [200, null]);
    assert.deepEqual(short(await answerByLink(tokenOf(links.get("rosa@example.com")))), [200, null]);
    assert.deepEqual(short(await answerByLink(tokenOf(links.get("gwen@example.com")))), [409, "You’ve already sent your answers to this survey. They can’t change."]);
    assert.deepEqual(short(await answerByLink("B".repeat(43))), [404, "That link doesn’t open a survey you can answer."]);
    const testToken = w.survey(id).testToken;
    assert.deepEqual(short(await answerByLink(testToken)), [409, "This is a test link, so nothing sent from it is kept."]);
    const kept = w.answers(id).map((answer) => [answer.respondent?.kind, answer.respondent?.signupId ?? answer.respondent?.uid, answer.via]).sort();
    assert.deepEqual(kept, [["guest", "ci-rosa", "link"], ["guest", RSVP.gwen, "link"]]);
    // The page by the link: the event, the box with the person's standing, and nothing of anybody else.
    const page = await w.page("app/survey/[token]/page.tsx", { params: Promise.resolve({ token: tokenOf(links.get("mo@example.com")) }) });
    assert.match(page.text, /VR games night · Sun 1 Nov How was VR games night\? Thanks for coming on Sunday\. 5 quick questions, about a minute\. Every question can be skipped\./);
    assert.match(
      page.text,
      /Confidential Only NAISI’s admins can see who said what\. Nothing you say here affects anything you sign up for\. Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site\. Your name comes off on Wed 1 Nov 2028, two years after the event\. The totals stay\. We keep your answers with your name, and that you came, so nobody is emailed it twice\./,
    );
    assert.match(page.text, /How was it\?/);
    assert.ok(!/Kairos, one of our funders|Don’t share my details/.test(page.text), "an event's survey asked the Kairos choice");
    const answered = await w.page("app/survey/[token]/page.tsx", { params: Promise.resolve({ token: tokenOf(links.get("gwen@example.com")) }) });
    assert.match(answered.text, /You’ve answered/);
  });

  test("everybody who signed up, chosen at the first email, which fixes it; the email to people who came since; the reminder", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    // Kofi, Chloe and Gwen.
    const sent = await press("send", "zach", id, { to: "everyone", emails: 3, audience: "signups" });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(w.survey(id).audience, { kind: "event-signups", eventId: EVENT_ID });
    assert.deepEqual(w.world.mail.map((message) => message.to).sort(), ["chloe@example.com", "gwen@example.com", "kofi@example.com"]);
    assert.deepEqual(short(await press("send", "zach", id, { to: "joined", emails: 0, audience: "came" })), [409, "Who this survey emails was fixed by its first email."]);
    // A sign-up confirmed since: Wren comes off the waiting list.
    await w.world.db.collection("eventRsvps").doc(RSVP.wren).update({ status: "confirmed" });
    w.world.mail.length = 0;
    const joined = await press("send", "zach", id, { to: "joined", emails: 1 });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.deepEqual(w.world.mail.map((message) => message.to), ["wren@example.com"]);
    // The reminder: its own test, then the people it reached who have not answered.
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    await answerByLink(tokenOf(links.get("wren@example.com")));
    w.world.mail.length = 0;
    assert.deepEqual(short(await press("remind", "zach", id, { emails: 3 })), [409, "Nobody has sent themselves a test of this email yet. Send yourself one before you send it."]);
    await press("test", "zach", id, { email: "reminder" });
    assert.equal(w.mailText()[0].subject, "[TEST] A reminder: 5 questions about VR games night, by Sun 8 Nov");
    w.world.mail.length = 0;
    const reminded = await press("remind", "zach", id, { emails: 3 });
    assert.equal(reminded.status, 200, JSON.stringify(reminded.body));
    assert.deepEqual(w.world.mail.map((message) => message.to).sort(), ["chloe@example.com", "gwen@example.com", "kofi@example.com"]);
    assert.ok(w.mailText().every((message) => message.surface === "event-survey" && /You haven’t answered yet\. It’s 5 questions and takes about a minute\./.test(message.text)));
    assert.equal(w.rowOf(id, "chloe").reminders, 1);
  });

  test("the people who came since the email; nothing sent to an event nobody signs up for as everybody who signed up", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("test", "zach", id, { email: "survey" });
    assert.equal((await press("send", "zach", id, { to: "everyone", emails: 5 })).status, 200);
    w.world.db.seed("eventCheckIns/ci-tess", checkIn({ kind: "walk-in", name: "Tess Ward", email: "tess@example.com", how: "page" }));
    w.world.mail.length = 0;
    assert.deepEqual(short(await press("send", "zach", id, { to: "joined", emails: 2 })), [409, "Nothing was sent: the number of people this reaches is now 1. Check the list and press again."]);
    assert.equal((await press("send", "zach", id, { to: "joined", emails: 1 })).status, 200);
    assert.deepEqual(w.world.mail.map((message) => message.to), ["tess@example.com"]);

    w.reset(eventSurveySeed({ [`events/${EVENT_ID}`]: { ...eventSurveySeed()[`events/${EVENT_ID}`], noSignup: true } }));
    const drop = await made();
    await press("test", "zach", drop, { email: "survey" });
    assert.deepEqual(short(await press("send", "zach", drop, { to: "everyone", emails: 3, audience: "signups" })), [409, "Nobody signs up for this event, so its survey can only go to the people who came."]);
  });

  test("closed: no answer by link or signed in, and nothing more sent; only an admin closes it", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 5 });
    const link = w.linkIn(w.world.mail[0]);
    assert.equal((await press("close", "iris", id)).status, 403);
    assert.deepEqual(short(await press("close", "zach", id)), [200, null]);
    assert.deepEqual(short(await answerByLink(tokenOf(link))), [409, "This survey has closed, so it takes no more answers."]);
    assert.deepEqual(short(await answerSignedIn("chloe", id)), [409, "This survey has closed, so it takes no more answers."]);
    assert.deepEqual(short(await press("send", "zach", id, { to: "joined", emails: 0 })), [409, "This survey has closed, so nothing more can be sent."]);
  });

  test("an event's survey asks no consent, through its link or signed in", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 5 });
    const token = tokenOf(w.linkIn(w.world.mail[0]));
    const byLink = await w.call(null, (await w.route("surveys/consent")).POST, {}, { body: { token, purpose: "followUps", given: true } });
    assert.deepEqual(short(byLink), [409, "This survey doesn’t ask that."]);
  });
});

// ---------------------------------------------------------------------------
// 4. The QR code at the event, and the admins' pages
// ---------------------------------------------------------------------------

describe("the QR survey code: a permanent short link per event's survey, and the page it lands on", () => {
  test("made with the survey: the event's word and -survey, filed under Surveys, to the event's survey page", async (t) => {
    clock(t);
    w.reset(eventSurveySeed({ "trackedLinks/vr-survey": { ...eventSurveySeed()["trackedLinks/poster"], slug: "vr-survey", label: "Taken" } }));
    await made();
    const code = w.world.db.read("trackedLinks/vr-survey-2");
    assert.ok(code, "the code was not made on the next free slug");
    assert.equal(code.destination, `/events/${EVENT_ID}/survey`);
    assert.equal(code.campaign, "Surveys");
    assert.equal(code.type, "qr");
    assert.equal(code.active, true);
    assert.equal(code.label, "VR games night: survey code");
    assert.deepEqual(Object.keys(code).sort(), ["active", "campaign", "countOffsite", "createdAt", "createdByUid", "destination", "label", "slug", "type", "updatedAt", "updatedByUid"]);
    // Admins draw it through check-in's QR downloads; nobody else does.
    const qr = (await w.route("links/[slug]/qr")).GET;
    for (const [who, status] of [["zach", 200], ["sue", 403], ["iris", 403], ["kofi", 403]]) {
      const res = await w.call(who, qr, { slug: "vr-survey-2" });
      assert.equal(res.status, status, String(who));
    }
  });

  test("its page: signed out asks to sign in and names nobody; signed in it is the survey, kept with the name", async (t) => {
    clock(t, LATE);
    w.reset();
    const path = "app/events/[id]/survey/page.tsx";
    const props = { params: Promise.resolve({ id: EVENT_ID }) };
    assert.match((await w.page(path, props, null)).text, /There’s no survey here/);
    const id = await made();
    assert.match((await w.page(path, props, "kofi")).text, /This survey isn’t open yet/);
    await press("open-at-event", "zach", id);
    const out = await w.page(path, props, null);
    assert.match(out.text, /VR games night · Sun 1 Nov How was VR games night\? Sign in to answer\. Your answers are kept with your name, and only NAISI’s admins can see who said what\. Sign in Signed up without an account, or left your email at the door\? Answer from your own link in the email we send you\./);
    assert.match(out.html, /href="\/login\?next=%2Fevents%2Fvr-games-night-ev01%2Fsurvey"/);
    for (const name of ["Kofi", "Chloe", "Gwen", "Rosa", "Mo"]) assert.ok(!out.text.includes(name), `signed out, the page named ${name}`);
    const kofi = await w.page(path, props, "kofi");
    assert.match(kofi.text, /Confidential You’re signed in as Kofi Asante, so only NAISI’s admins can see who said what\./);
    assert.match(kofi.text, /We keep your answers with your name, and that you came, so nobody is emailed it twice\./);
    assert.match(kofi.html, /<form/);
    const chloe = await w.page(path, props, "chloe");
    assert.match(chloe.text, /We keep your answers with your name, and that you signed up, so nobody is emailed it twice\./);
    // Pat neither came nor holds a confirmed place: during the door, the way to check in.
    t.mock.timers.setTime(new Date("2026-11-01T16:45:00Z").getTime());
    const pat = await w.page(path, props, "pat");
    assert.match(pat.text, /This survey is for the people who came It goes to the people who came to this event or signed up for it\. If you came, check in at the door first\. Check in/);
    assert.match(pat.html, /href="\/events\/vr-games-night-ev01\/check-in"/);
    assert.ok(!/<form/.test(pat.html));
    await answerSignedIn("kofi", id);
    assert.match((await w.page(path, props, "kofi")).text, /You’ve answered/);
    // Opening the page writes nothing.
    const before = w.everything();
    await w.page(path, props, "chloe");
    await w.page(path, props, null);
    assert.equal(w.everything(), before, "opening the survey's page wrote something");
  });
});

describe("the admins' pages for a survey after an event", () => {
  test("the Send tab: the event, the QR code, who the email goes to with its numbers, and the summary", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id);
    const send = await w.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/send/page.tsx", { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.match(send.text, /Who answers People at an event Its sign-ups or the people who came, and a QR code there\. Event: VR games night · Sun 1 Nov/);
    assert.match(send.text, /At the event: the QR code naisi\.invalid\/q\/vr-survey Up since Sun 1 Nov, 4:30pm · 1 answer Download PNG Show full screen/);
    // Mo walked in signed in, with no sign-up: the email goes to Mo's account,
    // so Mo is said apart from the walk-in who left an email (walk 4b, L5).
    assert.match(send.text, /Email Everyone who came, with an email: 5 3 who signed up and checked in, 1 who came without signing up, and 1 walk-in who left an email Everyone who signed up: 3/);
    assert.match(send.text, /1 person already answered at the event while signed in, so they won’t get the email\. Emails 4 people\./);
    assert.match(send.text, /How was VR games night\?/);
    assert.match(send.text, /Admins only\. Iris, the organiser, sees how many came, not the results\./);
    assert.match(send.text, /Names come off Wed 1 Nov 2028, two years after the event\./);
    assert.match(send.html, /href="\/api\/links\/vr-survey\/qr\?format=png&amp;download=1"/);
  });

  test("the list, Who answered with guests by name, and the results with n beside every number and the numbers above", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id);
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 4 });
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    await answerByLink(tokenOf(links.get("gwen@example.com")), { ...ANSWERS, q_ev_how: { type: "rating", value: 4 }, q_ev_change: { type: "text", text: "More headsets." } });
    const list = await w.page("app/(app)/admin/(admin-only)/surveys/page.tsx", {}, "zach");
    assert.match(list.text, /After VR games night Confidential Event: Sun 1 Nov 2 answers Closes Sun 8 Nov/);
    const answered = await w.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/page.tsx", { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.match(answered.text, /2 have answered: 1 with the QR code before any email, and 1 of the 4 it was emailed to/);
    assert.match(answered.text, /Gwen Price/);
    assert.match(answered.text, /Kofi Asante/);
    assert.match(answered.text, /Rosa Martinez/);
    assert.match(answered.text, /With the QR code, signed in/);
    const results = await w.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/results/page.tsx", { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.match(results.text, /2 Answers 1 with the QR code, 1 by email 6 Came 3 who signed up, 3 walk-ins 1 of 4 Answered the email Sent Mon 2 Nov, 10am/);
    assert.match(results.text, /2 answers\./);
    assert.match(results.text, /2 answered, 100% of the 2 answers/);
    assert.match(results.text, /Loved meeting people from the fellowships\./);
    assert.match(results.text, /More headsets\./);
    assert.match(results.text, /Admins only\. Iris, the organiser, sees how many came, not the results: send Iris the summary\./);
    for (const name of ["Kofi", "Gwen", "Asante", "Price"]) assert.ok(!results.text.includes(name), `the results named ${name}`);
  });

  // A record whose names have come off reaches nobody, and still came: the
  // privacy policy says it stays in the count, and the event's Check-in tab
  // counts it, so the head over the results counts it the same way.
  test("a check-in whose names have come off reaches nobody and still came: the results' Came is the Check-in tab's", async (t) => {
    clock(t, NEXT_DAY);
    const off = { eventId: EVENT_ID, rsvpId: null, uid: null, name: null, email: null, emailGoesAt: null, byUid: null, at: new Date("2026-11-01T14:30:00Z"), namesOffAt: null, namesOff: true };
    w.reset(
      eventSurveySeed({
        "eventCheckIns/ci-off-signup": { ...off, kind: "signup", how: "qr" },
        "eventCheckIns/ci-off-walk-in": { ...off, kind: "walk-in", how: "door" },
      }),
    );
    const id = await made();
    const { readEventAudience, membersOf } = await w.load("lib/surveys/events/audience.ts");
    const read = await readEventAudience(w.world.db, EVENT_ID);
    assert.equal(membersOf(read, "event-came").length, 6, "a record with its names off reached somebody");
    assert.deepEqual(read.namesOff, { signups: 1, signupsByQr: 1, walkIns: 1 });
    const results = await w.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/results/page.tsx", { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.match(results.text, / 8 Came 4 who signed up, 4 walk-ins /);
    const tab = await w.page("app/(app)/events/manage/[id]/check-in/page.tsx", { params: Promise.resolve({ id: EVENT_ID }) }, "sue");
    assert.match(tab.text, / 8 came /);
  });
});

// ---------------------------------------------------------------------------
// 5. The event's Survey after tab
// ---------------------------------------------------------------------------

describe("the event's Survey after tab: admins see the results; the organiser sees that it went and when, and nothing of its results", () => {
  const TAB = "app/(app)/events/manage/[id]/survey/page.tsx";
  const props = () => ({ params: Promise.resolve({ id: EVENT_ID }) });

  test("before there is one: everybody is told none went, and an admin is offered to make it", async (t) => {
    clock(t);
    w.reset();
    const admin = await w.page(TAB, props(), "zach");
    assert.match(admin.text, /The survey after No survey has gone out after this event\. Results go to admins\. Ask Lloyd or Zach for the summary\. Make a survey/);
    assert.match(admin.html, /href="\/admin\/surveys\/new\?event=vr-games-night-ev01#after-a-social"/);
    const iris = await w.page(TAB, props(), "iris");
    assert.match(iris.text, /No survey has gone out after this event\./);
    assert.ok(!/Make a survey/.test(iris.text), "the organiser was offered to make a survey");
    // The tabs, on this page and on Check-in.
    assert.match(iris.text, /Details Check-in Survey after/);
    const checkInTab = await w.page("app/(app)/events/manage/[id]/check-in/page.tsx", props(), "sue");
    assert.match(checkInTab.html, /href="\/events\/manage\/vr-games-night-ev01\/survey"/);
  });

  test("once it went: the organiser and SU-recognised committee read who sent it and when, never a result, a count of answers or a name", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id, { ...ANSWERS, q_ev_change: { type: "text", text: "Snacks ran out by half three." } });
    t.mock.timers.setTime(NEXT_DAY.getTime());
    await press("test", "zach", id, { email: "survey" });
    await press("send", "zach", id, { to: "everyone", emails: 4 });
    for (const who of ["iris", "cal", "sue"]) {
      const page = await w.page(TAB, props(), who);
      assert.match(page.text, /After VR games night: Zach emailed it to 4 people on Mon 2 Nov at 10am\. Results go to admins\. Ask Lloyd or Zach for the summary\./, who);
      for (const secret of ["Snacks ran out", "Answers", "Answered the email", "Kofi", "1 with the QR code", "Download the answers"]) {
        assert.ok(!page.text.includes(secret), `${who} was shown "${secret}"`);
      }
      // Nothing to download but, for SU-recognised committee, the survey's
      // QR code as a PNG, which they show at the event while it takes
      // answers (Zach, Mon 26 Oct 2026; until then nothing here downloaded
      // anything for them).
      const downloads = page.text.split("Download").length - 1;
      assert.equal(downloads, who === "sue" ? 1 : 0, `${who} was offered something to download`);
      if (who === "sue") assert.ok(page.text.includes("Download PNG"), "sue was not offered the code's PNG");
      assert.ok(!/admin\/surveys\//.test(page.html), `${who} was linked to the survey's pages`);
    }
    // An admin reads the results, with n beside every number, and the logged download.
    const admin = await w.page(TAB, props(), "zach");
    assert.match(admin.text, /After VR games night: Zach emailed it to 4 people on Mon 2 Nov at 10am\./);
    assert.match(admin.text, /1 Answers 1 with the QR code, 0 by email 6 Came/);
    assert.match(admin.text, /Snacks ran out by half three\./);
    assert.match(admin.text, /1 answered, 100% of the 1 answer/);
    assert.match(admin.text, /Admins only\. Iris, the organiser, sees how many came, not the results: send Iris the summary\./);
    assert.match(admin.html, /href="\/admin\/surveys\/[A-Za-z0-9_-]+\/send"/);
    assert.match(admin.text, /Download/);
    // Closed, it says so.
    await press("close", "zach", id);
    assert.match((await w.page(TAB, props(), "iris")).text, /It closed on Mon 2 Nov\./);
  });

  /** The tab's code card, as words; "" when it is not drawn. */
  const codeCardOf = (html) => {
    const at = html.indexOf('aria-labelledby="survey-code-heading"');
    if (at === -1) return "";
    return html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at) + "</section>".length);
  };
  const LAYOUT = "app/(app)/events/manage/layout.tsx";

  test("the code at the event: the people who may draw its door code show it from this tab while the survey takes answers, and nothing of its answers comes with it", async (t) => {
    clock(t, LATE);
    // Pat organises it here: a member holding draftEvent, neither committee nor an admin.
    w.reset(eventSurveySeed({ "users/pat": { ...eventSurveySeed()["users/pat"], permissions: { draftEvent: true } } }));
    w.world.db.poke(`events/${EVENT_ID}`, { authorUid: "pat" });
    const id = await made();

    // A draft: those who show it are told it comes once an admin opens it; nobody is shown a code.
    const NOT_YET = "Its QR code shows here once an admin opens the survey.";
    for (const who of ["zach", "sue"]) {
      const page = await w.page(TAB, props(), who);
      assert.match(page.text, new RegExp(`No survey has gone out after this event\\. ${NOT_YET}`), who);
      assert.equal(codeCardOf(page.html), "", `${who} was shown a draft's code`);
    }
    for (const who of ["iris", "cal", "pat"]) {
      const page = await w.page(TAB, props(), who);
      assert.ok(!page.text.includes(NOT_YET), `${who}, who does not run check-in, was told the code comes`);
      assert.equal(codeCardOf(page.html), "");
    }

    // Open, with an answer in it: the code, its address, its PNG and full screen, in the Send tab's words.
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id, { ...ANSWERS, q_ev_change: { type: "text", text: "Snacks ran out by half three." } });
    for (const who of ["sue", "zach"]) {
      const page = await w.page(TAB, props(), who);
      const card = codeCardOf(page.html);
      assert.ok(card, `${who} was not shown the code`);
      assert.match(textOf(card), /^At the event: the QR code naisi\.invalid\/q\/vr-survey Download PNG Show full screen$/, who);
      assert.match(card, /<svg[^>]*role="img"[^>]*aria-label="QR code for naisi\.invalid\/q\/vr-survey"/);
      assert.match(card, /href="\/api\/links\/vr-survey\/qr\?format=png&amp;download=1"/);
      assert.ok(!page.text.includes(NOT_YET), who);
    }
    // SU-recognised committee: the code and nothing else of the survey's.
    const sue = await w.page(TAB, props(), "sue");
    for (const secret of ["Open it", "Up since", "1 answer", "Answers", "Answered", "Snacks ran out", "Kofi", "Asante", "Download the", "Make a survey", "Open the survey"]) {
      assert.ok(!sue.text.includes(secret), `SU-recognised committee were shown "${secret}"`);
    }
    assert.ok(!/admin\/surveys\/|open-at-event/.test(sue.html), "SU-recognised committee were led to the survey's own pages");
    // The organiser and the committee the SU does not recognise: nothing of the code.
    for (const who of ["iris", "cal", "pat"]) {
      const page = await w.page(TAB, props(), who);
      assert.equal(codeCardOf(page.html), "", `${who} was shown the code`);
      assert.ok(!/vr-survey|<svg[^>]*QR code/.test(page.html), `${who} was handed the code`);
      for (const secret of ["Snacks ran out", "Kofi", "Up since"]) assert.ok(!page.text.includes(secret), `${who} was shown "${secret}"`);
    }
    // An admin keeps everything they had: the results and the way to the survey.
    const admin = await w.page(TAB, props(), "zach");
    assert.match(admin.text, /Snacks ran out by half three\./);
    assert.match(admin.html, /href="\/admin\/surveys\/[A-Za-z0-9_-]+\/send"/);
    // A view-as session shows what the person viewed sees, no more.
    assert.equal(codeCardOf((await w.page(TAB, props(), "sue", { viewAs: true })).html), codeCardOf(sue.html));
    assert.equal(codeCardOf((await w.page(TAB, props(), "iris", { viewAs: true })).html), "");
    // A member who is not in the events area, and somebody signed out, are sent away first.
    assert.equal((await w.page(LAYOUT, { children: null }, "kofi")).to, "/dashboard");
    assert.equal((await w.page(TAB, props(), null)).to, "/login");
    // Opening the tab writes nothing.
    const before = w.everything();
    await w.page(TAB, props(), "sue");
    assert.equal(w.everything(), before, "opening the tab wrote something");

    // Closed: no code, and no line that it is coming.
    await press("close", "zach", id);
    for (const who of ["sue", "zach"]) {
      const page = await w.page(TAB, props(), who);
      assert.equal(codeCardOf(page.html), "", `${who} was shown a closed survey's code`);
      assert.ok(!page.text.includes(NOT_YET), who);
    }
  });

  test("the code's picture, its PNG and its full screen are drawn for exactly those people, while the survey takes answers", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    const qr = (await w.route("links/[slug]/qr")).GET;
    const draw = (who, options = {}) => w.call(who, qr, { slug: "vr-survey" }, options);
    // A draft: admins alone, as before.
    for (const [who, status] of [["zach", 200], ["sue", 403], ["iris", 403], ["cal", 403], ["kofi", 403], [null, 401]]) {
      assert.equal((await draw(who)).status, status, `a draft's code, ${who}`);
    }
    await press("open-at-event", "zach", id);
    for (const [who, status] of [["zach", 200], ["lloyd", 200], ["sue", 200], ["iris", 403], ["cal", 403], ["kofi", 403], ["ines", 403], [null, 401]]) {
      assert.equal((await draw(who)).status, status, `an open survey's code, ${who}`);
    }
    // View-as answers as the person viewed: the picture is all it hands over, and it writes nothing.
    assert.equal((await draw("sue", { viewAs: true })).status, 200);
    assert.equal((await draw("iris", { viewAs: true })).status, 403);
    // The same rule decides it for the picture and for the tab.
    const code = await w.load("lib/surveys/events/code.ts");
    const stored = await (await w.load("lib/surveys/events/records.ts")).eventSurveyOf(w.world.db, EVENT_ID);
    assert.equal(stored?.id, id);
    const asked = (who) => code.surveyCodeAtEvent(w.sessionOf(who), stored, new Date());
    assert.deepEqual(["zach", "sue", "iris", "cal", "kofi"].map(asked), ["show", "show", null, null, null]);
    assert.equal(code.surveyCodeAtEvent(null, stored, new Date()), null);
    assert.equal(code.surveyCodeAtEvent(w.sessionOf("sue"), null, new Date()), null, "no survey");
    // Closed: admins alone again.
    await press("close", "zach", id);
    for (const [who, status] of [["zach", 200], ["sue", 403]]) {
      assert.equal((await draw(who)).status, status, `a closed survey's code, ${who}`);
    }
    // Another link going to an event's survey page, but for an event with no survey, is an admin's alone.
    w.world.db.seed("trackedLinks/elsewhere-survey", { ...w.world.db.read("trackedLinks/vr-survey"), slug: "elsewhere-survey", destination: "/events/no-such-event/survey" });
    assert.equal((await w.call("sue", qr, { slug: "elsewhere-survey" })).status, 403);
  });

  test("the code at the event is the survey's own short link, read by its destination", async () => {
    const code = await w.load("lib/surveys/events/code.ts");
    assert.equal(code.eventOfSurveyCodePath(code.surveyCodePath("vr-games-night-ev01")), "vr-games-night-ev01");
    for (const other of ["/events/vr-games-night-ev01/check-in", "/events/vr-games-night-ev01/survey/x", "/links", "/events//survey", "https://example.com/events/a/survey"]) {
      assert.equal(code.eventOfSurveyCodePath(other), null, other);
    }
  });

  test("the logged download of the answers is an admin's alone, recorded before it is handed over, and names guests", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 5 });
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    await answerByLink(tokenOf(links.get("gwen@example.com")));
    await answerSignedIn("mo", id);
    const exportRoute = (await w.route("surveys/[surveyId]/export")).POST;
    for (const who of ["iris", "sue", "kofi"]) assert.equal((await w.call(who, exportRoute, { surveyId: id })).status, 403, who);
    w.world.user = w.sessionOf("zach");
    const response = await exportRoute(new Request("https://naisi.invalid/api", { method: "POST" }), { params: Promise.resolve({ surveyId: id }) });
    assert.equal(response.status, 200);
    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/);
    assert.match(lines[0], /^Name,Sent,How,1\. How was it\?,2\. Would you come to another NAISI social\?/);
    assert.match(csv, /Gwen Price,[^,]+,Personal link,5,Yes/);
    assert.match(csv, /Mo Rahman,[^,]+,"?Signed in, with the QR code"?,5,Yes/);
    assert.ok(!/@example\.com/.test(csv), "the download holds an address");
    const logged = w.world.db.paths().filter((path) => path.startsWith("dataExports/")).map((path) => w.world.db.read(path));
    assert.equal(logged.length, 1);
    assert.equal(logged[0].kind, "survey-answers");
    assert.deepEqual(logged[0].scope, { surveyId: id });
  });
});

// ---------------------------------------------------------------------------
// 6. Deletion: walk-ins' emails, names off two years on, and an account deleted
// ---------------------------------------------------------------------------

describe("deletion: a walk-in's email goes at the earlier of the survey's close and a week after; names come off two years on; an account's at once", () => {
  const rosa = () => w.world.db.read("eventCheckIns/ci-rosa");
  const iso = (value) => (value instanceof Date ? value.toISOString() : value);

  test("the email follows the survey: sooner when it closes sooner, never later than the week, at once when closed by hand", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    assert.equal(iso(rosa().emailGoesAt), "2026-11-08T17:00:00.000Z", "before any survey, a week after the event");
    const id = await made({ closesOn: "2026-11-05" });
    assert.equal(iso(rosa().emailGoesAt), "2026-11-05T23:59:00.000Z", "the survey closes sooner, so the email goes then");
    // Changed in the editor before it opens: the email moves with it, never past the week.
    const items = structuredClone(w.survey(id).items);
    await press("questions", "zach", id, { title: "How was it?", intro: "", minutes: 1, closesOn: "2026-11-20", items });
    assert.equal(iso(rosa().emailGoesAt), "2026-11-08T17:00:00.000Z", "a survey closing later than the week kept the email longer");
    // A walk-in added after the survey exists takes the same day.
    await press("questions", "zach", id, { title: "How was it?", intro: "", minutes: 1, closesOn: "2026-11-06", items });
    const tick = (await w.route("events/[id]/check-ins")).POST;
    const added = await w.call("sue", tick, { id: EVENT_ID }, { body: { from: "page", walkIn: { name: "Tess Ward", email: "tess@example.com" } } });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    const tess = w.world.db.paths().map((path) => w.world.db.read(path)).find((doc) => doc?.name === "Tess Ward");
    assert.equal(iso(tess.emailGoesAt), "2026-11-06T23:59:00.000Z");
    // Closed by hand: every walk-in's email goes at once.
    await press("open-at-event", "zach", id);
    await press("close", "zach", id);
    assert.equal(rosa().email, null);
    assert.equal(rosa().emailGoesAt, null);
    assert.equal(rosa().name, "Rosa Martinez", "closing the survey took the walk-in's name, which check-in keeps a year");
    const tessAfter = w.world.db.paths().map((path) => w.world.db.read(path)).find((doc) => doc?.name === "Tess Ward");
    assert.equal(tessAfter.email, null);
    // And nobody more is added as having come.
    t.mock.timers.setTime(NEXT_DAY.getTime() + 1000);
    const late = await w.call("sue", tick, { id: EVENT_ID }, { body: { from: "page", walkIn: { name: "Ola Ade" } } });
    assert.deepEqual(short(late), [409, "The survey after this event has closed, so nobody more can be added."]);
  });

  test("the check-in tab and the walk-in form say the survey's day when it comes first, and the week's when it does not", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const tab = "app/(app)/events/manage/[id]/check-in/page.tsx";
    const props = () => ({ params: Promise.resolve({ id: EVENT_ID }) });
    assert.match((await w.page(tab, props(), "sue")).text, /Until Sun 8 Nov, a week after the event/);
    await made({ closesOn: "2026-11-05" });
    const text = (await w.page(tab, props(), "sue")).text;
    assert.match(text, /Until the survey closes on Thu 5 Nov/);
    assert.match(text, /Rosa Martinez Email kept for the survey until Thu 5 Nov/);
    const { WalkInForm } = await w.load("features/events/checkIn/WalkInDialog.tsx");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const form = (untilSurvey) =>
      renderToStaticMarkup(w.createElement(WalkInForm, { eventId: EVENT_ID, eventLine: "VR games night · Sun 1 Nov", emailGoesOn: "Thu 5 Nov", untilSurvey, from: "page", onAdded() {}, onCancel() {} }));
    assert.match(form(true), /Only for the survey after this event\. We delete it when the survey closes on Thu 5 Nov\./);
    assert.match(form(false), /Only for the survey after this event\. We delete it on Thu 5 Nov, a week after the event\./);
  });

  test("the check-in job deletes a walk-in's email on the survey's day", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    await made({ closesOn: "2026-11-04" });
    const { tidyCheckIns } = await w.load("lib/events/checkIns.ts");
    await tidyCheckIns(w.world.db, new Date("2026-11-04T23:58:00Z"));
    assert.equal(rosa().email, "rosa@example.com");
    const done = await tidyCheckIns(w.world.db, new Date("2026-11-05T00:00:00Z"));
    assert.equal(done.emailsGone, 1);
    assert.equal(rosa().email, null);
  });

  test("names come off two years after the event, guests' as accounts', by the surveys' own job; the answers stay", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 5 });
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    await answerByLink(tokenOf(links.get("gwen@example.com")));
    await answerSignedIn("chloe", id);
    const job = (await w.load("lib/scheduler/jobs/surveyNamesOff.ts")).surveyNamesOffJob;
    const ctx = (now) => ({ now, log() {}, maxPerTick: 5, maxLateHours: 0, budget: { remainingMs: () => 60000, expired: () => false }, policy: {} });
    assert.equal((await job.handler(ctx(new Date("2028-10-31T12:00:00Z")))).processed, 0);
    assert.equal(w.answers(id).filter((answer) => answer.respondent).length, 2);
    assert.equal((await job.handler(ctx(new Date("2028-11-01T00:30:00Z")))).processed, 1);
    assert.deepEqual(w.answers(id).map((answer) => answer.respondent), [null, null]);
    assert.equal(w.answers(id).length, 2, "the answers went with the names");
    assert.deepEqual(w.people(id), [], "who it was sent to is still kept");
  });

  test("an account deleted takes its name off its answers at once; a guest's stays until names come off", async (t) => {
    clock(t, LATE);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await answerSignedIn("kofi", id);
    t.mock.timers.setTime(NEXT_DAY.getTime());
    await press("test", "zach", id, { email: "survey" });
    w.world.mail.length = 0;
    await press("send", "zach", id, { to: "everyone", emails: 4 });
    const links = new Map(w.world.mail.map((message) => [message.to, w.linkIn(message)]));
    await answerByLink(tokenOf(links.get("gwen@example.com")));
    const { takeNamesOffForAccount } = await w.load("lib/surveys/namesOff.ts");
    const off = await takeNamesOffForAccount(w.world.db, "kofi");
    assert.deepEqual(off, { answers: 1, people: 1 });
    const kept = w.answers(id).map((answer) => answer.respondent);
    assert.ok(kept.some((respondent) => respondent === null));
    assert.ok(kept.some((respondent) => respondent?.kind === "guest" && respondent.signupId === RSVP.gwen));
    assert.equal(w.rowOf(id, "kofi"), null);
  });
});

describe("the one writer of an event survey's answers holds its own checks", () => {
  test("a secret that is not the row's opens nothing, even past the link's door", async (t) => {
    clock(t, NEXT_DAY);
    w.reset();
    const id = await made();
    await press("open-at-event", "zach", id);
    await press("test", "zach", id, { email: "survey" });
    await press("send", "zach", id, { to: "everyone", emails: 5 });
    const { recordEventAnswer } = await w.load("lib/surveys/events/store.ts");
    const { normalizeSurvey } = await w.load("lib/firestore/surveys.ts");
    const survey = normalizeSurvey(id, w.survey(id));
    const gwen = { kind: "guest", signupId: RSVP.gwen };
    const stale = await recordEventAnswer(w.world.db, { survey, respondent: gwen, token: "C".repeat(43), raw: ANSWERS, via: "link", now: NEXT_DAY });
    assert.deepEqual(stale, { ok: false, status: 404, error: "That link doesn’t open a survey you can answer." });
    // Somebody it was never sent to has no row, so a link of theirs opens nothing either.
    const nobody = await recordEventAnswer(w.world.db, { survey, respondent: { kind: "guest", signupId: "nobody-here" }, token: "D".repeat(43), raw: ANSWERS, via: "link", now: NEXT_DAY });
    assert.equal(nobody.status, 404);
    assert.deepEqual(w.answers(id), []);
  });
});
