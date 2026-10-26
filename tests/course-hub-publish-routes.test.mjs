/**
 * Publish on a run's allocation board, with a test first, a count, honest
 * result words and an email to each facilitator.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/courses/runs/[runId]/allocation            (its `publish` summary)
 *   POST  /api/courses/runs/[runId]/allocation/publish/test
 *   POST  /api/courses/runs/[runId]/allocation/publish
 *
 * ## What this guards
 *
 *  1. WHO MAY PRESS. Signed out is refused, and so is everybody but an admin
 *     and the run's track lead. A run the application form fills is an
 *     admin's: its track lead is refused with a sentence, on both routes and
 *     on the board's summary, and nothing is written. A view-as session is
 *     refused before anything is read.
 *  2. A TEST FIRST. A press that would send is refused until somebody has
 *     sent themselves a test of the wording in force. The test is the first
 *     person's and the first facilitator's real email, marked, to the
 *     presser's own address only, and it tells nobody and stamps nothing. A
 *     changed wording needs a fresh test; a test that was held or stopped by
 *     the do-not-email list reached nobody and does not count.
 *  3. THE COUNT IS WHAT IS SENT. The board's number is exactly the emails a
 *     press sends; a press carrying another number is refused, and one with
 *     none is refused before anything is read. A press that would send
 *     nothing says so and needs no test.
 *  4. ONCE PER FACILITATOR PER GROUP, across two presses and two at once. A
 *     facilitator of two groups hears about each. A group with nobody in it
 *     is not one its facilitators hear about yet; an archived one never is.
 *     A facilitator added later is told alone.
 *  5. WHAT HAPPENED IS SAID: sent, held, on the do-not-email list, failed
 *     (still owed, and the next press tries again) and no address.
 *  6. THE EMAILS: the board's words, the group's own calendar, a moved
 *     person told their new group, an online group told the link is on the
 *     page, and no meeting link or token in any email, tests included.
 *  8. WEEK 1'S GUIDE: the facilitators' email says "and week 1’s guide" only
 *     while their group page shows it, that is while the group's next
 *     session is its week 1 and week 1 of the course's facilitator guide has
 *     its session plan or its notes. The page's side of it is held in
 *     tests/course-facilitator-guide.test.mjs, section 5.
 *
 * Built on `tests/lib/handoverWorld.mjs`: the real handlers, the term's form
 * (AGI Strategy names the run and Claudia leads it), and the course run
 * reshaped to the board's own example.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import {
  COURSE,
  GROUP,
  RUN,
  groupDoc,
  loadJoin,
  makeWorld,
  namedSeed,
  short,
} from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";

const made = makeWorld("__hubPublish");
const { world, reset, call, everything, lib } = made;
const join_ = await loadJoin(made);
const { routes, press, board, place, rowPath } = join_;
const words = await lib("courses", "publishWords.ts");
const plan = await lib("courses", "allocationPublish.ts");
/** The allocation board's rail: the function the board itself asks. */
const tally = await lib("..", "features", "courses", "allocationTally.ts");
/** A group's names, as its facilitator's group page reads them. */
const roster = await made.courseRoute("groups", "[groupId]", "roster");

// Tue 27 Oct 2026, 5:38pm in London (the clocks went back on the 25th).
const NOW = new Date("2026-10-27T17:38:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const LINK = "https://meet.example/j/8675309?pwd=opensesame";
const WAY_IN = ["meet.example", "8675309", "opensesame"];
// Since the course hub's lead access (Q1) the lead of the programme that
// names the run publishes it too, so the sentence names both.
const ADMIN_ONLY =
  "This run’s people came from the application form, so only an admin or its programme’s lead can publish it or send its test.";

/** Six taught weeks from Thu 29 Oct: a Tuesday group meets from Tue 3 Nov to Tue 8 Dec. */
const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({
  kind: "week",
  weekNumber: i + 1,
  weekId: `w0${i + 1}`,
}));

const slot = (over) => ({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null, notes: "", ...over });

/**
 * The term after the hand-over, with the AGI run as the board draws it:
 * Group B on Tuesdays at 6pm in Hallward B12 with Rahul and Sofia, Group A on
 * Thursdays at 6pm with Sofia, and Group C online on Wednesdays with Tom.
 */
function hubSeed(over = {}) {
  const seed = namedSeed();
  for (const [uid, name] of [["rahul", "Rahul Mehta"], ["sofia", "Sofia Rossi"], ["tom", "Tom Fletcher"]]) {
    seed[`users/${uid}`] = userDoc(session(uid, "member", false, name));
  }
  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  seed[`courseGroups/${GROUP.monday}`] = groupDoc({ name: "Group B", facilitatorUids: ["rahul", "sofia"], session: slot() });
  seed[`courseGroups/${GROUP.thursday}`] = groupDoc({
    name: "Group A",
    facilitatorUids: ["sofia"],
    session: slot({ weekday: 4, location: "Portland A13" }),
  });
  seed[`courseGroups/${GROUP.unset}`] = groupDoc({
    name: "Group C",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3, startTimeLocal: "13:00", location: "", meetingUrl: LINK }),
  });
  return { ...seed, ...over };
}

const B = GROUP.monday;
const A = GROUP.thursday;
const C = GROUP.unset;

/** Everybody holding a place, handed over and put in a group: two in B, two in A. */
async function placed() {
  await press();
  const done = await place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: A },
  ]);
  assert.equal(done.body.placed, 4, JSON.stringify(done.body));
}

const summary = async (who = "zach") => (await board(who)).body.publish;
const sendTest = (who = "zach", options = {}) =>
  call(who, routes.publishTest.POST, { runId: RUN.agi }, { course: true, ...options });
const pressWith = (who, body, options = {}) =>
  call(who, routes.publish.POST, { runId: RUN.agi }, { body, course: true, ...options });
/** A press with the number the board shows now. */
const pressNow = async (who = "zach") => pressWith(who, { emails: (await summary(who)).emails });

const isTest = (mail) => mail.subject.startsWith("[TEST]");
const isFacilitating = (mail) => mail.subject.replace("[TEST] ", "").startsWith("You’re facilitating");
const realMail = () => world.mail.filter((mail) => !isTest(mail));
const toOf = (mails) => mails.map((mail) => mail.to);

/** One sent email as its reader gets it. */
async function opened(mail) {
  const html = await render(mail.react);
  const text = html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { to: mail.to, subject: mail.subject, html, text };
}

/** The number a facilitators' email says is in the group, from "There are 2 people in the group." */
const groupSizeIn = (text) => Number((/There (?:is|are) (\d+) (?:person|people) in the group\./.exec(text) ?? [])[1]);

/** What the group's page shows one of its facilitators. */
async function rosterFor(who, groupId) {
  const answer = await call(who, roster.GET, { groupId }, { course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body;
}

/** No email carries a token or anything that lets a reader into a call. */
async function nothingToFollow(mails) {
  for (const mail of await Promise.all(mails.map(opened))) {
    const all = `${mail.subject}\n${mail.html}`;
    assert.deepEqual([...all.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]), [], `${mail.to}: ${mail.subject}`);
    for (const part of WAY_IN) assert.ok(!all.toLowerCase().includes(part), `${mail.to} was sent ${part}`);
  }
}

beforeEach(() => {
  reset(hubSeed(), { now: () => new Date() });
});

// ---------------------------------------------------------------------------
// 1. Who may press
// ---------------------------------------------------------------------------

describe("1. who may press", () => {
  test("signed out is refused, and so is everybody but an admin, the run's track lead and the programme's lead", async () => {
    await placed();
    const before = everything();
    for (const route of [routes.publishTest.POST, routes.publish.POST]) {
      assert.deepEqual(short(await call(null, route, { runId: RUN.agi }, { body: { emails: 7 }, course: true })), [401, "Not signed in"]);
      // A member placed on the run, one who is not, the run's reviewer and
      // one of the group's facilitators. The programme's lead, Claudia,
      // presses both since the course hub's lead access (Q1): that is held
      // in tests/course-hub-lead-routes.test.mjs.
      for (const who of ["amara", "omar", "lloyd", "rahul"]) {
        assert.deepEqual(short(await call(who, route, { runId: RUN.agi }, { body: { emails: 7 }, course: true })), [403, "Forbidden"], who);
      }
    }
    assert.equal(everything(), before, "a refused press wrote something");
    assert.deepEqual(world.mail, []);
  });

  test("on a run the application form fills, its track lead is refused with a sentence, and told nothing about who is on it", async () => {
    await placed();
    const before = everything();
    assert.deepEqual(short(await sendTest("yusuf")), [403, ADMIN_ONLY]);
    assert.deepEqual(short(await pressWith("yusuf", { emails: 0 })), [403, ADMIN_ONLY]);
    assert.deepEqual(short(await pressWith("yusuf", { emails: 7 })), [403, ADMIN_ONLY]);
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
    // The board says so, and names nobody.
    const shown = await summary("yusuf");
    assert.deepEqual(
      [shown.adminOnly, shown.emails, shown.people, shown.facilitators, shown.noAddress, shown.emptyGroups, shown.refusals],
      [true, 0, 0, 0, [], [], []],
    );
  });

  test("a view-as session is refused on both, before anything is read", async () => {
    await placed();
    const before = everything();
    for (const route of [routes.publishTest.POST, routes.publish.POST]) {
      const refused = await call("zach", route, { runId: RUN.agi }, { body: { emails: 7 }, course: true, viewAs: true });
      assert.equal(refused.status, 403);
    }
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
  });

  test("on a run nobody's form fills, its track lead tests and publishes", async () => {
    // The pre-course run: no programme names it, and somebody applied to it itself.
    world.db.seed(`courseRuns/${RUN.other}`, {
      ...world.db.read(`courseRuns/${RUN.other}`),
      trackLeadUids: ["yusuf"],
      startDate: "2026-10-29",
      weekPlan: SIX_WEEKS,
    });
    world.db.seed("courseGroups/pre-course-tuesday__grp00009", groupDoc({ runId: RUN.other, courseId: "pre-course__c0urse03", name: "Tuesday group", facilitatorUids: ["rahul"], session: slot() }));
    world.db.seed(`courseApplications/${RUN.other}__nobody`, {
      runId: RUN.other,
      courseId: "pre-course__c0urse03",
      uid: "nobody",
      displayName: "Nell Carter",
      email: "nobody@example.com",
      status: "accepted",
    });
    world.db.seed(`courseEnrolments/${RUN.other}__nobody`, {
      runId: RUN.other,
      courseId: "pre-course__c0urse03",
      uid: "nobody",
      groupId: "pre-course-tuesday__grp00009",
      status: "active",
      role: "learner",
    });
    const at = (route, body) => call("yusuf", route, { runId: RUN.other }, { body, course: true });
    const shown = (await call("yusuf", routes.board.GET, { runId: RUN.other }, { course: true })).body.publish;
    assert.deepEqual([shown.adminOnly, shown.emails, shown.people, shown.facilitators], [false, 2, 1, 1]);
    const tested = await at(routes.publishTest.POST);
    assert.deepEqual([tested.status, tested.body.recorded], [200, true], JSON.stringify(tested.body));
    assert.deepEqual(toOf(world.mail), ["yusuf@example.com", "yusuf@example.com"]);
    const published = await at(routes.publish.POST, { emails: 2 });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual(toOf(realMail()), ["nobody@example.com", "rahul@example.com"]);
    // No programme names this run, so no lead signs the facilitators' email:
    // NAISI does, as it signs the group email (Mon 26 Oct 2026; until then
    // nobody signed it).
    const facilitators = await opened(realMail().find(isFacilitating));
    assert.ok(!facilitators.text.includes("lead, NAISI"), facilitators.text);
    assert.ok(facilitators.text.includes("Take the register on your phone during the session. NAISI"), facilitators.text);
    assert.ok(facilitators.text.includes("There is 1 person in the group."), facilitators.text);
  });
});

// ---------------------------------------------------------------------------
// 2. A test first
// ---------------------------------------------------------------------------

describe("2. a test first", () => {
  test("without one, a press is refused with a sentence, and nothing at all is done", async () => {
    await placed();
    const before = everything();
    const refused = await pressWith("zach", { emails: 7 });
    assert.deepEqual(short(refused), [
      409,
      "Nothing was published. Nobody has sent themselves a test of these emails yet. Send yourself one before you publish.",
    ]);
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
    assert.deepEqual((await summary()).test, { state: "none", when: null, who: null });
  });

  test("the test is the first person's and the first facilitator's real email, marked, to the presser alone", async () => {
    await placed();
    const before = everything();
    const tested = await sendTest();
    assert.equal(tested.status, 200, JSON.stringify(tested.body));
    assert.deepEqual([tested.body.delivery, tested.body.emails, tested.body.recorded], ["sent", 2, true]);
    assert.deepEqual(toOf(world.mail), ["zach@example.com", "zach@example.com"]);
    for (const mail of world.mail) {
      assert.ok(isTest(mail), mail.subject);
      assert.equal(mail.kind, "course-test");
    }
    const [person, facilitator] = await Promise.all(world.mail.map(opened));
    // Amara's email in the board's words (st-emails, October 2026; until then
    // "Your AGI Strategy Fellowship group: first session Tue 3 Nov, 6pm"),
    // as Publish would send it: no week of the run is written yet, so it
    // says nothing of week 1.
    assert.equal(person.subject, "[TEST] Your AGI Strategy group: Tuesdays at 6pm");
    assert.ok(
      person.text.includes(
        "Hi Amara, You’re in Group B. You’ll meet on Tuesdays at 6pm in Hallward B12, starting Tue 3 Nov. Sessions last 2 hours. " +
          "Rahul and Sofia are your facilitators. There are 2 of you. Open your programme Claudia AGI Strategy lead, NAISI",
      ),
      person.text,
    );
    assert.equal(facilitator.subject, "[TEST] You’re facilitating Group B: Tuesdays at 6pm");
    assert.ok(facilitator.text.includes("Hi Rahul,"), "it is Rahul's email, as Publish would send it");
    await nothingToFollow(world.mail);
    // It told nobody, and stamped nobody: only the record of the test changed.
    // Whether somebody sees their group is decided by the stamp Publish
    // writes (`allocatedEmailAt`) and nothing else, so a test that stamped
    // the person whose email it borrows would show them their group early;
    // nor does it claim the facilitator's once-only marker.
    for (const uid of ["amara", "dev", "bea", "tariq"]) {
      assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).allocatedEmailAt, undefined, uid);
    }
    assert.deepEqual(world.db.paths().filter((path) => path.startsWith("courseNudges/facilitating__")), []);
    const after = JSON.parse(everything()).filter(([path]) => !path.startsWith("courseNudges/publishtest__"));
    assert.deepEqual(after, JSON.parse(before));
    assert.deepEqual((await summary()).test, { state: "fresh", when: "5:38pm", who: null });
    // Then the press goes.
    const published = await pressNow();
    assert.equal(published.status, 200, JSON.stringify(published.body));
  });

  test("another admin's test counts, and the board says whose it was", async () => {
    await placed();
    world.db.seed("users/zoe", { ...userDoc(session("zoe", "admin", false, "Zoe Adams")) });
    assert.equal((await sendTest("zoe")).body.recorded, true);
    assert.deepEqual((await summary()).test, { state: "fresh", when: "5:38pm", who: "Zoe" });
    assert.equal((await pressNow()).status, 200);
  });

  test("a changed wording in Email designs needs a fresh test, of either email", async () => {
    await placed();
    await sendTest();
    for (const [id, subject, html] of [
      ["course-facilitating", "You’re running {groupName}", "<p>Hi {firstName}, see you on {weeklySlot}.</p>"],
      ["course-allocated", "Your group: {groupName}", "<p>Hi {firstName}, see you on {firstSessionWhen}.</p>"],
    ]) {
      world.db.seed(`courseEmailTemplates/${id}`, { templateId: id, subject, blocks: [{ id: "x", type: "richText", html }] });
      assert.equal((await summary()).test.state, "stale", id);
      const refused = await pressNow();
      assert.deepEqual(short(refused), [
        409,
        "Nothing was published. The wording of these emails changed in Email designs after the last test. Send yourself a test again before you publish.",
      ]);
      assert.deepEqual(realMail(), []);
      assert.equal((await sendTest()).body.recorded, true);
      assert.equal((await summary()).test.state, "fresh", id);
    }
    const published = await pressNow();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    // What goes is the wording that was tested.
    assert.ok(realMail().some((mail) => mail.subject === "You’re running Group B"));
    assert.ok(realMail().some((mail) => mail.subject === "Your group: Group B"));
  });

  test("what a test is of is the wording, and not the ids a server gives the seed copy each time it starts", () => {
    const block = (id, html) => ({ id, type: "richText", html });
    const templates = (id, html) => ({
      allocated: { subject: "Your group", blocks: [block(id, html)] },
      facilitating: { subject: "You’re facilitating {groupName}", blocks: [block(`${id}-2`, "<p>{groupName}</p>")] },
    });
    const once = plan.wordingFingerprint(templates("b_one", "<p>{groupName}</p>"));
    assert.equal(plan.wordingFingerprint(templates("b_two", "<p>{groupName}</p>")), once, "a block's id moved the fingerprint");
    assert.notEqual(plan.wordingFingerprint(templates("b_one", "<p>{groupName}.</p>")), once, "a changed word did not");
    assert.notEqual(
      plan.wordingFingerprint({ ...templates("b_one", "<p>{groupName}</p>"), facilitating: { subject: "Changed", blocks: [] } }),
      once,
    );
  });

  test("a test that was held, or stopped by the do-not-email list, does not count", async () => {
    await placed();
    for (const fate of ["held", "suppressed"]) {
      world.mailFate = (args) => (args.to === "zach@example.com" ? fate : "sent");
      const tested = await sendTest();
      assert.deepEqual([tested.status, tested.body.delivery, tested.body.recorded], [200, fate, false]);
      assert.equal((await summary()).test.state, "none", fate);
      assert.equal((await pressNow()).status, 409, fate);
    }
    assert.deepEqual(realMail(), []);
  });

  test("a test that could not be written is refused with the sentence Publish would give", async () => {
    await placed();
    world.db.poke(`courseGroups/${B}`, { "session.startTimeLocal": "" });
    const refused = await sendTest();
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /^No test was sent\. Group B has no session time/);
    assert.deepEqual(world.mail, []);
  });

  test("with nothing to send, there is nothing to test, and a press needs no test", async () => {
    await press();
    // Nobody placed yet: Publish would refuse, and the test has no email to show.
    assert.equal((await summary()).emails, 0);
    assert.deepEqual(short(await sendTest()), [409, "Publishing now would send no email, so there is nothing to test."]);
  });
});

// ---------------------------------------------------------------------------
// 3. The count is what is sent
// ---------------------------------------------------------------------------

describe("3. the count", () => {
  test("the board's number is exactly what a press sends: the people, then the facilitators", async () => {
    await placed();
    const shown = await summary();
    // Four people, Rahul and Sofia for Group B, Sofia for Group A. Group C has
    // nobody in it, so Tom waits, and the board says why.
    assert.deepEqual(
      [shown.emails, shown.people, shown.facilitators, shown.more, shown.noAddress, shown.emptyGroups, shown.refusals],
      [7, 4, 3, 0, [], ["Group C"], []],
    );
    assert.equal(words.publishButtonLabel(shown.emails), "Publish and send 7 emails");
    assert.equal(words.publishAudienceLine(shown.people, shown.facilitators), "4 people and 3 facilitators");
    await sendTest();
    const published = await pressNow();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(realMail().length, 7);
    assert.deepEqual(toOf(realMail().filter(isFacilitating)), ["rahul@example.com", "sofia@example.com", "sofia@example.com"]);
    assert.deepEqual(published.body.report, {
      people: { sent: 4, held: 0, suppressed: 0 },
      facilitators: { sent: 3, held: 0, suppressed: 0 },
      failed: [],
      noAddress: [],
      alreadyTold: 0,
      more: 0,
    });
    assert.deepEqual(words.publishResultLines(published.body.report), ["Published. 7 emails sent: 4 to people with their group and 3 to facilitators."]);
    // Each person whose email was written for sending carries the stamp that
    // decides whether they see their group; a facilitator's once-only marker
    // is a document of its own, and touches no enrolment.
    for (const uid of ["amara", "dev", "bea", "tariq"]) {
      const seat = world.db.read(`courseEnrolments/${RUN.agi}__${uid}`);
      assert.ok(seat.allocatedEmailAt instanceof Date, uid);
      assert.deepEqual(Object.keys(seat).filter((key) => /facilitat/i.test(key)), [], uid);
    }
    // And then there is nothing to send, which the board says instead of a 0.
    const after = await summary();
    assert.equal(after.emails, 0);
    assert.equal(words.publishButtonLabel(after.emails), "Publish");
  });

  test("a press with another number is refused, and one with none is refused before anything is read", async () => {
    await placed();
    await sendTest();
    const before = everything();
    const stale = await pressWith("zach", { emails: 6 });
    assert.deepEqual(short(stale), [
      409,
      "Nothing was published. Since this page loaded, publishing has come to send 7 emails, not 6. Reload the page and check again.",
    ]);
    for (const body of [undefined, {}, { emails: "7" }, { emails: -1 }, { emails: 6.5 }]) {
      const refused = await pressWith("zach", body);
      assert.deepEqual(short(refused), [400, "Say how many emails this press is for. Reload the page and press Publish again."], JSON.stringify(body));
    }
    assert.equal(everything(), before);
    assert.deepEqual(realMail(), []);
  });

  test("a press that would send nothing goes without a test, and stamps the run", async () => {
    await placed();
    await sendTest();
    await pressNow();
    // A wording changed since: no email is owed, so no test is either.
    world.db.seed("courseEmailTemplates/course-allocated", { templateId: "course-allocated", subject: "Changed {groupName}", blocks: [{ id: "x", type: "richText", html: "<p>{firstSessionWhen}</p>" }] });
    const sent = realMail().length;
    const again = await pressWith("zach", { emails: 0 });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(realMail().length, sent);
    assert.deepEqual(words.publishResultLines(again.body.report), ["Published. No email was sent."]);
  });

  test("past one press's cap the rest wait for the next press, and the count says so", () => {
    const person = (n) => ({ uid: `p${n}`, name: `P${n}`, to: `p${n}@example.com`, groupId: "g", groupName: "G", email: { subject: "s", blocks: [] } });
    const people = Array.from({ length: plan.MAX_EMAILS_PER_PRESS + 3 }, (_, n) => person(n));
    const facilitators = [{ ...person("f"), markerId: "m" }];
    const batch = plan.pressBatch({ people: [...people, { ...person("x"), to: null }], facilitators });
    assert.deepEqual([batch.emails, batch.people.length, batch.facilitators.length, batch.more], [plan.MAX_EMAILS_PER_PRESS, plan.MAX_EMAILS_PER_PRESS, 0, 4]);
    assert.deepEqual(batch.noAddress, ["Px"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Once per facilitator per group
// ---------------------------------------------------------------------------

describe("4. once per facilitator per group", () => {
  test("a second press tells no facilitator again, and a facilitator of two groups hears about each", async () => {
    await placed();
    await sendTest();
    await pressNow();
    const sofia = await Promise.all(realMail().filter((mail) => mail.to === "sofia@example.com").map(opened));
    assert.deepEqual(sofia.map((mail) => mail.subject).sort(), ["You’re facilitating Group A: Thursdays at 6pm", "You’re facilitating Group B: Tuesdays at 6pm"]);
    const told = realMail().length;
    const again = await pressNow();
    assert.equal(again.status, 200);
    assert.equal(realMail().length, told);
    for (const [group, uid] of [[B, "rahul"], [B, "sofia"], [A, "sofia"]]) {
      assert.equal(world.db.read(`courseNudges/facilitating__${RUN.agi}__${group}__${uid}`).state, "sent", `${group} ${uid}`);
    }
  });

  test("two presses at once send each email once", async () => {
    await placed();
    await sendTest();
    const { emails } = await summary();
    // Both requests at once, as two tabs would send them.
    world.user = made.sessionOf("zach");
    world.course = true;
    const at = () =>
      routes.publish.POST(new Request("https://naisi.invalid/api", { method: "POST", body: JSON.stringify({ emails }) }), {
        params: Promise.resolve({ runId: RUN.agi }),
      });
    const answers = await Promise.all([at(), at()]);
    world.course = false;
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
    assert.match(answers.find((answer) => answer.status === 409).body.error, /Another press of Publish for this run is still sending/);
    assert.equal(realMail().length, 7);
    assert.equal(new Set(realMail().map((mail) => `${mail.to} ${mail.subject}`)).size, 7);
    // And the claim alone holds too: of two claims of one email, one wins.
    const owed = { uid: "tom", markerId: `facilitating__${RUN.agi}__${C}__tom`, groupId: C };
    const claims = await Promise.all([plan.claimFacilitatorEmail(world.courseDb, RUN.agi, owed, "zach"), plan.claimFacilitatorEmail(world.courseDb, RUN.agi, owed, "zach")]);
    assert.deepEqual(claims.sort(), [false, true]);
  });

  test("a group with nobody in it waits, and its facilitator is told once somebody is placed there", async () => {
    await placed();
    await sendTest();
    await pressNow();
    assert.ok(!realMail().some((mail) => mail.to === "tom@example.com"));
    await place("zach", [{ uid: "tariq", groupId: C }]);
    const shown = await summary();
    // Tariq again, with his new group, and Tom.
    assert.deepEqual([shown.emails, shown.people, shown.facilitators, shown.emptyGroups], [2, 1, 1, []]);
    const again = await pressNow();
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const tom = await opened(realMail().find((mail) => mail.to === "tom@example.com"));
    assert.equal(tom.subject, "You’re facilitating Group C: Wednesdays at 1pm");
    assert.ok(tom.text.includes("There is 1 person in the group."), tom.text);
  });

  test("a facilitator added later is told alone, and is named beside the others", async () => {
    await placed();
    await sendTest();
    await pressNow();
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "tom"] });
    const shown = await summary();
    assert.deepEqual([shown.emails, shown.people, shown.facilitators], [1, 0, 1]);
    const before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    const added = realMail().slice(before);
    assert.deepEqual(toOf(added), ["tom@example.com"]);
    const tom = await opened(added[0]);
    assert.ok(tom.text.includes("You’re facilitating with Rahul and Sofia."), tom.text);
  });

  test("an archived group's facilitators are never told, and a group with none tells nobody", async () => {
    await press();
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: [] });
    await place("zach", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: C },
    ]);
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const shown = await summary();
    // Rahul and Sofia for Group B only: Group A has no facilitator, Group C is archived.
    assert.deepEqual([shown.people, shown.facilitators, shown.emptyGroups], [4, 2, []]);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(toOf(realMail().filter(isFacilitating)), ["rahul@example.com", "sofia@example.com"]);
    const bea = await opened(realMail().find((mail) => mail.to === "bea@example.com"));
    // Group A has no facilitator, so no sentence names one (the board's words since October 2026).
    assert.ok(!bea.text.includes("your facilitator"), bea.text);
  });
});

// ---------------------------------------------------------------------------
// 5. What happened is said
// ---------------------------------------------------------------------------

describe("5. what happened is said", () => {
  test("held, on the do-not-email list, failed and no address, each in words, and only a failure is tried again", async (t) => {
    t.mock.method(console, "error", () => {});
    await placed();
    await sendTest();
    // Bea has no address on file any more; the rows the form wrote carry none.
    world.db.poke("users/bea", { email: "" });
    const fates = { "amara@example.com": "suppressed", "dev@example.com": "held", "tariq@example.com": "fail", "rahul@example.com": "fail" };
    world.mailFate = (args) => (isTest(args) ? "sent" : (fates[args.to] ?? "sent"));
    const shown = await summary();
    assert.deepEqual([shown.emails, shown.noAddress], [6, ["Bea"]]);
    const published = await pressWith("zach", { emails: 6 });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    const { report } = published.body;
    assert.deepEqual(report.people, { sent: 0, held: 1, suppressed: 1 });
    // Sofia for Group B. Group A is Bea, with no address, and Tariq, whose
    // send failed: nobody in it is told, so there is nobody to count, and
    // Sofia's email for it waits for the press that tells somebody there.
    assert.deepEqual(report.facilitators, { sent: 1, held: 0, suppressed: 0 });
    assert.equal(report.more, 1);
    // Names only, as people go by them: never an address.
    assert.deepEqual([report.failed, report.noAddress], [["Tariq", "Rahul"], ["Bea"]]);
    assert.deepEqual(words.publishResultLines(report), [
      "Published. 1 email sent: 1 to facilitators.",
      "Not sent to Tariq and Rahul, because the send failed. Press Publish again to try again: nobody already told is emailed twice.",
      "Not sent to Bea, because there is no email address on file.",
      "Not sent to 1 address on the do-not-email list. It counts as told, so it isn’t tried again.",
      "Held, not sent: 1 email to addresses this copy of the site doesn’t email. That is how a rehearsal works.",
      "1 email still to send. Press Publish again to send it.",
    ]);
    // A held and a suppressed email both count as told: Sofia's Group B email counts Amara and Dev.
    const sofiaB = await opened(realMail().find((mail) => mail.to === "sofia@example.com" && mail.subject.includes("Group B")));
    assert.equal(groupSizeIn(sofiaB.text), 2, sofiaB.text);
    for (const line of words.publishResultLines(report)) assert.doesNotMatch(line, /skipped|—|–/);
    // The stamp is written exactly when an email was written for sending, as
    // before: a held or a suppressed email was handed to the mail door and is
    // stamped (and said for what it is), a failed send and a missing address
    // are not, and a failed facilitator's claim was given back.
    const seat = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`);
    assert.ok(seat("amara").allocatedEmailAt instanceof Date);
    assert.equal(seat("amara").allocatedEmailDelivery, "suppressed");
    assert.ok(seat("dev").allocatedEmailAt instanceof Date);
    assert.equal(seat("dev").allocatedEmailDelivery, "held");
    assert.equal(seat("tariq").allocatedEmailAt, undefined);
    assert.equal(seat("bea").allocatedEmailAt, undefined);
    assert.equal(world.db.read(`courseNudges/facilitating__${RUN.agi}__${B}__rahul`), undefined);
    // Sofia's email for Group A was never claimed: it is still owed.
    assert.equal(world.db.read(`courseNudges/facilitating__${RUN.agi}__${A}__sofia`), undefined);
    // Nobody is pushed whose email did not go.
    assert.deepEqual(world.pushes, []);
    // The next press tries exactly the two that failed, and sends Sofia's
    // email for Group A, which counts Tariq once he is told, and not Bea.
    world.mailFate = null;
    const next = await summary();
    assert.deepEqual([next.emails, next.people, next.facilitators], [3, 1, 2]);
    const again = await pressNow();
    assert.deepEqual([again.body.report.people.sent, again.body.report.facilitators.sent, again.body.report.failed], [1, 2, []]);
    const sofiaA = await opened(realMail().find((mail) => mail.to === "sofia@example.com" && mail.subject.includes("Group A")));
    assert.equal(groupSizeIn(sofiaA.text), 1, sofiaA.text);
  });
});

// ---------------------------------------------------------------------------
// 6. The emails
// ---------------------------------------------------------------------------

describe("6. the emails", () => {
  test("the facilitators' email says what the board draws, from the records", async () => {
    await placed();
    await sendTest();
    await pressNow();
    const rahul = await opened(realMail().find((mail) => mail.to === "rahul@example.com"));
    assert.equal(rahul.subject, "You’re facilitating Group B: Tuesdays at 6pm");
    // Everything between the logo and the footer, in order: the board's
    // words since October 2026 (until then "Where: Hallward B12" and "You’re
    // facilitating with Sofia." each had a line of their own, and nothing
    // said where the names are).
    assert.ok(
      rahul.text.includes(
        "Hi Rahul, Group B meets on Tuesdays at 6pm in Hallward B12, from Tue 3 Nov to Tue 8 Dec. " +
          "You’re facilitating with Sofia. There are 2 people in the group. Their names are on your group page. Open your group " +
          "Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI",
      ),
      rahul.text,
    );
    assert.ok(rahul.html.includes(`href="https://naisi.invalid/learn/${RUN.agi}/group/${B}"`), "the button leads to the group page");
    // Sofia facilitates Group A alone: no sentence names anybody beside her.
    const sofiaA = await opened(realMail().find((mail) => mail.to === "sofia@example.com" && mail.subject.includes("Group A")));
    assert.ok(!sofiaA.text.includes("You’re facilitating with"), sofiaA.text);
    assert.ok(sofiaA.text.includes("Group A meets on Thursdays at 6pm in Portland A13, from Thu 29 Oct to Thu 3 Dec. There are"), sofiaA.text);
    await nothingToFollow(world.mail);
  });

  test("a facilitator is told how many in the group are told by the end of the press, which is the names on their roster, and the test counts the same way", async (t) => {
    // The send to Tariq fails, and the press says so on the console too.
    t.mock.method(console, "error", () => {});
    await placed();
    // Group B is Amara and Dev, and Dev has no address on file any more (the
    // rows the form wrote carry none). Group A is Bea and Tariq, and the send
    // to Tariq fails.
    world.db.poke("users/dev", { email: "" });
    world.mailFate = (args) => (args.to === "tariq@example.com" ? "fail" : "sent");
    const shown = await summary();
    assert.deepEqual([shown.emails, shown.people, shown.facilitators, shown.noAddress], [6, 3, 3, ["Dev"]]);

    // The test is Rahul's email for Group B as the press would send it. It
    // counts the people told already and the people the press writes to, so
    // Amara, and not Dev, whom it cannot write to.
    assert.equal((await sendTest()).body.recorded, true);
    const tested = await opened(world.mail.find((mail) => isTest(mail) && isFacilitating(mail)));
    assert.equal(tested.subject, "[TEST] You’re facilitating Group B: Tuesdays at 6pm");
    assert.ok(tested.text.includes("Hi Rahul,"), tested.text);
    assert.equal(groupSizeIn(tested.text), 1, tested.text);

    const published = await pressNow();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual(
      [published.body.report.people, published.body.report.facilitators, published.body.report.failed],
      [{ sent: 2, held: 0, suppressed: 0 }, { sent: 3, held: 0, suppressed: 0 }, ["Tariq"]],
    );
    const sentTo = async (to, group) => {
      const found = realMail().filter((mail) => mail.to === to && isFacilitating(mail) && mail.subject.includes(`${group}:`));
      assert.equal(found.length, 1, `${to}, ${group}`);
      return opened(found[0]);
    };

    // Group B: Amara is told and Dev is not. Rahul's email is the words of
    // his test, and each facilitator's number is the names on the roster.
    const rahul = await sentTo("rahul@example.com", "Group B");
    // The subject without the test's mark, and every word from the greeting
    // on (the preheader's invisible padding is as long as its subject).
    const fromGreeting = (text) => text.slice(text.indexOf("Hi Rahul,"));
    assert.equal(rahul.subject, tested.subject.replace("[TEST] ", ""));
    assert.equal(fromGreeting(rahul.text), fromGreeting(tested.text), "the press sent Rahul other words than his test");
    const groupB = await rosterFor("rahul", B);
    assert.deepEqual([groupB.members.map((m) => m.uid), groupB.notYetTold], [["amara"], true]);
    for (const email of [rahul, await sentTo("sofia@example.com", "Group B")]) {
      assert.equal(groupSizeIn(email.text), groupB.members.length, email.text);
    }

    // Group A: Bea is told, and the send to Tariq failed, so Sofia is told 1,
    // not the 2 every send going would have made.
    const sofiaA = await sentTo("sofia@example.com", "Group A");
    const groupA = await rosterFor("sofia", A);
    assert.deepEqual([groupA.members.map((m) => m.uid), groupA.notYetTold], [["bea"], true]);
    assert.equal(groupSizeIn(sofiaA.text), groupA.members.length, sofiaA.text);
  });

  test("a group nobody in which can be told yet keeps its facilitators waiting, and the press that tells somebody there tells them", async () => {
    await press();
    // Tariq is alone in Group C, and has no address on file.
    world.db.poke("users/tariq", { email: "" });
    await place("zach", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: C },
    ]);
    const shown = await summary();
    // Rahul and Sofia for Group B, Sofia for Group A. Not Tom: nobody in Group C can be told.
    assert.deepEqual([shown.emails, shown.people, shown.facilitators, shown.noAddress, shown.emptyGroups], [6, 3, 3, ["Tariq"], []]);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    assert.ok(!realMail().some((mail) => mail.to === "tom@example.com"), "Tom was told about a group nobody in which is told");
    assert.equal(world.db.read(`courseNudges/facilitating__${RUN.agi}__${C}__tom`), undefined);
    assert.deepEqual((await rosterFor("tom", C)).members, []);

    // Tariq's address is back: the next press tells him, then Tom, who counts him.
    world.db.poke("users/tariq", { email: "tariq@example.com" });
    const next = await summary();
    assert.deepEqual([next.emails, next.people, next.facilitators], [2, 1, 1]);
    const before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(toOf(realMail().slice(before)), ["tariq@example.com", "tom@example.com"]);
    const tom = await opened(realMail().find((mail) => mail.to === "tom@example.com"));
    const groupC = await rosterFor("tom", C);
    assert.deepEqual(groupC.members.map((m) => m.uid), ["tariq"]);
    assert.equal(groupSizeIn(tom.text), groupC.members.length, tom.text);
  });

  test("an online group is told it meets online and that the link is on the page, never the link", async () => {
    await press();
    await place("zach", [
      { uid: "amara", groupId: C },
      { uid: "dev", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: A },
    ]);
    await sendTest();
    await pressNow();
    const amara = await opened(realMail().find((mail) => mail.to === "amara@example.com"));
    // In the board's words since October 2026 (until then "Where: Online. The
    // link to join is on your programme's page in the learning space.").
    assert.ok(
      amara.text.includes(
        "You’ll meet on Wednesdays at 1pm online, starting Wed 4 Nov. Sessions last 2 hours. The link to join is on your programme’s page.",
      ),
      amara.text,
    );
    const tom = await opened(realMail().find((mail) => mail.to === "tom@example.com"));
    // Until October 2026 "Where: Online. The link to join is on your group page." on a line of its own.
    assert.ok(tom.text.includes("Group C meets on Wednesdays at 1pm online, from Wed 4 Nov to Wed 9 Dec. The link to join is on your group page."), tom.text);
    await nothingToFollow(world.mail);
  });

  test("a group that keeps its own pace is dated by its own calendar, in both emails", async () => {
    // Group A starts a week after the run.
    world.db.poke(`courseGroups/${A}`, { paceStartDate: "2026-11-05" });
    await placed();
    await sendTest();
    await pressNow();
    const bea = await opened(realMail().find((mail) => mail.to === "bea@example.com"));
    // The day it meets from, in the boards' words ("Thu 5 Nov"): in the
    // subject until the email took the board's words (st-emails, October
    // 2026), and in its first sentence since, beside the weekly time the
    // subject now says.
    assert.equal(bea.subject, "Your AGI Strategy group: Thursdays at 6pm");
    assert.ok(bea.text.includes("You’ll meet on Thursdays at 6pm in Portland A13, starting Thu 5 Nov."), bea.text);
    const amara = await opened(realMail().find((mail) => mail.to === "amara@example.com"));
    assert.equal(amara.subject, "Your AGI Strategy group: Tuesdays at 6pm");
    assert.ok(amara.text.includes("You’ll meet on Tuesdays at 6pm in Hallward B12, starting Tue 3 Nov."), amara.text);
    const sofiaA = await opened(realMail().find((mail) => mail.to === "sofia@example.com" && mail.subject.includes("Group A")));
    assert.ok(sofiaA.text.includes("from Thu 5 Nov to Thu 10 Dec"), sofiaA.text);
  });

  // Somebody added to a group after it first met was told it met "from" a day
  // already past (the walk of stage two, G5). They are told its next session,
  // on the group's own calendar; during its first session that is still the
  // one they are told, and with the first still to come nothing changes.
  test("a facilitator added after the group first met is told its next session, on the group's own calendar", async (t) => {
    t.after(() => mock.timers.setTime(NOW.getTime()));
    // Group A keeps the run's pace: Thursdays at 6pm from Thu 29 Oct to Thu 3 Dec.
    await placed();
    await sendTest();
    await pressNow();
    const toldTom = async (at) => {
      mock.timers.setTime(new Date(at).getTime());
      const before = realMail().length;
      const pressed = await pressNow();
      assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
      const mail = realMail().slice(before);
      assert.deepEqual(toOf(mail), ["tom@example.com"]);
      return (await opened(mail[0])).text;
    };
    // Half an hour into its first session, that session is still the one named.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom"] });
    // The room sits in the sentence since the board's words (October 2026).
    assert.ok((await toldTom("2026-10-29T18:30:00Z")).includes("Group A meets on Thursdays at 6pm in Portland A13, from Thu 29 Oct to Thu 3 Dec."));
    // The next morning, a second facilitator is told when the group next meets.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom", "rahul"] });
    mock.timers.setTime(new Date("2026-10-30T09:00:00Z").getTime());
    const before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    const rahul = await opened(realMail().slice(before).find((mail) => mail.to === "rahul@example.com" && mail.subject.includes("Group A")));
    assert.ok(rahul.text.includes("Group A meets on Thursdays at 6pm in Portland A13, from Thu 5 Nov to Thu 3 Dec."), rahul.text);
    assert.ok(!rahul.text.includes("Thu 29 Oct"), rahul.text);
  });

  test("on a group that keeps its own pace, the next session is on its own calendar", async (t) => {
    t.after(() => mock.timers.setTime(NOW.getTime()));
    // Group A starts a week after the run: Thursdays from Thu 5 Nov to Thu 10 Dec.
    world.db.poke(`courseGroups/${A}`, { paceStartDate: "2026-11-05" });
    await placed();
    await sendTest();
    await pressNow();
    // The run's first Thursday has passed, the group's has not: nothing changes yet.
    mock.timers.setTime(new Date("2026-10-30T09:00:00Z").getTime());
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom"] });
    let before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    const tom = await opened(realMail().slice(before)[0]);
    assert.ok(tom.text.includes("from Thu 5 Nov to Thu 10 Dec"), tom.text);
    // After the group's own first session, the next is its second.
    mock.timers.setTime(new Date("2026-11-06T09:00:00Z").getTime());
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom", "rahul"] });
    before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    const rahul = await opened(realMail().slice(before).find((mail) => mail.to === "rahul@example.com" && mail.subject.includes("Group A")));
    assert.ok(rahul.text.includes("from Thu 12 Nov to Thu 10 Dec"), rahul.text);
  });

  test("somebody moved after Publish is told their new group, and nobody else hears anything", async () => {
    await placed();
    await sendTest();
    await pressNow();
    const before = realMail().length;
    await place("zach", [{ uid: "amara", groupId: A }]);
    const shown = await summary();
    assert.deepEqual([shown.emails, shown.people, shown.facilitators], [1, 1, 0]);
    assert.equal((await pressNow()).status, 200);
    const moved = realMail().slice(before);
    assert.deepEqual(toOf(moved), ["amara@example.com"]);
    const amara = await opened(moved[0]);
    // Her new group, in the board's words since October 2026 (until then
    // "You're in Group A for AGI Strategy Fellowship"), counting Bea and Tariq, told before.
    assert.ok(
      amara.text.includes(
        "Hi Amara, You’re in Group A. You’ll meet on Thursdays at 6pm in Portland A13, starting Thu 29 Oct. Sessions last 2 hours. " +
          "Sofia is your facilitator. There are 3 of you.",
      ),
      amara.text,
    );
  });

  test("a room with a link typed into it is not printed, in either email", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.location": `Hallward B12 or ${LINK}` });
    await placed();
    await sendTest();
    await pressNow();
    const rahul = await opened(realMail().find((mail) => mail.to === "rahul@example.com"));
    // Until October 2026 "Where: You’ll find where it meets on your group page." on a line of its own.
    assert.ok(
      rahul.text.includes("Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec. You’ll find where it meets on your group page. You’re facilitating with Sofia."),
      rahul.text,
    );
    await nothingToFollow(world.mail);
  });
});

// ---------------------------------------------------------------------------
// 7. Somebody who has left
// ---------------------------------------------------------------------------

describe("7. somebody who has left the run is not waited for", () => {
  /** The board's rail, worked out by the function the board asks: accepted, placed, still to place by uid, left. */
  async function rail(who = "zach") {
    const shown = (await board(who)).body;
    const columns = new Set(shown.groups.map((group) => group.id));
    const counted = tally.boardTally(shown.people, (row) => !row.groupId || !columns.has(row.groupId));
    return [counted.accepted, counted.placed, counted.toPlace.map((row) => row.uid), counted.left];
  }

  // Remove is a programme's lead's as well as an admin's, and changing a row
  // from Accepted on the run's own list is an admin's alone. Until the walk of
  // stage two's fixes (G4) Publish waited for every Accepted row to be in a
  // group, so a lead who removed somebody could not publish again until an
  // admin changed their row. Somebody who has left is nobody to place now.
  test("removed by staff or withdrawn by themselves, they hold up neither the test nor the press, and the board counts them as left", async () => {
    await placed();
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    // The programme's lead removes Tariq; Bea leaves the run herself, as the
    // drop-out form leaves her enrolment (her group kept, her stamp gone).
    const removed = await call("claudia", routes.remove.POST, { runId: RUN.agi, uid: "tariq" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { status: "withdrawn", droppedOutAt: new Date(), allocatedEmailAt: null });
    // Both rows still say Accepted on the run's own list.
    assert.deepEqual(["bea", "tariq"].map((uid) => world.db.read(rowPath(uid)).status), ["accepted", "accepted"]);
    assert.deepEqual(await rail("claudia"), [4, 2, [], 2]);

    // The lead asks Tom to run Group B as well: his email is owed, and
    // nothing waits for the two who left.
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "tom"] });
    const shown = await summary("claudia");
    assert.deepEqual([shown.emails, shown.people, shown.facilitators, shown.refusals], [1, 0, 1, []]);
    const tested = await sendTest("claudia");
    assert.deepEqual([tested.status, tested.body.emails, tested.body.recorded], [200, 1, true]);
    const before = realMail().length;
    const pressed = await pressNow("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual([pressed.body.unplaced, pressed.body.report.people.sent, pressed.body.report.facilitators.sent], [[], 0, 1]);
    assert.deepEqual(toOf(realMail().slice(before)), ["tom@example.com"]);
  });

  test("somebody accepted with no place on the run still holds Publish, and is who the board would name", async () => {
    await placed();
    assert.equal((await call("zach", routes.remove.POST, { runId: RUN.agi, uid: "tariq" }, { course: true })).status, 200);
    // Accepted on the run's own list, and never given a place: no enrolment at all.
    world.db.seed(rowPath("nobody"), {
      runId: RUN.agi,
      courseId: world.db.read(`courseRuns/${RUN.agi}`).courseId,
      uid: "nobody",
      displayName: "Nell Carter",
      email: "nobody@example.com",
      status: "accepted",
    });
    assert.deepEqual(await rail(), [5, 3, ["nobody"], 1]);
    await sendTest();
    const before = everything();
    const refused = await pressNow();
    assert.deepEqual(refused, {
      status: 409,
      body: {
        error: "1 accepted applicant is not placed in a group yet. Everyone must be placed before allocation can be published.",
        unplaced: ["Nell Carter"],
      },
    });
    assert.equal(everything(), before, "a refused press wrote something");
  });
});

// ---------------------------------------------------------------------------
// 8. Week 1's guide
// ---------------------------------------------------------------------------

describe("8. the facilitators' email promises week 1's guide only while their group page shows it", () => {
  const BOARD_WORDS = "Their names and week 1’s guide are on your group page.";
  const NAMES_ONLY = "Their names are on your group page.";

  /** One document of a course's facilitator guide, as its loader stores one. */
  function loadGuide(slot, title, courseId = COURSE.agi) {
    world.db.seed(`courseFacilitatorGuide/${courseId}__${slot}`, {
      courseId,
      slot,
      weekNumber: Number(slot.slice(1, 3)),
      title,
      blocks: [{ type: "p", runs: [{ text: "Set the chairs out in a circle before anybody arrives." }] }],
      updatedAt: new Date(),
    });
  }

  /** Each facilitators' email this press sent, as "who: group: the sentence about names". */
  async function namesSentences(from = 0) {
    const out = [];
    for (const mail of realMail().slice(from).filter(isFacilitating)) {
      const text = (await opened(mail)).text;
      const said = /Their names? (?:and week 1’s guide are|is|are) on your group page\./.exec(text);
      out.push(`${mail.to}: ${mail.subject.replace("You’re facilitating ", "").split(":")[0]}: ${said ? said[0] : "(none)"}`);
    }
    return out.sort();
  }

  test("with week 1's session plan loaded, every facilitator told before their group first meets reads the board's whole sentence, in the test and the press", async () => {
    loadGuide("w01-plan", "Session 1: First look");
    await placed();
    await sendTest();
    const tested = await opened(world.mail.find((mail) => isTest(mail) && isFacilitating(mail)));
    assert.ok(tested.text.includes(`There are 2 people in the group. ${BOARD_WORDS} Open your group`), tested.text);
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(await namesSentences(), [
      `rahul@example.com: Group B: ${BOARD_WORDS}`,
      `sofia@example.com: Group A: ${BOARD_WORDS}`,
      `sofia@example.com: Group B: ${BOARD_WORDS}`,
    ]);
    await nothingToFollow(world.mail);
  });

  test("week 1's notes alone are enough, and a group of one reads right", async () => {
    loadGuide("w01-notes", "Week 1 notes: First look");
    await press();
    const done = await place("zach", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: A },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: A },
    ]);
    assert.equal(done.body.placed, 4, JSON.stringify(done.body));
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    const rahul = await opened(realMail().find((mail) => mail.to === "rahul@example.com" && isFacilitating(mail)));
    assert.ok(rahul.text.includes("There is 1 person in the group. Their name and week 1’s guide are on your group page. Open your group"), rahul.text);
  });

  test("no week 1 in the guide, week 1 only in another course's guide, or the course being destroyed: the names alone", async () => {
    const cases = [
      [
        "only later weeks loaded",
        () => {
          loadGuide("w02-plan", "Session 2: Second look");
          loadGuide("w03-notes", "Week 3 notes: Reading the sky");
        },
      ],
      ["week 1 in another course's guide", () => loadGuide("w01-plan", "Session 1: First look", COURSE.tais)],
      [
        "the course being destroyed",
        () => {
          loadGuide("w01-plan", "Session 1: First look");
          world.db.poke(`courses/${COURSE.agi}`, { destroying: true });
        },
      ],
    ];
    for (const [label, arrange] of cases) {
      reset(hubSeed(), { now: () => new Date() });
      arrange();
      await placed();
      await sendTest();
      const before = realMail().length;
      assert.equal((await pressNow()).status, 200, label);
      assert.deepEqual(
        await namesSentences(before),
        [`rahul@example.com: Group B: ${NAMES_ONLY}`, `sofia@example.com: Group A: ${NAMES_ONLY}`, `sofia@example.com: Group B: ${NAMES_ONLY}`],
        label,
      );
    }
  });

  test("once the group has met, its next session is week 2, so week 1's guide is promised no more, though it is loaded", async (t) => {
    t.after(() => mock.timers.setTime(NOW.getTime()));
    loadGuide("w01-plan", "Session 1: First look");
    await placed();
    await sendTest();
    await pressNow();
    assert.deepEqual(await namesSentences(), [
      `rahul@example.com: Group B: ${BOARD_WORDS}`,
      `sofia@example.com: Group A: ${BOARD_WORDS}`,
      `sofia@example.com: Group B: ${BOARD_WORDS}`,
    ]);
    // Half an hour into Group A's first session it is still the one named, and still week 1.
    mock.timers.setTime(new Date("2026-10-29T18:30:00Z").getTime());
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom"] });
    let before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(await namesSentences(before), [`tom@example.com: Group A: ${BOARD_WORDS}`]);
    // The next morning Group A's next session is its week 2: the names alone,
    // while Group B, which has not met, still promises it.
    mock.timers.setTime(new Date("2026-10-30T09:00:00Z").getTime());
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom", "rahul"] });
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "tom"] });
    before = realMail().length;
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(await namesSentences(before), [
      `rahul@example.com: Group A: ${NAMES_ONLY}`,
      `tom@example.com: Group B: ${BOARD_WORDS}`,
    ]);
  });
});
