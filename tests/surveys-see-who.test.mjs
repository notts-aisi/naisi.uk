/**
 * NAMES ON A SURVEY'S OWN PAGES (docs/surveys.md, "The admins' pages" and
 * "Names on a survey's own pages"), THROUGH THE REAL ROUTES, PAGES AND
 * LIBRARIES.
 *
 * What is held here:
 *
 *  - ONLY AN ADMIN opens "See who" behind a bar, "Whose is this?" beside a
 *    comment, or the Answers tab, and downloads one question's totals: never
 *    the programme's lead, another lead, a facilitator, a committee member,
 *    a member or somebody signed out, and never in a view-as session. A
 *    refusal records nothing and reads nothing.
 *  - EVERY OPENING IS RECORDED BEFORE ANY NAME IS READ, in the openings log
 *    (`src/lib/firestore/recordOpenings.ts`): who, whose by an id, the survey
 *    and when, and never which bar or which comment. When it cannot be
 *    recorded, nobody is named. Names, never an address.
 *  - THE BAR IS THE ONE ON THE SCREEN: the people behind it are its count,
 *    by the same counting, under the same filters; a bar whose count has
 *    moved opens nothing.
 *  - A PAGE NAMES NOBODY AND RECORDS NOTHING: the Results page and the
 *    Answers tab's page read no name and write nothing, so a prefetch or a
 *    preview of either records nothing.
 *  - The file of one question names nobody, writes nothing and is not a
 *    recorded download. The survey's log names who opened, never whose.
 *  - The chart model: every bar's people are its count, for every template.
 *
 * Two worlds: `tests/lib/surveyWorld.mjs` (AGI Strategy, from Thu 29 Oct
 * 2026) and `tests/lib/eventSurveyWorld.mjs` (VR games night, Sun 1 Nov).
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NOW, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";
import { LATE, NEXT_DAY, RSVP, makeEventSurveyWorld } from "./lib/eventSurveyWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { withEveryRequired } from "./lib/surveyAnswers.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const w = await makeSurveyWorld("__surveysSeeWho");
const { call } = w;
const route = (name) => w.loadTs(join("app", "api", "surveys", "[surveyId]", name, "route.ts"));
const whoRoute = await route("who");
const answersRoute = await route("answers");
const totalsRoute = await route("totals");
const personRoute = await w.loadTs(join("app", "api", "surveys", "[surveyId]", "people", "[who]", "route.ts"));
const logPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "log", "page.tsx"))).default;
const charts = await w.loadTs(join("lib", "surveys", "charts.ts"));
const results = await w.loadTs(join("lib", "surveys", "results.ts"));
const templates = w.lib.templates;
const { CHART_WORDS, ANSWERS_WORDS, REFUSAL } = w.lib.words;

/** Thu 29 Oct 2026, noon: before any group has met. */
const ANSWERED = new Date("2026-10-29T12:00:00Z");
/** Tue 3 Nov 2026, 11:02am: an admin opens names. */
const OPENED = new Date("2026-11-03T11:02:00Z");

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];

/** Every row of the openings log, oldest first, as stored. */
const openings = (world = w.world) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("recordOpenings/"))
    .map((path) => ({ id: path.slice("recordOpenings/".length), ...world.db.read(path) }));

/** The before survey sent to the four holding a place; Amara, Bea and Dev answer; Tariq does not. */
async function answered(t) {
  clock(t);
  w.reset(surveySeed());
  const id = (await w.make()).body.survey.id;
  assert.equal((await w.sendFirst(id)).status, 200);
  t.mock.timers.setTime(ANSWERED.getTime());
  const said = {
    amara: { q_c1: { type: "choice", optionId: "o_stage1" }, q_p6: { type: "text", text: "To explain the risk clearly." } },
    bea: { q_c1: { type: "choice", optionId: "o_stage1" }, q_p6: { type: "text", text: "A map of who works on what." } },
    dev: { q_c1: { type: "choice", optionId: "o_stage3" }, q_p6: { type: "text", text: "Better questions to ask." } },
  };
  for (const [uid, answers] of Object.entries(said)) assert.equal((await w.answerByLink(w.tokenOf(id, uid), answers)).status, 200);
  t.mock.timers.setTime(OPENED.getTime());
  return id;
}

/** The key of the bar of `optionId` on a choice question of survey `id`. */
function optionBar(id, questionId, optionId) {
  const question = w.survey(id).items.find((item) => item.id === questionId);
  const at = question.options.findIndex((option) => option.id === optionId);
  assert.ok(at > -1, `${optionId} is not an option of ${questionId}`);
  return `o${at}`;
}

/** The id of the answer a person sent to survey `id`. */
function answerIdOf(id, uid) {
  const row = w.answers(id).find((answer) => answer.respondent?.uid === uid);
  assert.ok(row, `${uid} has no answer`);
  return row.path.slice("surveyAnswers/".length);
}

const seeWho = (who, id, body, options = {}) => call(who, whoRoute.POST, { surveyId: id }, { body, ...options });
const openTab = (who, id, options = {}) => call(who, answersRoute.POST, { surveyId: id }, options);

/** The file of one question, as `who` asks for it: a file, or a refusal. */
async function totalsAs(who, id, query) {
  w.world.user = w.sessionOf(who);
  const response = await totalsRoute.GET(new Request(`https://naisi.invalid/api/surveys/${id}/totals?${query}`), {
    params: Promise.resolve({ surveyId: id }),
  });
  if (response instanceof Response) return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) };
  return { status: response.status, body: response.body };
}

/**
 * The database's reads and the openings log's writes, in order, while `run`
 * runs: "read users" for a name, "recorded" for an opening row.
 */
async function inOrder(run, world = w.world) {
  const order = [];
  const collection = world.db.collection;
  const getAll = world.db.getAll;
  world.db.collection = (path) => {
    const inner = collection(path);
    if (["users", "eventRsvps", "eventCheckIns"].includes(path)) order.push(`read ${path}`);
    if (path !== "recordOpenings") return inner;
    return {
      ...inner,
      doc: (docId) => {
        const ref = inner.doc(docId);
        return {
          ...ref,
          create: async (data) => {
            order.push("recorded");
            return ref.create(data);
          },
        };
      },
    };
  };
  world.db.getAll = (...refs) => {
    order.push("read by id");
    return getAll(...refs);
  };
  try {
    return { result: await run(), order };
  } finally {
    world.db.collection = collection;
    world.db.getAll = getAll;
  }
}

/** Runs `run` with the openings log refusing every write; answers what was touched. */
async function unrecordable(run, world = w.world) {
  const touched = [];
  const collection = world.db.collection;
  const getAll = world.db.getAll;
  world.db.collection = (path) => {
    touched.push(path);
    const inner = collection(path);
    if (path !== "recordOpenings") return inner;
    return {
      ...inner,
      doc: () => ({
        id: "unwritten",
        create: async () => {
          throw new Error("unavailable");
        },
      }),
    };
  };
  world.db.getAll = (...refs) => {
    touched.push("by id");
    return getAll(...refs);
  };
  try {
    return { result: await run(), touched };
  } finally {
    world.db.collection = collection;
    world.db.getAll = getAll;
  }
}

const NOT_ADMINS = [
  ["claudia", "the programme's lead"],
  ["tess", "the lead of another programme"],
  ["rahul", "a facilitator of the run"],
  ["yusuf", "a committee member, the run's track lead"],
  ["lloyd", "a committee member who reviews the programme"],
  ["amara", "a person who answered"],
  ["nobody", "a member who holds no place"],
];

// ---------------------------------------------------------------------------
// 1. Who may open names
// ---------------------------------------------------------------------------

describe("1. only an admin opens names or downloads a question, and a refusal records and reads nothing", () => {
  test("See who, Whose is this?, the Answers tab and the file of one question, as every other kind of caller", async (t) => {
    const id = await answered(t);
    const bar = { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 };
    const comment = { question: "q_p6", comment: answerIdOf(id, "amara") };
    const before = w.everything();
    const touched = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      touched.push(path);
      return collection(path);
    };
    try {
      for (const [who, why] of NOT_ADMINS) {
        assert.deepEqual(short(await seeWho(who, id, bar)), [403, REFUSAL.adminOnly], `See who: ${why}`);
        assert.deepEqual(short(await seeWho(who, id, comment)), [403, REFUSAL.adminOnly], `Whose is this: ${why}`);
        assert.deepEqual(short(await openTab(who, id)), [403, REFUSAL.adminOnly], `the Answers tab: ${why}`);
        assert.deepEqual(short(await totalsAs(who, id, "question=q_c1")), [403, REFUSAL.adminOnly], `the file: ${why}`);
      }
      assert.deepEqual(short(await seeWho(null, id, bar)), [401, REFUSAL.notSignedIn]);
      assert.deepEqual(short(await openTab(null, id)), [401, REFUSAL.notSignedIn]);
      assert.deepEqual(short(await totalsAs(null, id, "question=q_c1")), [401, REFUSAL.notSignedIn]);
      // An admin viewing the site as somebody opens nothing.
      assert.equal((await seeWho("zach", id, bar, { viewAs: true })).status, 403);
      assert.equal((await openTab("zach", id, { viewAs: true })).status, 403);
    } finally {
      w.world.db.collection = collection;
    }
    assert.deepEqual(touched, [], "a refused caller reached the database");
    assert.equal(w.everything(), before, "a refusal changed something");
    assert.deepEqual(openings(), []);
  });

  test("each route refuses a view-as session first, then anybody but an admin, before the database", () => {
    for (const name of ["who", "answers"]) {
      const source = stripSource(read("app", "api", "surveys", "[surveyId]", name, "route.ts"), { keepStrings: true });
      const guard = source.indexOf("const blocked = await assertNotImpersonating();");
      const refused = source.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
      const db = source.indexOf("getAdminDb()");
      assert.ok(source.indexOf("export async function POST(") < guard && guard < refused && refused < db, `${name}: the gate is not first`);
      assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)\b/, `${name}: opening names is a POST alone`);
    }
    // The file of one question writes nothing, so it is a GET, refused before the database all the same.
    const file = stripSource(read("app", "api", "surveys", "[surveyId]", "totals", "route.ts"), { keepStrings: true });
    const refused = file.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
    assert.ok(refused > -1 && refused < file.indexOf("getAdminDb()"));
    assert.doesNotMatch(file, /export async function (POST|PUT|PATCH|DELETE)\b/);
    assert.doesNotMatch(file, /logExport|recordOpenings|openSurvey/, "the file of one question records something");
  });
});

// ---------------------------------------------------------------------------
// 2. Recorded first
// ---------------------------------------------------------------------------

describe("2. every opening is recorded before any name is read, and refused whole when it cannot be", () => {
  test("See who and Whose is this?: the row first, then the names", async (t) => {
    const id = await answered(t);
    for (const body of [
      { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 },
      { question: "q_p6", comment: answerIdOf(id, "bea") },
    ]) {
      const { result, order } = await inOrder(() => seeWho("zach", id, body));
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(order[0], "recorded", `a name was read before the opening was recorded: ${order.join(", ")}`);
      assert.ok(order.includes("read users"));
    }
  });

  test("the Answers tab: the row first, then the names", async (t) => {
    const id = await answered(t);
    const { result, order } = await inOrder(() => openTab("zach", id));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(order[0], "recorded", `a name was read before the opening was recorded: ${order.join(", ")}`);
  });

  test("when the row cannot be written, nobody is named and no name is read", async (t) => {
    const id = await answered(t);
    for (const [ask, words] of [
      [() => seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 }), CHART_WORDS.notRecorded],
      [() => seeWho("zach", id, { question: "q_p6", comment: answerIdOf(id, "amara") }), CHART_WORDS.notRecorded],
      [() => openTab("zach", id), ANSWERS_WORDS.notRecorded],
    ]) {
      const { result, touched } = await unrecordable(ask);
      assert.deepEqual(short(result), [500, words]);
      assert.deepEqual(Object.keys(result.body), ["error"]);
      for (const path of ["users", "by id"]) assert.ok(!touched.includes(path), `${path} was read although the opening was not recorded`);
    }
    assert.equal(CHART_WORDS.notRecorded, "We couldn’t record that you opened these names, so they stay closed. Try again.");
    assert.deepEqual(openings(), []);
  });

  test("the one writer records first, and its callers read names only inside it", () => {
    const log = stripSource(read("lib", "firestore", "recordOpenings.ts"), { keepStrings: true });
    const writer = log.slice(log.indexOf("export async function openSurveyNamesRecorded"));
    const created = writer.indexOf("await ref.create({");
    assert.ok(created > -1 && created < writer.indexOf("const value = await read();"));
    assert.match(writer, /return \{ ok: false \};\s*\}\s*const value = await read\(\);\s*return \{ ok: true, value, openingId: ref\.id \};/);
    const seeWhoSource = stripSource(read("lib", "surveys", "seeWho.ts"), { keepStrings: true });
    assert.ok(seeWhoSource.indexOf("const opened = await openSurveyNamesRecorded(") < seeWhoSource.indexOf("() => namesOfSubjects(db, survey, subjects, actor),"));
    assert.equal(seeWhoSource.split("namesOfSubjects(").length, 3, "namesOfSubjects is called somewhere else too");
    assert.match(seeWhoSource, /if \(!opened\.ok\) return \{ kind: "not-recorded" \};/);
    const table = stripSource(read("lib", "surveys", "answersTable.ts"), { keepStrings: true });
    assert.ok(table.indexOf("const opened = await openSurveyNamesRecorded(") < table.indexOf("() => readTable(db, survey, answers, rows, recorded, now, actor),"));
    assert.equal(table.split("readTable(").length, 3, "readTable is called somewhere else too");
    assert.match(table, /if \(!opened\.ok\) return \{ kind: "not-recorded" \};/);
  });
});

// ---------------------------------------------------------------------------
// 3. What See who and Whose is this? open
// ---------------------------------------------------------------------------

describe("3. See who opens the people behind the bar on the screen; Whose is this? one comment's writer; names, never an address", () => {
  test("a bar's people are its count, by name, in the order of their words; the line that stays says who opened them and when", async (t) => {
    const id = await answered(t);
    const answer = await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    // Each by the names rule for the admin who opened them (`nameForViewer`): the account's full name.
    assert.deepEqual(answer.body, { who: { names: ["Amara Okafor", "Bea Lindqvist"], namesOff: 0, opened: "Opened by Zach, Tue 3 Nov" } });
    const comment = await seeWho("zach", id, { question: "q_p6", comment: answerIdOf(id, "dev") });
    assert.deepEqual(comment.body, { who: { names: ["Dev Patel"], namesOff: 0, opened: "Opened by Zach, Tue 3 Nov" } });
    for (const body of [answer.body, comment.body]) assert.doesNotMatch(JSON.stringify(body), /@|example\.com/, "an address was handed over");
  });

  test("a bar whose count has moved since the page was drawn opens nothing and records nothing", async (t) => {
    const id = await answered(t);
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 3 })), [409, CHART_WORDS.changed]);
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_c1", bar: "o99", count: 1 })), [409, CHART_WORDS.changed]);
    assert.deepEqual(openings(), []);
  });

  test("an unknown question, a comment no answer holds, a body that is not one, and names that have come off", async (t) => {
    const id = await answered(t);
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_nothing", bar: "o1", count: 1 })), [404, CHART_WORDS.noQuestion]);
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_p6", comment: "no-such-answer" })), [404, CHART_WORDS.noComment]);
    // A comment is found by the answer it came from, on the question it is a comment of.
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_c1", comment: answerIdOf(id, "amara") })), [404, CHART_WORDS.noComment]);
    for (const body of [{}, { question: "q_c1" }, { question: "q_c1", bar: "o1" }, { question: "q_c1", bar: "o1", count: 0 }, { question: "q_c1", bar: "x1", count: 1 }, { question: "q_c1", bar: "o1", comment: "a", count: 1 }]) {
      assert.deepEqual(short(await seeWho("zach", id, body)), [400, REFUSAL.body], JSON.stringify(body));
    }
    assert.deepEqual(short(await seeWho("zach", "no-such-survey", { question: "q_c1", bar: "o1", count: 1 })), [404, REFUSAL.noSurvey]);
    w.world.db.seed(`surveys/${id}`, { ...w.survey(id), namesOffAt: OPENED });
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 })), [410, CHART_WORDS.namesOff]);
    assert.deepEqual(short(await openTab("zach", id)), [410, ANSWERS_WORDS.namesOff]);
    assert.deepEqual(openings(), []);
  });
});

// ---------------------------------------------------------------------------
// 4. What a row holds
// ---------------------------------------------------------------------------

describe("4. a row says who opened whose answers on which survey and when, never which bar or which comment", () => {
  test("the bar's, the comment's and the tab's rows", async (t) => {
    const id = await answered(t);
    await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 });
    await seeWho("zach", id, { question: "q_p6", comment: answerIdOf(id, "dev") });
    await openTab("zach", id);
    const rows = openings();
    assert.deepEqual(
      rows.map(({ kind, subjectUids, subjectSignupIds }) => ({ kind, subjectUids: [...subjectUids].sort(), subjectSignupIds })),
      [
        { kind: "survey-bar", subjectUids: ["amara", "bea"], subjectSignupIds: [] },
        { kind: "survey-comment", subjectUids: ["dev"], subjectSignupIds: [] },
        { kind: "survey-table", subjectUids: ["amara", "bea", "dev"], subjectSignupIds: [] },
      ],
    );
    for (const { id: rowId, ...row } of rows) {
      assert.ok(rowId);
      assert.deepEqual(Object.keys(row).sort(), ["actorName", "actorUid", "kind", "openedAt", "subjectSignupIds", "subjectUids", "surveyId"]);
      assert.deepEqual([row.actorUid, row.actorName, row.surveyId, row.openedAt.toISOString()], ["zach", "Zach Levin", id, OPENED.toISOString()]);
      const stored = JSON.stringify(row);
      for (const said of ["q_c1", "o_stage", "q_p6", "Better questions", "To explain the risk", "runId"]) {
        assert.ok(!stored.includes(said), `a row holds ${said}`);
      }
    }
  });

  test("one person's page lists every opening that named them, newest first, with where it was", async (t) => {
    const id = await answered(t);
    await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 });
    t.mock.timers.setTime(OPENED.getTime() + 60_000);
    await openTab("zach", id);
    t.mock.timers.setTime(OPENED.getTime() + 120_000);
    // Dev was behind no bar that was opened: the tab named him, and his own page now.
    const amara = (await call("zach", personRoute.POST, { surveyId: id, who: "amara" })).body.person;
    assert.deepEqual(amara.openings.map((each) => each.line), [
      "Zach Levin · Tue 3 Nov, 11:04am",
      "Zach Levin · Tue 3 Nov, 11:03am · the Answers tab",
      "Zach Levin · Tue 3 Nov, 11:02am · See who, on the results",
    ]);
    const dev = (await call("zach", personRoute.POST, { surveyId: id, who: "dev" })).body.person;
    assert.deepEqual(dev.openings.map((each) => each.line), ["Zach Levin · Tue 3 Nov, 11:04am", "Zach Levin · Tue 3 Nov, 11:03am · the Answers tab"]);
  });
});

// ---------------------------------------------------------------------------
// 5. The pages name nobody and record nothing
// ---------------------------------------------------------------------------

describe("5. the Results page and the Answers tab's page name nobody and record nothing; a prefetch opens nothing", () => {
  test("the Results page: charts, See who and the downloads for an admin, no name, no opening", async (t) => {
    const id = await answered(t);
    const before = w.everything();
    const { result: page, order } = await inOrder(() => w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach"));
    assert.equal(w.everything(), before, "drawing the Results page wrote something");
    assert.ok(!order.includes("read users"), "the Results page read a name");
    for (const words of [
      CHART_WORDS.namesNote,
      "3 answers from the 4 people it was sent to (75%).",
      "2 · 67% See who (2)",
      "1 · 33% See who (1)",
      "0 · 0% Nobody",
      CHART_WORDS.downloadQuestion,
      CHART_WORDS.downloadChart,
      "Whose is this?",
    ]) {
      assert.ok(page.text.includes(words), `missing "${words}"`);
    }
    assert.doesNotMatch(page.text, /Amara|\bBea\b|\bDev\b|Okafor|Lindqvist/, "the Results page names somebody");
    assert.ok(page.html.includes(`href="/api/surveys/${id}/totals?question=q_c1" download=""`));
    assert.deepEqual(openings(), []);
  });

  test("the Answers tab's page reads the survey and its rows' counts, and nothing of anybody", async (t) => {
    const id = await answered(t);
    const before = w.everything();
    const touched = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      touched.push(path);
      return collection(path);
    };
    let page;
    try {
      page = await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: id }) }, "zach");
    } finally {
      w.world.db.collection = collection;
    }
    assert.deepEqual([...new Set(touched)].sort(), ["surveyPeople", "surveys"], "the page read something besides the survey and its rows");
    assert.equal(w.everything(), before, "drawing the page wrote something");
    assert.ok(page.text.endsWith(`Results Answers 3 Questions Send ${ANSWERS_WORDS.opening}`), page.text);
    assert.doesNotMatch(page.text, /Amara|\bBea\b|\bDev\b|To explain the risk/);
    assert.deepEqual(openings(), []);
    // The page's file reads the head alone; the layout above it sends everybody but an admin away.
    const file = stripSource(read("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "answered", "page.tsx"), { keepStrings: true });
    assert.doesNotMatch(file, /answersOf|openAnswersTable|namesOf|users/);
    assert.match(read("app", "(app)", "admin", "(admin-only)", "layout.tsx"), /await requireAdminPage\(\);/);
  });
});

// ---------------------------------------------------------------------------
// 6. The Answers tab
// ---------------------------------------------------------------------------

describe("6. the Answers tab: every answer in one table, laid out as the download, and who has not answered", () => {
  test("a programme's survey: its rows, columns, groups and the line that says it was recorded", async (t) => {
    const id = await answered(t);
    const answer = await openTab("zach", id);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const view = answer.body.answers;
    assert.equal(view.recorded, "You’re seeing names because you’re an admin. Opening this tab was recorded: Zach, Tue 3 Nov, 11:02am.");
    assert.equal(view.asHeading, ANSWERS_WORDS.group);
    // The columns are the download's own, after its four about the person.
    const file = await w.exportAs("zach", id);
    const header = file.text.trim().split(/\r?\n/)[0];
    assert.ok(header.endsWith(view.columns.map((column) => (/[",]/.test(column) ? `"${column.replace(/"/g, '""')}"` : column)).join(",")), "the tab's columns are not the download's");
    // By name, as the names rule shows the admin (`nameForViewer`: in full), with their group as
    // Publish told it: Dev's placement is not told yet.
    assert.deepEqual(view.rows.map((row) => [row.name, row.who, row.as]), [
      ["Amara Okafor", "amara", "Group B"],
      ["Bea Lindqvist", "bea", "Group A"],
      ["Dev Patel", "dev", ANSWERS_WORDS.noGroup],
    ]);
    const amara = view.rows[0];
    assert.equal(amara.sent, "Sent Thu 29 Oct, 12pm, from their own link.");
    assert.equal(amara.cells[view.columns.findIndex((column) => column.startsWith("14."))], "To explain the risk clearly.");
    assert.deepEqual(view.notAnswered, [{ who: "tariq", name: "Tariq Mensah", line: "Sent Thu 29 Oct, 9am" }]);
    assert.doesNotMatch(JSON.stringify(view), /@|example\.com/, "the tab hands over an address");
  });
});

// ---------------------------------------------------------------------------
// 7. The file of one question
// ---------------------------------------------------------------------------

describe("7. the file of one question: totals and comments, naming nobody, writing nothing, not a recorded download", () => {
  test("an admin's file, and nothing written", async (t) => {
    const id = await answered(t);
    const before = w.everything();
    const file = await totalsAs("zach", id, "question=q_c1");
    assert.equal(file.status, 200);
    assert.match(file.headers["content-disposition"], /^attachment; filename="agi-strategy-before-q5-2026-11-03\.csv"$/);
    const lines = file.text.trim().split(/\r?\n/);
    assert.equal(lines[0], "Survey,Question,Counted,Answers counted");
    assert.equal(lines[1], "AGI Strategy: before,5. Which best describes you right now?,Everyone who answered,3");
    assert.ok(lines.includes("Answer,\"Count, of 3\",Share"));
    assert.ok(lines.some((line) => /,2,67%$/.test(line)), file.text);
    const comments = await totalsAs("zach", id, "question=q_p6");
    assert.ok(comments.text.includes("Better questions to ask.") && comments.text.includes("To explain the risk clearly."));
    for (const each of [file, comments]) assert.doesNotMatch(each.text, /Amara|\bBea\b|\bDev\b|@/, "the file names somebody");
    assert.equal(w.everything(), before, "the file wrote something");
    assert.deepEqual(short(await totalsAs("zach", id, "question=")), [400, REFUSAL.body]);
    assert.deepEqual(short(await totalsAs("zach", id, "question=q_nothing")), [404, CHART_WORDS.noQuestion]);
  });
});

// ---------------------------------------------------------------------------
// 8. The filters
// ---------------------------------------------------------------------------

describe("8. the filters: a group's results, and See who under them", () => {
  test("Who: everybody, each group with answers, nobody's group; the results, See who and the file count that group alone", async (t) => {
    const id = await answered(t);
    const page = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    // The groups in the one order of a run's groups (`compareGroupsByMeeting`): B meets on Tuesdays, A on Thursdays.
    assert.ok(page.text.includes("Who Everyone who answered (3) Group B (1) Group A (1) In no group (1)"), page.text.slice(0, 600));
    const groupB = w.world.db.read(`courseEnrolments/${w.survey(id).runId}__amara`).groupId;
    const narrowed = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({ who: groupB }) }, "zach");
    assert.ok(narrowed.text.includes("1 answer from Group B."), narrowed.text.slice(0, 600));
    assert.ok(narrowed.text.includes("1 · 100% See who (1)"));
    assert.ok(narrowed.html.includes(`totals?question=q_c1&amp;who=${groupB}`));
    const bar = optionBar(id, "q_c1", "o_stage1");
    assert.deepEqual((await seeWho("zach", id, { question: "q_c1", bar, count: 1, who: groupB })).body.who.names, ["Amara Okafor"]);
    assert.deepEqual(short(await seeWho("zach", id, { question: "q_c1", bar, count: 2, who: groupB })), [409, CHART_WORDS.changed]);
    const file = await totalsAs("zach", id, `question=q_c1&who=${groupB}`);
    assert.ok(file.text.split(/\r?\n/)[1].endsWith(",Group B,1"), file.text);
  });
});

// ---------------------------------------------------------------------------
// 9. The log
// ---------------------------------------------------------------------------

describe("9. the survey's log: who opened names and downloaded, and when, never whose", () => {
  test("each opening and the download, newest first, and nothing of anybody", async (t) => {
    const id = await answered(t);
    await seeWho("zach", id, { question: "q_c1", bar: optionBar(id, "q_c1", "o_stage1"), count: 2 });
    t.mock.timers.setTime(OPENED.getTime() + 60_000);
    await openTab("zach", id);
    t.mock.timers.setTime(OPENED.getTime() + 120_000);
    assert.equal((await w.exportAs("zach", id)).status, 200);
    const before = w.everything();
    const page = await w.page(logPage, { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.equal(w.everything(), before, "drawing the log wrote something");
    assert.ok(
      page.text.includes(
        "Tue 3 Nov, 11:04am Zach Levin downloaded all answers: 3 people " +
          "Tue 3 Nov, 11:03am Zach Levin opened the Answers tab: 3 people " +
          "Tue 3 Nov, 11:02am Zach Levin opened who is behind a bar: 2 people",
      ),
      page.text,
    );
    assert.doesNotMatch(page.text, /Amara|\bBea\b|\bDev\b|Tariq/, "the log names whose answers were opened");
  });
});

// ---------------------------------------------------------------------------
// 10. A survey after an event: guests, and Came as
// ---------------------------------------------------------------------------

describe("10. a survey after an event: a guest by their sign-up, and Came as", async () => {
  const e = await makeEventSurveyWorld("__surveysSeeWhoEvents");
  const eventItems = await e.load("lib/surveys/items.ts");
  const press = async (path, who, id, body = {}) => e.call(who, (await e.route(`surveys/[surveyId]/${path}`)).POST, { surveyId: id }, { body });
  const eventOpenings = () => openings(e.world);

  /** Kofi answers with the QR code; Gwen, a guest, by her emailed link; both say "Yes" to another. */
  async function eventAnswered(t) {
    t.mock.timers.enable({ apis: ["Date"], now: LATE });
    e.reset();
    const id = (await e.make()).body.survey.id;
    await press("open-at-event", "zach", id);
    const kofi = withEveryRequired(eventItems, e.survey(id).items, { q_ev_again: { type: "choice", optionId: "o_ev_yes" }, q_ev_change: { type: "text", text: "More headsets." } });
    assert.equal((await press("answer", "kofi", id, { answers: kofi })).status, 200);
    t.mock.timers.setTime(NEXT_DAY.getTime());
    await press("test", "zach", id, { email: "survey" });
    e.world.mail.length = 0;
    assert.equal((await press("send", "zach", id, { to: "everyone", emails: 4 })).status, 200);
    const link = e.linkIn(e.world.mail.find((message) => message.to === "gwen@example.com"));
    const token = link.slice(link.lastIndexOf("/") + 1);
    const gwen = withEveryRequired(eventItems, e.survey(id).items, { q_ev_again: { type: "choice", optionId: "o_ev_yes" } });
    assert.equal((await e.call(null, (await e.route("surveys/answer")).POST, {}, { body: { token, answers: gwen } })).status, 200);
    return id;
  }

  test("See who names the account and the guest; the row keeps the guest by their sign-up; Came as narrows to guests", async (t) => {
    const id = await eventAnswered(t);
    const again = e.survey(id).items.find((item) => item.id === "q_ev_again");
    const bar = `o${again.options.findIndex((option) => option.id === "o_ev_yes")}`;
    const who = await e.loadTs(join("app", "api", "surveys", "[surveyId]", "who", "route.ts"));
    const { result, order } = await inOrder(() => e.call("zach", who.POST, { surveyId: id }, { body: { question: "q_ev_again", bar, count: 2 } }), e.world);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    // An account by the names rule for the admin (`nameForViewer`: in full); a guest by the name they gave the event.
    assert.deepEqual(result.body.who.names, ["Gwen Price", "Kofi Asante"]);
    assert.equal(order[0], "recorded", `a name was read before the opening was recorded: ${order.join(", ")}`);
    const [row] = eventOpenings();
    assert.deepEqual([row.kind, row.subjectUids, row.subjectSignupIds], ["survey-bar", ["kofi"], [RSVP.gwen]]);
    // Came as: guests counts Gwen's answer alone.
    const guests = await e.call("zach", who.POST, { surveyId: id }, { body: { question: "q_ev_again", bar, count: 1, as: "guests" } });
    assert.deepEqual(guests.body.who.names, ["Gwen Price"]);
    const page = await e.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/results/page.tsx", { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({ as: "guests" }) }, "zach");
    assert.ok(page.text.includes("Came as Members and guests Members Guests"), page.text.slice(0, 600));
    assert.ok(page.text.includes("1 answer from guests."), page.text.slice(0, 900));
    assert.doesNotMatch(page.text, /Gwen|Kofi/);
  });

  test("the Answers tab: As says member or guest, and the guest opens by their sign-up", async (t) => {
    const id = await eventAnswered(t);
    const answers = await e.loadTs(join("app", "api", "surveys", "[surveyId]", "answers", "route.ts"));
    const view = (await e.call("zach", answers.POST, { surveyId: id })).body.answers;
    assert.equal(view.asHeading, ANSWERS_WORDS.as);
    assert.deepEqual(view.rows.map((row) => [row.name, row.who, row.as, row.sent]), [
      ["Gwen Price", `g_${RSVP.gwen}`, ANSWERS_WORDS.guest, "Sent Mon 2 Nov, 10am, from their own link."],
      ["Kofi Asante", "kofi", ANSWERS_WORDS.member, "Sent Sun 1 Nov, 4:30pm, with the QR code, signed in."],
    ]);
    assert.deepEqual(eventOpenings().map((row) => [row.kind, row.subjectUids, row.subjectSignupIds]), [["survey-table", ["kofi"], [RSVP.gwen]]]);
  });
});

// ---------------------------------------------------------------------------
// 11. The chart model: one count
// ---------------------------------------------------------------------------

describe("11. the chart model: every bar's people are its count, and a comment's key is the answer it came from", () => {
  /** The n-th person's answer to a question: the n-th choice, point or value, so the bars fill unevenly. */
  function nthAnswer(question, n) {
    const options = question.options ?? [];
    switch (question.type) {
      case "singleChoice":
        return { type: "choice", optionId: options[n % options.length].id };
      case "multipleChoice": {
        const every = options.filter((_, at) => (at + n) % 2 === 0).map((option) => option.id);
        const picked = (every.length > 0 ? every : [options[0].id]).slice(0, question.maxPicks ?? options.length);
        return question.most ? { type: "choices", optionIds: picked, most: picked[n % picked.length] } : { type: "choices", optionIds: picked };
      }
      case "rating":
        return { type: "rating", value: 1 + (n % (question.rating?.max ?? 5)) };
      case "scale":
        return { type: "scale", value: question.min + (n % (question.max - question.min + 1)) };
      case "percent":
        return { type: "percent", value: (n * 17) % 101 };
      case "number":
        return { type: "number", value: n * 2 };
      case "lines":
        return { type: "lines", values: Object.fromEntries(question.lines.map((line, at) => [line.id, 1 + ((n + at) % question.scale.max)])) };
      default:
        // Every third person leaves a comment out, so a comment's key is never just its place.
        return n % 3 === 0 ? undefined : { type: "text", text: `Answer ${n % 5}` };
    }
  }

  test("for every question of every template, over answers of every kind", async () => {
    const eventTemplate = await w.loadTs(join("lib", "surveys", "events", "template.ts"));
    const checkInTemplate = await w.loadTs(join("lib", "surveys", "checkIns", "template.ts"));
    const every = [
      ...templates.SURVEY_TEMPLATES.flatMap((stage) => [
        templates.templateItems(stage, "fellowship", null),
        templates.templateItems(stage, "incubator", "alignment"),
      ]),
      eventTemplate.eventTemplateItems(),
      checkInTemplate.checkInItems({ parts: [{ id: "part_a", title: "Compute as a lever" }, { id: "part_b", title: "Races" }], hasReading: true }),
    ];
    let bars = 0;
    for (const items of every) {
      const questions = items.filter((item) => item.kind === "question");
      const sets = Array.from({ length: 12 }, (_, n) => ({
        id: `a${n}`,
        answers: Object.fromEntries(questions.flatMap((question) => {
          const answer = nthAnswer(question, n);
          return answer ? [[question.id, answer]] : [];
        })),
      }));
      for (const question of questions) {
        const [result] = results.surveyResults([question], sets);
        if (!result) continue;
        for (const group of charts.chartGroupsOf(result)) {
          for (const bar of group.bars) {
            assert.ok(charts.isBarKey(bar.key), bar.key);
            assert.equal(charts.behindBar(question, sets, bar.key).length, bar.count, `${question.id} ${bar.key}`);
            bars += 1;
          }
        }
        if (result.kind === "comments") {
          const keyed = charts.commentsWithKeys(question, sets);
          assert.deepEqual(keyed.map((comment) => comment.text), result.comments, question.id);
          assert.ok(keyed.every((comment) => sets.find((set) => set.id === comment.key)?.answers[question.id]?.text === comment.text));
        }
      }
    }
    assert.ok(bars > 200, `only ${bars} bars were checked`);
  });

  test("a scale is read from the top down, its ends in its words; keys are positional and never an answer's words", () => {
    const groups = charts.chartGroupsOf({
      kind: "scale",
      id: "q",
      number: 1,
      title: "How was it?",
      min: 1,
      minLabel: "Didn’t enjoy it",
      maxLabel: "Loved it",
      rows: [{ label: "", respondents: 15, counts: [0, 1, 2, 5, 7], mean: 4.2, median: 4 }],
      promoterScore: null,
    });
    assert.deepEqual(
      groups[0].bars.map((bar) => [bar.key, bar.label, bar.count, bar.percent]),
      [
        ["s0.4", "5: Loved it", 7, 47],
        ["s0.3", "4", 5, 33],
        ["s0.2", "3", 2, 13],
        ["s0.1", "2", 1, 7],
        ["s0.0", "1: Didn’t enjoy it", 0, 0],
      ],
    );
    for (const key of ["o1", "m12", "b4", "s0.4", "s10.10"]) assert.ok(charts.isBarKey(key), key);
    for (const key of ["", "o", "q_c1", "s1", "x1", "o1 ", "o1234"]) assert.ok(!charts.isBarKey(key), key);
  });
});

// ---------------------------------------------------------------------------
// 12. The tree
// ---------------------------------------------------------------------------

describe("12. the files that open names on a survey's own pages", () => {
  test("one writer, its two callers, and each called by its one route", () => {
    const naming = (pattern) => {
      const out = [];
      for (const file of walkSource(SRC)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        if (pattern.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) out.push(relative(SRC, file).split(sep).join("/"));
      }
      return out.sort();
    };
    assert.deepEqual(naming(/\bopenSurveyNamesRecorded\b/), ["lib/firestore/recordOpenings.ts", "lib/surveys/answersTable.ts", "lib/surveys/seeWho.ts"]);
    assert.deepEqual(naming(/\bopenWhoBehind\b/), ["app/api/surveys/[surveyId]/who/route.ts", "lib/surveys/seeWho.ts"]);
    assert.deepEqual(naming(/\bopenAnswersTable\b/), ["app/api/surveys/[surveyId]/answers/route.ts", "lib/surveys/answersTable.ts"]);
    // The survey's log is read by its one page's builder.
    assert.deepEqual(naming(/\bsurveyOpeningsOf\b/), ["lib/firestore/recordOpenings.ts", "lib/surveys/surveyLog.ts"]);
    // The keys of comments are asked for by the admins' Results page alone; the lead's page never asks.
    assert.deepEqual(naming(/\bkeys: true\b/), ["app/(app)/admin/(admin-only)/surveys/[surveyId]/results/page.tsx"]);
  });
});
