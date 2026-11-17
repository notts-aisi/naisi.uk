/**
 * The AI at Nottingham survey, run from "Send my code" to the export against
 * an in-memory datastore.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * `tests/ai-survey.test.mjs` runs the survey's pure parts and
 * `tests/ai-survey-no-trace.test.mjs` reads its source. Neither can see what
 * the shipping functions actually WRITE, and what they write is the promise:
 * "we can't tell which answers are yours". So this suite runs the real email
 * check, the real saving and the real admin actions, and then reads the
 * datastore back:
 *
 *  1. THE EMAIL CHECK: one answer for a used address and a new one; "already
 *     used" only after the right code; one code a minute and five a day; the
 *     hourly ceiling; five wrong tries; fifteen minutes.
 *  2. WHAT IS KEPT: no address anywhere, no time inside an answer document or
 *     the used-email list, an answer set of four fields, and nothing that is
 *     the pass.
 *  3. UPDATE TIMES: the shared documents in use are written together.
 *  4. COMING BACK AND FINISHING: which pages, never an answer; finished is
 *     locked.
 *  5. THE STAGES: clearing pilot data takes its passes with it; closing; the
 *     allowlist; opening needs everything set; the export is recorded.
 *  6. THE ROUTES WHEN THINGS GO WRONG: a datastore that does not answer gets
 *     "try again" from every public route and never a bare error, and a body
 *     is read up to its limit and no further.
 *
 * The datastore is `tests/lib/aiSurveyWorld.mjs`. The mail door is a stub
 * that keeps what it was handed, which is how a test reads its code.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createLoader } from "./lib/tsLoader.mjs";
import { createWorld, holdsATime } from "./lib/aiSurveyWorld.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "@/lib/firebase/admin",
      "export const getAdminDb = () => globalThis.__aiSurveyWorld.db; export const getAdminDbNamed = () => globalThis.__aiSurveyWorld.db;\n" +
        // The accounts on the survey's list, looked up for the ceiling's alert.
        "export const getAdminAuth = () => ({ getUsers: async (ids) => ({ users: ids.map(({ uid }) => ({ uid, email: globalThis.__aiSurveyAccounts?.[uid] })) }) });",
    ],
    [
      "@/lib/email/send",
      'export async function sendUnloggedText(message) { globalThis.__aiSurveyMail.push(message); return globalThis.__aiSurveyMailOutcome ?? "sent"; }\n' +
        // The site's usual door, which the alert to the survey's own accounts leaves by.
        "export async function sendEmail(message) { globalThis.__aiSurveyLogged.push(message); return { delivered: [].concat(message.to), suppressed: [], held: [] }; }",
    ],
    ["@/lib/firebase/session", "export const getCurrentUser = async () => globalThis.__aiSurveyUser ?? null;"],
    // For the public routes themselves, run in section 6: an answer is its status and its body.
    ["next/server", "export const NextResponse = { json: (body, init) => ({ body, status: init?.status ?? 200 }) };"],
    ["@/lib/recaptcha/server", "export const verifyRecaptcha = async () => true;"],
  ]),
});

const { requestCode, checkCode } = await loadTs("lib/aiSurvey/emailCheck.ts");
const { savePage, viewSession } = await loadTs("lib/aiSurvey/saving.ts");
const store = await loadTs("lib/aiSurvey/store.ts");
const admin = await loadTs("lib/aiSurvey/adminStore.ts");
const { AI_SURVEY, closesAtInstant, pageSequence } = await loadTs("lib/aiSurvey/definition.ts");
const { exportHeader } = await loadTs("lib/aiSurvey/exportCsv.ts");
const { answerSetKey, openPass, sealPass } = await loadTs("lib/aiSurvey/pass.ts");

const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);
const MINUTE = 60_000;
const A = "someone@nottingham.ac.uk";
const B = "x@nottingham.ac.uk";

let world;
beforeEach(() => {
  world = createWorld();
  globalThis.__aiSurveyWorld = world;
  globalThis.__aiSurveyMail = [];
  globalThis.__aiSurveyLogged = [];
  globalThis.__aiSurveyAccounts = {};
  globalThis.__aiSurveyMailOutcome = "sent";
  globalThis.__aiSurveyUser = null;
  delete process.env.AI_SURVEY_EMAIL_KEY;
  delete process.env.AI_SURVEY_DATABASE;
});

const lastCode = () => /^(\d{6}) /.exec(globalThis.__aiSurveyMail.at(-1).subject)[1];
const wrongFor = (code) => (code === "000000" ? "111111" : "000000");
/** What a browser makes for itself before it checks its code: 32 random bytes. */
const newClaim = () => randomBytes(32).toString("hex");
/** The key passes are signed with, worked out as the server works it out. */
const signingKey = async () => store.passSigningKey(await store.readState(world.db));

/** Pass the email check, as one person, in one browser. */
async function join(address, at = T0) {
  assert.deepEqual(await requestCode(address, at), { ok: true });
  const result = await checkCode(address, lastCode(), newClaim(), at + 5000);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

const ANSWERS = {
  about1: { A1: "ug", A2: "maths" },
  use: { B1: "weekly", B2: ["explain", "code"] },
  stand: { C1: "a", C2: "dk" },
  d1: { P1: "ss", M1: "P1" },
  last: { G1: "One thing.", G2: true, H1: "friend" },
};

/** Save every page in this person's order, finishing on the last. */
async function answerAll(joined, at = T0 + MINUTE) {
  let pass = joined.pass;
  const sequence = pageSequence(joined.order);
  for (const [index, pageId] of sequence.entries()) {
    const saved = await savePage(pass, pageId, ANSWERS[pageId] ?? {}, index === sequence.length - 1, at + index * 1000);
    assert.equal(saved.ok, true, `${pageId}: ${JSON.stringify(saved)}`);
    pass = saved.pass;
  }
  return pass;
}

const answerDocs = () => world.all(store.ANSWERS_COLLECTION);
const allSets = () => answerDocs().flatMap(([, data]) => Object.entries(data.sets ?? {}));

// ---------------------------------------------------------------------------
// 1. The email check
// ---------------------------------------------------------------------------

describe("the email check", () => {
  test("the code goes as plain text to the address, with no link, and what is kept is a hash", async () => {
    assert.deepEqual(await requestCode(A, T0), { ok: true });
    const [mail] = globalThis.__aiSurveyMail;
    assert.equal(mail.to, A);
    assert.match(mail.subject, /^\d{6} is your code for the AI at Nottingham survey$/);
    assert.ok(mail.text.includes(`Your code is ${lastCode()}.`));
    assert.doesNotMatch(mail.text, /https?:\/\/|www\.|<a |<img/i, "the code email carries a link or an image");
    assert.equal(mail.fromName, "Nottingham AI Safety Initiative");
    assert.equal(mail.replyTo, "ai-safety@uonsu.com");
    const [[id, pending]] = world.all(store.CODES_COLLECTION);
    assert.match(id, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(pending).sort(), ["code", "runsOut", "tries"]);
    assert.ok(!world.everything().includes(lastCode()), "the code is stored in the clear");
    assert.ok(!world.everything().includes("someone@"), "the address is stored in the clear");
  });

  test("asking for a code answers the same for an address that has answered and one that has not", async () => {
    await answerAll(await join(A));
    const used = await requestCode(A, T0 + 2 * MINUTE);
    const fresh = await requestCode(B, T0 + 2 * MINUTE);
    assert.deepEqual(used, fresh);
    assert.deepEqual(used, { ok: true });
    // "Already used" is said only after the right code.
    assert.equal(globalThis.__aiSurveyMail.at(-2).to, A);
    const code = /^(\d{6}) /.exec(globalThis.__aiSurveyMail.at(-2).subject)[1];
    assert.deepEqual(await checkCode(A, wrongFor(code), newClaim(), T0 + 3 * MINUTE), { ok: false, error: "wrongCode" });
    assert.deepEqual(await checkCode(A, code, newClaim(), T0 + 3 * MINUTE), { ok: false, error: "alreadyAnswered" });
    // And that code is spent.
    assert.deepEqual(await checkCode(A, code, newClaim(), T0 + 3 * MINUTE), { ok: false, error: "wrongCode" });
  });

  test("a wrong code is answered the same whether a code is waiting, was just used or was never asked for", async () => {
    // Somebody typing a classmate's address with any six digits must learn
    // nothing from the answer, before the classmate gets in or after.
    const probe = (at) => checkCode(A, "000000", newClaim(), at);
    const never = await probe(T0);
    await requestCode(A, T0);
    const code = lastCode();
    const waiting = code === "000000" ? never : await probe(T0 + 1000);
    assert.equal((await checkCode(A, code, newClaim(), T0 + 2000)).ok, true);
    const justUsed = code === "000000" ? never : await probe(T0 + 3000);
    const later = await probe(T0 + 30 * MINUTE);
    for (const answer of [never, waiting, justUsed]) assert.deepEqual(answer, { ok: false, error: "wrongCode" });
    // Once the code has run out, a record of it that is still there says so,
    // which says nothing about whether it was used.
    assert.deepEqual(later, { ok: false, error: "codeRunOut" });
    assert.deepEqual(await probe(T0 + 31 * MINUTE), { ok: false, error: "wrongCode" });
  });

  test("one address answers once: a second code for it gets no second pass", async () => {
    await join(A);
    await requestCode(A, T0 + 2 * MINUTE);
    assert.deepEqual(await checkCode(A, lastCode(), newClaim(), T0 + 2 * MINUTE + 1), { ok: false, error: "alreadyAnswered" });
    assert.equal(world.all(store.USED_COLLECTION).reduce((n, [, data]) => n + Object.keys(data.h).length, 0), 1);
  });

  test("a code works once, so two browsers with it cannot both get in", async () => {
    await requestCode(A, T0);
    const code = lastCode();
    const first = await checkCode(A, code, newClaim(), T0 + 1000);
    const second = await checkCode(A, code, newClaim(), T0 + 1001);
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: false, error: "wrongCode" });
    assert.equal((await store.readState(world.db)).accepted, 1);
  });

  test("a lost reply does not shut anybody out: the same browser asks again and is the same person", async () => {
    // The request arrived, the address was used up, and the answer never
    // reached the phone. It asks again with the same code and its own value.
    await requestCode(A, T0);
    const code = lastCode();
    const claim = newClaim();
    const first = await checkCode(A, code, claim, T0 + 1000);
    const again = await checkCode(A, code, claim, T0 + 4000);
    assert.equal(first.ok && again.ok, true, JSON.stringify(again));
    const key = await signingKey();
    const [one, two] = [openPass(first.pass, key, T0 + 5000), openPass(again.pass, key, T0 + 5000)];
    assert.deepEqual([two.id, two.shard, two.order], [one.id, one.shard, one.order], "asking again made a different pass");
    assert.deepEqual(again.order, first.order);
    // Counted once, used once, and there is still only one answer set to be had.
    assert.equal((await store.readState(world.db)).accepted, 1);
    assert.equal(world.all(store.USED_COLLECTION).reduce((n, [, data]) => n + Object.keys(data.h).length, 0), 1);
    await savePage(first.pass, "about1", { A1: "ug" }, false, T0 + MINUTE);
    await savePage(again.pass, "use", {}, false, T0 + MINUTE + 1000);
    assert.equal(allSets().length, 1);
    // It works only until the code runs out, and never for another browser.
    assert.deepEqual(await checkCode(A, code, newClaim(), T0 + 5000), { ok: false, error: "wrongCode" });
    assert.deepEqual(await checkCode(A, code, claim, T0 + store.CODE_LIFETIME_MS), { ok: false, error: "codeRunOut" });
  });

  test("what links a used code to its browser cannot be matched to an answer set", async () => {
    const joined = await join(A);
    await savePage(joined.pass, "about1", { A1: "ug" }, false, T0 + MINUTE);
    const [[, pending]] = world.all(store.CODES_COLLECTION);
    assert.deepEqual(Object.keys(pending).sort(), ["claim", "code", "done", "runsOut", "tries"]);
    assert.match(pending.claim, /^[0-9a-f]{64}$/);
    const [[setKey]] = allSets();
    const opened = openPass(joined.pass, await signingKey(), T0);
    assert.ok(!world.everything().includes(opened.id), "the pass's own bytes are stored");
    assert.notEqual(pending.claim, setKey);
    assert.ok(!setKey.includes(pending.claim.slice(0, 12)) && !pending.claim.includes(setKey.slice(0, 12)));
  });

  test("a new code replaces the old one", async () => {
    await requestCode(A, T0);
    const old = lastCode();
    await requestCode(A, T0 + 61_000);
    const next = lastCode();
    if (old !== next) assert.deepEqual(await checkCode(A, old, newClaim(), T0 + 62_000), { ok: false, error: "wrongCode" });
    assert.equal((await checkCode(A, next, newClaim(), T0 + 63_000)).ok, true);
  });

  test("one code a minute and five a day for an address, by London's day", async () => {
    assert.deepEqual(await requestCode(A, T0), { ok: true });
    assert.deepEqual(await requestCode(A, T0 + 59_000), { ok: false, error: "askedAgainTooSoon" });
    for (let n = 1; n <= 4; n++) assert.deepEqual(await requestCode(A, T0 + n * 61_000), { ok: true }, `code ${n + 1}`);
    assert.deepEqual(await requestCode(A, T0 + 5 * 61_000), { ok: false, error: "tooManyCodesToday" });
    assert.equal(globalThis.__aiSurveyMail.length, 5);
    // Another address is not held up by this one's limit.
    assert.deepEqual(await requestCode(B, T0 + 5 * 61_000), { ok: true });
    // Tomorrow it may ask again.
    assert.deepEqual(await requestCode(A, T0 + 24 * 60 * MINUTE), { ok: true });
  });

  test("ten people in one room all get codes: nothing is limited by where a request came from", async () => {
    for (let n = 0; n < 10; n++) assert.deepEqual(await requestCode(`student${n}@nottingham.ac.uk`, T0 + n), { ok: true });
    assert.equal(globalThis.__aiSurveyMail.length, 10);
  });

  test("the ceiling can be changed on the survey's record, with no deploy", async () => {
    await store.readState(world.db);
    await world.db.collection(store.STATE_COLLECTION).doc("main").update({ codeCeiling: 2 });
    assert.deepEqual(await requestCode(A, T0), { ok: true });
    assert.deepEqual(await requestCode(B, T0 + 1000), { ok: true });
    assert.deepEqual(await requestCode("b@nottingham.ac.uk", T0 + 2000), { ok: false, error: "busy" });
    // A value that is not a whole number above nought is ignored.
    await world.db.collection(store.STATE_COLLECTION).doc("main").update({ codeCeiling: -5 });
    assert.equal(store.ceilingOf(await store.readState(world.db)), store.CODE_CEILING_PER_HOUR);
  });

  test("the ceiling across the whole survey says busy and sends nothing", async () => {
    for (let n = 0; n < store.CODE_CEILING_PER_HOUR; n++) await store.countCodeSent(world.db, T0 - (n % 50) * MINUTE);
    assert.deepEqual(await requestCode(A, T0), { ok: false, error: "busy" });
    assert.equal(globalThis.__aiSurveyMail.length, 0);
    assert.equal(world.all(store.CODES_COLLECTION).length, 0);
    // An hour on, those codes no longer count.
    assert.deepEqual(await requestCode(A, T0 + 61 * MINUTE), { ok: true });
  });

  test("reaching the ceiling tells the accounts that run the survey, once an hour, and says nothing about anybody", async () => {
    await store.readState(world.db);
    await world.db.collection(store.STATE_COLLECTION).doc("main").update({ adminUids: ["owner1"] });
    globalThis.__aiSurveyAccounts = { owner1: "owner@example.org" };
    for (let n = 0; n < store.CODE_CEILING_PER_HOUR; n++) await store.countCodeSent(world.db, T0 - (n % 50) * MINUTE);
    for (let n = 0; n < 5; n++) assert.deepEqual(await requestCode(`s${n}@nottingham.ac.uk`, T0 + n * 1000), { ok: false, error: "busy" });
    assert.equal(globalThis.__aiSurveyLogged.length, 1, "a hundred refusals in a minute must be one email");
    const [alert] = globalThis.__aiSurveyLogged;
    assert.deepEqual(alert.to, ["owner@example.org"]);
    assert.equal(alert.kind, "admin-alert");
    assert.doesNotMatch(JSON.stringify(alert.subject), /nottingham\.ac\.uk|@/, "the alert names an address");
    // Nothing was sent to the people who asked.
    assert.equal(globalThis.__aiSurveyMail.length, 0);
    // The next hour, still at the ceiling: one more.
    for (let n = 0; n < store.CODE_CEILING_PER_HOUR; n++) await store.countCodeSent(world.db, T0 + 60 * MINUTE);
    await requestCode(A, T0 + 61 * MINUTE);
    await requestCode(B, T0 + 62 * MINUTE);
    assert.equal(globalThis.__aiSurveyLogged.length, 2);
  });

  test("with nobody on the survey's list, the ceiling still says busy and nothing breaks", async () => {
    for (let n = 0; n < store.CODE_CEILING_PER_HOUR; n++) await store.countCodeSent(world.db, T0);
    assert.deepEqual(await requestCode(A, T0), { ok: false, error: "busy" });
    assert.equal(globalThis.__aiSurveyLogged.length, 0);
  });

  test("five wrong tries kill a code, and the right code is then too late", async () => {
    await requestCode(A, T0);
    const code = lastCode();
    const tries = [];
    for (let n = 0; n < 5; n++) tries.push((await checkCode(A, wrongFor(code), newClaim(), T0 + 1000 + n)).error);
    assert.deepEqual(tries, ["wrongCode", "wrongCode", "wrongCode", "wrongCode", "tooManyWrongTries"]);
    assert.deepEqual(await checkCode(A, code, newClaim(), T0 + 2000), { ok: false, error: "wrongCode" });
    assert.equal(world.all(store.CODES_COLLECTION).length, 0);
  });

  test("a code works for fifteen minutes and not a moment longer", async () => {
    await requestCode(A, T0);
    const code = lastCode();
    assert.deepEqual(await checkCode(A, code, newClaim(), T0 + store.CODE_LIFETIME_MS), { ok: false, error: "codeRunOut" });
    assert.equal(world.all(store.CODES_COLLECTION).length, 0, "a run-out code was left behind");
    await requestCode(B, T0);
    assert.equal((await checkCode(B, lastCode(), newClaim(), T0 + store.CODE_LIFETIME_MS - 1)).ok, true);
  });

  test("a code that could not be sent says so, is taken back, and can be asked for again at once", async () => {
    for (const outcome of ["held", "suppressed"]) {
      globalThis.__aiSurveyMailOutcome = outcome;
      assert.deepEqual(await requestCode(A, T0), { ok: false, error: "couldNotSend" });
      assert.equal(world.all(store.CODES_COLLECTION).length, 0);
    }
    globalThis.__aiSurveyMailOutcome = "sent";
    assert.deepEqual(await requestCode(A, T0 + 1000), { ok: true });
  });

  test("the sweep does not take a new code that replaced a run-out one while it was looking", async () => {
    await requestCode(A, T0);
    // Between the sweep's read and its delete, the same address asks again.
    world.hooks.afterQuery = async (collection) => {
      if (collection !== store.CODES_COLLECTION) return;
      world.hooks.afterQuery = null;
      assert.deepEqual(await requestCode(A, T0 + 20 * MINUTE), { ok: true });
    };
    assert.equal(await store.sweepCodeRecords(world.db, T0 + 20 * MINUTE, "2026-11-17", 100), 0);
    assert.equal(world.all(store.CODES_COLLECTION).length, 1, "the new code was deleted with the old one");
    assert.equal((await checkCode(A, lastCode(), newClaim(), T0 + 21 * MINUTE)).ok, true);
  });

  test("the sweep deletes run-out codes and yesterday's counts, and leaves today's", async () => {
    await requestCode(A, T0);
    await requestCode(B, T0 + 10 * MINUTE);
    const swept = await store.sweepCodeRecords(world.db, T0 + 16 * MINUTE, "2026-11-17", 100);
    assert.equal(swept, 1);
    assert.equal(world.all(store.CODES_COLLECTION).length, 1);
    assert.equal(world.all(store.LIMITS_COLLECTION).length, 2);
    await store.sweepCodeRecords(world.db, T0 + 26 * 60 * MINUTE, "2026-11-18", 100);
    assert.equal(world.all(store.CODES_COLLECTION).length, 0);
    assert.equal(world.all(store.LIMITS_COLLECTION).length, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. What is kept
// ---------------------------------------------------------------------------

describe("what is kept", () => {
  test("passing the email check writes nothing to the answers", async () => {
    await store.readState(world.db); // the survey's first visitor makes its empty documents
    const before = JSON.stringify(answerDocs().map(([id, data]) => [id, data.sets]));
    assert.equal(answerDocs().length, 16);
    await join(A);
    assert.equal(JSON.stringify(answerDocs().map(([id, data]) => [id, data.sets])), before);
    assert.equal(allSets().length, 0);
  });

  test("an answer set holds its version, its page order, its pages and that it is finished, and nothing else", async () => {
    const joined = await join(A);
    await answerAll(joined);
    const sets = allSets();
    assert.equal(sets.length, 1);
    const [key, set] = sets[0];
    assert.deepEqual(Object.keys(set).sort(), ["f", "o", "p", "v"]);
    assert.equal(set.v, AI_SURVEY.version);
    assert.deepEqual(set.o, joined.order);
    assert.equal(set.f, true);
    assert.deepEqual(Object.keys(set.p).sort(), AI_SURVEY.pages.map((p) => p.id).sort());
    assert.deepEqual(set.p.about1, ANSWERS.about1);
    assert.deepEqual(set.p.d3, {}, "a page with every question skipped is saved as an empty page");
    // Kept under a hash of the pass, never the pass.
    const opened = openPass(joined.pass, await signingKey(), T0);
    assert.equal(key, answerSetKey(opened));
    assert.ok(!world.everything().includes(opened.id), "the pass itself is in the datastore");
  });

  test("no address, and no time inside an answer document or the used-email list", async () => {
    await answerAll(await join(A));
    await join(B, T0 + 5 * MINUTE);
    const everything = world.everything();
    for (const needle of ["someone@", "x@", "nottingham.ac.uk"]) assert.ok(!everything.includes(needle), `"${needle}" is stored`);
    for (const [id, data] of answerDocs()) assert.equal(holdsATime(data), false, `answer document ${id} holds a time`);
    const used = world.all(store.USED_COLLECTION);
    assert.equal(used.length, 16);
    for (const [id, data] of used) {
      assert.equal(holdsATime(data), false, `used-email document ${id} holds a time`);
      assert.deepEqual(Object.keys(data).sort(), ["beat", "h"]);
      for (const [hash, value] of Object.entries(data.h)) {
        assert.match(hash, /^[0-9a-f]{64}$/);
        assert.equal(value, true);
        assert.equal(id.at(-1), hash[0], "a hash is in the document its first character names");
      }
    }
  });

  test("the three hashes of an address cannot be matched to each other in the datastore", async () => {
    await join(A);
    await requestCode(B, T0 + MINUTE);
    const used = world.all(store.USED_COLLECTION).flatMap(([, data]) => Object.keys(data.h));
    const pending = world.all(store.CODES_COLLECTION).map(([id]) => id);
    const limits = world.all(store.LIMITS_COLLECTION).map(([id]) => id);
    assert.equal(new Set([...used, ...pending, ...limits]).size, used.length + pending.length + limits.length);
  });

  test("a page that is not the survey's is refused and nothing is stored", async () => {
    const joined = await join(A);
    for (const [pageId, answers] of [["about1", { A1: "phd" }], ["about1", { ZZ: "x" }], ["nowhere", {}], ["last", { G1: "x".repeat(501) }]]) {
      assert.deepEqual(await savePage(joined.pass, pageId, answers, false, T0 + MINUTE), { ok: false, error: "refused" });
    }
    assert.deepEqual(await savePage(joined.pass, "about1", {}, true, T0 + MINUTE), { ok: false, error: "refused" }, "finish on a page that is not the last");
    assert.equal(allSets().length, 0);
  });

  test("a pass a browser made for itself saves nothing", async () => {
    const joined = await join(A);
    const forged = `${joined.pass.slice(0, -4)}AAAA`;
    assert.deepEqual(await savePage(forged, "about1", { A1: "ug" }, false, T0 + MINUTE), { ok: false, error: "gone" });
    assert.deepEqual(await savePage("not-a-pass", "about1", { A1: "ug" }, false, T0 + MINUTE), { ok: false, error: "gone" });
    assert.equal(allSets().length, 0);
  });

  test("reading the datastore is not enough to write a pass", async () => {
    // Everything the survey's record holds, used the way the pass is really
    // made, by somebody who can read the datastore and does not hold the
    // secret. In Pilot the stand-in for the secret is in the record too, so
    // this is the survey OPEN, where it is not.
    process.env.AI_SURVEY_EMAIL_KEY = "k".repeat(48);
    process.env.AI_SURVEY_DATABASE = "ai-survey";
    await admin.openSurvey(world.db, await store.readState(world.db), T0);
    const record = world.all(store.STATE_COLLECTION).find(([id]) => id === "main")[1];
    const pass = { epoch: record.epoch, id: randomBytes(32).toString("base64url"), shard: 0, order: pageSequence(["d1", "d2", "d3", "d4", "d5"]).slice(5, 10), expiresAt: T0 + 60 * MINUTE };
    const guesses = [
      Buffer.from(record.passKey, "base64"),
      Buffer.from(record.passKey, "utf8"),
      createHmac("sha256", Buffer.from(`pilot:${record.pilotKey}`, "utf8")).update("ai-survey.pass-key.v1:").update(record.passKey).digest(),
      createHmac("sha256", Buffer.from(record.pilotKey, "base64")).update("ai-survey.pass-key.v1:").update(record.passKey).digest(),
    ];
    for (const key of guesses) {
      assert.deepEqual(await savePage(sealPass(pass, key), "about1", { A1: "ug" }, false, T0 + MINUTE), { ok: false, error: "gone" });
    }
    assert.equal(allSets().length, 0);
    // The real key, which is not in the datastore, is what works.
    const real = await signingKey();
    assert.equal((await savePage(sealPass(pass, real), "about1", { A1: "ug" }, false, T0 + MINUTE)).ok, true);
    assert.ok(!world.everything().includes("k".repeat(48)), "the secret is in the datastore");
  });

  test("a record of the survey made by hand, with no key in it, signs nothing", async () => {
    await world.db.collection(store.STATE_COLLECTION).doc("main").set({ stage: "pilot", adminUids: [] });
    const state = await store.readState(world.db);
    assert.equal(store.passSigningKey(state), null);
    assert.deepEqual(await requestCode(A, T0), { ok: false, error: "couldNotSend" });
  });

  test("a save replaces an earlier save of the same page whole", async () => {
    const joined = await join(A);
    const first = await savePage(joined.pass, "about1", { A1: "ug", A2: "maths" }, false, T0 + MINUTE);
    await savePage(first.pass, "about1", { A1: "pgt" }, false, T0 + 2 * MINUTE);
    assert.deepEqual(allSets()[0][1].p.about1, { A1: "pgt" });
  });
});

// ---------------------------------------------------------------------------
// 3. Update times
// ---------------------------------------------------------------------------

describe("a shared document's update time", () => {
  const times = (docs) => new Set(docs.map(([, , updated]) => updated));
  const shared = () => [...answerDocs(), ...world.all(store.USED_COLLECTION)];

  test("with few people saving, every save rewrites every shared document with it", async () => {
    const one = await join(A);
    const two = await join(B, T0 + 1000);
    // Two people, six saves, seconds apart: after each, no document stands out.
    const saves = [
      [one, "about1", 0],
      [one, "use", 3000],
      [two, "about1", 4000],
      [one, "stand", 9000],
      [two, "use", 15_000],
      [two, "stand", 18_000],
    ];
    for (const [person, pageId, after] of saves) {
      world.setNow(T0 + MINUTE + after);
      const saved = await savePage(person.pass, pageId, ANSWERS[pageId] ?? {}, false, T0 + MINUTE + after);
      assert.equal(saved.ok, true, JSON.stringify(saved));
      person.pass = saved.pass;
      assert.equal(shared().length, 32);
      assert.equal(times(shared()).size, 1, `after the save ${after / 1000}s in, a shared document's update time stands apart`);
    }
  });

  test("in a room a save writes one document, one save in twenty seconds levels them, and a room gone quiet levels on every save again", async () => {
    const people = [];
    for (let n = 0; n < 14; n++) people.push(await join(`student${n}@nottingham.ac.uk`, T0 + n * 1000));
    // Fourteen saves in seven seconds on one server. The first few each
    // level, as they would for a few people; past `BUSY_SAVES` it is a room.
    let alone = 0;
    for (const [n, person] of people.entries()) {
      const before = new Map(answerDocs().map(([id, , updated]) => [id, updated]));
      world.setNow(T0 + MINUTE + n * 500);
      await savePage(person.pass, "about1", { A1: "ug" }, false, T0 + MINUTE + n * 500);
      const changed = answerDocs().filter(([id, , updated]) => before.get(id) !== updated).length;
      assert.ok(changed === 1 || changed === 16, `save ${n + 1} wrote ${changed} answer documents`);
      if (n < store.BUSY_SAVES) assert.equal(changed, 16, `save ${n + 1} of a few did not level`);
      else assert.equal(changed, 1, `save ${n + 1}, in a room, rewrote every document`);
      if (changed === 1) alone += 1;
    }
    assert.equal(alone, 14 - store.BUSY_SAVES);
    assert.ok(times(shared()).size > 1);
    // Still a room, and twenty seconds since the last levelling: this save levels.
    for (const [n, person] of people.entries()) {
      world.setNow(T0 + MINUTE + 12_000 + n * 500);
      await savePage(person.pass, "use", {}, false, T0 + MINUTE + 12_000 + n * 500);
    }
    world.setNow(T0 + MINUTE + 25_000);
    await savePage(people[0].pass, "stand", {}, false, T0 + MINUTE + 25_000);
    assert.equal(times(shared()).size, 1, "a room's save, twenty seconds after the last levelling, did not level");
    // The room empties. A minute on, one person saves twice: both level.
    for (const after of [90_000, 93_000]) {
      world.setNow(T0 + MINUTE + after);
      await savePage(people[3].pass, after === 90_000 ? "use" : "stand", {}, false, T0 + MINUTE + after);
      assert.equal(times(shared()).size, 1, "a save after the room went quiet left a document standing apart");
    }
    assert.equal(allSets().length, 14);
  });

  test("the job's rewrite gives every shared document one update time", async () => {
    const people = [];
    for (let n = 0; n < 12; n++) people.push(await join(`student${n}@nottingham.ac.uk`, T0 + n * 1000));
    for (const [n, person] of people.entries()) {
      world.setNow(T0 + MINUTE + n * 500);
      await savePage(person.pass, "about1", {}, false, T0 + MINUTE + n * 500);
    }
    // A room that stops all at once leaves its last few saves unlevelled.
    assert.ok(times(shared()).size > 1, "this test needs a document that stands out before the job runs");
    await store.levelAll(world.db, await store.readState(world.db));
    assert.equal(times(shared()).size, 1);
  });

  test("which document an answer set is in says nothing about when: all sixteen from the first person on", async () => {
    assert.deepEqual(store.shardsInUse(0), { from: 0, count: 16 });
    assert.deepEqual(store.shardsInUse(47), store.shardsInUse(0));
    assert.deepEqual(store.shardsInUse(5000), store.shardsInUse(0));
    const firstTen = new Set();
    const lastTen = new Set();
    for (let n = 0; n < 60; n++) {
      const joined = await join(`s${n}@nottingham.ac.uk`, T0 + n * 1000);
      const shard = openPass(joined.pass, await signingKey(), T0 + n * 1000 + 6000).shard;
      assert.ok(shard >= 0 && shard < 16);
      if (n < 10) firstTen.add(shard);
      if (n >= 50) lastTen.add(shard);
    }
    // Ten people over sixteen documents land in several. With a spread that
    // grew with the count, the first ten could only ever be in two.
    assert.ok(firstTen.size > 2, `the first ten people were put in ${firstTen.size} documents`);
    assert.ok(lastTen.size > 2);
    assert.equal((await store.readState(world.db)).accepted, 60);
  });
});

// ---------------------------------------------------------------------------
// 4. Coming back and finishing
// ---------------------------------------------------------------------------

describe("coming back and finishing", () => {
  test("coming back says which pages are saved, and never an answer", async () => {
    const joined = await join(A);
    let pass = joined.pass;
    for (const pageId of pageSequence(joined.order).slice(0, 5)) pass = (await savePage(pass, pageId, ANSWERS[pageId] ?? {}, false, T0 + MINUTE)).pass;
    const view = await viewSession(pass, T0 + 2 * MINUTE);
    assert.equal(view.ok, true);
    assert.deepEqual([...view.savedPages].sort(), ["about1", "choices", "seen", "stand", "use"]);
    assert.deepEqual(view.order, joined.order);
    const told = JSON.stringify({ ...view, pass: null });
    for (const answer of ["maths", "weekly", '"ug"']) assert.ok(!told.includes(answer), `coming back returned an answer: ${answer}`);
  });

  test("a pass stops working 24 hours after its last save", async () => {
    const joined = await join(A);
    const saved = await savePage(joined.pass, "about1", {}, false, T0 + 20 * 60 * MINUTE);
    assert.equal((await savePage(joined.pass, "use", {}, false, T0 + 24 * 60 * MINUTE + 6000)).error, "gone", "the first pass outlived its 24 hours");
    assert.equal((await savePage(saved.pass, "use", {}, false, T0 + 43 * 60 * MINUTE)).ok, true, "a save did not give the pass another 24 hours");
  });

  test("a Finish whose answer was lost can be pressed again, and nothing is written twice", async () => {
    const joined = await join(A);
    const sequence = pageSequence(joined.order);
    let pass = joined.pass;
    for (const pageId of sequence.slice(0, -1)) pass = (await savePage(pass, pageId, {}, false, T0 + MINUTE)).pass;
    const first = await savePage(pass, "last", { H1: "friend" }, true, T0 + 2 * MINUTE);
    assert.equal(first.ok && first.finished, true);
    const before = JSON.stringify(allSets());
    // The phone never heard back, still holds the pass it sent, and presses again.
    const again = await savePage(pass, "last", { H1: "poster" }, true, T0 + 3 * MINUTE);
    assert.equal(again.ok && again.finished, true, JSON.stringify(again));
    assert.equal(JSON.stringify(allSets()), before, "a second Finish changed a finished answer set");
  });

  test("finished is locked: no save, and nothing to come back to", async () => {
    const joined = await join(A);
    const last = await answerAll(joined);
    const before = JSON.stringify(allSets());
    assert.deepEqual(await savePage(last, "about1", { A1: "pgr" }, false, T0 + 30 * MINUTE), { ok: false, error: "gone" });
    assert.deepEqual(await savePage(joined.pass, "about1", { A1: "pgr" }, false, T0 + 30 * MINUTE), { ok: false, error: "gone" });
    assert.deepEqual(await viewSession(last, T0 + 30 * MINUTE), { ok: false, error: "gone" });
    assert.equal(JSON.stringify(allSets()), before);
  });
});

// ---------------------------------------------------------------------------
// 5. The stages and the admin side
// ---------------------------------------------------------------------------

describe("the stages", () => {
  const signIn = (uid, role = "admin") => (globalThis.__aiSurveyUser = { uid, role, email: `${uid}@example.org`, permissions: {} });

  test("the allowlist, not the admin role, opens the admin side, and nothing on the site adds to it", async () => {
    assert.deepEqual(await admin.surveyAdmin(), { signedIn: false, admin: null });
    for (const [uid, role] of [["member1", "member"], ["committee1", "committee"], ["admin1", "admin"]]) {
      signIn(uid, role);
      assert.deepEqual(await admin.surveyAdmin(), { signedIn: true, admin: null }, `${role} is not on the list`);
    }
    // The list is changed by hand in the datastore, and by nothing else. A
    // survey nobody has visited has no record yet, so no list to be on.
    await store.readState(world.db);
    signIn("admin1");
    assert.deepEqual(await admin.surveyAdmin(), { signedIn: true, admin: null });
    await world.db.collection(store.STATE_COLLECTION).doc("main").update({ adminUids: ["owner1"] });
    signIn("owner1", "admin");
    const found = await admin.surveyAdmin();
    assert.equal(found.admin?.user.uid, "owner1");
    signIn("admin1");
    assert.deepEqual(await admin.surveyAdmin(), { signedIn: true, admin: null }, "another admin is refused");
    assert.deepEqual(Object.keys(admin).filter((name) => /claim|addAdmin|allow/i.test(name)), [], "something exported can add to the list");
  });

  test("clearing pilot data empties the answers and the used-email list, and takes every pilot pass with it", async () => {
    const joined = await join(A);
    const saved = await savePage(joined.pass, "about1", { A1: "ug" }, false, T0 + MINUTE);
    const state = await store.readState(world.db);
    assert.deepEqual(await admin.clearPilot(world.db, state, "clear", T0 + 2 * MINUTE), { ok: false, error: "notConfirmed" });
    assert.equal(allSets().length, 1);
    assert.deepEqual(await admin.clearPilot(world.db, state, " Clear pilot data ", T0 + 2 * MINUTE), { ok: true });
    assert.equal(allSets().length, 0);
    assert.equal(world.all(store.USED_COLLECTION).every(([, data]) => Object.keys(data.h).length === 0), true);
    assert.equal(answerDocs().length, 16, "the old storage was left beside the new");
    // A pilot pass can never write into the new storage.
    assert.deepEqual(await savePage(saved.pass, "use", {}, false, T0 + 3 * MINUTE), { ok: false, error: "gone" });
    // And the address may answer again.
    assert.equal((await join(A, T0 + 4 * MINUTE)).ok, true);
  });

  test("two presses at once: one clears, the other is told the stage has moved, and no storage is left over", async () => {
    await answerAll(await join(A));
    const state = await store.readState(world.db);
    const [first, second] = [await admin.clearPilot(world.db, state, "clear pilot data", T0 + MINUTE), await admin.clearPilot(world.db, state, "clear pilot data", T0 + MINUTE)];
    assert.deepEqual(first, { ok: true });
    assert.deepEqual(second, { ok: false, error: "wrongStage" });
    assert.equal(answerDocs().length, 16, "the press that lost left its documents behind");
    assert.equal(world.all(store.USED_COLLECTION).length, 16);
  });

  test("it cannot open while anything it needs is missing, and opening clears the pilot", async () => {
    await answerAll(await join(A));
    let state = await store.readState(world.db);
    assert.deepEqual(admin.openingChecks().filter((c) => !c.set).map((c) => c.name), ["AI_SURVEY_EMAIL_KEY", "AI_SURVEY_DATABASE"]);
    assert.deepEqual(await admin.openSurvey(world.db, state, T0 + 10 * MINUTE), { ok: false, error: "notReady" });
    process.env.AI_SURVEY_EMAIL_KEY = "k".repeat(48);
    assert.deepEqual(await admin.openSurvey(world.db, state, T0 + 10 * MINUTE), { ok: false, error: "notReady" });
    process.env.AI_SURVEY_DATABASE = "ai-survey";
    assert.deepEqual(await admin.openSurvey(world.db, state, T0 + 10 * MINUTE), { ok: true });
    state = await store.readState(world.db);
    assert.equal(state.stage, "open");
    assert.equal(allSets().length, 0, "pilot answers survived opening");
    // Clear pilot data works only in Pilot.
    assert.deepEqual(await admin.clearPilot(world.db, state, "clear pilot data", T0 + 11 * MINUTE), { ok: false, error: "wrongStage" });
    assert.deepEqual(await admin.openSurvey(world.db, state, T0 + 11 * MINUTE), { ok: false, error: "wrongStage" });
  });

  test("an open survey with no real key sends no codes: the stand-in is for the pilot alone", async () => {
    process.env.AI_SURVEY_EMAIL_KEY = "k".repeat(48);
    process.env.AI_SURVEY_DATABASE = "ai-survey";
    await admin.openSurvey(world.db, await store.readState(world.db), T0);
    delete process.env.AI_SURVEY_EMAIL_KEY;
    assert.deepEqual(await requestCode(A, T0 + MINUTE), { ok: false, error: "couldNotSend" });
    assert.equal(globalThis.__aiSurveyMail.length, 0);
  });

  test("closed by hand: nobody new at once, and thirty minutes for somebody under way", async () => {
    process.env.AI_SURVEY_EMAIL_KEY = "k".repeat(48);
    process.env.AI_SURVEY_DATABASE = "ai-survey";
    await admin.openSurvey(world.db, await store.readState(world.db), T0);
    const joined = await join(A, T0 + MINUTE);
    world.setNow(T0 + 10 * MINUTE);
    assert.deepEqual(await admin.closeSurvey(world.db, await store.readState(world.db), T0 + 10 * MINUTE), { ok: true });
    assert.deepEqual(await requestCode(B, T0 + 11 * MINUTE), { ok: false, error: "closed" });
    assert.equal((await savePage(joined.pass, "about1", {}, false, T0 + 39 * MINUTE)).ok, true);
    assert.deepEqual(await savePage(joined.pass, "use", {}, false, T0 + 41 * MINUTE), { ok: false, error: "closed" });
    assert.deepEqual(await admin.closeSurvey(world.db, await store.readState(world.db), T0 + 42 * MINUTE), { ok: false, error: "wrongStage" });
  });

  test("an open survey closes itself at its closing time", async () => {
    process.env.AI_SURVEY_EMAIL_KEY = "k".repeat(48);
    process.env.AI_SURVEY_DATABASE = "ai-survey";
    await admin.openSurvey(world.db, await store.readState(world.db), T0);
    const closes = closesAtInstant().getTime();
    assert.deepEqual(await requestCode(A, closes - MINUTE), { ok: true });
    assert.deepEqual(await requestCode(B, closes), { ok: false, error: "closed" });
  });

  test("the export is one row a set with no ids and no times, and each download is recorded first", async () => {
    await answerAll(await join(A));
    const second = await join(B, T0 + 5 * MINUTE);
    await savePage(second.pass, "about1", { A1: "pgt" }, false, T0 + 6 * MINUTE);
    const state = await store.readState(world.db);
    const file = await admin.exportAnswers(world.db, state, "admin1");
    const lines = file.csv.trimEnd().split("\n");
    assert.equal(file.rows, 2);
    assert.equal(lines[0], exportHeader().join(","));
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.slice(1).map((line) => line.split(",")[0]).sort(), ["0", "1"]);
    assert.ok(lines.slice(1).some((line) => line.includes("not_seen")));
    for (const [key] of allSets()) assert.ok(!file.csv.includes(key), "an answer set's key is in the export");
    assert.doesNotMatch(file.csv, /2026|\d\d:\d\d/, "a date or a time is in the export");
    const log = world.all(store.STATE_COLLECTION).find(([id]) => id === "downloads")[1].log;
    assert.equal(log.length, 1);
    assert.deepEqual(Object.keys(log[0]).sort(), ["at", "by", "rows"]);
    assert.deepEqual([log[0].by, log[0].rows], ["admin1", 2]);
  });

  test("the admin page's numbers are totals", async () => {
    await answerAll(await join(A));
    const second = await join(B, T0 + 5 * MINUTE);
    await savePage(second.pass, "about1", {}, false, T0 + 6 * MINUTE);
    const view = await admin.adminView(world.db, await store.readState(world.db), T0 + 7 * MINUTE);
    assert.deepEqual([view.stage, view.started, view.finished, view.codesLastHour, view.ceiling], ["pilot", 2, 1, 2, 600]);
    assert.equal(view.canOpen, false);
    assert.deepEqual(view.shortLinks.map((link) => link.slug), AI_SURVEY.shortLinks.map((link) => link.slug));
    assert.deepEqual(Object.keys(view).sort(), ["canOpen", "ceiling", "checks", "codesLastHour", "downloads", "finished", "shortLinks", "stage", "started"]);
  });

  test("after closing, the used-email list and every code record are deleted, and the answers are not", async () => {
    await answerAll(await join(A));
    await requestCode(B, T0 + 5 * MINUTE);
    const state = await store.readState(world.db);
    await store.deleteUsedList(world.db, state);
    assert.equal(world.all(store.USED_COLLECTION).length, 0);
    assert.equal(world.all(store.CODES_COLLECTION).length, 0);
    assert.equal(world.all(store.LIMITS_COLLECTION).length, 0);
    assert.equal(allSets().length, 1);
    assert.ok((await store.readState(world.db)).usedListDeleted, "the survey's state does not say the list was deleted");
    // The rewrite still works with the list gone.
    await store.levelAll(world.db, await store.readState(world.db));
  });
});

// ---------------------------------------------------------------------------
// 6. The public routes when things go wrong
// ---------------------------------------------------------------------------

const { readSurveyBody } = await loadTs("lib/aiSurvey/request.ts");
const routes = {
  code: await loadTs("app/api/ai-survey/code/route.ts"),
  check: await loadTs("app/api/ai-survey/code/check/route.ts"),
  save: await loadTs("app/api/ai-survey/save/route.ts"),
  session: await loadTs("app/api/ai-survey/session/route.ts"),
};
const post = (body) => new Request("http://survey.invalid/", { method: "POST", body: JSON.stringify(body) });
const { callSurvey, CALL_LIMIT_MS } = await loadTs("features/aiSurvey/api.ts");

describe("the public routes when things go wrong", () => {
  test("a datastore that does not answer gets \"try again\" from every route, and none of them throws", async () => {
    const joined = await join(A);
    world.hooks.down = true;
    const replies = {
      code: await routes.code.POST(post({ email: B })),
      check: await routes.check.POST(post({ email: B, code: "123456", claim: newClaim() })),
      save: await routes.save.POST(post({ pass: joined.pass, pageId: "about1", answers: ANSWERS.about1, finish: false })),
      session: await routes.session.POST(post({ pass: joined.pass })),
    };
    assert.deepEqual(
      Object.fromEntries(Object.entries(replies).map(([name, reply]) => [name, [reply.status, reply.body.error]])),
      { code: [503, "couldNotSend"], check: [503, "failed"], save: [503, "failed"], session: [503, "failed"] },
    );
    assert.equal(globalThis.__aiSurveyMail.length, 1, "a code was sent while the datastore was not answering");
    // Nothing was lost by it: the same pass saves once the datastore answers.
    world.hooks.down = false;
    const saved = await savePage(joined.pass, "about1", ANSWERS.about1, false, T0 + MINUTE);
    assert.equal(saved.ok, true, JSON.stringify(saved));
  });

  test("a request body is read up to its limit and dropped there, and only an object is a body", async () => {
    // Fifty pieces of 4,000 characters, handed over one read at a time.
    let handed = 0;
    const piece = new TextEncoder().encode("x".repeat(4000));
    const endless = new ReadableStream(
      {
        pull(controller) {
          handed += 1;
          if (handed > 50) controller.close();
          else controller.enqueue(piece);
        },
      },
      { highWaterMark: 0 },
    );
    assert.equal(await readSurveyBody({ body: endless }), null);
    assert.ok(handed <= 6, `the body was read past its limit: ${handed} pieces of 50 were taken`);

    assert.deepEqual(await readSurveyBody(post({ pass: "p", finish: true })), { pass: "p", finish: true });
    for (const notABody of ["[1]", "null", '"words"', "7", "{"]) {
      const req = new Request("http://survey.invalid/", { method: "POST", body: notABody });
      assert.equal(await readSurveyBody(req), null, `${notABody} was taken for a body`);
    }
    assert.equal(await readSurveyBody(new Request("http://survey.invalid/", { method: "POST" })), null);
  });

  test("the page stops waiting for a call that never answers, and sends nothing of the person with any call", async () => {
    const realFetch = globalThis.fetch;
    const sent = [];
    try {
      // A request that is taken and never answered, as on one bar of signal.
      globalThis.fetch = (url, init) => {
        sent.push([url, init]);
        return new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("given up", "AbortError")));
        });
      };
      const started = Date.now();
      assert.deepEqual(await callSurvey("save", { pass: "p" }, 40), { ok: false, error: "failed" });
      assert.ok(Date.now() - started < 2000, "the call waited far past its limit");
      assert.ok(CALL_LIMIT_MS >= 10_000 && CALL_LIMIT_MS <= 30_000, "the usual limit is not one a slow phone can live with");

      // One that answers: the answer comes through, and the limit's timer is gone with it.
      globalThis.fetch = async (url, init) => {
        sent.push([url, init]);
        return { ok: true, json: async () => ({ ok: true, pass: "next" }) };
      };
      assert.deepEqual(await callSurvey("save", { pass: "p" }), { ok: true, pass: "next" });
      // And a refusal by name.
      globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "gone" }) });
      assert.deepEqual(await callSurvey("save", { pass: "p" }), { ok: false, error: "gone" });

      for (const [url, init] of sent) {
        assert.equal(url, "/api/ai-survey/save");
        assert.deepEqual([init.method, init.credentials, init.referrerPolicy, init.cache], ["POST", "omit", "no-referrer", "no-store"]);
        assert.deepEqual(Object.keys(init.headers), ["content-type"]);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
