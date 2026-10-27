/**
 * ONE PERSON'S ANSWERS, OPENED BY AN ADMIN (board sv-person; docs/surveys.md,
 * "One person's answers"), THROUGH THE REAL ROUTE, PAGE AND LIBRARIES.
 *
 * What is held here:
 *
 *  - ONLY AN ADMIN OPENS THEM: never the programme's lead, another lead, a
 *    facilitator, a committee member, the person themselves or somebody
 *    signed out, and never in a view-as session. A refusal records nothing
 *    and reads nothing.
 *  - THE OPENING IS RECORDED FIRST, in the openings log
 *    (`src/lib/firestore/recordOpenings.ts`), with who, whose, which surveys
 *    and when, and never what the answers say; when it cannot be recorded,
 *    nothing of the person is read or shown.
 *  - WHAT IS SHOWN: the change questions with the start and the end side by
 *    side, each survey's own questions, every word the survey's own; when
 *    the name comes off; who has opened them. A survey after an event, a
 *    guest's answers included.
 *  - A NAME THAT HAS COME OFF has no answers to open, and says so.
 *  - THE OPENINGS ARE KEPT as the record of downloads is: no account
 *    deletion, names coming off or run's destroy takes one.
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
import { renderToStaticMarkup } from "react-dom/server";
import { NOW, RUN, makeSurveyWorld, surveySeed, textOf } from "./lib/surveyWorld.mjs";
import { EVENT_ID, LATE, NEXT_DAY, RSVP, makeEventSurveyWorld } from "./lib/eventSurveyWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const w = await makeSurveyWorld("__surveysOnePerson");
const { call } = w;
const opening = await w.loadTs(join("app", "api", "surveys", "[surveyId]", "people", "[who]", "route.ts"));
const personPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "answered", "[who]", "page.tsx"))).default;
const drawn = await w.loadTs(join("features", "surveys", "admin", "PersonAnswers.tsx"));
const words = w.lib.words;
const { PERSON_WORDS, REFUSAL } = words;
const layout = await w.loadTs(join("lib", "surveys", "onePersonLayout.ts"));
const namesOff = w.lib.namesOff;

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

/** Mon 30 Nov 2026, 7:52pm: the end of the programme, when the survey at the end is answered. */
const AT_END = new Date("2026-11-30T19:52:00Z");
/** Tue 1 Dec 2026, 11:04am: an admin opens the answers. */
const OPENED = new Date("2026-12-01T11:04:00Z");

/** Answers to the before survey, of each kind it asks. */
const BEFORE = {
  q_p3_level: { type: "choice", optionId: "o_masters" },
  q_p4: { type: "choices", optionIds: ["o_reading", "o_event"] },
  q_c1: { type: "choice", optionId: "o_stage1" },
  q_c2: { type: "percent", value: 20 },
  q_c3: { type: "choices", optionIds: ["o_policy", "o_strategy"] },
  q_c4: { type: "scale", value: 3 },
  q_c6: { type: "number", value: 2 },
  q_c7: { type: "lines", values: { l_next: 2, l_contribute: 3 } },
  q_c9: { type: "choices", optionIds: ["o_event"] },
  q_p6: { type: "text", text: "To explain the risk clearly." },
};

/** Answers to the survey at the end. */
const AFTER = {
  q_c1: { type: "choice", optionId: "o_stage2" },
  q_c2: { type: "percent", value: 35 },
  q_c4: { type: "scale", value: 5 },
  q_c7: { type: "lines", values: { l_next: 4 } },
  q_c9: { type: "choices", optionIds: ["o_applied", "o_written"] },
  q_a4: { type: "choices", optionIds: ["o_80k", "o_friends"], most: "o_80k" },
  q_q1: { type: "scale", value: 9 },
  q_q2: { type: "lines", values: { l_sessions: 5, l_readings: 4 } },
  q_a5: { type: "text", text: "Writing the threat model. I finally had to decide what I actually think." },
};

/** The before survey sent and answered; the survey at the end sent and answered by Amara. Their ids. */
async function bothAnswered(t) {
  clock(t);
  w.reset(surveySeed());
  const before = (await w.make()).body.survey.id;
  assert.equal((await w.sendFirst(before)).status, 200);
  t.mock.timers.setTime(new Date("2026-10-29T19:12:00Z").getTime());
  assert.equal((await w.answerByLink(w.tokenOf(before, "amara"), BEFORE)).status, 200);
  assert.equal((await w.answerByLink(w.tokenOf(before, "bea"), { q_c1: { type: "choice", optionId: "o_stage0" } })).status, 200);
  t.mock.timers.setTime(new Date("2026-11-30T09:00:00Z").getTime());
  const made = await w.make("zach", { stage: "after", closesOn: "2026-12-20" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const after = made.body.survey.id;
  assert.equal((await w.sendFirst(after)).status, 200);
  t.mock.timers.setTime(AT_END.getTime());
  assert.equal((await w.answerByLink(w.tokenOf(after, "amara"), AFTER)).status, 200);
  t.mock.timers.setTime(OPENED.getTime());
  return { before, after };
}

/** One press of the opening route, as `who`, for `person` on `surveyId`. */
const open = (who, surveyId, person, options = {}) => call(who, opening.POST, { surveyId, who: person }, options);

/** Every row of the openings log, oldest first, as stored. */
const openings = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("recordOpenings/"))
    .map((path) => ({ id: path.slice("recordOpenings/".length), ...w.world.db.read(path) }))
    .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());

const short = (response) => [response.status, response.body?.error ?? null];

/** The view's tables as words, row by row: what an admin reads. */
function rowsOf(table) {
  return table.rows.map((row) => {
    if (row.kind === "section") return `§ ${row.heading}${row.measure ? ` [${row.measure}]` : ""}`;
    const cells = row.cells.map((cell) => (cell.lines.length > 0 ? cell.lines.join(" / ") : cell.note || "·")).join(" | ");
    if (row.kind === "line") return `  ${row.label}: ${cells}`;
    return `${row.number ?? "-"}. ${row.title}${row.also ? ` (${row.also})` : ""}${row.scale ? ` {${row.scale}}` : ""}${cells ? ` => ${cells}` : ""}`;
  });
}

// ---------------------------------------------------------------------------
// 1. Who may open them
// ---------------------------------------------------------------------------

describe("1. only an admin opens one person's answers, and a refusal records and reads nothing", () => {
  const NOT_ADMINS = [
    ["claudia", "the programme's lead"],
    ["tess", "the lead of another programme"],
    ["rahul", "a facilitator of the person's group"],
    ["yusuf", "a committee member, the run's track lead"],
    ["lloyd", "a committee member who reviews the programme"],
    ["amara", "the person themselves"],
    ["nobody", "a member who holds no place"],
  ];

  test("everybody else is refused before anything is read, and nothing is recorded", async (t) => {
    const { after } = await bothAnswered(t);
    const before = w.everything();
    const touched = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      touched.push(path);
      return collection(path);
    };
    try {
      for (const [who, why] of NOT_ADMINS) {
        assert.deepEqual(short(await open(who, after, "amara")), [403, REFUSAL.adminOnly], why);
      }
      assert.deepEqual(short(await open(null, after, "amara")), [401, REFUSAL.notSignedIn], "signed out");
      const viewAs = await open("zach", after, "amara", { viewAs: true });
      assert.equal(viewAs.status, 403, "an admin viewing the site as somebody opens nothing");
    } finally {
      w.world.db.collection = collection;
    }
    // The session is the world's own: nothing of the database was read or written.
    assert.deepEqual(touched, [], "a refused caller reached the database");
    assert.equal(w.everything(), before, "a refusal changed something");
    assert.deepEqual(openings(), []);
  });

  test("the page reads the survey's name and nothing of the person; the admin area's gate sits above it", async (t) => {
    const { after } = await bothAnswered(t);
    const before = w.everything();
    const touched = [];
    const collection = w.world.db.collection;
    const getAll = w.world.db.getAll;
    w.world.db.collection = (path) => {
      touched.push(path);
      return collection(path);
    };
    w.world.db.getAll = (...refs) => {
      touched.push("by id");
      return getAll(...refs);
    };
    let page;
    try {
      page = await w.page(personPage, { params: Promise.resolve({ surveyId: after, who: "amara" }) }, "zach");
    } finally {
      w.world.db.collection = collection;
      w.world.db.getAll = getAll;
    }
    assert.deepEqual([...new Set(touched)], ["surveys"], "the page read something besides the survey");
    assert.equal(w.everything(), before, "drawing the page wrote something");
    assert.equal(page.text, "Surveys › AGI Strategy: after › Who answered Opening the answers…");
    for (const word of ["Amara", "Okafor", "To explain the risk", "Group B"]) assert.ok(!page.text.includes(word), `the page drew ${word} before any opening`);
    assert.deepEqual(openings(), [], "drawing the page recorded an opening");
    // A survey address that opens no survey says so, as every survey page does.
    const missing = await w.page(personPage, { params: Promise.resolve({ surveyId: "no-such-survey", who: "amara" }) }, "zach");
    assert.ok(missing.text.includes("Survey not found"));
    // The page's file reads the survey alone; the layout above it sends everybody but an admin away.
    const file = stripSource(read("app", "(app)", "admin", "(admin-only)", "surveys", "[surveyId]", "answered", "[who]", "page.tsx"), { keepStrings: true });
    assert.match(file, /const survey = db \? await readSurvey\(db, surveyId\) : null;/);
    assert.doesNotMatch(file, /users|surveyPeople|surveyAnswers|personOnSurveys|openPersonAnswers|eventPersonOn/);
    assert.match(read("app", "(app)", "admin", "(admin-only)", "layout.tsx"), /await requireAdminPage\(\);/);
  });

  test("the route refuses a view-as session first, then anybody but an admin, before the database", () => {
    const route = stripSource(read("app", "api", "surveys", "[surveyId]", "people", "[who]", "route.ts"), { keepStrings: true });
    const guard = route.indexOf("const blocked = await assertNotImpersonating();");
    const refused = route.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
    const db = route.indexOf("getAdminDb()");
    assert.ok(guard > -1 && refused > guard && db > refused, "the route reaches the database before it refuses");
    assert.ok(route.indexOf("export async function POST(") < guard, "the guard is not the handler's first statement");
    assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\b/, "opening answers is a POST alone");
  });
});

// ---------------------------------------------------------------------------
// 2. Recorded first
// ---------------------------------------------------------------------------

describe("2. every opening is recorded before anything of the person is read", () => {
  test("an admin opens Amara's: one row with who, whose, which surveys and when, never what they said", async (t) => {
    const { before, after } = await bothAnswered(t);
    const answer = await open("zach", after, "amara");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const rows = openings();
    assert.equal(rows.length, 1);
    const { id, ...row } = rows[0];
    assert.ok(id);
    assert.deepEqual(Object.keys(row).sort(), ["actorName", "actorUid", "kind", "openedAt", "subjectUid", "surveyId", "surveyIds"]);
    assert.deepEqual(
      { ...row, openedAt: row.openedAt.toISOString() },
      {
        kind: "survey-answers",
        actorUid: "zach",
        actorName: "Zach Levin",
        subjectUid: "amara",
        surveyId: after,
        surveyIds: [after, before],
        openedAt: OPENED.toISOString(),
      },
    );
    assert.ok(!("runId" in row), "an opening of survey answers is keyed to a run, so a run's destroy would take it");
    const stored = JSON.stringify(row);
    for (const said of ["To explain the risk clearly", "o_stage", "threat model", "35"]) assert.ok(!stored.includes(said), `the row holds ${said}`);
    // Opening them again is another opening, listed newest first. An opening of another kind of record of
    // Amara's, or of answers to another programme's survey, is not this page's.
    w.world.db.seed("recordOpenings/card", { kind: "sealed-predictions", actorUid: "zach", actorName: "Zach Levin", subjectUid: "amara", runId: RUN.agi, openedAt: OPENED });
    w.world.db.seed("recordOpenings/elsewhere", { kind: "survey-answers", actorUid: "zach", actorName: "Zach Levin", subjectUid: "amara", surveyId: "another-survey", surveyIds: ["another-survey"], openedAt: OPENED });
    t.mock.timers.setTime(OPENED.getTime() + 60 * 60 * 1000);
    const again = await open("zach", after, "amara");
    assert.equal(openings().length, 4);
    assert.deepEqual(
      again.body.person.openings.map((each) => each.line),
      ["Zach Levin · Tue 1 Dec, 12:04pm", "Zach Levin · Tue 1 Dec, 11:04am"],
    );
    assert.equal(again.body.person.notice, "Only admins can open one person’s answers, and each opening is logged. You opened this at 12:04pm.");
    // Opening them changes nothing of the answers or the rows.
    assert.equal(w.answers(before).length, 2);
    assert.deepEqual(w.answers(after).map((each) => each.respondent), [{ kind: "account", uid: "amara" }]);
  });

  test("the row is written before the person's name, rows, answers or group are read", async (t) => {
    const { after } = await bothAnswered(t);
    const order = [];
    const collection = w.world.db.collection;
    const getAll = w.world.db.getAll;
    w.world.db.collection = (path) => {
      const inner = collection(path);
      if (["users", "surveyPeople", "surveyAnswers", "courseEnrolments", "courseGroups", "eventRsvps", "eventCheckIns"].includes(path)) order.push(`read ${path}`);
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
    w.world.db.getAll = (...refs) => {
      order.push("read by id");
      return getAll(...refs);
    };
    try {
      assert.equal((await open("zach", after, "amara")).status, 200);
    } finally {
      w.world.db.collection = collection;
      w.world.db.getAll = getAll;
    }
    // The session's own read of the admin's account comes from the world, not the database.
    assert.equal(order[0], "recorded", `something of the person was read first: ${order.join(", ")}`);
    assert.ok(order.includes("read surveyAnswers") && order.includes("read users"));
  });

  test("when the opening cannot be recorded, nothing of the person is read or shown", async (t) => {
    const { after } = await bothAnswered(t);
    const touched = [];
    const collection = w.world.db.collection;
    const getAll = w.world.db.getAll;
    w.world.db.collection = (path) => {
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
    w.world.db.getAll = (...refs) => {
      touched.push("by id");
      return getAll(...refs);
    };
    let answer;
    try {
      answer = await open("zach", after, "amara");
    } finally {
      w.world.db.collection = collection;
      w.world.db.getAll = getAll;
    }
    assert.deepEqual(short(answer), [500, PERSON_WORDS.notRecorded]);
    assert.equal(PERSON_WORDS.notRecorded, "We couldn’t record that you opened these answers, so they stay closed. Try again.");
    assert.deepEqual(Object.keys(answer.body), ["error"]);
    for (const path of ["users", "surveyPeople", "surveyAnswers", "courseEnrolments", "by id"]) {
      assert.ok(!touched.includes(path), `${path} was read although the opening was not recorded`);
    }
    assert.deepEqual(openings(), []);
  });

  test("the one writer, and its one caller: recorded first, then read", () => {
    const person = stripSource(read("lib", "surveys", "onePerson.ts"), { keepStrings: true });
    const recorded = person.indexOf("const opened = await openSurveyAnswersRecorded(");
    const readsPerson = person.indexOf("() => readPerson(db, survey, shown, subject),");
    assert.ok(recorded > -1 && readsPerson > recorded, "the person is read outside the recorded read");
    assert.equal(person.split("readPerson(").length, 3, "readPerson is called somewhere else too");
    assert.match(person, /if \(!opened\.ok\) return \{ kind: "not-recorded" \};/);
    const log = stripSource(read("lib", "firestore", "recordOpenings.ts"), { keepStrings: true });
    const fn = log.slice(log.indexOf("export async function openSurveyAnswersRecorded"));
    assert.ok(fn.indexOf("await ref.create({") > -1 && fn.indexOf("await ref.create({") < fn.indexOf("const value = await read();"));
    assert.match(fn, /return \{ ok: false \};\s*\}\s*const value = await read\(\);\s*return \{ ok: true, value, openingId: ref\.id \};/);
  });
});

// ---------------------------------------------------------------------------
// 3. What the page shows
// ---------------------------------------------------------------------------

describe("3. what an admin sees: the change questions side by side, each survey's own, the names-off day, who opened them", () => {
  test("Amara's answers, every word the surveys' own", async (t) => {
    const { before, after } = await bothAnswered(t);
    const { person } = (await open("zach", after, "amara")).body;
    assert.equal(person.name, "Amara Okafor");
    assert.equal(person.key, "amara");
    assert.deepEqual(person.meta, ["Fellowship: AGI Strategy", "Group B", "Answered both"]);
    assert.equal(person.notice, "Only admins can open one person’s answers, and each opening is logged. You opened this at 11:04am.");
    assert.equal(person.nothing, "");

    // The change questions: the nine the start and the end both ask, numbered as the before survey numbers them.
    const change = person.change;
    assert.equal(change.title, "The change questions");
    assert.equal(change.line, "The same 9 at the start and at the end.");
    assert.deepEqual(change.columns, [
      { label: "Start", when: "Thu 29 Oct, 7:12pm" },
      { label: "End", when: "Mon 30 Nov, 7:52pm" },
    ]);
    assert.deepEqual(rowsOf(change), [
      "§ Where you are now [Career stage, intention and interests]",
      "5. Which best describes you right now? => Thought about it, not a serious option | One of several options I’m seriously considering",
      "6. How likely is it that in 5 years most of your working time goes on reducing risks from advanced AI? {0 to 100%} => 20% | 35%",
      "7. Which kinds of work interest you most? {Pick up to 3} => Governance or policy / Strategy | No answer",
      "§ What you know, and who [Understanding, field knowledge, network, clarity and confidence]",
      "8. How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections? {1 Not at all to 7 Could hold my own with a researcher} => 3 | 5",
      "9. How familiar are you with the main organisations, research agendas and policy debates in AI safety? {1 Couldn’t name any to 7 Could describe most major orgs’ agendas well enough that their staff would agree} => No answer | No answer",
      "10. How many people working in AI safety would you feel comfortable messaging for 30 minutes of advice? => 2 | No answer",
      "11. How much do you agree? {1 Strongly disagree to 5 Strongly agree}",
      "  I know what my next concrete step towards AI safety work would be.: 2 | 4",
      "  I could make a meaningful contribution to AI safety.: 3 | No answer",
      "§ What you’ve done [Obstacles and concrete actions]",
      "12. What, if anything, stands between you and contributing to AI safety? {Pick any} => No answer | No answer",
      "13. In the last 3 months, have you… (End: Since the programme started, have you…) {Pick any} => Attended an AI safety event outside NAISI | Applied to an AI safety programme or job / Written something on AI safety",
    ]);
    // C2's line under it, as the survey holds it.
    assert.equal(change.rows.find((row) => row.title?.startsWith("How likely is it that in 5 years")).hint, "Research, policy, engineering, operations and fieldbuilding all count.");

    // Each survey's own questions, under its own title.
    assert.deepEqual(person.rest.map((table) => [table.title, table.line, table.columns.map((column) => `${column.label}: ${column.when}`)]), [
      ["Before you start", "The before survey only.", ["Start: Thu 29 Oct, 7:12pm"]],
      ["At the end", "The after survey only.", ["End: Mon 30 Nov, 7:52pm"]],
    ]);
    const [beforeOnly, afterOnly] = person.rest;
    assert.deepEqual(rowsOf(beforeOnly).slice(0, 5), [
      "§ About you [Reach]",
      "-. Level of study => Master’s",
      "-. Subject of study => No answer",
      "-. Before this programme, which of these had you done? {Pick any} => AI safety books, LessWrong or 80,000 Hours / An AI safety talk or event",
      "-. How did you first hear about NAISI? {Pick any} => No answer",
    ]);
    assert.ok(rowsOf(beforeOnly).includes("-. What do you most want to get out of this programme? => To explain the risk clearly."));
    const afterRows = rowsOf(afterOnly);
    assert.ok(afterRows.includes("-. What else has shaped your current plans? {Pick any, then the one that mattered most} => 80,000 Hours / Friends / Which of those mattered most? 80,000 Hours"));
    assert.ok(afterRows.includes("-. How likely are you to recommend this programme to a friend with similar interests? {0 Not at all likely to 10 Extremely likely} => 9"));
    assert.ok(afterRows.includes("-. How valuable was each part? {1 Not valuable to 5 Very valuable}"));
    assert.ok(afterRows.includes("  Sessions: 5") && afterRows.includes("  Facilitator: No answer"));
    assert.ok(afterRows.includes("-. Did the programme have any negative effect on you or your plans? => Writing the threat model. I finally had to decide what I actually think."));
    // No change question is listed twice.
    assert.ok(!afterRows.some((row) => row.includes("Which best describes you right now?")));

    // The day names come off, from the surveys' own record, and who has opened them.
    assert.deepEqual(person.namesOff, ["Amara’s name comes off on Sat 9 Dec 2028. Their answers stay in the totals."]);
    assert.deepEqual(person.openings, [{ name: "Zach Levin", key: "zach", line: "Zach Levin · Tue 1 Dec, 11:04am" }]);
    // Nobody else's answers are in it.
    assert.ok(!JSON.stringify(person).includes("Haven’t really thought about working on AI safety"), "Bea's answer is on Amara's page");
    assert.ok(before);
  });

  test("somebody who answered one side only: no change questions, each survey whole, and what they did not answer said in a line", async (t) => {
    const { after } = await bothAnswered(t);
    const { person } = (await open("zach", after, "bea")).body;
    assert.deepEqual(person.meta, ["Fellowship: AGI Strategy", "Group A", "Answered 1 of 2"]);
    assert.equal(person.change.columns[1].when, "Not answered", "Bea was sent the survey at the end and has not answered it");
    assert.deepEqual(rowsOf(person.change)[1], "5. Which best describes you right now? => Haven’t really thought about working on AI safety | ·");
    assert.equal(person.rest[1].empty, "Sent Mon 30 Nov, 9am. Not answered.");
    assert.deepEqual(person.rest[1].rows, []);
    // Dev was sent both and answered neither: there is nothing to set side by side.
    const dev = (await open("zach", after, "dev")).body.person;
    assert.equal(dev.change, null);
    assert.deepEqual(dev.meta, ["Fellowship: AGI Strategy", "Hasn’t answered"], "a placement Publish has not told Dev names no group");
    assert.deepEqual(dev.rest.map((table) => table.empty), ["Sent Thu 29 Oct, 9am. Not answered.", "Sent Mon 30 Nov, 9am. Not answered."]);
  });

  test("somebody never on these surveys has none to open, and the opening is still recorded", async (t) => {
    const { after } = await bothAnswered(t);
    const { person } = (await open("zach", after, "nobody")).body;
    assert.equal(person.nothing, "Nell Carter has no answers here to open.");
    assert.equal(person.change, null);
    assert.deepEqual(person.rest, []);
    assert.deepEqual(person.namesOff, []);
    assert.equal(openings().length, 1);
    assert.equal(openings()[0].subjectUid, "nobody");
    // An address that names nobody this survey could hold records nothing.
    assert.deepEqual(short(await open("zach", after, "bad id!")), [404, PERSON_WORDS.nobodyHere]);
    assert.deepEqual(short(await open("zach", "no-such-survey", "amara")), [404, REFUSAL.noSurvey]);
    assert.equal(openings().length, 1);
  });

  test("a name that has come off: two years on nobody's opens, and a deleted account's has none", async (t) => {
    const { before, after } = await bothAnswered(t);
    // Amara's account is deleted: the survey step takes Amara's name off at once.
    await namesOff.takeNamesOffForAccount(w.world.db, "amara");
    await w.world.db.collection("users").doc("amara").delete();
    const gone = (await open("zach", after, "amara")).body.person;
    assert.equal(gone.name, PERSON_WORDS.accountGone);
    assert.equal(gone.nothing, "This account has been deleted, so its name has come off its answers and there are none to open.");
    assert.ok(!JSON.stringify(gone).includes("To explain the risk"));
    // Two years on, the job takes every name off both surveys: there is nothing of anybody's to open, and nothing is recorded.
    const recorded = openings().length;
    for (const id of [before, after]) await namesOff.takeNamesOffSurvey(w.world.db, { id });
    assert.deepEqual(short(await open("zach", after, "bea")), [410, PERSON_WORDS.namesOff]);
    assert.equal(PERSON_WORDS.namesOff, "Names have come off this survey’s answers, so there are none of anybody’s to open. The answers stay in the totals.");
    assert.equal(openings().length, recorded, "an opening was recorded of answers that name nobody");
  });

  test("the drawn page: the box, the tables in order, the side column, and no control for what is not built", async (t) => {
    const { after } = await bothAnswered(t);
    const { person } = (await open("zach", after, "amara")).body;
    const html = renderToStaticMarkup(w.createElement(drawn.OpenedAnswers, { view: person }));
    const text = textOf(html);
    const at = (words) => {
      const found = text.indexOf(words);
      assert.ok(found > -1, `the page does not say ${words}`);
      return found;
    };
    assert.ok(at("Confidential Only admins can open one person’s answers, and each opening is logged. You opened this at 11:04am.") < at("Usually for a request to see or delete someone’s answers."));
    assert.ok(at("The change questions The same 9 at the start and at the end.") < at("Before you start The before survey only.") );
    assert.ok(at("Before you start The before survey only.") < at("At the end The after survey only."));
    assert.ok(at("At the end The after survey only.") < at("Names come off Amara’s name comes off on Sat 9 Dec 2028. Their answers stay in the totals."));
    assert.ok(at("Names come off") < at("Who has opened this ZL Zach Levin · Tue 1 Dec, 11:04am"));
    assert.match(text, /Question Start Thu 29 Oct, 7:12pm End Mon 30 Nov, 7:52pm/);
    // A real table: column heads, and each question a row head.
    assert.match(html, /<th scope="col"[^>]*>Start<span[^>]*>Thu 29 Oct, 7:12pm<\/span><\/th>/);
    assert.match(html, /<th scope="rowgroup" colSpan="3"|<th scope="rowgroup" colspan="3"/);
    // The board's download and delete are not built, so not drawn.
    assert.doesNotMatch(text, /Download|Delete|Careful|Export/);
    assert.doesNotMatch(html, /<button/);
    // No pronoun stands for the person.
    assert.doesNotMatch(text, /\b(?:she|h(?:e|er|im|is))\b/i);
    // Refused, the page is headed by what it is, and says why with nothing of anybody.
    assert.equal(PERSON_WORDS.heading, "One person’s answers");
    // Before the route answers, the page says it is opening, and draws nothing of anybody.
    const first = textOf(renderToStaticMarkup(w.createElement(drawn.default, { surveyId: after, surveyName: "AGI Strategy: after", who: "amara" })));
    assert.equal(first, "Surveys › AGI Strategy: after › Who answered Opening the answers…");
  });
});

describe("3b. the layout pairs by id and type, and reads each column in its own survey's words", () => {
  const question = (id, type, title, options) => ({ kind: "question", id, type, title, body: [], required: false, ...(options ? { options } : {}) });
  const survey = (kind, items, answers, sentAt) => ({ id: kind, kind, title: kind, name: `AGI Strategy: ${kind}`, items, answers, sentAt, sentToThemAt: sentAt, onIt: true });

  test("a question the end asks another way is no change question, and an option reworded at the end is read in the end's words", () => {
    const before = survey(
      "before",
      [question("q_agree", "singleChoice", "Making AI go well matters.", [{ id: "o_a", label: "Agree" }]), question("q_text", "shortText", "Why?")],
      { q_agree: { type: "choice", optionId: "o_a" }, q_text: { type: "text", text: "Because." } },
      new Date("2026-10-29T19:12:00Z"),
    );
    const after = survey(
      "after",
      [question("q_agree", "singleChoice", "Making AI go well matters.", [{ id: "o_a", label: "Agree, on the whole" }]), question("q_text", "longText", "Why, now?")],
      { q_agree: { type: "choice", optionId: "o_a" } },
      new Date("2026-11-30T19:52:00Z"),
    );
    assert.deepEqual(layout.changeQuestions(before, after).map((each) => each.id), ["q_agree"], "a question asked another way at the end was paired");
    const tables = layout.personTables([before, after]);
    assert.deepEqual(rowsOf(tables.change), ["1. Making AI go well matters. => Agree | Agree, on the whole"]);
    assert.equal(tables.change.line, "The same question at the start and at the end.");
    // The text question, asked two ways, stays with each survey.
    assert.deepEqual(tables.rest.map((table) => rowsOf(table)), [["-. Why? => Because."], ["-. Why, now? => No answer"]]);
  });

  test("a survey the person was never on is not shown, and nothing pairs without both", () => {
    const before = survey("before", [question("q_a", "shortText", "A?")], { q_a: { type: "text", text: "Yes." } }, new Date("2026-10-29T19:12:00Z"));
    const after = { ...survey("after", [question("q_a", "shortText", "A?")], null, null), onIt: false };
    const tables = layout.personTables([before, after]);
    assert.equal(tables.change, null);
    assert.deepEqual(tables.rest.map((table) => table.title), ["before"]);
  });
});

describe("3c. each reader keeps only what is the person's, whatever a query hands it", () => {
  test("the openings of a person's survey answers: that person's, of that kind, newest first", async (t) => {
    clock(t, OPENED);
    w.reset(surveySeed());
    const log = await w.loadTs(join("lib", "firestore", "recordOpenings.ts"));
    const row = (over) => ({ kind: "survey-answers", actorUid: "zach", actorName: "Zach Levin", subjectUid: "amara", surveyId: "s1", surveyIds: ["s1"], openedAt: OPENED, ...over });
    w.world.db.seed("recordOpenings/old", row({ openedAt: new Date("2026-11-30T10:00:00Z") }));
    w.world.db.seed("recordOpenings/new", row({}));
    w.world.db.seed("recordOpenings/card", { kind: "sealed-predictions", actorUid: "zach", actorName: "Zach Levin", subjectUid: "amara", runId: RUN.agi, openedAt: OPENED });
    w.world.db.seed("recordOpenings/bea", row({ subjectUid: "bea" }));
    w.world.db.seed("recordOpenings/guest", { ...row({}), subjectUid: undefined, subjectSignupId: "amara" });
    const listed = await log.surveyAnswersOpeningsOf(w.world.db, { kind: "account", uid: "amara" });
    assert.deepEqual(listed.map((each) => each.id), ["new", "old"]);
    assert.deepEqual(Object.keys(listed[0]).sort(), ["actorName", "actorUid", "at", "id", "surveyIds"]);
    assert.deepEqual((await log.surveyAnswersOpeningsOf(w.world.db, { kind: "guest", signupId: "amara" })).map((each) => each.id), ["guest"]);
  });

  test("a person's rows and answers, even from a query that hands back everybody's", async (t) => {
    const { before, after } = await bothAnswered(t);
    const repo = await w.loadTs(join("lib", "surveys", "repo.ts"));
    // A database whose equalities are ignored: every answer comes back.
    const loose = {
      ...w.world.db,
      collection: (path) => {
        const inner = w.world.db.collection(path);
        return { ...inner, where: () => inner };
      },
      getAll: (...refs) => w.world.db.getAll(...refs),
    };
    // Somebody else's answer, sent before Amara's, so "the first sent" would choose it were it kept.
    w.world.db.seed("surveyAnswers/earlier", {
      surveyId: before,
      roundId: w.survey(before).audience.roundId,
      respondent: { kind: "account", uid: "dev" },
      answers: { q_c1: { type: "choice", optionId: "o_stage5" } },
      sentAt: new Date("2026-10-29T10:00:00Z"),
      via: "link",
      afterFirstSession: false,
    });
    const surveys = [await repo.readSurvey(w.world.db, before), await repo.readSurvey(w.world.db, after)];
    const { rows, answers } = await repo.personOnSurveys(loose, surveys, "amara");
    assert.deepEqual([...answers.values()].map((answer) => answer.respondent.uid), ["amara", "amara"]);
    assert.deepEqual([...rows.values()].map((row) => row.respondent.uid), ["amara", "amara"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Who answered opens each person
// ---------------------------------------------------------------------------

describe("4. Who answered links each name to that person's answers", () => {
  test("each row opens its person's page, by uid", async (t) => {
    const { after } = await bothAnswered(t);
    const page = await w.page(w.pages.answered, { params: Promise.resolve({ surveyId: after }) }, "zach");
    for (const uid of ["amara", "bea", "dev", "tariq"]) {
      assert.ok(page.html.includes(`href="/admin/surveys/${after}/answered/${uid}"`), `${uid} has no link`);
    }
    assert.deepEqual(openings(), [], "drawing Who answered recorded an opening");
    assert.equal(layout.whoOf({ kind: "account", uid: "amara" }), "amara");
    assert.equal(layout.whoOf({ kind: "guest", signupId: "rsvp-1" }), "g_rsvp-1");
  });
});

// ---------------------------------------------------------------------------
// 5. Deletion keeps the openings
// ---------------------------------------------------------------------------

describe("5. an opening is kept as the record of downloads is", () => {
  test("no account deletion, names coming off or run's destroy takes one", async (t) => {
    const { before, after } = await bothAnswered(t);
    await open("zach", after, "amara");
    // The account opened, and the admin who opened it, both deleted: the row stays.
    await namesOff.takeNamesOffForAccount(w.world.db, "amara");
    await namesOff.takeNamesOffForAccount(w.world.db, "zach");
    for (const id of [before, after]) await namesOff.takeNamesOffSurvey(w.world.db, { id });
    assert.equal(openings().length, 1);
    assert.equal(openings()[0].subjectUid, "amara");
    // A run's destroy drains the log by run, and this row names no run.
    const destroy = read("lib", "firestore", "courseDeletion.ts");
    assert.match(destroy, /drainQuery\(db, RECORD_OPENINGS_COLLECTION, byRunId\(RECORD_OPENINGS_COLLECTION\), budget\)/);
    assert.equal(openings().filter((row) => row.runId === RUN.agi).length, 0);
    // Neither the account cascade nor the names-off code names the log.
    for (const file of [["lib", "firestore", "accountDeletion.ts"], ["lib", "surveys", "namesOff.ts"], ["lib", "scheduler", "jobs", "surveyNamesOff.ts"]]) {
      assert.doesNotMatch(stripSource(read(...file), { keepStrings: true }), /recordOpenings|RECORD_OPENINGS_COLLECTION|surveyAnswersOpeningsOf/, file.join("/"));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. A survey after an event
// ---------------------------------------------------------------------------

describe("6. a survey after an event: an account's answers, and a guest's", async () => {
  const e = await makeEventSurveyWorld("__surveysOnePersonEvents");
  const eventOpening = await e.loadTs(join("app", "api", "surveys", "[surveyId]", "people", "[who]", "route.ts"));
  const press = async (path, who, id, body = {}) => e.call(who, (await e.route(`surveys/[surveyId]/${path}`)).POST, { surveyId: id }, { body });
  const ANSWERS = {
    q_ev_how: { type: "rating", value: 5 },
    q_ev_again: { type: "choice", optionId: "o_ev_yes" },
    q_ev_next: { type: "choices", optionIds: ["o_ev_games", "o_ev_quiz"] },
    q_ev_change: { type: "text", text: "More headsets." },
  };
  const eventOpenings = () => e.world.db.paths().filter((path) => path.startsWith("recordOpenings/")).map((path) => e.world.db.read(path));

  async function answered(t) {
    t.mock.timers.enable({ apis: ["Date"], now: LATE });
    e.reset();
    const made = await e.make();
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const id = made.body.survey.id;
    await press("open-at-event", "zach", id);
    assert.equal((await press("answer", "kofi", id, { answers: ANSWERS })).status, 200);
    t.mock.timers.setTime(NEXT_DAY.getTime());
    await press("test", "zach", id, { email: "survey" });
    e.world.mail.length = 0;
    assert.equal((await press("send", "zach", id, { to: "everyone", emails: 4 })).status, 200);
    const link = e.linkIn(e.world.mail.find((message) => message.to === "gwen@example.com"));
    const token = link.slice(link.lastIndexOf("/") + 1);
    const gwen = await e.call(null, (await e.route("surveys/answer")).POST, {}, { body: { token, answers: { q_ev_how: { type: "rating", value: 4 } } } });
    assert.equal(gwen.status, 200, JSON.stringify(gwen.body));
    return id;
  }

  test("a guest's: by their sign-up, recorded with no account and no run", async (t) => {
    const id = await answered(t);
    const answer = await e.call("zach", eventOpening.POST, { surveyId: id, who: `g_${RSVP.gwen}` });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const { person } = answer.body;
    assert.equal(person.name, "Gwen Price");
    assert.deepEqual(person.meta, ["Event: VR games night, Sun 1 Nov", "Answered"]);
    assert.equal(person.change, null);
    assert.equal(person.rest.length, 1);
    assert.equal(person.rest[0].columns[0].label, "Answers");
    assert.deepEqual(rowsOf(person.rest[0]).slice(0, 2), ["-. How was it? {1 Not good to 5 Great} => 4", "-. Would you come to another NAISI social? => No answer"]);
    assert.deepEqual(person.namesOff, ["Gwen’s name comes off on Wed 1 Nov 2028. Their answers stay in the totals."]);
    const [row] = eventOpenings();
    assert.deepEqual(Object.keys(row).sort(), ["actorName", "actorUid", "kind", "openedAt", "subjectSignupId", "surveyId", "surveyIds"]);
    assert.equal(row.subjectSignupId, RSVP.gwen);
    assert.deepEqual(row.surveyIds, [id]);
    // Kofi, an account, answered with the QR code: opened by the account's uid.
    const kofi = (await e.call("zach", eventOpening.POST, { surveyId: id, who: "kofi" })).body.person;
    assert.deepEqual(rowsOf(kofi.rest[0]).slice(0, 3), [
      "-. How was it? {1 Not good to 5 Great} => 5",
      "-. Would you come to another NAISI social? => Yes",
      "-. What should we run next? {Pick any} => Another games night / A quiz",
    ]);
    // Neither page holds the other's answers, and the organiser opens nothing.
    assert.ok(!JSON.stringify(person).includes("More headsets."));
    assert.equal((await e.call("iris", eventOpening.POST, { surveyId: id, who: "kofi" })).status, 403);
    assert.equal((await e.call("sue", eventOpening.POST, { surveyId: id, who: "kofi" })).status, 403);
    // The event store's reader keeps only the person's answer, even from a query that hands back everybody's.
    const store = await e.load("lib/surveys/events/store.ts");
    const loose = {
      ...e.world.db,
      collection: (path) => {
        const inner = e.world.db.collection(path);
        return { ...inner, where: () => inner };
      },
    };
    const { readSurvey } = await e.load("lib/surveys/repo.ts");
    const full = await readSurvey(e.world.db, id);
    const gwensOwn = await store.eventPersonOn(loose, full, { kind: "guest", signupId: RSVP.gwen });
    assert.deepEqual(gwensOwn.answer.respondent, { kind: "guest", signupId: RSVP.gwen });
    assert.deepEqual(gwensOwn.answer.answers, { q_ev_how: { type: "rating", value: 4 } });
    const kofisOwn = await store.eventPersonOn(loose, full, { kind: "account", uid: "kofi" });
    assert.deepEqual(kofisOwn.answer.respondent, { kind: "account", uid: "kofi" });
    // Who answered links the guest by their sign-up.
    const tab = await e.page("app/(app)/admin/(admin-only)/surveys/[surveyId]/answered/page.tsx", { params: Promise.resolve({ surveyId: id }) }, "zach");
    assert.ok(tab.html.includes(`href="/admin/surveys/${id}/answered/g_${RSVP.gwen}"`));
    assert.ok(tab.html.includes(`href="/admin/surveys/${id}/answered/kofi"`));
    assert.ok(EVENT_ID);
  });
});

// ---------------------------------------------------------------------------
// 7. The words, and the tree
// ---------------------------------------------------------------------------

describe("7. the words, and the files that reach a person's answers", () => {
  test("the words, as the board draws them where it does", () => {
    assert.equal(words.answeredSummaryWords(2, 2), "Answered both");
    assert.equal(words.answeredSummaryWords(3, 3), "Answered all 3");
    assert.equal(words.answeredSummaryWords(1, 1), "Answered");
    assert.equal(words.answeredSummaryWords(1, 2), "Answered 1 of 2");
    assert.equal(words.answeredSummaryWords(0, 2), "Hasn’t answered");
    assert.equal(words.sameQuestionsWords(6), "The same 6 at the start and at the end.");
    assert.equal(words.sameQuestionsWords(1), "The same question at the start and at the end.");
    assert.equal(words.onlyThisSurveyWords("after"), "The after survey only.");
    assert.equal(words.PERSON_WORDS.usually, "Usually for a request to see or delete someone’s answers.");
    assert.equal(words.PERSON_WORDS.whoOpenedTitle, "Who has opened this");
    assert.equal(words.PERSON_WORDS.namesOffTitle, "Names come off");
    assert.equal(words.openingLineWords("Zach Levin", new Date("2026-12-21T11:04:00Z")), "Zach Levin · Mon 21 Dec, 11:04am");
    assert.equal(words.nameComesOffWords("Amara", "2027-12-09"), "Amara’s name comes off on Thu 9 Dec 2027.");
    const lines = { kind: "question", id: "q", type: "lines", title: "How confident would you be explaining these to a friend?", lines: [], scale: { max: 5, minLabel: "Not at all", maxLabel: "Very" } };
    assert.equal(words.personScaleWords(lines), "1 Not at all to 5 Very");
    const rating = { kind: "question", id: "q", type: "rating", title: "Overall?", body: [], required: false, rating: { max: 5, minLabel: "Poor", maxLabel: "Excellent" } };
    assert.equal(words.personScaleWords(rating), "1 Poor to 5 Excellent");
    for (const value of Object.values(words.PERSON_WORDS)) assert.doesNotMatch(value, /[\u2013\u2014]/);
  });

  test("only these files reach a person's answers on this page, each for its reason", () => {
    const naming = (pattern) => {
      const out = [];
      for (const file of walkSource(SRC)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        if (pattern.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) out.push(relative(SRC, file).split(sep).join("/"));
      }
      return out.sort();
    };
    // The one writer of an opening of survey answers, and its one caller.
    assert.deepEqual(naming(/\bopenSurveyAnswersRecorded\b/), ["lib/firestore/recordOpenings.ts", "lib/surveys/onePerson.ts"]);
    // Who has opened them is read by the one page's builder, after the opening is recorded.
    assert.deepEqual(naming(/\bsurveyAnswersOpeningsOf\b/), ["lib/firestore/recordOpenings.ts", "lib/surveys/onePerson.ts"]);
    // A person's rows and answers on a programme's surveys, or on a survey after an event: read only inside the recorded read.
    assert.deepEqual(naming(/\bpersonOnSurveys\b/), ["lib/surveys/onePerson.ts", "lib/surveys/repo.ts"]);
    assert.deepEqual(naming(/\beventPersonOn\b/), ["lib/surveys/events/store.ts", "lib/surveys/onePerson.ts"]);
    // The opening itself, asked by the one route.
    assert.deepEqual(naming(/\bopenPersonAnswers\b/), ["app/api/surveys/[surveyId]/people/[who]/route.ts", "lib/surveys/onePerson.ts"]);
  });
});
