/**
 * STAGE FOUR OF THE COURSE HUB: one term written as block weeks, from week 1
 * opening before groups go out to after the end, as a fellow and as a
 * facilitator who also holds a place in the group they run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The coursework of v20 and v21 was built in pieces, each with suites of its
 * own on sample documents shaped the way that piece expects: the week page
 * for a block week and its counts, week 1's door before groups go out, Start
 * here, written answers and their review, packs, cases and talks, pairs,
 * fill-in boxes, sealed predictions, the survey cards, leaving, who finished
 * and certificates. What none of them sees is the seam between them: a count
 * one page draws and another draws differently, a reader one sentence names
 * and another page does not keep to, a promise a page makes that the next
 * press does not keep. So this file runs ONE term through the real route
 * handlers and pages, on one database, in the order a term runs, and at each
 * stop asserts what Amara (a fellow in Group B) and Bea (who holds a place in
 * Group B and facilitates it beside Rahul and Sofia) are shown:
 *
 *  1. Before groups go out: six weeks pasted by an admin, week 1 marked ready
 *     by the lead, the before survey sent to everybody holding a place; Amara
 *     reads week 1 through its door, ticks and writes, and its card and the
 *     survey's wait on Home; Bea, already a facilitator, writes in week 1 and
 *     reads it back.
 *  2. Publish: its count held to its emails; both of Bea's, and the
 *     placement email that does not name her to herself.
 *  3. Week 1: ticks and reflections, counted alike on the week page, the
 *     programme page and Home; who reads whose reflections; the sealed card;
 *     the before survey answered from its card; a register finished before
 *     next week is ready.
 *  4. Week 2: a written answer sent, opened, given feedback; the lock; who
 *     may give feedback on whose; the one email; who reads private notes.
 *  5. Week 3: next week's email held to the week page; a pack and a case
 *     given out by the draw; a pack ticked; ready for a talk; somebody leaves,
 *     is reached by the leaving survey and answers it from its card.
 *  6. Weeks 4 and 5: a week left undone; the pairs, on the fellow's own page.
 *  7. Week 6: fill-in boxes, the sealed card opened, the survey at the end
 *     answered from its card.
 *  8. After the end: who finished, the ratings and the certificates, a
 *     facilitator who took part among them, their count held to the emails.
 *
 * Where two pieces disagree today the test pins what is so and its comment
 * names the disagreement (W-self, W-work and the rest, as the stage four
 * walk's notes name them), so a change to either piece has to change this
 * file on purpose.
 *
 * Real: every route handler named below, the libraries behind them, the
 * access predicates, the email templates, the week page's server shell and
 * the week page, the programme page and Home's card. Stubbed: what the week
 * blocks page world stubs (`tests/lib/weekBlocksPageWorld.mjs`): the session,
 * the view-as guard, `sendEmail` (which writes down what it was handed), the
 * stylesheets, and the browser's data hooks, each handed what the routes
 * answered. No message leaves this process. The clock is the runner's, set by
 * the story. Every word in the weeks is made up; every address is on
 * example.com or example.org.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, ROUND, RUN, leadSeed } from "./lib/leadWorld.mjs";
import { COURSE } from "./lib/handoverWorld.mjs";
import { makeWeekBlocksPageWorld, textOf, weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";
import { weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";
import { PAIRS_WITH_LAPTOPS, withBeforeYouCome } from "./lib/pairsWorld.mjs";
import { weekSixBlocks } from "./lib/weekSixWorld.mjs";
import { CARD_TEXT } from "./lib/sealedPredictionsWorld.mjs";
import { GLOSSARY_MARKDOWN, START_HERE_MARKDOWN } from "./lib/guideFixture.mjs";

// ---------------------------------------------------------------------------
// The clock: London is on GMT from Sun 25 Oct, so a London hour is the UTC one
// ---------------------------------------------------------------------------

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-26T10:00:00Z") });
// Finishing a register sends next week's email, whose unsubscribe link is signed for real.
process.env.EVENTS_TOKEN_SECRET = "a-test-signing-key-that-is-long-enough-to-pass";
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const w = await makeWeekBlocksPageWorld("__stageFourJourney");
const { world, call, courseRoute, formRoute, loadTs } = w;
const survey = (...parts) => loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const PG = "[programmeId]";
const routes = {
  handOver: await formRoute("programmes", PG, "run", "hand-over"),
  groupsGoOut: await formRoute("programmes", PG, "groups-go-out"),
  rule: await formRoute("programmes", PG, "finishing", "rule"),
  certificates: await formRoute("programmes", PG, "certificates"),
  certificatesTest: await formRoute("programmes", PG, "certificates", "test"),
  allocate: await courseRoute("runs", "[runId]", "allocate"),
  board: await courseRoute("runs", "[runId]", "allocation"),
  publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
  publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
  facilitators: await courseRoute("groups", "[groupId]", "facilitators"),
  blocks: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks"),
  ready: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "ready"),
  guide: await courseRoute("runs", "[runId]", "guide", "[doc]"),
  rubric: await courseRoute("[courseId]", "rubric"),
  card: await courseRoute("[courseId]", "predictions"),
  holderTick: await courseRoute("runs", "[runId]", "week-one", "ticks", "[itemId]"),
  written: await courseRoute("runs", "[runId]", "written-answers", "[answerId]"),
  review: await courseRoute("runs", "[runId]", "written-answers", "[answerId]", "review"),
  packs: await courseRoute("runs", "[runId]", "packs-and-cases", "[blockId]"),
  draw: await courseRoute("groups", "[groupId]", "draw"),
  pairs: await courseRoute("groups", "[groupId]", "pairs"),
  fillIn: await courseRoute("runs", "[runId]", "fill-in-boxes", "[boxId]"),
  fillInBoxes: await courseRoute("runs", "[runId]", "fill-in-boxes"),
  predictions: await courseRoute("runs", "[runId]", "predictions"),
  register: await courseRoute("groups", "[groupId]", "attendance"),
  finish: await courseRoute("groups", "[groupId]", "attendance", "push"),
  enrol: await courseRoute("runs", "[runId]", "enrol"),
  surveyCreate: await survey(),
  surveyTest: await survey("[surveyId]", "test"),
  surveySend: await survey("[surveyId]", "send"),
  surveyOpen: await survey("[surveyId]", "open"),
  surveyAnswer: await survey("answer"),
  openCard: await courseRoute("runs", "[runId]", "predictions", "people", "[uid]"),
  ratings: await courseRoute("groups", "[groupId]", "ratings"),
};
const lib = {
  reader: await loadTs(join("lib", "courses", "weekBlocks", "reader.ts")),
  write: await loadTs(join("lib", "courses", "weekBlocks", "markdownWrite.ts")),
  pairs: await loadTs(join("lib", "courses", "pairs", "model.ts")),
  progress: await loadTs(join("lib", "firestore", "courseProgress.ts")),
  cards: await loadTs(join("lib", "courses", "weekOne", "cards.ts")),
  waiting: await loadTs(join("lib", "surveys", "waiting.ts")),
  queue: await loadTs(join("lib", "courses", "writtenAnswers", "queue.ts")),
  groups: await loadTs(join("lib", "firestore", "courseGroups.ts")),
  facilitatorWords: await loadTs(join("lib", "courses", "facilitatorPageWords.ts")),
};

/** The six made-up weeks, as an admin pastes them: the guide's Markdown with no ids. */
const WEEKS = [
  [1, "Who keeps the lamps", weekOneBlocks("j1", "Before session 1, if you can")],
  [2, "How sure are you?", weekBlocksFor("j2")],
  [3, "How sure are you, again?", weekBlocksFor("j3")],
  [4, "The lamp makers", weekOneBlocks("j4")],
  [5, "Lamps in pairs", withBeforeYouCome(weekOneBlocks("j5"), PAIRS_WITH_LAPTOPS)],
  [6, "Your next lamp", weekSixBlocks("j6")],
];
const markdownOf = ([n, title, blocks]) => lib.write.weekToMarkdown({ weekNumber: n, title, blocks });

/** A made-up rubric, as an admin pastes one. */
const RUBRIC_MARKDOWN = [
  "|  | Not yet | Solid | Strong |",
  "| --- | --- | --- | --- |",
  "| **A clear view** | Says what the lamp is | Takes a view | A view someone could argue with |",
  "| **Reasons** | None | Some, from the week | Weighed, not just cited |",
].join("\n");
const LEVELS = [
  { row: "A clear view", level: "Strong" },
  { row: "Reasons", level: "Solid" },
];

/**
 * The term's people. Amara and Bea hold places on AGI Strategy in Group B;
 * Bea also facilitates it, beside Rahul and Sofia. Dev and Tariq hold places
 * in Group A (Sofia's). Claudia leads the programme; Zach is an admin.
 */
function termSeed() {
  const seed = leadSeed();
  for (const path of Object.keys(seed)) if (path.startsWith(`courseRuns/${RUN.agi}/weeks/`)) delete seed[path];
  return seed;
}

/** One request, as `who`. Course routes see the course view of the database; the form's see it as it is. */
const asCourse = (who, handler, params, body) => call(who, handler, params, { body, course: true });
const asForm = (who, handler, params, body) => call(who, handler, params, { body });
const ok = (answer, what) => {
  assert.ok(answer.status >= 200 && answer.status < 300, `${what}: ${answer.status} ${JSON.stringify(answer.body)}`);
  return answer.body;
};

/** A week as stored, with the ids the story keys on. */
function stored(n) {
  const week = w.lib.courses.normalizeCourseWeek(`w0${n}`, world.db.read(`courseRuns/${RUN.agi}/weeks/w0${n}`));
  const all = [];
  const walk = (list) => {
    for (const block of list) {
      all.push(block);
      if (block.type === "part") walk(block.blocks);
    }
  };
  walk(week.blocks ?? []);
  return {
    week,
    weekId: `w0${n}`,
    sources: lib.reader.weekSources(week).filter((source) => source.packId === null).map((source) => source.id),
    prompts: lib.reader.weekReflectionPrompts(week).map((prompt) => prompt.id),
    answers: lib.reader.weekWrittenAnswers(week),
    boxes: lib.reader.weekFillInBoxes(week).map((box) => box.id),
    chooseOnes: all.filter((block) => block.type === "chooseOne"),
    talks: all.filter((block) => block.type === "cases"),
    checklist: lib.reader.weekChecklistItems(week).map((item) => item.id),
    pairs: lib.pairs.pairsAskOf(week.blocks ?? []),
  };
}

/** A tick, written as the week page writes one from the browser (`buildProgressWrite`). */
function tick(uid, n, itemId) {
  const now = new Date();
  world.db.seed(`courseProgress/${RUN.agi}__${uid}__${itemId}`, {
    ...lib.progress.buildProgressWrite({ runId: RUN.agi, uid, weekNumber: n, itemKind: "material", itemId, completed: true, completedAt: now }),
    updatedAt: now,
  });
}
/** Everything `uid` has ticked, as the page's own listener hands it over. */
const ticksOf = (uid) =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`courseProgress/${RUN.agi}__${uid}__`))
    .map((path) => world.db.read(path))
    .filter((row) => row.completed === true)
    .map((row) => row.itemId);

/** `who` writes something in each box named. */
async function reflect(who, n, promptIds) {
  for (const promptId of promptIds) {
    ok(await asCourse(who, w.routes.reflection.PUT, { runId: RUN.agi, promptId }, { weekId: `w0${n}`, text: `${who} on ${promptId}.` }), `${who} writes ${promptId}`);
  }
}

/** "N of M done", as each page draws it, or null where a page draws none. */
const doneOn = (text) => {
  const found = /(\d+) of (\d+) done/.exec(text);
  return found ? `${found[1]} of ${found[2]} done` : null;
};

/** The three pages' counts for `who`'s week `n`, read from the pages themselves. */
async function threeCounts(who, n) {
  const ticked = ticksOf(who);
  const week = await w.weekPage(who, n, ticked);
  const programme = await w.programmeHome(who, ticked);
  const home = await w.homeCard(who, ticked);
  return {
    week: doneOn(week.text),
    programme: doneOn(programme.text),
    home: home ? doneOn(home.text) : null,
    pages: { week, programme, home },
  };
}

/** A server page as `who` reads it: its words, or where it sent them. */
async function serverPage(file, params, who, searchParams = {}) {
  const page = (await loadTs(join("app", "(app)", "learn", ...file))).default;
  world.user = w.sessionOf(who);
  world.course = true;
  try {
    const element = await page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
    throw err;
  } finally {
    world.course = false;
  }
}

/** `who`'s own rows for week `n`, as the my-exercises route answers the week page. */
async function ownRows(who, n) {
  world.user = w.sessionOf(who);
  world.course = true;
  try {
    const response = await w.routes.myExercises.GET(new Request(`https://naisi.invalid/api?week=${n}`), { params: Promise.resolve({ runId: RUN.agi }) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    world.course = false;
  }
}

/** Everybody in the term who might press a reflection box: placed fellows, facilitators, staff who take no part, nobody. */
const CALLERS = ["amara", "bea", "dev", "tariq", "rahul", "sofia", "tom", "claudia", "tess", "lloyd", "yusuf", "nadia", "nobody"];

/**
 * Who may write in week 1's last reflection box, and whether each of them is then answered their own rows back.
 * The week page reads back what it lets a person write: a writer refused the read sees every box say it could not
 * load (W-before), so the two routes have to admit the same people.
 */
async function writersAndReaders() {
  const promptId = stored(1).prompts.at(-1);
  const rows = [];
  for (const who of CALLERS) {
    const wrote = await asCourse(who, w.routes.reflection.PUT, { runId: RUN.agi, promptId }, { weekId: "w01", text: `${who} on ${promptId}.` });
    const read = await ownRows(who, 1);
    rows.push({ who, wrote: wrote.status, read: read.status });
  }
  return rows;
}

/** Every message the mail door was handed to `to`, its words as the reader reads them. */
const mailTo = (to) =>
  world.mail
    .filter((message) => message.to === to)
    .map((message) => ({ subject: message.subject, kind: message.kind, text: message.react ? textOf(renderToStaticMarkup(message.react)) : "" }));

/** A survey's id by its stage. */
const surveyOf = (stage) => world.db.paths().filter((path) => path.startsWith("surveys/")).map((path) => ({ id: path.slice(8), ...world.db.read(path) })).find((row) => row.kind === stage || row.stage === stage);
/** A person's own link to a survey. */
const tokenOf = (surveyId, uid) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("surveyPeople/"))
    .map((path) => world.db.read(path))
    .find((row) => row.surveyId === surveyId && row.respondent?.uid === uid)?.token ?? null;

w.reset(termSeed());

// ---------------------------------------------------------------------------
// 1. Before groups go out
// ---------------------------------------------------------------------------

describe("1. before groups go out (Mon 26 Oct)", () => {
  test("an admin hands over, places, appoints a facilitator who holds a place, and pastes six weeks", async () => {
    at("2026-10-26T10:00:00Z");
    ok(await asForm("zach", routes.handOver.POST, { roundId: ROUND, programmeId: AGI }), "hand-over");
    const placed = ok(
      await asCourse("zach", routes.allocate.POST, { runId: RUN.agi }, {
        placements: [
          { uid: "amara", groupId: B },
          { uid: "bea", groupId: B },
          { uid: "dev", groupId: A },
          { uid: "tariq", groupId: A },
        ],
      }),
      "placements",
    );
    assert.deepEqual(placed.rejected ?? [], []);
    // Bea holds a place and sits in Group B already: the appointment places nobody.
    const appointed = ok(await asCourse("zach", routes.facilitators.POST, { groupId: B }, { uids: ["rahul", "sofia", "bea"] }), "facilitators");
    assert.equal(appointed.placed, undefined);
    for (const week of WEEKS) {
      const saved = ok(await asCourse("zach", routes.blocks.PUT, { runId: RUN.agi, weekId: `w0${week[0]}` }, { markdown: markdownOf(week) }), `paste week ${week[0]}`);
      assert.equal(saved.saved, true);
    }
    ok(await asCourse("zach", routes.guide.PUT, { runId: RUN.agi, doc: "start-here" }, { markdown: START_HERE_MARKDOWN }), "Start here");
    ok(await asCourse("zach", routes.guide.PUT, { runId: RUN.agi, doc: "glossary" }, { markdown: GLOSSARY_MARKDOWN }), "Glossary");
    ok(await asCourse("zach", routes.rubric.PUT, { courseId: COURSE.agi }, { markdown: RUBRIC_MARKDOWN }), "rubric");
    ok(await asCourse("zach", routes.card.PUT, { courseId: COURSE.agi }, { text: CARD_TEXT, sealWeek: 1, openWeek: 6 }), "prediction card");
    // A pasted week has no page until its first save, and is not published by it.
    assert.equal(stored(1).week.published, false);
  });

  test("the lead marks week 1 ready, which publishes it, and says when groups go out", async () => {
    const marked = ok(await asCourse("claudia", routes.ready.PUT, { runId: RUN.agi, weekId: "w01" }, { ready: true }), "ready");
    assert.equal(marked.week.ready, true);
    assert.equal(stored(1).week.published, true);
    ok(await asForm("claudia", routes.groupsGoOut.PUT, { roundId: ROUND, programmeId: AGI }, { on: "2026-10-28" }), "groups go out");
  });

  test("an admin makes, tests and sends the before survey, to everybody holding a place, and opens the leaving survey", async () => {
    const made = ok(await asForm("zach", routes.surveyCreate.POST, {}, { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: "2026-11-11" }), "before survey");
    ok(await asForm("zach", routes.surveyTest.POST, { surveyId: made.survey.id }, { email: "survey" }), "test");
    world.mail.length = 0;
    const asked = await asForm("zach", routes.surveySend.POST, { surveyId: made.survey.id }, { to: "everyone", emails: 0 });
    assert.equal(asked.status, 409, "a send names the count it is about to email");
    const sent = await asForm("zach", routes.surveySend.POST, { surveyId: made.survey.id }, { to: "everyone", emails: asked.body.emails });
    ok(sent, "send");
    // The count it asked for is what it sent: Bea, who holds a place, among them; Rahul and Sofia, who
    // only facilitate, never (programme surveys go to people holding a place).
    const to = world.mail.map((message) => message.to);
    assert.equal(to.length, asked.body.emails);
    assert.ok(to.includes("amara@example.com") && to.includes("bea@example.com"), JSON.stringify(to));
    assert.ok(!to.includes("rahul@example.com") && !to.includes("sofia@example.com"), JSON.stringify(to));
    const leaving = ok(await asForm("zach", routes.surveyCreate.POST, {}, { roundId: ROUND, programmeId: AGI, stage: "leaving" }), "leaving survey");
    ok(await asForm("zach", routes.surveyOpen.POST, { surveyId: leaving.survey.id }, {}), "open");
  });

  test("Amara, holding a place, reads week 1 through its door: the line, the survey card and the count", async () => {
    at("2026-10-26T20:00:00Z");
    const page = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.equal(page.shell.component, "WeekView");
    assert.match(page.text, /Week 1 is open now\. You’ll hear your group and when it meets on Wed 28 Oct\./);
    assert.match(page.text, /A survey for you/);
    assert.equal(doneOn(page.text), "0 of 1 done");
    // Week 2 sends a holder back to week 1.
    assert.equal((await w.weekShell("amara", 2)).to, `/learn/${encodeURIComponent(RUN.agi)}/weeks/1`);
  });

  test("Amara ticks and writes through week 1's own door; one task counts once every part is done", async () => {
    const w1 = stored(1);
    for (const itemId of w1.sources) ok(await asCourse("amara", routes.holderTick.PUT, { runId: RUN.agi, itemId }, { completed: true }), "holder tick");
    await reflect("amara", 1, w1.prompts.slice(0, -1));
    let page = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.equal(doneOn(page.text), "0 of 1 done", "one box still empty");
    await reflect("amara", 1, w1.prompts.slice(-1));
    page = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.equal(doneOn(page.text), "1 of 1 done");
  });

  test("Home's cards for Amara: her group on its way, with week 1 open, and the before survey", async () => {
    const cards = await lib.cards.beforeGroupsCardsFor(world.courseDb, w.sessionOf("amara"), new Date());
    assert.equal(cards.length, 1);
    const waiting = await lib.waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date());
    assert.deepEqual(waiting.map((card) => card.title), [surveyOf("before").title]);
  });

  test("Bea, who holds a place and already facilitates Group B, writes in week 1 before Publish, and her page reads it back", async () => {
    const w1 = stored(1);
    ok(await asCourse("bea", w.routes.reflection.PUT, { runId: RUN.agi, promptId: w1.prompts[0] }, { weekId: "w01", text: "Bea before groups go out." }), "Bea writes");
    // The reflection route lets a facilitator of any group of the run write in their own boxes, and the
    // week page reads them back through my-exercises: both answer her alike, before Publish has told her
    // place, and nobody else's rows come back.
    const own = await ownRows("bea", 1);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(own.body.responses.map((row) => [row.exerciseId, row.text]), [[w1.prompts[0], "Bea before groups go out."]]);
    const page = await w.weekPage("bea", 1, []);
    assert.equal(page.shell.props.viewerRole, "facilitator");
    assert.match(page.html, />Bea before groups go out\.</);
    // Week 1's door is staff's for anybody facilitating a group of the run (decided), so Home has no
    // card for her place; and Home's own list leaves the run out until Publish tells her place.
    assert.deepEqual(await lib.cards.beforeGroupsCardsFor(world.courseDb, w.sessionOf("bea"), new Date()), []);
    const me = (await asCourse("bea", w.routes.me.GET, {})).body.runs.find((entry) => entry.runId === RUN.agi);
    assert.deepEqual([me.roles, me.membership], [["facilitator"], "none"]);
  });
  test("everybody the reflection route lets write in week 1 is answered their own boxes back, before Publish", async () => {
    const rows = await writersAndReaders();
    assert.deepEqual(rows.filter((row) => row.wrote === 200).map((row) => row.who), ["amara", "bea", "dev", "tariq", "rahul", "sofia", "tom"]);
    assert.deepEqual(rows.filter((row) => row.wrote === 200 && row.read !== 200), []);
  });
});


// ---------------------------------------------------------------------------
// 2. Publish
// ---------------------------------------------------------------------------

describe("2. groups go out (Wed 28 Oct)", () => {
  test("Publish tells Bea twice: her group, which names only her co-facilitators, and that she facilitates it", async () => {
    at("2026-10-28T10:00:00Z");
    world.mail.length = 0;
    let summary = ok(await asCourse("zach", routes.board.GET, { runId: RUN.agi }), "board").publish;
    if (summary.emails > 0 && summary.test.state !== "fresh") {
      ok(await asCourse("zach", routes.publishTest.POST, { runId: RUN.agi }), "publish test");
      summary = ok(await asCourse("zach", routes.board.GET, { runId: RUN.agi }), "board again").publish;
    }
    world.mail.length = 0;
    ok(await asCourse("zach", routes.publish.POST, { runId: RUN.agi }, { emails: summary.emails }), "publish");
    // The button's count is the emails Publish hands over, Bea's two among them.
    assert.equal(world.mail.length, summary.emails);
    const bea = mailTo("bea@example.com");
    assert.equal(bea.length, 2, JSON.stringify(bea.map((m) => m.subject)));
    const placement = bea.find((m) => !/facilitating/i.test(m.subject));
    assert.ok(placement, "a placement email");
    assert.match(placement.text, /Rahul/);
    assert.doesNotMatch(placement.text, /Bea Lindqvist|Bea and|and Bea/);
    assert.ok(bea.some((m) => /facilitating/i.test(m.subject)), "a facilitating email");
    assert.equal(mailTo("amara@example.com").length, 1);
  });
});

// ---------------------------------------------------------------------------
// The registers: each group's facilitator marks and finishes each one
// ---------------------------------------------------------------------------

/** `typist` marks group `groupId`'s week `n`, everybody present unless said, and finishes it. */
async function register(typist, groupId, n, people, absent = []) {
  const marks = people.map((uid) => ({ uid, status: absent.includes(uid) ? "absent" : "present" }));
  ok(await asCourse(typist, routes.register.POST, { groupId }, { weekNumber: n, marks }), `${groupId} week ${n} register`);
  ok(await asCourse(typist, routes.finish.POST, { groupId }, { weekNumber: n }), `${groupId} week ${n} finished`);
}

// ---------------------------------------------------------------------------
// 3. Week 1
// ---------------------------------------------------------------------------

describe("3. week 1 (Thu 29 Oct to Wed 4 Nov; Group B meets on Tue 3 Nov)", () => {
  test("Amara's week 1 counts the same on the week page, the programme page and Home", async () => {
    at("2026-10-30T09:00:00Z");
    await register("sofia", A, 1, ["dev", "tariq"]);
    at("2026-10-30T19:00:00Z");
    const counts = await threeCounts("amara", 1);
    assert.deepEqual([counts.week, counts.programme, counts.home], ["1 of 1 done", "1 of 1 done", "1 of 1 done"]);
    // Once Publish has told her, the line about groups going out is gone.
    assert.doesNotMatch(counts.pages.week.text, /Week 1 is open now/);
  });

  test("Bea, who facilitates Group B and holds a place in it, does week 1 as herself, and her lines name only the lead and admins", async () => {
    const w1 = stored(1);
    for (const itemId of w1.sources) tick("bea", 1, itemId);
    await reflect("bea", 1, w1.prompts);
    const page = await w.weekPage("bea", 1, ticksOf("bea"));
    assert.equal(page.shell.props.viewerRole, "facilitator");
    assert.equal(doneOn(page.text), "1 of 1 done");
    assert.match(page.text, /Only Claudia and admins can read your reflections\./);
    assert.match(page.text, /Only Claudia and admins can see which sources you tick\./);
    assert.doesNotMatch(page.text, /Other fellows can’t|may read a line out/);
    const programme = await w.programmeHome("bea", ticksOf("bea"));
    assert.equal(doneOn(programme.text), "1 of 1 done");
    // W-self: Bea's own programme page names her among the people she meets with. Publish's
    // placement email leaves its reader out of the group's facilitators; the page does not.
    assert.match(programme.text, /Group B · Tuesdays 6pm · Hallward B12 · with Rahul, Sofia and Bea/);
  });

  test("everybody the reflection route lets write in week 1 is answered their own boxes back, after Publish", async () => {
    const rows = await writersAndReaders();
    assert.deepEqual(rows.filter((row) => row.wrote === 200).map((row) => row.who), ["amara", "bea", "dev", "tariq", "rahul", "sofia", "tom"]);
    assert.deepEqual(rows.filter((row) => row.wrote === 200 && row.read !== 200), []);
  });

  test("who reads whose reflections: the lead and admins read both; Bea's co-facilitators and Amara never read Bea's", async () => {
    for (const who of ["claudia", "zach"]) {
      for (const uid of ["amara", "bea"]) assert.equal((await w.readReflections(who, uid, 1)).status, 200, `${who} reads ${uid}`);
    }
    for (const who of ["rahul", "sofia", "amara"]) assert.equal((await w.readReflections(who, "bea", 1)).status, 403, `${who} reads Bea's`);
    // Amara's page names who reads hers: Group B's three facilitators, the lead and admins.
    const amara = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.match(amara.text, /Rahul, Sofia, Bea, Claudia and admins can read your reflections\. Other fellows can’t\./);
  });

  test("ticks: Bea ticked both sources, and Rahul's group page counts and names Amara's alone", async () => {
    const page = await serverPage(["[runId]", "group", "[groupId]", "page.tsx"], { runId: RUN.agi, groupId: B }, "rahul");
    const ticks = page.text.slice(page.text.indexOf("Reading ticks"), page.text.indexOf("Only Group B’s facilitators and admins read private notes"));
    // The policy: a facilitator's own ticks are the lead's and admins', never another facilitator's.
    assert.equal(
      ticks,
      "Reading ticks Ticks never count against anyone. Part 2 · Read A keeper's diary 1 of 1 ticked it See who AO Amara Okafor Part 2 · Watch Lamps at night 1 of 1 ticked it See who AO Amara Okafor ",
    );
    assert.equal(ticksOf("bea").length, 2);
  });

  test("Start here says who reads reflections as the week page does, for Amara and for Bea", async () => {
    const amara = await serverPage(["[runId]", "start-here", "page.tsx"], { runId: RUN.agi }, "amara");
    const bea = await serverPage(["[runId]", "start-here", "page.tsx"], { runId: RUN.agi }, "bea");
    assert.match(amara.text, /Rahul, Sofia, Bea, Claudia and admins can read them; other fellows can’t\. Rahul, Sofia or Bea may read a line out in the session, without your name\./);
    assert.match(bea.text, /You don’t need to send them\. Only Claudia and admins can read them\./);
    const week = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.match(week.text, /Rahul, Sofia or Bea may read a line out in the session, without your name\./);
  });

  test("W-rubric: Start here's rubric and the course's rubric are two pastes, and nothing holds them to one another", async () => {
    // The written answer's card sends a fellow to "the rubric on Start here"; feedback is given on the
    // course's own rubric record. Loaded from two different tables, the two disagree and nothing says so.
    const amara = await serverPage(["[runId]", "start-here", "page.tsx"], { runId: RUN.agi }, "amara");
    assert.match(amara.text, /A clear position Not yet No view Solid A view Strong A view someone could argue with/);
    const course = world.db.read(`courses/${COURSE.agi}`);
    assert.deepEqual(course.rubric.rows.map((row) => row.name), ["A clear view", "Reasons"]);
  });

  test("in session 1, both seal their predictions; the card is shut to its owner until week 6", async () => {
    at("2026-11-03T18:30:00Z");
    for (const who of ["amara", "bea"]) {
      const shell = await w.weekShell(who, 1);
      const card = shell.props.predictions;
      assert.equal(card.stage, "seal");
      assert.equal(card.start.state, "none");
      for (const question of card.card.questions) {
        const value = question.kind === "sentence" ? "The one on the far headland." : Math.min(question.max, 40);
        ok(await asCourse(who, routes.predictions.PUT, { runId: RUN.agi }, { stage: "start", questionId: question.id, value }), `${who} answers ${question.id}`);
      }
      ok(await asCourse(who, routes.predictions.POST, { runId: RUN.agi }, { action: "seal" }), `${who} seals`);
      const after = (await w.weekShell(who, 1)).props.predictions;
      assert.equal(after.start.state, "sealed");
      assert.deepEqual(after.start.answers, {});
    }
  });

  test("a sealed card is its owner's and admins': the lead and a co-facilitator are refused, an admin's opening is recorded", async () => {
    for (const who of ["claudia", "rahul", "sofia", "bea"]) {
      const refused = await asCourse(who, routes.openCard.POST, { runId: RUN.agi, uid: "amara" });
      assert.equal(refused.status, 403, `${who} opens Amara's card`);
    }
    const opened = ok(await asCourse("zach", routes.openCard.POST, { runId: RUN.agi, uid: "amara" }), "an admin opens it");
    assert.ok(opened);
    const openings = world.db.paths().filter((path) => path.startsWith("recordOpenings/")).map((path) => world.db.read(path));
    assert.deepEqual(openings.map((row) => [row.actorUid, row.subjectUid]), [["zach", "amara"]]);
  });

  test("after session 1, Rahul marks the register, Bea on it as one of the group's people", async () => {
    at("2026-11-03T20:20:00Z");
    world.mail.length = 0;
    const marks = ["amara", "bea"].map((uid) => ({ uid, status: "present" }));
    ok(await asCourse("rahul", routes.register.POST, { groupId: B }, { weekNumber: 1, marks }), "week 1's register");
    const finished = ok(await asCourse("rahul", routes.finish.POST, { groupId: B }, { weekNumber: 1 }), "finished");
    // W-held: week 2 is not marked ready until tomorrow, so next week's email is held, and the facilitator who
    // finished the register is told to do two things only the lead and admins can (Mark ready is the word now).
    assert.equal(world.mail.length, 0);
    assert.equal(finished.reason, "Week 2 isn't published yet, so the group wasn't sent a reminder. Publish it and use the run's catch-up send.");
    const sheet = world.db.read(`courseAttendance/${RUN.agi}__${B}__w01`);
    assert.deepEqual(Object.keys(sheet.records).sort(), ["amara", "bea"]);
  });

  test("the before survey's box names who never sees the answers: Amara's names all three facilitators, Bea's leaves her out", async () => {
    at("2026-11-03T21:00:00Z");
    const surveyId = surveyOf("before").id;
    const amara = await serverPage(["[runId]", "survey", "[surveyId]", "page.tsx"], { runId: RUN.agi, surveyId }, "amara");
    const bea = await serverPage(["[runId]", "survey", "[surveyId]", "page.tsx"], { runId: RUN.agi, surveyId }, "bea");
    assert.match(amara.text, /Rahul, Sofia and Bea never see your answers\./);
    assert.match(bea.text, /Rahul and Sofia never see your answers\./);
  });

  test("Amara answers the before survey from week 1's card after her first session, and the card leaves week 1 and Home", async () => {
    at("2026-11-03T21:10:00Z");
    const before = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.match(before.text, /A survey for you Before you start/);
    ok(await asForm(null, routes.surveyAnswer.POST, {}, { token: tokenOf(surveyOf("before").id, "amara"), answers: {} }), "Amara answers");
    const after = await w.weekPage("amara", 1, ticksOf("amara"));
    assert.doesNotMatch(after.text, /A survey for you/);
    assert.deepEqual(await lib.waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date()), []);
  });
});

// ---------------------------------------------------------------------------
// 4. Week 2: the written answer
// ---------------------------------------------------------------------------

describe("4. week 2 (Group B meets on Tue 10 Nov): a written answer, sent and given feedback", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => (i % 9 === 8 ? "lamp." : "keepers")).join(" ");

  test("Amara and Bea send theirs on Sunday; the three pages count the sent answer alike", async () => {
    at("2026-11-04T09:00:00Z");
    for (const n of [2, 3, 4, 5, 6]) {
      // The lead marks each week ready the Monday before it opens: here, all at once.
      ok(await asCourse("claudia", routes.ready.PUT, { runId: RUN.agi, weekId: `w0${n}` }, { ready: true }), `ready ${n}`);
    }
    at("2026-11-05T20:20:00Z");
    await register("sofia", A, 2, ["dev", "tariq"]);
    at("2026-11-08T20:00:00Z");
    const w2 = stored(2);
    assert.equal(w2.answers.length, 1);
    const answer = w2.answers[0];
    for (const who of ["amara", "bea"]) {
      const sent = await asCourse(who, routes.written.PUT, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", text: words(220), send: true });
      ok(sent, `${who} sends`);
    }
    const counts = await threeCounts("amara", 2);
    // The answer sent is one task of three done: the parts wait for a pack, the talk for a case.
    assert.deepEqual([counts.week, counts.programme, counts.home], ["1 of 3 done", "1 of 3 done", "1 of 3 done"]);
    assert.match(counts.pages.week.text, /Done: Part 4: your forecast, the week’s written answer \(200 to 300 words\) About 30 minutes By the end of Mon 9 Nov Sent Sun 8 Nov/);
    assert.match(counts.pages.programme.text, /Done: Your written answer Sent Sun 8 Nov/);
  });

  test("Rahul opens Amara's answer, which locks it, and sends feedback by the rubric: one email, with no level and no comment in it", async () => {
    at("2026-11-09T10:00:00Z");
    const answer = stored(2).answers[0];
    world.mail.length = 0;
    ok(await asCourse("rahul", routes.review.POST, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", uid: "amara", action: "open" }), "open");
    const locked = await asCourse("amara", routes.written.PUT, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", text: words(230) });
    assert.equal(locked.status, 409);
    const comment = "A lighthouse view anyone could argue with.";
    ok(await asCourse("rahul", routes.review.POST, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", uid: "amara", action: "feedback", levels: LEVELS, comment }), "feedback");
    const mail = mailTo("amara@example.com");
    assert.equal(mail.length, 1);
    assert.doesNotMatch(mail[0].text, /lighthouse view|Strong|Solid/);
  });

  test("Bea's answer is the lead's and admins' to give feedback on: her co-facilitators are refused, Claudia sends it", async () => {
    const answer = stored(2).answers[0];
    for (const who of ["rahul", "sofia"]) {
      const refused = await asCourse(who, routes.review.POST, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", uid: "bea", action: "open" });
      assert.equal(refused.status, 403, who);
    }
    ok(await asCourse("claudia", routes.review.POST, { runId: RUN.agi, answerId: answer.id }, { weekId: "w02", uid: "bea", action: "feedback", levels: LEVELS, comment: "Clear and weighed." }), "Claudia's feedback");
    assert.equal(mailTo("bea@example.com").length, 1);
  });

  test("each reads their feedback on the site, from who gave it", async () => {
    const amara = await serverPage(["[runId]", "weeks", "[n]", "feedback", "page.tsx"], { runId: RUN.agi, n: "2" }, "amara");
    const bea = await serverPage(["[runId]", "weeks", "[n]", "feedback", "page.tsx"], { runId: RUN.agi, n: "2" }, "bea");
    const rahulReview = await serverPage(["[runId]", "group", "[groupId]", "written", "page.tsx"], { runId: RUN.agi, groupId: B }, "rahul", { week: "2" });
    assert.match(amara.text, /From Rahul · Mon 9 Nov, 10am A clear view Strong A view someone could argue with Reasons Solid Some, from the week/);
    assert.match(amara.text, /Rahul’s comment A lighthouse view anyone could argue with\./);
    assert.match(bea.text, /From Claudia · Mon 9 Nov, 10am/);
    // The group's review page lists the group's fellows: never Bea, who facilitates it.
    assert.match(rahulReview.text, /AO Amara Okafor By you/);
    assert.doesNotMatch(rahulReview.text, /Bea/);
  });

  test("Rahul's group page in week 2: the group's fellows, never Bea's own work, and This week's work with reflections alone", async () => {
    await w.asBrowser("rahul", 2, []);
    const page = await serverPage(["[runId]", "group", "[groupId]", "page.tsx"], { runId: RUN.agi, groupId: B }, "rahul");
    // The group page leaves its reader out of the group's facilitators (W-self: the programme page does not).
    assert.match(page.text, /with Sofia Rossi and Bea Lindqvist/);
    // Counts over the fellows alone: Amara. Bea's ticks and reflections are the lead's and admins'.
    assert.match(page.text, /Review queue Reflections Part 1, 0 of 1 · Part 2, 0 of 1/);
    assert.match(page.text, /Part 1 · Read A field guide to base rates 0 of 1 ticked it/);
    assert.match(page.text, /Facilitators’ own work is for Claudia and admins to read, so it isn’t listed here\./);
    // W-work: wk-fac-group's table has Pathway, Written answer and Case columns. The group page hands
    // This week's work no columns (`weekWorkOf` is called by nothing), so it draws the reflections alone.
    assert.match(page.text, /This week’s work Week 2 · Thu 5 to Wed 11 Nov Name Part 1 reflection Part 2 reflection AO Amara Okafor Not yet Not yet/);
    assert.doesNotMatch(page.text, /Name Part 1 reflection Part 2 reflection (Pathway|Written answer)/);
    // Three facilitators: the notes are for Rahul and the other two, in one list with the reader
    // first. Putting "you and" before a list already joined with "and" said "and" twice.
    assert.match(page.text, /Notes for you, Sofia and Bea Only Group B’s facilitators, Claudia and admins see these\./);
    assert.deepEqual(
      [[], ["Sofia"], ["Sofia", "Bea"]].map((others) => lib.facilitatorWords.notesTitle(others, true)),
      ["Notes for you", "Notes for you and Sofia", "Notes for you, Sofia and Bea"],
    );
  });

  test("private notes: Group B's facilitators read Amara's and never Bea's own; an admin reads both", async () => {
    const source = stored(2).sources[0];
    const notes = { amara: "Too long for one evening.", bea: "Worth a second read." };
    for (const [uid, privateNote] of Object.entries(notes)) {
      world.db.seed(`courseProgress/${RUN.agi}__${uid}__${source}`, {
        ...lib.progress.buildProgressWrite({ runId: RUN.agi, uid, weekNumber: 2, itemKind: "material", itemId: source, completed: false, privateNote }),
        updatedAt: new Date(),
      });
    }
    const groupPage = (who) => serverPage(["[runId]", "group", "[groupId]", "page.tsx"], { runId: RUN.agi, groupId: B }, who);
    // The policy: a private note is read by the group's facilitators and admins; a facilitator's own, by admins alone.
    for (const who of ["rahul", "sofia", "bea"]) {
      const page = await groupPage(who);
      assert.match(page.text, /1 private note.*Too long for one evening\./, who);
      assert.doesNotMatch(page.text, /Worth a second read/, who);
    }
    const admin = await groupPage("zach");
    assert.match(admin.text, /2 private notes/);
    assert.match(admin.text, /Too long for one evening\./);
    assert.match(admin.text, /Worth a second read\./);
  });

  test("the read-out page for session 2 gives Rahul Amara's lines without her name, and never Bea's", async () => {
    const readOut = await serverPage(["[runId]", "group", "[groupId]", "reflections", "page.tsx"], { runId: RUN.agi, groupId: B }, "rahul", { week: "1" });
    assert.equal(readOut.to, null);
    assert.match(readOut.text, /amara on /);
    assert.doesNotMatch(readOut.text, /Amara|bea on /);
  });
});

// ---------------------------------------------------------------------------
// 5. Week 3: packs and cases given out, a talk, somebody leaves
// ---------------------------------------------------------------------------

describe("5. week 3 (Group B meets on Tue 17 Nov): the draw, a pack ticked, a talk, a leaver", () => {
  test("after session 2, Rahul types the draw for week 3: a pathway pack each, and a case from each one's pack", async () => {
    at("2026-11-10T20:20:00Z");
    world.mail.length = 0;
    await register("rahul", B, 2, ["amara", "bea"]);
    // Finishing the register sends next week's email to the group's people, Bea among them: what it says week 3
    // asks is what week 3's page counts, from its This week box, and never an "exercise".
    const nextWeek = mailTo("amara@example.com");
    assert.deepEqual([nextWeek.length, mailTo("bea@example.com").length, mailTo("rahul@example.com").length], [1, 1, 0]);
    assert.match(nextWeek[0].text, /There are three things to do this week, about 2 hours in all\./);
    assert.doesNotMatch(nextWeek[0].text, /exercise/i);
    const weekThree = await w.weekPage("amara", 3, ticksOf("amara"));
    assert.equal(doneOn(weekThree.text), "0 of 3 done");
    assert.match(weekThree.text, /In all: About 2 hours/);
    at("2026-11-10T20:40:00Z");
    const w3 = stored(3);
    const given = w3.chooseOnes.find((block) => block.givenBy === "facilitator");
    const talk = w3.talks.find((block) => block.groups.some((group) => group.cases.length > 0));
    const caseOf = (packId) => talk.groups.filter((group) => group.packId === packId).flatMap((group) => group.cases).find((c) => !c.contentNote);
    const entries = [
      { uid: "amara", blockId: given.id, value: given.packs[0].id },
      { uid: "amara", blockId: talk.id, value: caseOf(given.packs[0].id).id },
      { uid: "bea", blockId: given.id, value: given.packs[1].id },
      { uid: "bea", blockId: talk.id, value: caseOf(given.packs[1].id).id },
    ];
    ok(await asCourse("rahul", routes.draw.PUT, { groupId: B }, { weekId: "w03", entries }), "the draw");
    // A case with a content note is never offered: the draw refuses one typed in.
    const noted = talk.groups.flatMap((group) => group.cases).find((c) => c.contentNote);
    const refused = await asCourse("rahul", routes.draw.PUT, { groupId: B }, { weekId: "w03", entries: [{ uid: "amara", blockId: talk.id, value: noted.id }] });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
  });

  test("Dev leaves Group A in week 3, and the open leaving survey reaches him by his own link", async () => {
    at("2026-11-12T20:20:00Z");
    await register("sofia", A, 3, ["dev", "tariq"]);
    at("2026-11-13T10:00:00Z");
    world.mail.length = 0;
    ok(await asCourse("dev", routes.enrol.DELETE, { runId: RUN.agi }, { confirmName: "AGI Strategy Fellowship", reason: "Too much on this term." }), "Dev leaves");
    const leaving = surveyOf("leaving");
    assert.ok(tokenOf(leaving.id, "dev"), "Dev's own link to the leaving survey");
    const card = await lib.waiting.leavingSurveyCardFor(world.db, { uid: "dev" }, RUN.agi, new Date());
    assert.ok(card, "the left page's card");
    const email = mailTo("dev@example.com");
    assert.equal(email.length, 1);
    assert.match(email[0].text, /We’d like to know why you left/);
  });

  test("Dev answers the leaving survey from its card, and the card leaves his page", async () => {
    at("2026-11-13T10:30:00Z");
    const leaving = surveyOf("leaving");
    const before = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "dev");
    assert.match(before.text, /Tell us why Answer 3 questions, about a minute\./);
    ok(await asForm(null, routes.surveyAnswer.POST, {}, { token: tokenOf(leaving.id, "dev"), answers: {} }), "Dev answers");
    assert.equal(await lib.waiting.leavingSurveyCardFor(world.db, { uid: "dev" }, RUN.agi, new Date()), null);
    const after = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "dev");
    assert.doesNotMatch(after.text, /Tell us why/);
  });

  test("Amara does her week: her pack ticked, her boxes written, her answer sent, ready for her talk; three pages agree", async () => {
    at("2026-11-14T11:00:00Z");
    const w3 = stored(3);
    const given = w3.chooseOnes.find((block) => block.givenBy === "facilitator");
    for (const itemId of [...w3.sources, given.packs[0].id]) tick("amara", 3, itemId);
    await reflect("amara", 3, w3.prompts);
    at("2026-11-16T21:00:00Z");
    ok(await asCourse("amara", routes.written.PUT, { runId: RUN.agi, answerId: w3.answers[0].id }, { weekId: "w03", text: "Elections first, then the rest. ".repeat(40).trim(), send: true }), "sent");
    const talk = w3.talks.find((block) => block.groups.some((group) => group.cases.length > 0));
    ok(await asCourse("amara", routes.packs.PUT, { runId: RUN.agi, blockId: talk.id }, { weekId: "w03", ready: true }), "ready");
    const counts = await threeCounts("amara", 3);
    assert.deepEqual([counts.week, counts.programme, counts.home], ["3 of 3 done", "3 of 3 done", "3 of 3 done"]);
    assert.match(counts.pages.programme.text, /Done: Your case talk The surprise result, 2016 Done/);
  });

  test("Bea sends hers on the morning of the session, after it was due: nothing on her own page says late", async () => {
    at("2026-11-17T09:00:00Z");
    const w3 = stored(3);
    ok(await asCourse("bea", routes.written.PUT, { runId: RUN.agi, answerId: w3.answers[0].id }, { weekId: "w03", text: "Markets first, then the rest. ".repeat(40).trim(), send: true }), "Bea sends");
    const page = await w.weekPage("bea", 3, ticksOf("bea"));
    assert.doesNotMatch(page.text, /\bLate\b/);
  });

  test("Late is staff's: an admin's review page marks Bea's answer Late and Amara's not; Rahul's never lists Bea's", async () => {
    const review = (who, person) => serverPage(["[runId]", "group", "[groupId]", "written", "page.tsx"], { runId: RUN.agi, groupId: B }, who, { week: "3", person });
    const admin = await review("zach", "bea");
    assert.match(admin.text, /To give feedback on 2 AO Amara Okafor Sent Mon 16 Nov, 9pm BL Bea Lindqvist Sent Tue 17 Nov, 9am Late /);
    assert.match(admin.text, /Bea’s answer 200 words · 200 to 300 Sent Tue 17 Nov, 9am Late /);
    // Asked for Bea, Rahul's page opens on the one answer it may show him, Amara's.
    const rahul = await review("rahul", "bea");
    assert.match(rahul.text, /To give feedback on 1 AO Amara Okafor Sent Mon 16 Nov, 9pm Feedback sent/);
    assert.doesNotMatch(rahul.text, /Bea Lindqvist|Bea’s answer|\bLate\b/);
    assert.match(rahul.text, /Amara can still change it until Rahul, Sofia or Bea opens it\./);
  });

  test("who waits for whose feedback: Rahul and Sofia have Amara's answer and never Bea's; the lead and an admin have both", async () => {
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groups = [B, A].map((id) => lib.groups.normalizeCourseGroup(id, world.db.read(`courseGroups/${id}`)));
    const waiting = async (who) => {
      const queues = await lib.queue.loadWrittenQueues(world.courseDb, w.sessionOf(who), run, groups);
      return (queues?.get(B) ?? []).map((row) => `${row.uid} w${row.weekNumber}`).sort();
    };
    assert.deepEqual(await waiting("rahul"), ["amara w3"]);
    assert.deepEqual(await waiting("sofia"), ["amara w3"]);
    assert.deepEqual(await waiting("claudia"), ["amara w3", "bea w3"]);
    assert.deepEqual(await waiting("zach"), ["amara w3", "bea w3"]);
    // Bea facilitates Group B too: she reviews Amara's, and is never handed her own.
    assert.deepEqual(await waiting("bea"), ["amara w3"]);
    at("2026-11-17T20:20:00Z");
    await register("rahul", B, 3, ["amara", "bea"]);
  });
});

// ---------------------------------------------------------------------------
// 6. Weeks 4 and 5: the pairs
// ---------------------------------------------------------------------------

describe("6. weeks 4 and 5: a week left undone, then the pairs on the fellow's own page", () => {
  test("in week 4 Amara does nothing, and all three pages say none of it is done", async () => {
    at("2026-11-19T20:20:00Z");
    await register("sofia", A, 4, ["tariq"]);
    at("2026-11-23T12:00:00Z");
    const counts = await threeCounts("amara", 4);
    assert.deepEqual([counts.week, counts.programme, counts.home], ["0 of 1 done", "0 of 1 done", "0 of 1 done"]);
  });

  test("after session 4 Rahul pairs Amara with Bea, who brings a laptop; each reads their own pair on week 5", async () => {
    at("2026-11-24T20:20:00Z");
    await register("rahul", B, 4, ["amara", "bea"]);
    at("2026-11-24T20:40:00Z");
    const w5 = stored(5);
    assert.ok(w5.pairs, "week 5 asks for pairs");
    ok(await asCourse("rahul", routes.pairs.PUT, { groupId: B }, {
      weekId: "w05",
      blockId: w5.pairs.blockId,
      entries: [{ uid: "amara", pair: 1, laptop: false }, { uid: "bea", pair: 1, laptop: true }],
    }), "pairs");
    at("2026-11-25T10:00:00Z");
    const amara = await w.weekPage("amara", 5, ticksOf("amara"));
    assert.match(amara.text, /Your pair You’re paired with Bea\. Bea is bringing a laptop\./);
    const bea = await w.weekPage("bea", 5, ticksOf("bea"));
    assert.match(bea.text, /Your pair You’re paired with Amara\. You’re bringing a laptop\./);
    // The pair is no task: week 5 counts what it counted before the pairs were typed in.
    const counts = await threeCounts("amara", 5);
    assert.deepEqual([counts.week, counts.programme, counts.home], ["0 of 1 done", "0 of 1 done", "0 of 1 done"]);
    at("2026-11-26T20:20:00Z");
    await register("sofia", A, 5, ["tariq"]);
    at("2026-12-01T20:20:00Z");
    await register("rahul", B, 5, ["amara", "bea"]);
  });
});

// ---------------------------------------------------------------------------
// 7. Week 6: fill-in boxes, the sealed card opened, the survey at the end
// ---------------------------------------------------------------------------

describe("7. week 6 (Group B meets on Tue 8 Dec, its last session)", () => {
  test("Amara fills in every box of her plan, Bea half of hers; each page says how far each has got", async () => {
    at("2026-12-03T20:20:00Z");
    await register("sofia", A, 6, ["tariq"]);
    at("2026-12-04T19:00:00Z");
    const w6 = stored(6);
    assert.equal(w6.boxes.length, 12);
    for (const boxId of w6.boxes) ok(await asCourse("amara", routes.fillIn.PUT, { runId: RUN.agi, boxId }, { weekId: "w06", text: `A step on ${boxId}.` }), "Amara's box");
    for (const boxId of w6.boxes.slice(0, 6)) ok(await asCourse("bea", routes.fillIn.PUT, { runId: RUN.agi, boxId }, { weekId: "w06", text: `A step on ${boxId}.` }), "Bea's box");
    const amara = await threeCounts("amara", 6);
    // Only the plan is done: the career review, the deep dive and the pitch wait.
    assert.deepEqual([amara.week, amara.programme, amara.home], ["1 of 4 done", "1 of 4 done", "1 of 4 done"]);
    assert.match(amara.pages.week.text, /Done: Part 3: draft your keeper's plan About 30 minutes Bring it to your session, Tue 8 Dec Done/);
    // W-pitch: week 6's talk is a pitch with no case ("Part 4: prepare your 2-minute pitch", "Ready for my
    // pitch"), and the programme page calls its row "Your case talk".
    assert.match(amara.pages.week.text, /Not done yet: Part 4: prepare your 2-minute pitch About 15 minutes At your session, Tue 8 Dec Not ready yet/);
    assert.match(amara.pages.programme.text, /Not done yet: Your case talk Not ready yet Open week 6/);
    const bea = await w.weekPage("bea", 6, ticksOf("bea"));
    assert.match(bea.text, /Draft · 6 of 12 filled/);
  });

  test("who reads the plan: the line under the boxes names its readers, and the reader route answers each as the policy says", async () => {
    const amara = await w.weekPage("amara", 6, ticksOf("amara"));
    const bea = await w.weekPage("bea", 6, ticksOf("bea"));
    assert.match(amara.text, /Rahul, Sofia, Bea, Claudia and admins can read your [^.]+\. Other fellows can’t\./);
    assert.match(bea.text, /Only Claudia and admins can read your [^.]+\./);
    const readBoxes = async (who, uid) => {
      world.user = w.sessionOf(who);
      world.course = true;
      try {
        const response = await routes.fillInBoxes.GET(new Request(`https://naisi.invalid/api?uid=${uid}&week=6`), { params: Promise.resolve({ runId: RUN.agi }) });
        return { status: response.status, boxes: response.body?.boxes?.length ?? null };
      } finally {
        world.course = false;
      }
    };
    for (const who of ["rahul", "sofia", "bea", "claudia", "zach"]) assert.deepEqual(await readBoxes(who, "amara"), { status: 200, boxes: 12 }, `${who} reads Amara's`);
    for (const who of ["claudia", "zach"]) assert.deepEqual(await readBoxes(who, "bea"), { status: 200, boxes: 6 }, `${who} reads Bea's`);
    for (const who of ["rahul", "sofia", "amara"]) assert.equal((await readBoxes(who, "bea")).status, 403, `${who} reads Bea's`);
    assert.equal((await readBoxes("bea", "amara")).status, 200);
    // W-plan: the route is the only way anybody reads somebody else's plan, and no page calls it, so the
    // line names readers who have no screen to read it on (as with W-work, a reader the group page does not draw).
  });

  test("a pack each picks herself: Amara and Bea pick one and change it before the session", async () => {
    const pick = stored(6).chooseOnes.find((block) => block.givenBy === "fellow");
    const choose = (who, packId) => asCourse(who, routes.packs.PUT, { runId: RUN.agi, blockId: pick.id }, { weekId: "w06", packId });
    at("2026-12-05T10:00:00Z");
    for (const who of ["amara", "bea"]) {
      ok(await choose(who, pick.packs[0].id), `${who} picks`);
      ok(await choose(who, pick.packs[1].id), `${who} changes it`);
    }
  });

  test("an admin sends the survey at the end; it waits on Amara's Home until she answers it from its card", async () => {
    at("2026-12-06T10:00:00Z");
    const made = ok(await asForm("zach", routes.surveyCreate.POST, {}, { roundId: ROUND, programmeId: AGI, stage: "after", closesOn: "2026-12-16" }), "after survey");
    ok(await asForm("zach", routes.surveyTest.POST, { surveyId: made.survey.id }, { email: "survey" }), "test");
    let sent = await asForm("zach", routes.surveySend.POST, { surveyId: made.survey.id }, { to: "everyone", emails: 0 });
    if (sent.status === 409) sent = await asForm("zach", routes.surveySend.POST, { surveyId: made.survey.id }, { to: "everyone", emails: sent.body.emails });
    ok(sent, "send");
    let waiting = await lib.waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date());
    assert.deepEqual(waiting.map((card) => card.kind), ["after"]);
    // Dev left, so the survey at the end is not his (Q48: everyone still on the programme at the end).
    assert.equal(tokenOf(made.survey.id, "dev"), null);
    at("2026-12-08T19:45:00Z");
    ok(await asForm(null, routes.surveyAnswer.POST, {}, { token: tokenOf(made.survey.id, "amara"), answers: {} }), "Amara answers");
    waiting = await lib.waiting.surveysWaitingFor(world.db, { uid: "amara" }, new Date());
    assert.deepEqual(waiting, []);
  });

  test("in session 6 each answers again, then opens the card sealed in week 1, and reads both side by side", async () => {
    at("2026-12-08T18:30:00Z");
    // The policy: a pack you pick "you can change until your session starts". Group B's sixth started at 6pm.
    const pick = stored(6).chooseOnes.find((block) => block.givenBy === "fellow");
    for (const who of ["amara", "bea"]) {
      const late = await asCourse(who, routes.packs.PUT, { runId: RUN.agi, blockId: pick.id }, { weekId: "w06", packId: pick.packs[0].id });
      assert.equal(late.status, 409, `${who} after the start: ${late.status} ${JSON.stringify(late.body)}`);
    }
    for (const who of ["amara", "bea"]) {
      const card = (await w.weekShell(who, 6)).props.predictions;
      assert.equal(card.stage, "open");
      for (const question of card.card.questions) {
        const value = question.kind === "sentence" ? "The one by the harbour." : Math.min(question.max, 60);
        ok(await asCourse(who, routes.predictions.PUT, { runId: RUN.agi }, { stage: "now", questionId: question.id, value }), `${who} answers again`);
      }
      ok(await asCourse(who, routes.predictions.POST, { runId: RUN.agi }, { action: "open" }), `${who} opens`);
      const after = (await w.weekShell(who, 6)).props.predictions;
      assert.equal(after.opened.answers.q1, 40);
      assert.equal(after.now.answers.q1, 60);
    }
    at("2026-12-08T20:20:00Z");
    await register("rahul", B, 6, ["amara", "bea"]);
  });
});

// ---------------------------------------------------------------------------
// 8. After the end: who finished and the certificates
// ---------------------------------------------------------------------------

describe("8. after the end (Group C's last session ends at 3pm on Wed 9 Dec)", () => {
  test("the lead sets who counts as finished; Amara and Bea both finished, and their pages say so", async () => {
    at("2026-12-10T10:00:00Z");
    ok(await asForm("claudia", routes.rule.PUT, { roundId: ROUND, programmeId: AGI }, { atLeast: 4 }), "the rule");
    for (const who of ["amara", "bea"]) {
      const overview = await w.overview(who);
      assert.equal(overview.body.finished, true, who);
    }
    const dev = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "dev");
    // Leavers keep nothing: the page says Dev left, and his answered survey has gone from it.
    assert.equal(dev.text, "My programmes AGI Strategy You left AGI Strategy That was on Fri 13 Nov. Thanks for coming along. Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do.");
    await w.asBrowser("amara", 6, ticksOf("amara"));
    const amara = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "amara");
    assert.match(amara.text, /^My programmes AGI Strategy You finished AGI Strategy\. Autumn 2026 · Group B · with Rahul, Sofia and Bea Your survey at the end Sent Tue 8 Dec\. Thank you\. It’s here until Sat 9 Dec 2028, when your name comes off your answers\. What you keep Your action plan Week 6 The reading list for all 6 weeks/);
    await w.asBrowser("bea", 6, ticksOf("bea"));
    const bea = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "bea");
    // W-self again: "with Rahul, Sofia and Bea", on Bea's own page.
    assert.match(bea.text, /^My programmes AGI Strategy You finished AGI Strategy\. Autumn 2026 · Group B · with Rahul, Sofia and Bea The survey at the end/);
  });

  test("ratings at the end: Rahul rates Amara and never Bea, his co-facilitator; the lead rates Bea; nobody rates themselves", async () => {
    const rate = (who, uid) => asCourse(who, routes.ratings.POST, { groupId: B }, { uid, answers: { f2: 4 } });
    ok(await rate("rahul", "amara"), "Rahul rates Amara");
    ok(await rate("bea", "amara"), "Bea rates Amara");
    assert.equal((await rate("rahul", "bea")).status, 403);
    assert.equal((await rate("sofia", "bea")).status, 403);
    assert.equal((await rate("bea", "bea")).status, 403);
    ok(await rate("claudia", "bea"), "Claudia rates Bea");
  });

  test("the certificates: one email each; Bea's carries both of hers", async () => {
    world.mail.length = 0;
    // The certificates' code pages its reads with limit(), so it is handed the course view.
    ok(await asCourse("claudia", routes.certificatesTest.POST, { roundId: ROUND, programmeId: AGI }), "test");
    world.mail.length = 0;
    const asked = await asCourse("claudia", routes.certificates.POST, { roundId: ROUND, programmeId: AGI }, { certificates: 1, emails: 1 });
    assert.equal(asked.status, 409, "a send names the counts it is about to make");
    const sent = await asCourse("claudia", routes.certificates.POST, { roundId: ROUND, programmeId: AGI }, { certificates: asked.body.certificates, emails: asked.body.emails });
    ok(sent, "send");
    // The button's count is the emails it hands over: one a person, both of Bea's certificates in one.
    assert.equal(world.mail.length, asked.body.emails);
    assert.equal(mailTo("amara@example.com").length, 1);
    const bea = mailTo("bea@example.com");
    assert.equal(bea.length, 1);
    assert.match(bea[0].text, /See your certificate for finishing/);
    assert.match(bea[0].text, /See your certificate for facilitating|for facilitating/);
    assert.equal(mailTo("dev@example.com").length, 0);
    await w.asBrowser("bea", 6, ticksOf("bea"));
    const beaRun = await serverPage(["[runId]", "page.tsx"], { runId: RUN.agi }, "bea");
    assert.match(beaRun.text, /Your certificates .* See your certificate for finishing.* See your certificate for facilitating/);
  });
});
