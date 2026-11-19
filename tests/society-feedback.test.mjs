/**
 * ANONYMOUS FEEDBACK FOR THE WHOLE SOCIETY (docs/surveys.md, "Anonymous
 * feedback for the whole society"), run end to end in the programme surveys'
 * world: the members' form and its route, the night's move, the admins' page
 * and its routes, every one real, against one store.
 *
 *  1. WHAT IS KEPT: exactly seven fields, the words, the day and the three
 *     choices, and nothing of the sender: no uid, address, name, IP or time,
 *     signed in as anybody. The session is asked once, for a yes or a no.
 *  2. WHO MAY SEND: a member, committee or an admin; nobody signed out,
 *     waiting or refused, and nobody in a view-as session.
 *  3. THE MOVE: a finished London day's entries move into the record kept, in
 *     an order that is not the order of writing, and today's wait. A kept
 *     entry carries nothing finer than its day.
 *  4. THE ADMINS' PAGE, as pure functions over built worlds and as drawn:
 *     only days before today, by day, a tab per programme, the role filter,
 *     the empty states. Only an admin reads it, and it reads only what has
 *     moved.
 *  5. WHAT ADMINS DO: Dealt with and a note (who and when, recorded), the
 *     clear-out by hand behind a confirm that counts, and the download.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { AGI, NOW, ROUND, TAIS, makeSurveyWorld, surveySeed, textOf } from "./lib/surveyWorld.mjs";

const KEY = "__societyFeedback";
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);
const w = await makeSurveyWorld(KEY, [["firebase-admin/firestore", FIRESTORE]]);
const { loadTs } = w;

const send = await loadTs(join("app", "api", "anonymous-feedback", "route.ts"));
const mark = await loadTs(join("app", "api", "admin", "anonymous-feedback", "[entryId]", "route.ts"));
const clear = await loadTs(join("app", "api", "admin", "anonymous-feedback", "clear", "route.ts"));
const download = await loadTs(join("app", "api", "admin", "anonymous-feedback", "download", "route.ts"));
const FormPage = (await loadTs(join("app", "(app)", "anonymous-feedback", "page.tsx"))).default;
const AdminPage = (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "anonymous-feedback", "page.tsx"))).default;
const model = await loadTs(join("lib", "societyFeedback", "model.ts"));
const view = await loadTs(join("lib", "societyFeedback", "view.ts"));
const words = await loadTs(join("lib", "societyFeedback", "words.ts"));
const move = await loadTs(join("lib", "societyFeedback", "move.ts"));
const { anonymousFeedbackMoveJob } = await loadTs(join("lib", "scheduler", "jobs", "anonymousFeedbackMove.ts"));
const lastRoute = await loadTs(join("features", "pwa", "lastRoute.ts"));

const ENTRY_KEYS = ["about", "day", "programmeId", "programmeName", "roundId", "week", "words"];

// ---------------------------------------------------------------------------
// A tripwire on the session: every read of who is calling, counted
// ---------------------------------------------------------------------------

let sessionReads = 0;
const held = { user: null, viewAs: false };
for (const name of ["user", "viewAs"]) {
  Object.defineProperty(w.world, name, {
    configurable: true,
    get() {
      if (name === "user") sessionReads += 1;
      return held[name];
    },
    set(value) {
      held[name] = value;
    },
  });
}

function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const at = (t, iso) => t.mock.timers.setTime(new Date(iso).getTime());

let addresses = 0;
const nextAddress = () => {
  addresses += 1;
  return `203.0.${(addresses >> 8) & 255}.${addresses & 255}`;
};

/** A request to the send route as `who`, from an address of its own unless one is named. */
async function sendAs(who, body, { viewAs = false, ip = nextAddress() } = {}) {
  held.user = who ? w.sessionOf(who) : null;
  held.viewAs = viewAs;
  try {
    const response = await send.POST(
      new Request("https://naisi.invalid/api/anonymous-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    held.viewAs = false;
  }
}

/** A request to an admin route as `who`. */
async function adminCall(who, handler, { url = "https://naisi.invalid/api", body, params = {}, viewAs = false } = {}) {
  held.user = who ? w.sessionOf(who) : null;
  held.viewAs = viewAs;
  try {
    const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await handler(new Request(url, init), { params: Promise.resolve(params) });
    return { status: response.status, body: typeof response.body === "string" ? response.body : structuredClone(response.body), headers: response.headers };
  } finally {
    held.viewAs = false;
  }
}

/** The store, with `count()` on every query, answered by counting what the query returns. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

/** The surveys' world, with an account still waiting for approval and one refused. */
function reset() {
  w.reset(
    surveySeed({
      "users/waiting": { uid: "waiting", email: "waiting@example.com", displayName: "Wyn Ash", role: "pending" },
      "users/refused": { uid: "refused", email: "refused@example.com", displayName: "Rory Quill", role: "rejected" },
    }),
  );
  w.world.db = counting(w.world.db);
}

const waitingPaths = () => w.world.db.paths().filter((path) => path.startsWith("societyFeedbackWaiting/")).sort();
const keptPaths = () => w.world.db.paths().filter((path) => path.startsWith("societyFeedback/")).sort();
const waiting = () => waitingPaths().map((path) => w.world.db.read(path));
const kept = () => keptPaths().map((path) => w.world.db.read(path));

function runMove(now = new Date()) {
  return anonymousFeedbackMoveJob.handler({
    now,
    budget: { remainingMs: () => 60_000, expired: () => false },
    log: () => {},
    policy: {},
    maxPerTick: anonymousFeedbackMoveJob.maxPerTick,
    maxLateHours: 0,
  });
}

/** Every string anywhere in a value, however deep. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (value instanceof Date) out.push(value.toISOString());
  else if (Array.isArray(value)) for (const each of value) stringsIn(each, out);
  else if (value && typeof value === "object") for (const each of Object.values(value)) stringsIn(each, out);
  return out;
}

const AGI_WEEK_2 = { words: "We ran out of time for the last topic most weeks.", roundId: ROUND, programmeId: AGI, week: 2, about: "facilitator" };

// ---------------------------------------------------------------------------
// 1. What is kept
// ---------------------------------------------------------------------------

describe("1. an entry keeps the words, the day and the three choices, and nothing of the sender", () => {
  test("a member's entry is written with exactly its seven fields, the programme's name from the form, and nothing that names them", async (t) => {
    clock(t, new Date("2026-11-09T14:37:21Z"));
    reset();
    const ip = "198.51.100.77";
    const before = sessionReads;
    const sent = await sendAs("amara", AGI_WEEK_2, { ip });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, { ok: true }, "the answer carries an id, or anything else");
    assert.equal(sessionReads - before, 1, "the route asked who was calling more than once");
    assert.equal(waitingPaths().length, 1);
    const [entry] = waiting();
    assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS);
    assert.deepEqual(entry, {
      words: AGI_WEEK_2.words,
      day: "2026-11-09",
      roundId: ROUND,
      programmeId: AGI,
      programmeName: "AGI Strategy",
      week: 2,
      about: "facilitator",
    });
    // Nothing anywhere in it is the sender's: not the uid, the address, the name, the IP or the time.
    const account = w.world.db.read("users/amara");
    const said = stringsIn(entry).join(" | ");
    for (const trace of ["amara", account.email, account.displayName, ip, "14:37", "T14", "2026-11-09T"]) {
      assert.ok(!said.includes(trace), `the entry keeps "${trace}"`);
    }
    assert.deepEqual(keptPaths(), [], "an entry is kept before its day is over");
  });

  test("an entry naming nothing keeps blanks, and a body's other fields are never read", async (t) => {
    clock(t);
    reset();
    const sent = await sendAs("zach", { words: "  Film night was brilliant.  ", uid: "zach", email: "zach@example.com", createdAt: "2026-10-29T09:00:00Z" });
    assert.equal(sent.status, 200);
    assert.deepEqual(waiting(), [{ words: "Film night was brilliant.", day: "2026-10-29", roundId: "", programmeId: "", programmeName: "", week: null, about: "" }]);
  });

  test("signed in as committee or as an admin, the same seven fields and nothing more", async (t) => {
    clock(t);
    reset();
    for (const who of ["claudia", "zach", "dev"]) assert.equal((await sendAs(who, { words: `From ${who.length} letters.` })).status, 200);
    for (const entry of waiting()) assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS);
    const said = stringsIn(waiting()).join(" | ");
    for (const who of ["claudia", "zach", "dev"]) assert.ok(!said.includes(who), `an entry keeps ${who}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Who may send, and what is refused
// ---------------------------------------------------------------------------

describe("2. only a member sends, and every refusal writes nothing", () => {
  test("signed out, waiting, refused or in a view-as session: refused, nothing written", async (t) => {
    clock(t);
    reset();
    const short = (r) => [r.status, r.body?.error ?? null];
    assert.deepEqual(short(await sendAs(null, AGI_WEEK_2)), [401, words.REFUSAL_WORDS.notMember]);
    assert.deepEqual(short(await sendAs("waiting", AGI_WEEK_2)), [403, words.REFUSAL_WORDS.notMember]);
    assert.deepEqual(short(await sendAs("refused", AGI_WEEK_2)), [403, words.REFUSAL_WORDS.notMember]);
    assert.equal((await sendAs("amara", AGI_WEEK_2, { viewAs: true })).status, 403);
    assert.deepEqual(waitingPaths(), []);
  });

  test("a bad body, an unknown programme, a session past the programme's last week, or one with no programme: refused", async (t) => {
    clock(t);
    reset();
    const status = async (body) => (await sendAs("amara", body)).status;
    assert.equal(await status("not json"), 400);
    assert.equal(await status([]), 400);
    assert.equal(await status({ words: "" }), 400);
    assert.equal(await status({ words: "   " }), 400);
    assert.equal(await status({ words: 12 }), 400);
    assert.equal(await status({ words: "x".repeat(model.WORDS_MAX_CHARS + 1) }), 400);
    assert.equal(await status({ words: "Hi", about: "Alex" }), 400, "a name in place of a role");
    assert.equal(await status({ words: "Hi", week: 2 }), 400, "a session with no programme");
    assert.equal(await status({ words: "Hi", roundId: ROUND, programmeId: AGI, week: 7 }), 400, "AGI Strategy has six weeks");
    assert.equal(await status({ words: "Hi", roundId: ROUND, programmeId: AGI, week: 1.5 }), 400);
    assert.equal(await status({ words: "Hi", roundId: ROUND }), 400, "half a programme");
    assert.equal(await status({ words: "Hi", roundId: ROUND, programmeId: "no-such-programme" }), 404);
    assert.equal(await status({ words: "Hi", roundId: "no-such-form", programmeId: AGI }), 404);
    assert.deepEqual(waitingPaths(), []);
    assert.equal(await status({ words: "x".repeat(model.WORDS_MAX_CHARS), roundId: ROUND, programmeId: TAIS, week: 6, about: "else" }), 200);
  });

  test("a flood from one address meets the limit, counted in memory; another address is not held back", async (t) => {
    clock(t);
    reset();
    const ip = "192.0.2.200";
    for (let i = 0; i < 30; i += 1) assert.equal((await sendAs("amara", { words: `Number ${i}` }, { ip })).status, 200);
    const refused = await sendAs("amara", { words: "One more" }, { ip });
    assert.deepEqual([refused.status, refused.body.error], [429, words.REFUSAL_WORDS.tooMany]);
    assert.equal((await sendAs("amara", { words: "From elsewhere" })).status, 200);
    assert.equal(waitingPaths().length, 31);
  });

  test("one address is held to 30 an hour as well, so it cannot use up the whole form's 300 for everybody", async (t) => {
    clock(t);
    reset();
    const ip = "192.0.2.201";
    for (let i = 0; i < 30; i += 1) {
      // A minute apart, five at a time, so the per-minute limit never bites.
      if (i % 5 === 0) at(t, new Date(NOW.getTime() + (i / 5) * 61_000).toISOString());
      assert.equal((await sendAs("amara", { words: `Hourly ${i}` }, { ip })).status, 200);
    }
    at(t, new Date(NOW.getTime() + 20 * 60_000).toISOString());
    const refused = await sendAs("amara", { words: "The thirty-first this hour" }, { ip });
    assert.deepEqual([refused.status, refused.body.error], [429, words.REFUSAL_WORDS.tooMany]);
    assert.equal((await sendAs("dev", { words: "Another address" })).status, 200, "another address was held back");
    at(t, new Date(NOW.getTime() + 61 * 60_000).toISOString());
    assert.equal((await sendAs("amara", { words: "An hour on" }, { ip })).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. The move
// ---------------------------------------------------------------------------

describe("3. the night's move: a finished day's entries, shuffled, into the record kept", () => {
  test("a day's entries move once the day is over in London, each with the same seven fields and nothing finer than the day; today's wait", async (t) => {
    clock(t, new Date("2026-11-09T18:00:00Z"));
    reset();
    await sendAs("amara", { words: "Monday evening." });
    at(t, "2026-11-09T23:59:00Z");
    await sendAs("dev", { words: "Monday, a minute to midnight." });
    at(t, "2026-11-10T00:20:00Z");
    await sendAs("amara", { words: "Tuesday, just after midnight." });
    const run = await runMove(new Date());
    assert.deepEqual(run, { processed: 2, hasMore: false, note: "2 feedback" });
    for (const record of kept()) {
      assert.deepEqual(Object.keys(record).sort(), ENTRY_KEYS);
      assert.equal(record.day, "2026-11-09");
      assert.ok(!stringsIn(record).some((value) => /T\d\d:|\d\d:\d\d/.test(value)), "a kept entry carries a time");
    }
    assert.deepEqual(waiting().map((record) => record.words), ["Tuesday, just after midnight."]);
    assert.deepEqual(await runMove(new Date()), { processed: 0, hasMore: false, note: "none due" });
    at(t, "2026-11-11T00:05:00Z");
    assert.equal((await runMove(new Date())).processed, 1);
    assert.deepEqual(waiting(), []);
  });

  test("British Summer Time: an entry sent at 23:30 UTC on Sat 24 Oct came in on Sun 25 Oct in London", () => {
    assert.equal(model.dayOf(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
  });

  test("the order kept, and the order the admins' page draws, is not the order they were written in", async (t) => {
    clock(t, new Date("2026-11-09T09:00:00Z"));
    reset();
    const written = [];
    for (let i = 0; i < 12; i += 1) {
      at(t, new Date(Date.UTC(2026, 10, 9, 9, i * 5)).toISOString());
      const words = `Entry written ${String(i).padStart(2, "0")}.`;
      written.push(words);
      assert.equal((await sendAs("amara", { words })).status, 200);
    }
    at(t, "2026-11-10T01:00:00Z");
    // A fixed random source, so the shuffle is the same every run.
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const result = await move.moveWaitingSocietyFeedback(w.world.db, "2026-11-10", { max: 100, expired: () => false }, random);
    assert.equal(result.moved, 12);
    // The order the kept records were created in.
    const createdOrder = keptPaths()
      .sort((a, b) => Number(a.split("auto-")[1]) - Number(b.split("auto-")[1]))
      .map((path) => w.world.db.read(path).words);
    assert.deepEqual([...createdOrder].sort(), written);
    assert.notDeepEqual(createdOrder, written, "the move kept them in the order they were written");
    // The page draws a day by the kept records' ids, which the move drew in its shuffled order.
    const entries = keptPaths().map((path) => model.normaliseKept(path.split("/")[1], w.world.db.read(path)));
    const drawn = view.buildAdminView(entries, "2026-11-10", null).days[0].entries.map((entry) => entry.words);
    assert.equal(drawn.length, 12);
    assert.notDeepEqual(drawn, written, "the page draws them in the order they were written");
  });

  test("the job moves both forms' entries in one tick and says so", async (t) => {
    clock(t, new Date("2026-11-09T12:00:00Z"));
    reset();
    await sendAs("amara", { words: "One." });
    w.world.db.collection("anonymousFeedbackWaiting").add({ roundId: ROUND, programmeId: AGI, runId: "run", keep: "Keep it.", change: "", drop: "", day: "2026-11-09" });
    at(t, "2026-11-10T00:30:00Z");
    assert.deepEqual(await runMove(new Date()), { processed: 2, hasMore: false, note: "1 answers, 1 feedback" });
  });
});

// ---------------------------------------------------------------------------
// 4. The admins' page
// ---------------------------------------------------------------------------

/** A kept entry, built. */
function keptEntry(id, over = {}) {
  return {
    id,
    words: `Words of ${id}.`,
    day: "2026-11-09",
    roundId: "",
    programmeId: "",
    programmeName: "",
    week: null,
    about: "",
    dealtWith: null,
    note: null,
    ...over,
  };
}

describe("4. the admins' page: from the next day, by day, by programme, read only by an admin", () => {
  test("the model: only days before today and since the term began, newest day first, ordered within a day by id, a tab per programme and one for none", () => {
    const entries = [
      keptEntry("b", { day: "2026-11-09", roundId: ROUND, programmeId: AGI, programmeName: "AGI Strategy", week: 2 }),
      keptEntry("a", { day: "2026-11-09" }),
      keptEntry("c", { day: "2026-11-07", roundId: ROUND, programmeId: TAIS, programmeName: "Technical AI Safety", about: "facilitator" }),
      keptEntry("today", { day: "2026-11-10" }),
      keptEntry("old", { day: "2026-08-01" }),
    ];
    const built = view.buildAdminView(entries, "2026-11-10", "2026-10-06");
    assert.equal(built.countLine, "3 this term");
    assert.deepEqual(built.days.map((day) => [day.label, day.entries.map((entry) => entry.id)]), [
      ["Mon 9 Nov", ["a", "b"]],
      ["Sat 7 Nov", ["c"]],
    ]);
    assert.deepEqual(built.tabs.map((tab) => [tab.label, tab.count]), [
      ["All", 3],
      ["AGI Strategy", 1],
      ["Technical AI Safety", 1],
      ["Not about a programme", 1],
    ]);
    const b = built.days[0].entries[1];
    assert.deepEqual([b.programmeLabel, b.weekLabel, b.aboutLabel], ["AGI Strategy", "Week 2", null]);
    assert.equal(built.days[1].entries[0].aboutLabel, "About: my group’s facilitator");
    assert.equal(built.days[0].entries[0].programmeLabel, "Not about a programme");
    // The filters.
    assert.deepEqual(view.filterDays(built.days, `${ROUND}/${AGI}`, "").flatMap((day) => day.entries.map((e) => e.id)), ["b"]);
    assert.deepEqual(view.filterDays(built.days, view.ALL_TAB, "facilitator").flatMap((day) => day.entries.map((e) => e.id)), ["c"]);
    assert.deepEqual(view.filterDays(built.days, view.NO_PROGRAMME_TAB, "lead"), []);
  });

  test("the model: empty, and before any term has begun every kept entry shows with no count line", () => {
    const empty = view.buildAdminView([], "2026-11-10", "2026-10-06");
    assert.deepEqual([empty.total, empty.countLine, empty.days, empty.tabs.map((tab) => tab.label)], [0, "0 this term", [], ["All"]]);
    const noTerm = view.buildAdminView([keptEntry("old", { day: "2025-01-02" })], "2026-11-10", null);
    assert.deepEqual([noTerm.total, noTerm.countLine], [1, null]);
  });

  test("the model hands the page a note's line and whether it is dealt with, and never a uid or a time", () => {
    const at = new Date("2026-11-08T10:00:00Z");
    const built = view.buildAdminView(
      [keptEntry("x", { dealtWith: { byUid: "zach", byName: "Zach Levin", at }, note: { byUid: "zach", byName: "Zach Levin", at, text: "Sent the guide out early." } })],
      "2026-11-10",
      null,
    );
    const entry = built.days[0].entries[0];
    assert.equal(entry.dealtWith, true);
    assert.equal(entry.noteLine, "Zach Levin, Sun 8 Nov: Sent the guide out early.");
    assert.ok(!JSON.stringify(built).includes('"zach"'), "a uid reaches the page");
    assert.ok(!JSON.stringify(built).includes("2026-11-08T"), "a time reaches the page");
  });

  test("the page, as drawn: an admin reads what has moved and never the waiting place; nobody else is let in", async (t) => {
    clock(t, new Date("2026-11-09T12:00:00Z"));
    reset();
    await sendAs("amara", { words: "<b>Not bold</b> https://example.com/x", roundId: ROUND, programmeId: AGI, week: 2, about: "facilitator" });
    at(t, "2026-11-10T12:00:00Z");
    // Not moved yet: yesterday's entry is still waiting, and the page does not read it.
    const before = await w.page(AdminPage, {}, "zach");
    assert.ok(before.text.includes(words.ADMIN_WORDS.none), before.text);
    await runMove(new Date());
    const reads = w.world.db.stats.reads;
    const page = await w.page(AdminPage, {}, "zach");
    const used = w.world.db.stats.reads - reads;
    assert.ok(used <= 3, `one view read ${used} times`);
    assert.ok(page.text.includes("1 this term"));
    assert.ok(page.text.includes("Mon 9 Nov"));
    assert.ok(page.text.includes("About: my group’s facilitator"));
    // Shown as text: the tag is escaped and the address is not a link.
    assert.ok(page.html.includes("&lt;b&gt;Not bold&lt;/b&gt;"));
    assert.ok(!page.html.includes('href="https://example.com/x"'));
    for (const who of ["claudia", "amara", "dev", "nobody"]) {
      const refused = await w.page(AdminPage, {}, who);
      assert.equal(refused.to, "/dashboard", `${who} is not sent away`);
      assert.equal(refused.html, "");
    }
  });

  test("the members' form, as drawn: this term's programmes, the roles, the form's own words, and nothing about the reader", async (t) => {
    clock(t);
    reset();
    const before = sessionReads;
    const element = await FormPage();
    const html = renderToStaticMarkup(element);
    assert.equal(sessionReads, before, "the form's page asked who was reading");
    const text = textOf(html);
    for (const line of [
      words.FORM_WORDS.title,
      words.FORM_WORDS.intro,
      words.FORM_WORDS.programmeLabel,
      words.FORM_WORDS.programmeNone,
      words.FORM_WORDS.aboutLabel,
      words.FORM_WORDS.aboutHint,
      words.FORM_WORDS.wordsLabel,
      words.FORM_WORDS.box,
      words.FORM_WORDS.send,
      "AGI Strategy",
      "Technical AI Safety",
      ...Object.values(words.ABOUT_WORDS),
    ]) {
      assert.ok(text.includes(line), `the form does not say: ${line}`);
    }
    assert.ok(!/nothing is kept/i.test(text));

    assert.ok(!text.includes("Ask the team") && !text.includes("ask the team"), "the form points to Ask the team, which does not exist");
  });
});

describe("4b. the member's own browser keeps nothing of the form", () => {
  test("the relaunch tracker never records the form's address, and still records every other page", () => {
    const writes = [];
    const was = globalThis.window;
    globalThis.window = { localStorage: { setItem: (key, value) => writes.push([key, value]), getItem: () => null } };
    try {
      lastRoute.recordLastRoute("/anonymous-feedback");
      lastRoute.recordLastRoute("/anonymous-feedback/");
      assert.deepEqual(writes, [], "the form's address was kept in the browser");
      lastRoute.recordLastRoute("/dashboard");
      assert.equal(writes.length, 1);
      assert.equal(JSON.parse(writes[0][1]).path, "/dashboard");
      // A page whose name merely starts the same way is recorded as any other.
      lastRoute.recordLastRoute("/anonymous-feedback-elsewhere");
      assert.equal(writes.length, 2);
    } finally {
      globalThis.window = was;
    }
  });
});

// ---------------------------------------------------------------------------
// 5. What admins do
// ---------------------------------------------------------------------------

async function oneKept(t) {
  clock(t, new Date("2026-11-09T12:00:00Z"));
  reset();
  await sendAs("amara", { words: "=HYPERLINK(\"https://example.com\")", roundId: ROUND, programmeId: AGI });
  at(t, "2026-11-10T12:00:00Z");
  await runMove(new Date());
  return keptPaths()[0].split("/")[1];
}

describe("5. Dealt with, a note, the clear-out by hand, and the download: an admin's alone", () => {
  test("Dealt with and a note record which admin and when, and nothing else of the entry changes", async (t) => {
    const id = await oneKept(t);
    const original = { ...w.world.db.read(`societyFeedback/${id}`) };
    assert.equal((await adminCall("zach", mark.POST, { params: { entryId: id }, body: { action: "dealtWith" } })).status, 200);
    assert.equal((await adminCall("zach", mark.POST, { params: { entryId: id }, body: { action: "note", text: "  Sent the guide early.  " } })).status, 200);
    const record = w.world.db.read(`societyFeedback/${id}`);
    assert.deepEqual(Object.keys(record).sort(), [...ENTRY_KEYS, "dealtWith", "note"].sort());
    for (const key of ENTRY_KEYS) assert.deepEqual(record[key], original[key]);
    assert.equal(record.dealtWith.byUid, "zach");
    assert.equal(record.note.text, "Sent the guide early.");
    assert.equal(record.note.byName, "Zach Levin");
  });

  test("nobody else marks, notes, counts, clears or downloads; view-as is refused; a missing entry is a 404", async (t) => {
    const id = await oneKept(t);
    const routes = [
      [mark.POST, { params: { entryId: id }, body: { action: "dealtWith" } }],
      [clear.GET, { url: "https://naisi.invalid/api?before=2026-11-10" }],
      [clear.POST, { body: { before: "2026-11-10", count: 1 } }],
      [download.GET, {}],
    ];
    for (const [handler, options] of routes) {
      assert.equal((await adminCall(null, handler, options)).status, 401);
      for (const who of ["claudia", "amara", "waiting", "refused"]) assert.equal((await adminCall(who, handler, options)).status, 403, `${who} reached ${handler.name}`);
    }
    assert.equal((await adminCall("zach", mark.POST, { params: { entryId: id }, body: { action: "dealtWith" }, viewAs: true })).status, 403);
    assert.equal((await adminCall("zach", clear.POST, { body: { before: "2026-11-10", count: 1 }, viewAs: true })).status, 403);
    assert.equal((await adminCall("zach", mark.POST, { params: { entryId: "e2e-missing" }, body: { action: "dealtWith" } })).status, 404);
    assert.equal((await adminCall("zach", mark.POST, { params: { entryId: id }, body: {} })).status, 400);
    assert.equal(keptPaths().length, 1);
    assert.equal(w.world.db.read(`societyFeedback/${id}`).dealtWith, undefined);
  });

  test("the clear-out counts, refuses a stale count, deletes only what is older, and never reaches the waiting place", async (t) => {
    await oneKept(t);
    at(t, "2026-11-10T13:00:00Z");
    await sendAs("dev", { words: "Today's, still waiting." });
    w.world.db.collection("societyFeedback").doc("newer").set({ words: "Newer.", day: "2026-11-10", roundId: "", programmeId: "", programmeName: "", week: null, about: "" });
    const counted = await adminCall("zach", clear.GET, { url: "https://naisi.invalid/api?before=2026-11-10" });
    assert.deepEqual(counted.body, { count: 1 });
    assert.equal((await adminCall("zach", clear.GET, { url: "https://naisi.invalid/api?before=2026-11-11" })).status, 400, "a day after today");
    const stale = await adminCall("zach", clear.POST, { body: { before: "2026-11-10", count: 3 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.count, 1);
    assert.equal(keptPaths().length, 2, "a stale confirm deleted something");
    const done = await adminCall("zach", clear.POST, { body: { before: "2026-11-10", count: 1 } });
    assert.deepEqual(done.body, { deleted: 1, left: 0 });
    assert.deepEqual(keptPaths(), ["societyFeedback/newer"]);
    assert.equal(waitingPaths().length, 1, "the clear-out reached the waiting place");
  });

  test("the download: every kept entry, its cells guarded against formulas, and no admin named", async (t) => {
    const id = await oneKept(t);
    await adminCall("zach", mark.POST, { params: { entryId: id }, body: { action: "note", text: "Looked at it." } });
    const file = await adminCall("zach", download.GET, {});
    assert.equal(file.status, 200);
    assert.equal(file.headers["Content-Type"], "text/csv; charset=utf-8");
    const lines = file.body.trim().split("\n");
    assert.equal(lines[0], "Day,Programme,Session,About,Feedback,Dealt with,Note");
    assert.equal(lines.length, 2);
    assert.ok(lines[1].startsWith("2026-11-09,AGI Strategy,,,"));
    assert.ok(lines[1].includes('"\t=HYPERLINK(""https://example.com"")"'), lines[1]);
    assert.ok(lines[1].endsWith(",,Looked at it."));
    assert.ok(!file.body.includes("Zach") && !file.body.includes("zach"));
  });
});
