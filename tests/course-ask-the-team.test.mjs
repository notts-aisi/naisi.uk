/**
 * ASK THE TEAM: A MEMBER SENDS THE TEAM A MESSAGE, AND AN ADMIN REPLIES.
 * The send from the member's own page, the daily limit, the admins' email
 * behind its own switch and under its cap, the message's row on the Requests
 * page and its own page, Take it, the reply (which closes it and emails the
 * person), the member's own list with the reply, Home's count, and that a
 * message belongs to no programme, so no reader of another kind sees it.
 *
 *   POST /api/courses/requests/ask                        any approved account
 *   POST /api/courses/requests/[requestId]/team/take      admins
 *   POST /api/courses/requests/[requestId]/team/reply     admins
 *   POST /api/courses/requests/emails { which: "team" }   an admin's own second switch
 *   /ask-the-team                                         the member's page
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe holds a told place in Group B;
 * "nobody" is a member on nothing; Claudia leads the programme; Zach is an
 * admin, and Ada is a second admin the suite adds.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NOW, RUN, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__askTheTeam");
const { world, call } = w;
const askRoute = await w.courseRoute("requests", "ask");
const takeRoute = await w.courseRoute("requests", "[requestId]", "team", "take");
const replyRoute = await w.courseRoute("requests", "[requestId]", "team", "reply");
const emailsRoute = await w.courseRoute("requests", "emails");
const askPage = (await w.loadTs(join("app", "(app)", "ask-the-team", "page.tsx"))).default;
const RequestsList = (await w.loadTs(join("features", "courses", "requests", "RequestsList.tsx"))).default;
const TeamMessagePage = (await w.loadTs(join("features", "courses", "requests", "TeamMessagePage.tsx"))).default;
const { loadTeamMessagePage } = await w.loadTs(join("lib", "courses", "teamAsk", "page.ts"));
const { loadRequestsPage } = await w.loadTs(join("lib", "courses", "requests", "load.ts"));
const home = await w.loadTs(join("lib", "courses", "requests", "home.ts"));
const { normalizeCourseRequest } = await w.loadTs(join("lib", "firestore", "courseRequests.ts"));
const { normalizeExcusedRequest } = await w.loadTs(join("lib", "firestore", "courseExcusedRequests.ts"));
const { normalizeVisitRequest } = await w.loadTs(join("lib", "firestore", "courseMemberRequests.ts"));
const { normalizeTeamMessage } = await w.loadTs(join("lib", "firestore", "courseTeamAsks.ts"));
const pageWords = await w.loadTs(join("lib", "courses", "registerCorrection", "pageWords.ts"));
const words = await w.loadTs(join("lib", "courses", "teamAsk", "words.ts"));

const read = (path) => world.db.read(path);
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`));
const messages = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseRequests/"))
    .map((path) => ({ id: path.slice("courseRequests/".length), ...read(path) }))
    .filter((doc) => doc.kind === "team-message");

const ask = (who, body, options = {}) => call(who, askRoute.POST, {}, { body, course: true, ...options });
const take = (who, requestId) => call(who, takeRoute.POST, { requestId }, { body: {}, course: true });
const reply = (who, requestId, text) => call(who, replyRoute.POST, { requestId }, { body: { reply: text }, course: true });

const SITE_WORDS = "Week 2's second reading link goes nowhere.\nIt says the page can't be found.";

async function chloeSends(body = { topic: "site", words: SITE_WORDS }) {
  const answer = await ask("chloe", body);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return answer.body.request.id;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  // A second admin, so an admin's own message has somebody to answer it.
  world.db.seed("users/ada", { ...read("users/zach"), uid: "ada", email: "ada@example.com", displayName: "Ada Lovell", profile: { ...read("users/zach").profile, preferredName: "Ada Lovell" } });
  world.db.seed("users/pat", { ...read("users/nobody"), uid: "pat", email: "pat@example.com", role: "pending" });
});

describe("1. Sending", () => {
  test("a member's message is one request of its own kind, about no programme, read by its own normaliser alone", async () => {
    world.mail.length = 0;
    const id = await chloeSends();
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.kind, "team-message");
    assert.equal(doc.runId, "");
    assert.equal(doc.groupId, "");
    assert.equal(doc.roundId, null);
    assert.equal(doc.programmeId, null);
    assert.equal(doc.subjectUid, "chloe");
    assert.equal(doc.askedByUid, "chloe");
    assert.equal(doc.askedOn, "2026-11-17");
    assert.equal(doc.status, "waiting");
    assert.deepEqual(doc.change.topic, "site");
    assert.equal(doc.change.words, SITE_WORDS);
    assert.deepEqual(doc.change.replies, []);
    assert.deepEqual(doc.history.map((entry) => [entry.what, entry.byUid]), [["asked", "chloe"]]);
    // Every other kind's reader skips it.
    assert.equal(normalizeCourseRequest(id, doc), null);
    assert.equal(normalizeExcusedRequest(id, doc), null);
    assert.equal(normalizeVisitRequest(id, doc), null);
    assert.ok(normalizeTeamMessage(id, doc));
    // One that names a run is not a message to the team.
    assert.equal(normalizeTeamMessage(id, { ...doc, runId: RUN.agi }), null);
    // Off unless switched on: nobody is emailed.
    assert.equal(world.mail.length, 0);
  });

  test("an admin who switched it on is emailed who, what about and when, never what they wrote; never the sender", async () => {
    world.db.poke("users/zach", { requestEmails: { team: true } });
    world.mail.length = 0;
    const id = await chloeSends();
    const toZach = mailTo("zach");
    assert.equal(toZach.length, 1);
    assert.equal(toZach[0].subject, "Chloe Nguyen sent the team a message");
    assert.equal(toZach[0].kind, "course-request");
    const text = JSON.stringify(toZach[0]);
    assert.match(text, /Chloe Nguyen sent the team a message today at 12pm, about something wrong on the site\./);
    assert.match(text, /What they wrote is on the request’s page, and isn’t in this email\./);
    assert.match(text, /You get this because you switched on emails about messages to the team\. You can switch it off on the Requests page\./);
    assert.match(text, new RegExp(`/admin/admissions/requests/${id}`));
    assert.doesNotMatch(text, /reading link/);
    assert.equal(mailTo("ada").length, 0, "an admin who did not switch it on is not emailed");
    assert.equal(read(`courseRequests/${id}`).adminsToldOn, "2026-11-17");

    // "Something else" says so; an admin's own message never emails them.
    world.db.poke("users/ada", { requestEmails: { team: true } });
    world.mail.length = 0;
    assert.equal((await ask("zach", { topic: "else", words: "Can I bring a friend to a social?" })).status, 200);
    await w.settle();
    assert.equal(mailTo("zach").length, 0);
    assert.match(JSON.stringify(mailTo("ada")[0]), /Zach Levin sent the team a message today at 12pm, about something else\./);
  });

  test("the switch for requests to be excused does not let these through, and the second switch is the admin's own", async () => {
    world.db.poke("users/zach", { requestEmails: { excused: true } });
    world.mail.length = 0;
    await chloeSends();
    assert.equal(mailTo("zach").length, 0);
    const on = await call("zach", emailsRoute.POST, {}, { body: { on: true, which: "team" }, course: true });
    assert.equal(on.status, 200);
    assert.deepEqual(read("users/zach").requestEmails, { excused: true, team: true });
    assert.equal((await call("chloe", emailsRoute.POST, {}, { body: { on: true, which: "team" }, course: true })).status, 403);
  });

  test("the first three a day email the admins; the fourth and fifth wait quietly; a sixth is refused and writes nothing", async () => {
    world.db.poke("users/zach", { requestEmails: { team: true } });
    world.mail.length = 0;
    for (let i = 1; i <= 5; i += 1) await chloeSends({ topic: "else", words: `Question ${i}` });
    assert.equal(mailTo("zach").length, 3);
    assert.equal(messages().filter((doc) => doc.adminsToldOn === "2026-11-17").length, 3);
    const sixth = await ask("chloe", { topic: "else", words: "Question 6" });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error, "You’ve sent the team five messages today. Try again tomorrow, or email ai-safety@uonsu.com.");
    assert.equal(messages().length, 5);
    // The next London day starts again.
    mock.timers.setTime(new Date("2026-11-18T09:00:00Z").getTime());
    assert.equal((await ask("chloe", { topic: "else", words: "Question 7" })).status, 200);
  });

  test("refusals, each one sentence and nothing written: the order is view-as, signed out, approved, then the body", async () => {
    assert.equal((await ask("chloe", { topic: "site", words: "x" }, { viewAs: true })).status, 403);
    assert.equal((await ask(null, { topic: "site", words: "x" })).status, 401);
    assert.equal((await ask("pat", { topic: "site", words: "x" })).status, 403);
    assert.equal((await ask("chloe", {})).body.error, "Choose what it’s about first.");
    // A topic the form does not write here: "One week at another session" is a link to its own form,
    // and access needs come from the access form (tests/course-ask-access-needs.test.mjs).
    assert.equal((await ask("chloe", { topic: "visit", words: "x" })).body.error, "That choice isn’t on the form any more. Reload the page and choose again.");
    assert.equal((await ask("chloe", { topic: "move", words: "x" })).body.error, "That choice isn’t on the form any more. Reload the page and choose again.");
    assert.equal((await ask("chloe", { topic: "site", words: "  " })).body.error, "Write your message first.");
    assert.equal(
      (await ask("chloe", { topic: "site", words: "a".repeat(2001) })).body.error,
      "Your message is longer than 2,000 characters. Shorten it, then press Send to the team again.",
    );
    assert.equal((await ask("chloe", { topic: "site", words: "x", who: "zach" })).status, 400);
    assert.equal(messages().length, 0);
    // A link is allowed in a message: the address of a broken page is the point.
    assert.equal((await ask("chloe", { topic: "site", words: "https://naisi.uk/learn is blank" })).status, 200);
  });
});

describe("2. No reader of another kind, and no run, sees one", () => {
  test("a programme's counts are unchanged; the Requests page lists it for admins alone, in its own kind; Home counts it as a message", async () => {
    const before = await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("zach"), RUN.agi, { excused: true });
    await chloeSends();
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("zach"), RUN.agi, { excused: true }), before);
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("claudia"), RUN.agi), 0);

    const admin = await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date());
    const rows = admin.view.rows.filter((row) => row.kind === "team-message");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, "waiting");
    assert.equal(rows[0].subject.name, "Chloe Nguyen");
    assert.equal(rows[0].about, "Week 2's second reading link goes nowhere.");
    assert.equal(rows[0].runId, "");
    const lead = await loadRequestsPage(world.courseDb, w.sessionOf("claudia"), new Date());
    assert.equal(lead.status === "ok" ? lead.view.rows.filter((row) => row.kind === "team-message").length : 0, 0);

    const waiting = await home.requestsWaitingFor(world.courseDb, w.sessionOf("zach"), new Date());
    assert.equal(waiting.messages, 1);
    assert.equal(waiting.excused, 0);
    assert.equal(waiting.visits, 0);
    assert.equal(waiting.corrections, 0);
    // Every kind counted by itself, and together they are the whole count.
    assert.equal(waiting.corrections + waiting.excused + waiting.visits + waiting.moves + waiting.messages + waiting.access, waiting.count);
    assert.equal(
      pageWords.requestsWaitingLine({ corrections: waiting.corrections, excused: waiting.excused, visits: waiting.visits, messages: waiting.messages }),
      "Somebody has sent the team a message.",
    );
    assert.equal(pageWords.requestsWaitingLine({ corrections: 0, messages: 3 }), "3 messages to the team are waiting.");
  });

  test("a message's page is an admin's alone, with their place this term, what they wrote as text, and no programme's lead sees it", async () => {
    const id = await chloeSends();
    assert.equal((await loadTeamMessagePage(world.courseDb, w.sessionOf("claudia"), id)).status, "none");
    assert.equal((await loadTeamMessagePage(world.courseDb, w.sessionOf("chloe"), id)).status, "none");
    const loaded = await loadTeamMessagePage(world.courseDb, w.sessionOf("zach"), id);
    assert.equal(loaded.status, "ok");
    assert.equal(loaded.view.places.length, 1);
    assert.equal(loaded.view.places[0].groupName, "Group B");
    const text = textOf(renderToStaticMarkup(createElement(TeamMessagePage, { view: loaded.view })));
    assert.match(text, /Chloe Nguyen: something’s wrong on the site/);
    assert.match(text, /Sent .*12pm/);
    assert.match(text, /Group B with/);
    assert.match(text, /Week 2's second reading link goes nowhere\. It says the page can't be found\./);
    assert.match(text, /Reply to Chloe/);
    assert.match(text, /Send the reply/);
    assert.match(text, /Sent by email and shown under Chloe’s message\. Sending it closes the message\./);
    assert.match(text, /Handling Nobody has it yet\. Take it/);
    assert.match(text, /History .*Chloe sent this/);

    // Somebody on nothing.
    assert.equal((await ask("nobody", { topic: "else", words: "Hello" })).status, 200);
    const theirs = messages().find((doc) => doc.askedByUid === "nobody");
    const view = await loadTeamMessagePage(world.courseDb, w.sessionOf("zach"), theirs.id);
    assert.match(textOf(renderToStaticMarkup(createElement(TeamMessagePage, { view: view.view }))), /Not on a programme this term\./);
  });
});

describe("3. Take it, and the reply", () => {
  test("Take it is an admin's, never the sender's, and emails nobody", async () => {
    const id = await chloeSends();
    world.mail.length = 0;
    assert.equal((await take("chloe", id)).status, 403);
    assert.equal((await take("claudia", id)).status, 403);
    assert.equal((await take(null, id)).status, 401);
    assert.equal((await take("zach", "noSuchMessage")).status, 404);
    const taken = await take("zach", id);
    assert.equal(taken.status, 200);
    assert.equal(read(`courseRequests/${id}`).handlingUid, "zach");
    assert.equal((await take("zach", id)).body.error, "You have it already.");
    assert.equal((await take("ada", id)).status, 200, "another admin may take it over");
    assert.equal(world.mail.length, 0);
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows.filter((row) => row.kind === "team-message");
    assert.equal(rows[0].state, "handling");
  });

  test("one reply stores it, closes the message and emails the person the reply, never their own words; a second is refused", async () => {
    const id = await chloeSends();
    world.mail.length = 0;
    assert.equal((await reply("chloe", id, "Thanks")).status, 403);
    assert.equal((await reply("claudia", id, "Thanks")).status, 403);
    assert.equal((await reply(null, id, "Thanks")).status, 401);
    const answered = await reply("zach", id, "Fixed now, thanks for telling us.");
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.equal(answered.body.status, "replied");
    assert.equal(answered.body.emailed.person, "sent");
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.status, "replied");
    assert.equal(doc.reply, "Fixed now, thanks for telling us.");
    assert.equal(doc.decidedByUid, "zach");
    assert.equal(doc.change.replies.length, 1);
    assert.deepEqual(doc.history.map((entry) => entry.what), ["asked", "replied"]);
    const toChloe = mailTo("chloe");
    assert.equal(toChloe.length, 1);
    assert.equal(toChloe[0].subject, "About your message to the team");
    assert.equal(toChloe[0].kind, "team-reply");
    const text = JSON.stringify(toChloe[0]);
    assert.match(text, /Zach replied to the message you sent the team today\./);
    assert.match(text, /Zach says: “Fixed now, thanks for telling us\.”/);
    assert.match(text, /Open Ask the team/);
    assert.match(text, /\/ask-the-team/);
    assert.doesNotMatch(text, /reading link/);
    // Once answered.
    assert.equal((await reply("ada", id, "Also fixed.")).body.error, "It’s already been answered.");
    assert.equal((await take("ada", id)).body.error, "It’s already been answered.");
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view;
    assert.equal(rows.rows.find((row) => row.id === id).state, "replied");
    assert.equal(rows.counts.doneThisWeek, 1);
  });

  test("the reply's rules: needed, one paragraph, no link, 600 characters; never to your own message", async () => {
    const id = await chloeSends();
    assert.equal((await reply("zach", id, "")).body.error, "Write the reply first.");
    assert.equal((await reply("zach", id, "One.\nTwo.")).body.error, "The reply must be one paragraph.");
    assert.equal((await reply("zach", id, "See https://naisi.uk/help")).body.error, "The reply can’t include a link.");
    assert.equal((await reply("zach", id, "a".repeat(601))).body.error, "The reply is longer than 600 characters.");
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal((await ask("zach", { topic: "else", words: "A question of my own" })).status, 200);
    const own = messages().find((doc) => doc.askedByUid === "zach");
    assert.equal((await reply("zach", own.id, "Answering myself")).body.error, "You can’t reply to your own message.");
    const ownTake = await take("zach", own.id);
    assert.equal(ownTake.status, 403);
    assert.equal(ownTake.body.error, "You sent this, so another admin takes it.");
    assert.equal((await reply("ada", own.id, "Answered.")).status, 200);
  });
});

describe("4. The member's page", () => {
  test("somebody with a told place: the written topics and the way to another session, their own messages with the reply, and the way to the programme page", async () => {
    const id = await chloeSends();
    await reply("zach", id, "Fixed now.");
    mock.timers.setTime(new Date("2026-11-17T13:05:00Z").getTime());
    await chloeSends({ topic: "else", words: "Is there a reading list for the holidays, after week 6?" });
    const page = await w.draw(askPage, "chloe", {});
    assert.equal(page.to, null);
    assert.equal(page.wrote, false);
    for (const line of [
      "Ask the team",
      "Goes to the people running NAISI. You’ll get a reply here and by email.",
      "What’s it about?",
      "One week at another session Opens this week’s other sessions.",
      "Something’s wrong on the site",
      "Something else",
      "Your message",
      "Please don’t include medical details or anything about your health.",
      "Send to the team",
      "Your requests",
      "Something else: Is there a reading list for the holidays, after… Sent Tue 17 Nov Waiting",
      "Something’s wrong: Week 2's second reading link goes nowhere. Zach replied Tue 17 Nov: “Fixed now.” Replied",
      "Requests about your sessions and your group are on your programme page. Open your programme page",
    ]) {
      assert.ok(page.text.includes(line), `the page does not say: ${line}\n${page.text}`);
    }
    assert.match(page.html, new RegExp(`href="/learn/${RUN.agi}/another-session"`));
    assert.match(page.html, new RegExp(`href="/learn/${RUN.agi}"`));
    // Only the topics whose flows exist: access needs, with its line, among them.
    assert.ok(page.text.includes("Access needs Only admins read it."));
    for (const later of ["Changing group for good", "Can’t make any session this week"]) assert.ok(!page.text.includes(later), later);
    // Newest first.
    assert.ok(page.text.indexOf("Something else: Is there") < page.text.indexOf("Something’s wrong: Week 2"));
  });

  test("somebody on nothing: the two written topics, nothing sent yet, and no way to a programme", async () => {
    const page = await w.draw(askPage, "nobody", {});
    assert.ok(page.text.includes("Nothing sent yet."));
    assert.ok(!page.text.includes("One week at another session"));
    assert.ok(!page.text.includes("Requests about your sessions"));
    assert.ok(page.text.includes("Something’s wrong on the site"));
  });

  test("another member's messages are never on the page", async () => {
    await chloeSends();
    const page = await w.draw(askPage, "amara", {});
    assert.ok(page.text.includes("Nothing sent yet."));
    assert.ok(!page.text.includes("reading link"));
  });

  test("the row's title is the start of the message, cut at a word", () => {
    assert.equal(words.excerptOf("Short one"), "Short one");
    assert.equal(words.excerptOf("\nFirst line\nsecond"), "First line");
    const long = words.excerptOf("The reading for week four has a link that goes to a page that is not there any more");
    assert.ok(long.endsWith("…") && long.length <= 50, long);
  });
});

describe("5. Since the review", () => {
  test("a member with many requests of other kinds still sees every message of theirs, newest first", async () => {
    for (let i = 0; i < 60; i += 1) {
      world.db.seed(`courseRequests/other${String(i).padStart(2, "0")}`, {
        kind: i % 2 ? "excused" : "visit",
        runId: RUN.agi,
        askedByUid: "chloe",
        subjectUid: "chloe",
        status: "withdrawn",
        askedAt: new Date("2026-11-01T10:00:00Z"),
      });
    }
    mock.timers.setTime(new Date("2026-11-16T10:00:00Z").getTime());
    await chloeSends({ topic: "else", words: "The older one" });
    mock.timers.setTime(NOW.getTime());
    await chloeSends({ topic: "site", words: "The newest one" });
    const page = await w.draw(askPage, "chloe", {});
    assert.ok(page.text.includes("Something’s wrong: The newest one"), page.text);
    assert.ok(page.text.indexOf("The newest one") < page.text.indexOf("The older one"));
  });

  test("the reply's sentence says what became of the email: sent, no address, or held back", () => {
    assert.equal(words.repliedSaidWords("Chloe", "sent"), "Replied. Chloe has been emailed.");
    assert.equal(words.repliedSaidWords("Chloe", "no-address"), "Replied. Chloe has no address we can email, so it shows on their page only.");
    assert.equal(words.repliedSaidWords("Chloe", "suppressed"), "Replied. Nobody was emailed.");
    assert.equal(words.repliedSaidWords("Chloe", "failed"), "Replied. Nobody was emailed.");
  });

  test("a suppressed address: the reply is stored and the route says it was not sent", async () => {
    const id = await chloeSends();
    world.mailFate = (args) => (args.to.startsWith("chloe@") ? "suppressed" : "sent");
    try {
      const answered = await reply("zach", id, "Fixed now.");
      assert.equal(answered.status, 200);
      assert.equal(answered.body.emailed.person, "suppressed");
      assert.equal(read(`courseRequests/${id}`).status, "replied");
    } finally {
      world.mailFate = undefined;
    }
  });

  test("the Requests page draws the section, the second switch and the line for an admin, adds no programme to the filter, and draws none of it for a lead", async () => {
    const replied = await chloeSends();
    await reply("zach", replied, "Fixed now.");
    await chloeSends({ topic: "else", words: "Can I bring a friend to a social?" });
    const admin = await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date());
    const html = renderToStaticMarkup(createElement(RequestsList, { view: admin.view, emailMe: true, emailMeTeam: false }));
    const text = textOf(html);
    assert.ok(text.includes("Something’s wrong, something else"), text);
    assert.ok(text.includes("Chloe Nguyen · Something else “Can I bring a friend to a social?” · Tue 17 Nov · Nobody has it yet Waiting Open"), text);
    // The replied one is in the Done this week view, not the Waiting one drawn first.
    assert.ok(!text.includes("Zach replied"), text);
    assert.ok(text.includes("Email me about messages to the team"));
    assert.ok(text.includes("When somebody sends the team a message: who, what it’s about and when, never what they wrote."));
    assert.ok(
      text.includes(
        "Messages to the team, access needs among them, are for admins only: no programme’s lead or facilitator sees them. A new one emails an admin only if they switch it on above. Replying emails the person and closes the message.",
      ),
    );
    // The switch is drawn before the line that says it is above.
    assert.ok(text.indexOf("Email me about messages to the team") < text.indexOf("switch it on above"));
    assert.ok(!html.includes(">A programme<"), "a message adds a made-up programme to the filter");
    assert.match(html, /role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"|type="checkbox"/);
    assert.equal(admin.view.counts.doneThisWeek, 1, "the replied message is done this week");

    const lead = await loadRequestsPage(world.courseDb, w.sessionOf("claudia"), new Date());
    assert.equal(lead.status, "ok");
    const leadText = textOf(renderToStaticMarkup(createElement(RequestsList, { view: lead.view, emailMe: null, emailMeTeam: null })));
    assert.ok(!leadText.includes("Something’s wrong, something else"));
    assert.ok(!leadText.includes("Email me about messages to the team"));
    assert.ok(!leadText.includes("Messages to the team, access needs among them, are for admins only"));
  });
});
