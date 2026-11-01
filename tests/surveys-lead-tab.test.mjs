/**
 * A programme lead's Surveys tab (board sv-programme; Q41, Q49 A; the stage
 * four walk's finding L2), its views, and each survey's results under it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS IT: an admin and the programme's lead, every view of it. The
 *     lead of another programme and anybody with no role on this one are
 *     told there is no programme here; a reviewer is told it is the lead's
 *     and an admin's, and is shown no views; the run's track lead, a
 *     facilitator, a member and somebody signed out never reach it, the
 *     facilitators' reports among it; a view-as session finds the admin area
 *     closed. The tab bar draws it as a link for the first two and not for a
 *     reviewer, and the row of views draws its six, the one on screen current.
 *  2. ONE COUNT EACH: every number on the tab is the one its own page shows,
 *     through that page's reader: each survey's Results, the change view's
 *     pairing, public numbers' count of people considering it, the Results'
 *     Before and now, and the retrospective's source ratings, with its floor;
 *     the Overview's cards are the views' rows; a week of check-ins is its
 *     check-ins' Results put together; who came is the Attendance tab's
 *     count for the same viewer; the reports are the reports page's.
 *  3. NOTHING ABOUT A PERSON: no name, uid or address of anybody in the
 *     world reaches any view's HTML or the views behind them, and no row per
 *     person; only the programme's own surveys, once each has gone out,
 *     never a draft, an event's or another programme's; comments in the
 *     order of their words.
 *  4. EACH SURVEY'S RESULTS UNDER IT, for every kind of the programme's own
 *     survey, with no admins' switch, and a sentence for a survey that is no
 *     programme's or another programme's.
 *  4b. THE OVERVIEW: its cards, usefulness and reading week by week, what was
 *     unclear in a chosen week with the reports beside it, who came and the
 *     week's reports, nameless, and a week of check-ins only once whole.
 *  4c. THE CHECK-INS VIEW: whole weeks only, totals from three answers and
 *     comments from five, never a group's own figure, and each group's
 *     check-in for an admin alone, with the way to the admins' pages.
 *  5. NOTHING IS WRITTEN by drawing any of the pages.
 *
 * Real: every survey route and page loaded, the check-in and session report
 * routes, the programme's pages and tab bar, the retrospective's count, the
 * register's attendance, the libraries. Faked: what tests/lib/leavingWorld.mjs
 * fakes. The clock is Tue 17 Nov 2026 at noon in London, week 3 of AGI
 * Strategy's run, which Claudia leads, after its groups' check-ins and reports
 * of weeks 1 to 3 as far as they have happened, moved to the day after the
 * survey at the end closes for the end's own checks.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, D, NOW, PEOPLE, RUN, ROUND, makeLeavingWorld, registerPath, textOf } from "./lib/leavingWorld.mjs";
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
  questions: await route("[surveyId]", "questions"),
  answerByLink: await route("answer"),
  checkIn: await w.courseRoute("groups", "[groupId]", "check-in"),
  report: await w.courseRoute("groups", "[groupId]", "session-report"),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const pages = {
  /** The Overview, at the tab's own address. */
  tab: (await loadTs(join(TABS, "surveys", "page.tsx"))).default,
  before: (await loadTs(join(TABS, "surveys", "before", "page.tsx"))).default,
  checkIns: (await loadTs(join(TABS, "surveys", "check-ins", "page.tsx"))).default,
  reports: (await loadTs(join(TABS, "surveys", "reports", "page.tsx"))).default,
  end: (await loadTs(join(TABS, "surveys", "end", "page.tsx"))).default,
  followUps: (await loadTs(join(TABS, "surveys", "follow-ups", "page.tsx"))).default,
  results: (await loadTs(join(TABS, "surveys", "[surveyId]", "page.tsx"))).default,
  adminResults: (await loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "results", "page.tsx"))).default,
};
/** Every view of the tab, by its segment, in the row's order, with its page. */
const VIEWS = [
  ["", pages.tab],
  ["/before", pages.before],
  ["/check-ins", pages.checkIns],
  ["/reports", pages.reports],
  ["/end", pages.end],
  ["/follow-ups", pages.followUps],
];
/** The row of views, as its words read. */
const VIEWS_TEXT = "Overview Before Check-ins Facilitators’ reports End Follow-ups";
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
  overview: await loadTs(join("lib", "surveys", "leadOverview.ts")),
  checkIns: await loadTs(join("lib", "surveys", "checkIns", "leadView.ts")),
  checkInModel: await loadTs(join("lib", "surveys", "checkIns", "model.ts")),
  checkInWords: await loadTs(join("lib", "surveys", "checkIns", "words.ts")),
  checkInIds: await loadTs(join("lib", "surveys", "checkIns", "ids.ts")),
  checkInTemplate: await loadTs(join("lib", "surveys", "checkIns", "template.ts")),
  results: await loadTs(join("lib", "surveys", "results.ts")),
  attendance: await loadTs(join("lib", "courses", "programmeAttendance.ts")),
  attendanceWords: await loadTs(join("lib", "courses", "attendanceWords.ts")),
  reports: await loadTs(join("lib", "courses", "sessionReports", "readers.ts")),
  reportWords: await loadTs(join("lib", "courses", "sessionReports", "words.ts")),
};
const { LEAD_TAB_WORDS, LEAD_RESULTS_WORDS, LEAD_OVERVIEW_WORDS } = lib.words;
const { CHECK_INS_TAB_WORDS } = lib.checkInWords;
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
async function draw(Page, who, params, query = {}) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  const before = w.everything();
  try {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }));
    return { html, text: textOf(html), to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to, wrote: w.everything() !== before };
    throw err;
  } finally {
    world.course = false;
  }
}
/** The Overview, the tab's own address. */
const tabAs = (who, programmeId = AGI, query = {}) => draw(pages.tab, who, { roundId: ROUND, programmeId }, query);
const beforeAs = (who, programmeId = AGI) => draw(pages.before, who, { roundId: ROUND, programmeId });
const checkInsAs = (who, programmeId = AGI) => draw(pages.checkIns, who, { roundId: ROUND, programmeId });
const reportsAs = (who, programmeId = AGI) => draw(pages.reports, who, { roundId: ROUND, programmeId });
const endAs = (who, programmeId = AGI) => draw(pages.end, who, { roundId: ROUND, programmeId });
const followUpsAs = (who, programmeId = AGI) => draw(pages.followUps, who, { roundId: ROUND, programmeId });
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

/**
 * Every question's Required switch turned off in the editor, as an admin may
 * (Zach, 30 Oct 2026: required unless marked optional). The story's people
 * answer only some questions, as answers sent before that rule did, and the
 * tab is read over those gaps; the rule itself is tests/surveys-required.test.mjs's
 * and the answer routes' own.
 */
async function everyQuestionOptional(id, closesOn) {
  const stored = world.db.read(`surveys/${id}`);
  const items = stored.items.map((item) => (item.kind === "question" ? { ...item, optional: true } : item));
  const body = { title: stored.title, intro: stored.intro, minutes: stored.minutes, closesOn, items };
  const saved = await call("zach", routes.questions.POST, { surveyId: id }, { body });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

/** An admin makes a survey of the programme's, tests it and sends it to everybody it reaches; answers its id. */
async function sent(body) {
  const made = await call("zach", routes.create.POST, {}, { body: { roundId: ROUND, programmeId: AGI, ...body } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.survey.id;
  await everyQuestionOptional(id, body.closesOn);
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

/** The day after the survey at the end closes: where the story leaves the clock. */
const END = "2026-12-14T12:00:00Z";

/** A part of a week with something on its path to read, as a pasted week stores it. */
const weekPart = (id, title) => ({
  id,
  type: "part",
  title,
  time: "",
  framing: [],
  blocks: [{ id: `${id}-src`, type: "source", kind: "read", lead: "", title: `${title}, a reading`, url: "https://example.com/r", by: "", date: "", time: "", compute: "", note: [] }],
});

/** The parts of weeks 1 to 3, by their ids, which every group's copy keeps. */
const WEEK_PARTS = {
  1: [["pt-races", "Races between AI developers"], ["pt-power", "Why powerful AI might seek power"]],
  2: [["pt-compute", "Compute as a lever for governance"], ["pt-labs", "What the labs promise"]],
  3: [["pt-define", "Who decides what AGI means"], ["pt-tests", "Tests before deployment"]],
};

/**
 * Each group's own copy of weeks 1 to 3, written as parts with a reading each,
 * so every check-in asks about the week's parts and its reading. Group B's
 * copy words week 1's first part its own way, under the same id. The run's own
 * weeks stay as they are, so the sources people rated are unchanged.
 */
function giveGroupsTheirWeeks() {
  for (const groupId of [A, B, C, D]) {
    for (const [n, parts] of Object.entries(WEEK_PARTS)) {
      const own = parts.map(([id, title]) => weekPart(id, groupId === B && id === "pt-races" ? "Racing to the precipice" : title));
      world.db.seed(`courseGroups/${groupId}/weeks/w0${n}`, {
        ...world.db.read(`courseRuns/${RUN.agi}/weeks/w0${n}`),
        blocks: own,
        forkedAt: new Date("2026-10-28T09:00:00Z"),
        forkedByUid: "zach",
      });
    }
  }
}

/** A check-in's answers: every required question, and what could have gone better when given. */
const checkInAnswers = ({ useful, most, unclear, reading, confident, better }) => ({
  q_ci_useful: { type: "rating", value: useful },
  q_ci_most: { type: "text", text: most },
  ...(better ? { q_ci_better: { type: "text", text: better } } : {}),
  q_ci_unclear: { type: "choices", optionIds: unclear },
  q_ci_reading: { type: "choice", optionId: `o_ci_read_${reading}` },
  q_ci_confident: { type: "rating", value: confident },
});

/** A group's facilitator opens a session's check-in in its last ten minutes, for the people its register marks there; its id. */
async function openCheckIn(who, groupId, session, people, when) {
  at(when);
  const opened = await call(who, routes.checkIn.POST, { groupId }, { body: { session, people }, course: true });
  assert.equal(opened.status, 200, `${who} opening ${groupId}'s ${session}: ${JSON.stringify(opened.body)}`);
  return lib.checkInIds.checkInSurveyId(RUN.agi, groupId, session);
}

/** A facilitator's session report, through its route, that evening. */
async function sendReport(who, groupId, sessionKey, how, unclear, when) {
  at(when);
  const answers = { how, wentWell: "The debate ran well.", didnt: "", unclear, engaged: [], notRead: [], needsHand: [], forLead: "" };
  const sent = await call(who, routes.report.PUT, { groupId }, { body: { sessionKey, answers }, course: true });
  assert.equal(sent.status, 200, `${who}'s report on ${groupId}'s ${sessionKey}: ${JSON.stringify(sent.body)}`);
}

/**
 * The check-ins and reports of weeks 1 to 3, as far as the clock has come
 * (Tue 17 Nov at noon):
 *
 *  - WEEK 1, every group's: Group A's for its 4 here, 3 answering; D's for 2,
 *    both answering; B's for 2, 1 answering; C's for 1, who answers. 7 of 9:
 *    totals and comments. Sofia and Grace report on A's and D's sessions.
 *  - WEEK 2, Group A's alone, for 2, 1 answering: too few for totals. Rahul
 *    reports on B's session.
 *  - WEEK 3, Group A's for 3, all answering, and D's for 1, who answers: 4,
 *    totals and no comments, once B's session tonight and C's tomorrow are past
 *    their check-ins' closing time. Sofia reports on A's session.
 */
async function checkInsAndReports() {
  giveGroupsTheirWeeks();
  made.checkIns = {};
  made.checkIns.a1 = await openCheckIn("sofia", A, "w01", 4, "2026-10-29T19:50:00Z");
  await answer(made.checkIns.a1, "amara", checkInAnswers({ useful: 5, most: "The race game", unclear: ["pt-races"], reading: "all", confident: 4, better: "More time to talk" }));
  await answer(made.checkIns.a1, "dev", checkInAnswers({ useful: 4, most: "Hearing other views", unclear: ["pt-races", "pt-power"], reading: "most", confident: 3 }));
  await answer(made.checkIns.a1, "bea", checkInAnswers({ useful: 3, most: "Comparing the compute numbers", unclear: ["o_ci_nothing"], reading: "some", confident: 3 }));
  await sendReport("sofia", A, "w01", 4, ["pt-races"], "2026-10-29T20:30:00Z");
  made.checkIns.d1 = await openCheckIn("grace", D, "w01", 2, "2026-11-02T19:50:00Z");
  await answer(made.checkIns.d1, "freya", checkInAnswers({ useful: 4, most: "Zoning in on policy", unclear: ["pt-races"], reading: "most", confident: 4 }));
  await answer(made.checkIns.d1, "yasmin", checkInAnswers({ useful: 2, most: "Not much this time", unclear: ["o_ci_else"], reading: "none", confident: 2, better: "Shorter readings" }));
  await sendReport("grace", D, "w01", 5, ["pt-races", "something-else"], "2026-11-02T20:30:00Z");
  made.checkIns.b1 = await openCheckIn("rahul", B, "w01", 2, "2026-11-03T19:50:00Z");
  await answer(made.checkIns.b1, "chloe", checkInAnswers({ useful: 5, most: "Kind facilitators", unclear: ["pt-power"], reading: "all", confident: 5 }));
  made.checkIns.c1 = await openCheckIn("tom", C, "w01", 1, "2026-11-04T14:50:00Z");
  await answer(made.checkIns.c1, "hamza", checkInAnswers({ useful: 3, most: "Being in a room about it", unclear: ["o_ci_nothing"], reading: "some", confident: 2 }));

  made.checkIns.a2 = await openCheckIn("sofia", A, "w02", 2, "2026-11-05T19:50:00Z");
  await answer(made.checkIns.a2, "amara", checkInAnswers({ useful: 4, most: "The labs exercise", unclear: ["pt-compute"], reading: "most", confident: 4 }));
  await sendReport("rahul", B, "w02", 2, [], "2026-11-10T20:30:00Z");

  made.checkIns.a3 = await openCheckIn("sofia", A, "w03", 3, "2026-11-12T19:50:00Z");
  await answer(made.checkIns.a3, "amara", checkInAnswers({ useful: 4, most: "Defining terms first", unclear: ["pt-define"], reading: "all", confident: 4 }));
  await answer(made.checkIns.a3, "dev", checkInAnswers({ useful: 3, most: "The definitions table", unclear: ["pt-define"], reading: "some", confident: 3 }));
  await answer(made.checkIns.a3, "bea", checkInAnswers({ useful: 5, most: "A clear week", unclear: ["o_ci_nothing"], reading: "most", confident: 5 }));
  await sendReport("sofia", A, "w03", 3, ["pt-tests"], "2026-11-12T20:30:00Z");
  made.checkIns.d3 = await openCheckIn("grace", D, "w03", 1, "2026-11-16T19:50:00Z");
  await answer(made.checkIns.d3, "yasmin", checkInAnswers({ useful: 4, most: "Who gets to decide", unclear: ["pt-define"], reading: "most", confident: 4 }));
}

/**
 * The term, once: the before survey sent and answered; the survey at the end
 * sent and answered, then closed; a leaving survey opened and answered by
 * somebody who leaves; a follow-up made and never sent; another programme's
 * survey and a survey after an event; and the sources rated on the week pages.
 */
async function tellTheStory() {
  w.reset();
  await checkInsAndReports();
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
  await everyQuestionOptional(made.leaving, null);
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
  at(END);
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

/** What the Check-ins view is handed for AGI Strategy's run, as its page reads the run, for one viewer, now. */
async function checkInInput(viewer) {
  const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  return {
    roundId: ROUND,
    programmeId: AGI,
    run: records.run,
    groups: records.groups,
    weeks: lib.attendance.weeksOf(records),
    viewer,
    now: new Date(),
  };
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
  test("an admin and the programme's lead read the same tab, view by view, and only an admin each group's check-in", async () => {
    const lead = await tabAs("claudia");
    const admin = await tabAs("zach");
    assert.equal(lead.to, null);
    // The Overview: the row of views, then the cards, the first of them Before.
    assert.ok(lead.text.startsWith(`${VIEWS_TEXT} ${LEAD_OVERVIEW_WORDS.before} 5 of `), lead.text.slice(0, 200));
    assert.equal(admin.text, lead.text);
    // End opens on what changed, as the tab did before it had views.
    const end = await endAs("claudia");
    assert.ok(end.text.startsWith(`${VIEWS_TEXT} ${LEAD_TAB_WORDS.changed} `), end.text.slice(0, 200));
    for (const [segment, Page] of VIEWS) {
      const params = { roundId: ROUND, programmeId: AGI };
      const [asLead, asAdmin] = [await draw(Page, "claudia", params), await draw(Page, "zach", params)];
      assert.equal(asLead.to, null, `the lead was sent away from ${segment || "the Overview"}`);
      assert.ok(asLead.text.startsWith(VIEWS_TEXT), `${segment || "the Overview"} does not draw the views first`);
      if (segment === "/check-ins") {
        // An admin also has each group's check-in; the lead never does.
        assert.ok(asAdmin.text.includes(CHECK_INS_TAB_WORDS.groups) && !asLead.text.includes(CHECK_INS_TAB_WORDS.groups));
        assert.equal(asAdmin.text.replace(/ Each group’s check-in Only admins see these\..*?(?= Week \d| $|$)/gs, ""), asLead.text);
      } else {
        assert.equal(asAdmin.text, asLead.text, `${segment || "the Overview"} differs for an admin`);
      }
    }
  });

  test("the lead of another programme is told there is no programme here, and reads only their own programme's surveys there", async () => {
    for (const [segment, Page] of VIEWS) {
      const tess = await draw(Page, "tess", { roundId: ROUND, programmeId: AGI });
      assert.ok(tess.text.startsWith("There is no programme here"), `${segment}: ${tess.text}`);
      assert.ok(!tess.text.includes("AGI Strategy"));
      const own = await draw(Page, "tess", { roundId: ROUND, programmeId: TAIS });
      assert.equal(own.to, null);
      assert.ok(!own.text.includes("AGI Strategy"), `${segment}: ${own.text}`);
    }
    // Its own survey is on its own Before view.
    assert.ok((await beforeAs("tess", TAIS)).text.includes("Technical AI Safety: before See results"));
  });

  test("a reviewer is told the tab is the lead's and an admin's, is shown none of its views, and nothing of a survey is read", async () => {
    for (const [segment, Page] of VIEWS) {
      const lloyd = await draw(Page, "lloyd", { roundId: ROUND, programmeId: AGI });
      const words = segment === "/reports" ? lib.reportWords.RUN_REPORTS_WORDS : LEAD_TAB_WORDS;
      assert.equal(lloyd.text, `${words.refusalTitle} ${words.refusalBody} ${words.refusalAction}`, segment);
      assert.ok(lloyd.html.includes(`href="${BASE}/applications"`));
      assert.ok(!lloyd.html.includes(`${BASE}/surveys`), `${segment || "the Overview"} shows a reviewer the views`);
    }
  });

  test("the run's track lead, a facilitator, a member, somebody on nothing and somebody signed out never reach it, its facilitators' reports included", async () => {
    for (const [segment, Page] of VIEWS) {
      for (const who of ["yusuf", "rahul", "sofia", "grace", "amara", "nobody", null]) {
        const page = await draw(Page, who, { roundId: ROUND, programmeId: AGI });
        assert.equal(page.to, "/dashboard", `${who} reached ${segment || "the Overview"}`);
        assert.equal(page.html, "");
      }
    }
  });

  test("a view-as session finds the admin area closed: the tab is under it, and the layout returns before it draws a page", () => {
    const layout = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "layout.tsx"), "utf8");
    const closedAt = layout.indexOf("if (viewingAs) {");
    assert.ok(closedAt !== -1 && closedAt < layout.lastIndexOf("{children}"), "the admin layout draws its pages during a view-as session");
    assert.ok(TABS.startsWith(join("app", "(app)", "admin")));
    // No page writes, so the guard on writes has nothing to stop here.
    const surveys = join(TABS, "surveys");
    for (const page of [
      join(surveys, "page.tsx"),
      join(surveys, "before", "page.tsx"),
      join(surveys, "check-ins", "page.tsx"),
      join(surveys, "reports", "page.tsx"),
      join(surveys, "end", "page.tsx"),
      join(surveys, "follow-ups", "page.tsx"),
      join(surveys, "[surveyId]", "page.tsx"),
    ]) {
      assert.doesNotMatch(readFileSync(join(REPO_ROOT, "src", page), "utf8"), /\.(?:set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/);
    }
  });

  test("the row of views: six, in order, each a link under the tab, the one on screen current; a survey's results draw its stage's", async () => {
    const lead = await tabAs("claudia");
    const views = lead.html.slice(lead.html.indexOf("<nav"), lead.html.indexOf("</nav>"));
    const links = [...views.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => [match[1], match[2]]);
    assert.deepEqual(links, [
      [`${BASE}/surveys`, "Overview"],
      [`${BASE}/surveys/before`, "Before"],
      [`${BASE}/surveys/check-ins`, "Check-ins"],
      [`${BASE}/surveys/reports`, "Facilitators’ reports"],
      [`${BASE}/surveys/end`, "End"],
      [`${BASE}/surveys/follow-ups`, "Follow-ups"],
    ]);
    // No view of the team's ratings of written work: they do not exist yet.
    assert.ok(!/Marks|Ratings/.test(textOf(views)));
    // The row of views is the page's first <nav>; the Overview's row of weeks comes after it.
    const current = (html) =>
      [...html.slice(html.indexOf("<nav"), html.indexOf("</nav>")).matchAll(/<a href="([^"]+)"[^>]*aria-current="page"[^>]*>/g)].map((match) => match[1]);
    for (const [segment, Page] of VIEWS) {
      assert.deepEqual(current((await draw(Page, "claudia", { roundId: ROUND, programmeId: AGI })).html), [`${BASE}/surveys${segment}`], segment);
    }
    for (const [id, segment] of [[made.before, "/before"], [made.after, "/end"], [made.leaving, "/end"]]) {
      assert.deepEqual(current((await resultsAs("claudia", id)).html), [`${BASE}/surveys${segment}`], id);
    }
    // A survey that is not the programme's is under no view.
    assert.deepEqual(current((await resultsAs("claudia", made.night)).html), []);
  });

  test("the tab bar: Surveys between Messages and Settings, a link for the lead and admins, and not drawn for a reviewer", () => {
    const drawn = (open) =>
      renderToStaticMarkup(createElement(ProgrammeTabs, { base: BASE, applications: 5, groups: 4, canEdit: open, groupsOpen: open }));
    globalThis.__surveysLeadTabBar.segment = "surveys";
    // CHANGED ON PURPOSE (Zach, Fri 30 Oct): Coursework sits between Attendance and Messages.
    assert.match(textOf(drawn(true)), /Attendance Coursework Messages Surveys Settings$/);
    assert.match(drawn(true), new RegExp(`<a href="${BASE}/surveys" class="tab tabCurrent" aria-current="page">Surveys</a>`));
    globalThis.__surveysLeadTabBar.segment = null;
    // A reviewer's row is Applications alone: no Surveys tab, linked or not.
    assert.equal(textOf(drawn(false)), "Applications 5");
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

  test("A5: the Overview's after survey card counts as the tab's row for it does, and there is none before it goes out", async () => {
    const row = view.surveys.find((survey) => survey.id === made.after);
    assert.ok(row && row.answers > 0, "the tab has a row for the survey at the end");
    const card = await lib.tab.leadAfterSurveyCard(world.courseDb, { roundId: ROUND, programmeId: AGI }, new Date());
    assert.deepEqual(card, {
      heading: "The after survey",
      answered: { count: `${row.answers} of ${row.of}`, rest: "have answered." },
      results: { before: "Results show in ", link: "Surveys", after: " as answers come in, never with a name." },
    });
    // Technical AI Safety's survey at the end has not gone out: no card.
    assert.equal(await lib.tab.leadAfterSurveyCard(world.courseDb, { roundId: ROUND, programmeId: TAIS }, new Date()), null);
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

  test("the Overview's cards are the views' own rows, counted by the same Results", async () => {
    const overview = await lib.overview.leadSurveysOverview(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi, viewer: "lead" }, new Date(), null);
    const row = (kind) => view.surveys.find((survey) => survey.kind === kind) ?? null;
    assert.deepEqual(overview.before, row("before"));
    assert.deepEqual(overview.end, row("after"));
    assert.equal(overview.followUp, null, "a draft follow-up is on a card");
    assert.deepEqual([overview.before.answers, overview.before.of, overview.before.when], [5, row("before").of, "closed Tue 24 Nov"]);
  });

  test("a week of check-ins is its check-ins' Results put together: answers, reach, usefulness, reading, what was unclear and the comments", async () => {
    const checkIns = await lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput("lead"));
    const week = checkIns.weeks.find((each) => each.weekNumber === 1);
    assert.equal(week.state, "shown");
    let answers = 0;
    let sent = 0;
    let usefulSum = 0;
    let usefulOf = 0;
    let readMost = 0;
    let readOf = 0;
    const named = new Map();
    const comments = { q_ci_most: [], q_ci_better: [] };
    for (const id of [made.checkIns.a1, made.checkIns.d1, made.checkIns.b1, made.checkIns.c1]) {
      const results = await lib.adminView.resultsView(world.db, await lib.repo.readSurvey(world.db, id), false);
      const question = (questionId) => results.questions.find((each) => each.id === questionId);
      answers += results.answers;
      sent += results.sent;
      usefulSum += question("q_ci_useful").rows[0].mean * question("q_ci_useful").rows[0].respondents;
      usefulOf += question("q_ci_useful").rows[0].respondents;
      readOf += question("q_ci_reading").respondents;
      readMost += question("q_ci_reading").options.filter((option) => ["Most", "All"].includes(option.label)).reduce((sum, option) => sum + option.count, 0);
      for (const option of question("q_ci_unclear").options) {
        if (option.count > 0 && option.label !== "Nothing was unclear") named.set(option.label, (named.get(option.label) ?? 0) + option.count);
      }
      for (const questionId of Object.keys(comments)) comments[questionId].push(...question(questionId).comments);
    }
    assert.deepEqual([week.answered, week.of], [answers, sent]);
    assert.deepEqual([week.answered, week.of], [7, 9]);
    assert.ok(Math.abs(week.totals.useful - usefulSum / usefulOf) < 1e-9, "usefulness is not the Results' averages put together");
    assert.deepEqual(week.totals.reading, { most: readMost, of: readOf });
    assert.deepEqual(week.totals.reading, { most: 4, of: 7 });
    // A part is one part across groups by its id, worded as the first check-in words it: Group B's own words for it count with it.
    assert.deepEqual(
      week.totals.unclear.map((part) => [part.id, part.label, part.count]),
      [["pt-races", "Races between AI developers", 3], ["pt-power", "Why powerful AI might seek power", 2], ["o_ci_else", "Something else", 1]],
    );
    assert.deepEqual(Object.fromEntries(named), { "Races between AI developers": 3, "Why powerful AI might seek power": 2, "Something else": 1 });
    // The comments are each check-in's Results' own, put together in the order of their words.
    assert.deepEqual(
      week.comments.map((question) => [question.id, question.comments]),
      Object.entries(comments).map(([questionId, list]) => [questionId, [...list].sort((a, b) => a.localeCompare(b, "en-GB"))]),
    );
    // And the facilitators' totals of one check-in are the same count (`tallyOf`), over that check-in alone.
    const a1 = await lib.repo.readSurvey(world.db, made.checkIns.a1);
    const own = lib.checkInModel.totalsOf(a1.items, await lib.repo.answersOf(world.db, a1), 4);
    const alone = lib.checkInModel.tallyOf([{ items: a1.items, answers: await lib.repo.answersOf(world.db, a1) }]);
    assert.deepEqual([own.answered, own.useful, own.readMost], [alone.answered, alone.useful, alone.readMost]);
  });

  test("who came is the Attendance tab's own count, for the same viewer, in its words", async () => {
    const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
    const count = async (viewer) =>
      (await lib.overview.leadSurveysOverview(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi, viewer }, new Date(), null)).came;
    const tab = (isAdmin, from = records) =>
      lib.attendance
        .buildRunAttendance(from, { isAdmin }, new Date())
        .totals.filter((total) => total.percent !== null)
        .map(({ weekNumber, came, of, soFar }) => ({ weekNumber, came, of, soFar }));
    assert.deepEqual(await count("lead"), tab(false));
    assert.deepEqual(await count("admin"), tab(true));
    assert.deepEqual(
      (await count("lead")).map((week) => lib.attendanceWords.cameWords(week.came, week.of, week.soFar)),
      ["11 of 12 came", "7 of 11 came", "4 of 6 came so far"],
    );
    // Una, placed and not told, marked on Group C's week 2 register: an admin's tab counts Una and the lead's does not, and so does each one's Overview.
    const path = registerPath(C, 2);
    const kept = world.db.read(path).records;
    world.db.poke(path, { records: { ...kept, una: "present" } });
    try {
      const fresh = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
      assert.notDeepEqual(tab(true, fresh), tab(false, fresh));
      assert.deepEqual(await count("admin"), tab(true, fresh));
      assert.deepEqual(await count("lead"), tab(false, fresh));
    } finally {
      world.db.poke(path, { records: kept });
    }
    // The Attendance tab says a week's count through the same words.
    const grid = readFileSync(join(REPO_ROOT, "src", "features", "applications", "groups", "ProgrammeAttendance.tsx"), "utf8");
    assert.match(grid, /said: cameWords\(total\.came, total\.of, total\.soFar\)/);
  });

  test("the reports are the reports page's own: each week's count and average, and the sessions held that one is about", async () => {
    const listed = await lib.reports.readRunSessionReports(world.courseDb, RUN.agi);
    const counted = await lib.reports.countRunReportsByWeek(world.courseDb, RUN.agi);
    assert.deepEqual(
      counted.map((week) => [week.weekNumber, week.reports]),
      [...listed].reverse().map((week) => [week.weekNumber, week.reports.length]),
    );
    for (const week of counted) {
      const reports = listed.find((each) => each.weekNumber === week.weekNumber).reports;
      assert.equal(week.how, reports.reduce((sum, report) => sum + report.how, 0) / reports.length, `week ${week.weekNumber}`);
    }
    assert.deepEqual(
      counted.map((week) => [week.weekNumber, week.reports, week.how, week.unclear.map((part) => [part.id, part.count])]),
      [
        [1, 2, 4.5, [["pt-races", 2], ["something-else", 1]]],
        [2, 1, 2, []],
        [3, 1, 3, [["pt-tests", 1]]],
      ],
    );
    // Held and started, every group's session of every week (the Attendance tab's facts), and the four a report is about.
    const overview = await lib.overview.leadSurveysOverview(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi, viewer: "lead" }, new Date(), null);
    assert.deepEqual(overview.reported, { sessions: 4, of: 24 });
    // Nothing a report says or whom it picks is counted: what leaves is numbers and the week's parts.
    assert.doesNotMatch(JSON.stringify(counted), /debate|sofia|grace|rahul|writer|about/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing about a person
// ---------------------------------------------------------------------------

describe("3. nothing about a person, and only the programme's own surveys once each has gone out", () => {
  test("the tab's words, as the board draws them where records hold them", async () => {
    // What the tab drew before it had views is now End's, the before survey's
    // row apart: it is on Before.
    const end = await endAs("claudia");
    inOrder(end.text, [
      "What changed 4 answered both the before and the after. Only they are compared. See before and after",
      "Career plans Considering, planning or already doing it 1 → 3 of 3 2 moved up a stage, 1 stayed, 0 moved down.",
      "Confidence and knowledge Explaining the case that advanced AI could be catastrophic, and the main objections 3.0 → 4.5 out of 7 3 of 4 moved up.",
      "Beliefs about AI What people think about AI Beliefs are reported, never targets: the fellowship doesn’t aim to move them one way. See them at the start and the end",
      "This programme’s surveys Results show as answers come in, never with a name.",
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
    const how = end.text.slice(end.text.indexOf("How valuable was each part?"), end.text.indexOf("Did you get what you wanted"));
    assert.ok(!how.includes("Facilitator"), how);
    // The before survey is on Before, and on no other view.
    const before = await beforeAs("claudia");
    assert.equal(before.text, `${VIEWS_TEXT} This programme’s surveys Results show as answers come in, never with a name. AGI Strategy: before See results 5 of 8 answered · closed Tue 24 Nov`);
    assert.ok(!end.text.includes("AGI Strategy: before"));
    // No follow-up has gone out: Follow-ups says so.
    assert.equal((await followUpsAs("claudia")).text, `${VIEWS_TEXT} This programme’s surveys ${lib.words.LEAD_STAGE_WORDS.followUps}`);
  });

  test("its links: each survey's results under the programme, Ratings and the anonymous form's answers, and no admins' page", async () => {
    const end = await endAs("claudia");
    for (const path of [`surveys/${made.after}`, `surveys/${made.leaving}`, "ratings", "anonymous-feedback"]) {
      assert.ok(end.html.includes(`href="${BASE}/${path}"`), `End does not link ${path}`);
    }
    assert.ok((await beforeAs("claudia")).html.includes(`href="${BASE}/surveys/${made.before}"`), "Before does not link the before survey's results");
    // No view the lead reads links an admins' page.
    for (const [segment, Page] of VIEWS) {
      assert.doesNotMatch((await draw(Page, "claudia", { roundId: ROUND, programmeId: AGI })).html, /href="\/admin\/surveys/, segment || "the Overview");
    }
  });

  test("no name, uid or address of anybody reaches any view's HTML or the views behind them", async () => {
    for (const [segment, Page] of VIEWS) {
      // The facilitators' reports name people by design, on their own page and gate (4c and course-session-reports).
      if (segment === "/reports") continue;
      for (const who of ["claudia", "zach"]) {
        namesNobody((await draw(Page, who, { roundId: ROUND, programmeId: AGI })).html, `${segment || "the Overview"} as ${who}`);
      }
    }
    namesNobody((await tabAs("claudia", AGI, { week: "1" })).html, "the Overview on week 1");
    const programme = { roundId: ROUND, programmeId: AGI, runId: RUN.agi };
    const tab = await lib.tab.leadSurveysTab(world.courseDb, programme, new Date());
    const overview = await lib.overview.leadSurveysOverview(world.courseDb, { ...programme, viewer: "lead" }, new Date(), 1);
    const checkIns = await lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput("lead"));
    for (const [name, view] of [["the tab's view", tab], ["the Overview's", overview], ["the Check-ins view's", { ...checkIns, groups: null }]]) {
      const said = JSON.stringify(view);
      namesNobody(said, name);
      // No row per person: nothing in a view is keyed or listed by somebody.
      assert.doesNotMatch(said, /"(?:uid|respondent|email|displayName|who|token)":/, name);
    }
    // And nothing in the check-ins' or the Overview's is a group's, or a check-in's own.
    for (const [name, view] of [["the Overview's", overview], ["the Check-ins view's", { ...checkIns, groups: null }]]) {
      const said = JSON.stringify(view);
      assert.doesNotMatch(said, /"(?:groupId|groupIds|groupName|surveyId)":/, name);
      assert.doesNotMatch(said, /ci-[0-9a-f]{40}/, `${name} holds a check-in's id`);
      for (const group of ["Group A", "Group B", "Group C", "Group D", A, B, C, D]) assert.ok(!said.includes(group), `${name} holds ${group}`);
    }
    assert.equal(checkIns.groups, null, "the lead is handed each group's check-in");
    // The note each rater keeps is never read, let alone shown.
    assert.ok(!(await endAs("claudia")).html.includes("own note"));
  });

  test("a draft, another programme's survey and a survey after an event are never on it", async () => {
    const draftName = world.db.read(`surveys/${made.draft}`).name;
    assert.ok(draftName);
    for (const [segment, Page] of VIEWS) {
      const lead = await draw(Page, "claudia", { roundId: ROUND, programmeId: AGI });
      for (const id of [made.draft, made.other, made.night]) {
        assert.ok(!lead.html.includes(id), `${segment || "the Overview"} shows ${id}`);
      }
      assert.ok(!lead.text.includes(draftName) && !lead.text.includes("Technical AI Safety") && !lead.text.includes("Pizza"), segment);
      // Follow-ups says no follow-up has gone out; no other view speaks of one.
      if (segment !== "/follow-ups") assert.ok(!lead.text.includes("follow-up"), segment);
    }
  });

  test("the comments shown first are the first five by their words, and the rest wait behind See all", async () => {
    const end = await endAs("claudia");
    const sorted = END_COMMENTS.map(([, text]) => text).sort((a, b) => a.localeCompare(b, "en-GB"));
    const shown = end.html.slice(end.html.indexOf("In their words"), end.html.indexOf("<details"));
    const behind = end.html.slice(end.html.indexOf("<details"));
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
    for (const [segment, Page] of VIEWS) {
      const tess = await draw(Page, "tess", { roundId: ROUND, programmeId: TAIS });
      assert.ok(!tess.text.includes(LEAD_TAB_WORDS.changed) && !tess.text.includes(LEAD_TAB_WORDS.howItWent), segment);
      assert.ok(!tess.html.includes("anonymous-feedback"), segment);
    }
    // End says the survey at the end has not gone out; the Overview's End card says it is not sent yet.
    assert.ok((await endAs("tess", TAIS)).text.includes(lib.words.LEAD_STAGE_WORDS.end));
    assert.ok((await tabAs("tess", TAIS)).text.includes(`${LEAD_OVERVIEW_WORDS.end} ${LEAD_OVERVIEW_WORDS.notSent}`));
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
    // Under the row of views, with none of them current. A check-in is never one the lead reads here: its weeks are on Check-ins.
    for (const id of [made.night, made.other, "no-such-survey", made.checkIns.a1, made.checkIns.a3]) {
      const page = await resultsAs("claudia", id);
      assert.equal(page.text, `${VIEWS_TEXT} ${LEAD_RESULTS_WORDS.notHere}`, id);
    }
    // Under Tess's own programme, AGI Strategy's survey is not Tess's programme's; under AGI Strategy, Tess has no programme.
    assert.equal((await resultsAs("tess", made.after, TAIS)).text, `${VIEWS_TEXT} ${LEAD_RESULTS_WORDS.notHere}`);
    assert.ok((await resultsAs("tess", made.after)).text.startsWith("There is no programme here"));
    // A reviewer is told whose results they are; everybody else never reaches them.
    assert.equal((await resultsAs("lloyd", made.after)).text, LEAD_RESULTS_WORDS.notYours);
    for (const who of ["yusuf", "rahul", "amara", null]) assert.equal((await resultsAs(who, made.after)).to, "/dashboard", String(who));
  });
});

// ---------------------------------------------------------------------------
// 4b. The Overview
// ---------------------------------------------------------------------------

describe("4b. the Overview: cards, the weeks of check-ins, what was unclear with the reports beside it, who came and the week's reports", () => {
  test("its words, nameless, once the programme is over", async () => {
    const lead = await tabAs("claudia");
    inOrder(lead.text, [
      `${VIEWS_TEXT} Before 5 of 8 answered Closed Tue 24 Nov`,
      "Check-ins 12 answers over 3 weeks Every session",
      "Facilitators’ reports 4 of 24 sessions Every session",
      "End 7 of 8 answered Closed Sun 13 Dec",
      "Follow-ups Not sent yet 6 and 12 months on",
      "How useful was the session? Average of 1 to 5",
      "Week 1: 3.7",
      "Week 2: not shown yet",
      "Week 3: 4.0",
      "Week 4: not shown yet",
      "7 and 4 answers. A dot is a week not shown yet: a week shows once every group’s check-in has closed, and from 3 answers.",
      "Did most or all of the reading Share of check-ins",
      "Week 1: 57%",
      "Week 3: 75%",
      "From the check-ins: of everybody asked about the week’s reading, the share who did most or all of it.",
      "What was unclear, week 3 Week 1 Week 3",
      "Who decides what AGI means 3 · 75% 0 of 1 report",
      "Tests before deployment 0 · 0% 1 of 1 report",
      "From the check-ins and facilitators’ reports, without names. Beside each part, whether the week’s one report named it.",
      "Came to the session Week 1 11 of 12 came Week 2 7 of 11 came Week 3 4 of 6 came so far",
      "Facilitators’ reports, week 3 Average 3.0 of 5 for how it went. Read the report",
      LEAD_OVERVIEW_WORDS.footer,
    ]);
    // Each card leads to its view, and the week's reports to that week on the reports page, which has it.
    for (const segment of ["/before", "/check-ins", "/reports", "/end", "/follow-ups"]) {
      assert.ok(lead.html.includes(`href="${BASE}/surveys${segment}"`), segment);
    }
    assert.ok(lead.html.includes(`href="${BASE}/surveys/reports#reports-week-3"`));
    assert.ok((await reportsAs("claudia")).html.includes('id="reports-week-3"'));
    // No group, by its name or its id: a week is every group's together.
    for (const group of ["Group A", "Group B", "Group C", "Group D", A, B, C, D]) assert.ok(!lead.html.includes(group), group);
    // Before the survey at the end goes out, its card says so and when the run's last session is.
    const after = world.db.read(`surveys/${made.after}`);
    world.db.poke(`surveys/${made.after}`, { firstSentAt: null });
    try {
      assert.ok((await tabAs("claudia")).text.includes(`${LEAD_OVERVIEW_WORDS.end} ${LEAD_OVERVIEW_WORDS.notSent} Last session Wed 9 Dec`));
    } finally {
      world.db.poke(`surveys/${made.after}`, { firstSentAt: after.firstSentAt });
    }
    // What the records do not hold yet is not drawn: the share who ticked every reading, the team's ratings, explainers, draft grades.
    for (const never of ["ticked", "team’s ratings", "explainer", "grades", "Senior lead", "Marks"]) assert.ok(!lead.text.includes(never), never);
    // Every bar is the theme's accent, one colour, its figure written beside it.
    const css = readFileSync(join(REPO_ROOT, "src", "features", "surveys", "lead", "analysis.module.css"), "utf8");
    for (const rule of [".columnFill", ".fill"]) {
      const body = new RegExp(`\\${rule}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      assert.match(body, /background: var\(--color-accent\);/, rule);
    }
    assert.match(css, /@media \(max-width: 48rem\)/);
  });

  test("a chosen week: what was unclear and its reports, how many reports named each part, and a week that does not show is never chosen", async () => {
    const week1 = await tabAs("claudia", AGI, { week: "1" });
    inOrder(week1.text, [
      "What was unclear, week 1 Week 1 Week 3",
      "Races between AI developers 3 · 43% 2 of 2 reports",
      "Why powerful AI might seek power 2 · 29% 0 of 2 reports",
      "Something else 1 · 14% 1 of 2 reports",
      "Beside each part, how many of the week’s 2 reports named it.",
      "Facilitators’ reports, week 1 Average 4.5 of 5 for how it went. Read the 2 reports",
    ]);
    assert.ok(week1.html.includes(`href="${BASE}/surveys/reports#reports-week-1"`));
    // The weeks to choose from are the weeks that show, the chosen one current.
    const chooser = week1.html.slice(week1.html.lastIndexOf("<nav"), week1.html.lastIndexOf("</nav>"));
    assert.deepEqual(
      [...chooser.matchAll(/<a href="([^"]+)"[^>]*?(aria-current="page")?>/g)].map((match) => [match[1].replace(BASE, ""), Boolean(match[2])]),
      [["/surveys?week=1", true], ["/surveys?week=3", false]],
    );
    // Week 2 (too few answers) and a week the run never had are never chosen: the latest week that shows is.
    for (const asked of ["2", "9", "0", "nonsense", ""]) {
      assert.ok((await tabAs("claudia", AGI, { week: asked })).text.includes("What was unclear, week 3"), asked);
    }
  });

  test("before any week is whole, and with no run named: the Overview says so and draws nothing it cannot say", async () => {
    // Technical AI Safety's run has no check-ins, reports or registers.
    const tess = await tabAs("tess", TAIS);
    inOrder(tess.text, [
      `${VIEWS_TEXT} Before`,
      `${LEAD_OVERVIEW_WORDS.checkIns} ${LEAD_OVERVIEW_WORDS.noneYet}`,
      LEAD_OVERVIEW_WORDS.noWeekYet,
      LEAD_OVERVIEW_WORDS.unclearNone,
      `${LEAD_OVERVIEW_WORDS.came} ${LEAD_OVERVIEW_WORDS.nobodyMarked}`,
      `${LEAD_OVERVIEW_WORDS.reports} ${LEAD_OVERVIEW_WORDS.noReports}`,
    ]);
    // A programme that names no run: the cards, and the sentence every run view says.
    const form = world.db.read(`admissionRounds/${ROUND}`);
    world.db.poke(`admissionRounds/${ROUND}`, { programmes: { ...form.programmes, [TAIS]: { ...form.programmes[TAIS], runId: null } } });
    try {
      const blank = await tabAs("tess", TAIS);
      assert.ok(blank.text.includes("doesn’t name a course run yet"), blank.text);
      assert.ok(!blank.text.includes(LEAD_OVERVIEW_WORDS.useful) && !blank.text.includes(LEAD_OVERVIEW_WORDS.came));
      assert.ok((await checkInsAs("tess", TAIS)).text.includes("doesn’t name a course run yet"));
    } finally {
      world.db.poke(`admissionRounds/${ROUND}`, { programmes: form.programmes });
    }
  });
});

// ---------------------------------------------------------------------------
// 4c. The Check-ins view
// ---------------------------------------------------------------------------

describe("4c. the Check-ins view: whole weeks, its floors, never a group's own figure, and each group's check-in for an admin", () => {
  test("the floors, on the server: nothing of a week not whole, totals from 3 answers, comments from 5, and a smaller slice from 3 of its own", () => {
    const { COMMENTS_FROM, TOTALS_FROM, leadWeekOf, weekIsWhole } = lib.checkInModel;
    assert.deepEqual([TOTALS_FROM, COMMENTS_FROM], [3, 5]);
    // The words say the same floors.
    for (const said of [LEAD_OVERVIEW_WORDS.dot, LEAD_OVERVIEW_WORDS.noWeekYet, LEAD_OVERVIEW_WORDS.unclearNone]) assert.ok(said.includes(`from ${TOTALS_FROM} answers`), said);
    const items = lib.checkInTemplate.checkInItems({ parts: [{ id: "pt-a", title: "Part A" }], hasReading: true });
    const noReading = lib.checkInTemplate.checkInItems({ parts: [{ id: "pt-a", title: "Part A" }], hasReading: false });
    const one = (useful, most, read = true) => {
      const answers = checkInAnswers({ useful, most, unclear: ["pt-a"], reading: "all", confident: 3 });
      if (!read) delete answers.q_ci_reading;
      return { answers };
    };
    assert.deepEqual(leadWeekOf(2, false, [{ items, answers: [one(5, "e"), one(4, "d"), one(3, "c")], of: 3 }]), { weekNumber: 2, state: "waiting" });
    assert.deepEqual(leadWeekOf(2, true, []), { weekNumber: 2, state: "none" });
    assert.deepEqual(leadWeekOf(2, true, [{ items, answers: [one(5, "e"), one(4, "d")], of: 6 }]), { weekNumber: 2, state: "too-few", answered: 2, of: 6 });
    const three = leadWeekOf(2, true, [{ items, answers: [one(5, "e"), one(4, "d")], of: 2 }, { items, answers: [one(3, "c")], of: 4 }]);
    assert.deepEqual([three.state, three.answered, three.of, three.totals.useful, three.comments], ["shown", 3, 6, 4, null]);
    const five = leadWeekOf(2, true, [{ items, answers: [one(5, "e"), one(4, "d"), one(3, "c")], of: 3 }, { items, answers: [one(2, "b"), one(1, "a")], of: 2 }]);
    assert.deepEqual(five.comments, [
      { id: "q_ci_most", title: "What was the most useful thing?", comments: ["a", "b", "c", "d", "e"] },
      { id: "q_ci_better", title: "What could have gone better?", comments: [] },
    ]);
    // The reading question asked of two people only: the week shows, and its share does not.
    const sliced = leadWeekOf(2, true, [{ items, answers: [one(5, "e"), one(4, "d")], of: 2 }, { items: noReading, answers: [one(3, "c", false), one(2, "b", false)], of: 2 }]);
    assert.deepEqual([sliced.state, sliced.totals.reading], ["shown", null]);
    // Whole: every session of the week past its check-in's closing time, and none of its check-ins open.
    const session = { weekNumber: 3, cancelled: false, dateKey: "2026-11-18", startsAt: new Date("2026-11-18T13:00:00Z"), endsAt: new Date("2026-11-18T15:00:00Z") };
    const closes = new Date("2026-11-18T23:00:00Z");
    assert.equal(weekIsWhole(3, [session], [], new Date(closes.getTime() - 1)), false);
    assert.equal(weekIsWhole(3, [session], [], closes), true);
    assert.equal(weekIsWhole(3, [session], [{ weekNumber: 3, open: true }], new Date("2026-11-20T12:00:00Z")), false, "an open check-in keeps its week waiting");
    assert.equal(weekIsWhole(3, [{ ...session, cancelled: true }], [], new Date(closes.getTime() - 1)), true, "a session called off has no check-in to wait for");
    assert.equal(weekIsWhole(3, [{ ...session, dateKey: "", startsAt: null, endsAt: null }], [], new Date(0)), true, "a session with no date has none either");
  });

  test("its words for the lead, week by week, newest first, the comments in the order of their words, never a group", async () => {
    const lead = await checkInsAs("claudia");
    inOrder(lead.text, [
      `${VIEWS_TEXT} ${lib.checkInWords.checkInsTabLine(3, 5)}`,
      "Week 6 No group opened a check-in this week.",
      "Week 3 4 of 4 answered Useful 4.0 of 5 Confident 4.0 of 5 Did most or all of the reading 3 of 4 · 75%",
      "What was unclear Who decides what AGI means 3 · 75%",
      "In their words Comments show from 5 answers, so nobody can be worked out.",
      "Week 2 1 of 2 answered. Totals show from 3, so nobody can be worked out.",
      "Week 1 7 of 9 answered Useful 3.7 of 5 Confident 3.3 of 5 Did most or all of the reading 4 of 7 · 57%",
      "What was unclear Races between AI developers 3 · 43% Why powerful AI might seek power 2 · 29% Something else 1 · 14%",
      "In their words What was the most useful thing? 5 of 7",
      "See all 7",
      "What could have gone better? 2 of 2 More time to talk Shorter readings",
    ]);
    const most = ["The race game", "Hearing other views", "Comparing the compute numbers", "Zoning in on policy", "Not much this time", "Kind facilitators", "Being in a room about it"];
    inOrder(lead.text.slice(lead.text.indexOf("Week 1 7 of 9")), [...most].sort((a, b) => a.localeCompare(b, "en-GB")));
    // Week 3's comments are held back: four answers.
    assert.ok(!lead.text.includes("Defining terms first"));
    for (const group of ["Group A", "Group B", "Group C", "Group D", A, B, C, D]) assert.ok(!lead.html.includes(group), group);
    assert.ok(!lead.html.includes("/admin/surveys/"));
    for (const id of Object.values(made.checkIns)) assert.ok(!lead.html.includes(id), id);
  });

  test("an admin also has each group's check-in, a row each, with the way to its Results and Who answered", async () => {
    const admin = await checkInsAs("zach");
    inOrder(admin.text, [
      "Week 3",
      `${CHECK_INS_TAB_WORDS.groups} ${CHECK_INS_TAB_WORDS.groupsLine}`,
      "Group A · Thu 12 Nov, 6pm · 3 of 3 answered · Closed Results Who answered",
      "Group D · Mon 16 Nov, 6pm · 1 of 1 answered · Closed Results Who answered",
      "Week 2",
      "Group A · Thu 5 Nov, 6pm · 1 of 2 answered · Closed",
      "Week 1",
      "Group A · Thu 29 Oct, 6pm · 3 of 4 answered · Closed",
      "Group D · Mon 2 Nov, 6pm · 2 of 2 answered · Closed",
      "Group B · Tue 3 Nov, 6pm · 1 of 2 answered · Closed",
      "Group C · Wed 4 Nov, 1pm · 1 of 1 answered · Closed",
    ]);
    for (const id of Object.values(made.checkIns)) {
      assert.ok(admin.html.includes(`href="/admin/surveys/${id}/results"`) && admin.html.includes(`href="/admin/surveys/${id}/answered"`), id);
    }
    // Each row counts as its check-in's Results: its answers, of the people it reached.
    for (const [id, answered, of] of [[made.checkIns.a1, 3, 4], [made.checkIns.b1, 1, 2], [made.checkIns.a2, 1, 2], [made.checkIns.d3, 1, 1]]) {
      const results = await lib.adminView.resultsView(world.db, await lib.repo.readSurvey(world.db, id), false);
      assert.deepEqual([results.answers, results.sent], [answered, of], id);
    }
    // A group's row, never a person's.
    namesNobody(admin.html, "an admin's Check-ins view");
    // The rows are made for an admin alone.
    const view = await lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput("admin"));
    assert.deepEqual([...view.groups.keys()].sort(), [1, 2, 3]);
    assert.equal((await lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput("lead"))).groups, null);
  });

  test("every file that finds check-ins, by their run, their kind or their ids, is listed with why, so none reads their answers around the floors", () => {
    const SRC = join(REPO_ROOT, "src");
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    walk(SRC);
    assert.ok(files.length > 500, `the walk found only ${files.length} files`);
    const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const finding = files
      .filter((file) => /\b(?:checkInsOfRun|listCheckIns|checkInSurveyId)\(/.test(strip(readFileSync(file, "utf8"))))
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .sort();
    const LISTED = {
      "lib/surveys/repo.ts": "defines the two reads of many: by run and by kind",
      "lib/surveys/checkIns/ids.ts": "defines a check-in's id from its session",
      "lib/surveys/checkIns/open.ts": "opens one, claimed by its id, and writes its rows; reads no answer",
      "lib/surveys/checkIns/close.ts": "closes one by its id; reads no answer",
      "lib/surveys/checkIns/lateMark.ts": "gives somebody marked later a row on the open one, by its id; reads no answer",
      "lib/surveys/checkIns/facilitatorView.ts": "the register's card, behind the register's gate: a count while open, totals from three answers once closed",
      "lib/surveys/checkIns/leadView.ts": "the Surveys tab's reading, behind the tab's gate: a whole week, totals from three answers and comments from five; each group's row for an admin alone",
      "lib/surveys/onePerson.ts": "the admins' page of one person's answers, read once the opening is recorded",
      "app/(app)/admin/(admin-only)/surveys/page.tsx": "the admins' list, one line a programme, behind the admin-only layout; reads no answer",
    };
    assert.deepEqual(finding, Object.keys(LISTED).sort(), "a file finds check-ins and is not listed with why (or a listed one no longer does)");
  });

  test("a week shows once every group's check-in that week has closed, all at once, so no group's answers are had by reading it before and after", async () => {
    const week3 = async (viewer = "lead") =>
      (await lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput(viewer))).weeks.find((week) => week.weekNumber === 3);
    try {
      // Tue 17 Nov at noon: Groups A and D have had week 3's check-in, B meets tonight and C tomorrow.
      at(NOW);
      assert.deepEqual(await week3(), { weekNumber: 3, state: "waiting" });
      let tab = await tabAs("claudia");
      inOrder(tab.text, ["Check-ins 8 answers over 2 weeks", "Week 3: not shown yet", "What was unclear, week 1"]);
      assert.ok(!tab.text.includes("Who decides what AGI means"), "week 3's parts show before the week is whole");
      // One week shows, so there is no week to choose, and asking for week 3 gives week 1.
      assert.ok(!tab.html.includes("?week="), "a row of one week to choose from is drawn");
      assert.ok((await tabAs("claudia", AGI, { week: "3" })).text.includes("What was unclear, week 1"));
      assert.ok((await checkInsAs("claudia")).text.includes(`Week 3 ${CHECK_INS_TAB_WORDS.waiting}`));

      // Tonight Group B's facilitator takes the register and opens its check-in, and one person answers.
      at("2026-11-17T19:00:00Z");
      const marked = await call("rahul", w.routes.register.POST, { groupId: B }, {
        body: { weekNumber: 3, marks: [{ uid: "chloe", status: "present" }, { uid: "farah", status: "present" }, { uid: "kofi", status: "late" }] },
        course: true,
      });
      assert.equal(marked.status, 200, JSON.stringify(marked.body));
      made.checkIns.b3 = await openCheckIn("rahul", B, "w03", 3, "2026-11-17T19:50:00Z");
      await answer(made.checkIns.b3, "chloe", checkInAnswers({ useful: 5, most: "Arguing both sides", unclear: ["pt-tests"], reading: "all", confident: 4 }));
      at("2026-11-17T21:00:00Z");
      assert.deepEqual(await week3(), { weekNumber: 3, state: "waiting" });
      assert.ok((await checkInsAs("zach")).text.includes("Group B · Tue 17 Nov, 6pm · 1 of 3 answered · Open"));
      // It closes by itself at 11pm; Group C's session tomorrow can still have one.
      at("2026-11-17T23:30:00Z");
      assert.deepEqual(await week3(), { weekNumber: 3, state: "waiting" });
      tab = await tabAs("claudia");
      assert.ok(tab.text.includes("Week 3: not shown yet") && !tab.text.includes("Arguing both sides"));

      // Wed 18 Nov at 11pm, Group C's session is past its check-in's closing time: the week shows, whole, five answers and their comments.
      at("2026-11-18T23:00:00Z");
      const whole = await week3();
      assert.deepEqual([whole.state, whole.answered, whole.of], ["shown", 5, 7]);
      assert.deepEqual(whole.comments[0].comments, ["A clear week", "Arguing both sides", "Defining terms first", "The definitions table", "Who gets to decide"]);
      // Its figures are the week's, and nothing in it is a group's: the lead never read a figure of the week before it.
      assert.doesNotMatch(JSON.stringify(whole), /group|Group/);
    } finally {
      at(END);
    }
  });
});

// ---------------------------------------------------------------------------
// 4d. The words
// ---------------------------------------------------------------------------

describe("4d. the words of the views, one by one: counted right, no dash, no pronoun and nothing that marks anybody", () => {
  test("the Overview's and the Check-ins view's sentences, with their slots filled", () => {
    const words = lib.words;
    assert.equal(words.answersOverWeeksWords(139, 3), "139 answers over 3 weeks");
    assert.equal(words.answersOverWeeksWords(1, 1), "1 answer over 1 week");
    assert.equal(words.sessionsReportedWords(31, 33), "31 of 33 sessions");
    assert.equal(words.sessionsReportedWords(0, 1), "0 of 1 session");
    assert.equal(words.weeksAnswersWords([48, 45, 46]), "48, 45 and 46 answers.");
    assert.equal(words.weeksAnswersWords([1]), "1 answer.");
    assert.equal(words.weeksAnswersWords([]), "");
    assert.equal(words.namedShareWords(14, 46), "14 · 30%");
    assert.equal(words.namedShareWords(0, 0), "0 · 0%");
    assert.equal(words.ofReportsWords(3, 10), "3 of 10 reports");
    assert.equal(words.ofReportsWords(0, 1), "0 of 1 report");
    assert.equal(words.besideEachPartWords(10), "Beside each part, how many of the week’s 10 reports named it.");
    assert.equal(words.besideEachPartWords(1), "Beside each part, whether the week’s one report named it.");
    assert.equal(words.cardWhenWords("closed Sun 1 Nov"), "Closed Sun 1 Nov");
    assert.equal(words.lastSessionWords("Wed 9 Dec"), "Last session Wed 9 Dec");
    assert.equal(words.percentWords(33, 46), "72%");
    assert.equal(words.unclearTitleWords(3), "What was unclear, week 3");
    assert.equal(words.reportsWeekTitleWords(3), "Facilitators’ reports, week 3");
    assert.equal(words.reportsAverageWords(4.05), "Average 4.1 of 5 for how it went.");
    assert.equal(words.readReportsWords(10), "Read the 10 reports");
    assert.equal(words.readReportsWords(1), "Read the report");
    assert.equal(words.leadSurveyLineWords(29, 32, new Date("2026-11-04T23:59:00Z"), true), "29 of 32 answered · closed Wed 4 Nov");
    const ci = lib.checkInWords;
    assert.equal(ci.weekTooFewWords(2, 6, 3), "2 of 6 answered. Totals show from 3, so nobody can be worked out.");
    assert.equal(ci.commentsFromWords(5), "Comments show from 5 answers, so nobody can be worked out.");
    assert.equal(ci.readingShareWords(33, 46), "33 of 46 · 72%");
    assert.equal(ci.outOfFive(4.25), "4.3 of 5");
    assert.equal(ci.groupCheckInWords("Group C", new Date("2026-11-18T15:00:00Z")), "Group C · Wed 18 Nov, 3pm");
    assert.equal(ci.groupCheckInWords("Group C", null), "Group C");
    assert.equal(ci.checkInLinkLabel("Who answered", "Group C", 3), "Who answered: Group C, week 3");
    assert.equal(
      ci.checkInsTabLine(3, 5),
      "Every group’s check-ins together, week by week, without names. A week shows once every group’s check-in that week has closed: totals from 3 answers, comments from 5.",
    );
    // The views' own names, in the row's order.
    const views = readFileSync(join(REPO_ROOT, "src", "features", "applications", "surveys", "SurveysViews.tsx"), "utf8");
    assert.deepEqual([...views.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Overview", "Before", "Check-ins", "Facilitators’ reports", "End", "Follow-ups"]);
    // Every file of words or views this tab draws: no dash of either kind, no pronoun guessed, and nothing that marks, grades or scores anybody.
    for (const file of [
      ["lib", "surveys", "words.ts"],
      ["lib", "surveys", "checkIns", "words.ts"],
      ["lib", "courses", "attendanceWords.ts"],
      ["features", "surveys", "lead", "SurveysOverview.tsx"],
      ["features", "surveys", "lead", "CheckInsWeeks.tsx"],
      ["features", "applications", "surveys", "SurveysViews.tsx"],
    ]) {
      const source = readFileSync(join(REPO_ROOT, "src", ...file), "utf8");
      assert.doesNotMatch(source, /[\u2013\u2014]/, `${file.join("/")} carries a dash`);
      assert.doesNotMatch(source, /\b(?:he|she|his|her|him|hers)\b/i, `${file.join("/")} guesses a pronoun`);
    }
    // "Nobody’s marked yet." is the register's own word for taking attendance, as the programme's Overview says it.
    for (const said of [...Object.values(LEAD_OVERVIEW_WORDS), ...Object.values(CHECK_INS_TAB_WORDS)]) {
      if (said === LEAD_OVERVIEW_WORDS.nobodyMarked) continue;
      assert.doesNotMatch(said, /\b(?:mark(?:s|ed)?|grades?|scores?)\b/i, said);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Nothing is written
// ---------------------------------------------------------------------------

// (Section 6, at the end of the file, takes the names off, so it runs last.)

describe("5. drawing any page of the tab writes nothing", () => {
  test("as every kind of caller", async () => {
    for (const who of ["zach", "claudia", "tess", "lloyd", "yusuf", "rahul", "amara", null]) {
      for (const [segment, Page] of VIEWS) {
        assert.equal((await draw(Page, who, { roundId: ROUND, programmeId: AGI })).wrote, false, `${segment || "the Overview"} wrote for ${who}`);
      }
      assert.equal((await tabAs(who, AGI, { week: "1" })).wrote, false, `the Overview on week 1 wrote for ${who}`);
      assert.equal((await resultsAs(who, made.after)).wrote, false, `the results wrote for ${who}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5b. What changed with nothing to compare yet (B2)
// ---------------------------------------------------------------------------

describe("5b. what changed, when people answered both surveys and nobody answered its questions both times", () => {
  test("one line says so, no measure is drawn, and the card takes its own height", async () => {
    // Nobody answered the career plans question (C1) or the confidence one (C4) in the before survey, so the
    // after pairs four people with nothing of theirs to compare. Put back afterwards: the store is shared.
    const kept = [];
    for (const path of world.db.paths().filter((each) => each.startsWith("surveyAnswers/"))) {
      const stored = world.db.read(path);
      if (stored.surveyId !== made.before) continue;
      kept.push([path, stored.answers]);
      const answers = { ...stored.answers };
      delete answers.q_c1;
      delete answers.q_c4;
      world.db.poke(path, { answers });
    }
    assert.ok(kept.length > 0);
    try {
      const view = await lib.tab.leadSurveysTab(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi }, new Date());
      assert.deepEqual(view.change, { surveyId: made.after, namesOff: false, both: 4, considering: null, explaining: null });
      for (const who of ["claudia", "zach"]) {
        const tab = await endAs(who);
        assert.ok(
          tab.text.startsWith(
            `${VIEWS_TEXT} ${LEAD_TAB_WORDS.changed} 4 answered both the before and the after. Only they are compared. ${LEAD_TAB_WORDS.seeBeforeAndAfter} ` +
              "Nobody has answered the questions on career plans or confidence both times yet. Beliefs about AI",
          ),
          `${who}: ${tab.text.slice(0, 300)}`,
        );
        assert.ok(!tab.text.includes(LEAD_TAB_WORDS.careerPlans) && !tab.text.includes(LEAD_TAB_WORDS.confidence), who);
      }
    } finally {
      for (const [path, answers] of kept) world.db.poke(path, { answers });
    }
    // With its rows (above), and without, nothing makes the card grow to the height of the surveys beside it.
    const css = readFileSync(join(REPO_ROOT, "src", "features", "surveys", "lead", "leadSurveys.module.css"), "utf8");
    assert.doesNotMatch(css, /\.main\s*>\s*\.card[^{]*\{[^}]*flex:\s*1/);
    // The line is drawn only then: with rows (the store as section 2 reads it) it is not.
    assert.ok(!(await endAs("claudia")).text.includes(LEAD_TAB_WORDS.noneCompared));
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
    const lead = await endAs("claudia");
    assert.ok(lead.text.startsWith(`${VIEWS_TEXT} ${LEAD_TAB_WORDS.changed} ${lib.words.RESULT_WORDS.namesOff} ${LEAD_TAB_WORDS.seeBeforeAndAfter}`), lead.text.slice(0, 300));
    assert.ok(!lead.text.includes(LEAD_TAB_WORDS.noneBoth) && !lead.text.includes(LEAD_TAB_WORDS.careerPlans));
    // The totals stay: the survey at the end still counts its seven answers.
    assert.ok(lead.text.includes("AGI Strategy: after See results 7 of"));
    assert.ok(lead.text.includes("How it went 7 answers"));
  });
});
