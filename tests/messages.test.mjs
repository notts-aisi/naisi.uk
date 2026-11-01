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
]);
globalThis.__messagesUi = { h: createElement };

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
        assert.deepEqual(Object.keys(sent.body).sort(), ["failed", "held", "ok", "posted", "sent", "suppressed"]);
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

  test("no push, ever", () => {
    for (const file of [join("src", "app", "api", "messages", "route.ts"), join("src", "lib", "messages", "sending.ts"), join("src", "lib", "messages", "posting.ts")]) {
      assert.doesNotMatch(read(file), /sendNoticePush|sendPushToUid|sendPushToRowAudience|mirror\w*ToPush/, file);
    }
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
      join("docs", "messages.md"),
    ];
    for (const file of files) assert.doesNotMatch(read(file), /[–—]/, file);
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
