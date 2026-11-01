/**
 * A WEEK'S CHECK-INS ARE FIXED WHEN IT FIRST SHOWS (docs/surveys.md,
 * "Check-ins at the end of a session"). The scheduler's
 * `surveys-check-in-weeks` job records which check-ins a week of a programme
 * has the first time the week is whole, and the programme's lead reads only
 * weeks so fixed, and only the check-ins each was fixed with.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE JOB: registered on, beside the other jobs that email nobody, and
 *     emailing nobody. It fixes a week once, by whichever tick gets there
 *     first, two ticks at once included; never while a session of the week
 *     can still have a check-in; never a week that has not begun; never a
 *     week of a run being destroyed, or of a run two programmes name.
 *  2. A WEEK NOT FIXED YET shows the lead nothing, on either view, even once
 *     it is whole.
 *  3. A CHECK-IN OPENED FOR A FIXED WEEK LATER (Group C's session, called off
 *     before the week and put back after it was fixed) never joins the week:
 *     the lead's week and the Overview's figures stay exactly as they first
 *     showed. An admin's rows are unchanged, a row each with its Results'
 *     count, and the late one says the week above leaves it out; the lead is
 *     never told.
 *  4. THE RECORD names nobody, and the run's destroy counts it and deletes
 *     it, and no other run's.
 *
 * Real: the job's handler as a tick runs it, the check-in, register, session
 * change and answer routes, the Surveys tab's Overview and Check-ins pages
 * and their readers, the run's destroy. Faked: what tests/lib/leavingWorld.mjs
 * fakes. The world is AGI Strategy's run (`tests/lib/hubAttendanceWorld.mjs`),
 * from Tue 10 Nov 2026 to the night of Wed 18 Nov, the end of its week 3,
 * with each group's own copy of week 3 so a check-in asks about its parts.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";
import { TAIS } from "./lib/applicationsSmallTerm.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeLeavingWorld("__checkInWeeks");
const { call, loadTs, world } = w;

const routes = {
  checkIn: await w.courseRoute("groups", "[groupId]", "check-in"),
  change: await w.courseRoute("groups", "[groupId]", "session", "change"),
  answerByLink: await loadTs(join("app", "api", "surveys", "answer", "route.ts")),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const pages = {
  overview: (await loadTs(join(TABS, "surveys", "page.tsx"))).default,
  checkIns: (await loadTs(join(TABS, "surveys", "check-ins", "page.tsx"))).default,
};
const lib = {
  checkIns: await loadTs(join("lib", "surveys", "checkIns", "leadView.ts")),
  weeks: await loadTs(join("lib", "surveys", "checkIns", "weeks.ts")),
  ids: await loadTs(join("lib", "surveys", "checkIns", "ids.ts")),
  words: await loadTs(join("lib", "surveys", "checkIns", "words.ts")),
  overview: await loadTs(join("lib", "surveys", "leadOverview.ts")),
  adminView: await loadTs(join("lib", "surveys", "adminView.ts")),
  repo: await loadTs(join("lib", "surveys", "repo.ts")),
  attendance: await loadTs(join("lib", "courses", "programmeAttendance.ts")),
  record: await loadTs(join("lib", "firestore", "checkInWeeks.ts")),
  courseDeletion: await loadTs(join("lib", "firestore", "courseDeletion.ts")),
  courses: await loadTs(join("lib", "firestore", "courses.ts")),
};
const { surveyCheckInWeeksJob } = await loadTs(join("lib", "scheduler", "jobs", "surveyCheckInWeeks.ts"));
const { CHECK_INS_TAB_WORDS } = lib.words;

const at = (when) => mock.timers.setTime(new Date(when).getTime());

/**
 * One tick of the job at the clock's now, handed what the tick hands a job,
 * with the course routes' view of the store. It emails nobody.
 */
async function tick() {
  world.course = true;
  const mail = world.mail.length;
  try {
    return await surveyCheckInWeeksJob.handler({
      now: new Date(),
      budget: { remainingMs: () => 20_000, expired: () => false },
      log: () => {},
      policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
      maxPerTick: surveyCheckInWeeksJob.maxPerTick,
      maxLateHours: surveyCheckInWeeksJob.maxLateHours,
    });
  } finally {
    world.course = false;
    assert.equal(world.mail.length, mail, "the job sent an email");
  }
}

/** Every week record in the store, by its path. */
const records = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("checkInWeeks/"))
    .sort();
const recordOf = (weekNumber, runId = RUN.agi) => world.db.read(`checkInWeeks/${runId}__w0${weekNumber}`);

/** The session getCurrentUser() builds from the stored account, with the reviewer flag the roles writer keeps. */
const sessionFor = (uid) => {
  const base = w.sessionOf(uid);
  return base ? { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true } : null;
};

/** A page of the programme's Surveys tab as `who` draws it, and whether drawing it wrote anything. */
async function draw(Page, who, query = {}) {
  world.user = sessionFor(who);
  world.course = true;
  const before = w.everything();
  try {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }), searchParams: Promise.resolve(query) }));
    return { html, text: textOf(html), wrote: w.everything() !== before };
  } finally {
    world.course = false;
  }
}

/** What the Check-ins view is handed for AGI Strategy's run, as its page reads the run, for one viewer, now. */
async function checkInInput(viewer) {
  const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  return { roundId: ROUND, programmeId: AGI, run: records.run, groups: records.groups, weeks: lib.attendance.weeksOf(records), viewer, now: new Date() };
}
const readAs = async (viewer) => lib.checkIns.readProgrammeCheckIns(world.courseDb, await checkInInput(viewer));
const week3 = async (viewer = "lead") => (await readAs(viewer)).weeks.find((week) => week.weekNumber === 3);
const overviewOf = async () =>
  lib.overview.leadSurveysOverview(world.courseDb, { roundId: ROUND, programmeId: AGI, runId: RUN.agi, viewer: "lead" }, new Date(), null);

/** The Overview's check-in figures: its card, its charts' weeks and what was unclear. */
const checkInFigures = (overview) => ({ checkIns: overview.checkIns, weeks: overview.weeks, unclear: overview.unclear });

/** Each group's own copy of week 3, its parts with a reading each, so every check-in asks about the week's parts and its reading. */
function giveGroupsTheirWeek3() {
  const part = (id, title) => ({
    id,
    type: "part",
    title,
    time: "",
    framing: [],
    blocks: [{ id: `${id}-src`, type: "source", kind: "read", lead: "", title: `${title}, a reading`, url: "https://example.com/r", by: "", date: "", time: "", compute: "", note: [] }],
  });
  for (const groupId of [A, B, C, D]) {
    world.db.seed(`courseGroups/${groupId}/weeks/w03`, {
      ...world.db.read(`courseRuns/${RUN.agi}/weeks/w03`),
      blocks: [part("pt-define", "Who decides what AGI means"), part("pt-tests", "Tests before deployment")],
      forkedAt: new Date("2026-10-28T09:00:00Z"),
      forkedByUid: "zach",
    });
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
async function openCheckIn(who, groupId, people, when) {
  at(when);
  const opened = await call(who, routes.checkIn.POST, { groupId }, { body: { session: "w03", people }, course: true });
  assert.equal(opened.status, 200, `${who} opening ${groupId}'s week 3: ${JSON.stringify(opened.body)}`);
  return lib.ids.checkInSurveyId(RUN.agi, groupId, "w03");
}

/** One person's answers, by their own link. */
async function answer(surveyId, uid, answers) {
  const row = world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => world.db.read(path))
    .find((each) => each.surveyId === surveyId && each.respondent?.uid === uid);
  const answered = await call(null, routes.answerByLink.POST, {}, { body: { token: row?.token, answers } });
  assert.equal(answered.status, 200, `${uid}: ${JSON.stringify(answered.body)}`);
}

/** A group's register of week 3, marked by its facilitator through the register's route. */
async function mark(who, groupId, marks, when) {
  at(when);
  const marked = await call(who, w.routes.register.POST, { groupId }, { body: { weekNumber: 3, marks }, course: true });
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
}

/** A press of "Change a session" for Group C's week 3, by an admin, telling nobody. */
async function changeC(kind, when) {
  at(when);
  return call("zach", routes.change.POST, { groupId: C }, {
    body: { week: 3, dateKey: "2026-11-18", kind, reason: "The room is double-booked that afternoon.", tell: false },
    course: true,
  });
}

/** What the story saw, moment by moment. */
const seen = {};
const made = {};

/**
 * Week 3 of AGI Strategy's run (Thu 12 to Wed 18 Nov), as the scheduler ticks
 * through it:
 *
 *  - Tue 10 Nov: Group C's week 3 session (Wed 18 Nov, 1pm) is called off,
 *    keeping pace. The tick that morning fixes week 1, after one that found
 *    the run being destroyed and one that found it named by two programmes.
 *  - Group A's check-in (Thu 12 Nov) and Group D's (Mon 16 Nov) open and are
 *    answered by 3 and 1; a tick fixes week 2 and not week 3.
 *  - Tue 17 Nov: Group B's opens, for 3, and 1 answers. It closes at 11pm,
 *    and with C's session off the week is whole: before the next tick the
 *    lead reads nothing of it; two ticks at once fix it, a, d and b.
 *  - Wed 18 Nov: C's session is put back as usual in the morning, meets at
 *    1pm, and its check-in opens and is answered. It closes at 11pm.
 */
async function story() {
  w.reset();
  giveGroupsTheirWeek3();

  // Tue 10 Nov: week 1 is whole and has begun; week 2's last sessions are still to come.
  at("2026-11-10T10:00:00Z");
  world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
  seen.destroying = await tick();
  world.db.poke(`courseRuns/${RUN.agi}`, { destroying: false });
  const form = world.db.read(`admissionRounds/${ROUND}`);
  world.db.poke(`admissionRounds/${ROUND}`, { programmes: { ...form.programmes, [TAIS]: { ...form.programmes[TAIS], runId: RUN.agi } } });
  seen.twoNaming = await tick();
  world.db.poke(`admissionRounds/${ROUND}`, { programmes: form.programmes });
  seen.recordsBeforeWeek1 = records();
  seen.week1Tick = await tick();
  seen.cancelled = await changeC("cancel", "2026-11-10T10:00:00Z");

  made.a3 = await openCheckIn("sofia", A, 3, "2026-11-12T19:50:00Z");
  await answer(made.a3, "amara", checkInAnswers({ useful: 4, most: "Defining terms first", unclear: ["pt-define"], reading: "all", confident: 4 }));
  await answer(made.a3, "dev", checkInAnswers({ useful: 3, most: "The definitions table", unclear: ["pt-define"], reading: "some", confident: 3 }));
  await answer(made.a3, "bea", checkInAnswers({ useful: 5, most: "A clear week", unclear: ["o_ci_nothing"], reading: "most", confident: 5 }));
  at("2026-11-12T23:30:00Z");
  seen.week2Tick = await tick();
  made.d3 = await openCheckIn("grace", D, 1, "2026-11-16T19:50:00Z");
  await answer(made.d3, "yasmin", checkInAnswers({ useful: 4, most: "Who gets to decide", unclear: ["pt-define"], reading: "most", confident: 4 }));
  at(NOW);
  seen.noonTick = await tick();

  // Tonight Group B meets, and its check-in opens for the three here.
  await mark("rahul", B, [{ uid: "chloe", status: "present" }, { uid: "farah", status: "present" }, { uid: "kofi", status: "late" }], "2026-11-17T19:00:00Z");
  made.b3 = await openCheckIn("rahul", B, 3, "2026-11-17T19:50:00Z");
  await answer(made.b3, "chloe", checkInAnswers({ useful: 5, most: "Arguing both sides", unclear: ["pt-tests"], reading: "all", confident: 4 }));
  at("2026-11-17T21:00:00Z");
  seen.openTick = await tick();
  seen.openRecord = recordOf(3);

  // 11pm: B's check-in has closed by itself, and with C's session off the week is whole. Nothing has fixed it yet.
  at("2026-11-17T23:00:00Z");
  seen.unfixed = {
    lead: await week3("lead"),
    admin: await week3("admin"),
    overview: checkInFigures(await overviewOf()),
    checkInsPage: await draw(pages.checkIns, "claudia"),
    overviewPage: await draw(pages.overview, "claudia"),
  };
  // Two ticks at once: the week is fixed once.
  seen.twoTicks = await Promise.all([tick(), tick()]);
  seen.record = recordOf(3);
  seen.fixed = {
    lead: await week3("lead"),
    leadView: await readAs("lead"),
    adminView: await readAs("admin"),
    overview: checkInFigures(await overviewOf()),
    checkInsPage: await draw(pages.checkIns, "claudia"),
    overviewPage: await draw(pages.overview, "claudia"),
  };
  at("2026-11-17T23:15:00Z");
  seen.againTick = await tick();
  seen.againRecord = recordOf(3);

  // Wed 18 Nov: C's session is put back as usual in the morning.
  seen.restored = await changeC("restore", "2026-11-18T09:00:00Z");
  seen.afterRestore = await week3("lead");
  seen.restoreTick = await tick();

  // C meets at 1pm, and its check-in opens for Hamza, who answers.
  await mark("tom", C, [{ uid: "hamza", status: "present" }], "2026-11-18T14:00:00Z");
  made.c3 = await openCheckIn("tom", C, 1, "2026-11-18T14:50:00Z");
  await answer(made.c3, "hamza", checkInAnswers({ useful: 1, most: "Hearing it from the start", unclear: ["pt-tests"], reading: "none", confident: 1, better: "Meet on the day we were told" }));
  at("2026-11-18T15:30:00Z");
  seen.whileOpen = { lead: await week3("lead"), adminView: await readAs("admin") };

  // 11pm: C's check-in has closed, and the scheduler ticks.
  at("2026-11-18T23:00:00Z");
  seen.lateTick = await tick();
  seen.late = {
    record: recordOf(3),
    lead: await week3("lead"),
    leadView: await readAs("lead"),
    adminView: await readAs("admin"),
    overview: checkInFigures(await overviewOf()),
    checkInsPage: await draw(pages.checkIns, "claudia"),
    adminPage: await draw(pages.checkIns, "zach"),
    overviewPage: await draw(pages.overview, "claudia"),
  };
}

before(story);

// ---------------------------------------------------------------------------
// 1. The job
// ---------------------------------------------------------------------------

describe("1. the job fixes a week once, the first tick it is whole, and nothing else", () => {
  test("it registers on, beside the other jobs that email nobody, and its words say what turning it off does", () => {
    // The registry is read as source: loading it here would load every job.
    const registry = readFileSync(join(REPO_ROOT, "src", "lib", "scheduler", "registry.ts"), "utf8");
    assert.match(registry, /^\s*"surveys-check-in-weeks",$/m);
    assert.match(registry, /^\s*surveyCheckInWeeksJob,$/m);
    assert.equal(surveyCheckInWeeksJob.id, "surveys-check-in-weeks");
    // No default of its own: what no stored switch means is "on", as for every job that emails nobody.
    assert.equal(surveyCheckInWeeksJob.enabledByDefault, undefined);
    const job = readFileSync(join(REPO_ROOT, "src", "lib", "scheduler", "jobs", "surveyCheckInWeeks.ts"), "utf8");
    assert.ok(!/enabledByDefault/.test(job), "the job now waits for somebody to switch it on, and leads would see no week until then");
    assert.ok(!/from "@\/lib\/(?:email|push)\//.test(job), "the job reaches a send door");
    assert.match(surveyCheckInWeeksJob.description, /Emails nobody\. Turning it off stops new weeks of check-ins showing to programme leads until it is on again\.$/);
    assert.doesNotMatch(`${surveyCheckInWeeksJob.label} ${surveyCheckInWeeksJob.description}`, /[–—]/);
  });

  test("it fixes each week the first tick at which the week is whole and has begun: week 1 on Tue 10 Nov, week 2 that Thursday night, week 3 once B's check-in closed", () => {
    assert.deepEqual(seen.recordsBeforeWeek1, [], "a week was fixed by a tick that should have left the run alone");
    assert.equal(seen.week1Tick.processed, 1);
    assert.deepEqual(recordOf(1).surveyIds, [], "week 1 had no check-in, and is fixed with none");
    assert.equal(seen.week2Tick.processed, 1);
    assert.deepEqual(recordOf(2).surveyIds, []);
    // Week 3 is not whole while a session of it is still to come, nor while one of its check-ins is open.
    assert.equal(seen.noonTick.processed, 0);
    assert.equal(seen.openTick.processed, 0);
    assert.equal(seen.openRecord, undefined);
    // Then it is fixed with every group's check-in of the week, all closed, by when each session started.
    assert.deepEqual(seen.record.surveyIds, [made.a3, made.d3, made.b3]);
    assert.deepEqual([seen.record.runId, seen.record.weekNumber], [RUN.agi, 3]);
    assert.ok(seen.record.frozenAt instanceof Date, "the record says when it was fixed");
  });

  test("two ticks at once fix it once, a later tick changes nothing, and a check-in opened for it afterwards is never added", () => {
    assert.deepEqual(seen.twoTicks.map((result) => result.processed).sort(), [0, 1]);
    assert.equal(seen.againTick.processed, 0);
    assert.deepEqual(seen.againRecord, seen.record);
    assert.equal(seen.restoreTick.processed, 0);
    assert.equal(seen.lateTick.processed, 0);
    assert.deepEqual(seen.late.record, seen.record, "a check-in opened for a fixed week joined its record");
    assert.ok(!seen.late.record.surveyIds.includes(made.c3));
  });

  test("it leaves alone a run being destroyed, a run two programmes name, and a week that has not begun", () => {
    // Tue 10 Nov at 10am week 1 was whole: the run being destroyed, and the run named by two programmes, had nothing fixed.
    assert.equal(seen.destroying.processed, 0);
    assert.equal(seen.twoNaming.processed, 0);
    // Technical AI Safety's run has no dated session: none of its weeks has begun, so none is fixed, whole as each is.
    assert.deepEqual(records().filter((path) => path.includes(RUN.tais)), []);
    // And AGI Strategy's weeks after week 3 are still to come.
    assert.deepEqual(
      records().filter((path) => path.includes(RUN.agi)),
      [1, 2, 3].map((n) => `checkInWeeks/${RUN.agi}__w0${n}`),
    );
  });

  test("its reading of the run is the tab's: the same groups, sessions and weeks as readRunRecords and weeksOf", async () => {
    const tab = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
    const job = await lib.weeks.readRunWeeks(world.courseDb, RUN.agi);
    assert.deepEqual(job.groups.map((group) => group.id).sort(), tab.groups.map((group) => group.id).sort());
    assert.deepEqual(job.weeks, lib.attendance.weeksOf(tab));
    // The same sessions, whichever order the groups are read in: a week waits on every one of them alike.
    const sessions = (run, groups) => lib.weeks.sessionsOf(run, groups).map((session) => JSON.stringify(session)).sort();
    assert.deepEqual(sessions(job.run, job.groups), sessions(tab.run, tab.groups));
    // A run being destroyed reads as no run at all.
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    try {
      assert.equal(await lib.weeks.readRunWeeks(world.courseDb, RUN.agi), null);
    } finally {
      world.db.poke(`courseRuns/${RUN.agi}`, { destroying: false });
    }
  });

  test("fixing a week reads which check-ins it has and whether any is open, never an answer or who a check-in was sent to", () => {
    const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of [["lib", "surveys", "checkIns", "weeks.ts"], ["lib", "scheduler", "jobs", "surveyCheckInWeeks.ts"], ["lib", "firestore", "checkInWeeks.ts"]]) {
      const code = strip(readFileSync(join(REPO_ROOT, "src", ...file), "utf8"));
      assert.doesNotMatch(code, /\b(?:answersOf|peopleOf)\(|SURVEY_(?:ANSWERS|PEOPLE)_COLLECTION|["'`](?:surveyAnswers|surveyPeople)["'`]/, file.join("/"));
    }
  });

  test("the session's own changes went through their route: called off before the week, put back as usual after it was fixed", () => {
    assert.equal(seen.cancelled.status, 200, JSON.stringify(seen.cancelled.body));
    assert.equal(seen.restored.status, 200, JSON.stringify(seen.restored.body));
  });
});

// ---------------------------------------------------------------------------
// 2. A week not fixed yet
// ---------------------------------------------------------------------------

describe("2. a week not fixed yet shows the lead nothing, whole or not", () => {
  test("whole at 11pm on Tue 17 Nov and not fixed yet: waiting, on the reader, the Check-ins view and the Overview", () => {
    assert.deepEqual(seen.unfixed.lead, { weekNumber: 3, state: "waiting" });
    // An admin reads the lead's weeks too.
    assert.deepEqual(seen.unfixed.admin, { weekNumber: 3, state: "waiting" });
    assert.ok(seen.unfixed.checkInsPage.text.includes(`Week 3 ${CHECK_INS_TAB_WORDS.waiting}`), seen.unfixed.checkInsPage.text);
    assert.ok(seen.unfixed.overviewPage.text.includes("Week 3: not shown yet"));
    assert.equal(seen.unfixed.overview.unclear, null, "a week not fixed is chosen for what was unclear");
    assert.deepEqual(seen.unfixed.overview.checkIns, { answers: 0, weeks: 0 });
    // Nothing anybody wrote about week 3 is on either page.
    for (const page of [seen.unfixed.checkInsPage, seen.unfixed.overviewPage]) {
      for (const said of ["Defining terms first", "Arguing both sides", "Who decides what AGI means"]) assert.ok(!page.text.includes(said), said);
    }
  });

  test("the tick that fixes it shows it, all at once: five answers of seven, and their comments", () => {
    const week = seen.fixed.lead;
    assert.deepEqual([week.state, week.answered, week.of], ["shown", 5, 7]);
    assert.deepEqual(week.comments[0].comments, ["A clear week", "Arguing both sides", "Defining terms first", "The definitions table", "Who gets to decide"]);
    assert.ok(seen.fixed.checkInsPage.text.includes("Week 3 5 of 7 answered"), seen.fixed.checkInsPage.text);
    assert.deepEqual(seen.fixed.overview.checkIns, { answers: 5, weeks: 1 });
    assert.equal(seen.fixed.overview.unclear.chosen, 3);
    // Putting C's session back the next morning did not send the week back to waiting.
    assert.deepEqual(seen.afterRestore, seen.fixed.lead);
  });

  test("drawing the pages wrote nothing, fixed or not: only the job fixes a week", () => {
    for (const page of [seen.unfixed.checkInsPage, seen.unfixed.overviewPage, seen.fixed.checkInsPage, seen.fixed.overviewPage, seen.late.checkInsPage, seen.late.adminPage, seen.late.overviewPage]) {
      assert.equal(page.wrote, false);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. A check-in opened for a fixed week later
// ---------------------------------------------------------------------------

describe("3. a check-in opened for a week after it was fixed never joins it", () => {
  test("the lead's week is exactly as it first showed, open or closed, and nothing Hamza said is in it", () => {
    assert.deepEqual(seen.whileOpen.lead, seen.fixed.lead);
    assert.deepEqual(seen.late.lead, seen.fixed.lead);
    assert.deepEqual(seen.late.leadView.weeks, seen.fixed.leadView.weeks);
    assert.deepEqual(seen.late.leadView.begun, seen.fixed.leadView.begun);
    assert.equal(seen.late.leadView.groups, null, "the lead is handed each group's check-in");
    assert.doesNotMatch(JSON.stringify(seen.late.leadView), /Hearing it from the start|Meet on the day we were told/);
  });

  test("the Overview's figures are the same: its card, both charts and what was unclear", () => {
    assert.deepEqual(seen.late.overview, seen.fixed.overview);
    assert.ok(!seen.late.overviewPage.text.includes("Hearing it from the start"));
  });

  test("the lead's Check-ins view reads as it did, and never says a check-in was left out", () => {
    assert.equal(seen.late.checkInsPage.text, seen.fixed.checkInsPage.text);
    assert.ok(!seen.late.checkInsPage.text.includes(CHECK_INS_TAB_WORDS.openedAfterWeek));
    assert.ok(!seen.late.checkInsPage.html.includes(made.c3));
    for (const group of ["Group A", "Group B", "Group C", "Group D", A, B, C, D]) assert.ok(!seen.late.checkInsPage.html.includes(group), group);
  });

  test("an admin's rows are unchanged, a row for every group's check-in counted as its Results count it, and the late one says the week above leaves it out", async () => {
    const rows = seen.late.adminView.groups.get(3);
    assert.deepEqual(
      rows.map((row) => [row.id, row.groupName, row.open, row.answered, row.of, row.openedAfterWeek]),
      [
        [made.a3, "Group A", false, 3, 3, false],
        [made.d3, "Group D", false, 1, 1, false],
        [made.b3, "Group B", false, 1, 3, false],
        [made.c3, "Group C", false, 1, 1, true],
      ],
    );
    for (const row of rows) {
      const results = await lib.adminView.resultsView(world.db, await lib.repo.readSurvey(world.db, row.id), false);
      assert.deepEqual([row.answered, row.of], [results.answers, results.sent], row.groupName);
    }
    // While it was open, its row said so, and already said the week leaves it out.
    const open = seen.whileOpen.adminView.groups.get(3).find((row) => row.id === made.c3);
    assert.deepEqual([open.open, open.openedAfterWeek], [true, true]);
    // An admin reads the same week the lead does.
    assert.deepEqual(seen.late.adminView.weeks, seen.late.leadView.weeks);
    // On the page: the row as every row reads, then the line, with the way to its own pages.
    const page = seen.late.adminPage;
    assert.ok(page.text.includes(`Group C · Wed 18 Nov, 1pm · 1 of 1 answered · Closed ${CHECK_INS_TAB_WORDS.openedAfterWeek}`), page.text);
    assert.equal(page.text.split(CHECK_INS_TAB_WORDS.openedAfterWeek).length, 2, "the line is on more rows than the late one");
    assert.ok(page.html.includes(`href="/admin/surveys/${made.c3}/results"`) && page.html.includes(`href="/admin/surveys/${made.c3}/answered"`));
  });

  test("the line is plain words: no dash, and nothing that marks anybody", () => {
    const said = CHECK_INS_TAB_WORDS.openedAfterWeek;
    assert.doesNotMatch(said, /[–—]/);
    assert.doesNotMatch(said, /\b(?:mark(?:s|ed)?|grades?|scores?)\b/i);
  });
});

// ---------------------------------------------------------------------------
// 4. The record, and what takes it away
// ---------------------------------------------------------------------------

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

describe("4. the record names nobody, and goes with its run", () => {
  test("each record holds the run, the week, the check-ins' ids and when, and nothing about a person", () => {
    for (const path of records()) {
      const stored = world.db.read(path);
      assert.deepEqual(Object.keys(stored).sort(), ["frozenAt", "runId", "surveyIds", "weekNumber"], path);
      for (const id of stored.surveyIds) assert.match(id, /^ci-[0-9a-f]{40}$/, path);
      assert.equal(path, `checkInWeeks/${lib.record.checkInWeekId(stored.runId, stored.weekNumber)}`);
    }
    const all = JSON.stringify(records().map((path) => world.db.read(path)));
    for (const path of world.db.paths().filter((each) => each.startsWith("users/"))) {
      const uid = path.slice("users/".length);
      const account = world.db.read(path);
      assert.doesNotMatch(all, new RegExp(`\\b${uid}\\b`), uid);
      for (const said of [account.displayName, account.email].filter(Boolean)) assert.ok(!all.includes(said), said);
    }
  });

  test("the run's destroy counts its weeks on the dialog and deletes every one, and no other run's (last: it destroys the run)", async () => {
    world.db.seed("checkInWeeks/another-run__w01", { runId: "another-run", weekNumber: 1, surveyIds: [], frozenAt: new Date("2026-11-04T23:15:00Z") });
    // A run with people on it has to be settled before it can be destroyed.
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await lib.courseDeletion.countRunDestroyTargets(db, lib.courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.checkInWeeks, 3);
    const result = await lib.courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.complete, true);
    assert.equal(result.deleted.checkInWeeks, 3);
    assert.deepEqual(records(), ["checkInWeeks/another-run__w01"]);
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`), undefined, "the run itself is gone");
    // The check-ins themselves are surveys, and a run's destroy leaves surveys alone.
    for (const id of Object.values(made)) assert.ok(world.db.read(`surveys/${id}`), id);
    // The dialog names it.
    const dialog = readFileSync(join(REPO_ROOT, "src", "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /checkInWeeks: \{\s*label: "Weeks of check-ins shown to the lead",\s*fate: "destroyed",/);
  });
});
