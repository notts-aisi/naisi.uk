/**
 * THE SURVEY AFTER AN EVENT, SET UP BY ITS EVENT AND SENDING ITSELF
 * (docs/surveys.md, "Surveys after events"): the editor's Survey after step
 * and its setting, publishing setting the survey up, the `event-surveys` job
 * opening, emailing and reminding, the one question for people who had a
 * place and weren't checked in, "Send it now", the setting changed after
 * publishing, and the event's Survey after tab.
 *
 * Every caller is tried where it matters: the event's author (committee the
 * SU does not recognise), its collaborator, an admin, SU-recognised committee
 * who don't organise it, a member, a pending account, somebody signed out,
 * and a view-as session.
 *
 * The world is `tests/lib/eventSurveyWorld.mjs` (VR games night, Sun 1 Nov
 * 2026, 2pm to 5pm GMT, run by Iris with Cal; Kofi, Gwen, Wren, Mo, Rosa and
 * Dan came; Chloe had a place and did not). The mail door records each
 * message and sends none. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DURING, END, EVENT_ID, RSVP, START, eventSurveySeed, makeEventSurveyWorld, textOf } from "./lib/eventSurveyWorld.mjs";

const w = await makeEventSurveyWorld("__eventSurveyAfter", [
  // The publish route's push leg, which nobody here holds a device for.
  ["@/lib/push/send", "export async function sendPushToUid() { return { sent: 0, removed: 0 }; }"],
]);
process.env.EVENTS_TOKEN_SECRET ??= "event-survey-after-suite-secret-at-least-32-bytes";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Sun 1 Nov, 9am: the morning of the event. */
const MORNING = new Date("2026-11-01T09:00:00Z");
/** 12 hours after the event ends: Mon 2 Nov, 5am. */
const DUE = new Date(END.getTime() + 12 * HOUR);
/** The door, opened by Iris at 1:05pm, inside its hours. */
const DOOR = { doorOpenedAt: new Date("2026-11-01T13:05:00Z"), doorOpenedBy: "iris" };

/** The clock, set to `at` for one test: Date only, so the mail dispatcher's pauses stay real. */
function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const setTime = (t, at) => t.mock.timers.setTime(at.getTime());

const after = await w.load("lib/surveys/events/after.ts");
const stored = await w.load("lib/events/surveyAfter.ts");
const setUp = await w.load("lib/surveys/events/setUp.ts");
const records = await w.load("lib/surveys/events/records.ts");
const job = (await w.load("lib/scheduler/jobs/eventSurveys.ts")).eventSurveysJob;

/** The setting a new event starts with, changed by `over`. */
const setting = (over = {}) => ({ ...stored.newSurveyAfter(), ...over });

/** A fresh world whose event carries `surveyAfter`, and the event changed by `event`. */
function world(over = {}, event = {}) {
  w.reset(eventSurveySeed());
  w.world.db.poke(`events/${EVENT_ID}`, { surveyAfter: setting(over), ...event });
}

/** Publishing's setting up, as the publish route asks for it; answers the survey's id. */
async function setItUp(now = MORNING) {
  const set = await setUp.setUpEventSurvey(w.world.db, EVENT_ID, "zach", now);
  assert.equal(set.ok, true, JSON.stringify(set));
  return set.surveyId;
}

/** One tick of the job at `now`. */
async function tick(now) {
  return job.handler({
    now,
    log() {},
    maxPerTick: job.maxPerTick,
    maxLateHours: job.maxLateHours,
    budget: { remainingMs: () => 60_000, expired: () => false },
    policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
  });
}

/** Every message the mail door was handed: to, kind, surface and words. */
const mail = () => w.mailText();
const markers = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("schedulerMarkers/evsurvey__"))
    .map((path) => [path.slice("schedulerMarkers/".length), w.world.db.read(path)]);

const route = async (path) => w.route(`events/[id]/survey-after${path}`);
const props = () => ({ params: Promise.resolve({ id: EVENT_ID }) });
const TAB = "app/(app)/events/manage/[id]/survey/page.tsx";
const CHECK_IN = "app/(app)/events/manage/[id]/check-in/page.tsx";

/** Answers to the standard questions. */
const ANSWERS = {
  q_ev_how: { type: "rating", value: 5 },
  q_ev_again: { type: "choice", optionId: "o_ev_yes" },
  q_ev_next_text: { type: "text", text: "A quiz night" },
  q_ev_heard: { type: "choice", optionId: "o_ev_friend" },
};
const answerSignedIn = async (who, surveyId) =>
  w.call(who, (await w.route("surveys/[surveyId]/answer")).POST, { surveyId }, { body: { answers: ANSWERS } });

// ---------------------------------------------------------------------------
// 1. The setting
// ---------------------------------------------------------------------------

describe("the setting: on for a new event, only a stored one counts, read strictly", () => {
  test("a new event's: on, the standard questions, everyone who came, the question about not coming, 12 hours after, a reminder, the code", () => {
    assert.deepEqual(stored.newSurveyAfter(), {
      on: true,
      items: null,
      who: "came",
      missed: true,
      when: "standard",
      hours: 12,
      reminder: true,
      showCode: true,
    });
  });

  test("none stored is none, never on; a value the step never writes is the quieter choice", () => {
    assert.equal(stored.readSurveyAfter(undefined), null);
    assert.equal(stored.readSurveyAfter("on"), null);
    assert.deepEqual(stored.readSurveyAfter({ on: "yes", who: "everybody", when: "soon", hours: 400, reminder: 1, showCode: "true", missed: "yes" }), {
      on: false,
      items: null,
      who: "came",
      missed: false,
      when: "standard",
      hours: 12,
      reminder: false,
      showCode: false,
    });
    for (const hours of [1, 12, 96]) assert.equal(stored.isSurveyAfterHours(hours), true, String(hours));
    for (const hours of [0, 97, 12.5, "12", null]) assert.equal(stored.isSurveyAfterHours(hours), false, String(hours));
  });

  test("a survey's record of how it goes by itself is read strictly: a value no setting writes sends nothing by itself", async () => {
    const surveys = await w.load("lib/firestore/surveys.ts");
    const read = (auto, kind = "event") =>
      surveys.normalizeSurvey("s1", { kind, audience: { kind: "event-came", eventId: EVENT_ID }, event: { title: "VR games night" }, auto }).auto;
    assert.equal(read(undefined), null, "a survey an admin made reads as one its event set up");
    assert.equal(read({ when: "standard", pending: true }, "before"), null, "a programme's survey carries an event's settings");
    assert.deepEqual(read({ when: "whenever", hours: 500, reminder: "yes", showCode: 1, missed: "yes", pending: "yes", skipped: { send: 4 } }), {
      when: "hand",
      hours: 12,
      reminder: false,
      showCode: false,
      missed: false,
      pending: false,
      remindedAt: null,
      skipped: { send: null, remind: null },
    });
    // The question about not coming is an event's audience, never read as a programme's.
    const missed = surveys.normalizeSurvey("s1-missed", { kind: "event", audience: { kind: "event-missed", eventId: EVENT_ID }, event: { title: "VR games night" } });
    assert.deepEqual(missed.audience, { kind: "event-missed", eventId: EVENT_ID });
    assert.equal(surveys.isEventSurvey(missed), true);
    assert.deepEqual(surveys.programmeOf(missed.audience), { roundId: "", programmeId: "" });
    // A setting sent to the tab's route is taken whole or not at all.
    assert.equal(setUp.parseSurveyAfter({ ...setting(), items: [] }) !== null, true);
    for (const broken of [{}, { ...setting(), items: null }, { ...setting(), on: "yes" }, { ...setting(), who: "everybody" }, { ...setting(), when: "soon" }, { ...setting(), hours: 0 }]) {
      assert.equal(setUp.parseSurveyAfter(broken), null, JSON.stringify(broken));
    }
  });

  test("the times: opens at the start, goes the chosen whole hours after the end or only by hand, reminds 3 days after it went, closes a week after", () => {
    const event = { startAt: START, endAt: END };
    const standard = after.timesOf(event, { when: "standard", hours: 40 });
    assert.equal(standard.opensAt.toISOString(), START.toISOString());
    assert.equal(standard.sendAt.toISOString(), "2026-11-02T05:00:00.000Z", "the standard is 12 hours, whatever hours says");
    assert.equal(standard.closesAt.toISOString(), "2026-11-08T17:00:00.000Z");
    assert.equal(after.timesOf(event, { when: "after", hours: 40 }).sendAt.toISOString(), "2026-11-03T09:00:00.000Z");
    assert.equal(after.timesOf(event, { when: "hand", hours: 12 }).sendAt, null);
    // An event with no end ends at its start.
    assert.equal(after.timesOf({ startAt: START, endAt: null }, { when: "standard", hours: 12 }).sendAt.toISOString(), "2026-11-02T02:00:00.000Z");
    assert.equal(after.remindAtAfter(new Date("2026-11-02T05:00:00Z")).toISOString(), "2026-11-05T05:00:00.000Z");
    // The week the survey closes is the week a walk-in's address goes.
    assert.equal(after.SURVEY_AFTER_CLOSES_AFTER_MS, 7 * DAY);
  });

  test("who: an event nobody signs up for goes to the people who came, and asks nobody about not coming", () => {
    assert.equal(after.whoAt(setting({ who: "signups" }), true), "came");
    assert.equal(after.whoAt(setting({ who: "signups" }), false), "signups");
    assert.equal(after.asksMissed(setting(), false), true);
    assert.equal(after.asksMissed(setting(), true), false, "a drop-in asked people who never had a place");
    assert.equal(after.asksMissed(setting({ who: "signups" }), false), false, "everyone with a place was asked twice");
  });

  test("the questions: the standard set, reworded, moved, removed and added to; a standard question never retyped", () => {
    const standard = after.settingsOf(setting());
    assert.equal(standard.standard, true);
    assert.deepEqual(after.questionProblems(standard.items), []);
    const [how, ...rest] = standard.items;
    // Moved and reworded: fine.
    assert.deepEqual(after.questionProblems([...rest, { ...how, title: "How did it go?" }]), []);
    // Retyped: refused, naming the question.
    assert.deepEqual(after.questionProblems([{ ...rest[1], type: "longText", options: undefined, limit: { unit: "characters", max: 200 } }]), [
      "Question 1 can’t change its kind.",
    ]);
    // An added question needs its words; every question removed is no survey.
    const added = { kind: "question", id: "q_mine", type: "shortText", title: "", body: [], required: false };
    assert.match(after.questionProblems([...standard.items, added]).join(" "), /^Question 6: /);
    assert.deepEqual(after.questionProblems([]), ["A survey needs at least one question."]);
    assert.deepEqual(after.problemsByQuestion([...standard.items, added]).get("q_mine"), ["This question needs a title."]);
  });

  test("the step's last line says what publishing sets up, and while the job is off, that nothing goes by itself", () => {
    const base = { on: true, who: "came", missed: false, sendAt: new Date("2026-11-20T10:00:00Z"), byHand: false };
    assert.equal(
      after.setUpWords({ ...base, jobOn: true }),
      "Publishing sets this up: the survey goes by itself on Fri 20 Nov at 10am to everyone who came. Only admins read the answers; you’ll see that it went.",
    );
    assert.match(after.setUpWords({ ...base, jobOn: false }), /is ready to go on Fri 20 Nov at 10am to everyone who came, once sending by itself is switched on\./);
    assert.match(after.setUpWords({ ...base, byHand: true, jobOn: true }), /goes to everyone who came when you or an admin send it from the Survey after tab\./);
    assert.match(after.setUpWords({ ...base, missed: true, jobOn: true }), /to everyone who came, and the one question to people with a place who didn’t come\./);
    assert.equal(after.setUpWords({ ...base, on: false, jobOn: true }), "Publishing sets up no survey after this event.");
    assert.equal(after.goesAtWords(new Date("2026-11-20T10:00:00Z")), "Fri 20 Nov, 10am");
    assert.ok(after.STEP_WORDS.jobOff.includes("switched off"));
  });
});

// ---------------------------------------------------------------------------
// 2. Publishing sets it up
// ---------------------------------------------------------------------------

describe("publishing sets it up: the survey as an admin's is made, a draft until the event starts, emailing nobody", () => {
  test("from the step: its questions, who, and how it goes by itself; no code yet, nobody emailed", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    const survey = w.survey(id);
    assert.equal(survey.kind, "event");
    assert.equal(survey.name, "After VR games night");
    assert.equal(survey.title, "How was VR games night?");
    assert.equal(survey.intro, "Thanks for coming on Sunday. 5 quick questions, about a minute.");
    assert.deepEqual(survey.audience, { kind: "event-came", eventId: EVENT_ID });
    assert.deepEqual(survey.items.map((item) => item.id), ["q_ev_how", "q_ev_again", "q_ev_next_text", "q_ev_heard", "q_ev_change"]);
    assert.equal(survey.closesAt.toISOString(), "2026-11-08T17:00:00.000Z", "it closes a week after the event");
    assert.equal(survey.namesOffOn, "2028-11-01");
    assert.equal(survey.firstSentAt, null);
    assert.deepEqual(survey.auto, {
      when: "standard",
      hours: 12,
      reminder: true,
      showCode: true,
      missed: true,
      pending: true,
      remindedAt: null,
      skipped: { send: null, remind: null },
    });
    assert.deepEqual(w.world.mail, []);
    const surveyCodes = () =>
      w.world.db.paths().filter((path) => path.startsWith("trackedLinks/") && w.world.db.read(path).destination === `/events/${EVENT_ID}/survey`);
    assert.deepEqual(surveyCodes(), [], "a code was minted before the survey opened");
    // Once: a second press finds the one it made.
    assert.deepEqual(await setUp.setUpEventSurvey(w.world.db, EVENT_ID, "zach", MORNING), { ok: true, surveyId: id, made: false });
    assert.equal(w.surveyIds().length, 1);
  });

  test("its own questions, everyone with a place, a number of hours: as the step chose", async (t) => {
    clock(t, MORNING);
    const items = after.settingsOf(setting()).items.slice(0, 2);
    world({ items, who: "signups", when: "after", hours: 30, reminder: false, showCode: false });
    const survey = w.survey(await setItUp());
    assert.deepEqual(survey.items.map((item) => item.id), ["q_ev_how", "q_ev_again"]);
    assert.equal(survey.intro, "Thanks for coming on Sunday. 2 quick questions, about a minute.");
    assert.deepEqual(survey.audience, { kind: "event-signups", eventId: EVENT_ID });
    assert.deepEqual([survey.auto.when, survey.auto.hours, survey.auto.reminder, survey.auto.showCode, survey.auto.missed], ["after", 30, false, false, false]);
  });

  test("none for an event with no setting (one made before the step), one switched off, or one more than a week over", async (t) => {
    clock(t, MORNING);
    w.reset(eventSurveySeed());
    assert.deepEqual(await setUp.setUpEventSurvey(w.world.db, EVENT_ID, "zach", MORNING), { ok: true, surveyId: null, made: false });
    world({ on: false });
    assert.deepEqual(await setUp.setUpEventSurvey(w.world.db, EVENT_ID, "zach", MORNING), { ok: true, surveyId: null, made: false });
    world();
    const late = await setUp.setUpEventSurvey(w.world.db, EVENT_ID, "zach", new Date(END.getTime() + 8 * DAY));
    assert.equal(late.ok, false);
    assert.deepEqual(w.surveyIds(), []);
  });

  test("the publish route sets it up as it publishes, and says so when it could not; the event is published either way", async (t) => {
    clock(t, MORNING);
    world({}, { status: "approved", visibility: "public", announce: false });
    const publish = (await w.route("events/[id]/publish")).POST;
    const published = await w.call("zach", publish, { id: EVENT_ID });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.surveyNotSetUp, undefined);
    const survey = await records.eventSurveyOf(w.world.db, EVENT_ID);
    assert.ok(survey?.auto, "publishing set up no survey");
    // A question the survey can't be set up with: published, and told.
    world({ items: [{ kind: "question", id: "q_mine", type: "shortText", title: "", body: [], required: false }] }, { status: "approved", visibility: "public", announce: false });
    const told = await w.call("zach", publish, { id: EVENT_ID });
    assert.equal(told.status, 200);
    assert.equal(w.world.db.read(`events/${EVENT_ID}`).status, "published");
    assert.match(told.body.surveyNotSetUp, /^Question 1: This question needs a title\.$/);
    assert.equal(await records.eventSurveyOf(w.world.db, EVENT_ID), null);
  });
});

// ---------------------------------------------------------------------------
// 3. The job
// ---------------------------------------------------------------------------

describe("the event-surveys job: opens it at the start, emails it when due, reminds once, each step once", () => {
  test("ships switched off, as every job that emails", () => {
    assert.equal(job.id, "event-surveys");
    assert.equal(job.enabledByDefault, false);
    assert.equal(job.maxLateHours, 24);
  });

  test("12 hours after it ends: opens at the start, emails the people who came, signed by the event's author; reminds 3 days later", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    // Before the start: nothing.
    await tick(MORNING);
    assert.equal(w.survey(id).firstSentAt, null);
    // At the start: open, and its code made; nobody emailed.
    setTime(t, DURING);
    await tick(DURING);
    assert.ok(w.survey(id).firstSentAt, "it did not open at the start");
    assert.ok(w.world.db.read("trackedLinks/vr-survey"), "its code was not made when it opened");
    assert.deepEqual(w.world.mail, []);
    // Kofi answers with the QR code at the end of the event.
    setTime(t, new Date(END.getTime() - HOUR));
    assert.equal((await answerSignedIn("kofi", id)).status, 200);
    // An hour before it is due: nothing.
    setTime(t, new Date(DUE.getTime() - HOUR));
    await tick(new Date(DUE.getTime() - HOUR));
    assert.deepEqual(w.world.mail, []);
    // Due: the people who came with an address, less Kofi, who answered. The door was never opened, so nobody is asked about not coming.
    setTime(t, DUE);
    const done = await tick(DUE);
    assert.equal(done.processed, 4);
    const sent = mail();
    assert.deepEqual(sent.map((message) => [message.to, message.kind, message.surface]), [
      ["gwen@example.com", "notice", "event-survey"],
      ["mo@example.com", "notice", "event-survey"],
      ["rosa@example.com", "notice", "event-survey"],
      ["wren@example.com", "notice", "event-survey"],
    ]);
    assert.equal(sent[0].subject, "How was VR games night?");
    assert.match(sent[0].text, /Iris For NAISI/, "the job's email is not signed by the event's author");
    const first = w.survey(id).presses.find((press) => press.kind === "first");
    assert.deepEqual([first.count, first.byJob, first.byUid], [4, true, "event-surveys"]);
    assert.equal(await records.missedSurveyOf(w.world.db, { id, audience: { eventId: EVENT_ID } }), null);
    // One marker, stamped; a second tick sends nothing.
    assert.deepEqual(markers().map(([markerId, marker]) => [markerId, Boolean(marker.sentAt)]), [[`evsurvey__${id}__send`, true]]);
    w.world.mail.length = 0;
    await tick(new Date(DUE.getTime() + 15 * 60_000));
    assert.deepEqual(w.world.mail, []);
    // Gwen answers by their link; 3 days on, the three who haven't are reminded, once.
    const remindAt = new Date(DUE.getTime() + 3 * DAY);
    setTime(t, new Date(remindAt.getTime() - HOUR));
    await tick(new Date(remindAt.getTime() - HOUR));
    assert.deepEqual(w.world.mail, []);
    const gwenRow = w.rowOf(id, RSVP.gwen);
    w.world.db.poke(`surveyPeople/${id}__g_${RSVP.gwen}`, { ...gwenRow, answered: true });
    setTime(t, remindAt);
    await tick(remindAt);
    assert.deepEqual(mail().map((message) => message.to).sort(), ["mo@example.com", "rosa@example.com", "wren@example.com"]);
    assert.match(mail()[0].subject, /^A reminder: /);
    assert.ok(w.survey(id).auto.remindedAt, "the reminder was not recorded");
    assert.equal(w.survey(id).auto.pending, false, "the job is not finished with it");
    w.world.mail.length = 0;
    await tick(new Date(remindAt.getTime() + DAY));
    assert.deepEqual(w.world.mail, [], "a second reminder went");
    assert.deepEqual(markers().map(([markerId]) => markerId).sort(), [`evsurvey__${id}__remind`, `evsurvey__${id}__send`]);
  });

  test("the question about not coming: only where the door was opened, to the people with a place who weren't checked in", async (t) => {
    clock(t, MORNING);
    world({}, DOOR);
    const id = await setItUp();
    setTime(t, DURING);
    await tick(DURING);
    setTime(t, DUE);
    await tick(DUE);
    const sent = mail();
    const chloe = sent.filter((message) => message.to === "chloe@example.com");
    assert.equal(chloe.length, 1, "Chloe, who had a place and didn't come, was not asked");
    assert.equal(chloe[0].subject, "Sorry we missed you at VR games night");
    assert.match(chloe[0].text, /You had a place at VR games night on Sunday, and you weren’t checked in at the door\. One quick question\./);
    assert.deepEqual(chloe.map((message) => [message.kind, message.surface]), [["notice", "event-survey"]]);
    // Nobody who came is asked it, and nobody without a place.
    assert.equal(sent.length, 6);
    const missed = await records.missedSurveyOf(w.world.db, { id, audience: { eventId: EVENT_ID } });
    assert.equal(missed.id, `${id}-missed`);
    assert.deepEqual(missed.audience, { kind: "event-missed", eventId: EVENT_ID });
    assert.deepEqual(missed.items.map((item) => [item.id, item.title]), [["q_ev_missed_why", "What stopped you coming?"]]);
    assert.equal(missed.closesAt.toISOString(), w.survey(id).closesAt.toISOString());
    // The event's survey is still the event's survey.
    assert.equal((await records.eventSurveyOf(w.world.db, EVENT_ID)).id, id);
    // It is answered from its email alone, never signed in with the QR code.
    assert.equal((await answerSignedIn("chloe", missed.id)).status, 404);
  });

  test("the question about not coming skips somebody with a place who answered the survey with its QR code: they came, and the door missed them", async (t) => {
    clock(t, MORNING);
    world({}, DOOR);
    const id = await setItUp();
    setTime(t, DURING);
    await tick(DURING);
    // Chloe had a place, wasn't checked in, and answered with the code at the end.
    setTime(t, new Date(END.getTime() - HOUR));
    assert.equal((await answerSignedIn("chloe", id)).status, 200);
    setTime(t, DUE);
    await tick(DUE);
    assert.deepEqual(mail().filter((message) => message.to === "chloe@example.com"), [], "somebody who answered was asked why they didn't come");
    assert.equal(await records.missedSurveyOf(w.world.db, { id, audience: { eventId: EVENT_ID } }), null, "a question about not coming was made for nobody");
  });

  test("a different number of whole hours; by hand only, it never goes by itself, and its reminder follows the hand", async (t) => {
    clock(t, MORNING);
    world({ when: "after", hours: 30 });
    const id = await setItUp();
    for (const at of [DURING, DUE, new Date(END.getTime() + 29 * HOUR)]) {
      setTime(t, at);
      await tick(at);
    }
    assert.deepEqual(w.world.mail, [], "it went before its 30 hours");
    const due = new Date(END.getTime() + 30 * HOUR);
    setTime(t, due);
    await tick(due);
    assert.equal(mail().length, 5);
    assert.equal(w.survey(id).presses.find((press) => press.kind === "first")?.at?.toISOString(), due.toISOString(), "it went at another time than its 30 hours");

    world({ when: "hand" });
    const hand = await setItUp();
    for (const at of [DURING, DUE, new Date(END.getTime() + 5 * DAY)]) {
      setTime(t, at);
      await tick(at);
    }
    assert.deepEqual(w.world.mail, [], "a survey sent only by hand went by itself");
    assert.ok(w.survey(hand).firstSentAt, "it did not open at the start");
    // Sent by hand on Tue 3 Nov at 10am: its one reminder goes 3 days after that.
    const pressed = new Date("2026-11-03T10:00:00Z");
    setTime(t, pressed);
    const count = await w.call("iris", (await route("/send")).POST, { id: EVENT_ID }, { body: { emails: 5 } });
    assert.equal(count.status, 200, JSON.stringify(count.body));
    w.world.mail.length = 0;
    setTime(t, new Date(pressed.getTime() + 3 * DAY - HOUR));
    await tick(new Date(pressed.getTime() + 3 * DAY - HOUR));
    assert.deepEqual(w.world.mail, []);
    setTime(t, new Date(pressed.getTime() + 3 * DAY));
    await tick(new Date(pressed.getTime() + 3 * DAY));
    assert.equal(mail().length, 5);
    assert.match(mail()[0].text, /Iris For NAISI/);
  });

  test("late, the job off when it was due: nothing goes by itself, and it says so; Send it now still can", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    const late = new Date(DUE.getTime() + 2 * DAY);
    setTime(t, late);
    await tick(late);
    assert.ok(w.survey(id).firstSentAt, "opening late was refused");
    assert.deepEqual(w.world.mail, []);
    assert.equal(w.survey(id).auto.skipped.send, "stale");
    const tab = await w.page(TAB, props(), "iris");
    assert.match(tab.text, /It didn’t go by itself: sending by itself wasn’t running here then\./);
    assert.match(tab.text, /Send it now \(5\)/);
  });

  test("an event published before the step, cancelled or deleted: nothing goes by itself", async (t) => {
    clock(t, MORNING);
    w.reset(eventSurveySeed());
    await tick(DUE);
    assert.deepEqual(w.surveyIds(), []);
    world();
    const id = await setItUp();
    w.world.db.poke(`events/${EVENT_ID}`, { status: "cancelled" });
    setTime(t, DUE);
    await tick(DUE);
    assert.deepEqual(w.world.mail, []);
    assert.deepEqual([w.survey(id).auto.pending, w.survey(id).auto.skipped.send], [false, "cancelled"]);
    world();
    const gone = await setItUp();
    await w.world.db.collection("events").doc(EVENT_ID).delete();
    await tick(DUE);
    assert.deepEqual(w.world.mail, []);
    assert.equal(w.survey(gone).auto.skipped.send, "gone");
  });

  test("two ticks at once send it once; a tick racing an organiser's Send it now sends once", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    setTime(t, DURING);
    await tick(DURING);
    setTime(t, DUE);
    await Promise.all([tick(DUE), tick(DUE)]);
    assert.equal(mail().length, 5);
    assert.equal(w.survey(id).presses.filter((press) => press.kind === "first").length, 1);

    world();
    await setItUp();
    setTime(t, DURING);
    await tick(DURING);
    setTime(t, DUE);
    await Promise.all([tick(DUE), w.call("iris", (await route("/send")).POST, { id: EVENT_ID }, { body: { emails: 5 } })]);
    assert.equal(mail().length, 5, "the survey went twice");
  });

  test("an admin's Remind on the survey's own page was its one reminder: the job sends none", async () => {
    const at = new Date("2026-11-02T05:00:00Z");
    const survey = {
      auto: { when: "standard", hours: 12, reminder: true, showCode: true, missed: false, pending: true, remindedAt: null, skipped: { send: null, remind: null } },
      firstSentAt: START,
      closedAt: null,
      closesAt: new Date("2026-11-08T17:00:00Z"),
      presses: [{ id: "p1", kind: "first", at, count: 5, byJob: true }],
    };
    const times = after.timesOf({ startAt: START, endAt: END }, survey.auto);
    const later = new Date(at.getTime() + 3 * DAY);
    assert.deepEqual(after.dueStep(survey, times, later), { step: "remind", dueAt: later });
    const reminded = { ...survey, presses: [...survey.presses, { id: "p2", kind: "remind", at: new Date(at.getTime() + DAY), count: 3, byUid: "zach" }] };
    assert.equal(after.dueStep(reminded, times, later), null);
    assert.equal(after.stillPending(reminded, later), false);
    // Nothing is due before its time, and nothing once it has closed.
    assert.equal(after.dueStep(survey, times, new Date(later.getTime() - 1)), null);
    assert.equal(after.dueStep(survey, times, new Date("2026-11-09T00:00:00Z")), null);
    assert.equal(after.stillPending(survey, new Date("2026-11-09T00:00:00Z")), false);
  });

  test("the survey's words follow the event until it opens", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    w.world.db.poke(`events/${EVENT_ID}`, { title: "VR and board games night", startAt: new Date("2026-11-02T18:00:00Z"), endAt: new Date("2026-11-02T21:00:00Z") });
    await tick(MORNING);
    const survey = w.survey(id);
    assert.equal(survey.name, "After VR and board games night");
    assert.equal(survey.intro, "Thanks for coming on Monday. 5 quick questions, about a minute.");
    assert.equal(survey.closesAt.toISOString(), "2026-11-09T21:00:00.000Z");
    // Due 12 hours after the new end, not the old.
    setTime(t, DUE);
    await tick(DUE);
    assert.deepEqual(w.world.mail, []);
  });
});

// ---------------------------------------------------------------------------
// 4. The routes, as every caller
// ---------------------------------------------------------------------------

describe("the Survey after tab's routes: the event's author, its collaborators and admins, and nobody else", () => {
  const CALLERS = [
    [null, 401],
    ["kofi", 403],
    ["ines", 403],
    ["sue", 404],
  ];

  test("change, Send it now and the test: refused before anything is read or written, but to the organisers and admins", async (t) => {
    clock(t, MORNING);
    world();
    await setItUp();
    const before = w.everything();
    for (const [path, method, body] of [
      ["", "PATCH", setting({ items: after.settingsOf(setting()).items })],
      ["/send", "POST", { emails: 0 }],
      ["/test", "POST", {}],
    ]) {
      const handler = (await route(path))[method];
      for (const [who, status] of CALLERS) {
        assert.equal((await w.call(who, handler, { id: EVENT_ID }, { body })).status, status, `${path} ${who}`);
      }
      assert.equal((await w.call("zach", handler, { id: EVENT_ID }, { body, viewAs: true })).status, 403, `${path} during view-as`);
      assert.equal((await w.call("zach", handler, { id: "no-such-event" }, { body })).status, 404, `${path} for no event`);
    }
    assert.equal(w.everything(), before, "a refused caller wrote something");
    assert.deepEqual(w.world.mail, []);
  });

  test("Send it now: from the event's start, the number on the button, once; the job then sends nothing but the reminder", async (t) => {
    clock(t, MORNING);
    world({}, DOOR);
    const id = await setItUp();
    const send = (await route("/send")).POST;
    const before = await w.call("cal", send, { id: EVENT_ID }, { body: { emails: 6 } });
    assert.deepEqual([before.status, before.body.error], [409, "The event hasn’t started yet, so there’s nobody to ask how it went."]);
    setTime(t, new Date(END.getTime() + HOUR));
    const wrong = await w.call("cal", send, { id: EVENT_ID }, { body: { emails: 3 } });
    assert.deepEqual([wrong.status, wrong.body.emails], [409, 6]);
    assert.deepEqual(w.world.mail, []);
    const sent = await w.call("cal", send, { id: EVENT_ID }, { body: { emails: 6 } });
    assert.deepEqual(sent, { status: 200, body: { ok: true, sent: 6, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });
    assert.equal(mail().filter((message) => message.to === "chloe@example.com").length, 1);
    assert.ok(mail().every((message) => message.kind === "notice" && message.surface === "event-survey"));
    assert.match(mail()[0].text, /Cal For NAISI/, "a person's press is not signed by them");
    const again = await w.call("zach", send, { id: EVENT_ID }, { body: { emails: 0 } });
    assert.equal(again.status, 409);
    // The job finds it gone: nothing more but the reminder.
    w.world.mail.length = 0;
    setTime(t, DUE);
    await tick(DUE);
    assert.deepEqual(w.world.mail, []);
    assert.equal(w.survey(id).presses.filter((press) => press.kind === "first").length, 1);
  });

  test("the setting after publishing: its questions until it opens, who and when until it goes; switched off before it opens, its draft goes", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    const patch = (await route("")).PATCH;
    const items = after.settingsOf(setting()).items;
    const save = (who, over) => w.call(who, patch, { id: EVENT_ID }, { body: setting({ items, ...over }) });
    // Before it opens, everything; the event keeps the setting too.
    assert.deepEqual(await save("iris", { items: items.slice(1), who: "signups", when: "after", hours: 20 }), { status: 200, body: { ok: true } });
    assert.deepEqual(w.survey(id).items.map((item) => item.id), ["q_ev_again", "q_ev_next_text", "q_ev_heard", "q_ev_change"]);
    assert.deepEqual(w.survey(id).audience.kind, "event-signups");
    assert.deepEqual([w.survey(id).auto.when, w.survey(id).auto.hours], ["after", 20]);
    assert.equal(w.world.db.read(`events/${EVENT_ID}`).surveyAfter.hours, 20);
    // A bad setting is refused whole.
    assert.equal((await w.call("iris", patch, { id: EVENT_ID }, { body: { on: true } })).status, 400);
    assert.equal((await save("iris", { hours: 200, when: "after" })).status, 400);
    // Opened: its questions are fixed; who and when are not, until it goes.
    setTime(t, DURING);
    await tick(DURING);
    const fixed = await save("cal", { items, who: "signups", when: "after", hours: 20 });
    assert.deepEqual([fixed.status, fixed.body.error], [409, "Its questions are fixed now it has opened."]);
    assert.equal((await save("cal", { items: w.survey(id).items, who: "came", when: "standard" })).status, 200);
    assert.equal((await save("cal", { items: w.survey(id).items, on: false })).status, 409, "switched off once open");
    // Gone: who and when are fixed; the code's switch still changes.
    setTime(t, DUE);
    await tick(DUE);
    const gone = await save("zach", { items: w.survey(id).items, who: "signups" });
    assert.deepEqual([gone.status, gone.body.error], [409, "It has gone, so who got it and when it went are fixed."]);
    assert.equal((await save("zach", { items: w.survey(id).items, showCode: false })).status, 200);
    assert.equal(w.survey(id).auto.showCode, false);
    // Switched off before it opens: the draft goes, and nothing goes by itself.
    world();
    const draft = await setItUp();
    assert.equal((await save("iris", { on: false })).status, 200);
    assert.equal(w.survey(draft), undefined);
    assert.equal(w.world.db.read(`events/${EVENT_ID}`).surveyAfter.on, false);
    // Switched back on, it is set up again.
    assert.equal((await save("iris", { on: true })).status, 200);
    assert.ok(await records.eventSurveyOf(w.world.db, EVENT_ID));
  });

  test("an admin's survey from Surveys is run from there: the organisers' routes leave it alone", async (t) => {
    clock(t, MORNING);
    w.reset(eventSurveySeed());
    const made = await w.make("zach");
    assert.equal(made.status, 200);
    setTime(t, new Date(END.getTime() + HOUR));
    const sent = await w.call("iris", (await route("/send")).POST, { id: EVENT_ID }, { body: { emails: 5 } });
    assert.deepEqual([sent.status, sent.body.error], [409, "An admin made this event’s survey from Surveys, so it’s sent from there."]);
    // And the job never touches it.
    await tick(DUE);
    assert.deepEqual(w.world.mail, []);
  });

  test("Send a test to me: to the presser's own address, marked as a test, recorded nowhere", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    const test = (await route("/test")).POST;
    const sent = await w.call("iris", test, { id: EVENT_ID }, { body: {} });
    assert.deepEqual(sent, { status: 200, body: { ok: true, delivery: "sent" } });
    assert.deepEqual(w.world.mail.map((message) => [message.to, message.kind]), [["iris@example.com", "course-test"]]);
    assert.match(w.world.mail[0].subject, /^\[TEST\] /);
    assert.deepEqual(w.survey(id).tests, { survey: null, reminder: null });
  });
});

// ---------------------------------------------------------------------------
// 5. The tabs
// ---------------------------------------------------------------------------

describe("the event's tabs: what is set and what went for everybody in the events area; the setting and Send it now for its organisers; results for admins", () => {
  test("before it goes: what is set, and while the job is off, that nothing goes by itself", async (t) => {
    clock(t, MORNING);
    world();
    await setItUp();
    const iris = await w.page(TAB, props(), "iris");
    assert.match(iris.text, /It’s set to go on Mon 2 Nov at 5am to everyone who came, once sending by itself is switched on here\./);
    // The organisers' setting, its questions and its two cards.
    for (const words of ["Ask people how it went", "How was it?", "Who gets it", "When it goes", "One reminder 3 days later", "Show its QR code at the end of the event", "Save"]) {
      assert.ok(iris.text.includes(words), `the organiser was not shown "${words}"`);
    }
    assert.match(iris.text, /You can send it from here once the event has started\./);
    // The switch on: it says it goes by itself.
    w.world.db.seed("config/scheduler", { jobs: { "event-surveys": { enabled: true } } });
    assert.match((await w.page(TAB, props(), "sue")).text, /It goes by itself on Mon 2 Nov at 5am to everyone who came\./);
    // SU-recognised committee who don't organise it: the lines, never the setting.
    const sue = await w.page(TAB, props(), "sue");
    assert.ok(!sue.text.includes("Ask people how it went"), "somebody who doesn't organise it was given its setting");
  });

  test("after it went: sent by itself, when, to how many; never a result to the organisers; results for an admin", async (t) => {
    clock(t, MORNING);
    world({}, DOOR);
    const id = await setItUp();
    setTime(t, DURING);
    await tick(DURING);
    setTime(t, new Date(END.getTime() - HOUR));
    await answerSignedIn("kofi", id);
    setTime(t, DUE);
    await tick(DUE);
    for (const who of ["iris", "cal", "sue"]) {
      const page = await w.page(TAB, props(), who);
      assert.match(page.text, /Sent by itself, Mon 2 Nov, 5am, to the 4 who came\./, who);
      assert.match(page.text, /The question about not coming went to the 1 person who had a place and wasn’t checked in\./, who);
      for (const secret of ["A quiz night", "Answers", "1 with the QR code", "Kofi", "Answered"]) {
        assert.ok(!page.text.includes(secret), `${who} was shown "${secret}"`);
      }
      assert.ok(!/Send it now/.test(page.text), `${who} was offered to send it again`);
    }
    const admin = await w.page(TAB, props(), "zach");
    assert.match(admin.text, /A quiz night|1 Answers/);
    // An admin is led to the question about not coming, a survey of its own; nobody else is.
    assert.match(admin.html, new RegExp(`href="/admin/surveys/${id}-missed/send"`));
    for (const who of ["iris", "cal", "sue"]) assert.ok(!(await w.page(TAB, props(), who)).html.includes(`${id}-missed`), who);
  });

  test("the Check-in tab shows its code to whoever runs the door, while it takes answers, where the step left the code on", async (t) => {
    clock(t, MORNING);
    world();
    const id = await setItUp();
    const before = await w.page(CHECK_IN, props(), "sue");
    assert.ok(before.text.includes("The survey’s QR code Its QR code shows here once the survey opens"), before.text);
    setTime(t, DURING);
    await tick(DURING);
    const open = await w.page(CHECK_IN, props(), "sue");
    assert.ok(open.text.includes("The survey’s QR code naisi.invalid/q/vr-survey Download PNG Show full screen"));
    for (const who of ["iris", "cal"]) assert.ok(!(await w.page(CHECK_IN, props(), who)).html.includes("vr-survey"), who);
    // The step's switch off: no code, for anybody, and no picture of it.
    w.world.db.poke(`surveys/${id}`, { auto: { ...w.survey(id).auto, showCode: false } });
    assert.ok(!(await w.page(CHECK_IN, props(), "sue")).html.includes("vr-survey"));
    const qr = (await w.route("links/[slug]/qr")).GET;
    assert.equal((await w.call("sue", qr, { slug: "vr-survey" })).status, 403);
    assert.equal((await w.call("zach", qr, { slug: "vr-survey" })).status, 200);
    assert.equal(textOf(""), "");
  });
});
