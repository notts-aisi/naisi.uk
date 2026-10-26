/**
 * THE ANONYMOUS KEEP, CHANGE AND DROP FORM, THROUGH ITS REAL ROUTE, PAGES AND
 * JOB (docs/surveys.md, "The anonymous form at a programme's end").
 *
 * The survey at a programme's end opens the form with its first send, closes
 * it when it closes, and links to it once a person has sent their answers.
 * The form takes three answers by one link per programme, keeps them with the
 * programme and the day and nothing else, moves each day's answers overnight
 * into the record kept, and shows them to the programme's lead and admins from
 * the next day, in an order that has nothing to do with when they came in.
 *
 * Every caller is tried: somebody signed out with the link, somebody signed in
 * with it (nothing about them is kept), an admin in a view-as session, a wrong
 * link, an old one, a flood past the limits, the programme's lead, the lead of
 * another programme, its reviewer, a facilitator, a member, somebody on
 * nothing and an admin. Each stored record is read back and held to the three
 * answers, the programme and the day.
 *
 * The world is `tests/lib/surveyWorld.mjs` (AGI Strategy on Thu 29 Oct 2026,
 * Claudia its lead, Tess the lead of Technical AI Safety). Run with
 * `npm test`. Nothing here reaches a Firestore project or an inbox.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { AGI, NOW, ROUND, RUN, TAIS, makeSurveyWorld, surveySeed, textOf } from "./lib/surveyWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "__anonymousFeedback";

/**
 * The world, with the admissions pages' session (reached through a relative
 * import) standing in for the signed-in reader, as the lead's pages suites do.
 */
// The scheduler's registry reaches a job that imports `FieldPath` beside `FieldValue`.
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);
const w = await makeSurveyWorld(KEY, [
  ["./session", `export async function getCurrentUser() { return globalThis[${JSON.stringify(KEY)}].user; }`],
  ["firebase-admin/firestore", FIRESTORE],
]);
const { call, loadTs, routes } = w;

const feedback = await loadTs(join("app", "api", "feedback", "route.ts"));
const FormPage = (await loadTs(join("app", "feedback", "[token]", "page.tsx"))).default;
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const ReadersPage = (await loadTs(join(TABS, "anonymous-feedback", "page.tsx"))).default;
const model = await loadTs(join("lib", "anonymousFeedback", "model.ts"));
const forms = await loadTs(join("lib", "anonymousFeedback", "forms.ts"));
const words = await loadTs(join("lib", "anonymousFeedback", "words.ts"));
const { anonymousFeedbackMoveJob } = await loadTs(join("lib", "scheduler", "jobs", "anonymousFeedbackMove.ts"));
const { AnonymousFormLink, AnonymousFormCard } = await loadTs(join("features", "anonymousFeedback", "AfterTheSurvey.tsx"));

// ---------------------------------------------------------------------------
// A tripwire on the session: every read of who is calling, counted
// ---------------------------------------------------------------------------

/**
 * The world's session stand-ins (`getCurrentUser`, the view-as guard and its
 * marker) all read `world.user` or `world.viewAs`. Counting those reads around
 * a request proves the request never asked who was calling.
 */
let sessionReads = 0;
const held = { user: null, viewAs: false };
for (const name of ["user", "viewAs"]) {
  Object.defineProperty(w.world, name, {
    configurable: true,
    get() {
      sessionReads += 1;
      return held[name];
    },
    set(value) {
      held[name] = value;
    },
  });
}

/** How many times `run` asked who was calling. */
async function readsDuring(run) {
  const before = sessionReads;
  const result = await run();
  return { result, reads: sessionReads - before };
}

// ---------------------------------------------------------------------------
// The term, the survey at the end, and the form
// ---------------------------------------------------------------------------

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const at = (t, iso) => t.mock.timers.setTime(new Date(iso).getTime());

/** The term, with the leads and the reviewer able to reach the admissions pages, as the round's roles leave them. */
function seed() {
  const base = surveySeed();
  for (const uid of ["claudia", "tess", "lloyd"]) base[`users/${uid}`] = { ...base[`users/${uid}`], admissionsReviewer: true };
  return base;
}

/** AGI Strategy's survey at the end, made and sent to the four holding a place; its id. */
async function afterSent() {
  const made = await w.make("zach", { stage: "after", closesOn: "2026-12-20" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  const sent = await w.sendFirst(id);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return id;
}

const formPaths = () => w.world.db.paths().filter((path) => path.startsWith("anonymousFeedbackForms/"));
const waitingPaths = () => w.world.db.paths().filter((path) => path.startsWith("anonymousFeedbackWaiting/")).sort();
const keptPaths = () => w.world.db.paths().filter((path) => path.startsWith("anonymousFeedback/")).sort();
const waiting = () => waitingPaths().map((path) => w.world.db.read(path));
const kept = () => keptPaths().map((path) => w.world.db.read(path));
const formOf = (surveyId) => w.world.db.read(`anonymousFeedbackForms/${surveyId}`);

/**
 * Every address a request comes from, new each time unless a test names one,
 * as the world's own requests are: the rate limiter's counts live in memory for
 * the whole run, so a shared address would carry one test's count into the next.
 */
let addresses = 0;
const nextAddress = () => {
  addresses += 1;
  return `198.51.${(addresses >> 8) & 255}.${addresses & 255}`;
};

/** A request to the answer route, as `who`, the way a browser sends one: with whatever cookies it holds. */
async function answer(body, { who = null, viewAs = false, ip = nextAddress(), cookie = null } = {}) {
  w.world.user = who ? w.sessionOf(who) : null;
  w.world.viewAs = viewAs;
  const headers = { "Content-Type": "application/json", "x-forwarded-for": ip };
  if (cookie) headers.cookie = cookie;
  try {
    const response = await feedback.POST(
      new Request("https://naisi.invalid/api/feedback", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }),
    );
    return { status: response.status, body: structuredClone(response.body), headers: response.headers };
  } finally {
    w.world.viewAs = false;
  }
}

/** The form's page for `token`, as it is drawn for whoever is looking. */
async function formPage(token, who = null) {
  return w.page(FormPage, { params: Promise.resolve({ token }) }, who);
}

/**
 * The readers' page for a programme, as `who` sees it: their session as the
 * site makes it, with the admissions flag their account carries.
 */
async function readersAs(who, programmeId = AGI) {
  w.world.user = who ? { ...w.sessionOf(who), admissionsReviewer: w.world.db.read(`users/${who}`)?.admissionsReviewer === true } : null;
  try {
    const element = await ReadersPage({ params: Promise.resolve({ roundId: ROUND, programmeId }) });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
    throw err;
  }
}

/** The store, with `count()` on every query it hands out, answered by counting what the query returns. */
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

/** The night's move, as the tick runs it. */
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

const EXACT_KEYS = ["change", "day", "drop", "keep", "programmeId", "roundId", "runId"];
const short = (response) => [response.status, response.body?.error ?? null];

// ---------------------------------------------------------------------------
// 1. Opened, linked and closed by the survey at the end
// ---------------------------------------------------------------------------

describe("1. the survey at a programme's end opens one form for it, links to it once sent, and closes it", () => {
  test("only the survey at the end's first send opens a form: with the programme, its run, the survey's closing time and a secret the same for everybody", async (t) => {
    clock(t);
    w.reset(seed());
    const before = (await w.make("zach")).body.survey.id;
    assert.equal((await w.sendFirst(before)).status, 200);
    assert.deepEqual(formPaths(), [], "the before survey opens no anonymous form");
    const after = await afterSent();
    assert.deepEqual(formPaths(), [`anonymousFeedbackForms/${after}`]);
    const form = formOf(after);
    assert.deepEqual(Object.keys(form).sort(), ["closedAt", "closesAt", "opensAt", "programmeId", "programmeKind", "programmeName", "roundId", "runId", "token"]);
    assert.equal(form.roundId, ROUND);
    assert.equal(form.programmeId, AGI);
    assert.equal(form.runId, RUN.agi);
    assert.equal(form.programmeName, w.survey(after).programmeName);
    assert.equal(form.closesAt.getTime(), w.survey(after).closesAt.getTime(), "the form closes when the survey at the end does");
    assert.equal(form.closedAt, null);
    assert.match(form.token, /^[A-Za-z0-9_-]{43}$/);
    // Opening it again (a later press of "joined since" asks the same) changes nothing, the link included.
    await forms.openAnonymousForm(w.world.db, { surveyId: after, roundId: ROUND, programmeId: AGI, runId: RUN.agi, programmeName: "Changed", programmeKind: "fellowship", closesAt: new Date("2027-01-01T00:00:00Z") }, new Date());
    assert.deepEqual(formOf(after), form, "a second opening changed the form, or its link");
  });

  test("the end of the survey links to it once somebody has sent their answers, at the same address for everybody, with no referrer", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const href = `/feedback/${formOf(after).token}`;
    // Bea has not answered: Bea's page is the form, and no link to the anonymous form.
    const open = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(after, "bea") }) });
    assert.ok(!open.html.includes(href) && !open.text.includes(words.CARD_WORDS.heading), "the link is shown before the survey is sent");
    // Amara answers: Amara's page now ends with the card, by the personal link and signed in.
    assert.equal((await w.answerByLink(w.tokenOf(after, "amara"), {})).status, 200);
    const byLink = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(after, "amara") }) });
    assert.ok(byLink.text.includes("You’ve answered"));
    assert.ok(byLink.text.includes(`${words.CARD_WORDS.heading} ${words.CARD_WORDS.body} ${words.CARD_WORDS.link}`), byLink.text);
    assert.match(byLink.html, new RegExp(`<a href="${href}" rel="noreferrer"`));
    const signedIn = await w.page(w.pages.signedIn, { params: Promise.resolve({ runId: RUN.agi, surveyId: after }) }, "amara");
    assert.match(signedIn.html, new RegExp(`<a href="${href}" rel="noreferrer"`));
    // Bea answers too, and is given the very same address: nothing in it is Bea's.
    assert.equal((await w.answerByLink(w.tokenOf(after, "bea"), {})).status, 200);
    const beas = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(after, "bea") }) });
    assert.deepEqual([...beas.html.matchAll(/href="(\/feedback\/[^"]+)"/g)].map((m) => m[1]), [href]);
    // Neither her link's token nor her uid is in it, and nothing follows it. The uid is held to the address's
    // segments, not its letters: the form's token is random and may hold "bea" by chance.
    assert.ok(!href.includes(w.tokenOf(after, "bea")) && !href.split("/").includes("bea") && !href.includes("?"));
  });

  test("the card once a survey is sent is the same card, drawn from the address it is handed and nothing else", () => {
    const card = (href) => renderToStaticMarkup(w.createElement(AnonymousFormLink, { href }, w.createElement(AnonymousFormCard)));
    assert.equal(card(null), "", "a survey with no anonymous form draws no card");
    const drawn = card("/feedback/abc");
    assert.match(drawn, /<a href="\/feedback\/abc" rel="noreferrer"/);
    assert.ok(textOf(drawn).startsWith(words.CARD_WORDS.heading));
    // The form's sent state draws it, under its thanks.
    const form = readFileSync(join(REPO_ROOT, "src", "features", "surveys", "answer", "SurveyForm.tsx"), "utf8");
    assert.match(form, /<p className=\{styles\.sentLine\}>\{ANSWER_WORDS\.thanks\}<\/p>\s*<AnonymousFormCard \/>/);
  });

  test("the before survey, a test link and a closed survey link to no form", async (t) => {
    clock(t);
    w.reset(seed());
    const before = (await w.make("zach")).body.survey.id;
    await w.sendFirst(before);
    await w.answerByLink(w.tokenOf(before, "amara"), {});
    const page = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(before, "amara") }) });
    assert.ok(!page.html.includes("/feedback/"));
    const after = await afterSent();
    const test = await w.page(w.pages.link, { params: Promise.resolve({ token: w.survey(after).testToken }) });
    assert.ok(!test.html.includes("/feedback/"), "a test link shows the form's address");
    await w.answerByLink(w.tokenOf(after, "amara"), {});
    assert.equal((await call("zach", routes.close.POST, { surveyId: after }, { body: {} })).status, 200);
    const closed = await w.page(w.pages.link, { params: Promise.resolve({ token: w.tokenOf(after, "amara") }) });
    assert.ok(!closed.html.includes("/feedback/"), "a closed form is still linked");
  });

  test("closing the survey at the end closes its form; closing the before survey closes nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const before = (await w.make("zach")).body.survey.id;
    await w.sendFirst(before);
    const after = await afterSent();
    assert.equal((await call("zach", routes.close.POST, { surveyId: before }, { body: {} })).status, 200);
    assert.equal(formOf(after).closedAt, null);
    assert.equal((await call("zach", routes.close.POST, { surveyId: after }, { body: {} })).status, 200);
    assert.ok(formOf(after).closedAt instanceof Date);
    const token = formOf(after).token;
    assert.deepEqual(short(await answer({ token, keep: "The readings." })), [409, words.REFUSAL_WORDS.closed]);
    const page = await formPage(token);
    assert.ok(page.text.includes("This form has closed It closed on Thu 29 Oct, so it takes no more answers."), page.text);
  });
});

// ---------------------------------------------------------------------------
// 2. Answering, as every caller
// ---------------------------------------------------------------------------

describe("2. answering by the link, as every caller", () => {
  test("signed out: the three answers, the programme and the day are kept, and nothing else", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    at(t, "2026-12-09T19:40:00Z");
    const token = formOf(after).token;
    const { result, reads } = await readsDuring(() => answer({ token, keep: "  The small groups.  ", change: "Start on time.", drop: "" }));
    assert.deepEqual(result.body, { ok: true });
    assert.equal(reads, 0, "the answer route asked who was calling");
    assert.deepEqual(waiting(), [{ roundId: ROUND, programmeId: AGI, runId: RUN.agi, keep: "The small groups.", change: "Start on time.", drop: "", day: "2026-12-09" }]);
    assert.deepEqual(Object.keys(waiting()[0]).sort(), EXACT_KEYS);
    assert.deepEqual(keptPaths(), [], "nothing is kept before the night's move");
  });

  test("signed in, and in a view-as session with both cookies sent: the same record, with nothing about either person, and the session never asked", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    const asAmara = await readsDuring(() => answer({ token, keep: "Amara’s keep." }, { who: "amara", cookie: "__session=amara-session" }));
    const asViewAs = await readsDuring(() =>
      answer({ token, change: "Somebody’s change." }, { who: "amara", viewAs: true, cookie: "__session=amara-session; __impersonator=zach-marker" }),
    );
    assert.deepEqual([asAmara.result.status, asViewAs.result.status], [200, 200]);
    assert.deepEqual([asAmara.reads, asViewAs.reads], [0, 0], "the route read the session or the view-as marker");
    const records = waiting();
    assert.equal(records.length, 2);
    for (const record of records) assert.deepEqual(Object.keys(record).sort(), EXACT_KEYS);
    const stored = JSON.stringify(records);
    for (const trace of ["amara", "Amara Okafor", "zach", "example.com", "198.51.100", "session", "marker", "uid"]) {
      assert.ok(!stored.includes(trace), `a stored answer holds "${trace}"`);
    }
  });

  test("the form's page is drawn from the link alone, says it is anonymous and how before the questions, and writes nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    const everything = w.everything();
    for (const who of [null, "amara", "zach"]) {
      const { result: page, reads } = await readsDuring(() => formPage(token, who));
      // The page helper sets the session itself (one write, no read); the page reads none.
      assert.equal(reads, 0, `the form's page asked who was looking (${who ?? "signed out"})`);
      const name = w.survey(after).programmeName;
      const box = `Anonymous ${words.FORM_WORDS.points(name).join(" ")} ${words.FORM_WORDS.note}`;
      assert.ok(page.text.includes(box), page.text);
      assert.ok(page.text.indexOf(box) < page.text.indexOf(words.QUESTION_WORDS.keep.title), "the box is not before the questions");
      assert.ok(page.text.includes(`${words.QUESTION_WORDS.keep.title} ${words.QUESTION_WORDS.keep.hint}`));
      assert.ok(page.text.includes(words.QUESTION_WORDS.change.title) && page.text.includes(words.QUESTION_WORDS.drop.title));
      assert.ok(page.text.includes("It closes on Sun 20 Dec. Once sent, your answers can’t change."));
      assert.match(page.html, /<button type="submit"[^>]*disabled=""[^>]*>Send anonymously<\/button>/, "Send does not wait for the page's script");
      assert.ok(!page.text.includes("Amara") && !page.text.includes("Zach"), "the page names whoever is looking");
    }
    assert.equal(w.everything(), everything, "opening the form's page wrote something");
  });

  test("a wrong link, a malformed one and an old one each get one sentence, and keep nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    assert.deepEqual(short(await answer({ token: "x".repeat(43), keep: "Hello." })), [404, words.REFUSAL_WORDS.noForm]);
    assert.deepEqual(short(await answer({ token: "short", keep: "Hello." })), [400, words.REFUSAL_WORDS.shape]);
    assert.deepEqual(short(await answer("not json at all")), [400, words.REFUSAL_WORDS.shape]);
    assert.deepEqual(short(await answer({ token, keep: 4 })), [400, words.REFUSAL_WORDS.shape]);
    assert.deepEqual(short(await answer({ token, keep: " ", change: "", drop: null })), [400, words.REFUSAL_WORDS.empty]);
    assert.deepEqual(short(await answer({ token, keep: "a".repeat(2001) })), [400, words.REFUSAL_WORDS.long]);
    assert.equal((await answer({ token, keep: "a".repeat(2000) })).status, 200, "2,000 characters is allowed");
    assert.equal(waiting().length, 1);
    for (const bad of ["x".repeat(43), "short"]) {
      const page = await formPage(bad);
      assert.ok(page.text.includes("This link doesn’t open a form"), page.text);
    }
    // An old link: its closing time has passed.
    at(t, "2026-12-21T00:00:00Z");
    assert.deepEqual(short(await answer({ token, keep: "Late." })), [409, words.REFUSAL_WORDS.closed]);
    assert.ok((await formPage(token)).text.includes("This form has closed It closed on Sun 20 Dec"));
    assert.equal(waiting().length, 1);
  });

  test("anything else in the body is not kept", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    assert.equal((await answer({ token, keep: "Keep.", uid: "amara", email: "amara@example.com", day: "2020-01-01", runId: "elsewhere" })).status, 200);
    assert.deepEqual(waiting()[0], { roundId: ROUND, programmeId: AGI, runId: RUN.agi, keep: "Keep.", change: "", drop: "", day: "2026-10-29" });
    // Words that happen to name a refusal are kept as words.
    assert.equal((await answer({ token, keep: "long", change: "shape", drop: "empty" })).status, 200);
    assert.deepEqual([waiting()[1].keep, waiting()[1].change, waiting()[1].drop], ["long", "shape", "empty"]);
  });
});

describe("2b. a flood past the limits", () => {
  /**
   * A form of its own for each test, with an id no other test uses: the
   * limits' counts are in memory, keyed by the form, for the whole run.
   */
  function floodForm(id) {
    const token = `${id}${"f".repeat(43 - id.length)}`;
    w.world.db.seed(`anonymousFeedbackForms/${id}`, {
      roundId: ROUND,
      programmeId: AGI,
      runId: RUN.agi,
      programmeName: "AGI Strategy",
      programmeKind: "fellowship",
      token,
      opensAt: NOW,
      closesAt: new Date("2026-12-20T23:59:00Z"),
      closedAt: null,
    });
    return token;
  }

  test("one address: thirty answers a minute, then one sentence and a wait; another address is still answered", async (t) => {
    clock(t);
    w.reset(seed());
    const token = floodForm("floodaddress");
    const statuses = [];
    for (let i = 0; i < 30; i += 1) statuses.push((await answer({ token, keep: "Again." }, { ip: "203.0.113.9" })).status);
    assert.deepEqual(statuses, Array(30).fill(200));
    const refused = await answer({ token, keep: "Again." }, { ip: "203.0.113.9" });
    assert.deepEqual(short(refused), [429, words.REFUSAL_WORDS.tooMany]);
    assert.ok(Number(refused.headers["Retry-After"]) > 0);
    assert.equal(waiting().length, 30, "the refused answer was kept");
    assert.equal((await answer({ token, keep: "Again." }, { ip: "203.0.113.10" })).status, 200, "another address is held back by the first one's limit");
    // A minute on, the first address is answered again.
    at(t, new Date(NOW.getTime() + 61_000).toISOString());
    assert.equal((await answer({ token, keep: "Again." }, { ip: "203.0.113.9" })).status, 200);
  });

  test("one form: two hundred answers an hour from every address together, then one sentence", async (t) => {
    clock(t);
    w.reset(seed());
    const token = floodForm("floodform");
    let ok = 0;
    for (let i = 0; i < 200; i += 1) if ((await answer({ token, drop: `Flood ${i}.` })).status === 200) ok += 1;
    assert.equal(ok, 200);
    assert.deepEqual(short(await answer({ token, drop: "One more." })), [429, words.REFUSAL_WORDS.tooManyForForm]);
    assert.equal(waiting().length, 200);
    // Another programme's form is not held back by this one's.
    assert.equal((await answer({ token: floodForm("floodother"), keep: "Mine." })).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. The day, and the night's move
// ---------------------------------------------------------------------------

describe("3. the day, never the time, and the night's move", () => {
  test("the day is London's", () => {
    assert.equal(model.dayOf(new Date("2026-12-09T23:30:00Z")), "2026-12-09");
    assert.equal(model.dayOf(new Date("2026-12-10T00:10:00Z")), "2026-12-10");
    // British Summer Time: 23:30 on Sat 24 Oct in UTC is 00:30 on Sun 25 Oct in London.
    assert.equal(model.dayOf(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
  });

  test("a day's answers move once the day is over, into records that hold the same seven fields; today's wait", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    at(t, "2026-12-09T18:00:00Z");
    await answer({ token, keep: "Wednesday’s keep." });
    await answer({ token, change: "Wednesday’s change." });
    at(t, "2026-12-09T23:59:00Z");
    await answer({ token, drop: "Late Wednesday’s drop." });
    at(t, "2026-12-10T00:20:00Z");
    await answer({ token, keep: "Thursday’s keep." });
    // The first tick after midnight moves Wednesday's three, together, and leaves Thursday's.
    const run = await runMove(new Date());
    assert.deepEqual(run, { processed: 3, hasMore: false, note: "3 answers" });
    assert.equal(kept().length, 3);
    for (const record of kept()) {
      assert.deepEqual(Object.keys(record).sort(), EXACT_KEYS);
      assert.equal(record.day, "2026-12-09");
    }
    assert.deepEqual(
      kept().map((record) => record.keep || record.change || record.drop).sort(),
      ["Late Wednesday’s drop.", "Wednesday’s change.", "Wednesday’s keep."],
    );
    assert.deepEqual(waiting().map((record) => [record.day, record.keep]), [["2026-12-10", "Thursday’s keep."]]);
    // Run again the same night: nothing more is due.
    assert.deepEqual(await runMove(new Date()), { processed: 0, hasMore: false, note: "none due" });
    // The next night, Thursday's moves too.
    at(t, "2026-12-11T00:05:00Z");
    assert.equal((await runMove(new Date())).processed, 1);
    assert.deepEqual(waiting(), []);
  });

  test("an answer deleted while the move runs is never written back", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    await answer({ token, keep: "One." });
    await answer({ token, keep: "Two." });
    at(t, "2026-10-30T01:00:00Z");
    const [doomed] = waitingPaths();
    const doomedKeep = w.world.db.read(doomed).keep;
    // Between the move's read and its commit, a run's destroy deletes one.
    w.world.db.beforeCommit = () => {
      w.world.db.collection("anonymousFeedbackWaiting").doc(doomed.split("/")[1]).delete();
    };
    const run = await runMove(new Date());
    assert.equal(run.processed, 1);
    assert.deepEqual(kept().map((record) => record.keep), [doomedKeep === "One." ? "Two." : "One."]);
    assert.deepEqual(waiting(), []);
  });

  test("the job is registered, registers on, and keeps its id", () => {
    assert.equal(anonymousFeedbackMoveJob.id, "anonymous-feedback-move");
    // The registry is read as source: loading it here would load every job.
    const registry = readFileSync(join(REPO_ROOT, "src", "lib", "scheduler", "registry.ts"), "utf8");
    assert.match(registry, /^\s*"anonymous-feedback-move",$/m);
    assert.match(registry, /^\s*anonymousFeedbackMoveJob,$/m);
    assert.match(registry, /return job\.enabledByDefault !== false;/);
    assert.equal("enabledByDefault" in anonymousFeedbackMoveJob, false, "the move waits for somebody to switch it on, while the form says it happens");
  });
});

// ---------------------------------------------------------------------------
// 4. Who reads the answers
// ---------------------------------------------------------------------------

describe("4. the programme's lead and admins read the answers, from the next day, in no order that follows when they came in", () => {
  /** Answers sent on Wed 9 Dec in an order the page must not follow, and one on Thu 10 Dec. */
  async function answered(t) {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    at(t, "2026-12-09T18:00:00Z");
    await answer({ token, keep: "Zebra crossings.", change: "Move the room.", drop: "" });
    at(t, "2026-12-09T18:05:00Z");
    await answer({ token, keep: "apples", change: "", drop: "The quiz." });
    at(t, "2026-12-09T18:10:00Z");
    await answer({ token, keep: "Mango talks.", change: "Bring snacks.", drop: "Long readings." });
    at(t, "2026-12-10T12:00:00Z");
    await answer({ token, keep: "Today’s keep." });
    return after;
  }

  test("the lead sees Wednesday's answers on Thursday, each question's in alphabetical order, with how many, and nothing of today's", async (t) => {
    const after = await answered(t);
    const page = await readersAs("claudia");
    assert.equal(page.to, null, page.to);
    assert.ok(page.text.includes(`${words.READER_WORDS.heading} ${words.READER_WORDS.intro} ${words.READER_WORDS.howShown}`), page.text);
    assert.ok(page.text.includes("3 answers"));
    assert.ok(page.text.includes("What to keep 3 answers apples Mango talks. Zebra crossings."), page.text);
    assert.ok(page.text.includes("What to change 2 answers Bring snacks. Move the room."), page.text);
    assert.ok(page.text.includes("What to drop 2 answers Long readings. The quiz."), page.text);
    assert.ok(!page.text.includes("Today’s keep."), "an answer from today is shown today");
    assert.ok(page.text.includes(`Open until Sun 20 Dec. ${words.READER_WORDS.linkLabel}`));
    assert.match(page.html, new RegExp(`<a href="/feedback/${formOf(after).token}" rel="noreferrer"`));
    // Nothing on the page says when an answer came: not its day, not its time.
    for (const when of ["9 Dec", "Wed 9", "10 Dec", "6pm", "6:05pm", "18:0", "2026-12-0", "2026-12-1"]) {
      assert.ok(!page.html.includes(when), `the page says "${when}"`);
    }
    // The next day it shows Thursday's too, whether or not the night's move has run.
    at(t, "2026-12-11T09:00:00Z");
    assert.ok((await readersAs("claudia")).text.includes("What to keep 4 answers apples Mango talks. Today’s keep. Zebra crossings."));
    await runMove(new Date());
    assert.ok((await readersAs("claudia")).text.includes("What to keep 4 answers apples Mango talks. Today’s keep. Zebra crossings."));
  });

  test("an admin reads them too; nobody else does", async (t) => {
    await answered(t);
    const admin = await readersAs("zach");
    assert.ok(admin.text.includes("What to keep 3 answers"), admin.text);
    const outcomes = {};
    for (const who of ["tess", "lloyd", "yusuf", "rahul", "amara", "nobody", null]) {
      const page = await readersAs(who);
      outcomes[who ?? "signed out"] = page.to ? `sent to ${page.to}` : page.text.includes("There is no programme here") ? "no programme here" : page.text.includes("Only the programme’s lead and admins can read the anonymous answers") ? "the lead's and admins'" : page.text.slice(0, 80);
      assert.ok(!page.text.includes("Zebra crossings."), `${who ?? "signed out"} reads an answer`);
    }
    assert.deepEqual(outcomes, {
      // The lead of another programme, which names a run of its own.
      tess: "no programme here",
      // The programme's reviewer.
      lloyd: "the lead's and admins'",
      // The run's track lead, a facilitator, a member placed on the run, a member on nothing, and somebody signed out.
      yusuf: "sent to /dashboard",
      rahul: "sent to /dashboard",
      amara: "sent to /dashboard",
      nobody: "sent to /dashboard",
      "signed out": "sent to /dashboard",
    });
  });

  test("the lead of another programme reads that programme's own, which has none of AGI Strategy's", async (t) => {
    await answered(t);
    const page = await readersAs("tess", TAIS);
    assert.equal(page.to, null);
    assert.ok(page.text.includes(words.READER_WORDS.none), page.text);
    assert.ok(!page.text.includes("Zebra crossings."));
  });

  test("a view-as session reaches no answer: the admin area is closed while it lasts", () => {
    // The readers' page is under (app)/admin, whose layout draws a notice in
    // place of every page while a view-as marker is live; the layout's own
    // suites hold that. Here: the page is in that tree, and the layout returns
    // before it draws its children.
    const layout = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "layout.tsx"), "utf8");
    const closedAt = layout.indexOf("if (viewingAs) {");
    assert.ok(closedAt !== -1 && closedAt < layout.lastIndexOf("{children}"));
    assert.ok(TABS.startsWith(join("app", "(app)", "admin")));
  });
});

// ---------------------------------------------------------------------------
// 5. What takes them away
// ---------------------------------------------------------------------------

describe("5. what takes them away", () => {
  test("a run's destroy counts the form and its answers, waiting and kept, deletes them, and no other run's; the old link then opens nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const after = await afterSent();
    const token = formOf(after).token;
    await answer({ token, keep: "One." });
    at(t, "2026-10-30T09:00:00Z");
    await runMove(new Date());
    await answer({ token, keep: "Two." });
    // Another programme's answer, on its own run, which nothing here may touch.
    w.world.db.seed("anonymousFeedback/elsewhere", { roundId: ROUND, programmeId: TAIS, runId: RUN.tais, keep: "Elsewhere.", change: "", drop: "", day: "2026-10-29" });
    assert.deepEqual([formPaths().length, waitingPaths().length, keptPaths().length], [1, 1, 2]);
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
    const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
    const db = counting(w.world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.anonymousFeedback, 3, "the form, the answer waiting and the answer kept");
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.anonymousFeedback, 3);
    assert.deepEqual([...formPaths(), ...waitingPaths(), ...keptPaths()], ["anonymousFeedback/elsewhere"]);
    assert.deepEqual(short(await answer({ token, keep: "After." })), [404, words.REFUSAL_WORDS.noForm]);
    assert.ok((await formPage(token)).text.includes("This link doesn’t open a form"));
  });

  test("nothing in an answer can be found by a person's name, so an account's deletion has nothing to remove, and a form's destroy leaves them with the run", () => {
    for (const engine of ["src/lib/firestore/accountDeletion.ts", "src/lib/admissions/destroy.ts"]) {
      const code = readFileSync(join(REPO_ROOT, engine), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.doesNotMatch(code, /anonymousFeedback|ANONYMOUS_/, `${engine} reaches the anonymous form's records`);
    }
    assert.deepEqual([...model.ANSWER_FIELDS].sort(), EXACT_KEYS);
  });
});
