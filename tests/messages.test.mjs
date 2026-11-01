/**
 * MESSAGES: one composer for writing to people, on the picker
 * (docs/messages.md, src/lib/messages/, src/app/api/messages/).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. WHO WRITES: admins, a programme's lead and a group's facilitator, as
 *     every persona the standing red team knows and as the records of a real
 *     term say; and the menu's answer, which asks the term only when the
 *     account could be one.
 *  2. THE SEND AS EVERY KIND OF CALLER: refused before anything is read, a
 *     tag the writer may not use refused whole, and nothing written or sent
 *     by a refusal.
 *  3. THE COUNT IS A PROMISE: the send resolves the choice the picker
 *     counted, with the same options, and is refused when that number moved.
 *  4. A TEST FIRST: the send waits for a test of exactly its words that
 *     reached the writer; a test is the writer's own, marked, with no marker
 *     and no unsubscribe link, and a held or suppressed one is no test.
 *  5. NOTICE OR BY THEIR SETTINGS, PER PERSON, never a mix: a notice through
 *     the notice door with the marker; by their settings through the one
 *     door, on the one row chosen, with the line saying which and its
 *     unsubscribe link, guests by their own subscription.
 *  6. THE WRITER INCLUDED when they match.
 *  7. SUPPRESSION AND HELD MAIL: a suppressed address is left out and never
 *     handed over; a copy of the site that may not write to an address holds
 *     it and counts it.
 *  8. THE CAPS: three an hour per writer and audience, ten a day per
 *     audience, over three hundred emails refused whole, nothing sent.
 *  9. THE RECORD: who wrote it, the tags, the class per person, the counts
 *     and why each was left out; never an address and never the message.
 * 10. "ALSO POST IT ON THE PROGRAMME'S PAGE": offered for one programme's
 *     people, refused otherwise, written as an update and settled.
 * 11. THE PAGE, THE COMPOSER AND THE MENU, drawn on the server.
 * 12. THE WORDS: no dashes, British, and what each refusal says.
 *
 * The term is `tests/lib/termWorld.mjs`'s, on Thu 10 Dec 2026, with AGI
 * Strategy's allocation published (so its groups have tags) and Technical AI
 * Safety's not, the settings, lists and bounced address the picker's own
 * suite adds, and the reviewer flag the roles writer keeps on Claudia, Lloyd
 * and Tess. Every address is on a reserved domain, and no message leaves the
 * process: the one mail door is a stand-in that writes down what it was handed.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { A, B, C, TOLD, textOf } from "./lib/surveyWorld.mjs";
import { AFTER, AGI, EV, ROUND, RUN, TAIS, termSeed } from "./lib/termWorld.mjs";
import { PERSONA_NAMES } from "./persona-route-gates.registry.mjs";

// The unsubscribe links are signed: a copy of the site that sends by their settings holds a secret.
process.env.EVENTS_TOKEN_SECRET = "messages-suite-signing-secret-0123456789";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const read = (...parts) => readFileSync(join(REPO_ROOT, ...parts), "utf8");

/** A stylesheet, as its own class names; every sheet a module under src imports. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) SHEETS.add(specifier);
}

const w = makeWorld("__messages", [
  ...[...SHEETS].map((sheet) => [sheet, CLASS_NAMES]),
  ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
  [
    "next/link",
    "export default ({ href, className, children, prefetch, scroll, ...rest }) =>\n" +
      "  globalThis.__messagesUi.h('a', { href, className, ...rest }, children);",
  ],
  ["next/navigation", "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }"],
  // The notice lane's push door, which writes down what it was handed and
  // answers that a device took it unless a suite says otherwise.
  [
    "@/lib/push/noticeNotifications",
    "export async function sendNoticePush(uid, note) {\n" +
      "  globalThis.__messages.pushes.push({ uid, ...note });\n" +
      "  return globalThis.__messagesUi.pushTaken ? globalThis.__messagesUi.pushTaken(uid) : true;\n" +
      "}",
  ],
]);
globalThis.__messagesUi = { h: createElement, pushTaken: null };

const lib = (...parts) => w.loadTs(join("lib", ...parts));
const tags = await lib("audience", "tags.ts");
const pickerWords = await lib("audience", "words.ts");
const writers = await lib("messages", "writers.ts");
const posting = await lib("messages", "posting.ts");
const sending = await lib("messages", "sending.ts");
const parse = await lib("messages", "parse.ts");
const words = await lib("messages", "words.ts");
const route = await w.loadTs(join("app", "api", "messages", "route.ts"));
const testRoute = await w.loadTs(join("app", "api", "messages", "test", "route.ts"));
const audienceRoute = await w.loadTs(join("app", "api", "audience", "route.ts"));

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

const sub = (email, channel, audience, audienceId, over = {}) => ({
  email,
  channel,
  audience,
  audienceId,
  confirmed: true,
  subscribed: true,
  source: "test",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  ...over,
});
const subPath = (email, channel) => `subscriptions/sub_${email.replace(/[^a-z0-9@._+-]/g, "_")}__${channel}`;
const prefs = (categories, channels = { gmail: true, uniEmail: false }) => ({ notifications: { channels, categories } });

/** The term on Thu 10 Dec 2026, as the picker's own suite has it, with the flags the roles writer keeps. */
function seed(over = {}) {
  const docs = termSeed({ templateItems: () => [] }, () => [], {});
  const user = (uid, extra) => ({ ...docs[`users/${uid}`], ...extra, profile: { ...docs[`users/${uid}`].profile, ...(extra.profile ?? {}) } });
  docs[`courseRuns/${RUN.agi}`] = { ...docs[`courseRuns/${RUN.agi}`], allocationPublishedAt: TOLD };
  docs[`events/${EV.vr}`] = { ...docs[`events/${EV.vr}`], doorOpenedAt: new Date("2026-11-01T13:30:00Z"), doorOpenedBy: "sue" };
  docs["users/amara"] = user("amara", { profile: prefs({ newsletter: false, events: true, courses: true, tasks: true }) });
  docs["users/gwen"] = user("gwen", { profile: prefs({ newsletter: false, events: true, courses: true, tasks: true }) });
  docs["users/bea"] = user("bea", { profile: prefs({ newsletter: true, events: false, courses: true, tasks: true }) });
  docs["users/dev"] = user("dev", { profile: prefs({ newsletter: false, events: false, courses: false, tasks: true }) });
  docs["users/penny"] = userDoc(session("penny", "pending", false, "Penny Lane"));
  for (const uid of ["claudia", "lloyd", "tess"]) docs[`users/${uid}`] = { ...docs[`users/${uid}`], admissionsReviewer: true };
  docs[subPath("bea@example.com", "newsletter")] = sub("bea@example.com", "newsletter", "user", "bea");
  docs[subPath("sam@example.com", "newsletter")] = sub("sam@example.com", "newsletter", "guest", "g-sam");
  docs[subPath("amara@example.com", "events")] = sub("amara@example.com", "events", "user", "amara");
  docs[subPath("gwen@example.com", "events")] = sub("gwen@example.com", "events", "user", "gwen");
  docs[subPath("mo@example.com", "events")] = sub("mo@example.com", "events", "guest", "g-mo");
  docs["suppressedEmails/gwen@example.com"] = { email: "gwen@example.com", reason: "bounce", source: "manual", addedAt: new Date("2026-11-20T10:00:00Z") };
  return { ...docs, ...over };
}

const id = tags.tagId;
const T = {
  holding: id({ kind: "term", roundId: ROUND, part: "holding" }),
  facilitating: id({ kind: "term", roundId: ROUND, part: "facilitating" }),
  applied: id({ kind: "term", roundId: ROUND, part: "applied" }),
  agiEveryone: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "everyone" }),
  agiHolding: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "holding" }),
  agiFacilitating: id({ kind: "programme", roundId: ROUND, programmeId: AGI, part: "facilitating" }),
  taisEveryone: id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "everyone" }),
  groupA: id({ kind: "group", groupId: A }),
  groupB: id({ kind: "group", groupId: B }),
  groupC: id({ kind: "group", groupId: C }),
  vrCame: id({ kind: "event", eventId: EV.vr, part: "came" }),
  newsletter: id({ kind: "subscribed", channel: "newsletter" }),
  events: id({ kind: "subscribed", channel: "events" }),
  committee: id({ kind: "role", role: "committee" }),
};

/** The session a request arrives with: the stored account, with the reviewer flag the session carries. */
function sessionFor(uid) {
  const base = w.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: w.world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

let requests = 0;
/** One request to a real handler, as `who`, with the session `getCurrentUser()` would hand back. */
async function call(who, handler, { body, viewAs = false } = {}) {
  requests += 1;
  w.world.user = who === null ? null : sessionFor(who);
  w.world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${requests % 250}` } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  try {
    const response = await handler(new Request("https://naisi.invalid/api/messages", init), { params: Promise.resolve({}) });
    return { status: response.status, body: structuredClone(response.body), headers: response.headers };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    w.world.viewAs = false;
  }
}

/** Start again on Thu 10 Dec 2026 at noon, with the clock held there. */
function freshTerm(t, over = {}) {
  mock.timers.enable({ apis: ["Date"], now: AFTER });
  t.after(() => mock.timers.reset());
  w.reset(seed(over), { now: () => new Date() });
}

const WORDS = { subject: "Facilitator check-in on Thursday", message: "Hi all, a short check-in for everyone facilitating this term.\n\nPortland A21, 6pm, with pizza." };

/** What the picker counts for this choice, as the writer would read it beside the button. */
async function countOf(who, include, exclude = [], row = null) {
  const response = await call(who, audienceRoute.POST, { body: { include, exclude, row } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.count;
}

/** "Send a test to me", then the send, with the number the picker counted. */
async function testAndSend(who, include, { exclude = [], row = null, post, words: said = WORDS } = {}) {
  const tested = await call(who, testRoute.POST, { body: said });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  const count = await countOf(who, include, exclude, row);
  return call(who, route.POST, { body: { include, exclude, row, ...said, count: count.emailed, ...(post === undefined ? {} : { post }) } });
}

/** Every message the mail door was handed after the test, as words. */
const sentMail = () =>
  w.world.mail
    .filter((message) => message.kind !== "message-test")
    .map((message) => ({ ...message, html: renderToStaticMarkup(message.react), text: textOf(renderToStaticMarkup(message.react)) }));

const recordPaths = () => w.world.db.paths().filter((path) => path.startsWith("messageSends/"));
const updatePaths = () => w.world.db.paths().filter((path) => path.startsWith("courseUpdates/"));

// ---------------------------------------------------------------------------
// 1. Who writes
// ---------------------------------------------------------------------------

describe("who writes, as every persona and as the term's records say", () => {
  test("the writers' gate: admins, a programme's lead and a group's facilitator, and nobody else", async (t) => {
    freshTerm(t);
    const writerOf = async (uid) => writers.messageWriterOf(w.world.db, sessionFor(uid), AFTER);
    const zach = await writerOf("zach");
    assert.equal(zach.admin, true);
    const claudia = await writerOf("claudia");
    assert.deepEqual(claudia.roles.leads, [`${ROUND}:${AGI}`]);
    // Tess leads Technical AI Safety, whose run has not been published: she writes to its people, and no group.
    assert.deepEqual((await writerOf("tess")).roles.leads.sort(), [`${ROUND}:${TAIS}`, `${ROUND}:research-incubator`].sort());
    assert.deepEqual((await writerOf("tom")).roles.facilitates, [C]);
    assert.deepEqual((await writerOf("sofia")).roles.facilitates.sort(), [A, B].sort());
    // A reviewer, SU-recognised committee who runs nothing, a member, a waiting account: none of them.
    for (const uid of ["lloyd", "sue", "iris", "amara", "penny", "refused"]) {
      assert.equal(await writerOf(uid), null, `${uid} writes`);
    }
  });

  test("a facilitator writes only once their run's allocation has been published", async (t) => {
    freshTerm(t, { [`courseRuns/${RUN.agi}`]: { ...seed()[`courseRuns/${RUN.agi}`], allocationPublishedAt: null } });
    assert.equal(await writers.messageWriterOf(w.world.db, sessionFor("tom"), AFTER), null);
  });

  test("the menu's answer is the gate's, as every kind of caller", async (t) => {
    freshTerm(t);
    for (const [who, status, writes] of [
      [null, 401, null],
      ["penny", 403, null],
      ["refused", 403, null],
      ["zach", 200, true],
      ["claudia", 200, true],
      ["tom", 200, true],
      ["lloyd", 200, false],
      ["sue", 200, false],
      ["amara", 200, false],
    ]) {
      const response = await call(who, route.GET);
      assert.equal(response.status, status, `${who}`);
      if (writes !== null) assert.deepEqual(response.body, { writes }, `${who}`);
    }
  });

  test("a member who is neither named on a form nor on a group is answered without reading the term", async (t) => {
    freshTerm(t);
    let formsRead = 0;
    const realCollection = w.world.db.collection.bind(w.world.db);
    w.world.db.collection = (name) => {
      if (name === "admissionRounds") formsRead += 1;
      return realCollection(name);
    };
    t.after(() => {
      w.world.db.collection = realCollection;
    });
    assert.deepEqual((await call("amara", route.GET)).body, { writes: false });
    assert.equal(formsRead, 0, "the term was read for somebody who leads and facilitates nothing");
    assert.deepEqual((await call("tom", route.GET)).body, { writes: true });
    assert.ok(formsRead > 0, "the term was not read for somebody a group names");
  });

});

// ---------------------------------------------------------------------------
// 2. The send, as every kind of caller
// ---------------------------------------------------------------------------

describe("the send, as every kind of caller", () => {
  test("signed out, waiting or refused, inside view-as, or a body that is not a message: refused, and nothing written or sent", async (t) => {
    freshTerm(t);
    const everything = () => JSON.stringify(w.world.db.paths().sort().map((path) => [path, w.world.db.read(path)]));
    const before = everything();
    const body = { include: [T.groupC], exclude: [], row: null, ...WORDS, count: 1 };
    assert.equal((await call(null, route.POST, { body })).status, 401);
    assert.equal((await call(null, testRoute.POST, { body: WORDS })).status, 401);
    for (const who of ["penny", "refused"]) {
      assert.equal((await call(who, route.POST, { body })).status, 403, who);
      assert.equal((await call(who, testRoute.POST, { body: WORDS })).status, 403, who);
    }
    assert.equal((await call("zach", route.POST, { body, viewAs: true })).status, 403);
    assert.equal((await call("zach", testRoute.POST, { body: WORDS, viewAs: true })).status, 403);
    for (const bad of [
      "not json",
      [],
      { ...body, include: ["nope"] },
      { ...body, row: "tasks" },
      { ...body, subject: "" },
      { ...body, subject: "Two\nlines" },
      { ...body, subject: "x".repeat(151) },
      { ...body, message: "   " },
      { ...body, message: "x".repeat(4001) },
      { ...body, count: -1 },
      { ...body, count: "1" },
      { ...body, post: "yes" },
    ]) {
      assert.equal((await call("zach", route.POST, { body: bad })).status, 400, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal(everything(), before, "a refusal wrote something");
    assert.equal(w.world.mail.length, 0);
  });

  test("as every persona the standing red team knows, each a person of the term", async (t) => {
    freshTerm(t);
    // A permission is no tag and no programme: its holder is a plain member here, as Nell is.
    const AS = { anonymous: null, pending: "penny", rejected: "refused", member: "amara", committee: "iris", suCommittee: "sue", admin: "zach", lead: "claudia", facilitator: "tom", participant: "dev" };
    const EXPECT = { anonymous: 401, pending: 403, rejected: 403, admin: 200, lead: 200, facilitator: 200 };
    for (const persona of PERSONA_NAMES) {
      const uid = Object.hasOwn(AS, persona) ? AS[persona] : "nobody";
      const expected = EXPECT[persona] ?? 403;
      if (expected === 200) {
        // A writer: a test first, then the send to the group the facilitator runs, which the lead and an admin run too.
        assert.equal((await call(uid, testRoute.POST, { body: WORDS })).status, 200, `${persona} test`);
        const count = await countOf(uid, [T.groupC]);
        const sent = await call(uid, route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
        assert.equal(sent.status, 200, `${persona}: ${JSON.stringify(sent.body)}`);
        assert.deepEqual(Object.keys(sent.body).sort(), ["failed", "held", "ok", "posted", "pushed", "sent", "suppressed"]);
        continue;
      }
      const refused = await call(uid, route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: 1 } });
      assert.equal(refused.status, expected, persona);
      if (expected === 403 && !["pending", "rejected"].includes(persona)) assert.equal(refused.body.error, words.MESSAGE_REFUSAL.notAWriter, persona);
      assert.equal((await call(uid, testRoute.POST, { body: WORDS })).status, expected, `${persona} test`);
    }
    // Three writers, three sends to one group, one record each; nothing for anybody refused.
    assert.equal(recordPaths().length, 3);
    assert.deepEqual(new Set(w.world.mail.filter((message) => message.kind === "message-test").map((message) => message.to)), new Set(["zach@example.com", "claudia@example.com", "tom@example.com"]));
  });

  test("somebody who is not a writer is refused once a whole message arrives", async (t) => {
    freshTerm(t);
    for (const who of ["lloyd", "sue", "amara", "iris"]) {
      const body = { include: [T.committee], exclude: [], row: null, ...WORDS, count: 1 };
      const response = await call(who, route.POST, { body });
      assert.equal(response.status, 403, who);
      assert.equal(response.body.error, words.MESSAGE_REFUSAL.notAWriter);
      assert.equal((await call(who, testRoute.POST, { body: WORDS })).status, 403, `${who} test`);
    }
    assert.equal(w.world.mail.length, 0);
    assert.deepEqual(recordPaths(), []);
  });

  test("a tag the writer may not use refuses the whole send, before anything is sent or kept", async (t) => {
    freshTerm(t);
    // Tom facilitates Group C: Group B, the programme's people and the lists are not his.
    for (const tagId of [T.groupB, T.agiHolding, T.newsletter, T.holding]) {
      const response = await call("tom", route.POST, { body: { include: [T.groupC, tagId], exclude: [], row: null, ...WORDS, count: 1 } });
      assert.equal(response.status, 403, tagId);
      assert.equal(response.body.error, pickerWords.AUDIENCE_REFUSAL.notYours);
    }
    // Claudia leads AGI Strategy: Technical AI Safety's people are not hers.
    const response = await call("claudia", route.POST, { body: { include: [T.taisEveryone], exclude: [], row: null, ...WORDS, count: 1 } });
    assert.equal(response.status, 403);
    assert.equal(w.world.mail.length, 0);
    assert.deepEqual(recordPaths(), []);
  });

  test("nobody to email is no send", async (t) => {
    freshTerm(t);
    await call("zach", testRoute.POST, { body: WORDS });
    // Who came to the VR night and holds no place, by course announcements: Gwen's address
    // bounced, Mo is a guest with no such list, and Dan walked in.
    const count = await countOf("zach", [T.vrCame], [T.holding], "courses");
    assert.equal(count.emailed, 0);
    const response = await call("zach", route.POST, { body: { include: [T.vrCame], exclude: [T.holding], row: "courses", ...WORDS, count: 0 } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, words.MESSAGE_REFUSAL.nobody);
    assert.equal(sentMail().length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. The count is a promise
// ---------------------------------------------------------------------------

describe("the number on the button is the number sent", () => {
  test("the send resolves the picker's choice with the picker's options, and emails exactly its count", async (t) => {
    freshTerm(t);
    const count = await countOf("zach", [T.vrCame], [T.holding]);
    const response = await testAndSend("zach", [T.vrCame], { exclude: [T.holding] });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.sent, count.emailed);
    assert.equal(new Set(sentMail().map((message) => message.to)).size, count.emailed);
  });

  test("a count that moved is refused with the new number, and nothing goes", async (t) => {
    freshTerm(t);
    await call("zach", testRoute.POST, { body: WORDS });
    const count = await countOf("zach", [T.vrCame], [], "events");
    assert.equal(count.emailed, 2);
    // Amara switches event announcements off between the count and the press.
    w.world.db.poke("users/amara", { "profile.notifications.categories.events": false });
    const stale = await call("zach", route.POST, { body: { include: [T.vrCame], exclude: [], row: "events", ...WORDS, count: count.emailed } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.count, 1);
    assert.equal(stale.body.error, words.countChangedWords(1));
    assert.equal(sentMail().length, 0);
    assert.deepEqual(recordPaths(), []);
    // A number nobody counted is refused the same way.
    const made = await call("zach", route.POST, { body: { include: [T.vrCame], exclude: [], row: "events", ...WORDS, count: 7 } });
    assert.equal(made.status, 409);
    assert.equal(made.body.count, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. A test first
// ---------------------------------------------------------------------------

describe("a test first, as Publish waits for one", () => {
  test("no test of these words: refused, and nothing goes", async (t) => {
    freshTerm(t);
    const count = await countOf("tom", [T.groupC]);
    const response = await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
    assert.equal(response.status, 409);
    assert.equal(response.body.test, "none");
    assert.equal(response.body.error, words.MESSAGE_REFUSAL.untested);
    assert.equal(w.world.mail.length, 0);
  });

  test("the test is the writer's own: marked, to their own address, no marker, no unsubscribe link, nothing kept but its words' fingerprint", async (t) => {
    freshTerm(t);
    const response = await call("tom", testRoute.POST, { body: { ...WORDS, to: "amara@example.com", include: [T.groupC] } });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ["ok", "test"]);
    assert.equal(response.body.test.delivery, "sent");
    assert.equal(w.world.mail.length, 1);
    const [message] = w.world.mail;
    assert.equal(message.to, "tom@example.com");
    assert.equal(message.subject, `[TEST] ${WORDS.subject}`);
    assert.equal(message.kind, "message-test");
    assert.equal(message.surface, undefined);
    assert.equal(message.listUnsubscribe, undefined);
    assert.equal(message.referenceId, "messagetest__tom");
    const text = textOf(renderToStaticMarkup(message.react));
    assert.ok(text.includes("Hi all, a short check-in for everyone facilitating this term."));
    assert.ok(text.includes("Sent by Tom"));
    assert.doesNotMatch(text, /Sent as an important notice|unsubscribe/i);
    const record = w.world.db.read("courseNudges/messagetest__tom");
    assert.deepEqual(Object.keys(record).sort(), ["at", "byUid", "kind", "wording"]);
    assert.equal(record.wording, sending.wordingOf(WORDS.subject, WORDS.message));
    assert.ok(!JSON.stringify(record).includes("pizza"), "the test's words were kept");
  });

  test("changing a word needs another test", async (t) => {
    freshTerm(t);
    await call("tom", testRoute.POST, { body: WORDS });
    const count = await countOf("tom", [T.groupC]);
    const changed = { ...WORDS, message: `${WORDS.message} Bring a friend.` };
    const response = await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...changed, count: count.emailed } });
    assert.equal(response.status, 409);
    assert.equal(response.body.test, "stale");
    assert.equal(response.body.error, words.MESSAGE_REFUSAL.staleTest);
    // The same words with their line breaks written the Windows way, and space around them, are the same words.
    const same = { subject: ` ${WORDS.subject} `, message: `${WORDS.message.replace(/\n/g, "\r\n")}\n` };
    assert.equal((await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...same, count: count.emailed } })).status, 200);
  });

  test("a test this copy held, or one to a suppressed address, reached nobody and is not a test", async (t) => {
    freshTerm(t);
    for (const fate of ["held", "suppressed"]) {
      w.world.mailFate = () => fate;
      const response = await call("tom", testRoute.POST, { body: WORDS });
      assert.equal(response.status, 200);
      assert.equal(response.body.test.delivery, fate);
      assert.equal(w.world.db.read("courseNudges/messagetest__tom"), undefined, `a ${fate} test was recorded`);
    }
    w.world.mailFate = null;
    const count = await countOf("tom", [T.groupC]);
    assert.equal((await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } })).status, 409);
  });

  test("ten tests an hour", async (t) => {
    freshTerm(t);
    for (let n = 0; n < sending.MESSAGE_TESTS_PER_HOUR; n += 1) assert.equal((await call("tom", testRoute.POST, { body: WORDS })).status, 200);
    const refused = await call("tom", testRoute.POST, { body: WORDS });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.error, words.tooManyTestsWords(10));
    assert.equal(w.world.mail.length, 10);
  });
});

// ---------------------------------------------------------------------------
// 5. Notice or by their settings, per person, never a mix
// ---------------------------------------------------------------------------

describe("notice or by their settings, one class for the whole send", () => {
  test("a group's facilitator to their group: a programme notice, through the notice door, with the marker and no unsubscribe", async (t) => {
    freshTerm(t);
    const response = await testAndSend("tom", [T.groupC]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const mail = sentMail();
    assert.ok(mail.length > 0);
    for (const message of mail) {
      assert.equal(message.kind, "notice");
      assert.equal(message.surface, "messages");
      assert.equal(message.actorUid, "tom");
      assert.equal(message.listUnsubscribe, undefined);
      assert.ok(message.text.includes("Sent as an important notice"), message.to);
      assert.ok(message.text.includes("You are getting this because you hold a place on a programme or help run one"), message.to);
      assert.doesNotMatch(message.text, /unsubscribe/i);
      assert.equal(message.subject, WORDS.subject);
      // One address a message.
      assert.equal(typeof message.to, "string");
    }
    const record = w.world.db.read(recordPaths()[0]);
    assert.equal(record.mode, "notice");
    assert.equal(record.row, null);
    assert.ok(record.people.every((person) => person.kind === "notice"));
  });

  test("a notice reaches people whatever their settings: Dev switched course announcements off and is told", async (t) => {
    freshTerm(t);
    const response = await testAndSend("zach", [T.agiHolding]);
    assert.equal(response.status, 200);
    const mail = sentMail();
    assert.ok(mail.some((message) => message.to === "dev@example.com"), "a notice read Dev's settings");
    assert.ok(mail.every((message) => message.kind === "notice"));
  });

  test("news by their settings: the one row chosen, one door, the line saying which and the link that unsubscribes from it", async (t) => {
    freshTerm(t);
    const response = await testAndSend("zach", [T.vrCame], { row: "events" });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const mail = sentMail();
    assert.deepEqual(mail.map((message) => message.to).sort(), ["amara@example.com", "mo@example.com"]);
    for (const message of mail) {
      assert.equal(message.kind, "message");
      assert.equal(message.surface, undefined, "a message by their settings is not a notice");
      assert.ok(message.listUnsubscribe?.url.startsWith("https://naisi.invalid/api/unsubscribe?t="), message.to);
      assert.match(message.html, /href="https:\/\/naisi\.invalid\/api\/unsubscribe\?t=/);
      assert.doesNotMatch(message.text, /Sent as an important notice/);
    }
    const amara = mail.find((message) => message.to === "amara@example.com");
    assert.ok(amara.text.includes("You’re getting this because you said yes to event announcements. You can unsubscribe at any time."));
    // A guest's yes is their own subscription to the list.
    const mo = mail.find((message) => message.to === "mo@example.com");
    assert.ok(mo.text.includes("You’re getting this because you subscribed to event announcements."));
    const record = w.world.db.read(recordPaths()[0]);
    assert.equal(record.mode, "grid");
    assert.equal(record.row, "events");
    assert.ok(record.people.every((person) => person.kind === "grid"));
  });

  test("the row is the writer's, never a mix: the newsletter's yes is the only one read when it is chosen", async (t) => {
    freshTerm(t);
    // Of the people who came to the VR night only Bea said yes to the newsletter; Amara's yes to
    // event announcements, and Mo's own subscription to them, are not asked.
    const response = await testAndSend("zach", [T.vrCame], { row: "newsletter" });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const mail = sentMail();
    assert.deepEqual(mail.map((message) => message.to), ["bea@example.com"]);
    assert.equal(mail[0].kind, "message");
    assert.ok(mail[0].text.includes("You’re getting this because you said yes to the newsletter."));
    assert.equal(w.world.db.read(recordPaths()[0]).row, "newsletter");
  });

  test("an unsubscribe link names the row the message read, and the account or the guest's address", async (t) => {
    freshTerm(t);
    await testAndSend("zach", [T.vrCame], { row: "events" });
    const tokenOf = (message) => {
      const raw = decodeURIComponent(message.listUnsubscribe.url.split("?t=")[1]);
      return JSON.parse(Buffer.from(raw.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    };
    const [amara, mo] = ["amara@example.com", "mo@example.com"].map((to) => sentMail().find((message) => message.to === to));
    assert.deepEqual({ ...tokenOf(amara), iat: 0, exp: 0 }, { s: "unsubscribe", uid: "amara", c: "events", iat: 0, exp: 0 });
    assert.deepEqual({ ...tokenOf(mo), iat: 0, exp: 0 }, { s: "unsubscribe", email: "mo@example.com", c: "events", iat: 0, exp: 0 });
  });

  test("no push but the run composers' own: only the notice lane's door, only for a notice to one group or one programme's people", () => {
    // The record, the post, the rule and the note never push.
    for (const file of [
      join("src", "lib", "messages", "sending.ts"),
      join("src", "lib", "messages", "posting.ts"),
      join("src", "lib", "messages", "pushTarget.ts"),
      join("src", "lib", "messages", "pushing.ts"),
    ]) {
      assert.doesNotMatch(read(file), /sendNoticePush|sendPushToUid|sendPushToRowAudience|mirror\w*ToPush/, file);
    }
    // The send pushes through the door that reads no preference, once a person, and through nothing else.
    const sendRoute = read("src", "app", "api", "messages", "route.ts");
    assert.doesNotMatch(sendRoute, /sendPushToUid|sendPushToRowAudience|mirror\w*ToPush|wantsPushFor/);
    assert.equal((sendRoute.match(/\bsendNoticePush\(/g) ?? []).length, 1, "the send pushes from more than one place");
    assert.match(sendRoute, /const pushTarget = pushTargetOf\(send\.selection\.include, resolution\.mode\);/);
    assert.match(sendRoute, /const note = pushTarget \? await pushNoteFor\(db, writer\.roles, pushTarget, send\.subject\)\.catch\(\(\) => null\) : null;/);
    assert.match(sendRoute, /if \(!person\.uid \|\| person\.you \|\| \(person\.leftOut !== null && person\.leftOut !== "suppressed"\)\) continue;\s*if \(await sendNoticePush\(person\.uid, note\)\) pushed \+= 1;/);
    // The test never pushes.
    assert.doesNotMatch(read("src", "app", "api", "messages", "test", "route.ts"), /Push/);
  });
});

// ---------------------------------------------------------------------------
// 6. The writer included
// ---------------------------------------------------------------------------

describe("the writer is included when they match", () => {
  test("a lead writing to their programme's everyone is among the people, and is emailed", async (t) => {
    freshTerm(t);
    const count = await countOf("claudia", [T.agiEveryone]);
    assert.equal(count.you, true);
    assert.equal(pickerWords.headlineWords(count.people, count.you), `${count.people} people, including you`);
    const response = await testAndSend("claudia", [T.agiEveryone]);
    assert.equal(response.status, 200);
    assert.ok(sentMail().some((message) => message.to === "claudia@example.com"), "the writer was left out of their own send");
  });
});

// ---------------------------------------------------------------------------
// 7. Suppression and held mail
// ---------------------------------------------------------------------------

describe("a bounced address, and a copy of the site that may not write", () => {
  test("a suppressed address is left out and never handed to the door", async (t) => {
    freshTerm(t);
    const count = await countOf("zach", [T.vrCame], [], "events");
    assert.ok(count.reasons.some((each) => each.reason === "suppressed"));
    await testAndSend("zach", [T.vrCame], { row: "events" });
    assert.ok(!sentMail().some((message) => message.to === "gwen@example.com"), "a bounced address was written to");
    const record = w.world.db.read(recordPaths()[0]);
    assert.equal(record.reasons.suppressed, 1);
  });

  test("held mail on staging is counted as held, and the send otherwise goes as it would", async (t) => {
    freshTerm(t);
    await call("tom", testRoute.POST, { body: WORDS });
    const count = await countOf("tom", [T.groupC]);
    w.world.mailFate = () => "held";
    const response = await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
    assert.equal(response.status, 200);
    assert.deepEqual({ sent: response.body.sent, held: response.body.held }, { sent: 0, held: count.emailed });
    const record = w.world.db.read(recordPaths()[0]);
    assert.equal(record.counts.held, count.emailed);
    assert.ok(record.people.filter((person) => person.leftOut === null).every((person) => person.outcome === "held"));
    assert.equal(words.sentWords({ sent: 0, held: 2, suppressed: 0, failed: 0 }, null), "2 held, because this copy of the site doesn’t email them.");
  });

  test("a send that throws is counted, by account, never by address", async (t) => {
    freshTerm(t);
    await call("tom", testRoute.POST, { body: WORDS });
    const count = await countOf("tom", [T.groupC]);
    w.world.mailFate = () => "fail";
    const errors = [];
    const realError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    t.after(() => {
      console.error = realError;
    });
    const response = await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
    assert.equal(response.status, 200);
    assert.equal(response.body.failed, count.emailed);
    assert.ok(errors.length > 0 && errors.every((line) => !line.includes("@example.com")), "an address reached the log");
  });
});

// ---------------------------------------------------------------------------
// 8. The caps
// ---------------------------------------------------------------------------

describe("the caps refuse rather than truncate", () => {
  test("the fourth send in an hour to one audience is refused, with nothing sent; another audience is not", async (t) => {
    freshTerm(t);
    await call("tom", testRoute.POST, { body: WORDS });
    const count = await countOf("tom", [T.groupC]);
    const press = () => call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
    for (let n = 0; n < sending.MESSAGES_PER_HOUR; n += 1) assert.equal((await press()).status, 200, `send ${n + 1}`);
    const sentBefore = sentMail().length;
    const refused = await press();
    assert.equal(refused.status, 429);
    assert.match(refused.body.error, /^This audience has already had 3 messages in the last hour\. Nothing was sent\./);
    assert.equal(sentMail().length, sentBefore);
    assert.equal(recordPaths().length, sending.MESSAGES_PER_HOUR);
  });

  test("an audience is its tags in any order", () => {
    const one = sending.audienceKeyOf({ include: [T.groupB, T.groupC], exclude: [T.vrCame] });
    const two = sending.audienceKeyOf({ include: [T.groupC, T.groupB], exclude: [T.vrCame] });
    assert.equal(one, two);
    assert.notEqual(one, sending.audienceKeyOf({ include: [T.groupC], exclude: [] }));
    assert.match(one, /^[0-9a-f]{24}$/);
    const windows = sending.capWindows("tom", { include: [T.groupC], exclude: [] }, 1, 2);
    assert.equal(windows.hour.limit, 3);
    assert.equal(windows.day.limit, 10);
    assert.ok(windows.hour.key.endsWith("__tom") && !windows.day.key.includes("tom"), "the day's window is per audience, whoever writes");
  });

  test("ten a day per audience, whoever writes", async (t) => {
    freshTerm(t);
    const day = sending.capWindows("zach", { include: [T.groupC], exclude: [] }, 1, 2).day.key;
    w.world.db.seed(`courseNudges/emailrate__${day}`, { kind: "staff-email-throttle", key: day, windowStartAt: new Date(AFTER.getTime() - 60_000), count: 10, updatedAt: AFTER });
    await call("tom", testRoute.POST, { body: WORDS });
    const count = await countOf("tom", [T.groupC]);
    const refused = await call("tom", route.POST, { body: { include: [T.groupC], exclude: [], row: null, ...WORDS, count: count.emailed } });
    assert.equal(refused.status, 429);
    assert.match(refused.body.error, /in the last day\. Nothing was sent\./);
    assert.equal(sentMail().length, 0);
  });

  test("over three hundred emails is refused whole, never trimmed", () => {
    const route = read("src", "app", "api", "messages", "route.ts");
    assert.equal(sending.MAX_MESSAGE_EMAILS, 300);
    assert.match(route, /if \(emailed\.messages > MAX_MESSAGE_EMAILS\) \{\s*return NextResponse\.json\(\{ error: overCeilingWords\(emailed\.messages, MAX_MESSAGE_EMAILS\) \}, \{ status: 400 \}\);/);
    // Counted in messages: a member whose settings send to two addresses is two.
    const person = (addresses) => ({ key: "a:x", uid: "x", name: "X", you: false, kind: "grid", addresses, leftOut: null, under: [] });
    const counted = sending.emailedOf({ people: [person(["x@example.com", "x@students.example.com"]), { ...person([]), leftOut: "settings" }] });
    assert.deepEqual({ people: counted.people.length, messages: counted.messages }, { people: 1, messages: 2 });
    assert.equal(
      words.overCeilingWords(312, 300),
      "This would send 312 emails, over the 300 one send can take. Nothing was sent: choose fewer people.",
    );
  });
});

// ---------------------------------------------------------------------------
// 9. The record
// ---------------------------------------------------------------------------

describe("the record of a send", () => {
  test("who wrote it, the tags, the class per person, the counts and why; never an address or the message", async (t) => {
    freshTerm(t);
    await testAndSend("zach", [T.vrCame], { exclude: [T.holding], row: "events" });
    const [path] = recordPaths();
    const record = w.world.db.read(path);
    assert.deepEqual(Object.keys(record).sort(), ["counts", "mode", "people", "postedUpdateId", "reasons", "row", "sentAt", "settled", "subject", "tagIds", "tags", "writerUid"]);
    assert.deepEqual(record.tagIds, [T.vrCame, T.holding]);
    assert.equal(record.writerUid, "zach");
    assert.equal(record.subject, WORDS.subject);
    assert.equal(record.settled, true);
    assert.deepEqual(record.tags, [
      { id: T.vrCame, label: "Came to: VR games night", sign: "include" },
      { id: T.holding, label: "Holding a place", sign: "exclude" },
    ]);
    for (const person of record.people) {
      assert.deepEqual(Object.keys(person).sort(), ["kind", "leftOut", "outcome", "uid"]);
      assert.ok(person.uid === null || /^[a-z]+$/.test(person.uid), JSON.stringify(person));
    }
    assert.equal(record.counts.people, record.people.length);
    assert.equal(record.counts.sent + record.counts.held + record.counts.suppressed + record.counts.failed, record.counts.emailed);
    const kept = JSON.stringify(record);
    assert.doesNotMatch(kept, /@/, "an address was kept");
    assert.ok(!kept.includes("pizza"), "the message was kept");
    // The send log carries the record's id, so the two can be read together.
    assert.ok(sentMail().every((message) => message.referenceId === path.slice("messageSends/".length)));
  });
});

// ---------------------------------------------------------------------------
// 10. Also post it on the programme's page
// ---------------------------------------------------------------------------

describe("\"Also post it on the programme's page\"", () => {
  test("which tags it is offered for: one programme's people or one of its groups, for whoever runs them", async (t) => {
    freshTerm(t);
    const targetsOf = async (uid) => posting.postTargetsOf(await writers.messageWriterOf(w.world.db, sessionFor(uid), AFTER));
    const claudia = await targetsOf("claudia");
    assert.deepEqual(
      claudia.map((target) => [target.tagId, target.to, target.groupId]).sort(),
      [
        [T.agiEveryone, "everyone", null],
        [T.agiFacilitating, "facilitators", null],
        [T.agiHolding, "everyone", null],
        [T.groupA, "group", A],
        [T.groupB, "group", B],
        [T.groupC, "group", C],
      ].sort(),
    );
    assert.ok(claudia.every((target) => target.programme === "AGI Strategy" && target.runId === RUN.agi));
    assert.deepEqual((await targetsOf("tom")).map((target) => target.tagId), [T.groupC]);
    // Technical AI Safety names a run, unpublished: its people, and no group.
    assert.deepEqual((await targetsOf("tess")).map((target) => target.tagId).sort(), [T.taisEveryone, id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "facilitating" }), id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "holding" })].sort());
    // Exactly one tag, nobody left out.
    const claudiaWriter = await writers.messageWriterOf(w.world.db, sessionFor("claudia"), AFTER);
    assert.equal(posting.postTargetFor(claudiaWriter, { include: [T.groupB], exclude: [] })?.groupId, B);
    assert.equal(posting.postTargetFor(claudiaWriter, { include: [T.groupB, T.groupC], exclude: [] }), null);
    assert.equal(posting.postTargetFor(claudiaWriter, { include: [T.agiEveryone], exclude: [T.groupB] }), null);
    assert.equal(posting.postTargetFor(claudiaWriter, { include: [T.vrCame], exclude: [] }), null);
  });

  test("posted: the update is written for the people it is to, and settled with what the email did", async (t) => {
    freshTerm(t);
    const response = await testAndSend("tom", [T.groupC], { post: true });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.posted, "AGI Strategy");
    const [path] = updatePaths().filter((each) => w.world.db.read(each).authorUid === "tom");
    assert.ok(path, "no update was posted");
    const update = w.world.db.read(path);
    assert.equal(update.runId, RUN.agi);
    assert.equal(update.to, "group");
    assert.equal(update.groupId, C);
    assert.equal(update.title, WORDS.subject);
    assert.equal(update.message, WORDS.message);
    assert.deepEqual(update.email, { planned: response.body.sent, sent: response.body.sent, held: 0, suppressed: 0, failed: 0, settled: true });
    assert.equal(w.world.db.read(recordPaths()[0]).postedUpdateId, path.slice("courseUpdates/".length));
    assert.equal(words.sentWords({ sent: 1, held: 0, suppressed: 0, failed: 0 }, "AGI Strategy"), "Sent to 1 person. Posted on AGI Strategy’s page too.");
  });

  test("not posted unless asked, and refused for a choice an update cannot be to, with nothing sent", async (t) => {
    freshTerm(t);
    const before = updatePaths().length;
    assert.equal((await testAndSend("tom", [T.groupC])).status, 200);
    assert.equal(updatePaths().length, before, "an update was posted without being asked");
    const refused = await testAndSend("zach", [T.vrCame], { row: "events", post: true });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, words.MESSAGE_REFUSAL.notPostable);
    assert.equal(updatePaths().length, before);
    assert.ok(!sentMail().some((message) => message.kind === "message"), "a refused post sent its emails");
  });

  test("the updates route's own gate is asked again of the run as it stands", async (t) => {
    freshTerm(t);
    const target = posting.postTargetsOf(await writers.messageWriterOf(w.world.db, sessionFor("tom"), AFTER))[0];
    assert.equal(await posting.mayPostOn(w.world.db, sessionFor("tom"), target), "yes");
    // The group archived since, or the run being destroyed: no run to post on.
    w.world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal(await posting.mayPostOn(w.world.db, sessionFor("tom"), target), "no-run");
    w.world.db.poke(`courseGroups/${C}`, { archived: false, facilitatorUids: ["sofia"] });
    assert.equal(await posting.mayPostOn(w.world.db, sessionFor("tom"), target), "not-yours");
    assert.equal(await posting.mayPostOn(w.world.db, sessionFor("zach"), target), "yes");
    w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal(await posting.mayPostOn(w.world.db, sessionFor("zach"), target), "no-run");
  });
});

// ---------------------------------------------------------------------------
// 11. The page, the composer and the menu
// ---------------------------------------------------------------------------

const Page = (await w.loadTs(join("app", "(app)", "messages", "page.tsx"))).default;
const Composer = (await w.loadTs(join("features", "messages", "MessageComposer.tsx"))).default;

describe("the page, the composer and the menu", () => {
  async function draw(who, searchParams = {}) {
    w.world.user = who === null ? null : sessionFor(who);
    const element = await Page({ searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html) };
  }

  test("a writer gets the composer, the picker first; anybody else one line saying who it is for", async (t) => {
    freshTerm(t);
    const writer = await draw("tom");
    for (const said of ["Messages", "Choose who a message is for, send yourself a test, then send it.", "Loading the tags…", "Subject", "Message", "Send a test to me", "Send"]) {
      assert.ok(writer.text.includes(said), `the composer does not say: ${said}`);
    }
    assert.match(writer.html, /<h1[^>]*>Messages<\/h1>/);
    assert.match(writer.html, /<h2 class="visually-hidden">Write a message<\/h2>/);
    assert.doesNotMatch(writer.html, /@example\.com/);
    for (const who of ["amara", "sue", "lloyd"]) {
      const other = await draw(who);
      assert.ok(other.text.includes(words.PAGE_WORDS.notForYou), who);
      assert.doesNotMatch(other.html, /Send a test to me/, who);
    }
  });

  test("?for= starts the composer with a programme the writer could post for, and nothing else", async (t) => {
    freshTerm(t);
    const started = await draw("claudia", { for: T.agiEveryone });
    // The picker's chip is drawn once its tags arrive; until then the composer holds the tag it was handed.
    assert.ok(started.html.includes("Messages"));
    const posts = posting
      .postTargetsOf(await writers.messageWriterOf(w.world.db, sessionFor("claudia"), AFTER))
      .map((target) => ({ tagId: target.tagId, programme: target.programme, words: words.postWords(target.programme, target.to, target.group) }));
    const html = renderToStaticMarkup(createElement(Composer, { initial: [T.agiEveryone], postTargets: posts }));
    // One programme's people: the post switch is offered, on, with where it stays.
    assert.ok(textOf(html).includes("Also post it on the programme’s page"));
    assert.ok(textOf(html).includes("Everyone on AGI Strategy keeps it under Updates on the programme’s page, as well as in their email."));
    assert.match(html, /type="checkbox"[^>]*checked=""/);
    const none = renderToStaticMarkup(createElement(Composer, { initial: [], postTargets: posts }));
    assert.doesNotMatch(textOf(none), /Also post it on the programme’s page/);
    assert.ok(textOf(none).includes(words.COMPOSER_WORDS.chooseFirst));
    // A tag the writer could not post for is not started with.
    const page = read("src", "app", "(app)", "messages", "page.tsx");
    assert.match(page, /const initial = asked && postTargets\.some\(\(target\) => target\.tagId === asked\) \? \[asked\] : \[\];/);
  });

  test("a programme's Messages tab links to Messages set to that programme, for the people Messages would start with it", () => {
    const tab = read("src", "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "messages", "page.tsx");
    assert.match(tab, /const everyone = tagId\(\{ kind: "programme", roundId, programmeId, part: "everyone" \}\);/);
    assert.match(tab, /const opensMessages = writer !== null && postTargetsOf\(writer\)\.some\(\(target\) => target\.tagId === everyone\);/);
    assert.match(tab, /<Link href=\{messagesHrefFor\(everyone\)\} className=\{styles\.writeLink\}>/);
    assert.equal(words.messagesHrefFor(T.agiEveryone), `/messages?for=${encodeURIComponent(T.agiEveryone)}`);
    // The old composer stays beside it until it hands over.
    assert.match(tab, /<UpdateComposer runId=\{run\.id\}/);
  });

  test("the menu draws Messages for an admin, and for anybody else when the route says so", async () => {
    const nav = await w.loadTs(join("layout", "appNav.ts"));
    const entry = nav.APP_NAV.flatMap((group) => group.entries).find((each) => each.href === "/messages");
    assert.deepEqual(entry, { label: "Messages", href: "/messages", rule: "messages" });
    const hook = read("src", "features", "messages", "useWritesMessages.ts");
    assert.match(hook, /fetch\("\/api\/messages", \{ cache: "no-store" \}\)/);
    assert.match(hook, /if \(role === "admin"\) return true;/);
    assert.match(hook, /return asks && answer\?\.uid === uid && answer\.writes;/);
  });
});

// ---------------------------------------------------------------------------
// 12. The words
// ---------------------------------------------------------------------------

describe("the words", () => {
  test("no dashes, in any file of Messages", () => {
    const files = [
      join("src", "lib", "messages", "words.ts"),
      join("src", "lib", "messages", "parse.ts"),
      join("src", "lib", "messages", "sending.ts"),
      join("src", "lib", "messages", "posting.ts"),
      join("src", "lib", "messages", "writers.ts"),
      join("src", "features", "messages", "MessageComposer.tsx"),
      join("src", "features", "messages", "useWritesMessages.ts"),
      join("src", "emails", "MessageEmail.tsx"),
      join("src", "app", "api", "messages", "route.ts"),
      join("src", "app", "api", "messages", "test", "route.ts"),
      join("src", "app", "(app)", "messages", "page.tsx"),
      join("src", "app", "(app)", "messages", "sent", "page.tsx"),
      join("src", "lib", "messages", "sent.ts"),
      join("src", "lib", "messages", "sentSenders.ts"),
      join("src", "lib", "messages", "pushTarget.ts"),
      join("src", "lib", "messages", "pushing.ts"),
      join("src", "lib", "messages", "handover.ts"),
      join("src", "features", "messages", "MessagesTabs.tsx"),
      join("src", "features", "messages", "SentList.tsx"),
      join("docs", "messages.md"),
    ];
    for (const file of files) assert.doesNotMatch(read(file), /[\u2013\u2014]/, file);
  });

  test("the button, the test, the send and the refusals", () => {
    assert.equal(words.sendButtonWords(23), "Send to 23 people");
    assert.equal(words.sendButtonWords(1), "Send to 1 person");
    assert.equal(words.sendButtonWords(0), "Send");
    assert.equal(words.testResultWords("sent", "5:38pm"), "Test sent to you at 5:38pm. Check it, then send.");
    assert.equal(words.sentWords({ sent: 23, held: 0, suppressed: 1, failed: 0 }, null), "Sent to 23 people; 1 not emailed: do-not-email list.");
    assert.equal(words.countChangedWords(24), "Who this reaches changed since it was counted: it would now email 24 people. Nothing was sent. Check it, and press again.");
    assert.equal(words.becauseWords("courses", false), "You’re getting this because course announcements are switched on in your settings.");
    assert.equal(words.testSubject("Room change"), "[TEST] Room change");
  });

  test("the body is read the way an update's is", () => {
    assert.deepEqual(parse.parseMessageTest({ subject: " A ", message: "B\r\nC " }), { ok: true, value: { subject: "A", message: "B\nC" } });
    assert.deepEqual(parse.parseMessageSend({ include: [T.groupC], subject: "A", message: "B", count: 3 }), {
      ok: true,
      value: { subject: "A", message: "B", selection: { include: [T.groupC], exclude: [] }, row: null, count: 3, post: false },
    });
  });
});

// The policy keeps the picker's sentence (tests/audience-picker.test.mjs); the
// notice line Messages' marker adds is the recipient's own reason.
describe("what a Messages notice says about itself", () => {
  test("the marker's reason for the messages surface", () => {
    assert.match(read("src", "emails", "NoticeMarker.tsx"), /messages: "you hold a place on a programme or help run one",/);
    assert.match(read("src", "lib", "firestore", "emailSends.ts"), /\| "messages";/);
  });
});

// ---------------------------------------------------------------------------
// 13. Sent
// ---------------------------------------------------------------------------

const sentLib = await lib("messages", "sent.ts");
const senders = await lib("messages", "sentSenders.ts");
const handover = await lib("messages", "handover.ts");
const pushRule = await lib("messages", "pushTarget.ts");
const pushing = await lib("messages", "pushing.ts");
const SentPage = (await w.loadTs(join("app", "(app)", "messages", "sent", "page.tsx"))).default;

/**
 * The store, answering `orderBy` on the field its range is on: Sent asks for
 * the newest of a window, one range on one field ordered by that field, which
 * Firestore answers with no declared index. The suite's store keeps no order
 * of its own, so this sorts what it found and then cuts it to the limit.
 */
function withOrdering(t) {
  const db = w.world.db;
  const real = db.collection.bind(db);
  const ordered = (inner, order = null, max = Number.POSITIVE_INFINITY) => ({
    where: (...args) => ordered(inner.where(...args), order, max),
    orderBy: (field, direction = "asc") => ordered(inner, { field, direction }, max),
    limit: (n) => ordered(inner, order, Math.min(max, n)),
    get: async () => {
      const found = [...(await inner.get()).docs];
      if (order) {
        const at = (doc) => {
          const value = doc.data()?.[order.field];
          return value instanceof Date ? value.getTime() : Number(value ?? 0);
        };
        found.sort((a, b) => (order.direction === "desc" ? at(b) - at(a) : at(a) - at(b)));
      }
      const docs = found.slice(0, max);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  db.collection = (name) => {
    const collection = real(name);
    return { ...collection, where: (...args) => ordered(collection.where(...args)), orderBy: (field, direction) => ordered(collection, { field, direction }) };
  };
  t.after(() => {
    db.collection = real;
  });
}

/** Sent as `who` reads it, over the two weeks ending on the suite's day. */
async function sentAs(who, until) {
  const user = sessionFor(who);
  const writer = await writers.messageWriterOf(w.world.db, user, new Date());
  assert.ok(writer, `${who} writes nothing in Messages`);
  return sentLib.loadSent(w.world.db, user, writer, sentLib.sentWindowOf(until, new Date()), new Date());
}

/** One row of the email log, as `sendEmail` and `sendNotice` leave it. */
const logRow = (over) => ({
  to: "amara@example.com",
  subject: "Room change tonight",
  fromEmail: "notifications@naisi.invalid",
  fromName: "NAISI",
  kind: "notice",
  surface: "course-room",
  actorUid: "tom",
  referenceId: C,
  status: "sent",
  sentAt: new Date("2026-12-09T17:00:00Z"),
  ...over,
});

describe("Sent: who reads which send", () => {
  test("an admin reads every message; a lead and a facilitator only the ones to people they run; anybody else is told who it is for", async (t) => {
    freshTerm(t);
    withOrdering(t);
    // Three sends, each by its writer: the VR night's people, less everybody holding a place
    // (an admin's: the term's own tag is the admins' alone); AGI Strategy's everyone (its lead);
    // Group C (its facilitator).
    assert.equal((await testAndSend("zach", [T.vrCame], { exclude: [T.holding], row: "events" })).status, 200);
    mock.timers.tick(60_000);
    assert.equal((await testAndSend("claudia", [T.agiEveryone], { post: false })).status, 200);
    mock.timers.tick(60_000);
    assert.equal((await testAndSend("tom", [T.groupC], { post: false })).status, 200);

    const subjectsFor = async (who) => (await sentAs(who)).sends.filter((send) => send.source === "messages").map((send) => send.from);
    // Newest first.
    assert.deepEqual(await subjectsFor("zach"), ["Tom Fletcher", "Claudia Reyes", "you"]);
    // Claudia leads AGI Strategy, so Group C is hers too; the VR night's tag is hers as SU-recognised
    // committee, and the term's own tag is not, so the admin's send is not.
    assert.deepEqual(await subjectsFor("claudia"), ["Tom Fletcher", "you"]);
    assert.deepEqual(await subjectsFor("tom"), ["you"]);
    // Sofia facilitates Groups A and B: none of these was to them.
    assert.deepEqual(await subjectsFor("sofia"), []);
    assert.equal((await sentAs("sofia")).everything, false);
    assert.equal((await sentAs("zach")).everything, true);

    // The page: the same people, and anybody else reads the line Write gives them.
    for (const who of ["amara", "sue", "lloyd"]) {
      w.world.user = sessionFor(who);
      const html = renderToStaticMarkup(await SentPage({ searchParams: Promise.resolve({}) }));
      assert.ok(textOf(html).includes(words.PAGE_WORDS.notForYou), who);
      assert.doesNotMatch(html, /See who/, who);
    }
  });

  test("a message is read only when every tag in it, left out or included, is the reader's", async (t) => {
    freshTerm(t);
    withOrdering(t);
    // An admin writes to Group C, leaving out AGI Strategy's people holding a place: Tom may use
    // Group C's tag and not the programme's, so the send is not his to read.
    assert.equal((await testAndSend("zach", [T.groupC], { exclude: [T.agiFacilitating] })).status, 200);
    assert.equal((await sentAs("tom")).sends.length, 0);
    assert.equal((await sentAs("claudia")).sends.length, 1);
    const scope = (await lib("audience", "scope.ts")).scopeOf(sessionFor("tom"), { leads: [], groups: [C] });
    assert.equal(sentLib.maySeeSend(scope, { tags: [{ id: T.groupC, label: "", sign: "include" }] }), true);
    assert.equal(sentLib.maySeeSend(scope, { tags: [{ id: T.groupC, label: "", sign: "include" }, { id: T.groupB, label: "", sign: "exclude" }] }), false);
    assert.equal(sentLib.maySeeSend(scope, { tags: [] }), false, "a record with no tag is nobody's");
    assert.equal(sentLib.maySeeSend(scope, { tags: [{ id: "not a tag", label: "", sign: "include" }] }), false);
  });
});

describe("Sent: what a message says, for the person reading", () => {
  test("names by the site's rule, who was left out and why by name to an admin alone, and counts to everybody", async (t) => {
    freshTerm(t);
    withOrdering(t);
    // The VR night by event announcements: Amara and Mo said yes, Gwen's address bounced, Bea and
    // Dev said no, Dan walked in. Claudia may use the tag (SU-recognised committee).
    assert.equal((await testAndSend("zach", [T.vrCame], { row: "events" })).status, 200);
    const [admin] = (await sentAs("zach")).sends;
    assert.equal(admin.subject, WORDS.subject);
    assert.equal(admin.what, "By their settings: event announcements");
    assert.equal(admin.notice, false);
    assert.deepEqual(admin.tags, [{ label: "Came to: VR games night", sign: "include" }]);
    assert.equal(admin.when, "Thu 10 Dec, 12pm");
    const emailed = admin.people.filter((person) => person.emailed).map((person) => person.name);
    assert.deepEqual(emailed, ["Amara Okafor"]);
    const notEmailed = Object.fromEntries(admin.people.filter((person) => !person.emailed).map((person) => [person.name, person.why]));
    assert.equal(notEmailed["Gwen Price"], "Their address bounced or marked us as spam");
    assert.equal(notEmailed["Bea Lindqvist"], "Didn’t say yes to event announcements");
    assert.ok(admin.reasons.some((each) => each.why === "Didn’t say yes to event announcements" && each.count >= 2), JSON.stringify(admin.reasons));
    assert.ok(admin.noAccount, "the guests and the walk-in are not counted");
    assert.match(admin.counts, /^\d+ emailed · \d+ left out$/);

    // Claudia: the same people by the same rule (she is on the committee), and no reason beside any name.
    const [lead] = (await sentAs("claudia")).sends;
    assert.deepEqual(lead.people.map((person) => person.name), admin.people.map((person) => person.name));
    assert.ok(lead.people.every((person) => person.why === null), "a reason reached somebody who is not an admin");
    assert.deepEqual(lead.reasons, admin.reasons);
  });

  test("a facilitator sees the name people go by, never a full name; nothing reaches the page but names and counts", async (t) => {
    freshTerm(t);
    withOrdering(t);
    assert.equal((await testAndSend("tom", [T.groupC], { post: false })).status, 200);
    const [admin] = (await sentAs("zach")).sends;
    const [own] = (await sentAs("tom")).sends;
    assert.equal(own.from, "you");
    assert.equal(admin.from, "Tom Fletcher");
    assert.equal(own.what, "Programme notice");
    assert.equal(own.notice, true);
    assert.ok(own.people.length > 0);
    // "Amara Okafor" to the admin is "Amara" to the facilitator, who is not on the committee.
    for (const [index, person] of own.people.entries()) {
      assert.ok(!person.name.includes(" "), `a full name reached a facilitator: ${person.name}`);
      assert.ok(admin.people.some((each) => each.name.startsWith(person.name)), person.name);
      assert.equal(person.why, null, `${index}`);
    }
    const shown = JSON.stringify(await sentAs("tom")) + JSON.stringify(await sentAs("zach"));
    assert.doesNotMatch(shown, /@/, "an address reached the page");
    for (const uid of ["amara", "tom", "zach", "claudia", "sofia", "rahul", "bea", "dev"]) {
      assert.doesNotMatch(shown, new RegExp(`"${uid}"`), `an account id reached the page: ${uid}`);
    }
  });

  test("a send that stopped before it settled says so, and claims nothing it did", async (t) => {
    freshTerm(t);
    withOrdering(t);
    assert.equal((await testAndSend("tom", [T.groupC], { post: false })).status, 200);
    const [path] = recordPaths();
    w.world.db.poke(path, { settled: false, "counts.sent": 0 });
    const [send] = (await sentAs("tom")).sends;
    assert.equal(send.cutOff, true);
    assert.match(send.counts, /^\d+ to be emailed · 0 left out$/);
  });

  test("a person named one by one is named for the person reading, not as the writer saw them", async (t) => {
    freshTerm(t);
    withOrdering(t);
    const amara = id({ kind: "person", uid: "amara" });
    assert.equal((await testAndSend("zach", [amara])).status, 200);
    const [path] = recordPaths();
    // Whatever the writer saw, the reader's rule names the person.
    w.world.db.poke(path, { tags: [{ id: amara, label: "Somebody else entirely", sign: "include" }] });
    const [send] = (await sentAs("claudia")).sends;
    assert.deepEqual(send.tags, [{ label: "Amara Okafor", sign: "include" }]);
  });
});

describe("Sent: the site's other sends, from the email log, for an admin", () => {
  test("rows of one send are one card; a lead or a facilitator reads none of the log", async (t) => {
    freshTerm(t, {
      // A room notice from Tom to three addresses within a minute: Amara's own, Bea's university
      // address, and one no account holds; Gwen's was on the do-not-email list.
      "emailSends/r1": logRow({}),
      "emailSends/r2": logRow({ to: "bea@students.example.com", sentAt: new Date("2026-12-09T17:00:20Z") }),
      "emailSends/r3": logRow({ to: "stranger@example.org", sentAt: new Date("2026-12-09T17:00:40Z") }),
      "emailSends/r4": logRow({ to: "gwen@example.com", status: "suppressed", sentAt: new Date("2026-12-09T17:01:00Z") }),
      // The newsletter, twice with the same subject an hour apart: two sends.
      "emailSends/n1": logRow({ kind: "newsletter", surface: undefined, actorUid: "zach", referenceId: "issue-1", subject: "December news", sentAt: new Date("2026-12-08T10:00:00Z") }),
      "emailSends/n2": logRow({ kind: "newsletter", surface: undefined, actorUid: "zach", referenceId: "issue-1", subject: "December news", to: "bea@example.com", sentAt: new Date("2026-12-08T11:00:00Z") }),
      // A job's reminder: the site sent it.
      "emailSends/j1": logRow({ surface: "course-week-reminder", actorUid: "courses-week-reminders", subject: "Before Tuesday", sentAt: new Date("2026-12-07T09:00:00Z") }),
      // Not sends to people: a confirmation, a test, and Messages' own rows, which its record covers.
      "emailSends/x1": logRow({ kind: "rsvp", surface: undefined, subject: "You’re in" }),
      "emailSends/x2": logRow({ kind: "message-test", surface: undefined, subject: "[TEST] Hello" }),
      "emailSends/x3": logRow({ kind: "message", surface: undefined, subject: "From Messages" }),
      "emailSends/x4": logRow({ surface: "messages", subject: "From Messages too" }),
      // Outside the two weeks.
      "emailSends/old": logRow({ subject: "Long ago", sentAt: new Date("2026-11-01T10:00:00Z") }),
    });
    withOrdering(t);
    const view = await sentAs("zach");
    assert.deepEqual(
      view.sends.map((send) => [send.what, send.subject, send.from]),
      [
        ["Room notice", "Room change tonight", "Tom Fletcher"],
        ["Newsletter", "December news", "you"],
        ["Newsletter", "December news", "you"],
        ["Reminder before a session", "Before Tuesday", "NAISI"],
      ],
    );
    const [room] = view.sends;
    assert.equal(room.notice, true);
    // Three people emailed, one of them with no account; Gwen not.
    assert.equal(room.counts, "3 emailed · 1 on the do-not-email list");
    assert.deepEqual(
      room.people.map((person) => [person.name, person.emailed, person.why]),
      [
        ["Amara Okafor", true, null],
        ["Bea Lindqvist", true, null],
        ["Gwen Price", false, "Not emailed: do-not-email list"],
      ],
    );
    assert.equal(room.noAccount, "1 person with no account");
    assert.deepEqual(room.reasons, [], "the log says nobody was left out, because it records nobody it left out");
    assert.doesNotMatch(JSON.stringify(view), /@/);
    for (const who of ["claudia", "tom"]) {
      assert.ok((await sentAs(who)).sends.every((send) => send.source === "messages"), `${who} read the email log`);
    }
  });

  test("a window holding more of the log than the page reads keeps the newest, and says some may be missing", async (t) => {
    const over = {};
    // One more row than the page reads, a minute apart, the newest on the suite's day.
    for (let n = 0; n <= sentLib.MAX_LOG_ROWS; n += 1) {
      over[`emailSends/many${n}`] = logRow({
        subject: `Notice ${n}`,
        to: `person${n}@example.org`,
        sentAt: new Date(new Date("2026-12-10T11:00:00Z").getTime() - n * 60_000),
      });
    }
    freshTerm(t, over);
    withOrdering(t);
    const view = await sentAs("zach");
    assert.equal(view.capped, true);
    const subjects = view.sends.map((send) => send.subject);
    assert.ok(subjects.includes("Notice 0"), "the newest send is missing");
    assert.ok(!subjects.includes(`Notice ${sentLib.MAX_LOG_ROWS}`), "the oldest row beyond the ceiling was read");
    w.world.user = sessionFor("zach");
    const html = renderToStaticMarkup(await SentPage({ searchParams: Promise.resolve({}) }));
    assert.ok(textOf(html).includes(words.SENT_WORDS.capped));
    // A window that fits says nothing of the kind.
    const small = renderToStaticMarkup(await SentPage({ searchParams: Promise.resolve({ until: "2026-11-01" }) }));
    assert.ok(!textOf(small).includes(words.SENT_WORDS.capped));
  });

  test("grouping: the same kind, surface, sender, reference and subject within half an hour is one send", () => {
    const at = (minutes) => new Date(Date.UTC(2026, 11, 9, 17, minutes));
    const row = (over) => ({ kind: "notice", surface: "course-group", actorUid: "tom", referenceId: C, subject: "S", to: "a@x", status: "sent", sentAt: at(0), ...over });
    const sends = sentLib.groupLogSends([
      row({}),
      row({ to: "b@x", sentAt: at(29) }),
      row({ to: "c@x", sentAt: at(59) }),
      row({ to: "d@x", sentAt: at(90) }),
      row({ subject: "Other", sentAt: at(1) }),
      row({ actorUid: "sofia", sentAt: at(2) }),
      row({ kind: "rsvp", surface: null, sentAt: at(3) }),
    ]);
    assert.deepEqual(
      sends.map((send) => [send.subject, send.actorUid, send.rows.length]).sort(),
      [["Other", "tom", 1], ["S", "sofia", 1], ["S", "tom", 1], ["S", "tom", 3]].sort(),
    );
    assert.equal(sends[0].at.getTime(), at(90).getTime(), "not newest first");
  });

  test("every kind and every surface the log can hold is decided: listed with its words, or not, with why", () => {
    // The unions as written, their comments taken out first (a comment may hold a semicolon).
    const source = read("src", "lib", "firestore", "emailSends.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const union = (name) => {
      const body = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(source)?.[1] ?? "";
      return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
    };
    const kinds = union("EmailSendKind");
    const surfaces = union("EmailSendSurface");
    assert.ok(kinds.length > 20 && surfaces.length > 10, "could not read the unions");
    assert.deepEqual(Object.keys(senders.SENT_KINDS).sort(), kinds);
    assert.deepEqual(Object.keys(senders.SENT_SURFACES).sort(), surfaces);
    for (const [key, entry] of [...Object.entries(senders.SENT_KINDS), ...Object.entries(senders.SENT_SURFACES)]) {
      if ("listed" in entry) assert.ok(entry.listed.label.length > 2, key);
      else assert.ok(entry.notListed.length > 20, `${key} says nothing about why it is not listed`);
    }
    // Messages' own rows, every test and the person-by-person mail are never listed.
    for (const kind of ["message", "message-test", "course-test", "admin-test", "application-test", "rsvp", "admissions", "unknown"]) {
      assert.equal(senders.listedSendOf(kind, null), null, kind);
    }
    assert.equal(senders.listedSendOf("notice", "messages"), null);
    assert.equal(senders.listedSendOf("notice", null), null, "a notice with no surface is listed");
    assert.equal(senders.listedSendOf("notice", "a-surface-nobody-made"), null);
    assert.deepEqual(senders.listedSendOf("notice", "course-room"), { label: "Room notice", byPerson: true });
    assert.equal(senders.listedSendOf("constructor", null), null);
  });
});

describe("Sent: its words", () => {
  test("counts, who sent it, how it went and who had no account", () => {
    const counts = { emailed: 23, leftOut: 2, sent: 21, held: 1, suppressed: 0, failed: 1 };
    assert.equal(words.messageCountsWords(counts, true), "21 emailed · 2 left out · 1 held · 1 couldn’t be sent");
    assert.equal(words.messageCountsWords({ ...counts, held: 0, failed: 0, sent: 23 }, true), "23 emailed · 2 left out");
    assert.equal(words.messageCountsWords(counts, false), "23 to be emailed · 2 left out");
    assert.equal(words.logCountsWords({ emailed: 1200, bounced: 2, held: 0, suppressed: 1 }), "1,200 emailed · 2 bounced or marked as spam · 1 on the do-not-email list");
    assert.equal(words.noAccountWords(1), "1 person with no account");
    assert.equal(words.noAccountWords(3), "3 people with no account");
    assert.equal(words.byWords("you"), "by you");
    assert.equal(words.sentModeWords("notice", null), "Programme notice");
    assert.equal(words.sentModeWords("grid", "events"), "By their settings: event announcements");
    assert.equal(words.sentModeWords("grid", "courses"), "By their settings: course announcements");
    assert.equal(words.sentWindowWords("Mon 19 Oct", "Sun 1 Nov"), "Sent from Mon 19 Oct to Sun 1 Nov.");
    for (const said of [...Object.values(words.SENT_WORDS), ...Object.values(words.HANDOVER_WORDS), ...Object.values(words.TAB_WORDS), words.COMPOSER_WORDS.pushesGroup, words.COMPOSER_WORDS.pushesProgramme]) {
      assert.doesNotMatch(said, /[\u2013\u2014]/, said);
    }
  });
});

describe("Sent: two weeks at a time, in London", () => {
  test("ending today, or on a real day before it; anything else is today", () => {
    const now = new Date("2026-11-01T15:00:00Z");
    const today = sentLib.sentWindowOf(undefined, now);
    assert.deepEqual([today.firstDay, today.lastDay, today.earlier, today.later], ["2026-10-19", "2026-11-01", "2026-10-18", null]);
    // Mon 19 Oct is British Summer Time, Mon 2 Nov is not: London midnights both ways.
    assert.equal(today.start.toISOString(), "2026-10-18T23:00:00.000Z");
    assert.equal(today.end.toISOString(), "2026-11-02T00:00:00.000Z");
    const earlier = sentLib.sentWindowOf("2026-10-18", now);
    assert.deepEqual([earlier.firstDay, earlier.lastDay, earlier.later], ["2026-10-05", "2026-10-18", "2026-11-01"]);
    const longAgo = sentLib.sentWindowOf("2026-09-01", now);
    assert.equal(longAgo.later, "2026-09-15");
    for (const asked of ["2026-11-02", "2026-02-30", "tomorrow", ["2026-10-01"], "2026-10-1"]) {
      assert.equal(sentLib.sentWindowOf(asked, now).lastDay, "2026-11-01", JSON.stringify(asked));
    }
    assert.equal(sentLib.sentHref("2026-11-01", now), "/messages/sent");
    assert.equal(sentLib.sentHref(null, now), "/messages/sent");
    assert.equal(sentLib.sentHref("2026-10-18", now), "/messages/sent?until=2026-10-18");
  });
});

describe("Sent: the page", () => {
  test("Write and Sent as two pills, the window, and each send with See who; nothing but names and counts", async (t) => {
    freshTerm(t);
    withOrdering(t);
    assert.equal((await testAndSend("tom", [T.groupC], { post: false })).status, 200);
    w.world.user = sessionFor("tom");
    const html = renderToStaticMarkup(await SentPage({ searchParams: Promise.resolve({}) }));
    const said = textOf(html);
    assert.match(html, /<h1[^>]*>Messages<\/h1>/);
    assert.match(html, /<nav[^>]*aria-label="Messages"[^>]*>/);
    assert.match(html, /<a href="\/messages\/sent"[^>]*aria-current="page"[^>]*>Sent<\/a>/);
    assert.match(html, /<a href="\/messages"[^>]*>Write<\/a>/);
    for (const words_ of [words.SENT_WORDS.lede, "Sent from Fri 27 Nov to Thu 10 Dec.", "Earlier", WORDS.subject, "Programme notice", "by you", "See who", "Emailed ("]) {
      assert.ok(said.includes(words_), `Sent does not say: ${words_}`);
    }
    assert.match(html, /<details[^>]*><summary[^>]*>See who<\/summary>/);
    assert.match(html, /<time dateTime="2026-12-10T12:00:00.000Z">Thu 10 Dec, 12pm<\/time>/);
    assert.doesNotMatch(html, /@example\.com/);
    // Write carries the same pills, with Write the current one.
    const write = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    assert.match(write, /<a href="\/messages"[^>]*aria-current="page"[^>]*>Write<\/a>/);
  });

  test("an earlier window, and nothing in it", async (t) => {
    freshTerm(t);
    withOrdering(t);
    w.world.user = sessionFor("tom");
    const html = renderToStaticMarkup(await SentPage({ searchParams: Promise.resolve({ until: "2026-11-01" }) }));
    const said = textOf(html);
    assert.ok(said.includes("Sent from Mon 19 Oct to Sun 1 Nov."), said);
    assert.ok(said.includes(words.SENT_WORDS.nothingYours));
    assert.match(html, /<a href="\/messages\/sent\?until=2026-11-15"[^>]*>Later<\/a>/);
    assert.match(html, /<a href="\/messages\/sent\?until=2026-10-18"[^>]*>Earlier<\/a>/);
  });
});

describe("the pushes the run's composers made, kept for a notice to one group or one programme's people", () => {
  test("a facilitator's notice to their group goes to each person's devices, the group's name and the subject, never the writer's", async (t) => {
    freshTerm(t);
    const response = await testAndSend("tom", [T.groupC], { post: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const pushes = w.world.pushes;
    assert.ok(pushes.length > 0, "nothing was pushed");
    const record = w.world.db.read(recordPaths()[0]);
    const reached = record.people.filter((person) => person.uid && person.leftOut === null).map((person) => person.uid).sort();
    assert.deepEqual(pushes.map((push) => push.uid).sort(), reached);
    for (const push of pushes) {
      assert.equal(push.title, "Group C");
      assert.equal(push.body, WORDS.subject);
      assert.equal(push.url, `/learn/${encodeURIComponent(RUN.agi)}/group/${encodeURIComponent(C)}`);
    }
    assert.ok(!pushes.some((push) => push.uid === "tom"));
    assert.equal(response.body.pushed, pushes.length);
    assert.equal(record.counts.pushed, pushes.length);
  });

  test("a phone that took nothing is not counted, and a bounced address still gets the notification", async (t) => {
    freshTerm(t);
    globalThis.__messagesUi.pushTaken = (uid) => uid !== "amara";
    t.after(() => {
      globalThis.__messagesUi.pushTaken = null;
    });
    // Tom's group's people, one of whose addresses has bounced.
    const record0 = await (async () => {
      await testAndSend("tom", [T.groupC], { post: false });
      return w.world.db.read(recordPaths()[0]);
    })();
    const bounced = record0.people.filter((person) => person.leftOut === "suppressed").map((person) => person.uid);
    for (const uid of bounced) assert.ok(w.world.pushes.some((push) => push.uid === uid), `${uid}'s phone was not told`);
    const taken = w.world.pushes.filter((push) => push.uid !== "amara").length;
    assert.equal(record0.counts.pushed, taken);
  });

  test("a lead's notice to the programme's everyone pushes as the cohort email's important notice did, never to the writer", async (t) => {
    freshTerm(t);
    const response = await testAndSend("claudia", [T.agiEveryone], { post: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const run = w.world.db.read(`courseRuns/${RUN.agi}`);
    const title = run.courseTitle.trim() || run.label.trim();
    assert.ok(title, "the world's run has no title to push with");
    const record = w.world.db.read(recordPaths()[0]);
    // Claudia leads AGI Strategy, so she is among its everyone and emailed, and never pushed.
    assert.ok(record.people.some((person) => person.uid === "claudia" && person.leftOut === null));
    const reached = record.people
      .filter((person) => person.uid && person.uid !== "claudia" && (person.leftOut === null || person.leftOut === "suppressed"))
      .map((person) => person.uid)
      .sort();
    const pushes = w.world.pushes;
    assert.ok(pushes.length > 0, "nothing was pushed");
    assert.deepEqual(pushes.map((push) => push.uid).sort(), reached);
    for (const push of pushes) {
      assert.deepEqual({ title: push.title, body: push.body, url: push.url }, { title, body: WORDS.subject, url: `/learn/${encodeURIComponent(RUN.agi)}` });
    }
    assert.equal(response.body.pushed, pushes.length);
    assert.equal(record.counts.pushed, pushes.length);
  });

  test("an admin's notice to the programme's people holding a place pushes the same way", async (t) => {
    freshTerm(t);
    const response = await testAndSend("zach", [T.agiHolding], { post: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const record = w.world.db.read(recordPaths()[0]);
    const reached = record.people
      .filter((person) => person.uid && (person.leftOut === null || person.leftOut === "suppressed"))
      .map((person) => person.uid)
      .sort();
    assert.deepEqual(w.world.pushes.map((push) => push.uid).sort(), reached);
    assert.ok(w.world.pushes.every((push) => push.url === `/learn/${encodeURIComponent(RUN.agi)}`));
    assert.ok(!w.world.pushes.some((push) => push.uid === "zach"));
  });

  test("nothing else pushes: the programme's facilitators alone, two groups, the term's people, or a message by their settings", async (t) => {
    freshTerm(t);
    assert.equal((await testAndSend("claudia", [T.agiFacilitating], { post: false })).status, 200);
    assert.equal((await testAndSend("zach", [T.groupA, T.groupB])).status, 200);
    assert.equal((await testAndSend("zach", [T.holding])).status, 200);
    assert.equal((await testAndSend("zach", [T.vrCame], { row: "events" })).status, 200);
    assert.deepEqual(w.world.pushes, []);
    for (const path of recordPaths()) assert.equal(w.world.db.read(path).counts.pushed, 0, path);
    // The rule, as the composer and the route both ask it.
    assert.deepEqual(pushRule.pushTargetOf([T.groupC], "notice"), { kind: "group", groupId: C });
    assert.deepEqual(pushRule.pushTargetOf([T.agiEveryone], "notice"), { kind: "programme", roundId: ROUND, programmeId: AGI });
    assert.deepEqual(pushRule.pushTargetOf([T.agiHolding], "notice"), { kind: "programme", roundId: ROUND, programmeId: AGI });
    for (const [include, mode] of [
      [[T.groupC], "grid"],
      [[T.agiEveryone], "grid"],
      [[T.agiFacilitating], "notice"],
      [[T.groupC, T.groupB], "notice"],
      [[T.agiEveryone, T.taisEveryone], "notice"],
      [[T.holding], "notice"],
      [[], "notice"],
    ]) {
      assert.equal(pushRule.pushTargetOf(include, mode), null, `${JSON.stringify(include)} ${mode}`);
    }
  });

  test("what the notification says: the course's title else the run's label, and with no run the programme's name and its people's programmes", async () => {
    const runDb = (data) => ({ collection: () => ({ doc: (runId) => ({ get: async () => ({ exists: data !== null, id: runId, data: () => data }) }) }) });
    const roles = (runs) => ({
      form: { round: { id: ROUND } },
      programmes: [{ programmeId: AGI, key: `${ROUND}:${AGI}`, name: "AGI Strategy", settings: {} }],
      runs,
      leads: [],
      facilitates: [],
      tagGroups: [],
    });
    const target = { kind: "programme", roundId: ROUND, programmeId: AGI };
    const named = [{ programmeId: AGI, runId: "run-1", published: true, groups: [] }];
    assert.deepEqual(await pushing.pushNoteFor(runDb({ courseTitle: "AGI Strategy Fellowship", label: "Autumn 2026" }), roles(named), target, "S"), {
      title: "AGI Strategy Fellowship",
      body: "S",
      url: "/learn/run-1",
    });
    assert.equal((await pushing.pushNoteFor(runDb({ courseTitle: " ", label: "Autumn 2026" }), roles(named), target, "S")).title, "Autumn 2026");
    assert.equal((await pushing.pushNoteFor(runDb(null), roles(named), target, "S")).title, "AGI Strategy");
    assert.deepEqual(await pushing.pushNoteFor(runDb(null), roles([]), target, "S"), { title: "AGI Strategy", body: "S", url: "/learn" });
    // Another term's programme, and a group of no run the term holds: nothing to say, so no push.
    assert.equal(await pushing.pushNoteFor(runDb(null), roles(named), { ...target, roundId: "another-round" }, "S"), null);
    assert.equal(await pushing.pushNoteFor(runDb(null), roles(named), { kind: "group", groupId: "nowhere" }, "S"), null);
  });

  test("the composer says which messages go to phones, before the press, by the same rule", () => {
    const composer = read("src", "features", "messages", "MessageComposer.tsx");
    assert.match(composer, /const pushTarget = count !== null \? pushTargetOf\(choice\.include, count\.mode\) : null;/);
    assert.match(composer, /\{pushTarget\.kind === "group" \? COMPOSER_WORDS\.pushesGroup : COMPOSER_WORDS\.pushesProgramme\}/);
    assert.equal(words.COMPOSER_WORDS.pushesGroup, "A notice to one group also goes as a notification to any device its people have set up.");
    assert.equal(words.COMPOSER_WORDS.pushesProgramme, "A notice to a programme’s people also goes as a notification to any device they have set up.");
  });
});

describe("the old composers hand over to Messages", () => {
  test("a run's links open Messages set to the group or the cohort, where Messages would start with it for the person", async (t) => {
    freshTerm(t);
    const entriesFor = (who) => handover.messagesEntriesFor(w.world.db, sessionFor(who), RUN.agi, new Date());
    const cohort = words.messagesHrefFor(T.agiHolding);
    // The programme's lead, and an admin: the cohort and every group.
    for (const who of ["claudia", "zach"]) {
      const entries = await entriesFor(who);
      assert.equal(entries.cohort, cohort, who);
      assert.deepEqual(Object.keys(entries.groups).sort(), [A, B, C].sort(), who);
    }
    // A facilitator: their own group, and no cohort.
    assert.deepEqual(await entriesFor("tom"), { cohort: null, groups: { [C]: words.messagesHrefFor(T.groupC) } });
    // The run's track lead, who leads no programme, and a member: nothing, so the old pages stay theirs.
    assert.deepEqual(await entriesFor("yusuf"), { cohort: null, groups: {} });
    assert.deepEqual(await entriesFor("amara"), { cohort: null, groups: {} });
    // A run whose allocation has not gone out has no group to start with: its lead gets the cohort alone.
    assert.deepEqual(await handover.messagesEntriesFor(w.world.db, sessionFor("tess"), RUN.tais, new Date()), {
      cohort: words.messagesHrefFor(id({ kind: "programme", roundId: ROUND, programmeId: TAIS, part: "holding" })),
      groups: {},
    });
  });

  test("a facilitator's group card: Messages where it has an entry, the run's own pages where it has none", async () => {
    const Panel = (await w.loadTs(join("features", "courses", "FacilitatorGroupPanel.tsx"))).default;
    const group = {
      id: C,
      name: "Group C",
      calendar: { currentWeek: null, firstSessionDate: "", lastSessionDate: "", nextSession: null, totalWeeks: 0, source: "run" },
    };
    const hrefOf = (html, words) => new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${words}`).exec(html)?.[1]?.replace(/&amp;/g, "&");
    const toGroup = words.messagesHrefFor(T.groupC);
    const toCohort = words.messagesHrefFor(T.agiHolding);
    const handed = renderToStaticMarkup(
      createElement(Panel, { runId: RUN.agi, group, publishedWeekNumbers: [], showCohortLinks: true, emailGroupHref: toGroup, emailCohortHref: toCohort }),
    );
    assert.equal(hrefOf(handed, "Email the group"), toGroup);
    assert.equal(hrefOf(handed, "Email the whole cohort"), toCohort);
    const kept = renderToStaticMarkup(createElement(Panel, { runId: RUN.agi, group, publishedWeekNumbers: [], showCohortLinks: true }));
    assert.equal(hrefOf(kept, "Email the group"), `/learn/${encodeURIComponent(RUN.agi)}/group/${encodeURIComponent(C)}/email`);
    assert.equal(hrefOf(kept, "Email the whole cohort"), `/learn/${encodeURIComponent(RUN.agi)}/email`);
  });

  test("the run's home and its group card say where to write", () => {
    const panel = read("src", "features", "courses", "FacilitatorGroupPanel.tsx");
    assert.match(panel, /href=\{emailGroupHref \?\? `\$\{groupHref\}\/email`\}/);
    assert.match(panel, /href=\{emailCohortHref \?\? `\/learn\/\$\{encodeURIComponent\(runId\)\}\/email`\}/);
    const home = read("src", "features", "courses", "RunHome.tsx");
    assert.match(home, /href=\{messages\.cohort \?\? `\/learn\/\$\{encodeURIComponent\(runId\)\}\/email`\}/);
    assert.equal((home.match(/emailGroupHref=\{messages\.groups\[facilitated\.id\] \?\? null\}/g) ?? []).length, 2);
    const page = read("src", "app", "(app)", "learn", "[runId]", "page.tsx");
    assert.match(page, /db && \(canEmailCohort \|\| access\.isFacilitator\)\s*\? await messagesEntriesFor\(db, access\.user, runId, new Date\(\)\)/);
  });
});
