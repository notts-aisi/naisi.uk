/**
 * Asking people to facilitate (boards st-facilitators and st-fac-ask-phone,
 * Q6 option B, Q21): the Facilitators view's read, asking with a test first
 * and a count, reminding, asking somebody else, the answer, the training, and
 * the rule that nobody facilitates a programme they take part in.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Real: every handler, the libraries behind them, the access predicates and
 * the email template. Stubbed: `server-only`, `next/server`, the Admin SDK's
 * sentinels and handle (`tests/lib/applicationsStore.mjs`), the session, the
 * view-as guard and the mail door, which records what it is handed. The clock
 * is the suite's: Mon 26 Oct 2026 at 12pm in London unless a test moves it.
 *
 * Callers: an admin, the programme's lead, another programme's lead, its
 * reviewer, the run's track lead, a facilitator of another group, the person
 * asked, another person, a member on nothing, and somebody signed out.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { applicationDoc } from "./lib/applicationsSmallTerm.mjs";
import {
  A,
  AGI_PARAMS,
  B,
  C,
  NOW,
  REPLY_BY,
  REPLY_BY_INSTANT,
  ROUND,
  RUN,
  SECRET,
  SET,
  askSeed,
  formPath,
  loadAskRoutes,
} from "./lib/facilitatorAskWorld.mjs";

const made = makeWorld("__facilitatorAsks");
const { world, reset, call, everything } = made;
const routes = await loadAskRoutes(made);

/** Start from the world at `at`, the store's clock and the suite's agreeing. */
function begin(t, { at = NOW, over = {} } = {}) {
  // A test may start again from the world: the clock is set afresh each time.
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ["Date"], now: at });
  reset(askSeed(over), { now: () => new Date() });
}

const run = { runId: RUN.agi };
const asking = (who) => call(who, routes.asking.GET, run, { course: true });
const test_ = (who, body) => call(who, routes.test.POST, AGI_PARAMS, { body });
const ask = (who, body) => call(who, routes.ask.POST, AGI_PARAMS, { body });
const remind = (who, body) => call(who, routes.remind.POST, AGI_PARAMS, { body });
const training = (who, body) => call(who, routes.training.PUT, AGI_PARAMS, { body });
const answer = (who, askId, reply) =>
  call(who, routes.answer.POST, { askId }, { body: { answer: reply }, course: true });

/** The first Monday-free ask of the suite: Omar, for Group B, answering by Wed 28 Oct at 12pm. */
const OMAR_B = { uid: "omar", groupId: B, replyBy: REPLY_BY };

/** A test, then the ask, as the view makes them. Answers the ask's response. */
async function testThenAsk(who, body = OMAR_B, extra = {}) {
  const tested = await test_(who, { uid: body.uid, groupId: body.groupId, replyBy: body.replyBy });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  return ask(who, { ...body, emails: 1, ...extra });
}

/** Every ask on the run, as stored. */
const asksStored = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseFacilitating/"))
    .map((path) => ({ path, ...world.db.read(path) }))
    .filter((doc) => doc.kind === "ask");

/** The words of the one email a message carries, as the template was handed them. */
function wordsOf(message) {
  const email = message.react.props.email;
  return { subject: message.subject, greeting: email.greeting, paragraphs: email.paragraphs, buttons: email.buttons, signOff: email.signOff };
}

// ---------------------------------------------------------------------------
// 1. Who may
// ---------------------------------------------------------------------------

describe("1. who may read the view, ask, remind, set the training and answer", () => {
  test("the view's read: the programme's lead and an admin; a reviewer is refused; everybody else is told there is no programme", async (t) => {
    begin(t);
    assert.equal((await asking("claudia")).status, 200);
    assert.equal((await asking("zach")).status, 200);
    assert.equal((await asking("lloyd")).status, 403, "the programme's reviewer");
    for (const who of ["tess", "yusuf", "rahul", "omar", "nobody"]) {
      const answered = await asking(who);
      assert.equal(answered.status, 404, who);
      assert.equal(answered.body.error, "There is no programme here.");
    }
    assert.equal((await asking(null)).status, 401);
  });

  test("asking, the test, reminding and the training: only the lead and an admin, and nothing is written for anybody else", async (t) => {
    begin(t);
    const before = everything();
    for (const [who, status] of [
      ["lloyd", 403],
      ["tess", 404],
      ["yusuf", 404],
      ["rahul", 404],
      ["nobody", 404],
    ]) {
      assert.equal((await test_(who, OMAR_B)).status, status, `${who}: test`);
      assert.equal((await ask(who, { ...OMAR_B, emails: 1 })).status, status, `${who}: ask`);
      assert.equal((await remind(who, { askId: "no-such-ask", emails: 1 })).status, status, `${who}: remind`);
      assert.equal(
        (await training(who, { training: { dateKey: "2026-10-28", time: "18:00", room: "Room B5" } })).status,
        status,
        `${who}: training`,
      );
    }
    assert.equal((await ask(null, { ...OMAR_B, emails: 1 })).status, 401);
    assert.equal(everything(), before, "a refused caller wrote something");
    assert.equal(world.mail.length, 0, "a refused caller emailed somebody");
  });

  test("the lead asks, as an admin does", async (t) => {
    begin(t);
    const asked = await testThenAsk("claudia");
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    begin(t);
    const byAdmin = await testThenAsk("zach");
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
  });

  test("a body that cannot be an ask is refused before anything is read", async (t) => {
    begin(t);
    world.db.stats.reads = 0;
    for (const body of [{}, { ...OMAR_B }, { ...OMAR_B, emails: "1" }, { ...OMAR_B, replyBy: { dateKey: "2026-02-30", time: "12:00" }, emails: 1 }]) {
      const answered = await ask("claudia", body);
      assert.equal(answered.status, 400, JSON.stringify(body));
    }
    assert.equal(world.db.stats.reads, 0, "a bad body was read past");
  });

  test("view-as is turned away first, from every press", async (t) => {
    begin(t);
    const before = everything();
    for (const [route, params, body, course] of [
      [routes.ask.POST, AGI_PARAMS, { ...OMAR_B, emails: 1 }, false],
      [routes.test.POST, AGI_PARAMS, OMAR_B, false],
      [routes.remind.POST, AGI_PARAMS, { askId: "x", emails: 1 }, false],
      [routes.training.PUT, AGI_PARAMS, { training: null }, false],
      [routes.answer.POST, { askId: "x" }, { answer: "yes" }, true],
    ]) {
      const answered = await call("zach", route, params, { body, course, viewAs: true });
      assert.equal(answered.status, 403);
    }
    assert.equal(everything(), before);
  });

  test("only the person asked can answer: anybody else is told there is no ask", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    for (const who of ["zach", "claudia", "rahul", "wen", "nobody"]) {
      const answered = await answer(who, body.askId, "yes");
      assert.equal(answered.status, 404, who);
      assert.equal(answered.body.error, "There is no ask here.");
    }
    assert.equal((await answer(null, body.askId, "yes")).status, 401);
    assert.equal(asksStored()[0].answer, null, "somebody answered for Omar");
  });
});

// ---------------------------------------------------------------------------
// 2. The view's read
// ---------------------------------------------------------------------------

describe("2. the Facilitators view's read", () => {
  test("the groups in the board's order, their short times, and who facilitates each", async (t) => {
    begin(t);
    const { body } = await asking("claudia");
    assert.deepEqual(
      body.groups.map((group) => [group.name, group.short, group.facilitators.map((f) => f.name)]),
      [
        ["Group B", "Tue 6pm", ["Rahul Mehta", "Sofia Rossi"]],
        ["Group C", "Wed 1pm", ["Tom Fletcher"]],
        ["Group A", "Thu 6pm", ["Sofia Rossi"]],
      ],
    );
    assert.equal(body.headline, "3 facilitators for 3 groups");
  });

  test("the people who'd like to facilitate AGI Strategy, from the form, with where each stands", async (t) => {
    begin(t);
    const { body } = await asking("claudia");
    const said = Object.fromEntries(
      body.people.map((person) => [person.uid, [person.status.chip?.words ?? null, person.status.note, person.status.ask]]),
    );
    assert.deepEqual(said, {
      omar: ["No offer this time", null, "button"],
      wen: ["Taking part in another programme", null, "button"],
      nina: ["Gave their place back", null, "button"],
      amara: ["Taking part in AGI Strategy", "Can’t facilitate a programme they’re taking part in", "none"],
      ines: ["Invited to AGI Strategy", "Can’t be asked until they answer their invitation", "none"],
    });
    assert.ok(!("tariq" in said), "somebody who chose only Technical AI Safety is listed");
    assert.ok(!("dev" in said), "somebody who said no to facilitating is listed");
  });

  test("the columns are the live form's own facilitator questions, the one that picks the programme left out", async (t) => {
    begin(t);
    const { body } = await asking("claudia");
    assert.deepEqual(
      body.columns.map((column) => [column.header, column.look]),
      [
        ["Have you done this course, or something like it, before?", "plain"],
        ["If so, which?", "quote"],
        ["Have you led a discussion, taught or tutored before? Tell us in a line or two.", "quote"],
        [
          "Pick one article, video or post you’d want a group of newcomers to discuss. Link it, and write the first question you’d ask the group.",
          "quote",
        ],
        ["A newcomer says: “Why worry about chatbots?” Answer them the way you’d say it out loud.", "quote"],
        ["Can you be there every week?", "plain"],
      ],
    );
    const omar = body.people.find((person) => person.uid === "omar");
    assert.equal(omar.answers[`${SET}/led`], "I ran the chess club’s Tuesday sessions for a year.");
    assert.equal(omar.answers[`${SET}/everyWeek`], "Yes, I’m confident");
    assert.equal(omar.detail, "BSc Mathematics · Graduating 2028");
  });

  test("nothing else of any application reaches the view, and no address", async (t) => {
    begin(t);
    const { body } = await asking("claudia");
    const text = JSON.stringify(body);
    assert.ok(!text.includes("@"), "an address reached the lead");
    for (const elsewhere of [
      "I keep changing my mind about timelines.",
      "The EU code of practice came into force.",
      "A probe for refusal directions.",
      "I want to know which arguments survive.",
    ]) {
      assert.ok(!text.includes(elsewhere), `an answer from outside the facilitator questions reached the view: ${elsewhere}`);
    }
  });

  test("the viewer's own application is in no list: an admin who would facilitate is shown to the lead, not to themselves", async (t) => {
    const mine = applicationDoc("zach", ["agi-strategy"]);
    mine.sent = {
      ...mine.sent,
      wantsToFacilitate: true,
      answers: { ...mine.sent.answers, [SET]: { which: "AGI Strategy", article: "The admin's own answer." } },
    };
    begin(t, { over: { [`admissionApplications/${ROUND}__zach`]: mine } });
    const asLead = (await asking("claudia")).body.people.map((person) => person.uid);
    const asAdmin = (await asking("zach")).body.people.map((person) => person.uid);
    assert.ok(asLead.includes("zach"));
    assert.ok(!asAdmin.includes("zach"), "the admin was shown their own application");
  });

  test("before decisions have gone out, nobody can be asked", async (t) => {
    begin(t);
    world.db.poke(formPath, { decisionsSentAt: null });
    const { body } = await asking("claudia");
    assert.equal(body.decisionsSent, false);
    assert.ok(body.people.every((person) => person.status.ask !== "button"));
    const refused = await ask("claudia", { ...OMAR_B, emails: 1 });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /once decisions have gone out/);
  });
});

// ---------------------------------------------------------------------------
// 3. The send
// ---------------------------------------------------------------------------

describe("3. asking, reminding and asking someone else, each email counted and read word for word", () => {
  test("an ask waits for a test of its day and time, and the test goes only to the person asking", async (t) => {
    begin(t);
    const untested = await ask("claudia", { ...OMAR_B, emails: 1 });
    assert.equal(untested.status, 409);
    assert.equal(untested.body.error, "Send yourself a test of this email first. “Send a test to me” does it.");
    assert.equal(world.mail.length, 0);

    const tested = await test_("claudia", OMAR_B);
    assert.equal(tested.status, 200);
    assert.equal(tested.body.delivery, "sent");
    assert.equal(world.mail.length, 1);
    assert.equal(world.mail[0].to, "claudia@example.com");
    assert.equal(world.mail[0].subject, "[TEST] Would you facilitate a group on AGI Strategy?");
    assert.equal(world.mail[0].kind, "course-test");
    assert.equal(asksStored().length, 0, "a test asked somebody");

    // Another day to answer by is a send nobody has read.
    const otherDay = await ask("claudia", { ...OMAR_B, replyBy: { dateKey: "2026-10-29", time: "12:00" }, emails: 1 });
    assert.equal(otherDay.status, 409);
    assert.equal(
      otherDay.body.error,
      "Your last test asked for an answer by Wed 28 Oct at 12pm. Send yourself a test with Thu 29 Oct at 12pm before you ask.",
    );
  });

  test("the button's count is checked: an ask emails one person, and says so", async (t) => {
    begin(t);
    await test_("claudia", OMAR_B);
    for (const emails of [0, 2]) {
      const refused = await ask("claudia", { ...OMAR_B, emails });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "The number of emails on the button is out of date. Look again before you press.");
    }
    assert.equal(world.mail.length, 1, "only the test went");
  });

  test("the ask emails only that person, in the board's words, every value from records", async (t) => {
    begin(t);
    const asked = await testThenAsk("claudia");
    assert.equal(asked.status, 200);
    assert.equal(asked.body.said, "Omar has been asked. The email went.");
    const sent = world.mail.filter((message) => !message.subject.startsWith("[TEST]"));
    assert.equal(sent.length, 1, "the ask emailed more than one person");
    assert.equal(sent[0].to, "omar@example.com");
    assert.equal(sent[0].replyTo, "ai-safety@uonsu.com");
    assert.equal(sent[0].kind, "course-application");
    const link = `https://naisi.invalid/learn/facilitate/${asked.body.askId}`;
    assert.deepEqual(wordsOf(sent[0]), {
      subject: "Would you facilitate a group on AGI Strategy?",
      greeting: "Hi Omar,",
      paragraphs: [
        "You said you’d like to facilitate, and we’d love you to. Would you take Group B of the AGI Strategy Fellowship?",
        "Group B meets on Tuesdays at 6pm in Hallward B12, for 6 weeks from Tue 3 Nov. It’s for up to 8 people.",
        "Please let us know by Wed 28 Oct at 12pm, so we can tell the group.",
      ],
      buttons: [{ label: "Say yes or no", href: link, look: "primary" }],
      signOff: { name: "Claudia", role: "AGI Strategy lead, NAISI" },
    });
    // Stored exactly as it went, so the view shows the email Omar got.
    const [stored] = asksStored();
    assert.equal(stored.delivery, "sent");
    assert.deepEqual(stored.email.paragraphs, wordsOf(sent[0]).paragraphs);
    assert.equal(stored.toName, "Omar Haddad");
    const { body } = await asking("claudia");
    assert.equal(body.email.toName, "Omar Haddad");
    assert.equal(body.email.firstName, "Omar");
    assert.deepEqual(body.email.sent.paragraphs, wordsOf(sent[0]).paragraphs);
  });

  test("with the training set, the email names it; it never carries an address or a meeting link", async (t) => {
    begin(t);
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": "https://meet.example.com/secret-room" });
    assert.equal(
      (await training("claudia", { training: { dateKey: "2026-10-28", time: "18:00", room: "Portland B5" } })).status,
      200,
    );
    await testThenAsk("claudia");
    const sent = world.mail.filter((message) => !message.subject.startsWith("[TEST]"));
    assert.equal(
      wordsOf(sent[0]).paragraphs[2],
      "Training is on Wed 28 Oct at 6pm in Portland B5. You don’t need any experience: we’ll give you everything you need.",
    );
    const all = JSON.stringify(world.mail.map(wordsOf));
    assert.ok(!all.includes("meet.example.com"), "a meeting link reached an email");
    assert.ok(!all.includes("omar@example.com"), "an address was written into an email");
  });

  test("a group with no day and time cannot be named whole, so nothing is sent", async (t) => {
    begin(t);
    world.db.poke(`courseGroups/${C}`, { "session.startTimeLocal": "" });
    const refused = await test_("claudia", { ...OMAR_B, groupId: C });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /^The email can’t be written whole, so nothing was sent: Group C needs a day and time/);
    assert.equal(world.mail.length, 0);
  });

  test("a time to answer by already gone is refused", async (t) => {
    begin(t);
    const refused = await ask("claudia", { ...OMAR_B, replyBy: { dateKey: "2026-10-26", time: "11:00" }, emails: 1 });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, "Choose a day and time to answer by that is still to come.");
  });

  test("Remind emails only that person, with the reminder's line over the ask", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    world.mail.length = 0;
    const reminded = await remind("claudia", { askId: body.askId, emails: 1 });
    assert.equal(reminded.status, 200, JSON.stringify(reminded.body));
    assert.equal(reminded.body.said, "Omar has been reminded. The email went.");
    assert.equal(world.mail.length, 1);
    assert.equal(world.mail[0].to, "omar@example.com");
    const words = wordsOf(world.mail[0]);
    assert.equal(words.subject, "Reminder: Would you facilitate a group on AGI Strategy?");
    assert.equal(words.paragraphs[0], "This is a reminder. We haven’t had your reply yet, and it’s due by Wed 28 Oct at 12pm.");
    assert.equal(
      words.paragraphs[1],
      "You said you’d like to facilitate, and we’d love you to. Would you take Group B of the AGI Strategy Fellowship?",
    );
    // Twelve hours apart.
    const again = await remind("claudia", { askId: body.askId, emails: 1 });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "That person was reminded less than twelve hours ago.");
    assert.equal(world.mail.length, 1);
    // The count is the button's.
    const wrong = await remind("claudia", { askId: body.askId, emails: 2 });
    assert.equal(wrong.status, 409);
  });

  test("on the day to answer by, the reminder says it is due today", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    t.mock.timers.setTime(new Date("2026-10-28T08:00:00Z").getTime());
    world.mail.length = 0;
    const reminded = await remind("claudia", { askId: body.askId, emails: 1 });
    assert.equal(reminded.status, 200);
    assert.equal(wordsOf(world.mail[0]).paragraphs[0], "This is a reminder. We haven’t had your reply yet, and it’s due today, Wed 28 Oct at 12pm.");
  });

  test("Ask someone else asks only the new person, for the same place", async (t) => {
    begin(t);
    const first = await testThenAsk("claudia");
    world.mail.length = 0;
    const other = await ask("claudia", { uid: "wen", groupId: B, replyBy: REPLY_BY, emails: 1, seat: first.body.askId });
    assert.equal(other.status, 200, JSON.stringify(other.body));
    assert.deepEqual(world.mail.map((message) => message.to), ["wen@example.com"]);
    const stored = asksStored().find((doc) => doc.uid === "wen");
    assert.equal(stored.seat, first.body.askId);
    // A place is in one group: it cannot be another group's.
    const wrongGroup = await ask("claudia", { uid: "nina", groupId: A, replyBy: REPLY_BY, emails: 1, seat: first.body.askId });
    assert.equal(wrongGroup.status, 409);
  });

  test("an email that does not go takes its ask back: nobody is asked who was not told", async (t) => {
    begin(t);
    await test_("claudia", OMAR_B);
    world.mailFate = () => "fail";
    const failed = await ask("claudia", { ...OMAR_B, emails: 1 });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error, "The email to Omar didn’t go, so Omar hasn’t been asked. Try again in a moment.");
    assert.equal(asksStored().length, 0);
  });

  test("a held email is said to be held, and the ask stands", async (t) => {
    begin(t);
    await test_("claudia", OMAR_B);
    world.mailFate = () => "held";
    const held = await ask("claudia", { ...OMAR_B, emails: 1 });
    assert.equal(held.status, 200);
    assert.equal(held.body.said, "Omar has been asked. The email was held: this copy of the site doesn’t write to that address.");
    assert.equal(asksStored()[0].delivery, "held");
  });
});

// ---------------------------------------------------------------------------
// 4. Answers, and who can be asked at all
// ---------------------------------------------------------------------------

describe("4. answers, and who can be asked at all", () => {
  test("yes appoints them to the group through its appointment code, and the view says Said yes", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    world.mail.length = 0;
    const said = await answer("omar", body.askId, "yes");
    assert.equal(said.status, 200, JSON.stringify(said.body));
    const group = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(group.facilitatorUids, ["rahul", "sofia", "omar"]);
    assert.equal(group.facilitatorAppointments.omar.byUid, "claudia");
    assert.equal(group.facilitatorAppointments.omar.byName, "Claudia Reyes");
    assert.ok(group.facilitatorAppointments.omar.agreedAt instanceof Date);
    const enrolment = world.db.read(`courseEnrolments/${RUN.agi}__omar`);
    assert.equal(enrolment.role, "facilitator");
    assert.equal(enrolment.status, "active");
    assert.equal(enrolment.groupId, null);
    assert.equal(world.mail.length, 0, "saying yes emailed somebody");

    const view = (await asking("claudia")).body;
    const groupB = view.groups.find((each) => each.id === B);
    assert.deepEqual(groupB.facilitators.find((f) => f.uid === "omar").chip, { words: "Said yes · Mon 26 Oct", tone: "yes" });
    assert.deepEqual(view.people.find((person) => person.uid === "omar").status, {
      chip: { words: "Said yes · Mon 26 Oct", tone: "yes" },
      note: null,
      ask: "asked",
    });
    assert.equal(view.headline, "4 facilitators for 3 groups");
  });

  test("before groups go out, the facilitator who said yes is shown no names (1c's rule)", async (t) => {
    begin(t);
    // Amara is placed in Group B and nobody has been told: Publish has not been pressed.
    world.db.seed(`courseEnrolments/${RUN.agi}__amara`, {
      runId: RUN.agi,
      courseId: "agi-strategy-fellowship__c0urse01",
      uid: "amara",
      groupId: B,
      status: "active",
      role: "learner",
      allocatedEmailAt: null,
    });
    const { body } = await testThenAsk("claudia");
    assert.equal((await answer("omar", body.askId, "yes")).status, 200);
    const roster = await call("omar", routes.roster.GET, { groupId: B }, { course: true });
    assert.equal(roster.status, 200, JSON.stringify(roster.body));
    assert.deepEqual(roster.body.members, [], "a name reached a facilitator before groups went out");
    assert.equal(roster.body.notYetTold, true);
    assert.ok(!JSON.stringify(roster.body).includes("Amara"));
  });

  test("no records the answer, appoints nobody, and the lead can ask someone else", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    assert.equal((await answer("omar", body.askId, "no")).status, 200);
    assert.deepEqual(world.db.read(`courseGroups/${B}`).facilitatorUids, ["rahul", "sofia"]);
    const view = (await asking("claudia")).body;
    const groupB = view.groups.find((each) => each.id === B);
    assert.deepEqual(groupB.asks.map((each) => [each.name, each.chip.words, each.canRemind]), [
      ["Omar Haddad", "Said no · Mon 26 Oct", false],
    ]);
    assert.equal(view.people.find((person) => person.uid === "omar").status.ask, "asked");
    const second = await ask("claudia", { uid: "wen", groupId: B, replyBy: REPLY_BY, emails: 1, seat: body.askId });
    assert.equal(second.status, 200);
    // A second answer is refused.
    assert.equal((await answer("omar", body.askId, "yes")).status, 409);
  });

  test("a late answer is refused, and the page says so", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    t.mock.timers.setTime(REPLY_BY_INSTANT.getTime() + 60_000);
    const late = await answer("omar", body.askId, "yes");
    assert.equal(late.status, 409);
    assert.equal(
      late.body.error,
      "We needed an answer by Wed 28 Oct, 12pm, so this has closed. If you’d still like to facilitate, write to ai-safety@uonsu.com.",
    );
    assert.deepEqual(world.db.read(`courseGroups/${B}`).facilitatorUids, ["rahul", "sofia"]);
    const view = (await asking("claudia")).body;
    assert.deepEqual(view.people.find((person) => person.uid === "omar").status, {
      chip: { words: "No reply by Wed 28 Oct", tone: "quiet" },
      note: null,
      ask: "button",
    });
  });

  test("once somebody else has the place, the other ask is closed", async (t) => {
    begin(t);
    const first = await testThenAsk("claudia");
    const other = await ask("claudia", { uid: "wen", groupId: B, replyBy: REPLY_BY, emails: 1, seat: first.body.askId });
    assert.equal((await answer("wen", other.body.askId, "yes")).status, 200);
    const taken = await answer("omar", first.body.askId, "yes");
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, "Somebody else is facilitating Group B now, so this has closed. Thank you for saying you’d like to.");
    assert.deepEqual(world.db.read(`courseGroups/${B}`).facilitatorUids, ["rahul", "sofia", "wen"]);
  });

  test("Q21: somebody taking part in AGI Strategy, or invited to it, cannot be asked", async (t) => {
    begin(t);
    await test_("claudia", OMAR_B);
    const amara = await ask("claudia", { uid: "amara", groupId: B, replyBy: REPLY_BY, emails: 1 });
    assert.equal(amara.status, 409);
    assert.equal(amara.body.error, "That person is taking part in AGI Strategy, so they can’t facilitate it.");
    const ines = await ask("claudia", { uid: "ines", groupId: B, replyBy: REPLY_BY, emails: 1 });
    assert.equal(ines.status, 409);
    assert.equal(ines.body.error, "That person is invited to AGI Strategy, and can’t be asked until they answer.");
    const tariq = await ask("claudia", { uid: "tariq", groupId: B, replyBy: REPLY_BY, emails: 1 });
    assert.equal(tariq.status, 409);
    assert.equal(tariq.body.error, "That person isn’t on the list of people who’d like to facilitate this programme.");
    assert.equal(asksStored().length, 0);
  });

  test("Q21 at the answer: somebody who has come to take part since they were asked cannot say yes", async (t) => {
    begin(t);
    const asked = await testThenAsk("claudia");
    // Omar is offered a freed place on AGI Strategy and accepts it.
    world.db.poke(`admissionApplications/${ROUND}__omar`, {
      invitation: { programmeId: "agi-strategy", replyBy: "2026-10-29", response: "accepted", respondedAt: NOW },
      status: "accepted",
    });
    const refused = await answer("omar", asked.body.askId, "yes");
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "You’re taking part in AGI Strategy, so you can’t facilitate it this term.");
    assert.deepEqual(world.db.read(`courseGroups/${B}`).facilitatorUids, ["rahul", "sofia"]);
  });

  test("by hand, too: an account taking part in the run cannot be made its facilitator", async (t) => {
    begin(t);
    world.db.seed(`courseEnrolments/${RUN.agi}__amara`, {
      runId: RUN.agi,
      courseId: "agi-strategy-fellowship__c0urse01",
      uid: "amara",
      groupId: B,
      status: "active",
      role: "learner",
    });
    const before = everything();
    const refused = await call("claudia", routes.byHand.POST, { groupId: A }, { body: { uids: ["sofia", "amara"] }, course: true });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "Amara Okafor can’t facilitate a programme they’re taking part in, so nothing was saved.");
    assert.equal(everything(), before);
  });

  test("taking somebody off by hand takes their appointment record with them", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    await answer("omar", body.askId, "yes");
    const saved = await call("claudia", routes.byHand.POST, { groupId: B }, { body: { uids: ["rahul", "sofia"] }, course: true });
    assert.equal(saved.status, 200);
    const group = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(group.facilitatorUids, ["rahul", "sofia"]);
    assert.ok(!("omar" in (group.facilitatorAppointments ?? {})), "the record outlived the place");
    assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__omar`).status, "removed");
  });
});

// ---------------------------------------------------------------------------
// 5. The training
// ---------------------------------------------------------------------------

describe("5. the training", () => {
  test("set and cleared by the lead and an admin, a day, a time and a room all three", async (t) => {
    begin(t);
    const set = await training("claudia", { training: { dateKey: "2026-10-28", time: "18:00", room: "Portland B5" } });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body.training, { day: "Wed 28 Oct", time: "6pm", room: "Portland B5" });
    assert.deepEqual(world.db.read(`courseFacilitating/${RUN.agi}__training`), {
      kind: "training",
      runId: RUN.agi,
      dateKey: "2026-10-28",
      time: "18:00",
      room: "Portland B5",
      setByUid: "claudia",
      setAt: NOW,
    });
    assert.deepEqual((await asking("zach")).body.training, { day: "Wed 28 Oct", time: "6pm", room: "Portland B5" });
    const cleared = await training("zach", { training: null });
    assert.equal(cleared.status, 200);
    assert.equal(world.db.read(`courseFacilitating/${RUN.agi}__training`), undefined);
    assert.equal((await asking("claudia")).body.training, null);
  });

  test("a training with no room, or no time, is refused with a sentence", async (t) => {
    begin(t);
    const noRoom = await training("claudia", { training: { dateKey: "2026-10-28", time: "18:00", room: " " } });
    assert.equal(noRoom.status, 400);
    assert.equal(noRoom.body.error, "Say which room the training is in.");
    const noTime = await training("claudia", { training: { dateKey: "2026-10-28", room: "B5" } });
    assert.equal(noTime.status, 400);
    assert.equal(noTime.body.error, "Choose a time of day, such as 12:00.");
  });
});

// ---------------------------------------------------------------------------
// 6. Privacy
// ---------------------------------------------------------------------------

describe("6. nothing from an application reaches the person asked beyond what the page shows", () => {
  test("the email and the answer carry none of their answers, and no other person's", async (t) => {
    begin(t);
    const { body } = await testThenAsk("claudia");
    const email = JSON.stringify(world.mail.map(wordsOf));
    for (const uid of ["omar", "wen", "nina", "amara", "ines"]) {
      assert.ok(!email.includes(SECRET(uid)), `${uid}'s answer reached an email`);
    }
    assert.ok(!email.includes("chess club"), "the person's own answer was sent back to them");
    const said = await answer("omar", body.askId, "no");
    assert.deepEqual(said.body, { ok: true, answer: "no" });
  });
});
