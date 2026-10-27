/**
 * A programme lead's Surveys tab (board sv-programme; Q41, Q49 A; the stage
 * four walk's finding L2) and each survey's results under it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS IT: an admin and the programme's lead. The lead of another
 *     programme and anybody with no role on this one are told there is no
 *     programme here; a reviewer is told it is the lead's and an admin's;
 *     the run's track lead, a facilitator, a member and somebody signed out
 *     never reach it; a view-as session finds the admin area closed. The
 *     tab bar draws it as a link for the first two and not for a reviewer.
 *  2. ONE COUNT EACH: every number on the tab is the one its own page shows,
 *     through that page's reader: each survey's Results, the change view's
 *     pairing, public numbers' count of people considering it, the Results'
 *     Before and now, and the retrospective's source ratings, with its floor.
 *  3. NOTHING ABOUT A PERSON: no name, uid or address of anybody in the
 *     world reaches the tab's HTML or the view behind it, and no row per
 *     person; only the programme's own surveys, once each has gone out,
 *     never a draft, an event's or another programme's; comments in the
 *     order of their words.
 *  4. EACH SURVEY'S RESULTS UNDER IT, for every kind of the programme's own
 *     survey, with no admins' switch, and a sentence for a survey that is no
 *     programme's or another programme's.
 *  5. NOTHING IS WRITTEN by drawing either page.
 *
 * Real: every survey route and page loaded, the programme's pages and tab
 * bar, the retrospective's count, the libraries. Faked: what
 * tests/lib/leavingWorld.mjs fakes. The clock is Tue 17 Nov 2026 at noon in
 * London, week 3 of AGI Strategy's run, which Claudia leads, moved to the
 * day after the survey at the end closes for the end's own checks.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, NOW, PEOPLE, RUN, ROUND, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";
import { TAIS } from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeLeavingWorld("__surveysLeadTab");
const { call, loadTs, world } = w;

const route = async (...parts) => loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const routes = {
  create: await route(),
  open: await route("[surveyId]", "open"),
  send: await route("[surveyId]", "send"),
  test: await route("[surveyId]", "test"),
  answerByLink: await route("answer"),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const pages = {
  tab: (await loadTs(join(TABS, "surveys", "page.tsx"))).default,
  results: (await loadTs(join(TABS, "surveys", "[surveyId]", "page.tsx"))).default,
  adminResults: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "results", "page.tsx"))).default,
};
// The tab bar, on a loader of its own: it asks Next which tab is open, which the leaving world's navigation does not answer.
globalThis.__surveysLeadTabBar = { h: createElement, segment: null };
const { loadTs: loadTabBar } = createLoader({
  stubs: new Map([
    ["next/navigation", "export function useSelectedLayoutSegment() { return globalThis.__surveysLeadTabBar.segment; }"],
    [
      "next/link",
      "export default ({ href, className, children, prefetch, scroll, ...rest }) => globalThis.__surveysLeadTabBar.h('a', { href, className, ...rest }, children);",
    ],
    ["./ProgrammeFrame.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
  ]),
});
const ProgrammeTabs = (await loadTabBar(join("features", "applications", "editor", "ProgrammeTabs.tsx"))).default;
const lib = {
  tab: await loadTs(join("lib", "surveys", "leadTab.ts")),
  adminView: await loadTs(join("lib", "surveys", "adminView.ts")),
  repo: await loadTs(join("lib", "surveys", "repo.ts")),
  numbers: await loadTs(join("lib", "surveys", "publicNumbersLoad.ts")),
  words: await loadTs(join("lib", "surveys", "words.ts")),
  templates: await loadTs(join("lib", "firestore", "courseTemplates.ts")),
  courses: await loadTs(join("lib", "firestore", "courses.ts")),
};
const { LEAD_TAB_WORDS, LEAD_RESULTS_WORDS } = lib.words;
const BASE = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

/** The session getCurrentUser() builds from the stored account, with the reviewer flag the roles writer keeps. */
const sessionFor = (uid) => {
  const base = w.sessionOf(uid);
  return base ? { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true } : null;
};

/**
 * A page as `who` draws it: its HTML and words, or where it sent them, and
 * whether drawing it wrote anything. Pages are handed the course routes' view
 * of the store, as the journeys draw them: the tab's ratings are read with a
 * limit, as the retrospective's are.
 */
async function draw(Page, who, params) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  const before = w.everything();
  try {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) }));
    return { html, text: textOf(html), to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to, wrote: w.everything() !== before };
    throw err;
  } finally {
    world.course = false;
  }
}
const tabAs = (who, programmeId = AGI) => draw(pages.tab, who, { roundId: ROUND, programmeId });
const resultsAs = (who, surveyId, programmeId = AGI) => draw(pages.results, who, { roundId: ROUND, programmeId, surveyId });

/** True when every part appears in `text`, in this order. */
function inOrder(text, parts) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    assert.ok(at >= 0, `missing, in order: ${JSON.stringify(part)}\nin: ${text.slice(from, from + 700)}`);
    from = at + part.length;
  }
}

const at = (when) => mock.timers.setTime(new Date(when).getTime());
const rows = (surveyId) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => world.db.read(path))
    .filter((row) => row.surveyId === surveyId);
const tokenOf = (surveyId, uid) => rows(surveyId).find((row) => row.respondent?.uid === uid)?.token ?? null;
const choice = (optionId) => ({ type: "choice", optionId });
const scale = (value) => ({ type: "scale", value });
const lines = (values) => ({ type: "lines", values });
const words = (text, quote = false) => (quote ? { type: "text", text, quote: true } : { type: "text", text });

/** An admin makes a survey of the programme's, tests it and sends it to everybody it reaches; answers its id. */
async function sent(body) {
  const made = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, ...body } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  const tested = await call("zach", routes.test.POST, { surveyId: id }, { body: { email: "survey" } });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  const counted = await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: 0 } });
  const went = await call("zach", routes.send.POST, { surveyId: id }, { body: { to: "everyone", emails: counted.body?.emails ?? -1 } });
  assert.equal(went.status, 200, JSON.stringify(went.body));
  return id;
}

/** One person's answers, by their own link. */
async function answer(surveyId, uid, answers) {
  const answered = await call(null, routes.answerByLink.POST, {}, { body: { token: tokenOf(surveyId, uid), answers } });
  assert.equal(answered.status, 200, `${uid}: ${JSON.stringify(answered.body)}`);
}

/** A progress row with a rating, as the week page writes one. */
function rated(uid, itemId, rating) {
  world.db.seed(`courseProgress/${RUN.agi}__${uid}__${itemId}`, {
    runId: RUN.agi,
    uid,
    weekNumber: Number(itemId.slice(3, 4)),
    itemKind: "material",
    itemId,
    completed: true,
    rating,
    privateNote: `${uid}'s own note, which nobody else reads.`,
    hasPublicComment: false,
  });
}

/** The comments the survey at the end is sent, seven of them, in the order they come in. */
const END_COMMENTS = [
  ["amara", "Zebra crossings near the venue were hard at night."],
  ["dev", "Apples at the socials, please."],
  ["bea", "More time for the case talks."],
  ["kofi", "None. It made my plans clearer."],
  ["farah", "Group work went well."],
  ["freya", "I dropped a module for it."],
  ["yasmin", "Kind facilitators, every week."],
];

/** What the story made, by name. */
const made = {};

/**
 * The term, once: the before survey sent and answered; the survey at the end
 * sent and answered, then closed; a leaving survey opened and answered by
 * somebody who leaves; a follow-up made and never sent; another programme's
 * survey and a survey after an event; and the sources rated on the week pages.
 */
async function tellTheStory() {
  w.reset();
  at(NOW);
  // Four more of the run's people hold their place through the form, as Amara does, so the surveys reach eight.
  const application = world.db.read(`admissionApplications/${ROUND}__amara`);
  const decision = world.db.read(`admissionDecisions/${ROUND}__amara`);
  for (const uid of ["farah", "kofi", "freya", "yasmin"]) {
    world.db.seed(`admissionApplications/${ROUND}__${uid}`, { ...application, uid, email: `${uid}@example.com`, displayName: PEOPLE[uid][0] });
    world.db.seed(`admissionDecisions/${ROUND}__${uid}`, { ...decision, uid });
  }
  made.before = await sent({ stage: "before", closesOn: "2026-11-24" });
  await answer(made.before, "amara", { q_c1: choice("o_stage1"), q_c4: scale(2), q_p6: words("Meet people who think about this.") });
  await answer(made.before, "dev", { q_c1: choice("o_stage0"), q_c4: scale(3) });
  await answer(made.before, "bea", { q_c1: choice("o_stage2"), q_c4: scale(3) });
  await answer(made.before, "tariq", { q_c1: choice("o_stage3") });
  await answer(made.before, "farah", { q_c4: scale(4) });

  at("2026-11-18T10:00:00Z");
  made.after = await sent({ stage: "after", closesOn: "2026-12-13" });
  const end = {
    amara: { q_c1: choice("o_stage3"), q_c4: scale(5), q_q1: scale(9), q_q2: lines({ l_sessions: 5, l_facilitator: 4 }), q_q3: scale(4) },
    dev: { q_c1: choice("o_stage2"), q_c4: scale(4), q_q1: scale(7), q_q2: lines({ l_sessions: 3, l_facilitator: 5 }), q_q3: scale(3) },
    bea: { q_c1: choice("o_stage2"), q_c4: scale(3), q_q1: scale(10), q_q3: scale(5) },
    kofi: { q_c1: choice("o_stage4"), q_q1: scale(6) },
    farah: { q_c4: scale(6), q_q2: lines({ l_facilitator: 2 }) },
    freya: {},
    yasmin: {},
  };
  for (const [uid, text] of END_COMMENTS) await answer(made.after, uid, { ...end[uid], q_a5: words(text) });

  made.leaving = (await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving" } })).body.survey.id;
  assert.equal((await call("zach", routes.open.POST, { surveyId: made.leaving }, { body: {} })).status, 200);
  assert.equal((await w.leave("hamza")).status, 200);
  await answer(made.leaving, "hamza", { q_leave_stay: words("Shorter readings in the busy weeks.") });

  // A follow-up made and never sent: a draft, whose words can still change.
  const draft = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "followUp6", closesOn: "2027-06-01" } });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  made.draft = draft.body.survey.id;
  // Another programme's survey, sent: AGI Strategy's before survey as Technical
  // AI Safety's (its run has no dated sessions here, so none could be made by
  // the route), and a survey after an event. Neither is this programme's.
  made.other = "tais-before";
  const agiBefore = world.db.read(`surveys/${made.before}`);
  world.db.seed(`surveys/${made.other}`, {
    ...agiBefore,
    name: "Technical AI Safety: before",
    programmeName: "Technical AI Safety",
    audience: { kind: "programme", roundId: ROUND, programmeId: TAIS },
    runId: RUN.tais,
  });
  const night = await call("zach", routes.create.POST, {}, { body: { template: "event", eventId: "pizza", audience: "came", closesOn: "2026-11-26" } });
  assert.equal(night.status, 200, JSON.stringify(night.body));
  made.night = night.body.survey.id;

  // The sources people rated: three each on three readings and on week 4's,
  // and two on week 1's slides, which stay below the retrospective's floor.
  for (const [uid, rating] of [["bea", 5], ["tariq", 3]]) rated(uid, "m_w1_reading", rating);
  for (const [uid, rating] of [["farah", 3], ["kofi", 4]]) rated(uid, "m_w2_reading", rating);
  for (const [uid, rating] of [["amara", 5], ["dev", 5], ["bea", 4], ["tariq", 5]]) rated(uid, "m_w3_reading", rating);
  for (const [uid, rating] of [["amara", 1], ["dev", 2], ["bea", 2]]) rated(uid, "m_w4_reading", rating);
  for (const [uid, rating] of [["amara", 5], ["dev", 5]]) rated(uid, "m_w1_slides", rating);

  // The day after the survey at the end closes.
  at("2026-12-14T12:00:00Z");
}

before(tellTheStory);

/** Every person of the world: their uid, their name and their address. */
function everybody() {
  return world.db
    .paths()
    .filter((path) => path.startsWith("users/"))
    .map((path) => {
      const account = world.db.read(path);
      return { uid: path.slice("users/".length), name: account.displayName, email: account.email };
    });
}

/**
 * Asserts nothing of anybody in the world is in `said`: no uid as a word, no
 * name and no address. The uid "nobody" is an English word the pages may use,
 * so only its name and address are looked for.
 */
function namesNobody(said, where) {
  for (const person of everybody()) {
    if (person.uid !== "nobody") assert.doesNotMatch(said, new RegExp(`\\b${person.uid}\\b`), `${where} holds ${person.uid}'s uid`);
    for (const it of [person.name, person.email]) if (it) assert.ok(!said.includes(it), `${where} names ${it}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Who opens it
// ---------------------------------------------------------------------------

describe("1. who opens the tab", () => {
  test("an admin and the programme's lead read the same tab", async () => {
    const lead = await tabAs("claudia");
    const admin = await tabAs("zach");
    assert.equal(lead.to, null);
    assert.ok(lead.text.startsWith(`${LEAD_TAB_WORDS.changed} `), lead.text.slice(0, 200));
    assert.equal(admin.text, lead.text);
  });

  test("the lead of another programme is told there is no programme here, and reads only their own programme's surveys there", async () => {
    const tess = await tabAs("tess");
    assert.ok(tess.text.startsWith("There is no programme here"), tess.text);
    assert.ok(!tess.text.includes("AGI Strategy"));
    const own = await tabAs("tess", TAIS);
    assert.equal(own.to, null);
    assert.ok(own.text.includes("Technical AI Safety: before See results"), own.text);
    assert.ok(!own.text.includes("AGI Strategy"), own.text);
  });

  test("a reviewer is told the tab is the lead's and an admin's, and nothing of a survey is read", async () => {
    const lloyd = await tabAs("lloyd");
    assert.equal(lloyd.text, `${LEAD_TAB_WORDS.refusalTitle} ${LEAD_TAB_WORDS.refusalBody} ${LEAD_TAB_WORDS.refusalAction}`);
    assert.ok(lloyd.html.includes(`href="${BASE}/applications"`));
  });

  test("the run's track lead, a facilitator, a member, somebody on nothing and somebody signed out never reach it", async () => {
    for (const who of ["yusuf", "rahul", "sofia", "amara", "nobody", null]) {
      const page = await tabAs(who);
      assert.equal(page.to, "/dashboard", `${who} reached the tab`);
      assert.equal(page.html, "");
    }
  });

  test("a view-as session finds the admin area closed: the tab is under it, and the layout returns before it draws a page", () => {
    const layout = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "layout.tsx"), "utf8");
    const closedAt = layout.indexOf("if (viewingAs) {");
    assert.ok(closedAt !== -1 && closedAt < layout.lastIndexOf("{children}"), "the admin layout draws its pages during a view-as session");
    assert.ok(TABS.startsWith(join("app", "(app)", "admin")));
    // Neither page writes, so the guard on writes has nothing to stop here.
    for (const page of [join(TABS, "surveys", "page.tsx"), join(TABS, "surveys", "[surveyId]", "page.tsx")]) {
      assert.doesNotMatch(readFileSync(join(REPO_ROOT, "src", page), "utf8"), /\.(?:set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/);
    }
  });

  test("the tab bar: Surveys between Messages and Settings, a link for the lead and admins, and not a link for a reviewer", () => {
    const drawn = (open) =>
      renderToStaticMarkup(createElement(ProgrammeTabs, { base: BASE, applications: 5, groups: 4, canEdit: open, groupsOpen: open }));
    globalThis.__surveysLeadTabBar.segment = "surveys";
    assert.match(textOf(drawn(true)), /Attendance Messages Surveys Settings$/);
    assert.match(drawn(true), new RegExp(`<a href="${BASE}/surveys" class="tab tabCurrent" aria-current="page">Surveys</a>`));
    globalThis.__surveysLeadTabBar.segment = null;
    assert.match(drawn(false), /<span class="tab tabPending" aria-disabled="true" title="Not built yet">Surveys<\/span>/);
    assert.ok(!drawn(false).includes(`${BASE}/surveys`));
  });
});

// ---------------------------------------------------------------------------
// 2. One count each
// ---------------------------------------------------------------------------

describe("2. every number is the one its own page shows", () => {
  let view;
  before(async () => {
    view = await lib.tab.leadSurveysTab(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi }, new Date());
  });

  test("the programme's surveys, in the order of the stages, each with its Results' counts", async () => {
    assert.deepEqual(
      view.surveys.map((row) => [row.id, row.name, row.line]),
      [
        [made.before, "AGI Strategy: before", `5 of ${view.surveys[0].of} answered · closed Tue 24 Nov`],
        [made.after, "AGI Strategy: after", `7 of ${view.surveys[1].of} answered · closed Sun 13 Dec`],
        [made.leaving, "AGI Strategy: leaving", "1 of 1 answered · no closing date"],
      ],
    );
    for (const row of view.surveys) {
      const survey = await lib.repo.readSurvey(world.db, row.id);
      const results = await lib.adminView.resultsView(world.db, survey, false);
      assert.deepEqual([row.answers, row.of], [results.answers, results.sent], `${row.name}: its Results count it otherwise`);
      const admins = await draw(pages.adminResults, "zach", { surveyId: row.id });
      assert.ok(admins.text.includes(lib.words.answersRateWords(results.answers, results.sent, results.reach)), row.name);
    }
  });

  test("what changed: answered both by the change view's pairing, considering it by public numbers' count, moving by the Results' Before and now", async () => {
    assert.deepEqual(view.change, {
      surveyId: made.after,
      namesOff: false,
      both: 4,
      considering: { start: 1, end: 3, of: 3, up: 2, same: 1, down: 0 },
      explaining: { before: 3, after: 4.5, max: 7, up: 3, of: 4 },
    });
    // Public numbers' own offer, read by its own loader, says the same.
    const programme = await lib.numbers.loadNumbersProgramme(world.db, ROUND, AGI);
    const offer = await lib.numbers.loadOffer(world.db, programme);
    const figure = (id) => offer.numbers.find((number) => number.id === id)?.figure;
    assert.deepEqual(figure("stage"), { kind: "pair", start: "1 of 3", end: "3 of 3" });
    assert.deepEqual(figure("explain"), { kind: "pair", start: "3.0 out of 7", end: "4.5" });
    // The Results' Before and now for C1 and C4.
    const after = await lib.repo.readSurvey(world.db, made.after);
    const results = await lib.adminView.resultsView(world.db, after, false);
    const change = (id) => results.questions.find((question) => question.id === id).change;
    assert.deepEqual([change("q_c1").up, change("q_c1").same, change("q_c1").down, change("q_c1").both], [2, 1, 0, 3]);
    assert.deepEqual([change("q_c4").before.mean, change("q_c4").after.mean, change("q_c4").up, change("q_c4").both], [3, 4.5, 3, 4]);
  });

  test("how it went, the facilitator line and the comments are the Results', the line moved out of its grid", async () => {
    const after = await lib.repo.readSurvey(world.db, made.after);
    const results = await lib.adminView.resultsView(world.db, after, false, { commentsInOrder: "words" });
    const result = (id) => results.questions.find((question) => question.id === id);
    assert.deepEqual(view.end.howItWent.map((question) => question.id), ["q_q1", "q_q2", "q_q3"]);
    assert.deepEqual(view.end.howItWent[0].rows, result("q_q1").rows);
    assert.equal(view.end.howItWent[0].promoterScore, result("q_q1").promoterScore);
    assert.deepEqual(view.end.howItWent[2].rows, result("q_q3").rows);
    // Q2 without its Facilitator line, which has a section of its own.
    const grid = result("q_q2");
    const facilitatorAt = grid.rows.findIndex((row) => row.label === "Facilitator");
    assert.ok(facilitatorAt >= 0);
    assert.deepEqual(view.end.howItWent[1].rows, grid.rows.filter((_, index) => index !== facilitatorAt));
    assert.deepEqual(view.end.facilitator, { question: "How valuable was each part?", row: grid.rows[facilitatorAt], max: 5, minLabel: "Not valuable", maxLabel: "Very valuable" });
    assert.deepEqual(view.end.facilitator.row.counts, [0, 1, 0, 1, 1]);
    // The written answers, in the order of their words, as the lead's Results list them.
    assert.deepEqual(view.end.comments.map((question) => question.comments), [result("q_a5").comments]);
    assert.deepEqual(result("q_a5").comments, [...END_COMMENTS.map(([, text]) => text)].sort((a, b) => a.localeCompare(b, "en-GB")));
  });

  test("the sources people rated: the retrospective's averages, from three ratings, highest first and the lowest", async () => {
    assert.deepEqual(view.sources, {
      highest: [
        { weekNumber: 3, title: "Week 3 reading", average: 4.75, ratings: 4 },
        { weekNumber: 1, title: "Racing to the precipice", average: 4, ratings: 3 },
        { weekNumber: 2, title: "Week 2 reading", average: 3, ratings: 3 },
      ],
      lowest: [{ weekNumber: 4, title: "Week 4 reading", average: 1.67, ratings: 3 }],
    });
    // The retrospective's own count, handed every progress row of the run and
    // its weeks as its route reads them, says the same of each; week 1's
    // slides have two ratings and no average.
    const weeks = world.db
      .paths()
      .filter((path) => path.startsWith(`courseRuns/${RUN.agi}/weeks/`))
      .map((path) => lib.courses.normalizeCourseWeek(path.split("/").pop(), world.db.read(path)));
    const progress = world.db
      .paths()
      .filter((path) => path.startsWith("courseProgress/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.runId === RUN.agi)
      .map((row) => ({ itemId: row.itemId, rating: typeof row.rating === "number" ? row.rating : null, completed: row.completed === true }));
    const retro = lib.templates.aggregateRetrospective({ weeks, progress, notes: [], enrolledCount: 0 });
    const row = (itemId) => retro.find((material) => material.itemId === itemId);
    assert.deepEqual(
      ["m_w3_reading", "m_w1_reading", "m_w2_reading", "m_w4_reading", "m_w1_slides"].map((itemId) => [row(itemId).avgRating, row(itemId).ratingCount]),
      [[4.75, 4], [4, 3], [3, 3], [1.67, 3], [null, 2]],
    );
    // And its route reads them through the same projection as the tab's reader.
    const retroRoute = readFileSync(join(REPO_ROOT, "src", "app", "api", "courses", "runs", "[runId]", "retrospective", "route.ts"), "utf8");
    const reader = readFileSync(join(REPO_ROOT, "src", "lib", "courses", "sourceRatings.ts"), "utf8");
    for (const code of [retroRoute, reader]) assert.match(code, /\.select\("itemId", "rating", "completed"\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing about a person
// ---------------------------------------------------------------------------

describe("3. nothing about a person, and only the programme's own surveys once each has gone out", () => {
  test("the tab's words, as the board draws them where records hold them", async () => {
    const lead = await tabAs("claudia");
    inOrder(lead.text, [
      "What changed 4 answered both the before and the after. Only they are compared. See before and after",
      "Career plans Considering, planning or already doing it 1 → 3 of 3 2 moved up a stage, 1 stayed, 0 moved down.",
      "Confidence and knowledge Explaining the case that advanced AI could be catastrophic, and the main objections 3.0 → 4.5 out of 7 3 of 4 moved up.",
      "Beliefs about AI What people think about AI Beliefs are reported, never targets: the fellowship doesn’t aim to move them one way. See them at the start and the end",
      "This programme’s surveys Results show as answers come in, never with a name.",
      "AGI Strategy: before See results 5 of",
      "AGI Strategy: after See results 7 of",
      "AGI Strategy: leaving See results 1 of 1 answered · no closing date",
      "Ratings See ratings What each group’s facilitators said about their fellows, and your own ratings of the facilitators.",
      "What to keep, change and drop See answers Answers to the anonymous form the survey at the end links to.",
      "How it went 7 answers How likely are you to recommend this programme to a friend with similar interests? 8.0 Average, out of 10 · 4 answers",
      "0 Not at all likely 0 of 4",
      "10 Extremely likely 1 of 4",
      "How valuable was each part? Averages, from 1 Not valuable to 5 Very valuable. Sessions",
      "Did you get what you wanted from it? 4.0 Average, out of 5 · 3 answers 1 Not at all 0 of 3",
      "The weeks Out of 5 Sources people rated From the ratings on each week’s page: totals, never a name, out of 5. A source shows once 3 people have rated it.",
      "Rated highest Week 3 Week 3 reading 4.8 4 ratings Week 1 Racing to the precipice 4.0 3 ratings Week 2 Week 2 reading 3.0 3 ratings",
      "Rated lowest Week 4 Week 4 reading 1.7 3 ratings",
      "Your facilitators Only you and admins Your facilitators don’t see this. Pass on the gist in your own words, never fellows’ words or the numbers. Facilitator",
      "3 answers Average out of 5, from 1 Not valuable to 5 Very valuable, of “How valuable was each part?” in the survey at the end. Every group’s answers together, not each facilitator’s.",
      "In their words 7 answers Did the programme have any negative effect on you or your plans? 5 of 7",
      "See all 7",
    ]);
    // Q2's grid on How it went has no Facilitator line: it is the facilitators' section's.
    const how = lead.text.slice(lead.text.indexOf("How valuable was each part?"), lead.text.indexOf("Did you get what you wanted"));
    assert.ok(!how.includes("Facilitator"), how);
  });

  test("its links: each survey's results under the programme, Ratings and the anonymous form's answers, and no admins' page", async () => {
    const lead = await tabAs("claudia");
    for (const path of [`surveys/${made.before}`, `surveys/${made.after}`, `surveys/${made.leaving}`, "ratings", "anonymous-feedback"]) {
      assert.ok(lead.html.includes(`href="${BASE}/${path}"`), `the tab does not link ${path}`);
    }
    assert.doesNotMatch(lead.html, /href="\/admin\/surveys/);
  });

  test("no name, uid or address of anybody reaches the tab's HTML or the view behind it", async () => {
    const lead = await tabAs("claudia");
    namesNobody(lead.html, "the tab");
    const view = await lib.tab.leadSurveysTab(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi }, new Date());
    const said = JSON.stringify(view);
    namesNobody(said, "the tab's view");
    // No row per person: nothing in the view is keyed or listed by somebody.
    assert.doesNotMatch(said, /"(?:uid|respondent|email|displayName|who|token)":/);
    // The note each rater keeps is never read, let alone shown.
    assert.ok(!lead.html.includes("own note"));
  });

  test("a draft, another programme's survey and a survey after an event are never on it", async () => {
    const lead = await tabAs("claudia");
    for (const id of [made.draft, made.other, made.night]) {
      assert.ok(!lead.html.includes(id), `the tab shows ${id}`);
    }
    assert.ok(!lead.text.includes("follow-up") && !lead.text.includes("Technical AI Safety") && !lead.text.includes("Pizza"));
  });

  test("the comments shown first are the first five by their words, and the rest wait behind See all", async () => {
    const lead = await tabAs("claudia");
    const sorted = END_COMMENTS.map(([, text]) => text).sort((a, b) => a.localeCompare(b, "en-GB"));
    const shown = lead.html.slice(lead.html.indexOf("In their words"), lead.html.indexOf("<details"));
    const behind = lead.html.slice(lead.html.indexOf("<details"));
    inOrder(textOf(shown), sorted.slice(0, 5));
    for (const text of sorted.slice(5)) {
      assert.ok(!shown.includes(text) && behind.includes(text), text);
    }
  });

  test("before the survey at the end, the tab shows the surveys that have gone out and nothing it cannot yet say", async () => {
    const view = await lib.tab.leadSurveysTab(world.courseDb, { roundId: ROUND, programmeId: TAIS, runId: RUN.tais }, new Date());
    assert.equal(view.change, null);
    assert.equal(view.end, null);
    assert.equal(view.sources, null);
    assert.deepEqual(view.links, { ratings: true, anonymousForm: false });
    const tess = await tabAs("tess", TAIS);
    assert.ok(!tess.text.includes(LEAD_TAB_WORDS.changed) && !tess.text.includes(LEAD_TAB_WORDS.howItWent));
    assert.ok(!tess.html.includes("anonymous-feedback"));
  });
});

// ---------------------------------------------------------------------------
// 4. Each survey's results under the tab
// ---------------------------------------------------------------------------

describe("4. each survey's results, under the tab", () => {
  test("the lead reads the before survey, the survey at the end and the leaving survey, never a name, with no admins' switch", async () => {
    for (const id of [made.before, made.after, made.leaving]) {
      const page = await resultsAs("claudia", id);
      assert.equal(page.to, null);
      assert.ok(page.text.includes(LEAD_RESULTS_WORDS.line), page.text.slice(0, 300));
      assert.ok(!page.text.includes(LEAD_RESULTS_WORDS.notHere));
      namesNobody(page.html, `the results of ${id}`);
      assert.doesNotMatch(page.html, /href="\/admin\/surveys/, "the lead's page links an admins' page");
      assert.ok(!page.text.includes("Leave out before-survey answers"), "the lead's page draws the admins' switch");
    }
    const end = await resultsAs("claudia", made.after);
    inOrder(end.text, [
      "AGI Strategy: after",
      "7 answers from the",
      "Compared, person by person, with AGI Strategy: before (5 answers).",
    ]);
  });

  test("a survey that is no programme's, another programme's, or a draft that does not exist is answered in a sentence", async () => {
    for (const id of [made.night, made.other, "no-such-survey"]) {
      const page = await resultsAs("claudia", id);
      assert.equal(page.text, LEAD_RESULTS_WORDS.notHere, id);
    }
    // Under Tess's own programme, AGI Strategy's survey is not Tess's programme's; under AGI Strategy, Tess has no programme.
    assert.equal((await resultsAs("tess", made.after, TAIS)).text, LEAD_RESULTS_WORDS.notHere);
    assert.ok((await resultsAs("tess", made.after)).text.startsWith("There is no programme here"));
    // A reviewer is told whose results they are; everybody else never reaches them.
    assert.equal((await resultsAs("lloyd", made.after)).text, LEAD_RESULTS_WORDS.notYours);
    for (const who of ["yusuf", "rahul", "amara", null]) assert.equal((await resultsAs(who, made.after)).to, "/dashboard", String(who));
  });
});

// ---------------------------------------------------------------------------
// 5. Nothing is written
// ---------------------------------------------------------------------------

// (Section 6, at the end of the file, takes the names off, so it runs last.)

describe("5. drawing either page writes nothing", () => {
  test("as every kind of caller", async () => {
    for (const who of ["zach", "claudia", "tess", "lloyd", "yusuf", "rahul", "amara", null]) {
      assert.equal((await tabAs(who)).wrote, false, `the tab wrote for ${who}`);
      assert.equal((await resultsAs(who, made.after)).wrote, false, `the results wrote for ${who}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Once names come off (last: it changes the store)
// ---------------------------------------------------------------------------

describe("6. once names come off, nothing pairs, and the tab says why", () => {
  test("What changed says the Results' own sentence, compares nothing, and the totals stay", async () => {
    // As the names-off job leaves them: every answer's person taken off, each survey stamped.
    for (const id of [made.before, made.after]) {
      for (const path of world.db.paths().filter((each) => each.startsWith("surveyAnswers/"))) {
        if (world.db.read(path).surveyId === id) world.db.poke(path, { respondent: null });
      }
      world.db.poke(`surveys/${id}`, { namesOffAt: new Date("2028-12-14T03:00:00Z") });
    }
    const view = await lib.tab.leadSurveysTab(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi }, new Date());
    assert.deepEqual(view.change, { surveyId: made.after, namesOff: true, both: 0, considering: null, explaining: null });
    const lead = await tabAs("claudia");
    assert.ok(lead.text.startsWith(`${LEAD_TAB_WORDS.changed} ${lib.words.RESULT_WORDS.namesOff} ${LEAD_TAB_WORDS.seeBeforeAndAfter}`), lead.text.slice(0, 300));
    assert.ok(!lead.text.includes(LEAD_TAB_WORDS.noneBoth) && !lead.text.includes(LEAD_TAB_WORDS.careerPlans));
    // The totals stay: the survey at the end still counts its seven answers.
    assert.ok(lead.text.includes("AGI Strategy: after See results 7 of"));
    assert.ok(lead.text.includes("How it went 7 answers"));
  });
});
