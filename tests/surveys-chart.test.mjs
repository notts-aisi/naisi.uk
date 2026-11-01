/**
 * MAKE A CHART (docs/surveys.md, "Make a chart"), THROUGH THE REAL MODEL,
 * PAGES AND ROUTES.
 *
 * What is held here:
 *
 *  1. THE MODEL, pure (`src/lib/surveys/chart.ts`). ONE COUNT: every bar of
 *     every template's question is its Results' bar, every share its share,
 *     every average its average; a check-in week's average is the programme
 *     lead's own count of that week (`leadWeekOf`, through `tallyOf`). One
 *     scale over every chart. A check-in week's question is every group's
 *     copy put together, each part once, "Something else" and "Nothing was
 *     unclear" last. Unasked, check-ins open on the average by week, a chart
 *     a group. The file of numbers says what the chart says and names nobody.
 *  2. A SURVEY'S TAB, as every caller: the page draws for an admin, reads no
 *     name and writes nothing; its file is an admin's alone, refused before
 *     anything is read, never a recorded download, and counts what the page
 *     counts; Who is the Results' own filter, and a chart a group counts what
 *     Who shows for each group.
 *  3. A PROGRAMME'S CHECK-INS, as every caller: average usefulness by week,
 *     by group, a dot for a week with no answers; four groups showing and the
 *     rest behind a press; Who narrows to one group; the file.
 *  4. A SURVEY AFTER AN EVENT: Who is members or guests, and nothing splits.
 *  5. THE TREE: Make a chart is reached only from the (admin-only) pages and
 *     its two admin routes; no page of a programme's lead reaches it, a
 *     group's figures or the Results' filters; the hub's check-ins lead to it.
 *
 * Worlds: `tests/lib/surveyWorld.mjs` (AGI Strategy, from Thu 29 Oct 2026,
 * Groups B, C and A meeting Tuesday, Wednesday and Thursday) and
 * `tests/lib/eventSurveyWorld.mjs` (VR games night, Sun 1 Nov). Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AGI, B, C, NOW, ROUND, RUN, makeSurveyWorld, surveySeed } from "./lib/surveyWorld.mjs";
import { LATE, NEXT_DAY, makeEventSurveyWorld } from "./lib/eventSurveyWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { withEveryRequired } from "./lib/surveyAnswers.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

const w = await makeSurveyWorld("__surveysChart");
const chart = await w.loadTs(join("lib", "surveys", "chart.ts"));
const chartLoad = await w.loadTs(join("lib", "surveys", "chartLoad.ts"));
const results = await w.loadTs(join("lib", "surveys", "results.ts"));
const charts = await w.loadTs(join("lib", "surveys", "charts.ts"));
const ciModel = await w.loadTs(join("lib", "surveys", "checkIns", "model.ts"));
const ciTemplate = await w.loadTs(join("lib", "surveys", "checkIns", "template.ts"));
const eventTemplate = await w.loadTs(join("lib", "surveys", "events", "template.ts"));
const words = await w.loadTs(join("lib", "surveys", "chartWords.ts"));
const surveyWords = w.lib.words;
const templates = w.lib.templates;
const surveyRoute = await w.loadTs(join("app", "api", "surveys", "[surveyId]", "chart", "route.ts"));
const checkInsRoute = await w.loadTs(join("app", "api", "surveys", "check-ins", "[roundId]", "[programmeId]", "chart", "route.ts"));
const totalsRoute = w.routes.totals;
const ADMIN = join("app", "(app)", "admin", "(admin-only)", "surveys");
const surveyPage = (await w.loadTs(join(ADMIN, "[surveyId]", "chart", "page.tsx"))).default;
const checkInsPage = (await w.loadTs(join(ADMIN, "check-ins", "[roundId]", "[programmeId]", "chart", "page.tsx"))).default;

const { MAKE_CHART_WORDS } = words;
const { REFUSAL, CHART_WORDS } = surveyWords;

/** Thu 29 Oct 2026, noon: before any group has met. */
const ANSWERED = new Date("2026-10-29T12:00:00Z");
/** Wed 25 Nov 2026, noon: week 5 of the run, two weeks of check-ins in. */
const LATER = new Date("2026-11-25T12:00:00Z");

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

/** Everybody but an admin, and how a failure names them. */
const NOT_ADMINS = [
  ["claudia", "AGI Strategy's lead"],
  ["tess", "the lead of another programme"],
  ["lloyd", "the programme's reviewer"],
  ["rahul", "a facilitator of one of its groups"],
  ["amara", "a member holding a place"],
  ["nobody", "a member on nothing"],
];

/** The database's collections asked for while `run` runs, in order. */
async function readsDuring(run, world = w.world) {
  const asked = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    asked.push(path);
    return collection(path);
  };
  try {
    return { result: await run(), asked };
  } finally {
    world.db.collection = collection;
  }
}

/** A file route's raw answer as `who` asks for it: a file, or a refusal. */
async function fileAs(handler, who, params, query, { viewAs = false } = {}) {
  w.world.user = w.sessionOf(who);
  w.world.viewAs = viewAs;
  try {
    const response = await handler.GET(new Request(`https://naisi.invalid/api?${query}`), { params: Promise.resolve(params) });
    if (response instanceof Response) return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) };
    return { status: response.status, body: response.body };
  } finally {
    w.world.viewAs = false;
  }
}

/** The rows of a CSV, each its cells, quotes undone. */
function rowsOf(csv) {
  return csv
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].filter((match) => match[0] !== "").map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"')));
}

// ---------------------------------------------------------------------------
// 1. The model
// ---------------------------------------------------------------------------

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
      return n % 3 === 0 ? undefined : { type: "text", text: `Answer ${n % 5}` };
  }
}

/** `count` people's answers to every question of `items`, the n-th as `nthAnswer` gives it, from `from`. */
function answersTo(items, count, from = 0) {
  const questions = items.filter((item) => item.kind === "question");
  return Array.from({ length: count }, (_, at) => ({
    answers: Object.fromEntries(
      questions.flatMap((question) => {
        const answer = nthAnswer(question, at + from);
        return answer ? [[question.id, answer]] : [];
      }),
    ),
  }));
}

/** One set of a survey's answers, as the loader hands a survey with no group. */
const surveyInput = (items, answers, who = "Everyone who answered") => ({ sets: [{ items, answers, group: null, week: null }], groups: [], weeks: null, who });

/** A check-in's answers, as its form sends them. */
const checkInAnswer = ({ useful, unclear = ["o_ci_nothing"], reading = null, confident = 3, most = "The discussion" }) => ({
  answers: {
    q_ci_useful: { type: "rating", value: useful },
    q_ci_most: { type: "text", text: most },
    q_ci_unclear: { type: "choices", optionIds: unclear },
    ...(reading ? { q_ci_reading: { type: "choice", optionId: `o_ci_read_${reading}` } } : {}),
    q_ci_confident: { type: "rating", value: confident },
  },
});

/**
 * Two groups' check-ins over two weeks. Week 1 has nothing to read and two
 * parts; in week 2 Group C's copy has a part Group B's has not, and the week
 * has reading.
 */
function twoWeeks() {
  const week1 = ciTemplate.checkInItems({ parts: [{ id: "pt-define", title: "Defining AGI" }, { id: "pt-timelines", title: "Timelines" }], hasReading: false });
  const week2B = ciTemplate.checkInItems({ parts: [{ id: "pt-compute", title: "Compute as a lever" }], hasReading: true });
  const week2C = ciTemplate.checkInItems({ parts: [{ id: "pt-compute", title: "Compute as a lever" }, { id: "pt-chips", title: "Export controls" }], hasReading: true });
  const sets = [
    { items: week1, group: "g-b", week: 1, answers: [checkInAnswer({ useful: 4, unclear: ["pt-define"] }), checkInAnswer({ useful: 5 }), checkInAnswer({ useful: 3, unclear: ["pt-define", "pt-timelines"] })] },
    { items: week1, group: "g-c", week: 1, answers: [checkInAnswer({ useful: 2, unclear: ["pt-timelines"] })] },
    { items: week2B, group: "g-b", week: 2, answers: [checkInAnswer({ useful: 5, reading: "all", confident: 4 }), checkInAnswer({ useful: 4, reading: "some", unclear: ["pt-compute"] })] },
    {
      items: week2C,
      group: "g-c",
      week: 2,
      answers: [checkInAnswer({ useful: 3, reading: "most", unclear: ["pt-chips", "o_ci_else"] }), checkInAnswer({ useful: 4, reading: "none", unclear: ["pt-chips"] })],
    },
  ];
  return { sets, groups: [{ id: "g-b", name: "Group B" }, { id: "g-c", name: "Group C" }], weeks: [1, 2, 3], who: "Everyone who answered" };
}

describe("1. the model", () => {
  test("one count: every bar of every template's question is its Results' bar, every share its share, every average its average", () => {
    const every = [
      ...templates.SURVEY_TEMPLATES.flatMap((stage) => [templates.templateItems(stage, "fellowship", null), templates.templateItems(stage, "incubator", "alignment")]),
      eventTemplate.eventTemplateItems(),
      ciTemplate.checkInItems({ parts: [{ id: "part_a", title: "Compute as a lever" }, { id: "part_b", title: "Races" }], hasReading: true }),
    ];
    let bars = 0;
    for (const items of every) {
      const answers = answersTo(items, 12);
      const drawn = new Set();
      for (const question of items.filter((item) => item.kind === "question")) {
        const [result] = results.surveyResults([question], answers);
        const model = chart.buildChart(surveyInput(items, answers), { question: question.id, show: "counts", split: "none" });
        if (!result || result.kind === "comments") {
          assert.ok(!model.questions.some((each) => each.value === question.id), `${question.id}, which draws no bars, is offered`);
          continue;
        }
        drawn.add(question.id);
        assert.equal(model.chosen.question, question.id);
        const expected = charts.chartGroupsOf(result);
        assert.deepEqual(
          model.panels[0].blocks.map((block) => [block.heading, block.of, block.bars.map((bar) => [bar.label, bar.count, bar.value])]),
          expected.map((group) => [group.heading, group.of, group.bars.map((bar) => [bar.label, bar.count, bar.count])]),
          `${question.id}: counts`,
        );
        const shares = chart.buildChart(surveyInput(items, answers), { question: question.id, show: "shares", split: "none" });
        assert.deepEqual(
          shares.panels[0].blocks.flatMap((block) => block.bars.map((bar) => [bar.label, bar.value, bar.figure])),
          expected.flatMap((group) => group.bars.map((bar) => [bar.label, bar.percent, `${bar.percent}%`])),
          `${question.id}: shares`,
        );
        bars += expected.reduce((sum, group) => sum + group.bars.length, 0);
        const average = chart.buildChart(surveyInput(items, answers), { question: question.id, show: "average", split: "none" });
        const means =
          result.kind === "scale"
            ? result.rows.map((row) => row.mean)
            : result.kind === "value"
              ? [result.mean]
              : result.kind === "options" && result.scored
                ? [result.scored.mean]
                : [];
        if (means.length === 0) {
          assert.ok(!average.shows.some((each) => each.value === "average"), `${question.id} is offered an average it has not got`);
          assert.equal(average.chosen.show, "counts");
        } else {
          assert.equal(average.chosen.show, "average", question.id);
          assert.deepEqual(average.panels[0].blocks[0].bars.map((bar) => bar.value), means, `${question.id}: averages`);
        }
      }
      assert.deepEqual(model0(items, answers).questions.map((each) => each.value), [...drawn], "the questions are offered in their survey's order");
    }
    assert.ok(bars > 200, `only ${bars} bars were checked`);
  });

  test("a survey's question is offered by its number, as its Results list it; a check-in's by its words", () => {
    const items = templates.templateItems("before", "fellowship", null);
    const model = chart.buildChart(surveyInput(items, answersTo(items, 3)), { question: "q_c1", show: null, split: null });
    const numbers = results.surveyResults(items, []).filter((result) => result.kind !== "comments");
    assert.deepEqual(model.questions.map((each) => each.label), numbers.map((result) => `${result.number}. ${result.title}`));
    const checkIns = chart.buildChart(twoWeeks(), { question: null, show: null, split: null });
    assert.deepEqual(checkIns.questions.map((each) => each.label), [
      "How useful was today’s session?",
      "Was anything unclear?",
      "How much of this week’s reading did you do before the session?",
      "How confident do you feel about this week’s topic now?",
    ]);
  });

  test("split by group: a chart a group, in the order handed in, every one on the scale of the largest", () => {
    const items = templates.templateItems("before", "fellowship", null);
    const input = {
      sets: [
        { items, group: "g-c", week: null, answers: answersTo(items, 2) },
        { items, group: "g-b", week: null, answers: answersTo(items, 5, 2) },
      ],
      groups: [{ id: "g-b", name: "Group B" }, { id: "g-c", name: "Group C" }, { id: "g-empty", name: "Group E" }],
      weeks: null,
      who: "Everyone who answered",
    };
    const counts = chart.buildChart(input, { question: "q_c1", show: "counts", split: "group" });
    assert.deepEqual(counts.panels.map((panel) => [panel.title, panel.answers]), [["Group B", 5], ["Group C", 2], ["Group E", 0]]);
    const largest = Math.max(...counts.panels.flatMap((panel) => panel.blocks.flatMap((block) => block.bars.map((bar) => bar.count))));
    assert.equal(counts.scale.high, largest);
    for (const panel of counts.panels) {
      for (const bar of panel.blocks.flatMap((block) => block.bars)) assert.equal(bar.size, bar.count / largest, `${panel.title} ${bar.label}`);
    }
    assert.equal(counts.scale.words, `Same scale in every chart: 0 to ${largest} ${largest === 1 ? "answer" : "answers"}`);
    assert.equal(counts.heading, "Counts, by group");
    const shares = chart.buildChart(input, { question: "q_c1", show: "shares", split: "group" });
    assert.deepEqual([shares.scale.low, shares.scale.high, shares.scale.words], [0, 100, "Same scale in every chart: 0 to 100%"]);
    // Together, the same answers make one chart, and its counts are the groups' added up.
    const together = chart.buildChart(input, { question: "q_c1", show: "counts", split: "none" });
    assert.deepEqual(together.panels.map((panel) => panel.title), ["Everyone who answered"]);
    assert.deepEqual(
      together.panels[0].blocks[0].bars.map((bar) => bar.count),
      counts.panels[0].blocks[0].bars.map((bar, at) => bar.count + counts.panels[1].blocks[0].bars[at].count),
    );
    // No groups handed in: no split offered, whatever is asked.
    const plain = chart.buildChart(surveyInput(items, answersTo(items, 3)), { question: "q_c1", show: "counts", split: "group" });
    assert.deepEqual(plain.splits.map((each) => each.value), ["none"]);
    assert.equal(plain.chosen.split, "none");
  });

  test("an average sits on its question's own scale: a choice's points 0 to 5, a rating's 1 to 5, a share's 0 to 100%", () => {
    const items = templates.templateItems("before", "fellowship", null);
    const answers = answersTo(items, 6);
    const stage = chart.buildChart(surveyInput(items, answers), { question: "q_c1", show: "average", split: "none" });
    assert.deepEqual([stage.scale.low, stage.scale.high, stage.scale.words], [0, 5, "On a 0 to 5 scale"]);
    const [bar] = stage.panels[0].blocks[0].bars;
    assert.equal(bar.label, MAKE_CHART_WORDS.average);
    assert.equal(bar.size, bar.value / 5);
    const likely = chart.buildChart(surveyInput(items, answers), { question: "q_c2", show: "average", split: "none" });
    assert.deepEqual([likely.scale.low, likely.scale.high, likely.scale.words], [0, 100, "On a scale of 0 to 100%"]);
    assert.match(likely.panels[0].blocks[0].bars[0].figure, /^\d+(\.\d)?%$/);
    const week = chart.buildChart(twoWeeks(), { question: "q_ci_useful", show: "average", split: "group" });
    assert.deepEqual([week.scale.low, week.scale.high], [1, 5]);
    assert.equal(week.scale.words, "Same 1 to 5 scale in every chart · a dot is a week with no answers");
  });

  test("check-ins: the average by week, a chart a group, a dot for a week with no answers, and each week the lead's own count of it", () => {
    const input = twoWeeks();
    const model = chart.buildChart(input, { question: null, show: null, split: null });
    // Unasked: how useful, on average, by week, by group.
    assert.deepEqual(model.chosen, { question: "q_ci_useful", show: "average", split: "group" });
    assert.equal(model.layout, "columns");
    assert.equal(model.heading, "Average by week, by group");
    assert.deepEqual(
      model.panels.map((panel) => [panel.title, panel.answers, panel.blocks[0].bars.map((bar) => [bar.label, bar.figure, bar.count])]),
      [
        ["Group B", 5, [["Week 1", "4.0", 3], ["Week 2", "4.5", 2], ["Week 3", "", 0]]],
        ["Group C", 3, [["Week 1", "2.0", 1], ["Week 2", "3.5", 2], ["Week 3", "", 0]]],
      ],
    );
    // Everybody together, a week at a time: the programme's lead's count of the same check-ins.
    const together = chart.buildChart(input, { question: "q_ci_useful", show: "average", split: "none" });
    for (const week of [1, 2]) {
      const lead = ciModel.leadWeekOf(week, true, input.sets.filter((set) => set.week === week).map((set) => ({ ...set, of: set.answers.length })));
      const bar = together.panels[0].blocks[0].bars.find((each) => each.week === week);
      assert.equal(lead.state, "shown");
      assert.equal(bar.value, lead.totals.useful, `week ${week}`);
      assert.equal(bar.count, lead.answered, `week ${week}`);
      const confident = chart.buildChart(input, { question: "q_ci_confident", show: "average", split: "none" }).panels[0].blocks[0].bars.find((each) => each.week === week);
      assert.equal(confident.value, lead.totals.confident, `week ${week}: confidence`);
    }
    assert.equal(together.scale.words, "On a 1 to 5 scale · a dot is a week with no answers");
  });

  test("check-ins: counts and shares by week, a week's question put together from every group's copy, its fixed answers last", () => {
    const input = twoWeeks();
    const unclear = chart.buildChart(input, { question: "q_ci_unclear", show: "counts", split: "group" });
    assert.equal(unclear.layout, "bars");
    assert.equal(unclear.heading, "Counts by week, by group");
    // Week 3 has no check-in, so no run of bars; every chart has the same bars each week.
    const shape = (panel) => panel.blocks.map((block) => [block.heading, block.of, block.bars.map((bar) => `${bar.label} ${bar.count}`)]);
    assert.deepEqual(shape(unclear.panels[0]), [
      ["Week 1", 3, ["Defining AGI 2", "Timelines 1", "Something else 0", "Nothing was unclear 1"]],
      ["Week 2", 2, ["Compute as a lever 1", "Export controls 0", "Something else 0", "Nothing was unclear 1"]],
    ]);
    assert.deepEqual(shape(unclear.panels[1]), [
      ["Week 1", 1, ["Defining AGI 0", "Timelines 1", "Something else 0", "Nothing was unclear 0"]],
      ["Week 2", 2, ["Compute as a lever 0", "Export controls 2", "Something else 1", "Nothing was unclear 0"]],
    ]);
    // A part's count is the lead's count of it for the week (which never lists "Nothing was unclear").
    const together = chart.buildChart(input, { question: "q_ci_unclear", show: "counts", split: "none" });
    for (const week of [1, 2]) {
      const tally = ciModel.tallyOf(input.sets.filter((set) => set.week === week));
      const block = together.panels[0].blocks.find((each) => each.week === week);
      for (const part of tally.unclear) assert.equal(block.bars.find((bar) => bar.label === part.label).count, part.count, `week ${week}: ${part.label}`);
    }
    // Reading was asked in week 2 alone: one run of bars, and no average to offer.
    const reading = chart.buildChart(input, { question: "q_ci_reading", show: "average", split: "none" });
    assert.deepEqual(reading.shows.map((each) => each.value), ["counts", "shares"]);
    assert.equal(reading.chosen.show, "counts");
    assert.deepEqual(reading.panels[0].blocks.map((block) => [block.heading, block.bars.map((bar) => bar.count)]), [["Week 2", [1, 1, 1, 1]]]);
    assert.deepEqual(reading.shows.map((each) => each.label), ["Counts, by week", "Shares, by week"]);
    const shares = chart.buildChart(input, { question: "q_ci_unclear", show: "shares", split: "none" });
    assert.deepEqual(
      shares.panels[0].blocks[0].bars.map((bar) => bar.figure),
      ["50%", "50%", "0%", "25%"],
      "a share is of the week's answers to the question, as Results give it",
    );
  });

  test("what is asked is read against what is offered: anything unknown reads as nothing asked", () => {
    assert.deepEqual(chart.readChartAsk({ question: "q_c1", show: "average", split: "group" }), { question: "q_c1", show: "average", split: "group" });
    assert.deepEqual(chart.readChartAsk({ question: "q c1", show: "mean", split: "week" }), { question: null, show: null, split: null });
    assert.deepEqual(chart.readChartAsk({ question: ["q_c1"], show: 1, split: undefined }), { question: null, show: null, split: null });
    const items = templates.templateItems("before", "fellowship", null);
    // A question the survey has not got opens on its first; a comments question has no chart.
    const first = chart.buildChart(surveyInput(items, []), { question: "q_nope", show: null, split: null });
    assert.equal(first.chosen.question, first.questions[0].value);
    assert.equal(chart.buildChart(surveyInput(items, []), { question: "q_p6", show: null, split: null }).chosen.question, first.questions[0].value);
    // A survey of comments alone draws nothing.
    const words = items.filter((item) => item.kind === "question" && item.type === "longText");
    const none = chart.buildChart(surveyInput(words, answersTo(words, 3)), { question: null, show: null, split: null });
    assert.deepEqual([none.chosen, none.questions, none.panels], [null, [], []]);
  });

  test("the file of numbers says what the chart says, and names nobody", () => {
    const input = twoWeeks();
    input.groups[1] = { id: "g-c", name: "=HYPERLINK(\"https://example.com\")" };
    const model = chart.buildChart(input, { question: "q_ci_useful", show: "average", split: "group" });
    const rows = rowsOf(chart.chartNumbersCsv(model, { name: "AGI Strategy check-ins", who: "Everyone who answered" }));
    assert.deepEqual(rows[0], ["Survey", "Question", "Showing", "Who", "Answers counted"]);
    assert.deepEqual(rows[1], ["AGI Strategy check-ins", "How useful was today’s session?", "Average by week, by group", "Everyone who answered", "8"]);
    assert.deepEqual(rows[2], ["Group", "Week", "Average", "From answers"]);
    assert.deepEqual(rows.slice(3, 6), [["Group B", "Week 1", "4.0", "3"], ["Group B", "Week 2", "4.5", "2"], ["Group B", "Week 3", "", "0"]]);
    // A cell that would start a formula is defused, as every file the site makes is.
    assert.equal(rows[6][0], "\t=HYPERLINK(\"https://example.com\")");
    const counts = chart.chartNumbersCsv(chart.buildChart(twoWeeks(), { question: "q_ci_unclear", show: "shares", split: "none" }), { name: "AGI Strategy check-ins", who: "Everyone who answered" });
    const table = rowsOf(counts).slice(2);
    assert.deepEqual(table[0], ["Week", "Answer", "Count", "Of", "Share"]);
    assert.deepEqual(table[1], ["Week 1", "Defining AGI", "2", "4", "50%"]);
    // The answers' own words never reach it: no comment, and nobody.
    assert.doesNotMatch(counts, /The discussion/);
    const survey = templates.templateItems("before", "fellowship", null);
    const lined = chart.chartNumbersCsv(chart.buildChart(surveyInput(survey, answersTo(survey, 4)), { question: "q_c1", show: "counts", split: "none" }), { name: "AGI Strategy: before", who: "Everyone who answered" });
    assert.deepEqual(rowsOf(lined)[2], ["Answer", "Count", "Of", "Share"]);
  });
});

/** The model as unasked for: the questions it offers. */
function model0(items, answers) {
  return chart.buildChart(surveyInput(items, answers), { question: null, show: null, split: null });
}

// ---------------------------------------------------------------------------
// 2. A survey's tab
// ---------------------------------------------------------------------------

const repo = await w.loadTs(join("lib", "surveys", "repo.ts"));

/** The before survey sent to the four holding a place; Amara (Group B), Bea (Group A) and Dev (in no group: Publish has not told him) answer; Tariq does not. */
async function answered(t) {
  clock(t);
  w.reset(surveySeed());
  const id = (await w.make()).body.survey.id;
  assert.equal((await w.sendFirst(id)).status, 200);
  t.mock.timers.setTime(ANSWERED.getTime());
  for (const [uid, stage] of [["amara", "o_stage1"], ["bea", "o_stage3"], ["dev", "o_stage3"]]) {
    assert.equal((await w.answerByLink(w.tokenOf(id, uid), { q_c1: { type: "choice", optionId: stage } })).status, 200);
  }
  return id;
}

/** The survey's Make a chart tab as `who` sees it, with `query` in its address. */
const tabAs = (who, id, query = {}) => w.page(surveyPage, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve(query) }, who);

/** The chart the tab draws for `query`, built by the page's own reads. */
async function modelOf(id, query) {
  const survey = await repo.readSurvey(w.world.db, id);
  const loaded = await chartLoad.surveyChart(w.world.db, survey, { who: query.who, as: query.as });
  return { loaded, model: chart.buildChart(loaded.input, chart.readChartAsk(query)) };
}

describe("2. a survey's Make a chart tab", () => {
  test("an admin's tab beside Results: the choices and the chart, drawn without reading a name or writing anything", async (t) => {
    const id = await answered(t);
    const before = w.everything();
    const { result: page, asked } = await readsDuring(() => tabAs("zach", id, { question: "q_c1" }));
    assert.equal(page.to, null);
    assert.ok(!asked.includes("users"), `drawing the chart read a name: ${asked.join(", ")}`);
    assert.ok(!asked.includes("recordOpenings") && !asked.includes("dataExports"), asked.join(", "));
    assert.equal(w.everything(), before, "drawing the chart wrote something");
    assert.ok(page.text.includes("Results Make a chart Answers 3 Questions Send"), page.text.slice(0, 600));
    assert.ok(page.text.includes(`${MAKE_CHART_WORDS.title} Question`), page.text);
    for (const label of ["Question", "Show", "Split by", "Who"]) assert.ok(page.html.includes(`>${label}</span>`), label);
    assert.ok(page.text.includes("Counts Which best describes you right now?"), page.text);
    assert.ok(page.text.includes("Thought about it, not a serious option 1"), page.text);
    assert.ok(page.text.includes("My leading plan, no concrete steps yet 2"), page.text);
    assert.ok(page.text.includes(MAKE_CHART_WORDS.downloadChart) && page.text.includes(MAKE_CHART_WORDS.downloadNumbers));
    assert.ok(page.text.includes(MAKE_CHART_WORDS.downloadsNote));
    assert.ok(page.html.includes(`href="/api/surveys/${id}/chart?question=q_c1&amp;show=counts&amp;split=none"`), "the numbers' link is not the chart on the screen");
    assert.doesNotMatch(page.text, /Amara|Bea|Dev|Tariq|example\.com/);
    // The Results tab gained a neighbour and lost nothing.
    const results = await w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok(results.text.includes("Results Make a chart Answers 3 Questions Send"), results.text.slice(0, 600));
  });

  test("a chart a group: the Who filter's own groups, in the run's one order, each counting what Who counts for it", async (t) => {
    const id = await answered(t);
    const page = await tabAs("zach", id, { question: "q_c1", split: "group" });
    assert.ok(page.text.includes("Counts, by group"), page.text);
    // Group B meets on Tuesdays and Group A on Thursdays; Dev's place has not been told, so Dev's answer is in no group.
    const titles = [...page.html.matchAll(/<h3 id="chart-\d+" class="panelTitle">([^<]+)<\/h3>/g)].map((match) => match[1]);
    assert.deepEqual(titles, ["Group B", "Group A", "In no group"]);
    assert.ok(page.text.includes("Same scale in every chart: 0 to 1 answer"), page.text);
    const { model, loaded } = await modelOf(id, { question: "q_c1", split: "group" });
    assert.deepEqual(loaded.who.choices.map((choice) => choice.label), ["Everyone who answered (3)", "Group B (1)", "Group A (1)", "In no group (1)"]);
    // Each group's chart is the Results' file of the question under Who for that group: one count.
    for (const [at, group] of [[0, B], [1, A], [2, "none"]]) {
      const file = await fileAs(totalsRoute, "zach", { surveyId: id }, `question=q_c1&who=${group}`);
      assert.equal(file.status, 200);
      const counts = rowsOf(file.text).slice(3).map((row) => [row[0], Number(row[1])]);
      assert.deepEqual(model.panels[at].blocks[0].bars.map((bar) => [bar.label, bar.count]), counts, `${group}: the chart and the Results disagree`);
    }
    // Who narrows to one group, its chart named by it.
    const one = await tabAs("zach", id, { question: "q_c1", who: B });
    assert.ok(one.html.includes('<h3 id="chart-0" class="panelTitle">Group B</h3>'), one.text);
    assert.ok(one.text.includes("Group B 1 answer"), one.text);
  });

  test("the file of numbers: an admin's alone, refused before anything is read, the chart on the screen, and never a recorded download", async (t) => {
    const id = await answered(t);
    const query = "question=q_c1&show=shares&split=group";
    for (const [who, what] of [...NOT_ADMINS, [null, "somebody signed out"]]) {
      const before = w.everything();
      const { result, asked } = await readsDuring(() => fileAs(surveyRoute, who, { surveyId: id }, query));
      assert.deepEqual([result.status, result.body?.error], who ? [403, REFUSAL.adminOnly] : [401, REFUSAL.notSignedIn], what);
      assert.deepEqual(asked, [], `${what} was refused after the database was read`);
      assert.equal(w.everything(), before);
    }
    // A view-as session is the member's account, so it is refused like the member.
    assert.equal((await fileAs(surveyRoute, "amara", { surveyId: id }, query, { viewAs: true })).status, 403);

    const before = w.everything();
    const file = await fileAs(surveyRoute, "zach", { surveyId: id }, query);
    assert.equal(file.status, 200);
    assert.equal(file.headers["content-type"], "text/csv; charset=utf-8");
    assert.equal(file.headers["content-disposition"], 'attachment; filename="agi-strategy-before-chart-2026-10-29.csv"');
    assert.equal(file.headers["cache-control"], "no-store");
    assert.equal(w.everything(), before, "the file wrote something: a chart's numbers are not a recorded download");
    const { model, loaded } = await modelOf(id, { question: "q_c1", show: "shares", split: "group" });
    assert.equal(file.text, chart.chartNumbersCsv(model, { name: "AGI Strategy: before", who: loaded.input.who }), "the file is not the chart the page draws");
    assert.deepEqual(rowsOf(file.text)[2], ["Group", "Answer", "Count", "Of", "Share"]);
    assert.doesNotMatch(file.text, /Amara|Bea|Dev|amara|bea|dev|example\.com/);

    // What the route refuses, each in a sentence.
    const short = (response) => [response.status, response.body?.error ?? null];
    assert.deepEqual(short(await fileAs(surveyRoute, "zach", { surveyId: id }, "show=counts")), [400, REFUSAL.body]);
    assert.deepEqual(short(await fileAs(surveyRoute, "zach", { surveyId: "no such survey" }, "question=q_c1")), [400, REFUSAL.body]);
    assert.deepEqual(short(await fileAs(surveyRoute, "zach", { surveyId: "s-gone" }, "question=q_c1")), [404, REFUSAL.noSurvey]);
    // A question that is not on the survey, or draws no chart (comments), is not one the file is of.
    assert.deepEqual(short(await fileAs(surveyRoute, "zach", { surveyId: id }, "question=q_nope")), [404, CHART_WORDS.noQuestion]);
    assert.deepEqual(short(await fileAs(surveyRoute, "zach", { surveyId: id }, "question=q_p6")), [404, CHART_WORDS.noQuestion]);
  });

  test("a survey with no answers says so, and offers its questions", async (t) => {
    clock(t);
    w.reset(surveySeed());
    const id = (await w.make()).body.survey.id;
    const page = await tabAs("zach", id, {});
    assert.ok(page.text.includes(MAKE_CHART_WORDS.noAnswers), page.text);
    assert.ok(!page.text.includes(MAKE_CHART_WORDS.downloadNumbers), "a chart of nothing offers its numbers");
    assert.ok(page.html.includes('<option value="q_c1">'), "the questions are not offered");
  });
});

// ---------------------------------------------------------------------------
// 3. A programme's check-ins
// ---------------------------------------------------------------------------

/** Two more of AGI Strategy's groups: Group D on Fridays and Group E on Mondays, neither with a check-in. */
const D = "agi-autumn-2026-friday__grp00004";
const E = "agi-autumn-2026-mondays__grp00005";

/** A check-in as the open route leaves one, closed. */
function checkInDoc(id, groupId, groupName, weekNumber, startsAt, items, reached) {
  const starts = new Date(startsAt);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return {
    kind: "checkIn",
    privacy: "confidential",
    name: `AGI Strategy: check-in, ${groupName}, week ${weekNumber}`,
    title: `How was week ${weekNumber}?`,
    intro: "",
    items,
    minutes: 2,
    audience: { kind: "checkIn", roundId: ROUND, programmeId: AGI, groupId, sessionKey: `w0${weekNumber}`, weekNumber },
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    runId: RUN.agi,
    pairOf: null,
    strand: null,
    checkIn: { groupName, startsAt: starts, endsAt: ends },
    closesAt: new Date(ends.getTime() + 3 * 60 * 60 * 1000),
    closedAt: null,
    namesOffOn: "2028-12-09",
    namesOffAt: null,
    firstSentAt: starts,
    presses: [{ id: "p1", kind: "first", at: starts, count: reached, byUid: "rahul" }],
    reached: 0,
    tests: {},
    testToken: null,
    createdByUid: "rahul",
    createdAt: starts,
    updatedAt: starts,
  };
}

/** AGI Strategy's check-ins of weeks 1 and 2: Groups B and C both weeks, Group A week 1. Ten answers. */
function checkInsSeed() {
  const week1 = ciTemplate.checkInItems({ parts: [{ id: "pt-define", title: "Defining AGI" }], hasReading: false });
  const week2 = ciTemplate.checkInItems({ parts: [{ id: "pt-compute", title: "Compute as a lever" }], hasReading: true });
  const seed = surveySeed({
    [`courseGroups/${D}`]: { ...w.world.db.read(`courseGroups/${A}`), name: "Group D", session: { weekday: 5, startTimeLocal: "18:00", durationMinutes: 120, location: "Room B8", meetingUrl: null, notes: "" } },
    [`courseGroups/${E}`]: { ...w.world.db.read(`courseGroups/${A}`), name: "Group E", session: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 120, location: "Room B8", meetingUrl: null, notes: "" } },
  });
  const checkIns = [
    ["ci-b-w1", B, "Group B", 1, "2026-11-03T18:00:00Z", week1, [4, 5, 3]],
    ["ci-b-w2", B, "Group B", 2, "2026-11-10T18:00:00Z", week2, [5, 4]],
    ["ci-c-w1", C, "Group C", 1, "2026-11-04T13:00:00Z", week1, [2]],
    ["ci-c-w2", C, "Group C", 2, "2026-11-11T13:00:00Z", week2, [3, 4]],
    ["ci-a-w1", A, "Group A", 1, "2026-10-29T18:00:00Z", week1, [4, 4]],
  ];
  for (const [id, groupId, groupName, weekNumber, startsAt, items, useful] of checkIns) {
    seed[`surveys/${id}`] = checkInDoc(id, groupId, groupName, weekNumber, startsAt, items, useful.length + 1);
    useful.forEach((value, at) => {
      seed[`surveyAnswers/${id}-${at}`] = {
        surveyId: id,
        roundId: "",
        respondent: { kind: "account", uid: `person-${id}-${at}` },
        answers: checkInAnswer({ useful: value, reading: weekNumber === 2 ? "most" : null }).answers,
        sentAt: new Date(new Date(startsAt).getTime() + 100 * 60 * 1000),
        via: "link",
        afterFirstSession: true,
      };
    });
  }
  return seed;
}

/** The programme's check-ins' chart as `who` sees it, with `query` in its address. */
const checkInsAs = (who, query = {}, params = { roundId: ROUND, programmeId: AGI }) =>
  w.page(checkInsPage, { params: Promise.resolve(params), searchParams: Promise.resolve(query) }, who);

describe("3. a programme's check-ins", () => {
  test("opens on how useful the sessions were, on average, by week, by group: four groups showing and the rest on a press", async (t) => {
    clock(t, LATER);
    w.reset(surveySeed());
    w.reset(checkInsSeed());
    const before = w.everything();
    const { result: page, asked } = await readsDuring(() => checkInsAs("zach"));
    assert.ok(!asked.includes("users"), `drawing the chart read a name: ${asked.join(", ")}`);
    assert.equal(w.everything(), before, "drawing the chart wrote something");
    assert.ok(page.text.startsWith(`${MAKE_CHART_WORDS.crumb} AGI Strategy check-ins ${MAKE_CHART_WORDS.everySession} Fellowship: AGI Strategy Weeks 1 to 2 · 10 answers`), page.text.slice(0, 300));
    assert.ok(page.text.includes("Average by week, by group Same 1 to 5 scale in every chart · a dot is a week with no answers How useful was today’s session?"), page.text);
    // The run's five groups in the one order: Monday first.
    const titles = [...page.html.matchAll(/<h3 id="chart-\d+" class="panelTitle">([^<]+)<\/h3>/g)].map((match) => match[1]);
    assert.deepEqual(titles, ["Group E", "Group B", "Group C", "Group A", "Group D"]);
    assert.ok(page.text.includes("Showing 4 of 5 groups. Show all 5 groups"), page.text);
    assert.ok(page.html.indexOf("<details") < page.html.indexOf(">Group D</h3>"), "the fifth group is not behind the press");
    // Each week's figure, with a dot for a week with no answers.
    assert.ok(page.text.includes("Group B 5 answers Week 1: 4.0, from 3 answers 4.0 W1 Week 2: 4.5, from 2 answers 4.5 W2 Week 3: no answers · W3"), page.text);
    assert.ok(page.text.includes("Group C 3 answers Week 1: 2.0, from 1 answer 2.0 W1 Week 2: 3.5, from 2 answers 3.5 W2"), page.text);
    assert.ok(page.text.includes("Group E 0 answers Week 1: no answers · W1"), page.text);
    for (const week of [1, 2, 3, 4, 5, 6]) assert.ok(page.html.includes(`>W${week}</span>`), `week ${week} is not drawn`);
    assert.ok(page.html.includes(`href="/api/surveys/check-ins/${ROUND}/${AGI}/chart?question=q_ci_useful&amp;show=average&amp;split=group"`), "the numbers' link is not the chart on the screen");
    // The columns are the accent, sized on the one scale.
    assert.ok(page.html.includes('class="columnFill" style="height:90%"'), "Group B's week 2 (4.5 of 5) is not nine tenths of the way up");
  });

  test("Who narrows to one group; counts and shares are by week; the file is the chart", async (t) => {
    clock(t, LATER);
    w.reset(checkInsSeed());
    const one = await checkInsAs("zach", { who: C });
    assert.ok(one.html.includes('<h3 id="chart-0" class="panelTitle">Group C</h3>'), one.text);
    assert.ok(!one.html.includes("chart-1"), "a chart for another group was drawn");
    assert.ok(one.html.includes(`<option value="${C}" selected="">Group C (3)</option>`), "the Who menu does not hold the group chosen");
    assert.ok(one.text.includes("Average by week On a 1 to 5 scale · a dot is a week with no answers"), one.text);
    const reading = await checkInsAs("zach", { question: "q_ci_reading", show: "shares", split: "none" });
    // One chart of shares says no scale: each bar carries its figure. Reading was asked in week 2 alone, of four people.
    assert.ok(reading.text.includes("Shares by week How much of this week’s reading did you do before the session? Everyone who answered 4 answers Week 2 None 0% Some 0% Most 100% All 0%"), reading.text);

    const query = "question=q_ci_useful&show=average&split=group";
    for (const [who, what] of [...NOT_ADMINS, [null, "somebody signed out"]]) {
      const { result, asked } = await readsDuring(() => fileAs(checkInsRoute, who, { roundId: ROUND, programmeId: AGI }, query));
      assert.deepEqual([result.status, result.body?.error], who ? [403, REFUSAL.adminOnly] : [401, REFUSAL.notSignedIn], what);
      assert.deepEqual(asked, [], `${what} was refused after the database was read`);
    }
    const before = w.everything();
    const file = await fileAs(checkInsRoute, "zach", { roundId: ROUND, programmeId: AGI }, query);
    assert.equal(file.status, 200);
    assert.equal(file.headers["content-disposition"], 'attachment; filename="agi-strategy-check-ins-chart-2026-11-25.csv"');
    assert.equal(file.headers["cache-control"], "no-store");
    assert.equal(w.everything(), before);
    const applications = await w.loadTs(join("lib", "applications", "repo.ts"));
    const loaded = await chartLoad.checkInsChart(w.world.db, { roundId: ROUND, programmeId: AGI, form: await applications.loadForm(w.world.db, ROUND) }, {});
    const model = chart.buildChart(loaded.input, chart.readChartAsk({ question: "q_ci_useful", show: "average", split: "group" }));
    assert.equal(file.text, chart.chartNumbersCsv(model, { name: "AGI Strategy check-ins", who: "Everyone who answered" }));
    assert.deepEqual(rowsOf(file.text).slice(3, 6), [["Group E", "Week 1", "", "0"], ["Group E", "Week 2", "", "0"], ["Group E", "Week 3", "", "0"]]);
    assert.doesNotMatch(file.text, /person-|rahul|The discussion/);
    const short = (response) => [response.status, response.body?.error ?? null];
    assert.deepEqual(short(await fileAs(checkInsRoute, "zach", { roundId: ROUND, programmeId: AGI }, "show=average")), [400, REFUSAL.body]);
    assert.deepEqual(short(await fileAs(checkInsRoute, "zach", { roundId: ROUND, programmeId: "nope" }, query)), [404, MAKE_CHART_WORDS.checkInsMissing]);
    assert.deepEqual(short(await fileAs(checkInsRoute, "zach", { roundId: ROUND, programmeId: AGI }, "question=q_ci_most")), [404, CHART_WORDS.noQuestion]);
  });

  test("an address with no check-ins is answered in a sentence; a check-in's own tab leads to its programme's", async (t) => {
    clock(t, LATER);
    w.reset(checkInsSeed());
    const none = await checkInsAs("zach", {}, { roundId: ROUND, programmeId: "nope" });
    assert.ok(none.text.includes(`${MAKE_CHART_WORDS.checkInsMissingTitle} ${MAKE_CHART_WORDS.checkInsMissing}`), none.text);
    const own = await tabAs("zach", "ci-b-w1", {});
    assert.ok(own.html.includes(`href="/admin/surveys/check-ins/${ROUND}/${AGI}/chart"`), own.html);
    assert.ok(own.text.includes(MAKE_CHART_WORDS.everyCheckIn));
    // One group's one session: no Who and no split.
    assert.ok(!own.html.includes(">Split by</span>") && !own.html.includes(">Who</span>"), own.text);
    assert.ok(own.text.includes("Counts How useful was today’s session?"), own.text);
  });

  test("Run NAISI › Surveys: a programme's weekly check-ins lead to the chart once there is one", async (t) => {
    clock(t, LATER);
    w.reset(checkInsSeed());
    const hub = await w.page(w.pages.list, { searchParams: Promise.resolve({}) }, "zach");
    const link = `<a href="/admin/surveys/check-ins/${ROUND}/${AGI}/chart" class="checkInLink" aria-label="Make a chart across the weekly check-ins of Fellowship: AGI Strategy">Make a chart</a>`;
    assert.ok(hub.html.includes(link), hub.html);
    assert.equal(hub.html.split("/chart\"").length - 1, 1, "a programme with no check-in leads to a chart");
  });
});

// ---------------------------------------------------------------------------
// 4. A survey after an event
// ---------------------------------------------------------------------------

describe("4. a survey after an event: Who is members or guests, and nothing splits", async () => {
  const e = await makeEventSurveyWorld("__surveysChartEvents");
  const eventItems = await e.load("lib/surveys/items.ts");
  const press = async (path, who, id, body = {}) => e.call(who, (await e.route(`surveys/[surveyId]/${path}`)).POST, { surveyId: id }, { body });

  test("Who offers members and guests; guests counts the guest's answer alone", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: LATE });
    e.reset();
    const id = (await e.make()).body.survey.id;
    await press("open-at-event", "zach", id);
    const kofi = withEveryRequired(eventItems, e.survey(id).items, { q_ev_again: { type: "choice", optionId: "o_ev_yes" } });
    assert.equal((await press("answer", "kofi", id, { answers: kofi })).status, 200);
    t.mock.timers.setTime(NEXT_DAY.getTime());
    await press("test", "zach", id, { email: "survey" });
    e.world.mail.length = 0;
    assert.equal((await press("send", "zach", id, { to: "everyone", emails: 4 })).status, 200);
    const link = e.linkIn(e.world.mail.find((message) => message.to === "gwen@example.com"));
    const gwen = withEveryRequired(eventItems, e.survey(id).items, { q_ev_again: { type: "choice", optionId: "o_ev_no" } });
    assert.equal((await e.call(null, (await e.route("surveys/answer")).POST, {}, { body: { token: link.slice(link.lastIndexOf("/") + 1), answers: gwen } })).status, 200);

    const path = "app/(app)/admin/(admin-only)/surveys/[surveyId]/chart/page.tsx";
    const everyone = await e.page(path, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({ question: "q_ev_again" }) }, "zach");
    assert.ok(everyone.html.includes('<select name="as"'), "Who does not write the Results' own key");
    for (const label of ["Members and guests", "Members", "Guests"]) assert.ok(everyone.html.includes(`>${label}</option>`), label);
    assert.ok(!everyone.html.includes(">Split by</span>"), "a survey after an event offers a split by group");
    const guests = await e.page(path, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({ question: "q_ev_again", as: "guests" }) }, "zach");
    assert.ok(guests.html.includes('<h3 id="chart-0" class="panelTitle">Guests</h3>'), guests.text);
    assert.ok(guests.text.includes("Guests 1 answer"), guests.text);
    assert.doesNotMatch(guests.text, /Gwen|Kofi/);
  });
});

// ---------------------------------------------------------------------------
// 5. The tree
// ---------------------------------------------------------------------------

describe("5. the tree: Make a chart is an admin's, and the programme's lead never reaches it", () => {
  const files = [...walkSource(SRC)].filter((file) => /\.(ts|tsx)$/.test(file));
  const importing = (pattern) => files.filter((file) => pattern.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))).map(inSrc).sort();

  test("only the two admins' pages and the two admin routes reach it from outside its own files", () => {
    const CHART = /from\s+"(?:@\/lib\/surveys\/chart(?:Load)?|@\/features\/surveys\/chart\/[\w.]+|\.{1,2}\/(?:[\w-]+\/)*chart(?:Load)?)"/;
    const own = new Set([
      "lib/surveys/chart.ts",
      "lib/surveys/chartLoad.ts",
      "features/surveys/chart/MakeAChart.tsx",
      "features/surveys/chart/ChartControls.tsx",
      "features/surveys/chart/DownloadPicture.tsx",
    ]);
    assert.deepEqual(
      importing(CHART).filter((file) => !own.has(file)),
      [
        "app/(app)/admin/(admin-only)/surveys/[surveyId]/chart/page.tsx",
        "app/(app)/admin/(admin-only)/surveys/check-ins/[roundId]/[programmeId]/chart/page.tsx",
        "app/api/surveys/[surveyId]/chart/route.ts",
        "app/api/surveys/check-ins/[roundId]/[programmeId]/chart/route.ts",
      ],
    );
    for (const route of ["app/api/surveys/[surveyId]/chart/route.ts", "app/api/surveys/check-ins/[roundId]/[programmeId]/chart/route.ts"]) {
      const code = stripSource(readFileSync(join(SRC, route), "utf8"), { keepStrings: true });
      const refused = code.indexOf("if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });");
      assert.ok(refused !== -1 && refused < code.indexOf("getAdminDb()"), `${route} reaches the database before it refuses everybody but an admin`);
      assert.doesNotMatch(code, /logExport|dataExports|recordOpening/, `${route} now records a download or an opening, though it names nobody`);
      assert.doesNotMatch(code, /export async function (POST|PUT|PATCH|DELETE)/, `${route} now writes`);
    }
  });

  test("no page or part of a programme's Surveys tab reaches a chart, a group's figures or the Results' filters", () => {
    const LEAD = [/^app\/\(app\)\/admin\/admissions\//, /^features\/surveys\/lead\//, /^features\/applications\/surveys\//];
    const lead = files.map(inSrc).filter((file) => LEAD.some((pattern) => pattern.test(file)));
    assert.ok(lead.some((file) => file.endsWith("surveys/check-ins/page.tsx")), "the walk found none of the lead's pages");
    for (const file of lead) {
      const code = stripSource(readFileSync(join(SRC, file), "utf8"), { keepStrings: true });
      assert.doesNotMatch(code, /surveys\/chart|chartLoad|resultsFilters|ResultsFilters|\/admin\/surveys\/check-ins\//, `${file} reaches Make a chart or the admins' filters`);
    }
  });
});
