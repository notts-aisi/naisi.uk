/**
 * ASK THE TEAM: ACCESS NEEDS. A member tells the admins what would help them
 * take part; only admins can open what was written, one ask at a time, and
 * each opening is recorded in the transaction that reads it.
 *
 *   POST /api/courses/requests/ask { topic: "access", words, tellFacilitator }   any approved account
 *   POST /api/courses/requests/[requestId]/team/open                             admins, never the sender
 *   POST /api/courses/requests/[requestId]/team/take                             admins, as for a message
 *   POST /api/courses/requests/[requestId]/team/reply                            admins, as for a message
 *   /ask-the-team, the Requests page and one request's page
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe holds a told place in Group B,
 * which Rahul and Sofia facilitate; Amara is another member; Claudia leads
 * the programme; Zach is an admin, and Ada is a second admin the suite adds.
 *
 * WHAT IS PROVED, by every kind of caller: what each gets from the send, the
 * list, the request page, the opening, Take it and the reply; that an
 * opening and its record are one transaction (a record that cannot be
 * written returns no words); that the words, planted as a marker, appear in
 * NO response, page, email or log line but the one opening's answer; and
 * that the account cascade takes the ask and keeps the record of each
 * opening, as it keeps the record of each opening of an application's
 * access requirements.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { B, NOW, RUN, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__askAccessNeeds");
const { world, call } = w;
const askRoute = await w.courseRoute("requests", "ask");
const openRoute = await w.courseRoute("requests", "[requestId]", "team", "open");
const takeRoute = await w.courseRoute("requests", "[requestId]", "team", "take");
const replyRoute = await w.courseRoute("requests", "[requestId]", "team", "reply");
const askPage = (await w.loadTs(join("app", "(app)", "ask-the-team", "page.tsx"))).default;
const RequestsList = (await w.loadTs(join("features", "courses", "requests", "RequestsList.tsx"))).default;
const AccessNeedsPage = (await w.loadTs(join("features", "courses", "requests", "AccessNeedsPage.tsx"))).default;
const { loadAccessNeedsPage, loadTeamMessagePage } = await w.loadTs(join("lib", "courses", "teamAsk", "page.ts"));
const { loadRequestsPage, loadRequestPage } = await w.loadTs(join("lib", "courses", "requests", "load.ts"));
const { loadExcusedRequestPage } = await w.loadTs(join("lib", "courses", "excused", "page.ts"));
const { loadVisitRequestPage } = await w.loadTs(join("lib", "courses", "visitRequest", "page.ts"));
const home = await w.loadTs(join("lib", "courses", "requests", "home.ts"));
const { normalizeCourseRequest } = await w.loadTs(join("lib", "firestore", "courseRequests.ts"));
const { normalizeExcusedRequest } = await w.loadTs(join("lib", "firestore", "courseExcusedRequests.ts"));
const { normalizeVisitRequest } = await w.loadTs(join("lib", "firestore", "courseMemberRequests.ts"));
const { normalizeTeamMessage, normalizeAccessNeeds } = await w.loadTs(join("lib", "firestore", "courseTeamAsks.ts"));
const { isCourseAuditKind, courseAuditKindLabel } = await w.loadTs(join("lib", "firestore", "courseAudit.ts"));
const words = await w.loadTs(join("lib", "courses", "teamAsk", "words.ts"));
const MemberText = (await w.loadTs(join("components", "ui", "MemberText.tsx"))).default;
const { withAccessEvent } = await w.loadTs(join("lib", "firestore", "courseTeamAsks.ts"));
const requestPage = (await w.loadTs(join("app", "(app)", "admin", "admissions", "requests", "[requestId]", "page.tsx"))).default;
const changeGroupPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "change-group", "page.tsx"))).default;
const anotherSessionPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "another-session", "page.tsx"))).default;
const pageWords = await w.loadTs(join("lib", "courses", "registerCorrection", "pageWords.ts"));

/** What a member writes, planted so a search can find it anywhere it should not be. */
const MARKER = "Qx7-access-marker: a step-free room for the Tuesday sessions";

const read = (path) => world.db.read(path);
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`));
const docsIn = (collection) =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`${collection}/`))
    .map((path) => ({ id: path.slice(collection.length + 1), ...read(path) }));
const accessAsks = () => docsIn("courseRequests").filter((doc) => doc.kind === "access-needs");
const openings = () => docsIn("courseAudit").filter((doc) => doc.kind === "access-needs-read");

const ask = (who, body, options = {}) => call(who, askRoute.POST, {}, { body, course: true, ...options });
const open = (who, requestId, options = {}) => call(who, openRoute.POST, { requestId }, { body: {}, course: true, ...options });
const take = (who, requestId, options = {}) => call(who, takeRoute.POST, { requestId }, { body: {}, course: true, ...options });
const reply = (who, requestId, text, options = {}) => call(who, replyRoute.POST, { requestId }, { body: { reply: text }, course: true, ...options });

/**
 * THE MAIL DOOR AS A REAL SEND LEAVES IT. The world's stand-in records what
 * it is handed and writes no log row; a real send writes one `emailSends` row
 * per recipient (`logEmailSend` in src/lib/email/send.ts), which outlives the
 * account. So each message handed over here also writes the row a real send
 * would, with the same fields, and `renderedEmail` renders it the way the
 * real door does, HTML and plain text, for a search to read.
 */
let sends = 0;
const handOver = Array.prototype.push;
world.mail.push = function (...messages) {
  for (const args of messages) {
    handOver.call(this, args);
    sends += 1;
    world.db.seed(`emailSends/send${sends}`, {
      messageId: `m${sends}`,
      to: args.to,
      subject: args.subject,
      fromEmail: "hello@naisi.invalid",
      fromName: "NAISI",
      kind: args.kind ?? "unknown",
      surface: args.surface ?? null,
      actorUid: args.actorUid ?? null,
      referenceId: args.referenceId ?? null,
    });
  }
  return this.length;
};
async function renderedEmail(message) {
  return { subject: message.subject, html: await render(message.react), text: await render(message.react, { plainText: true }) };
}

/** Every line the code under test logs, kept so a search can read them. */
const logged = [];
for (const level of ["log", "info", "warn", "error", "debug"]) {
  const original = console[level];
  console[level] = (...args) => {
    logged.push(args.map((each) => (each instanceof Error ? `${each.name} ${each.message} ${each.stack}` : typeof each === "string" ? each : JSON.stringify(each))).join(" "));
    if (process.env.SHOW_LOGS) original(...args);
  };
}

async function chloeAsks(body = { topic: "access", words: MARKER, tellFacilitator: true }) {
  const answer = await ask("chloe", body);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return answer.body.request.id;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  logged.length = 0;
  world.db.beforeCommit = null;
  world.db.seed("users/ada", { ...read("users/zach"), uid: "ada", email: "ada@example.com", displayName: "Ada Lovell", profile: { ...read("users/zach").profile, preferredName: "Ada Lovell" } });
  world.db.seed("users/pat", { ...read("users/nobody"), uid: "pat", email: "pat@example.com", role: "pending" });
});

describe("1. Sending", () => {
  test("an access ask is one request of its own kind, about no programme; its answer is the id and the time, never the words", async () => {
    world.mail.length = 0;
    const answer = await ask("chloe", { topic: "access", words: MARKER, tellFacilitator: true });
    assert.equal(answer.status, 200);
    assert.deepEqual(Object.keys(answer.body).sort(), ["ok", "request"]);
    assert.deepEqual(Object.keys(answer.body.request).sort(), ["askedAt", "id"]);
    assert.ok(!JSON.stringify(answer.body).includes("Qx7"));
    const doc = read(`courseRequests/${answer.body.request.id}`);
    assert.equal(doc.kind, "access-needs");
    assert.equal(doc.runId, "");
    assert.equal(doc.groupId, "");
    assert.equal(doc.roundId, null);
    assert.equal(doc.subjectUid, "chloe");
    assert.equal(doc.askedByUid, "chloe");
    assert.equal(doc.status, "waiting");
    assert.deepEqual(doc.change, { words: MARKER, tellFacilitator: true, replies: [] });
    // Every other kind's reader skips it, and its own holds neither the words nor the tick.
    const id = answer.body.request.id;
    assert.equal(normalizeCourseRequest(id, doc), null);
    assert.equal(normalizeExcusedRequest(id, doc), null);
    assert.equal(normalizeVisitRequest(id, doc), null);
    assert.equal(normalizeTeamMessage(id, doc), null);
    const own = normalizeAccessNeeds(id, doc);
    assert.ok(own);
    assert.ok(!JSON.stringify(own).includes("Qx7"));
    assert.ok(!("words" in own) && !("tellFacilitator" in own));
    assert.equal(normalizeAccessNeeds(id, { ...doc, runId: RUN.agi }), null, "one that names a run is not an access ask");
    // Off unless switched on: nobody is emailed.
    assert.equal(world.mail.length, 0);
  });

  test("the tick is off unless it is a true", async () => {
    const id = await chloeAsks({ topic: "access", words: "A seat near the door." });
    assert.equal(read(`courseRequests/${id}`).change.tellFacilitator, false);
  });

  test("refusals, each one sentence and nothing written: view-as, signed out, waiting, then the body", async () => {
    assert.equal((await ask("chloe", { topic: "access", words: MARKER }, { viewAs: true })).status, 403);
    assert.equal((await ask(null, { topic: "access", words: MARKER })).status, 401);
    assert.equal((await ask("pat", { topic: "access", words: MARKER })).status, 403);
    assert.equal((await ask("chloe", { topic: "access", words: "   " })).body.error, "Write what would help first.");
    assert.equal(
      (await ask("chloe", { topic: "access", words: "a".repeat(2001) })).body.error,
      "What you wrote is longer than 2,000 characters. Shorten it, then press Send to admins again.",
    );
    assert.equal((await ask("chloe", { topic: "access", words: "x", tellFacilitator: "yes" })).status, 400);
    // The tick belongs to the access form alone.
    assert.equal((await ask("chloe", { topic: "else", words: "x", tellFacilitator: true })).status, 400);
    assert.equal((await ask("chloe", { topic: "access", words: "x", who: "zach" })).status, 400);
    assert.equal(accessAsks().length, 0);
  });

  test("access asks and messages share the five a day", async () => {
    for (let i = 1; i <= 3; i += 1) assert.equal((await ask("chloe", { topic: "else", words: `Question ${i}` })).status, 200);
    for (let i = 1; i <= 2; i += 1) assert.equal((await ask("chloe", { topic: "access", words: `Need ${i}` })).status, 200);
    const sixth = await ask("chloe", { topic: "access", words: "Need 3" });
    assert.equal(sixth.status, 429);
    assert.equal(accessAsks().length, 2);
  });

  test("an admin who switched on messages to the team is told that somebody sent one and when, and that opening it is recorded; never who, the words or the tick", async () => {
    world.db.poke("users/zach", { requestEmails: { team: true } });
    world.mail.length = 0;
    const id = await chloeAsks();
    assert.equal(mailTo("ada").length, 0, "an admin who did not switch it on is not emailed");
    for (const uid of ["claudia", "rahul", "sofia", "amara", "chloe"]) assert.equal(mailTo(uid).length, 0, `${uid} was emailed`);
    const toZach = mailTo("zach");
    assert.equal(toZach.length, 1);
    assert.equal(toZach[0].subject, "Somebody sent the admins a message about access needs");
    assert.equal(toZach[0].kind, "course-request");
    const text = JSON.stringify(toZach[0]);
    assert.match(text, /Somebody sent the admins a message about access needs today at 12pm\./);
    // The subject is kept in the email log, which outlives the account: neither it nor the email names the person.
    const email = await renderedEmail(toZach[0]);
    for (const part of [email.subject, email.html, email.text]) {
      assert.ok(!/Chloe|Nguyen/.test(part), "the admins' email names the person");
      assert.ok(!part.includes("Qx7"));
    }
    assert.match(email.text, /Somebody sent the admins a message about access needs today at 12pm\./);
    const logRows = docsIn("emailSends");
    assert.equal(logRows.length, 1);
    assert.equal(logRows[0].subject, "Somebody sent the admins a message about access needs");
    assert.ok(!/Chloe|Nguyen/.test(JSON.stringify(logRows[0])));
    assert.match(text, /What they wrote is on the request’s page, for admins only, and isn’t in this email\. Opening it is recorded\./);
    assert.match(text, /You get this because you switched on emails about messages to the team\. You can switch it off on the Requests page\./);
    assert.match(text, new RegExp(`/admin/admissions/requests/${id}`));
    assert.ok(!text.includes("Qx7"));
    assert.ok(!/tell my facilitator|tellFacilitator/i.test(text));
    // The switch for requests to be excused is not this one.
    world.db.poke("users/zach", { requestEmails: { excused: true, team: false } });
    world.mail.length = 0;
    await chloeAsks({ topic: "access", words: "Another." });
    assert.equal(world.mail.length, 0);
  });
});

describe("1b. The form's words", () => {
  test("the access form says only admins read it and asks what would help, never why; every word is drawn by the form", () => {
    assert.deepEqual({ ...words.ACCESS_WORDS }, {
      topic: "Access needs",
      topicLine: "Only admins read it.",
      back: "Ask the team",
      heading: "Access needs",
      onlyAdmins: "Only admins read this: not your facilitator, not the programme’s lead. We record each time an admin opens it.",
      label: "What would help?",
      hint: "Say what would help. You don’t need to tell us why, or anything about your health.",
      tick: "You may tell my facilitator what’s needed, but not why",
      tickLine: "Off unless you tick it.",
      send: "Send to admins",
    });
    // Nothing invites a condition or a diagnosis.
    for (const line of Object.values(words.ACCESS_WORDS)) assert.doesNotMatch(line, /condition|diagnos|disabilit|why do|explain/i, line);
    // The form is drawn only after the topic is pressed, so its source is held to drawing each of them.
    const form = readFileSync(join(import.meta.dirname, "..", "src", "features", "teamAsk", "AskTheTeam.tsx"), "utf8");
    for (const key of Object.keys(words.ACCESS_WORDS)) assert.ok(form.includes(`ACCESS_WORDS.${key}`), `the form does not draw ACCESS_WORDS.${key}`);
    assert.match(form, /sendAccessNeeds\(accessWords, tellFacilitator\)/);
  });
});

describe("2. Nobody but an admin learns an access ask exists", () => {
  test("the Requests page: an admin's row says Access needs and when; a programme's lead has no row and no section", async () => {
    const id = await chloeAsks();
    const admin = await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date());
    const rows = admin.view.rows.filter((row) => row.kind === "access-needs");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].subject.name, "Chloe Nguyen");
    assert.equal(rows[0].runId, "");
    assert.equal("about" in rows[0], false);
    assert.equal("topic" in rows[0], false);
    assert.ok(!JSON.stringify(admin).includes("Qx7"));
    const html = renderToStaticMarkup(createElement(RequestsList, { view: admin.view, emailMe: true, emailMeTeam: false }));
    const text = textOf(html);
    assert.ok(!html.includes("Qx7"));
    assert.ok(text.includes("Access needs Admins only Chloe Nguyen · Access needs Tue 17 Nov · Nobody has it yet Waiting Open"), text);
    assert.ok(text.includes("Messages to the team, access needs among them, are for admins only"));
    // Before the messages' section, as the page orders its kinds.
    assert.ok(!html.includes(">A programme<"));

    const lead = await loadRequestsPage(world.courseDb, w.sessionOf("claudia"), new Date());
    assert.equal(lead.status, "ok");
    assert.equal(lead.view.rows.filter((row) => row.kind === "access-needs").length, 0);
    const leadText = textOf(renderToStaticMarkup(createElement(RequestsList, { view: lead.view, emailMe: null, emailMeTeam: null })));
    assert.ok(!leadText.includes("Access needs"));
    assert.ok(!leadText.includes("Admins only"));
    for (const who of ["chloe", "amara", "rahul"]) {
      assert.equal((await loadRequestsPage(world.courseDb, w.sessionOf(who), new Date())).status, "none", who);
    }
  });

  test("Home: an admin's count has it as a message to the team; a lead's and a run's counts are unchanged", async () => {
    const leadBefore = await home.requestsWaitingFor(world.courseDb, w.sessionOf("claudia"), new Date());
    const runBefore = await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("zach"), RUN.agi, { excused: true });
    await chloeAsks();
    const waiting = await home.requestsWaitingFor(world.courseDb, w.sessionOf("zach"), new Date());
    assert.equal(waiting.access, 1);
    assert.equal(waiting.messages, 0);
    assert.equal(waiting.corrections + waiting.excused + waiting.visits + waiting.moves + waiting.messages + waiting.access, waiting.count);
    // Home's line counts it as a message to the team, so it never says "access needs".
    assert.equal(pageWords.requestsWaitingLine({ corrections: 0, messages: waiting.messages + waiting.access }), "Somebody has sent the team a message.");
    const homeAdmin = readFileSync(join(import.meta.dirname, "..", "src", "app", "(app)", "dashboard", "HomeAdmin.tsx"), "utf8");
    assert.match(homeAdmin, /messages: messagesWaiting \+ accessWaiting,/);
    assert.match(readFileSync(join(import.meta.dirname, "..", "src", "app", "(app)", "dashboard", "page.tsx"), "utf8"), /accessWaiting=\{requestsWaiting\.access\}/);
    assert.deepEqual(await home.requestsWaitingFor(world.courseDb, w.sessionOf("claudia"), new Date()), leadBefore);
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("zach"), RUN.agi, { excused: true }), runBefore);
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, w.sessionOf("claudia"), RUN.agi), 0);
  });

  test("one request's page: every loader answers a lead, a facilitator, another member and the sender as for a request that is not there", async () => {
    const id = await chloeAsks();
    for (const who of ["claudia", "rahul", "sofia", "amara", "chloe"]) {
      const session = w.sessionOf(who);
      assert.equal((await loadAccessNeedsPage(world.courseDb, session, id)).status, "none", who);
      assert.equal((await loadTeamMessagePage(world.courseDb, session, id)).status, "none", who);
      assert.equal((await loadRequestPage(world.courseDb, session, id)).status, "none", who);
      assert.equal((await loadExcusedRequestPage(world.courseDb, session, id, new Date())).status, "none", who);
      assert.equal((await loadVisitRequestPage(world.courseDb, session, id, new Date())).status, "none", who);
    }
  });

  test("an admin's first render of the page: the person and their place, and the way to open it, never the words or the tick", async () => {
    const id = await chloeAsks();
    const loaded = await loadAccessNeedsPage(world.courseDb, w.sessionOf("zach"), id);
    assert.equal(loaded.status, "ok");
    assert.ok(!JSON.stringify(loaded).includes("Qx7"));
    assert.equal("words" in loaded.view, false);
    assert.equal("tellFacilitator" in loaded.view, false);
    assert.equal(loaded.view.canOpen, true);
    const html = renderToStaticMarkup(createElement(AccessNeedsPage, { view: loaded.view }));
    assert.ok(!html.includes("Qx7"));
    const text = textOf(html);
    for (const line of [
      "Chloe Nguyen: access needs",
      "Admins only",
      "Group B with",
      "Only admins can open what Chloe wrote, and each opening is recorded.",
      "Open what Chloe wrote",
      "Reply to Chloe",
      "Sent by email and shown under Chloe’s message. Sending it closes the message.",
      "Keep the reply general. It is emailed, and other admins see it without opening what was written.",
      "Handling Nobody has it yet. Take it",
      "Chloe sent this",
    ]) {
      assert.ok(text.includes(line), `the page does not say: ${line}\n${text}`);
    }
    assert.ok(!/what’s needed|hasn’t said/.test(text), "the tick is drawn before anybody opened it");
  });

  test("the member's own list: Access needs, the day and the state, never the words; another member sees none", async () => {
    await chloeAsks();
    const page = await w.draw(askPage, "chloe", {});
    assert.ok(!page.html.includes("Qx7"));
    assert.ok(page.text.includes("Your requests Access needs Sent Tue 17 Nov Waiting"), page.text);
    assert.ok(page.text.includes("Access needs Only admins read it."), "the topic is offered");
    for (const who of ["amara", "rahul", "claudia"]) {
      const theirs = await w.draw(askPage, who, {});
      assert.ok(!theirs.text.includes("Sent Tue 17 Nov"), who);
      assert.ok(!theirs.html.includes("Qx7"), who);
    }
  });
});

describe("3. Opening, and its record", () => {
  test("only an admin who did not send it; anybody else is refused before anything is read, and nothing is recorded", async () => {
    const id = await chloeAsks();
    const before = w.everything();
    assert.equal((await open(null, id)).status, 401);
    for (const who of ["chloe", "amara", "rahul", "claudia"]) {
      const refused = await open(who, id);
      assert.equal(refused.status, 403, who);
      assert.deepEqual(refused.body, { error: "Forbidden" }, who);
    }
    // The same answer for an id that names nothing: it says nothing about what exists.
    assert.deepEqual((await open("claudia", "noSuchAsk")).body, { error: "Forbidden" });
    assert.equal((await open("ada", id, { viewAs: true })).status, 403);
    assert.equal((await open("zach", "noSuchAsk")).status, 404);
    assert.equal(w.everything(), before, "a refused opening wrote something");
  });

  test("an admin's opening returns the words and the tick, and writes the record and the history entry with it", async () => {
    const id = await chloeAsks();
    const opened = await open("ada", id);
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body, { ok: true, words: MARKER, tellFacilitator: true });
    const rows = openings();
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.requestId, id);
    assert.equal(row.subjectUid, "chloe");
    assert.equal(row.actorUid, "ada");
    assert.equal(row.actorName, "Ada Lovell");
    assert.equal(row.runId, "");
    assert.equal(row.roundId, null);
    assert.equal(row.groupId, null);
    assert.equal(row.detail, "Ada opened a message about access needs.");
    assert.ok(isCourseAuditKind(row.kind));
    assert.equal(courseAuditKindLabel(row.kind), "Access needs read");
    // Never the words, the tick or the person's name.
    const stored = JSON.stringify(row);
    assert.ok(!stored.includes("Qx7"));
    assert.ok(!stored.includes("Chloe"));
    assert.ok(!/facilitator/i.test(stored));
    assert.deepEqual(read(`courseRequests/${id}`).history.map((entry) => [entry.what, entry.byUid]), [["asked", "chloe"], ["opened", "ada"]]);
    // Each opening is recorded, an opening after a reply among them.
    await reply("zach", id, "We have booked a step-free room.");
    assert.equal((await open("zach", id)).status, 200);
    assert.equal(openings().length, 2);
    // Opened, the page draws the history; the words only ever came from the answer.
    const loaded = await loadAccessNeedsPage(world.courseDb, w.sessionOf("ada"), id);
    const text = textOf(renderToStaticMarkup(createElement(AccessNeedsPage, { view: loaded.view })));
    assert.ok(text.includes("Ada opened it"), text);
    assert.ok(text.includes("Zach opened it"), text);
    assert.ok(!text.includes("Qx7"));
  });

  test("a record that cannot be written returns no words, and nothing is recorded", async () => {
    const id = await chloeAsks();
    const before = read(`courseRequests/${id}`);
    world.db.beforeCommit = () => {
      throw new Error("the commit was refused");
    };
    const failed = await open("ada", id);
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.body, { error: "That didn’t open. Try again." });
    assert.equal(openings().length, 0);
    assert.deepEqual(read(`courseRequests/${id}`), before);
    assert.ok(!logged.join("\n").includes("Qx7"), "the failure logged the words");
  });

  test("an admin's own ask: another admin opens it, and they cannot", async () => {
    assert.equal((await ask("zach", { topic: "access", words: MARKER })).status, 200);
    const own = accessAsks().find((doc) => doc.askedByUid === "zach");
    const refused = await open("zach", own.id);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, "You sent this, so another admin opens it.");
    assert.ok(!JSON.stringify(refused.body).includes("Qx7"));
    assert.equal(openings().length, 0);
    const loaded = await loadAccessNeedsPage(world.courseDb, w.sessionOf("zach"), own.id);
    assert.equal(loaded.view.canOpen, false);
    assert.equal(loaded.view.canReply, false);
    const text = textOf(renderToStaticMarkup(createElement(AccessNeedsPage, { view: loaded.view })));
    assert.ok(!text.includes("Open what"));
    assert.ok(text.includes("You sent this, so another admin replies to it."));
    // Nor take it or reply to it; another admin does.
    assert.equal((await take("zach", own.id)).body.error, "You sent this, so another admin takes it.");
    assert.equal((await reply("zach", own.id, "Answering myself")).body.error, "You can’t reply to your own message.");
    assert.equal((await open("ada", own.id)).status, 200);
    assert.equal((await reply("ada", own.id, "Booked.")).status, 200);
  });

  test("a message to the team is not an access ask: the open route finds none, so it reads no message's words either", async () => {
    assert.equal((await ask("chloe", { topic: "else", words: "Can I bring a friend?" })).status, 200);
    const message = docsIn("courseRequests").find((doc) => doc.kind === "team-message");
    const answer = await open("zach", message.id);
    assert.equal(answer.status, 404);
    assert.equal(openings().length, 0);
  });
});

describe("4. Take it and the reply, as for a message", () => {
  test("Take it: an admin's, never the sender's; the reply is stored, closes it and emails the person under a message's own subject, never the words", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    for (const who of ["chloe", "amara", "rahul", "claudia"]) {
      assert.equal((await take(who, id)).status, 403, who);
      assert.equal((await reply(who, id, "Thanks")).status, 403, who);
    }
    assert.equal((await take(null, id)).status, 401);
    assert.equal((await reply(null, id, "Thanks")).status, 401);
    assert.equal((await take("zach", id, { viewAs: true })).status, 403);
    assert.equal((await reply("zach", id, "Thanks", { viewAs: true })).status, 403);
    assert.equal((await take("zach", id)).status, 200);
    assert.equal(read(`courseRequests/${id}`).handlingUid, "zach");
    assert.equal(world.mail.length, 0, "taking emails nobody");

    mock.timers.setTime(new Date("2026-11-19T10:00:00Z").getTime());
    const answered = await reply("zach", id, "We have booked a step-free room for Group B.");
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.deepEqual(answered.body, { ok: true, status: "replied", emailed: { person: "sent" } });
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.status, "replied");
    assert.deepEqual(doc.history.map((entry) => entry.what), ["asked", "taken", "replied"]);
    assert.equal(doc.change.words, MARKER, "the words stay on the ask");
    const toChloe = mailTo("chloe");
    assert.equal(toChloe.length, 1);
    assert.equal(toChloe[0].subject, "About your message to the team");
    assert.equal(toChloe[0].kind, "team-reply");
    const text = JSON.stringify(toChloe[0]);
    // Word for word any message's reply, so nothing in it, its preview or its plain text says access needs.
    assert.match(text, /Zach replied to the message you sent the team on Tue 17 Nov\./);
    assert.match(text, /Zach says: “We have booked a step-free room for Group B\.”/);
    assert.ok(!text.includes("Qx7"));
    const email = await renderedEmail(toChloe[0]);
    assert.match(email.text, /Zach replied to the message you sent the team on Tue 17 Nov\./);
    for (const part of [email.subject, email.html, email.text]) {
      assert.doesNotMatch(part, /access/i, "the reply email says access");
      assert.ok(!part.includes("Qx7"));
    }
    for (const uid of ["rahul", "sofia", "claudia", "amara", "ada"]) assert.equal(mailTo(uid).length, 0, `${uid} was emailed`);
    // The member reads the reply on their own page, under "Access needs".
    const page = await w.draw(askPage, "chloe", {});
    assert.ok(page.text.includes("Access needs Zach replied Thu 19 Nov: “We have booked a step-free room for Group B.” Replied"), page.text);
  });

  test("the reply email on the day it was sent: a message's own words", () => {
    const sent = words.replyEmailWords({ replierFirstName: "Zach", reply: "Done.", askedAt: NOW, now: NOW });
    assert.equal(sent.subject, "About your message to the team");
    assert.deepEqual(sent.before, ["Zach replied to the message you sent the team today."]);
    assert.doesNotMatch(JSON.stringify(sent), /access/i);
  });
});

describe("5. The words reach nothing but the opening's answer", () => {
  test("every response, page drawn, rendered email, email log row, log line and stored document of every flow, searched for the words", async () => {
    world.db.poke("users/zach", { requestEmails: { team: true } });
    world.db.poke("users/ada", { requestEmails: { team: true, excused: true } });
    const seen = [];
    const keep = (where, value) => seen.push([where, typeof value === "string" ? value : JSON.stringify(value)]);

    const sent = await ask("chloe", { topic: "access", words: MARKER, tellFacilitator: true });
    keep("send", sent);
    await w.settle();
    const id = sent.body.request.id;

    // Every kind of caller, on every surface that could show a request or a count of one.
    const callers = ["zach", "ada", "claudia", "rahul", "sofia", "amara", "chloe", "pat", null];
    for (const who of callers) {
      const name = who ?? "signed out";
      const session = who ? w.sessionOf(who) : null;
      // The one request's page itself, through its gate and every loader, and Ask the team.
      keep(`request page as ${name}`, await w.draw(requestPage, who, { requestId: id }));
      keep(`own page as ${name}`, await w.draw(askPage, who, {}));
      // What a facilitator and a lead open: the programme page and My programmes, the group's register and
      // roster, and the programme's overview.
      keep(`programme page as ${name}`, await w.draw(w.pages.home, who, { runId: RUN.agi }));
      keep(`my programmes as ${name}`, await w.draw(w.pages.programmes, who, {}));
      // A member's own forms that list their requests on the run: changing group, and another session.
      keep(`change group as ${name}`, await w.draw(changeGroupPage, who, { runId: RUN.agi }));
      keep(`another session as ${name}`, await w.draw(anotherSessionPage, who, { runId: RUN.agi }));
      keep(`register as ${name}`, await call(who, w.routes.register.GET, { groupId: B }, { course: true }));
      keep(`roster as ${name}`, await call(who, w.routes.roster.GET, { groupId: B }, { course: true }));
      keep(`overview as ${name}`, await call(who, w.routes.overview.GET, { runId: RUN.agi }, { course: true }));
      if (!session || session.role === "pending") continue;
      const list = await loadRequestsPage(world.courseDb, session, new Date());
      keep(`list as ${name}`, list);
      if (list.status === "ok") keep(`list drawn as ${name}`, renderToStaticMarkup(createElement(RequestsList, { view: list.view, emailMe: true, emailMeTeam: true })));
      keep(`home as ${name}`, await home.requestsWaitingFor(world.courseDb, session, new Date()));
      keep(`run count as ${name}`, await home.requestsWaitingOnRun(world.courseDb, session, RUN.agi, { excused: true }));
      const page = await loadAccessNeedsPage(world.courseDb, session, id);
      keep(`page as ${name}`, page);
      if (page.status === "ok") keep(`page drawn as ${name}`, renderToStaticMarkup(createElement(AccessNeedsPage, { view: page.view })));
      if (who !== "zach" && who !== "ada") keep(`open as ${name}`, await open(who, id));
    }
    keep("open signed out", await open(null, id));
    keep("open as pat", await open("pat", id));
    // A view-as session on the member's own page.
    world.viewAs = true;
    keep("own page during view-as", await w.draw(askPage, "chloe", {}));
    world.viewAs = false;
    keep("take", await take("zach", id));
    keep("reply", await reply("zach", id, "We have booked a step-free room."));
    await w.settle();
    keep("view-as open", await open("ada", id, { viewAs: true }));
    world.db.beforeCommit = () => {
      throw new Error("the commit was refused");
    };
    keep("failed open", await open("ada", id));

    // The one place the words may be: the answer to an admin's opening.
    const opened = await open("ada", id);
    assert.equal(opened.body.words, MARKER);

    for (const message of world.mail) {
      keep(`email handed over to ${message.to}`, message);
      const email = await renderedEmail(message);
      keep(`email to ${message.to}, subject`, email.subject);
      keep(`email to ${message.to}, html`, email.html);
      keep(`email to ${message.to}, plain text`, email.text);
    }
    for (const line of logged) keep("log", line);
    const logRows = docsIn("emailSends");
    for (const row of logRows) keep(`email log ${row.id}`, row);
    // Every stored document but the ask's own, where the words belong.
    for (const path of world.db.paths()) if (path !== `courseRequests/${id}`) keep(`store ${path}`, read(path));
    keep("the ask's history", read(`courseRequests/${id}`).history);

    // The search finds the words where they are, so an empty answer below is about something.
    assert.ok(world.mail.length >= 3, "the flows sent the alert to both admins and the reply");
    assert.equal(logRows.length, world.mail.length, "every message handed over left its log row");
    assert.ok(JSON.stringify(read(`courseRequests/${id}`)).includes("Qx7") && JSON.stringify(opened).includes("Qx7"));
    const drawn = seen.filter(([where]) => where.startsWith("request page as zach"))[0][1];
    assert.ok(drawn.includes("Open what Chloe wrote"), "the admin's request page was not drawn, so its search is about nothing");
    assert.ok(seen.find(([where]) => where === "register as rahul")[1].includes("Chloe"), "the facilitator's register was not read, so its search is about nothing");
    for (const page of ["change group as chloe", "another session as chloe"]) {
      assert.ok(JSON.parse(seen.find(([where]) => where === page)[1]).html.length > 200, `${page} was not drawn, so its search is about nothing`);
    }
    assert.ok(seen.length > 120);
    const leaks = seen.filter(([, text]) => text.includes("Qx7")).map(([where]) => where);
    assert.deepEqual(leaks, [], "the words reached somewhere other than the opening's answer");
  });
});

describe("6. Deleting the account", () => {
  // The real cascade, as tests/account-deletion-move-reasons.test.mjs runs it.
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
      ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
      ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
      ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
      ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ]),
  });
  const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };
  const AT = new Date("2026-11-18T09:00:00Z");
  const opening = (over) => ({
    runId: "",
    roundId: null,
    groupId: null,
    subjectUid: "elena",
    actorUid: "zach",
    actorName: "Zach Levin",
    at: AT,
    ...over,
  });

  test("the ask and its words go with the account; each record of an opening stays, as the records of an application's access requirements do", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const rows = {
      "users/elena": { uid: "elena", role: "member" },
      "courseRequests/theirs": {
        kind: "access-needs",
        runId: "",
        askedByUid: "elena",
        subjectUid: "elena",
        status: "replied",
        decidedByUid: "zach",
        change: { words: MARKER, tellFacilitator: true, replies: [{ text: "Booked.", byUid: "zach", at: AT }] },
      },
      // Somebody else's, which Elena, an admin once, replied to: it stays, naming her by an id.
      "courseRequests/someoneElses": {
        kind: "access-needs",
        runId: "",
        askedByUid: "someone",
        subjectUid: "someone",
        status: "replied",
        decidedByUid: "elena",
        change: { words: "A quiet room.", tellFacilitator: false, replies: [{ text: "Done.", byUid: "elena", at: AT }] },
      },
      // The precedent: an opening of her application's access requirements.
      "courseAudit/requirements": opening({ kind: "access-requirements-read", roundId: "round-1", targetLabel: "Autumn form", detail: "Zach opened an applicant’s access requirements." }),
      "courseAudit/needs": opening({ kind: "access-needs-read", requestId: "theirs", targetLabel: "Ask the team", detail: "Zach opened a message about access needs." }),
    };
    const db = makeCascadeDb(structuredClone(rows));
    db.recursiveDelete = async (ref) => ref.delete();
    const summary = await deleteAccountCascade(auth, db, "elena");
    assert.equal(summary.courseRequestsDeleted, 1);
    assert.equal(db.read("courseRequests/theirs"), undefined, "the ask, and with it the words, went with the account");
    assert.ok(db.read("courseRequests/someoneElses"));
    // Both records of an opening are kept as they were: no words, no name, an id that now leads nowhere.
    assert.deepEqual(db.read("courseAudit/requirements"), rows["courseAudit/requirements"]);
    assert.deepEqual(db.read("courseAudit/needs"), rows["courseAudit/needs"]);
  });
});

describe("7. Since the review", () => {
  test("however often an ask is opened, its history keeps the sending, who took it and the reply", () => {
    const at = (minute) => new Date(Date.UTC(2026, 10, 17, 12, minute));
    let history = [{ what: "asked", byUid: "chloe", at: at(0) }, { what: "taken", byUid: "zach", at: at(1) }, { what: "replied", byUid: "zach", at: at(2) }];
    for (let i = 0; i < 30; i += 1) history = withAccessEvent(history, "opened", i % 2 ? "ada" : "zach", at(3 + i));
    assert.equal(history.length, 20);
    assert.deepEqual(history.slice(0, 3).map((entry) => entry.what), ["asked", "taken", "replied"]);
    assert.deepEqual(history.at(-1).at, at(32), "the newest opening is kept");
    assert.equal(history.filter((entry) => entry.what === "opened").length, 17);
  });

  test("what was written is drawn as text, never as markup, once opened", () => {
    const page = readFileSync(join(import.meta.dirname, "..", "src", "features", "courses", "requests", "AccessNeedsPage.tsx"), "utf8");
    assert.match(page, /<MemberText text=\{opened\.words\} \/>/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    const html = renderToStaticMarkup(createElement(MemberText, { text: '<img src=x onerror="alert(1)"> <b>step-free</b> https://naisi.uk/x' }));
    assert.ok(!html.includes("<img") && !html.includes("<b>") && !html.includes("<a "), html);
    assert.ok(html.includes("&lt;img"));
  });

  test("the access topic is a button that opens its own form, not one of the radios arrowing can land on", async () => {
    const page = await w.draw(askPage, "chloe", {});
    assert.match(page.html, /<button type="button" class="flow"><span class="flowTitle">Access needs<\/span><span class="flowLine">Only admins read it\.<\/span><\/button>/);
    assert.doesNotMatch(page.html, /value="access"/);
    const form = readFileSync(join(import.meta.dirname, "..", "src", "features", "teamAsk", "AskTheTeam.tsx"), "utf8");
    assert.match(form, /\(topic === "access" \? accessHeading\.current : accessTopic\.current\)\?\.focus\(\);/);
  });

  test("an opened ask is not kept when the page is left, so a page the browser restores shows the button again", () => {
    const page = readFileSync(join(import.meta.dirname, "..", "src", "features", "courses", "requests", "AccessNeedsPage.tsx"), "utf8");
    assert.match(page, /addEventListener\("pagehide", forget\)/);
    assert.match(page, /const forget = \(\) => flushSync\(\(\) => setOpened\(null\)\);/);
    assert.match(page, /if \(event\.persisted\) setOpened\(null\);/);
  });
});
